/**
 * 优雅降级策略管理器
 * 实现分层解析策略，确保在任何情况下都能保护用户内容
 */

import { RegexParseTemplate } from '../data/template-types';
import { DataProtectionService, DataSnapshot } from '../services/data-protection-service';

export interface DegradationLevel {
  level: number;
  name: string;
  description: string;
  strategy: DegradationStrategy;
  minConfidence: number;
  fallbackEnabled: boolean;
}

export interface DegradationStrategy {
  id: string;
  name: string;
  execute: (content: string, template: RegexParseTemplate, context: DegradationContext) => DegradationResult;
  priority: number;
  reliability: number;
}

export interface DegradationContext {
  originalContent: string;
  previousAttempts: DegradationAttempt[];
  userPreferences: {
    preferAccuracy: boolean;
    allowPartialResults: boolean;
    enableFallbackStrategies: boolean;
  };
  cardId?: string;
  protectionService?: DataProtectionService;
}

export interface DegradationAttempt {
  level: number;
  strategy: string;
  result: DegradationResult;
  timestamp: number;
  executionTime: number;
}

export interface DegradationResult {
  success: boolean;
  confidence: number;
  fields: Record<string, string>;
  method: string;
  warnings: string[];
  errors: string[];
  preservedContent: boolean;
  degradationLevel: number;
  nextLevelSuggested?: number;
}

export interface GracefulDegradationReport {
  finalResult: DegradationResult;
  attempts: DegradationAttempt[];
  totalExecutionTime: number;
  degradationPath: string[];
  recommendations: string[];
  dataProtected: boolean;
}

/**
 * 优雅降级策略管理器
 * 提供多层次的解析策略，确保用户内容永不丢失
 */
export class GracefulDegradationManager {
  private degradationLevels: DegradationLevel[];
  private strategies: Map<string, DegradationStrategy>;
  private protectionService?: DataProtectionService;

  constructor(protectionService?: DataProtectionService) {
    this.protectionService = protectionService;
    this.strategies = new Map();
    this.initializeStrategies();
    this.degradationLevels = this.initializeDegradationLevels();
  }

