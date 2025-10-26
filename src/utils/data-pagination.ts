/**
 * 数据分页和批量处理系统
 * 提供高效的大数据集处理和分页加载功能
 */

import { DEFAULT_ANALYTICS_CONFIG } from '../config/analytics-config';

// ============================================================================
// 类型定义
// ============================================================================

export interface PaginationConfig {
  pageSize: number;
  maxPages?: number;
  preloadPages?: number;
  cachePages?: boolean;
}

export interface BatchProcessConfig {
  batchSize: number;
  processingDelay?: number;
  maxConcurrent?: number;
  onProgress?: (processed: number, total: number) => void;
  onBatchComplete?: (batchIndex: number, batchData: any[]) => void;
}

export interface PaginatedResult<T> {
  data: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface BatchProcessResult<T> {
  processedData: T[];
  totalProcessed: number;
  processingTime: number;
  errors: Error[];
}

// ============================================================================
// 数据分页服务
// ============================================================================

export class DataPaginationService {
  private static instance: DataPaginationService;
  private config = DEFAULT_ANALYTICS_CONFIG.performance;
  private cache = new Map<string, any[]>();

  private constructor() {}

  static getInstance(): DataPaginationService {
    if (!DataPaginationService.instance) {
      DataPaginationService.instance = new DataPaginationService();
    }
    return DataPaginationService.instance;
  }

  /**
   * 分页数据
   */
  paginate<T>(
    data: T[],
    page: number,
    config: Partial<PaginationConfig> = {}
  ): PaginatedResult<T> {
    const paginationConfig: PaginationConfig = {
      pageSize: this.config.BATCH_PROCESSING.CHUNK_SIZE,
      maxPages: 100,
      preloadPages: 2,
      cachePages: true,
      ...config
    };

    const totalItems = data.length;
    const totalPages = Math.ceil(totalItems / paginationConfig.pageSize);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    
    const startIndex = (currentPage - 1) * paginationConfig.pageSize;
    const endIndex = Math.min(startIndex + paginationConfig.pageSize, totalItems);
    
    const pageData = data.slice(startIndex, endIndex);

    return {
      data: pageData,
      currentPage,
      totalPages,
      totalItems,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1
    };
  }

  /**
   * 异步分页加载
   */
  async paginateAsync<T>(
    dataLoader: (offset: number, limit: number) => Promise<T[]>,
    page: number,
    config: Partial<PaginationConfig> = {}
  ): Promise<PaginatedResult<T>> {
    const paginationConfig: PaginationConfig = {
      pageSize: this.config.BATCH_PROCESSING.CHUNK_SIZE,
      maxPages: 100,
      preloadPages: 2,
      cachePages: true,
      ...config
    };

    const cacheKey = `page-${page}-${paginationConfig.pageSize}`;
    
    // 检查缓存
    if (paginationConfig.cachePages && this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey);
      return this.createPaginatedResult(cachedData, page, paginationConfig);
    }

    const offset = (page - 1) * paginationConfig.pageSize;
    const data = await dataLoader(offset, paginationConfig.pageSize);

    // 缓存数据
    if (paginationConfig.cachePages) {
      this.cache.set(cacheKey, data);
      this.cleanupCache();
    }

    return this.createPaginatedResult(data, page, paginationConfig);
  }

  /**
   * 批量处理数据
   */
  async processBatches<T, R>(
    data: T[],
    processor: (batch: T[]) => Promise<R[]>,
    config: Partial<BatchProcessConfig> = {}
  ): Promise<BatchProcessResult<R>> {
    const batchConfig: BatchProcessConfig = {
      batchSize: this.config.BATCH_PROCESSING.CHUNK_SIZE,
      processingDelay: this.config.BATCH_PROCESSING.PROCESSING_DELAY,
      maxConcurrent: this.config.BATCH_PROCESSING.MAX_CONCURRENT,
      ...config
    };

    const startTime = performance.now();
    const processedData: R[] = [];
    const errors: Error[] = [];
    let totalProcessed = 0;

    // 创建批次
    const batches = this.createBatches(data, batchConfig.batchSize);
    
    // 并发处理批次
    const concurrentBatches = [];
    for (let i = 0; i < batches.length; i += batchConfig.maxConcurrent!) {
      const batchGroup = batches.slice(i, i + batchConfig.maxConcurrent!);
      
      const batchPromises = batchGroup.map(async (batch, batchIndex) => {
        try {
          const result = await processor(batch);
          processedData.push(...result);
          totalProcessed += batch.length;

          // 调用进度回调
          if (batchConfig.onProgress) {
            batchConfig.onProgress(totalProcessed, data.length);
          }

          // 调用批次完成回调
          if (batchConfig.onBatchComplete) {
            batchConfig.onBatchComplete(i + batchIndex, result);
          }

          return result;
        } catch (error) {
          errors.push(error as Error);
          console.error(`Batch processing error at batch ${i + batchIndex}:`, error);
          return [];
        }
      });

      // 等待当前批次组完成
      await Promise.all(batchPromises);

      // 添加处理延迟
      if (batchConfig.processingDelay && i + batchConfig.maxConcurrent! < batches.length) {
        await this.delay(batchConfig.processingDelay);
      }
    }

    const processingTime = performance.now() - startTime;

    return {
      processedData,
      totalProcessed,
      processingTime,
      errors
    };
  }

