/**
 * 新版简化卡片解析系统类型定义
 * 完全替代旧的三位一体模板系统
 */

/**
 * 简化解析设置 - 全局配置
 */
export interface SimplifiedParsingSettings {
  // 标签触发配置
  enableTagTrigger: boolean;
  triggerTag: string;

  // 核心分隔符配置（全局适用）
  symbols: {
    rangeStart: string;      // 批量范围起始标记
    rangeEnd: string;        // 批量范围结束标记
    cardDelimiter: string;   // 卡片分隔符
    faceDelimiter: string;   // 正反面分隔符
    clozeMarker: string;     // 挖空标记
  };

  // 批量解析配置
  batchParsing: {
    autoCreateBlockLinks: boolean;    // 自动创建块链接
    autoSetSourceFile: boolean;       // 自动设置源文件
    blockIdPrefix: string;            // 块ID前缀
    insertMetadata: boolean;          // 是否插入完整元数据（UUID、时间戳）
    
    // 🆕 自动触发配置
    autoTrigger: boolean;             // 是否启用自动触发
    triggerDebounce: number;          // 自动触发防抖延迟（毫秒）
    onlyActiveFile: boolean;          // 自动触发仅限活动文件
    
    // 🆕 扫描范围配置
    includeFolders: string[];         // 包含的文件夹路径
    excludeFolders: string[];         // 排除的文件夹路径
    maxFilesPerBatch: number;         // 批量处理最大文件数
    
    // 🆕 卡片保存配置
    defaultDeckId?: string;           // 默认牌组ID（用于批量解析）
    defaultPriority: number;          // 默认优先级
  };

  // 模板系统配置
  enableTemplateSystem: boolean;
  templates: ParseTemplate[];
  defaultTemplateId?: string;
}

/**
 * 解析模板 - 统一的模板定义
 */
export interface ParseTemplate {
  id: string;
  name: string;
  description?: string;

  // 模板类型
  type: 'single-field' | 'complete-regex';

  // 单字段解析配置
  fields?: TemplateField[];

  // 完整正则解析配置
  regex?: string;
  flags?: string;

  // 字段映射（用于正则表达式捕获组到字段的映射）
  fieldMappings?: Record<string, number>;

  // 应用场景
  scenarios: TemplateScenario[];

  // 元数据
  isDefault?: boolean;
  isOfficial?: boolean;
  createdAt?: string;
  updatedAt?: string;

  // 同步能力标识（用于 AnkiConnect 同步）
  syncCapability?: {
    ankiModelMapping?: {
      modelId?: number;
      modelName: string;
      lastSyncVersion?: string;
    };
  };

  // Tuanki 元数据（用于模板识别和版本管理）
  tuankiMetadata?: {
    signature: string;
    version: string;
    ankiCompatible: boolean;
    source: 'tuanki_created' | 'anki_imported' | 'user_custom' | 'official';
    createdInTuanki?: boolean;
    editedInTuanki?: boolean;
  };
}

/**
 * 模板字段定义
 */
export interface TemplateField {
  name: string;           // 字段名称（如：Front, Back, Tags）
  pattern: string;        // 模式字符串（可以是正则或普通文本）
  isRegex: boolean;       // 是否为正则表达式
  flags?: string;         // 正则标志（仅当isRegex为true时使用）
  required?: boolean;     // 是否必需
  description?: string;   // 字段描述
  
  // Anki兼容性字段 (用于APKG导入和AnkiConnect同步)
  type?: 'field';         // 字段类型，默认为'field'
  side?: 'front' | 'back' | 'both';  // 字段显示位置
  key?: string;           // 字段键名（用于从card.fields中提取内容）
}

/**
 * 模板应用场景
 */
export type TemplateScenario = 'newCard' | 'study' | 'batch' | 'edit';

/**
 * 解析结果
 */
export interface ParseResult {
  success: boolean;
  cards: ParsedCard[];
  errors: ParseError[];
  stats: ParseStats;
  templateUsed?: string;
}

/**
 * 解析后的卡片
 */
