import { logger } from "../../utils/logger";
/**
 * 正则表达式卡片解析器
 * 职责：使用自定义正则表达式解析"单文件多卡片"的场景
 *
 * 功能：
 * 1. 支持分隔符模式（简单易用）
 * 2. 支持完整模式（灵活强大）
 * 3. 支持内联 UUID 或 frontmatter UUID
 * 4. 标签提取和排除标签判断
 *
 * @author Weave Team
 * @date 2025-11-03
 */

import { App, TFile } from "obsidian";
import { CardType } from "../../data/types";
import type WeavePlugin from "../../main";
import type { ParsedCard, RegexParsingConfig } from "../../types/newCardParsingTypes";
import { logDebugWithTag } from "../../utils/logger";
import type { CardWithPosition } from "../../utils/simplifiedParser/CardPositionTracker";
import { generateCardUUID } from "../identifier/WeaveIDGenerator";
import { FrontmatterManager } from "./FrontmatterManager";

/**
 * 正则解析结果
 */
export interface RegexParseResult {
	success: boolean;
	cards: ParsedCard[];
	errors: string[];
	skippedCount: number;
	positions?: CardWithPosition[]; // 卡片位置信息，用于 UUID 插入
	originalContent?: string; // 原始文件内容，用于 UUID 插入
}

/** 设置页「测试解析」预览的单卡摘要 */
export interface RegexPresetPreviewCard {
	index: number;
	front: string;
	back: string;
	tags: string[];
}

/** 设置页 dry-run 解析结果（不写库、不生成 UUID） */
export interface RegexPresetPreviewResult {
	success: boolean;
	cards: RegexPresetPreviewCard[];
	errors: string[];
	skippedCount: number;
}

const ZERO_MATCH_ERROR =
	"未匹配到任何卡片，请检查文档格式是否与模板一致（Q/A 正则需 Q: 与 A:；分隔符模式需 <-> 与 ---div---）";

function buildZeroMatchError(matchedCount: number, skippedCount: number): string {
	if (matchedCount === 0) {
		return ZERO_MATCH_ERROR;
	}
	if (skippedCount > 0 && matchedCount === skippedCount) {
		return `匹配到 ${matchedCount} 张卡片，但均被排除标签过滤（请检查 excludeTags 配置）`;
	}
	return "未解析出任何卡片";
}

/**
 * 卡片匹配结果（中间数据）
 */
interface CardMatch {
	front: string;
	back: string;
	tags: string[];
	uuid?: string;
	startIndex: number;
	endIndex: number;
}

/**
 * 正则表达式卡片解析器
 */
export class RegexCardParser {
	private frontmatterManager: FrontmatterManager;

	constructor(
		private app: App,
		private plugin?: WeavePlugin
	) {
		this.frontmatterManager = new FrontmatterManager(app);
	}

	private getConfiguredExcludeTags(): string[] {
		const configured = this.plugin?.settings?.simplifiedParsing?.batchParsing?.excludeTags;
		if (!Array.isArray(configured)) {
			return [];
		}
		return configured.filter((tag): tag is string => typeof tag === "string");
	}

