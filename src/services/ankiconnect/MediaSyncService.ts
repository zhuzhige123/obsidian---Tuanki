import { logger } from "../../utils/logger";
/**
 * 媒体同步服务
 * 负责处理媒体文件的上传、下载和回链生成
 */

import type { App } from "obsidian";
import { TFile } from "obsidian";
import type { AnkiConnectClient } from "./AnkiConnectClient";

export interface MediaSyncResult {
	success: boolean;
	filename: string;
	size: number;
	isBacklink: boolean;
	backlinkUrl?: string;
	error?: string;
}

export interface MediaSyncOptions {
	largeFileThresholdMB: number;
	createBacklinks: boolean;
	supportedTypes: string[];
}

export class MediaSyncService {
	private readonly SUPPORTED_MEDIA_TYPES = [
		// 图片
		"png",
		"jpg",
		"jpeg",
		"gif",
		"svg",
		"webp",
		"bmp",
		// 音频
		"mp3",
		"wav",
		"ogg",
		"m4a",
		"flac",
		// 视频
		"mp4",
		"webm",
		"ogv",
		"mov",
		"avi",
	];

	constructor(
		private app: App,
		private client: AnkiConnectClient,
		private options: MediaSyncOptions
	) {}

	/**
	 * 同步媒体文件到 Anki
	 */
	async syncMediaToAnki(
		content: string,
		vaultPath: string
	): Promise<{ updatedContent: string; results: MediaSyncResult[] }> {
		const mediaReferences = this.extractMediaReferences(content);
		const results: MediaSyncResult[] = [];
		let updatedContent = content;

		for (const ref of mediaReferences) {
			try {
				const result = await this.syncSingleMedia(ref, vaultPath);
				results.push(result);

				// 如果生成了回链，替换内容中的引用
				if (result.isBacklink && result.backlinkUrl) {
					updatedContent = this.replaceMediaReference(updatedContent, ref, result.backlinkUrl);
				}
			} catch (error: unknown) {
				results.push({
					success: false,
					filename: ref.filename,
					size: 0,
					isBacklink: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		return { updatedContent, results };
	}

	/**
	 * 同步单个媒体文件
	 */
	private async syncSingleMedia(ref: MediaReference, vaultPath: string): Promise<MediaSyncResult> {
		// 解析文件路径
		const filePath = this.resolveFilePath(ref.path, vaultPath);
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!file || !(file instanceof TFile)) {
			throw new Error(`文件不存在: ${filePath}`);
		}

		// 检查文件类型
		if (!this.isSupportedMediaType(file.extension)) {
			throw new Error(`不支持的媒体类型: ${file.extension}`);
		}

		const fileSize = file.stat.size;
		const fileSizeMB = fileSize / (1024 * 1024);

		// 检查文件大小
		if (fileSizeMB > this.options.largeFileThresholdMB && this.options.createBacklinks) {
			// 大文件：创建 Obsidian 回链
			const backlinkUrl = this.generateObsidianBacklink(file);

			return {
				success: true,
				filename: file.name,
				size: fileSize,
				isBacklink: true,
				backlinkUrl,
			};
		} else {
			// 小文件：上传到 Anki
			const arrayBuffer = await this.app.vault.readBinary(file);
			const base64Data = this.arrayBufferToBase64(arrayBuffer);

			await this.client.storeMediaFile(file.name, base64Data);

			return {
				success: true,
				filename: file.name,
				size: fileSize,
				isBacklink: false,
			};
		}
	}

	/**
	 * 从 Anki 下载媒体文件
	 */
	async downloadMediaFromAnki(filename: string, targetPath: string): Promise<boolean> {
		try {
			const base64Data = await this.client.retrieveMediaFile(filename);

			if (!base64Data) {
				return false;
			}

			const arrayBuffer = this.base64ToArrayBuffer(base64Data);
			const fullPath = `${targetPath}/${filename}`;

			// 确保目标目录存在
			await this.ensureDirectoryExists(targetPath);

			// 写入文件
			await this.app.vault.adapter.writeBinary(fullPath, arrayBuffer);

			return true;
		} catch (error) {
			logger.error(`下载媒体文件失败: ${filename}`, error);
			return false;
		}
	}

	/**
	 * 提取内容中的媒体引用
	 */
	private extractMediaReferences(content: string): MediaReference[] {
		const references: MediaReference[] = [];

		// Markdown 图片: ![alt](path)
		const mdImages = content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g);
		for (const match of mdImages) {
			references.push({
				type: "markdown",
				alt: match[1],
				path: match[2],
				filename: this.extractFilename(match[2]),
				fullMatch: match[0],
			});
		}

		// Obsidian 嵌入: ![[file]]
		const obsidianEmbeds = content.matchAll(/!\[\[([^\]]+)\]\]/g);
		for (const match of obsidianEmbeds) {
			references.push({
				type: "obsidian",
				path: match[1],
				filename: this.extractFilename(match[1]),
				fullMatch: match[0],
			});
		}

		// HTML img 标签
		const htmlImages = content.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/g);
		for (const match of htmlImages) {
			references.push({
				type: "html",
				path: match[1],
				filename: this.extractFilename(match[1]),
				fullMatch: match[0],
			});
		}

		return references;
	}

	/**
	 * 替换媒体引用为回链
	 */
	private replaceMediaReference(content: string, ref: MediaReference, backlinkUrl: string): string {
		const backlinkHtml = this.createBacklinkHtml(ref.filename, backlinkUrl);
		return content.replace(ref.fullMatch, backlinkHtml);
	}

