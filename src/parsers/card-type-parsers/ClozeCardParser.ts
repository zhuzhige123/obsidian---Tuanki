/**
 * 挖空题解析器
 * 遵循卡片数据结构规范 v1.0
 */

import { MarkdownFieldsConverter, CardType } from '../MarkdownFieldsConverter';
import type { ParseResult } from '../../types/metadata-types';
import { ParseErrorType } from '../../types/metadata-types';
import { CLOZE_PATTERNS, extractClozeContents } from '../regex-patterns';

/**
 * 挖空题解析器
 * 
 * 支持格式：
 * 1. ==挖空内容==（Obsidian风格，优先）
 * 2. {{c1::挖空内容}}（Anki风格，兼容）
 * 
 * ✅ 标准字段：只生成 { text }
 * ❌ 禁止添加元数据字段到fields（context/hint/clozeCount等）
 */
export class ClozeCardParser extends MarkdownFieldsConverter {
  
  /**
   * 解析Markdown为fields
   * 
   * 标准字段：{ text }
   * text保留完整的content，包含挖空标记
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
          '请输入挖空题内容'
        );
      }
      
      // 检查是否包含挖空标记
      const hasObsidianCloze = cleanContent.includes('==');
      const hasAnkiCloze = cleanContent.includes('{{c');
      
      if (!hasObsidianCloze && !hasAnkiCloze) {
        return this.createErrorResult(
          ParseErrorType.NO_CLOZE_FOUND,
          '未找到挖空标记',
          content,
          '请使用 ==内容== 或 {{c1::内容}} 标记挖空部分'
        );
      }
      
      // 验证挖空标记是否完整（至少验证Obsidian格式）
      if (hasObsidianCloze) {
        const clozes = extractClozeContents(cleanContent);
        if (clozes.length === 0) {
          return this.createErrorResult(
            ParseErrorType.NO_CLOZE_FOUND,
            '挖空标记格式不正确',
            content,
            '请确保使用完整的 ==内容== 格式'
          );
        }
      }
      
      // 构建标准fields对象（只有text字段）
      const fields: Record<string, string> = {
        text: cleanContent
      };
      
      return this.createSuccessResult(fields, content, undefined);
      
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
   * - 直接返回text字段（包含挖空标记）
   */
  buildMarkdownFromFields(fields: Record<string, string>, type: CardType): string {
    // 提取text字段（兼容大小写和旧字段名）
    const text = fields.text || fields.Text || fields.front || fields.Front || '';
    return text;
  }
  
  /**
   * 转换Obsidian风格挖空为Anki风格（用于Anki同步）
   */
  static convertObsidianToAnkiStyle(content: string): string {
    let result = content;
    let clozeIndex = 1;
    
    // 将所有==text==替换为{{c1::text}}格式
    result = result.replace(CLOZE_PATTERNS.OBSIDIAN_STYLE, () => {
      const replacement = `{{c${clozeIndex}::$1}}`;
      clozeIndex++;
      return replacement;
    });
    
    return result;
  }
  
  /**
   * 转换Anki风格挖空为Obsidian风格（用于Obsidian编辑）
   */
  static convertAnkiToObsidianStyle(content: string): string {
    return content.replace(CLOZE_PATTERNS.ANKI_STYLE, (match, num, text, hint) => {
      // 如果有hint，保留在括号中
      return hint ? `==${text}==(${hint})` : `==${text}==`;
    });
  }
}







