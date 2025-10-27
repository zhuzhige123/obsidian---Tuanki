/**
 * 用户反馈系统
 * 实现用户反馈收集、使用统计分析和智能优化建议系统
 */

import { writable, derived, type Writable } from 'svelte/store';

// 反馈类型枚举
export enum FeedbackType {
  BUG_REPORT = 'bug_report',
  FEATURE_REQUEST = 'feature_request',
  PERFORMANCE_ISSUE = 'performance_issue',
  UI_IMPROVEMENT = 'ui_improvement',
  GENERAL_FEEDBACK = 'general_feedback',
  RATING = 'rating'
}

// 反馈优先级
export enum FeedbackPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// 用户反馈接口
export interface UserFeedback {
  id: string;
  type: FeedbackType;
  priority: FeedbackPriority;
  title: string;
  description: string;
  rating?: number; // 1-5 星评分
  timestamp: number;
  userId?: string;
  version: string;
  context: {
    page: string;
    feature: string;
    userAgent: string;
    screenResolution: string;
    performanceMetrics?: Record<string, number>;
    errorLogs?: string[];
  };
  attachments?: string[]; // 截图或文件路径
  status: 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';
  tags: string[];
  upvotes: number;
  downvotes: number;
}

// 使用统计接口
export interface UsageStatistics {
  id: string;
  timestamp: number;
  sessionId: string;
  feature: string;
  action: string;
  duration: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

// 智能建议接口
export interface SmartSuggestion {
  id: string;
  type: 'feature' | 'workflow' | 'performance' | 'learning';
  title: string;
  description: string;
  confidence: number; // 0-1 置信度
  impact: 'low' | 'medium' | 'high';
  effort: 'easy' | 'medium' | 'hard';
  category: string;
  basedOn: string[]; // 基于哪些数据生成的建议
  actionable: boolean;
  action?: () => void;
  dismissed: boolean;
  implemented: boolean;
}

// 用户行为模式
export interface UserPattern {
  id: string;
  pattern: string;
  frequency: number;
  lastOccurrence: number;
  confidence: number;
  category: 'workflow' | 'preference' | 'issue' | 'efficiency';
  description: string;
  suggestions: string[];
}

/**
 * 用户反馈服务类
 */
export class UserFeedbackService {
  private feedbacks: UserFeedback[] = [];
  private statistics: UsageStatistics[] = [];
  private suggestions: SmartSuggestion[] = [];
  private patterns: UserPattern[] = [];
  private currentSessionId: string;

  // 配置选项
  private config = {
    maxFeedbackHistory: 500,
    maxStatisticsHistory: 2000,
    analysisInterval: 60000, // 1分钟
    autoSuggestionEnabled: true,
    anonymousMode: false,
    dataRetentionDays: 30
  };

  // 全局状态存储
  public readonly activeFeedbacks = writable<UserFeedback[]>([]);
  public readonly recentStatistics = writable<UsageStatistics[]>([]);
  public readonly smartSuggestions = writable<SmartSuggestion[]>([]);
  public readonly userPatterns = writable<UserPattern[]>([]);

  // 计算属性
  public readonly feedbackSummary = derived(
    [this.activeFeedbacks],
    ([feedbacks]) => this.calculateFeedbackSummary(feedbacks)
  );

  public readonly usageInsights = derived(
    [this.recentStatistics],
    ([stats]) => this.calculateUsageInsights(stats)
  );

  constructor() {
    this.currentSessionId = this.generateSessionId();
    this.loadStoredData();
    this.startAnalysisLoop();
  }

