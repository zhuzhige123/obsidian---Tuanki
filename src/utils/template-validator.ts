/**
 * 增强的模板验证器
 * 支持所有模板类型的验证，包括弃用模板、APKG导入模板等
 */

import type { FieldTemplate, TriadTemplate } from '../data/template-types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  score: number; // 0-100 质量评分
}

export interface TemplateValidationOptions {
  strict: boolean; // 严格模式
  checkCompatibility: boolean; // 检查兼容性
  validateContent: boolean; // 验证内容
  checkPerformance: boolean; // 检查性能
}

export class TemplateValidator {
  private options: TemplateValidationOptions;

  constructor(options: Partial<TemplateValidationOptions> = {}) {
    this.options = {
      strict: false,
      checkCompatibility: true,
      validateContent: true,
      checkPerformance: true,
      ...options
    };
  }

  /**
   * 验证三位一体模板
   */
  validateTriadTemplate(template: TriadTemplate): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      score: 100
    };

    // 基础验证
    this.validateBasicStructure(template, result);
    
    // 字段模板验证
    if (template.fieldTemplate) {
      const fieldResult = this.validateFieldTemplate(template.fieldTemplate);
      this.mergeResults(result, fieldResult);
    }

    // Markdown模板验证
    if (template.markdownTemplate) {
      this.validateMarkdownTemplate(template.markdownTemplate, result);
    }

    // 正则模板验证
    if (template.regexParseTemplate) {
      this.validateRegexTemplate(template.regexParseTemplate, result);
    }

    // 一致性验证
    this.validateTriadConsistency(template, result);

    // 性能验证
    if (this.options.checkPerformance) {
      this.validatePerformance(template, result);
    }

    // 兼容性验证
    if (this.options.checkCompatibility) {
      this.validateCompatibility(template, result);
    }

    // 计算最终评分
    result.score = this.calculateScore(result);
    result.isValid = result.errors.length === 0;

    return result;
  }

  /**
   * 验证字段模板
   */
  validateFieldTemplate(template: FieldTemplate): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      score: 100
    };

    // 基础验证
    if (!template.id) {
      result.errors.push('模板缺少ID');
    }

    if (!template.name || template.name.trim() === '') {
      result.errors.push('模板名称不能为空');
    }

    if (!template.fields || !Array.isArray(template.fields)) {
      result.errors.push('模板必须包含字段数组');
    } else {
      this.validateFields(template.fields, result);
    }


    result.score = this.calculateScore(result);
    result.isValid = result.errors.length === 0;

    return result;
  }


  /**
   * 验证基础结构
   */
  private validateBasicStructure(template: any, result: ValidationResult): void {
    if (!template.id) {
      result.errors.push('模板缺少ID');
    }

    if (!template.name || template.name.trim() === '') {
      result.errors.push('模板名称不能为空');
    }

    if (template.name && template.name.length > 100) {
      result.warnings.push('模板名称过长，建议控制在100字符以内');
    }

    if (!template.version) {
      result.warnings.push('模板缺少版本信息');
    }

    if (!template.createdAt) {
      result.warnings.push('模板缺少创建时间');
    }
  }

  /**
   * 验证字段
   */
  private validateFields(fields: any[], result: ValidationResult): void {
    if (fields.length === 0) {
      result.errors.push('模板至少需要一个字段');
      return;
    }

    const fieldKeys = new Set<string>();
    const fieldNames = new Set<string>();

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      
      if (!field.key) {
        result.errors.push(`字段 ${i + 1} 缺少key属性`);
      } else {
        if (fieldKeys.has(field.key)) {
          result.errors.push(`字段key "${field.key}" 重复`);
        }
        fieldKeys.add(field.key);
      }

      if (!field.name) {
        result.errors.push(`字段 ${i + 1} 缺少name属性`);
      } else {
        if (fieldNames.has(field.name)) {
          result.warnings.push(`字段名称 "${field.name}" 重复`);
        }
        fieldNames.add(field.name);
      }

      if (!field.type) {
        result.errors.push(`字段 ${i + 1} 缺少type属性`);
      }

      // 验证字段类型
      const validTypes = ['field', 'separator', 'note', 'image', 'audio'];
      if (field.type && !validTypes.includes(field.type)) {
        result.warnings.push(`字段 ${i + 1} 使用了未知的类型: ${field.type}`);
      }
    }

    // 检查是否有实际的内容字段
    const contentFields = fields.filter(f => f.type === 'field');
    if (contentFields.length === 0) {
      result.errors.push('模板需要至少一个内容字段');
    }

    if (contentFields.length > 20) {
      result.warnings.push('字段数量过多，可能影响性能');
    }
  }

  /**
   * 验证Markdown模板
   */
  private validateMarkdownTemplate(markdownTemplate: any, result: ValidationResult): void {
    if (!markdownTemplate.markdownContent) {
      result.errors.push('Markdown模板缺少内容');
      return;
    }

    const content = markdownTemplate.markdownContent;
    
    // 检查占位符
    const placeholders = content.match(/\{\{[^}]+\}\}/g) || [];
    if (placeholders.length === 0) {
      result.warnings.push('Markdown模板没有使用任何字段占位符');
    }

    // 检查Markdown语法
    if (content.includes('# ') || content.includes('## ')) {
      // 有标题结构，这是好的
    } else {
      result.suggestions.push('建议在Markdown模板中使用标题结构');
    }

    // 检查长度
    if (content.length > 10000) {
      result.warnings.push('Markdown模板内容过长，可能影响性能');
    }
  }

  /**
   * 验证正则模板
   */
  private validateRegexTemplate(regexTemplate: any, result: ValidationResult): void {
    if (!regexTemplate.regex) {
      result.errors.push('正则模板缺少正则表达式');
      return;
    }

    try {
      new RegExp(regexTemplate.regex);
    } catch (error) {
      result.errors.push(`正则表达式语法错误: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    // 检查复杂度
    const complexity = this.calculateRegexComplexity(regexTemplate.regex);
    if (complexity > 50) {
      result.warnings.push('正则表达式过于复杂，可能影响性能');
    }

    // 检查字段映射
    if (!regexTemplate.fieldMappings) {
      result.errors.push('正则模板缺少字段映射');
    } else {
      const mappingCount = Object.keys(regexTemplate.fieldMappings).length;
      if (mappingCount === 0) {
        result.errors.push('正则模板没有定义任何字段映射');
      }
    }
  }

  /**
   * 验证三位一体一致性
   */
  private validateTriadConsistency(template: TriadTemplate, result: ValidationResult): void {
    if (!template.fieldTemplate || !template.markdownTemplate || !template.regexParseTemplate) {
      result.errors.push('三位一体模板必须包含字段模板、Markdown模板和正则模板');
      return;
    }

    // 检查字段一致性
    const fieldKeys = template.fieldTemplate.fields
      ?.filter(f => f.type === 'field')
      .map(f => f.key) || [];

    const markdownPlaceholders = (template.markdownTemplate.markdownContent?.match(/\{\{([^}]+)\}\}/g) || [])
      .map(p => p.replace(/[{}]/g, ''));

    const regexMappings = Object.keys(template.regexParseTemplate.fieldMappings || {});

    // 检查字段是否在Markdown中使用
    for (const key of fieldKeys) {
      if (!markdownPlaceholders.includes(key)) {
        result.warnings.push(`字段 "${key}" 在Markdown模板中未使用`);
      }
    }

    // 检查字段是否在正则映射中定义
    for (const key of fieldKeys) {
      if (!regexMappings.includes(key)) {
        result.warnings.push(`字段 "${key}" 在正则模板中未映射`);
      }
    }

    // 检查Markdown占位符是否有对应字段
    for (const placeholder of markdownPlaceholders) {
      if (!fieldKeys.includes(placeholder)) {
        result.errors.push(`Markdown占位符 "${placeholder}" 没有对应的字段定义`);
      }
    }
  }

  /**
   * 验证性能
   */
  private validatePerformance(template: any, result: ValidationResult): void {
    // 检查字段数量
    const fieldCount = template.fieldTemplate?.fields?.length || 0;
    if (fieldCount > 15) {
      result.warnings.push('字段数量较多，可能影响渲染性能');
    }

    // 检查Markdown内容长度
    const markdownLength = template.markdownTemplate?.markdownContent?.length || 0;
    if (markdownLength > 5000) {
      result.warnings.push('Markdown模板内容较长，可能影响渲染性能');
    }

    // 检查正则复杂度
    if (template.regexParseTemplate?.regex) {
      const complexity = this.calculateRegexComplexity(template.regexParseTemplate.regex);
      if (complexity > 30) {
        result.warnings.push('正则表达式复杂度较高，可能影响解析性能');
      }
    }
  }

  /**
   * 验证兼容性
   */
  private validateCompatibility(template: any, result: ValidationResult): void {
    // 检查Anki兼容性
    this.validateAnkiCompatibility(template, result);

    // 检查Obsidian兼容性
    this.validateObsidianCompatibility(template, result);
  }

  /**
   * 验证Anki兼容性
   */
  private validateAnkiCompatibility(template: any, result: ValidationResult): void {
    if (template.fieldTemplate?.fields) {
      for (const field of template.fieldTemplate.fields) {
        if (field.key && field.key.includes(' ')) {
          result.warnings.push(`字段key "${field.key}" 包含空格，可能在Anki中不兼容`);
        }
        
        if (field.key && field.key.length > 50) {
          result.warnings.push(`字段key "${field.key}" 过长，可能在Anki中不兼容`);
        }
      }
    }
  }

  /**
   * 验证Obsidian兼容性
   */
  private validateObsidianCompatibility(template: any, result: ValidationResult): void {
    if (template.markdownTemplate?.markdownContent) {
      const content = template.markdownTemplate.markdownContent;
      
      // 检查Obsidian特殊语法
      if (content.includes('[[') && content.includes(']]')) {
        result.suggestions.push('检测到Obsidian双链语法，确保在其他环境中的兼容性');
      }
      
      if (content.includes('![[')) {
        result.suggestions.push('检测到Obsidian嵌入语法，确保在其他环境中的兼容性');
      }
    }
  }


  /**
   * 计算正则表达式复杂度
   */
  private calculateRegexComplexity(regex: string): number {
    let complexity = 0;
    
    // 基础长度
    complexity += regex.length * 0.1;
    
    // 特殊字符
    complexity += (regex.match(/[.*+?^${}()|[\]\\]/g) || []).length * 2;
    
    // 量词
    complexity += (regex.match(/[*+?{]/g) || []).length * 3;
    
    // 字符类
    complexity += (regex.match(/\[[^\]]*\]/g) || []).length * 2;
    
    // 分组
    complexity += (regex.match(/\(/g) || []).length * 2;
    
    return Math.round(complexity);
  }

  /**
   * 合并验证结果
   */
  private mergeResults(target: ValidationResult, source: ValidationResult): void {
    target.errors.push(...source.errors);
    target.warnings.push(...source.warnings);
    target.suggestions.push(...source.suggestions);
  }

  /**
   * 计算质量评分
   */
  private calculateScore(result: ValidationResult): number {
    let score = 100;
    
    // 错误严重扣分
    score -= result.errors.length * 20;
    
    // 警告轻微扣分
    score -= result.warnings.length * 5;
    
    // 建议不扣分，但影响完美分数
    if (result.suggestions.length > 0) {
      score -= Math.min(result.suggestions.length * 2, 10);
    }
    
    return Math.max(0, Math.min(100, score));
  }
}
