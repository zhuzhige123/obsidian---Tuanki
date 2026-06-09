import * as ObsidianApi from "obsidian";
import { logger } from "../utils/logger";
import { deckAnalyticsTranslationOverrides } from "./i18n/deck-analytics-overrides";
import { mergeTranslationTrees } from "./i18n/merge-translation-trees";
import { translations, translationOverrides } from "./i18n/resources";
import type { I18nConfig, SupportedLanguage, TranslationKey } from "./i18n/types";
import { derived, get, writable } from "svelte/store";

export type { I18nConfig, SupportedLanguage, TranslationKey } from "./i18n/types";
export { mergeTranslationTrees } from "./i18n/merge-translation-trees";

export const translationCatalog: Record<SupportedLanguage, TranslationKey> = {
	"zh-CN": mergeTranslationTrees(
		mergeTranslationTrees(translations["zh-CN"], translationOverrides["zh-CN"]),
		deckAnalyticsTranslationOverrides["zh-CN"]
	),
	"en-US": mergeTranslationTrees(
		mergeTranslationTrees(translations["en-US"], translationOverrides["en-US"]),
		deckAnalyticsTranslationOverrides["en-US"]
	),
};

export function flattenTranslationLeafKeys(tree: TranslationKey, prefix = ""): string[] {
	return Object.entries(tree).flatMap(([key, value]) => {
		const nextKey = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") {
			return [nextKey];
		}
		return flattenTranslationLeafKeys(value, nextKey);
	});
}

const defaultConfig: I18nConfig = {
	defaultLanguage: "zh-CN",
	fallbackLanguage: "zh-CN",
	supportedLanguages: ["zh-CN", "en-US"],
};

const translationKeyAliases: Record<string, string> = {};

const translationAliasSuffixes = [
	["Label", "label"],
	["Desc", "description"],
	["Description", "description"],
	["Placeholder", "placeholder"],
	["Title", "title"],
	["Button", "button"],
	["Help", "help"],
	["Error", "error"],
	["Success", "success"],
	["Warning", "warning"],
	["Info", "info"],
] as const;

function getTranslationAliasCandidates(key: string): string[] {
	const candidates = new Set<string>();
	const directAlias = translationKeyAliases[key];

	if (directAlias) {
		candidates.add(directAlias);
	}

	const parts = key.split(".");
	const lastSegment = parts.at(-1) ?? "";

	for (const [suffix, targetSegment] of translationAliasSuffixes) {
		if (!lastSegment.endsWith(suffix) || lastSegment.length <= suffix.length) {
			continue;
		}

		const baseSegment = lastSegment.slice(0, -suffix.length);
		const normalizedBase = `${baseSegment.charAt(0).toLowerCase()}${baseSegment.slice(1)}`;
		candidates.add([...parts.slice(0, -1), normalizedBase, targetSegment].join("."));
		candidates.add([...parts.slice(0, -1), normalizedBase].join("."));

		if (targetSegment === "description") {
			candidates.add([...parts.slice(0, -1), normalizedBase, "desc"].join("."));
		}
	}

	if (lastSegment === "connected" || lastSegment === "disconnected" || lastSegment === "testing") {
		candidates.add([...parts.slice(0, -1), "statusLabel", lastSegment].join("."));
		candidates.add([...parts.slice(0, -1), "status", lastSegment].join("."));
	}

	if (key.includes(".endpoint")) {
		candidates.add(key.replace(".endpoint", ".address"));
	}

	return [...candidates];
}

// ============================================================================
// 自动检测Obsidian语言设置
// ============================================================================

/**
 * 从 Obsidian 官方 API 读取当前界面语言。
 * Obsidian语言代码: en, zh, zh-TW, ru, ko, it, id, ro, pt-BR, cz, de, es, fr, no, pl, pt, ja, da, uk, sq, tr, hi, se, nl, ar, th, fa, vi, he, ms, ca, am
 */
