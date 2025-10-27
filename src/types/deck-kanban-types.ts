/**
 * 牌组看板视图类型定义
 * 
 * 用于牌组学习界面的看板分组功能
 */

import type { Deck } from '../data/types';

/**
 * 牌组分组类型
 */
export type DeckGroupByType = 
  | 'completion'        // 完成情况（默认）
  | 'timeRange'         // 时间范围
  | 'typeDistribution'  // 题型分布
  | 'priority';         // 优先级

/**
 * 看板列定义
 */
export interface DeckKanbanColumn {
  key: string;          // 列的唯一标识
  label: string;        // 列的显示名称
  color: string;        // 列的主题颜色
  icon: string;         // 列的图标名称
  decks: Deck[];        // 该列包含的牌组
}

/**
 * 牌组聚合结果
 */
export interface DeckAggregationResult {
  groupBy: DeckGroupByType;
  columns: DeckKanbanColumn[];
  totalDecks: number;
}

/**
 * 分组配置
 */
export interface GroupConfig {
  title: string;        // 分组方式的名称
  icon: string;         // 分组方式的图标
  groups: GroupDefinition[];
}

/**
 * 分组定义
 */
export interface GroupDefinition {
  key: string;          // 分组key
  label: string;        // 分组显示名称
  color: string;        // 分组颜色
  icon: string;         // 分组图标
}

/**
 * 分组配置常量
 */
export const DECK_GROUP_CONFIGS: Record<DeckGroupByType, GroupConfig> = {
  completion: {
    title: '完成情况',
    icon: 'check-circle',
    groups: [
      { key: 'new', label: '新卡片', color: '#10b981', icon: 'circle' },
      { key: 'learning', label: '学习中', color: '#f59e0b', icon: 'book-open' },
      { key: 'review', label: '待复习', color: '#3b82f6', icon: 'refresh-cw' },
      { key: 'completed', label: '已完成', color: '#6b7280', icon: 'check-circle' }
    ]
  },
  timeRange: {
    title: '时间范围',
    icon: 'clock',
    groups: [
      { key: 'urgent', label: '紧急', color: '#ef4444', icon: 'alert-circle' },
      { key: 'today', label: '今日', color: '#f59e0b', icon: 'sun' },
      { key: 'thisWeek', label: '本周', color: '#3b82f6', icon: 'calendar' },
      { key: 'future', label: '未来', color: '#6b7280', icon: 'clock' }
    ]
  },
  typeDistribution: {
    title: '题型分布',
    icon: 'grid',
    groups: [
      { key: 'basic', label: '基础问答为主', color: '#3b82f6', icon: 'file-text' },
      { key: 'cloze', label: '挖空题为主', color: '#ec4899', icon: 'edit' },
      { key: 'multiple', label: '选择题为主', color: '#06b6d4', icon: 'check-circle' },
      { key: 'video', label: '视频课程', color: '#8b5cf6', icon: 'film' },
      { key: 'mixed', label: '混合题型', color: '#6b7280', icon: 'grid' }
    ]
  },
  priority: {
    title: '优先级',
    icon: 'flag',
    groups: [
      { key: 'high', label: '高优先级', color: '#ef4444', icon: 'alert-triangle' },
      { key: 'medium', label: '中优先级', color: '#f59e0b', icon: 'flag' },
      { key: 'low', label: '低优先级', color: '#10b981', icon: 'minus-circle' },
      { key: 'none', label: '无优先级', color: '#6b7280', icon: 'circle' }
    ]
  }
};

/**
 * 分组方式标签映射
 */
export const DECK_GROUP_BY_LABELS: Record<DeckGroupByType, string> = {
  completion: '完成情况',
  timeRange: '时间范围',
  typeDistribution: '题型分布',
  priority: '优先级'
};

