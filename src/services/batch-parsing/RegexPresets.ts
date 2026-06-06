/**
 * 正则解析预设配置库
 * 职责：提供常用的正则解析配置模板，方便用户快速设置
 *
 * 预设配置：
 * 1. 默认配置（插件原生格式）
 * 2. 问答格式（Q: ... A: ...）
 * 3. 标题分隔（使用 Markdown 标题）
 * 4. 列表格式（使用 Markdown 列表）
 *
 * @author Weave Team
 * @date 2025-11-03
 */

import type { RegexParsingConfig } from "../../types/newCardParsingTypes";

/**
 * 预设配置 ID
 */
export type PresetId =
	| "default" // 官方 Weave 问答题（<-> + ---div---）
	| "qa-format" // Q: A: 格式
	| "heading-based" // 标题分隔
	| "list-format" // 列表格式
	| "anki-style" // Anki 导出格式
	| "weread-default"; // Weread 默认模板

/** 官方内置 Q&A 正则解析模板（Q: / A: 全文正则匹配） */
export const OFFICIAL_QA_REGEX_PRESET_ID: PresetId = "qa-format";

/** 写入用户设置时的稳定 ID 前缀 */
export const OFFICIAL_PRESET_CONFIG_ID_PREFIX = "official-";

/**
 * 官方 Q&A 正则模板示例（Q: 问题 / A: 答案，可直接粘贴测试批量解析）
 * 支持半角/全角冒号（: / ：）
 */
export const OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT = `Q: 什么是间隔重复？
A: 间隔重复是一种学习技术，通过逐渐增加复习间隔来优化长期记忆效果。

Q: FSRS 算法的全称是什么？
A: Free Spaced Repetition Scheduler（自由间隔重复调度器）。

Q：什么是牌组？
A：牌组是卡片的集合，用于组织和管理学习内容。`;

/** 官方 Q&A 正则：一次匹配全文多张卡片，Q/A 后支持半角或全角冒号 */
export const OFFICIAL_QA_REGEX_CARD_PATTERN =
	"Q\\s*[:：]\\s*(.+?)\\s*A\\s*[:：]\\s*(.+?)(?=\\n\\s*Q\\s*[:：]|$)";

/** 微信读书 Weread 导出：📌 高亮行 → 正面，⏱ 时间戳与块引用行 → 背面 */
export const WEREAD_DEFAULT_CARD_PATTERN =
	"^>\\s*\\u{1F4CC}\\s*([^\\r\\n]+)\\r?\\n>\\s*\\u23F1\\uFE0F?\\s*([^\\r\\n]+)$";

/**
 * 插件原生分隔符格式示例（<-> + ---div---，非 Q/A 正则模板）
 */
export const OFFICIAL_WEAVE_SEPARATOR_SAMPLE_DOCUMENT = `<->
## 什么是间隔重复？

---div---
间隔重复是一种学习技术，通过逐渐增加复习间隔来优化长期记忆效果。

<->
## FSRS 的全称是什么？

---div---
Free Spaced Repetition Scheduler（自由间隔重复调度器）。

<->
## 什么是牌组？

---div---
牌组是卡片的集合，用于组织和管理学习内容。 #记忆 #基础
<->`;

/**
 * 预设配置元数据
 */
export interface RegexPresetMeta {
	id: PresetId;
	name: string;
	description: string;
	/** 可直接用于「测试解析」的示例全文 */
	example: string;
	config: RegexParsingConfig;
	/** 是否在 UI 中标记为推荐 */
	recommended?: boolean;
}

/**
 * 预设配置库
 */