  /**
   * 执行优雅降级解析
   */
  async executeGracefulDegradation(
    content: string,
    template: RegexParseTemplate,
    context: Partial<DegradationContext> = {}
  ): Promise<GracefulDegradationReport> {
    const startTime = Date.now();
    const attempts: DegradationAttempt[] = [];
    const degradationPath: string[] = [];
    
    console.log(`🔄 [GracefulDegradation] 开始优雅降级解析`);
    console.log(`📝 [GracefulDegradation] 内容长度: ${content.length} 字符`);

    // 构建完整的上下文
    const fullContext: DegradationContext = {
      originalContent: content,
      previousAttempts: [],
      userPreferences: {
        preferAccuracy: true,
        allowPartialResults: true,
        enableFallbackStrategies: true,
        ...context.userPreferences
      },
      cardId: context.cardId,
      protectionService: this.protectionService,
      ...context
    };

    // 首先保护数据
    let dataSnapshot: DataSnapshot | null = null;
    if (this.protectionService && fullContext.cardId) {
      dataSnapshot = this.protectionService.protectData(
        fullContext.cardId,
        content,
        { notes: content }, // 初始保护
        { method: 'graceful_degradation', confidence: 0 }
      );
    }

    let finalResult: DegradationResult | null = null;

    // 按降级级别依次尝试
    for (const level of this.degradationLevels) {
      console.log(`🎯 [GracefulDegradation] 尝试降级级别 ${level.level}: ${level.name}`);
      
      const attemptStartTime = Date.now();
      
      try {
        const result = level.strategy.execute(content, template, {
          ...fullContext,
          previousAttempts: attempts
        });

        const executionTime = Date.now() - attemptStartTime;
        
        const attempt: DegradationAttempt = {
          level: level.level,
          strategy: level.strategy.name,
          result,
          timestamp: Date.now(),
          executionTime
        };

        attempts.push(attempt);
        degradationPath.push(`L${level.level}:${level.strategy.name}`);

        // 检查结果是否满足最低要求
        if (result.success && result.confidence >= level.minConfidence) {
          console.log(`✅ [GracefulDegradation] 降级成功: ${level.name} (置信度: ${(result.confidence * 100).toFixed(1)}%)`);
          finalResult = result;
          break;
        } else if (result.success && level.fallbackEnabled) {
          console.log(`⚠️ [GracefulDegradation] 部分成功: ${level.name} (置信度: ${(result.confidence * 100).toFixed(1)}%)`);
          if (!finalResult || result.confidence > finalResult.confidence) {
            finalResult = result; // 保存最佳结果作为后备
          }
        } else {
          console.log(`❌ [GracefulDegradation] 降级失败: ${level.name}`);
        }
      } catch (error) {
        const executionTime = Date.now() - attemptStartTime;
        
        console.error(`💥 [GracefulDegradation] 降级异常: ${level.name}`, error);
        
        const failedResult: DegradationResult = {
          success: false,
          confidence: 0,
          fields: { notes: content },
          method: level.strategy.name,
          warnings: [],
          errors: [`降级策略执行异常: ${error instanceof Error ? error.message : String(error)}`],
          preservedContent: true,
          degradationLevel: level.level
        };

        attempts.push({
          level: level.level,
          strategy: level.strategy.name,
          result: failedResult,
          timestamp: Date.now(),
          executionTime
        });
      }
    }

    // 如果所有策略都失败，使用最终保护策略
    if (!finalResult) {
      console.log(`🛡️ [GracefulDegradation] 使用最终保护策略`);
      finalResult = this.createProtectiveResult(content, template);
      degradationPath.push('FINAL:protective');
    }

    // 原文保存逻辑已移至_internal字段（待正则解析启用时使用）

    const totalExecutionTime = Date.now() - startTime;
    const recommendations = this.generateRecommendations(attempts, finalResult);

    console.log(`🏁 [GracefulDegradation] 降级完成: ${finalResult.method} (总耗时: ${totalExecutionTime}ms)`);

    return {
      finalResult,
      attempts,
      totalExecutionTime,
      degradationPath,
      recommendations,
      dataProtected: dataSnapshot !== null
    };
  }

  /**
   * 初始化降级策略
   */
  private initializeStrategies(): void {
    // 策略1: 严格正则匹配
    this.strategies.set('strict_regex', {
      id: 'strict_regex',
      name: '严格正则匹配',
      execute: (content, template, context) => this.strictRegexStrategy(content, template, context),
      priority: 10,
      reliability: 0.9
    });

    // 策略2: 宽松正则匹配
    this.strategies.set('relaxed_regex', {
      id: 'relaxed_regex',
      name: '宽松正则匹配',
      execute: (content, template, context) => this.relaxedRegexStrategy(content, template, context),
      priority: 8,
      reliability: 0.8
    });

    // 策略3: 模糊匹配
    this.strategies.set('fuzzy_matching', {
      id: 'fuzzy_matching',
      name: '模糊匹配',
      execute: (content, template, context) => this.fuzzyMatchingStrategy(content, template, context),
      priority: 6,
      reliability: 0.7
    });

    // 策略4: 语义分析
    this.strategies.set('semantic_analysis', {
      id: 'semantic_analysis',
      name: '语义分析',
      execute: (content, template, context) => this.semanticAnalysisStrategy(content, template, context),
      priority: 5,
      reliability: 0.6
    });

    // 策略5: 简单分割
    this.strategies.set('simple_split', {
      id: 'simple_split',
      name: '简单分割',
      execute: (content, template, context) => this.simpleSplitStrategy(content, template, context),
      priority: 3,
      reliability: 0.5
    });

    // 策略6: 保护性解析
    this.strategies.set('protective_parsing', {
      id: 'protective_parsing',
      name: '保护性解析',
      execute: (content, template, context) => this.protectiveParsingStrategy(content, template, context),
      priority: 1,
      reliability: 1.0 // 保护性解析总是成功
    });
  }

