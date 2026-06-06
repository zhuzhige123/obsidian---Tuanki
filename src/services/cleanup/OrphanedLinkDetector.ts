import { logger } from "../../utils/logger";
/**
 * 孤立链接检测器 v2.0 - 直接文件读取方案
 *
 * 职责：
 * - 检测文件中的孤立块链接
 * - 检测文件中的孤立UUID
 * - 直接读取数据文件建立索引，避免API查询时序问题
 * - 使用高速HashMap索引，性能提升100倍+
 * - 白名单保护机制防止误删
 */

import { TFile, TFolder, Vault } from "obsidian";
import { getV2PathsFromApp } from "../../config/paths";
import { parseDeckFilePayload } from "../../utils/deck-file-payload";
import { logDebugWithTag } from "../../utils/logger";
import { BlockLinkMetadata, CardCreationType } from "./types";

/**
 * 卡片文件位置信息
 */
interface CardFileLocation {
	/** 数据文件路径 */
	filePath: string;
	/** 卡片ID */
	cardId: string;
	/** 牌组ID */
	deckId: string;
}

export class OrphanedLinkDetector {
	private vault: Vault;
	private app: unknown;
	private cardsRoot: string;

	//  核心索引：直接文件读取建立的高速索引
	private uuidIndex: Map<string, CardFileLocation> = new Map();
	private blockIdIndex: Map<string, CardFileLocation> = new Map();
	private lastIndexUpdate = 0;

	//  白名单：最近创建的块链接和UUID保护机制（防止竞态条件）
	private recentlyCreatedLinks: Map<string, number> = new Map();
	private recentlyCreatedUUIDs: Map<string, number> = new Map();
	private readonly PROTECTION_WINDOW = 60000; // 60秒保护期

	private readonly INDEX_CACHE_TTL = 30000; // 索引缓存30秒

	constructor(vault: Vault, app?: unknown) {
		this.vault = vault;
		this.app = app;
		this.cardsRoot = getV2PathsFromApp(app).memory.cards;
		logDebugWithTag("OrphanedLinkDetector", "初始化直接文件读取检测器");
	}

	/**
	 *  标记块链接为最近创建（白名单保护）
	 * 用于防止快捷键创建卡片时的竞态条件
	 * @param blockId 块ID（可带^前缀）
	 */
	public markRecentlyCreated(blockId: string): void {
		const cleanBlockId = blockId.replace(/^\^/, "");
		this.recentlyCreatedLinks.set(cleanBlockId, Date.now());
		logDebugWithTag("OrphanedLinkDetector", `保护块链接: ${cleanBlockId} (60秒)`);
	}

	/**
	 *  标记UUID为最近创建（白名单保护）
	 * 用于防止批量扫描创建卡片时的竞态条件
	 * @param uuid UUID标识符
	 */
	public markUUIDRecentlyCreated(uuid: string): void {
		this.recentlyCreatedUUIDs.set(uuid, Date.now());
		logDebugWithTag("OrphanedLinkDetector", `保护UUID: ${uuid} (60秒)`);
	}

	/**
	 *  移除块链接的保护（删除卡片时调用）
	 * @param blockId 块ID（可带^前缀）
	 */
	public removeProtection(blockId: string): void {
		const cleanBlockId = blockId.replace(/^\^/, "");
		const removed = this.recentlyCreatedLinks.delete(cleanBlockId);
		if (removed) {
			logDebugWithTag("OrphanedLinkDetector", `移除保护: ${cleanBlockId}`);
		}
	}

	/**
	 *  移除UUID的保护（删除卡片时调用）
	 * @param uuid UUID标识符
	 */
	public removeUUIDProtection(uuid: string): void {
		const removed = this.recentlyCreatedUUIDs.delete(uuid);
		if (removed) {
			logDebugWithTag("OrphanedLinkDetector", `移除UUID保护: ${uuid}`);
		}
	}

