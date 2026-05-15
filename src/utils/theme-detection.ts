import { logger } from "../utils/logger";
/**
 * 统一管理 Weave 的主题检测、监听和主题变量注入。
 */
import { untrack } from "svelte";

export type ThemeMode = "light" | "dark" | "auto";

/** 当前主题的检测结果。 */
export interface ThemeDetectionResult {
	mode: ThemeMode;
	isDark: boolean;
	source: "obsidian-class" | "system-preference" | "fallback";
	confidence: "high" | "medium" | "low";
}

/** 统一主题状态，并向使用方广播变更。 */
export class UnifiedThemeManager {
	private static instance: UnifiedThemeManager;
	private currentTheme: ThemeDetectionResult;
	private listeners: Array<(result: ThemeDetectionResult) => void> = [];
	private mediaQuery: MediaQueryList;
	private mediaQueryChangeHandler: ((e: MediaQueryListEvent) => void) | null = null;
	private domObserver: MutationObserver;
	private isInitialized = false;

	private constructor() {
		this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		this.currentTheme = this.detectTheme();
		this.mediaQueryChangeHandler = () => this.handleThemeChange();
		this.domObserver = new MutationObserver(() => this.handleThemeChange());
		this.initialize();
	}

	static getInstance(): UnifiedThemeManager {
		const w = window as any;
		// 将实例挂到 window 上，避免热更新或重复初始化时重复注册监听器。
		if (w.__weaveThemeManager) {
			return w.__weaveThemeManager as UnifiedThemeManager;
		}
		if (!UnifiedThemeManager.instance) {
			UnifiedThemeManager.instance = new UnifiedThemeManager();
			w.__weaveThemeManager = UnifiedThemeManager.instance;
			w.__weaveThemeManagerCleanup = () => {
				try {
					(w.__weaveThemeManager as UnifiedThemeManager | undefined)?.destroy();
				} catch {}
				try {
					w.__weaveThemeManager = undefined;
					w.__weaveThemeManagerCleanup = undefined;
				} catch {
					w.__weaveThemeManager = null;
					w.__weaveThemeManagerCleanup = null;
				}
			};
		}
		return UnifiedThemeManager.instance;
	}

	private initialize(): void {
		if (this.isInitialized) return;

		if (this.mediaQueryChangeHandler) {
			this.mediaQuery.addEventListener("change", this.mediaQueryChangeHandler);
		}

		this.domObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		this.domObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ["class"],
		});

		this.isInitialized = true;
	}

	private detectTheme(): ThemeDetectionResult {
		if (document.documentElement.classList.contains("theme-dark")) {
			return {
				mode: "dark",
				isDark: true,
				source: "obsidian-class",
				confidence: "high",
			};
		}

		if (document.documentElement.classList.contains("theme-light")) {
			return {
				mode: "light",
				isDark: false,
				source: "obsidian-class",
				confidence: "high",
			};
		}

		if (document.body.classList.contains("theme-dark")) {
			return {
				mode: "dark",
				isDark: true,
				source: "obsidian-class",
				confidence: "medium",
			};
		}

		if (document.body.classList.contains("theme-light")) {
			return {
				mode: "light",
				isDark: false,
				source: "obsidian-class",
				confidence: "medium",
			};
		}

		const systemPrefersDark = this.mediaQuery.matches;
		return {
			mode: "auto",
			isDark: systemPrefersDark,
			source: "system-preference",
			confidence: "medium",
		};
	}

	private handleThemeChange(): void {
		const newTheme = this.detectTheme();

		if (this.hasThemeChanged(this.currentTheme, newTheme)) {
			const oldTheme = this.currentTheme;
			this.currentTheme = newTheme;

			logger.debug("[ThemeManager] 主题变化:", {
				from: oldTheme,
				to: newTheme,
			});

			this.listeners.forEach((_listener) => {
				try {
					_listener(newTheme);
				} catch (error) {
					logger.error("[ThemeManager] 监听器执行失败:", error);
				}
			});
		}
	}

	private hasThemeChanged(oldTheme: ThemeDetectionResult, newTheme: ThemeDetectionResult): boolean {
		return (
			oldTheme.isDark !== newTheme.isDark ||
			oldTheme.mode !== newTheme.mode ||
			oldTheme.source !== newTheme.source
		);
	}

	getCurrentTheme(): ThemeDetectionResult {
		return { ...this.currentTheme };
	}

	/** 保留给旧调用方的深色模式判断。 */
	isDarkMode(): boolean {
		return this.currentTheme.isDark;
	}

	/** 注册监听器，并立即推送一次当前状态。 */
	addListener(callback: (result: ThemeDetectionResult) => void): () => void {
		this.listeners.push(callback);

		try {
			callback(this.currentTheme);
		} catch (error) {
			logger.error("[ThemeManager] 初始监听器调用失败:", error);
		}

		return () => {
			const index = this.listeners.indexOf(callback);
			if (index > -1) {
				this.listeners.splice(index, 1);
			}
		};
	}

	/** 释放监听器，供测试或显式重置时使用。 */
	destroy(): void {
		if (this.mediaQueryChangeHandler) {
			this.mediaQuery.removeEventListener("change", this.mediaQueryChangeHandler);
		}
		this.domObserver.disconnect();
		this.listeners.length = 0;
		this.isInitialized = false;

		try {
			const w = window as any;
			if (w.__weaveThemeManager === this) {
				w.__weaveThemeManager = undefined;
			}
		} catch {}

		UnifiedThemeManager.instance = null as any;
	}
}

