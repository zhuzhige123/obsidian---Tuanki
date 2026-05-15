// Anki Plugin Data Types
// 定义所有数据结构，包括牌组、卡片和FSRS学习数据

// 导入关系系统类型
import type { CardRelationMetadata } from "../services/relation/types";
//  导入国际化语言类型
import type { SupportedLanguage } from "../utils/i18n";

// 重新导出常用类型（向后兼容）
export { ConflictResolution } from "../services/identifier/types";

// ===== FSRS算法参数 =====

// 优化历史记录条目
export interface OptimizationHistoryEntry {
	timestamp: number;
	reviewCount: number;
	phase: "baseline" | "phase1" | "phase2" | "optimized";
	oldWeights: number[];
	newWeights: number[];
	metrics: {
		accuracy?: number;
		rmse?: number;
		logLoss?: number;
	};
	accepted: boolean;
	note?: string;
}

// 待确认的优化建议
export interface PendingOptimization {
	suggestedWeights: number[];
	timestamp: number;
	reviewCount: number;
	phase: string;
	metrics: {
		accuracy?: number;
		improvement?: number;
	};
}

export interface FSRSParameters {
	// FSRS6算法参数 (21个权重参数)
	w: number[]; // 权重参数 (FSRS6标准为21个参数)
	requestRetention: number; // 目标记忆率 (0.5-0.99)
	maximumInterval: number; // 最大间隔天数
	enableFuzz: boolean; // 是否启用随机化

	// 优化历史记录
	optimizationHistory?: OptimizationHistoryEntry[];

	// 待确认的优化建议
	pendingOptimization?: PendingOptimization;
}

export interface FSRSCard {
	// FSRS6卡片状态
	due: string; // 下次复习时间 (ISO 8601 string)
	stability: number; // 稳定性
	difficulty: number; // 难度 (1-10)
	elapsedDays: number; // 已经过天数
	scheduledDays: number; // 预定天数
	reps: number; // 复习次数
	lapses: number; // 遗忘次数
	state: CardState; // 卡片状态
	lastReview?: string; // 上次复习时间 (ISO 8601 string)
	retrievability: number; // 可提取性 (0-1)

	// FSRS6兼容性字段 (可选，用于向后兼容)
	reviewHistory?: ReviewLog[]; // 完整复习历史
}

export enum CardState {
	New = 0, // 新卡片
	Learning = 1, // 学习中
	Review = 2, // 复习
	Relearning = 3, // 重新学习
}

export enum Rating {
	Again = 1, // 再次学习
	Hard = 2, // 困难
	Good = 3, // 良好
	Easy = 4, // 简单
}

export interface ReviewLog {
	// 复习记录
	rating: Rating;
	state: CardState;
	due: string; // (ISO 8601 string)
	stability: number;
	difficulty: number;
	elapsedDays: number;
	lastElapsedDays: number;
	scheduledDays: number;
	review: string; // (ISO 8601 string)
}

// 类型别名（向后兼容）
export type Review = ReviewLog;

// ===== 选择题统计接口 =====

/**
 * 选择题答题历史记录
 */
export interface ChoiceAttempt {
	timestamp: string; // 答题时间 (ISO 8601)
	selectedOptions: string[]; // 用户选择的选项标签 (如 ['A', 'C'])
	correctOptions: string[]; // 正确答案标签
	correct: boolean; // 是否回答正确
	responseTime: number; // 反应时间（毫秒）
}

/**
 * 选择题专用统计数据
 */
export interface ChoiceQuestionStats {
	totalAttempts: number; // 总尝试次数
	correctAttempts: number; // 正确次数
	accuracy: number; // 正确率 (0-1)
	averageResponseTime: number; // 平均反应时间（毫秒）

	// 历史记录（最近10次）
	recentAttempts: ChoiceAttempt[];

	// 错题集标记
	isInErrorBook: boolean; // 是否在错题集中
	errorCount: number; // 累计错误次数
	lastErrorDate?: string; // 最后一次错误时间 (ISO 8601)
}

