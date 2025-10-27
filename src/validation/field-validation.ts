/**
 * 字段验证系统
 * 提供严格的字段类型验证、必填字段检查和数据格式验证
 */

import type { Card, CardType } from "../data/types";
import type { FieldTemplate, FieldTemplateField } from "../data/template-types";

// 字段验证规则类型
export interface FieldValidationRule {
  id: string;
  name: string;
  description: string;
  validator: (value: string, field: FieldTemplateField, card: Card) => ValidationResult;
  severity: 'error' | 'warning' | 'info';
}

// 验证结果
export interface ValidationResult {
  isValid: boolean;
  message?: string;
  suggestions?: string[];
}

// 字段验证错误
export interface FieldValidationError {
  fieldId: string;
  fieldName: string;
  ruleId: string;
  ruleName: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestions?: string[];
}

// 卡片验证结果
export interface CardValidationResult {
  isValid: boolean;
  errors: FieldValidationError[];
  warnings: FieldValidationError[];
  infos: FieldValidationError[];
}

/**
 * 字段验证器类
 */
export class FieldValidator {
  private rules: Map<string, FieldValidationRule> = new Map();

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * 初始化默认验证规则
   */
  private initializeDefaultRules(): void {
    // 必填字段验证
    this.addRule({
      id: 'required',
      name: '必填字段',
      description: '检查必填字段是否为空',
      severity: 'error',
      validator: (value: string, field: FieldTemplateField) => {
        const isEmpty = !value || value.trim().length === 0;
        return {
          isValid: !isEmpty,
          message: isEmpty ? `字段"${field.name}"不能为空` : undefined,
          suggestions: isEmpty ? ['请填写该字段的内容'] : undefined
        };
      }
    });

    // 最小长度验证
    this.addRule({
      id: 'minLength',
      name: '最小长度',
      description: '检查字段内容的最小长度',
      severity: 'warning',
      validator: (value: string, field: FieldTemplateField) => {
        const minLength = this.getFieldMinLength(field);
        const isValid = value.length >= minLength;
        return {
          isValid,
          message: !isValid ? `字段"${field.name}"内容过短，建议至少${minLength}个字符` : undefined,
          suggestions: !isValid ? [`当前长度：${value.length}，建议长度：${minLength}+`] : undefined
        };
      }
    });

    // 最大长度验证
    this.addRule({
      id: 'maxLength',
      name: '最大长度',
      description: '检查字段内容的最大长度',
      severity: 'error',
      validator: (value: string, field: FieldTemplateField) => {
        const maxLength = this.getFieldMaxLength(field);
        const isValid = value.length <= maxLength;
        return {
          isValid,
          message: !isValid ? `字段"${field.name}"内容过长，最多允许${maxLength}个字符` : undefined,
          suggestions: !isValid ? [`当前长度：${value.length}，请缩减至${maxLength}字符以内`] : undefined
        };
      }
    });

    // HTML 标签验证
    this.addRule({
      id: 'htmlTags',
      name: 'HTML标签',
      description: '检查HTML标签的正确性',
      severity: 'warning',
      validator: (value: string) => {
        const htmlTagRegex = /<[^>]*>/g;
        const tags = value.match(htmlTagRegex) || [];
        const unclosedTags = this.findUnclosedHtmlTags(value);
        
        return {
          isValid: unclosedTags.length === 0,
          message: unclosedTags.length > 0 ? `发现未闭合的HTML标签：${unclosedTags.join(', ')}` : undefined,
          suggestions: unclosedTags.length > 0 ? ['请检查HTML标签是否正确闭合'] : undefined
        };
      }
    });

    // 数学公式验证
    this.addRule({
      id: 'mathFormula',
      name: '数学公式',
      description: '检查LaTeX数学公式的语法',
      severity: 'warning',
      validator: (value: string) => {
        const mathRegex = /\$\$?([^$]+)\$\$?/g;
        const formulas = [...value.matchAll(mathRegex)];
        const invalidFormulas: string[] = [];

        for (const formula of formulas) {
          if (!this.isValidLatex(formula[1])) {
            invalidFormulas.push(formula[1]);
          }
        }

        return {
          isValid: invalidFormulas.length === 0,
          message: invalidFormulas.length > 0 ? `发现可能有问题的数学公式` : undefined,
          suggestions: invalidFormulas.length > 0 ? ['请检查LaTeX语法是否正确'] : undefined
        };
      }
    });

    // 图片链接验证
    this.addRule({
      id: 'imageLinks',
      name: '图片链接',
      description: '检查图片链接的有效性',
      severity: 'info',
      validator: (value: string) => {
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        const images = [...value.matchAll(imageRegex)];
        const brokenLinks: string[] = [];

        for (const image of images) {
          const url = image[2];
          if (!this.isValidImageUrl(url)) {
            brokenLinks.push(url);
          }
        }

        return {
          isValid: brokenLinks.length === 0,
          message: brokenLinks.length > 0 ? `发现可能无效的图片链接` : undefined,
          suggestions: brokenLinks.length > 0 ? ['请检查图片文件是否存在'] : undefined
        };
      }
    });
  }

