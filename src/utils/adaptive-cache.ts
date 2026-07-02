import { logger } from "../utils/logger";
import type { TimerHandle } from "../types/timer";
/**
 * 自适应缓存策略系统
 * 基于内存使用情况和数据访问模式动态调整缓存策略
 */

import { DEFAULT_ANALYTICS_CONFIG } from "../config/analytics-config";
import { smartCache } from "./smart-cache";

type WindowWithAdaptiveCacheService = Window & {
	__weaveAdaptiveCacheService?: AdaptiveCacheService | null;
	__weaveAdaptiveCacheServiceCleanup?: (() => void) | null;
};

type PerformanceMemoryInfo = {
	usedJSHeapSize: number;
	jsHeapSizeLimit: number;
};

type PerformanceWithMemory = Performance & {
	memory?: PerformanceMemoryInfo;
};

// ============================================================================
// 类型定义
// ============================================================================

export interface MemoryPressure {
	level: "low" | "medium" | "high" | "critical";
	usedMemory: number;
	totalMemory: number;
	usageRatio: number;
	trend: "increasing" | "stable" | "decreasing";
}

export interface AccessPattern {
	key: string;
	frequency: number;
	lastAccessed: number;
	averageAccessInterval: number;
	dataSize: number;
	importance: number;
}

export interface CacheStrategy {
	name: string;
	memoryThreshold: number;
	maxCacheSize: number;
	ttlMultiplier: number;
	evictionPolicy: "lru" | "lfu" | "ttl" | "size" | "importance";
	compressionEnabled: boolean;
	preloadEnabled: boolean;
}

export interface AdaptiveConfig {
	strategies: CacheStrategy[];
	memoryCheckInterval: number;
	adaptationThreshold: number;
	emergencyCleanupRatio: number;
}

// ============================================================================
// 自适应缓存策略服务
// ============================================================================

export class AdaptiveCacheService {
	private static instance: AdaptiveCacheService;
	private config: AdaptiveConfig;
	private currentStrategy: CacheStrategy;
	private memoryHistory: number[] = [];
	private accessPatterns = new Map<string, AccessPattern>();
	private monitoringInterval: TimerHandle | null = null;
	private isEnabled = true;

	private constructor() {
		this.config = this.getDefaultConfig();
		this.currentStrategy = this.config.strategies[0]; // 默认策略
		this.startMemoryMonitoring();
	}

	static getInstance(): AdaptiveCacheService {
		if (typeof window !== "undefined") {
			if (window.__weaveAdaptiveCacheService) {
				AdaptiveCacheService.instance = window.__weaveAdaptiveCacheService;
				return AdaptiveCacheService.instance;
			}

			const instance = new AdaptiveCacheService();
			window.__weaveAdaptiveCacheService = instance;

			if (typeof window.__weaveAdaptiveCacheServiceCleanup !== "function") {
				window.__weaveAdaptiveCacheServiceCleanup = () => {
					try {
						(window.__weaveAdaptiveCacheService as AdaptiveCacheService | undefined)?.destroy();
					} catch { /* no-op */ }

					try {
						window.__weaveAdaptiveCacheService = undefined;
						window.__weaveAdaptiveCacheServiceCleanup = undefined;
					} catch {
						window.__weaveAdaptiveCacheService = null;
						window.__weaveAdaptiveCacheServiceCleanup = null;
					}
				};
			}

			AdaptiveCacheService.instance = instance;
			return instance;
		}

		if (!AdaptiveCacheService.instance) {
			AdaptiveCacheService.instance = new AdaptiveCacheService();
		}
		return AdaptiveCacheService.instance;
	}

	/**
	 * 获取当前内存压力
	 */
	getMemoryPressure(): MemoryPressure {
		let usedMemory = 0;
		let totalMemory = 0;

		const memInfo = (performance as PerformanceWithMemory).memory;
		if (memInfo) {
			usedMemory = memInfo.usedJSHeapSize;
			totalMemory = memInfo.jsHeapSizeLimit;
		} else {
			// 估算值
			usedMemory = this.estimateMemoryUsage();
			totalMemory = 100 * 1024 * 1024; // 100MB 估算
		}

		const usageRatio = totalMemory > 0 ? usedMemory / totalMemory : 0;
		const trend = this.calculateMemoryTrend();

		let level: MemoryPressure["level"] = "low";
		if (usageRatio > 0.9) level = "critical";
		else if (usageRatio > 0.7) level = "high";
		else if (usageRatio > 0.5) level = "medium";

		return {
			level,
			usedMemory,
			totalMemory,
			usageRatio,
			trend,
		};
	}