  /**
   * 提交用户反馈
   */
  submitFeedback(
    type: FeedbackType,
    title: string,
    description: string,
    rating?: number,
    attachments?: string[]
  ): string {
    const feedback: UserFeedback = {
      id: `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      priority: this.determinePriority(type, description),
      title,
      description,
      rating,
      timestamp: Date.now(),
      version: this.getPluginVersion(),
      context: this.collectContext(),
      attachments,
      status: 'pending',
      tags: this.generateTags(type, title, description),
      upvotes: 0,
      downvotes: 0
    };

    this.feedbacks.push(feedback);
    this.updateActiveFeedbacks();
    this.saveData();

    // 自动分析反馈
    this.analyzeFeedback(feedback);

    console.log('📝 用户反馈已提交:', feedback.id);
    return feedback.id;
  }

  /**
   * 记录使用统计
   */
  recordUsage(
    feature: string,
    action: string,
    duration: number,
    success: boolean,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): void {
    const stat: UsageStatistics = {
      id: `stat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      sessionId: this.currentSessionId,
      feature,
      action,
      duration,
      success,
      errorMessage,
      metadata
    };

    this.statistics.push(stat);
    this.updateRecentStatistics();

    // 限制历史记录大小
    if (this.statistics.length > this.config.maxStatisticsHistory) {
      this.statistics.splice(0, this.statistics.length - this.config.maxStatisticsHistory);
    }

    // 实时分析使用模式
    this.analyzeUsagePattern(stat);
  }

  /**
   * 获取智能建议
   */
  getSmartSuggestions(category?: string): SmartSuggestion[] {
    let suggestions = this.suggestions.filter(s => !s.dismissed);
    
    if (category) {
      suggestions = suggestions.filter(s => s.category === category);
    }

    // 按置信度和影响力排序
    return suggestions.sort((a, b) => {
      const scoreA = a.confidence * this.getImpactScore(a.impact);
      const scoreB = b.confidence * this.getImpactScore(b.impact);
      return scoreB - scoreA;
    });
  }

  /**
   * 应用建议
   */
  applySuggestion(suggestionId: string): boolean {
    const suggestion = this.suggestions.find(s => s.id === suggestionId);
    if (!suggestion || !suggestion.actionable || !suggestion.action) {
      return false;
    }

    try {
      suggestion.action();
      suggestion.implemented = true;
      this.updateSmartSuggestions();
      console.log(`✅ 已应用建议: ${suggestion.title}`);
      return true;
    } catch (error) {
      console.error(`应用建议失败: ${suggestion.title}`, error);
      return false;
    }
  }

  /**
   * 忽略建议
   */
  dismissSuggestion(suggestionId: string): void {
    const suggestion = this.suggestions.find(s => s.id === suggestionId);
    if (suggestion) {
      suggestion.dismissed = true;
      this.updateSmartSuggestions();
      console.log(`🔇 已忽略建议: ${suggestion.title}`);
    }
  }

  /**
   * 获取用户行为模式
   */
  getUserPatterns(category?: string): UserPattern[] {
    let patterns = this.patterns;
    
    if (category) {
      patterns = patterns.filter(p => p.category === category);
    }

    // 按频率和置信度排序
    return patterns.sort((a, b) => {
      const scoreA = a.frequency * a.confidence;
      const scoreB = b.frequency * b.confidence;
      return scoreB - scoreA;
    });
  }

  /**
   * 获取反馈统计
   */
  getFeedbackStatistics(): {
    total: number;
    byType: Record<FeedbackType, number>;
    byPriority: Record<FeedbackPriority, number>;
    averageRating: number;
    resolutionRate: number;
  } {
    const total = this.feedbacks.length;
    const byType = Object.values(FeedbackType).reduce((acc, type) => {
      acc[type] = this.feedbacks.filter(f => f.type === type).length;
      return acc;
    }, {} as Record<FeedbackType, number>);

    const byPriority = Object.values(FeedbackPriority).reduce((acc, priority) => {
      acc[priority] = this.feedbacks.filter(f => f.priority === priority).length;
      return acc;
    }, {} as Record<FeedbackPriority, number>);

    const ratingsWithValues = this.feedbacks.filter(f => f.rating !== undefined);
    const averageRating = ratingsWithValues.length > 0
      ? ratingsWithValues.reduce((sum, f) => sum + f.rating!, 0) / ratingsWithValues.length
      : 0;

    const resolvedCount = this.feedbacks.filter(f => f.status === 'resolved').length;
    const resolutionRate = total > 0 ? resolvedCount / total : 0;

    return {
      total,
      byType,
      byPriority,
      averageRating,
      resolutionRate
    };
  }

