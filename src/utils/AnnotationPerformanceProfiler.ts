/**
 * Tuanki标注系统性能分析器
 * 用于监控和优化标注功能的性能
 */

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface PerformanceReport {
  totalDuration: number;
  metrics: PerformanceMetric[];
  summary: {
    averageDetectionTime: number;
    averageProcessingTime: number;
    averageDocumentModificationTime: number;
    throughput: number; // 每秒处理的标注数
    memoryUsage?: number;
  };
  recommendations: string[];
}

/**
 * 性能分析器类
 */
export class AnnotationPerformanceProfiler {
  private static instance: AnnotationPerformanceProfiler;
  private metrics: Map<string, PerformanceMetric> = new Map();
  private completedMetrics: PerformanceMetric[] = [];
  private isEnabled: boolean = false;

  private constructor() {}

  public static getInstance(): AnnotationPerformanceProfiler {
    if (!AnnotationPerformanceProfiler.instance) {
      AnnotationPerformanceProfiler.instance = new AnnotationPerformanceProfiler();
    }
    return AnnotationPerformanceProfiler.instance;
  }

  /**
   * 启用性能分析
   */
  public enable(): void {
    this.isEnabled = true;
    console.log('📊 [PerformanceProfiler] 性能分析已启用');
  }

  /**
   * 禁用性能分析
   */
  public disable(): void {
    this.isEnabled = false;
    this.clear();
    console.log('📊 [PerformanceProfiler] 性能分析已禁用');
  }

