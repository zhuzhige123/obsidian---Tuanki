/**
 * 选择题解析器
 * 遵循卡片数据结构规范 v1.0
 */

import { MarkdownFieldsConverter, CardType } from '../MarkdownFieldsConverter';
import type { ParseResult } from '../../types/metadata-types';
import { ParseErrorType } from '../../types/metadata-types';
import { CHOICE_PATTERNS, extractChoiceOptions } from '../regex-patterns';
import { CARD_TYPE_MARKERS, MAIN_SEPARATOR } from '../../constants/markdown-delimiters';

/**
 * 选择题解析器
 * 
 * 支持格式：
 * Q: 问题
 * A) 选项1
 * B) 选项2 {✓}
 * C) 选项3
 * ---div---
 * 解析内容（可选）
 * 
 * ✅ 标准字段：只生成 { front, back, options, correctAnswers }
 * ❌ 禁止添加元数据字段到fields（hint/explanation等）
 */
export class ChoiceCardParser extends MarkdownFieldsConverter {
  
  /**
   * 解析Markdown为fields
   * 
   * 标准字段：{ front, back, options, correctAnswers }
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
          '请输入选择题内容'
        );
      }
      
      // 解析选择题内容
      const parseResult = this.parseChoiceContent(cleanContent);
      
      if (!parseResult.success) {
        return this.createErrorResult(
          parseResult.errorType!,
          parseResult.errorMessage!,
          content,
          parseResult.suggestion
        );
      }
      
      // 构建标准fields对象（只有4个字段）
      const fields: Record<string, string> = {
        front: parseResult.question!,
        back: parseResult.explanation || '',
        options: this.serializeOptions(parseResult.options!),
        correctAnswers: parseResult.correctAnswers!.join(',')
      };
      
      // 验证
      const validation = this.validateRequiredFields(fields, ['front', 'options']);
      if (!validation.valid) {
        return this.createErrorResult(
          ParseErrorType.MISSING_REQUIRED_FIELD,
          `缺少必需字段: ${validation.missing.join(', ')}`,
          content
        );
      }
      
      // 警告：未找到正确答案
      const warnings: string[] = [];
      if (parseResult.correctAnswers!.length === 0) {
        warnings.push('未找到正确答案标记{✓}');
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
   * 解析选择题主内容
   * 
   * 返回：问题、选项、正确答案、解析（可选）
   */
  private parseChoiceContent(mainContent: string): {
    success: boolean;
    question?: string;
    options?: Array<{label: string; text: string; isCorrect: boolean}>;
    correctAnswers?: string[];
    explanation?: string;
    errorType?: ParseErrorType;
    errorMessage?: string;
    suggestion?: string;
  } {
    // 提取问题
    const questionMatch = mainContent.match(CHOICE_PATTERNS.QUESTION);
    if (!questionMatch) {
      return {
        success: false,
        errorType: ParseErrorType.INVALID_FORMAT,
        errorMessage: '未找到问题部分（Q:）',
        suggestion: '选择题必须以 Q: 开头'
      };
    }
    
    const question = this.cleanFieldContent(questionMatch[1]);
    
    // 提取选项部分
    const afterQuestion = mainContent.substring(questionMatch.index! + questionMatch[0].length);
    
    // 找到选项开始的位置（第一个A) B) C)等）
    const firstOptionMatch = afterQuestion.match(/^([A-H])\)/m);
    if (!firstOptionMatch) {
      return {
        success: false,
        errorType: ParseErrorType.INVALID_FORMAT,
        errorMessage: '未找到选项（A) B) C)等）',
        suggestion: '选项必须使用 A) B) C) D) 格式'
      };
    }
    
    // 提取从第一个选项到---div---或字符串结束的部分
    const optionsStart = afterQuestion.indexOf(firstOptionMatch[0]);
    const separatorIndex = afterQuestion.indexOf(`\n${MAIN_SEPARATOR}`);
    const optionsEnd = separatorIndex >= 0 ? separatorIndex : afterQuestion.length;
    const optionsText = afterQuestion.substring(optionsStart, optionsEnd);
    
    // 解析选项
    const options = extractChoiceOptions(optionsText);
    
    if (options.length === 0) {
      return {
        success: false,
        errorType: ParseErrorType.INVALID_FORMAT,
        errorMessage: '无法解析选项',
        suggestion: '请检查选项格式是否正确'
      };
    }
    
    // 提取正确答案
    const correctAnswers = options
      .filter(opt => opt.isCorrect)
      .map(opt => opt.label);
    
    // 提取解析部分（在---div---之后）
    let explanation: string | undefined;
    if (separatorIndex >= 0) {
      const afterSeparator = afterQuestion.substring(separatorIndex + MAIN_SEPARATOR.length + 2);
      const explanationText = afterSeparator.trim();
      if (explanationText) {
        explanation = this.cleanFieldContent(explanationText);
      }
    }
    
    return {
      success: true,
      question,
      options,
      correctAnswers,
      explanation
    };
  }
  
  /**
   * 序列化选项为字符串（用于存储）
   */
  private serializeOptions(options: Array<{label: string; text: string; isCorrect: boolean}>): string {
    return options.map(opt => 
      `${opt.label} ${opt.text}${opt.isCorrect ? ' {✓}' : ''}`
    ).join('\n');
  }
  
  /**
   * 从fields重建Markdown
   * 
   * 重建规则：
   * - Q: 问题
   * - A) B) C) 选项
   * - 如果有back，添加---div---和解析
   */
  buildMarkdownFromFields(fields: Record<string, string>, type: CardType): string {
    let markdown = '';
    
    // 1. 构建问题部分
    const question = fields.front || fields.Front || '';
    markdown += `${CARD_TYPE_MARKERS.CHOICE.QUESTION} ${question}\n\n`;
    
    // 2. 构建选项部分
    if (fields.options) {
      markdown += `${fields.options}\n\n`;
    }
    
    // 3. 如果有解析，添加分隔符和解析
    const explanation = fields.back || fields.Back || '';
    if (explanation) {
      markdown += `${MAIN_SEPARATOR}\n\n`;
      markdown += explanation;
    }
    
    return markdown.trim();
  }
}







