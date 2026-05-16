import { logger } from "../../utils/logger";
/**
 * 全局清理扫描器 v2.0
 *
 * 职责：
 * - 扫描所有Markdown文件
 * - 检测孤立的块链接和UUID
 * - 批量清理
 * - 提供进度反馈和清理详情
 * - 支持取消操作
 */

import { App, TFile, Vault } from "obsidian";
import { BlockLinkCleanupService } from "./BlockLinkCleanupService";
import { OrphanedLinkDetector } from "./OrphanedLinkDetector";
import { CleanupDetail, GlobalScanResult, ScanProgress } from "./types";
import { listVaultMarkdownFiles } from "../../utils/vault-file-list";

export class GlobalCleanupScanner {
	private cleanupService: BlockLinkCleanupService;
	private detector: OrphanedLinkDetector;
	private vault: Vault;
	private app: App;
	private isCancelled = false;
	private progressCallback?: (progress: ScanProgress) => void;
	private detailCallback?: (detail: CleanupDetail) => void;

	private readonly BATCH_SIZE = 50; // 每批处理50个文件
	private readonly TIME_SLICE = 50; // 每50ms让出主线程

	constructor(
		cleanupService: BlockLinkCleanupService,
		detector: OrphanedLinkDetector,
		vault: Vault,
		app: App
	) {
		this.cleanupService = cleanupService;
		this.detector = detector;
		this.vault = vault;
		this.app = app;
	}

	/**
	 * 扫描并清理（核心方法）
	 */
	async scanAndCleanup(onProgress?: (progress: ScanProgress) => void): Promise<GlobalScanResult> {
		// 初始化结果
		const result: GlobalScanResult = {
			totalFiles: 0,
			filesWithOrphans: 0,
			totalOrphans: 0,
			cleanedOrphans: 0,
			errors: [],
			duration: 0,
		};

		const startTime = Date.now();
		this.isCancelled = false;

		try {
			// 阶段1: 获取待扫描文件（智能过滤）
			logger.debug("[GlobalScanner] 🔍 开始智能过滤文件...");
			const files = await this.getFilesToScan();
			result.totalFiles = files.length;

			logger.debug(`[GlobalScanner] 📂 找到 ${files.length} 个候选文件`);

			if (files.length === 0) {
				result.duration = Date.now() - startTime;
				return result;
			}

			// 阶段2: 分批处理
			for (let i = 0; i < files.length; i += this.BATCH_SIZE) {
				// 检查取消标志
				if (this.isCancelled) {
					logger.debug("[GlobalScanner] ⚠️ 扫描已取消");
					break;
				}

				const batch = files.slice(i, i + this.BATCH_SIZE);

				// 处理批次
				for (let j = 0; j < batch.length; j++) {
					const file = batch[j];
					const fileIndex = i + j;

					try {
						// 检测孤立引用
						const orphans = await this.detector.detectInFile(file);

						if (orphans.length > 0) {
							result.filesWithOrphans++;
							result.totalOrphans += orphans.length;

							// 清理文件
							const cleanupResult = await this.cleanupService.cleanupFile(file);
							if (cleanupResult.success && cleanupResult.cleanedItems.length > 0) {
								result.cleanedOrphans += cleanupResult.cleanedItems.length;

								// 发送清理成功详情
								this.emitDetail({
									filePath: file.path,
									status: "success",
									message: `清理 ${cleanupResult.cleanedItems.length} 项`,
								});
							} else if (cleanupResult.cleanedItems.length === 0) {
								// 检测到但未清理（可能是保护中）
								this.emitDetail({
									filePath: file.path,
									status: "skipped",
									message: "卡片仍存在或在保护期内",
								});
							}
						}
					} catch (error) {
						// 记录错误但继续处理
						result.errors.push({
							filePath: file.path,
							error: error instanceof Error ? error.message : String(error),
						});
						logger.error("[GlobalScanner] 处理文件失败:", file.path, error);

						// 发送错误详情
						this.emitDetail({
							filePath: file.path,
							status: "error",
							message: error instanceof Error ? error.message : String(error),
						});
					}

					// 更新进度
					if (onProgress) {
						onProgress({
							phase: "cleaning",
							currentFile: file.path,
							processedFiles: fileIndex + 1,
							totalFiles: files.length,
							cleanedCount: result.cleanedOrphans,
							detectedCount: result.totalOrphans,
							percentage: Math.round(((fileIndex + 1) / files.length) * 100),
						});
					}
				}

				// 让出主线程
				await this.yieldMainThread();
			}

			// 完成
			if (onProgress) {
				onProgress({
					phase: "completed",
					currentFile: "",
					processedFiles: files.length,
					totalFiles: files.length,
					cleanedCount: result.cleanedOrphans,
					percentage: 100,
				});
			}
		} catch (error) {
			logger.error("[GlobalScanner] 扫描失败:", error);
			result.errors.push({
				filePath: "",
				error: error instanceof Error ? error.message : String(error),
			});
		}

		result.duration = Date.now() - startTime;

		logger.debug("[GlobalScanner] ✅ 扫描完成:", {
			totalFiles: result.totalFiles,
			filesWithOrphans: result.filesWithOrphans,
			totalOrphans: result.totalOrphans,
			cleanedOrphans: result.cleanedOrphans,
			errors: result.errors.length,
			duration: `${(result.duration / 1000).toFixed(1)}s`,
		});

		return result;
	}

