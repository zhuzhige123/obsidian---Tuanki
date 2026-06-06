import { logger } from "../../utils/logger";
/**
 * Weave 标识符服务
 *
 * 统一管理卡片UUID和BlockID的生成、验证、写入和查询
 * 这是所有卡片创建路径的唯一入口点
 *
 * @module services/identifier
 */

import { TFile } from "obsidian";
import type { WeavePlugin } from "../../main";

import { WeaveIDGenerator } from "./WeaveIDGenerator";
import {
	BLOCK_ID_WRITE_FORMAT,
	UUID_WRITE_FORMAT,
} from "./constants";

import type {
	CardIdentifiers,
	ConflictDetectionResult,
	IdentifierGenerationContext,
	IdentifierStatistics,
	LinkToDocumentOptions,
} from "./types";
import { CardCreationMode, ConflictResolution } from "./types";

/**
 * Weave标识符服务类
 * 单例模式，确保全局统一管理
 */
export class WeaveIdentifierService {
	private static instance: WeaveIdentifierService | null = null;

	private plugin: WeavePlugin;
	private idGenerator: WeaveIDGenerator;

	// 缓存：UUID -> CardIdentifiers
	private identifiersCache: Map<string, CardIdentifiers> = new Map();

	// 索引：BlockID -> UUID
	private blockIdIndex: Map<string, string> = new Map();

	// 统计信息
	private statistics = {
		totalGenerated: 0,
		uuidCollisions: 0,
		blockIdCollisions: 0,
		cacheHits: 0,
		cacheMisses: 0,
	};

