/**
 * 🎯 触控手势管理器
 * 为平板端提供滑动、长按、双击等手势支持
 */

export interface GestureConfig {
	// 滑动手势配置
	swipeThreshold: number; // 最小滑动距离
	swipeTimeLimit: number; // 滑动时间限制
	swipeVelocity: number; // 最小滑动速度

	// 长按手势配置
	longPressDelay: number; // 长按延迟时间
	longPressMoveLimit: number; // 长按时允许的最大移动距离

	// 双击手势配置
	doubleTapDelay: number; // 双击间隔时间
	doubleTapDistance: number; // 双击位置容差
}

export interface TouchPoint {
	x: number;
	y: number;
	time: number;
}

export interface GestureEvent {
	type: "swipe" | "longpress" | "doubletap" | "pinch";
	direction?: "left" | "right" | "up" | "down";
	startPoint: TouchPoint;
	endPoint?: TouchPoint;
	distance?: number;
	velocity?: number;
	element: HTMLElement;
}

export type GestureHandler = (event: GestureEvent) => void;

/**
 * 手势管理器类
 */
export class GestureManager {
	private config: GestureConfig = {
		swipeThreshold: 50, // 50px最小滑动距离
		swipeTimeLimit: 300, // 300ms内完成滑动
		swipeVelocity: 0.3, // 0.3px/ms最小速度

		longPressDelay: 500, // 500ms长按延迟
		longPressMoveLimit: 10, // 10px移动容差

		doubleTapDelay: 300, // 300ms双击间隔
		doubleTapDistance: 30, // 30px位置容差
	};

	private elements: Map<
		HTMLElement,
		{
			handlers: Map<string, GestureHandler>;
			touchState: TouchState;
			listeners: {
				touchstart: EventListener;
				touchmove: EventListener;
				touchend: EventListener;
				touchcancel: EventListener;
			};
		}
	> = new Map();

	private touchState: TouchState = {
		startPoint: null,
		currentPoint: null,
		isTracking: false,
		startTime: 0,
		longPressTimer: null,
		lastTap: null,
	};

	/**
	 * 为元素添加手势监听
	 */
	addGestureListener(element: HTMLElement, gestureType: string, handler: GestureHandler): void {
		if (!this.elements.has(element)) {
			const listeners = this.createElementListeners(element);
			this.elements.set(element, {
				handlers: new Map(),
				touchState: { ...this.touchState },
				listeners,
			});
			this.setupEventListeners(element);
		}

		const elementData = this.elements.get(element)!;
		elementData.handlers.set(gestureType, handler);
	}

	/**
	 * 移除手势监听
	 */
	removeGestureListener(element: HTMLElement, gestureType?: string): void {
		const elementData = this.elements.get(element);
		if (!elementData) return;

		if (gestureType) {
			elementData.handlers.delete(gestureType);
			if (elementData.handlers.size === 0) {
				this.cleanup(element);
				this.elements.delete(element);
			}
		} else {
			this.cleanup(element);
			this.elements.delete(element);
		}
	}

	/**
	 * 设置基础事件监听器
	 */
	private createElementListeners(element: HTMLElement): {
		touchstart: EventListener;
		touchmove: EventListener;
		touchend: EventListener;
		touchcancel: EventListener;
	} {
		return {
			touchstart: ((event: Event) => this.handleTouchStart(element, event as TouchEvent)) as EventListener,
			touchmove: ((event: Event) => this.handleTouchMove(element, event as TouchEvent)) as EventListener,
			touchend: ((event: Event) => this.handleTouchEnd(element, event as TouchEvent)) as EventListener,
			touchcancel: ((event: Event) =>
				this.handleTouchCancel(element, event as TouchEvent)) as EventListener,
		};
	}

	private setupEventListeners(element: HTMLElement): void {
		const elementData = this.elements.get(element);
		if (!elementData) return;

		// 使用被动监听器优化性能
		element.addEventListener("touchstart", elementData.listeners.touchstart, {
			passive: false,
		});
		element.addEventListener("touchmove", elementData.listeners.touchmove, {
			passive: false,
		});
		element.addEventListener("touchend", elementData.listeners.touchend, {
			passive: false,
		});
		element.addEventListener("touchcancel", elementData.listeners.touchcancel, {
			passive: false,
		});
	}

	/**
	 * 触摸开始处理
	 */
	private handleTouchStart(element: HTMLElement, event: TouchEvent): void {
		// 只处理单指触控
		if (event.touches.length !== 1) return;

		const touch = event.touches[0];
		const elementData = this.elements.get(element)!;
		const state = elementData.touchState;

		state.startPoint = {
			x: touch.clientX,
			y: touch.clientY,
			time: Date.now(),
		};
		state.currentPoint = { ...state.startPoint };
		state.isTracking = true;
		state.startTime = Date.now();

		// 设置长按计时器
		if (elementData.handlers.has("longpress")) {
			state.longPressTimer = setTimeout(() => {
				if (state.isTracking) {
					this.triggerLongPress(element, elementData);
				}
			}, this.config.longPressDelay);
		}

		// 检查双击
		if (elementData.handlers.has("doubletap")) {
			this.checkDoubleTap(element, elementData, state.startPoint);
		}
	}

	/**
	 * 触摸移动处理
	 */
	private handleTouchMove(element: HTMLElement, event: TouchEvent): void {
		if (event.touches.length !== 1) return;

		const touch = event.touches[0];
		const elementData = this.elements.get(element)!;
		const state = elementData.touchState;

		if (!state.isTracking || !state.startPoint) return;

		state.currentPoint = {
			x: touch.clientX,
			y: touch.clientY,
			time: Date.now(),
		};

		// 检查是否超出长按移动限制
		const distance = this.calculateDistance(state.startPoint, state.currentPoint);
		if (distance > this.config.longPressMoveLimit && state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = null;
		}

		// 防止页面滚动（可选）
		if (elementData.handlers.has("swipe")) {
			event.preventDefault();
		}
	}

