/**
 * AI生成卡片转换为Tuanki标准卡片格式
 */

import type { GeneratedCard, CardConversionResult, GenerationConfig } from '../../types/ai-types';
import type { Card } from '../../data/types';
import { CardType } from '../../data/types';
import { generateId, generateUUID } from '../../utils/helpers';
import type { FSRS } from '../../algorithms/fsrs';
import { QACardParser } from '../../parsers/card-type-parsers/QACardParser';
import { ChoiceCardParser } from '../../parsers/card-type-parsers/ChoiceCardParser';
import { ClozeCardParser } from '../../parsers/card-type-parsers/ClozeCardParser';
import type { CardType as ParserCardType } from '../../parsers/MarkdownFieldsConverter';

export class CardConverter {
  /**
   * 将AI生成的卡片转换为Tuanki Card格式
   */
  static convert(
    generatedCard: GeneratedCard,
    deckId: string,
    sourceFile?: string,
    templates?: GenerationConfig['templates'],
    fsrs?: FSRS
  ): CardConversionResult {
    try {
      const now = new Date().toISOString();
      const uuid = generateUUID();
      
      // 构建卡片内容（合并前后内容）
      const content = `${generatedCard.front}\n---\n${generatedCard.back}`;
      
      // 根据题型确定使用的模板ID
      const templateId = this.getTemplateId(generatedCard.type, templates);
      
      // 使用新的解析器解析Markdown内容为fields
      const parseResult = this.parseCardContent(content, generatedCard.type);
      
      // 如果解析失败，使用降级方案
      let fields: Record<string, string>;
      let parsedMetadata: import('../../types/metadata-types').CardMetadata | undefined;
      
      if (parseResult.success) {
        fields = parseResult.fields;
        parsedMetadata = parseResult.metadata;
      } else {
        // 降级：使用简单的字段映射
        console.warn('[CardConverter] 解析失败，使用降级方案:', parseResult.error);
        fields = this.mapFieldsFromGeneratedCard(generatedCard);
        parsedMetadata = undefined;
      }
      
      const card: Card = {
        // 基础标识
        id: uuid,
        uuid: uuid,
        deckId,
        templateId: templateId,
        type: this.mapCardType(generatedCard.type),
        
        // 内容存储
        content: content,
        fields: fields,
        parsedMetadata: parsedMetadata, // 新增：保存解析后的元数据
        
        // 源文件信息
        sourceFile: sourceFile,
        sourceExists: !!sourceFile,
        
        // FSRS 数据 - 使用标准 FSRS 算法创建，确保数据结构一致
        fsrs: fsrs ? fsrs.createCard() : {
          // 降级方案：手动创建但使用正确的初始值
          due: new Date(Date.now() - 1000).toISOString(), // 稍早1秒，避免时间竞态
          stability: 0,
          difficulty: 5,  // 使用中等初始难度（FSRS 默认范围3-7）
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          state: 0, // New
          lastReview: undefined,  // 新卡片没有复习记录
          retrievability: 1
        },
        
        // 复习历史
        reviewHistory: [],
        
        // 统计信息
        stats: {
          totalReviews: 0,
          totalTime: 0,
          averageTime: 0,
          memoryRate: 0
        },
        
        // 时间戳
        created: now,
        modified: now,
        
        // 标签
        tags: generatedCard.tags || [],
        
        // 优先级和状态
        priority: 0,
        suspended: false,
        
        // AI生成元数据
        metadata: {
          aiGenerated: true,
          provider: generatedCard.metadata.provider,
          model: generatedCard.metadata.model,
          generatedAt: generatedCard.metadata.generatedAt
        }
      };

      // 选择题已包含在content和fields中，无需额外处理
      // front字段已包含完整的Markdown格式（Q: + 选项 + {✓}标记）
      // back字段是解析说明

      return {
        success: true,
        card
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '卡片转换失败'
      };
    }
  }

  /**
   * 批量转换
   */
  static convertBatch(
    generatedCards: GeneratedCard[],
    deckId: string,
    sourceFile?: string,
    templates?: GenerationConfig['templates'],
    fsrs?: FSRS
  ): { cards: Card[]; errors: string[] } {
    const cards: Card[] = [];
    const errors: string[] = [];

    for (const generatedCard of generatedCards) {
      const result = this.convert(generatedCard, deckId, sourceFile, templates, fsrs);
      
      if (result.success && result.card) {
        cards.push(result.card);
      } else if (result.error) {
        errors.push(result.error);
      }
    }

    return { cards, errors };
  }

  /**
   * 映射卡片类型
   */
  private static mapCardType(type: 'qa' | 'cloze' | 'choice'): CardType {
    switch (type) {
      case 'qa':
        return CardType.Basic;
      case 'cloze':
        return CardType.Cloze;
      case 'choice':
        return CardType.MultipleChoice;
      default:
        return CardType.Basic;
    }
  }

  /**
   * 获取模板ID
   * 始终返回有效的官方模板ID，不再使用'ai-generated'
   */
  private static getTemplateId(
    type: 'qa' | 'cloze' | 'choice',
    templates?: GenerationConfig['templates']
  ): string {
    // 如果提供了templates配置，优先使用指定的模板
    if (templates) {
      switch (type) {
        case 'qa':
          return templates.qa || 'official-qa';
        case 'choice':
          return templates.choice || 'official-choice';
        case 'cloze':
          return templates.cloze || 'official-cloze';
      }
    }
    
    // 降级策略：始终使用官方模板，确保模板ID有效
    switch (type) {
      case 'qa':
        return 'official-qa';
      case 'choice':
        return 'official-choice';
      case 'cloze':
        return 'official-cloze';
      default:
        return 'official-qa'; // 默认使用问答题模板
    }
  }

