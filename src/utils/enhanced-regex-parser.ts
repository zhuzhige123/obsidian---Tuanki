/**
 * 增强的正则解析引擎
 * 集成智能边界识别算法，解决内容截断问题
 */

import { IntelligentBoundaryDetector, ParsedContent } from './intelligent-boundary-detection';
import { RegexParseTemplate } from '../data/template-types';
import { FormatPreprocessor, PreprocessingResult } from './format-preprocessor';
import { MultiPatternMatcher, MultiMatchResult } from './multi-pattern-matcher';
import { SemanticContentExtractor, SemanticExtractionResult } from './semantic-content-extractor';
import { getGlobalTemplateCache, type CompiledTemplate } from './template-compilation-cache';

export interface EnhancedParseResult {
  success: boolean;
  fields: Record<string, string>;
  confidence: number;
  method: 'regex' | 'intelligent' | 'hybrid';
  warnings: string[];
  error?: string;
  originalContent?: string; // 保存原始内容到notes字段
}

export interface ParseStrategy {
  name: string;
  priority: number;
  execute: (content: string, template: RegexParseTemplate) => EnhancedParseResult;
}

/**
 * 增强的正则解析器
 * 使用多层次解析策略确保内容不丢失
 */
export class EnhancedRegexParser {
  private boundaryDetector: IntelligentBoundaryDetector;
  private formatPreprocessor: FormatPreprocessor;
  private multiPatternMatcher: MultiPatternMatcher;
  private semanticExtractor: SemanticContentExtractor;
  private strategies: ParseStrategy[];
  private templateCache = getGlobalTemplateCache();

  constructor() {
    this.boundaryDetector = new IntelligentBoundaryDetector();
    this.formatPreprocessor = new FormatPreprocessor();
    this.multiPatternMatcher = new MultiPatternMatcher();
    this.semanticExtractor = new SemanticContentExtractor();
    this.strategies = this.initializeStrategies();

    console.log('🗄️ [EnhancedParser] 解析器已初始化，缓存系统已启用');
  }

  /**
   * 主解析方法 - 使用多层次策略确保解析成功
   */
  parseContent(content: string, template: RegexParseTemplate): EnhancedParseResult {
    console.log(`🚀 [EnhancedParser] 开始增强解析，内容长度: ${content.length}`);

    // 1. 格式预处理
    const preprocessingResult = this.formatPreprocessor.preprocess(content);
    const processedContent = preprocessingResult.processedContent;

    console.log(`🔧 [EnhancedParser] 预处理完成，应用了${preprocessingResult.appliedTransformations.length}个转换`);

    // 首先保存原始内容
    const baseResult: EnhancedParseResult = {
      success: false,
      fields: { notes: content }, // 确保原始内容始终保存
      confidence: 0,
      method: 'regex',
      warnings: preprocessingResult.appliedTransformations.length > 0 ?
        [`应用了格式预处理: ${preprocessingResult.appliedTransformations.join(', ')}`] : [],
      originalContent: content
    };

    // 按优先级尝试不同的解析策略
    for (const strategy of this.strategies) {
      try {
        console.log(`🔍 [EnhancedParser] 尝试策略: ${strategy.name}`);
        // 使用预处理后的内容进行解析
        const result = strategy.execute(processedContent, template);
        
        if (result.success && result.confidence > 0.5) {
          console.log(`✅ [EnhancedParser] 策略成功: ${strategy.name}, 置信度: ${result.confidence}`);
          // 原文保存逻辑已移至_internal字段（待正则解析启用时使用）
          result.originalContent = content;
          return result;
        } else if (result.success) {
          console.log(`⚠️ [EnhancedParser] 策略部分成功: ${strategy.name}, 置信度: ${result.confidence}`);
          // 保存为备选结果
          if (result.confidence > baseResult.confidence) {
            Object.assign(baseResult, result);
            baseResult.originalContent = content;
          }
        }
      } catch (error) {
        console.warn(`❌ [EnhancedParser] 策略失败: ${strategy.name}`, error);
      }
    }

    // 如果所有策略都失败，返回保护性结果
    if (!baseResult.success) {
      console.log(`🛡️ [EnhancedParser] 使用保护性解析`);
      return this.createProtectiveResult(content, template);
    }

    return baseResult;
  }

