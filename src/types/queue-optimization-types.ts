/**
 * 学习队列优化系统 - 类型定义
 *
 * 包含：
 * - Learning Steps（会话内重复）
 * - Interleaving（交错学习）
 * - Difficulty Tracking（难度追踪）
 * - Priority System（优先级系统）
 *
 * @version 1.0.0
 * @since 2025-12-04
 */

import type { Card, Rating } from "../data/types";

// ============================================
// Learning Steps（会话内重复）
// ============================================

/**
 * Learning Steps数据
 */
export interface LearningStepsData {
	/** 当前步骤索引（0-based） */
	currentStep: number;

	/** 学习步骤间隔（分钟） */
	steps: number[];

	/** 开始学习的时间 */
	startedAt: string; // ISO 8601

	/** 失败次数 */
	failureCount: number;
}

/**
 * Learning Steps配置
 */
export interface LearningStepsConfig {
	/** 是否启用 */
	enabled: boolean;

	/** 学习步骤（分钟） */
	steps: number[];

	/** 最大失败次数（超过则建议回收） */
	maxFailures: number;

	/** 是否显示进度指示器 */
	showProgressIndicator: boolean;
}

/**
 * Learning Steps处理结果
 */
export interface LearningStepsResult {
	/** 是否需要留在队列中 */
	shouldStayInQueue: boolean;

	/** 插入位置 */
	insertPosition: "immediate" | "short-term" | null;

	/** 下次due时间 */
	nextDue?: string; // ISO 8601
}

// ============================================
// Interleaving（交错学习）
// ============================================

/**
 * Interleaving配置
 */
export interface InterleavingConfig {
	/** 是否启用 */
	enabled: boolean;

	/** 交错模式 */
	mode: "tag" | "smart" | "random";

	/** 是否尊重优先级 */
	respectPriority: boolean;

	/** 最小分组大小（小于此数量不交错） */
	minGroupSize: number;

	/** 同标签最大连续数 */
	maxConsecutiveSameTag: number;
}

// ============================================
// Difficulty Tracking（难度追踪）
// ============================================

/**
 * 难度等级（使用字符串字面量类型而非枚举，避免运行时问题）
 */
export type DifficultyLevel = "easy" | "medium" | "hard" | "very_hard";

/**
 * 难度历史记录
 */
export interface DifficultyHistoryEntry {
	/** 时间戳 */
	timestamp: string; // ISO 8601

	/** FSRS难度值 */
	difficulty: number;

	/** 评分 */
	rating: Rating;
}

/**
 * 难度追踪数据
 */
export interface DifficultyTracking {
	/** 当前难度等级 */
	currentLevel: DifficultyLevel;

	/** 难度历史（保留最近20条） */
	difficultyHistory: DifficultyHistoryEntry[];

	/** 趋势 */
	trend: "rising" | "stable" | "falling";

	/** 连续Hard次数 */
	consecutiveHard: number;

	/** 干预等级（0-3） */
	interventionLevel: number;
}

/**
 * Difficulty Tracking配置
 */
export interface DifficultyTrackingConfig {
	/** 是否启用 */
	enabled: boolean;

	/** 是否显示指示器 */
	showIndicator: boolean;

	/** 是否自动添加标签 */
	autoTag: boolean;

	/** 干预阈值（1-3） */
	interventionThreshold: number;

	/** 趋势分析窗口大小 */
	trendAnalysisWindow: number;
}

// ============================================
// Priority System（优先级系统）
// ============================================

/**
 * 优先级配置
 */
export interface PriorityConfig {
	/** 是否启用用户优先级 */
	enableUserPriority: boolean;

	/** 是否启用难度调整 */
	enableDifficultyAdjustment: boolean;

	/** 是否启用Leech提升 */
	enableLeechBoost: boolean;
}

/**
 * Leech检测结果
 */
export interface LeechDetectionResult {
	/** 严重程度（0-10） */
	severity: number;

	/** Leech等级 */
	level: LeechLevel;

	/** 是否应该回收 */
	shouldRecycle: boolean;

	/** 检测原因 */
	reasons: string[];
}

/**
 * Leech等级（使用字符串字面量类型）
 */
export type LeechLevel = "none" | "mild" | "moderate" | "severe";

// ============================================
// 统一配置
// ============================================

/**
 * 队列优化统一配置
 */
export interface QueueOptimizationSettings {
	/** Learning Steps配置 */
	learningSteps: LearningStepsConfig;

	/** Interleaving配置 */
	interleaving: InterleavingConfig;

	/** Difficulty Tracking配置 */
	difficultyTracking: DifficultyTrackingConfig;

	/** Priority配置 */
	priority: PriorityConfig;
}

/**
 * 默认配置（最优实践）
 * 注意：这是一个值，不能使用 import type
 */
export const DEFAULT_QUEUE_OPTIMIZATION_SETTINGS: QueueOptimizationSettings = {
	learningSteps: {
		enabled: true,
		steps: [1, 10],
		maxFailures: 5,
		showProgressIndicator: true,
	},

	interleaving: {
		enabled: true,
		mode: "smart",
		respectPriority: true,
		minGroupSize: 3,
		maxConsecutiveSameTag: 2,
	},

	difficultyTracking: {
		enabled: true,
		showIndicator: true,
		autoTag: true,
		interventionThreshold: 2,
		trendAnalysisWindow: 5,
	},

	priority: {
		enableUserPriority: true,
		enableDifficultyAdjustment: true,
		enableLeechBoost: true,
	},
};

// ============================================
// 扩展Card接口（使用intersection type）
// ============================================

/**
 * 扩展的Card元数据
 */
export interface QueueOptimizationMetadata {
	/** Learning Steps数据 */
	learningSteps?: LearningStepsData;

	/** Difficulty Tracking数据 */
	difficultyTracking?: DifficultyTracking;

	/** 临时优先级提升（会话级，不持久化） */
	temporaryPriorityBoost?: number;
}

/**
 * 带队列优化元数据的Card类型
 */
export type CardWithQueueOptimization = Card & {
	metadata?: QueueOptimizationMetadata;
};

// ============================================
// 事件类型
// ============================================

/**
 * 队列优化事件
 */
export type QueueOptimizationEvent =
	| { type: "card-due"; cardId: string }
	| { type: "intervention-needed"; cardId: string; level: number }
	| { type: "session-ended"; statistics: unknown }
	| { type: "queue-updated"; count: number };
