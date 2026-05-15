/**
 * 卡片元数据服务 - UI 适配层
 *
 * 为 UI 组件提供统一的元数据访问接口
 * 封装 CardMetadataCache 并提供便捷的统计计算方法
 *
 * @module services/CardMetadataService
 * @version 1.0.0
 * @see YAML属性栏卡片元数据方案.md
 */

import type { Card, Deck } from "../data/types";
import { getCardDeckIds as resolveCardDeckIds } from "../utils/yaml-utils";
import { getCardMetadataCache } from "./CardMetadataCache";
import { getDeckNameMapper } from "./DeckNameMapper";

// ===== 类型定义 =====

/**
 * 牌组统计信息
 */
export interface DeckStats {
	id: string;
	name: string;
	count: number;
}

/**
 * 标签统计信息
 */
export interface TagStats {
	name: string;
	count: number;
}

/**
 * 卡片类型统计
 */
export interface TypeStats {
	[type: string]: number;
}

export interface CardDeckLookupOptions {
	/**
	 * 是否允许回退到运行时兼容字段。
	 * 默认 true；当业务要求“以卡片内容 YAML 为准”时应显式传 false。
	 */
	fallbackToReferences?: boolean;
}

// ===== 服务实现 =====

/**
 * 卡片元数据服务
 *
 * 提供：
 * 1. 统一的元数据访问接口
 * 2. 统计数据计算
 * 3. 向后兼容的字段访问
 */
export class CardMetadataService {
	private static instance: CardMetadataService | null = null;

	private constructor() {}

	static getInstance(): CardMetadataService {
		if (!CardMetadataService.instance) {
			CardMetadataService.instance = new CardMetadataService();
		}
		return CardMetadataService.instance;
	}

	// ===== 元数据访问 =====

	/**
	 * 获取卡片的牌组ID列表
	 * 兼容新旧两种数据格式
	 * @param card 卡片对象
	 * @param options 控制是否允许回退到兼容字段
	 * @returns 牌组ID数组
	 */
	getCardDeckIds(card: Card, options: CardDeckLookupOptions = {}): string[] {
		let mapper: ReturnType<typeof getDeckNameMapper> | null = null;

		try {
			mapper = getDeckNameMapper();
		} catch {
			mapper = null;
		}
		const allDecks = mapper?.getAllDecks();

		return resolveCardDeckIds(card, allDecks, {
			fallbackToReferences: options.fallbackToReferences,
		}).deckIds;
	}

	/**
	 * 获取卡片的牌组名称列表
	 * @param card 卡片对象
	 * @param options 控制是否允许回退到兼容字段
	 * @returns 牌组名称数组
	 */
	getCardDeckNames(card: Card, options: CardDeckLookupOptions = {}): string[] {
		const deckIds = this.getCardDeckIds(card, options);
		try {
			const mapper = getDeckNameMapper();
			const deckNames = mapper.getDeckNamesByIds(deckIds);
			if (deckNames.length > 0) {
				return deckNames;
			}
		} catch {
			// 继续回退到缓存里的显示名称
		}

		try {
			const cache = getCardMetadataCache();
			const metadata = cache.getMetadata(card);
			if (metadata.decks.length > 0) {
				return metadata.decks;
			}
		} catch {
			// 忽略缓存异常
		}

		return deckIds;
	}

	/**
	 * 获取卡片的标签列表
	 * 兼容新旧两种数据格式
	 * @param card 卡片对象
	 * @returns 标签数组
	 */
	getCardTags(card: Card): string[] {
		// 1. 优先从缓存获取（新格式：YAML + 正文）
		try {
			const cache = getCardMetadataCache();
			const metadata = cache.getMetadata(card);
			if (metadata.tags.length > 0) {
				return metadata.tags;
			}
		} catch {
			// 继续使用旧格式
		}

		// 2. 回退到旧格式字段
		return card.tags || [];
	}

	/**
	 * 获取卡片的类型
	 * @param card 卡片对象
	 * @returns 卡片类型
	 */
	getCardType(card: Card): string {
		// 1. 优先从缓存获取
		try {
			const cache = getCardMetadataCache();
			const metadata = cache.getMetadata(card);
			if (metadata.type) {
				return metadata.type;
			}
		} catch {
			// 继续使用旧格式
		}

		// 2. 回退到旧格式字段
		return card.type || "basic";
	}

	/**
	 * 获取卡片的优先级
	 * @param card 卡片对象
	 * @returns 优先级
	 */
	getCardPriority(card: Card): number | undefined {
		// 1. 优先从缓存获取
		try {
			const cache = getCardMetadataCache();
			const metadata = cache.getMetadata(card);
			if (metadata.priority !== undefined) {
				return metadata.priority;
			}
		} catch {
			// 继续使用旧格式
		}

		// 2. 回退到旧格式字段
		return card.priority;
	}

	/**
	 * 获取卡片的来源文档
	 * @param card 卡片对象
	 * @returns 来源文档路径
	 */
	getCardSource(card: Card): string | undefined {
		// 1. 优先从缓存获取
		try {
			const cache = getCardMetadataCache();
			const metadata = cache.getMetadata(card);
			if (metadata.source) {
				// 解析 wikilink 格式
				const match = metadata.source.match(/\[\[(.+?)\]\]/);
				return match ? match[1] : metadata.source;
			}
		} catch {
			// 继续使用旧格式
		}

		// 2. 回退到旧格式字段
		return card.sourceFile;
	}

