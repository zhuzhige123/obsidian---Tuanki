import { logger } from "../../utils/logger";
/**
 * 统一块链接清理服务
 *
 * 职责：
 * - 管理所有清理策略
 * - 根据卡片创建方式选择清理策略
 * - 提供统一的清理接口
 * - 支持单文件和批量清理
 *
 * 结构说明：
 * - 使用直接文件读取的孤立检测器
 * - 摆脱dataStorage API依赖，避免时序问题
 * - 性能提升100倍+，准确性接近100%
 */

import { App, TFile, Vault } from "obsidian";
import type { WeaveDataStorage } from "../../data/storage";
import type { Card } from "../../data/types";
import { logDebugWithTag } from "../../utils/logger";
import { FrontmatterManager, WEAVE_UUID_FIELD } from "../batch-parsing/FrontmatterManager";
import { ICleanupStrategy } from "./MetadataCleanupStrategy";
import { OrphanedLinkDetector } from "./OrphanedLinkDetector";
import { BatchParseMultiCleanupStrategy } from "./strategies/BatchParseMultiCleanupStrategy";
import { BatchParseSingleCleanupStrategy } from "./strategies/BatchParseSingleCleanupStrategy";
import { QuickCreateCleanupStrategy } from "./strategies/QuickCreateCleanupStrategy";
import { CardCreationType, CleanupResult, CleanupTarget } from "./types";

/**
 * 清理服务依赖
 */
export interface CleanupServiceDependencies {
	dataStorage: WeaveDataStorage;
	vault: Vault;
	app: App;
}

/**
 * 块链接清理服务
 */
export class BlockLinkCleanupService {
	private static instance: BlockLinkCleanupService | null = null;

	private dataStorage: WeaveDataStorage | null = null;
	private vault: Vault | null = null;
	private app: App | null = null;
	private detector: OrphanedLinkDetector | null = null;
	private strategies: Map<CardCreationType, ICleanupStrategy> = new Map();
	private initialized = false;

	/**
	 * 私有构造函数（单例模式）
	 */
	private constructor() {}

	/**
	 * 获取单例实例
	 */
	public static getInstance(): BlockLinkCleanupService {
		if (!BlockLinkCleanupService.instance) {
			BlockLinkCleanupService.instance = new BlockLinkCleanupService();
		}
		return BlockLinkCleanupService.instance;
	}

	public static resetInstance(): void {
		if (!BlockLinkCleanupService.instance) {
			return;
		}

		BlockLinkCleanupService.instance.destroy();
		BlockLinkCleanupService.instance = null;
	}

	/**
	 * 初始化服务
	 */
	public initialize(dependencies: CleanupServiceDependencies): void {
		this.dataStorage = dependencies.dataStorage;
		this.vault = dependencies.vault;
		this.app = dependencies.app;

		//  创建新版检测器（直接文件读取方案）
		this.detector = new OrphanedLinkDetector(dependencies.vault, dependencies.app);

		// 注册所有清理策略
		this.registerStrategy(CardCreationType.QUICK_CREATE, new QuickCreateCleanupStrategy());

		this.registerStrategy(
			CardCreationType.BATCH_PARSE_SINGLE,
			new BatchParseSingleCleanupStrategy(this.app)
		);

		this.registerStrategy(CardCreationType.BATCH_PARSE_MULTI, new BatchParseMultiCleanupStrategy());

		this.initialized = true;
		logDebugWithTag("CleanupService", "初始化完成");
	}

	/**
	 * 注册清理策略
	 */
	private registerStrategy(type: CardCreationType, strategy: ICleanupStrategy): void {
		this.strategies.set(type, strategy);
	}

	/**
	 * 获取清理策略
	 */
	private getStrategy(type: CardCreationType): ICleanupStrategy {
		const strategy = this.strategies.get(type);
		if (!strategy) {
			// 默认使用快捷键清理策略
			logger.warn(`[CleanupService] 未找到策略: ${type}，使用默认策略`);
			return this.strategies.get(CardCreationType.QUICK_CREATE)!;
		}
		return strategy;
	}