	/**
	 * 记录数据访问模式
	 */
	recordAccess(key: string, dataSize = 0): void {
		if (!this.isEnabled) return;

		const now = Date.now();
		const existing = this.accessPatterns.get(key);

		if (existing) {
			const timeSinceLastAccess = now - existing.lastAccessed;
			existing.frequency++;
			existing.averageAccessInterval = (existing.averageAccessInterval + timeSinceLastAccess) / 2;
			existing.lastAccessed = now;
			existing.dataSize = Math.max(existing.dataSize, dataSize);
		} else {
			this.accessPatterns.set(key, {
				key,
				frequency: 1,
				lastAccessed: now,
				averageAccessInterval: 0,
				dataSize,
				importance: this.calculateImportance(key, dataSize),
			});
		}

		// 限制访问模式记录数量（优化：从1000降低到200）
		if (this.accessPatterns.size > 200) {
			this.cleanupAccessPatterns();
		}
	}

	/**
	 * 自适应调整缓存策略
	 */
	adaptStrategy(): void {
		const memoryPressure = this.getMemoryPressure();
		const optimalStrategy = this.selectOptimalStrategy(memoryPressure);

		if (optimalStrategy.name !== this.currentStrategy.name) {
			logger.debug(
				`🔄 Adapting cache strategy from ${this.currentStrategy.name} to ${optimalStrategy.name}`
			);
			this.currentStrategy = optimalStrategy;
			this.applyCacheStrategy(optimalStrategy);
		}

		// 如果内存压力过高，执行紧急清理
		if (memoryPressure.level === "critical") {
			this.performEmergencyCleanup();
		}
	}

	/**
	 * 获取缓存建议
	 */
	getCacheRecommendation(
		key: string,
		dataSize: number
	): {
		shouldCache: boolean;
		ttl: number;
		priority: number;
	} {
		const memoryPressure = this.getMemoryPressure();
		const pattern = this.accessPatterns.get(key);

		let shouldCache = true;
		let ttl = this.currentStrategy.ttlMultiplier * DEFAULT_ANALYTICS_CONFIG.performance.CACHE.TTL;
		let priority = 1;

		// 基于内存压力调整
		if (memoryPressure.level === "critical") {
			shouldCache = false;
		} else if (memoryPressure.level === "high") {
			shouldCache = dataSize < 1024 * 1024; // 只缓存小于1MB的数据
			ttl *= 0.5; // 减少TTL
		}

		// 基于访问模式调整
		if (pattern) {
			priority = pattern.importance;

			// 高频访问的数据增加TTL
			if (pattern.frequency > 5) {
				ttl *= 1.5;
			}

			// 最近访问的数据优先缓存
			const timeSinceAccess = Date.now() - pattern.lastAccessed;
			if (timeSinceAccess < 60000) {
				// 1分钟内
				priority *= 2;
			}
		}

		return { shouldCache, ttl, priority };
	}

	/**
	 * 获取自适应统计
	 */
	getAdaptiveStats(): {
		currentStrategy: string;
		memoryPressure: MemoryPressure;
		accessPatterns: number;
		adaptationCount: number;
	} {
		return {
			currentStrategy: this.currentStrategy.name,
			memoryPressure: this.getMemoryPressure(),
			accessPatterns: this.accessPatterns.size,
			adaptationCount: 0, // 可以添加计数器
		};
	}

	/**
	 * 启用/禁用自适应缓存
	 */
	setEnabled(enabled: boolean): void {
		this.isEnabled = enabled;
		if (!enabled && this.monitoringInterval) {
			window.clearInterval(this.monitoringInterval);
			this.monitoringInterval = null;
		} else if (enabled && !this.monitoringInterval) {
			this.startMemoryMonitoring();
		}
	}

	// ============================================================================
	// 私有方法
	// ============================================================================

	private getDefaultConfig(): AdaptiveConfig {
		return {
			strategies: [
				{
					name: "conservative",
					memoryThreshold: 0.3,
					maxCacheSize: 20,
					ttlMultiplier: 0.5,
					evictionPolicy: "lru",
					compressionEnabled: false,
					preloadEnabled: false,
				},
				{
					name: "balanced",
					memoryThreshold: 0.6,
					maxCacheSize: 50,
					ttlMultiplier: 1.0,
					evictionPolicy: "lfu",
					compressionEnabled: true,
					preloadEnabled: true,
				},
				{
					name: "aggressive",
					memoryThreshold: 0.8,
					maxCacheSize: 100,
					ttlMultiplier: 2.0,
					evictionPolicy: "importance",
					compressionEnabled: true,
					preloadEnabled: true,
				},
				{
					name: "emergency",
					memoryThreshold: 0.9,
					maxCacheSize: 10,
					ttlMultiplier: 0.2,
					evictionPolicy: "size",
					compressionEnabled: false,
					preloadEnabled: false,
				},
			],
			memoryCheckInterval: 30000, // 30秒
			adaptationThreshold: 0.1, // 10%变化触发适应
			emergencyCleanupRatio: 0.5, // 紧急清理50%缓存
		};
	}

