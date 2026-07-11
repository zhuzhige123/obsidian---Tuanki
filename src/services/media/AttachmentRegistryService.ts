import { TFile } from "obsidian";
import {
	getAttachmentRegistryPath,
	getMediaManifestPath,
	getV2Paths,
} from "../../config/paths";
import type { Card } from "../../data/types";
import type { WeavePlugin } from "../../main";
import {
	buildAttachmentRegistryMarkdown,
	extractMediaVaultPathsFromContent,
	extractMediaVaultPathsFromRegistryMarkdown,
	isMediaVaultPath,
	normalizeMediaVaultPath,
} from "../../utils/media-reference-extractor";
import {
	buildVaultMediaBasenameIndex,
	repairMediaReferencesInContent,
	resolveExistingMediaVaultPath,
	type UnresolvedMediaReferenceStrategy,
} from "../../utils/media-vault-path-resolver";
import { logger } from "../../utils/logger";
import { isRecord, parseJsonUnknown } from "../../utils/typed-json";
import { safeWriteJson } from "../../utils/safe-json-io";
import { ensureVaultTextFile } from "../../utils/vault-write-guard";
import { DirectoryUtils } from "../../utils/directory-utils";
import { readWeaveParentFolder } from "../../utils/weave-plugin-settings";

export interface AttachmentRegistryScanResult {
	referencedPaths: Set<string>;
	registryPaths: Set<string>;
	brokenPaths: string[];
	rewritablePaths: Array<{ rawPath: string; canonicalPath: string }>;
	orphanWeaveMediaPaths: string[];
	isRegistryStale: boolean;
}

export interface AttachmentRegistryRepairResult {
	cardsUpdated: number;
	pathsNormalized: number;
	pathsPlaceholdered: number;
	pathsRemoved: number;
	manifestPathsNormalized: number;
	registryRebuilt: boolean;
}

export { getAttachmentRegistryAutoFixIssueCount } from "./attachment-registry-issues";

export class AttachmentRegistryService {
	private rebuildTimer: number | undefined;
	private rebuildChain: Promise<void> = Promise.resolve();
	private unsubscribeCards: (() => void) | null = null;

	constructor(private readonly plugin: WeavePlugin) {}

	initialize(): void {
		if (this.unsubscribeCards) {
			return;
		}

		this.unsubscribeCards = this.plugin.dataSyncService.subscribe(
			"cards",
			() => {
				this.scheduleRebuild("cards_changed");
			},
			{ debounce: 2000 }
		);

		void this.rebuildIfNeeded();
	}

	destroy(): void {
		if (this.rebuildTimer !== undefined) {
			window.clearTimeout(this.rebuildTimer);
			this.rebuildTimer = undefined;
		}

		this.unsubscribeCards?.();
		this.unsubscribeCards = null;
	}

	scheduleRebuild(reason = "manual"): void {
		if (this.rebuildTimer !== undefined) {
			window.clearTimeout(this.rebuildTimer);
		}

		this.rebuildTimer = window.setTimeout(() => {
			this.rebuildTimer = undefined;
			void this.rebuild({ reason });
		}, 500);
	}

	async rebuildIfNeeded(): Promise<void> {
		const scan = await this.scan();
		if (scan.isRegistryStale || scan.registryPaths.size === 0) {
			await this.rebuild({ reason: "startup_or_stale" });
		}
	}

	async rebuild(options?: { reason?: string }): Promise<void> {
		const run = this.rebuildChain.then(() => this.rebuildInternal(options?.reason));
		this.rebuildChain = run.catch(() => undefined);
		return run;
	}

	private async rebuildInternal(reason?: string): Promise<void> {
		const referencedPaths = await this.collectCanonicalReferencedPaths();
		const registryPath = getAttachmentRegistryPath(readWeaveParentFolder(this.plugin));
		const markdown = buildAttachmentRegistryMarkdown(referencedPaths);

		try {
			const adapter = this.plugin.app.vault.adapter;
			await DirectoryUtils.ensureDirForFile(adapter, registryPath);
			await ensureVaultTextFile(this.plugin.app.vault, registryPath, markdown);

			logger.debug(
				`[AttachmentRegistryService] 已更新附件索引 (${referencedPaths.size} 项, reason=${reason ?? "unknown"})`
			);
		} catch (error) {
			logger.error("[AttachmentRegistryService] 更新附件索引失败:", error);
		}
	}