export const REGEX_PRESETS: Record<PresetId, RegexPresetMeta> = {
	/**
	 * 默认配置：插件原生格式
	 * 使用 <-> 作为卡片分隔符
	 * 使用 ---div--- 作为正反面分隔符
	 */
	default: {
		id: "default",
		name: "默认格式（插件原生）",
		description: "使用 <-> 分隔卡片，使用 ---div--- 分隔正反面（分隔符模式，非 Q/A 正则）",
		example: OFFICIAL_WEAVE_SEPARATOR_SAMPLE_DOCUMENT,
		config: {
			id: `${OFFICIAL_PRESET_CONFIG_ID_PREFIX}default`,
			name: "默认格式（插件原生）",
			description: "Weave 原生分隔符批量解析",
			mode: "separator",
			separatorMode: {
				cardSeparator: "<->",
				frontBackSeparator: "---div---",
				multiline: true,
				emptyLineSeparator: {
					enabled: false,
					lineCount: 2,
				},
			},
			uuidLocation: "inline",
			uuidPattern: "<!-- (tk-[a-z0-9]{12}) -->",
			excludeTags: ["禁止同步"],
			autoAddUUID: true,
			syncMethod: "tag-based",
		},
	},

	/**
	 * Q&A 格式：问答题格式
	 * 使用 Q: 开始问题，A: 开始答案
	 */
	"qa-format": {
		id: "qa-format",
		name: "官方 Q&A 正则模板",
		description:
			"内置 Q/A 正则：用 Q: 与 A: 标记正反面，cardPattern 一次匹配全文中的多张卡片（设置页可测试解析）",
		example: OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT,
		recommended: true,
		config: {
			id: `${OFFICIAL_PRESET_CONFIG_ID_PREFIX}qa-format`,
			name: "官方 Q&A 正则模板",
			description: `${OFFICIAL_QA_REGEX_CARD_PATTERN} 捕获组 1=正面、2=背面`,
			mode: "pattern",
			patternMode: {
				cardPattern: OFFICIAL_QA_REGEX_CARD_PATTERN,
				flags: "gs",
				captureGroups: {
					front: 1,
					back: 2,
				},
			},
			uuidLocation: "inline",
			uuidPattern: "<!-- (tk-[a-z0-9]{12}) -->",
			excludeTags: ["禁止同步"],
			autoAddUUID: true,
			syncMethod: "tag-based",
		},
	},

	/**
	 * 标题分隔格式：使用 Markdown 二级标题分隔卡片
	 * 标题作为问题，内容作为答案
	 */
	"heading-based": {
		id: "heading-based",
		name: "标题分隔格式",
		description: "使用 Markdown 二级标题（##）分隔卡片，标题作为问题",
		example: `## 什么是卡片？
卡片是学习的基本单位，包含问题和答案两部分。

## 什么是牌组？
牌组是卡片的集合，用于组织和管理学习内容。`,
		config: {
			name: "标题分隔格式",
			mode: "separator",
			separatorMode: {
				cardSeparator: "^##\\s+",
				firstLineAsFront: true,
				multiline: true,
			},
			uuidLocation: "inline",
			uuidPattern: "<!-- (tk-[a-z0-9]{12}) -->",
			excludeTags: ["禁止同步"],
			autoAddUUID: true,
			syncMethod: "tag-based",
		},
	},

	/**
	 * 列表格式：使用 Markdown 列表
	 * 列表项作为问题，子项作为答案
	 */
	"list-format": {
		id: "list-format",
		name: "列表格式",
		description: "使用 Markdown 列表，列表项作为问题，缩进项作为答案",
		example: `- 什么是间隔重复？
  - 间隔重复是一种学习技术
  - 通过逐渐增加复习间隔来优化记忆效果

- FSRS 算法的优势？
  - 更准确的记忆预测
  - 自适应学习曲线`,
		config: {
			name: "列表格式",
			mode: "pattern",
			patternMode: {
				cardPattern: "^-\\s+([^\\n]+)\\n((?:\\s+-\\s+[^\\n]+\\n?)+)",
				flags: "gm",
				captureGroups: {
					front: 1,
					back: 2,
				},
			},
			uuidLocation: "inline",
			uuidPattern: "<!-- (tk-[a-z0-9]{12}) -->",
			excludeTags: ["禁止同步"],
			autoAddUUID: true,
			syncMethod: "tag-based",
		},
	},

	/**
	 * Anki 导出格式：兼容 Anki 的导出格式
	 * 使用制表符或其他分隔符
	 */
	"anki-style": {
		id: "anki-style",
		name: "Anki 导出格式",
		description: "兼容 Anki 的导出格式（每行一张卡片，制表符分隔）",
		example: `问题1\t答案1
问题2\t答案2
问题3\t答案3`,
		config: {
			name: "Anki 导出格式",
			mode: "pattern",
			patternMode: {
				cardPattern: "^(.+?)\\t(.+?)$",
				flags: "gm",
				captureGroups: {
					front: 1,
					back: 2,
				},
			},
			uuidLocation: "none",
			excludeTags: ["禁止同步"],
			autoAddUUID: true,
			syncMethod: "full-sync",
		},
	},

	/**
	 * 微信读书格式：Weread 插件默认导出模板
	 * 将高亮内容解析为正面，时间戳与 Obsidian 块引用解析为背面
	 */
	"weread-default": {
		id: "weread-default",
		name: "微信读书（Weread 默认）",
		description:
			"适用于 Weread 插件默认导出的 Markdown：📌 高亮为正面，⏱ 时间戳与 ^块引用 为背面",
		example: `## 夜晚的潜水艇

> 📌 1966年一个寒夜，博尔赫斯站在轮船甲板上，往海中丢了一枚硬币。
> ⏱ 2024-04-02 11:33:39 ^3300059686-18-1115-1265

> 📌 想象这回事，就像顺水推舟，难的只是把舟从岸上拖进水里。
> ⏱ 2024-04-02 11:41:59 ^3300059686-18-4958-5019`,
		config: {
			name: "微信读书（Weread 默认）",
			mode: "pattern",
			patternMode: {
				cardPattern: WEREAD_DEFAULT_CARD_PATTERN,
				flags: "gmu",
				captureGroups: {
					front: 1,
					back: 2,
				},
			},
			uuidLocation: "inline",
			uuidPattern: "<!-- (tk-[a-z0-9]{12}) -->",
			excludeTags: ["禁止同步"],
			autoAddUUID: true,
			syncMethod: "tag-based",
		},
	},
};

