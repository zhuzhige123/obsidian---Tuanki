/** 负责增量阅读相关 JSON 存储的读写与目录初始化。 */

import { App, TFile, TFolder, normalizePath } from "obsidian";
import {
	PATHS,
	getReadableWeaveRoot,
	getV2PathsFromApp,
	normalizeWeaveParentFolder,
	resolveIRImportFolder,
} from "../../config/paths";
import type {
	FileSyncState,
	IRBlock,
	IRBlocksStore,
	IRDeck,
	IRDecksStore,
	IRHistoryStore,
	IRSession,
	IRStudySession,
	IRStudySessionStore,
	IRSyncStateStore,
} from "../../types/ir-types";
import { IR_STORAGE_VERSION } from "../../types/ir-types";
import {
	IR_LEGACY_DECKS_FILE,
	IR_TOPICS_FILE,
	READING_LEGACY_DECK_YAML_KEY,
	READING_TOPIC_YAML_KEY,
	buildTopicStore,
	extractReadingTopicIdFromFrontmatter,
	getTaskTopicId,
	normalizeChunkForRuntime,
	normalizeIRSessionForRuntime,
	normalizeStudySessionForRuntime,
	normalizeTopicStoreRecords,
	serializeChunkForStorage,
	serializeIRSessionForStorage,
	serializeStudySessionForStorage,
} from "../../utils/ir-topic-compat";
import { logger } from "../../utils/logger";
import { parseYAMLFromContent, setCardProperty } from "../../utils/yaml-utils";
import { IREpubBookmarkTaskService } from "./IREpubBookmarkTaskService";
import { IRPdfBookmarkTaskService } from "./IRPdfBookmarkTaskService";

const BLOCKS_FILE = "blocks.json";
const DECKS_FILE = IR_LEGACY_DECKS_FILE;
const TOPICS_FILE = IR_TOPICS_FILE;
const HISTORY_FILE = "history.json";
const SYNC_STATE_FILE = "sync-state.json";
const CALENDAR_PROGRESS_FILE = "calendar-progress.json";

export class IRStorageService {
	private app: App;
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	private migratedChunkReadablePaths = false;
	private migratedSourceReadablePaths = false;
	private migratedBlockReadablePaths = false;
	private migratedDeckReadablePaths = false;

	constructor(app: App) {
		this.app = app;
	}

	private getStorageDir(): string {
		return getV2PathsFromApp(this.app).ir.root;
	}

	private getTopicsFilePath(): string {
		return `${this.getStorageDir()}/${TOPICS_FILE}`;
	}

	private getLegacyDecksFilePath(): string {
		return `${this.getStorageDir()}/${DECKS_FILE}`;
	}

	private buildSerializedChunkStore(
		chunks: Record<string, import("../../types/ir-types").IRChunkFileData>
	): import("../../types/ir-types").IRChunksStore {
		return {
			version: IR_STORAGE_VERSION,
			chunks: Object.fromEntries(
				Object.entries(chunks).map(([chunkId, chunk]) => [chunkId, serializeChunkForStorage(chunk)])
			),
		};
	}

	private validateDeckNameUniqueness(decks: Record<string, IRDeck>, deck: IRDeck): string {
		const normalizedName = String(deck.name || "").trim();
		if (!normalizedName) {
			throw new Error("牌组名称不能为空");
		}

		const duplicateDeck = Object.values(decks).find(
			(existingDeck) =>
				existingDeck.id !== deck.id && String(existingDeck.name || "").trim() === normalizedName
		);

		if (duplicateDeck) {
			throw new Error(`牌组名称「${normalizedName}」已存在`);
		}

		return normalizedName;
	}

	private coerceToVaultPath(p: string): string {
		const normalized = normalizePath(p);
		if (normalized.startsWith("weave/") || normalized === "weave") return normalized;
		if (normalized.startsWith(".weave/") || normalized === ".weave") return normalized;

		const weaveIdx = normalized.indexOf("/weave/");
		if (weaveIdx >= 0) {
			return normalized.slice(weaveIdx + 1);
		}

		const dotWeaveIdx = normalized.indexOf("/.weave/");
		if (dotWeaveIdx >= 0) {
			return normalized.slice(dotWeaveIdx + 1);
		}

		return normalized;
	}

	private getReadableRoots(): { legacyRoot: string; currentRoot: string } | null {
		try {
			const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
			const parentFolder = normalizeWeaveParentFolder(plugin?.settings?.weaveParentFolder);
			let currentRoot = normalizePath(getReadableWeaveRoot(parentFolder));

			if (!parentFolder) {
				const importFolder = plugin?.settings?.incrementalReading?.importFolder;
				if (typeof importFolder === "string" && importFolder.trim()) {
					const normalizedImport = normalizePath(importFolder);
					if (normalizedImport.endsWith("/IR")) {
						const inferred = normalizePath(normalizedImport.slice(0, -3));
						if (inferred.endsWith("/weave") || inferred === "weave") {
							currentRoot = inferred;
						}
					}
				}
			}

			const legacyRoot = normalizePath(getReadableWeaveRoot(undefined));
			if (!currentRoot || !legacyRoot || currentRoot === legacyRoot) return null;
			return { legacyRoot, currentRoot };
		} catch {
			return null;
		}
	}

	private rewriteRootPrefix(p: unknown, fromRoot: string, toRoot: string): string | null {
		if (typeof p !== "string" || !p.trim()) return null;
		const normalized = this.coerceToVaultPath(p);
		if (normalized === fromRoot) return toRoot;
		if (normalized.startsWith(`${fromRoot}/`)) {
			return normalizePath(`${toRoot}/${normalized.slice(fromRoot.length + 1)}`);
		}
		return null;
	}

	private async migrateReadablePathIfNeeded(
		p: unknown,
		fromRoot: string,
		toRoot: string
	): Promise<string | null> {
		const rewritten = this.rewriteRootPrefix(p, fromRoot, toRoot);
		if (!rewritten) return null;

		try {
			const adapter = this.app.vault.adapter;
			const oldPath = this.coerceToVaultPath(String(p));
			const oldExists = await adapter.exists(oldPath);
			if (oldExists) return null;
			const newExists = await adapter.exists(rewritten);
			if (!newExists) return null;
			return rewritten;
		} catch {
			return null;
		}
	}

	/** 初始化存储目录，并复用进行中的初始化任务。 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this.doInitialize();

		try {
			await this.initPromise;
		} finally {
			this.initPromise = null;
		}
	}

	private async doInitialize(): Promise<void> {
		try {
			const storageDir = this.getStorageDir();
			logger.info(`[IRStorageService] ⚡ 开始初始化, STORAGE_DIR=${storageDir}`);

			// 这里只保证基础目录和文件存在，迁移由专门的迁移链负责。
			await this.ensureDirectory(storageDir);
			logger.info(`[IRStorageService] ⚡ 目录创建完成: ${storageDir}`);

			const defaultBlocks: IRBlocksStore = { version: IR_STORAGE_VERSION, blocks: {} };
			const defaultDecks: IRDecksStore = { version: IR_STORAGE_VERSION, decks: {} };
			const defaultHistory: IRHistoryStore = { version: IR_STORAGE_VERSION, sessions: [] };
			const defaultCalendarProgress = { version: IR_STORAGE_VERSION, byDate: {} };
			const defaultChunks = { version: IR_STORAGE_VERSION, chunks: {} };
			const defaultSources = { version: IR_STORAGE_VERSION, sources: {} };

			await Promise.all([
				this.ensureFile(`${storageDir}/${BLOCKS_FILE}`, JSON.stringify(defaultBlocks)),
				this.ensureFile(
					this.getTopicsFilePath(),
					JSON.stringify(buildTopicStore(defaultDecks.decks, IR_STORAGE_VERSION))
				),
				this.ensureFile(`${storageDir}/${HISTORY_FILE}`, JSON.stringify(defaultHistory)),
				this.ensureFile(
					`${storageDir}/${CALENDAR_PROGRESS_FILE}`,
					JSON.stringify(defaultCalendarProgress)
				),
				this.ensureFile(
					`${storageDir}/${IRStorageService.STUDY_SESSIONS_FILE}`,
					'{"version":"1.0","sessions":[]}'
				),
				this.ensureFile(`${storageDir}/chunks.json`, JSON.stringify(defaultChunks)),
				this.ensureFile(`${storageDir}/sources.json`, JSON.stringify(defaultSources)),
			]);

			this.initialized = true;
			logger.info("[IRStorageService] ✅ 存储服务初始化完成");
		} catch (error) {
			logger.error("[IRStorageService] 初始化失败:", error);
			// 保持服务可继续运行，由后续读写退回默认值。
			this.initialized = true;
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * 确保目录存在（使用 adapter）
	 */
	private async ensureDirectory(path: string): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const normalized = normalizePath(path);
			const parts = normalized.split("/").filter(Boolean);
			let current = "";

