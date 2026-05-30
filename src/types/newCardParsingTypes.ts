/**
 * 新版简化卡片解析系统类型定义
 * 完全替代旧的三位一体模板系统
 */

import { CardType } from "../data/types";
import { CardWithPosition } from "../utils/simplifiedParser/CardPositionTracker";

/**
 * 单文件单卡片配置
 * 场景2：一个md文件 = 一张卡片
 */
export interface SingleCardConfig {
	// 内容结构
	contentStructure: "front-back-split" | "whole-file";

	// 正反面分隔符（当contentStructure为front-back-split时使用）
	frontBackSeparator: string; // 默认 "---div---"

	// UUID位置（场景2固定使用frontmatter）
	uuidLocation: "frontmatter";

	// 同步方法（场景2推荐使用mtime对比）
	syncMethod: "mtime-compare";

	// 排除标签
	excludeTags: string[]; // 默认 ['禁止同步']
}

/**
 * 正则表达式解析配置
 * 场景1：单文件多卡片的自定义格式解析
 */
export interface RegexParsingConfig {
	id?: string;
	// 配置名称
	name: string;
	description?: string;

	// 解析模式
	mode: "separator" | "pattern";

	// 分隔符模式（推荐，简单易用）
	separatorMode?: {
		// 卡片分隔符（正则表达式字符串）
		cardSeparator: string; // 例如：'^##\\s+(.+)$'

		// 正反面分隔符
		frontBackSeparator?: string; // 例如：'^---$'

		// 是否多行匹配
		multiline: boolean;

		// 空行分隔符配置（与 cardSeparator 互斥）
		emptyLineSeparator?: {
			enabled: boolean; // 是否启用空行分隔符
			lineCount: number; // 空行数量（默认2行）
		};
	};

	// 正则模式（简化版）
	// 直接使用正则表达式匹配全文，通过捕获组提取卡片内容
	patternMode?: {
		// 卡片匹配正则表达式（直接在全文中匹配所有卡片）
		cardPattern: string; // 例如：'Q:\\s*(.+?)\\s*A:\\s*(.+?)'

		// 正则标志
		flags: string; // 默认 'gs'（g=全局匹配，s=.匹配换行符）

		// 捕获组映射（指定问题和答案在哪个捕获组）
		captureGroups: {
			front: number; // 正面内容（问题）在第几个捕获组
			back: number; // 背面内容（答案）在第几个捕获组
			tags?: number; // 可选：标签在第几个捕获组
		};
	};

	// UUID位置
	//  单文件多卡片模式不支持frontmatter，只能使用inline或none
	uuidLocation: "inline" | "frontmatter" | "none";

	// UUID匹配正则（如果使用inline，统一格式，不可编辑）
	uuidPattern?: string; // 统一格式：'<!-- (tk-[a-z0-9]{12}) -->'

	// 排除标签
	excludeTags: string[];

	// 是否自动添加UUID
	autoAddUUID: boolean;

	// 同步方法
	syncMethod: "tag-based" | "full-sync";
}

/**
 * 单文件多卡片配置
 * 场景1：一个md文件包含多张卡片
 */
export interface MultiCardsConfig {
	// 正则解析配置
	parsingConfig?: RegexParsingConfig;

	// 或者选择预设配置
	usePreset?: string; // 'default' | 'qa-format' | 'heading-based' | 'custom'

	selectedPresetId?: string;
	selectedPresetName?: string;
}

/**
 * 文件夹/文件牌组映射
 */
export interface FolderDeckMapping {
	id: string;
	type: "folder" | "file";
	path: string;
	targetDeckId: string;
	targetDeckName: string;
	includeSubfolders: boolean;
	enabled: boolean;

	// 文件模式
	fileMode: "single-card" | "multi-cards"; // 默认 'single-card'

	// 场景 2 配置（单文件单卡片）
	singleCardConfig?: SingleCardConfig;

	// 场景 1 配置（单文件多卡片）
	multiCardsConfig?: MultiCardsConfig;

	// 统计信息字段
	fileCount?: number; // 卡片数量统计
	lastScanned?: string; // 最后扫描时间（ISO字符串）

	// 向后兼容字段
	folderPath?: string;
}

/**
 * 简化解析设置 - 全局配置
 */
