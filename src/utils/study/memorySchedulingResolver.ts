import type { Card, Deck } from "../../data/types";
import {
	normalizeMemorySchedulingSettings,
	type MemorySchedulingSettingsInput,
	type MemorySchedulingSettings,
} from "../learning-steps/memorySchedulingConfig";
import { getCardMetadata } from "../yaml-utils";

export function resolvePrimaryStudyDeckIdFromCard(card: Card, decks: Deck[]): string {
	if (!card.content) {
		return card.deckId || "";
	}

	try {
		const metadata = getCardMetadata(card.content);
		const rawDecks = Array.isArray(metadata.we_decks) ? metadata.we_decks : [];
		for (const rawDeck of rawDecks) {
			const normalizedDeck = String(rawDeck || "").trim();
			if (!normalizedDeck) {
				continue;
			}

			const matchedDeck = decks.find(
				(deck) => deck.id === normalizedDeck || deck.name === normalizedDeck
			);
			if (matchedDeck?.id) {
				return matchedDeck.id;
			}
		}
	} catch {
		return card.deckId || "";
	}

	return card.deckId || "";
}

export function resolveMemorySchedulingForCard(options: {
	card: Card;
	decks: Deck[];
	deckSettingsMap: Map<string, unknown>;
	globalSettings: unknown;
}): MemorySchedulingSettings {
	const { card, decks, deckSettingsMap, globalSettings } = options;
	const primaryDeckId = resolvePrimaryStudyDeckIdFromCard(card, decks);
	const deckSettings = deckSettingsMap.get(primaryDeckId) as
		| MemorySchedulingSettingsInput
		| undefined;
	const globalMemoryScheduling = normalizeMemorySchedulingSettings(
		globalSettings as MemorySchedulingSettingsInput
	).settings;
	return normalizeMemorySchedulingSettings(deckSettings, globalMemoryScheduling).settings;
}
