/**
 * 模板系统类型定义 - 支持三种不同的模板类型
 */

// 扩展以支持V3设计方案：一个列表项可以是字段或特殊元素

/**
 * 特殊元素，如分割线，可与字段一起在列表中排序
 */
export interface SpecialElement {
  id: string; // 每个列表项都需要唯一ID以便渲染和排序
  type: 'hr'; // 'hr' 代表分割线
}

/**
 * 字段定义，使用 side 属性来控制显示位置
 */
export interface FieldTemplateField {
  id: string; // 唯一ID
  type: 'field'; // 类型标识
  name: string; // UI名称 (可编辑), e.g., "单词"
  key: string;  // 字段ID (不可编辑), e.g., "word"
  side: 'front' | 'back' | 'both'; // 控制显示在哪一面
}

// 列表中任何一项的联合类型
export type TemplateItem = FieldTemplateField | SpecialElement;

/**
 * 模板分类枚举
 */
export enum TemplateCategory {
  BASIC = 'basic',           // 基础卡片
  CLOZE = 'cloze',          // 挖空卡
  CHOICE = 'choice',        // 选择题
  LANGUAGE = 'language',    // 语言学习
  SCIENCE = 'science',      // 科学学科
  MATH = 'math',           // 数学
  HISTORY = 'history',     // 历史
  LITERATURE = 'literature', // 文学
  PROGRAMMING = 'programming', // 编程
  MEDICAL = 'medical',     // 医学
  GENERAL = 'general'       // 通用
}

/**
 * 字段模板接口
 */
export interface FieldTemplate {
  id: string;
  name: string;
  fields: TemplateItem[];
  frontTemplate: string;
  backTemplate: string;
  description?: string;
  isOfficial?: boolean;
  // 新增：模板分类
  category?: TemplateCategory;
  // 新增：版本管理和时间戳
  version?: string;        // 模板版本
  schemaVersion?: string;  // 数据结构版本
  createdAt?: string;      // 创建时间
  updatedAt?: string;      // 更新时间

  // 新增：题型标识和渲染提示
  cardType?: import('../types/unified-card-types').UnifiedCardType;  // 题型标识
  renderingHints?: {       // 渲染提示
    questionPosition?: 'top' | 'left' | 'inline';
    answerReveal?: 'click' | 'hover' | 'auto';
    interactionMode?: 'click' | 'input' | 'select' | 'drag';
    showProgress?: boolean;
    enableAnimations?: boolean;
    keyboardNavigation?: boolean;
    autoFocus?: boolean;
  };

  // 元数据支持
  metadata?: {
    originalAnkiModelId?: string;
    importedAt?: string;
    source?: string;
    [key: string]: any;
  };
}






export interface ParseResult {
  front?: string;
  back?: string;
  text?: string;
  options?: Array<{ text: string; correct: boolean }>;
  tags?: string[];
  type?: 'basic' | 'cloze' | 'multiple';
  templateName?: string;
  error?: string;
}

// =================================================================
// 标准化字段类型系统
// =================================================================

/**
 * 标准化字段类型枚举
 * 提供统一的字段类型定义，支持不同学科和使用场景
 */
export enum StandardFieldType {
  // 基础文本类型
  TEXT = 'text',                    // 普通文本
  RICH_TEXT = 'rich_text',         // 富文本（支持HTML）
  MARKDOWN = 'markdown',           // Markdown文本
  LONG_TEXT = 'long_text',         // 长文本

  // 语言学习类型
  WORD = 'word',                   // 单词
  PHRASE = 'phrase',               // 短语
  SENTENCE = 'sentence',           // 句子
  PRONUNCIATION = 'pronunciation',  // 发音（音标）
  TRANSLATION = 'translation',     // 翻译
  ETYMOLOGY = 'etymology',         // 词源
  PART_OF_SPEECH = 'part_of_speech', // 词性

  // 学术类型
  CONCEPT = 'concept',             // 概念名称
  DEFINITION = 'definition',       // 定义
  FORMULA = 'formula',             // 公式（支持LaTeX）
  EQUATION = 'equation',           // 方程式
  THEOREM = 'theorem',             // 定理
  PROOF = 'proof',                 // 证明

  // 媒体类型
  IMAGE = 'image',                 // 图片
  AUDIO = 'audio',                 // 音频
  VIDEO = 'video',                 // 视频
  DIAGRAM = 'diagram',             // 图表

  // 代码类型
  CODE = 'code',                   // 代码块
  CODE_SNIPPET = 'code_snippet',   // 代码片段
  ALGORITHM = 'algorithm',         // 算法
  SYNTAX = 'syntax',               // 语法

  // 结构化类型
  LIST = 'list',                   // 列表
  TABLE = 'table',                 // 表格
  OUTLINE = 'outline',             // 大纲

  // 学习辅助类型
  CLOZE = 'cloze',                 // 挖空
  HINT = 'hint',                   // 提示
  EXPLANATION = 'explanation',     // 解释
  EXAMPLE = 'example',             // 示例
  COUNTEREXAMPLE = 'counterexample', // 反例
  NOTE = 'note',                   // 备注
  MNEMONIC = 'mnemonic',           // 记忆法

  // 分类和标识类型
  TAG = 'tag',                     // 标签
  CATEGORY = 'category',           // 分类
  DIFFICULTY = 'difficulty',       // 难度
  PRIORITY = 'priority',           // 优先级
  SOURCE = 'source',               // 来源

