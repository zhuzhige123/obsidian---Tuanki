/**
 * LRU (Least Recently Used) 缓存实现
 * 提供高效的缓存管理，自动淘汰最少使用的项
 */

export interface LRUCacheOptions {
	/** 最大缓存条目数 */
	maxSize: number;
	/** 缓存项生存时间（毫秒），0 表示永不过期 */
	ttl?: number;
	/** 缓存项过期回调 */
	onEvict?: (key: string, value: unknown) => void;
}

interface CacheEntry<T> {
	value: T;
	timestamp: number;
}

export class LRUCache<K extends string, V> {
	private cache: Map<K, CacheEntry<V>>;
	private readonly maxSize: number;
	private readonly ttl: number;
	private readonly onEvict?: (key: K, value: V) => void;

	constructor(options: LRUCacheOptions) {
		this.cache = new Map();
		this.maxSize = options.maxSize;
		this.ttl = options.ttl || 0;
		this.onEvict = options.onEvict as (key: K, value: V) => void;
	}

	/**
	 * 获取缓存值
	 */
	get(key: K): V | undefined {
		const entry = this.cache.get(key);

		if (!entry) {
			return undefined;
		}

		// 检查是否过期
		if (this.isExpired(entry)) {
			this.delete(key);
			return undefined;
		}

		// LRU：将访问的项移到末尾（最近使用）
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.value;
	}

	/**
	 * 设置缓存值
	 */
	set(key: K, value: V): void {
		// 如果已存在，先删除旧的
		if (this.cache.has(key)) {
			this.cache.delete(key);
		}

		// 如果超过最大容量，删除最旧的项（Map 的第一项）
		if (this.cache.size >= this.maxSize) {
			this.evictOldest();
		}

		// 添加新项
		this.cache.set(key, {
			value,
			timestamp: Date.now(),
		});
	}

	/**
	 * 检查键是否存在
	 */
	has(key: K): boolean {
		const entry = this.cache.get(key);

		if (!entry) {
			return false;
		}

		// 检查是否过期
		if (this.isExpired(entry)) {
			this.delete(key);
			return false;
		}

		return true;
	}

	/**
	 * 删除缓存项
	 */
	delete(key: K): boolean {
		const entry = this.cache.get(key);

		if (entry && this.onEvict) {
			this.onEvict(key, entry.value);
		}

		return this.cache.delete(key);
	}

	/**
	 * 清空缓存
	 */
	clear(): void {
		if (this.onEvict) {
			for (const [key, entry] of this.cache.entries()) {
				this.onEvict(key, entry.value);
			}
		}
		this.cache.clear();
	}

	/**
	 * 获取缓存大小
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * 获取所有键
	 */
	keys(): K[] {
		return Array.from(this.cache.keys());
	}

	/**
	 * 获取所有值
	 */
	values(): V[] {
		return Array.from(this.cache.values()).map((entry) => entry.value);
	}

	/**
	 * 获取所有条目
	 */
	entries(): Array<[K, V]> {
		return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
	}

	/**
	 * 清理过期项
	 */
	cleanup(): number {
		let cleaned = 0;

		for (const [key, entry] of this.cache.entries()) {
			if (this.isExpired(entry)) {
				this.delete(key);
				cleaned++;
			}
		}

		return cleaned;
	}

	/**
	 * 获取缓存统计信息
	 */
	getStats(): {
		size: number;
		maxSize: number;
		ttl: number;
		utilizationRate: number;
	} {
		return {
			size: this.cache.size,
			maxSize: this.maxSize,
			ttl: this.ttl,
			utilizationRate: this.cache.size / this.maxSize,
		};
	}

	/**
	 * 检查是否过期
	 */
	private isExpired(entry: CacheEntry<V>): boolean {
		if (this.ttl === 0) {
			return false;
		}

		return Date.now() - entry.timestamp > this.ttl;
	}

	/**
	 * 淘汰最旧的项
	 */
	private evictOldest(): void {
		// Map 保持插入顺序，第一项是最旧的
		const { value: oldestKey } = this.cache.keys().next();

		if (oldestKey !== undefined) {
			this.delete(oldestKey);
		}
	}
}

/**
 * 缓存管理器
 * 管理多个缓存实例
 */
export class CacheManager {
	private caches: Map<string, LRUCache<string, unknown>>;

	constructor() {
		this.caches = new Map();
	}

	/**
	 * 创建或获取缓存实例
	 */
	getCache<K extends string, V>(name: string, options: LRUCacheOptions): LRUCache<K, V> {
		if (!this.caches.has(name)) {
			this.caches.set(name, new LRUCache<string, unknown>(options));
		}

		return this.caches.get(name) as unknown as LRUCache<K, V>;
	}

	/**
	 * 删除缓存实例
	 */
	deleteCache(name: string): boolean {
		const cache = this.caches.get(name);
		if (cache) {
			cache.clear();
			return this.caches.delete(name);
		}
		return false;
	}

	/**
	 * 清空所有缓存
	 */
	clearAll(): void {
		for (const cache of this.caches.values()) {
			cache.clear();
		}
		this.caches.clear();
	}

	/**
	 * 清理所有缓存中的过期项
	 */
	cleanupAll(): number {
		let totalCleaned = 0;

		for (const cache of this.caches.values()) {
			totalCleaned += cache.cleanup();
		}

		return totalCleaned;
	}

	/**
	 * 获取所有缓存统计
	 */
	getAllStats(): Record<string, ReturnType<LRUCache<string, unknown>["getStats"]>> {
		const stats: Record<string, ReturnType<LRUCache<string, unknown>["getStats"]>> = {};

		for (const [name, cache] of this.caches.entries()) {
			stats[name] = cache.getStats();
		}

		return stats;
	}
}
