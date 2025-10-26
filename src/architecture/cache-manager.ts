/**
 * 缓存管理系统
 * 建立多层缓存系统，优化内存使用和响应速度
 */

import { MEMORY_CONSTANTS, TIME_CONSTANTS, CACHE_CONSTANTS } from '../constants/app-constants';
import { handleError, createErrorContext } from './unified-error-handler';
import { dispatchSystem } from './unified-state-management';

// ============================================================================
// 缓存接口定义
// ============================================================================

/**
 * 缓存项
 */
export interface CacheItem<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  priority: CachePriority;
}

/**
 * 缓存优先级
 */
export enum CachePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

/**
 * 缓存策略
 */
export enum CacheStrategy {
  LRU = 'lru',           // 最近最少使用
  LFU = 'lfu',           // 最少使用频率
  FIFO = 'fifo',         // 先进先出
  TTL = 'ttl',           // 基于时间
  PRIORITY = 'priority'   // 基于优先级
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  maxSize: number;
  maxItems: number;
  defaultTTL: number;
  strategy: CacheStrategy;
  enableCompression: boolean;
  enablePersistence: boolean;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalItems: number;
  totalSize: number;
  memoryUsage: number;
  evictions: number;
}

// ============================================================================
// 多层缓存管理器
// ============================================================================

/**
 * 多层缓存管理器
 */
export class CacheManager {
  private static instance: CacheManager;
  
  // 不同层级的缓存
  private l1Cache: Map<string, CacheItem> = new Map(); // 内存缓存（最快）
  private l2Cache: Map<string, CacheItem> = new Map(); // 压缩缓存（中等）
  private l3Cache: Map<string, string> = new Map();    // 持久化缓存（最慢）
  
  // 缓存配置
  private configs: Map<string, CacheConfig> = new Map();
  
  // 统计信息
  private stats: Map<string, CacheStats> = new Map();
  
  // 清理定时器
  private cleanupInterval?: NodeJS.Timeout;

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  private constructor() {
    this.setupDefaultConfigs();
    this.startCleanupTimer();
  }

  /**
   * 设置默认配置
   */
  private setupDefaultConfigs(): void {
    // 卡片数据缓存
    this.setConfig('cards', {
      maxSize: CACHE_CONSTANTS.CARD_CACHE_SIZE,
      maxItems: CACHE_CONSTANTS.MAX_CACHED_CARDS,
      defaultTTL: TIME_CONSTANTS.CACHE_TTL,
      strategy: CacheStrategy.LRU,
      enableCompression: true,
      enablePersistence: true
    });

    // 牌组数据缓存
    this.setConfig('decks', {
      maxSize: CACHE_CONSTANTS.DECK_CACHE_SIZE,
      maxItems: CACHE_CONSTANTS.MAX_CACHED_DECKS,
      defaultTTL: TIME_CONSTANTS.CACHE_TTL,
      strategy: CacheStrategy.LRU,
      enableCompression: false,
      enablePersistence: true
    });

    // 模板缓存
    this.setConfig('templates', {
      maxSize: CACHE_CONSTANTS.TEMPLATE_CACHE_SIZE,
      maxItems: CACHE_CONSTANTS.MAX_CACHED_TEMPLATES,
      defaultTTL: TIME_CONSTANTS.LONG_CACHE_TTL,
      strategy: CacheStrategy.LFU,
      enableCompression: false,
      enablePersistence: true
    });

    // 渲染缓存
    this.setConfig('render', {
      maxSize: CACHE_CONSTANTS.RENDER_CACHE_SIZE,
      maxItems: CACHE_CONSTANTS.MAX_CACHED_RENDERS,
      defaultTTL: TIME_CONSTANTS.SHORT_CACHE_TTL,
      strategy: CacheStrategy.LRU,
      enableCompression: true,
      enablePersistence: false
    });

    // 网络请求缓存
    this.setConfig('network', {
      maxSize: CACHE_CONSTANTS.NETWORK_CACHE_SIZE,
      maxItems: CACHE_CONSTANTS.MAX_CACHED_REQUESTS,
      defaultTTL: TIME_CONSTANTS.NETWORK_CACHE_TTL,
      strategy: CacheStrategy.TTL,
      enableCompression: true,
      enablePersistence: false
    });
  }

