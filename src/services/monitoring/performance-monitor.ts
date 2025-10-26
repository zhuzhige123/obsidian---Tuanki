/**
 * 性能监控系统
 * 建立全面的性能监控系统，包括实时性能指标收集、性能瓶颈检测和性能报告生成
 */

import { writable, derived, type Writable } from 'svelte/store';

// 性能指标类型
export enum MetricType {
  MEMORY = 'memory',
  CPU = 'cpu',
  NETWORK = 'network',
  RENDER = 'render',
  INTERACTION = 'interaction',
  STORAGE = 'storage',
  CUSTOM = 'custom'
}

// 性能指标接口
export interface PerformanceMetric {
  id: string;
  type: MetricType;
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  context?: Record<string, any>;
  threshold?: {
    warning: number;
    critical: number;
  };
}

// 性能报告接口
export interface PerformanceReport {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  metrics: PerformanceMetric[];
  summary: {
    averageMemory: number;
    peakMemory: number;
    averageCPU: number;
    peakCPU: number;
    totalInteractions: number;
    averageResponseTime: number;
    errorCount: number;
  };
  bottlenecks: PerformanceBottleneck[];
  recommendations: string[];
}

// 性能瓶颈接口
export interface PerformanceBottleneck {
  id: string;
  type: 'memory' | 'cpu' | 'network' | 'render' | 'storage';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  suggestion: string;
  detectedAt: number;
  duration: number;
  metrics: PerformanceMetric[];
}

// 性能阈值配置
export interface PerformanceThresholds {
  memory: {
    warning: number; // MB
    critical: number; // MB
  };
  cpu: {
    warning: number; // %
    critical: number; // %
  };
  responseTime: {
    warning: number; // ms
    critical: number; // ms
  };
  renderTime: {
    warning: number; // ms
    critical: number; // ms
  };
}

