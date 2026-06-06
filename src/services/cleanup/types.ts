/**
 * 块链接清理系统 - 类型定义
 *
 * 职责：
 * - 定义清理系统使用的所有类型和接口
 * - 支持四种卡片创建方式的清理
 *
 * @author Weave Team
 * @date 2025-01-07
 */

/**
 * 卡片创建类型枚举
 */
export enum CardCreationType {
	/** 快捷键创建 - 行末 ^we-xxx 块链接 */
	QUICK_CREATE = "quick-create",

	/** 批量解析-单文件 - YAML frontmatter weave-uuid */
	BATCH_PARSE_SINGLE = "batch-parse-single",

	/** 批量解析-多卡片 - <-> 分隔符内卡片块 */
	BATCH_PARSE_MULTI = "batch-parse-multi",
}

/**
 * 块链接元数据
 */
export interface BlockLinkMetadata {
	/** 块ID（不含^前缀）如 "we-abc123" */
	blockId: string;

	/** 卡片UUID（如果有）如 "tk-xxxxxxxxxxxx" */
	uuid?: string;

	/** 源文件路径 */
	filePath: string;

	/** 行号（如果可确定） */
	lineNumber?: number;

	/** 创建方式 */
	creationType: CardCreationType;

	/** 是否为孤立引用 */
	isOrphaned: boolean;
}

/**
 * 清理目标
 */
export interface CleanupTarget {
	/** 文件路径 */
	filePath: string;

	/** 块ID（不含^前缀） */
	blockId?: string;

	/** UUID */
	uuid?: string;

	/** 创建方式 */
	creationType: CardCreationType;

	/** 额外元数据 */
	metadata?: Record<string, unknown>;
}

/**
 * 清理结果
 */
export interface CleanupResult {
	/** 是否成功 */
	success: boolean;

	/** 文件路径 */
	filePath: string;

	/** 清理的项目列表 */
	cleanedItems: string[];

	/** 错误信息 */
	error?: string;

	/** 错误列表（批量清理时） */
	errors?: Array<{
		item: string;
		error: string;
	}>;
}

/**
 * 全局扫描结果
 */
export interface GlobalScanResult {
	/** 扫描文件总数 */
	totalFiles: number;

	/** 包含孤立引用的文件数 */
	filesWithOrphans: number;

	/** 孤立引用总数 */
	totalOrphans: number;

	/** 已清理数量 */
	cleanedOrphans: number;

	/** 错误列表 */
	errors: Array<{
		filePath: string;
		error: string;
	}>;

	/** 扫描耗时（毫秒） */
	duration: number;

	/** 是否被取消 */
	cancelled?: boolean;
}

/**
 * 扫描进度
 */
export interface ScanProgress {
	/** 当前阶段 */
	phase: "scanning" | "cleaning" | "completed";

	/** 当前处理的文件 */
	currentFile: string;

	/** 已处理文件数 */
	processedFiles: number;

	/** 文件总数 */
	totalFiles: number;

	/** 已清理数量 */
	cleanedCount: number;

	/** 检测到的孤立引用数量 */
	detectedCount?: number;

	/** 进度百分比 (0-100) */
	percentage: number;
}

/**
 * 清理详情状态
 */
export type CleanupDetailStatus = "success" | "protected" | "processing" | "error" | "skipped";

/**
 * 清理详情
 */
export interface CleanupDetail {
	/** 文件路径 */
	filePath: string;

	/** 状态 */
	status: CleanupDetailStatus;

	/** 描述信息 */
	message: string;

	/** 保护剩余时间（秒） */
	remainingTime?: number;
}

/**
 * 清理错误类型
 */
export enum CleanupErrorType {
	/** 文件不存在 */
	FILE_NOT_FOUND = "file-not-found",

	/** 文件读取错误 */
	FILE_READ_ERROR = "file-read-error",

	/** 文件写入错误 */
	FILE_WRITE_ERROR = "file-write-error",

	/** 块链接未找到 */
	BLOCK_NOT_FOUND = "block-not-found",

	/** 权限拒绝 */
	PERMISSION_DENIED = "permission-denied",

	/** 未知错误 */
	UNKNOWN_ERROR = "unknown-error",
}

/**
 * 清理错误
 */
export interface CleanupError {
	/** 错误类型 */
	type: CleanupErrorType;

	/** 错误消息 */
	message: string;

	/** 文件路径 */
	filePath?: string;

	/** 块ID */
	blockId?: string;

	/** 原始错误 */
	originalError?: Error;
}
