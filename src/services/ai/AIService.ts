import { getOfficialTemplateById } from "../../constants/official-templates";
import type {
	AIServiceResponse,
	GeneratedCard,
	GenerationConfig,
	GenerationProgress,
	IAIService,
	RegenerateRequest,
	SplitCardRequest,
	SplitCardResponse,
	SystemPromptConfig,
} from "../../types/ai-types";
import type { ParseTemplate } from "../../types/newCardParsingTypes";
import { logger } from "../../utils/logger";
import { sendAIHttpRequest } from "./ObsidianRequestAdapter";
import type { AIHttpRequest, AIHttpResponse } from "./ObsidianRequestAdapter";
import { PromptBuilderService } from "./PromptBuilderService";
import { normalizeAITextContent, parseJsonFromAIText } from "./responseParsing";

/**
 * AI服务抽象基类
 */

/**
 * Chat消息接口
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/**
 * Chat请求接口
 */
export interface ChatRequest {
	messages: ChatMessage[];
	temperature?: number;
	maxTokens?: number;
	responseFormat?: "json_object";
}

/**
 * Chat响应接口
 */
export interface ChatResponse {
	success: boolean;
	content?: string;
	model?: string;
	tokensUsed?: number;
	cost?: number;
	error?: string;
}

export interface ParsedAICard {
	type?: GeneratedCard["type"];
	content?: unknown;
	front?: unknown;
	back?: unknown;
	choices?: string[];
	correctAnswer?: number;
	clozeText?: string;
	tags?: string[];
	images?: string[];
	explanation?: string;
	sourceText?: unknown;
	[key: string]: unknown;
}

interface ErrorLike {
	message?: string;
	status?: number;
	response?: {
		data?: {
			error?: {
				message?: string;
			};
		};
	};
}

function toErrorLike(error: unknown): ErrorLike {
	if (typeof error === "string") {
		return { message: error };
	}

	if (typeof error === "object" && error !== null) {
		return error as ErrorLike;
	}

	return {};
}

export abstract class AIService implements IAIService {
	protected apiKey: string;
	protected model: string;
	protected baseUrl = "";
	protected systemPromptConfig?: SystemPromptConfig;

	constructor(
		apiKey: string,
		model: string,
		baseUrl?: string,
		systemPromptConfig?: SystemPromptConfig
	) {
		this.apiKey = apiKey;
		this.model = model;
		this.systemPromptConfig = systemPromptConfig;

		if (baseUrl) {
			this.baseUrl = baseUrl;
		}
	}

	/**
	 * 生成卡片
	 */
	abstract generateCards(
		content: string,
		config: GenerationConfig,
		onProgress?: (progress: GenerationProgress) => void
	): Promise<AIServiceResponse>;

	/**
	 * 重新生成单张卡片
	 */
	abstract regenerateCard(
		request: RegenerateRequest,
		config: GenerationConfig
	): Promise<AIServiceResponse>;

	/**
	 * 拆分父卡片为多个子卡片
	 */
	abstract splitParentCard(request: SplitCardRequest): Promise<SplitCardResponse>;

	/**
	 * 测试API连接
	 */
	abstract testConnection(): Promise<boolean>;

	/**
	 * 通用对话接口（用于格式化等非生成场景）
	 */
	abstract chat(request: ChatRequest): Promise<ChatResponse>;

	/**
	 * 加载模板信息
	 */
	protected loadTemplates(config: GenerationConfig): {
		qa?: ParseTemplate;
		choice?: ParseTemplate;
		cloze?: ParseTemplate;
	} {
		const templates = config.templates;

		if (!templates) {
			return {};
		}

		return {
			qa: getOfficialTemplateById(templates.qa) ?? undefined,
			choice: getOfficialTemplateById(templates.choice) ?? undefined,
			cloze: getOfficialTemplateById(templates.cloze) ?? undefined,
		};
	}

	/**
	 * 构建系统提示词（使用PromptBuilderService）
	 */
	protected buildSystemPrompt(config: GenerationConfig): string {
		return PromptBuilderService.buildSystemPrompt(config, this.systemPromptConfig);
	}

	/**
	 * 构建用户提示词（使用PromptBuilderService）
	 */
	protected buildUserPrompt(content: string, promptTemplate: string): string {
		return PromptBuilderService.buildUserPrompt(content, promptTemplate);
	}

	/**
	 * 统一走 Obsidian requestUrl，避免 provider 层各自直接依赖运行时模块
	 */
	protected request(request: AIHttpRequest): Promise<AIHttpResponse> {
		return sendAIHttpRequest(request);
	}

	/**
	 * 解析AI响应为卡片数组
	 */
	protected parseResponse(responseText: string): ParsedAICard[] {
		try {
			for (const candidate of parseJsonFromAIText(responseText ?? "")) {
				const cards = this.extractCardsFromParsed(candidate);

				if (cards) {
					return cards;
				}
			}

			throw new Error("AI返回的内容格式不正确");
		} catch (error) {
			logger.error("Failed to parse AI response:", error);
			throw new Error("AI返回的内容格式不正确");
		}
	}

