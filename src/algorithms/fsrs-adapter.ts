/**
 * Adapters between plugin FSRSCard/FSRSParameters and official ts-fsrs types.
 */

import {
	createEmptyCard,
	forgetting_curve,
	fsrs as createTsFsrs,
	type Card as TsCard,
	type FSRS as TsFsrs,
	type FSRSParameters as TsFsrsParameters,
	type Grade,
	FSRSVersion,
	generatorParameters,
	default_w,
	S_MIN,
} from "ts-fsrs";
import type { FSRSCard, FSRSParameters, ReviewLog } from "../data/types";
import { CardState, Rating } from "../data/types";
import { FSRS6_DEFAULTS } from "../types/fsrs6-types";

/** Plugin-owned learning steps; ts-fsrs steps stay empty. */
export const PLUGIN_OWNED_SCHEDULING: Pick<
	TsFsrsParameters,
	"learning_steps" | "relearning_steps" | "enable_short_term"
> = {
	learning_steps: [],
	relearning_steps: [],
	enable_short_term: true,
};

export function resolvePluginWeights(params?: Partial<FSRSParameters>): number[] {
	const w = params?.w;
	if (Array.isArray(w) && w.length === 21) {
		return [...w];
	}
	return [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS];
}

export function toTsFsrsParams(params?: Partial<FSRSParameters>): Partial<TsFsrsParameters> {
	const w = resolvePluginWeights(params);
	return {
		w,
		request_retention: params?.requestRetention ?? FSRS6_DEFAULTS.REQUEST_RETENTION,
		maximum_interval: params?.maximumInterval ?? FSRS6_DEFAULTS.MAXIMUM_INTERVAL,
		enable_fuzz: params?.enableFuzz ?? FSRS6_DEFAULTS.ENABLE_FUZZ,
		...PLUGIN_OWNED_SCHEDULING,
	};
}

export function toPluginFsrsParameters(tsParams: TsFsrsParameters): FSRSParameters {
	return {
		w: [...tsParams.w],
		requestRetention: tsParams.request_retention,
		maximumInterval: tsParams.maximum_interval,
		enableFuzz: tsParams.enable_fuzz,
	};
}

export function createTsFsrsScheduler(params?: Partial<FSRSParameters>): TsFsrs {
	return createTsFsrs(toTsFsrsParams(params));
}

