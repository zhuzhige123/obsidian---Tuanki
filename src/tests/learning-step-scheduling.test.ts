import { Rating as TsRating, createEmptyCard, fsrs as createTsFsrs } from "ts-fsrs";
import { FSRS } from "../algorithms/fsrs";
import { toTsFsrsParams } from "../algorithms/fsrs-adapter";
import { FSRS6_DEFAULTS } from "../types/fsrs6-types";
import { CardState, Rating, type Card } from "../data/types";
import { StepIndexCalculator } from "../utils/learning-steps/StepIndexCalculator";
import { normalizeMemorySchedulingSettings } from "../utils/learning-steps/memorySchedulingConfig";
import { applyLearningStepScheduling } from "../utils/learning-steps/learningStepScheduling";
import {
	getSessionQueueInsertionPlan,
	isCardDueNow,
	requeueFutureDueCards,
} from "../utils/learning-steps/sessionQueueScheduling";
import { minutesToDays } from "../utils/study/timeCalculation";

const defaultConfig = {
	learningSteps: [1, 10],
	relearningSteps: [10],
	graduatingInterval: 1,
	easyInterval: 4,
};

function createQueueCard(uuid: string, state: CardState, due: string): Card {
	return {
		uuid,
		content: "",
		fsrs: {
			due,
			stability: 0,
			difficulty: 0,
			elapsedDays: 0,
			scheduledDays: 0,
			reps: 0,
			lapses: 0,
			state,
			lastReview: due,
			retrievability: 1,
		},
	} as Card;
}

