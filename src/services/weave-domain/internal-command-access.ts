import type { ApiResponse, Card, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { extractErrorMessage } from "../../types/utility-types";
import type { WeaveDomainAPI } from "./types";

export type MemoryCardSaveMode = "auto" | "create" | "update";
export type MemoryDeckSaveMode = "auto" | "create" | "update";

function resolveDomainAPI(plugin: WeavePlugin): WeaveDomainAPI {
	if (typeof plugin.getOfficialAPI === "function") {
		return plugin.getOfficialAPI();
	}
	if (plugin.weaveDomainService) {
		return plugin.weaveDomainService;
	}
	throw new Error("Weave 官方 Domain API 未初始化");
}

function cardResultToApiResponse(
	result: { success: boolean; card?: Card; error?: string },
	fallbackCard?: Card
): ApiResponse<Card> {
	const timestamp = new Date().toISOString();
	if (!result.success) {
		return {
			success: false,
			error: result.error || "保存卡片失败",
			timestamp,
		};
	}

	return {
		success: true,
		data: result.card ?? fallbackCard,
		timestamp,
	};
}

function deckResultToApiResponse(
	result: { success: boolean; deck?: Deck; error?: string },
	fallbackDeck?: Deck
): ApiResponse<Deck> {
	const timestamp = new Date().toISOString();
	if (!result.success) {
		return {
			success: false,
			error: result.error || "保存牌组失败",
			timestamp,
		};
	}

	return {
		success: true,
		data: result.deck ?? fallbackDeck,
		timestamp,
	};
}

async function cardExists(plugin: WeavePlugin, card: Card): Promise<boolean> {
	if (!card.uuid || !plugin.dataStorage) {
		return false;
	}

	const existing = await plugin.dataStorage.getCardByUUID(card.uuid);
	return Boolean(existing);
}

async function deckExists(plugin: WeavePlugin, deck: Deck): Promise<boolean> {
	if (!deck.id || !plugin.dataStorage) {
		return false;
	}

	const existing = await plugin.dataStorage.getDeck(deck.id);
	return Boolean(existing);
}

export async function saveMemoryCard(
	plugin: WeavePlugin,
	card: Card,
	mode: MemoryCardSaveMode = "auto"
): Promise<ApiResponse<Card>> {
	try {
		const api = resolveDomainAPI(plugin);
		const resolvedMode =
			mode === "auto" ? ((await cardExists(plugin, card)) ? "update" : "create") : mode;
		const result =
			resolvedMode === "create"
				? await api.createCard({ card })
				: await api.updateCard({ card });
		return cardResultToApiResponse(result, card);
	} catch (error) {
		return {
			success: false,
			error: extractErrorMessage(error),
			timestamp: new Date().toISOString(),
		};
	}
}

export async function saveMemoryDeck(
	plugin: WeavePlugin,
	deck: Deck,
	mode: MemoryDeckSaveMode = "auto"
): Promise<ApiResponse<Deck>> {
	try {
		const api = resolveDomainAPI(plugin);
		const resolvedMode =
			mode === "auto" ? ((await deckExists(plugin, deck)) ? "update" : "create") : mode;
		const result =
			resolvedMode === "create"
				? await api.createDeck({ deck })
				: await api.updateDeck({ deck });
		return deckResultToApiResponse(result, deck);
	} catch (error) {
		return {
			success: false,
			error: extractErrorMessage(error),
			timestamp: new Date().toISOString(),
		};
	}
}

export async function deleteMemoryCard(
	plugin: WeavePlugin,
	cardId: string
): Promise<ApiResponse<boolean>> {
	try {
		const result = await resolveDomainAPI(plugin).deleteCard({ cardId });
		return {
			success: result.success,
			data: result.success,
			error: result.error,
			timestamp: new Date().toISOString(),
		};
	} catch (error) {
		return {
			success: false,
			error: extractErrorMessage(error),
			timestamp: new Date().toISOString(),
		};
	}
}

export async function deleteMemoryDeck(
	plugin: WeavePlugin,
	deckId: string,
	options?: { skipCardDeletion?: boolean }
): Promise<ApiResponse<boolean>> {
	try {
		const result = await resolveDomainAPI(plugin).deleteDeck({ deckId, options });
		return {
			success: result.success,
			data: result.success,
			error: result.error,
			timestamp: new Date().toISOString(),
		};
	} catch (error) {
		return {
			success: false,
			error: extractErrorMessage(error),
			timestamp: new Date().toISOString(),
		};
	}
}

export async function deleteMemoryCards(
	plugin: WeavePlugin,
	cardIds: string[],
	options?: { skipCascadeDeckIds?: string[] }
): Promise<{ deleted: string[]; failed: Array<{ uuid: string; error?: string }> }> {
	const result = await resolveDomainAPI(plugin).deleteCards({ cardIds, options });
	return {
		deleted: result.deleted,
		failed: result.failed,
	};
}
