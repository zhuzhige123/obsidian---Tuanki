/**
 * APKG 导入领域模型 - 统一类型定义
 * 
 * 本文件包含APKG导入功能的所有核心类型定义
 * 遵循领域驱动设计(DDD)原则
 * 
 * @module domain/apkg/types
 */

// ==================== APKG 文件相关 ====================

/**
 * APKG 文件信息
 */
export interface APKGFileInfo {
  /** 文件名 */
  name: string;
  /** 文件大小(字节) */
  size: number;
  /** APKG 格式信息 */
  format: APKGFormat;
}

/**
 * APKG 格式定义
 */
export interface APKGFormat {
  /** 版本类型 */
  version: 'anki2' | 'anki21' | 'anki21b';
  /** 数据库文件名 */
  dbFileName: string;
  /** 是否支持 */
  supported: boolean;
  /** 格式描述 */
  description: string;
  /** 媒体格式 */
  mediaFormat?: 'json' | 'protobuf';
  /** 压缩方式 */
  compression?: 'deflate' | 'zstd';
}

// ==================== APKG 数据结构 ====================

/**
 * APKG 解析后的完整数据
 */
export interface APKGData {
  /** 卡片模型列表 */
  models: AnkiModel[];
  /** 牌组列表 */
  decks: AnkiDeck[];
  /** 笔记列表 */
  notes: AnkiNote[];
  /** 媒体文件映射 (文件名 → 二进制数据) */
  media: Map<string, Uint8Array>;
  /** 元信息 */
  metadata: APKGMetadata;
}

/**
 * APKG 元信息
 */
export interface APKGMetadata {
  /** 创建时间 */
  created: number;
  /** 修改时间 */
  modified: number;
  /** Anki 版本 */
  ankiVersion?: string;
  /** 总卡片数 */
  totalCards: number;
  /** 总笔记数 */
  totalNotes: number;
}

/**
 * Anki 卡片模型
 */
export interface AnkiModel {
  /** 模型ID */
  id: number;
  /** 模型名称 */
  name: string;
  /** 模型类型 (0=标准, 1=挖空) */
  type: number;
  /** 字段定义列表 */
  flds: AnkiField[];
  /** 模板列表 */
  tmpls: AnkiTemplate[];
  /** CSS 样式 */
  css: string;
  /** 排序字段索引 */
  sortf?: number;
  /** 是否使用LaTeX */
  latexPre?: string;
  latexPost?: string;
}

/**
 * Anki 字段定义
 */
export interface AnkiField {
  /** 字段名称 */
  name: string;
  /** 排序序号 */
  ord: number;
  /** 是否粘性 */
  sticky: boolean;
  /** 是否从右到左 */
  rtl: boolean;
  /** 字体 */
  font: string;
  /** 字号 */
  size: number;
  /** 描述 */
  description?: string;
  /** 显示面 (解析后添加) */
  side?: 'front' | 'back' | 'both';
}

/**
 * Anki 模板定义
 */
export interface AnkiTemplate {
  /** 模板名称 */
  name: string;
  /** 排序序号 */
  ord: number;
  /** 问题格式 (正面HTML模板) */
  qfmt: string;
  /** 答案格式 (背面HTML模板) */
  afmt: string;
  /** 浏览器问题格式 */
  bqfmt?: string;
  /** 浏览器答案格式 */
  bafmt?: string;
  /** 是否在卡片浏览器中显示答案 */
  did?: number;
}

/**
 * Anki 牌组
 */
export interface AnkiDeck {
  /** 牌组ID */
  id: number;
  /** 牌组名称 */
  name: string;
  /** 牌组描述 */
  desc: string;
  /** 配置ID */
  conf?: number;
  /** 是否动态牌组 */
  dyn?: number;
}

/**
 * Anki 笔记
 */
export interface AnkiNote {
  /** 笔记ID */
  id: number;
  /** 模型ID */
  mid: number;
  /** 字段值 (用 \x1f 分隔) */
  flds: string;
  /** 标签 (空格分隔) */
  tags: string;
  /** 创建时间 */
  mod?: number;
  /** GUID */
  guid?: string;
  /** 排序字段值 */
  sfld?: string;
}

// ==================== 字段解析相关 ====================

/**
 * 字段显示面映射
 * 第一层key: 模型ID
 * 第二层key: 字段名称
 * value: 显示面
 */
export interface FieldSideMap {
  [modelId: number]: {
    [fieldName: string]: 'front' | 'back' | 'both';
  };
}

