/**
 * 增量阅读类型定义
 *
 * 核心设计原则：
 * - 不存储MD文件内容，只存储索引和元数据
 * - 通过文件路径和YAML frontmatter关联
 * - 块级增量阅读调度使用独立策略；材料级到期时间暂沿用历史字段存储
 *
 * @module types/incremental-reading-types
 * @version 1.0.0
 */

import type { FSRSCard, Rating } from "../data/types";

// ===== 阅读材料分类 =====

/**
 * 阅读材料分类枚举
 */
export enum ReadingCategory {
	/** 稍后阅读 - 新添加的材料默认分类 */
	Later = "later",
	/** 正在阅读 - 纳入材料级续读安排 */
	Reading = "reading",
	/** 收藏 - 重要材料，保留材料级续读安排 */
	Favorite = "favorite",
	/** 已归档 - 完成或暂停，停止材料级续读安排 */
	Archived = "archived",
}

// ===== 锚点记录 =====

/**
 * 锚点记录
 * 记录阅读进度的断点位置
 */
export interface AnchorRecord {
	/** 锚点ID，格式：weave-bookmark-{timestamp} */
	anchorId: string;
	/** 字符位置（从文件实时解析） */
	position: number;
	/** 记录时间 (ISO 8601) */
	timestamp: string;
	/** 该位置的字数 */
	wordCount: number;
}

// ===== 阅读进度 =====

/**
 * 阅读进度
 * 基于锚点计算，不存储文件内容
 */
export interface ReadingProgress {
	/** 当前锚点ID */
	currentAnchor?: string;
	/** 锚点历史记录 */
	anchorHistory: AnchorRecord[];
	/** 进度百分比 (0-100)，基于锚点位置计算 */
	percentage: number;
	/** 总字数（从文件实时计算） */
	totalWords: number;
	/** 已读字数（基于锚点位置） */
	readWords: number;
	/** 预计剩余时间（分钟） */
	estimatedTimeRemaining: number;
}

// ===== 阅读材料 =====

/**
 * 阅读材料
 * 核心数据结构，只存储索引和元数据，不存储MD文件内容
 */
export interface ReadingMaterial {
	// ===== 基础标识 =====
	/** 唯一标识符（同时写入MD文件的YAML） */
	uuid: string;
	/** Obsidian文件路径（主要关联方式） */
	filePath: string;
	/** 材料标题（从文件名或首行提取） */
	title: string;
	/** 分类 */
	category: ReadingCategory;

	resumeLink?: string;
	resumeUpdatedAt?: string;

	// ===== 层级关系 =====
	/** 父材料UUID（用于阅读点书签的层级嵌套） */
	parentMaterialId?: string;

	// ===== 优先级与调度 =====
	/** 优先级 (0-100) */
	priority: number;
	/** 每天衰减率（默认 0.5） */
	priorityDecay: number;
	/** 最后访问时间 (ISO 8601) */
	lastAccessed: string;

	// ===== 材料级续读时间 =====
	/** 材料级下次续读时间。 */
	nextDueAt?: string;
	/** 历史沿用的材料级到期时间字段；当前仅作为兼容载体保留。 */
	fsrs?: FSRSCard;

	// ===== 阅读进度 =====
	/** 阅读进度（基于锚点计算） */
	progress: ReadingProgress;

	// ===== 关联数据 =====
	/** 提取的卡片UUID列表 */
	extractedCards: string[];
	/** 关联的摘录牌组ID */
	topicId?: string;
	readingDeckId?: string;
	/** 关联的 Markdown 笔记路径 */
	primaryAssociatedNotePath?: string;
	associatedNotePath?: string;
	associatedNotePaths?: string[];

	// ===== 元数据 =====
	/** 标签 */
	tags?: string[];
	/** 创建时间 (ISO 8601) */
	created: string;
	/** 修改时间 (ISO 8601) */
	modified: string;
	/** 来源：auto=首次标记锚点/提取时自动创建，manual=手动添加 */
	source: "auto" | "manual";
}

// ===== 阅读会话 =====

/**
 * 阅读会话
 * 记录单次阅读活动
 */
export interface ReadingSession {
	/** 会话唯一标识符 */
	uuid: string;
	/** 关联的阅读材料UUID */
	materialId: string;
	/** 开始时间 (ISO 8601) */
	startTime: string;
	/** 结束时间 (ISO 8601) */
	endTime?: string;
	/** 持续时间（秒） */
	duration: number;

	// ===== 会话数据 =====
	/** 开始锚点 */
	startAnchor?: string;
	/** 结束锚点 */
	endAnchor?: string;
	/** 本次阅读字数 */
	wordsRead: number;

	// ===== 学习反馈 =====
	/** 评分 (Again/Hard/Good/Easy) */
	rating?: Rating;
	/** 理解度 (1-5) */
	comprehension?: number;
	/** 会话笔记 */
	notes?: string;

	// ===== 提取的卡片 =====
	/** 本次会话创建的卡片UUID */
	cardsCreated: string[];
}

// ===== YAML Frontmatter =====

/**
 * YAML Frontmatter中的增量阅读字段
 * 自动添加到MD文件中
 */
