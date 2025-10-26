/**
 * 实时格式检查器
 * 在用户编辑Markdown内容时提供实时的格式检查和提示
 */

export interface FormatIssue {
  id: string;
  type: 'error' | 'warning' | 'suggestion';
  category: 'heading' | 'punctuation' | 'spacing' | 'structure' | 'syntax';
  line: number;
  column: number;
  length: number;
  message: string;
  description: string;
  suggestion: string;
  autoFixable: boolean;
  severity: number; // 1-10, 10 being most severe
}

export interface FormatCheckResult {
  issues: FormatIssue[];
  score: number; // 0-100, 100 being perfect
  summary: {
    errors: number;
    warnings: number;
    suggestions: number;
  };
  recommendations: string[];
  processingTime: number;
}

export interface FormatRule {
  id: string;
  name: string;
  description: string;
  category: FormatIssue['category'];
  severity: number;
  enabled: boolean;
  check: (content: string, lines: string[]) => FormatIssue[];
}

/**
 * 实时格式检查器
 * 提供快速、准确的Markdown格式检查
 */
export class RealTimeFormatChecker {
  private rules: Map<string, FormatRule> = new Map();
  private checkCache: Map<string, FormatCheckResult> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeRules();
  }

  /**
   * 检查内容格式
   */
  checkFormat(content: string, debounceMs: number = 300): Promise<FormatCheckResult> {
    return new Promise((resolve) => {
      // 清除之前的定时器
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      // 设置防抖
      this.debounceTimer = setTimeout(() => {
        const result = this.performCheck(content);
        resolve(result);
      }, debounceMs);
    });
  }

  /**
   * 立即检查（无防抖）
   */
  checkFormatImmediate(content: string): FormatCheckResult {
    return this.performCheck(content);
  }

  /**
   * 获取特定行的问题
   */
  getLineIssues(content: string, lineNumber: number): FormatIssue[] {
    const result = this.performCheck(content);
    return result.issues.filter(issue => issue.line === lineNumber);
  }

  /**
   * 自动修复问题
   */
  autoFix(content: string, issueIds?: string[]): {
    fixedContent: string;
    appliedFixes: string[];
    remainingIssues: FormatIssue[];
  } {
    const result = this.performCheck(content);
    let fixedContent = content;
    const appliedFixes: string[] = [];

    // 筛选要修复的问题
    const issuesToFix = issueIds 
      ? result.issues.filter(issue => issueIds.includes(issue.id))
      : result.issues.filter(issue => issue.autoFixable);

    // 按行号倒序排序，避免修复时位置偏移
    issuesToFix.sort((a, b) => b.line - a.line || b.column - a.column);

    for (const issue of issuesToFix) {
      const fix = this.applyFix(fixedContent, issue);
      if (fix.success) {
        fixedContent = fix.content;
        appliedFixes.push(issue.id);
      }
    }

    // 重新检查剩余问题
    const finalResult = this.performCheck(fixedContent);
    
    return {
      fixedContent,
      appliedFixes,
      remainingIssues: finalResult.issues
    };
  }

  // 私有方法

  private performCheck(content: string): FormatCheckResult {
    const startTime = Date.now();
    
    // 检查缓存
    const cacheKey = this.generateCacheKey(content);
    const cached = this.checkCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    console.log('🔍 [FormatChecker] 开始格式检查');

    const lines = content.split('\n');
    const allIssues: FormatIssue[] = [];

    // 应用所有启用的规则
    for (const rule of this.rules.values()) {
      if (rule.enabled) {
        try {
          const issues = rule.check(content, lines);
          allIssues.push(...issues);
        } catch (error) {
          console.warn(`⚠️ [FormatChecker] 规则 ${rule.id} 检查失败:`, error);
        }
      }
    }

    // 去重和排序
    const uniqueIssues = this.deduplicateIssues(allIssues);
    uniqueIssues.sort((a, b) => a.line - b.line || a.column - b.column);

    // 计算分数
    const score = this.calculateScore(uniqueIssues, content.length);

    // 生成摘要
    const summary = {
      errors: uniqueIssues.filter(i => i.type === 'error').length,
      warnings: uniqueIssues.filter(i => i.type === 'warning').length,
      suggestions: uniqueIssues.filter(i => i.type === 'suggestion').length
    };

    // 生成建议
    const recommendations = this.generateRecommendations(uniqueIssues);

    const result: FormatCheckResult = {
      issues: uniqueIssues,
      score,
      summary,
      recommendations,
      processingTime: Date.now() - startTime
    };

    // 缓存结果
    this.checkCache.set(cacheKey, result);
    this.cleanupCache();

    console.log(`✅ [FormatChecker] 格式检查完成: ${uniqueIssues.length}个问题, 分数: ${score}`);

    return result;
  }

  private initializeRules(): void {
    // 规则1: 标题格式检查
    this.rules.set('heading-spacing', {
      id: 'heading-spacing',
      name: '标题空格检查',
      description: '检查标题标记后是否有空格',
      category: 'heading',
      severity: 7,
      enabled: true,
      check: (content, lines) => {
        const issues: FormatIssue[] = [];
        
        lines.forEach((line, index) => {
          const match = line.match(/^(#{1,6})([^\s])/);
          if (match) {
            issues.push({
              id: `heading-spacing-${index}`,
              type: 'error',
              category: 'heading',
              line: index + 1,
              column: match[1].length + 1,
              length: 1,
              message: '标题标记后缺少空格',
              description: 'Markdown标题标记（#）后应该有一个空格',
              suggestion: `${match[1]} ${match[2]}`,
              autoFixable: true,
              severity: 7
            });
          }
        });
        
        return issues;
      }
    });

    // 规则2: 标点符号检查
    this.rules.set('punctuation-consistency', {
      id: 'punctuation-consistency',
      name: '标点符号一致性',
      description: '检查中英文标点符号的一致性',
      category: 'punctuation',
      severity: 5,
      enabled: true,
      check: (content, lines) => {
        const issues: FormatIssue[] = [];
        const chinesePunctuation = /[：；，。？！（）]/g;
        
        lines.forEach((line, index) => {
          let match;
          while ((match = chinesePunctuation.exec(line)) !== null) {
            const char = match[0];
            const englishEquivalent = {
              '：': ':',
              '；': ';',
              '，': ',',
              '。': '.',
              '？': '?',
              '！': '!',
              '（': '(',
              '）': ')'
            }[char];
            
            issues.push({
              id: `punctuation-${index}-${match.index}`,
              type: 'suggestion',
              category: 'punctuation',
              line: index + 1,
              column: match.index + 1,
              length: 1,
              message: `建议使用英文标点符号 "${englishEquivalent}"`,
              description: '为了保持一致性，建议统一使用英文标点符号',
              suggestion: englishEquivalent || char,
              autoFixable: true,
              severity: 5
            });
          }
        });
        
        return issues;
      }
    });

    // 规则3: 空格检查
    this.rules.set('excessive-spacing', {
      id: 'excessive-spacing',
      name: '多余空格检查',
      description: '检查多余的连续空格',
      category: 'spacing',
      severity: 3,
      enabled: true,
      check: (content, lines) => {
        const issues: FormatIssue[] = [];
        
        lines.forEach((line, index) => {
          const matches = [...line.matchAll(/  +/g)];
          matches.forEach(match => {
            if (match.index !== undefined) {
              issues.push({
                id: `spacing-${index}-${match.index}`,
                type: 'suggestion',
                category: 'spacing',
                line: index + 1,
                column: match.index + 1,
                length: match[0].length,
                message: '发现多余的连续空格',
                description: '多个连续空格可能影响格式，建议合并为单个空格',
                suggestion: ' ',
                autoFixable: true,
                severity: 3
              });
            }
          });
        });
        
        return issues;
      }
    });

    // 规则4: 结构检查
    this.rules.set('structure-completeness', {
      id: 'structure-completeness',
      name: '结构完整性检查',
      description: '检查问答结构的完整性',
      category: 'structure',
      severity: 8,
      enabled: true,
      check: (content, lines) => {
        const issues: FormatIssue[] = [];
        
        // 检查是否有标题
        const hasHeading = lines.some(line => /^#{1,6}\s+/.test(line));
        if (!hasHeading && content.trim().length > 0) {
          issues.push({
            id: 'structure-no-heading',
            type: 'warning',
            category: 'structure',
            line: 1,
            column: 1,
            length: 0,
            message: '内容缺少标题结构',
            description: '建议使用标题来标识问题部分',
            suggestion: '## ',
            autoFixable: false,
            severity: 8
          });
        }

        // 检查内容长度
        const contentLines = lines.filter(line => line.trim().length > 0);
        if (contentLines.length === 1 && contentLines[0].length < 10) {
          issues.push({
            id: 'structure-too-short',
            type: 'warning',
            category: 'structure',
            line: 1,
            column: 1,
            length: contentLines[0].length,
            message: '内容过短',
            description: '内容可能不够完整，建议添加更多详细信息',
            suggestion: '',
            autoFixable: false,
            severity: 6
          });
        }
        
        return issues;
      }
    });

    // 规则5: 语法检查
    this.rules.set('markdown-syntax', {
      id: 'markdown-syntax',
      name: 'Markdown语法检查',
      description: '检查Markdown语法错误',
      category: 'syntax',
      severity: 9,
      enabled: true,
      check: (content, lines) => {
        const issues: FormatIssue[] = [];
        
        lines.forEach((line, index) => {
          // 检查不匹配的括号
          const brackets = line.match(/\[([^\]]*)\]\(([^)]*)\)/g);
          if (brackets) {
            brackets.forEach(bracket => {
              const bracketIndex = line.indexOf(bracket);
              if (bracket.includes('](') && !bracket.match(/\]\([^)]+\)/)) {
                issues.push({
                  id: `syntax-bracket-${index}-${bracketIndex}`,
                  type: 'error',
                  category: 'syntax',
                  line: index + 1,
                  column: bracketIndex + 1,
                  length: bracket.length,
                  message: '链接语法不完整',
                  description: 'Markdown链接语法需要完整的 [文本](链接) 格式',
                  suggestion: '[文本](链接)',
                  autoFixable: false,
                  severity: 9
                });
              }
            });
          }

          // 检查不匹配的代码块
          const codeBlocks = (line.match(/```/g) || []).length;
          if (codeBlocks % 2 !== 0) {
            const lastIndex = line.lastIndexOf('```');
            issues.push({
              id: `syntax-codeblock-${index}`,
              type: 'warning',
              category: 'syntax',
              line: index + 1,
              column: lastIndex + 1,
              length: 3,
              message: '代码块标记不匹配',
              description: '代码块需要成对的 ``` 标记',
              suggestion: '```',
              autoFixable: false,
              severity: 7
            });
          }
        });
        
        return issues;
      }
    });

    console.log(`📚 [FormatChecker] 初始化了${this.rules.size}个格式检查规则`);
  }

  private deduplicateIssues(issues: FormatIssue[]): FormatIssue[] {
    const seen = new Set<string>();
    return issues.filter(issue => {
      const key = `${issue.line}-${issue.column}-${issue.type}-${issue.category}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private calculateScore(issues: FormatIssue[], contentLength: number): number {
    if (issues.length === 0) return 100;
    
    let totalPenalty = 0;
    issues.forEach(issue => {
      const penalty = issue.severity * (issue.type === 'error' ? 3 : issue.type === 'warning' ? 2 : 1);
      totalPenalty += penalty;
    });
    
    // 基于内容长度调整惩罚
    const lengthFactor = Math.max(1, contentLength / 1000);
    const adjustedPenalty = totalPenalty / lengthFactor;
    
    return Math.max(0, Math.round(100 - adjustedPenalty));
  }

  private generateRecommendations(issues: FormatIssue[]): string[] {
    const recommendations: string[] = [];
    
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    
    if (errorCount > 0) {
      recommendations.push(`修复${errorCount}个格式错误以提高解析准确性`);
    }
    
    if (warningCount > 0) {
      recommendations.push(`处理${warningCount}个格式警告以优化内容质量`);
    }
    
    const headingIssues = issues.filter(i => i.category === 'heading').length;
    if (headingIssues > 0) {
      recommendations.push('检查标题格式，确保标记后有空格');
    }
    
    const structureIssues = issues.filter(i => i.category === 'structure').length;
    if (structureIssues > 0) {
      recommendations.push('优化内容结构，使用清晰的问答格式');
    }
    
    return recommendations;
  }

  private applyFix(content: string, issue: FormatIssue): { success: boolean; content: string } {
    if (!issue.autoFixable) {
      return { success: false, content };
    }

    const lines = content.split('\n');
    const line = lines[issue.line - 1];
    
    if (!line) {
      return { success: false, content };
    }

    try {
      let fixedLine = line;
      
      switch (issue.category) {
        case 'heading':
          if (issue.id.includes('heading-spacing')) {
            fixedLine = line.replace(/^(#{1,6})([^\s])/, '$1 $2');
          }
          break;
          
        case 'punctuation':
          if (issue.suggestion) {
            const start = issue.column - 1;
            fixedLine = line.substring(0, start) + issue.suggestion + line.substring(start + issue.length);
          }
          break;
          
        case 'spacing':
          if (issue.id.includes('spacing')) {
            fixedLine = line.replace(/  +/g, ' ');
          }
          break;
      }
      
      lines[issue.line - 1] = fixedLine;
      return { success: true, content: lines.join('\n') };
    } catch (error) {
      console.warn(`⚠️ [FormatChecker] 修复失败: ${issue.id}`, error);
      return { success: false, content };
    }
  }

  private generateCacheKey(content: string): string {
    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(16);
  }

  private cleanupCache(): void {
    const maxCacheSize = 50;
    if (this.checkCache.size > maxCacheSize) {
      const keys = Array.from(this.checkCache.keys());
      const keysToDelete = keys.slice(0, keys.length - maxCacheSize);
      keysToDelete.forEach(key => this.checkCache.delete(key));
    }
  }

  /**
   * 启用或禁用规则
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      this.checkCache.clear(); // 清除缓存
    }
  }

  /**
   * 获取所有规则
   */
  getAllRules(): FormatRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 销毁检查器
   */
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.checkCache.clear();
    console.log('🔍 [FormatChecker] 格式检查器已销毁');
  }
}
