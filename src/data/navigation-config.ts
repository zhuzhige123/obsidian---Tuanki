import { ICON_NAMES, type IconName } from "../icons/index.js";

/**
 * 导航项接口定义
 */
export interface NavigationItem {
  id: string;
  label: string;
  icon: IconName;
  shortLabel?: string; // 用于移动端的简短标签
  badge?: number | string;
  description?: string; // 详细描述
  disabled?: boolean;
  hidden?: boolean; // 在某些视图中隐藏
}

/**
 * 主导航项配置
 * 这些是应用的主要功能模块
 */
export const MAIN_NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: "deck-study",
    label: "牌组学习",
    icon: ICON_NAMES.DECK_STUDY,
    description: "浏览和学习您的Anki牌组",
    hidden: false,
  },
  {
    id: "tuanki-card-management",
    label: "卡片管理",
    icon: ICON_NAMES.CARD_MANAGEMENT,
    description: "管理和编辑您的所有卡片",
    hidden: false,
  },
  {
    id: "ai-assistant",
    label: "AI助手",
    icon: ICON_NAMES.AI_ASSISTANT,
    description: "使用AI辅助创建和优化卡片",
    hidden: false,
  },
  {
    id: "statistics",
    label: "统计分析",
    icon: ICON_NAMES.STATISTICS,
    description: "查看您的学习进度和记忆曲线",
    hidden: false,
  },
];

/**
 * 操作按钮配置
 * 这些是导航栏右侧的操作按钮
 */
export interface ActionItem {
  id: string;
  label: string;
  icon: IconName;
  handler?: string; // 处理函数名称，由组件实现
  badge?: number | string;
  tooltip?: string;
  shortcut?: string; // 键盘快捷键
  disabled?: boolean;
  hidden?: boolean;
}

export const NAVIGATION_ACTION_ITEMS: ActionItem[] = [
  {
    id: "search",
    label: "搜索",
    icon: ICON_NAMES.SEARCH,
    handler: "handleSearch",
    tooltip: "搜索卡片和牌组",
    shortcut: "Ctrl+K"
  },
  {
    id: "notifications",
    label: "通知",
    icon: ICON_NAMES.BELL,
    handler: "handleNotifications",
    badge: 3,
    tooltip: "查看通知和提醒"
  },
  {
    id: "settings",
    label: "设置",
    icon: ICON_NAMES.SETTINGS,
    handler: "handleSettings",
    tooltip: "打开设置面板",
    shortcut: "Ctrl+,"
  }
] as const;

/**
 * 导航配置类型
 */
export type NavigationItemId = typeof MAIN_NAVIGATION_ITEMS[number]['id'];
export type ActionItemId = typeof NAVIGATION_ACTION_ITEMS[number]['id'];

/**
 * 工具函数：根据 ID 获取导航项
 */
export function getNavigationItem(id: string): NavigationItem | undefined {
  return MAIN_NAVIGATION_ITEMS.find(item => item.id === id);
}

/**
 * 工具函数：根据 ID 获取操作项
 */
export function getActionItem(id: string): ActionItem | undefined {
  return NAVIGATION_ACTION_ITEMS.find(item => item.id === id);
}

/**
 * 工具函数：获取可见的导航项
 */
export function getVisibleNavigationItems(navigationVisibility?: Record<string, boolean>): NavigationItem[] {
  return MAIN_NAVIGATION_ITEMS.filter(item => {
    // 首先检查基本的 hidden 和 disabled 状态
    if (item.hidden || item.disabled) {
      return false;
    }

    // 如果没有提供 navigationVisibility 配置，默认显示所有项
    if (!navigationVisibility) {
      return true;
    }

    // 根据 ID 映射检查可见性
    const visibilityKey = getNavigationVisibilityKey(item.id);
    if (visibilityKey && navigationVisibility.hasOwnProperty(visibilityKey)) {
      return navigationVisibility[visibilityKey] !== false;
    }

    // 默认显示
    return true;
  });
}

/**
 * 工具函数：将导航项 ID 映射到设置中的可见性键
 */
function getNavigationVisibilityKey(itemId: string): string | null {
  const mapping: Record<string, string> = {
    'deck-study': 'deckStudy',
    'tuanki-card-management': 'cardManagement',
    'ai-assistant': 'aiAssistant',
    'statistics': 'statistics',
  };

  return mapping[itemId] || null;
}

/**
 * 工具函数：获取可见的操作项
 */
export function getVisibleActionItems(): ActionItem[] {
  return NAVIGATION_ACTION_ITEMS.filter(item => !item.hidden && !item.disabled);
}

/**
 * 导航主题配置
 */
export interface NavigationTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  borderRadius: string;
  spacing: string;
}

export const DEFAULT_NAVIGATION_THEME: NavigationTheme = {
  primaryColor: "var(--color-accent)",
  secondaryColor: "var(--background-secondary)",
  accentColor: "var(--color-accent-2, #6366f1)",
  borderRadius: "var(--radius-m, 0.5rem)",
  spacing: "0.5rem"
};

/**
 * 导航行为配置
 */
export interface NavigationBehavior {
  autoHideOnScroll: boolean;
  showTooltipDelay: number;
  hideTooltipDelay: number;
  animationDuration: number;
  mobileBreakpoint: number;
}

export const DEFAULT_NAVIGATION_BEHAVIOR: NavigationBehavior = {
  autoHideOnScroll: false,
  showTooltipDelay: 500,
  hideTooltipDelay: 200,
  animationDuration: 200,
  mobileBreakpoint: 768
};
