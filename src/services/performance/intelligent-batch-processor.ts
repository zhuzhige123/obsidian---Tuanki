/**
 * 智能批量处理器
 * 实现自适应批量大小计算、并发控制和负载均衡的批量处理系统
 */

// 批量处理配置
export interface BatchConfig {
  minBatchSize: number;
  maxBatchSize: number;
  maxConcurrency: number;
  adaptiveThreshold: number;
  timeoutMs: number;
  retryAttempts: number;
  backoffMultiplier: number;
}

// 批量处理选项
export interface BatchOptions {
  priority?: 'low' | 'normal' | 'high';
  timeout?: number;
  retryOnFailure?: boolean;
  onProgress?: (processed: number, total: number) => void;
  onBatchComplete?: (batchIndex: number, results: any[]) => void;
  onError?: (error: Error, item: any, batchIndex: number) => void;
}

// 性能指标
export interface PerformanceMetrics {
  totalItems: number;
  processedItems: number;
  failedItems: number;
  totalBatches: number;
  averageBatchSize: number;
  averageProcessingTime: number;
  throughput: number; // 项目/秒
  concurrencyUtilization: number;
  errorRate: number;
  adaptationCount: number;
}

// 批量处理结果
export interface BatchResult<T> {
  success: boolean;
  results: T[];
  errors: Array<{ item: any; error: Error; batchIndex: number }>;
  metrics: PerformanceMetrics;
  adaptations: AdaptationRecord[];
}

// 自适应记录
export interface AdaptationRecord {
  timestamp: number;
  reason: string;
  oldBatchSize: number;
  newBatchSize: number;
  oldConcurrency: number;
  newConcurrency: number;
  performanceImpact: number;
}

// 信号量实现
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.waitQueue.push(resolve);
      }
    });
  }

  release(): void {
    this.permits++;
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      this.permits--;
      resolve();
    }
  }

  getAvailablePermits(): number {
    return this.permits;
  }

  getQueueLength(): number {
    return this.waitQueue.length;
  }
}

/**
 * 智能批量处理器
 */
export class IntelligentBatchProcessor {
  private config: BatchConfig;
  private performanceHistory: Array<{
    batchSize: number;
    concurrency: number;
    processingTime: number;
    throughput: number;
    errorRate: number;
    timestamp: number;
  }> = [];
  
  private currentBatchSize: number;
  private currentConcurrency: number;
  private adaptations: AdaptationRecord[] = [];

  constructor(config?: Partial<BatchConfig>) {
    this.config = {
      minBatchSize: 5,
      maxBatchSize: 100,
      maxConcurrency: 5,
      adaptiveThreshold: 0.1, // 10% 性能变化阈值
      timeoutMs: 30000,
      retryAttempts: 3,
      backoffMultiplier: 2,
      ...config
    };

    this.currentBatchSize = Math.floor((this.config.minBatchSize + this.config.maxBatchSize) / 2);
    this.currentConcurrency = Math.floor(this.config.maxConcurrency / 2);
  }

