import { logger } from "../../utils/logger";
/**
 * AI生成卡片转换为Weave标准卡片格式
 */

import type { FSRS } from "../../algorithms/fsrs";
import type { Card } from "../../data/types";
import { CardType } from "../../data/types";
import type { CardType as ParserCardType } from "../../parsers/MarkdownFieldsConverter";
import { ChoiceCardParser } from "../../parsers/card-type-parsers/ChoiceCardParser";
import { ClozeCardParser } from "../../parsers/card-type-parsers/ClozeCardParser";
import { QACardParser } from "../../parsers/card-type-parsers/QACardParser";
import type { CardConversionResult, GeneratedCard, GenerationConfig } from "../../types/ai-types";
import { setCardProperties } from "../../utils/yaml-utils";
import { generateCardUUID } from "../identifier/WeaveIDGenerator";

export class CardConverter {
	/**
	 * 将AI生成的卡片转换为Weave Card格式
	 */
	static convert(
		generatedCard: GeneratedCard,
		deckId: string,
		sourceFile?: string,
		templates?: GenerationConfig["templates"],
		fsrs?: FSRS,
		deckName?: string // 用于写入 we_decks
	): CardConversionResult {
		try {
			const now = new Date().toISOString();
			const uuid = generateCardUUID();
			const normalizedTags = Array.from(
				new Set((generatedCard.tags || []).map((tag) => String(tag || "").trim().replace(/^#+/, "")).filter(Boolean))
			);

			let content = generatedCard.content || "";

			// 在 content 中写入 YAML 元数据（we_source / we_decks / tags）
			const yamlMeta: Parameters<typeof setCardProperties>[1] = {};
			if (sourceFile) {
				const name = sourceFile.replace(/\.md$/, "");
				yamlMeta.we_source = `![[${name}]]`;
			}
			if (deckName) {
				yamlMeta.we_decks = [deckName];
			}
			if (normalizedTags.length > 0) {
				yamlMeta.tags = normalizedTags;
			}
			if (Object.keys(yamlMeta).length > 0) {
				content = setCardProperties(content, yamlMeta);
			}

			// 根据题型确定使用的模板ID（统一使用基础模板）
			const templateId = this.getTemplateId(generatedCard.type, templates);

			// 使用新的解析器解析Markdown内容为fields
			const parseResult = this.parseCardContent(content, generatedCard.type);

			// 如果解析失败，使用降级方案
			let fields: Record<string, string>;
			let parsedMetadata: import("../../types/metadata-types").CardMetadata | undefined;

			if (parseResult.success) {
				fields = parseResult.fields;
				parsedMetadata = parseResult.metadata;
			} else {
				// 降级：使用简单的字段映射
				logger.warn("[CardConverter] 解析失败，使用降级方案:", parseResult.error);
				fields = this.mapFieldsFromContent(content, generatedCard.type);
				parsedMetadata = undefined;
			}

			const card: Card = {
				// 基础标识
				uuid: uuid,
				deckId,
				templateId: templateId,
				type: this.mapCardType(generatedCard.type),
				cardPurpose: "memory",

				// 内容存储
				content: content,
				fields: fields,
				parsedMetadata: parsedMetadata,

				// 源文件信息
				sourceFile: sourceFile,
				sourceExists: !!sourceFile,

				// FSRS 数据 - 使用标准 FSRS 算法创建，确保数据结构一致
				fsrs: fsrs
					? fsrs.createCard()
					: {
							// 降级方案：手动创建但使用正确的初始值
							due: new Date(Date.now() - 1000).toISOString(), // 稍早1秒，避免时间竞态
							stability: 0,
							difficulty: 5, // 使用中等初始难度（FSRS 默认范围3-7）
							elapsedDays: 0,
							scheduledDays: 0,
							reps: 0,
							lapses: 0,
							state: 0, // New
							lastReview: undefined, // 新卡片没有复习记录
							retrievability: 1,
					  },

				// 复习历史
				reviewHistory: [],

				// 统计信息
				stats: {
					totalReviews: 0,
					totalTime: 0,
					averageTime: 0,
					memoryRate: 0,
				},

				// 时间戳
				created: now,
				modified: now,

				// 标签
				tags: normalizedTags,

				// 优先级
				priority: 0,

				// AI生成元数据
				metadata: {
					aiGenerated: true,
					provider: generatedCard.metadata.provider,
					model: generatedCard.metadata.model,
					generatedAt: generatedCard.metadata.generatedAt,
				},
			};

			// 选择题已包含在content和fields中，无需额外处理
			// front字段已包含完整的Markdown格式（Q: + 选项 + {}标记）
			// back字段是解析说明

			return {
				success: true,
				card,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "卡片转换失败",
			};
		}
	}

	/**
	 * 批量转换
	 */
	static convertBatch(
		generatedCards: GeneratedCard[],
		deckId: string,
		sourceFile?: string,
		templates?: GenerationConfig["templates"],
		fsrs?: FSRS,
		deckName?: string
	): { cards: Card[]; errors: string[] } {
		const cards: Card[] = [];
		const errors: string[] = [];

		for (const generatedCard of generatedCards) {
			const result = this.convert(generatedCard, deckId, sourceFile, templates, fsrs, deckName);

			if (result.success && result.card) {
				cards.push(result.card);
			} else if (result.error) {
				errors.push(result.error);
			}
		}

		return { cards, errors };
	}

	/**
	 * 映射卡片类型
	 */
	private static mapCardType(type: "qa" | "cloze" | "choice" | "judge"): CardType {
		switch (type) {
			case "qa":
				return CardType.Basic;
			case "cloze":
				return CardType.Cloze;
			case "choice":
			case "judge": // 判断题作为选择题的特殊形式
				return CardType.Multiple;
			default:
				return CardType.Basic;
		}
	}

	/**
	 * 获取模板ID
	 * 始终返回有效的官方模板ID，不再使用'ai-generated'
	 */
	private static getTemplateId(
		type: "qa" | "cloze" | "choice" | "judge",
		templates?: GenerationConfig["templates"]
	): string {
		// 如果提供了templates配置，优先使用指定的模板
		if (templates) {
			switch (type) {
				case "qa":
					return templates.qa || "official-qa";
				case "choice":
				case "judge": // 判断题使用选择题模板
					return templates.choice || "official-choice";
				case "cloze":
					return templates.cloze || "official-cloze";
			}
		}

		// 降级策略：始终使用官方模板，确保模板ID有效
		switch (type) {
			case "qa":
				return "official-qa";
			case "choice":
			case "judge": // 判断题使用选择题模板
				return "official-choice";
			case "cloze":
				return "official-cloze";
			default:
				return "official-qa"; // 默认使用问答题模板
		}
	}

	/**
	 * 从 content 降级映射字段
	 */
	private static mapFieldsFromContent(
		content: string,
		type: GeneratedCard["type"]
	): Record<string, string> {
		const { front, back } = this.splitContent(content);

		switch (type) {
			case "qa":
				return {
					front: front,
					back: back,
				};
			case "choice": {
				// 选择题需要完整的字段结构用于Anki导出
				const fields: Record<string, string> = {
					front: front, // 题目
					back: back, // 解析
				};

				// 从front中提取选项和正确答案
				if (front) {
					const optionsMatch = front.match(/[A-D]\)[^\n]+/g);
					if (optionsMatch) {
						fields.options = optionsMatch.join("\n");

						// 提取正确答案（带{}标记的选项）
						const correctOptions = optionsMatch.filter(
							(opt) => opt.includes("{✓}") || opt.includes("{√}")
						);
						if (correctOptions.length > 0) {
							fields.correctAnswers = correctOptions.map((opt) => opt.charAt(0)).join(",");
						}
					}
				}

				return fields;
			}

			case "cloze":
				// 挖空题使用text字段（与模板一致）
				return {
					text: front, // 挖空内容
					hint: back || "", // 提示（如果有）
				};

			default:
				return {
					front: front,
					back: back,
				};
		}
	}

	/**
	 * 将GeneratedCard转换为Card类型（用于PreviewContainer预览）
	 * 这是一个轻量级转换，只包含预览所需的最小字段
	 */
	static convertForPreview(generatedCard: GeneratedCard): Card {
		const now = new Date().toISOString();
		const uuid = generateCardUUID();

		const content = generatedCard.content || "";

		// 使用新的解析器解析Markdown内容为fields
		const parseResult = this.parseCardContent(content, generatedCard.type);

		// 如果解析失败，使用降级方案
		let fields: Record<string, string>;
		let parsedMetadata: import("../../types/metadata-types").CardMetadata | undefined;

		if (parseResult.success) {
			fields = parseResult.fields;
			parsedMetadata = parseResult.metadata;
		} else {
			// 降级：使用简单的字段映射
			logger.warn("[CardConverter] 预览解析失败，使用降级方案:", parseResult.error);
			fields = this.mapFieldsFromContent(content, generatedCard.type);
			parsedMetadata = undefined;
		}

		// 创建预览用Card（最小化必要字段）
		const card: Card = {
			// 基础标识
			uuid: uuid,
			deckId: "preview-deck", // 预览牌组ID
			templateId: this.getDefaultTemplateId(generatedCard.type),
			type: this.mapCardType(generatedCard.type),

			// 内容存储
			content: content,
			fields: fields,
			parsedMetadata: parsedMetadata, // 新增：保存解析后的元数据

			// 源文件信息
			sourceFile: undefined,
			sourceExists: false,

			// 时间戳
			created: now,
			modified: now,

			// FSRS数据（预览不需要，使用默认值）
			fsrs: {
				state: 0,
				difficulty: 0,
				stability: 0,
				due: now,
				lastReview: undefined,
				elapsedDays: 0,
				scheduledDays: 0,
				reps: 0,
				lapses: 0,
				retrievability: 1, // 新卡片的可提取性为1
			},

			// 标签和元数据
			tags: [],
			metadata: {
				aiGenerated: true,
				provider: generatedCard.metadata?.provider || "unknown",
				model: generatedCard.metadata?.model || "unknown",
				generatedAt: generatedCard.metadata?.generatedAt || now,
			},

			// 统计信息（预览卡片使用默认值）
			stats: {
				totalReviews: 0,
				totalTime: 0,
				averageTime: 0,
				memoryRate: 0,
			},

			// 其他必需字段
			priority: 0,
			reviewHistory: [],
		};

		return card;
	}

	/**
	 * 解析卡片内容（使用新的Markdown解析器）
	 */
	private static parseCardContent(
		content: string,
		type: "qa" | "cloze" | "choice" | "judge"
	): import("../../types/metadata-types").ParseResult {
		// judge类型作为choice处理
		const effectiveType = type === "judge" ? "choice" : type;
		const parserType = this.mapToParserCardType(effectiveType);

		try {
			switch (effectiveType) {
				case "qa": {
					const parser = new QACardParser();
					return parser.parseMarkdownToFields(content, parserType);
				}
				case "choice": {
					const parser = new ChoiceCardParser();
					return parser.parseMarkdownToFields(content, parserType);
				}
				case "cloze": {
					const parser = new ClozeCardParser();
					return parser.parseMarkdownToFields(content, parserType);
				}
				default:
					// 降级：使用旧的映射方法
					return {
						success: false,
						fields: {},
						rawContent: content,
						error: {
							type: "unknown_card_type" as any,
							message: `未知的卡片类型: ${type}`,
						},
					};
			}
		} catch (error) {
			logger.error("[CardConverter] 解析失败:", error);
			// 解析失败时返回失败结果
			return {
				success: false,
				fields: {},
				rawContent: content,
				error: {
					type: "invalid_format" as any,
					message: error instanceof Error ? error.message : "解析失败",
				},
			};
		}
	}

	/**
	 * 映射到解析器的CardType
	 */
	private static mapToParserCardType(type: "qa" | "cloze" | "choice"): ParserCardType {
		switch (type) {
			case "qa":
				return "basic-qa";
			case "choice":
				return "single-choice";
			case "cloze":
				return "cloze-deletion";
			default:
				return "basic-qa";
		}
	}

	/**
	 * 获取默认模板ID（用于预览）
	 */
	private static getDefaultTemplateId(type: "qa" | "cloze" | "choice" | "judge"): string {
		switch (type) {
			case "qa":
				return "official-qa";
			case "cloze":
				return "official-cloze";
			case "choice":
			case "judge": // 判断题使用选择题模板
				return "official-choice";
			default:
				return "basic";
		}
	}

	private static splitContent(content: string): { front: string; back: string } {
		const separator = "\n\n---div---\n\n";
		if (content.includes(separator)) {
			const parts = content.split(separator);
			return {
				front: parts[0] || "",
				back: parts.slice(1).join(separator),
			};
		}

		const fallbackSeparator = "\n---div---\n";
		if (content.includes(fallbackSeparator)) {
			const parts = content.split(fallbackSeparator);
			return {
				front: parts[0] || "",
				back: parts.slice(1).join(fallbackSeparator),
			};
		}

		return {
			front: content,
			back: "",
		};
	}
}
