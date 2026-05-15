/**
 * .qbank 文件格式类型定义
 *
 * 考试题组的单文件真源格式，每个题组对应一个 .qbank 文件
 */

import type { TestMode } from "../../types/question-bank-types";

/**
 * .qbank 文件的主数据结构
 */
export interface QBankFileData {
	/** 题库唯一标识符 */
	id: string;

	/** 题库名称 */
	name: string;

	/** 题库描述 */
	description?: string;

	/** 牌组类型标识 */
	deckType: "question-bank";

	/** 元数据 */
	metadata: {
		/** 配对的记忆牌组 ID */
		pairedMemoryDeckId?: string;

		/** 标签 */
		tags?: string[];

		/** 创建时间 */
		createdAt?: string;

		/** 最后修改时间 */
		updatedAt?: string;
	};

	/** 题库配置 */
	config: QBankConfig;

	/** 题目列表 */
	questions: QuestionInBank[];

	/** 题库统计信息 */
	stats: QBankStats;
}

/**
 * 题库配置
 */
export interface QBankConfig {
	/** 默认出题模式 */
	defaultMode: TestMode;

	/** 默认题目数量 */
	defaultQuestionCount?: number;

	/** 默认时间限制（秒） */
	defaultTimeLimit?: number;

	/** 是否启用错题本 */
	enableErrorBook?: boolean;

	/** 是否显示答案解析 */
	showExplanation?: boolean;
}

/**
 * 题库中的题目引用
 */
export interface QuestionInBank {
	/** 卡片 UUID（引用记忆牌组中的卡片） */
	cardUuid: string;

	/** 添加到题库的时间 */
	addedAt: string;

	/** 测试历史记录 */
	testHistory: TestAttempt[];

	/** 题目统计信息 */
	stats: QuestionTestStats;
}

/**
 * 单次测试记录
 */
export interface TestAttempt {
	/** 会话 ID */
	sessionId: string;

	/** 测试时间 */
	timestamp: string;

	/** 是否正确 */
	isCorrect: boolean;

	/** 得分 */
	score: number;

	/** 用时（秒） */
	timeSpent: number;

	/** 测试模式 */
	mode: TestMode;
}

/**
 * 单题统计信息
 */
export interface QuestionTestStats {
	/** 总测试次数 */
	totalAttempts: number;

	/** 正确次数 */
	correctAttempts: number;

	/** 正确率 */
	accuracy: number;

	/** 是否在错题本中 */
	isInErrorBook: boolean;

	/** 最后测试时间 */
	lastTestedAt?: string;

	/** 平均用时（秒） */
	averageTimeSpent?: number;

	/** 最高分 */
	highestScore?: number;

	/** 最低分 */
	lowestScore?: number;
}

/**
 * 题库统计信息
 */
export interface QBankStats {
	/** 总题目数 */
	totalQuestions: number;

	/** 总测试次数 */
	totalTests: number;

	/** 平均分 */
	averageScore?: number;

	/** 最高分 */
	highestScore?: number;

	/** 最低分 */
	lowestScore?: number;

	/** 错题本题目数 */
	errorBookCount?: number;

	/** 最后测试时间 */
	lastTestedAt?: string;
}
