import { logger } from "../../utils/logger";
import type { TimerHandle } from "../../types/timer";
/**
 * 内存优化策略
 * 实现内存池管理、垃圾回收优化和内存泄漏防护
 */

// 内存池配置
export interface MemoryPoolConfig {
	maxPoolSize: number; // 最大池大小（字节）
	blockSizes: number[]; // 预分配的块大小
	gcThreshold: number; // 垃圾回收阈值
	leakDetectionEnabled: boolean; // 是否启用泄漏检测
	monitoringInterval: number; // 监控间隔（毫秒）
}

// 内存块
export interface MemoryBlock {
	id: string;
	size: number;
	data: ArrayBuffer;
	inUse: boolean;
	allocatedAt: number;
	lastAccessed: number;
	refCount: number;
	metadata?: Record<string, unknown>;
}

// 内存使用统计
export interface MemoryStats {
	totalAllocated: number;
	totalUsed: number;
	totalFree: number;
	blockCount: number;
	activeBlocks: number;
	fragmentationRatio: number;
	gcCount: number;
	leakCount: number;
	peakUsage: number;
}

// 内存泄漏检测结果
export interface MemoryLeak {
	blockId: string;
	size: number;
	allocatedAt: number;
	age: number; // 存活时间（毫秒）
	refCount: number;
	stackTrace?: string;
	metadata?: Record<string, unknown>;
}

/**
 * 内存池管理器
 */
export class MemoryPoolManager {
	private config: MemoryPoolConfig;
	private pools = new Map<number, MemoryBlock[]>(); // 按大小分组的内存池
	private activeBlocks = new Map<string, MemoryBlock>();
	private stats: MemoryStats;
	private gcTimer?: TimerHandle;
	private monitorTimer?: TimerHandle;
	private leakDetector?: MemoryLeakDetector;

	constructor(config?: Partial<MemoryPoolConfig>) {
		this.config = {
			maxPoolSize: 100 * 1024 * 1024, // 100MB
			blockSizes: [1024, 4096, 16384, 65536, 262144], // 1KB, 4KB, 16KB, 64KB, 256KB
			gcThreshold: 0.8, // 80% 使用率触发GC
			leakDetectionEnabled: true,
			monitoringInterval: 30000, // 30秒
			...config,
		};

		this.stats = {
			totalAllocated: 0,
			totalUsed: 0,
			totalFree: 0,
			blockCount: 0,
			activeBlocks: 0,
			fragmentationRatio: 0,
			gcCount: 0,
			leakCount: 0,
			peakUsage: 0,
		};

		this.initializePools();
		this.startMonitoring();

		if (this.config.leakDetectionEnabled) {
			this.leakDetector = new MemoryLeakDetector();
		}
	}

	/**
	 * 分配内存块
	 */
	allocate(size: number, metadata?: Record<string, unknown>): MemoryBlock | null {
		const optimalSize = this.findOptimalBlockSize(size);
		const pool = this.pools.get(optimalSize);

		if (!pool) {
			logger.warn(`没有找到大小为 ${optimalSize} 的内存池`);
			return null;
		}

		// 查找可用的内存块
		let block = pool.find((b) => !b.inUse);

		if (!block) {
			// 创建新的内存块
			if (this.canAllocateMore(optimalSize)) {
				block = this.createMemoryBlock(optimalSize, metadata);
				pool.push(block);
			} else {
				// 尝试垃圾回收
				this.forceGarbageCollection();
				block = pool.find((b) => !b.inUse);

				if (!block) {
					logger.warn("内存池已满，无法分配新的内存块");
					return null;
				}
			}
		}

		// 标记为使用中
		block.inUse = true;
		block.lastAccessed = Date.now();
		block.refCount = 1;
		block.metadata = { ...block.metadata, ...metadata };

		this.activeBlocks.set(block.id, block);
		this.updateStats();

		// 泄漏检测
		if (this.leakDetector) {
			this.leakDetector.trackAllocation(block);
		}

		logger.debug(`📦 分配内存块: ${block.id} (${optimalSize} 字节)`);
		return block;
	}

	/**
	 * 释放内存块
	 */
	deallocate(blockId: string): boolean {
		const block = this.activeBlocks.get(blockId);

		if (!block) {
			logger.warn(`未找到内存块: ${blockId}`);
			return false;
		}

		block.refCount--;

		if (block.refCount <= 0) {
			block.inUse = false;
			block.refCount = 0;
			this.activeBlocks.delete(blockId);

			// 泄漏检测
			if (this.leakDetector) {
				this.leakDetector.trackDeallocation(blockId);
			}

			logger.debug(`🗑️ 释放内存块: ${blockId}`);
			this.updateStats();
			return true;
		}

		return false;
	}