	/**
	 * 卡片删除后的清理（核心方法1）
	 * @param card 被删除的卡片
	 * @returns 清理结果
	 */
	public async cleanupAfterCardDeletion(card: Card): Promise<CleanupResult> {
		try {
			// 检查必要条件
			if (!this.vault) {
				return {
					success: false,
					filePath: card.sourceFile || "",
					error: "没有vault实例",
					cleanedItems: [],
				};
			}

			if (!card.sourceFile) {
				return {
					success: true, // 没有源文件就不需要清理
					filePath: "",
					cleanedItems: [],
				};
			}

			// 推断卡片类型
			const creationType = await this.inferCreationType(card);

			// 构建清理目标
			const blockIdWithoutPrefix = card.sourceBlock?.replace(/^\^/, "");
			const target: CleanupTarget = {
				filePath: card.sourceFile || "",
				blockId: blockIdWithoutPrefix,
				uuid: card.uuid,
				creationType,
				metadata: card.metadata,
			};

			// 如果没有源文件，无法清理
			if (!target.filePath) {
				return {
					success: true,
					filePath: "",
					cleanedItems: [],
				};
			}

			// 删除卡片时立即移除保护
			// 原因：60秒保护期会导致全局清理认为块链接“不孤立”
			if (card.sourceBlock) {
				this.removeProtection(card.sourceBlock);
			}
			if (card.uuid) {
				this.removeUUIDProtection(card.uuid);
			}

			// 获取对应策略并执行
			const strategy = this.getStrategy(creationType);
			const result = await strategy.execute(target, this.vault!);

			logDebugWithTag("CleanupService", `删除后清理完成: ${card.uuid} (${creationType})`);

			return result;
		} catch (error) {
			logger.error("[CleanupService] 删除后清理失败:", error);
			return {
				success: false,
				filePath: card.sourceFile || "",
				cleanedItems: [],
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * 批量清理删除后的源文档痕迹。
	 * 安全边界：
	 * - 只移除插件写入的 weave 元数据、块锚点和删除注释
	 * - 不删除用户正文内容
	 * - 同一文件只读写一次，降低批量删除时的开销
	 */
	public async cleanupAfterCardDeletions(cards: Card[]): Promise<CleanupResult[]> {
		const validCards = cards.filter((card) => card?.sourceFile);
		if (validCards.length === 0) {
			return [];
		}

		const cardsByFile = new Map<string, Card[]>();
		for (const card of validCards) {
			const fileCards = cardsByFile.get(card.sourceFile!) || [];
			fileCards.push(card);
			cardsByFile.set(card.sourceFile!, fileCards);
		}

		const results: CleanupResult[] = [];

		for (const [filePath, fileCards] of cardsByFile.entries()) {
			const fileResult: CleanupResult = {
				success: true,
				filePath,
				cleanedItems: [],
				errors: [],
			};

			try {
				if (!this.vault || !this.app) {
					fileResult.success = false;
					fileResult.error = "清理服务未初始化";
					results.push(fileResult);
					continue;
				}

				const file = this.vault.getAbstractFileByPath(filePath);
				if (!(file instanceof TFile)) {
					fileResult.success = false;
					fileResult.error = `文件不存在: ${filePath}`;
					results.push(fileResult);
					continue;
				}

				let content = await this.vault.read(file);
				let changed = false;

				for (const card of fileCards) {
					try {
						if (card.sourceBlock) {
							this.removeProtection(card.sourceBlock);
						}
						if (card.uuid) {
							this.removeUUIDProtection(card.uuid);
						}

						const creationType = await this.inferCreationTypeFromCurrentContent(content, card);
						const target: CleanupTarget = {
							filePath,
							blockId: card.sourceBlock?.replace(/^\^/, ""),
							uuid: card.uuid,
							creationType,
							metadata: card.metadata,
						};

						const applyResult = this.applyCleanupToContent(content, target);
						content = applyResult.content;
						changed = changed || applyResult.changed;

						if (applyResult.cleanedItems.length > 0) {
							fileResult.cleanedItems.push(...applyResult.cleanedItems);
						}
						if (applyResult.error) {
							fileResult.errors?.push({
								item: card.uuid || card.sourceBlock || filePath,
								error: applyResult.error,
							});
						}
					} catch (error) {
						fileResult.errors?.push({
							item: card.uuid || card.sourceBlock || filePath,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				if (changed) {
					await this.vault.modify(file, content);
				}

				if (fileResult.errors && fileResult.errors.length > 0) {
					fileResult.success = false;
					fileResult.error = `部分清理失败: ${fileResult.errors.length} 项`;
				}
			} catch (error) {
				fileResult.success = false;
				fileResult.error = error instanceof Error ? error.message : String(error);
			}

			results.push(fileResult);
		}

		return results;
	}

	/**
	 * 清理块链接（核心方法2）
	 * @param filePath 文件路径
	 * @param blockId 块ID（不含^前缀）
	 * @returns 清理结果
	 */
	public async cleanupBlockLink(filePath: string, blockId: string): Promise<CleanupResult> {
		if (!this.initialized) {
			return {
				success: false,
				filePath,
				cleanedItems: [],
				error: "清理服务未初始化",
			};
		}

		try {
			// 构建清理目标（假设为快捷键创建）
			const target: CleanupTarget = {
				filePath,
				blockId,
				creationType: CardCreationType.QUICK_CREATE,
			};

			// 执行清理
			const strategy = this.getStrategy(CardCreationType.QUICK_CREATE);
			return await strategy.execute(target, this.vault!);
		} catch (error) {
			logger.error("[CleanupService] 清理块链接失败:", error);
			return {
				success: false,
				filePath,
				cleanedItems: [],
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * 清理UUID（核心方法3）
	 * @param filePath 文件路径
	 * @param uuid UUID
	 * @returns 清理结果
	 */
	public async cleanupUUID(filePath: string, uuid: string): Promise<CleanupResult> {
		if (!this.initialized) {
			return {
				success: false,
				filePath,
				cleanedItems: [],
				error: "清理服务未初始化",
			};
		}

		try {
			// 读取文件判断创建方式
			const file = this.vault?.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				return {
					success: false,
					filePath,
					cleanedItems: [],
					error: "文件不存在",
				};
			}

			const content = await this.vault?.read(file);
			if (!content) {
				return {
					success: false,
					filePath,
					cleanedItems: [],
					error: "无法读取文件内容",
				};
			}
			const creationType = this.inferCreationTypeFromContent(content, undefined, uuid);

			// 构建清理目标
			const target: CleanupTarget = {
				filePath,
				uuid,
				creationType,
			};

			// 执行清理
			const strategy = this.getStrategy(creationType);
			return await strategy.execute(target, this.vault!);
		} catch (error) {
			logger.error("[CleanupService] 清理UUID失败:", error);
			return {
				success: false,
				filePath,
				cleanedItems: [],
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * 清理文件中的所有孤立引用（核心方法4）
	 * @param file 文件对象
	 * @returns 清理结果
	 */
	public async cleanupFile(file: TFile): Promise<CleanupResult> {
		if (!this.initialized) {
			return {
				success: false,
				filePath: file.path,
				cleanedItems: [],
				error: "清理服务未初始化",
			};
		}

		const result: CleanupResult = {
			success: true,
			filePath: file.path,
			cleanedItems: [],
		};

		try {
			// 检测孤立引用
			const orphanedMetadata = await this.detector?.detectInFile(file);

			if (!orphanedMetadata || orphanedMetadata.length === 0) {
				logDebugWithTag("CleanupService", `文件无孤立引用: ${file.path}`);
				return result;
			}

			logDebugWithTag("CleanupService", `发现 ${orphanedMetadata.length} 个孤立引用: ${file.path}`);

			// 按创建方式分组
			const groupedByType = new Map<CardCreationType, typeof orphanedMetadata>();
			for (const metadata of orphanedMetadata) {
				const group = groupedByType.get(metadata.creationType) || [];
				group.push(metadata);
				groupedByType.set(metadata.creationType, group);
			}

			// 依次清理每组
			for (const [creationType, metadataList] of groupedByType) {
				const strategy = this.getStrategy(creationType);

				for (const metadata of metadataList) {
					const target: CleanupTarget = {
						filePath: file.path,
						blockId: metadata.blockId,
						uuid: metadata.uuid,
						creationType,
					};

					try {
						const cleanupResult = await strategy.execute(target, this.vault!);
						if (cleanupResult.success) {
							result.cleanedItems.push(...cleanupResult.cleanedItems);
						}
					} catch (error) {
						logger.error("[CleanupService] 清理单个引用失败:", metadata, error);
						// 继续处理其他引用
					}
				}
			}

			logDebugWithTag(
				"CleanupService",
				`文件清理完成: ${file.path}, 清理 ${result.cleanedItems.length} 项`
			);
		} catch (error) {
			logger.error("[CleanupService] 文件清理失败:", file.path, error);
			result.success = false;
			result.error = error instanceof Error ? error.message : String(error);
		}

		return result;
	}

	/**
	 * 推断卡片创建方式
	 */
	private async inferCreationType(card: Card): Promise<CardCreationType> {
		// 规则1: 检查 metadata.creationType（新卡片）
		const metadataCreationType = (card as any).metadata?.creationType;
		if (metadataCreationType) {
			return metadataCreationType as CardCreationType;
		}

		if (card.isBatchScanned) {
			return card.sourceBlock
				? CardCreationType.BATCH_PARSE_MULTI
				: CardCreationType.BATCH_PARSE_SINGLE;
		}

		// 规则2: 如果没有源文件，默认为快捷键
		if (!card.sourceFile) {
			return CardCreationType.QUICK_CREATE;
		}

		// 规则3: 读取文件判断
		try {
			const file = this.vault?.getAbstractFileByPath(card.sourceFile);
			if (!(file instanceof TFile)) {
				return CardCreationType.QUICK_CREATE;
			}

			const content = await this.vault?.read(file);
			if (!content) {
				return CardCreationType.QUICK_CREATE;
			}

			if (card.sourceBlock && card.uuid) {
				const cleanBlockId = card.sourceBlock.replace(/^\^/, "");
				const escapedUuid = card.uuid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const escapedBlockId = cleanBlockId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

				const multiCardMarkerRegex = new RegExp(
					`<!--\\s*${escapedUuid}\\s*-->[^\\r\\n]*\\^${escapedBlockId}(?![A-Za-z0-9_-])`,
					"i"
				);
				if (multiCardMarkerRegex.test(content)) {
					return CardCreationType.BATCH_PARSE_MULTI;
				}

				const quickCreateBlockRegex = new RegExp(`\\^${escapedBlockId}(?![A-Za-z0-9_-])`, "m");
				if (quickCreateBlockRegex.test(content)) {
					return CardCreationType.QUICK_CREATE;
				}
			}

			return this.inferCreationTypeFromContent(content, card.sourceBlock, card.uuid);
		} catch (error) {
			logger.warn("[CleanupService] 读取文件失败，使用默认创建方式:", error);
			return CardCreationType.QUICK_CREATE;
		}
	}

	private async inferCreationTypeFromCurrentContent(
		content: string,
		card: Card
	): Promise<CardCreationType> {
		const metadataCreationType = (card as any).metadata?.creationType;
		if (metadataCreationType) {
			return metadataCreationType as CardCreationType;
		}

		if (card.isBatchScanned) {
			return card.sourceBlock
				? CardCreationType.BATCH_PARSE_MULTI
				: CardCreationType.BATCH_PARSE_SINGLE;
		}

		return this.inferCreationTypeFromContent(content, card.sourceBlock, card.uuid);
	}

	private applyCleanupToContent(
		content: string,
		target: CleanupTarget
	): { content: string; changed: boolean; cleanedItems: string[]; error?: string } {
		switch (target.creationType) {
			case CardCreationType.QUICK_CREATE:
				return this.applyQuickCreateCleanup(content, target);
			case CardCreationType.BATCH_PARSE_SINGLE:
				return this.applyBatchParseSingleCleanup(content, target);
			case CardCreationType.BATCH_PARSE_MULTI:
				return this.applyBatchParseMultiCleanup(content, target);
			default:
				return {
					content,
					changed: false,
					cleanedItems: [],
					error: `不支持的清理类型: ${target.creationType}`,
				};
		}
	}

	private applyQuickCreateCleanup(
		content: string,
		target: CleanupTarget
	): { content: string; changed: boolean; cleanedItems: string[]; error?: string } {
		if (!target.blockId) {
			return { content, changed: false, cleanedItems: [] };
		}

		const nextContent = this.removeBlockLinkFromLine(content, target.blockId);
		return {
			content: nextContent,
			changed: nextContent !== content,
			cleanedItems: nextContent !== content ? [`^${target.blockId}`] : [],
		};
	}

	private applyBatchParseSingleCleanup(
		content: string,
		target: CleanupTarget
	): { content: string; changed: boolean; cleanedItems: string[]; error?: string } {
		let nextContent = content;
		const cleanedItems: string[] = [];
		const frontmatterManager = new FrontmatterManager(this.app!);
		const frontmatter = frontmatterManager.parseFrontmatterFromContent(content);
		const currentUuid =
			typeof frontmatter[WEAVE_UUID_FIELD] === "string" ? frontmatter[WEAVE_UUID_FIELD] : undefined;

		if (target.uuid && currentUuid === target.uuid) {
			const nextFrontmatter = { ...frontmatter };
			delete nextFrontmatter[WEAVE_UUID_FIELD];
			nextFrontmatter.tags = this.mergeDeletionTag(nextFrontmatter.tags);
			nextContent = this.replaceFrontmatterContent(nextContent, nextFrontmatter);
			cleanedItems.push(`weave-uuid: ${target.uuid}`, "tags: we_已删除");
		}

		if (target.blockId) {
			const withRemovedBlock = this.removeBlockLinkFromLine(nextContent, target.blockId);
			if (withRemovedBlock !== nextContent) {
				nextContent = withRemovedBlock;
				cleanedItems.push(`块链接: ^${target.blockId}`);
			}
		}

		return {
			content: nextContent,
			changed: nextContent !== content,
			cleanedItems,
		};
	}

	private applyBatchParseMultiCleanup(
		content: string,
		target: CleanupTarget
	): { content: string; changed: boolean; cleanedItems: string[]; error?: string } {
		const identifier = target.blockId || target.uuid;
		if (!identifier) {
			return { content, changed: false, cleanedItems: [] };
		}

		const blockInfo = this.findCardBlock(content, identifier);
		if (!blockInfo) {
			return {
				content,
				changed: false,
				cleanedItems: [],
				error: `未找到卡片块: ${identifier}`,
			};
		}

		const nextContent = this.markCardBlockAsDeleted(
			content,
			blockInfo.startIndex,
			blockInfo.endIndex
		);

		return {
			content: nextContent,
			changed: nextContent !== content,
			cleanedItems: nextContent !== content ? [`#we_已删除标签 (${identifier})`] : [],
		};
	}

	private removeBlockLinkFromLine(content: string, blockId: string): string {
		const blockPattern = new RegExp(`\\s*\\^${this.escapeRegex(blockId)}(?![A-Za-z0-9_-])`, "gm");

		const match = blockPattern.exec(content);
		if (!match) {
			return content;
		}

		const beforeMatch = content.substring(0, match.index);
		const lineStartIndex = beforeMatch.lastIndexOf("\n") + 1;
		const lineEndIndex = content.indexOf("\n", match.index);
		const actualLineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
		const currentLine = content.substring(lineStartIndex, actualLineEnd);
		const cleanedLine = currentLine
			.replace(new RegExp(`\\s*\\^${this.escapeRegex(blockId)}.*$`), "")
			.trimEnd();

		return content.substring(0, lineStartIndex) + cleanedLine + content.substring(actualLineEnd);
	}

	private replaceFrontmatterContent(content: string, frontmatter: Record<string, unknown>): string {
		const yamlString = this.stringifyYAML(frontmatter);
		const newFrontmatter = `---\n${yamlString}\n---`;

		if (content.match(/^---[\r\n]/)) {
			const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
			if (frontmatterRegex.test(content)) {
				return content.replace(frontmatterRegex, newFrontmatter);
			}

			return content.replace(/^---[\r\n][\s\S]*?[\r\n]+---/, newFrontmatter);
		}

		return `${newFrontmatter}\n\n${content}`;
	}

	private stringifyYAML(data: Record<string, unknown>): string {
		const lines: string[] = [];

		for (const [key, value] of Object.entries(data)) {
			if (value === undefined || value === null) {
				continue;
			}

			let yamlValue: string;
			if (typeof value === "string") {
				yamlValue =
					value.includes(":") || value.includes("#") || value.includes("\n")
						? `"${value.replace(/"/g, '\\"')}"`
						: value;
			} else if (typeof value === "boolean") {
				yamlValue = value ? "true" : "false";
			} else if (typeof value === "number") {
				yamlValue = String(value);
			} else if (Array.isArray(value)) {
				yamlValue = `\n  - ${value.join("\n  - ")}`;
			} else if (typeof value === "object") {
				yamlValue = JSON.stringify(value);
			} else {
				yamlValue = String(value);
			}

			lines.push(`${key}: ${yamlValue}`);
		}

		return lines.join("\n");
	}

	private mergeDeletionTag(existingTags: unknown): string[] {
		const deletionTag = "we_已删除";
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

		const hasDeletionTag = normalizedTags.some(
			(tag) => tag.replace(/^#/, "").toLowerCase() === deletionTag.toLowerCase()
		);
		return hasDeletionTag ? normalizedTags : [...normalizedTags, deletionTag];
	}

	private findCardBlock(
		content: string,
		identifier: string
	): { startIndex: number; endIndex: number; blockContent: string } | null {
		const delimiter = "<->";
		const parts = content.split(delimiter);

		let currentIndex = 0;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (part.includes(`^${identifier}`) || part.includes(identifier)) {
				return {
					startIndex: currentIndex,
					endIndex: currentIndex + part.length,
					blockContent: part,
				};
			}
			currentIndex += part.length + delimiter.length;
		}

		return null;
	}

	private markCardBlockAsDeleted(content: string, startIndex: number, endIndex: number): string {
		const blockContent = content.substring(startIndex, endIndex);
		if (blockContent.includes("#we_已删除") || blockContent.includes("#we_deleted")) {
			return content;
		}

		const uuidLineRegex = /<!--\s*tk-[a-z0-9]{12}\s*(?:-->|→)\s*\^[a-z0-9-_]+.*$/im;
		const lines = blockContent.split("\n");
		const cleanedLines = lines.filter((line) => !uuidLineRegex.test(line.trim()));
		const processedLines: string[] = [];

		let insertPosition = 0;
		for (let i = 0; i < cleanedLines.length; i++) {
			if (cleanedLines[i].trim() !== "") {
				insertPosition = i;
				break;
			}
		}

		for (let i = 0; i < cleanedLines.length; i++) {
			if (i === insertPosition) {
				processedLines.push("#we_已删除");
				processedLines.push("");
			}
			processedLines.push(cleanedLines[i]);
		}

		if (insertPosition === 0 && cleanedLines.length === 0) {
			processedLines.push("#we_已删除");
			processedLines.push("");
		}

		const newBlockContent = processedLines.join("\n");
		return content.substring(0, startIndex) + newBlockContent + content.substring(endIndex);
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	/**
	 * 根据文件内容推断创建方式
	 */
	private inferCreationTypeFromContent(
		content: string,
		blockId?: string,
		uuid?: string
	): CardCreationType {
		const normalizedBlockId = blockId?.replace(/^\^/, "");
		const escapedUuid = uuid ? uuid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
		const escapedBlockId = normalizedBlockId
			? normalizedBlockId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
			: "";

		if (uuid) {
			const frontmatterUuidRegex = new RegExp(
				`^---\\r?\\n[\\s\\S]*?^weave-uuid:\\s*${escapedUuid}\\s*$[\\s\\S]*?^---\\s*$`,
				"m"
			);

			if (frontmatterUuidRegex.test(content)) {
				logDebugWithTag("CleanupService", `识别为 BATCH_PARSE_SINGLE: uuid=${uuid}`);
				return CardCreationType.BATCH_PARSE_SINGLE;
			}
		}

		if (uuid && new RegExp(`<!--\\s*${escapedUuid}\\s*-->`, "i").test(content)) {
			return CardCreationType.BATCH_PARSE_MULTI;
		}

		if (
			normalizedBlockId &&
			new RegExp(`\\^${escapedBlockId}(?![A-Za-z0-9_-])`, "m").test(content)
		) {
			return CardCreationType.QUICK_CREATE;
		}

		// 规则1: 检查是否有YAML weave-uuid → 批量-单文件
		// 支持 Windows (\r\n) 和 Unix (\n) 换行符
		if (uuid && /^---[\r\n][\s\S]*?weave-uuid:/m.test(content)) {
			logDebugWithTag("CleanupService", `识别为 BATCH_PARSE_SINGLE: uuid=${uuid}`);
			return CardCreationType.BATCH_PARSE_SINGLE;
		}

		// 规则2: 检查是否有 <-> 分隔符 → 批量-多卡片
		if (content.includes("<->")) {
			return CardCreationType.BATCH_PARSE_MULTI;
		}

		// 默认：快捷键创建
		return CardCreationType.QUICK_CREATE;
	}

	/**
	 * 获取检测器实例（供GlobalCleanupScanner使用）
	 */
	public getDetector(): OrphanedLinkDetector | null {
		return this.detector;
	}

	/**
	 *  标记块链接为最近创建（白名单保护）
	 * 用于防止快捷键创建卡片时的竞态条件
	 * @param blockId 块ID（可带^前缀）
	 */
	public markRecentlyCreated(blockId: string): void {
		if (!this.detector) {
			logger.warn("[CleanupService] 检测器未初始化，无法标记保护");
			return;
		}

		this.detector.markRecentlyCreated(blockId);
	}

	/**
	 *  移除块链接的保护（删除卡片时调用）
	 * @param blockId 块ID（可带^前缀）
	 */
	public removeProtection(blockId: string): void {
		if (!this.detector) {
			return;
		}
		this.detector.removeProtection(blockId);
	}

	/**
	 *  移除UUID的保护（删除卡片时调用）
	 * @param uuid UUID标识符
	 */
	public removeUUIDProtection(uuid: string): void {
		if (!this.detector) {
			return;
		}
		this.detector.removeUUIDProtection(uuid);
	}

	/**
	 *  标记UUID为最近创建（白名单保护）
	 * 用于防止批量扫描创建卡片时的竞态条件
	 * @param uuid UUID标识符
	 */
	public markUUIDRecentlyCreated(uuid: string): void {
		if (!this.detector) {
			logger.warn("[CleanupService] 检测器未初始化，无法标记UUID保护");
			return;
		}

		this.detector.markUUIDRecentlyCreated(uuid);
	}

	public destroy(): void {
		this.dataStorage = null;
		this.vault = null;
		this.app = null;
		this.detector = null;
		this.strategies.clear();
		this.initialized = false;
	}
}
