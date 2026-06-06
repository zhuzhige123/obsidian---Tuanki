import { logger } from "../utils/logger";
/**
 * 文件扫描器 - 用于批量获取和读取Markdown文件
 */

import { TFile } from "obsidian";
import type { WeavePlugin } from "../main";
import { listVaultMarkdownFiles } from "./vault-file-list";

export interface ScanOptions {
	/** 包含的文件路径模式 */
	includePatterns?: string[];
	/** 排除的文件路径模式 */
	excludePatterns?: string[];
	/** 最大文件数量 */
	maxFiles?: number;
	/** 是否递归扫描子文件夹 */
	recursive?: boolean;
	/** 文件大小限制（字节） */
	maxFileSize?: number;
}

export interface FileInfo {
	/** 文件对象 */
	file: TFile;
	/** 文件路径 */
	path: string;
	/** 文件名 */
	name: string;
	/** 文件大小 */
	size: number;
	/** 最后修改时间 */
	mtime: number;
	/** 文件内容（如果已读取） */
	content?: string;
}

export interface ScanResult {
	/** 扫描到的文件列表 */
	files: FileInfo[];
	/** 扫描统计 */
	stats: {
		totalFiles: number;
		totalSize: number;
		scanTime: number;
	};
	/** 错误信息 */
	errors: string[];
}

export class FileScanner {
	private plugin: WeavePlugin;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	/**
	 * 扫描Markdown文件
	 */
	async scanMarkdownFiles(options: ScanOptions = {}): Promise<ScanResult> {
		const startTime = Date.now();
		const result: ScanResult = {
			files: [],
			stats: {
				totalFiles: 0,
				totalSize: 0,
				scanTime: 0,
			},
			errors: [],
		};

		try {
			// 获取所有Markdown文件
			const allFiles = listVaultMarkdownFiles(this.plugin.app);

			// 应用过滤条件
			const filteredFiles = this.filterFiles(allFiles, options);

			// 限制文件数量（默认50个文件）
			const maxFiles = options.maxFiles || 50;
			const selectedFiles = filteredFiles.slice(0, maxFiles);

			// 转换为FileInfo格式
			for (const file of selectedFiles) {
				try {
					const fileInfo: FileInfo = {
						file,
						path: file.path,
						name: file.name,
						size: file.stat.size,
						mtime: file.stat.mtime,
					};

					// 检查文件大小限制
					if (options.maxFileSize && fileInfo.size > options.maxFileSize) {
						result.errors.push(
							`文件 ${file.path} 超过大小限制 (${fileInfo.size} > ${options.maxFileSize})`
						);
						continue;
					}

					result.files.push(fileInfo);
					result.stats.totalSize += fileInfo.size;
				} catch (error) {
					result.errors.push(
						`处理文件 ${file.path} 时出错: ${error instanceof Error ? error.message : "Unknown error"}`
					);
				}
			}

			result.stats.totalFiles = result.files.length;
			result.stats.scanTime = Date.now() - startTime;

			logger.debug(
				`📁 [FileScanner] 扫描完成: ${result.stats.totalFiles} 个文件, ${result.stats.totalSize} 字节, 耗时 ${result.stats.scanTime}ms`
			);
		} catch (error) {
			result.errors.push(
				`扫描过程中出错: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}

		return result;
	}

	/**
	 * 批量读取文件内容
	 */
	async readFileContents(fileInfos: FileInfo[]): Promise<FileInfo[]> {
		const results: FileInfo[] = [];

		for (const fileInfo of fileInfos) {
			try {
				const content = await this.plugin.app.vault.read(fileInfo.file);
				results.push({
					...fileInfo,
					content,
				});
			} catch (error) {
				logger.error(`读取文件 ${fileInfo.path} 失败:`, error);
				// 即使读取失败也保留文件信息，但不包含内容
				results.push(fileInfo);
			}
		}

		return results;
	}

	/**
	 * 根据选项过滤文件
	 */
	private filterFiles(files: TFile[], options: ScanOptions): TFile[] {
		let filtered = files;

		// 应用包含模式
		if (options.includePatterns && options.includePatterns.length > 0) {
			filtered = filtered.filter((file) =>
				options.includePatterns?.some((pattern) => this.matchPattern(file.path, pattern))
			);
		}

		// 应用排除模式
		if (options.excludePatterns && options.excludePatterns.length > 0) {
			filtered = filtered.filter(
				(file) => !options.excludePatterns?.some((pattern) => this.matchPattern(file.path, pattern))
			);
		}

		return filtered;
	}

	/**
	 * 简单的模式匹配（支持通配符 * 和 ?）
	 */
	private matchPattern(text: string, pattern: string): boolean {
		// 转换通配符为正则表达式
		const regexPattern = pattern
			.replace(/[.+^${}()|[\]\\]/g, "\\$&") // 转义特殊字符
			.replace(/\*/g, ".*") // * 匹配任意字符
			.replace(/\?/g, "."); // ? 匹配单个字符

		const regex = new RegExp(`^${regexPattern}$`, "i");
		return regex.test(text);
	}

	/**
	 * 获取文件夹中的所有Markdown文件
	 */
	async scanFolder(folderPath: string, options: ScanOptions = {}): Promise<ScanResult> {
		const scanOptions: ScanOptions = {
			...options,
			includePatterns: [`${folderPath}/**/*.md`, ...(options.includePatterns || [])],
		};

		return this.scanMarkdownFiles(scanOptions);
	}

	/**
	 * 根据标签扫描文件
	 */
	async scanByTags(tags: string[], options: ScanOptions = {}): Promise<ScanResult> {
		const result = await this.scanMarkdownFiles(options);

		// 读取文件内容以检查标签
		const filesWithContent = await this.readFileContents(result.files);

		// 过滤包含指定标签的文件
		const filteredFiles = filesWithContent.filter((_fileInfo) => {
			if (!_fileInfo.content) return false;

			// 简单的标签检测（可以根据需要改进）
			return tags.some(
				(tag) =>
					_fileInfo.content?.includes(`#${tag}`) ||
					_fileInfo.content?.includes(`tag: ${tag}`) ||
					_fileInfo.content?.includes(`tags: ${tag}`)
			);
		});

		return {
			...result,
			files: filteredFiles,
			stats: {
				...result.stats,
				totalFiles: filteredFiles.length,
			},
		};
	}

	/**
	 * 获取最近修改的文件
	 */
	async scanRecentFiles(days = 7, options: ScanOptions = {}): Promise<ScanResult> {
		const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

		const result = await this.scanMarkdownFiles(options);

		// 过滤最近修改的文件
		const recentFiles = result.files.filter((fileInfo) => fileInfo.mtime > cutoffTime);

		return {
			...result,
			files: recentFiles,
			stats: {
				...result.stats,
				totalFiles: recentFiles.length,
			},
		};
	}
}
