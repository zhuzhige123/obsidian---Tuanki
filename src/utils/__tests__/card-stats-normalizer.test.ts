import type { Card } from "../../data/types";
import { CardType } from "../../data/types";
import {
	buildErrorTrackingFromChoiceStats,
	cardNeedsLegacyStatsMigration,
	setCardErrorBookState,
	syncCardStatsToCanonicalFormat,
} from "../card-stats-normalizer";

function createCard(overrides: Partial<Card> = {}): Card {
	return {
		uuid: "card-1",
		content: "---\nwe_type: basic\n---\nfront<->back",
		type: CardType.Basic,
		stats: {
			totalReviews: 0,
			totalTime: 0,
			averageTime: 0,
			choiceStats: {
				totalAttempts: 4,
				correctAttempts: 3,
				accuracy: 0.75,
				averageResponseTime: 1500,
				recentAttempts: [],
				isInErrorBook: true,
				errorCount: 1,
				lastErrorDate: "2026-05-16T00:00:00.000Z",
			},
		},
		created: "2026-05-16T00:00:00.000Z",
		modified: "2026-05-16T00:00:00.000Z",
		...overrides,
	};
}

describe("card-stats-normalizer", () => {
	it("builds canonical error tracking from legacy choice stats", () => {
		const card = createCard();

		expect(buildErrorTrackingFromChoiceStats(card.stats.choiceStats!)).toEqual({
			isInErrorBook: true,
			errorCount: 1,
			correctCount: 3,
			accuracy: 0.75,
			lastErrorDate: "2026-05-16T00:00:00.000Z",
			errorLevel: "light",
		});
	});

	it("detects cards that still rely on legacy stats compatibility", () => {
		const card = createCard();

		expect(cardNeedsLegacyStatsMigration(card)).toBe(true);

		syncCardStatsToCanonicalFormat(card);

		expect(cardNeedsLegacyStatsMigration(card)).toBe(false);
	});

	it("syncs canonical error tracking in place", () => {
		const card = createCard();

		const changed = syncCardStatsToCanonicalFormat(card);

		expect(changed).toBe(true);
		expect(card.stats.errorTracking).toMatchObject({
			isInErrorBook: true,
			errorCount: 1,
			correctCount: 3,
			accuracy: 0.75,
			errorLevel: "light",
		});
	});

	it("updates canonical and legacy error-book flags together when toggled manually", () => {
		const card = createCard();
		syncCardStatsToCanonicalFormat(card);

		setCardErrorBookState(card, false);

		expect(card.stats.errorTracking?.isInErrorBook).toBe(false);
		expect(card.stats.choiceStats?.isInErrorBook).toBe(false);
	});
});
