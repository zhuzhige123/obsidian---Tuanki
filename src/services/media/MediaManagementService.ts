/**
 * 媒体管理服务
 * 按牌组路径组织媒体文件，支持引用计数和去重
 */

import type { Plugin } from "obsidian";
import { getMediaFolder } from "../../config/paths";
import type { WeaveDataStorage } from "../../data/storage";
import type { MediaFile, MediaIndex } from "../../data/types";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { readWeaveParentFolder } from "../../utils/weave-plugin-settings";
import { isRecord, parseJsonUnknown } from "../../utils/typed-json";
import type { WeavePlugin } from "../../main";

/**
 * 媒体管理服务
 *
 * 核心功能：
 * - 按牌组层级路径组织媒体文件
 * - 基于SHA256哈希的文件去重
 * - 引用计数管理
 * - 孤立文件自动清理
 */
export class MediaManagementService {
	private plugin: Plugin;
	private storage: WeaveDataStorage;
	private hashCache: Map<string, MediaFile>;
	private mediaBasePath: string;

	constructor(plugin: Plugin, storage: WeaveDataStorage) {
		this.plugin = plugin;
		this.storage = storage;
		this.hashCache = new Map();
		// 使用统一的媒体文件夹路径
		const parentFolder = readWeaveParentFolder(this.plugin as WeavePlugin);
		this.mediaBasePath = getMediaFolder(parentFolder);
	}

	/**
	 * 初始化媒体管理系统
	 */
	async initialize(): Promise<void> {
		logger.debug("[MediaManagement] Initializing...");
		logger.debug("[MediaManagement] Media path:", this.mediaBasePath);

		await this.ensureDir(this.mediaBasePath);
		await this.rebuildHashCache();

		logger.debug("[MediaManagement] Initialized");
	}

	/**
	 * 添加媒体文件
	 *
	 * @param file - 文件对象
	 * @param deckId - 牌组ID
	 * @param cardId - 卡片ID
	 * @returns 媒体文件对象
	 */
	async addMedia(file: File, deckId: string, cardId: string): Promise<MediaFile> {
		const hash = await this.calculateHash(file);

		// 检查是否已存在（跨牌组去重）
		const existing = this.hashCache.get(hash);
		if (existing) {
			logger.debug(`Media file already exists (hash: ${hash.substring(0, 8)}), adding reference`);

			// 添加引用
			if (!existing.usedByCards.includes(cardId)) {
				existing.usedByCards.push(cardId);
				existing.lastAccessed = new Date().toISOString();
				await this.updateMediaIndex(existing);
				await this.saveHashIndex();
			}

			return existing;
		}

		// 新文件，获取牌组路径
		const deck = await this.storage.getDeck(deckId);
		if (!deck) {
			throw new Error(`Deck not found: ${deckId}`);
		}

		const deckPathDir = deck.path.replace(/::/g, "/");
		const storagePath = `${deckPathDir}/${file.name}`;
		const fullPath = `${this.mediaBasePath}/${storagePath}`;

		// 确保目录存在
		await this.ensureDirForFile(fullPath);

		// 保存文件
		const buffer = await file.arrayBuffer();
		await this.plugin.app.vault.adapter.writeBinary(fullPath, buffer);

		// 创建媒体记录
		const media: MediaFile = {
			id: this.generateMediaId(),
			filename: file.name,
			deckPath: deck.path,
			storagePath,
			hash,
			size: file.size,
			mimeType: file.type,
			usedByCards: [cardId],
			created: new Date().toISOString(),
			lastAccessed: new Date().toISOString(),
		};

		// 更新索引
		this.hashCache.set(hash, media);
		await this.updateMediaIndex(media);
		await this.saveHashIndex();

		logger.debug(`✅ Added media file: ${storagePath}`);
		return media;
	}

	/**
	 * 获取卡片使用的媒体
	 */
	async getMediaByCard(cardId: string): Promise<MediaFile[]> {
		const allMedia = await this.getAllMedia();
		return allMedia.filter((m) => m.usedByCards.includes(cardId));
	}

	/**
	 * 获取牌组的所有媒体
	 */
	async getMediaByDeck(deckPath: string): Promise<MediaFile[]> {
		const index = await this.getMediaIndex(deckPath);
		return index.files;
	}

	/**
	 * 卡片删除时清理媒体引用
	 */
	async onCardDeleted(cardId: string): Promise<void> {
		const mediaFiles = await this.getMediaByCard(cardId);

		for (const media of mediaFiles) {
			// 移除引用
			media.usedByCards = media.usedByCards.filter((_id) => _id !== cardId);

			if (media.usedByCards.length === 0) {
				// 无引用，移至孤立文件夹
				logger.debug(`Moving orphaned media: ${media.filename}`);
				await this.moveToOrphaned(media);
			} else {
				// 仍有引用，更新索引
				await this.updateMediaIndex(media);
			}
		}

		await this.saveHashIndex();
	}

