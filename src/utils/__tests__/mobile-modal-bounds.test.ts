
import {
	destroyMobileModalAdaptation,
	getWorkspaceBounds,
	injectMobileBoundsCSSVariables,
} from "../mobile-modal-bounds";

const SAFE_AREA_TOP = 12;
const SAFE_AREA_BOTTOM = 18;
const VIEWPORT_WIDTH = 390;
const VIEWPORT_HEIGHT = 844;

type RectInput = {
	top: number;
	left?: number;
	width: number;
	height: number;
};

type MockVisualViewport = {
	width: number;
	height: number;
	addEventListener: (type: string, listener: EventListener) => void;
	removeEventListener: (type: string, listener: EventListener) => void;
	dispatch: (type: string) => void;
};

const originalGetComputedStyle = window.getComputedStyle.bind(window);

let getComputedStyleSpy: { mockRestore: () => void } | null = null;

function setViewportSize(width = VIEWPORT_WIDTH, height = VIEWPORT_HEIGHT): MockVisualViewport {
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		value: width,
	});

	Object.defineProperty(window, "innerHeight", {
		configurable: true,
		value: height,
	});

	const listeners = new Map<string, Set<EventListener>>();
	const visualViewport: MockVisualViewport = {
		width,
		height,
		addEventListener(type, listener) {
			const bucket = listeners.get(type) ?? new Set<EventListener>();
			bucket.add(listener);
			listeners.set(type, bucket);
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener);
		},
		dispatch(type) {
			const event = new Event(type);
			for (const listener of listeners.get(type) ?? []) {
				listener(event);
			}
		},
	};

	Object.defineProperty(window, "visualViewport", {
		configurable: true,
		value: visualViewport,
	});

	return visualViewport;
}

function installSafeAreaMock(top = SAFE_AREA_TOP, bottom = SAFE_AREA_BOTTOM): void {
	getComputedStyleSpy = vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element) => {
		const computed = originalGetComputedStyle(element);
		if (element instanceof HTMLElement && element.dataset.weaveSafeAreaProbe === "true") {
			return {
				...computed,
				paddingTop: `${top}px`,
				paddingBottom: `${bottom}px`,
			} as CSSStyleDeclaration;
		}

		return computed;
	});
}

function mockRect(element: HTMLElement, input: RectInput): void {
	const left = input.left ?? 0;
	const right = left + input.width;
	const bottom = input.top + input.height;

	Object.defineProperty(element, "getBoundingClientRect", {
		configurable: true,
		value: vi.fn(() => ({
			x: left,
			y: input.top,
			top: input.top,
			left,
			right,
			bottom,
			width: input.width,
			height: input.height,
			toJSON: () => ({}),
		})),
	});
}

async function flushObservers(): Promise<void> {
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 40));
}

describe("mobile-modal-bounds", () => {
	beforeEach(() => {
		document.body.className = "is-mobile is-phone";
		document.body.innerHTML = "";
		document.documentElement.removeAttribute("style");
		setViewportSize();
		installSafeAreaMock();
	});

	afterEach(() => {
		destroyMobileModalAdaptation();
		getComputedStyleSpy?.mockRestore();
		getComputedStyleSpy = null;
		document.body.innerHTML = "";
		document.body.className = "";
		document.documentElement.removeAttribute("style");
		Object.defineProperty(window, "visualViewport", {
			configurable: true,
			value: undefined,
		});
	});

	it("根据真实的顶部和底部 Obsidian UI 计算工作区边界", () => {
		const header = document.createElement("div");
		header.className = "view-header";
		mockRect(header, { top: 0, width: VIEWPORT_WIDTH, height: 56 });

		const toolbar = document.createElement("div");
		toolbar.className = "mobile-toolbar";
		toolbar.style.position = "fixed";
		mockRect(toolbar, { top: 740, width: VIEWPORT_WIDTH, height: 64 });

		document.body.append(header, toolbar);

		const bounds = getWorkspaceBounds();

		expect(bounds.top).toBe(56);
		expect(bounds.bottom).toBe(104);
		expect(bounds.height).toBe(VIEWPORT_HEIGHT - 56 - 104);
	});

	it("忽略占满全屏的固定工作区壳层，避免把整个页面误判成顶部栏", () => {
		const appShell = document.createElement("div");
		appShell.className = "app-container";
		appShell.style.position = "fixed";
		mockRect(appShell, { top: 0, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });

		document.body.append(appShell);

		const bounds = getWorkspaceBounds();

		expect(bounds.top).toBe(SAFE_AREA_TOP);
		expect(bounds.bottom).toBe(SAFE_AREA_BOTTOM);
		expect(bounds.height).toBe(VIEWPORT_HEIGHT - SAFE_AREA_TOP - SAFE_AREA_BOTTOM);
	});

	it("在类名变化时仍可通过几何启发式识别悬浮底栏", () => {
		const floatingToolbar = document.createElement("div");
		floatingToolbar.className = "floating-nav-shell";
		floatingToolbar.style.position = "fixed";
		mockRect(floatingToolbar, { top: 718, left: 28, width: 334, height: 54 });

		document.body.append(floatingToolbar);

		const bounds = getWorkspaceBounds();

		expect(bounds.top).toBe(SAFE_AREA_TOP);
		expect(bounds.bottom).toBe(126);
		expect(bounds.detected).toContain("bottom:heuristic");
	});

	it("忽略 EPUB 阅读器内部的底部翻页栏，避免污染工作区底部偏移", () => {
		const epubRoot = document.createElement("div");
		epubRoot.className = "epub-reader-root";
		mockRect(epubRoot, { top: 0, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });

		const bottomNavSlot = document.createElement("div");
		bottomNavSlot.className = "epub-bottom-nav-slot";
		bottomNavSlot.style.position = "relative";
		mockRect(bottomNavSlot, { top: 730, width: VIEWPORT_WIDTH, height: 74 });

		epubRoot.append(bottomNavSlot);
		document.body.append(epubRoot);

		const bounds = getWorkspaceBounds();

		expect(bounds.top).toBe(SAFE_AREA_TOP);
		expect(bounds.bottom).toBe(SAFE_AREA_BOTTOM);
		expect(bounds.detected).toContain(`bottom:safe-area=${SAFE_AREA_BOTTOM}px`);
	});

	it("在底栏模式切换后会自动刷新全局 CSS 变量", async () => {
		const toolbar = document.createElement("div");
		toolbar.className = "mobile-toolbar";
		toolbar.style.position = "fixed";
		mockRect(toolbar, { top: 760, width: VIEWPORT_WIDTH, height: 56 });

		document.body.append(toolbar);

		injectMobileBoundsCSSVariables();
		await flushObservers();

		expect(
			document.documentElement.style.getPropertyValue("--weave-workspace-bottom-offset")
		).toBe("84px");

		mockRect(toolbar, { top: 720, left: 24, width: 342, height: 56 });
		toolbar.className = "floating-nav-shell";

		await flushObservers();

		expect(
			document.documentElement.style.getPropertyValue("--weave-workspace-bottom-offset")
		).toBe("124px");
	});
});
