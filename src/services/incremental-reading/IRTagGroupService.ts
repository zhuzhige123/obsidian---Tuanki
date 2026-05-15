/**
 * 标签组（材料类型）服务 v3.0
 *
 * 职责：
 * - 管理标签组定义的 CRUD
 * - 管理标签组参数（可学习）
 * - 文档到标签组的匹配与缓存
 * - 组参数的 shrinkage 学习
 *
 * @module services/incremental-reading/IRTagGroupService
 * @version 3.0.0
 */

import { TFile } from "obsidian";
import type { App } from "obsidian";
import { getPluginPaths, getV2PathsFromApp } from "../../config/paths";
import type {
	IRAdvancedScheduleSettings,
	IRDocumentGroupMap,
	IRDocumentGroupMapStore,
	IRTagGroup,
	IRTagGroupMatchSource,
	IRTagGroupProfile,
	IRTagGroupProfilesStore,
	IRTagGroupsStore,
} from "../../types/ir-types";
import {
	DEFAULT_ADVANCED_SCHEDULE_SETTINGS,
	DEFAULT_TAG_GROUP,
	DEFAULT_TAG_GROUP_PROFILE,
	IR_STORAGE_VERSION,
} from "../../types/ir-types";
import { logger } from "../../utils/logger";
import { DirectoryUtils } from "../../utils/directory-utils";
import { IRPointStorageService } from "./IRPointStorageService";

// ============================================
// 存储路径常量
// ============================================

const TAG_GROUPS_FILE = "tag-groups.json";
const TAG_GROUP_PROFILES_FILE = "tag-group-profiles.json";
const DOCUMENT_GROUP_MAP_FILE = "document-group-map.json";

type IRTagGroupDeckScope = {
	topicId: string;
	topicName: string;
	relativePath: string;
	absolutePath: string;
};

export function computeTagGroupPriorityBias(
	profile:
		| Pick<IRTagGroupProfile, "intervalFactorBase" | "sampleCount">
		| null
		| undefined,
	options: {
		groupId?: string | null;
		defaultIntervalFactor?: number;
		maxBias?: number;
		fullEffectSampleCount?: number;
	} = {}
): number {
	const groupId = String(options.groupId || "").trim();
	if (!profile || !groupId || groupId === DEFAULT_TAG_GROUP.id) {
		return 0;
	}

	const baseline = Math.max(
		1,
		Number(
			options.defaultIntervalFactor ??
				DEFAULT_ADVANCED_SCHEDULE_SETTINGS.defaultIntervalFactor ??
				1.5
		)
	);
	const intervalFactorBase = Number(profile.intervalFactorBase || baseline);
	const sampleCount = Math.max(0, Number(profile.sampleCount || 0));
	const maxBias = Math.max(0, Number(options.maxBias ?? 0.8));
	const fullEffectSampleCount = Math.max(1, Number(options.fullEffectSampleCount ?? 6));
	const confidence = Math.min(1, sampleCount / fullEffectSampleCount);
	const normalizedDelta = Math.max(-1, Math.min(1, (baseline - intervalFactorBase) / 0.6));
	return Math.round(normalizedDelta * maxBias * confidence * 100) / 100;
}

