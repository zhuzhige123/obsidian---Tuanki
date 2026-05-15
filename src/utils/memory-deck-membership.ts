import type { Deck } from "../data/types";

export type DeckIdentifierLookup = Pick<Deck, "id" | "name" | "purpose">;

export interface NormalizedDeckEntry {
	rawValue: string;
	deckId: string;
	deckName: string;
	purpose?: Deck["purpose"];
	isKnownDeck: boolean;
}

function normalizeLookupValue(value: unknown): string {
	return String(value || "").trim();
}

function buildLookupMaps(decks?: DeckIdentifierLookup[]) {
	const byId = new Map<string, DeckIdentifierLookup>();
	const byName = new Map<string, DeckIdentifierLookup>();

	for (const deck of decks || []) {
		const deckId = normalizeLookupValue(deck.id);
		const deckName = normalizeLookupValue(deck.name);
		if (!deckId || !deckName) {
			continue;
		}

		byId.set(deckId, deck);
		byName.set(deckName, deck);
	}

	return { byId, byName };
}

export function getNormalizedDeckEntries(
	values: string[] | undefined,
	decks?: DeckIdentifierLookup[]
): NormalizedDeckEntry[] {
	if (!values || values.length === 0) {
		return [];
	}

	const { byId, byName } = buildLookupMaps(decks);
	const entries: NormalizedDeckEntry[] = [];
	const seen = new Set<string>();

	for (const rawValue of values) {
		const value = normalizeLookupValue(rawValue);
		if (!value) {
			continue;
		}

		const matchedDeck = byId.get(value) || byName.get(value);
		const deckId = normalizeLookupValue(matchedDeck?.id) || value;
		const deckName = normalizeLookupValue(matchedDeck?.name) || value;
		const dedupeKey = matchedDeck ? `deck:${deckId}` : `raw:${value}`;

		if (seen.has(dedupeKey)) {
			continue;
		}

		seen.add(dedupeKey);
		entries.push({
			rawValue: value,
			deckId,
			deckName,
			purpose: matchedDeck?.purpose,
			isKnownDeck: !!matchedDeck,
		});
	}

	return entries;
}

export function getMemoryFormalDeckEntries(
	values: string[] | undefined,
	decks?: DeckIdentifierLookup[]
): NormalizedDeckEntry[] {
	return getNormalizedDeckEntries(values, decks).filter((entry) => entry.purpose !== "test");
}

export function hasMultipleMemoryFormalDecks(
	values: string[] | undefined,
	decks?: DeckIdentifierLookup[]
): boolean {
	return getMemoryFormalDeckEntries(values, decks).length > 1;
}

export function keepSingleMemoryFormalDeck(
	values: string[] | undefined,
	decks?: DeckIdentifierLookup[]
): NormalizedDeckEntry[] {
	const entries = getNormalizedDeckEntries(values, decks);
	let primaryMemoryDeck: NormalizedDeckEntry | undefined;
	const nonMemoryDecks: NormalizedDeckEntry[] = [];

	for (const entry of entries) {
		if (entry.purpose === "test") {
			nonMemoryDecks.push(entry);
			continue;
		}

		if (!primaryMemoryDeck) {
			primaryMemoryDeck = entry;
		}
	}

	return primaryMemoryDeck ? [primaryMemoryDeck, ...nonMemoryDecks] : nonMemoryDecks;
}

export function getSingleMemoryFormalDeckIds(
	values: string[] | undefined,
	decks?: DeckIdentifierLookup[]
): string[] {
	return keepSingleMemoryFormalDeck(values, decks).map((entry) => entry.deckId);
}

export function getSingleMemoryFormalDeckNames(
	values: string[] | undefined,
	decks?: DeckIdentifierLookup[]
): string[] {
	return keepSingleMemoryFormalDeck(values, decks).map((entry) => entry.deckName);
}

export function getPrimarySingleMemoryFormalDeckId(
	values: string[] | undefined,
	decks?: DeckIdentifierLookup[]
): string | undefined {
	return getSingleMemoryFormalDeckIds(values, decks)[0];
}

