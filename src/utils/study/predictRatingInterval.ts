import type { FSRS } from "../../algorithms/fsrs";
import { sanitizeFsrsCardForScheduling } from "../../algorithms/fsrs-adapter";
import type { Card, FSRSCard, Rating } from "../../data/types";
import { StepIndexCalculator } from "../learning-steps/StepIndexCalculator";
import { applyLearningStepScheduling } from "../learning-steps/learningStepScheduling";
import type { MemorySchedulingSettings } from "../learning-steps/memorySchedulingConfig";

function cloneFsrsCard(card: Card): FSRSCard | null {
	if (!card.fsrs) {
		return null;
	}

	return {
		due: card.fsrs.due,
		stability: card.fsrs.stability,
		difficulty: card.fsrs.difficulty,
		elapsedDays: card.fsrs.elapsedDays,
		scheduledDays: card.fsrs.scheduledDays,
		reps: card.fsrs.reps,
		lapses: card.fsrs.lapses,
		state: card.fsrs.state,
		lastReview: card.fsrs.lastReview,
		retrievability: card.fsrs.retrievability,
	};
}

export function predictRatingScheduledDays(options: {
	card: Card;
	fsrs: Pick<FSRS, "review">;
	rating: Rating;
	learningConfig: MemorySchedulingSettings;
	learningStepIndex?: number;
}): number | null {
	const { card, fsrs, rating, learningConfig, learningStepIndex } = options;
	const cloned = cloneFsrsCard(card);
	if (!cloned) {
		return null;
	}

	const sanitized = sanitizeFsrsCardForScheduling(cloned);
	const prevState = sanitized.state;
	const { card: updatedCard } = fsrs.review(sanitized, rating);
	const currentStepIndex =
		typeof learningStepIndex === "number"
			? learningStepIndex
			: StepIndexCalculator.calculate(
					card,
					learningConfig.learningSteps,
					learningConfig.relearningSteps
			  );

	applyLearningStepScheduling({
		prevState,
		rating,
		updatedCard,
		config: learningConfig,
		currentStepIndex,
	});

	return updatedCard.scheduledDays || 0;
}
