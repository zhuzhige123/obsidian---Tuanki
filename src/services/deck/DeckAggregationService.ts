import { logger } from "../../utils/logger";
/**
 * 牌组聚合服务
 *
 * 负责分析牌组内卡片的聚合特征，支持多种分组方式
 */

import type { WeaveDataStorage } from "../../data/storage";
import type { Card, Deck } from "../../data/types";
import { getCardTagValues } from "../../utils/tag-utils";
import {
	createDeckTagColumnKey,
	DECK_TAG_EMPTY_GROUP_KEY,
	DECK_TAG_GROUP_OTHER_KEY,
	findMatchingTagInDeckTagGroup,
	normalizeDeckTagName,
	type DeckGroupByType,
	type DeckTagGroup,
} from "../../types/deck-kanban-types";

/**
 * 牌组统计数据接口
 */
interface DeckStats {
	newCards: number;
	learningCards: number;
	reviewCards: number;
	memoryRate: number;
}

/**
 * 牌组聚合服务类
 */
export class DeckAggregationService {
	private storage: WeaveDataStorage;
	private deckCardsCache = new Map<string, Card[]>();
	private cacheTimestamp = 0;
	private readonly CACHE_TTL = 30000; // 30秒缓存有效期
	private deckStats?: Record<string, DeckStats>; //  实时统计数据

	constructor(storage: WeaveDataStorage, deckStats?: Record<string, DeckStats>) {
		this.storage = storage;
		this.deckStats = deckStats;
	}

	/**
	 * 更新统计数据（用于响应式更新）
	 */
	updateDeckStats(deckStats: Record<string, DeckStats>): void {
		this.deckStats = deckStats;
	}

	/**
	 * 获取所有卡片（带缓存）
	 */
	private async getDeckCards(deck: Deck): Promise<Card[]> {
		const now = Date.now();
		const cacheKey = String(deck.id || "").trim();

		if (cacheKey && now - this.cacheTimestamp < this.CACHE_TTL) {
			const cachedCards = this.deckCardsCache.get(cacheKey);
			if (cachedCards) {
				return cachedCards;
			}
		}

		const requestedCardUUIDs = Array.isArray(deck.cardUUIDs)
			? Array.from(new Set(deck.cardUUIDs.map((uuid) => String(uuid || "").trim()).filter(Boolean)))
			: [];

		const deckCards =
			requestedCardUUIDs.length > 0 && typeof this.storage.getCardsByUUIDs === "function"
				? await this.storage.getCardsByUUIDs(requestedCardUUIDs)
				: await this.storage.getCards({ deckId: deck.id });
		if (cacheKey) {
			this.deckCardsCache.set(cacheKey, deckCards);
		}
		this.cacheTimestamp = now;
		return deckCards;
	}

	/**
	 * 获取牌组内卡片的标签值
	 *
	 * @param deck 牌组对象
	 * @returns 标签值数组
	 */
	private async getDeckTagValues(deck: Deck): Promise<string[]> {
		const deckCards = await this.getDeckCards(deck);
		const tagSet = new Set<string>();

		for (const card of deckCards) {
			for (const tag of getCardTagValues(card, deck.purpose === "test" ? "questionBank" : "memory")) {
				const normalizedTag = normalizeDeckTagName(tag);
				if (normalizedTag) {
					tagSet.add(normalizedTag);
				}
			}
		}

		return Array.from(tagSet);
	}

	/**
	 * 清除缓存（在数据更新时调用）
	 */
	public clearCache(): void {
		this.deckCardsCache.clear();
		this.cacheTimestamp = 0;
	}

	/**
	 * 分析牌组的完成情况
	 *
	 * @param deck 牌组对象
	 * @returns 分组key: 'new' | 'learning' | 'review' | 'completed'
	 */
	analyzeCompletion(deck: Deck): string {
		//  优先使用实时统计数据（准确），fallback到deck.stats
		const stats = this.deckStats?.[deck.id] || deck.stats;

		//  优先级：新卡片 > 学习中 > 待复习 > 已完成
		// 只有当今日没有任何需要学习的卡片时，才归类为"已完成"
		if (stats.newCards > 0) {
			return "new";
		} else if (stats.learningCards > 0) {
			return "learning";
		} else if (stats.reviewCards > 0) {
			return "review";
		} else {
			return "completed";
		}
	}

	/**
	 * 分析牌组的时间范围
	 *
	 * @param deck 牌组对象
	 * @returns 分组key: 'urgent' | 'today' | 'thisWeek' | 'future'
	 */
	async analyzeTimeRange(deck: Deck): Promise<string> {
		try {
			const deckCards = await this.getDeckCards(deck);

			if (deckCards.length === 0) {
				return "future";
			}

			// 找出最早到期的卡片
			const now = new Date();
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

			let earliestDue: Date | null = null;

			for (const card of deckCards) {
				//  跳过没有FSRS数据的卡片
				if (!card.fsrs) continue;

				const dueDate = new Date(card.fsrs.due);
				if (!earliestDue || dueDate < earliestDue) {
					earliestDue = dueDate;
				}
			}

			if (!earliestDue) {
				return "future";
			}

			// 判断时间范围
			if (earliestDue < now) {
				return "urgent"; // 已过期
			} else if (earliestDue < new Date(today.getTime() + 24 * 60 * 60 * 1000)) {
				return "today"; // 今天到期
			} else if (earliestDue < weekEnd) {
				return "thisWeek"; // 本周到期
			} else {
				return "future"; // 未来到期
			}
		} catch (error) {
			logger.error("Error analyzing time range:", error);
			return "future";
		}
	}

