import { TestScoringEngine } from "../TestScoringEngine";
import type { TestSession } from "../../../types/question-bank-types";

function createSession(
	overrides: Partial<TestSession> & Pick<TestSession, "bankId" | "questions">
): TestSession {
	return {
		id: "session-1",
		bankName: "测试",
		mode: "exam",
		startTime: new Date().toISOString(),
		duration: 0,
		totalQuestions: overrides.questions.length,
		completedQuestions: 0,
		correctCount: 0,
		incorrectCount: 0,
		wrongCount: 0,
		score: 0,
		accuracy: 0,
		skippedCount: 0,
		status: "completed",
		currentQuestionIndex: 0,
		...overrides,
	};
}

function createQuestionRecord(isCorrect: boolean | null) {
	return {
		questionId: "q-1",
		question: {} as TestSession["questions"][number]["question"],
		userAnswer: null,
		correctAnswer: "A",
		isCorrect,
		timeSpent: 0,
		submittedAt: isCorrect === null ? null : new Date().toISOString(),
	};
}

describe("TestScoringEngine.scoreSession", () => {
	it("uses total question count for regular question bank exams", () => {
		const questions = [
			createQuestionRecord(true),
			...Array.from({ length: 21 }, () => createQuestionRecord(null)),
		];

		const result = TestScoringEngine.scoreSession(
			createSession({
				bankId: "bank-regular",
				questions,
			})
		);

		expect(result.correctCount).toBe(1);
		expect(result.accuracy).toBe(100);
		expect(result.totalScore).toBeCloseTo(4.545, 2);
		expect(result.grade).toBe("F");
	});

	it("scores staging sessions by answered questions only when some are skipped", () => {
		const questions = [
			createQuestionRecord(true),
			...Array.from({ length: 21 }, () => createQuestionRecord(null)),
		];

		const result = TestScoringEngine.scoreSession(
			createSession({
				bankId: "staging-docquiz-session-1",
				questions,
			})
		);

		expect(result.correctCount).toBe(1);
		expect(result.accuracy).toBe(100);
		expect(result.totalScore).toBe(100);
		expect(result.grade).toBe("A+");
		expect(result.skippedCount).toBe(21);
	});

	it("keeps strict total scoring for staging when every question was answered", () => {
		const questions = [
			createQuestionRecord(true),
			createQuestionRecord(false),
		];

		const result = TestScoringEngine.scoreSession(
			createSession({
				bankId: "staging-docquiz-session-2",
				questions,
			})
		);

		expect(result.totalScore).toBe(50);
		expect(result.accuracy).toBe(50);
		expect(result.grade).toBe("F");
	});
});
