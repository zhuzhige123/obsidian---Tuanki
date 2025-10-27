/**
 * 性能监控系统
 * 集成到新架构中，实现实时性能追踪和优化
 */

import { dispatchSystem } from './unified-state-management';
import { handleError, createErrorContext } from './unified-error-handler';
import { PERFORMANCE_CONSTANTS, MEMORY_CONSTANTS, TIME_CONSTANTS } from '../constants/app-constants';

// ============================================================================
// 性能监控接口定义
// ============================================================================

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  // 内存指标
  memoryUsage: MemoryMetrics;
  
  // 渲染性能
  renderMetrics: RenderMetrics;
  
  // 网络性能
  networkMetrics: NetworkMetrics;
  
  // 用户交互性能
  interactionMetrics: InteractionMetrics;
  
  // 系统资源
  systemMetrics: SystemMetrics;
  
  // 时间戳
  timestamp: number;
}

export interface MemoryMetrics {
  used: number;
  total: number;
  percentage: number;
  gcCount: number;
  leakDetected: boolean;
}

export interface RenderMetrics {
  fps: number;
  frameTime: number;
  paintTime: number;
  layoutTime: number;
  scriptTime: number;
}

export interface NetworkMetrics {
  latency: number;
  bandwidth: number;
  requestCount: number;
  errorRate: number;
}

export interface InteractionMetrics {
  inputDelay: number;
  responseTime: number;
  clickToAction: number;
  scrollPerformance: number;
}

export interface SystemMetrics {
  cpuUsage: number;
  diskIO: number;
  networkIO: number;
  activeConnections: number;
}

/**
 * 性能警告
 */
export interface PerformanceWarning {
  id: string;
  type: PerformanceWarningType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metrics: Partial<PerformanceMetrics>;
  timestamp: number;
  resolved: boolean;
}

export enum PerformanceWarningType {
  MEMORY_HIGH = 'memory_high',
  MEMORY_LEAK = 'memory_leak',
  RENDER_SLOW = 'render_slow',
  NETWORK_SLOW = 'network_slow',
  INTERACTION_SLOW = 'interaction_slow',
  CPU_HIGH = 'cpu_high'
}

