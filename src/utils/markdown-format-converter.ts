import type { TriadTemplate, MarkdownTemplate } from '../data/template-types';

/**
 * MD格式转换配置
 */
export interface MarkdownFormatConfig {
  // 源模板和目标模板
  fromTemplate: TriadTemplate;
  toTemplate: TriadTemplate;
  
  // 字段映射
  fieldMappings: Record<string, string | string[]>;
  
  // 格式转换规则
  formatRules: MarkdownFormatRule[];
  
  // 转换选项
  options: {
    preserveContent: boolean;      // 保持内容不变
    mergeFields: boolean;          // 允许字段合并
    splitFields: boolean;          // 允许字段分割
    mergeSeparator: string;        // 合并分隔符
    splitSeparator: string;        // 分割分隔符
  };
}

/**
 * MD格式转换规则
 */
export interface MarkdownFormatRule {
  name: string;
  description: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  scope?: 'global' | 'field' | 'line';  // 应用范围
  priority?: number;                     // 优先级
}

/**
 * MD格式转换结果
 */
export interface MarkdownFormatResult {
  // 转换后的内容
  content: string;
  
  // 转换统计
  stats: {
    rulesApplied: number;
    linesChanged: number;
    fieldsProcessed: number;
  };
  
  // 转换详情
  changes: MarkdownFormatChange[];
  
  // 警告信息
  warnings: string[];
}

/**
 * MD格式转换变更记录
 */
export interface MarkdownFormatChange {
  rule: string;
  line: number;
  before: string;
  after: string;
  field?: string;
}

/**
 * 预定义的格式转换规则
 */
export const MARKDOWN_FORMAT_RULES: Record<string, MarkdownFormatRule> = {
  // 标题级别转换
  'h1-to-h2': {
    name: '# → ##',
    description: '一级标题转换为二级标题',
    pattern: /^#\s+(.+)$/gm,
    replacement: '## $1'
  },
  'h2-to-h3': {
    name: '## → ###',
    description: '二级标题转换为三级标题',
    pattern: /^##\s+(.+)$/gm,
    replacement: '### $1'
  },
  'h3-to-h2': {
    name: '### → ##',
    description: '三级标题转换为二级标题',
    pattern: /^###\s+(.+)$/gm,
    replacement: '## $1'
  },
  'h2-to-h1': {
    name: '## → #',
    description: '二级标题转换为一级标题',
    pattern: /^##\s+(.+)$/gm,
    replacement: '# $1'
  },
  'h4-to-h3': {
    name: '#### → ###',
    description: '四级标题转换为三级标题',
    pattern: /^####\s+(.+)$/gm,
    replacement: '### $1'
  },
  'h3-to-h4': {
    name: '### → ####',
    description: '三级标题转换为四级标题',
    pattern: /^###\s+(.+)$/gm,
    replacement: '#### $1'
  },

  // 强调格式转换
  'bold-to-italic': {
    name: '粗体 → 斜体',
    description: '将粗体文本转换为斜体',
    pattern: /\*\*(.*?)\*\*/g,
    replacement: '*$1*'
  },
  'italic-to-bold': {
    name: '斜体 → 粗体',
    description: '将斜体文本转换为粗体',
    pattern: /\*(.*?)\*/g,
    replacement: '**$1**'
  },

  // 列表格式转换
  'unordered-to-ordered': {
    name: '无序列表 → 有序列表',
    description: '将无序列表转换为有序列表',
    pattern: /^[\s]*[-*+]\s+(.+)$/gm,
    replacement: (match, content) => {
      const indent = match.match(/^(\s*)/)?.[1] || '';
      return `${indent}1. ${content}`;
    }
  },
  'ordered-to-unordered': {
    name: '有序列表 → 无序列表',
    description: '将有序列表转换为无序列表',
    pattern: /^(\s*)\d+\.\s+(.+)$/gm,
    replacement: '$1- $2'
  },

  // 引用格式转换
  'add-blockquote': {
    name: '添加引用',
    description: '为段落添加引用格式',
    pattern: /^(?!>)(.+)$/gm,
    replacement: '> $1'
  },
  'remove-blockquote': {
    name: '移除引用',
    description: '移除引用格式',
    pattern: /^>\s*(.+)$/gm,
    replacement: '$1'
  },

  // 代码格式转换
  'inline-to-block-code': {
    name: '行内代码 → 代码块',
    description: '将行内代码转换为代码块',
    pattern: /`([^`]+)`/g,
    replacement: '```\n$1\n```'
  },

  // 链接格式转换
  'markdown-to-wiki-link': {
    name: 'Markdown链接 → Wiki链接',
    description: '将Markdown链接转换为Wiki链接',
    pattern: /\[([^\]]+)\]\(([^)]+)\)/g,
    replacement: '[[$2|$1]]'
  },
  'wiki-to-markdown-link': {
    name: 'Wiki链接 → Markdown链接',
    description: '将Wiki链接转换为Markdown链接',
    pattern: /\[\[([^|]+)\|([^\]]+)\]\]/g,
    replacement: '[$2]($1)'
  },

  // 分隔符转换
  'dash-to-asterisk-separator': {
    name: '--- → ***',
    description: '将短横线分隔符转换为星号分隔符',
    pattern: /^-{3,}$/gm,
    replacement: '***'
  },
  'asterisk-to-dash-separator': {
    name: '*** → ---',
    description: '将星号分隔符转换为短横线分隔符',
    pattern: /^\*{3,}$/gm,
    replacement: '---'
  }
};

/**
 * 应用MD格式转换
 */
export function applyMarkdownFormatConversion(
  content: string,
  config: MarkdownFormatConfig
): MarkdownFormatResult {
  const result: MarkdownFormatResult = {
    content: content,
    stats: {
      rulesApplied: 0,
      linesChanged: 0,
      fieldsProcessed: 0
    },
    changes: [],
    warnings: []
  };

  // 按优先级排序规则
  const sortedRules = config.formatRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // 应用每个转换规则
  for (const rule of sortedRules) {
    const beforeContent = result.content;
    const beforeLines = beforeContent.split('\n');

    try {
      if (typeof rule.replacement === 'string') {
        result.content = result.content.replace(rule.pattern, rule.replacement);
      } else {
        result.content = result.content.replace(rule.pattern, rule.replacement);
      }

      // 检查是否有变化
      if (beforeContent !== result.content) {
        result.stats.rulesApplied++;
        
        // 计算变化的行数
        const afterLines = result.content.split('\n');
        const changedLines = countChangedLines(beforeLines, afterLines);
        result.stats.linesChanged += changedLines;

        // 记录变化详情
        recordChanges(rule, beforeLines, afterLines, result.changes);
      }
    } catch (error) {
      result.warnings.push(`规则 "${rule.name}" 应用失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

