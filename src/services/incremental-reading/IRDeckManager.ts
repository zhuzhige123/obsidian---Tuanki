/**
 * 增量阅读牌组管理服务
 *
 * 负责管理增量阅读牌组：
 * - 文件夹扫描和牌组识别
 * - 牌组创建和删除
 * - 牌组统计计算
 * - 支持跨文件牌组组织
 *
 * @module services/incremental-reading/IRDeckManager
 * @version 2.0.0 - 引入式架构
 */

import { App, TFile, TFolder, normalizePath } from "obsidian";
import { resolveIRImportFolder } from "../../config/paths";
import type { ReadingMaterial } from "../../types/incremental-reading-types";
import type { IRDeck, IRDeckSettings, IRDeckStats } from "../../types/ir-types";
import {
	DEFAULT_IR_DECK_SETTINGS,
	createDefaultIRDeck,
	generateIRDeckId,
} from "../../types/ir-types";
import { logger } from "../../utils/logger";
import { createYAMLFrontmatterManager } from "../../utils/yaml-frontmatter-utils";
import { IREpubBookmarkTaskService } from "./IREpubBookmarkTaskService";
import { IRPdfBookmarkTaskService } from "./IRPdfBookmarkTaskService";
import { IRStorageService } from "./IRStorageService";
import { getSharedIRWorkspaceSnapshotService } from "./IRWorkspaceSnapshotService";
import { createReadingMaterialStorage } from "./ReadingMaterialStorage";

export class IRDeckManager {
	private app: App;
	private storage: IRStorageService;
	private chunkRoot: string;

	constructor(app: App, storage: IRStorageService, chunkRoot?: string) {
		this.app = app;
		this.storage = storage;
		const plugin: any = (app as any)?.plugins?.getPlugin?.("weave");
		const parentFolder = plugin?.settings?.weaveParentFolder;
		this.chunkRoot = normalizePath(resolveIRImportFolder(chunkRoot, parentFolder));
	}

	private async cleanAllEmptyFoldersUnderChunks(): Promise<void> {
		const adapter = this.app.vault.adapter as any;
		const chunksRoot = this.chunkRoot;
		if (!adapter?.exists || !(await adapter.exists(chunksRoot))) {
			return;
		}

		const walk = async (dir: string): Promise<void> => {
			const normalizedDir = normalizePath(dir);
			let listing: any;
			try {
				listing = await adapter.list(normalizedDir);
			} catch {
				return;
			}

			const folders: string[] = Array.isArray(listing?.folders) ? listing.folders : [];
			for (const sub of folders) {
				await walk(sub);
			}

			if (normalizedDir !== chunksRoot) {
				await this.cleanEmptyFolder(normalizedDir);
			}
		};

		await walk(chunksRoot);
	}

	/**
	 * 检查并删除空文件夹
	 * @param folderPath 文件夹路径
	 * @returns 是否成功删除
	 */
	private async cleanEmptyFolder(folderPath: string): Promise<boolean> {
		try {
			const normalizedFolderPath = normalizePath(folderPath);
			const adapter = this.app.vault.adapter as any;
			if (!adapter?.exists || !(await adapter.exists(normalizedFolderPath))) {
				return false;
			}

			const listing = await adapter.list(normalizedFolderPath);
			const isEmpty =
				(!listing?.files || listing.files.length === 0) &&
				(!listing?.folders || listing.folders.length === 0);
			if (!isEmpty) {
				return false;
			}

			const folder = this.app.vault.getAbstractFileByPath(normalizedFolderPath);
			if (folder instanceof TFolder) {
				await this.app.fileManager.trashFile(folder);
				logger.info(`[IRDeckManager] 删除空文件夹: ${normalizedFolderPath}`);
				return true;
			}

			if (adapter.rmdir) {
				await adapter.rmdir(normalizedFolderPath, false);
			} else {
				await adapter.remove(normalizedFolderPath);
			}
			logger.info(`[IRDeckManager] 删除空文件夹: ${normalizedFolderPath}`);
			return true;
		} catch (error) {
			logger.warn(`[IRDeckManager] 删除空文件夹失败: ${folderPath}`, error);
			return false;
		}
	}

