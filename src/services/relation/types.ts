/**
 * 卡片关系系统类型定义
 * 
 * 定义父子卡片关系的所有类型和接口
 * 
 * @module services/relation
 */

import type { Card } from '../../data/types';

// ============================================================================
// 卡片关系元数据
// ============================================================================

/**
 * 派生方法
 */
export enum DerivationMethod {
  /** 手动拆解 */
  MANUAL = 'manual',
  
  /** AI自动拆解 */
  AI_SPLIT = 'ai-split',
  
  /** 渐进式阅读 */
  INCREMENTAL = 'incremental',
  
  /** 从外部导入 */
  IMPORT = 'import',
}

/**
 * 派生元数据
 * 记录卡片如何从父卡片派生
 */
export interface DerivationMetadata {
  /** 派生方法 */
  method: DerivationMethod;
  
  /** 拆解时间（ISO 8601） */
  splitTimestamp: string;
  
  /** 父卡片内容哈希（用于检测父卡片修改） */
  originalContentHash?: string;
  
  /** AI拆解的置信度（0-1，仅AI拆解时有效） */
  confidence?: number;
  
  /** 继承的字段列表 */
  preservedFields?: string[];
  
  /** 拆解原因描述 */
  splitReason?: string;
}

/**
 * 学习策略配置
 * 定义父子卡片的学习关系
 */
export interface LearningStrategy {
  /** 是否要求先掌握父卡片 */
  requireParentMastery: boolean;
  
  /** 父卡片掌握阈值（FSRS stability值，通常0.7-0.9） */
  parentMasteryThreshold?: number;
  
  /** 是否一起复习（父子卡片连续出现） */
  reviewTogether: boolean;
  
  /** 是否继承父卡片标签 */
  inheritTags: boolean;
}

/**
 * 关系状态
 * 记录父子关系的同步状态
 */
export interface RelationStatus {
  /** 父子内容是否同步 */
  isSynced: boolean;
  
  /** 最后同步检查时间（ISO 8601） */
  lastSyncCheck?: string;
  
  /** 是否有冲突 */
  hasConflict?: boolean;
  
  /** 冲突原因描述 */
  conflictReason?: string;
}

/**
 * 卡片关系元数据
 * 完整的父子关系信息
 */
export interface CardRelationMetadata {
  /** 是否为父卡片 */
  isParent: boolean;
  
  /** 子卡片UUID列表（仅父卡片维护） */
  childCardIds?: string[];
  
  /** 层级深度（0=顶级父卡片，1=一级子卡片，2=二级子卡片...） */
  level: number;
  
  /** 在兄弟卡片中的顺序（0-based） */
  siblingIndex?: number;
  
  /** 派生信息（子卡片记录从哪个父卡片派生） */
  derivationMetadata?: DerivationMetadata;
  
  /** 学习策略 */
  learningStrategy?: LearningStrategy;
  
  /** 关系状态 */
  relationStatus?: RelationStatus;
}

// ============================================================================
// 卡片家族结构
// ============================================================================

/**
 * 卡片家族树
 * 包含完整的家族关系视图
 */
export interface CardFamily {
  /** 父卡片（如果当前卡片是子卡片） */
  parent: Card | null;
  
  /** 子卡片列表（如果当前卡片是父卡片） */
  children: Card[];
  
  /** 兄弟卡片列表（可选） */
  siblings?: Card[];
  
  /** 祖先卡片列表（支持多层级，可选） */
  ancestors?: Card[];
  
  /** 总后代数量（包括所有层级） */
  totalDescendants: number;
}

// ============================================================================
// 关系创建与管理
// ============================================================================

/**
 * 关系创建选项
 */
export interface CardRelationOptions {
  /** 派生方法 */
  method: DerivationMethod;
  
  /** 是否复制源文档信息 */
  copySourceInfo: boolean;
  
  /** 是否复制标签 */
  copyTags: boolean;
  
  /** 是否继承牌组 */
  inheritDeck: boolean;
  
  /** 是否要求父卡片掌握 */
  requireParentMastery: boolean;
  
  /** 父卡片掌握阈值 */
  parentMasteryThreshold?: number;
  
  /** 是否一起复习 */
  reviewTogether: boolean;
  
  /** 拆解原因（可选） */
  splitReason?: string;
}

/**
 * 批量创建子卡片的数据
 */
export interface ChildCardData {
  /** 卡片内容 */
  content: string;
  
  /** 字段数据 */
  fields?: Record<string, string>;
  
  /** 标签（可选，默认继承父卡片） */
  tags?: string[];
  
  /** 优先级（可选） */
  priority?: number;
}

// ============================================================================
// 关系查询
// ============================================================================

/**
 * 关系查询选项
 */
export interface RelationQueryOptions {
  /** 是否包含软删除的卡片 */
  includeDeleted?: boolean;
  
  /** 最大层级深度（0=不限制） */
  maxDepth?: number;
  
  /** 是否使用缓存 */
  useCache?: boolean;
  
  /** 是否验证关系一致性 */
  validateConsistency?: boolean;
}

/**
 * 关系过滤条件
 */
export interface RelationFilter {
  /** 仅父卡片 */
  parentsOnly?: boolean;
  
  /** 仅子卡片 */
  childrenOnly?: boolean;
  
  /** 仅孤立卡片（无关系） */
  orphansOnly?: boolean;
  
  /** 指定层级 */
  level?: number;
  
  /** 指定派生方法 */
  derivationMethod?: DerivationMethod;
}

// ============================================================================
// 关系验证
// ============================================================================

/**
 * 验证结果
 */