/**
 * 字段解析结果
 */
export interface FieldParseResult {
  /** 字段名称 */
  fieldName: string;
  /** 显示面 */
  side: 'front' | 'back' | 'both';
  /** 是否出现在正面 */
  appearsInFront: boolean;
  /** 是否出现在背面 */
  appearsInBack: boolean;
  /** 解析置信度 */
  confidence: 'high' | 'medium' | 'low';
}

// ==================== 内容转换相关 ====================

/**
 * 内容转换配置
 */
export interface ConversionConfig {
  /** 保留复杂表格HTML */
  preserveComplexTables: boolean;
  /** 转换简单表格为Markdown */
  convertSimpleTables: boolean;
  /** 媒体格式 */
  mediaFormat: 'wikilink' | 'markdown';
  /** 挖空格式 */
  clozeFormat: '==' | '{{c::}}';
  /** 是否保留CSS样式 */
  preserveStyles: boolean;
  /** 表格复杂度阈值 */
  tableComplexityThreshold: {
    maxColumns: number;
    maxRows: number;
    allowMergedCells: boolean;
  };
}

/**
 * 默认转换配置
 */
export const DEFAULT_CONVERSION_CONFIG: ConversionConfig = {
  preserveComplexTables: true,
  convertSimpleTables: true,
  mediaFormat: 'wikilink',
  clozeFormat: '==',
  preserveStyles: false,
  tableComplexityThreshold: {
    maxColumns: 3,
    maxRows: 5,
    allowMergedCells: false
  }
};

/**
 * 内容转换结果
 */
export interface ConversionResult {
  /** 转换后的Markdown */
  markdown: string;
  /** 媒体引用列表 */
  mediaRefs: MediaReference[];
  /** 保留的HTML片段 */
  preservedHTML: string[];
  /** 警告信息 */
  warnings: string[];
  /** 转换统计 */
  stats: ConversionStats;
}

/**
 * 转换统计
 */
export interface ConversionStats {
  /** 原始HTML长度 */
  originalLength: number;
  /** 转换后Markdown长度 */
  markdownLength: number;
  /** 转换的标签数 */
  convertedTags: number;
  /** 保留的HTML标签数 */
  preservedTags: number;
  /** 媒体引用数 */
  mediaCount: number;
}

/**
 * 媒体引用
 */
export interface MediaReference {
  /** 引用ID */
  id: string;
  /** 媒体类型 */
  type: 'image' | 'audio' | 'video';
  /** 原始文件名/路径 */
  originalSrc: string;
  /** 占位符 */
  placeholder: string;
  /** 替代文本 */
  altText?: string;
  /** 宽度 */
  width?: string;
  /** 高度 */
  height?: string;
  /** 其他属性 */
  attributes?: Record<string, string>;
}

// ==================== 媒体处理相关 ====================

/**
 * 媒体处理结果
 */
export interface MediaProcessingResult {
  /** 是否成功 */
  success: boolean;
  /** 保存的文件映射 (原始名称 → Obsidian路径) */
  savedFiles: Map<string, string>;
  /** 媒体清单 */
  manifest: MediaManifest;
  /** 错误列表 */
  errors: MediaError[];
  /** 处理统计 */
  stats: MediaProcessingStats;
}

/**
 * 媒体处理统计
 */
export interface MediaProcessingStats {
  /** 总文件数 */
  totalFiles: number;
  /** 成功保存数 */
  savedFiles: number;
  /** 跳过数(去重) */
  skippedFiles: number;
  /** 失败数 */
  failedFiles: number;
  /** 总大小(字节) */
  totalSize: number;
}

/**
 * 媒体清单
 */
export interface MediaManifest {
  /** 牌组名称 */
  deckName: string;
  /** 基础路径 */
  basePath: string;
  /** 文件列表 */
  files: MediaFileEntry[];
  /** 创建时间 */
  created: string;
  /** 版本 */
  version: number;
}

/**
 * 媒体文件条目
 */
export interface MediaFileEntry {
  /** 文件ID */
  id: string;
  /** 原始文件名 */
  originalName: string;
  /** 保存路径 */
  savedPath: string;
  /** 文件类型 */
  type: 'image' | 'audio' | 'video';
  /** 文件大小 */
  size: number;
  /** SHA256哈希 */
  hash: string;
  /** 使用该文件的卡片ID列表 */
  usedByCards: string[];
  /** 创建时间 */
  created: string;
}

