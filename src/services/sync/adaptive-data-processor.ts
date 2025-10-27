/**
 * 自适应数据处理器
 * 使用智能策略选择器来执行最优的数据处理操作
 */

import type { TuankiCard } from '../../data/card-types';
import type { TriadTemplate } from '../../data/template-types';
import {
  SyncComplexityAnalyzer,
  SyncStrategySelector,
  type ComplexityAnalysis,
  type ProcessingStrategy,
  type SyncOperation,
  type UserPreferences
} from './data-processing-strategy';

// 同步结果接口
export interface SyncResult {
  success: boolean;
  processedCards: number;
  failedCards: number;
  duration: number;
  strategy: SyncStrategy;
  analysis: ComplexityAnalysis;
  errors: SyncError[];
  performance: PerformanceMetrics;
}

export interface SyncError {
  cardId: string;
  error: string;
  retryable: boolean;
  timestamp: number;
}

export interface PerformanceMetrics {
  throughput: number; // 卡片/秒
  averageLatency: number; // 毫秒
  cacheHitRate: number; // 百分比
  memoryUsage: number; // MB
  networkRequests: number;
}

// 同步处理器接口
export interface SyncProcessor {
  process(cards: TuankiCard[], templates: TriadTemplate[]): Promise<SyncResult>;
}

/**
 * 快速字段同步处理器
 */
export class FastFieldSyncProcessor implements SyncProcessor {
  async process(cards: TuankiCard[], templates: TriadTemplate[]): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let processedCards = 0;

    console.log(`🚀 使用快速字段同步策略处理 ${cards.length} 张卡片`);

