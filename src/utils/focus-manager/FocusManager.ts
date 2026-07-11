/**
 * 焦点管理器主类
 *
 * 整合所有子模块，提供统一的焦点管理 API。
 * 根据平台自动选择合适的焦点恢复策略。
 */

import type { WorkspaceLeaf } from "obsidian";
import { readUnknownProperty } from "../dynamic-access";
import { logger } from "../logger";
import { FocusStack } from "./FocusStack";
import { FocusTrapManager } from "./FocusTrapManager";
import { KeyboardMonitor } from "./KeyboardMonitor";
import { PlatformDetector, getPlatformDetector } from "./PlatformDetector";
import { RequestCoalescer } from "./RequestCoalescer";
import { ActiveFocusStrategy } from "./strategies/ActiveFocusStrategy";
import { PassiveFocusStrategy } from "./strategies/PassiveFocusStrategy";
import type {
	FocusManagerConfig,
	FocusManagerState,
	FocusRecord,
	FocusStrategyType,
	IFocusManager,
	IFocusRestoreStrategy,
} from "./types";
import { DEFAULT_FOCUS_MANAGER_CONFIG } from "./types";

/**
 * 焦点管理器实现
 */
export class FocusManager implements IFocusManager {
	private static instance: FocusManager | null = null;

	private config: FocusManagerConfig;
	private platformDetector: PlatformDetector;
	private focusStack: FocusStack;
	private requestCoalescer: RequestCoalescer;
	private keyboardMonitor: KeyboardMonitor | null = null;
	private focusTrapManager: FocusTrapManager;
	private strategy: IFocusRestoreStrategy;
	private strategyType: FocusStrategyType;

	private focusLostHandler: ((e: FocusEvent) => void) | null = null;
	private isInitialized = false;

	private constructor() {
		this.platformDetector = getPlatformDetector();
		const platformInfo = this.platformDetector.detect();

		// 根据平台设置默认配置
		this.config = {
			...DEFAULT_FOCUS_MANAGER_CONFIG,
			enableAutoRestore: !platformInfo.isMobile, // 移动端默认禁用自动恢复
		};

		// 初始化子模块
		this.focusStack = new FocusStack(10, this.config.enableDebugMode);
		this.requestCoalescer = new RequestCoalescer(
			this.config.debounceMs,
			this.config.enableDebugMode
		);
		this.focusTrapManager = new FocusTrapManager(this.config.enableDebugMode);

		// 移动端初始化键盘监控器
		if (platformInfo.isMobile) {
			this.keyboardMonitor = new KeyboardMonitor(this.config.enableDebugMode);
			this.keyboardMonitor.startListening();
		}

		// 选择策略
		if (platformInfo.isMobile) {
			this.strategy = new PassiveFocusStrategy(this.keyboardMonitor, this.config.enableDebugMode);
			this.strategyType = "passive";
		} else {
			this.strategy = new ActiveFocusStrategy(this.config.enableDebugMode);
			this.strategyType = "active";
		}

		// 初始化焦点丢失监听（仅桌面端）
		if (!platformInfo.isMobile && this.config.enableAutoRestore) {
			this.setupFocusLostListener();
		}

		this.isInitialized = true;

		logger.debug("[FocusManager] 初始化完成:", {
			platform: platformInfo,
			strategy: this.strategyType,
			autoRestore: this.config.enableAutoRestore,
		});
	}

	/**
	 * 获取单例实例
	 */
	static getInstance(): FocusManager {
		if (!FocusManager.instance) {
			FocusManager.instance = new FocusManager();
		}
		return FocusManager.instance;
	}

	/**
	 * 更新配置
	 */
	configure(config: Partial<FocusManagerConfig>): void {
		const oldConfig = { ...this.config };
		this.config = { ...this.config, ...config };

		// 更新子模块配置
		if (config.debounceMs !== undefined) {
			this.requestCoalescer.setDebounceMs(config.debounceMs);
		}

		if (config.enableDebugMode !== undefined) {
			this.focusStack.setDebugMode(config.enableDebugMode);
			this.requestCoalescer.setDebugMode(config.enableDebugMode);
			this.focusTrapManager.setDebugMode(config.enableDebugMode);
			this.keyboardMonitor?.setDebugMode(config.enableDebugMode);
			const setDebugMode: unknown = Reflect.get(this.strategy, "setDebugMode");
			if (typeof setDebugMode === "function") {
				setDebugMode.call(this.strategy, config.enableDebugMode);
			}
		}

		// 自动恢复配置变化
		if (
			config.enableAutoRestore !== undefined &&
			config.enableAutoRestore !== oldConfig.enableAutoRestore
		) {
			if (config.enableAutoRestore && !this.platformDetector.isMobileApp()) {
				this.setupFocusLostListener();
			} else {
				this.removeFocusLostListener();
			}
		}

		logger.debug("[FocusManager] 配置更新:", this.config);
	}

	/**
	 * 保存当前焦点
	 */
	saveFocus(context: string): void {
		const currentFocus = activeDocument.activeElement as HTMLElement;

		const record: FocusRecord = {
			element: currentFocus !== activeDocument.body ? currentFocus : null,
			timestamp: Date.now(),
			context,
		};

		this.focusStack.push(record);

		if (this.config.enableDebugMode) {
			logger.debug("[FocusManager] 保存焦点:", {
				context,
				element: currentFocus?.tagName || "body",
			});
		}
	}

