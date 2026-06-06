/**
 * Svelte 5 兼容的事件处理工具
 *
 * 目标：
 * 1. 替代所有 stopPropagation 使用
 * 2. 确保不影响 Obsidian 本体功能
 * 3. 提供统一的事件处理模式
 */

import { logger } from "./logger";

/**
 * 安全的点击处理器
 * 只在点击目标是当前元素时执行
 */
export function safeClick(
	handler: (e: MouseEvent) => void,
	options?: {
		preventDefault?: boolean;
		onlyCurrentTarget?: boolean;
	}
) {
	return (e: MouseEvent) => {
		// 默认只在点击当前元素时执行
		if (options?.onlyCurrentTarget !== false) {
			if (e.target !== e.currentTarget) {
				return;
			}
		}

		if (options?.preventDefault) {
			e.preventDefault();
		}

		handler(e);
	};
}

/**
 * 模态框遮罩层点击处理器
 * 只在点击遮罩层本身时关闭
 */
export function overlayClick(closeHandler: () => void) {
	return (e: MouseEvent) => {
		if (e.target === e.currentTarget) {
			closeHandler();
		}
	};
}

/**
 * 模态框内容点击处理器
 * 阻止点击穿透，但不使用 stopPropagation
 */
export function modalContentClick() {
	return (_e: MouseEvent) => {
		// Svelte 5: 不做任何处理，让事件自然冒泡
		// 这里可以添加日志或其他逻辑
	};
}

/**
 * 按钮操作处理器
 * 用于列表项中的操作按钮
 */
export function actionButtonClick(handler: (e: MouseEvent) => void) {
	return (e: MouseEvent) => {
		e.preventDefault();
		handler(e);
	};
}

/**
 * 键盘事件处理器
 * 只处理特定按键，其他按键让 Obsidian 处理
 */
export function keyHandler(
	handlers: {
		[key: string]: (e: KeyboardEvent) => void;
	},
	options?: {
		preventDefault?: boolean;
	}
) {
	return (e: KeyboardEvent) => {
		const handler = handlers[e.key];
		if (handler) {
			if (options?.preventDefault) {
				e.preventDefault();
			}
			handler(e);
		}
		// 其他按键不处理，让事件冒泡到 Obsidian
	};
}

/**
 * 下拉菜单处理器
 */
export function dropdownHandler(selectHandler: (value: unknown) => void) {
	return {
		toggle: (e: MouseEvent) => {
			e.preventDefault();
			// 切换逻辑
		},
		select: (value: unknown) => (e: MouseEvent) => {
			e.preventDefault();
			selectHandler(value);
		},
	};
}

/**
 * 拖拽处理器（安全版本）
 * 只在插件容器内处理
 */
export function safeDragHandler(options: {
	onDragStart?: (e: DragEvent) => void;
	onDragEnd?: (e: DragEvent) => void;
	onDragOver?: (e: DragEvent) => void;
	onDrop?: (e: DragEvent) => void;
}) {
	return {
		dragstart: (e: DragEvent) => {
			// 检查是否在插件容器内
			const target = e.target as HTMLElement;
			if (!target.closest(".weave-plugin")) {
				return;
			}
			options.onDragStart?.(e);
		},
		dragend: options.onDragEnd || (() => {}),
		dragover: (e: DragEvent) => {
			e.preventDefault(); // 允许放置
			options.onDragOver?.(e);
		},
		drop: (e: DragEvent) => {
			e.preventDefault();
			options.onDrop?.(e);
		},
	};
}

/**
 * 检查事件是否应该被处理
 * 用于过滤非插件事件
 */
export function shouldHandleEvent(e: Event): boolean {
	const target = e.target as HTMLElement;

	// 检查是否在插件容器内
	if (!target.closest(".weave-plugin, .modal, .menu")) {
		logger.debug("[Event] 事件不在插件容器内，跳过处理");
		return false;
	}

	// 检查是否是 Obsidian 的编辑器
	if (target.closest(".cm-editor, .markdown-source-view")) {
		logger.debug("[Event] 事件在 Obsidian 编辑器内，跳过处理");
		return false;
	}

	return true;
}

/**
 * 创建安全的事件代理
 * 确保只处理插件内的事件
 */
export function createSafeEventProxy<T extends Event>(handler: (e: T) => void): (e: T) => void {
	return (e: T) => {
		if (shouldHandleEvent(e)) {
			handler(e);
		}
	};
}

/**
 * 批量转换旧的事件处理器
 * 用于迁移现有代码
 */
export function migrateEventHandler(oldHandler: string): string {
	// 移除 stopPropagation
	let newHandler = oldHandler.replace(/e\.stopPropagation\(\);?\s*/g, "");

	// 替换 stopImmediatePropagation
	newHandler = newHandler.replace(/e\.stopImmediatePropagation\(\);?\s*/g, "");

	// 保留 preventDefault
	// newHandler 已经正确

	return newHandler;
}

/**
 * 调试工具：监控事件传播
 */
export function debugEventPropagation(enabled = true) {
	if (!enabled) return () => {};

	const events = ["click", "keydown", "keyup", "focus", "blur"];

	const cleanups: Array<() => void> = [];

	events.forEach((_eventType) => {
		const onCapture = (e: Event) => {
			logger.debug(`[Capture] ${_eventType}:`, e.target);
		};

		const onBubble = (e: Event) => {
			logger.debug(`[Bubble] ${_eventType}:`, e.target);
		};

		// 捕获阶段
		activeDocument.addEventListener(_eventType, onCapture, true);

		// 冒泡阶段
		activeDocument.addEventListener(_eventType, onBubble, false);

		cleanups.push(() => {
			activeDocument.removeEventListener(_eventType, onCapture, true);
			activeDocument.removeEventListener(_eventType, onBubble, false);
		});
	});

	logger.info("[EventDebug] 事件传播监控已启动");

	return () => {
		cleanups.forEach((_fn) => {
			try {
				_fn();
			} catch { /* no-op */ }
		});
	};
}
