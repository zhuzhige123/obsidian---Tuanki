/**
 * 缓存管理器
 * 提供高效的LRU缓存和内存管理
 */

import { performanceMonitor } from './performance-monitor';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size?: number; // 估算的内存大小
}

export interface CacheStats {
  size: number;
  hitRate: number;
  totalRequests: number;
  estimatedMemoryUsage: number;
}

/**
 * 估算对象内存大小
 */
function estimateObjectSize(obj: any): number {
  if (obj === null || obj === undefined) return 0;
  
  if (typeof obj === 'string') return obj.length * 2; // UTF-16
  if (typeof obj === 'number') return 8;
  if (typeof obj === 'boolean') return 4;
  
  if (Array.isArray(obj)) {
    return obj.reduce((size, item) => size + estimateObjectSize(item), 0);
  }
  
  if (typeof obj === 'object') {
    return Object.keys(obj).reduce((size, key) => {
      return size + key.length * 2 + estimateObjectSize(obj[key]);
    }, 0);
  }
  
  return 0;
}

/**
 * LRU缓存实现
 */
export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private maxMemory: number; // 最大内存使用量（字节）
  private ttl: number; // Time to live in milliseconds
  private hits = 0;
  private misses = 0;
  private currentMemoryUsage = 0;

  constructor(
    maxSize = 100, 
    ttl = 5 * 60 * 1000, // 默认5分钟TTL
    maxMemory = 50 * 1024 * 1024 // 默认50MB
  ) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.maxMemory = maxMemory;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.evict(key);
      this.misses++;
      return null;
    }

    // 更新访问信息
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.hits++;

    // 移到最后（LRU）
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T): void {
    const now = Date.now();
    const size = estimateObjectSize(value);
    
    // 如果已存在，更新
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      this.currentMemoryUsage -= entry.size || 0;
      entry.value = value;
      entry.timestamp = now;
      entry.lastAccessed = now;
      entry.accessCount++;
      entry.size = size;
      this.currentMemoryUsage += size;
      return;
    }

    // 检查内存限制
    while (this.currentMemoryUsage + size > this.maxMemory && this.cache.size > 0) {
      this.evictLRU();
    }

    // 检查大小限制
    while (this.cache.size >= this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    // 添加新条目
    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
      size
    };
    
    this.cache.set(key, entry);
    this.currentMemoryUsage += size;
  }

  private evict(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentMemoryUsage -= entry.size || 0;
      return this.cache.delete(key);
    }
    return false;
  }

  private evictLRU(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.evict(firstKey);
    }
  }

  delete(key: string): boolean {
    return this.evict(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.currentMemoryUsage = 0;
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;
    
    return {
      size: this.cache.size,
      hitRate,
      totalRequests,
      estimatedMemoryUsage: this.currentMemoryUsage
    };
  }

  // 清理过期条目
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.evict(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

/**
 * 全局缓存管理器
 */
export class CacheManager {
  private static instance: CacheManager;
  private caches = new Map<string, LRUCache<any>>();
  private cleanupInterval: number | null = null;

  private constructor() {
    // 每5分钟清理一次过期缓存
    this.cleanupInterval = window.setInterval(() => {
      this.cleanupAll();
    }, 5 * 60 * 1000);
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  getCache<T>(name: string, maxSize = 100, ttl = 5 * 60 * 1000): LRUCache<T> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new LRUCache<T>(maxSize, ttl));
    }
    return this.caches.get(name)!;
  }

  clearCache(name: string): void {
    const cache = this.caches.get(name);
    if (cache) {
      cache.clear();
    }
  }

  clearAll(): void {
    this.caches.forEach(cache => cache.clear());
  }

  cleanupAll(): number {
    let totalCleaned = 0;
    this.caches.forEach(cache => {
      totalCleaned += cache.cleanup();
    });
    
    if (totalCleaned > 0) {
      performanceMonitor.reportError(
        new Error(`Cache cleanup: ${totalCleaned} entries removed`),
        'CacheManager.cleanupAll',
        { totalCleaned }
      );
    }
    
    return totalCleaned;
  }

  getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};
    this.caches.forEach((cache, name) => {
      stats[name] = cache.getStats();
    });
    return stats;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearAll();
    this.caches.clear();
  }
}

// 全局缓存管理器实例
export const cacheManager = CacheManager.getInstance();
