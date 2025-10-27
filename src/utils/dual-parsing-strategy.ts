/**
 * 双重解析策略实现
 * 根据标准化指导文档实现宽松解析和严格解析
 */

import type { TriadTemplate } from '../data/template-types';
import { MarkdownHeaderTemplateSystem } from './markdown-header-template-system';

export interface ParseContext {
  source: 'obsidian-raw' | 'plugin-editor' | 'anki-import' | 'user-paste';
  strategy: 'lenient' | 'strict';
  templateId?: string;
}

export interface ParseResult {
  success: boolean;
  fields: Record<string, string>;
  confidence: number;
  mode?: string;
  warnings?: string[];
  error?: string;
  preservedContent?: ContentPreservation;
}

export interface ContentPreservation {
  originalContent: string;
  parseAttempts: ParseAttempt[];
  fallbackTemplate: 'basic-qa' | 'basic-cloze' | 'emergency-basic';
  preservedAt: string;
  repairSuggestions: string[];
}

export interface ParseAttempt {
  strategy: string;
  pattern: string;
  success: boolean;
  extractedFields: Record<string, string>;
  error?: string;
  timestamp: string;
}

export class DualParsingStrategy {
  
  /**
   * 主解析入口 - 根据上下文选择解析策略
   */
  async parseContent(content: string, context: ParseContext, template?: TriadTemplate): Promise<ParseResult> {
    console.log(`🎯 [DualParsing] 开始解析 - 策略: ${context.strategy}, 来源: ${context.source}`);
    
    if (context.strategy === 'lenient') {
      return this.lenientParse(content, template);
    } else {
      return this.strictParse(content, template);
    }
  }

