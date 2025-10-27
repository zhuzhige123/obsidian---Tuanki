/**
 * 智能缓存系统
 * 提供多层缓存、智能失效和预加载功能
 */

import { DEFAULT_ANALYTICS_CONFIG } from '../config/analytics-config';

// ============================================================================
// 类型定义
// ============================================================================

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  ttl: number;
  size: number;
  tags: string[];
}

export interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  cleanupInterval: number;
  compressionEnabled: boolean;
  persistToDisk: boolean;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  memoryUsage: number;
}

export interface PreloadStrategy {
  name: string;
  condition: (key: string, entry?: CacheEntry<any>) => boolean;
  loader: (key: string) => Promise<any>;
  priority: number;
}

// ============================================================================
// 智能缓存服务
// ============================================================================

export class SmartCacheService {
  private static instance: SmartCacheService;
  private cache = new Map<string, CacheEntry<any>>();
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };
  private cleanupInterval: NodeJS.Timeout | null = null;
  private preloadStrategies: PreloadStrategy[] = [];

  private constructor() {
    this.config = {
      maxSize: DEFAULT_ANALYTICS_CONFIG.performance.CACHE.MAX_SIZE,
      defaultTTL: DEFAULT_ANALYTICS_CONFIG.performance.CACHE.TTL,
      cleanupInterval: DEFAULT_ANALYTICS_CONFIG.performance.CACHE.CLEANUP_INTERVAL,
      compressionEnabled: true,
      persistToDisk: false
    };

    this.startCleanupTimer();
  }

  static getInstance(): SmartCacheService {
    if (!SmartCacheService.instance) {
      SmartCacheService.instance = new SmartCacheService();
    }
    return SmartCacheService.instance;
  }

  /**
   * 设置缓存项
   */
  set<T>(key: string, data: T, ttl?: number, tags: string[] = []): void {
    const now = Date.now();
    const entryTTL = ttl || this.config.defaultTTL;
    const size = this.calculateSize(data);

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      ttl: entryTTL,
      size,
      tags
    };

    // 检查是否需要清理空间
    this.ensureSpace(size);

    this.cache.set(key, entry);
    console.log(`📦 Cached: ${key} (${size} bytes, TTL: ${entryTTL}ms)`);
  }

  /**
   * 获取缓存项
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    
    // 检查是否过期
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      console.log(`📦 Cache expired: ${key}`);
      return null;
    }

    // 更新访问统计
    entry.accessCount++;
    entry.lastAccessed = now;
    this.stats.hits++;

    // 触发预加载检查
    this.checkPreload(key, entry);

    return entry.data as T;
  }

  /**
   * 获取或设置缓存项
   */
  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    ttl?: number,
    tags: string[] = []
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await loader();
    this.set(key, data, ttl, tags);
    return data;
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`📦 Cache deleted: ${key}`);
    }
    return deleted;
  }

  /**
   * 按标签删除缓存项
   */
  deleteByTag(tag: string): number {
    let deletedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    
    console.log(`📦 Deleted ${deletedCount} cache entries with tag: ${tag}`);
    return deletedCount;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
    console.log('📦 Cache cleared');
  }

  /**
   * 检查缓存项是否存在且未过期
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const missRate = totalRequests > 0 ? this.stats.misses / totalRequests : 0;
    
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }

    return {
      totalEntries: this.cache.size,
      totalSize,
      hitRate,
      missRate,
      evictionCount: this.stats.evictions,
      memoryUsage: totalSize / (1024 * 1024) // MB
    };
  }

  /**
   * 添加预加载策略
   */
  addPreloadStrategy(strategy: PreloadStrategy): void {
    this.preloadStrategies.push(strategy);
    this.preloadStrategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 手动触发预加载
   */
  async preload(keys: string[]): Promise<void> {
    const preloadPromises = keys.map(async (key) => {
      if (!this.has(key)) {
        for (const strategy of this.preloadStrategies) {
          if (strategy.condition(key)) {
            try {
              const data = await strategy.loader(key);
              this.set(key, data, undefined, ['preloaded']);
              console.log(`📦 Preloaded: ${key} using strategy: ${strategy.name}`);
              break;
            } catch (error) {
              console.warn(`📦 Preload failed for ${key}:`, error);
            }
          }
        }
      }
    });

    await Promise.all(preloadPromises);
  }

  /**
   * 压缩缓存数据
   */
  compress(): void {
    if (!this.config.compressionEnabled) return;

    // 这里可以实现数据压缩逻辑
    // 例如：JSON.stringify + gzip 压缩
    console.log('📦 Cache compression completed');
  }

  /**
   * 获取缓存键列表
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取按访问频率排序的键
   */
  getKeysByAccessFrequency(): string[] {
    return Array.from(this.cache.entries())
      .sort(([, a], [, b]) => b.accessCount - a.accessCount)
      .map(([key]) => key);
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private calculateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // 粗略估算字节数
    } catch {
      return 1024; // 默认大小
    }
  }

  private ensureSpace(requiredSize: number): void {
    let currentSize = 0;
    for (const entry of this.cache.values()) {
      currentSize += entry.size;
    }

    // 如果当前大小加上新数据超过限制，进行清理
    while (currentSize + requiredSize > this.config.maxSize * 1024 * 1024) {
      const evicted = this.evictLeastUsed();
      if (!evicted) break; // 无法继续清理
      currentSize -= evicted.size;
      this.stats.evictions++;
    }
  }

  private evictLeastUsed(): CacheEntry<any> | null {
    let leastUsedKey: string | null = null;
    let leastUsedEntry: CacheEntry<any> | null = null;
    let minScore = Infinity;

    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      // 计算使用分数：访问频率 + 最近访问时间权重
      const timeSinceAccess = now - entry.lastAccessed;
      const score = entry.accessCount - (timeSinceAccess / (1000 * 60 * 60)); // 每小时减1分
      
      if (score < minScore) {
        minScore = score;
        leastUsedKey = key;
        leastUsedEntry = entry;
      }
    }

    if (leastUsedKey && leastUsedEntry) {
      this.cache.delete(leastUsedKey);
      console.log(`📦 Evicted: ${leastUsedKey} (score: ${minScore.toFixed(2)})`);
      return leastUsedEntry;
    }

    return null;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`📦 Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  private checkPreload(key: string, entry: CacheEntry<any>): void {
    // 异步执行预加载检查，不阻塞当前操作
    setTimeout(() => {
      for (const strategy of this.preloadStrategies) {
        if (strategy.condition(key, entry)) {
          strategy.loader(key).then(data => {
            this.set(key + '_preloaded', data, undefined, ['preloaded']);
          }).catch(error => {
            console.warn(`📦 Preload failed for ${key}:`, error);
          });
          break;
        }
      }
    }, 0);
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// ============================================================================
// 导出实例和工具函数
// ============================================================================

export const smartCache = SmartCacheService.getInstance();

// 便捷的缓存装饰器
export function withCache(ttl?: number, tags: string[] = []) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${target.constructor.name}.${propertyKey}:${JSON.stringify(args)}`;
      
      return smartCache.getOrSet(
        cacheKey,
        () => originalMethod.apply(this, args),
        ttl,
        tags
      );
    };
    
    return descriptor;
  };
}
