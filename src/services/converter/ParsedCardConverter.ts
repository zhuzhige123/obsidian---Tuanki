/**
 * ParsedCard 到 Card 的转换器
 * 负责将解析后的卡片转换为数据库可存储的格式
 */

import { FSRS } from '../../algorithms/fsrs';
import type { Card } from '../../types/card-types';
import type { ParsedCard, CardType } from '../../types/newCardParsingTypes';
import type {
  ConversionOptions,
  ConversionResult,
  BatchConversionResult
} from '../../types/converter-types';

/**
 * 卡片转换器
 */
export class ParsedCardConverter {
  private fsrs: FSRS;
  private app: any;

  constructor(app: any, fsrs: FSRS) {
    this.app = app;
    this.fsrs = fsrs;
  }

  /**
   * 将单个 ParsedCard 转换为 Card
   */
  convertToCard(
    parsedCard: ParsedCard,
    options: ConversionOptions
  ): ConversionResult {
    try {
      // 1. 生成或使用现有ID
      const cardId = parsedCard.id || this.generateCardId();

      // 2. 推断模板ID
      const templateId = this.inferTemplate(parsedCard, options);

      // 3. 构建 fields 字段
      const fields: Record<string, string> = {
        front: parsedCard.front,
        back: parsedCard.back,
        ...parsedCard.fields  // 合并额外字段
      };

      // 4. 合并标签
      const tags = [
        ...parsedCard.tags,
        ...(options.additionalTags || [])
      ];

      // 5. 初始化 FSRS 数据
      const fsrsData = this.fsrs.createCard();

      // 6. 生成时间戳
      const now = new Date().toISOString();

      // 7. 构建 Card 对象
      const card: Card = {
        id: cardId,
        deckId: options.deckId,
        templateId: templateId,
        fields: fields,
        type: parsedCard.type,
        tags: tags,
        
        // 时间戳
        created: now,
        lastModified: now,
        
        // FSRS 数据
        fsrs: fsrsData,
        
        // 其他属性
        priority: options.priority ?? 0,
        suspended: options.suspended ?? false,
        
        // 元数据
        metadata: parsedCard.metadata
      };

      // 8. 保留源文件信息（如果启用）
      if (options.preserveSourceInfo !== false) {
        if (parsedCard.sourceFile) {
          card.sourceFile = parsedCard.sourceFile;
        }
        if (parsedCard.sourceBlock) {
          card.sourcePosition = {
            filePath: parsedCard.sourceFile || '',
            blockId: parsedCard.sourceBlock
          };
        }
      }

      return {
        success: true,
        card: card
      };

    } catch (error) {
      console.error('[ParsedCardConverter] 转换失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知转换错误'
      };
    }
  }

  /**
   * 批量转换 ParsedCard 到 Card
   */
  convertBatch(
    parsedCards: ParsedCard[],
    options: ConversionOptions
  ): BatchConversionResult {
    const cards: Card[] = [];
    const errors: BatchConversionResult['errors'] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < parsedCards.length; i++) {
      const parsedCard = parsedCards[i];
      const result = this.convertToCard(parsedCard, options);

      if (result.success && result.card) {
        cards.push(result.card);
        successCount++;
      } else {
        errors.push({
          index: i,
          cardId: parsedCard.id,
          error: result.error || '未知错误'
        });
        failureCount++;
      }
    }

    return {
      success: failureCount === 0,
      successCount,
      failureCount,
      cards,
      errors
    };
  }

  /**
   * 推断模板ID
   */
  private inferTemplate(
    parsedCard: ParsedCard,
    options: ConversionOptions
  ): string {
    // 1. 优先使用指定的模板
    if (options.templateId) {
      return options.templateId;
    }

    // 2. 优先使用卡片自带的模板
    if (parsedCard.template) {
      return parsedCard.template;
    }

    // 3. 根据卡片类型推断默认模板
    const defaultTemplates: Record<CardType, string> = {
      'qa': 'official-qa',
      'cloze': 'official-cloze',
      'mcq': 'official-mcq'
    };

    return defaultTemplates[parsedCard.type] || 'official-qa';
  }

  /**
   * 生成唯一的卡片ID
   */
  private generateCardId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `card_${timestamp}_${random}`;
  }
}