/**
 * 根据模板差异生成格式转换规则
 */
export function generateFormatRulesFromTemplates(
  fromTemplate: TriadTemplate,
  toTemplate: TriadTemplate
): MarkdownFormatRule[] {
  const rules: MarkdownFormatRule[] = [];

  // 分析模板内容差异
  const fromContent = fromTemplate.markdownTemplate.markdownContent;
  const toContent = toTemplate.markdownTemplate.markdownContent;

  // 检测标题级别变化
  const fromHeadings = extractHeadings(fromContent);
  const toHeadings = extractHeadings(toContent);

  if (fromHeadings.length > 0 && toHeadings.length > 0) {
    const fromLevel = fromHeadings[0].level;
    const toLevel = toHeadings[0].level;

    if (fromLevel !== toLevel) {
      const ruleKey = `h${fromLevel}-to-h${toLevel}`;
      if (MARKDOWN_FORMAT_RULES[ruleKey]) {
        rules.push(MARKDOWN_FORMAT_RULES[ruleKey]);
      }
    }
  }

  // 检测其他格式差异
  // 这里可以添加更多的智能检测逻辑

  return rules;
}

/**
 * 提取标题信息
 */
function extractHeadings(content: string): Array<{level: number; text: string}> {
  const headings: Array<{level: number; text: string}> = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2]
      });
    }
  }

  return headings;
}

/**
 * 计算变化的行数
 */
function countChangedLines(beforeLines: string[], afterLines: string[]): number {
  let changedCount = 0;
  const maxLength = Math.max(beforeLines.length, afterLines.length);

  for (let i = 0; i < maxLength; i++) {
    const before = beforeLines[i] || '';
    const after = afterLines[i] || '';
    if (before !== after) {
      changedCount++;
    }
  }

  return changedCount;
}

/**
 * 记录变化详情
 */
function recordChanges(
  rule: MarkdownFormatRule,
  beforeLines: string[],
  afterLines: string[],
  changes: MarkdownFormatChange[]
): void {
  const maxLength = Math.max(beforeLines.length, afterLines.length);

  for (let i = 0; i < maxLength; i++) {
    const before = beforeLines[i] || '';
    const after = afterLines[i] || '';
    
    if (before !== after) {
      changes.push({
        rule: rule.name,
        line: i + 1,
        before,
        after
      });
    }
  }
}

/**
 * 验证格式转换配置
 */
export function validateFormatConfig(config: MarkdownFormatConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查模板是否存在
  if (!config.fromTemplate || !config.toTemplate) {
    errors.push('源模板和目标模板不能为空');
  }

  // 检查格式规则
  if (!config.formatRules || config.formatRules.length === 0) {
    errors.push('至少需要一个格式转换规则');
  }

  // 检查规则的有效性
  for (const rule of config.formatRules) {
    if (!rule.pattern || !rule.replacement) {
      errors.push(`规则 "${rule.name}" 缺少必要的模式或替换内容`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
