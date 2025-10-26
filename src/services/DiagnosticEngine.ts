/**
 * 智能诊断引擎
 * 用于检测卡片内容问题并提供修复建议
 */

import type { Card } from '../data/types';
import { ContentExtractor } from './ContentExtractor';

/**
 * 诊断规则接口
 */
export interface DiagnosticRule {
  id: string;
  name: string;
  description: string;
  check: (card: Card) => DiagnosticResult;
  fix?: (card: Card) => Promise<Card>;
  canAutoFix: boolean;
  severity: 'info' | 'warning' | 'error';
  category: 'format' | 'content' | 'structure' | 'performance';
}

/**
 * 诊断结果接口
 */
export interface DiagnosticResult {
  ruleId: string;
  passed: boolean;
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion?: string;
  canAutoFix: boolean;
  details?: Record<string, any>;
}

/**
 * 诊断报告接口
 */
export interface DiagnosticReport {
  cardId: string;
  timestamp: number;
  results: DiagnosticResult[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    errors: number;
    canAutoFix: number;
  };
}

/**
 * 智能诊断引擎
 */
export class DiagnosticEngine {
  private rules: Map<string, DiagnosticRule> = new Map();
  private contentExtractor: ContentExtractor;

  constructor() {
    this.contentExtractor = ContentExtractor.getInstance();
    this.initializeDefaultRules();
  }

  /**
   * 初始化默认诊断规则
   */
  private initializeDefaultRules(): void {
    // 规则1: 选择题格式检查
    this.registerRule({
      id: 'choice-format-check',
      name: '选择题格式检查',
      description: '检查选择题是否符合标准格式',
      severity: 'warning',
      category: 'format',
      canAutoFix: true,
      check: (card: Card) => this.checkChoiceFormat(card),
      fix: async (card: Card) => this.fixChoiceFormat(card)
    });

    // 规则2: 分隔符检查
    this.registerRule({
      id: 'separator-check',
      name: '分隔符检查',
      description: '检查卡片是否使用了正确的分隔符',
      severity: 'info',
      category: 'format',
      canAutoFix: true,
      check: (card: Card) => this.checkSeparators(card),
      fix: async (card: Card) => this.fixSeparators(card)
    });

    // 规则3: 内容完整性检查
    this.registerRule({
      id: 'content-completeness',
      name: '内容完整性检查',
      description: '检查卡片内容是否完整',
      severity: 'error',
      category: 'content',
      canAutoFix: false,
      check: (card: Card) => this.checkContentCompleteness(card)
    });

    // 规则4: 标签格式检查
    this.registerRule({
      id: 'tag-format-check',
      name: '标签格式检查',
      description: '检查标签是否符合规范',
      severity: 'info',
      category: 'format',
      canAutoFix: true,
      check: (card: Card) => this.checkTagFormat(card),
      fix: async (card: Card) => this.fixTagFormat(card)
    });
  }

  /**
   * 注册诊断规则
   */
  registerRule(rule: DiagnosticRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * 移除诊断规则
   */
  unregisterRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): DiagnosticRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 诊断卡片
   */
  async diagnoseCard(card: Card): Promise<DiagnosticReport> {
    const startTime = performance.now();
    const results: DiagnosticResult[] = [];

    console.log(`[DiagnosticEngine] 开始诊断卡片: ${card.id}`);

    // 执行所有规则检查
    for (const rule of this.rules.values()) {
      try {
        const result = rule.check(card);
        results.push(result);
      } catch (error) {
        console.error(`[DiagnosticEngine] 规则 ${rule.id} 执行失败:`, error);
        results.push({
          ruleId: rule.id,
          passed: false,
          severity: 'error',
          message: `规则执行失败: ${error.message}`,
          canAutoFix: false
        });
      }
    }

    // 生成摘要
    const summary = {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      warnings: results.filter(r => !r.passed && r.severity === 'warning').length,
      errors: results.filter(r => !r.passed && r.severity === 'error').length,
      canAutoFix: results.filter(r => !r.passed && r.canAutoFix).length
    };

    const endTime = performance.now();
    console.log(`[DiagnosticEngine] 诊断完成，耗时: ${endTime - startTime}ms`);

    return {
      cardId: card.id,
      timestamp: Date.now(),
      results,
      summary
    };
  }

