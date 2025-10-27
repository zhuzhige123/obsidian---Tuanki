/**
 * 卡片构建器
 * 
 * 负责将Anki笔记转换为Tuanki卡片格式
 * 
 * @module domain/apkg/builder
 */

import type { Card } from '../../../data/types';
import { CardType } from '../../../data/types';
import type {
  CardBuildParams,
  CardBuildResult,
  AnkiNote,
  AnkiModel
} from '../types';
import { ContentConverter } from '../converter/ContentConverter';
import { APKGLogger } from '../../../infrastructure/logger/APKGLogger';
import { generateId } from '../../../utils/helpers';

/**
 * 卡片构建器
 */
export class CardBuilder {
  private logger: APKGLogger;
  private converter: ContentConverter;

  constructor() {
    this.logger = new APKGLogger({ prefix: '[CardBuilder]' });
    this.converter = new ContentConverter();
  }

  /**
   * 构建Tuanki卡片
   * 
   * @param params - 构建参数
   * @returns 构建结果
   */
  build(params: CardBuildParams): CardBuildResult {
    const warnings: string[] = [];
    
    try {
      this.logger.debug(`构建卡片: 笔记${params.note.id}`);
      
      // 1. 解析字段值
      const fields = this.parseFields(params.note, params.model);
      
      // 2. 分类字段（按显示面）
      const { frontFields, backFields, bothFields } = this.classifyFields(
        fields,
        params.fieldSideMap
      );
      
      // 3. 转换内容为Markdown
      const frontContent = this.convertFields(frontFields, params.mediaPathMap);
      const backContent = this.convertFields(backFields, params.mediaPathMap);
      const bothContent = this.convertFields(bothFields, params.mediaPathMap);
      
      // 4. 组装卡片内容
      const content = this.assembleContent(
        frontContent,
        backContent,
        bothContent
      );
      
      // 5. 创建Card对象
      const card = this.createCard(
        content,
        params.deckId,
        params.templateId,
        params.note,
        params.model,
        fields
      );
      
      this.logger.debug(`卡片构建成功: ${card.id}`);
      
      return {
        card,
        warnings,
        success: true
      };
      
    } catch (error) {
      this.logger.error('卡片构建失败', error);
      
      return {
        card: null as any,
        warnings: [`构建失败: ${error.message}`],
        success: false
      };
    }
  }

  /**
   * 解析字段值
   */
  private parseFields(note: AnkiNote, model: AnkiModel): Record<string, string> {
    const fieldValues = note.flds.split('\x1f');  // Anki使用\x1f分隔字段
    const fields: Record<string, string> = {};
    
    model.flds.forEach((field, index) => {
      const value = fieldValues[index] || '';
      if (value.trim()) {
        fields[field.name] = value;
      }
    });
    
    return fields;
  }

  /**
   * 分类字段
   */
  private classifyFields(
    fields: Record<string, string>,
    sideMap: Record<string, 'front' | 'back' | 'both'>
  ): {
    frontFields: Record<string, string>;
    backFields: Record<string, string>;
    bothFields: Record<string, string>;
  } {
    const frontFields: Record<string, string> = {};
    const backFields: Record<string, string> = {};
    const bothFields: Record<string, string> = {};
    
    for (const [name, value] of Object.entries(fields)) {
      const side = sideMap[name] || 'both';
      
      if (side === 'front') {
        frontFields[name] = value;
      } else if (side === 'back') {
        backFields[name] = value;
      } else {
        bothFields[name] = value;
      }
    }
    
    return { frontFields, backFields, bothFields };
  }

