/**
 * FSRS6 数据存储适配器
 * 处理FSRS6数据的序列化、反序列化和版本迁移
 */

import type { Card, FSRSCard } from "./types";
import type { FSRS6Card, PersonalizationData } from "../types/fsrs6-types";
import { FSRS6_DEFAULTS, FSRS6Error } from "../types/fsrs6-types";

/**
 * FSRS6 存储适配器类
 */
export class FSRS6StorageAdapter {
  private static readonly CURRENT_VERSION = '6.1.1';
  private static readonly STORAGE_VERSION_KEY = 'fsrs6_storage_version';

  /**
   * 序列化FSRS6卡片数据为JSON格式
   */
  static serializeFSRS6Card(card: FSRS6Card): string {
    try {
      const serializedCard = {
        ...card,
        version: this.CURRENT_VERSION,
        serializedAt: new Date().toISOString()
      };

      return JSON.stringify(serializedCard, null, 2);
    } catch (error) {
      throw new FSRS6Error(
        `Failed to serialize FSRS6 card: ${error.message}`,
        'SERIALIZATION_ERROR',
        { cardId: card.due }
      );
    }
  }

  /**
   * 反序列化JSON数据为FSRS6卡片
   */
  static deserializeFSRS6Card(jsonData: string): FSRS6Card {
    try {
      const data = JSON.parse(jsonData);
      
      // 验证数据完整性
      this.validateCardData(data);
      
      // 处理版本兼容性
      if (data.version !== this.CURRENT_VERSION) {
        return this.migrateCardData(data);
      }

      return data as FSRS6Card;
    } catch (error) {
      throw new FSRS6Error(
        `Failed to deserialize FSRS6 card: ${error.message}`,
        'DESERIALIZATION_ERROR',
        { jsonData: jsonData.substring(0, 100) }
      );
    }
  }

  /**
   * 批量序列化卡片数据
   */
  static serializeCardBatch(cards: FSRS6Card[]): string {
    try {
      const batchData = {
        version: this.CURRENT_VERSION,
        count: cards.length,
        serializedAt: new Date().toISOString(),
        cards: cards.map(card => ({
          ...card,
          // 压缩复习历史以节省空间
          reviewHistory: this.compressReviewHistory(card)
        }))
      };

      return JSON.stringify(batchData);
    } catch (error) {
      throw new FSRS6Error(
        `Failed to serialize card batch: ${error.message}`,
        'BATCH_SERIALIZATION_ERROR',
        { cardCount: cards.length }
      );
    }
  }

  /**
   * 批量反序列化卡片数据
   */
  static deserializeCardBatch(jsonData: string): FSRS6Card[] {
    try {
      const batchData = JSON.parse(jsonData);
      
      if (!batchData.cards || !Array.isArray(batchData.cards)) {
        throw new Error('Invalid batch data format');
      }

      return batchData.cards.map((cardData: any) => {
        // 解压复习历史
        const card = this.decompressReviewHistory(cardData);
        return this.deserializeFSRS6Card(JSON.stringify(card));
      });
    } catch (error) {
      throw new FSRS6Error(
        `Failed to deserialize card batch: ${error.message}`,
        'BATCH_DESERIALIZATION_ERROR',
        { jsonData: jsonData.substring(0, 100) }
      );
    }
  }

  /**
   * 序列化个性化数据
   */
  static serializePersonalizationData(data: PersonalizationData): string {
    try {
      const serializedData = {
        ...data,
        version: this.CURRENT_VERSION,
        serializedAt: new Date().toISOString()
      };

      return JSON.stringify(serializedData, null, 2);
    } catch (error) {
      throw new FSRS6Error(
        `Failed to serialize personalization data: ${error.message}`,
        'PERSONALIZATION_SERIALIZATION_ERROR',
        { userId: data.userId }
      );
    }
  }

  /**
   * 反序列化个性化数据
   */
  static deserializePersonalizationData(jsonData: string): PersonalizationData {
    try {
      const data = JSON.parse(jsonData);
      
      // 验证个性化数据完整性
      this.validatePersonalizationData(data);
      
      return data as PersonalizationData;
    } catch (error) {
      throw new FSRS6Error(
        `Failed to deserialize personalization data: ${error.message}`,
        'PERSONALIZATION_DESERIALIZATION_ERROR',
        { jsonData: jsonData.substring(0, 100) }
      );
    }
  }

  /**
   * 数据迁移：从旧版本格式迁移到FSRS6
   */
  static migrateCardData(oldData: any): FSRS6Card {
    try {
      // 检测数据版本
      const sourceVersion = oldData.version || 'unknown';
      
      let migratedCard: FSRS6Card;

      switch (sourceVersion) {
        case 'unknown':
        case '5.0':
        case '5.1':
          migratedCard = this.migrateFromFSRS5(oldData);
          break;
        case '6.0':
        case '6.1.0':
          migratedCard = this.migrateFromEarlierFSRS6(oldData);
          break;
        default:
          throw new Error(`Unsupported source version: ${sourceVersion}`);
      }

      // 验证迁移结果
      this.validateCardData(migratedCard);
      
      return migratedCard;
    } catch (error) {
      throw new FSRS6Error(
        `Failed to migrate card data: ${error.message}`,
        'MIGRATION_ERROR',
        { sourceVersion: oldData.version, cardId: oldData.id }
      );
    }
  }

