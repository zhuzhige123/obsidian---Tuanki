/**
 * 请求合并器
 *
 * 合并短时间内的多个焦点恢复请求，避免频繁调用 setActiveLeaf。
 * 使用 requestAnimationFrame 进行延迟，确保在下一帧执行。
 */

import { logger } from "../logger";
import type { IRequestCoalescer } from "./types";

interface PendingRequest {
	action: () => void;
	timeoutId: ReturnType<typeof setTimeout> | null;
}

/**
 * 请求合并器实现
 */
export class RequestCoalescer implements IRequestCoalescer {
	private pendingRequests: Map<string, PendingRequest> = new Map();
	private readyKeys: Set<string> = new Set();
	private flushRafId: number | null = null;
	private flushTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private debounceMs: number;
	private debugMode: boolean;

	constructor(debounceMs = 100, debugMode = false) {
		this.debounceMs = debounceMs;
		this.debugMode = debugMode;
	}

	/**
	 * 调度一个操作
	 * 相同 key 的操作会被合并，只执行最后一个
	 */
	schedule(action: () => void, key: string): void {
		// 取消之前的同 key 请求
		this.cancel(key);

		if (this.debugMode) {
			logger.debug("[RequestCoalescer] 调度请求:", key);
		}

		// 使用 debounce + 单次批量 flush
		// timeout 负责合并频繁请求，flush 再统一安排到下一帧执行
		const timeoutId = window.setTimeout(() => {
			const request = this.pendingRequests.get(key);
			if (request) {
				request.timeoutId = null;
				this.readyKeys.add(key);
				this.scheduleFlush();
			}
		}, this.debounceMs);

		this.pendingRequests.set(key, {
			action,
			timeoutId,
		});
	}

	/**
	 * 取消指定 key 的操作
	 */
	cancel(key: string): void {
		const request = this.pendingRequests.get(key);
		if (request) {
			if (request.timeoutId !== null) {
				window.clearTimeout(request.timeoutId);
			}
			this.pendingRequests.delete(key);
			this.readyKeys.delete(key);
			this.cancelScheduledFlushIfIdle();

			if (this.debugMode) {
				logger.debug("[RequestCoalescer] 取消请求:", key);
			}
		}
	}

	/**
	 * 立即执行所有待处理的操作
	 */
	flush(): void {
		if (this.debugMode) {
			logger.debug("[RequestCoalescer] 刷新所有请求，数量:", this.pendingRequests.size);
		}

		const requests = Array.from(this.pendingRequests.entries());

		// 先清理所有定时器
		for (const [, request] of requests) {
			if (request.timeoutId !== null) {
				window.clearTimeout(request.timeoutId);
			}
		}

		// 清空 map
		this.pendingRequests.clear();
		this.readyKeys.clear();
		this.cancelScheduledFlush();

		// 执行所有操作
		for (const [key, request] of requests) {
			try {
				request.action();
				if (this.debugMode) {
					logger.debug("[RequestCoalescer] 刷新执行:", key);
				}
			} catch (error) {
				logger.error("[RequestCoalescer] 刷新执行失败:", key, error);
			}
		}
	}

	/**
	 * 设置防抖时间
	 */
	setDebounceMs(ms: number): void {
		this.debounceMs = ms;
	}

	/**
	 * 设置调试模式
	 */
	setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}

	/**
	 * 获取待处理请求数量
	 */
	getPendingCount(): number {
		return this.pendingRequests.size;
	}

	/**
	 * 清理所有待处理请求（不执行）
	 */
	clear(): void {
		for (const [, request] of this.pendingRequests) {
			if (request.timeoutId !== null) {
				window.clearTimeout(request.timeoutId);
			}
		}
		this.pendingRequests.clear();
		this.readyKeys.clear();
		this.cancelScheduledFlush();

		if (this.debugMode) {
			logger.debug("[RequestCoalescer] 清理所有请求");
		}
	}

	private scheduleFlush(): void {
		if (this.flushRafId !== null || this.flushTimeoutId !== null) {
			return;
		}

		const flushNow = () => {
			this.flushRafId = null;
			this.flushTimeoutId = null;
			this.runReadyRequests();
		};

		if (typeof requestAnimationFrame === "function") {
			this.flushRafId = window.requestAnimationFrame(flushNow);
			return;
		}

		this.flushTimeoutId = window.setTimeout(flushNow, 0);
	}

	private runReadyRequests(): void {
		const keys = Array.from(this.readyKeys);
		this.readyKeys.clear();

		for (const key of keys) {
			const request = this.pendingRequests.get(key);
			if (!request) continue;

			this.pendingRequests.delete(key);

			if (this.debugMode) {
				logger.debug("[RequestCoalescer] 执行请求:", key);
			}

			try {
				request.action();
			} catch (error) {
				logger.error("[RequestCoalescer] 执行请求失败:", key, error);
			}
		}
	}

	private cancelScheduledFlushIfIdle(): void {
		if (this.readyKeys.size === 0) {
			this.cancelScheduledFlush();
		}
	}

	private cancelScheduledFlush(): void {
		if (this.flushRafId !== null) {
			cancelAnimationFrame(this.flushRafId);
			this.flushRafId = null;
		}
		if (this.flushTimeoutId !== null) {
			window.clearTimeout(this.flushTimeoutId);
			this.flushTimeoutId = null;
		}
	}
}