export interface Card {
	// ===== 基础标识 =====
	id?: string;
	uuid: string; // 唯一标识符（原id字段已废弃）

	/**
	 * Compatibility note: retained for legacy reference deck data and planned for removal
	 *
	 * 迁移说明：
	 * - 旧架构：卡片通过 deckId 绑定到单个牌组
	 * - 新架构：卡片通过 referencedByDecks 支持多牌组引用
	 * - 迁移后：使用 referencedByDecks[0] 获取主牌组（向后兼容）
	 *
	 * @see referencedByDecks 新的多牌组引用字段
	 */
	deckId?: string;

	/**
	 * Compatibility note: retained for legacy YAML metadata and planned for removal
	 *
	 * 迁移说明：
	 * - 旧架构：卡片通过 referencedByDecks 存储牌组ID引用
	 * - 新架构：牌组信息存储在 content 的 YAML frontmatter we_decks 字段
	 * - 迁移后：使用 CardMetadataCache.getMetadata(card).deckIds 获取
	 *
	 * @see CardMetadataCache 运行时缓存服务
	 * @see yaml-utils.ts YAML 解析工具
	 */
	referencedByDecks?: string[];

	templateId?: string; // 关联的字段模板ID（可选，仅用于 Anki 导出）

	/**
	 * Compatibility note: retained for legacy YAML metadata and planned for removal
	 *
	 * 迁移说明：
	 * - 旧架构：卡片类型存储在 type 字段
	 * - 新架构：卡片类型存储在 content 的 YAML frontmatter we_type 字段
	 * - 迁移后：使用 CardMetadataCache.getMetadata(card).type 获取
	 *
	 * @see CardMetadataCache 运行时缓存服务
	 */
	type?: CardType;

	// 题库功能
	cardPurpose?: "memory" | "test"; // 卡片用途：memory=记忆学习, test=题库测试
	difficulty?: "easy" | "medium" | "hard"; // 题目难度（题库卡片专用）

	// 父子卡片关系
	parentCardId?: string; // 父卡片UUID（子卡片填写，用于建立层级关系）
	relationMetadata?: CardRelationMetadata; // 完整的卡片关系元数据

	// ===== 内容存储（Content-Only 架构）=====
	//  content: 唯一权威数据源 - 用户编辑的原始Markdown内容（包含语义标记、分隔符等）
	//  fields: 已废弃 - 将在下个版本完全移除
	content: string; //  唯一权威数据源 - 原始Markdown内容（包含语义标记）

	/**
	 * Compatibility note: 此字段已废弃，将在下个版本移除
	 *
	 * Content-Only 架构迁移说明：
	 * - 旧版本：卡片内容存储在 content 和 fields 两处（数据冗余）
	 * - 新版本：只使用 content 作为唯一权威数据源
	 * - 迁移后：需要时通过 Parser 实时解析 content 获取结构化字段
	 * - Anki 同步：导出时实时解析 content 生成 Anki fields
	 *
	 * 使用 Parser 替代方案：
	 * ```typescript
	 * import { QACardParser } from './parsers/card-type-parsers/QACardParser';
	 * const parser = new QACardParser();
	 * const result = parser.parseMarkdownToFields(card.content, 'basic-qa');
	 * const front = result.fields?.front; // 动态获取 front 字段
	 * ```
	 *
	 * @see MarkdownFieldsConverter Parser 基类
	 */
	fields?: Record<string, string>;

	// choiceQuestionData 字段已删除
	// 选择题信息存储在content字段的Markdown中，预览时动态解析（Content-First架构）

	// ===== 语义标记系统元数据 =====
	// 从content中解析出的额外字段信息（hint、explanation等）
	parsedMetadata?: import("../types/metadata-types").CardMetadata;

