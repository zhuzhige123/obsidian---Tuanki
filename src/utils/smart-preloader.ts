/**
 * 智能预加载系统
 * 基于用户行为模式预测和预加载数据
 */

import { DEFAULT_ANALYTICS_CONFIG } from '../config/analytics-config';
import { smartCache } from './smart-cache';

// ============================================================================
// 类型定义
// ============================================================================

export interface UserBehaviorPattern {
  action: string;
  timestamp: number;
  context: Record<string, any>;
  frequency: number;
}

export interface PreloadRule {
  name: string;
  trigger: (pattern: UserBehaviorPattern) => boolean;
  predictor: (pattern: UserBehaviorPattern) => string[];
  loader: (keys: string[]) => Promise<Record<string, any>>;
  priority: number;
  confidence: number;
}

export interface PreloadStats {
  totalPredictions: number;
  successfulPreloads: number;
  cacheHits: number;
  accuracy: number;
  timeSaved: number;
}

// ============================================================================
// 智能预加载服务
// ============================================================================

export class SmartPreloaderService {
  private static instance: SmartPreloaderService;
  private behaviorHistory: UserBehaviorPattern[] = [];
  private preloadRules: PreloadRule[] = [];
  private stats: PreloadStats = {
    totalPredictions: 0,
    successfulPreloads: 0,
    cacheHits: 0,
    accuracy: 0,
    timeSaved: 0
  };
  private config = DEFAULT_ANALYTICS_CONFIG.performance;
  private isEnabled = true;

  private constructor() {
    this.initializeDefaultRules();
  }

  static getInstance(): SmartPreloaderService {
    if (!SmartPreloaderService.instance) {
      SmartPreloaderService.instance = new SmartPreloaderService();
    }
    return SmartPreloaderService.instance;
  }

  /**
   * 记录用户行为
   */
  recordBehavior(action: string, context: Record<string, any> = {}): void {
    if (!this.isEnabled) return;

    const pattern: UserBehaviorPattern = {
      action,
      timestamp: Date.now(),
      context,
      frequency: 1
    };

    // 检查是否已有相似行为
    const existing = this.behaviorHistory.find(p => 
      p.action === action && 
      JSON.stringify(p.context) === JSON.stringify(context)
    );

    if (existing) {
      existing.frequency++;
      existing.timestamp = Date.now();
    } else {
      this.behaviorHistory.push(pattern);
    }

    // 限制历史记录大小（优化：从1000/500降低到100/50，大幅减少内存占用）
    if (this.behaviorHistory.length > 100) {
      this.behaviorHistory = this.behaviorHistory.slice(-50);
    }

    // 触发预加载检查
    this.checkPreloadOpportunities(pattern);
  }