  /**
   * 从FSRS5格式迁移
   */
  private static migrateFromFSRS5(fsrs5Data: any): FSRS6Card {
    // 扩展17参数到21参数
    const extendedWeights = fsrs5Data.personalizedWeights || [];
    while (extendedWeights.length < 21) {
      extendedWeights.push(FSRS6_DEFAULTS.DEFAULT_WEIGHTS[extendedWeights.length]);
    }

    return {
      ...fsrs5Data,
      version: '6.1.1',
      personalizedWeights: extendedWeights,
      shortTermMemoryFactor: 1.0,
      longTermStabilityFactor: 1.0,
      memoryPrediction: undefined
    };
  }

  /**
   * 从早期FSRS6版本迁移
   */
  private static migrateFromEarlierFSRS6(fsrs6Data: any): FSRS6Card {
    return {
      ...fsrs6Data,
      version: '6.1.1',
      shortTermMemoryFactor: fsrs6Data.shortTermMemoryFactor || 1.0,
      longTermStabilityFactor: fsrs6Data.longTermStabilityFactor || 1.0
    };
  }

  /**
   * 验证卡片数据完整性
   */
  private static validateCardData(data: any): void {
    const requiredFields = [
      'due', 'stability', 'difficulty', 'elapsedDays', 
      'scheduledDays', 'reps', 'lapses', 'state'
    ];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // 验证数值范围
    if (data.stability < 0 || data.difficulty < 1 || data.difficulty > 10) {
      throw new Error('Invalid card parameter values');
    }
  }

  /**
   * 验证个性化数据完整性
   */
  private static validatePersonalizationData(data: any): void {
    const requiredFields = ['userId', 'dataPoints', 'personalizedWeights'];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Missing required personalization field: ${field}`);
      }
    }

    if (!Array.isArray(data.personalizedWeights) || data.personalizedWeights.length !== 21) {
      throw new Error('Invalid personalized weights format');
    }
  }

  /**
   * 压缩复习历史以节省存储空间
   */
  private static compressReviewHistory(card: FSRS6Card): any {
    // 简化实现：保留最近50次复习记录
    const maxHistory = 50;
    
    if (card.reviewHistory && card.reviewHistory.length > maxHistory) {
      return {
        ...card,
        reviewHistory: card.reviewHistory.slice(-maxHistory),
        compressedHistory: true,
        originalHistoryLength: card.reviewHistory.length
      };
    }

    return card;
  }

  /**
   * 解压复习历史
   */
  private static decompressReviewHistory(cardData: any): any {
    if (cardData.compressedHistory) {
      // 标记历史已被压缩，但保持数据完整性
      return {
        ...cardData,
        reviewHistory: cardData.reviewHistory || [],
        historyCompressed: true
      };
    }

    return cardData;
  }

  /**
   * 数据完整性检查
   */
  static validateDataIntegrity(cards: FSRS6Card[]): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const card of cards) {
      try {
        this.validateCardData(card);
      } catch (error) {
        errors.push(`Card validation failed: ${error.message}`);
      }

      // 检查数据一致性
      if (card.reps < card.lapses) {
        warnings.push(`Card has more lapses than reviews: ${card.due}`);
      }

      if (card.stability <= 0 && card.state !== 'New') {
        warnings.push(`Non-new card has zero stability: ${card.due}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 获取存储统计信息
   */
  static getStorageStats(cards: FSRS6Card[]): {
    totalCards: number;
    averageStability: number;
    averageDifficulty: number;
    totalReviews: number;
    compressionRatio: number;
  } {
    if (cards.length === 0) {
      return {
        totalCards: 0,
        averageStability: 0,
        averageDifficulty: 0,
        totalReviews: 0,
        compressionRatio: 0
      };
    }

    const totalStability = cards.reduce((sum, card) => sum + card.stability, 0);
    const totalDifficulty = cards.reduce((sum, card) => sum + card.difficulty, 0);
    const totalReviews = cards.reduce((sum, card) => sum + card.reps, 0);

    // 计算压缩比率
    const originalSize = JSON.stringify(cards).length;
    const compressedSize = this.serializeCardBatch(cards).length;
    const compressionRatio = compressedSize / originalSize;

    return {
      totalCards: cards.length,
      averageStability: totalStability / cards.length,
      averageDifficulty: totalDifficulty / cards.length,
      totalReviews,
      compressionRatio
    };
  }
}
