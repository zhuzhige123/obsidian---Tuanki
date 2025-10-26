import type AnkiPlugin from '../main';
import type {
  RegexParseTemplate,
  MarkdownTemplate,
  FieldTemplate
} from '../data/template-types';
// 使用现有的预设模板管理器
import { defaultPresetTemplateManager, type PresetTemplateManager } from '../templates/preset-templates';
import { MarkdownHeaderTemplateSystem } from '../utils/markdown-header-template-system';
import { EnhancedRegexParser, EnhancedParseResult } from '../utils/enhanced-regex-parser';
import { ParseResultValidator, ValidationResult } from '../utils/parse-result-validator';

/**
 * MD内容解析结果
 */
export interface MDParseResult {
  success: boolean;
  fields?: Record<string, string>;
  template?: FieldTemplate;
  error?: string;
  warnings?: string[];
}

/**
 * MD内容生成结果
 */
export interface MDGenerateResult {
  success: boolean;
  content?: string;
  template?: FieldTemplate;
  error?: string;
}

/**
 * MD内容解析服务
 * 实现MD内容与结构化字段之间的双向转换
 */
export class MDContentParserService {
  private plugin: AnkiPlugin;
  private presetTemplateManager: PresetTemplateManager;
  private enhancedParser: EnhancedRegexParser;
  private validator: ParseResultValidator;

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    // 使用现有的预设模板管理器
    this.presetTemplateManager = defaultPresetTemplateManager;
    this.enhancedParser = new EnhancedRegexParser();
    this.validator = new ParseResultValidator();
  }

  /**
   * 确定正反面分隔策略
   * 优先级：自定义分隔符 > 字段side属性 > 默认全部正面
   */
  private determineSeparationStrategy(
    content: string,
    fields: Record<string, string>,
    template?: TriadTemplate
  ): {
    strategy: 'separator' | 'field_side' | 'all_front';
    separatorPattern?: string;
    frontFields: string[];
    backFields: string[];
    separatorInfo?: string;
  } {
    // 策略1: 检查是否存在自定义分隔符
    const separatorResult = this.detectCustomSeparator(content);
    if (separatorResult.found) {
      const { frontContent, backContent } = this.splitContentBySeparator(content, separatorResult.pattern);
      return {
        strategy: 'separator',
        separatorPattern: separatorResult.pattern,
        frontFields: Object.keys(fields).filter(key =>
          frontContent.includes(fields[key]) && fields[key].trim()
        ),
        backFields: Object.keys(fields).filter(key =>
          backContent.includes(fields[key]) && fields[key].trim()
        ),
        separatorInfo: `使用分隔符: ${separatorResult.pattern}`
      };
    }

    // 策略2: 使用字段side属性
    if (template?.fieldTemplate?.fields) {
      const frontFields: string[] = [];
      const backFields: string[] = [];

      template.fieldTemplate.fields.forEach(field => {
        if (field.type === 'field' && fields[field.key]?.trim()) {
          if (field.side === 'front') {
            frontFields.push(field.key);
          } else if (field.side === 'back') {
            backFields.push(field.key);
          } else if (field.side === 'both') {
            // both字段根据内容智能分配
            const fieldContent = fields[field.key];
            if (this.isAnswerLikeContent(fieldContent, field.key)) {
              backFields.push(field.key);
            } else {
              frontFields.push(field.key);
            }
          }
        }
      });

      if (backFields.length > 0) {
        return {
          strategy: 'field_side',
          frontFields,
          backFields,
          separatorInfo: `使用字段side属性分配`
        };
      }
    }

    // 策略3: 默认全部正面
    return {
      strategy: 'all_front',
      frontFields: Object.keys(fields).filter(key => fields[key]?.trim()),
      backFields: [],
      separatorInfo: `默认全部显示在正面`
    };
  }

  /**
   * 检测自定义分隔符
   */
  private detectCustomSeparator(content: string): { found: boolean; pattern?: string } {
    const cardParsingSettings = this.plugin.settings?.cardParsing;
    if (cardParsingSettings?.rules) {
      // 按优先级排序，查找启用的分隔符规则
      const separatorRules = cardParsingSettings.rules
        .filter(rule => rule.enabled && rule.type === 'separator')
        .sort((a, b) => b.priority - a.priority);

      for (const rule of separatorRules) {
        if (content.includes(rule.pattern)) {
          return { found: true, pattern: rule.pattern };
        }
      }
    }

    return { found: false };
  }

  /**
   * 按分隔符分割内容
   */
  private splitContentBySeparator(content: string, separator: string): {
    frontContent: string;
    backContent: string;
  } {
    const parts = content.split(separator);
    return {
      frontContent: parts[0] || '',
      backContent: parts.slice(1).join(separator) || ''
    };
  }

  /**
   * 判断是否为答案类内容
   */
  private isAnswerLikeContent(content: string, fieldKey: string): boolean {
    const key = fieldKey.toLowerCase();
    const text = content.toLowerCase();

    // 基于字段名判断
    if (key.includes('answer') || key.includes('back') || key.includes('解析') ||
        key.includes('explanation') || key.includes('solution')) {
      return true;
    }

    // 基于内容判断
    const answerKeywords = ['答案', '解答', '因为', '所以', '原因', '解析'];
    return answerKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * 解析MD内容到结构化字段（优先使用新的标题格式）
   * @param content MD内容
   * @param templateId 指定的模板ID（可选）
   * @returns 解析结果
   */
  async parseToFields(content: string, templateId?: string): Promise<MDParseResult> {
    try {
      // 首先尝试使用新的Markdown标题格式解析
      const headerParseResult = MarkdownHeaderTemplateSystem.parseContentToFields(content);

      if (headerParseResult.success && headerParseResult.fields) {
        // 确保三位一体模板已加载
        await this.triadService.loadTriadTemplates();

        // 如果指定了模板ID，验证是否匹配
        if (templateId && headerParseResult.templateId && headerParseResult.templateId !== templateId) {
          console.warn(`内容中的模板ID (${headerParseResult.templateId}) 与指定的模板ID (${templateId}) 不匹配`);
        }

        // 使用内容中的模板ID或指定的模板ID
        const finalTemplateId = templateId || headerParseResult.templateId;
        let targetTemplate: TriadTemplate | undefined;

        if (finalTemplateId) {
          targetTemplate = this.triadService.getTriadTemplate(finalTemplateId);
        }

        // 应用分隔符优先级逻辑
        const separationStrategy = this.determineSeparationStrategy(
          content,
          headerParseResult.fields,
          targetTemplate
        );

        return {
          success: true,
          fields: headerParseResult.fields,
          template: targetTemplate,
          warnings: [
            ...(headerParseResult.warnings || []),
            separationStrategy.separatorInfo || ''
          ].filter(Boolean)
        };
      }

      // 新格式解析失败，返回错误
      return {
        success: false,
        error: headerParseResult.error || '解析失败，请检查内容格式'
      };

      // 使用正则解析模板解析内容
      const parseResult = this.parseWithRegexTemplate(content, targetTemplate.regexParseTemplate);

      if (parseResult.success) {
        return {
          success: true,
          fields: parseResult.fields,
          template: targetTemplate,
          warnings: parseResult.warnings
        };
      } else {
        return {
          success: false,
          error: parseResult.error,
          template: targetTemplate
        };
      }
    } catch (error) {
      console.error('MD content parsing failed:', error);
      return {
        success: false,
        error: `解析失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 从结构化字段生成MD内容（使用新的标题格式）
   * @param fields 字段数据
   * @param templateId 模板ID
   * @returns 生成结果
   */
  async generateFromFields(fields: Record<string, string>, templateId: string): Promise<MDGenerateResult> {
    try {
      await this.triadService.loadTriadTemplates();

      const template = this.triadService.getTriadTemplate(templateId);
      if (!template) {
        return {
          success: false,
          error: `找不到指定的模板: ${templateId}`
        };
      }

      // 优先使用新的Markdown标题格式生成内容
      const headerResult = MarkdownHeaderTemplateSystem.generateContentFromFields(fields, template);

      if (headerResult.success && headerResult.content) {
        // 应用分隔符优先级逻辑到生成的内容
        const separationStrategy = this.determineSeparationStrategy(
          headerResult.content,
          fields,
          template
        );

        return {
          success: true,
          content: headerResult.content,
          template,
          warnings: [
            ...(headerResult.warnings || []),
            separationStrategy.separatorInfo || ''
          ].filter(Boolean)
        };
      }

      // 如果新格式生成失败，回退到原有的Mustache模板方式
      const content = this.generateWithMarkdownTemplate(fields, template.markdownTemplate);

      return {
        success: true,
        content,
        template,
        warnings: headerResult.warnings ? [`新格式生成失败，使用传统格式: ${headerResult.error}`] : undefined
      };
    } catch (error) {
      console.error('MD content generation failed:', error);
      return {
        success: false,
        error: `生成失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 使用增强的正则解析模板解析内容
   * 集成智能边界识别和贪婪匹配策略
   */
  private parseWithRegexTemplate(
    content: string,
    regexTemplate: RegexParseTemplate
  ): { success: boolean; fields?: Record<string, string>; error?: string; warnings?: string[] } {
    try {
      console.log(`🚀 [MDContentParser] 使用增强解析引擎解析内容`);
      console.log(`📝 [MDContentParser] 内容长度: ${content.length} 字符`);
      console.log(`🎯 [MDContentParser] 模板: ${regexTemplate.name || 'unnamed'}`);

      // 使用增强解析引擎
      const result: EnhancedParseResult = this.enhancedParser.parseContent(content, regexTemplate);

      console.log(`📊 [MDContentParser] 解析结果: 成功=${result.success}, 置信度=${result.confidence}, 方法=${result.method}`);

      if (result.success) {
        // 原文保存逻辑已移至_internal字段（待正则解析启用时使用）

        // 使用验证器验证解析结果
        const expectedFields = Object.keys(regexTemplate.fieldMappings);
        const validation: ValidationResult = this.validator.validateParseResult(
          content,
          result.fields,
          expectedFields
        );

        console.log(`🔍 [MDContentParser] 验证结果: 有效=${validation.isValid}, 置信度=${(validation.confidence * 100).toFixed(1)}%`);

        // 记录验证问题
        if (validation.issues.length > 0) {
          console.log(`⚠️ [MDContentParser] 发现${validation.issues.length}个验证问题:`);
          validation.issues.forEach(issue => {
            console.log(`   - ${issue.severity}: ${issue.message}`);
          });
        }

        // 合并警告信息
        const allWarnings = [
          ...result.warnings,
          ...validation.issues.map(issue => issue.message),
          ...validation.suggestions
        ];

        // 记录解析统计信息
        this.logParseStatistics(content, result, validation);

        return {
          success: validation.isValid,
          fields: result.fields,
          warnings: allWarnings.length > 0 ? allWarnings : undefined
        };
      } else {
        console.warn(`❌ [MDContentParser] 解析失败: ${result.error}`);

        // 即使解析失败，也要确保原始内容不丢失
        const protectiveFields: Record<string, string> = {
          notes: content,
          // 尝试基本的内容分割作为后备
          ...this.createFallbackFields(content, regexTemplate)
        };

        return {
          success: false,
          error: result.error || '增强解析引擎无法处理此内容',
          fields: protectiveFields // 返回保护性字段，确保内容不丢失
        };
      }
    } catch (error) {
      console.error(`💥 [MDContentParser] 增强解析引擎异常:`, error);

      // 异常情况下的保护性处理
      const protectiveFields: Record<string, string> = {
        notes: content,
        ...this.createFallbackFields(content, regexTemplate)
      };

      return {
        success: false,
        error: `增强解析引擎异常: ${error instanceof Error ? error.message : String(error)}`,
        fields: protectiveFields
      };
    }
  }

  /**
   * 使用MD格式化模板生成内容
   */
  private generateWithMarkdownTemplate(
    fields: Record<string, string>, 
    markdownTemplate: MarkdownTemplate
  ): string {
    let content = markdownTemplate.markdownContent;

    // 替换所有字段占位符
    Object.entries(markdownTemplate.fieldPlaceholders).forEach(([fieldKey, placeholder]) => {
      const value = fields[fieldKey] || '';
      content = content.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    return content;
  }

  /**
   * 构建正则表达式标志
   */
  private buildRegexFlags(options?: RegexParseTemplate['parseOptions']): string {
    let flags = '';
    if (options?.multiline) flags += 'm';
    if (options?.ignoreCase) flags += 'i';
    if (options?.global) flags += 'g';
    return flags;
  }

  /**
   * 记录解析统计信息
   */
  private logParseStatistics(
    originalContent: string,
    result: EnhancedParseResult,
    validation?: ValidationResult
  ): void {
    const originalLength = originalContent.length;
    const fieldsContent = Object.values(result.fields).join('');
    const coverage = fieldsContent.length / originalLength;

    console.log(`📈 [MDContentParser] 解析统计:`);
    console.log(`   - 原始内容长度: ${originalLength} 字符`);
    console.log(`   - 解析字段总长度: ${fieldsContent.length} 字符`);
    console.log(`   - 内容覆盖率: ${(coverage * 100).toFixed(1)}%`);
    console.log(`   - 解析方法: ${result.method}`);
    console.log(`   - 解析置信度: ${(result.confidence * 100).toFixed(1)}%`);

    if (validation) {
      console.log(`   - 验证置信度: ${(validation.confidence * 100).toFixed(1)}%`);
      console.log(`   - 字段数量: ${validation.statistics.fieldCount}`);
      console.log(`   - 空字段数: ${validation.statistics.emptyFields}`);
      console.log(`   - 平均字段长度: ${validation.statistics.averageFieldLength.toFixed(1)} 字符`);

      // 显示字段分布
      const distribution = Object.entries(validation.statistics.contentDistribution)
        .filter(([key]) => key !== 'notes')
        .map(([key, length]) => `${key}:${length}`)
        .join(', ');
      if (distribution) {
        console.log(`   - 字段分布: ${distribution}`);
      }
    }

    if (coverage < 0.9) {
      console.warn(`⚠️ [MDContentParser] 内容覆盖率较低，可能存在截断`);
    }

    if (validation && !validation.isValid) {
      console.warn(`⚠️ [MDContentParser] 验证失败，建议检查解析结果`);
    }
  }

  /**
   * 创建后备字段（当解析失败时使用）
   */
  private createFallbackFields(content: string, template: RegexParseTemplate): Record<string, string> {
    const fields: Record<string, string> = {};

    // 尝试基本的内容分割
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length > 0) {
      // 如果模板有question字段，将第一行作为问题
      if (template.fieldMappings.question !== undefined) {
        fields.question = lines[0];
      }

      // 如果模板有answer字段，将其余内容作为答案
      if (template.fieldMappings.answer !== undefined && lines.length > 1) {
        fields.answer = lines.slice(1).join('\n');
      }

      // 为其他字段设置空值
      Object.keys(template.fieldMappings).forEach(fieldKey => {
        if (!fields[fieldKey] && fieldKey !== 'notes') {
          fields[fieldKey] = '';
        }
      });
    }

    console.log(`🔄 [MDContentParser] 创建后备字段:`, Object.keys(fields));
    return fields;
  }

  /**
   * 自动选择最佳匹配的模板
   */
  private async findBestMatchingTemplate(content: string): Promise<TriadTemplate | undefined> {
    const allTemplates = this.triadService.getAllTriadTemplates();
    
    // 计算每个模板的匹配分数
    const scores: Array<{ template: TriadTemplate; score: number }> = [];

    for (const template of allTemplates) {
      const score = this.calculateMatchScore(content, template);
      if (score > 0) {
        scores.push({ template, score });
      }
    }

    // 按分数排序，返回最高分的模板
    scores.sort((a, b) => b.score - a.score);
    return scores.length > 0 ? scores[0].template : undefined;
  }

  /**
   * 计算内容与模板的匹配分数
   */
  private calculateMatchScore(content: string, template: TriadTemplate): number {
    try {
      const regexTemplate = template.regexParseTemplate;
      const flags = this.buildRegexFlags(regexTemplate.parseOptions);
      const regex = new RegExp(regexTemplate.regex, flags);
      
      const match = regex.exec(content);
      if (!match) return 0;

      // 基础匹配分数
      let score = 100;

      // 根据匹配的字段数量调整分数
      const matchedFields = Object.entries(regexTemplate.fieldMappings).filter(
        ([_, groupIndex]) => match[groupIndex] && match[groupIndex].trim()
      );
      
      const fieldMatchRatio = matchedFields.length / Object.keys(regexTemplate.fieldMappings).length;
      score *= fieldMatchRatio;

      // 根据匹配内容的长度调整分数（更长的匹配通常更准确）
      const matchLength = match[0].length;
      const contentLength = content.length;
      const lengthRatio = matchLength / contentLength;
      score *= (0.5 + lengthRatio * 0.5); // 长度比例在0.5-1.0之间调整分数

      // 官方模板优先
      if (template.isOfficial) {
        score *= 1.2;
      }

      return score;
    } catch (error) {
      console.error('Error calculating match score:', error);
      return 0;
    }
  }

  /**
   * 验证MD内容格式
   */
  async validateContent(content: string, templateId?: string): Promise<{
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    if (!content.trim()) {
      issues.push('内容为空');
      return { isValid: false, issues, suggestions };
    }

    if (templateId) {
      const template = this.triadService.getTriadTemplate(templateId);
      if (template) {
        const parseResult = this.parseWithRegexTemplate(content, template.regexParseTemplate);
        if (!parseResult.success) {
          issues.push(parseResult.error || '内容格式不符合模板要求');
          // ⚠️ 已弃用：旧的“!字段名”格式。请使用当前简化解析格式
          suggestions.push('请使用当前格式：正反面使用 ---div--- 分隔，示例：\\n\\n什么是机器学习？\\n\\n---div---\\n\\n机器学习是人工智能的一个分支。 #tuanki');
        } else if (parseResult.warnings) {
          issues.push(...parseResult.warnings);
        }
      }
    } else {
      const bestTemplate = await this.findBestMatchingTemplate(content);
      if (!bestTemplate) {
        issues.push('没有找到匹配的模板');
        suggestions.push('请检查内容格式是否正确，或创建新的模板');
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions
    };
  }

  /**
   * 获取所有可用的三位一体模板
   */
  async getAvailableTemplates(): Promise<TriadTemplate[]> {
    await this.triadService.loadTriadTemplates();
    return this.triadService.getAllTriadTemplates();
  }
}

// 单例服务实例
let mdContentParserServiceInstance: MDContentParserService | null = null;

export function getMDContentParserService(plugin: AnkiPlugin): MDContentParserService {
  if (!mdContentParserServiceInstance) {
    mdContentParserServiceInstance = new MDContentParserService(plugin);
  }
  return mdContentParserServiceInstance;
}