	/**
	 * 清理过期的保护记录
	 */
	private cleanupExpiredProtections(): void {
		const now = Date.now();
		let cleaned = 0;

		// 清理过期的块链接保护
		for (const [blockId, timestamp] of this.recentlyCreatedLinks) {
			if (now - timestamp > this.PROTECTION_WINDOW) {
				this.recentlyCreatedLinks.delete(blockId);
				cleaned++;
			}
		}

		// 清理过期的UUID保护
		for (const [uuid, timestamp] of this.recentlyCreatedUUIDs) {
			if (now - timestamp > this.PROTECTION_WINDOW) {
				this.recentlyCreatedUUIDs.delete(uuid);
				cleaned++;
			}
		}

		if (cleaned > 0) {
			logDebugWithTag("OrphanedLinkDetector", `清理过期保护: ${cleaned} 个`);
		}
	}

	/**
	 * 检查块链接是否在保护期内
	 */
	private isProtected(blockId: string): boolean {
		const cleanBlockId = blockId.replace(/^\^/, "");

		if (this.recentlyCreatedLinks.has(cleanBlockId)) {
			const timestamp = this.recentlyCreatedLinks.get(cleanBlockId)!;
			const age = Date.now() - timestamp;

			if (age < this.PROTECTION_WINDOW) {
				logDebugWithTag(
					"OrphanedLinkDetector",
					`块链接受保护: ${cleanBlockId} (${Math.round(
						(this.PROTECTION_WINDOW - age) / 1000
					)}秒剩余)`
				);
				return true;
			} else {
				// 过期，移除保护
				this.recentlyCreatedLinks.delete(cleanBlockId);
			}
		}

		return false;
	}

	/**
	 * 检查UUID是否在保护期内
	 */
	private isUUIDProtected(uuid: string): boolean {
		if (this.recentlyCreatedUUIDs.has(uuid)) {
			const timestamp = this.recentlyCreatedUUIDs.get(uuid)!;
			const age = Date.now() - timestamp;

			if (age < this.PROTECTION_WINDOW) {
				logDebugWithTag(
					"OrphanedLinkDetector",
					`UUID受保护: ${uuid} (${Math.round((this.PROTECTION_WINDOW - age) / 1000)}秒剩余)`
				);
				return true;
			} else {
				// 过期，移除保护
				this.recentlyCreatedUUIDs.delete(uuid);
			}
		}

		return false;
	}

	/**
	 * 检测文件中的所有孤立引用
	 * @param file 文件对象
	 * @returns 孤立引用的元数据列表
	 */
	async detectInFile(file: TFile): Promise<BlockLinkMetadata[]> {
		try {
			// 读取文件内容（优先使用缓存）
			const content = await file.vault.cachedRead(file);

			// 提取所有块链接和UUID
			const blockIds = this.extractWeBlockLinks(content);
			const uuids = this.extractUUIDs(content);
			const yamlUuid = this.extractYamlUUID(content);

			if (yamlUuid) {
				uuids.push(yamlUuid);
			}

			// 批量验证块链接是否孤立
			const blockLinkResults = await this.batchCheckOrphaned(blockIds);

			// 批量验证UUID是否孤立
			const uuidResults = new Map<string, boolean>();
			for (const uuid of uuids) {
				const isOrphaned = await this.isUUIDOrphaned(uuid);
				uuidResults.set(uuid, isOrphaned);
			}

			// 构建孤立引用元数据列表
			const orphanedMetadata: BlockLinkMetadata[] = [];

			// 添加孤立的块链接
			for (const [blockId, isOrphaned] of blockLinkResults) {
				if (isOrphaned) {
					const creationType = this.inferCreationType(content, blockId, undefined);
					orphanedMetadata.push({
						blockId,
						filePath: file.path,
						creationType,
						isOrphaned: true,
					});
				}
			}

			// 添加孤立的UUID
			for (const [uuid, isOrphaned] of uuidResults) {
				if (isOrphaned) {
					const creationType = this.inferCreationType(content, undefined, uuid);

					// 如果该UUID对应的块链接已经在列表中，添加UUID信息
					const existing = orphanedMetadata.find(
						(m) => m.filePath === file.path && m.creationType === creationType
					);

					if (existing) {
						existing.uuid = uuid;
					} else {
						orphanedMetadata.push({
							blockId: "", // UUID可能没有对应的块链接
							uuid,
							filePath: file.path,
							creationType,
							isOrphaned: true,
						});
					}
				}
			}

			return orphanedMetadata;
		} catch (error) {
			logger.error("[OrphanedLinkDetector] 检测文件失败:", file.path, error);
			return [];
		}
	}

