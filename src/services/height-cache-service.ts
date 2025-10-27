/**
 * 高度缓存服务
 * 
 * 为虚拟滚动提供高效的高度缓存管理，使用 LRU 策略
 * 
 * @module height-cache-service
 */

/**
 * LRU 缓存项接口
 */
interface CacheEntry {
  /** 卡片ID */
  key: string;
  /** 测量的高度 */
  value: number;
  /** 最后访问时间 */
  lastAccessed: number;
}

/**
 * 高度缓存服务类
 * 
 * 提供高效的卡片高度缓存，使用 LRU (Least Recently Used) 淘汰策略
 * 
 * @example
 * ```typescript
 * const cacheService = new HeightCacheService(1000);
 * cacheService.set('card-123', 250);
 * const height = cacheService.get('card-123'); // => 250
 * ```
 */
export class HeightCacheService {
  /** 缓存存储 */
  private cache: Map<string, CacheEntry>;
  
  /** 最大缓存条目数 */
  private maxSize: number;
  
  /** 缓存命中计数 */
  private hits = 0;
  
  /** 缓存未命中计数 */
  private misses = 0;
  
  /**
   * 创建高度缓存服务实例
   * 
   * @param maxSize - 最大缓存条目数（默认：1000）
   */
  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }
  
  /**
   * 获取缓存的高度
   * 
   * @param cardId - 卡片唯一标识
   * @returns 缓存的高度，如果不存在则返回 null
   */
  get(cardId: string): number | null {
    const entry = this.cache.get(cardId);
    
    if (entry) {
      // 命中：更新访问时间
      entry.lastAccessed = Date.now();
      this.hits++;
      return entry.value;
    }
    
    // 未命中
    this.misses++;
    return null;
  }
  
  /**
   * 设置高度到缓存
   * 
   * @param cardId - 卡片唯一标识
   * @param height - 测量的高度
   */
  set(cardId: string, height: number): void {
    // 如果缓存已满，执行 LRU 淘汰
    if (this.cache.size >= this.maxSize && !this.cache.has(cardId)) {
      this.evictLRU();
    }
    
    // 添加或更新缓存
    this.cache.set(cardId, {
      key: cardId,
      value: height,
      lastAccessed: Date.now()
    });
  }
  
  /**
   * 检查是否存在缓存
   * 
   * @param cardId - 卡片唯一标识
   * @returns 是否存在缓存
   */
  has(cardId: string): boolean {
    return this.cache.has(cardId);
  }
  
  /**
   * 删除指定卡片的缓存
   * 
   * @param cardId - 卡片唯一标识
   * @returns 是否成功删除
   */
  delete(cardId: string): boolean {
    return this.cache.delete(cardId);
  }
  
  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
  
  /**
   * 修剪缓存到指定大小
   * 
   * @param targetSize - 目标大小（默认：maxSize 的 80%）
   */
  prune(targetSize?: number): void {
    const target = targetSize || Math.floor(this.maxSize * 0.8);
    
    if (this.cache.size <= target) {
      return; // 无需修剪
    }
    
    // 按最后访问时间排序
    const entries = Array.from(this.cache.values())
      .sort((a, b) => a.lastAccessed - b.lastAccessed);
    
    // 删除最旧的条目
    const toRemove = this.cache.size - target;
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i].key);
    }
  }
  
  /**
   * LRU 淘汰：移除最近最少使用的条目
   * 
   * @private
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;
    
    // 找到最旧的条目
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    // 删除最旧的条目
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
  
  /**
   * 获取缓存大小
   * 
   * @returns 当前缓存条目数
   */
  size(): number {
    return this.cache.size;
  }
  
  /**
   * 获取最大缓存大小
   * 
   * @returns 最大缓存条目数
   */
  getMaxSize(): number {
    return this.maxSize;
  }
  
  /**
   * 获取缓存命中率
   * 
   * @returns 命中率（0-1 之间）
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }
  
  /**
   * 获取缓存统计信息
   * 
   * @returns 统计信息对象
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      utilizationRate: this.cache.size / this.maxSize
    };
  }
  
  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
  
  /**
   * 批量获取高度
   * 
   * @param cardIds - 卡片ID数组
   * @returns 高度映射（cardId => height）
   */
  getBatch(cardIds: string[]): Map<string, number> {
    const result = new Map<string, number>();
    
    for (const cardId of cardIds) {
      const height = this.get(cardId);
      if (height !== null) {
        result.set(cardId, height);
      }
    }
    
    return result;
  }
  
  /**
   * 批量设置高度
   * 
   * @param heights - 高度映射（cardId => height）
   */
  setBatch(heights: Map<string, number>): void {
    for (const [cardId, height] of Array.from(heights.entries())) {
      this.set(cardId, height);
    }
  }
}

/**
 * 默认导出单例实例
 */
let defaultInstance: HeightCacheService | null = null;

/**
 * 获取默认缓存服务实例（单例）
 * 
 * @returns 缓存服务实例
 */
export function getDefaultHeightCacheService(): HeightCacheService {
  if (!defaultInstance) {
    defaultInstance = new HeightCacheService();
  }
  return defaultInstance;
}

/**
 * 重置默认缓存服务实例
 */
export function resetDefaultHeightCacheService(): void {
  if (defaultInstance) {
    defaultInstance.clear();
    defaultInstance = null;
  }
}



