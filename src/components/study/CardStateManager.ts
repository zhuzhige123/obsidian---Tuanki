/**
 * 卡片状态管理器
 * 用于看板视图中的卡片状态更新和拖拽操作
 */

import type { Card, CardState, CardType, Deck } from "../../data/types";
import type { AnkiDataStorage } from "../../data/storage";

export interface CardStateUpdate {
  cardId: string;
  newState: CardState;
  oldState: CardState;
  timestamp: Date;
}

export interface CardGroupInfo {
  key: string;
  label: string;
  color: string;
  icon: string;
  cards: Card[];
  count: number;
  dueCount: number;
}

export class CardStateManager {
  private dataStorage: AnkiDataStorage;
  private updateHistory: CardStateUpdate[] = [];
  private decks: Deck[] = [];

  constructor(dataStorage: AnkiDataStorage) {
    this.dataStorage = dataStorage;
  }

  /**
   * 设置牌组列表（用于牌组名称映射）
   */
  setDecks(decks: Deck[]): void {
    this.decks = decks;
  }

  /**
   * 更新卡片状态
   */
  async updateCardState(cardId: string, newState: CardState): Promise<boolean> {
    try {
      const card = await this.dataStorage.getCard(cardId);
      if (!card) {
        console.error('卡片不存在:', cardId);
        return false;
      }

      const oldState = card.fsrs.state;
      
      // 更新卡片状态
      card.fsrs.state = newState;
      
      // 根据状态更新其他相关字段
      this.updateRelatedFields(card, newState);
      
      // 保存到数据存储
      await this.dataStorage.updateCard(card);
      
      // 记录更新历史
      this.updateHistory.push({
        cardId,
        newState,
        oldState,
        timestamp: new Date()
      });

      console.log(`卡片 ${cardId} 状态从 ${oldState} 更新为 ${newState}`);
      return true;
    } catch (error) {
      console.error('更新卡片状态失败:', error);
      return false;
    }
  }

  /**
   * 批量更新卡片状态
   */
  async batchUpdateCardStates(updates: Array<{cardId: string, newState: CardState}>): Promise<boolean[]> {
    const results = await Promise.all(
      updates.map(update => this.updateCardState(update.cardId, update.newState))
    );
    return results;
  }

  /**
   * 根据状态更新相关字段
   */
  private updateRelatedFields(card: Card, newState: CardState): void {
    const now = new Date();
    
    switch (newState) {
      case 0: // 新卡片
        card.fsrs.due = now;
        card.fsrs.stability = 0;
        card.fsrs.difficulty = 5; // 默认难度
        card.fsrs.elapsed_days = 0;
        card.fsrs.scheduled_days = 0;
        card.fsrs.reps = 0;
        card.fsrs.lapses = 0;
        break;
        
      case 1: // 学习中
        card.fsrs.due = new Date(now.getTime() + 10 * 60 * 1000); // 10分钟后
        card.fsrs.scheduled_days = 0;
        break;
        
      case 2: // 复习
        if (card.fsrs.stability > 0) {
          const nextReviewDays = Math.max(1, Math.round(card.fsrs.stability));
          card.fsrs.due = new Date(now.getTime() + nextReviewDays * 24 * 60 * 60 * 1000);
          card.fsrs.scheduled_days = nextReviewDays;
        } else {
          card.fsrs.due = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1天后
          card.fsrs.scheduled_days = 1;
        }
        break;
        
      case 3: // 重新学习
        card.fsrs.due = now;
        card.fsrs.lapses = (card.fsrs.lapses || 0) + 1;
        card.fsrs.scheduled_days = 0;
        break;
    }
    
    card.fsrs.last_review = now;
  }