/**
 * 媒体错误
 */
export interface MediaError {
  /** 文件名 */
  file: string;
  /** 错误信息 */
  error: string;
  /** 严重级别 */
  severity: 'warning' | 'error';
  /** 错误代码 */
  code?: string;
}

// ==================== 卡片构建相关 ====================

/**
 * 卡片构建参数
 */
export interface CardBuildParams {
  /** Anki笔记 */
  note: AnkiNote;
  /** Anki模型 */
  model: AnkiModel;
  /** 目标牌组ID */
  deckId: string;
  /** 模板ID */
  templateId?: string;
  /** 字段显示面映射 */
  fieldSideMap: Record<string, 'front' | 'back' | 'both'>;
  /** 媒体路径映射 */
  mediaPathMap: Map<string, string>;
  /** 转换配置 */
  conversionConfig?: ConversionConfig;
}

/**
 * 卡片构建结果
 */
export interface CardBuildResult {
  /** 构建的卡片 */
  card: any;  // 使用插件的Card类型
  /** 警告信息 */
  warnings: string[];
  /** 是否成功 */
  success: boolean;
}

// ==================== 导入流程相关 ====================

/**
 * 导入配置
 */
export interface ImportConfig {
  /** APKG文件 */
  file: File;
  /** 转换配置 */
  conversion: ConversionConfig;
  /** 跳过已存在的卡片 */
  skipExisting: boolean;
  /** 如果牌组不存在则创建 */
  createDeckIfNotExist: boolean;
  /** 目标牌组名称(可选,留空则使用APKG中的名称) */
  targetDeckName?: string;
}

/**
 * 导入阶段
 */
export type ImportStage =
  | 'parsing'        // 解析APKG文件
  | 'analyzing'      // 分析字段配置
  | 'converting'     // 转换内容
  | 'media'          // 处理媒体文件
  | 'building'       // 构建卡片
  | 'saving';        // 保存数据

/**
 * 导入进度
 */
export interface ImportProgress {
  /** 当前阶段 */
  stage: ImportStage;
  /** 进度百分比 (0-100) */
  progress: number;
  /** 主要消息 */
  message: string;
  /** 详细信息(可选) */
  detail?: string;
  /** 当前处理的项目 */
  currentItem?: string;
  /** 总项目数 */
  totalItems?: number;
  /** 已完成项目数 */
  completedItems?: number;
}

/**
 * 导入结果
 */
export interface ImportResult {
  /** 是否成功 */
  success: boolean;
  /** 牌组ID */
  deckId?: string;
  /** 牌组名称 */
  deckName?: string;
  /** 导入统计 */
  stats: ImportStats;
  /** 错误列表 */
  errors: ImportError[];
  /** 警告列表 */
  warnings: string[];
  /** 耗时(毫秒) */
  duration: number;
}

/**
 * 导入统计
 */
export interface ImportStats {
  /** 总卡片数 */
  totalCards: number;
  /** 成功导入数 */
  importedCards: number;
  /** 跳过数 */
  skippedCards: number;
  /** 失败数 */
  failedCards: number;
  /** 媒体文件数 */
  mediaFiles: number;
  /** 媒体文件总大小 */
  mediaTotalSize: number;
}

/**
 * 导入错误
 */
export interface ImportError {
  /** 卡片ID(可选) */
  cardId?: string;
  /** 笔记ID(可选) */
  noteId?: number;
  /** 发生阶段 */
  stage: ImportStage;
  /** 错误消息 */
  message: string;
  /** 错误详情 */
  details?: unknown;
  /** 错误代码 */
  code?: string;
  /** 堆栈追踪 */
  stack?: string;
}

// ==================== 日志相关 ====================

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志条目
 */
export interface LogEntry {
  /** 时间戳 */
  timestamp: number;
  /** 级别 */
  level: LogLevel;
  /** 消息 */
  message: string;
  /** 上下文数据 */
  data?: unknown;
  /** 来源 */
  source?: string;
}

// ==================== 工具类型 ====================

/**
 * 异步操作结果
 */
export type AsyncResult<T, E = Error> = Promise<
  | { success: true; data: T }
  | { success: false; error: E }
>;

/**
 * 可选的成功回调
 */
export type SuccessCallback<T> = (result: T) => void;

/**
 * 可选的错误回调
 */
export type ErrorCallback = (error: Error) => void;

/**
 * 可选的进度回调
 */
export type ProgressCallback = (progress: ImportProgress) => void;



