import type { DeckStats } from "../../data/types";
import type { QuestionTestStats } from "../../types/question-bank-types";

/** 题组卡片展示用统计（0–100 的正确率为 EWMA 聚合值，非作答次数简单平均） */
export interface QuestionBankDisplayStats {
	total: number;
	completed: number;
	/** 题组正确率 0–100；无已练题目时为 0 */
	accuracy: number;
	errorCount: number;
}

export type QuestionBankAccuracyGroupKey = "untested" | "excellent" | "good" | "poor";

/** 看板「正确率」分列顺序：未练习 → ＞90分 → ＞75分 → ＜60分 */
export const QUESTION_BANK_ACCURACY_GROUP_ORDER: readonly QuestionBankAccuracyGroupKey[] = [
	"untested",
	"excellent",
	"good",
	"poor",
];

/** 题组正确率展示为分值，如 90分 */
export function formatQuestionBankAccuracyScore(accuracy: number): string {
	return `${Math.round(accuracy)}分`;
}

export interface QuestionForBankStats {
	stats?: {
		testStats?: Pick<
			QuestionTestStats,
			"totalAttempts" | "accuracy" | "incorrectAttempts" | "isInErrorBook" | "masteryMetrics"
		>;
	};
}

/**
 * 单题当前掌握度（0–100）：优先 EWMA 的 currentAccuracy，回退到历史简单平均。
 */
export function getQuestionCurrentAccuracyPercent(testStats: QuestionTestStats): number {
	const mastery = testStats.masteryMetrics?.currentAccuracy;
	if (mastery !== undefined) {
		return mastery;
	}
	return (testStats.accuracy || 0) * 100;
}

/**
 * 题组正确率：已练题目各自 EWMA 掌握度的算术平均（与 QuestionBankService.updateBankStats 一致）。
 * 不是把所有作答记录做一次总平均。
 */
export function computeQuestionBankDisplayStats(
	questions: readonly QuestionForBankStats[]
): QuestionBankDisplayStats {
	const total = questions.length;
	let completed = 0;
	let accuracySum = 0;
	let errorCount = 0;

	for (const question of questions) {
		const testStats = question.stats?.testStats;
		if (!testStats || testStats.totalAttempts <= 0) {
			continue;
		}

		completed++;
		accuracySum += getQuestionCurrentAccuracyPercent(testStats as QuestionTestStats);

		errorCount += testStats.incorrectAttempts ?? 0;
	}

	const accuracy = completed > 0 ? accuracySum / completed : 0;

	return {
		total,
		completed,
		accuracy,
		errorCount,
	};
}

/**
 * 映射为牌组看板/DeckGridCard 使用的 DeckStats。
 * memoryRate 存放题组正确率（0–100），供徽章与正确率分列使用。
 */
export function mapQuestionBankDisplayStatsToDeckStats(
	display: QuestionBankDisplayStats
): DeckStats {
	return {
		totalCards: display.total,
		newCards: display.total,
		learningCards: display.completed,
		reviewCards: display.errorCount,
		todayNew: 0,
		todayReview: 0,
		todayTime: 0,
		totalReviews: 0,
		totalTime: 0,
		memoryRate: display.accuracy,
		averageEase: 0,
		forecastDays: {},
	};
}

export function getQuestionBankAccuracyGroupKey(
	display: Pick<QuestionBankDisplayStats, "completed" | "accuracy">
): QuestionBankAccuracyGroupKey {
	if (display.completed <= 0) {
		return "untested";
	}
	if (display.accuracy >= 90) {
		return "excellent";
	}
	if (display.accuracy >= 75) {
		return "good";
	}
	return "poor";
}

export function getQuestionBankAccuracyGroupKeyFromDeckStats(
	stats: Pick<DeckStats, "learningCards" | "memoryRate"> | undefined
): QuestionBankAccuracyGroupKey {
	return getQuestionBankAccuracyGroupKey({
		completed: stats?.learningCards ?? 0,
		accuracy: stats?.memoryRate ?? 0,
	});
}
