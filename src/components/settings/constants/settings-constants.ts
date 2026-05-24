/**
 * 设置界面相关的常量定义
 * 消除硬编码，提供统一的配置管理
 */

import { i18n, t } from "../../../utils/i18n";
import type { SettingsTab } from "../types/settings-types";

//  标签页配置 - 使用i18n键
// 注意：label字段现在是i18n翻译键，需要在使用时调用t()函数
export const SETTINGS_TABS: SettingsTab[] = [
	{ id: "basic", label: "settings.categories.basic" },
	{ id: "memory-learning", label: "settings.categories.memoryLearning" },
	{ id: "card-parsing", label: "settings.categories.cardParsing" },
	{ id: "ai-config", label: "settings.categories.aiConfig" },
	{ id: "anki-connect", label: "settings.categories.ankiConnect" },
	{ id: "data-management", label: "settings.categories.dataManagement" },
	{ id: "about", label: "settings.categories.about" },
];

// 默认标签页
export const DEFAULT_ACTIVE_TAB = "basic";

// 通知持续时间
export const NOTIFICATION_DURATION = {
	SHORT: 3000,
	MEDIUM: 5000,
	LONG: 8000,
	ERROR: 5000,
	SUCCESS: 3000,
} as const;

// 默认设置值
export const DEFAULT_SETTINGS = {
	BACKUP_RETENTION_COUNT: 10,
	BACKUP_INTERVAL_HOURS: 24,
	ATTACHMENT_DIR: "Weave Assets",
	MAX_FILES_PER_BATCH: 50,
	BATCH_START_MARKER: "<!-- weave-start -->",
	BATCH_END_MARKER: "<!-- weave-end -->",
	BATCH_TAG_MARKER: "#weave",
} as const;

export function getModalSizePresets() {
	return {
		small: { width: 600, height: 400, label: t("settingsConstants.modalSize.small") },
		medium: { width: 700, height: 500, label: t("settingsConstants.modalSize.medium") },
		large: { width: 800, height: 600, label: t("settingsConstants.modalSize.large") },
		"extra-large": { width: 1000, height: 700, label: t("settingsConstants.modalSize.extraLarge") },
		custom: { width: 800, height: 600, label: t("settingsConstants.modalSize.custom") },
	};
}

// 模态窗尺寸限制
export const MODAL_SIZE_LIMITS = {
	MIN_WIDTH: 400,
	MAX_WIDTH: 1400,
	MIN_HEIGHT: 300,
	MAX_HEIGHT: 900,
	RESIZE_HANDLE_SIZE: 8, // 拖拽手柄大小(px)
} as const;

export const PRODUCT_INFO = {
	NAME: "Weave",
	VERSION: "v0.8.10",
	PLATFORM: "Obsidian 全平台",
	DEVELOPER: "rabbit",
} as const;

export const CONTACT_INFO = {
	EMAIL: "tutaoyuan8@outlook.com",
	SUPPORT_EMAIL_SUBJECT: "Weave插件激活问题咨询",
} as const;

// CSS 类名常量
export const CSS_CLASSES = {
	// 主容器
	SETTINGS_ROOT: "anki-app settings-root",
	HEADER: "header",
	TITLE: "title",

	// 标签页
	TABS: "tabs",

	// 卡片和区域
	CARD: "card",
	SECTION: "section",
	LICENSE_SECTION: "license-section section",
	GROUP: "settings-group",
	GROUP_HEADER: "group-header",
	GROUP_CONTENT: "group-content",

	// 表单元素
	ROW: "row",
	MODERN_SWITCH: "modern-switch",
	SWITCH_SLIDER: "switch-slider",
	MODERN_SELECT: "modern-select",

	// 消息和通知
	MESSAGE: "message",
	MESSAGE_SUCCESS: "message success",
	MESSAGE_ERROR: "message error",
	MESSAGE_ICON: "message-icon",
	MESSAGE_CONTENT: "message-content",

	// 工具栏
	TOOLBAR: "toolbar",

	// 状态类
	VALID: "valid",
	INVALID: "invalid",
	LOADING: "loading",
	DISABLED: "disabled",
	ACTIVE: "active",
	INACTIVE: "inactive",
} as const;

// 验证规则
export const VALIDATION_RULES = {
	ACTIVATION_CODE: {
		MIN_LENGTH: 10,
		PATTERN: /^[A-Za-z0-9\-\.]+$/,
		REQUIRED: true,
	},
	RETENTION_RATE: {
		MIN: 0.1,
		MAX: 1.0,
		STEP: 0.01,
	},
	MAX_INTERVAL: {
		MIN: 1,
		MAX: 36500,
		STEP: 1,
	},
	BACKUP_COUNT: {
		MIN: 3,
		MAX: 50,
		STEP: 1,
	},
} as const;