export interface SimplifiedParsingSettings {
	// 标签触发配置
	enableTagTrigger: boolean;
	triggerTag: string;

	// 核心分隔符配置（全局适用）
	symbols: {
		cardDelimiter: string; // 卡片分隔符
		faceDelimiter: string; // 正反面分隔符
		clozeMarker: string; // 挖空标记
		rangeStart?: string; // 批量范围起始标记
		rangeEnd?: string; // 批量范围结束标记
	};

	// 批量解析配置
	batchParsing: {
		autoCreateBlockLinks: boolean; // 自动创建块链接
		autoSetSourceFile: boolean; // 自动设置源文件
		blockIdPrefix: string; // 块ID前缀
		insertMetadata: boolean; // 是否插入完整元数据（UUID、时间戳）

		// 自动触发配置
		autoTrigger: boolean; // 是否启用自动触发
		triggerDebounce: number; // 自动触发防抖延迟（毫秒）
		onlyActiveFile: boolean; // 自动触发仅限活动文件

		// 扫描范围配置
		includeFolders: string[]; // 包含的文件夹路径
		excludeFolders: string[]; // 排除的文件夹路径
		maxFilesPerBatch: number; // 批量处理最大文件数

		// 卡片保存配置
		defaultDeckId?: string; // 默认牌组ID（用于批量解析）
		defaultPriority: number; // 默认优先级

		//  文件夹/文件牌组映射（持久化配置）
		folderDeckMappings?: Array<{
			id: string;
			type?: "folder" | "file";
			path?: string;
			folderPath?: string; // 向后兼容
			targetDeckId: string;
			targetDeckName: string;
			includeSubfolders: boolean;
			enabled: boolean;
		}>;

		// 自动同步配置
		autoSync?: {
			enabled: boolean; // 是否启用自动同步
			watchActiveFile: boolean; // 监控活动文档
			debounceDelay: number; // 防抖延迟（毫秒）
			onlyInMappedFolders: boolean; // 只同步映射的文件夹
		};

		// 冲突处理配置
		conflictResolution?: {
			defaultStrategy: "ask-user" | "prefer-source" | "prefer-weave"; // 默认策略
			showConflictNotification: boolean; // 显示冲突通知
		};

		// 排除标签配置
		excludeTags?: string[]; // 包含这些标签的卡片将被跳过（标签不含#前缀）

		// 强制同步标签配置
		forceSyncTags?: string[]; // 包含这些标签的卡片将强制从源文档覆盖到Weave（标签不含#前缀）
	};

	// 正则预设管理
	regexPresets?: RegexParsingConfig[]; // 用户自定义的正则解析预设

	// 模板系统配置
	enableTemplateSystem: boolean;
	templates: ParseTemplate[];
	defaultTemplateId?: string;
}

/**
 * 解析模板 - 统一的模板定义
 *
 *  重要说明：
 * - 模板系统仅用于 AI 生成和单卡编辑
 * - 批量解析功能已完全迁移到"分隔符配置"系统
 * - `complete-regex` 类型已废弃，保留仅用于向后兼容
 */
export interface ParseTemplate {
	id: string;
	name: string;
	description?: string;

	// 模板类型
	//  注意：'complete-regex' 已废弃，批量解析请使用分隔符配置
	type: "single-field" | "complete-regex";

	// 单字段解析配置（用于 AI 生成和单卡编辑）
	fields?: TemplateField[];

	//  以下字段已废弃：完整正则解析功能已迁移到分隔符配置系统
	/** Compatibility note: 批量解析请使用分隔符配置，保留仅用于向后兼容 */
	regex?: string;
	/** Compatibility note: 批量解析请使用分隔符配置，保留仅用于向后兼容 */
	flags?: string;
	/** Compatibility note: 批量解析请使用分隔符配置，保留仅用于向后兼容 */
	fieldMappings?: Record<string, number>;

	// 应用场景
	scenarios: TemplateScenario[];

	// 元数据
	isDefault?: boolean;
	isOfficial?: boolean;
	createdAt?: string;
	updatedAt?: string;

	// 同步能力标识（用于 AnkiConnect 同步）
	syncCapability?: {
		ankiModelMapping?: {
			modelId?: number;
			modelName: string;
			lastSyncVersion?: string;
		};
	};