	/**
	 * 解析文件（主入口）
	 * @param file Obsidian 文件对象
	 * @param config 正则解析配置
	 * @param targetDeckId 目标牌组 ID
	 * @returns 解析结果
	 */
	async parseFile(
		file: TFile,
		config: RegexParsingConfig,
		targetDeckId: string
	): Promise<RegexParseResult> {
		const result: RegexParseResult = {
			success: true,
			cards: [],
			errors: [],
			skippedCount: 0,
			positions: [],
			originalContent: undefined,
		};

		try {
			// 1. 读取文件内容
			const content = await this.app.vault.read(file);
			result.originalContent = content; // 保存原始内容

			// 2. 提取 frontmatter UUID（如果配置为 frontmatter）
			let frontmatterUUID: string | undefined;
			if (config.uuidLocation === "frontmatter") {
				frontmatterUUID = (await this.frontmatterManager.getUUID(file)) || undefined;
			}

			// 3. 根据模式解析卡片
			let cardMatches: CardMatch[] = [];

			if (config.mode === "separator" && config.separatorMode) {
				cardMatches = this.parseBySeparator(content, config);
			} else if (config.mode === "pattern" && config.patternMode) {
				cardMatches = this.parseByPattern(content, config);
			} else {
				result.success = false;
				result.errors.push("无效的解析配置：缺少 separatorMode 或 patternMode");
				return result;
			}

			const matchedCount = cardMatches.length;

			// 4. 处理排除标签（系统标签 + 用户配置）
			const excludeTags = [
				"#we_已删除",
				"#we_deleted", // 系统保留标签（插件删除卡片时自动添加，使用 we_ 前缀避免冲突）
				...this.getConfiguredExcludeTags(),
			];

			const validMatches = cardMatches.filter((_match) => {
				const shouldSkip = this.shouldSkipByTags(_match.tags, excludeTags);
				if (shouldSkip) {
					result.skippedCount++;
				}
				return !shouldSkip;
			});

			// 5. 转换为 ParsedCard 并构建位置信息
			const positions: CardWithPosition[] = [];
			const lines = content.split("\n");

			// 辅助函数：将字符索引转换为行号
			const indexToLine = (index: number): number => {
				let currentIndex = 0;
				for (let lineNum = 0; lineNum < lines.length; lineNum++) {
					const lineLength = lines[lineNum].length + 1; // +1 for \n
					if (currentIndex + lineLength > index) {
						return lineNum;
					}
					currentIndex += lineLength;
				}
				return lines.length - 1;
			};

			for (let i = 0; i < validMatches.length; i++) {
				const match = validMatches[i];

				// 确定 UUID
				let cardUUID = match.uuid;
				if (!cardUUID) {
					if (
						config.uuidLocation === "frontmatter" &&
						frontmatterUUID &&
						validMatches.length === 1
					) {
						// 单卡片文件可以使用 frontmatter UUID
						cardUUID = frontmatterUUID;
					} else if (config.autoAddUUID) {
						// 自动生成新 UUID
						cardUUID = generateCardUUID();
					}
				}

				const parsedCard: ParsedCard = {
					type: CardType.Basic, // 正则解析默认为问答类型
					content: match.back.trim()
						? `${match.front.trim()}\n---div---\n${match.back.trim()}`
						: match.front.trim(),
					tags: match.tags,
					//  Content-Only: 不再生成 fields
					metadata: {
						sourceFile: file.path,
						sourceBlock: undefined,
						targetDeckId,
						uuid: cardUUID,
						isNewCard: !cardUUID,
						parseMode: "regex",
						regexConfig: config.name,
						cardIndex: i,
					},
				};

				result.cards.push(parsedCard);

				// 构建位置信息
				const startLine = indexToLine(match.startIndex);
				const endLine = indexToLine(match.endIndex);
				const startOffset = match.startIndex;
				const endOffset = match.endIndex;

				// 提取原始内容（用于UUID检测）
				const rawContent = content.substring(match.startIndex, match.endIndex);

				positions.push({
					content: `${match.front}\n---div---\n${match.back}`,
					startLine,
					endLine,
					startOffset,
					endOffset,
					rawContent,
					index: i,
				});
			}

			result.positions = positions;

			if (result.cards.length === 0) {
				result.success = false;
				result.errors.push(buildZeroMatchError(matchedCount, result.skippedCount));
			}

			logDebugWithTag(
				"RegexCardParser",
				`成功解析 ${result.cards.length} 张卡片 (跳过 ${result.skippedCount})`
			);
		} catch (error) {
			result.success = false;
			result.errors.push(error instanceof Error ? error.message : String(error));
			logger.error("[RegexCardParser] 解析失败:", error);
		}

		return result;
	}