  // 时间和数值类型
  DATE = 'date',                   // 日期
  NUMBER = 'number',               // 数字
  PERCENTAGE = 'percentage',       // 百分比
  RATING = 'rating',               // 评分

  // 自定义类型
  CUSTOM = 'custom'                // 自定义字段
}

/**
 * 字段验证规则配置
 */
export interface FieldValidationRules {
  required?: boolean;              // 是否必填
  minLength?: number;              // 最小长度
  maxLength?: number;              // 最大长度
  pattern?: string;                // 正则表达式模式
  allowedValues?: string[];        // 允许的值列表
  customValidator?: string;        // 自定义验证器ID

  // 数值类型验证
  min?: number;                    // 最小值
  max?: number;                    // 最大值
  step?: number;                   // 步长

  // 特殊验证
  allowHtml?: boolean;             // 是否允许HTML
  allowLatex?: boolean;            // 是否允许LaTeX
  allowMarkdown?: boolean;         // 是否允许Markdown
}

/**
 * 字段显示配置
 */
export interface FieldDisplayConfig {
  placeholder?: string;            // 占位符文本
  helpText?: string;               // 帮助文本
  multiline?: boolean;             // 是否多行
  rows?: number;                   // 行数（多行时）
  syntax?: string;                 // 语法高亮类型
  showPreview?: boolean;           // 是否显示预览

  // 输入控件配置
  inputType?: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'number' | 'date' | 'file';
  options?: string[];              // 选项列表（select/radio时）

  // 样式配置
  width?: string;                  // 宽度
  height?: string;                 // 高度
  className?: string;              // CSS类名
}

/**
 * 增强的字段模板字段定义
 */
export interface EnhancedFieldTemplateField extends FieldTemplateField {
  // 标准化字段类型
  fieldType?: StandardFieldType;

  // 验证规则
  validation?: FieldValidationRules;

  // 显示配置
  display?: FieldDisplayConfig;

  // 字段元数据
  metadata?: {
    description?: string;          // 字段描述
    category?: string;             // 字段分类
    tags?: string[];               // 字段标签
    version?: string;              // 字段版本
    deprecated?: boolean;          // 是否已废弃
    replacedBy?: string;           // 被哪个字段替代
  };

  // 学习相关配置
  learningConfig?: {
    weight?: number;               // 学习权重
    difficulty?: number;           // 难度系数
    importance?: number;           // 重要性
    reviewFrequency?: number;      // 复习频率
  };
}

/**
 * 字段类型配置映射
 * 为每种标准字段类型提供默认配置
 */
export interface FieldTypeConfig {
  type: StandardFieldType;
  defaultValidation: FieldValidationRules;
  defaultDisplay: FieldDisplayConfig;
  description: string;
  category: string;
  examples: string[];
}

/**
 * 增强的字段模板定义
 */
export interface EnhancedFieldTemplate extends Omit<FieldTemplate, 'fields'> {
  fields: (EnhancedFieldTemplateField | SpecialElement)[];

  // 模板元数据增强
  category?: string;               // 模板分类
  tags?: string[];                 // 模板标签
  difficulty?: 'beginner' | 'intermediate' | 'advanced'; // 难度级别
  usageCount?: number;             // 使用次数
  rating?: number;                 // 用户评分

  // 学科相关
  subject?: string;                // 学科
  language?: string;               // 语言

  // 兼容性信息
  compatibility?: {
    ankiVersion?: string;          // 兼容的Anki版本
    pluginVersion?: string;        // 兼容的插件版本
    features?: string[];           // 需要的功能特性
  };
}

/**
 * 双模式字段模板
 * 支持字段驱动模式和正则驱动模式
 */
export interface DualModeFieldTemplate extends FieldTemplate {
  // 双模式配置
  mode: 'field-driven' | 'regex-driven';

  // 字段驱动模式配置
  fieldDrivenConfig?: {
    fields: EnhancedFieldTemplateField[];
    autoGenerate: boolean;         // 是否自动生成正则
    validation: boolean;           // 是否启用验证
  };

  // 正则驱动模式配置
  regexDrivenConfig?: {
    regex: string;                 // 正则表达式
    flags: string;                 // 正则标志
    fieldMappings: Record<string, number>; // 字段映射
    testCases: Array<{             // 测试用例
      input: string;
      expectedOutput: Record<string, string>;
    }>;
  };

  // 模式切换历史
  modeHistory?: Array<{
    mode: 'field-driven' | 'regex-driven';
    timestamp: string;
    reason?: string;
  }>;
}

// =================================================================
// 临时兼容类型 - 待移除
// =================================================================

/**
 * 正则解析模板（旧系统）
 * @deprecated 旧系统类型，将在v0.6.0移除
 * 请迁移到新的 FieldTemplate 系统
 * 计划删除时间: 2025 Q2
 */
export interface RegexParseTemplate {
  /** 模板ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 正则表达式 */
  regex: string;
  /** 解析选项 */
  parseOptions?: {
    global?: boolean;
    multiline?: boolean;
    ignoreCase?: boolean;
  };
  /** 字段映射（捕获组索引 -> 字段名） */
  fieldMappings?: Record<string, number>;
  /** 优先级 */
  priority?: number;
  /** 描述 */
  description?: string;
}