  /**
   * 获取状态分组信息
   */
  getStateGroups(): CardGroupInfo[] {
    return [
      {
        key: '0',
        label: '新卡片',
        color: '#6b7280',
        icon: 'plus-circle',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: '1',
        label: '学习中',
        color: '#3b82f6',
        icon: 'book-open',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: '2',
        label: '复习',
        color: '#10b981',
        icon: 'refresh-cw',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: '3',
        label: '重新学习',
        color: '#f59e0b',
        icon: 'rotate-ccw',
        cards: [],
        count: 0,
        dueCount: 0
      }
    ];
  }

  /**
   * 获取题型分组信息
   */
  getTypeGroups(): CardGroupInfo[] {
    return [
      {
        key: 'basic',
        label: '基础问答',
        color: 'var(--interactive-accent)',
        icon: 'message-circle',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: 'cloze',
        label: '挖空填词',
        color: '#ec4899',
        icon: 'edit-3',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: 'multiple',
        label: '多选题',
        color: '#06b6d4',
        icon: 'check-square',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: 'code',
        label: '代码题',
        color: '#84cc16',
        icon: 'code',
        cards: [],
        count: 0,
        dueCount: 0
      }
    ];
  }

  /**
   * 获取优先级分组信息
   */
  getPriorityGroups(): CardGroupInfo[] {
    return [
      {
        key: '4',
        label: '高优先级',
        color: '#ef4444',
        icon: 'alert-triangle',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: '3',
        label: '中优先级',
        color: '#f59e0b',
        icon: 'flag',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: '2',
        label: '低优先级',
        color: '#10b981',
        icon: 'minus-circle',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: '1',
        label: '无优先级',
        color: '#6b7280',
        icon: 'circle',
        cards: [],
        count: 0,
        dueCount: 0
      }
    ];
  }

  /**
   * 获取牌组分组信息
   */
  getDeckGroups(cards: Card[]): CardGroupInfo[] {
    // 从卡片中提取所有唯一的牌组
    const deckIds = new Set<string>();
    cards.forEach(card => {
      if (card.deckId) {
        deckIds.add(card.deckId);
      }
    });

    // 创建 deckId -> Deck 映射
    const deckMap = new Map<string, Deck>();
    this.decks.forEach(deck => {
      deckMap.set(deck.id, deck);
    });

    // 为每个牌组创建分组信息
    const deckGroups: CardGroupInfo[] = [];
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', 'var(--interactive-accent)', '#06b6d4'];
    let colorIndex = 0;

    deckIds.forEach(deckId => {
      const deck = deckMap.get(deckId);
      const deckName = deck?.name ?? deckId; // 使用牌组名称，找不到时fallback到ID
      
      deckGroups.push({
        key: deckId,
        label: deckName,
        color: colors[colorIndex % colors.length],
        icon: 'layers',
        cards: [],
        count: 0,
        dueCount: 0
      });
      colorIndex++;
    });

    // 添加"无牌组"分组
    deckGroups.push({
      key: '_none',
      label: '无牌组',
      color: '#6b7280',
      icon: 'inbox',
      cards: [],
      count: 0,
      dueCount: 0
    });

    return deckGroups;
  }

  /**
   * 获取创建时间分组信息
   */
  getCreateTimeGroups(): CardGroupInfo[] {
    return [
      {
        key: 'today',
        label: '今天',
        color: '#3b82f6',
        icon: 'calendar',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: 'yesterday',
        label: '昨天',
        color: '#10b981',
        icon: 'calendar',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: 'last7days',
        label: '过去7天',
        color: '#f59e0b',
        icon: 'calendar',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: 'last30days',
        label: '过去30天',
        color: '#ec4899',
        icon: 'calendar',
        cards: [],
        count: 0,
        dueCount: 0
      },
      {
        key: 'earlier',
        label: '更早',
        color: '#6b7280',
        icon: 'calendar',
        cards: [],
        count: 0,
        dueCount: 0
      }
    ];
  }

