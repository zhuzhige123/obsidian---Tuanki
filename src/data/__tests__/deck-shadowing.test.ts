import { describe, expect, it } from "vitest";
import {
	isDeckMigratedToWDeck,
	isLegacyMemoryDeckCoveredByWDeck,
	shouldRemovePersistedDeckShadowedByWDeck,
} from "../deck-shadowing";
import type { Deck } from "../types";

function deck(partial: Partial<Deck>): Deck {
	return {
		id: "deck-1",
		name: "示例牌组",
		description: "",
		category: "默认",
		path: "示例牌组",
		level: 0,
		order: 0,
		inheritSettings: false,
		created: "2026-01-01T00:00:00.000Z",
		modified: "2026-01-01T00:00:00.000Z",
		settings: {} as Deck["settings"],
		stats: {} as Deck["stats"],
		includeSubdecks: false,
		tags: [],
		metadata: {},
		...partial,
	};
}

describe("deck-shadowing", () => {
	it("treats migrated legacy decks as covered regardless of name", () => {
		const legacy = deck({
			id: "deck_legacy",
			name: "旧名称",
			metadata: {
				wdeckMigration: { status: "migrated", filePath: "weave/memory/deck-files/foo_01.wdeck" },
			},
		});

		expect(
			isLegacyMemoryDeckCoveredByWDeck(legacy, [
				{ logicalDeckId: "foo", logicalDeckName: "新名称" },
			])
		).toBe(true);
	});

	it("matches legacy decks by logical deck id", () => {
		const legacy = deck({ id: "deck-target", name: "目标牌组" });

		expect(
			isLegacyMemoryDeckCoveredByWDeck(legacy, [
				{ logicalDeckId: "deck-target", logicalDeckName: "目标牌组" },
			])
		).toBe(true);
	});

	it("matches legacy decks by display name when logical ids differ", () => {
		const legacy = deck({ id: "deck_m5abc123", name: "默认牌组" });

		expect(
			isLegacyMemoryDeckCoveredByWDeck(legacy, [
				{ logicalDeckId: "默认牌组", logicalDeckName: "默认牌组" },
			])
		).toBe(true);
	});

	it("does not shadow test decks or unrelated legacy decks", () => {
		const testDeck = deck({ id: "deck-test", name: "默认牌组", purpose: "test" });
		const unrelated = deck({ id: "deck-other", name: "其他牌组" });

		const summaries = [{ logicalDeckId: "默认牌组", logicalDeckName: "默认牌组" }];

		expect(isLegacyMemoryDeckCoveredByWDeck(testDeck, summaries)).toBe(false);
		expect(isLegacyMemoryDeckCoveredByWDeck(unrelated, summaries)).toBe(false);
	});

	it("removes persisted decks shadowed by logical id or display name", () => {
		const legacyByName = deck({ id: "deck_m5abc123", name: "默认牌组" });
		const legacyById = deck({ id: "deck-target", name: "Renamed Later" });

		expect(shouldRemovePersistedDeckShadowedByWDeck(legacyByName, "默认牌组", "默认牌组")).toBe(
			true
		);
		expect(shouldRemovePersistedDeckShadowedByWDeck(legacyById, "deck-target", "目标牌组")).toBe(
			true
		);
		expect(shouldRemovePersistedDeckShadowedByWDeck(deck({ purpose: "test" }), "deck-target")).toBe(
			false
		);
	});

	it("detects explicit migrated metadata", () => {
		expect(isDeckMigratedToWDeck({ metadata: {} })).toBe(false);
		expect(
			isDeckMigratedToWDeck({
				metadata: { wdeckMigration: { status: "migrated" } },
			})
		).toBe(true);
	});
});