    try {
      // 快速字段映射，不使用复杂的模板转换
      for (const card of cards) {
        try {
          await this.processCardFast(card);
          processedCards++;
        } catch (error) {
          errors.push({
            cardId: card.id,
            error: error instanceof Error ? error.message : String(error),
            retryable: true,
            timestamp: Date.now()
          });
        }
      }

      const duration = Date.now() - startTime;
      
      return {
        success: errors.length === 0,
        processedCards,
        failedCards: errors.length,
        duration,
        strategy: {
          type: 'fast-field-only',
          batchThreshold: 100,
          concurrency: 5,
          cacheStrategy: 'aggressive',
          timeout: 5000,
          retryAttempts: 2,
          requiresFullTemplate: false,
          description: '快速字段同步'
        },
        analysis: {} as ComplexityAnalysis, // 简化实现
        errors,
        performance: {
          throughput: processedCards / (duration / 1000),
          averageLatency: duration / processedCards,
          cacheHitRate: 0.9, // 模拟值
          memoryUsage: 10, // 模拟值
          networkRequests: processedCards
        }
      };
    } catch (error) {
      throw new Error(`快速同步处理失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processCardFast(card: TuankiCard): Promise<void> {
    // 模拟快速处理
    await new Promise(resolve => setTimeout(resolve, 10));
    console.log(`✅ 快速处理卡片: ${card.id}`);
  }
}

/**
 * 格式保持同步处理器
 */
export class FormatPreservingSyncProcessor implements SyncProcessor {
  async process(cards: TuankiCard[], templates: TriadTemplate[]): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let processedCards = 0;

    console.log(`🎨 使用格式保持同步策略处理 ${cards.length} 张卡片`);

    try {
      for (const card of cards) {
        try {
          const template = templates.find(t => t.id === card.templateId);
          await this.processCardWithFormat(card, template);
          processedCards++;
        } catch (error) {
          errors.push({
            cardId: card.id,
            error: error instanceof Error ? error.message : String(error),
            retryable: true,
            timestamp: Date.now()
          });
        }
      }

      const duration = Date.now() - startTime;
      
      return {
        success: errors.length === 0,
        processedCards,
        failedCards: errors.length,
        duration,
        strategy: {
          type: 'format-preserving',
          batchThreshold: 50,
          concurrency: 3,
          cacheStrategy: 'balanced',
          timeout: 10000,
          retryAttempts: 3,
          requiresFullTemplate: true,
          description: '格式保持同步'
        },
        analysis: {} as ComplexityAnalysis,
        errors,
        performance: {
          throughput: processedCards / (duration / 1000),
          averageLatency: duration / processedCards,
          cacheHitRate: 0.8,
          memoryUsage: 25,
          networkRequests: processedCards
        }
      };
    } catch (error) {
      throw new Error(`格式保持同步处理失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processCardWithFormat(card: TuankiCard, template?: TriadTemplate): Promise<void> {
    // 模拟格式处理
    await new Promise(resolve => setTimeout(resolve, 25));
    console.log(`🎨 格式处理卡片: ${card.id}${template ? ` (模板: ${template.name})` : ''}`);
  }
}

/**
 * 完整功能同步处理器
 */
export class FullFeatureSyncProcessor implements SyncProcessor {
  async process(cards: TuankiCard[], templates: TriadTemplate[]): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let processedCards = 0;

    console.log(`🔧 使用完整功能同步策略处理 ${cards.length} 张卡片`);

    try {
      for (const card of cards) {
        try {
          const template = templates.find(t => t.id === card.templateId);
          await this.processCardFull(card, template);
          processedCards++;
        } catch (error) {
          errors.push({
            cardId: card.id,
            error: error instanceof Error ? error.message : String(error),
            retryable: true,
            timestamp: Date.now()
          });
        }
      }

      const duration = Date.now() - startTime;
      
      return {
        success: errors.length === 0,
        processedCards,
        failedCards: errors.length,
        duration,
        strategy: {
          type: 'full-feature',
          batchThreshold: 20,
          concurrency: 2,
          cacheStrategy: 'conservative',
          timeout: 15000,
          retryAttempts: 5,
          requiresFullTemplate: true,
          description: '完整功能同步'
        },
        analysis: {} as ComplexityAnalysis,
        errors,
        performance: {
          throughput: processedCards / (duration / 1000),
          averageLatency: duration / processedCards,
          cacheHitRate: 0.7,
          memoryUsage: 50,
          networkRequests: processedCards * 1.5 // 更多的API调用
        }
      };
    } catch (error) {
      throw new Error(`完整功能同步处理失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processCardFull(card: TuankiCard, template?: TriadTemplate): Promise<void> {
    // 模拟完整处理
    await new Promise(resolve => setTimeout(resolve, 50));
    console.log(`🔧 完整处理卡片: ${card.id}${template ? ` (模板: ${template.name})` : ''}`);
  }
}

/**
 * 自适应同步处理器
 * 根据分析结果自动选择最优的处理策略
 */
export class AdaptiveSyncProcessor {
  private complexityAnalyzer: SyncComplexityAnalyzer;
  private strategySelector: SyncStrategySelector;
  private processors: Map<string, SyncProcessor>;

  constructor() {
    this.complexityAnalyzer = new SyncComplexityAnalyzer();
    this.strategySelector = new SyncStrategySelector();
    this.processors = new Map([
      ['fast-field-only', new FastFieldSyncProcessor()],
      ['format-preserving', new FormatPreservingSyncProcessor()],
      ['full-feature', new FullFeatureSyncProcessor()]
    ]);
  }

  /**
   * 执行自适应同步
   */
  async performAdaptiveSync(
    cards: TuankiCard[],
    templates: TriadTemplate[],
    operation: SyncOperation,
    preferences: UserPreferences
  ): Promise<SyncResult> {
    console.log(`🧠 开始自适应同步分析 - ${cards.length} 张卡片`);

    // 1. 分析复杂度
    const analysis = this.complexityAnalyzer.analyzeCards(cards, operation);
    console.log(`📊 复杂度分析结果: ${analysis.level} (分数: ${analysis.score.toFixed(2)})`);
    console.log(`📋 复杂度因素: ${analysis.factors.join(', ')}`);

    // 2. 选择策略
    const strategy = this.strategySelector.selectStrategy(analysis, preferences, operation);
    console.log(`🎯 选择策略: ${strategy.type} - ${strategy.description}`);

    // 3. 获取处理器
    const processor = this.processors.get(strategy.type);
    if (!processor) {
      throw new Error(`未找到策略处理器: ${strategy.type}`);
    }

    // 4. 执行同步
    const startTime = Date.now();
    try {
      const result = await processor.process(cards, templates);
      
      // 5. 更新结果中的分析信息
      result.analysis = analysis;
      result.strategy = strategy;
      
      const duration = Date.now() - startTime;
      console.log(`✅ 同步完成 - 耗时: ${duration}ms, 成功: ${result.processedCards}, 失败: ${result.failedCards}`);
      console.log(`📈 性能指标 - 吞吐量: ${result.performance.throughput.toFixed(2)} 卡片/秒`);

      return result;
    } catch (error) {
      console.error(`❌ 同步失败:`, error);
      throw error;
    }
  }

  /**
   * 获取策略建议
   */
  getStrategyRecommendation(
    cards: TuankiCard[],
    operation: SyncOperation,
    preferences: UserPreferences
  ): { analysis: ComplexityAnalysis; strategy: SyncStrategy; recommendations: string[] } {
    const analysis = this.complexityAnalyzer.analyzeCards(cards, operation);
    const strategy = this.strategySelector.selectStrategy(analysis, preferences, operation);
    
    return {
      analysis,
      strategy,
      recommendations: [
        ...analysis.recommendations,
        `建议批量大小: ${strategy.batchThreshold}`,
        `建议并发数: ${strategy.concurrency}`,
        `缓存策略: ${strategy.cacheStrategy}`
      ]
    };
  }

  /**
   * 性能基准测试
   */
  async runPerformanceBenchmark(
    testCards: TuankiCard[],
    templates: TriadTemplate[]
  ): Promise<Map<string, PerformanceMetrics>> {
    const results = new Map<string, PerformanceMetrics>();
    
    const testOperation: SyncOperation = {
      direction: 'to-anki',
      cardCount: testCards.length,
      hasMedia: false,
      requiresFormatConversion: false,
      userInitiated: true
    };

    const testPreferences: UserPreferences = {
      performanceMode: 'balanced',
      deviceCapabilities: { memory: 0.8, cpu: 0.8, network: 0.8 },
      usagePattern: { dailyCardCount: 50, averageCardComplexity: 0.5, syncFrequency: 2 }
    };

    console.log(`🏃‍♂️ 开始性能基准测试 - ${testCards.length} 张测试卡片`);

    // 测试每种策略
    for (const [strategyType, processor] of this.processors) {
      console.log(`📊 测试策略: ${strategyType}`);
      
      try {
        const result = await processor.process([...testCards], templates);
        results.set(strategyType, result.performance);
        
        console.log(`✅ ${strategyType} 完成 - 吞吐量: ${result.performance.throughput.toFixed(2)} 卡片/秒`);
      } catch (error) {
        console.error(`❌ ${strategyType} 测试失败:`, error);
      }
    }

    return results;
  }
}
