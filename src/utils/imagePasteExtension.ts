import { logger } from "../utils/logger";
/**
 * CodeMirror 6 媒体文件粘贴扩展
 *
 * 功能：
 * 1. 支持从剪贴板粘贴截图和图片
 * 2. 支持拖拽图片、音频、视频文件到编辑器
 * 3. 自动保存到Obsidian附件目录
 * 4. 生成符合Obsidian规范的媒体链接语法
 */

import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Notice } from "obsidian";
import type { WeavePlugin } from "../main";
import { WeaveAttachmentService } from "../services/media/WeaveAttachmentService";

/**
 * 媒体文件处理结果接口
 */
export interface MediaProcessResult {
	success: boolean;
	filePath?: string;
	fileName?: string;
	fileType?: "image" | "audio" | "video" | "document";
	error?: string;
}

/**
 * 媒体文件粘贴配置接口
 */
export interface MediaPasteConfig {
	/** 是否启用媒体文件粘贴功能 */
	enabled?: boolean;
	/** 是否启用拖拽功能 */
	enableDrop?: boolean;
	/** 文件大小限制（MB） */
	maxSizeMB?: number;
	/** 支持的图片格式 */
	supportedImageFormats?: string[];
	/** 支持的音频格式 */
	supportedAudioFormats?: string[];
	/** 支持的视频格式 */
	supportedVideoFormats?: string[];
	/** 支持的文档格式 */
	supportedDocumentFormats?: string[];
	/** 是否使用Obsidian Wiki链接格式 */
	useWikiLinks?: boolean;
	/** 自定义附件文件夹路径 */
	attachmentFolder?: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<MediaPasteConfig> = {
	enabled: true,
	enableDrop: true,
	maxSizeMB: 50, // 增加到50MB以支持视频文件
	supportedImageFormats: [
		"image/png",
		"image/jpeg",
		"image/jpg",
		"image/gif",
		"image/webp",
		"image/svg+xml",
		"image/bmp",
		"image/tiff",
	],
	supportedAudioFormats: [
		"audio/mpeg",
		"audio/mp3",
		"audio/wav",
		"audio/ogg",
		"audio/aac",
		"audio/flac",
		"audio/m4a",
		"audio/wma",
	],
	supportedVideoFormats: [
		"video/mp4",
		"video/mpeg",
		"video/quicktime",
		"video/x-msvideo",
		"video/webm",
		"video/ogg",
		"video/3gpp",
		"video/x-flv",
	],
	supportedDocumentFormats: [
		"application/pdf",
		"text/plain",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	],
	useWikiLinks: true,
	attachmentFolder: "attachments",
};

/**
 * 媒体文件粘贴扩展类
 */
export class MediaPasteExtension {
	private plugin: WeavePlugin;
	private config: Required<MediaPasteConfig>;
	private attachmentService: WeaveAttachmentService;

	constructor(plugin: WeavePlugin, config: Partial<MediaPasteConfig> = {}) {
		this.plugin = plugin;
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.attachmentService =
			plugin.weaveAttachmentService ??
			new WeaveAttachmentService(plugin.app, plugin.settings?.weaveParentFolder);
	}

	/**
	 * 创建扩展
	 */
	create(): Extension {
		if (!this.config.enabled) {
			logger.debug("🚫 媒体文件粘贴扩展已禁用");
			return [];
		}

		logger.debug("✅ 媒体文件粘贴扩展已创建，配置:", this.config);

		return EditorView.domEventHandlers({
			paste: (event, view) => {
				logger.debug("📋 粘贴事件触发:", event);
				return this.handlePaste(event, view);
			},
			drop: this.config.enableDrop
				? (event, view) => {
						logger.debug("📁 拖拽事件触发:", event);
						return this.handleDrop(event, view);
				  }
				: undefined,
			dragover: this.config.enableDrop
				? (event) => {
						logger.debug("🔄 拖拽悬停事件触发:", event);
						this.handleDragOver(event);
						return false;
				  }
				: undefined,
		});
	}

	/**
	 * 处理粘贴事件
	 */
	private handlePaste(event: ClipboardEvent, view: EditorView): boolean {
		logger.debug("🔍 开始处理粘贴事件");

		const clipboardData = event.clipboardData;
		if (!clipboardData) {
			logger.debug("❌ 没有剪贴板数据");
			return false;
		}

		// 检查是否有媒体文件数据
		const items = Array.from(clipboardData.items);
		logger.debug(
			"📋 剪贴板项目:",
			items.map((item) => ({ kind: item.kind, type: item.type }))
		);

		const mediaItems = items.filter(
			(item) => item.kind === "file" && this.isSupportedMediaType(item.type)
		);

		if (mediaItems.length === 0) {
			logger.debug("❌ 没有找到支持的媒体格式");
			return false;
		}

		logger.debug("✅ 找到媒体文件项目:", mediaItems.length, "个");

		// 阻止默认粘贴行为
		event.preventDefault();

		// 异步处理媒体文件（不阻塞事件处理）
		void this.processMediaItemsAsync(mediaItems, view);

		return true;
	}

