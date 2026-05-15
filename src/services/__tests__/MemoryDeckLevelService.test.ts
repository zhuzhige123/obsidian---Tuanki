import { describe, expect, it } from "vitest";

import { CardState, type Card } from "../../data/types";
import {
	countMasteredMemoryCards,
	getMemoryDeckLevelProgress,
	getMemoryDeckLevelUpRequirement,
	isMasteredMemoryCard,
	MEMORY_DECK_MAX_LEVEL,
} from "../deck/MemoryDeckLevelService";

function createCard(state: CardState, stability: number): Card {
	return {
		uuid: `${state}-${stability}`,
		content: "",
		stats: {
			totalReviews: 0,
			totalTime: 0,
			averageTime: 0,
		},
		created: new Date(0).toISOString(),
		modified: new Date(0).toISOString(),
		tags: [],
		metadata: {},
		fsrs: {
			due: new Date(0).toISOString(),
			stability,
			difficulty: 5,
			elapsedDays: 0,
			scheduledDays: 0,
			reps: 0,
			lapses: 0,
			state,
			retrievability: 0.9,
		},
		cardPurpose: "memory",
	};
}

describe("MemoryDeckLevelService", () => {
	it("starts at level 1 with zero experience", () => {
		const progress = getMemoryDeckLevelProgress(0);

		expect(progress.level).toBe(1);
		expect(progress.progressPercent).toBe(0);
		expect(progress.isMaxLevel).toBe(false);
	});

	it("counts only review cards above the mastered stability threshold", () => {
		const cards = [
			createCard(CardState.Review, 22),
			createCard(CardState.Review, 21),
			createCard(CardState.Learning, 30),
			createCard(CardState.Review, 45),
		];

		expect(isMasteredMemoryCard(cards[0])).toBe(true);
		expect(isMasteredMemoryCard(cards[1])).toBe(false);
		expect(isMasteredMemoryCard(cards[2])).toBe(false);
		expect(countMasteredMemoryCards(cards)).toBe(2);
	});

	it("uses an increasing level-up requirement curve and respects the max level", () => {
		expect(getMemoryDeckLevelUpRequirement(1)).toBeLessThan(getMemoryDeckLevelUpRequirement(10));
		expect(getMemoryDeckLevelUpRequirement(10)).toBeLessThan(getMemoryDeckLevelUpRequirement(20));
		expect(getMemoryDeckLevelUpRequirement(20)).toBeLessThan(getMemoryDeckLevelUpRequirement(29));

		const maxed = getMemoryDeckLevelProgress(999999);
		expect(maxed.level).toBe(MEMORY_DECK_MAX_LEVEL);
		expect(maxed.isMaxLevel).toBe(true);
		expect(maxed.progressPercent).toBe(100);
	});
});
