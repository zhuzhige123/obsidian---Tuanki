/**
 * 自动修复建议系统
 * 分析解析问题并提供具体的修复建议和一键修复选项
 */

import { RegexParseTemplate } from '../data/template-types';
import { IntegrityIssue } from './data-integrity-checker';

export interface RepairSuggestion {
  id: string;
  type: 'format_fix' | 'content_restructure' | 'template_adjust' | 'manual_edit';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  autoFixable: boolean;
  previewBefore: string;
  previewAfter: string;
  steps: RepairStep[];
  confidence: number;
  estimatedTime: string;
}

export interface RepairStep {
  id: string;
  action: 'replace' | 'insert' | 'delete' | 'move' | 'format';
  description: string;
  target: string;
  value?: string;
  position?: number;
  automated: boolean;
}

export interface RepairResult {
  success: boolean;
  appliedSuggestions: string[];
  modifiedContent: string;
  modifiedFields: Record<string, string>;
  warnings: string[];
  errors: string[];
  needsManualReview: boolean;
}

export interface RepairAnalysis {
  originalContent: string;
  currentFields: Record<string, string>;
  template: RegexParseTemplate;
  issues: IntegrityIssue[];
  suggestions: RepairSuggestion[];
  quickFixes: RepairSuggestion[];
  complexFixes: RepairSuggestion[];
  analysisTime: number;
}

/**
 * 自动修复建议系统
 * 提供智能的问题分析和修复建议
 */
export class AutoRepairAdvisor {
  private repairPatterns: Map<string, RepairPattern> = new Map();

  constructor() {
    this.initializeRepairPatterns();
  }

  /**
   * 分析内容并生成修复建议
   */
  analyzeAndSuggestRepairs(
    originalContent: string,
    currentFields: Record<string, string>,
    template: RegexParseTemplate,
    issues: IntegrityIssue[] = []
  ): RepairAnalysis {
    const startTime = Date.now();
    
    console.log(`🔧 [AutoRepairAdvisor] 开始分析修复建议`);
    console.log(`📝 [AutoRepairAdvisor] 内容长度: ${originalContent.length} 字符`);

    const suggestions: RepairSuggestion[] = [];

    // 1. 分析格式问题
    const formatSuggestions = this.analyzeFormatIssues(originalContent, template);
    suggestions.push(...formatSuggestions);

    // 2. 分析结构问题
    const structureSuggestions = this.analyzeStructureIssues(originalContent, currentFields, template);
    suggestions.push(...structureSuggestions);

    // 3. 分析完整性问题
    const integritySuggestions = this.analyzeIntegrityIssues(issues, originalContent, currentFields);
    suggestions.push(...integritySuggestions);

    // 4. 分析模板匹配问题
    const templateSuggestions = this.analyzeTemplateMatchIssues(originalContent, template);
    suggestions.push(...templateSuggestions);

    // 5. 按优先级排序
    suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // 6. 分类建议
    const quickFixes = suggestions.filter(s => s.autoFixable && s.confidence > 0.8);
    const complexFixes = suggestions.filter(s => !s.autoFixable || s.confidence <= 0.8);

    const analysisTime = Date.now() - startTime;

    console.log(`✅ [AutoRepairAdvisor] 分析完成，生成${suggestions.length}个建议 (${analysisTime}ms)`);

    return {
      originalContent,
      currentFields,
      template,
      issues,
      suggestions,
      quickFixes,
      complexFixes,
      analysisTime
    };
  }

  /**
   * 应用修复建议
   */
  async applyRepairSuggestions(
    content: string,
    suggestions: RepairSuggestion[],
    autoFixOnly: boolean = false
  ): Promise<RepairResult> {
    console.log(`🔧 [AutoRepairAdvisor] 应用修复建议: ${suggestions.length}个`);

    let modifiedContent = content;
    const appliedSuggestions: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    let needsManualReview = false;

    for (const suggestion of suggestions) {
      if (autoFixOnly && !suggestion.autoFixable) {
        continue;
      }

      try {
        console.log(`🔧 [AutoRepairAdvisor] 应用建议: ${suggestion.title}`);
        
        const result = await this.applySingleSuggestion(modifiedContent, suggestion);
        
        if (result.success) {
          modifiedContent = result.content;
          appliedSuggestions.push(suggestion.id);
          
          if (result.warnings) {
            warnings.push(...result.warnings);
          }
        } else {
          errors.push(`应用建议失败: ${suggestion.title} - ${result.error}`);
        }
      } catch (error) {
        errors.push(`应用建议异常: ${suggestion.title} - ${error}`);
      }
    }

    // 检查是否需要手动审查
    needsManualReview = suggestions.some(s => !s.autoFixable) || errors.length > 0;

    // 重新解析修复后的内容
    const modifiedFields = this.parseModifiedContent(modifiedContent);

    console.log(`✅ [AutoRepairAdvisor] 修复完成，应用了${appliedSuggestions.length}个建议`);

    return {
      success: appliedSuggestions.length > 0,
      appliedSuggestions,
      modifiedContent,
      modifiedFields,
      warnings,
      errors,
      needsManualReview
    };
  }