	/**
	 * 对示例文本做 dry-run 解析（设置页测试用，不读写 Vault）
	 */
	parseContentPreview(content: string, config: RegexParsingConfig): RegexPresetPreviewResult {
		const result: RegexPresetPreviewResult = {
			success: true,
			cards: [],
			errors: [],
			skippedCount: 0,
		};

		if (!content.trim()) {
			result.success = false;
			result.errors.push("示例内容为空");
			return result;
		}

		try {
			let cardMatches: CardMatch[] = [];

			if (config.mode === "separator" && config.separatorMode) {
				cardMatches = this.parseBySeparator(content, config);
			} else if (config.mode === "pattern" && config.patternMode) {
				cardMatches = this.parseByPattern(content, config);
			} else {
				result.success = false;
				result.errors.push("无效的解析配置：缺少 separatorMode 或 patternMode");
				return result;
			}

			const matchedCount = cardMatches.length;

			const excludeTags = [
				"#we_已删除",
				"#we_deleted",
				...(config.excludeTags || []),
				...this.getConfiguredExcludeTags(),
			];

			const validMatches = cardMatches.filter((match) => {
				const shouldSkip = this.shouldSkipByTags(match.tags, excludeTags);
				if (shouldSkip) {
					result.skippedCount++;
				}
				return !shouldSkip;
			});

			result.cards = validMatches.map((match, index) => ({
				index: index + 1,
				front: match.front.trim(),
				back: match.back.trim(),
				tags: match.tags,
			}));

			if (result.cards.length === 0) {
				result.success = false;
				result.errors.push(buildZeroMatchError(matchedCount, result.skippedCount));
			}
		} catch (error) {
			result.success = false;
			result.errors.push(error instanceof Error ? error.message : String(error));
		}

		return result;
	}

	/**
	 * 分隔符模式解析
	 * @param content 文件内容
	 * @param config 配置
	 * @returns 卡片匹配结果数组
	 */
	private parseBySeparator(content: string, config: RegexParsingConfig): CardMatch[] {
		const cardMatches: CardMatch[] = [];

		if (!config.separatorMode) {
			return cardMatches;
		}

		try {
			const { cardSeparator, frontBackSeparator, multiline } = config.separatorMode;

			// 构造卡片分隔正则
			const flags = multiline ? "gm" : "g";
			const cardRegex = new RegExp(cardSeparator, flags);

			// 使用 exec 方法获取匹配位置，而不是 split
			let match;
			const delimiterMatches: Array<{ index: number; length: number }> = [];

			// 找到所有分隔符位置
			while ((match = cardRegex.exec(content)) !== null) {
				delimiterMatches.push({
					index: match.index,
					length: match[0].length,
				});
			}

			// 根据分隔符位置分割卡片块
			for (let i = 0; i < delimiterMatches.length - 1; i++) {
				const startDelim = delimiterMatches[i];
				const endDelim = delimiterMatches[i + 1];

				// 提取卡片内容（不包括分隔符）
				const startIndex = startDelim.index + startDelim.length;
				const endIndex = endDelim.index;
				const block = content.substring(startIndex, endIndex).trim();

				if (block) {
					const match = this.parseCardBlock(block, frontBackSeparator, config);
					if (match) {
						// 更新真实的位置信息
						match.startIndex = startIndex;
						match.endIndex = endIndex;
						cardMatches.push(match);
					}
				}
			}

			// 处理最后一个分隔符之后的内容（如果有）
			if (delimiterMatches.length > 0) {
				const lastDelim = delimiterMatches[delimiterMatches.length - 1];
				const startIndex = lastDelim.index + lastDelim.length;
				const endIndex = content.length;
				const block = content.substring(startIndex, endIndex).trim();

				if (block) {
					const match = this.parseCardBlock(block, frontBackSeparator, config);
					if (match) {
						match.startIndex = startIndex;
						match.endIndex = endIndex;
						cardMatches.push(match);
					}
				}
			}
		} catch (error) {
			logger.error("[RegexCardParser] 分隔符解析失败:", error);
		}

		return cardMatches;
	}

