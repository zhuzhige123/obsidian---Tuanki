/**
 * Markdown字段验证器
 * 验证Markdown内容是否包含模板要求的必备字段
 */

import type { TriadTemplate } from '../data/template-types';

export interface FieldValidationError {
  fieldKey: string;
  fieldName: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface MarkdownValidationResult {
  isValid: boolean;
  errors: FieldValidationError[];
  warnings: FieldValidationError[];
  missingFields: string[];
  foundFields: string[];
}

/**
 * Markdown字段验证器类
 */
export class MarkdownFieldValidator {
  
  /**
   * 验证Markdown内容是否包含模板要求的必备字段
   */
  validateMarkdownContent(
    markdownContent: string, 
    template: TriadTemplate
  ): MarkdownValidationResult {
    const result: MarkdownValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      missingFields: [],
      foundFields: []
    };

    if (!markdownContent || !markdownContent.trim()) {
      result.isValid = false;
      result.errors.push({
        fieldKey: 'content',
        fieldName: '内容',
        message: 'Markdown内容不能为空',
        severity: 'error'
      });
      return result;
    }

    // 获取模板中的必备字段
    const requiredFields = this.getRequiredFields(template);
    
    // 检查每个必备字段
    for (const field of requiredFields) {
      const fieldPattern = this.createFieldPattern(field.key);
      const isFieldPresent = fieldPattern.test(markdownContent);
      
      if (isFieldPresent) {
        result.foundFields.push(field.key);

        // 检查字段内容是否为空
        const fieldContent = this.extractFieldContent(markdownContent, field.key);
        if (!fieldContent || !fieldContent.trim()) {
          result.warnings.push({
            fieldKey: field.key,
            fieldName: field.name,
            message: `字段"!${field.name}"存在但内容为空`,
            severity: 'warning'
          });
        }
      } else {
        result.missingFields.push(field.key);
        result.errors.push({
          fieldKey: field.key,
          fieldName: field.name,
          message: `缺少必备字段"!${field.name}"`,
          severity: 'error'
        });
      }
    }

    // 如果有缺失的必备字段，验证失败
    if (result.missingFields.length > 0) {
      result.isValid = false;
    }

    return result;
  }

  /**
   * 获取模板中的必备字段
   */
  private getRequiredFields(template: TriadTemplate): Array<{key: string, name: string, required: boolean}> {
    const fields: Array<{key: string, name: string, required: boolean}> = [];
    
    if (template.fieldTemplate?.fields) {
      for (const field of template.fieldTemplate.fields) {
        if (field.type === 'field') {
          fields.push({
            key: field.key,
            name: field.name,
            required: field.required || false
          });
        }
      }
    }

    // 添加系统必备字段
    const systemFields = [
      { key: 'templateId', name: 'TemplateId', required: true },
      { key: 'templateName', name: 'TemplateName', required: true }
    ];

    return [...fields.filter(f => f.required), ...systemFields];
  }

  /**
   * 创建字段匹配模式
   * ⚠️ 已弃用：旧的"!字段名"格式已被简化解析系统替代
   */
  private createFieldPattern(fieldKey: string): RegExp {
    // 🚫 旧逻辑已禁用 - 不再支持 !字段名 格式
    console.warn('[MarkdownFieldValidator] 旧的"!字段名"格式已弃用，请使用简化解析系统');
    return new RegExp(`^DEPRECATED_PATTERN_${fieldKey}$`, 'm');
  }

  /**
   * 提取字段内容
   * ⚠️ 已弃用：旧的"!字段名"格式已被简化解析系统替代
   */
  private extractFieldContent(markdownContent: string, fieldKey: string): string {
    // 🚫 旧逻辑已禁用 - 不再支持 !字段名 格式
    console.warn('[MarkdownFieldValidator] 旧的"!字段名"格式已弃用，请使用简化解析系统');
    return '';
  }

