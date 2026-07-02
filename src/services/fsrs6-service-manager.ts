import { logger } from "../utils/logger";
/**
 * FSRS6 服务管理器 — 基于官方 ts-fsrs（通过 FSRS 包装类）
 */

import { FSRS } from "../algorithms/fsrs";
import { EnhancedFSRS } from "../algorithms/enhanced-fsrs";
import type { FSRSCard } from "../data/types";
import { Rating } from "../data/types";
import type { FSRS6Parameters, FSRS6PerformanceMetrics } from "../types/fsrs6-types";
import { FSRS6Error } from "../types/fsrs6-types";
import type { WeaveIntervalHandle } from "../types/timer-handle";

interface AlgorithmPoolConfig {
	maxInstances: number;
	idleTimeout: number;
	enableCaching: boolean;
	cacheSize: number;
}

interface CacheEntry<T> {
	key: string;
	value: T;
	timestamp: number;
	hitCount: number;
}

interface AlgorithmInstance {
	id: string;
	algorithm: FSRS;
	lastUsed: number;
	usageCount: number;
	isActive: boolean;
}

export class FSRS6ServiceManager {
	private static instance: FSRS6ServiceManager;
	private algorithmPool: Map<string, AlgorithmInstance> = new Map();
	private enhancedFSRS: EnhancedFSRS;
	private cache: Map<string, CacheEntry<unknown>> = new Map();
	private config: AlgorithmPoolConfig;
	private performanceMetrics: FSRS6PerformanceMetrics;
	private cleanupTimer?: WeaveIntervalHandle;

	private constructor(config?: Partial<AlgorithmPoolConfig>) {
		this.config = {
			maxInstances: 5,
			idleTimeout: 300000,
			enableCaching: true,
			cacheSize: 1000,
			...config,
		};

		this.enhancedFSRS = new EnhancedFSRS();
		this.performanceMetrics = this.initializeMetrics();
		this.startCleanupTimer();
	}

	static getInstance(config?: Partial<AlgorithmPoolConfig>): FSRS6ServiceManager {
		if (!FSRS6ServiceManager.instance) {
			FSRS6ServiceManager.instance = new FSRS6ServiceManager(config);
		}
		return FSRS6ServiceManager.instance;
	}

	async getAlgorithmInstance(params?: Partial<FSRS6Parameters>): Promise<FSRS> {
		const startTime = performance.now();

		try {
			const paramKey = this.generateParameterKey(params);
			let instance = this.findAvailableInstance(paramKey);

			if (!instance) {
				instance = await this.createNewInstance(paramKey, params);
			}

			instance.lastUsed = Date.now();
			instance.usageCount++;
			instance.isActive = true;

			this.updatePerformanceMetrics("getAlgorithmInstance", performance.now() - startTime);
			return instance.algorithm;
		} catch (error) {
			throw new FSRS6Error(
				`Failed to get algorithm instance: ${
					error instanceof Error ? error.message : String(error)
				}`,
				"INSTANCE_ERROR",
				{ params }
			);
		}
	}

	releaseAlgorithmInstance(algorithm: FSRS): void {
		for (const instance of this.algorithmPool.values()) {
			if (instance.algorithm === algorithm) {
				instance.isActive = false;
				instance.lastUsed = Date.now();
				break;
			}
		}
	}

	updateParameters(newParams: Partial<FSRS6Parameters>): void {
		const startTime = performance.now();

		try {
			for (const instance of this.algorithmPool.values()) {
				instance.algorithm.updateParameters({
					w: newParams.w ? [...newParams.w] : undefined,
					requestRetention: newParams.requestRetention,
					maximumInterval: newParams.maximumInterval,
					enableFuzz: newParams.enableFuzz,
				});
			}

			if (newParams.w) {
				this.enhancedFSRS.updateParameters({ w: newParams.w });
			}

			this.clearParameterRelatedCache();
			this.updatePerformanceMetrics("updateParameters", performance.now() - startTime);
		} catch (error) {
			throw new FSRS6Error(
				`Failed to update parameters: ${error instanceof Error ? error.message : String(error)}`,
				"PARAMETER_UPDATE_ERROR",
				{ newParams }
			);
		}
	}

