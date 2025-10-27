/**
 * Tuanki数据存储适配器实现
 * 
 * 实现IDataStorageAdapter接口，桥接到Tuanki的AnkiDataStorage
 * 
 * @module infrastructure/adapters/impl
 */

import type { IDataStorageAdapter } from '../DataStorageAdapter';
import type { Deck, Card } from '../../../data/types';
import type { AnkiDataStorage } from '../../../data/storage';
import { APKGLogger } from '../../logger/APKGLogger';

/**
 * Tuanki数据存储适配器
 */
export class TuankiDataStorageAdapter implements IDataStorageAdapter {
  private logger: APKGLogger;
  private storage: AnkiDataStorage;

  constructor(storage: AnkiDataStorage) {
    this.logger = new APKGLogger({ prefix: '[TuankiDataStorage]' });
    this.storage = storage;
  }

  // ===== 牌组操作 =====

  async getDecks(): Promise<Deck[]> {
    try {
      return await this.storage.getDecks();
    } catch (error) {
      this.logger.error('获取牌组列表失败', error);
      return [];
    }
  }

  async getDeckById(deckId: string): Promise<Deck | null> {
    try {
      const decks = await this.storage.getDecks();
      return decks.find(d => d.id === deckId) || null;
    } catch (error) {
      this.logger.error(`获取牌组失败: ${deckId}`, error);
      return null;
    }
  }

  async getDeckByName(name: string): Promise<Deck | null> {
    try {
      const decks = await this.storage.getDecks();
      return decks.find(d => d.name === name) || null;
    } catch (error) {
      this.logger.error(`获取牌组失败: ${name}`, error);
      return null;
    }
  }

  async createDeck(deck: Deck): Promise<void> {
    try {
      await this.storage.saveDeck(deck);
      this.logger.info(`创建牌组: ${deck.name} (${deck.id})`);
    } catch (error) {
      this.logger.error('创建牌组失败', error);
      throw error;
    }
  }

  async updateDeck(deck: Deck): Promise<void> {
    try {
      await this.storage.saveDeck(deck);
      this.logger.debug(`更新牌组: ${deck.id}`);
    } catch (error) {
      this.logger.error('更新牌组失败', error);
      throw error;
    }
  }

  async deleteDeck(deckId: string): Promise<void> {
    try {
      await this.storage.deleteDeck(deckId);
      this.logger.info(`删除牌组: ${deckId}`);
    } catch (error) {
      this.logger.error('删除牌组失败', error);
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
      return await this.storage.getCard(id);
    } catch (error) {
      this.logger.error(`获取卡片失败: ${id}`, error);
      return null;
    }
  }

  async createCard(card: Card): Promise<void> {
    try {
      await this.storage.saveCard(card);
      this.logger.debug(`创建卡片: ${card.id}`);
    } catch (error) {
      this.logger.error('创建卡片失败', error);
      throw error;
    }
  }

  async createCards(cards: Card[]): Promise<void> {
    try {
      for (const card of cards) {
        await this.storage.saveCard(card);
      }
      this.logger.info(`批量创建卡片: ${cards.length} 张`);
    } catch (error) {
      this.logger.error('批量创建卡片失败', error);
      throw error;
    }
  }

  async updateCard(card: Card): Promise<void> {
    try {
      await this.storage.saveCard(card);
      this.logger.debug(`更新卡片: ${card.id}`);
    } catch (error) {
      this.logger.error('更新卡片失败', error);
      throw error;
    }
  }

  async deleteCard(cardId: string): Promise<void> {
    try {
      await this.storage.deleteCard(cardId);
      this.logger.debug(`删除卡片: ${cardId}`);
    } catch (error) {
      this.logger.error('删除卡片失败', error);
      throw error;
    }
  }

  // ===== 其他操作 =====

  async saveAll(): Promise<void> {
    try {
      // AnkiDataStorage 的方法是自动保存，这里不需要额外操作
      this.logger.debug('保存所有更改');
    } catch (error) {
      this.logger.error('保存失败', error);
      throw error;
    }
  }
}