	// ===== Obsidian溯源信息 =====
	/**
	 * Compatibility note: retained for legacy YAML metadata and planned for removal
	 *
	 * 迁移说明：
	 * - 旧架构：源文档路径存储在 sourceFile 字段
	 * - 新架构：存储在 content 的 YAML frontmatter we_source 字段
	 * - 迁移后：使用 CardMetadataCache.getMetadata(card).source 获取
	 */
	sourceFile?: string;
	sourceDocumentKey?: string;
	sourceSubunitKey?: string;
	sourceKind?: "markdown" | "pdf" | "epub" | "unknown";
	outputKind?: "extract" | "memory";
	primaryAssociatedNotePath?: string;
	associatedNotePath?: string;
	associatedNotePaths?: string[];

	/**
	 * Compatibility note: retained for legacy YAML metadata and planned for removal
	 *
	 * 迁移说明：
	 * - 旧架构：块引用ID存储在 sourceBlock 字段
	 * - 新架构：存储在 content 的 YAML frontmatter we_block 字段
	 * - 迁移后：使用 CardMetadataCache.getMetadata(card).block 获取
	 */
	sourceBlock?: string;
	sourceRange?: SourceRange; // 精确位置（新增）
	sourceExists?: boolean; // 源文档是否仍存在

	// 批量扫描元数据
	isBatchScanned?: boolean; // 是否通过批量扫描创建
	lastScannedContent?: string; // 最后扫描时的内容快照（用于三方合并）
	lastScannedAt?: string; // 最后扫描时间 (ISO 8601)
	modifiedInWeave?: boolean; // 是否在Weave中手动修改过
	isNewCard?: boolean; // 是否是新创建的卡片（批量解析标记）
	fileMtime?: number; // 源文件修改时间戳（用于同步判断）

	// 增量同步元数据
	deletedAt?: number; // 删除时间戳（Unix时间戳，毫秒）
	deletionSource?: "obsidian" | "weave" | "manual"; // 删除来源
	lastSyncTime?: number; // 上次同步时间戳（Unix时间戳，毫秒）
	sourceFileMtime?: number; // 源文件修改时间戳（Unix时间戳，毫秒）
	contentHash?: string; // 内容哈希（用于精确变更检测）

	// ===== FSRS学习数据（仅记忆卡片）=====
	// 考试卡片（cardPurpose='test'）不使用这些字段，由类型系统区分
	fsrs?: FSRSCard; // 仅当cardPurpose='memory'时存在
	reviewHistory?: ReviewLog[]; // 仅当cardPurpose='memory'时存在

	// ===== 统计信息 =====
	stats: {
		// 基础统计（所有卡片）
		totalReviews: number;
		totalTime: number; // 总学习时间(秒)
		averageTime: number; // 平均时间

		// 记忆卡片专用（cardPurpose='memory'）
		memoryRate?: number; // 记忆成功率
		predictionAccuracy?: number; // 预测准确性
		stabilityTrend?: number; // 稳定性趋势
		difficultyTrend?: number; // 难度趋势

		// 通用错题追踪（适用于所有题型）
		errorTracking?: {
			isInErrorBook: boolean; // 是否在错题集中
			errorCount: number; // 累计错误次数
			correctCount: number; // 累计正确次数
			accuracy: number; // 正确率 (0-1)
			lastErrorDate?: string; // 最后一次错误时间 (ISO 8601)
			errorLevel?: "light" | "medium" | "severe"; // 错题等级
		};

		// 选择题专用统计（仅选择题类型有效）
		choiceStats?: ChoiceQuestionStats;

		// 题库测试统计，仅 test 类型卡片有效
		testStats?: import("../types/question-bank-types").QuestionTestStats;
	};

	// ===== FSRS6个性化数据 =====
	personalization?: {
		personalizedWeights?: number[]; // 个性化权重
		learningPattern?: string; // 学习模式识别
		optimalInterval?: number; // 最优间隔
		confidenceLevel?: number; // 置信水平
	};

	// ===== 时间戳 =====
	created: string; // 创建时间 (ISO 8601 string)
	modified: string; // 修改时间 (ISO 8601 string)