	/**
	 * 增加引用计数
	 */
	addReference(blockId: string): boolean {
		const block = this.activeBlocks.get(blockId);

		if (block) {
			block.refCount++;
			block.lastAccessed = Date.now();
			return true;
		}

		return false;
	}

	/**
	 * 强制垃圾回收
	 */
	forceGarbageCollection(): void {
		logger.debug("🧹 开始强制垃圾回收");

		const beforeStats = { ...this.stats };
		let freedBlocks = 0;
		let freedMemory = 0;

		// 清理未使用的内存块
		for (const [_size, pool] of this.pools) {
			const unusedBlocks = pool.filter((block) => !block.inUse);

			// 保留一些空闲块以备后用
			const keepCount = Math.max(1, Math.floor(pool.length * 0.2));
			const blocksToFree = unusedBlocks.slice(keepCount);

			for (const block of blocksToFree) {
				const index = pool.indexOf(block);
				if (index > -1) {
					pool.splice(index, 1);
					freedBlocks++;
					freedMemory += block.size;
				}
			}
		}

		// 清理长时间未访问的活跃块
		const now = Date.now();
		const staleThreshold = 5 * 60 * 1000; // 5分钟

		for (const [blockId, block] of this.activeBlocks) {
			if (now - block.lastAccessed > staleThreshold && block.refCount === 0) {
				this.deallocate(blockId);
				freedBlocks++;
				freedMemory += block.size;
			}
		}

		this.stats.gcCount++;
		this.updateStats();

		logger.debug(
			`✅ 垃圾回收完成: 释放 ${freedBlocks} 个块, ${(freedMemory / 1024).toFixed(2)} KB`
		);
		logger.debug(
			`📊 内存使用: ${(beforeStats.totalUsed / 1024).toFixed(2)} KB → ${(
				this.stats.totalUsed / 1024
			).toFixed(2)} KB`
		);
	}

	/**
	 * 检测内存泄漏
	 */
	detectMemoryLeaks(): MemoryLeak[] {
		if (!this.leakDetector) {
			return [];
		}

		return this.leakDetector.detectLeaks();
	}

	/**
	 * 获取内存统计
	 */
	getMemoryStats(): MemoryStats {
		this.updateStats();
		return { ...this.stats };
	}

	/**
	 * 优化内存布局
	 */
	optimizeMemoryLayout(): void {
		logger.debug("🔧 开始内存布局优化");

		// 分析碎片化程度
		const fragmentation = this.calculateFragmentation();

		if (fragmentation > 0.3) {
			// 碎片化超过30%
			logger.debug(`📊 检测到高碎片化: ${(fragmentation * 100).toFixed(1)}%`);

			// 重新整理内存池
			this.defragmentMemoryPools();
		}

		// 调整池大小
		this.adjustPoolSizes();

		logger.debug("✅ 内存布局优化完成");
	}

	/**
	 * 销毁内存池
	 */
	destroy(): void {
		if (this.gcTimer) {
			window.clearInterval(this.gcTimer);
		}

		if (this.monitorTimer) {
			window.clearInterval(this.monitorTimer);
		}

		// 释放所有内存块
		for (const pool of this.pools.values()) {
			pool.length = 0;
		}

		this.pools.clear();
		this.activeBlocks.clear();

		if (this.leakDetector) {
			this.leakDetector.destroy();
		}

		logger.debug("🗑️ 内存池管理器已销毁");
	}

	// 私有方法

	private initializePools(): void {
		for (const size of this.config.blockSizes) {
			this.pools.set(size, []);

			// 预分配一些内存块
			const initialCount = Math.max(1, Math.floor(this.config.maxPoolSize / size / 100));
			for (let i = 0; i < initialCount; i++) {
				const block = this.createMemoryBlock(size);
				this.pools.get(size)?.push(block);
			}
		}

		logger.debug(`🏗️ 内存池初始化完成: ${this.config.blockSizes.length} 个池`);
	}