  /**
   * 应用修复
   */
  async applyFix(card: Card, ruleId: string): Promise<Card> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`未找到规则: ${ruleId}`);
    }

    if (!rule.fix) {
      throw new Error(`规则 ${ruleId} 不支持自动修复`);
    }

    console.log(`[DiagnosticEngine] 应用修复规则: ${ruleId}`);
    return await rule.fix(card);
  }

  /**
   * 批量应用修复
   */
  async applyAllFixes(card: Card, ruleIds: string[]): Promise<Card> {
    let fixedCard = { ...card };

    for (const ruleId of ruleIds) {
      try {
        fixedCard = await this.applyFix(fixedCard, ruleId);
      } catch (error) {
        console.error(`[DiagnosticEngine] 修复规则 ${ruleId} 失败:`, error);
      }
    }

    return fixedCard;
  }

  // ===== 具体的诊断规则实现 =====

  /**
   * 检查选择题格式
   */
  private checkChoiceFormat(card: Card): DiagnosticResult {
    const frontContent = card.fields.front || '';
    
    if (!frontContent) {
      return {
        ruleId: 'choice-format-check',
        passed: true,
        severity: 'info',
        message: '非选择题卡片，跳过检查',
        canAutoFix: false
      };
    }

    // 尝试解析选择题
    const parseResult = this.contentExtractor.parseChoiceContent(frontContent);
    
    if (parseResult.success) {
      return {
        ruleId: 'choice-format-check',
        passed: true,
        severity: 'info',
        message: `选择题格式正确 (${parseResult.format})`,
        canAutoFix: false,
        details: {
          format: parseResult.format,
          confidence: parseResult.confidence
        }
      };
    }

    // 检查是否可能是选择题但格式不正确
    const hasOptions = /[A-E]\./.test(frontContent);
    const hasQuestion = /[？?]/.test(frontContent);

    if (hasOptions && hasQuestion) {
      return {
        ruleId: 'choice-format-check',
        passed: false,
        severity: 'warning',
        message: '疑似选择题但格式不规范',
        suggestion: '建议使用标准格式：## 题目\\n**选项**:\\nA. 选项1\\nB. 选项2',
        canAutoFix: true,
        details: {
          hasOptions,
          hasQuestion
        }
      };
    }

    return {
      ruleId: 'choice-format-check',
      passed: true,
      severity: 'info',
      message: '非选择题内容',
      canAutoFix: false
    };
  }

  /**
   * 修复选择题格式
   */
  private async fixChoiceFormat(card: Card): Promise<Card> {
    const frontContent = card.fields.front || '';
    
    // 简单的格式修复逻辑
    // 这里可以实现更复杂的修复算法
    let fixedContent = frontContent;

    // 如果没有标准的题目标记，添加##
    if (!/^##/.test(fixedContent) && /[？?]/.test(fixedContent)) {
      const lines = fixedContent.split('\n');
      const questionLine = lines.find(line => /[？?]/.test(line));
      if (questionLine) {
        fixedContent = fixedContent.replace(questionLine, `## ${questionLine}`);
      }
    }

    // 如果选项没有标准格式，尝试添加**选项**:标记
    if (!/\*\*选项\*\*:/.test(fixedContent) && /[A-E]\./.test(fixedContent)) {
      const lines = fixedContent.split('\n');
      const optionStartIndex = lines.findIndex(line => /^[A-E]\./.test(line.trim()));
      if (optionStartIndex > 0) {
        lines.splice(optionStartIndex, 0, '**选项**:');
        fixedContent = lines.join('\n');
      }
    }

    return {
      ...card,
      fields: {
        ...card.fields,
        front: fixedContent
      }
    };
  }

  /**
   * 检查分隔符
   */
  private checkSeparators(card: Card): DiagnosticResult {
    const frontContent = card.fields.front || '';
    
    const hasCorrectSeparator = frontContent.includes('---div---');
    const hasIncorrectSeparator = frontContent.includes('---') && !hasCorrectSeparator;

    if (hasIncorrectSeparator) {
      return {
        ruleId: 'separator-check',
        passed: false,
        severity: 'warning',
        message: '使用了非标准分隔符',
        suggestion: '建议使用标准分隔符 ---div---',
        canAutoFix: true
      };
    }

    return {
      ruleId: 'separator-check',
      passed: true,
      severity: 'info',
      message: '分隔符使用正确',
      canAutoFix: false
    };
  }

  /**
   * 修复分隔符
   */
  private async fixSeparators(card: Card): Promise<Card> {
    let fixedContent = card.fields.front || '';
    
    // 替换常见的错误分隔符
    fixedContent = fixedContent
      .replace(/---+/g, '---div---')
      .replace(/===+/g, '---div---')
      .replace(/\*\*\*+/g, '---div---');

    return {
      ...card,
      fields: {
        ...card.fields,
        front: fixedContent
      }
    };
  }

  /**
   * 检查内容完整性
   */
  private checkContentCompleteness(card: Card): DiagnosticResult {
    const frontContent = card.fields.front || '';
    
    if (!frontContent.trim()) {
      return {
        ruleId: 'content-completeness',
        passed: false,
        severity: 'error',
        message: '卡片内容为空',
        suggestion: '请添加卡片内容',
        canAutoFix: false
      };
    }

    if (frontContent.length < 10) {
      return {
        ruleId: 'content-completeness',
        passed: false,
        severity: 'warning',
        message: '卡片内容过短',
        suggestion: '建议添加更多详细内容',
        canAutoFix: false
      };
    }

    return {
      ruleId: 'content-completeness',
      passed: true,
      severity: 'info',
      message: '内容完整性良好',
      canAutoFix: false
    };
  }

  /**
   * 检查标签格式
   */
  private checkTagFormat(card: Card): DiagnosticResult {
    const frontContent = card.fields.front || '';
    const tags = frontContent.match(/#[\w\u4e00-\u9fa5]+/g) || [];

    if (tags.length === 0) {
      return {
        ruleId: 'tag-format-check',
        passed: false,
        severity: 'info',
        message: '未发现标签',
        suggestion: '建议添加相关标签以便分类',
        canAutoFix: false
      };
    }

    // 检查标签格式
    const invalidTags = tags.filter(tag => !/^#[\w\u4e00-\u9fa5]+$/.test(tag));
    
    if (invalidTags.length > 0) {
      return {
        ruleId: 'tag-format-check',
        passed: false,
        severity: 'warning',
        message: `发现 ${invalidTags.length} 个格式不正确的标签`,
        suggestion: '标签应该只包含字母、数字和中文字符',
        canAutoFix: true,
        details: { invalidTags }
      };
    }

    return {
      ruleId: 'tag-format-check',
      passed: true,
      severity: 'info',
      message: `标签格式正确 (${tags.length} 个标签)`,
      canAutoFix: false,
      details: { tags }
    };
  }

  /**
   * 修复标签格式
   */
  private async fixTagFormat(card: Card): Promise<Card> {
    let fixedContent = card.fields.front || '';
    
    // 修复标签格式
    fixedContent = fixedContent.replace(/#[\w\u4e00-\u9fa5\-_]+/g, (match) => {
      // 移除非法字符，只保留字母、数字、中文
      const cleaned = match.replace(/[^\w\u4e00-\u9fa5#]/g, '');
      return cleaned;
    });

    return {
      ...card,
      fields: {
        ...card.fields,
        front: fixedContent
      }
    };
  }
}