  /**
   * 设置缓存配置
   */
  setConfig(namespace: string, config: CacheConfig): void {
    this.configs.set(namespace, config);
    this.initStats(namespace);
  }

  /**
   * 获取缓存项
   */
  async get<T>(namespace: string, key: string): Promise<T | null> {
    const fullKey = `${namespace}:${key}`;
    const config = this.configs.get(namespace);
    
    if (!config) {
      throw new Error(`缓存命名空间未配置: ${namespace}`);
    }

    try {
      // 1. 尝试从L1缓存获取
      const l1Item = this.l1Cache.get(fullKey);
      if (l1Item && this.isValidItem(l1Item)) {
        this.updateAccessInfo(l1Item);
        this.incrementHits(namespace);
        return l1Item.value as T;
      }

      // 2. 尝试从L2缓存获取
      const l2Item = this.l2Cache.get(fullKey);
      if (l2Item && this.isValidItem(l2Item)) {
        // 解压缩并提升到L1
        const decompressedValue = config.enableCompression ? 
          this.decompress(l2Item.value) : l2Item.value;
        
        this.promoteToL1(fullKey, decompressedValue, l2Item, config);
        this.incrementHits(namespace);
        return decompressedValue as T;
      }

      // 3. 尝试从L3缓存获取
      if (config.enablePersistence) {
        const l3Data = this.l3Cache.get(fullKey);
        if (l3Data) {
          const parsedValue = JSON.parse(l3Data);
          this.promoteToL1(fullKey, parsedValue, null, config);
          this.incrementHits(namespace);
          return parsedValue as T;
        }
      }

      // 缓存未命中
      this.incrementMisses(namespace);
      return null;
    } catch (error) {
      await handleError(error, createErrorContext('CacheManager', 'get', { namespace, key }));
      this.incrementMisses(namespace);
      return null;
    }
  }

  /**
   * 设置缓存项
   */
  async set<T>(
    namespace: string, 
    key: string, 
    value: T, 
    options?: {
      ttl?: number;
      priority?: CachePriority;
    }
  ): Promise<void> {
    const fullKey = `${namespace}:${key}`;
    const config = this.configs.get(namespace);
    
    if (!config) {
      throw new Error(`缓存命名空间未配置: ${namespace}`);
    }

    try {
      const now = Date.now();
      const ttl = options?.ttl || config.defaultTTL;
      const priority = options?.priority || CachePriority.NORMAL;
      const size = this.calculateSize(value);

      const cacheItem: CacheItem<T> = {
        key: fullKey,
        value,
        timestamp: now,
        ttl,
        accessCount: 1,
        lastAccessed: now,
        size,
        priority
      };

      // 检查是否需要清理空间
      await this.ensureSpace(namespace, size);

      // 存储到L1缓存
      this.l1Cache.set(fullKey, cacheItem);

      // 如果启用压缩，存储到L2缓存
      if (config.enableCompression && size > CACHE_CONSTANTS.COMPRESSION_THRESHOLD) {
        const compressedValue = this.compress(value);
        const compressedItem: CacheItem = {
          ...cacheItem,
          value: compressedValue,
          size: this.calculateSize(compressedValue)
        };
        this.l2Cache.set(fullKey, compressedItem);
      }

      // 如果启用持久化，存储到L3缓存
      if (config.enablePersistence) {
        this.l3Cache.set(fullKey, JSON.stringify(value));
      }

      this.updateStats(namespace);
    } catch (error) {
      await handleError(error, createErrorContext('CacheManager', 'set', { namespace, key }));
    }
  }

  /**
   * 删除缓存项
   */
  async delete(namespace: string, key: string): Promise<boolean> {
    const fullKey = `${namespace}:${key}`;
    
    try {
      let deleted = false;
      
      if (this.l1Cache.delete(fullKey)) deleted = true;
      if (this.l2Cache.delete(fullKey)) deleted = true;
      if (this.l3Cache.delete(fullKey)) deleted = true;
      
      if (deleted) {
        this.updateStats(namespace);
      }
      
      return deleted;
    } catch (error) {
      await handleError(error, createErrorContext('CacheManager', 'delete', { namespace, key }));
      return false;
    }
  }