			for (const part of parts) {
				current = current ? `${current}/${part}` : part;
				const exists = await adapter.exists(current);
				if (!exists) {
					await adapter.mkdir(current);
				}
			}
		} catch (_e) {
			// 忽略错误，目录可能已存在
		}
	}

	/**
	 * 确保文件存在（使用 adapter）
	 */
	private async ensureFile(path: string, defaultContent: string): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(path);
			if (!exists) {
				// 确保父目录存在
				const dir = path.substring(0, path.lastIndexOf("/"));
				if (dir) {
					await this.ensureDirectory(dir);
				}
				await adapter.write(path, defaultContent);
			}
		} catch (e) {
			logger.warn(`[IRStorageService] 确保文件存在失败: ${path}`, e);
		}
	}

	// ============================================
	// 内容块操作
	// ============================================

	/** 返回所有内容块，并在需要时修正可读根目录路径。 */
	async getAllBlocks(): Promise<Record<string, IRBlock>> {
		await this.initialize();

		const storageDir = this.getStorageDir();

		const content = await this.readFile(
			`${storageDir}/${BLOCKS_FILE}`,
			'{"version":"2.0","blocks":{}}'
		);
		try {
			const data = JSON.parse(content);

			if (data.version && data.blocks) {
				if (!this.migratedBlockReadablePaths) {
					const roots = this.getReadableRoots();
					if (roots && data.blocks && typeof data.blocks === "object") {
						let changed = false;
						for (const block of Object.values(data.blocks as Record<string, any>)) {
							if (!block || typeof block !== "object") continue;
							const current = (block as any).filePath;
							const rewritten = await this.migrateReadablePathIfNeeded(
								current,
								roots.legacyRoot,
								roots.currentRoot
							);
							if (rewritten) {
								(block as any).filePath = rewritten;
								changed = true;
							}
						}
						if (changed) {
							await this.writeFile(`${storageDir}/${BLOCKS_FILE}`, JSON.stringify(data));
						}
					}
					this.migratedBlockReadablePaths = true;
				}

				return data.blocks as Record<string, IRBlock>;
			}

			if (!this.migratedBlockReadablePaths && data && typeof data === "object") {
				const roots = this.getReadableRoots();
				if (roots) {
					let changed = false;
					for (const block of Object.values(data as Record<string, any>)) {
						if (!block || typeof block !== "object") continue;
						const current = (block as any).filePath;
						const rewritten = await this.migrateReadablePathIfNeeded(
							current,
							roots.legacyRoot,
							roots.currentRoot
						);
						if (rewritten) {
							(block as any).filePath = rewritten;
							changed = true;
						}
					}
					if (changed) {
						await this.writeFile(`${storageDir}/${BLOCKS_FILE}`, JSON.stringify(data));
					}
				}
				this.migratedBlockReadablePaths = true;
			}

			return data as Record<string, IRBlock>;
		} catch (error) {
			logger.error("[IRStorageService] 解析内容块JSON失败:", error);
			return {};
		}
	}

	/** 获取单个内容块。 */
	async getBlock(id: string): Promise<IRBlock | null> {
		const blocks = await this.getAllBlocks();
		return blocks[id] || null;
	}

	/** 获取牌组下的内容块，优先使用 blockIds，必要时回退到旧的 deckPath。 */
	async getBlocksByDeck(
		deckId: string,
		includeIgnored = false,
		caller = "unknown"
	): Promise<IRBlock[]> {
		const blocks = await this.getAllBlocks();
		const deck = await this.getDeckById(deckId);

		logger.info(
			`[IRStorageService] getBlocksByDeck [${caller}]: deckId=${deckId}, deck found=${!!deck}, blockIds count=${
				deck?.blockIds?.length || 0
			}, all blocks count=${Object.keys(blocks).length}`
		);

		const filterIgnored = (block: IRBlock): boolean => {
			if (includeIgnored) return true;
			if (block.state === "suspended") return false;
			const hasIgnoreInTags =
				block.tags?.some(
					(tag) => tag.toLowerCase() === "ignore" || tag.toLowerCase() === "#ignore"
				) || false;
			const hasIgnoreInContent = /#ignore\b/i.test(block.contentPreview || "");
			if (hasIgnoreInTags || hasIgnoreInContent) return false;
			return true;
		};

		if (deck?.blockIds && deck.blockIds.length > 0) {
			const blockKeys = Object.keys(blocks);
			const matchedCount = deck.blockIds.filter((id) => blocks[id] !== undefined).length;
			logger.info(
				`[IRStorageService] getBlocksByDeck: blockIds=${deck.blockIds.length}, blocks键数=${blockKeys.length}, 匹配数=${matchedCount}`
			);
			// 仅在索引完全失配时补充样本，方便定位旧数据或引用残留。
			if (matchedCount === 0 && deck.blockIds.length > 0) {
				logger.warn(
					`[IRStorageService] ⚠️ ID不匹配！blockIds前3个: ${JSON.stringify(
						deck.blockIds.slice(0, 3)
					)}, blocks键前3个: ${JSON.stringify(blockKeys.slice(0, 3))}`
				);
			}

			const result = deck.blockIds
				.map((id) => blocks[id])
				.filter((block): block is IRBlock => block !== undefined)
				.filter(filterIgnored);
			return result;
		}

		const deckPath = deck?.path || deckId;
		const allBlockValues = Object.values(blocks);

		const v1Result = allBlockValues
			.filter((block) => block.deckPath === deckId || block.deckPath === deckPath)
			.filter(filterIgnored);
		return v1Result;
	}

	/** 获取文件下的所有内容块，并按行号排序。 */
	async getBlocksByFile(filePath: string): Promise<IRBlock[]> {
		const blocks = await this.getAllBlocks();
		return Object.values(blocks)
			.filter((block) => block.filePath === filePath)
			.sort((a, b) => (a.startLine ?? a.blockIndex ?? 0) - (b.startLine ?? b.blockIndex ?? 0));
	}

	/**
	 * 保存内容块（版本化存储）
	 */
	async saveBlock(block: IRBlock): Promise<void> {
		await this.initialize();

		const storageDir = this.getStorageDir();

		const blocks = await this.getAllBlocks();
		blocks[block.id] = block;

		const store: IRBlocksStore = {
			version: IR_STORAGE_VERSION,
			blocks,
		};

		await this.writeFile(`${storageDir}/${BLOCKS_FILE}`, JSON.stringify(store));
	}

	/**
	 * 批量保存内容块（版本化存储）
	 */
	async saveBlocks(newBlocks: IRBlock[]): Promise<void> {
		await this.initialize();

		const storageDir = this.getStorageDir();

		const blocks = await this.getAllBlocks();

		for (const block of newBlocks) {
			blocks[block.id] = block;
		}

		const store: IRBlocksStore = {
			version: IR_STORAGE_VERSION,
			blocks,
		};

		await this.writeFile(`${storageDir}/${BLOCKS_FILE}`, JSON.stringify(store));
	}

	/**
	 * 删除内容块（版本化存储）
	 * 实现级联删除，自动从所有牌组的 blockIds 中移除该 UUID
	 */
	async deleteBlock(id: string): Promise<void> {
		await this.initialize();

		const storageDir = this.getStorageDir();

		const blocks = await this.getAllBlocks();
		const deletedBlock = blocks[id];
		delete blocks[id];

		const store: IRBlocksStore = {
			version: IR_STORAGE_VERSION,
			blocks,
		};

		await this.writeFile(`${storageDir}/${BLOCKS_FILE}`, JSON.stringify(store));

		// 级联删除：从所有牌组中移除该内容块引用
		await this.removeBlockFromAllDecks(id, deletedBlock?.filePath);
	}

	/**
	 * 从所有牌组中移除指定内容块引用
	 * @param blockId 要移除的内容块ID
	 * @param filePath 内容块所属文件路径（用于更新 sourceFiles）
	 */
	private async removeBlockFromAllDecks(blockId: string, filePath?: string): Promise<void> {
		const decks = await this.getAllDecks();
		let _updatedCount = 0;

		for (const deck of Object.values(decks)) {
			if (deck.blockIds?.includes(blockId)) {
				// 移除内容块引用
				deck.blockIds = deck.blockIds.filter((_id) => _id !== blockId);
				deck.updatedAt = new Date().toISOString();

				// 如果该文件在牌组中不再有内容块，从 sourceFiles 中移除
				if (filePath && deck.sourceFiles?.includes(filePath)) {
					const blocks = await this.getAllBlocks();
					const hasOtherBlocks = deck.blockIds.some((id) => blocks[id]?.filePath === filePath);
					if (!hasOtherBlocks) {
						deck.sourceFiles = deck.sourceFiles.filter((_f) => _f !== filePath);
					}
				}

				await this.saveDeck(deck);
				_updatedCount++;
			}
		}

		// 静默移除引用
	}

	/**
	 * 删除文件的所有内容块（版本化存储）
	 * 实现级联删除，自动从所有牌组中移除这些内容块引用和 sourceFiles
	 */
	async deleteBlocksByFile(filePath: string): Promise<void> {
		await this.initialize();

		const storageDir = this.getStorageDir();

		const blocks = await this.getAllBlocks();
		const idsToDelete = Object.keys(blocks).filter((id) => blocks[id].filePath === filePath);

		for (const id of idsToDelete) {
			delete blocks[id];
		}

		const store: IRBlocksStore = {
			version: IR_STORAGE_VERSION,
			blocks,
		};

		await this.writeFile(`${storageDir}/${BLOCKS_FILE}`, JSON.stringify(store));

		// 级联删除：从所有牌组中移除这些内容块引用和文件引用
		if (idsToDelete.length > 0) {
			await this.removeBlocksFromAllDecks(idsToDelete, filePath);
		}
	}

	/**
	 * 从所有牌组中批量移除内容块引用
	 * @param blockIds 要移除的内容块ID列表
	 * @param filePath 内容块所属文件路径（用于更新 sourceFiles）
	 */
	private async removeBlocksFromAllDecks(blockIds: string[], filePath: string): Promise<void> {
		const decks = await this.getAllDecks();
		const idsToRemove = new Set(blockIds);
		let _updatedCount = 0;

		for (const deck of Object.values(decks)) {
			const originalLength = deck.blockIds?.length || 0;

			// 移除内容块引用
			deck.blockIds = (deck.blockIds || []).filter((id) => !idsToRemove.has(id));

			if (deck.blockIds.length < originalLength) {
				deck.updatedAt = new Date().toISOString();

				// 从 sourceFiles 中移除该文件
				if (deck.sourceFiles?.includes(filePath)) {
					deck.sourceFiles = deck.sourceFiles.filter((_f) => _f !== filePath);
				}

				await this.saveDeck(deck);
				_updatedCount++;
			}
		}

		// 静默移除引用
	}

	// ============================================
	// 牌组操作
	// ============================================

	/** 返回所有牌组，并在需要时修正 sourceFiles 路径。 */
	async getAllDecks(): Promise<Record<string, IRDeck>> {
		await this.initialize();

		const adapter = this.app.vault.adapter;
		const topicsPath = this.getTopicsFilePath();
		const legacyDecksPath = this.getLegacyDecksFilePath();
		const storePath = (await adapter.exists(topicsPath)) ? topicsPath : legacyDecksPath;
		const content = await this.readFile(storePath, '{"version":"2.0","topics":{}}');
		try {
			const data = JSON.parse(content);
			const decks = normalizeTopicStoreRecords(data);

			if (!this.migratedDeckReadablePaths && decks && typeof decks === "object") {
				const roots = this.getReadableRoots();
				if (roots) {
					let changed = false;
					for (const deck of Object.values(decks as Record<string, any>)) {
						if (!deck || typeof deck !== "object") continue;
						const srcFiles = (deck as any).sourceFiles;
						if (Array.isArray(srcFiles)) {
							for (let i = 0; i < srcFiles.length; i++) {
								const rewritten = await this.migrateReadablePathIfNeeded(
									srcFiles[i],
									roots.legacyRoot,
									roots.currentRoot
								);
								if (rewritten) {
									srcFiles[i] = rewritten;
									changed = true;
								}
							}
						}
					}
					if (changed) {
						const payload =
							storePath === topicsPath
								? buildTopicStore(decks, IR_STORAGE_VERSION)
								: { version: IR_STORAGE_VERSION, decks };
						await this.writeFile(storePath, JSON.stringify(payload));
					}
				}
				this.migratedDeckReadablePaths = true;
			}

			return decks as Record<string, IRDeck>;
		} catch (error) {
			logger.error("[IRStorageService] 解析牌组JSON失败:", error);
			return {};
		}
	}

	/** @deprecated 建议改用 `getDeckById()`。 */
	async getDeck(path: string): Promise<IRDeck | null> {
		return await this.getDeckById(path);
	}

	/** 通过牌组 ID 查找，并兼容旧数据里的 path。 */
	async getDeckById(idOrPath: string): Promise<IRDeck | null> {
		const decks = await this.getAllDecks();
		return this.findDeckByIdentifier(decks, idOrPath);
	}

	/** 在牌组表中按 ID 或旧 path 字段查找牌组。 */
	private findDeckByIdentifier(
		decks: Record<string, IRDeck>,
		idOrPath: string
	): IRDeck | null {
		if (decks[idOrPath]) {
			return decks[idOrPath];
		}

		return Object.values(decks).find((deck) => deck.path === idOrPath) || null;
	}

	async migrateChunkDeckNameInYAML(
		oldName: string,
		newName: string
	): Promise<{ scanned: number; updated: number }> {
		await this.initialize();

		const fromName = String(oldName || "").trim();
		const toName = String(newName || "").trim();
		if (!fromName || !toName || fromName === toName) {
			return { scanned: 0, updated: 0 };
		}

		const normalizeDeckNameForTag = (name: string): string => {
			return (
				String(name || "")
					.trim()
					.replace(/[\s/\\#]+/g, "_")
					.replace(/_+/g, "_")
					.replace(/^_+|_+$/g, "") || "未分配"
			);
		};

		const fromSeg = normalizeDeckNameForTag(fromName);
		const toSeg = normalizeDeckNameForTag(toName);
		const fromTag = `ir/deck/${fromSeg}`;
		const toTag = `ir/deck/${toSeg}`;

		const chunks = await this.getAllChunkData();
		const adapter = this.app.vault.adapter;

		const visited = new Set<string>();
		let scanned = 0;
		let updated = 0;

		for (const chunk of Object.values(chunks)) {
			const filePath = String(chunk.filePath || "").trim();
			if (!filePath || visited.has(filePath)) continue;
			visited.add(filePath);

			try {
				if (!(await adapter.exists(filePath))) continue;
				const content = await adapter.read(filePath);
				scanned++;

				const yaml = parseYAMLFromContent(content);
				if ((yaml as any).weave_type !== "ir-chunk") continue;

				const rawDeckNames = (yaml as any).topic_names ?? (yaml as any).deck_names;
				let deckNames: string[] = [];
				if (Array.isArray(rawDeckNames)) {
					deckNames = rawDeckNames.map((n: any) => String(n).trim()).filter(Boolean);
				} else if (typeof rawDeckNames === "string" && rawDeckNames.trim()) {
					deckNames = [rawDeckNames.trim()];
				}

				const rawDeckTag =
					typeof ((yaml as any).topic_tag ?? (yaml as any).deck_tag) === "string"
						? String((yaml as any).topic_tag ?? (yaml as any).deck_tag)
						: "";
				const inferredFromTag = rawDeckTag === `#IR_deck_${fromName}`;

				const hasOld = deckNames.includes(fromName);
				if (!hasOld && !inferredFromTag) continue;

				const nextDeckNames =
					deckNames.length > 0 ? deckNames.map((_n) => (_n === fromName ? toName : _n)) : [toName];

				let nextContent = content;
				nextContent = setCardProperty(nextContent, "topic_names", nextDeckNames);
				nextContent = setCardProperty(nextContent, "deck_names", undefined);

				const rawTags = (yaml as any).tags;
				const tagsArr = Array.isArray(rawTags)
					? rawTags.map((t: any) => String(t).trim()).filter(Boolean)
					: typeof rawTags === "string" && rawTags.trim()
					? [rawTags.trim()]
					: [];
				const tags = new Set<string>(tagsArr);
				tags.add("ir/deck");
				tags.delete(fromTag);
				tags.add(toTag);
				nextContent = setCardProperty(nextContent, "tags", Array.from(tags));

				if (rawDeckTag === `#IR_deck_${fromName}`) {
					nextContent = setCardProperty(nextContent, "topic_tag", `#IR_deck_${toName}`);
					nextContent = setCardProperty(nextContent, "deck_tag", undefined);
				}

				if (nextContent !== content) {
					await adapter.write(filePath, nextContent);
					updated++;
				}
			} catch (error) {
				logger.warn(`[IRStorageService] 迁移块文件牌组名称失败: ${chunk.filePath}`, error);
			}
		}

		if (updated > 0) {
			await this.syncDeckDataFromYAML();
		}

		return { scanned, updated };
	}

	/**
	 * 保存牌组（版本化存储）
	 */
	async saveDeck(deck: IRDeck): Promise<void> {
		await this.initialize();

		const decks = await this.getAllDecks();
		const normalizedName = this.validateDeckNameUniqueness(decks, deck);
		const normalizedDeck: IRDeck = {
			...deck,
			name: normalizedName,
		};
		// 使用 id 作为键
		const key = normalizedDeck.id || normalizedDeck.path || "";
		decks[key] = normalizedDeck;

		const store = buildTopicStore(decks, IR_STORAGE_VERSION);

		await this.writeFile(this.getTopicsFilePath(), JSON.stringify(store));
	}

	/**
	 * 删除牌组（版本化存储，兼容 id 和 path 查找）
	 */
	async deleteDeck(idOrPath: string): Promise<void> {
		await this.initialize();

		const _storageDir = this.getStorageDir();
		const decks = await this.getAllDecks();

		let deckKey: string | null = null;
		let targetDeck: IRDeck | null = null;

		if (decks[idOrPath]) {
			deckKey = idOrPath;
			targetDeck = decks[idOrPath];
		} else {
			const matchedKey = Object.keys(decks).find((key) => decks[key].path === idOrPath);
			if (matchedKey) {
				deckKey = matchedKey;
				targetDeck = decks[matchedKey];
			}
		}

		if (!deckKey || !targetDeck) {
			logger.warn(`[IRStorageService] 未找到牌组: ${idOrPath}`);
			return;
		}

		const targetDeckId = targetDeck.id || deckKey;
		const targetDeckPath = targetDeck.path || targetDeckId;
		const targetDeckName = String(targetDeck.name || "").trim();
		const targetDeckTag = targetDeckName ? `#IR_deck_${targetDeckName}` : undefined;
		const sourceFiles = Array.isArray(targetDeck.sourceFiles)
			? [...new Set(targetDeck.sourceFiles)]
			: [];

		await this.cleanupDeletedDeckRelatedData({
			deckId: targetDeckId,
			deckPath: targetDeckPath,
			deckName: targetDeckName,
			deckTag: targetDeckTag,
			sourceFiles,
		});

		delete decks[deckKey];

		const store = buildTopicStore(decks, IR_STORAGE_VERSION);

		await this.writeFile(this.getTopicsFilePath(), JSON.stringify(store));
	}

	private async cleanupDeletedDeckRelatedData(params: {
		deckId: string;
		deckPath: string;
		deckName: string;
		deckTag?: string;
		sourceFiles: string[];
	}): Promise<void> {
		const { deckId, deckPath, deckName, deckTag, sourceFiles } = params;
		const deckIdentifiers = this.toNormalizedStringSet([deckId, deckPath, deckName]);

		await this.cleanupDeckBookmarkTasks(deckId, deckIdentifiers, sourceFiles);
		await this.cleanupDeckBlocks(deckId, deckPath);
		await this.cleanupDeckChunksAndSources(deckId, deckTag);
		await this.cleanupDeckStudySessions(deckId, deckPath);
		await this.cleanupDeckSyncStates(sourceFiles);
		await this.cleanupDeckMarkdownFrontmatter(deckIdentifiers, deckId, sourceFiles);
	}

	private async cleanupDeckBookmarkTasks(
		deckId: string,
		deckIdentifiers: Set<string>,
		sourceFiles: string[]
	): Promise<void> {
		const pdfPaths = this.collectSourceFilesByExtension(sourceFiles, ".pdf");
		const epubPaths = this.collectSourceFilesByExtension(sourceFiles, ".epub");

		try {
			const pdfService = new IRPdfBookmarkTaskService(this.app);
			await pdfService.initialize();
			await pdfService.deleteTasksByDeckIdentifiers(Array.from(deckIdentifiers));
			await pdfService.deleteTasksByPdfPaths(pdfPaths);
		} catch (error) {
			logger.warn(`[IRStorageService] 清理 PDF 书签任务失败: ${deckId}`, error);
		}

		try {
			const epubService = new IREpubBookmarkTaskService(this.app);
			await epubService.initialize();
			await epubService.deleteTasksByDeckIdentifiers(Array.from(deckIdentifiers));
			await epubService.deleteTasksByEpubPaths(epubPaths);
		} catch (error) {
			logger.warn(`[IRStorageService] 清理 EPUB 书签任务失败: ${deckId}`, error);
		}
	}

	private toNormalizedStringSet(values: string[]): Set<string> {
		return new Set(
			(Array.isArray(values) ? values : [])
				.map((value) => String(value || "").trim())
				.filter(Boolean)
		);
	}

	private getStudySessionDeckIdentifiers(session: Partial<IRStudySession> | null | undefined): string[] {
		return Array.from(
			this.toNormalizedStringSet([
				String(session?.topicId || ""),
				String(session?.deckId || ""),
			])
		);
	}

	private async collectTasksByDeckIdentifiers<T extends { id?: string }>(
		service: { getTasksByDeck(deckId: string): Promise<T[]>; getAllTasks?: () => Promise<T[]> },
		deckIdentifiers: string[]
	): Promise<T[]> {
		const identifiers = Array.from(this.toNormalizedStringSet(deckIdentifiers));
		if (identifiers.length === 0) {
			return [];
		}

		if (typeof service.getAllTasks === "function") {
			const identifierSet = new Set(identifiers);
			const tasks = await service.getAllTasks();
			return tasks.filter((task) =>
				identifierSet.has(String(getTaskTopicId(task as any) || "").trim())
			);
		}

		const taskMap = new Map<string, T>();

		for (const identifier of identifiers) {
			const tasks = await service.getTasksByDeck(identifier);
			for (const task of tasks) {
				const taskId = String(task?.id || "").trim();
				if (taskId) {
					if (!taskMap.has(taskId)) {
						taskMap.set(taskId, task);
					}
					continue;
				}

				taskMap.set(`${identifier}:${taskMap.size}`, task);
			}
		}

		return Array.from(taskMap.values());
	}

	private collectSourceFilesByExtension(sourceFiles: string[], extension: string): string[] {
		const normalizedExtension = String(extension || "").toLowerCase();
		return Array.from(
			new Set(
				(Array.isArray(sourceFiles) ? sourceFiles : [])
					.map((filePath) => String(filePath || "").trim())
					.filter((filePath) => filePath.toLowerCase().endsWith(normalizedExtension))
			)
		);
	}

	private async cleanupDeckBlocks(deckId: string, deckPath: string): Promise<void> {
		const storageDir = this.getStorageDir();
		const blocks = await this.getAllBlocks();
		let changed = false;

		for (const [blockId, block] of Object.entries(blocks)) {
			if (block.deckPath === deckId || block.deckPath === deckPath) {
				delete blocks[blockId];
				changed = true;
			}
		}

		if (!changed) return;

		const store: IRBlocksStore = {
			version: IR_STORAGE_VERSION,
			blocks,
		};

		await this.writeFile(`${storageDir}/${BLOCKS_FILE}`, JSON.stringify(store));
	}

	private async cleanupDeckChunksAndSources(deckId: string, deckTag?: string): Promise<void> {
		const storageDir = this.getStorageDir();
		const chunks = await this.getAllChunkData();
		const chunkEntries = Object.entries(chunks);
		const removedChunkIds = new Set<string>();

		for (const [chunkId, chunk] of chunkEntries) {
			const inDeckIds = Array.isArray(chunk.deckIds) && chunk.deckIds.includes(deckId);
			const inDeckTag = Boolean(deckTag) && chunk.deckTag === deckTag;
			if (inDeckIds || inDeckTag) {
				delete chunks[chunkId];
				removedChunkIds.add(chunkId);
			}
		}

		if (removedChunkIds.size > 0) {
			const chunkStore = this.buildSerializedChunkStore(chunks);
			await this.writeFile(`${storageDir}/${this.CHUNKS_FILE}`, JSON.stringify(chunkStore));
		}

		const sources = await this.getAllSources();
		let sourcesChanged = false;
		const remainingChunks = Object.values(chunks);

		for (const [sourceId] of Object.entries(sources)) {
			const stillReferenced = remainingChunks.some((chunk) => chunk.sourceId === sourceId);
			if (!stillReferenced) {
				delete sources[sourceId];
				sourcesChanged = true;
			}
		}

		if (sourcesChanged) {
			const sourceStore: import("../../types/ir-types").IRSourcesStore = {
				version: IR_STORAGE_VERSION,
				sources,
			};
			await this.writeFile(`${storageDir}/${this.SOURCES_FILE}`, JSON.stringify(sourceStore));
		}
	}

	private async cleanupDeckStudySessions(deckId: string, deckPath: string): Promise<void> {
		const sessions = await this.getStudySessions();
		const deckIdentifiers = this.toNormalizedStringSet([deckId, deckPath]);
		const filtered = sessions.filter(
			(session) =>
				!this.getStudySessionDeckIdentifiers(session).some((identifier) =>
					deckIdentifiers.has(identifier)
				)
		);
		if (filtered.length === sessions.length) return;

		const store: IRStudySessionStore = {
			version: "1.0",
			sessions: filtered,
		};

		await this.writeFile(
			`${this.getStorageDir()}/${IRStorageService.STUDY_SESSIONS_FILE}`,
			JSON.stringify(store)
		);
	}

	private async cleanupDeckSyncStates(sourceFiles: string[]): Promise<void> {
		if (sourceFiles.length === 0) return;

		const states = await this.getAllSyncStates();
		let changed = false;

		for (const filePath of sourceFiles) {
			if (states[filePath]) {
				delete states[filePath];
				changed = true;
			}
		}

		if (changed) {
			await this.saveSyncStates(states);
		}
	}

	private async cleanupDeckMarkdownFrontmatter(
		deckIdentifiers: Set<string>,
		deckId: string,
		sourceFiles: string[]
	): Promise<void> {
		if (sourceFiles.length === 0) return;

		const remainingDecks = await this.getAllDecks();
		const remainingSourceFileSet = new Set<string>();
		for (const deck of Object.values(remainingDecks)) {
			if (deck.id === deckId) continue;
			for (const filePath of deck.sourceFiles || []) {
				remainingSourceFileSet.add(filePath);
			}
		}

		for (const filePath of sourceFiles) {
			if (!filePath.endsWith(".md")) continue;
			if (remainingSourceFileSet.has(filePath)) continue;

			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) continue;

			try {
				await this.cleanupMarkdownReadingFrontmatter(file, {
					deckIdentifiers,
				});
			} catch (error) {
				logger.warn(
					`[IRStorageService] 清理 Markdown 增量阅读 frontmatter 失败: ${filePath}`,
					error
				);
			}
		}
	}

	private async cleanupMarkdownReadingFrontmatter(
		file: TFile,
		options: {
			deckIdentifiers?: Set<string>;
			addDeletedTag?: boolean;
			removeExternalDocumentFields?: boolean;
		} = {}
	): Promise<void> {
		const {
			deckIdentifiers,
			addDeletedTag = false,
			removeExternalDocumentFields = false,
		} = options;

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const readingDeckId = extractReadingTopicIdFromFrontmatter(frontmatter) || "";
			const hasPluginFields =
				frontmatter["weave-reading-id"] !== undefined ||
				frontmatter["weave-reading-category"] !== undefined ||
				frontmatter["weave-reading-priority"] !== undefined ||
				frontmatter[READING_TOPIC_YAML_KEY] !== undefined ||
				frontmatter[READING_LEGACY_DECK_YAML_KEY] !== undefined;

			if (!hasPluginFields) {
				return;
			}

			if (deckIdentifiers && readingDeckId && !deckIdentifiers.has(readingDeckId)) {
				return;
			}

			frontmatter["weave-reading-id"] = undefined;
			frontmatter["weave-reading-category"] = undefined;
			frontmatter["weave-reading-priority"] = undefined;
			delete frontmatter[READING_TOPIC_YAML_KEY];
			delete frontmatter[READING_LEGACY_DECK_YAML_KEY];

			if (removeExternalDocumentFields) {
				const status =
					typeof frontmatter.status === "string"
						? String(frontmatter.status).trim().toLowerCase()
						: "";
				if (["active", "processing", "done", "archived", "removed"].includes(status)) {
					frontmatter.status = undefined;
				}

				frontmatter.priority_ui = undefined;

				const deckTag =
					typeof (frontmatter.topic_tag ?? frontmatter.deck_tag) === "string"
						? String(frontmatter.topic_tag ?? frontmatter.deck_tag).trim()
						: "";
				if (deckTag.startsWith("#IR_deck_")) {
					frontmatter.topic_tag = undefined;
					frontmatter.deck_tag = undefined;
				}

				if (Array.isArray(frontmatter.topic_names)) {
					frontmatter.topic_names = undefined;
				}
				if (Array.isArray(frontmatter.deck_names)) {
					frontmatter.deck_names = undefined;
				}

				if (typeof frontmatter.chunk_id === "string") {
					frontmatter.chunk_id = undefined;
				}

				if (typeof frontmatter.source_id === "string") {
					frontmatter.source_id = undefined;
				}

				if (frontmatter.weave_type === "ir-chunk") {
					frontmatter.weave_type = undefined;
				}
			}

			if (addDeletedTag) {
				frontmatter.tags = this.mergeFrontmatterTag(frontmatter.tags, "we_已删除");
			}
		});
	}

	private mergeFrontmatterTag(existingTags: unknown, tagToAdd: string): string[] {
		const normalizedTags = Array.isArray(existingTags)
			? existingTags
					.filter((tag): tag is string => typeof tag === "string")
					.map((tag) => tag.trim())
					.filter(Boolean)
			: typeof existingTags === "string"
			? existingTags
					.split(",")
					.map((tag) => tag.trim())
					.filter(Boolean)
			: [];

		const normalizedTarget = tagToAdd.replace(/^#/, "").toLowerCase();
		const hasTarget = normalizedTags.some(
			(tag) => tag.replace(/^#/, "").toLowerCase() === normalizedTarget
		);
		return hasTarget ? normalizedTags : [...normalizedTags, tagToAdd];
	}

	private async removeChunkFromAllDecksAfterDeletion(
		chunkId: string,
		sourcePath: string | undefined,
		sourceId: string | undefined,
		remainingChunks: import("../../types/ir-types").IRChunkFileData[]
	): Promise<void> {
		const decks = await this.getAllDecks();
		const remainingChunkMap = new Map(remainingChunks.map((chunk) => [chunk.chunkId, chunk]));

		for (const deck of Object.values(decks)) {
			const originalLength = deck.blockIds?.length || 0;
			deck.blockIds = (deck.blockIds || []).filter((_id) => _id !== chunkId);

			if (deck.blockIds.length >= originalLength) {
				continue;
			}

			deck.updatedAt = new Date().toISOString();

			if (sourcePath && deck.sourceFiles?.includes(sourcePath)) {
				const hasSiblingChunksFromSameSource = deck.blockIds.some((_id) => {
					const chunk = remainingChunkMap.get(_id);
					if (!chunk) return false;
					if (sourceId) {
						return chunk.sourceId === sourceId;
					}
					return chunk.filePath === sourcePath;
				});

				if (!hasSiblingChunksFromSameSource) {
					deck.sourceFiles = deck.sourceFiles.filter((_filePath) => _filePath !== sourcePath);
				}
			}

			await this.saveDeck(deck);
		}
	}

	/**
	 * 向牌组添加内容块
	 */
	async addBlocksToDeck(deckId: string, blockIds: string[]): Promise<void> {
		const deck = await this.getDeckById(deckId);
		if (!deck) {
			logger.warn(`[IRStorageService] 牌组不存在: ${deckId}`);
			return;
		}

		// 添加新的blockIds，去重
		const existingIds = new Set(deck.blockIds || []);
		for (const id of blockIds) {
			existingIds.add(id);
		}
		deck.blockIds = Array.from(existingIds);
		deck.updatedAt = new Date().toISOString();

		// 更新sourceFiles
		const blocks = await this.getAllBlocks();
		const files = new Set(deck.sourceFiles || []);
		for (const id of blockIds) {
			const block = blocks[id];
			if (block?.filePath) {
				files.add(block.filePath);
			}
		}
		deck.sourceFiles = Array.from(files);

		await this.saveDeck(deck);
	}

	/**
	 * 从牌组移除内容块
	 */
	async removeBlocksFromDeck(deckId: string, blockIds: string[]): Promise<void> {
		const deck = await this.getDeckById(deckId);
		if (!deck) {
			logger.warn(`[IRStorageService] 牌组不存在: ${deckId}`);
			return;
		}

		const idsToRemove = new Set(blockIds);
		deck.blockIds = (deck.blockIds || []).filter((id) => !idsToRemove.has(id));
		deck.updatedAt = new Date().toISOString();

		await this.saveDeck(deck);
	}

	// ============================================
	// 历史记录操作
	// ============================================

	/**
	 * 获取阅读历史（支持版本化结构）
	 */
	async getHistory(): Promise<{ sessions: IRSession[] }> {
		await this.initialize();

		const storageDir = this.getStorageDir();

		const content = await this.readFile(
			`${storageDir}/${HISTORY_FILE}`,
			'{"version":"2.0","sessions":[]}'
		);
		try {
			const data = JSON.parse(content);

			// 版本化结构
			if (data.version && data.sessions) {
				return {
					sessions: (data.sessions as IRSession[]).map((session) =>
						normalizeIRSessionForRuntime(session)
					),
				};
			}

			// v1.0 兼容
			return {
				sessions: (data.sessions || []).map((session: IRSession) =>
					normalizeIRSessionForRuntime(session)
				),
			};
		} catch (error) {
			logger.error("[IRStorageService] 解析历史JSON失败:", error);
			return { sessions: [] };
		}
	}

	/**
	 * 添加阅读会话（版本化存储）
	 */
	async addSession(session: IRSession): Promise<void> {
		await this.initialize();

		const storageDir = this.getStorageDir();

		const history = await this.getHistory();
		history.sessions.push(session);

		// 只保留最近1000条记录
		if (history.sessions.length > 1000) {
			history.sessions = history.sessions.slice(-1000);
		}

		const store: IRHistoryStore = {
			version: IR_STORAGE_VERSION,
			sessions: history.sessions.map((entry) => serializeIRSessionForStorage(entry)),
		};

		await this.writeFile(`${storageDir}/${HISTORY_FILE}`, JSON.stringify(store));
	}

	/**
	 * 获取内容块的阅读历史
	 */
	async getBlockSessions(blockId: string): Promise<IRSession[]> {
		const history = await this.getHistory();
		return history.sessions.filter((s) => s.blockId === blockId);
	}

	async getCalendarProgress(): Promise<Record<string, string[]>> {
		await this.initialize();

		const storageDir = this.getStorageDir();

		const content = await this.readFile(
			`${storageDir}/${CALENDAR_PROGRESS_FILE}`,
			`{"version":"${IR_STORAGE_VERSION}","byDate":{}}`
		);

		try {
			const data = JSON.parse(content) as { version?: string; byDate?: Record<string, string[]> };
			return data.byDate && typeof data.byDate === "object" ? data.byDate : {};
		} catch (error) {
			logger.error("[IRStorageService] 解析 calendar-progress JSON 失败:", error);
			return {};
		}
	}

	async addCalendarCompletion(dateKey: string, chunkId: string): Promise<void> {
		await this.initialize();

		const storageDir = this.getStorageDir();

		const byDate = await this.getCalendarProgress();
		const current = Array.isArray(byDate[dateKey]) ? byDate[dateKey] : [];
		if (!current.includes(chunkId)) {
			byDate[dateKey] = [...current, chunkId];
		}

		const store = { version: IR_STORAGE_VERSION, byDate };
		await this.writeFile(`${storageDir}/${CALENDAR_PROGRESS_FILE}`, JSON.stringify(store));
	}

	// ============================================
	// 学习会话记录 (v6.0 整场会话级别)
	// ============================================

	private static readonly STUDY_SESSIONS_FILE = "study-sessions.json";

	/**
	 * 获取所有学习会话记录
	 */
	async getStudySessions(): Promise<IRStudySession[]> {
		await this.initialize();

		const adapter = this.app.vault.adapter;
		const targetPath = `${this.getStorageDir()}/${IRStorageService.STUDY_SESSIONS_FILE}`;

		try {
			const exists = await adapter.exists(targetPath);
			if (!exists) {
				const candidates = new Set<string>();
				candidates.add(`${PATHS.incrementalReading}/${IRStorageService.STUDY_SESSIONS_FILE}`);
				const roots = this.getReadableRoots();
				const readableRoot = roots?.currentRoot || "weave";
				candidates.add(
					`${readableRoot}/incremental-reading/${IRStorageService.STUDY_SESSIONS_FILE}`
				);

				for (const legacyPath of candidates) {
					if (await adapter.exists(legacyPath)) {
						const legacyContent = await adapter.read(legacyPath);
						await this.writeFile(targetPath, legacyContent);
						break;
					}
				}
			}
		} catch (error) {
			logger.warn("[IRStorageService] 检测/迁移学习会话文件失败:", error);
		}

		const content = await this.readFile(targetPath, '{"version":"1.0","sessions":[]}');
		try {
			const data = JSON.parse(content) as IRStudySessionStore;
			return (data.sessions || []).map((session) => normalizeStudySessionForRuntime(session));
		} catch (error) {
			logger.error("[IRStorageService] 解析学习会话JSON失败:", error);
			return [];
		}
	}

	/**
	 * 添加学习会话记录
	 */
	async addStudySession(session: IRStudySession): Promise<void> {
		await this.initialize();

		const sessions = await this.getStudySessions();
		sessions.push(session);

		// 保留最近500条记录（会话级别的记录较大，控制数量）
		const trimmedSessions = sessions.length > 500 ? sessions.slice(-500) : sessions;

		const store: IRStudySessionStore = {
			version: "1.0",
			sessions: trimmedSessions.map((session) => serializeStudySessionForStorage(session)),
		};

		await this.writeFile(
			`${this.getStorageDir()}/${IRStorageService.STUDY_SESSIONS_FILE}`,
			JSON.stringify(store)
		);
		logger.info(
			`[IRStorageService] 添加学习会话: ${session.id}, 时长: ${session.confirmedDuration}秒`
		);
	}

	/**
	 * 获取指定牌组的学习会话
	 */
	async getStudySessionsByDeck(deckId: string): Promise<IRStudySession[]> {
		const sessions = await this.getStudySessions();
		const deck = await this.getDeckById(deckId);
		const deckIdentifiers = this.toNormalizedStringSet([deckId, deck?.path || ""]);
		return sessions.filter((session) =>
			this.getStudySessionDeckIdentifiers(session).some((identifier) =>
				deckIdentifiers.has(identifier)
			)
		);
	}

	// ============================================
	// 统计数据
	// ============================================

	/**
	 * 获取牌组统计
	 * v2.4: 新增提问统计（解析复选框+问号语法）
	 * v2.6: 优化性能 - 提问统计改为可选，默认跳过以加快加载
	 * v5.3: 同时统计旧版 IRBlock 和新版 IRChunkFileData
	 * @deprecated 未来计划的权威统计已迁移到 IRWorkspaceSnapshotService.getDeckOverview，本接口仅保留兼容用途。
	 */
	async getDeckStats(
		deckPath: string,
		dailyNewLimit = 20,
		dailyReviewLimit = 50,
		learnAheadDays = 3
	): Promise<{
		newCount: number;
		learningCount: number;
		reviewCount: number;
		dueToday: number;
		dueWithinDays: number;
		totalCount: number;
		fileCount: number;
		questionCount: number;
		completedQuestionCount: number;
		todayNewCount: number;
		todayDueCount: number;
	}> {
		// 旧版 IRBlock 仍可能参与统计，因此这里先汇总 blocks.json 中的内容块。
		const blocks = await this.getBlocksByDeck(deckPath);
		const _today = new Date().toISOString().split("T")[0];
		const _nowMs = Date.now();
		const startOfToday = new Date();
		startOfToday.setHours(0, 0, 0, 0);
		const startMs = startOfToday.getTime();
		const endOfToday = new Date();
		endOfToday.setHours(23, 59, 59, 999);
		const endMs = endOfToday.getTime();
		const dayMs = 24 * 60 * 60 * 1000;
		const safeLearnAheadDays = Math.min(Math.max(learnAheadDays, 1), 14);
		const learnAheadEndMs = endMs + (safeLearnAheadDays - 1) * dayMs;

		const stateDistribution: Record<string, number> = {};
		for (const b of blocks) {
			const s = b.state ?? "undefined";
			stateDistribution[s] = (stateDistribution[s] || 0) + 1;
		}
		logger.info(`[IRStorageService] getDeckStats: state分布=${JSON.stringify(stateDistribution)}`);

		const files = new Set<string>();
		let newCount = 0;
		let learningCount = 0;
		let reviewCount = 0;
		let dueToday = 0;
		let dueWithinDays = 0;

		for (const block of blocks) {
			files.add(block.filePath);

			const state = block.state ?? "new";

			switch (state) {
				case "new":
					newCount++;
					dueToday++;
					dueWithinDays++;
					break;
				case "learning":
					learningCount++;
					break;
				case "review":
					reviewCount++;
					break;
			}

			if (state !== "new" && state !== "suspended") {
				if (!block.nextReview) {
					dueToday++;
					dueWithinDays++;
				} else {
					const reviewMs = new Date(block.nextReview).getTime();
					if (reviewMs >= startMs && reviewMs <= endMs) {
						dueToday++;
					}
					if (reviewMs >= startMs && reviewMs <= learnAheadEndMs) {
						dueWithinDays++;
					}
				}
			}
		}

		// 再统计文件化块、书签任务等新链路数据，避免牌组总量失真。
		const deck = await this.getDeckById(deckPath);
		logger.info(
			`[IRStorageService] getDeckStats: deckPath=${deckPath}, deck found=${!!deck}, deck.id=${
				deck?.id
			}, deck.name=${deck?.name}`
		);

		const deckTag = deck
			? `#IR_deck_${deck.name}`
			: `#IR_deck_${deckPath.split("/").pop() || deckPath}`;
		const deckIdentifiers = Array.from(
			this.toNormalizedStringSet([deckPath, deck?.id || "", deck?.path || ""])
		);

		const allChunkData = await this.getAllChunkData();
		const allChunkValues = Object.values(allChunkData);

		const getFileTagsLower = (filePath: string): string[] => {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) return [];
			const cache = this.app.metadataCache.getFileCache(file);
			const inlineTags = cache?.tags?.map((t) => t.tag.replace(/^#/, "")) || [];
			const fmTagsRaw = cache?.frontmatter?.tags;
			let fmTags: string[] = [];
			if (Array.isArray(fmTagsRaw)) {
				fmTags = fmTagsRaw.map((t) => String(t));
			} else if (typeof fmTagsRaw === "string") {
				fmTags = fmTagsRaw.split(",").map((t) => t.trim());
			}
			return [...new Set([...fmTags, ...inlineTags])]
				.map((t) => String(t).toLowerCase())
				.filter(Boolean);
		};

		const hasIgnoreTagInFile = (filePath: string): boolean => {
			const tags = getFileTagsLower(filePath);
			if (tags.includes("ignore") || tags.includes("#ignore")) return true;
			const file = this.app.vault.getAbstractFileByPath(filePath);
			const cache = file instanceof TFile ? this.app.metadataCache.getFileCache(file) : null;
			const fm = cache?.frontmatter;
			const fmString = fm ? JSON.stringify(fm).toLowerCase() : "";
			return fmString.includes("ignore");
		};

		const chunkValues = allChunkValues.filter((_chunk) => {
			const inDeck = _chunk.deckTag === deckTag || (deck && _chunk.deckIds?.includes(deck.id));
			if (!inDeck) return false;
			if (hasIgnoreTagInFile(_chunk.filePath)) return false;
			return true;
		});

		logger.info(
			`[IRStorageService] getDeckStats: 期望deckTag=${deckTag}, deck.id=${deck?.id}, 匹配chunks=${chunkValues.length}, 总chunks=${allChunkValues.length}`
		);

		for (const chunk of chunkValues) {
			files.add(chunk.filePath);

			switch (chunk.scheduleStatus) {
				case "new":
					newCount++;
					dueToday++;
					dueWithinDays++;
					break;
				case "queued":
				case "active":
					learningCount++;
					break;
				case "scheduled":
					reviewCount++;
					break;
			}

			if (
				chunk.scheduleStatus !== "new" &&
				chunk.scheduleStatus !== "suspended" &&
				chunk.scheduleStatus !== "done" &&
				chunk.scheduleStatus !== "removed"
			) {
				if (!chunk.nextRepDate || chunk.nextRepDate === 0) {
					dueToday++;
					dueWithinDays++;
				} else {
					if (chunk.nextRepDate <= endMs) {
						dueToday++;
					}
					if (chunk.nextRepDate <= learnAheadEndMs) {
						dueWithinDays++;
					}
				}
			}
		}

		const accumulateBookmarkTaskStats = (
			tasks: any[],
			getSourcePath: (task: any) => string,
			logLabel: string
		): number => {
			let taskCount = 0;
			for (const task of tasks) {
				const status = String((task as any).status || "new");
				if (status === "done" || status === "suspended" || status === "removed") {
					continue;
				}

				taskCount++;

				const sourcePath = String(getSourcePath(task) || "").trim();
				if (sourcePath) {
					files.add(sourcePath);
				}

				switch (status) {
					case "new":
						newCount++;
						dueToday++;
						dueWithinDays++;
						break;
					case "queued":
					case "active":
						learningCount++;
						break;
					case "scheduled":
						reviewCount++;
						break;
				}

				if (status !== "new") {
					const nrd = ((task as any).nextRepDate as number) || 0;
					if (!nrd || nrd <= endMs) {
						dueToday++;
					}
					if (!nrd || nrd <= learnAheadEndMs) {
						dueWithinDays++;
					}
				}
			}

			logger.debug(`[IRStorageService] getDeckStats: ${logLabel} 统计完成`, {
				deckPath,
				taskCount,
			});
			return taskCount;
		};

		let pdfTaskCount = 0;
		try {
			const pdfService = new IRPdfBookmarkTaskService(this.app);
			await pdfService.initialize();
			const pdfTasks = await this.collectTasksByDeckIdentifiers(pdfService, deckIdentifiers);
			pdfTaskCount = accumulateBookmarkTaskStats(
				pdfTasks,
				(task) => String((task as any)?.pdfPath || "").trim(),
				"PDF 书签任务"
			);
		} catch (e) {
			logger.debug("[IRStorageService] getDeckStats: PDF 书签任务统计失败", e);
		}

		let epubTaskCount = 0;
		try {
			const epubService = new IREpubBookmarkTaskService(this.app);
			await epubService.initialize();
			const epubTasks = await this.collectTasksByDeckIdentifiers(epubService, deckIdentifiers);
			epubTaskCount = accumulateBookmarkTaskStats(
				epubTasks,
				(task) => String((task as any)?.epubFilePath || "").trim(),
				"EPUB 书签任务"
			);
		} catch (e) {
			logger.debug("[IRStorageService] getDeckStats: EPUB 书签任务统计失败", e);
		}

		const totalCount = blocks.length + chunkValues.length + pdfTaskCount + epubTaskCount;

		const questionStats = await this.countQuestionsInFiles(Array.from(files));

		const todayNewCount = Math.min(newCount, dailyNewLimit);
		const todayDueCount = Math.min(dueToday, dailyReviewLimit);

		return {
			newCount,
			learningCount,
			reviewCount,
			dueToday,
			dueWithinDays,
			totalCount,
			fileCount: files.size,
			questionCount: questionStats.total,
			completedQuestionCount: questionStats.completed,
			todayNewCount,
			todayDueCount,
		};
	}

	/** 统计文件中的问答式待办项数量。 */
	private async countQuestionsInFiles(filePaths: string[]): Promise<{
		total: number;
		completed: number;
	}> {
		let total = 0;
		let completed = 0;

		const completedQuestionRegex = /^[-*]\s*\[x\]\s*.+[?？]/gim;
		const uncompletedQuestionRegex = /^[-*]\s*\[\s\]\s*.+[?？]/gim;

		for (const filePath of filePaths) {
			try {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					const content = await this.app.vault.read(file);

					const completedMatches = content.match(completedQuestionRegex);
					const completedCount = completedMatches ? completedMatches.length : 0;

					const uncompletedMatches = content.match(uncompletedQuestionRegex);
					const uncompletedCount = uncompletedMatches ? uncompletedMatches.length : 0;

					completed += completedCount;
					total += completedCount + uncompletedCount;
				}
			} catch (_error) {}
		}

		return { total, completed };
	}

	/** 获取今日到期的旧版内容块。 */
	async getTodayDueBlocks(): Promise<IRBlock[]> {
		const blocks = await this.getAllBlocks();
		const today = new Date().toISOString().split("T")[0];

		return Object.values(blocks).filter((_block) => {
			if (_block.state === "new") return true;
			if (!_block.nextReview) return false;

			const reviewDate = _block.nextReview.split("T")[0];
			return reviewDate <= today;
		});
	}

	// ============================================
	// 文件操作辅助（使用 adapter 直接读写，绕过文件索引缓存）
	// ============================================

	/**
	 * 读取文件内容（使用 adapter 直接读取）
	 */
	private async readFile(path: string, defaultContent = "{}"): Promise<string> {
		try {
			const adapter = this.app.vault.adapter;

			// 检查文件是否存在
			const exists = await adapter.exists(path);

			if (exists) {
				const content = await adapter.read(path);
				return content;
			}

			// 文件不存在，创建并写入默认内容
			await this.writeFile(path, defaultContent);
			return defaultContent;
		} catch (error) {
			logger.warn(`[IRStorageService] 读取文件失败，返回默认值: ${path}`, error);
			return defaultContent;
		}
	}

	/**
	 * 写入文件内容（使用 adapter 直接写入）
	 */
	private async writeFile(path: string, content: string): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;

			// 确保目录存在
			const dir = path.substring(0, path.lastIndexOf("/"));
			if (dir) {
				await this.ensureDirectory(dir);
			}

			// 直接写入文件
			await adapter.write(path, content);
		} catch (error) {
			logger.error(`[IRStorageService] 写入文件失败: ${path}`, error);
			throw error;
		}
	}

	// ============================================
	// 文件同步状态管理
	// ============================================

	/**
	 * 获取所有文件同步状态
	 */
	async getAllSyncStates(): Promise<Record<string, FileSyncState>> {
		await this.initialize();
		const path = `${this.getStorageDir()}/${SYNC_STATE_FILE}`;
		const defaultStore: IRSyncStateStore = { version: IR_STORAGE_VERSION, files: {} };
		const content = await this.readFile(path, JSON.stringify(defaultStore));

		try {
			const store: IRSyncStateStore = JSON.parse(content);
			return store.files || {};
		} catch {
			return {};
		}
	}

	/**
	 * 获取单个文件的同步状态
	 */
	async getFileSyncState(filePath: string): Promise<FileSyncState | null> {
		await this.initialize();
		const states = await this.getAllSyncStates();
		return states[filePath] || null;
	}

	async saveFileSyncState(state: FileSyncState): Promise<void> {
		await this.initialize();
		const states = await this.getAllSyncStates();
		states[state.filePath] = state;
		await this.saveSyncStates(states);
	}

	async saveFileSyncStates(newStates: FileSyncState[]): Promise<void> {
		await this.initialize();
		const states = await this.getAllSyncStates();
		for (const state of newStates) {
			states[state.filePath] = state;
		}
		await this.saveSyncStates(states);
	}

	async deleteFileSyncState(filePath: string): Promise<void> {
		await this.initialize();
		const states = await this.getAllSyncStates();
		if (states[filePath]) {
			delete states[filePath];
			await this.saveSyncStates(states);
		}
	}

	private async saveSyncStates(states: Record<string, FileSyncState>): Promise<void> {
		const store: IRSyncStateStore = {
			version: IR_STORAGE_VERSION,
			files: states,
		};

		const path = `${this.getStorageDir()}/${SYNC_STATE_FILE}`;
		await this.writeFile(path, JSON.stringify(store));
	}

	/**
	 * 检测文件是否需要同步（基于 mtime 和 size）
	 * @returns true 如果文件已变化需要同步
	 */
	async checkFileNeedsSync(
		filePath: string,
		currentMtime: number,
		currentSize: number
	): Promise<boolean> {
		const state = await this.getFileSyncState(filePath);

		if (!state) {
			// 新文件，需要同步
			return true;
		}

		// 比较 mtime 和 size
		if (state.mtime !== currentMtime || state.size !== currentSize) {
			return true;
		}

		return false;
	}

	/**
	 * 生成 UUID 列表哈希（用于快速检测块变化）
	 */
	generateUuidListHash(uuids: string[]): string {
		// 简单哈希：排序后连接，取前32位
		const sorted = [...uuids].sort();
		const combined = sorted.join("|");

		// 简单的 djb2 哈希算法
		let hash = 5381;
		for (let i = 0; i < combined.length; i++) {
			hash = (hash << 5) + hash + combined.charCodeAt(i);
			hash = hash & hash; // 转换为32位整数
		}

		return Math.abs(hash).toString(16).padStart(8, "0");
	}

	// ============================================
	// 数据完整性校验
	// ============================================

	/**
	 * 校验并清理悬空引用
	 * 用于插件启动时执行，确保数据完整性
	 *
	 * @returns 清理结果统计
	 */
	async validateAndCleanOrphanedReferences(): Promise<{
		orphanedBlockIds: number; // 清理的悬空内容块引用数
		orphanedSourceFiles: number; // 清理的悬空源文件引用数
		affectedDecks: number; // 受影响的牌组数
	}> {
		await this.initialize();

		const result = {
			orphanedBlockIds: 0,
			orphanedSourceFiles: 0,
			affectedDecks: 0,
		};

		// 获取所有有效的内容块ID
		const blocks = await this.getAllBlocks();
		const validBlockIds = new Set(Object.keys(blocks));

		// 获取所有有效的文件路径
		const validFilePaths = new Set<string>();
		for (const block of Object.values(blocks)) {
			if (block.filePath) {
				validFilePaths.add(block.filePath);
			}
		}

		// 检查每个牌组
		const decks = await this.getAllDecks();

		for (const deck of Object.values(decks)) {
			let deckModified = false;
			const originalBlockCount = deck.blockIds?.length || 0;
			const originalFileCount = deck.sourceFiles?.length || 0;

			// 清理悬空的 blockIds
			if (deck.blockIds && deck.blockIds.length > 0) {
				const validBlockIdsInDeck = deck.blockIds.filter((id) => validBlockIds.has(id));
				if (validBlockIdsInDeck.length < deck.blockIds.length) {
					result.orphanedBlockIds += deck.blockIds.length - validBlockIdsInDeck.length;
					deck.blockIds = validBlockIdsInDeck;
					deckModified = true;
				}
			}

			// 清理悬空的 sourceFiles
			if (deck.sourceFiles && deck.sourceFiles.length > 0) {
				// 检查每个源文件是否仍有内容块在牌组中
				const validSourceFiles = deck.sourceFiles.filter((_filePath) => {
					// 文件必须存在且在牌组中有对应的内容块
					return deck.blockIds?.some((id) => blocks[id]?.filePath === _filePath);
				});

				if (validSourceFiles.length < deck.sourceFiles.length) {
					result.orphanedSourceFiles += deck.sourceFiles.length - validSourceFiles.length;
					deck.sourceFiles = validSourceFiles;
					deckModified = true;
				}
			}

			// 保存修改
			if (deckModified) {
				deck.updatedAt = new Date().toISOString();
				await this.saveDeck(deck);
				result.affectedDecks++;

				logger.info(
					`[IRStorageService] 清理牌组 "${deck.name}" 的悬空引用: ` +
						`blockIds ${originalBlockCount} -> ${deck.blockIds?.length || 0}, ` +
						`sourceFiles ${originalFileCount} -> ${deck.sourceFiles?.length || 0}`
				);
			}
		}

		if (result.orphanedBlockIds > 0 || result.orphanedSourceFiles > 0) {
			logger.info(
				`[IRStorageService] 完整性校验完成: 清理 ${result.orphanedBlockIds} 个悬空内容块引用, ${result.orphanedSourceFiles} 个悬空源文件引用, 影响 ${result.affectedDecks} 个牌组`
			);
		} else {
			// 无悬空引用
		}

		return result;
	}

	/**
	 * 检查内容块是否存在对应的源文件
	 * 用于检测源文件被删除但内容块记录未清理的情况
	 *
	 * @returns 孤立内容块的ID列表
	 */
	async findOrphanedBlocks(): Promise<string[]> {
		await this.initialize();

		const blocks = await this.getAllBlocks();
		const orphanedIds: string[] = [];

		for (const [id, block] of Object.entries(blocks)) {
			if (!block.filePath) {
				orphanedIds.push(id);
				continue;
			}

			// 检查文件是否存在
			const file = this.app.vault.getAbstractFileByPath(block.filePath);
			if (!file || !(file instanceof TFile)) {
				orphanedIds.push(id);
			}
		}

		return orphanedIds;
	}

	/**
	 * 清理孤立内容块（源文件已删除）
	 *
	 * @returns 清理的内容块数量
	 */
	async cleanOrphanedBlocks(): Promise<number> {
		const orphanedIds = await this.findOrphanedBlocks();

		if (orphanedIds.length === 0) {
			return 0;
		}

		// 删除孤立内容块（级联删除会自动清理牌组引用）
		for (const id of orphanedIds) {
			await this.deleteBlock(id);
		}

		logger.info(`[IRStorageService] 清理 ${orphanedIds.length} 个孤立内容块（源文件已删除）`);

		return orphanedIds.length;
	}

	// ============================================
	// v5.0 文件化内容块方案存储
	// ============================================

	private readonly SOURCES_FILE = "sources.json";
	private readonly CHUNKS_FILE = "chunks.json";

	/**
	 * 获取所有源材料元数据
	 */
	async getAllSources(): Promise<Record<string, import("../../types/ir-types").IRSourceFileMeta>> {
		await this.initialize();
		const path = `${this.getStorageDir()}/${this.SOURCES_FILE}`;
		const defaultStore = { version: IR_STORAGE_VERSION, sources: {} };
		const content = await this.readFile(path, JSON.stringify(defaultStore));

		try {
			const store = JSON.parse(content);

			if (!this.migratedSourceReadablePaths) {
				const roots = this.getReadableRoots();
				if (roots && store?.sources && typeof store.sources === "object") {
					let changed = false;
					for (const src of Object.values(store.sources)) {
						if (!src || typeof src !== "object") continue;

						const indexFilePath = (src as any).indexFilePath;
						const rewrittenIndex = await this.migrateReadablePathIfNeeded(
							indexFilePath,
							roots.legacyRoot,
							roots.currentRoot
						);
						if (rewrittenIndex) {
							(src as any).indexFilePath = rewrittenIndex;
							changed = true;
						}

						const rawFilePath = (src as any).rawFilePath;
						const rewrittenRaw = await this.migrateReadablePathIfNeeded(
							rawFilePath,
							roots.legacyRoot,
							roots.currentRoot
						);
						if (rewrittenRaw) {
							(src as any).rawFilePath = rewrittenRaw;
							changed = true;
						}
					}

					if (changed) {
						await this.writeFile(path, JSON.stringify(store));
					}
				}

				this.migratedSourceReadablePaths = true;
			}

			return store.sources || {};
		} catch {
			return {};
		}
	}

	/**
	 * 获取单个源材料元数据
	 */
	async getSource(
		sourceId: string
	): Promise<import("../../types/ir-types").IRSourceFileMeta | null> {
		const sources = await this.getAllSources();
		return sources[sourceId] || null;
	}

	/**
	 * 保存源材料元数据
	 */
	async saveSource(source: import("../../types/ir-types").IRSourceFileMeta): Promise<void> {
		await this.initialize();
		const sources = await this.getAllSources();
		sources[source.sourceId] = source;

		const store: import("../../types/ir-types").IRSourcesStore = {
			version: IR_STORAGE_VERSION,
			sources,
		};

		const path = `${this.getStorageDir()}/${this.SOURCES_FILE}`;
		await this.writeFile(path, JSON.stringify(store));
	}

	async saveSourceBatch(
		sourceList: import("../../types/ir-types").IRSourceFileMeta[]
	): Promise<void> {
		await this.initialize();
		const sources = await this.getAllSources();

		for (const source of sourceList) {
			sources[source.sourceId] = source;
		}

		const store: import("../../types/ir-types").IRSourcesStore = {
			version: IR_STORAGE_VERSION,
			sources,
		};

		const path = `${this.getStorageDir()}/${this.SOURCES_FILE}`;
		await this.writeFile(path, JSON.stringify(store));
	}

	/**
	 * 删除源材料元数据
	 */
	async deleteSource(sourceId: string): Promise<void> {
		await this.initialize();
		const sources = await this.getAllSources();
		delete sources[sourceId];

		const store: import("../../types/ir-types").IRSourcesStore = {
			version: IR_STORAGE_VERSION,
			sources,
		};

		const path = `${this.getStorageDir()}/${this.SOURCES_FILE}`;
		await this.writeFile(path, JSON.stringify(store));
	}

	/**
	 * 获取所有块文件调度数据
	 */
	async getAllChunkData(): Promise<Record<string, import("../../types/ir-types").IRChunkFileData>> {
		await this.initialize();
		const path = `${this.getStorageDir()}/${this.CHUNKS_FILE}`;
		const defaultStore = { version: IR_STORAGE_VERSION, chunks: {} };
		const content = await this.readFile(path, JSON.stringify(defaultStore));

		// 读取时顺手修正旧字段，避免把半迁移数据继续写回运行时。
		let needsSave = false;
		const parsed = JSON.parse(content) as import("../../types/ir-types").IRChunksStore;
		const now = Date.now();

		let sources: Record<string, import("../../types/ir-types").IRSourceFileMeta> | null = null;
		try {
			sources = await this.getAllSources();
		} catch {
			sources = null;
		}

		for (const [key, chunk] of Object.entries(parsed.chunks)) {
			if (typeof chunk !== "object" || chunk === null) {
				logger.warn(
					`[IRStorageService] 跳过无效块数据: key=${key}, value=${String(chunk).slice(0, 50)}`
				);
				delete parsed.chunks[key];
				needsSave = true;
				continue;
			}

			if (
				(chunk as any).priorityUi === undefined &&
				typeof (chunk as any).priorityEff === "number"
			) {
				(chunk as any).priorityUi = (chunk as any).priorityEff;
				needsSave = true;
			}

			try {
				const sourceId = (chunk as any).sourceId;
				const sourceTagGroup =
					sourceId && sources ? (sources as any)[sourceId]?.tagGroup : undefined;
				const currentTagGroup = (chunk as any)?.meta?.tagGroup;
				if (
					typeof sourceTagGroup === "string" &&
					sourceTagGroup.trim().length > 0 &&
					sourceTagGroup !== "default"
				) {
					if (!currentTagGroup || currentTagGroup === "default") {
						if (currentTagGroup !== sourceTagGroup) {
							(chunk as any).meta = {
								...(chunk as any).meta,
								tagGroup: sourceTagGroup,
							};
							needsSave = true;
						}
					}
				}
			} catch {}

			if (chunk.nextRepDate === 0 || chunk.nextRepDate === undefined) {
				chunk.nextRepDate = now;
				chunk.intervalDays = chunk.intervalDays || 1;
				chunk.updatedAt = now;
				needsSave = true;
			}
		}

		if (!this.migratedChunkReadablePaths) {
			const roots = this.getReadableRoots();
			if (roots && parsed?.chunks && typeof parsed.chunks === "object") {
				for (const chunk of Object.values(parsed.chunks)) {
					if (!chunk || typeof chunk !== "object") continue;
					const current = (chunk as any).filePath;
					const rewritten = await this.migrateReadablePathIfNeeded(
						current,
						roots.legacyRoot,
						roots.currentRoot
					);
					if (rewritten) {
						(chunk as any).filePath = rewritten;
						needsSave = true;
					}
				}
			}
			this.migratedChunkReadablePaths = true;
		}

		if (needsSave) {
			await this.writeFile(path, JSON.stringify(this.buildSerializedChunkStore(parsed.chunks)));
			logger.info("[IRStorageService] 自动迁移完成: 已修复缺失的调度数据");
		}

		return Object.fromEntries(
			Object.entries(parsed.chunks).map(([chunkId, chunk]) => [
				chunkId,
				normalizeChunkForRuntime(chunk),
			])
		);
	}

	/** 获取单个块文件的调度数据。 */
	async getChunkData(
		chunkId: string
	): Promise<import("../../types/ir-types").IRChunkFileData | null> {
		const chunks = await this.getAllChunkData();
		return chunks[chunkId] || null;
	}

	/** 保存单个块文件的调度数据。 */
	async saveChunkData(chunk: import("../../types/ir-types").IRChunkFileData): Promise<void> {
		await this.initialize();
		const chunks = await this.getAllChunkData();
		chunks[chunk.chunkId] = chunk;

		const store = this.buildSerializedChunkStore(chunks);

		const path = `${this.getStorageDir()}/${this.CHUNKS_FILE}`;
		await this.writeFile(path, JSON.stringify(store));
	}

	/** 批量保存块文件调度数据。 */
	async saveChunkDataBatch(
		chunkList: import("../../types/ir-types").IRChunkFileData[]
	): Promise<void> {
		logger.info(`[IRStorageService] ⚡ saveChunkDataBatch 开始: ${chunkList.length} 个块`);
		await this.initialize();
		const chunks = await this.getAllChunkData();

		for (const chunk of chunkList) {
			chunks[chunk.chunkId] = chunk;
		}

		const store = this.buildSerializedChunkStore(chunks);

		const path = `${this.getStorageDir()}/${this.CHUNKS_FILE}`;
		logger.info(`[IRStorageService] ⚡ 准备写入: ${path}, 总块数=${Object.keys(chunks).length}`);
		try {
			await this.writeFile(path, JSON.stringify(store));
			logger.info(`[IRStorageService] ✅ 批量保存成功: ${chunkList.length} 个块`);
		} catch (err) {
			logger.error("[IRStorageService] ❌ 批量保存失败:", err);
			throw err;
		}
	}

	/** 删除块文件调度数据，并清理相关来源记录。 */
	async deleteChunkData(chunkId: string): Promise<void> {
		await this.initialize();
		const chunks = await this.getAllChunkData();
		const deletedChunk = chunks[chunkId];
		if (!deletedChunk) {
			return;
		}

		const sourceId = deletedChunk.sourceId;
		const sources = sourceId ? await this.getAllSources() : {};
		const sourceMeta = sourceId ? sources[sourceId] : null;
		const chunkFilePath = typeof deletedChunk.filePath === "string" ? deletedChunk.filePath : "";
		const deletedChunkMeta = deletedChunk.meta as unknown as Record<string, unknown> | undefined;
		const isExternalDocument = deletedChunkMeta?.externalDocument === true;
		const sourcePath = sourceMeta?.originalPath || (isExternalDocument ? chunkFilePath : "");

		delete chunks[chunkId];

		const store = this.buildSerializedChunkStore(chunks);

		const path = `${this.getStorageDir()}/${this.CHUNKS_FILE}`;
		await this.writeFile(path, JSON.stringify(store));

		const remainingChunks = Object.values(chunks);
		await this.removeChunkFromAllDecksAfterDeletion(chunkId, sourcePath, sourceId, remainingChunks);

		const hasRemainingChunksForSource = sourceId
			? remainingChunks.some((chunk) => chunk.sourceId === sourceId)
			: false;
		const hasRemainingExternalChunksForFile =
			isExternalDocument && chunkFilePath
				? remainingChunks.some((_chunk) => {
						const meta = _chunk.meta as unknown as Record<string, unknown> | undefined;
						return _chunk.filePath === chunkFilePath && meta?.externalDocument === true;
				  })
				: false;

		if (sourceId && sourceMeta && !hasRemainingChunksForSource) {
			delete sources[sourceId];
			const sourceStore: import("../../types/ir-types").IRSourcesStore = {
				version: IR_STORAGE_VERSION,
				sources,
			};
			await this.writeFile(
				`${this.getStorageDir()}/${this.SOURCES_FILE}`,
				JSON.stringify(sourceStore)
			);
		}

		if (!sourcePath) {
			return;
		}

		try {
			await this.deleteFileSyncState(sourcePath);
		} catch (error) {
			logger.warn(`[IRStorageService] 清理源文件同步状态失败: ${sourcePath}`, error);
		}

		if (!sourcePath.endsWith(".md")) {
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) {
			return;
		}

		const shouldCleanupExternalDocument = isExternalDocument && !hasRemainingExternalChunksForFile;
		const shouldCleanupSourceDocument = !!sourceMeta && !hasRemainingChunksForSource;
		if (!shouldCleanupExternalDocument && !shouldCleanupSourceDocument) {
			return;
		}

		try {
			await this.cleanupMarkdownReadingFrontmatter(file, {
				addDeletedTag: true,
				removeExternalDocumentFields: shouldCleanupExternalDocument,
			});
		} catch (error) {
			logger.warn(
				`[IRStorageService] 清理已删除阅读点对应 Markdown frontmatter 失败: ${sourcePath}`,
				error
			);
		}
	}

	/** 获取某个源材料下的全部块调度数据。 */
	async getChunkDataBySource(
		sourceId: string
	): Promise<import("../../types/ir-types").IRChunkFileData[]> {
		const chunks = await this.getAllChunkData();
		return Object.values(chunks).filter((c) => c.sourceId === sourceId);
	}

	/** 获取仍在调度链路中的块数据。 */
	async getActiveChunkData(): Promise<import("../../types/ir-types").IRChunkFileData[]> {
		const chunks = await this.getAllChunkData();
		return Object.values(chunks).filter(
			(c) =>
				c.scheduleStatus !== "done" &&
				c.scheduleStatus !== "suspended" &&
				c.scheduleStatus !== "removed"
		);
	}

	/** 获取今天应进入队列的块调度数据。 */
	async getTodayDueChunkData(): Promise<import("../../types/ir-types").IRChunkFileData[]> {
		const chunks = await this.getAllChunkData();
		const now = Date.now();

		return Object.values(chunks).filter((_chunk) => {
			if (_chunk.scheduleStatus === "new") return true;
			if (
				_chunk.scheduleStatus === "done" ||
				_chunk.scheduleStatus === "suspended" ||
				_chunk.scheduleStatus === "removed"
			)
				return false;
			return _chunk.nextRepDate <= now;
		});
	}

	// ============================================
	// v5.4: 牌组标签相关方法
	// ============================================

	/**
	 * 根据牌组标签获取块调度数据
	 * @param deckTag 牌组标签，格式 #IR_deck_牌组名
	 */
	async getChunksByDeckTag(
		deckTag: string
	): Promise<import("../../types/ir-types").IRChunkFileData[]> {
		const chunks = await this.getAllChunkData();
		return Object.values(chunks).filter((c) => c.deckTag === deckTag);
	}

	/**
	 * 获取所有牌组标签列表（从 chunks.json 中提取）
	 */
	async getAllDeckTags(): Promise<string[]> {
		const chunks = await this.getAllChunkData();
		const tags = new Set<string>();
		for (const chunk of Object.values(chunks)) {
			if (chunk.deckTag) {
				tags.add(chunk.deckTag);
			}
		}
		return Array.from(tags);
	}

	/**
	 * 修改块的牌组标签（同时更新 JSON 和块文件 YAML）
	 * @param chunkId 块 ID
	 * @param newDeckTag 新牌组标签
	 */
	async updateChunkDeckTag(chunkId: string, newDeckTag: string): Promise<void> {
		// 1. 更新 chunks.json
		const chunks = await this.getAllChunkData();
		const chunk = chunks[chunkId];
		if (!chunk) {
			throw new Error(`块不存在: ${chunkId}`);
		}

		const oldDeckTag = chunk.deckTag;
		chunk.topicTag = newDeckTag;
		chunk.deckTag = newDeckTag;
		chunk.updatedAt = Date.now();

		const store = this.buildSerializedChunkStore(chunks);
		const path = `${this.getStorageDir()}/${this.CHUNKS_FILE}`;
		await this.writeFile(path, JSON.stringify(store));

		// 2. 更新块文件 YAML
		await this.updateChunkFileYAML(chunk.filePath, { deck_tag: newDeckTag });

		logger.info(`[IRStorageService] 更新块牌组标签: ${chunkId}, ${oldDeckTag} -> ${newDeckTag}`);
	}

	/**
	 * 更新块文件的 YAML frontmatter
	 */
	private async updateChunkFileYAML(
		filePath: string,
		updates: Record<string, unknown>
	): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(filePath))) {
			logger.warn(`[IRStorageService] 块文件不存在，跳过 YAML 更新: ${filePath}`);
			return;
		}

		const content = await adapter.read(filePath);
		const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);

		if (!yamlMatch) {
			logger.warn(`[IRStorageService] 块文件无 YAML frontmatter: ${filePath}`);
			return;
		}

		// 简单的 YAML 更新（逐行替换或追加）
		let yamlContent = yamlMatch[1];
		const normalizedUpdates = { ...updates };
		if (normalizedUpdates.deck_tag !== undefined && normalizedUpdates.topic_tag === undefined) {
			normalizedUpdates.topic_tag = normalizedUpdates.deck_tag;
		}
		if (normalizedUpdates.deck_names !== undefined && normalizedUpdates.topic_names === undefined) {
			normalizedUpdates.topic_names = normalizedUpdates.deck_names;
		}
		normalizedUpdates.deck_tag = undefined;
		normalizedUpdates.deck_names = undefined;

		for (const [key, value] of Object.entries(normalizedUpdates)) {
			const regex = new RegExp(`^${key}:.*$`, "m");
			const newLine = `${key}: "${value}"`;
			if (regex.test(yamlContent)) {
				yamlContent = yamlContent.replace(regex, newLine);
			} else {
				yamlContent += `\n${newLine}`;
			}
		}

		const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yamlContent}\n---`);
		await adapter.write(filePath, newContent);
	}

	/**
	 * 根据牌组标签获取统计数据
	 * @deprecated 仅保留兼容用途；未来计划相关统计请改走 IRWorkspaceSnapshotService.getDeckOverview。
	 */
	async getDeckStatsByTag(
		deckTag: string,
		dailyNewLimit = 20,
		dailyReviewLimit = 50
	): Promise<{
		newCount: number;
		learningCount: number;
		reviewCount: number;
		dueToday: number;
		totalCount: number;
		fileCount: number;
		todayNewCount: number;
		todayDueCount: number;
	}> {
		const chunks = await this.getChunksByDeckTag(deckTag);
		const todayMs = new Date().setHours(23, 59, 59, 999);

		const files = new Set<string>();
		let newCount = 0;
		let learningCount = 0;
		let reviewCount = 0;
		let dueToday = 0;

		for (const chunk of chunks) {
			files.add(chunk.filePath);

			switch (chunk.scheduleStatus) {
				case "new":
					newCount++;
					break;
				case "queued":
				case "active":
					// queued/active 对应旧版 learning 状态
					learningCount++;
					break;
				case "scheduled":
					// scheduled 对应旧版 review 状态
					reviewCount++;
					break;
			}

			if (chunk.nextRepDate && chunk.nextRepDate <= todayMs) {
				dueToday++;
			}
		}

		const todayNewCount = Math.min(newCount, dailyNewLimit);
		const todayDueCount = Math.min(dueToday, dailyReviewLimit);

		return {
			newCount,
			learningCount,
			reviewCount,
			dueToday,
			totalCount: chunks.length,
			fileCount: files.size,
			todayNewCount,
			todayDueCount,
		};
	}

	// ============================================
	// v5.5: 从内容块文件 YAML 同步 deck_tag
	// ============================================

	/**
	 * 从内容块文件 YAML 读取 deck_tag
	 * @param filePath 块文件路径
	 * @returns deck_tag 值，如果读取失败返回 null
	 */
	async readDeckTagFromYAML(filePath: string): Promise<string | null> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(filePath))) {
				return null;
			}

			const content = await adapter.read(filePath);
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) return null;

			const yamlContent = yamlMatch[1];
			const deckTagMatch =
				yamlContent.match(/^topic_tag:\s*["']?([^"'\n]+)["']?\s*$/m) ||
				yamlContent.match(/^deck_tag:\s*["']?([^"'\n]+)["']?\s*$/m);

			if (deckTagMatch) {
				return deckTagMatch[1].trim();
			}

			return null;
		} catch (error) {
			logger.warn(`[IRStorageService] 读取块文件 deck_tag 失败: ${filePath}`, error);
			return null;
		}
	}

	/** 按 YAML 中的单牌组标签同步块记录。 */
	async syncDeckTagsFromYAML(): Promise<{ synced: number; removed: Map<string, string[]> }> {
		await this.initialize();

		const chunks = await this.getAllChunkData();
		const chunksToUpdate: import("../../types/ir-types").IRChunkFileData[] = [];
		const removedFromDecks = new Map<string, string[]>();

		for (const chunk of Object.values(chunks)) {
			const yamlDeckTag = await this.readDeckTagFromYAML(chunk.filePath);

			if (yamlDeckTag === null) {
				continue;
			}

			if (yamlDeckTag !== chunk.deckTag) {
				const oldDeckTag = chunk.deckTag;

				if (oldDeckTag && oldDeckTag !== yamlDeckTag) {
					if (!removedFromDecks.has(oldDeckTag)) {
						removedFromDecks.set(oldDeckTag, []);
					}
					removedFromDecks.get(oldDeckTag)?.push(chunk.chunkId);
				}

				chunk.deckTag = yamlDeckTag;
				chunk.updatedAt = Date.now();
				chunksToUpdate.push(chunk);
			}
		}

		if (chunksToUpdate.length > 0) {
			await this.saveChunkDataBatch(chunksToUpdate);
			logger.info(`[IRStorageService] 同步 ${chunksToUpdate.length} 个块的 deck_tag`);
		}

		return { synced: chunksToUpdate.length, removed: removedFromDecks };
	}

	/** 先同步 YAML 牌组数据，再返回最新块数据。 */
	async getAllChunkDataWithSync(): Promise<
		Record<string, import("../../types/ir-types").IRChunkFileData>
	> {
		await this.syncDeckDataFromYAML();
		return this.getAllChunkData();
	}

	// ============================================
	// v5.5: 多牌组支持与牌组验证
	// ============================================

	/** 从块文件 YAML 读取多牌组名称。 */
	async readDeckNamesFromYAML(filePath: string): Promise<string[] | null> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(filePath))) {
				return null;
			}

			const content = await adapter.read(filePath);
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) return null;

			const yamlContent = yamlMatch[1];

			const deckNamesMatch =
				yamlContent.match(/^topic_names:\s*$/m) || yamlContent.match(/^deck_names:\s*$/m);
			if (deckNamesMatch) {
				const arrayItems: string[] = [];
				const lines = yamlContent.split("\n");
				let inDeckNames = false;
				for (const line of lines) {
					if (line.match(/^topic_names:\s*$/) || line.match(/^deck_names:\s*$/)) {
						inDeckNames = true;
						continue;
					}
					if (inDeckNames) {
						if (line.match(/^\s+-\s+/)) {
							const item = line
								.replace(/^\s+-\s+/, "")
								.replace(/["']/g, "")
								.trim();
							if (item) arrayItems.push(item);
						} else if (!line.match(/^\s/)) {
							break;
						}
					}
				}
				if (arrayItems.length > 0) return arrayItems;
			}

			const inlineMatch =
				yamlContent.match(/^topic_names:\s*\[(.*)\]\s*$/m) ||
				yamlContent.match(/^deck_names:\s*\[(.*)\]\s*$/m);
			if (inlineMatch) {
				const items = inlineMatch[1]
					.split(",")
					.map((s) => s.replace(/["']/g, "").trim())
					.filter(Boolean);
				if (items.length > 0) return items;
			}

			const deckTagMatch =
				yamlContent.match(/^topic_tag:\s*["']?#?IR_deck_([^"'\n]+)["']?\s*$/m) ||
				yamlContent.match(/^deck_tag:\s*["']?#?IR_deck_([^"'\n]+)["']?\s*$/m);
			if (deckTagMatch) {
				return [deckTagMatch[1].trim()];
			}

			return null;
		} catch (error) {
			logger.warn(`[IRStorageService] 读取块文件 deck_names 失败: ${filePath}`, error);
			return null;
		}
	}

	/** 验证 YAML 中的牌组名称，并返回对应的有效牌组 ID。 */
	async validateDeckNames(deckNames: string[]): Promise<string[]> {
		const validDecks = await this.getAllDecks();
		const validDeckIds: string[] = [];

		for (const name of deckNames) {
			const matchedDeck = this.findDeckByDisplayName(validDecks, name);
			if (matchedDeck) {
				validDeckIds.push(matchedDeck.id);
			} else {
				logger.warn(`[IRStorageService] 牌组名称无效（未在插件中创建）: ${name}`);
			}
		}

		return validDeckIds;
	}

	/** 根据牌组 ID 获取牌组名称。 */
	async getDeckNameById(deckId: string): Promise<string | null> {
		const decks = await this.getAllDecks();
		const deck = decks[deckId];
		return deck ? deck.name : null;
	}

	/** 根据牌组名称获取牌组 ID。 */
	async getDeckIdByName(deckName: string): Promise<string | null> {
		const decks = await this.getAllDecks();
		const deck = this.findDeckByDisplayName(decks, deckName);
		return deck ? deck.id : null;
	}

	/** 按 YAML 中的多牌组定义同步块的牌组数据。 */
	async syncDeckDataFromYAML(): Promise<{ synced: number; invalidDecks: string[] }> {
		await this.initialize();

		const chunks = await this.getAllChunkData();
		const decks = await this.getAllDecks();
		const chunksToUpdate: import("../../types/ir-types").IRChunkFileData[] = [];
		const invalidDecks = new Set<string>();

		for (const chunk of Object.values(chunks)) {
			const yamlDeckNames = await this.readDeckNamesFromYAML(chunk.filePath);

			if (yamlDeckNames === null) {
				continue;
			}

			const validDeckIds = yamlDeckNames
				.map((name) => this.findDeckByDisplayName(decks, name)?.id)
				.filter((deckId): deckId is string => typeof deckId === "string" && deckId.length > 0);

			for (const name of yamlDeckNames) {
				const isValid = this.findDeckByDisplayName(decks, name);
				if (!isValid) {
					invalidDecks.add(name);
				}
			}

			const currentDeckIds = chunk.deckIds || [];
			const needsUpdate = !this.arraysEqual(validDeckIds, currentDeckIds);

			if (needsUpdate) {
				this.assignChunkDecks(chunk, validDeckIds, decks);
				chunk.updatedAt = Date.now();
				chunksToUpdate.push(chunk);
			}
		}

		if (chunksToUpdate.length > 0) {
			await this.saveChunkDataBatch(chunksToUpdate);
			logger.info(`[IRStorageService] 同步 ${chunksToUpdate.length} 个块的牌组数据`);
		}

		return { synced: chunksToUpdate.length, invalidDecks: Array.from(invalidDecks) };
	}

	/** 比较两个字符串数组在忽略顺序后是否相等。 */
	private arraysEqual(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false;
		const sortedA = [...a].sort();
		const sortedB = [...b].sort();
		return sortedA.every((val, i) => val === sortedB[i]);
	}

	/** 更新内容块的牌组集合，并同步块文件 YAML。 */
	async updateChunkDecks(chunkId: string, deckIds: string[]): Promise<void> {
		const chunks = await this.getAllChunkData();
		const chunk = chunks[chunkId];
		if (!chunk) {
			throw new Error(`块不存在: ${chunkId}`);
		}

		const validDecks = await this.getAllDecks();
		const validIds = deckIds.filter((id) => validDecks[id]);

		this.assignChunkDecks(chunk, validIds, validDecks);
		chunk.updatedAt = Date.now();

		const store = this.buildSerializedChunkStore(chunks);
		const path = `${this.getStorageDir()}/${this.CHUNKS_FILE}`;
		await this.writeFile(path, JSON.stringify(store));

		const deckNames = validIds.map((id) => validDecks[id]?.name).filter(Boolean);
		await this.updateChunkFileYAMLDeckNames(chunk.filePath, deckNames as string[]);

		logger.info(`[IRStorageService] 更新块牌组: ${chunkId}, 牌组数: ${validIds.length}`);
	}

	/** 向内容块追加一个牌组。 */
	async addDeckToChunk(chunkId: string, deckId: string): Promise<void> {
		const chunks = await this.getAllChunkData();
		const chunk = chunks[chunkId];
		if (!chunk) {
			throw new Error(`块不存在: ${chunkId}`);
		}

		const currentDeckIds = chunk.deckIds || [];
		if (!currentDeckIds.includes(deckId)) {
			await this.updateChunkDecks(chunkId, [...currentDeckIds, deckId]);
		}
	}

	/** 从内容块移除一个牌组。 */
	async removeDeckFromChunk(chunkId: string, deckId: string): Promise<void> {
		const chunks = await this.getAllChunkData();
		const chunk = chunks[chunkId];
		if (!chunk) {
			throw new Error(`块不存在: ${chunkId}`);
		}

		const currentDeckIds = chunk.deckIds || [];
		const newDeckIds = currentDeckIds.filter((_id) => _id !== deckId);
		await this.updateChunkDecks(chunkId, newDeckIds);
	}

	/** 把多牌组信息写回块文件 YAML。 */
	private async updateChunkFileYAMLDeckNames(filePath: string, deckNames: string[]): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(filePath))) {
			return;
		}

		const content = await adapter.read(filePath);
		const yaml = parseYAMLFromContent(content);
		if ((yaml as any).weave_type !== "ir-chunk") {
			return;
		}

		const normalizeDeckNameForTag = (name: string): string => {
			return (
				String(name || "")
					.trim()
					.replace(/[\s/\\#]+/g, "_")
					.replace(/_+/g, "_")
					.replace(/^_+|_+$/g, "") || "未分配"
			);
		};

		const names = (Array.isArray(deckNames) ? deckNames : [])
			.map((n) => String(n).trim())
			.filter(Boolean);
		const primaryName = names[0] || "未分配";

		let nextContent = content;
		nextContent = setCardProperty(nextContent, "topic_names", names.length > 0 ? names : undefined);
		nextContent = setCardProperty(nextContent, "deck_names", undefined);

		const rawTags = (yaml as any).tags;
		const tagsArr = Array.isArray(rawTags)
			? rawTags.map((t: any) => String(t).trim()).filter(Boolean)
			: typeof rawTags === "string" && rawTags.trim()
			? [rawTags.trim()]
			: [];
		const tags = new Set<string>(tagsArr);

		tags.add("ir/deck");
		for (const t of Array.from(tags)) {
			if (t.startsWith("ir/deck/") && t !== "ir/deck") {
				tags.delete(t);
			}
		}

		for (const n of names) {
			const seg = normalizeDeckNameForTag(n);
			tags.add(`ir/deck/${seg}`);
		}

		nextContent = setCardProperty(nextContent, "tags", Array.from(tags));

		nextContent = setCardProperty(nextContent, "topic_tag", `#IR_deck_${primaryName}`);
		nextContent = setCardProperty(nextContent, "deck_tag", undefined);

		if (nextContent !== content) {
			await adapter.write(filePath, nextContent);
		}
	}

	/** 获取可供 UI 展示的正式牌组列表。 */
	async getValidDeckList(): Promise<Array<{ id: string; name: string }>> {
		const decks = await this.getAllDecks();
		return Object.values(decks).map((d) => ({ id: d.id, name: d.name }));
	}

	/** 按显示名称查找牌组，兼容 `#IR_deck_` 前缀。 */
	private findDeckByDisplayName(
		decks: Record<string, IRDeck>,
		deckName: string
	): IRDeck | null {
		const normalizedName = String(deckName || "").trim().replace(/^#IR_deck_/, "");
		if (!normalizedName) {
			return null;
		}

		return Object.values(decks).find((deck) => deck.name === normalizedName) || null;
	}

	/** 把牌组 ID 集合同步到块的兼容字段。 */
	private assignChunkDecks(
		chunk: import("../../types/ir-types").IRChunkFileData,
		deckIds: string[],
		decks: Record<string, IRDeck>
	): void {
		chunk.topicIds = deckIds;
		chunk.deckIds = deckIds;

		const primaryDeckName = deckIds.length > 0 ? decks[deckIds[0]]?.name : undefined;
		const primaryDeckTag = primaryDeckName ? `#IR_deck_${primaryDeckName}` : undefined;
		chunk.topicTag = primaryDeckTag;
		chunk.deckTag = primaryDeckTag;
	}

	// ============================================
	// 数据完整性检查与清理
	// ============================================

	/** 清理指向不存在文件的块调度数据。 */
	async cleanupInvalidChunks(): Promise<{ removed: number; invalidPaths: string[] }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		const chunks = await this.getAllChunkData();
		const invalidChunkIds: string[] = [];
		const invalidPaths: string[] = [];

		for (const [chunkId, chunk] of Object.entries(chunks)) {
			if (typeof chunk.filePath !== "string" || chunk.filePath.trim() === "") {
				invalidChunkIds.push(chunkId);
				invalidPaths.push(String((chunk as any).filePath));
				continue;
			}

			const exists = await adapter.exists(chunk.filePath);
			if (!exists) {
				invalidChunkIds.push(chunkId);
				invalidPaths.push(chunk.filePath);
			}
		}

		if (invalidChunkIds.length > 0) {
			for (const chunkId of invalidChunkIds) {
				delete chunks[chunkId];
			}

			const store = this.buildSerializedChunkStore(chunks);
			const path = `${this.getStorageDir()}/${this.CHUNKS_FILE}`;
			await this.writeFile(path, JSON.stringify(store));

			logger.info(`[IRStorageService] 清理了 ${invalidChunkIds.length} 个无效块`);
		}

		return { removed: invalidChunkIds.length, invalidPaths };
	}

	/** 递归列出目录下的所有文件路径。 */
	private async listFilesRecursively(dir: string): Promise<string[]> {
		const adapter = this.app.vault.adapter;
		const result: string[] = [];
		try {
			const listed = await adapter.list(dir);
			for (const file of listed.files) {
				result.push(file);
			}
			for (const sub of listed.folders) {
				const nested = await this.listFilesRecursively(sub);
				for (const file of nested) {
					result.push(file);
				}
			}
		} catch {
			return result;
		}

		return result;
	}

	/** 精简 IR Markdown 文件 frontmatter 中已不再需要的字段。 */
	async slimIRMarkdownFrontmatter(
		scanRoot?: string
	): Promise<{ updated: number; scanned: number }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		const root = resolveIRImportFolder(scanRoot);
		const files = await this.listFilesRecursively(root);

		let updated = 0;
		let scanned = 0;

		for (const filePath of files) {
			if (!filePath.endsWith(".md")) continue;
			scanned++;

			let content: string;
			try {
				content = await adapter.read(filePath);
			} catch {
				continue;
			}

			if (!content.startsWith("---")) continue;
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) continue;

			const yaml = yamlMatch[1];
			const isChunk = yaml.includes("weave_type: ir-chunk");
			const isIndex = yaml.includes("weave_type: ir-index");
			if (!isChunk && !isIndex) continue;

			let newYaml = yaml;
			if (isChunk) {
				newYaml = newYaml
					.replace(/^tag_group:.*$\n?/gm, "")
					.replace(/^chunk_order:.*$\n?/gm, "")
					.replace(/^priority_reason:.*$\n?/gm, "");
			}
			if (isIndex) {
				newYaml = newYaml.replace(/^tag_group:.*$\n?/gm, "").replace(/^created_at:.*$\n?/gm, "");
			}

			newYaml = newYaml.replace(/\n{3,}/g, "\n\n").trim();
			if (newYaml === yaml.trim()) continue;

			const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${newYaml}\n---`);
			try {
				await adapter.write(filePath, newContent);
				updated++;
			} catch {}
		}

		return { updated, scanned };
	}

	/** 删除没有对应 chunk/source 记录的孤儿块文件。 */
	async cleanupOrphanChunkFiles(scanRoot?: string): Promise<{ removed: number }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		const chunks = await this.getAllChunkData();
		const sources = await this.getAllSources();
		const knownChunkIds = new Set(Object.keys(chunks));
		const knownSourceIds = new Set(Object.keys(sources));

		const chunkRoot = resolveIRImportFolder(scanRoot);
		const files = await this.listFilesRecursively(chunkRoot);
		let removed = 0;

		for (const filePath of files) {
			if (!filePath.endsWith(".md")) continue;
			let content: string;
			try {
				content = await adapter.read(filePath);
			} catch {
				continue;
			}

			if (!content.startsWith("---")) continue;
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) continue;
			const yaml = yamlMatch[1];

			if (yaml.includes("weave_type: ir-chunk")) {
				const idMatch = yaml.match(/^chunk_id:\s*(["']?)([^\n"']+)\1\s*$/m);
				if (!idMatch) continue;
				const chunkId = idMatch[2].trim();
				if (!knownChunkIds.has(chunkId)) {
					try {
						await adapter.remove(filePath);
						removed++;
					} catch {}
				}
			} else if (yaml.includes("weave_type: ir-index")) {
				const idMatch = yaml.match(/^source_id:\s*(["']?)([^\n"']+)\1\s*$/m);
				if (!idMatch) continue;
				const sourceId = idMatch[2].trim();
				const hasChunks = Object.values(chunks).some((c) => c.sourceId === sourceId);
				if (!knownSourceIds.has(sourceId) && !hasChunks) {
					try {
						await adapter.remove(filePath);
						removed++;
					} catch {}
				}
			}
		}

		return { removed };
	}

	/** 清理指向不存在源文件的旧版 blocks.json 数据。 */
	async cleanupInvalidBlocks(): Promise<{ removed: number; invalidPaths: string[] }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		const blocks = await this.getAllBlocks();
		const invalidBlockIds: string[] = [];
		const invalidPaths: string[] = [];

		for (const [blockId, block] of Object.entries(blocks)) {
			if (
				typeof (block as any).filePath !== "string" ||
				String((block as any).filePath).trim() === ""
			) {
				invalidBlockIds.push(blockId);
				invalidPaths.push(String((block as any).filePath));
				continue;
			}

			const exists = await adapter.exists(block.filePath);
			if (!exists) {
				invalidBlockIds.push(blockId);
				invalidPaths.push(block.filePath);
			}
		}

		if (invalidBlockIds.length > 0) {
			for (const blockId of invalidBlockIds) {
				delete blocks[blockId];
			}

			const store: import("../../types/ir-types").IRBlocksStore = {
				version: IR_STORAGE_VERSION,
				blocks,
			};
			const path = `${this.getStorageDir()}/${BLOCKS_FILE}`;
			await this.writeFile(path, JSON.stringify(store));

			logger.info(`[IRStorageService] 清理了 ${invalidBlockIds.length} 个无效旧版块`);
		}

		return { removed: invalidBlockIds.length, invalidPaths };
	}

	/** 清理既没有索引文件也没有关联块的源材料记录。 */
	async cleanupInvalidSources(): Promise<{ removed: number }> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		const sources = await this.getAllSources();
		const chunks = await this.getAllChunkData();
		const invalidSourceIds: string[] = [];

		for (const [sourceId, source] of Object.entries(sources)) {
			const indexExists = source.indexFilePath ? await adapter.exists(source.indexFilePath) : false;
			const hasChunks = Object.values(chunks).some((c) => c.sourceId === sourceId);

			if (!indexExists && !hasChunks) {
				invalidSourceIds.push(sourceId);
			}
		}

		if (invalidSourceIds.length > 0) {
			for (const sourceId of invalidSourceIds) {
				delete sources[sourceId];
			}

			const store: import("../../types/ir-types").IRSourcesStore = {
				version: IR_STORAGE_VERSION,
				sources,
			};
			const path = `${this.getStorageDir()}/${this.SOURCES_FILE}`;
			await this.writeFile(path, JSON.stringify(store));

			logger.info(`[IRStorageService] 清理了 ${invalidSourceIds.length} 个无效源材料`);
		}

		return { removed: invalidSourceIds.length };
	}

	/** 执行完整的数据完整性检查和清理。 */
	async performIntegrityCheck(scanRoot?: string): Promise<{
		chunksRemoved: number;
		blocksRemoved: number;
		sourcesRemoved: number;
	}> {
		logger.info("[IRStorageService] 开始数据完整性检查...");

		const chunksResult = await this.cleanupInvalidChunks();
		const blocksResult = await this.cleanupInvalidBlocks();
		const sourcesResult = await this.cleanupInvalidSources();

		const orphanFilesResult = await this.cleanupOrphanChunkFiles(scanRoot);
		if (orphanFilesResult.removed > 0) {
			logger.info(`[IRStorageService] 清理了 ${orphanFilesResult.removed} 个孤儿块文件`);
		}

		const total = chunksResult.removed + blocksResult.removed + sourcesResult.removed;
		if (total > 0) {
			logger.info(`[IRStorageService] 数据完整性检查完成，共清理 ${total} 个无效数据`);
		}

		return {
			chunksRemoved: chunksResult.removed,
			blocksRemoved: blocksResult.removed,
			sourcesRemoved: sourcesResult.removed,
		};
	}

	/** 先做完整性检查，再返回最新块数据。 */
	async getAllChunkDataWithIntegrityCheck(
		scanRoot?: string
	): Promise<Record<string, import("../../types/ir-types").IRChunkFileData>> {
		await this.performIntegrityCheck(scanRoot);
		await this.syncDeckDataFromYAML();
		return this.getAllChunkData();
	}
}
