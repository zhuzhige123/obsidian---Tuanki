/**
 * 牌组层级管理服务
 * 实现牌组的层级结构管理，支持子牌组、移动、重命名等操作
 */

import type { Deck, DeckStats, DeckSettings } from '../../data/types';
import type { AnkiDataStorage } from '../../data/storage';

export interface DeckTreeNode {
  deck: Deck;
  children: DeckTreeNode[];
}

/**
 * 牌组层级管理服务
 * 
 * 核心功能：
 * - 创建根牌组和子牌组
 * - 移动牌组到新父级
 * - 重命名牌组（自动更新子牌组路径）
 * - 获取牌组树
 * - 获取牌组后代和面包屑路径
 */
export class DeckHierarchyService {
  private storage: AnkiDataStorage;

  constructor(storage: AnkiDataStorage) {
    this.storage = storage;
  }

  /**
   * 创建根牌组
   */
  async createRootDeck(name: string, settings?: Partial<DeckSettings>): Promise<Deck> {
    const now = new Date().toISOString();
    const profile = await this.storage.getUserProfile();
    
    const deck: Deck = {
      id: this.generateDeckId(),
      name,
      description: '',
      category: '默认',
      
      // 层级结构
      parentId: undefined,
      path: name,
      level: 0,
      order: await this.getNextOrder(null),
      
      // 设置
      inheritSettings: false,
      settings: settings 
        ? { ...profile.globalSettings.defaultDeckSettings, ...settings }
        : profile.globalSettings.defaultDeckSettings,
      
      // 统计
      stats: this.createEmptyStats(),
      includeSubdecks: false,
      
      // 牌组类型
      deckType: 'mixed',
      
      // 时间戳
      created: now,
      modified: now,
      
      // 元数据
      tags: [],
      metadata: {}
    };

    await this.storage.saveDeck(deck);
    console.log(`✅ Created root deck: ${deck.path}`);
    return deck;
  }

  /**
   * 创建子牌组
   */
  async createSubdeck(parentId: string, name: string): Promise<Deck> {
    const parent = await this.storage.getDeck(parentId);
    if (!parent) {
      throw new Error(`Parent deck not found: ${parentId}`);
    }

    const now = new Date().toISOString();
    const subdeck: Deck = {
      id: this.generateDeckId(),
      name,
      description: '',
      category: parent.category,
      
      // 层级结构
      parentId,
      path: `${parent.path}::${name}`,
      level: parent.level + 1,
      order: await this.getNextOrder(parentId),
      
      // 设置继承
      inheritSettings: true,
      settings: parent.inheritSettings 
        ? parent.settings 
        : { ...parent.settings },
      
      // 统计
      stats: this.createEmptyStats(),
      includeSubdecks: false,
      
      // 视觉元素（继承父牌组）
      icon: parent.icon,
      color: parent.color,
      
      // 牌组类型（继承父牌组）
      deckType: parent.deckType || 'mixed',
      
      // 时间戳
      created: now,
      modified: now,
      
      // 元数据
      tags: [],
      metadata: {}
    };

    await this.storage.saveDeck(subdeck);
    console.log(`✅ Created subdeck: ${subdeck.path}`);
    return subdeck;
  }

  /**
   * 移动牌组到新父级
   */
  async moveDeck(deckId: string, newParentId: string | null): Promise<void> {
    const deck = await this.storage.getDeck(deckId);
    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }

    // 检查循环引用
    if (newParentId && await this.isDescendant(newParentId, deckId)) {
      throw new Error('Cannot move deck to its own descendant');
    }

    const oldPath = deck.path;

    // 更新deck
    if (newParentId) {
      const newParent = await this.storage.getDeck(newParentId);
      if (!newParent) {
        throw new Error(`Parent deck not found: ${newParentId}`);
      }
      
      deck.parentId = newParentId;
      deck.path = `${newParent.path}::${deck.name}`;
      deck.level = newParent.level + 1;
    } else {
      // 移动到根级
      deck.parentId = undefined;
      deck.path = deck.name;
      deck.level = 0;
    }

    deck.order = await this.getNextOrder(newParentId);
    deck.modified = new Date().toISOString();
    await this.storage.saveDeck(deck);

    // 递归更新所有子牌组的path
    await this.updateChildrenPaths(deckId, oldPath, deck.path);

