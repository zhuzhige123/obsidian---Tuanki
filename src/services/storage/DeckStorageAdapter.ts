/**
 * 牌组存储适配器
 * 实现 IDeckStorage 接口，适配现有的数据存储服务
 */

import { IDeckStorage, DeckInfo } from '../batch-parsing';
import type AnkiPlugin from '../../main';

/**
 * 牌组存储适配器类
 */
export class DeckStorageAdapter implements IDeckStorage {
  private plugin: AnkiPlugin;
  private deckCache: Map<string, DeckInfo> = new Map();

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
  }

  /**
   * 获取所有牌组
   */
  async getDecks(): Promise<DeckInfo[]> {
    try {
      const dataStorage = (this.plugin as any).dataStorage;
      if (!dataStorage) {
        console.error('[DeckStorageAdapter] 数据存储服务不可用');
        return [];
      }

      // 尝试从数据存储获取牌组列表
      const response = await dataStorage.getDecks();
      
      if (response?.success && Array.isArray(response.data)) {
        const decks: DeckInfo[] = response.data.map((deck: any) => ({
          id: deck.id || deck.deckId || String(deck.name),
          name: deck.name || deck.deckName || 'Unnamed Deck',
          description: deck.description || deck.desc || ''
        }));

        // 更新缓存
        decks.forEach(deck => this.deckCache.set(deck.id, deck));

        return decks;
      }

      // 如果没有牌组，返回空数组
      console.warn('[DeckStorageAdapter] 未找到牌组或格式不正确');
      return [];
    } catch (error) {
      console.error('[DeckStorageAdapter] 获取牌组列表失败:', error);
      return [];
    }
  }

  /**
   * 根据ID获取牌组
   */
  async getDeckById(id: string): Promise<DeckInfo | null> {
    // 先检查缓存
    if (this.deckCache.has(id)) {
      return this.deckCache.get(id)!;
    }

    // 从所有牌组中查找
    const decks = await this.getDecks();
    return decks.find(d => d.id === id) || null;
  }

  /**
   * 根据名称获取牌组
   */
  async getDeckByName(name: string): Promise<DeckInfo | null> {
    const decks = await this.getDecks();
    return decks.find(d => d.name === name) || null;
  }

  /**
   * 创建新牌组
   */
  async createDeck(name: string, description?: string): Promise<DeckInfo> {
    try {
      const dataStorage = (this.plugin as any).dataStorage;
      if (!dataStorage || typeof dataStorage.createDeck !== 'function') {
        console.error('[DeckStorageAdapter] 创建牌组功能不可用');
        throw new Error('数据存储服务不支持创建牌组');
      }

      // 调用数据存储创建牌组
      const result = await dataStorage.createDeck({
        name,
        description: description || ''
      });

      if (result?.success && result.data) {
        const deck: DeckInfo = {
          id: result.data.id || result.data.deckId || this.generateDeckId(),
          name: result.data.name || name,
          description: result.data.description || description || ''
        };

        // 更新缓存
        this.deckCache.set(deck.id, deck);

        console.log(`[DeckStorageAdapter] ✅ 已创建牌组: ${deck.name} (${deck.id})`);
        return deck;
      }

      throw new Error('创建牌组失败');
    } catch (error) {
      console.error('[DeckStorageAdapter] 创建牌组失败:', error);
      
      // 创建临时牌组对象
      const tempDeck: DeckInfo = {
        id: this.generateDeckId(),
        name,
        description: description || ''
      };

      this.deckCache.set(tempDeck.id, tempDeck);
      return tempDeck;
    }
  }

  /**
   * 检查牌组是否存在
   */
  async deckExists(id: string): Promise<boolean> {
    const deck = await this.getDeckById(id);
    return deck !== null;
  }

  /**
   * 生成牌组ID
   */
  private generateDeckId(): string {
    return `deck_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.deckCache.clear();
  }
}

