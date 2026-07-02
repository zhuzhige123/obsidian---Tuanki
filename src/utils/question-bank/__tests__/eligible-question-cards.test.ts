import type { Deck } from "../../../data/types";
import {
	buildQuestionBankMembershipIndex,
	computeQuestionBankMembershipFlags,
	resolveBatchAddToQuestionBankNoticeParams,
	resolveEligibleQuestionBankAdds,
	sortQuestionBanksForMenu,
} from "../card-management-batch-utils";
import {
	filterQuestionBankEligibleCardUuids,
	isQuestionBankEligibleContent,
} from "../eligible-question-cards";

describe("eligible-question-cards", () => {
	it("accepts choice questions", () => {
		const content = [
			"Which one is correct?",
			"A. wrong",
			"B. correct",
		].join("\n");

		expect(isQuestionBankEligibleContent(content)).toBe(true);
	});

	it("accepts cloze cards tagged with #input", () => {
		const content = [
			"---",
			"tags:",
			"  - input",
			"---",
			"",
			"法国首都是 ==Paris==。",
		].join("\n");

		expect(isQuestionBankEligibleContent(content)).toBe(true);
	});

	it("filters cards by eligibility", () => {
		const cards = [
			{ uuid: "a", content: "Plain Q/A card" },
			{
				uuid: "b",
				content: ["Pick one", "A. one", "B. two"].join("\n"),
			},
		];

		expect(filterQuestionBankEligibleCardUuids(cards)).toEqual(["b"]);
	});
});

describe("card-management-batch-utils", () => {
	it("sorts question banks by order then name", () => {
		const banks = sortQuestionBanksForMenu([
			{ id: "b", name: "Beta", order: 1 } as Deck,
			{ id: "a", name: "Alpha", order: 0 } as Deck,
			{ id: "c", name: "Gamma", deckType: "memory" } as Deck,
		]);

		expect(banks.map((bank) => bank.id)).toEqual(["a", "b"]);
	});

	it("computes membership flags for selected cards", () => {
		expect(
			computeQuestionBankMembershipFlags(["c1", "c2"], new Set(["c1", "c2"]))
		).toEqual({ anyInBank: true, allInBank: true });

		expect(computeQuestionBankMembershipFlags(["c1", "c2"], new Set(["c1"]))).toEqual({
			anyInBank: true,
			allInBank: false,
		});

		expect(computeQuestionBankMembershipFlags(["c1", "c2"], new Set())).toEqual({
			anyInBank: false,
			allInBank: false,
		});
	});

	it("resolves eligible cards that still need to be added", () => {
		expect(
			resolveEligibleQuestionBankAdds(["c1", "c2"], new Set(["c1"]))
		).toEqual(["c2"]);
	});

	it("builds membership index in parallel", async () => {
		const storage = {
			loadBankQuestionRefs: async (bankId: string) =>
				bankId === "bank-a"
					? [{ cardUuid: "c1" }, { cardUuid: "c3" }]
					: [{ cardUuid: "c2" }],
		};

		const membership = await buildQuestionBankMembershipIndex(
			storage as never,
			[
				{ id: "bank-a", name: "A" } as Deck,
				{ id: "bank-b", name: "B" } as Deck,
			],
			["c1", "c2"]
		);

		expect(Array.from(membership.get("bank-a") || [])).toEqual(["c1"]);
		expect(Array.from(membership.get("bank-b") || [])).toEqual(["c2"]);
	});
});

describe("card-management-batch-utils notices", () => {
	it("uses a single success notice when nothing was skipped", () => {
		expect(resolveBatchAddToQuestionBankNoticeParams(3, "生理学")).toEqual({
			key: "addToQuestionBankDone",
			params: { count: 3, name: "生理学" },
			level: "success",
		});
	});

	it("uses a combined notice when unsupported cards were skipped", () => {
		expect(
			resolveBatchAddToQuestionBankNoticeParams(2, "生理学", { skippedCount: 1 })
		).toEqual({
			key: "addToQuestionBankDoneWithSkipped",
			params: { count: 2, name: "生理学", skipped: 1 },
			level: "warning",
		});
	});
});
