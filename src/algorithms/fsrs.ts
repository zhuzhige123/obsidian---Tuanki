/**
 * FSRS scheduling via official ts-fsrs (FSRS-6).
 * Learning/relearning minute steps are applied afterward by applyLearningStepScheduling.
 */

import type { FSRSCard, FSRSParameters, ReviewLog } from "../data/types";
import { CardState, Rating } from "../data/types";
export type { FSRSData } from "../types/card-types";
import type { FSRS6PerformanceMetrics, FSRS6VersionInfo } from "../types/fsrs6-types";
import { FSRS6_DEFAULTS } from "../types/fsrs6-types";
import {
	createPluginFsrsCard,
	createTsFsrsScheduler,
	getFsrsLibraryVersion,
	predictRetrievability,
	reviewWithTsFsrs,
	sanitizeWeights,
	toPluginFsrsParameters,
	toTsFsrsParams,
} from "./fsrs-adapter";
import type { FSRS as TsFsrs } from "ts-fsrs";

export class FSRS {
	private scheduler: TsFsrs;
	private params: FSRSParameters;
	private weights: number[];

	constructor(params?: Partial<FSRSParameters>) {
		this.weights = sanitizeWeights(params?.w);
		this.params = {
			w: this.weights,
			requestRetention: params?.requestRetention ?? FSRS6_DEFAULTS.REQUEST_RETENTION,
			maximumInterval: params?.maximumInterval ?? FSRS6_DEFAULTS.MAXIMUM_INTERVAL,
			enableFuzz: params?.enableFuzz ?? FSRS6_DEFAULTS.ENABLE_FUZZ,
		};
		this.scheduler = createTsFsrsScheduler(this.params);
	}

	createCard(): FSRSCard {
		return createPluginFsrsCard(this.scheduler);
	}

	review(
		card: FSRSCard,
		rating: Rating,
		reviewTime?: string
	): { card: FSRSCard; log: ReviewLog } {
		return reviewWithTsFsrs(this.scheduler, card, rating, reviewTime);
	}

	getParameters(): FSRSParameters {
		return {
			...this.params,
			w: [...this.weights],
		};
	}

	updateParameters(newParams: Partial<FSRSParameters>): void {
		if (newParams.w) {
			this.weights = sanitizeWeights(newParams.w);
		}
		this.params = {
			...this.params,
			...newParams,
			w: this.weights,
		};
		this.scheduler.parameters = toTsFsrsParams(this.params);
		this.weights = [...this.scheduler.parameters.w];
		this.params = toPluginFsrsParameters(this.scheduler.parameters);
	}

	getVersionInfo(): FSRS6VersionInfo {
		return {
			version: "6.1.1",
			algorithmName: "FSRS",
			parameterCount: 21,
			implementationDate: new Date().toISOString(),
			compatibilityLevel: "standard",
			libraryVersion: getFsrsLibraryVersion(),
		};
	}

	getPerformanceMetrics(): FSRS6PerformanceMetrics {
		return {
			algorithmVersion: "6.1.1",
			executionTime: 0,
			memoryUsage: 0,
			predictionAccuracy: 0,
			parameterStability: 1,
			convergenceRate: 0,
			cacheHitRate: 0,
		};
	}

	predictMemoryState(card: FSRSCard, futureDays: number): number {
		const elapsed = Math.max(0, card.elapsedDays + futureDays);
		return predictRetrievability(this.weights, card.stability, elapsed);
	}

	calculateProgress(card: FSRSCard): number {
		if (card.state === CardState.New) return 0;
		if (card.state === CardState.Review && card.stability > 100) return 1;

		const stabilityProgress = Math.min(card.stability / 100, 1);
		const repsProgress = Math.min(card.reps / 10, 1);
		return (stabilityProgress + repsProgress) / 2;
	}

	getRecommendedStudyTime(totalCards: number, targetCards: number): number {
		const avgTimePerCard = 30;
		const effectiveCards = Math.min(totalCards, targetCards);
		return Math.ceil((effectiveCards * avgTimePerCard) / 60);
	}

	/** Expose ts-fsrs scheduler for previews / golden tests. */
	getScheduler(): TsFsrs {
		return this.scheduler;
	}
}
