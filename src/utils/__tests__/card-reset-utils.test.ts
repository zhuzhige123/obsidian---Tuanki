import { describe, expect, it } from "vitest";
import { CardState, CardType, Rating, type Card, type FSRSCard, type ReviewLog } from "../../data/types";
import type { ProgressiveClozeParentCard } from "../../types/progressive-cloze-v2";
import {
	collectCardsToResetToNew,
	createDefaultMemoryCardFsrs,
	isMemoryCard,
	resetCardLearningState,
} from "../card-reset-utils";

function createStudiedCard(overrides: Partial<Card> = {}): Card {
	const fsrs: FSRSCard = {
		due: "2026-03-20T00:00:00.000Z",
		stability: 3,
		difficulty: 5,
		elapsedDays: 2,
		scheduledDays: 5,
		reps: 4,
		lapses: 1,
		state: CardState.Review,
		lastReview: "2026-03-15T00:00:00.000Z",
		retrievability: 0.8,
	};
	const reviewHistory: ReviewLog[] = [
		{
			rating: Rating.Good,
			state: CardState.Review,
			due: "2026-03-20T00:00:00.000Z",
			stability: 3,
			difficulty: 5,
			elapsedDays: 2,
			lastElapsedDays: 1,
			scheduledDays: 5,
			review: "2026-03-15T00:00:00.000Z",
		},
	];

	return {
		uuid: "card-1",
		content: "front\n---div---\nback",
		stats: {
			totalReviews: 4,
			totalTime: 120,
			averageTime: 30,
			memoryRate: 0.75,
			errorTracking: {
				isInErrorBook: true,
				errorCount: 2,
				correctCount: 2,
				accuracy: 0.5,
			},
		},
		fsrs,
		reviewHistory,
		personalization: {
			personalizedWeights: [1, 2, 3],
			confidenceLevel: 0.9,
		},
		created: "2026-01-01T00:00:00.000Z",
		modified: "2026-03-15T00:00:00.000Z",
		...overrides,
	};
}

describe("card-reset-utils", () => {
	it("creates a fresh FSRS card in New state", () => {
		const fsrs = createDefaultMemoryCardFsrs(new Date("2026-06-16T08:00:00.000Z"));
		expect(fsrs.state).toBe(CardState.New);
		expect(fsrs.reps).toBe(0);
		expect(fsrs.lapses).toBe(0);
		expect(fsrs.lastReview).toBeUndefined();
	});

	it("resets learning state while preserving card content", () => {
		const card = createStudiedCard();
		const reset = resetCardLearningState(card, new Date("2026-06-16T08:00:00.000Z"));

		expect(reset.content).toBe(card.content);
		expect(reset.uuid).toBe(card.uuid);
		expect(reset.reviewHistory).toEqual([]);
		expect(reset.fsrs?.state).toBe(CardState.New);
		expect(reset.fsrs?.reps).toBe(0);
		expect(reset.stats.totalReviews).toBe(0);
		expect(reset.stats.errorTracking).toBeUndefined();
		expect(reset.personalization).toBeUndefined();
		expect(reset.modified).toBe("2026-06-16T08:00:00.000Z");
	});

	it("includes progressive child cards when resetting a parent card", () => {
		const parent = createStudiedCard({
			uuid: "parent-1",
			type: CardType.ProgressiveParent,
		}) as ProgressiveClozeParentCard;
		parent.progressiveCloze = {
			childCardIds: ["child-1", "child-2"],
			totalClozes: 2,
			createdAt: "2026-01-01T00:00:00.000Z",
		};
		const child1 = createStudiedCard({ uuid: "child-1", parentCardId: "parent-1" });
		const child2 = createStudiedCard({ uuid: "child-2", parentCardId: "parent-1" });

		const targets = collectCardsToResetToNew(parent, [parent, child1, child2]);
		expect(targets.map((card) => card.uuid)).toEqual(["parent-1", "child-1", "child-2"]);
	});

	it("detects memory cards", () => {
		expect(isMemoryCard(createStudiedCard())).toBe(true);
		expect(isMemoryCard(createStudiedCard({ cardPurpose: "test" }))).toBe(false);
	});
});
