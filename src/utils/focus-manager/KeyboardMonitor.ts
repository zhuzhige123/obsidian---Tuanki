/**
 * 键盘监控器（移动端专用）
 *
 * 使用 Visual Viewport API 检测键盘状态，
 * 避免在键盘动画期间触发焦点操作。
 */

import { logger } from "../logger";
import type { IKeyboardMonitor, KeyboardState } from "./types";
import type { WeaveTimerHandle } from "../../types/timer-handle.js";

/**
 * 键盘监控器实现
 */
export class KeyboardMonitor implements IKeyboardMonitor {
	private state: KeyboardState = {
		isVisible: false,
		isAnimating: false,
		height: 0,
	};

	private listeners: Set<(state: KeyboardState) => void> = new Set();
	private initialViewportHeight = 0;
	private resizeHandler: (() => void) | null = null;
	private animationTimer: WeaveTimerHandle | null = null;
	private isListening = false;
	private debugMode = false;

	// 配置
	private readonly KEYBOARD_THRESHOLD = 150; // 视口高度变化超过此值认为键盘弹出
	private readonly ANIMATION_DURATION = 300; // 键盘动画持续时间（毫秒）

	constructor(debugMode = false) {
		this.debugMode = debugMode;
		this.initialViewportHeight = this.getViewportHeight();
	}

	/**
	 * 检查 Visual Viewport API 是否可用
	 */
	static isSupported(): boolean {
		return (
			typeof window !== "undefined" &&
			window.visualViewport !== null &&
			window.visualViewport !== undefined
		);
	}

	/**
	 * 获取当前键盘状态
	 */
	getState(): KeyboardState {
		return { ...this.state };
	}

	/**
	 * 监听状态变化
	 * @returns 取消监听函数
	 */
	onStateChange(callback: (state: KeyboardState) => void): () => void {
		this.listeners.add(callback);
		return () => {
			this.listeners.delete(callback);
		};
	}

	/**
	 * 键盘是否处于活跃状态（可见或动画中）
	 */
	isKeyboardActive(): boolean {
		return this.state.isVisible || this.state.isAnimating;
	}

	/**
	 * 开始监听
	 */
	startListening(): void {
		if (this.isListening) {
			if (this.debugMode) {
				logger.debug("[KeyboardMonitor] 已经在监听中");
			}
			return;
		}

		// 更新初始视口高度
		this.initialViewportHeight = this.getViewportHeight();

		if (KeyboardMonitor.isSupported()) {
			this.resizeHandler = this.handleViewportResize.bind(this);
			window.visualViewport?.addEventListener("resize", this.resizeHandler);

			if (this.debugMode) {
				logger.debug("[KeyboardMonitor] 开始监听 Visual Viewport");
			}
		} else {
			// 降级方案：监听 window resize
			this.resizeHandler = this.handleWindowResize.bind(this);
			window.addEventListener("resize", this.resizeHandler);

			if (this.debugMode) {
				logger.debug("[KeyboardMonitor] Visual Viewport 不可用，使用降级方案");
			}
		}

		this.isListening = true;
	}

	/**
	 * 停止监听
	 */
	stopListening(): void {
		if (!this.isListening) return;

		if (KeyboardMonitor.isSupported() && this.resizeHandler) {
			window.visualViewport?.removeEventListener("resize", this.resizeHandler);
		} else if (this.resizeHandler) {
			window.removeEventListener("resize", this.resizeHandler);
		}

		if (this.animationTimer) {
			window.clearTimeout(this.animationTimer);
			this.animationTimer = null;
		}

		this.resizeHandler = null;
		this.isListening = false;

		if (this.debugMode) {
			logger.debug("[KeyboardMonitor] 停止监听");
		}
	}

	/**
	 * 获取当前视口高度
	 */
	private getViewportHeight(): number {
		if (KeyboardMonitor.isSupported()) {
			return window.visualViewport?.height ?? window.innerHeight;
		}
		return window.innerHeight;
	}

	/**
	 * 处理 Visual Viewport resize 事件
	 */
	private handleViewportResize(): void {
		const currentHeight = this.getViewportHeight();
		const heightDiff = this.initialViewportHeight - currentHeight;

		const wasVisible = this.state.isVisible;
		const isNowVisible = heightDiff > this.KEYBOARD_THRESHOLD;

		// 检测状态变化
		if (isNowVisible !== wasVisible) {
			// 状态变化，标记为动画中
			this.state.isAnimating = true;

			// 清除之前的动画计时器
			if (this.animationTimer) {
				window.clearTimeout(this.animationTimer);
			}

			// 动画结束后清除标记
			this.animationTimer = window.setTimeout(() => {
				this.state.isAnimating = false;
				this.notifyListeners();

				if (this.debugMode) {
					logger.debug("[KeyboardMonitor] 键盘动画结束");
				}
			}, this.ANIMATION_DURATION);
		}

		// 更新状态
		this.state = {
			isVisible: isNowVisible,
			isAnimating: this.state.isAnimating,
			height: Math.max(0, heightDiff),
		};

		if (this.debugMode && isNowVisible !== wasVisible) {
			logger.debug("[KeyboardMonitor] 键盘状态变化:", {
				isVisible: isNowVisible,
				height: this.state.height,
				isAnimating: this.state.isAnimating,
			});
		}

		this.notifyListeners();
	}

	/**
	 * 处理 window resize 事件（降级方案）
	 */
	private handleWindowResize(): void {
		const currentHeight = window.innerHeight;
		const heightDiff = this.initialViewportHeight - currentHeight;

		const wasVisible = this.state.isVisible;
		const isNowVisible = heightDiff > this.KEYBOARD_THRESHOLD;

		if (isNowVisible !== wasVisible) {
			this.state.isAnimating = true;

			if (this.animationTimer) {
				window.clearTimeout(this.animationTimer);
			}

			this.animationTimer = window.setTimeout(() => {
				this.state.isAnimating = false;
				this.notifyListeners();
			}, this.ANIMATION_DURATION);
		}

		this.state = {
			isVisible: isNowVisible,
			isAnimating: this.state.isAnimating,
			height: Math.max(0, heightDiff),
		};

		this.notifyListeners();
	}

	/**
	 * 通知所有监听器
	 */
	private notifyListeners(): void {
		const stateCopy = { ...this.state };
		for (const listener of this.listeners) {
			try {
				listener(stateCopy);
			} catch (error) {
				logger.error("[KeyboardMonitor] 监听器执行失败:", error);
			}
		}
	}

	/**
	 * 重置初始视口高度
	 * 在键盘完全收起后调用
	 */
	resetInitialHeight(): void {
		this.initialViewportHeight = this.getViewportHeight();
		this.state = {
			isVisible: false,
			isAnimating: false,
			height: 0,
		};

		if (this.debugMode) {
			logger.debug("[KeyboardMonitor] 重置初始高度:", this.initialViewportHeight);
		}
	}

	/**
	 * 设置调试模式
	 */
	setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}

	/**
	 * 销毁
	 */
	destroy(): void {
		this.stopListening();
		this.listeners.clear();
	}
}