  /**
   * 清空命名空间缓存
   */
  async clear(namespace: string): Promise<void> {
    try {
      const prefix = `${namespace}:`;
      
      // 清理L1缓存
      for (const key of this.l1Cache.keys()) {
        if (key.startsWith(prefix)) {
          this.l1Cache.delete(key);
        }
      }
      
      // 清理L2缓存
      for (const key of this.l2Cache.keys()) {
        if (key.startsWith(prefix)) {
          this.l2Cache.delete(key);
        }
      }
      
      // 清理L3缓存
      for (const key of this.l3Cache.keys()) {
        if (key.startsWith(prefix)) {
          this.l3Cache.delete(key);
        }
      }
      
      this.resetStats(namespace);
    } catch (error) {
      await handleError(error, createErrorContext('CacheManager', 'clear', { namespace }));
    }
  }

  /**
   * 确保有足够空间
   */
  private async ensureSpace(namespace: string, requiredSize: number): Promise<void> {
    const config = this.configs.get(namespace)!;
    const currentStats = this.getStats(namespace);
    
    // 检查项目数量限制
    if (currentStats.totalItems >= config.maxItems) {
      await this.evictItems(namespace, 1);
    }
    
    // 检查大小限制
    if (currentStats.totalSize + requiredSize > config.maxSize) {
      const sizeToFree = (currentStats.totalSize + requiredSize) - config.maxSize;
      await this.evictBySize(namespace, sizeToFree);
    }
  }

  /**
   * 根据策略驱逐缓存项
   */
  private async evictItems(namespace: string, count: number): Promise<void> {
    const config = this.configs.get(namespace)!;
    const prefix = `${namespace}:`;
    
    // 收集该命名空间的所有缓存项
    const items: CacheItem[] = [];
    
    for (const [key, item] of this.l1Cache) {
      if (key.startsWith(prefix)) {
        items.push(item);
      }
    }
    
    if (items.length === 0) return;
    
    // 根据策略排序
    this.sortItemsByStrategy(items, config.strategy);
    
    // 驱逐指定数量的项目
    const toEvict = items.slice(0, count);
    for (const item of toEvict) {
      await this.delete(namespace, item.key.replace(prefix, ''));
      this.incrementEvictions(namespace);
    }
  }

  /**
   * 根据大小驱逐缓存项
   */
  private async evictBySize(namespace: string, sizeToFree: number): Promise<void> {
    const config = this.configs.get(namespace)!;
    const prefix = `${namespace}:`;
    
    const items: CacheItem[] = [];
    for (const [key, item] of this.l1Cache) {
      if (key.startsWith(prefix)) {
        items.push(item);
      }
    }
    
    this.sortItemsByStrategy(items, config.strategy);
    
    let freedSize = 0;
    for (const item of items) {
      if (freedSize >= sizeToFree) break;
      
      await this.delete(namespace, item.key.replace(prefix, ''));
      freedSize += item.size;
      this.incrementEvictions(namespace);
    }
  }

  /**
   * 根据策略排序缓存项
   */
  private sortItemsByStrategy(items: CacheItem[], strategy: CacheStrategy): void {
    switch (strategy) {
      case CacheStrategy.LRU:
        items.sort((a, b) => a.lastAccessed - b.lastAccessed);
        break;
      case CacheStrategy.LFU:
        items.sort((a, b) => a.accessCount - b.accessCount);
        break;
      case CacheStrategy.FIFO:
        items.sort((a, b) => a.timestamp - b.timestamp);
        break;
      case CacheStrategy.TTL:
        items.sort((a, b) => (a.timestamp + a.ttl) - (b.timestamp + b.ttl));
        break;
      case CacheStrategy.PRIORITY:
        items.sort((a, b) => a.priority - b.priority);
        break;
    }
  }

  /**
   * 提升到L1缓存
   */
  private promoteToL1<T>(
    fullKey: string, 
    value: T, 
    sourceItem: CacheItem | null, 
    config: CacheConfig
  ): void {
    const now = Date.now();
    const cacheItem: CacheItem<T> = {
      key: fullKey,
      value,
      timestamp: sourceItem?.timestamp || now,
      ttl: sourceItem?.ttl || config.defaultTTL,
      accessCount: (sourceItem?.accessCount || 0) + 1,
      lastAccessed: now,
      size: this.calculateSize(value),
      priority: sourceItem?.priority || CachePriority.NORMAL
    };
    
    this.l1Cache.set(fullKey, cacheItem);
  }