/**
 * 性能监控器类
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private reports: PerformanceReport[] = [];
  private bottlenecks: PerformanceBottleneck[] = [];
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private reportingInterval?: NodeJS.Timeout;
  private currentSessionId: string;

  // 配置选项 - 根据环境动态调整
  private config = {
    // 开发模式：频繁收集，保留更多历史
    // 生产模式：降低频率，减少内存占用
    collectInterval: this.getCollectInterval(),
    maxMetricsHistory: this.getMaxMetricsHistory(),
    maxReportsHistory: this.getMaxReportsHistory(),
    enableAutoReporting: this.isProductionMode() ? false : true,
    reportInterval: 300000, // 5分钟
    enableBottleneckDetection: this.isProductionMode() ? false : true
  };

  /**
   * 检测是否为生产模式
   */
  private isProductionMode(): boolean {
    // 检查多个指标来判断是否为生产环境
    return (
      // @ts-ignore - Obsidian 插件环境检测
      typeof process === 'undefined' || 
      // @ts-ignore
      process.env?.NODE_ENV === 'production' ||
      // 没有开发者工具打开
      !console.table ||
      // 性能优先模式（可通过设置配置）
      localStorage.getItem('tuanki-performance-mode') === 'production'
    );
  }

  /**
   * 获取收集间隔
   */
  private getCollectInterval(): number {
    return this.isProductionMode() ? 30000 : 1000; // 生产: 30秒, 开发: 1秒
  }

  /**
   * 获取最大指标历史记录数
   */
  private getMaxMetricsHistory(): number {
    return this.isProductionMode() ? 50 : 1000; // 生产: 50, 开发: 1000
  }

  /**
   * 获取最大报告历史记录数
   */
  private getMaxReportsHistory(): number {
    return this.isProductionMode() ? 5 : 50; // 生产: 5, 开发: 50
  }

  // 性能阈值
  private thresholds: PerformanceThresholds = {
    memory: { warning: 100, critical: 200 }, // MB
    cpu: { warning: 70, critical: 90 }, // %
    responseTime: { warning: 1000, critical: 3000 }, // ms
    renderTime: { warning: 100, critical: 300 } // ms
  };

  // 全局状态存储
  public readonly currentMetrics = writable<Record<MetricType, PerformanceMetric | null>>({
    [MetricType.MEMORY]: null,
    [MetricType.CPU]: null,
    [MetricType.NETWORK]: null,
    [MetricType.RENDER]: null,
    [MetricType.INTERACTION]: null,
    [MetricType.STORAGE]: null,
    [MetricType.CUSTOM]: null
  });

  public readonly recentReports = writable<PerformanceReport[]>([]);
  public readonly activeBottlenecks = writable<PerformanceBottleneck[]>([]);
  public readonly monitoringStatus = writable<boolean>(false);

  // 计算属性
  public readonly performanceScore = derived(
    [this.currentMetrics],
    ([metrics]) => this.calculatePerformanceScore(metrics)
  );

  public readonly healthStatus = derived(
    [this.activeBottlenecks],
    ([bottlenecks]) => this.calculateHealthStatus(bottlenecks)
  );

  constructor() {
    this.currentSessionId = this.generateSessionId();
    this.initializeMetricCollectors();
    
    // 记录性能模式
    const mode = this.isProductionMode() ? '生产模式' : '开发模式';
    console.log(`📊 性能监控系统初始化 - ${mode}`);
    console.log(`   收集间隔: ${this.config.collectInterval}ms`);
    console.log(`   最大指标数: ${this.config.maxMetricsHistory}`);
    console.log(`   瓶颈检测: ${this.config.enableBottleneckDetection ? '启用' : '禁用'}`);
  }

  /**
   * 开始监控
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringStatus.set(true);

    // 开始定期收集指标
    this.monitoringInterval = setInterval(() => {
      this.collectAllMetrics();
    }, this.config.collectInterval);

    // 开始自动报告（修复：保存interval引用）
    if (this.config.enableAutoReporting) {
      this.reportingInterval = setInterval(() => {
        this.generatePerformanceReport();
      }, this.config.reportInterval);
    }

    const mode = this.isProductionMode() ? '生产模式' : '开发模式';
    console.log(`📊 性能监控已启动 (${mode}, 间隔: ${this.config.collectInterval}ms)`);
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    this.monitoringStatus.set(false);

    // 清理监控定时器
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // 清理报告定时器
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
      this.reportingInterval = undefined;
    }

    console.log('⏹️ 性能监控已停止');
  }

  /**
   * 记录自定义指标
   */
  recordMetric(
    name: string,
    value: number,
    unit: string = '',
    context?: Record<string, any>
  ): void {
    const metric: PerformanceMetric = {
      id: `metric-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: MetricType.CUSTOM,
      name,
      value,
      unit,
      timestamp: Date.now(),
      context
    };

    this.addMetric(metric);
  }

  /**
   * 记录交互性能
   */
  recordInteraction(
    action: string,
    startTime: number,
    endTime: number,
    success: boolean = true
  ): void {
    const duration = endTime - startTime;
    
    const metric: PerformanceMetric = {
      id: `interaction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: MetricType.INTERACTION,
      name: `interaction_${action}`,
      value: duration,
      unit: 'ms',
      timestamp: endTime,
      context: { action, success },
      threshold: this.thresholds.responseTime
    };

    this.addMetric(metric);

    // 检查是否超过阈值
    if (duration > this.thresholds.responseTime.critical) {
      this.detectBottleneck('render', 'critical', `交互响应时间过长: ${action}`, duration);
    } else if (duration > this.thresholds.responseTime.warning) {
      this.detectBottleneck('render', 'medium', `交互响应时间较慢: ${action}`, duration);
    }
  }

  /**
   * 生成性能报告
   */
  generatePerformanceReport(): PerformanceReport {
    const now = Date.now();
    const reportDuration = this.config.reportInterval;
    const startTime = now - reportDuration;

    // 获取时间范围内的指标
    const relevantMetrics = this.metrics.filter(m => 
      m.timestamp >= startTime && m.timestamp <= now
    );

    const report: PerformanceReport = {
      id: `report-${now}-${Math.random().toString(36).substr(2, 9)}`,
      startTime,
      endTime: now,
      duration: reportDuration,
      metrics: relevantMetrics,
      summary: this.calculateSummary(relevantMetrics),
      bottlenecks: this.bottlenecks.filter(b => 
        b.detectedAt >= startTime && b.detectedAt <= now
      ),
      recommendations: this.generateRecommendations(relevantMetrics)
    };

    this.reports.push(report);

    // 限制报告历史大小
    if (this.reports.length > this.config.maxReportsHistory) {
      this.reports.splice(0, this.reports.length - this.config.maxReportsHistory);
    }

    this.recentReports.set([...this.reports]);

    console.log('📋 性能报告已生成:', report.id);
    return report;
  }

  /**
   * 获取性能趋势
   */
  getPerformanceTrend(metricType: MetricType, duration: number = 300000): {
    trend: 'improving' | 'stable' | 'degrading';
    change: number;
    data: { timestamp: number; value: number }[];
  } {
    const now = Date.now();
    const startTime = now - duration;

    const relevantMetrics = this.metrics
      .filter(m => m.type === metricType && m.timestamp >= startTime)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (relevantMetrics.length < 2) {
      return {
        trend: 'stable',
        change: 0,
        data: relevantMetrics.map(m => ({ timestamp: m.timestamp, value: m.value }))
      };
    }

    const firstHalf = relevantMetrics.slice(0, Math.floor(relevantMetrics.length / 2));
    const secondHalf = relevantMetrics.slice(Math.floor(relevantMetrics.length / 2));

    const firstAvg = firstHalf.reduce((sum, m) => sum + m.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, m) => sum + m.value, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (Math.abs(change) > 5) {
      // 对于内存和响应时间，增加是坏的；对于吞吐量，增加是好的
      const isNegativeMetric = metricType === MetricType.MEMORY || 
                              metricType === MetricType.RENDER ||
                              metricType === MetricType.INTERACTION;
      
      if (isNegativeMetric) {
        trend = change > 0 ? 'degrading' : 'improving';
      } else {
        trend = change > 0 ? 'improving' : 'degrading';
      }
    }

    return {
      trend,
      change,
      data: relevantMetrics.map(m => ({ timestamp: m.timestamp, value: m.value }))
    };
  }

  /**
   * 获取瓶颈分析
   */
  getBottleneckAnalysis(): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    recent: PerformanceBottleneck[];
  } {
    const recentBottlenecks = this.bottlenecks.filter(b => 
      Date.now() - b.detectedAt < 3600000 // 最近1小时
    );

    const byType = recentBottlenecks.reduce((acc, b) => {
      acc[b.type] = (acc[b.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bySeverity = recentBottlenecks.reduce((acc, b) => {
      acc[b.severity] = (acc[b.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: recentBottlenecks.length,
      byType,
      bySeverity,
      recent: recentBottlenecks.slice(-10) // 最近10个
    };
  }

  /**
   * 更新性能阈值
   */
  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('⚙️ 性能阈值已更新');
  }

  /**
   * 导出性能数据
   */
  exportPerformanceData(): string {
    const data = {
      sessionId: this.currentSessionId,
      exportTime: Date.now(),
      metrics: this.metrics,
      reports: this.reports,
      bottlenecks: this.bottlenecks,
      thresholds: this.thresholds,
      config: this.config
    };

    return JSON.stringify(data, null, 2);
  }

  // 私有方法

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 初始化指标收集器
   */
  private initializeMetricCollectors(): void {
    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.recordMetric('page_visibility', 0, 'boolean', { visible: false });
      } else {
        this.recordMetric('page_visibility', 1, 'boolean', { visible: true });
      }
    });

    // 监听网络状态变化
    window.addEventListener('online', () => {
      this.recordMetric('network_status', 1, 'boolean', { online: true });
    });

    window.addEventListener('offline', () => {
      this.recordMetric('network_status', 0, 'boolean', { online: false });
    });
  }

  /**
   * 收集所有指标
   */
  private collectAllMetrics(): void {
    this.collectMemoryMetrics();
    this.collectCPUMetrics();
    this.collectNetworkMetrics();
    this.collectRenderMetrics();
    this.collectStorageMetrics();
  }

  /**
   * 收集内存指标
   */
  private collectMemoryMetrics(): void {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      const usedMemory = memInfo.usedJSHeapSize / (1024 * 1024); // MB

      const metric: PerformanceMetric = {
        id: `memory-${Date.now()}`,
        type: MetricType.MEMORY,
        name: 'heap_used',
        value: usedMemory,
        unit: 'MB',
        timestamp: Date.now(),
        context: {
          total: memInfo.totalJSHeapSize / (1024 * 1024),
          limit: memInfo.jsHeapSizeLimit / (1024 * 1024)
        },
        threshold: this.thresholds.memory
      };

      this.addMetric(metric);

      // 检查内存阈值
      if (usedMemory > this.thresholds.memory.critical) {
        this.detectBottleneck('memory', 'critical', '内存使用量过高', usedMemory);
      } else if (usedMemory > this.thresholds.memory.warning) {
        this.detectBottleneck('memory', 'medium', '内存使用量较高', usedMemory);
      }
    }
  }

  /**
   * 收集CPU指标
   */
  private collectCPUMetrics(): void {
    // 简化的CPU使用率估算
    const startTime = performance.now();
    
    // 执行一个小的计算任务来估算CPU负载
    let result = 0;
    for (let i = 0; i < 10000; i++) {
      result += Math.sqrt(i);
    }
    
    const duration = performance.now() - startTime;
    const estimatedCPU = Math.min(100, duration * 10); // 简化估算

    const metric: PerformanceMetric = {
      id: `cpu-${Date.now()}`,
      type: MetricType.CPU,
      name: 'cpu_usage',
      value: estimatedCPU,
      unit: '%',
      timestamp: Date.now(),
      threshold: this.thresholds.cpu
    };

    this.addMetric(metric);
  }

  /**
   * 收集网络指标
   */
  private collectNetworkMetrics(): void {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      const metric: PerformanceMetric = {
        id: `network-${Date.now()}`,
        type: MetricType.NETWORK,
        name: 'connection_quality',
        value: this.getConnectionScore(connection.effectiveType),
        unit: 'score',
        timestamp: Date.now(),
        context: {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt
        }
      };

      this.addMetric(metric);
    }
  }

  /**
   * 收集渲染指标
   */
  private collectRenderMetrics(): void {
    const startTime = performance.now();
    
    requestAnimationFrame(() => {
      const renderTime = performance.now() - startTime;
      
      const metric: PerformanceMetric = {
        id: `render-${Date.now()}`,
        type: MetricType.RENDER,
        name: 'frame_time',
        value: renderTime,
        unit: 'ms',
        timestamp: Date.now(),
        threshold: this.thresholds.renderTime
      };

      this.addMetric(metric);

      // 检查渲染性能
      if (renderTime > this.thresholds.renderTime.critical) {
        this.detectBottleneck('render', 'high', '渲染时间过长', renderTime);
      }
    });
  }

  /**
   * 收集存储指标
   */
  private collectStorageMetrics(): void {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(estimate => {
        if (estimate.quota && estimate.usage) {
          const usagePercent = (estimate.usage / estimate.quota) * 100;
          
          const metric: PerformanceMetric = {
            id: `storage-${Date.now()}`,
            type: MetricType.STORAGE,
            name: 'storage_usage',
            value: usagePercent,
            unit: '%',
            timestamp: Date.now(),
            context: {
              used: estimate.usage,
              quota: estimate.quota
            }
          };

          this.addMetric(metric);
        }
      });
    }
  }

  /**
   * 添加指标
   */
  private addMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // 更新当前指标
    this.currentMetrics.update(current => ({
      ...current,
      [metric.type]: metric
    }));

    // 限制指标历史大小
    if (this.metrics.length > this.config.maxMetricsHistory) {
      this.metrics.splice(0, this.metrics.length - this.config.maxMetricsHistory);
    }
  }

  /**
   * 检测性能瓶颈
   */
  private detectBottleneck(
    type: PerformanceBottleneck['type'],
    severity: PerformanceBottleneck['severity'],
    description: string,
    value: number
  ): void {
    if (!this.config.enableBottleneckDetection) return;

    const bottleneck: PerformanceBottleneck = {
      id: `bottleneck-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      description,
      impact: this.getImpactDescription(type, severity),
      suggestion: this.getSuggestion(type, severity),
      detectedAt: Date.now(),
      duration: 0, // 将在后续更新
      metrics: this.metrics.slice(-5) // 最近5个指标
    };

    this.bottlenecks.push(bottleneck);
    this.activeBottlenecks.set([...this.bottlenecks.slice(-10)]);

    console.warn(`🚨 检测到性能瓶颈: ${description} (${severity})`);
  }

  /**
   * 计算性能分数
   */
  private calculatePerformanceScore(metrics: Record<MetricType, PerformanceMetric | null>): number {
    let score = 100;
    let validMetrics = 0;

    Object.values(metrics).forEach(metric => {
      if (!metric || !metric.threshold) return;

      validMetrics++;
      const { warning, critical } = metric.threshold;

      if (metric.value >= critical) {
        score -= 30;
      } else if (metric.value >= warning) {
        score -= 15;
      }
    });

    return Math.max(0, score);
  }

  /**
   * 计算健康状态
   */
  private calculateHealthStatus(bottlenecks: PerformanceBottleneck[]): 'healthy' | 'warning' | 'critical' {
    const recentBottlenecks = bottlenecks.filter(b => 
      Date.now() - b.detectedAt < 300000 // 最近5分钟
    );

    const criticalCount = recentBottlenecks.filter(b => b.severity === 'critical').length;
    const highCount = recentBottlenecks.filter(b => b.severity === 'high').length;

    if (criticalCount > 0) return 'critical';
    if (highCount > 2) return 'warning';
    return 'healthy';
  }

  /**
   * 计算摘要
   */
  private calculateSummary(metrics: PerformanceMetric[]): PerformanceReport['summary'] {
    const memoryMetrics = metrics.filter(m => m.type === MetricType.MEMORY);
    const cpuMetrics = metrics.filter(m => m.type === MetricType.CPU);
    const interactionMetrics = metrics.filter(m => m.type === MetricType.INTERACTION);

    return {
      averageMemory: this.calculateAverage(memoryMetrics),
      peakMemory: this.calculatePeak(memoryMetrics),
      averageCPU: this.calculateAverage(cpuMetrics),
      peakCPU: this.calculatePeak(cpuMetrics),
      totalInteractions: interactionMetrics.length,
      averageResponseTime: this.calculateAverage(interactionMetrics),
      errorCount: metrics.filter(m => m.context?.success === false).length
    };
  }

  /**
   * 计算平均值
   */
  private calculateAverage(metrics: PerformanceMetric[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
  }

  /**
   * 计算峰值
   */
  private calculatePeak(metrics: PerformanceMetric[]): number {
    if (metrics.length === 0) return 0;
    return Math.max(...metrics.map(m => m.value));
  }

  /**
   * 生成建议
   */
  private generateRecommendations(metrics: PerformanceMetric[]): string[] {
    const recommendations: string[] = [];

    const avgMemory = this.calculateAverage(metrics.filter(m => m.type === MetricType.MEMORY));
    if (avgMemory > this.thresholds.memory.warning) {
      recommendations.push('考虑启用内存优化和垃圾回收');
    }

    const avgRenderTime = this.calculateAverage(metrics.filter(m => m.type === MetricType.RENDER));
    if (avgRenderTime > this.thresholds.renderTime.warning) {
      recommendations.push('优化渲染性能，考虑使用虚拟滚动');
    }

    return recommendations;
  }

  /**
   * 获取连接分数
   */
  private getConnectionScore(effectiveType: string): number {
    const scores = { '4g': 100, '3g': 70, '2g': 40, 'slow-2g': 20 };
    return scores[effectiveType as keyof typeof scores] || 50;
  }

  /**
   * 获取影响描述
   */
  private getImpactDescription(type: string, severity: string): string {
    const impacts = {
      memory: { critical: '可能导致页面崩溃', high: '影响应用响应速度', medium: '轻微影响性能' },
      cpu: { critical: '严重影响用户体验', high: '明显的性能下降', medium: '轻微的延迟' },
      render: { critical: '界面卡顿严重', high: '明显的渲染延迟', medium: '轻微的界面延迟' }
    };

    return impacts[type as keyof typeof impacts]?.[severity as keyof typeof impacts.memory] || '性能影响';
  }

  /**
   * 获取建议
   */
  private getSuggestion(type: string, severity: string): string {
    const suggestions = {
      memory: '启用内存优化，清理缓存',
      cpu: '减少计算密集型操作，使用Web Workers',
      render: '优化DOM操作，使用虚拟滚动',
      network: '启用请求缓存，减少网络请求',
      storage: '清理本地存储，压缩数据'
    };

    return suggestions[type as keyof typeof suggestions] || '联系技术支持';
  }
}

// 创建全局实例
export const performanceMonitor = new PerformanceMonitor();
