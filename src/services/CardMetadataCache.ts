/**
 * 卡片元数据缓存服务（渐进式缓存架构）
 *
 * 提供从 card.content YAML frontmatter 解析的元数据的运行时缓存
 * 用于筛选和搜索性能优化
 *
 * 🔧 v2.3: 渐进式缓存优化
 * - 懒加载：启动时不预热，首次访问时按需解析
 * - LRU 淘汰：设置缓存上限，淘汰最久未访问的条目
 * - 平台感知：桌面端和移动端使用差异化配置
 * - 后台预热：异步预热热门牌组，不阻塞主线程
 *
 * @module services/CardMetadataCache
 * @version 2.0.0
 * @see YAML属性栏卡片元数据方案.md
 * @see 渐进式缓存优化需求文档.md
 */

import { Platform } from "obsidian";
import type { Card } from "../data/types";
import type { CardType } from "../data/types";
import { logger } from "../utils/logger";
import {
	type CardYAMLDifficulty,
	type CardYAMLMetadata,
	type CardYAMLType,
	extractAllTags,
	getCardDeckIds,
	getCardMetadata,
} from "../utils/yaml-utils";
import { keepSingleMemoryFormalDeck } from "../utils/memory-deck-membership";
import { TagExtractor } from "../utils/tag-extractor";
import { getDeckNameMapper } from "./DeckNameMapper";

// ===== 平台感知配置 =====

/**
 * 渐进式缓存配置接口
 */
export interface ProgressiveCacheConfig {
	/** 缓存条目上限 */
	maxSize: number;
	/** 后台预热批次大小 */
	prefetchBatchSize: number;
	/** 预热间隔（毫秒） */
	prefetchIntervalMs: number;
	/** 是否启用热门牌组预热 */
	enableHotDeckPrefetch: boolean;
}

/**
 * 平台配置常量
 */
const CACHE_CONFIG = {
	desktop: {
		maxSize: 5000,
		prefetchBatchSize: 100,
		prefetchIntervalMs: 50,
		enableHotDeckPrefetch: true,
	},
	mobile: {
		maxSize: 2000,
		prefetchBatchSize: 50,
		prefetchIntervalMs: 150,
		enableHotDeckPrefetch: true,
	},
};

/**
 * 获取当前平台的缓存配置
 */
function getPlatformConfig(): ProgressiveCacheConfig {
	try {
		return Platform.isMobile ? CACHE_CONFIG.mobile : CACHE_CONFIG.desktop;
	} catch {
		// Platform 不可用时使用桌面端配置
		return CACHE_CONFIG.desktop;
	}
}

// ===== 类型定义 =====

/**
 * 解析后的卡片元数据
 * 用于筛选和搜索
 */
export interface ParsedCardMetadata {
	/** 来源文档 */
	source?: string;
	/** 块链接 */
	block?: string;
	/** 牌组名称列表 */
	decks: string[];
	/** 牌组 ID 列表（映射后） */
	deckIds: string[];
	/** 卡片类型 */
	type: CardType | CardYAMLType;
	/** 优先级 */
	priority?: number;
	/** 题目难度 */
	difficulty?: CardYAMLDifficulty;
	/** 标签列表（合并 YAML + 正文） */
	tags: string[];
	/** 创建日期（从 YAML） */
	created?: string;
}

/**
 * 缓存条目（带 LRU 追踪）
 */
interface CacheEntry {
	/** 解析后的元数据 */
	metadata: ParsedCardMetadata;
	/** 最后访问时间戳 */
	lastAccess: number;
	/** 访问次数 */
	accessCount: number;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
	/** 缓存条目数 */
	size: number;
	/** 缓存上限 */
	maxSize: number;
	/** 缓存命中次数 */
	hits: number;
	/** 缓存未命中次数 */
	misses: number;
	/** 命中率 */
	hitRate: number;
	/** 最后更新时间 */
	lastUpdated: number;
	/** LRU 淘汰次数 */
	evictions: number;
}