  /**
   * 转换字段内容
   */
  private convertFields(
    fields: Record<string, string>,
    mediaPathMap: Map<string, string>
  ): string[] {
    const converted: string[] = [];
    
    for (const [name, value] of Object.entries(fields)) {
      // 转换HTML为Markdown
      const result = this.converter.convert(value);
      
      // 替换媒体占位符
      const markdown = this.converter.replaceMediaPlaceholders(
        result.markdown,
        result.mediaRefs,
        mediaPathMap
      );
      
      // 格式化为 **字段名**: 内容
      converted.push(`**${name}**: ${markdown}`);
    }
    
    return converted;
  }

  /**
   * 组装卡片内容
   * 
   * 🆕 修复：只在正面和背面都有内容时添加分隔符，避免分隔符位置错误
   */
  private assembleContent(
    frontFields: string[],
    backFields: string[],
    bothFields: string[]
  ): string {
    const parts: string[] = [];
    
    // 收集正面内容
    const frontParts: string[] = [];
    if (frontFields.length > 0) {
      frontParts.push(frontFields.join('\n\n'));
    }
    // both字段显示在正面
    if (bothFields.length > 0) {
      frontParts.push(bothFields.join('\n\n'));
    }
    
    // 收集背面内容
    const backParts: string[] = [];
    if (backFields.length > 0) {
      backParts.push(backFields.join('\n\n'));
    }
    // both字段也显示在背面（如果正面没有内容）
    if (bothFields.length > 0 && frontFields.length === 0) {
      backParts.push(bothFields.join('\n\n'));
    }
    
    // 🆕 智能组装：只在两边都有内容时添加分隔符
    if (frontParts.length > 0 && backParts.length > 0) {
      // 正常情况：正面 + 分隔符 + 背面
      parts.push(frontParts.join('\n\n'));
      parts.push('---div---');
      parts.push(backParts.join('\n\n'));
    } else if (frontParts.length > 0) {
      // 只有正面内容
      parts.push(frontParts.join('\n\n'));
    } else if (backParts.length > 0) {
      // 只有背面内容（不添加分隔符）
      parts.push(backParts.join('\n\n'));
    }
    // 如果两者都为空，返回空字符串
    
    return parts.join('\n\n').trim();
  }

  /**
   * 创建Card对象
   */
  private createCard(
    content: string,
    deckId: string,
    templateId: string | undefined,
    note: AnkiNote,
    model: AnkiModel,
    fields: Record<string, string>
  ): Card {
    const now = Date.now();
    
    // 解析标签
    const tags = note.tags ? note.tags.split(' ').filter(t => t.trim()) : [];
    
    // 确定卡片类型
    const cardType = model.type === 1 ? CardType.CLOZE : CardType.BASIC_QA;
    
    // 提取字段映射（只包含 front/back 标准字段）
    const fieldMap = this.extractFieldsMap(content, fields);
    
    return {
      id: generateId(),
      uuid: generateId(),  // 生成UUID用于双向同步
      deckId,
      templateId: templateId || 'unknown',  // 🆕 设置templateId
      fields: fieldMap,  // 🆕 只包含标准字段的映射
      content,
      type: cardType,
      tags,
      created: now.toString(),
      modified: now.toString(),
      // FSRS数据（初始化）
      fsrs: {
        state: 0,  // New
        difficulty: 0,
        stability: 0,
        due: now.toString(),
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        lastReview: null,
        retrievability: 0
      },
      reviewHistory: [],
      stats: {
        totalReviews: 0,
        totalTime: 0,
        averageTime: 0,
        memoryRate: 0
      },
      // 🆕 保存Anki原始数据到customFields
      customFields: {
        ankiOriginal: {
          noteId: note.id,
          modelId: model.id,
          modelName: model.name,
          fields: fields,  // Anki原始字段（纯净HTML内容）
          tags: tags,
          guid: note.guid
        },
        importedAt: new Date().toISOString(),
        importSource: 'apkg'
      },
      // 元数据
      metadata: {
        ankiNoteId: note.id,
        ankiModelId: model.id,
        ankiGuid: note.guid,
        imported: now,
        importSource: 'apkg'
      }
    };
  }