	// Weave 元数据（用于模板识别和版本管理）
	weaveMetadata?: {
		signature: string;
		version: string;
		ankiCompatible: boolean;
		source: "weave_created" | "anki_imported" | "user_custom" | "official";
		createdInWeave?: boolean;
		editedInWeave?: boolean;
	};
}

/**
 * 模板字段定义
 */
export interface TemplateField {
	name: string; // 字段名称（如：Front, Back, Tags）
	pattern: string; // 模式字符串（可以是正则或普通文本）
	isRegex: boolean; // 是否为正则表达式
	flags?: string; // 正则标志（仅当isRegex为true时使用）
	required?: boolean; // 是否必需
	description?: string; // 字段描述

	// Anki兼容性字段 (用于APKG导入和AnkiConnect同步)
	type?: "field"; // 字段类型，默认为'field'
	side?: "front" | "back" | "both"; // 字段显示位置
	key?: string; // 字段键名（用于从card.fields中提取内容）
}

/**
 * 模板应用场景
 */
export type TemplateScenario = "newCard" | "study" | "batch" | "edit";

/**
 * 解析结果
 */
export interface ParseResult {
	success: boolean;
	cards: ParsedCard[];
	errors: ParseError[];
	stats: ParseStats;
	templateUsed?: string;
}

/**
 * 解析后的卡片
 *  Content-Only 架构：统一使用 content
 */
export interface ParsedCard {
	id?: string;
	type: CardType;

	content?: string; // 卡片完整内容

	tags: string[];
	metadata?: CardMetadata;
	template?: string; // Compatibility note: templateId 为可选

	// 源信息字段
	sourceFile?: string; // 源文件路径
	sourceBlock?: string; // 块链接 (格式: ^blockId)

	// 自定义字段（向后兼容）
	customFields?: Record<string, any>;
}

/**
 * 卡片类型
 *  统一使用 src/data/types.ts 的 CardType 枚举
 * 注意：不再重复定义，直接从 data/types 导入
 */
export type { CardType } from "../data/types";

/**
 * 卡片元数据
 */
export interface CardMetadata {
	sourceContent?: string;
	parseMethod?: "symbol" | "template";
	confidence?: number;

	warnings?: string[];

	// 批量扫描相关
	isBatchScanned?: boolean;
	lastScannedAt?: string;
	lastScannedContent?: string;
	isNewCard?: boolean;
	fileMtime?: number;

	// 批量解析相关元数据
	parseMode?: "regex" | "single-card"; // 解析模式：正则解析 或 单文件单卡片
	regexConfig?: string; // 正则预设配置名称（仅用于regex模式）
	cardIndex?: number; // 卡片在文件中的索引（用于调试和追踪）
	blockId?: string; // 块ID（不带^前缀）
	uuid?: string; // 卡片 UUID（用于防重复和关联）
	originalCardContent?: string; // 卡片原始内容（用于定位）
	contentWithBlockId?: string; // 包含块ID的内容

	// 批量解析目标信息
	targetDeckId?: string; // 目标牌组ID（批量解析时使用）
	targetDeckName?: string; // 目标牌组名称（用于显示）

	// 卡片内容
	content?: string; // 卡片完整内容

	// 牌组信息（向后兼容）
	deckId?: string; // 牌组ID（兼容旧代码）

	// 源文件信息
	sourceFile?: string; // 源文件路径
	sourceBlock?: string; // 源块ID
}

/**
 * 解析错误
 */
export interface ParseError {
	type: "syntax" | "validation" | "template" | "symbol";
	message: string;
	line?: number;
	column?: number;
	cardIndex?: number;
	suggestion?: string;
}

/**
 * 解析统计
 */
export interface ParseStats {
	totalCards: number;
	successfulCards: number;
	failedCards: number;
	cardTypes: Record<CardType, number>;
	templatesUsed: Record<string, number>;
	processingTime: number;
}

/**
 * 解析配置
 */
export interface ParseConfig {
	settings: SimplifiedParsingSettings;
	scenario: TemplateScenario;
	templateId?: string;
	enableValidation?: boolean;
	enableStats?: boolean;
}

/**
 * 批量解析配置
 */
