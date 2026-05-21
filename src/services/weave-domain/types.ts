import type { Card, Deck } from "../../data/types";

export interface WeaveDomainAPIInfo {
	apiVersion: string;
	pluginVersion: string;
	capabilities: {
		createCard: boolean;
		updateCard: boolean;
		deleteCard: boolean;
		deleteCards: boolean;
		createDeck: boolean;
		updateDeck: boolean;
		deleteDeck: boolean;
	};
}

export interface CardCommandResult {
	success: boolean;
	card?: Card;
	cardId?: string;
	error?: string;
}

export interface DeckCommandResult {
	success: boolean;
	deck?: Deck;
	deckId?: string;
	error?: string;
}

export interface BatchCardCommandResult {
	success: boolean;
	deleted: string[];
	failed: Array<{ uuid: string; error?: string }>;
	error?: string;
}

export interface CreateCardParams {
	card: Card;
}

export interface UpdateCardParams {
	card: Card;
}

export interface DeleteCardParams {
	cardId: string;
}

export interface DeleteCardsParams {
	cardIds: string[];
	options?: { skipCascadeDeckIds?: string[] };
}

export interface CreateDeckParams {
	deck: Deck;
}

export interface UpdateDeckParams {
	deck: Deck;
}

export interface DeleteDeckParams {
	deckId: string;
	options?: { skipCardDeletion?: boolean };
}

export interface WeaveDomainAPI {
	getInfo(): WeaveDomainAPIInfo;
	createCard(params: CreateCardParams): Promise<CardCommandResult>;
	updateCard(params: UpdateCardParams): Promise<CardCommandResult>;
	deleteCard(params: DeleteCardParams): Promise<CardCommandResult>;
	deleteCards(params: DeleteCardsParams): Promise<BatchCardCommandResult>;
	createDeck(params: CreateDeckParams): Promise<DeckCommandResult>;
	updateDeck(params: UpdateDeckParams): Promise<DeckCommandResult>;
	deleteDeck(params: DeleteDeckParams): Promise<DeckCommandResult>;
}