  /**
   * 导出反馈数据
   */
  exportFeedbackData(): string {
    const data = {
      feedbacks: this.feedbacks,
      statistics: this.statistics,
      suggestions: this.suggestions,
      patterns: this.patterns,
      exportTime: Date.now(),
      version: this.getPluginVersion()
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * 清理过期数据
   */
  cleanupExpiredData(): void {
    const cutoffTime = Date.now() - (this.config.dataRetentionDays * 24 * 60 * 60 * 1000);

    // 清理过期反馈
    const beforeFeedbackCount = this.feedbacks.length;
    this.feedbacks = this.feedbacks.filter(f => f.timestamp > cutoffTime);

    // 清理过期统计
    const beforeStatsCount = this.statistics.length;
    this.statistics = this.statistics.filter(s => s.timestamp > cutoffTime);

    // 清理过期模式
    const beforePatternsCount = this.patterns.length;
    this.patterns = this.patterns.filter(p => p.lastOccurrence > cutoffTime);

    console.log(`🧹 数据清理完成: 反馈 ${beforeFeedbackCount - this.feedbacks.length}, 统计 ${beforeStatsCount - this.statistics.length}, 模式 ${beforePatternsCount - this.patterns.length}`);

    this.updateAllStores();
    this.saveData();
  }

  // 私有方法

  /**
   * 生成会话ID
   */
  // 🔄 重构：使用统一ID生成系统
  private generateSessionId(): string {
    const { generateSessionID } = require('../../utils/unified-id-generator');
    return generateSessionID();
  }

  /**
   * 确定反馈优先级
   */
  private determinePriority(type: FeedbackType, description: string): FeedbackPriority {
    // 关键词检测
    const criticalKeywords = ['crash', 'error', 'broken', '崩溃', '错误', '无法使用'];
    const highKeywords = ['slow', 'performance', '慢', '性能', '卡顿'];

    const lowerDescription = description.toLowerCase();

    if (type === FeedbackType.BUG_REPORT && criticalKeywords.some(keyword => lowerDescription.includes(keyword))) {
      return FeedbackPriority.CRITICAL;
    }

    if (type === FeedbackType.PERFORMANCE_ISSUE || highKeywords.some(keyword => lowerDescription.includes(keyword))) {
      return FeedbackPriority.HIGH;
    }

    if (type === FeedbackType.BUG_REPORT) {
      return FeedbackPriority.MEDIUM;
    }

    return FeedbackPriority.LOW;
  }

  /**
   * 收集上下文信息
   */
  private collectContext(): UserFeedback['context'] {
    return {
      page: window.location.pathname,
      feature: 'unknown', // 可以通过其他方式获取当前功能
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      performanceMetrics: this.collectPerformanceMetrics(),
      errorLogs: this.getRecentErrorLogs()
    };
  }

  /**
   * 收集性能指标
   */
  private collectPerformanceMetrics(): Record<string, number> {
    const metrics: Record<string, number> = {};

    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      metrics.memoryUsed = memInfo.usedJSHeapSize / (1024 * 1024); // MB
      metrics.memoryTotal = memInfo.totalJSHeapSize / (1024 * 1024); // MB
    }

    if (performance.timing) {
      metrics.loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
    }

    return metrics;
  }

  /**
   * 获取最近的错误日志
   */
  private getRecentErrorLogs(): string[] {
    // 这里可以集成实际的错误日志系统
    return [];
  }

  /**
   * 生成标签
   */
  private generateTags(type: FeedbackType, title: string, description: string): string[] {
    const tags = [type];
    const text = `${title} ${description}`.toLowerCase();

    // 自动标签检测
    const tagMap = {
      'ui': ['界面', 'ui', 'interface', '按钮', 'button'],
      'performance': ['性能', 'performance', '慢', 'slow', '卡顿'],
      'sync': ['同步', 'sync', 'anki'],
      'template': ['模板', 'template'],
      'card': ['卡片', 'card'],
      'mobile': ['移动', 'mobile', '手机', 'phone']
    };

    for (const [tag, keywords] of Object.entries(tagMap)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        tags.push(tag);
      }
    }

    return tags;
  }

