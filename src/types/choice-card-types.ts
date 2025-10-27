/**
 * 选择题卡片类型定义
 * 
 * @version 1.0.0
 * @description 为选择题提供完整的类型定义
 */

/**
 * 选择题选项接口
 */
export interface ChoiceOption {
  /** 选项唯一标识 (a, b, c, d) */
  id: string;
  
  /** 选项内容 (支持Markdown) */
  content: string;
  
  /** 是否为正确答案 */
  isCorrect: boolean;
  
  /** 选项标签 (A, B, C, D) */
  label?: string;
}

/**
 * 选择题卡片数据
 */
export interface MultipleChoiceCardData {
  /** 题型标识 */
  type: 'choice' | 'multiple-choice';
  
  /** 问题内容 (Markdown) */
  question: string;
  
  /** 选项列表 */
  options: ChoiceOption[];
  
  /** 答案解析 (Markdown) */
  explanation: string;
  
  /** 是否允许多选 */
  multipleAnswers?: boolean;
  
  /** 源文件路径 (用于Obsidian渲染) */
  sourcePath?: string;
  
  /** 额外元数据 */
  metadata?: {
    /** 难度等级 */
    difficulty?: 'easy' | 'medium' | 'hard';
    
    /** 标签 */
    tags?: string[];
    
    /** 创建时间 */
    created?: number;
    
    /** 最后修改时间 */
    modified?: number;
  };
}

/**
 * 选择题解析结果
 */
export interface ChoiceParseResult {
  /** 是否解析成功 */
  success: boolean;
  
  /** 解析后的数据 */
  data?: MultipleChoiceCardData;
  
  /** 错误信息 */
  error?: string;
  
  /** 解析置信度 (0-1) */
  confidence: number;
  
  /** 解析方法 */
  parseMethod: 'markdown' | 'structured' | 'yaml';
}

/**
 * 选择题Markdown格式定义
 * 
 * 支持的格式示例：
 * ```markdown
 * ## 问题
 * 这是问题内容
 * 
 * ## 选项
 * - [ ] 选项A
 * - [x] 选项B（正确答案）
 * - [ ] 选项C
 * - [ ] 选项D
 * 
 * ## 解析
 * 这是答案解析
 * ```
 */
export interface ChoiceMarkdownFormat {
  /** 问题标记 */
  questionMarker: string[];
  
  /** 选项标记 */
  optionMarker: RegExp;
  
  /** 正确答案标记 */
  correctMarker: string;
  
  /** 解析标记 */
  explanationMarker: string[];
}

/**
 * 默认Markdown格式定义
 */
export const DEFAULT_CHOICE_FORMAT: ChoiceMarkdownFormat = {
  questionMarker: ['## 问题', '## Question', '### 问题', '### Question'],
  optionMarker: /^\s*[-*]\s*\[([ xX])\]\s*(.+)$/,
  correctMarker: 'x',
  explanationMarker: ['## 解析', '## Explanation', '### 解析', '### Explanation', '## 答案', '## Answer'],
};







