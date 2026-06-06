import { describe, expect, it } from "vitest";
import {
	isMemoryDeckForStaging,
	pickPreferredStagingQuestionBankId,
} from "./card-staging-target-resolver";

describe("card-staging-target-resolver", () => {
	it("treats memory decks as staging targets", () => {
		expect(
			isMemoryDeckForStaging({ purpose: "memory", deckType: "normal" } as never)
		).toBe(true);
		expect(
			isMemoryDeckForStaging({ purpose: "test", deckType: "normal" } as never)
		).toBe(false);
		expect(
			isMemoryDeckForStaging({ purpose: "memory", deckType: "question-bank" } as never)
		).toBe(false);
	});

	it("prefers configured question bank when available", () => {
		const options = [
			{ id: "bank-a", name: "A" },
			{ id: "bank-b", name: "B" },
		];

		expect(pickPreferredStagingQuestionBankId(options, "bank-b")).toBe("bank-b");
		expect(pickPreferredStagingQuestionBankId(options, "missing")).toBe("bank-a");
		expect(pickPreferredStagingQuestionBankId([], "bank-a")).toBe("");
	});
});
