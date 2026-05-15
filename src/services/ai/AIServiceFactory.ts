/**
 * AI服务工厂
 */

import type { AIProvider, IAIService, SystemPromptConfig } from "../../types/ai-types";
import type { AIConfig } from "../../types/plugin-settings";
import { AnthropicService } from "./AnthropicService";
import { DeepSeekService } from "./DeepSeekService";
import { GeminiService } from "./GeminiService";
import { OpenAIService } from "./OpenAIService";
import { SiliconFlowService } from "./SiliconFlowService";
import { ZhipuService } from "./ZhipuService";
import { getDefaultAIModel } from "../../components/settings/constants/settings-constants";
import { resolveAIConfig, type AIConfigHost } from "./ai-host";

interface AIProviderConfig {
	apiKey: string;
	model?: string;
	baseUrl?: string;
	verified?: boolean;
	lastVerified?: string;
}

type AIConfigWithProviders = AIConfig & {
	apiKeys?: Partial<Record<AIProvider, AIProviderConfig>>;
	defaultProvider?: string;
	systemPromptConfig?: SystemPromptConfig;
};

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

function getAIConfig(host: AIConfigHost): AIConfigWithProviders | undefined {
	return resolveAIConfig(host) as AIConfigWithProviders | undefined;
}

function createService(
	provider: AIProvider,
	host: AIConfigHost,
	customModel?: string
): IAIService {
	const aiConfig = getAIConfig(host);

	if (!aiConfig) {
		throw new Error("AI配置未初始化");
	}

	const providerConfig = aiConfig.apiKeys?.[provider];

	if (!providerConfig?.apiKey) {
		throw new Error(`${provider} API密钥未配置`);
	}

	const customBaseUrl = providerConfig.baseUrl;
	const systemPromptConfig = aiConfig.systemPromptConfig;
	const modelToUse = customModel || providerConfig.model || getDefaultAIModel(provider);

	if (!modelToUse) {
		throw new Error(
			`${provider} model未配置，请在 [插件设置 > AI服务] 中为该 provider 设置默认 model，或在 AI 功能中指定 model`
		);
	}

	switch (provider) {
		case "openai":
			return new OpenAIService(
				providerConfig.apiKey,
				modelToUse,
				customBaseUrl,
				systemPromptConfig
			);

		case "zhipu":
			return new ZhipuService(providerConfig.apiKey, modelToUse, customBaseUrl, systemPromptConfig);

		case "deepseek":
			return new DeepSeekService(
				providerConfig.apiKey,
				modelToUse,
				customBaseUrl,
				systemPromptConfig
			);

		case "gemini":
			return new GeminiService(
				providerConfig.apiKey,
				modelToUse,
				customBaseUrl,
				systemPromptConfig
			);

		case "anthropic":
			return new AnthropicService(
				providerConfig.apiKey,
				modelToUse,
				customBaseUrl,
				systemPromptConfig
			);

		case "siliconflow":
			return new SiliconFlowService(
				providerConfig.apiKey,
				modelToUse,
				customBaseUrl,
				systemPromptConfig
			);

		case "xai":
			return new OpenAIService(
				providerConfig.apiKey,
				modelToUse,
				customBaseUrl || "https://api.x.ai/v1",
				systemPromptConfig
			);

		default:
			throw new Error(`不支持的AI服务提供商: ${provider}`);
	}
}

function getDefaultService(host: AIConfigHost): IAIService {
	const aiConfig = getAIConfig(host);

	if (!aiConfig) {
		throw new Error("AI配置未初始化");
	}

	const provider = isAIProvider(aiConfig.defaultProvider) ? aiConfig.defaultProvider : "zhipu";

	return createService(provider, host);
}

export const AIServiceFactory = {
	createService,
	getDefaultService,
};