/**
 * 获取预设配置
 * @param id 预设 ID
 * @returns 预设配置，如果不存在返回 null
 */
export function getPreset(id: PresetId): RegexPresetMeta | null {
	return REGEX_PRESETS[id] || null;
}

/**
 * 获取所有预设配置
 * @returns 预设配置数组
 */
export function getAllPresets(): RegexPresetMeta[] {
	return Object.values(REGEX_PRESETS);
}

/**
 * 根据名称搜索预设配置
 * @param keyword 搜索关键词
 * @returns 匹配的预设配置数组
 */
export function searchPresets(keyword: string): RegexPresetMeta[] {
	const lowerKeyword = keyword.toLowerCase();
	return getAllPresets().filter(
		(preset) =>
			preset.name.toLowerCase().includes(lowerKeyword) ||
			preset.description.toLowerCase().includes(lowerKeyword)
	);
}

/**
 * 创建自定义配置（基于预设）
 * @param basePresetId 基础预设 ID
 * @param customizations 自定义修改
 * @returns 自定义配置
 */
export function createCustomConfig(
	basePresetId: PresetId,
	customizations: Partial<RegexParsingConfig>
): RegexParsingConfig {
	const basePreset = getPreset(basePresetId);
	if (!basePreset) {
		throw new Error(`预设配置不存在: ${basePresetId}`);
	}

	return {
		...basePreset.config,
		...customizations,
	};
}

/**
 * 验证正则配置
 * @param config 配置对象
 * @returns 验证结果
 */
