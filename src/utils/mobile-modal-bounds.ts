/**
 * 移动端模态窗边界检测工具
 *
 * 目标：
 * 1. 不再依赖固定像素兜底；
 * 2. 根据 Obsidian 实际可见的顶部/底部 UI 几何位置计算可用空间；
 * 3. 当移动端导航切换为固定、悬浮、自动隐藏等状态时，自动刷新 CSS 变量。
 */

export interface WorkspaceBounds {
	/** 顶部安全边界（距视口顶部的距离） */
	top: number;
	/** 底部安全边界（距视口底部的距离） */
	bottom: number;
	/** 可用高度 */
	height: number;
	/** 检测到的元素信息（用于调试） */
	detected: string;
}

type Edge = "top" | "bottom";

type MobileBoundsWindow = Window &
	typeof globalThis & {
		__weaveMobileBoundsInjected?: boolean;
		__weaveMobileBoundsCleanup?: (() => void) | null;
		__weaveMobileModalAdaptationCleanup?: (() => void) | null;
	};

const TOP_SELECTORS = [
	".mobile-navbar",
	".workspace-tab-header-container",
	".view-header",
	".titlebar",
	"[class*='mobile-nav']",
	"[class*='view-header']",
	"[class*='titlebar']",
];

const BOTTOM_SELECTORS = [
	".mobile-toolbar",
	".status-bar",
	"[class*='mobile-toolbar']",
	"[class*='mobile-tab']",
	"[class*='bottom-toolbar']",
	"[class*='status-bar']",
	"[class*='nav-bar']",
	"[class*='bottom-nav']",
];

const HEURISTIC_SELECTORS = [
	"body > *",
	".app-container > *",
	".workspace > *",
	".workspace-split > *",
	"[class*='mobile']",
	"[class*='toolbar']",
	"[class*='header']",
	"[class*='status']",
	"[class*='nav']",
];

const IGNORED_MEASUREMENT_SELECTORS = [
	".weave-app",
	".weave-create-card-modal-container",
	".weave-edit-card-modal-container",
	".weave-view-card-modal-container",
	".study-interface-overlay",
	".question-bank-study-interface-overlay",
	".weave-modal-backdrop",
	".weave-modal-container",
	".modal-overlay",
	".resizable-modal-overlay",
	".test-result-backdrop",
	".epub-reader-root",
	".weave-epub-view-content",
	".receipt-modal",
	"[data-weave-safe-area-probe='true']",
].join(", ");

const OBSERVER_ATTRIBUTE_FILTER = ["class", "style", "hidden", "open", "aria-hidden"] as const;

let cachedSafeAreaKey = "";
let cachedSafeAreaInsets: { top: number; bottom: number } | null = null;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function getViewportMetrics(): { width: number; height: number } {
	const visualViewport = window.visualViewport;
	return {
		width: visualViewport?.width ?? window.innerWidth,
		height: visualViewport?.height ?? window.innerHeight,
	};
}

function parsePixelValue(value: string | null | undefined): number {
	const parsed = Number.parseFloat(value ?? "");
	return Number.isFinite(parsed) ? parsed : 0;
}

function measureSafeAreaInsets(): { top: number; bottom: number } {
	if (!document.body) {
		return { top: 0, bottom: 0 };
	}

	const cacheKey = `${window.innerWidth}x${window.innerHeight}`;
	if (cachedSafeAreaInsets && cachedSafeAreaKey === cacheKey) {
		return cachedSafeAreaInsets;
	}

	const probe = document.createElement("div");
	probe.dataset.weaveSafeAreaProbe = "true";
	probe.style.cssText = [
		"position: fixed",
		"inset: 0",
		"width: 0",
		"height: 0",
		"pointer-events: none",
		"visibility: hidden",
		"z-index: -1",
		"padding-top: env(safe-area-inset-top, 0px)",
		"padding-bottom: env(safe-area-inset-bottom, 0px)",
	].join(";");

	document.body.appendChild(probe);

	const computedStyle = window.getComputedStyle(probe);
	const insets = {
		top: parsePixelValue(computedStyle.paddingTop),
		bottom: parsePixelValue(computedStyle.paddingBottom),
	};

	probe.remove();

	cachedSafeAreaKey = cacheKey;
	cachedSafeAreaInsets = insets;

	return insets;
}