    console.log(`✅ Moved deck from ${oldPath} to ${deck.path}`);
  }

  /**
   * 重命名牌组
   */
  async renameDeck(deckId: string, newName: string): Promise<void> {
    const deck = await this.storage.getDeck(deckId);
    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }

    const oldPath = deck.path;
    const oldName = deck.name;
    deck.name = newName;

    // 更新path
    if (deck.parentId) {
      const parent = await this.storage.getDeck(deck.parentId);
      if (parent) {
        deck.path = `${parent.path}::${newName}`;
      }
    } else {
      deck.path = newName;
    }

    deck.modified = new Date().toISOString();
    await this.storage.saveDeck(deck);

    // 递归更新子牌组path
    await this.updateChildrenPaths(deckId, oldPath, deck.path);

    console.log(`✅ Renamed deck from "${oldName}" to "${newName}"`);
  }

  /**
   * 删除牌组（同时删除所有子牌组）
   */
  async deleteDeckWithChildren(deckId: string): Promise<void> {
    // 获取所有子孙牌组
    const descendants = await this.getDescendants(deckId);
    
    // 删除所有子孙（从叶子节点开始）
    const sortedDescendants = descendants.sort((a, b) => b.level - a.level);
    for (const child of sortedDescendants) {
      await this.storage.deleteDeck(child.id);
    }
    
    // 删除自己
    await this.storage.deleteDeck(deckId);
    
    console.log(`✅ Deleted deck and ${descendants.length} descendants`);
  }

  /**
   * 获取牌组树
   */
  async getDeckTree(): Promise<DeckTreeNode[]> {
    const allDecks = await this.storage.getDecks();
    const roots = allDecks.filter(d => !d.parentId);
    
    // 按order排序
    roots.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    return roots.map(d => this.buildTreeNode(d, allDecks));
  }

  /**
   * 获取牌组的所有子孙
   */
  async getDescendants(deckId: string): Promise<Deck[]> {
    const allDecks = await this.storage.getDecks();
    const deck = allDecks.find(d => d.id === deckId);
    if (!deck) return [];

    const descendants: Deck[] = [];
    
    const collect = (parentPath: string) => {
      const children = allDecks.filter(d => 
        d.parentId && d.path.startsWith(parentPath + '::')
      );
      
      for (const child of children) {
        descendants.push(child);
        collect(child.path);
      }
    };

    collect(deck.path);
    return descendants;
  }

  /**
   * 获取面包屑路径
   */
  async getBreadcrumb(deckId: string): Promise<Deck[]> {
    const breadcrumb: Deck[] = [];
    let current = await this.storage.getDeck(deckId);
    
    while (current) {
      breadcrumb.unshift(current);
      
      if (current.parentId) {
        current = await this.storage.getDeck(current.parentId);
      } else {
        break;
      }
    }

    return breadcrumb;
  }

  /**
   * 获取子牌组列表
   */
  async getChildren(deckId: string): Promise<Deck[]> {
    const allDecks = await this.storage.getDecks();
    const children = allDecks.filter(d => d.parentId === deckId);
    
    // 按order排序
    children.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    return children;
  }

  /**
   * 更新牌组排序
   */
  async updateOrder(deckId: string, newOrder: number): Promise<void> {
    const deck = await this.storage.getDeck(deckId);
    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }

    deck.order = newOrder;
    deck.modified = new Date().toISOString();
    await this.storage.saveDeck(deck);
  }

  /**
   * 重新排序同级牌组
   */
  async reorderSiblings(parentId: string | null, orderedDeckIds: string[]): Promise<void> {
    for (let i = 0; i < orderedDeckIds.length; i++) {
      await this.updateOrder(orderedDeckIds[i], i);
    }
  }

  // ===== 私有辅助方法 =====

  /**
   * 递归更新子牌组路径
   */
  private async updateChildrenPaths(
    parentId: string,
    oldParentPath: string,
    newParentPath: string
  ): Promise<void> {
    const allDecks = await this.storage.getDecks();
    const children = allDecks.filter(d => d.parentId === parentId);

    for (const child of children) {
      const oldChildPath = child.path;
      child.path = child.path.replace(oldParentPath, newParentPath);
      child.modified = new Date().toISOString();
      await this.storage.saveDeck(child);

      // 递归更新子牌组的子牌组
      await this.updateChildrenPaths(child.id, oldChildPath, child.path);
    }
  }

  /**
   * 构建树节点
   */
  private buildTreeNode(deck: Deck, allDecks: Deck[]): DeckTreeNode {
    const children = allDecks
      .filter(d => d.parentId === deck.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(d => this.buildTreeNode(d, allDecks));

    return { deck, children };
  }

  /**
   * 检查是否是后代
   */
  private async isDescendant(ancestorId: string, descendantId: string): Promise<boolean> {
    const allDecks = await this.storage.getDecks();
    let current = allDecks.find(d => d.id === descendantId);

    while (current?.parentId) {
      if (current.parentId === ancestorId) {
        return true;
      }
      current = allDecks.find(d => d.id === current!.parentId);
    }

    return false;
  }

  /**
   * 获取下一个排序号
   */
  private async getNextOrder(parentId: string | null): Promise<number> {
    const allDecks = await this.storage.getDecks();
    const siblings = allDecks.filter(d => d.parentId === parentId);
    
    if (siblings.length === 0) {
      return 0;
    }
    
    const maxOrder = Math.max(...siblings.map(d => d.order || 0));
    return maxOrder + 1;
  }

  /**
   * 生成牌组ID
   */
  private generateDeckId(): string {
    return `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 创建空统计对象
   */
  private createEmptyStats(): DeckStats {
    return {
      totalCards: 0,
      newCards: 0,
      learningCards: 0,
      reviewCards: 0,
      todayNew: 0,
      todayReview: 0,
      todayTime: 0,
      totalReviews: 0,
      totalTime: 0,
      memoryRate: 0,
      averageEase: 0,
      forecastDays: {}
    };
  }
}



