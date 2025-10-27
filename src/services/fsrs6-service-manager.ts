/**
 * FSRS6 服务管理器
 * 统一管理FSRS6算法服务，提供高效的算法实例复用和性能优化
 */

import { FSRS6CoreAlgorithm } from "../algorithms/fsrs6-core";
import { EnhancedFSRS } from "../algorithms/enhanced-fsrs";
import type { FSRS6Parameters, FSRS6Card, FSRS6PerformanceMetrics } from "../types/fsrs6-types";
import { FSRS6_DEFAULTS, FSRS6Error } from "../types/fsrs6-types";
import type { Card, FSRSCard } from "../data/types";

/**
 * 算法实例池配置
 */
interface AlgorithmPoolConfig {
  maxInstances: number;
  idleTimeout: number; // 毫秒
  enableCaching: boolean;
  cacheSize: number;
}

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  hitCount: number;
}

/**
 * 算法实例信息
 */
interface AlgorithmInstance {
  id: string;
  algorithm: FSRS6CoreAlgorithm;
  lastUsed: number;
  usageCount: number;
  isActive: boolean;
}

/**
 * FSRS6 服务管理器类
 */
export class FSRS6ServiceManager {
  private static instance: FSRS6ServiceManager;
  private algorithmPool: Map<string, AlgorithmInstance> = new Map();
  private enhancedFSRS: EnhancedFSRS;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private config: AlgorithmPoolConfig;
  private performanceMetrics: FSRS6PerformanceMetrics;
  private cleanupTimer?: NodeJS.Timeout;

  private constructor(config?: Partial<AlgorithmPoolConfig>) {
    this.config = {
      maxInstances: 5,
      idleTimeout: 300000, // 5分钟
      enableCaching: true,
      cacheSize: 1000,
      ...config
    };

    this.enhancedFSRS = new EnhancedFSRS();
    this.performanceMetrics = this.initializeMetrics();
    this.startCleanupTimer();
  }

  /**
   * 获取服务管理器单例
   */
  static getInstance(config?: Partial<AlgorithmPoolConfig>): FSRS6ServiceManager {
    if (!FSRS6ServiceManager.instance) {
      FSRS6ServiceManager.instance = new FSRS6ServiceManager(config);
    }
    return FSRS6ServiceManager.instance;
  }

  /**
   * 获取FSRS6算法实例
   */
  async getAlgorithmInstance(params?: Partial<FSRS6Parameters>): Promise<FSRS6CoreAlgorithm> {
    const startTime = performance.now();
    
    try {
      const paramKey = this.generateParameterKey(params);
      
      // 尝试从池中获取现有实例
      let instance = this.findAvailableInstance(paramKey);
      
      if (!instance) {
        // 创建新实例
        instance = await this.createNewInstance(paramKey, params);
      }

      // 更新使用统计
      instance.lastUsed = Date.now();
      instance.usageCount++;
      instance.isActive = true;

      this.updatePerformanceMetrics('getAlgorithmInstance', performance.now() - startTime);
      return instance.algorithm;
    } catch (error) {
      throw new FSRS6Error(
        `Failed to get algorithm instance: ${error.message}`,
        'INSTANCE_ERROR',
        { params }
      );
    }
  }

  /**
   * 释放算法实例
   */
  releaseAlgorithmInstance(algorithm: FSRS6CoreAlgorithm): void {
    for (const [key, instance] of this.algorithmPool) {
      if (instance.algorithm === algorithm) {
        instance.isActive = false;
        instance.lastUsed = Date.now();
        break;
      }
    }
  }