  /**
   * 分析反馈
   */
  private analyzeFeedback(feedback: UserFeedback): void {
    // 检查是否是重复问题
    const similarFeedbacks = this.feedbacks.filter(f => 
      f.id !== feedback.id && 
      f.type === feedback.type &&
      this.calculateSimilarity(f.title, feedback.title) > 0.7
    );

    if (similarFeedbacks.length > 0) {
      console.log(`🔍 检测到相似反馈: ${similarFeedbacks.length} 个`);
      // 可以自动合并或标记为重复
    }

    // 生成改进建议
    this.generateImprovementSuggestions(feedback);
  }

  /**
   * 分析使用模式
   */
  private analyzeUsagePattern(stat: UsageStatistics): void {
    // 检测频繁使用的功能
    const recentStats = this.statistics.slice(-100);
    const featureUsage = new Map<string, number>();

    recentStats.forEach(s => {
      featureUsage.set(s.feature, (featureUsage.get(s.feature) || 0) + 1);
    });

    // 识别高频功能
    for (const [feature, count] of featureUsage) {
      if (count > 10) {
        this.updateOrCreatePattern({
          id: `pattern-frequent-${feature}`,
          pattern: `frequent_use_${feature}`,
          frequency: count,
          lastOccurrence: Date.now(),
          confidence: Math.min(count / 20, 1),
          category: 'workflow',
          description: `频繁使用功能: ${feature}`,
          suggestions: [`为 ${feature} 添加快捷键`, `优化 ${feature} 的性能`]
        });
      }
    }
  }

  /**
   * 生成改进建议
   */
  private generateImprovementSuggestions(feedback: UserFeedback): void {
    if (feedback.type === FeedbackType.PERFORMANCE_ISSUE) {
      this.addSuggestion({
        id: `suggestion-perf-${Date.now()}`,
        type: 'performance',
        title: '启用性能优化',
        description: '基于性能反馈，建议启用内存优化和缓存机制',
        confidence: 0.8,
        impact: 'high',
        effort: 'easy',
        category: 'performance',
        basedOn: [feedback.id],
        actionable: true,
        action: () => this.enablePerformanceOptimizations(),
        dismissed: false,
        implemented: false
      });
    }

    if (feedback.type === FeedbackType.UI_IMPROVEMENT) {
      this.addSuggestion({
        id: `suggestion-ui-${Date.now()}`,
        type: 'feature',
        title: '界面优化',
        description: '基于UI反馈，建议优化用户界面设计',
        confidence: 0.7,
        impact: 'medium',
        effort: 'medium',
        category: 'ui',
        basedOn: [feedback.id],
        actionable: false,
        dismissed: false,
        implemented: false
      });
    }
  }

  /**
   * 启动分析循环
   */
  private startAnalysisLoop(): void {
    setInterval(() => {
      if (this.config.autoSuggestionEnabled) {
        this.generatePeriodicSuggestions();
      }
      this.cleanupExpiredData();
    }, this.config.analysisInterval);
  }

  /**
   * 生成周期性建议
   */
  private generatePeriodicSuggestions(): void {
    // 基于使用统计生成建议
    const recentStats = this.statistics.slice(-50);
    const errorRate = recentStats.filter(s => !s.success).length / recentStats.length;

    if (errorRate > 0.1) { // 错误率超过10%
      this.addSuggestion({
        id: `suggestion-error-rate-${Date.now()}`,
        type: 'performance',
        title: '降低错误率',
        description: '检测到较高的错误率，建议启用调试模式和错误恢复机制',
        confidence: 0.9,
        impact: 'high',
        effort: 'easy',
        category: 'reliability',
        basedOn: ['usage_statistics'],
        actionable: true,
        action: () => this.enableErrorRecovery(),
        dismissed: false,
        implemented: false
      });
    }
  }

  /**
   * 计算文本相似度
   */
  private calculateSimilarity(text1: string, text2: string): number {
    // 简化的相似度计算
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    return intersection.length / union.length;
  }