  /**
   * 初始化解析策略
   */
  private initializeStrategies(): ParseStrategy[] {
    return [
      // 策略1: 严格正则匹配
      {
        name: '严格正则匹配',
        priority: 10,
        execute: (content, template) => this.strictRegexParse(content, template)
      },
      
      // 策略2: 多模式匹配
      {
        name: '多模式匹配',
        priority: 9,
        execute: (content, template) => this.multiPatternParse(content, template)
      },

      // 策略3: 智能边界识别
      {
        name: '智能边界识别',
        priority: 8,
        execute: (content, template) => this.intelligentBoundaryParse(content, template)
      },

      // 策略4: 混合解析
      {
        name: '混合解析',
        priority: 6,
        execute: (content, template) => this.hybridParse(content, template)
      },
      
      // 策略4: 模糊匹配
      {
        name: '模糊匹配',
        priority: 4,
        execute: (content, template) => this.fuzzyParse(content, template)
      },
      
      // 策略5: 语义内容提取
      {
        name: '语义内容提取',
        priority: 3,
        execute: (content, template) => this.semanticExtractionParse(content, template)
      },

      // 策略6: 基于关键词的语义解析
      {
        name: '语义解析',
        priority: 2,
        execute: (content, template) => this.semanticParse(content, template)
      }
    ].sort((a, b) => b.priority - a.priority);
  }

  /**
   * 策略1: 严格正则匹配（原有逻辑的增强版）
   */
  private strictRegexParse(content: string, template: RegexParseTemplate): EnhancedParseResult {
    try {
      // 使用缓存获取编译后的正则表达式
      const compiled = this.templateCache.getCompiledTemplate(template);
      const regex = compiled.compiledRegex;
      
      // 使用全局匹配获取所有可能的匹配
      const globalRegex = new RegExp(compiled.template.regex, compiled.compiledRegex.flags + 'g');
      const matches = Array.from(content.matchAll(globalRegex));
      
      if (matches.length === 0) {
        return {
          success: false,
          fields: { notes: content },
          confidence: 0,
          method: 'regex',
          warnings: ['正则表达式无法匹配内容'],
          originalContent: content
        };
      }

      // 使用第一个匹配结果
      const match = matches[0];
      const fields: Record<string, string> = { notes: content };
      
      Object.entries(template.fieldMappings).forEach(([fieldKey, groupIndex]) => {
        const value = match[groupIndex]?.trim() || '';
        fields[fieldKey] = value;
      });

      // 验证解析完整性
      const completeness = this.validateCompleteness(content, fields);
      
      return {
        success: true,
        fields,
        confidence: completeness.coverage,
        method: 'regex',
        warnings: completeness.coverage < 0.9 ? ['内容可能存在截断'] : [],
        originalContent: content
      };
    } catch (error) {
      return {
        success: false,
        fields: { notes: content },
        confidence: 0,
        method: 'regex',
        warnings: [`正则解析错误: ${error}`],
        originalContent: content
      };
    }
  }

  /**
   * 策略2: 多模式匹配解析
   */
  private multiPatternParse(content: string, template: RegexParseTemplate): EnhancedParseResult {
    try {
      const matchResult: MultiMatchResult = this.multiPatternMatcher.matchContent(content);

      if (!matchResult.bestMatch) {
        return {
          success: false,
          fields: { notes: content },
          confidence: 0,
          method: 'regex',
          warnings: ['多模式匹配未找到合适的模式'],
          originalContent: content
        };
      }

      const { bestMatch } = matchResult;
      const fields = { ...bestMatch.fields, notes: content };

      return {
        success: true,
        fields,
        confidence: bestMatch.confidence,
        method: 'regex',
        warnings: bestMatch.confidence < 0.7 ? ['多模式匹配置信度较低'] : [],
        originalContent: content
      };
    } catch (error) {
      return {
        success: false,
        fields: { notes: content },
        confidence: 0,
        method: 'regex',
        warnings: [`多模式匹配错误: ${error}`],
        originalContent: content
      };
    }
  }

  /**
   * 策略3: 智能边界识别解析
   */
  private intelligentBoundaryParse(content: string, template: RegexParseTemplate): EnhancedParseResult {
    try {
      // 使用智能边界检测器解析内容
      const parsed = this.boundaryDetector.parseContent(content);
      
      if (parsed.confidence < 0.3) {
        return {
          success: false,
          fields: { notes: content },
          confidence: parsed.confidence,
          method: 'intelligent',
          warnings: parsed.warnings,
          originalContent: content
        };
      }

      // 将解析结果映射到模板字段
      const fields = this.mapToTemplateFields(parsed, template);
      fields.notes = content; // 确保保存原始内容

      return {
        success: true,
        fields,
        confidence: parsed.confidence,
        method: 'intelligent',
        warnings: parsed.warnings,
        originalContent: content
      };
    } catch (error) {
      return {
        success: false,
        fields: { notes: content },
        confidence: 0,
        method: 'intelligent',
        warnings: [`智能解析错误: ${error}`],
        originalContent: content
      };
    }
  }