	/**
	 * 牌组删除时清理媒体
	 */
	async onDeckDeleted(deckId: string): Promise<void> {
		const deck = await this.storage.getDeck(deckId);
		if (!deck) return;

		const mediaIndex = await this.getMediaIndex(deck.path);

		for (const media of mediaIndex.files) {
			if (media.usedByCards.length === 0) {
				// 物理删除
				await this.deleteMedia(media);
			} else {
				// 移至孤立文件夹
				await this.moveToOrphaned(media);
			}
		}

		logger.debug(`✅ Cleaned up media for deleted deck: ${deck.path}`);
	}

	/**
	 * 清理孤立媒体
	 *
	 * @param daysThreshold - 天数阈值
	 * @returns 清理的文件数量
	 */
	async cleanupOrphaned(daysThreshold = 30): Promise<number> {
		const orphanedPath = `${this.mediaBasePath}/_orphaned`;
		const cutoff = Date.now() - daysThreshold * 24 * 60 * 60 * 1000;
		let cleaned = 0;

		try {
			const listing = await this.plugin.app.vault.adapter.list(orphanedPath);
			const files = listing.files || [];

			for (const filePath of files) {
				if (filePath.endsWith(".json")) continue; // 跳过索引文件

				try {
					const stat = await this.plugin.app.vault.adapter.stat(filePath);
					if (stat && stat.mtime < cutoff) {
						await this.plugin.app.vault.adapter.remove(filePath);
						cleaned++;
					}
				} catch (error) {
					logger.warn(`Failed to check/delete orphaned file: ${filePath}`, error);
				}
			}

			logger.debug(`✅ Cleaned up ${cleaned} orphaned media files`);
		} catch (error) {
			logger.error("Orphaned cleanup failed:", error);
		}

		return cleaned;
	}

	/**
	 * 获取媒体统计信息
	 */
	async getStats(): Promise<{
		totalFiles: number;
		totalSize: number;
		orphanedCount: number;
	}> {
		const allMedia = await this.getAllMedia();
		const totalSize = allMedia.reduce((sum, m) => sum + m.size, 0);

		// 统计孤立文件
		let orphanedCount = 0;
		try {
			const listing = await this.plugin.app.vault.adapter.list(`${this.mediaBasePath}/_orphaned`);
			orphanedCount = (listing.files || []).filter((f) => !f.endsWith(".json")).length;
		} catch {
			orphanedCount = 0;
		}

		return {
			totalFiles: allMedia.length,
			totalSize,
			orphanedCount,
		};
	}

	// ===== 私有辅助方法 =====

	/**
	 * 计算文件哈希
	 */
	private async calculateHash(file: File): Promise<string> {
		const buffer = await file.arrayBuffer();
		const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	}

	/**
	 * 移动到孤立文件夹
	 */
	private async moveToOrphaned(media: MediaFile): Promise<void> {
		const oldPath = `${this.mediaBasePath}/${media.storagePath}`;
		const newPath = `${this.mediaBasePath}/_orphaned/${media.filename}`;

		try {
			const exists = await this.plugin.app.vault.adapter.exists(oldPath);
			if (exists) {
				// 使用文件内容复制+删除的方式
				const content = await this.plugin.app.vault.adapter.readBinary(oldPath);
				await this.plugin.app.vault.adapter.writeBinary(newPath, content);
				await this.plugin.app.vault.adapter.remove(oldPath);

				media.storagePath = `_orphaned/${media.filename}`;
				media.deckPath = "_orphaned";
				await this.updateMediaIndex(media);

				logger.debug(`Moved to orphaned: ${media.filename}`);
			}
		} catch (error) {
			logger.error("Failed to move media to orphaned:", error);
		}
	}

	/**
	 * 删除媒体文件
	 */
	private async deleteMedia(media: MediaFile): Promise<void> {
		const path = `${this.mediaBasePath}/${media.storagePath}`;

		try {
			await this.plugin.app.vault.adapter.remove(path);
			this.hashCache.delete(media.hash);
			logger.debug(`Deleted media: ${media.filename}`);
		} catch (error) {
			logger.error("Failed to delete media:", error);
		}
	}

