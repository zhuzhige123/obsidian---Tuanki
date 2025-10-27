/**
 * 解析性能监控器
 * 监控SimplifiedCardParser的性能指标和优化建议
 */

export interface PerformanceMetrics {
  parseTime: number;
  cacheHitRate: number;
  memoryUsage: number;
  successRate: number;
  averageConfidence: number;
  errorCount: number;
  totalOperations: number;
}

export interface PerformanceAlert {
  type: 'warning' | 'error' | 'info';
  message: string;
  metric: keyof PerformanceMetrics;
  threshold: number;
  currentValue: number;
  suggestion: string;
}

export interface PerformanceReport {
  timestamp: number;
  metrics: PerformanceMetrics;
  alerts: PerformanceAlert[];
  recommendations: string[];
  trends: {
    parseTimeChange: number;
    cacheEfficiencyChange: number;
    successRateChange: number;
  };
}

/**
 * 解析性能监控器
 */
export class ParsingPerformanceMonitor {
  private metrics: PerformanceMetrics;
  private operationHistory: Array<{
    timestamp: number;
    operation: string;
    duration: number;
    success: boolean;
    confidence?: number;
    cacheHit?: boolean;
  }> = [];
  
  private readonly MAX_HISTORY_SIZE = 1000;
  private readonly PERFORMANCE_THRESHOLDS = {
    maxParseTime: 100, // ms
    minCacheHitRate: 0.6, // 60%
    maxMemoryUsage: 50 * 1024 * 1024, // 50MB
    minSuccessRate: 0.85, // 85%
    minAverageConfidence: 0.7, // 70%
    maxErrorRate: 0.1 // 10%
  };

  constructor() {
    this.metrics = {
      parseTime: 0,
      cacheHitRate: 0,
      memoryUsage: 0,
      successRate: 0,
      averageConfidence: 0,
      errorCount: 0,
      totalOperations: 0
    };
  }

  /**
   * 记录解析操作
   */
  recordOperation(
    operation: string,
    duration: number,
    success: boolean,
    confidence?: number,
    cacheHit?: boolean
  ): void {
    const record = {
      timestamp: Date.now(),
      operation,
      duration,
      success,
      confidence,
      cacheHit
    };

    this.operationHistory.push(record);
    
    // 限制历史记录大小
    if (this.operationHistory.length > this.MAX_HISTORY_SIZE) {
      this.operationHistory.shift();
    }

    // 更新指标
    this.updateMetrics();
  }

  /**
   * 更新性能指标
   */
  private updateMetrics(): void {
    if (this.operationHistory.length === 0) return;

    const recent = this.operationHistory.slice(-100); // 最近100次操作
    
    // 计算平均解析时间
    this.metrics.parseTime = recent.reduce((sum, op) => sum + op.duration, 0) / recent.length;
    
    // 计算缓存命中率
    const cacheOperations = recent.filter(op => op.cacheHit !== undefined);
    if (cacheOperations.length > 0) {
      const cacheHits = cacheOperations.filter(op => op.cacheHit).length;
      this.metrics.cacheHitRate = cacheHits / cacheOperations.length;
    }
    
    // 计算成功率
    const successfulOps = recent.filter(op => op.success).length;
    this.metrics.successRate = successfulOps / recent.length;
    
    // 计算平均置信度
    const confidenceOps = recent.filter(op => op.confidence !== undefined);
    if (confidenceOps.length > 0) {
      const totalConfidence = confidenceOps.reduce((sum, op) => sum + (op.confidence || 0), 0);
      this.metrics.averageConfidence = totalConfidence / confidenceOps.length;
    }
    
    // 计算错误数量
    this.metrics.errorCount = recent.filter(op => !op.success).length;
    this.metrics.totalOperations = recent.length;
    
    // 估算内存使用
    this.metrics.memoryUsage = this.estimateMemoryUsage();
  }

  /**
   * 估算内存使用量
   */
  private estimateMemoryUsage(): number {
    // 简单估算：每个历史记录约200字节
    const historySize = this.operationHistory.length * 200;
    
    // 加上其他估算的内存使用
    const baseMemory = 1024 * 1024; // 1MB基础内存
    
    return historySize + baseMemory;
  }

  /**
   * 生成性能报告
   */
  generateReport(): PerformanceReport {
    const alerts = this.checkPerformanceAlerts();
    const recommendations = this.generateRecommendations();
    const trends = this.calculateTrends();

    return {
      timestamp: Date.now(),
      metrics: { ...this.metrics },
      alerts,
      recommendations,
      trends
    };
  }

  /**
   * 检查性能警报
   */
  private checkPerformanceAlerts(): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    // 检查解析时间
    if (this.metrics.parseTime > this.PERFORMANCE_THRESHOLDS.maxParseTime) {
      alerts.push({
        type: 'warning',
        message: '解析时间过长',
        metric: 'parseTime',
        threshold: this.PERFORMANCE_THRESHOLDS.maxParseTime,
        currentValue: this.metrics.parseTime,
        suggestion: '考虑优化解析算法或增加缓存'
      });
    }

