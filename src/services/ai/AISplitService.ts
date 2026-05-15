/**
 * AI卡片拆分服务
 * 将复杂的父卡片拆分成多张简单的子卡片
 *
 * @module services/ai
 */

import type { Card } from "../../data/types";
import type { AIAction, AIProvider } from "../../types/ai-types";
import { generateCardUUID } from "../identifier/WeaveIDGenerator";
import { DerivationMethod } from "../relation/types";
import { PromptVariableResolver } from "./PromptVariableResolver";
import { resolveAIConfig, type AISplitHost } from "./ai-host";

const AI_PROVIDERS: AIProvider[] = [
	"openai",
	"gemini",
	"anthropic",
	"deepseek",
	"zhipu",
	"siliconflow",
	"xai",
];

function isAIProvider(value?: string): value is AIProvider {
	return value !== undefined && AI_PROVIDERS.includes(value as AIProvider);
}

/**
 * 拆分配置接口
 */
export interface SplitConfig {
	/** 拆分策略 */
	splitStrategy: "knowledge-point" | "difficulty" | "content-length";
	/** 目标子卡片数量 */
	targetCount: number;
	/** 额外拆分指令（可选），通常来自插件设置 defaultInstruction */
	instruction?: string;
	/** 最小内容长度 */
	minContentLength: number;
	/** 最大内容长度 */
	maxContentLength: number;
	/** 保持上下文连贯性 */
	preserveContext: boolean;
	/** 确保内容完整性 */
	ensureCompleteness: boolean;
	/** 输出格式 */
	outputFormat: "qa" | "cloze" | "mixed";
}

/**
 * 拆分后的子卡片数据
 *
 * 🔧 数据结构说明：
 * - 统一使用 `content` 存储完整的Markdown内容
 * - 不使用已弃用的 `fields.front`/`fields.back` 字段
 */
export interface SplitCardData {
	/** ✅ 权威字段：完整的Markdown格式内容 */
	content: string;
	/** 标签 */
	tags?: string[];
	/** 优先级 */
	priority?: number;
	/** 置信度（AI生成） */
	confidence?: number;
}

/**
 * 拆分结果
 */
export interface SplitResult {
	/** 是否成功 */
	success: boolean;
	/** 生成的子卡片数据 */
	splitCards?: SplitCardData[];
	/** 错误信息 */
	error?: string;
	/** 元数据 */
	metadata?: {
		provider: string;
		model: string;
		tokensUsed: number;
		cost?: number;
	};
}

interface AIProviderConfig {
	apiKey: string;
	model?: string;
}

interface ParsedSplitCard {
	content?: string;
	front?: string;
	tags?: string[];
	priority?: number;
	confidence?: number;
}

/**
 * AI卡片拆分服务
 */
export class AISplitService {
	private static variableResolver = new PromptVariableResolver();

	constructor(private host: AISplitHost) {}

