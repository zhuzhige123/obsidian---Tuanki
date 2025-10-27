/**
 * 看板菜单系统类型定义
 * 
 * 定义菜单系统相关的接口和类型
 */

import type { GroupByType, SortConfig } from './kanban-types';
import type { ColumnGroup } from './column-types';
import type { Snippet } from 'svelte';

/**
 * 菜单视图类型
 */
export type MenuView = 'main' | 'groupby' | 'sort' | 'sort-add';

/**
 * 菜单导航状态
 */
export interface MenuNavigationState {
  /** 当前视图 */
  currentView: MenuView;
  /** 编辑中的排序索引 */
  editingSortIndex: number;
  /** 历史栈（用于面包屑导航） */
  history: MenuView[];
}

/**
 * 菜单操作接口
 */
export interface MenuAction {
  /** 操作类型 */
  type: 'navigate' | 'close' | 'back' | 'select' | 'toggle' | 'reset';
  /** 操作数据 */
  payload?: any;
}

/**
 * Notion风格菜单Props
 */
export interface NotionMenuProps {
  /** 是否显示菜单 */
  show: boolean;
  /** 菜单标题 */
  title?: string;
  /** 是否显示返回按钮 */
  showBackButton?: boolean;
  /** 返回按钮回调 */
  onBack?: () => void;
  /** 关闭菜单回调 */
  onClose: () => void;
  /** 菜单内容插槽 */
  children: Snippet;
  /** 底部内容插槽 */
  footer?: Snippet;
}

/**
 * 分组菜单Props
 */
export interface GroupByMenuProps {
  /** 当前分组方式 */
  currentGroupBy: GroupByType;
  /** 分组选择回调 */
  onSelect: (groupBy: GroupByType) => void;
}

/**
 * 排序菜单Props
 */
export interface SortMenuProps {
  /** 当前排序规则 */
  sortRules: SortConfig[];
  /** 添加排序规则回调 */
  onAddRule: (property: SortConfig['property'], direction: 'asc' | 'desc') => void;
  /** 删除排序规则回调 */
  onRemoveRule: (index: number) => void;
  /** 切换排序方向回调 */
  onToggleDirection: (index: number) => void;
  /** 重新排序规则回调 */
  onReorderRules: (fromIndex: number, toIndex: number) => void;
  /** 清除所有排序回调 */
  onClearAll: () => void;
  /** 导航到添加页面回调 */
  onNavigateToAdd: () => void;
}

/**
 * 排序规则项Props
 */
export interface SortRuleItemProps {
  /** 排序规则 */
  rule: SortConfig;
  /** 规则索引 */
  index: number;
  /** 是否正在拖拽 */
  dragging: boolean;
  /** 是否为拖拽目标 */
  dragTarget: boolean;
  /** 切换方向回调 */
  onToggleDirection: () => void;
  /** 删除规则回调 */
  onRemove: () => void;
  /** 拖拽开始回调 */
  onDragStart: () => void;
  /** 拖拽经过回调 */
  onDragOver: (e: DragEvent) => void;
  /** 拖拽放下回调 */
  onDrop: () => void;
  /** 拖拽结束回调 */
  onDragEnd: () => void;
}

/**
 * 列列表视图Props
 */
export interface ColumnListViewProps {
  /** 分组列表 */
  groups: ColumnGroup[];
  /** 隐藏的列集合 */
  hiddenColumns: Set<string>;
  /** 固定的列集合 */
  pinnedColumns: Set<string>;
  /** 自定义颜色映射 */
  customColors: Map<string, string>;
  /** 拖拽状态 */
  dragState: {
    source: string | null;
    target: string | null;
  };
  /** 切换可见性回调 */
  onToggleVisibility: (key: string) => void;
  /** 切换固定状态回调 */
  onTogglePin: (key: string) => void;
  /** 列拖拽开始回调 */
  onColumnDragStart: (key: string) => void;
  /** 列拖拽经过回调 */
  onColumnDragOver: (e: DragEvent, key: string) => void;
  /** 列拖拽放下回调 */
  onColumnDrop: (key: string) => void;
  /** 列拖拽结束回调 */
  onColumnDragEnd: () => void;
}

/**
 * 菜单配置选项Props
 */
export interface MenuConfigOptionsProps {
  /** 隐藏空白分组 */
  hideEmptyGroups: boolean;
  /** 使用彩色背景 */
  useColoredBackground: boolean;
  /** 切换隐藏空白分组回调 */
  onToggleHideEmpty: () => void;
  /** 切换彩色背景回调 */
  onToggleColoredBackground: () => void;
}

/**
 * 菜单底部操作Props
 */
export interface MenuFooterActionsProps {
  /** 显示所有列回调 */
  onShowAll: () => void;
  /** 隐藏所有列回调 */
  onHideAll: () => void;
  /** 重置配置回调 */
  onReset: () => void;
}

/**
 * 看板菜单系统Props
 */
export interface KanbanMenuSystemProps {
  /** 是否显示菜单 */
  show: boolean;
  /** 当前菜单视图 */
  currentView: MenuView;
  /** 当前分组方式 */
  groupBy: GroupByType;
  /** 列配置 */
  columnConfig: any; // 从 column-types 导入时会更新
  /** 可用分组列表 */
  availableGroups: ColumnGroup[];
  /** 导航回调 */
  onNavigate: (view: MenuView) => void;
  /** 关闭菜单回调 */
  onClose: () => void;
  /** 分组方式变更回调 */
  onGroupByChange: (groupBy: GroupByType) => void;
  /** 列配置变更回调 */
  onColumnConfigChange: (config: any) => void;
}
