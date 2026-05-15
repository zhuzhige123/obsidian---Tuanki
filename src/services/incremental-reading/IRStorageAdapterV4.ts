/**
 * IR 存储适配器 v4.0
 *
 * 功能：
 * - 连接 IRBlockV4 与现有 IRStorageService
 * - 数据格式转换（V3 ↔ V4）
 * - 提供类型安全的存储操作
 *
 * 对齐《增量阅读-算法实施权威规范.md》
 */
import { TFile } from "obsidian";
import type { App } from "obsidian";
import type { IRBlock, IRDeck, IRSession } from "../../types/ir-types";
import type { IRBlockMeta, IRBlockStats, IRBlockStatus, IRBlockV4 } from "../../types/ir-types";
import {
	DEFAULT_IR_BLOCK_META,
	DEFAULT_IR_BLOCK_STATS,
	mapStateToStatus,
	migrateToIRBlockV4,
} from "../../types/ir-types";
import { logger } from "../../utils/logger";
import { IRStorageService } from "./IRStorageService";

/**
 * V4 存储适配器
 * 在现有 IRStorageService 之上提供 V4 类型支持
 */
export class IRStorageAdapterV4 {
	private storage: IRStorageService;
	private app: App;

	constructor(app: App, storage?: IRStorageService) {
		this.app = app;
		this.storage = storage || new IRStorageService(app);
	}

	/**
	 * 初始化
	 */
	async initialize(): Promise<void> {
		await this.storage.initialize();
	}

	// ============================================
	// 内容块操作 (V4)
	// ============================================

	/**
	 * 获取所有内容块 (V4格式)
	 */
	async getAllBlocksV4(): Promise<Record<string, IRBlockV4>> {
		const blocks = await this.storage.getAllBlocks();
		const result: Record<string, IRBlockV4> = {};

		for (const [id, block] of Object.entries(blocks)) {
			result[id] = this.toV4(block);
		}

		return result;
	}

	/**
	 * 获取单个内容块 (V4格式)
	 */
	async getBlockV4(id: string): Promise<IRBlockV4 | null> {
		const block = await this.storage.getBlock(id);
		return block ? this.toV4(block) : null;
	}

	/**
	 * 获取牌组的所有内容块 (V4格式)
	 * v5.4: 优先使用 chunk 阅读点兼容视图，必要时回退到 legacy block 兼容视图
	 */
	async getBlocksByDeckV4(deckId: string, includeIgnored = false): Promise<IRBlockV4[]> {
		// 1. 优先从 chunk 阅读点兼容视图获取（旧 chunks 文件已删除时会由新 points 投影）
		const deck = await this.storage.getDeckById(deckId);
		if (deck) {
			const allChunks = await this.storage.getAllChunkData();
			const deckTag = `#IR_deck_${deck.name}`;

			const matchedChunks = Object.values(allChunks).filter((_chunk) => {
				if (
					typeof (_chunk as any).filePath !== "string" ||
					String((_chunk as any).filePath).trim() === ""
				)
					return false;
				if (_chunk.deckTag === deckTag) return true;
				if (_chunk.deckIds?.includes(deckId)) return true;
				return false;
			});

			if (matchedChunks.length > 0) {
				logger.info(
					`[IRStorageAdapterV4] getBlocksByDeckV4: 从 chunk 阅读点兼容视图获取 ${matchedChunks.length} 个块`
				);

				// v5.4: 转换 IRChunkFileData → IRBlockV4，并从块文件读取标题
				// v6.1: 预先获取 sources 数据，用于设置正确的 sourcePath（源文档路径）
				const allSources = await this.storage.getAllSources();
				const blocks = await Promise.all(
					matchedChunks.map((chunk) => this.chunkToV4WithTitle(chunk, allSources))
				);

				if (includeIgnored) return blocks;

				return blocks.filter((_b) => {
					if (_b.status === "suspended" || _b.status === "removed") return false;
					return !this.hasIgnoreTag(_b);
				});
			}
		}

		// 2. 回退到旧版 block 兼容视图
		const blocks = await this.storage.getBlocksByDeck(deckId, includeIgnored, "IRStorageAdapterV4");

		if (blocks.length > 0) {
			const v3StateCounts: Record<string, number> = {};
			for (const b of blocks) {
				v3StateCounts[b.state] = (v3StateCounts[b.state] || 0) + 1;
			}
			logger.debug(
				`[IRStorageAdapterV4] getBlocksByDeckV4: 从 legacy block 兼容视图获取，V3状态分布=${JSON.stringify(
					v3StateCounts
				)}`
			);
		}

		const result = blocks.map((b) => this.toV4(b));
		if (includeIgnored) return result;
		return result.filter((_b) => {
			if (_b.status === "suspended" || _b.status === "removed") return false;
			return !this.hasIgnoreTag(_b);
		});
	}