function safeParseDate(value: string | undefined, fallback: Date): Date {
	if (!value) {
		return fallback;
	}
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Repair plugin FSRSCard data so ts-fsrs scheduler.accepts it.
 * Legacy / partial cards often have Review state with stability=0, which throws.
 */
export function sanitizeFsrsCardForScheduling(card: FSRSCard, now = new Date()): FSRSCard {
	const due = safeParseDate(card.due, now);
	const lastReview = card.lastReview ? safeParseDate(card.lastReview, now) : undefined;
	const reps = Math.max(0, card.reps ?? 0);
	const lapses = Math.max(0, card.lapses ?? 0);

	let state = card.state;
	let stability = typeof card.stability === "number" ? card.stability : 0;
	let difficulty = typeof card.difficulty === "number" ? card.difficulty : 0;

	const isNewCard =
		state === CardState.New || (reps === 0 && !lastReview && stability < S_MIN && difficulty < 1);

	if (isNewCard) {
		return {
			...card,
			due: due.toISOString(),
			stability: 0,
			difficulty: 0,
			elapsedDays: 0,
			scheduledDays: Math.max(0, card.scheduledDays ?? 0),
			reps,
			lapses,
			state: CardState.New,
			lastReview: undefined,
			retrievability: 1,
		};
	}

	if (stability < S_MIN) {
		stability = S_MIN;
	}
	if (difficulty < 1) {
		difficulty = 5;
	} else if (difficulty > 10) {
		difficulty = 10;
	}

	const safeLastReview =
		lastReview && lastReview.getTime() > now.getTime() ? now : lastReview;
	const elapsedDays = safeLastReview
		? Math.max(0, Math.floor((now.getTime() - safeLastReview.getTime()) / 86400000))
		: Math.max(0, card.elapsedDays ?? 0);

	return {
		...card,
		due: due.toISOString(),
		stability,
		difficulty,
		elapsedDays,
		scheduledDays: Math.max(0, card.scheduledDays ?? 0),
		reps,
		lapses,
		state,
		lastReview: safeLastReview?.toISOString(),
		retrievability:
			typeof card.retrievability === "number" && !Number.isNaN(card.retrievability)
				? card.retrievability
				: 1,
	};
}

export function toTsFsrsCard(card: FSRSCard): TsCard {
	const sanitized = sanitizeFsrsCardForScheduling(card);
	return {
		due: new Date(sanitized.due),
		stability: sanitized.stability,
		difficulty: sanitized.difficulty,
		elapsed_days: sanitized.elapsedDays,
		scheduled_days: sanitized.scheduledDays,
		learning_steps: 0,
		reps: sanitized.reps,
		lapses: sanitized.lapses,
		state: sanitized.state as unknown as TsCard["state"],
		last_review: sanitized.lastReview ? new Date(sanitized.lastReview) : undefined,
	};
}

function readTsCardElapsedDays(card: TsCard): number {
	const now = new Date();
	const lastReview =
		card.last_review && card.last_review.getTime() > now.getTime() ? now : card.last_review;
	if (lastReview) {
		return Math.max(0, Math.floor((now.getTime() - lastReview.getTime()) / 86400000));
	}
	const legacyElapsed = (card as { elapsed_days?: number }).elapsed_days;
	return typeof legacyElapsed === "number" && Number.isFinite(legacyElapsed)
		? Math.max(0, legacyElapsed)
		: 0;
}

export function fromTsFsrsCard(card: TsCard, retrievability: number): FSRSCard {
	return {
		due: card.due.toISOString(),
		stability: card.stability,
		difficulty: card.difficulty,
		elapsedDays: readTsCardElapsedDays(card),
		scheduledDays: card.scheduled_days,
		reps: card.reps,
		lapses: card.lapses,
		state: card.state as unknown as CardState,
		lastReview: card.last_review?.toISOString(),
		retrievability,
	};
}

export function fromTsFsrsReviewLog(log: {
	rating: number;
	state: number;
	due: Date;
	stability: number;
	difficulty: number;
	elapsed_days: number;
	last_elapsed_days: number;
	scheduled_days: number;
	review: Date;
}): ReviewLog {
	return {
		rating: log.rating as Rating,
		state: log.state as CardState,
		due: log.due.toISOString(),
		stability: log.stability,
		difficulty: log.difficulty,
		elapsedDays: log.elapsed_days,
		lastElapsedDays: log.last_elapsed_days,
		scheduledDays: log.scheduled_days,
		review: log.review.toISOString(),
	};
}

export function createPluginFsrsCard(
	scheduler: TsFsrs,
	now: Date = new Date()
): FSRSCard {
	const card = createEmptyCard(now);
	const retrievability =
		card.stability > 0
			? scheduler.get_retrievability(card, now, false)
			: 1;
	return fromTsFsrsCard(card, retrievability);
}

export function reviewWithTsFsrs(
	scheduler: TsFsrs,
	card: FSRSCard,
	rating: Rating,
	reviewTime?: string
): { card: FSRSCard; log: ReviewLog } {
	const now = reviewTime ? new Date(reviewTime) : new Date();
	const sanitized = sanitizeFsrsCardForScheduling(card, now);
	const tsCard = toTsFsrsCard(sanitized);
	const { card: nextCard, log } = scheduler.next(tsCard, now, rating as Grade);
	const retrievability = scheduler.get_retrievability(nextCard, now, false);
	return {
		card: fromTsFsrsCard(nextCard, retrievability),
		log: fromTsFsrsReviewLog(log),
	};
}

export function predictRetrievability(
	weights: number[],
	stability: number,
	elapsedDays: number
): number {
	if (elapsedDays <= 0 || stability <= 0) {
		return 1;
	}
	return forgetting_curve(weights, elapsedDays, stability);
}

export function getFsrsLibraryVersion(): string {
	return FSRSVersion;
}

export function sanitizeWeights(weights: number[] | undefined): number[] {
	if (!Array.isArray(weights) || weights.length !== 21) {
		return [...default_w];
	}
	try {
		const validated = generatorParameters({ w: weights, ...PLUGIN_OWNED_SCHEDULING });
		return [...validated.w];
	} catch {
		return [...default_w];
	}
}