describe("learningStepScheduling", () => {
	test("keeps a learning card in Learning after Again", () => {
		const fsrs = new FSRS();
		const now = new Date("2026-01-01T00:00:00.000Z");
		const firstAgain = fsrs.review(fsrs.createCard(), Rating.Again).card;
		applyLearningStepScheduling({
			prevState: CardState.New,
			rating: Rating.Again,
			updatedCard: firstAgain,
			config: defaultConfig,
			currentStepIndex: 0,
			now,
		});
		expect(firstAgain.state).toBe(CardState.Learning);

		const secondAgain = fsrs.review(firstAgain, Rating.Again).card;
		applyLearningStepScheduling({
			prevState: CardState.Learning,
			rating: Rating.Again,
			updatedCard: secondAgain,
			config: defaultConfig,
			currentStepIndex: 0,
			now,
		});
		expect(secondAgain.state).toBe(CardState.Learning);
	});

	test("uses Anki-style first-step Hard timing for new cards", () => {
		const fsrs = new FSRS();
		const original = fsrs.createCard();
		const updated = fsrs.review(original, Rating.Hard).card;

		const result = applyLearningStepScheduling({
			prevState: original.state,
			rating: Rating.Hard,
			updatedCard: updated,
			config: defaultConfig,
			currentStepIndex: 0,
			now: new Date("2026-01-01T00:00:00.000Z"),
		});

		expect(result.applied).toBe(true);
		expect(result.nextStepIndex).toBe(0);
		expect(updated.state).toBe(CardState.Learning);
		expect(updated.scheduledDays).toBeCloseTo(minutesToDays(6), 5);
	});

	test("uses the second learning step for Good on a new card", () => {
		const fsrs = new FSRS();
		const original = fsrs.createCard();
		const updated = fsrs.review(original, Rating.Good).card;

		const result = applyLearningStepScheduling({
			prevState: original.state,
			rating: Rating.Good,
			updatedCard: updated,
			config: defaultConfig,
			currentStepIndex: 0,
			now: new Date("2026-01-01T00:00:00.000Z"),
		});

		expect(result.applied).toBe(true);
		expect(result.nextStepIndex).toBe(1);
		expect(updated.state).toBe(CardState.Learning);
		expect(updated.scheduledDays).toBeCloseTo(minutesToDays(10), 5);
	});

	test("keeps FSRS6 easy interval for a new card instead of legacy 4-day override", () => {
		const now = new Date("2026-01-01T00:00:00.000Z");
		const fsrs = new FSRS({ enableFuzz: false });
		const original = fsrs.createCard();
		const updated = fsrs.review(original, Rating.Easy, now.toISOString()).card;
		const expected = createTsFsrs(
			toTsFsrsParams({
				enableFuzz: false,
				w: [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS],
			})
		).next(createEmptyCard(now), now, TsRating.Easy).card.scheduled_days;

		const result = applyLearningStepScheduling({
			prevState: original.state,
			rating: Rating.Easy,
			updatedCard: updated,
			config: defaultConfig,
			currentStepIndex: 0,
			now,
		});

		expect(result.applied).toBe(false);
		expect(updated.state).toBe(CardState.Review);
		expect(updated.scheduledDays).toBe(expected);
		expect(updated.scheduledDays).not.toBe(defaultConfig.easyInterval);
	});

	test("allows pure FSRS mode when learning steps are empty", () => {
		const fsrs = new FSRS();
		const original = fsrs.createCard();
		const updated = fsrs.review(original, Rating.Again).card;

		const result = applyLearningStepScheduling({
			prevState: original.state,
			rating: Rating.Again,
			updatedCard: updated,
			config: {
				learningSteps: [],
				relearningSteps: [],
				graduatingInterval: 1,
				easyInterval: 4,
			},
			currentStepIndex: 0,
			now: new Date("2026-01-01T00:00:00.000Z"),
		});

		expect(result.applied).toBe(false);
		expect(updated.scheduledDays).toBeGreaterThanOrEqual(1);
	});

	test("preserves explicit empty relearning steps for pure FSRS fallback", () => {
		const normalized = normalizeMemorySchedulingSettings(
			{
				learningSteps: [1, 10],
				graduatingInterval: 1,
				easyInterval: 4,
			},
			{
				learningSteps: [],
				relearningSteps: [],
				graduatingInterval: 1,
				easyInterval: 4,
			},
		);

		expect(normalized.settings.relearningSteps).toEqual([]);
	});

	test("fills missing legacy relearning steps from the mixed-mode fallback", () => {
		const normalized = normalizeMemorySchedulingSettings(
			{
				learningSteps: [1, 10],
				graduatingInterval: 1,
				easyInterval: 4,
			},
			defaultConfig,
		);

		expect(normalized.settings.relearningSteps).toEqual([10]);
	});

	test("does not let a twice-failed new card jump to multi-day Hard intervals", () => {
		const fsrs = new FSRS();
		const now = new Date("2026-01-01T00:00:00.000Z");

		const firstAgain = fsrs.review(fsrs.createCard(), Rating.Again).card;
		applyLearningStepScheduling({
			prevState: CardState.New,
			rating: Rating.Again,
			updatedCard: firstAgain,
			config: defaultConfig,
			currentStepIndex: 0,
			now,
		});

		const secondAgain = fsrs.review(firstAgain, Rating.Again).card;
		applyLearningStepScheduling({
			prevState: CardState.Learning,
			rating: Rating.Again,
			updatedCard: secondAgain,
			config: defaultConfig,
			currentStepIndex: 0,
			now,
		});

		const hardAfterFailures = fsrs.review(secondAgain, Rating.Hard).card;
		applyLearningStepScheduling({
			prevState: CardState.Learning,
			rating: Rating.Hard,
			updatedCard: hardAfterFailures,
			config: defaultConfig,
			currentStepIndex: 0,
			now,
		});

		expect(hardAfterFailures.state).toBe(CardState.Learning);
		expect(hardAfterFailures.scheduledDays).toBeCloseTo(minutesToDays(6), 5);
		expect(hardAfterFailures.scheduledDays).toBeLessThan(1);
	});

	test("maps a 6-minute first-step Hard interval back to step 0", () => {
		const card = {
			uuid: "test-card",
			fsrs: {
				due: new Date().toISOString(),
				stability: 0,
				difficulty: 0,
				elapsedDays: 0,
				scheduledDays: minutesToDays(6),
				reps: 0,
				lapses: 0,
				state: CardState.Learning,
				lastReview: new Date().toISOString(),
				retrievability: 1,
			},
		} as Card;

		expect(StepIndexCalculator.calculate(card, [1, 10], [10])).toBe(0);
	});

	test("does not reinsert new cards into the current session in pure FSRS mode", () => {
		expect(
			getSessionQueueInsertionPlan(CardState.New, Rating.Again, {
				learningSteps: [],
				relearningSteps: [],
			})
		).toEqual({
			shouldInsert: false,
			insertOffset: 0,
		});
	});

	test("does not reinsert review lapses when relearning steps are empty", () => {
		expect(
			getSessionQueueInsertionPlan(CardState.Review, Rating.Again, {
				learningSteps: [1, 10],
				relearningSteps: [],
			})
		).toEqual({
			shouldInsert: false,
			insertOffset: 0,
		});
	});

	test("reinserts relearning Again cards when mixed mode keeps short relearning steps", () => {
		expect(
			getSessionQueueInsertionPlan(CardState.Relearning, Rating.Again, {
				learningSteps: [1, 10],
				relearningSteps: [10],
			})
		).toEqual({
			shouldInsert: true,
			insertOffset: 1,
		});
	});

	test("treats future-due learning cards as not due yet", () => {
		const futureDueCard = createQueueCard("future", CardState.Learning, "2026-01-01T00:06:00.000Z");

		expect(isCardDueNow(futureDueCard, Date.parse("2026-01-01T00:01:00.000Z"))).toBe(false);
		expect(isCardDueNow(futureDueCard, Date.parse("2026-01-01T00:06:00.000Z"))).toBe(true);
	});

	test("moves future-due cards behind due cards in the same session queue", () => {
		const queue = [
			createQueueCard("current", CardState.Review, "2026-01-01T00:00:00.000Z"),
			createQueueCard("future", CardState.Learning, "2026-01-01T00:06:00.000Z"),
			createQueueCard("due", CardState.Review, "2026-01-01T00:00:00.000Z"),
		];

		const result = requeueFutureDueCards(queue, 0, Date.parse("2026-01-01T00:01:00.000Z"));

		expect(result.nextIndex).toBe(1);
		expect(result.movedCount).toBe(1);
		expect(queue.map(card => card.uuid)).toEqual(["current", "due", "future"]);
	});

	test("reports pending future cards when no later card is due yet", () => {
		const queue = [
			createQueueCard("current", CardState.Review, "2026-01-01T00:00:00.000Z"),
			createQueueCard("future", CardState.Learning, "2026-01-01T00:06:00.000Z"),
		];

		const result = requeueFutureDueCards(queue, 0, Date.parse("2026-01-01T00:01:00.000Z"));

		expect(result.nextIndex).toBe(-1);
		expect(result.movedCount).toBe(1);
		expect(result.nextPendingDueAt).toBe("2026-01-01T00:06:00.000Z");
		expect(queue.map(card => card.uuid)).toEqual(["current", "future"]);
	});
});
