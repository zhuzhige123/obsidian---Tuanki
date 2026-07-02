import { vi } from "vitest";

export function createWDeckServiceMock(overrides: Record<string, unknown> = {}) {
	const getCardsByUUIDs =
		typeof overrides.getCardsByUUIDs === "function"
			? (overrides.getCardsByUUIDs as (uuids: string[]) => Promise<unknown[]>)
			: vi.fn(async (_uuids: string[]) => []);

	const base = {
		getAllDeckSummaries: vi.fn(async () => []),
		getAllDeckAggregates: vi.fn(async () => []),
		getDeckAggregateByAnyDeckId: vi.fn(async () => null),
		getDeckInfoByDeckId: vi.fn(async () => null),
		getDeckInfoByAnyDeckId: vi.fn(async () => null),
		getAllCards: vi.fn(async () => []),
		getCardsByUUIDs,
		getCardByUUID: vi.fn(async (uuid: string) => {
			const cards = await getCardsByUUIDs([uuid]);
			return cards[0] ?? null;
		}),
		saveCard: vi.fn(async (card: unknown) => card),
		saveCardsBatch: vi.fn(async () => undefined),
		saveCardToDeck: vi.fn(async (_deck: unknown, card: unknown) => card),
		saveCardsToDeck: vi.fn(async (_deck: unknown, cards: unknown[]) => cards),
		replaceDeckCardsForDeck: vi.fn(async () => undefined),
		deleteCardsByUUIDs: vi.fn(async () => []),
		deleteCard: vi.fn(async () => true),
		isWDeckCard: vi.fn((card?: { deckId?: string }) =>
			Boolean(String(card?.deckId || "").startsWith("wdeck:"))
		),
		isWDeckDeckId: vi.fn((id: string) => String(id).startsWith("wdeck:")),
		hasRuntimeCardMeta: vi.fn(() => false),
		rebuildCache: vi.fn(async () => undefined),
	};

	return {
		...base,
		...overrides,
		getCardsByUUIDs,
		getCardByUUID:
			typeof overrides.getCardByUUID === "function"
				? overrides.getCardByUUID
				: base.getCardByUUID,
	};
}