  /**
   * 🆕 从内容中提取字段映射
   * 
   * 🔥 修复后的逻辑：
   * 1. **不再**保留 Anki 原始字段到 fields（应存储在 customFields.ankiOriginal 中）
   * 2. 只提取 Tuanki 标准字段 front 和 back
   * 3. **移除**重复的 question 和 answer 字段
   * 4. 增强分隔符处理，即使分隔符位置异常也能正确提取
   */
  private extractFieldsMap(
    content: string,
    fields: Record<string, string>
  ): Record<string, string> {
    // 🆕 只保留标准字段，不复制Anki原始字段
    const fieldMap: Record<string, string> = {};
    
    // 🆕 增强的分隔符检测
    const dividerIndex = content.indexOf('---div---');
    
    if (dividerIndex === -1) {
      // 没有分隔符，全部内容视为正面（或只有正面）
      const cleanContent = this.stripFieldNamePrefix(content.trim());
      if (cleanContent) {
        fieldMap.front = cleanContent;
      }
    } else if (dividerIndex === 0) {
      // 🆕 分隔符在开头（异常情况），后面的内容应该是正面
      const afterDivider = content.substring('---div---'.length).trim();
      const cleanContent = this.stripFieldNamePrefix(afterDivider);
      if (cleanContent) {
        fieldMap.front = cleanContent;
      }
    } else {
      // 正常情况：正面 ---div--- 背面
      const beforeDivider = content.substring(0, dividerIndex).trim();
      const afterDivider = content.substring(dividerIndex + '---div---'.length).trim();
      
      const frontContent = this.stripFieldNamePrefix(beforeDivider);
      if (frontContent) {
        fieldMap.front = frontContent;
      }
      
      const backContent = this.stripFieldNamePrefix(afterDivider);
      if (backContent) {
        fieldMap.back = backContent;
      }
    }
    
    // 🆕 调试日志
    console.log('[CardBuilder] 提取字段映射:', {
      hasDiv: content.includes('---div---'),
      dividerIndex,
      extractedFields: Object.keys(fieldMap),
      contentLength: content.length
    });
    
    return fieldMap;
  }

  /**
   * 去除字段名前缀
   * 
   * 🆕 增强版：支持多种字段前缀格式
   * - **字段名**: 内容
   * - **字段名**:内容（无空格）
   * - **字段名: 内容（单星号）
   * 
   * @param text - 包含字段名前缀的文本
   * @returns 去除前缀后的纯净内容
   */
  private stripFieldNamePrefix(text: string): string {
    if (!text || !text.trim()) {
      return '';
    }

    // 🆕 支持多种字段前缀格式
    const fieldPrefixPatterns = [
      /^\*\*([^*]+)\*\*:\s*/,      // **字段名**: 内容
      /^\*\*([^*]+)\*\*:/,          // **字段名**:内容（无空格）
      /^\*([^*]+)\*:\s*/,           // *字段名*: 内容（单星号）
      /^([^:]+):\s+/                // 字段名: 内容（兜底，纯文本）
    ];
    
    // 按段落分割（双换行符）
    const paragraphs = text.split(/\n\n+/);
    
    // 处理每个段落，去除字段名前缀
    const cleanedParagraphs = paragraphs.map(paragraph => {
      let trimmed = paragraph.trim();
      if (!trimmed) return '';
      
      // 尝试匹配并移除前缀
      for (const pattern of fieldPrefixPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
          trimmed = trimmed.replace(pattern, '');
          break;
        }
      }
      
      return trimmed;
    }).filter(p => p.length > 0);
    
    const result = cleanedParagraphs.join('\n\n');
    
    // 🆕 调试日志
    if (text !== result) {
      console.log('[CardBuilder] 字段前缀清理:', {
        original: text.substring(0, 100),
        cleaned: result.substring(0, 100),
        removed: text.length - result.length
      });
    }
    
    return result;
  }
}