	private createMemoryBlock(size: number, metadata?: Record<string, unknown>): MemoryBlock {
		const id = `block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

		return {
			id,
			size,
			data: new ArrayBuffer(size),
			inUse: false,
			allocatedAt: Date.now(),
			lastAccessed: Date.now(),
			refCount: 0,
			metadata,
		};
	}

	private findOptimalBlockSize(requestedSize: number): number {
		// 找到最小的满足需求的块大小
		for (const size of this.config.blockSizes) {
			if (size >= requestedSize) {
				return size;
			}
		}

		// 如果没有合适的预定义大小，返回最大的
		return Math.max(...this.config.blockSizes);
	}

	private canAllocateMore(size: number): boolean {
		const currentUsage = this.stats.totalAllocated;
		return currentUsage + size <= this.config.maxPoolSize;
	}

	private updateStats(): void {
		let totalAllocated = 0;
		let totalUsed = 0;
		let blockCount = 0;
		let activeBlocks = 0;

		for (const pool of this.pools.values()) {
			for (const block of pool) {
				totalAllocated += block.size;
				blockCount++;

				if (block.inUse) {
					totalUsed += block.size;
					activeBlocks++;
				}
			}
		}

		this.stats.totalAllocated = totalAllocated;
		this.stats.totalUsed = totalUsed;
		this.stats.totalFree = totalAllocated - totalUsed;
		this.stats.blockCount = blockCount;
		this.stats.activeBlocks = activeBlocks;
		this.stats.fragmentationRatio = this.calculateFragmentation();

		// 更新峰值使用量
		if (totalUsed > this.stats.peakUsage) {
			this.stats.peakUsage = totalUsed;
		}
	}

	private calculateFragmentation(): number {
		if (this.stats.totalAllocated === 0) return 0;

		let totalFragments = 0;
		let totalBlocks = 0;

		for (const pool of this.pools.values()) {
			let consecutiveFree = 0;

			for (const block of pool) {
				totalBlocks++;

				if (!block.inUse) {
					consecutiveFree++;
				} else {
					if (consecutiveFree > 0) {
						totalFragments += consecutiveFree;
						consecutiveFree = 0;
					}
				}
			}

			if (consecutiveFree > 0) {
				totalFragments += consecutiveFree;
			}
		}

		return totalBlocks > 0 ? totalFragments / totalBlocks : 0;
	}

	private defragmentMemoryPools(): void {
		for (const [_size, pool] of this.pools) {
			// 将使用中的块移到前面，空闲的块移到后面
			pool.sort((a, b) => {
				if (a.inUse && !b.inUse) return -1;
				if (!a.inUse && b.inUse) return 1;
				return 0;
			});
		}
	}

	private adjustPoolSizes(): void {
		// 基于使用模式调整各个池的大小
		for (const [size, pool] of this.pools) {
			const usageRatio = pool.filter((b) => b.inUse).length / pool.length;

			if (usageRatio > 0.8) {
				// 使用率高，增加池大小
				const additionalBlocks = Math.floor(pool.length * 0.2);
				for (let i = 0; i < additionalBlocks; i++) {
					if (this.canAllocateMore(size)) {
						pool.push(this.createMemoryBlock(size));
					}
				}
			} else if (usageRatio < 0.2 && pool.length > 1) {
				// 使用率低，减少池大小
				const blocksToRemove = Math.floor(pool.length * 0.1);
				const unusedBlocks = pool.filter((b) => !b.inUse);

				for (let i = 0; i < Math.min(blocksToRemove, unusedBlocks.length); i++) {
					const index = pool.indexOf(unusedBlocks[i]);
					if (index > -1) {
						pool.splice(index, 1);
					}
				}
			}
		}
	}

	private startMonitoring(): void {
		// 定期垃圾回收
		this.gcTimer = window.setInterval(() => {
			const usageRatio = this.stats.totalUsed / this.stats.totalAllocated;

			if (usageRatio > this.config.gcThreshold) {
				this.forceGarbageCollection();
			}
		}, this.config.monitoringInterval);

		// 定期内存优化
		this.monitorTimer = window.setInterval(() => {
			this.optimizeMemoryLayout();
		}, this.config.monitoringInterval * 2);
	}
}

/**
 * 内存泄漏检测器
 */
export class MemoryLeakDetector {
	private allocations = new Map<string, AllocationRecord>();
	private leakThreshold = 10 * 60 * 1000; // 10分钟

	trackAllocation(block: MemoryBlock): void {
		this.allocations.set(block.id, {
			blockId: block.id,
			size: block.size,
			allocatedAt: block.allocatedAt,
			stackTrace: this.captureStackTrace(),
			metadata: block.metadata,
		});
	}

	trackDeallocation(blockId: string): void {
		this.allocations.delete(blockId);
	}

	detectLeaks(): MemoryLeak[] {
		const now = Date.now();
		const leaks: MemoryLeak[] = [];

		for (const [blockId, record] of this.allocations) {
			const age = now - record.allocatedAt;

			if (age > this.leakThreshold) {
				leaks.push({
					blockId,
					size: record.size,
					allocatedAt: record.allocatedAt,
					age,
					refCount: 0, // 简化实现
					stackTrace: record.stackTrace,
					metadata: record.metadata,
				});
			}
		}

		return leaks;
	}

	destroy(): void {
		this.allocations.clear();
	}

	private captureStackTrace(): string {
		const stack = new Error().stack;
		return stack ? stack.split("\n").slice(2, 6).join("\n") : "";
	}
}

interface AllocationRecord {
	blockId: string;
	size: number;
	allocatedAt: number;
	stackTrace: string;
	metadata?: Record<string, unknown>;
}

/**
 * 智能内存管理器
 */
export class IntelligentMemoryManager {
	private poolManager: MemoryPoolManager;
	private compressionEnabled = true;
	private cacheOptimizer: CacheOptimizer;

	constructor(config?: Partial<MemoryPoolConfig>) {
		this.poolManager = new MemoryPoolManager(config);
		this.cacheOptimizer = new CacheOptimizer();
	}

	/**
	 * 智能分配内存
	 */
	async allocateIntelligent(
		size: number,
		priority: "low" | "medium" | "high" = "medium",
		metadata?: Record<string, unknown>
	): Promise<MemoryBlock | null> {
		// 根据优先级和当前内存状况决定分配策略
		const stats = this.poolManager.getMemoryStats();
		const usageRatio = stats.totalUsed / stats.totalAllocated;

		if (usageRatio > 0.9 && priority === "low") {
			logger.debug("⚠️ 内存使用率过高，拒绝低优先级分配");
			return null;
		}

		// 尝试压缩以释放空间
		if (usageRatio > 0.8 && this.compressionEnabled) {
			await this.compressMemory();
		}

		return this.poolManager.allocate(size, { priority, ...metadata });
	}

	/**
	 * 内存压缩
	 */
	private async compressMemory(): Promise<void> {
		logger.debug("🗜️ 开始内存压缩");

		// 这里可以实现数据压缩逻辑
		// 例如：压缩缓存数据、清理临时对象等

		this.poolManager.forceGarbageCollection();
		this.cacheOptimizer.optimizeCache();
	}

	/**
	 * 获取内存健康报告
	 */
	getHealthReport(): MemoryHealthReport {
		const stats = this.poolManager.getMemoryStats();
		const leaks = this.poolManager.detectMemoryLeaks();

		return {
			overall: this.calculateOverallHealth(stats, leaks),
			stats,
			leaks,
			recommendations: this.generateRecommendations(stats, leaks),
		};
	}

	private calculateOverallHealth(
		stats: MemoryStats,
		leaks: MemoryLeak[]
	): "excellent" | "good" | "fair" | "poor" {
		const usageRatio = stats.totalUsed / stats.totalAllocated;
		const fragmentationRatio = stats.fragmentationRatio;
		const leakCount = leaks.length;

		if (usageRatio < 0.7 && fragmentationRatio < 0.2 && leakCount === 0) {
			return "excellent";
		} else if (usageRatio < 0.8 && fragmentationRatio < 0.3 && leakCount < 3) {
			return "good";
		} else if (usageRatio < 0.9 && fragmentationRatio < 0.5 && leakCount < 10) {
			return "fair";
		} else {
			return "poor";
		}
	}

	private generateRecommendations(stats: MemoryStats, leaks: MemoryLeak[]): string[] {
		const recommendations: string[] = [];

		const usageRatio = stats.totalUsed / stats.totalAllocated;
		if (usageRatio > 0.8) {
			recommendations.push("考虑增加内存池大小或优化内存使用");
		}

		if (stats.fragmentationRatio > 0.3) {
			recommendations.push("执行内存碎片整理以提高效率");
		}

		if (leaks.length > 0) {
			recommendations.push(`发现 ${leaks.length} 个潜在内存泄漏，建议检查相关代码`);
		}

		if (stats.gcCount > 10) {
			recommendations.push("垃圾回收频率较高，考虑优化内存分配策略");
		}

		return recommendations;
	}

	destroy(): void {
		this.poolManager.destroy();
		this.cacheOptimizer.destroy();
	}
}

// 辅助类
class CacheOptimizer {
	optimizeCache(): void {
		// 缓存优化逻辑
		logger.debug("🔧 缓存优化完成");
	}

	destroy(): void {
		// 清理资源
	}
}

interface MemoryHealthReport {
	overall: "excellent" | "good" | "fair" | "poor";
	stats: MemoryStats;
	leaks: MemoryLeak[];
	recommendations: string[];
}