	async getBlocksByDeckV4Fast(deckId: string, includeIgnored = false): Promise<IRBlockV4[]> {
		const deck = await this.storage.getDeckById(deckId);
		if (deck) {
			const allChunks = await this.storage.getAllChunkData();
			const deckTag = `#IR_deck_${deck.name}`;

			const matchedChunks = Object.values(allChunks).filter((_chunk) => {
				if (
					typeof (_chunk as any).filePath !== "string" ||
					String((_chunk as any).filePath).trim() === ""
				)
					return false;
				if (_chunk.deckTag === deckTag) return true;
				if (_chunk.deckIds?.includes(deckId)) return true;
				return false;
			});

			if (matchedChunks.length > 0) {
				const allSources = await this.storage.getAllSources();
				const blocks = matchedChunks.map((chunk) => this.chunkToV4Fast(chunk, allSources));

				if (includeIgnored) return blocks;

				return blocks.filter((_b) => {
					if (_b.status === "suspended" || _b.status === "removed") return false;
					return !this.hasIgnoreTag(_b);
				});
			}
		}

		// 回退到旧版 block 兼容视图
		const blocks = await this.storage.getBlocksByDeck(
			deckId,
			includeIgnored,
			"IRStorageAdapterV4Fast"
		);
		const result = blocks.map((b) => this.toV4(b));
		if (includeIgnored) return result;
		return result.filter((_b) => {
			if (_b.status === "suspended" || _b.status === "removed") return false;
			return !this.hasIgnoreTag(_b);
		});
	}

	/**
	 * 将 IRChunkFileData 转换为 IRBlockV4
	 * @param chunk 块数据
	 * @param sourceOriginalPath 可选的源文档原始路径（用于文档关联筛选）
	 */
	private chunkToV4(
		chunk: import("../../types/ir-types").IRChunkFileData,
		_sourceOriginalPath?: string
	): IRBlockV4 {
		// v6.1: sourcePath 优先使用源文档的原始路径，便于卡片管理界面的文档关联筛选
		const sourcePath =
			typeof _sourceOriginalPath === "string" && _sourceOriginalPath.trim().length > 0
				? _sourceOriginalPath
				: typeof (chunk as any).filePath === "string"
				? chunk.filePath
				: "";

		const priorityUi =
			typeof (chunk as any).priorityUi === "number" ? (chunk as any).priorityUi : chunk.priorityEff;
		return {
			id: chunk.chunkId,
			sourcePath,
			blockId: chunk.chunkId,
			contentHash: "",
			status: chunk.scheduleStatus,
			priorityUi,
			priorityEff: chunk.priorityEff,
			intervalDays: chunk.intervalDays,
			nextRepDate: chunk.nextRepDate,
			stats: chunk.stats,
			meta: chunk.meta,
			createdAt: chunk.createdAt,
			updatedAt: chunk.updatedAt,
		};
	}