  /**
   * 工具方法
   */
  private isValidItem(item: CacheItem): boolean {
    const now = Date.now();
    return (now - item.timestamp) < item.ttl;
  }

  private updateAccessInfo(item: CacheItem): void {
    item.accessCount++;
    item.lastAccessed = Date.now();
  }

  private calculateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // 粗略估算（UTF-16）
    } catch {
      return 1024; // 默认1KB
    }
  }

  private compress(value: any): string {
    // 简化的压缩实现（实际应该使用专业压缩库）
    return JSON.stringify(value);
  }

  private decompress(compressedValue: string): any {
    // 简化的解压缩实现
    return JSON.parse(compressedValue);
  }

  /**
   * 统计相关方法
   */
  private initStats(namespace: string): void {
    this.stats.set(namespace, {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalItems: 0,
      totalSize: 0,
      memoryUsage: 0,
      evictions: 0
    });
  }

  private incrementHits(namespace: string): void {
    const stats = this.stats.get(namespace)!;
    stats.hits++;
    this.updateHitRate(namespace);
  }

  private incrementMisses(namespace: string): void {
    const stats = this.stats.get(namespace)!;
    stats.misses++;
    this.updateHitRate(namespace);
  }

  private incrementEvictions(namespace: string): void {
    const stats = this.stats.get(namespace)!;
    stats.evictions++;
  }

  private updateHitRate(namespace: string): void {
    const stats = this.stats.get(namespace)!;
    const total = stats.hits + stats.misses;
    stats.hitRate = total > 0 ? (stats.hits / total) * 100 : 0;
  }

  private updateStats(namespace: string): void {
    const stats = this.stats.get(namespace)!;
    const prefix = `${namespace}:`;
    
    let totalItems = 0;
    let totalSize = 0;
    
    for (const [key, item] of this.l1Cache) {
      if (key.startsWith(prefix)) {
        totalItems++;
        totalSize += item.size;
      }
    }
    
    stats.totalItems = totalItems;
    stats.totalSize = totalSize;
    stats.memoryUsage = totalSize;
    
    // 更新系统状态
    dispatchSystem('UPDATE_PERFORMANCE', {
      cacheStats: {
        namespace,
        ...stats
      }
    });
  }

  private resetStats(namespace: string): void {
    this.initStats(namespace);
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, TIME_CONSTANTS.CACHE_CLEANUP_INTERVAL);
  }

  /**
   * 执行清理
   */
  private async performCleanup(): Promise<void> {
    const now = Date.now();
    
    // 清理过期的L1缓存项
    for (const [key, item] of this.l1Cache) {
      if (!this.isValidItem(item)) {
        this.l1Cache.delete(key);
      }
    }
    
    // 清理过期的L2缓存项
    for (const [key, item] of this.l2Cache) {
      if (!this.isValidItem(item)) {
        this.l2Cache.delete(key);
      }
    }
    
    // 更新所有命名空间的统计
    for (const namespace of this.configs.keys()) {
      this.updateStats(namespace);
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(namespace: string): CacheStats {
    return { ...this.stats.get(namespace)! };
  }

  /**
   * 获取所有统计
   */
  getAllStats(): Map<string, CacheStats> {
    return new Map(this.stats);
  }

  /**
   * 销毁缓存管理器
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.l1Cache.clear();
    this.l2Cache.clear();
    this.l3Cache.clear();
    this.configs.clear();
    this.stats.clear();
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

const cacheManager = CacheManager.getInstance();

/**
 * 获取缓存
 */
export const getCache = <T>(namespace: string, key: string) => 
  cacheManager.get<T>(namespace, key);

/**
 * 设置缓存
 */
export const setCache = <T>(
  namespace: string, 
  key: string, 
  value: T, 
  options?: { ttl?: number; priority?: CachePriority }
) => cacheManager.set(namespace, key, value, options);

/**
 * 删除缓存
 */
export const deleteCache = (namespace: string, key: string) => 
  cacheManager.delete(namespace, key);

/**
 * 清空缓存
 */
export const clearCache = (namespace: string) => 
  cacheManager.clear(namespace);

/**
 * 获取缓存管理器实例
 */
export const getCacheManager = () => cacheManager;
