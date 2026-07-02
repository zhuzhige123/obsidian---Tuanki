import type { Card, Deck } from "../../../data/types";
import {
	getMemoryFormalDeckDisplayNames,
	getQuestionBankDeckDisplayNames,
	mergeQuestionBankCardIntoMap,
	resolveQuestionBankDeckIdsForManagement,
} from "../card-management-deck-display";

describe("card-management-deck-display", () => {
	const memoryDecks: Deck[] = [{ id: "deck-a", name: "如何学习" } as Deck];

	const questionBankDecks: Deck[] = [
		{ id: "bank-a", name: "考试题组" } as Deck,
		{ id: "bank-b", name: "生理学" } as Deck,
	];

	it("reads memory formal deck names from we_decks even when lookup decks are question banks", () => {
		const card = {
			content: "---\nwe_decks:\n  - 如何学习\n---\nQ",
			cardPurpose: "test",
			deckId: "bank-a",
		} as Card;

		expect(getMemoryFormalDeckDisplayNames(card, memoryDecks)).toEqual(["如何学习"]);
	});

	it("resolves question bank deck names from deckId for test cards", () => {
		const card = {
			uuid: "card-1",
			deckId: "bank-b",
			cardPurpose: "test",
			content: "---\nwe_decks:\n  - 如何学习\n---\nQ",
		} as Card;

		expect(getQuestionBankDeckDisplayNames(card, questionBankDecks)).toEqual(["生理学"]);
		expect(resolveQuestionBankDeckIdsForManagement(card, questionBankDecks)).toEqual(["bank-b"]);
	});

	it("merges duplicate question bank cards into one entry with multiple bank ids", () => {
		const map = new Map<string, Card>();
		const card = {
			uuid: "card-1",
			deckId: "bank-a",
			cardPurpose: "test",
			content: "---\nwe_decks:\n  - 如何学习\n---\nQ",
		} as Card;

		mergeQuestionBankCardIntoMap(map, card, "bank-a");
		mergeQuestionBankCardIntoMap(map, { ...card, deckId: "bank-b" }, "bank-b");

		expect(map.get("card-1")?.metadata?.questionBankDeckIds).toEqual(["bank-a", "bank-b"]);
	});
});
