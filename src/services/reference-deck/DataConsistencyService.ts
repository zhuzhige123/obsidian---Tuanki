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
import { fixWeDecksIdToName } from "../data-migration/CardYAMLMigrationService";
import { sanitizeCardWeDecksToKnownDecks } from "../../utils/card-we-decks-membership";
import { logger } from "../../utils/logger";
import { readUnknownString } from "../../utils/dynamic-access";
import { getCardDeckIdsFromFormalSource, setCardProperties } from "../../utils/yaml-utils";

export interface RepairResult {
	success: boolean;
	repairedCards: number;
	cleanedInvalidRefs: number;
	error?: string;
}

type DeckLookup = Pick<Deck, "id" | "name" | "purpose">;

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
			let allCards = await this.plugin.dataStorage.getCards();
			const repairedIdToNameCards = await this.repairWeDecksIdToName(allCards, decks);
			if (repairedIdToNameCards.length > 0) {
				await this.persistBackfilledCards(repairedIdToNameCards);
				allCards = await this.plugin.dataStorage.getCards();
			}

			const sanitizedWeDecksCards = await this.repairUnknownWeDecksReferences(allCards, decks);
			if (sanitizedWeDecksCards.length > 0) {
				await this.persistBackfilledCards(sanitizedWeDecksCards);
				allCards = await this.plugin.dataStorage.getCards();
			}

			const backfilledCards = await this.backfillMissingFormalDeckAttribution(allCards, decks);
			if (backfilledCards.length > 0) {
				await this.persistBackfilledCards(backfilledCards);
				allCards = await this.plugin.dataStorage.getCards();
			}

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

			if (this.plugin.studyDueIndexService) {
				await this.plugin.studyDueIndexService.rebuildFromCards(allCards, decks);
			} else if (this.plugin.deckMembershipIndexService) {
				await this.plugin.deckMembershipIndexService.rebuildFromCards(allCards, decks);
			}

			if (this.plugin.wdeckService) {
				await this.reconcileWDeckCardPlacement(allCards, decks);
			}

			logger.info("[DataConsistency] 修复完成", {
				repairedCards: repairedIdToNameCards.length + backfilledCards.length,
				cleanedInvalidRefs,
			});

			return {
				success: true,
				repairedCards: repairedIdToNameCards.length + backfilledCards.length,
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
			new Set(getCardDeckIdsFromFormalSource(card, decks).deckIds.filter(Boolean))
		).sort();
	}

	/**
	 * 为物理上已写入 .wdeck、但 YAML 缺少 we_decks 的卡片补写正式归属。
	 *
	 * 这是 WDeck 迁移/批量导入后的常见缺口：卡片落在牌组文件里，却没有 content YAML 真值，
	 * 导致“牌组缓存一致性”修复只能清空缓存，却无法建立可收敛的正式归属。
	 */
	private async repairWeDecksIdToName(cards: Card[], decks: DeckLookup[]): Promise<Card[]> {
		const repaired: Card[] = [];

		for (const card of cards) {
			if (!card?.uuid) {
				continue;
			}

			const { card: nextCard, fixed } = fixWeDecksIdToName(card, decks);
			if (fixed && nextCard.content !== card.content) {
				repaired.push(nextCard);
			}
		}

		if (repaired.length > 0) {
			logger.info(`[DataConsistency] 修复 we_decks 中的牌组ID: ${repaired.length} 张`);
		}

		return repaired;
	}

	private async repairUnknownWeDecksReferences(cards: Card[], decks: DeckLookup[]): Promise<Card[]> {
		const repaired: Card[] = [];

		for (const card of cards) {
			if (!card?.uuid) {
				continue;
			}

			const { card: nextCard, changed, invalidValues } = sanitizeCardWeDecksToKnownDecks(
				card,
				decks
			);
			if (!changed || nextCard.content === card.content) {
				continue;
			}

			if (invalidValues.length > 0) {
				logger.info(
					`[DataConsistency] 清除失效 we_decks 引用: ${card.uuid} -> ${invalidValues.join(", ")}`
				);
			}
			repaired.push(nextCard);
		}

		if (repaired.length > 0) {
			logger.info(`[DataConsistency] 清理失效 we_decks: ${repaired.length} 张`);
		}

		return repaired;
	}

	private async backfillMissingFormalDeckAttribution(
		cards: Card[],
		decks: DeckLookup[]
	): Promise<Card[]> {
		const physicalDeckNameByUUID = await this.buildPhysicalDeckNameByUUID();
		const backfilled: Card[] = [];

		for (const card of cards) {
			if (!card?.uuid) {
				continue;
			}

			if (this.getExpectedDeckIds(card, decks).length > 0) {
				continue;
			}

			const deckName = this.resolvePhysicalDeckName(card, physicalDeckNameByUUID);
			if (!deckName) {
				continue;
			}

			const nextContent = setCardProperties(card.content || "", { we_decks: [deckName] });
			if (nextContent === (card.content || "")) {
				continue;
			}

			backfilled.push({
				...card,
				content: nextContent,
				modified: new Date().toISOString(),
			});
		}

		if (backfilled.length > 0) {
			logger.info(`[DataConsistency] 补写缺失 we_decks: ${backfilled.length} 张`);
		}

		return backfilled;
	}

	private resolvePhysicalDeckName(
		card: Card,
		physicalDeckNameByUUID: Map<string, string>
	): string | undefined {
		const marker = (card.customFields as Record<string, unknown> | undefined)?.wdeck;
		if (marker && typeof marker === "object") {
			const logicalDeckName = (readUnknownString(marker, "logicalDeckName") ?? "").trim();
			if (logicalDeckName) {
				return logicalDeckName;
			}
		}

		return physicalDeckNameByUUID.get(card.uuid);
	}

	private async buildPhysicalDeckNameByUUID(): Promise<Map<string, string>> {
		const physicalDeckNameByUUID = new Map<string, string>();
		if (!this.plugin.wdeckService?.getAllDeckSummaries) {
			return physicalDeckNameByUUID;
		}

		try {
			const summaries = await this.plugin.wdeckService.getAllDeckSummaries();
			for (const summary of summaries) {
				const deckName = String(summary.logicalDeckName || "").trim();
				if (!deckName) {
					continue;
				}
				for (const uuid of summary.cardUUIDs || []) {
					if (uuid) {
						physicalDeckNameByUUID.set(uuid, deckName);
					}
				}
			}
		} catch (error) {
			logger.warn("[DataConsistency] 读取 WDeck 物理归属失败，跳过 we_decks 补写:", error);
		}

		return physicalDeckNameByUUID;
	}

	private async persistBackfilledCards(cards: Card[]): Promise<void> {
		if (cards.length === 0) {
			return;
		}

		if (typeof this.plugin.dataStorage.saveCardsBatch === "function") {
			await this.plugin.dataStorage.saveCardsBatch(cards);
			return;
		}

		for (const card of cards) {
			await this.plugin.dataStorage.saveCard(card);
		}
	}

	private async reconcileWDeckCardPlacement(cards: Card[], decks: DeckLookup[]): Promise<void> {
		const deckById = new Map(decks.map((deck) => [deck.id, deck] as const));
		const groups = new Map<string, Card[]>();

		for (const card of cards) {
			if (!card?.uuid) {
				continue;
			}

			const { primaryDeckId, deckIds } = getCardDeckIdsFromFormalSource(card, decks);
			const targetDeckId = primaryDeckId || deckIds[0];
			if (!targetDeckId) {
				continue;
			}

			const targetDeck = deckById.get(targetDeckId);
			if (!targetDeck || targetDeck.purpose === "test") {
				continue;
			}

			const bucket = groups.get(targetDeckId) || [];
			bucket.push(card);
			groups.set(targetDeckId, bucket);
		}

		for (const [deckId, bucketCards] of groups.entries()) {
			const deck = deckById.get(deckId);
			if (!deck) {
				continue;
			}

			await this.plugin.wdeckService.replaceDeckCardsForDeck(
				{ id: deck.id, name: deck.name },
				bucketCards
			);
		}
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
