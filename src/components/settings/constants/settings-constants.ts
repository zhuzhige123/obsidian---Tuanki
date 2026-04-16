/**
 * 设置界面相关的常量定义
 * 消除硬编码，提供统一的配置管理
 */

import { t } from "../../../utils/i18n";
import type { SettingsTab } from "../types/settings-types";

//  标签页配置 - 使用i18n键
// 注意：label字段现在是i18n翻译键，需要在使用时调用t()函数
export const SETTINGS_TABS: SettingsTab[] = [
	{ id: "basic", label: "settings.categories.basic" },
	{ id: "memory-learning", label: "settings.categories.memoryLearning" },
	{ id: "incremental-reading", label: "settings.categories.incrementalReading" },
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
	VERSION: "v0.7.8",
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

// AI配置默认值
export const DEFAULT_AI_CONFIG = {
	apiKeys: {
		openai: { apiKey: "", model: "gpt-5-mini", verified: false, baseUrl: undefined },
		gemini: { apiKey: "", model: "gemini-2.5-flash", verified: false, baseUrl: undefined },
		anthropic: {
			apiKey: "",
			model: "claude-3-7-sonnet-latest",
			verified: false,
			baseUrl: undefined,
		},
		deepseek: { apiKey: "", model: "deepseek-chat", verified: false, baseUrl: undefined },
		zhipu: { apiKey: "", model: "glm-4-flash", verified: false, baseUrl: undefined },
		siliconflow: { apiKey: "", model: "Qwen/Qwen3-32B", verified: false, baseUrl: undefined },
		xai: { apiKey: "", model: "grok-3", verified: false, baseUrl: undefined },
	},
	defaultProvider: "zhipu" as const,
	lastUsedProvider: undefined as string | undefined, // 上次使用的 AI 服务提供商
	lastUsedModel: undefined as string | undefined, // 上次使用的 AI 模型
	/** 已弃用，仅为兼容旧配置保留。 */
	formattingProvider: undefined,
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
	officialFormatActions: {
		choice: { enabled: true },
		mathFormula: { enabled: true },
		memoryAid: { enabled: true },
	},
};

// AI模型选项
export const AI_MODEL_OPTIONS = {
	openai: [
		{ id: "gpt-5", label: "GPT-5", description: "OpenAI 新一代旗舰通用模型" },
		{
			id: "gpt-5-mini",
			label: "GPT-5 Mini",
			description: "更均衡的成本/速度选择，适合作为默认模型",
		},
		{ id: "gpt-5-nano", label: "GPT-5 Nano", description: "超低成本轻量模型" },
		{ id: "gpt-4.1", label: "GPT-4.1", description: "成熟稳定的高质量通用模型" },
		{ id: "gpt-4.1-mini", label: "GPT-4.1 Mini", description: "轻量通用模型" },
		{ id: "gpt-4o", label: "GPT-4o", description: "经典多模态模型" },
		{ id: "o3", label: "o3", description: "高强度推理模型" },
		{ id: "o4-mini", label: "o4-mini", description: "轻量推理模型" },
	],
	gemini: [
		{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "高质量通用/推理模型" },
		{
			id: "gemini-2.5-flash",
			label: "Gemini 2.5 Flash",
			description: "速度与质量平衡，适合作为默认模型",
		},
		{
			id: "gemini-2.5-flash-lite",
			label: "Gemini 2.5 Flash-Lite",
			description: "更低成本的轻量模型",
		},
		{ id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", description: "成熟稳定的快速模型" },
		{ id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite", description: "轻量快速模型" },
	],
	anthropic: [
		{ id: "claude-opus-4-1", label: "Claude Opus 4.1", description: "Claude 高端旗舰模型" },
		{ id: "claude-sonnet-4", label: "Claude Sonnet 4", description: "Claude 主力均衡模型" },
		{
			id: "claude-3-7-sonnet-latest",
			label: "Claude 3.7 Sonnet",
			description: "成熟稳定，兼顾推理与写作",
		},
		{ id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", description: "经典稳定版本" },
	],
	deepseek: [
		{ id: "deepseek-chat", label: "DeepSeek Chat", description: "通用对话模型" },
		{ id: "deepseek-reasoner", label: "DeepSeek Reasoner", description: "推理增强模型" },
	],
	zhipu: [
		{ id: "glm-4-plus", label: "GLM-4 Plus", description: "智谱高性能通用模型" },
		{ id: "glm-4-air", label: "GLM-4 Air", description: "平衡成本与性能" },
		{ id: "glm-4-flash", label: "GLM-4 Flash", description: "快速响应，适合作为默认模型" },
		{ id: "glm-4", label: "GLM-4", description: "标准版本" },
	],
	siliconflow: [
		{ id: "Qwen/Qwen3-32B", label: "Qwen3 32B", description: "通义千问新一代通用模型" },
		{ id: "Qwen/Qwen3-235B-A22B", label: "Qwen3 235B A22B", description: "高性能大模型" },
		{ id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3", description: "DeepSeek 通用模型" },
		{ id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1", description: "DeepSeek 推理模型" },
		{
			id: "meta-llama/Llama-3.3-70B-Instruct",
			label: "Llama 3.3 70B",
			description: "Meta 开源高性能模型",
		},
		{ id: "THUDM/GLM-4-9B-Chat", label: "GLM-4 9B Chat", description: "智谱开源轻量模型" },
		{ id: "google/gemma-2-9b-it", label: "Gemma 2 9B", description: "Google 轻量模型" },
	],
	xai: [
		{ id: "grok-4", label: "Grok 4", description: "xAI 新一代旗舰模型" },
		{ id: "grok-3", label: "Grok 3", description: "成熟稳定版本" },
	],
} as const;

export const AI_PROVIDER_LABELS = {
	openai: "OpenAI",
	gemini: "Google Gemini",
	anthropic: "Anthropic Claude",
	deepseek: "DeepSeek",
	zhipu: "Zhipu AI",
	siliconflow: "SiliconFlow",
	xai: "xAI Grok",
} as const;

// AI提供商类型
export type AIProvider =
	| "openai"
	| "gemini"
	| "anthropic"
	| "deepseek"
	| "zhipu"
	| "siliconflow"
	| "xai";
export const AI_PROVIDER_CAPABILITIES: Record<
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

// ================================
// 致谢信息配置
// ================================

// 致谢对象列表
export function getAcknowledgments() {
	const obsidianAckPrefix = ["settingsConstants", "acknowledgments", "obsidian"].join(".");
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
			name: t(`${obsidianAckPrefix}.name`),
			icon: "",
			description: t(`${obsidianAckPrefix}.description`),
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