  /**
   * 宽松解析 - 用于Obsidian原始内容
   * 高容错，保存到基础模板，后续标准化处理
   */
  private async lenientParse(content: string, template?: TriadTemplate): Promise<ParseResult> {
    console.log('🔄 [DualParsing] 执行宽松解析...');
    
    const parseAttempts: ParseAttempt[] = [];
    
    // 宽松解析模式 - 按优先级尝试
    const lenientPatterns = this.getLenientPatterns();
    
    for (const [mode, pattern] of Object.entries(lenientPatterns)) {
      try {
        console.log(`🔍 [DualParsing] 尝试宽松模式: ${mode}`);
        
        const attempt: ParseAttempt = {
          strategy: `lenient-${mode}`,
          pattern: pattern.source,
          success: false,
          extractedFields: {},
          timestamp: new Date().toISOString()
        };
        
        const match = pattern.exec(content);
        if (match) {
          const fields = this.extractFieldsFromMatch(match, mode);
          const confidence = this.calculateConfidence(mode, fields, content);
          
          attempt.success = true;
          attempt.extractedFields = fields;
          parseAttempts.push(attempt);
          
          console.log(`✅ [DualParsing] 宽松解析成功 - 模式: ${mode}, 置信度: ${confidence}`);
          
          return {
            success: true,
            fields,
            confidence,
            mode,
            warnings: this.generateWarnings(fields, content)
          };
        } else {
          attempt.error = '模式不匹配';
          parseAttempts.push(attempt);
        }
        
      } catch (error) {
        console.warn(`⚠️ [DualParsing] 宽松模式 ${mode} 失败:`, error);
        parseAttempts.push({
          strategy: `lenient-${mode}`,
          pattern: pattern.source,
          success: false,
          extractedFields: {},
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // 所有宽松模式都失败 - 保存到基础模板
    console.log('❌ [DualParsing] 所有宽松解析模式失败，保存到基础模板');
    
    return {
      success: false,
      fields: {},
      confidence: 0,
      error: '无法解析内容',
      preservedContent: {
        originalContent: content,
        parseAttempts,
        fallbackTemplate: this.selectFallbackTemplate(content),
        preservedAt: new Date().toISOString(),
        repairSuggestions: this.generateRepairSuggestions(content, parseAttempts)
      }
    };
  }

  /**
   * 严格解析 - 用于插件内部处理
   * 低容错，立即验证，快速失败
   */
  private async strictParse(content: string, template?: TriadTemplate): Promise<ParseResult> {
    console.log('🔒 [DualParsing] 执行严格解析...');
    
    const startTime = performance.now();
    
    try {
      // 如果有指定模板，使用模板的正则表达式
      if (template?.regexParseTemplate) {
        return this.strictParseWithTemplate(content, template);
      }
      
      // 否则使用严格的标准模式
      return this.strictParseWithStandardPatterns(content);
      
    } catch (error) {
      const executionTime = performance.now() - startTime;
      console.error(`❌ [DualParsing] 严格解析失败 (${executionTime.toFixed(2)}ms):`, error);
      
      return {
        success: false,
        fields: {},
        confidence: 0,
        error: `严格解析失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 使用模板进行严格解析
   */
  private strictParseWithTemplate(content: string, template: TriadTemplate): ParseResult {
    const regexTemplate = template.regexParseTemplate;
    const regex = new RegExp(regexTemplate.regex, 'gm');
    
    console.log(`🎯 [DualParsing] 使用模板正则: ${regexTemplate.regex}`);
    
    const match = regex.exec(content);
    if (!match) {
      throw new Error('内容格式不符合模板要求');
    }
    
    const fields: Record<string, string> = {};
    Object.entries(regexTemplate.fieldMappings).forEach(([fieldKey, groupIndex]) => {
      const value = match[groupIndex as number]?.trim() || '';
      if (!value && this.isRequiredField(fieldKey, template)) {
        throw new Error(`必填字段 "${fieldKey}" 为空`);
      }
      fields[fieldKey] = value;
    });
    
    // 验证字段完整性
    this.validateFields(fields, template);
    
    return {
      success: true,
      fields,
      confidence: 100,
      mode: 'strict-template'
    };
  }

  /**
   * 使用标准模式进行严格解析
   */
  private strictParseWithStandardPatterns(content: string): ParseResult {
    const strictPatterns = this.getStrictPatterns();
    
    for (const [mode, pattern] of Object.entries(strictPatterns)) {
      const match = pattern.exec(content);
      if (match) {
        const fields = this.extractFieldsFromMatch(match, mode);
        
        // 严格验证
        if (!fields.front || !fields.back) {
          throw new Error('缺少必填字段 front 或 back');
        }
        
        return {
          success: true,
          fields,
          confidence: 100,
          mode: `strict-${mode}`
        };
      }
    }
    
    throw new Error('内容不符合任何严格模式');
  }

  /**
   * 获取宽松解析模式 - 🔥 内测阶段：只支持新格式的宽松变体
   */
  private getLenientPatterns(): Record<string, RegExp> {
    return {
      // 主模式：标准新格式
      primary: /^!(.+?)\s*\n\n([\s\S]*?)(?=\n!|\n*$)/gms,

      // 备用模式：宽松的新格式
      fallback: /^!(.+?)[\s\n\r]+([\s\S]*?)(?=\n!|\n*$)/gms,

      // 简单模式：最基础的新格式
      simple: /^!(.+?)\s*\n+([\s\S]*?)$/gms
    };
  }

  /**
   * 获取严格解析模式 - 🔥 内测阶段：只支持新格式
   */
  private getStrictPatterns(): Record<string, RegExp> {
    return {
      // 新格式：!字段名模式
      newFormat: /^!(.+?)\s*\n\n([\s\S]*?)(?=\n!|\n*$)/gm,

      // 备用：简化的新格式模式
      simplified: /^!(.+?)\s*\n+([\s\S]*?)(?=\n!|\n*$)/gm
    };
  }

  /**
   * 从匹配结果提取字段
   */
  private extractFieldsFromMatch(match: RegExpExecArray, mode: string): Record<string, string> {
    const fields: Record<string, string> = {};
    
    // 基础字段映射
    if (match[1]) fields.front = match[1].trim();
    if (match[2]) fields.back = match[2].trim();
    if (match[3]) fields.tags = match[3].trim();
    
    // 根据模式调整字段名
    if (mode.includes('qa')) {
      if (fields.front) fields.question = fields.front;
      if (fields.back) fields.answer = fields.back;
    }
    
    return fields;
  }

  /**
   * 计算解析置信度
   */
  private calculateConfidence(mode: string, fields: Record<string, string>, content: string): number {
    let confidence = 0;
    
    // 基础分数
    if (mode === 'primary') confidence = 90;
    else if (mode === 'fallback') confidence = 70;
    else if (mode === 'simple') confidence = 50;
    else if (mode === 'emergency') confidence = 30;
    
    // 字段完整性加分
    if (fields.front && fields.back) confidence += 10;
    if (fields.tags) confidence += 5;
    
    // 内容质量加分
    if (fields.front && fields.front.length > 5) confidence += 5;
    if (fields.back && fields.back.length > 10) confidence += 5;
    
    return Math.min(100, confidence);
  }

  /**
   * 生成警告信息
   */
  private generateWarnings(fields: Record<string, string>, content: string): string[] {
    const warnings: string[] = [];
    
    if (!fields.front || fields.front.length < 3) {
      warnings.push('问题内容过短，建议补充');
    }
    
    if (!fields.back || fields.back.length < 5) {
      warnings.push('答案内容过短，建议补充');
    }
    
    if (!fields.tags) {
      warnings.push('建议添加标签以便分类管理');
    }
    
    if (content.includes('TODO') || content.includes('待完善')) {
      warnings.push('内容包含待完善标记');
    }
    
    return warnings;
  }

  /**
   * 选择回退模板
   */
  private selectFallbackTemplate(content: string): 'basic-qa' | 'basic-cloze' | 'emergency-basic' {
    // 🔧 注意：这些是内部标识符，不是硬编码的模板ID
    // 实际的模板ID应该通过三位一体模板服务获取
    if (content.includes('{{c1::') || content.includes('{{c2::')) {
      return 'basic-cloze';
    }

    if (content.length > 500) {
      return 'basic-qa';
    }

    return 'emergency-basic';
  }

  /**
   * 生成修复建议 - 使用当前SimplifiedParsingSettings系统
   */
  private generateRepairSuggestions(content: string, attempts: ParseAttempt[]): string[] {
    const suggestions: string[] = [];

    // 基于解析尝试生成建议
    if (attempts.every(a => a.error?.includes('模式不匹配'))) {
      suggestions.push('建议使用标准格式：问题内容\\n\\n---div---\\n\\n答案内容');
    }

    if (content.includes('\n') && !content.includes('\n\n')) {
      suggestions.push('建议在字段内容之间添加空行');
    }

    if (!content.includes('---div---')) {
      suggestions.push('建议使用 ---div--- 作为字段分隔符');
    }

    suggestions.push('请使用当前系统支持的格式，例如：问题内容\\n\\n---div---\\n\\n答案内容');

    return suggestions;
  }

  /**
   * 检查是否为必填字段
   */
  private isRequiredField(fieldKey: string, template: TriadTemplate): boolean {
    const field = template.fieldTemplate.fields.find((f: any) =>
      f.type === 'field' && f.key === fieldKey
    );

    // 检查是否有 validation.required 属性（增强字段类型）
    if (field && 'validation' in field) {
      const validation = (field as any).validation;
      if (validation && typeof validation === 'object' && validation.required === true) {
        return true;
      }
    }

    // 对于基础字段类型，使用默认的必填字段判断
    const basicRequiredFields = ['question', 'answer', 'front', 'back'];
    return basicRequiredFields.includes(fieldKey);
  }

  /**
   * 验证字段
   */
  private validateFields(fields: Record<string, string>, template: TriadTemplate): void {
    const requiredFields = template.fieldTemplate.fields
      .filter((f: any) => {
        // 检查字段类型和必填属性
        if (f.type !== 'field') return false;

        // 检查是否有 validation.required 属性（增强字段类型）
        if ('validation' in f) {
          const validation = (f as any).validation;
          return validation && typeof validation === 'object' && validation.required === true;
        }

        // 对于基础字段类型，使用默认的必填字段判断
        const basicRequiredFields = ['question', 'answer', 'front', 'back'];
        return basicRequiredFields.includes(f.key);
      })
      .map((f: any) => f.key);

    for (const requiredField of requiredFields) {
      if (!fields[requiredField] || fields[requiredField].trim() === '') {
        throw new Error(`必填字段 "${requiredField}" 不能为空`);
      }
    }
  }
}