	/**
	 * 递归清理空父文件夹
	 * @param filePath 已删除文件的路径
	 */
	private async cleanEmptyParentFolders(filePath: string): Promise<void> {
		const normalizedFilePath = normalizePath(filePath);
		let parentPath = normalizedFilePath.substring(0, normalizedFilePath.lastIndexOf("/"));
		const chunksRoot = this.chunkRoot;

		while (parentPath?.startsWith(chunksRoot) && parentPath !== chunksRoot) {
			const deleted = await this.cleanEmptyFolder(parentPath);
			if (!deleted) {
				break;
			}
			parentPath = parentPath.substring(0, parentPath.lastIndexOf("/"));
		}
	}

	/**
	 * 获取所有增量阅读牌组
	 */
	async getAllDecks(): Promise<IRDeck[]> {
		const decksData = await this.storage.getAllDecks();
		return Object.values(decksData);
	}

	/**
	 * 获取牌组及其统计
	 */
	async getDecksWithStats(options?: {
		dailyNewLimit?: number;
		dailyReviewLimit?: number;
		learnAheadDays?: number;
	}): Promise<Array<{ deck: IRDeck; stats: IRDeckStats }>> {
		const snapshot = await getSharedIRWorkspaceSnapshotService(this.app).getDeckOverview({
			dailyNewLimit: options?.dailyNewLimit ?? 20,
			dailyReviewLimit: options?.dailyReviewLimit ?? 50,
			learnAheadDays: options?.learnAheadDays ?? 3,
		});

		const emptyStats: IRDeckStats = {
			newCount: 0,
			learningCount: 0,
			reviewCount: 0,
			dueToday: 0,
			dueWithinDays: 0,
			totalCount: 0,
			fileCount: 0,
			questionCount: 0,
			completedQuestionCount: 0,
			todayNewCount: 0,
			todayDueCount: 0,
		};

		return snapshot.decks.map((deck) => {
			const deckKey = String(deck.id || deck.path || "").trim();
			return {
				deck,
				stats: snapshot.deckStats[deckKey] ?? emptyStats,
			};
		});
	}

	/**
	 * 导入文件夹作为牌组
	 */
	async importFolder(folderPath: string, settings?: Partial<IRDeckSettings>): Promise<IRDeck> {
		// 验证文件夹存在
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) {
			throw new Error(`文件夹不存在: ${folderPath}`);
		}

		// 检查是否已存在，同时检查 id 和 path
		const existingDecks = await this.storage.getAllDecks();
		const existing = Object.values(existingDecks).find(
			(d) => d.id === folderPath || d.path === folderPath
		);
		if (existing) {
			logger.warn(`[IRDeckManager] 牌组已存在: ${folderPath}`);
			return existing;
		}

		// 使用工厂函数创建牌组
		const deck = createDefaultIRDeck(folder.name);
		// 保留path用于兼容
		deck.path = folderPath;
		// 应用自定义设置
		if (settings) {
			deck.settings = { ...deck.settings, ...settings };
		}

		await this.storage.saveDeck(deck);
		logger.info(`[IRDeckManager] 导入牌组: ${deck.id} (${folderPath})`);