  /**
   * 获取快速修复建议
   */
  getQuickFixSuggestions(content: string, template: RegexParseTemplate): RepairSuggestion[] {
    const analysis = this.analyzeAndSuggestRepairs(content, {}, template);
    return analysis.quickFixes;
  }

  // 私有分析方法

  private analyzeFormatIssues(content: string, template: RegexParseTemplate): RepairSuggestion[] {
    const suggestions: RepairSuggestion[] = [];

    // 检查标题格式问题
    const headingIssues = this.checkHeadingFormat(content);
    suggestions.push(...headingIssues);

    // 检查标点符号问题
    const punctuationIssues = this.checkPunctuationFormat(content);
    suggestions.push(...punctuationIssues);

    // 检查空格问题
    const spacingIssues = this.checkSpacingFormat(content);
    suggestions.push(...spacingIssues);

    return suggestions;
  }

  private analyzeStructureIssues(
    content: string,
    currentFields: Record<string, string>,
    template: RegexParseTemplate
  ): RepairSuggestion[] {
    const suggestions: RepairSuggestion[] = [];

    // 检查内容结构
    const lines = content.split('\n');
    const hasHeadings = lines.some(line => /^#{1,6}\s+/.test(line));
    const hasContent = lines.some(line => line.trim().length > 10);

    if (!hasHeadings) {
      suggestions.push({
        id: this.generateSuggestionId(),
        type: 'content_restructure',
        priority: 'high',
        title: '添加标题结构',
        description: '内容缺少标题结构，建议添加二级标题来标识问题',
        impact: '提高内容的可读性和解析准确性',
        autoFixable: true,
        previewBefore: content.split('\n')[0] || '',
        previewAfter: `## ${content.split('\n')[0] || '问题标题'}`,
        steps: [
          {
            id: 'add-heading',
            action: 'insert',
            description: '在内容开头添加二级标题',
            target: 'line:0',
            value: '## ',
            position: 0,
            automated: true
          }
        ],
        confidence: 0.9,
        estimatedTime: '1分钟'
      });
    }

    // 检查问答结构
    if (hasContent && !this.hasQuestionAnswerStructure(content)) {
      suggestions.push({
        id: this.generateSuggestionId(),
        type: 'content_restructure',
        priority: 'medium',
        title: '优化问答结构',
        description: '内容缺少清晰的问答结构，建议分离问题和答案部分',
        impact: '提高解析准确性和内容组织',
        autoFixable: false,
        previewBefore: content.substring(0, 100) + '...',
        previewAfter: '## 问题\n[问题内容]\n\n[答案内容]',
        steps: [
          {
            id: 'restructure-qa',
            action: 'format',
            description: '重新组织内容为问答结构',
            target: 'content',
            automated: false
          }
        ],
        confidence: 0.7,
        estimatedTime: '3-5分钟'
      });
    }

    return suggestions;
  }

  private analyzeIntegrityIssues(
    issues: IntegrityIssue[],
    originalContent: string,
    currentFields: Record<string, string>
  ): RepairSuggestion[] {
    const suggestions: RepairSuggestion[] = [];

    for (const issue of issues) {
      switch (issue.type) {
        case 'data_loss':
          if (issue.field === 'notes' && issue.expectedValue) {
            suggestions.push({
              id: this.generateSuggestionId(),
              type: 'format_fix',
              priority: 'high',
              title: '恢复丢失的原始内容',
              description: `${issue.field}字段内容丢失，可以从备份恢复`,
              impact: '恢复完整的原始内容，避免数据丢失',
              autoFixable: true,
              previewBefore: issue.detectedValue,
              previewAfter: issue.expectedValue,
              steps: [
                {
                  id: 'restore-content',
                  action: 'replace',
                  description: '从备份恢复原始内容',
                  target: issue.field,
                  value: issue.expectedValue,
                  automated: true
                }
              ],
              confidence: 0.95,
              estimatedTime: '立即'
            });
          }
          break;

        case 'format_error':
          if (issue.autoFixable) {
            suggestions.push({
              id: this.generateSuggestionId(),
              type: 'format_fix',
              priority: 'medium',
              title: '修复格式错误',
              description: issue.description,
              impact: '提高内容质量和解析准确性',
              autoFixable: true,
              previewBefore: issue.detectedValue.substring(0, 50) + '...',
              previewAfter: '[已修复格式]',
              steps: [
                {
                  id: 'fix-format',
                  action: 'format',
                  description: issue.fixSuggestion || '修复格式问题',
                  target: issue.field,
                  automated: true
                }
              ],
              confidence: 0.8,
              estimatedTime: '立即'
            });
          }
          break;
      }
    }

    return suggestions;
  }

  private analyzeTemplateMatchIssues(content: string, template: RegexParseTemplate): RepairSuggestion[] {
    const suggestions: RepairSuggestion[] = [];

    try {
      const regex = new RegExp(template.regex, this.buildRegexFlags(template.parseOptions));
      const match = regex.exec(content);

      if (!match) {
        // 分析为什么模板不匹配
        const reasons = this.analyzeTemplateMatchFailure(content, template);
        
        for (const reason of reasons) {
          suggestions.push({
            id: this.generateSuggestionId(),
            type: 'template_adjust',
            priority: 'high',
            title: reason.title,
            description: reason.description,
            impact: '使内容能够被模板正确解析',
            autoFixable: reason.autoFixable,
            previewBefore: reason.example,
            previewAfter: reason.suggestion,
            steps: reason.steps,
            confidence: reason.confidence,
            estimatedTime: reason.estimatedTime
          });
        }
      }
    } catch (error) {
      suggestions.push({
        id: this.generateSuggestionId(),
        type: 'template_adjust',
        priority: 'high',
        title: '修复模板正则表达式错误',
        description: `模板正则表达式存在语法错误: ${error}`,
        impact: '修复模板以正常解析内容',
        autoFixable: false,
        previewBefore: template.regex,
        previewAfter: '[需要手动修复]',
        steps: [
          {
            id: 'fix-regex',
            action: 'replace',
            description: '修复正则表达式语法错误',
            target: 'template.regex',
            automated: false
          }
        ],
        confidence: 0.6,
        estimatedTime: '5-10分钟'
      });
    }

    return suggestions;
  }

  // 具体检查方法

  private checkHeadingFormat(content: string): RepairSuggestion[] {
    const suggestions: RepairSuggestion[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 检查标题格式：#后面没有空格
      if (/^#{1,6}[^\s]/.test(line)) {
        const fixed = line.replace(/^(#{1,6})([^\s])/, '$1 $2');
        
        suggestions.push({
          id: this.generateSuggestionId(),
          type: 'format_fix',
          priority: 'medium',
          title: '修复标题格式',
          description: `第${i + 1}行标题缺少空格`,
          impact: '提高Markdown标准兼容性',
          autoFixable: true,
          previewBefore: line,
          previewAfter: fixed,
          steps: [
            {
              id: 'fix-heading-space',
              action: 'replace',
              description: '在#后添加空格',
              target: `line:${i}`,
              value: fixed,
              automated: true
            }
          ],
          confidence: 0.95,
          estimatedTime: '立即'
        });
      }
    }

    return suggestions;
  }

  private checkPunctuationFormat(content: string): RepairSuggestion[] {
    const suggestions: RepairSuggestion[] = [];

    // 检查中英文标点符号混用
    const chinesePunctuation = /[：；，。？！（）]/g;
    if (chinesePunctuation.test(content)) {
      const fixed = content
        .replace(/：/g, ':')
        .replace(/；/g, ';')
        .replace(/，/g, ',')
        .replace(/。/g, '.')
        .replace(/？/g, '?')
        .replace(/！/g, '!')
        .replace(/（/g, '(')
        .replace(/）/g, ')');

      suggestions.push({
        id: this.generateSuggestionId(),
        type: 'format_fix',
        priority: 'low',
        title: '统一标点符号格式',
        description: '将中文标点符号转换为英文标点符号',
        impact: '提高解析一致性',
        autoFixable: true,
        previewBefore: content.match(chinesePunctuation)?.[0] || '',
        previewAfter: '英文标点符号',
        steps: [
          {
            id: 'normalize-punctuation',
            action: 'replace',
            description: '转换中文标点符号',
            target: 'content',
            automated: true
          }
        ],
        confidence: 0.9,
        estimatedTime: '立即'
      });
    }

    return suggestions;
  }

  private checkSpacingFormat(content: string): RepairSuggestion[] {
    const suggestions: RepairSuggestion[] = [];

    // 检查多余空格
    if (/  +/.test(content)) {
      suggestions.push({
        id: this.generateSuggestionId(),
        type: 'format_fix',
        priority: 'low',
        title: '清理多余空格',
        description: '移除多余的连续空格',
        impact: '提高内容整洁度',
        autoFixable: true,
        previewBefore: '多个  空格',
        previewAfter: '多个 空格',
        steps: [
          {
            id: 'clean-spaces',
            action: 'replace',
            description: '合并连续空格',
            target: 'content',
            automated: true
          }
        ],
        confidence: 0.9,
        estimatedTime: '立即'
      });
    }

    return suggestions;
  }

  // 辅助方法

  private hasQuestionAnswerStructure(content: string): boolean {
    const questionPatterns = [
      /^#{1,6}\s+.*[？?]/m,
      /^#{1,6}\s+.*(什么|如何|为什么|怎么)/m,
      /问题[:：]/i,
      /Q[:：]/i
    ];

    return questionPatterns.some(pattern => pattern.test(content));
  }

  private analyzeTemplateMatchFailure(content: string, template: RegexParseTemplate): any[] {
    const reasons = [];

    // 检查是否缺少标题
    if (template.regex.includes('##') && !content.includes('##')) {
      reasons.push({
        title: '添加二级标题',
        description: '模板需要二级标题，但内容中没有找到',
        autoFixable: true,
        example: content.split('\n')[0] || '',
        suggestion: `## ${content.split('\n')[0] || '标题'}`,
        steps: [
          {
            id: 'add-h2',
            action: 'insert',
            description: '在开头添加二级标题',
            target: 'line:0',
            value: '## ',
            position: 0,
            automated: true
          }
        ],
        confidence: 0.8,
        estimatedTime: '1分钟'
      });
    }

    return reasons;
  }

  private async applySingleSuggestion(content: string, suggestion: RepairSuggestion): Promise<{
    success: boolean;
    content: string;
    warnings?: string[];
    error?: string;
  }> {
    let modifiedContent = content;
    const warnings: string[] = [];

    try {
      for (const step of suggestion.steps) {
        if (!step.automated && suggestion.autoFixable) {
          continue; // 跳过非自动化步骤
        }

        switch (step.action) {
          case 'replace':
            if (step.target === 'content' && step.value) {
              modifiedContent = step.value;
            } else if (step.target.startsWith('line:')) {
              const lineIndex = parseInt(step.target.split(':')[1]);
              const lines = modifiedContent.split('\n');
              if (lineIndex < lines.length && step.value) {
                lines[lineIndex] = step.value;
                modifiedContent = lines.join('\n');
              }
            }
            break;

          case 'insert':
            if (step.target.startsWith('line:') && step.value) {
              const lineIndex = parseInt(step.target.split(':')[1]);
              const lines = modifiedContent.split('\n');
              if (step.position !== undefined) {
                lines[lineIndex] = lines[lineIndex].substring(0, step.position) + 
                                 step.value + 
                                 lines[lineIndex].substring(step.position);
              } else {
                lines.splice(lineIndex, 0, step.value);
              }
              modifiedContent = lines.join('\n');
            }
            break;

          case 'format':
            if (step.target === 'content') {
              // 应用格式化
              modifiedContent = this.applyFormatting(modifiedContent, suggestion.type);
            }
            break;
        }
      }

      return {
        success: true,
        content: modifiedContent,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      return {
        success: false,
        content,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private applyFormatting(content: string, type: RepairSuggestion['type']): string {
    switch (type) {
      case 'format_fix':
        return content
          .replace(/：/g, ':')
          .replace(/；/g, ';')
          .replace(/，/g, ',')
          .replace(/。/g, '.')
          .replace(/？/g, '?')
          .replace(/！/g, '!')
          .replace(/（/g, '(')
          .replace(/）/g, ')')
          .replace(/  +/g, ' ')
          .replace(/^(#{1,6})([^\s])/gm, '$1 $2');
      default:
        return content;
    }
  }

  private parseModifiedContent(content: string): Record<string, string> {
    // 简单的内容解析，实际应该使用完整的解析器
    const lines = content.split('\n').filter(line => line.trim());
    const fields: Record<string, string> = { notes: content };

    if (lines.length > 0) {
      const firstLine = lines[0].replace(/^#{1,6}\s*/, '');
      fields.question = firstLine;
      
      if (lines.length > 1) {
        fields.answer = lines.slice(1).join('\n');
      }
    }

    return fields;
  }

  private buildRegexFlags(options?: RegexParseTemplate['parseOptions']): string {
    let flags = '';
    if (options?.multiline) flags += 'm';
    if (options?.ignoreCase) flags += 'i';
    if (options?.global) flags += 'g';
    return flags;
  }

  private generateSuggestionId(): string {
    return `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeRepairPatterns(): void {
    // 初始化修复模式，这里可以添加更多预定义的修复模式
    console.log('🔧 [AutoRepairAdvisor] 初始化修复模式');
  }
}

interface RepairPattern {
  id: string;
  name: string;
  pattern: RegExp;
  fix: (match: RegExpMatchArray) => string;
  confidence: number;
}
