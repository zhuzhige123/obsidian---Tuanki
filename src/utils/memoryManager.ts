import { getChromePerformanceMemory } from "./chrome-performance-memory";
import { isCallable, readUnknownProperty } from "./dynamic-access";
import { logger } from "../utils/logger";
/**
 * 内存管理工具 - 防止内存泄露和监控内存使用
 */

function callObserverMethod(observer: unknown, methodName: "disconnect" | "unobserve"): void {
	const method = readUnknownProperty(observer, methodName);
	if (isCallable(method)) {
		Reflect.apply(method, observer, []);
	}
}

/**
 * 内存使用信息
 */
interface MemoryInfo {
	used: number;
	total: number;
	percentage: number;
	timestamp: number;
}

/**
 * 资源引用管理器
 */
class ResourceReferenceManager {
	private references = new Map<string, Set<unknown>>();
	private timers = new Set<number>();
	private observers = new Set<unknown>();
	private eventListeners = new Map<EventTarget, Map<string, EventListener>>();

	/**
	 * 注册定时器
	 */
	registerTimer(id: number, description?: string): void {
		this.timers.add(id);
		if (description && typeof window !== "undefined") {
			logger.debug(`[MemoryManager] 注册定时器: ${id} - ${description}`);
		}
	}

	/**
	 * 清理定时器
	 */
	clearTimer(id: number): void {
		if (this.timers.has(id)) {
			window.clearTimeout(id);
			window.clearInterval(id);
			this.timers.delete(id);
			logger.debug(`[MemoryManager] 清理定时器: ${id}`);
		}
	}

	/**
	 * 清理所有定时器
	 */
	clearAllTimers(): void {
		this.timers.forEach((_id) => {
			window.clearTimeout(_id);
			window.clearInterval(_id);
		});
		logger.debug(`[MemoryManager] 清理了 ${this.timers.size} 个定时器`);
		this.timers.clear();
	}

	/**
	 * 注册观察者
	 */
	registerObserver(observer: unknown, description?: string): void {
		this.observers.add(observer);
		if (description) {
			logger.debug(`[MemoryManager] 注册观察者: ${description}`);
		}
	}

	/**
	 * 清理观察者
	 */
	clearObserver(observer: unknown): void {
		if (this.observers.has(observer)) {
			callObserverMethod(observer, "disconnect");
			callObserverMethod(observer, "unobserve");
			this.observers.delete(observer);
			logger.debug("[MemoryManager] 清理观察者");
		}
	}

	/**
	 * 清理所有观察者
	 */
	clearAllObservers(): void {
		this.observers.forEach((_observer) => {
			try {
				callObserverMethod(_observer, "disconnect");
				callObserverMethod(_observer, "unobserve");
			} catch (e) {
				logger.warn("[MemoryManager] 清理观察者失败:", e);
			}
		});
		logger.debug(`[MemoryManager] 清理了 ${this.observers.size} 个观察者`);
		this.observers.clear();
	}

	/**
	 * 注册事件监听器
	 */
	registerEventListener(
		target: EventTarget,
		event: string,
		listener: EventListener,
		options?: boolean | AddEventListenerOptions
	): void {
		target.addEventListener(event, listener, options);

		if (!this.eventListeners.has(target)) {
			this.eventListeners.set(target, new Map());
		}
		this.eventListeners.get(target)?.set(event, listener);

		logger.debug(`[MemoryManager] 注册事件监听器: ${event}`);
	}

	/**
	 * 移除事件监听器
	 */
	removeEventListener(target: EventTarget, event: string): void {
		const targetListeners = this.eventListeners.get(target);
		if (targetListeners?.has(event)) {
			const listener = targetListeners.get(event)!;
			target.removeEventListener(event, listener);
			targetListeners.delete(event);

			if (targetListeners.size === 0) {
				this.eventListeners.delete(target);
			}

			logger.debug(`[MemoryManager] 移除事件监听器: ${event}`);
		}
	}

	/**
	 * 清理所有事件监听器
	 */
	clearAllEventListeners(): void {
		let count = 0;
		this.eventListeners.forEach((listeners, target) => {
			listeners.forEach((listener, event) => {
				try {
					target.removeEventListener(event, listener);
					count++;
				} catch (e) {
					logger.warn("[MemoryManager] 移除事件监听器失败:", e);
				}
			});
		});
		logger.debug(`[MemoryManager] 清理了 ${count} 个事件监听器`);
		this.eventListeners.clear();
	}

