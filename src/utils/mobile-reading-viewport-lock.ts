import {
	bindMobileFloatingViewport,
	getVisualViewportLayout,
	type VisualViewportLayout,
} from "./mobile-floating-viewport";
import { applyStyleProps } from "./style-props";

export const READING_VIEWPORT_LOCK_CLASS = "weave-reading-viewport-locked";
export const STUDY_EDIT_KEYBOARD_ACTIVE_BODY_CLASS = "weave-study-edit-keyboard-active";

const STUDY_VIEW_DATA_TYPES = ["weave-study-view", "weave-question-bank-view"] as const;

const LOCKED_STYLE_KEYS = [
	"position",
	"top",
	"left",
	"right",
	"bottom",
	"width",
	"height",
	"maxHeight",
	"overflow",
	"boxSizing",
] as const;

export interface ReadingViewportLockRect {
	offsetLeft: number;
	width: number;
	top: number;
	height: number;
}

function stylePropToCss(prop: (typeof LOCKED_STYLE_KEYS)[number]): string {
	return prop.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function captureStyleSnapshot(target: HTMLElement): Map<string, string> {
	const snapshot = new Map<string, string>();
	for (const prop of LOCKED_STYLE_KEYS) {
		snapshot.set(prop, target.style.getPropertyValue(stylePropToCss(prop)));
	}
	return snapshot;
}

function restoreStyleSnapshot(target: HTMLElement, snapshot: Map<string, string>) {
	for (const prop of LOCKED_STYLE_KEYS) {
		const cssProp = stylePropToCss(prop);
		const previous = snapshot.get(prop);
		if (previous) {
			target.style.setProperty(cssProp, previous);
		} else {
			target.style.removeProperty(cssProp);
		}
	}
}

/**
 * 计算 view-content 锁定矩形：从 visual viewport 可见区扣除 Obsidian view-header，
 * 避免 fixed 钉死时盖住原生顶栏（保存按钮所在区域）。
 */
export function computeReadingViewportLockRect(
	target: HTMLElement,
	layout: VisualViewportLayout = getVisualViewportLayout()
): ReadingViewportLockRect {
	const visibleTop = layout.offsetTop;
	const visibleBottom = layout.offsetTop + layout.height;
	let lockTop = visibleTop;

	const leafContent = target.closest(".workspace-leaf-content");
	const viewHeader = leafContent?.querySelector(":scope > .view-header");
	if (viewHeader instanceof HTMLElement) {
		const headerBottom = viewHeader.getBoundingClientRect().bottom;
		if (headerBottom > 0) {
			lockTop = Math.max(visibleTop, headerBottom);
		}
	}

	return {
		offsetLeft: layout.offsetLeft,
		width: layout.width,
		top: lockTop,
		height: Math.max(0, visibleBottom - lockTop),
	};
}

function applyLayoutToTarget(target: HTMLElement, layout: VisualViewportLayout) {
	const rect = computeReadingViewportLockRect(target, layout);

	applyStyleProps(target, {
		position: "fixed",
		top: `${rect.top}px`,
		left: `${rect.offsetLeft}px`,
		width: `${rect.width}px`,
		height: `${rect.height}px`,
		maxHeight: `${rect.height}px`,
		right: "auto",
		bottom: "auto",
		overflow: "hidden",
		boxSizing: "border-box",
	});
}

function stabilizeLayoutViewportScroll() {
	if (window.scrollY !== 0) {
		window.scrollTo(0, 0);
	}
}

/**
 * 解析应锁定的学习视图容器：优先 Obsidian leaf 的 view-content。
 */
export function resolveReadingViewportLockTarget(
	rootEl: HTMLElement | null | undefined
): HTMLElement | null {
	if (!rootEl) {
		return null;
	}

	for (const dataType of STUDY_VIEW_DATA_TYPES) {
		const leafContent = rootEl.closest(`.workspace-leaf-content[data-type="${dataType}"]`);
		const viewContent = leafContent?.querySelector(":scope > .view-content");
		if (viewContent instanceof HTMLElement) {
			return viewContent;
		}
	}

	const wrapper = rootEl.closest(".weave-study-view-wrapper");
	return wrapper instanceof HTMLElement ? wrapper : null;
}

export function isEditableFocusedWithin(rootEl: HTMLElement | null | undefined): boolean {
	if (!rootEl) {
		return false;
	}

	const active = document.activeElement;
	if (!(active instanceof HTMLElement) || !rootEl.contains(active)) {
		return false;
	}

	return active.matches(
		"textarea, input, [contenteditable='true'], [contenteditable=''], .cm-content"
	);
}

/**
 * 将学习/阅读 leaf 钉在当前 visual viewport 内，避免键盘弹出时正文被整体上推并露出空白占位。
 */
export function applyReadingViewportLock(target: HTMLElement): () => void {
	const snapshot = captureStyleSnapshot(target);
	let unbindViewport = () => {};

	target.classList.add(READING_VIEWPORT_LOCK_CLASS);

	const sync = () => {
		const layout = getVisualViewportLayout();
		applyLayoutToTarget(target, layout);
		stabilizeLayoutViewportScroll();
	};

	sync();
	unbindViewport = bindMobileFloatingViewport(sync);

	return () => {
		unbindViewport();
		target.classList.remove(READING_VIEWPORT_LOCK_CLASS);
		restoreStyleSnapshot(target, snapshot);
	};
}
