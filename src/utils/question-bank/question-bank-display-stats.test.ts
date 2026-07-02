import { describe, expect, it } from "vitest";

import type { MasteryMetrics } from "../../types/question-bank-types";
import {
	computeQuestionBankDisplayStats,
	formatQuestionBankAccuracyScore,
	getQuestionBankAccuracyGroupKey,
	getQuestionCurrentAccuracyPercent,
} from "./question-bank-display-stats";

describe("question-bank-display-stats", () => {
	it("uses EWMA currentAccuracy per question and averages across practiced questions", () => {
		const display = computeQuestionBankDisplayStats([
			{
				stats: {
					testStats: {
						totalAttempts: 3,
						accuracy: 0.5,
						incorrectAttempts: 1,
						isInErrorBook: false,
						masteryMetrics: { currentAccuracy: 90 } as MasteryMetrics,
					},
				},
			},
			{
				stats: {
					testStats: {
						totalAttempts: 2,
						accuracy: 0.5,
						incorrectAttempts: 0,
						isInErrorBook: false,
						masteryMetrics: { currentAccuracy: 70 } as MasteryMetrics,
					},
				},
			},
			{
				stats: {
					testStats: {
						totalAttempts: 0,
						accuracy: 0,
						incorrectAttempts: 0,
						isInErrorBook: false,
					},
				},
			},
		]);

		expect(display.total).toBe(3);
		expect(display.completed).toBe(2);
		expect(display.accuracy).toBe(80);
		expect(display.errorCount).toBe(1);
	});

	it("falls back to simple accuracy when mastery metrics are missing", () => {
		expect(
			getQuestionCurrentAccuracyPercent({
				totalAttempts: 2,
				accuracy: 0.65,
				incorrectAttempts: 1,
			} as any)
		).toBe(65);
	});

	it("maps accuracy into kanban buckets including untested", () => {
		expect(getQuestionBankAccuracyGroupKey({ completed: 0, accuracy: 0 })).toBe("untested");
		expect(getQuestionBankAccuracyGroupKey({ completed: 5, accuracy: 92 })).toBe("excellent");
		expect(getQuestionBankAccuracyGroupKey({ completed: 5, accuracy: 80 })).toBe("good");
		expect(getQuestionBankAccuracyGroupKey({ completed: 5, accuracy: 65 })).toBe("poor");
		expect(getQuestionBankAccuracyGroupKey({ completed: 5, accuracy: 40 })).toBe("poor");
	});

	it("formats accuracy as score with 分 suffix", () => {
		expect(formatQuestionBankAccuracyScore(89.6)).toBe("90分");
	});
});