function isVisibleCandidate(element: HTMLElement, viewportHeight: number): boolean {
	if (!element.isConnected || shouldIgnoreMeasurementElement(element)) {
		return false;
	}

	const computedStyle = window.getComputedStyle(element);
	if (
		computedStyle.display === "none" ||
		computedStyle.visibility === "hidden" ||
		computedStyle.opacity === "0"
	) {
		return false;
	}

	const rect = element.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) {
		return false;
	}

	return rect.bottom > 0 && rect.top < viewportHeight;
}

function shouldIgnoreMeasurementElement(element: HTMLElement): boolean {
	return Boolean(element.closest(IGNORED_MEASUREMENT_SELECTORS));
}

function collectUniqueElements(selectors: string[]): HTMLElement[] {
	const elements = new Set<HTMLElement>();

	for (const selector of selectors) {
		for (const node of document.querySelectorAll(selector)) {
			if (node instanceof HTMLElement) {
				elements.add(node);
			}
		}
	}

	return [...elements];
}

function describeElement(element: HTMLElement): string {
	if (element.id) {
		return `#${element.id}`;
	}

	const className = Array.from(element.classList)
		.slice(0, 3)
		.map((token) => `.${token}`)
		.join("");

	return `${element.tagName.toLowerCase()}${className}`;
}

function getMaxChromeHeight(edge: Edge, viewportHeight: number): number {
	const ratioCap = edge === "top" ? 0.24 : 0.3;
	const absoluteCap = edge === "top" ? 180 : 220;
	return Math.min(absoluteCap, viewportHeight * ratioCap);
}

function computeInsetForElement(
	edge: Edge,
	element: HTMLElement,
	viewport: { width: number; height: number },
	isHeuristicCandidate = false
): number | null {
	if (!isVisibleCandidate(element, viewport.height)) {
		return null;
	}

	const rect = element.getBoundingClientRect();
	const computedStyle = window.getComputedStyle(element);
	if (rect.height > getMaxChromeHeight(edge, viewport.height)) {
		return null;
	}

	if (isHeuristicCandidate) {
		const likelyFloatingChrome =
			computedStyle.position === "fixed" ||
			computedStyle.position === "sticky" ||
			computedStyle.position === "absolute";
		if (!likelyFloatingChrome) {
			return null;
		}

		if (rect.width < viewport.width * 0.35) {
			return null;
		}
	}

	if (edge === "top") {
		if (rect.top > viewport.height * 0.35) {
			return null;
		}
		return clamp(rect.bottom, 0, viewport.height);
	}

	if (rect.top < viewport.height * 0.45) {
		return null;
	}

	return clamp(viewport.height - rect.top, 0, viewport.height);
}

function measureEdgeInset(
	edge: Edge,
	selectors: string[],
	safeAreaInset: number,
	viewport: { width: number; height: number },
	detected: string[]
): number {
	let inset = safeAreaInset;
	let matched = false;

	for (const element of collectUniqueElements(selectors)) {
		const candidateInset = computeInsetForElement(edge, element, viewport);
		if (candidateInset === null || candidateInset <= inset) {
			continue;
		}

		inset = candidateInset;
		matched = true;
		detected.push(`${edge}:${describeElement(element)}=${Math.round(candidateInset)}px`);
	}

	if (matched) {
		return inset;
	}

	for (const element of collectUniqueElements(HEURISTIC_SELECTORS)) {
		const candidateInset = computeInsetForElement(edge, element, viewport, true);
		if (candidateInset === null || candidateInset <= inset) {
			continue;
		}

		inset = candidateInset;
		detected.push(`${edge}:heuristic:${describeElement(element)}=${Math.round(candidateInset)}px`);
	}

	return inset;
}

function getObservedChromeElements(): HTMLElement[] {
	return collectUniqueElements([...TOP_SELECTORS, ...BOTTOM_SELECTORS]).filter((element) =>
		isVisibleCandidate(element, getViewportMetrics().height)
	);
}

/**
 * 获取 Obsidian 工作区的安全边界
 * 通过检测 Obsidian UI 元素的实际位置来确定模态窗的可用区域
 */
