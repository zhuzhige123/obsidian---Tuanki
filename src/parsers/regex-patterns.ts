/**
 * 卡片解析正则表达式库
 * 提供各题型内容解析所需的正则表达式
 */

import { SEMANTIC_MARKERS, CARD_TYPE_MARKERS } from '../constants/markdown-delimiters';

/**
 * 问答题正则表达式
 */
export const QA_PATTERNS = {
  /**
   * 完整问答题格式（不含Hint）
   * 匹配: Q: 问题\n---\nA: 答案
   * 注意：支持单换行或双换行，更加灵活
   */
  FULL_WITHOUT_HINT: /^Q:\s*(.+?)\n+\s*---\s*\n+(?:A:\s*)?(.+)$/s,
  
  /**
   * 完整问答题格式（含Hint）
   * 匹配: Q: 问题\n💡 Hint: 提示\n---\nA: 答案
   * 注意：支持单换行或双换行，更加灵活
   */
  FULL_WITH_HINT: /^Q:\s*(.+?)\n+💡\s*Hint:\s*(.+?)\n+\s*---\s*\n+(?:A:\s*)?(.+)$/s,
  
  /**
   * 问题部分
   * 匹配: Q: 内容
   */
  QUESTION: /^Q:\s*(.+?)$/m,
  
  /**
   * 答案部分
   * 匹配: A: 内容 或 直接内容（在---之后）
   */
  ANSWER: /^(?:A:\s*)?(.+)$/s,
  
  /**
   * Hint部分
   * 匹配: 💡 Hint: 内容
   */
  HINT: /💡\s*Hint:\s*(.+?)(?=\n\n|$)/s,
} as const;

/**
 * 选择题正则表达式
 */
export const CHOICE_PATTERNS = {
  /**
   * 完整选择题格式（不含Hint）
   * 匹配: Q: 问题\n\n选项列表\n\n答案解析
   */
  FULL_WITHOUT_HINT: /^Q:\s*(.+?)\n\n((?:[A-H]\).+?\n)+)\s*(?:---\s*\n\n)?(.*)$/s,
  
  /**
   * 完整选择题格式（含Hint）
   * 匹配: Q: 问题\n💡 Hint: 提示\n\n选项列表\n\n解析
   */
  FULL_WITH_HINT: /^Q:\s*(.+?)\n\n💡\s*Hint:\s*(.+?)\n\n((?:[A-H]\).+?\n)+)\s*(?:---\s*\n\n)?(.*)$/s,
  
  /**
   * 问题部分
   * 匹配: Q: 内容
   */
  QUESTION: /^Q:\s*(.+?)$/m,
  
  /**
   * 单个选项
   * 匹配: A) 选项内容 {✓}
   */
  OPTION: /^([A-H])\)\s*(.+?)(\s*\{[✓✔]\})?$/,
  
  /**
   * 选项列表（全局匹配）
   * 匹配所有 A) B) C) 格式的选项
   */
  OPTIONS_LIST: /^([A-H])\)\s*(.+?)(\s*\{[✓✔]\})?$/gm,
  
  /**
   * 正确答案标记
   * 匹配: {✓} 或 {✔} 或其他变体
   */
  CORRECT_MARKER: /\{[✓✔]\}|(?:^|\s)[✓✔](?:\s|$)/,
  
  /**
   * Hint部分
   */
  HINT: /💡\s*Hint:\s*(.+?)(?=\n\n|$)/s,
  
  /**
   * 解析部分（在---之后或选项列表之后）
   */
  EXPLANATION: /(?:---\s*\n\n)?(?:Explanation:\s*)?(.+)$/s,
} as const;

/**
 * 挖空题正则表达式
 */
export const CLOZE_PATTERNS = {
  /**
   * Obsidian风格挖空
   * 匹配: ==文本==
   */
  OBSIDIAN_STYLE: /==([^=]+)==/g,
  
  /**
   * Anki风格挖空
   * 匹配: {{c1::文本}} 或 {{c1::文本::提示}}
   */
  ANKI_STYLE: /\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g,
  
  /**
   * 混合挖空检测（全局）
   * 匹配任意风格的挖空标记
   */
  ANY_CLOZE: /(?:==([^=]+)==|\{\{c\d+::([^}]+)\}\})/g,
  
  /**
   * Context部分
   * 匹配: 💡 Context: 内容
   */
  CONTEXT: /💡\s*Context:\s*(.+?)(?=\n\n|$)/s,
  
  /**
   * 提取挖空编号（Anki风格）
   */
  CLOZE_NUMBER: /\{\{c(\d+)::/,
} as const;

/**
 * 元数据字段正则表达式
 */
export const METADATA_PATTERNS = {
  /**
   * 通用字段格式
   * 匹配: FieldName: value
   */
  GENERIC_FIELD: /^([A-Z][a-zA-Z]+):\s*(.+?)$/gm,
  
  /**
   * Explanation字段
   * 匹配: Explanation: 内容（可能多行）
   */
  EXPLANATION: /^Explanation:\s*(.+?)(?=\n[A-Z][a-zA-Z]+:|$)/ms,
  
  /**
   * Tags字段
   * 匹配: Tags: #tag1 #tag2 或 Tags: tag1, tag2
   */
  TAGS: /^Tags:\s*(.+?)$/m,
  
  /**
   * Source字段
   * 匹配: Source: [[笔记链接]] 或 Source: 文本
   */
  SOURCE: /^Source:\s*(.+?)$/m,
  
  /**
   * Difficulty字段
   * 匹配: Difficulty: Easy|Medium|Hard
   */
  DIFFICULTY: /^Difficulty:\s*(Easy|Medium|Hard)$/mi,
  
  /**
   * Related字段（可能多个链接）
   * 匹配: Related: [[链接1]], [[链接2]]
   */
  RELATED: /^Related:\s*(.+?)$/m,
  
  /**
   * 提取标签列表
   * 从Tags字段值中提取所有标签
   */
  EXTRACT_TAGS: /#[\w\u4e00-\u9fa5_-]+|(?:^|[,\s]+)([\w\u4e00-\u9fa5_-]+)/g,
  
  /**
   * 提取Wiki链接
   * 匹配: [[链接文本]]
   */
  EXTRACT_WIKI_LINKS: /\[\[([^\]]+)\]\]/g,
} as const;

