/**
 * 卡片元数据类型定义
 * 用于支持语义标记系统的额外字段
 */

/**
 * 卡片元数据接口
 * 包含所有标准的额外字段
 */
export interface CardMetadata {
  /** 提示信息 - 帮助用户回忆答案 */
  hint?: string;
  
  /** 详细解析 - 解释答案的原理或背景 */
  explanation?: string;
  
  /** 语境说明 - 为挖空题等提供上下文 */
  context?: string;
  
  /** 难度等级 */
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  
  /** 来源引用 - 链接到原始笔记 */
  source?: string;
  
  /** 关联笔记 - 相关知识点链接 */
  related?: string[];
  
  /** 自定义额外字段 */
  customFields?: Record<string, string>;
}

/**
 * 元数据区域结构
 * 表示解析后的元数据部分
 */
export interface MetadataSection {
  /** 是否存在元数据区域 */
  exists: boolean;
  
  /** 原始元数据内容 */
  rawContent: string;
  
  /** 解析后的元数据 */
  parsed: CardMetadata;
  
  /** 元数据开始位置（用于编辑器定位） */
  startIndex: number;
  
  /** 元数据结束位置 */
  endIndex: number;
}

/**
 * 解析结果接口
 * 包含解析后的所有信息
 */
export interface ParseResult {
  /** 是否解析成功 */
  success: boolean;
  
  /** 解析后的字段（用于存储和Anki同步） */
  fields: Record<string, string>;
  
  /** 解析后的元数据 */
  metadata?: CardMetadata;
  
  /** 原始Markdown内容 */
  rawContent: string;
  
  /** 解析错误信息（如果失败） */
  error?: ParseError;
  
  /** 解析警告信息 */
  warnings?: string[];
}

/**
 * 解析错误类型
 */
export enum ParseErrorType {
  /** 无效格式 - 不符合基本格式要求 */
  INVALID_FORMAT = 'invalid_format',
  
  /** 缺少必需字段 */
  MISSING_REQUIRED_FIELD = 'missing_required_field',
  
  /** 无效的元数据 */
  INVALID_METADATA = 'invalid_metadata',
  
  /** 无法识别的题型 */
  UNKNOWN_CARD_TYPE = 'unknown_card_type',
  
  /** 选择题缺少正确答案标记 */
  MISSING_CORRECT_MARKER = 'missing_correct_marker',
  
  /** 挖空题没有挖空内容 */
  NO_CLOZE_FOUND = 'no_cloze_found',
}

/**
 * 解析错误详情
 */
export interface ParseError {
  /** 错误类型 */
  type: ParseErrorType;
  
  /** 错误消息 */
  message: string;
  
  /** 错误位置（如果可定位） */
  position?: {
    line: number;
    column: number;
  };
  
  /** 建议的修复方案 */
  suggestion?: string;
  
  /** 原始内容片段（用于调试） */
  snippet?: string;
}

/**
 * 额外字段定义
 * 用于配置哪些额外字段可用
 */
export interface ExtraFieldDefinition {
  /** 字段名称 */
  name: string;
  
  /** 字段显示标签 */
  label: string;
  
  /** 字段描述 */
  description: string;
  
  /** Markdown标记前缀（如 "💡 Hint:"） */
  markdownPrefix: string;
  
  /** 是否为标准字段 */
  isStandard: boolean;
  
  /** 字段类型 */
  type: 'text' | 'multiline' | 'list' | 'enum';
  
  /** 枚举值（如果type为enum） */
  enumValues?: string[];
  
  /** 是否在预览中显示 */
  showInPreview: boolean;
  
  /** 显示优先级（数字越小越靠前） */
  displayPriority: number;
}

/**
 * 标准额外字段定义
 */
export const STANDARD_EXTRA_FIELDS: ExtraFieldDefinition[] = [
  {
    name: 'hint',
    label: '提示',
    description: '帮助用户回忆答案的提示信息',
    markdownPrefix: '💡 Hint:',
    isStandard: true,
    type: 'multiline',
    showInPreview: true,
    displayPriority: 1
  },
  {
    name: 'context',
    label: '语境',
    description: '为挖空题提供的上下文说明',
    markdownPrefix: '💡 Context:',
    isStandard: true,
    type: 'multiline',
    showInPreview: true,
    displayPriority: 2
  },
  {
    name: 'explanation',
    label: '解析',
    description: '详细解释答案的原理或背景知识',
    markdownPrefix: 'Explanation:',
    isStandard: true,
    type: 'multiline',
    showInPreview: true,
    displayPriority: 3
  },
  {
    name: 'difficulty',
    label: '难度',
    description: '卡片的难度等级',
    markdownPrefix: 'Difficulty:',
    isStandard: true,
    type: 'enum',
    enumValues: ['Easy', 'Medium', 'Hard'],
    showInPreview: false,
    displayPriority: 4
  },
  {
    name: 'source',
    label: '来源',
    description: '知识点的原始来源笔记',
    markdownPrefix: 'Source:',
    isStandard: true,
    type: 'text',
    showInPreview: false,
    displayPriority: 5
  },
  {
    name: 'related',
    label: '关联',
    description: '相关知识点的笔记链接',
    markdownPrefix: 'Related:',
    isStandard: true,
    type: 'list',
    showInPreview: false,
    displayPriority: 6
  }
];

/**
 * 获取字段定义
 */
export function getFieldDefinition(fieldName: string): ExtraFieldDefinition | undefined {
  return STANDARD_EXTRA_FIELDS.find(f => f.name === fieldName);
}

/**
 * 获取字段的Markdown前缀
 */
export function getFieldMarkdownPrefix(fieldName: string): string {
  const field = getFieldDefinition(fieldName);
  return field?.markdownPrefix || `${fieldName}:`;
}







