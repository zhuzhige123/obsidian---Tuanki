import { Platform } from "obsidian";

export const MOBILE_KEYBOARD_THRESHOLD = 150;

export interface VisualViewportLayout {
	offsetTop: number;
	offsetLeft: number;
	width: number;
	height: number;
	keyboardVisible: boolean;
}

export interface FixedPopoverRect {
	top: number;
	left: number;
	width: number;
}

export function isMobileFloatingEditorTarget(): boolean {
	return (
		Platform.isMobile
		|| document.body.classList.contains("is-mobile")
		|| document.body.classList.contains("is-phone")
	);
}

export function detectKeyboardVisible(
	viewportHeight: number,
	layoutHeight: number = window.innerHeight,
	threshold: number = MOBILE_KEYBOARD_THRESHOLD
): boolean {
	return layoutHeight - viewportHeight > threshold;
}

export function getVisualViewportLayout(
	threshold: number = MOBILE_KEYBOARD_THRESHOLD
): VisualViewportLayout {
	const visualViewport = window.visualViewport;
	const height = visualViewport?.height ?? window.innerHeight;
	const width = visualViewport?.width ?? window.innerWidth;

	return {
		offsetTop: visualViewport?.offsetTop ?? 0,
		offsetLeft: visualViewport?.offsetLeft ?? 0,
		width,
		height,
		keyboardVisible: detectKeyboardVisible(height, window.innerHeight, threshold),
	};
}

/**
 * 将浮层贴在当前可见视口底部（键盘上方）。
 */
export function computeKeyboardAnchoredFixedRect(
	popoverHeight: number,
	edgeMargin = 12,
	layout: VisualViewportLayout = getVisualViewportLayout()
): FixedPopoverRect {
	const minTop = layout.offsetTop + edgeMargin;
	const maxTop = layout.offsetTop + layout.height - popoverHeight - edgeMargin;

	return {
		top: Math.max(minTop, maxTop),
		left: layout.offsetLeft + edgeMargin,
		width: Math.max(220, layout.width - edgeMargin * 2),
	};
}

export function bindMobileFloatingViewport(onChange: () => void): () => void {
	let frameId = 0;
	const notify = () => {
		if (frameId) {
			window.cancelAnimationFrame(frameId);
		}
		frameId = window.requestAnimationFrame(() => {
			frameId = 0;
			onChange();
		});
	};

	notify();

	const visualViewport = window.visualViewport;
	visualViewport?.addEventListener("resize", notify);
	visualViewport?.addEventListener("scroll", notify);
	window.addEventListener("resize", notify);
	window.addEventListener("orientationchange", notify);

	return () => {
		if (frameId) {
			window.cancelAnimationFrame(frameId);
			frameId = 0;
		}
		visualViewport?.removeEventListener("resize", notify);
		visualViewport?.removeEventListener("scroll", notify);
		window.removeEventListener("resize", notify);
		window.removeEventListener("orientationchange", notify);
	};
}