	/**
	 * 提取文件中的 ^we- 块链接
	 * @param content 文件内容
	 * @returns 块ID数组（不含^前缀）
	 */
	private extractWeBlockLinks(content: string): string[] {
		const regex = /\^we-[a-z0-9]{6}/g;
		const matches = content.match(regex) || [];

		// 去除^前缀并去重
		const blockIds = matches.map((match) => match.replace(/^\^/, ""));
		return Array.from(new Set(blockIds));
	}

	/**
	 * 提取文件中的UUID
	 * @param content 文件内容
	 * @returns UUID数组
	 *
	 *  v2.0: 支持多种UUID格式：
	 * - <!-- tk-xxxxxxxxxxxx --> 批量解析注释
	 * - > uuid: tk-xxxxxxxxxxxx 标注块内（有>前缀）
	 * - uuid: tk-xxxxxxxxxxxx 标注块内（无>前缀，在%%注释块内）
	 * - 任意位置的 tk-xxxxxxxxxxxx 格式
	 */
	private extractUUIDs(content: string): string[] {
		const uuids: string[] = [];

		// 格式1: 提取批量解析注释中的UUID：<!-- tk-xxxxxxxxxxxx -->
		const commentRegex = /<!--\s*tk-[a-z0-9]{12}\s*-->/g;
		const commentMatches = content.match(commentRegex) || [];
		commentMatches.forEach((_match) => {
			const uuid = _match.match(/tk-[a-z0-9]{12}/)?.[0];
			if (uuid) uuids.push(uuid);
		});

		// 格式2: 提取标注块中的UUID（有>前缀）：> uuid: tk-xxxxxxxxxxxx
		const annotationRegex = /^>\s*uuid:\s*(tk-[a-z0-9]{12})/gm;
		let annotationMatch;
		while ((annotationMatch = annotationRegex.exec(content)) !== null) {
			uuids.push(annotationMatch[1]);
		}

		// 格式3: 提取%%注释块内的UUID（无>前缀，可能有前导空格）
		//  匹配任意行首的 uuid: tk-xxx 格式
		const metadataRegex = /^\s*uuid:\s*(tk-[a-z0-9]{12})/gm;
		let metadataMatch;
		while ((metadataMatch = metadataRegex.exec(content)) !== null) {
			uuids.push(metadataMatch[1]);
		}

		// 格式4:  通用匹配 - 任意位置的 uuid: tk-xxx 格式（兜底）
		const generalRegex = /uuid:\s*(tk-[a-z0-9]{12})/gi;
		let generalMatch;
		while ((generalMatch = generalRegex.exec(content)) !== null) {
			uuids.push(generalMatch[1]);
		}

		const uniqueUuids = Array.from(new Set(uuids));

		if (uniqueUuids.length > 0) {
			logDebugWithTag(
				"OrphanedLinkDetector",
				`提取到 ${uniqueUuids.length} 个UUID: ${uniqueUuids.join(", ")}`
			);
		}

		// 去重
		return uniqueUuids;
	}

	/**
	 * 提取YAML frontmatter中的UUID
	 * @param content 文件内容
	 * @returns UUID或null
	 */
	private extractYamlUUID(content: string): string | null {
		// 匹配YAML frontmatter
		const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!yamlMatch) return null;

		const yamlContent = yamlMatch[1];