	/**
	 * 拆分卡片
	 */
	async splitCard(
		card: Card,
		action: AIAction,
		config?: Partial<SplitConfig>
	): Promise<SplitResult> {
		try {
			// 检查AI配置
			const aiConfig = resolveAIConfig(this.host);
			if (!aiConfig?.cardSplitting?.enabled) {
				return {
					success: false,
					error: "AI卡片拆分功能未启用，请在设置中开启",
				};
			}

			// ✅ 统一的provider选择逻辑：action.provider > defaultProvider
			// 注意：由AIActionExecutor统一处理，这里action.provider已经被设置
			const provider = action.provider || (isAIProvider(aiConfig.defaultProvider) ? aiConfig.defaultProvider : undefined);
			const modelFromAction = action.model;

			if (!provider) {
				return {
					success: false,
					error: "未设置AI提供商，请在 [插件设置 > AI服务] 中配置",
				};
			}

			const apiKeys = aiConfig.apiKeys as Partial<Record<string, AIProviderConfig>> | undefined;
			const providerConfig = apiKeys?.[provider];
			if (!providerConfig || !providerConfig.apiKey) {
				return {
					success: false,
					error: `AI提供商"${provider}"未配置API密钥，请前往 [插件设置 > AI服务] 进行配置`,
				};
			}

			// 构建提示词
			const { systemPrompt, userPrompt } = await this.buildPrompts(card, action, config);

			// 获取AI服务实例
			const { AIServiceFactory } = await import("./AIServiceFactory");
			const aiService = AIServiceFactory.createService(provider, this.host, modelFromAction);

			// 调用AI服务
			const response = await aiService.chat({
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
				temperature: 0.3, // 拆分需要一定创造性但保持准确性
				maxTokens: 4000,
			});

			if (!response.success || !response.content) {
				return {
					success: false,
					error: response.error || "AI拆分卡片失败",
				};
			}

			// 解析AI响应
			const splitCards = this.parseAIResponse(response.content, card, config);

			return {
				success: true,
				splitCards,
				metadata: {
					provider,
					model: response.model || modelFromAction || providerConfig.model || "unknown",
					tokensUsed: response.tokensUsed || 0,
					cost: response.cost,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "拆分卡片失败",
			};
		}
	}

	/**
	 * 构建AI提示词
	 */
	private async buildPrompts(
		card: Card,
		action: AIAction,
		config?: Partial<SplitConfig>
	): Promise<{ systemPrompt: string; userPrompt: string }> {
		// 默认配置
		const splitConfig: SplitConfig = {
			splitStrategy: action.splitConfig?.splitStrategy || "knowledge-point",
			targetCount: action.splitConfig?.targetCount || 3,
			outputFormat: action.splitConfig?.outputFormat || "qa",
			minContentLength: 50,
			maxContentLength: 300,
			preserveContext: true,
			ensureCompleteness: true,
			...config,
		};

		// ✅ Action驱动：优先使用 action.systemPrompt / action.userPromptTemplate
		// 兼容：如果历史数据存在 action.userPrompt 则回退使用
		let systemPrompt = action.systemPrompt || "";
		let userPrompt = action.userPromptTemplate || action.userPrompt || "";

		// 最小兜底（避免空提示词导致AI服务报错）
		if (!systemPrompt.trim()) {
			systemPrompt = "你是一个专业的学习卡片拆分助手。";
		}
		if (!userPrompt.trim()) {
			userPrompt =
				"请将以下卡片内容拆分成{{数量}}张独立的子卡片：\n\n{{cardContent}}\n\n请以JSON格式返回拆分结果。";
		}

		// ✅ 支持 {{数量}} 变量（默认拆分模板大量使用，但 PromptVariableResolver 不处理这个变量）
		systemPrompt = systemPrompt.replace(/\{\{数量\}\}/g, String(splitConfig.targetCount));
		userPrompt = userPrompt.replace(/\{\{数量\}\}/g, String(splitConfig.targetCount));

		// ✅ 追加插件/调用方传入的额外拆分指令（例如 defaultInstruction）
		if (splitConfig.instruction?.trim()) {
			userPrompt += `\n\n额外指令：\n${splitConfig.instruction.trim()}`;
		}

		// 解析提示词中的变量（如果有）
		systemPrompt = AISplitService.variableResolver.resolve(systemPrompt, card, {});
		userPrompt = AISplitService.variableResolver.resolve(userPrompt, card, {});

		return { systemPrompt, userPrompt };
	}

	/**
	 * 解析AI响应
	 */
	private parseAIResponse(
		responseContent: string,
		parentCard: Card,
		config?: Partial<SplitConfig>
	): SplitCardData[] {
		try {
			// 清理AI响应（移除可能的代码块包裹）
			let cleaned = responseContent.trim();

			// 移除markdown代码块
			const codeBlockRegex = /^```(?:json|markdown|md|text|)?\s*\n?([\s\S]*?)\n?```$/;
			const match = cleaned.match(codeBlockRegex);
			if (match) {
				cleaned = match[1].trim();
			}

			// 首先尝试解析JSON格式
			const jsonMatch = cleaned.match(/\[[\s\S]*\]/) || cleaned.match(/\{[\s\S]*"cards"[\s\S]*\}/);
			if (jsonMatch) {
				try {
					const parsed = JSON.parse(jsonMatch[0]);
					return this.parseJSONResponse(parsed, parentCard);
				} catch {
					// 静默失败，尝试纯文本解析
				}
			}

			// 如果JSON解析失败，尝试解析纯文本格式
			return this.parseTextResponse(cleaned, parentCard, config);
		} catch (error) {
			throw new Error(`AI响应格式错误: ${error instanceof Error ? error.message : "未知错误"}`);
		}
	}

	/**
	 * 解析JSON格式响应
	 */
	private parseJSONResponse(parsed: unknown, parentCard: Card): SplitCardData[] {
		const splitCards: SplitCardData[] = [];

		// 支持两种格式：{ cards: [...] } 或直接 [...]
		const parsedObject =
			typeof parsed === "object" && parsed !== null ? (parsed as { cards?: unknown }) : {};
		const cardsArray = Array.isArray(parsed)
			? parsed
			: Array.isArray(parsedObject.cards)
			? parsedObject.cards
			: [];

		if (!Array.isArray(cardsArray) || cardsArray.length === 0) {
			throw new Error("AI返回的拆分卡片列表为空");
		}

		for (const [index, rawCardData] of cardsArray.entries()) {
			const cardData =
				typeof rawCardData === "object" && rawCardData !== null
					? (rawCardData as ParsedSplitCard)
					: {};
			const content = cardData.content || cardData.front || "";

			if (!content || content.trim() === "") {
				throw new Error(`第${index + 1}张卡片内容为空`);
			}

			splitCards.push({
				content: content.trim(),
				// ❌ 不保存 fields 对象（已弃用的派生字段）
				tags: cardData.tags || parentCard.tags || [],
				priority: cardData.priority || parentCard.priority,
				confidence: cardData.confidence || 0.8,
			});
		}

		return splitCards;
	}

	/**
	 * 解析纯文本格式响应
	 */
	private parseTextResponse(
		textContent: string,
		parentCard: Card,
		_config?: Partial<SplitConfig>
	): SplitCardData[] {
		const splitCards: SplitCardData[] = [];

		try {
			// 按多种分隔符分割卡片
			const separators = [/---\s*卡片\s*\d+\s*---/gi, /---/g, /\n\n\n+/g];
			let parts: string[] = [textContent];

			for (const separator of separators) {
				const newParts: string[] = [];
				for (const part of parts) {
					newParts.push(...part.split(separator));
				}
				parts = newParts.map((part) => part.trim()).filter((part) => part.length > 20);

				if (parts.length > 1) {
					break;
				}
			}

			if (parts.length < 2) {
				// 无法有效分割，返回单个卡片
				parts = [textContent];
			}

			for (const part of parts) {
				const content = part.trim();
				if (content.length > 10) {
					// 过滤太短的内容
					splitCards.push({
						content,
						tags: parentCard.tags || [],
						priority: parentCard.priority,
						confidence: 0.6, // 纯文本解析置信度较低
					});
				}
			}

			return splitCards;
		} catch (error) {
			throw new Error(`纯文本格式解析错误: ${error instanceof Error ? error.message : "未知错误"}`);
		}
	}

	/**
	 * 创建记忆学习子卡片
	 */
	async createMemoryCards(splitCards: SplitCardData[], parentCard: Card): Promise<Card[]> {
		const now = new Date().toISOString();
		const childCards: Card[] = [];

		for (let i = 0; i < splitCards.length; i++) {
			const splitData = splitCards[i];

			const childCard: Card = {
				uuid: generateCardUUID(), // 使用正确的UUID生成函数
				deckId: parentCard.deckId,
				templateId: parentCard.templateId,
				type: parentCard.type,
				cardPurpose: "memory", // 关键：设置为记忆学习卡片

				content: splitData.content, // ✅ 使用权威字段content
				fields: undefined, // ⚠️ 显式设置为undefined，禁止使用已弃用的fields字段
				tags: splitData.tags || parentCard.tags || [],
				priority: splitData.priority || parentCard.priority || 0,

				// 继承源文档信息
				sourceFile: parentCard.sourceFile,
				sourceDocumentKey: parentCard.sourceDocumentKey,
				sourceSubunitKey: parentCard.sourceSubunitKey,
				sourceKind: parentCard.sourceKind,
				outputKind: parentCard.outputKind || "memory",
				sourceBlock: parentCard.sourceBlock,
				sourceRange: parentCard.sourceRange,
				sourceExists: parentCard.sourceExists,

				// 父子关系设置
				parentCardId: parentCard.uuid,
				relationMetadata: {
					isParent: false,
					level: 1,
					siblingIndex: i,
					derivationMetadata: {
						method: DerivationMethod.AI_SPLIT,
						splitTimestamp: now,
						originalContentHash: this.hashContent(parentCard.content),
						confidence: splitData.confidence,
					},
					learningStrategy: {
						requireParentMastery: false,
						reviewTogether: false,
						inheritTags: true,
					},
					relationStatus: {
						isSynced: true,
						lastSyncCheck: now,
					},
				},

				// FSRS初始状态
				fsrs: {
					due: now,
					stability: 0,
					difficulty: 0,
					elapsedDays: 0,
					scheduledDays: 0,
					reps: 0,
					lapses: 0,
					state: 0, // CardState.New
					retrievability: 0,
				},
				reviewHistory: [],

				stats: {
					totalReviews: 0,
					totalTime: 0,
					averageTime: 0,
					memoryRate: 0,
				},

				created: now,
				modified: now,
			};

			childCards.push(childCard);
		}

		return childCards;
	}

	/**
	 * 回收父卡片（添加#回收标签，原搁置功能）
	 */
	async archiveParentCard(parentCard: Card): Promise<void> {
		// 检查是否已存在回收/搁置标签（兼容旧版）
		if (
			!parentCard.content.includes("#回收") &&
			!parentCard.content.includes("#recycle") &&
			!parentCard.content.includes("#postpone") &&
			!parentCard.content.includes("#搁置")
		) {
			parentCard.content += "\n\n#回收";
			parentCard.modified = new Date().toISOString();

			// 更新父卡片的关系元数据
			if (!parentCard.relationMetadata) {
				parentCard.relationMetadata = {
					isParent: true,
					level: 0,
					childCardIds: [],
				};
			} else {
				parentCard.relationMetadata.isParent = true;
			}

			await this.host.dataStorage.saveCard(parentCard);
		}
	}

	/**
	 * 更新父卡片的子卡片ID列表
	 */
	async updateParentCardRelations(parentCard: Card, childCardUUIDs: string[]): Promise<void> {
		if (!parentCard.relationMetadata) {
			parentCard.relationMetadata = {
				isParent: true,
				level: 0,
			};
		}

		parentCard.relationMetadata.isParent = true;
		parentCard.relationMetadata.childCardIds = childCardUUIDs;
		parentCard.modified = new Date().toISOString();

		await this.host.dataStorage.saveCard(parentCard);
	}

	/**
	 * 计算内容哈希
	 */
	private hashContent(content: string): string {
		// 简单的哈希函数，用于检测内容变化
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // 转换为32位整数
		}
		return hash.toString(16);
	}
}