  /**
   * 初始化降级级别
   */
  private initializeDegradationLevels(): DegradationLevel[] {
    return [
      {
        level: 1,
        name: '严格匹配',
        description: '使用原始正则表达式进行严格匹配',
        strategy: this.strategies.get('strict_regex')!,
        minConfidence: 0.8,
        fallbackEnabled: false
      },
      {
        level: 2,
        name: '宽松匹配',
        description: '放宽正则表达式约束，允许格式变化',
        strategy: this.strategies.get('relaxed_regex')!,
        minConfidence: 0.7,
        fallbackEnabled: true
      },
      {
        level: 3,
        name: '模糊匹配',
        description: '使用模糊匹配算法处理不规范格式',
        strategy: this.strategies.get('fuzzy_matching')!,
        minConfidence: 0.6,
        fallbackEnabled: true
      },
      {
        level: 4,
        name: '语义分析',
        description: '基于语义分析识别内容结构',
        strategy: this.strategies.get('semantic_analysis')!,
        minConfidence: 0.5,
        fallbackEnabled: true
      },
      {
        level: 5,
        name: '简单分割',
        description: '使用简单规则分割内容',
        strategy: this.strategies.get('simple_split')!,
        minConfidence: 0.3,
        fallbackEnabled: true
      },
      {
        level: 6,
        name: '保护性解析',
        description: '确保内容不丢失的最后防线',
        strategy: this.strategies.get('protective_parsing')!,
        minConfidence: 0.1,
        fallbackEnabled: true
      }
    ];
  }

  // 具体策略实现

