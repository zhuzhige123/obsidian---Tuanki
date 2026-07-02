import type { Card } from "../../data/types";
import {
	cardBelongsToTutorialDeck,
	cardMatchesTutorialSignature,
	collectTutorialDeckResidueCards,
	isTutorialDeckResidueCard,
} from "../tutorial-deck-catalog";

function makeCard(partial: Partial<Card> & { uuid: string }): Card {
	return {
		content: "",
		modified: "2026-06-15T00:00:00.000Z",
		...partial,
	} as Card;
}

describe("tutorial-deck-catalog", () => {
	it("detects cards attributed to the legacy Weave Guide deck", () => {
		const card = makeCard({
			uuid: "tutorial-deck-1",
			content: "---\nwe_decks:\n  - Weave 指南\n---\n普通正文",
		});

		expect(cardBelongsToTutorialDeck(card)).toBe(true);
		expect(isTutorialDeckResidueCard(card)).toBe(true);
	});

	it("detects tutorial cards by body signature even when ungrouped", () => {
		const card = makeCard({
			uuid: "tutorial-signature-1",
			content: "---\nwe_decks:\n  - 未归组卡片\n---\n插件支持哪两种挖空标记？",
		});

		expect(cardMatchesTutorialSignature(card)).toBe(true);
		expect(isTutorialDeckResidueCard(card)).toBe(true);
	});

	it("ignores normal user cards", () => {
		const card = makeCard({
			uuid: "normal-card-1",
			content: "---\nwe_decks:\n  - 我的牌组\n---\n这是我自己写的卡片",
		});

		expect(isTutorialDeckResidueCard(card)).toBe(false);
	});

	it("does not treat signature-only cards in user decks as tutorial residue", () => {
		const card = makeCard({
			uuid: "user-signature-false-positive",
			content: "---\nwe_decks:\n  - 我的牌组\n---\n插件支持哪两种挖空标记？",
		});

		expect(cardMatchesTutorialSignature(card)).toBe(true);
		expect(isTutorialDeckResidueCard(card)).toBe(false);
	});

	it("collects only tutorial residue cards", () => {
		const cards = [
			makeCard({
				uuid: "tutorial-1",
				content: "---\nwe_decks:\n  - 未归组卡片\n---\n如何编写渐进式挖空卡片？",
			}),
			makeCard({
				uuid: "normal-1",
				content: "---\nwe_decks:\n  - 我的牌组\n---\n自定义内容",
			}),
		];

		expect(collectTutorialDeckResidueCards(cards).map((card) => card.uuid)).toEqual([
			"tutorial-1",
		]);
	});
});
