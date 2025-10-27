/**
 * Tuanki 标识符系统类型定义
 * 
 * 定义UUID、BlockID等标识符相关的所有类型
 * 
 * @module services/identifier
 */

import type { TFile } from 'obsidian';

// ============================================================================
// 卡片标识符接口
// ============================================================================

/**
 * 卡片完整标识符
 * 包含UUID（系统唯一标识）和BlockID（文档定位）
 */
export interface CardIdentifiers {
  /** 卡片UUID（系统级唯一标识，格式：tk-xm8k3p2a7b9h） */
  uuid: string;
  
  /** Obsidian块ID（文档定位，格式：3ka8m2，仅源文档卡片有） */
  blockId?: string;
  
  /** 源文档路径 */
  sourceFile?: string;
  
  /** 源文档行号（辅助定位） */
  sourceLine?: number;
}

// ============================================================================
// 标识符生成上下文
// ============================================================================

/**
 * 卡片创建模式
 */
export enum CardCreationMode {
  /** 批量解析创建 */
  BATCH_PARSE = 'batch-parse',
  
  /** 标注块创建 */
  ANNOTATION = 'annotation',
  
  /** 手动创建（编辑器） */
  MANUAL = 'manual',
  
  /** AI生成 */
  AI_GENERATED = 'ai-generated',
  
  /** 从Anki导入 */
  IMPORT = 'import',
  
  /** 快速添加 */
  QUICK_ADD = 'quick-add',
}

/**
 * 标识符生成上下文
 * 用于generateCardIdentifiers方法
 */
export interface IdentifierGenerationContext {
  /** 创建模式 */
  creationMode: CardCreationMode;
  
  /** 源文档（如果有） */
  sourceFile?: TFile;
  
  /** 源文档内容（用于插入BlockID） */
  sourceContent?: string;
  
  /** 已存在的UUID（用于导入或迁移） */
  existingUUID?: string;
  
  /** 已存在的BlockID（用于导入或迁移） */
  existingBlockId?: string;
  
  /** 是否强制生成BlockID（即使无源文档） */
  forceBlockId?: boolean;
}

// ============================================================================
// 标识符写入选项
// ============================================================================

/**
 * 写入位置
 */
export enum WritePosition {
  /** 内容开始位置 */
  START = 'start',
  
  /** 内容结束位置 */
  END = 'end',
  
  /** 自定义位置 */
  CUSTOM = 'custom',
}

/**
 * UUID写入格式
 */
export enum UUIDWriteFormat {
  /** HTML注释：<!-- tuanki-uuid: xxx --> */
  HTML_COMMENT = 'html-comment',
  
  /** YAML字段：uuid: xxx */
  YAML_FIELD = 'yaml-field',
  
  /** 行内代码：`xxx` */
  INLINE_CODE = 'inline-code',
}

/**
 * 标识符写入选项
 */
export interface IdentifierWriteOptions {
  /** 是否写入UUID */
  writeUUID: boolean;
  
  /** 是否写入BlockID */
  writeBlockID: boolean;
  
  /** UUID写入格式 */
  uuidFormat: UUIDWriteFormat;
  
  /** 写入位置 */
  position: WritePosition;
  
  /** 自定义行号（position为CUSTOM时使用） */
  customLine?: number;
  
  /** 是否自动保存文档 */
  autoSave: boolean;
}

// ============================================================================
// 标识符验证结果
// ============================================================================

/**
 * UUID验证结果
 */
export interface UUIDValidationResult {
  /** 是否有效 */
  isValid: boolean;
  
  /** 错误消息（如果无效） */
  error?: string;
  
  /** 格式正确性 */
  formatValid: boolean;
  
  /** 字符集正确性 */
  alphabetValid: boolean;
  
  /** 时间戳有效性（如果可提取） */
  timestampValid?: boolean;
  
  /** 提取的时间戳（如果可提取） */
  timestamp?: number;
}

/**
 * BlockID验证结果
 */
export interface BlockIDValidationResult {
  /** 是否有效 */
  isValid: boolean;
  
  /** 错误消息（如果无效） */
  error?: string;
  
  /** 格式正确性 */
  formatValid: boolean;
  
  /** 字符集正确性 */
  alphabetValid: boolean;
}

// ============================================================================
// 标识符查询选项
// ============================================================================

/**
 * 标识符查询选项
 */
export interface IdentifierQueryOptions {
  /** 是否包含已删除的卡片 */
  includeDeleted?: boolean;
  
  /** 是否验证引用有效性 */
  validateReferences?: boolean;
  
  /** 是否使用缓存 */
  useCache?: boolean;
}

// ============================================================================
// 块链接关联选项
// ============================================================================

/**
 * 延迟关联选项
 * 用于将已创建的卡片关联到文档
 */
export interface LinkToDocumentOptions {
  /** 目标文档 */
  targetFile: TFile;
  
  /** 插入位置（行号） */
  insertPosition?: number;
  
  /** 是否覆盖已有BlockID */
  overrideExisting?: boolean;
  