	/**
	 * 正则模式解析（简化版）
	 * 直接使用正则表达式在全文中匹配所有卡片，不需要先划分范围
	 * @param content 文件内容
	 * @param config 配置
	 * @returns 卡片匹配结果数组
	 */
	private parseByPattern(content: string, config: RegexParsingConfig): CardMatch[] {
		const cardMatches: CardMatch[] = [];

		if (!config.patternMode) {
			return cardMatches;
		}

		try {
			const { cardPattern, flags, captureGroups } = config.patternMode;

			//  构造正则表达式
			const regex = new RegExp(cardPattern, flags);

			let match;
			//  一步到位：直接在全文中匹配所有卡片
			while ((match = regex.exec(content)) !== null) {
				//  通过捕获组提取内容
				const front = match[captureGroups.front] || "";
				const back = match[captureGroups.back] || "";
				const tagsStr = captureGroups.tags !== undefined ? match[captureGroups.tags] : undefined;

				// 提取标签
				const tags = tagsStr ? this.extractTagsFromString(tagsStr) : [];

				// 提取 UUID（如果配置为 inline）
				let uuid: string | undefined;
				if (config.uuidLocation === "inline" && config.uuidPattern) {
					uuid = this.extractInlineUUID(match[0], config.uuidPattern);
				}

				cardMatches.push({
					front: front.trim(),
					back: back.trim(),
					tags,
					uuid,
					startIndex: match.index,
					endIndex: match.index + match[0].length,
				});
			}

			logDebugWithTag("RegexParser", `正则模式解析完成，匹配到 ${cardMatches.length} 张卡片`);
		} catch (error) {
			logger.error("[RegexCardParser] 正则模式解析失败:", error);
		}

		return cardMatches;
	}

	/**
	 * 解析单个卡片块
	 * @param block 卡片块内容
	 * @param frontBackSeparator 正反面分隔符
	 * @param config 配置
	 * @returns 卡片匹配结果
	 */
	private parseCardBlock(
		block: string,
		frontBackSeparator: string | undefined,
		config: RegexParsingConfig
	): CardMatch | null {
		try {
			// 先提取元数据，再清理内容
			// 提取标签
			const tags = this.extractTagsFromString(block);

			// 提取 UUID（如果配置为 inline）
			let uuid: string | undefined;
			if (config.uuidLocation === "inline" && config.uuidPattern) {
				uuid = this.extractInlineUUID(block, config.uuidPattern);
			}

			// 清理 UUID 标识符和块链接后再分割内容
			const cleanedBlock = this.cleanCardContent(block);

			let front = "";
			let back = "";

			// 如果有正反面分隔符，进行分割
			if (frontBackSeparator) {
				const parts = cleanedBlock.split(new RegExp(frontBackSeparator, "m"));
				if (parts.length >= 2) {
					front = parts[0].trim();
					back = parts.slice(1).join("\n").trim();
				} else {
					// 没有找到分隔符，整个内容作为正面
					front = cleanedBlock.trim();
				}
			} else if (config.separatorMode?.firstLineAsFront) {
				const split = this.splitFirstLineAndRest(cleanedBlock);
				front = split.front;
				back = split.back;
			} else {
				// 没有配置分隔符，整个内容作为正面
				front = cleanedBlock.trim();
			}

			//  注意：startIndex 和 endIndex 在这里是相对于 block 的，需要在调用处更新为全局位置
			return {
				front,
				back,
				tags,
				uuid,
				startIndex: 0, // 临时值，会在调用处更新
				endIndex: block.length, // 临时值，会在调用处更新
			};
		} catch (error) {
			logger.error("[RegexCardParser] 解析卡片块失败:", error);
			return null;
		}
	}

	/**
	 * 首行作正面、其余作背面（标题分隔等格式）
	 */
	private splitFirstLineAndRest(text: string): { front: string; back: string } {
		const normalized = text.replace(/\r\n/g, "\n");
		const firstBreak = normalized.indexOf("\n");
		if (firstBreak < 0) {
			return { front: normalized.trim(), back: "" };
		}
		return {
			front: normalized.slice(0, firstBreak).trim(),
			back: normalized.slice(firstBreak + 1).trim(),
		};
	}

