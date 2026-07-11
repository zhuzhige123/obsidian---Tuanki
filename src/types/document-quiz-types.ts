/**
 * 文档测验（Document Quiz）类型定义
 */

import type { Card } from "../data/types";
import type { QuestionBankModeConfig, TestMode } from "./question-bank-types";

export type DocumentQuizItemStatus = "ok" | "warn" | "error";

export type DocumentQuizQuestionKind =
	| "single_choice"
	| "multiple_choice"
	| "cloze"
	| "qa"
	| "other";

export type DocumentQuizDifficultyLabel = "easy" | "medium" | "hard" | "unset";

export type DocumentQuizMasteryLabel = "new" | "weak" | "fair" | "strong";

export interface DocumentQuizTypeCounts {
	total: number;
	singleChoice: number;
	multipleChoice: number;
	cloze: number;
	qa: number;
	other: number;
	ready: number;
	warn: number;
	error: number;
}

export interface DocumentQuizDifficultyCounts {
	easy: number;
	medium: number;
	hard: number;
	unset: number;
}

export interface DocumentQuizMasteryCounts {
	new: number;
	weak: number;
	fair: number;
	strong: number;
}

export interface DocumentQuizParseSummary {
	typeCounts: DocumentQuizTypeCounts;
	difficultyCounts: DocumentQuizDifficultyCounts;
	masteryCounts: DocumentQuizMasteryCounts;
}

export interface DocumentQuizItem {
	index: number;
	/** 解析后的题目正文（已去掉统计注释，供卡片/考试使用） */
	content: string;
	blockId?: string;
	/** @deprecated 使用 questionKind */
	cardTypeLabel: string;
	questionKind: DocumentQuizQuestionKind;
	difficulty: DocumentQuizDifficultyLabel;
	mastery: DocumentQuizMasteryLabel;
	stemPreview: string;
	historicalAttempts?: number;
	historicalAccuracy?: number;
	parseWarnings: string[];
	status: DocumentQuizItemStatus;
	/** 在笔记正文（剥离 frontmatter 后）中的起始偏移 */
	bodyOffsetStart: number;
	/** 在笔记正文中的结束偏移（不含题尾统计注释） */
	bodyOffsetEnd: number;
}

export interface DocumentQuizParseResult {
	filePath: string;
	items: DocumentQuizItem[];
	/** 与 items 同序的原始题块（含统计注释，供历史统计解析） */
	rawBlocks: string[];
	errors: string[];
	/** 剥离 frontmatter 后的正文，便于写回定位 */
	bodyContent: string;
	/** frontmatter 前缀长度（写回全文件时用） */
	frontmatterPrefixLength: number;
}

export interface DocumentQuizStatsCommentV1 {
	v: 1;
	attempts: number;
	correct: number;
	accuracy: number;
	lastAt: string;
	lastMode?: TestMode;
}

export interface DocumentQuizSession {
	id: string;
	filePath: string;
	fileName: string;
	items: DocumentQuizItem[];
	cards: Card[];
	mode: TestMode;
	config?: QuestionBankModeConfig;
}

export interface DocumentQuizWriteBackResult {
	blockId: string;
	success: boolean;
	error?: string;
}

export interface DocumentQuizSessionWriteBackSummary {
	succeeded: number;
	failed: DocumentQuizWriteBackResult[];
}