  /**
   * 策略3: 混合解析（结合正则和智能边界）
   */
  private hybridParse(content: string, template: RegexParseTemplate): EnhancedParseResult {
    // 先尝试智能边界识别
    const intelligentResult = this.intelligentBoundaryParse(content, template);
    
    if (intelligentResult.success && intelligentResult.confidence > 0.7) {
      intelligentResult.method = 'hybrid';
      return intelligentResult;
    }

    // 如果智能解析不够好，尝试改进的正则匹配
    const regexResult = this.strictRegexParse(content, template);
    
    if (regexResult.success) {
      // 使用智能边界检测验证正则结果
      const validation = this.boundaryDetector.validateCompleteness(content, {
        question: regexResult.fields.question || '',
        answer: regexResult.fields.answer || '',
        sections: [],
        confidence: regexResult.confidence,
        warnings: []
      });

      regexResult.method = 'hybrid';
      regexResult.confidence = Math.min(regexResult.confidence, validation.coverage);
      
      if (!validation.isComplete) {
        regexResult.warnings.push('检测到可能的内容截断');
      }
    }

    return regexResult;
  }

  /**
   * 策略4: 模糊匹配
   */
  private fuzzyParse(content: string, template: RegexParseTemplate): EnhancedParseResult {
    try {
      // 简化正则表达式，使用更宽松的匹配
      const simplifiedRegex = this.simplifyRegex(template.regex);
      const flags = this.buildRegexFlags(template.parseOptions);
      const regex = new RegExp(simplifiedRegex, flags);
      
      const match = regex.exec(content);
      
      if (!match) {
        return {
          success: false,
          fields: { notes: content },
          confidence: 0,
          method: 'regex',
          warnings: ['模糊匹配也无法解析内容'],
          originalContent: content
        };
      }

      const fields: Record<string, string> = { notes: content };
      
      Object.entries(template.fieldMappings).forEach(([fieldKey, groupIndex]) => {
        const value = match[groupIndex]?.trim() || '';
        fields[fieldKey] = value;
      });

      return {
        success: true,
        fields,
        confidence: 0.6, // 模糊匹配的置信度较低
        method: 'regex',
        warnings: ['使用模糊匹配，建议验证结果'],
        originalContent: content
      };
    } catch (error) {
      return {
        success: false,
        fields: { notes: content },
        confidence: 0,
        method: 'regex',
        warnings: [`模糊匹配错误: ${error}`],
        originalContent: content
      };
    }
  }

  /**
   * 策略5: 语义内容提取解析
   */
  private semanticExtractionParse(content: string, template: RegexParseTemplate): EnhancedParseResult {
    try {
      const extractionResult: SemanticExtractionResult = this.semanticExtractor.extractContent(content);

      if (extractionResult.confidence < 0.3) {
        return {
          success: false,
          fields: { notes: content },
          confidence: extractionResult.confidence,
          method: 'intelligent',
          warnings: extractionResult.warnings,
          originalContent: content
        };
      }

      // 将语义提取结果映射到模板字段
      const fields = this.mapSemanticToTemplateFields(extractionResult, template);
      fields.notes = content; // 确保保存原始内容

      return {
        success: true,
        fields,
        confidence: extractionResult.confidence,
        method: 'intelligent',
        warnings: extractionResult.warnings,
        originalContent: content
      };
    } catch (error) {
      return {
        success: false,
        fields: { notes: content },
        confidence: 0,
        method: 'intelligent',
        warnings: [`语义提取错误: ${error}`],
        originalContent: content
      };
    }
  }