	/**
	 * 分析牌组的优先级
	 *
	 * @param deck 牌组对象
	 * @returns 分组key: 'high' | 'medium' | 'low' | 'none'
	 */
	async analyzePriority(deck: Deck): Promise<string> {
		try {
			if (deck.metadata?.priority) {
				return deck.metadata.priority as string;
			}

			const deckCards = await this.getDeckCards(deck);

			if (deckCards.length === 0) {
				return "none";
			}

			// 检查是否存在各优先级的卡片
			let hasHigh = false;
			let hasMedium = false;
			let hasLow = false;

			for (const card of deckCards) {
				const priority = card.priority || 0;
				if (priority === 4) hasHigh = true;
				else if (priority === 3) hasMedium = true;
				else if (priority === 2) hasLow = true;
			}

			// 按优先级从高到低返回
			if (hasHigh) return "high";
			if (hasMedium) return "medium";
			if (hasLow) return "low";
			return "none";
		} catch (error) {
			logger.error("Error analyzing priority:", error);
			return "none";
		}
	}

	/**
	 * 分析牌组的标签
	 *
	 * @param deck 牌组对象
	 * @returns 标签名称或'noTag'
	 */
	async analyzeTag(deck: Deck): Promise<string> {
		const firstTag = (await this.getDeckTagValues(deck)).find(Boolean);
		return firstTag ? createDeckTagColumnKey(firstTag) : DECK_TAG_EMPTY_GROUP_KEY;
	}

	/**
	 * 根据标签组分析牌组
	 *
	 * @param deck 牌组对象
	 * @param tagGroup 标签组定义
	 * @returns 匹配的标签名称或'__other__'
	 */
	async analyzeTagGroup(deck: Deck, tagGroup: DeckTagGroup): Promise<string> {
		const matchedTag = findMatchingTagInDeckTagGroup(await this.getDeckTagValues(deck), tagGroup);
		return matchedTag ? createDeckTagColumnKey(matchedTag) : DECK_TAG_GROUP_OTHER_KEY;
	}

	/**
	 * 对牌组列表进行分组
	 *
	 * @param decks 牌组列表
	 * @param groupBy 分组方式
	 * @param tagGroup 标签组（当groupBy为'tagGroup'时必需）
	 * @returns 分组后的牌组对象
	 */
	async groupDecks(
		decks: Deck[],
		groupBy: DeckGroupByType,
		tagGroup?: DeckTagGroup
	): Promise<Record<string, Deck[]>> {
		const grouped: Record<string, Deck[]> = {};

		// 根据分组方式分析每个牌组
		// 对于需要异步操作的分组方式，使用Promise.all并行处理
		if (groupBy === "timeRange" || groupBy === "priority" || groupBy === "tag" || groupBy === "tagGroup") {
			// 并行处理所有牌组
			const results = await Promise.all(
				decks.map(async (deck) => {
					let groupKey: string;

					switch (groupBy) {
						case "timeRange":
							groupKey = await this.analyzeTimeRange(deck);
							break;
						case "priority":
							groupKey = await this.analyzePriority(deck);
							break;
						case "tag":
							groupKey = await this.analyzeTag(deck);
							break;
						case "tagGroup":
							if (!tagGroup) {
								logger.error('tagGroup is required when groupBy is "tagGroup"');
								groupKey = DECK_TAG_GROUP_OTHER_KEY;
							} else {
								groupKey = await this.analyzeTagGroup(deck, tagGroup);
							}
							break;
						default:
							groupKey = "unknown";
					}

					return { deck, groupKey };
				})
			);

			// 组织结果
			for (const { deck, groupKey } of results) {
				if (!grouped[groupKey]) {
					grouped[groupKey] = [];
				}
				grouped[groupKey].push(deck);
			}
		} else {
			// 同步分组方式（completion）
			for (const deck of decks) {
				let groupKey: string;

				switch (groupBy) {
					case "completion":
						groupKey = this.analyzeCompletion(deck);
						break;
					default:
						groupKey = "unknown";
				}

				// 初始化分组数组
				if (!grouped[groupKey]) {
					grouped[groupKey] = [];
				}

				// 将牌组添加到对应分组
				grouped[groupKey].push(deck);
			}
		}

		return grouped;
	}

	/**
	 * 扁平化牌组树
	 *
	 * @param deckTree 牌组树节点数组
	 * @returns 扁平化的牌组列表
	 */
	flattenDeckTree(deckTree: any[]): Deck[] {
		const result: Deck[] = [];

		const flatten = (nodes: any[]) => {
			for (const node of nodes) {
				result.push(node.deck);
				if (node.children && node.children.length > 0) {
					flatten(node.children);
				}
			}
		};

		flatten(deckTree);
		return result;
	}
}