    // 检查缓存命中率
    if (this.metrics.cacheHitRate < this.PERFORMANCE_THRESHOLDS.minCacheHitRate) {
      alerts.push({
        type: 'info',
        message: '缓存命中率较低',
        metric: 'cacheHitRate',
        threshold: this.PERFORMANCE_THRESHOLDS.minCacheHitRate,
        currentValue: this.metrics.cacheHitRate,
        suggestion: '检查缓存策略或增加缓存大小'
      });
    }

    // 检查成功率
    if (this.metrics.successRate < this.PERFORMANCE_THRESHOLDS.minSuccessRate) {
      alerts.push({
        type: 'error',
        message: '解析成功率过低',
        metric: 'successRate',
        threshold: this.PERFORMANCE_THRESHOLDS.minSuccessRate,
        currentValue: this.metrics.successRate,
        suggestion: '检查解析逻辑或改进错误处理'
      });
    }

    // 检查平均置信度
    if (this.metrics.averageConfidence < this.PERFORMANCE_THRESHOLDS.minAverageConfidence) {
      alerts.push({
        type: 'warning',
        message: '解析置信度较低',
        metric: 'averageConfidence',
        threshold: this.PERFORMANCE_THRESHOLDS.minAverageConfidence,
        currentValue: this.metrics.averageConfidence,
        suggestion: '改进内容识别算法或调整置信度计算'
      });
    }

    return alerts;
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.metrics.parseTime > 50) {
      recommendations.push('考虑实施更积极的缓存策略');
    }

    if (this.metrics.cacheHitRate < 0.5) {
      recommendations.push('优化缓存键生成算法，提高缓存复用率');
    }

    if (this.metrics.successRate < 0.9) {
      recommendations.push('增强错误处理和恢复机制');
    }

    if (this.metrics.averageConfidence < 0.6) {
      recommendations.push('改进智能边界检测算法');
      recommendations.push('增强语义内容提取能力');
    }

    if (this.metrics.memoryUsage > 30 * 1024 * 1024) {
      recommendations.push('实施内存清理策略，定期清理历史记录');
    }

    return recommendations;
  }

  /**
   * 计算性能趋势
   */
  private calculateTrends(): PerformanceReport['trends'] {
    if (this.operationHistory.length < 50) {
      return {
        parseTimeChange: 0,
        cacheEfficiencyChange: 0,
        successRateChange: 0
      };
    }

    const recent = this.operationHistory.slice(-25);
    const previous = this.operationHistory.slice(-50, -25);

    const recentAvgTime = recent.reduce((sum, op) => sum + op.duration, 0) / recent.length;
    const previousAvgTime = previous.reduce((sum, op) => sum + op.duration, 0) / previous.length;

    const recentSuccessRate = recent.filter(op => op.success).length / recent.length;
    const previousSuccessRate = previous.filter(op => op.success).length / previous.length;

    const recentCacheHits = recent.filter(op => op.cacheHit).length;
    const recentCacheOps = recent.filter(op => op.cacheHit !== undefined).length;
    const recentCacheRate = recentCacheOps > 0 ? recentCacheHits / recentCacheOps : 0;

    const previousCacheHits = previous.filter(op => op.cacheHit).length;
    const previousCacheOps = previous.filter(op => op.cacheHit !== undefined).length;
    const previousCacheRate = previousCacheOps > 0 ? previousCacheHits / previousCacheOps : 0;

    return {
      parseTimeChange: ((recentAvgTime - previousAvgTime) / previousAvgTime) * 100,
      cacheEfficiencyChange: ((recentCacheRate - previousCacheRate) / (previousCacheRate || 1)) * 100,
      successRateChange: ((recentSuccessRate - previousSuccessRate) / (previousSuccessRate || 1)) * 100
    };
  }

  /**
   * 获取当前指标
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * 重置监控数据
   */
  reset(): void {
    this.operationHistory = [];
    this.metrics = {
      parseTime: 0,
      cacheHitRate: 0,
      memoryUsage: 0,
      successRate: 0,
      averageConfidence: 0,
      errorCount: 0,
      totalOperations: 0
    };
  }

  /**
   * 导出性能数据
   */
  exportData(): {
    metrics: PerformanceMetrics;
    history: typeof this.operationHistory;
    report: PerformanceReport;
  } {
    return {
      metrics: this.getMetrics(),
      history: [...this.operationHistory],
      report: this.generateReport()
    };
  }
}

/**
 * 系统性能监控器
 * 扩展解析性能监控，提供全系统性能监控
 */
export class SystemPerformanceMonitor extends ParsingPerformanceMonitor {
  private memoryMonitor: NodeJS.Timeout | null = null;
  private performanceObserver: PerformanceObserver | null = null;
  private systemMetrics = {
    memoryUsage: 0,
    cpuUsage: 0,
    renderFrameRate: 0,
    networkLatency: 0,
    storageOperations: 0
  };

  constructor() {
    super();
    this.setupSystemMonitoring();
  }

