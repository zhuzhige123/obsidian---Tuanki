import {
	buildDocumentQuizStatsPillDisplay,
	mergeInlineAndStoredStats,
} from "../document-quiz-stats-pill-display";
import type { QuestionTestStats } from "../../../types/question-bank-types";

describe("document-quiz-stats-pill-display", () => {
	it("merges stored stats when storage has more attempts", () => {
		const inline = {
			blockId: "we-q-a",
			attempts: 1,
			correct: 0,
			accuracy: 0,
			lastMode: "exam" as const,
		};
		const stored: QuestionTestStats = {
			totalAttempts: 3,
			correctAttempts: 2,
			incorrectAttempts: 1,
			accuracy: 2 / 3,
			bestScore: 100,
			averageScore: 67,
			lastScore: 100,
			averageResponseTime: 0,
			fastestTime: 0,
			lastTestDate: "2026-07-05T00:00:00.000Z",
			isInErrorBook: false,
			consecutiveCorrect: 1,
		};

		const merged = mergeInlineAndStoredStats(inline, stored);
		expect(merged?.attempts).toBe(3);
		expect(merged?.correct).toBe(2);
		expect(merged?.lastMode).toBe("exam");
	});

	it("builds pill segments for weak mastery", () => {
		const display = buildDocumentQuizStatsPillDisplay({
			blockId: "we-q-existing",
			stats: {
				blockId: "we-q-existing",
				attempts: 1,
				correct: 0,
				accuracy: 0,
				lastAt: new Date().toISOString(),
				lastMode: "exam",
			},
		});

		expect(display.mastery).toBe("weak");
		expect(display.segments.length).toBeGreaterThanOrEqual(4);
		expect(display.segments.some((part) => part.includes("0"))).toBe(true);
		expect(display.ariaLabel.length).toBeGreaterThan(0);
	});
});
