/**
 * 看板卡片操作类型定义
 * 
 * 定义卡片操作相关的接口和类型
 */

import type { Card } from '../../data/types';
import type { GroupByType } from './kanban-types';

/**
 * 卡片操作处理器集合
 */
export interface CardOperationHandlers {
  /** 卡片选择回调 */
  onCardSelect?: (card: Card) => void;
  /** 卡片更新回调 */
  onCardUpdate?: (card: Card) => void;
  /** 卡片删除回调 */
  onCardDelete?: (cardId: string) => void;
  /** 开始学习回调 */
  onStartStudy?: (cards: Card[]) => void;
}

/**
 * 拖拽处理器集合
 */
export interface DragDropHandlers {
  /** 拖拽开始回调 */
  onDragStart?: (card: Card) => void;
  /** 拖拽结束回调 */
  onDragEnd?: () => void;
  /** 拖拽经过回调 */
  onDragOver?: (groupKey: string, index?: number) => void;
  /** 拖拽离开回调 */
  onDragLeave?: () => void;
  /** 拖拽放下回调 */
  onDrop?: (targetGroupKey: string) => void;
}

/**
 * 选择处理器集合
 */
export interface SelectionHandlers {
  /** 切换卡片选择 */
  onToggleCardSelection?: (card: Card) => void;
  /** 选择分组 */
  onSelectGroup?: (groupKey: string) => void;
  /** 清除选择 */
  onClearSelection?: () => void;
  /** 开始学习选中卡片 */
  onStartStudySelected?: () => void;
}

/**
 * 卡片悬停处理器
 */
export interface CardHoverHandlers {
  /** 卡片悬停 */
  onCardHover?: (cardId: string) => void;
  /** 卡片离开 */
  onCardLeave?: () => void;
}

/**
 * 卡片拖拽检查结果
 */
export interface DragCheckResult {
  /** 是否允许拖拽 */
  allowed: boolean;
  /** 不允许的原因 */
  reason?: string;
}

/**
 * 卡片操作结果
 */
export interface CardOperationResult {
  /** 操作是否成功 */
  success: boolean;
  /** 更新后的卡片（如果成功） */
  card?: Card;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 批量卡片操作结果
 */
export interface BatchOperationResult {
  /** 操作是否成功 */
  success: boolean;
  /** 成功处理的卡片数量 */
  successCount: number;
  /** 失败的卡片数量 */
  failureCount: number;
  /** 错误信息列表 */
  errors: string[];
}

/**
 * 拖拽状态
 */
export interface DragState {
  /** 拖拽中的卡片 */
  draggedCard: Card | null;
  /** 拖拽悬停的列 */
  dragOverColumn: string | null;
  /** 拖拽悬停的索引 */
  dragOverIndex: number;
  /** 是否正在拖拽 */
  isDragging: boolean;
}

/**
 * 卡片分组更新参数
 */
export interface CardGroupUpdateParams {
  /** 卡片对象 */
  card: Card;
  /** 目标分组键 */
  targetGroupKey: string;
  /** 分组类型 */
  groupBy: GroupByType;
}

/**
 * 卡片复制参数
 */
export interface CardDuplicateParams {
  /** 源卡片 */
  sourceCard: Card;
  /** 是否保留原始时间戳 */
  preserveTimestamps?: boolean;
  /** 自定义ID前缀 */
  idPrefix?: string;
}

/**
 * 时间分组键值类型
 */
export type TimeGroupKey = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'earlier';

/**
 * 分组统计信息
 */
export interface GroupStats {
  /** 总卡片数 */
  total: number;
  /** 已选择数 */
  selected: number;
  /** 到期数 */
  due: number;
}

/**
 * 卡片快捷操作类型
 */
export type CardQuickAction = 'edit' | 'duplicate' | 'delete' | 'study';

/**
 * 卡片快捷操作处理器
 */
export interface CardQuickActionHandlers {
  /** 编辑卡片 */
  onEdit?: (card: Card) => void;
  /** 复制卡片 */
  onDuplicate?: (card: Card) => void;
  /** 删除卡片 */
  onDelete?: (card: Card) => void;
  /** 学习卡片 */
  onStudy?: (card: Card) => void;
}

/**
 * 卡片显示状态
 */
export interface CardDisplayState {
  /** 是否选中 */
  selected: boolean;
  /** 是否拖拽中 */
  dragging: boolean;
  /** 是否悬停 */
  hovered: boolean;
  /** 是否在拖拽目标位置 */
  dragTarget: boolean;
}
