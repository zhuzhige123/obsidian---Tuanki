import type { Card, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { extractErrorMessage } from "../../types/utility-types";
import type {
	BatchCardCommandResult,
	CardCommandResult,
	CreateCardParams,
	CreateDeckParams,
	DeleteCardParams,
	DeleteCardsParams,
	DeleteDeckParams,
	DeckCommandResult,
	UpdateCardParams,
	UpdateDeckParams,
	WeaveDomainAPI,
	WeaveDomainAPIInfo,
} from "./types";

const API_VERSION = "1";

export class WeaveDomainService implements WeaveDomainAPI {
	constructor(private readonly plugin: WeavePlugin) {}

	getInfo(): WeaveDomainAPIInfo {
		return {
			apiVersion: API_VERSION,
			pluginVersion: this.plugin.manifest.version,
			capabilities: {
				createCard: true,
				updateCard: true,
				deleteCard: true,
				deleteCards: true,
				createDeck: true,
				updateDeck: true,
				deleteDeck: true,
			},
		};
	}

	async createCard(params: CreateCardParams): Promise<CardCommandResult> {
		return this.mapCardResponse(await this.requireStorage().addCard(params.card), params.card.uuid);
	}

	async updateCard(params: UpdateCardParams): Promise<CardCommandResult> {
		return this.mapCardResponse(
			await this.requireStorage().updateCard(params.card),
			params.card.uuid
		);
	}

	async deleteCard(params: DeleteCardParams): Promise<CardCommandResult> {
		const response = await this.requireStorage().deleteCard(params.cardId);
		if (!response.success) {
			return {
				success: false,
				cardId: params.cardId,
				error: response.error || "删除卡片失败",
			};
		}

		return {
			success: true,
			cardId: params.cardId,
		};
	}

	async deleteCards(params: DeleteCardsParams): Promise<BatchCardCommandResult> {
		try {
			const result = await this.requireStorage().deleteCards(params.cardIds, params.options);
			const failed = result.failed ?? [];
			return {
				success: failed.length === 0,
				deleted: result.deleted ?? [],
				failed,
				error: failed.length > 0 ? `批量删除失败: ${failed.length} 张` : undefined,
			};
		} catch (error) {
			return {
				success: false,
				deleted: [],
				failed: params.cardIds.map((uuid) => ({
					uuid,
					error: extractErrorMessage(error),
				})),
				error: extractErrorMessage(error),
			};
		}
	}

	async createDeck(params: CreateDeckParams): Promise<DeckCommandResult> {
		return this.mapDeckResponse(await this.requireStorage().addDeck(params.deck), params.deck.id);
	}

	async updateDeck(params: UpdateDeckParams): Promise<DeckCommandResult> {
		return this.mapDeckResponse(
			await this.requireStorage().updateDeck(params.deck),
			params.deck.id
		);
	}

	async deleteDeck(params: DeleteDeckParams): Promise<DeckCommandResult> {
		const response = await this.requireStorage().deleteDeck(params.deckId, params.options);
		if (!response.success) {
			return {
				success: false,
				deckId: params.deckId,
				error: response.error || "删除牌组失败",
			};
		}

		return {
			success: true,
			deckId: params.deckId,
		};
	}

	private requireStorage() {
		if (!this.plugin.dataStorage) {
			throw new Error("dataStorage 未初始化");
		}
		return this.plugin.dataStorage;
	}

	private mapCardResponse(
		response: { success: boolean; data?: Card; error?: string },
		fallbackCardId?: string
	): CardCommandResult {
		if (!response.success) {
			return {
				success: false,
				cardId: fallbackCardId,
				error: response.error || "卡片命令失败",
			};
		}

		return {
			success: true,
			card: response.data,
			cardId: response.data?.uuid || fallbackCardId,
		};
	}

	private mapDeckResponse(
		response: { success: boolean; data?: Deck; error?: string },
		fallbackDeckId?: string
	): DeckCommandResult {
		if (!response.success) {
			return {
				success: false,
				deckId: fallbackDeckId,
				error: response.error || "牌组命令失败",
			};
		}

		return {
			success: true,
			deck: response.data,
			deckId: response.data?.id || fallbackDeckId,
		};
	}
}
