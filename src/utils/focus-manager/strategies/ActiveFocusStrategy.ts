/**
 * 主动焦点恢复策略（桌面端）
 *
 * 在桌面端使用，自动恢复焦点，确保操作后能立即继续输入。
 */

import { logger } from "../../logger";
import type { FocusRecord, IFocusRestoreStrategy } from "../types";

/**
 * 主动焦点恢复策略实现
 */
export class ActiveFocusStrategy implements IFocusRestoreStrategy {
	private debugMode: boolean;

	constructor(debugMode = false) {
		this.debugMode = debugMode;
	}

	/**
	 * 是否应该自动恢复焦点
	 * 桌面端始终返回 true
	 */
	shouldAutoRestore(): boolean {
		return true;
	}

	/**
	 * 恢复焦点
	 */
	async restore(record: FocusRecord): Promise<boolean> {
		const { element, context } = record;

		// 检查元素是否存在且可聚焦
		if (element && this.isElementFocusable(element)) {
			try {
				element.focus();

				if (this.debugMode) {
					logger.debug("[ActiveFocusStrategy] 恢复焦点成功:", {
						context,
						element: element.tagName,
						id: element.id,
						className: element.className,
					});
				}

				return true;
			} catch (error) {
				logger.error("[ActiveFocusStrategy] 恢复焦点失败:", error);
			}
		}

		// 元素不存在或不可聚焦，尝试查找替代元素
		const fallback = this.findFallbackElement();
		if (fallback) {
			try {
				fallback.focus();

				if (this.debugMode) {
					logger.debug("[ActiveFocusStrategy] 使用替代元素恢复焦点:", {
						context,
						element: fallback.tagName,
					});
				}

				return true;
			} catch (error) {
				logger.error("[ActiveFocusStrategy] 替代元素聚焦失败:", error);
			}
		}

		if (this.debugMode) {
			logger.debug("[ActiveFocusStrategy] 无法恢复焦点:", { context });
		}

		return false;
	}

	/**
	 * 焦点丢失时的处理
	 * 桌面端会尝试自动恢复
	 */
	onFocusLost(currentElement: HTMLElement | null): void {
		// 如果焦点丢失到 body，尝试恢复到合理的元素
		if (!currentElement || currentElement === activeDocument.body) {
			const fallback = this.findFallbackElement();
			if (fallback) {
				// 使用 requestAnimationFrame 延迟执行，避免干扰正常操作
				window.requestAnimationFrame(() => {
					if (activeDocument.activeElement === activeDocument.body) {
						fallback.focus();

						if (this.debugMode) {
							logger.debug("[ActiveFocusStrategy] 自动恢复丢失的焦点");
						}
					}
				});
			}
		}
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
		if (element.instanceOf(HTMLInputElement) || element.instanceOf(HTMLButtonElement)) {
			if (element.disabled) return false;
		}

		// 检查 tabindex
		const tabindex = element.getAttribute("tabindex");
		if (tabindex === "-1") return false;

		return true;
	}

	/**
	 * 查找替代焦点元素
	 */
	private findFallbackElement(): HTMLElement | null {
		// 优先查找主内容区域
		const mainContent = activeDocument.querySelector(
			".workspace-leaf.mod-active .view-content"
		) as HTMLElement;
		if (mainContent && this.isElementFocusable(mainContent)) return mainContent;

		// 查找任何激活的工作区
		const activeLeaf = activeDocument.querySelector(".workspace-leaf.mod-active") as HTMLElement;
		if (activeLeaf && this.isElementFocusable(activeLeaf)) return activeLeaf;

		// 查找 CodeMirror 编辑器
		const cmContent = activeDocument.querySelector(".cm-content") as HTMLElement;
		if (cmContent && this.isElementFocusable(cmContent)) return cmContent;

		// 查找主要的输入框
		const primaryInput = activeDocument.querySelector(
			"input:not([disabled]), textarea:not([disabled])"
		) as HTMLElement;
		if (primaryInput && this.isElementFocusable(primaryInput)) return primaryInput;

		return null;
	}

	/**
	 * 设置调试模式
	 */
	setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}
}
