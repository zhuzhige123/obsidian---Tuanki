import type { Card, Deck } from "../../data/types";
import {
	getCardDeckIds,
	setCardProperties,
	setCardProperty,
} from "../../utils/yaml-utils";

export interface KanbanCardUpdateResolution {
	oldDeckId?: string;
	newDeckId?: string;
	effectiveDeckId?: string;
	isMove: boolean;
}

export type KanbanDeckDragMode = "add" | "replace-source";

export interface KanbanDeckDragContext {
	kind: "deck-drag";
	cardIds: string[];
	sourceDeckId?: string;
	targetDeckId: string;
	mode: KanbanDeckDragMode;
}

export type KanbanCardUpdateContext = KanbanDeckDragContext;

export function applyPriorityUpdateToCard(card: Card, priority: number, modified?: string): Card {
	const updatedCard: Card = {
		...card,
		priority,
		content: setCardProperty(card.content || "", "we_priority", priority),
	};

	if (modified) {
		updatedCard.modified = modified;
	}

	return updatedCard;
}

export function applyDeckDragToCard(
	card: Card,
	decks: Deck[],
	targetDeckId: string,
	_mode: KanbanDeckDragMode,
	_sourceDeckId?: string,
	modified?: string
): Card {
	const targetDeck = decks.find((deck) => deck.id === targetDeckId);
	if (!targetDeck?.name) {
		return card;
	}

	const content = setCardProperties(card.content || "", {
		we_decks: [targetDeck.name],
	});

	const updatedCard: Card = {
		...card,
		content,
		deckId: targetDeck.id,
		referencedByDecks: [targetDeck.id],
	};

	if (modified) {
		updatedCard.modified = modified;
	}

	return updatedCard;
}

export function getQuestionBankDeckIdsForCard(card: Card): string[] {
	const metadataDeckIds = Array.isArray((card.metadata as any)?.questionBankDeckIds)
		? (card.metadata as any).questionBankDeckIds.filter(
				(value: unknown): value is string => typeof value === "string" && value.trim().length > 0
		  )
		: [];

	if (metadataDeckIds.length > 0) {
		return Array.from(new Set(metadataDeckIds));
	}

	const referencedDeckIds = Array.isArray(card.referencedByDecks)
		? card.referencedByDecks.filter(
				(value): value is string => typeof value === "string" && value.trim().length > 0
		  )
		: [];

	if (referencedDeckIds.length > 0) {
		return Array.from(new Set(referencedDeckIds));
	}

	return card.deckId ? [card.deckId] : [];
}

export function applyQuestionBankDeckDragToCard(
	card: Card,
	targetDeckId: string,
	mode: KanbanDeckDragMode,
	sourceDeckId?: string,
	modified?: string
): Card {
	const currentDeckIds = getQuestionBankDeckIdsForCard(card);
	const nextDeckIds = currentDeckIds.filter((deckId) => {
		if (deckId === targetDeckId) {
			return false;
		}

		if (mode === "replace-source" && sourceDeckId && deckId === sourceDeckId) {
			return false;
		}

		return true;
	});
	nextDeckIds.push(targetDeckId);

	const dedupedDeckIds = Array.from(new Set(nextDeckIds));
	const updatedCard: Card = {
		...card,
		deckId: dedupedDeckIds[0],
		referencedByDecks: dedupedDeckIds,
		metadata: {
			...(card.metadata || {}),
			questionBankDeckIds: dedupedDeckIds,
		},
	};

	if (modified) {
		updatedCard.modified = modified;
	}

	return updatedCard;
}

export function resolveKanbanCardUpdate(
	existingCard: Card | undefined,
	updatedCard: Card,
	decks: Deck[]
): KanbanCardUpdateResolution {
	const { primaryDeckId: existingResolvedDeckId } = existingCard
		? getCardDeckIds(existingCard, decks, { fallbackToReferences: false })
		: { primaryDeckId: undefined };
	const { primaryDeckId: updatedResolvedDeckId } = getCardDeckIds(updatedCard, decks, {
		fallbackToReferences: false,
	});

	const oldDeckId = existingResolvedDeckId || existingCard?.deckId;
	const newDeckId = updatedResolvedDeckId || updatedCard.deckId;
	const effectiveDeckId = newDeckId || oldDeckId;

	return {
		oldDeckId,
		newDeckId,
		effectiveDeckId,
		isMove: Boolean(existingCard && oldDeckId && newDeckId && oldDeckId !== newDeckId),
	};
}