  /**
   * 从生成的卡片映射字段
   */
  private static mapFieldsFromGeneratedCard(card: GeneratedCard): Record<string, string> {
    switch (card.type) {
      case 'qa':
        return {
          front: card.front,
          back: card.back
        };
      case 'choice':
        // 选择题需要完整的字段结构用于Anki导出
        const fields: Record<string, string> = {
          front: card.front,  // 题目
          back: card.back     // 解析
        };
        
        // 从front中提取选项和正确答案
        const optionsMatch = card.front.match(/[A-D]\)[^\n]+/g);
        if (optionsMatch) {
          fields.options = optionsMatch.join('\n');
          
          // 提取正确答案（带{✓}标记的选项）
          const correctOptions = optionsMatch.filter(opt => opt.includes('{✓}') || opt.includes('{√}'));
          if (correctOptions.length > 0) {
            fields.correctAnswers = correctOptions.map(opt => opt.charAt(0)).join(',');
          }
        }
        
        return fields;
        
      case 'cloze':
        // 挖空题使用text字段（与模板一致）
        return {
          text: card.front,  // 挖空内容
          hint: card.back || ''  // 提示（如果有）
        };
        
      default:
        return {
          front: card.front,
          back: card.back
        };
    }
  }

  /**
   * 将GeneratedCard转换为Card类型（用于PreviewContainer预览）
   * 这是一个轻量级转换，只包含预览所需的最小字段
   */
  static convertForPreview(generatedCard: GeneratedCard): Card {
    const now = new Date().toISOString();
    const uuid = generateUUID();
    
    // 构建卡片内容
    const content = `${generatedCard.front}\n---\n${generatedCard.back}`;
    
    // 使用新的解析器解析Markdown内容为fields
    const parseResult = this.parseCardContent(content, generatedCard.type);
    
    // 如果解析失败，使用降级方案
    let fields: Record<string, string>;
    let parsedMetadata: import('../../types/metadata-types').CardMetadata | undefined;
    
    if (parseResult.success) {
      fields = parseResult.fields;
      parsedMetadata = parseResult.metadata;
    } else {
      // 降级：使用简单的字段映射
      console.warn('[CardConverter] 预览解析失败，使用降级方案:', parseResult.error);
      fields = this.mapFieldsFromGeneratedCard(generatedCard);
      parsedMetadata = undefined;
    }
    
    // 创建预览用Card（最小化必要字段）
    const card: Card = {
      // 基础标识
      id: uuid,
      uuid: uuid,
      deckId: 'preview-deck', // 临时牌组ID
      templateId: this.getDefaultTemplateId(generatedCard.type),
      type: this.mapCardType(generatedCard.type),
      
      // 内容存储
      content: content,
      fields: fields,
      parsedMetadata: parsedMetadata, // 新增：保存解析后的元数据
      
      // 源文件信息
      sourceFile: undefined,
      sourceExists: false,
      
      // 时间戳
      created: now,
      updated: now,
      
      // FSRS数据（预览不需要，使用默认值）
      fsrs: {
        state: 0,
        difficulty: 0,
        stability: 0,
        due: now,
        lastReview: undefined,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0
      },
      
      // 标签和元数据
      tags: [],
      metadata: {
        aiGenerated: true,
        provider: generatedCard.metadata?.provider || 'unknown',
        model: generatedCard.metadata?.model || 'unknown',
        generatedAt: generatedCard.metadata?.generatedAt || now
      }
    };
    
    return card;
  }
  
  /**
   * 解析卡片内容（使用新的Markdown解析器）
   */
  private static parseCardContent(
    content: string,
    type: 'qa' | 'cloze' | 'choice'
  ): import('../../types/metadata-types').ParseResult {
    const parserType = this.mapToParserCardType(type);
    
    try {
      switch (type) {
        case 'qa': {
          const parser = new QACardParser();
          return parser.parseMarkdownToFields(content, parserType);
        }
        case 'choice': {
          const parser = new ChoiceCardParser();
          return parser.parseMarkdownToFields(content, parserType);
        }
        case 'cloze': {
          const parser = new ClozeCardParser();
          return parser.parseMarkdownToFields(content, parserType);
        }
        default:
          // 降级：使用旧的映射方法
          return {
            success: false,
            fields: {},
            rawContent: content,
            error: {
              type: 'unknown_card_type' as any,
              message: `未知的卡片类型: ${type}`
            }
          };
      }
    } catch (error) {
      console.error('[CardConverter] 解析失败:', error);
      // 解析失败时返回失败结果
      return {
        success: false,
        fields: {},
        rawContent: content,
        error: {
          type: 'invalid_format' as any,
          message: error instanceof Error ? error.message : '解析失败'
        }
      };
    }
  }
  
  /**
   * 映射到解析器的CardType
   */
  private static mapToParserCardType(type: 'qa' | 'cloze' | 'choice'): ParserCardType {
    switch (type) {
      case 'qa':
        return 'basic-qa';
      case 'choice':
        return 'single-choice';
      case 'cloze':
        return 'cloze-deletion';
      default:
        return 'basic-qa';
    }
  }

  /**
   * 获取默认模板ID（用于预览）
   */
  private static getDefaultTemplateId(type: 'qa' | 'cloze' | 'choice'): string {
    switch (type) {
      case 'qa':
        return 'official-qa';
      case 'cloze':
        return 'official-cloze';
      case 'choice':
        return 'official-choice';
      default:
        return 'basic';
    }
  }
}

