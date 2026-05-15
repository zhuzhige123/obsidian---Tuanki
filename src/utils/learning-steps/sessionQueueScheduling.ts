import { CardState, Rating } from "../../data/types";
import type { Card } from "../../data/types";
import type { LearningStepSchedulingConfig } from "./learningStepScheduling";

export interface SessionQueueInsertionPlan {
	shouldInsert: boolean;
	insertOffset: number;
}

export interface SessionQueueAdvanceResult {
	nextIndex: number;
	movedCount: number;
	nextPendingDueAt: string | null;
}

export interface SessionQueueAdvanceOptions {
	allowFutureDueCards?: boolean;
	continueWithPendingCards?: boolean;
}

export function getSessionQueueInsertionPlan(
	prevState: CardState,
	rating: Rating,
	config: Pick<LearningStepSchedulingConfig, "learningSteps" | "relearningSteps">
): SessionQueueInsertionPlan {
	const learningSteps = config.learningSteps ?? [];
	const relearningSteps = config.relearningSteps ?? [];

	if (prevState === CardState.New) {
		if (learningSteps.length === 0) {
			return { shouldInsert: false, insertOffset: 0 };
		}

		if (rating === Rating.Again) {
			return { shouldInsert: true, insertOffset: 1 };
		}

		if (rating === Rating.Hard) {
			return { shouldInsert: true, insertOffset: 3 };
		}

		return { shouldInsert: false, insertOffset: 0 };
	}

	if (prevState === CardState.Learning) {
		if (rating === Rating.Again && learningSteps.length > 0) {
			return { shouldInsert: true, insertOffset: 1 };
		}

		return { shouldInsert: false, insertOffset: 0 };
	}

	if (prevState === CardState.Review) {
		if (rating === Rating.Again && relearningSteps.length > 0) {
			return { shouldInsert: true, insertOffset: 2 };
		}

		return { shouldInsert: false, insertOffset: 0 };
	}

	if (prevState === CardState.Relearning) {
		if (rating === Rating.Again && relearningSteps.length > 0) {
			return { shouldInsert: true, insertOffset: 1 };
		}

		return { shouldInsert: false, insertOffset: 0 };
	}

	return { shouldInsert: false, insertOffset: 0 };
}

function getDueTimeMs(card: Pick<Card, "fsrs">): number | null {
	if (!card.fsrs?.due) {
		return null;
	}

	const dueTimeMs = Date.parse(card.fsrs.due);
	return Number.isNaN(dueTimeMs) ? null : dueTimeMs;
}

export function isCardDueNow(card: Pick<Card, "fsrs">, nowMs = Date.now()): boolean {
	if (!card.fsrs) {
		return true;
	}

	if (card.fsrs.state === CardState.New) {
		return true;
	}

	const dueTimeMs = getDueTimeMs(card);
	return dueTimeMs === null || dueTimeMs <= nowMs;
}

export function requeueFutureDueCards(
	queue: Card[],
	currentIndex: number,
	nowMs = Date.now(),
	options: SessionQueueAdvanceOptions = {}
): SessionQueueAdvanceResult {
	const { allowFutureDueCards = false, continueWithPendingCards = false } = options;
	const searchIndex = currentIndex + 1;
	const pendingFallbackIndex = searchIndex < queue.length ? searchIndex : -1;
	let remainingToInspect = queue.length - searchIndex;
	let movedCount = 0;
	let nextPendingDueMs: number | null = null;

	while (remainingToInspect > 0 && searchIndex < queue.length) {
		const candidate = queue[searchIndex];
		if (allowFutureDueCards || isCardDueNow(candidate, nowMs)) {
			return {
				nextIndex: searchIndex,
				movedCount,
				nextPendingDueAt:
					nextPendingDueMs === null ? null : new Date(nextPendingDueMs).toISOString(),
			};
		}

		const dueTimeMs = getDueTimeMs(candidate);
		if (dueTimeMs !== null && (nextPendingDueMs === null || dueTimeMs < nextPendingDueMs)) {
			nextPendingDueMs = dueTimeMs;
		}

		queue.splice(searchIndex, 1);
		queue.push(candidate);
		movedCount++;
		remainingToInspect--;
	}

	return {
		nextIndex: continueWithPendingCards ? pendingFallbackIndex : -1,
		movedCount,
		nextPendingDueAt: nextPendingDueMs === null ? null : new Date(nextPendingDueMs).toISOString(),
	};
}