	/**
	 * 设置进度监听器
	 */
	public onProgress(callback: (progress: ScanProgress) => void): () => void {
		this.progressCallback = callback;
		// 返回取消监听的函数
		return () => {
			this.progressCallback = undefined;
		};
	}

	/**
	 * 设置详情监听器
	 */
	public onDetail(callback: (detail: CleanupDetail) => void): () => void {
		this.detailCallback = callback;
		return () => {
			this.detailCallback = undefined;
		};
	}

	/**
	 * 发送清理详情
	 */
	private emitDetail(detail: CleanupDetail): void {
		if (this.detailCallback) {
			this.detailCallback(detail);
		}
	}

	/**
	 * 执行清理操作
	 */
	public async performCleanup(): Promise<GlobalScanResult> {
		return this.scanAndCleanup(this.progressCallback);
	}

	/**
	 * 取消扫描
	 */
	public cancel(): void {
		this.isCancelled = true;
		logger.debug("[GlobalScanner] 🛑 取消扫描");
	}

	/**
	 * 获取待扫描文件（智能过滤）
	 *  v2.1: 修复元数据文件遗漏问题
	 *
	 * 问题：部分卡片文件可能没有 ^we-xxx 块链接，
	 * 之前的逻辑只扫描有块链接的文件，导致部分元数据文件被遗漏
	 */
	private async getFilesToScan(): Promise<TFile[]> {
		// 步骤1: 获取所有Markdown文件
		const allFiles = listVaultMarkdownFiles(this.vault);

		logger.debug(`[GlobalScanner] 总文件数: ${allFiles.length}`);

		//  修复：直接扫描所有文件，检查是否包含Weave元数据
		// 不再依赖块链接作为前置过滤条件
		const candidateFiles: TFile[] = [];

		// 组合正则：匹配任意Weave元数据
		// - ^we- 块链接（快捷键创建）
		// - <!-- tk-xxx --> UUID注释（批量解析）
		// - weave-uuid: YAML字段（单文件单卡片）
		// - uuid: tk- UUID（包括%%注释块内的格式）
		const weaveMetadataPattern =
			/(\^we-[a-z0-9]{6})|(<!--\s*tk-[a-z0-9]{12}\s*-->)|(weave-uuid:\s*tk-)|(uuid:\s*tk-[a-z0-9]{12})/i;

		for (const file of allFiles) {
			try {
				const content = await this.vault.cachedRead(file);
				if (weaveMetadataPattern.test(content)) {
					candidateFiles.push(file);
				}
			} catch (error) {
				logger.warn("[GlobalScanner] 读取文件失败:", file.path, error);
			}
		}

		logger.debug(
			`[GlobalScanner] 发现 ${candidateFiles.length}/${allFiles.length} 个文件包含Weave元数据`
		);

		return candidateFiles;
	}

	/**
	 * 让出主线程（避免阻塞UI）
	 */
	private yieldMainThread(): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, 10));
	}
}