  /**
   * 热更新参数
   */
  async updateParameters(newParams: Partial<FSRS6Parameters>): Promise<void> {
    const startTime = performance.now();
    
    try {
      // 更新所有实例的参数
      for (const instance of this.algorithmPool.values()) {
        instance.algorithm.updateParameters(newParams);
      }

      // 更新增强FSRS
      if (newParams.w) {
        this.enhancedFSRS.updateParameters({ w: newParams.w });
      }

      // 清除相关缓存
      this.clearParameterRelatedCache();

      this.updatePerformanceMetrics('updateParameters', performance.now() - startTime);
    } catch (error) {
      throw new FSRS6Error(
        `Failed to update parameters: ${error.message}`,
        'PARAMETER_UPDATE_ERROR',
        { newParams }
      );
    }
  }

  /**
   * 批量处理卡片复习
   */
  async batchReview(
    cards: FSRS6Card[], 
    ratings: number[], 
    params?: Partial<FSRS6Parameters>
  ): Promise<Array<{ card: FSRS6Card, log: any }>> {
    const startTime = performance.now();
    
    try {
      if (cards.length !== ratings.length) {
        throw new Error('Cards and ratings arrays must have the same length');
      }

      const algorithm = await this.getAlgorithmInstance(params);
      const results: Array<{ card: FSRS6Card, log: any }> = [];

      for (let i = 0; i < cards.length; i++) {
        const cacheKey = this.generateReviewCacheKey(cards[i], ratings[i]);
        
        // 检查缓存
        if (this.config.enableCaching) {
          const cached = this.getFromCache(cacheKey);
          if (cached) {
            results.push(cached);
            continue;
          }
        }

        // 执行复习
        const result = algorithm.review(cards[i], ratings[i]);
        results.push(result);

        // 缓存结果
        if (this.config.enableCaching) {
          this.setCache(cacheKey, result);
        }
      }

      this.releaseAlgorithmInstance(algorithm);
      this.updatePerformanceMetrics('batchReview', performance.now() - startTime);
      
      return results;
    } catch (error) {
      throw new FSRS6Error(
        `Failed to batch review cards: ${error.message}`,
        'BATCH_REVIEW_ERROR',
        { cardCount: cards.length }
      );
    }
  }

  /**
   * 获取个性化建议
   */
  async getPersonalizedRecommendations(
    userHistory: any[], 
    currentCard: FSRS6Card
  ): Promise<{
    optimalInterval: number;
    confidenceLevel: number;
    recommendations: string[];
  }> {
    const startTime = performance.now();
    
    try {
      const cacheKey = `recommendations_${currentCard.due}_${userHistory.length}`;
      
      // 检查缓存
      if (this.config.enableCaching) {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // 使用增强FSRS生成建议
      const predictions = this.enhancedFSRS.predictMemoryState(currentCard, [1, 3, 7, 14, 30]);
      const optimalInterval = this.enhancedFSRS.findOptimalInterval(currentCard);
      
      const recommendations: string[] = [];
      
      // 基于预测生成建议
      if (predictions[0] < 0.8) {
        recommendations.push("建议缩短复习间隔，加强记忆巩固");
      }
      
      if (currentCard.difficulty > 7) {
        recommendations.push("该卡片难度较高，建议分解为更小的知识点");
      }
      
      if (currentCard.stability > 100) {
        recommendations.push("记忆已经很稳定，可以适当延长复习间隔");
      }

      const result = {
        optimalInterval,
        confidenceLevel: this.calculateConfidenceLevel(currentCard, userHistory),
        recommendations
      };

      // 缓存结果
      if (this.config.enableCaching) {
        this.setCache(cacheKey, result);
      }

      this.updatePerformanceMetrics('getPersonalizedRecommendations', performance.now() - startTime);
      return result;
    } catch (error) {
      throw new FSRS6Error(
        `Failed to get personalized recommendations: ${error.message}`,
        'RECOMMENDATION_ERROR',
        { cardId: currentCard.due }
      );
    }
  }

  /**
   * 获取性能监控数据
   */
  getPerformanceMetrics(): FSRS6PerformanceMetrics & {
    poolStats: {
      totalInstances: number;
      activeInstances: number;
      cacheHitRate: number;
      cacheSize: number;
    };
  } {
    const activeInstances = Array.from(this.algorithmPool.values())
      .filter(instance => instance.isActive).length;

    const totalCacheHits = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.hitCount, 0);
    const cacheHitRate = totalCacheHits > 0 ? totalCacheHits / this.cache.size : 0;

    return {
      ...this.performanceMetrics,
      poolStats: {
        totalInstances: this.algorithmPool.size,
        activeInstances,
        cacheHitRate,
        cacheSize: this.cache.size
      }
    };
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 清理定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // 清理算法实例池
    this.algorithmPool.clear();

    // 清理缓存
    this.cache.clear();

    console.log('FSRS6ServiceManager cleaned up');
  }

