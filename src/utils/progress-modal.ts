/**
 * 可复用的进度条模态窗
 * 用于显示批量操作（如删除卡片、删除牌组）的进度
 */

import { type App, Modal } from "obsidian";
import { writable } from "svelte/store";
import { logger } from "./logger";

export interface ProgressModalOptions {
	title: string;
	description?: string;
	total: number;
	/** 是否允许用户取消操作 */
	cancellable?: boolean;
}

/** 样式已迁移到 styles/dynamic-injected.css */
function injectProgressStyles() {
	// no-op: styles now in static CSS
}

interface ProgressModalViewState {
	title: string;
	description: string;
	total: number;
	current: number;
	detail: string;
	etaText: string;
	percent: number;
	percentText: string;
	status: "running" | "success" | "error";
	cancellable: boolean;
	allowClose: boolean;
	isCancelled: boolean;
	actionLabel: string;
}

export class ProgressModal extends Modal {
	private modalComponent: unknown = null;

	private total: number;
	private current = 0;
	private cancelled = false;
	private allowClose = false;
	private options: ProgressModalOptions;
	private startTime = 0;
	private progressState = writable<ProgressModalViewState>(this.createInitialState());

	constructor(app: App, options: ProgressModalOptions) {
		super(app);
		this.options = options;
		this.total = options.total;
	}

	private createInitialState(): ProgressModalViewState {
		return {
			title: this.options.title,
			description: this.options.description || "",
			total: this.total,
			current: 0,
			detail: "",
			etaText: "",
			percent: 0,
			percentText: "0%",
			status: "running",
			cancellable: this.options.cancellable === true,
			allowClose: false,
			isCancelled: false,
			actionLabel: this.options.cancellable ? "取消操作" : "",
		};
	}

	onOpen() {
		injectProgressStyles();
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass("weave-progress-modal");

		this.titleEl.setText(this.options.title);
		this.startTime = Date.now();
		this.cancelled = false;
		this.allowClose = false;
		this.progressState.set(this.createInitialState());
		void this.mountComponent();

		// 拦截 ESC 和点击背景关闭
		this.scope.register([], "Escape", (e) => {
			if (!this.allowClose) {
				e.preventDefault();
				return false;
			}
		});
		this.modalEl.addEventListener(
			"click",
			(e) => {
				if (!this.allowClose && e.target === this.modalEl) {
					e.stopImmediatePropagation();
				}
			},
			true
		);
	}

	private async mountComponent(): Promise<void> {
		try {
			const { mount } = await import("svelte");
			const { default: Component } = await import("../components/modals/ProgressModalContent.svelte");
			this.modalComponent = mount(Component, {
				target: this.contentEl,
				props: {
					progressState: this.progressState,
					onAction: () => this.handleAction(),
				},
			});
		} catch (error) {
			logger.error("[ProgressModal] 创建组件失败:", error);
			this.close();
		}
	}

	private handleAction(): void {
		if (this.allowClose) {
			this.close();
			return;
		}

		if (!this.options.cancellable || this.cancelled) {
			return;
		}

		this.cancelled = true;
		this.progressState.update((state) => ({
			...state,
			isCancelled: true,
			actionLabel: "正在取消...",
		}));
	}

	async onClose() {
		// 如果操作仍在进行，阻止关闭（回滚）
		if (!this.allowClose) {
			// Modal 已经执行了 close，无法阻止；标记取消
			this.cancelled = true;
		}

		if (this.modalComponent) {
			try {
				const { unmount } = await import("svelte");
				void unmount(this.modalComponent as never);
				this.modalComponent = null;
			} catch (error) {
				logger.error("[ProgressModal] 销毁组件失败:", error);
			}
		}
	}

	/** 更新进度 */
	updateProgress(current: number, detail?: string) {
		this.current = current;
		const pct = this.total > 0 ? Math.min(100, Math.round((current / this.total) * 100)) : 0;

		// 预估剩余时间
		let etaText = "";
		const elapsed = Date.now() - this.startTime;
		if (current > 0 && current < this.total) {
			const avgMs = elapsed / current;
			const remainMs = avgMs * (this.total - current);
			etaText = this.formatETA(remainMs);
		}

		this.progressState.update((state) => ({
			...state,
			current,
			detail: detail || "",
			percent: pct,
			percentText: `${pct}%`,
			etaText,
		}));
	}

	/** 更新描述文案 */
	updateDescription(description: string) {
		this.progressState.update((state) => ({
			...state,
			description,
		}));
	}

	/** 递增进度 */
	increment(detail?: string) {
		this.updateProgress(this.current + 1, detail);
	}

	/** 是否已取消 */
	isCancelled(): boolean {
		return this.cancelled;
	}

	/** 设置完成状态 */
	setComplete(message: string) {
		this.allowClose = true;
		this.progressState.update((state) => ({
			...state,
			current: this.total,
			detail: message,
			etaText: "",
			percent: 100,
			percentText: "100%",
			status: "success",
			allowClose: true,
			actionLabel: "关闭",
		}));

		setTimeout(() => this.close(), 1200);
	}

	/** 设置错误状态 */
	setError(message: string) {
		this.allowClose = true;
		this.progressState.update((state) => ({
			...state,
			detail: message,
			etaText: "",
			status: "error",
			allowClose: true,
			actionLabel: "关闭",
			percentText: "--",
		}));
	}

	private formatETA(ms: number): string {
		const sec = Math.round(ms / 1000);
		if (sec < 2) return "即将完成";
		if (sec < 60) return `预计剩余 ${sec} 秒`;
		const min = Math.floor(sec / 60);
		const remainSec = sec % 60;
		return `预计剩余 ${min} 分 ${remainSec} 秒`;
	}
}

/**
 * 带进度条的批量操作执行器
 */
export async function executeBatchWithProgress<T>(
	app: App,
	options: ProgressModalOptions,
	items: T[],
	processor: (item: T, index: number) => Promise<boolean>
): Promise<{ ok: number; fail: number; cancelled: boolean }> {
	const modal = new ProgressModal(app, {
		...options,
		total: items.length,
		cancellable: options.cancellable !== false,
	});

	modal.open();

	let ok = 0;
	let fail = 0;

	try {
		for (let i = 0; i < items.length; i++) {
			if (modal.isCancelled()) {
				logger.info(`[ProgressModal] 操作已取消，已处理 ${i}/${items.length}`);
				break;
			}

			try {
				const success = await processor(items[i], i);
				if (success) {
					ok++;
				} else {
					fail++;
				}
			} catch (error) {
				logger.error(`[ProgressModal] 处理项目 ${i} 失败:`, error);
				fail++;
			}

			modal.increment();
		}

		if (modal.isCancelled()) {
			modal.setComplete(`已取消: 成功 ${ok}, 失败 ${fail}, 未处理 ${items.length - ok - fail}`);
		} else if (fail > 0) {
			modal.setComplete(`完成: 成功 ${ok}, 失败 ${fail}`);
		} else {
			modal.setComplete(`全部完成: ${ok} 项`);
		}
	} catch (error) {
		logger.error("[ProgressModal] 批量操作失败:", error);
		modal.setError(`操作失败: ${error instanceof Error ? error.message : "未知错误"}`);
	}

	return { ok, fail, cancelled: modal.isCancelled() };
}
