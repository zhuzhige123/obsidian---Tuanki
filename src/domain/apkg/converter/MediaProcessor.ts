/**
 * 媒体文件处理器
 *
 * 负责处理APKG中的媒体文件，包括保存、去重、生成清单等
 *
 * @module domain/apkg/converter
 */

import type { IMediaStorageAdapter } from "../../../infrastructure/adapters/MediaStorageAdapter";
import { APKGLogger } from "../../../infrastructure/logger/APKGLogger";
import { generateId } from "../../../utils/helpers";
import { isImportAbortError, throwIfImportAborted } from "../ImportTaskControl";
import type {
	MediaError,
	MediaFileEntry,
	MediaManifest,
	MediaProcessingResult,
	MediaProcessingStats,
} from "../types";

const UI_YIELD_BATCH_SIZE = 20;

export interface MediaProcessingProgress {
	progress: number;
	message: string;
	totalItems?: number;
	completedItems?: number;
	currentItem?: string;
}

export type MediaProcessingProgressCallback = (progress: MediaProcessingProgress) => void;

/**
 * 媒体文件处理器
 */
export class MediaProcessor {
	private logger: APKGLogger;
	private storage: IMediaStorageAdapter;

	private async yieldToUI(): Promise<void> {
		await Promise.resolve();
		await new Promise<void>((resolve) => {
			if (typeof requestAnimationFrame === "function") {
				requestAnimationFrame(() => resolve());
				return;
			}

			setTimeout(resolve, 0);
		});
	}

	private emitProgress(
		onProgress: MediaProcessingProgressCallback | undefined,
		progress: number,
		message: string,
		extra?: { totalItems?: number; completedItems?: number; currentItem?: string }
	): void {
		onProgress?.({
			progress,
			message,
			totalItems: extra?.totalItems,
			completedItems: extra?.completedItems,
			currentItem: extra?.currentItem,
		});
	}

	private async emitProgressAndYield(
		onProgress: MediaProcessingProgressCallback | undefined,
		progress: number,
		message: string,
		extra?: { totalItems?: number; completedItems?: number; currentItem?: string }
	): Promise<void> {
		this.emitProgress(onProgress, progress, message, extra);
		await this.yieldToUI();
	}

	private async maybeYieldDuringLoop(index: number, total: number): Promise<void> {
		if (index <= 0 || index >= total) {
			return;
		}

		if (index % UI_YIELD_BATCH_SIZE === 0) {
			await this.yieldToUI();
		}
	}

	constructor(storage: IMediaStorageAdapter) {
		this.logger = new APKGLogger({ prefix: "[MediaProcessor]" });
		this.storage = storage;
	}

