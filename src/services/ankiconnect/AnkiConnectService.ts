import { logger } from "../../utils/logger";
/**
 * AnkiConnect 主服务
 * 协调所有 AnkiConnect 相关功能的核心服务
 */

import type { App } from "obsidian";
import type {
	AnkiConnectSettings,
	CardSyncMetadata,
	DeckSyncMapping,
	SyncLogEntry,
} from "../../components/settings/types/settings-types";
import type { Card, Deck } from "../../data/types";
import type {
	AnkiDeckInfo,
	AnkiModelInfo,
	AnkiNote,
	AnkiNoteInfo,
	ConnectionStatus,
	ExportResult,
	ExportSummary,
	ModelMismatchRepairResult,
	SyncFailureReason,
	SyncItemResult,
	SyncProgress,
	SyncWarningReason,
} from "../../types/ankiconnect-types";
import type { ParseTemplate } from "../../types/newCardParsingTypes";

import type { WeavePlugin } from "../../main";
import { AnkiConnectError, ConnectionErrorType, SyncStatus } from "../../types/ankiconnect-types";
import type { ConnectionState, IncrementalSyncResult } from "../../types/ankiconnect-types";
import { getCardBack, getCardFront } from "../../utils/card-field-helper";
import { readUnknownProperty } from "../../utils/dynamic-access";
import { isRecord, readNumber } from "../../utils/typed-json";
import { extractErrorMessage } from "../../types/utility-types";
import { AnkiConnectClient } from "./AnkiConnectClient";
import { AnkiTemplateConverter } from "./AnkiTemplateConverter";
import { AutoSyncScheduler } from "./AutoSyncScheduler";
import { CardExporter } from "./CardExporter";
import { ConnectionManager } from "./ConnectionManager";
import { IncrementalSyncTracker } from "./IncrementalSyncTracker";
import { MediaSyncService } from "./MediaSyncService";
import { SyncStateTracker } from "./SyncStateTracker";
import { TemplateManager } from "./TemplateManager";
import { WeaveTemplateExporter } from "./WeaveTemplateExporter";
import { buildObsidianBacklinkMarkup } from "./utils/backlinkMarkup";

const MODEL_MISMATCH_ARCHIVE_DECK = "Weave::模型迁移存档";
const MODEL_MISMATCH_ARCHIVE_TAG = "weave-model-mismatch-archive";
const TRACKING_FIELDS_TO_CLEAR = ["weave_card_id", "weave_template_id"] as const;

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
	if (items.length === 0) {
		return [];
	}

	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += chunkSize) {
		chunks.push(items.slice(index, index + chunkSize));
	}

	return chunks;
}

