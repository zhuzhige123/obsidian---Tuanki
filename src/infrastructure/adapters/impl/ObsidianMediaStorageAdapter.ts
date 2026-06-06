/**
 * Obsidian媒体存储适配器实现
 *
 * 实现IMediaStorageAdapter接口，提供Obsidian环境下的媒体文件存储能力
 *
 * @module infrastructure/adapters/impl
 */

import { type Plugin, TFile } from "obsidian";
import {
	getMediaFolder,
	getMediaManifestPath,
} from "../../../config/paths";
import type { MediaManifest } from "../../../domain/apkg/types";
import {
	buildApkgDeckMediaFolderSegment,
	sanitizeMediaFilename,
} from "../../../utils/sync-safe-filename";
import { APKGLogger } from "../../logger/APKGLogger";
import type { IMediaStorageAdapter } from "../MediaStorageAdapter";

type PluginWithFolderSettings = Plugin & {
	settings?: {
		weaveParentFolder?: string;
	};
};

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
	if (
		data.byteOffset === 0 &&
		data.byteLength === data.buffer.byteLength &&
		data.buffer instanceof ArrayBuffer
	) {
		return data.buffer;
	}

	return data.slice().buffer;
}

/**
 * Obsidian媒体存储适配器
 */
export class ObsidianMediaStorageAdapter implements IMediaStorageAdapter {
	private logger: APKGLogger;
	private plugin: PluginWithFolderSettings;
	private baseMediaPath: string; // 🆕 插件专属媒体文件夹（可配置）

	constructor(plugin: Plugin) {
		this.logger = new APKGLogger({ prefix: "[ObsidianMediaStorage]" });
		this.plugin = plugin as PluginWithFolderSettings;
		// 🆕 使用统一的媒体文件夹路径
		const parentFolder = this.plugin.settings?.weaveParentFolder;
		this.baseMediaPath = getMediaFolder(parentFolder);
	}

	/**
	 * 创建牌组媒体文件夹
	 */
	async createDeckMediaFolder(deckName: string): Promise<string> {
		// 规范路径: weave/memory/media/APKG_DeckName/（导入时即满足云同步命名规则）
		const folderSegment = buildApkgDeckMediaFolderSegment(deckName);
		const folderPath = `${this.baseMediaPath}/${folderSegment}`;

		await this.ensureFolder(folderPath);
		this.logger.debug(`创建牌组媒体文件夹: ${folderPath}`);

		return folderPath;
	}

	/**
	 * 保存媒体文件
	 */
	async saveMediaFile(filename: string, data: Uint8Array, basePath: string): Promise<string> {
		const safeFilename = sanitizeMediaFilename(filename);
		const filePath = `${basePath}/${safeFilename}`;

		// 如果文件已存在，生成唯一路径
		const uniquePath = await this.getUniqueFilePath(filePath);

		try {
			const arrayBuffer = toArrayBuffer(data);

			await this.plugin.app.vault.createBinary(uniquePath, arrayBuffer);

			this.logger.debug(`保存媒体文件: ${filename} → ${uniquePath}`);
			return uniquePath;
		} catch (error) {
			// 处理文件已存在的竞态条件
			if (error instanceof Error && error.message.includes("already exists")) {
				this.logger.debug(`文件已存在，尝试生成新的唯一路径: ${uniquePath}`);

				// 重新生成唯一路径并重试
				const retryPath = await this.getUniqueFilePath(filePath);
				await this.plugin.app.vault.createBinary(retryPath, toArrayBuffer(data));

				this.logger.debug(`重试保存成功: ${filename} → ${retryPath}`);
				return retryPath;
			}

			// 其他错误直接抛出
			throw error;
		}
	}

	/**
	 * 计算文件哈希（SHA-256）
	 */
	async calculateHash(data: Uint8Array): Promise<string> {
		const hashBuffer = await crypto.subtle.digest("SHA-256", toArrayBuffer(data));
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
		return hashHex;
	}

	/**
	 * 检查媒体文件是否存在
	 */
	async mediaFileExists(path: string): Promise<boolean> {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		return file !== null;
	}

