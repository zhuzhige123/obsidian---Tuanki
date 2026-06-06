// Anki Plugin Data Storage
// 使用 Obsidian 的 API 进行数据持久化存储
import { type DataAdapter, TFile } from "obsidian";
import { Notice } from "obsidian";
import {
	LEGACY_PATHS,
	WEAVE_DATA,
	getBackupPath,
	getPluginPaths,
	getV2Paths,
	normalizeWeaveParentFolder,
} from "../config/paths";
import type { WeavePlugin } from "../main";
import type { ExternalSyncWatcher } from "../services/ExternalSyncWatcher";
import type { DataChangeEvent, DataSyncService } from "../services/DataSyncService";
import { BlockLinkCleanupService } from "../services/cleanup/BlockLinkCleanupService";
import { getEmergentDeckService } from "../services/deck/EmergentDeckService";
import type { DeckMembershipIndexService } from "../services/index/DeckMembershipIndexService";
import {
	WDECK_UNGROUPED_DECK_NAME,
	normalizeWDeckLogicalDeckId,
	toWDeckRuntimeDeckId,
} from "../services/wdeck/WDeckService";
import {
	hasProgressiveClozeContent,
	isProgressiveClozeChild,
} from "../types/progressive-cloze-v2";
import type { ProgressiveClozeChildCard } from "../types/progressive-cloze-v2";
import { extractErrorMessage } from "../types/utility-types";
import {
	buildBodyFingerprintIndex,
	getCardBodyFingerprint,
	mergeDuplicateCreateOntoExisting,
} from "../utils/card-content-fingerprint";
import { detectCardTypeFromContent } from "../utils/card-markdown-serializer";
import {
	cardNeedsLegacyStatsMigration,
	syncCardStatsToCanonicalFormat,
} from "../utils/card-stats-normalizer";
import { DirectoryUtils } from "../utils/directory-utils";
import { hasLegacyMemoryCardStorage } from "../utils/legacy-memory-storage";
import { t } from "../utils/i18n";
import { logger } from "../utils/logger";
import { showObsidianChoice, showObsidianInput } from "../utils/obsidian-confirm";
import { keepSingleMemoryFormalDeck } from "../utils/memory-deck-membership";
import { safeReadJson, safeWriteJson } from "../utils/safe-json-io";
import { isRecord, parseJsonUnknown } from "../utils/typed-json";
import { ensureWeaveDataReadmesForPath } from "../utils/weave-data-readme";
import {
	type CardYAMLMetadata,
	extractAllTags,
	extractBodyContent,
	getCardDeckIds,
	getCardDeckIdsFromFormalSource,
	parseBlockId,
	parseObsidianLink,
	parseSourceInfo,
	parseYAMLFromContent,
	setCardProperties,
	setCardProperty,
} from "../utils/yaml-utils";
import type { StudySession } from "./study-types";
import type {
	AnkiExportData,
	ApiResponse,
	Card,
	CardState,
	DataQuery,
	Deck,
	DeckSettings,
	DeckStats,
	UserProfile,
} from "./types";
import { CardType } from "./types";

type StorageProgressCallback = (current: number, total: number, detail: string) => void;

type WeaveDataChangeContext = {
	source?: string;
	deckIds?: string[];
	suppressDeckNotifications?: boolean;
	suppressCardNotifications?: boolean;
	suppressSessionNotifications?: boolean;
};

type PluginAugment = {
	__weaveDataChangeContext?: WeaveDataChangeContext;
	externalSyncWatcher?: ExternalSyncWatcher;
	dataSyncService?: DataSyncService;
	deckMembershipIndexService?: DeckMembershipIndexService;
	mediaFileHandler?: {
		cleanupDeckMedia?: (deckId: string) => Promise<void> | void;
	};
	analyticsService?: {
		onDeckDeleted?: (deckId: string) => void;
	};
	autoSyncManager?: {
		onDeckDeleted?: (deckId: string) => void;
	};
};

type VaultDirListing = { files: string[]; folders: string[] };

type VaultAdapterWithDirOps = DataAdapter & {
	list?: (path: string) => Promise<VaultDirListing>;
	rmdir?: (path: string, recursive: boolean) => Promise<void>;
	stat?: (path: string) => Promise<{ mtime: number } | null>;
};

export class WeaveDataStorage {
	private plugin: WeavePlugin;
	/** 启动时检测到无记忆牌组，等待用户确认后再创建 */
	private needsFirstDeckPrompt = false;
	private firstDeckPromptInFlight = false;

	/** 寰呭埛鍐欑殑 deck cardUUIDs 澧為噺锛坉eckId 鈫?Set<cardUUID>锛?*/
	private _pendingDeckCardUUIDs = new Map<string, Set<string>>();
	/** 闃叉姈瀹氭椂鍣?*/
	private _deckCardUUIDsFlushTimer: ReturnType<typeof setTimeout> | null = null;
	/** 闃叉姈寤惰繜锛坢s锛?*/
	private static readonly DECK_CARD_UUIDS_FLUSH_DELAY = 300;
	/** 正文指纹索引（懒加载，写入/删除后失效） */
	private bodyFingerprintIndex: Map<string, string> | null = null;

	private get v2Paths() {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		return getV2Paths(parentFolder);
	}

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	private get pluginCompat(): WeavePlugin & PluginAugment {
		return this.plugin as WeavePlugin & PluginAugment;
	}

	private getVaultAdapterWithDirOps(): VaultAdapterWithDirOps {
		return this.plugin.app.vault.adapter as VaultAdapterWithDirOps;
	}

	private async listVaultDir(dir: string): Promise<VaultDirListing> {
		const adapter = this.getVaultAdapterWithDirOps();
		if (typeof adapter.list !== "function") {
			return { files: [], folders: [] };
		}
		const listing = await adapter.list(dir);
		return {
			files: listing.files || [],
			folders: listing.folders || [],
		};
	}

	private isUserProfile(value: unknown): value is UserProfile {
		return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
	}

	private readStudySessionsFromChunk(chunk: unknown): StudySession[] {
		if (!isRecord(chunk) || !Array.isArray(chunk.sessions)) {
			return [];
		}
		return chunk.sessions.filter(
			(session): session is StudySession =>
				isRecord(session) &&
				typeof session.id === "string" &&
				typeof session.deckId === "string"
		);
	}

	private getDataChangeContext(): WeaveDataChangeContext | undefined {
		return this.pluginCompat.__weaveDataChangeContext;
	}

	private setDataChangeContext(context: WeaveDataChangeContext | undefined): void {
		this.pluginCompat.__weaveDataChangeContext = context;
	}

	private markInternalWrite(): void {
		this.pluginCompat.externalSyncWatcher?.markInternalWrite();
	}

	private async notifyDataChange(
		event: Omit<DataChangeEvent, "timestamp">,
		suppressionFlag?: keyof Pick<
			WeaveDataChangeContext,
			"suppressDeckNotifications" | "suppressCardNotifications" | "suppressSessionNotifications"
		>
	): Promise<void> {
		const dataSyncService = this.pluginCompat.dataSyncService;
		if (!dataSyncService) {
			return;
		}

		const context = this.getDataChangeContext();
		if (suppressionFlag && context?.[suppressionFlag]) {
			return;
		}

		const metadata = {
			...(event.metadata || {}),
			...(context?.source && !event.metadata?.source ? { source: context.source } : {}),
		};

		await dataSyncService.notifyChange({
			...event,
			metadata,
		});
	}

	private getRuntimeDeckIds(card: Pick<Card, "deckId" | "referencedByDecks">): string[] {
		const runtimeDeckIds =
			Array.isArray(card.referencedByDecks) && card.referencedByDecks.length > 0
				? card.referencedByDecks
				: card.deckId
				? [card.deckId]
				: [];

		return Array.from(new Set(runtimeDeckIds.filter(Boolean)));
	}

	private getCardDeckMembershipIds(
		card: Pick<Card, "content" | "deckId" | "referencedByDecks">,
		decks: Array<Pick<Deck, "id" | "name" | "purpose">>,
		options?: {
			fallbackToReferences?: boolean;
			fallbackToDeckId?: boolean;
			preserveAllDeckIds?: boolean;
		}
	): string[] {
		return getCardDeckIds(card, decks, options).deckIds;
	}

	private getCardFormalDeckMembershipIds(
		card: Pick<Card, "content" | "deckId" | "referencedByDecks">,
		decks: Array<Pick<Deck, "id" | "name" | "purpose">>
	): string[] {
		return getCardDeckIdsFromFormalSource(card, decks).deckIds;
	}

	private getCardDeckMembershipIdsForSave(
		card: Pick<Card, "content" | "deckId" | "referencedByDecks">,
		decks: Array<Pick<Deck, "id" | "name" | "purpose">>
	): string[] {
		const formalDeckIds = this.getCardFormalDeckMembershipIds(card, decks).filter(
			(deckId) => decks.find((deck) => deck.id === deckId)?.purpose !== "test"
		);
		const compatibilityDeckIds = this.getCardDeckMembershipIds(card, decks, {
			fallbackToReferences: true,
			fallbackToDeckId: true,
			preserveAllDeckIds: true,
		});
		const testDeckIds = compatibilityDeckIds.filter(
			(deckId) => decks.find((deck) => deck.id === deckId)?.purpose === "test"
		);

		return Array.from(new Set([...formalDeckIds, ...testDeckIds]));
	}

	private async cascadeDeleteDeckReferences(
		cardUUIDs: string[],
		options?: { skipDeckIds?: string[] }
	): Promise<{ totalAffectedDecks: number; errors: string[] }> {
		const deleteUUIDSet = new Set(cardUUIDs.filter(Boolean));
		if (deleteUUIDSet.size === 0) {
			return { totalAffectedDecks: 0, errors: [] };
		}

		const skipDeckIds = new Set(options?.skipDeckIds?.filter(Boolean) || []);

		try {
			const decks = await this.readPersistedDecks();
			let totalAffectedDecks = 0;
			let hasChanges = false;
			const nextDecks = decks.map((deck) => {
				if (skipDeckIds.has(deck.id)) {
					return deck;
				}

				const before = deck.cardUUIDs?.length || 0;
				if (before === 0) {
					return deck;
				}

				const filteredUUIDs = (deck.cardUUIDs || []).filter((uuid) => !deleteUUIDSet.has(uuid));
				if (filteredUUIDs.length === before) {
					return deck;
				}

				totalAffectedDecks += 1;
				hasChanges = true;
				return {
					...deck,
					cardUUIDs: filteredUUIDs,
					modified: new Date().toISOString(),
				};
			});

			if (hasChanges) {
				await this.writePersistedDecks(nextDecks);
			}

			return { totalAffectedDecks, errors: [] };
		} catch (error) {
			logger.error("[Storage] 清理牌组卡片引用失败:", error);
			return {
				totalAffectedDecks: 0,
				errors: [extractErrorMessage(error)],
			};
		}
	}

	private async hasLegacyMemoryStorage(): Promise<boolean> {
		return hasLegacyMemoryCardStorage(
			this.plugin.app,
			this.plugin.settings?.weaveParentFolder
		);
	}

	private normalizeRuntimeDeckMembership(
		runtimeDeckIds: string[],
		decks: Array<Pick<Deck, "id" | "name" | "purpose">>
	): { deckIds: string[]; deckNames: string[] } {
		const entries = keepSingleMemoryFormalDeck(runtimeDeckIds, decks);
		return {
			deckIds: entries.map((entry) => entry.deckId),
			deckNames: entries.map((entry) => entry.deckName),
		};
	}

	private async readAllCardsIncludingWDeck(
		options: { includeLegacyCards?: boolean } = {}
	): Promise<Card[]> {
		const rawCards = await this.readAllCardsIncludingWDeckRaw(options);
		return rawCards.map((card) => this.hydrateCardFromYAML(card));
	}

	private async readAllCardsIncludingWDeckRaw(
		options: { includeLegacyCards?: boolean } = {}
	): Promise<Card[]> {
		const cardsByUUID = new Map<string, Card>();
		void options.includeLegacyCards;

		if (this.plugin.wdeckService) {
			try {
				const wdeckCards = await this.plugin.wdeckService.getAllCards();
				for (const card of wdeckCards) {
					if (card?.uuid) {
						cardsByUUID.set(card.uuid, card);
					}
				}
			} catch (error) {
				logger.warn("[Storage] Failed to read WDeck cards:", error);
			}
		}

		return Array.from(cardsByUUID.values());
	}

	async migrateLegacyCardStatsToCanonicalFormat(): Promise<{
		migrated: number;
		failed: number;
		errors: string[];
	}> {
		const rawCards = await this.readAllCardsIncludingWDeckRaw({ includeLegacyCards: true });
		const candidates = rawCards.filter((card) => cardNeedsLegacyStatsMigration(card));
		if (candidates.length === 0) {
			return { migrated: 0, failed: 0, errors: [] };
		}

		try {
			await this.saveCardsBatch(candidates);
			return { migrated: candidates.length, failed: 0, errors: [] };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.warn("[Storage] 旧统计字段迁移批量保存失败，开始逐张回退处理", error);
			const errors: string[] = [];
			let migrated = 0;
			let failed = 0;

			for (const candidate of candidates) {
				try {
					const result = await this.saveCard(candidate);
					if (result.success) {
						migrated++;
					} else {
						failed++;
						errors.push(`${candidate.uuid}: ${result.error || "保存失败"}`);
					}
				} catch (candidateError) {
					failed++;
					errors.push(
						`${candidate.uuid}: ${
							candidateError instanceof Error
								? candidateError.message
								: String(candidateError)
						}`
					);
				}
			}

			if (migrated === 0 && errors.length === 0) {
				errors.push(message);
			}

			return { migrated, failed, errors };
		}
	}

	private createEmptyDeckStats(): DeckStats {
		return {
			totalCards: 0,
			newCards: 0,
			learningCards: 0,
			reviewCards: 0,
			todayNew: 0,
			todayReview: 0,
			todayTime: 0,
			totalReviews: 0,
			totalTime: 0,
			memoryRate: 0,
			averageEase: 0,
			forecastDays: {},
		};
	}

	private createVirtualWDeckDeck(params: {
		deckId: string;
		deckName: string;
		cardUUIDs: string[];
		logicalDeckId?: string;
		filePaths?: string[];
		segmentIndices?: number[];
		deckDefinition?: Partial<Deck>;
	}): Deck {
		const now = new Date().toISOString();
		const deckDefinition =
			params.deckDefinition && typeof params.deckDefinition === "object"
				? params.deckDefinition
				: {};
		const metadata =
			deckDefinition.metadata && typeof deckDefinition.metadata === "object"
				? { ...(deckDefinition.metadata) }
				: {};
		delete metadata.fileType;
		delete metadata.logicalDeckId;
		delete metadata.filePaths;
		delete metadata.segmentIndices;

		return {
			id: params.deckId,
			name: String(deckDefinition.name || params.deckName || "").trim() || params.deckName,
			description: typeof deckDefinition.description === "string" ? deckDefinition.description : "",
			category:
				typeof deckDefinition.category === "string" && deckDefinition.category.trim()
					? deckDefinition.category
					: "WDeck",
			cardUUIDs: [...params.cardUUIDs],
			parentId:
				typeof deckDefinition.parentId === "string" ? deckDefinition.parentId : undefined,
			path:
				typeof deckDefinition.path === "string" && deckDefinition.path.trim()
					? deckDefinition.path
					: params.deckName,
			level: typeof deckDefinition.level === "number" ? deckDefinition.level : 0,
			order: typeof deckDefinition.order === "number" ? deckDefinition.order : 0,
			inheritSettings:
				typeof deckDefinition.inheritSettings === "boolean"
					? deckDefinition.inheritSettings
					: false,
			settings: this.getCurrentDefaultDeckSettings(
				deckDefinition.settings as Partial<DeckSettings> | undefined
			),
			stats: {
				...this.createEmptyDeckStats(),
				...((deckDefinition.stats as Partial<DeckStats> | undefined) || {}),
				totalCards: params.cardUUIDs.length,
			},
			includeSubdecks:
				typeof deckDefinition.includeSubdecks === "boolean"
					? deckDefinition.includeSubdecks
					: false,
			icon: typeof deckDefinition.icon === "string" ? deckDefinition.icon : undefined,
			color: typeof deckDefinition.color === "string" ? deckDefinition.color : undefined,
			deckType: deckDefinition.deckType || "mixed",
			purpose: deckDefinition.purpose === "test" ? "test" : "memory",
			knowledgeLevel:
				typeof deckDefinition.knowledgeLevel === "number"
					? deckDefinition.knowledgeLevel
					: undefined,
			created: typeof deckDefinition.created === "string" ? deckDefinition.created : now,
			modified: typeof deckDefinition.modified === "string" ? deckDefinition.modified : now,
			tags: Array.isArray(deckDefinition.tags) ? [...deckDefinition.tags] : [],
			metadata: {
				...metadata,
				fileType: "wdeck",
				logicalDeckId: params.logicalDeckId,
				filePaths: params.filePaths || [],
				segmentIndices: params.segmentIndices || [],
			},
		};
	}

	private isVirtualWDeckDeck(deck?: Partial<Deck> | null): boolean {
		if (!deck) return false;
		const metadata =
			deck.metadata && typeof deck.metadata === "object"
				? (deck.metadata)
				: null;

		return (
			metadata?.fileType === "wdeck" ||
			this.plugin.wdeckService?.isWDeckDeckId?.(String(deck.id || "")) === true
		);
	}

	private isDeckMigratedToWDeck(deck: Deck): boolean {
		const metadata =
			deck.metadata && typeof deck.metadata === "object"
				? (deck.metadata)
				: null;
		const migration =
			metadata?.wdeckMigration && typeof metadata.wdeckMigration === "object"
				? (metadata.wdeckMigration as Record<string, unknown>)
				: null;

		return migration?.status === "migrated";
	}

	private isLegacyMemoryDeckCoveredByWDeck(
		deck: Deck,
		aggregates: Array<{ logicalDeckId: string }>
	): boolean {
		if (deck.purpose === "test") {
			return false;
		}

		if (this.isDeckMigratedToWDeck(deck)) {
			return true;
		}

		const logicalDeckId = normalizeWDeckLogicalDeckId(deck.id, deck.name);
		return aggregates.some((aggregate) => aggregate.logicalDeckId === logicalDeckId);
	}

	private async removePersistedMemoryDeck(logicalDeckId: string): Promise<void> {
		const adapter = (this.plugin.app.vault as { adapter?: unknown })?.adapter;
		if (!adapter) {
			return;
		}

		const persistedDecks = await this.readPersistedDecks();
		const removedDeckIds = persistedDecks
			.filter(
				(deck) =>
					deck.purpose !== "test" &&
					normalizeWDeckLogicalDeckId(deck.id, deck.name) === logicalDeckId
			)
			.map((deck) => String(deck.id || "").trim())
			.filter(Boolean);
		const filteredDecks = persistedDecks.filter(
			(deck) =>
				deck.purpose === "test" ||
				normalizeWDeckLogicalDeckId(deck.id, deck.name) !== logicalDeckId
		);

		if (filteredDecks.length === persistedDecks.length) {
			return;
		}

		await this.writePersistedDecks(filteredDecks);
		for (const deckId of removedDeckIds) {
			await this.deleteDeckCardUUIDs(deckId);
		}
	}

