/**
 * 看板视图核心类型定义
 * 
 * 定义看板视图的主要接口和类型
 */

import type { Card, Deck } from '../../data/types';
import type AnkiPlugin from '../../main';
import type { AnkiDataStorage } from '../../data/storage';

/**
 * 分组类型
 */
export type GroupByType = 'status' | 'type' | 'priority' | 'deck' | 'createTime';

/**
 * 布局模式
 */
export type LayoutMode = 'compact' | 'comfortable' | 'spacious';

/**
 * 排序配置接口
 */
export interface SortConfig {
  /** 排序属性 */
  property: 'created' | 'due' | 'modified' | 'priority' | 'difficulty' | 'title';
  /** 排序方向 */
  direction: 'asc' | 'desc';
}

/**
 * 列可见性配置接口
 */
export interface ColumnVisibilityConfig {
  /** 隐藏的列key */
  hidden: Set<string>;
  /** 固定的列key */
  pinned: Set<string>;
  /** 自定义颜色映射 */
  colors: Map<string, string>;
  /** 列显示顺序 */
  order: string[];
  /** 隐藏空白分组 */
  hideEmptyGroups: boolean;
  /** 使用彩色背景 */
  useColoredBackground: boolean;
  /** 排序模式（保留向后兼容） */
  sortMode: 'manual' | 'auto';
  /** 多级排序规则 */
  sortRules: SortConfig[];
}

/**
 * 看板视图主组件Props
 */
export interface KanbanViewProps {
  /** 卡片数组 */
  cards: Card[];
  /** 数据存储服务 */
  dataStorage: AnkiDataStorage;
  /** 插件实例 */
  plugin?: AnkiPlugin;
  /** 卡片选择回调 */
  onCardSelect?: (card: Card) => void;
  /** 卡片更新回调 */
  onCardUpdate?: (card: Card) => void;
  /** 卡片删除回调 */
  onCardDelete?: (cardId: string) => void;
  /** 开始学习回调 */
  onStartStudy?: (cards: Card[]) => void;
  /** 分组方式 */
  groupBy?: GroupByType;
  /** 显示统计信息 */
  showStats?: boolean;
  /** 布局模式 */
  layoutMode?: LayoutMode;
  /** 所有牌组列表 */
  decks?: Deck[];
  /** 牌组卡片数量映射 */
  deckCardCounts?: Map<string, number>;
  /** 已选中的牌组ID列表 */
  selectedDeckIds?: string[];
  /** 牌组选择变化回调 */
  onDeckSelectionChange?: (deckIds: string[]) => void;
}

/**
 * 看板视图状态
 */
export interface KanbanViewState {
  /** 选中的卡片ID集合 */
  selectedCards: Set<string>;
  /** 显示列菜单 */
  showColumnMenu: boolean;
  /** 当前菜单视图 */
  menuView: 'main' | 'groupby' | 'sort' | 'sort-add';
  /** 列配置映射 */
  columnConfig: Record<string, ColumnVisibilityConfig>;
  /** 拖拽的卡片 */
  draggedCard: Card | null;
  /** 悬停的卡片ID */
  hoveredCardId: string | null;
  /** 拖拽悬停的列 */
  dragOverColumn: string | null;
  /** 拖拽悬停的索引 */
  dragOverIndex: number;
}

/**
 * 分组方式标签映射
 */
export const GROUP_BY_LABELS: Record<GroupByType, string> = {
  status: '学习状态',
  type: '题型',
  priority: '优先级',
  deck: '牌组',
  createTime: '创建时间'
};

/**
 * 排序选项定义
 */
export const SORT_OPTIONS = {
  created: { key: 'created' as const, label: '创建时间', icon: 'calendar' },
  due: { key: 'due' as const, label: '到期时间', icon: 'clock' },
  modified: { key: 'modified' as const, label: '修改时间', icon: 'history' },
  priority: { key: 'priority' as const, label: '优先级', icon: 'flag' },
  difficulty: { key: 'difficulty' as const, label: '难度', icon: 'chart-bar' },
  title: { key: 'title' as const, label: '标题', icon: 'heading' }
};