	async scan(): Promise<AttachmentRegistryScanResult> {
		const contextPath = this.getContextPath();
		const referencedPaths = await this.collectReferencedPaths();
		const registryPaths = await this.readRegistryPaths();
		const basenameIndex = buildVaultMediaBasenameIndex(this.plugin.app);
		const brokenPaths: string[] = [];
		const rewritablePaths: Array<{ rawPath: string; canonicalPath: string }> = [];
		const canonicalReferencedPaths = new Set<string>();

		for (const path of referencedPaths) {
			const canonicalPath = await resolveExistingMediaVaultPath(
				this.plugin.app,
				path,
				contextPath,
				{ basenameIndex }
			);
			if (!canonicalPath) {
				brokenPaths.push(path);
				continue;
			}

			canonicalReferencedPaths.add(canonicalPath);
			if (canonicalPath !== path) {
				rewritablePaths.push({ rawPath: path, canonicalPath });
			}
		}

		const orphanWeaveMediaPaths = await this.findOrphanWeaveMediaFiles(canonicalReferencedPaths);
		const isRegistryStale = !this.arePathSetsEqual(canonicalReferencedPaths, registryPaths);

		return {
			referencedPaths: canonicalReferencedPaths,
			registryPaths,
			brokenPaths,
			rewritablePaths,
			orphanWeaveMediaPaths,
			isRegistryStale,
		};
	}

	async repairReferences(options?: {
		reason?: string;
		unresolvedStrategy?: UnresolvedMediaReferenceStrategy;
	}): Promise<AttachmentRegistryRepairResult> {
		const contextPath = this.getContextPath();
		const basenameIndex = buildVaultMediaBasenameIndex(this.plugin.app);
		const resolutionOptions = {
			basenameIndex,
			unresolvedStrategy: options?.unresolvedStrategy ?? "leave",
		};
		const cards = await this.plugin.dataStorage.getCards();
		const cardsToSave: Card[] = [];
		let pathsNormalized = 0;
		let pathsPlaceholdered = 0;
		let pathsRemoved = 0;

		for (const card of cards) {
			let nextContent = card.content || "";
			const nextFields = card.fields ? { ...card.fields } : undefined;
			let changed = false;

			const contentRepair = await repairMediaReferencesInContent(
				this.plugin.app,
				nextContent,
				contextPath,
				resolutionOptions
			);
			nextContent = contentRepair.text;
			pathsNormalized += contentRepair.pathsNormalized;
			pathsPlaceholdered += contentRepair.pathsPlaceholdered;
			pathsRemoved += contentRepair.pathsRemoved;
			if (contentRepair.changed) {
				changed = true;
			}

			if (nextFields) {
				for (const [key, value] of Object.entries(nextFields)) {
					if (typeof value !== "string") {
						continue;
					}
					const fieldRepair = await repairMediaReferencesInContent(
						this.plugin.app,
						value,
						contextPath,
						resolutionOptions
					);
					nextFields[key] = fieldRepair.text;
					pathsNormalized += fieldRepair.pathsNormalized;
					pathsPlaceholdered += fieldRepair.pathsPlaceholdered;
					pathsRemoved += fieldRepair.pathsRemoved;
					if (fieldRepair.changed) {
						changed = true;
					}
				}
			}

			if (!changed) {
				continue;
			}

			cardsToSave.push({
				...card,
				content: nextContent,
				...(nextFields ? { fields: nextFields } : {}),
			});
		}

		let cardsUpdated = 0;
		if (cardsToSave.length > 0) {
			if (typeof this.plugin.dataStorage.saveCardsBatch === "function") {
				await this.plugin.dataStorage.saveCardsBatch(cardsToSave);
				cardsUpdated = cardsToSave.length;
			} else {
				for (const card of cardsToSave) {
					const saveResult = await this.plugin.dataStorage.saveCard(card);
					if (!saveResult.success) {
						throw new Error(saveResult.error || `保存卡片失败: ${card.uuid}`);
					}
					cardsUpdated += 1;
				}
			}
		}

		const qbankRepair = await this.repairQuestionBankReferences(contextPath, resolutionOptions);
		pathsNormalized += qbankRepair.pathsNormalized;
		pathsPlaceholdered += qbankRepair.pathsPlaceholdered;
		pathsRemoved += qbankRepair.pathsRemoved;

		const manifestPathsNormalized = await this.repairManifestSavedPaths(
			contextPath,
			resolutionOptions
		);
		pathsNormalized += manifestPathsNormalized;

		await this.rebuild({ reason: options?.reason ?? "repair_references" });

		return {
			cardsUpdated,
			pathsNormalized,
			pathsPlaceholdered,
			pathsRemoved,
			manifestPathsNormalized,
			registryRebuilt: true,
		};
	}