export function getWorkspaceBounds(): WorkspaceBounds {
	const viewport = getViewportMetrics();
	const safeAreaInsets = measureSafeAreaInsets();
	const detected: string[] = [];

	const top = measureEdgeInset("top", TOP_SELECTORS, safeAreaInsets.top, viewport, detected);
	const bottom = measureEdgeInset(
		"bottom",
		BOTTOM_SELECTORS,
		safeAreaInsets.bottom,
		viewport,
		detected
	);

	if (top === safeAreaInsets.top && top > 0) {
		detected.push(`top:safe-area=${Math.round(top)}px`);
	}

	if (bottom === safeAreaInsets.bottom && bottom > 0) {
		detected.push(`bottom:safe-area=${Math.round(bottom)}px`);
	}

	const roundedTop = Math.round(top);
	const roundedBottom = Math.round(bottom);

	return {
		top: roundedTop,
		bottom: roundedBottom,
		height: Math.max(0, Math.round(viewport.height) - roundedTop - roundedBottom),
		detected: detected.join(", "),
	};
}

/**
 * 检查当前是否为移动端环境
 */
export function isMobileDevice(): boolean {
	return Boolean(
		document.body &&
			(document.body.classList.contains("is-phone") || document.body.classList.contains("is-mobile"))
	);
}

/**
 * 获取移动端模态窗的内联样式
 * 返回可直接应用到模态窗容器的样式对象
 */
export function getMobileModalStyles(): {
	containerStyle: string;
	modalStyle: string;
} | null {
	if (!isMobileDevice()) {
		return null;
	}

	const bounds = getWorkspaceBounds();

	return {
		containerStyle: `top: ${bounds.top}px; bottom: ${bounds.bottom}px;`,
		modalStyle: `max-height: ${Math.max(0, bounds.height - 24)}px;`,
	};
}

/**
 * 注入全局 CSS 变量到 document.documentElement
 * 所有模态窗可以通过 var(--weave-modal-top) 等变量来获取边界值
 */
