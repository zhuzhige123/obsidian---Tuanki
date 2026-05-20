import type { Card, ErrorLevel } from "../data/types";

function calculateErrorLevel(errorCount: number): ErrorLevel | undefined {
	if (!Number.isFinite(errorCount) || errorCount <= 0) {
		return undefined;
	}

	if (errorCount <= 2) {
		return "light";
	}

	if (errorCount <= 5) {
		return "medium";
	}

	return "severe";
}

function sanitizeCount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function sanitizeAccuracy(value: unknown, correctCount: number, totalAttempts: number): number {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) {
		return value;
	}

	return totalAttempts > 0 ? correctCount / totalAttempts : 0;
}

export function buildErrorTrackingFromChoiceStats(
	choiceStats: NonNullable<Card["stats"]["choiceStats"]>,
	existing?: Card["stats"]["errorTracking"]
): NonNullable<Card["stats"]["errorTracking"]> {
	const errorCount = sanitizeCount(choiceStats.errorCount);
	const correctCount = sanitizeCount(choiceStats.correctAttempts);
	const totalAttempts = sanitizeCount(choiceStats.totalAttempts);
	const accuracy = sanitizeAccuracy(choiceStats.accuracy, correctCount, totalAttempts);
	const errorLevel = calculateErrorLevel(errorCount);
	const isInErrorBook =
		typeof choiceStats.isInErrorBook === "boolean"
			? choiceStats.isInErrorBook
			: typeof existing?.isInErrorBook === "boolean"
				? existing.isInErrorBook
				: !!errorLevel;

	return {
		isInErrorBook,
		errorCount,
		correctCount,
		accuracy,
		lastErrorDate:
			typeof choiceStats.lastErrorDate === "string" && choiceStats.lastErrorDate.trim()
				? choiceStats.lastErrorDate
				: existing?.lastErrorDate,
		errorLevel,
	};
}

export function cardNeedsLegacyStatsMigration(card: Card | null | undefined): boolean {
	if (!card?.stats?.choiceStats) {
		return false;
	}

	const normalized = buildErrorTrackingFromChoiceStats(
		card.stats.choiceStats,
		card.stats.errorTracking
	);
	const current = card.stats.errorTracking;
	if (!current) {
		return true;
	}

	return (
		current.isInErrorBook !== normalized.isInErrorBook ||
		current.errorCount !== normalized.errorCount ||
		current.correctCount !== normalized.correctCount ||
		current.accuracy !== normalized.accuracy ||
		current.lastErrorDate !== normalized.lastErrorDate ||
		current.errorLevel !== normalized.errorLevel
	);
}

export function syncCardStatsToCanonicalFormat(card: Card): boolean {
	if (!card?.stats?.choiceStats) {
		return false;
	}

	const normalized = buildErrorTrackingFromChoiceStats(
		card.stats.choiceStats,
		card.stats.errorTracking
	);

	if (
		card.stats.errorTracking &&
		card.stats.errorTracking.isInErrorBook === normalized.isInErrorBook &&
		card.stats.errorTracking.errorCount === normalized.errorCount &&
		card.stats.errorTracking.correctCount === normalized.correctCount &&
		card.stats.errorTracking.accuracy === normalized.accuracy &&
		card.stats.errorTracking.lastErrorDate === normalized.lastErrorDate &&
		card.stats.errorTracking.errorLevel === normalized.errorLevel
	) {
		return false;
	}

	card.stats = {
		...card.stats,
		errorTracking: normalized,
	};
	return true;
}

export function setCardErrorBookState(card: Card, isInErrorBook: boolean): void {
	const stats = card.stats || {
		totalReviews: 0,
		totalTime: 0,
		averageTime: 0,
	};

	const errorTracking = stats.errorTracking || {
		isInErrorBook: false,
		errorCount: 0,
		correctCount: 0,
		accuracy: 0,
		errorLevel: undefined,
	};

	errorTracking.isInErrorBook = isInErrorBook;

	const choiceStats = stats.choiceStats;
	if (choiceStats) {
		choiceStats.isInErrorBook = isInErrorBook;
	}

	card.stats = {
		...stats,
		errorTracking,
	};
}
