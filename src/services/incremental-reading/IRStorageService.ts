/** 负责增量阅读相关 JSON 存储的读写与目录初始化。 */

import { App, TFile, TFolder, normalizePath } from "obsidian";
import {
	PATHS,
	getPluginPaths,
	getReadableWeaveRoot,
	getV2PathsFromApp,
	normalizeWeaveParentFolder,
	resolveIRImportFolder,
} from "../../config/paths";
import type {
	FileSyncState,
	IRBlock,
	IRDeck,
	IRHistoryStore,
	IRSession,
	IRSourceFileMeta,
	IRStudySession,
	IRStudySessionStore,
	IRSyncStateStore,
} from "../../types/ir-types";
import { IR_STORAGE_VERSION } from "../../types/ir-types";
import {
	READING_LEGACY_DECK_YAML_KEY,
	READING_TOPIC_YAML_KEY,
	extractReadingTopicIdFromFrontmatter,
	normalizeChunkForRuntime,
	normalizeIRSessionForRuntime,
	normalizeStudySessionForRuntime,
	serializeIRSessionForStorage,
	serializeStudySessionForStorage,
} from "../../utils/ir-topic-compat";
import { logger } from "../../utils/logger";
import { parseYAMLFromContent, setCardProperty } from "../../utils/yaml-utils";
import {
	buildLegacyBlockFromPointSnapshot,
	buildLegacyChunkFromPointSnapshot,
	getStoredPointKind,
	isLegacyBlockPointSnapshot,
} from "./IRLegacyTaskCompatAdapter";
import { IRPointStorageService } from "./IRPointStorageService";
import { resolveAssociatedNotePath, resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import { getSharedIRWorkspaceSnapshotService } from "./IRWorkspaceSnapshotService";
import { DirectoryUtils } from "../../utils/directory-utils";
import { processFrontmatterRecord } from "../../utils/frontmatter-record";
import { isRecord, parseJsonUnknown } from "../../utils/typed-json";
import { readUnknownProperty } from "../../utils/dynamic-access";

const HISTORY_FILE = "history.json";
const SYNC_STATE_FILE = "sync-state.json";
const CALENDAR_PROGRESS_FILE = "calendar-progress.json";
const DEFAULT_IR_TOPIC_ID = "ungrouped-ir";

export class IRStorageService {
	private app: App;
	private initialized = false;
	private initPromise: Promise<void> | null = null;
	private pointStorageService: IRPointStorageService | null = null;
	private readonly runtimeSourceMetadataById = new Map<string, IRSourceFileMeta>();

	constructor(app: App) {
		this.app = app;
	}

	private getPointStorageService(): IRPointStorageService {
		if (!this.pointStorageService) {
			this.pointStorageService = new IRPointStorageService(this.app);
		}
		return this.pointStorageService;
	}

	private getSyncStateStoragePath(): string {
		return normalizePath(getPluginPaths(this.app as unknown).cache.incrementalReading.syncState);
	}

	private getLegacySyncStateStoragePath(): string {
		return `${this.getStorageDir()}/${SYNC_STATE_FILE}`;
	}

	private getHistoryStoragePath(): string {
		return normalizePath(getPluginPaths(this.app as unknown).state.incrementalReading.history);
	}

	private getCalendarProgressStoragePath(): string {
		return normalizePath(getPluginPaths(this.app as unknown).state.incrementalReading.calendarProgress);
	}

	private getStudySessionsStoragePath(): string {
		return normalizePath(getPluginPaths(this.app as unknown).state.incrementalReading.studySessions);
	}

	private collectLegacyIncrementalReadingStatePaths(fileName: string): string[] {
		const normalizedFileName = String(fileName || "").trim();
		if (!normalizedFileName) {
			return [];
		}

		const candidates = new Set<string>();
		candidates.add(`${this.getStorageDir()}/${normalizedFileName}`);
		candidates.add(`${PATHS.incrementalReading}/${normalizedFileName}`);

		const roots = this.getReadableRoots();
		if (roots?.currentRoot) {
			candidates.add(`${roots.currentRoot}/incremental-reading/${normalizedFileName}`);
		}
		if (roots?.legacyRoot) {
			candidates.add(`${roots.legacyRoot}/incremental-reading/${normalizedFileName}`);
		}

		return Array.from(candidates)
			.map((path) => normalizePath(path))
			.filter(Boolean);
	}

	private async readStructuredLocalStateWithLegacyFallback(options: {
		localPath: string;
		legacyPaths: string[];
		defaultContent: string;
		label: string;
	}): Promise<string> {
		const localContent = await this.readOptionalFile(options.localPath);
		if (localContent !== null) {
			return localContent;
		}

		for (const legacyPath of options.legacyPaths) {
			const legacyContent = await this.readOptionalFile(legacyPath);
			if (legacyContent === null) {
				continue;
			}

			try {
				await this.writeFile(options.localPath, legacyContent);
			} catch (error) {
				logger.warn(
					`[IRStorageService] 迁移 ${options.label} 到插件本地目录失败，已继续使用旧文件: ${legacyPath}`,
					error
				);
			}
			return legacyContent;
		}

		await this.writeFile(options.localPath, options.defaultContent);
		return options.defaultContent;
	}

	private buildTopicNamesByIdMap(decks: Record<string, IRDeck>): Map<string, string> {
		return new Map(
			Object.values(decks).map((deck) => [deck.id, String(deck.name || "").trim()] as const)
		);
	}

	private async getPointBackedDecks(): Promise<Record<string, IRDeck>> {
		try {
			return await this.getPointStorageService().listPointDecks();
		} catch (error) {
			logger.warn("[IRStorageService] 读取 .irdeck 专题目录失败，当前返回空专题列表", error);
			return {};
		}
	}

	private async listChunkPointSnapshots() {
		const snapshots = await this.getPointStorageService().listPointSnapshots();
		return snapshots.filter((snapshot) => getStoredPointKind(snapshot) === "chunk");
	}

	private async listLegacyBlockPointSnapshots() {
		const snapshots = await this.getPointStorageService().listPointSnapshots();
		return snapshots.filter((snapshot) => isLegacyBlockPointSnapshot(snapshot));
	}

	private resolveLegacyBlockTopicIds(
		block: IRBlock,
		decks: Record<string, IRDeck>
	): string[] {
		const topicIds = new Set<string>();
		const directDeckPath = String((block as unknown)?.deckPath || "").trim();
		if (directDeckPath) {
			topicIds.add(directDeckPath);
		}

		for (const [deckKey, deck] of Object.entries(decks || {})) {
			if (!Array.isArray(deck.blockIds) || !deck.blockIds.includes(block.id)) {
				continue;
			}
			const deckId = String(deck.id || deck.path || deckKey || "").trim();
			if (deckId) {
				topicIds.add(deckId);
			}
		}

		return Array.from(topicIds);
	}

	private async projectLegacyBlocksFromPoints(): Promise<Record<string, IRBlock>> {
		const snapshots = await this.listLegacyBlockPointSnapshots();
		const blocks: Record<string, IRBlock> = {};

		for (const snapshot of snapshots) {
			const block = buildLegacyBlockFromPointSnapshot(snapshot);
			if (!block) {
				continue;
			}
			blocks[block.id] = block;
		}

		return blocks;
	}

	private deriveLegacyBlockTitle(block: IRBlock): string {
		const headingPath = Array.isArray(block.headingPath) ? block.headingPath : [];
		const headingTitle = String(headingPath[headingPath.length - 1] || "").trim();
		if (headingTitle) {
			return headingTitle;
		}
		if (typeof block.headingText === "string" && block.headingText.trim()) {
			return block.headingText.trim();
		}
		const preview = String(block.contentPreview || "").trim();
		if (preview) {
			return preview.replace(/\s+/g, " ").slice(0, 80);
		}
		return String(block.id || "").trim() || "未命名阅读点";
	}

	private async syncLegacyBlockToPointStorage(
		block: IRBlock,
		decks?: Record<string, IRDeck>
	): Promise<void> {
		const resolvedDecks = decks || (await this.getAllDecks());
		const topicIds = this.resolveLegacyBlockTopicIds(block, resolvedDecks);
		const primaryTopicId = topicIds[0] || "ungrouped-ir";
		const primaryDeck = Object.entries(resolvedDecks).find(
			([deckKey, deck]) => String(deck.id || deck.path || deckKey || "").trim() === primaryTopicId
		);
		const sourcePath = normalizePath(String(block.filePath || "").trim());

		await this.getPointStorageService().syncLegacyPoint(
			{
				id: block.id,
				topicId: primaryTopicId,
				topicIds,
				topicName: String(primaryDeck?.[1]?.name || primaryTopicId || "未归类增量阅读").trim(),
				title: this.deriveLegacyBlockTitle(block),
				tags: Array.isArray(block.tags) ? [...block.tags] : [],
				status: typeof block.state === "string" ? block.state : "new",
				priorityUi:
					typeof block.priorityUi === "number"
						? block.priorityUi
						: typeof block.priorityEff === "number"
							? block.priorityEff
							: undefined,
				priorityEff:
					typeof block.priorityEff === "number"
						? block.priorityEff
						: typeof block.priorityUi === "number"
							? block.priorityUi
							: undefined,
				intervalDays: typeof block.interval === "number" ? block.interval : undefined,
				nextRepDate:
					typeof block.nextReview === "string" && block.nextReview.trim()
						? Date.parse(block.nextReview)
						: undefined,
				createdAt:
					typeof block.createdAt === "string" && block.createdAt.trim()
						? Date.parse(block.createdAt)
						: undefined,
				updatedAt:
					typeof block.updatedAt === "string" && block.updatedAt.trim()
						? Date.parse(block.updatedAt)
						: undefined,
				lastInteractionAt:
					typeof block.lastReview === "string" && block.lastReview.trim()
						? Date.parse(block.lastReview)
						: undefined,
				sourceType: "legacy-block",
				sourcePath,
				pointType: "legacy-block-entry",
				locatorType: "markdown-block",
				locator: {
					filePath: sourcePath,
					sourcePath,
					headingPath: Array.isArray(block.headingPath) ? [...block.headingPath] : [],
					headingLevel: block.headingLevel,
					startLine:
						typeof block.startLine === "number"
							? block.startLine
							: typeof block.blockIndex === "number"
								? block.blockIndex
								: 0,
					endLine:
						typeof block.endLine === "number"
							? block.endLine
							: typeof block.startLine === "number"
								? block.startLine
								: 0,
					contentPreview:
						typeof block.contentPreview === "string" ? block.contentPreview : undefined,
				},
				note: typeof block.notes === "string" ? block.notes : undefined,
				isStarred: Boolean(block.favorite),
				linkedNotePaths: resolveAssociatedNotePaths({
					associatedNotePath:
						resolveAssociatedNotePath(block) ||
						resolveAssociatedNotePath(readUnknownProperty(block, "meta")),
					associatedNotePaths: Array.isArray(readUnknownProperty(block, "associatedNotePaths"))
						? (readUnknownProperty(block, "associatedNotePaths") as string[])
						: Array.isArray(readUnknownProperty(readUnknownProperty(block, "meta"), "associatedNotePaths"))
							? (readUnknownProperty(readUnknownProperty(block, "meta"), "associatedNotePaths") as string[])
							: undefined,
				}),
				explicitTagGroupId:
					typeof block.tagGroupId === "string" ? block.tagGroupId : undefined,
				stats: {
					impressions:
						typeof block.reviewCount === "number" ? block.reviewCount : undefined,
					reviewCount:
						typeof block.reviewCount === "number" ? block.reviewCount : undefined,
					cardsCreated: Array.isArray(block.extractedCards)
						? block.extractedCards.length
						: undefined,
					totalReadingTimeSec:
						typeof block.totalReadingTime === "number" ? block.totalReadingTime : undefined,
					lastInteractionAt:
						typeof block.lastReview === "string" && block.lastReview.trim()
							? Date.parse(block.lastReview)
							: undefined,
				},
				metadata: {
					headingPath: Array.isArray(block.headingPath) ? [...block.headingPath] : [],
					headingText:
						typeof block.headingText === "string"
							? block.headingText
							: this.deriveLegacyBlockTitle(block),
					headingLevel: block.headingLevel,
					startLine:
						typeof block.startLine === "number"
							? block.startLine
							: typeof block.blockIndex === "number"
								? block.blockIndex
								: 0,
					endLine:
						typeof block.endLine === "number"
							? block.endLine
							: typeof block.startLine === "number"
								? block.startLine
								: 0,
					contentPreview:
						typeof block.contentPreview === "string" ? block.contentPreview : undefined,
					tagGroupId:
						typeof block.tagGroupId === "string" ? block.tagGroupId : undefined,
					intervalFactor:
						typeof block.intervalFactor === "number" ? block.intervalFactor : undefined,
				},
			},
			{ preserveExisting: false }
		);
	}

	private mergeProjectedSource(
		existing: import("../../types/ir-types").IRSourceFileMeta | undefined,
		next: import("../../types/ir-types").IRSourceFileMeta
	): import("../../types/ir-types").IRSourceFileMeta {
		if (!existing) {
			return {
				...next,
				chunkIds: Array.from(new Set(next.chunkIds || [])),
			};
		}

		return {
			...existing,
			originalPath: existing.originalPath || next.originalPath,
			rawFilePath: existing.rawFilePath || next.rawFilePath,
			indexFilePath: existing.indexFilePath || next.indexFilePath,
			title: existing.title || next.title,
			tagGroup:
				next.tagGroup && next.tagGroup !== "default" ? next.tagGroup : existing.tagGroup,
			chunkIds: Array.from(new Set([...(existing.chunkIds || []), ...(next.chunkIds || [])])),
			createdAt:
				existing.createdAt && next.createdAt
					? Math.min(existing.createdAt, next.createdAt)
					: existing.createdAt || next.createdAt,
			updatedAt: Math.max(existing.updatedAt || 0, next.updatedAt || 0),
		};
	}

	private async projectRuntimeChunkStoresFromPoints(): Promise<{
		chunks: Record<string, import("../../types/ir-types").IRChunkFileData>;
		sources: Record<string, IRSourceFileMeta>;
	}> {
		const snapshots = await this.listChunkPointSnapshots();
		const chunks: Record<string, import("../../types/ir-types").IRChunkFileData> = {};
		const sources: Record<string, IRSourceFileMeta> = {};

		for (const snapshot of snapshots) {
			const { chunk, source } = buildLegacyChunkFromPointSnapshot(snapshot);
			chunks[chunk.chunkId] = normalizeChunkForRuntime(chunk);
			sources[source.sourceId] = this.mergeProjectedSource(sources[source.sourceId], source);
		}

		return { chunks, sources };
	}

	private cacheRuntimeSourceMetadata(sourceList: IRSourceFileMeta[]): void {
		for (const source of sourceList) {
			const sourceId = String(source?.sourceId || "").trim();
			if (!sourceId) {
				continue;
			}
			this.runtimeSourceMetadataById.set(sourceId, source);
		}
	}

	private dropRuntimeSourceMetadata(sourceId: string): void {
		const normalizedSourceId = String(sourceId || "").trim();
		if (!normalizedSourceId) {
			return;
		}
		this.runtimeSourceMetadataById.delete(normalizedSourceId);
	}

	private mergeRuntimeSourceMetadata(
		projectedSources: Record<string, IRSourceFileMeta>
	): Record<string, IRSourceFileMeta> {
		if (this.runtimeSourceMetadataById.size === 0) {
			return projectedSources;
		}

		const mergedSources: Record<string, IRSourceFileMeta> = { ...projectedSources };
		for (const [sourceId, source] of this.runtimeSourceMetadataById.entries()) {
			mergedSources[sourceId] = source;
		}
		return mergedSources;
	}

	private async syncChunkPointToNewStorage(
		chunk: import("../../types/ir-types").IRChunkFileData,
		decks?: Record<string, IRDeck>,
		sources?: Record<string, import("../../types/ir-types").IRSourceFileMeta>
	): Promise<void> {
		try {
			const [resolvedDecks, resolvedSources] = await Promise.all([
				decks ? Promise.resolve(decks) : this.getAllDecks(),
				sources ? Promise.resolve(sources) : this.getAllSources(),
			]);
			await this.getPointStorageService().syncChunkPoint(chunk, {
				source: resolvedSources[String(chunk.sourceId || "").trim()] || null,
				topicNamesById: this.buildTopicNamesByIdMap(resolvedDecks),
			});
		} catch (error) {
			logger.warn(
				`[IRStorageService] chunk 双写到新 points 存储失败: ${String(chunk?.chunkId || "")}`,
				error
			);
		}
	}

	private async syncChunkPointsToNewStorage(
		chunkList: import("../../types/ir-types").IRChunkFileData[],
		options?: {
			decks?: Record<string, IRDeck>;
			sourcesById?: Record<string, import("../../types/ir-types").IRSourceFileMeta>;
		}
	): Promise<void> {
		if (!Array.isArray(chunkList) || chunkList.length === 0) {
			return;
		}

		try {
			const [decks, sources] = await Promise.all([
				options?.decks ? Promise.resolve(options.decks) : this.getAllDecks(),
				options?.sourcesById ? Promise.resolve(options.sourcesById) : this.getAllSources(),
			]);
			for (const chunk of chunkList) {
				await this.syncChunkPointToNewStorage(chunk, decks, sources);
			}
		} catch (error) {
			logger.warn("[IRStorageService] 批量双写 chunk points 失败", error);
		}
	}

	private async deleteChunkPointFromNewStorage(chunkId: string): Promise<void> {
		try {
			await this.getPointStorageService().deletePointByLegacyId(chunkId);
		} catch (error) {
			logger.warn(`[IRStorageService] 删除新 points 中的 chunk 失败: ${chunkId}`, error);
		}
	}

	private getStorageDir(): string {
		return getV2PathsFromApp(this.app).ir.root;
	}

	private validateDeckNameUniqueness(decks: Record<string, IRDeck>, deck: IRDeck): string {
		const normalizedName = String(deck.name || "").trim();
		if (!normalizedName) {
			throw new Error("牌组名称不能为空");
		}

		const duplicateDeck = Object.values(decks).find(
			(existingDeck) =>
				existingDeck.id !== deck.id && String(existingDeck.name || "").trim() === normalizedName
		);

		if (duplicateDeck) {
			throw new Error(`牌组名称「${normalizedName}」已存在`);
		}

		return normalizedName;
	}

	private coerceToVaultPath(p: string): string {
		const normalized = normalizePath(p);
		if (normalized.startsWith("weave/") || normalized === "weave") return normalized;
		if (normalized.startsWith(".weave/") || normalized === ".weave") return normalized;

		const weaveIdx = normalized.indexOf("/weave/");
		if (weaveIdx >= 0) {
			return normalized.slice(weaveIdx + 1);
		}

		const dotWeaveIdx = normalized.indexOf("/.weave/");
		if (dotWeaveIdx >= 0) {
			return normalized.slice(dotWeaveIdx + 1);
		}

		return normalized;
	}

	private getReadableRoots(): { legacyRoot: string; currentRoot: string } | null {
		try {
			const pluginsContainer = readUnknownProperty(this.app, "plugins");
			const pluginsMap = readUnknownProperty(pluginsContainer, "plugins");
			const plugin = isRecord(pluginsMap) ? pluginsMap.weave : undefined;
			if (!isRecord(plugin)) return null;
			const settings = readUnknownProperty(plugin, "settings");
			const parentFolder = normalizeWeaveParentFolder(
				isRecord(settings) && typeof settings.weaveParentFolder === "string"
					? settings.weaveParentFolder
					: undefined
			);
			let currentRoot = normalizePath(getReadableWeaveRoot(parentFolder));

			if (!parentFolder) {
				const incrementalReading = isRecord(settings)
					? readUnknownProperty(settings, "incrementalReading")
					: undefined;
				const importFolder = isRecord(incrementalReading)
					? incrementalReading.importFolder
					: undefined;
				if (typeof importFolder === "string" && importFolder.trim()) {
					const normalizedImport = normalizePath(importFolder);
					if (normalizedImport.endsWith("/IR")) {
						const inferred = normalizePath(normalizedImport.slice(0, -3));
						if (inferred.endsWith("/weave") || inferred === "weave") {
							currentRoot = inferred;
						}
					}
				}
			}

			const legacyRoot = normalizePath(getReadableWeaveRoot(undefined));
			if (!currentRoot || !legacyRoot || currentRoot === legacyRoot) return null;
			return { legacyRoot, currentRoot };
		} catch {
			return null;
		}
	}

	/** 初始化存储目录，并复用进行中的初始化任务。 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this.doInitialize();

		try {
			await this.initPromise;
		} finally {
			this.initPromise = null;
		}
	}

	private async doInitialize(): Promise<void> {
		try {
			const storageDir = this.getStorageDir();
			logger.info(`[IRStorageService] ⚡ 开始初始化, STORAGE_DIR=${storageDir}`);

			// 这里只保证基础目录和文件存在，迁移由专门的迁移链负责。
			await this.ensureDirectory(storageDir);
			logger.info(`[IRStorageService] ⚡ 目录创建完成: ${storageDir}`);

			this.initialized = true;
			logger.info("[IRStorageService] ✅ 存储服务初始化完成");
		} catch (error) {
			logger.error("[IRStorageService] 初始化失败:", error);
			// 保持服务可继续运行，由后续读写退回默认值。
			this.initialized = true;
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => window.setTimeout(resolve, ms));
	}

	/**
	 * 确保目录存在（使用 adapter）
	 */
	private async ensureDirectory(path: string): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const normalized = normalizePath(path);
			const parts = normalized.split("/").filter(Boolean);
			let current = "";

			for (const part of parts) {
				current = current ? `${current}/${part}` : part;
				const exists = await adapter.exists(current);
				if (!exists) {
					await adapter.mkdir(current);
				}
			}
		} catch (_e) {
			// 忽略错误，目录可能已存在
		}
	}

	/**
	 * 确保文件存在（使用 adapter）
	 */
	private async ensureFile(path: string, defaultContent: string): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(path);
			if (!exists) {
				// 确保父目录存在
				const dir = path.substring(0, path.lastIndexOf("/"));
				if (dir) {
					await this.ensureDirectory(dir);
				}
				await adapter.write(path, defaultContent);
			}
		} catch (e) {
			logger.warn(`[IRStorageService] 确保文件存在失败: ${path}`, e);
		}
	}

	// ============================================
	// 内容块操作
	// ============================================

	/** 返回所有内容块，并在需要时修正可读根目录路径。 */
	async getAllBlocks(): Promise<Record<string, IRBlock>> {
		await this.initialize();
		return await this.projectLegacyBlocksFromPoints();
	}

	/** 获取单个内容块。 */
	async getBlock(id: string): Promise<IRBlock | null> {
		const blocks = await this.getAllBlocks();
		return blocks[id] || null;
	}

	/** 获取牌组下的内容块，优先使用 blockIds，必要时回退到旧的 deckPath。 */
	async getBlocksByDeck(
		deckId: string,
		includeIgnored = false,
		caller = "unknown"
	): Promise<IRBlock[]> {
		const blocks = await this.getAllBlocks();
		const deck = await this.getDeckById(deckId);

		logger.info(
			`[IRStorageService] getBlocksByDeck [${caller}]: deckId=${deckId}, deck found=${!!deck}, blockIds count=${
				deck?.blockIds?.length || 0
			}, all blocks count=${Object.keys(blocks).length}`
		);

		const filterIgnored = (block: IRBlock): boolean => {
			if (includeIgnored) return true;
			if (block.state === "suspended") return false;
			const hasIgnoreInTags =
				block.tags?.some(
					(tag) => tag.toLowerCase() === "ignore" || tag.toLowerCase() === "#ignore"
				) || false;
			const hasIgnoreInContent = /#ignore\b/i.test(block.contentPreview || "");
			if (hasIgnoreInTags || hasIgnoreInContent) return false;
			return true;
		};

		if (deck?.blockIds && deck.blockIds.length > 0) {
			const blockKeys = Object.keys(blocks);
			const matchedCount = deck.blockIds.filter((id) => blocks[id] !== undefined).length;
			logger.info(
				`[IRStorageService] getBlocksByDeck: blockIds=${deck.blockIds.length}, blocks键数=${blockKeys.length}, 匹配数=${matchedCount}`
			);
			// 仅在索引完全失配时补充样本，方便定位旧数据或引用残留。
			if (matchedCount === 0 && deck.blockIds.length > 0) {
				logger.warn(
					`[IRStorageService] ⚠️ ID不匹配！blockIds前3个: ${JSON.stringify(
						deck.blockIds.slice(0, 3)
					)}, blocks键前3个: ${JSON.stringify(blockKeys.slice(0, 3))}`
				);
			}

			const result = deck.blockIds
				.map((id) => blocks[id])
				.filter((block): block is IRBlock => block !== undefined)
				.filter(filterIgnored);
			return result;
		}

		const deckPath = deck?.path || deckId;
		const allBlockValues = Object.values(blocks);

		const v1Result = allBlockValues
			.filter((block) => block.deckPath === deckId || block.deckPath === deckPath)
			.filter(filterIgnored);
		return v1Result;
	}

	/** 获取文件下的所有内容块，并按行号排序。 */
	async getBlocksByFile(filePath: string): Promise<IRBlock[]> {
		const blocks = await this.getAllBlocks();
		return Object.values(blocks)
			.filter((block) => block.filePath === filePath)
			.sort((a, b) => (a.startLine ?? a.blockIndex ?? 0) - (b.startLine ?? b.blockIndex ?? 0));
	}

	/**
	 * 保存内容块（版本化存储）
	 */
	async saveBlock(block: IRBlock): Promise<void> {
		await this.initialize();
		await this.syncLegacyBlockToPointStorage(block);
	}

	/**
	 * 批量保存内容块（版本化存储）
	 */
	async saveBlocks(newBlocks: IRBlock[]): Promise<void> {
		await this.initialize();
		const decks = await this.getAllDecks();
		for (const block of newBlocks) {
			await this.syncLegacyBlockToPointStorage(block, decks);
		}
	}

	/**
	 * 删除内容块（版本化存储）
	 * 实现级联删除，自动从所有牌组的 blockIds 中移除该 UUID
	 */
	async deleteBlock(id: string): Promise<void> {
		await this.initialize();
		const deletedBlock = await this.getBlock(id);
		await this.getPointStorageService().deletePointByLegacyId(id);

		// 级联删除：从所有牌组中移除该内容块引用
		await this.removeBlockFromAllDecks(id, deletedBlock?.filePath);
	}

	/**
	 * 从所有牌组中移除指定内容块引用
	 * @param blockId 要移除的内容块ID
	 * @param filePath 内容块所属文件路径（用于更新 sourceFiles）
	 */
	private async removeBlockFromAllDecks(blockId: string, filePath?: string): Promise<void> {
		const decks = await this.getAllDecks();
		let _updatedCount = 0;

		for (const deck of Object.values(decks)) {
			if (deck.blockIds?.includes(blockId)) {
				// 移除内容块引用
				deck.blockIds = deck.blockIds.filter((_id) => _id !== blockId);
				deck.updatedAt = new Date().toISOString();

				// 如果该文件在牌组中不再有内容块，从 sourceFiles 中移除
				if (filePath && deck.sourceFiles?.includes(filePath)) {
					const blocks = await this.getAllBlocks();
					const hasOtherBlocks = deck.blockIds.some((id) => blocks[id]?.filePath === filePath);
					if (!hasOtherBlocks) {
						deck.sourceFiles = deck.sourceFiles.filter((_f) => _f !== filePath);
					}
				}

				await this.saveDeck(deck);
				_updatedCount++;
			}
		}

		// 静默移除引用
	}

	/**
	 * 删除文件的所有内容块（版本化存储）
	 * 实现级联删除，自动从所有牌组中移除这些内容块引用和 sourceFiles
	 */
	async deleteBlocksByFile(filePath: string): Promise<void> {
		await this.initialize();
		const idsToDelete = (await this.getBlocksByFile(filePath)).map((block) => block.id);
		for (const id of idsToDelete) {
			await this.getPointStorageService().deletePointByLegacyId(id);
		}

		// 级联删除：从所有牌组中移除这些内容块引用和文件引用
		if (idsToDelete.length > 0) {
			await this.removeBlocksFromAllDecks(idsToDelete, filePath);
		}
	}

	/**
	 * 从所有牌组中批量移除内容块引用
	 * @param blockIds 要移除的内容块ID列表
	 * @param filePath 内容块所属文件路径（用于更新 sourceFiles）
	 */
	private async removeBlocksFromAllDecks(blockIds: string[], filePath: string): Promise<void> {
		const decks = await this.getAllDecks();
		const idsToRemove = new Set(blockIds);
		let _updatedCount = 0;

		for (const deck of Object.values(decks)) {
			const originalLength = deck.blockIds?.length || 0;

			// 移除内容块引用
			deck.blockIds = (deck.blockIds || []).filter((id) => !idsToRemove.has(id));

			if (deck.blockIds.length < originalLength) {
				deck.updatedAt = new Date().toISOString();

				// 从 sourceFiles 中移除该文件
				if (deck.sourceFiles?.includes(filePath)) {
					deck.sourceFiles = deck.sourceFiles.filter((_f) => _f !== filePath);
				}

				await this.saveDeck(deck);
				_updatedCount++;
			}
		}

		// 静默移除引用
	}

	// ============================================
	// 牌组操作
	// ============================================

	/** 返回所有专题；运行时仅以 `.irdeck` 为真源。 */
	async getAllDecks(): Promise<Record<string, IRDeck>> {
		await this.initialize();
		return await this.getPointBackedDecks();
	}

	/** @deprecated 建议改用 `getDeckById()`。 */
	async getDeck(path: string): Promise<IRDeck | null> {
		return await this.getDeckById(path);
	}

	/** 通过牌组 ID 查找，并兼容旧数据里的 path。 */
	async getDeckById(idOrPath: string): Promise<IRDeck | null> {
		const decks = await this.getAllDecks();
		return this.findDeckByIdentifier(decks, idOrPath);
	}

	/** 在牌组表中按 ID 或旧 path 字段查找牌组。 */
	private findDeckByIdentifier(
		decks: Record<string, IRDeck>,
		idOrPath: string
	): IRDeck | null {
		if (decks[idOrPath]) {
			return decks[idOrPath];
		}

		return Object.values(decks).find((deck) => deck.path === idOrPath) || null;
	}

	/**
	 * 保存牌组（版本化存储）
	 */
	async saveDeck(deck: IRDeck): Promise<void> {
		await this.initialize();

		const decks = await this.getAllDecks();
		const normalizedName = this.validateDeckNameUniqueness(decks, deck);
		const existingEntry = Object.entries(decks).find(([deckKey, existingDeck]) => {
			if (existingDeck === deck) {
				return true;
			}

			const existingStableId = String(existingDeck.id || existingDeck.path || deckKey || "").trim();
			const inputStableId = String(deck.id || deck.path || "").trim();
			if (inputStableId) {
				return existingStableId === inputStableId;
			}

			return (
				typeof existingDeck.name === "string" &&
				typeof deck.name === "string" &&
				existingDeck.name.trim() !== "" &&
				existingDeck.name.trim() === deck.name.trim()
			);
		});
		const stableKey = String(deck.id || deck.path || existingEntry?.[0] || "").trim();
		const normalizedDeck: IRDeck = {
			...deck,
			id: String(deck.id || stableKey || "").trim(),
			name: normalizedName,
			path: String(deck.id || stableKey || "").trim(),
		};
		const key = String(normalizedDeck.id || normalizedDeck.path || existingEntry?.[0] || "").trim();
		if (!key) {
			throw new Error("IR deck 保存失败：缺少稳定专题标识");
		}

		await this.getPointStorageService().upsertPointDeck({
			...normalizedDeck,
			id: key,
			path: key,
		});
		getSharedIRWorkspaceSnapshotService(this.app).invalidate();
	}

	/**
	 * 删除牌组（版本化存储，兼容 id 和 path 查找）
	 */
	async deleteDeck(idOrPath: string): Promise<void> {
		await this.initialize();

		const decks = await this.getAllDecks();

		let deckKey: string | null = null;
		let targetDeck: IRDeck | null = null;

		if (decks[idOrPath]) {
			deckKey = idOrPath;
			targetDeck = decks[idOrPath];
		} else {
			const matchedKey = Object.keys(decks).find((key) => decks[key].path === idOrPath);
			if (matchedKey) {
				deckKey = matchedKey;
				targetDeck = decks[matchedKey];
			}
		}

		if (!deckKey || !targetDeck) {
			logger.warn(`[IRStorageService] 未找到牌组: ${idOrPath}`);
			return;
		}

		const targetDeckId = targetDeck.id || deckKey;
		const targetDeckPath = targetDeck.path || targetDeckId;
		const targetDeckName = String(targetDeck.name || "").trim();
		const targetDeckTag = targetDeckName ? `#IR_deck_${targetDeckName}` : undefined;
		const sourceFiles = Array.isArray(targetDeck.sourceFiles)
			? [...new Set(targetDeck.sourceFiles)]
			: [];

		await this.cleanupDeletedDeckRelatedData({
			deckId: targetDeckId,
			deckPath: targetDeckPath,
			deckName: targetDeckName,
			deckTag: targetDeckTag,
			sourceFiles,
		});
		await this.getPointStorageService().deletePointDeck(targetDeckId);
		getSharedIRWorkspaceSnapshotService(this.app).invalidate();
	}

	private async cleanupDeletedDeckRelatedData(params: {
		deckId: string;
		deckPath: string;
		deckName: string;
		deckTag?: string;
		sourceFiles: string[];
	}): Promise<void> {
		const { deckId, deckPath, deckName, deckTag, sourceFiles } = params;
		const deckIdentifiers = this.toNormalizedStringSet([deckId, deckPath, deckName]);

		await this.cleanupDeckBookmarkTasks(deckId, deckIdentifiers, sourceFiles);
		await this.cleanupDeckBlocks(deckId, deckPath);
		await this.cleanupDeckChunksAndSources(deckId, deckTag);
		await this.cleanupDeckStudySessions(deckId, deckPath);
		await this.cleanupDeckSyncStates(sourceFiles);
		await this.cleanupDeckMarkdownFrontmatter(deckIdentifiers, deckId, sourceFiles);
	}

	private async cleanupDeckBookmarkTasks(
		deckId: string,
		deckIdentifiers: Set<string>,
		sourceFiles: string[]
	): Promise<void> {
		const pdfPaths = this.collectSourceFilesByExtension(sourceFiles, ".pdf");
		const epubPaths = this.collectSourceFilesByExtension(sourceFiles, ".epub");
		const { IRPointWriteService } = await import("./IRPointWriteService");
		const pointWriteService = new IRPointWriteService(this.app);

		try {
			await pointWriteService.deletePointsByDeckIdentifiers(Array.from(deckIdentifiers));
			await pointWriteService.deletePdfPointsByPaths(pdfPaths);
		} catch (error) {
			logger.warn(`[IRStorageService] 清理 PDF 书签任务失败: ${deckId}`, error);
		}

		try {
			await pointWriteService.deleteEpubPointsByPaths(epubPaths);
		} catch (error) {
			logger.warn(`[IRStorageService] 清理 EPUB 书签任务失败: ${deckId}`, error);
		}
	}

	private toNormalizedStringSet(values: string[]): Set<string> {
		return new Set(
			(Array.isArray(values) ? values : [])
				.map((value) => String(value || "").trim())
				.filter(Boolean)
		);
	}

	private getStudySessionDeckIdentifiers(session: Partial<IRStudySession> | null | undefined): string[] {
		return Array.from(
			this.toNormalizedStringSet([
				String(session?.topicId || ""),
				String(session?.deckId || ""),
			])
		);
	}

	private async deleteTopicDeckArtifactFolders(deckId: string): Promise<void> {
		const v2Paths = getV2PathsFromApp(this.app);
		const candidates = [
			`${v2Paths.ir.root}/topics/${deckId}`,
			`${v2Paths.ir.root}/topics/${deckId}/chunks`,
			`${v2Paths.ir.root}/topics/${deckId}/sources`,
			`${v2Paths.ir.root}/topics/${deckId}/sync-states`,
			`${v2Paths.ir.root}/topics/${deckId}/study-sessions`,
		];

		for (const path of candidates) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFolder) {
				await this.app.fileManager.trashFile(file);
			}
		}
	}

	private collectSourceFilesByExtension(sourceFiles: string[], extension: string): string[] {
		const normalizedExtension = String(extension || "").toLowerCase();
		return Array.from(
			new Set(
				(Array.isArray(sourceFiles) ? sourceFiles : [])
					.map((filePath) => String(filePath || "").trim())
					.filter((filePath) => filePath.toLowerCase().endsWith(normalizedExtension))
			)
		);
	}

	private async cleanupDeckBlocks(deckId: string, deckPath: string): Promise<void> {
		const blocks = await this.getAllBlocks();
		const idsToDelete: string[] = [];

		for (const [blockId, block] of Object.entries(blocks)) {
			if (block.deckPath === deckId || block.deckPath === deckPath) {
				idsToDelete.push(blockId);
			}
		}

		for (const blockId of idsToDelete) {
			await this.getPointStorageService().deletePointByLegacyId(blockId);
		}
	}

	private async cleanupDeckChunksAndSources(deckId: string, deckTag?: string): Promise<void> {
		const chunks = await this.getAllChunkData();
		const chunkEntries = Object.entries(chunks);
		const removedChunkIds = new Set<string>();

		for (const [chunkId, chunk] of chunkEntries) {
			const inDeckIds = Array.isArray(chunk.deckIds) && chunk.deckIds.includes(deckId);
			const inDeckTag = Boolean(deckTag) && chunk.deckTag === deckTag;
			if (inDeckIds || inDeckTag) {
				delete chunks[chunkId];
				removedChunkIds.add(chunkId);
			}
		}

		if (removedChunkIds.size > 0) {
			for (const chunkId of removedChunkIds) {
				await this.deleteChunkPointFromNewStorage(chunkId);
			}
		}

		const sources = await this.getAllSources();
		let sourcesChanged = false;
		const removedSourceIds: string[] = [];
		const remainingChunks = Object.values(chunks);

		for (const [sourceId] of Object.entries(sources)) {
			const stillReferenced = remainingChunks.some((chunk) => chunk.sourceId === sourceId);
			if (!stillReferenced) {
				delete sources[sourceId];
				sourcesChanged = true;
				removedSourceIds.push(sourceId);
			}
		}

		if (sourcesChanged) {
			for (const sourceId of removedSourceIds) {
				this.dropRuntimeSourceMetadata(sourceId);
			}
		}
	}

	private async cleanupDeckStudySessions(deckId: string, deckPath: string): Promise<void> {
		const sessions = await this.getStudySessions();
		const deckIdentifiers = this.toNormalizedStringSet([deckId, deckPath]);
		const filtered = sessions.filter(
			(session) =>
				!this.getStudySessionDeckIdentifiers(session).some((identifier) =>
					deckIdentifiers.has(identifier)
				)
		);
		if (filtered.length === sessions.length) return;

		const store: IRStudySessionStore = {
			version: "1.0",
			sessions: filtered,
		};

		await this.writeFile(this.getStudySessionsStoragePath(), JSON.stringify(store));
	}

	private async cleanupDeckSyncStates(sourceFiles: string[]): Promise<void> {
		if (sourceFiles.length === 0) return;

		const states = await this.getAllSyncStates();
		let changed = false;

		for (const filePath of sourceFiles) {
			if (states[filePath]) {
				delete states[filePath];
				changed = true;
			}
		}

		if (changed) {
			await this.saveSyncStates(states);
		}
	}

	private async cleanupDeckMarkdownFrontmatter(
		deckIdentifiers: Set<string>,
		deckId: string,
		sourceFiles: string[]
	): Promise<void> {
		if (sourceFiles.length === 0) return;

		const remainingDecks = await this.getAllDecks();
		const remainingSourceFileSet = new Set<string>();
		for (const deck of Object.values(remainingDecks)) {
			if (deck.id === deckId) continue;
			for (const filePath of deck.sourceFiles || []) {
				remainingSourceFileSet.add(filePath);
			}
		}

		for (const filePath of sourceFiles) {
			if (!filePath.endsWith(".md")) continue;
			if (remainingSourceFileSet.has(filePath)) continue;

			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) continue;

			try {
				await this.cleanupMarkdownReadingFrontmatter(file, {
					deckIdentifiers,
					addDeletedTag: true,
					removeExternalDocumentFields: true,
				});
			} catch (error) {
				logger.warn(
					`[IRStorageService] 清理 Markdown 增量阅读 frontmatter 失败: ${filePath}`,
					error
				);
			}
		}
	}

	private async cleanupMarkdownReadingFrontmatter(
		file: TFile,
		options: {
			deckIdentifiers?: Set<string>;
			addDeletedTag?: boolean;
			removeExternalDocumentFields?: boolean;
		} = {}
	): Promise<void> {
		const {
			deckIdentifiers,
			addDeletedTag = false,
			removeExternalDocumentFields = false,
		} = options;

		await processFrontmatterRecord(this.app.fileManager, file, (frontmatter) => {
			const readingDeckId = extractReadingTopicIdFromFrontmatter(frontmatter) || "";
			const hasPluginFields =
				frontmatter["weave-reading-id"] !== undefined ||
				frontmatter["weave-reading-category"] !== undefined ||
				frontmatter["weave-reading-priority"] !== undefined ||
				frontmatter[READING_TOPIC_YAML_KEY] !== undefined ||
				frontmatter[READING_LEGACY_DECK_YAML_KEY] !== undefined;
			const hasExternalDocumentFields =
				removeExternalDocumentFields &&
				(frontmatter.status !== undefined ||
					frontmatter.priority_ui !== undefined ||
					frontmatter.topic_tag !== undefined ||
					frontmatter.deck_tag !== undefined ||
					frontmatter.topic_names !== undefined ||
					frontmatter.deck_names !== undefined ||
					frontmatter.chunk_id !== undefined ||
					frontmatter.source_id !== undefined ||
					frontmatter.weave_type === "ir-chunk");

			if (!hasPluginFields && !hasExternalDocumentFields) {
				return;
			}

			if (deckIdentifiers && readingDeckId && !deckIdentifiers.has(readingDeckId)) {
				return;
			}

			frontmatter["weave-reading-id"] = undefined;
			frontmatter["weave-reading-category"] = undefined;
			frontmatter["weave-reading-priority"] = undefined;
			delete frontmatter[READING_TOPIC_YAML_KEY];
			delete frontmatter[READING_LEGACY_DECK_YAML_KEY];

			if (removeExternalDocumentFields) {
				const status =
					typeof frontmatter.status === "string"
						? String(frontmatter.status).trim().toLowerCase()
						: "";
				if (["active", "processing", "done", "archived", "removed"].includes(status)) {
					frontmatter.status = undefined;
				}

				frontmatter.priority_ui = undefined;

				const deckTag =
					typeof (frontmatter.topic_tag ?? frontmatter.deck_tag) === "string"
						? String(frontmatter.topic_tag ?? frontmatter.deck_tag).trim()
						: "";
				if (deckTag.startsWith("#IR_deck_")) {
					frontmatter.topic_tag = undefined;
					frontmatter.deck_tag = undefined;
				}

				if (Array.isArray(frontmatter.topic_names)) {
					frontmatter.topic_names = undefined;
				}
				if (Array.isArray(frontmatter.deck_names)) {
					frontmatter.deck_names = undefined;
				}

				if (typeof frontmatter.chunk_id === "string") {
					frontmatter.chunk_id = undefined;
				}

				if (typeof frontmatter.source_id === "string") {
					frontmatter.source_id = undefined;
				}

				if (frontmatter.weave_type === "ir-chunk") {
					frontmatter.weave_type = undefined;
				}
			}

			if (addDeletedTag) {
				frontmatter.tags = this.mergeFrontmatterTag(frontmatter.tags, "we_已删除");
			}
		});
	}

	async cleanupRemovedMaterialDocument(
		filePath: string,
		options: {
			removeExternalDocumentFields?: boolean;
		} = {}
	): Promise<void> {
		await this.initialize();

		if (!String(filePath || "").trim().toLowerCase().endsWith(".md")) {
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return;
		}

		await this.cleanupMarkdownReadingFrontmatter(file, {
			addDeletedTag: true,
			removeExternalDocumentFields: options.removeExternalDocumentFields ?? true,
		});
	}

	async removeMaterialScheduleData(filePath: string): Promise<void> {
		await this.initialize();

		const normalizedFilePath = normalizePath(String(filePath || "").trim());
		if (!normalizedFilePath) {
			return;
		}

		const chunks = await this.getAllChunkData();
		const relatedExternalChunkIds = Object.values(chunks)
			.filter((_chunk) => {
				const meta = _chunk.meta as unknown as Record<string, unknown> | undefined;
				return _chunk.filePath === normalizedFilePath && meta?.externalDocument === true;
			})
			.map((chunk) => chunk.chunkId)
			.filter((chunkId): chunkId is string => typeof chunkId === "string" && chunkId.length > 0);

		for (const chunkId of relatedExternalChunkIds) {
			await this.deleteChunkData(chunkId);
		}

		await this.deleteBlocksByFile(normalizedFilePath);
	}

	private mergeFrontmatterTag(existingTags: unknown, tagToAdd: string): string[] {
		const normalizedTags = Array.isArray(existingTags)
			? existingTags
					.filter((tag): tag is string => typeof tag === "string")
					.map((tag) => tag.trim())
					.filter(Boolean)
			: typeof existingTags === "string"
			? existingTags
					.split(",")
					.map((tag) => tag.trim())
					.filter(Boolean)
			: [];

		const normalizedTarget = tagToAdd.replace(/^#/, "").toLowerCase();
		const hasTarget = normalizedTags.some(
			(tag) => tag.replace(/^#/, "").toLowerCase() === normalizedTarget
		);
		return hasTarget ? normalizedTags : [...normalizedTags, tagToAdd];
	}

	private async removeChunkFromAllDecksAfterDeletion(
		chunkId: string,
		sourcePath: string | undefined,
		sourceId: string | undefined,
		remainingChunks: import("../../types/ir-types").IRChunkFileData[]
	): Promise<void> {
		const decks = await this.getAllDecks();
		const remainingChunkMap = new Map(remainingChunks.map((chunk) => [chunk.chunkId, chunk]));

		for (const deck of Object.values(decks)) {
			const originalLength = deck.blockIds?.length || 0;
			deck.blockIds = (deck.blockIds || []).filter((_id) => _id !== chunkId);

			if (deck.blockIds.length >= originalLength) {
				continue;
			}

			deck.updatedAt = new Date().toISOString();

			if (sourcePath && deck.sourceFiles?.includes(sourcePath)) {
				const hasSiblingChunksFromSameSource = deck.blockIds.some((_id) => {
					const chunk = remainingChunkMap.get(_id);
					if (!chunk) return false;
					if (sourceId) {
						return chunk.sourceId === sourceId;
					}
					return chunk.filePath === sourcePath;
				});

				if (!hasSiblingChunksFromSameSource) {
					deck.sourceFiles = deck.sourceFiles.filter((_filePath) => _filePath !== sourcePath);
				}
			}

			await this.saveDeck(deck);
		}
	}

	/**
	 * 向牌组添加内容块
	 */
	async addBlocksToDeck(deckId: string, blockIds: string[]): Promise<void> {
		const deck = await this.getDeckById(deckId);
		if (!deck) {
			logger.warn(`[IRStorageService] 牌组不存在: ${deckId}`);
			return;
		}
		const topicNamesById = this.buildTopicNamesByIdMap(await this.getAllDecks());
		const pointStorage = this.getPointStorageService();

		for (const blockId of blockIds) {
			const currentTopicIds = await pointStorage.getPointTopicIds(blockId);
			if (currentTopicIds.length === 0) {
				logger.warn(`[IRStorageService] 无法为阅读点添加专题，未找到点: ${blockId}`);
				continue;
			}
			const nextTopicIds = currentTopicIds.includes(deckId)
				? currentTopicIds
				: currentTopicIds.length === 1 && currentTopicIds[0] === DEFAULT_IR_TOPIC_ID
					? [deckId]
					: [...currentTopicIds, deckId];
			await pointStorage.updatePointTopicIds(blockId, nextTopicIds, {
				topicNamesById,
			});
		}
	}

	/**
	 * 从牌组移除内容块
	 */
	async removeBlocksFromDeck(deckId: string, blockIds: string[]): Promise<void> {
		const deck = await this.getDeckById(deckId);
		if (!deck) {
			logger.warn(`[IRStorageService] 牌组不存在: ${deckId}`);
			return;
		}
		const pointStorage = this.getPointStorageService();
		const topicNamesById = this.buildTopicNamesByIdMap(await this.getAllDecks());

		for (const blockId of blockIds) {
			const currentTopicIds = await pointStorage.getPointTopicIds(blockId);
			if (currentTopicIds.length === 0) {
				logger.warn(`[IRStorageService] 无法移除阅读点专题，未找到点: ${blockId}`);
				continue;
			}
			const nextTopicIds = currentTopicIds.filter((id) => id !== deckId);
			await pointStorage.updatePointTopicIds(
				blockId,
				nextTopicIds.length > 0 ? nextTopicIds : [DEFAULT_IR_TOPIC_ID],
				{
					topicNamesById,
				}
			);
		}
	}

	// ============================================
	// 历史记录操作
	// ============================================

	/**
	 * 获取阅读历史（支持版本化结构）
	 */
	async getHistory(): Promise<{ sessions: IRSession[] }> {
		await this.initialize();
		const content = await this.readStructuredLocalStateWithLegacyFallback({
			localPath: this.getHistoryStoragePath(),
			legacyPaths: this.collectLegacyIncrementalReadingStatePaths(HISTORY_FILE),
			defaultContent: '{"version":"2.0","sessions":[]}',
			label: "阅读历史",
		});
		try {
			const data = parseJsonUnknown(content);
			if (!isRecord(data)) {
				return { sessions: [] };
			}
			const sessionsRaw = data.sessions;
			const sessions = Array.isArray(sessionsRaw)
				? sessionsRaw.filter((session): session is IRSession => isRecord(session))
				: [];

			return {
				sessions: sessions.map((session) => normalizeIRSessionForRuntime(session)),
			};
		} catch (error) {
			logger.error("[IRStorageService] 解析历史JSON失败:", error);
			return { sessions: [] };
		}
	}

	/**
	 * 添加阅读会话（版本化存储）
	 */
	async addSession(session: IRSession): Promise<void> {
		await this.initialize();

		const history = await this.getHistory();
		history.sessions.push(session);

		// 只保留最近1000条记录
		if (history.sessions.length > 1000) {
			history.sessions = history.sessions.slice(-1000);
		}

		const store: IRHistoryStore = {
			version: IR_STORAGE_VERSION,
			sessions: history.sessions.map((entry) => serializeIRSessionForStorage(entry)),
		};

		await this.writeFile(this.getHistoryStoragePath(), JSON.stringify(store));
	}

	/**
	 * 获取内容块的阅读历史
	 */
	async getBlockSessions(blockId: string): Promise<IRSession[]> {
		const history = await this.getHistory();
		return history.sessions.filter((s) => s.blockId === blockId);
	}

	async getCalendarProgress(): Promise<Record<string, string[]>> {
		await this.initialize();
		const content = await this.readStructuredLocalStateWithLegacyFallback({
			localPath: this.getCalendarProgressStoragePath(),
			legacyPaths: this.collectLegacyIncrementalReadingStatePaths(CALENDAR_PROGRESS_FILE),
			defaultContent: `{"version":"${IR_STORAGE_VERSION}","byDate":{}}`,
			label: "月历进度",
		});

		try {
			const data = JSON.parse(content) as { version?: string; byDate?: Record<string, string[]> };
			return data.byDate && typeof data.byDate === "object" ? data.byDate : {};
		} catch (error) {
			logger.error("[IRStorageService] 解析 calendar-progress JSON 失败:", error);
			return {};
		}
	}

	async addCalendarCompletion(dateKey: string, chunkId: string): Promise<void> {
		await this.initialize();

		const byDate = await this.getCalendarProgress();
		const current = Array.isArray(byDate[dateKey]) ? byDate[dateKey] : [];
		if (!current.includes(chunkId)) {
			byDate[dateKey] = [...current, chunkId];
		}

		const store = { version: IR_STORAGE_VERSION, byDate };
		await this.writeFile(this.getCalendarProgressStoragePath(), JSON.stringify(store));
	}

	async removeCalendarCompletion(chunkId: string, dateKey?: string): Promise<void> {
		await this.initialize();

		const normalizedChunkId = String(chunkId || "").trim();
		if (!normalizedChunkId) {
			return;
		}

		const byDate = await this.getCalendarProgress();
		const targetDateKeys = dateKey ? [dateKey] : Object.keys(byDate);

		for (const key of targetDateKeys) {
			const current = Array.isArray(byDate[key]) ? byDate[key] : [];
			const next = current.filter((id) => id !== normalizedChunkId);
			if (next.length > 0) {
				byDate[key] = next;
			} else {
				delete byDate[key];
			}
		}

		const store = { version: IR_STORAGE_VERSION, byDate };
		await this.writeFile(this.getCalendarProgressStoragePath(), JSON.stringify(store));
	}

	// ============================================
	// 学习会话记录 (v6.0 整场会话级别)
	// ============================================

	private static readonly STUDY_SESSIONS_FILE = "study-sessions.json";

	/**
	 * 获取所有学习会话记录
	 */
	async getStudySessions(): Promise<IRStudySession[]> {
		await this.initialize();
		const content = await this.readStructuredLocalStateWithLegacyFallback({
			localPath: this.getStudySessionsStoragePath(),
			legacyPaths: this.collectLegacyIncrementalReadingStatePaths(
				IRStorageService.STUDY_SESSIONS_FILE
			),
			defaultContent: '{"version":"1.0","sessions":[]}',
			label: "学习会话",
		});
		try {
			const data = JSON.parse(content) as IRStudySessionStore;
			return (data.sessions || []).map((session) => normalizeStudySessionForRuntime(session));
		} catch (error) {
			logger.error("[IRStorageService] 解析学习会话JSON失败:", error);
			return [];
		}
	}

	/**
	 * 添加学习会话记录
	 */
	async addStudySession(session: IRStudySession): Promise<void> {
		await this.initialize();

		const sessions = await this.getStudySessions();
		sessions.push(session);

		// 保留最近500条记录（会话级别的记录较大，控制数量）
		const trimmedSessions = sessions.length > 500 ? sessions.slice(-500) : sessions;

		const store: IRStudySessionStore = {
			version: "1.0",
			sessions: trimmedSessions.map((session) => serializeStudySessionForStorage(session)),
		};

		await this.writeFile(this.getStudySessionsStoragePath(), JSON.stringify(store));
		logger.info(
			`[IRStorageService] 添加学习会话: ${session.id}, 时长: ${session.confirmedDuration}秒`
		);
	}

	/**
	 * 获取指定牌组的学习会话
	 */
	async getStudySessionsByDeck(deckId: string): Promise<IRStudySession[]> {
		const sessions = await this.getStudySessions();
		const deck = await this.getDeckById(deckId);
		const deckIdentifiers = this.toNormalizedStringSet([deckId, deck?.path || ""]);
		return sessions.filter((session) =>
			this.getStudySessionDeckIdentifiers(session).some((identifier) =>
				deckIdentifiers.has(identifier)
			)
		);
	}

	// ============================================
	// 统计数据
	// ============================================

	/** 获取今日到期的旧版内容块。 */
	async getTodayDueBlocks(): Promise<IRBlock[]> {
		const blocks = await this.getAllBlocks();
		const today = new Date().toISOString().split("T")[0];

		return Object.values(blocks).filter((_block) => {
			if (_block.state === "new") return true;
			if (!_block.nextReview) return false;

			const reviewDate = _block.nextReview.split("T")[0];
			return reviewDate <= today;
		});
	}

	// ============================================
	// 文件操作辅助（使用 adapter 直接读写，绕过文件索引缓存）
	// ============================================

	/**
	 * 读取文件内容（使用 adapter 直接读取）
	 */
	private async readFile(path: string, defaultContent = "{}"): Promise<string> {
		try {
			const adapter = this.app.vault.adapter;

			// 检查文件是否存在
			const exists = await adapter.exists(path);

			if (exists) {
				const content = await adapter.read(path);
				return content;
			}

			// 文件不存在，创建并写入默认内容
			await this.writeFile(path, defaultContent);
			return defaultContent;
		} catch (error) {
			logger.warn(`[IRStorageService] 读取文件失败，返回默认值: ${path}`, error);
			return defaultContent;
		}
	}

	private async readOptionalFile(path: string): Promise<string | null> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(path))) {
				return null;
			}
			return await adapter.read(path);
		} catch (error) {
			logger.warn(`[IRStorageService] 读取可选文件失败: ${path}`, error);
			return null;
		}
	}

	/**
	 * 写入文件内容（使用 adapter 直接写入）
	 */
	private async writeFile(path: string, content: string): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;

			// 确保目录存在
			const dir = path.substring(0, path.lastIndexOf("/"));
			if (dir) {
				await this.ensureDirectory(dir);
			}

			// 直接写入文件
			await adapter.write(path, content);
		} catch (error) {
			logger.error(`[IRStorageService] 写入文件失败: ${path}`, error);
			throw error;
		}
	}

	// ============================================
	// 文件同步状态管理
	// ============================================

	/**
	 * 获取所有文件同步状态
	 */
	async getAllSyncStates(): Promise<Record<string, FileSyncState>> {
		await this.initialize();
		const defaultStore: IRSyncStateStore = { version: IR_STORAGE_VERSION, files: {} };
		const defaultContent = JSON.stringify(defaultStore);
		const localPath = this.getSyncStateStoragePath();
		const legacyPath = this.getLegacySyncStateStoragePath();
		const content =
			(await this.readOptionalFile(localPath)) ??
			(await this.readOptionalFile(legacyPath)) ??
			defaultContent;

		if (content === defaultContent && !(await this.app.vault.adapter.exists(localPath))) {
			await this.writeFile(localPath, content);
		}

		try {
			const parsed = parseJsonUnknown(content);
			if (!isRecord(parsed)) {
				return {};
			}
			const files = parsed.files;
			return isRecord(files) ? (files as IRSyncStateStore["files"]) : {};
		} catch {
			return { /* no-op */ };
		}
	}

	/**
	 * 获取单个文件的同步状态
	 */
	async getFileSyncState(filePath: string): Promise<FileSyncState | null> {
		await this.initialize();
		const states = await this.getAllSyncStates();
		return states[filePath] || null;
	}

	async saveFileSyncState(state: FileSyncState): Promise<void> {
		await this.initialize();
		const states = await this.getAllSyncStates();
		states[state.filePath] = state;
		await this.saveSyncStates(states);
	}

	async saveFileSyncStates(newStates: FileSyncState[]): Promise<void> {
		await this.initialize();
		const states = await this.getAllSyncStates();
		for (const state of newStates) {
			states[state.filePath] = state;
		}
		await this.saveSyncStates(states);
	}

	async deleteFileSyncState(filePath: string): Promise<void> {
		await this.initialize();
		const states = await this.getAllSyncStates();
		if (states[filePath]) {
			delete states[filePath];
			await this.saveSyncStates(states);
		}
	}

	private async saveSyncStates(states: Record<string, FileSyncState>): Promise<void> {
		const store: IRSyncStateStore = {
			version: IR_STORAGE_VERSION,
			files: states,
		};

		await this.writeFile(this.getSyncStateStoragePath(), JSON.stringify(store));
	}

	/**
	 * 检测文件是否需要同步（基于 mtime 和 size）
	 * @returns true 如果文件已变化需要同步
	 */
	async checkFileNeedsSync(
		filePath: string,
		currentMtime: number,
		currentSize: number
	): Promise<boolean> {
		const state = await this.getFileSyncState(filePath);

		if (!state) {
			// 新文件，需要同步
			return true;
		}

		// 比较 mtime 和 size
		if (state.mtime !== currentMtime || state.size !== currentSize) {
			return true;
		}

		return false;
	}

	/**
	 * 生成 UUID 列表哈希（用于快速检测块变化）
	 */
	generateUuidListHash(uuids: string[]): string {
		// 简单哈希：排序后连接，取前32位
		const sorted = [...uuids].sort();
		const combined = sorted.join("|");

		// 简单的 djb2 哈希算法
		let hash = 5381;
		for (let i = 0; i < combined.length; i++) {
			hash = (hash << 5) + hash + combined.charCodeAt(i);
			hash = hash & hash; // 转换为32位整数
		}

		return Math.abs(hash).toString(16).padStart(8, "0");
	}

	// ============================================
	// 数据完整性校验
	// ============================================

	/**
	 * 校验并清理悬空引用
	 * 用于插件启动时执行，确保数据完整性
	 *
	 * @returns 清理结果统计
	 */
	async validateAndCleanOrphanedReferences(): Promise<{
		orphanedBlockIds: number; // 清理的悬空内容块引用数
		orphanedSourceFiles: number; // 清理的悬空源文件引用数
		affectedDecks: number; // 受影响的牌组数
	}> {
		await this.initialize();

		const result = {
			orphanedBlockIds: 0,
			orphanedSourceFiles: 0,
			affectedDecks: 0,
		};

		// 获取所有有效的内容块ID
		const blocks = await this.getAllBlocks();
		const validBlockIds = new Set(Object.keys(blocks));

		// 获取所有有效的文件路径
		const validFilePaths = new Set<string>();
		for (const block of Object.values(blocks)) {
			if (block.filePath) {
				validFilePaths.add(block.filePath);
			}
		}

		// 检查每个牌组
		const decks = await this.getAllDecks();

		for (const deck of Object.values(decks)) {
			let deckModified = false;
			const originalBlockCount = deck.blockIds?.length || 0;
			const originalFileCount = deck.sourceFiles?.length || 0;

			// 清理悬空的 blockIds
			if (deck.blockIds && deck.blockIds.length > 0) {
				const validBlockIdsInDeck = deck.blockIds.filter((id) => validBlockIds.has(id));
				if (validBlockIdsInDeck.length < deck.blockIds.length) {
					result.orphanedBlockIds += deck.blockIds.length - validBlockIdsInDeck.length;
					deck.blockIds = validBlockIdsInDeck;
					deckModified = true;
				}
			}

			// 清理悬空的 sourceFiles
			if (deck.sourceFiles && deck.sourceFiles.length > 0) {
				// 检查每个源文件是否仍有内容块在牌组中
				const validSourceFiles = deck.sourceFiles.filter((_filePath) => {
					// 文件必须存在且在牌组中有对应的内容块
					return deck.blockIds?.some((id) => blocks[id]?.filePath === _filePath);
				});

				if (validSourceFiles.length < deck.sourceFiles.length) {
					result.orphanedSourceFiles += deck.sourceFiles.length - validSourceFiles.length;
					deck.sourceFiles = validSourceFiles;
					deckModified = true;
				}
			}

			// 保存修改
			if (deckModified) {
				deck.updatedAt = new Date().toISOString();
				await this.saveDeck(deck);
				result.affectedDecks++;

				logger.info(
					`[IRStorageService] 清理牌组 "${deck.name}" 的悬空引用: ` +
						`blockIds ${originalBlockCount} -> ${deck.blockIds?.length || 0}, ` +
						`sourceFiles ${originalFileCount} -> ${deck.sourceFiles?.length || 0}`
				);
			}
		}

		if (result.orphanedBlockIds > 0 || result.orphanedSourceFiles > 0) {
			logger.info(
				`[IRStorageService] 完整性校验完成: 清理 ${result.orphanedBlockIds} 个悬空内容块引用, ${result.orphanedSourceFiles} 个悬空源文件引用, 影响 ${result.affectedDecks} 个牌组`
			);
		} else {
			// 无悬空引用
		}

		return result;
	}

	/**
	 * 检查内容块是否存在对应的源文件
	 * 用于检测源文件被删除但内容块记录未清理的情况
	 *
	 * @returns 孤立内容块的ID列表
	 */
	async findOrphanedBlocks(): Promise<string[]> {
		await this.initialize();

		const blocks = await this.getAllBlocks();
		const orphanedIds: string[] = [];

		for (const [id, block] of Object.entries(blocks)) {
			if (!block.filePath) {
				orphanedIds.push(id);
				continue;
			}

			// 检查文件是否存在
			const file = this.app.vault.getAbstractFileByPath(block.filePath);
			if (!file || !(file instanceof TFile)) {
				orphanedIds.push(id);
			}
		}

		return orphanedIds;
	}

	/**
	 * 清理孤立内容块（源文件已删除）
	 *
	 * @returns 清理的内容块数量
	 */
	async cleanOrphanedBlocks(): Promise<number> {
		const orphanedIds = await this.findOrphanedBlocks();

		if (orphanedIds.length === 0) {
			return 0;
		}

		// 删除孤立内容块（级联删除会自动清理牌组引用）
		for (const id of orphanedIds) {
			await this.deleteBlock(id);
		}

		logger.info(`[IRStorageService] 清理 ${orphanedIds.length} 个孤立内容块（源文件已删除）`);

		return orphanedIds.length;
	}

	// ============================================
	// v5.0 文件化内容块方案存储
	// ============================================

	private async syncSourceMetadataToPointStorage(
		sourceList: import("../../types/ir-types").IRSourceFileMeta[],
		decks?: Record<string, IRDeck>
	): Promise<void> {
		if (!Array.isArray(sourceList) || sourceList.length === 0) {
			return;
		}

		const snapshots = await this.listChunkPointSnapshots();
		const resolvedDecks = decks || (await this.getAllDecks());
		const topicNamesById = this.buildTopicNamesByIdMap(resolvedDecks);
		const sourceById = Object.fromEntries(
			sourceList.map((source) => [String(source.sourceId || "").trim(), source] as const)
		);

		for (const snapshot of snapshots) {
			const sourceId = String(snapshot.point.materialId || "").trim();
			const source = sourceById[sourceId];
			if (!source) {
				continue;
			}

			const { chunk } = buildLegacyChunkFromPointSnapshot(snapshot);
			await this.getPointStorageService().syncChunkPoint(chunk, {
				source,
				topicNamesById,
			});
		}
	}

	/**
	 * 获取所有源材料元数据
	 */
	async getAllSources(): Promise<Record<string, import("../../types/ir-types").IRSourceFileMeta>> {
		await this.initialize();
		const { sources } = await this.projectRuntimeChunkStoresFromPoints();
		return this.mergeRuntimeSourceMetadata(sources);
	}

	/**
	 * 获取单个源材料元数据
	 */
	async getSource(
		sourceId: string
	): Promise<import("../../types/ir-types").IRSourceFileMeta | null> {
		const sources = await this.getAllSources();
		return sources[sourceId] || null;
	}

	/**
	 * 保存源材料元数据
	 */
	async saveSource(source: import("../../types/ir-types").IRSourceFileMeta): Promise<void> {
		await this.initialize();
		this.cacheRuntimeSourceMetadata([source]);
		await this.syncSourceMetadataToPointStorage([source]);
	}

	async saveSourceBatch(
		sourceList: import("../../types/ir-types").IRSourceFileMeta[]
	): Promise<void> {
		await this.initialize();
		this.cacheRuntimeSourceMetadata(sourceList);
		await this.syncSourceMetadataToPointStorage(sourceList);
	}

	/**
	 * 删除源材料元数据
	 */
	async deleteSource(sourceId: string): Promise<void> {
		await this.initialize();
		this.dropRuntimeSourceMetadata(sourceId);
	}

	/**
	 * 获取所有块文件调度数据
	 */
	async getAllChunkData(): Promise<Record<string, import("../../types/ir-types").IRChunkFileData>> {
		await this.initialize();
		return (await this.projectRuntimeChunkStoresFromPoints()).chunks;
	}

	/** 获取单个块文件的调度数据。 */
	async getChunkData(
		chunkId: string
	): Promise<import("../../types/ir-types").IRChunkFileData | null> {
		const chunks = await this.getAllChunkData();
		return chunks[chunkId] || null;
	}

	/** 保存单个块文件的调度数据。 */
	async saveChunkData(chunk: import("../../types/ir-types").IRChunkFileData): Promise<void> {
		await this.initialize();
		await this.syncChunkPointToNewStorage(chunk);
	}

	/** 批量保存块文件调度数据。 */
	async saveChunkDataBatch(
		chunkList: import("../../types/ir-types").IRChunkFileData[],
		options?: {
			sourcesById?: Record<string, import("../../types/ir-types").IRSourceFileMeta>;
			decks?: Record<string, IRDeck>;
		}
	): Promise<void> {
		logger.info(`[IRStorageService] ⚡ saveChunkDataBatch 开始: ${chunkList.length} 个块`);
		await this.initialize();
		await this.syncChunkPointsToNewStorage(chunkList, {
			sourcesById: options?.sourcesById,
			decks: options?.decks,
		});
	}

	/** 删除块文件调度数据，并清理相关来源记录。 */
	async deleteChunkData(chunkId: string): Promise<void> {
		await this.initialize();
		const chunks = await this.getAllChunkData();
		const deletedChunk = chunks[chunkId];
		if (!deletedChunk) {
			return;
		}

		const sourceId = deletedChunk.sourceId;
		const sources = sourceId ? await this.getAllSources() : {};
		const sourceMeta = sourceId ? sources[sourceId] : null;
		const chunkFilePath = typeof deletedChunk.filePath === "string" ? deletedChunk.filePath : "";
		const deletedChunkMeta = deletedChunk.meta as unknown as Record<string, unknown> | undefined;
		const isExternalDocument = deletedChunkMeta?.externalDocument === true;
		const sourcePath = sourceMeta?.originalPath || (isExternalDocument ? chunkFilePath : "");

		delete chunks[chunkId];

		const remainingChunks = Object.values(chunks);
		await this.removeChunkFromAllDecksAfterDeletion(chunkId, sourcePath, sourceId, remainingChunks);

		const hasRemainingChunksForSource = sourceId
			? remainingChunks.some((chunk) => chunk.sourceId === sourceId)
			: false;
		const hasRemainingExternalChunksForFile =
			isExternalDocument && chunkFilePath
				? remainingChunks.some((_chunk) => {
						const meta = _chunk.meta as unknown as Record<string, unknown> | undefined;
						return _chunk.filePath === chunkFilePath && meta?.externalDocument === true;
				  })
				: false;

		if (sourceId && sourceMeta && !hasRemainingChunksForSource) {
			this.dropRuntimeSourceMetadata(sourceId);
		}

		await this.deleteChunkPointFromNewStorage(chunkId);

		if (!sourcePath) {
			return;
		}

		try {
			await this.deleteFileSyncState(sourcePath);
		} catch (error) {
			logger.warn(`[IRStorageService] 清理源文件同步状态失败: ${sourcePath}`, error);
		}

		if (!sourcePath.endsWith(".md")) {
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) {
			return;
		}

		const shouldCleanupExternalDocument = isExternalDocument && !hasRemainingExternalChunksForFile;
		const shouldCleanupSourceDocument = !!sourceMeta && !hasRemainingChunksForSource;
		if (!shouldCleanupExternalDocument && !shouldCleanupSourceDocument) {
			return;
		}

		try {
			await this.cleanupMarkdownReadingFrontmatter(file, {
				addDeletedTag: true,
				removeExternalDocumentFields: shouldCleanupExternalDocument,
			});
		} catch (error) {
			logger.warn(
				`[IRStorageService] 清理已删除阅读点对应 Markdown frontmatter 失败: ${sourcePath}`,
				error
			);
		}
	}

	/** 获取某个源材料下的全部块调度数据。 */
	async getChunkDataBySource(
		sourceId: string
	): Promise<import("../../types/ir-types").IRChunkFileData[]> {
		const chunks = await this.getAllChunkData();
		return Object.values(chunks).filter((c) => c.sourceId === sourceId);
	}

	/** 获取仍在调度链路中的块数据。 */
	async getActiveChunkData(): Promise<import("../../types/ir-types").IRChunkFileData[]> {
		const chunks = await this.getAllChunkData();
		return Object.values(chunks).filter(
			(c) =>
				c.scheduleStatus !== "done" &&
				c.scheduleStatus !== "suspended" &&
				c.scheduleStatus !== "removed"
		);
	}

	/** 获取今天应进入队列的块调度数据。 */
	async getTodayDueChunkData(): Promise<import("../../types/ir-types").IRChunkFileData[]> {
		const chunks = await this.getAllChunkData();
		const now = Date.now();

		return Object.values(chunks).filter((_chunk) => {
			if (_chunk.scheduleStatus === "new") return true;
			if (
				_chunk.scheduleStatus === "done" ||
				_chunk.scheduleStatus === "suspended" ||
				_chunk.scheduleStatus === "removed"
			)
				return false;
			return _chunk.nextRepDate <= now;
		});
	}

	// ============================================
	// v5.4: 牌组标签相关方法
	// ============================================

	/**
	 * 根据牌组标签获取块调度数据
	 * @param deckTag 牌组标签，格式 #IR_deck_牌组名
	 */
	async getChunksByDeckTag(
		deckTag: string
	): Promise<import("../../types/ir-types").IRChunkFileData[]> {
		const chunks = await this.getAllChunkData();
		return Object.values(chunks).filter((c) => c.deckTag === deckTag);
	}

	/**
	 * 获取所有牌组标签列表（从 point 投影视图中提取）
	 */
	async getAllDeckTags(): Promise<string[]> {
		const chunks = await this.getAllChunkData();
		const tags = new Set<string>();
		for (const chunk of Object.values(chunks)) {
			if (chunk.deckTag) {
				tags.add(chunk.deckTag);
			}
		}
		return Array.from(tags);
	}

	// ============================================
	// v5.5: 从内容块文件 YAML 同步 deck_tag
	// ============================================

	/**
	 * 从内容块文件 YAML 读取 deck_tag
	 * @param filePath 块文件路径
	 * @returns deck_tag 值，如果读取失败返回 null
	 */
	async readDeckTagFromYAML(filePath: string): Promise<string | null> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(filePath))) {
				return null;
			}

			const content = await adapter.read(filePath);
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) return null;

			const yamlContent = yamlMatch[1];
			const deckTagMatch =
				yamlContent.match(/^topic_tag:\s*["']?([^"'\n]+)["']?\s*$/m) ||
				yamlContent.match(/^deck_tag:\s*["']?([^"'\n]+)["']?\s*$/m);

			if (deckTagMatch) {
				return deckTagMatch[1].trim();
			}

			return null;
		} catch (error) {
			logger.warn(`[IRStorageService] 读取块文件 deck_tag 失败: ${filePath}`, error);
			return null;
		}
	}

	/** 按 YAML 中的单牌组标签同步块记录。 */
	async syncDeckTagsFromYAML(): Promise<{ synced: number; removed: Map<string, string[]> }> {
		await this.initialize();

		const chunks = await this.getAllChunkData();
		const chunksToUpdate: import("../../types/ir-types").IRChunkFileData[] = [];
		const removedFromDecks = new Map<string, string[]>();

		for (const chunk of Object.values(chunks)) {
			const yamlDeckTag = await this.readDeckTagFromYAML(chunk.filePath);

			if (yamlDeckTag === null) {
				continue;
			}

			if (yamlDeckTag !== chunk.deckTag) {
				const oldDeckTag = chunk.deckTag;

				if (oldDeckTag && oldDeckTag !== yamlDeckTag) {
					if (!removedFromDecks.has(oldDeckTag)) {
						removedFromDecks.set(oldDeckTag, []);
					}
					removedFromDecks.get(oldDeckTag)?.push(chunk.chunkId);
				}

				chunk.deckTag = yamlDeckTag;
				chunk.updatedAt = Date.now();
				chunksToUpdate.push(chunk);
			}
		}

		if (chunksToUpdate.length > 0) {
			await this.saveChunkDataBatch(chunksToUpdate);
			logger.info(`[IRStorageService] 同步 ${chunksToUpdate.length} 个块的 deck_tag`);
		}

		return { synced: chunksToUpdate.length, removed: removedFromDecks };
	}

	/** 先同步 YAML 牌组数据，再返回最新块数据。 */
	async getAllChunkDataWithSync(): Promise<
		Record<string, import("../../types/ir-types").IRChunkFileData>
	> {
		await this.syncDeckDataFromYAML();
		return this.getAllChunkData();
	}

	// ============================================
	// v5.5: 多牌组支持与牌组验证
	// ============================================

	/** 从块文件 YAML 读取多牌组名称。 */
	async readDeckNamesFromYAML(filePath: string): Promise<string[] | null> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(filePath))) {
				return null;
			}

			const content = await adapter.read(filePath);
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) return null;

			const yamlContent = yamlMatch[1];

			const deckNamesMatch =
				yamlContent.match(/^topic_names:\s*$/m) || yamlContent.match(/^deck_names:\s*$/m);
			if (deckNamesMatch) {
				const arrayItems: string[] = [];
				const lines = yamlContent.split("\n");
				let inDeckNames = false;
				for (const line of lines) {
					if (line.match(/^topic_names:\s*$/) || line.match(/^deck_names:\s*$/)) {
						inDeckNames = true;
						continue;
					}
					if (inDeckNames) {
						if (line.match(/^\s+-\s+/)) {
							const item = line
								.replace(/^\s+-\s+/, "")
								.replace(/["']/g, "")
								.trim();
							if (item) arrayItems.push(item);
						} else if (!line.match(/^\s/)) {
							break;
						}
					}
				}
				if (arrayItems.length > 0) return arrayItems;
			}

			const inlineMatch =
				yamlContent.match(/^topic_names:\s*\[(.*)\]\s*$/m) ||
				yamlContent.match(/^deck_names:\s*\[(.*)\]\s*$/m);
			if (inlineMatch) {
				const items = inlineMatch[1]
					.split(",")
					.map((s) => s.replace(/["']/g, "").trim())
					.filter(Boolean);
				if (items.length > 0) return items;
			}

			const deckTagMatch =
				yamlContent.match(/^topic_tag:\s*["']?#?IR_deck_([^"'\n]+)["']?\s*$/m) ||
				yamlContent.match(/^deck_tag:\s*["']?#?IR_deck_([^"'\n]+)["']?\s*$/m);
			if (deckTagMatch) {
				return [deckTagMatch[1].trim()];
			}

			return null;
		} catch (error) {
			logger.warn(`[IRStorageService] 读取块文件 deck_names 失败: ${filePath}`, error);
			return null;
		}
	}

	/** 验证 YAML 中的牌组名称，并返回对应的有效牌组 ID。 */
	async validateDeckNames(deckNames: string[]): Promise<string[]> {
		const validDecks = await this.getAllDecks();
		const validDeckIds: string[] = [];

		for (const name of deckNames) {
			const matchedDeck = this.findDeckByDisplayName(validDecks, name);
			if (matchedDeck) {
				validDeckIds.push(matchedDeck.id);
			} else {
				logger.warn(`[IRStorageService] 牌组名称无效（未在插件中创建）: ${name}`);
			}
		}

		return validDeckIds;
	}

	/** 根据牌组 ID 获取牌组名称。 */
	async getDeckNameById(deckId: string): Promise<string | null> {
		const decks = await this.getAllDecks();
		const deck = decks[deckId];
		return deck ? deck.name : null;
	}

	/** 根据牌组名称获取牌组 ID。 */
	async getDeckIdByName(deckName: string): Promise<string | null> {
		const decks = await this.getAllDecks();
		const deck = this.findDeckByDisplayName(decks, deckName);
		return deck ? deck.id : null;
	}

	/** 按 YAML 中的多牌组定义同步块的牌组数据。 */
	async syncDeckDataFromYAML(): Promise<{ synced: number; invalidDecks: string[] }> {
		await this.initialize();

		const chunks = await this.getAllChunkData();
		const decks = await this.getAllDecks();
		const chunksToUpdate: import("../../types/ir-types").IRChunkFileData[] = [];
		const invalidDecks = new Set<string>();

		for (const chunk of Object.values(chunks)) {
			const yamlDeckNames = await this.readDeckNamesFromYAML(chunk.filePath);

			if (yamlDeckNames === null) {
				continue;
			}

			const validDeckIds = yamlDeckNames
				.map((name) => this.findDeckByDisplayName(decks, name)?.id)
				.filter((deckId): deckId is string => typeof deckId === "string" && deckId.length > 0);

			for (const name of yamlDeckNames) {
				const isValid = this.findDeckByDisplayName(decks, name);
				if (!isValid) {
					invalidDecks.add(name);
				}
			}

			const currentDeckIds = chunk.deckIds || [];
			const needsUpdate = !this.arraysEqual(validDeckIds, currentDeckIds);

			if (needsUpdate) {
				this.assignChunkDecks(chunk, validDeckIds, decks);
				chunk.updatedAt = Date.now();
				chunksToUpdate.push(chunk);
			}
		}

		if (chunksToUpdate.length > 0) {
			await this.saveChunkDataBatch(chunksToUpdate);
			logger.info(`[IRStorageService] 同步 ${chunksToUpdate.length} 个块的牌组数据`);
		}

		return { synced: chunksToUpdate.length, invalidDecks: Array.from(invalidDecks) };
	}

	/** 比较两个字符串数组在忽略顺序后是否相等。 */
	private arraysEqual(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false;
		const sortedA = [...a].sort();
		const sortedB = [...b].sort();
		return sortedA.every((val, i) => val === sortedB[i]);
	}

	/** 更新内容块的牌组集合，并同步块文件 YAML。 */
	async updateChunkDecks(chunkId: string, deckIds: string[]): Promise<void> {
		const chunks = await this.getAllChunkData();
		const chunk = chunks[chunkId];
		if (!chunk) {
			throw new Error(`块不存在: ${chunkId}`);
		}

		const validDecks = await this.getAllDecks();
		const validIds = deckIds.filter((id) => validDecks[id]);

		this.assignChunkDecks(chunk, validIds, validDecks);
		chunk.updatedAt = Date.now();

		const deckNames = validIds.map((id) => validDecks[id]?.name).filter(Boolean);
		await this.updateChunkFileYAMLDeckNames(chunk.filePath, deckNames);
		await this.syncChunkPointToNewStorage(chunk, validDecks);

		logger.info(`[IRStorageService] 更新块牌组: ${chunkId}, 牌组数: ${validIds.length}`);
	}

	/** 向内容块追加一个牌组。 */
	async addDeckToChunk(chunkId: string, deckId: string): Promise<void> {
		const chunks = await this.getAllChunkData();
		const chunk = chunks[chunkId];
		if (!chunk) {
			throw new Error(`块不存在: ${chunkId}`);
		}

		const currentDeckIds = chunk.deckIds || [];
		if (!currentDeckIds.includes(deckId)) {
			await this.updateChunkDecks(chunkId, [...currentDeckIds, deckId]);
		}
	}

	/** 把多牌组信息写回块文件 YAML。 */
	private async updateChunkFileYAMLDeckNames(filePath: string, deckNames: string[]): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(filePath))) {
			return;
		}

		const content = await adapter.read(filePath);
		const yaml = parseYAMLFromContent(content);
		if (!isRecord(yaml) || yaml.weave_type !== "ir-chunk") {
			return;
		}

		const normalizeDeckNameForTag = (name: string): string => {
			return (
				String(name || "")
					.trim()
					.replace(/[\s/\\#]+/g, "_")
					.replace(/_+/g, "_")
					.replace(/^_+|_+$/g, "") || "未分配"
			);
		};

		const names = (Array.isArray(deckNames) ? deckNames : [])
			.map((n) => String(n).trim())
			.filter(Boolean);
		const primaryName = names[0] || "未分配";

		let nextContent = content;
		nextContent = setCardProperty(nextContent, "topic_names", names.length > 0 ? names : undefined);
		nextContent = setCardProperty(nextContent, "deck_names", undefined);

		const rawTags = isRecord(yaml) ? yaml.tags : undefined;
		const tagsArr = Array.isArray(rawTags)
			? rawTags.map((t: unknown) => String(t).trim()).filter(Boolean)
			: typeof rawTags === "string" && rawTags.trim()
			? [rawTags.trim()]
			: [];
		const tags = new Set<string>(tagsArr);

		tags.add("ir/deck");
		for (const t of Array.from(tags)) {
			if (t.startsWith("ir/deck/") && t !== "ir/deck") {
				tags.delete(t);
			}
		}

		for (const n of names) {
			const seg = normalizeDeckNameForTag(n);
			tags.add(`ir/deck/${seg}`);
		}

		nextContent = setCardProperty(nextContent, "tags", Array.from(tags));

		nextContent = setCardProperty(nextContent, "topic_tag", `#IR_deck_${primaryName}`);
		nextContent = setCardProperty(nextContent, "deck_tag", undefined);

		if (nextContent !== content) {
			await adapter.write(filePath, nextContent);
		}
	}

	/** 获取可供 UI 展示的正式牌组列表。 */
	async getValidDeckList(): Promise<Array<{ id: string; name: string }>> {
		const decks = await this.getAllDecks();
		return Object.values(decks).map((d) => ({ id: d.id, name: d.name }));
	}

	/** 按显示名称查找牌组，兼容 `#IR_deck_` 前缀。 */
	private findDeckByDisplayName(
		decks: Record<string, IRDeck>,
		deckName: string
	): IRDeck | null {
		const normalizedName = String(deckName || "").trim().replace(/^#IR_deck_/, "");
		if (!normalizedName) {
			return null;
		}

		return Object.values(decks).find((deck) => deck.name === normalizedName) || null;
	}

	/** 把牌组 ID 集合同步到块的兼容字段。 */
	private assignChunkDecks(
		chunk: import("../../types/ir-types").IRChunkFileData,
		deckIds: string[],
		decks: Record<string, IRDeck>
	): void {
		chunk.topicIds = deckIds;
		chunk.deckIds = deckIds;

		const primaryDeckName = deckIds.length > 0 ? decks[deckIds[0]]?.name : undefined;
		const primaryDeckTag = primaryDeckName ? `#IR_deck_${primaryDeckName}` : undefined;
		chunk.topicTag = primaryDeckTag;
		chunk.deckTag = primaryDeckTag;
	}

	// ============================================
	// 数据完整性检查与清理
	// ============================================

	/** 清理指向不存在文件的块调度数据。 */
	async cleanupInvalidChunks(): Promise<{ removed: number; invalidPaths: string[] }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		const chunks = await this.getAllChunkData();
		const invalidChunkIds: string[] = [];
		const invalidPaths: string[] = [];

		for (const [chunkId, chunk] of Object.entries(chunks)) {
			if (typeof chunk.filePath !== "string" || chunk.filePath.trim() === "") {
				invalidChunkIds.push(chunkId);
				invalidPaths.push(String((chunk as unknown).filePath));
				continue;
			}

			const exists = await adapter.exists(chunk.filePath);
			if (!exists) {
				invalidChunkIds.push(chunkId);
				invalidPaths.push(chunk.filePath);
			}
		}

		if (invalidChunkIds.length > 0) {
			for (const chunkId of invalidChunkIds) {
				delete chunks[chunkId];
			}
			for (const chunkId of invalidChunkIds) {
				await this.deleteChunkPointFromNewStorage(chunkId);
			}

			logger.info(`[IRStorageService] 清理了 ${invalidChunkIds.length} 个无效块`);
		}

		return { removed: invalidChunkIds.length, invalidPaths };
	}

	/** 递归列出目录下的所有文件路径。 */
	private async listFilesRecursively(dir: string): Promise<string[]> {
		const adapter = this.app.vault.adapter;
		const result: string[] = [];
		try {
			const listed = await adapter.list(dir);
			for (const file of listed.files) {
				result.push(file);
			}
			for (const sub of listed.folders) {
				const nested = await this.listFilesRecursively(sub);
				for (const file of nested) {
					result.push(file);
				}
			}
		} catch {
			return result;
		}

		return result;
	}

	/** 精简 IR Markdown 文件 frontmatter 中已不再需要的字段。 */
	async slimIRMarkdownFrontmatter(
		scanRoot?: string
	): Promise<{ updated: number; scanned: number }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		const root = resolveIRImportFolder(scanRoot);
		const files = await this.listFilesRecursively(root);

		let updated = 0;
		let scanned = 0;

		for (const filePath of files) {
			if (!filePath.endsWith(".md")) continue;
			scanned++;

			let content: string;
			try {
				content = await adapter.read(filePath);
			} catch {
				continue;
			}

			if (!content.startsWith("---")) continue;
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) continue;

			const yaml = yamlMatch[1];
			const isChunk = yaml.includes("weave_type: ir-chunk");
			const isIndex = yaml.includes("weave_type: ir-index");
			if (!isChunk && !isIndex) continue;

			let newYaml = yaml;
			if (isChunk) {
				newYaml = newYaml
					.replace(/^tag_group:.*$\n?/gm, "")
					.replace(/^chunk_order:.*$\n?/gm, "")
					.replace(/^priority_reason:.*$\n?/gm, "");
			}
			if (isIndex) {
				newYaml = newYaml.replace(/^tag_group:.*$\n?/gm, "").replace(/^created_at:.*$\n?/gm, "");
			}

			newYaml = newYaml.replace(/\n{3,}/g, "\n\n").trim();
			if (newYaml === yaml.trim()) continue;

			const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${newYaml}\n---`);
			try {
				await adapter.write(filePath, newContent);
				updated++;
			} catch { /* no-op */ }
		}

		return { updated, scanned };
	}

	/** 删除没有对应 chunk/source 记录的孤儿块文件。 */
	async cleanupOrphanChunkFiles(scanRoot?: string): Promise<{ removed: number }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		const chunks = await this.getAllChunkData();
		const sources = await this.getAllSources();
		const knownChunkIds = new Set(Object.keys(chunks));
		const knownSourceIds = new Set(Object.keys(sources));

		const chunkRoot = resolveIRImportFolder(scanRoot);
		const files = await this.listFilesRecursively(chunkRoot);
		let removed = 0;

		for (const filePath of files) {
			if (!filePath.endsWith(".md")) continue;
			let content: string;
			try {
				content = await adapter.read(filePath);
			} catch {
				continue;
			}

			if (!content.startsWith("---")) continue;
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) continue;
			const yaml = yamlMatch[1];

			if (yaml.includes("weave_type: ir-chunk")) {
				const idMatch = yaml.match(/^chunk_id:\s*(["']?)([^\n"']+)\1\s*$/m);
				if (!idMatch) continue;
				const chunkId = idMatch[2].trim();
				if (!knownChunkIds.has(chunkId)) {
					try {
						await adapter.remove(filePath);
						removed++;
					} catch { /* no-op */ }
				}
			} else if (yaml.includes("weave_type: ir-index")) {
				const idMatch = yaml.match(/^source_id:\s*(["']?)([^\n"']+)\1\s*$/m);
				if (!idMatch) continue;
				const sourceId = idMatch[2].trim();
				const hasChunks = Object.values(chunks).some((c) => c.sourceId === sourceId);
				if (!knownSourceIds.has(sourceId) && !hasChunks) {
					try {
						await adapter.remove(filePath);
						removed++;
					} catch { /* no-op */ }
				}
			}
		}

		return { removed };
	}

	private addMarkdownReferencePath(target: Set<string>, candidate: unknown): void {
		if (typeof candidate !== "string") {
			return;
		}
		const normalized = normalizePath(candidate.trim());
		if (!normalized || !normalized.toLowerCase().endsWith(".md")) {
			return;
		}
		target.add(normalized);
	}

	private isDeletedReadableMarkdownContent(content: string): boolean {
		const yaml = parseYAMLFromContent(content);
		const normalizedTags = new Set(
			(
				Array.isArray(yaml?.tags)
					? yaml.tags
					: typeof yaml?.tags === "string"
						? String(yaml.tags)
								.split(",")
								.map((tag) => tag.trim())
						: []
			)
				.map((tag) => String(tag || "").trim().replace(/^#/, "").toLowerCase())
				.filter(Boolean)
		);

		if (normalizedTags.has("we_已删除") || normalizedTags.has("we_deleted")) {
			return true;
		}

		return (
			/(^|\s)#we_已删除(?=\s|$)/m.test(content) || /(^|\s)#we_deleted(?=\s|$)/im.test(content)
		);
	}

	private async collectReferencedReadableMarkdownPaths(): Promise<Set<string>> {
		const referencedPaths = new Set<string>();

		try {
			const decks = await this.getAllDecks();
			for (const deck of Object.values(decks)) {
				for (const sourceFile of deck.sourceFiles || []) {
					this.addMarkdownReferencePath(referencedPaths, sourceFile);
				}
			}
		} catch (error) {
			logger.warn("[IRStorageService] 收集专题引用的 Markdown 路径失败", error);
		}

		try {
			const chunks = await this.getAllChunkData();
			for (const chunk of Object.values(chunks)) {
				this.addMarkdownReferencePath(referencedPaths, chunk.filePath);
			}
		} catch (error) {
			logger.warn("[IRStorageService] 收集旧 chunk Markdown 路径失败", error);
		}

		try {
			const sources = await this.getAllSources();
			for (const source of Object.values(sources)) {
				this.addMarkdownReferencePath(referencedPaths, source.originalPath);
				this.addMarkdownReferencePath(referencedPaths, source.rawFilePath);
				this.addMarkdownReferencePath(referencedPaths, source.indexFilePath);
			}
		} catch (error) {
			logger.warn("[IRStorageService] 收集旧 source Markdown 路径失败", error);
		}

		try {
			const snapshots = await this.getPointStorageService().listPointSnapshots();
			for (const snapshot of snapshots) {
				const point = snapshot.point;
				this.addMarkdownReferencePath(referencedPaths, point.source?.path);

				const metadata = point.metadata && typeof point.metadata === "object" ? point.metadata : {};
				for (const key of ["sourcePath", "chunkFilePath", "filePath", "rawFilePath", "indexFilePath"]) {
					this.addMarkdownReferencePath(
						referencedPaths,
						(metadata)[key]
					);
				}

				const locator =
					point.trace?.locator && typeof point.trace.locator === "object"
						? (point.trace.locator)
						: {};
				for (const key of ["sourcePath", "chunkFilePath", "filePath", "rawFilePath", "indexFilePath"]) {
					this.addMarkdownReferencePath(referencedPaths, locator[key]);
				}
			}
		} catch (error) {
			logger.warn("[IRStorageService] 收集新 points Markdown 路径失败", error);
		}

		return referencedPaths;
	}

	async inspectDeletedReadableMarkdownResidue(
		scanRoot?: string
	): Promise<{ count: number; files: string[] }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;
		const root = resolveIRImportFolder(scanRoot);
		if (!(await adapter.exists(root))) {
			return { count: 0, files: [] };
		}

		const referencedPaths = await this.collectReferencedReadableMarkdownPaths();
		const files = await this.listFilesRecursively(root);
		const residue: string[] = [];

		for (const filePath of files) {
			const normalizedPath = normalizePath(filePath);
			if (!normalizedPath.toLowerCase().endsWith(".md")) {
				continue;
			}
			if (referencedPaths.has(normalizedPath)) {
				continue;
			}

			try {
				const content = await adapter.read(normalizedPath);
				if (this.isDeletedReadableMarkdownContent(content)) {
					residue.push(normalizedPath);
				}
			} catch (error) {
				logger.warn(`[IRStorageService] 检查旧 IR Markdown 残留失败: ${normalizedPath}`, error);
			}
		}

		return {
			count: residue.length,
			files: residue.sort((left, right) => left.localeCompare(right, "zh-CN")),
		};
	}

	async cleanupDeletedReadableMarkdownResidue(scanRoot?: string): Promise<{
		removed: number;
		files: string[];
		failures: Array<{ path: string; message: string }>;
	}> {
		await this.initialize();
		const adapter = this.app.vault.adapter;
		const root = resolveIRImportFolder(scanRoot);
		const inspection = await this.inspectDeletedReadableMarkdownResidue(root);
		const removedFiles: string[] = [];
		const failures: Array<{ path: string; message: string }> = [];

		for (const filePath of inspection.files) {
			try {
				await adapter.remove(filePath);
				removedFiles.push(filePath);
			} catch (error) {
				failures.push({
					path: filePath,
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// 默认旧 IR 导入目录已经属于弃用结构，清空后应一并删除；
		// 若调用方显式传入自定义扫描根，则保留根目录，避免误删用户自定义容器目录。
		await DirectoryUtils.pruneEmptyDirsUnder(adapter as unknown, root, {
			preserveRoot: Boolean(scanRoot && String(scanRoot).trim()),
		});

		return {
			removed: removedFiles.length,
			files: removedFiles,
			failures,
		};
	}

	/** 清理指向不存在源文件的 legacy block 兼容数据。 */
	async cleanupInvalidBlocks(): Promise<{ removed: number; invalidPaths: string[] }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		const blocks = await this.getAllBlocks();
		const invalidBlockIds: string[] = [];
		const invalidPaths: string[] = [];

		for (const [blockId, block] of Object.entries(blocks)) {
			if (
				typeof (block as unknown).filePath !== "string" ||
				String((block as unknown).filePath).trim() === ""
			) {
				invalidBlockIds.push(blockId);
				invalidPaths.push(String((block as unknown).filePath));
				continue;
			}

			const exists = await adapter.exists(block.filePath);
			if (!exists) {
				invalidBlockIds.push(blockId);
				invalidPaths.push(block.filePath);
			}
		}

		if (invalidBlockIds.length > 0) {
			for (const blockId of invalidBlockIds) {
				await this.getPointStorageService().deletePointByLegacyId(blockId);
			}

			logger.info(`[IRStorageService] 清理了 ${invalidBlockIds.length} 个无效 legacy block 兼容点`);
		}

		return { removed: invalidBlockIds.length, invalidPaths };
	}

	/** 清理既没有索引文件也没有关联块的源材料记录。 */
	async cleanupInvalidSources(): Promise<{ removed: number }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		const sources = await this.getAllSources();
		const chunks = await this.getAllChunkData();
		const invalidSourceIds: string[] = [];

		for (const [sourceId, source] of Object.entries(sources)) {
			const indexExists = source.indexFilePath ? await adapter.exists(source.indexFilePath) : false;
			const hasChunks = Object.values(chunks).some((c) => c.sourceId === sourceId);

			if (!indexExists && !hasChunks) {
				invalidSourceIds.push(sourceId);
			}
		}

		if (invalidSourceIds.length > 0) {
			for (const sourceId of invalidSourceIds) {
				delete sources[sourceId];
				this.dropRuntimeSourceMetadata(sourceId);
			}

			logger.info(`[IRStorageService] 清理了 ${invalidSourceIds.length} 个无效源材料`);
		}

		return { removed: invalidSourceIds.length };
	}

	/** 执行完整的数据完整性检查和清理。 */
	async performIntegrityCheck(scanRoot?: string): Promise<{
		chunksRemoved: number;
		blocksRemoved: number;
		sourcesRemoved: number;
	}> {
		logger.info("[IRStorageService] 开始数据完整性检查...");

		const chunksResult = await this.cleanupInvalidChunks();
		const blocksResult = await this.cleanupInvalidBlocks();
		const sourcesResult = await this.cleanupInvalidSources();

		const orphanFilesResult = await this.cleanupOrphanChunkFiles(scanRoot);
		if (orphanFilesResult.removed > 0) {
			logger.info(`[IRStorageService] 清理了 ${orphanFilesResult.removed} 个孤儿块文件`);
		}

		const total = chunksResult.removed + blocksResult.removed + sourcesResult.removed;
		if (total > 0) {
			logger.info(`[IRStorageService] 数据完整性检查完成，共清理 ${total} 个无效数据`);
		}

		return {
			chunksRemoved: chunksResult.removed,
			blocksRemoved: blocksResult.removed,
			sourcesRemoved: sourcesResult.removed,
		};
	}

	/** 先做完整性检查，再返回最新块数据。 */
	async getAllChunkDataWithIntegrityCheck(
		scanRoot?: string
	): Promise<Record<string, import("../../types/ir-types").IRChunkFileData>> {
		await this.performIntegrityCheck(scanRoot);
		await this.syncDeckDataFromYAML();
		return this.getAllChunkData();
	}
}
