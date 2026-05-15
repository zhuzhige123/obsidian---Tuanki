import { DELIMITER_PATTERNS } from "../../constants/markdown-delimiters";
import type { Card } from "../../data/types";
import type { WeavePlugin } from "../../main";
import {
	type ChoiceQuestion,
	isChoiceQuestion,
	parseChoiceQuestion,
} from "../../parsing/choice-question-parser";
import type {
	DEFAULT_ANIMATION_CONFIG,
	DEFAULT_INTERACTIVITY_CONFIG,
	PreviewSectionType,
	UnifiedPreviewData,
	UnifiedPreviewSection,
} from "../../types/preview-types";
import {
	CardTypeDetectionResult,
	UnifiedCardType,
	convertCardType,
	getCardTypeMetadata,
} from "../../types/unified-card-types";
import { getCardFieldsByType } from "../../utils/card-field-helper";
import { hasAnyClozeSyntax } from "../../utils/cloze-syntax";
import { logger } from "../../utils/logger";
import { ExtensiblePreviewManager } from "./types/ExtensiblePreview";

//  导入CardAccessor用于获取子卡片内容
import { CardAccessor } from "../../services/progressive-cloze/CardAccessor";

/**
 * Compatibility note: 使用 UnifiedCardType 替代
 * 保留用于向后兼容
 */
export enum CardType {
	BASIC_QA = "basic-qa",
	CLOZE_DELETION = "cloze-deletion",
	MULTIPLE_CHOICE = "multiple-choice",
	EXTENSIBLE = "extensible",
}

// 向后兼容的类型映射
const LEGACY_TYPE_MAPPING: Record<CardType, UnifiedCardType> = {
	[CardType.BASIC_QA]: UnifiedCardType.BASIC_QA,
	[CardType.CLOZE_DELETION]: UnifiedCardType.CLOZE_DELETION,
	[CardType.MULTIPLE_CHOICE]: UnifiedCardType.MULTIPLE_CHOICE,
	[CardType.EXTENSIBLE]: UnifiedCardType.EXTENSIBLE,
};

/**
 * 预览节接口
 * Compatibility note: 使用 UnifiedPreviewSection 替代
 * 保留用于向后兼容
 */
export interface PreviewSection {
	id: string;
	type: "front" | "back" | "options" | "explanation";
	content: string;
	renderMode: "markdown" | "html" | "mixed";
	animations: AnimationConfig[];
	interactivity: InteractivityConfig;
	metadata?: Record<string, any>; // 用于存储节特定的元数据
}

/**
 * 使用统一的预览节类型
 */
export type PreviewSectionUnified = UnifiedPreviewSection;

/**
 * 动效配置接口
 */
export interface AnimationConfig {
	type: "fadeIn" | "slideIn" | "scaleIn" | "clozeReveal";
	duration: number;
	delay: number;
	easing: string;
}

/**
 * 交互配置接口
 */
export interface InteractivityConfig {
	clickable: boolean;
	hoverable: boolean;
	selectable: boolean;
	customHandlers: Record<string, (...args: unknown[]) => unknown>;
}

/**
 * 预览元数据接口
 */
export interface PreviewMetadata {
	cardId: string;
	templateId: string;
	cardType: UnifiedCardType;
	confidence: number;
	generatedAt: number;
	renderingHints: RenderingHints;
}

/**
 * 渲染提示接口
 */
export interface RenderingHints {
	preferredHeight: number;
	hasInteractiveElements: boolean;
	requiresObsidianRenderer: boolean;
	cacheKey: string;
}

/**
 * 预览数据接口
 */
export interface PreviewData {
	templateId?: string;
	originalContent?: string;
	confidence?: number;
	cardType: UnifiedCardType;
	sections: PreviewSection[];
	metadata: PreviewMetadata;
	renderingHints: RenderingHints;
}

/**
 * 预览选项接口
 */
export interface PreviewOptions {
	showAnswer: boolean;
	enableAnimations: boolean;
	themeMode: "auto" | "light" | "dark";
	renderingMode: "performance" | "quality";
	enableAnswerControls?: boolean;
}

/**
 * 预览结果接口
 */
export interface PreviewResult {
	success: boolean;
	previewData?: PreviewData;
	error?: string;
	renderTime: number;
}

