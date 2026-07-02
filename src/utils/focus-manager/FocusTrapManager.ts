/**
 * 焦点陷阱管理器
 *
 * 管理模态窗口的焦点陷阱，防止 Tab 键跳出模态窗口。
 */

import { logger } from "../logger";
import type { IFocusTrapManager } from "./types";
import { FOCUSABLE_SELECTORS } from "./types";

interface TrapInfo {
	container: HTMLElement;
	keydownHandler: (e: KeyboardEvent) => void;
	focusableElements: HTMLElement[];
}

/**
 * 焦点陷阱管理器实现
 */
export class FocusTrapManager implements IFocusTrapManager {
	private traps: Map<HTMLElement, TrapInfo> = new Map();
	private debugMode: boolean;

	constructor(debugMode = false) {
		this.debugMode = debugMode;
	}

	/**
	 * 在容器内创建焦点陷阱
	 */
	trap(container: HTMLElement, initialFocus?: HTMLElement): void {
		// 如果已存在陷阱，先释放
		if (this.traps.has(container)) {
			this.release(container);
		}

		// 获取所有可聚焦元素
		const focusableElements = this.getFocusableElements(container);

		if (focusableElements.length === 0) {
			if (this.debugMode) {
				logger.warn("[FocusTrapManager] 容器内没有可聚焦元素");
			}
			return;
		}

		// 创建键盘事件处理器
		const keydownHandler = (e: KeyboardEvent) => {
			if (e.key !== "Tab") return;

			const currentFocusables = this.getFocusableElements(container);
			if (currentFocusables.length === 0) return;

			const firstElement = currentFocusables[0];
			const lastElement = currentFocusables[currentFocusables.length - 1];
			const activeElement = activeDocument.activeElement as HTMLElement;

			if (e.shiftKey) {
				// Shift+Tab：向后导航
				if (activeElement === firstElement || !container.contains(activeElement)) {
					e.preventDefault();
					lastElement.focus();
				}
			} else {
				// Tab：向前导航
				if (activeElement === lastElement || !container.contains(activeElement)) {
					e.preventDefault();
					firstElement.focus();
				}
			}
		};

		// 添加事件监听
		container.addEventListener("keydown", keydownHandler);

		// 保存陷阱信息
		this.traps.set(container, {
			container,
			keydownHandler,
			focusableElements,
		});

		// 设置初始焦点
		window.requestAnimationFrame(() => {
			if (initialFocus && container.contains(initialFocus)) {
				initialFocus.focus();
			} else if (focusableElements.length > 0) {
				focusableElements[0].focus();
			}
		});

		if (this.debugMode) {
			logger.debug("[FocusTrapManager] 创建焦点陷阱:", {
				focusableCount: focusableElements.length,
			});
		}
	}

	/**
	 * 释放焦点陷阱
	 */
	release(container: HTMLElement): void {
		const trapInfo = this.traps.get(container);
		if (!trapInfo) return;

		// 移除事件监听
		container.removeEventListener("keydown", trapInfo.keydownHandler);

		// 删除陷阱信息
		this.traps.delete(container);

		if (this.debugMode) {
			logger.debug("[FocusTrapManager] 释放焦点陷阱");
		}
	}

	/**
	 * 检查容器是否有焦点陷阱
	 */
	isTrapped(container: HTMLElement): boolean {
		return this.traps.has(container);
	}

	/**
	 * 获取容器内所有可聚焦的元素
	 */
	private getFocusableElements(container: HTMLElement): HTMLElement[] {
		const selector = FOCUSABLE_SELECTORS.join(", ");
		const elements = Array.from(container.querySelectorAll(selector));

		// 过滤掉不可见和禁用的元素
		return elements
			.filter((el): el is HTMLElement => el.instanceOf(HTMLElement))
			.filter((el) => this.isElementFocusable(el));
	}

	/**
	 * 检查元素是否可聚焦
	 */
	private isElementFocusable(element: HTMLElement): boolean {
		if (!element) return false;

		// 检查元素是否可见
		const style = window.getComputedStyle(element);
		if (style.display === "none" || style.visibility === "hidden") return false;

		// 检查元素是否被禁用
		if ("disabled" in element && Boolean((element as HTMLButtonElement).disabled)) return false;

		// 检查 tabindex
		const tabindex = element.getAttribute("tabindex");
		if (tabindex === "-1") return false;

		// 检查元素尺寸
		const rect = element.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return false;

		return true;
	}

	/**
	 * 设置调试模式
	 */
	setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}

	/**
	 * 获取当前陷阱数量
	 */
	getTrapCount(): number {
		return this.traps.size;
	}

	/**
	 * 释放所有陷阱
	 */
	releaseAll(): void {
		for (const container of this.traps.keys()) {
			this.release(container);
		}
	}
}
