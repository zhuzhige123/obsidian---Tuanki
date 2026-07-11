import type { Card } from "../../data/types";
import type { WeavePlugin } from "../../main";
import type { SyncItemOutcome } from "../../types/ankiconnect-types";
import { logger } from "../../utils/logger";

export interface SyncTimestamp {
	cardId: string;
	lastSyncTime: number;
	ankiNoteId?: number;
	direction: "import" | "export" | "both";
	exportHash?: string;
	ankiDeckName?: string;
	modelName?: string;
	lastOutcome?: SyncItemOutcome;
	lastError?: string;
}

export interface IncrementalSyncState {
	timestamps: Record<string, SyncTimestamp>;
	lastFullSync: number;
}

function mergeDirection(
	previous: SyncTimestamp["direction"] | undefined,
	next: SyncTimestamp["direction"]
): SyncTimestamp["direction"] {
	if (!previous || previous === next) {
		return next;
	}

	return "both";
}

function normalizeTimestamp(
	cardId: string,
	value: Partial<SyncTimestamp> | undefined
): SyncTimestamp {
	return {
		cardId,
		lastSyncTime:
			typeof value?.lastSyncTime === "number" && Number.isFinite(value.lastSyncTime)
				? value.lastSyncTime
				: 0,
		ankiNoteId: typeof value?.ankiNoteId === "number" ? value.ankiNoteId : undefined,
		direction:
			value?.direction === "import" || value?.direction === "both" || value?.direction === "export"
				? value.direction
				: "export",
		exportHash: typeof value?.exportHash === "string" ? value.exportHash : undefined,
		ankiDeckName: typeof value?.ankiDeckName === "string" ? value.ankiDeckName : undefined,
		modelName: typeof value?.modelName === "string" ? value.modelName : undefined,
		lastOutcome: value?.lastOutcome,
		lastError: typeof value?.lastError === "string" ? value.lastError : undefined,
	};
}

export class IncrementalSyncTracker {
	private state: IncrementalSyncState = {
		timestamps: {},
		lastFullSync: 0,
	};

	constructor(private plugin: WeavePlugin) {
		this.load();
	}

	private load(): void {
		const savedState = this.plugin.settings.ankiConnect?.incrementalSyncState;
		if (!savedState) {
			logger.debug("[IncrementalSyncTracker] 未找到已保存状态，使用空状态");
			return;
		}

		const normalizedEntries = Object.entries(savedState.timestamps ?? {}).map(
			([cardId, value]) =>
				[cardId, normalizeTimestamp(cardId, value as Partial<SyncTimestamp> | undefined)] as const
		);

		this.state = {
			timestamps: Object.fromEntries(normalizedEntries),
			lastFullSync:
				typeof savedState.lastFullSync === "number" && Number.isFinite(savedState.lastFullSync)
					? savedState.lastFullSync
					: 0,
		};

		logger.debug(
			"[IncrementalSyncTracker] 已加载同步状态",
			Object.keys(this.state.timestamps).length
		);
	}

	async persist(): Promise<void> {
		if (!this.plugin.settings.ankiConnect) {
			logger.error("[IncrementalSyncTracker] AnkiConnect 配置不存在，无法保存");
			return;
		}

		this.plugin.settings.ankiConnect.incrementalSyncState = this.state;
		await this.plugin.saveSettings();

		logger.debug(
			"[IncrementalSyncTracker] 已保存同步状态",
			Object.keys(this.state.timestamps).length
		);
	}

	getChangedCards(cards: Card[], ankiModMap?: Map<string, number>): Card[] {
		const changedCards: Card[] = [];

		for (const card of cards) {
			if (this.shouldSync(card, ankiModMap?.get(card.uuid))) {
				changedCards.push(card);
			}
		}

		logger.debug(
			"[IncrementalSyncTracker] 变化卡片筛选结果",
			changedCards.length,
			"/",
			cards.length
		);
		return changedCards;
	}

	shouldSync(card: Card, ankiMod?: number): boolean {
		const timestamp = this.state.timestamps[card.uuid];
		if (!timestamp) {
			return true;
		}

		const lastSyncTime = timestamp.lastSyncTime;
		const cardModStr = card.modified || card.created || "";
		const cardModTime = cardModStr ? new Date(cardModStr).getTime() : 0;

		if (cardModTime > lastSyncTime) {
			return true;
		}

		if (ankiMod !== undefined && ankiMod > lastSyncTime) {
			return true;
		}

		return false;
	}

