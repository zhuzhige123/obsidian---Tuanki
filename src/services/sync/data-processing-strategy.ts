/**
 * 数据处理策略选择器
 * 基于最佳实践方案实现，根据数据复杂度自动选择最优处理策略
 */

import type { TuankiCard } from '../../data/card-types';
import type { TriadTemplate } from '../../data/template-types';

// 数据处理策略类型
export type ProcessingStrategyType = 'fast-field-only' | 'format-preserving' | 'full-feature' | 'custom';

// 复杂度级别
export type ComplexityLevel = 'simple' | 'standard' | 'complex' | 'custom';

// 复杂度分析结果
export interface ComplexityAnalysis {
  level: ComplexityLevel;
  score: number;
  factors: string[];
  recommendations: string[];
  details: {
    contentComplexity: number;
    formatComplexity: number;
    volumeComplexity: number;
    mediaComplexity: number;
  };
}

// 数据处理策略配置
export interface ProcessingStrategy {
  type: ProcessingStrategyType;
  batchThreshold: number;
  concurrency: number;
  cacheStrategy: 'aggressive' | 'balanced' | 'conservative';
  timeout: number;
  retryAttempts: number;
  requiresFullTemplate: boolean;
  description: string;
}

// 用户偏好设置
export interface UserPreferences {
  performanceMode: 'speed' | 'balanced' | 'quality';
  deviceCapabilities: {
    memory: number;
    cpu: number;
    network: number;
  };
  usagePattern: {
    dailyCardCount: number;
    averageCardComplexity: number;
    syncFrequency: number;
  };
}

// 同步操作上下文
export interface SyncOperation {
  direction: 'to-anki' | 'from-anki' | 'bidirectional';
  cardCount: number;
  hasMedia: boolean;
  requiresFormatConversion: boolean;
  userInitiated: boolean;
}

/**
 * 同步复杂度分析器
 */
export class SyncComplexityAnalyzer {
  /**
   * 分析卡片集合的同步复杂度
   */
  analyzeCards(cards: TuankiCard[], operation: SyncOperation): ComplexityAnalysis {
    const contentComplexity = this.analyzeContentComplexity(cards);
    const formatComplexity = this.analyzeFormatComplexity(cards);
    const volumeComplexity = this.analyzeVolumeComplexity(cards, operation);
    const mediaComplexity = this.analyzeMediaComplexity(cards);

    // 计算综合复杂度分数
    const score = this.calculateOverallScore(
      contentComplexity,
      formatComplexity,
      volumeComplexity,
      mediaComplexity
    );

    const level = this.scoreToLevel(score);
    const factors = this.identifyComplexityFactors(contentComplexity, formatComplexity, volumeComplexity, mediaComplexity);
    const recommendations = this.generateRecommendations(level, factors);

    return {
      level,
      score,
      factors,
      recommendations,
      details: {
        contentComplexity,
        formatComplexity,
        volumeComplexity,
        mediaComplexity
      }
    };
  }

  /**
   * 分析内容复杂度
   */
  private analyzeContentComplexity(cards: TuankiCard[]): number {
    if (cards.length === 0) return 0;

    let totalComplexity = 0;
    
    for (const card of cards) {
      let cardComplexity = 0;
      
      for (const [fieldKey, fieldValue] of Object.entries(card.fields)) {
        // HTML 标记检测
        if (this.containsHtml(fieldValue)) {
          cardComplexity += 0.3;
        }
        
        // 复杂 Markdown 检测
        if (this.containsComplexMarkdown(fieldValue)) {
          cardComplexity += 0.2;
        }
        
        // 数学公式检测
        if (this.containsMathFormulas(fieldValue)) {
          cardComplexity += 0.2;
        }
        
        // 代码块检测
        if (this.containsCodeBlocks(fieldValue)) {
          cardComplexity += 0.1;
        }
        
        // 长文本检测
        if (fieldValue.length > 1000) {
          cardComplexity += 0.1;
        }
      }
      
      totalComplexity += Math.min(cardComplexity, 1.0); // 单卡最大复杂度为1
    }
    
    return Math.min(totalComplexity / cards.length, 1.0);
  }

