
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
});
