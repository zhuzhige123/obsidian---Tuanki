/**
 * 联动横向滚动条工具（表格、看板等视图共用）
 *
 * 职责：
 * - 判断是否需要显示顶部同步滚动条（含布局误差阈值）
 * - 同步顶部轨道与内容横向滚动容器
 * - 提供可测试的测量与调度工具
 */

/** 顶部横向滚动条轨道高度（像素），与 `.weave-table-top-scrollbar` 的 flex-basis 保持一致 */
export const TABLE_TOP_SCROLLBAR_HEIGHT_PX = 12;

/** 低于此像素差视为布局误差（如纵向滚动条占位），不展示顶部横向滚动条 */
export const TABLE_HORIZONTAL_OVERFLOW_THRESHOLD = 16;

/** Obsidian 侧栏开合等布局动画结束后的补测延迟（毫秒） */
export const TABLE_LAYOUT_SETTLE_DELAYS_MS = [120, 320] as const;

export interface HorizontalOverflowMetrics {
	viewportWidth: number;
	contentWidth: number;
	overflowAmount: number;
	hasOverflow: boolean;
}

export interface HorizontalOverflowMeasureTarget {
	/** 表格横向滚动容器（`.weave-table-scroll-x`） */
	scrollHost: HTMLElement;
	/** scrollHost.clientWidth 尚未就绪时的备用视口宽度（如外层容器） */
	fallbackViewportWidths?: Array<number | undefined>;
	threshold?: number;
}

export function measureHorizontalOverflow(
	target: HorizontalOverflowMeasureTarget
): HorizontalOverflowMetrics | null {
	const { scrollHost, fallbackViewportWidths = [], threshold = TABLE_HORIZONTAL_OVERFLOW_THRESHOLD } = target;

	const viewportWidth = Math.floor(
		scrollHost.clientWidth
		|| fallbackViewportWidths.find((width) => width != null && width > 0)
		|| 0
	);

	if (viewportWidth < 1) {
		return null;
	}

	const contentWidth = Math.ceil(scrollHost.scrollWidth);
	const overflowAmount = contentWidth - viewportWidth;

	return {
		viewportWidth,
		contentWidth,
		overflowAmount,
		hasOverflow: overflowAmount > threshold,
	};
}

export function canTopScrollbarScroll(
	topScrollbar: HTMLElement,
	threshold = TABLE_HORIZONTAL_OVERFLOW_THRESHOLD
): boolean {
	return topScrollbar.scrollWidth - topScrollbar.clientWidth > threshold;
}

export function syncLinkedHorizontalScroll(
	source: 'top' | 'content',
	topScrollbar: HTMLElement,
	scrollHost: HTMLElement
): void {
	if (source === 'top') {
		scrollHost.scrollLeft = topScrollbar.scrollLeft;
		return;
	}

	topScrollbar.scrollLeft = scrollHost.scrollLeft;
}

export function resetLinkedHorizontalScroll(
	scrollHost: HTMLElement,
	topScrollbar?: HTMLElement | null
): void {
	scrollHost.scrollLeft = 0;
	if (topScrollbar) {
		topScrollbar.scrollLeft = 0;
	}
}

export interface OverflowMeasureScheduler {
	schedule: () => void;
	scheduleAfterLayoutSettle: () => void;
	scheduleDebounced: (delayMs?: number) => void;
	dispose: () => void;
}

export function createOverflowMeasureScheduler(
	measure: () => void
): OverflowMeasureScheduler {
	let rafId: number | null = null;
	let resizeTimer: number | null = null;
	let layoutTimers: number[] = [];

	const schedule = () => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
		}

		rafId = window.requestAnimationFrame(() => {
			rafId = window.requestAnimationFrame(() => {
				measure();
				rafId = null;
			});
		});
	};

	const clearLayoutTimers = () => {
		for (const timer of layoutTimers) {
			window.clearTimeout(timer);
		}
		layoutTimers = [];
	};

	const scheduleAfterLayoutSettle = () => {
		schedule();
		clearLayoutTimers();
		layoutTimers = TABLE_LAYOUT_SETTLE_DELAYS_MS.map((delay) =>
			window.setTimeout(schedule, delay)
		);
	};

	const scheduleDebounced = (delayMs = 48) => {
		if (resizeTimer !== null) {
			window.clearTimeout(resizeTimer);
		}
		resizeTimer = window.setTimeout(() => {
			schedule();
			resizeTimer = null;
		}, delayMs);
	};

	const dispose = () => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		if (resizeTimer !== null) {
			window.clearTimeout(resizeTimer);
			resizeTimer = null;
		}
		clearLayoutTimers();
	};

	return {
		schedule,
		scheduleAfterLayoutSettle,
		scheduleDebounced,
		dispose,
	};
}
