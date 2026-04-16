import type { AIServiceResponse, SystemPromptConfig } from "../../types/ai-types";
import { logger } from "../../utils/logger";
import { OpenAIService } from "./OpenAIService";
import { getModelCapabilities } from "./modelCapabilities";

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

/**
 * DeepSeek AI服务实现
 * 继承自 OpenAIService，使用 DeepSeek API 端点
 */
export class DeepSeekService extends OpenAIService {
	/**
	 * DeepSeek API 基础 URL
	 */
	protected baseUrl = "https://api.deepseek.com";

	constructor(
		apiKey: string,
		model: string,
		baseUrl?: string,
		systemPromptConfig?: SystemPromptConfig
	) {
		super(apiKey, model, baseUrl, systemPromptConfig);

		if (baseUrl) {
			this.baseUrl = baseUrl;
		}
	}

	protected buildChatCompletionBody(
		messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
		temperature: number,
		maxTokens: number,
		responseFormat?: "json_object"
	): Record<string, unknown> {
		const body = super.buildChatCompletionBody(messages, temperature, maxTokens, responseFormat);
		const capabilities = getModelCapabilities("deepseek", this.model);

		if (capabilities.omitTemperature) {
			delete body.temperature;
		}

		return body;
	}

	/**
	 * DeepSeek 成本估算
	 * 参考：https://platform.deepseek.com/pricing
	 */
	estimateCost(promptTokens: number, completionTokens: number): number {
		const promptPrice = 1.0;
		const completionPrice = 2.0;
		const promptCost = (promptTokens / 1_000_000) * promptPrice;
		const completionCost = (completionTokens / 1_000_000) * completionPrice;

		return promptCost + completionCost;
	}

	/**
	 * 测试 DeepSeek API 连接
	 */
	async testConnection(): Promise<boolean> {
		try {
			const response = await this.request({
				url: `${this.baseUrl}/models`,
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
				},
			});

			return response.status === 200;
		} catch (error) {
			throw this.classifyConnectionError(error);
		}
	}

	/**
	 * DeepSeek 特定错误处理
	 */
	protected handleError(error: unknown): AIServiceResponse {
		logger.error("DeepSeek API Error:", error);

		let errorMessage = "DeepSeek API调用失败";
		const message = getErrorMessage(error);

		if (message) {
			const loweredMessage = message.toLowerCase();

			if (message.includes("401") || loweredMessage.includes("unauthorized")) {
				errorMessage = "DeepSeek API密钥无效，请检查配置";
			} else if (message.includes("429") || loweredMessage.includes("rate limit")) {
				errorMessage = "DeepSeek API请求频率超限，请稍后重试";
			} else if (loweredMessage.includes("quota")) {
				errorMessage = "DeepSeek API配额不足";
			} else if (loweredMessage.includes("timeout")) {
				errorMessage = "DeepSeek API请求超时";
			} else {
				errorMessage = `DeepSeek API错误: ${message}`;
			}
		}

		return {
			success: false,
			error: errorMessage,
			cards: [],
		};
	}
}