export interface RelationValidationResult {
  /** 是否有效 */
  valid: boolean;
  
  /** 错误列表 */
  errors: RelationValidationError[];
  
  /** 警告列表 */
  warnings: string[];
}

/**
 * 验证错误
 */
export interface RelationValidationError {
  /** 错误类型 */
  type: 'circular_reference' | 'invalid_parent' | 'max_depth_exceeded' | 'inconsistent_reference';
  
  /** 错误消息 */
  message: string;
  
  /** 相关卡片ID */
  cardId: string;
  
  /** 建议的修复方案 */
  suggestedFix?: string;
}

// ============================================================================
// 关系统计
// ============================================================================

/**
 * 关系统计信息
 */
export interface RelationStatistics {
  /** 总卡片数 */
  totalCards: number;
  
  /** 父卡片数量 */
  parentCards: number;
  
  /** 子卡片数量 */
  childCards: number;
  
  /** 孤立卡片数量（无关系） */
  orphanCards: number;
  
  /** 平均家族大小 */
  averageFamilySize: number;
  
  /** 最大层级深度 */
  maxDepth: number;
  
  /** 最大子卡片数（单个父卡片） */
  maxChildren: number;
  
  /** 按派生方法分组统计 */
  byDerivationMethod: Record<DerivationMethod, number>;
}

/**
 * 家族指标
 */
export interface FamilyMetrics {
  /** 家族ID（父卡片UUID） */
  familyId: string;
  
  /** 总成员数 */
  totalMembers: number;
  
  /** 层级深度 */
  depth: number;
  
  /** 平均掌握度（FSRS stability） */
  averageMastery: number;
  
  /** 学习完成度（已复习/总数） */
  completionRate: number;
}

// ============================================================================
// 拆解相关
// ============================================================================

/**
 * 拆解选项
 */
export interface SplitOptions {
  /** 目标子卡片数量（0=自动决定） */
  targetCount: number;
  
  /** 最小卡片内容长度 */
  minContentLength: number;
  
  /** 最大卡片内容长度 */
  maxContentLength: number;
  
  /** 是否保留原卡片（作为父卡片） */
  keepOriginal: boolean;
  
  /** 拆解方法 */
  method: DerivationMethod;
  
  /** AI拆解的Prompt（如果使用AI） */
  aiPrompt?: string;
}

/**
 * 拆解分析结果
 */
export interface SplitAnalysis {
  /** 是否适合拆解 */
  suitable: boolean;
  
  /** 建议的子卡片数量 */
  suggestedCount: number;
  
  /** 理由 */
  reason: string;
  
  /** 置信度（0-1） */
  confidence: number;
  
  /** 识别的知识点列表 */
  identifiedPoints?: string[];
}

/**
 * 拆解预览
 */
export interface CardPreview {
  /** 预览内容 */
  content: string;
  
  /** 字段预览 */
  fields: Record<string, string>;
  
  /** 置信度（AI拆解时） */
  confidence?: number;
  
  /** 索引（在拆解结果中的顺序） */
  index: number;
}

/**
 * 拆解结果
 */
export interface SplitResult {
  /** 是否成功 */
  success: boolean;
  
  /** 生成的子卡片数据 */
  childCards: ChildCardData[];
  
  /** 错误消息（如果失败） */
  error?: string;
  
  /** 耗时（毫秒） */
  duration: number;
}

// ============================================================================
// 级联操作
// ============================================================================

/**
 * 级联删除选项
 */
export interface CascadeDeleteOptions {
  /** 是否删除子卡片 */
  deleteChildren: boolean;
  
  /** 是否递归删除（所有后代） */
  recursive: boolean;
  
  /** 是否需要确认 */
  requireConfirmation: boolean;
  
  /** 确认回调 */
  onConfirm?: (affectedCards: Card[]) => Promise<boolean>;
}

/**
 * 级联更新选项
 */
export interface CascadeUpdateOptions {
  /** 是否更新子卡片的标签 */
  updateTags: boolean;
  
  /** 是否更新子卡片的牌组 */
  updateDeck: boolean;
  
  /** 是否更新子卡片的优先级 */
  updatePriority: boolean;
  
  /** 是否递归更新 */
  recursive: boolean;
}

// ============================================================================
// 事件类型
// ============================================================================

/**
 * 关系事件类型
 */
export enum RelationEventType {
  CREATED = 'relation-created',
  DELETED = 'relation-deleted',
  SYNCED = 'relation-synced',
  CONFLICT_DETECTED = 'relation-conflict',
  PARENT_MODIFIED = 'parent-modified',
}

/**
 * 关系事件
 */
export interface RelationEvent {
  /** 事件类型 */
  type: RelationEventType;
  
  /** 时间戳 */
  timestamp: string;
  
  /** 相关卡片ID */
  cardId: string;
  
  /** 父卡片ID（如果适用） */
  parentId?: string;
  
  /** 事件数据 */
  data?: Record<string, unknown>;
}

// ============================================================================
// 导出所有类型
// ============================================================================

export type {
  CardRelationMetadata,
  DerivationMetadata,
  LearningStrategy,
  RelationStatus,
  CardFamily,
  CardRelationOptions,
  ChildCardData,
  RelationQueryOptions,
  RelationFilter,
  RelationValidationResult,
  RelationValidationError,
  RelationStatistics,
  FamilyMetrics,
  SplitOptions,
  SplitAnalysis,
  CardPreview,
  SplitResult,
  CascadeDeleteOptions,
  CascadeUpdateOptions,
  RelationEvent,
};

// DerivationMethod 和 RelationEventType 已经通过 export enum 导出，无需重复导出