export interface ParsedCard {
  id?: string;
  type: CardType;
  front: string;
  back: string;
  tags: string[];
  fields?: Record<string, string>;
  metadata?: CardMetadata;
  template?: string;
  
  // 源信息字段
  sourceFile?: string;        // 源文件路径
  sourceBlock?: string;       // 块链接 (格式: ^blockId)
}

/**
 * 卡片类型
 */
export type CardType = 'qa' | 'mcq' | 'cloze';

/**
 * 卡片元数据
 */
export interface CardMetadata {
  sourceContent?: string;
  parseMethod?: 'symbol' | 'template';
  confidence?: number;
  warnings?: string[];
  
  // 批量解析相关元数据
  blockId?: string;                    // 块ID（不带^前缀）
  originalCardContent?: string;        // 卡片原始内容（用于定位）
  contentWithBlockId?: string;         // 包含块ID的内容
}

/**
 * 解析错误
 */
export interface ParseError {
  type: 'syntax' | 'validation' | 'template' | 'symbol';
  message: string;
  line?: number;
  column?: number;
  cardIndex?: number;
  suggestion?: string;
}

/**
 * 解析统计
 */
export interface ParseStats {
  totalCards: number;
  successfulCards: number;
  failedCards: number;
  cardTypes: Record<CardType, number>;
  templatesUsed: Record<string, number>;
  processingTime: number;
}

/**
 * 解析配置
 */
export interface ParseConfig {
  settings: SimplifiedParsingSettings;
  scenario: TemplateScenario;
  templateId?: string;
  enableValidation?: boolean;
  enableStats?: boolean;
}

/**
 * 批量解析配置
 */
export interface BatchParseConfig extends ParseConfig {
  maxCards?: number;
  skipErrors?: boolean;
  progressCallback?: (progress: number, current: number, total: number) => void;
  
  // 批量解析源信息
  sourceFile?: string;        // 源文件路径
  sourceFileName?: string;    // 源文件名
  sourceContent?: string;     // 源文档完整内容（用于块链接插入）
  
  // 内容更新回调
  onContentUpdated?: (updatedContent: string) => void | Promise<void>;
}

/**
 * 单卡解析配置
 */
export interface SingleCardParseConfig extends ParseConfig {
  allowEmpty?: boolean;
  defaultType?: CardType;
}

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
 * 符号配置验证结果
 */
export interface SymbolValidationResult {
  isValid: boolean;
  conflicts: string[];
  suggestions: string[];
}

/**
 * 解析器接口
 */
export interface ICardParser {
  parseContent(content: string, config: ParseConfig): Promise<ParseResult>;
  parseSingleCard(content: string, config: SingleCardParseConfig): Promise<ParsedCard | null>;
  parseBatchCards(content: string, config: BatchParseConfig): Promise<ParsedCard[]>;
  validateTemplate(template: ParseTemplate): TemplateValidationResult;
  validateSymbols(symbols: SimplifiedParsingSettings['symbols']): SymbolValidationResult;
}

/**
 * 默认设置
 */
export const DEFAULT_SIMPLIFIED_PARSING_SETTINGS: SimplifiedParsingSettings = {
  enableTagTrigger: true,
  triggerTag: '#tuanki',
  symbols: {
    rangeStart: '---start---',
    rangeEnd: '---end---',
    cardDelimiter: '---cd---',
    faceDelimiter: '---div---',
    clozeMarker: '=='
  },
  batchParsing: {
    autoCreateBlockLinks: false,
    autoSetSourceFile: true,
    blockIdPrefix: 'tuanki',
    insertMetadata: false,
    
    // 🆕 自动触发配置默认值
    autoTrigger: false,             // 默认关闭（避免干扰新用户）
    triggerDebounce: 2000,          // 2秒防抖
    onlyActiveFile: true,           // 仅活动文件
    
    // 🆕 扫描范围配置默认值
    includeFolders: [],             // 默认空（扫描全部）
    excludeFolders: [               // 默认排除这些文件夹
      '.obsidian',
      '.trash',
      'node_modules',
      '.git'
    ],
    maxFilesPerBatch: 50,           // 一次最多处理50个文件
    
    // 🆕 卡片保存配置默认值
    defaultDeckId: undefined,       // 默认不指定（使用第一个牌组）
    defaultPriority: 0              // 默认优先级为0
  },
  enableTemplateSystem: true,
  templates: [], // 将在运行时填充DEFAULT_TEMPLATES
  defaultTemplateId: 'official-qa'
};