/** 创建可在组件里复用的响应式主题快照。 */
export function createReactiveThemeState() {
	const themeManager = UnifiedThemeManager.getInstance();
	let currentResult = themeManager.getCurrentTheme();
	let themeVersion = 0;
	let cleanup: (() => void) | null = null;

	const initListener = () => {
		if (cleanup) cleanup();

		cleanup = themeManager.addListener((newResult) => {
			currentResult = newResult;
			themeVersion++;
		});
	};

	initListener();

	return {
		get isDark() {
			return currentResult.isDark;
		},
		get mode() {
			return currentResult.mode;
		},
		get source() {
			return currentResult.source;
		},
		get confidence() {
			return currentResult.confidence;
		},
		get version() {
			return themeVersion;
		},
		get result() {
			return { ...currentResult };
		},

		destroy() {
			if (cleanup) {
				cleanup();
				cleanup = null;
			}
		},

		reinit() {
			initListener();
		},
	};
}

/** 鐢熸垚鍜屽綋鍓嶄富棰樼姸鎬佸搴旂殑 CSS 绫诲悕銆?*/
export function getThemeClasses(): string[] {
	const themeManager = UnifiedThemeManager.getInstance();
	const result = themeManager.getCurrentTheme();
	const classes: string[] = [];

	if (result.isDark) {
		classes.push("theme-dark");
	} else {
		classes.push("theme-light");
	}

	classes.push(`theme-source-${result.source}`);
	classes.push(`theme-confidence-${result.confidence}`);

	return classes;
}

/** 为元素附加主题类，并在主题变化时自动更新。 */
export function addThemeClasses(element: HTMLElement): () => void {
	const themeManager = UnifiedThemeManager.getInstance();

	const updateClasses = () => {
		removeThemeClasses(element);
		const classes = getThemeClasses();
		element.classList.add(...classes);
	};

	updateClasses();

	const cleanup = themeManager.addListener(() => {
		updateClasses();
	});

	return cleanup;
}

/** 清除本工具添加过的主题类。 */
export function removeThemeClasses(element: HTMLElement): void {
	element.classList.remove("theme-dark", "theme-light");

	element.classList.remove(
		"theme-source-obsidian-class",
		"theme-source-system-preference",
		"theme-source-fallback"
	);

	element.classList.remove(
		"theme-confidence-high",
		"theme-confidence-medium",
		"theme-confidence-low"
	);

}

/** Returns editor-related theme variables. */
export function getThemeVariables(): Record<string, string> {
	const themeManager = UnifiedThemeManager.getInstance();
	const result = themeManager.getCurrentTheme();

	const baseVariables = {
		"--editor-font-family": 'var(--font-text, "Inter", sans-serif)',
		"--editor-font-size": "14px",
		"--editor-line-height": "1.6",
	};

	const themeVariables = result.isDark
		? {
				"--editor-bg": "#1a1a1a",
				"--editor-text": "#e1e4e8",
				"--editor-border": "rgba(255, 255, 255, 0.15)",
				"--editor-cursor": "#8b5cf6",
				"--editor-selection": "rgba(139, 92, 246, 0.25)",
				"--editor-active-line": "rgba(255, 255, 255, 0.05)",
		  }
		: {
				"--editor-bg": "#ffffff",
				"--editor-text": "#24292e",
				"--editor-border": "rgba(17, 24, 39, 0.15)",
				"--editor-cursor": "#8b5cf6",
				"--editor-selection": "rgba(139, 92, 246, 0.2)",
				"--editor-active-line": "rgba(17, 24, 39, 0.03)",
		  };

	return { ...baseVariables, ...themeVariables };
}

/** 将当前主题变量写入元素，并在主题变化时同步更新。 */
export function applyThemeVariables(element: HTMLElement): () => void {
	const themeManager = UnifiedThemeManager.getInstance();

	const updateVariables = () => {
		const variables = getThemeVariables();
		Object.entries(variables).forEach(([property, value]) => {
			element.style.setProperty(property, value);
		});
	};

	updateVariables();

	const cleanup = themeManager.addListener(() => {
		updateVariables();
	});

	return cleanup;
}