// ===== 缓存服务实现 =====

/**
 * 卡片元数据缓存服务（渐进式缓存架构）
 *
 * 功能：
 * 1. 懒加载：首次访问时按需解析并缓存
 * 2. LRU 淘汰：缓存达到上限时淘汰最久未访问的条目
 * 3. 平台感知：桌面端和移动端使用差异化配置
 * 4. 后台预热：异步预热热门牌组，不阻塞主线程
 */
export class CardMetadataCache {
	/** 元数据缓存：cardUUID -> CacheEntry（带 LRU 追踪） */
	private cache: Map<string, CacheEntry> = new Map();

	/** 平台感知配置 */
	public readonly config: ProgressiveCacheConfig;

	/** 统计信息 */
	private stats = {
		hits: 0,
		misses: 0,
		evictions: 0,
		lastUpdated: 0,
	};

	/** 后台预热状态 */
	private prefetchState = {
		isRunning: false,
		queue: [] as Card[],
		abortController: null as AbortController | null,
	};

	constructor() {
		this.config = getPlatformConfig();
		logger.debug(
			`[CardMetadataCache] 缓存服务已创建 (平台: ${
				Platform.isMobile ? "移动端" : "桌面端"
			}, 上限: ${this.config.maxSize})`
		);
	}

	// ===== 核心方法 =====

	/*
	 * 获取卡片元数据（懒加载 + LRU）
	 * 首次访问时解析 YAML，后续直接返回缓存
	 * @param card 卡片对象
	 * @returns 解析后的元数据
	 */
	getMetadata(card: Card): ParsedCardMetadata {
		const cached = this.cache.get(card.uuid);

		if (cached) {
			// 更新 LRU 追踪信息
			cached.lastAccess = Date.now();
			cached.accessCount++;
			this.stats.hits++;
			return cached.metadata;
		}

		// 首次访问：解析并缓存（带 LRU 淘汰）
		this.stats.misses++;
		const parsed = this.parseCardMetadata(card.content);
		this.setWithEviction(card.uuid, parsed);

		return parsed;
	}

	/**
	 * 设置缓存条目（带 LRU 淘汰）
	 * @param uuid 卡片 UUID
	 * @param metadata 解析后的元数据
	 */
	private setWithEviction(uuid: string, metadata: ParsedCardMetadata): void {
		// 检查是否需要淘汰
		if (this.cache.size >= this.config.maxSize) {
			this.evictLRU();
		}

		this.cache.set(uuid, {
			metadata,
			lastAccess: Date.now(),
			accessCount: 1,
		});
		this.stats.lastUpdated = Date.now();
	}

