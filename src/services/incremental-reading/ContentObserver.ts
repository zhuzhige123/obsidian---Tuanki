/**
 * 内容变化观察器
 *
 * 监听编辑器内容变化，触发遮罩位置更新
 *
 * 监听以下事件：
 * - 图片加载完成
 * - 折叠块展开/收起
 * - 内容编辑
 * - 滚动事件
 * - 视口大小变化
 *
 * @module services/incremental-reading/ContentObserver
 * @version 1.0.0
 */

import { MarkdownView } from "obsidian";

/**
 * 内容变化观察器接口
 */
export interface ContentObserver {
	/**
	 * 开始观察
	 */
	start(): void;

	/**
	 * 停止观察
	 */
	stop(): void;

	/**
	 * 注册位置更新回调
	 */
	onPositionUpdate(callback: () => void): void;

	/**
	 * 移除位置更新回调
	 */
	offPositionUpdate(callback: () => void): void;

	/**
	 * 手动触发更新
	 */
	triggerUpdate(): void;

	/**
	 * 销毁观察器
	 */
	destroy(): void;
}

/**
 * ContentObserver 实现
 *
 * 使用 MutationObserver、ResizeObserver 和事件监听器
 * 监听各种内容变化，并使用 requestAnimationFrame 批量更新
 */
export class ContentObserverImpl implements ContentObserver {
	private view: MarkdownView;
	private callbacks: Set<() => void> = new Set();
	private mutationObserver: MutationObserver | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private scrollHandler: (() => void) | null = null;
	private imageLoadHandlers: Map<HTMLImageElement, () => void> = new Map();
	private rafId: number | null = null;
	private scheduledUpdateType: "raf" | "timeout" | null = null;
	private isRunning = false;
	private lastUpdateTime = 0;
	private minUpdateInterval = 16; // 约 60fps

	constructor(view: MarkdownView) {
		this.view = view;
	}

	/**
	 * 开始观察
	 */
	start(): void {
		if (this.isRunning) return;
		this.isRunning = true;

		const contentEl = this.view.contentEl;
		const scroller = contentEl.querySelector(".cm-scroller") as HTMLElement;

		// 1. 监听 DOM 变化（图片加载、折叠等）
		this.setupMutationObserver(contentEl);

		// 2. 监听现有图片加载
		this.setupImageLoadListeners(contentEl);

		// 3. 监听滚动
		if (scroller) {
			this.setupScrollListener(scroller);
		}

		// 4. 监听视口大小变化
		this.setupResizeObserver(contentEl);
	}

	/**
	 * 停止观察
	 */
	stop(): void {
		this.isRunning = false;

		// 清理 MutationObserver
		this.mutationObserver?.disconnect();
		this.mutationObserver = null;

		// 清理 ResizeObserver
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		// 清理滚动监听
		if (this.scrollHandler) {
			const scroller = this.view.contentEl.querySelector(".cm-scroller");
			scroller?.removeEventListener("scroll", this.scrollHandler);
			this.scrollHandler = null;
		}

		// 清理图片加载监听
		this.cleanupImageLoadListeners();

		// 取消待处理的 RAF
		if (this.rafId !== null) {
			if (this.scheduledUpdateType === "timeout") {
				clearTimeout(this.rafId);
			} else {
				cancelAnimationFrame(this.rafId);
			}
			this.rafId = null;
			this.scheduledUpdateType = null;
		}
	}

	/**
	 * 注册位置更新回调
	 */
	onPositionUpdate(callback: () => void): void {
		this.callbacks.add(callback);
	}

	/**
	 * 移除位置更新回调
	 */
	offPositionUpdate(callback: () => void): void {
		this.callbacks.delete(callback);
	}

	/**
	 * 手动触发更新
	 */
	triggerUpdate(): void {
		this.scheduleUpdate();
	}

	/**
	 * 销毁观察器
	 */
	destroy(): void {
		this.stop();
		this.callbacks.clear();
	}

