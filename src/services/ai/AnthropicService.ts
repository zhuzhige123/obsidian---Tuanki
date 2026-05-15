import { logger } from "../../utils/logger";
/**
 * Anthropic Claude AI服务实现
 * API文档: https://docs.anthropic.com/claude/reference
 */

import type {
	AIServiceResponse,
	GeneratedCard,
	GenerationConfig,
	GenerationProgress,
	SystemPromptConfig,
} from "../../types/ai-types";
import { AIService } from "./AIService";

function getErrorMessage(error: unknown): string | undefined {
	if (typeof error === "string") {
		return error;
	}

	if (typeof error === "object" && error !== null) {
		const errorWithMessage = error as { message?: unknown };

		if (typeof errorWithMessage.message === "string") {
			return errorWithMessage.message;
		}
	}

	return undefined;
}

export class AnthropicService extends AIService {
	protected baseUrl = "https://api.anthropic.com/v1"; // 默认官方地址

	constructor(
		apiKey: string,
		model: string,
		baseUrl?: string,
		systemPromptConfig?: SystemPromptConfig
	) {
		super(apiKey, model, baseUrl, systemPromptConfig);
		// 如果提供了自定义 baseUrl，则覆盖默认值
		if (baseUrl) {
			this.baseUrl = baseUrl;
		}
	}

	async generateCards(
		content: string,
		config: GenerationConfig,
		onProgress?: (progress: GenerationProgress) => void
	): Promise<AIServiceResponse> {
		try {
			onProgress?.({
				status: "preparing",
				progress: 10,
				message: "准备生成卡片...",
			});

			const systemPrompt = this.buildSystemPrompt(config);
			const userPrompt = this.buildUserPrompt(content, config.promptTemplate);

			onProgress?.({
				status: "generating",
				progress: 25,
				message: "正在调用Claude服务...",
			});

			// Claude API 格式
			const response = await this.request({
				url: `${this.baseUrl}/messages`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: this.model,
					max_tokens: config.maxTokens,
					temperature: config.temperature,
					system: systemPrompt,
					messages: [
						{
							role: "user",
							content: userPrompt,
						},
					],
				}),
			});

			onProgress?.({
				status: "parsing",
				progress: 90,
				message: "解析生成结果...",
			});

			const data = response.json;

			// Claude 响应格式
			if (!data.content || data.content.length === 0) {
				throw new Error("Claude未返回有效内容");
			}

			const content_text = data.content[0].text;
			let parsedCards = this.parseResponse(content_text);

			// 截断：AI返回数量可能超出请求，只取需要的数量
			if (parsedCards.length > config.cardCount) {
				logger.debug(
					`[Anthropic] AI returned ${parsedCards.length} cards, truncating to requested ${config.cardCount}`
				);
				parsedCards = parsedCards.slice(0, config.cardCount);
			}

			// 转换为GeneratedCard格式
			const cards: GeneratedCard[] = parsedCards.map((card) => {
				const content = this.getParsedCardContent(card);

				return {
					uuid: this.generateCardId(),
					type: card.type || "qa",
					content,
					tags: card.tags || [],
					images: card.images || [],
					explanation: card.explanation,
					// 块链接溯源信息
					metadata: {
						generatedAt: new Date().toISOString(),
						provider: "anthropic",
						model: this.model,
						temperature: config.temperature,
					},
				} as GeneratedCard;
			});

			onProgress?.({
				status: "completed",
				progress: 100,
				message: `成功生成${cards.length}张卡片`,
			});

			return {
				success: true,
				cards,
				usage: {
					promptTokens: data.usage?.input_tokens || 0,
					completionTokens: data.usage?.output_tokens || 0,
					totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
					estimatedCost: this.estimateCost(
						data.usage?.input_tokens || 0,
						data.usage?.output_tokens || 0
					),
				},
			};
		} catch (error) {
			return this.handleError(error);
		}
	}

	estimateCost(promptTokens: number, completionTokens: number): number {
		// Claude 3.5 Sonnet 定价（美元，2024年价格）
		// 输入: $3 / 1M tokens
		// 输出: $15 / 1M tokens
		let PROMPT_PRICE = 3.0;
		let COMPLETION_PRICE = 15.0;

		// Claude 3 Opus 更贵
		if (this.model.includes("opus")) {
			PROMPT_PRICE = 15.0;
			COMPLETION_PRICE = 75.0;
		}

		const promptCost = (promptTokens / 1_000_000) * PROMPT_PRICE;
		const completionCost = (completionTokens / 1_000_000) * COMPLETION_PRICE;

		return promptCost + completionCost;
	}

	async testConnection(): Promise<boolean> {
		try {
			// Claude 不提供 models 端点，使用简单请求测试
			const response = await this.request({
				url: `${this.baseUrl}/messages`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: this.model,
					max_tokens: 10,
					messages: [
						{
							role: "user",
							content: "test",
						},
					],
				}),
			});

			return response.status === 200;
		} catch (error) {
			throw this.classifyConnectionError(error);
		}
	}

	/**
	 * 通用对话接口
	 */
	async chat(
		request: import("./AIService").ChatRequest
	): Promise<import("./AIService").ChatResponse> {
		try {
			// 提取system消息
			const systemMessage = request.messages.find((m) => m.role === "system");
			const conversationMessages = request.messages.filter((m) => m.role !== "system");

			const response = await this.request({
				url: `${this.baseUrl}/messages`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: this.model,
					messages: conversationMessages,
					system: systemMessage?.content,
					temperature: request.temperature ?? 0.7,
					max_tokens: request.maxTokens ?? 2000,
				}),
			});

			const data = response.json;
			const content = data.content?.[0]?.text;

			if (!content) {
				throw new Error("Claude未返回有效内容");
			}

			return {
				success: true,
				content: content.trim(),
				model: this.model,
				tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
			};
		} catch (error) {
			logger.error("Anthropic chat error:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Claude调用失败",
			};
		}
	}

	protected handleError(rawError: unknown): AIServiceResponse {
		logger.error("Anthropic API Error:", rawError);
		const message = getErrorMessage(rawError);
		const error = { message: message ?? "" };

		let errorMessage = "Claude API调用失败";

		if (message) {
			if (message.includes("authentication") || message.includes("401")) {
				errorMessage = "Claude API密钥无效，请检查配置";
			} else if (message.includes("rate_limit") || message.includes("429")) {
				errorMessage = "Claude API请求频率超限，请稍后重试";
			} else if (message.includes("overloaded") || message.includes("529")) {
				errorMessage = "Claude服务器过载，请稍后重试";
			} else if (message.includes("timeout")) {
				errorMessage = "Claude API请求超时";
			} else {
				errorMessage = `Claude API错误: ${error.message}`;
			}
		}

		return {
			success: false,
			error: errorMessage,
			cards: [],
		};
	}

	protected generateCardId(): string {
		return `claude-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * 重新生成单张卡片（暂未实现）
	 */
	async regenerateCard(
		_request: import("../../types/ai-types").RegenerateRequest,
		_config: import("../../types/ai-types").GenerationConfig
	): Promise<import("../../types/ai-types").AIServiceResponse> {
		return {
			success: false,
			error: "Anthropic服务暂不支持单卡重新生成",
		};
	}

	/**
	 * 拆分父卡片为多个子卡片（暂未实现）
	 */
	async splitParentCard(
		_request: import("../../types/ai-types").SplitCardRequest
	): Promise<import("../../types/ai-types").SplitCardResponse> {
		return {
			success: false,
			error: "Anthropic服务暂不支持卡片拆分",
		};
	}

}
