
import { TestSessionManager } from "../TestSessionManager";

function createStorageMock() {
	return {
		saveInProgressSession: vi.fn().mockResolvedValue(undefined),
		appendTestHistoryEntry: vi.fn().mockResolvedValue(undefined),
		clearInProgressSession: vi.fn().mockResolvedValue(undefined),
		saveSessionArchive: vi.fn().mockResolvedValue(undefined),
	} as any;
}

function createInputClozeCard() {
	return {
		uuid: "card-1",
		content: [
			"---",
			"tags:",
			"  - input",
			"---",
			"",
			"法国首都是 ==Paris==，流经市区的是 {{c1::Seine::河流}}。",
		].join("\n"),
		tags: [],
		metadata: {},
		stats: {},
		created: new Date().toISOString(),
		modified: new Date().toISOString(),
	} as any;
}

describe("TestSessionManager", () => {
	it("extracts correct answers from input cloze questions", () => {
		const manager = new TestSessionManager(createStorageMock());

		expect(manager.extractCorrectAnswer(createInputClozeCard())).toEqual(["Paris", "Seine"]);
	});

	it("judges input cloze answers with normalized ordered comparison", async () => {
		const manager = new TestSessionManager(createStorageMock());
		const card = createInputClozeCard();

		await manager.startSession({ bankId: "bank-1", mode: "exam" }, [card]);
		const result = await manager.submitAnswer({
			questionId: card.uuid,
			answer: [" paris ", "ＳＥＩＮＥ"],
			timeSpent: 12,
		});

		expect(result.isCorrect).toBe(true);
		expect(result.correctAnswer).toEqual(["Paris", "Seine"]);
	});

	it("marks ordered input cloze answers wrong when blank order does not match", async () => {
		const manager = new TestSessionManager(createStorageMock());
		const card = createInputClozeCard();

		await manager.startSession({ bankId: "bank-1", mode: "exam" }, [card]);
		const result = await manager.submitAnswer({
			questionId: card.uuid,
			answer: ["Seine", "Paris"],
			timeSpent: 12,
		});

		expect(result.isCorrect).toBe(false);
	});

	it("undoes the current answer and recalculates score consistently", async () => {
		const manager = new TestSessionManager(createStorageMock());
		const cards = [
			createInputClozeCard(),
			{
				...createInputClozeCard(),
				uuid: "card-2",
				content: "Q?\nA. one\nB. two\nAnswer: A",
			},
		];

		await manager.startSession({ bankId: "bank-1", mode: "exam" }, cards);
		await manager.submitAnswer({
			questionId: cards[0].uuid,
			answer: ["Paris", "Seine"],
			timeSpent: 8,
		});

		const sessionBeforeUndo = manager.getCurrentSession();
		expect(sessionBeforeUndo?.correctCount).toBe(1);
		expect(sessionBeforeUndo?.score).toBe(50);

		const undone = await manager.undoCurrentAnswer();
		expect(undone).toBe(true);

		const sessionAfterUndo = manager.getCurrentSession();
		expect(sessionAfterUndo?.correctCount).toBe(0);
		expect(sessionAfterUndo?.completedQuestions).toBe(0);
		expect(sessionAfterUndo?.score).toBe(0);
		expect(sessionAfterUndo?.questions[0].isCorrect).toBeNull();
	});

	it("updates stats when removing an answered question", async () => {
		const manager = new TestSessionManager(createStorageMock());
		const cards = [
			createInputClozeCard(),
			{
				...createInputClozeCard(),
				uuid: "card-2",
				content: "Q?\nA. one\nB. two\nAnswer: A",
			},
		];

		await manager.startSession({ bankId: "bank-1", mode: "exam" }, cards);
		await manager.submitAnswer({
			questionId: cards[0].uuid,
			answer: ["Paris", "Seine"],
			timeSpent: 8,
		});

		const removalResult = await manager.removeQuestionFromSession(cards[0].uuid);
		expect(removalResult).toBe("removed");

		const session = manager.getCurrentSession();
		expect(session?.totalQuestions).toBe(1);
		expect(session?.correctCount).toBe(0);
		expect(session?.completedQuestions).toBe(0);
		expect(session?.score).toBe(0);
	});
});