export interface BatchParseConfig extends ParseConfig {
	maxCards?: number;
	skipErrors?: boolean;
	progressCallback?: (progress: number, current: number, total: number) => void;

	// 批量解析源信息
	sourceFile?: string; // 源文件路径
	sourceFileName?: string; // 源文件名
	sourceContent?: string; // 源文档完整内容（用于块链接插入）

	// 内容更新回调
	onContentUpdated?: (updatedContent: string) => void | Promise<void>;
}

/**
 * 单卡解析配置
 */
export interface SingleCardParseConfig extends ParseConfig {
	allowEmpty?: boolean;
	defaultType?: CardType;
}

/**
 * 模板验证结果
 */
export interface TemplateValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	suggestions: string[];
}

/**
 * 符号配置验证结果
 */
export interface SymbolValidationResult {
	isValid: boolean;
	conflicts: string[];
	suggestions: string[];
}

/**
 * 解析器接口
 */
export interface ICardParser {
	parseContent(content: string, config: ParseConfig): Promise<ParseResult>;
	parseSingleCard(content: string, config: SingleCardParseConfig): Promise<ParsedCard | null>;
	parseBatchCards(
		content: string,
		config: BatchParseConfig
	): Promise<{
		cards: ParsedCard[];
		positions: CardWithPosition[];
	}>;
	validateTemplate(template: ParseTemplate): TemplateValidationResult;
	validateSymbols(symbols: SimplifiedParsingSettings["symbols"]): SymbolValidationResult;
}

/**
 * 默认设置
 */
/** Fallback exclude folder name when no Vault context exists yet. */
// eslint-disable-next-line obsidianmd/hardcoded-config-path -- default parsing exclude list only
const DEFAULT_OBSIDIAN_CONFIG_FOLDER = ".obsidian";

export const DEFAULT_SIMPLIFIED_PARSING_SETTINGS: SimplifiedParsingSettings = {
	enableTagTrigger: true,
	triggerTag: "#weave",
	symbols: {
		cardDelimiter: "<->", //  官方正确默认值：<->
		faceDelimiter: "---div---",
		clozeMarker: "==",
	},
	batchParsing: {
		autoCreateBlockLinks: false,
		autoSetSourceFile: true,
		blockIdPrefix: "weave",
		insertMetadata: false,

		// 自动触发配置默认值
		autoTrigger: false, // 默认关闭（避免干扰新用户）
		triggerDebounce: 2000, // 2秒防抖
		onlyActiveFile: true, // 仅活动文件

		// 扫描范围配置默认值
		includeFolders: [], // 默认空（扫描全部）
		excludeFolders: [
			// 默认排除这些文件夹
			DEFAULT_OBSIDIAN_CONFIG_FOLDER,
			".trash",
			"node_modules",
			".git",
		],
		maxFilesPerBatch: 50, // 一次最多处理50个文件

		// 卡片保存配置默认值
		defaultDeckId: undefined, // 默认不指定（使用第一个牌组）
		defaultPriority: 0, // 默认优先级为0

		//  文件夹/文件牌组映射默认值（持久化配置）
		folderDeckMappings: [], // 默认为空数组

		// 自动同步配置默认值
		autoSync: {
			enabled: false, // 默认关闭（让用户主动启用）
			watchActiveFile: true, // 监控活动文档
			debounceDelay: 2000, // 2秒防抖
			onlyInMappedFolders: true, // 只同步映射的文件夹
		},

		// 冲突处理配置默认值
		conflictResolution: {
			defaultStrategy: "ask-user", // 默认询问用户
			showConflictNotification: true, // 显示冲突通知
		},

		// 排除标签配置默认值
		excludeTags: ["skip"], // 默认排除标签

		// 强制同步标签配置默认值
		forceSyncTags: ["自动同步"], // 默认强制同步标签
	},
	enableTemplateSystem: true,
	templates: [], // 将在运行时填充DEFAULT_TEMPLATES
	defaultTemplateId: "official-qa",
};

/**
 * 默认单文件单卡片配置
 */
export const DEFAULT_SINGLE_CARD_CONFIG: SingleCardConfig = {
	contentStructure: "front-back-split",
	frontBackSeparator: "---div---",
	uuidLocation: "frontmatter",
	syncMethod: "mtime-compare",
	excludeTags: ["禁止同步"],
};