  /**
   * 设置系统监控
   */
  private setupSystemMonitoring(): void {
    this.setupMemoryMonitoring();
    this.setupPerformanceObserver();
    this.setupNetworkMonitoring();
  }

  /**
   * 设置内存监控
   */
  private setupMemoryMonitoring(): void {
    this.memoryMonitor = setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        this.systemMetrics.memoryUsage = memory.usedJSHeapSize / 1024 / 1024; // MB
      }
    }, 5000);
  }

  /**
   * 设置性能观察器
   */
  private setupPerformanceObserver(): void {
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();

        entries.forEach(entry => {
          if (entry.entryType === 'measure') {
            this.recordOperation(
              `system_${entry.name}`,
              entry.duration,
              true,
              1,
              false
            );
          }
        });
      });

      this.performanceObserver.observe({
        entryTypes: ['measure', 'navigation', 'resource']
      });
    }
  }

  /**
   * 设置网络监控
   */
  private setupNetworkMonitoring(): void {
    // 监控网络请求性能
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();

      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();

        this.recordOperation(
          'network_request',
          endTime - startTime,
          response.ok,
          response.ok ? 1 : 0,
          false
        );

        return response;
      } catch (error) {
        const endTime = performance.now();

        this.recordOperation(
          'network_request',
          endTime - startTime,
          false,
          0,
          false
        );

        throw error;
      }
    };
  }

  /**
   * 记录存储操作
   */
  recordStorageOperation(operation: string, duration: number, success: boolean): void {
    this.systemMetrics.storageOperations++;
    this.recordOperation(`storage_${operation}`, duration, success, success ? 1 : 0, false);
  }

  /**
   * 记录渲染性能
   */
  recordRenderPerformance(componentName: string, renderTime: number): void {
    this.recordOperation(`render_${componentName}`, renderTime, true, 1, false);
  }

  /**
   * 获取系统指标
   */
  getSystemMetrics() {
    return {
      ...this.getMetrics(),
      ...this.systemMetrics,
      timestamp: Date.now()
    };
  }

  /**
   * 生成性能报告
   */
  generateSystemReport(): SystemPerformanceReport {
    const baseReport = this.generateReport();

    return {
      ...baseReport,
      systemMetrics: this.systemMetrics,
      recommendations: this.generateSystemRecommendations(),
      healthScore: this.calculateSystemHealthScore()
    };
  }

  /**
   * 生成系统优化建议
   */
  private generateSystemRecommendations(): string[] {
    const recommendations: string[] = [];
    const metrics = this.getSystemMetrics();

    // 内存使用建议
    if (metrics.memoryUsage > 100) {
      recommendations.push('内存使用过高，建议清理缓存或减少同时处理的数据量');
    }

    // 解析性能建议
    if (metrics.parseTime > 200) {
      recommendations.push('解析性能较慢，建议启用缓存或优化解析算法');
    }

    // 缓存命中率建议
    if (metrics.cacheHitRate < 0.5) {
      recommendations.push('缓存命中率较低，建议调整缓存策略或增加缓存大小');
    }

    // 错误率建议
    if (metrics.errorRate > 0.05) {
      recommendations.push('错误率较高，建议检查数据质量或增强错误处理');
    }

    return recommendations;
  }

  /**
   * 计算系统健康分数
   */
  private calculateSystemHealthScore(): number {
    const metrics = this.getSystemMetrics();
    let score = 100;

    // 内存使用影响 (0-20分)
    if (metrics.memoryUsage > 150) score -= 20;
    else if (metrics.memoryUsage > 100) score -= 10;
    else if (metrics.memoryUsage > 50) score -= 5;

    // 解析性能影响 (0-25分)
    if (metrics.parseTime > 500) score -= 25;
    else if (metrics.parseTime > 200) score -= 15;
    else if (metrics.parseTime > 100) score -= 5;

    // 缓存效率影响 (0-20分)
    if (metrics.cacheHitRate < 0.3) score -= 20;
    else if (metrics.cacheHitRate < 0.5) score -= 10;
    else if (metrics.cacheHitRate < 0.7) score -= 5;

    // 错误率影响 (0-25分)
    if (metrics.errorRate > 0.1) score -= 25;
    else if (metrics.errorRate > 0.05) score -= 15;
    else if (metrics.errorRate > 0.02) score -= 5;

    // 成功率影响 (0-10分)
    if (metrics.successRate < 0.8) score -= 10;
    else if (metrics.successRate < 0.9) score -= 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 清理系统监控
   */
  destroy(): void {
    super.destroy();

    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor);
      this.memoryMonitor = null;
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
  }
}

// 系统性能报告接口
export interface SystemPerformanceReport extends PerformanceReport {
  systemMetrics: {
    memoryUsage: number;
    cpuUsage: number;
    renderFrameRate: number;
    networkLatency: number;
    storageOperations: number;
  };
  recommendations: string[];
  healthScore: number;
}

/**
 * 全局性能监控器实例
 */
export const globalPerformanceMonitor = new SystemPerformanceMonitor();
