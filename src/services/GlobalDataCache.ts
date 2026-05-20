/**
 * 全局数据缓存管理器
 *
 * 职责：预加载和缓存插件常用数据，避免组件重复加载
 * 优化目标：消除 CreateCardModal 和 InlineCardEditor 的重复数据加载（~700ms）
 *
 * @author Weave Team
 * @date 2025-01-06
 */

import type { Deck } from "../data/types";
import type { WeavePlugin } from "../main";
import { logger } from "../utils/logger";

/**
 * 缓存状态
 */
interface CacheState {
	/** 牌组缓存 */
	decks: Deck[] | null;
	/** 缓存时间戳 */
	timestamp: number;
	/** 是否正在加载 */
	isLoading: boolean;
}

/**
 * 全局数据缓存管理器（单例）
 */
export class GlobalDataCache {
	private static instance: GlobalDataCache | null = null;

	// 缓存状态
	private state: CacheState = {
		decks: null,
		timestamp: 0,
		isLoading: false,
	};

	// 加载 Promise（用于避免并发重复加载）
	private loadPromise: Promise<void> | null = null;

	// 缓存配置
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存有效期

	// 插件引用（用于访问 debugMode）
	private plugin: WeavePlugin | null = null;

	/**
	 * 获取单例实例
	 */
	static getInstance(): GlobalDataCache {
		if (!GlobalDataCache.instance) {
			GlobalDataCache.instance = new GlobalDataCache();
		}
		return GlobalDataCache.instance;
	}

	static destroyInstance(): void {
		if (!GlobalDataCache.instance) {
			return;
		}

		GlobalDataCache.instance.destroy();
		GlobalDataCache.instance = null;
	}

	/**
	 * 私有构造函数（单例模式）
	 */
	private constructor() {
		// 初始化日志将在 preload 时输出
	}

	/**
	 * 应用启动时预加载数据
	 *
	 * @param plugin 插件实例
	 */
	async preload(plugin: WeavePlugin): Promise<void> {
		// 保存插件引用
		if (!this.plugin) {
			this.plugin = plugin;
		}

		// 如果正在加载，返回现有的 Promise
		if (this.loadPromise) {
			logger.debug("[GlobalDataCache]", "数据预加载已在进行中，等待完成...");
			return this.loadPromise;
		}

		// 如果缓存有效，直接返回
		if (this.isCacheValid()) {
			logger.debug("[GlobalDataCache]", "缓存仍然有效，跳过预加载");
			return;
		}

		logger.debug("[GlobalDataCache]", "开始预加载数据...");
		const startTime = Date.now();

		this.state.isLoading = true;

		this.loadPromise = (async () => {
			try {
				const decks = await this.loadDecks(plugin);

				// 更新缓存
				this.state.decks = decks;
				this.state.timestamp = Date.now();

				const duration = Date.now() - startTime;

				logger.debug("[GlobalDataCache]", `数据预加载完成: ${duration}ms`, {
					decks: decks.length,
				});
			} catch (error) {
				logger.error("[GlobalDataCache] 数据预加载失败:", error);
				// 预加载失败不影响应用启动，组件会降级到直接加载
			} finally {
				this.state.isLoading = false;
				this.loadPromise = null;
			}
		})();

		return this.loadPromise;
	}

	/**
	 * 获取牌组列表（带缓存）
	 *
	 * @param plugin 插件实例
	 * @param forceRefresh 是否强制刷新缓存
	 * @returns 牌组列表
	 */
	async getDecks(plugin: WeavePlugin, forceRefresh = false): Promise<Deck[]> {
		// 如果强制刷新或缓存无效，重新加载
		if (forceRefresh || !this.isCacheValid() || !this.state.decks) {
			logger.debug("[GlobalDataCache]", "牌组缓存无效，重新加载...");

			// 如果正在预加载，等待完成
			if (this.loadPromise) {
				await this.loadPromise;
			} else {
				const decks = await this.loadDecks(plugin);
				this.state.decks = decks;
				this.state.timestamp = Date.now();
			}
		}

		return this.state.decks || [];
	}

	/**
	 * 手动刷新缓存
	 *
	 * @param plugin 插件实例
	 */
	async refresh(plugin: WeavePlugin): Promise<void> {
		logger.debug("[GlobalDataCache]", "手动刷新缓存...");
		this.clear();
		await this.preload(plugin);
	}

	/**
	 * 清除缓存
	 */
	clear(): void {
		logger.debug("[GlobalDataCache]", "清除缓存");
		this.state.decks = null;
		this.state.timestamp = 0;
		this.loadPromise = null;
	}

	destroy(): void {
		this.clear();
		this.state.isLoading = false;
		this.plugin = null;
	}

	/**
	 * 使指定牌组的卡片缓存失效
	 * 当卡片被添加、更新或删除时调用
	 *
	 * @param deckId 牌组ID
	 */
	invalidateCardCache(deckId: string): void {
		logger.debug("[GlobalDataCache]", `使牌组 ${deckId} 的卡片缓存失效`);
		// 清除牌组缓存，因为牌组统计信息可能已更改
		this.state.decks = null;
		this.state.timestamp = Date.now() - this.CACHE_TTL; // 标记为过期
	}

	/**
	 * 使牌组缓存失效
	 * 当牌组被添加、更新或删除时调用
	 */
	invalidateDeckCache(): void {
		logger.debug("[GlobalDataCache]", "使牌组缓存失效");
		this.state.decks = null;
		this.state.timestamp = Date.now() - this.CACHE_TTL; // 标记为过期
	}

	/**
	 * 检查缓存是否有效
	 */
	private isCacheValid(): boolean {
		if (this.state.timestamp === 0) {
			return false;
		}

		const age = Date.now() - this.state.timestamp;
		return age < this.CACHE_TTL;
	}

	/**
	 * 检查是否已预加载
	 * @returns 是否已完成预加载
	 */
	isPreloaded(): boolean {
		return this.state.timestamp > 0 && this.state.decks !== null;
	}

	/**
	 * 加载牌组数据
	 */
	private async loadDecks(plugin: WeavePlugin): Promise<Deck[]> {
		try {
			const decks = await plugin.dataStorage.getAllDecks();
			logger.debug("[GlobalDataCache]", `牌组数据加载完成: ${decks.length} 个牌组`);
			return decks;
		} catch (error) {
			logger.error("[GlobalDataCache] 加载牌组失败:", error);
			return [];
		}
	}

}

/**
 * 导出单例实例的便捷访问方法
 */
export const globalDataCache = GlobalDataCache.getInstance();