	private async migrateLegacyDeckStoreIfNeeded(): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		const legacyDeckRoot = LEGACY_PATHS.decks;
		const legacyDecksPath = `${legacyDeckRoot}/decks.json`;
		const currentDecksPath = this.v2Paths.memory.decks;

		try {
			if (await adapter.exists(legacyDecksPath)) {
				let legacyDecks: Deck[] = [];
				let currentDecks: Deck[] = [];

				try {
					const legacyRaw = await adapter.read(legacyDecksPath);
					const legacyParsed = JSON.parse(legacyRaw) as { decks?: Deck[] };
					legacyDecks = Array.isArray(legacyParsed?.decks) ? legacyParsed.decks : [];
				} catch (error) {
					logger.warn("[Storage] 读取旧版 decks.json 失败，跳过自动迁移", error);
				}

				try {
					const currentRaw = await adapter.read(currentDecksPath);
					const currentParsed = JSON.parse(currentRaw) as { decks?: Deck[] };
					currentDecks = Array.isArray(currentParsed?.decks) ? currentParsed.decks : [];
				} catch {
					currentDecks = [];
				}

				if (legacyDecks.length > 0 && currentDecks.length === 0) {
					await adapter.write(currentDecksPath, JSON.stringify({ decks: legacyDecks }, null, 2));
					logger.info("[Storage] 已迁移旧版 weave/decks/decks.json -> weave/memory/decks.json");
				}

				await adapter.remove(legacyDecksPath);
			}

			await this.tryRemoveDirIfEmpty(legacyDeckRoot);
		} catch (error) {
			logger.warn("[Storage] 迁移/清理旧版 decks 存储失败", error);
		}
	}

	private async tryRemoveDirIfEmpty(dirPath: string): Promise<void> {
		const adapter = this.plugin.app.vault.adapter as typeof this.plugin.app.vault.adapter & {
			list?: (path: string) => Promise<{ files: string[]; folders: string[] }>;
			rmdir?: (path: string, recursive: boolean) => Promise<void>;
		};

		if (!(await adapter.exists(dirPath)) || typeof adapter.list !== "function") {
			return;
		}

		const listing = await adapter.list(dirPath);
		const isEmpty = (listing.files || []).length === 0 && (listing.folders || []).length === 0;
		if (!isEmpty) {
			return;
		}

		if (typeof adapter.rmdir === "function") {
			await adapter.rmdir(dirPath, false);
			return;
		}

		await adapter.remove(dirPath);
	}

	private async readPersistedDecks(): Promise<Deck[]> {
		const adapter = this.plugin.app.vault.adapter;
		if (!adapter) {
			return [];
		}
		const data = await safeReadJson<{ decks: Deck[] }>(adapter, this.v2Paths.memory.decks);
		return Array.isArray(data?.decks) ? data.decks : [];
	}

	private async writePersistedDecks(decks: Deck[]): Promise<void> {
		await this.writeDecksFile({ decks });
	}

	private async getPersistedDeckById(deckId?: string): Promise<Deck | null> {
		const normalizedDeckId = String(deckId || "").trim();
		if (!normalizedDeckId) {
			return null;
		}

		const decks = await this.readPersistedDecks();
		return decks.find((deck) => String(deck.id || "").trim() === normalizedDeckId) || null;
	}

	private buildWDeckMigrationMetadata(deck: Deck, filePath: string): Record<string, unknown> {
		const metadata =
			deck.metadata && typeof deck.metadata === "object"
				? { ...(deck.metadata) }
				: {};
		metadata.wdeckMigration = {
			status: "migrated",
			logicalDeckId: normalizeWDeckLogicalDeckId(deck.id, deck.name),
			filePath,
			exportedAt: new Date().toISOString(),
		};
		return metadata;
	}

	private async ensurePersistedDeckUsesWDeck(deck: Deck): Promise<Deck> {
		if (
			!this.plugin.wdeckService ||
			deck.purpose === "test"
		) {
			return deck;
		}

		const filePath = await this.plugin.wdeckService.ensureDeckFileForDeck({
			id: deck.id,
			name: deck.name,
		});

		return {
			...deck,
			metadata: this.buildWDeckMigrationMetadata(deck, filePath),
		};
	}

	private async resolveWDeckTargetForCard(
		card: Pick<Card, "deckId" | "cardPurpose">
	): Promise<{ id: string; name: string }> {
		const runtimeDeckId = String(card.deckId || "").trim();
		if (runtimeDeckId && this.plugin.wdeckService) {
			const info = await this.plugin.wdeckService.getDeckInfoByAnyDeckId(runtimeDeckId);
			if (info) {
				return {
					id: info.runtimeDeckId,
					name: info.logicalDeckName,
				};
			}
		}

		const persistedDeck = await this.getPersistedDeckById(runtimeDeckId);
		if (persistedDeck && persistedDeck.purpose !== "test") {
			return {
				id: persistedDeck.id,
				name: persistedDeck.name,
			};
		}

		return {
			id: WDECK_UNGROUPED_DECK_NAME,
			name: WDECK_UNGROUPED_DECK_NAME,
		};
	}

	private async upsertPersistedDeckCardUUIDs(deckId: string, cardUUIDs: string[]): Promise<void> {
		const normalizedDeckId = String(deckId || "").trim();
		if (!normalizedDeckId) {
			return;
		}

		const decks = await this.readPersistedDecks();
		const index = decks.findIndex((deck) => String(deck.id || "").trim() === normalizedDeckId);
		if (index < 0 || decks[index].purpose !== "test") {
			return;
		}

		const nextDeck = await this.ensurePersistedDeckUsesWDeck({
			...decks[index],
			cardUUIDs: Array.from(new Set(cardUUIDs.filter(Boolean))),
			modified: new Date().toISOString(),
			stats: {
				...(decks[index].stats || this.createEmptyDeckStats()),
				totalCards: Array.from(new Set(cardUUIDs.filter(Boolean))).length,
			},
		});
		decks[index] = nextDeck;
		await this.writePersistedDecks(decks);
	}

	private buildMovedMemoryCard(card: Card, targetDeckId: string, targetDeckName?: string): Card {
		const normalizedTargetDeckId = String(targetDeckId || "").trim();
		const normalizedTargetDeckName = String(targetDeckName || "").trim();
		return this.normalizeCardData({
			...card,
			deckId: normalizedTargetDeckId || undefined,
			referencedByDecks: normalizedTargetDeckId ? [normalizedTargetDeckId] : [],
			content: setCardProperty(
				card.content || "",
				"we_decks",
				normalizedTargetDeckName ? [normalizedTargetDeckName] : undefined
			),
			modified: new Date().toISOString(),
		});
	}

	async moveCardsToDeck(
		cardUUIDs: string[],
		targetDeckId: string,
		options?: { onProgress?: StorageProgressCallback }
	): Promise<{ moved: Card[]; failed: Array<{ uuid: string; error: string }> }> {
		const normalizedTargetDeckId = String(targetDeckId || "").trim();
		const uniqueUUIDs = Array.from(
			new Set((cardUUIDs || []).map((uuid) => String(uuid || "").trim()).filter(Boolean))
		);
		if (!normalizedTargetDeckId || uniqueUUIDs.length === 0) {
			return { moved: [], failed: [] };
		}

		const decks = await this.getDecks();
		const targetDeck = decks.find((deck) => deck.id === normalizedTargetDeckId);
		const targetDeckName =
			targetDeck?.name ||
			(normalizedTargetDeckId === WDECK_UNGROUPED_DECK_NAME ? WDECK_UNGROUPED_DECK_NAME : "");
		if (!targetDeck && normalizedTargetDeckId !== WDECK_UNGROUPED_DECK_NAME) {
			return {
				moved: [],
				failed: uniqueUUIDs.map((uuid) => ({
					uuid,
					error: `目标牌组不存在: ${normalizedTargetDeckId}`,
				})),
			};
		}
		if (targetDeck?.purpose === "test") {
			return {
				moved: [],
				failed: uniqueUUIDs.map((uuid) => ({
					uuid,
					error: `记忆卡不能移动到测试牌组: ${targetDeck.name}`,
				})),
			};
		}

		const cardsToMove: Card[] = [];
		const failed: Array<{ uuid: string; error: string }> = [];
		const cardsByUUID = new Map<string, Card>();
		const unresolvedUUIDs = new Set(uniqueUUIDs);

		if (this.plugin.wdeckService?.getCardsByUUIDs) {
			const locatedCards = await this.plugin.wdeckService.getCardsByUUIDs(uniqueUUIDs);
			for (const card of locatedCards) {
				if (!card?.uuid) {
					continue;
				}
				cardsByUUID.set(card.uuid, card);
				unresolvedUUIDs.delete(card.uuid);
			}
		}

		if (unresolvedUUIDs.size > 0) {
			const allCards = await this.getCards();
			for (const card of allCards) {
				if (card?.uuid && unresolvedUUIDs.has(card.uuid) && !cardsByUUID.has(card.uuid)) {
					cardsByUUID.set(card.uuid, card);
				}
			}
		}

		for (const uuid of uniqueUUIDs) {
			try {
				const card = cardsByUUID.get(uuid) || null;
				if (!card) {
					failed.push({ uuid, error: "卡片不存在" });
					continue;
				}
				if (card.cardPurpose === "test") {
					failed.push({ uuid, error: "测试卡不支持使用记忆牌组移动接口" });
					continue;
				}
				cardsToMove.push(this.buildMovedMemoryCard(card, normalizedTargetDeckId, targetDeckName));
			} catch (error) {
				failed.push({ uuid, error: extractErrorMessage(error) });
			}
		}

		if (cardsToMove.length === 0) {
			return { moved: [], failed };
		}

		options?.onProgress?.(
			Math.min(failed.length, uniqueUUIDs.length),
			uniqueUUIDs.length,
			failed.length > 0
				? `已跳过 ${failed.length} 张不可移动卡片，正在写入其余卡片到牌组` 
				: "正在写入牌组文件"
		);

		const result = await this.saveCardsInternalBatch(cardsToMove, {
			onProgress: options?.onProgress,
			progressCurrentOffset: failed.length,
			progressTotal: uniqueUUIDs.length,
			progressLabel: normalizedTargetDeckId === WDECK_UNGROUPED_DECK_NAME
				? "正在移出牌组"
				: `正在写入牌组“${targetDeckName || normalizedTargetDeckId}”`,
		});
		if (!result.success) {
			return {
				moved: [],
				failed: [
					...failed,
					...cardsToMove.map((card) => ({
						uuid: card.uuid,
						error: result.error || "批量移动失败",
					})),
				],
			};
		}

		return {
			moved: result.data || cardsToMove,
			failed,
		};
	}

	private async readAllCardsFromUnifiedStorage(): Promise<Card[]> {
		const snapshot = await this.readAllCardsFromUnifiedStorageSnapshot();
		return snapshot.cards;
	}

	private async readAllCardsFromUnifiedStorageSnapshot(): Promise<{
		cards: Card[];
		source: "wdeck" | "legacy" | "empty";
	}> {
		const wdeckCards = await this.readAllCardsIncludingWDeck();
		if (wdeckCards.length > 0) {
			return { cards: wdeckCards, source: "wdeck" };
		}

		return { cards: [], source: "empty" };
	}

	private invalidateBodyFingerprintIndex(): void {
		this.bodyFingerprintIndex = null;
	}

	private async getBodyFingerprintIndex(): Promise<Map<string, string>> {
		if (this.bodyFingerprintIndex) {
			return this.bodyFingerprintIndex;
		}

		const cards = await this.readAllCardsFromUnifiedStorage();
		this.bodyFingerprintIndex = buildBodyFingerprintIndex(cards);
		return this.bodyFingerprintIndex;
	}

	private async coalesceNewCardAgainstBodyDuplicate(card: Card): Promise<{
		card: Card;
		redirected: boolean;
	}> {
		const fingerprint = getCardBodyFingerprint(card);
		if (!fingerprint) {
			return { card, redirected: false };
		}

		const bodyIndex = await this.getBodyFingerprintIndex();
		const canonicalUuid = bodyIndex.get(fingerprint);
		if (!canonicalUuid || canonicalUuid === card.uuid) {
			return { card, redirected: false };
		}

		const existing = (await this.getCardsByUUIDs([canonicalUuid]))[0];
		if (!existing) {
			return { card, redirected: false };
		}

		logger.info(`[Storage] 正文重复，将新建 ${card.uuid} 合并到已有卡片 ${canonicalUuid}`);
		return {
			card: mergeDuplicateCreateOntoExisting(existing, card),
			redirected: true,
		};
	}

	private async deduplicateBatchCardsByBodyFingerprint(
		cards: Card[],
		existingUuidSet: Set<string>
	): Promise<Card[]> {
		const bodyIndex = await this.getBodyFingerprintIndex();
		const batchFingerprints = new Map<string, string>();
		const output: Card[] = [];
		const outputByUuid = new Map<string, Card>();

		for (const card of cards) {
			if (!card?.uuid) {
				continue;
			}

			const fingerprint = getCardBodyFingerprint(card);
			const isNew = !existingUuidSet.has(card.uuid);

			if (!isNew || !fingerprint) {
				output.push(card);
				outputByUuid.set(card.uuid, card);
				continue;
			}

			const canonicalUuid = batchFingerprints.get(fingerprint) || bodyIndex.get(fingerprint);
			if (canonicalUuid && canonicalUuid !== card.uuid) {
				logger.info(`[Storage] 批量写入跳过正文重复副本: ${card.uuid} -> ${canonicalUuid}`);

				if (existingUuidSet.has(canonicalUuid)) {
					let base = outputByUuid.get(canonicalUuid);
					if (!base) {
						base = (await this.getCardsByUUIDs([canonicalUuid]))[0];
					}
					if (base) {
						const merged = mergeDuplicateCreateOntoExisting(base, card);
						if (outputByUuid.has(canonicalUuid)) {
							const index = output.findIndex((item) => item.uuid === canonicalUuid);
							if (index >= 0) {
								output[index] = merged;
							}
						} else {
							output.push(merged);
							existingUuidSet.add(canonicalUuid);
						}
						outputByUuid.set(canonicalUuid, merged);
					}
				} else {
					const base = outputByUuid.get(canonicalUuid);
					if (base) {
						const merged = mergeDuplicateCreateOntoExisting(base, card);
						const index = output.findIndex((item) => item.uuid === canonicalUuid);
						if (index >= 0) {
							output[index] = merged;
						}
						outputByUuid.set(canonicalUuid, merged);
					}
				}
				continue;
			}

			batchFingerprints.set(fingerprint, card.uuid);
			output.push(card);
			outputByUuid.set(card.uuid, card);
		}

		return output;
	}

	private async getExistingCardUUIDSet(uuids: string[]): Promise<Set<string>> {
		const uniqueUUIDs = Array.from(new Set(uuids.filter(Boolean)));
		const existingCardUUIDs = new Set<string>();
		if (uniqueUUIDs.length === 0) {
			return existingCardUUIDs;
		}

		if (this.plugin.wdeckService) {
			try {
				const locatedCards = await this.plugin.wdeckService.getCardsByUUIDs(uniqueUUIDs);
				for (const card of locatedCards) {
					if (card?.uuid) {
						existingCardUUIDs.add(card.uuid);
					}
				}

				if (existingCardUUIDs.size === uniqueUUIDs.length) {
					return existingCardUUIDs;
				}
			} catch (error) {
				logger.warn("[Storage] 读取 WDeck 卡片失败:", error);
			}
		}

		return existingCardUUIDs;
	}

	private async getCardsForDeck(deckId: string): Promise<Card[]> {
		const fullDecks = await this.getDecks();
		const decks = fullDecks.map((deck) => ({ id: deck.id, name: deck.name }));
		const emergentDeckService = getEmergentDeckService(this.plugin);
		const emergentEnabled = emergentDeckService.isEnabled();
		const formalBindings = emergentEnabled ? await emergentDeckService.getBindings() : [];
		const hasFormalBindings = formalBindings.some((binding) => binding.formalDeckId === deckId);
		const isEmergentDeckId = deckId.startsWith("tag:");
		const filterCardsByDeck = (
			cards: Card[],
			options?: { compatibilityMode?: boolean }
		): Card[] => {
			const runtime =
				emergentEnabled
					? emergentDeckService.buildRuntimeFromBindings(cards, fullDecks, formalBindings)
					: undefined;
			return cards.filter((card) => {
				const resolvedDeckIds = options?.compatibilityMode
					? this.getCardDeckMembershipIds(card, decks, {
							fallbackToReferences: true,
							fallbackToDeckId: true,
					  })
					: this.getCardFormalDeckMembershipIds(card, decks);
				if (resolvedDeckIds.includes(deckId)) {
					return true;
				}
				if (!runtime) {
					return false;
				}
				return (
					(runtime.formalDeckIdsByCardUUID[card.uuid] || []).includes(deckId) ||
					(runtime.emergentDeckIdsByCardUUID[card.uuid] || []).includes(deckId)
				);
			});
		};

		const wdeckService = this.plugin.wdeckService;
		const indexService = this.pluginCompat.deckMembershipIndexService;

		if (
			!hasFormalBindings &&
			!isEmergentDeckId &&
			indexService &&
			wdeckService
		) {
			try {
				const deckState = await indexService.getDeckState(deckId);
				if (
					deckState?.hasSnapshot &&
					deckState.initialized &&
					!deckState.fullRebuildRequired &&
					!deckState.isDeckDirty &&
					deckState.cardUUIDs.length > 0
				) {
					const indexedCards = (await wdeckService.getCardsByUUIDs(deckState.cardUUIDs)).map(
						(card: Card) => this.hydrateCardFromYAML(card)
					);
					const yamlBackedCards = filterCardsByDeck(indexedCards);
					const yamlUUIDSet = new Set(yamlBackedCards.map((card) => card.uuid));
					const isIndexConsistent =
						yamlBackedCards.length === deckState.cardUUIDs.length &&
						deckState.cardUUIDs.every((uuid: string) => yamlUUIDSet.has(uuid));

					if (isIndexConsistent) {
						return yamlBackedCards;
					}

					await indexService.markDecksDirty([deckId]);
				}
			} catch (error) {
				logger.warn(`[Storage] 牌组成员索引读取失败，回退到全量扫描: ${deckId}`, error);
			}
		}

		const { cards: allCards, source } = await this.readAllCardsFromUnifiedStorageSnapshot();
		const deckCards = filterCardsByDeck(allCards, {
			compatibilityMode: source === "legacy",
		});

		if (indexService) {
			try {
				await indexService.rebuildFromCards(allCards, decks);
			} catch (error) {
				logger.warn("[Storage] 重建牌组成员索引失败:", error);
			}
		}

		return deckCards;
	}

	private shouldAttemptDeletionCleanup(card: Card): boolean {
		const sourceInfo = parseSourceInfo(card.content || "");
		if (card.sourceFile || sourceInfo.sourceFile || card.sourceBlock || sourceInfo.sourceBlock) {
			return true;
		}

		if (card.metadata?.creationType) {
			return true;
		}

		return card.customFields?.importedFrom !== "apkg";
	}

	/**
	 * 数据文件夹路径（固定）
	 */
	private get dataFolder(): string {
		return this.v2Paths.root;
	}

	private isAbsoluteVaultPath(path: string): boolean {
		const configDir = this.plugin.app.vault.configDir;
		return (
			path.startsWith(`${WEAVE_DATA}/`) ||
			path.startsWith(`${this.v2Paths.root}/`) ||
			path.startsWith(`${configDir}/`)
		);
	}

	async initialize(): Promise<void> {
		try {
			logger.info("[Storage] Initializing Anki data storage...");
			logger.info(`[Storage] Data folder: ${this.dataFolder}`);

			// 确保数据文件夹存在
			logger.info("📂 Creating data directories...");
			await this.ensureDataFolder();

			// 初始化必要的数据文件
			logger.info("[Storage] Creating data files...");
			await this.ensureDataFiles();
			await this.migrateLegacyDeckStoreIfNeeded();

			// 仅在确认仓库中没有任何记忆牌组来源时，标记待用户创建（不静默自动建组）
			logger.info("[Storage] Checking memory deck presence...");
			await this.detectEmptyMemoryDeckState();

			const decks =
				(this.plugin.app.vault as { adapter?: unknown }).adapter
					? await this.readPersistedDecks()
					: (await this.getDecks()).filter((item) => !this.isVirtualWDeckDeck(item));
			logger.info(`[Storage] Anki data storage initialized successfully. Found ${decks.length} deck(s)`);
		} catch (error) {
			logger.error("[Storage] Failed to initialize data storage:", error);
			// 不再抛出错误，允许插件继续运行
			logger.warn("Plugin will continue running with default data...");
		}
	}

	private async detectEmptyMemoryDeckState(): Promise<void> {
		const hasMemoryDecks = await this.hasAnyMemoryDeckPresence();
		this.needsFirstDeckPrompt = !hasMemoryDecks;
		if (this.needsFirstDeckPrompt) {
			logger.info("[Storage] No memory decks found; waiting for user to create the first deck.");
		}
	}

	async hasAnyMemoryDeckPresence(): Promise<boolean> {
		try {
			const decks = await this.getDecks();
			if (Array.isArray(decks) && decks.length > 0) {
				return true;
			}
		} catch (error) {
			logger.warn("[Storage] Failed to read decks while checking memory deck presence:", error);
		}

		if (this.plugin.wdeckService) {
			try {
				if (await this.plugin.wdeckService.hasAnyDeckFileArtifacts()) {
					return true;
				}
			} catch (error) {
				logger.warn("[Storage] Failed to scan .wdeck files:", error);
			}
		}

		try {
			const persisted = await this.readPersistedDecks();
			if (Array.isArray(persisted) && persisted.length > 0) {
				return true;
			}
		} catch (error) {
			logger.warn("[Storage] Failed to read legacy decks.json:", error);
		}

		return false;
	}

	async promptCreateFirstDeckIfNeeded(): Promise<boolean> {
		if (this.firstDeckPromptInFlight) {
			return false;
		}

		if (!(await this.hasAnyMemoryDeckPresence())) {
			this.needsFirstDeckPrompt = true;
		} else {
			this.needsFirstDeckPrompt = false;
			return false;
		}

		if (!this.needsFirstDeckPrompt) {
			return false;
		}

		this.firstDeckPromptInFlight = true;
		try {
			const choice = await showObsidianChoice<"create" | "later">(
				this.plugin.app,
				t("storage.firstDeck.message"),
				{
					title: t("storage.firstDeck.title"),
					cancelText: t("storage.firstDeck.cancel"),
					choices: [
						{
							value: "create",
							text: t("storage.firstDeck.choiceCreate"),
							description: t("storage.firstDeck.choiceCreateDesc"),
							className: "mod-cta",
						},
						{
							value: "later",
							text: t("storage.firstDeck.choiceLater"),
							description: t("storage.firstDeck.choiceLaterDesc"),
						},
					],
				}
			);

			if (choice !== "create") {
				return false;
			}

			const defaultName = String(this.plugin.settings?.defaultDeck || "").trim() || "默认牌组";
			const deckName = await showObsidianInput(
				this.plugin.app,
				t("storage.firstDeck.nameMessage"),
				defaultName,
				{
					title: t("storage.firstDeck.nameTitle"),
					placeholder: t("storage.firstDeck.namePlaceholder"),
					confirmText: t("storage.firstDeck.confirm"),
					cancelText: t("storage.firstDeck.cancel"),
				}
			);

			const normalizedName = String(deckName || "").trim();
			if (!normalizedName) {
				new Notice(t("storage.firstDeck.invalidName"));
				return false;
			}

			const created = await this.createUserMemoryDeck(normalizedName);
			if (!created) {
				return false;
			}

			this.needsFirstDeckPrompt = false;
			new Notice(t("storage.firstDeck.created", { name: created.name }));
			return true;
		} catch (error) {
			logger.error("[Storage] First deck prompt failed:", error);
			new Notice(
				t("storage.firstDeck.createFailed", {
					error: extractErrorMessage(error),
				})
			);
			return false;
		} finally {
			this.firstDeckPromptInFlight = false;
		}
	}

	private buildUserMemoryDeck(name: string): Deck {
		const now = new Date();
		const normalizedName = String(name || "").trim();
		const profile = this.createDefaultUserProfile().profile;
		const defaultSettings = profile.globalSettings.defaultDeckSettings;

		return {
			id: `deck_${Date.now().toString(36)}`,
			name: normalizedName,
			description: "",
			category: "默认",
			path: normalizedName,
			level: 0,
			order: 0,
			inheritSettings: false,
			created: now.toISOString(),
			modified: now.toISOString(),
			settings: defaultSettings,
			includeSubdecks: false,
			stats: {
				totalCards: 0,
				newCards: 0,
				learningCards: 0,
				reviewCards: 0,
				todayNew: 0,
				todayReview: 0,
				todayTime: 0,
				totalReviews: 0,
				totalTime: 0,
				memoryRate: 0,
				averageEase: 0,
				forecastDays: {},
			},
			tags: [],
			metadata: { userCreated: true },
		};
	}

	async createUserMemoryDeck(name: string): Promise<Deck | null> {
		const normalizedName = String(name || "").trim();
		if (!normalizedName) {
			return null;
		}

		try {
			const savedResult = await this.saveDeck(this.buildUserMemoryDeck(normalizedName));
			return savedResult.success && savedResult.data ? savedResult.data : null;
		} catch (error) {
			logger.error("[Storage] Failed to create user memory deck:", error);
			new Notice(
				t("storage.firstDeck.createFailed", {
					error: extractErrorMessage(error),
				})
			);
			return null;
		}
	}

	private async ensureDataFolder(): Promise<void> {
		try {
			await DirectoryUtils.ensureDirRecursive(this.plugin.app.vault.adapter, this.dataFolder);
		} catch (error) {
			logger.error(`[Storage] 创建数据根目录失败: ${this.dataFolder}`, error);
			throw error;
		}
	}

	private async ensureDataFiles(): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		const pluginPaths = getPluginPaths(this.plugin.app);

		const folders = [
			// 记忆牌组模块
			pluginPaths.state.root,
			this.v2Paths.memory.root,
			this.v2Paths.memory.learning.root,
			this.v2Paths.memory.learning.sessions,
			this.v2Paths.memory.media,
		];

		for (const dir of folders) {
			try {
				await DirectoryUtils.ensureDirRecursive(adapter, dir);
			} catch (error) {
				logger.warn(`⚠️ 创建目录失败: ${dir}`, error);
			}
		}

		// 迁移 config/user-profile.json 到插件根目录
		const legacyProfilePath = `${pluginPaths.root}/config/user-profile.json`;
		try {
			if (
				(await adapter.exists(legacyProfilePath)) &&
				!(await adapter.exists(pluginPaths.state.userProfile))
			) {
				const content = await adapter.read(legacyProfilePath);
				await adapter.write(pluginPaths.state.userProfile, content);
				await adapter.remove(legacyProfilePath);
				logger.info("[Storage] 已迁移 config/user-profile.json -> user-profile.json");
			}
		} catch (error) {
			logger.warn("[Storage] 迁移 user-profile.json 失败:", error);
		}

		// 当前数据文件布局迁移由 SchemaV2MigrationService 负责
		const fileEntries: Array<{ path: string; key: string }> = [
			{ path: this.v2Paths.memory.decks, key: "decks.json" },
			{ path: pluginPaths.state.userProfile, key: "user-profile.json" },
		];

		for (const { path: filePath, key } of fileEntries) {
			try {
				if (!(await adapter.exists(filePath))) {
					const defaultData = this.getDefaultData(key);
					await adapter.write(filePath, JSON.stringify(defaultData));
				}
			} catch (error) {
				const errorMsg = extractErrorMessage(error);
				if (errorMsg.includes("already exists")) continue;
				logger.warn(`Data file creation warning for ${filePath}:`, error);
			}
		}
	}

	// 获取默认数据
	private getDefaultData(fileName: string): unknown {
		switch (fileName) {
			case "decks.json":
				return { decks: [] };
			case "user-profile.json":
				return this.createDefaultUserProfile();
			default:
				return {};
		}
	}

	// 创建默认用户配置
	private createDefaultUserProfile(): { profile: UserProfile } {
		return {
			profile: {
				id: "default-user",
				name: "Default User",
				created: new Date().toISOString(),
				globalSettings: {
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					language: "zh-CN",
					theme: "auto",
					defaultDeckSettings: {
						newCardsPerDay: 20,
						maxReviewsPerDay: 100,
						enableAutoAdvance: true,
						showAnswerTime: 0,
						fsrsParams: {
							// 使用标准 FSRS6 默认权重参数（21 个参数）
							w: [
								0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
								1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
							],
							requestRetention: 0.9,
							maximumInterval: 36500,
							enableFuzz: true,
						},
						learningSteps: [1, 10],
						relearningSteps: [10],
						graduatingInterval: 1,
						easyInterval: 4,
					},
					enableNotifications: true,
					enableSounds: false,
					enableDebugMode: false,
					dataBackupInterval: 24,
				},
				overallStats: {
					totalDecks: 0,
					totalCards: 0,
					totalStudyTime: 0,
					streakDays: 0,
				},
			},
		};
	}

	// 牌组操作
	getCurrentDefaultDeckSettings(overrides?: Partial<DeckSettings>): DeckSettings {
		const defaults = this.createDefaultUserProfile().profile.globalSettings.defaultDeckSettings;

		return {
			...defaults,
			...overrides,
			fsrsParams: {
				...defaults.fsrsParams,
				...(overrides?.fsrsParams || {}),
				w: Array.isArray(overrides?.fsrsParams?.w)
					? [...overrides.fsrsParams.w]
					: [...defaults.fsrsParams.w],
			},
			learningSteps: Array.isArray(overrides?.learningSteps)
				? [...overrides.learningSteps]
				: [...defaults.learningSteps],
			relearningSteps: Array.isArray(overrides?.relearningSteps)
				? [...overrides.relearningSteps]
				: [...defaults.relearningSteps],
		};
	}

	async getDecks(): Promise<Deck[]> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const decksPath = this.v2Paths.memory.decks;
			const data = adapter ? await safeReadJson<{ decks: Deck[] }>(adapter, decksPath) : null;
			const persistedDecks: Deck[] = Array.isArray(data?.decks) ? data.decks : [];

			let wdeckSummaries: Array<{
				runtimeDeckId: string;
				logicalDeckId: string;
				logicalDeckName: string;
				filePaths: string[];
				segmentIndices: number[];
				cardUUIDs: string[];
				deck?: Partial<Deck>;
			}> = [];
			if (this.plugin.wdeckService) {
				try {
					wdeckSummaries = await this.plugin.wdeckService.getAllDeckSummaries();
				} catch (error) {
					logger.warn("[Storage] WDeck 聚合牌组读取失败:", error);
				}
			}

			const visiblePersistedDecks: Deck[] = [];
			for (const deck of persistedDecks) {
				if (this.plugin.wdeckService && this.isLegacyMemoryDeckCoveredByWDeck(deck, wdeckSummaries)) {
					continue;
				}

				if (!deck.cardUUIDs || deck.cardUUIDs.length === 0) {
					deck.cardUUIDs = await this.readDeckCardUUIDs(deck.id);
				}
				visiblePersistedDecks.push(deck);
			}

			if (!this.plugin.wdeckService) {
				return visiblePersistedDecks;
			}

			const wdeckDecks = wdeckSummaries.map((aggregate) =>
				this.createVirtualWDeckDeck({
					deckId: aggregate.runtimeDeckId,
					deckName: aggregate.logicalDeckName,
					cardUUIDs: aggregate.cardUUIDs,
					logicalDeckId: aggregate.logicalDeckId,
					filePaths: aggregate.filePaths,
					segmentIndices: aggregate.segmentIndices,
					deckDefinition: aggregate.deck,
				})
			);
			return [...visiblePersistedDecks, ...wdeckDecks];
		} catch (_error) {
			return [];
		}
	}

	async getDeck(deckId: string): Promise<Deck | null> {
		try {
			const decks = await this.getDecks();
			const matchedDeck = decks.find((deck) => deck.id === deckId);
			if (matchedDeck) {
				return matchedDeck;
			}

			if (this.plugin.wdeckService) {
				const aggregate = await this.plugin.wdeckService.getDeckAggregateByAnyDeckId(deckId);
				if (aggregate) {
					return this.createVirtualWDeckDeck({
						deckId: aggregate.runtimeDeckId,
						deckName: aggregate.logicalDeckName,
						cardUUIDs: aggregate.cards.map((card: Card) => card.uuid).filter(Boolean),
						logicalDeckId: aggregate.logicalDeckId,
						filePaths: aggregate.files.map((file: { path: string }) => file.path),
						segmentIndices: aggregate.segmentIndices,
						deckDefinition: aggregate.deck,
					});
				}
			}

			return null;
		} catch (error) {
			logger.error("Failed to get deck:", error);
			return null;
		}
	}

	async getAllDecks(): Promise<Deck[]> {
		return this.getDecks();
	}

	async getCardsByDeck(deckId: string): Promise<Card[]> {
		try {
			return await this.getCards({ deckId });
		} catch (error) {
			logger.error("[Storage] getCardsByDeck 失败:", error);
			return [];
		}
	}

	private validateDeckNameUniqueness(decks: Deck[], deck: Deck): void {
		const normalizedName = String(deck.name || "").trim();
		if (!normalizedName) {
			throw new Error("牌组名称不能为空");
		}

		const currentDeckIds = new Set<string>();
		const normalizedDeckId = String(deck.id || "").trim();
		if (normalizedDeckId) {
			currentDeckIds.add(normalizedDeckId);
		}
		if (deck.purpose !== "test") {
			const logicalDeckId = normalizeWDeckLogicalDeckId(deck.id, deck.name);
			currentDeckIds.add(logicalDeckId);
			currentDeckIds.add(toWDeckRuntimeDeckId(logicalDeckId));
		}

		const duplicateDeck = decks.find(
			(existingDeck) =>
				!currentDeckIds.has(String(existingDeck.id || "").trim()) &&
				!(
					deck.purpose !== "test" &&
					existingDeck.purpose !== "test" &&
					currentDeckIds.has(normalizeWDeckLogicalDeckId(existingDeck.id, existingDeck.name))
				) &&
				String(existingDeck.name || "").trim() === normalizedName
		);

		if (duplicateDeck) {
			throw new Error(`牌组名称「${normalizedName}」已存在`);
		}
	}

	async saveDeck(deck: Deck): Promise<ApiResponse<Deck>> {
		try {
			const now = new Date().toISOString();
			let normalizedDeck: Deck = {
				...deck,
				name: String(deck.name || "").trim(),
			};
			const allDecks = await this.getDecks();
			this.validateDeckNameUniqueness(allDecks, normalizedDeck);

			if (this.plugin.wdeckService && normalizedDeck.purpose !== "test") {
				const existingDeck = await this.getDeck(normalizedDeck.id);
				const oldDeckName =
					existingDeck && existingDeck.name !== normalizedDeck.name ? existingDeck.name : undefined;
				const logicalDeckId = normalizeWDeckLogicalDeckId(normalizedDeck.id, normalizedDeck.name);
				this.markInternalWrite();
				const savedAggregate = await this.plugin.wdeckService.saveDeckDefinition({
					...normalizedDeck,
					id: logicalDeckId,
					created: normalizedDeck.created || existingDeck?.created || now,
					modified: now,
					purpose: "memory",
				});
				const savedDeck = this.createVirtualWDeckDeck({
					deckId: savedAggregate.runtimeDeckId,
					deckName: savedAggregate.logicalDeckName,
					cardUUIDs: savedAggregate.cards.map((card: Card) => card.uuid).filter(Boolean),
					logicalDeckId: savedAggregate.logicalDeckId,
					filePaths: savedAggregate.files.map((file: { path: string }) => file.path),
					segmentIndices: savedAggregate.segmentIndices,
					deckDefinition: savedAggregate.deck,
				});

				await this.removePersistedMemoryDeck(logicalDeckId);

				if (this.plugin.deckNameMapper) {
					if (!existingDeck) {
						this.plugin.deckNameMapper.onDeckCreated(savedDeck);
					} else if (oldDeckName) {
						this.plugin.deckNameMapper.onDeckRenamed(savedDeck.id, oldDeckName, savedDeck.name);
						if (this.plugin.cardMetadataCache) {
							this.plugin.cardMetadataCache.clear();
						}
					}
				}

				await new Promise((resolve) => window.setTimeout(resolve, 50));

				const dataChangeContext = this.getDataChangeContext();
				await this.notifyDataChange(
					{
						type: "decks",
						action: existingDeck ? "update" : "create",
						ids: [savedDeck.id],
						metadata: {
							deckIds:
								Array.isArray(dataChangeContext?.deckIds) && dataChangeContext.deckIds.length > 0
									? dataChangeContext.deckIds
									: [savedDeck.id],
						},
					},
					"suppressDeckNotifications"
				);

				return {
					success: true,
					data: savedDeck,
					timestamp: new Date().toISOString(),
				};
			}

			const decks =
				(this.plugin.app.vault as { adapter?: unknown }).adapter
					? await this.readPersistedDecks()
					: (await this.getDecks()).filter((item) => !this.isVirtualWDeckDeck(item));
			const existingIndex = decks.findIndex((d) => d.id === deck.id);
			const isNew = existingIndex < 0;

			let oldDeckName: string | undefined;
			if (existingIndex >= 0) {
				const existingDeck = decks[existingIndex];
				if (existingDeck.name !== normalizedDeck.name) {
					oldDeckName = existingDeck.name;
				}
				normalizedDeck = {
					...existingDeck,
					...normalizedDeck,
					modified: now,
				};
				decks[existingIndex] = normalizedDeck;
			} else {
				normalizedDeck = {
					...normalizedDeck,
					created: normalizedDeck.created || now,
					modified: now,
				};
				decks.push(normalizedDeck);
			}

			this.markInternalWrite();
			await this.writePersistedDecks(decks);

			if (this.plugin.deckNameMapper) {
				if (isNew) {
					this.plugin.deckNameMapper.onDeckCreated(normalizedDeck);
				} else if (oldDeckName) {
					this.plugin.deckNameMapper.onDeckRenamed(
						normalizedDeck.id,
						oldDeckName,
						normalizedDeck.name
					);
					if (this.plugin.cardMetadataCache) {
						this.plugin.cardMetadataCache.clear();
					}
				}
			}

			await new Promise((resolve) => window.setTimeout(resolve, 50));

			const dataChangeContext = this.getDataChangeContext();
			await this.notifyDataChange(
				{
					type: "decks",
					action: isNew ? "create" : "update",
					ids: [normalizedDeck.id],
					metadata: {
						deckIds:
							Array.isArray(dataChangeContext?.deckIds) && dataChangeContext.deckIds.length > 0
								? dataChangeContext.deckIds
								: [normalizedDeck.id],
					},
				},
				"suppressDeckNotifications"
			);

			return {
				success: true,
				data: normalizedDeck,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			logger.error("Failed to save deck:", error);
			return {
				success: false,
				error: extractErrorMessage(error),
				timestamp: new Date().toISOString(),
			};
		}
	}

	async deleteDeck(
		deckId: string,
		options?: { skipCardDeletion?: boolean }
	): Promise<ApiResponse<boolean>> {
		try {
			if (this.plugin.wdeckService?.isWDeckDeckId(deckId)) {
				if (options?.skipCardDeletion) {
					await this.plugin.wdeckService.dissolveDeckByDeckId(deckId);
				} else {
					await this.plugin.wdeckService.deleteDeckByDeckId(deckId);
				}

				await this.cleanupStudySessionsByDeck(deckId);
				await this.cleanupDeckMediaFiles(deckId);
				await this.notifyDeckDeletion(deckId);

				if (this.plugin.deckNameMapper) {
					this.plugin.deckNameMapper.onDeckDeleted(deckId);
				}

				if (this.plugin.cardMetadataCache) {
					this.plugin.cardMetadataCache.clear();
				}

				await new Promise((resolve) => window.setTimeout(resolve, 50));

				await this.notifyDataChange(
					{
						type: "decks",
						action: "delete",
						ids: [deckId],
						metadata: {
							deckId,
							deckIds: [deckId],
						},
					},
					"suppressDeckNotifications"
				);

				return {
					success: true,
					data: true,
					timestamp: new Date().toISOString(),
				};
			}

			const allCards = await this.getCards();
			const deckLookups = (await this.getDecks()).map((deck) => ({ id: deck.id, name: deck.name }));
			const cards = allCards.filter((card) =>
				this.getCardDeckMembershipIds(card, deckLookups).includes(deckId)
			);
			if (!options?.skipCardDeletion && cards.length > 0) {
				// 使用Obsidian Notice显示进度
				new Notice(`正在清理 ${cards.length} 张卡片的源文档...`);
			}

			if (options?.skipCardDeletion && cards.length > 0) {
				const dissolveResult = await this.moveCardsToDeck(
					cards.map((card) => card.uuid),
					WDECK_UNGROUPED_DECK_NAME
				);
				if (dissolveResult.failed.length > 0) {
					return {
						success: false,
						error: `解散牌组失败，${dissolveResult.failed.length} 张卡片未能迁移到未归组卡片`,
						timestamp: new Date().toISOString(),
					};
				}
			}

			const decks = deckLookups.length > 0 ? await this.getDecks() : [];
			const filteredDecks = decks.filter((d) => d.id !== deckId);

			// 1. 删除牌组索引
			await this.writeDecksFile({ decks: filteredDecks });

			// 1.5 删除 cardUUIDs 独立文件
			await this.deleteDeckCardUUIDs(deckId);

			if (!options?.skipCardDeletion) {
				await this.deleteCardsByDeck(
					deckId,
					cards.map((card) => card.uuid)
				);
			}

			await this.cleanupStudySessionsByDeck(deckId);

			// 4. Clean up deck media files
			await this.cleanupDeckMediaFiles(deckId);

			// 5. Notify related services to clear deck-specific caches
			await this.notifyDeckDeletion(deckId);

			if (this.plugin.deckNameMapper) {
				this.plugin.deckNameMapper.onDeckDeleted(deckId);
			}

			if (this.plugin.cardMetadataCache) {
				this.plugin.cardMetadataCache.clear();
			}

			logger.info(`🎉 牌组删除完成: ${deckId}`);

			// 等待写入稳定后再通知变更
			await new Promise((resolve) => window.setTimeout(resolve, 50));

			// 通知数据同步服务
			await this.notifyDataChange(
				{
					type: "decks",
					action: "delete",
					ids: [deckId],
					metadata: {
						deckId,
						deckIds: [deckId],
					},
				},
				"suppressDeckNotifications"
			);

			return {
				success: true,
				data: true,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			logger.error("Failed to delete deck:", error);
			return {
				success: false,
				error: extractErrorMessage(error),
				timestamp: new Date().toISOString(),
			};
		}
	}

	// 卡片操作
	async getCards(query?: DataQuery): Promise<Card[]> {
		try {
			if (query?.deckId) {
				if (this.plugin.wdeckService?.isWDeckDeckId(query.deckId)) {
					const aggregate = await this.plugin.wdeckService.getDeckAggregateByDeckId(query.deckId);
					const deckCards = (aggregate?.cards || []).map((card) => this.hydrateCardFromYAML(card));
					const { deckId: _deckId, ...restQuery } = query;
					const hasOtherFilters = Object.keys(restQuery).length > 0;
					return hasOtherFilters ? this.filterCards(deckCards, restQuery as DataQuery) : deckCards;
				}

				const deckCards = await this.getCardsForDeck(query.deckId);
				const { deckId: _deckId, ...restQuery } = query;
				const hasOtherFilters = Object.keys(restQuery).length > 0;
				return hasOtherFilters ? this.filterCards(deckCards, restQuery as DataQuery) : deckCards;
			}

			const all = await this.readAllCardsFromUnifiedStorage();
			return query ? this.filterCards(all, query) : all;
		} catch (error) {
			logger.error("Failed to get cards:", error);
			return [];
		}
	}

	async saveCard(card: Card): Promise<ApiResponse<Card>> {
		try {
			const { getProgressiveClozeGateway } = await import(
				"../services/progressive-cloze/ProgressiveClozeGateway"
			);
			const gateway = getProgressiveClozeGateway();

			const hasRuntimeWDeckMeta = this.plugin.wdeckService?.hasRuntimeCardMeta(card) === true;
			let existingCard: Card | undefined = hasRuntimeWDeckMeta ? this.normalizeCardData(card) : undefined;

			if (!existingCard) {
				existingCard = (await this.getCards()).find((c) => c.uuid === card.uuid);
			}

			if (!existingCard && card.deckId) {
				const deckCards = await this.getDeckCards(card.deckId);
				existingCard = deckCards.find((c) => c.uuid === card.uuid);
			}

			if (!existingCard) {
				const processResult = await gateway.processNewCard(card);

				if (processResult.converted) {
					logger.info(
						`检测到渐进式挖空，保存${processResult.cards.length}张卡片（1父 + ${
							processResult.cards.length - 1
						}子）`
					);

					const savedCards: Card[] = [];
					for (const c of processResult.cards) {
						const normalized = this.normalizeCardData(c);
						await this.saveCardInternal(normalized, {
							syncDeckMembershipFromRuntime: this.getRuntimeDeckIds(normalized).length > 0,
						});
						savedCards.push(normalized);
					}

					return {
						success: true,
						data: savedCards[0],
						timestamp: new Date().toISOString(),
					};
				}

				const normalizedCard = this.normalizeCardData(processResult.cards[0]);
				return await this.saveCardInternal(normalizedCard, {
					syncDeckMembershipFromRuntime: this.getRuntimeDeckIds(normalizedCard).length > 0,
				});
			}

			if (
				existingCard.type !== CardType.ProgressiveParent &&
				existingCard.type !== CardType.ProgressiveChild &&
				hasProgressiveClozeContent(card.content || "")
			) {
				logger.info(`[Storage] 检测到普通卡更新为渐进式挖空，开始转换: ${card.uuid}`);

				const processResult = await gateway.processNewCard({
					...existingCard,
					...card,
					content: card.content,
				});

				if (processResult.converted) {
					const savedCards: Card[] = [];
					for (const c of processResult.cards) {
						const normalized = this.normalizeCardData(c);
						const saveResult = await this.saveCardInternal(normalized, {
							knownExisting: normalized.uuid === existingCard.uuid,
						});
						if (!saveResult.success) {
							return {
								success: false,
								error: saveResult.error || "渐进式挖空转换保存失败",
								timestamp: new Date().toISOString(),
							};
						}
						savedCards.push(saveResult.data || normalized);
					}

					return {
						success: true,
						data: savedCards[0],
						timestamp: new Date().toISOString(),
					};
				}
			}

			// 第二道门：更新卡片，渐进式父卡统一走 Gateway
			if (existingCard.type === CardType.ProgressiveParent) {
				logger.info("[Storage] 检测到渐进式父卡保存，开始同步...");

				const onConfirmNeeded = async (message: string, title?: string): Promise<boolean> => {
					const { showObsidianConfirm } = await import("../utils/obsidian-confirm");
					return showObsidianConfirm(this.plugin.app, message, {
						title: title || "确认",
						confirmText: "确认",
						cancelText: "取消",
						confirmClass: "mod-warning",
					});
				};

				const onExitChoiceNeeded = async (
					_parentCard: Card,
					childCards: ProgressiveClozeChildCard[],
					nextType: CardType.Basic | CardType.Cloze
				) => {
					const { showObsidianChoice } = await import("../utils/obsidian-confirm");
					const studiedCount = childCards.filter(
						(child) => child.fsrs && child.fsrs.reps > 0
					).length;
					const targetTypeLabel = nextType === CardType.Cloze ? "普通挖空" : "普通问答";
					const baseMessage =
						`当前内容已不再满足渐进式挖空规则，将转为${targetTypeLabel}。\n` +
						`共有 ${childCards.length} 个子卡。` +
						(studiedCount > 0 ? `其中 ${studiedCount} 个子卡已有学习历史。` : "");

					type ExitSelection = `inherit:${string}` | "reset-all";
					const choices: Array<{
						value: ExitSelection;
						text: string;
						description: string;
						className: string;
					}> = childCards.map((child) => ({
						value: `inherit:${child.uuid}` as ExitSelection,
						text: `继承 ${this.getProgressiveChildLabel(child)}`,
						description: "保留该子卡的学习历史，其余子卡历史删除",
						className: "mod-cta",
					}));

					choices.push({
						value: "reset-all",
						text: "全部重置",
						description: "删除全部子卡，并将父卡历史清零",
						className: "mod-warning",
					});

					const selected = await showObsidianChoice<ExitSelection>(this.plugin.app, baseMessage, {
						title: "退出渐进式挖空",
						choices,
						cancelText: "取消保存",
					});

					if (!selected) {
						return { mode: "cancel" as const };
					}

					if (selected === "reset-all") {
						return { mode: "reset-all" as const };
					}

					return {
						mode: "inherit-child" as const,
						childUuid: selected.slice("inherit:".length),
					};
				};

				const updatedCards = await gateway.processContentChange(
					existingCard,
					card.content,
					{
						deleteCard: async (uuid: string) => {
							await this.deleteCard(uuid);
						},
						saveCard: async (c: Card) => {
							const normalized = this.normalizeCardData(c);
							await this.saveCardInternal(normalized, {
								knownExisting: normalized.uuid === existingCard.uuid,
							});
						},
						getCardsByUUIDs: async (uuids: string[]) => {
							return await this.getCardsByUUIDs(uuids);
						},
						getDeckCards: async (deckId: string) => {
							return await this.getDeckCards(deckId);
						},
					},
					onConfirmNeeded,
					onExitChoiceNeeded
				);

				if (updatedCards === null) {
					logger.info("[Storage] 用户取消了渐进式挖空变更，保存已中止");
					return { success: false, error: "SAVE_CANCELLED", timestamp: new Date().toISOString() };
				}

				const normalizedParentCard = this.normalizeCardData(updatedCards[0]);
				const parentSaveResult = await this.saveCardInternal(normalizedParentCard, {
					knownExisting: true,
				});
				if (!parentSaveResult.success) {
					logger.error("[Storage] 渐进式父卡保存失败:", parentSaveResult.error);
					return {
						success: false,
						error: parentSaveResult.error || "渐进式父卡保存失败",
						timestamp: new Date().toISOString(),
					};
				}

				logger.info(`[Storage] 内容同步完成，更新了 ${updatedCards.length} 张卡片`);

				return {
					success: true,
					data: parentSaveResult.data || normalizedParentCard,
					timestamp: new Date().toISOString(),
				};
			}

			// 普通更新：直接保存
			const normalizedCard = this.normalizeCardData(card);
			return await this.saveCardInternal(normalizedCard, {
				knownExisting: !!existingCard,
			});
		} catch (error) {
			logger.error("Failed to save card:", error);
			return {
				success: false,
				error: extractErrorMessage(error),
				timestamp: new Date().toISOString(),
			};
		}
	}

	/**
	 * 安全的跨牌组移动方法（引用式架构）
	 * 将卡片从一个牌组移动到另一个牌组
	 * 使用 deck.cardUUIDs 与 card.referencedByDecks 进行引用管理
	 * @param cardUuid 卡片UUID
	 * @param sourceDeckId 源牌组ID
	 * @param targetDeckId 目标牌组ID
	 */
	async moveCardToDeck(
		cardUuid: string,
		sourceDeckId: string,
		targetDeckId: string
	): Promise<ApiResponse<Card>> {
		try {
			// 1. 验证参数
			if (!cardUuid) {
				return { success: false, error: "卡片UUID不能为空", timestamp: new Date().toISOString() };
			}

			if (sourceDeckId === targetDeckId) {
				return {
					success: false,
					error: "源牌组和目标牌组相同",
					timestamp: new Date().toISOString(),
				};
			}

			const moveResult = await this.moveCardsToDeck([cardUuid], targetDeckId);
			if (moveResult.failed.length > 0) {
				return {
					success: false,
					error: moveResult.failed[0].error,
					timestamp: new Date().toISOString(),
				};
			}

			const movedCard = moveResult.moved[0];
			if (!movedCard) {
				return {
					success: false,
					error: "卡片移动失败",
					timestamp: new Date().toISOString(),
				};
			}

			logger.info(`[Storage] 卡片移动成功: ${cardUuid} ${sourceDeckId} -> ${targetDeckId}`);

			return { success: true, data: movedCard, timestamp: new Date().toISOString() };
		} catch (error) {
			logger.error("[Storage] 卡片移动失败:", error);
			return {
				success: false,
				error: extractErrorMessage(error),
				timestamp: new Date().toISOString(),
			};
		}
	}

	/**
	 * 从 content YAML 解析并填充运行时字段
	 * content 是唯一权威数据源，运行时字段作为缓存供其他组件使用
	 * @private
	 */
	private hydrateCardFromYAML(card: Card): Card {
		try {
			const yaml = parseYAMLFromContent(card.content || "");
			if (!card.content) {
				syncCardStatsToCanonicalFormat(card);
				return card; // 没有 YAML，返回原卡片
			}

			const hydrated: Card = { ...card };
			const sourceInfo = parseSourceInfo(card.content || "");
			if (sourceInfo.sourceFile) {
				hydrated.sourceFile = sourceInfo.sourceFile;
			}
			if (sourceInfo.sourceBlock) {
				hydrated.sourceBlock = sourceInfo.sourceBlock;
			}

			// 3. we_decks 需要通过 DeckNameMapper 转换（异步，这里只记录名称）
			// 注意：deckId 的转换在需要时通过 CardMetadataService 处理

			if (yaml.we_type) {
				hydrated.type = yaml.we_type;
			} else if (!hydrated.type) {
				const body = extractBodyContent(hydrated.content || "") || hydrated.content || "";
				hydrated.type = (detectCardTypeFromContent(body) || CardType.Basic) as unknown;
			}

			// 5. we_priority -> priority
			if (yaml.we_priority !== undefined) {
				hydrated.priority = yaml.we_priority;
			}

			// 6. created / we_created -> created
			const created =
				typeof yaml.created === "string"
					? yaml.created
					: typeof yaml.we_created === "string"
						? yaml.we_created
						: undefined;
			if (created) {
				hydrated.created = created;
			}

			// 7. tags -> tags
			const extractedTags = extractAllTags(card.content || "");
			if (extractedTags.length > 0) {
				hydrated.tags = extractedTags;
			} else if (card.content) {
				hydrated.tags = [];
			}

			syncCardStatsToCanonicalFormat(hydrated);
			return hydrated;
		} catch (error) {
			logger.warn("[Storage] ⚠️ YAML 解析运行时字段失败:", error);
			syncCardStatsToCanonicalFormat(card);
			return card;
		}
	}

	/**
	 * 确保 content YAML 格式完整
	 *
	 * 重要：content YAML 是唯一权威数据源
	 * 此方法仅保留 YAML 现有值，不从派生字段反向同步
	 * 派生字段（tags, priority 等）只是运行时缓存，不应写回 content
	 *
	 * 如需修改元数据，应直接使用 yaml-utils 修改 content，例如：
	 * card.content = setCardProperty(card.content, 'tags', newTags);
	 *
	 * @private
	 */
	private async syncCardMetadataToYAML(
		card: Card,
		options?: { syncDeckMembershipFromRuntime?: boolean }
	): Promise<Card> {
		try {
			// content YAML 是唯一权威数据源，直接解析保留
			const existingYAML = parseYAMLFromContent(card.content || "") || {};
			const shouldSyncDeckMembershipFromRuntime = options?.syncDeckMembershipFromRuntime === true;
			const hasExistingYAML = Object.keys(existingYAML).length > 0;
			if (!hasExistingYAML && !shouldSyncDeckMembershipFromRuntime) {
				return card;
			}
			if (!hasExistingYAML && shouldSyncDeckMembershipFromRuntime) {
				(existingYAML as Record<string, unknown>).__deckSyncPlaceholder = true;
			}

			// 璋冭瘯鏃ュ織锛氭鏌ヤ紶鍏ョ殑 we_decks 鍊?
			if (Object.keys(existingYAML).length === 0) {
				return card;
			}

			const metadata: CardYAMLMetadata = {};

			if (existingYAML.we_source) metadata.we_source = existingYAML.we_source;
			if (existingYAML.we_block) metadata.we_block = existingYAML.we_block;
			if (existingYAML.we_decks) metadata.we_decks = existingYAML.we_decks;
			const runtimeDeckIds = this.getRuntimeDeckIds(card);
			let normalizedRuntimeDeckIds = runtimeDeckIds;
			if (shouldSyncDeckMembershipFromRuntime) {
				const decks = await this.getDecks();
				const normalizedMembership = this.normalizeRuntimeDeckMembership(runtimeDeckIds, decks);
				normalizedRuntimeDeckIds = normalizedMembership.deckIds;
				metadata.we_decks =
					normalizedMembership.deckNames.length > 0
						? normalizedMembership.deckNames
						: undefined;
			}
			if (card.type) {
				metadata.we_type = card.type as unknown;
			} else {
				const body = extractBodyContent(card.content || "") || card.content || "";
				const detected = detectCardTypeFromContent(body);
				metadata.we_type = (detected || CardType.Basic) as unknown;
				logger.debug(
					"[Storage] syncCardMetadataToYAML: 根据当前内容自动检测 we_type 为",
					metadata.we_type
				);
			}
			if (existingYAML.we_priority !== undefined) metadata.we_priority = existingYAML.we_priority;
			if (existingYAML.tags) metadata.tags = existingYAML.tags;
			const canonicalCreated =
				typeof card.created === "string" && card.created.trim()
					? card.created
					: typeof existingYAML.created === "string" && existingYAML.created.trim()
						? existingYAML.created
						: typeof existingYAML.we_created === "string" && existingYAML.we_created.trim()
							? existingYAML.we_created
							: undefined;
			if (canonicalCreated) {
				metadata.created = canonicalCreated;
			}
			delete (metadata as Record<string, unknown>)["we_created"];

			const newContent = setCardProperties(card.content || "", metadata);

			const syncedCard: Card = {
				...card,
				content: newContent,
			};

			if (shouldSyncDeckMembershipFromRuntime) {
				syncedCard.referencedByDecks = normalizedRuntimeDeckIds;
				if (normalizedRuntimeDeckIds.length > 0) {
					syncedCard.deckId = normalizedRuntimeDeckIds[0];
				} else {
					(syncedCard as Partial<Card>).deckId = undefined;
				}
			}

			return syncedCard;
		} catch (error) {
			logger.warn("[Storage] ⚠️ YAML 元数据处理失败，使用原卡片:", error);
			return card;
		}
	}

	/**
	 * 内部保存方法：保存单张已标准化的卡片
	 *
	 * 优先保存到统一卡片存储（weave/cards/）
	 * @private
	 */
	private async saveCardInternal(
		normalizedCard: Card,
		options?: { syncDeckMembershipFromRuntime?: boolean; knownExisting?: boolean }
	): Promise<ApiResponse<Card>> {
		const { isValidUUID } = await import("../utils/helpers");
		if (!isValidUUID(normalizedCard.uuid)) {
			logger.error("[Storage] 卡片 UUID 无效:", normalizedCard.uuid);
			return {
				success: false,
				error: `卡片 UUID 无效: ${normalizedCard.uuid}`,
				timestamp: new Date().toISOString(),
			};
		}

		const now = new Date();
		const cardWithYAML = await this.syncCardMetadataToYAML(normalizedCard, options);
		const knownExisting =
			options?.knownExisting === true ||
			this.plugin.wdeckService?.hasRuntimeCardMeta(cardWithYAML) === true;
		const isCreateAction = knownExisting
			? false
			: !(await this.getExistingCardUUIDSet([normalizedCard.uuid])).has(normalizedCard.uuid);

		if (isCreateAction) {
			const coalesced = await this.coalesceNewCardAgainstBodyDuplicate(cardWithYAML);
			if (coalesced.redirected) {
				return await this.saveCardInternal(this.normalizeCardData(coalesced.card), {
					knownExisting: true,
				});
			}
		}

		if (this.plugin.wdeckService?.hasRuntimeCardMeta(cardWithYAML)) {
			try {
				const savedCard = await this.plugin.wdeckService.saveCard({
					...cardWithYAML,
					created: cardWithYAML.created || now.toISOString(),
					modified: now.toISOString(),
				});
				this.plugin.cardMetadataCache?.invalidate(normalizedCard.uuid);

				await this.notifyDataChange(
					{
						type: "cards",
						action: isCreateAction ? "create" : "update",
						ids: [normalizedCard.uuid],
						metadata: {
							deckId: savedCard.deckId,
							deckIds: savedCard.deckId ? [savedCard.deckId] : [],
						},
					},
					"suppressCardNotifications"
				);

				await this.syncCardIndicesAfterWrite(savedCard);
				this.invalidateBodyFingerprintIndex();
				return { success: true, data: savedCard, timestamp: now.toISOString() };
			} catch (error) {
				logger.warn("[Storage] WDeck 卡片保存失败:", error);
				return {
					success: false,
					error: extractErrorMessage(error),
					timestamp: now.toISOString(),
				};
			}
		}

		if (this.plugin.wdeckService) {
			try {
				const targetDeck = await this.resolveWDeckTargetForCard(cardWithYAML);
				const savedCard = await this.plugin.wdeckService.saveCardToDeck(targetDeck, {
					...cardWithYAML,
					created: cardWithYAML.created || now.toISOString(),
					modified: now.toISOString(),
				});

				if (normalizedCard.deckId && !this.plugin.wdeckService.isWDeckDeckId(normalizedCard.deckId)) {
					await this.upsertPersistedDeckCardUUIDs(normalizedCard.deckId, [normalizedCard.uuid]);
				}

				this.plugin.cardMetadataCache?.invalidate(normalizedCard.uuid);
				await this.notifyDataChange(
					{
						type: "cards",
						action: isCreateAction ? "create" : "update",
						ids: [normalizedCard.uuid],
						metadata: {
							deckId: savedCard.deckId,
							deckIds: savedCard.deckId ? [savedCard.deckId] : [],
						},
					},
					"suppressCardNotifications"
				);

				await this.syncCardIndicesAfterWrite(savedCard);
				this.invalidateBodyFingerprintIndex();
				return { success: true, data: savedCard, timestamp: now.toISOString() };
			} catch (error) {
				logger.warn("[Storage] 普通记忆卡写入 .wdeck 失败:", error);
				return {
					success: false,
					error: extractErrorMessage(error),
					timestamp: now.toISOString(),
				};
			}
		}

		return {
			success: false,
			error: "WDeckService 未初始化或保存失败",
			timestamp: now.toISOString(),
		};
	}

	async saveCardsBatch(cards: Card[]): Promise<void> {
		const normalizedCards = (cards || []).map((c) => this.normalizeCardData(c));
		const result = await this.saveCardsInternalBatch(normalizedCards);
		if (!result.success) {
			throw new Error(result.error || "批量保存失败");
		}
	}

	async saveCardsBatchWithProgress(
		cards: Card[],
		onProgress?: StorageProgressCallback
	): Promise<void> {
		const normalizedCards = (cards || []).map((c) => this.normalizeCardData(c));
		const result = await this.saveCardsInternalBatch(normalizedCards, {
			onProgress,
			progressLabel: "正在保存导入卡片",
		});
		if (!result.success) {
			throw new Error(result.error || "批量保存失败");
		}
	}

	private async saveCardsInternalBatch(
		normalizedCards: Card[],
		options?: {
			onProgress?: StorageProgressCallback;
			progressCurrentOffset?: number;
			progressTotal?: number;
			progressLabel?: string;
		}
	): Promise<ApiResponse<Card[]>> {
		try {
			if (!normalizedCards || normalizedCards.length === 0) {
				return { success: true, data: [], timestamp: new Date().toISOString() };
			}

			if (!this.plugin.wdeckService) {
				return {
					success: false,
					error: "WDeckService 未初始化或保存失败",
					timestamp: new Date().toISOString(),
				};
			}

			const { getProgressiveClozeGateway } = await import(
				"../services/progressive-cloze/ProgressiveClozeGateway"
			);
			const gateway = getProgressiveClozeGateway();
			const { isValidUUID } = await import("../utils/helpers");
			const now = new Date();
			const isApkgImport = this.getDataChangeContext()?.source === "apkg_import";
			const cardsAfterGateway = (
				await gateway.processBatch(normalizedCards, { importMode: isApkgImport })
			).map((c) => this.normalizeCardData(c));
			const existingCardUUIDs = await this.getExistingCardUUIDSet(
				cardsAfterGateway.map((card) => card.uuid)
			);
			const cardsToPersist = await this.deduplicateBatchCardsByBodyFingerprint(
				cardsAfterGateway,
				existingCardUUIDs
			);
			const progressTotal = Math.max(1, options?.progressTotal ?? cardsToPersist.length);
			const progressCurrentOffset = Math.max(0, options?.progressCurrentOffset ?? 0);
			const progressCapBeforeFinalize = progressTotal > 1 ? progressTotal - 1 : 1;
			const reportSaveProgress = (processedCount: number) => {
				options?.onProgress?.(
					Math.min(progressCapBeforeFinalize, progressCurrentOffset + processedCount),
					progressTotal,
					options?.progressLabel
						? `${options.progressLabel}（${processedCount}/${cardsToPersist.length}）`
						: `正在处理第 ${processedCount}/${cardsToPersist.length} 张卡片`
				);
			};

			const deckToUUIDs = new Map<string, Set<string>>();
			const wdeckCardsToSave: Card[] = [];
			const deckBoundWDeckCards = new Map<string, { deck: { id: string; name: string }; cards: Card[] }>();

			for (let index = 0; index < cardsToPersist.length; index++) {
				const c = cardsToPersist[index];
				if (!c?.uuid || !isValidUUID(c.uuid)) {
					reportSaveProgress(index + 1);
					continue;
				}

				const cardWithYAML = isApkgImport
					? c
					: await this.syncCardMetadataToYAML(c, {
							syncDeckMembershipFromRuntime:
								!existingCardUUIDs.has(c.uuid) && this.getRuntimeDeckIds(c).length > 0,
						});
				const cardToSave: Card = {
					...cardWithYAML,
					created: cardWithYAML.created || now.toISOString(),
					modified: now.toISOString(),
				};

				if (this.plugin.wdeckService?.hasRuntimeCardMeta(cardToSave)) {
					wdeckCardsToSave.push(cardToSave);
					reportSaveProgress(index + 1);
					continue;
				}

				const targetDeck = await this.resolveWDeckTargetForCard(cardToSave);
				const bucket =
					deckBoundWDeckCards.get(targetDeck.id) || {
						deck: targetDeck,
						cards: [],
					};
				bucket.cards.push(cardToSave);
				deckBoundWDeckCards.set(targetDeck.id, bucket);

				if (c.deckId && !this.plugin.wdeckService.isWDeckDeckId(c.deckId)) {
					const set = deckToUUIDs.get(c.deckId) || new Set<string>();
					set.add(c.uuid);
					deckToUUIDs.set(c.deckId, set);
				}
				reportSaveProgress(index + 1);
			}

			for (const [deckId, uuidSet] of deckToUUIDs.entries()) {
				const persistedDeck = await this.getPersistedDeckById(deckId);
				if (!persistedDeck) continue;
				const existing = new Set<string>(persistedDeck.cardUUIDs || []);
				for (const uuid of uuidSet) {
					existing.add(uuid);
				}
				await this.upsertPersistedDeckCardUUIDs(deckId, Array.from(existing));
			}

			if (wdeckCardsToSave.length > 0) {
				await this.plugin.wdeckService.saveCardsBatch(wdeckCardsToSave);
			}

			for (const entry of deckBoundWDeckCards.values()) {
				await this.plugin.wdeckService.saveCardsToDeck(entry.deck, entry.cards);
			}

			const savedDeckBoundCards = Array.from(deckBoundWDeckCards.values()).flatMap((entry) => entry.cards);

			if (this.plugin.cardMetadataCache) {
				for (const c of [...wdeckCardsToSave, ...savedDeckBoundCards]) {
					this.plugin.cardMetadataCache.invalidate(c.uuid);
				}
			}

			if (wdeckCardsToSave.length + savedDeckBoundCards.length > 0) {
				const savedCards = [...wdeckCardsToSave, ...savedDeckBoundCards];
				const action = savedCards.every((card) => existingCardUUIDs.has(card.uuid))
					? "update"
					: "create";
				const dataChangeContext = this.getDataChangeContext();
				const savedDeckIds = Array.from(
					new Set(savedCards.map((card) => String(card.deckId || "").trim()).filter(Boolean))
				);
				await this.notifyDataChange(
					{
						type: "cards",
						action,
						ids: savedCards.map((c) => c.uuid),
						metadata: {
							deckIds:
								Array.isArray(dataChangeContext?.deckIds) && dataChangeContext.deckIds.length > 0
									? dataChangeContext.deckIds
									: savedDeckIds,
							batchSize: savedCards.length,
						},
					},
					"suppressCardNotifications"
				);
			}

			this.invalidateBodyFingerprintIndex();

			options?.onProgress?.(
				progressTotal,
				progressTotal,
				options?.progressLabel ? `${options.progressLabel}，写入完成` : "批量写入完成"
			);

			return {
				success: true,
				data: [...wdeckCardsToSave, ...savedDeckBoundCards],
				timestamp: now.toISOString(),
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error),
				timestamp: new Date().toISOString(),
			};
		}
	}

	async addCard(card: Card): Promise<ApiResponse<Card>> {
		return this.saveCard(card);
	}

	async updateCard(card: Card): Promise<ApiResponse<Card>> {
		return this.saveCard(card);
	}

	async addDeck(deck: Deck): Promise<ApiResponse<Deck>> {
		return this.saveDeck(deck);
	}

	async updateDeck(deck: Deck): Promise<ApiResponse<Deck>> {
		return this.saveDeck(deck);
	}

	private ensureCleanupService(): BlockLinkCleanupService {
		const cleanupService =
			this.plugin.blockLinkCleanupService || BlockLinkCleanupService.getInstance();
		this.plugin.blockLinkCleanupService = cleanupService;

		try {
			cleanupService.initialize({
				dataStorage: this,
				vault: this.plugin.app.vault,
				app: this.plugin.app,
			});
		} catch (error) {
			logger.warn("[Storage] 清理服务懒初始化失败:", error);
		}

		return cleanupService;
	}

	private escapeRegex(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	private detectDeletionCreationType(
		content: string,
		card: Card
	): "batch-parse-single" | "batch-parse-multi" | "quick-create" | null {
		if (!card.uuid) {
			return null;
		}

		const escapedUuid = this.escapeRegex(card.uuid);
		const blockId = card.sourceBlock?.replace(/^\^/, "");
		const escapedBlockId = blockId ? this.escapeRegex(blockId) : "";

		const frontmatterUuidRegex = new RegExp(
			`^---\\r?\\n[\\s\\S]*?^weave-uuid:\\s*["']?${escapedUuid}["']?\\s*$[\\s\\S]*?^---\\s*$`,
			"m"
		);
		if (frontmatterUuidRegex.test(content)) {
			return "batch-parse-single";
		}

		if (blockId) {
			const batchMultiRegex = new RegExp(
				`<!--\\s*${escapedUuid}\\s*-->[^\\r\\n]*\\^${escapedBlockId}(?![A-Za-z0-9_-])`,
				"i"
			);
			if (batchMultiRegex.test(content)) {
				return "batch-parse-multi";
			}

			const quickCreateRegex = new RegExp(`\\^${escapedBlockId}(?![A-Za-z0-9_-])`, "m");
			if (quickCreateRegex.test(content)) {
				return "quick-create";
			}
		}

		return null;
	}

	private withDeletionCleanupMetadata(
		card: Card,
		sourceFile: string,
		creationType: "batch-parse-single" | "batch-parse-multi" | "quick-create"
	): Card {
		return {
			...card,
			sourceFile,
			isBatchScanned: creationType !== "quick-create",
			metadata: {
				...(card.metadata || {}),
				creationType,
			},
		};
	}

	private async resolveMissingDeletionSource(card: Card | null): Promise<Card | null> {
		if (!card || !card.uuid) {
			return card;
		}

		const sourceInfo = parseSourceInfo(card.content || "");
		const isApkgCardWithoutSource =
			card.customFields?.importedFrom === "apkg" && !card.sourceFile && !sourceInfo.sourceFile;
		if (isApkgCardWithoutSource) {
			return card;
		}

		const candidatePaths = new Set<string>();
		if (card.sourceFile) {
			candidatePaths.add(card.sourceFile);
		}
		if (sourceInfo.sourceFile) {
			candidatePaths.add(sourceInfo.sourceFile);
		}

		const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
		for (const file of markdownFiles) {
			if (!candidatePaths.has(file.path)) {
				candidatePaths.add(file.path);
			}
		}

		for (const filePath of candidatePaths) {
			const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				continue;
			}

			try {
				const content = await this.plugin.app.vault.cachedRead(file);
				const creationType = this.detectDeletionCreationType(content, card);
				if (!creationType) {
					continue;
				}

				return this.withDeletionCleanupMetadata(card, file.path, creationType);
			} catch (error) {
				logger.warn("[Storage] 删除时反查来源文档失败:", file.path, error);
			}
		}

		return card;
	}

	private getKnownChildCardIdsForParentCard(parentCard: Card): string[] {
		const relationChildIds = Array.isArray(parentCard.relationMetadata?.childCardIds)
			? parentCard.relationMetadata.childCardIds
			: [];
		const progressiveChildIds = Array.isArray(
			(parentCard as { progressiveCloze?: { childCardIds?: string[] } }).progressiveCloze?.childCardIds
		)
			? ((parentCard as { progressiveCloze?: { childCardIds?: string[] } }).progressiveCloze?.childCardIds ?? [])
			: [];

		return Array.from(
			new Set([...progressiveChildIds, ...relationChildIds].map((id) => String(id || "").trim()).filter(Boolean))
		);
	}

	private isProgressiveChildOfParent(
		card: Card | null | undefined,
		parentCardId: string
	): card is ProgressiveClozeChildCard {
		return !!card && card.type === CardType.ProgressiveChild && card.parentCardId === parentCardId;
	}

	private async resolveProgressiveChildCardsForParent(
		parentCard: Card,
		options?: {
			knownCardsByUUID?: Map<string, Card>;
			fallbackCards?: Card[];
		}
	): Promise<ProgressiveClozeChildCard[]> {
		const parentCardId = String(parentCard.uuid || "").trim();
		if (!parentCardId || parentCard.type !== CardType.ProgressiveParent) {
			return [];
		}

		const childCardIds = this.getKnownChildCardIdsForParentCard(parentCard);
		const knownCardsByUUID = options?.knownCardsByUUID;
		const resolvedChildren: ProgressiveClozeChildCard[] = [];
		const seenUUIDs = new Set<string>();
		const unresolvedChildIds: string[] = [];

		for (const childCardId of childCardIds) {
			const knownCard = knownCardsByUUID?.get(childCardId);
			if (!knownCard) {
				unresolvedChildIds.push(childCardId);
				continue;
			}

			if (this.isProgressiveChildOfParent(knownCard, parentCardId) && !seenUUIDs.has(knownCard.uuid)) {
				seenUUIDs.add(knownCard.uuid);
				resolvedChildren.push(knownCard);
			}
		}

		if (unresolvedChildIds.length > 0) {
			for (const card of await this.getCardsByUUIDs(unresolvedChildIds)) {
				knownCardsByUUID?.set(card.uuid, card);
				if (this.isProgressiveChildOfParent(card, parentCardId) && !seenUUIDs.has(card.uuid)) {
					seenUUIDs.add(card.uuid);
					resolvedChildren.push(card);
				}
			}
		}

		if (childCardIds.length > 0 && resolvedChildren.length === childCardIds.length) {
			return resolvedChildren;
		}

		const fallbackCards = options?.fallbackCards ?? (await this.getCards());
		for (const card of fallbackCards) {
			if (this.isProgressiveChildOfParent(card, parentCardId) && !seenUUIDs.has(card.uuid)) {
				seenUUIDs.add(card.uuid);
				resolvedChildren.push(card);
			}
		}

		return resolvedChildren;
	}

	async deleteCard(cardUuid: string): Promise<ApiResponse<boolean>> {
		try {
			const existingCard = await this.resolveMissingDeletionSource(
				await this.getCardByUUID(cardUuid)
			);
			const cleanupService = this.ensureCleanupService();
			// 级联删除：从所有引用此卡片的牌组中移除 UUID
			const cascadeResult = await this.cascadeDeleteDeckReferences([cardUuid]);
			if (cascadeResult.totalAffectedDecks > 0) {
				logger.info(
					`[Storage] 级联删除：已从 ${cascadeResult.totalAffectedDecks} 个牌组中移除卡片引用`
				);
			}

			let progressiveChildCards: ProgressiveClozeChildCard[] = [];
			if (existingCard?.type === CardType.ProgressiveParent) {
				progressiveChildCards = await this.resolveProgressiveChildCardsForParent(existingCard);
			}

			// 优先从统一存储删除
			if (existingCard && this.plugin.wdeckService?.isWDeckCard(existingCard)) {
				const deleteUUIDs = Array.from(
					new Set([cardUuid, ...progressiveChildCards.map((card) => card.uuid)])
				);
				const deletedUUIDs = await this.plugin.wdeckService.deleteCardsByUUIDs(deleteUUIDs);

				if (deletedUUIDs.includes(cardUuid)) {
					try {
						if (cleanupService?.cleanupAfterCardDeletion) {
							await cleanupService.cleanupAfterCardDeletion(existingCard);
						}
					} catch (cleanupError) {
						logger.error("[Storage] 濞撳懐鎮婇崸妤呮懠閹恒儱銇戠拹?", cleanupError);
					}

					for (const deletedUUID of deletedUUIDs) {
						if (this.plugin.cardMetadataCache) {
							this.plugin.cardMetadataCache.invalidate(deletedUUID);
						}

						this.plugin.app.workspace.trigger("Weave:card-deleted", deletedUUID);
					}

					await this.removeCardsFromIndices(deletedUUIDs);

					await this.notifyDataChange(
						{
							type: "cards",
							action: "delete",
							ids: deletedUUIDs,
							metadata: { deckId: existingCard.deckId },
						},
						"suppressCardNotifications"
					);

					this.invalidateBodyFingerprintIndex();
					return { success: true, data: true, timestamp: new Date().toISOString() };
				}
			}

			// 回退到旧牌组文件删除链路。
			let deckId: string | undefined;
			let cardToDelete: Card | null = existingCard;
			let allCardsInDeck: Card[] = [];

			if (!deckId) {
				const allDecks = await this.getDecks();

				for (const d of allDecks) {
					const cards = await this.getDeckCards(d.id);
					cardToDelete = cards.find((c) => c.uuid === cardUuid) ?? null;
					if (cardToDelete) {
						deckId = d.id;
						allCardsInDeck = cards; // 保存已读取的卡片列表
						break;
					}
				}
			} else {
				// 使用索引快速定位后，只读取该deck
				allCardsInDeck = await this.getDeckCards(deckId);
				cardToDelete = allCardsInDeck.find((c) => c.uuid === cardUuid) ?? null;
			}

			if (cardToDelete && cardToDelete.type === CardType.ProgressiveParent) {
				logger.info(`[Storage] 检测到渐进式挖空父卡片: ${cardUuid}，开始级联删除子卡片`);

				const childCards = allCardsInDeck.filter(
					(c): c is ProgressiveClozeChildCard =>
						c.type === CardType.ProgressiveChild &&
						isProgressiveClozeChild(c) &&
						c.parentCardId === cardUuid
				);

				for (const childCard of childCards) {
					const childIndex = allCardsInDeck.findIndex((c) => c.uuid === childCard.uuid);
					if (childIndex >= 0) {
						allCardsInDeck.splice(childIndex, 1);
					}
				}

				logger.info(`[Storage] 已级联删除 ${childCards.length} 个子卡片`);
			}

			// 步骤2: 删除卡片（避免重复读取）
			let deletedDeckId: string | undefined;

			if (deckId && cardToDelete && allCardsInDeck.length > 0) {
				const filtered = allCardsInDeck.filter((c) => c.uuid !== cardUuid);
				await this.saveDeckCards(deckId, filtered);
				deletedDeckId = deckId;
			}

			if (deletedDeckId) {
				// 等待写入稳定后再通知变更
				await new Promise((resolve) => window.setTimeout(resolve, 50));

				await this.notifyDataChange(
					{
						type: "cards",
						action: "delete",
						ids: [cardUuid],
						metadata: { deckId: deletedDeckId },
					},
					"suppressCardNotifications"
				);

				if (cardToDelete) {
					try {
						if (!cleanupService) {
							logger.warn("[Storage] ⚠️ 清理服务未初始化，跳过源文档清理");
						} else if (typeof cleanupService.cleanupAfterCardDeletion !== "function") {
							logger.warn("[Storage] 清理服务方法不存在，跳过源文档清理");
						} else {
							const cleanupResult = await cleanupService.cleanupAfterCardDeletion(cardToDelete);

							if (cleanupResult.success) {
								logger.info(
									`[Storage] 已清理卡片源文档: ${cardUuid}, 清理项目: ${cleanupResult.cleanedItems.length}`
								);

								// 显示用户友好的通知
								if (cleanupResult.cleanedItems.length > 0) {
									new Notice(`已清理源文档中的 ${cleanupResult.cleanedItems.length} 项残留信息`);
								}
							} else {
								logger.warn(
									`[Storage] ⚠️ 清理卡片源文档部分失败: ${cleanupResult.error || "未知错误"}`
								);
							}
						}
					} catch (cleanupError) {
						// 清理失败不影响删除操作，但要详细记录错误
						logger.error("[Storage] 清理块链接失败:", cleanupError);
						logger.error("[存储] 清理错误详情:", {
							cardUuid,
							sourceFile: cardToDelete.sourceFile,
							sourceBlock: cardToDelete.sourceBlock,
							error: cleanupError,
						});
					}

					//  同步删除DirectFileCardReader索引
					if (this.plugin.directFileReader) {
						this.plugin.directFileReader.removeCardIndex(cardUuid, cardToDelete.uuid);
					}
				}

				// v5.8: 触发卡片删除事件（用于会话统计等）
				this.plugin.app.workspace.trigger("Weave:card-deleted", cardUuid);

				return { success: true, data: true, timestamp: new Date().toISOString() };
			}

			// 已取消旧全量文件的回退写入
			return { success: true, data: false, timestamp: new Date().toISOString() };
		} catch (error) {
			logger.error("Failed to delete card:", error);
			return {
				success: false,
				error: extractErrorMessage(error),
				timestamp: new Date().toISOString(),
			};
		}
	}

	async deleteCards(
		uuids: string[],
		options?: { skipCascadeDeckIds?: string[] }
	): Promise<{ deleted: string[]; failed: Array<{ uuid: string; error?: string }> }> {
		const deleted: string[] = [];
		const failed: Array<{ uuid: string; error?: string }> = [];

		const uniqueUUIDs = Array.from(new Set(uuids.filter(Boolean)));

		if (uniqueUUIDs.length === 0) {
			return { deleted, failed };
		}

		if (this.plugin.wdeckService) {
			try {
				const requestedCards = await this.getCardsByUUIDs(uniqueUUIDs);
				const cardMap = new Map<string, Card>();
				for (const card of requestedCards) {
					if (card?.uuid) {
						cardMap.set(card.uuid, card);
					}
				}
				const deleteTargetUUIDSet = new Set(uniqueUUIDs);
				const deleteTargetCards = new Map<string, Card>();

				for (const uuid of uniqueUUIDs) {
					const card = await this.resolveMissingDeletionSource(cardMap.get(uuid) ?? null);
					if (!card) {
						continue;
					}

					deleteTargetCards.set(uuid, card);
					cardMap.set(uuid, card);

					if (card.type !== CardType.ProgressiveParent) {
						continue;
					}

					for (const candidate of await this.resolveProgressiveChildCardsForParent(card, {
						knownCardsByUUID: cardMap,
						fallbackCards: requestedCards,
					})) {
						deleteTargetUUIDSet.add(candidate.uuid);
						const resolvedChild = await this.resolveMissingDeletionSource(candidate);
						if (resolvedChild) {
							deleteTargetCards.set(candidate.uuid, resolvedChild);
							cardMap.set(candidate.uuid, resolvedChild);
						}
					}
				}

				const deleteTargets = Array.from(deleteTargetUUIDSet);
				const foundRequestedUUIDs = new Set(
					uniqueUUIDs.filter((uuid) => deleteTargetCards.has(uuid))
				);

				const cascadeResult = await this.cascadeDeleteDeckReferences(
					deleteTargets,
					options?.skipCascadeDeckIds?.length
						? { skipDeckIds: options.skipCascadeDeckIds }
						: undefined
				);
				if (cascadeResult.totalAffectedDecks > 0) {
					logger.info(
						`[Storage] 批量级联删除: 已从 ${cascadeResult.totalAffectedDecks} 个牌组中移除卡片引用`
					);
				}

				const deletedBatchUUIDs: string[] = [];
				const notFoundUUIDs = new Set<string>();

				const wdeckDeleted = await this.plugin.wdeckService.deleteCardsByUUIDs(deleteTargets);
				for (const uuid of deleteTargets) {
					if (wdeckDeleted.includes(uuid)) {
						deletedBatchUUIDs.push(uuid);
					} else {
						notFoundUUIDs.add(uuid);
					}
				}

				const deletedSet = new Set(deletedBatchUUIDs);

				for (const uuid of uniqueUUIDs) {
					if (deletedSet.has(uuid)) {
						deleted.push(uuid);
					} else {
						failed.push({
							uuid,
							error: !foundRequestedUUIDs.has(uuid) || notFoundUUIDs.has(uuid) ? "Card not found" : "Delete failed",
						});
					}
				}

				if (deletedBatchUUIDs.length > 0) {
					await this.notifyDataChange(
						{
							type: "cards",
							action: "delete",
							ids: deletedBatchUUIDs,
						},
						"suppressCardNotifications"
					);
				}

				const deletedCardsForCleanup = deletedBatchUUIDs
					.map((uuid) => deleteTargetCards.get(uuid))
					.filter((card): card is Card => Boolean(card));

				if (deletedCardsForCleanup.some((card) => this.shouldAttemptDeletionCleanup(card))) {
					const cleanupService = this.ensureCleanupService();
					try {
						if (cleanupService?.cleanupAfterCardDeletions) {
							const cleanupResults =
								await cleanupService.cleanupAfterCardDeletions(deletedCardsForCleanup);
							for (const cleanupResult of cleanupResults) {
								if (!cleanupResult.success) {
									logger.warn("[Storage] 批量删除后的部分源文档清理失败:", cleanupResult);
								}
							}
						} else if (cleanupService?.cleanupAfterCardDeletion) {
							for (const card of deletedCardsForCleanup) {
								await cleanupService.cleanupAfterCardDeletion(card);
							}
						}
					} catch (cleanupError) {
						logger.error("[Storage] 批量删除后的源文档清理失败:", cleanupError);
					}
				}

				for (const uuid of deletedBatchUUIDs) {
					const card = deleteTargetCards.get(uuid);
					if (!card) {
						continue;
					}

					if (this.plugin.directFileReader) {
						this.plugin.directFileReader.removeCardIndex(uuid, card.uuid);
					}

					if (this.plugin.cardMetadataCache) {
						this.plugin.cardMetadataCache.invalidate(uuid);
					}

					this.plugin.app.workspace.trigger("Weave:card-deleted", uuid);
				}

				logger.info(
					`[Storage] 批量删除卡片完成: 请求 ${uniqueUUIDs.length}, 实删 ${deletedBatchUUIDs.length}, 失败 ${failed.length}`
				);
				if (deleted.length > 0) {
					this.invalidateBodyFingerprintIndex();
				}
				return { deleted, failed };
			} catch (error) {
				logger.error("[Storage] 批量删除卡片失败，回退到逐张删除:", error);
			}
		}

		for (const uuid of uniqueUUIDs) {
			try {
				const result = await this.deleteCard(uuid);
				if (result.success && result.data) {
					deleted.push(uuid);
				} else {
					failed.push({ uuid, error: result.error });
				}
			} catch (error) {
				failed.push({ uuid, error: extractErrorMessage(error) });
			}
		}

		if (deleted.length > 0) {
			this.invalidateBodyFingerprintIndex();
		}
		return { deleted, failed };
	}

	/**
	 * 批量根据 UUID 查询卡片
	 * 用于增量同步系统
	 *
	 * @param uuids UUID数组
	 * @returns 找到的卡片数量
	 */
	async getCardsByUUIDs(uuids: string[]): Promise<Card[]> {
		try {
			const normalizedUUIDs = Array.from(
				new Set((uuids || []).map((uuid) => String(uuid || "").trim()).filter(Boolean))
			);
			if (normalizedUUIDs.length === 0) {
				return [];
			}

			const foundCards = new Map<string, Card>();
			const uuidSet = new Set(normalizedUUIDs);

			if (this.plugin.wdeckService) {
				try {
					const wdeckCards = await this.plugin.wdeckService.getCardsByUUIDs(normalizedUUIDs);
					for (const card of wdeckCards) {
						if (!card?.uuid || !uuidSet.has(card.uuid) || foundCards.has(card.uuid)) {
							continue;
						}
						foundCards.set(card.uuid, this.hydrateCardFromYAML(card));
						uuidSet.delete(card.uuid);
						if (uuidSet.size === 0) {
							break;
						}
					}
				} catch (error) {
					logger.warn("[WeaveDataStorage] WDeck UUID 批量查询失败，降级到其他路径:", error);
				}
			}

			if (uuidSet.size === 0) {
				return normalizedUUIDs.map((uuid) => foundCards.get(uuid)).filter((card): card is Card => !!card);
			}

			const allDecks = await this.getDecks();

			for (const deck of allDecks) {
				const cards = await this.getDeckCards(deck.id);

				for (const card of cards) {
					if (card?.uuid && uuidSet.has(card.uuid) && !foundCards.has(card.uuid)) {
						foundCards.set(card.uuid, card);
						uuidSet.delete(card.uuid);

						if (uuidSet.size === 0) {
							break;
						}
					}
				}

				if (uuidSet.size === 0) {
					break;
				}
			}

			return normalizedUUIDs.map((uuid) => foundCards.get(uuid)).filter((card): card is Card => !!card);
		} catch (error) {
			logger.error("[WeaveDataStorage] 批量查询失败:", error);
			return [];
		}
	}

	/**
	 * 根据 UUID 获取单张卡片
	 * 用于增量同步系统
	 *
	 * @param uuid 卡片UUID
	 * @returns 卡片对象，如果不存在返回null
	 */
	async getCardByUUID(uuid: string): Promise<Card | null> {
		try {
			const cards = await this.getCardsByUUIDs([uuid]);
			return cards.length > 0 ? cards[0] : null;
		} catch (error) {
			logger.error("[WeaveDataStorage] 根据UUID查询卡片失败:", error);
			return null;
		}
	}

	/**
	 * 标记卡片为已删除
	 * 不实际删除卡片，而是写入删除标记
	 *
	 * @param uuid 卡片UUID
	 * @param source 删除来源
	 * @returns 是否标记成功
	 */
	async markCardAsDeleted(uuid: string, source: "obsidian" | "weave" | "manual"): Promise<boolean> {
		try {
			// 查找卡片
			const card = await this.getCardByUUID(uuid);

			if (!card) {
				logger.warn(`[WeaveDataStorage] 卡片不存在: ${uuid}`);
				return false;
			}

			// 设置删除标记
			card.deletedAt = Date.now();
			card.deletionSource = source;

			// 保存卡片
			const result = await this.saveCard(card);

			if (result.success) {
				logger.info(`[WeaveDataStorage] 卡片已标记为删除: ${uuid}`);
				return true;
			} else {
				logger.error(`[WeaveDataStorage] 标记删除失败: ${result.error}`);
				return false;
			}
		} catch (error) {
			logger.error("[WeaveDataStorage] 标记删除失败:", error);
			return false;
		}
	}

	/**
	 * 批量标记卡片为已删除
	 *
	 * @param uuids UUID数组
	 * @param source 删除来源
	 * @returns 成功标记的数量
	 */
	async markCardsAsDeleted(
		uuids: string[],
		source: "obsidian" | "weave" | "manual"
	): Promise<number> {
		if (uuids.length === 0) {
			return 0;
		}

		let successCount = 0;

		for (const uuid of uuids) {
			const success = await this.markCardAsDeleted(uuid, source);
			if (success) {
				successCount++;
			}
		}

		logger.info(`[WeaveDataStorage] 批量标记完成: ${successCount}/${uuids.length} 张卡片`);

		return successCount;
	}

	private async deleteCardsByDeck(deckId: string, preloadedCardUUIDs?: string[]): Promise<void> {
		try {
			const cardUUIDs = Array.from(
				new Set(
					(preloadedCardUUIDs && preloadedCardUUIDs.length > 0
						? preloadedCardUUIDs
						: (await this.getDeckCards(deckId)).map((card) => card.uuid)
					).filter(Boolean)
				)
			);

			// 2. 逐张删除卡片（触发清理机制）
			const { deleted, failed } = await this.deleteCards(cardUUIDs);
			const cleanedCount = deleted.length;
			const failedCount = failed.length;

			logger.info(`牌组删除完成：成功清理 ${cleanedCount} 张卡片，失败 ${failedCount} 张`);

			// 显示清理完成通知
			if (cleanedCount > 0) {
				new Notice(`已清理 ${cleanedCount} 张卡片的源文档`);
			}

			// 3. 删除完成后，残留文件的清理由上层牌组删除流程统一处理
		} catch (error) {
			logger.error(`[Storage] 删除牌组卡片失败: ${deckId}`, error);
			throw error;
		}
	}

	/**
	 * 清理指定牌组的学习会话数据
	 */
	private async cleanupStudySessionsByDeck(deckId: string): Promise<void> {
		try {
			const sessionsDir = this.v2Paths.memory.learning.sessions;
			const listing = await this.listVaultDir(sessionsDir);
			const files = listing.files;
			const jsonFiles = files.filter(
				(p) => p.startsWith(sessionsDir) && /\d{4}-\d{2}\.json$/.test(p)
			);

			let totalCleaned = 0;

			for (const filePath of jsonFiles) {
				try {
					const raw = await this.plugin.app.vault.adapter.read(filePath);
					const data = parseJsonUnknown(raw);
					const sessions = this.readStudySessionsFromChunk(data);

					const beforeCount = sessions.length;
					const filteredSessions = sessions.filter((session) => session.deckId !== deckId);
					const cleanedCount = beforeCount - filteredSessions.length;

					if (cleanedCount > 0) {
						const updatedData = isRecord(data)
							? { ...data, sessions: filteredSessions }
							: { sessions: filteredSessions };
						await this.plugin.app.vault.adapter.write(filePath, JSON.stringify(updatedData));
						totalCleaned += cleanedCount;
					}
				} catch (error) {
					logger.warn(`⚠️ 清理会话文件失败: ${filePath}`, error);
				}
			}

			logger.info(`学习会话数据清理完成，共清理 ${totalCleaned} 条记录`);
		} catch (error) {
			logger.error(`[Storage] 清理学习会话数据失败: ${deckId}`, error);
		}
	}

	/**
	 * 清理指定牌组的媒体文件
	 */
	private async cleanupDeckMediaFiles(deckId: string): Promise<void> {
		try {
			const mediaHandler = this.pluginCompat.mediaFileHandler;
			if (mediaHandler?.cleanupDeckMedia) {
				await mediaHandler.cleanupDeckMedia(deckId);
			}
		} catch (error) {
			logger.warn(`⚠️ 媒体文件清理失败: ${deckId}`, error);
		}
	}

	/**
	 * Notify related services that a deck was deleted.
	 */
	private async notifyDeckDeletion(deckId: string): Promise<void> {
		try {
			const analyticsService = this.pluginCompat.analyticsService;
			analyticsService?.onDeckDeleted?.(deckId);

			const autoSyncManager = this.pluginCompat.autoSyncManager;
			autoSyncManager?.onDeckDeleted?.(deckId);
		} catch (error) {
			logger.warn(`⚠️ 通知服务失败: ${deckId}`, error);
		}
	}

	// 学习会话操作
	async saveStudySession(session: StudySession): Promise<ApiResponse<StudySession>> {
		try {
			// 写入月份分片 learning/sessions/YYYY-MM.json
			const d = new Date(session.startTime || new Date().toISOString());
			const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
			const rel = `${this.v2Paths.memory.learning.sessions}/${ym}.json`;
			// 确保目录存在
			try {
				await this.ensureFolder(this.v2Paths.memory.learning.root);
			} catch { /* no-op */ }
			try {
				await this.ensureFolder(this.v2Paths.memory.learning.sessions);
			} catch { /* no-op */ }
			// 读现有分片（若不存在则新建）
			let chunk: unknown = { _schemaVersion: "1.0.0", yearMonth: ym, sessions: [] };
			try {
				chunk = await this.readJsonFile(rel);
			} catch { /* no-op */ }
			const arr = this.readStudySessionsFromChunk(chunk);
			const idx = arr.findIndex((s) => s.id === session.id);
			const isNew = idx < 0;
			if (idx >= 0) arr[idx] = session;
			else arr.push(session);
			// 标记内部写入，避免 ExternalSyncWatcher 误触发
			this.markInternalWrite();

			await this.writeJsonFile(rel, { _schemaVersion: "1.0.0", yearMonth: ym, sessions: arr });

			// 等待写入稳定后再通知变更
			await new Promise((resolve) => window.setTimeout(resolve, 50));

			// 通知数据同步服务
			await this.notifyDataChange(
				{
					type: "sessions",
					action: isNew ? "create" : "update",
					ids: [session.id],
					metadata: {
						deckId: session.deckId,
						deckIds: session.deckId ? [session.deckId] : [],
					},
				},
				"suppressSessionNotifications"
			);

			return { success: true, data: session, timestamp: new Date().toISOString() };
		} catch (error) {
			logger.error("Failed to save study session:", error);
			return {
				success: false,
				error: extractErrorMessage(error),
				timestamp: new Date().toISOString(),
			};
		}
	}

	// 鐢ㄦ埛閰嶇疆鎿嶄綔
	async getUserProfile(): Promise<UserProfile> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const pluginPaths = getPluginPaths(this.plugin.app);
			if (await adapter.exists(pluginPaths.state.userProfile)) {
				const content = await adapter.read(pluginPaths.state.userProfile);
				const data = parseJsonUnknown(content);
				if (isRecord(data) && this.isUserProfile(data.profile)) {
					return data.profile;
				}
			}
			return this.createDefaultUserProfile().profile;
		} catch (error) {
			logger.error("Failed to get user profile:", error);
			return this.createDefaultUserProfile().profile;
		}
	}

	async saveUserProfile(profile: UserProfile): Promise<ApiResponse<UserProfile>> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const pluginPaths = getPluginPaths(this.plugin.app);
			await this.ensureFolder(pluginPaths.state.root);
			await adapter.write(pluginPaths.state.userProfile, JSON.stringify({ profile }, null, 2));

			return {
				success: true,
				data: profile,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			logger.error("Failed to save user profile:", error);
			return {
				success: false,
				error: extractErrorMessage(error),
				timestamp: new Date().toISOString(),
			};
		}
	}

	// 数据导入/导出
	async exportData(): Promise<AnkiExportData> {
		const [decks, cards, userProfile] = await Promise.all([
			this.getDecks(),
			this.getCards(),
			this.getUserProfile(),
		]);

		return {
			version: "1.0.0",
			exportDate: new Date().toISOString(),
			decks,
			cards,
			userProfile,
		};
	}

	async importData(data: AnkiExportData): Promise<ApiResponse<boolean>> {
		try {
			// 备份当前数据
			await this.createBackup();

			const importedDeckIdMap = new Map<string, string>();
			for (const deck of data.decks || []) {
				const result = await this.saveDeck(deck);
				if (!result.success || !result.data) {
					throw new Error(result.error || `导入牌组失败: ${deck.name || deck.id}`);
				}
				importedDeckIdMap.set(deck.id, result.data.id);
			}
			const byDeck = new Map<string, Card[]>();
			for (const c of data.cards || []) {
				const dk = importedDeckIdMap.get(c.deckId || "") || c.deckId || "";
				const list = byDeck.get(dk) || [];
				list.push(c);
				byDeck.set(dk, list);
			}
			for (const [deckId, list] of byDeck.entries()) await this.saveDeckCards(deckId, list);
			await this.saveUserProfile(data.userProfile);

			return {
				success: true,
				data: true,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			logger.error("Failed to import data:", error);
			return {
				success: false,
				error: extractErrorMessage(error),
				timestamp: new Date().toISOString(),
			};
		}
	}

	// 数据备份
	async createBackup(): Promise<string> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const backupBasePath = getBackupPath(this.plugin.app);
		if (!backupBasePath) {
			throw new Error("备份路径未定义");
		}
		const backupFolder = `${backupBasePath}/${timestamp}`;
		const adapter = this.plugin.app.vault.adapter;

		//  使用递归创建支持嵌套路径
		await this.ensureFolder(backupFolder);

		const fileMapping = [
			{ source: this.v2Paths.memory.decks, target: "decks.json" },
			{ source: getPluginPaths(this.plugin.app).state.userProfile, target: "profile.json" },
		];

		for (const { source, target } of fileMapping) {
			try {
				const sourceContent = (await adapter.exists(source)) ? await adapter.read(source) : "[]";
				await adapter.write(`${backupFolder}/${target}`, sourceContent);
			} catch (error) {
				logger.warn(`备份文件失败: ${source}`, error);
				await adapter.write(`${backupFolder}/${target}`, "[]");
			}
		}

		// 备份保留策略
		await this.pruneBackups();

		return backupFolder;
	}

	// 瀵煎嚭涓?Anki revlog 椋庢牸鐨?JSON锛堝熀鏈槧灏勶級
	async exportAsAnkiRevlog(): Promise<unknown[]> {
		const cards = await this.getCards();
		const rows: unknown[] = [];
		for (const c of cards) {
			for (const log of c.reviewHistory || []) {
				rows.push({
					id: new Date(log.review).getTime(), // 近似映射
					cid: c.uuid,
					button: log.rating, // 1..4
					ivl: Math.round(log.scheduledDays || 0),
					lastIvl: Math.round(log.lastElapsedDays || 0),
					time: 0,
					type: ((): number => {
						switch (log.state) {
							case CardState.New:
								return 0; // learn
							case CardState.Learning:
								return 0; // learn
							case CardState.Review:
								return 1; // review
							case CardState.Relearning:
								return 2; // relearn
							default:
								return 1;
						}
					})(),
				});
			}
		}
		return rows;
	}

	async rebuildStatesFromLogs(): Promise<void> {
		const cards = await this.getCards();
		for (const c of cards) {
			if (c.reviewHistory && c.reviewHistory.length > 0 && c.fsrs) {
				const last = c.reviewHistory[c.reviewHistory.length - 1];
				c.fsrs.elapsedDays = last.lastElapsedDays;
				c.fsrs.scheduledDays = last.scheduledDays;
				c.fsrs.lastReview = last.review;
				// due 根据 scheduledDays 推算
				const d = new Date(last.review);
				d.setDate(d.getDate() + Math.max(0, Math.round(last.scheduledDays || 0)));
				c.fsrs.due = d.toISOString();
			}
			await this.saveCard(c);
		}
	}

	async pruneBackups(): Promise<void> {
		const retention: number = this.plugin.settings?.backupRetentionCount ?? 10;
		//  使用新的独立备份路径
		const parent = getBackupPath(this.plugin.app);
		if (!parent) {
			logger.warn("[pruneBackups] 备份路径未定义，跳过清理");
			return;
		}
		try {
			const listing = await this.listVaultDir(parent);
			const folders = listing.folders;
			if (!Array.isArray(folders) || folders.length <= retention) return;
			const sorted = folders.slice().sort(); const toDelete = sorted.slice(0, Math.max(0, folders.length - retention));
			for (const folder of toDelete) {
				const files = ["decks.json", "profile.json"];
				for (const f of files) {
					const p = `${folder}/${f}`;
					if (await this.exists(p)) {
						await this.plugin.app.vault.adapter.remove(p);
					}
				}
				// 删除空文件夹
				const adapter = this.getVaultAdapterWithDirOps();
				if (adapter.rmdir) {
					await adapter.rmdir(folder, true);
				} else {
					try {
						await this.plugin.app.vault.adapter.remove(folder);
					} catch { /* no-op */ }
				}
			}
		} catch (e) {
			logger.warn("Backup pruning skipped:", e);
		}
	}

	private async exists(path: string): Promise<boolean> {
		try {
			const adapter = this.getVaultAdapterWithDirOps();
			if (adapter.stat) {
				const stat = await adapter.stat(path);
				return !!stat;
			}
			return false;
		} catch {
			return false;
		}
	}

	// 工具方法
	private async readJsonFile(fileName: string): Promise<unknown> {
		const content = await this.readFileContent(fileName);
		return parseJsonUnknown(content);
	}

	private async writeJsonFile(fileName: string, data: unknown): Promise<void> {
		const content = JSON.stringify(data);
		const filePath = this.isAbsoluteVaultPath(fileName)
			? fileName
			: `${this.dataFolder}/${fileName}`;
		const adapter = this.plugin.app.vault.adapter;
		const slash = filePath.lastIndexOf("/");
		if (slash > 0) {
			await DirectoryUtils.ensureDirRecursive(adapter, filePath.slice(0, slash));
		}

		// 直接使用 adapter API 写入（完全支持隐藏文件夹）
		// 注意：隐藏文件夹场景下，vault API 降级逻辑无效，已移除
		await adapter.write(filePath, content);
	}

	/**
	 * 新增：直接更新已存在文件的内容
	 */
	private async updateExistingDeckFile(fileName: string, data: unknown): Promise<void> {
		const filePath = this.isAbsoluteVaultPath(fileName)
			? fileName
			: `${this.dataFolder}/${fileName}`;
		const adapter = this.plugin.app.vault.adapter;

		// 使用 adapter API 检查文件是否存在（支持隐藏文件夹）
		const existing = await adapter.exists(filePath);

		if (existing) {
			const content = JSON.stringify(data);
			await adapter.write(filePath, content);
		} else {
			// 文件不存在时，使用常规创建方法
			await this.writeJsonFile(fileName, data);
		}
	}

	// ===== 新增：公开读取学习会话（按时间窗口 + 月分片） =====
	async getStudySessions(range?: { since?: string; until?: string }): Promise<StudySession[]> {
		const sessionsDir = this.v2Paths.memory.learning.sessions;
		let items: StudySession[] = [];
		try {
			const listing = await this.listVaultDir(sessionsDir);
			const files = listing.files;
			const jsonFiles = files.filter(
				(p) => p.startsWith(sessionsDir) && /\d{4}-\d{2}\.json$/.test(p)
			);
			for (const p of jsonFiles) {
				try {
					const raw = await this.plugin.app.vault.adapter.read(p);
					const data = parseJsonUnknown(raw);
					const chunk = this.readStudySessionsFromChunk(data);
					items.push(...chunk);
				} catch { /* no-op */ }
			}
		} catch { /* no-op */ }
		if (range?.since || range?.until) {
			items = items.filter((s) => {
				const t = new Date(s.startTime).getTime();
				if (range?.since && t < new Date(range.since).getTime()) return false;
				if (range?.until && t > new Date(range.until).getTime()) return false;
				return true;
			});
		}
		return items;
	}

	// ===== 新增：牌组级卡片读写（分片） =====
	async getDeckCards(deckId: string): Promise<Card[]> {
		return await this.getCards({ deckId });
	}

	/**
	 * 标准化卡片数据，确保类型一致。
	 * 修复 card.tags.forEach 错误的关键方法。
	 */
	private normalizeCardData(card: Card): Card {
		if (card.tags) {
			if (typeof card.tags === "string") {
				const tagsString = card.tags;
				try {
					const parsed = parseJsonUnknown(tagsString);
					if (Array.isArray(parsed)) {
						const tags: string[] = [];
						for (const tag of parsed) {
							if (typeof tag === "string") {
								tags.push(tag);
							}
						}
						card.tags = tags;
					} else {
						throw new Error("tags payload is not a JSON array");
					}
				} catch {
					// 如果不是 JSON，则按分隔符拆分
					card.tags = this.splitTagString(tagsString);
				}
			} else if (!Array.isArray(card.tags)) {
				// 如果既不是字符串也不是数组，则重置为空数组
				card.tags = [];
			}
		} else {
			card.tags = [];
		}

		const resolvedType = this.resolveCardTypeBeforeSave(card);
		if (card.type !== resolvedType) {
			logger.debug("[Storage] normalizeCardData: 根据内容重新判定题型", {
				previousType: card.type,
				resolvedType,
				cardId: card.uuid,
			});
			card.type = resolvedType;
		}

		syncCardStatsToCanonicalFormat(card);
		return card;
	}

	private splitTagString(tagsString: string): string[] {
		return tagsString.split(/[,;\s]+/).filter((tag) => tag.length > 0);
	}

	private resolveCardTypeBeforeSave(card: Card): CardType {
		const body = extractBodyContent(card.content || "") || card.content || "";

		if (hasProgressiveClozeContent(body)) {
			if (card.type === CardType.ProgressiveChild) {
				return CardType.ProgressiveChild;
			}
			if (card.type === CardType.ProgressiveParent) {
				return CardType.ProgressiveParent;
			}
			// 渐进式挖空的父子拆分必须交给 ProgressiveClozeGateway 处理，
			// 这里只根据正文判断时，不应直接把普通卡标成 progressive-parent。
		}

		const detected = detectCardTypeFromContent(body);
		return (detected || CardType.Basic) as CardType;
	}

	private async ensureFolder(path: string): Promise<void> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			await DirectoryUtils.ensureDirRecursive(adapter, path);
			await ensureWeaveDataReadmesForPath(
				adapter,
				path,
				normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder)
			);
		} catch (_error) {
			// 文件夹可能已经存在，忽略错误。
		}
	}

	private deckWriteQueue = new Map<string, Promise<void>>();

	private async enqueueDeckWrite(deckId: string, task: () => Promise<void>): Promise<void> {
		const prev = this.deckWriteQueue.get(deckId) || Promise.resolve();
		const next = prev.then(task).catch((e) => {
			logger.error("Deck write failed", e);
			//  重新抛出错误，让调用方能感知保存失败
			throw e;
		});
		this.deckWriteQueue.set(deckId, next);
		await next;
	}

	private hasPersistedDeckStatsChanges(
		currentStats: Partial<DeckStats> | undefined,
		nextStats: Partial<DeckStats>
	): boolean {
		if (nextStats.totalCards !== undefined && currentStats?.totalCards !== nextStats.totalCards) {
			return true;
		}
		if (nextStats.newCards !== undefined && currentStats?.newCards !== nextStats.newCards) {
			return true;
		}
		if (nextStats.learningCards !== undefined && currentStats?.learningCards !== nextStats.learningCards) {
			return true;
		}
		if (nextStats.reviewCards !== undefined && currentStats?.reviewCards !== nextStats.reviewCards) {
			return true;
		}
		if (nextStats.memoryRate !== undefined && currentStats?.memoryRate !== nextStats.memoryRate) {
			return true;
		}
		return false;
	}

	private mergePersistedDeckStats(
		currentStats: Partial<DeckStats> | undefined,
		nextStats: Partial<DeckStats>
	): Partial<DeckStats> {
		const mergedStats: Partial<DeckStats> = {
			...(currentStats || {}),
		};

		if (nextStats.totalCards !== undefined) mergedStats.totalCards = nextStats.totalCards;
		if (nextStats.newCards !== undefined) mergedStats.newCards = nextStats.newCards;
		if (nextStats.learningCards !== undefined) mergedStats.learningCards = nextStats.learningCards;
		if (nextStats.reviewCards !== undefined) mergedStats.reviewCards = nextStats.reviewCards;
		if (nextStats.memoryRate !== undefined) mergedStats.memoryRate = nextStats.memoryRate;

		return mergedStats;
	}

	/**
	 * 批量持久化所有牌组的运行时统计数据到 decks.json
	 *
	 * 将内存中的 deckStats（由 UnifiedStudyProvider 计算）写入磁盘，
	 * 确保其他设备同步后能看到最新的统计数据；使用单次写入避免频繁 I/O。
	 */
	async persistAllDeckStats(statsMap: Record<string, Partial<DeckStats>>): Promise<void> {
		try {
			const decks = await this.getDecks();
			const changedDecks: Deck[] = [];

			for (const deck of decks) {
				const stats = statsMap[deck.id];
				if (!stats) continue;

				if (!this.hasPersistedDeckStatsChanges(deck.stats, stats)) {
					continue;
				}

				changedDecks.push({
					...deck,
					stats: this.mergePersistedDeckStats(deck.stats, stats) as DeckStats,
				});
			}

			if (changedDecks.length > 0) {
				const previousDataChangeContext = this.getDataChangeContext();
				this.setDataChangeContext({
					...previousDataChangeContext,
					source: previousDataChangeContext?.source ?? "deck_stats_persist",
					suppressDeckNotifications: true,
					deckIds: changedDecks.map((deck) => deck.id),
				});

				try {
					for (const deck of changedDecks) {
						await this.saveDeck(deck);
					}
				} finally {
					this.setDataChangeContext(previousDataChangeContext);
				}
				logger.debug("[Storage] persistAllDeckStats: 统计数据已持久化");
			}
		} catch (e) {
			logger.warn("persistAllDeckStats failed", e);
		}
	}

	private async updateDeckIndexStats(deckId: string, cardCount: number): Promise<void> {
		try {
			const deck = await this.getDeck(deckId);
			if (deck) {
				deck.stats = deck.stats || {};
				deck.stats.totalCards = cardCount;
				deck.modified = new Date().toISOString();
				await this.saveDeck(deck);
			}
		} catch (e) {
			logger.warn("updateDeckIndexStats failed", e);
		}
	}

	/**
	 * 统一写入牌组文件到 V2 路径
	 * cardUUIDs 已拆分到独立文件，写入时自动剥离
	 */
	private async writeDecksFile(data: { decks: Deck[] }): Promise<void> {
		// 标记内部写入，避免 ExternalSyncWatcher 误触发
		this.markInternalWrite();

		const adapter = this.plugin.app.vault.adapter;
		await DirectoryUtils.ensureDirRecursive(adapter, this.v2Paths.memory.root);
		const persistedDecks = data.decks.filter((deck) => !this.isVirtualWDeckDeck(deck));
		// 剥离 cardUUIDs，只写牌组配置和统计到 decks.json
		const stripped = {
			decks: persistedDecks.map((_d) => {
				const { cardUUIDs: _cardUUIDs, ...rest } = _d;
				return rest;
			}),
		};
		await safeWriteJson(adapter, this.v2Paths.memory.decks, JSON.stringify(stripped));
	}

	/**
	 * 读取牌组 cardUUIDs（从独立文件）
	 */
	private async readDeckCardUUIDs(deckId: string): Promise<string[]> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const filePath = `${this.v2Paths.memory.deckCards}/${deckId}.json`;
			if (await adapter.exists(filePath)) {
				const raw = await adapter.read(filePath);
				const data = parseJsonUnknown(raw);
				if (isRecord(data) && Array.isArray(data.cardUUIDs)) {
					return data.cardUUIDs.filter((uuid): uuid is string => typeof uuid === "string");
				}
			}
		} catch (e) {
			logger.warn(`[Storage] readDeckCardUUIDs(${deckId}) failed:`, e);
		}
		return [];
	}

	/**
	 * 写入牌组 cardUUIDs（到独立文件，紧凑 JSON）
	 */
	private async writeDeckCardUUIDs(deckId: string, uuids: string[]): Promise<void> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			await DirectoryUtils.ensureDirRecursive(adapter, this.v2Paths.memory.deckCards);
			const filePath = `${this.v2Paths.memory.deckCards}/${deckId}.json`;
			await adapter.write(filePath, JSON.stringify({ cardUUIDs: uuids }));
		} catch (e) {
			logger.warn(`[Storage] writeDeckCardUUIDs(${deckId}) failed:`, e);
		}
	}

	/**
	 * 删除牌组 cardUUIDs 独立文件
	 */
	private async deleteDeckCardUUIDs(deckId: string): Promise<void> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const filePath = `${this.v2Paths.memory.deckCards}/${deckId}.json`;
			if (await adapter.exists(filePath)) {
				await adapter.remove(filePath);
			}
		} catch (e) {
			logger.warn(`[Storage] deleteDeckCardUUIDs(${deckId}) failed:`, e);
		}
	}

	/**
	 * 将 cardUUID 加入待刷新队列，防抖合并后统一写入 deck 文件
	 * 避免批量导入时每张卡片都触发一次 saveDeck
	 */
	private _enqueueDeckCardUUID(deckId: string, cardUUID: string): void {
		let set = this._pendingDeckCardUUIDs.get(deckId);
		if (!set) {
			set = new Set();
			this._pendingDeckCardUUIDs.set(deckId, set);
		}
		set.add(cardUUID);

		if (this._deckCardUUIDsFlushTimer) {
			window.clearTimeout(this._deckCardUUIDsFlushTimer);
		}
		this._deckCardUUIDsFlushTimer = window.setTimeout(() => {
			void this._flushPendingDeckCardUUIDs();
		}, WeaveDataStorage.DECK_CARD_UUIDS_FLUSH_DELAY);
	}

	/**
	 * 刷新所有待处理的 deck cardUUIDs（合并后只写一次）
	 */
	private async _flushPendingDeckCardUUIDs(): Promise<void> {
		this._deckCardUUIDsFlushTimer = null;
		if (this._pendingDeckCardUUIDs.size === 0) return;

		const pending = new Map(this._pendingDeckCardUUIDs);
		this._pendingDeckCardUUIDs.clear();
		const previousDataChangeContext = this.getDataChangeContext();
		this.setDataChangeContext({
			...previousDataChangeContext,
			source: previousDataChangeContext?.source ?? "deck_card_uuids_flush",
			suppressDeckNotifications: true,
			deckIds: Array.from(pending.keys()),
		});

		try {
			for (const [deckId, newUUIDs] of pending) {
				try {
					const deck = await this.getDeck(deckId);
					if (!deck) continue;

					const existing = new Set(deck.cardUUIDs || []);
					let changed = false;
					for (const uuid of newUUIDs) {
						if (!existing.has(uuid)) {
							existing.add(uuid);
							changed = true;
						}
					}

					if (changed) {
						deck.cardUUIDs = Array.from(existing);
						deck.modified = new Date().toISOString();
						await this.saveDeck(deck);
					}
				} catch (e) {
					logger.warn(`[Storage] _flushPendingDeckCardUUIDs(${deckId}) failed:`, e);
				}
			}
		} finally {
			this.setDataChangeContext(previousDataChangeContext);
		}
	}

	/**
	 * 立即刷新待处理的 deck cardUUIDs（插件卸载时调用）
	 */
	async flushPendingWrites(): Promise<void> {
		if (this._deckCardUUIDsFlushTimer) {
			window.clearTimeout(this._deckCardUUIDsFlushTimer);
		}
		await this._flushPendingDeckCardUUIDs();
	}

	async saveDeckCards(deckId: string, cards: Card[]): Promise<void> {
		if (this.plugin.wdeckService) {
			const runtimeDeckId = String(deckId || "").trim();
			const existingWDeckInfo = await this.plugin.wdeckService.getDeckInfoByAnyDeckId(runtimeDeckId);
			const persistedDeck =
				existingWDeckInfo || this.plugin.wdeckService.isWDeckDeckId(runtimeDeckId)
					? null
					: await this.getPersistedDeckById(runtimeDeckId);
			{
				const targetDeck = existingWDeckInfo
					? {
							id: existingWDeckInfo.runtimeDeckId,
							name: existingWDeckInfo.logicalDeckName,
						}
					: this.plugin.wdeckService.isWDeckDeckId(runtimeDeckId)
						? await this.resolveWDeckTargetForCard({ deckId: runtimeDeckId })
						: {
								id: persistedDeck?.id || WDECK_UNGROUPED_DECK_NAME,
								name: persistedDeck?.name || WDECK_UNGROUPED_DECK_NAME,
							};
				const now = new Date().toISOString();
				const preparedCards: Card[] = [];
				for (const card of cards) {
					const normalized = this.normalizeCardData(card);
					const syncedCard = await this.syncCardMetadataToYAML(
						{
							...normalized,
							deckId: runtimeDeckId,
						},
						{ syncDeckMembershipFromRuntime: true }
					);
					preparedCards.push({
						...syncedCard,
						created: syncedCard.created || now,
						modified: now,
					});
				}

				await this.plugin.wdeckService.replaceDeckCardsForDeck(targetDeck, preparedCards);
				if (persistedDeck) {
					await this.upsertPersistedDeckCardUUIDs(
						persistedDeck.id,
						preparedCards.map((card) => card.uuid)
					);
				}
				return;
			}
		}

		throw new Error("WDeckService 未初始化");
	}

	// 开发阶段：移除旧结构迁移实现
	private async readFileContent(fileName: string): Promise<string> {
		const filePath = this.isAbsoluteVaultPath(fileName)
			? fileName
			: `${this.dataFolder}/${fileName}`;

		try {
			const adapter = this.plugin.app.vault.adapter;
			return await adapter.read(filePath);
		} catch (_error) {
			// 尝试 vault API
		}

		try {
			// 降级到 vault API（可见文件）
			const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				return await this.plugin.app.vault.read(file);
			}
		} catch (_error) {
			// 文件未找到，继续抛出统一错误。
		}

		throw new Error(`File not found: ${filePath}`);
	}

	private getProgressiveChildLabel(child: ProgressiveClozeChildCard): string {
		return `c${child.clozeOrd + 1}`;
	}

	private filterCards(cards: Card[], query: DataQuery): Card[] {
		return cards.filter((_card) => {
			if (query.deckId && _card.deckId !== query.deckId) return false;
			if (query.cardIds && !query.cardIds.includes(_card.uuid)) return false;
			if (query.state !== undefined && _card.fsrs?.state !== query.state) return false;
			if (query.tags && (!_card.tags || !query.tags.some((tag) => _card.tags?.includes(tag))))
				return false;

			if (query.dueDate) {
				if (!_card.fsrs?.due || Number.isNaN(Date.parse(String(_card.fsrs.due)))) {
					// 如果卡片没有到期日或者格式无效，则不符合任何日期范围查询
					return false;
				}
				const due = new Date(_card.fsrs.due);
				if (query.dueDate.from && due < new Date(query.dueDate.from)) return false;
				if (query.dueDate.to && due > new Date(query.dueDate.to)) return false;
			}

			return true;
		});
	}

	// ===================================================================
	// 模板存储方法 - 已迁移到统一的 FieldTemplate 系统
	// ===================================================================

	// ===== 卡片查询方法 =====

	/**
	 * 根据源文件获取卡片
	 */
	async getCardsBySourceFile(filePath: string): Promise<Card[]> {
		try {
			const allCards = await this.getCards();
			return allCards.filter((_card) => {
				// 优先从 YAML we_source 查询
				if (_card.content) {
					try {
						const yaml = parseYAMLFromContent(_card.content);
						const sourceValue = yaml.we_source;
						const source = Array.isArray(sourceValue)
							? sourceValue.find((item): item is string => typeof item === "string")
							: typeof sourceValue === "string"
								? sourceValue
								: undefined;
						if (source && source.includes(filePath)) return true;
					} catch {
						/* ignore */
					}
				}
				return _card.sourceFile === filePath;
			});
		} catch (error) {
			logger.error("Failed to get cards by source file:", error);
			return [];
		}
	}

	/**
	 * 获取所有卡片（别名方法）
	 */
	async updateSourceFileReferences(
		oldPath: string,
		newPath: string
	): Promise<{
		updatedCards: number;
		updatedLinks: number;
		affectedSourceFiles: number;
	}> {
		const normalizedOldPath = this.normalizeSourcePath(oldPath);
		const normalizedNewPath = this.normalizeSourcePath(newPath);

		if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) {
			return { updatedCards: 0, updatedLinks: 0, affectedSourceFiles: 0 };
		}

		try {
			const allCards = await this.getCards();
			const rewriteResults = allCards
				.map((card) => this.rewriteCardSourcePath(card, normalizedOldPath, normalizedNewPath))
				.filter((result): result is NonNullable<typeof result> => !!result);

			if (rewriteResults.length === 0) {
				return { updatedCards: 0, updatedLinks: 0, affectedSourceFiles: 0 };
			}

			const cardsToUpdate = rewriteResults.map((result) => result.card);
			const updatedLinks = rewriteResults.reduce((sum, result) => sum + result.updatedLinks, 0);
			const affectedSourceFiles = new Set(
				rewriteResults
					.map((result) => result.previousSourcePath)
					.filter((path): path is string => !!path)
			).size;

			await this.saveCardsBatch(cardsToUpdate);
			logger.info(
				`[Storage] 更新 ${cardsToUpdate.length} 张卡片的溯源路径: ${normalizedOldPath} -> ${normalizedNewPath}`
			);
			return {
				updatedCards: cardsToUpdate.length,
				updatedLinks,
				affectedSourceFiles,
			};
		} catch (error) {
			logger.error("[Storage] 批量更新卡片溯源路径失败:", error);
			return { updatedCards: 0, updatedLinks: 0, affectedSourceFiles: 0 };
		}
	}

	private rewriteCardSourcePath(
		card: Card,
		oldPath: string,
		newPath: string
	): {
		card: Card;
		updatedLinks: number;
		previousSourcePath?: string;
	} | null {
		const sourceInfo = parseSourceInfo(card.content || "");
		const currentSourcePath = this.normalizeSourcePath(
			card.sourceFile || sourceInfo.sourceFile || ""
		);
		const nextSourcePath = this.remapSourcePath(currentSourcePath, oldPath, newPath);
		const hasSourcePathChange = !!nextSourcePath && nextSourcePath !== currentSourcePath;

		let nextContent = card.content || "";
		let hasContentChange = false;
		let updatedLinks = 0;

		const yaml = parseYAMLFromContent(nextContent);
		if (yaml.we_source !== undefined) {
			const rewriteResult = this.rewriteWeSourceValue(yaml.we_source, oldPath, newPath);
			if (rewriteResult.value !== yaml.we_source) {
				updatedLinks += rewriteResult.updatedLinks;
				nextContent = setCardProperty(nextContent, "we_source", rewriteResult.value);
				hasContentChange = true;
			}
		}

		if (!hasSourcePathChange && !hasContentChange) {
			return null;
		}

		if (updatedLinks === 0 && hasSourcePathChange) {
			updatedLinks = 1;
		}

		return {
			previousSourcePath: currentSourcePath || undefined,
			updatedLinks,
			card: {
				...card,
				sourceFile: nextSourcePath || card.sourceFile,
				content: nextContent,
			},
		};
	}

	private rewriteWeSourceValue(
		value: string | string[],
		oldPath: string,
		newPath: string
	): {
		value: string | string[];
		updatedLinks: number;
	} {
		if (Array.isArray(value)) {
			let changed = false;
			let updatedLinks = 0;
			const updated = value.map((_entry) => {
				const result = this.rewriteSingleWeSourceEntry(_entry, oldPath, newPath);
				if (result.value !== _entry) {
					changed = true;
					updatedLinks += 1;
				}
				return result.value;
			});
			return { value: changed ? updated : value, updatedLinks };
		}

		const result = this.rewriteSingleWeSourceEntry(value, oldPath, newPath);
		return {
			value: result.value,
			updatedLinks: result.value !== value ? 1 : 0,
		};
	}

	private rewriteSingleWeSourceEntry(
		value: string,
		oldPath: string,
		newPath: string
	): { value: string } {
		if (typeof value !== "string") {
			return { value };
		}

		const linkedPath = this.normalizeSourcePath(parseObsidianLink(value) || "");
		if (!this.matchesSourcePath(linkedPath, oldPath)) {
			return { value };
		}

		const nextPath = this.remapSourcePath(linkedPath, oldPath, newPath);
		if (!nextPath) {
			return { value };
		}

		return { value: this.buildWeSourceLink(nextPath, parseBlockId(value)) };
	}

	private buildWeSourceLink(filePath: string, sourceBlock?: string): string {
		const normalizedFilePath = this.normalizeSourcePath(filePath);
		const normalizedBlock = sourceBlock?.replace(/^\^/, "");
		return normalizedBlock
			? `![[${normalizedFilePath}#^${normalizedBlock}]]`
			: `[[${normalizedFilePath}]]`;
	}

	private remapSourcePath(sourcePath: string, oldPath: string, newPath: string): string | null {
		if (!this.matchesSourcePath(sourcePath, oldPath)) {
			return null;
		}

		if (sourcePath === oldPath) {
			return newPath;
		}

		return `${newPath}${sourcePath.slice(oldPath.length)}`;
	}

	private matchesSourcePath(sourcePath: string, oldPath: string): boolean {
		if (!sourcePath || !oldPath) {
			return false;
		}

		return sourcePath === oldPath || sourcePath.startsWith(`${oldPath}/`);
	}

	private normalizeSourcePath(path: string): string {
		return (path || "").replace(/\\/g, "/").replace(/\/+/g, "/");
	}

	private async getDeckLookupsForIndex(): Promise<Array<{ id: string; name: string }>> {
		const decks = this.plugin.cachedDecks?.length ? this.plugin.cachedDecks : await this.getDecks();
		return decks
			.filter((deck) => Boolean(deck?.id && deck?.name))
			.map((deck) => ({ id: deck.id, name: deck.name }));
	}

	private async syncCardIndicesAfterWrite(card: Card): Promise<void> {
		try {
			const deckLookups = await this.getDeckLookupsForIndex();
			if (this.plugin.studyDueIndexService) {
				await this.plugin.studyDueIndexService.updateCard(card, deckLookups);
				return;
			}

			if (this.plugin.deckMembershipIndexService) {
				const { getFormalDeckLookups } = await import("../services/index/StudyDueIndexService");
				const { decks } = getFormalDeckLookups(card, deckLookups);
				if (decks.length > 0) {
					await this.plugin.deckMembershipIndexService.updateCards([card], decks);
				}
			}
		} catch (error) {
			logger.warn("[Storage] 同步卡片索引失败:", error);
		}
	}

	private async removeCardsFromIndices(uuids: string[]): Promise<void> {
		const unique = Array.from(new Set(uuids.filter(Boolean)));
		if (unique.length === 0) {
			return;
		}

		try {
			if (this.plugin.studyDueIndexService) {
				await this.plugin.studyDueIndexService.removeCards(unique);
				return;
			}
			if (this.plugin.deckMembershipIndexService) {
				await this.plugin.deckMembershipIndexService.removeCards(unique);
			}
		} catch (error) {
			logger.warn("[Storage] 移除卡片索引失败:", error);
		}
	}

	async refreshSourceFileStatuses(
		targetPath?: string
	): Promise<{ updated: number; missing: number }> {
		const normalizedTargetPath = this.normalizeSourcePath(targetPath || "");

		try {
			const cards = await this.loadCardsForSourceStatusRefresh(normalizedTargetPath);
			const statusChanges = cards
				.map((card) => this.reconcileCardSourceStatus(card, normalizedTargetPath))
				.filter((status): status is { missing: boolean } => !!status);

			if (statusChanges.length === 0) {
				return { updated: 0, missing: 0 };
			}

			const missing = statusChanges.filter((status) => status.missing).length;
			logger.info(
				`[Storage] 已检测到 ${statusChanges.length} 张卡片的源状态与当前文件系统不一致，其中 ${missing} 张源文件不存在`
			);
			return { updated: statusChanges.length, missing };
		} catch (error) {
			logger.error("[Storage] 刷新卡片溯源状态失败:", error);
			return { updated: 0, missing: 0 };
		}
	}

	private async loadCardsForSourceStatusRefresh(targetPath: string): Promise<Card[]> {
		const indexManager = (this.plugin).indexManager;
		const batchSize = 120;

		if (targetPath && indexManager) {
			const uuids = indexManager.getCardIdsBySourceFile(targetPath);
			if (uuids.length === 0) {
				return [];
			}
			return this.loadCardsByUUIDBatches(uuids, batchSize);
		}

		if (!indexManager) {
			return this.getCards();
		}

		const sourceFiles = indexManager.getAllIndexedSourceFiles();
		if (sourceFiles.length === 0) {
			return [];
		}

		const cards: Card[] = [];
		const seen = new Set<string>();
		for (const sourceFile of sourceFiles) {
			const uuids = indexManager.getCardIdsBySourceFile(sourceFile);
			if (uuids.length === 0) {
				continue;
			}
			const batchCards = await this.loadCardsByUUIDBatches(uuids, batchSize);
			for (const card of batchCards) {
				if (card?.uuid && !seen.has(card.uuid)) {
					seen.add(card.uuid);
					cards.push(card);
				}
			}
		}
		return cards;
	}

	private async loadCardsByUUIDBatches(uuids: string[], batchSize: number): Promise<Card[]> {
		const uniqueUUIDs = Array.from(new Set(uuids.filter(Boolean)));
		if (uniqueUUIDs.length === 0) {
			return [];
		}

		const cards: Card[] = [];
		for (let offset = 0; offset < uniqueUUIDs.length; offset += batchSize) {
			const batch = uniqueUUIDs.slice(offset, offset + batchSize);
			if (this.plugin.wdeckService) {
				cards.push(...(await this.plugin.wdeckService.getCardsByUUIDs(batch)));
				continue;
			}

		}
		return cards.map((card) => this.hydrateCardFromYAML(card));
	}

	private reconcileCardSourceStatus(card: Card, targetPath: string): { missing: boolean } | null {
		const sourceInfo = parseSourceInfo(card.content || "");
		const sourcePath = this.normalizeSourcePath(card.sourceFile || sourceInfo.sourceFile || "");

		if (!sourcePath) {
			return null;
		}

		if (targetPath && !this.matchesSourcePath(sourcePath, targetPath)) {
			return null;
		}

		const abstractFile = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
		const sourceFile = abstractFile instanceof TFile ? abstractFile : null;
		const nextExists = !!sourceFile;
		const nextMtime = sourceFile?.stat.mtime;

		const shouldUpdateExists = card.sourceExists !== nextExists;
		const shouldUpdateMtime = card.sourceFileMtime !== nextMtime;

		if (!shouldUpdateExists && !shouldUpdateMtime) {
			return null;
		}

		return { missing: !nextExists };
	}

	async getAllCards(): Promise<Card[]> {
		return this.getCards();
	}

	/**
	 * 根据模板ID获取卡片
	 */
	async getCardsByTemplate(templateId: string): Promise<Card[]> {
		try {
			const allCards = await this.getCards();
			return allCards.filter((card) => card.templateId === templateId);
		} catch (error) {
			logger.error("Failed to get cards by template:", error);
			return [];
		}
	}
}
