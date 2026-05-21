/**
 * 数据存储适配器
 *
 * 抽象插件数据存储操作
 *
 * @module infrastructure/adapters
 */

import type { Card, Deck, DeckSettings } from "../../data/types";
import type { WeavePlugin } from "../../main";
import type {
	BatchCardCommandResult,
	CardCommandResult,
	DeckCommandResult,
	WeaveDomainAPI,
} from "../../services/weave-domain";
import { extractErrorMessage } from "../../types/utility-types";

/**
 * 数据存储适配器接口
 */
export interface IDataStorageAdapter {
	/**
	 * 获取所有牌组
	 */
	getDecks(): Promise<Deck[]>;

	/**
	 * 根据ID获取牌组
	 */
	getDeckById(id: string): Promise<Deck | null>;

	/**
	 * 根据名称获取牌组
	 */
	getDeckByName(name: string): Promise<Deck | null>;

	/**
	 * 获取当前全局配置下的默认牌组设置
	 */
	getDefaultDeckSettings(overrides?: Partial<DeckSettings>): Promise<DeckSettings>;

	/**
	 * 创建牌组
	 */
	createDeck(deck: Deck): Promise<void>;

	/**
	 * 更新牌组
	 */
	updateDeck(deck: Deck): Promise<void>;

	/**
	 * 删除牌组
	 */
	deleteDeck(deckId: string, options?: { skipCardDeletion?: boolean }): Promise<void>;

	/**
	 * 获取牌组的所有卡片
	 */
	getCardsByDeck(deckId: string): Promise<Card[]>;

	/**
	 * 根据ID获取卡片
	 */
	getCardById(id: string): Promise<Card | null>;

	/**
	 * 创建卡片
	 */
	createCard(card: Card): Promise<void>;

	/**
	 * 批量创建卡片
	 */
	createCards(
		cards: Card[],
		onProgress?: (current: number, total: number, detail: string) => void
	): Promise<void>;

	/**
	 * 更新卡片
	 */
	updateCard(card: Card): Promise<void>;

	/**
	 * 删除卡片
	 */
	deleteCard(cardId: string): Promise<void>;

	/**
	 * 批量删除卡片
	 */
	deleteCards(cardIds: string[]): Promise<void>;

	/**
	 * 保存所有数据
	 */
	saveAll(): Promise<void>;
}

/**
 * 插件数据存储适配器实现
 */
export class PluginDataStorageAdapter implements IDataStorageAdapter {
	constructor(private plugin: WeavePlugin) {}

	private getDomainService(): WeaveDomainAPI | null {
		if (this.plugin.weaveDomainService) {
			return this.plugin.weaveDomainService;
		}

		if (typeof this.plugin.getOfficialAPI === "function") {
			return this.plugin.getOfficialAPI();
		}

		return null;
	}

	private assertCommandSucceeded(
		result: CardCommandResult | DeckCommandResult,
		fallbackMessage: string
	): void {
		if (!result.success) {
			throw new Error(result.error || fallbackMessage);
		}
	}

	private assertBatchCardCommandSucceeded(
		result: BatchCardCommandResult,
		fallbackMessage: string
	): void {
		if (!result.success) {
			throw new Error(result.error || fallbackMessage);
		}
	}

	async getDecks(): Promise<Deck[]> {
		return await this.plugin.dataStorage.getDecks();
	}

	async getDeckById(id: string): Promise<Deck | null> {
		const decks = await this.getDecks();
		return decks.find((d) => d.id === id) || null;
	}

	async getDeckByName(name: string): Promise<Deck | null> {
		const decks = await this.getDecks();
		return decks.find((d) => d.name === name) || null;
	}

	async getDefaultDeckSettings(overrides?: Partial<DeckSettings>): Promise<DeckSettings> {
		return this.plugin.dataStorage.getCurrentDefaultDeckSettings(overrides);
	}

	async createDeck(deck: Deck): Promise<void> {
		const domainService = this.getDomainService();
		if (!domainService) {
			await this.plugin.dataStorage.addDeck(deck);
			return;
		}

		const result = await domainService.createDeck({ deck });
		this.assertCommandSucceeded(result, "创建牌组失败");
	}

	async updateDeck(deck: Deck): Promise<void> {
		const domainService = this.getDomainService();
		if (!domainService) {
			await this.plugin.dataStorage.updateDeck(deck);
			return;
		}

		const result = await domainService.updateDeck({ deck });
		this.assertCommandSucceeded(result, "更新牌组失败");
	}

	async deleteDeck(deckId: string, options?: { skipCardDeletion?: boolean }): Promise<void> {
		const domainService = this.getDomainService();
		if (!domainService) {
			await this.plugin.dataStorage.deleteDeck(deckId, options);
			return;
		}

		const result = await domainService.deleteDeck({ deckId, options });
		this.assertCommandSucceeded(result, "删除牌组失败");
	}

	async getCardsByDeck(deckId: string): Promise<Card[]> {
		return await this.plugin.dataStorage.getCardsByDeck(deckId);
	}

	async getCardById(id: string): Promise<Card | null> {
		return await this.plugin.dataStorage.getCardByUUID(id);
	}

	async createCard(card: Card): Promise<void> {
		const domainService = this.getDomainService();
		if (!domainService) {
			await this.plugin.dataStorage.addCard(card);
			return;
		}

		const result = await domainService.createCard({ card });
		this.assertCommandSucceeded(result, "创建卡片失败");
	}

	async createCards(
		cards: Card[],
		onProgress?: (current: number, total: number, detail: string) => void
	): Promise<void> {
		for (let index = 0; index < cards.length; index++) {
			await this.createCard(cards[index]);
			onProgress?.(index + 1, cards.length, `正在写入第 ${index + 1}/${cards.length} 张卡片`);
		}
	}

	async updateCard(card: Card): Promise<void> {
		const domainService = this.getDomainService();
		if (!domainService) {
			await this.plugin.dataStorage.updateCard(card);
			return;
		}

		const result = await domainService.updateCard({ card });
		this.assertCommandSucceeded(result, "更新卡片失败");
	}

	async deleteCard(cardId: string): Promise<void> {
		const domainService = this.getDomainService();
		if (!domainService) {
			await this.plugin.dataStorage.deleteCard(cardId);
			return;
		}

		const result = await domainService.deleteCard({ cardId });
		this.assertCommandSucceeded(result, "删除卡片失败");
	}

	async deleteCards(cardIds: string[]): Promise<void> {
		const domainService = this.getDomainService();
		if (!domainService?.deleteCards) {
			await this.plugin.dataStorage.deleteCards(cardIds);
			return;
		}

		const result = await domainService.deleteCards({ cardIds });
		this.assertBatchCardCommandSucceeded(result, "批量删除卡片失败");
	}

	async saveAll(): Promise<void> {
		try {
			await this.plugin.saveData(this.plugin.dataStorage);
		} catch (error) {
			throw new Error(extractErrorMessage(error));
		}
	}
}
