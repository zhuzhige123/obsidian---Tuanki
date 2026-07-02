import type { Card } from "../../../data/types";
import type { QuestionBankModeConfig } from "../../../types/question-bank-types";
import {
	applyQuestionBankSessionFilters,
	resolveSessionQuestionCount,
	shouldShuffleSessionQuestions,
} from "../apply-question-bank-session-filters";

function createChoiceCard(uuid: string, content: string): Card {
	return {
		uuid,
		content,
		tags: [],
		metadata: {},
		stats: {},
		created: new Date().toISOString(),
		modified: new Date().toISOString(),
	} as unknown as Card;
}

describe("applyQuestionBankSessionFilters", () => {
	it("limits question count from customQuestionCount.exam", async () => {
		const cards = Array.from({ length: 10 }, (_, index) =>
			createChoiceCard(`card-${index}`, `Q?\nA. one\nB. two\nAnswer: A`)
		);

		const config: QuestionBankModeConfig = {
			customQuestionCount: { exam: 3 },
		};

		const filtered = await applyQuestionBankSessionFilters(cards, config, "exam");
		expect(filtered.length).toBe(3);
	});

	it("resolves session question count from customQuestionCount", () => {
		expect(
			resolveSessionQuestionCount({ customQuestionCount: { exam: 20 } }, "exam", 100)
		).toBe(20);
		expect(shouldShuffleSessionQuestions({ options: { shuffleQuestions: true } })).toBe(true);
	});
});