export function normalizeTagGroupCandidateTags(tags: string[]): string[] {
	const ordered = new Map<string, string>();
	for (const rawTag of Array.isArray(tags) ? tags : []) {
		const normalized = String(rawTag || "").trim().replace(/^#/, "").toLowerCase();
		if (!normalized || ordered.has(normalized)) continue;
		ordered.set(normalized, normalized);
	}
	return Array.from(ordered.values());
}

export function matchTagGroupByTags(
	groups: Pick<IRTagGroup, "id" | "matchAnyTags" | "matchPriority">[],
	tags: string[]
): string {
	const normalizedTags = normalizeTagGroupCandidateTags(tags);
	if (normalizedTags.length === 0) {
		return "default";
	}

	const normalizedSet = new Set(normalizedTags);
	const sortedGroups = [...groups]
		.filter((group) => group.id !== "default")
		.sort((a, b) => (a.matchPriority ?? 0) - (b.matchPriority ?? 0));

	for (const group of sortedGroups) {
		const groupTags = normalizeTagGroupCandidateTags(group.matchAnyTags || []);
		if (groupTags.some((tag) => normalizedSet.has(tag))) {
			return group.id;
		}
	}

	return "default";
}

// ============================================
// IRTagGroupService 绫?// ============================================

export class IRTagGroupService {
	private app: App;
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	private groupsCache: Record<string, IRTagGroup> = {};
	private profilesCache: Record<string, IRTagGroupProfile> = {};
	private documentMapCache: Record<string, IRDocumentGroupMap> = {};
	private groupScopeCache: Record<string, string[]> = {};
	private deckScopesCache: IRTagGroupDeckScope[] = [];
	private pointStorageService: IRPointStorageService | null = null;

	constructor(app: App) {
		this.app = app;
	}

	private getStorageDir(): string {
		return getV2PathsFromApp(this.app).ir.root;
	}

	private getPointStorageService(): IRPointStorageService {
		if (!this.pointStorageService) {
			this.pointStorageService = new IRPointStorageService(this.app);
		}
		return this.pointStorageService;
	}

	private getDocumentMapPath(): string {
		return getPluginPaths(this.app as any).cache.incrementalReading.documentGroupMap;
	}

	private getLegacyDocumentMapPath(): string {
		return `${this.getStorageDir()}/${DOCUMENT_GROUP_MAP_FILE}`;
	}

	private getLegacyGroupsPath(): string {
		return `${this.getStorageDir()}/${TAG_GROUPS_FILE}`;
	}

	private getLegacyProfilesPath(): string {
		return `${this.getStorageDir()}/${TAG_GROUP_PROFILES_FILE}`;
	}

	/**
	 * 初始化服务
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = this.doInitialize();
		try {
			await this.initPromise;
		} finally {
			this.initPromise = null;
		}
	}

	private async doInitialize(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;

			const storageDir = this.getStorageDir();

			// 确保目录存在
			if (!(await adapter.exists(storageDir))) {
				await adapter.mkdir(storageDir);
			}

			await this.loadDeckBackedCatalog();
			await this.loadDocumentMap();

			this.initialized = true;
			logger.info("[IRTagGroupService] initialized");
		} catch (error) {
			logger.error("[IRTagGroupService] initialize failed", error);
			this.initialized = true; // allow fallback behavior even when initialization fails
		}
	}

	// ============================================
	// 标签组管理
	// ============================================

	private cloneGroup(group: IRTagGroup): IRTagGroup {
		return {
			...group,
			matchAnyTags: Array.isArray(group.matchAnyTags) ? [...group.matchAnyTags] : [],
			matchSource: group.matchSource
				? {
						yamlTags: group.matchSource.yamlTags !== false,
						inlineTags: group.matchSource.inlineTags !== false,
						customProperties: Array.isArray(group.matchSource.customProperties)
							? [...group.matchSource.customProperties]
							: [],
				  }
				: undefined,
		};
	}

	private cloneProfile(profile: IRTagGroupProfile): IRTagGroupProfile {
		return {
			...profile,
			history: Array.isArray(profile.history)
				? profile.history.map((entry) => ({ ...entry }))
				: undefined,
		};
	}

	private compareIsoTimestamp(left?: string, right?: string): number {
		const leftValue = Date.parse(String(left || "")) || 0;
		const rightValue = Date.parse(String(right || "")) || 0;
		return leftValue - rightValue;
	}

	private registerGroupScope(groupId: string, topicId: string): void {
		const normalizedGroupId = String(groupId || "").trim();
		const normalizedTopicId = String(topicId || "").trim();
		if (!normalizedGroupId || !normalizedTopicId) {
			return;
		}

		const scopeSet = new Set(this.groupScopeCache[normalizedGroupId] || []);
		scopeSet.add(normalizedTopicId);
		this.groupScopeCache[normalizedGroupId] = Array.from(scopeSet).sort((a, b) =>
			a.localeCompare(b, "zh-CN")
		);
	}

	private shouldReplaceGroup(existing: IRTagGroup | undefined, incoming: IRTagGroup): boolean {
		if (!existing) {
			return true;
		}
		return this.compareIsoTimestamp(existing.updatedAt, incoming.updatedAt) <= 0;
	}

	private shouldReplaceProfile(
		existing: IRTagGroupProfile | undefined,
		incoming: IRTagGroupProfile
	): boolean {
		if (!existing) {
			return true;
		}
		const timestampCompare = this.compareIsoTimestamp(existing.updatedAt, incoming.updatedAt);
		if (timestampCompare !== 0) {
			return timestampCompare < 0;
		}
		return Number(existing.sampleCount || 0) <= Number(incoming.sampleCount || 0);
	}

	private async loadLegacyGroupsFile(): Promise<{
		exists: boolean;
		groups: Record<string, IRTagGroup>;
		error: string | null;
	}> {
		const adapter = this.app.vault.adapter;
		const filePath = this.getLegacyGroupsPath();
		try {
			if (!(await adapter.exists(filePath))) {
				return { exists: false, groups: {}, error: null };
			}

			const parsed = JSON.parse(await adapter.read(filePath)) as IRTagGroupsStore;
			const groups =
				parsed &&
				typeof parsed === "object" &&
				(parsed as any).groups &&
				typeof (parsed as any).groups === "object"
					? ((parsed as any).groups as Record<string, IRTagGroup>)
					: {};
			return {
				exists: true,
				groups: Object.fromEntries(
					Object.entries(groups).map(([groupId, group]) => [
						groupId,
						this.cloneGroup({
							...group,
							id: String(group?.id || groupId || "").trim() || groupId,
						}),
					])
				),
				error: null,
			};
		} catch (error) {
			return {
				exists: true,
				groups: {},
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private async loadLegacyProfilesFile(): Promise<{
		exists: boolean;
		profiles: Record<string, IRTagGroupProfile>;
		error: string | null;
	}> {
		const adapter = this.app.vault.adapter;
		const filePath = this.getLegacyProfilesPath();
		try {
			if (!(await adapter.exists(filePath))) {
				return { exists: false, profiles: {}, error: null };
			}

			const parsed = JSON.parse(await adapter.read(filePath)) as IRTagGroupProfilesStore;
			const profiles =
				parsed &&
				typeof parsed === "object" &&
				(parsed as any).profiles &&
				typeof (parsed as any).profiles === "object"
					? ((parsed as any).profiles as Record<string, IRTagGroupProfile>)
					: {};
			return {
				exists: true,
				profiles: Object.fromEntries(
					Object.entries(profiles).map(([groupId, profile]) => [
						groupId,
						this.cloneProfile({
							...profile,
							groupId: String(profile?.groupId || groupId || "").trim() || groupId,
						}),
					])
				),
				error: null,
			};
		} catch (error) {
			return {
				exists: true,
				profiles: {},
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private normalizeLegacyCatalog(
		groups: Record<string, IRTagGroup>,
		profiles: Record<string, IRTagGroupProfile>
	): {
		groups: Record<string, IRTagGroup>;
		profiles: Record<string, IRTagGroupProfile>;
	} {
		const mergedGroups = {
			...groups,
		};
		const mergedProfiles = {
			...profiles,
		};
		if (!mergedGroups[DEFAULT_TAG_GROUP.id]) {
			mergedGroups[DEFAULT_TAG_GROUP.id] = this.cloneGroup(DEFAULT_TAG_GROUP);
		}
		for (const groupId of Object.keys(mergedGroups)) {
			if (!mergedProfiles[groupId]) {
				mergedProfiles[groupId] = this.cloneProfile({
					...DEFAULT_TAG_GROUP_PROFILE,
					groupId,
				});
			}
		}
		return {
			groups: mergedGroups,
			profiles: mergedProfiles,
		};
	}

	/**
	 * 旧 tag-group 文件只用于数据管理中的迁移检测与显式迁移。
	 * 运行时正式读取来源始终是 .irdeck 内嵌 catalog，避免弃用文件重新变成真源。
	 */
	async inspectLegacyCatalogResidue(): Promise<{
		legacyFileCount: number;
		filePaths: string[];
		groupCount: number;
		profileCount: number;
		pointFileCount: number;
		failures: Array<{ id: string; type: string; message: string }>;
	}> {
		const groupFile = await this.loadLegacyGroupsFile();
		const profileFile = await this.loadLegacyProfilesFile();
		const pointStorage = this.getPointStorageService();
		await pointStorage.initialize();
		const catalog = await pointStorage.listPointFileCatalogEntries();
		const filePaths = [
			...(groupFile.exists ? [this.getLegacyGroupsPath()] : []),
			...(profileFile.exists ? [this.getLegacyProfilesPath()] : []),
		];
		const failures: Array<{ id: string; type: string; message: string }> = [];
		if (groupFile.error) {
			failures.push({
				id: this.getLegacyGroupsPath(),
				type: "legacy-tag-group-parse",
				message: groupFile.error,
			});
		}
		if (profileFile.error) {
			failures.push({
				id: this.getLegacyProfilesPath(),
				type: "legacy-tag-group-profile-parse",
				message: profileFile.error,
			});
		}
		return {
			legacyFileCount: filePaths.length,
			filePaths,
			groupCount: Object.keys(groupFile.groups).length,
			profileCount: Object.keys(profileFile.profiles).length,
			pointFileCount: catalog.length,
			failures,
		};
	}

	async migrateLegacyCatalogToPointFiles(
		options: { cleanupLegacyFiles?: boolean } = {}
	): Promise<{
		embeddedTopicCount: number;
		removedLegacyFileCount: number;
		remainingLegacyFiles: string[];
		failures: Array<{ id: string; type: string; message: string }>;
	}> {
		const groupFile = await this.loadLegacyGroupsFile();
		const profileFile = await this.loadLegacyProfilesFile();
		const existingFiles = [
			...(groupFile.exists ? [this.getLegacyGroupsPath()] : []),
			...(profileFile.exists ? [this.getLegacyProfilesPath()] : []),
		];
		const failures: Array<{ id: string; type: string; message: string }> = [];
		if (groupFile.error) {
			failures.push({
				id: this.getLegacyGroupsPath(),
				type: "legacy-tag-group-parse",
				message: groupFile.error,
			});
		}
		if (profileFile.error) {
			failures.push({
				id: this.getLegacyProfilesPath(),
				type: "legacy-tag-group-profile-parse",
				message: profileFile.error,
			});
		}

		if (existingFiles.length === 0) {
			return {
				embeddedTopicCount: 0,
				removedLegacyFileCount: 0,
				remainingLegacyFiles: [],
				failures,
			};
		}

		const hasLegacyCatalog =
			Object.keys(groupFile.groups).length > 0 || Object.keys(profileFile.profiles).length > 0;
		let embeddedTopicCount = 0;
		const pointStorage = this.getPointStorageService();
		await pointStorage.initialize();
		const catalog = await pointStorage.listPointFileCatalogEntries();

		if (hasLegacyCatalog) {
			if (catalog.length === 0) {
				failures.push({
					id: "legacy-tag-group-catalog",
					type: "legacy-tag-group-migration",
					message: "存在旧标签组定义，但当前没有 .irdeck 专题文件可承接，已保留旧文件",
				});
			} else {
				const normalizedCatalog = this.normalizeLegacyCatalog(
					groupFile.groups,
					profileFile.profiles
				);
				const affectedTopicIds = await pointStorage.mergeTagGroupCatalogIntoPointFiles({
					groups: normalizedCatalog.groups,
					profiles: normalizedCatalog.profiles,
				});
				embeddedTopicCount = affectedTopicIds.length;
			}
		}

		let removedLegacyFileCount = 0;
		if (options.cleanupLegacyFiles === true && failures.length === 0) {
			const adapter = this.app.vault.adapter;
			for (const filePath of existingFiles) {
				try {
					if (await adapter.exists(filePath)) {
						await adapter.remove(filePath);
						removedLegacyFileCount += 1;
					}
				} catch (error) {
					failures.push({
						id: filePath,
						type: "legacy-tag-group-cleanup",
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		const remainingLegacyFiles: string[] = [];
		for (const filePath of existingFiles) {
			if (await this.app.vault.adapter.exists(filePath)) {
				remainingLegacyFiles.push(filePath);
			}
		}

		return {
			embeddedTopicCount,
			removedLegacyFileCount,
			remainingLegacyFiles,
			failures,
		};
	}

	private async loadDeckBackedCatalog(): Promise<void> {
		this.groupsCache = {};
		this.profilesCache = {};
		this.groupScopeCache = {};
		this.deckScopesCache = [];

		const pointStorage = this.getPointStorageService();
		await pointStorage.initialize();
		const catalog = await pointStorage.listPointFileCatalogEntries();
		this.deckScopesCache = catalog.map((entry) => ({
			topicId: entry.topicId,
			topicName: entry.topicName,
			relativePath: entry.relativePath,
			absolutePath: entry.absolutePath,
		}));

		// 运行时只聚合 .irdeck 中已落盘的标签组定义。
		for (const entry of catalog) {
			for (const group of Object.values(entry.fileData.tagGroups || {})) {
				if (!group?.id) {
					continue;
				}
				this.registerGroupScope(group.id, entry.topicId);
				if (this.shouldReplaceGroup(this.groupsCache[group.id], group)) {
					this.groupsCache[group.id] = this.cloneGroup(group);
				}
			}
			for (const profile of Object.values(entry.fileData.tagGroupProfiles || {})) {
				if (!profile?.groupId) {
					continue;
				}
				this.registerGroupScope(profile.groupId, entry.topicId);
				if (this.shouldReplaceProfile(this.profilesCache[profile.groupId], profile)) {
					this.profilesCache[profile.groupId] = this.cloneProfile(profile);
				}
			}
		}

		if (!this.groupsCache[DEFAULT_TAG_GROUP.id]) {
			this.groupsCache[DEFAULT_TAG_GROUP.id] = this.cloneGroup(DEFAULT_TAG_GROUP);
		}
		if (!this.profilesCache[DEFAULT_TAG_GROUP_PROFILE.groupId]) {
			this.profilesCache[DEFAULT_TAG_GROUP_PROFILE.groupId] =
				this.cloneProfile(DEFAULT_TAG_GROUP_PROFILE);
		}
		for (const groupId of Object.keys(this.groupsCache)) {
			if (!this.profilesCache[groupId]) {
				this.profilesCache[groupId] = this.cloneProfile({
					...DEFAULT_TAG_GROUP_PROFILE,
					groupId,
				});
			}
		}
	}

	private async loadDocumentMap(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const filePath = this.getDocumentMapPath();
		const legacyFilePath = this.getLegacyDocumentMapPath();

		for (const pathToRead of [filePath, legacyFilePath]) {
			try {
				if (!(await adapter.exists(pathToRead))) {
					continue;
				}

				const content = await adapter.read(pathToRead);
				const parsed = JSON.parse(content) as IRDocumentGroupMapStore;
				const map =
					parsed &&
					typeof parsed === "object" &&
					(parsed as any).map &&
					typeof (parsed as any).map === "object"
						? (parsed as any).map
						: {};
				this.documentMapCache = map as Record<string, IRDocumentGroupMap>;
				return;
			} catch {
				// continue to the next candidate path
			}
		}

		this.documentMapCache = {};
	}

	private async saveDocumentMap(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const filePath = this.getDocumentMapPath();

		const store: IRDocumentGroupMapStore = {
			version: IR_STORAGE_VERSION,
			map: this.documentMapCache,
		};

		await DirectoryUtils.ensureDirForFile(adapter as any, filePath);
		await adapter.write(filePath, JSON.stringify(store));
	}

	async getAllGroups(): Promise<IRTagGroup[]> {
		await this.initialize();
		return Object.values(this.groupsCache).sort(
			(a, b) => (a.matchPriority ?? 0) - (b.matchPriority ?? 0)
		);
	}

	async getDeckScopes(): Promise<Array<{ topicId: string; topicName: string }>> {
		await this.initialize();
		return this.deckScopesCache.map((scope) => ({
			topicId: scope.topicId,
			topicName: scope.topicName,
		}));
	}

	async getGroupScopeTopicIds(groupId: string): Promise<string[]> {
		await this.initialize();
		return [...(this.groupScopeCache[String(groupId || "").trim()] || [])];
	}

	private resolveTargetTopicIds(groupId: string, targetTopicIds?: string[]): string[] {
		const explicit = (targetTopicIds || []).map((value) => String(value || "").trim()).filter(Boolean);
		if (explicit.length > 0) {
			return Array.from(new Set(explicit));
		}
		const scoped = this.groupScopeCache[String(groupId || "").trim()] || [];
		if (scoped.length > 0) {
			return [...scoped];
		}
		return this.deckScopesCache.map((scope) => scope.topicId);
	}

	async createGroup(
		name: string,
		matchAnyTags: string[],
		description = "",
		matchPriority = 100,
		options: { targetTopicIds?: string[] } = {}
	): Promise<IRTagGroup> {
		await this.initialize();
		const id = `group_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
		const now = new Date().toISOString();
		const group: IRTagGroup = {
			id,
			name,
			description,
			matchAnyTags: Array.isArray(matchAnyTags) ? matchAnyTags : [],
			matchPriority,
			createdAt: now,
			updatedAt: now,
		};
		const targetTopicIds = this.resolveTargetTopicIds(group.id, options.targetTopicIds);
		if (targetTopicIds.length === 0) {
			throw new Error("当前没有可写入的 .irdeck 专题文件");
		}

		const profile: IRTagGroupProfile = {
			...DEFAULT_TAG_GROUP_PROFILE,
			groupId: id,
			updatedAt: now,
		};
		await this.getPointStorageService().mergeTagGroupCatalogIntoPointFiles({
			groups: {
				[id]: group,
			},
			profiles: {
				[id]: profile,
			},
			targetTopicIds,
		});
		this.groupsCache[id] = this.cloneGroup(group);
		this.profilesCache[id] = this.cloneProfile(profile);
		this.groupScopeCache[id] = [...targetTopicIds].sort((a, b) => a.localeCompare(b, "zh-CN"));

		return group;
	}

	async saveGroup(
		group: IRTagGroup,
		options: { targetTopicIds?: string[] } = {}
	): Promise<{ affectedTopicIds: string[] }> {
		await this.initialize();
		const targetTopicIds = this.resolveTargetTopicIds(group.id, options.targetTopicIds);
		if (targetTopicIds.length === 0) {
			throw new Error("当前没有可写入的 .irdeck 专题文件");
		}
		const profile =
			this.profilesCache[group.id] ||
			this.cloneProfile({
				...DEFAULT_TAG_GROUP_PROFILE,
				groupId: group.id,
			});
		const affectedTopicIds = await this.getPointStorageService().mergeTagGroupCatalogIntoPointFiles({
			groups: {
				[group.id]: group,
			},
			profiles: {
				[group.id]: profile,
			},
			targetTopicIds,
		});
		this.groupsCache[group.id] = this.cloneGroup(group);
		this.profilesCache[group.id] = this.cloneProfile(profile);
		this.groupScopeCache[group.id] = [...targetTopicIds].sort((a, b) => a.localeCompare(b, "zh-CN"));
		return { affectedTopicIds: affectedTopicIds.length > 0 ? affectedTopicIds : targetTopicIds };
	}

	async deleteGroup(
		groupId: string,
		options?: {
			targetTopicIds?: string[];
			getAllChunkData?: () => Promise<Record<string, any>>;
			saveChunkData?: (data: any) => Promise<void>;
			getAllSources?: () => Promise<Record<string, any>>;
			saveSource?: (data: any) => Promise<void>;
		}
	): Promise<void> {
		await this.initialize();

		if (!groupId || groupId === "default") {
			return;
		}

		const currentScopeIds = new Set(this.groupScopeCache[groupId] || []);
		const targetTopicIds = this.resolveTargetTopicIds(groupId, options?.targetTopicIds);
		const removedTopicIds = new Set(
			await this.getPointStorageService().removeTagGroupFromPointFiles(groupId, targetTopicIds)
		);
		const remainingScopeIds = Array.from(currentScopeIds).filter((topicId) => !removedTopicIds.has(topicId));

		if (remainingScopeIds.length === 0) {
			for (const mapping of Object.values(this.documentMapCache)) {
				if (mapping.groupId === groupId) {
					mapping.groupId = "default";
					mapping.updatedAt = new Date().toISOString();
				}
			}
			delete this.groupsCache[groupId];
			delete this.profilesCache[groupId];
			delete this.groupScopeCache[groupId];
			await this.saveDocumentMap();
		} else {
			this.groupScopeCache[groupId] = remainingScopeIds.sort((a, b) =>
				a.localeCompare(b, "zh-CN")
			);
		}

		// 只有在该标签组被全局移除时，才级联清理兼容层 chunk/source 残留 groupId
		if (
			remainingScopeIds.length === 0 &&
			options?.getAllChunkData &&
			options?.saveChunkData
		) {
			try {
				const allChunks = await options.getAllChunkData();
				for (const chunk of Object.values(allChunks)) {
					if (chunk?.meta?.tagGroup === groupId) {
						chunk.meta.tagGroup = "default";
						chunk.updatedAt = Date.now();
						await options.saveChunkData(chunk);
					}
				}
			} catch (error) {
				logger.warn(`[IRTagGroupService] 级联清理 chunk tagGroup 失败: ${groupId}`, error);
			}
		}
		if (
			remainingScopeIds.length === 0 &&
			options?.getAllSources &&
			options?.saveSource
		) {
			try {
				const allSources = await options.getAllSources();
				for (const source of Object.values(allSources)) {
					if (source?.tagGroup === groupId) {
						source.tagGroup = "default";
						source.updatedAt = Date.now();
						await options.saveSource(source);
					}
				}
			} catch (error) {
				logger.warn(`[IRTagGroupService] 级联清理 source tagGroup 失败: ${groupId}`, error);
			}
		}
	}

	async getProfile(groupId: string): Promise<IRTagGroupProfile> {
		await this.initialize();
		const existing = this.profilesCache[groupId];
		if (existing) return this.cloneProfile(existing);

		const created: IRTagGroupProfile = {
			...DEFAULT_TAG_GROUP_PROFILE,
			groupId,
		};
		this.profilesCache[groupId] = created;
		const targetTopicIds = this.resolveTargetTopicIds(groupId);
		if (targetTopicIds.length > 0 && this.groupsCache[groupId]) {
			await this.getPointStorageService().mergeTagGroupCatalogIntoPointFiles({
				groups: {
					[groupId]: this.groupsCache[groupId],
				},
				profiles: {
					[groupId]: created,
				},
				targetTopicIds,
			});
		}
		return this.cloneProfile(created);
	}

	async saveProfile(
		profile: IRTagGroupProfile,
		options: { targetTopicIds?: string[] } = {}
	): Promise<{ affectedTopicIds: string[] }> {
		await this.initialize();
		this.profilesCache[profile.groupId] = this.cloneProfile(profile);
		const group = this.groupsCache[profile.groupId];
		const targetTopicIds = this.resolveTargetTopicIds(profile.groupId, options.targetTopicIds);
		if (!group || targetTopicIds.length === 0) {
			return { affectedTopicIds: [] };
		}
		const affectedTopicIds = await this.getPointStorageService().mergeTagGroupCatalogIntoPointFiles({
			groups: {
				[profile.groupId]: group,
			},
			profiles: {
				[profile.groupId]: profile,
			},
			targetTopicIds,
		});
		this.groupScopeCache[profile.groupId] = [...targetTopicIds].sort((a, b) =>
			a.localeCompare(b, "zh-CN")
		);
		return { affectedTopicIds: affectedTopicIds.length > 0 ? affectedTopicIds : targetTopicIds };
	}

	/**
	 * 从阅读点 Markdown 文件中提取 weave_tags
	 */
	async extractTagsFromFile(filePath: string): Promise<string[]> {
		return this.extractTagsWithSource(filePath);
	}

	/**
	 * 兼容旧接口，但正式匹配来源已统一为阅读点标签 weave_tags
	 */
	async extractTagsWithSource(
		filePath: string,
		_matchSource?: IRTagGroupMatchSource
	): Promise<string[]> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) return [];

			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = (cache?.frontmatter as Record<string, unknown> | undefined) || {};
			const rawValue = frontmatter["weave_tags"];
			if (Array.isArray(rawValue)) {
				return normalizeTagGroupCandidateTags(rawValue.map((tag) => String(tag)));
			}
			if (typeof rawValue === "string") {
				return normalizeTagGroupCandidateTags(
					rawValue
						.split(",")
						.map((tag) => tag.trim())
						.filter(Boolean)
				);
			}
			return [];
		} catch (error) {
			logger.debug(`[IRTagGroupService] 提取阅读点标签失败: ${filePath}`, error);
		}
		return [];
	}

	/**
	 * 为文档匹配标签组
	 *
	 * @param filePath 文件路径
	 * @param forceRefresh 强制刷新（忽略缓存）
	 * @returns 匹配的标签组 ID
	 */
	async matchGroupForDocument(filePath: string, forceRefresh = false): Promise<string> {
		await this.initialize();

		// ????
		if (!forceRefresh && this.documentMapCache[filePath]) {
			return this.documentMapCache[filePath].groupId;
		}

		const allCollectedTags = await this.extractTagsFromFile(filePath);
		const matchedGroupId = matchTagGroupByTags(Object.values(this.groupsCache), allCollectedTags);

		// 更新缓存
		this.documentMapCache[filePath] = {
			filePath,
			groupId: matchedGroupId,
			tagsSnapshot: allCollectedTags,
			updatedAt: new Date().toISOString(),
		};
		await this.saveDocumentMap();

		logger.debug(
			`[IRTagGroupService] 匹配标签组 ${filePath} -> ${matchedGroupId}, ` +
				`文档标签=[${allCollectedTags.join(", ")}]`
		);

		return matchedGroupId;
	}

	async matchGroupForTags(tags: string[]): Promise<string> {
		await this.initialize();
		return matchTagGroupByTags(Object.values(this.groupsCache), tags);
	}

	invalidateDocumentCache(filePath: string): void {
		if (this.documentMapCache[filePath]) {
			delete this.documentMapCache[filePath];
		}
	}

	/**
	 * 手动设置文档的标签组映射（用于右键菜单等手动切换场景）
	 * 同步更新 documentMapCache，使设置界面文档数统计正常
	 */
	async updateDocumentGroupManual(filePath: string, groupId: string): Promise<void> {
		await this.initialize();
		this.documentMapCache[filePath] = {
			filePath,
			groupId,
			tagsSnapshot: this.documentMapCache[filePath]?.tagsSnapshot || [],
			updatedAt: new Date().toISOString(),
		};
		await this.saveDocumentMap();
	}

	/**
	 * 获取文档的标签组参数
	 */
	async getProfileForDocument(filePath: string): Promise<IRTagGroupProfile> {
		const groupId = await this.matchGroupForDocument(filePath);
		return this.getProfile(groupId);
	}

	/**
	 * 清除文档映射缓存
	 */
	async clearDocumentMapCache(filePath?: string): Promise<void> {
		await this.initialize();

		if (filePath) {
			delete this.documentMapCache[filePath];
		} else {
			this.documentMapCache = {};
		}

		await this.saveDocumentMap();
	}

	// ============================================
	// 标签漂移检测
	// ============================================

	/**
	 * 检测文档标签是否发生漂移（匹配到不同标签组）
	 * @param filePath 源文档路径
	 * @param currentTagGroup 当前存储的标签组 ID
	 * @returns 漂移信息，null 表示未发生漂移
	 */
	async detectTagGroupDrift(
		filePath: string,
		currentTagGroup: string
	): Promise<{
		oldGroupId: string;
		newGroupId: string;
		oldGroupName: string;
		newGroupName: string;
		currentTags: string[];
	} | null> {
		await this.initialize();

		// 重新提取文档当前标签
		const currentTags = await this.extractTagsFromFile(filePath);

		// ???????????????????
		const newGroupId = await this.matchGroupForDocument(filePath, true);

		// ???????????
		if (newGroupId === currentTagGroup) {
			return null;
		}

		// ????????
		const oldGroup = this.groupsCache[currentTagGroup];
		const newGroup = this.groupsCache[newGroupId];

		return {
			oldGroupId: currentTagGroup,
			newGroupId,
			oldGroupName: oldGroup?.name || (currentTagGroup === "default" ? "默认" : currentTagGroup),
			newGroupName: newGroup?.name || (newGroupId === "default" ? "默认" : newGroupId),
			currentTags,
		};
	}

	/**
	 * 执行标签组切换：批量更新同一 sourceId 下所有 chunk、source 的 tagGroup
	 *
	 * @param chunkId 触发切换的块 ID
	 * @param sourceId 源文档 ID（可选）
	 * @param newGroupId 新标签组 ID
	 * @param storageService 存储服务（用于回写数据）
	 */
	async applyTagGroupSwitch(
		chunkId: string,
		sourceId: string | undefined,
		newGroupId: string,
		storageService: {
			getChunkData: (id: string) => Promise<any>;
			saveChunkData: (data: any) => Promise<void>;
			getSource: (id: string) => Promise<any>;
			saveSource: (data: any) => Promise<void>;
			getAllChunkData?: () => Promise<Record<string, any>>;
		}
	): Promise<void> {
		await this.initialize();

		let updatedCount = 0;

		// 批量更新同一 sourceId 下所有 chunk 的 tagGroup
		if (sourceId && storageService.getAllChunkData) {
			try {
				const allChunks = await storageService.getAllChunkData();
				for (const chunk of Object.values(allChunks)) {
					if (chunk?.sourceId === sourceId) {
						chunk.meta = chunk.meta || {};
						chunk.meta.tagGroup = newGroupId;
						chunk.updatedAt = Date.now();
						await storageService.saveChunkData(chunk);
						updatedCount++;
					}
				}
			} catch (error) {
				logger.warn(
					`[IRTagGroupService] 批量更新 chunk tagGroup 失败: sourceId=${sourceId}`,
					error
				);
			}
		} else {
			// 回退：仅更新当前 chunk
			try {
				const chunkData = await storageService.getChunkData(chunkId);
				if (chunkData) {
					chunkData.meta = chunkData.meta || {};
					chunkData.meta.tagGroup = newGroupId;
					chunkData.updatedAt = Date.now();
					await storageService.saveChunkData(chunkData);
					updatedCount = 1;
				}
			} catch (error) {
				logger.warn(`[IRTagGroupService] 更新 chunk tagGroup 失败: ${chunkId}`, error);
			}
		}

		// 更新 source 的 tagGroup
		if (sourceId) {
			try {
				const source = await storageService.getSource(sourceId);
				if (source) {
					source.tagGroup = newGroupId;
					source.updatedAt = Date.now();
					await storageService.saveSource(source);
				}
			} catch (error) {
				logger.warn(`[IRTagGroupService] 更新 source tagGroup 失败: ${sourceId}`, error);
			}
		}

		logger.info(
			`[IRTagGroupService] 标签组切换: sourceId=${sourceId}, newGroup=${newGroupId}, 更新 ${updatedCount} 个 chunk`
		);
	}

	// ============================================
	// 组参数学习（shrinkage + 慢学习）
	// ============================================

	/**
	 * 更新组参数（基于负载信号，使用 shrinkage）
	 *
	 * @param groupId 标签组 ID
	 * @param loadSignal 负载信号 L (0-1)
	 * @param priorityWeight 优先级权重 (0.5-1.5)
	 * @param settings 高级设置
	 */
	async updateGroupProfile(
		groupId: string,
		loadSignal: number,
		priorityWeight: number,
		settings: IRAdvancedScheduleSettings = DEFAULT_ADVANCED_SCHEDULE_SETTINGS
	): Promise<void> {
		// 学习速度关闭时直接返回
		if (settings.tagGroupLearningSpeed === "off") {
			return;
		}

		await this.initialize();
		const profile = await this.getProfile(groupId);

		// 根据学习速度确定半衰期
		const learningHalfLife: Record<string, number> = {
			slow: 90,
			medium: 45,
			fast: 20,
		};
		const halfLifeDays = learningHalfLife[settings.tagGroupLearningSpeed] || 90;

		// 计算目标 intervalFactorBase
		// L 高（更需要密集处理）-> A_target 更小
		const globalBase = 1.5;
		const beta = 0.8;
		const l0 = 0.5;
		const aTarget = Math.max(
			settings.intervalFactorClamp[0],
			Math.min(settings.intervalFactorClamp[1], globalBase * Math.exp(-beta * (loadSignal - l0)))
		);

		// 慢学习 EWMA
		const eta = 1 - 2 ** (-1 / halfLifeDays);
		const wNorm = (priorityWeight - 0.5) / 1.0; // 映射到 0-1
		const aRawNew = (1 - eta * wNorm) * profile.intervalFactorBase + eta * wNorm * aTarget;

		// Shrinkage: lambda(n) = k / (k + n)
		const k = settings.shrinkageStrength;
		const n = profile.sampleCount;
		const lambda = k / (k + n);

		// 融合
		const aFinal = lambda * globalBase + (1 - lambda) * aRawNew;

		// Clamp
		const aFinalClamped = Math.max(
			settings.intervalFactorClamp[0],
			Math.min(settings.intervalFactorClamp[1], aFinal)
		);

		// 更新 profile
		profile.intervalFactorBase = aFinalClamped;
		profile.sampleCount = n + 1;

		// 初始化 history 记录
		if (!profile.history) {
			profile.history = [];
		}
		profile.history.push({
			timestamp: new Date().toISOString(),
			value: aFinalClamped,
			sampleCount: n + 1,
		});
		// 仅保留最近 100 条
		if (profile.history.length > 100) {
			profile.history = profile.history.slice(-100);
		}

		await this.saveProfile(profile);

		logger.debug(
			`[IRTagGroupService] 更新组参数 ${groupId}: ` +
				`L=${loadSignal.toFixed(2)}, w=${priorityWeight.toFixed(2)}, ` +
				`A_target=${aTarget.toFixed(2)}, A_final=${aFinalClamped.toFixed(2)}, ` +
				`n=${n + 1}, lambda=${lambda.toFixed(3)}`
		);
	}

	/**
	 * 获取组统计信息
	 */
	async getGroupStats(): Promise<
		Array<{
			group: IRTagGroup;
			profile: IRTagGroupProfile;
			documentCount: number;
		}>
	> {
		await this.initialize();

		const stats: Array<{
			group: IRTagGroup;
			profile: IRTagGroupProfile;
			documentCount: number;
		}> = [];

		// ??????????????
		const groupDocCounts: Record<string, number> = {};
		for (const mapping of Object.values(this.documentMapCache)) {
			groupDocCounts[mapping.groupId] = (groupDocCounts[mapping.groupId] || 0) + 1;
		}

		for (const group of Object.values(this.groupsCache)) {
			stats.push({
				group,
				profile: await this.getProfile(group.id),
				documentCount: groupDocCounts[group.id] || 0,
			});
		}

		return stats;
	}
}
