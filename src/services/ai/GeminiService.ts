import type {
	AIServiceResponse,
	GeneratedCard,
	GenerationConfig,
	GenerationProgress,
	RegenerateRequest,
	SplitCardRequest,
	SplitCardResponse,
	SystemPromptConfig,
} from "../../types/ai-types";
import { logger } from "../../utils/logger";
import { AIService, type ChatRequest, type ChatResponse } from "./AIService";

interface GeminiUsageMetadata {
	promptTokenCount?: number;
	candidatesTokenCount?: number;
	totalTokenCount?: number;
}

interface GeminiContentPart {
	text?: string;
}

interface GeminiCandidate {
	content?: {
		parts?: GeminiContentPart[];
	};
}

interface GeminiResponsePayload {
	candidates?: GeminiCandidate[];
	usageMetadata?: GeminiUsageMetadata;
}

/**
 * Google Gemini AI服务实现
 * API文档: https://ai.google.dev/api/rest
 */
export class GeminiService extends AIService {
	protected baseUrl = "https://generativelanguage.googleapis.com/v1beta";

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
				message: "正在调用Gemini服务...",
			});

			const response = await this.request({
				url: `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					contents: [
						{
							parts: [
								{
									text: `${systemPrompt}\n\n${userPrompt}`,
								},
							],
						},
					],
					generationConfig: {
						temperature: config.temperature,
						maxOutputTokens: config.maxTokens,
						responseMimeType: "application/json",
					},
				}),
			});

			onProgress?.({
				status: "parsing",
				progress: 90,
				message: "解析生成结果...",
			});

			const data = response.json as GeminiResponsePayload;
			if (!data.candidates || data.candidates.length === 0) {
				throw new Error("Gemini未返回有效内容");
			}

			const generatedText = data.candidates[0]?.content?.parts?.[0]?.text;
			if (!generatedText) {
				throw new Error("Gemini未返回有效内容");
			}

			let parsedCards = this.parseResponse(generatedText);
			if (parsedCards.length > config.cardCount) {
				logger.debug(
					`[Gemini] AI returned ${parsedCards.length} cards, truncating to requested ${config.cardCount}`
				);
				parsedCards = parsedCards.slice(0, config.cardCount);
			}

			const cards: GeneratedCard[] = parsedCards.map((card) => {
				const normalizedContent = this.getParsedCardContent(card);

				return {
					uuid: this.generateCardId(),
					type: card.type || "qa",
					content: normalizedContent,
					tags: card.tags || [],
					images: card.images || [],
					explanation: card.explanation,
					metadata: {
						generatedAt: new Date().toISOString(),
						provider: "gemini",
						model: this.model,
						temperature: config.temperature,
					},
				};
			});

			onProgress?.({
				status: "completed",
				progress: 100,
				message: `成功生成${cards.length}张卡片`,
			});

			const usage = data.usageMetadata;
			const promptTokens = usage?.promptTokenCount || 0;
			const completionTokens = usage?.candidatesTokenCount || 0;

			return {
				success: true,
				cards,
				usage: {
					promptTokens,
					completionTokens,
					totalTokens: usage?.totalTokenCount || 0,
					estimatedCost: this.estimateCost(promptTokens, completionTokens),
				},
			};
		} catch (error) {
			return this.handleError(error);
		}
	}

	estimateCost(promptTokens: number, completionTokens: number): number {
		const promptPrice = 0.00025;
		const completionPrice = 0.0005;

		return (promptTokens / 1000) * promptPrice + (completionTokens / 1000) * completionPrice;
	}

	async testConnection(): Promise<boolean> {
		try {
			const response = await this.request({
				url: `${this.baseUrl}/models?key=${this.apiKey}`,
				method: "GET",
			});

			return response.status === 200;
		} catch (error) {
			throw this.classifyConnectionError(error);
		}
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		try {
			const contents = request.messages
				.filter((message) => message.role !== "system")
				.map((message) => ({
					role: message.role === "assistant" ? "model" : "user",
					parts: [{ text: message.content }],
				}));

			const systemMessage = request.messages.find((message) => message.role === "system");
			if (systemMessage && contents.length > 0 && contents[0]?.role === "user") {
				const currentText = contents[0].parts[0]?.text || "";
				contents[0].parts[0].text = `${systemMessage.content}\n\n${currentText}`;
			}

			const response = await this.request({
				url: `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents,
					generationConfig: {
						temperature: request.temperature ?? 0.7,
						maxOutputTokens: request.maxTokens ?? 2000,
					},
				}),
			});

			const data = response.json as GeminiResponsePayload;
			const message = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

			if (!message) {
				throw new Error("Gemini未返回有效内容");
			}

			return {
				success: true,
				content: message,
				model: this.model,
			};
		} catch (error) {
			logger.error("Gemini chat error:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Gemini调用失败",
			};
		}
	}

	protected handleError(error: unknown): AIServiceResponse {
		logger.error("Gemini API Error:", error);

		const sourceMessage = error instanceof Error ? error.message : String(error ?? "");
		let errorMessage = "Gemini API调用失败";

		if (sourceMessage.includes("API_KEY_INVALID") || sourceMessage.includes("401")) {
			errorMessage = "Gemini API密钥无效，请检查配置";
		} else if (sourceMessage.includes("QUOTA_EXCEEDED") || sourceMessage.includes("429")) {
			errorMessage = "Gemini API配额超限，请稍后重试";
		} else if (sourceMessage.includes("SAFETY")) {
			errorMessage = "Gemini安全过滤器触发，请调整内容";
		} else if (sourceMessage.includes("timeout")) {
			errorMessage = "Gemini API请求超时";
		} else if (sourceMessage) {
			errorMessage = `Gemini API错误: ${sourceMessage}`;
		}

		return {
			success: false,
			error: errorMessage,
			cards: [],
		};
	}

	protected generateCardId(): string {
		return `gemini-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
	}

	async regenerateCard(
		_request: RegenerateRequest,
		_config: GenerationConfig
	): Promise<AIServiceResponse> {
		return {
			success: false,
			error: "Gemini服务暂不支持单卡重新生成",
		};
	}

	async splitParentCard(_request: SplitCardRequest): Promise<SplitCardResponse> {
		return {
			success: false,
			error: "Gemini服务暂不支持卡片拆分",
		};
	}

}
