import { Platform } from "obsidian";
import { logger } from "../utils/logger";
/**
 * 基于容器宽度的响应式工具
 * 用于 Obsidian 插件中根据标签页/侧边栏宽度自适应布局
 *
 * 优先使用 Obsidian Platform API 检测设备类型
 */

export interface ResponsiveBreakpoints {
	xs: number; // 极小屏幕
	mobile: number;
	tablet: number;
	desktop: number;
}

export interface ResponsiveState {
	// Obsidian Platform API（优先使用）
	isObsidianMobile: boolean; // Platform.isMobile
	isObsidianPhone: boolean; // Platform.isPhone (Obsidian 1.4.0+)
	isObsidianTablet: boolean; // Platform.isTablet (Obsidian 1.4.0+)
	isIosApp: boolean; // Platform.isIosApp
	isAndroidApp: boolean; // Platform.isAndroidApp

	// 基于宽度的检测（降级方案）
	isExtraSmall: boolean; // 极小屏幕（< 320px）
	isMobile: boolean;
	isTablet: boolean;
	isDesktop: boolean;
	width: number;
	breakpoint: "xs" | "mobile" | "tablet" | "desktop";
	isTouch: boolean; // 是否为触控设备
	hasSafeArea: boolean; // 是否有安全区域（iOS）
}

export const DEFAULT_BREAKPOINTS: ResponsiveBreakpoints = {
	xs: 320, // 小于 320px 为极小屏幕
	mobile: 480, // 小于480px为移动端
	tablet: 768, // 480-768px为平板端
	desktop: 1024, // 大于768px为桌面端
};

/**
 * 检测是否为触控设备
 */