	/**
	 * 触摸结束处理
	 */
	private handleTouchEnd(element: HTMLElement, _event: TouchEvent): void {
		const elementData = this.elements.get(element)!;
		const state = elementData.touchState;

		if (!state.isTracking || !state.startPoint || !state.currentPoint) return;

		// 清理长按计时器
		if (state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = null;
		}

		// 检查滑动手势
		if (elementData.handlers.has("swipe")) {
			this.checkSwipe(element, elementData);
		}

		// 重置状态
		this.resetTouchState(state);
	}

	/**
	 * 触摸取消处理
	 */
	private handleTouchCancel(element: HTMLElement, _event: TouchEvent): void {
		const elementData = this.elements.get(element)!;
		const state = elementData.touchState;

		if (state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = null;
		}

		this.resetTouchState(state);
	}

	/**
	 * 检查滑动手势
	 */
	private checkSwipe(element: HTMLElement, elementData: any): void {
		const state = elementData.touchState;
		if (!state.startPoint || !state.currentPoint) return;

		const distance = this.calculateDistance(state.startPoint, state.currentPoint);
		const deltaTime = state.currentPoint.time - state.startPoint.time;
		const velocity = distance / deltaTime;

		// 检查滑动条件
		if (
			distance < this.config.swipeThreshold ||
			deltaTime > this.config.swipeTimeLimit ||
			velocity < this.config.swipeVelocity
		) {
			return;
		}

		const direction = this.calculateDirection(state.startPoint, state.currentPoint);
		const handler = elementData.handlers.get("swipe");

		if (handler) {
			handler({
				type: "swipe",
				direction,
				startPoint: state.startPoint,
				endPoint: state.currentPoint,
				distance,
				velocity,
				element,
			});

			// 提供触觉反馈
			this.provideTactileFeedback("light");
		}
	}

	/**
	 * 触发长按手势
	 */
	private triggerLongPress(element: HTMLElement, elementData: any): void {
		const state = elementData.touchState;
		const handler = elementData.handlers.get("longpress");

		if (handler && state.startPoint) {
			handler({
				type: "longpress",
				startPoint: state.startPoint,
				element,
			});

			// 提供触觉反馈
			this.provideTactileFeedback("medium");
		}
	}

	/**
	 * 检查双击手势
	 */
	private checkDoubleTap(element: HTMLElement, elementData: any, currentTap: TouchPoint): void {
		const state = elementData.touchState;

		if (state.lastTap) {
			const timeDiff = currentTap.time - state.lastTap.time;
			const distance = this.calculateDistance(state.lastTap, currentTap);

			if (timeDiff <= this.config.doubleTapDelay && distance <= this.config.doubleTapDistance) {
				const handler = elementData.handlers.get("doubletap");
				if (handler) {
					handler({
						type: "doubletap",
						startPoint: currentTap,
						element,
					});

					// 提供触觉反馈
					this.provideTactileFeedback("heavy");
				}

				state.lastTap = null; // 重置以防三击
				return;
			}
		}

		state.lastTap = currentTap;
	}

	/**
	 * 计算两点距离
	 */
	private calculateDistance(point1: TouchPoint, point2: TouchPoint): number {
		const dx = point2.x - point1.x;
		const dy = point2.y - point1.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	/**
	 * 计算滑动方向
	 */
	private calculateDirection(start: TouchPoint, end: TouchPoint): "left" | "right" | "up" | "down" {
		const dx = end.x - start.x;
		const dy = end.y - start.y;

		if (Math.abs(dx) > Math.abs(dy)) {
			return dx > 0 ? "right" : "left";
		} else {
			return dy > 0 ? "down" : "up";
		}
	}

	/**
	 * 提供触觉反馈
	 */
	private provideTactileFeedback(intensity: "light" | "medium" | "heavy"): void {
		if ("vibrate" in navigator) {
			const patterns = {
				light: 30,
				medium: 50,
				heavy: [30, 30, 30],
			};
			navigator.vibrate(patterns[intensity]);
		}
	}

	/**
	 * 重置触摸状态
	 */
	private resetTouchState(state: TouchState): void {
		state.startPoint = null;
		state.currentPoint = null;
		state.isTracking = false;
		state.startTime = 0;
		if (state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = null;
		}
	}

	/**
	 * 清理元素资源
	 */
	private cleanup(element: HTMLElement): void {
		const elementData = this.elements.get(element);
		if (!elementData) return;

		element.removeEventListener("touchstart", elementData.listeners.touchstart);
		element.removeEventListener("touchmove", elementData.listeners.touchmove);
		element.removeEventListener("touchend", elementData.listeners.touchend);
		element.removeEventListener("touchcancel", elementData.listeners.touchcancel);

		if (elementData?.touchState.longPressTimer) {
			clearTimeout(elementData.touchState.longPressTimer);
		}
	}

	/**
	 * 销毁管理器
	 */
	destroy(): void {
		for (const element of this.elements.keys()) {
			this.cleanup(element);
		}

		this.elements.clear();
	}
}

export interface TouchState {
	startPoint: TouchPoint | null;
	currentPoint: TouchPoint | null;
	isTracking: boolean;
	startTime: number;
	longPressTimer: ReturnType<typeof setTimeout> | null;
	lastTap: TouchPoint | null;
}

// 全局手势管理器实例
export const gestureManager = new GestureManager();
