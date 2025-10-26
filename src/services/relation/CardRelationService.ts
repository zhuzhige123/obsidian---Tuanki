/**
 * 卡片关系服务
 * 管理父子卡片关系、子卡片创建和保存
 */

import type { Card, Deck } from '../../data/types';
import type { AnkiDataStorage } from '../../data/storage';
import type {
  ChildCardData,
  DerivationMethod,
  CardRelationMetadata
} from './types';
import { generateId } from '../../utils/helpers';

export class CardRelationService {
  constructor(private dataStorage: AnkiDataStorage) {}
  
  /**
   * 批量创建子卡片
   * @param parentCard 父卡片
   * @param childCardsData 子卡片数据数组
   * @param method 派生方法
   * @returns 创建的子卡片数组
   */
  async createChildCards(
    parentCard: Card,
    childCardsData: ChildCardData[],
    method: DerivationMethod = DerivationMethod.AI_SPLIT
  ): Promise<Card[]> {
    const now = new Date().toISOString();
    const childCards: Card[] = [];
    
    for (let i = 0; i < childCardsData.length; i++) {
      const data = childCardsData[i];
      
      const childCard: Card = {
        id: generateId(),
        uuid: generateId(), // 生成UUID
        deckId: parentCard.deckId, // 临时设置为父卡片牌组，后续会移到子牌组
        templateId: parentCard.templateId,
        type: parentCard.type,
        content: data.content,
        fields: data.fields || {},
        tags: data.tags || parentCard.tags || [],
        sourceFile: parentCard.sourceFile,
        sourceBlock: parentCard.sourceBlock,
        sourceRange: parentCard.sourceRange,
        priority: data.priority || parentCard.priority || 0,
        fsrs: {
          due: now,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          state: 0, // CardState.New
          retrievability: 0
        },
        reviewHistory: [],
        stats: {
          totalReviews: 0,
          totalTime: 0,
          averageTime: 0,
          memoryRate: 0
        },
        created: now,
        modified: now,
        
        // 父子关系元数据
        parentCardId: parentCard.uuid, // 使用UUID而非ID
        relationMetadata: {
          isParent: false,
          level: 1,
          siblingIndex: i,
          derivationMetadata: {
            method,
            splitTimestamp: now,
            originalContentHash: this.hashContent(parentCard.content)
          },
          learningStrategy: {
            requireParentMastery: false,
            reviewTogether: false,
            inheritTags: true
          },
          relationStatus: {
            isSynced: true,
            lastSyncCheck: now
          }
        }
      };

      childCards.push(childCard);
    }

    // 更新父卡片的关系元数据
    if (!parentCard.relationMetadata) {
      parentCard.relationMetadata = {
        isParent: true,
        childCardIds: [],
        level: 0
      };
    }
    
    parentCard.relationMetadata.isParent = true;
    parentCard.relationMetadata.childCardIds = childCards.map(c => c.uuid);

    return childCards;
  }

  /**
   * 获取或创建子牌组
   * @param parentDeck 父牌组
   * @returns 子牌组
   */
  async getOrCreateChildDeck(parentDeck: Deck): Promise<Deck> {
    // 查找配对的子牌组
    const allDecks = await this.dataStorage.getAllDecks();
    
    // 检查是否已有配对的子牌组
    if (parentDeck.metadata?.pairedChildDeck) {
      const existingChildDeck = allDecks.find(d => d.id === parentDeck.metadata?.pairedChildDeck);
      if (existingChildDeck) {
        return existingChildDeck;
      }
    }

    // 创建新的子牌组
    const childDeckName = `${parentDeck.name} - 子卡片`;
    const childDeck: Deck = {
      id: generateId(),
      name: childDeckName,
      description: `${parentDeck.name}的子卡片牌组`,
      cards: [],
      createdAt: new Date().toISOString(),
      metadata: {
        pairedParentDeck: parentDeck.id,
        deckType: 'child' as any
      }
    };

    // 保存子牌组
    await this.dataStorage.saveDeck(childDeck);

    // 更新父牌组的配对信息
    parentDeck.metadata = parentDeck.metadata || {};
    parentDeck.metadata.pairedChildDeck = childDeck.id;
    await this.dataStorage.saveDeck(parentDeck);

    return childDeck;
  }

  /**
   * 将子卡片保存到子牌组
   * @param childCards 子卡片数组
   * @param parentCard 父卡片
   * @returns 保存成功的卡片数量
   */
  async saveChildCardsToDeck(childCards: Card[], parentCard: Card): Promise<number> {
    // 获取父卡片所在的牌组
    const allDecks = await this.dataStorage.getAllDecks();
    const parentDeck = allDecks.find(d => d.id === parentCard.deckId);
    
    if (!parentDeck) {
      throw new Error('找不到父卡片所在的牌组');
    }

    // 获取或创建子牌组
    const childDeck = await this.getOrCreateChildDeck(parentDeck);

    // 更新子卡片的牌组ID
    for (const childCard of childCards) {
      childCard.deckId = childDeck.id;
    }

    // 批量保存子卡片（逐个保存，因为 dataStorage 没有 saveCards 方法）
    for (const childCard of childCards) {
      await this.dataStorage.saveCard(childCard);
    }

    // 更新父卡片（保存关系元数据）
    await this.dataStorage.saveCard(parentCard);

    return childCards.length;
  }

  /**
   * 计算内容哈希（简单实现）
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}
