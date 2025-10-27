// Mock storage for import functionality when no storage is provided
import type { Card } from '../data/types';

export class MockStorage {
  private cards: Card[] = [];

  async saveCard(card: Card): Promise<void> {
    console.log('MockStorage: 保存卡片', card);
    
    // 检查卡片是否已存在
    const existingIndex = this.cards.findIndex(c => c.id === card.id);
    if (existingIndex >= 0) {
      this.cards[existingIndex] = card;
    } else {
      this.cards.push(card);
    }

    // 模拟异步操作
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const firstField = Object.values(card.fields)[0] || 'Unknown';
    console.log(`MockStorage: 成功保存卡片 "${firstField}"`);
  }

  async loadCards(): Promise<Card[]> {
    return [...this.cards];
  }

  async deleteCard(cardId: string): Promise<void> {
    this.cards = this.cards.filter(c => c.id !== cardId);
    console.log('MockStorage: 删除卡片', cardId);
  }

  async updateCard(cardId: string, updates: Partial<Card>): Promise<void> {
    const cardIndex = this.cards.findIndex(c => c.id === cardId);
    if (cardIndex >= 0) {
      this.cards[cardIndex] = { ...this.cards[cardIndex], ...updates };
      console.log('MockStorage: 更新卡片', cardId);
    }
  }

  getCardCount(): number {
    return this.cards.length;
  }
}

// 创建全局单例
export const mockStorage = new MockStorage();