  /**
   * 分析格式复杂度
   */
  private analyzeFormatComplexity(cards: TuankiCard[]): number {
    if (cards.length === 0) return 0;

    let formatComplexity = 0;
    const uniqueTemplates = new Set<string>();
    
    for (const card of cards) {
      if (card.templateId) {
        uniqueTemplates.add(card.templateId);
      }
      
      // 检查自定义格式
      if (this.hasCustomFormatting(card)) {
        formatComplexity += 0.2;
      }
    }
    
    // 模板多样性增加复杂度
    if (uniqueTemplates.size > 1) {
      formatComplexity += Math.min(uniqueTemplates.size * 0.1, 0.3);
    }
    
    return Math.min(formatComplexity / cards.length, 1.0);
  }

  /**
   * 分析数据量复杂度
   */
  private analyzeVolumeComplexity(cards: TuankiCard[], operation: SyncOperation): number {
    const cardCount = cards.length;
    
    // 基于卡片数量的复杂度
    let volumeScore = 0;
    if (cardCount > 1000) {
      volumeScore = 1.0;
    } else if (cardCount > 500) {
      volumeScore = 0.8;
    } else if (cardCount > 100) {
      volumeScore = 0.6;
    } else if (cardCount > 50) {
      volumeScore = 0.4;
    } else if (cardCount > 10) {
      volumeScore = 0.2;
    }
    
    // 双向同步增加复杂度
    if (operation.direction === 'bidirectional') {
      volumeScore += 0.2;
    }
    
    return Math.min(volumeScore, 1.0);
  }

  /**
   * 分析媒体复杂度
   */
  private analyzeMediaComplexity(cards: TuankiCard[]): number {
    if (cards.length === 0) return 0;

    let mediaCount = 0;
    let totalSize = 0;
    
    for (const card of cards) {
      for (const fieldValue of Object.values(card.fields)) {
        const mediaRefs = this.extractMediaReferences(fieldValue);
        mediaCount += mediaRefs.length;
        
        // 估算媒体大小（简化实现）
        for (const ref of mediaRefs) {
          if (ref.includes('.mp4') || ref.includes('.avi')) {
            totalSize += 10; // 视频文件权重
          } else if (ref.includes('.mp3') || ref.includes('.wav')) {
            totalSize += 3; // 音频文件权重
          } else {
            totalSize += 1; // 图片文件权重
          }
        }
      }
    }
    
    if (mediaCount === 0) return 0;
    
    // 基于媒体数量和大小计算复杂度
    const mediaComplexity = Math.min((mediaCount * 0.1) + (totalSize * 0.05), 1.0);
    return mediaComplexity;
  }

  /**
   * 计算综合复杂度分数
   */
  private calculateOverallScore(
    contentComplexity: number,
    formatComplexity: number,
    volumeComplexity: number,
    mediaComplexity: number
  ): number {
    // 加权计算
    const weights = {
      content: 0.4,
      format: 0.3,
      volume: 0.2,
      media: 0.1
    };
    
    return (
      contentComplexity * weights.content +
      formatComplexity * weights.format +
      volumeComplexity * weights.volume +
      mediaComplexity * weights.media
    );
  }

  /**
   * 将分数转换为复杂度级别
   */
  private scoreToLevel(score: number): ComplexityLevel {
    if (score >= 0.8) return 'custom';
    if (score >= 0.6) return 'complex';
    if (score >= 0.3) return 'standard';
    return 'simple';
  }

  /**
   * 识别复杂度因素
   */
  private identifyComplexityFactors(
    contentComplexity: number,
    formatComplexity: number,
    volumeComplexity: number,
    mediaComplexity: number
  ): string[] {
    const factors: string[] = [];
    
    if (contentComplexity > 0.5) factors.push('complex-content');
    if (formatComplexity > 0.5) factors.push('custom-formatting');
    if (volumeComplexity > 0.5) factors.push('large-volume');
    if (mediaComplexity > 0.3) factors.push('media-files');
    
    return factors;
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(level: ComplexityLevel, factors: string[]): string[] {
    const recommendations: string[] = [];
    
    switch (level) {
      case 'simple':
        recommendations.push('建议使用快速字段同步策略');
        break;
      case 'standard':
        recommendations.push('建议使用格式保持同步策略');
        break;
      case 'complex':
        recommendations.push('建议使用完整功能同步策略');
        break;
      case 'custom':
        recommendations.push('建议使用自定义同步策略');
        break;
    }
    
    if (factors.includes('large-volume')) {
      recommendations.push('建议启用批量处理优化');
    }
    
    if (factors.includes('media-files')) {
      recommendations.push('建议启用媒体文件缓存');
    }
    
    return recommendations;
  }

  // 辅助方法
  private containsHtml(text: string): boolean {
    return /<[^>]+>/.test(text);
  }

  private containsComplexMarkdown(text: string): boolean {
    return /(\[.*\]\(.*\)|!\[.*\]\(.*\)|```|#{3,}|\|.*\|)/.test(text);
  }

  private containsMathFormulas(text: string): boolean {
    return /(\$\$.*\$\$|\$.*\$|\\[a-zA-Z]+\{.*\})/.test(text);
  }

  private containsCodeBlocks(text: string): boolean {
    return /(```[\s\S]*?```|`[^`]+`)/.test(text);
  }

  private hasCustomFormatting(card: TuankiCard): boolean {
    // 检查是否有自定义格式
    return Object.values(card.fields).some(value => 
      this.containsHtml(value) || this.containsComplexMarkdown(value)
    );
  }

  private extractMediaReferences(text: string): string[] {
    const mediaRegex = /!\[.*?\]\((.*?)\)|<img[^>]+src="([^"]+)"|<audio[^>]+src="([^"]+)"|<video[^>]+src="([^"]+)"/g;
    const matches: string[] = [];
    let match;
    
    while ((match = mediaRegex.exec(text)) !== null) {
      const src = match[1] || match[2] || match[3] || match[4];
      if (src) matches.push(src);
    }
    
    return matches;
  }
}