	/**
	 * 添加引用
	 */
	addReference(category: string, reference: unknown): void {
		if (!this.references.has(category)) {
			this.references.set(category, new Set());
		}
		this.references.get(category)?.add(reference);
	}

	/**
	 * 移除引用
	 */
	removeReference(category: string, reference: unknown): void {
		const refs = this.references.get(category);
		if (refs) {
			refs.delete(reference);
			if (refs.size === 0) {
				this.references.delete(category);
			}
		}
	}

	/**
	 * 清理所有资源
	 */
	clearAll(): void {
		this.clearAllTimers();
		this.clearAllObservers();
		this.clearAllEventListeners();
		this.references.clear();
		logger.debug("[MemoryManager] 清理了所有资源");
	}

	/**
	 * 获取资源统计
	 */
	getStats(): { timers: number; observers: number; listeners: number; references: number } {
		let listenerCount = 0;
		this.eventListeners.forEach((_listeners) => {
			listenerCount += _listeners.size;
		});

		let referenceCount = 0;
		this.references.forEach((_refs) => {
			referenceCount += _refs.size;
		});

		return {
			timers: this.timers.size,
			observers: this.observers.size,
			listeners: listenerCount,
			references: referenceCount,
		};
	}
}

/**
 * 内存监控器
 */
class MemoryMonitor {
	private monitoring = false;
	private interval: number | null = null;
	private callbacks: Array<(info: MemoryInfo) => void> = [];
	private history: MemoryInfo[] = [];
	private maxHistorySize = 100;

	/**
	 * 开始监控
	 */
	startMonitoring(intervalMs = 30000): void {
		if (this.monitoring) return;

		this.monitoring = true;
		this.interval = window.setInterval(() => {
			this.checkMemory();
		}, intervalMs);

		logger.debug("[MemoryMonitor] 开始内存监控");
	}

	/**
	 * 停止监控
	 */
	stopMonitoring(): void {
		if (!this.monitoring) return;

		this.monitoring = false;
		if (this.interval) {
			window.clearInterval(this.interval);
			this.interval = null;
		}

		logger.debug("[MemoryMonitor] 停止内存监控");
	}

	destroy(): void {
		try {
			this.stopMonitoring();
		} catch { /* no-op */ }
		this.callbacks = [];
		this.history = [];
	}

	/**
	 * 检查内存使用
	 */
	private checkMemory(): void {
		const memory = getChromePerformanceMemory();
		if (!memory) {
			return;
		}

		const info: MemoryInfo = {
			used: memory.usedJSHeapSize,
			total: memory.totalJSHeapSize,
			percentage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100,
			timestamp: Date.now(),
		};

		this.history.push(info);
		if (this.history.length > this.maxHistorySize) {
			this.history.shift();
		}

		// 检查内存使用是否过高
		if (info.percentage > 80) {
			logger.warn(`[MemoryMonitor] 内存使用过高: ${info.percentage.toFixed(2)}%`);
			this.triggerGarbageCollection();
		}

		// 通知回调函数
		this.callbacks.forEach((_callback) => {
			try {
				_callback(info);
			} catch (e) {
				logger.warn("[MemoryMonitor] 回调函数执行失败:", e);
			}
		});
	}

	/**
	 * 添加监控回调
	 */
	addCallback(callback: (info: MemoryInfo) => void): void {
		this.callbacks.push(callback);
	}

	/**
	 * 移除监控回调
	 */
	removeCallback(callback: (info: MemoryInfo) => void): void {
		const index = this.callbacks.indexOf(callback);
		if (index > -1) {
			this.callbacks.splice(index, 1);
		}
	}

	/**
	 * 获取内存历史
	 */
	getHistory(): MemoryInfo[] {
		return [...this.history];
	}

	/**
	 * 获取当前内存信息
	 */
	getCurrentMemoryInfo(): MemoryInfo | null {
		const memory = getChromePerformanceMemory();
		if (!memory) {
			return null;
		}

		return {
			used: memory.usedJSHeapSize,
			total: memory.totalJSHeapSize,
			percentage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100,
			timestamp: Date.now(),
		};
	}

	/**
	 * 触发垃圾回收（如果支持）
	 */
	private triggerGarbageCollection(): void {
		if (typeof window === "undefined") {
			return;
		}
		const gc = readUnknownProperty(window, "gc");
		if (!isCallable(gc)) {
			return;
		}
		try {
			Reflect.apply(gc, window, []);
			logger.debug("[MemoryMonitor] 触发垃圾回收");
		} catch (e) {
			logger.warn("[MemoryMonitor] 垃圾回收失败:", e);
		}
	}
}

