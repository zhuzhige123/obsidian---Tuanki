/**
 * 字段定义接口
 */
export interface FieldDefinition {
  name: string;
  type: 'text' | 'html' | 'image' | 'audio' | 'video';
  required: boolean;
  parsePattern?: string;
  description?: string;
  defaultValue?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
}

/**
 * 验证规则接口
 */
export interface ValidationRules {
  required?: string[];
  minLength?: Record<string, number>;
  maxLength?: Record<string, number>;
  patterns?: Record<string, string>;
  custom?: Record<string, (value: string) => boolean>;
}

/**
 * 渲染规则接口
 */
export interface RenderingRules {
  [fieldName: string]: {
    allowHtml?: boolean;
    allowMarkdown?: boolean;
    sanitize?: boolean;
    maxLength?: number;
    truncate?: boolean;
  };
}

// TriadTemplate 接口已移除 - 使用 FieldTemplate (src/data/template-types.ts) 作为主要模板接口

// 模板匹配和解析相关接口已移除 - 使用 PresetTemplateManager 进行模板管理

/**
 * 模板验证结果
 */
export interface TemplateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * 模板统计信息
 */
export interface TemplateStatistics {
  totalTemplates: number;
  activeTemplates: number;
  usageCount: Record<string, number>;
  successRate: Record<string, number>;
  averageConfidence: Record<string, number>;
}

/**
 * 预定义模板类型
 */
export enum TemplateType {
  BASIC_QA = 'basic-qa',
  CLOZE = 'cloze',
  CONCEPT = 'concept',
  DEFINITION = 'definition',
  EXAMPLE = 'example',
  FORMULA = 'formula',
  CODE = 'code',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  CUSTOM = 'custom'
}

/**
 * 模板创建选项
 */
export interface TemplateCreateOptions {
  type: TemplateType;
  name: string;
  description?: string;
  baseTemplate?: string;
  customFields?: Record<string, FieldDefinition>;
  customValidation?: ValidationRules;
  customRendering?: RenderingRules;
}

// 模板更新选项已移除 - 使用 FieldTemplate 接口进行模板操作

// 模板导入导出格式已移除 - 使用 PresetTemplateManager 的内置功能

/**
 * 模板搜索选项
 */
export interface TemplateSearchOptions {
  query?: string;
  type?: TemplateType;
  category?: string;
  tags?: string[];
  enabled?: boolean;
  sortBy?: 'name' | 'usage' | 'created' | 'modified';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// 模板搜索结果已移除 - 使用 PresetTemplateManager 的搜索功能

/**
 * 模板事件类型
 */
export enum TemplateEventType {
  CREATED = 'template_created',
  UPDATED = 'template_updated',
  DELETED = 'template_deleted',
  USED = 'template_used',
  VALIDATED = 'template_validated',
  IMPORTED = 'template_imported',
  EXPORTED = 'template_exported'
}

/**
 * 模板事件数据
 */
export interface TemplateEvent {
  type: TemplateEventType;
  templateId: string;
  timestamp: string;
  data?: any;
  source?: string;
}

// TemplateManager 接口已移除 - 使用 PresetTemplateManager 类作为模板管理器