  // 私有方法

  private generateParameterKey(params?: Partial<FSRS6Parameters>): string {
    if (!params || !params.w) {
      return 'default';
    }
    return `params_${params.w.join('_')}`;
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
    // 检查池大小限制
    if (this.algorithmPool.size >= this.config.maxInstances) {
      this.evictOldestInstance();
    }

    const instanceId = `${paramKey}_${Date.now()}`;
    const algorithm = new FSRS6CoreAlgorithm(params);
    
    const instance: AlgorithmInstance = {
      id: instanceId,
      algorithm,
      lastUsed: Date.now(),
      usageCount: 0,
      isActive: false
    };

    this.algorithmPool.set(instanceId, instance);
    return instance;
  }

  private evictOldestInstance(): void {
    let oldestInstance: AlgorithmInstance | null = null;
    let oldestKey = '';

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

  private generateReviewCacheKey(card: FSRS6Card, rating: number): string {
    return `review_${card.due}_${card.stability}_${card.difficulty}_${rating}`;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < 300000) { // 5分钟缓存
      entry.hitCount++;
      return entry.value;
    }
    return null;
  }

  private setCache<T>(key: string, value: T): void {
    if (this.cache.size >= this.config.cacheSize) {
      // 删除最旧的缓存条目
      const oldestKey = Array.from(this.cache.keys())[0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      key,
      value,
      timestamp: Date.now(),
      hitCount: 0
    });
  }

  private clearParameterRelatedCache(): void {
    for (const [key, entry] of this.cache) {
      if (key.includes('review_') || key.includes('recommendations_')) {
        this.cache.delete(key);
      }
    }
  }

  private calculateConfidenceLevel(card: FSRS6Card, userHistory: any[]): number {
    // 基于历史数据和卡片状态计算置信水平
    const historyLength = userHistory.length;
    const stabilityFactor = Math.min(card.stability / 100, 1);
    const historyFactor = Math.min(historyLength / 50, 1);
    
    return (stabilityFactor + historyFactor) / 2;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performPeriodicCleanup();
    }, this.config.idleTimeout);
  }

  private performPeriodicCleanup(): void {
    const now = Date.now();
    
    // 清理空闲的算法实例
    for (const [key, instance] of this.algorithmPool) {
      if (!instance.isActive && now - instance.lastUsed > this.config.idleTimeout) {
        this.algorithmPool.delete(key);
      }
    }

    // 清理过期缓存
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > 300000) { // 5分钟
        this.cache.delete(key);
      }
    }
  }

  private initializeMetrics(): FSRS6PerformanceMetrics {
    return {
      algorithmVersion: '6.1.1',
      executionTime: 0,
      memoryUsage: 0,
      predictionAccuracy: 0,
      parameterStability: 1.0,
      convergenceRate: 0,
      cacheHitRate: 0
    };
  }

  private updatePerformanceMetrics(operation: string, executionTime: number): void {
    this.performanceMetrics.executionTime = 
      (this.performanceMetrics.executionTime + executionTime) / 2;
    
    // 更新缓存命中率
    const totalHits = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.hitCount, 0);
    this.performanceMetrics.cacheHitRate = 
      this.cache.size > 0 ? totalHits / this.cache.size : 0;
  }
}