function readObsidianHostLanguage(): string | null {
	try {
		const getLang = (ObsidianApi as { getLanguage?: () => string }).getLanguage;
		if (typeof getLang !== "function") {
			return null;
		}
		const lang = getLang();
		return lang ? String(lang) : null;
	} catch {
		return null;
	}
}

function detectObsidianLanguage(): SupportedLanguage {
	try {
		// 方法1: Obsidian 官方 getLanguage()
		const obsidianLang = readObsidianHostLanguage();
		if (obsidianLang) {
			if (obsidianLang === "zh" || obsidianLang === "zh-CN" || obsidianLang === "zh-TW") {
				return "zh-CN";
			}
			return "en-US";
		}

		// 方法2: 使用moment.locale() - Obsidian使用moment.js管理语言
		// @ts-ignore - moment是Obsidian全局变量
		const momentLocale = window.moment?.locale?.();
		if (momentLocale) {
			// 中文locale: zh-cn, zh-tw
			if (momentLocale.startsWith("zh")) {
				return "zh-CN";
			}
			// 其他语言使用英文
			return "en-US";
		}

		// 方法3: 文档语言标签（备用）
		const documentLang = window?.activeDocument?.documentElement?.lang;
		if (documentLang) {
			if (documentLang.startsWith("zh")) {
				return "zh-CN";
			}
			return "en-US";
		}

		// 方法4: 浏览器语言 (最后备用)
		const browserLang = window?.navigator?.language;
		if (browserLang?.startsWith("zh")) {
			return "zh-CN";
		}

		return "en-US";
	} catch {
		return defaultConfig.defaultLanguage;
	}
}

// ============================================================================
// 状态管理
// ============================================================================

export const currentLanguage = writable<SupportedLanguage>(defaultConfig.defaultLanguage);
let lastDetectedLanguage: SupportedLanguage | null = null;
let stableDetectionCount = 0;
const REQUIRED_STABLE_DETECTIONS = 2;

/** @internal test-only reset for detection debounce state */
export function resetI18nDetectionStateForTests(): void {
	lastDetectedLanguage = null;
	stableDetectionCount = 0;
}

export function syncI18nWithObsidianLanguage(): SupportedLanguage {
	const detectedLang = detectObsidianLanguage();
	if (lastDetectedLanguage === detectedLang) {
		stableDetectionCount += 1;
	} else {
		lastDetectedLanguage = detectedLang;
		stableDetectionCount = 1;
	}

	if (stableDetectionCount >= REQUIRED_STABLE_DETECTIONS && get(currentLanguage) !== detectedLang) {
		currentLanguage.set(detectedLang);
	}
	return detectedLang;
}

/**
 * 初始化国际化系统 - 检测Obsidian语言并设置
 * 应在插件onload时调用
 */
export function initI18n(): void {
	const detectedLang = detectObsidianLanguage();
	lastDetectedLanguage = detectedLang;
	stableDetectionCount = REQUIRED_STABLE_DETECTIONS;
	currentLanguage.set(detectedLang);
}
export const i18nConfig = writable<I18nConfig>(defaultConfig);

// ============================================================================
// 国际化服务类
// ============================================================================

export class I18nService {
	private static instance: I18nService;
	private currentLang: SupportedLanguage = defaultConfig.defaultLanguage;
	private config: I18nConfig = defaultConfig;
	private readonly missingKeyWarnings = new Set<string>();

	private constructor() {
		// 订阅语言变化
		currentLanguage.subscribe((_lang) => {
			this.currentLang = _lang;
		});

		// 订阅配置变化
		i18nConfig.subscribe((_config) => {
			this.config = _config;
		});
	}

	static getInstance(): I18nService {
		if (!I18nService.instance) {
			I18nService.instance = new I18nService();
		}
		return I18nService.instance;
	}

