/**
 * 牌组选择器类型定义
 * 
 * 支持层级显示、智能限制和持久化
 */

import type { Deck } from '../data/types';

/**
 * 牌组层级节点
 * 用于树形结构显示
 */
export interface DeckHierarchyNode {
  /** 牌组数据 */
  deck: Deck;
  /** 子节点 */
  children: DeckHierarchyNode[];
  /** 层级深度（0为根） */
  level: number;
  /** 该牌组及子牌组的总卡片数 */
  cardCount: number;
  /** 是否被选中 */
  selected: boolean;
  /** 是否禁用（超限时） */
  disabled: boolean;
  /** 是否展开子节点 */
  expanded: boolean;
}

/**
 * 牌组选择限制
 * 根据卡片总数动态调整
 */
export interface DeckSelectionLimit {
  /** 最大可选牌组数 */
  maxDecks: number;
  /** 当前已选牌组的总卡片数 */
  currentCards: number;
  /** 卡片数阈值（超过此值限制为1个牌组） */
  maxCards: number;
  /** 是否还能选择更多 */
  canSelectMore: boolean;
  /** 限制原因描述 */
  limitReason?: string;
}

/**
 * 牌组选择器配置
 */
export interface DeckSelectorConfig {
  /** 是否显示空牌组 */
  showEmptyDecks: boolean;
  /** 是否显示卡片数量 */
  showCardCount: boolean;
  /** 是否显示层级结构 */
  showHierarchy: boolean;
  /** 最大牌组选择数（默认4） */
  maxDeckSelection: number;
  /** 卡片数阈值（默认3000） */
  cardCountThreshold: number;
  /** 是否启用搜索 */
  enableSearch: boolean;
  /** 是否记住上次选择 */
  rememberSelection: boolean;
}

/**
 * 牌组统计信息
 */
export interface DeckStats {
  /** 牌组ID */
  deckId: string;
  /** 牌组名称 */
  name: string;
  /** 卡片数量 */
  cardCount: number;
  /** 层级路径 */
  path: string;
  /** 层级深度 */
  level: number;
}

/**
 * 默认配置
 */
export const DEFAULT_DECK_SELECTOR_CONFIG: DeckSelectorConfig = {
  showEmptyDecks: true,
  showCardCount: true,
  showHierarchy: true,
  maxDeckSelection: 4,
  cardCountThreshold: 3000,
  enableSearch: true,
  rememberSelection: true
};