/**
 * 辅助工具函数
 */

/**
 * 提取问答题的主要部分
 */
export function extractQAParts(content: string): {
  question: string | null;
  hint: string | null;
  answer: string | null;
} {
  // 尝试匹配含Hint的格式
  let match = content.match(QA_PATTERNS.FULL_WITH_HINT);
  if (match) {
    return {
      question: match[1].trim(),
      hint: match[2].trim(),
      answer: match[3].trim(),
    };
  }
  
  // 尝试匹配不含Hint的格式
  match = content.match(QA_PATTERNS.FULL_WITHOUT_HINT);
  if (match) {
    return {
      question: match[1].trim(),
      hint: null,
      answer: match[2].trim(),
    };
  }
  
  return {
    question: null,
    hint: null,
    answer: null,
  };
}

/**
 * 提取选择题的选项
 */
export function extractChoiceOptions(optionsText: string): Array<{
  label: string;
  text: string;
  isCorrect: boolean;
}> {
  const options: Array<{
    label: string;
    text: string;
    isCorrect: boolean;
  }> = [];
  
  const matches = optionsText.matchAll(CHOICE_PATTERNS.OPTIONS_LIST);
  
  for (const match of matches) {
    const label = match[1]; // A, B, C, D...
    const text = match[2].trim();
    const hasMarker = !!match[3];
    
    // 移除文本中的正确标记
    const cleanText = text.replace(CHOICE_PATTERNS.CORRECT_MARKER, '').trim();
    
    options.push({
      label: `${label})`,
      text: cleanText,
      isCorrect: hasMarker,
    });
  }
  
  return options;
}

/**
 * 提取挖空内容
 */
export function extractClozeContents(content: string): Array<{
  original: string;
  clozeText: string;
  hint?: string;
  index: number;
  style: 'obsidian' | 'anki';
}> {
  const clozes: Array<{
    original: string;
    clozeText: string;
    hint?: string;
    index: number;
    style: 'obsidian' | 'anki';
  }> = [];
  
  // 提取Obsidian风格挖空
  let match;
  const obsidianMatches = content.matchAll(CLOZE_PATTERNS.OBSIDIAN_STYLE);
  let obsidianIndex = 1;
  for (const m of obsidianMatches) {
    clozes.push({
      original: m[0],
      clozeText: m[1],
      index: obsidianIndex++,
      style: 'obsidian',
    });
  }
  
  // 提取Anki风格挖空
  const ankiMatches = content.matchAll(CLOZE_PATTERNS.ANKI_STYLE);
  for (const m of ankiMatches) {
    clozes.push({
      original: m[0],
      clozeText: m[2],
      hint: m[3] || undefined,
      index: parseInt(m[1]),
      style: 'anki',
    });
  }
  
  return clozes;
}

/**
 * 解析元数据区域的所有字段
 */
export function parseMetadataFields(metaContent: string): Record<string, string> {
  const fields: Record<string, string> = {};
  
  // 提取Explanation（可能多行）
  const explanationMatch = metaContent.match(METADATA_PATTERNS.EXPLANATION);
  if (explanationMatch) {
    fields.explanation = explanationMatch[1].trim();
  }
  
  // 提取其他单行字段
  const fieldMatches = metaContent.matchAll(METADATA_PATTERNS.GENERIC_FIELD);
  for (const match of fieldMatches) {
    const fieldName = match[1];
    const fieldValue = match[2].trim();
    
    // 跳过已处理的Explanation字段
    if (fieldName === 'Explanation' && fields.explanation) {
      continue;
    }
    
    // 转换为小写key（标准化）
    const normalizedKey = fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
    fields[normalizedKey] = fieldValue;
  }
  
  return fields;
}

/**
 * 从Tags字段提取标签数组
 */
export function extractTagsArray(tagsValue: string): string[] {
  const tags: string[] = [];
  const matches = tagsValue.matchAll(METADATA_PATTERNS.EXTRACT_TAGS);
  
  for (const match of matches) {
    const tag = match[1] || match[0];
    const cleanTag = tag.replace(/^#/, '').trim();
    if (cleanTag && !tags.includes(cleanTag)) {
      tags.push(cleanTag);
    }
  }
  
  return tags;
}

/**
 * 从Related字段提取链接数组
 */
export function extractRelatedLinks(relatedValue: string): string[] {
  const links: string[] = [];
  const matches = relatedValue.matchAll(METADATA_PATTERNS.EXTRACT_WIKI_LINKS);
  
  for (const match of matches) {
    const link = match[1].trim();
    if (link && !links.includes(link)) {
      links.push(link);
    }
  }
  
  return links;
}