	// ===== 标签和优先级 =====
	/**
	 * Compatibility note: retained for legacy YAML metadata and planned for removal
	 *
	 * 迁移说明：
	 * - 旧架构：标签存储在 tags 字段
	 * - 新架构：标签存储在 content 的 YAML frontmatter tags 字段 + 正文 #标签
	 * - 迁移后：使用 CardMetadataCache.getMetadata(card).tags 获取
	 * - 或直接使用 extractAllTags(card.content) 提取
	 */
	tags?: string[];

	/**
	 * Compatibility note: retained for legacy YAML metadata and planned for removal
	 *
	 * 迁移说明：
	 * - 旧架构：优先级存储在 priority 字段
	 * - 新架构：存储在 content 的 YAML frontmatter we_priority 字段
	 * - 迁移后：使用 CardMetadataCache.getMetadata(card).priority 获取
	 */
	priority?: number;

	// ===== 来源标识 =====
	source?: "weave" | "anki" | "apkg" | "incremental"; // 卡片创建来源

	// ===== 扩展字段 =====
	customFields?: {
		ankiOriginal?: {
			noteId: number;
			modelId: number;
			modelName: string;
			fields: Record<string, string>;
			tags: string[];
		};
		[key: string]: unknown;
	};

	// ===== 元数据 =====
	metadata?: {
		fieldSideMap?: Record<string, "front" | "back" | "both">;
		ankiModel?: {
			id: number;
			name: string;
			fields: string[];
		};

		// 题库题目元数据
		questionMetadata?: import("../types/question-bank-types").QuestionMetadata;

		// 回收信息
		recycleInfo?: import("../utils/recycle-utils").RecycleInfo;

		[key: string]: unknown;
	};

	//  向后兼容：额外数据字段（用于扩展）
	extra?: Record<string, unknown>;

	// 增量阅读视图扩展字段（运行时临时字段，非持久化）
	ir_title?: string;
	ir_source_file?: string;
	ir_deck?: string;
	ir_state?: string;
	ir_priority?: number;
	ir_tags?: string[];
	ir_favorite?: boolean;
	ir_next_review?: string | null;
	ir_review_count?: number;
	ir_reading_time?: number;
	ir_notes?: number;
	ir_extract_cards?: number;
	ir_memory_cards?: number;
	ir_source_kind?: "markdown" | "pdf" | "epub" | "unknown";
	ir_source_subunit?: string;
	ir_created?: string;
}

export enum CardType {
	Basic = "basic", // 基础问答卡片
	Cloze = "cloze", // 普通挖空卡片（单个或多个同时显示）
	Multiple = "multiple", // 多选卡片
	Code = "code", // 代码卡片

	// 渐进式挖空架构
	ProgressiveParent = "progressive-parent", // 渐进式挖空父卡片（仅存储content）
	ProgressiveChild = "progressive-child", // 渐进式挖空子卡片（独立UUID和FSRS）

	// 增量阅读内容块类型（用于卡片管理界面显示）
	IRBlock = "ir-block", // 增量阅读内容块（旧格式）
	IRChunk = "ir-chunk", // 增量阅读内容块（新格式）
}

/**
 * 牌组类型
 * - mixed: 混合题型（默认），可以添加所有类型的卡片
 * - choice-only: 选择题专用，只能添加选择题类型的卡片
 * - question-bank: 题库牌组，用于考试测试，不使用FSRS记忆算法
 */
export type DeckType = "mixed" | "choice-only" | "question-bank";

/**
 * 牌组分类（用于彩色圆点过滤）
 */
export interface DeckCategory {
	id: string;
	name: string;
	colorStart: string; // 渐变色起始
	colorEnd: string; // 渐变色结束
	order: number; // 显示顺序
	isDefault: boolean; // 是否为默认分类
	created: string;
	modified: string;
}

/**
 * 默认分类
 */