	private selectOptimalStrategy(memoryPressure: MemoryPressure): CacheStrategy {
		for (const strategy of this.config.strategies) {
			if (memoryPressure.usageRatio <= strategy.memoryThreshold) {
				return strategy;
			}
		}
		// 返回最保守的策略
		return this.config.strategies[this.config.strategies.length - 1];
	}

	private applyCacheStrategy(strategy: CacheStrategy): void {
		// 这里可以调用 smartCache 的配置方法
		// 由于 smartCache 的接口限制，我们主要通过建议来影响缓存行为
		logger.debug(`📋 Applied cache strategy: ${strategy.name}`, {
			maxSize: strategy.maxCacheSize,
			ttlMultiplier: strategy.ttlMultiplier,
			evictionPolicy: strategy.evictionPolicy,
		});
	}

	private performEmergencyCleanup(): void {
		logger.warn("🚨 Performing emergency cache cleanup due to critical memory pressure");

		// 清理低重要性的缓存项
		const patterns = Array.from(this.accessPatterns.values()).sort(
			(a, b) => a.importance - b.importance
		);

		const cleanupCount = Math.floor(patterns.length * this.config.emergencyCleanupRatio);
		for (let i = 0; i < cleanupCount; i++) {
			smartCache.delete(patterns[i].key);
		}
	}

	private calculateImportance(key: string, dataSize: number): number {
		let importance = 1;

		// 基于键名的重要性
		if (key.includes("analytics-data")) importance += 2;
		if (key.includes("dashboard")) importance += 1;
		if (key.includes("preloaded")) importance -= 1;

		// 基于数据大小的重要性（小数据更重要）
		if (dataSize < 1024) importance += 1;
		else if (dataSize > 1024 * 1024) importance -= 1;

		return Math.max(0.1, importance);
	}

	private calculateMemoryTrend(): "increasing" | "stable" | "decreasing" {
		if (this.memoryHistory.length < 3) return "stable";

		const recent = this.memoryHistory.slice(-3);
		const trend = recent[2] - recent[0];

		if (trend > 1024 * 1024) return "increasing"; // 增长超过1MB
		if (trend < -1024 * 1024) return "decreasing"; // 减少超过1MB
		return "stable";
	}

	private estimateMemoryUsage(): number {
		// 简单的内存使用估算
		const cacheStats = smartCache.getStats();
		return cacheStats.totalSize + 50 * 1024 * 1024; // 缓存大小 + 50MB基础使用
	}

	private cleanupAccessPatterns(): void {
		// 保留最近访问和高频访问的模式
		const patterns = Array.from(this.accessPatterns.values()).sort((a, b) => {
			const scoreA = a.frequency + (Date.now() - a.lastAccessed) / 1000;
			const scoreB = b.frequency + (Date.now() - b.lastAccessed) / 1000;
			return scoreB - scoreA;
		});

		this.accessPatterns.clear();
		for (const _pattern of patterns.slice(0, 500)) {
			this.accessPatterns.set(_pattern.key, _pattern);
		}
	}

	private startMemoryMonitoring(): void {
		this.monitoringInterval = window.setInterval(() => {
			if (!this.isEnabled) return;

			const memoryPressure = this.getMemoryPressure();
			this.memoryHistory.push(memoryPressure.usedMemory);

			// 限制历史记录长度
			if (this.memoryHistory.length > 20) {
				this.memoryHistory = this.memoryHistory.slice(-10);
			}

			// 执行自适应调整
			this.adaptStrategy();
		}, this.config.memoryCheckInterval);
	}

	/**
	 * 清理资源
	 */
	destroy(): void {
		if (this.monitoringInterval) {
			window.clearInterval(this.monitoringInterval);
			this.monitoringInterval = null;
		}
		this.accessPatterns.clear();
		this.memoryHistory = [];
	}
}

// ============================================================================
// 导出实例
// ============================================================================

export const adaptiveCache = AdaptiveCacheService.getInstance();
