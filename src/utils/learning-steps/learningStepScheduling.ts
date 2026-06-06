import type { FSRSCard, Rating } from "../../data/types";
import { CardState, Rating as RatingEnum } from "../../data/types";
import { minutesToDays } from "../study/timeCalculation";

export interface LearningStepSchedulingConfig {
	learningSteps: number[];
	relearningSteps: number[];
	graduatingInterval: number;
	easyInterval: number;
}

export interface ApplyLearningStepSchedulingOptions {
	prevState: CardState;
	rating: Rating;
	updatedCard: FSRSCard;
	config: LearningStepSchedulingConfig;
	currentStepIndex?: number;
	now?: Date;
}

export interface ApplyLearningStepSchedulingResult {
	applied: boolean;
	nextStepIndex: number | null;
}

function clampStepIndex(stepIndex: number | undefined, steps: number[]): number {
	if (steps.length === 0) {
		return 0;
	}

	if (typeof stepIndex !== "number" || Number.isNaN(stepIndex)) {
		return 0;
	}

	return Math.min(Math.max(Math.round(stepIndex), 0), steps.length - 1);
}

function setDueAfterMinutes(card: FSRSCard, minutes: number, now: Date): void {
	const safeMinutes = Math.max(0, minutes);
	card.scheduledDays = minutesToDays(safeMinutes);
	card.due = new Date(now.getTime() + Math.round(safeMinutes * 60 * 1000)).toISOString();
}

function getFirstStepHardMinutes(steps: number[]): number {
	if (steps.length === 0) {
		return 0;
	}

	if (steps.length === 1) {
		return Math.min(Math.round(steps[0] * 1.5), steps[0] + 24 * 60);
	}

	return Math.max(1, Math.round((steps[0] + steps[1]) / 2));
}

export function applyLearningStepScheduling(
	options: ApplyLearningStepSchedulingOptions
): ApplyLearningStepSchedulingResult {
	const { prevState, rating, updatedCard, config } = options;

	const isLearningMode = prevState === CardState.New || prevState === CardState.Learning;
	const isRelearningMode =
		prevState === CardState.Relearning ||
		(prevState === CardState.Review && rating === RatingEnum.Again);

	if (!isLearningMode && !isRelearningMode) {
		return { applied: false, nextStepIndex: null };
	}

	const steps = isRelearningMode ? config.relearningSteps ?? [] : config.learningSteps ?? [];
	if (steps.length === 0) {
		return { applied: false, nextStepIndex: null };
	}

	const now = options.now ?? new Date();
	const currentStepIndex =
		prevState === CardState.New || (prevState === CardState.Review && rating === RatingEnum.Again)
			? 0
			: clampStepIndex(options.currentStepIndex, steps);
	const learningState = isRelearningMode ? CardState.Relearning : CardState.Learning;

	switch (rating) {
		case RatingEnum.Again:
			setDueAfterMinutes(updatedCard, steps[0] ?? 1, now);
			updatedCard.state = learningState;
			return { applied: true, nextStepIndex: 0 };

		case RatingEnum.Hard: {
			const minutes =
				currentStepIndex === 0
					? getFirstStepHardMinutes(steps)
					: steps[currentStepIndex] ?? steps[0] ?? 1;
			setDueAfterMinutes(updatedCard, minutes, now);
			updatedCard.state = learningState;
			return { applied: true, nextStepIndex: currentStepIndex };
		}

		case RatingEnum.Good: {
			const nextStepIndex = currentStepIndex + 1;
			if (nextStepIndex < steps.length) {
				setDueAfterMinutes(updatedCard, steps[nextStepIndex] ?? steps[steps.length - 1] ?? 1, now);
				updatedCard.state = learningState;
				return { applied: true, nextStepIndex };
			}

			// FSRS6 下，完成最后一个学习步骤后应交还给核心调度计算毕业后的长期间隔，
			// 不再使用传统的 graduatingInterval 覆盖。
			return { applied: false, nextStepIndex: null };
		}

		case RatingEnum.Easy:
			// FSRS6 下，Easy 的长期间隔应由核心算法决定，避免被旧 easyInterval 覆盖。
			return { applied: false, nextStepIndex: null };

		default:
			return { applied: false, nextStepIndex: null };
	}
}