export const DEFAULT_CATEGORIES: DeckCategory[] = [
	{
		id: "basic",
		name: "基础",
		colorStart: "#ef4444",
		colorEnd: "#dc2626",
		order: 0,
		isDefault: true,
		created: new Date().toISOString(),
		modified: new Date().toISOString(),
	},
	{
		id: "reading",
		name: "阅读",
		colorStart: "#3b82f6",
		colorEnd: "#2563eb",
		order: 1,
		isDefault: true,
		created: new Date().toISOString(),
		modified: new Date().toISOString(),
	},
	{
		id: "interest",
		name: "兴趣",
		colorStart: "#f59e0b",
		colorEnd: "#d97706",
		order: 2,
		isDefault: true,
		created: new Date().toISOString(),
		modified: new Date().toISOString(),
	},
];

export interface Deck {
	// ===== 基础信息 =====
	id: string;
	name: string;
	description: string;
	category: string; // 分类标签（已弃用，保留向后兼容）
	categoryIds?: string[]; // 新的多分类支持

	// 正向引用：引用的卡片 UUID 数组
	cardUUIDs?: string[]; // 牌组引用的卡片UUID列表

	// ===== 层级结构（已废弃 - 不再支持父子牌组层级）=====
	/**
	 * Compatibility note: retained for legacy deck hierarchy data; use categoryIds instead
	 *
	 * 迁移说明：
	 * - 旧架构：父子牌组层级结构存储在 parentId 和 parentDeckId 字段
	 * - 新架构：父子牌组层级结构已废弃，请使用 categoryIds
	 * - 迁移后：使用 categoryIds 获取分类标签
	 * - 参考文档：[平级架构文档](https://example.com/flat-architecture)
	 */
	parentId?: string; // 父牌组ID（原parentDeckId，统一命名）
	/**
	 * Compatibility note: retained for legacy deck hierarchy data
	 */
	parentDeckId?: string;
	/**
	 * Compatibility note: retained for legacy deck hierarchy data; use name instead
	 *
	 * 迁移说明：
	 * - 旧架构：层级路径存储在 path 字段
	 * - 新架构：层级路径已废弃，请使用 name 字段
	 * - 迁移后：使用 name 获取牌组名称
	 * - 参考文档：[平级架构文档](https://example.com/flat-architecture)
	 */
	path: string; // 层级路径（如"语言学习::英语::词汇"）
	/**
	 * Compatibility note: retained for legacy deck hierarchy data; use categoryIds instead
	 *
	 * 迁移说明：
	 * - 旧架构：层级深度存储在 level 字段
	 * - 新架构：层级深度已废弃，请使用 categoryIds
	 * - 迁移后：使用 categoryIds 获取分类标签
	 * - 参考文档：[平级架构文档](https://example.com/flat-architecture)
	 */
	level: number; // 层级深度（0=根牌组）
	order: number; // 同级排序（仍然有效，用于排序）

	// ===== 设置继承（已废弃）=====
	/**
	 * Compatibility note: retained for legacy settings inheritance data; use independent settings instead
	 *
	 * 迁移说明：
	 * - 旧架构：设置继承存储在 inheritSettings 字段
	 * - 新架构：设置继承已废弃，请使用独立设置
	 * - 迁移后：使用 settings 获取独立设置
	 * - 参考文档：[平级架构文档](https://example.com/flat-architecture)
	 */
	inheritSettings: boolean; // 是否继承父牌组设置
	settings: DeckSettings;

	// ===== 统计信息（增强）=====
	stats: DeckStats;
	/**
	 * Compatibility note: retained for legacy child deck statistics; use independent statistics instead
	 *
	 * 迁移说明：
	 * - 旧架构：子牌组统计存储在 includeSubdecks 字段
	 * - 新架构：子牌组统计已废弃，请使用独立统计
	 * - 迁移后：使用 stats 获取独立统计
	 * - 参考文档：[平级架构文档](https://example.com/flat-architecture)
	 */
	includeSubdecks: boolean; // 统计是否包含子牌组

	// ===== 视觉元素（新增）=====
	icon?: string; // emoji图标
	color?: string; // 颜色标记