	/**
	 * 私有构造函数（单例模式）
	 */
	private constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
		this.idGenerator = WeaveIDGenerator.getInstance();
	}

	/**
	 * 获取服务实例
	 */
	static getInstance(plugin: WeavePlugin): WeaveIdentifierService {
		if (!WeaveIdentifierService.instance) {
			WeaveIdentifierService.instance = new WeaveIdentifierService(plugin);
		}
		return WeaveIdentifierService.instance;
	}

	// ============================================================================
	// 核心功能：生成标识符
	// ============================================================================

	/**
	 * 为新卡片生成标识符（统一入口）
	 *
	 * 这是所有卡片创建的唯一入口点，确保ID生成的一致性
	 *
	 * @param context 生成上下文
	 * @returns 卡片标识符
	 */
	async generateCardIdentifiers(context: IdentifierGenerationContext): Promise<CardIdentifiers> {
		logger.debug(`[WeaveIdentifierService] 生成标识符 - 模式: ${context.creationMode}`);

		// 1. 生成或复用UUID
		const uuid = context.existingUUID || this.idGenerator.generateCardUUID();

		// 2. 判断是否需要生成BlockID
		let blockId: string | undefined;
		let sourceFile: string | undefined;
		let sourceLine: number | undefined;

		if (context.sourceFile || context.forceBlockId) {
			// 有源文档或强制生成
			blockId = context.existingBlockId || this.idGenerator.generateBlockID();
			sourceFile = context.sourceFile?.path;

			// 如果有源文档，尝试写入BlockID
			if (context.sourceFile && context.sourceContent) {
				const writeResult = await this.writeBlockIDToDocument(
					context.sourceFile,
					blockId,
					context.sourceContent
				);

				if (writeResult.success) {
					sourceLine = writeResult.line;
					logger.debug(`✓ BlockID已写入文档: ${blockId} at line ${sourceLine}`);
				}
			}
		}

		// 3. 构建标识符对象
		const identifiers: CardIdentifiers = {
			uuid,
			blockId,
			sourceFile,
			sourceLine,
		};

		// 4. 写入UUID到文档（根据创建模式）
		if (context.sourceFile && context.sourceContent) {
			await this.writeUUIDToDocument(
				context.sourceFile,
				uuid,
				context.sourceContent,
				context.creationMode
			);
		}

		// 5. 更新索引和缓存
		this.updateIndices(identifiers);

		// 6. 更新统计
		this.statistics.totalGenerated++;

		logger.debug("✓ 标识符生成完成:", identifiers);
		return identifiers;
	}

	// ============================================================================
	// UUID写入
	// ============================================================================

	/**
	 * 将UUID写入文档
	 *
	 * @param file 目标文档
	 * @param uuid UUID字符串
	 * @param content 当前内容
	 * @param mode 创建模式（决定写入格式）
	 * @returns 写入结果
	 */
	async writeUUIDToDocument(
		_file: TFile,
		uuid: string,
		_content: string,
		mode: CardCreationMode
	): Promise<{
		success: boolean;
		line?: number;
		error?: string;
	}> {
		try {
			// 根据创建模式选择写入格式
			let uuidMarker: string;

			switch (mode) {
				case CardCreationMode.BATCH_PARSE:
					// 批量解析：HTML注释
					uuidMarker = UUID_WRITE_FORMAT.HTML_COMMENT(uuid);
					break;

				default:
					// 其他模式：HTML注释（通用）
					uuidMarker = UUID_WRITE_FORMAT.HTML_COMMENT(uuid);
			}

			// 实际写入UUID到文档
			try {
				// 读取文件内容
				const content = await this.plugin.app.vault.read(_file);
				const lines = content.split("\n");

				// 根据创建模式确定插入位置
				let insertLine = 0;
				if (mode === CardCreationMode.MANUAL) {
					// 内联模式：插入到指定行
					insertLine = 0; // 可以从 context 中获取
				}

				// 插入UUID标记
				lines.splice(insertLine, 0, uuidMarker);
				const newContent = lines.join("\n");

				// 写回文件
				await this.plugin.app.vault.modify(_file, newContent);

				logger.debug(`✅ UUID已写入文档: ${uuid} at line ${insertLine}`);

				return {
					success: true,
					line: insertLine,
				};
			} catch (error) {
				logger.error("❌ UUID写入失败:", error);
				return {
					success: false,
					line: 0,
					error: error instanceof Error ? error.message : "未知错误",
				};
			}
		} catch (error) {
			logger.error("❌ UUID写入失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	// ============================================================================
	// BlockID写入
	// ============================================================================

	/**
	 * 将BlockID写入文档
	 *
	 * @param file 目标文档
	 * @param blockId BlockID字符串
	 * @param content 当前内容
	 * @returns 写入结果
	 */
	async writeBlockIDToDocument(
		_file: TFile,
		blockId: string,
		_content: string
	): Promise<{
		success: boolean;
		line?: number;
		error?: string;
	}> {
		try {
			const blockIdMarker = BLOCK_ID_WRITE_FORMAT.STANDARD(blockId);

			// 实际写入BlockID到文档
			try {
				// 读取文件内容
				const content = await this.plugin.app.vault.read(_file);
				const lines = content.split("\n");

				// 找到卡片内容的末尾位置
				// 通常是在分隔符之前或文件末尾
				let insertLine = lines.length;

				// 寻找最后一个非空行
				for (let i = lines.length - 1; i >= 0; i--) {
					if (lines[i].trim() !== "") {
						insertLine = i + 1;
						break;
					}
				}

				// 插入BlockID标记
				lines.splice(insertLine, 0, blockIdMarker);
				const newContent = lines.join("\n");

				// 写回文件
				await this.plugin.app.vault.modify(_file, newContent);

				logger.debug(`✅ BlockID已写入文档: ${blockId} at line ${insertLine}`);

				return {
					success: true,
					line: insertLine,
				};
			} catch (error) {
				logger.error("❌ BlockID写入失败:", error);
				return {
					success: false,
					line: 0,
					error: error instanceof Error ? error.message : "未知错误",
				};
			}
		} catch (error) {
			logger.error("❌ BlockID写入失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "未知错误",
			};
		}
	}

	// ============================================================================
	// 延迟关联功能
	// ============================================================================

	/**
	 * 将已创建的卡片关联到文档（延迟关联）
	 *
	 * 用于手动创建的卡片后续导出到笔记
	 *
	 * @param cardId 卡片ID
	 * @param uuid 卡片UUID
	 * @param options 关联选项
	 * @returns 生成的标识符
	 */
	async linkCardToDocument(
		cardId: string,
		uuid: string,
		options: LinkToDocumentOptions
	): Promise<CardIdentifiers> {
		logger.debug(`[WeaveIdentifierService] 关联卡片到文档: ${cardId}`);

		// 1. 检查是否已有BlockID
		const existing = this.identifiersCache.get(uuid);
		if (existing?.blockId && !options.overrideExisting) {
			throw new Error("卡片已有BlockID，设置overrideExisting=true以覆盖");
		}

		// 2. 生成新BlockID
		const blockId = this.idGenerator.generateBlockID();

		// 3. 准备写入内容
		const _blockIdMarker = BLOCK_ID_WRITE_FORMAT.STANDARD(blockId);

		// TODO: 根据insertFormat决定如何插入
		// - annotation: 插入到标注块末尾
		// - batch-parse: 插入到批量解析区域
		// - inline: 直接插入到指定位置

		// 4. 写入文档
		if (options.autoSave) {
			await this.writeBlockIDToDocument(
				options.targetFile,
				blockId,
				"" // TODO: 获取文档内容
			);
		}

		// 5. 更新标识符
		const identifiers: CardIdentifiers = {
			uuid,
			blockId,
			sourceFile: options.targetFile.path,
			sourceLine: options.insertPosition,
		};

		this.updateIndices(identifiers);

		return identifiers;
	}

	// ============================================================================
	// 验证功能
	// ============================================================================

	/**
	 * 验证标识符有效性
	 */
	validateIdentifiers(identifiers: CardIdentifiers): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		// 验证UUID
		if (!this.idGenerator.isValidUUID(identifiers.uuid)) {
			errors.push(`无效的UUID格式: ${identifiers.uuid}`);
		}

		// 验证BlockID（如果存在）
		if (identifiers.blockId && !this.idGenerator.isValidBlockID(identifiers.blockId)) {
			errors.push(`无效的BlockID格式: ${identifiers.blockId}`);
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * 检测冲突
	 */
	async detectConflicts(identifiers: CardIdentifiers): Promise<ConflictDetectionResult> {
		const result: ConflictDetectionResult = {
			hasConflict: false,
		};

		// 检查UUID冲突
		const uuidExists = await this.checkUUIDExists(identifiers.uuid);
		if (uuidExists) {
			result.hasConflict = true;
			result.conflictType = "uuid";
			result.conflictingIdentifiers = { uuid: identifiers.uuid };
			result.suggestedResolution = ConflictResolution.REGENERATE;
		}

		// 检查BlockID冲突（在同一文档内）
		if (identifiers.blockId && identifiers.sourceFile) {
			const blockIdExists = await this.checkBlockIDExists(
				identifiers.blockId,
				identifiers.sourceFile
			);

			if (blockIdExists) {
				result.hasConflict = true;
				result.conflictType = result.conflictType === "uuid" ? "both" : "blockId";
				result.conflictingIdentifiers = {
					...result.conflictingIdentifiers,
					blockId: identifiers.blockId,
				};
				result.suggestedResolution = ConflictResolution.REGENERATE;
			}
		}

		return result;
	}

	// ============================================================================
	// 查询功能
	// ============================================================================

	/**
	 * 通过UUID查找标识符
	 */
	findByUUID(uuid: string): CardIdentifiers | undefined {
		return this.identifiersCache.get(uuid);
	}

	/**
	 * 通过BlockID查找UUID
	 */
	findUUIDByBlockId(blockId: string): string | undefined {
		return this.blockIdIndex.get(blockId);
	}

	/**
	 * 检查UUID是否存在
	 */
	private async checkUUIDExists(uuid: string): Promise<boolean> {
		// 1. 先查缓存（性能优化）
		if (this.identifiersCache.has(uuid)) {
			this.statistics.cacheHits++;
			return true;
		}

		this.statistics.cacheMisses++;

		// 2. 使用DirectFileCardReader查询
		try {
			if (!this.plugin.directFileReader) {
				logger.warn("[WeaveIdentifierService] DirectFileCardReader not available");
				return false;
			}

			const card = await this.plugin.directFileReader.getCardByUUID(uuid);

			// 如果找到卡片，更新缓存
			if (card) {
				this.identifiersCache.set(uuid, {
					uuid: card.uuid,
					blockId: undefined, // 可以从卡片元数据中提取
					sourceFile: undefined,
					sourceLine: undefined,
				});
				return true;
			}

			return false;
		} catch (error) {
			logger.error("[WeaveIdentifierService] 查询UUID失败:", error);
			return false;
		}
	}

	/**
	 * 检查BlockID是否存在（在指定文档内）
	 */
	private async checkBlockIDExists(blockId: string, filePath: string): Promise<boolean> {
		try {
			// 1. 先查缓存索引
			if (this.blockIdIndex.has(blockId)) {
				this.statistics.cacheHits++;
				return true;
			}

			this.statistics.cacheMisses++;

			// 2. 扫描文档内容检查BlockID
			const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				return false;
			}

			const content = await this.plugin.app.vault.read(file);

			// 检查是否包含BlockID标记
			const blockIdPattern = new RegExp(`\\^${blockId}\\b`);
			return blockIdPattern.test(content);
		} catch (error) {
			logger.error("[WeaveIdentifierService] 检查BlockID失败:", error);
			return false;
		}
	}

	// ============================================================================
	// 索引管理
	// ============================================================================

	/**
	 * 更新索引和缓存
	 */
	private updateIndices(identifiers: CardIdentifiers): void {
		// 更新UUID缓存
		this.identifiersCache.set(identifiers.uuid, identifiers);

		// 更新BlockID索引
		if (identifiers.blockId) {
			this.blockIdIndex.set(identifiers.blockId, identifiers.uuid);
		}
	}

	/**
	 * 清除缓存
	 */
	clearCache(): void {
		this.identifiersCache.clear();
		this.blockIdIndex.clear();
		logger.debug("[WeaveIdentifierService] 缓存已清除");
	}

	/**
	 * 重建索引
	 */
	rebuildIndices(): void {
		this.clearCache();

		logger.debug("[WeaveIdentifierService] 索引重建完成");
	}

	// ============================================================================
	// 统计信息
	// ============================================================================

	/**
	 * 获取统计信息
	 */
	getStatistics(): IdentifierStatistics {
		return {
			totalUUIDs: this.identifiersCache.size,
			newFormatCount: 0, // TODO: 统计新格式UUID
			legacyFormatCount: 0, // TODO: 统计旧格式UUID
			cardsWithBlockId: Array.from(this.identifiersCache.values()).filter((i) => i.blockId).length,
			cardsWithoutBlockId: Array.from(this.identifiersCache.values()).filter((i) => !i.blockId)
				.length,
			orphanCards: Array.from(this.identifiersCache.values()).filter((i) => !i.sourceFile).length,
			conflicts: 0, // TODO: 统计冲突数量
		};
	}

	/**
	 * 获取内部统计
	 */
	getInternalStatistics(): typeof WeaveIdentifierService.prototype.statistics {
		return { ...this.statistics };
	}
}

// ============================================================================
// 便捷函数导出
// ============================================================================

/**
 * 获取标识符服务实例（便捷函数）
 * @param plugin AnkiPlugin实例
 */
export const getIdentifierService = (plugin: WeavePlugin) =>
	WeaveIdentifierService.getInstance(plugin);