/**
 * 创建默认的文件夹牌组映射
 */
export function createDefaultFolderDeckMapping(
	path: string,
	targetDeckId: string,
	targetDeckName: string
): FolderDeckMapping {
	return {
		id: `mapping-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
		type: "folder",
		path,
		targetDeckId,
		targetDeckName,
		includeSubfolders: true,
		enabled: true,
		fileMode: "single-card", // 默认使用单文件单卡片模式
		singleCardConfig: { ...DEFAULT_SINGLE_CARD_CONFIG },
	};
}

/**
 * 默认模板
 */
export const DEFAULT_TEMPLATES: ParseTemplate[] = [
	{
		id: "official-qa",
		name: "问答题",
		description: "标准的问答题模板，支持二级标题和正反面分离",
		type: "single-field",
		fields: [
			//  优先捕获二级标题，兼容通用格式
			{
				name: "Front",
				pattern: "^(?:##\\s*(.+?)(?=\\n|---div---|$)|(.+?)(?=---div---|$))",
				isRegex: true,
				flags: "ms",
				required: true,
			},
			{
				name: "Back",
				pattern: "---div---([\\s\\S]+)$",
				isRegex: true,
				flags: "ms",
				required: false,
			},
			{
				name: "Tags",
				pattern: "#([\\w\\u4e00-\\u9fa5]+)",
				isRegex: true,
				flags: "g",
				required: false,
			},
		],
		scenarios: ["newCard", "study", "edit"],
		isDefault: true,
		isOfficial: true,
	},
	{
		id: "official-choice",
		name: "选择题",
		description: "选择题模板，支持中英文，输出结构化字段",
		type: "single-field",
		fields: [
			// 题干：支持 ## 标题或首段
			{
				name: "question",
				pattern: "^##\\s*(.+?)(?=\\n|$)",
				isRegex: true,
				flags: "m",
				required: true,
			},
			// 选项：A. / A、 格式多行块
			{
				name: "options",
				pattern: "^(?:[A-E][\\.．、]\\s.*(?:\\n|$))+",
				isRegex: true,
				flags: "m",
				required: true,
			},
			// 正确答案：支持中英文标识
			{
				name: "correct_answer",
				pattern: "^(?:(?:正确答案|答案|Correct Answer|Answer)[:：]\\s*([A-E]))",
				isRegex: true,
				flags: "mi",
				required: true,
			},
			// 解析（可选）
			{
				name: "explanation",
				pattern: "(?:解析|Explanation)[:：]\\s*(.+?)(?=\\n|$)",
				isRegex: true,
				flags: "mi",
				required: false,
			},
			// 标签（可选）
			{
				name: "tags",
				pattern: "#([\\w\\u4e00-\\u9fa5/_-]+)",
				isRegex: true,
				flags: "g",
				required: false,
			},
		],
		scenarios: ["newCard", "study", "edit"],
		isDefault: true,
		isOfficial: true,
	},
	{
		id: "official-cloze",
		name: "填空题",
		description: "挖空题模板，支持 Obsidian 高亮和 Anki 语法",
		type: "single-field",
		fields: [
			{
				name: "Text",
				pattern: "^(.+?)(?=---div---|$)",
				isRegex: true,
				flags: "ms",
				required: true,
			},
			{ name: "Cloze", pattern: "==(.+?)==", isRegex: true, flags: "g", required: true }, //  主用 Obsidian 高亮
			{
				name: "ClozeAnki",
				pattern: "\\{\\{c\\d+::(.+?)\\}\\}",
				isRegex: true,
				flags: "g",
				required: false,
			}, //  兼容 Anki
			{
				name: "Extra",
				pattern: "---div---([\\s\\S]+)$",
				isRegex: true,
				flags: "ms",
				required: false,
			},
			{
				name: "Tags",
				pattern: "#([\\w\\u4e00-\\u9fa5]+)",
				isRegex: true,
				flags: "g",
				required: false,
			},
		],
		scenarios: ["newCard", "study", "edit"],
		isDefault: true,
		isOfficial: true,
	},
	//  已删除：batch-complete 模板（批量解析功能已完全迁移到分隔符配置系统）
];