	/**
	 * 异步处理媒体文件列表
	 */
	private async processMediaItemsAsync(
		mediaItems: DataTransferItem[],
		view: EditorView
	): Promise<void> {
		for (const item of mediaItems) {
			const file = item.getAsFile();
			if (file) {
				await this.processMediaFile(file, view);
			}
		}
	}

	/**
	 * 处理拖拽事件
	 */
	private handleDrop(event: DragEvent, view: EditorView): boolean {
		logger.debug("🔍 开始处理拖拽事件");

		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) {
			logger.debug("❌ 没有拖拽文件");
			return false;
		}

		// 筛选媒体文件
		const mediaFiles = Array.from(files).filter((file) => this.isSupportedMediaType(file.type));

		logger.debug(
			"📁 拖拽文件:",
			Array.from(files).map((f) => ({ name: f.name, type: f.type }))
		);
		logger.debug(
			"🎵 媒体文件:",
			mediaFiles.map((f) => ({ name: f.name, type: f.type, size: f.size }))
		);

		if (mediaFiles.length === 0) {
			logger.debug("❌ 没有找到支持的媒体文件");
			return false;
		}

		// 阻止默认行为
		event.preventDefault();

		// 异步处理媒体文件
		void this.processFilesAsync(mediaFiles, view);

		return true;
	}

	/**
	 * 异步处理文件列表
	 */
	private async processFilesAsync(files: File[], view: EditorView): Promise<void> {
		for (const file of files) {
			await this.processMediaFile(file, view);
		}
	}

