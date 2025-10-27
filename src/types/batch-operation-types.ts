/**
 * 批量操作类型定义
 */

import type { Card } from '../data/types';

/**
 * 批量操作结果
 */
export interface BatchOperationResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{
    cardId: string;
    cardTitle: string;
    error: string;
  }>;
  duration: number; // 操作耗时（毫秒）
}

/**
 * 模板更换配置
 */
export interface TemplateChangeConfig {
  targetTemplateId: string;
  fieldMappings: Array<{
    sourceField: string;
    targetField: string;
  }>;
  unmappedFieldHandling: {
    mode: 'delete' | 'merge';
    mergeTargetField?: string; // mode='merge' 时必填
  };
}

/**
 * 模板一致性检查结果
 */
export interface TemplateConsistencyCheck {
  isConsistent: boolean;
  sourceTemplateId: string | null;
  sourceTemplateName: string | null;
  templateGroups: Array<{
    templateId: string;
    templateName: string;
    cardCount: number;
  }>;
}

/**
 * 批量更新进度回调
 */
export type BatchProgressCallback = (current: number, total: number) => void;

/**
 * 批量更新函数类型
 */
export type BatchUpdateFunction = (card: Card) => Card;