		return deck;
	}

	private collectReadingMaterialsForDeck(
		materials: ReadingMaterial[],
		deckIdentifiers: Set<string>
	): ReadingMaterial[] {
		const selected = new Map<string, ReadingMaterial>();

		for (const material of materials) {
			const readingDeckId = String(material.readingDeckId || "").trim();
			if (readingDeckId && deckIdentifiers.has(readingDeckId)) {
				selected.set(material.uuid, material);
			}
		}

		let changed = true;
		while (changed) {
			changed = false;
			for (const material of materials) {
				if (selected.has(material.uuid)) {
					continue;
				}
				const parentId = String(material.parentMaterialId || "").trim();
				if (parentId && selected.has(parentId)) {
					selected.set(material.uuid, material);
					changed = true;
				}
			}
		}

		return Array.from(selected.values());
	}

	private async cleanupReadingArtifactsForDeck(deckId: string, deckName?: string): Promise<void> {
		const deckIdentifiers = new Set(
			[deckId, deckName].map((value) => String(value || "").trim()).filter(Boolean)
		);

		if (deckIdentifiers.size === 0) {
			return;
		}

		const readingStorage = createReadingMaterialStorage(this.app);
		await readingStorage.initialize();

		const yamlManager = createYAMLFrontmatterManager(this.app);
		const allMaterials = readingStorage.getAllMaterials();
		const materialsToDelete = this.collectReadingMaterialsForDeck(allMaterials, deckIdentifiers);

		for (const material of materialsToDelete) {
			if (!material.parentMaterialId && material.filePath?.toLowerCase().endsWith(".md")) {
				const file = this.app.vault.getAbstractFileByPath(material.filePath);
				if (file instanceof TFile) {
					try {
						await yamlManager.removeReadingFields(file);
					} catch (error) {
						logger.warn(
							`[IRDeckManager] 清理 Markdown 增量阅读 YAML 失败: ${material.filePath}`,
							error
						);
					}
				}
			}

			try {
				await readingStorage.deleteMaterial(material.uuid);
			} catch (error) {
				logger.warn(`[IRDeckManager] 删除阅读材料失败: ${material.uuid}`, error);
			}
		}

		const pdfTaskService = new IRPdfBookmarkTaskService(this.app);
		const epubTaskService = new IREpubBookmarkTaskService(this.app);

		try {
			await pdfTaskService.deleteTasksByDeckIdentifiers(Array.from(deckIdentifiers));
		} catch (error) {
			logger.warn(`[IRDeckManager] 清理 PDF 增量阅读书签失败: ${deckId}`, error);
		}

		try {
			await epubTaskService.deleteTasksByDeckIdentifiers(Array.from(deckIdentifiers));
		} catch (error) {
			logger.warn(`[IRDeckManager] 清理 EPUB 增量阅读书签失败: ${deckId}`, error);
		}

		logger.info(`[IRDeckManager] 已清理牌组关联的阅读材料与书签数据: ${deckId}`, {
			deckIdentifiers: Array.from(deckIdentifiers),
			materialCount: materialsToDelete.length,
		});
	}

	/**
	 * 删除牌组（同时删除所有关联的内容块数据）
	 */
	async deleteDeck(deckId: string): Promise<void> {
		const deck = await this.storage.getDeckById(deckId);

		const adapter = this.app.vault.adapter as any;

		const blocks = await this.storage.getBlocksByDeck(deckId);
		for (const block of blocks) {
			await this.storage.deleteBlock(block.id);
		}

		const allChunks = await this.storage.getAllChunkData();
		const deckTag = deck?.name ? `#IR_deck_${deck.name}` : undefined;
		const chunksToDelete = Object.values(allChunks).filter(
			(c) =>
				(Array.isArray(c.deckIds) && c.deckIds.includes(deckId)) ||
				(!!deckTag && c.deckTag === deckTag)
		);

		const affectedSourceIds = new Set<string>();

		// 收集所有需要检查的父文件夹路径
		const foldersToCheck = new Set<string>();

		for (const chunk of chunksToDelete) {
			try {
				affectedSourceIds.add(chunk.sourceId);
				const filePath = normalizePath(chunk.filePath);
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					await this.app.fileManager.trashFile(file);
				} else if (adapter?.exists && (await adapter.exists(filePath))) {
					await adapter.remove(filePath);
				}
				foldersToCheck.add(filePath);
			} catch (error) {
				logger.warn(`[IRDeckManager] 删除块文件失败: ${chunk.filePath}`, error);
			}

			try {
				await this.storage.deleteChunkData(chunk.chunkId);
			} catch (error) {
				logger.warn(`[IRDeckManager] 删除块调度数据失败: ${chunk.chunkId}`, error);
			}
		}

		if (affectedSourceIds.size > 0) {
			const sources = await this.storage.getAllSources();
			for (const sourceId of affectedSourceIds) {
				const source = sources[sourceId];
				if (!source) continue;

				const remainingChunkIds = (source.chunkIds || []).filter(
					(id) => !chunksToDelete.some((c) => c.chunkId === id)
				);
				if (remainingChunkIds.length === 0) {
					try {
						if (source.indexFilePath) {
							const indexFilePath = normalizePath(source.indexFilePath);
							const indexFile = this.app.vault.getAbstractFileByPath(indexFilePath);
							if (indexFile instanceof TFile) {
								await this.app.fileManager.trashFile(indexFile);
							} else if (adapter?.exists && (await adapter.exists(indexFilePath))) {
								await adapter.remove(indexFilePath);
							}
							foldersToCheck.add(indexFilePath);
						}
					} catch (error) {
						logger.warn(`[IRDeckManager] 删除源索引文件失败: ${source.indexFilePath}`, error);
					}

					try {
						await this.storage.deleteSource(sourceId);
					} catch (error) {
						logger.warn(`[IRDeckManager] 删除源材料元数据失败: ${sourceId}`, error);
					}
				} else if (remainingChunkIds.length !== (source.chunkIds || []).length) {
					try {
						source.chunkIds = remainingChunkIds;
						source.updatedAt = Date.now();
						await this.storage.saveSource(source);
					} catch (error) {
						logger.warn(`[IRDeckManager] 更新源材料元数据失败: ${sourceId}`, error);
					}
				}
			}
		}

		// 清理所有空文件夹
		for (const folderPath of foldersToCheck) {
			await this.cleanEmptyParentFolders(folderPath);
		}

		await this.cleanAllEmptyFoldersUnderChunks();

		await this.cleanupReadingArtifactsForDeck(deckId, deck?.name);

		await this.storage.deleteDeck(deckId);
		logger.info(
			`[IRDeckManager] 删除牌组及 ${blocks.length + chunksToDelete.length} 个内容块: ${deckId}`
		);
	}

	/**
	 * 解散牌组，仅删除牌组并保留块数据
	 */
	async disbandDeck(deckId: string): Promise<void> {
		const allChunks = await this.storage.getAllChunkData();
		const chunksToUpdate = Object.values(allChunks).filter(
			(c) => Array.isArray(c.deckIds) && c.deckIds.includes(deckId)
		);
		for (const chunk of chunksToUpdate) {
			try {
				await this.storage.removeDeckFromChunk(chunk.chunkId, deckId);
			} catch (error) {
				logger.warn(`[IRDeckManager] 解散牌组时移除块牌组失败: ${chunk.chunkId}`, error);
			}
		}

		await this.storage.deleteDeck(deckId);
		logger.info(`[IRDeckManager] 解散牌组 (保留块数据): ${deckId}`);
	}

	/**
	 * 创建空牌组，用于跨文件组织
	 */
	async createDeck(name: string, description?: string): Promise<IRDeck> {
		const deck = createDefaultIRDeck(name);
		if (description) {
			deck.description = description;
		}
		await this.storage.saveDeck(deck);
		logger.info(`[IRDeckManager] 创建牌组: ${deck.id} (${name})`);
		return deck;
	}

	/**
	 * 向牌组添加内容块
	 */
	async addBlocksToDeck(deckId: string, blockIds: string[]): Promise<void> {
		await this.storage.addBlocksToDeck(deckId, blockIds);
		logger.debug(`[IRDeckManager] 向牌组 ${deckId} 添加 ${blockIds.length} 个内容块`);
	}

	/**
	 * 从牌组移除内容块
	 */
	async removeBlocksFromDeck(deckId: string, blockIds: string[]): Promise<void> {
		await this.storage.removeBlocksFromDeck(deckId, blockIds);
		logger.debug(`[IRDeckManager] 从牌组 ${deckId} 移除 ${blockIds.length} 个内容块`);
	}

	/**
	 * 更新牌组设置
	 */
	async updateDeckSettings(deckPath: string, settings: Partial<IRDeckSettings>): Promise<IRDeck> {
		const deck = await this.storage.getDeck(deckPath);
		if (!deck) {
			throw new Error(`牌组不存在: ${deckPath}`);
		}

		deck.settings = {
			...deck.settings,
			...settings,
		};

		await this.storage.saveDeck(deck);
		logger.debug(`[IRDeckManager] 更新牌组设置: ${deckPath}`);

		return deck;
	}

	/**
	 * 扫描文件夹中的 Markdown 文件
	 */
	async scanFolderFiles(folderPath: string): Promise<TFile[]> {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) {
			return [];
		}

		const files: TFile[] = [];

		// 递归扫描所有 Markdown 文件
		const scanFolder = (f: TFolder) => {
			for (const child of f.children) {
				if (child instanceof TFile && child.extension === "md") {
					files.push(child);
				} else if (child instanceof TFolder) {
					scanFolder(child);
				}
			}
		};

		scanFolder(folder);
		return files;
	}

	/**
	 * 获取牌组的所有文件
	 */
	async getDeckFiles(deckPath: string): Promise<TFile[]> {
		return this.scanFolderFiles(deckPath);
	}

	/**
	 * 检查文件夹是否可以作为牌组导入
	 */
	async canImportFolder(folderPath: string): Promise<{
		canImport: boolean;
		reason?: string;
		fileCount?: number;
	}> {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);

		if (!(folder instanceof TFolder)) {
			return { canImport: false, reason: "路径不是文件夹" };
		}

		// 检查是否为系统文件夹
		if (folderPath.startsWith(".")) {
			return { canImport: false, reason: "不能导入隐藏文件夹" };
		}

		// 扫描文件数量
		const files = await this.scanFolderFiles(folderPath);

		if (files.length === 0) {
			return { canImport: false, reason: "文件夹中没有 Markdown 文件" };
		}

		// 检查是否已导入
		const existing = await this.storage.getDeck(folderPath);
		if (existing) {
			return { canImport: false, reason: "该文件夹已作为牌组导入" };
		}

		return { canImport: true, fileCount: files.length };
	}

	/**
	 * 获取可导入的文件夹列表
	 */
	async getImportableFolders(): Promise<Array<{ path: string; name: string; fileCount: number }>> {
		const result: Array<{ path: string; name: string; fileCount: number }> = [];
		const existingDecks = await this.storage.getAllDecks();
		const existingPaths = new Set(Object.keys(existingDecks));

		// 遍历根目录下的文件夹
		const root = this.app.vault.getRoot();

		for (const child of root.children) {
			if (child instanceof TFolder && !child.path.startsWith(".")) {
				if (!existingPaths.has(child.path)) {
					const files = await this.scanFolderFiles(child.path);
					if (files.length > 0) {
						result.push({
							path: child.path,
							name: child.name,
							fileCount: files.length,
						});
					}
				}
			}
		}

		return result;
	}

	/**
	 * 刷新牌组（重新扫描文件夹）
	 */
	async refreshDeck(deckPath: string): Promise<{
		added: number;
		removed: number;
		unchanged: number;
	}> {
		const deck = await this.storage.getDeck(deckPath);
		if (!deck) {
			throw new Error(`牌组不存在: ${deckPath}`);
		}

		// 获取当前存储的内容块
		const existingBlocks = await this.storage.getBlocksByDeck(deckPath);
		const existingFiles = new Set(existingBlocks.map((b) => b.filePath));

		// 扫描文件夹中的文件
		const currentFiles = await this.scanFolderFiles(deckPath);
		const currentFilePaths = new Set(currentFiles.map((f) => f.path));

		let added = 0;
		let removed = 0;
		let unchanged = 0;

		// 检查已删除的文件
		for (const filePath of existingFiles) {
			if (!currentFilePaths.has(filePath)) {
				await this.storage.deleteBlocksByFile(filePath);
				removed++;
			} else {
				unchanged++;
			}
		}

		// 检查新增文件，后续由阅读材料导入与块文件同步流程处理。
		for (const file of currentFiles) {
			if (!existingFiles.has(file.path)) {
				added++;
			}
		}

		logger.info(
			`[IRDeckManager] 刷新牌组 ${deckPath}: 新增 ${added}, 删除 ${removed}, 不变 ${unchanged}`
		);

		return { added, removed, unchanged };
	}
}