  /**
   * 字段key转换为显示名称
   */
  private fieldKeyToDisplayName(fieldKey: string): string {
    const nameMap: Record<string, string> = {
      // 基础字段
      'question': '问题',
      'answer': '答案',
      'front': '正面',
      'back': '背面',
      'title': '标题',
      'content': '内容',
      'note': '说明',
      'example': '示例',
      'explanation': '解释',
      'tags': '标签',
      'source': '来源',
      'extra': '额外信息',

      // 选择题字段
      'options': '选项',
      'choices': '选项',
      'alternatives': '选项',
      'correct_answer': '正确答案',
      'correct': '正确答案',
      'solution': '正确答案',

      // 题目字段
      'text': '题干',
      'prompt': '题干',
      'stem': '题干',
      'problem': '题干',
      'query': '题干',

      // 解析字段
      'analysis': '解析',
      'reasoning': '解析',
      'rationale': '解析',
      'reason': '解析',

      // 提示字段
      'hint': '提示',
      'clue': '提示',
      'tip': '提示',

      // 分类字段
      'difficulty': '难度',
      'level': '难度',
      'category': '分类',
      'type': '类型',
      'subject': '学科',

      // 元数据字段
      'templateId': 'TemplateId',
      'templateName': 'TemplateName',
      'created': '创建时间',
      'updated': '更新时间',
      'author': '作者',
      'reference': '参考资料',
      'obsidian_block_link': 'Obsidian块链接',
      'source_document': '来源文档'
    };

    return nameMap[fieldKey] || fieldKey;
  }

  /**
   * 生成字段验证错误消息
   */
  generateValidationMessage(result: MarkdownValidationResult): string {
    if (result.isValid) {
      return '所有必备字段验证通过';
    }

    const messages: string[] = [];
    
    if (result.missingFields.length > 0) {
      const missingFieldNames = result.missingFields.map(key => 
        `!${this.fieldKeyToDisplayName(key)}`
      ).join('、');
      messages.push(`缺少必备字段：${missingFieldNames}`);
    }

    if (result.warnings.length > 0) {
      const warningMessages = result.warnings.map(w => w.message);
      messages.push(...warningMessages);
    }

    return messages.join('\n');
  }

  /**
   * 自动补全缺失的字段
   */
  autoCompleteFields(
    markdownContent: string, 
    template: TriadTemplate,
    defaultValues: Record<string, string> = {}
  ): string {
    const validation = this.validateMarkdownContent(markdownContent, template);
    
    if (validation.isValid) {
      return markdownContent;
    }

    let updatedContent = markdownContent;

    // 为缺失的字段添加空白模板
    for (const fieldKey of validation.missingFields) {
      const displayName = this.fieldKeyToDisplayName(fieldKey);
      const defaultValue = defaultValues[fieldKey] || '';
      const fieldSection = `\n\n!${displayName}\n\n${defaultValue}`;
      updatedContent += fieldSection;
    }

    return updatedContent;
  }

  /**
   * 检查字段名格式是否正确
   */
  validateFieldNameFormat(markdownContent: string): {
    isValid: boolean;
    invalidFields: string[];
    suggestions: string[];
  } {
    const invalidFields: string[] = [];
    const suggestions: string[] = [];

    // 匹配所有一级标题（# 开头的行）
    const headerPattern = /^#\s+(.+)$/gm;
    const headerMatches = Array.from(markdownContent.matchAll(headerPattern));

    for (const match of headerMatches) {
      const headerText = match[1].trim();

      // 检查是否以!开头
      if (!headerText.startsWith('!')) {
        invalidFields.push(headerText);
        suggestions.push(`将"${headerText}"改为"!${headerText}"`);
      }
    }

    // 也检查直接以字段名开头的行（没有#的情况）
    const lines = markdownContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 如果是非空行，不以!开头，不包含{{，且下一行是空行，可能是字段标题
      if (line &&
          !line.startsWith('!') &&
          !line.startsWith('#') &&
          !line.includes('{{') &&
          !line.includes('```') &&
          i < lines.length - 1 &&
          lines[i + 1].trim() === '') {

        // 简单的字段名检测：如果看起来像中文字段名
        if (/^[\u4e00-\u9fa5]+$/.test(line)) {
          invalidFields.push(line);
          suggestions.push(`将"${line}"改为"!${line}"`);
        }
      }
    }

    return {
      isValid: invalidFields.length === 0,
      invalidFields,
      suggestions
    };
  }
}
