/**
 * 数据一致性检查与修复服务。
 *
 * 当前规则：
 * - 卡片内容 YAML 的 we_decks 是唯一真值
 * - deck.cardUUIDs / referencedByDecks 只是派生缓存或兼容字段
 * - 修复时必须以 YAML 归属反推这些缓存字段，而不是反过来覆盖 YAML
 */

import type { Card, DataConsistencyCheckResult, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { logger } from "../../utils/logger";
import { getCardDeckIds } from "../../utils/yaml-utils";

export interface RepairResult {
	success: boolean;
	repairedCards: number;
	cleanedInvalidRefs: number;
	error?: string;
}

type DeckLookup = Pick<Deck, "id" | "name">;

export class DataConsistencyService {
	private plugin: WeavePlugin;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	async checkConsistency(): Promise<DataConsistencyCheckResult> {
		const startTime = Date.now();
		logger.info("[DataConsistency] 开始数据一致性检查...");

		try {
			const decks = await this.plugin.dataStorage.getDecks();
			const allCards = await this.plugin.dataStorage.getCards();
			const expectedDeckMap = this.buildExpectedDeckMap(allCards, decks);
			const cardUUIDSet = new Set(allCards.map((card) => card.uuid).filter(Boolean));

			const orphanCards: string[] = [];
			const invalidReferences: DataConsistencyCheckResult["invalidReferences"] = [];

			for (const card of allCards) {
				const expectedRefs = this.getExpectedDeckIds(card, decks);

				if (expectedRefs.length === 0) {
					orphanCards.push(card.uuid);
				}
			}

			for (const deck of decks) {
				const expectedUUIDs = new Set(expectedDeckMap.get(deck.id) || []);
				const storedUUIDs = Array.from(new Set((deck.cardUUIDs || []).filter(Boolean)));
				const mismatchedUUIDs = storedUUIDs.filter(
					(uuid) => !cardUUIDSet.has(uuid) || !expectedUUIDs.has(uuid)
				);

				const missingUUIDs = Array.from(expectedUUIDs).filter(
					(uuid) => !storedUUIDs.includes(uuid)
				);
				const deckDiff = Array.from(new Set([...mismatchedUUIDs, ...missingUUIDs]));

				if (deckDiff.length > 0) {
					invalidReferences.push({
						deckId: deck.id,
						invalidCardUUIDs: deckDiff,
					});
				}
			}

			const result: DataConsistencyCheckResult = {
				isConsistent: invalidReferences.length === 0,
				checkedAt: Date.now(),
				totalCards: allCards.length,
				totalDecks: decks.length,
				orphanCards,
				invalidReferences,
				inconsistentBackReferences: [],
			};

			logger.info(`[DataConsistency] 检查完成 (${Date.now() - startTime}ms)`, {
				isConsistent: result.isConsistent,
				totalCards: result.totalCards,
				totalDecks: result.totalDecks,
				orphanCards: orphanCards.length,
				invalidDeckRefs: invalidReferences.length,
				inconsistentBackReferences: 0,
			});

			return result;
		} catch (error) {
			logger.error("[DataConsistency] 检查失败:", error);
			return {
				isConsistent: false,
				checkedAt: Date.now(),
				totalCards: 0,
				totalDecks: 0,
				orphanCards: [],
				invalidReferences: [],
				inconsistentBackReferences: [],
			};
		}
	}

	async repairConsistency(): Promise<RepairResult> {
		logger.info("[DataConsistency] 开始修复数据一致性...");

		try {
			const decks = await this.plugin.dataStorage.getDecks();
			const allCards = await this.plugin.dataStorage.getCards();
			const expectedDeckMap = this.buildExpectedDeckMap(allCards, decks);

			let cleanedInvalidRefs = 0;
			for (const deck of decks) {
				const expectedUUIDs = expectedDeckMap.get(deck.id) || [];
				const currentUUIDs = Array.from(new Set((deck.cardUUIDs || []).filter(Boolean)));

				if (this.sameStringArray(currentUUIDs, expectedUUIDs)) {
					continue;
				}

				cleanedInvalidRefs += this.countDeckDiff(currentUUIDs, expectedUUIDs);
				deck.cardUUIDs = [...expectedUUIDs];
				deck.modified = new Date().toISOString();
				await this.plugin.dataStorage.saveDeck(deck);
			}

			if (this.plugin.deckMembershipIndexService) {
				await this.plugin.deckMembershipIndexService.rebuildFromCards(allCards, decks);
			}

			logger.info("[DataConsistency] 修复完成", {
				repairedCards: 0,
				cleanedInvalidRefs,
			});

			return {
				success: true,
				repairedCards: 0,
				cleanedInvalidRefs,
			};
		} catch (error) {
			logger.error("[DataConsistency] 修复失败:", error);
			return {
				success: false,
				repairedCards: 0,
				cleanedInvalidRefs: 0,
				error: error instanceof Error ? error.message : "修复失败",
			};
		}
	}

	async quickCheck(): Promise<boolean> {
		try {
			const result = await this.checkConsistency();
			return result.isConsistent;
		} catch {
			return false;
		}
	}

	private getExpectedDeckIds(card: Card, decks: DeckLookup[]): string[] {
		return Array.from(
			new Set(getCardDeckIds(card, decks, { fallbackToReferences: false }).deckIds.filter(Boolean))
		).sort();
	}

	private buildExpectedDeckMap(cards: Card[], decks: DeckLookup[]): Map<string, string[]> {
		const deckMap = new Map<string, Set<string>>();

		for (const card of cards) {
			if (!card?.uuid) {
				continue;
			}

			const deckIds = this.getExpectedDeckIds(card, decks);
			for (const deckId of deckIds) {
				let uuids = deckMap.get(deckId);
				if (!uuids) {
					uuids = new Set<string>();
					deckMap.set(deckId, uuids);
				}
				uuids.add(card.uuid);
			}
		}

		return new Map(
			Array.from(deckMap.entries()).map(
				([deckId, uuids]) => [deckId, Array.from(uuids).sort()] as const
			)
		);
	}

	private countDeckDiff(currentUUIDs: string[], expectedUUIDs: string[]): number {
		const current = new Set(currentUUIDs);
		const expected = new Set(expectedUUIDs);
		let diff = 0;

		for (const uuid of current) {
			if (!expected.has(uuid)) {
				diff += 1;
			}
		}

		for (const uuid of expected) {
			if (!current.has(uuid)) {
				diff += 1;
			}
		}

		return diff;
	}

	private sameStringArray(left: string[], right: string[]): boolean {
		if (left.length !== right.length) {
			return false;
		}

		for (let index = 0; index < left.length; index += 1) {
			if (left[index] !== right[index]) {
				return false;
			}
		}

		return true;
	}
}

let dataConsistencyServiceInstance: DataConsistencyService | null = null;

export function getDataConsistencyService(plugin?: WeavePlugin): DataConsistencyService {
	if (!dataConsistencyServiceInstance && plugin) {
		dataConsistencyServiceInstance = new DataConsistencyService(plugin);
	}
	if (!dataConsistencyServiceInstance) {
		throw new Error("DataConsistencyService not initialized");
	}
	return dataConsistencyServiceInstance;
}

export function initDataConsistencyService(plugin: WeavePlugin): DataConsistencyService {
	dataConsistencyServiceInstance = new DataConsistencyService(plugin);
	return dataConsistencyServiceInstance;
}
