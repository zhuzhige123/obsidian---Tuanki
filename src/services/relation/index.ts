/**
 * 卡片关系系统
 * 
 * 统一导出所有关系相关的类型和服务
 * 
 * @module services/relation
 */

// ============================================================================
// 核心服务
// ============================================================================

export { CardRelationService, getRelationService } from './CardRelationService';

// ============================================================================
// 类型定义
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
} from './types';

export {
  DerivationMethod,
  RelationEventType,
} from './types';