/**
 * 内容预览引擎
 * 负责解析卡片内容并生成预览数据
 */
export class ContentPreviewEngine {
	private plugin: WeavePlugin;
	//  暂时禁用：卡片解析引擎
	// private cardParsingEngine: CardParsingEngine;
	private previewCache: Map<string, PreviewData> = new Map();
	private extensibleManager: ExtensiblePreviewManager;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;

		//  暂时禁用：初始化卡片解析引擎
		// const presetManager = new PresetManager();
		// const settings = presetManager.getDefaultSettings();
		// this.cardParsingEngine = new CardParsingEngine(settings);

		// 初始化可扩展预览管理器
		this.extensibleManager = new ExtensiblePreviewManager(plugin);
	}

	/**
	 * 预处理卡片数据
	 * Compatibility note: preprocessing is no longer needed when content is the source of truth
	 */
	private preprocessCardForRendering(card: Card): Card {
		// 直接返回原始卡片
		// 所有内容从 card.content 动态解析，无需预处理
		return card;
	}

	/**
	 * 解析卡片内容并生成预览数据
	 */
	async parseCardContent(card: Card, template?: any): Promise<PreviewData> {
		const startTime = performance.now();

		// 预处理卡片数据
		const preprocessedCard = this.preprocessCardForRendering(card);

		// 生成缓存键（使用预处理后的卡片）
		const cacheKey = this.generateCacheKey(preprocessedCard);

		// 检查缓存
		if (this.previewCache.has(cacheKey)) {
			const cached = this.previewCache.get(cacheKey)!;
			logger.debug(`[ContentPreviewEngine] 使用缓存预览数据: ${preprocessedCard.uuid}`);
			return cached;
		}

		logger.debug(`[ContentPreviewEngine] 开始解析卡片内容: ${preprocessedCard.uuid}`);

		// 检测卡片题型（使用预处理后的卡片）
		const cardType = await this.detectCardType(preprocessedCard);

		// 获取模板
		const effectiveTemplate = template || this.getEffectiveTemplate(preprocessedCard);

		// 生成预览节（使用预处理后的卡片）
		const sections = this.generatePreviewSections(preprocessedCard, cardType, effectiveTemplate);

		// 生成元数据
		const metadata: PreviewMetadata = {
			cardId: preprocessedCard.uuid,
			templateId: effectiveTemplate?.id || "unknown",
			cardType,
			confidence: this.calculateConfidence(card, cardType),
			generatedAt: Date.now(),
			renderingHints: this.generateRenderingHints(sections, cardType),
		};

		// 为所有卡片类型添加 sourcePath，确保内部链接和 hover 功能正常
		(metadata as any).sourcePath = preprocessedCard.sourceFile || "";

		//  Content-Only: 选择题选项由 ObsidianRenderer 从 content 动态解析
		// 不再需要在预览数据中预处理选项
		// if (cardType === UnifiedCardType.MULTIPLE_CHOICE) {
		//   // TODO: 从 content 解析选择题选项（如果需要）
		// }

		const previewData: PreviewData = {
			cardType,
			sections,
			metadata,
			renderingHints: metadata.renderingHints,
		};

		// 缓存结果
		this.previewCache.set(cacheKey, previewData);

		const endTime = performance.now();
		logger.debug(
			`[ContentPreviewEngine] 预览数据生成完成: ${card.uuid}, 耗时: ${endTime - startTime}ms`
		);

		return previewData;
	}

	/**
	 * 检测卡片题型 - 返回统一题型
	 */
	async detectCardType(card: Card): Promise<UnifiedCardType> {
		// 1. 尝试扩展题型检测
		const extensibleResult = await this.extensibleManager.detectCardType(card);
		if (extensibleResult?.matches) {
			// 转换扩展题型ID到统一题型
			const legacyType = extensibleResult.cardTypeId as CardType;
			return this.convertLegacyType(legacyType);
		}

		// 2. 检测选择题（使用新的解析器）
		const cardContent = this.getCardContent(card);
		if (isChoiceQuestion(cardContent)) {
			const choiceQuestion = parseChoiceQuestion(cardContent);
			if (choiceQuestion) {
				logger.debug(
					"[ContentPreviewEngine] 检测到选择题格式:",
					card.uuid,
					"类型:",
					choiceQuestion.isMultipleChoice ? "多选" : "单选"
				);
				// 根据是否多选返回不同的题型
				//  无答案容错：correctAnswers 为空时，默认按单选渲染（UI 将提示“答案缺失”）
				if (!choiceQuestion.correctAnswers || choiceQuestion.correctAnswers.length === 0) {
					return UnifiedCardType.SINGLE_CHOICE;
				}

				return choiceQuestion.isMultipleChoice
					? UnifiedCardType.MULTIPLE_CHOICE
					: UnifiedCardType.SINGLE_CHOICE;
			}
		}

		// 3. 检测挖空题（含 ==text== 或 {{c1::text}} 标记即判为挖空题，无论是否含 ---div---）
		if (this.isClozeCard(card)) {
			return UnifiedCardType.CLOZE_DELETION;
		}

		// 4. 默认为基础问答题（有无 ---div--- 均为问答题，---div--- 仅用于分割正面/背面）
		return UnifiedCardType.BASIC_QA;
	}

	/**
	 * 获取卡片内容用于题型检测
	 *  V2架构：渐进式挖空子卡片直接使用自己的 content（已在创建时复制）
	 *
	 * 移除 CardAccessor 依赖，避免父卡片查找失败问题
	 */
	private getCardContent(card: Card): string {
		//  简化：直接返回 card.content
		// 子卡片在创建时已经从父卡片复制了 content，无需运行时查找父卡片
		return card.content?.trim() || "";
	}

	/**
	 * 转换旧题型到统一题型
	 */
	private convertLegacyType(legacyType: CardType): UnifiedCardType {
		return LEGACY_TYPE_MAPPING[legacyType] || UnifiedCardType.BASIC_QA;
	}

	/**
	 * 转换统一题型到旧题型
	 */
	private convertUnifiedToLegacy(unifiedType: UnifiedCardType): CardType {
		const mapping = Object.entries(LEGACY_TYPE_MAPPING).find(
			([, unified]) => unified === unifiedType
		);
		return mapping ? (mapping[0] as CardType) : CardType.BASIC_QA;
	}

	/**
	 * 生成预览内容
	 */
	async generatePreview(previewData: PreviewData, options: PreviewOptions): Promise<PreviewResult> {
		const startTime = performance.now();

		try {
			// 根据题型生成特定预览
			switch (previewData.cardType) {
				case UnifiedCardType.BASIC_QA:
					await this.generateBasicQAPreview(previewData, options);
					break;
				case UnifiedCardType.CLOZE_DELETION:
					await this.generateClozePreview(previewData, options);
					break;
				case UnifiedCardType.SINGLE_CHOICE:
				case UnifiedCardType.MULTIPLE_CHOICE:
					// 选择题预览由ChoiceQuestionPreview组件直接处理
					break;
				default:
					await this.generateExtensiblePreview(previewData, options);
			}

			const endTime = performance.now();

			return {
				success: true,
				previewData,
				renderTime: endTime - startTime,
			};
		} catch (error) {
			logger.error("[ContentPreviewEngine] 预览生成失败:", error);

			return {
				success: false,
				error: error instanceof Error ? error.message : "未知错误",
				renderTime: performance.now() - startTime,
			};
		}
	}

	/**
	 * 清理缓存
	 */
	clearCache(): void {
		this.previewCache.clear();
		this.extensibleManager.cleanup();
		logger.debug("[ContentPreviewEngine] 预览缓存已清理");
	}

	/**
	 * 获取扩展管理器
	 */
	getExtensibleManager(): ExtensiblePreviewManager {
		return this.extensibleManager;
	}

	/**
	 * 获取缓存统计
	 */
	getCacheStats(): { size: number; keys: string[] } {
		return {
			size: this.previewCache.size,
			keys: Array.from(this.previewCache.keys()),
		};
	}

	// ===== 私有方法 =====

	/**
	 * 检测是否为挖空卡片
	 *  遵循卡片数据结构规范 v1.0：优先使用 card.content
	 */
	private isClozeCard(card: Card): boolean {
		// 优先使用 card.content
		let contentToCheck = "";

		// 只从 content 检测
		if (card.content?.trim()) {
			contentToCheck = card.content;
		}

		if (!contentToCheck) return false;

		return hasAnyClozeSyntax(contentToCheck);
	}

	/**
	 * 获取有效模板
	 * Compatibility note: template lookup is no longer needed when content is the source of truth
	 */
	private getEffectiveTemplate(_card: Card): any | null {
		// 不再需要模板系统
		// 所有内容从 card.content 动态解析
		return null;
	}

	/**
	 * 生成预览节
	 */
	private generatePreviewSections(
		card: Card,
		cardType: UnifiedCardType,
		_template: any | null
	): PreviewSection[] {
		const sections: PreviewSection[] = [];

		const splitByMainSeparator = (raw: string): { front: string; back: string } => {
			const content = raw ?? "";
			const match = content.match(DELIMITER_PATTERNS.MAIN_SEPARATOR);
			if (!match || typeof match.index !== "number") {
				return { front: content.trim(), back: "" };
			}

			const front = content.substring(0, match.index).trim();
			const back = content.substring(match.index + match[0].length).trim();
			return { front, back };
		};

		switch (cardType) {
			case UnifiedCardType.BASIC_QA: {
				// 使用 Parser 自动解析
				const fields = getCardFieldsByType(card, "basic-qa");
				sections.push(
					this.createPreviewSection("front", fields.front || "", "markdown"),
					this.createPreviewSection("back", fields.back || "", "markdown")
				);
				break;
			}

			case UnifiedCardType.CLOZE_DELETION: {
				// 使用 Parser 自动解析
				const fields = getCardFieldsByType(card, "cloze-deletion");
				const clozeFullContent = fields.text || card.content?.trim() || "";
				const { front: clozeContent, back: backContent } = splitByMainSeparator(clozeFullContent);

				// 添加挖空section
				if (clozeContent) {
					sections.push(this.createPreviewSection("front", clozeContent, "mixed"));
				}

				// 如果存在back内容，添加back section
				if (backContent) {
					sections.push(this.createPreviewSection("back", backContent, "markdown"));
				}
				break;
			}

			case UnifiedCardType.MULTIPLE_CHOICE:
			case UnifiedCardType.SINGLE_CHOICE: {
				// 遵循卡片数据结构规范
				// 使用 Parser 自动解析
				const parserType =
					cardType === UnifiedCardType.MULTIPLE_CHOICE ? "multiple-choice" : "single-choice";
				const fields = getCardFieldsByType(card, parserType);
				const choiceContent = fields.front || card.content?.trim() || "";

				if (choiceContent && isChoiceQuestion(choiceContent)) {
					const { front: questionContent, back: explanationContent } =
						splitByMainSeparator(choiceContent);

					sections.push(this.createPreviewSection("front", questionContent, "markdown"));

					if (explanationContent) {
						sections.push(this.createPreviewSection("back", explanationContent, "markdown"));
					}
				} else {
					// 普通显示（无法解析为选择题格式）
					sections.push(this.createPreviewSection("front", fields.front || "", "markdown"));

					if (fields.back) {
						sections.push(this.createPreviewSection("back", fields.back, "markdown"));
					}
				}
				break;
			}
		}

		return sections;
	}

	/**
	 * 创建预览节
	 */
	private createPreviewSection(
		type: PreviewSection["type"],
		content: string,
		renderMode: PreviewSection["renderMode"]
	): PreviewSection {
		return {
			id: `section-${type}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
			type,
			content,
			renderMode,
			animations: this.getDefaultAnimations(type),
			interactivity: this.getDefaultInteractivity(type),
		};
	}

	/**
	 * 获取默认动效配置
	 */
	private getDefaultAnimations(type: PreviewSection["type"]): AnimationConfig[] {
		const baseAnimation: AnimationConfig = {
			type: "fadeIn",
			duration: 300,
			delay: 0,
			easing: "cubic-bezier(0.4, 0, 0.2, 1)",
		};

		switch (type) {
			case "front":
				return [{ ...baseAnimation, delay: 0 }];
			case "back":
				return [{ ...baseAnimation, delay: 100 }];
			case "options":
				return [{ ...baseAnimation, type: "slideIn", delay: 150 }];
			case "explanation":
				return [{ ...baseAnimation, delay: 200 }];
			default:
				return [baseAnimation];
		}
	}

	/**
	 * 获取默认交互配置
	 */
	private getDefaultInteractivity(type: PreviewSection["type"]): InteractivityConfig {
		return {
			clickable: type === "options",
			hoverable: true,
			selectable: false,
			customHandlers: {},
		};
	}

	/**
	 * 生成缓存键
	 */
	private generateCacheKey(card: Card): string {
		const templateId = card.templateId || "default";
		// 使用 content 生成缓存键
		const contentHash = this.hashContent(card.content || "");
		return `${card.uuid}-${templateId}-${contentHash}`;
	}

	/**
	 * 计算内容哈希
	 * 基于 content 的哈希
	 */
	private hashContent(content: string): string {
		if (!content || typeof content !== "string") {
			return "0";
		}

		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return hash.toString(36);
	}

	/**
	 * 计算字段哈希
	 * Compatibility note: field hashes are replaced by hashContent when content is the source of truth
	 */
	private hashFields(fields: Record<string, string>): string {
		// 向后兼容，但已废弃
		if (!fields || typeof fields !== "object") {
			return "0";
		}

		const sortedFields = Object.keys(fields)
			.sort()
			.map((k) => `${k}:${fields[k]}`)
			.join("|");
		return this.hashContent(sortedFields);
	}

	/**
	 * 计算置信度
	 */
	private calculateConfidence(card: Card, cardType: UnifiedCardType): number {
		let confidence = 0.8; // 基础置信度

		// 根据 content 完整性调整
		if (card.content?.trim()) {
			confidence += 0.2;
		}

		// 根据题型特征调整
		switch (cardType) {
			case UnifiedCardType.MULTIPLE_CHOICE:
				//  Content-Only: 从 content 检测选择题（暂时跳过）
				// if (isMultipleChoiceCard(card.content)) {
				//   confidence += 0.1;
				// }
				break;
			case UnifiedCardType.CLOZE_DELETION:
				if (this.isClozeCard(card)) {
					confidence += 0.1;
				}
				break;
		}

		return Math.min(confidence, 1.0);
	}

	/**
	 * 生成渲染提示
	 */
	private generateRenderingHints(
		sections: PreviewSection[],
		cardType: UnifiedCardType
	): RenderingHints {
		const totalContent = sections.reduce((acc, section) => acc + section.content.length, 0);

		return {
			preferredHeight: Math.max(200, Math.min(600, totalContent / 10)),
			hasInteractiveElements: sections.some((s) => s.interactivity.clickable),
			requiresObsidianRenderer: sections.some(
				(s) => s.content.includes("[[") || s.content.includes("![[") || s.content.includes("#")
			),
			cacheKey: `render-${cardType}-${Date.now()}`,
		};
	}

	// ===== 题型特定预览生成方法 =====

	/**
	 * 生成基础问答预览
	 */
	private async generateBasicQAPreview(
		_previewData: PreviewData,
		_options: PreviewOptions
	): Promise<void> {
		// 基础问答预览逻辑将在后续实现
		logger.debug("[ContentPreviewEngine] 生成基础问答预览");
	}

	/**
	 * 生成挖空题预览
	 * Compatibility note: 挖空预览已由 ObsidianRenderer 统一处理
	 */
	private async generateClozePreview(
		_previewData: PreviewData,
		_options: PreviewOptions
	): Promise<void> {
		logger.debug("[ContentPreviewEngine] 🎯 挖空题预览由 ObsidianRenderer 处理");

		// 挖空题由 ObsidianRenderer 统一处理
		// 不再需要单独的挖空预览生成逻辑
		// ObsidianRenderer 会自动解析 content 中的挖空标记

		logger.debug("[ContentPreviewEngine] ✅ 挖空题预览生成完成（已委托给渲染器）");
	}

	// 选择题预览生成功能已移除

	/**
	 * 生成可扩展预览
	 */
	private async generateExtensiblePreview(
		_previewData: PreviewData,
		_options: PreviewOptions
	): Promise<void> {
		// 可扩展预览逻辑将在后续实现
		logger.debug("[ContentPreviewEngine] 生成可扩展预览");
	}
}
