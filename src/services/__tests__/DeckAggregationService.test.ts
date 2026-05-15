import { describe, expect, it, vi } from "vitest";
import { DeckAggregationService } from "../deck/DeckAggregationService";
import {
	createDeckTagColumnKey,
	DECK_TAG_EMPTY_GROUP_KEY,
	DECK_TAG_GROUP_OTHER_KEY,
	normalizeDeckTagGroup,
	normalizeDeckTagGroupTags,
} from "../../types/deck-kanban-types";

describe("DeckAggregationService tag grouping", () => {
	it("normalizes tag group tags before persistence and grouping", () => {
		expect(normalizeDeckTagGroupTags(["  anatomy ", "anatomy", "", "physiology"])).toEqual([
			"anatomy",
			"physiology",
		]);

		expect(
			normalizeDeckTagGroup({
				id: "group-1",
				name: "  Human Body  ",
				tags: ["  anatomy ", "anatomy", "physiology"],
			})
		).toEqual({
			id: "group-1",
			name: "Human Body",
			tags: ["anatomy", "physiology"],
		});
	});

	it("uses internal keys so duplicate tags and reserved labels cannot crash keyed lists", async () => {
		const service = new DeckAggregationService(
			{
				getCards: vi.fn().mockResolvedValue([]),
				getCardsByUUIDs: vi.fn(async (uuids: string[]) =>
					uuids.map((uuid) => ({
						uuid,
						content: uuid === "card-1" ? "---\ntags:\n  - anatomy\n---\n正文" : "正文",
						tags: [],
					}))
				),
			} as any
		);

		expect(await service.analyzeTag({ id: "deck-tag", cardUUIDs: ["card-1"], tags: [] } as any)).toBe(
			createDeckTagColumnKey("anatomy")
		);
		expect(await service.analyzeTag({ id: "deck-empty", cardUUIDs: ["card-2"], tags: [] } as any)).toBe(
			DECK_TAG_EMPTY_GROUP_KEY
		);

		const grouped = await service.groupDecks(
			[
				{ id: "deck-1", cardUUIDs: ["card-1"], tags: [] },
				{ id: "deck-2", cardUUIDs: ["card-2"], tags: [] },
			] as any,
			"tagGroup",
			{
				id: "group-1",
				name: "Human Body",
				tags: [" anatomy ", "anatomy", "__other__"],
			}
		);

		expect(Object.keys(grouped).sort()).toEqual(
			[createDeckTagColumnKey("anatomy"), DECK_TAG_GROUP_OTHER_KEY].sort()
		);
		expect(grouped[createDeckTagColumnKey("anatomy")]).toHaveLength(1);
		expect(grouped[DECK_TAG_GROUP_OTHER_KEY]).toHaveLength(1);
	});

	it("uses card content tags instead of deck.tags when grouping by tag", async () => {
		const getCards = vi.fn(async (query?: { deckId?: string }) => {
			if (query?.deckId === "deck-content-tag") {
				return [
					{
						uuid: "content-card-1",
						content: "---\ntags:\n  - physiology\n---\n内容",
						tags: ["legacy-should-not-win"],
					},
				] as any[];
			}
			return [];
		});
		const service = new DeckAggregationService({ getCards } as any);

		const grouped = await service.groupDecks(
			[
				{
					id: "deck-content-tag",
					tags: ["deck-tag-only"],
					metadata: {},
				},
			] as any,
			"tag"
		);

		expect(Object.keys(grouped)).toEqual([createDeckTagColumnKey("physiology")]);
		expect(getCards).toHaveBeenCalledWith({ deckId: "deck-content-tag" });
	});

	it("loads cards by deckId for time range and priority analysis instead of scanning all cards", async () => {
		const getCards = vi.fn(async (query?: { deckId?: string }) => {
			if (query?.deckId === "deck-a") {
				return [
					{ uuid: "card-a1", fsrs: { due: new Date(Date.now() + 3600_000).toISOString() }, priority: 4 },
				] as any[];
			}
			return [];
		});
		const service = new DeckAggregationService({ getCards } as any);

		const deck = { id: "deck-a", metadata: {} } as any;
		const timeRange = await service.analyzeTimeRange(deck);
		const priority = await service.analyzePriority(deck);

		expect(timeRange).toBe("today");
		expect(priority).toBe("high");
		expect(getCards).toHaveBeenCalledTimes(1);
		expect(getCards).toHaveBeenCalledWith({ deckId: "deck-a" });
	});
});
