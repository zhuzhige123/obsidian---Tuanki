import type { DocumentQuizMasteryLabel } from "../../types/document-quiz-types";
import type { QuestionTestStats, TestMode } from "../../types/question-bank-types";
import { TEST_MODES } from "../../types/question-bank-types";
import { resolveMasteryLabel } from "./document-quiz-parse-summary";
import type { DocumentQuizInlineStatsSnapshot } from "./document-quiz-stats-index";
import { formatRelativeTimeDetailed } from "../../utils/helpers";
import { i18n } from "../../utils/i18n";

export interface DocumentQuizStatsPillDisplay {
	blockId: string;
	mastery: DocumentQuizMasteryLabel;
	segments: string[];
	ariaLabel: string;
}

export function mergeInlineAndStoredStats(
	inline: DocumentQuizInlineStatsSnapshot | undefined,
	stored: QuestionTestStats | undefined
): DocumentQuizInlineStatsSnapshot | undefined {
	if (!inline && !stored) {
		return undefined;
	}

	if (!inline) {
		return storedToInlineSnapshot(stored!);
	}

	if (!stored || stored.totalAttempts <= 0) {
		return inline;
	}

	if (stored.totalAttempts >= inline.attempts) {
		return storedToInlineSnapshot(stored, inline.lastMode);
	}

	return inline;
}

function storedToInlineSnapshot(
	stored: QuestionTestStats,
	lastMode?: TestMode
): DocumentQuizInlineStatsSnapshot {
	return {
		blockId: "",
		attempts: stored.totalAttempts,
		correct: stored.correctAttempts,
		accuracy: stored.accuracy,
		lastAt: stored.lastTestDate,
		lastMode,
	};
}

export function buildDocumentQuizStatsPillDisplay(options: {
	blockId: string;
	stats: DocumentQuizInlineStatsSnapshot;
}): DocumentQuizStatsPillDisplay {
	const { blockId, stats } = options;
	const mastery = resolveMasteryLabel(stats.attempts, stats.accuracy);
	const masteryLabel = i18n.t(`documentQuiz.result.mastery.${mastery}`);
	const attemptsLabel = i18n.t("documentQuiz.inlineStats.attempts", {
		count: stats.attempts,
	});
	const accuracyPercent = Math.round(stats.accuracy * 100);
	const accuracyLabel = i18n.t("documentQuiz.inlineStats.accuracy", {
		percent: accuracyPercent,
	});
	const segments = [masteryLabel, attemptsLabel, accuracyLabel];

	if (stats.lastMode) {
		segments.push(formatTestModeLabel(stats.lastMode));
	}

	if (stats.lastAt) {
		segments.push(formatRelativeTimeDetailed(stats.lastAt));
	}

	return {
		blockId,
		mastery,
		segments,
		ariaLabel: i18n.t("documentQuiz.inlineStats.ariaLabel", {
			mastery: masteryLabel,
			attempts: stats.attempts,
			accuracy: accuracyPercent,
		}),
	};
}

function formatTestModeLabel(mode: TestMode): string {
	const key = `documentQuiz.inlineStats.mode.${mode}`;
	const translated = i18n.t(key);
	if (translated !== key) {
		return translated;
	}
	return TEST_MODES[mode]?.name ?? mode;
}
