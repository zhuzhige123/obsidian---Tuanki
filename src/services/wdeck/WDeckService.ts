import { TFile } from "obsidian";
import { normalizePath } from "obsidian";
import { getPluginDir, getPluginPaths, getV2Paths, normalizeWeaveParentFolder } from "../../config/paths";
import type { Card, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { hasValidJsonBackup, readJsonBackup, safeReadJson, safeWriteJson } from "../../utils/safe-json-io";
import { sanitizeForSync } from "../../utils/sync-safe-filename";
import { ensureWeaveDataReadmesForPath } from "../../utils/weave-data-readme";

export const WDECK_FILE_EXTENSION = "wdeck";
export const WDECK_RUNTIME_DECK_PREFIX = "wdeck:";
export const WDECK_UNGROUPED_DECK_NAME = "未归组卡片";
const WDECK_CACHE_VERSION = 3;
const WDECK_SHARD_THRESHOLD_COUNT = 500;
const WDECK_SHARD_THRESHOLD_SIZE = 512 * 1024;

type WDeckRuntimeCardMeta = {
	runtimeDeckId: string;
	logicalDeckId: string;
	logicalDeckName: string;
	segmentId?: string;
	segmentIndex?: number;
	sourcePath: string;
};

export interface WDeckFileData {
	schemaVersion?: number;
	fileType?: string;
	logicalDeckId?: string;
	logicalDeckName?: string;
	segmentId?: string;
	segmentIndex?: number;
	segmentLabel?: string;
	deck?: Partial<Deck>;
	cards?: Card[];
}

interface ResolvedWDeckFile {
	file: TFile;
	data: WDeckFileData;
	logicalDeckId: string;
	logicalDeckName: string;
	runtimeDeckId: string;
	segmentIndex?: number;
	segmentId?: string;
}

/** 持久化缓存条目：不含卡片正文，仅元数据与 UUID 列表 */
type CachedResolvedWDeckFile = {
	path: string;
	mtime?: number;
	logicalDeckId: string;
	logicalDeckName: string;
	runtimeDeckId: string;
	segmentIndex?: number;
	segmentId?: string;
	deck?: Partial<Deck>;
	cardUUIDs: string[];
};

type ResolvedWDeckFileCacheEntry = {
	mtime: number;
	resolved: ResolvedWDeckFile;
};

type WDeckRuntimeCardSource = Pick<
	CachedResolvedWDeckFile,
	"path" | "runtimeDeckId" | "logicalDeckId" | "logicalDeckName" | "segmentId" | "segmentIndex"
>;

type WDeckCardLocator = Record<string, string>;

type WDeckCacheSnapshot = {
	version: number;
	vaultFingerprint: string;
	scannedAt: string;
	files: CachedResolvedWDeckFile[];
	cardLocator: WDeckCardLocator;
	conflicts: WDeckConflictReport;
};

export interface WDeckDeckAggregate {
	runtimeDeckId: string;
	logicalDeckId: string;
	logicalDeckName: string;
	files: TFile[];
	segmentIndices: number[];
	deck?: Partial<Deck>;
	cards: Card[];
}

export interface WDeckDeckSummary {
	runtimeDeckId: string;
	logicalDeckId: string;
	logicalDeckName: string;
	filePaths: string[];
	segmentIndices: number[];
	deck?: Partial<Deck>;
	cardUUIDs: string[];
}

export interface WDeckDeleteDeckResult {
	deletedFiles: string[];
	deletedCards: number;
}

export interface WDeckDissolveDeckResult {
	movedCards: number;
	targetDeckId: string;
	targetDeckName: string;
	targetFilePath: string;
	removedFiles: string[];
}

export interface WDeckConflictIssue {
	type: "duplicate_segment" | "uuid_conflict" | "suspected_duplicate_copy" | "invalid_file";
	message: string;
	filePaths: string[];
	logicalDeckId?: string;
	cardUUID?: string;
}

export interface WDeckConflictReport {
	scannedFiles: number;
	issues: WDeckConflictIssue[];
}

export interface WDeckCacheStatus {
	exists: boolean;
	needsRebuild: boolean;
	stale: boolean;
	fileCount: number;
	issueCount: number;
}

export type WDeckFileLoadErrorCode = "empty_file" | "invalid_json" | "invalid_file" | "not_found";

export class WDeckFileLoadError extends Error {
	readonly code: WDeckFileLoadErrorCode;
	readonly filePath: string;

	constructor(code: WDeckFileLoadErrorCode, filePath: string, message: string) {
		super(message);
		this.name = "WDeckFileLoadError";
		this.code = code;
		this.filePath = filePath;
	}
}

export function isWDeckFileLoadError(error: unknown): error is WDeckFileLoadError {
	return error instanceof WDeckFileLoadError;
}

export function parseWDeckFileName(baseName: string): {
	logicalDeckName: string;
	segmentIndex?: number;
} {
	const trimmed = String(baseName || "").trim();
	const match = trimmed.match(/^(.*?)[_-](\d+)$/);
	if (!match) {
		return { logicalDeckName: trimmed || baseName };
	}

	const logicalDeckName = String(match[1] || "").trim() || trimmed;
	const segmentIndex = Number.parseInt(match[2], 10);
	return {
		logicalDeckName,
		segmentIndex: Number.isFinite(segmentIndex) ? segmentIndex : undefined,
	};
}

export function toWDeckRuntimeDeckId(logicalDeckId: string): string {
	const trimmed = String(logicalDeckId || "").trim();
	const withoutPrefix = trimmed.startsWith(WDECK_RUNTIME_DECK_PREFIX)
		? trimmed.slice(WDECK_RUNTIME_DECK_PREFIX.length)
		: trimmed;
	return `${WDECK_RUNTIME_DECK_PREFIX}${withoutPrefix || "unnamed"}`;
}

export function normalizeWDeckLogicalDeckId(deckId?: string, fallbackName?: string): string {
	const trimmed = String(deckId || "").trim();
	const withoutPrefix = trimmed.startsWith(WDECK_RUNTIME_DECK_PREFIX)
		? trimmed.slice(WDECK_RUNTIME_DECK_PREFIX.length).trim()
		: trimmed;
	const fallback = String(fallbackName || "").trim();
	return withoutPrefix || fallback || "unnamed";
}

export function buildWDeckSegmentLabel(segmentIndex: number): string {
	const normalized = Number.isFinite(segmentIndex) && segmentIndex > 0 ? Math.floor(segmentIndex) : 1;
	return String(normalized).padStart(2, "0");
}

export function buildWDeckFileName(logicalDeckName: string, segmentIndex = 1): string {
	const baseName = sanitizeForSync(String(logicalDeckName || "").trim() || "unnamed");
	return `${baseName}_${buildWDeckSegmentLabel(segmentIndex)}.${WDECK_FILE_EXTENSION}`;
}

export function buildWDeckSegmentId(logicalDeckName: string, segmentIndex = 1): string {
	const baseName = String(logicalDeckName || "").trim() || "unnamed";
	return `${baseName}_${buildWDeckSegmentLabel(segmentIndex)}`;
}

export function isWDeckRuntimeDeckId(deckId?: string): boolean {
	return String(deckId || "").startsWith(WDECK_RUNTIME_DECK_PREFIX);
}

export class WDeckService {
	private plugin: WeavePlugin;
	private readFailureFingerprints = new Map<string, string>();
	/** 会话内 .wdeck 解析缓存（按 path + mtime） */
	private resolvedFileCache = new Map<string, ResolvedWDeckFileCacheEntry>();

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	private clearResolvedFileCache(): void {
		this.resolvedFileCache.clear();
	}

	normalizeDeckFileDataForPersistence(
		data: (Partial<WDeckFileData> & Record<string, unknown>) | null | undefined,
		filePathOrName: string
	): WDeckFileData & Record<string, unknown> {
		const rawData = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
		const typedData = rawData as Partial<WDeckFileData>;
		const fileName = normalizePath(String(filePathOrName || "").trim())
			.split("/")
			.pop()
			?.replace(/\.wdeck$/i, "");
		const fileNameInfo = parseWDeckFileName(fileName || String(filePathOrName || "").trim());
		const parsedDeck =
			typedData.deck && typeof typedData.deck === "object"
				? (typedData.deck as Partial<Deck>)
				: {};
		const logicalDeckName =
			String(parsedDeck.name || typedData.logicalDeckName || "").trim() ||
			fileNameInfo.logicalDeckName ||
			"unnamed";
		const logicalDeckId = normalizeWDeckLogicalDeckId(
			String(typedData.logicalDeckId || parsedDeck.id || "").trim(),
			logicalDeckName
		);
		const segmentIndex =
			typeof typedData.segmentIndex === "number" && Number.isFinite(typedData.segmentIndex)
				? Math.max(1, Math.floor(typedData.segmentIndex))
				: Math.max(1, fileNameInfo.segmentIndex || 1);
		const cards = Array.isArray(typedData.cards)
			? typedData.cards
					.filter((card): card is Card => !!card && typeof card === "object")
					.map((card) => this.stripRuntimeCardMeta(card))
			: [];

		return {
			...rawData,
			schemaVersion: 1,
			fileType: "wdeck",
			logicalDeckId,
			logicalDeckName,
			segmentId: buildWDeckSegmentId(logicalDeckName, segmentIndex),
			segmentIndex,
			segmentLabel: buildWDeckSegmentLabel(segmentIndex),
			deck: this.buildDeckDefinition(parsedDeck, logicalDeckId, logicalDeckName),
			cards,
		};
	}

	isWDeckCard(card?: Pick<Card, "deckId" | "customFields"> | null): boolean {
		if (!card) return false;
		if (isWDeckRuntimeDeckId(card.deckId)) return true;
		const marker = (card.customFields as Record<string, unknown> | undefined)?.wdeck;
		return !!marker && typeof marker === "object";
	}

	hasRuntimeCardMeta(card?: Pick<Card, "customFields"> | null): boolean {
		if (!card) return false;
		const marker = (card.customFields as Record<string, unknown> | undefined)?.wdeck;
		if (!marker || typeof marker !== "object") {
			return false;
		}

		const typedMarker = marker as Partial<WDeckRuntimeCardMeta>;
		return !!(
			typeof typedMarker.runtimeDeckId === "string" &&
			typedMarker.runtimeDeckId.trim() &&
			typeof typedMarker.sourcePath === "string" &&
			typedMarker.sourcePath.trim()
		);
	}

	isWDeckDeckId(deckId?: string): boolean {
		return isWDeckRuntimeDeckId(deckId);
	}

	async getDeckAggregateByDeckId(deckId: string): Promise<WDeckDeckAggregate | null> {
		if (!this.isWDeckDeckId(deckId)) {
			return null;
		}

		const snapshot = await this.loadSnapshot();
		const members = await this.resolveCachedFilesByPredicate(
			snapshot.files,
			(file) => file.runtimeDeckId === deckId
		);
		if (members.length === 0) {
			return null;
		}

		return this.buildAggregate(members);
	}

	async getDeckAggregateByAnyDeckId(deckId: string): Promise<WDeckDeckAggregate | null> {
		const normalizedDeckId = String(deckId || "").trim();
		if (!normalizedDeckId) {
			return null;
		}

		if (this.isWDeckDeckId(normalizedDeckId)) {
			return this.getDeckAggregateByDeckId(normalizedDeckId);
		}

		const logicalDeckId = this.normalizeDeckId(normalizedDeckId);
		const snapshot = await this.loadSnapshot();
		const members = await this.resolveCachedFilesByPredicate(
			snapshot.files,
			(file) => file.logicalDeckId === logicalDeckId
		);
		if (members.length === 0) {
			return null;
		}

		return this.buildAggregate(members);
	}

	async loadDeckAggregateFromFilePath(filePath: string): Promise<WDeckDeckAggregate> {
		const normalizedPath = String(filePath || "").trim();
		const targetFile = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(targetFile instanceof TFile)) {
			throw new WDeckFileLoadError("not_found", normalizedPath, `WDeck 文件不存在: ${normalizedPath}`);
		}

		let raw = "";
		try {
			raw = await this.plugin.app.vault.cachedRead(targetFile);
		} catch (error) {
			throw new WDeckFileLoadError(
				"invalid_file",
				normalizedPath,
				error instanceof Error ? error.message : `读取 WDeck 文件失败: ${normalizedPath}`
			);
		}

		if (!raw.trim()) {
			throw new WDeckFileLoadError("empty_file", normalizedPath, `WDeck 文件为空: ${normalizedPath}`);
		}

		try {
			JSON.parse(raw);
		} catch {
			const recovered = await safeReadJson<WDeckFileData>(
				this.plugin.app.vault.adapter as any,
				normalizedPath,
				this.plugin.app as any
			);
			if (!recovered) {
				throw new WDeckFileLoadError(
					"invalid_json",
					normalizedPath,
					`WDeck 文件内容不是合法 JSON: ${normalizedPath}`
				);
			}
		}

		const snapshot = await this.loadSnapshot();
		const target = snapshot.files.find((item) => item.path === normalizedPath);

		if (!target) {
			throw new WDeckFileLoadError(
				"invalid_file",
				normalizedPath,
				`WDeck 文件存在，但无法解析为合法牌组: ${normalizedPath}`
			);
		}

		const members = await this.resolveCachedFilesByPredicate(
			snapshot.files,
			(item) => item.runtimeDeckId === target.runtimeDeckId
		);
		return this.buildAggregate(members);
	}

	async getAllCards(): Promise<Card[]> {
		const snapshot = await this.loadSnapshot();
		return this.buildCardsFromCachedFiles(snapshot.files);
	}

	async getAllDeckAggregates(): Promise<WDeckDeckAggregate[]> {
		const snapshot = await this.loadSnapshot();
		return this.buildDeckAggregatesFromCachedFiles(snapshot.files);
	}

	async getAllDeckSummaries(): Promise<WDeckDeckSummary[]> {
		const snapshot = await this.loadSnapshot();
		return this.buildDeckSummariesFromCachedFiles(snapshot.files);
	}

	async getCardByUUID(uuid: string): Promise<Card | null> {
		if (!uuid) return null;

		const snapshot = await this.loadSnapshot();
		const normalizedUUID = String(uuid).trim();
		const locatedPath = snapshot.cardLocator[normalizedUUID];
		if (locatedPath) {
			const locatedCached = snapshot.files.find((item) => item.path === locatedPath);
			if (locatedCached) {
				const locatedCard = await this.findDecoratedCardInCachedFile(locatedCached, normalizedUUID);
				if (locatedCard) {
					return locatedCard;
				}
			}
		}

		for (const cached of snapshot.files) {
			const found = await this.findDecoratedCardInCachedFile(cached, normalizedUUID);
			if (found) {
				return found;
			}
		}

		return null;
	}

	async getCardsByUUIDs(uuids: string[]): Promise<Card[]> {
		const normalizedUUIDs = Array.from(
			new Set((uuids || []).map((uuid) => String(uuid || "").trim()).filter(Boolean))
		);
		if (normalizedUUIDs.length === 0) {
			return [];
		}

		const snapshot = await this.loadSnapshot();
		const uuidsByPath = new Map<string, Set<string>>();
		const unresolved = new Set<string>();
		const foundCards = new Map<string, Card>();
		const cachedByPath = new Map(snapshot.files.map((file) => [file.path, file] as const));

		for (const uuid of normalizedUUIDs) {
			const locatedPath = snapshot.cardLocator[uuid];
			if (!locatedPath) {
				unresolved.add(uuid);
				continue;
			}
			const bucket = uuidsByPath.get(locatedPath) || new Set<string>();
			bucket.add(uuid);
			uuidsByPath.set(locatedPath, bucket);
		}

		for (const [path, uuidSet] of uuidsByPath.entries()) {
			const cached = cachedByPath.get(path);
			if (!cached) {
				for (const uuid of uuidSet) {
					unresolved.add(uuid);
				}
				continue;
			}

			await this.collectDecoratedCardsFromCachedFile(cached, uuidSet, foundCards);
		}

		if (unresolved.size > 0) {
			const unresolvedSet = new Set(unresolved);
			for (const cached of snapshot.files) {
				await this.collectDecoratedCardsFromCachedFile(cached, unresolvedSet, foundCards);
			}
		}

		return normalizedUUIDs.map((uuid) => foundCards.get(uuid)).filter((card): card is Card => !!card);
	}

	async getDeckInfoByDeckId(
		deckId: string
	): Promise<Pick<WDeckDeckAggregate, "runtimeDeckId" | "logicalDeckId" | "logicalDeckName"> | null> {
		const aggregate = await this.getDeckAggregateByDeckId(deckId);
		if (!aggregate) return null;

		return {
			runtimeDeckId: aggregate.runtimeDeckId,
			logicalDeckId: aggregate.logicalDeckId,
			logicalDeckName: aggregate.logicalDeckName,
		};
	}

	async getDeckInfoByAnyDeckId(
		deckId: string
	): Promise<Pick<WDeckDeckAggregate, "runtimeDeckId" | "logicalDeckId" | "logicalDeckName"> | null> {
		const aggregate = await this.getDeckAggregateByAnyDeckId(deckId);
		if (!aggregate) return null;

		return {
			runtimeDeckId: aggregate.runtimeDeckId,
			logicalDeckId: aggregate.logicalDeckId,
			logicalDeckName: aggregate.logicalDeckName,
		};
	}

	async getConflictReport(forceRefresh = false): Promise<WDeckConflictReport> {
		const snapshot = await this.loadSnapshot(forceRefresh);
		return snapshot.conflicts;
	}

	async getCacheStatus(): Promise<WDeckCacheStatus> {
		const cache = await this.readCacheSnapshot();
		const vaultFiles = this.getVaultWDeckFiles();
		const vaultFingerprint = this.computeVaultFingerprint(vaultFiles);
		const stale = !cache || cache.vaultFingerprint !== vaultFingerprint;
		return {
			exists: !!cache,
			needsRebuild: stale,
			stale,
			fileCount: cache?.files.length ?? vaultFiles.length,
			issueCount: cache?.conflicts.issues.length ?? 0,
		};
	}

	async hasAnyDeckFileArtifacts(): Promise<boolean> {
		if (this.getVaultWDeckFiles().length > 0) {
			return true;
		}

		const adapter = this.plugin.app.vault.adapter;
		const deckFilesDir = normalizePath(this.buildDefaultDeckFolderPath());
		if (!(await adapter.exists(deckFilesDir))) {
			return false;
		}

		try {
			const listing = await adapter.list(deckFilesDir);
			return (listing.files || []).some((fileName) =>
				String(fileName || "")
					.trim()
					.toLowerCase()
					.endsWith(`.${WDECK_FILE_EXTENSION}`)
			);
		} catch {
			return false;
		}
	}

	async rebuildCache(): Promise<WDeckCacheStatus> {
		this.clearResolvedFileCache();
		const snapshot = await this.collectSnapshot();
		await this.writeCacheSnapshot(snapshot);
		return {
			exists: true,
			needsRebuild: false,
			stale: false,
			fileCount: snapshot.files.length,
			issueCount: snapshot.conflicts.issues.length,
		};
	}

	async deleteDeckFileByPath(filePath: string): Promise<void> {
		const normalizedPath = String(filePath || "").trim();
		if (!normalizedPath) {
			return;
		}

		await this.deleteDeckFile(normalizedPath);
		await this.rebuildCache();
	}

	async hasRecoverableBackup(filePath: string): Promise<boolean> {
		const normalizedPath = String(filePath || "").trim();
		if (!normalizedPath) {
			return false;
		}

		return await hasValidJsonBackup(
			this.plugin.app.vault.adapter as any,
			normalizedPath,
			this.plugin.app as any
		);
	}

	async restoreDeckFileFromBackup(filePath: string): Promise<boolean> {
		const normalizedPath = String(filePath || "").trim();
		if (!normalizedPath) {
			return false;
		}

		const backupEntry = await readJsonBackup<WDeckFileData>(
			this.plugin.app.vault.adapter as any,
			normalizedPath,
			this.plugin.app as any
		);
		if (!backupEntry) {
			return false;
		}

		const normalized = this.normalizeDeckFileDataForPersistence(
			backupEntry.data as Partial<WDeckFileData> & Record<string, unknown>,
			normalizedPath
		);
		await safeWriteJson(
			this.plugin.app.vault.adapter as any,
			normalizedPath,
			`${JSON.stringify(normalized, null, 2)}\n`,
			this.plugin.app as any
		);

		await this.rebuildCache();
		return true;
	}

	async repairDeckFileByPath(filePath: string): Promise<{ repaired: boolean; usedBackup: boolean }> {
		const normalizedPath = String(filePath || "").trim();
		if (!normalizedPath) {
			return { repaired: false, usedBackup: false };
		}

		const targetFile = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(targetFile instanceof TFile)) {
			return { repaired: false, usedBackup: false };
		}

		let raw = "";
		try {
			raw = await this.plugin.app.vault.cachedRead(targetFile);
		} catch {
			return { repaired: false, usedBackup: false };
		}

		try {
			const parsed = JSON.parse(raw) as Partial<WDeckFileData> & Record<string, unknown>;
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return { repaired: false, usedBackup: false };
			}
			const normalized = this.normalizeDeckFileDataForPersistence(parsed, normalizedPath);
			await safeWriteJson(
				this.plugin.app.vault.adapter as any,
				normalizedPath,
				`${JSON.stringify(normalized, null, 2)}\n`,
				this.plugin.app as any
			);
			await this.rebuildCache();
			return { repaired: true, usedBackup: false };
		} catch {
			const restored = await this.restoreDeckFileFromBackup(normalizedPath);
			return { repaired: restored, usedBackup: restored };
		}
	}

	async deleteDeckByDeckId(deckId: string): Promise<WDeckDeleteDeckResult> {
		const aggregate = await this.getDeckAggregateByDeckId(deckId);
		if (!aggregate) {
            throw new Error(`WDeck 牌组不存在: ${deckId}`);
		}

		const removedFiles: string[] = [];
		for (const file of aggregate.files) {
			await this.deleteDeckFile(file.path);
			removedFiles.push(file.path);
		}

		await this.rebuildCache();
		return {
			deletedFiles: removedFiles,
			deletedCards: aggregate.cards.length,
		};
	}

	async dissolveDeckByDeckId(deckId: string): Promise<WDeckDissolveDeckResult> {
		const aggregate = await this.getDeckAggregateByDeckId(deckId);
		if (!aggregate) {
            throw new Error(`WDeck 牌组不存在: ${deckId}`);
		}

		if (aggregate.logicalDeckName === WDECK_UNGROUPED_DECK_NAME) {
            throw new Error("未归组卡片牌组不能再次解散。");
		}

		const targetFilePath = await this.ensureUngroupedDeckFile();
		const targetFile = this.plugin.app.vault.getAbstractFileByPath(targetFilePath);
		if (!(targetFile instanceof TFile)) {
            throw new Error(`未归组卡片牌组文件不存在: ${targetFilePath}`);
		}

		const targetResolved = await this.readResolvedFile(targetFile);
		if (!targetResolved) {
            throw new Error(`无法读取未归组卡片牌组文件: ${targetFilePath}`);
		}

		const mergedCards = new Map<string, Card>();
		for (const card of Array.isArray(targetResolved.data.cards) ? targetResolved.data.cards : []) {
			if (card?.uuid) {
				mergedCards.set(card.uuid, card);
			}
		}

		for (const card of aggregate.cards) {
			const strippedCard = this.stripRuntimeCardMeta(card);
			if (strippedCard?.uuid) {
				mergedCards.set(strippedCard.uuid, strippedCard);
			}
		}

		await this.writeDeckFile(targetFile, {
			...targetResolved.data,
			fileType: "wdeck",
			logicalDeckId: WDECK_UNGROUPED_DECK_NAME,
			logicalDeckName: WDECK_UNGROUPED_DECK_NAME,
			segmentId: buildWDeckSegmentId(WDECK_UNGROUPED_DECK_NAME, 1),
			segmentIndex: 1,
			segmentLabel: buildWDeckSegmentLabel(1),
			cards: Array.from(mergedCards.values()),
		});

		const removedFiles: string[] = [];
		for (const file of aggregate.files) {
			await this.deleteDeckFile(file.path);
			removedFiles.push(file.path);
		}

		await this.rebuildCache();
		return {
			movedCards: aggregate.cards.length,
			targetDeckId: toWDeckRuntimeDeckId(WDECK_UNGROUPED_DECK_NAME),
			targetDeckName: WDECK_UNGROUPED_DECK_NAME,
			targetFilePath,
			removedFiles,
		};
	}

	async ensureDeckFileForDeck(deck: Pick<Deck, "id" | "name">): Promise<string> {
		const logicalDeckName = this.normalizeDeckName(deck.name, deck.id);
		const logicalDeckId = this.normalizeDeckId(deck.id, logicalDeckName);
		const existing = await this.findPrimaryDeckFile(logicalDeckId, logicalDeckName);
		if (existing) {
			return existing.file.path;
		}

		const filePath = this.buildDefaultDeckFilePath(logicalDeckName, 1);
		const createdFile = await this.createDeckFile(filePath, logicalDeckId, logicalDeckName);
		await this.rebuildCache();
		return createdFile.path;
	}

	async saveDeckDefinition(deck: Deck): Promise<WDeckDeckAggregate> {
		const logicalDeckName = this.normalizeDeckName(deck.name, deck.id);
		const logicalDeckId = this.normalizeDeckId(deck.id, logicalDeckName);
		const filePath = await this.ensureDeckFileForDeck({
			id: logicalDeckId,
			name: logicalDeckName,
		});

		const aggregate =
			(await this.getDeckAggregateByAnyDeckId(logicalDeckId)) ||
			(await this.resolveDeckAggregateFromEnsuredFile(filePath, logicalDeckId));
		const deckDefinition = this.buildDeckDefinition(deck, logicalDeckId, logicalDeckName);

		for (const file of aggregate.files) {
			const resolved = await this.requireResolvedByPath(file.path);
			const segmentIndex = resolved.segmentIndex || 1;
			await this.writeDeckFile(resolved.file, {
				...resolved.data,
				fileType: "wdeck",
				logicalDeckId,
				logicalDeckName,
				segmentId: buildWDeckSegmentId(logicalDeckName, segmentIndex),
				segmentIndex,
				segmentLabel: buildWDeckSegmentLabel(segmentIndex),
				deck: deckDefinition,
			});
		}

		if (aggregate.logicalDeckName !== logicalDeckName) {
			await this.renameDeckFiles(
				aggregate.files.map((file) => file.path),
				logicalDeckName
			);
		}

		await this.rebuildCache();
		const refreshed = await this.getDeckAggregateByAnyDeckId(logicalDeckId);
		if (!refreshed) {
			throw new Error(`WDeck deck definition save failed: ${logicalDeckId}`);
		}

		return refreshed;
	}

	async saveCardToDeck(deck: Pick<Deck, "id" | "name">, card: Card): Promise<Card> {
		const [savedCard] = await this.saveCardsToDeck(deck, [card]);
		return savedCard;
	}

	async saveCardsToDeck(deck: Pick<Deck, "id" | "name">, cards: Card[]): Promise<Card[]> {
		return this.saveCardsToDeckInternal(deck, cards);
	}

	private async saveCardsToDeckInternal(
		deck: Pick<Deck, "id" | "name">,
		cards: Card[],
		options: { skipRebuild?: boolean; touchedPaths?: Set<string> } = {}
	): Promise<Card[]> {
		const touchedPaths = options.touchedPaths || new Set<string>();
		const logicalDeckName = this.normalizeDeckName(deck.name, deck.id);
		const logicalDeckId = this.normalizeDeckId(deck.id, logicalDeckName);
		const existingFiles = await this.getResolvedFilesForLogicalDeck(logicalDeckId, logicalDeckName);

		const targetUUIDs = Array.from(new Set(cards.map((card) => String(card?.uuid || "").trim()).filter(Boolean)));
		const strippedPaths = await this.stripCardUUIDsFromOtherFiles(
			targetUUIDs,
			existingFiles.map((item) => item.file.path)
		);
		for (const path of strippedPaths) {
			touchedPaths.add(path);
		}

		const merged = new Map<string, Card>();
		for (const resolved of existingFiles) {
			for (const existing of Array.isArray(resolved.data.cards) ? resolved.data.cards : []) {
				if (existing?.uuid) {
					merged.set(existing.uuid, existing);
				}
			}
		}

		for (const card of cards) {
			const stripped = this.stripRuntimeCardMeta(card);
			if (stripped?.uuid) {
				merged.set(stripped.uuid, stripped);
			}
		}

		const deckDefinitionSource =
			existingFiles
				.map((item) =>
					item.data.deck && typeof item.data.deck === "object" ? (item.data.deck as Partial<Deck>) : null
				)
				.find((item): item is Partial<Deck> => !!item) || {
				id: logicalDeckId,
				name: logicalDeckName,
				purpose: "memory",
			};

		const rewrittenFiles = await this.writeLogicalDeckSegments(
			logicalDeckId,
			logicalDeckName,
			Array.from(merged.values()),
			{
				existingFiles,
				deckDefinition: deckDefinitionSource,
				touchedPaths,
			}
		);

		if (!options.skipRebuild) {
			await this.refreshCacheAfterWrites(touchedPaths);
		}
		return cards
			.map((card) => {
				return this.findDecoratedCardInResolvedFiles(card.uuid, rewrittenFiles);
			})
			.filter((card): card is Card => !!card);
	}

	async replaceDeckCardsForDeck(deck: Pick<Deck, "id" | "name">, cards: Card[]): Promise<Card[]> {
		const logicalDeckName = this.normalizeDeckName(deck.name, deck.id);
		const logicalDeckId = this.normalizeDeckId(deck.id, logicalDeckName);
		const existingFiles = await this.getResolvedFilesForLogicalDeck(logicalDeckId, logicalDeckName);
		const payloadCards = cards
			.map((card) => this.stripRuntimeCardMeta(card))
			.filter((card): card is Card => !!card?.uuid);
		await this.stripCardUUIDsFromOtherFiles(
			payloadCards.map((card) => card.uuid),
			existingFiles.map((item) => item.file.path)
		);

		const touchedPaths = new Set<string>();
		const deckDefinitionSource =
			existingFiles
				.map((item) =>
					item.data.deck && typeof item.data.deck === "object" ? (item.data.deck as Partial<Deck>) : null
				)
				.find((item): item is Partial<Deck> => !!item) || {
				id: logicalDeckId,
				name: logicalDeckName,
				purpose: "memory",
			};

		const rewrittenFiles = await this.writeLogicalDeckSegments(
			logicalDeckId,
			logicalDeckName,
			payloadCards,
			{
				existingFiles,
				deckDefinition: deckDefinitionSource,
				touchedPaths,
			}
		);

		await this.refreshCacheAfterWrites(touchedPaths);
		return rewrittenFiles.flatMap((resolved) =>
			(resolved.data.cards || []).map((card) => this.decorateCard(card, resolved))
		);
	}

	async saveCard(card: Card): Promise<Card> {
		return this.saveCardInternal(card);
	}

	private async saveCardInternal(
		card: Card,
		options: { skipRebuild?: boolean; touchedPaths?: Set<string> } = {}
	): Promise<Card> {
		const touchedPaths = options.touchedPaths || new Set<string>();
		const runtimeMeta = this.getRuntimeCardMeta(card);
		if (!runtimeMeta?.sourcePath) {
			throw new Error("WDeck 卡片缺少牌组文件路径，无法保存。");
		}

		const preferredTarget = await this.resolvePreferredDeckForCard(card, runtimeMeta);
		if (!preferredTarget.sameLogicalDeck) {
			const [savedCard] = await this.saveCardsToDeckInternal(preferredTarget.deck, [card], options);
			if (!savedCard) {
				throw new Error(`WDeck 卡片跨牌组保存失败: ${card.uuid}`);
			}
			return savedCard;
		}

		const file = this.plugin.app.vault.getAbstractFileByPath(runtimeMeta.sourcePath);
		if (!(file instanceof TFile)) {
			const [savedCard] = await this.saveCardsToDeckInternal(preferredTarget.deck, [card], options);
			if (!savedCard) {
				throw new Error(`WDeck 牌组文件不存在且无法重建: ${runtimeMeta.sourcePath}`);
			}
			return savedCard;
		}

		const resolved = await this.readResolvedFile(file);
		if (!resolved) {
			const [savedCard] = await this.saveCardsToDeckInternal(preferredTarget.deck, [card], options);
			if (!savedCard) {
				throw new Error(`无法读取 WDeck 牌组文件: ${runtimeMeta.sourcePath}`);
			}
			return savedCard;
		}

		const cards = Array.isArray(resolved.data.cards) ? [...resolved.data.cards] : [];
		const cardToPersist = this.stripRuntimeCardMeta(card);
		const existingIndex = cards.findIndex((item) => item?.uuid === card.uuid);

		if (existingIndex >= 0) {
			cards[existingIndex] = cardToPersist;
		} else {
			cards.push(cardToPersist);
		}

		if (
			this.doesDeckDataExceedShardThreshold(file.path, {
				...resolved.data,
				cards,
			})
		) {
			const existingFiles = await this.getResolvedFilesForLogicalDeck(
				resolved.logicalDeckId,
				resolved.logicalDeckName
			);
			const mergedDeckCards = new Map<string, Card>();
			for (const existingFile of existingFiles) {
				for (const existingCard of Array.isArray(existingFile.data.cards) ? existingFile.data.cards : []) {
					if (existingCard?.uuid) {
						mergedDeckCards.set(existingCard.uuid, existingCard);
					}
				}
			}
			mergedDeckCards.set(cardToPersist.uuid, cardToPersist);

			const rewrittenFiles = await this.writeLogicalDeckSegments(
				resolved.logicalDeckId,
				resolved.logicalDeckName,
				Array.from(mergedDeckCards.values()),
				{
					existingFiles,
					deckDefinition:
						resolved.data.deck && typeof resolved.data.deck === "object"
							? (resolved.data.deck as Partial<Deck>)
							: {
								id: resolved.logicalDeckId,
								name: resolved.logicalDeckName,
								purpose: "memory",
							},
					touchedPaths,
				}
			);

			if (!options.skipRebuild) {
				await this.refreshCacheAfterWrites(touchedPaths);
			}
			const rewrittenCard = this.findDecoratedCardInResolvedFiles(card.uuid, rewrittenFiles);
			if (!rewrittenCard) {
				throw new Error(`WDeck 分片重写后未找到卡片: ${card.uuid}`);
			}
			return rewrittenCard;
		}

		await this.writeDeckFile(file, {
			...resolved.data,
			cards,
		});
		touchedPaths.add(file.path);

		if (!options.skipRebuild) {
			await this.refreshCacheAfterWrites(touchedPaths);
		}
		const refreshed = await this.readResolvedFile(file);
		if (!refreshed) {
			throw new Error(`无法重新读取 WDeck 牌组文件: ${runtimeMeta.sourcePath}`);
		}
		return this.decorateCard(cardToPersist, refreshed);
	}

	async saveCardsBatch(cards: Card[]): Promise<void> {
		const touchedPaths = new Set<string>();
		const groups = new Map<string, { deck: Pick<Deck, "id" | "name">; cards: Card[] }>();

		for (const card of cards) {
			const runtimeMeta = this.getRuntimeCardMeta(card);
			const preferredTarget = await this.resolvePreferredDeckForCard(card, runtimeMeta);
			const groupKey = this.normalizeDeckId(preferredTarget.deck.id, preferredTarget.deck.name);
			const bucket = groups.get(groupKey) || {
				deck: preferredTarget.deck,
				cards: [],
			};
			bucket.cards.push(card);
			groups.set(groupKey, bucket);
		}

		for (const entry of groups.values()) {
			await this.saveCardsToDeckInternal(entry.deck, entry.cards, { skipRebuild: true, touchedPaths });
		}

		if (touchedPaths.size > 0) {
			await this.refreshCacheAfterWrites(touchedPaths);
		}
	}

	async deleteCardByUUID(uuid: string): Promise<boolean> {
		const deleted = await this.deleteCardsByUUIDs([uuid]);
		return deleted.includes(uuid);
	}

	async deleteCardsByUUIDs(uuids: string[]): Promise<string[]> {
		const targetUUIDs = new Set((uuids || []).map((uuid) => String(uuid || "").trim()).filter(Boolean));
		if (targetUUIDs.size === 0) {
			return [];
		}

		const snapshot = await this.loadSnapshot();
		const deleted: string[] = [];
		const touchedPaths = new Set<string>();
		const processedPaths = new Set<string>();
		const targetUUIDsByPath = new Map<string, Set<string>>();
		const unresolvedUUIDs = new Set<string>();

		for (const uuid of targetUUIDs) {
			const locatedPath = snapshot.cardLocator[uuid];
			if (!locatedPath) {
				unresolvedUUIDs.add(uuid);
				continue;
			}
			const bucket = targetUUIDsByPath.get(locatedPath) || new Set<string>();
			bucket.add(uuid);
			targetUUIDsByPath.set(locatedPath, bucket);
		}

		const removeCardsFromResolved = async (
			resolved: ResolvedWDeckFile,
			targets: Set<string>
		): Promise<void> => {
			const cards = Array.isArray(resolved.data.cards) ? resolved.data.cards : [];
			if (cards.length === 0) {
				return;
			}

			const remainingCards = cards.filter((card) => {
				if (!card?.uuid || !targets.has(card.uuid)) {
					return true;
				}

				deleted.push(card.uuid);
				return false;
			});

			if (remainingCards.length === cards.length) {
				return;
			}

			await this.writeDeckFile(resolved.file, {
				...resolved.data,
				cards: remainingCards,
			});
			touchedPaths.add(resolved.file.path);
		};

		for (const [path, uuidSet] of targetUUIDsByPath.entries()) {
			const file = this.plugin.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				for (const uuid of uuidSet) {
					unresolvedUUIDs.add(uuid);
				}
				continue;
			}

			const resolved = await this.readResolvedFile(file);
			if (!resolved) {
				for (const uuid of uuidSet) {
					unresolvedUUIDs.add(uuid);
				}
				continue;
			}

			processedPaths.add(path);
			await removeCardsFromResolved(resolved, uuidSet);
		}

		if (unresolvedUUIDs.size > 0) {
			for (const resolved of await this.scanResolvedFiles()) {
				if (processedPaths.has(resolved.file.path)) {
					continue;
				}
				const cards = Array.isArray(resolved.data.cards) ? resolved.data.cards : [];
				const matchingUUIDs = new Set(
					cards
						.map((card) => card?.uuid)
						.filter((uuid): uuid is string => !!uuid && unresolvedUUIDs.has(uuid))
				);
				if (matchingUUIDs.size === 0) {
					continue;
				}

				await removeCardsFromResolved(resolved, matchingUUIDs);
			}
		}

		if (deleted.length > 0 && touchedPaths.size > 0) {
			await this.refreshCacheAfterWrites(touchedPaths);
		}
		return deleted;
	}

	private async scanResolvedFilesFresh(): Promise<ResolvedWDeckFile[]> {
		const vaultFiles = this.getVaultWDeckFiles();
		const resolved = await Promise.all(vaultFiles.map((file) => this.readResolvedFile(file)));
		return resolved.filter((item): item is ResolvedWDeckFile => !!item);
	}

	private async stripCardUUIDsFromOtherFiles(
		uuids: Iterable<string>,
		retainedFilePaths: string[] = []
	): Promise<string[]> {
		const targetUUIDs = new Set(Array.from(uuids || []).filter(Boolean));
		if (targetUUIDs.size === 0) {
			return [];
		}

		const changedPaths: string[] = [];
		const retained = new Set(retainedFilePaths.map((path) => String(path || "").trim()).filter(Boolean));
		const snapshot = await this.loadSnapshot();
		const processedPaths = new Set<string>();
		const targetUUIDsByPath = new Map<string, Set<string>>();
		const unresolvedUUIDs = new Set<string>();

		for (const uuid of targetUUIDs) {
			const locatedPath = snapshot.cardLocator[uuid];
			if (!locatedPath || retained.has(locatedPath)) {
				unresolvedUUIDs.add(uuid);
				continue;
			}
			const bucket = targetUUIDsByPath.get(locatedPath) || new Set<string>();
			bucket.add(uuid);
			targetUUIDsByPath.set(locatedPath, bucket);
		}

		const stripFromResolved = async (resolved: ResolvedWDeckFile, targets: Set<string>): Promise<void> => {
			const cards = Array.isArray(resolved.data.cards) ? resolved.data.cards : [];
			if (cards.length === 0) {
				return;
			}

			const remainingCards = cards.filter((card) => !card?.uuid || !targets.has(card.uuid));
			if (remainingCards.length === cards.length) {
				return;
			}

			await this.writeDeckFile(resolved.file, {
				...resolved.data,
				cards: remainingCards,
			});
			changedPaths.push(resolved.file.path);
		};

		for (const [path, uuidSet] of targetUUIDsByPath.entries()) {
			const file = this.plugin.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				for (const uuid of uuidSet) {
					unresolvedUUIDs.add(uuid);
				}
				continue;
			}

			const resolved = await this.readResolvedFile(file);
			if (!resolved) {
				for (const uuid of uuidSet) {
					unresolvedUUIDs.add(uuid);
				}
				continue;
			}

			processedPaths.add(path);
			await stripFromResolved(resolved, uuidSet);
		}

		if (unresolvedUUIDs.size > 0) {
			const resolvedFiles = await this.scanResolvedFilesFresh();
			for (const resolved of resolvedFiles) {
				if (retained.has(resolved.file.path) || processedPaths.has(resolved.file.path)) {
					continue;
				}

				const cards = Array.isArray(resolved.data.cards) ? resolved.data.cards : [];
				const matchingUUIDs = new Set(
					cards
						.map((card) => card?.uuid)
						.filter((uuid): uuid is string => !!uuid && unresolvedUUIDs.has(uuid))
				);
				if (matchingUUIDs.size === 0) {
					continue;
				}

				await stripFromResolved(resolved, matchingUUIDs);
			}
		}

		return changedPaths;
	}

	private normalizeDeckName(name?: string, fallbackId?: string): string {
		const trimmedName = String(name || "").trim();
		if (trimmedName) {
			return trimmedName;
		}

		return normalizeWDeckLogicalDeckId(fallbackId);
	}

	private normalizeDeckId(deckId?: string, fallbackName?: string): string {
		return normalizeWDeckLogicalDeckId(deckId, fallbackName);
	}

	private buildDefaultDeckFolderPath(): string {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		return `${getV2Paths(parentFolder).memory.root}/deck-files`;
	}

	private buildDeckFilePathInDirectory(directory: string, logicalDeckName: string, segmentIndex: number): string {
		const normalizedDirectory = normalizePath(String(directory || "").trim());
		const fileName = buildWDeckFileName(logicalDeckName, segmentIndex);
		return normalizedDirectory ? `${normalizedDirectory}/${fileName}` : fileName;
	}

	private buildDefaultDeckFilePath(logicalDeckName: string, segmentIndex: number): string {
		return this.buildDeckFilePathInDirectory(this.buildDefaultDeckFolderPath(), logicalDeckName, segmentIndex);
	}

	private sortResolvedFilesBySegment(files: ResolvedWDeckFile[]): ResolvedWDeckFile[] {
		return [...files].sort((a, b) => {
			const aIndex = a.segmentIndex ?? Number.MAX_SAFE_INTEGER;
			const bIndex = b.segmentIndex ?? Number.MAX_SAFE_INTEGER;
			if (aIndex !== bIndex) return aIndex - bIndex;
			return a.file.path.localeCompare(b.file.path, "zh-CN");
		});
	}

	private async getResolvedFilesForLogicalDeck(
		logicalDeckId: string,
		logicalDeckName?: string
	): Promise<ResolvedWDeckFile[]> {
		const normalizedDeckId = this.normalizeDeckId(logicalDeckId, logicalDeckName);
		const normalizedDeckName = this.normalizeDeckName(logicalDeckName, logicalDeckId);
		const snapshot = await this.loadSnapshot();
		const members = await this.resolveCachedFilesByPredicate(
			snapshot.files,
			(file) =>
				file.logicalDeckId === normalizedDeckId ||
				(!file.logicalDeckId && file.logicalDeckName === normalizedDeckName)
		);
		return this.sortResolvedFilesBySegment(members);
	}

	private doesDeckDataExceedShardThreshold(filePath: string, data: WDeckFileData): boolean {
		const normalized = this.normalizeDeckFileDataForPersistence(
			data as WDeckFileData & Record<string, unknown>,
			filePath
		);
		const cardCount = Array.isArray(normalized.cards) ? normalized.cards.length : 0;
		if (cardCount > WDECK_SHARD_THRESHOLD_COUNT) {
			return true;
		}
		return JSON.stringify(normalized).length >= WDECK_SHARD_THRESHOLD_SIZE;
	}

	private splitCardsForSegments(
		logicalDeckId: string,
		logicalDeckName: string,
		deckDefinition: Partial<Deck>,
		cards: Card[],
		baseDirectory: string
	): Card[][] {
		if (cards.length === 0) {
			return [[]];
		}

		const chunks: Card[][] = [[]];
		for (const card of cards) {
			const currentChunk = chunks[chunks.length - 1];
			const nextChunk = [...currentChunk, card];
			const segmentIndex = chunks.length;
			const nextPath = this.buildDeckFilePathInDirectory(baseDirectory, logicalDeckName, segmentIndex);
			const nextData: WDeckFileData = {
				fileType: "wdeck",
				logicalDeckId,
				logicalDeckName,
				segmentId: buildWDeckSegmentId(logicalDeckName, segmentIndex),
				segmentIndex,
				segmentLabel: buildWDeckSegmentLabel(segmentIndex),
				deck: deckDefinition,
				cards: nextChunk,
			};

			if (currentChunk.length > 0 && this.doesDeckDataExceedShardThreshold(nextPath, nextData)) {
				chunks.push([card]);
				continue;
			}

			currentChunk.push(card);
		}

		return chunks;
	}

	private async writeLogicalDeckSegments(
		logicalDeckId: string,
		logicalDeckName: string,
		cards: Card[],
		options: {
			existingFiles?: ResolvedWDeckFile[];
			deckDefinition?: Partial<Deck>;
			touchedPaths?: Set<string>;
		}
	): Promise<ResolvedWDeckFile[]> {
		const touchedPaths = options.touchedPaths || new Set<string>();
		const existingFiles = this.sortResolvedFilesBySegment(options.existingFiles || []);
		const baseDirectory =
			existingFiles[0]?.file.path.split("/").slice(0, -1).join("/") || this.buildDefaultDeckFolderPath();
		const deckDefinition = this.buildDeckDefinition(
			options.deckDefinition || {
				id: logicalDeckId,
				name: logicalDeckName,
				purpose: "memory",
			},
			logicalDeckId,
			logicalDeckName
		);
		const cardChunks = this.splitCardsForSegments(
			logicalDeckId,
			logicalDeckName,
			deckDefinition,
			cards,
			baseDirectory
		);
		const writtenFiles: ResolvedWDeckFile[] = [];
		const retainedPaths = new Set<string>();

		for (let index = 0; index < cardChunks.length; index += 1) {
			const segmentIndex = index + 1;
			const existing = existingFiles.find((file) => (file.segmentIndex || 1) === segmentIndex);
			const targetPath = existing?.file.path || this.buildDeckFilePathInDirectory(baseDirectory, logicalDeckName, segmentIndex);
			let targetFile = this.plugin.app.vault.getAbstractFileByPath(targetPath);
			if (!(targetFile instanceof TFile)) {
				targetFile = await this.createDeckFile(targetPath, logicalDeckId, logicalDeckName);
			}

			await this.writeDeckFile(targetFile, {
				fileType: "wdeck",
				logicalDeckId,
				logicalDeckName,
				segmentId: buildWDeckSegmentId(logicalDeckName, segmentIndex),
				segmentIndex,
				segmentLabel: buildWDeckSegmentLabel(segmentIndex),
				deck: deckDefinition,
				cards: cardChunks[index],
			});
			retainedPaths.add(targetFile.path);
			touchedPaths.add(targetFile.path);

			const refreshed = await this.readResolvedFile(targetFile);
			if (!refreshed) {
				throw new Error(`无法重新读取 WDeck 分片文件: ${targetFile.path}`);
			}
			writtenFiles.push(refreshed);
		}

		for (const existing of existingFiles) {
			if (retainedPaths.has(existing.file.path)) {
				continue;
			}
			await this.deleteDeckFile(existing.file.path);
			touchedPaths.add(existing.file.path);
		}

		return this.sortResolvedFilesBySegment(writtenFiles);
	}

	private async findPrimaryDeckFile(
		logicalDeckId: string,
		logicalDeckName: string
	): Promise<ResolvedWDeckFile | null> {
		const normalizedDeckId = this.normalizeDeckId(logicalDeckId, logicalDeckName);
		const normalizedDeckName = this.normalizeDeckName(logicalDeckName, logicalDeckId);
		const runtimeDeckId = toWDeckRuntimeDeckId(normalizedDeckId);
		const resolvedFiles = await this.scanResolvedFiles();
		const matches = resolvedFiles.filter(
			(file) =>
				file.runtimeDeckId === runtimeDeckId ||
				file.logicalDeckId === normalizedDeckId ||
				file.logicalDeckName === normalizedDeckName
		);
		if (matches.length === 0) {
			return null;
		}

		return [...matches].sort((a, b) => {
			const aIndex = a.segmentIndex ?? Number.MAX_SAFE_INTEGER;
			const bIndex = b.segmentIndex ?? Number.MAX_SAFE_INTEGER;
			if (aIndex !== bIndex) return aIndex - bIndex;
			return a.file.path.localeCompare(b.file.path, "zh-CN");
		})[0];
	}

	private async resolveDeckAggregateFromEnsuredFile(
		filePath: string,
		logicalDeckId: string
	): Promise<WDeckDeckAggregate> {
		const aggregate = await this.getDeckAggregateByAnyDeckId(logicalDeckId);
		if (aggregate) {
			return aggregate;
		}

		await this.rebuildCache();
		const refreshed = await this.getDeckAggregateByAnyDeckId(logicalDeckId);
		if (refreshed) {
			return refreshed;
		}

		const normalizedPath = normalizePath(String(filePath || "").trim());
		const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
		if (file instanceof TFile) {
			const resolved = await this.readResolvedFile(file);
			if (resolved) {
				return this.buildAggregate([resolved]);
			}
		}

		return this.loadDeckAggregateFromFilePath(normalizedPath);
	}

	private async ensureVaultWdeckFile(filePath: string, content: string): Promise<TFile> {
		const normalizedPath = normalizePath(String(filePath || "").trim());
		if (!normalizedPath) {
			throw new Error("WDeck 文件路径不能为空");
		}

		const vault = this.plugin.app.vault;
		const existing = vault.getAbstractFileByPath(normalizedPath);
		if (existing instanceof TFile) {
			await vault.modify(existing, content);
			return existing;
		}

		const adapter = vault.adapter;
		if (await adapter.exists(normalizedPath)) {
			try {
				const orphanContent = await adapter.read(normalizedPath);
				await adapter.remove(normalizedPath);
				return await vault.create(
					normalizedPath,
					orphanContent.trim().length > 0 ? orphanContent : content
				);
			} catch (error) {
				if (await adapter.exists(normalizedPath)) {
					await adapter.remove(normalizedPath).catch(() => undefined);
				}
				const recovered = vault.getAbstractFileByPath(normalizedPath);
				if (recovered instanceof TFile) {
					await vault.modify(recovered, content);
					return recovered;
				}
				logger.warn(
					`[WDeck] 重新登记孤儿 .wdeck 文件失败: ${normalizedPath}`,
					error
				);
			}
		}

		try {
			return await vault.create(normalizedPath, content);
		} catch (error) {
			const recovered = vault.getAbstractFileByPath(normalizedPath);
			if (recovered instanceof TFile) {
				await vault.modify(recovered, content);
				return recovered;
			}
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`创建 WDeck 文件失败: ${normalizedPath} (${message})`);
		}
	}

	private async createDeckFile(
		filePath: string,
		logicalDeckId: string,
		logicalDeckName: string
	): Promise<TFile> {
		const adapter = this.plugin.app.vault.adapter;
		const folderPath = filePath.split("/").slice(0, -1).join("/");
		await DirectoryUtils.ensureDirRecursive(adapter, folderPath);
		await ensureWeaveDataReadmesForPath(
			adapter,
			folderPath,
			normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder)
		);
		const payload: WDeckFileData = {
			schemaVersion: 1,
			fileType: "wdeck",
			logicalDeckId,
			logicalDeckName,
			segmentId: buildWDeckSegmentId(logicalDeckName, 1),
			segmentIndex: 1,
			segmentLabel: buildWDeckSegmentLabel(1),
			deck: this.buildDeckDefinition(
				{
					id: logicalDeckId,
					name: logicalDeckName,
					purpose: "memory",
				},
				logicalDeckId,
				logicalDeckName
			),
			cards: [],
		};
		const content = `${JSON.stringify(payload, null, 2)}\n`;
		return this.ensureVaultWdeckFile(filePath, content);
	}

	private async renameDeckFiles(filePaths: string[], logicalDeckName: string): Promise<void> {
		const normalizedName = this.normalizeDeckName(logicalDeckName);
		const adapter = this.plugin.app.vault.adapter;
		const normalizedPaths = Array.from(
			new Set(filePaths.map((path) => normalizePath(String(path || "").trim())).filter(Boolean))
		);

		for (let index = 0; index < normalizedPaths.length; index += 1) {
			const sourcePath = normalizedPaths[index];
			const resolved = await this.requireResolvedByPath(sourcePath);
			const sourceDir = normalizePath(resolved.file.path.split("/").slice(0, -1).join("/"));
			const segmentIndex = resolved.segmentIndex || index + 1;
			const targetFileName = buildWDeckFileName(normalizedName, segmentIndex);
			const targetPath = normalizePath(sourceDir ? `${sourceDir}/${targetFileName}` : targetFileName);

			if (targetPath === resolved.file.path) {
				continue;
			}

			await DirectoryUtils.ensureDirForFile(adapter, targetPath);

			const existingTarget = this.plugin.app.vault.getAbstractFileByPath(targetPath);
			if (existingTarget instanceof TFile && existingTarget.path !== resolved.file.path) {
				throw new Error(`目标 .wdeck 文件已存在: ${targetPath}`);
			}

			if (!(existingTarget instanceof TFile) && (await adapter.exists(targetPath))) {
				throw new Error(`目标 .wdeck 文件已存在: ${targetPath}`);
			}

			await this.renameDeckFile(resolved.file, targetPath);
		}
	}

	private async ensureUngroupedDeckFile(): Promise<string> {
		const existing = await this.findPrimaryDeckFile(
			WDECK_UNGROUPED_DECK_NAME,
			WDECK_UNGROUPED_DECK_NAME
		);
		if (existing) {
			return existing.file.path;
		}

		const filePath = this.buildDefaultDeckFilePath(WDECK_UNGROUPED_DECK_NAME, 1);
		await this.createDeckFile(filePath, WDECK_UNGROUPED_DECK_NAME, WDECK_UNGROUPED_DECK_NAME);
		return filePath;
	}

	private async deleteDeckFile(filePath: string): Promise<void> {
		const current = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (current instanceof TFile && this.plugin.app.fileManager?.trashFile) {
			await this.plugin.app.fileManager.trashFile(current);
			return;
		}

		const adapter = this.plugin.app.vault.adapter;
		if (await adapter.exists(filePath)) {
			await adapter.remove(filePath);
		}
	}

	private async renameDeckFile(file: TFile, targetPath: string): Promise<void> {
		const normalizedTargetPath = normalizePath(String(targetPath || "").trim());
		const abstractFile = this.plugin.app.vault.getAbstractFileByPath(file.path);
		const fileManager = this.plugin.app.fileManager as
			| { renameFile?: (file: unknown, newPath: string) => Promise<void> }
			| undefined;
		if (abstractFile && typeof fileManager?.renameFile === "function") {
			await fileManager.renameFile(abstractFile, normalizedTargetPath);
			return;
		}

		const vault = this.plugin.app.vault as { rename?: (file: unknown, newPath: string) => Promise<void> };
		if (abstractFile && typeof vault.rename === "function") {
			await vault.rename(abstractFile, normalizedTargetPath);
			return;
		}

		const adapter = this.plugin.app.vault.adapter;
		const content = await adapter.read(file.path);
		await adapter.write(normalizedTargetPath, content);
		await adapter.remove(file.path);
	}

	private async scanResolvedFiles(): Promise<ResolvedWDeckFile[]> {
		const snapshot = await this.loadSnapshot();
		return this.resolveFilesFromCache(snapshot.files);
	}

	private async loadSnapshot(forceRefresh = false): Promise<WDeckCacheSnapshot> {
		const vaultFiles = this.getVaultWDeckFiles();
		const vaultFingerprint = this.computeVaultFingerprint(vaultFiles);

		if (!forceRefresh) {
			const cached = await this.readCacheSnapshot();
			if (cached && cached.vaultFingerprint === vaultFingerprint) {
				return cached;
			}
		}

		this.clearResolvedFileCache();
		const snapshot = await this.collectSnapshot(vaultFiles, vaultFingerprint);
		await this.writeCacheSnapshot(snapshot);
		return snapshot;
	}

	private async collectSnapshot(
		vaultFiles = this.getVaultWDeckFiles(),
		vaultFingerprint = this.computeVaultFingerprint(vaultFiles)
	): Promise<WDeckCacheSnapshot> {
		const resolved = await Promise.all(vaultFiles.map((file) => this.readResolvedFile(file)));
		const validFiles = resolved.filter((item): item is ResolvedWDeckFile => !!item);
		const invalidIssues: WDeckConflictIssue[] = [];

		for (let index = 0; index < resolved.length; index += 1) {
			if (resolved[index]) continue;
			const current = this.plugin.app.vault.getAbstractFileByPath(vaultFiles[index].path);
			if (!(current instanceof TFile)) {
				continue;
			}
			invalidIssues.push({
				type: "invalid_file",
				message: `鏃犳硶瑙ｆ瀽 .wdeck 鏂囦欢: ${vaultFiles[index].path}`,
				filePaths: [vaultFiles[index].path],
			});
		}

		const conflicts = this.detectConflicts(validFiles, invalidIssues);
		const cachedFiles = validFiles.map((file) => this.toCachedResolvedFile(file));
		return {
			version: WDECK_CACHE_VERSION,
			vaultFingerprint,
			scannedAt: new Date().toISOString(),
			files: cachedFiles,
			cardLocator: this.buildCardLocator(cachedFiles),
			conflicts,
		};
	}

	private getVaultWDeckFiles(): TFile[] {
		const pluginRoot = normalizePath(getPluginDir(this.plugin.app));
		return this.plugin.app.vault
			.getFiles()
			.filter((file) => {
				if (file.extension.toLowerCase() !== WDECK_FILE_EXTENSION) {
					return false;
				}
				const normalizedPath = normalizePath(file.path);
				return normalizedPath !== pluginRoot && !normalizedPath.startsWith(`${pluginRoot}/`);
			})
			.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
	}

	private computeVaultFingerprint(files: TFile[]): string {
		return files
			.map((file) => `${file.path}::${typeof file.stat?.mtime === "number" ? file.stat.mtime : "na"}`)
			.join("|");
	}

	private getFileMTime(file: TFile): number | undefined {
		return typeof file.stat?.mtime === "number" ? file.stat.mtime : undefined;
	}

	private async readCacheSnapshot(): Promise<WDeckCacheSnapshot | null> {
		const adapter = this.plugin.app.vault.adapter;
		const cachePath = this.getCacheIndexPath();
		try {
			if (!(await adapter.exists(cachePath))) {
				return null;
			}

			const raw = await adapter.read(cachePath);
			const parsed = JSON.parse(raw) as WDeckCacheSnapshot;
			if (
				parsed?.version !== WDECK_CACHE_VERSION ||
				!Array.isArray(parsed.files) ||
				!parsed.cardLocator ||
				typeof parsed.cardLocator !== "object" ||
				Array.isArray(parsed.cardLocator) ||
				!parsed.conflicts ||
				typeof parsed.vaultFingerprint !== "string"
			) {
				return null;
			}

			const files = parsed.files
				.map((entry) => this.normalizeCachedFileEntry(entry))
				.filter((entry): entry is CachedResolvedWDeckFile => !!entry);
			if (files.length !== parsed.files.length) {
				return null;
			}

			return {
				...parsed,
				files,
				cardLocator: this.buildCardLocator(files),
			};
		} catch (error) {
            logger.warn("[WDeckService] 读取缓存失败，将重新扫描。", error);
			return null;
		}
	}

	private async writeCacheSnapshot(snapshot: WDeckCacheSnapshot): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		const pluginPaths = getPluginPaths(this.plugin.app);
		await DirectoryUtils.ensureDirRecursive(adapter, pluginPaths.cache.root);
		await adapter.write(this.getCacheIndexPath(), `${JSON.stringify(snapshot, null, 2)}\n`);
		await adapter.write(this.getCacheConflictPath(), `${JSON.stringify(snapshot.conflicts, null, 2)}\n`);
	}

	private getCacheIndexPath(): string {
		return getPluginPaths(this.plugin.app).cache.wdeckIndex;
	}

	private getCacheConflictPath(): string {
		return getPluginPaths(this.plugin.app).cache.wdeckConflicts;
	}

	private normalizeCachedFileEntry(raw: unknown): CachedResolvedWDeckFile | null {
		if (!raw || typeof raw !== "object") {
			return null;
		}

		const entry = raw as Record<string, unknown>;
		const path = String(entry.path || "").trim();
		if (!path) {
			return null;
		}

		const legacyData = entry.data as WDeckFileData | undefined;
		const cardUUIDs = Array.isArray(entry.cardUUIDs)
			? entry.cardUUIDs.map((uuid) => String(uuid || "").trim()).filter(Boolean)
			: Array.isArray(legacyData?.cards)
				? legacyData.cards.map((card) => String(card?.uuid || "").trim()).filter(Boolean)
				: null;
		if (!cardUUIDs) {
			return null;
		}

		const logicalDeckId = String(entry.logicalDeckId || legacyData?.logicalDeckId || "").trim();
		const logicalDeckName = String(entry.logicalDeckName || legacyData?.logicalDeckName || "").trim();
		const runtimeDeckId = String(entry.runtimeDeckId || "").trim();
		if (!logicalDeckId || !logicalDeckName || !runtimeDeckId) {
			return null;
		}

		const deck =
			entry.deck && typeof entry.deck === "object"
				? (entry.deck as Partial<Deck>)
				: legacyData?.deck && typeof legacyData.deck === "object"
					? (legacyData.deck as Partial<Deck>)
					: undefined;

		return {
			path,
			mtime: typeof entry.mtime === "number" ? entry.mtime : undefined,
			logicalDeckId,
			logicalDeckName,
			runtimeDeckId,
			segmentIndex:
				typeof entry.segmentIndex === "number"
					? entry.segmentIndex
					: typeof legacyData?.segmentIndex === "number"
						? legacyData.segmentIndex
						: undefined,
			segmentId:
				typeof entry.segmentId === "string"
					? entry.segmentId
					: legacyData?.segmentId,
			deck,
			cardUUIDs,
		};
	}

	private toCachedResolvedFile(file: ResolvedWDeckFile): CachedResolvedWDeckFile {
		const cards = Array.isArray(file.data.cards) ? file.data.cards : [];
		const deck =
			file.data.deck && typeof file.data.deck === "object"
				? ({ ...(file.data.deck as Partial<Deck>) } as Partial<Deck>)
				: undefined;

		return {
			path: file.file.path,
			mtime: this.getFileMTime(file.file),
			logicalDeckId: file.logicalDeckId,
			logicalDeckName: file.logicalDeckName,
			runtimeDeckId: file.runtimeDeckId,
			segmentIndex: file.segmentIndex,
			segmentId: file.segmentId,
			deck,
			cardUUIDs: cards.map((card) => String(card?.uuid || "").trim()).filter(Boolean),
		};
	}

	private buildCardLocator(
		cachedFiles: Array<Pick<CachedResolvedWDeckFile, "path" | "cardUUIDs">>
	): WDeckCardLocator {
		const locator: WDeckCardLocator = {};
		for (const file of cachedFiles) {
			for (const uuid of file.cardUUIDs || []) {
				if (!uuid) {
					continue;
				}
				locator[uuid] = file.path;
			}
		}
		return locator;
	}

	private async loadResolvedFileForCached(cached: CachedResolvedWDeckFile): Promise<ResolvedWDeckFile | null> {
		const file = this.plugin.app.vault.getAbstractFileByPath(cached.path);
		if (!(file instanceof TFile)) {
			return null;
		}

		const mtime = this.getFileMTime(file);
		if (typeof mtime === "number") {
			const sessionCached = this.resolvedFileCache.get(cached.path);
			if (sessionCached && sessionCached.mtime === mtime) {
				return sessionCached.resolved;
			}
		}

		const resolved = await this.readResolvedFile(file);
		if (resolved && typeof mtime === "number") {
			this.resolvedFileCache.set(cached.path, { mtime, resolved });
		}
		return resolved;
	}

	private async resolveFilesFromCache(cachedFiles: CachedResolvedWDeckFile[]): Promise<ResolvedWDeckFile[]> {
		const resolved: ResolvedWDeckFile[] = [];
		for (const cached of cachedFiles) {
			const loaded = await this.loadResolvedFileForCached(cached);
			if (loaded) {
				resolved.push(loaded);
			}
		}
		return resolved;
	}

	private async resolveCachedFilesByPredicate(
		cachedFiles: CachedResolvedWDeckFile[],
		predicate: (file: CachedResolvedWDeckFile) => boolean
	): Promise<ResolvedWDeckFile[]> {
		return this.resolveFilesFromCache(cachedFiles.filter(predicate));
	}

	private async buildCardsFromCachedFiles(cachedFiles: CachedResolvedWDeckFile[]): Promise<Card[]> {
		const resolvedFiles = await this.resolveFilesFromCache(cachedFiles);
		const allCards: Card[] = [];
		for (const resolved of resolvedFiles) {
			const cachedMeta: CachedResolvedWDeckFile = {
				path: resolved.file.path,
				mtime: this.getFileMTime(resolved.file),
				logicalDeckId: resolved.logicalDeckId,
				logicalDeckName: resolved.logicalDeckName,
				runtimeDeckId: resolved.runtimeDeckId,
				segmentIndex: resolved.segmentIndex,
				segmentId: resolved.segmentId,
				deck:
					resolved.data.deck && typeof resolved.data.deck === "object"
						? (resolved.data.deck as Partial<Deck>)
						: undefined,
				cardUUIDs: (resolved.data.cards || [])
					.map((card) => String(card?.uuid || "").trim())
					.filter(Boolean),
			};
			for (const card of Array.isArray(resolved.data.cards) ? resolved.data.cards : []) {
				if (!card?.uuid) {
					continue;
				}
				allCards.push(this.decorateCachedCard(card, cachedMeta));
			}
		}
		return allCards;
	}

	private async findDecoratedCardInCachedFile(
		cached: CachedResolvedWDeckFile,
		uuid: string
	): Promise<Card | null> {
		const resolved = await this.loadResolvedFileForCached(cached);
		if (!resolved) {
			return null;
		}

		for (const card of Array.isArray(resolved.data.cards) ? resolved.data.cards : []) {
			if (card?.uuid === uuid) {
				return this.decorateCachedCard(card, cached);
			}
		}
		return null;
	}

	private async collectDecoratedCardsFromCachedFile(
		cached: CachedResolvedWDeckFile,
		targetUUIDs: Set<string>,
		foundCards: Map<string, Card>
	): Promise<void> {
		const resolved = await this.loadResolvedFileForCached(cached);
		if (!resolved) {
			return;
		}

		for (const card of Array.isArray(resolved.data.cards) ? resolved.data.cards : []) {
			if (card?.uuid && targetUUIDs.has(card.uuid) && !foundCards.has(card.uuid)) {
				foundCards.set(card.uuid, this.decorateCachedCard(card, cached));
			}
		}
	}

	private buildDeckSummariesFromCachedFiles(cachedFiles: CachedResolvedWDeckFile[]): WDeckDeckSummary[] {
		const grouped = new Map<string, CachedResolvedWDeckFile[]>();
		for (const cached of cachedFiles) {
			const list = grouped.get(cached.runtimeDeckId);
			if (list) {
				list.push(cached);
			} else {
				grouped.set(cached.runtimeDeckId, [cached]);
			}
		}

		return Array.from(grouped.values())
			.map((files) => this.buildDeckSummaryFromCachedMembers(files))
			.sort((a, b) => a.logicalDeckName.localeCompare(b.logicalDeckName, "zh-CN"));
	}

	private async buildDeckAggregatesFromCachedFiles(
		cachedFiles: CachedResolvedWDeckFile[]
	): Promise<WDeckDeckAggregate[]> {
		const grouped = new Map<string, CachedResolvedWDeckFile[]>();
		for (const cached of cachedFiles) {
			const list = grouped.get(cached.runtimeDeckId);
			if (list) {
				list.push(cached);
			} else {
				grouped.set(cached.runtimeDeckId, [cached]);
			}
		}

		const aggregates: WDeckDeckAggregate[] = [];
		for (const files of grouped.values()) {
			aggregates.push(await this.buildAggregateFromCachedMembers(files));
		}
		return aggregates;
	}

	private sortCachedFilesBySegment(files: CachedResolvedWDeckFile[]): CachedResolvedWDeckFile[] {
		return [...files].sort((a, b) => {
			const aIndex = a.segmentIndex ?? Number.MAX_SAFE_INTEGER;
			const bIndex = b.segmentIndex ?? Number.MAX_SAFE_INTEGER;
			if (aIndex !== bIndex) return aIndex - bIndex;
			return a.path.localeCompare(b.path, "zh-CN");
		});
	}

	private buildDeckSummaryFromCachedMembers(files: CachedResolvedWDeckFile[]): WDeckDeckSummary {
		const sortedFiles = this.sortCachedFilesBySegment(files);

		const segmentIndices: number[] = [];
		const cardUUIDs: string[] = [];
		const seenUUIDs = new Set<string>();
		const deckDefinition =
			sortedFiles
				.map((file) => (file.deck && typeof file.deck === "object" ? file.deck : null))
				.find((candidate): candidate is Partial<Deck> => !!candidate) || undefined;

		for (const file of sortedFiles) {
			if (file.segmentIndex !== undefined) {
				segmentIndices.push(file.segmentIndex);
			}

			for (const uuid of file.cardUUIDs || []) {
				if (!uuid || seenUUIDs.has(uuid)) {
					continue;
				}
				seenUUIDs.add(uuid);
				cardUUIDs.push(uuid);
			}
		}

		const first = sortedFiles[0];
		const logicalDeckName =
			String(deckDefinition?.name || first.logicalDeckName || "").trim() || first.logicalDeckName;
		return {
			runtimeDeckId: first.runtimeDeckId,
			logicalDeckId: first.logicalDeckId,
			logicalDeckName,
			filePaths: sortedFiles.map((file) => file.path),
			segmentIndices,
			deck: deckDefinition
				? {
						...deckDefinition,
						id: first.logicalDeckId,
						name: logicalDeckName,
				  }
				: undefined,
			cardUUIDs,
		};
	}

	private async buildAggregateFromCachedMembers(files: CachedResolvedWDeckFile[]): Promise<WDeckDeckAggregate> {
		const members = await this.resolveFilesFromCache(files);
		return this.buildAggregate(members);
	}

	private async refreshCacheAfterWrites(touchedPaths: Iterable<string>): Promise<void> {
		const normalizedTouchedPaths = Array.from(
			new Set(Array.from(touchedPaths || []).map((path) => normalizePath(String(path || "").trim())).filter(Boolean))
		);
		if (normalizedTouchedPaths.length === 0) {
			return;
		}

		for (const path of normalizedTouchedPaths) {
			this.resolvedFileCache.delete(path);
		}

		const updated = await this.updateCacheSnapshotIncrementally(normalizedTouchedPaths);
		if (!updated) {
			await this.rebuildCache();
		}
	}

	private async updateCacheSnapshotIncrementally(touchedPaths: string[]): Promise<boolean> {
		const cached = await this.readCacheSnapshot();
		if (!cached) {
			return false;
		}

		const currentVaultFiles = this.getVaultWDeckFiles();
		const currentFilesByPath = new Map(currentVaultFiles.map((file) => [file.path, file] as const));
		const touchedSet = new Set(touchedPaths);
		const cachedPaths = new Set(cached.files.map((file) => file.path));
		const nextCachedFiles: CachedResolvedWDeckFile[] = [];

		for (const cachedFile of cached.files) {
			const currentFile = currentFilesByPath.get(cachedFile.path);
			if (!currentFile) {
				if (!touchedSet.has(cachedFile.path)) {
					return false;
				}
				continue;
			}

			if (touchedSet.has(cachedFile.path)) {
				continue;
			}

			const currentMTime = this.getFileMTime(currentFile);
			if (typeof currentMTime !== "number") {
				return false;
			}

			if (typeof cachedFile.mtime === "number" && cachedFile.mtime === currentMTime) {
				nextCachedFiles.push({
					...cachedFile,
					mtime: currentMTime,
				});
				continue;
			}

			const refreshedUntouched = await this.readResolvedFile(currentFile);
			if (!refreshedUntouched) {
				return false;
			}
			nextCachedFiles.push(this.toCachedResolvedFile(refreshedUntouched));
		}

		for (const path of touchedSet) {
			const currentFile = currentFilesByPath.get(path);
			if (!currentFile) {
				continue;
			}

			const resolved = await this.readResolvedFile(currentFile);
			if (!resolved) {
				return false;
			}

			nextCachedFiles.push(this.toCachedResolvedFile(resolved));
		}

		for (const [path] of currentFilesByPath) {
			if (touchedSet.has(path)) {
				continue;
			}

			if (!cachedPaths.has(path)) {
				const newResolved = await this.readResolvedFile(currentFilesByPath.get(path)!);
				if (!newResolved) {
					return false;
				}
				nextCachedFiles.push(this.toCachedResolvedFile(newResolved));
				continue;
			}

			if (!nextCachedFiles.some((file) => file.path === path)) {
				return false;
			}
		}

		nextCachedFiles.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
		const resolvedFiles = await this.resolveFilesFromCache(nextCachedFiles);
		await this.writeCacheSnapshot({
			version: WDECK_CACHE_VERSION,
			vaultFingerprint: this.computeVaultFingerprint(currentVaultFiles),
			scannedAt: new Date().toISOString(),
			files: nextCachedFiles,
			cardLocator: this.buildCardLocator(nextCachedFiles),
			conflicts: this.detectConflicts(resolvedFiles),
		});
		return true;
	}

	private detectConflicts(
		files: ResolvedWDeckFile[],
		seedIssues: WDeckConflictIssue[] = []
	): WDeckConflictReport {
		const issues = [...seedIssues];

		const segmentOwners = new Map<string, ResolvedWDeckFile[]>();
		for (const file of files) {
			const segmentKey = `${file.runtimeDeckId}::${file.segmentIndex ?? "na"}`;
			const list = segmentOwners.get(segmentKey) || [];
			list.push(file);
			segmentOwners.set(segmentKey, list);
		}

		for (const [key, list] of segmentOwners.entries()) {
			if (list.length <= 1) continue;
			const first = list[0];
			issues.push({
				type: "duplicate_segment",
				logicalDeckId: first.logicalDeckId,
				filePaths: list.map((item) => item.file.path),
                message: `逻辑牌组 ${first.logicalDeckName} 存在重复分卷 ${key.split("::")[1] || "未编号"}。`,
			});
		}

		const uuidOwners = new Map<string, Set<string>>();
		for (const file of files) {
			for (const card of file.data.cards || []) {
				if (!card?.uuid) continue;
				const owners = uuidOwners.get(card.uuid) || new Set<string>();
				owners.add(file.file.path);
				uuidOwners.set(card.uuid, owners);
			}
		}

		for (const [uuid, owners] of uuidOwners.entries()) {
			if (owners.size <= 1) continue;
			issues.push({
				type: "uuid_conflict",
				cardUUID: uuid,
				filePaths: Array.from(owners),
                message: `卡片 UUID ${uuid} 同时存在于多个 .wdeck 文件中。`,
			});
		}

		const contentOwners = new Map<string, ResolvedWDeckFile[]>();
		for (const file of files) {
			const signature = JSON.stringify({
				logicalDeckId: file.logicalDeckId,
				logicalDeckName: file.logicalDeckName,
				cards: (file.data.cards || []).map((card) => ({
					uuid: card.uuid,
					content: card.content,
					fsrs: card.fsrs,
					reviewHistory: card.reviewHistory,
					stats: card.stats,
				})),
			});
			const list = contentOwners.get(signature) || [];
			list.push(file);
			contentOwners.set(signature, list);
		}

		for (const list of contentOwners.values()) {
			if (list.length <= 1) continue;
			issues.push({
				type: "suspected_duplicate_copy",
				logicalDeckId: list[0].logicalDeckId,
                filePaths: list.map((item) => item.file.path),
                message: "检测到内容高度重复的 .wdeck 文件副本，请人工确认是否重复复制。",
			});
		}

		return {
			scannedFiles: files.length,
			issues,
		};
	}

	private async requireResolvedByPath(filePath: string): Promise<ResolvedWDeckFile> {
		const resolvedFiles = await this.scanResolvedFiles();
		const resolved = resolvedFiles.find((item) => item.file.path === filePath);
		if (!resolved) {
            throw new Error("WDeck parse failed: " + filePath);
		}
		return resolved;
	}

	private buildReadFailureFingerprint(file: TFile, error: unknown, raw?: string): string {
		const errorFingerprint =
			error instanceof Error ? `${error.name}:${error.message}` : String(error);
		const fileFingerprint =
			typeof raw === "string"
				? `raw:${raw.length}:${raw.slice(0, 160)}`
				: `mtime:${typeof file.stat?.mtime === "number" ? file.stat.mtime : "na"}`;
		return `${fileFingerprint}::${errorFingerprint}`;
	}

	private isTransientMissingFile(file: TFile, error: unknown): boolean {
		const current = this.plugin.app.vault.getAbstractFileByPath(file.path);
		if (current instanceof TFile) {
			return false;
		}

		const message = error instanceof Error ? error.message : String(error || "");
		return /ENOENT|not found|no such file or directory/i.test(message);
	}

	private warnReadFailureOnce(file: TFile, error: unknown, raw?: string): void {
		const fingerprint = this.buildReadFailureFingerprint(file, error, raw);
		if (this.readFailureFingerprints.get(file.path) === fingerprint) {
			return;
		}

		this.readFailureFingerprints.set(file.path, fingerprint);
		logger.warn(
			`[WDeckService] 读取 WDeck 文件失败: ${file.path}。同一文件的重复失败将暂时静默，请在数据管理中修复 .wdeck 冲突。`,
			error
		);
	}

	private async readResolvedFile(file: TFile): Promise<ResolvedWDeckFile | null> {
		let raw: string | undefined;
		let parsed: WDeckFileData | null = null;
		try {
			raw = await this.plugin.app.vault.cachedRead(file);
			if (!raw.trim()) {
				throw new SyntaxError("WDeck 文件为空");
			}
			parsed = JSON.parse(raw) as WDeckFileData;
		} catch (error) {
			parsed = await safeReadJson<WDeckFileData>(
				this.plugin.app.vault.adapter as any,
				file.path,
				this.plugin.app as any
			);
			if (!parsed) {
				if (this.isTransientMissingFile(file, error)) {
					this.readFailureFingerprints.delete(file.path);
					return null;
				}
				this.warnReadFailureOnce(file, error, raw);
				return null;
			}
		}

		try {
			const fileNameInfo = parseWDeckFileName(file.basename);
			const parsedDeck =
				parsed?.deck && typeof parsed.deck === "object" ? (parsed.deck as Partial<Deck>) : null;
			const logicalDeckName =
				String(parsedDeck?.name || parsed?.logicalDeckName || "").trim() ||
				fileNameInfo.logicalDeckName ||
				file.basename;
			const logicalDeckId = normalizeWDeckLogicalDeckId(
				String(parsed?.logicalDeckId || parsedDeck?.id || "").trim(),
				logicalDeckName || file.basename
			);
			const runtimeDeckId = toWDeckRuntimeDeckId(logicalDeckId);
			const segmentIndex =
				typeof parsed?.segmentIndex === "number" && Number.isFinite(parsed.segmentIndex)
					? parsed.segmentIndex
					: fileNameInfo.segmentIndex;
			const segmentId = String(parsed?.segmentId || "").trim() || undefined;
			const resolved = {
				file,
				data: parsed,
				logicalDeckId,
				logicalDeckName,
				runtimeDeckId,
				segmentIndex,
				segmentId,
			};
			this.readFailureFingerprints.delete(file.path);
			return resolved;
		} catch (error) {
			this.warnReadFailureOnce(file, error, raw);
			return null;
		}
	}

	private buildAggregate(files: ResolvedWDeckFile[]): WDeckDeckAggregate {
		const sortedFiles = this.sortResolvedFilesBySegment(files);

		const cardMap = new Map<string, Card>();
		const segmentIndices: number[] = [];
		const deckDefinition =
			sortedFiles
				.map((resolved) =>
					resolved.data.deck && typeof resolved.data.deck === "object"
						? (resolved.data.deck as Partial<Deck>)
						: null
				)
				.find((candidate): candidate is Partial<Deck> => !!candidate) || undefined;

		for (const resolved of sortedFiles) {
			if (resolved.segmentIndex !== undefined) {
				segmentIndices.push(resolved.segmentIndex);
			}

			const cards = Array.isArray(resolved.data.cards) ? resolved.data.cards : [];
			for (const card of cards) {
				if (!card?.uuid) continue;
				cardMap.set(card.uuid, this.decorateCard(card, resolved));
			}
		}

		const first = sortedFiles[0];
		const logicalDeckName =
			String(deckDefinition?.name || first.logicalDeckName || "").trim() || first.logicalDeckName;
		return {
			runtimeDeckId: first.runtimeDeckId,
			logicalDeckId: first.logicalDeckId,
			logicalDeckName,
			files: sortedFiles.map((item) => item.file),
			segmentIndices,
			deck: deckDefinition
				? {
						...deckDefinition,
						id: first.logicalDeckId,
						name: logicalDeckName,
				  }
				: undefined,
			cards: Array.from(cardMap.values()),
		};
	}

	private findDecoratedCardInResolvedFiles(uuid: string, files: ResolvedWDeckFile[]): Card | null {
		for (const resolved of files) {
			const found = (resolved.data.cards || []).find((card) => card?.uuid === uuid);
			if (found) {
				return this.decorateCard(found, resolved);
			}
		}
		return null;
	}

	private buildDeckDefinition(
		deck: Partial<Deck>,
		logicalDeckId: string,
		logicalDeckName: string
	): Partial<Deck> {
		const now = new Date().toISOString();
		const metadata =
			deck.metadata && typeof deck.metadata === "object"
				? { ...(deck.metadata as Record<string, unknown>) }
				: {};

		delete metadata.fileType;
		delete metadata.logicalDeckId;
		delete metadata.filePaths;
		delete metadata.segmentIndices;
		delete metadata.wdeckMigration;

		const nextDeck: Partial<Deck> = {
			...deck,
			id: logicalDeckId,
			name: logicalDeckName,
			purpose: deck.purpose === "test" ? "test" : "memory",
			created: deck.created || now,
			modified: deck.modified || now,
			metadata,
		};

		delete nextDeck.cardUUIDs;
		return nextDeck;
	}

	private buildRuntimeCardMeta(source: WDeckRuntimeCardSource): WDeckRuntimeCardMeta {
		return {
			runtimeDeckId: source.runtimeDeckId,
			logicalDeckId: source.logicalDeckId,
			logicalDeckName: source.logicalDeckName,
			segmentId: source.segmentId,
			segmentIndex: source.segmentIndex,
			sourcePath: source.path,
		};
	}

	private decorateCachedCard(card: Card, cached: WDeckRuntimeCardSource): Card {
		const customFields = card.customFields && typeof card.customFields === "object" ? card.customFields : {};
		const runtimeMeta = this.buildRuntimeCardMeta(cached);

		const referencedByDecks = Array.isArray(card.referencedByDecks)
			? Array.from(new Set([cached.runtimeDeckId, ...card.referencedByDecks]))
			: [cached.runtimeDeckId];

		return {
			...card,
			deckId: cached.runtimeDeckId,
			referencedByDecks,
			customFields: {
				...customFields,
				wdeck: runtimeMeta,
			},
		};
	}

	private decorateCard(card: Card, resolved: ResolvedWDeckFile): Card {
		return this.decorateCachedCard(card, {
			path: resolved.file.path,
			runtimeDeckId: resolved.runtimeDeckId,
			logicalDeckId: resolved.logicalDeckId,
			logicalDeckName: resolved.logicalDeckName,
			segmentId: resolved.segmentId,
			segmentIndex: resolved.segmentIndex,
		});
	}

	private stripRuntimeCardMeta(card: Card): Card {
		const customFields = card.customFields && typeof card.customFields === "object" ? { ...card.customFields } : {};
		if ("wdeck" in customFields) {
			delete (customFields as Record<string, unknown>).wdeck;
		}

		const nextCard = {
			...card,
			deckId: undefined,
			referencedByDecks: undefined,
			fields: undefined,
			template: undefined,
			templateId: undefined,
			customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
		};

		return nextCard as Card;
	}

	private getRuntimeCardMeta(card: Card): WDeckRuntimeCardMeta | null {
		const marker = (card.customFields as Record<string, unknown> | undefined)?.wdeck;
		if (!marker || typeof marker !== "object") {
			return null;
		}

		const typedMarker = marker as Partial<WDeckRuntimeCardMeta>;
		if (!typedMarker.sourcePath || !typedMarker.runtimeDeckId) {
			return null;
		}

		return {
			runtimeDeckId: String(typedMarker.runtimeDeckId),
			logicalDeckId: String(typedMarker.logicalDeckId || ""),
			logicalDeckName: String(typedMarker.logicalDeckName || ""),
			segmentId: typedMarker.segmentId ? String(typedMarker.segmentId) : undefined,
			segmentIndex:
				typeof typedMarker.segmentIndex === "number" ? typedMarker.segmentIndex : undefined,
			sourcePath: String(typedMarker.sourcePath),
		};
	}

	private async resolvePreferredDeckForCard(
		card: Pick<Card, "deckId">,
		runtimeMeta?: WDeckRuntimeCardMeta | null
	): Promise<{ deck: Pick<Deck, "id" | "name">; sameLogicalDeck: boolean }> {
		const currentLogicalDeckId = runtimeMeta
			? this.normalizeDeckId(runtimeMeta.logicalDeckId || runtimeMeta.runtimeDeckId, runtimeMeta.logicalDeckName)
			: "";
		const ungroupedLogicalDeckId = this.normalizeDeckId(
			WDECK_UNGROUPED_DECK_NAME,
			WDECK_UNGROUPED_DECK_NAME
		);
		const requestedDeckId = String(card.deckId || "").trim();

		if (!requestedDeckId) {
			return {
				deck: {
					id: WDECK_UNGROUPED_DECK_NAME,
					name: WDECK_UNGROUPED_DECK_NAME,
				},
				sameLogicalDeck: currentLogicalDeckId === ungroupedLogicalDeckId,
			};
		}

		const deckInfo = await this.getDeckInfoByAnyDeckId(requestedDeckId);
		if (deckInfo) {
			const targetLogicalDeckId = this.normalizeDeckId(
				deckInfo.logicalDeckId || requestedDeckId,
				deckInfo.logicalDeckName
			);
			return {
				deck: {
					id: deckInfo.logicalDeckId || requestedDeckId,
					name: deckInfo.logicalDeckName,
				},
				sameLogicalDeck: currentLogicalDeckId === targetLogicalDeckId,
			};
		}

		const persistedDeck =
			typeof this.plugin.dataStorage?.getDeck === "function"
				? await this.plugin.dataStorage
						.getDeck(requestedDeckId)
						.catch(() => null)
				: null;
		if (persistedDeck && persistedDeck.purpose !== "test") {
			const targetLogicalDeckId = this.normalizeDeckId(persistedDeck.id, persistedDeck.name);
			return {
				deck: {
					id: persistedDeck.id,
					name: persistedDeck.name,
				},
				sameLogicalDeck: currentLogicalDeckId === targetLogicalDeckId,
			};
		}

		return {
			deck: {
				id: WDECK_UNGROUPED_DECK_NAME,
				name: WDECK_UNGROUPED_DECK_NAME,
			},
			sameLogicalDeck: currentLogicalDeckId === ungroupedLogicalDeckId,
		};
	}

	private async writeDeckFile(file: TFile, data: WDeckFileData): Promise<void> {
		const normalized = this.normalizeDeckFileDataForPersistence(
			data as WDeckFileData & Record<string, unknown>,
			file.path
		);
		const serialized = JSON.stringify(normalized, null, 2);
		await safeWriteJson(
			this.plugin.app.vault.adapter as any,
			file.path,
			serialized + "\n",
			this.plugin.app as any
		);
	}
}
