import { logger } from "../../utils/logger";
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
import { generateCardUUID } from "../identifier/WeaveIDGenerator";
import { AIService, type ChatRequest, type ChatResponse } from "./AIService";

export class OpenAIService extends AIService {
	protected baseUrl = "https://api.openai.com/v1";

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
		const body: Record<string, unknown> = {
			model: this.model,
			messages,
			temperature,
			max_tokens: maxTokens,
		};

		if (responseFormat) {
			body.response_format = { type: responseFormat };
		}

		return body;
	}

	private extractChoicePayload(data: any): { content: string; usage: any } {
		const choice = data?.choices?.[0];
		const finishReason = choice?.finish_reason;

		if (finishReason === "length") {
			throw new Error("AI 返回内容被截断，请减少生成数量、缩短原文，或提高最大 tokens");
		}

		const content = this.extractMessageContent(choice?.message?.content);

		if (!content) {
			throw new Error("AI 返回为空，可能是模型在 JSON 模式下没有给出最终内容，请稍后重试或切换模型");
		}

		return {
			content,
			usage: data?.usage || {},
		};
	}

	async generateCards(
		content: string,
		config: GenerationConfig,
		onProgress?: (progress: GenerationProgress) => void
	): Promise<AIServiceResponse> {
		let progressInterval: number | null = null;
		try {
			onProgress?.({
				status: "preparing",
				progress: 15,
				message: "准备生成卡片...",
			});

			const systemPrompt = this.buildSystemPrompt(config);
			const userPrompt = this.buildUserPrompt(content, config.promptTemplate);

			onProgress?.({
				status: "generating",
				progress: 25,
				message: "正在调用 AI 服务...",
			});

			progressInterval = window.setInterval(() => {
				if (!onProgress) {
					return;
				}
				onProgress({
					status: "generating",
					progress: Math.min(85, 25 + Math.random() * 5),
					message: `AI 正在处理中...（${config.cardCount} 张卡片）`,
				});
			}, 500);

			const response = await this.request({
				url: `${this.baseUrl}/chat/completions`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(
					this.buildChatCompletionBody(
						[
							{ role: "system", content: systemPrompt },
							{ role: "user", content: userPrompt },
						],
						config.temperature,
						config.maxTokens,
						"json_object"
					)
				),
			});

			if (progressInterval !== null) {
				clearInterval(progressInterval);
				progressInterval = null;
			}

			onProgress?.({
				status: "parsing",
				progress: 90,
				message: "解析生成结果...",
			});

			const { content: contentText, usage } = this.extractChoicePayload(response.json);
			let parsedCards = this.parseResponse(contentText);

			if (parsedCards.length > config.cardCount) {
				logger.debug(
					`[OpenAI] AI returned ${parsedCards.length} cards, truncating to requested ${config.cardCount}`
				);
				parsedCards = parsedCards.slice(0, config.cardCount);
			}

			const cards: GeneratedCard[] = parsedCards.map((card) => ({
				uuid: generateCardUUID(),
				type: card.type || "qa",
				content: this.getParsedCardContent(card),
				tags: card.tags || [],
				images: card.images || [],
				explanation: card.explanation,
				sourceText: card.sourceText ? this.ensureString(card.sourceText) : undefined,
				metadata: {
					generatedAt: new Date().toISOString(),
					provider: "openai",
					model: this.model,
					temperature: config.temperature,
				},
			}));

			onProgress?.({
				status: "completed",
				progress: 100,
				message: `成功生成 ${cards.length} 张卡片`,
			});

			return {
				success: true,
				cards,
				usage: {
					promptTokens: usage.prompt_tokens || 0,
					completionTokens: usage.completion_tokens || 0,
					totalTokens: usage.total_tokens || 0,
					estimatedCost: this.estimateCost(
						usage.prompt_tokens || 0,
						usage.completion_tokens || 0
					),
				},
			};
		} catch (error) {
			onProgress?.({
				status: "failed",
				progress: 0,
				message: "生成失败",
			});
			return this.handleError(error);
		} finally {
			if (progressInterval !== null) {
				clearInterval(progressInterval);
			}
		}
	}

	async regenerateCard(
		request: RegenerateRequest,
		config: GenerationConfig
	): Promise<AIServiceResponse> {
		try {
			const systemPrompt = [
				"你是一名学习卡片生成助手。",
				"请根据用户的修改要求，重新生成 1 张卡片。",
				"保持与原卡片一致的结构，并只返回 JSON。",
				"原卡片类型：" + request.originalCard.type,
				"原卡片内容：" + request.originalCard.content,
			].join("\n");

			const response = await this.request({
				url: `${this.baseUrl}/chat/completions`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(
					this.buildChatCompletionBody(
						[
							{ role: "system", content: systemPrompt },
							{ role: "user", content: request.instruction },
						],
						config.temperature,
						config.maxTokens,
						"json_object"
					)
				),
			});

			const { content: contentText, usage } = this.extractChoicePayload(response.json);
			const parsedCards = this.parseResponse(contentText);

			if (parsedCards.length === 0) {
				throw new Error("未能生成新卡片");
			}

			const card = parsedCards[0];
			const newCard: GeneratedCard = {
				uuid: request.cardId,
				type: card.type || request.originalCard.type,
				content: this.getParsedCardContent(card),
				tags: card.tags || [],
				images: card.images || [],
				explanation: card.explanation,
				metadata: {
					generatedAt: new Date().toISOString(),
					provider: "openai",
					model: this.model,
					temperature: config.temperature,
				},
			};

			return {
				success: true,
				cards: [newCard],
				usage: {
					promptTokens: usage.prompt_tokens || 0,
					completionTokens: usage.completion_tokens || 0,
					totalTokens: usage.total_tokens || 0,
					estimatedCost: this.estimateCost(
						usage.prompt_tokens || 0,
						usage.completion_tokens || 0
					),
				},
			};
		} catch (error) {
			return this.handleError(error);
		}
	}

	async splitParentCard(request: SplitCardRequest): Promise<SplitCardResponse> {
		try {
			const systemPrompt = [
				"你是一名学习卡片拆分助手。",
				"请把父卡拆成多张独立子卡，并只返回 {\"cards\":[...]} JSON。",
			].join("\n");
			const userPrompt = [
				"请拆分以下卡片：",
				`正面：${request.content.front}`,
				`背面：${request.content.back}`,
				request.instruction ? `额外要求：\n${request.instruction}` : "",
			].filter(Boolean).join("\n");

			const response = await this.request({
				url: `${this.baseUrl}/chat/completions`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(
					this.buildChatCompletionBody(
						[
							{ role: "system", content: systemPrompt },
							{ role: "user", content: userPrompt },
						],
						0.7,
						3000,
						"json_object"
					)
				),
			});

			const { content: contentText, usage } = this.extractChoicePayload(response.json);
			const parsed = JSON.parse(contentText) as { cards?: Array<Record<string, unknown>> };
			const childCards = parsed.cards || [];

			if (!Array.isArray(childCards) || childCards.length === 0) {
				throw new Error("AI 未能生成有效的子卡片");
			}

			return {
				success: true,
				childCards: childCards.map((card) => ({
					front: this.ensureString(card.front),
					back: this.ensureString(card.back),
					tags: Array.isArray(card.tags) ? (card.tags as string[]) : [],
					explanation: card.explanation ? this.ensureString(card.explanation) : undefined,
				})),
				usage: {
					promptTokens: usage.prompt_tokens || 0,
					completionTokens: usage.completion_tokens || 0,
					totalTokens: usage.total_tokens || 0,
					estimatedCost: this.estimateCost(
						usage.prompt_tokens || 0,
						usage.completion_tokens || 0
					),
				},
			};
		} catch (error) {
			logger.error("OpenAI splitParentCard error:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "拆分卡片失败",
			};
		}
	}

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

	async chat(request: ChatRequest): Promise<ChatResponse> {
		try {
			const response = await this.request({
				url: `${this.baseUrl}/chat/completions`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(
					this.buildChatCompletionBody(
						request.messages,
						request.temperature ?? 0.7,
						request.maxTokens ?? 2000,
						request.responseFormat
					)
				),
			});

			const { content, usage } = this.extractChoicePayload(response.json);
			return {
				success: true,
				content,
				model: this.model,
				tokensUsed: usage.total_tokens || 0,
				cost: this.estimateCost(usage.prompt_tokens || 0, usage.completion_tokens || 0),
			};
		} catch (error) {
			logger.error("OpenAI chat error:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "OpenAI 调用失败",
			};
		}
	}
}