	/**
	 * 获取媒体索引
	 */
	private async getMediaIndex(deckPath: string): Promise<MediaIndex> {
		const indexPath = `${this.mediaBasePath}/${deckPath.replace(/::/g, "/")}/.media-index.json`;

		try {
			const content = await this.plugin.app.vault.adapter.read(indexPath);
			const parsed = parseJsonUnknown(content);
			if (
				isRecord(parsed) &&
				typeof parsed.deckPath === "string" &&
				Array.isArray(parsed.files) &&
				typeof parsed.lastUpdated === "string"
			) {
				return {
					deckPath: parsed.deckPath,
					files: parsed.files.filter((file): file is MediaFile => isRecord(file)),
					lastUpdated: parsed.lastUpdated,
				};
			}
		} catch {
			// fall through to default
		}
		return {
			deckPath,
			files: [],
			lastUpdated: new Date().toISOString(),
		};
	}

	/**
	 * 更新媒体索引
	 */
	private async updateMediaIndex(media: MediaFile): Promise<void> {
		const index = await this.getMediaIndex(media.deckPath);

		const existingIndex = index.files.findIndex((f) => f.id === media.id);
		if (existingIndex >= 0) {
			index.files[existingIndex] = media;
		} else {
			index.files.push(media);
		}

		// 清理已删除的媒体
		index.files = index.files.filter((f) => f.usedByCards.length > 0 || f.id === media.id);

		index.lastUpdated = new Date().toISOString();

		const indexPath = `${this.mediaBasePath}/${media.deckPath.replace(
			/::/g,
			"/"
		)}/.media-index.json`;
		await this.ensureDirForFile(indexPath);
		await this.plugin.app.vault.adapter.write(indexPath, JSON.stringify(index, null, 2));
	}

	/**
	 * 获取所有媒体
	 */
	private async getAllMedia(): Promise<MediaFile[]> {
		const allMedia: MediaFile[] = [];

		// 遍历所有牌组的媒体索引
		const decks = await this.storage.getDecks();
		for (const deck of decks) {
			const index = await this.getMediaIndex(deck.path);
			allMedia.push(...index.files);
		}

		return allMedia;
	}

	/**
	 * 重建哈希缓存
	 * 从所有媒体索引文件重建内存中的哈希缓存
	 */
	private async rebuildHashCache(): Promise<void> {
		logger.debug("[MediaManagement] Rebuilding hash cache...");
		this.hashCache = new Map();

		try {
			// 尝试从持久化的哈希索引加载
			await this.loadHashIndex();

			// 如果哈希索引为空，从所有媒体文件重建
			if (this.hashCache.size === 0) {
				const allMedia = await this.getAllMedia();
				for (const media of allMedia) {
					this.hashCache.set(media.hash, media);
				}

				// 保存重建的索引
				if (this.hashCache.size > 0) {
					await this.saveHashIndex();
				}

				logger.debug(`[MediaManagement] Rebuilt hash cache with ${this.hashCache.size} entries`);
			}
		} catch (error) {
			logger.error("[MediaManagement] Failed to rebuild hash cache:", error);
			// 不抛出错误，使用空缓存继续
			this.hashCache = new Map();
		}
	}

	/**
	 * 加载哈希索引
	 */
	private async loadHashIndex(): Promise<void> {
		const indexPath = `${this.mediaBasePath}/.hash-index.json`;

		try {
			const content = await this.plugin.app.vault.adapter.read(indexPath);
			const parsed = parseJsonUnknown(content);
			if (isRecord(parsed)) {
				const entries = Object.entries(parsed).filter(
					(entry): entry is [string, MediaFile] =>
						typeof entry[0] === "string" && isRecord(entry[1]) && typeof entry[1].id === "string"
				);
				this.hashCache = new Map(entries);
				logger.debug(`Loaded ${this.hashCache.size} media file hashes`);
				return;
			}
		} catch {
			// fall through to empty cache
		}
		this.hashCache = new Map();
		logger.debug("No existing hash index found, starting fresh");
	}

	/**
	 * 保存哈希索引
	 */
	private async saveHashIndex(): Promise<void> {
		const indexPath = `${this.mediaBasePath}/.hash-index.json`;
		const data = Object.fromEntries(this.hashCache);
		await this.plugin.app.vault.adapter.write(indexPath, JSON.stringify(data, null, 2));
	}

	/**
	 * 确保目录存在（支持嵌套路径）
	 */
	private async ensureDir(path: string): Promise<void> {
		//  使用递归创建以支持嵌套目录（如 weave/weave_media）
		await DirectoryUtils.ensureDirRecursive(this.plugin.app.vault.adapter, path);
	}

	/**
	 * 确保文件所在目录存在
	 */
	private async ensureDirForFile(filePath: string): Promise<void> {
		await DirectoryUtils.ensureDirForFile(this.plugin.app.vault.adapter, filePath);
	}

	/**
	 * 生成媒体ID
	 */
	private generateMediaId(): string {
		return `media_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}
}
