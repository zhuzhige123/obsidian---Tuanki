/**
 * 数据存储适配器
 * 
 * 抽象插件数据存储操作
 * 
 * @module infrastructure/adapters
 */

import type { Card, Deck } from '../../data/types';
import type AnkiPlugin from '../../main';

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
  deleteDeck(deckId: string): Promise<void>;

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
  createCards(cards: Card[]): Promise<void>;

  /**
   * 更新卡片
   */
  updateCard(card: Card): Promise<void>;

  /**
   * 删除卡片
   */
  deleteCard(cardId: string): Promise<void>;

  /**
   * 保存所有数据
   */
  saveAll(): Promise<void>;
}

/**
 * 插件数据存储适配器实现
 */
export class PluginDataStorageAdapter implements IDataStorageAdapter {
  constructor(private plugin: AnkiPlugin) {}

  async getDecks(): Promise<Deck[]> {
    return await this.plugin.dataStorage.getDecks();
  }

  async getDeckById(id: string): Promise<Deck | null> {
    const decks = await this.getDecks();
    return decks.find(d => d.id === id) || null;
  }

  async getDeckByName(name: string): Promise<Deck | null> {
    const decks = await this.getDecks();
    return decks.find(d => d.name === name) || null;
  }

  async createDeck(deck: Deck): Promise<void> {
    await this.plugin.dataStorage.addDeck(deck);
  }

  async updateDeck(deck: Deck): Promise<void> {
    await this.plugin.dataStorage.updateDeck(deck);
  }

  async deleteDeck(deckId: string): Promise<void> {
    await this.plugin.dataStorage.deleteDeck(deckId);
  }

  async getCardsByDeck(deckId: string): Promise<Card[]> {
    return await this.plugin.dataStorage.getCardsByDeck(deckId);
  }

  async getCardById(id: string): Promise<Card | null> {
    return await this.plugin.dataStorage.getCard(id);
  }

  async createCard(card: Card): Promise<void> {
    await this.plugin.dataStorage.addCard(card);
  }

  async createCards(cards: Card[]): Promise<void> {
    for (const card of cards) {
      await this.createCard(card);
    }
  }

  async updateCard(card: Card): Promise<void> {
    await this.plugin.dataStorage.updateCard(card);
  }

  async deleteCard(cardId: string): Promise<void> {
    await this.plugin.dataStorage.deleteCard(cardId);
  }

  async saveAll(): Promise<void> {
    await this.plugin.saveData(this.plugin.dataStorage);
  }
}