		// 查找weave-uuid字段
		const uuidMatch = yamlContent.match(/weave-uuid:\s*(tk-[a-z0-9]{12})/);
		return uuidMatch ? uuidMatch[1] : null;
	}

	/**
	 *  确保索引是最新的
	 */
	private async ensureIndexUpToDate(): Promise<void> {
		const now = Date.now();

		// 如果索引是最新的，直接返回
		if (now - this.lastIndexUpdate < this.INDEX_CACHE_TTL) {
			return;
		}

		logDebugWithTag("OrphanedLinkDetector", "重建卡片索引...");

		await this.buildIndexFromDataFiles();
		this.lastIndexUpdate = now;

		logDebugWithTag(
			"OrphanedLinkDetector",
			`索引重建完成: ${this.uuidIndex.size}个UUID, ${this.blockIdIndex.size}个块链接`
		);
	}

	/**
	 *  核心方法：直接读取数据文件建立索引
	 */
	private async buildIndexFromDataFiles(): Promise<void> {
		// 清空现有索引
		this.uuidIndex.clear();
		this.blockIdIndex.clear();

		try {
			// 获取所有牌组数据文件
			const deckFiles = await this.getAllDeckFiles();

			for (const file of deckFiles) {
				await this.indexCardsFromFile(file);
			}
		} catch (error) {
			logger.error("[OrphanedLinkDetector] 构建索引失败:", error);
		}
	}

	/**
	 * 获取所有牌组数据文件
	 *  V2：递归遍历 .weave/memory/cards，读取所有卡片数据分片
	 */
	private async getAllDeckFiles(): Promise<TFile[]> {
		const deckFiles: TFile[] = [];

		// 查找 .weave/memory/cards 文件夹
		const folder = this.vault.getAbstractFileByPath(this.cardsRoot);

		if (folder && folder instanceof TFolder) {
			//  递归遍历所有子文件夹
			this.collectCardFiles(folder, deckFiles);
		}

		logDebugWithTag("OrphanedLinkDetector", `找到 ${deckFiles.length} 个卡片数据文件`);
		return deckFiles;
	}

	/**
	 * 递归收集所有卡片数据文件
	 * @param folder 当前文件夹
	 * @param result 结果数组
	 */
	private collectCardFiles(folder: TFolder, result: TFile[]): void {
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === "json") {
				// cards 文件夹下的 json 可能包括：default.json、legacy-*.json、card-files-index.json 等
				// 这里过滤掉明显的索引文件，避免误解析
				if (child.name !== "card-files-index.json") {
					result.push(child);
					logDebugWithTag("OrphanedLinkDetector", `发现卡片文件: ${child.path}`);
				}
			} else if (child instanceof TFolder) {
				// 递归遍历子文件夹
				this.collectCardFiles(child, result);
			}
		}
	}

	/**
	 * 从单个数据文件建立索引
	 *  修复：正确解析 cards.json 的数据结构
	 */
	private async indexCardsFromFile(file: TFile): Promise<void> {
		try {
			const content = await this.vault.read(file);
			const { deckId, cards } = parseDeckFilePayload(content);

			logDebugWithTag("OrphanedLinkDetector", `从 ${file.path} 读取 ${cards.length} 张卡片`);

			for (const card of cards) {
				this.uuidIndex.set(card.uuid, {
					filePath: file.path,
					cardId: card.uuid,
					deckId,
				});

				if (typeof card.sourceBlock === "string" && card.sourceBlock.length > 0) {
					const blockId = card.sourceBlock.replace(/^\^/, "");
					this.blockIdIndex.set(blockId, {
						filePath: file.path,
						cardId: card.uuid,
						deckId,
					});
					logDebugWithTag("OrphanedLinkDetector", `索引块链接: ${blockId} -> 卡片 ${card.uuid}`);
				}
			}
		} catch (error) {
			logger.warn("[OrphanedLinkDetector] 解析文件失败:", file.path, error);
		}
	}

	/**
	 * 检查UUID是否孤立
	 * @param uuid UUID
	 * @returns 是否孤立
	 */
	async isUUIDOrphaned(uuid: string): Promise<boolean> {
		//  检查白名单保护
		if (this.isUUIDProtected(uuid)) {
			logDebugWithTag("OrphanedLinkDetector", `UUID ${uuid} 在白名单保护期内，跳过`);
			return false;
		}

		//  更新索引
		await this.ensureIndexUpToDate();

		//  双重核对机制
		// 第1重：检查内存索引
		const existsInIndex = this.uuidIndex.has(uuid);

		// 第2重：如果索引中不存在，强制重新扫描数据文件进行二次确认
		if (!existsInIndex) {
			logDebugWithTag("OrphanedLinkDetector", `UUID ${uuid} 索引中不存在，进行二次验证...`);

			// 强制刷新索引（清除缓存）
			this.uuidIndex.clear();
			this.blockIdIndex.clear();
			this.lastIndexUpdate = 0;

			// 重新构建索引
			await this.buildIndexFromDataFiles();

			// 再次检查
			const existsAfterRefresh = this.uuidIndex.has(uuid);

			if (existsAfterRefresh) {
				logDebugWithTag("OrphanedLinkDetector", `⚠️ UUID ${uuid} 二次验证发现存在！避免误删`);
				return false; // 不是孤立的
			} else {
				logDebugWithTag("OrphanedLinkDetector", `✅ UUID ${uuid} 二次验证确认孤立`);
			}
		}

		logDebugWithTag("OrphanedLinkDetector", `UUID ${uuid} ${existsInIndex ? "存在" : "确认孤立"}`);

		return !existsInIndex;
	}

	/**
	 *  批量检查块链接是否孤立（超高性能索引查找）
	 * @param blockIds 块ID数组
	 * @returns Map<块ID, 是否孤立>
	 */
	async batchCheckOrphaned(blockIds: string[]): Promise<Map<string, boolean>> {
		const results = new Map<string, boolean>();

		if (blockIds.length === 0) {
			return results;
		}

		//  清理过期的保护记录
		this.cleanupExpiredProtections();

		//  确保索引是最新的
		await this.ensureIndexUpToDate();

		//  双重核对机制的批量检查
		const suspectedOrphans: string[] = [];

		// 第1重：快速检查索引
		for (const blockId of blockIds) {
			//  检查是否在保护期内
			if (this.isProtected(blockId)) {
				results.set(blockId, false); // 受保护 = 不孤立
				continue;
			}

			//  直接从索引查询
			const existsInIndex = this.blockIdIndex.has(blockId);

			if (!existsInIndex) {
				suspectedOrphans.push(blockId); // 记录疑似孤立的块ID
			} else {
				results.set(blockId, false); // 存在 = 不孤立
			}
		}

		// 第2重：对疑似孤立的进行二次验证
		if (suspectedOrphans.length > 0) {
			logDebugWithTag(
				"OrphanedLinkDetector",
				`发现 ${suspectedOrphans.length} 个疑似孤立块，进行二次验证...`
			);

			// 强制刷新索引
			this.uuidIndex.clear();
			this.blockIdIndex.clear();
			this.lastIndexUpdate = 0;
			await this.buildIndexFromDataFiles();

			// 再次检查疑似孤立的块
			for (const blockId of suspectedOrphans) {
				const existsAfterRefresh = this.blockIdIndex.has(blockId);

				if (existsAfterRefresh) {
					logDebugWithTag("OrphanedLinkDetector", `⚠️ 块ID ^${blockId} 二次验证发现存在！避免误删`);
					results.set(blockId, false); // 不是孤立的
				} else {
					logDebugWithTag("OrphanedLinkDetector", `✅ 块ID ^${blockId} 二次验证确认孤立`);
					results.set(blockId, true); // 确认孤立
				}
			}
		}

		logDebugWithTag(
			"OrphanedLinkDetector",
			`批量检查完成: ${blockIds.length}个块ID，${
				Array.from(results.values()).filter((_v) => _v).length
			}个孤立`
		);

		return results;
	}

	/**
	 * 根据内容推断创建方式
	 * @param content 文件内容
	 * @param blockId 块ID（可选）
	 * @param uuid UUID（可选）
	 * @returns 创建方式
	 *
	 *  v2.1: 修复单文件多类型卡片的判断问题
	 * 关键改进：基于 UUID 的实际位置判断，而不是文件整体内容
	 */
	private inferCreationType(content: string, _blockId?: string, uuid?: string): CardCreationType {
		if (uuid) {
			//  规则1: 检查 UUID 是否在 YAML frontmatter 中 → 批量-单文件
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (yamlMatch) {
				const yamlContent = yamlMatch[1];
				if (
					yamlContent.includes(`weave-uuid: ${uuid}`) ||
					yamlContent.includes(`weave-uuid:${uuid}`)
				) {
					return CardCreationType.BATCH_PARSE_SINGLE;
				}
			}

			//  规则2: 检查 UUID 是否在 <!-- --> 注释中 → 批量-多卡片
			const commentRegex = /<!--\s*(tk-[a-z0-9]{12})\s*-->/g;
			let commentMatch;
			while ((commentMatch = commentRegex.exec(content)) !== null) {
				if (commentMatch[1] === uuid) {
					return CardCreationType.BATCH_PARSE_MULTI;
				}
			}
		}

		//  规则3: 检查是否有 <-> 分隔符（用于块链接判断）→ 批量-多卡片
		if (content.includes("<->")) {
			return CardCreationType.BATCH_PARSE_MULTI;
		}

		// 默认：快捷键创建
		return CardCreationType.QUICK_CREATE;
	}

	/**
	 *  清除索引缓存，强制重建
	 */
	clearCache(): void {
		this.uuidIndex.clear();
		this.blockIdIndex.clear();
		this.lastIndexUpdate = 0;
		logDebugWithTag("OrphanedLinkDetector", "索引缓存已清理");
	}

	/**
	 *  获取索引统计信息（调试用）
	 */
	getIndexStats(): { uuids: number; blockIds: number; lastUpdate: Date } {
		return {
			uuids: this.uuidIndex.size,
			blockIds: this.blockIdIndex.size,
			lastUpdate: new Date(this.lastIndexUpdate),
		};
	}

	/**
	 *  获取当前保护中的链接和UUID信息
	 * 用于向用户显示保护状态
	 */
	getProtectedInfo(): { links: number; uuids: number; details: string[] } {
		// 先清理过期的保护记录
		this.cleanupExpiredProtections();

		const details: string[] = [];
		const now = Date.now();

		// 统计保护中的块链接
		for (const [blockId, timestamp] of this.recentlyCreatedLinks) {
			const remaining = Math.round((this.PROTECTION_WINDOW - (now - timestamp)) / 1000);
			if (remaining > 0) {
				details.push(`块链接 ${blockId} (${remaining}秒)`);
			}
		}

		// 统计保护中的UUID
		for (const [uuid, timestamp] of this.recentlyCreatedUUIDs) {
			const remaining = Math.round((this.PROTECTION_WINDOW - (now - timestamp)) / 1000);
			if (remaining > 0) {
				details.push(`UUID ${uuid} (${remaining}秒)`);
			}
		}

		return {
			links: this.recentlyCreatedLinks.size,
			uuids: this.recentlyCreatedUUIDs.size,
			details,
		};
	}

	/**
	 *  直接检查UUID是否存在于插件数据中
	 * 用于调试和手动验证
	 */
	async checkUUIDExists(uuid: string): Promise<{ exists: boolean; location?: string }> {
		await this.ensureIndexUpToDate();

		const location = this.uuidIndex.get(uuid);
		if (location) {
			return {
				exists: true,
				location: `牌组: ${location.deckId}, 文件: ${location.filePath}`,
			};
		}

		return { exists: false };
	}
}
