import { logger } from "../../utils/logger";
/**
 * 简化卡片解析器
 * 完全替代旧的三位一体模板系统
 */

import { CardType } from "../../data/types";
import { BatchDocumentWriter } from "../../services/BatchDocumentWriter";
import {
	CardDeletionMarker,
	DEFAULT_DELETION_MARKER_CONFIG,
} from "../../services/batch-parsing/CardDeletionMarker";
import type {
	BatchParseConfig,
	ICardParser,
	ParseConfig,
	ParseError,
	ParseResult,
	ParseStats,
	ParseTemplate,
	ParsedCard,
	SimplifiedParsingSettings,
	SingleCardParseConfig,
	SymbolValidationResult,
	TemplateScenario,
	TemplateValidationResult,
} from "../../types/newCardParsingTypes";
import { getOfficialTemplateById } from "../../constants/official-templates";
import { LRUCache } from "../cache/LRUCache";
import { generateBlockId } from "../helpers";
import {
	MultilingualPatternRecognizer,
	createMultilingualRecognizer,
} from "../multilingual-parser-support";
import { getAnkiClozeMatches, getConfiguredClozeMatches, hasAnyClozeSyntax } from "../cloze-syntax";
import { getGlobalPerformanceMonitor } from "../parsing-performance-monitor";
import { TagExtractor } from "../tag-extractor";
import { CardPositionTracker, CardWithPosition } from "./CardPositionTracker";
import { EnhancedDelimiterDetector } from "./EnhancedDelimiterDetector";

export class SimplifiedCardParser implements ICardParser {
	private settings: SimplifiedParsingSettings;
	private parseCache: LRUCache<string, ParsedCard>;
	private templateCache: LRUCache<string, ParseTemplate>;
	private multilingualRecognizer: MultilingualPatternRecognizer;
	private documentWriter?: BatchDocumentWriter;
	private deletionMarker?: CardDeletionMarker; //  删除标记器
	private lastCardsPosition?: CardWithPosition[]; // 存储最近一次解析的卡片位置信息
	private readonly MAX_CACHE_SIZE = 1000;
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟
	private cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor(settings: SimplifiedParsingSettings, app?: any) {
		this.settings = settings;

		// 初始化 LRU 缓存
		this.parseCache = new LRUCache<string, ParsedCard>({
			maxSize: this.MAX_CACHE_SIZE,
			ttl: this.CACHE_TTL,
			onEvict: (_key, _value) => {
				// 缓存项被淘汰时的回调（可选）
				// logger.debug(`Parse cache evicted: ${key}`);
			},
		});

		this.templateCache = new LRUCache<string, ParseTemplate>({
			maxSize: 100, // 模板数量相对较少
			ttl: 0, // 模板不过期
		});

		// 初始化文档写入器
		if (app) {
			this.documentWriter = new BatchDocumentWriter(app);
			//  初始化删除标记器
			this.deletionMarker = new CardDeletionMarker(DEFAULT_DELETION_MARKER_CONFIG, app.vault);
		}

		// 初始化多语言识别器
		this.multilingualRecognizer = createMultilingualRecognizer({
			primaryLanguage: "auto",
			enableAutoDetection: true,
			supportedLanguages: ["zh", "en", "ja", "ko"],
		});

		// 定期清理过期缓存
		this.cacheCleanupInterval = setInterval(() => {
			this.parseCache.cleanup();
			this.templateCache.cleanup();
		}, this.CACHE_TTL);
	}

	/**
	 * 更新解析设置
	 * 用于运行时动态更新配置（例如用户在设置面板修改后）
	 */
	public updateSettings(newSettings: SimplifiedParsingSettings): void {
		this.settings = newSettings;
		this.parseCache.clear();
		this.templateCache.clear();
	}