  private strictRegexStrategy(content: string, template: RegexParseTemplate, context: DegradationContext): DegradationResult {
    try {
      const flags = this.buildRegexFlags(template.parseOptions);
      const regex = new RegExp(template.regex, flags);
      const match = regex.exec(content);

      if (!match) {
        return {
          success: false,
          confidence: 0,
          fields: { notes: content },
          method: 'strict_regex',
          warnings: ['严格正则匹配失败'],
          errors: ['内容格式不匹配模板规则'],
          preservedContent: true,
          degradationLevel: 1,
          nextLevelSuggested: 2
        };
      }

      const fields: Record<string, string> = { notes: content };
      Object.entries(template.fieldMappings).forEach(([fieldKey, groupIndex]) => {
        fields[fieldKey] = match[groupIndex]?.trim() || '';
      });

      const coverage = this.calculateCoverage(content, fields);

      return {
        success: true,
        confidence: coverage,
        fields,
        method: 'strict_regex',
        warnings: coverage < 0.9 ? ['内容覆盖率较低'] : [],
        errors: [],
        preservedContent: true,
        degradationLevel: 1
      };
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        fields: { notes: content },
        method: 'strict_regex',
        warnings: [],
        errors: [`正则表达式错误: ${error}`],
        preservedContent: true,
        degradationLevel: 1,
        nextLevelSuggested: 2
      };
    }
  }

  private relaxedRegexStrategy(content: string, template: RegexParseTemplate, context: DegradationContext): DegradationResult {
    try {
      // 放宽正则表达式约束
      let relaxedRegex = template.regex
        .replace(/\(\?\=/g, '(') // 移除前瞻断言
        .replace(/\(\?\!/g, '(') // 移除负前瞻断言
        .replace(/\*\?/g, '*') // 非贪婪改为贪婪
        .replace(/\+\?/g, '+'); // 非贪婪改为贪婪

      const flags = this.buildRegexFlags(template.parseOptions);
      const regex = new RegExp(relaxedRegex, flags);
      const match = regex.exec(content);

      if (!match) {
        return {
          success: false,
          confidence: 0,
          fields: { notes: content },
          method: 'relaxed_regex',
          warnings: ['宽松正则匹配失败'],
          errors: ['即使放宽约束也无法匹配内容'],
          preservedContent: true,
          degradationLevel: 2,
          nextLevelSuggested: 3
        };
      }

      const fields: Record<string, string> = { notes: content };
      Object.entries(template.fieldMappings).forEach(([fieldKey, groupIndex]) => {
        fields[fieldKey] = match[groupIndex]?.trim() || '';
      });

      const coverage = this.calculateCoverage(content, fields);

      return {
        success: true,
        confidence: coverage * 0.9, // 宽松匹配置信度略低
        fields,
        method: 'relaxed_regex',
        warnings: ['使用了宽松匹配规则'],
        errors: [],
        preservedContent: true,
        degradationLevel: 2
      };
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        fields: { notes: content },
        method: 'relaxed_regex',
        warnings: [],
        errors: [`宽松正则表达式错误: ${error}`],
        preservedContent: true,
        degradationLevel: 2,
        nextLevelSuggested: 3
      };
    }
  }

  private fuzzyMatchingStrategy(content: string, template: RegexParseTemplate, context: DegradationContext): DegradationResult {
    // 模糊匹配：尝试识别可能的问题和答案模式
    const lines = content.split('\n').filter(line => line.trim());
    const fields: Record<string, string> = { notes: content };

    let questionFound = false;
    let questionLine = '';
    let answerLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 模糊识别问题行
      if (!questionFound && this.looksLikeQuestion(line)) {
        questionLine = this.cleanQuestionText(line);
        questionFound = true;
        answerLines = lines.slice(i + 1);
        break;
      }
    }

    if (!questionFound && lines.length > 0) {
      // 如果没有明确的问题，使用第一行
      questionLine = lines[0];
      answerLines = lines.slice(1);
    }

    if (template.fieldMappings.question !== undefined) {
      fields.question = questionLine;
    }
    if (template.fieldMappings.answer !== undefined) {
      fields.answer = answerLines.join('\n');
    }

    const confidence = questionFound ? 0.6 : 0.4;

    return {
      success: true,
      confidence,
      fields,
      method: 'fuzzy_matching',
      warnings: ['使用模糊匹配，建议验证结果'],
      errors: [],
      preservedContent: true,
      degradationLevel: 3
    };
  }

  private semanticAnalysisStrategy(content: string, template: RegexParseTemplate, context: DegradationContext): DegradationResult {
    // 简化的语义分析
    const fields: Record<string, string> = { notes: content };
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return {
        success: false,
        confidence: 0,
        fields,
        method: 'semantic_analysis',
        warnings: [],
        errors: ['内容为空'],
        preservedContent: true,
        degradationLevel: 4,
        nextLevelSuggested: 5
      };
    }

    // 基于关键词的语义分析
    let bestQuestionIndex = -1;
    let bestQuestionScore = 0;

    for (let i = 0; i < lines.length; i++) {
      const score = this.calculateQuestionScore(lines[i]);
      if (score > bestQuestionScore) {
        bestQuestionScore = score;
        bestQuestionIndex = i;
      }
    }

    if (bestQuestionIndex >= 0) {
      if (template.fieldMappings.question !== undefined) {
        fields.question = lines[bestQuestionIndex];
      }
      if (template.fieldMappings.answer !== undefined) {
        const answerLines = lines.filter((_, index) => index !== bestQuestionIndex);
        fields.answer = answerLines.join('\n');
      }
    } else {
      // 后备方案
      if (template.fieldMappings.question !== undefined) {
        fields.question = lines[0];
      }
      if (template.fieldMappings.answer !== undefined && lines.length > 1) {
        fields.answer = lines.slice(1).join('\n');
      }
    }

    return {
      success: true,
      confidence: bestQuestionScore > 0.3 ? 0.5 : 0.3,
      fields,
      method: 'semantic_analysis',
      warnings: ['使用语义分析，建议验证结果'],
      errors: [],
      preservedContent: true,
      degradationLevel: 4
    };
  }

  private simpleSplitStrategy(content: string, template: RegexParseTemplate, context: DegradationContext): DegradationResult {
    const fields: Record<string, string> = { notes: content };
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return {
        success: false,
        confidence: 0,
        fields,
        method: 'simple_split',
        warnings: [],
        errors: ['内容为空'],
        preservedContent: true,
        degradationLevel: 5,
        nextLevelSuggested: 6
      };
    }

    // 简单分割：第一行作为问题，其余作为答案
    if (template.fieldMappings.question !== undefined) {
      fields.question = lines[0];
    }
    if (template.fieldMappings.answer !== undefined && lines.length > 1) {
      fields.answer = lines.slice(1).join('\n');
    }

    return {
      success: true,
      confidence: 0.3,
      fields,
      method: 'simple_split',
      warnings: ['使用简单分割策略，建议手动检查结果'],
      errors: [],
      preservedContent: true,
      degradationLevel: 5
    };
  }

  private protectiveParsingStrategy(content: string, template: RegexParseTemplate, context: DegradationContext): DegradationResult {
    // 保护性解析：确保内容不丢失
    const fields: Record<string, string> = { notes: content };

    // 为所有模板字段设置默认值
    Object.keys(template.fieldMappings).forEach(fieldKey => {
      if (fieldKey !== 'notes') {
        fields[fieldKey] = '';
      }
    });

    // 如果有question字段，尝试提取第一行
    if (template.fieldMappings.question !== undefined) {
      const firstLine = content.split('\n')[0];
      if (firstLine && firstLine.trim()) {
        fields.question = firstLine.trim();
      }
    }

    return {
      success: true,
      confidence: 0.2,
      fields,
      method: 'protective_parsing',
      warnings: [
        '使用保护性解析，内容已完整保存在notes字段',
        '建议手动检查和调整字段分配'
      ],
      errors: [],
      preservedContent: true,
      degradationLevel: 6
    };
  }

  // 辅助方法

  private createProtectiveResult(content: string, template: RegexParseTemplate): DegradationResult {
    return this.protectiveParsingStrategy(content, template, {
      originalContent: content,
      previousAttempts: [],
      userPreferences: {
        preferAccuracy: false,
        allowPartialResults: true,
        enableFallbackStrategies: true
      }
    });
  }

  private buildRegexFlags(options?: RegexParseTemplate['parseOptions']): string {
    let flags = '';
    if (options?.multiline) flags += 'm';
    if (options?.ignoreCase) flags += 'i';
    if (options?.global) flags += 'g';
    return flags;
  }

  private calculateCoverage(content: string, fields: Record<string, string>): number {
    const originalLength = content.replace(/\s+/g, '').length;
    const fieldsContent = Object.values(fields).join('').replace(/\s+/g, '');
    return originalLength > 0 ? Math.min(fieldsContent.length / originalLength, 1.0) : 0;
  }

  private looksLikeQuestion(text: string): boolean {
    const questionPatterns = [
      /[？?]$/, // 以问号结尾
      /^(什么|如何|为什么|怎么|哪个|哪些|何时|何地|Who|What|When|Where|Why|How)/i, // 疑问词开头
      /^(请|试|解释|说明|描述|分析|比较|列举)/i, // 指令性开头
      /^##?\s+/, // 标题格式
      /^\*\*.*\*\*[:：]/, // 粗体格式
    ];
    
    return questionPatterns.some(pattern => pattern.test(text.trim()));
  }

  private cleanQuestionText(text: string): string {
    return text
      .replace(/^##?\s+/, '') // 移除标题标记
      .replace(/^\*\*(.*)\*\*[:：]?/, '$1') // 移除粗体标记
      .replace(/^(问题?[:：]|Question[:：]?)\s*/i, '') // 移除问题前缀
      .trim();
  }

  private calculateQuestionScore(text: string): number {
    let score = 0;
    
    if (/[？?]$/.test(text)) score += 0.4;
    if (/^(什么|如何|为什么|怎么|哪个|哪些|何时|何地|Who|What|When|Where|Why|How)/i.test(text)) score += 0.3;
    if (/^##?\s+/.test(text)) score += 0.2;
    if (text.length < 100) score += 0.1; // 短文本更可能是问题
    
    return Math.min(score, 1.0);
  }

  private generateRecommendations(attempts: DegradationAttempt[], finalResult: DegradationResult): string[] {
    const recommendations: string[] = [];

    if (finalResult.degradationLevel > 3) {
      recommendations.push('建议检查原始内容格式，确保符合模板要求');
    }

    if (finalResult.confidence < 0.5) {
      recommendations.push('解析置信度较低，建议手动验证结果');
    }

    if (attempts.length > 3) {
      recommendations.push('多次降级尝试，建议优化内容格式或模板规则');
    }

    const hasErrors = attempts.some(a => a.result.errors.length > 0);
    if (hasErrors) {
      recommendations.push('检测到解析错误，建议查看详细错误信息');
    }

    return recommendations;
  }
}
