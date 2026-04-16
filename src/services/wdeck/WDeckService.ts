import { TFile } from "obsidian";
import { getPluginPaths, getV2Paths, normalizeWeaveParentFolder } from "../../config/paths";
import type { Card, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { sanitizeForSync } from "../../utils/sync-safe-filename";
import { ensureWeaveDataReadmesForPath } from "../../utils/weave-data-readme";

export const WDECK_FILE_EXTENSION = "wdeck";
export const WDECK_RUNTIME_DECK_PREFIX = "wdeck:";
export const WDECK_UNGROUPED_DECK_NAME = "未归组卡片";
const WDECK_CACHE_VERSION = 1;

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

type CachedResolvedWDeckFile = Omit<ResolvedWDeckFile, "file"> & {
	path: string;
};

type WDeckCacheSnapshot = {
	version: number;
	vaultFingerprint: string;
	scannedAt: string;
	files: CachedResolvedWDeckFile[];
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

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
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

		const resolvedFiles = await this.scanResolvedFiles();
		const members = resolvedFiles.filter((file) => file.runtimeDeckId === deckId);
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
		const resolvedFiles = await this.scanResolvedFiles();
		const members = resolvedFiles.filter((file) => file.logicalDeckId === logicalDeckId);
		if (members.length === 0) {
			return null;
		}

		return this.buildAggregate(members);
	}

	async loadDeckAggregateFromFilePath(filePath: string): Promise<WDeckDeckAggregate> {
		const resolvedFiles = await this.scanResolvedFiles();
		const target = resolvedFiles.find((item) => item.file.path === filePath);

		if (!target) {
            throw new Error(`WDeck 文件不存在或无法解析: ${filePath}`);
		}

		const members = resolvedFiles.filter((item) => item.runtimeDeckId === target.runtimeDeckId);
		return this.buildAggregate(members);
	}

	async getAllCards(): Promise<Card[]> {
		const resolvedFiles = await this.scanResolvedFiles();
		const allCards: Card[] = [];

		for (const resolved of resolvedFiles) {
			const cards = Array.isArray(resolved.data.cards) ? resolved.data.cards : [];
			for (const card of cards) {
				allCards.push(this.decorateCard(card, resolved));
			}
		}

		return allCards;
	}

	async getAllDeckAggregates(): Promise<WDeckDeckAggregate[]> {
		const resolvedFiles = await this.scanResolvedFiles();
		const grouped = new Map<string, ResolvedWDeckFile[]>();

		for (const resolved of resolvedFiles) {
			const list = grouped.get(resolved.runtimeDeckId);
			if (list) {
				list.push(resolved);
			} else {
				grouped.set(resolved.runtimeDeckId, [resolved]);
			}
		}

		return Array.from(grouped.values()).map((files) => this.buildAggregate(files));
	}

	async getCardByUUID(uuid: string): Promise<Card | null> {
		if (!uuid) return null;

		const resolvedFiles = await this.scanResolvedFiles();
		for (const resolved of resolvedFiles) {
			const cards = Array.isArray(resolved.data.cards) ? resolved.data.cards : [];
			const found = cards.find((card) => card?.uuid === uuid);
			if (found) {
				return this.decorateCard(found, resolved);
			}
		}

		return null;
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

	async rebuildCache(): Promise<WDeckCacheStatus> {
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
		await this.createDeckFile(filePath, logicalDeckId, logicalDeckName);
		await this.rebuildCache();
		return filePath;
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
			(await this.loadDeckAggregateFromFilePath(filePath));
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
		options: { skipRebuild?: boolean } = {}
	): Promise<Card[]> {
		const filePath = await this.ensureDeckFileForDeck(deck);
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`WDeck 牌组文件不存在: ${filePath}`);
		}

		const resolved = await this.readResolvedFile(file);
		if (!resolved) {
			throw new Error(`无法读取 WDeck 牌组文件: ${filePath}`);
		}

		const targetUUIDs = Array.from(new Set(cards.map((card) => String(card?.uuid || "").trim()).filter(Boolean)));
		await this.stripCardUUIDsFromOtherFiles(targetUUIDs, [filePath]);

		const latestResolved = (await this.readResolvedFile(file)) || resolved;
		const merged = new Map<string, Card>();
		for (const existing of Array.isArray(latestResolved.data.cards) ? latestResolved.data.cards : []) {
			if (existing?.uuid) {
				merged.set(existing.uuid, existing);
			}
		}

		for (const card of cards) {
			const stripped = this.stripRuntimeCardMeta(card);
			if (stripped?.uuid) {
				merged.set(stripped.uuid, stripped);
			}
		}

		await this.writeDeckFile(resolved.file, {
			...latestResolved.data,
			fileType: "wdeck",
			logicalDeckId: latestResolved.logicalDeckId,
			logicalDeckName: latestResolved.logicalDeckName,
			segmentId:
				latestResolved.segmentId ||
				buildWDeckSegmentId(latestResolved.logicalDeckName, latestResolved.segmentIndex || 1),
			segmentIndex: latestResolved.segmentIndex || 1,
			segmentLabel: buildWDeckSegmentLabel(latestResolved.segmentIndex || 1),
			cards: Array.from(merged.values()),
		});

		if (!options.skipRebuild) {
			await this.rebuildCache();
		}
		const refreshed = await this.readResolvedFile(file);
		if (!refreshed) {
			throw new Error(`无法重新读取 WDeck 牌组文件: ${filePath}`);
		}
		return cards
			.map((card) => {
				const stored = (refreshed.data.cards || []).find((item) => item?.uuid === card.uuid);
				return stored ? this.decorateCard(stored, refreshed) : null;
			})
			.filter((card): card is Card => !!card);
	}

	async replaceDeckCardsForDeck(deck: Pick<Deck, "id" | "name">, cards: Card[]): Promise<Card[]> {
		const filePath = await this.ensureDeckFileForDeck(deck);
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`WDeck 牌组文件不存在: ${filePath}`);
		}

		const resolved = await this.readResolvedFile(file);
		if (!resolved) {
			throw new Error(`无法读取 WDeck 牌组文件: ${filePath}`);
		}
		const payloadCards = cards
			.map((card) => this.stripRuntimeCardMeta(card))
			.filter((card): card is Card => !!card?.uuid);
		await this.stripCardUUIDsFromOtherFiles(
			payloadCards.map((card) => card.uuid),
			[filePath]
		);

		await this.writeDeckFile(file, {
			...resolved.data,
			fileType: "wdeck",
			logicalDeckId: resolved.logicalDeckId,
			logicalDeckName: resolved.logicalDeckName,
			segmentId: resolved.segmentId || buildWDeckSegmentId(resolved.logicalDeckName, resolved.segmentIndex || 1),
			segmentIndex: resolved.segmentIndex || 1,
			segmentLabel: buildWDeckSegmentLabel(resolved.segmentIndex || 1),
			cards: payloadCards,
		});

		await this.rebuildCache();
		const refreshed = await this.readResolvedFile(file);
		if (!refreshed) {
			throw new Error(`无法重新读取 WDeck 牌组文件: ${filePath}`);
		}
		return (refreshed.data.cards || []).map((card) => this.decorateCard(card, refreshed));
	}

	async saveCard(card: Card): Promise<Card> {
		return this.saveCardInternal(card);
	}

	private async saveCardInternal(
		card: Card,
		options: { skipRebuild?: boolean } = {}
	): Promise<Card> {
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

		await this.writeDeckFile(file, {
			...resolved.data,
			cards,
		});

		if (!options.skipRebuild) {
			await this.rebuildCache();
		}
		const refreshed = await this.readResolvedFile(file);
		if (!refreshed) {
			throw new Error(`无法重新读取 WDeck 牌组文件: ${runtimeMeta.sourcePath}`);
		}
		return this.decorateCard(cardToPersist, refreshed);
	}

	async saveCardsBatch(cards: Card[]): Promise<void> {
		for (const card of cards) {
			await this.saveCardInternal(card, { skipRebuild: true });
		}

		if (cards.length > 0) {
			await this.rebuildCache();
		}
	}

	async deleteCardByUUID(uuid: string): Promise<boolean> {
		const deleted = await this.deleteCardsByUUIDs([uuid]);
		return deleted.includes(uuid);
	}

	async deleteCardsByUUIDs(uuids: string[]): Promise<string[]> {
		const targetUUIDs = new Set((uuids || []).filter(Boolean));
		if (targetUUIDs.size === 0) {
			return [];
		}

		const deleted: string[] = [];
		const resolvedFiles = await this.scanResolvedFiles();

		for (const resolved of resolvedFiles) {
			const cards = Array.isArray(resolved.data.cards) ? resolved.data.cards : [];
			if (cards.length === 0) {
				continue;
			}

			const remainingCards = cards.filter((card) => {
				if (!card?.uuid || !targetUUIDs.has(card.uuid)) {
					return true;
				}

				deleted.push(card.uuid);
				return false;
			});

			if (remainingCards.length !== cards.length) {
				await this.writeDeckFile(resolved.file, {
					...resolved.data,
					cards: remainingCards,
				});
			}
		}

		if (deleted.length > 0) {
			await this.rebuildCache();
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
	): Promise<void> {
		const targetUUIDs = new Set(Array.from(uuids || []).filter(Boolean));
		if (targetUUIDs.size === 0) {
			return;
		}

		const retained = new Set(retainedFilePaths.map((path) => String(path || "").trim()).filter(Boolean));
		const resolvedFiles = await this.scanResolvedFilesFresh();
		for (const resolved of resolvedFiles) {
			if (retained.has(resolved.file.path)) {
				continue;
			}

			const cards = Array.isArray(resolved.data.cards) ? resolved.data.cards : [];
			if (cards.length === 0) {
				continue;
			}

			const remainingCards = cards.filter((card) => !card?.uuid || !targetUUIDs.has(card.uuid));
			if (remainingCards.length === cards.length) {
				continue;
			}

			await this.writeDeckFile(resolved.file, {
				...resolved.data,
				cards: remainingCards,
			});
		}
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

	private buildDefaultDeckFilePath(logicalDeckName: string, segmentIndex: number): string {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const folderPath = `${getV2Paths(parentFolder).memory.root}/deck-files`;
		return `${folderPath}/${buildWDeckFileName(logicalDeckName, segmentIndex)}`;
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

	private async createDeckFile(
		filePath: string,
		logicalDeckId: string,
		logicalDeckName: string
	): Promise<void> {
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
		await adapter.write(filePath, `${JSON.stringify(payload, null, 2)}\n`);
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
			invalidIssues.push({
				type: "invalid_file",
				message: `鏃犳硶瑙ｆ瀽 .wdeck 鏂囦欢: ${vaultFiles[index].path}`,
				filePaths: [vaultFiles[index].path],
			});
		}

		const conflicts = this.detectConflicts(validFiles, invalidIssues);
		return {
			version: WDECK_CACHE_VERSION,
			vaultFingerprint,
			scannedAt: new Date().toISOString(),
			files: validFiles.map((file) => this.toCachedResolvedFile(file)),
			conflicts,
		};
	}

	private getVaultWDeckFiles(): TFile[] {
		return this.plugin.app.vault
			.getFiles()
			.filter((file) => file.extension.toLowerCase() === WDECK_FILE_EXTENSION)
			.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
	}

	private computeVaultFingerprint(files: TFile[]): string {
		return files
			.map((file) => `${file.path}::${typeof file.stat?.mtime === "number" ? file.stat.mtime : "na"}`)
			.join("|");
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
				!parsed.conflicts ||
				typeof parsed.vaultFingerprint !== "string"
			) {
				return null;
			}

			return parsed;
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

	private toCachedResolvedFile(file: ResolvedWDeckFile): CachedResolvedWDeckFile {
		return {
			path: file.file.path,
			data: file.data,
			logicalDeckId: file.logicalDeckId,
			logicalDeckName: file.logicalDeckName,
			runtimeDeckId: file.runtimeDeckId,
			segmentIndex: file.segmentIndex,
			segmentId: file.segmentId,
		};
	}

	private resolveFilesFromCache(cachedFiles: CachedResolvedWDeckFile[]): ResolvedWDeckFile[] {
		const resolved: ResolvedWDeckFile[] = [];
		for (const cached of cachedFiles) {
			const file = this.plugin.app.vault.getAbstractFileByPath(cached.path);
			if (!(file instanceof TFile)) {
				continue;
			}

			resolved.push({
				file,
				data: cached.data,
				logicalDeckId: cached.logicalDeckId,
				logicalDeckName: cached.logicalDeckName,
				runtimeDeckId: cached.runtimeDeckId,
				segmentIndex: cached.segmentIndex,
				segmentId: cached.segmentId,
			});
		}
		return resolved;
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
		try {
			raw = await this.plugin.app.vault.cachedRead(file);
			if (!raw.trim()) {
				throw new SyntaxError("WDeck 文件为空");
			}
			const parsed = JSON.parse(raw) as WDeckFileData;
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

			const resolved = {
				file,
				data: parsed,
				logicalDeckId,
				logicalDeckName,
				runtimeDeckId,
				segmentIndex,
				segmentId: String(parsed?.segmentId || "").trim() || undefined,
			};
			this.readFailureFingerprints.delete(file.path);
			return resolved;
		} catch (error) {
			this.warnReadFailureOnce(file, error, raw);
			return null;
		}
	}

	private buildAggregate(files: ResolvedWDeckFile[]): WDeckDeckAggregate {
		const sortedFiles = [...files].sort((a, b) => {
			const aIndex = a.segmentIndex ?? Number.MAX_SAFE_INTEGER;
			const bIndex = b.segmentIndex ?? Number.MAX_SAFE_INTEGER;
			if (aIndex !== bIndex) return aIndex - bIndex;
			return a.file.path.localeCompare(b.file.path, "zh-CN");
		});

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

	private decorateCard(card: Card, resolved: ResolvedWDeckFile): Card {
		const customFields = card.customFields && typeof card.customFields === "object" ? card.customFields : {};
		const runtimeMeta: WDeckRuntimeCardMeta = {
			runtimeDeckId: resolved.runtimeDeckId,
			logicalDeckId: resolved.logicalDeckId,
			logicalDeckName: resolved.logicalDeckName,
			segmentId: resolved.segmentId,
			segmentIndex: resolved.segmentIndex,
			sourcePath: resolved.file.path,
		};

		const referencedByDecks = Array.isArray(card.referencedByDecks)
			? Array.from(new Set([resolved.runtimeDeckId, ...card.referencedByDecks]))
			: [resolved.runtimeDeckId];

		return {
			...card,
			deckId: resolved.runtimeDeckId,
			referencedByDecks,
			customFields: {
				...customFields,
				wdeck: runtimeMeta,
			},
		};
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
		const serialized = JSON.stringify(data, null, 2);
        await this.plugin.app.vault.modify(file, serialized + "\n");
	}
}
