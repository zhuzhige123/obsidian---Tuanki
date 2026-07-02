/**
 * 被动焦点恢复策略（移动端）
 *
 * 在移动端使用，避免自动触发键盘弹出。
 * 仅在用户主动触发时恢复焦点。
 */

import { logger } from "../../logger";
import type { FocusRecord, IFocusRestoreStrategy, IKeyboardMonitor } from "../types";

/**
 * 被动焦点恢复策略实现
 */
export class PassiveFocusStrategy implements IFocusRestoreStrategy {
	private debugMode: boolean;
	private keyboardMonitor: IKeyboardMonitor | null;

	constructor(keyboardMonitor: IKeyboardMonitor | null = null, debugMode = false) {
		this.keyboardMonitor = keyboardMonitor;
		this.debugMode = debugMode;
	}

	/**
	 * 是否应该自动恢复焦点
	 * 移动端始终返回 false，避免自动触发键盘
	 */
	shouldAutoRestore(): boolean {
		return false;
	}

	/**
	 * 恢复焦点
	 * 移动端会检查键盘状态，避免在动画期间操作
	 */
	async restore(record: FocusRecord): Promise<boolean> {
		const { element, context } = record;

		// 检查键盘是否正在动画中
		if (this.keyboardMonitor?.isKeyboardActive()) {
			if (this.debugMode) {
				logger.debug("[PassiveFocusStrategy] 键盘活跃中，延迟恢复焦点:", { context });
			}

			// 等待键盘动画结束
			return new Promise((resolve) => {
				const checkAndRestore = () => {
					if (!this.keyboardMonitor?.isKeyboardActive()) {
						resolve(this.doRestore(element, context));
					} else {
						// 继续等待
						window.setTimeout(checkAndRestore, 50);
					}
				};

				// 最多等待 500ms
				window.setTimeout(() => {
					resolve(this.doRestore(element, context));
				}, 500);

				checkAndRestore();
			});
		}

		return this.doRestore(element, context);
	}

	/**
	 * 实际执行焦点恢复
	 */
	private doRestore(element: HTMLElement | null, context: string): boolean {
		// 检查元素是否存在且可聚焦
		if (element && this.isElementFocusable(element)) {
			try {
				// 移动端不自动聚焦输入框，避免触发键盘
				if (this.isInputElement(element)) {
					if (this.debugMode) {
						logger.debug("[PassiveFocusStrategy] 跳过输入框聚焦，避免触发键盘:", {
							context,
							element: element.tagName,
						});
					}
					return false;
				}

				element.focus();

				if (this.debugMode) {
					logger.debug("[PassiveFocusStrategy] 恢复焦点成功:", {
						context,
						element: element.tagName,
					});
				}

				return true;
			} catch (error) {
				logger.error("[PassiveFocusStrategy] 恢复焦点失败:", error);
			}
		}

		// 移动端不主动查找替代元素，避免意外触发键盘
		if (this.debugMode) {
			logger.debug("[PassiveFocusStrategy] 不恢复焦点（移动端被动策略）:", { context });
		}

		return false;
	}

	/**
	 * 焦点丢失时的处理
	 * 移动端仅记录日志，不自动恢复
	 */
	onFocusLost(currentElement: HTMLElement | null): void {
		if (this.debugMode) {
			logger.debug("[PassiveFocusStrategy] 焦点丢失（不自动恢复）:", {
				element: currentElement?.tagName || "null",
			});
		}
		// 移动端不自动恢复焦点，避免键盘闪烁
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

		return true;
	}

	/**
	 * 检查是否为输入元素
	 */
	private isInputElement(element: HTMLElement): boolean {
		const tagName = element.tagName.toLowerCase();
		return (
			tagName === "input" ||
			tagName === "textarea" ||
			element.getAttribute("contenteditable") === "true"
		);
	}

	/**
	 * 设置键盘监控器
	 */
	setKeyboardMonitor(monitor: IKeyboardMonitor | null): void {
		this.keyboardMonitor = monitor;
	}

	/**
	 * 设置调试模式
	 */
	setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}
}