// ============================================================================
// 性能监控器实现
// ============================================================================

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;

  private isMonitoring = false;
  private metricsHistory: PerformanceMetrics[] = [];
  private warnings: PerformanceWarning[] = [];
  private observers: PerformanceObserver[] = [];
  private intervals: NodeJS.Timeout[] = [];
  private lastLeakReportTime?: number;
  
  // 性能基线
  private baselines = {
    memoryUsage: 50 * MEMORY_CONSTANTS.MB,
    renderTime: 16.67, // 60fps
    networkLatency: 100,
    interactionDelay: 100
  };

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * 开始监控
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.setupPerformanceObservers();
    this.startMetricsCollection();

    console.log('🔍 性能监控已启动');
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    this.cleanupObservers();
    this.cleanupIntervals();

    // 清理历史数据
    this.metricsHistory = [];
    this.warnings = [];

    // 重置防抖时间
    this.lastLeakReportTime = undefined;

    console.log('⏹️ 性能监控已停止，所有资源已清理');
  }

  /**
   * 设置性能观察器
   */
  private setupPerformanceObservers(): void {
    try {
      // 观察渲染性能
      if ('PerformanceObserver' in window) {
        const renderObserver = new PerformanceObserver((list) => {
          this.processRenderMetrics(list.getEntries());
        });
        renderObserver.observe({ entryTypes: ['paint', 'layout-shift', 'largest-contentful-paint'] });
        this.observers.push(renderObserver);

        // 观察网络性能
        const networkObserver = new PerformanceObserver((list) => {
          this.processNetworkMetrics(list.getEntries());
        });
        networkObserver.observe({ entryTypes: ['navigation', 'resource'] });
        this.observers.push(networkObserver);

        // 观察用户交互
        const interactionObserver = new PerformanceObserver((list) => {
          this.processInteractionMetrics(list.getEntries());
        });
        interactionObserver.observe({ entryTypes: ['event', 'first-input'] });
        this.observers.push(interactionObserver);
      }
    } catch (error) {
      handleError(error as Error, createErrorContext('PerformanceMonitor', 'setupPerformanceObservers'));
    }
  }

  /**
   * 开始指标收集
   */
  private startMetricsCollection(): void {
    // 定期收集综合指标
    const collectInterval = setInterval(() => {
      this.collectMetrics();
    }, PERFORMANCE_CONSTANTS.COLLECT_INTERVAL);
    this.intervals.push(collectInterval);

    // 定期生成报告
    const reportInterval = setInterval(() => {
      this.generatePerformanceReport();
    }, PERFORMANCE_CONSTANTS.REPORT_INTERVAL);
    this.intervals.push(reportInterval);
  }

  /**
   * 收集性能指标
   */
  private async collectMetrics(): Promise<void> {
    try {
      const metrics: PerformanceMetrics = {
        memoryUsage: await this.collectMemoryMetrics(),
        renderMetrics: this.collectRenderMetrics(),
        networkMetrics: this.collectNetworkMetrics(),
        interactionMetrics: this.collectInteractionMetrics(),
        systemMetrics: this.collectSystemMetrics(),
        timestamp: Date.now()
      };

      this.addMetricsToHistory(metrics);
      this.analyzeMetrics(metrics);
      this.updateSystemState(metrics);
    } catch (error) {
      handleError(error as Error, createErrorContext('PerformanceMonitor', 'collectMetrics'));
    }
  }

  /**
   * 收集内存指标
   */
  private async collectMemoryMetrics(): Promise<MemoryMetrics> {
    const memInfo = (performance as any).memory || {};
    
    return {
      used: memInfo.usedJSHeapSize || 0,
      total: memInfo.totalJSHeapSize || 0,
      percentage: memInfo.totalJSHeapSize ? 
        (memInfo.usedJSHeapSize / memInfo.totalJSHeapSize) * 100 : 0,
      gcCount: this.getGCCount(),
      leakDetected: this.detectMemoryLeak()
    };
  }

  /**
   * 收集渲染指标
   */
  private collectRenderMetrics(): RenderMetrics {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    return {
      fps: this.calculateFPS(),
      frameTime: this.getAverageFrameTime(),
      paintTime: navigation ? navigation.loadEventEnd - navigation.loadEventStart : 0,
      layoutTime: this.getLayoutTime(),
      scriptTime: this.getScriptTime()
    };
  }

  /**
   * 收集网络指标
   */
  private collectNetworkMetrics(): NetworkMetrics {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const recentResources = resources.slice(-10); // 最近10个请求

    const totalLatency = recentResources.reduce((sum, resource) => {
      return sum + (resource.responseEnd - resource.requestStart);
    }, 0);

    return {
      latency: recentResources.length ? totalLatency / recentResources.length : 0,
      bandwidth: this.calculateBandwidth(recentResources),
      requestCount: resources.length,
      errorRate: this.calculateErrorRate(recentResources)
    };
  }

  /**
   * 收集交互指标
   */
  private collectInteractionMetrics(): InteractionMetrics {
    return {
      inputDelay: this.getInputDelay(),
      responseTime: this.getResponseTime(),
      clickToAction: this.getClickToActionTime(),
      scrollPerformance: this.getScrollPerformance()
    };
  }

  /**
   * 收集系统指标
   */
  private collectSystemMetrics(): SystemMetrics {
    return {
      cpuUsage: this.estimateCPUUsage(),
      diskIO: 0, // 浏览器环境无法直接获取
      networkIO: this.getNetworkIO(),
      activeConnections: this.getActiveConnections()
    };
  }

  /**
   * 分析指标并生成警告
   */
  private analyzeMetrics(metrics: PerformanceMetrics): void {
    // 内存使用分析
    if (metrics.memoryUsage.percentage > PERFORMANCE_CONSTANTS.MEMORY_CRITICAL_PERCENT) {
      this.createWarning(PerformanceWarningType.MEMORY_HIGH, 'critical', 
        `内存使用率过高: ${metrics.memoryUsage.percentage.toFixed(1)}%`, metrics);
    } else if (metrics.memoryUsage.percentage > PERFORMANCE_CONSTANTS.MEMORY_WARNING_PERCENT) {
      this.createWarning(PerformanceWarningType.MEMORY_HIGH, 'high', 
        `内存使用率较高: ${metrics.memoryUsage.percentage.toFixed(1)}%`, metrics);
    }

    // 内存泄漏检测
    if (metrics.memoryUsage.leakDetected) {
      this.createWarning(PerformanceWarningType.MEMORY_LEAK, 'critical', 
        '检测到可能的内存泄漏', metrics);
    }

    // 渲染性能分析
    if (metrics.renderMetrics.frameTime > PERFORMANCE_CONSTANTS.RENDER_TIME_CRITICAL_MS) {
      this.createWarning(PerformanceWarningType.RENDER_SLOW, 'critical', 
        `渲染性能严重下降: ${metrics.renderMetrics.frameTime.toFixed(1)}ms/frame`, metrics);
    } else if (metrics.renderMetrics.frameTime > PERFORMANCE_CONSTANTS.RENDER_TIME_WARNING_MS) {
      this.createWarning(PerformanceWarningType.RENDER_SLOW, 'medium', 
        `渲染性能下降: ${metrics.renderMetrics.frameTime.toFixed(1)}ms/frame`, metrics);
    }

    // 网络性能分析
    if (metrics.networkMetrics.latency > PERFORMANCE_CONSTANTS.RESPONSE_TIME_CRITICAL_MS) {
      this.createWarning(PerformanceWarningType.NETWORK_SLOW, 'high', 
        `网络延迟过高: ${metrics.networkMetrics.latency.toFixed(0)}ms`, metrics);
    }

    // 交互性能分析
    if (metrics.interactionMetrics.inputDelay > PERFORMANCE_CONSTANTS.RESPONSE_TIME_WARNING_MS) {
      this.createWarning(PerformanceWarningType.INTERACTION_SLOW, 'medium', 
        `交互响应延迟: ${metrics.interactionMetrics.inputDelay.toFixed(0)}ms`, metrics);
    }
  }

  /**
   * 创建性能警告
   */
  private createWarning(
    type: PerformanceWarningType,
    severity: PerformanceWarning['severity'],
    message: string,
    metrics: PerformanceMetrics
  ): void {
    const warning: PerformanceWarning = {
      id: `perf_warning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      metrics,
      timestamp: Date.now(),
      resolved: false
    };

    this.warnings.push(warning);
    
    // 限制警告历史大小
    if (this.warnings.length > PERFORMANCE_CONSTANTS.MAX_REPORTS_HISTORY) {
      this.warnings.splice(0, this.warnings.length - PERFORMANCE_CONSTANTS.MAX_REPORTS_HISTORY);
    }

    // 通知系统
    this.notifyPerformanceIssue(warning);
  }

  /**
   * 通知性能问题
   */
  private notifyPerformanceIssue(warning: PerformanceWarning): void {
    // 更新系统状态
    dispatchSystem('UPDATE_PERFORMANCE', {
      warning: warning.message,
      severity: warning.severity,
      timestamp: warning.timestamp
    });

    // 严重问题需要错误处理
    if (warning.severity === 'critical') {
      handleError(
        `性能严重问题: ${warning.message}`,
        createErrorContext('PerformanceMonitor', 'performanceIssue', {
          warningType: warning.type,
          severity: warning.severity
        })
      );
    }
  }

  /**
   * 生成性能报告
   */
  private generatePerformanceReport(): void {
    if (this.metricsHistory.length === 0) {
      return;
    }

    const recentMetrics = this.metricsHistory.slice(-10);
    const report = this.analyzeMetricsHistory(recentMetrics);
    
    console.log('📊 性能报告:', report);
    
    // 更新系统状态
    dispatchSystem('UPDATE_PERFORMANCE', {
      report,
      timestamp: Date.now()
    });
  }

  /**
   * 分析指标历史
   */
  private analyzeMetricsHistory(metrics: PerformanceMetrics[]): any {
    const avgMemory = metrics.reduce((sum, m) => sum + m.memoryUsage.percentage, 0) / metrics.length;
    const avgRenderTime = metrics.reduce((sum, m) => sum + m.renderMetrics.frameTime, 0) / metrics.length;
    const avgLatency = metrics.reduce((sum, m) => sum + m.networkMetrics.latency, 0) / metrics.length;
    
    return {
      averageMemoryUsage: avgMemory.toFixed(1) + '%',
      averageRenderTime: avgRenderTime.toFixed(1) + 'ms',
      averageNetworkLatency: avgLatency.toFixed(0) + 'ms',
      totalWarnings: this.warnings.filter(w => !w.resolved).length,
      metricsCount: metrics.length
    };
  }

  /**
   * 工具方法
   */
  private addMetricsToHistory(metrics: PerformanceMetrics): void {
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > PERFORMANCE_CONSTANTS.MAX_METRICS_HISTORY) {
      this.metricsHistory.splice(0, this.metricsHistory.length - PERFORMANCE_CONSTANTS.MAX_METRICS_HISTORY);
    }
  }

  private updateSystemState(metrics: PerformanceMetrics): void {
    dispatchSystem('UPDATE_PERFORMANCE', {
      memoryUsage: metrics.memoryUsage.used,
      renderTime: metrics.renderMetrics.frameTime,
      apiLatency: metrics.networkMetrics.latency
    });
  }

  private processRenderMetrics(entries: PerformanceEntry[]): void {
    // 处理渲染性能条目
  }

  private processNetworkMetrics(entries: PerformanceEntry[]): void {
    // 处理网络性能条目
  }

  private processInteractionMetrics(entries: PerformanceEntry[]): void {
    // 处理交互性能条目
  }

  private getGCCount(): number {
    // 估算GC次数
    return 0;
  }

  private detectMemoryLeak(): boolean {
    // 改进的内存泄漏检测逻辑 - 使用更宽松的阈值
    if (this.metricsHistory.length < 10) return false;

    const recent = this.metricsHistory.slice(-10);
    const latest = recent[recent.length - 1];

    // 1. 检查内存使用率是否超过新的严重阈值（98%）
    if (latest.memoryUsage.percentage < PERFORMANCE_CONSTANTS.MEMORY_CRITICAL_PERCENT) return false;

    // 2. 检查内存增长趋势（需要连续10次以上递增，更严格）
    let consecutiveIncreases = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].memoryUsage.used > recent[i - 1].memoryUsage.used) {
        consecutiveIncreases++;
      } else {
        consecutiveIncreases = 0; // 重置计数
      }
    }

    // 3. 检查内存增长幅度（总增长超过100MB，更严格）
    const memoryGrowth = latest.memoryUsage.used - recent[0].memoryUsage.used;
    const significantGrowth = memoryGrowth > 100 * 1024 * 1024; // 100MB

    // 4. 只有同时满足高使用率、持续增长和显著增长才报告泄漏
    const hasLeak = consecutiveIncreases >= 9 && significantGrowth;

    // 5. 添加防抖机制，避免频繁报告（延长到10分钟）
    if (hasLeak) {
      const now = Date.now();
      if (!this.lastLeakReportTime || (now - this.lastLeakReportTime) > 10 * 60 * 1000) {
        this.lastLeakReportTime = now;
        console.warn(`🚨 内存泄漏检测: 使用率=${latest.memoryUsage.percentage.toFixed(1)}%, 增长=${(memoryGrowth / 1024 / 1024).toFixed(1)}MB, 连续增长=${consecutiveIncreases}次`);
        return true;
      }
    }

    return false;
  }

  private calculateFPS(): number {
    // 估算FPS
    return 60; // 简化实现
  }

  private getAverageFrameTime(): number {
    // 获取平均帧时间
    return 16.67; // 简化实现
  }

  private getLayoutTime(): number {
    return 0; // 简化实现
  }

  private getScriptTime(): number {
    return 0; // 简化实现
  }

  private calculateBandwidth(resources: PerformanceResourceTiming[]): number {
    if (resources.length === 0) return 0;

    const totalBytes = resources.reduce((sum, resource) => {
      return sum + (resource.transferSize || 0);
    }, 0);

    const totalTime = resources.reduce((sum, resource) => {
      return sum + (resource.responseEnd - resource.requestStart);
    }, 0);

    return totalTime > 0 ? (totalBytes / totalTime) * 1000 : 0; // bytes per second
  }

  private calculateErrorRate(resources: PerformanceResourceTiming[]): number {
    if (resources.length === 0) return 0;

    // 简化实现：假设所有请求都成功
    return 0;
  }

  private getInputDelay(): number {
    return 0; // 简化实现
  }

  private getResponseTime(): number {
    return 0; // 简化实现
  }

  private getClickToActionTime(): number {
    return 0; // 简化实现
  }

  private getScrollPerformance(): number {
    return 0; // 简化实现
  }

  private estimateCPUUsage(): number {
    return 0; // 简化实现
  }

  private getNetworkIO(): number {
    return 0; // 简化实现
  }

  private getActiveConnections(): number {
    return 0; // 简化实现
  }

  private cleanupObservers(): void {
    this.observers.forEach(observer => {
      try {
        observer.disconnect();
        console.debug('🧹 性能观察器已断开');
      } catch (error) {
        console.warn('清理性能观察器失败:', error);
      }
    });
    this.observers = [];
  }

  private cleanupIntervals(): void {
    this.intervals.forEach(interval => {
      try {
        clearInterval(interval);
        console.debug('🧹 性能监控定时器已清理');
      } catch (error) {
        console.warn('清理性能监控定时器失败:', error);
      }
    });
    this.intervals = [];
  }

  /**
   * 获取性能指标历史
   */
  getMetricsHistory(): PerformanceMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * 获取性能警告
   */
  getWarnings(): PerformanceWarning[] {
    return [...this.warnings];
  }

  /**
   * 解决警告
   */
  resolveWarning(warningId: string): void {
    const warning = this.warnings.find(w => w.id === warningId);
    if (warning) {
      warning.resolved = true;
    }
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

const performanceMonitor = PerformanceMonitor.getInstance();

/**
 * 开始性能监控
 * @param force 是否强制启动（忽略环境检查）
 */
export const startPerformanceMonitoring = (force: boolean = false) => {
  // 在开发环境中添加开关控制
  if (!force && process.env.NODE_ENV === 'development') {
    // 检查是否启用性能监控
    const enablePerformanceMonitoring = localStorage.getItem('tuanki-enable-performance-monitoring');
    if (enablePerformanceMonitoring !== 'true') {
      console.log('🔍 性能监控已禁用（开发环境）。要启用请运行: localStorage.setItem("tuanki-enable-performance-monitoring", "true")');
      return;
    }
  }

  performanceMonitor.startMonitoring();
};

/**
 * 停止性能监控
 */
export const stopPerformanceMonitoring = () => performanceMonitor.stopMonitoring();

/**
 * 获取性能监控器实例
 */
export const getPerformanceMonitor = () => performanceMonitor;
