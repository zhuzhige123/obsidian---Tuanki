export type ToolbarMode = 'floating' | 'docked';

export interface ToolbarRect {
	top: number;
	left: number;
	bottom: number;
	right: number;
	width: number;
	height: number;
}

export interface ToolbarPositionResult {
	top: number;
	left: number;
	arrowOffset: number;
	isBelowAnchor: boolean;
	mode: ToolbarMode;
}

export interface ToolbarPositionOptions {
	anchorRect: ToolbarRect;
	containerWidth: number;
	containerHeight: number;
	toolbarWidth: number;
	toolbarHeight: number;
	mobile: boolean;
	edgeMargin?: number;
	gap?: number;
	arrowPadding?: number;
}

export const TOOLBAR_EDGE_MARGIN = 12;
export const TOOLBAR_GAP = 12;
export const TOOLBAR_ARROW_PADDING = 18;

function clamp(value: number, min: number, max: number) {
	if (max < min) {
		return min;
	}
	return Math.min(Math.max(value, min), max);
}

export function computeToolbarPosition({
	anchorRect,
	containerWidth,
	containerHeight,
	toolbarWidth,
	toolbarHeight,
	mobile,
	edgeMargin = TOOLBAR_EDGE_MARGIN,
	gap = TOOLBAR_GAP,
	arrowPadding = TOOLBAR_ARROW_PADDING,
}: ToolbarPositionOptions): ToolbarPositionResult {
	if (mobile) {
		return {
			top: 0,
			left: containerWidth / 2,
			arrowOffset: 0,
			isBelowAnchor: true,
			mode: 'docked',
		};
	}

	const anchorCenterX = anchorRect.left + anchorRect.width / 2;
	const minCenterX = edgeMargin + toolbarWidth / 2;
	const maxCenterX = containerWidth - edgeMargin - toolbarWidth / 2;
	const left = clamp(anchorCenterX, minCenterX, maxCenterX);
	const availableAbove = anchorRect.top - gap - edgeMargin;
	const availableBelow = containerHeight - anchorRect.bottom - gap - edgeMargin;
	const isBelowAnchor = availableAbove < toolbarHeight && availableBelow > availableAbove;
	const preferredTop = isBelowAnchor
		? anchorRect.bottom + gap
		: anchorRect.top - toolbarHeight - gap;
	const maxTop = containerHeight - toolbarHeight - edgeMargin;
	const top = clamp(preferredTop, edgeMargin, maxTop);
	const arrowLimit = Math.max(0, toolbarWidth / 2 - arrowPadding);

	return {
		top,
		left,
		arrowOffset: clamp(anchorCenterX - left, -arrowLimit, arrowLimit),
		isBelowAnchor,
		mode: 'floating',
	};
}

export function createEventBinder() {
	const listeners: Array<() => void> = [];

	return {
		bind(
			target: EventTarget | null | undefined,
			event: string,
			handler: EventListenerOrEventListenerObject,
			options?: AddEventListenerOptions | boolean
		) {
			if (!target?.addEventListener || !target?.removeEventListener) {
				return;
			}
			target.addEventListener(event, handler, options);
			listeners.push(() => target.removeEventListener(event, handler, options));
		},
		dispose() {
			for (const dispose of listeners.splice(0)) {
				dispose();
			}
		},
	};
}

export function isEventOutsideToolbar(toolbarEl: HTMLElement | undefined, event: Event): boolean {
	return Boolean(toolbarEl && !toolbarEl.contains(event.target as Node));
}