  /** 是否自动保存 */
  autoSave: boolean;
  
  /** 插入格式（标注块、批量解析等） */
  insertFormat?: 'annotation' | 'batch-parse' | 'inline';
}

// ============================================================================
// 标识符冲突处理
// ============================================================================

/**
 * 冲突解决策略
 */
export enum ConflictResolution {
  /** 重新生成 */
  REGENERATE = 'regenerate',
  
  /** 使用现有 */
  USE_EXISTING = 'use-existing',
  
  /** 抛出错误 */
  THROW_ERROR = 'throw-error',
  
  /** 添加后缀 */
  APPEND_SUFFIX = 'append-suffix',
}

/**
 * 冲突检测结果
 */
export interface ConflictDetectionResult {
  /** 是否有冲突 */
  hasConflict: boolean;
  
  /** 冲突类型 */
  conflictType?: 'uuid' | 'blockId' | 'both';
  
  /** 冲突的标识符 */
  conflictingIdentifiers?: {
    uuid?: string;
    blockId?: string;
  };
  
  /** 冲突的卡片ID */
  conflictingCardId?: string;
  
  /** 建议的解决策略 */
  suggestedResolution?: ConflictResolution;
}

// ============================================================================
// 标识符统计信息
// ============================================================================

/**
 * 标识符系统统计
 */
export interface IdentifierStatistics {
  /** UUID总数 */
  totalUUIDs: number;
  
  /** 新格式UUID数量（tk-前缀） */
  newFormatCount: number;
  
  /** 旧格式UUID数量 */
  legacyFormatCount: number;
  
  /** 有BlockID的卡片数量 */
  cardsWithBlockId: number;
  
  /** 无BlockID的卡片数量 */
  cardsWithoutBlockId: number;
  
  /** 孤立卡片（无源文档）数量 */
  orphanCards: number;
  
  /** 冲突数量 */
  conflicts: number;
  
  /** 最后生成时间 */
  lastGeneratedAt?: string;
  
  /** 平均生成时间（毫秒） */
  avgGenerationTime?: number;
}

// ============================================================================
// 迁移相关类型
// ============================================================================

/**
 * UUID格式迁移选项
 */
export interface MigrationOptions {
  /** 是否强制迁移（即使已是新格式） */
  force: boolean;
  
  /** 是否备份旧UUID */
  backup: boolean;
  
  /** 批量大小 */
  batchSize: number;
  
  /** 是否自动保存 */
  autoSave: boolean;
  
  /** 进度回调 */
  onProgress?: (current: number, total: number) => void;
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 是否成功 */
  success: boolean;
  
  /** 迁移的卡片数量 */
  migratedCount: number;
  
  /** 跳过的卡片数量 */
  skippedCount: number;
  
  /** 失败的卡片数量 */
  failedCount: number;
  
  /** 错误列表 */
  errors: Array<{
    cardId: string;
    error: string;
  }>;
  
  /** 耗时（毫秒） */
  duration: number;
}

// ============================================================================
// 服务配置类型
// ============================================================================

/**
 * 标识符服务配置
 */
export interface IdentifierServiceConfig {
  /** 是否启用缓存 */
  enableCache: boolean;
  
  /** 缓存大小 */
  cacheSize: number;
  
  /** 是否自动检测冲突 */
  autoDetectConflicts: boolean;
  
  /** 默认冲突解决策略 */
  defaultConflictResolution: ConflictResolution;
  
  /** 是否自动写入文档 */
  autoWriteToDocument: boolean;
  
  /** 默认UUID写入格式 */
  defaultUUIDFormat: UUIDWriteFormat;
  
  /** 是否验证生成的ID */
  validateGenerated: boolean;
  
  /** 最大重试次数（冲突时） */
  maxRetries: number;
}

// ============================================================================
// 辅助类型
// ============================================================================

/**
 * 只读标识符（不可修改）
 */
export type ReadonlyIdentifiers = Readonly<CardIdentifiers>;

/**
 * 部分标识符（可选字段）
 */
export type PartialIdentifiers = Partial<CardIdentifiers>;

/**
 * 标识符键（用于索引）
 */
export type IdentifierKey = 'uuid' | 'blockId';

/**
 * 标识符映射
 */
export type IdentifierMap = Map<string, CardIdentifiers>;

// ============================================================================
// 导出所有类型
// ============================================================================

export type {
  CardIdentifiers,
  IdentifierGenerationContext,
  IdentifierWriteOptions,
  UUIDValidationResult,
  BlockIDValidationResult,
  IdentifierQueryOptions,
  LinkToDocumentOptions,
  ConflictDetectionResult,
  IdentifierStatistics,
  MigrationOptions,
  MigrationResult,
  IdentifierServiceConfig,
  ReadonlyIdentifiers,
  PartialIdentifiers,
  IdentifierKey,
  IdentifierMap,
};

export {
  CardCreationMode,
  WritePosition,
  UUIDWriteFormat,
  ConflictResolution,
};