// ================================
// AI配置相关常量
// ================================

// AI提供商类型
export type AIProvider =
	| "openai"
	| "gemini"
	| "anthropic"
	| "deepseek"
	| "zhipu"
	| "siliconflow"
	| "xai";

// 默认 API 地址配置
export const DEFAULT_API_URLS = {
	openai: "https://api.openai.com/v1",
	gemini: "https://generativelanguage.googleapis.com/v1beta",
	anthropic: "https://api.anthropic.com",
	deepseek: "https://api.deepseek.com",
	zhipu: "https://open.bigmodel.cn/api/paas/v4",
	siliconflow: "https://api.siliconflow.cn/v1",
	xai: "https://api.x.ai/v1",
} as const;

// AI提供商默认模型与支持模型列表
export const DEFAULT_AI_PROVIDER_MODELS: Record<AIProvider, string> = {
	openai: "gpt-5.4-mini",
	gemini: "gemini-2.5-flash",
	anthropic: "claude-sonnet-4-6",
	deepseek: "deepseek-v4-flash",
	zhipu: "glm-4.5-flash",
	siliconflow: "Qwen/Qwen3-32B",
	xai: "grok-4.3",
};

export function getDefaultAIModel(provider: AIProvider): string {
	return DEFAULT_AI_PROVIDER_MODELS[provider];
}

// AI配置默认值
export const DEFAULT_AI_CONFIG = {
	apiKeys: {
		openai: { apiKey: "", model: DEFAULT_AI_PROVIDER_MODELS.openai, verified: false, baseUrl: undefined },
		gemini: { apiKey: "", model: DEFAULT_AI_PROVIDER_MODELS.gemini, verified: false, baseUrl: undefined },
		anthropic: {
			apiKey: "",
			model: DEFAULT_AI_PROVIDER_MODELS.anthropic,
			verified: false,
			baseUrl: undefined,
		},
		deepseek: { apiKey: "", model: DEFAULT_AI_PROVIDER_MODELS.deepseek, verified: false, baseUrl: undefined },
		zhipu: { apiKey: "", model: DEFAULT_AI_PROVIDER_MODELS.zhipu, verified: false, baseUrl: undefined },
		siliconflow: { apiKey: "", model: DEFAULT_AI_PROVIDER_MODELS.siliconflow, verified: false, baseUrl: undefined },
		xai: { apiKey: "", model: DEFAULT_AI_PROVIDER_MODELS.xai, verified: false, baseUrl: undefined },
	},
	defaultProvider: "zhipu" as const,
	lastUsedProvider: undefined as string | undefined, // 上次使用的 AI 服务提供商
	lastUsedModel: undefined as string | undefined, // 上次使用的 AI 模型
	formatting: {
		enabled: true, // 仅保留总开关
	},
	globalParams: {
		temperature: 0.7,
		maxTokens: 2000,
		requestTimeout: 30,
		concurrentLimit: 3,
	},

	// 全局系统提示词配置
	systemPromptConfig: {
		useBuiltin: true,
		customPrompt: "",
		lastModified: undefined,
		customSystemPrompts: [], // 自定义系统提示词列表
		selectedSystemPromptId: undefined, // 当前选中的系统提示词 ID
	},
	promptTemplates: {
		official: [
			{
				id: "standard-qa",
				name: "标准问答生成",
				prompt:
					"请根据以下内容生成{count}张问答卡片，难度为{difficulty}。要求问题简洁明确，答案完整准确。",
				useBuiltinSystemPrompt: true,
				description: "适用于一般性学习材料，生成标准问答卡片，包含多种题型",
				variables: ["count", "difficulty", "template"],
				createdAt: new Date().toISOString(),
			},
			{
				id: "concept-explain",
				name: "概念解释型",
				prompt: "请提取关键概念并生成解释型卡片，包含定义、特点、应用场景。",
				useBuiltinSystemPrompt: true,
				description: "专注于概念理解，生成定义类、解释类卡片",
				variables: ["count"],
				createdAt: new Date().toISOString(),
			},
			{
				id: "deep-understanding",
				name: "深度理解型",
				prompt: "生成需要深度思考的卡片，重点考察理解、分析、应用能力。避免简单记忆型问题。",
				useBuiltinSystemPrompt: true,
				description: "生成高阶思维卡片，强调理解和应用",
				variables: ["count", "difficulty"],
				createdAt: new Date().toISOString(),
			},
			{
				id: "cloze-fill",
				name: "挖空填充型",
				prompt: "生成挖空题，使用{{c1::}}语法标记关键词。每张卡片1-3个挖空点。",
				useBuiltinSystemPrompt: true,
				description: "专注于生成挖空题，适合记忆关键术语和概念",
				variables: ["count"],
				createdAt: new Date().toISOString(),
			},
		],
		custom: [],
	},
	// AI拆分卡片配置
	cardSplitting: {
		enabled: true,
		defaultTargetCount: 0, // 0表示让AI自动决定，通常生成2-5张
		minContentLength: 100, // 最小内容长度（字符数）
		maxContentLength: 5000, // 最大内容长度
		autoInheritTags: true, // 自动继承父卡片标签
		autoInheritSource: true, // 自动继承来源信息
		requireConfirmation: true, // 收入前是否需要确认
		defaultInstruction: "", // 默认拆分指令（可选）
	},

	// 自定义AI功能列表
	customFormatActions: [],
	customSplitActions: [],
};