  /**
   * 添加预加载规则
   */
  addPreloadRule(rule: PreloadRule): void {
    this.preloadRules.push(rule);
    this.preloadRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 预测用户下一步行为
   */
  predictNextActions(currentAction: string, context: Record<string, any> = {}): string[] {
    const predictions: string[] = [];
    const recentPatterns = this.getRecentPatterns(10);

    // 基于序列模式预测
    const sequencePatterns = this.findSequencePatterns(currentAction, recentPatterns);
    predictions.push(...sequencePatterns);

    // 基于时间模式预测
    const timePatterns = this.findTimeBasedPatterns(currentAction, context);
    predictions.push(...timePatterns);

    // 基于频率模式预测
    const frequencyPatterns = this.findFrequencyPatterns(currentAction, context);
    predictions.push(...frequencyPatterns);

    // 去重并按置信度排序
    return [...new Set(predictions)].slice(0, 5);
  }

  /**
   * 手动触发预加载
   */
  async triggerPreload(keys: string[]): Promise<void> {
    if (!this.isEnabled || keys.length === 0) return;

    const startTime = performance.now();
    let successCount = 0;

    for (const key of keys) {
      try {
        // 检查是否已缓存
        if (smartCache.has(key)) {
          this.stats.cacheHits++;
          continue;
        }

        // 查找合适的加载器
        const rule = this.preloadRules.find(r => r.predictor({ 
          action: 'manual', 
          timestamp: Date.now(), 
          context: {}, 
          frequency: 1 
        }).includes(key));

        if (rule) {
          await rule.loader([key]);
          successCount++;
          console.log(`🚀 Preloaded: ${key}`);
        }
      } catch (error) {
        console.warn(`🚀 Preload failed for ${key}:`, error);
      }
    }

    const duration = performance.now() - startTime;
    this.stats.totalPredictions += keys.length;
    this.stats.successfulPreloads += successCount;
    this.stats.timeSaved += duration;
    this.updateAccuracy();
  }

  /**
   * 获取预加载统计
   */
  getStats(): PreloadStats {
    return { ...this.stats };
  }

  /**
   * 清理历史数据
   */
  clearHistory(): void {
    this.behaviorHistory = [];
    this.stats = {
      totalPredictions: 0,
      successfulPreloads: 0,
      cacheHits: 0,
      accuracy: 0,
      timeSaved: 0
    };
  }

  /**
   * 启用/禁用预加载
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private initializeDefaultRules(): void {
    // 时间范围切换预加载规则
    this.addPreloadRule({
      name: 'range-switch-preload',
      priority: 10,
      confidence: 0.8,
      trigger: (pattern) => pattern.action === 'range-change',
      predictor: (pattern) => {
        const currentRange = pattern.context.range;
        const adjacentRanges = this.getAdjacentRanges(currentRange);
        return adjacentRanges.map(range => `analytics-data-${range}`);
      },
      loader: async (keys) => {
        // 这里应该调用实际的数据加载逻辑
        return {};
      }
    });

    // 牌组选择预加载规则
    this.addPreloadRule({
      name: 'deck-selection-preload',
      priority: 8,
      confidence: 0.7,
      trigger: (pattern) => pattern.action === 'deck-toggle',
      predictor: (pattern) => {
        // 预测用户可能选择的其他牌组
        const selectedDecks = pattern.context.selectedDecks || [];
        return [`analytics-data-decks-${selectedDecks.join(',')}`];
      },
      loader: async (keys) => {
        return {};
      }
    });

    // 详细视图预加载规则
    this.addPreloadRule({
      name: 'detail-view-preload',
      priority: 6,
      confidence: 0.6,
      trigger: (pattern) => pattern.action === 'chart-hover',
      predictor: (pattern) => {
        // 当用户悬停在图表上时，预加载详细数据
        const chartType = pattern.context.chartType;
        return [`${chartType}-detail-data`];
      },
      loader: async (keys) => {
        return {};
      }
    });
  }

  private checkPreloadOpportunities(pattern: UserBehaviorPattern): void {
    for (const rule of this.preloadRules) {
      if (rule.trigger(pattern)) {
        const predictions = rule.predictor(pattern);
        if (predictions.length > 0) {
          // 异步执行预加载，不阻塞当前操作
          setTimeout(() => {
            this.triggerPreload(predictions);
          }, 100);
        }
      }
    }
  }

  private getRecentPatterns(count: number): UserBehaviorPattern[] {
    return this.behaviorHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count);
  }

  private findSequencePatterns(currentAction: string, recentPatterns: UserBehaviorPattern[]): string[] {
    const sequences: string[] = [];
    
    // 查找在当前行为之后经常出现的行为
    for (let i = 0; i < recentPatterns.length - 1; i++) {
      if (recentPatterns[i].action === currentAction) {
        const nextAction = recentPatterns[i + 1].action;
        if (!sequences.includes(nextAction)) {
          sequences.push(nextAction);
        }
      }
    }
    
    return sequences;
  }

  private findTimeBasedPatterns(currentAction: string, context: Record<string, any>): string[] {
    const now = new Date();
    const currentHour = now.getHours();
    const patterns: string[] = [];

    // 基于时间的行为模式
    const timeBasedBehaviors = this.behaviorHistory.filter(p => {
      const patternTime = new Date(p.timestamp);
      return Math.abs(patternTime.getHours() - currentHour) <= 1;
    });

    const commonActions = this.getMostFrequentActions(timeBasedBehaviors, 3);
    patterns.push(...commonActions);

    return patterns;
  }

  private findFrequencyPatterns(currentAction: string, context: Record<string, any>): string[] {
    // 获取最频繁的行为
    const actionFrequency = new Map<string, number>();
    
    this.behaviorHistory.forEach(pattern => {
      const count = actionFrequency.get(pattern.action) || 0;
      actionFrequency.set(pattern.action, count + pattern.frequency);
    });

    return Array.from(actionFrequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([action]) => action)
      .filter(action => action !== currentAction);
  }

  private getMostFrequentActions(patterns: UserBehaviorPattern[], count: number): string[] {
    const frequency = new Map<string, number>();
    
    patterns.forEach(pattern => {
      const current = frequency.get(pattern.action) || 0;
      frequency.set(pattern.action, current + pattern.frequency);
    });

    return Array.from(frequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, count)
      .map(([action]) => action);
  }

  private getAdjacentRanges(currentRange: string): string[] {
    const rangeMap: Record<string, string[]> = {
      '7': ['30'],
      '30': ['7', '90'],
      '90': ['30', 'year'],
      'year': ['90'],
      'all': ['year']
    };

    return rangeMap[currentRange] || [];
  }

  private updateAccuracy(): void {
    if (this.stats.totalPredictions > 0) {
      this.stats.accuracy = (this.stats.successfulPreloads + this.stats.cacheHits) / this.stats.totalPredictions;
    }
  }
}

// ============================================================================
// 导出实例和工具函数
// ============================================================================

export const smartPreloader = SmartPreloaderService.getInstance();

// 便捷的行为记录装饰器
export function trackBehavior(action: string, contextExtractor?: (...args: any[]) => Record<string, any>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      const context = contextExtractor ? contextExtractor(...args) : {};
      smartPreloader.recordBehavior(action, context);
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}