	/**
	 * LRU 淘汰：移除最久未访问的条目
	 */
	private evictLRU(): void {
		let oldestKey: string | null = null;
		let oldestTime = Infinity;

		for (const [key, entry] of this.cache) {
			if (entry.lastAccess < oldestTime) {
				oldestTime = entry.lastAccess;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.cache.delete(oldestKey);
			this.stats.evictions++;
		}
	}

	/**
	 * 批量获取多张卡片的元数据
	 * @param cards 卡片数组
	 * @returns Map<cardUUID, ParsedCardMetadata>
	 */
	getMetadataBatch(cards: Card[]): Map<string, ParsedCardMetadata> {
		const result = new Map<string, ParsedCardMetadata>();

		for (const card of cards) {
			result.set(card.uuid, this.getMetadata(card));
		}

		return result;
	}

	/**
	 * 解析卡片元数据
	 * @param content 卡片内容
	 * @returns 解析后的元数据
	 */
	private parseCardMetadata(content: string): ParsedCardMetadata {
		try {
			const yamlMetadata = getCardMetadata(content);
			const allTags = extractAllTags(content);

			const rawDeckValues = (yamlMetadata.we_decks || [])
				.map((value) => String(value || "").trim())
				.filter(Boolean);
			let allDecks: ReturnType<ReturnType<typeof getDeckNameMapper>["getAllDecks"]> | undefined;
			try {
				allDecks = getDeckNameMapper().getAllDecks();
			} catch {
				allDecks = undefined;
			}
			const normalizedDeckEntries = keepSingleMemoryFormalDeck(rawDeckValues, allDecks);
			const deckIds = normalizedDeckEntries.map((entry) => entry.deckId);
			const normalizedDeckNames = normalizedDeckEntries.map((entry) => entry.deckName);

			// 处理 we_source 可能是数组的情况
			const sourceValue = Array.isArray(yamlMetadata.we_source)
				? yamlMetadata.we_source.find(
						(value): value is string => typeof value === "string" && value.trim().length > 0
				  )
				: yamlMetadata.we_source;

			return {
				source: sourceValue,
				block: yamlMetadata.we_block,
				decks: normalizedDeckNames,
				deckIds,
				type: yamlMetadata.we_type || "basic",
				priority: yamlMetadata.we_priority,
				difficulty: yamlMetadata.we_difficulty,
				tags: allTags,
				created: yamlMetadata.created,
			};
		} catch (error) {
			logger.warn("[CardMetadataCache] YAML 解析失败，使用默认值:", error);

			// 解析失败时返回默认值
			return {
				decks: [],
				deckIds: [],
				type: "basic",
				tags: TagExtractor.extractTagsExcludingCode(content),
			};
		}
	}

	// ===== 缓存失效方法 =====

	/**
	 * 使单张卡片的缓存失效
	 * @param cardUUID 卡片 UUID
	 */
	invalidate(cardUUID: string): void {
		const deleted = this.cache.delete(cardUUID);
		if (deleted) {
			logger.debug(`[CardMetadataCache] 缓存已失效: ${cardUUID.substring(0, 8)}...`);
		}
	}

	/**
	 * 批量使多张卡片的缓存失效
	 * @param cardUUIDs 卡片 UUID 数组
	 */
	invalidateBatch(cardUUIDs: string[]): void {
		for (const uuid of cardUUIDs) {
			this.cache.delete(uuid);
		}
		logger.debug(`[CardMetadataCache] 批量缓存失效: ${cardUUIDs.length} 张卡片`);
	}

	/**
	 * 清除所有缓存
	 * 用于牌组重命名、牌组删除等全局变更
	 */
	clear(): void {
		const size = this.cache.size;
		this.cache.clear();
		this.stats.hits = 0;
		this.stats.misses = 0;
		this.stats.lastUpdated = Date.now();
		logger.info(`[CardMetadataCache] 缓存已清除: ${size} 条记录`);
	}

	// ===== 筛选辅助方法 =====

	/**
	 * 筛选属于指定牌组的卡片
	 * @param cards 卡片数组
	 * @param deckId 牌组 ID
	 * @returns 筛选后的卡片数组
	 */
	filterByDeck(cards: Card[], deckId: string): Card[] {
		return cards.filter((_card) => {
			return getCardDeckIds(_card, undefined, { fallbackToReferences: false }).deckIds.includes(deckId);
		});
	}

	/**
	 * 筛选包含指定标签的卡片
	 * @param cards 卡片数组
	 * @param tag 标签
	 * @returns 筛选后的卡片数组
	 */
	filterByTag(cards: Card[], tag: string): Card[] {
		return cards.filter((_card) => {
			const metadata = this.getMetadata(_card);
			return metadata.tags.includes(tag);
		});
	}

	/**
	 * 筛选指定类型的卡片
	 * @param cards 卡片数组
	 * @param type 卡片类型
	 * @returns 筛选后的卡片数组
	 */
	filterByType(cards: Card[], type: string): Card[] {
		return cards.filter((_card) => {
			const metadata = this.getMetadata(_card);
			return metadata.type === type;
		});
	}

	/**
	 * 筛选指定难度的卡片
	 * @param cards 卡片数组
	 * @param difficulty 难度
	 * @returns 筛选后的卡片数组
	 */
	filterByDifficulty(cards: Card[], difficulty: CardYAMLDifficulty): Card[] {
		return cards.filter((_card) => {
			const metadata = this.getMetadata(_card);
			return metadata.difficulty === difficulty;
		});
	}

	/**
	 * 筛选指定优先级的卡片
	 * @param cards 卡片数组
	 * @param priority 优先级
	 * @returns 筛选后的卡片数组
	 */
	filterByPriority(cards: Card[], priority: number): Card[] {
		return cards.filter((_card) => {
			const metadata = this.getMetadata(_card);
			return metadata.priority === priority;
		});
	}

	// ===== 聚合方法 =====

	/**
	 * 获取所有唯一标签及其计数
	 * @param cards 卡片数组
	 * @returns Map<标签, 计数>
	 */
	getTagCounts(cards: Card[]): Map<string, number> {
		const counts = new Map<string, number>();

		for (const card of cards) {
			const metadata = this.getMetadata(card);
			for (const tag of metadata.tags) {
				counts.set(tag, (counts.get(tag) || 0) + 1);
			}
		}

		return counts;
	}

	/**
	 * 获取牌组卡片计数
	 * @param cards 卡片数组
	 * @returns Map<牌组ID, 计数>
	 */
	getDeckCounts(cards: Card[]): Map<string, number> {
		const counts = new Map<string, number>();

		for (const card of cards) {
			const { deckIds } = getCardDeckIds(card, undefined, { fallbackToReferences: false });
			for (const deckId of deckIds) {
				counts.set(deckId, (counts.get(deckId) || 0) + 1);
			}
		}

		return counts;
	}

	/**
	 * 获取卡片类型计数
	 * @param cards 卡片数组
	 * @returns Map<类型, 计数>
	 */
	getTypeCounts(cards: Card[]): Map<string, number> {
		const counts = new Map<string, number>();

		for (const card of cards) {
			const metadata = this.getMetadata(card);
			const type = metadata.type || "basic";
			counts.set(type, (counts.get(type) || 0) + 1);
		}

		return counts;
	}

	// ===== 孤儿卡片检测 =====

	/**
	 * 检测孤儿卡片
	 * 孤儿卡片定义：we_decks 为空或所有牌组名称都无效
	 * @param cards 卡片数组
	 * @returns 孤儿卡片数组
	 */
	findOrphanCards(cards: Card[]): Card[] {
		return cards.filter((_card) => {
			return getCardDeckIds(_card, undefined, { fallbackToReferences: false }).deckIds.length === 0;
		});
	}

	/**
	 * 检查单张卡片是否为孤儿
	 * @param card 卡片
	 * @returns 是否为孤儿
	 */
	isOrphanCard(card: Card): boolean {
		return getCardDeckIds(card, undefined, { fallbackToReferences: false }).deckIds.length === 0;
	}

	// ===== 统计方法 =====

	/**
	 * 获取缓存统计信息
	 * @returns CacheStats
	 */
	getStats(): CacheStats {
		const total = this.stats.hits + this.stats.misses;
		return {
			size: this.cache.size,
			maxSize: this.config.maxSize,
			hits: this.stats.hits,
			misses: this.stats.misses,
			hitRate: total > 0 ? this.stats.hits / total : 0,
			lastUpdated: this.stats.lastUpdated,
			evictions: this.stats.evictions,
		};
	}

	/**
	 * 打印缓存统计信息（调试用）
	 */
	logStats(): void {
		const stats = this.getStats();
		logger.info("[CardMetadataCache] 统计信息:", {
			size: stats.size,
			maxSize: stats.maxSize,
			hits: stats.hits,
			misses: stats.misses,
			hitRate: `${(stats.hitRate * 100).toFixed(2)}%`,
			evictions: stats.evictions,
		});
	}

	// ===== 预热方法 =====

	/**
	 * 🆕 后台异步预热（不阻塞主线程）
	 * 使用批次处理 + 间隔延迟，避免影响用户交互
	 * @param cards 卡片数组
	 * @returns Promise<void>
	 */
	async prefetchAsync(cards: Card[]): Promise<void> {
		if (this.prefetchState.isRunning) {
			logger.debug("[CardMetadataCache] 后台预热已在运行，跳过");
			return;
		}

		if (!this.config.enableHotDeckPrefetch) {
			logger.debug("[CardMetadataCache] 后台预热已禁用");
			return;
		}

		this.prefetchState.isRunning = true;
		this.prefetchState.queue = [...cards];
		this.prefetchState.abortController = new AbortController();

		const startTime = Date.now();
		let processedCount = 0;

		logger.debug(`[CardMetadataCache] 开始后台预热: ${cards.length} 张卡片`);

		try {
			while (this.prefetchState.queue.length > 0) {
				// 检查是否已中止
				if (this.prefetchState.abortController?.signal.aborted) {
					logger.debug("[CardMetadataCache] 后台预热已中止");
					break;
				}

				// 取出一批卡片
				const batch = this.prefetchState.queue.splice(0, this.config.prefetchBatchSize);

				// 解析这一批
				for (const card of batch) {
					if (!this.cache.has(card.uuid)) {
						const parsed = this.parseCardMetadata(card.content);
						this.setWithEviction(card.uuid, parsed);
						processedCount++;
					}
				}

				// 延迟一下，避免阻塞主线程
				if (this.prefetchState.queue.length > 0) {
					await new Promise((resolve) => setTimeout(resolve, this.config.prefetchIntervalMs));
				}
			}

			const elapsed = Date.now() - startTime;
			logger.info(`[CardMetadataCache] 后台预热完成: ${processedCount} 张卡片, 耗时 ${elapsed}ms`);
		} catch (error) {
			logger.error("[CardMetadataCache] 后台预热失败:", error);
		} finally {
			this.prefetchState.isRunning = false;
			this.prefetchState.queue = [];
			this.prefetchState.abortController = null;
		}
	}

	/**
	 * 停止后台预热
	 */
}

// ===== 单例管理 =====

let cardMetadataCacheInstance: CardMetadataCache | null = null;

/**
 * 获取 CardMetadataCache 单例
 * @returns CardMetadataCache 实例
 */
export function getCardMetadataCache(): CardMetadataCache {
	if (!cardMetadataCacheInstance) {
		cardMetadataCacheInstance = new CardMetadataCache();
	}
	return cardMetadataCacheInstance;
}

/**
 * 初始化 CardMetadataCache 单例
 * @returns CardMetadataCache 实例
 */
export function initCardMetadataCache(): CardMetadataCache {
	cardMetadataCacheInstance = new CardMetadataCache();
	return cardMetadataCacheInstance;
}

/**
 * 销毁 CardMetadataCache 单例
 */
export function destroyCardMetadataCache(): void {
	if (cardMetadataCacheInstance) {
		cardMetadataCacheInstance.clear();
		cardMetadataCacheInstance = null;
	}
}

// ===== 便捷函数 =====

/**
 * 获取卡片元数据（便捷函数）
 * @param card 卡片对象
 * @returns 解析后的元数据
 */
export function getCardParsedMetadata(card: Card): ParsedCardMetadata {
	return getCardMetadataCache().getMetadata(card);
}

/**
 * 使卡片缓存失效（便捷函数）
 * @param cardUUID 卡片 UUID
 */
export function invalidateCardCache(cardUUID: string): void {
	getCardMetadataCache().invalidate(cardUUID);
}

/**
 * 清除所有卡片缓存（便捷函数）
 */
export function clearCardMetadataCache(): void {
	getCardMetadataCache().clear();
}