	/**
	 * 删除媒体文件
	 */
	async deleteMediaFile(path: string): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.plugin.app.fileManager.trashFile(file);
			this.logger.debug(`删除媒体文件: ${path}`);
		}
	}

	/**
	 * 读取媒体清单
	 */
	async loadManifest(basePath: string): Promise<MediaManifest | null> {
		const manifestPaths = [
			getMediaManifestPath(basePath),
			getMediaManifestPath(basePath, true),
		];

		try {
			for (const manifestPath of manifestPaths) {
				const file = this.plugin.app.vault.getAbstractFileByPath(manifestPath);
				if (!(file instanceof TFile)) {
					continue;
				}

				const content = await this.plugin.app.vault.read(file);
				return JSON.parse(content);
			}

			return null;
		} catch (error) {
			this.logger.error("读取媒体清单失败:", error);
			return null;
		}
	}

	/**
	 * 生成Obsidian路径
	 */
	generateObsidianPath(filename: string, basePath: string): string {
		const safeFilename = sanitizeMediaFilename(filename);
		return `${basePath}/${safeFilename}`;
	}

	/**
	 * 保存媒体清单
	 */
	async saveManifest(manifest: MediaManifest): Promise<void> {
		const manifestPath = getMediaManifestPath(manifest.basePath);
		const legacyManifestPath = getMediaManifestPath(manifest.basePath, true);
		const manifestJson = JSON.stringify(manifest, null, 2);

		try {
			const canonicalFile = this.plugin.app.vault.getAbstractFileByPath(manifestPath);
			if (canonicalFile instanceof TFile) {
				await this.plugin.app.vault.modify(canonicalFile, manifestJson);
				this.logger.debug(`更新媒体清单: ${manifestPath}`);
			} else {
				const legacyFile = this.plugin.app.vault.getAbstractFileByPath(legacyManifestPath);
				if (legacyFile instanceof TFile) {
					await this.plugin.app.vault.create(manifestPath, manifestJson);
					await this.plugin.app.vault.adapter.remove(legacyManifestPath);
					this.logger.debug(`迁移媒体清单到: ${manifestPath}`);
				} else {
					await this.plugin.app.vault.create(manifestPath, manifestJson);
					this.logger.debug(`创建媒体清单: ${manifestPath}`);
				}
			}

			if (await this.plugin.app.vault.adapter.exists(legacyManifestPath)) {
				await this.plugin.app.vault.adapter.remove(legacyManifestPath);
			}
		} catch (error) {
			if (error instanceof Error && error.message.includes("already exists")) {
				this.logger.debug(`清单文件已存在，尝试修改: ${manifestPath}`);

				const existingFile = this.plugin.app.vault.getAbstractFileByPath(manifestPath);
				if (existingFile instanceof TFile) {
					await this.plugin.app.vault.modify(existingFile, manifestJson);
					this.logger.debug(`重试修改清单成功: ${manifestPath}`);
				}
			} else {
				throw error;
			}
		}
	}

	/**
	 * 确保文件夹存在
	 */
	private async ensureFolder(path: string): Promise<void> {
		const parts = path.split("/");
		let currentPath = "";

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			const exists = this.plugin.app.vault.getAbstractFileByPath(currentPath);
			if (!exists) {
				try {
					await this.plugin.app.vault.createFolder(currentPath);
				} catch (error) {
					// 忽略"已存在"错误
					if (!(error instanceof Error) || !error.message.includes("already exists")) {
						throw error;
					}
				}
			}
		}
	}

	/**
	 * 获取唯一文件路径
	 */
	private async getUniqueFilePath(originalPath: string): Promise<string> {
		let testPath = originalPath;

		// 首先检查原始路径是否可用
		const exists = await this.mediaFileExists(testPath);
		if (!exists) return testPath;

		// 如果存在冲突，使用时间戳+随机数策略
		const timestamp = Date.now();
		const random = Math.floor(Math.random() * 1000);

		const dotIndex = originalPath.lastIndexOf(".");
		if (dotIndex > 0) {
			const baseName = originalPath.substring(0, dotIndex);
			const extension = originalPath.substring(dotIndex);
			testPath = `${baseName}_${timestamp}_${random}${extension}`;
		} else {
			testPath = `${originalPath}_${timestamp}_${random}`;
		}

		// 检查生成的路径是否可用
		const finalExists = await this.mediaFileExists(testPath);
		if (!finalExists) return testPath;

		// 如果还是冲突，回退到计数器策略
		let counter = 1;
		while (counter <= 1000) {
			if (dotIndex > 0) {
				const baseName = originalPath.substring(0, dotIndex);
				const extension = originalPath.substring(dotIndex);
				testPath = `${baseName}_${timestamp}_${random}_${counter}${extension}`;
			} else {
				testPath = `${originalPath}_${timestamp}_${random}_${counter}`;
			}

			const exists = await this.mediaFileExists(testPath);
			if (!exists) return testPath;

			counter++;
		}

		throw new Error(`无法生成唯一文件路径: ${originalPath}`);
	}
}