	// ===== 牌组类型（新增）=====
	deckType?: DeckType; // 牌组类型，默认为mixed
	purpose?: "memory" | "test"; // 牌组用途：memory=记忆学习, test=题库测试

	// ===== 知识体系（新增）=====
	knowledgeLevel?: 0 | 1 | 2 | 3; // 知识体系级别：0=基础, 1=中级, 2=高级, 3=专家

	// ===== 时间戳 =====
	created: string; // (ISO 8601 string)
	modified: string; // (ISO 8601 string)

	// ===== 标签和元数据 =====
	tags: string[];
	metadata: Record<string, unknown>;
}

export interface DeckSettings {
	// 牌组学习设置
	newCardsPerDay: number; // 每日新卡片数
	maxReviewsPerDay: number; // 每日最大复习数
	enableAutoAdvance: boolean; // 自动进入下一张
	showAnswerTime: number; // 显示答案时间(秒)

	// FSRS参数
	fsrsParams: FSRSParameters;

	// 学习模式
	learningSteps: number[]; // 学习步骤(分钟)
	relearningSteps: number[]; // 重学步骤
	graduatingInterval: number; // 毕业间隔(天)
	easyInterval: number; // 简单间隔(天)
}

export interface DeckStats {
	// 牌组统计
	totalCards: number;
	newCards: number;
	learningCards: number;
	reviewCards: number;

	// 向后兼容的属性别名
	newCount?: number; // 别名：newCards
	reviewCount?: number; // 别名：reviewCards

	// 今日统计
	todayNew: number;
	todayReview: number;
	todayTime: number;

	// 总体统计
	totalReviews: number;
	totalTime: number;
	memoryRate: number; // 整体记忆率
	averageEase: number; // 平均难度

	// 最后学习时间 (ISO 8601)
	lastStudied?: string;

	// 未来预测
	forecastDays: Record<string, number>; // 未来几天的复习数量
}

// StudySession 已在 study-types.ts 中定义

export interface UserProfile {
	// 用户配置
	id: string;
	name: string;
	created: string; // (ISO 8601 string)

	// 全局设置
	globalSettings: {
		timezone: string;
		language: SupportedLanguage; //  明确类型为 'zh-CN' | 'en-US'
		theme: "light" | "dark" | "auto";

		// 学习偏好
		defaultDeckSettings: DeckSettings;
		enableNotifications: boolean;
		enableSounds: boolean;

		// 高级设置
		enableDebugMode: boolean;
		dataBackupInterval: number; // 备份间隔(小时)
	};

	// 统计总览
	overallStats: {
		totalDecks: number;
		totalCards: number;
		totalStudyTime: number;
		streakDays: number;
		lastStudyDate?: string; // (ISO 8601 string)
	};
}

// 数据导入/导出格式
export interface AnkiExportData {
	version: string;
	exportDate: string; // (ISO 8601 string)
	decks: Deck[];
	cards: Card[];
	userProfile: UserProfile;
}

// API响应类型
export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
	timestamp: string; // (ISO 8601 string)
}

// 数据库查询接口
export interface DataQuery {
	deckId?: string;
	cardIds?: string[];
	state?: CardState;
	dueDate?: {
		from?: string; // (ISO 8601 string)
		to?: string; // (ISO 8601 string)
	};
	tags?: string[];
	limit?: number;
	offset?: number;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

// ===== 源位置范围类型（新增）=====
export interface SourceRange {
	start: { line: number; ch: number };
	end: { line: number; ch: number };
}

// 导入映射接口
export interface ImportMapping {
	// 映射ID (uuid)
	id: string;

	// Weave卡片ID
	weaveCardId: string;

	// Anki Note ID
	ankiNoteId: number;

	// 全局UUID（跨平台追踪）
	uuid: string;

	// 最后同步时间
	lastSyncTime: string; // ISO 8601 string

	// Weave侧最后修改时间
	lastModifiedInWeave: string; // ISO 8601 string