	/**
	 * 设置 MutationObserver
	 */
	private setupMutationObserver(contentEl: HTMLElement): void {
		this.mutationObserver = new MutationObserver((mutations) => {
			// 检查是否有相关变化
			let shouldUpdate = false;

			for (const mutation of mutations) {
				// 检查新增的图片
				if (mutation.type === "childList") {
					mutation.addedNodes.forEach((_node) => {
						if (_node instanceof HTMLImageElement) {
							this.addImageLoadListener(_node);
							shouldUpdate = true;
						} else if (_node instanceof HTMLElement) {
							// 检查新增节点中的图片
							const images = _node.querySelectorAll("img");
							images.forEach((img) => this.addImageLoadListener(img));
							if (images.length > 0) shouldUpdate = true;
						}
					});
					shouldUpdate = true;
				}

				// 检查属性变化（如折叠状态）
				if (mutation.type === "attributes") {
					const target = mutation.target as HTMLElement;
					if (
						target.classList?.contains("is-collapsed") ||
						target.classList?.contains("cm-fold") ||
						mutation.attributeName === "style"
					) {
						shouldUpdate = true;
					}
				}
			}

			if (shouldUpdate) {
				this.scheduleUpdate();
			}
		});

		this.mutationObserver.observe(contentEl, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["class", "style", "src", "data-collapsed"],
		});
	}

	/**
	 * 设置图片加载监听
	 */
	private setupImageLoadListeners(contentEl: HTMLElement): void {
		const images = contentEl.querySelectorAll("img");
		images.forEach((img) => this.addImageLoadListener(img));
	}

	/**
	 * 添加单个图片的加载监听
	 */
	private addImageLoadListener(img: HTMLImageElement): void {
		if (this.imageLoadHandlers.has(img)) return;
		if (img.complete) return; // 已加载完成

		const handler = () => {
			this.scheduleUpdate();
			this.imageLoadHandlers.delete(img);
		};

		img.addEventListener("load", handler, { once: true });
		img.addEventListener("error", handler, { once: true });
		this.imageLoadHandlers.set(img, handler);
	}

	/**
	 * 清理图片加载监听
	 */
	private cleanupImageLoadListeners(): void {
		this.imageLoadHandlers.forEach((handler, img) => {
			img.removeEventListener("load", handler);
			img.removeEventListener("error", handler);
		});
		this.imageLoadHandlers.clear();
	}

	/**
	 * 设置滚动监听
	 */
	private setupScrollListener(scroller: HTMLElement): void {
		this.scrollHandler = () => this.scheduleUpdate();
		scroller.addEventListener("scroll", this.scrollHandler, { passive: true });
	}

	/**
	 * 设置 ResizeObserver
	 */
	private setupResizeObserver(contentEl: HTMLElement): void {
		this.resizeObserver = new ResizeObserver(() => {
			this.scheduleUpdate();
		});
		this.resizeObserver.observe(contentEl);
	}

	/**
	 * 调度更新（使用 RAF 批量处理）
	 */
	private scheduleUpdate(): void {
		// 如果已经有待处理的更新，跳过
		if (this.rafId !== null) return;

		// 节流：确保不会过于频繁更新
		const now = Date.now();
		const timeSinceLastUpdate = now - this.lastUpdateTime;

		if (timeSinceLastUpdate < this.minUpdateInterval) {
			// 延迟到下一个合适的时间点
			this.rafId = window.setTimeout(() => {
				this.rafId = null;
				this.scheduledUpdateType = null;
				this.executeUpdate();
			}, this.minUpdateInterval - timeSinceLastUpdate) as unknown as number;
			this.scheduledUpdateType = "timeout";
		} else {
			// 使用 RAF 在下一帧执行
			this.rafId = requestAnimationFrame(() => {
				this.rafId = null;
				this.scheduledUpdateType = null;
				this.executeUpdate();
			});
			this.scheduledUpdateType = "raf";
		}
	}

	/**
	 * 执行更新
	 */
	private executeUpdate(): void {
		this.lastUpdateTime = Date.now();
		this.callbacks.forEach((_cb) => {
			try {
				_cb();
			} catch (_e) {
				// Callback error silently ignored
			}
		});
	}
}

/**
 * 创建 ContentObserver 实例
 */
export function createContentObserver(view: MarkdownView): ContentObserver {
	return new ContentObserverImpl(view);
}