/**
 * 同步策略选择器
 */
export class SyncStrategySelector {
  private predefinedStrategies: Map<SyncStrategyType, SyncStrategy>;

  constructor() {
    this.predefinedStrategies = new Map([
      ['fast-field-only', {
        type: 'fast-field-only',
        batchThreshold: 100,
        concurrency: 5,
        cacheStrategy: 'aggressive',
        timeout: 5000,
        retryAttempts: 2,
        requiresFullTemplate: false,
        description: '快速字段同步 - 仅同步结构化字段数据，性能最优'
      }],
      ['format-preserving', {
        type: 'format-preserving',
        batchThreshold: 50,
        concurrency: 3,
        cacheStrategy: 'balanced',
        timeout: 10000,
        retryAttempts: 3,
        requiresFullTemplate: true,
        description: '格式保持同步 - 同步字段数据并保持格式信息'
      }],
      ['full-feature', {
        type: 'full-feature',
        batchThreshold: 20,
        concurrency: 2,
        cacheStrategy: 'conservative',
        timeout: 15000,
        retryAttempts: 5,
        requiresFullTemplate: true,
        description: '完整功能同步 - 使用完整的三位一体模板系统'
      }]
    ]);
  }

  /**
   * 选择最优同步策略
   */
  selectStrategy(
    analysis: ComplexityAnalysis,
    preferences: UserPreferences,
    operation: SyncOperation
  ): SyncStrategy {
    // 基于复杂度级别选择基础策略
    let baseStrategy = this.selectBaseStrategy(analysis.level);
    
    // 根据用户偏好调整策略
    baseStrategy = this.adjustForUserPreferences(baseStrategy, preferences);
    
    // 根据操作上下文调整策略
    baseStrategy = this.adjustForOperation(baseStrategy, operation);
    
    return baseStrategy;
  }

  /**
   * 基于复杂度级别选择基础策略
   */
  private selectBaseStrategy(level: ComplexityLevel): SyncStrategy {
    switch (level) {
      case 'simple':
        return { ...this.predefinedStrategies.get('fast-field-only')! };
      case 'standard':
        return { ...this.predefinedStrategies.get('format-preserving')! };
      case 'complex':
      case 'custom':
        return { ...this.predefinedStrategies.get('full-feature')! };
      default:
        return { ...this.predefinedStrategies.get('format-preserving')! };
    }
  }

  /**
   * 根据用户偏好调整策略
   */
  private adjustForUserPreferences(strategy: SyncStrategy, preferences: UserPreferences): SyncStrategy {
    const adjusted = { ...strategy };
    
    // 根据性能模式调整
    switch (preferences.performanceMode) {
      case 'speed':
        adjusted.batchThreshold = Math.min(adjusted.batchThreshold * 1.5, 150);
        adjusted.concurrency = Math.min(adjusted.concurrency + 1, 6);
        adjusted.timeout = Math.max(adjusted.timeout * 0.8, 3000);
        break;
      case 'quality':
        adjusted.batchThreshold = Math.max(adjusted.batchThreshold * 0.7, 10);
        adjusted.concurrency = Math.max(adjusted.concurrency - 1, 1);
        adjusted.timeout = adjusted.timeout * 1.5;
        adjusted.retryAttempts = Math.min(adjusted.retryAttempts + 2, 8);
        break;
      // 'balanced' 保持默认设置
    }
    
    // 根据设备能力调整
    if (preferences.deviceCapabilities.memory < 0.5) {
      adjusted.batchThreshold = Math.max(adjusted.batchThreshold * 0.6, 5);
      adjusted.cacheStrategy = 'conservative';
    }
    
    if (preferences.deviceCapabilities.network < 0.5) {
      adjusted.timeout = adjusted.timeout * 2;
      adjusted.retryAttempts = Math.min(adjusted.retryAttempts + 1, 6);
    }
    
    return adjusted;
  }

