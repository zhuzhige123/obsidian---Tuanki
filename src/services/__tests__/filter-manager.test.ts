import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Card } from "../../data/types";
import type { FilterConfig } from "../../types/filter-types";

const storageState = new Map<string, string>();

vi.mock("../../utils/vault-local-storage", () => ({
	vaultStorage: {
		getItem: vi.fn((key: string) => storageState.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			storageState.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			storageState.delete(key);
		}),
	},
}));

import { FilterManager } from "../filter-manager";

function createCard(overrides: Partial<Card>): Card {
	return {
		uuid: overrides.uuid || `card-${Math.random().toString(36).slice(2, 8)}`,
		content: overrides.content || "",
		type: overrides.type || ("basic" as any),
		tags: overrides.tags || [],
		created: overrides.created || new Date().toISOString(),
		modified: overrides.modified || new Date().toISOString(),
		reviewHistory: overrides.reviewHistory || [],
		stats: overrides.stats || {
			totalReviews: 0,
			totalTime: 0,
			averageTime: 0,
			memoryRate: 0,
		},
		...overrides,
	};
}

describe("FilterManager deck resolution", () => {
	beforeEach(() => {
		storageState.clear();
	});

	it("does not treat referencedByDecks-only legacy membership as a deck match", () => {
		const manager = new FilterManager(() => [{ id: "deck-real", name: "真实牌组" }]);
		const config: FilterConfig = {
			globalLogic: "AND",
			groups: [
				{
					id: "group-1",
					logic: "AND",
					conditions: [
						{
							id: "condition-1",
							field: "deck",
							operator: "equals",
							value: "deck-real",
							enabled: true,
						},
					],
				},
			],
		};

		const legacyReferencedCard = createCard({
			uuid: "legacy-ref-card",
			referencedByDecks: ["deck-real"],
		});
		const yamlBackedCard = createCard({
			uuid: "yaml-card",
			content: "---\nwe_decks:\n  - 真实牌组\n---\nyaml card",
		});
		const runtimeBackedCard = createCard({
			uuid: "runtime-card",
			deckId: "deck-real",
		});

		const matched = manager.applyFilter(
			[legacyReferencedCard, yamlBackedCard, runtimeBackedCard],
			config
		);

		expect(matched.map((card) => card.uuid)).toEqual(["yaml-card", "runtime-card"]);
	});
});