	/**
	 * 缓存管理方法
	 */
	private generateCacheKey(content: string, config: ParseConfig): string {
		const contentHash = this.simpleHash(content);
		const configHash = this.simpleHash(JSON.stringify(config));
		return `${contentHash}-${configHash}`;
	}

	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // 转换为32位整数
		}
		return Math.abs(hash).toString(36);
	}

	/**
	 * 获取缓存统计信息
	 */
	getCacheStats(): {
		parse: ReturnType<LRUCache<string, ParsedCard>["getStats"]>;
		template: ReturnType<LRUCache<string, ParseTemplate>["getStats"]>;
	} {
		return {
			parse: this.parseCache.getStats(),
			template: this.templateCache.getStats(),
		};
	}

	/**
	 * 清空所有缓存
	 */
	clearCache(): void {
		this.parseCache.clear();
		this.templateCache.clear();
	}

	destroy(): void {
		if (this.cacheCleanupInterval) {
			clearInterval(this.cacheCleanupInterval);
			this.cacheCleanupInterval = null;
		}
		this.clearCache();
		this.lastCardsPosition = undefined;
	}

	/**
	 * 解析内容 - 主入口（带缓存优化）
	 */
	async parseContent(content: string, config: ParseConfig): Promise<ParseResult> {
		const startTime = Date.now();
		const result: ParseResult = {
			success: false,
			cards: [],
			errors: [],
			stats: {
				totalCards: 0,
				successfulCards: 0,
				failedCards: 0,
				cardTypes: { [CardType.Basic]: 0, [CardType.Multiple]: 0, [CardType.Cloze]: 0 } as Record<
					CardType,
					number
				>,
				templatesUsed: {},
				processingTime: 0,
			},
		};

		try {
			// 检查标签触发（批量解析场景下跳过，因为已有批量标记）
			if (config.scenario !== "batch" && !this.checkTagTrigger(content)) {
				result.errors.push({
					type: "validation",
					message: `内容不包含触发标签: ${this.settings.triggerTag}`,
				});
				return result;
			}

			// 根据场景选择解析方式
			if (config.scenario === "batch") {
				const batchResult = await this.parseBatchCards(content, config as BatchParseConfig);
				result.cards = batchResult.cards;
			} else {
				const card = await this.parseSingleCard(content, config as SingleCardParseConfig);
				if (card) {
					result.cards = [card];
				}
			}

			result.success = result.cards.length > 0;
			result.stats = this.calculateStats(result.cards, startTime);
		} catch (error) {
			result.errors.push({
				type: "syntax",
				message: error instanceof Error ? error.message : "解析过程中发生未知错误",
			});
		}

		return result;
	}

	/**
	 * 解析单张卡片（带缓存优化和性能监控）
	 */
	async parseSingleCard(
		content: string,
		config: SingleCardParseConfig
	): Promise<ParsedCard | null> {
		const startTime = Date.now();

		// 检查缓存
		const cacheKey = this.generateCacheKey(content, config);
		const cached = this.parseCache.get(cacheKey);
		if (cached) {
			const duration = Date.now() - startTime;
			getGlobalPerformanceMonitor().recordOperation(
				"parseSingleCard",
				duration,
				true,
				cached.metadata?.confidence,
				true
			);
			return { ...cached }; // 返回副本避免修改缓存
		}

		try {
			// 检查标签触发（批量解析场景下跳过，因为已有批量标记）
			if (config.scenario !== "batch" && !this.checkTagTrigger(content)) {
				return null;
			}

			// 清理内容
			const cleanContent = this.preprocessContent(content);

			// 检测卡片类型
			const cardType = this.detectCardType(cleanContent);

			// 解析卡片
			const card: ParsedCard = {
				type: cardType,
				content: cleanContent, //  直接使用清理后的内容
				tags: this.extractTags(cleanContent),
				metadata: {
					sourceContent: content,
					parseMethod: "symbol",
				},
			};

			// 应用模板解析（如果启用）
			if (this.settings.enableTemplateSystem && config.templateId) {
				const template = this.findTemplate(config.templateId, config.scenario);
				if (template) {
					const result = this.applyTemplate(cleanContent, template, card);
					if (result) {
						this.parseCache.set(cacheKey, result);
					}
					return result;
				}
			}

			// 使用符号解析
			const result = this.parseWithSymbols(cleanContent, card);
			if (result) {
				this.parseCache.set(cacheKey, result);
			}

			// 记录性能数据
			const duration = Date.now() - startTime;
			const success = result !== null;
			const confidence = result?.metadata?.confidence;
			getGlobalPerformanceMonitor().recordOperation(
				"parseSingleCard",
				duration,
				success,
				confidence,
				false
			);

			return result;
		} catch (error) {
			logger.error("单卡解析错误:", error);

			// 记录错误性能数据
			const duration = Date.now() - startTime;
			getGlobalPerformanceMonitor().recordOperation("parseSingleCard", duration, false, 0, false);

			return null;
		}
	}

	/**
	 * 解析批量卡片
	 * 返回卡片和位置信息，避免状态管理的并发问题
	 */
	async parseBatchCards(
		content: string,
		config: BatchParseConfig
	): Promise<{
		cards: ParsedCard[];
		positions: CardWithPosition[];
	}> {
		const cards: ParsedCard[] = [];

		try {
			//  新设计：直接使用整个文件内容，不再提取范围
			const batchContent = content;

			// 2. 分割卡片
			const cardContents = this.splitCards(batchContent);

			// 3. 解析每张卡片
			for (let i = 0; i < cardContents.length; i++) {
				const originalCardContent = cardContents[i];

				try {
					// 3.1 生成块ID（如果启用）
					let blockId: string | undefined;
					let contentToSave = originalCardContent;

					if (this.settings.batchParsing.autoCreateBlockLinks) {
						if (!this.hasExistingBlockId(originalCardContent)) {
							blockId = this.generateBlockId(i);
							contentToSave = this.appendBlockId(originalCardContent, blockId);
						}
					}

					// 3.2 解析卡片内容
					const card = await this.parseSingleCard(contentToSave, {
						...config,
						allowEmpty: false,
					});

					if (card) {
						// 3.3 设置卡片ID
						// card.id = `batch_${i + 1}`; // 已废弃：现在使用UUID

						// 3.4 设置源文件信息
						if (this.settings.batchParsing.autoSetSourceFile && config.sourceFile) {
							card.sourceFile = config.sourceFile;
						}

						// 3.5 设置块链接信息
						if (blockId) {
							card.sourceBlock = `^${blockId}`;

							// 存储到 metadata 供后续使用
							if (!card.metadata) {
								card.metadata = {};
							}
							card.metadata.blockId = blockId;
							card.metadata.originalCardContent = originalCardContent;
							card.metadata.contentWithBlockId = contentToSave;
						}

						cards.push(card);
					}

					// 3.6 进度回调
					if (config.progressCallback) {
						config.progressCallback(
							((i + 1) / cardContents.length) * 100,
							i + 1,
							cardContents.length
						);
					}

					// 3.7 检查最大卡片数限制
					if (config.maxCards && cards.length >= config.maxCards) {
						logger.debug(`达到最大卡片数限制: ${config.maxCards}`);
						break;
					}
				} catch (error) {
					if (!config.skipErrors) {
						throw error;
					}
					logger.warn(`跳过卡片 ${i + 1}:`, error);
				}
			}

			// 4. 批量写入块链接到源文档（如果启用且有块ID）
			if (
				this.settings.batchParsing.autoCreateBlockLinks &&
				config.sourceContent &&
				config.sourceFile &&
				this.documentWriter &&
				cards.some((c) => c.metadata?.blockId)
			) {
				logger.debug("开始批量写入块链接到源文档...");

				const updatedContent = await this.insertBlockLinksToContent(config.sourceContent, cards);

				if (updatedContent) {
					// 写入文件
					const writeResult = await this.documentWriter.writeContent(
						config.sourceFile,
						updatedContent
					);

					if (!writeResult.success) {
						logger.error("文档写入失败:", writeResult.error);
						// 不影响卡片创建，只是块链接未写入
					} else {
						logger.debug(`✅ 成功写入 ${writeResult.blocksInserted} 个块链接`);
					}

					// 同时通过回调返回更新后的内容（如果提供了回调）
					if (config.onContentUpdated) {
						await config.onContentUpdated(updatedContent);
					}
				}
			}
		} catch (error) {
			logger.error("批量解析错误:", error);
		}

		// 返回卡片和位置信息
		return {
			cards,
			positions: this.lastCardsPosition || [],
		};
	}

	/**
	 * 检查标签触发
	 */
	private checkTagTrigger(content: string): boolean {
		if (!this.settings.enableTagTrigger) {
			return true;
		}
		return content.includes(this.settings.triggerTag);
	}

	/**
	 * 预处理内容
	 */
	private preprocessContent(content: string): string {
		// 移除YAML frontmatter
		const yamlRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
		return content.replace(yamlRegex, "").trim();
	}

	/**
	 * 检测卡片类型
	 * 注意：不区分普通挖空和渐进式挖空，统一返回 'cloze'
	 * 渐进式挖空的检测和转换由 ProgressiveClozeGateway 统一处理
	 */
	private detectCardType(content: string): CardType {
		if (hasAnyClozeSyntax(content)) {
			return CardType.Cloze;
		}

		// 检测选择题 - 仅支持字母序 A./B./C./D. 格式
		// GFM 复选框 - [ ] / - [x] 不作为选择题识别（复选框是 Markdown 通用语法）
		const labeledOptions = content.match(/^[A-Z][\.\)．）、]\s*.+$/gim);
		if (labeledOptions && labeledOptions.length >= 2) {
			return CardType.Multiple;
		}

		// 默认问答题
		return CardType.Basic;
	}

	/**
	 * 提取标签（使用统一的TagExtractor工具）
	 */
	private extractTags(content: string): string[] {
		// 使用统一的 TagExtractor 工具，自动排除代码块
		return TagExtractor.extractTagsExcludingCode(content);
	}

	/**
	 * 使用符号解析
	 * 直接使用 content
	 */
	private parseWithSymbols(content: string, card: ParsedCard): ParsedCard {
		// 直接使用原始 content
		if (!card.content) {
			card.content = content;
		}

		return card;
	}

	/**
	 * 应用模板解析
	 */
	private applyTemplate(content: string, template: ParseTemplate, card: ParsedCard): ParsedCard {
		if (template.type === "single-field" && template.fields) {
			// 单字段解析
			const fields: Record<string, string> = {};

			for (const field of template.fields) {
				try {
					if (template.id === "official-cloze") {
						if (field.name === "Cloze") {
							const clozes = getConfiguredClozeMatches(content).map((match) => match.text);
							if (clozes.length > 0) {
								fields[field.name] = clozes.join("\n");
							} else if (field.required) {
								logger.warn(`必需字段 ${field.name} 未找到匹配`);
							}
							continue;
						}

						if (field.name === "ClozeAnki") {
							const ankiClozes = getAnkiClozeMatches(content).map((match) => match.text);
							if (ankiClozes.length > 0) {
								fields[field.name] = ankiClozes.join("\n");
							}
							continue;
						}
					}

					// 使用 field.pattern 而非 field.regex，尊重 isRegex 标志
					const pattern = field.isRegex ? field.pattern : this.escapeRegex(field.pattern);
					const regex = new RegExp(pattern, field.flags || "");
					const match = content.match(regex);

					if (match) {
						// 优先使用第1个分组，无分组时回退到完整匹配
						fields[field.name] = match[1] ?? match[0] ?? "";
					} else if (field.required) {
						logger.warn(`必需字段 ${field.name} 未找到匹配`);
					}
				} catch (error) {
					logger.error(`字段 ${field.name} 正则错误:`, error);
				}
			}

			//  字段别名映射（兼容旧字段名）
			fields.question ||= fields.Question;
			fields.options ||= fields.Options || fields.OptionsAlt;
			fields.correct_answer ||= fields.CorrectAnswer || fields.Answer;
			fields.explanation ||= fields.Explanation;
			fields.tags ||= fields.Tags;

			// 不再生成 fields
			// 模板解析结果已保存在 card.content 中
			// 需要时通过 Parser 动态解析
		}

		card.template = template.id;
		card.metadata!.parseMethod = "template";
		return card;
	}

	/**
	 * 分割卡片（使用位置跟踪）
	 */
	private splitCards(content: string): string[] {
		const { cardDelimiter } = this.settings.symbols;
		const excludeTags = this.settings.batchParsing.excludeTags || [];

		const tracker = new CardPositionTracker(cardDelimiter);
		const cardsWithPosition = tracker.splitCardsWithPosition(content);

		// 过滤卡片
		const filteredCardsWithPosition = cardsWithPosition.filter((_cardInfo) => {
			const card = _cardInfo.content;

			// 过滤空内容（支持共享分隔符时避免空卡片）
			if (!card || card.trim().length === 0) {
				return false;
			}

			// 检测是否为已删除卡片
			if (this.deletionMarker) {
				const deletionResult = this.deletionMarker.detectDeletionMarker(card);
				if (deletionResult.isDeleted) {
					return false;
				}
			}

			// 检测排除标签
			if (excludeTags.length > 0) {
				const cardTags = TagExtractor.extractTags(card);
				const excludeTagsLower = excludeTags.map((t) => t.toLowerCase());
				const matchedTags = cardTags.filter((tag) => excludeTagsLower.includes(tag.toLowerCase()));

				if (matchedTags.length > 0) {
					return false;
				}
			}

			return true;
		});

		// 保存位置信息供UUID插入使用
		this.lastCardsPosition = filteredCardsWithPosition;

		return filteredCardsWithPosition.map((cardInfo) => cardInfo.content);
	}

	/**
	 * 将块链接批量插入到内容中
	 * @param originalContent 原始文档内容
	 * @param cards 解析后的卡片列表
	 * @returns 更新后的文档内容，如果失败返回 null
	 */
	private async insertBlockLinksToContent(
		originalContent: string,
		cards: ParsedCard[]
	): Promise<string | null> {
		try {
			let updatedContent = originalContent;

			// 提取批量范围（添加空值检查）
			const { rangeStart, rangeEnd } = this.settings.symbols;

			// 如果未定义范围标记，返回null
			if (!rangeStart || !rangeEnd) {
				logger.warn("批量范围标记未配置");
				return null;
			}

			const startIndex = updatedContent.indexOf(rangeStart);
			const endIndex = updatedContent.indexOf(rangeEnd);

			if (startIndex === -1 || endIndex === -1) {
				logger.warn("无法定位批量范围标记");
				return null;
			}

			// 提取范围前、范围内、范围后的内容
			const beforeRange = updatedContent.substring(0, startIndex + rangeStart.length);
			const rangeContent = updatedContent.substring(startIndex + rangeStart.length, endIndex);
			const afterRange = updatedContent.substring(endIndex);

			// 逐个替换卡片内容，添加块ID
			let modifiedRangeContent = rangeContent;

			for (const card of cards) {
				if (!card.metadata?.blockId || !card.metadata?.originalCardContent) {
					continue;
				}

				const originalCardContent = card.metadata.originalCardContent;
				const contentWithBlockId = card.metadata.contentWithBlockId;

				// 查找并替换
				const cardIndex = modifiedRangeContent.indexOf(originalCardContent);
				if (cardIndex !== -1) {
					modifiedRangeContent =
						modifiedRangeContent.substring(0, cardIndex) +
						contentWithBlockId +
						modifiedRangeContent.substring(cardIndex + originalCardContent.length);

					logger.debug(`✅ 已插入块链接: ^${card.metadata.blockId}`);
				} else {
					logger.warn("⚠️ 无法定位卡片内容，跳过块ID插入");
				}
			}

			// 重新组合内容
			updatedContent = beforeRange + modifiedRangeContent + afterRange;

			return updatedContent;
		} catch (error) {
			logger.error("插入块链接失败:", error);
			return null;
		}
	}

	/**
	 * 查找模板
	 */
	private findTemplate(templateId: string, scenario: TemplateScenario): ParseTemplate | null {
		// 先检查缓存
		const cacheKey = `${templateId}-${scenario}`;
		const cached = this.templateCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		// 查找模板
		const officialTemplate = getOfficialTemplateById(templateId);
		const template =
			this.settings.templates.find((t) => t.id === templateId && t.scenarios.includes(scenario)) ||
			(officialTemplate && officialTemplate.scenarios.includes(scenario)
				? officialTemplate
				: null);

		// 缓存找到的模板
		if (template) {
			this.templateCache.set(cacheKey, template);
		}

		return template;
	}

	/**
	 * 清理内容
	 * 移除 UUID 标识符、块链接和标签，确保卡片内容干净
	 */
	private cleanContent(content: string): string {
		let cleanedContent = content;

		//  优先处理组合格式：UUID标识符 + 块链接在同一行
		// 匹配格式如：<!-- tk-5vmqmfjfxthm --> ^we-3j2hjk
		cleanedContent = cleanedContent.replace(
			/<!--\s*(?:tk-[23456789abcdefghjkmnpqrstuvwxyz]{12}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\s*-->\s*\^[a-zA-Z0-9\-]+\s*$/gm,
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
		cleanedContent = cleanedContent.replace(/\s*\^[a-zA-Z0-9\-]+\s*$/gm, "");

		// 移除标签
		cleanedContent = cleanedContent.replace(/#[\w\u4e00-\u9fa5]+/g, "");

		//  移除多余的空白和空行
		// 替换多个连续换行为最多两个换行
		cleanedContent = cleanedContent.replace(/\n{3,}/g, "\n\n");

		return cleanedContent.trim();
	}

	/**
	 * 转义正则表达式特殊字符
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	/**
	 * 生成唯一块ID
	 *
	 *  统一使用核心生成器，确保全局格式一致
	 * 格式：we-{6位随机}
	 *
	 * @param index 卡片索引（保留用于向后兼容，实际未使用）
	 * @returns 块ID（不含^前缀）
	 */
	private generateBlockId(_index: number): string {
		// 统一使用核心生成器，确保格式一致性
		return generateBlockId();
	}

	/**
	 * 检查内容中是否已存在块ID
	 * @param content 内容
	 * @returns 是否存在块ID
	 */
	private hasExistingBlockId(content: string): boolean {
		return /\^[\w-]+\s*$/.test(content.trim());
	}

	/**
	 * 在内容末尾添加块ID
	 *
	 * 保留原始排版，不移除用户的空白字符
	 *
	 * @param content 原始内容
	 * @param blockId 块ID（不含^）
	 * @returns 包含块ID的内容
	 */
	private appendBlockId(content: string, blockId: string): string {
		// 只验证是否已有BlockID，不修改内容
		if (this.hasExistingBlockId(content)) {
			return content;
		}

		//  保留原始内容，在末尾添加BlockID
		// 确保BlockID前有适当的换行（如果内容末尾没有换行符）
		const needsNewline = !content.endsWith("\n");
		const blockIdLine = `^${blockId}`;

		if (needsNewline) {
			return `${content}\n\n${blockIdLine}`;
		} else {
			// 内容已有换行，只需添加一个空行和BlockID
			return `${content}\n${blockIdLine}`;
		}
	}

	/**
	 * 计算统计信息
	 */
	private calculateStats(cards: ParsedCard[], startTime: number): ParseStats {
		const stats: ParseStats = {
			totalCards: cards.length,
			successfulCards: cards.length,
			failedCards: 0,
			cardTypes: { [CardType.Basic]: 0, [CardType.Multiple]: 0, [CardType.Cloze]: 0 } as Record<
				CardType,
				number
			>,
			templatesUsed: {},
			processingTime: Date.now() - startTime,
		};

		cards.forEach((_card) => {
			stats.cardTypes[_card.type]++;
			if (_card.template) {
				stats.templatesUsed[_card.template] = (stats.templatesUsed[_card.template] || 0) + 1;
			}
		});

		return stats;
	}

	/**
	 * 验证模板
	 */
	validateTemplate(template: ParseTemplate): TemplateValidationResult {
		const result: TemplateValidationResult = {
			isValid: true,
			errors: [],
			warnings: [],
			suggestions: [],
		};

		// 基础验证
		if (!template.name.trim()) {
			result.errors.push("模板名称不能为空");
		}

		if (!template.scenarios.length) {
			result.errors.push("至少需要选择一个应用场景");
		}

		// 类型特定验证
		if (template.type === "single-field") {
			if (!template.fields || template.fields.length === 0) {
				result.errors.push("单字段模板至少需要一个字段");
			} else {
				template.fields.forEach((field, index) => {
					if (!field.name.trim()) {
						result.errors.push(`字段 ${index + 1} 名称不能为空`);
					}
					if (!field.pattern.trim()) {
						result.errors.push(`字段 ${index + 1} 正则表达式不能为空`);
					} else {
						try {
							new RegExp(field.pattern, field.flags);
						} catch (error) {
							result.errors.push(`字段 ${index + 1} 正则表达式语法错误: ${error}`);
						}
					}
				});
			}
		}

		result.isValid = result.errors.length === 0;
		return result;
	}

	/**
	 * 验证符号配置
	 */
	validateSymbols(symbols: SimplifiedParsingSettings["symbols"]): SymbolValidationResult {
		const result: SymbolValidationResult = {
			isValid: true,
			conflicts: [],
			suggestions: [],
		};

		const symbolValues = Object.values(symbols);
		const duplicates = symbolValues.filter((value, index) => symbolValues.indexOf(value) !== index);

		if (duplicates.length > 0) {
			result.conflicts.push(`重复的符号: ${duplicates.join(", ")}`);
		}

		// 检查空值
		Object.entries(symbols).forEach(([key, value]) => {
			if (!value.trim()) {
				result.conflicts.push(`${key} 不能为空`);
			}
		});

		result.isValid = result.conflicts.length === 0;
		return result;
	}
}