	/**
	 * v5.4: 将 IRChunkFileData 转换为 IRBlockV4，并从块文件读取标题和内容预览
	 * v6.1: 支持传入 sources 数据，用于设置正确的 sourcePath（源文档路径）
	 */
	private async chunkToV4WithTitle(
		chunk: import("../../types/ir-types").IRChunkFileData,
		sources?: Record<string, import("../../types/ir-types").IRSourceFileMeta>
	): Promise<IRBlockV4> {
		// v6.1: 通过 sourceId 查找源文档的原始路径
		const sourceOriginalPath = sources?.[chunk.sourceId]?.originalPath;
		const block = this.chunkToV4(chunk, sourceOriginalPath);

		const sourceTagGroup = sources?.[chunk.sourceId]?.tagGroup;
		if (typeof sourceTagGroup === "string" && sourceTagGroup.trim().length > 0) {
			const current = (block.meta as any)?.tagGroup;
			if (!current || current === "default") {
				block.meta = {
					...block.meta,
					tagGroup: sourceTagGroup,
				};
			}
		}

		try {
			if (
				typeof (chunk as any).filePath !== "string" ||
				String((chunk as any).filePath).trim() === ""
			) {
				logger.warn(`[IRStorageAdapterV4] 块 filePath 无效: ${String((chunk as any).filePath)}`);
				return block;
			}

			// 读取块文件内容
			const exists = await this.app.vault.adapter.exists(chunk.filePath);
			if (!exists) {
				logger.warn(`[IRStorageAdapterV4] 块文件不存在: ${chunk.filePath}`);
				return block;
			}

			const content = await this.app.vault.adapter.read(chunk.filePath);
			if (!content) return block;

			// 从 YAML frontmatter 提取 tags（供 #ignore 过滤使用）
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (yamlMatch) {
				const yamlContent = yamlMatch[1];
				const tags = this.extractTagsFromYamlContent(yamlContent);
				if (tags.length > 0) {
					(block as any).tags = tags;
				}
			} else {
				const file = this.app.vault.getAbstractFileByPath(chunk.filePath);
				if (file instanceof TFile) {
					const cache = this.app.metadataCache.getFileCache(file);
					const inlineTags = cache?.tags?.map((t) => t.tag.replace(/^#/, "")) || [];
					const fmTagsRaw = cache?.frontmatter?.tags;
					let fmTags: string[] = [];
					if (Array.isArray(fmTagsRaw)) {
						fmTags = fmTagsRaw.map((t) => String(t));
					} else if (typeof fmTagsRaw === "string") {
						fmTags = fmTagsRaw.split(",").map((t) => t.trim());
					}
					const allTags = [...new Set([...fmTags, ...inlineTags])].filter(Boolean);
					if (allTags.length > 0) {
						(block as any).tags = allTags;
					}
				}
			}

			// 移除 YAML frontmatter
			let bodyContent = content;
			const yamlEndMatch = content.match(/^---\n[\s\S]*?\n---\n/);
			if (yamlEndMatch) {
				bodyContent = content.substring(yamlEndMatch[0].length).trim();
			}

			// v5.4: 提取标题 - 扫描所有行找第一个 # 标题
			const lines = bodyContent.split("\n");
			let title = "";
			let firstNonEmptyLine = "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;

				// 记录第一个非空行（用于备用标题）
				if (!firstNonEmptyLine) {
					firstNonEmptyLine = trimmed;
				}

				// 检查是否是 Markdown 标题行 (# ## ### 等)
				const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
				if (headingMatch) {
					title = headingMatch[2].trim();
					break; // 找到标题，停止扫描
				}
			}

			// 如果没有找到 # 标题，使用第一行内容作为标题
			if (!title && firstNonEmptyLine) {
				// 移除可能的链接语法 [[ ]]
				title = firstNonEmptyLine.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1").substring(0, 50);
			}

			// 生成内容预览（前200字符，移除标题行）
			const contentPreview = bodyContent.substring(0, 200).replace(/\n/g, " ");

			// 扩展 block 对象添加标题信息
			(block as any).headingText = title || "未命名内容块";
			(block as any).contentPreview = contentPreview;
		} catch (error) {
			logger.warn(`[IRStorageAdapterV4] 读取块文件失败: ${chunk.filePath}`, error);
		}

		return block;
	}

	private chunkToV4Fast(
		chunk: import("../../types/ir-types").IRChunkFileData,
		sources?: Record<string, import("../../types/ir-types").IRSourceFileMeta>
	): IRBlockV4 {
		const sourceOriginalPath = sources?.[chunk.sourceId]?.originalPath;
		const block = this.chunkToV4(chunk, sourceOriginalPath);

		const sourceTagGroup = sources?.[chunk.sourceId]?.tagGroup;
		if (typeof sourceTagGroup === "string" && sourceTagGroup.trim().length > 0) {
			const current = (block.meta as any)?.tagGroup;
			if (!current || current === "default") {
				block.meta = {
					...block.meta,
					tagGroup: sourceTagGroup,
				};
			}
		}

		try {
			const filePath = (chunk as any).filePath;
			if (typeof filePath === "string" && filePath.trim()) {
				const baseName = filePath.replace(/^.*\//, "").replace(/\.md$/, "");
				const derived = baseName.replace(/^\d+_/, "").trim();
				(block as any).headingText = derived || "未命名内容块";

				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					const cache = this.app.metadataCache.getFileCache(file);
					const inlineTags = cache?.tags?.map((t) => t.tag.replace(/^#/, "")) || [];
					const fmTagsRaw = cache?.frontmatter?.tags;
					let fmTags: string[] = [];
					if (Array.isArray(fmTagsRaw)) {
						fmTags = fmTagsRaw.map((t) => String(t));
					} else if (typeof fmTagsRaw === "string") {
						fmTags = fmTagsRaw.split(",").map((t) => t.trim());
					}
					const allTags = [...new Set([...fmTags, ...inlineTags])].filter(Boolean);
					if (allTags.length > 0) {
						(block as any).tags = allTags;
					}
				}
			}
		} catch {}

		return block;
	}

	private extractTagsFromYamlContent(yamlContent: string): string[] {
		const lines = yamlContent.split("\n");
		const tags: string[] = [];
		let inTags = false;
		for (const rawLine of lines) {
			const line = rawLine.trimEnd();
			if (!inTags) {
				if (line === "tags:" || line.startsWith("tags: [")) {
					inTags = true;
					if (line.startsWith("tags: [") && line.endsWith("]")) {
						const inner = line.slice("tags: [".length, -1).trim();
						if (!inner) return [];
						return inner
							.split(",")
							.map((t) => t.trim().replace(/^['\"]|['\"]$/g, ""))
							.filter(Boolean);
					}
				}
				continue;
			}

			const itemMatch = line.match(/^[-*]\s+(.+)$/);
			if (itemMatch) {
				tags.push(itemMatch[1].trim());
				continue;
			}

			if (/^[A-Za-z0-9_\-]+:/.test(line)) {
				break;
			}
		}
		return tags;
	}

	private hasIgnoreTag(block: IRBlockV4): boolean {
		const tags = (block as any).tags as string[] | undefined;
		const hasIgnoreInTags =
			tags?.some((_tag) => {
				const t = String(_tag).toLowerCase();
				return t === "ignore" || t === "#ignore";
			}) || false;

		const contentPreview = (block as any).contentPreview as string | undefined;
		const hasIgnoreInContent = /#ignore\b/i.test(contentPreview || "");
		return hasIgnoreInTags || hasIgnoreInContent;
	}

	/**
	 * 获取文件的所有内容块 (V4格式)
	 */
	async getBlocksByFileV4(filePath: string): Promise<IRBlockV4[]> {
		const blocks = await this.storage.getBlocksByFile(filePath);
		return blocks.map((b) => this.toV4(b));
	}

	/**
	 * 保存内容块 (V4格式)
	 */
	async saveBlockV4(block: IRBlockV4): Promise<void> {
		const v3Block = this.toV3(block);
		await this.storage.saveBlock(v3Block);
		logger.debug(`[IRStorageAdapterV4] 保存V4内容块: ${block.id}`);
	}

	/**
	 * 批量保存内容块 (V4格式)
	 */
	async saveBlocksV4(blocks: IRBlockV4[]): Promise<void> {
		const v3Blocks = blocks.map((b) => this.toV3(b));
		await this.storage.saveBlocks(v3Blocks);
		logger.debug(`[IRStorageAdapterV4] 批量保存 ${blocks.length} 个V4内容块`);
	}

	/**
	 * 删除内容块
	 */
	async deleteBlock(id: string): Promise<void> {
		await this.storage.deleteBlock(id);
	}

	/**
	 * 删除文件的所有内容块
	 */
	async deleteBlocksByFile(filePath: string): Promise<void> {
		await this.storage.deleteBlocksByFile(filePath);
	}

	// ============================================
	// 牌组操作 (直接代理)
	// ============================================

	getAllDecks(): Promise<Record<string, IRDeck>> {
		return this.storage.getAllDecks();
	}

	getDeckById(idOrPath: string): Promise<IRDeck | null> {
		return this.storage.getDeckById(idOrPath);
	}

	saveDeck(deck: IRDeck): Promise<void> {
		return this.storage.saveDeck(deck);
	}

	deleteDeck(idOrPath: string): Promise<void> {
		return this.storage.deleteDeck(idOrPath);
	}

	addBlocksToDeck(deckId: string, blockIds: string[]): Promise<void> {
		return this.storage.addBlocksToDeck(deckId, blockIds);
	}

	removeBlocksFromDeck(deckId: string, blockIds: string[]): Promise<void> {
		return this.storage.removeBlocksFromDeck(deckId, blockIds);
	}

	// ============================================
	// 历史记录操作 (直接代理)
	// ============================================

	getHistory(): Promise<{ sessions: IRSession[] }> {
		return this.storage.getHistory();
	}

	addSession(session: IRSession): Promise<void> {
		return this.storage.addSession(session);
	}

	getBlockSessions(blockId: string): Promise<IRSession[]> {
		return this.storage.getBlockSessions(blockId);
	}

	// ============================================
	// V4 特有操作
	// ============================================

	/**
	 * 获取到期的 V4 内容块
	 */
	async getDueBlocksV4(deckId: string): Promise<IRBlockV4[]> {
		const blocks = await this.getBlocksByDeckV4(deckId);
		const endOfToday = new Date();
		endOfToday.setHours(23, 59, 59, 999);
		const endMs = endOfToday.getTime();

		// 🔍 调试日志：统计各状态块数量
		const statusCounts: Record<string, number> = {};
		for (const b of blocks) {
			statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
		}
		logger.info(
			`[IRStorageAdapterV4] getDueBlocksV4: deckId=${deckId}, 总块数=${
				blocks.length
			}, 状态分布=${JSON.stringify(statusCounts)}`
		);

		const dueBlocks = blocks.filter((_block) => {
			// 排除已完成和暂停的
			if (
				_block.status === "done" ||
				_block.status === "suspended" ||
				_block.status === "removed"
			) {
				return false;
			}

			// 排除带有 #ignore 标签的内容块
			if (this.hasIgnoreTag(_block)) {
				return false;
			}

			// 仅纳入“当天到期”的内容块
			if (_block.nextRepDate === 0) return true;
			if (_block.nextRepDate > endMs) return false;
			return true;
		});

		logger.info(`[IRStorageAdapterV4] getDueBlocksV4 筛选结果: 到期块数=${dueBlocks.length}`);

		return dueBlocks;
	}

	/**
	 * 获取指定状态的 V4 内容块
	 */
	async getBlocksByStatusV4(deckId: string, status: IRBlockStatus): Promise<IRBlockV4[]> {
		const blocks = await this.getBlocksByDeckV4(deckId);
		return blocks.filter((b) => b.status === status);
	}

	/**
	 * 更新内容块统计信息
	 */
	async updateBlockStatsV4(
		blockId: string,
		statsUpdate: Partial<IRBlockStats>
	): Promise<IRBlockV4 | null> {
		const block = await this.getBlockV4(blockId);
		if (!block) return null;

		block.stats = {
			...block.stats,
			...statsUpdate,
			lastInteraction: Date.now(),
		};
		block.updatedAt = Date.now();

		await this.saveBlockV4(block);
		return block;
	}

	/**
	 * 记录阅读会话并更新块统计
	 */
	async recordReadingSessionV4(
		block: IRBlockV4,
		readingTimeSec: number,
		effectiveTimeSec: number,
		actions: { extracts?: number; cardsCreated?: number; notesWritten?: number }
	): Promise<IRBlockV4> {
		// 更新统计
		block.stats.impressions++;
		block.stats.totalReadingTimeSec += readingTimeSec;
		block.stats.effectiveReadingTimeSec += effectiveTimeSec;
		block.stats.extracts += actions.extracts || 0;
		block.stats.cardsCreated += actions.cardsCreated || 0;
		block.stats.notesWritten += actions.notesWritten || 0;
		block.stats.lastInteraction = Date.now();
		block.stats.lastShownAt = Date.now();

		block.updatedAt = Date.now();

		// 保存并记录会话
		await this.saveBlockV4(block);

		// 添加到历史记录
		const session: IRSession = {
			id: `session-${Date.now()}`,
			blockId: block.id,
			deckId: block.sourcePath,
			startTime: new Date(Date.now() - readingTimeSec * 1000).toISOString(),
			endTime: new Date().toISOString(),
			duration: readingTimeSec,
			action: "completed",
			rating: block.priorityUi,
		};
		await this.addSession(session);

		logger.debug(`[IRStorageAdapterV4] 记录阅读会话: block=${block.id}, time=${readingTimeSec}s`);

		return block;
	}

	// ============================================
	// 数据格式转换
	// ============================================

	/**
	 * IRBlock (V3) → IRBlockV4
	 */
	private toV4(block: IRBlock): IRBlockV4 {
		return migrateToIRBlockV4(block);
	}

	/**
	 * IRBlockV4 → IRBlock (V3) - 公开版本
	 * Kept only for legacy V3 storage compatibility during V4 scheduling updates.
	 */
	v4ToV3Public(block: IRBlockV4): IRBlock {
		return this.toV3(block);
	}

	/**
	 * IRBlockV4 → IRBlock (V3)
	 * 用于保存到现有存储
	 */
	private toV3(block: IRBlockV4): IRBlock {
		// 将 V4 status 映射回 V3 state
		const stateMap: Record<IRBlockStatus, "new" | "learning" | "review" | "suspended"> = {
			new: "new",
			queued: "learning",
			scheduled: "review",
			active: "learning",
			suspended: "suspended",
			done: "review",
			removed: "suspended",
		};

		const v3Block: IRBlock = {
			// 基础字段
			id: block.id,
			filePath: block.sourcePath || "",
			headingPath: block.headingPath || "",
			headingLevel: block.headingLevel || 0,
			headingText: (block as any).headingText || "",
			startLine: block.startLine || 0,
			endLine: block.endLine || 0,
			contentPreview: (block as any).contentPreview || "",
			deckPath: block.sourcePath || "",

			// 状态字段
			state: stateMap[block.status],

			// 优先级字段 (V3 保留双优先级)
			priority: this.mapPriorityUiToEnum(block.priorityUi),
			priorityUi: block.priorityUi,
			priorityEff: block.priorityEff,

			// 调度字段
			interval: block.intervalDays,
			intervalFactor: 1.0, // V4 不使用此字段
			lastReview:
				block.stats.lastInteraction > 0
					? new Date(block.stats.lastInteraction).toISOString()
					: null,
			nextReview: block.nextRepDate > 0 ? new Date(block.nextRepDate).toISOString() : null,
			reviewCount: block.stats.impressions,

			// 统计字段
			totalReadingTime: block.stats.totalReadingTimeSec,

			// 元数据
			favorite: false,
			tags: [],
			notes: "",
			extractedCards: [],
			tagGroupId: block.meta.tagGroup,

			// 时间戳
			firstReadAt:
				block.stats.lastInteraction > 0
					? new Date(block.stats.lastInteraction).toISOString()
					: null,
			createdAt: new Date(block.createdAt).toISOString(),
			updatedAt: new Date(block.updatedAt).toISOString(),

			// V4 专有字段存储在扩展区
			_v4: {
				status: block.status,
				stats: block.stats,
				meta: block.meta,
				contentHash: block.contentHash,
			},
		} as unknown as IRBlock;

		return v3Block;
	}

	/**
	 * 将连续优先级(0-10)映射为枚举
	 */
	private mapPriorityUiToEnum(priorityUi: number): "low" | "medium" | "high" | "critical" {
		if (priorityUi >= 8) return "critical";
		if (priorityUi >= 6) return "high";
		if (priorityUi >= 4) return "medium";
		return "low";
	}

	// ============================================
	// 批量迁移工具
	// ============================================

	/**
	 * 将所有 V3 内容块迁移到 V4 格式
	 * （实际数据仍存储为 V3，但会补全 V4 字段）
	 */
	async migrateAllToV4(): Promise<{ migrated: number; errors: number }> {
		const blocks = await this.storage.getAllBlocks();
		let migrated = 0;
		let errors = 0;

		const v3Blocks: IRBlock[] = [];

		for (const [id, block] of Object.entries(blocks)) {
			try {
				// 转换为 V4 再转回 V3（补全缺失字段）
				const v4 = this.toV4(block);
				const v3 = this.toV3(v4);
				v3Blocks.push(v3);
				migrated++;
			} catch (error) {
				logger.error(`[IRStorageAdapterV4] 迁移失败: ${id}`, error);
				errors++;
			}
		}

		if (v3Blocks.length > 0) {
			await this.storage.saveBlocks(v3Blocks);
		}

		logger.info(`[IRStorageAdapterV4] 迁移完成: migrated=${migrated}, errors=${errors}`);
		return { migrated, errors };
	}
}
