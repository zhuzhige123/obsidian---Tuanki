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
import { getCardBodyFingerprint } from "../../utils/card-content-fingerprint";

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

	it("does not scan all WDeck cards when batch-saving existing UUIDs", async () => {
		const existingCard = {
			uuid: CANONICAL_UUID,
			deckId: "wdeck:deck-target",
			content: "existing",
			tags: [],
			created: "2026-01-01T00:00:00.000Z",
			modified: "2026-01-01T00:00:00.000Z",
			stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
		};

		const plugin = {
			settings: {},
			dataSyncService: {
				notifyChange: vi.fn(async () => {}),
			},
			wdeckService: createWDeckServiceMock({
				getCardsByUUIDs: vi.fn(async () => [existingCard]),
				getAllCards: vi.fn(async () => {
					throw new Error("should not scan all WDeck cards");
				}),
				saveCardsToDeck: vi.fn(async (_deck: unknown, cards: unknown[]) => cards),
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
		vi.spyOn(storage, "getDeck").mockResolvedValue(undefined as any);

		await storage.saveCardsBatch([
			{
				...existingCard,
				content: "updated body",
				modified: "2026-03-15T00:00:00.000Z",
			} as any,
		]);

		expect(plugin.wdeckService.getCardsByUUIDs).toHaveBeenCalledWith([CANONICAL_UUID]);
		expect(plugin.wdeckService.getAllCards).not.toHaveBeenCalled();
	});

	it("still scans all WDeck cards when batch-saving new cards with duplicate bodies", async () => {
		const existingCard = {
			uuid: CANONICAL_UUID,
			deckId: "deck-target",
			type: "basic",
			content: "---\nwe_decks:\n  - 目标牌组\n---\n重复正文",
			tags: [],
			created: "2026-01-01T00:00:00.000Z",
			modified: "2026-01-01T00:00:00.000Z",
			stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
		};

		const getAllCards = vi.fn(async () => [existingCard]);
		const plugin = {
			settings: {},
			dataSyncService: {
				notifyChange: vi.fn(async () => {}),
			},
			wdeckService: createWDeckServiceMock({
				getAllCards,
				getCardsByUUIDs: vi.fn(async () => []),
				saveCardsToDeck: vi.fn(async (_deck: unknown, card: unknown) => card),
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

		await storage.saveCardsBatch([
			{
				uuid: DUPLICATE_UUID,
				deckId: "deck-target",
				type: "basic",
				content: "---\nwe_decks:\n  - 目标牌组\n---\n重复正文",
				tags: [],
				created: "2026-03-15T00:00:00.000Z",
				modified: "2026-03-15T00:00:00.000Z",
				stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
			} as any,
		]);

		expect(getAllCards).toHaveBeenCalledTimes(1);
	});

	it("uses persisted body fingerprint index without scanning all cards for new duplicate bodies", async () => {
		const existingCard = {
			uuid: CANONICAL_UUID,
			deckId: "deck-target",
			type: "basic",
			content: "---\nwe_decks:\n  - 目标牌组\n---\n重复正文",
			tags: [],
			created: "2026-01-01T00:00:00.000Z",
			modified: "2026-01-01T00:00:00.000Z",
			stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
		};
		const fingerprint = getCardBodyFingerprint(existingCard as any);

		const getAllCards = vi.fn(async () => {
			throw new Error("should not scan all WDeck cards");
		});
		const plugin = {
			settings: {},
			dataSyncService: {
				notifyChange: vi.fn(async () => {}),
			},
			bodyFingerprintIndexService: {
				needsRebuild: vi.fn(async () => false),
				getIndexMap: vi.fn(async () => new Map([[fingerprint, CANONICAL_UUID]])),
				upsertCards: vi.fn(async () => {}),
			},
			wdeckService: createWDeckServiceMock({
				getAllCards,
				getCardsByUUIDs: vi.fn(async () => []),
				saveCardsToDeck: vi.fn(async (_deck: unknown, card: unknown) => card),
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

		await storage.saveCardsBatch([
			{
				uuid: DUPLICATE_UUID,
				deckId: "deck-target",
				type: "basic",
				content: "---\nwe_decks:\n  - 目标牌组\n---\n重复正文",
				tags: [],
				created: "2026-03-15T00:00:00.000Z",
				modified: "2026-03-15T00:00:00.000Z",
				stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
			} as any,
		]);

		expect(plugin.bodyFingerprintIndexService.getIndexMap).toHaveBeenCalled();
		expect(getAllCards).not.toHaveBeenCalled();
	});

	it("uses targeted UUID lookup instead of scanning all cards when updating an existing card", async () => {
		processNewCardMock.mockReset();
		processNewCardMock.mockImplementation(async (card: unknown) => ({
			converted: false,
			cards: [card],
		}));

		const existingCard = {
			uuid: CANONICAL_UUID,
			deckId: "wdeck:deck-target",
			type: "basic",
			content: "---\nwe_decks:\n  - 目标牌组\n---\n旧正文",
			tags: [],
			created: "2026-01-01T00:00:00.000Z",
			modified: "2026-01-01T00:00:00.000Z",
			stats: { totalReviews: 1, totalTime: 1, averageTime: 1 },
		};

		const getAllCards = vi.fn(async () => {
			throw new Error("should not scan all WDeck cards");
		});
		const saveCardToDeck = vi.fn(async (_deck: unknown, card: unknown) => card);

		const plugin = {
			settings: {},
			dataSyncService: {
				notifyChange: vi.fn(async () => {}),
			},
			wdeckService: createWDeckServiceMock({
				getCardsByUUIDs: vi.fn(async () => [existingCard]),
				getAllCards,
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
			...existingCard,
			content: "---\nwe_decks:\n  - 目标牌组\n---\n新正文",
			modified: "2026-03-15T00:00:00.000Z",
		} as any);

		expect(result.success).toBe(true);
		expect(plugin.wdeckService.getCardsByUUIDs).toHaveBeenCalledWith([CANONICAL_UUID]);
		expect(getAllCards).not.toHaveBeenCalled();
	});
});