/**
 * 默认模板
 */
export const DEFAULT_TEMPLATES: ParseTemplate[] = [
  {
    id: 'official-qa',
    name: '问答题',
    description: '标准的问答题模板，支持二级标题和正反面分离',
    type: 'single-field',
    fields: [
      // 🔥 优先捕获二级标题，兼容通用格式
      { name: 'Front', pattern: '^(?:##\\s*(.+?)(?=\\n|---div---|$)|(.+?)(?=---div---|$))', isRegex: true, flags: 'ms', required: true },
      { name: 'Back', pattern: '(?<=---div---)(.+)$', isRegex: true, flags: 'ms', required: false },
      { name: 'Tags', pattern: '#([\\w\\u4e00-\\u9fa5]+)', isRegex: true, flags: 'g', required: false }
    ],
    scenarios: ['newCard', 'study', 'edit'],
    isDefault: true,
    isOfficial: true
  },
  {
    id: 'official-choice',
    name: '选择题',
    description: '选择题模板，支持中英文，输出结构化字段',
    type: 'single-field',
    fields: [
      // 题干：支持 ## 标题或首段
      { name: 'question', pattern: '^##\\s*(.+?)(?=\\n|$)', isRegex: true, flags: 'm', required: true },
      // 选项：支持 A./A) 格式的多行块
      { name: 'options', pattern: '^(?:[A-E][\\.|\\)]\\s.*(?:\\n|$))+', isRegex: true, flags: 'm', required: true },
      // 正确答案：支持中英文标识
      { name: 'correct_answer', pattern: '^(?:(?:正确答案|答案|Correct Answer|Answer)[:：]\\s*([A-E]))', isRegex: true, flags: 'mi', required: true },
      // 解析（可选）
      { name: 'explanation', pattern: '(?:解析|Explanation)[:：]\\s*(.+?)(?=\\n|$)', isRegex: true, flags: 'mi', required: false },
      // 标签（可选）
      { name: 'tags', pattern: '#([\\w\\u4e00-\\u9fa5/_-]+)', isRegex: true, flags: 'g', required: false }
    ],
    scenarios: ['newCard', 'study', 'edit'],
    isDefault: true,
    isOfficial: true
  },
  {
    id: 'official-cloze',
    name: '填空题',
    description: '挖空题模板，支持 Obsidian 高亮和 Anki 语法',
    type: 'single-field',
    fields: [
      { name: 'Text', pattern: '^(.+?)(?=---div---|$)', isRegex: true, flags: 'ms', required: true },
      { name: 'Cloze', pattern: '==(.+?)==', isRegex: true, flags: 'g', required: true }, // 🔥 主用 Obsidian 高亮
      { name: 'ClozeAnki', pattern: '\\{\\{c\\d+::(.+?)\\}\\}', isRegex: true, flags: 'g', required: false }, // 🔥 兼容 Anki
      { name: 'Extra', pattern: '(?<=---div---)(.+)$', isRegex: true, flags: 'ms', required: false },
      { name: 'Tags', pattern: '#([\\w\\u4e00-\\u9fa5]+)', isRegex: true, flags: 'g', required: false }
    ],
    scenarios: ['newCard', 'study', 'edit'],
    isDefault: true,
    isOfficial: true
  },
  {
    id: 'batch-complete',
    name: '批量完整解析',
    description: '用于批量卡片扫描的完整正则',
    type: 'complete-regex',
    regex: '^(?<front>.+?)(?:---div---(?<back>.+?))?(?<tags>#[\\w\\u4e00-\\u9fa5]+.*)?$',
    flags: 'ms',
    scenarios: ['batch'],
    isDefault: true,
    isOfficial: true
  }
];
