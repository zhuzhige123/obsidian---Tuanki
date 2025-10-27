/**
 * 看板列相关类型定义
 * 
 * 定义列配置、分组、拖拽状态等类型
 */

import type { Card } from '../../data/types';

/**
 * 列分组信息
 */
export interface ColumnGroup {
  /** 分组键 */
  key: string;
  /** 分组标签 */
  label: string;
  /** 分组颜色 */
  color: string;
  /** 分组图标 */
  icon: string;
}

/**
 * 分组配置
 */
export interface GroupConfig {
  /** 分组标题 */
  title: string;
  /** 分组图标 */
  icon: string;
  /** 分组项列表 */
  groups: ColumnGroup[];
}

/**
 * 列统计信息
 */
export interface ColumnStats {
  /** 总卡片数 */
  total: number;
  /** 已选择数 */
  selected: number;
  /** 到期数 */
  due: number;
}

/**
 * 列拖拽状态
 */
export interface ColumnDragState {
  /** 拖拽源列键 */
  dragSource: string | null;
  /** 拖拽目标列键 */
  dragTarget: string | null;
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
 * 时间分组键值类型
 */
export type TimeGroupKey = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'earlier';

/**
 * 列可见卡片状态
 */
export interface ColumnVisibleCards {
  /** 分组键 */
  groupKey: string;
  /** 可见卡片数量 */
  visibleCount: number;
  /** 总卡片数量 */
  totalCount: number;
  /** 是否显示全部 */
  showAll: boolean;
}

