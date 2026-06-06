// 导入主类型定义
import type { Card, Deck } from "../data/types";

/**
 * FSRS 状态枚举
 */
export enum FSRSState {
	NEW = "new",
	LEARNING = "learning",
	REVIEW = "review",
	RELEARNING = "relearning",
}

/**
 * FSRS 评分枚举
 */
export enum FSRSRating {
	AGAIN = 1,
	HARD = 2,
	GOOD = 3,
	EASY = 4,
}

/**
 * FSRS 数据接口
 */
export interface FSRSData {
	state: FSRSState;
	due: Date;
	stability: number;
	difficulty: number;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	last_review: Date | null;
	parameters: number[] | null;
}

/**
 * 卡片源位置信息
 */
export interface CardSourcePosition {
	blockId?: string;
	startLine: number;
	endLine: number;
	contentHash: string;
}

/**
 * 卡片元数据
 */
export interface CardMetadata {
	annotationId?: string;
	uuid?: string;
	version?: number;
	parseMethod?: "exact" | "fuzzy" | "fallback";
	parseConfidence?: number;
	orphaned?: {
		reason: string;
		detectedAt: string;
		originalSourceFile: string;
		recoverable: boolean;
	};
	[key: string]: unknown;
}

// Card 和 Deck 类型已移至 data/types.ts
// 请使用: import type { Card, Deck } from '../data/types';

/**
 * 学习会话信息
 */
export interface StudySession {
	id: string;
	deckId: string;
	startTime: string;
	endTime?: string;
	cardsStudied: number;
	correctAnswers: number;
	totalTime: number; // 毫秒
	averageTime: number; // 毫秒
}

/**
 * 复习记录
 */
export interface ReviewRecord {
	id: string;
	cardId: string;
	sessionId: string;
	rating: FSRSRating;
	responseTime: number; // 毫秒
	timestamp: string;
	previousState: FSRSState;
	newState: FSRSState;
	previousDue: string;
	newDue: string;
}

/**
 * 卡片统计信息
 */
export interface CardStatistics {
	totalCards: number;
	newCards: number;
	learningCards: number;
	reviewCards: number;
	suspendedCards: number;
	matureCards: number;
	youngCards: number;

	// 按牌组分组
	byDeck: Record<
		string,
		{
			total: number;
			new: number;
			learning: number;
			review: number;
		}
	>;

	// 按模板分组
	byTemplate: Record<string, number>;

	// 按标签分组
	byTag: Record<string, number>;
}

/**
 * 学习统计信息
 */
export interface StudyStatistics {
	totalSessions: number;
	totalCardsStudied: number;
	totalTimeSpent: number; // 毫秒
	averageSessionTime: number; // 毫秒
	averageCardTime: number; // 毫秒

	// 准确率统计
	overallAccuracy: number;
	accuracyByDeck: Record<string, number>;
	accuracyByTemplate: Record<string, number>;

	// 时间趋势
	dailyStats: Array<{
		date: string;
		cardsStudied: number;
		timeSpent: number;
		accuracy: number;
	}>;

	// 最近表现
	recentPerformance: {
		last7Days: number;
		last30Days: number;
		thisWeek: number;
		thisMonth: number;
	};
}

/**
 * 卡片搜索选项
 */
export interface CardSearchOptions {
	query?: string;
	deckIds?: string[];
	templateIds?: string[];
	tags?: string[];
	states?: FSRSState[];
	suspended?: boolean;
	dueOnly?: boolean;
	sortBy?: "created" | "modified" | "due" | "difficulty" | "stability";
	sortOrder?: "asc" | "desc";
	limit?: number;
	offset?: number;
}

/**
 * 卡片搜索结果
 */
export interface CardSearchResult {
	cards: Card[];
	total: number;
	hasMore: boolean;
	searchTime: number;
}

/**
 * 卡片导入导出格式
 */
export interface CardExportFormat {
	version: string;
	cards: Card[];
	decks: Deck[];
	metadata: {
		exportedAt: string;
		exportedBy?: string;
		source?: string;
		description?: string;
	};
}

/**
 * 卡片事件类型
 */
export enum CardEventType {
	CREATED = "card_created",
	UPDATED = "card_updated",
	DELETED = "card_deleted",
	REVIEWED = "card_reviewed",
	SUSPENDED = "card_suspended",
	RESUMED = "card_resumed",
	MOVED = "card_moved",
}

/**
 * 卡片事件数据
 */
export interface CardEvent {
	type: CardEventType;
	cardId: string;
	timestamp: string;
	data?: unknown;
	source?: string;
}

// DataStorage 接口已移至 data/storage.ts
// 请使用: import type { WeaveDataStorage } from '../data/storage';