	private async repairManifestSavedPaths(
		contextPath: string,
		resolutionOptions: {
			basenameIndex: ReturnType<typeof buildVaultMediaBasenameIndex>;
			unresolvedStrategy?: UnresolvedMediaReferenceStrategy;
		}
	): Promise<number> {
		let normalizedCount = 0;
		const adapter = this.plugin.app.vault.adapter;

		for (const manifestPath of await this.listMediaManifestFilePaths()) {
			try {
				const raw = await adapter.read(manifestPath);
				const parsed = parseJsonUnknown(raw);
				if (!isRecord(parsed) || !Array.isArray(parsed.files)) {
					continue;
				}

				let changed = false;
				for (const entry of parsed.files) {
					if (!isRecord(entry)) {
						continue;
					}

					const savedPath = typeof entry.savedPath === "string" ? entry.savedPath : "";
					if (!savedPath || !isMediaVaultPath(savedPath)) {
						continue;
					}

					const canonicalPath = await resolveExistingMediaVaultPath(
						this.plugin.app,
						savedPath,
						contextPath,
						resolutionOptions
					);
					if (!canonicalPath || canonicalPath === normalizeMediaVaultPath(savedPath)) {
						continue;
					}

					entry.savedPath = canonicalPath;
					changed = true;
					normalizedCount += 1;
				}

				if (!changed) {
					continue;
				}

				await safeWriteJson(
					adapter,
					manifestPath,
					`${JSON.stringify(parsed, null, 2)}\n`,
					this.plugin.app
				);
			} catch (error) {
				logger.debug(
					`[AttachmentRegistryService] 修复媒体清单 savedPath 失败: ${manifestPath}`,
					error
				);
			}
		}

		return normalizedCount;
	}

	private async listMediaManifestFilePaths(): Promise<string[]> {
		const v2Paths = getV2Paths(readWeaveParentFolder(this.plugin));
		const adapter = this.plugin.app.vault.adapter;
		const manifestPaths: string[] = [];

		if (!(await adapter.exists(v2Paths.memory.media))) {
			return manifestPaths;
		}

		try {
			const listing = await adapter.list(v2Paths.memory.media);
			for (const folderPath of listing.folders || []) {
				for (const manifestPath of [
					getMediaManifestPath(folderPath),
					getMediaManifestPath(folderPath, true),
				]) {
					if (await adapter.exists(manifestPath)) {
						manifestPaths.push(manifestPath);
					}
				}
			}
		} catch (error) {
			logger.debug("[AttachmentRegistryService] 扫描媒体清单路径失败:", error);
		}

		return Array.from(new Set(manifestPaths));
	}

	private async repairQuestionBankReferences(
		contextPath: string,
		resolutionOptions: {
			basenameIndex: ReturnType<typeof buildVaultMediaBasenameIndex>;
			unresolvedStrategy?: UnresolvedMediaReferenceStrategy;
		}
	): Promise<{
		pathsNormalized: number;
		pathsPlaceholdered: number;
		pathsRemoved: number;
	}> {
		let pathsNormalized = 0;
		let pathsPlaceholdered = 0;
		let pathsRemoved = 0;

		for (const filePath of await this.listQuestionBankFilePaths()) {
			try {
				const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
				if (!(file instanceof TFile)) {
					continue;
				}

				const raw = await this.plugin.app.vault.read(file);
				const repaired = await repairMediaReferencesInContent(
					this.plugin.app,
					raw,
					contextPath,
					resolutionOptions
				);
				if (!repaired.changed) {
					continue;
				}

				await this.plugin.app.vault.modify(file, repaired.text);
				pathsNormalized += repaired.pathsNormalized;
				pathsPlaceholdered += repaired.pathsPlaceholdered;
				pathsRemoved += repaired.pathsRemoved;
			} catch (error) {
				logger.debug(`[AttachmentRegistryService] 修复 .qbank 媒体引用失败: ${filePath}`, error);
			}
		}

		return { pathsNormalized, pathsPlaceholdered, pathsRemoved };
	}

	private async listQuestionBankFilePaths(): Promise<string[]> {
		const v2Paths = getV2Paths(readWeaveParentFolder(this.plugin));
		const adapter = this.plugin.app.vault.adapter;
		const filePaths: string[] = [];

		if (!(await adapter.exists(v2Paths.questionBank.root))) {
			return filePaths;
		}

		try {
			const listing = await adapter.list(v2Paths.questionBank.root);
			for (const filePath of listing.files || []) {
				if (filePath.endsWith(".qbank")) {
					filePaths.push(filePath);
				}
			}
		} catch (error) {
			logger.debug("[AttachmentRegistryService] 扫描 .qbank 文件失败:", error);
		}

		return filePaths;
	}

	private getContextPath(): string {
		return getAttachmentRegistryPath(readWeaveParentFolder(this.plugin));
	}

	private arePathSetsEqual(left: Set<string>, right: Set<string>): boolean {
		if (left.size !== right.size) {
			return false;
		}

		for (const value of left) {
			if (!right.has(value)) {
				return false;
			}
		}

		return true;
	}

