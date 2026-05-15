/**
 * AI驱动的卡片格式化服务
 * 使用真实AI模型进行智能格式规范化
 */

import type { Card, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import {
	OFFICIAL_CHOICE_FORMATTER_SYSTEM_PROMPT,
	OFFICIAL_CHOICE_FORMATTER_USER_PROMPT_TEMPLATE,
} from "../../constants/official-format-actions";
import type { AIProvider, CustomFormatAction, FormatPreviewResult } from "../../types/ai-types";
import type { ParseTemplate } from "../../types/newCardParsingTypes";
import type { AIConfig } from "../../types/plugin-settings";
import { logger } from "../../utils/logger";
import { AIServiceFactory } from "./AIServiceFactory";
import { PromptVariableResolver } from "./PromptVariableResolver";

export interface FormatRequest {
	content: string;
	formatType: "choice";
}

export interface FormatResponse {
	success: boolean;
	formattedContent?: string;
	error?: string;
	provider?: AIProvider;
	model?: string;
}

interface AIProviderConfig {
	apiKey: string;
	model?: string;
	baseUrl?: string;
	verified?: boolean;
	lastVerified?: string;
}

type AIConfigWithFormattingProvider = AIConfig & {
	apiKeys?: Partial<Record<AIProvider, AIProviderConfig>>;
	formattingProvider?: string;
};

type LegacyAIConfig = AIConfig & {
	formattingProvider?: string;
};

type FormatContext = { template?: ParseTemplate; deck?: Deck };

const AI_PROVIDERS: AIProvider[] = [
	"openai",
	"gemini",
	"anthropic",
	"deepseek",
	"zhipu",
	"siliconflow",
	"xai",
];

const variableResolver = new PromptVariableResolver();

function isAIProvider(value?: string): value is AIProvider {
	return value !== undefined && AI_PROVIDERS.includes(value as AIProvider);
}

function getAIConfig(plugin: WeavePlugin): AIConfig | undefined {
	return plugin.settings.aiConfig as AIConfig | undefined;
}

function getLegacyFormattingProvider(aiConfig: AIConfig | undefined): string | undefined {
	return (aiConfig as LegacyAIConfig | undefined)?.formattingProvider;
}

function getProviderConfig(
	aiConfig: AIConfig,
	provider: AIProvider
): AIProviderConfig | undefined {
	return (aiConfig.apiKeys as Partial<Record<AIProvider, AIProviderConfig>> | undefined)?.[provider];
}

function cleanAIResponse(content: string): string {
	if (!content) {
		return "";
	}

	let cleaned = content.trim();
	const codeBlockRegex = /^```(?:markdown|md|text|)?\s*\n?([\s\S]*?)\n?```$/;
	const match = cleaned.match(codeBlockRegex);

	if (match) {
		cleaned = match[1].trim();
	}

	return cleaned.replace(/\n{3,}/g, "\n\n");
}

function validateChoiceFormat(content: string): {
	isValid: boolean;
	reason?: string;
} {
	if (!content.includes("Q:") && !content.includes("q:")) {
		return { isValid: false, reason: "缺少问题部分（Q:）" };
	}

	const optionsMatch = content.match(/^[A-Z][\)\.．、）]\s*/gm);
	if (!optionsMatch || optionsMatch.length < 2) {
		return { isValid: false, reason: "选项数量不足（至少需要2个）" };
	}

	return { isValid: true };
}

async function formatWithCustomAction(
	action: CustomFormatAction,
	card: Card,
	context: FormatContext,
	plugin: WeavePlugin
): Promise<FormatPreviewResult> {
	try {
		const aiConfig = getAIConfig(plugin);

		if (!aiConfig?.formatting?.enabled) {
			return {
				success: false,
				originalContent: card.content || "",
				error: "AI格式化功能未启用",
			};
		}

		const provider =
			action.provider ||
			(isAIProvider(aiConfig.defaultProvider) ? aiConfig.defaultProvider : undefined);

		if (!provider) {
			return {
				success: false,
				originalContent: card.content || "",
				error: "未设置AI提供商",
			};
		}

		const providerConfig = getProviderConfig(aiConfig, provider);
		if (!providerConfig?.apiKey) {
			return {
				success: false,
				originalContent: card.content || "",
				error: `AI提供商"${provider}"未配置API密钥，请前往 [插件设置 > AI服务] 进行配置`,
			};
		}

		const systemPrompt = variableResolver.resolve(action.systemPrompt, card, context);
		const userPrompt = variableResolver.resolve(action.userPromptTemplate, card, context);
		const aiService = AIServiceFactory.createService(provider, plugin, action.model);
		const response = await aiService.chat({
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			],
			temperature: action.temperature ?? 0.1,
			maxTokens: action.maxTokens ?? 2000,
		});

		if (!response.success || !response.content) {
			return {
				success: false,
				originalContent: card.content || "",
				error: response.error || "AI格式化失败",
			};
		}

		return {
			success: true,
			originalContent: card.content || "",
			formattedContent: cleanAIResponse(response.content),
			provider,
			model: response.model,
		};
	} catch (error) {
		logger.error("[AIFormatterService] Error:", error);
		return {
			success: false,
			originalContent: card.content || "",
			error: error instanceof Error ? error.message : "未知错误",
		};
	}
}

async function formatChoiceQuestion(
	request: FormatRequest,
	plugin: WeavePlugin
): Promise<FormatResponse> {
	try {
		const aiConfig = getAIConfig(plugin);

		if (!aiConfig?.formatting?.enabled) {
			return {
				success: false,
				error: "AI格式化功能未启用，请在设置中开启",
			};
		}

		const legacyFormattingProvider = getLegacyFormattingProvider(aiConfig);
		const provider: AIProvider | undefined =
			(isAIProvider(legacyFormattingProvider) ? legacyFormattingProvider : undefined) ||
			(isAIProvider(aiConfig.defaultProvider) ? aiConfig.defaultProvider : undefined);

		if (!provider) {
			return {
				success: false,
				error: "未设置AI提供商，请在设置中配置",
			};
		}

		const providerConfig = getProviderConfig(aiConfig, provider);
		if (!providerConfig?.apiKey) {
			return {
				success: false,
				error: `格式化AI提供商"${provider}"未配置API密钥，请在设置中配置`,
			};
		}

		const aiService = AIServiceFactory.createService(provider, plugin, providerConfig.model);
		const response = await aiService.chat({
			messages: [
				{ role: "system", content: OFFICIAL_CHOICE_FORMATTER_SYSTEM_PROMPT },
				{
					role: "user",
					content: OFFICIAL_CHOICE_FORMATTER_USER_PROMPT_TEMPLATE.replace(
						"{{cardContent}}",
						request.content
					),
				},
			],
			temperature: 0.1,
			maxTokens: 2000,
		});

		if (!response.success || !response.content) {
			logger.error("[AIFormatterService] AI调用失败:", response.error);
			return {
				success: false,
				error: response.error || "AI格式化失败",
			};
		}

		const formattedContent = cleanAIResponse(response.content);
		const validation = validateChoiceFormat(formattedContent);

		if (!validation.isValid) {
			logger.error("[AIFormatterService] 格式验证失败:", validation.reason);
			return {
				success: false,
				error: `格式化结果不符合规范：${validation.reason}`,
			};
		}

		return {
			success: true,
			formattedContent,
			provider,
			model: response.model,
		};
	} catch (error) {
		logger.error("[AIFormatterService] Error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "未知错误",
		};
	}
}

export const AIFormatterService = {
	formatWithCustomAction,
	formatChoiceQuestion,
};