	/**
	 * 检查卡片是否为孤儿卡片
	 * @param card 卡片对象
	 * @returns 是否为孤儿
	 */
	isOrphanCard(card: Card): boolean {
		const deckIds = this.getCardDeckIds(card);
		return deckIds.length === 0;
	}

	// ===== 统计计算 =====

	/**
	 * 计算牌组统计
	 * @param cards 卡片数组
	 * @param allDecks 所有牌组
	 * @returns 牌组统计数组
	 */
	computeDeckStats(cards: Card[], allDecks: Deck[]): DeckStats[] {
		const deckCounts = new Map<string, number>();
		for (const card of cards) {
			const cardDeckIds = this.getCardDeckIds(card, { fallbackToReferences: false });
			for (const deckId of cardDeckIds) {
				if (allDecks.some((deck) => deck.id === deckId)) {
					deckCounts.set(deckId, (deckCounts.get(deckId) || 0) + 1);
				}
			}
		}

		// 转换为结果数组
		const result: DeckStats[] = [];
		for (const [id, count] of deckCounts) {
			const deck = allDecks.find((d) => d.id === id);
			if (deck) {
				result.push({
					id,
					name: deck.name,
					count,
				});
			}
		}

		return result.sort((a, b) => b.count - a.count);
	}

	/**
	 * 计算标签统计
	 * @param cards 卡片数组
	 * @returns 标签统计数组
	 */
	computeTagStats(cards: Card[]): TagStats[] {
		const tagCounts = new Map<string, number>();

		for (const card of cards) {
			const tags = this.getCardTags(card);
			for (const tag of tags) {
				tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
			}
		}

		const result: TagStats[] = [];
		for (const [name, count] of tagCounts) {
			result.push({ name, count });
		}

		return result.sort((a, b) => b.count - a.count);
	}

	/**
	 * 计算类型统计
	 * @param cards 卡片数组
	 * @returns 类型统计对象
	 */
	computeTypeStats(cards: Card[]): TypeStats {
		const stats: TypeStats = {};

		for (const card of cards) {
			const type = this.getCardType(card);
			stats[type] = (stats[type] || 0) + 1;
		}

		return stats;
	}

	/**
	 * 筛选孤儿卡片
	 * @param cards 卡片数组
	 * @returns 孤儿卡片数组
	 */
	filterOrphanCards(cards: Card[]): Card[] {
		return cards.filter((card) => this.isOrphanCard(card));
	}

	/**
	 * 按牌组筛选卡片
	 * @param cards 卡片数组
	 * @param deckId 牌组ID
	 * @param _deck 保留参数位，兼容旧调用方
	 * @returns 筛选后的卡片
	 */
	filterByDeck(cards: Card[], deckId: string, _deck?: Deck): Card[] {
		return cards.filter((_card) => {
			const deckIds = this.getCardDeckIds(_card, { fallbackToReferences: false });
			return deckIds.includes(deckId);
		});
	}

	/**
	 * 按标签筛选卡片
	 * @param cards 卡片数组
	 * @param tag 标签
	 * @returns 筛选后的卡片
	 */
	filterByTag(cards: Card[], tag: string): Card[] {
		return cards.filter((_card) => {
			const tags = this.getCardTags(_card);
			return tags.includes(tag);
		});
	}

	/**
	 * 按优先级筛选卡片
	 * @param cards 卡片数组
	 * @param priority 优先级
	 * @returns 筛选后的卡片
	 */
	filterByPriority(cards: Card[], priority: number): Card[] {
		return cards.filter((_card) => {
			return this.getCardPriority(_card) === priority;
		});
	}

	// ===== 缓存管理 =====

	/**
	 * 使卡片缓存失效
	 * @param cardUUID 卡片UUID
	 */
	invalidateCard(cardUUID: string): void {
		try {
			const cache = getCardMetadataCache();
			cache.invalidate(cardUUID);
		} catch {
			// 缓存未初始化
		}
	}

	/**
	 * 清除所有缓存
	 */
	clearCache(): void {
		try {
			const cache = getCardMetadataCache();
			cache.clear();
		} catch {
			// 缓存未初始化
		}
	}

}

// ===== 单例导出 =====

/**
 * 获取卡片元数据服务实例
 */
export function getCardMetadataService(): CardMetadataService {
	return CardMetadataService.getInstance();
}

// ===== 便捷函数导出 =====

/**
 * 获取卡片的牌组名称（便捷函数）
 * @param card 卡片对象
 * @returns 牌组名称字符串（逗号分隔）
 */
export function getCardDeckNamesString(card: Card): string {
	const service = getCardMetadataService();
	return service.getCardDeckNames(card).join(", ");
}

/**
 * 获取卡片的标签（便捷函数）
 * @param card 卡片对象
 * @returns 标签数组
 */
export function getCardTagsFromMetadata(card: Card): string[] {
	const service = getCardMetadataService();
	return service.getCardTags(card);
}