	async batchReview(
		cards: FSRSCard[],
		ratings: number[],
		params?: Partial<FSRS6Parameters>
	): Promise<Array<{ card: FSRSCard; log: ReturnType<FSRS["review"]>["log"] }>> {
		const startTime = performance.now();

		try {
			if (cards.length !== ratings.length) {
				throw new Error("Cards and ratings arrays must have the same length");
			}

			const algorithm = await this.getAlgorithmInstance(params);
			const results: Array<{ card: FSRSCard; log: ReturnType<FSRS["review"]>["log"] }> = [];

			for (let i = 0; i < cards.length; i++) {
				const rating = ratings[i] as Rating;
				const reviewResult = algorithm.review(cards[i], rating);
				results.push(reviewResult);
			}

			this.releaseAlgorithmInstance(algorithm);
			this.updatePerformanceMetrics("batchReview", performance.now() - startTime);

			return results;
		} catch (error) {
			throw new FSRS6Error(
				`Failed to batch review cards: ${error instanceof Error ? error.message : String(error)}`,
				"BATCH_REVIEW_ERROR",
				{ cardCount: cards.length }
			);
		}
	}

	async getPersonalizedRecommendations(
		userHistory: unknown[],
		currentCard: FSRSCard
	): Promise<{
		optimalInterval: number;
		confidenceLevel: number;
		recommendations: string[];
	}> {
		const startTime = performance.now();

		try {
			const cacheKey = `recommendations_${currentCard.due}_${userHistory.length}`;

			if (this.config.enableCaching) {
				const cached = this.getFromCache<{
					optimalInterval: number;
					confidenceLevel: number;
					recommendations: string[];
				}>(cacheKey);
				if (cached) {
					return cached;
				}
			}

			const recommendations: string[] = [];

			if (currentCard.difficulty > 7) {
				recommendations.push("该卡片难度较高，建议分解为更小的知识点");
			}

			if (currentCard.stability > 100) {
				recommendations.push("记忆已经很稳定，可以适当延长复习间隔");
			}

			const result = {
				optimalInterval: Math.max(1, Math.round(currentCard.scheduledDays)),
				confidenceLevel: this.calculateConfidenceLevel(currentCard, userHistory),
				recommendations,
			};

			if (this.config.enableCaching) {
				this.setCache(cacheKey, result);
			}

			this.updatePerformanceMetrics(
				"getPersonalizedRecommendations",
				performance.now() - startTime
			);
			return result;
		} catch (error) {
			throw new FSRS6Error(
				`Failed to get personalized recommendations: ${
					error instanceof Error ? error.message : String(error)
				}`,
				"RECOMMENDATION_ERROR",
				{ cardId: currentCard.due }
			);
		}
	}

	getPerformanceMetrics(): FSRS6PerformanceMetrics & {
		poolStats: {
			totalInstances: number;
			activeInstances: number;
			cacheHitRate: number;
			cacheSize: number;
		};
	} {
		const activeInstances = Array.from(this.algorithmPool.values()).filter(
			(instance) => instance.isActive
		).length;

		const totalCacheHits = Array.from(this.cache.values()).reduce(
			(sum, entry) => sum + entry.hitCount,
			0
		);
		const cacheHitRate = totalCacheHits > 0 ? totalCacheHits / this.cache.size : 0;

		return {
			...this.performanceMetrics,
			poolStats: {
				totalInstances: this.algorithmPool.size,
				activeInstances,
				cacheHitRate,
				cacheSize: this.cache.size,
			},
		};
	}

	cleanup(): void {
		if (this.cleanupTimer) {
			window.clearInterval(this.cleanupTimer);
		}
		this.algorithmPool.clear();
		this.cache.clear();
		logger.debug("FSRS6ServiceManager cleaned up");
	}

