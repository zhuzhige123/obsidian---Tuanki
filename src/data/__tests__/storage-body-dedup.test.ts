vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("../../tests/mocks/obsidian")>(
		"../../tests/mocks/obsidian"
	);
	return {
		...actual,
		Notice: class Notice {},
	};
});

const { processNewCardMock } = vi.hoisted(() => ({
	processNewCardMock: vi.fn(async (card: unknown) => ({ converted: false, cards: [card] })),
}));

vi.mock("../../services/progressive-cloze/ProgressiveClozeGateway", () => ({
	getProgressiveClozeGateway: () => ({
		processNewCard: processNewCardMock,
		processContentChange: vi.fn(),
		processBatch: vi.fn(async (cards: unknown[]) => cards),
	}),
}));

import { describe, expect, it, vi } from "vitest";
import { WeaveDataStorage } from "../storage";
import { createWDeckServiceMock } from "./storage-test-helpers";

const CANONICAL_UUID = "11111111-1111-4111-8111-111111111111";
const DUPLICATE_UUID = "22222222-2222-4222-8222-222222222222";

describe("WeaveDataStorage body fingerprint dedup", () => {
	it("merges duplicate-body creates onto the canonical existing card", async () => {
		processNewCardMock.mockReset();
		processNewCardMock.mockImplementation(async (card: unknown) => ({
			converted: false,
			cards: [card],
		}));

		const existingCard = {
			uuid: CANONICAL_UUID,
			deckId: "deck-target",
			type: "basic",
			content: "---\nwe_decks:\n  - 目标牌组\n---\n重复正文",
			tags: [],
			created: "2026-01-01T00:00:00.000Z",
			modified: "2026-01-01T00:00:00.000Z",
			stats: { totalReviews: 5, totalTime: 5, averageTime: 1 },
		};

		const saveCardToDeck = vi.fn(async (_deck: unknown, card: unknown) => card);
		const plugin = {
			settings: {},
			dataSyncService: {
				notifyChange: vi.fn(async () => {}),
			},
			wdeckService: createWDeckServiceMock({
				getAllCards: vi.fn(async () => [existingCard]),
				getCardsByUUIDs: vi.fn(async (uuids: string[]) =>
					uuids.includes(CANONICAL_UUID) ? [existingCard] : []
				),
				saveCardToDeck,
			}),
			app: {
				vault: {
					getMarkdownFiles: () => [],
					getAbstractFileByPath: () => null,
					cachedRead: vi.fn(),
				},
				workspace: {
					trigger: vi.fn(),
				},
			},
		} as any;

		const storage = new WeaveDataStorage(plugin);
		vi.spyOn(storage, "getDecks").mockResolvedValue([
			{ id: "deck-target", name: "目标牌组" } as any,
		]);

		const result = await storage.saveCard({
			uuid: DUPLICATE_UUID,
			deckId: "deck-target",
			type: "basic",
			content: "---\nwe_decks:\n  - 目标牌组\n---\n重复正文",
			tags: [],
			created: "2026-03-15T00:00:00.000Z",
			modified: "2026-03-15T00:00:00.000Z",
			stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
		} as any);

		expect(result.success).toBe(true);
		expect(saveCardToDeck).toHaveBeenCalledTimes(1);
		expect((saveCardToDeck.mock.calls[0][1] as { uuid: string }).uuid).toBe(CANONICAL_UUID);
		expect((result.data as { uuid: string }).uuid).toBe(CANONICAL_UUID);
	});
});
