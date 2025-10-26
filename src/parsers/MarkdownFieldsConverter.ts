/**
 * Markdown与Fields双向转换器基类
 * 提供Markdown格式与结构化fields之间的转换能力
 */

import type { ParseResult, CardMetadata, ParseError, ParseErrorType } from '../types/metadata-types';
import { splitContentAndMetadata, hasMetadataSection } from '../constants/markdown-delimiters';
import { parseMetadataFields, extractTagsArray, extractRelatedLinks } from './regex-patterns';

/**
 * 卡片类型枚举（与UnifiedCardType对应）
 */
export type CardType = 'basic-qa' | 'single-choice' | 'multiple-choice' | 'cloze-deletion';

/**
 * Markdown与Fields双向转换器抽象基类
 */
export abstract class MarkdownFieldsConverter {
  /**
   * 解析Markdown内容为结构化fields
   * @param content Markdown格式的卡片内容
   * @param type 卡片类型
   * @returns 解析结果
   */
  abstract parseMarkdownToFields(content: string, type: CardType): ParseResult;
  
  /**
   * 从结构化fields重建Markdown内容
   * @param fields 结构化字段
   * @param type 卡片类型
   * @returns Markdown格式的内容
   */
  abstract buildMarkdownFromFields(fields: Record<string, string>, type: CardType): string;
  
  /**
   * 提取元数据区域
   * @param content 完整内容
   * @returns 主内容和元数据内容
   */
  protected extractMetadataSection(content: string): {
    mainContent: string;
    metadataContent: string;
    hasMetadata: boolean;
  } {
    if (!hasMetadataSection(content)) {
      return {
        mainContent: content,
        metadataContent: '',
        hasMetadata: false,
      };
    }
    
    const { mainContent, metadataContent } = splitContentAndMetadata(content);
    
    return {
      mainContent,
      metadataContent,
      hasMetadata: true,
    };
  }
  
  /**
   * 解析额外字段
   * @param metaContent 元数据区域内容
   * @returns 解析后的元数据对象
   */
  protected parseExtraFields(metaContent: string): CardMetadata {
    if (!metaContent) {
      return {};
    }
    
    const fields = parseMetadataFields(metaContent);
    const metadata: CardMetadata = {};
    
    // 解析标准字段
    if (fields.hint) {
      metadata.hint = fields.hint;
    }
    
    if (fields.explanation) {
      metadata.explanation = fields.explanation;
    }
    
    if (fields.context) {
      metadata.context = fields.context;
    }
    
    if (fields.difficulty) {
      metadata.difficulty = fields.difficulty as 'Easy' | 'Medium' | 'Hard';
    }
    
    if (fields.source) {
      metadata.source = fields.source;
    }
    
    if (fields.tags) {
      metadata.customFields = metadata.customFields || {};
      metadata.customFields.tags = fields.tags;
    }
    
    if (fields.related) {
      metadata.related = extractRelatedLinks(fields.related);
    }
    
    // 收集其他自定义字段
    const standardFieldNames = ['hint', 'explanation', 'context', 'difficulty', 'source', 'tags', 'related'];
    for (const [key, value] of Object.entries(fields)) {
      if (!standardFieldNames.includes(key)) {
        metadata.customFields = metadata.customFields || {};
        metadata.customFields[key] = value;
      }
    }
    
    return metadata;
  }
  
  /**
   * 构建元数据区域内容
   * @param metadata 元数据对象
   * @returns Markdown格式的元数据内容
   */
  protected buildMetadataSection(metadata?: CardMetadata): string {
    if (!metadata || Object.keys(metadata).length === 0) {
      return '';
    }
    
    let metaContent = '\n\n---meta---\n\n';
    
    // Explanation放在最前面（通常最重要）
    if (metadata.explanation) {
      metaContent += `Explanation: ${metadata.explanation}\n\n`;
    }
    
    // 其他标准字段
    if (metadata.difficulty) {
      metaContent += `Difficulty: ${metadata.difficulty}\n`;
    }
    
    if (metadata.source) {
      metaContent += `Source: ${metadata.source}\n`;
    }
    
    if (metadata.related && metadata.related.length > 0) {
      const relatedLinks = metadata.related.map(link => `[[${link}]]`).join(', ');
      metaContent += `Related: ${relatedLinks}\n`;
    }
    
    // 自定义字段
    if (metadata.customFields) {
      for (const [key, value] of Object.entries(metadata.customFields)) {
        if (key === 'tags') {
          // 特殊处理tags
          metaContent += `Tags: ${value}\n`;
        } else {
          // 首字母大写
          const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
          metaContent += `${capitalizedKey}: ${value}\n`;
        }
      }
    }
    
    return metaContent;
  }
  
  /**
   * 创建成功的解析结果
   */
  protected createSuccessResult(
    fields: Record<string, string>,
    rawContent: string,
    metadata?: CardMetadata,
    warnings?: string[]
  ): ParseResult {
    return {
      success: true,
      fields,
      metadata,
      rawContent,
      warnings,
    };
  }
  
  /**
   * 创建失败的解析结果
   */
  protected createErrorResult(
    errorType: ParseErrorType,
    message: string,
    rawContent: string,
    suggestion?: string
  ): ParseResult {
    const error: ParseError = {
      type: errorType,
      message,
      suggestion,
    };
    
    return {
      success: false,
      fields: {},
      rawContent,
      error,
    };
  }
  
  /**
   * 验证必需字段
   */
  protected validateRequiredFields(
    fields: Record<string, string>,
    requiredFields: string[]
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    
    for (const field of requiredFields) {
      if (!fields[field] || fields[field].trim() === '') {
        missing.push(field);
      }
    }
    
    return {
      valid: missing.length === 0,
      missing,
    };
  }
  
  /**
   * 清理字段内容（移除多余空白）
   */
  protected cleanFieldContent(content: string): string {
    return content
      .trim()
      .replace(/\n{3,}/g, '\n\n') // 最多保留两个连续换行
      .replace(/[ \t]+$/gm, ''); // 移除行尾空白
  }
}

/**
 * 工厂函数：根据卡片类型获取对应的转换器
 */
export function getConverterForType(type: CardType): MarkdownFieldsConverter | null {
  // 动态导入避免循环依赖
  // 实际使用时会在调用处import具体的解析器
  return null;
}







