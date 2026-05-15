/**
 * 全局清理进度模态窗口
 *
 * 职责：
 * - 显示清理进度（动画进度条）
 * - 三列统计卡片（文件/检测/清理）
 * - 可折叠的清理详情列表
 * - 显示保护状态和错误信息
 * - 提供取消/暂停功能
 */

import { App, Modal } from "obsidian";
import { writable } from "svelte/store";
import { GlobalCleanupScanner } from "../../services/cleanup/GlobalCleanupScanner";
import { CleanupDetail, GlobalScanResult, ScanProgress } from "../../services/cleanup/types";
import { logger } from "../../utils/logger";

interface CleanupProgressViewState {
	progress: ScanProgress | null;
	details: CleanupDetail[];
	stats: {
		totalFiles: number;
		processedFiles: number;
		detectedOrphans: number;
		cleanedOrphans: number;
		errorCount: number;
	};
	elapsedMs: number;
	isCompleted: boolean;
	isCancelled: boolean;
	result: GlobalScanResult | null;
}

export class CleanupProgressModal extends Modal {
	private scanner: GlobalCleanupScanner;
	private modalComponent: unknown = null;
	private isCancelled = false;
	private isCompleted = false;
	private startTime = 0;
	private timerInterval?: number;
	private progressState = writable<CleanupProgressViewState>(this.createInitialState());

	constructor(app: App, scanner: GlobalCleanupScanner) {
		super(app);
		this.scanner = scanner;
	}

	private createInitialState(): CleanupProgressViewState {
		return {
			progress: null,
			details: [],
			stats: {
				totalFiles: 0,
				processedFiles: 0,
				detectedOrphans: 0,
				cleanedOrphans: 0,
				errorCount: 0,
			},
			elapsedMs: 0,
			isCompleted: false,
			isCancelled: false,
			result: null,
		};
	}

	onOpen(): void {
		this.startTime = Date.now();
		this.isCancelled = false;
		this.isCompleted = false;
		this.contentEl.empty();
		this.contentEl.addClass("weave-cleanup-modal");
		this.progressState.set(this.createInitialState());
		void this.mountComponent();
		this.startTimer();
	}

	async onClose(): Promise<void> {
		if (this.timerInterval) {
			window.clearInterval(this.timerInterval);
			this.timerInterval = undefined;
		}

		if (this.modalComponent) {
			try {
				const { unmount } = await import("svelte");
				void unmount(this.modalComponent as never);
				this.modalComponent = null;
			} catch (error) {
				logger.error("[CleanupProgressModal] 销毁组件失败:", error);
			}
		}

		this.contentEl.empty();
	}

	/**
	 * 构建UI
	 */
	private async mountComponent(): Promise<void> {
		try {
			const { mount } = await import("svelte");
			const { default: Component } = await import("./CleanupProgressModal.svelte");
			this.modalComponent = mount(Component, {
				target: this.contentEl,
				props: {
					progressState: this.progressState,
					onClose: () => this.close(),
					onCancel: () => this.handleCancel(),
				},
			});
		} catch (error) {
			logger.error("[CleanupProgressModal] 创建组件失败:", error);
			this.close();
		}
	}

	/**
	 * 渲染统计卡片
	 */
	private renderStatsCards(): void {}

	/**
	 * 启动计时器
	 */
	private startTimer(): void {
		this.timerInterval = window.setInterval(() => {
			this.progressState.update((state) => ({
				...state,
				elapsedMs: Date.now() - this.startTime,
			}));
		}, 100);
	}

	/**
	 * 更新进度
	 */
	public updateProgress(progress: ScanProgress): void {
		this.progressState.update((state) => ({
			...state,
			progress: {
				...progress,
				currentFile:
					progress.currentFile.length > 50
						? `...${progress.currentFile.slice(-47)}`
						: progress.currentFile,
			},
			stats: {
				...state.stats,
				totalFiles: progress.totalFiles,
				processedFiles: progress.processedFiles,
				detectedOrphans: progress.detectedCount ?? state.stats.detectedOrphans,
				cleanedOrphans: progress.cleanedCount,
			},
		}));
	}

	/**
	 * 添加清理详情
	 */
	public addCleanupDetail(detail: CleanupDetail): void {
		this.progressState.update((state) => ({
			...state,
			details: [...state.details, detail].slice(-50),
			stats: {
				...state.stats,
				errorCount:
					detail.status === "error" ? state.stats.errorCount + 1 : state.stats.errorCount,
			},
		}));
	}

	/**
	 * 显示结果
	 */
	public showResult(result: GlobalScanResult): void {
		this.isCompleted = true;

		// 停止计时器
		if (this.timerInterval) {
			window.clearInterval(this.timerInterval);
			this.timerInterval = undefined;
		}

		const errorDetails: CleanupDetail[] = result.errors.map((_err) => ({
			filePath: _err.filePath,
			status: "error",
			message: _err.error,
		}));

		this.progressState.update((state) => ({
			...state,
			progress: {
				phase: "completed",
				currentFile: "扫描完成",
				processedFiles: result.totalFiles,
				totalFiles: result.totalFiles,
				cleanedCount: result.cleanedOrphans,
				detectedCount: result.totalOrphans,
				percentage: 100,
			},
			details: [...state.details, ...errorDetails].slice(-50),
			stats: {
				totalFiles: result.totalFiles,
				processedFiles: result.totalFiles,
				detectedOrphans: result.totalOrphans,
				cleanedOrphans: result.cleanedOrphans,
				errorCount: result.errors.length,
			},
			elapsedMs: result.duration,
			isCompleted: true,
			result,
		}));
	}

	/**
	 * 处理取消
	 */
	private handleCancel(): void {
		if (this.isCompleted) {
			this.close();
		} else {
			if (this.isCancelled) {
				return;
			}

			this.isCancelled = true;
			this.scanner.cancel();
			this.progressState.update((state) => ({
				...state,
				isCancelled: true,
			}));

			setTimeout(() => {
				this.close();
			}, 1500);
		}
	}

	/**
	 * 添加样式
	 */
	private addStyles(): void {
		// 样式已迁移到 styles/dynamic-injected.css
	}
}
