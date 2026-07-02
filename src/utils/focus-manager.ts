/**
 * 焦点管理器 - 解决模态窗口关闭后焦点丢失导致无法输入的问题
 *
 * 问题背景：
 * - 模态窗口关闭后，焦点没有正确恢复到之前的元素
 * - 导致整个应用失去焦点，输入框无法获得焦点
 *
 * 解决方案：
 * - 打开模态窗口前保存当前焦点
 * - 关闭模态窗口后恢复焦点
 * - 提供焦点陷阱功能，防止Tab键跳出模态窗口
 *
 * 注意：焦点丢失的根本原因（浏览器原生确认对话框）已通过
 * obsidian-confirm.ts 工具函数解决，使用 Obsidian Modal API 替代。
 */

import { logger } from "./logger";

export class FocusManager {
	private static instance: FocusManager | null = null;
	private focusStack: (HTMLElement | null)[] = [];
	private trapCleanupFunctions: Map<HTMLElement, () => void> = new Map();

	private constructor() {}

	static getInstance(): FocusManager {
		if (typeof window !== "undefined") {
						if (window.__weaveFocusManager) {
				return window.__weaveFocusManager;
			}

			const instance = new FocusManager();
			window.__weaveFocusManager = instance;
			window.__weaveFocusManagerCleanup = () => {
				try {
					(window.__weaveFocusManager as FocusManager | undefined)?.destroy();
				} catch { /* no-op */ }

				try {
					window.__weaveFocusManager = undefined;
					window.__weaveFocusManagerCleanup = undefined;
				} catch {
					window.__weaveFocusManager = null;
					window.__weaveFocusManagerCleanup = null;
				}
			};

			return instance;
		}

		if (!FocusManager.instance) {
			FocusManager.instance = new FocusManager();
		}
		return FocusManager.instance;
	}

	/**
	 * 保存当前焦点并可选地设置新焦点
	 * @param newFocusElement 可选的新焦点元素
	 */
	saveFocus(newFocusElement?: HTMLElement): void {
		const currentFocus = activeDocument.activeElement as HTMLElement;

		// 保存当前焦点到栈中
		if (currentFocus && currentFocus !== activeDocument.body) {
			this.focusStack.push(currentFocus);
			logger.debug("[FocusManager] 保存焦点:", {
				element: currentFocus.tagName,
				className: currentFocus.className,
				id: currentFocus.id,
			});
		} else {
			// 如果没有焦点元素，尝试找到一个合理的默认元素
			const defaultFocusable = this.findDefaultFocusableElement();
			this.focusStack.push(defaultFocusable);
			logger.debug("[FocusManager] 保存默认焦点元素");
		}

		// 如果提供了新焦点元素，设置焦点
		if (newFocusElement) {
			window.setTimeout(() => {
				newFocusElement.focus();
			}, 50);
		}
	}

	/**
	 * 恢复之前保存的焦点
	 * @param fallbackElement 如果无法恢复时的备选元素
	 */
	restoreFocus(fallbackElement?: HTMLElement): void {
		const previousFocus = this.focusStack.pop();

		if (previousFocus && this.isElementFocusable(previousFocus)) {
			// 使用 setTimeout 确保在模态窗口完全关闭后恢复焦点
			window.setTimeout(() => {
				try {
					previousFocus.focus();
					logger.debug("[FocusManager] 恢复焦点到:", {
						element: previousFocus.tagName,
						className: previousFocus.className,
						id: previousFocus.id,
					});
				} catch (error) {
					logger.error("[FocusManager] 恢复焦点失败:", error);
					this.focusFallback(fallbackElement);
				}
			}, 100);
		} else {
			logger.debug("[FocusManager] 无法恢复之前的焦点，使用备选方案");
			this.focusFallback(fallbackElement);
		}
	}

	/**
	 * 清除特定模态窗口的焦点保存
	 * 用于模态窗口异常关闭时的清理
	 */
	clearFocus(): void {
		if (this.focusStack.length > 0) {
			this.focusStack.pop();
			logger.debug("[FocusManager] 清除最后一个焦点记录");
		}
	}