// AI模型选项
export const AI_MODEL_OPTIONS = {
	openai: [
		{ id: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "当前更均衡的 GPT-5 系列选择，适合作为默认模型" },
		{
			id: "gpt-5.5",
			label: "GPT-5.5",
			description: "OpenAI 当前旗舰推理/编码模型",
		},
		{ id: "gpt-5.4-nano", label: "GPT-5.4 Nano", description: "超低成本轻量模型" },
		{ id: "gpt-5.2", label: "GPT-5.2", description: "GPT-5 系列稳定版本" },
		{ id: "gpt-5.1", label: "GPT-5.1", description: "GPT-5 早期稳定版本，适合兼容旧配置" },
		{ id: "gpt-4.1", label: "GPT-4.1", description: "成熟稳定的高质量通用模型" },
		{ id: "gpt-4.1-mini", label: "GPT-4.1 Mini", description: "轻量通用模型" },
		{ id: "gpt-4o", label: "GPT-4o", description: "经典多模态模型" },
		{ id: "o3", label: "o3", description: "高强度推理模型" },
		{ id: "o4-mini", label: "o4-mini", description: "轻量推理模型" },
	],
	gemini: [
		{
			id: "gemini-2.5-flash",
			label: "Gemini 2.5 Flash",
			description: "速度与质量平衡，适合作为默认模型",
		},
		{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "高质量通用/推理模型" },
		{
			id: "gemini-2.5-flash-lite",
			label: "Gemini 2.5 Flash-Lite",
			description: "更低成本的轻量模型",
		},
		{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", description: "Gemini 3 系列高能力预览模型" },
		{ id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", description: "Gemini 3 系列快速预览模型" },
		{ id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash-Lite Preview", description: "高频轻量任务的低成本预览模型" },
	],
	anthropic: [
		{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "当前主力均衡模型，适合作为默认模型" },
		{ id: "claude-opus-4-7", label: "Claude Opus 4.7", description: "Anthropic 当前旗舰模型" },
		{ id: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "高频、低延迟场景的轻量模型" },
	],
	deepseek: [
		{ id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", description: "当前快速通用模型，适合作为默认模型" },
		{ id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", description: "当前高性能模型" },
		{ id: "deepseek-chat", label: "DeepSeek Chat", description: "兼容别名，对应非思考模式，计划于 2026-07-24 下线" },
		{ id: "deepseek-reasoner", label: "DeepSeek Reasoner", description: "兼容别名，对应思考模式，计划于 2026-07-24 下线" },
	],
	zhipu: [
		{ id: "glm-4.5-flash", label: "GLM-4.5 Flash", description: "快速低成本，适合作为默认模型" },
		{ id: "glm-5", label: "GLM-5", description: "智谱当前高端通用模型" },
		{ id: "glm-5.1", label: "GLM-5.1", description: "智谱最新主线文本模型" },
		{ id: "glm-5-turbo", label: "GLM-5 Turbo", description: "更均衡的 GLM-5 系列选择" },
		{ id: "glm-4.7", label: "GLM-4.7", description: "强化 Coding 与工具协同" },
		{ id: "glm-4.7-flash", label: "GLM-4.7 Flash", description: "面向效率场景的 4.7 轻量版" },
		{ id: "glm-4.6", label: "GLM-4.6", description: "稳定通用版本" },
		{ id: "glm-4.5-air", label: "GLM-4.5 Air", description: "均衡成本与性能" },
		{ id: "glm-4.5-airx", label: "GLM-4.5 AirX", description: "低时延高并发优化" },
	],
	siliconflow: [
		{ id: "Qwen/Qwen3-32B", label: "Qwen3 32B", description: "当前均衡通用模型，适合作为默认模型" },
		{ id: "Pro/zai-org/GLM-5", label: "GLM-5 (Pro)", description: "SiliconFlow 当前高端 GLM 路线模型" },
		{ id: "Pro/zai-org/GLM-4.7", label: "GLM-4.7 (Pro)", description: "强化 Coding 与 Agent 场景" },
		{ id: "deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2", description: "当前通用主线模型" },
		{ id: "Pro/deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2 (Pro)", description: "更高性能版本" },
		{ id: "Pro/deepseek-ai/DeepSeek-R1", label: "DeepSeek R1 (Pro)", description: "推理增强模型" },
		{ id: "Qwen/Qwen3-30B-A3B", label: "Qwen3 30B A3B", description: "兼顾速度与成本的 Qwen3 MoE 模型" },
		{ id: "Qwen/Qwen3-14B", label: "Qwen3 14B", description: "中等成本通用模型" },
		{ id: "Qwen/Qwen3-8B", label: "Qwen3 8B", description: "轻量高频场景模型" },
		{ id: "zai-org/GLM-4.6", label: "GLM-4.6", description: "稳定通用版本" },
	],
	xai: [
		{ id: "grok-4.3", label: "Grok 4.3", description: "xAI 当前推荐模型，适合作为默认模型" },
		{ id: "grok-4", label: "Grok 4", description: "上一代旗舰版本" },
		{ id: "grok-3", label: "Grok 3", description: "兼容旧配置的稳定版本" },
	],
} as const;

const AI_PROVIDER_LABEL_FALLBACKS: Record<AIProvider, string> = {
	openai: "OpenAI",
	gemini: "Google Gemini",
	anthropic: "Anthropic Claude",
	deepseek: "DeepSeek",
	zhipu: "Zhipu AI",
	siliconflow: "SiliconFlow",
	xai: "xAI Grok",
};

const AI_PROVIDER_CAPABILITY_FALLBACKS: Record<
	AIProvider,
	{
		keyPlaceholder: string;
		openaiCompatible: boolean;
		description: string;
	}
> = {
	openai: { keyPlaceholder: "sk-...", openaiCompatible: true, description: "OpenAI Official API" },
	gemini: { keyPlaceholder: "AIza...", openaiCompatible: false, description: "Google AI" },
	anthropic: {
		keyPlaceholder: "sk-ant-...",
		openaiCompatible: false,
		description: "Anthropic Claude",
	},
	deepseek: { keyPlaceholder: "sk-...", openaiCompatible: true, description: "DeepSeek" },
	zhipu: { keyPlaceholder: "Enter API Key", openaiCompatible: true, description: "Zhipu AI" },
	siliconflow: { keyPlaceholder: "sk-...", openaiCompatible: true, description: "SiliconFlow" },
	xai: { keyPlaceholder: "xai-...", openaiCompatible: true, description: "xAI Grok" },
};

function resolveOptionalTranslation(key: string, fallback: string): string {
	return i18n.hasTranslation(key) ? t(key) : fallback;
}

export const AI_PROVIDER_CAPABILITIES: Record<
	AIProvider,
	{
		keyPlaceholder: string;
		openaiCompatible: boolean;
		description: string;
	}
> = {
	get openai() {
		const fallback = AI_PROVIDER_CAPABILITY_FALLBACKS.openai;
		return {
			keyPlaceholder: resolveOptionalTranslation("settingsConstants.aiKeyPlaceholder.openai", fallback.keyPlaceholder),
			openaiCompatible: fallback.openaiCompatible,
			description: resolveOptionalTranslation("settingsConstants.aiProviderDesc.openai", fallback.description),
		};
	},
	get gemini() {
		const fallback = AI_PROVIDER_CAPABILITY_FALLBACKS.gemini;
		return {
			keyPlaceholder: resolveOptionalTranslation("settingsConstants.aiKeyPlaceholder.gemini", fallback.keyPlaceholder),
			openaiCompatible: fallback.openaiCompatible,
			description: resolveOptionalTranslation("settingsConstants.aiProviderDesc.gemini", fallback.description),
		};
	},
	get anthropic() {
		const fallback = AI_PROVIDER_CAPABILITY_FALLBACKS.anthropic;
		return {
			keyPlaceholder: resolveOptionalTranslation("settingsConstants.aiKeyPlaceholder.anthropic", fallback.keyPlaceholder),
			openaiCompatible: fallback.openaiCompatible,
			description: resolveOptionalTranslation("settingsConstants.aiProviderDesc.anthropic", fallback.description),
		};
	},
	get deepseek() {
		const fallback = AI_PROVIDER_CAPABILITY_FALLBACKS.deepseek;
		return {
			keyPlaceholder: resolveOptionalTranslation("settingsConstants.aiKeyPlaceholder.deepseek", fallback.keyPlaceholder),
			openaiCompatible: fallback.openaiCompatible,
			description: resolveOptionalTranslation("settingsConstants.aiProviderDesc.deepseek", fallback.description),
		};
	},
	get zhipu() {
		const fallback = AI_PROVIDER_CAPABILITY_FALLBACKS.zhipu;
		return {
			keyPlaceholder: resolveOptionalTranslation("settingsConstants.aiKeyPlaceholder.zhipu", fallback.keyPlaceholder),
			openaiCompatible: fallback.openaiCompatible,
			description: resolveOptionalTranslation("settingsConstants.aiProviderDesc.zhipu", fallback.description),
		};
	},
	get siliconflow() {
		const fallback = AI_PROVIDER_CAPABILITY_FALLBACKS.siliconflow;
		return {
			keyPlaceholder: resolveOptionalTranslation("settingsConstants.aiKeyPlaceholder.siliconflow", fallback.keyPlaceholder),
			openaiCompatible: fallback.openaiCompatible,
			description: resolveOptionalTranslation("settingsConstants.aiProviderDesc.siliconflow", fallback.description),
		};
	},
	get xai() {
		const fallback = AI_PROVIDER_CAPABILITY_FALLBACKS.xai;
		return {
			keyPlaceholder: resolveOptionalTranslation("settingsConstants.aiKeyPlaceholder.xai", fallback.keyPlaceholder),
			openaiCompatible: fallback.openaiCompatible,
			description: resolveOptionalTranslation("settingsConstants.aiProviderDesc.xai", fallback.description),
		};
	},
};

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
	get openai() {
		return resolveOptionalTranslation("settingsConstants.aiProviderLabels.openai", AI_PROVIDER_LABEL_FALLBACKS.openai);
	},
	get gemini() {
		return resolveOptionalTranslation("settingsConstants.aiProviderLabels.gemini", AI_PROVIDER_LABEL_FALLBACKS.gemini);
	},
	get anthropic() {
		return resolveOptionalTranslation("settingsConstants.aiProviderLabels.anthropic", AI_PROVIDER_LABEL_FALLBACKS.anthropic);
	},
	get deepseek() {
		return resolveOptionalTranslation("settingsConstants.aiProviderLabels.deepseek", AI_PROVIDER_LABEL_FALLBACKS.deepseek);
	},
	get zhipu() {
		return resolveOptionalTranslation("settingsConstants.aiProviderLabels.zhipu", AI_PROVIDER_LABEL_FALLBACKS.zhipu);
	},
	get siliconflow() {
		return resolveOptionalTranslation("settingsConstants.aiProviderLabels.siliconflow", AI_PROVIDER_LABEL_FALLBACKS.siliconflow);
	},
	get xai() {
		return resolveOptionalTranslation("settingsConstants.aiProviderLabels.xai", AI_PROVIDER_LABEL_FALLBACKS.xai);
	},
};

// ================================
// 致谢信息配置
// ================================

// 致谢对象列表
export function getAcknowledgments() {
	return [
		{
			id: "fsrs",
			name: t("settingsConstants.acknowledgments.fsrs.name"),
			icon: "",
			description: t("settingsConstants.acknowledgments.fsrs.description"),
			url: "https://github.com/open-spaced-repetition/fsrs4anki",
		},
		{
			id: "obsidian",
			name: t("settingsConstants.acknowledgments.obsidian.name"),
			icon: "",
			description: t("settingsConstants.acknowledgments.obsidian.description"),
			url: "https://obsidian.md/",
		},
		{
			id: "anki",
			name: t("settingsConstants.acknowledgments.anki.name"),
			icon: "",
			description: t("settingsConstants.acknowledgments.anki.description"),
			url: "https://apps.ankiweb.net/",
		},
		{
			id: "samdagreatwzzz",
			name: t("settingsConstants.acknowledgments.samdagreatwzzz.name"),
			icon: "",
			description: t("settingsConstants.acknowledgments.samdagreatwzzz.description"),
			url: "https://space.bilibili.com/22291849/",
		},
		{
			id: "users",
			name: t("settingsConstants.acknowledgments.users.name"),
			icon: "",
			description: t("settingsConstants.acknowledgments.users.description"),
		},
		{
			id: "supporters",
			name: t("settingsConstants.acknowledgments.supporters.name"),
			icon: "",
			description: t("settingsConstants.acknowledgments.supporters.description"),
		},
	];
}