	/**
	 * 从字符串中提取标签
	 * @param text 文本内容
	 * @returns 标签数组
	 */
	private extractTagsFromString(text: string): string[] {
		const tags = new Set<string>();
		const tagRegex = /#([^\s#]+)/g;

		let match;
		while ((match = tagRegex.exec(text)) !== null) {
			tags.add(match[1]);
		}

		return Array.from(tags);
	}

	/**
	 * 提取内联 UUID
	 * @param text 文本内容
	 * @param uuidPattern UUID 匹配正则
	 * @returns UUID 或 undefined
	 */
	private extractInlineUUID(text: string, uuidPattern: string): string | undefined {
		try {
			const regex = new RegExp(uuidPattern);
			const match = regex.exec(text);
			return match?.[1] ? match[1] : undefined;
		} catch (error) {
			logger.error("[RegexCardParser] 提取内联 UUID 失败:", error);
			return undefined;
		}
	}

	/**
	 * 根据标签判断是否跳过
	 * @param cardTags 卡片标签（不包括#前缀）
	 * @param excludeTags 排除标签（可能包括#前缀）
	 * @returns 是否跳过
	 */
	private shouldSkipByTags(cardTags: string[], excludeTags: string[]): boolean {
		//  安全检查：处理空值情况
		if (!excludeTags || excludeTags.length === 0) {
			return false;
		}

		if (!cardTags || cardTags.length === 0) {
			return false;
		}

		// 标准化 excludeTags 格式，移除 # 前缀
		const normalizedExcludeTags = excludeTags.map((tag) =>
			tag.startsWith("#") ? tag.substring(1) : tag
		);

		// 标签比较（不区分大小写）
		return normalizedExcludeTags.some((excludeTag) =>
			cardTags.some((cardTag) => cardTag.toLowerCase() === excludeTag.toLowerCase())
		);
	}

	/**
	 * 批量解析多个文件
	 * @param files 文件数组
	 * @param config 正则解析配置
	 * @param targetDeckId 目标牌组 ID
	 * @returns 解析结果数组
	 */
	async parseFiles(
		files: TFile[],
		config: RegexParsingConfig,
		targetDeckId: string
	): Promise<RegexParseResult[]> {
		const results: RegexParseResult[] = [];

		for (const file of files) {
			const result = await this.parseFile(file, config, targetDeckId);
			results.push(result);
		}

		return results;
	}

	/**
	 * 清理卡片内容，移除UUID标识符和块链接
	 * @param content 原始卡片内容
	 * @returns 清理后的内容
	 */
	private cleanCardContent(content: string): string {
		let cleanedContent = content;

		//  优先处理组合格式：UUID标识符 + 块链接在同一行
		// 匹配格式如：<!-- tk-5vmqmfjfxthm --> ^we-3j2hjk
		cleanedContent = cleanedContent.replace(
			/<!--\s*(?:tk-[23456789abcdefghjkmnpqrstuvwxyz]{12}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\s*-->\s*\^[a-zA-Z0-9-]+\s*$/gm,
			""
		);

		//  单独处理剩余的UUID注释（新格式和旧格式）
		// 新格式：<!-- tk-xxxxxxxxxxxx -->
		cleanedContent = cleanedContent.replace(
			/<!--\s*tk-[23456789abcdefghjkmnpqrstuvwxyz]{12}\s*-->/gi,
			""
		);

		// 旧格式UUID：<!-- xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx -->
		cleanedContent = cleanedContent.replace(
			/<!--\s*[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\s*-->/gi,
			""
		);

		//  单独处理剩余的Obsidian块链接：^abc123
		// 匹配行尾的块链接，包括前面可能的空格
		cleanedContent = cleanedContent.replace(/\s*\^[a-zA-Z0-9-]+\s*$/gm, "");

		//  移除空行和多余的空白
		// 替换多个连续换行为最多两个换行
		cleanedContent = cleanedContent.replace(/\n{3,}/g, "\n\n");

		// 移除首尾空白
		cleanedContent = cleanedContent.trim();

		return cleanedContent;
	}
}