export function validateConfig(config: RegexParsingConfig): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	// 检查必填字段
	if (!config.name || !config.name.trim()) {
		errors.push("配置名称不能为空");
	}

	if (!config.mode) {
		errors.push("必须指定解析模式（separator 或 pattern）");
	}

	// 检查模式配置
	if (config.mode === "separator") {
		if (!config.separatorMode) {
			errors.push("分隔符模式需要提供 separatorMode 配置");
		} else {
			if (!config.separatorMode.cardSeparator) {
				errors.push("必须指定卡片分隔符");
			}
		}
	}

	if (config.mode === "pattern") {
		if (!config.patternMode) {
			errors.push("完整模式需要提供 patternMode 配置");
		} else {
			if (!config.patternMode.cardPattern) {
				errors.push("必须指定卡片匹配正则");
			}
			if (typeof config.patternMode.captureGroups.front !== "number") {
				errors.push("必须指定正面内容的捕获组编号");
			}
			if (typeof config.patternMode.captureGroups.back !== "number") {
				errors.push("必须指定背面内容的捕获组编号");
			}
		}
	}

	// 检查 UUID 配置
	if (config.uuidLocation === "inline" && !config.uuidPattern) {
		errors.push("使用 inline UUID 时必须提供 uuidPattern");
	}

	// 尝试验证正则表达式语法
	try {
		if (config.mode === "separator" && config.separatorMode?.cardSeparator) {
			new RegExp(config.separatorMode.cardSeparator);
		}
		if (config.mode === "pattern" && config.patternMode?.cardPattern) {
			new RegExp(config.patternMode.cardPattern, config.patternMode.flags);
		}
		if (config.uuidPattern) {
			new RegExp(config.uuidPattern);
		}
	} catch (error) {
		errors.push(`正则表达式语法错误: ${error instanceof Error ? error.message : "未知错误"}`);
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

/**
 * 根据官方预设 ID 获取示例文档（用于设置页测试）
 */
export function getPresetSampleDocument(presetId: PresetId): string {
	const preset = getPreset(presetId);
	return preset?.example ?? OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT;
}

/**
 * 将官方预设元数据转为可持久化的用户配置
 */
export function cloneOfficialPresetConfig(presetId: PresetId): RegexParsingConfig | null {
	const meta = getPreset(presetId);
	if (!meta) return null;

	const configId = `${OFFICIAL_PRESET_CONFIG_ID_PREFIX}${meta.id}`;
	return {
		...meta.config,
		id: meta.config.id || configId,
		name: meta.config.name || meta.name,
		description: meta.description,
		excludeTags: meta.config.excludeTags ?? [],
	};
}

const DEFAULT_SEPARATOR_MODE_CONFIG: NonNullable<RegexParsingConfig["separatorMode"]> = {
	cardSeparator: "<->",
	frontBackSeparator: "---div---",
	multiline: true,
	emptyLineSeparator: {
		enabled: false,
		lineCount: 2,
	},
};

const DEFAULT_PATTERN_MODE_CONFIG: NonNullable<RegexParsingConfig["patternMode"]> = {
	cardPattern: "",
	flags: "gs",
	captureGroups: {
		front: 1,
		back: 2,
	},
};

function findOfficialPresetMetaForConfig(
	config: RegexParsingConfig
): RegexPresetMeta | undefined {
	return getAllPresets().find(
		(meta) =>
			config.id === meta.config.id ||
			config.id === `${OFFICIAL_PRESET_CONFIG_ID_PREFIX}${meta.id}` ||
			config.id === meta.id ||
			config.name === meta.config.name ||
			config.name === meta.name
	);
}

/**
 * 规范化单个正则解析预设，补全 mode 对应的子配置并修复损坏的官方模板
 */
export function normalizeRegexParsingConfig(config: RegexParsingConfig): RegexParsingConfig {
	const officialMeta = findOfficialPresetMetaForConfig(config);
	const normalized: RegexParsingConfig = { ...config };

	if (officialMeta) {
		const officialConfig = officialMeta.config;
		if (normalized.mode === "pattern") {
			const cardPattern = normalized.patternMode?.cardPattern?.trim();
			if (!cardPattern) {
				normalized.mode = officialConfig.mode;
				normalized.patternMode = officialConfig.patternMode
					? { ...officialConfig.patternMode, captureGroups: { ...officialConfig.patternMode.captureGroups } }
					: undefined;
				normalized.separatorMode = officialConfig.separatorMode
					? { ...officialConfig.separatorMode, emptyLineSeparator: { ...officialConfig.separatorMode.emptyLineSeparator! } }
					: undefined;
			}
		} else if (normalized.mode === "separator") {
			const cardSeparator = normalized.separatorMode?.cardSeparator?.trim();
			if (!cardSeparator && officialConfig.separatorMode?.cardSeparator) {
				normalized.separatorMode = {
					...DEFAULT_SEPARATOR_MODE_CONFIG,
					...officialConfig.separatorMode,
					emptyLineSeparator: {
						...DEFAULT_SEPARATOR_MODE_CONFIG.emptyLineSeparator!,
						...officialConfig.separatorMode.emptyLineSeparator,
					},
				};
			}
		}
	}

	if (normalized.mode === "pattern") {
		normalized.patternMode = {
			...DEFAULT_PATTERN_MODE_CONFIG,
			...normalized.patternMode,
			captureGroups: {
				...DEFAULT_PATTERN_MODE_CONFIG.captureGroups,
				...normalized.patternMode?.captureGroups,
			},
		};

		const cardPattern = normalized.patternMode.cardPattern ?? "";
		const usesLegacyWereadEmptyBack =
			/1F4CC/.test(cardPattern) && /\(\)\s*\$/.test(cardPattern);
		if (usesLegacyWereadEmptyBack) {
			normalized.patternMode.cardPattern = WEREAD_DEFAULT_CARD_PATTERN;
			normalized.patternMode.captureGroups = {
				...normalized.patternMode.captureGroups,
				front: 1,
				back: 2,
			};
		}
	} else if (normalized.mode === "separator") {
		const incoming = normalized.separatorMode;
		normalized.separatorMode = {
			...DEFAULT_SEPARATOR_MODE_CONFIG,
			...incoming,
			emptyLineSeparator: {
				...DEFAULT_SEPARATOR_MODE_CONFIG.emptyLineSeparator!,
				...incoming?.emptyLineSeparator,
			},
		};

		const cardSeparator = normalized.separatorMode.cardSeparator?.trim() ?? "";
		const hasHeadingCardSeparator = /^\^#/.test(cardSeparator);
		if (hasHeadingCardSeparator && incoming?.frontBackSeparator === undefined) {
			normalized.separatorMode.frontBackSeparator = undefined;
			if (incoming?.firstLineAsFront !== false) {
				normalized.separatorMode.firstLineAsFront = true;
			}
		}
	}

	return normalized;
}

/**
 * 规范化预设列表：注入官方模板、补全子配置
 */
export function normalizeRegexParsingPresets(
	presets: RegexParsingConfig[] | undefined
): { presets: RegexParsingConfig[]; changed: boolean } {
	const seeded = ensureBuiltinRegexPresets(presets);
	let changed = seeded.seeded;

	const normalized = seeded.presets.map((preset) => {
		const next = normalizeRegexParsingConfig(preset);
		if (JSON.stringify(next) !== JSON.stringify(preset)) {
			changed = true;
		}
		return next;
	});

	return { presets: normalized, changed };
}

/**
 * 首次使用或列表为空时，注入官方推荐问答题预设，避免新用户无预设可选
 */
export function ensureBuiltinRegexPresets(
	presets: RegexParsingConfig[] | undefined
): { presets: RegexParsingConfig[]; seeded: boolean } {
	const list = Array.isArray(presets) ? [...presets] : [];
	const official = cloneOfficialPresetConfig(OFFICIAL_QA_REGEX_PRESET_ID);
	if (!official) {
		return { presets: list, seeded: false };
	}

	const hasOfficial = list.some(
		(p) =>
			p.id === official.id ||
			p.id === OFFICIAL_QA_REGEX_PRESET_ID ||
			p.name === official.name
	);
	if (hasOfficial) {
		return { presets: list, seeded: false };
	}

	return { presets: [official, ...list], seeded: true };
}

/**
 * 从当前编辑中的配置解析示例文本，匹配 REGEX_PRESETS 中的示例（用于回填测试区）
 */
export function resolveExampleForConfig(
	config: RegexParsingConfig | null | undefined
): string {
	if (!config) return OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT;

	for (const meta of getAllPresets()) {
		if (config.id === meta.config.id || config.id === `${OFFICIAL_PRESET_CONFIG_ID_PREFIX}${meta.id}`) {
			return meta.example;
		}
		if (config.name === meta.config.name || config.name === meta.name) {
			return meta.example;
		}
	}

	if (config.mode === "separator") {
		const cardSep = config.separatorMode?.cardSeparator ?? "<->";
		const fbSep = config.separatorMode?.frontBackSeparator ?? "---div---";
		return `${cardSep}
## 示例问题

${fbSep}
示例答案内容。

${cardSep}`;
	}

	return OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT;
}