function detectTouchDevice(): boolean {
	return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/**
 * 检测是否有 iOS 安全区域
 */
function detectSafeArea(): boolean {
	if (typeof CSS === "undefined" || !CSS.supports) return false;
	return CSS.supports("padding-bottom", "env(safe-area-inset-bottom)");
}

/**
 * 获取 Obsidian 平台信息
 * 优先使用 Obsidian 的 Platform API
 */
export function getObsidianPlatformInfo(): {
	isMobile: boolean;
	isPhone: boolean;
	isTablet: boolean;
	isIos: boolean;
	isAndroid: boolean;
	isDesktop: boolean;
} {
	return {
		isMobile: Platform.isMobile,
		// Platform.isPhone 和 Platform.isTablet 在 Obsidian 1.4.0+ 可用
		isPhone:
			(Platform as unknown).isPhone ?? (Platform.isMobile && !((Platform as unknown).isTablet ?? false)),
		isTablet: (Platform as unknown).isTablet ?? false,
		isIos: Platform.isIosApp,
		isAndroid: Platform.isAndroidApp,
		isDesktop: Platform.isDesktop || Platform.isDesktopApp,
	};
}

/**
 * 根据容器宽度计算响应式状态
 * 同时包含 Obsidian Platform API 和基于宽度的检测
 */
export function getResponsiveState(
	width: number,
	breakpoints: ResponsiveBreakpoints = DEFAULT_BREAKPOINTS
): ResponsiveState {
	const isExtraSmall = width < breakpoints.xs;
	const isMobile = width < breakpoints.mobile;
	const isTablet = width >= breakpoints.mobile && width < breakpoints.tablet;
	const isDesktop = width >= breakpoints.tablet;

	let breakpoint: "xs" | "mobile" | "tablet" | "desktop";
	if (isExtraSmall) {
		breakpoint = "xs";
	} else if (isMobile) {
		breakpoint = "mobile";
	} else if (isTablet) {
		breakpoint = "tablet";
	} else {
		breakpoint = "desktop";
	}

	// 获取 Obsidian 平台信息
	const platformInfo = getObsidianPlatformInfo();

	return {
		// Obsidian Platform API
		isObsidianMobile: platformInfo.isMobile,
		isObsidianPhone: platformInfo.isPhone,
		isObsidianTablet: platformInfo.isTablet,
		isIosApp: platformInfo.isIos,
		isAndroidApp: platformInfo.isAndroid,

		// 基于宽度的检测
		isExtraSmall,
		isMobile: platformInfo.isMobile || isMobile, // 优先使用 Obsidian 检测
		isTablet: platformInfo.isTablet || isTablet,
		isDesktop: !platformInfo.isMobile && isDesktop,
		width,
		breakpoint,
		isTouch: detectTouchDevice(),
		hasSafeArea: detectSafeArea(),
	};
}

/**
 *  判断工具栏是否应该折叠
 * 在移动端（< 480px）默认折叠工具栏
 */
export function shouldCollapseToolbar(width: number): boolean {
	return width < DEFAULT_BREAKPOINTS.mobile;
}

/**
 *  获取工具栏显示模式
 */
export function getToolbarMode(width: number): "collapsed" | "compact" | "full" {
	if (width < DEFAULT_BREAKPOINTS.xs) {
		return "collapsed";
	} else if (width < DEFAULT_BREAKPOINTS.mobile) {
		return "compact";
	}
	return "full";
}

/**
 * 创建容器宽度观察器
 *  在 Obsidian 移动端，不使用 ResizeObserver 进行响应式检测
 * 移动端样式完全由 obsidian-mobile.css 中的设备类控制
 */
export function createContainerObserver(
	element: HTMLElement,
	callback: (state: ResponsiveState) => void,
	breakpoints: ResponsiveBreakpoints = DEFAULT_BREAKPOINTS
): () => void {
	if (!element) {
		logger.warn("[ResponsiveUtils] Element is null or undefined");
		return () => {};
	}

	// 获取 Obsidian 平台信息
	const platformInfo = getObsidianPlatformInfo();

	// 在 Obsidian 移动端，不使用 ResizeObserver
	// 直接返回基于平台的固定状态，避免与 CSS 设备类冲突
	if (platformInfo.isMobile) {
		const mobileState: ResponsiveState = {
			isObsidianMobile: true,
			isObsidianPhone: platformInfo.isPhone,
			isObsidianTablet: platformInfo.isTablet,
			isIosApp: platformInfo.isIos,
			isAndroidApp: platformInfo.isAndroid,
			isExtraSmall: false,
			isMobile: true,
			isTablet: platformInfo.isTablet,
			isDesktop: false,
			width: platformInfo.isPhone ? 375 : 768, // 模拟宽度
			breakpoint: platformInfo.isPhone ? "mobile" : "tablet",
			isTouch: true,
			hasSafeArea: platformInfo.isIos,
		};
		callback(mobileState);
		return () => {}; // 无需清理
	}

	// 桌面端使用 ResizeObserver 监听容器大小变化
	const resizeObserver = new ResizeObserver((entries) => {
		for (const entry of entries) {
			const width = entry.contentRect.width;
			const state = getResponsiveState(width, breakpoints);
			callback(state);
		}
	});

	// 开始观察
	resizeObserver.observe(element);

	// 立即触发一次回调
	const initialWidth = element.clientWidth;
	const initialState = getResponsiveState(initialWidth, breakpoints);
	callback(initialState);

	// 返回清理函数
	return () => {
		resizeObserver.disconnect();
	};
}

/**
 * 创建响应式状态管理器（用于 Svelte 组件）
 * 这个函数返回一个工厂函数，在 Svelte 组件中调用
 */
export function createResponsiveManager(breakpoints: ResponsiveBreakpoints = DEFAULT_BREAKPOINTS) {
	return function (element: HTMLElement | null) {
		// 获取 Obsidian 平台信息
		const platformInfo = getObsidianPlatformInfo();

		// 初始状态
		let currentState: ResponsiveState = {
			// Obsidian Platform API
			isObsidianMobile: platformInfo.isMobile,
			isObsidianPhone: platformInfo.isPhone,
			isObsidianTablet: platformInfo.isTablet,
			isIosApp: platformInfo.isIos,
			isAndroidApp: platformInfo.isAndroid,

			// 基于宽度的检测
			isExtraSmall: false,
			isMobile: platformInfo.isMobile,
			isTablet: platformInfo.isTablet,
			isDesktop: !platformInfo.isMobile,
			width: 0,
			breakpoint: platformInfo.isMobile ? "mobile" : "desktop",
			isTouch: detectTouchDevice(),
			hasSafeArea: detectSafeArea(),
		};

		let cleanup: (() => void) | null = null;
		let subscribers: Array<(state: ResponsiveState) => void> = [];

		// 订阅状态变化
		function subscribe(callback: (state: ResponsiveState) => void) {
			subscribers.push(callback);
			// 立即调用一次
			callback(currentState);

			return () => {
				const index = subscribers.indexOf(callback);
				if (index > -1) {
					subscribers.splice(index, 1);
				}
			};
		}

		// 更新状态并通知订阅者
		function updateState(newState: ResponsiveState) {
			currentState = newState;
			subscribers.forEach((callback) => callback(newState));
		}

		// 初始化观察器
		function init() {
			if (cleanup) {
				cleanup();
				cleanup = null;
			}

			if (element) {
				cleanup = createContainerObserver(element, updateState, breakpoints);
			}
		}

		// 销毁
		function destroy() {
			if (cleanup) {
				cleanup();
				cleanup = null;
			}
			subscribers = [];
		}

		return {
			subscribe,
			init,
			destroy,
			get state() {
				return currentState;
			},
			// Obsidian Platform API
			get isObsidianMobile() {
				return currentState.isObsidianMobile;
			},
			get isObsidianPhone() {
				return currentState.isObsidianPhone;
			},
			get isObsidianTablet() {
				return currentState.isObsidianTablet;
			},
			get isIosApp() {
				return currentState.isIosApp;
			},
			get isAndroidApp() {
				return currentState.isAndroidApp;
			},
			// 基于宽度的检测
			get isExtraSmall() {
				return currentState.isExtraSmall;
			},
			get isMobile() {
				return currentState.isMobile;
			},
			get isTablet() {
				return currentState.isTablet;
			},
			get isDesktop() {
				return currentState.isDesktop;
			},
			get width() {
				return currentState.width;
			},
			get breakpoint() {
				return currentState.breakpoint;
			},
			get isTouch() {
				return currentState.isTouch;
			},
			get hasSafeArea() {
				return currentState.hasSafeArea;
			},
			get shouldCollapseToolbar() {
				return shouldCollapseToolbar(currentState.width);
			},
			get toolbarMode() {
				return getToolbarMode(currentState.width);
			},
		};
	};
}

/**
 * 生成基于容器宽度的 CSS 类名
 */
export function getResponsiveClasses(state: ResponsiveState, prefix = "responsive"): string[] {
	const classes = [
		`${prefix}-${state.breakpoint}`,
		`${prefix}-width-${Math.floor(state.width / 100) * 100}`,
	];

	if (state.isMobile) classes.push(`${prefix}-mobile`);
	if (state.isTablet) classes.push(`${prefix}-tablet`);
	if (state.isDesktop) classes.push(`${prefix}-desktop`);

	return classes;
}

/**
 * 为 Obsidian 插件优化的断点配置
 * 考虑到侧边栏的典型宽度
 */
export const OBSIDIAN_BREAKPOINTS: ResponsiveBreakpoints = {
	xs: 200, // 极小侧边栏
	mobile: 280, // 侧边栏最小宽度 - 降低阈值
	tablet: 400, // 中等侧边栏宽度 - 降低阈值
	desktop: 500, // 较宽的侧边栏或主面板 - 降低阈值
};

/**
 * 检测是否在 Obsidian 侧边栏中
 * 支持更精确的 DOM 结构检测
 */
export function isInSidebar(element: HTMLElement): boolean {
	let current = element.parentElement;
	while (current) {
		const classList = current.classList;

		// 检测 Obsidian 侧边栏容器
		if (classList.contains("mod-right-split") || classList.contains("mod-left-split")) {
			return true;
		}

		// 检测 workspace-split 结构
		if (
			classList.contains("workspace-split") &&
			(classList.contains("mod-horizontal") || classList.contains("mod-vertical"))
		) {
			// 进一步检查是否为侧边栏叶子
			const leaf = current.closest(".workspace-leaf");
			if (leaf && !leaf.closest(".mod-root")) {
				return true;
			}
		}

		// 检查是否在主编辑区（mod-root 表示主内容区）
		if (classList.contains("mod-root")) {
			return false;
		}

		current = current.parentElement;
	}
	return false;
}

/**
 * 创建侧边栏状态响应式观察器
 * 使用 MutationObserver 监听 DOM 变化，当视图被移动时触发回调
 */
export function createSidebarObserver(
	element: HTMLElement,
	callback: (inSidebar: boolean) => void
): () => void {
	if (!element) {
		logger.warn("[ResponsiveUtils] createSidebarObserver: Element is null");
		return () => {};
	}

	// 初始检测
	let currentState = isInSidebar(element);
	callback(currentState);

	// 创建 MutationObserver 监听 DOM 结构变化
	const observer = new MutationObserver((mutations) => {
		// 检查是否有相关的 DOM 变化
		let shouldCheck = false;
		for (const mutation of mutations) {
			if (mutation.type === "childList" || mutation.type === "attributes") {
				// 检查是否涉及 workspace 相关的类名变化
				if (mutation.type === "attributes" && mutation.attributeName === "class") {
					shouldCheck = true;
					break;
				}
				// 检查是否有节点添加/移除
				if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
					shouldCheck = true;
					break;
				}
			}
		}

		if (shouldCheck) {
			const newState = isInSidebar(element);
			if (newState !== currentState) {
				currentState = newState;
				callback(newState);
				logger.debug("[ResponsiveUtils] 侧边栏状态变化:", newState);
			}
		}
	});

	// 观察整个 workspace 容器
	const workspace = activeDocument.querySelector(".workspace");
	if (workspace) {
		observer.observe(workspace, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["class"],
		});
	}

	// 返回清理函数
	return () => {
		observer.disconnect();
	};
}

/**
 * 获取适合 Obsidian 环境的响应式配置
 */
export function getObsidianResponsiveConfig(element: HTMLElement): ResponsiveBreakpoints {
	const inSidebar = isInSidebar(element);
	return inSidebar ? OBSIDIAN_BREAKPOINTS : DEFAULT_BREAKPOINTS;
}