	updateSyncTimestamp(
		cardId: string,
		options: {
			ankiNoteId?: number;
			direction: "import" | "export" | "both";
			syncTime?: number;
			exportHash?: string;
			ankiDeckName?: string;
			modelName?: string;
			lastOutcome?: SyncItemOutcome;
			lastError?: string;
			preserveSyncTime?: boolean;
		}
	): void {
		const previous = this.state.timestamps[cardId];
		const syncTime = options.syncTime ?? Date.now();

		this.state.timestamps[cardId] = {
			cardId,
			lastSyncTime: options.preserveSyncTime ? previous?.lastSyncTime ?? 0 : syncTime,
			ankiNoteId: options.ankiNoteId ?? previous?.ankiNoteId,
			direction: mergeDirection(previous?.direction, options.direction),
			exportHash: options.exportHash ?? previous?.exportHash,
			ankiDeckName: options.ankiDeckName ?? previous?.ankiDeckName,
			modelName: options.modelName ?? previous?.modelName,
			lastOutcome: options.lastOutcome ?? previous?.lastOutcome,
			lastError: options.lastError,
		};
	}

	recordExportResult(
		cardId: string,
		options: {
			outcome: SyncItemOutcome;
			ankiNoteId?: number;
			exportHash?: string;
			ankiDeckName?: string;
			modelName?: string;
			error?: string;
			syncTime?: number;
		}
	): void {
		const isSuccessful =
			options.outcome === "created" ||
			options.outcome === "updated" ||
			options.outcome === "unchanged";

		this.updateSyncTimestamp(cardId, {
			ankiNoteId: options.ankiNoteId,
			direction: "export",
			syncTime: options.syncTime,
			exportHash: options.exportHash,
			ankiDeckName: options.ankiDeckName,
			modelName: options.modelName,
			lastOutcome: options.outcome,
			lastError: options.error,
			preserveSyncTime: !isSuccessful,
		});
	}

	updateBatchTimestamps(
		cards: Card[],
		options: {
			direction: "import" | "export" | "both";
			ankiNoteIdMap?: Map<string, number>;
		}
	): void {
		const now = Date.now();

		for (const card of cards) {
			this.updateSyncTimestamp(card.uuid, {
				ankiNoteId: options.ankiNoteIdMap?.get(card.uuid),
				direction: options.direction,
				syncTime: now,
			});
		}

		logger.debug("[IncrementalSyncTracker] 已批量更新时间戳", cards.length);
	}

	getSyncInfo(cardId: string): SyncTimestamp | undefined {
		return this.state.timestamps[cardId];
	}

	getTrackedEntries(cardIds?: string[]): SyncTimestamp[] {
		if (!cardIds || cardIds.length === 0) {
			return Object.values(this.state.timestamps);
		}

		return cardIds
			.map((cardId) => this.state.timestamps[cardId])
			.filter((entry): entry is SyncTimestamp => !!entry);
	}

	getTrackedNoteIds(cardIds?: string[]): number[] {
		return this.getTrackedEntries(cardIds)
			.map((entry) => entry.ankiNoteId)
			.filter((noteId): noteId is number => typeof noteId === "number");
	}

	markFullSync(): void {
		this.state.lastFullSync = Date.now();
		logger.debug("[IncrementalSyncTracker] 已记录全量同步时间");
	}

	getLastFullSyncTime(): number {
		return this.state.lastFullSync;
	}

	cleanupOldRecords(maxAge: number = 90 * 24 * 60 * 60 * 1000): number {
		const now = Date.now();
		const cutoffTime = now - maxAge;
		let cleanedCount = 0;

		const newTimestamps: Record<string, SyncTimestamp> = {};

		for (const [cardId, timestamp] of Object.entries(this.state.timestamps)) {
			if (timestamp.lastSyncTime >= cutoffTime) {
				newTimestamps[cardId] = timestamp;
			} else {
				cleanedCount++;
			}
		}

		this.state.timestamps = newTimestamps;

		if (cleanedCount > 0) {
			logger.debug("[IncrementalSyncTracker] 已清理过期记录", cleanedCount);
		}

		return cleanedCount;
	}

	reset(): void {
		this.state = {
			timestamps: {},
			lastFullSync: 0,
		};
		logger.debug("[IncrementalSyncTracker] 同步状态已重置");
	}

	getStats(): {
		totalRecords: number;
		lastFullSync: number;
		importCount: number;
		exportCount: number;
		bothCount: number;
		trackedHashes: number;
	} {
		const timestamps = Object.values(this.state.timestamps);

		return {
			totalRecords: timestamps.length,
			lastFullSync: this.state.lastFullSync,
			importCount: timestamps.filter((timestamp) => timestamp.direction === "import").length,
			exportCount: timestamps.filter((timestamp) => timestamp.direction === "export").length,
			bothCount: timestamps.filter((timestamp) => timestamp.direction === "both").length,
			trackedHashes: timestamps.filter((timestamp) => !!timestamp.exportHash).length,
		};
	}
}