	/**
	 * 处理拖拽悬停
	 */
	private handleDragOver(event: DragEvent): void {
		logger.debug("🔄 拖拽悬停事件");
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "copy";
		}
	}

	/**
	 * 检查是否为支持的媒体类型
	 */
	private isSupportedMediaType(mimeType: string): boolean {
		return (
			this.config.supportedImageFormats.includes(mimeType) ||
			this.config.supportedAudioFormats.includes(mimeType) ||
			this.config.supportedVideoFormats.includes(mimeType) ||
			this.config.supportedDocumentFormats.includes(mimeType)
		);
	}

	/**
	 * 获取文件类型
	 */
	private getFileType(mimeType: string): "image" | "audio" | "video" | "document" {
		if (this.config.supportedImageFormats.includes(mimeType)) {
			return "image";
		} else if (this.config.supportedAudioFormats.includes(mimeType)) {
			return "audio";
		} else if (this.config.supportedVideoFormats.includes(mimeType)) {
			return "video";
		} else {
			return "document";
		}
	}

	/**
	 * 处理单个媒体文件
	 */
	private async processMediaFile(file: File, view: EditorView): Promise<void> {
		try {
			// 文件大小检查
			if (file.size > this.config.maxSizeMB * 1024 * 1024) {
				this.showError(`文件过大，最大支持 ${this.config.maxSizeMB}MB`);
				return;
			}

			// 获取文件类型
			const fileType = this.getFileType(file.type);
			logger.debug("📁 处理媒体文件:", {
				name: file.name,
				type: file.type,
				fileType,
				size: file.size,
			});

			// 显示加载状态
			const loadingText = this.getLoadingText(fileType);
			const pos = view.state.selection.main.head;

			view.dispatch({
				changes: { from: pos, insert: loadingText },
				selection: { anchor: pos + loadingText.length },
			});

			// 保存媒体文件
			logger.debug("🔄 开始保存媒体文件到vault...");
			const result = await this.saveMediaToVault(file);
			logger.debug("💾 媒体文件保存结果:", result);

			if (result.success && result.filePath && result.fileName) {
				// 生成媒体链接
				const mediaLink = this.generateMediaLink(
					result.fileName,
					result.filePath,
					result.fileType || fileType
				);
				logger.debug("🔗 生成媒体链接:", mediaLink);

				// 替换加载文本
				view.dispatch({
					changes: {
						from: pos,
						to: pos + loadingText.length,
						insert: mediaLink,
					},
					selection: { anchor: pos + mediaLink.length },
				});

				logger.debug("✅ 媒体文件粘贴成功:", result.filePath);
			} else {
				// 移除加载文本并显示错误
				view.dispatch({
					changes: {
						from: pos,
						to: pos + loadingText.length,
						insert: "",
					},
				});

				this.showError(result.error || "媒体文件保存失败");
			}
		} catch (error) {
			logger.error("媒体文件处理失败:", error);
			this.showError("媒体文件处理失败，请重试");
		}
	}

	/**
	 * 获取加载文本
	 */
	private getLoadingText(fileType: "image" | "audio" | "video" | "document"): string {
		switch (fileType) {
			case "image":
				return "![上传中...](uploading)";
			case "audio":
				return "🎵 音频上传中...";
			case "video":
				return "🎬 视频上传中...";
			case "document":
				return "📄 文档上传中...";
			default:
				return "📁 文件上传中...";
		}
	}

	/**
	 * 保存媒体文件到 Obsidian 库（遵循官方附件策略）
	 */
	private async saveMediaToVault(file: File): Promise<MediaProcessResult> {
		try {
			const fileType = this.getFileType(file.type);
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const extension =
				this.getFileExtension(file.name) || this.getExtensionFromMimeType(file.type);
			const prefix = this.getFilePrefix(fileType);
			const fileName = `${prefix}-${timestamp}${extension}`;

			const saved = await this.attachmentService.saveFile(file, {
				fileName,
				sourcePath: this.plugin.app.workspace.getActiveFile()?.path,
			});

			return {
				success: true,
				filePath: saved.path,
				fileName: saved.path.split("/").pop() || fileName,
				fileType,
			};
		} catch (error) {
			logger.error("保存图片失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "未知错误",
			};
		}
	}

	/**
	 * 获取文件前缀
	 */
	private getFilePrefix(fileType: "image" | "audio" | "video" | "document"): string {
		switch (fileType) {
			case "image":
				return "image";
			case "audio":
				return "audio";
			case "video":
				return "video";
			case "document":
				return "document";
			default:
				return "file";
		}
	}

	/**
	 * 获取文件扩展名
	 */
	private getFileExtension(fileName: string): string | null {
		const match = fileName.match(/\.[^/.]+$/);
		return match ? match[0] : null;
	}

	/**
	 * 根据MIME类型获取扩展名
	 */
	private getExtensionFromMimeType(mimeType: string): string {
		const mimeToExt: Record<string, string> = {
			// 图片格式
			"image/png": ".png",
			"image/jpeg": ".jpg",
			"image/jpg": ".jpg",
			"image/gif": ".gif",
			"image/webp": ".webp",
			"image/svg+xml": ".svg",
			"image/bmp": ".bmp",
			"image/tiff": ".tiff",

			// 音频格式
			"audio/mpeg": ".mp3",
			"audio/mp3": ".mp3",
			"audio/wav": ".wav",
			"audio/ogg": ".ogg",
			"audio/aac": ".aac",
			"audio/flac": ".flac",
			"audio/m4a": ".m4a",
			"audio/wma": ".wma",

			// 视频格式
			"video/mp4": ".mp4",
			"video/mpeg": ".mpeg",
			"video/quicktime": ".mov",
			"video/x-msvideo": ".avi",
			"video/webm": ".webm",
			"video/ogg": ".ogv",
			"video/3gpp": ".3gp",
			"video/x-flv": ".flv",

			// 文档格式
			"application/pdf": ".pdf",
			"text/plain": ".txt",
			"application/msword": ".doc",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
			"application/vnd.ms-excel": ".xls",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
		};

		return mimeToExt[mimeType] || ".bin";
	}

	/**
	 * 生成媒体链接
	 */
	private generateMediaLink(
		_fileName: string,
		filePath: string,
		fileType: "image" | "audio" | "video" | "document"
	): string {
		if (this.config.useWikiLinks) {
			switch (fileType) {
				case "image":
				case "audio":
				case "video":
					return `![[${filePath}]]`;
				case "document":
					return `[[${filePath}]]`;
				default:
					return `[[${filePath}]]`;
			}
		}

		switch (fileType) {
			case "image":
				return `![${_fileName}](${filePath})`;
			case "audio":
				return `<audio controls><source src="${filePath}" type="audio/mpeg">您的浏览器不支持音频播放。</audio>`;
			case "video":
				return `<video controls><source src="${filePath}" type="video/mp4">您的浏览器不支持视频播放。</video>`;
			case "document":
				return `[${_fileName}](${filePath})`;
			default:
				return `[${_fileName}](${filePath})`;
		}
	}

	/**
	 * 显示错误消息
	 */
	private showError(message: string): void {
		logger.error("🚫 媒体文件粘贴错误:", message);

		// 使用Obsidian的Notice显示错误
		try {
			if (this.plugin?.app) {
				new Notice(message, 5000);
			}
		} catch (error) {
			logger.error("显示错误通知失败:", error);
		}
	}
}

/**
 * 创建媒体文件粘贴扩展的便捷函数
 */
export function createImagePasteExtension(
	plugin: WeavePlugin,
	config: Partial<MediaPasteConfig> = {}
): Extension {
	const extension = new MediaPasteExtension(plugin, config);
	return extension.create();
}

// 为了向后兼容，保留旧的接口名称
export const createMediaPasteExtension = createImagePasteExtension;

// 导出类型别名以保持向后兼容
export type ImagePasteConfig = MediaPasteConfig;
export type ImageProcessResult = MediaProcessResult;
export const ImagePasteExtension = MediaPasteExtension;