	private generateParameterKey(params?: Partial<FSRS6Parameters>): string {
		if (!params?.w) {
			return "default";
		}
		return `params_${params.w.join("_")}`;
	}

	private findAvailableInstance(paramKey: string): AlgorithmInstance | null {
		for (const instance of this.algorithmPool.values()) {
			if (!instance.isActive && instance.id.includes(paramKey)) {
				return instance;
			}
		}
		return null;
	}

	private async createNewInstance(
		paramKey: string,
		params?: Partial<FSRS6Parameters>
	): Promise<AlgorithmInstance> {
		if (this.algorithmPool.size >= this.config.maxInstances) {
			this.evictOldestInstance();
		}

		const instanceId = `${paramKey}_${Date.now()}`;
		const algorithm = new FSRS(
			params
				? {
						w: params.w ? [...params.w] : undefined,
						requestRetention: params.requestRetention,
						maximumInterval: params.maximumInterval,
						enableFuzz: params.enableFuzz,
					}
				: undefined
		);

		const instance: AlgorithmInstance = {
			id: instanceId,
			algorithm,
			lastUsed: Date.now(),
			usageCount: 0,
			isActive: false,
		};

		this.algorithmPool.set(instanceId, instance);
		return instance;
	}

	private evictOldestInstance(): void {
		let oldestInstance: AlgorithmInstance | null = null;
		let oldestKey = "";

		for (const [key, instance] of this.algorithmPool) {
			if (!instance.isActive && (!oldestInstance || instance.lastUsed < oldestInstance.lastUsed)) {
				oldestInstance = instance;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.algorithmPool.delete(oldestKey);
		}
	}

	private getFromCache<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (entry && Date.now() - entry.timestamp < 300000) {
			entry.hitCount++;
			return entry.value as T;
		}
		return null;
	}

	private setCache<T>(key: string, value: T): void {
		if (this.cache.size >= this.config.cacheSize) {
			const oldestKey = Array.from(this.cache.keys())[0];
			this.cache.delete(oldestKey);
		}

		this.cache.set(key, {
			key,
			value,
			timestamp: Date.now(),
			hitCount: 0,
		});
	}

	private clearParameterRelatedCache(): void {
		for (const key of this.cache.keys()) {
			if (key.includes("recommendations_")) {
				this.cache.delete(key);
			}
		}
	}

	private calculateConfidenceLevel(card: FSRSCard, userHistory: unknown[]): number {
		const historyLength = userHistory.length;
		const stabilityFactor = Math.min(card.stability / 100, 1);
		const historyFactor = Math.min(historyLength / 50, 1);
		return (stabilityFactor + historyFactor) / 2;
	}

	private startCleanupTimer(): void {
		this.cleanupTimer = window.setInterval(() => {
			this.performPeriodicCleanup();
		}, this.config.idleTimeout);
	}

	private performPeriodicCleanup(): void {
		const now = Date.now();

		for (const [key, instance] of this.algorithmPool) {
			if (!instance.isActive && now - instance.lastUsed > this.config.idleTimeout) {
				this.algorithmPool.delete(key);
			}
		}

		for (const [key, entry] of this.cache) {
			if (now - entry.timestamp > 300000) {
				this.cache.delete(key);
			}
		}
	}

	private initializeMetrics(): FSRS6PerformanceMetrics {
		return {
			algorithmVersion: "6.1.1",
			executionTime: 0,
			memoryUsage: 0,
			predictionAccuracy: 0,
			parameterStability: 1.0,
			convergenceRate: 0,
			cacheHitRate: 0,
		};
	}

	private updatePerformanceMetrics(_operation: string, executionTime: number): void {
		this.performanceMetrics.executionTime =
			(this.performanceMetrics.executionTime + executionTime) / 2;

		const totalHits = Array.from(this.cache.values()).reduce(
			(sum, entry) => sum + entry.hitCount,
			0
		);
		this.performanceMetrics.cacheHitRate = this.cache.size > 0 ? totalHits / this.cache.size : 0;
	}
}
