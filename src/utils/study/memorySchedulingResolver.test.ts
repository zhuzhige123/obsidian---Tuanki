import type { Card, Deck } from "../../data/types";
import {
	resolveMemorySchedulingForCard,
	resolvePrimaryStudyDeckIdFromCard,
} from "./memorySchedulingResolver";

function createDeck(id: string, name: string, overrides: Record<string, unknown> = {}): Deck {
	return {
		id,
		name,
		...overrides,
	} as Deck;
}

function createCard(overrides: Partial<Card>): Card {
	return {
		uuid: "card-1",
		deckId: "fallback-deck",
		content: "front\n---div---\nback",
		...overrides,
	} as Card;
}

describe("resolveMemorySchedulingForCard", () => {
	it("resolves the primary study deck from a YAML deck name", () => {
		const decks = [
			createDeck("fallback-deck", "旧牌组"),
			createDeck("resolved-deck", "目标牌组"),
		];
		const card = createCard({
			deckId: "fallback-deck",
			content: "---\nwe_decks:\n  - 目标牌组\n---\n问题\n---div---\n答案",
		});

		expect(resolvePrimaryStudyDeckIdFromCard(card, decks)).toBe("resolved-deck");
	});

	it("resolves the primary study deck when YAML stores the deck id directly", () => {
		const decks = [createDeck("resolved-deck", "目标牌组")];
		const card = createCard({
			deckId: "fallback-deck",
			content: "---\nwe_decks:\n  - resolved-deck\n---\n问题\n---div---\n答案",
		});

		expect(resolvePrimaryStudyDeckIdFromCard(card, decks)).toBe("resolved-deck");
	});

	it("falls back to card.deckId when YAML decks cannot be matched", () => {
		const card = createCard({
			deckId: "fallback-deck",
			content: "---\nwe_decks:\n  - 不存在的牌组\n---\n问题\n---div---\n答案",
		});

		expect(resolvePrimaryStudyDeckIdFromCard(card, [])).toBe("fallback-deck");
	});

	it("prefers we_decks primary deck settings over the raw card.deckId", () => {
		const decks = [
			createDeck("fallback-deck", "旧牌组"),
			createDeck("resolved-deck", "目标牌组"),
		];
		const deckSettingsMap = new Map<string, unknown>([
			["fallback-deck", { learningSteps: [999], relearningSteps: [999] }],
			["resolved-deck", { learningSteps: [1, 15], relearningSteps: [20] }],
		]);
		const card = createCard({
			deckId: "fallback-deck",
			content: "---\nwe_decks:\n  - 目标牌组\n---\n问题\n---div---\n答案",
		});

		const resolved = resolveMemorySchedulingForCard({
			card,
			decks,
			deckSettingsMap,
			globalSettings: { learningSteps: [3, 30], relearningSteps: [40] },
		});

		expect(resolved.learningSteps).toEqual([1, 15]);
		expect(resolved.relearningSteps).toEqual([20]);
	});

	it("falls back to global settings when the resolved deck has no overrides", () => {
		const decks = [createDeck("fallback-deck", "旧牌组")];
		const deckSettingsMap = new Map<string, unknown>();
		const card = createCard({ deckId: "fallback-deck" });

		const resolved = resolveMemorySchedulingForCard({
			card,
			decks,
			deckSettingsMap,
			globalSettings: { learningSteps: [5, 25], relearningSteps: [35] },
		});

		expect(resolved.learningSteps).toEqual([5, 25]);
		expect(resolved.relearningSteps).toEqual([35]);
	});
});