	/**
	 * 获取翻译文本
	 */
	t(key: string, params?: Record<string, string | number>): string {
		const translation = this.resolveTranslation(key, this.currentLang);

		if (!translation) {
			// 尝试回退语言
			const fallbackTranslation =
				this.currentLang === this.config.fallbackLanguage
					? null
					: this.resolveTranslation(key, this.config.fallbackLanguage);
			if (fallbackTranslation) {
				return this.interpolate(fallbackTranslation, params);
			}

			if (!this.missingKeyWarnings.has(key)) {
				this.missingKeyWarnings.add(key);
				logger.warn(
					`Translation not found for key: ${key} (lang: ${this.currentLang}, fallback: ${this.config.fallbackLanguage})`
				);
			}

			return key;
		}

		return this.interpolate(translation, params);
	}

	/**
	 * 检查当前语言或回退语言是否存在翻译（含兼容别名）
	 */
	hasTranslation(key: string): boolean {
		return Boolean(
			this.resolveTranslation(key, this.currentLang) ||
				(this.currentLang !== this.config.fallbackLanguage &&
					this.resolveTranslation(key, this.config.fallbackLanguage))
		);
	}

	/**
	 * 获取指定语言的翻译（含兼容别名）
	 */
	private resolveTranslation(key: string, language: SupportedLanguage): string | null {
		const directTranslation = this.getDirectTranslation(key, language);
		if (directTranslation) {
			return directTranslation;
		}

		for (const aliasKey of getTranslationAliasCandidates(key)) {
			const aliasTranslation = this.getDirectTranslation(aliasKey, language);
			if (aliasTranslation) {
				return aliasTranslation;
			}
		}

		return null;
	}

	/**
	 * 获取指定语言的直接翻译
	 */
	private getDirectTranslation(key: string, language: SupportedLanguage): string | null {
		const keys = key.split(".");
		let current: unknown = translationCatalog[language];

		for (const k of keys) {
			if (current && typeof current === "object" && k in current) {
				current = current[k];
			} else {
				return null;
			}
		}

		return typeof current === "string" ? current : null;
	}

	/**
	 * 插值处理
	 */
	private interpolate(text: string, params?: Record<string, string | number>): string {
		if (!params) return text;

		return text.replace(/\{(\w+)\}/g, (match, key: string) => {
			const value = params[key];
			return value !== undefined ? String(value) : match;
		});
	}

	/**
	 * 设置当前语言
	 */
	setLanguage(language: SupportedLanguage): void {
		if (this.config.supportedLanguages.includes(language)) {
			currentLanguage.set(language);
		} else {
			logger.warn(`Unsupported language: ${language}`);
		}
	}

	/**
	 * 获取当前语言
	 */
	getCurrentLanguage(): SupportedLanguage {
		return this.currentLang;
	}

	/**
	 * 获取支持的语言列表
	 */
	getSupportedLanguages(): SupportedLanguage[] {
		return this.config.supportedLanguages;
	}

	/**
	 * 检查是否支持指定语言
	 */
	isLanguageSupported(language: string): language is SupportedLanguage {
		return this.config.supportedLanguages.includes(language as SupportedLanguage);
	}
}

// ============================================================================
// 导出实例和工具函数
// ============================================================================

export const i18n = I18nService.getInstance();

// 便捷的翻译函数
export const t = (key: string, params?: Record<string, string | number>) => i18n.t(key, params);

// Svelte store 用于响应式翻译
export const tr = derived(
	currentLanguage,
	(_$currentLanguage) => (key: string, params?: Record<string, string | number>) =>
		i18n.t(key, params)
);

// 用于渲染列表型文案（按换行拆分）。缺失翻译时返回空数组，避免渲染键名。
export const trArray = derived(currentLanguage, (_$currentLanguage) =>
	(key: string): string[] => {
		if (!i18n.hasTranslation(key)) return [];
		const text = i18n.t(key);
		if (!text) return [];
		return text
			.split("\n")
			.map((item) => item.trim())
			.filter(Boolean);
	});