  /**
   * 开始测量
   */
  public startMeasure(name: string, metadata?: Record<string, any>): string {
    if (!this.isEnabled) return '';

    const measureId = `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata
    };

    this.metrics.set(measureId, metric);
    return measureId;
  }

  /**
   * 结束测量
   */
  public endMeasure(measureId: string): number {
    if (!this.isEnabled || !measureId) return 0;

    const metric = this.metrics.get(measureId);
    if (!metric) {
      console.warn(`📊 [PerformanceProfiler] 未找到测量ID: ${measureId}`);
      return 0;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    this.completedMetrics.push(metric);
    this.metrics.delete(measureId);

    return metric.duration;
  }

  /**
   * 测量函数执行时间
   */
  public async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const measureId = this.startMeasure(name, metadata);
    try {
      const result = await fn();
      this.endMeasure(measureId);
      return result;
    } catch (error) {
      this.endMeasure(measureId);
      throw error;
    }
  }

  /**
   * 测量同步函数执行时间
   */
  public measureSync<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    const measureId = this.startMeasure(name, metadata);
    try {
      const result = fn();
      this.endMeasure(measureId);
      return result;
    } catch (error) {
      this.endMeasure(measureId);
      throw error;
    }
  }

  /**
   * 生成性能报告
   */
  public generateReport(): PerformanceReport {
    const metrics = [...this.completedMetrics];
    const totalDuration = metrics.reduce((sum, metric) => sum + (metric.duration || 0), 0);

    // 按类型分组统计
    const detectionMetrics = metrics.filter(m => m.name.includes('detection') || m.name.includes('detect'));
    const processingMetrics = metrics.filter(m => m.name.includes('processing') || m.name.includes('process'));
    const modificationMetrics = metrics.filter(m => m.name.includes('modification') || m.name.includes('modify'));

    const averageDetectionTime = this.calculateAverage(detectionMetrics);
    const averageProcessingTime = this.calculateAverage(processingMetrics);
    const averageDocumentModificationTime = this.calculateAverage(modificationMetrics);

    // 计算吞吐量
    const totalAnnotations = metrics.filter(m => m.metadata?.annotationCount).length;
    const throughput = totalDuration > 0 ? (totalAnnotations / (totalDuration / 1000)) : 0;

    // 生成优化建议
    const recommendations = this.generateRecommendations(metrics);

    return {
      totalDuration,
      metrics,
      summary: {
        averageDetectionTime,
        averageProcessingTime,
        averageDocumentModificationTime,
        throughput,
        memoryUsage: this.getMemoryUsage()
      },
      recommendations
    };
  }

  /**
   * 计算平均值
   */
  private calculateAverage(metrics: PerformanceMetric[]): number {
    if (metrics.length === 0) return 0;
    const total = metrics.reduce((sum, metric) => sum + (metric.duration || 0), 0);
    return total / metrics.length;
  }

  /**
   * 获取内存使用情况
   */
  private getMemoryUsage(): number | undefined {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return undefined;
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(metrics: PerformanceMetric[]): string[] {
    const recommendations: string[] = [];

    // 检查慢操作
    const slowOperations = metrics.filter(m => (m.duration || 0) > 1000);
    if (slowOperations.length > 0) {
      recommendations.push(`发现 ${slowOperations.length} 个耗时超过1秒的操作，建议优化`);
    }

    // 检查检测性能
    const detectionMetrics = metrics.filter(m => m.name.includes('detection'));
    const avgDetectionTime = this.calculateAverage(detectionMetrics);
    if (avgDetectionTime > 500) {
      recommendations.push('标注检测平均耗时较长，建议优化正则表达式或使用缓存');
    }

    // 检查处理性能
    const processingMetrics = metrics.filter(m => m.name.includes('processing'));
    const avgProcessingTime = this.calculateAverage(processingMetrics);
    if (avgProcessingTime > 2000) {
      recommendations.push('标注处理平均耗时较长，建议增加并发处理或优化算法');
    }

    // 检查文档修改性能
    const modificationMetrics = metrics.filter(m => m.name.includes('modification'));
    const avgModificationTime = this.calculateAverage(modificationMetrics);
    if (avgModificationTime > 300) {
      recommendations.push('文档修改平均耗时较长，建议优化文件I/O操作');
    }

    // 检查内存使用
    const memoryUsage = this.getMemoryUsage();
    if (memoryUsage && memoryUsage > 100 * 1024 * 1024) { // 100MB
      recommendations.push('内存使用较高，建议优化缓存策略或增加垃圾回收');
    }

    // 检查吞吐量
    const totalAnnotations = metrics.filter(m => m.metadata?.annotationCount).length;
    const totalTime = metrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    const throughput = totalTime > 0 ? (totalAnnotations / (totalTime / 1000)) : 0;
    if (throughput < 1) {
      recommendations.push('处理吞吐量较低，建议优化并发策略或算法效率');
    }

    if (recommendations.length === 0) {
      recommendations.push('性能表现良好，无需特别优化');
    }

    return recommendations;
  }

  /**
   * 打印性能报告
   */
  public printReport(): void {
    if (!this.isEnabled) {
      console.log('📊 [PerformanceProfiler] 性能分析未启用');
      return;
    }

    const report = this.generateReport();

    console.group('📊 Tuanki标注系统性能报告');
    console.log(`总耗时: ${report.totalDuration.toFixed(2)}ms`);
    console.log(`测量次数: ${report.metrics.length}`);
    
    console.group('📈 性能摘要');
    console.log(`平均检测时间: ${report.summary.averageDetectionTime.toFixed(2)}ms`);
    console.log(`平均处理时间: ${report.summary.averageProcessingTime.toFixed(2)}ms`);
    console.log(`平均文档修改时间: ${report.summary.averageDocumentModificationTime.toFixed(2)}ms`);
    console.log(`处理吞吐量: ${report.summary.throughput.toFixed(2)} 标注/秒`);
    if (report.summary.memoryUsage) {
      console.log(`内存使用: ${(report.summary.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
    }
    console.groupEnd();

    console.group('💡 优化建议');
    report.recommendations.forEach(rec => console.log(`• ${rec}`));
    console.groupEnd();

    console.group('📋 详细指标');
    const sortedMetrics = report.metrics.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    sortedMetrics.slice(0, 10).forEach(metric => {
      console.log(`${metric.name}: ${(metric.duration || 0).toFixed(2)}ms`);
    });
    if (sortedMetrics.length > 10) {
      console.log(`... 还有 ${sortedMetrics.length - 10} 个指标`);
    }
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * 导出性能数据
   */
  public exportData(): string {
    const report = this.generateReport();
    return JSON.stringify(report, null, 2);
  }

  /**
   * 清理数据
   */
  public clear(): void {
    this.metrics.clear();
    this.completedMetrics.length = 0;
  }

  /**
   * 获取实时统计
   */
  public getRealTimeStats(): {
    activeMeasures: number;
    completedMeasures: number;
    averageDuration: number;
    recentThroughput: number;
  } {
    const recentMetrics = this.completedMetrics.slice(-10);
    const averageDuration = this.calculateAverage(recentMetrics);
    const recentTime = recentMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    const recentThroughput = recentTime > 0 ? (recentMetrics.length / (recentTime / 1000)) : 0;

    return {
      activeMeasures: this.metrics.size,
      completedMeasures: this.completedMetrics.length,
      averageDuration,
      recentThroughput
    };
  }

  /**
   * 设置性能阈值警告
   */
  public setThresholds(thresholds: {
    detectionTime?: number;
    processingTime?: number;
    modificationTime?: number;
    memoryUsage?: number;
  }): void {
    // 可以在这里实现阈值监控逻辑
    console.log('📊 [PerformanceProfiler] 性能阈值已设置:', thresholds);
  }
}

/**
 * 性能装饰器
 * 支持同步和异步函数
 */
export function measurePerformance(name: string, metadata?: Record<string, any>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // 检查descriptor和value是否存在
    if (!descriptor || typeof descriptor.value !== 'function') {
      console.warn(`⚠️ [PerformanceProfiler] 无法应用装饰器到 ${target.constructor?.name}.${propertyKey}: descriptor.value 不是函数`);
      return descriptor;
    }

    const originalMethod = descriptor.value;
    const profiler = AnnotationPerformanceProfiler.getInstance();
    const methodName = `${target.constructor?.name || 'Unknown'}.${propertyKey}`;
    const combinedMetadata = { 
      ...metadata, 
      className: target.constructor?.name || 'Unknown', 
      methodName: propertyKey 
    };

    // 🔧 检测是否为异步函数
    const isAsyncFunction = originalMethod.constructor.name === 'AsyncFunction';

    if (isAsyncFunction) {
      // 异步函数包装
      descriptor.value = async function (...args: any[]) {
        return await profiler.measureAsync(
          methodName,
          () => originalMethod.apply(this, args),
          combinedMetadata
        );
      };
    } else {
      // 同步函数包装
      descriptor.value = function (...args: any[]) {
        return profiler.measureSync(
          methodName,
          () => originalMethod.apply(this, args),
          combinedMetadata
        );
      };
    }

    return descriptor;
  };
}

// 导出全局实例
export const performanceProfiler = AnnotationPerformanceProfiler.getInstance();
