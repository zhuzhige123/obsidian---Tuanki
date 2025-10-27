/**
 * 问答题解析器
 * 遵循卡片数据结构规范 v1.0
 */

import { MarkdownFieldsConverter, CardType } from '../MarkdownFieldsConverter';
import type { ParseResult } from '../../types/metadata-types';
import { ParseErrorType } from '../../types/metadata-types';
import { MAIN_SEPARATOR } from '../../constants/markdown-delimiters';

/**
 * 问答题解析器
 * 
 * 支持格式：
 * 1. 有分隔符：问题\n\n---div---\n\n答案
 * 2. 无分隔符：整个内容作为front，back为空
 * 
 * ✅ 标准字段：只生成 { front, back }
 * ❌ 禁止添加元数据字段到fields（hint/explanation等）
 */
export class QACardParser extends MarkdownFieldsConverter {
  
  /**
   * 解析Markdown为fields
   * 
   * 规则：
   * - 有---div---分隔符：分隔符前为front，分隔符后为back
   * - 无分隔符：整个content为front，back为空字符串
   * - 只生成front和back两个字段
   */
  parseMarkdownToFields(content: string, type: CardType): ParseResult {
    try {
      // 清理content
      const cleanContent = content.trim();
      
      if (!cleanContent) {
        return this.createErrorResult(
          ParseErrorType.INVALID_FORMAT,
          '内容为空',
          content,
          '请输入卡片内容'
        );
      }
      
      // 查找---div---分隔符
      const dividerIndex = cleanContent.indexOf(MAIN_SEPARATOR);
      
      let front: string;
      let back: string;
      
      if (dividerIndex >= 0) {
        // 有分隔符：拆分为front和back
        front = cleanContent.substring(0, dividerIndex).trim();
        back = cleanContent.substring(dividerIndex + MAIN_SEPARATOR.length).trim();
      } else {
        // 无分隔符：整个内容作为front
        front = cleanContent;
        back = '';
      }
      
      // 构建标准fields对象（只有front和back）
      const fields: Record<string, string> = {
        front,
        back
      };
      
      // 验证必需字段（front必须非空）
      if (!front) {
        return this.createErrorResult(
          ParseErrorType.MISSING_REQUIRED_FIELD,
          '正面内容不能为空',
          content,
          '请输入问题或正面内容'
        );
      }
      
      // 可选：如果back为空，添加警告
      const warnings: string[] = [];
      if (!back) {
        warnings.push('背面内容为空，建议添加答案');
      }
      
      return this.createSuccessResult(fields, content, undefined, warnings.length > 0 ? warnings : undefined);
      
    } catch (error) {
      return this.createErrorResult(
        ParseErrorType.INVALID_FORMAT,
        `解析失败: ${error instanceof Error ? error.message : String(error)}`,
        content
      );
    }
  }
  
  /**
   * 从fields重建Markdown
   * 
   * 重建规则：
   * - 如果有back，使用front + ---div--- + back格式
   * - 如果back为空，只返回front
   * - 不添加Q:/A:前缀（用户可以在content中自行添加）
   */
  buildMarkdownFromFields(fields: Record<string, string>, type: CardType): string {
    // 提取front和back（兼容大小写）
    const front = fields.front || fields.Front || '';
    const back = fields.back || fields.Back || '';
    
    if (!front) {
      return '';
    }
    
    // 如果有back，使用分隔符格式
    if (back) {
      return `${front}\n\n${MAIN_SEPARATOR}\n\n${back}`;
    } else {
      // 无back，只返回front
      return front;
    }
  }
}