  /**
   * 处理批量数据
   */
  async processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    options: BatchOptions = {}
  ): Promise<BatchResult<R>> {
    const startTime = Date.now();
    const results: R[] = [];
    const errors: Array<{ item: T; error: Error; batchIndex: number }> = [];
    
    console.log(`🚀 开始智能批量处理 - ${items.length} 个项目`);
    console.log(`📊 初始配置: 批量大小=${this.currentBatchSize}, 并发数=${this.currentConcurrency}`);

    // 创建批次
    const batches = this.createOptimalBatches(items);
    const semaphore = new Semaphore(this.currentConcurrency);
    
    let processedItems = 0;
    let batchIndex = 0;

    // 处理所有批次
    const batchPromises = batches.map(async (batch, index) => {
      await semaphore.acquire();
      
      try {
        const batchStartTime = Date.now();
        const batchResults = await this.processSingleBatch(
          batch,
          processor,
          index,
          options
        );
        
        const batchProcessingTime = Date.now() - batchStartTime;
        
        // 记录批次性能
        this.recordBatchPerformance(
          batch.length,
          this.currentConcurrency,
          batchProcessingTime,
          batchResults.errors.length
        );
        
        // 合并结果
        results.push(...batchResults.results);
        errors.push(...batchResults.errors);
        
        processedItems += batch.length;
        
        // 报告进度
        if (options.onProgress) {
          options.onProgress(processedItems, items.length);
        }
        
        if (options.onBatchComplete) {
          options.onBatchComplete(index, batchResults.results);
        }
        
        // 自适应调整
        if (index > 0 && index % 3 === 0) { // 每3个批次检查一次
          await this.adaptiveOptimization();
        }
        
      } catch (error) {
        console.error(`批次 ${index} 处理失败:`, error);
        // 将整个批次标记为错误
        batch.forEach(item => {
          errors.push({
            item,
            error: error instanceof Error ? error : new Error(String(error)),
            batchIndex: index
          });
        });
      } finally {
        semaphore.release();
      }
    });

    // 等待所有批次完成
    await Promise.all(batchPromises);

    const totalTime = Date.now() - startTime;
    const metrics = this.calculateMetrics(
      items.length,
      processedItems,
      errors.length,
      batches.length,
      totalTime
    );

    console.log(`✅ 批量处理完成`);
    console.log(`📈 处理结果: ${processedItems}/${items.length} 成功, ${errors.length} 失败`);
    console.log(`⚡ 吞吐量: ${metrics.throughput.toFixed(2)} 项目/秒`);
    console.log(`🔧 自适应调整: ${this.adaptations.length} 次`);

    return {
      success: errors.length === 0,
      results,
      errors,
      metrics,
      adaptations: [...this.adaptations]
    };
  }

  /**
   * 创建最优批次
   */
  private createOptimalBatches<T>(items: T[]): T[][] {
    const batches: T[][] = [];
    let currentIndex = 0;

    while (currentIndex < items.length) {
      const remainingItems = items.length - currentIndex;
      const batchSize = Math.min(this.currentBatchSize, remainingItems);
      
      batches.push(items.slice(currentIndex, currentIndex + batchSize));
      currentIndex += batchSize;
    }

    return batches;
  }

  /**
   * 处理单个批次
   */
  private async processSingleBatch<T, R>(
    batch: T[],
    processor: (item: T) => Promise<R>,
    batchIndex: number,
    options: BatchOptions
  ): Promise<{ results: R[]; errors: Array<{ item: T; error: Error; batchIndex: number }> }> {
    const results: R[] = [];
    const errors: Array<{ item: T; error: Error; batchIndex: number }> = [];

    // 并行处理批次内的项目
    const itemPromises = batch.map(async (item, itemIndex) => {
      let attempts = 0;
      const maxAttempts = options.retryOnFailure ? this.config.retryAttempts : 1;

      while (attempts < maxAttempts) {
        try {
          const timeout = options.timeout || this.config.timeoutMs;
          const result = await this.withTimeout(processor(item), timeout);
          return { success: true, result, item };
        } catch (error) {
          attempts++;
          
          if (attempts >= maxAttempts) {
            const finalError = error instanceof Error ? error : new Error(String(error));
            if (options.onError) {
              options.onError(finalError, item, batchIndex);
            }
            return { success: false, error: finalError, item };
          }
          
          // 指数退避
          const delay = Math.pow(this.config.backoffMultiplier, attempts - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    });

    const itemResults = await Promise.all(itemPromises);

    // 分离成功和失败的结果
    for (const itemResult of itemResults) {
      if (itemResult.success) {
        results.push((itemResult as any).result);
      } else {
        errors.push({
          item: (itemResult as any).item,
          error: (itemResult as any).error,
          batchIndex
        });
      }
    }

    return { results, errors };
  }

  /**
   * 自适应优化
   */
  private async adaptiveOptimization(): Promise<void> {
    if (this.performanceHistory.length < 3) return;

    const recentHistory = this.performanceHistory.slice(-3);
    const avgThroughput = recentHistory.reduce((sum, h) => sum + h.throughput, 0) / recentHistory.length;
    const avgErrorRate = recentHistory.reduce((sum, h) => sum + h.errorRate, 0) / recentHistory.length;

    // 分析性能趋势
    const isPerformanceDecreasing = this.isPerformanceDecreasing(recentHistory);
    const isErrorRateHigh = avgErrorRate > 0.05; // 5% 错误率阈值

    let adaptationMade = false;
    const oldBatchSize = this.currentBatchSize;
    const oldConcurrency = this.currentConcurrency;

    // 调整策略
    if (isErrorRateHigh) {
      // 错误率高，降低并发和批量大小
      this.currentConcurrency = Math.max(1, Math.floor(this.currentConcurrency * 0.8));
      this.currentBatchSize = Math.max(this.config.minBatchSize, Math.floor(this.currentBatchSize * 0.8));
      adaptationMade = true;
      console.log(`🔧 高错误率调整: 并发 ${oldConcurrency}→${this.currentConcurrency}, 批量 ${oldBatchSize}→${this.currentBatchSize}`);
    } else if (isPerformanceDecreasing) {
      // 性能下降，尝试调整参数
      if (this.currentBatchSize > this.config.minBatchSize) {
        this.currentBatchSize = Math.max(this.config.minBatchSize, this.currentBatchSize - 5);
        adaptationMade = true;
        console.log(`📉 性能下降调整: 批量大小 ${oldBatchSize}→${this.currentBatchSize}`);
      }
    } else if (avgErrorRate < 0.01 && avgThroughput > 0) {
      // 性能良好，尝试提升
      if (this.currentBatchSize < this.config.maxBatchSize) {
        this.currentBatchSize = Math.min(this.config.maxBatchSize, this.currentBatchSize + 5);
        adaptationMade = true;
        console.log(`📈 性能提升调整: 批量大小 ${oldBatchSize}→${this.currentBatchSize}`);
      } else if (this.currentConcurrency < this.config.maxConcurrency) {
        this.currentConcurrency = Math.min(this.config.maxConcurrency, this.currentConcurrency + 1);
        adaptationMade = true;
        console.log(`📈 性能提升调整: 并发数 ${oldConcurrency}→${this.currentConcurrency}`);
      }
    }

    // 记录自适应调整
    if (adaptationMade) {
      this.adaptations.push({
        timestamp: Date.now(),
        reason: isErrorRateHigh ? 'high-error-rate' : isPerformanceDecreasing ? 'performance-decrease' : 'performance-optimization',
        oldBatchSize,
        newBatchSize: this.currentBatchSize,
        oldConcurrency,
        newConcurrency: this.currentConcurrency,
        performanceImpact: 0 // 将在下次测量时计算
      });
    }
  }

  /**
   * 检查性能是否在下降
   */
  private isPerformanceDecreasing(history: any[]): boolean {
    if (history.length < 2) return false;
    
    const recent = history[history.length - 1];
    const previous = history[history.length - 2];
    
    const throughputDecrease = (previous.throughput - recent.throughput) / previous.throughput;
    return throughputDecrease > this.config.adaptiveThreshold;
  }

  /**
   * 记录批次性能
   */
  private recordBatchPerformance(
    batchSize: number,
    concurrency: number,
    processingTime: number,
    errorCount: number
  ): void {
    const throughput = batchSize / (processingTime / 1000);
    const errorRate = errorCount / batchSize;

    this.performanceHistory.push({
      batchSize,
      concurrency,
      processingTime,
      throughput,
      errorRate,
      timestamp: Date.now()
    });

    // 保持历史记录在合理范围内
    if (this.performanceHistory.length > 100) {
      this.performanceHistory.splice(0, this.performanceHistory.length - 100);
    }
  }

  /**
   * 计算性能指标
   */
  private calculateMetrics(
    totalItems: number,
    processedItems: number,
    failedItems: number,
    totalBatches: number,
    totalTime: number
  ): PerformanceMetrics {
    const averageBatchSize = totalItems / totalBatches;
    const averageProcessingTime = totalTime / totalBatches;
    const throughput = processedItems / (totalTime / 1000);
    const errorRate = failedItems / totalItems;
    
    // 计算并发利用率
    const concurrencyUtilization = this.calculateConcurrencyUtilization();

    return {
      totalItems,
      processedItems,
      failedItems,
      totalBatches,
      averageBatchSize,
      averageProcessingTime,
      throughput,
      concurrencyUtilization,
      errorRate,
      adaptationCount: this.adaptations.length
    };
  }

  /**
   * 计算并发利用率
   */
  private calculateConcurrencyUtilization(): number {
    if (this.performanceHistory.length === 0) return 0;
    
    // 简化计算：基于最近的性能数据
    const recent = this.performanceHistory.slice(-5);
    const avgConcurrency = recent.reduce((sum, h) => sum + h.concurrency, 0) / recent.length;
    
    return avgConcurrency / this.config.maxConcurrency;
  }

  /**
   * 超时包装器
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`操作超时 (${timeoutMs}ms)`)), timeoutMs)
      )
    ]);
  }

  /**
   * 获取当前配置
   */
  getCurrentConfig(): { batchSize: number; concurrency: number; config: BatchConfig } {
    return {
      batchSize: this.currentBatchSize,
      concurrency: this.currentConcurrency,
      config: { ...this.config }
    };
  }

  /**
   * 获取性能历史
   */
  getPerformanceHistory(): typeof this.performanceHistory {
    return [...this.performanceHistory];
  }

  /**
   * 重置自适应状态
   */
  resetAdaptiveState(): void {
    this.currentBatchSize = Math.floor((this.config.minBatchSize + this.config.maxBatchSize) / 2);
    this.currentConcurrency = Math.floor(this.config.maxConcurrency / 2);
    this.performanceHistory.length = 0;
    this.adaptations.length = 0;
    
    console.log('🔄 自适应状态已重置');
  }
}