	async collectReferencedPaths(): Promise<Set<string>> {
		const paths = new Set<string>();

		const cards = await this.plugin.dataStorage.getCards();
		for (const card of cards) {
			this.addPathsFromText(paths, card.content);
			if (card.fields) {
				for (const value of Object.values(card.fields)) {
					if (typeof value === "string") {
						this.addPathsFromText(paths, value);
					}
				}
			}
		}

		for (const content of await this.collectQuestionBankRawContents()) {
			this.addPathsFromText(paths, content);
		}

		for (const manifestPath of await this.collectManifestSavedPaths()) {
			paths.add(manifestPath);
		}

		return paths;
	}

	private async collectCanonicalReferencedPaths(): Promise<Set<string>> {
		const contextPath = this.getContextPath();
		const rawPaths = await this.collectReferencedPaths();
		const basenameIndex = buildVaultMediaBasenameIndex(this.plugin.app);
		const canonicalPaths = new Set<string>();

		for (const rawPath of rawPaths) {
			const canonicalPath = await resolveExistingMediaVaultPath(
				this.plugin.app,
				rawPath,
				contextPath,
				{ basenameIndex }
			);
			if (canonicalPath) {
				canonicalPaths.add(canonicalPath);
			}
		}

		return canonicalPaths;
	}

	private addPathsFromText(paths: Set<string>, content?: string): void {
		if (!content) {
			return;
		}

		for (const path of extractMediaVaultPathsFromContent(content)) {
			paths.add(path);
		}
	}

	private async readRegistryPaths(): Promise<Set<string>> {
		const registryPath = getAttachmentRegistryPath(readWeaveParentFolder(this.plugin));
		const file = this.plugin.app.vault.getAbstractFileByPath(registryPath);
		if (!(file instanceof TFile)) {
			return new Set();
		}

		const content = await this.plugin.app.vault.read(file);
		return extractMediaVaultPathsFromRegistryMarkdown(content);
	}

	private async collectQuestionBankRawContents(): Promise<string[]> {
		const contents: string[] = [];
		const adapter = this.plugin.app.vault.adapter;

		for (const filePath of await this.listQuestionBankFilePaths()) {
			try {
				contents.push(await adapter.read(filePath));
			} catch (error) {
				logger.debug(`[AttachmentRegistryService] 读取 .qbank 失败: ${filePath}`, error);
			}
		}

		return contents;
	}

	private async collectManifestSavedPaths(): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter;
		const paths: string[] = [];

		for (const manifestPath of await this.listMediaManifestFilePaths()) {
			try {
				const raw = await adapter.read(manifestPath);
				const parsed = parseJsonUnknown(raw);
				if (!isRecord(parsed) || !Array.isArray(parsed.files)) {
					continue;
				}

				for (const entry of parsed.files) {
					if (!isRecord(entry)) {
						continue;
					}
					const savedPath = typeof entry.savedPath === "string" ? entry.savedPath : "";
					if (savedPath && isMediaVaultPath(savedPath)) {
						paths.push(normalizeMediaVaultPath(savedPath));
					}
				}
			} catch (error) {
				logger.debug(`[AttachmentRegistryService] 读取媒体清单失败: ${manifestPath}`, error);
			}
		}

		return paths;
	}

	private async findOrphanWeaveMediaFiles(referencedPaths: Set<string>): Promise<string[]> {
		const v2Paths = getV2Paths(readWeaveParentFolder(this.plugin));
		const adapter = this.plugin.app.vault.adapter;
		const orphans: string[] = [];

		if (!(await adapter.exists(v2Paths.memory.media))) {
			return orphans;
		}

		const files = await this.listMediaFilesRecursively(v2Paths.memory.media);
		for (const filePath of files) {
			const normalized = normalizeMediaVaultPath(filePath);
			if (normalized.endsWith("/.manifest.json") || normalized.endsWith("/manifest.json")) {
				continue;
			}
			if (!isMediaVaultPath(normalized)) {
				continue;
			}
			if (!referencedPaths.has(normalized)) {
				orphans.push(normalized);
			}
		}

		return orphans;
	}

	private async listMediaFilesRecursively(root: string): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter;
		const files: string[] = [];

		const walk = async (dir: string): Promise<void> => {
			const listing = await adapter.list(dir);
			for (const filePath of listing.files || []) {
				files.push(filePath);
			}
			for (const folderPath of listing.folders || []) {
				await walk(folderPath);
			}
		};

		try {
			await walk(root);
		} catch (error) {
			logger.debug("[AttachmentRegistryService] 递归列出媒体文件失败:", error);
		}

		return files;
	}
}