	/**
	 * 创建回链 HTML
	 */
	private createBacklinkHtml(filename: string, url: string): string {
		return `<a href="${url}" class="obsidian-backlink" style="display: inline-block; padding: 8px 12px; background: #4A5568; color: #E2E8F0; text-decoration: none; border-radius: 4px; font-size: 14px; transition: background 0.2s;">
  <span style="margin-right: 6px;">📎</span>
  <span>${filename}</span>
  <span style="margin-left: 6px; font-size: 12px; opacity: 0.7;">(在 Obsidian 中打开)</span>
</a>`;
	}

	/**
	 * 生成 Obsidian 回链
	 */
	private generateObsidianBacklink(file: TFile, blockId?: string): string {
		// 使用 Obsidian URI 协议
		const vaultName = this.app.vault.getName();
		const encodedPath = encodeURIComponent(file.path);
		const encodedVault = encodeURIComponent(vaultName);

		let url = `obsidian://open?vault=${encodedVault}&file=${encodedPath}`;

		// 🆕 添加块引用支持
		if (blockId) {
			url += blockId; // blockId 应该包含 # 或 ^
		}

		return url;
	}

	/**
	 * 🆕 批量上传媒体文件到 Anki
	 */
	async uploadMediaFilesToAnki(files: TFile[]): Promise<Map<string, boolean>> {
		const results = new Map<string, boolean>();

		logger.debug(`[MediaSyncService] 开始批量上传 ${files.length} 个文件`);

		for (const file of files) {
			try {
				const arrayBuffer = await this.app.vault.readBinary(file);
				const base64Data = this.arrayBufferToBase64(arrayBuffer);

				await this.client.storeMediaFile(file.name, base64Data);
				results.set(file.name, true);

				logger.debug(`[MediaSyncService] ✅ 上传成功: ${file.name}`);
			} catch (error) {
				logger.error(`[MediaSyncService] ❌ 上传失败: ${file.name}`, error);
				results.set(file.name, false);
			}
		}

		const successCount = Array.from(results.values()).filter((_v) => _v).length;
		logger.debug(`[MediaSyncService] 批量上传完成: ${successCount}/${files.length}`);

		return results;
	}

	/**
	 * 🆕 单个文件上传到 Anki
	 */
	async uploadSingleMediaToAnki(file: TFile): Promise<boolean> {
		try {
			const arrayBuffer = await this.app.vault.readBinary(file);
			const base64Data = this.arrayBufferToBase64(arrayBuffer);

			await this.client.storeMediaFile(file.name, base64Data);
			logger.debug(`[MediaSyncService] ✅ 上传成功: ${file.name}`);

			return true;
		} catch (error) {
			logger.error(`[MediaSyncService] ❌ 上传失败: ${file.name}`, error);
			return false;
		}
	}

	/**
	 * 解析文件路径
	 */
	private resolveFilePath(refPath: string, contextPath: string): string {
		// 移除 Obsidian 链接语法
		let path = refPath.replace(/^\[\[|\]\]$/g, "");

		// 处理别名
		if (path.includes("|")) {
			path = path.split("|")[0];
		}

		// 绝对路径
		if (path.startsWith("/")) {
			return path.slice(1);
		}

		// 相对路径
		if (path.startsWith("./") || path.startsWith("../")) {
			const contextDir = contextPath.split("/").slice(0, -1).join("/");
			return this.resolvePath(contextDir, path);
		}

		// 尝试在 vault 中查找文件
		const file = this.app.metadataCache.getFirstLinkpathDest(path, contextPath);
		return file ? file.path : path;
	}

	/**
	 * 解析相对路径
	 */
	private resolvePath(base: string, relative: string): string {
		const parts = base.split("/");
		const relativeParts = relative.split("/");

		for (const part of relativeParts) {
			if (part === ".") {
				continue;
			} else if (part === "..") {
				parts.pop();
			} else {
				parts.push(part);
			}
		}

		return parts.join("/");
	}

	/**
	 * 提取文件名
	 */
	private extractFilename(path: string): string {
		const cleaned = path.replace(/^\[\[|\]\]$/g, "").split("|")[0];
		return cleaned.split("/").pop() || cleaned;
	}

	/**
	 * 检查是否为支持的媒体类型
	 */
	private isSupportedMediaType(extension: string): boolean {
		const ext = extension.toLowerCase();
		return this.SUPPORTED_MEDIA_TYPES.includes(ext) || this.options.supportedTypes.includes(ext);
	}

	/**
	 * ArrayBuffer 转 Base64
	 */
	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = "";
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	/**
	 * Base64 转 ArrayBuffer
	 */
	private base64ToArrayBuffer(base64: string): ArrayBuffer {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}

	/**
	 * 确保目录存在
	 */
	private async ensureDirectoryExists(path: string): Promise<void> {
		const exists = await this.app.vault.adapter.exists(path);
		if (!exists) {
			await this.app.vault.createFolder(path);
		}
	}

	/**
	 * 更新配置
	 */
	updateOptions(options: Partial<MediaSyncOptions>): void {
		Object.assign(this.options, options);
	}
}

/**
 * 媒体引用信息
 */
interface MediaReference {
	type: "markdown" | "obsidian" | "html";
	path: string;
	filename: string;
	fullMatch: string;
	alt?: string;
}
