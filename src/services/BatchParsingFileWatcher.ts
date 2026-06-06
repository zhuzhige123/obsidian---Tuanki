/**
 * 批量解析文件变更监听器
 *
 * 监听 Markdown 文件变更并自动触发批量解析。
 * 必须走 BatchParsingManager 的正式链路（映射、UUID、三方合并），
 * 禁止直接 parseBatchCards + addCardsToDB，以免反复生成同正文新 UUID。
 */

import { type EventRef, Notice, TFile } from "obsidian";
import type { WeavePlugin } from "../main";
import { logger } from "../utils/logger";

/**
 * 批量解析文件监听器选项
 */
export interface BatchParsingWatcherOptions {
	/** 防抖延迟（毫秒） */
	debounceDelay: number;
	/** 是否仅监听活动文件 */
	onlyActiveFile: boolean;
	/** 是否启用自动触发 */
	autoTrigger: boolean;
	/** 包含的文件夹路径 */
	includeFolders: string[];
	/** 排除的文件夹路径 */
	excludeFolders: string[];
}

/**
 * 批量解析文件监听器
 */
export class BatchParsingFileWatcher {
	private plugin: WeavePlugin;
	private options: BatchParsingWatcherOptions;
	private eventRefs: EventRef[] = [];
	private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private isProcessing = new Map<string, boolean>();

	constructor(plugin: WeavePlugin, options: BatchParsingWatcherOptions) {
		this.plugin = plugin;
		this.options = options;
	}

	/**
	 * 初始化监听器
	 */
	async initialize(): Promise<void> {
		if (!this.options.autoTrigger) {
			logger.debug("[BatchParsingWatcher] 自动触发已禁用");
			return;
		}

		const modifyRef = this.plugin.app.vault.on("modify", (file) => {
			if (file instanceof TFile) {
				this.handleFileModify(file);
			}
		});
		this.eventRefs.push(modifyRef);

		logger.debug("[BatchParsingWatcher] ✅ 监听器已初始化");
	}

	private handleFileModify(file: TFile): void {
		if (file.extension !== "md") {
			return;
		}

		if (this.options.onlyActiveFile) {
			const activeFile = this.plugin.app.workspace.getActiveFile();
			if (!activeFile || file.path !== activeFile.path) {
				return;
			}
		}

		if (!this.shouldProcessFile(file.path)) {
			return;
		}

		this.debounceFileChange(file);
	}

	private debounceFileChange(file: TFile): void {
		if (this.debounceTimers.has(file.path)) {
			clearTimeout(this.debounceTimers.get(file.path)!);
		}

		const timer = setTimeout(() => {
			void this.processFile(file);
			this.debounceTimers.delete(file.path);
		}, this.options.debounceDelay);

		this.debounceTimers.set(file.path, timer);
	}

	private async processFile(file: TFile): Promise<void> {
		if (this.isProcessing.get(file.path)) {
			logger.debug(`[BatchParsingWatcher] 跳过重复处理: ${file.path}`);
			return;
		}

		this.isProcessing.set(file.path, true);

		try {
			await this.triggerBatchParsing(file);
		} catch (error) {
			logger.error("[BatchParsingWatcher] 处理文件失败:", error);
			new Notice(`批量解析失败: ${error instanceof Error ? error.message : "未知错误"}`);
		} finally {
			this.isProcessing.set(file.path, false);
		}
	}

	private async triggerBatchParsing(file: TFile): Promise<void> {
		logger.debug(`[BatchParsingWatcher] 🔄 开始自动解析: ${file.path}`);

		if (!this.plugin.batchParsingManager) {
			logger.warn("[BatchParsingWatcher] BatchParsingManager 未初始化，跳过自动解析");
			return;
		}

		await this.plugin.batchParsingManager.syncSingleFileFromWatcher(file);
	}

	private shouldProcessFile(filePath: string): boolean {
		if (this.options.excludeFolders.length > 0) {
			for (const excludeFolder of this.options.excludeFolders) {
				if (filePath.startsWith(excludeFolder)) {
					return false;
				}
			}
		}

		if (this.options.includeFolders.length > 0) {
			let isIncluded = false;
			for (const includeFolder of this.options.includeFolders) {
				if (filePath.startsWith(includeFolder)) {
					isIncluded = true;
					break;
				}
			}
			if (!isIncluded) {
				return false;
			}
		}

		return true;
	}

	destroy(): void {
		for (const ref of this.eventRefs) {
			this.plugin.app.vault.offref(ref);
		}
		this.eventRefs = [];

		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();
		this.isProcessing.clear();

		logger.debug("[BatchParsingWatcher] 监听器已销毁");
	}
}