  /**
   * 添加验证规则
   */
  addRule(rule: FieldValidationRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * 移除验证规则
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * 验证单个字段
   */
  validateField(
    fieldId: string,
    value: string,
    field: FieldTemplateField,
    card: Card,
    enabledRules?: string[]
  ): FieldValidationError[] {
    const errors: FieldValidationError[] = [];
    const rulesToApply = enabledRules || Array.from(this.rules.keys());

    for (const ruleId of rulesToApply) {
      const rule = this.rules.get(ruleId);
      if (!rule) continue;

      // 跳过不适用的规则
      if (!this.isRuleApplicable(rule, field, card)) continue;

      const result = rule.validator(value, field, card);
      if (!result.isValid) {
        errors.push({
          fieldId,
          fieldName: field.name,
          ruleId: rule.id,
          ruleName: rule.name,
          message: result.message || '验证失败',
          severity: rule.severity,
          suggestions: result.suggestions
        });
      }
    }

    return errors;
  }

  /**
   * 验证整个卡片
   */
  validateCard(card: Card, template: FieldTemplate, enabledRules?: string[]): CardValidationResult {
    const allErrors: FieldValidationError[] = [];

    // 获取模板中的字段定义
    const templateFields = template.fields.filter(item => item.type === 'field') as FieldTemplateField[];

    for (const field of templateFields) {
      const value = card.fields[field.key] || '';
      const fieldErrors = this.validateField(field.id, value, field, card, enabledRules);
      allErrors.push(...fieldErrors);
    }

    // 按严重程度分类
    const errors = allErrors.filter(e => e.severity === 'error');
    const warnings = allErrors.filter(e => e.severity === 'warning');
    const infos = allErrors.filter(e => e.severity === 'info');

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      infos
    };
  }

  /**
   * 获取字段的最小长度要求
   */
  private getFieldMinLength(field: FieldTemplateField): number {
    // 根据字段名称或类型确定最小长度
    const fieldName = field.name.toLowerCase();
    
    if (fieldName.includes('问题') || fieldName.includes('question')) return 2;
    if (fieldName.includes('答案') || fieldName.includes('answer')) return 1;
    if (fieldName.includes('解释') || fieldName.includes('explanation')) return 5;
    if (fieldName.includes('例句') || fieldName.includes('example')) return 3;
    
    return 1; // 默认最小长度
  }

  /**
   * 获取字段的最大长度限制
   */
  private getFieldMaxLength(field: FieldTemplateField): number {
    // 根据字段名称或类型确定最大长度
    const fieldName = field.name.toLowerCase();
    
    if (fieldName.includes('标题') || fieldName.includes('title')) return 100;
    if (fieldName.includes('单词') || fieldName.includes('word')) return 50;
    if (fieldName.includes('短语') || fieldName.includes('phrase')) return 100;
    
    return 5000; // 默认最大长度
  }

  /**
   * 检查规则是否适用于当前字段和卡片
   */
  private isRuleApplicable(rule: FieldValidationRule, field: FieldTemplateField, card: Card): boolean {
    // 必填字段验证只适用于前面的字段
    if (rule.id === 'required') {
      return field.side === 'front' || field.side === 'both';
    }

    // 数学公式验证只适用于包含数学内容的字段
    if (rule.id === 'mathFormula') {
      const fieldName = field.name.toLowerCase();
      return fieldName.includes('公式') || fieldName.includes('数学') || fieldName.includes('formula');
    }

    return true;
  }

  /**
   * 查找未闭合的HTML标签
   */
  private findUnclosedHtmlTags(html: string): string[] {
    const stack: string[] = [];
    const unclosed: string[] = [];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();
      
      // 自闭合标签
      if (fullTag.endsWith('/>') || ['img', 'br', 'hr', 'input'].includes(tagName)) {
        continue;
      }
      
      if (fullTag.startsWith('</')) {
        // 闭合标签
        if (stack.length > 0 && stack[stack.length - 1] === tagName) {
          stack.pop();
        } else {
          unclosed.push(tagName);
        }
      } else {
        // 开始标签
        stack.push(tagName);
      }
    }
    
    return [...unclosed, ...stack];
  }

  /**
   * 简单的LaTeX语法检查
   */
  private isValidLatex(formula: string): boolean {
    // 检查括号匹配
    const brackets = ['{', '}', '[', ']', '(', ')'];
    const stack: string[] = [];
    
    for (const char of formula) {
      if (brackets.includes(char)) {
        if (['{', '[', '('].includes(char)) {
          stack.push(char);
        } else {
          const last = stack.pop();
          const pairs = { '}': '{', ']': '[', ')': '(' };
          if (pairs[char as keyof typeof pairs] !== last) {
            return false;
          }
        }
      }
    }
    
    return stack.length === 0;
  }

  /**
   * 检查图片URL是否有效
   */
  private isValidImageUrl(url: string): boolean {
    // 简单的URL格式检查
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(url);
    }
    
    // 本地文件路径检查
    return /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(url);
  }
}

// 导出默认验证器实例
export const defaultFieldValidator = new FieldValidator();