	private extractCardsFromParsed(parsed: unknown): ParsedAICard[] | null {
		if (!parsed) {
			return null;
		}

		if (Array.isArray(parsed)) {
			return parsed as ParsedAICard[];
		}

		if (typeof parsed === "object") {
			const objectResult = parsed as { cards?: unknown };

			if (Array.isArray(objectResult.cards)) {
				return objectResult.cards as ParsedAICard[];
			}
		}

		return null;
	}

	protected extractMessageContent(content: unknown): string {
		return normalizeAITextContent(content);
	}

	protected ensureString(value: unknown): string {
		if (value === null || value === undefined) {
			return "";
		}

		if (typeof value === "string") {
			return value;
		}

		if (typeof value === "object") {
			logger.warn("AI返回了非字符串类型的卡片内容:", value);
			try {
				return JSON.stringify(value);
			} catch {
				return String(value);
			}
		}

		return String(value);
	}

	protected buildContentFromLegacyFields(front: unknown, back: unknown): string {
		const normalizedFront = this.ensureString(front);
		const normalizedBack = this.ensureString(back);
		return normalizedBack ? `${normalizedFront}\n\n---div---\n\n${normalizedBack}` : normalizedFront;
	}

	protected getParsedCardContent(card: ParsedAICard): string {
		return card.content
			? this.ensureString(card.content)
			: card.front || card.back
				? this.buildContentFromLegacyFields(card.front, card.back)
				: "";
	}

	/**
	 * 生成卡片ID
	 */
	protected generateCardId(): string {
		return `ai-card-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * 估算成本（默认实现）
	 */
	protected estimateCost(promptTokens: number, completionTokens: number): number {
		const promptCost = (promptTokens / 1000) * 0.03;
		const completionCost = (completionTokens / 1000) * 0.06;

		return promptCost + completionCost;
	}

	/**
	 * 处理API错误
	 */
	protected handleError(error: unknown): AIServiceResponse {
		logger.error("AI Service Error:", error);

		const errorLike = toErrorLike(error);
		let errorMessage = "AI服务调用失败";

		if (errorLike.message) {
			errorMessage = errorLike.message;
		} else if (errorLike.response?.data?.error?.message) {
			errorMessage = errorLike.response.data.error.message;
		} else if (errorLike.status === 401) {
			errorMessage = "API密钥无效或已过期";
		} else if (errorLike.status === 429) {
			errorMessage = "AI服务触发限流/配额限制（429），请稍后再试或检查账户配额/余额";
		} else if (errorLike.status === 500) {
			errorMessage = "AI服务暂时不可用";
		}

		const loweredMessage = errorMessage.toLowerCase();

		if (
			loweredMessage.includes("429") ||
			loweredMessage.includes("rate limit") ||
			loweredMessage.includes("too many requests") ||
			loweredMessage.includes("quota") ||
			errorMessage.includes("频率") ||
			errorMessage.includes("限流")
		) {
			errorMessage =
				"AI服务触发限流/配额限制（429），请稍后再试；也可减少生成数量或检查账户配额/余额";
		}

		return {
			success: false,
			error: errorMessage,
		};
	}

	/**
	 * 分类连接测试错误，返回用户可理解的错误信息
	 * 子类在 testConnection catch 中调用后 throw
	 */
	protected classifyConnectionError(error: unknown): Error {
		const errorLike = toErrorLike(error);
		const status = errorLike.status;
		const message = errorLike.message || "";
		const loweredMessage = message.toLowerCase();

		if (
			status === 401 ||
			status === 403 ||
			loweredMessage.includes("unauthorized") ||
			loweredMessage.includes("invalid api key") ||
			loweredMessage.includes("authentication")
		) {
			return new Error("API密钥无效或已过期，请检查密钥是否正确");
		}

		if (status === 404 || loweredMessage.includes("not found")) {
			return new Error("API地址错误或服务不可达，请检查自定义URL是否正确");
		}

		if (
			status === 429 ||
			loweredMessage.includes("rate limit") ||
			loweredMessage.includes("quota") ||
			loweredMessage.includes("too many")
		) {
			return new Error("请求频率超限或配额不足，请稍后重试或检查账户余额");
		}

		if (
			(status !== undefined && status >= 500) ||
			loweredMessage.includes("internal server") ||
			loweredMessage.includes("overloaded") ||
			loweredMessage.includes("529")
		) {
			return new Error("服务端错误，AI服务暂时不可用，请稍后重试");
		}

		if (
			loweredMessage.includes("timeout") ||
			loweredMessage.includes("timed out") ||
			loweredMessage.includes("econnaborted")
		) {
			return new Error("连接超时，请检查网络连接或增加超时时间");
		}

		if (
			loweredMessage.includes("econnrefused") ||
			loweredMessage.includes("enotfound") ||
			loweredMessage.includes("network") ||
			loweredMessage.includes("fetch failed")
		) {
			return new Error("无法连接到服务器，请检查网络连接和API地址");
		}

		return new Error(message || "连接失败，请检查配置");
	}
}