export function injectMobileBoundsCSSVariables(): void {
	if (!isMobileDevice()) {
		return;
	}

	const mobileWindow = window as MobileBoundsWindow;
	if (mobileWindow.__weaveMobileBoundsInjected) {
		return;
	}
	mobileWindow.__weaveMobileBoundsInjected = true;

	const timeouts: number[] = [];
	let animationFrameId = 0;
	let observedElements = new Set<HTMLElement>();

	const resizeObserver =
		typeof ResizeObserver !== "undefined"
			? new ResizeObserver(() => {
					scheduleUpdate();
			  })
			: null;

	const refreshObservedElements = () => {
		if (!resizeObserver) {
			return;
		}

		const nextObservedElements = new Set(getObservedChromeElements());

		for (const element of observedElements) {
			if (!nextObservedElements.has(element)) {
				resizeObserver.unobserve(element);
			}
		}

		for (const element of nextObservedElements) {
			if (!observedElements.has(element)) {
				resizeObserver.observe(element);
			}
		}

		observedElements = nextObservedElements;
	};

	const updateVariables = () => {
		animationFrameId = 0;
		const bounds = getWorkspaceBounds();
		const root = document.documentElement;

		root.style.setProperty("--weave-modal-top", `${bounds.top}px`);
		root.style.setProperty("--weave-modal-bottom", `${bounds.bottom}px`);
		root.style.setProperty("--weave-modal-height", `${bounds.height}px`);
		root.style.setProperty("--weave-modal-max-height", `${Math.max(0, bounds.height - 24)}px`);
		root.style.setProperty("--weave-workspace-top-offset", `${bounds.top}px`);
		root.style.setProperty("--weave-workspace-bottom-offset", `${bounds.bottom}px`);

		refreshObservedElements();
	};

	const scheduleUpdate = () => {
		if (animationFrameId !== 0) {
			return;
		}

		animationFrameId = window.requestAnimationFrame(() => {
			updateVariables();
		});
	};

	const mutationObserver =
		typeof MutationObserver !== "undefined"
			? new MutationObserver(() => {
					scheduleUpdate();
			  })
			: null;

	updateVariables();

	window.addEventListener("resize", scheduleUpdate);
	window.addEventListener("orientationchange", scheduleUpdate);
	document.addEventListener("scroll", scheduleUpdate, true);
	document.addEventListener("transitionend", scheduleUpdate, true);
	document.addEventListener("animationend", scheduleUpdate, true);

	if (window.visualViewport) {
		window.visualViewport.addEventListener("resize", scheduleUpdate);
		window.visualViewport.addEventListener("scroll", scheduleUpdate);
	}

	if (document.body && mutationObserver) {
		mutationObserver.observe(document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: [...OBSERVER_ATTRIBUTE_FILTER],
		});
	}

	if (resizeObserver && document.body) {
		resizeObserver.observe(document.body);
		refreshObservedElements();
	}

	timeouts.push(window.setTimeout(scheduleUpdate, 100));
	timeouts.push(window.setTimeout(scheduleUpdate, 500));
	timeouts.push(window.setTimeout(scheduleUpdate, 1500));

	mobileWindow.__weaveMobileBoundsCleanup = () => {
		try {
			window.removeEventListener("resize", scheduleUpdate);
			window.removeEventListener("orientationchange", scheduleUpdate);
			document.removeEventListener("scroll", scheduleUpdate, true);
			document.removeEventListener("transitionend", scheduleUpdate, true);
			document.removeEventListener("animationend", scheduleUpdate, true);

			if (window.visualViewport) {
				window.visualViewport.removeEventListener("resize", scheduleUpdate);
				window.visualViewport.removeEventListener("scroll", scheduleUpdate);
			}

			for (const timeoutId of timeouts) {
				window.clearTimeout(timeoutId);
			}

			if (animationFrameId !== 0) {
				window.cancelAnimationFrame(animationFrameId);
				animationFrameId = 0;
			}

			mutationObserver?.disconnect();
			resizeObserver?.disconnect();
			observedElements.clear();

			const root = document.documentElement;
			root.style.removeProperty("--weave-modal-top");
			root.style.removeProperty("--weave-modal-bottom");
			root.style.removeProperty("--weave-modal-height");
			root.style.removeProperty("--weave-modal-max-height");
			root.style.removeProperty("--weave-workspace-top-offset");
			root.style.removeProperty("--weave-workspace-bottom-offset");
		} catch {}

		try {
			mobileWindow.__weaveMobileBoundsInjected = undefined;
			mobileWindow.__weaveMobileBoundsCleanup = undefined;
		} catch {
			mobileWindow.__weaveMobileBoundsInjected = false;
			mobileWindow.__weaveMobileBoundsCleanup = null;
		}
	};
}

export function destroyMobileModalAdaptation(): void {
	const mobileWindow = window as MobileBoundsWindow;
	try {
		if (typeof mobileWindow.__weaveMobileBoundsCleanup === "function") {
			mobileWindow.__weaveMobileBoundsCleanup();
		}
	} catch {}

	try {
		const styleId = "weave-mobile-modal-global-styles";
		const style = document.getElementById(styleId);
		style?.remove();
	} catch {}

	try {
		mobileWindow.__weaveMobileModalAdaptationCleanup = undefined;
	} catch {
		mobileWindow.__weaveMobileModalAdaptationCleanup = null;
	}
}

/**
 * 注入全局模态窗样式
 * 自动为所有 .weave-modal-backdrop、.modal-overlay 等元素应用边界限制
 */
export function injectGlobalModalStyles(): void {
	if (!isMobileDevice()) {
		return;
	}

	const styleId = "weave-mobile-modal-global-styles";

	// 样式已迁移到 styles/dynamic-injected.css
	// 此处仅设置 CSS 变量（动态值）
	if (document.getElementById(styleId)) {
		return;
	}

	void styleId;
}

/**
 * 初始化全局移动端模态窗适配
 * 在插件 onload 时调用此函数即可完成所有设置
 */
export function initMobileModalAdaptation(): void {
	if (!isMobileDevice()) {
		return;
	}

	injectMobileBoundsCSSVariables();
	injectGlobalModalStyles();

	const mobileWindow = window as MobileBoundsWindow;
	mobileWindow.__weaveMobileModalAdaptationCleanup = destroyMobileModalAdaptation;
}
