import type { Card } from "../data/types";
import { isRecord, parseJsonUnknown, readString } from "./typed-json";

export function isDeckFileCardRecord(card: unknown): card is Card {
	return isRecord(card) && typeof card.uuid === "string" && card.uuid.trim().length > 0;
}

export interface DeckFilePayload {
	deckId: string;
	cards: Card[];
}

export function parseDeckFilePayload(content: string): DeckFilePayload {
	const parsed = parseJsonUnknown(content);
	if (!isRecord(parsed)) {
		return { deckId: "unknown", cards: [] };
	}

	const cardsRaw = parsed.cards;
	const cards = Array.isArray(cardsRaw)
		? cardsRaw.filter((card): card is Card => isDeckFileCardRecord(card))
		: [];

	const deckId =
		readString(parsed, "id") ||
		(cards[0] && typeof cards[0].deckId === "string" ? cards[0].deckId : "unknown");

	return { deckId, cards };
}

export function findCardInDeckPayload(cards: Card[], uuid: string): Card | null {
	return cards.find((card) => card.uuid === uuid) ?? null;
}