  /**
   * 获取影响力分数
   */
  private getImpactScore(impact: string): number {
    const scores = { low: 1, medium: 2, high: 3 };
    return scores[impact as keyof typeof scores] || 1;
  }

  /**
   * 获取插件版本
   */
  private getPluginVersion(): string {
    return '1.0.0'; // 从实际的插件配置获取
  }

  /**
   * 计算反馈摘要
   */
  private calculateFeedbackSummary(feedbacks: UserFeedback[]) {
    return {
      total: feedbacks.length,
      pending: feedbacks.filter(f => f.status === 'pending').length,
      resolved: feedbacks.filter(f => f.status === 'resolved').length,
      averageRating: feedbacks.filter(f => f.rating).reduce((sum, f) => sum + f.rating!, 0) / feedbacks.filter(f => f.rating).length || 0
    };
  }

  /**
   * 计算使用洞察
   */
  private calculateUsageInsights(stats: UsageStatistics[]) {
    const features = new Map<string, number>();
    stats.forEach(s => {
      features.set(s.feature, (features.get(s.feature) || 0) + 1);
    });

    return {
      totalActions: stats.length,
      uniqueFeatures: features.size,
      mostUsedFeature: Array.from(features.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none',
      successRate: stats.filter(s => s.success).length / stats.length || 0
    };
  }

  /**
   * 更新或创建模式
   */
  private updateOrCreatePattern(pattern: UserPattern): void {
    const existingIndex = this.patterns.findIndex(p => p.id === pattern.id);
    if (existingIndex >= 0) {
      this.patterns[existingIndex] = pattern;
    } else {
      this.patterns.push(pattern);
    }
    this.updateUserPatterns();
  }

  /**
   * 添加建议
   */
  private addSuggestion(suggestion: SmartSuggestion): void {
    // 检查是否已存在相同建议
    const exists = this.suggestions.some(s => s.title === suggestion.title && !s.dismissed);
    if (!exists) {
      this.suggestions.push(suggestion);
      this.updateSmartSuggestions();
    }
  }

  /**
   * 更新所有存储
   */
  private updateAllStores(): void {
    this.updateActiveFeedbacks();
    this.updateRecentStatistics();
    this.updateSmartSuggestions();
    this.updateUserPatterns();
  }

  /**
   * 更新活跃反馈
   */
  private updateActiveFeedbacks(): void {
    this.activeFeedbacks.set([...this.feedbacks]);
  }

  /**
   * 更新最近统计
   */
  private updateRecentStatistics(): void {
    this.recentStatistics.set(this.statistics.slice(-100));
  }

  /**
   * 更新智能建议
   */
  private updateSmartSuggestions(): void {
    this.smartSuggestions.set([...this.suggestions]);
  }

  /**
   * 更新用户模式
   */
  private updateUserPatterns(): void {
    this.userPatterns.set([...this.patterns]);
  }

  /**
   * 加载存储的数据
   */
  private loadStoredData(): void {
    try {
      const stored = localStorage.getItem('tuanki-feedback-data');
      if (stored) {
        const data = JSON.parse(stored);
        this.feedbacks = data.feedbacks || [];
        this.statistics = data.statistics || [];
        this.suggestions = data.suggestions || [];
        this.patterns = data.patterns || [];
        this.updateAllStores();
        console.log('✅ 反馈数据加载成功');
      }
    } catch (error) {
      console.warn('反馈数据加载失败:', error);
    }
  }

  /**
   * 保存数据
   */
  private saveData(): void {
    try {
      const data = {
        feedbacks: this.feedbacks,
        statistics: this.statistics,
        suggestions: this.suggestions,
        patterns: this.patterns,
        lastSaved: Date.now()
      };
      localStorage.setItem('tuanki-feedback-data', JSON.stringify(data));
    } catch (error) {
      console.error('反馈数据保存失败:', error);
    }
  }

  // 优化操作实现
  private enablePerformanceOptimizations(): void {
    console.log('🚀 启用性能优化');
  }

  private enableErrorRecovery(): void {
    console.log('🛡️ 启用错误恢复机制');
  }
}

// 创建全局实例
export const userFeedbackService = new UserFeedbackService();
