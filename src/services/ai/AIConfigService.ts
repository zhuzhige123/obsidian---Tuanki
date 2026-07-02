/**
 * AI 配置统一读写层：合并默认值、解析默认服务商、补丁式更新（避免覆盖 apiKeys）。
 */

import {
	DEFAULT_AI_CONFIG,
	DEFAULT_API_URLS,
	type AIProvider,
} from "../../components/settings/constants/settings-constants";
import type { WeavePlugin } from "../../main";
import type { AIAction } from "../../types/ai-types";
import { AI_SECRET_STORAGE_PROVIDERS } from "./ai-secret-storage";
import { configureAIRequestPolicy } from "./ai-request-policy";

export type PersistedAIConfig = NonNullable<WeavePlugin["settings"]["aiConfig"]>;

export const AI_PROVIDERS: readonly AIProvider[] = AI_SECRET_STORAGE_PROVIDERS as readonly AIProvider[];

export function isKnownAIProvider(value: string | undefined | null): value is AIProvider {
	return !!value && (AI_PROVIDERS as readonly string[]).includes(value);
}

export function mergeAIConfigWithDefaults(
	existing?: Partial<PersistedAIConfig> | null
): PersistedAIConfig {
	const defaultConfig = JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG)) as PersistedAIConfig;

	if (!existing) {
		return defaultConfig;
	}

	return {
		...defaultConfig,
		...existing,
		apiKeys: {
			...defaultConfig.apiKeys,
			...existing.apiKeys,
		},
		globalParams: {
			...defaultConfig.globalParams,
			...(existing.globalParams ?? {}),
		},
		cardSplitting: {
			...defaultConfig.cardSplitting,
			...(existing.cardSplitting ?? {}),
		},
		systemPromptConfig: {
			...defaultConfig.systemPromptConfig,
			...(existing.systemPromptConfig ?? {}),
		},
		formatting: {
			...defaultConfig.formatting,
			...(existing.formatting ?? {}),
		},
		promptTemplates: existing.promptTemplates ?? defaultConfig.promptTemplates,
	} as PersistedAIConfig;
}

export function ensureAIConfig(plugin: WeavePlugin): PersistedAIConfig {
	plugin.settings.aiConfig = mergeAIConfigWithDefaults(plugin.settings.aiConfig);
	return plugin.settings.aiConfig;
}

export function resolveDefaultAIProvider(
	aiConfig?: Partial<PersistedAIConfig> | null
): AIProvider {
	if (isKnownAIProvider(aiConfig?.defaultProvider)) {
		return aiConfig.defaultProvider;
	}

	if (isKnownAIProvider(aiConfig?.lastUsedProvider)) {
		return aiConfig.lastUsedProvider;
	}

	return DEFAULT_AI_CONFIG.defaultProvider;
}

export function resolveSettingsSelectedProvider(
	aiConfig?: Partial<PersistedAIConfig> | null
): AIProvider {
	if (isKnownAIProvider(aiConfig?.lastUsedProvider)) {
		return aiConfig.lastUsedProvider;
	}

	return resolveDefaultAIProvider(aiConfig);
}

export type AIGlobalParamKey = keyof NonNullable<PersistedAIConfig["globalParams"]>;

export function clampAIGlobalParam(key: AIGlobalParamKey, rawValue: number): number {
	const defaults = DEFAULT_AI_CONFIG.globalParams;

	if (!Number.isFinite(rawValue)) {
		return defaults[key];
	}

	switch (key) {
		case "temperature":
			return Math.min(2, Math.max(0, rawValue));
		case "maxTokens":
			return Math.min(64000, Math.max(256, Math.round(rawValue)));
		case "requestTimeout":
			return Math.min(600, Math.max(5, Math.round(rawValue)));
		case "concurrentLimit":
			return Math.min(10, Math.max(1, Math.round(rawValue)));
		default:
			return defaults[key];
	}
}

export function readAIGlobalGenerationDefaults(
	aiConfig?: Partial<PersistedAIConfig> | null
): { temperature: number; maxTokens: number } {
	const defaults = DEFAULT_AI_CONFIG.globalParams;

	return {
		temperature: aiConfig?.globalParams?.temperature ?? defaults.temperature,
		maxTokens: aiConfig?.globalParams?.maxTokens ?? defaults.maxTokens,
	};
}

export interface AIChatParamOverrides {
	temperature?: number;
	maxTokens?: number;
}

export interface AIChatParamOptions {
	/** 拆分等长输出任务：在全局 maxTokens 基础上至少使用该值 */
	minMaxTokens?: number;
}

/** 动作级覆盖 > 插件设置全局参数；结果会钳制到合法范围 */
export function resolveAIChatRequestParams(
	aiConfig?: Partial<PersistedAIConfig> | null,
	overrides?: AIChatParamOverrides,
	options?: AIChatParamOptions
): { temperature: number; maxTokens: number } {
	const global = readAIGlobalGenerationDefaults(aiConfig);
	let maxTokens = overrides?.maxTokens ?? global.maxTokens;

	if (options?.minMaxTokens !== undefined) {
		maxTokens = Math.max(maxTokens, options.minMaxTokens);
	}

	return {
		temperature: clampAIGlobalParam(
			"temperature",
			overrides?.temperature ?? global.temperature
		),
		maxTokens: clampAIGlobalParam("maxTokens", maxTokens),
	};
}

/** 卡片拆分单次请求建议的最小 maxTokens（在全局参数之上保底） */
export const AI_SPLIT_CHAT_MIN_MAX_TOKENS = 4000;

export function normalizeProviderBaseUrl(
	provider: AIProvider,
	url?: string | null
): string | undefined {
	const trimmed = typeof url === "string" ? url.trim().replace(/\/+$/, "") : "";
	if (!trimmed) {
		return undefined;
	}

	const defaultUrl = DEFAULT_API_URLS[provider]?.replace(/\/+$/, "");
	if (defaultUrl && trimmed === defaultUrl) {
		return undefined;
	}

	return trimmed;
}

export function setActiveAIProvider(aiConfig: PersistedAIConfig, provider: AIProvider): void {
	aiConfig.defaultProvider = provider;
	aiConfig.lastUsedProvider = provider;
}

export function patchCustomAIActions(
	aiConfig: PersistedAIConfig,
	patch: {
		customFormatActions?: AIAction[];
		customSplitActions?: AIAction[];
	}
): void {
	if (patch.customFormatActions !== undefined) {
		aiConfig.customFormatActions = patch.customFormatActions;
	}

	if (patch.customSplitActions !== undefined) {
		aiConfig.customSplitActions = patch.customSplitActions;
	}
}

export function readAIRequestPolicy(aiConfig?: Partial<PersistedAIConfig> | null): {
	requestTimeoutSeconds: number;
	concurrentLimit: number;
} {
	const defaults = DEFAULT_AI_CONFIG.globalParams;

	return {
		requestTimeoutSeconds: aiConfig?.globalParams?.requestTimeout ?? defaults.requestTimeout,
		concurrentLimit: aiConfig?.globalParams?.concurrentLimit ?? defaults.concurrentLimit,
	};
}

export function applyAIRequestPolicyFromSettings(plugin: WeavePlugin): void {
	configureAIRequestPolicy(readAIRequestPolicy(plugin.settings.aiConfig));
}