	// Anki侧最后修改时间
	lastModifiedInAnki: string; // ISO 8601 string

	// 同步版本号
	syncVersion: number;

	// 内容指纹（用于快速检测变更）
	contentHash: string;

	// Anki模型信息
	ankiModelId?: number;
	ankiModelName?: string;

	// 同步状态
	syncStatus?: "synced" | "weave_modified" | "anki_modified";
}

// 错题等级类型
export type ErrorLevel = "light" | "medium" | "severe";

// ===== 媒体管理相关类型（新增）=====

// 媒体文件
export interface MediaFile {
	id: string;
	filename: string;

	// 存储路径（按牌组路径组织）
	deckPath: string; // "语言学习::英语::词汇"
	storagePath: string; // "语言学习/英语/词汇/image1.jpg"

	// 文件信息
	hash: string; // SHA256（去重）
	size: number;
	mimeType: string;

	// 引用追踪
	usedByCards: string[]; // 使用此媒体的卡片IDs

	// 时间戳
	created: string;
	lastAccessed: string;
}

// 媒体索引（每个牌组一个）
export interface MediaIndex {
	deckPath: string;
	files: MediaFile[];
	lastUpdated: string;
}

// ===== 引用式牌组系统类型 =====

/**
 * 卡片文件索引
 * 维护全局卡片UUID到文件的映射，支持O(1)查询
 */
export interface CardFileIndex {
	/** 索引版本 */
	version: string;
	/** 文件信息数组 */
	files: CardFileInfo[];
	/** uuid -> fileName 映射（快速查找卡片所在文件） */
	cardLocations: Record<string, string>;
	/** 最后更新时间 (Unix时间戳) */
	lastUpdated: number;
}

/**
 * 卡片文件信息
 * 描述单个卡片存储文件的元数据
 */
export interface CardFileInfo {
	/** 文件名（不含路径和扩展名，如 "default"） */
	fileName: string;
	/** 显示名称（用户可见，如 "默认"） */
	displayName: string;
	/** 描述（可选） */
	description?: string;
	/** 卡片数量 */
	cardCount: number;
	/** 是否为默认文件 */
	isDefault: boolean;
	/** 是否为自动分片文件 */
	isAutoShard: boolean;
	/** 文件标签（可选） */
	tags?: string[];
	/** 颜色标识（hex，可选） */
	color?: string;
	/** 创建时间戳 (Unix时间戳) */
	createdAt: number;
	/** 更新时间戳 (Unix时间戳) */
	updatedAt: number;
}

/**
 * 数据一致性检查结果
 */
export interface DataConsistencyCheckResult {
	/** 检查是否通过 */
	isConsistent: boolean;
	/** 检查时间 */
	checkedAt: number;
	/** 总卡片数 */
	totalCards: number;
	/** 总牌组数 */
	totalDecks: number;
	/** 孤儿卡片（不属于任何牌组） */
	orphanCards: string[];
	/** 无效引用（牌组引用了不存在的卡片） */
	invalidReferences: Array<{
		deckId: string;
		invalidCardUUIDs: string[];
	}>;
	/** 反向引用不一致（卡片的referencedByDecks与实际不符） */
	inconsistentBackReferences: Array<{
		cardUUID: string;
		expected: string[];
		actual: string[];
	}>;
}

/**
 * 数据迁移结果
 */
export interface DataMigrationResult {
	/** 迁移是否成功 */
	success: boolean;
	/** 迁移的卡片数量 */
	migratedCards: number;
	/** 迁移的牌组数量 */
	migratedDecks: number;
	/** 备份路径 */
	backupPath?: string;
	/** 错误信息（如果失败） */
	error?: string;
	/** 迁移详情 */
	details?: {
		/** 创建的cardUUIDs数组 */
		deckCardMappings: Record<string, string[]>;
		/** 创建的referencedByDecks数组 */
		cardDeckMappings: Record<string, string[]>;
		/** 发现的需要迁移的卡片文件路径 */
		orphanedCardFiles?: string[];
	};
}
