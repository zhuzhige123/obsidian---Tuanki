/**
 * Weave数据存储适配器实现
 *
 * 实现IDataStorageAdapter接口，桥接到Weave的AnkiDataStorage
 *
 * @module infrastructure/adapters/impl
 */

import type { WeaveDataStorage } from "../../../data/storage";
import type { Card, Deck, DeckSettings } from "../../../data/types";
import { APKGLogger } from "../../logger/APKGLogger";
import type { IDataStorageAdapter } from "../DataStorageAdapter";

/**
 * Weave数据存储适配器
 */
export class WeaveDataStorageAdapter implements IDataStorageAdapter {
	private logger: APKGLogger;
	private storage: WeaveDataStorage;

	constructor(storage: WeaveDataStorage) {
		this.logger = new APKGLogger({ prefix: "[WeaveDataStorage]" });
		this.storage = storage;
	}

	// ===== 牌组操作 =====

	async getDecks(): Promise<Deck[]> {
		try {
			return await this.storage.getDecks();
		} catch (error) {
			this.logger.error("获取牌组列表失败", error);
			return [];
		}
	}

	async getDeckById(deckId: string): Promise<Deck | null> {
		try {
			const decks = await this.storage.getDecks();
			return decks.find((d) => d.id === deckId) || null;
		} catch (error) {
			this.logger.error(`获取牌组失败: ${deckId}`, error);
			return null;
		}
	}

	async getDeckByName(name: string): Promise<Deck | null> {
		try {
			const decks = await this.storage.getDecks();
			return decks.find((d) => d.name === name) || null;
		} catch (error) {
			this.logger.error(`获取牌组失败: ${name}`, error);
			return null;
		}
	}

	async getDefaultDeckSettings(overrides?: Partial<DeckSettings>): Promise<DeckSettings> {
		try {
			return this.storage.getCurrentDefaultDeckSettings(overrides);
		} catch (error) {
			this.logger.error("获取默认牌组设置失败", error);
			throw error;
		}
	}

	async createDeck(deck: Deck): Promise<void> {
		try {
			await this.storage.saveDeck(deck);
			this.logger.info(`创建牌组: ${deck.name} (${deck.id})`);
		} catch (error) {
			this.logger.error("创建牌组失败", error);
			throw error;
		}
	}

	async updateDeck(deck: Deck): Promise<void> {
		try {
			await this.storage.saveDeck(deck);
			this.logger.debug(`更新牌组: ${deck.id}`);
		} catch (error) {
			this.logger.error("更新牌组失败", error);
			throw error;
		}
	}

	async deleteDeck(deckId: string, options?: { skipCardDeletion?: boolean }): Promise<void> {
		try {
			await this.storage.deleteDeck(deckId, options);
			this.logger.info(`删除牌组: ${deckId}`);
		} catch (error) {
			this.logger.error("删除牌组失败", error);
			throw error;
		}
	}

	// ===== 卡片操作 =====

	async getCardsByDeck(deckId: string): Promise<Card[]> {
		try {
			return await this.storage.getCardsByDeck(deckId);
		} catch (error) {
			this.logger.error(`获取卡片列表失败: ${deckId}`, error);
			return [];
		}
	}

	async getCardById(id: string): Promise<Card | null> {
		try {
			return await this.storage.getCardByUUID(id);
		} catch (error) {
			this.logger.error(`获取卡片失败: ${id}`, error);
			return null;
		}
	}

	async createCard(card: Card): Promise<void> {
		try {
			await this.storage.saveCard(card);
			this.logger.debug(`创建卡片: ${card.uuid}`);
		} catch (error) {
			this.logger.error("创建卡片失败", error);
			throw error;
		}
	}

	async createCards(
		cards: Card[],
		onProgress?: (current: number, total: number, detail: string) => void
	): Promise<void> {
		try {
			if (typeof (this.storage as any).saveCardsBatchWithProgress === "function") {
				await (this.storage as any).saveCardsBatchWithProgress(cards, onProgress);
			} else {
				await this.storage.saveCardsBatch(cards);
			}
			this.logger.info(`批量创建卡片: ${cards.length} 张`);
		} catch (error) {
			this.logger.error("批量创建卡片失败", error);
			throw error;
		}
	}

	async updateCard(card: Card): Promise<void> {
		try {
			await this.storage.saveCard(card);
			this.logger.debug(`更新卡片: ${card.uuid}`);
		} catch (error) {
			this.logger.error("更新卡片失败", error);
			throw error;
		}
	}

	async deleteCard(cardId: string): Promise<void> {
		try {
			await this.storage.deleteCard(cardId);
			this.logger.debug(`删除卡片: ${cardId}`);
		} catch (error) {
			this.logger.error("删除卡片失败", error);
			throw error;
		}
	}

	// ===== 其他操作 =====

	async saveAll(): Promise<void> {
		try {
			// WeaveDataStorage 的方法是自动保存，这里不需要额外操作
			this.logger.debug("保存所有更改");
		} catch (error) {
			this.logger.error("保存失败", error);
			throw error;
		}
	}
}