function normalizeNoteFieldValue(value: unknown): string {
	if (typeof value === "string") {
		return value.trim();
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	if (typeof value === "boolean") {
		return String(value);
	}
	return "";
}

function parseAnkiDeckStats(stats: unknown): {
	id: number;
	cardCount: number;
	newCount: number;
	learnCount: number;
	reviewCount: number;
} {
	const record = isRecord(stats) ? stats : {};
	return {
		id: readNumber(record, "deck_id") ?? 0,
		cardCount: readNumber(record, "total_in_deck") ?? 0,
		newCount: readNumber(record, "new_count") ?? 0,
		learnCount: readNumber(record, "learn_count") ?? 0,
		reviewCount: readNumber(record, "review_count") ?? 0,
	};
}

export class AnkiConnectService {
	private client: AnkiConnectClient;
	private stateTracker: SyncStateTracker;
	private mediaService: MediaSyncService;

	// 模板和卡片管理服务
	private templateConverter: AnkiTemplateConverter;
	private templateExporter: WeaveTemplateExporter;
	private cardExporter: CardExporter;
	private templateManager: TemplateManager;

	// 连接管理和自动同步服务
	private connectionManager: ConnectionManager;
	private incrementalTracker: IncrementalSyncTracker;
	private autoSyncScheduler: AutoSyncScheduler | null = null;

	private connectionStatus: ConnectionStatus = {
		isConnected: false,
		lastCheckTime: new Date().toISOString(),
	};

	private syncProgress: SyncProgress = {
		status: SyncStatus.IDLE,
		current: 0,
		total: 0,
		percentage: 0,
	};

	constructor(
		private plugin: WeavePlugin,
		private app: App,
		private settings: AnkiConnectSettings
	) {
		this.client = new AnkiConnectClient(settings.endpoint);
		this.stateTracker = new SyncStateTracker({});
		this.mediaService = new MediaSyncService(app, this.client, settings.mediaSync);

		// 初始化新服务
		this.templateConverter = new AnkiTemplateConverter(plugin);
		this.templateExporter = new WeaveTemplateExporter(plugin, this.client);
		this.cardExporter = new CardExporter(plugin, this.client, this.templateExporter);
		this.templateManager = new TemplateManager(plugin);

		// 初始化连接管理和自动同步服务
		this.connectionManager = new ConnectionManager(this.client);
		this.incrementalTracker = new IncrementalSyncTracker(plugin);
		this.cardExporter = new CardExporter(
			plugin,
			this.client,
			this.templateExporter,
			this.incrementalTracker
		);

		// 监听连接状态变化
		this.connectionManager.onStateChange((state) => {
			this.connectionStatus = {
				isConnected: state.status === "connected",
				lastCheckTime: new Date(state.lastHeartbeat).toISOString(),
				error: state.error
					? {
							type: ConnectionErrorType.UNKNOWN,
							message: state.error,
							suggestion: "请检查 Anki 是否正在运行",
					  }
					: undefined,
			};
		});
	}

	/**
	 * 测试连接
	 */
	async testConnection(): Promise<ConnectionStatus> {
		try {
			const version = await this.client.getVersion();

			this.connectionStatus = {
				isConnected: true,
				lastCheckTime: new Date().toISOString(),
				apiVersion: version,
				ankiVersion: version.toString(),
			};
		} catch (error: unknown) {
			this.connectionStatus = {
				isConnected: false,
				lastCheckTime: new Date().toISOString(),
				error: {
					type: error instanceof AnkiConnectError ? error.type : ConnectionErrorType.UNKNOWN,
					message: extractErrorMessage(error),
					suggestion:
						error instanceof AnkiConnectError
							? error.suggestion || "请检查 Anki 是否正在运行"
							: "请检查 Anki 是否正在运行",
				},
			};
		}

		return this.connectionStatus;
	}

	/**
	 * 获取 Anki 牌组列表
	 */
	async getAnkiDecks(): Promise<AnkiDeckInfo[]> {
		const deckNames = await this.client.getDeckNames();
		const decks: AnkiDeckInfo[] = [];

		const chunkSize = 10;
		for (let i = 0; i < deckNames.length; i += chunkSize) {
			const chunk = deckNames.slice(i, i + chunkSize);
			const actions = chunk.map((name) => ({
				action: "getDeck",
				params: { deck: name },
			}));

			try {
				const results = await this.client.multi<unknown>(actions);

				for (let j = 0; j < chunk.length; j++) {
					const name = chunk[j];
					const entry = Array.isArray(results) && isRecord(results[j]) ? results[j] : null;
					const hasError = entry
						? readUnknownProperty(entry, "error") !== undefined &&
							readUnknownProperty(entry, "error") !== null
						: true;
					const stats = entry ? readUnknownProperty(entry, "result") : undefined;

					if (hasError || stats === undefined) {
						decks.push({
							id: 0,
							name,
							cardCount: 0,
							newCount: 0,
							learnCount: 0,
							reviewCount: 0,
						});
						continue;
					}

					const parsedStats = parseAnkiDeckStats(stats);
					decks.push({
						id: parsedStats.id,
						name,
						cardCount: parsedStats.cardCount,
						newCount: parsedStats.newCount,
						learnCount: parsedStats.learnCount,
						reviewCount: parsedStats.reviewCount,
					});
				}
			} catch {
				for (const name of chunk) {
					decks.push({
						id: 0,
						name,
						cardCount: 0,
						newCount: 0,
						learnCount: 0,
						reviewCount: 0,
					});
				}
			}
		}

		return decks;
	}

	/**
	 * 获取 Anki 模型列表（优化版）
	 *
	 * 优化点：
	 * 1. 并发控制（最多3个并发）
	 * 2. 错误容忍（单个失败不影响整体）
	 * 3. 进度回调
	 */
	async getAnkiModels(
		onProgress?: (current: number, total: number) => void
	): Promise<AnkiModelInfo[]> {
		const modelNames = await this.client.getModelNames();
		const models: AnkiModelInfo[] = [];
		const errors: Array<{ name: string; error: string }> = [];

		const concurrencyLimit = 3; // 并发限制

		for (let i = 0; i < modelNames.length; i += concurrencyLimit) {
			const batch = modelNames.slice(i, i + concurrencyLimit);

			const batchResults = await Promise.allSettled(
				batch.map(async (name) => {
					try {
						return await this.client.getModelInfo(name);
					} catch (error: unknown) {
						errors.push({ name, error: extractErrorMessage(error) });
						return null;
					}
				})
			);

			// 收集成功的结果
			for (const result of batchResults) {
				if (result.status === "fulfilled" && result.value) {
					models.push(result.value);
				}
			}

			// 报告进度
			if (onProgress) {
				const current = Math.min(i + concurrencyLimit, modelNames.length);
				onProgress(current, modelNames.length);
			}
		}

		// 如果有错误，记录但不抛出（错误容忍）
		if (errors.length > 0) {
			logger.warn(`获取 ${errors.length} 个模型信息失败:`, errors);
		}

		return models;
	}

	/**
	 * 同步牌组到 Anki
	 */
	async syncDeckToAnki(deck: Deck, cards: Card[], template: ParseTemplate): Promise<SyncLogEntry> {
		const startTime = Date.now();
		const logEntry: SyncLogEntry = {
			id: this.generateLogId(),
			timestamp: new Date().toISOString(),
			direction: "to_anki",
			summary: {
				totalCards: cards.length,
				successCount: 0,
				failedCount: 0,
				skippedCount: 0,
			},
			duration: 0,
			errors: [],
			details: [],
		};

		try {
			// 更新同步进度
			this.updateProgress(SyncStatus.PREPARING, 0, cards.length);

			// 获取需要同步的卡片（增量同步）
			const cardsToSync = this.settings.autoSync.prioritizeRecent
				? this.stateTracker.getCardsToSync(cards, this.settings.autoSync.maxCardsPerSync)
				: cards;

			logEntry.summary.totalCards = cardsToSync.length;
			this.updateProgress(SyncStatus.SYNCING, 0, cardsToSync.length);

			// 批量同步卡片
			for (let i = 0; i < cardsToSync.length; i++) {
				const card = cardsToSync[i];

				try {
					await this.syncSingleCard(card, deck, template);

					logEntry.summary.successCount++;
					logEntry.details?.push({
						cardId: card.uuid,
						cardTitle: getCardFront(card).substring(0, 50),
						status: "success",
					});
				} catch (error: unknown) {
					const message = extractErrorMessage(error);
					logEntry.summary.failedCount++;
					logEntry.errors?.push(`卡片 ${card.uuid}: ${message}`);
					logEntry.details?.push({
						cardId: card.uuid,
						cardTitle: getCardFront(card).substring(0, 50),
						status: "failed",
						reason: message,
					});
				}

				this.updateProgress(SyncStatus.SYNCING, i + 1, cardsToSync.length);
			}

			this.updateProgress(SyncStatus.COMPLETED, cardsToSync.length, cardsToSync.length);
		} catch (error: unknown) {
			const message = extractErrorMessage(error);
			this.updateProgress(SyncStatus.FAILED, 0, 0, message);
			logEntry.errors?.push(`同步失败: ${message}`);
		}

		logEntry.duration = Date.now() - startTime;
		return logEntry;
	}

	/**
	 * 同步单张卡片
	 */
	private async syncSingleCard(card: Card, deck: Deck, template: ParseTemplate): Promise<void> {
		// 处理媒体文件
		let frontContent = getCardFront(card);
		let backContent = getCardBack(card);

		if (this.settings.mediaSync.enabled) {
			const deckPath = (deck.metadata?.path as string) || "";
			const frontMedia = await this.mediaService.syncMediaToAnki(frontContent, deckPath);
			frontContent = frontMedia.updatedContent;

			const backMedia = await this.mediaService.syncMediaToAnki(backContent, deckPath);
			backContent = backMedia.updatedContent;
		}

		// 添加 Obsidian 回链
		if (this.settings.mediaSync.createBacklinks) {
			const backlinkHtml = this.generateCardBacklink(card, deck);

			if (this.settings.mediaSync.createBacklinks) {
				backContent += `\n\n<hr>\n${backlinkHtml}`;
			}
		}

		// 获取或创建 Anki 牌组
		const ankiDeckName = this.getAnkiDeckName(deck);

		// 检查是否已存在
		const metadata = this.stateTracker.getMetadata(card.uuid);

		if (metadata?.ankiNoteId) {
			// 更新现有笔记
			await this.client.updateNoteFields(metadata.ankiNoteId, {
				Front: frontContent,
				Back: backContent,
				Extra: card.fields?.extra || (card.customFields?.extra as string) || "",
			});

			if (card.tags && card.tags.length > 0) {
				await this.client.updateNoteTags(metadata.ankiNoteId, card.tags);
			}

			this.stateTracker.updateAfterSync(card.uuid, metadata.ankiNoteId);
		} else {
			// 创建新笔记
			//  Content-Only: 从 content 解析字段
			const { getCardFields } = await import("../../utils/card-field-helper");
			const parsedFields = getCardFields(card);

			const ankiNote: AnkiNote = {
				deckName: ankiDeckName,
				modelName: template.syncCapability?.ankiModelMapping?.modelName || "Basic",
				fields: {
					Front: parsedFields.front || frontContent,
					Back: parsedFields.back || backContent,
					Extra: (card.customFields?.extra as string) || "",
				},
				tags: card.tags || [],
			};

			const noteId = await this.client.addNote(ankiNote);

			this.stateTracker.initializeMetadata(card, noteId);
		}
	}

	/**
	 * 更新同步进度
	 */
	private updateProgress(
		status: SyncProgress["status"],
		current: number,
		total: number,
		message?: string
	): void {
		this.syncProgress = {
			status,
			current,
			total,
			percentage: total > 0 ? Math.round((current / total) * 100) : 0,
			message,
		};
	}

	/**
	 * 生成卡片回链
	 */
	private generateCardBacklink(_card: Card, deck: Deck): string {
		const vaultName = this.app.vault.getName();
		const deckPath = (deck.metadata?.path as string) || "";
		const encodedPath = encodeURIComponent(deckPath);
		const url = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodedPath}`;

		return buildObsidianBacklinkMarkup(url, {
			title: "Open in Obsidian",
			marginTop: 0,
		});
	}

	/**
	 * 获取 Anki 牌组名称
	 */
	private getAnkiDeckName(deck: Deck): string {
		const mapping = this.settings.deckMappings[deck.id];
		return mapping?.ankiDeckName || deck.name;
	}

	/**
	 * 生成日志 ID
	 */
	private generateLogId(): string {
		return `sync-${Date.now()}-${Math.random().toString(36).substring(7)}`;
	}

	/**
	 * 获取连接状态
	 */
	getConnectionStatus(): ConnectionStatus {
		return this.connectionStatus;
	}

	/**
	 * 获取同步进度
	 */
	getSyncProgress(): SyncProgress {
		return this.syncProgress;
	}

	/**
	 * 获取同步统计
	 */
	getSyncStatistics(): unknown {
		return this.stateTracker.getStatistics();
	}

	/**
	 * 更新设置
	 */
	updateSettings(settings: Partial<AnkiConnectSettings>): void {
		const autoSyncWasRunning = !!this.autoSyncScheduler;
		const prevAutoSync = { ...this.settings.autoSync };

		Object.assign(this.settings, settings);

		if (settings.endpoint) {
			this.client = new AnkiConnectClient(settings.endpoint);
		}

		if (settings.mediaSync) {
			this.mediaService.updateOptions(settings.mediaSync);
		}

		if (settings.autoSync) {
			const autoSyncEnabled = this.settings.autoSync.enabled;

			if (!autoSyncEnabled) {
				this.stopAutoSync();
			} else {
				const next = this.settings.autoSync;
				const prev = prevAutoSync;
				const configChanged =
					next.intervalMinutes !== prev.intervalMinutes ||
					next.syncOnStartup !== prev.syncOnStartup ||
					next.onlyWhenAnkiRunning !== prev.onlyWhenAnkiRunning ||
					(next.enableFileWatcher ?? false) !== (prev.enableFileWatcher ?? false);

				if (configChanged && autoSyncWasRunning) {
					this.stopAutoSync();
					this.startAutoSync();
				} else if (!autoSyncWasRunning) {
					this.startAutoSync();
				}
			}
		}
	}

	/**
	 * 导出同步元数据（用于保存到设置）
	 */
	exportSyncMetadata(): Record<string, CardSyncMetadata> {
		return this.stateTracker.getAllMetadata();
	}

	/**
	 * 获取 Weave 牌组列表
	 * 注意：此方法为占位符，实际应从 plugin.dataStorage 获取
	 */
	async getWeaveDecks(): Promise<Deck[]> {
		// 此方法暂未使用，批量同步在 UI 层直接从 plugin.dataStorage 获取
		return [];
	}

	/**
	 * 获取牌组的卡片数量
	 * 注意：此方法为占位符，实际应从 plugin.dataStorage 获取
	 */
	async getDeckCardCount(_deckId: string): Promise<number> {
		// 此方法暂未使用，批量同步在 UI 层直接从 plugin.dataStorage 获取
		return 0;
	}

	/**
	 * 验证牌组映射
	 */
	validateDeckMapping(mapping: DeckSyncMapping): {
		isValid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		if (!mapping.weaveDeckId) {
			errors.push("Weave 牌组 ID 不能为空");
		}

		if (!mapping.ankiDeckName) {
			errors.push("Anki 牌组名称不能为空");
		}

		if (mapping.syncDirection !== "to_anki") {
			errors.push("无效的同步方向");
		}

		return {
			isValid: errors.length === 0,
			errors,
		};
	}

	/**
	 * 批量同步多个牌组
	 *
	 * 注意：此方法已废弃，批量同步逻辑已迁移到 UI 层（AnkiConnectPanel.performSync）
	 * 保留此方法仅为向后兼容，实际不再使用
	 */

	/**
	 * 取消当前同步
	 */
	private syncCancelled = false;

	cancelCurrentSync(): void {
		this.syncCancelled = true;
		this.updateProgress(SyncStatus.CANCELLED, 0, 0, "同步已取消");
	}

	/**
	 * 导出同步日志为 JSON
	 */
	exportLogsToJson(logs: SyncLogEntry[]): string {
		return JSON.stringify(logs, null, 2);
	}

	// ==================== 模板和卡片导出功能 ====================

	/**
	 * 导出 Weave 牌组到 Anki
	 */
	async exportDeckToAnki(
		weaveDeckId: string,
		ankiDeckName: string,
		onProgress?: (current: number, total: number, status: string) => void
	): Promise<import("../../types/ankiconnect-types").ExportResult> {
		try {
			const result = await this.cardExporter.exportDeckIncremental(
				weaveDeckId,
				ankiDeckName,
				onProgress
			);

			await this.incrementalTracker.persist();

			return result;
		} catch (error: unknown) {
			logger.error("导出牌组失败:", error);
			throw new AnkiConnectError(`导出牌组失败: ${error.message}`, ConnectionErrorType.UNKNOWN);
		}
	}

	/**
	 * 获取模板管理器（供 UI 使用）
	 */
	async repairModelMismatchNotes(
		items: SyncItemResult[],
		onProgress?: (current: number, total: number, status: string) => void
	): Promise<ModelMismatchRepairResult> {
		const mismatchItems = items.filter((item) => item.reason === "model_mismatch");
		const result: ModelMismatchRepairResult = {
			success: true,
			totalItems: mismatchItems.length,
			archivedCards: 0,
			fixedCards: 0,
			archivedOnlyCards: 0,
			failedCards: 0,
			archiveDeckName: MODEL_MISMATCH_ARCHIVE_DECK,
			items: [],
			errors: [],
		};

		if (mismatchItems.length === 0) {
			return result;
		}

		const totalSteps = mismatchItems.length * 2;
		onProgress?.(0, totalSteps, "正在准备错模型修复...");

		await this.ensureDeckExists(result.archiveDeckName);

		const cardsById = await this.loadCardsById(mismatchItems.map((item) => item.cardId));
		const noteInfoById = await this.loadNoteInfoById(
			mismatchItems
				.map((item) => item.noteId)
				.filter((noteId): noteId is number => typeof noteId === "number")
		);

		const repairEntries = new Map<
			string,
			{
				item: ModelMismatchRepairResult["items"][number];
				card: Card;
				deckName: string;
				archiveCompleted: boolean;
			}
		>();
		const cardsByDeck = new Map<string, Card[]>();

		for (let index = 0; index < mismatchItems.length; index++) {
			const mismatchItem = mismatchItems[index];
			const repairItem: ModelMismatchRepairResult["items"][number] = {
				cardId: mismatchItem.cardId,
				preview: mismatchItem.preview,
				deckName: mismatchItem.deckName,
				originalNoteId: mismatchItem.noteId,
				existingModelName: mismatchItem.existingModelName,
				targetModelName: mismatchItem.targetModelName ?? mismatchItem.modelName,
				outcome: "failed",
				message: "",
			};
			result.items.push(repairItem);

			const card = cardsById.get(mismatchItem.cardId);
			if (!card) {
				repairItem.message = "未在 Weave 中找到对应卡片，无法重建";
				result.failedCards++;
				result.errors.push(`${mismatchItem.cardId}: ${repairItem.message}`);
				onProgress?.(
					index + 1,
					totalSteps,
					`已归档检查 ${index + 1}/${mismatchItems.length} 张卡片`
				);
				continue;
			}

			const deckName = mismatchItem.deckName?.trim();
			if (!deckName) {
				repairItem.message = "缺少目标 Anki 牌组信息，无法修复";
				result.failedCards++;
				result.errors.push(`${mismatchItem.cardId}: ${repairItem.message}`);
				onProgress?.(
					index + 1,
					totalSteps,
					`已归档检查 ${index + 1}/${mismatchItems.length} 张卡片`
				);
				continue;
			}

			if (typeof mismatchItem.noteId !== "number") {
				repairItem.message = "缺少原始 Anki 笔记 ID，无法安全归档旧卡";
				result.failedCards++;
				result.errors.push(`${mismatchItem.cardId}: ${repairItem.message}`);
				onProgress?.(
					index + 1,
					totalSteps,
					`已归档检查 ${index + 1}/${mismatchItems.length} 张卡片`
				);
				continue;
			}

			const existingNoteInfo = noteInfoById.get(mismatchItem.noteId);

			try {
				if (existingNoteInfo && this.extractWeaveCardId(existingNoteInfo) === mismatchItem.cardId) {
					await this.archiveMismatchedNote(existingNoteInfo, result.archiveDeckName);
					repairItem.archivedNoteId = existingNoteInfo.noteId;
					repairItem.message = `旧卡已移入 ${result.archiveDeckName} 并暂停`;
					result.archivedCards++;
					repairEntries.set(mismatchItem.cardId, {
						item: repairItem,
						card,
						deckName,
						archiveCompleted: true,
					});
				} else {
					repairItem.message = "旧卡已不再占用同步索引，直接重建正确模板";
					repairEntries.set(mismatchItem.cardId, {
						item: repairItem,
						card,
						deckName,
						archiveCompleted: false,
					});
				}

				const deckCards = cardsByDeck.get(deckName) ?? [];
				deckCards.push(card);
				cardsByDeck.set(deckName, deckCards);
			} catch (error: unknown) {
				repairItem.message = `归档旧卡失败：${error.message}`;
				result.failedCards++;
				result.errors.push(`${mismatchItem.cardId}: ${repairItem.message}`);
			}

			onProgress?.(index + 1, totalSteps, `已归档检查 ${index + 1}/${mismatchItems.length} 张卡片`);
		}

		let exportedCardCount = 0;
		for (const [deckName, deckCards] of cardsByDeck.entries()) {
			try {
				const exportResult = await this.cardExporter.exportCardsIncremental(deckCards, deckName);
				const exportItemsByCardId = new Map(exportResult.items.map((item) => [item.cardId, item]));

				for (const card of deckCards) {
					const repairEntry = repairEntries.get(card.uuid);
					if (!repairEntry) {
						continue;
					}

					const exportItem = exportItemsByCardId.get(card.uuid);
					if (
						exportItem &&
						(exportItem.outcome === "created" ||
							exportItem.outcome === "updated" ||
							exportItem.outcome === "unchanged")
					) {
						repairEntry.item.outcome = "fixed";
						repairEntry.item.recreatedNoteId = exportItem.noteId;
						repairEntry.item.message =
							exportItem.outcome === "unchanged"
								? "正确模型卡片已存在，已完成修复"
								: exportItem.outcome === "updated"
								? "已按正确模板更新卡片"
								: "已按正确模板重建卡片";
						result.fixedCards++;
					} else {
						repairEntry.item.outcome = "archived_only";
						repairEntry.item.message = `旧卡已归档，但新卡重建失败：${
							exportItem?.message ?? "未知错误"
						}`;
						result.archivedOnlyCards++;
						result.errors.push(`${card.uuid}: ${repairEntry.item.message}`);
					}

					exportedCardCount++;
					onProgress?.(
						mismatchItems.length + exportedCardCount,
						totalSteps,
						`正在重建正确模板卡片（${Math.min(exportedCardCount, mismatchItems.length)}/${
							mismatchItems.length
						}）`
					);
				}
			} catch (error: unknown) {
				for (const card of deckCards) {
					const repairEntry = repairEntries.get(card.uuid);
					if (!repairEntry) {
						continue;
					}

					repairEntry.item.outcome = repairEntry.archiveCompleted ? "archived_only" : "failed";
					repairEntry.item.message = repairEntry.archiveCompleted
						? `旧卡已归档，但新卡重建失败：${error.message}`
						: `修复失败：${error.message}`;

					if (repairEntry.archiveCompleted) {
						result.archivedOnlyCards++;
					} else {
						result.failedCards++;
					}

					result.errors.push(`${card.uuid}: ${repairEntry.item.message}`);
					exportedCardCount++;
					onProgress?.(
						mismatchItems.length + exportedCardCount,
						totalSteps,
						`正在重建正确模板卡片（${Math.min(exportedCardCount, mismatchItems.length)}/${
							mismatchItems.length
						}）`
					);
				}
			}
		}

		result.success = result.failedCards === 0 && result.archivedOnlyCards === 0;
		await this.incrementalTracker.persist();
		onProgress?.(totalSteps, totalSteps, "错模型修复完成");
		return result;
	}

	getTemplateManager(): TemplateManager {
		return this.templateManager;
	}

	/**
	 * 获取模板转换器（供 UI 使用）
	 */
	getTemplateConverter(): AnkiTemplateConverter {
		return this.templateConverter;
	}

	/**
	 * 批量导入 Anki 模板
	 */
	async importAnkiModels(
		modelNames: string[],
		onProgress?: (current: number, total: number) => void
	): Promise<{ imported: ParseTemplate[]; errors: string[] }> {
		const imported: ParseTemplate[] = [];
		const errors: string[] = [];

		for (let i = 0; i < modelNames.length; i++) {
			try {
				const modelName = modelNames[i];
				const modelInfo = await this.client.getModelInfo(modelName);

				// 检查是否已导入
				if (this.templateConverter.isTemplateAlreadyImported(modelInfo.id)) {
					logger.debug(`模板 ${modelName} 已存在，跳过`);
					continue;
				}

				// 转换并保存
				const { template, warnings } = this.templateConverter.convertModelToTemplate(modelInfo);
				await this.templateManager.saveTemplate(template);
				imported.push(template);

				if (warnings.length > 0) {
					errors.push(`${modelName}: ${warnings.join(", ")}`);
				}

				onProgress?.(i + 1, modelNames.length);
			} catch (error: unknown) {
				errors.push(`${modelNames[i]}: ${error.message}`);
			}
		}

		return { imported, errors };
	}

	/**
	 * 转换模板为 Weave 专属模板
	 */
	async convertToWeaveExclusive(templateId: string): Promise<ParseTemplate> {
		return await this.templateManager.convertToWeaveExclusive(templateId);
	}

	/**
	 * 获取模板统计信息
	 */
	getTemplateStatistics() {
		return this.templateManager.getTemplateStatistics();
	}

	/**
	 * 按来源获取模板列表
	 */
	getTemplatesBySource(
		source: "official" | "anki_imported" | "weave_created" | "user_custom"
	): ParseTemplate[] {
		return this.templateManager.getTemplatesBySource(source);
	}

	// ==================== 连接管理和自动同步方法 ====================

	/**
	 * 启动连接监控（心跳检测）
	 */
	startConnectionMonitoring(): void {
		logger.debug("[AnkiConnectService] 启动连接监控");
		this.connectionManager.startHeartbeat();
	}

	/**
	 * 停止连接监控
	 */
	stopConnectionMonitoring(): void {
		logger.debug("[AnkiConnectService] 停止连接监控");
		this.connectionManager.stopHeartbeat();
	}

	/**
	 * 启动自动同步
	 */
	startAutoSync(): void {
		if (!this.settings.autoSync.enabled) {
			logger.debug("[AnkiConnectService] 自动同步未启用，跳过");
			return;
		}

		if (this.autoSyncScheduler) {
			logger.warn("[AnkiConnectService] 自动同步调度器已在运行");
			return;
		}

		logger.debug("[AnkiConnectService] 启动自动同步调度器");

		this.autoSyncScheduler = new AutoSyncScheduler(this.app, this.plugin, this, {
			intervalMinutes: this.settings.autoSync.intervalMinutes,
			syncOnStartup: this.settings.autoSync.syncOnStartup,
			onlyWhenAnkiRunning: this.settings.autoSync.onlyWhenAnkiRunning,
			enableFileWatcher: this.settings.autoSync.enableFileWatcher ?? false,
			debounceDelay: 5000, // 5秒防抖
		});

		this.autoSyncScheduler.start();
	}

	/**
	 * 停止自动同步
	 */
	stopAutoSync(): void {
		if (!this.autoSyncScheduler) {
			return;
		}

		logger.debug("[AnkiConnectService] 停止自动同步调度器");
		this.autoSyncScheduler.stop();
		this.autoSyncScheduler = null;
	}

	/**
	 * 手动触发同步
	 */
	manualSync(): void {
		if (this.autoSyncScheduler) {
			this.autoSyncScheduler.manualSync();
		} else {
			logger.warn("[AnkiConnectService] 自动同步调度器未启动");
		}
	}

	/**
	 * 获取连接状态
	 */
	getConnectionState(): ConnectionState {
		return this.connectionManager.getState();
	}

	private async ensureDeckExists(deckName: string): Promise<void> {
		const deckNames = await this.client.getDeckNames();
		if (!deckNames.includes(deckName)) {
			await this.client.createDeck(deckName);
		}
	}

	private async loadCardsById(cardIds: string[]): Promise<Map<string, Card>> {
		if (!this.plugin.dataStorage) {
			throw new Error("DataStorage 未初始化");
		}

		const targetCardIds = new Set(cardIds);
		const cards = await this.plugin.dataStorage.getCards();
		return new Map(
			cards.filter((card) => targetCardIds.has(card.uuid)).map((card) => [card.uuid, card])
		);
	}

	private async loadNoteInfoById(noteIds: number[]): Promise<Map<number, AnkiNoteInfo>> {
		const noteInfoMap = new Map<number, AnkiNoteInfo>();

		for (const chunk of chunkItems([...new Set(noteIds)], 100)) {
			if (chunk.length === 0) {
				continue;
			}

			try {
				const notes = await this.client.getNotesInfo(chunk);
				for (const note of notes) {
					noteInfoMap.set(note.noteId, note);
				}
			} catch (error) {
				logger.warn("[AnkiConnectService] 读取待修复笔记信息失败", error);
			}
		}

		return noteInfoMap;
	}

	private extractWeaveCardId(noteInfo: AnkiNoteInfo): string {
		for (const [fieldName, fieldValue] of Object.entries(noteInfo.fields ?? {})) {
			if (fieldName.toLowerCase() === "weave_card_id") {
				return normalizeNoteFieldValue(fieldValue);
			}
		}

		return "";
	}

	private findNoteFieldName(
		fields: Record<string, string>,
		canonicalFieldName: string
	): string | undefined {
		return Object.keys(fields).find(
			(fieldName) => fieldName.toLowerCase() === canonicalFieldName.toLowerCase()
		);
	}

	private async archiveMismatchedNote(
		noteInfo: AnkiNoteInfo,
		archiveDeckName: string
	): Promise<void> {
		const fieldsToClear: Record<string, string> = {};
		for (const fieldName of TRACKING_FIELDS_TO_CLEAR) {
			const actualFieldName = this.findNoteFieldName(noteInfo.fields ?? {}, fieldName);
			if (actualFieldName) {
				fieldsToClear[actualFieldName] = "";
			}
		}

		if (Object.keys(fieldsToClear).length > 0) {
			await this.client.updateNoteFields(noteInfo.noteId, fieldsToClear);
		}

		const nextTags = Array.from(new Set([...(noteInfo.tags ?? []), MODEL_MISMATCH_ARCHIVE_TAG]));
		if (nextTags.length !== (noteInfo.tags ?? []).length) {
			await this.client.updateNoteTags(noteInfo.noteId, nextTags);
		}

		if ((noteInfo.cards ?? []).length > 0) {
			await this.client.changeDeck(noteInfo.cards, archiveDeckName);
			await this.client.suspendCards(noteInfo.cards);
		}
	}

	private createEmptyExportSummary(): ExportSummary {
		return {
			totalCards: 0,
			exportedCards: 0,
			skippedCards: 0,
			createdCards: 0,
			updatedCards: 0,
			unchangedCards: 0,
			duplicateCards: 0,
			failedCards: 0,
			warningCards: 0,
			failureReasons: {},
			warningReasons: {},
		};
	}

	private createEmptyIncrementalResult(duration = 0): IncrementalSyncResult {
		return {
			totalCards: 0,
			changedCards: 0,
			skippedCards: 0,
			importedCards: 0,
			exportedCards: 0,
			createdCards: 0,
			updatedCards: 0,
			unchangedCards: 0,
			duplicateCards: 0,
			failedCards: 0,
			warningCards: 0,
			summary: this.createEmptyExportSummary(),
			deckResults: [],
			errors: [],
			duration,
		};
	}

	private mergeExportResultIntoIncremental(
		target: IncrementalSyncResult,
		deckName: string,
		exportResult: ExportResult
	): void {
		target.deckResults.push({
			deckName,
			direction: "to_anki",
			exportResult,
		});
		target.totalCards += exportResult.totalCards;
		target.exportedCards += exportResult.exportedCards;
		target.createdCards += exportResult.createdCards;
		target.updatedCards += exportResult.updatedCards;
		target.unchangedCards += exportResult.unchangedCards;
		target.duplicateCards += exportResult.duplicateCards;
		target.failedCards += exportResult.failedCards;
		target.warningCards += exportResult.warningCards;
		target.skippedCards += exportResult.skippedCards;

		for (const [reason, count] of Object.entries(exportResult.summary.failureReasons)) {
			const failureReason = reason as SyncFailureReason;
			target.summary.failureReasons[failureReason] =
				(target.summary.failureReasons[failureReason] ?? 0) + (count ?? 0);
		}

		for (const [reason, count] of Object.entries(exportResult.summary.warningReasons)) {
			const warningReason = reason as SyncWarningReason;
			target.summary.warningReasons[warningReason] =
				(target.summary.warningReasons[warningReason] ?? 0) + (count ?? 0);
		}

		target.errors.push(...exportResult.errors.map((error) => `${deckName}: ${error.message}`));
	}

	async performIncrementalSync(): Promise<IncrementalSyncResult> {
		return this.performIncrementalSyncV2();
	}

	/**
	 * 获取增量同步统计信息
	 */
	private async performIncrementalSyncV2(): Promise<IncrementalSyncResult> {
		const startTime = Date.now();
		logger.debug("[AnkiConnectService] 开始增量同步");

		try {
			const deckMappings = Object.values(this.settings.deckMappings || {});
			const result = this.createEmptyIncrementalResult();

			if (deckMappings.length === 0) {
				result.duration = Date.now() - startTime;
				return result;
			}

			for (const mapping of deckMappings) {
				if (!mapping.enabled) {
					continue;
				}

				try {
					const exportResult = await this.cardExporter.exportDeckIncremental(
						mapping.weaveDeckId,
						mapping.ankiDeckName
					);
					this.mergeExportResultIntoIncremental(result, mapping.ankiDeckName, exportResult);
				} catch (error) {
					result.errors.push(
						`${mapping.ankiDeckName}: ${error instanceof Error ? error.message : "未知错误"}`
					);
				}
			}

			result.changedCards = result.exportedCards;
			result.summary.totalCards = result.totalCards;
			result.summary.exportedCards = result.exportedCards;
			result.summary.skippedCards = result.skippedCards;
			result.summary.createdCards = result.createdCards;
			result.summary.updatedCards = result.updatedCards;
			result.summary.unchangedCards = result.unchangedCards;
			result.summary.duplicateCards = result.duplicateCards;
			result.summary.failedCards = result.failedCards;
			result.summary.warningCards = result.warningCards;
			result.duration = Date.now() - startTime;

			await this.incrementalTracker.persist();
			return result;
		} catch (error) {
			logger.error("[AnkiConnectService] 增量同步失败:", error);

			const result = this.createEmptyIncrementalResult(Date.now() - startTime);
			result.errors = [error instanceof Error ? error.message : "未知错误"];
			return result;
		}
	}

	getIncrementalSyncStats() {
		return this.incrementalTracker.getStats();
	}

	/**
	 * 重置增量同步状态（强制全量同步）
	 */
	resetIncrementalSync(): void {
		this.incrementalTracker.reset();
		logger.debug("[AnkiConnectService] 增量同步状态已重置");
	}

	/**
	 * 清理过期的同步记录
	 */
	cleanupOldSyncRecords(maxAgeDays = 90): number {
		const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
		return this.incrementalTracker.cleanupOldRecords(maxAgeMs);
	}
}