	/**
	 * 恢复焦点
	 */
	async restoreFocus(fallback?: HTMLElement): Promise<boolean> {
		const record = this.focusStack.pop();

		if (!record) {
			if (this.config.enableDebugMode) {
				logger.debug("[FocusManager] 焦点栈为空，无法恢复");
			}

			// 尝试使用 fallback
			if (fallback) {
				try {
					fallback.focus();
					return true;
				} catch {
					return false;
				}
			}
			return false;
		}

		// 使用请求合并器延迟执行
		return new Promise((resolve) => {
			this.requestCoalescer.schedule(() => {
				void (async () => {
					const success = await this.strategy.restore(record);

					// 如果恢复失败且有 fallback，尝试使用 fallback
					if (!success && fallback) {
						try {
							fallback.focus();
							resolve(true);
							return;
						} catch {
							// ignore
						}
					}

					resolve(success);
				})();
			}, "restore-focus");
		});
	}

	/**
	 * 创建焦点陷阱
	 */
	trapFocus(container: HTMLElement, initialFocus?: HTMLElement): void {
		this.focusTrapManager.trap(container, initialFocus);
	}

	/**
	 * 释放焦点陷阱
	 */
	releaseTrap(container: HTMLElement): void {
		this.focusTrapManager.release(container);
	}

	/**
	 * 获取当前状态
	 */
	getState(): FocusManagerState {
		const activeElement = activeDocument.activeElement as HTMLElement;

		return {
			platform: this.platformDetector.detect(),
			keyboard: this.keyboardMonitor?.getState() || null,
			stackSize: this.focusStack.size(),
			currentFocus:
				activeElement && activeElement !== activeDocument.body
					? {
							element: activeElement.tagName,
							id: activeElement.id || "",
							className: activeElement.className || "",
					  }
					: null,
			strategy: this.strategyType,
			debugMode: this.config.enableDebugMode,
		};
	}

	/**
	 * 检查 leaf 是否已激活
	 */
	isLeafActive(leaf: WorkspaceLeaf): boolean {
		const leafEl = readUnknownProperty(leaf, "containerEl") as HTMLElement | undefined;
		if (!leafEl) return false;
		return leafEl.classList.contains("mod-active");
	}

	/**
	 * 强制恢复焦点
	 */
	async forceRestore(): Promise<boolean> {
		if (this.config.enableDebugMode) {
			logger.debug("[FocusManager] 强制恢复焦点");
		}

		// 尝试从栈中恢复
		const record = this.focusStack.peek();
		if (record) {
			return this.strategy.restore(record);
		}

		// 查找默认焦点元素
		const fallback = this.findDefaultFocusElement();
		if (fallback) {
			try {
				fallback.focus();
				return true;
			} catch {
				return false;
			}
		}

		return false;
	}

	/**
	 * 启用调试模式
	 */
	enableDebug(): void {
		this.configure({ enableDebugMode: true });
	}

	/**
	 * 禁用调试模式
	 */
	disableDebug(): void {
		this.configure({ enableDebugMode: false });
	}

	/**
	 * 设置焦点丢失监听器（仅桌面端）
	 */
	private setupFocusLostListener(): void {
		if (this.focusLostHandler) return;

		this.focusLostHandler = () => {
			// 使用节流机制
			this.requestCoalescer.schedule(() => {
				if (activeDocument.activeElement === activeDocument.body) {
					this.strategy.onFocusLost(null);
				}
			}, "focus-lost");
		};

		activeDocument.addEventListener("focusout", this.focusLostHandler);

		if (this.config.enableDebugMode) {
			logger.debug("[FocusManager] 焦点丢失监听器已设置");
		}
	}

	/**
	 * 移除焦点丢失监听器
	 */
	private removeFocusLostListener(): void {
		if (this.focusLostHandler) {
			activeDocument.removeEventListener("focusout", this.focusLostHandler);
			this.focusLostHandler = null;

			if (this.config.enableDebugMode) {
				logger.debug("[FocusManager] 焦点丢失监听器已移除");
			}
		}
	}

	/**
	 * 查找默认焦点元素
	 */
	private findDefaultFocusElement(): HTMLElement | null {
		// 优先查找主内容区域
		const mainContent = activeDocument.querySelector(
			".workspace-leaf.mod-active .view-content"
		) as HTMLElement;
		if (mainContent) return mainContent;

		// 查找任何激活的工作区
		const activeLeaf = activeDocument.querySelector(".workspace-leaf.mod-active") as HTMLElement;
		if (activeLeaf) return activeLeaf;

		// 查找 CodeMirror 编辑器
		const cmContent = activeDocument.querySelector(".cm-content") as HTMLElement;
		if (cmContent) return cmContent;

		return null;
	}

	/**
	 * 销毁
	 */
	destroy(): void {
		this.removeFocusLostListener();
		this.requestCoalescer.clear();
		this.focusTrapManager.releaseAll();
		this.keyboardMonitor?.destroy();
		this.focusStack.clear();

		FocusManager.instance = null;

		logger.debug("[FocusManager] 已销毁");
	}
}

// 导出便捷函数
export function getFocusManager(): FocusManager {
	return FocusManager.getInstance();
}
