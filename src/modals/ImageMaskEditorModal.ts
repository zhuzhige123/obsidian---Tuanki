import { logger } from "../utils/logger";
/**
 * 图片遮罩编辑器 Modal
 *
 * 功能：
 * - 继承 Obsidian Modal 类
 * - 封装 ImageMaskModal Svelte 组件
 * - 处理保存和取消逻辑
 * - 管理组件生命周期
 *
 * @author Weave Team
 * @date 2025-10-22
 */

import { Modal, Notice } from "obsidian";
import type { App, TFile } from "obsidian";
import type { MaskData } from "../types/image-mask-types";
import { applyStyleProps } from "../utils/style-props";

export interface ImageMaskEditorModalOptions {
	/** 图片文件 */
	imageFile: TFile;

	/** 现有遮罩数据 */
	initialMaskData: MaskData | null;

	/** 保存回调 */
	onSave: (maskData: MaskData) => void;

	/** 取消回调 */
	onCancel?: () => void;
}

/**
 * 图片遮罩编辑器 Modal
 */
export class ImageMaskEditorModal extends Modal {
	private modalComponent: Record<string, unknown> | null = null;
	private eventCleanup: (() => void) | null = null;
	private options: ImageMaskEditorModalOptions;

	constructor(app: App, options: ImageMaskEditorModalOptions) {
		super(app);
		this.options = options;

		logger.debug("[ImageMaskEditorModal] 初始化", {
			imageFile: options.imageFile.path,
			hasMaskData: !!options.initialMaskData,
		});
	}

	/**
	 * Modal 打开时调用
	 */
	async onOpen(): Promise<void> {
		logger.debug("[ImageMaskEditorModal] 打开模态窗");

		// 设置 Modal 容器样式
		this.modalEl.addClass("weave-image-mask-editor-modal");

		// 设置宽度和高度
		applyStyleProps(this.modalEl, {
			width: "90vw",
			"max-width": "1200px",
			height: "80vh",
		});

		// 清空内容容器
		this.contentEl.empty();
		this.contentEl.addClass("weave-image-mask-editor-content");

		// 在 Modal 层级完全隔离鼠标事件
		// 防止事件传递到 Obsidian 导致 e.isShown 错误
		const stopAllMouseEvents = (e: Event) => {
			e.stopPropagation();
			e.stopImmediatePropagation();
			// 不调用 preventDefault()，让内部功能正常工作
		};

		// 在 modalEl 层级拦截所有鼠标事件（冒泡阶段）
		const events = ["mousedown", "mousemove", "mouseup", "click", "dblclick"];
		for (const eventName of events) {
			this.modalEl.addEventListener(eventName, stopAllMouseEvents, false);
		}

		// 保存清理函数
		this.eventCleanup = () => {
			for (const eventName of events) {
				this.modalEl.removeEventListener(eventName, stopAllMouseEvents, false);
			}
		};

		try {
			// 实例化 Svelte 组件
			const { mount } = await import("svelte");
			const { default: Component } = await import("../components/image-mask/ImageMaskModal.svelte");
			this.modalComponent = mount(Component, {
				target: this.contentEl,
				props: {
					app: this.app,
					imageFile: this.options.imageFile,
					initialMaskData: this.options.initialMaskData,
					onSave: this.handleSave.bind(this),
					onCancel: this.handleCancel.bind(this),
				},
			});

			logger.debug("[ImageMaskEditorModal] Svelte 组件已挂载");
		} catch (error) {
			logger.error("[ImageMaskEditorModal] 创建组件失败:", error);
			new Notice("创建图片遮罩编辑器失败");
			this.close();
		}
	}

	/**
	 * Modal 关闭时调用
	 */
	onClose(): void {
		logger.debug("[ImageMaskEditorModal] 关闭模态窗");

		//  清理事件监听器
		if (this.eventCleanup) {
			this.eventCleanup();
			this.eventCleanup = null;
		}

		void this.finalizeClose();
	}

	private async finalizeClose(): Promise<void> {

		// 销毁 Svelte 组件
		if (this.modalComponent) {
			try {
				const { unmount } = await import("svelte");
				void unmount(this.modalComponent);
				this.modalComponent = null;
				logger.debug("[ImageMaskEditorModal] Svelte 组件已销毁");
			} catch (error) {
				logger.error("[ImageMaskEditorModal] 销毁组件失败:", error);
			}
		}

		// 清空内容
		this.contentEl.empty();
	}

	/**
	 * 处理保存
	 */
	private handleSave(maskData: MaskData): void {
		logger.debug("[ImageMaskEditorModal] 处理保存", {
			masksCount: maskData.masks.length,
		});

		try {
			// 调用用户提供的保存回调
			this.options.onSave(maskData);

			// 显示成功通知
			new Notice(`遮罩已保存（${maskData.masks.length} 个遮罩区域）`);

			// 关闭模态窗
			this.close();
		} catch (error) {
			logger.error("[ImageMaskEditorModal] 保存失败:", error);
			new Notice("保存遮罩失败");
		}
	}

	/**
	 * 处理取消
	 */
	private handleCancel(): void {
		logger.debug("[ImageMaskEditorModal] 处理取消");

		// 调用用户提供的取消回调
		if (this.options.onCancel) {
			this.options.onCancel();
		}

		// 关闭模态窗
		this.close();
	}
}