/**
 * 全局内存管理器实例
 */
function getOrCreateMemoryManager(): ResourceReferenceManager {
	if (typeof window === "undefined") {
		return new ResourceReferenceManager();
	}

		if (window.__weaveMemoryManager) {
		return window.__weaveMemoryManager as ResourceReferenceManager;
	}

	const instance = new ResourceReferenceManager();
	window.__weaveMemoryManager = instance;
	return instance;
}

function getOrCreateMemoryMonitor(): MemoryMonitor {
	if (typeof window === "undefined") {
		return new MemoryMonitor();
	}

		if (window.__weaveMemoryMonitor) {
		return window.__weaveMemoryMonitor as MemoryMonitor;
	}

	const instance = new MemoryMonitor();
	window.__weaveMemoryMonitor = instance;

	if (typeof window.__weaveMemoryManagerCleanup !== "function") {
		window.__weaveMemoryManagerCleanup = () => {
			try {
				(window.__weaveMemoryMonitor as MemoryMonitor | undefined)?.destroy();
			} catch { /* no-op */ }

			try {
				(window.__weaveMemoryManager as ResourceReferenceManager | undefined)?.clearAll();
			} catch { /* no-op */ }

			try {
				window.__weaveMemoryMonitor = undefined;
				window.__weaveMemoryManager = undefined;
				window.__weaveMemoryManagerCleanup = undefined;
			} catch {
				window.__weaveMemoryMonitor = null;
				window.__weaveMemoryManager = null;
				window.__weaveMemoryManagerCleanup = null;
			}
		};
	}

	return instance;
}

export const memoryManager = getOrCreateMemoryManager();
export const memoryMonitor = getOrCreateMemoryMonitor();

/**
 * 便捷的清理函数创建器
 */
export function createCleanupManager() {
	const cleanupFunctions: Array<() => void> = [];

	return {
		/**
		 * 添加清理函数
		 */
		add(cleanupFn: () => void): void {
			cleanupFunctions.push(cleanupFn);
		},

		/**
		 * 添加定时器清理
		 */
		addTimer(id: number): void {
			memoryManager.registerTimer(id);
			cleanupFunctions.push(() => memoryManager.clearTimer(id));
		},

		/**
		 * 添加事件监听器清理
		 */
		addEventListener(
			target: EventTarget,
			event: string,
			listener: EventListener,
			options?: boolean | AddEventListenerOptions
		): void {
			memoryManager.registerEventListener(target, event, listener, options);
			cleanupFunctions.push(() => memoryManager.removeEventListener(target, event));
		},

		/**
		 * 添加观察者清理
		 */
		addObserver(observer: unknown): void {
			memoryManager.registerObserver(observer);
			cleanupFunctions.push(() => memoryManager.clearObserver(observer));
		},

		/**
		 * 执行所有清理函数
		 */
		cleanup(): void {
			cleanupFunctions.forEach((_fn) => {
				try {
					_fn();
				} catch (e) {
					logger.warn("[CleanupManager] 清理函数执行失败:", e);
				}
			});
			cleanupFunctions.length = 0;
		},

		/**
		 * 获取清理函数数量
		 */
		size(): number {
			return cleanupFunctions.length;
		},
	};
}

/**
 * 用于组件的内存管理 Hook
 */
export function useMemoryManagement() {
	const cleanup = createCleanupManager();

	return {
		cleanup,

		/**
		 * 安全的 setTimeout
		 */
		setTimeout(callback: () => void, delay: number): number {
			const id = window.setTimeout(callback, delay);
			cleanup.addTimer(id);
			return id;
		},

		/**
		 * 安全的 setInterval
		 */
		setInterval(callback: () => void, delay: number): number {
			const id = window.setInterval(callback, delay);
			cleanup.addTimer(id);
			return id;
		},

		/**
		 * 安全的事件监听器
		 */
		addEventListener(
			target: EventTarget,
			event: string,
			listener: EventListener,
			options?: boolean | AddEventListenerOptions
		): void {
			cleanup.addEventListener(target, event, listener, options);
		},

		/**
		 * 组件卸载时调用
		 */
		onDestroy(): void {
			cleanup.cleanup();
		},
	};
}
