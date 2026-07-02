import { getPluginPaths } from "../../config/paths";
import type { Card, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { getCardDeckIds } from "../../utils/yaml-utils";

const STUDY_DUE_INDEX_VERSION = 1;

type DeckLookup = Pick<Deck, "id" | "name">;

export interface StudyDueIndexSnapshot {
	version: number;
	updatedAt: string;
	fullRebuildRequired: boolean;
	/** card uuid -> due timestamp (ms) */
	dueByUUID: Record<string, number>;
}

export class StudyDueIndexService {
	private writeChain: Promise<void> = Promise.resolve();

	constructor(private plugin: WeavePlugin) {}

	private get adapter() {
		return this.plugin.app.vault.adapter;
	}

	private get indexPath(): string {
		return getPluginPaths(this.plugin.app).indices.studyDue;
	}

	async initialize(): Promise<void> {
		await DirectoryUtils.ensureDirRecursive(this.adapter, getPluginPaths(this.plugin.app).indices.root);
	}

	async getDueUUIDs(now = Date.now(), deckId?: string): Promise<string[]> {
		const snapshot = await this.readSnapshot();
		if (snapshot.fullRebuildRequired) {
			return [];
		}

		const dueUUIDs: string[] = [];
		for (const [uuid, dueAt] of Object.entries(snapshot.dueByUUID)) {
			if (!uuid || typeof dueAt !== "number" || dueAt > now) {
				continue;
			}
			dueUUIDs.push(uuid);
		}

		if (!deckId) {
			return dueUUIDs;
		}

		const membership = this.plugin.deckMembershipIndexService;
		if (!membership) {
			return dueUUIDs;
		}

		try {
			const deckState = await membership.getDeckState(deckId);
			if (
				deckState.hasSnapshot &&
				deckState.initialized &&
				!deckState.fullRebuildRequired &&
				!deckState.isDeckDirty &&
				deckState.cardUUIDs.length > 0
			) {
				const deckUUIDSet = new Set(deckState.cardUUIDs);
				return dueUUIDs.filter((uuid) => deckUUIDSet.has(uuid));
			}
		} catch (error) {
			logger.warn("[StudyDueIndex] 读取牌组成员索引失败，将回退到卡片内容过滤", error);
		}

		return dueUUIDs;
	}

	async updateCard(
		card: Card,
		decks: DeckLookup[] = [],
		options?: { skipDeckMembershipSync?: boolean }
	): Promise<void> {
		if (!card?.uuid) {
			return;
		}

		const dueAt = this.extractDueTimestamp(card);
		await this.mutateSnapshot((snapshot) => {
			const dueByUUID = { ...snapshot.dueByUUID };
			if (dueAt === null) {
				delete dueByUUID[card.uuid];
			} else {
				dueByUUID[card.uuid] = dueAt;
			}

			return {
				...snapshot,
				fullRebuildRequired: false,
				dueByUUID,
			};
		});

		if (
			!options?.skipDeckMembershipSync &&
			this.plugin.deckMembershipIndexService &&
			decks.length > 0
		) {
			try {
				await this.plugin.deckMembershipIndexService.updateCards([card], decks);
			} catch (error) {
				logger.warn("[StudyDueIndex] 同步牌组成员索引失败", error);
			}
		}
	}

	async removeCards(cardUUIDs: string[]): Promise<void> {
		const unique = new Set(cardUUIDs.filter(Boolean));
		if (unique.size === 0) {
			return;
		}

		await this.mutateSnapshot((snapshot) => {
			const dueByUUID = { ...snapshot.dueByUUID };
			for (const uuid of unique) {
				delete dueByUUID[uuid];
			}
			return {
				...snapshot,
				dueByUUID,
			};
		});

		if (this.plugin.deckMembershipIndexService) {
			try {
				await this.plugin.deckMembershipIndexService.removeCards(Array.from(unique));
			} catch (error) {
				logger.warn("[StudyDueIndex] 删除牌组成员索引失败", error);
			}
		}
	}

	async markFullRebuildRequired(): Promise<void> {
		await this.mutateSnapshot((snapshot) => ({
			...snapshot,
			fullRebuildRequired: true,
		}));
	}

	async rebuildFromCards(cards: Card[], decks: DeckLookup[] = []): Promise<void> {
		const dueByUUID: Record<string, number> = {};
		for (const card of cards) {
			if (!card?.uuid) {
				continue;
			}
			const dueAt = this.extractDueTimestamp(card);
			if (dueAt !== null) {
				dueByUUID[card.uuid] = dueAt;
			}
		}

		await this.mutateSnapshot(() => ({
			version: STUDY_DUE_INDEX_VERSION,
			updatedAt: new Date().toISOString(),
			fullRebuildRequired: false,
			dueByUUID,
		}));

		if (this.plugin.deckMembershipIndexService) {
			try {
				await this.plugin.deckMembershipIndexService.rebuildFromCards(cards, decks);
			} catch (error) {
				logger.warn("[StudyDueIndex] 重建牌组成员索引失败", error);
			}
		}
	}

	async ensureReady(cards: Card[], decks: DeckLookup[] = []): Promise<void> {
		const snapshot = await this.readSnapshot();
		if (!snapshot.fullRebuildRequired && snapshot.updatedAt) {
			return;
		}
		await this.rebuildFromCards(cards, decks);
	}

	private extractDueTimestamp(card: Card): number | null {
		const due = card.fsrs?.due;
		if (!due) {
			return null;
		}
		const parsed = new Date(due).getTime();
		return Number.isFinite(parsed) ? parsed : null;
	}

	private createEmptySnapshot(): StudyDueIndexSnapshot {
		return {
			version: STUDY_DUE_INDEX_VERSION,
			updatedAt: "",
			fullRebuildRequired: false,
			dueByUUID: {},
		};
	}

	private normalizeSnapshot(raw?: Partial<StudyDueIndexSnapshot> | null): StudyDueIndexSnapshot {
		const dueByUUID: Record<string, number> = {};
		for (const [uuid, dueAt] of Object.entries(raw?.dueByUUID || {})) {
			if (!uuid || typeof dueAt !== "number" || !Number.isFinite(dueAt)) {
				continue;
			}
			dueByUUID[uuid] = dueAt;
		}

		return {
			version: STUDY_DUE_INDEX_VERSION,
			updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : "",
			fullRebuildRequired: raw?.fullRebuildRequired === true,
			dueByUUID,
		};
	}

	private async readSnapshot(): Promise<StudyDueIndexSnapshot> {
		try {
			if (!(await this.adapter.exists(this.indexPath))) {
				return this.createEmptySnapshot();
			}
			const raw = await this.adapter.read(this.indexPath);
			return this.normalizeSnapshot(JSON.parse(raw) as Partial<StudyDueIndexSnapshot>);
		} catch (error) {
			logger.warn("[StudyDueIndex] 读取索引失败，将回退为空索引", error);
			return this.createEmptySnapshot();
		}
	}

	private async writeSnapshot(snapshot: StudyDueIndexSnapshot): Promise<void> {
		await this.initialize();
		await this.adapter.write(this.indexPath, JSON.stringify(snapshot));
	}

	private async mutateSnapshot(
		mutator: (snapshot: StudyDueIndexSnapshot) => StudyDueIndexSnapshot | Promise<StudyDueIndexSnapshot>
	): Promise<void> {
		const run = async () => {
			const current = await this.readSnapshot();
			const next = this.normalizeSnapshot(await mutator(current));
			next.updatedAt = new Date().toISOString();
			await this.writeSnapshot(next);
		};

		this.writeChain = this.writeChain.then(run, run);
		await this.writeChain;
	}
}

let studyDueIndexServiceInstance: StudyDueIndexService | null = null;

export function initStudyDueIndexService(plugin: WeavePlugin): StudyDueIndexService {
	studyDueIndexServiceInstance = new StudyDueIndexService(plugin);
	return studyDueIndexServiceInstance;
}

export function getStudyDueIndexService(plugin?: WeavePlugin): StudyDueIndexService {
	if (!studyDueIndexServiceInstance && plugin) {
		studyDueIndexServiceInstance = new StudyDueIndexService(plugin);
	}
	if (!studyDueIndexServiceInstance) {
		throw new Error("StudyDueIndexService not initialized");
	}
	return studyDueIndexServiceInstance;
}

/** 从卡片解析正式牌组 ID，供索引增量更新使用 */
export function getFormalDeckLookups(card: Card, decks: DeckLookup[]): {
	deckIds: string[];
	decks: DeckLookup[];
} {
	const { deckIds } = getCardDeckIds(card, decks, { fallbackToReferences: false });
	const deckIdSet = new Set(deckIds.filter(Boolean));
	const matchedDecks = decks.filter((deck) => deckIdSet.has(deck.id));
	return { deckIds: Array.from(deckIdSet), decks: matchedDecks };
}