export interface ReadingYAMLFields {
	/** 唯一标识符 */
	"weave-reading-id": string;
	/** 当前分类 */
	"weave-reading-category": ReadingCategory;
	/** 优先级 */
	"weave-reading-priority": number;
	"weave-reading-topic-id"?: string;
	"weave-reading-ir-deck-id"?: string;
	"weave_tags"?: string[];
}

// ===== 牌组扩展 =====

/**
 * 牌组层级关系扩展
 * 用于Reading Deck和QA Deck的关联
 */
export interface DeckHierarchyExtension {
	/** 父牌组ID（用于QA子牌组） */
	parentDeckId?: string;
	/** 子牌组ID列表 */
	childDeckIds?: string[];
	/** 关联的阅读材料UUID（仅reading类型） */
	readingMaterialId?: string;
	/** 是否为阅读牌组 */
	isReadingDeck?: boolean;
}

// ===== 存储索引 =====

/**
 * 阅读材料索引
 * 当前仅作为兼容运行时快照，存储在插件本地 `reading-materials-runtime.json` 中
 */
export interface ReadingMaterialsIndex {
	/** 版本号 */
	version: string;
	/** 最后更新时间 (ISO 8601) */
	lastUpdated: string;
	/** 材料映射：uuid -> ReadingMaterial */
	materials: Record<string, ReadingMaterial>;
}

/**
 * 锚点缓存
 * 可选的性能优化，存储在 anchors-cache.json 中
 */
export interface AnchorsCache {
	/** 版本号 */
	version: string;
	/** 最后更新时间 (ISO 8601) */
	lastUpdated: string;
	/** 文件路径 -> 锚点列表 */
	anchors: Record<string, AnchorRecord[]>;
}

// ===== 日历视图数据 =====

/**
 * 文件夹节点（层级目录视图）
 */
export interface FolderNode {
	/** 文件夹名称 */
	name: string;
	/** 文件夹路径 */
	path: string;
	/** 该文件夹下的材料 */
	materials: ReadingMaterial[];
	/** 子文件夹 */
	children: FolderNode[];
	/** 展开状态 */
	expanded: boolean;
	/** 统计信息 */
	stats: FolderStats;
}

/**
 * 文件夹统计信息
 */
export interface FolderStats {
	/** 材料总数（包含子文件夹） */
	totalCount: number;
	/** 平均进度 */
	avgProgress: number;
	/** 今日到期数 */
	dueCount: number;
}

/**
 * 日历日期数据
 */
export interface CalendarDayData {
	/** 日期 (YYYY-MM-DD) */
	date: string;
	/** 该日期的材料UUID列表 */
	materialIds: string[];
	/** 材料数量 */
	count: number;
	/** 是否有到期材料 */
	hasDue: boolean;
	/** 热力图级别 (0-4) */
	heatLevel: number;
}

/**
 * 月度统计
 */
export interface MonthlyStats {
	/** 月份 (YYYY-MM) */
	month: string;
	/** 总阅读时长（分钟） */
	totalReadingTime: number;
	/** 完成材料数 */
	completedMaterials: number;
	/** 平均进度 */
	averageProgress: number;
	/** 创建的卡片数 */
	cardsCreated: number;
}

// ===== 事件类型 =====

/**
 * 增量阅读事件类型
 */
export enum ReadingEventType {
	/** 材料创建 */
	MaterialCreated = "material_created",
	/** 材料更新 */
	MaterialUpdated = "material_updated",
	/** 材料删除 */
	MaterialDeleted = "material_deleted",
	/** 分类变更 */
	CategoryChanged = "category_changed",
	/** 锚点添加 */
	AnchorAdded = "anchor_added",
	/** 会话开始 */
	SessionStarted = "session_started",
	/** 会话结束 */
	SessionEnded = "session_ended",
	/** 卡片提取 */
	CardExtracted = "card_extracted",
	/** 材料级续读时间更新 */
	ScheduleUpdated = "schedule_updated",
}

/**
 * 增量阅读事件
 */
export interface ReadingEvent {
	/** 事件类型 */
	type: ReadingEventType;
	/** 材料UUID */
	materialId: string;
	/** 时间戳 (ISO 8601) */
	timestamp: string;
	/** 事件数据 */
	data?: Record<string, unknown>;
}

// ===== 默认值 =====

/**
 * 默认阅读材料设置
 */
export const DEFAULT_READING_MATERIAL: Partial<ReadingMaterial> = {
	category: ReadingCategory.Later,
	priority: 50,
	priorityDecay: 0.5,
	progress: {
		anchorHistory: [],
		percentage: 0,
		totalWords: 0,
		readWords: 0,
		estimatedTimeRemaining: 0,
	},
	extractedCards: [],
	tags: [],
	source: "auto",
};

/**
 * 锚点前缀
 */
export const ANCHOR_PREFIX = "weave-bookmark-";

/**
 * 锚点正则表达式
 */
export const ANCHOR_REGEX = /\^weave-bookmark-(\d+)/g;

/**
 * YAML字段前缀
 */
export const YAML_FIELD_PREFIX = "weave-reading-";
