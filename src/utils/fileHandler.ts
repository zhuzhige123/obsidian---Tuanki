import type { App } from "obsidian";
import { TFile } from "obsidian";
import type { WeavePlugin } from "../main";
import { WeaveAttachmentService } from "../services/media/WeaveAttachmentService";
import { logger } from "../utils/logger";
import { vaultStorage } from "../utils/vault-local-storage";
import { readUnknownProperty } from "./dynamic-access";
import {
	DEFAULT_FILE_CONFIG,
	type FileValidationConfig,
	generateSecureFileName,
	validateFile,
} from "./security";
import { isRecord, parseJsonUnknown, readNumber, readString } from "./typed-json";

/**
 * 安全的文件处理工具
 */

function getObsidianAppFromWindow(): App | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}
	const app = readUnknownProperty(window, "app");
	if (readUnknownProperty(app, "vault") === undefined) {
		return undefined;
	}
	return app as App;
}

/**
 * 文件处理结果
 */
export interface FileHandlerResult {
	success: boolean;
	error?: string;
	filePath?: string;
	fileName?: string;
}

/**
 * 安全的文件处理器类
 */
export class SecureFileHandler {
	private config: FileValidationConfig;

	constructor(config: FileValidationConfig = DEFAULT_FILE_CONFIG) {
		this.config = config;
	}

	/**
	 * 处理文件上传（包含安全验证）
	 */
	async handleFileUpload(file: File): Promise<FileHandlerResult> {
		try {
			// 1. 文件验证
			const validation = validateFile(file, this.config);
			if (!validation.valid) {
				return {
					success: false,
					error: validation.error,
				};
			}

			// 2. 生成安全的文件名
			const secureFileName = validation.sanitizedName || generateSecureFileName(file.name);

			// 3. 保存文件
			const filePath = await this.saveFile(file, secureFileName);

			return {
				success: true,
				filePath,
				fileName: secureFileName,
			};
		} catch (error) {
			logger.error("文件处理失败:", error);
			return {
				success: false,
				error: `文件处理失败: ${error instanceof Error ? error.message : "未知错误"}`,
			};
		}
	}

	/**
	 * 安全地保存文件
	 */
	private async saveFile(file: File, fileName: string): Promise<string> {
		try {
			// 方法 1: Obsidian 插件环境
			if (getObsidianAppFromWindow()) {
				return await this.saveToObsidianVault(file, fileName);
			}

			// 方法 2: Web 环境备用方案
			return await this.saveToLocalStorage(file, fileName);
		} catch (error) {
			logger.error("保存文件失败:", error);
			throw new Error("文件保存失败");
		}
	}

	/**
	 * 保存到 Obsidian 库
	 */
	private async saveToObsidianVault(file: File, fileName: string): Promise<string> {
		const app = getObsidianAppFromWindow();
		if (!app) {
			throw new Error("Obsidian vault is unavailable");
		}

		const attachmentService = new WeaveAttachmentService(app);
		const saved = await attachmentService.saveFile(file, { fileName });
		logger.debug("文件已保存到 Obsidian 库:", saved.path);
		return saved.path;
	}

	/**
	 * 保存到本地存储（Web环境备用方案）
	 */
	private async saveToLocalStorage(file: File, fileName: string): Promise<string> {
		const arrayBuffer = await file.arrayBuffer();
		const blob = new Blob([arrayBuffer], { type: file.type });
		const url = URL.createObjectURL(blob);

		// 保存文件信息到 localStorage
		const fileInfo = {
			fileName,
			url,
			type: file.type,
			size: file.size,
			timestamp: Date.now(),
		};

		const storageKey = `attachment_${fileName}`;
		vaultStorage.setItem(storageKey, JSON.stringify(fileInfo));

		logger.debug("文件已保存 (Web模式):", fileName);
		return fileName;
	}

	/**
	 * 获取文件URL
	 */
	getFileUrl(fileName: string): string {
		// Obsidian 环境
		const app = getObsidianAppFromWindow();
		if (app) {
			const vault = app.vault;
			try {
				const file = vault.getAbstractFileByPath(fileName);
				if (file instanceof TFile) {
					return vault.getResourcePath(file);
				}
			} catch (e) {
				logger.warn("无法获取 Obsidian 文件路径:", fileName, e);
			}
		}

		// Web 环境 - 从 localStorage 获取
		try {
			const stored = vaultStorage.getItem(`attachment_${fileName}`);
			if (stored) {
				const parsed = parseJsonUnknown(stored);
				if (isRecord(parsed)) {
					return readString(parsed, "url") || fileName;
				}
			}
		} catch (e) {
			logger.warn("无法从 localStorage 获取文件:", fileName, e);
		}

		// 降级：返回原始文件名
		return fileName;
	}

	/**
	 * 批量处理文件
	 */
	async handleMultipleFiles(files: FileList | File[]): Promise<FileHandlerResult[]> {
		const results: FileHandlerResult[] = [];
		const fileArray = Array.from(files);

		for (const file of fileArray) {
			const result = await this.handleFileUpload(file);
			results.push(result);

			// 如果有错误，可以选择是否继续处理其他文件
			if (!result.success) {
				logger.warn(`文件 ${file.name} 处理失败:`, result.error);
			}
		}

		return results;
	}

	/**
	 * 清理临时文件（Web环境）
	 */
	cleanupTempFiles(maxAge: number = 24 * 60 * 60 * 1000): void {
		try {
			const now = Date.now();
			const keysToRemove: string[] = [];

			const attachmentKeys = vaultStorage.getKeysWithPrefix("attachment_");
			for (const key of attachmentKeys) {
				if (key) {
					try {
						const stored = vaultStorage.getItem(key);
						if (stored) {
							const parsed = parseJsonUnknown(stored);
							if (isRecord(parsed)) {
								const timestamp = readNumber(parsed, "timestamp") ?? 0;
								const url = readString(parsed, "url");
								if (now - timestamp > maxAge) {
									keysToRemove.push(key);
									if (url?.startsWith("blob:")) {
										URL.revokeObjectURL(url);
									}
								}
							}
						}
					} catch {
						// 解析失败的项目也应该被清理
						keysToRemove.push(key);
					}
				}
			}

			keysToRemove.forEach((key) => vaultStorage.removeItem(key));

			if (keysToRemove.length > 0) {
				logger.debug(`清理了 ${keysToRemove.length} 个临时文件`);
			}
		} catch (error) {
			logger.warn("清理临时文件失败:", error);
		}
	}
}

/**
 * 默认的文件处理器实例
 */
export const defaultFileHandler = new SecureFileHandler();

/**
 * CodeMirror 拖放功能 Hook
 */
export function useFileDrop(options: { onFileUrl: (url: string) => void; plugin: WeavePlugin }) {
	const { onFileUrl } = options;

	const handleDragOver = (event: DragEvent) => {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "copy";
		}
	};

	const handleDrop = async (event: DragEvent) => {
		event.preventDefault();
		if (!event.dataTransfer) return;
		const files = event.dataTransfer.files;
		if (files.length > 0) {
			const handler = new SecureFileHandler();
			const results = await handler.handleMultipleFiles(files);

			for (const result of results) {
				if (result.success && result.filePath) {
					const linkText = `![[${result.filePath}]]`;
					onFileUrl(linkText);
				} else {
					logger.error("File drop error:", result.error);
				}
			}
		}
	};

	return { handleDrop, handleDragOver };
}