  /**
   * 将卡片分组到指定的分组中
   */
  groupCards(cards: Card[], groupBy: 'status' | 'type' | 'priority' | 'deck' | 'createTime'): Record<string, Card[]> {
    const groups: Record<string, Card[]> = {};
    let groupInfos: CardGroupInfo[];

    switch (groupBy) {
      case 'status':
        groupInfos = this.getStateGroups();
        break;
      case 'type':
        groupInfos = this.getTypeGroups();
        break;
      case 'priority':
        groupInfos = this.getPriorityGroups();
        break;
      case 'deck':
        groupInfos = this.getDeckGroups(cards);
        break;
      case 'createTime':
        groupInfos = this.getCreateTimeGroups();
        break;
      default:
        groupInfos = this.getStateGroups();
    }

    // 初始化所有分组
    groupInfos.forEach(group => {
      groups[group.key] = [];
    });

    // 将卡片分配到对应分组
    cards.forEach(card => {
      let groupKey: string;
      
      switch (groupBy) {
        case 'status':
          groupKey = card.fsrs.state.toString();
          break;
        case 'type':
          groupKey = card.type;
          break;
        case 'priority':
          groupKey = (card.priority || 1).toString();
          break;
        case 'deck':
          groupKey = card.deckId || '_none';
          break;
        case 'createTime':
          groupKey = this.getTimeGroupKey(card.created);
          break;
        default:
          groupKey = '0';
      }
      
      if (groups[groupKey]) {
        groups[groupKey].push(card);
      }
    });

    return groups;
  }

  /**
   * 根据创建时间获取分组key
   */
  private getTimeGroupKey(created: string): string {
    const now = new Date();
    const createTime = new Date(created);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const last7days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (createTime >= today) {
      return 'today';
    } else if (createTime >= yesterday) {
      return 'yesterday';
    } else if (createTime >= last7days) {
      return 'last7days';
    } else if (createTime >= last30days) {
      return 'last30days';
    } else {
      return 'earlier';
    }
  }

  /**
   * 检查卡片是否到期
   */
  isCardDue(card: Card): boolean {
    const now = new Date();
    const dueDate = new Date(card.fsrs.due);
    return dueDate <= now;
  }

  /**
   * 获取分组统计信息
   */
  getGroupStats(cards: Card[], groupKey: string, groupBy: 'status' | 'type' | 'priority'): {
    total: number;
    due: number;
    new: number;
    learning: number;
    review: number;
  } {
    const groupCards = cards.filter(card => {
      switch (groupBy) {
        case 'status':
          return card.fsrs.state.toString() === groupKey;
        case 'type':
          return card.type === groupKey;
        case 'priority':
          return (card.priority || 1).toString() === groupKey;
        default:
          return false;
      }
    });

    const total = groupCards.length;
    const due = groupCards.filter(card => this.isCardDue(card)).length;
    const newCards = groupCards.filter(card => card.fsrs.state === 0).length;
    const learning = groupCards.filter(card => card.fsrs.state === 1).length;
    const review = groupCards.filter(card => card.fsrs.state === 2).length;

    return {
      total,
      due,
      new: newCards,
      learning,
      review
    };
  }

  /**
   * 获取更新历史
   */
  getUpdateHistory(): CardStateUpdate[] {
    return [...this.updateHistory];
  }

  /**
   * 清除更新历史
   */
  clearUpdateHistory(): void {
    this.updateHistory = [];
  }

  /**
   * 撤销最后一次状态更新
   */
  async undoLastUpdate(): Promise<boolean> {
    const lastUpdate = this.updateHistory.pop();
    if (!lastUpdate) {
      return false;
    }

    try {
      await this.updateCardState(lastUpdate.cardId, lastUpdate.oldState);
      // 移除撤销操作产生的历史记录
      this.updateHistory.pop();
      return true;
    } catch (error) {
      console.error('撤销状态更新失败:', error);
      // 恢复历史记录
      this.updateHistory.push(lastUpdate);
      return false;
    }
  }
}