	/**
	 * 处理媒体文件
	 *
	 * @param mediaMap - 媒体文件映射 (文件名 → 二进制数据)
	 * @param deckName - 牌组名称
	 * @returns 处理结果
	 */
	async process(
		mediaMap: Map<string, Uint8Array>,
		deckName: string,
		onProgress?: MediaProcessingProgressCallback,
		options?: { signal?: AbortSignal }
	): Promise<MediaProcessingResult> {
		this.logger.info(`开始处理 ${mediaMap.size} 个媒体文件`);

		const errors: MediaError[] = [];
		const savedFiles = new Map<string, string>();
		const entries: MediaFileEntry[] = [];
		const mediaEntries = Array.from(mediaMap.entries());

		let savedCount = 0;
		let skippedCount = 0;
		let failedCount = 0;
		let totalSize = 0;

		try {
			throwIfImportAborted(options?.signal);
			await this.emitProgressAndYield(onProgress, 5, "正在创建媒体目录...");
			const basePath = await this.storage.createDeckMediaFolder(deckName);
			this.logger.debug(`媒体文件夹创建: ${basePath}`);

			for (let index = 0; index < mediaEntries.length; index++) {
				throwIfImportAborted(options?.signal);
				const [filename, data] = mediaEntries[index];
				try {
					totalSize += data.length;

					const hash = await this.storage.calculateHash(data);

					const obsidianPath = this.storage.generateObsidianPath(filename, basePath);
					const exists = await this.storage.mediaFileExists(obsidianPath);

					if (exists) {
						this.logger.debug(`文件已存在，跳过: ${filename}`);
						savedFiles.set(filename, obsidianPath);
						skippedCount++;
					} else {
						throwIfImportAborted(options?.signal);
						const savedPath = await this.storage.saveMediaFile(filename, data, basePath);
						savedFiles.set(filename, savedPath);

						const entry: MediaFileEntry = {
							id: generateId(),
							originalName: filename,
							savedPath,
							type: this.detectMediaType(filename),
							size: data.length,
							hash,
							usedByCards: [],
							created: new Date().toISOString(),
						};
						entries.push(entry);

						savedCount++;
						this.logger.debug(`保存成功: ${filename} → ${savedPath}`);
					}

					this.emitProgress(onProgress, mediaEntries.length === 0 ? 90 : 10 + ((index + 1) / mediaEntries.length) * 80, "正在保存媒体文件...", {
						totalItems: mediaEntries.length,
						completedItems: index + 1,
						currentItem: filename,
					});
					await this.maybeYieldDuringLoop(index + 1, mediaEntries.length);
				} catch (error) {
					failedCount++;
					const errorMsg = `保存失败: ${filename}`;
					this.logger.error(errorMsg, error);
					errors.push({
						file: filename,
						error: error instanceof Error ? error.message : String(error),
						severity: "error",
						code: "SAVE_FAILED",
					});
				}
			}

			throwIfImportAborted(options?.signal);
			await this.emitProgressAndYield(onProgress, 95, "正在保存媒体清单...");
			const manifest: MediaManifest = {
				deckName,
				basePath,
				files: entries,
				created: new Date().toISOString(),
				version: 1,
			};

			throwIfImportAborted(options?.signal);
			await this.storage.saveManifest(manifest);

			const stats: MediaProcessingStats = {
				totalFiles: mediaMap.size,
				savedFiles: savedCount,
				skippedFiles: skippedCount,
				failedFiles: failedCount,
				totalSize,
			};

			this.logger.info(`媒体处理完成: 保存${savedCount}, 跳过${skippedCount}, 失败${failedCount}`);
			await this.emitProgressAndYield(onProgress, 100, "媒体文件处理完成");

			return {
				success: failedCount === 0,
				savedFiles,
				manifest,
				errors,
				stats,
			};
		} catch (error) {
			if (isImportAbortError(error)) {
				throw error;
			}
			this.logger.error("媒体处理失败", error);

			return {
				success: false,
				savedFiles,
				manifest: {
					deckName,
					basePath: "",
					files: [],
					created: new Date().toISOString(),
					version: 1,
				},
				errors: [
					{
						file: "all",
						error: error instanceof Error ? error.message : String(error),
						severity: "error",
						code: "PROCESS_FAILED",
					},
				],
				stats: {
					totalFiles: mediaMap.size,
					savedFiles: savedCount,
					skippedFiles: skippedCount,
					failedFiles: failedCount,
					totalSize,
				},
			};
		}
	}

	/**
	 * 检测媒体类型
	 */
	private detectMediaType(filename: string): "image" | "audio" | "video" {
		const ext = filename.split(".").pop()?.toLowerCase() || "";

		// 图片
		const imageExts = ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"];
		if (imageExts.includes(ext)) return "image";

		// 音频
		const audioExts = ["mp3", "wav", "ogg", "aac", "m4a", "flac"];
		if (audioExts.includes(ext)) return "audio";

		// 视频
		const videoExts = ["mp4", "webm", "ogv", "mov", "avi", "mkv"];
		if (videoExts.includes(ext)) return "video";

		// 默认图片
		return "image";
	}
}
