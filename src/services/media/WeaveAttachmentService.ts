import type { App } from "obsidian";
import { getAttachmentRegistryPath } from "../../config/paths";
import { buildMediaWikiLink, normalizeMediaVaultPath } from "../../utils/media-reference-extractor";
import { logger } from "../../utils/logger";
import type { AttachmentRegistryService } from "./AttachmentRegistryService";

export interface SaveAttachmentOptions {
	/** 建议文件名（含扩展名） */
	fileName?: string;
	/** 关联笔记路径，用于 Obsidian 附件策略锚点 */
	sourcePath?: string;
	/** 生成文档链接而非嵌入链接 */
	documentLink?: boolean;
}

export interface SavedAttachmentResult {
	path: string;
	wikiLink: string;
}

/**
 * 统一附件保存：遵循 Obsidian getAvailablePathForAttachment 策略。
 */
export class WeaveAttachmentService {
	private registryService?: AttachmentRegistryService;

	constructor(
		private readonly app: App,
		private readonly parentFolder?: string
	) {}

	setRegistryService(registryService: AttachmentRegistryService): void {
		this.registryService = registryService;
	}

	getRegistryAnchorPath(): string {
		return getAttachmentRegistryPath(this.parentFolder);
	}

	resolveAnchorSourcePath(preferred?: string): string {
		if (preferred?.trim()) {
			return preferred.trim();
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile?.path) {
			return activeFile.path;
		}

		return this.getRegistryAnchorPath();
	}

	async saveFile(file: File, options: SaveAttachmentOptions = {}): Promise<SavedAttachmentResult> {
		const fileName = options.fileName?.trim() || file.name;
		const sourcePath = this.resolveAnchorSourcePath(options.sourcePath);
		const path = await this.app.fileManager.getAvailablePathForAttachment(fileName, sourcePath);
		const arrayBuffer = await file.arrayBuffer();
		await this.app.vault.createBinary(path, arrayBuffer);

		const result: SavedAttachmentResult = {
			path: normalizeMediaVaultPath(path),
			wikiLink: buildMediaWikiLink(path, { documentLink: options.documentLink }),
		};

		this.registryService?.scheduleRebuild("attachment_saved");
		logger.debug("[WeaveAttachmentService] 已保存附件:", result.path);
		return result;
	}

	async saveBinary(
		fileName: string,
		data: ArrayBuffer,
		options: SaveAttachmentOptions = {}
	): Promise<SavedAttachmentResult> {
		const sourcePath = this.resolveAnchorSourcePath(options.sourcePath);
		const path = await this.app.fileManager.getAvailablePathForAttachment(fileName, sourcePath);
		await this.app.vault.createBinary(path, data);

		const result: SavedAttachmentResult = {
			path: normalizeMediaVaultPath(path),
			wikiLink: buildMediaWikiLink(path, { documentLink: options.documentLink }),
		};

		this.registryService?.scheduleRebuild("attachment_saved");
		logger.debug("[WeaveAttachmentService] 已保存二进制附件:", result.path);
		return result;
	}
}
