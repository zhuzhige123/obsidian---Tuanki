import type { WeaveTimerHandle } from "../types/timer-handle.js";
/**
 * 通用防抖工具
 * 用于替代项目中重复的防抖逻辑
 */

export interface DebouncerConfig {
	delay: number;
	immediate?: boolean; // 是否立即执行第一次调用
}

/**
 * 创建防抖器
 */
export function createDebouncer(config: DebouncerConfig | number) {
	const { delay, immediate = false } =
		typeof config === "number" ? { delay: config, immediate: false } : config;

	let lastTime = 0;
	let timeoutId: WeaveTimerHandle | null = null;

	return function debounce<T extends (...args: unknown[]) => unknown>(
		callback: T
	): (...args: Parameters<T>) => void {
		return function (this: unknown, ...args: Parameters<T>) {
			const now = Date.now();

			const later = () => {
				lastTime = now;
				timeoutId = null;
				callback.apply(this, args);
			};

			if (immediate && !timeoutId) {
				later();
				return;
			}

			if (timeoutId) {
				window.clearTimeout(timeoutId);
			}

			if (now - lastTime >= delay) {
				later();
			} else {
				timeoutId = window.setTimeout(later, delay - (now - lastTime));
			}
		};
	};
}

/**
 * 简单的时间防抖检查器
 * 用于替代简单的时间戳检查逻辑
 */
export class TimebasedDebouncer {
	private lastTime = 0;

	constructor(private delay: number) {}

	/**
	 * 检查是否应该执行
	 */
	shouldExecute(): boolean {
		const now = Date.now();
		if (now - this.lastTime >= this.delay) {
			this.lastTime = now;
			return true;
		}
		return false;
	}

	/**
	 * 重置计时器
	 */
	reset(): void {
		this.lastTime = 0;
	}

	/**
	 * 获取距离上次执行的时间
	 */
	getTimeSinceLastExecution(): number {
		return Date.now() - this.lastTime;
	}
}

/**
 * 创建简单的时间防抖器
 */
export function createTimestampDebouncer(delay: number): TimebasedDebouncer {
	return new TimebasedDebouncer(delay);
}

/**
 * 简单的防抖函数
 * @param fn 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: WeaveTimerHandle | null = null;

	return function (this: unknown, ...args: Parameters<T>) {
		if (timeoutId) {
			window.clearTimeout(timeoutId);
		}

		timeoutId = window.setTimeout(() => {
			fn.apply(this, args);
		}, delay);
	};
}