  /**
   * 智能数据采样
   */
  smartSample<T>(data: T[], targetSize: number, strategy: 'uniform' | 'random' | 'recent' = 'uniform'): T[] {
    if (data.length <= targetSize) {
      return data;
    }

    switch (strategy) {
      case 'uniform':
        return this.uniformSample(data, targetSize);
      
      case 'random':
        return this.randomSample(data, targetSize);
      
      case 'recent':
        return data.slice(-targetSize);
      
      default:
        return this.uniformSample(data, targetSize);
    }
  }

  /**
   * 流式数据处理
   */
  async processStream<T, R>(
    dataStream: AsyncIterable<T>,
    processor: (item: T) => Promise<R>,
    config: Partial<BatchProcessConfig> = {}
  ): Promise<R[]> {
    const batchConfig: BatchProcessConfig = {
      batchSize: this.config.BATCH_PROCESSING.CHUNK_SIZE,
      maxConcurrent: this.config.BATCH_PROCESSING.MAX_CONCURRENT,
      ...config
    };

    const results: R[] = [];
    const batch: T[] = [];
    let processed = 0;

    for await (const item of dataStream) {
      batch.push(item);

      if (batch.length >= batchConfig.batchSize) {
        const batchResults = await this.processBatch(batch, processor, batchConfig.maxConcurrent!);
        results.push(...batchResults);
        processed += batch.length;

        if (batchConfig.onProgress) {
          batchConfig.onProgress(processed, -1); // -1 表示未知总数
        }

        batch.length = 0; // 清空批次
      }
    }

    // 处理剩余数据
    if (batch.length > 0) {
      const batchResults = await this.processBatch(batch, processor, batchConfig.maxConcurrent!);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private createPaginatedResult<T>(
    data: T[],
    page: number,
    config: PaginationConfig
  ): PaginatedResult<T> {
    // 这里简化处理，实际应用中可能需要更复杂的逻辑
    const totalItems = data.length;
    const totalPages = Math.ceil(totalItems / config.pageSize);

    return {
      data,
      currentPage: page,
      totalPages,
      totalItems,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    };
  }

  private createBatches<T>(data: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  private uniformSample<T>(data: T[], targetSize: number): T[] {
    const step = data.length / targetSize;
    const sampled: T[] = [];
    
    for (let i = 0; i < targetSize; i++) {
      const index = Math.floor(i * step);
      sampled.push(data[index]);
    }
    
    return sampled;
  }

  private randomSample<T>(data: T[], targetSize: number): T[] {
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, targetSize);
  }

  private async processBatch<T, R>(
    batch: T[],
    processor: (item: T) => Promise<R>,
    maxConcurrent: number
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < batch.length; i += maxConcurrent) {
      const chunk = batch.slice(i, i + maxConcurrent);
      const chunkResults = await Promise.all(chunk.map(processor));
      results.push(...chunkResults);
    }
    
    return results;
  }

  private cleanupCache(): void {
    if (this.cache.size > this.config.CACHE.MAX_SIZE) {
      const keys = Array.from(this.cache.keys());
      const keysToDelete = keys.slice(0, keys.length - this.config.CACHE.MAX_SIZE + 10);
      keysToDelete.forEach(key => this.cache.delete(key));
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// 导出实例和工具函数
// ============================================================================

export const dataPagination = DataPaginationService.getInstance();

// 便捷的批量处理装饰器
export function withBatchProcessing(config?: Partial<BatchProcessConfig>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (data: any[], ...args: any[]) {
      if (!Array.isArray(data)) {
        return originalMethod.apply(this, [data, ...args]);
      }
      
      const result = await dataPagination.processBatches(
        data,
        async (batch) => {
          const batchResults = [];
          for (const item of batch) {
            const result = await originalMethod.apply(this, [item, ...args]);
            batchResults.push(result);
          }
          return batchResults;
        },
        config
      );
      
      return result.processedData;
    };
    
    return descriptor;
  };
}
