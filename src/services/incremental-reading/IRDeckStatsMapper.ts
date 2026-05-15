import type { DeckStats } from "../../data/types";
import type { IRDeckStats } from "../../types/ir-types";

export function toDeckStats(irStats?: Partial<IRDeckStats> | null): DeckStats {
	const dueToday = irStats?.dueToday ?? 0;
	const dueWithinDays = irStats?.dueWithinDays ?? dueToday;

	return {
		totalCards: irStats?.totalCount ?? 0,
		newCards: dueToday,
		learningCards: Math.max(0, dueWithinDays - dueToday),
		reviewCards: irStats?.questionCount ?? 0,
		todayNew: 0,
		todayReview: 0,
		todayTime: 0,
		totalReviews: 0,
		totalTime: 0,
		memoryRate: 0,
		averageEase: 0,
		forecastDays: {},
	};
}
