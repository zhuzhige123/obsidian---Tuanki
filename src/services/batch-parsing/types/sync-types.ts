/**
 * 批量解析增量同步相关类型定义
 * @module sync-types
 */

// ============================================
// 位置索引相关类型
// ============================================

/**
 * 完整的位置索引结构
 */
export interface PositionIndex {
	/** 批量范围信息 */
	batchRange: BatchRange;
	/** 所有内容块（包括卡片和非卡片） */
	blocks: ContentBlock[];
	/** 仅卡片块 */
	cards: CardBlock[];
	/** 仅非卡片块 */
	nonCards: NonCardBlock[];
}

/**
 * 批量范围标记信息
 */
export interface BatchRange {
	/** 开始标记位置 */
	startMarker: MarkerPosition;
	/** 结束标记位置 */
	endMarker: MarkerPosition;
	/** 内容区域开始位置（标记之后） */
	contentStart: number;
	/** 内容区域结束位置（标记之前） */
	contentEnd: number;
	/** 完整范围（包含标记） */
	fullRange: { start: number; end: number };
}

/**
 * 标记位置信息
 */
export interface MarkerPosition {
	/** 行号（从0开始） */
	line: number;
	/** 字符位置（从0开始） */
	char: number;
	/** 标记长度 */
	length: number;
}

/**
 * 内容块基础接口
 */
export interface ContentBlock {
	/** 块类型 */
	type: "card" | "non-card";
	/** 块索引（在所有块中的位置） */
	index: number;
	/** 块开始位置（字符索引） */
	startPos: number;
	/** 块结束位置（字符索引） */
	endPos: number;
	/** 块内容 */
	content: string;
	/** 块开始行号 */
	startLine: number;
	/** 块结束行号 */
	endLine: number;
}

/**
 * 卡片块（扩展ContentBlock）
 */
export interface CardBlock extends ContentBlock {
	type: "card";
	/** 卡片UUID（如果已有） */
	uuid: string | null;
	/** 卡片BlockID（如果已有） */
	blockId: string | null;
	/** 是否已有UUID */
	hasUUID: boolean;
	/** UUID在文件中的位置 */
	uuidPosition: number | null;
	/** 前置分隔符位置 */
	precedingDelimiterPos: number;
	/** 后置分隔符位置（可能为null，如果是最后一个块） */
	followingDelimiterPos: number | null;
}

/**
 * 非卡片块（扩展ContentBlock）
 */
export interface NonCardBlock extends ContentBlock {
	type: "non-card";
	/** 是否为首块 */
	isLeading: boolean;
	/** 是否为尾块 */
	isTrailing: boolean;
}

// ============================================
// 增量同步相关类型
// ============================================

/**
 * 同步操作类型
 */
export enum SyncAction {
	/** 创建新卡片 */
	CREATE = "CREATE",
	/** 更新现有卡片 */
	UPDATE = "UPDATE",
	/** 跳过同步 */
	SKIP = "SKIP",
	/** 标记为已删除 */
	MARK_DELETED = "MARK_DELETED",
}

/**
 * 同步决策结果
 */
export interface SyncDecision {
	/** 决策的操作类型 */
	action: SyncAction;
	/** 卡片数据 */
	card: unknown; // ParsedCard类型
	/** 决策理由 */
	reason: string;
	/** Obsidian文件修改时间 */
	obsidianTime?: number;
	/** Weave数据库修改时间 */
	weaveTime?: number;
}

/**
 * 同步结果统计
 */
export interface SyncResult {
	/** 处理的总卡片数 */
	total: number;
	/** 创建的卡片数 */
	created: number;
	/** 更新的卡片数 */
	updated: number;
	/** 跳过的卡片数 */
	skipped: number;
	/** 标记删除的卡片数 */
	markedDeleted: number;
	/** 错误列表 */
	errors: SyncError[];
	/** 处理耗时（毫秒） */
	duration: number;
}

/**
 * 同步错误信息
 */
export interface SyncError {
	/** 卡片UUID（如果有） */
	cardUUID: string | null;
	/** 卡片内容预览 */
	cardContent: string;
	/** 错误消息 */
	error: string;
	/** 错误阶段 */
	phase: "parse" | "uuid" | "sync" | "database";
}

// ============================================
// 内容修改相关类型
// ============================================

/**
 * 插入计划
 */
export interface InsertionPlan {
	/** 插入位置（字符索引） */
	position: number;
	/** 要插入的内容 */
	content: string;
	/** 关联的卡片块索引 */
	cardBlockIndex: number;
	/** 生成的UUID */
	uuid: string;
	/** 生成的BlockID */
	blockId: string;
}

/**
 * 内容修改结果
 */
export interface ModificationResult {
	/** 修改后的内容 */
	content: string;
	/** 是否有修改 */
	modified: boolean;
	/** 应用的插入数量 */
	insertionsApplied: number;
	/** 修改的字节数 */
	bytesChanged: number;
}

// ============================================
// UUID检测相关类型
// ============================================

/**
 * UUID检测结果
 */
export interface UUIDDetectionResult {
	/** 检测到的UUID */
	uuid: string | null;
	/** 检测到的BlockID */
	blockId: string | null;
	/** UUID在块中的位置 */
	position: number | null;
	/** 是否通过数据库验证 */
	validated: boolean;
}

// ============================================
// 配置相关类型
// ============================================

/**
 * 同步配置
 */
export interface SyncConfig {
	/** 是否启用增量同步 */
	enabled: boolean;
	/** 是否检测并标记删除的卡片 */
	detectDeletions: boolean;
	/** 时间比较容差（毫秒） */
	timeTolerance: number;
	/** 冲突解决策略 */
	conflictResolution: "obsidian-wins" | "weave-wins" | "skip";
}

/**
 * 默认同步配置
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
	enabled: true,
	detectDeletions: true,
	timeTolerance: 0, // 精确比较
	conflictResolution: "obsidian-wins",
};