	/**
	 * 创建焦点陷阱，防止Tab键跳出模态窗口
	 * @param container 模态窗口容器
	 * @param firstFocusElement 可选的初始焦点元素
	 */
	trapFocus(container: HTMLElement, firstFocusElement?: HTMLElement): void {
		// 清理之前的陷阱
		this.releaseTrap(container);

		const focusableElements = this.getFocusableElements(container);
		if (focusableElements.length === 0) {
			logger.warn("[FocusManager] 容器内没有可聚焦元素");
			return;
		}

		const firstElement = focusableElements[0] as HTMLElement;
		const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

		// 设置初始焦点
		window.setTimeout(() => {
			if (firstFocusElement && container.contains(firstFocusElement)) {
				firstFocusElement.focus();
			} else {
				firstElement.focus();
			}
		}, 50);

		// Tab键处理函数
		const handleTabKey = (e: KeyboardEvent) => {
			if (e.key !== "Tab") return;

			const activeElement = activeDocument.activeElement;

			if (e.shiftKey) {
				// Shift+Tab：向后导航
				if (activeElement === firstElement) {
					e.preventDefault();
					lastElement.focus();
				}
			} else {
				// Tab：向前导航
				if (activeElement === lastElement) {
					e.preventDefault();
					firstElement.focus();
				}
			}
		};

		// Escape 已移除，由 Obsidian 原生处理
		const handleEscapeKey = (_e: KeyboardEvent) => {};

		container.addEventListener("keydown", handleTabKey);
		container.addEventListener("keydown", handleEscapeKey);

		// 保存清理函数
		this.trapCleanupFunctions.set(container, () => {
			container.removeEventListener("keydown", handleTabKey);
			container.removeEventListener("keydown", handleEscapeKey);
		});

		logger.debug("[FocusManager] 焦点陷阱已创建");
	}

	/**
	 * 释放焦点陷阱
	 * @param container 模态窗口容器
	 */
	releaseTrap(container: HTMLElement): void {
		const cleanup = this.trapCleanupFunctions.get(container);
		if (cleanup) {
			cleanup();
			this.trapCleanupFunctions.delete(container);
			logger.debug("[FocusManager] 焦点陷阱已释放");
		}
	}

	/**
	 * 获取容器内所有可聚焦的元素
	 */
	private getFocusableElements(container: HTMLElement): NodeListOf<Element> {
		const selector = [
			"a[href]",
			"button:not([disabled])",
			"input:not([disabled])",
			"textarea:not([disabled])",
			"select:not([disabled])",
			'[tabindex]:not([tabindex="-1"])',
			'[contenteditable="true"]',
		].join(", ");

		return container.querySelectorAll(selector);
	}

	/**
	 * 检查元素是否可聚焦
	 */
	private isElementFocusable(element: HTMLElement): boolean {
		if (!element) return false;

		// 检查元素是否在文档中
		if (!activeDocument.body.contains(element)) return false;

		// 检查元素是否可见
		const style = window.getComputedStyle(element);
		if (style.display === "none" || style.visibility === "hidden") return false;

		// 检查元素是否被禁用
		if ("disabled" in element && Boolean((element as HTMLButtonElement).disabled)) return false;

		// 检查tabindex
		const tabindex = element.getAttribute("tabindex");
		if (tabindex === "-1") return false;

		return true;
	}

	/**
	 * 查找默认的可聚焦元素
	 */
	private findDefaultFocusableElement(): HTMLElement | null {
		// 优先查找主内容区域
		const mainContent = activeDocument.querySelector(
			".workspace-leaf.mod-active .view-content"
		) as HTMLElement;
		if (mainContent) return mainContent;

		// 查找任何激活的工作区
		const activeLeaf = activeDocument.querySelector(".workspace-leaf.mod-active") as HTMLElement;
		if (activeLeaf) return activeLeaf;

		// 查找主要的输入框或按钮
		const primaryInput = activeDocument.querySelector(
			"input:not([disabled]), button:not([disabled])"
		) as HTMLElement;
		if (primaryInput) return primaryInput;

		// 最后返回body
		return activeDocument.body;
	}

	/**
	 * 焦点恢复失败时的备选方案
	 */
	private focusFallback(fallbackElement?: HTMLElement): void {
		if (fallbackElement && this.isElementFocusable(fallbackElement)) {
			fallbackElement.focus();
			logger.debug("[FocusManager] 使用备选元素恢复焦点");
		} else {
			// 尝试找到一个合理的默认焦点
			const defaultElement = this.findDefaultFocusableElement();
			if (defaultElement) {
				defaultElement.focus();
				logger.debug("[FocusManager] 使用默认元素恢复焦点");
			}
		}
	}

	/**
	 * 调试：获取当前焦点状态
	 */
	debugFocusState(): void {
		const activeElement = activeDocument.activeElement;
		logger.debug("[FocusManager] 当前焦点状态:", {
			activeElement: activeElement,
			tagName: activeElement?.tagName,
			className: (activeElement as HTMLElement)?.className,
			id: (activeElement as HTMLElement)?.id,
			focusStackSize: this.focusStack.length,
			trapCount: this.trapCleanupFunctions.size,
		});
	}

	destroy(): void {
		for (const cleanup of this.trapCleanupFunctions.values()) {
			try {
				cleanup();
			} catch { /* no-op */ }
		}

		this.trapCleanupFunctions.clear();
		this.focusStack = [];

		FocusManager.instance = null;
	}
}

// 导出单例实例
export const focusManager = FocusManager.getInstance();
