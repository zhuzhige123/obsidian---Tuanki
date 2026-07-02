/**
 * LRUCache 单元测试
 * 验证 LRU 缓存功能的正确性
 */

import { LRUCache, CacheManager } from '../LRUCache';

describe('LRUCache', () => {
  describe('Basic Operations', () => {
    test('should set and get values', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    test('should return undefined for missing keys', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      expect(cache.get('missing')).toBeUndefined();
    });

    test('should check if key exists', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    test('should delete values', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      
      expect(cache.delete('a')).toBe(true);
      expect(cache.has('a')).toBe(false);
      expect(cache.delete('b')).toBe(false);
    });

    test('should clear all values', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.has('a')).toBe(false);
    });
  });

  describe('LRU Eviction', () => {
    test('should evict oldest item when maxSize is exceeded', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // Should evict 'a'
      
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
      expect(cache.size).toBe(3);
    });

    test('should update LRU order on get', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      // Access 'a' to make it most recently used
      cache.get('a');
      
      // Add new item, should evict 'b' (oldest)
      cache.set('d', 4);
      
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    test('should update LRU order on set (existing key)', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      // Update 'a' to make it most recently used
      cache.set('a', 10);
      
      // Add new item, should evict 'b' (oldest)
      cache.set('d', 4);
      
      expect(cache.get('a')).toBe(10);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });
  });

  describe('TTL (Time To Live)', () => {
    test('should expire items after TTL', async () => {
      const cache = new LRUCache<string, number>({
        maxSize: 3,
        ttl: 100 // 100ms
      });
      
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
      
      // Wait for expiration
      await new Promise(resolve => window.setTimeout(resolve, 150));
      
      expect(cache.has('a')).toBe(false);
      expect(cache.get('a')).toBeUndefined();
    });

    test('should not expire items when TTL is 0', async () => {
      const cache = new LRUCache<string, number>({
        maxSize: 3,
        ttl: 0
      });
      
      cache.set('a', 1);
      await new Promise(resolve => window.setTimeout(resolve, 100));
      
      expect(cache.has('a')).toBe(true);
    });

    test('should cleanup expired items', async () => {
      const cache = new LRUCache<string, number>({
        maxSize: 3,
        ttl: 50
      });
      
      cache.set('a', 1);
      cache.set('b', 2);
      
      await new Promise(resolve => window.setTimeout(resolve, 100));
      
      const cleaned = cache.cleanup();
      expect(cleaned).toBe(2);
      expect(cache.size).toBe(0);
    });
  });

  describe('Callbacks', () => {
    test('should call onEvict callback when item is evicted', () => {
      const evictedItems: Array<[string, number]> = [];
      const cache = new LRUCache<string, number>({
        maxSize: 2,
        onEvict: (key, value) => {
          evictedItems.push([key, value as number]);
        }
      });
      
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // Should evict 'a'
      
      expect(evictedItems).toEqual([['a', 1]]);
    });

    test('should call onEvict when deleting', () => {
      const evictedItems: Array<[string, number]> = [];
      const cache = new LRUCache<string, number>({
        maxSize: 3,
        onEvict: (key, value) => {
          evictedItems.push([key, value as number]);
        }
      });
      
      cache.set('a', 1);
      cache.delete('a');
      
      expect(evictedItems).toEqual([['a', 1]]);
    });
  });

  describe('Statistics', () => {
    test('should return correct stats', () => {
      const cache = new LRUCache<string, number>({
        maxSize: 10,
        ttl: 5000
      });
      
      cache.set('a', 1);
      cache.set('b', 2);
      
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10);
      expect(stats.ttl).toBe(5000);
      expect(stats.utilizationRate).toBe(0.2);
    });
  });

  describe('Iteration', () => {
    test('should return correct keys', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      expect(cache.keys()).toEqual(['a', 'b', 'c']);
    });

    test('should return correct values', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      expect(cache.values()).toEqual([1, 2, 3]);
    });

    test('should return correct entries', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      expect(cache.entries()).toEqual([['a', 1], ['b', 2], ['c', 3]]);
    });
  });
});

describe('CacheManager', () => {
  test('should create and retrieve caches', () => {
    const manager = new CacheManager();
    const cache = manager.getCache<string, number>('test', { maxSize: 10 });
    
    cache.set('a', 1);
    
    const sameCache = manager.getCache<string, number>('test', { maxSize: 10 });
    expect(sameCache.get('a')).toBe(1);
  });

  test('should delete caches', () => {
    const manager = new CacheManager();
    const cache = manager.getCache<string, number>('test', { maxSize: 10 });
    cache.set('a', 1);
    
    expect(manager.deleteCache('test')).toBe(true);
    expect(manager.deleteCache('test')).toBe(false);
  });

  test('should clear all caches', () => {
    const manager = new CacheManager();
    manager.getCache<string, number>('cache1', { maxSize: 10 }).set('a', 1);
    manager.getCache<string, number>('cache2', { maxSize: 10 }).set('b', 2);
    
    manager.clearAll();
    
    const cache1 = manager.getCache<string, number>('cache1', { maxSize: 10 });
    expect(cache1.size).toBe(0);
  });

  test('should cleanup all caches', async () => {
    const manager = new CacheManager();
    const cache1 = manager.getCache<string, number>('cache1', { maxSize: 10, ttl: 50 });
    const cache2 = manager.getCache<string, number>('cache2', { maxSize: 10, ttl: 50 });
    
    cache1.set('a', 1);
    cache2.set('b', 2);
    
    await new Promise(resolve => window.setTimeout(resolve, 100));
    
    const cleaned = manager.cleanupAll();
    expect(cleaned).toBe(2);
  });

  test('should get stats for all caches', () => {
    const manager = new CacheManager();
    manager.getCache<string, number>('cache1', { maxSize: 10 }).set('a', 1);
    manager.getCache<string, number>('cache2', { maxSize: 5 }).set('b', 2);
    
    const stats = manager.getAllStats();
    expect(stats.cache1.size).toBe(1);
    expect(stats.cache1.maxSize).toBe(10);
    expect(stats.cache2.size).toBe(1);
    expect(stats.cache2.maxSize).toBe(5);
  });
});



