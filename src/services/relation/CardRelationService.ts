import { logger } from "../../utils/logger";
/**
 * 卡片关系服务
 * 管理父子卡片关系、子卡片创建和保存
 */

import type { WeaveDataStorage } from "../../data/storage";
import type { Card, Deck } from "../../data/types";
import { generateId } from "../../utils/helpers";
import { getCardDeckIds } from "../../utils/yaml-utils";
import { generateCardUUID } from "../identifier/WeaveIDGenerator";
import type { CardRelationMetadata, ChildCardData } from "./types";
import { DerivationMethod } from "./types";

export class CardRelationService {
	constructor(private dataStorage: WeaveDataStorage) {}

	/**
	 * 批量创建子卡片
	 * @param parentCard 父卡片
	 * @param childCardsData 子卡片数据数组
	 * @param method 派生方法
	 * @returns 创建的子卡片数组
	 */
	async createChildCards(
		parentCard: Card,
		childCardsData: ChildCardData[],
		method: DerivationMethod = DerivationMethod.AI_SPLIT
	): Promise<Card[]> {
		const now = new Date().toISOString();
		const allDecks = await this.dataStorage.getAllDecks();
		const childCards: Card[] = [];

		for (let i = 0; i < childCardsData.length; i++) {
			const data = childCardsData[i];

			const childCard: Card = {
				uuid: generateCardUUID(), // 使用正确的UUID生成函数
				// 优先从 content YAML 的 we_decks 获取父卡片牌组 ID
				deckId: getCardDeckIds(parentCard, allDecks).primaryDeckId || parentCard.deckId, // 临时设置为父卡片牌组，后续会移到子牌组
				templateId: parentCard.templateId,
				type: parentCard.type,
				content: data.content,
				fields: data.fields || {},
				tags: data.tags || parentCard.tags || [],
				sourceFile: parentCard.sourceFile,
				sourceBlock: parentCard.sourceBlock,
				sourceRange: parentCard.sourceRange,
				priority: data.priority || parentCard.priority || 0,
				fsrs: {
					due: now,
					stability: 0,
					difficulty: 0,
					elapsedDays: 0,
					scheduledDays: 0,
					reps: 0,
					lapses: 0,
					state: 0, // CardState.New
					retrievability: 0,
				},
				reviewHistory: [],
				stats: {
					totalReviews: 0,
					totalTime: 0,
					averageTime: 0,
					memoryRate: 0,
				},
				created: now,
				modified: now,

				// 父子关系元数据
				parentCardId: parentCard.uuid, // 使用UUID而非ID
				relationMetadata: {
					isParent: false,
					level: 1,
					siblingIndex: i,
					derivationMetadata: {
						method,
						splitTimestamp: now,
						originalContentHash: this.hashContent(parentCard.content),
					},
					learningStrategy: {
						requireParentMastery: false,
						reviewTogether: false,
						inheritTags: true,
					},
					relationStatus: {
						isSynced: true,
						lastSyncCheck: now,
					},
				},
			};

			childCards.push(childCard);
		}

		// 更新父卡片的关系元数据
		if (!parentCard.relationMetadata) {
			parentCard.relationMetadata = {
				isParent: true,
				childCardIds: [],
				level: 0,
			};
		}

		parentCard.relationMetadata.isParent = true;
		parentCard.relationMetadata.childCardIds = childCards.map((c) => c.uuid);

		return childCards;
	}

	/**
	 * 获取或创建子牌组
	 * @param parentDeck 父牌组
	 * @returns 子牌组
	 */
	async getOrCreateChildDeck(parentDeck: Deck): Promise<Deck> {
		// 查找配对的子牌组
		const allDecks = await this.dataStorage.getAllDecks();

		// 检查是否已有配对的子牌组
		if (parentDeck.metadata?.pairedChildDeck) {
			const existingChildDeck = allDecks.find((d) => d.id === parentDeck.metadata?.pairedChildDeck);
			if (existingChildDeck) {
				return existingChildDeck;
			}
		}

		// 创建新的子牌组
		const childDeckName = `${parentDeck.name} - 子卡片`;
		const childDeckId = generateId();
		const childDeck = {
			id: childDeckId,
			name: childDeckName,
			description: `${parentDeck.name}的子卡片牌组`,
			category: "",
			path: childDeckName,
			level: 0,
			order: 0,
			metadata: {
				pairedParentDeck: parentDeck.id,
				deckType: "child",
			},
		} as unknown as Deck;

		// 保存子牌组
		await this.dataStorage.saveDeck(childDeck);

		// 更新父牌组的配对信息
		parentDeck.metadata = parentDeck.metadata || {};
		parentDeck.metadata.pairedChildDeck = childDeckId;
		await this.dataStorage.saveDeck(parentDeck);

		return childDeck;
	}

	/**
	 * 将子卡片保存到子牌组
	 * @param childCards 子卡片数组
	 * @param parentCard 父卡片
	 * @returns 保存成功的卡片数量
	 */
	async saveChildCardsToDeck(childCards: Card[], parentCard: Card): Promise<number> {
		// 获取父卡片所在的牌组
		const allDecks = await this.dataStorage.getAllDecks();
		const parentDeck = allDecks.find((d) => d.id === parentCard.deckId);

		if (!parentDeck) {
			throw new Error("找不到父卡片所在的牌组");
		}

		// 获取或创建子牌组
		const childDeck = await this.getOrCreateChildDeck(parentDeck);

		// 更新子卡片的牌组ID
		for (const childCard of childCards) {
			childCard.deckId = childDeck.id;
		}

		// 批量保存子卡片（逐个保存，因为 dataStorage 没有 saveCards 方法）
		for (const childCard of childCards) {
			await this.dataStorage.saveCard(childCard);
		}

		// 更新父卡片（保存关系元数据）
		await this.dataStorage.saveCard(parentCard);

		return childCards.length;
	}

	/**
	 * 获取父卡片的所有子卡片
	 * @param parentCardId 父卡片ID（使用uuid）
	 * @returns 子卡片数组
	 */
	async getChildCards(parentCardId: string): Promise<Card[]> {
		const parentCard =
			typeof (this.dataStorage as any).getCardByUUID === "function"
				? await (this.dataStorage as any).getCardByUUID(parentCardId)
				: null;
		const childCardIds = Array.isArray(parentCard?.relationMetadata?.childCardIds)
			? parentCard.relationMetadata.childCardIds.filter(Boolean)
			: [];

		let childCards: Card[] = [];
		if (childCardIds.length > 0 && typeof (this.dataStorage as any).getCardsByUUIDs === "function") {
			childCards = (await (this.dataStorage as any).getCardsByUUIDs(childCardIds)).filter(
				(card: Card) => card?.parentCardId === parentCardId
			);
		} else {
			const allCards = await this.dataStorage.getAllCards();

			// 根据parentCardId筛选子卡片
			childCards = allCards.filter((card) => card.parentCardId === parentCardId);
		}

		logger.debug(
			`[CardRelationService] 找到${childCards.length}张子卡片（父卡片: ${parentCardId.slice(
				0,
				8
			)}...）`
		);

		return childCards;
	}

	/**
	 * 更新子卡片
	 * @param childCard 子卡片
	 * @returns 更新后的卡片
	 */
	async updateChildCard(childCard: Card): Promise<Card> {
		childCard.modified = new Date().toISOString();
		await this.dataStorage.saveCard(childCard);

		logger.debug(`[CardRelationService] 更新子卡片: ${childCard.uuid}`);

		return childCard;
	}

	/**
	 * 计算内容哈希（简单实现）
	 */
	private hashContent(content: string): string {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return hash.toString(36);
	}
}
