import { describe, expect, it } from "vitest";
import {
	alignCardRuntimeMembershipFromFormalSource,
	resolveMemoryDeckWriteTarget,
	sanitizeCardWeDecksToKnownDecks,
} from "../card-we-decks-membership";

const decks = [
	{ id: "deck_a", name: "Deck A", purpose: "memory" as const },
	{ id: "deck_b", name: "Deck B", purpose: "memory" as const },
];

describe("resolveMemoryDeckWriteTarget", () => {
	it("prefers we_decks over stale deckId", () => {
		const target = resolveMemoryDeckWriteTarget(
			{
				deckId: "deck_a",
				content: "---\nwe_decks:\n  - Deck B\n---\nbody",
			},
			decks,
			"未归组卡片"
		);

		expect(target.id).toBe("deck_b");
		expect(target.name).toBe("Deck B");
		expect(target.source).toBe("formal");
	});

	it("falls back to deckId when we_decks is missing", () => {
		const target = resolveMemoryDeckWriteTarget(
			{
				deckId: "deck_a",
				content: "---\nwe_type: basic\n---\nbody",
			},
			decks,
			"未归组卡片"
		);

		expect(target.id).toBe("deck_a");
		expect(target.source).toBe("runtime");
	});
});

describe("alignCardRuntimeMembershipFromFormalSource", () => {
	it("syncs deckId and referencedByDecks from we_decks", () => {
		const aligned = alignCardRuntimeMembershipFromFormalSource(
			{
				uuid: "card-1",
				deckId: "deck_a",
				referencedByDecks: ["deck_a"],
				content: "---\nwe_decks:\n  - Deck B\n---\nbody",
			} as any,
			decks
		);

		expect(aligned.deckId).toBe("deck_b");
		expect(aligned.referencedByDecks).toEqual(["deck_b"]);
	});

	it("returns the same card when runtime fields already match we_decks", () => {
		const card = {
			uuid: "card-1",
			deckId: "deck_b",
			referencedByDecks: ["deck_b"],
			content: "---\nwe_decks:\n  - Deck B\n---\nbody",
		} as any;

		expect(alignCardRuntimeMembershipFromFormalSource(card, decks)).toBe(card);
	});
});

describe("sanitizeCardWeDecksToKnownDecks", () => {
	it("clears orphan deck ids from we_decks", () => {
		const sanitized = sanitizeCardWeDecksToKnownDecks(
			{
				uuid: "card-orphan",
				content: "---\nwe_decks:\n  - deck_1777207708022_8jzvizbno\n---\nbody",
			} as any,
			decks
		);

		expect(sanitized.changed).toBe(true);
		expect(sanitized.invalidValues).toEqual(["deck_1777207708022_8jzvizbno"]);
		expect(sanitized.card.content).not.toContain("deck_1777207708022_8jzvizbno");
		expect(sanitized.card.content).not.toContain("we_decks:");
	});
});
