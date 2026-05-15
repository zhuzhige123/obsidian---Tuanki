import type { FSRS } from "../../algorithms/fsrs";
import { CardState, CardType, Rating, type Card, type Deck } from "../../data/types";
import { StepIndexCalculator } from "../learning-steps/StepIndexCalculator";
import { applyLearningStepScheduling } from "../learning-steps/learningStepScheduling";
import { resolveMemorySchedulingForCard } from "./memorySchedulingResolver";
import { predictRatingScheduledDays } from "./predictRatingInterval";

function createDeck(id: string, name: string): Deck {
	return { id, name } as Deck;
}

function createCard(overrides: Partial<Card> = {}): Card {
	return {
		uuid: "card-1",
		deckId: "fallback-deck",
		type: CardType.Basic,
		content: "---\nwe_decks:\n  - 目标牌组\n---\n问题\n---div---\n答案",
		tags: [],
		fsrs: {
			due: "2026-04-01T10:00:00.000Z",
			stability: 3,
			difficulty: 5,
			elapsedDays: 0,
			scheduledDays: 0,
			reps: 0,
			lapses: 0,
			state: CardState.New,
			retrievability: 0.9,
		},
		created: "2026-04-01T00:00:00.000Z",
		modified: "2026-04-01T00:00:00.000Z",
		...overrides,
	} as Card;
}

describe("predictRatingScheduledDays", () => {
	it("matches the actual learning-step scheduling result for the YAML-resolved deck config", () => {
		const decks = [
			createDeck("fallback-deck", "旧牌组"),
			createDeck("resolved-deck", "目标牌组"),
		];
		const card = createCard();
		const learningConfig = resolveMemorySchedulingForCard({
			card,
			decks,
			deckSettingsMap: new Map<string, unknown>([
				["fallback-deck", { learningSteps: [999], relearningSteps: [999] }],
				["resolved-deck", { learningSteps: [1, 15], relearningSteps: [20] }],
			]),
			globalSettings: { learningSteps: [3, 30], relearningSteps: [40] },
		});

		const fsrs = {
			review: vi.fn((_card, _rating) => ({
				card: {
					...card.fsrs!,
					state: CardState.Learning,
					scheduledDays: 12,
					due: "2026-04-10T10:00:00.000Z",
				},
				log: {},
			})),
		} as unknown as Pick<FSRS, "review">;

		const predictedScheduledDays = predictRatingScheduledDays({
			card,
			fsrs,
			rating: Rating.Hard,
			learningConfig,
		});

		const { card: actualUpdatedCard } = fsrs.review(card.fsrs!, Rating.Hard);
		applyLearningStepScheduling({
			prevState: card.fsrs!.state,
			rating: Rating.Hard,
			updatedCard: actualUpdatedCard,
			config: learningConfig,
			currentStepIndex: StepIndexCalculator.calculate(
				card,
				learningConfig.learningSteps,
				learningConfig.relearningSteps
			),
		});

		expect(predictedScheduledDays).toBe(actualUpdatedCard.scheduledDays);
		expect(predictedScheduledDays).not.toBe(12);
	});

	it("returns null when the card has no fsrs state", () => {
		const result = predictRatingScheduledDays({
			card: createCard({ fsrs: undefined }),
			fsrs: { review: vi.fn() } as unknown as Pick<FSRS, "review">,
			rating: Rating.Good,
			learningConfig: {
				learningSteps: [1, 10],
				relearningSteps: [10],
				graduatingInterval: 1,
				easyInterval: 4,
			},
		});

		expect(result).toBeNull();
	});
});