  /**
   * 策略6: 基于关键词的语义解析
   */
  private semanticParse(content: string, template: RegexParseTemplate): EnhancedParseResult {
    try {
      const fields: Record<string, string> = { notes: content };
      
      // 基于关键词识别问题和答案
      const lines = content.split('\n');
      let questionFound = false;
      let questionContent = '';
      let answerContent = '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // 识别问题行
        if (!questionFound && this.isQuestionLine(trimmedLine)) {
          questionContent = this.extractQuestionFromLine(trimmedLine);
          questionFound = true;
          continue;
        }
        
        // 收集答案内容
        if (questionFound && trimmedLine) {
          answerContent += (answerContent ? '\n' : '') + line;
        }
      }
      
      if (questionFound && questionContent) {
        fields.question = questionContent;
        fields.answer = answerContent || content;
        
        return {
          success: true,
          fields,
          confidence: 0.5,
          method: 'intelligent',
          warnings: ['使用语义解析，建议验证结果'],
          originalContent: content
        };
      }
      
      return {
        success: false,
        fields,
        confidence: 0,
        method: 'intelligent',
        warnings: ['语义解析无法识别问题结构'],
        originalContent: content
      };
    } catch (error) {
      return {
        success: false,
        fields: {},
        confidence: 0,
        method: 'intelligent',
        warnings: [`语义解析错误: ${error}`],
        originalContent: content
      };
    }
  }

  /**
   * 创建保护性解析结果 - 尝试基础内容分割
   * 注意：原文保存逻辑已移至_internal字段（待正则解析启用时使用）
   */
  private createProtectiveResult(content: string, template: RegexParseTemplate): EnhancedParseResult {
    const fields: Record<string, string> = {};
    
    // 尝试基本的内容分割
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      fields.question = lines[0]; // 第一行作为问题
      if (lines.length > 1) {
        fields.answer = lines.slice(1).join('\n'); // 其余作为答案
      }
    }
    
    return {
      success: true,
      fields,
      confidence: 0.3,
      method: 'intelligent',
      warnings: [
        '使用保护性解析，已尝试基础内容分割',
        '建议手动检查字段分配是否正确'
      ],
      originalContent: content
    };
  }

  // 辅助方法
  private buildRegexFlags(options?: RegexParseTemplate['parseOptions']): string {
    let flags = '';
    if (options?.multiline) flags += 'm';
    if (options?.ignoreCase) flags += 'i';
    if (options?.global) flags += 'g';
    return flags;
  }

  private validateCompleteness(content: string, fields: Record<string, string>): {
    coverage: number;
    isComplete: boolean;
  } {
    const originalLength = content.replace(/\s+/g, '').length;
    const fieldsContent = Object.values(fields).join('').replace(/\s+/g, '');
    const coverage = fieldsContent.length / originalLength;
    
    return {
      coverage: Math.min(coverage, 1.0),
      isComplete: coverage > 0.9
    };
  }

  private mapToTemplateFields(parsed: ParsedContent, template: RegexParseTemplate): Record<string, string> {
    const fields: Record<string, string> = {};
    
    // 基本映射
    if (template.fieldMappings.question !== undefined) {
      fields.question = parsed.question;
    }
    if (template.fieldMappings.answer !== undefined) {
      fields.answer = parsed.answer;
    }
    
    // 其他字段的智能映射
    Object.keys(template.fieldMappings).forEach(fieldKey => {
      if (!fields[fieldKey]) {
        fields[fieldKey] = ''; // 确保所有字段都有值
      }
    });
    
    return fields;
  }

  private simplifyRegex(regex: string): string {
    // 简化正则表达式，使其更宽松
    return regex
      .replace(/\(\?\=/g, '(') // 移除前瞻断言
      .replace(/\(\?\!/g, '(') // 移除负前瞻断言
      .replace(/\*\?/g, '*') // 将非贪婪改为贪婪
      .replace(/\+\?/g, '+'); // 将非贪婪改为贪婪
  }

  private isQuestionLine(line: string): boolean {
    return /^(##?\s+|问题[:：]|Q[:：]|\*\*.*\*\*[:：])/.test(line);
  }

  private extractQuestionFromLine(line: string): string {
    const patterns = [
      /^##?\s+(.+)/, // 标题
      /^问题[:：]\s*(.+)/, // 中文问题
      /^Q[:：]\s*(.+)/, // Q:格式
      /^\*\*(.*)\*\*[:：]/, // 粗体格式
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return line;
  }

  /**
   * 将语义提取结果映射到模板字段
   */
  private mapSemanticToTemplateFields(
    extractionResult: SemanticExtractionResult,
    template: RegexParseTemplate
  ): Record<string, string> {
    const fields: Record<string, string> = {};

    // 基本映射
    if (template.fieldMappings.question !== undefined) {
      fields.question = extractionResult.question;
    }
    if (template.fieldMappings.answer !== undefined) {
      fields.answer = extractionResult.answer;
    }

    // 映射元数据
    Object.entries(extractionResult.metadata).forEach(([key, value]) => {
      if (template.fieldMappings[key] !== undefined) {
        fields[key] = value;
      }
    });

    // 确保所有模板字段都有值
    Object.keys(template.fieldMappings).forEach(fieldKey => {
      if (!fields[fieldKey] && fieldKey !== 'notes') {
        fields[fieldKey] = '';
      }
    });

    return fields;
  }
}