  /**
   * 根据操作上下文调整策略
   */
  private adjustForOperation(strategy: SyncStrategy, operation: SyncOperation): SyncStrategy {
    const adjusted = { ...strategy };
    
    // 双向同步需要更保守的设置
    if (operation.direction === 'bidirectional') {
      adjusted.batchThreshold = Math.max(adjusted.batchThreshold * 0.8, 10);
      adjusted.retryAttempts = Math.min(adjusted.retryAttempts + 1, 6);
    }
    
    // 包含媒体文件时调整
    if (operation.hasMedia) {
      adjusted.timeout = adjusted.timeout * 2;
      adjusted.batchThreshold = Math.max(adjusted.batchThreshold * 0.6, 5);
    }
    
    // 大量卡片时启用批量优化
    if (operation.cardCount > 100) {
      adjusted.concurrency = Math.min(adjusted.concurrency + 1, 5);
    }
    
    return adjusted;
  }

  /**
   * 创建自定义策略
   */
  createCustomStrategy(
    analysis: ComplexityAnalysis,
    preferences: UserPreferences,
    operation: SyncOperation
  ): SyncStrategy {
    // 基于分析结果创建完全自定义的策略
    return {
      type: 'custom',
      batchThreshold: this.calculateOptimalBatchSize(analysis, operation),
      concurrency: this.calculateOptimalConcurrency(preferences),
      cacheStrategy: this.selectOptimalCacheStrategy(analysis, preferences),
      timeout: this.calculateOptimalTimeout(analysis, operation),
      retryAttempts: this.calculateOptimalRetryAttempts(analysis),
      requiresFullTemplate: analysis.level !== 'simple',
      description: `自定义策略 - 基于复杂度 ${analysis.level} 优化`
    };
  }

  // 自定义策略计算方法
  private calculateOptimalBatchSize(analysis: ComplexityAnalysis, operation: SyncOperation): number {
    let baseSize = 30;
    
    if (analysis.details.volumeComplexity > 0.7) baseSize = 50;
    if (analysis.details.contentComplexity > 0.7) baseSize = Math.max(baseSize * 0.6, 10);
    if (operation.hasMedia) baseSize = Math.max(baseSize * 0.5, 5);
    
    return Math.round(baseSize);
  }

  private calculateOptimalConcurrency(preferences: UserPreferences): number {
    let concurrency = 3;
    
    if (preferences.deviceCapabilities.cpu > 0.8) concurrency = 4;
    if (preferences.deviceCapabilities.memory < 0.5) concurrency = 2;
    if (preferences.deviceCapabilities.network < 0.5) concurrency = 2;
    
    return concurrency;
  }

  private selectOptimalCacheStrategy(
    analysis: ComplexityAnalysis,
    preferences: UserPreferences
  ): 'aggressive' | 'balanced' | 'conservative' {
    if (preferences.deviceCapabilities.memory > 0.8 && analysis.level === 'simple') {
      return 'aggressive';
    }
    
    if (preferences.deviceCapabilities.memory < 0.5 || analysis.level === 'complex') {
      return 'conservative';
    }
    
    return 'balanced';
  }

  private calculateOptimalTimeout(analysis: ComplexityAnalysis, operation: SyncOperation): number {
    let timeout = 8000;
    
    if (analysis.details.contentComplexity > 0.7) timeout *= 1.5;
    if (operation.hasMedia) timeout *= 2;
    if (operation.direction === 'bidirectional') timeout *= 1.3;
    
    return Math.round(timeout);
  }

  private calculateOptimalRetryAttempts(analysis: ComplexityAnalysis): number {
    let attempts = 3;
    
    if (analysis.level === 'complex' || analysis.level === 'custom') attempts = 5;
    if (analysis.details.mediaComplexity > 0.5) attempts += 1;
    
    return Math.min(attempts, 8);
  }
}
