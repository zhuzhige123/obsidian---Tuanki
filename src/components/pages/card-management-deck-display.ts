import type { Card, Deck } from "../../data/types";
import { getCardDeckIdsFromFormalSource, getCardMetadata } from "../../utils/yaml-utils";
import { getQuestionBankDeckIdsForCard } from "./kanban-card-update";

type DeckLookup = Array<Pick<Deck, "id" | "name">>;

export function getMemoryFormalDeckDisplayNames(
	card: Pick<Card, "content" | "deckId" | "referencedByDecks" | "cardPurpose">,
	memoryDecks: DeckLookup
): string[] {
	if (card.content) {
		try {
			const metadata = getCardMetadata(card.content);
			const yamlDeckNames = (metadata.we_decks || []).filter(
				(name): name is string => typeof name === "string" && name.trim().length > 0
			);
			if (yamlDeckNames.length > 0) {
				return Array.from(new Set(yamlDeckNames.map((name) => name.trim())));
			}
		} catch {
			// fall through to formal source lookup
		}
	}

	const { deckIds } = getCardDeckIdsFromFormalSource(card, memoryDecks);
	const names = deckIds
		.map((deckId) => memoryDecks.find((deck) => deck.id === deckId)?.name || "")
		.filter(Boolean);

	return Array.from(new Set(names));
}

export function getQuestionBankDeckDisplayNames(card: Card, questionBankDecks: DeckLookup): string[] {
	const bankIds = resolveQuestionBankDeckIdsForManagement(card, questionBankDecks);
	const names = bankIds
		.map((deckId) => questionBankDecks.find((deck) => deck.id === deckId)?.name || "")
		.filter(Boolean);

	return Array.from(new Set(names));
}

export function resolveQuestionBankDeckIdsForManagement(
	card: Card,
	questionBankDecks: DeckLookup
): string[] {
	const bankIds = getQuestionBankDeckIdsForCard(card).filter(Boolean);
	if (bankIds.length > 0) {
		return Array.from(new Set(bankIds));
	}

	const fallbackId = typeof card.deckId === "string" ? card.deckId.trim() : "";
	if (fallbackId && questionBankDecks.some((deck) => deck.id === fallbackId)) {
		return [fallbackId];
	}

	return [];
}

export function mergeQuestionBankCardIntoMap(
	target: Map<string, Card>,
	card: Card,
	bankId: string
): void {
	const existing = target.get(card.uuid);
	if (!existing) {
		target.set(card.uuid, {
			...card,
			deckId: bankId,
			referencedByDecks: [bankId],
			metadata: {
				...(card.metadata || {}),
				questionBankDeckIds: [bankId],
			},
		});
		return;
	}

	const mergedBankIds = Array.from(
		new Set([...getQuestionBankDeckIdsForCard(existing), bankId, ...getQuestionBankDeckIdsForCard(card)])
	);

	target.set(card.uuid, {
		...existing,
		...card,
		deckId: mergedBankIds[0] || bankId,
		referencedByDecks: mergedBankIds,
		metadata: {
			...(existing.metadata || {}),
			...(card.metadata || {}),
			questionBankDeckIds: mergedBankIds,
		},
	});
}
