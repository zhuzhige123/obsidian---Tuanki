/**
 * 牌组层级工具函数
 * 
 * 处理牌组的层级结构构建、扁平化等操作
 */

import type { Deck } from '../data/types';
import type { DeckHierarchyNode, DeckStats } from '../types/deck-selector-types';

/**
 * 构建牌组层级树
 * 
 * @param decks 牌组列表
 * @param deckCardCounts 牌组卡片数量映射
 * @param selectedDeckIds 已选中的牌组ID
 * @param expandedDeckIds 已展开的牌组ID
 * @returns 层级树根节点列表
 */
export function buildDeckHierarchy(
  decks: Deck[],
  deckCardCounts: Map<string, number>,
  selectedDeckIds: Set<string> = new Set(),
  expandedDeckIds: Set<string> = new Set()
): DeckHierarchyNode[] {
  // 构建映射
  const deckMap = new Map<string, Deck>();
  const childrenMap = new Map<string, Deck[]>();

  // 初始化映射
  decks.forEach(deck => {
    deckMap.set(deck.id, deck);
    if (!childrenMap.has(deck.id)) {
      childrenMap.set(deck.id, []);
    }
  });

  // 构建父子关系
  decks.forEach(deck => {
    if (deck.parentId) {
      const siblings = childrenMap.get(deck.parentId) || [];
      siblings.push(deck);
      childrenMap.set(deck.parentId, siblings);
    }
  });

  // 递归构建节点
  function buildNode(deck: Deck, level: number): DeckHierarchyNode {
    const children = (childrenMap.get(deck.id) || [])
      .sort((a, b) => a.order - b.order)
      .map(child => buildNode(child, level + 1));

    const ownCardCount = deckCardCounts.get(deck.id) || 0;
    const totalCardCount = ownCardCount + children.reduce(
      (sum, child) => sum + child.cardCount, 
      0
    );

    return {
      deck,
      children,
      level,
      cardCount: totalCardCount,
      selected: selectedDeckIds.has(deck.id),
      disabled: false, // 将由父组件根据限制规则设置
      expanded: expandedDeckIds.has(deck.id) || level === 0 // 根节点默认展开
    };
  }

  // 找出根节点（没有父节点的牌组）
  const rootDecks = decks
    .filter(deck => !deck.parentId)
    .sort((a, b) => a.order - b.order);

  return rootDecks.map(deck => buildNode(deck, 0));
}

/**
 * 扁平化层级树
 * 
 * @param nodes 层级节点列表
 * @param includeCollapsed 是否包含折叠的子节点
 * @returns 扁平化的节点列表
 */
export function flattenHierarchy(
  nodes: DeckHierarchyNode[],
  includeCollapsed: boolean = false
): DeckHierarchyNode[] {
  const result: DeckHierarchyNode[] = [];

  function traverse(node: DeckHierarchyNode) {
    result.push(node);
    
    // 如果展开或需要包含折叠的节点，则递归子节点
    if (node.expanded || includeCollapsed) {
      node.children.forEach(traverse);
    }
  }

  nodes.forEach(traverse);
  return result;
}

/**
 * 获取牌组的缩进级别
 * 
 * @param path 牌组路径（如 "语言学习::英语::词汇"）
 * @returns 缩进级别（0, 1, 2...）
 */
export function getIndentLevel(path: string): number {
  if (!path) return 0;
  return path.split('::').length - 1;
}

/**
 * 格式化牌组路径为显示名称
 * 
 * @param path 牌组路径
 * @param showFullPath 是否显示完整路径
 * @returns 格式化后的名称
 */
export function formatDeckPath(path: string, showFullPath: boolean = false): string {
  if (!path) return '未命名牌组';
  
  const parts = path.split('::');
  if (showFullPath) {
    return parts.join(' > ');
  }
  
  return parts[parts.length - 1] || '未命名牌组';
}

/**
 * 搜索牌组
 * 
 * @param nodes 层级节点列表
 * @param query 搜索查询
 * @returns 匹配的节点列表
 */
export function searchDecks(
  nodes: DeckHierarchyNode[],
  query: string
): DeckHierarchyNode[] {
  if (!query.trim()) return nodes;

  const lowerQuery = query.toLowerCase();
  const matches: DeckHierarchyNode[] = [];

  function search(node: DeckHierarchyNode) {
    const matchesName = node.deck.name.toLowerCase().includes(lowerQuery);
    const matchesPath = node.deck.path.toLowerCase().includes(lowerQuery);
    
    if (matchesName || matchesPath) {
      matches.push(node);
    }

    node.children.forEach(search);
  }

  nodes.forEach(search);
  return matches;
}

/**
 * 切换节点展开状态
 * 
 * @param nodes 层级节点列表
 * @param deckId 要切换的牌组ID
 * @returns 更新后的节点列表
 */
export function toggleNodeExpanded(
  nodes: DeckHierarchyNode[],
  deckId: string
): DeckHierarchyNode[] {
  function toggle(node: DeckHierarchyNode): DeckHierarchyNode {
    if (node.deck.id === deckId) {
      return { ...node, expanded: !node.expanded };
    }
    
    return {
      ...node,
      children: node.children.map(toggle)
    };
  }

  return nodes.map(toggle);
}

/**
 * 获取所有展开的牌组ID
 * 
 * @param nodes 层级节点列表
 * @returns 展开的牌组ID列表
 */
export function getExpandedDeckIds(nodes: DeckHierarchyNode[]): string[] {
  const expandedIds: string[] = [];

  function traverse(node: DeckHierarchyNode) {
    if (node.expanded && node.children.length > 0) {
      expandedIds.push(node.deck.id);
    }
    node.children.forEach(traverse);
  }

  nodes.forEach(traverse);
  return expandedIds;
}

/**
 * 计算选择限制
 * 
 * @param selectedDeckIds 已选中的牌组ID
 * @param deckCardCounts 牌组卡片数量映射
 * @param maxDeckSelection 最大牌组选择数
 * @param cardCountThreshold 卡片数阈值
 * @returns 选择限制信息
 */
export function calculateSelectionLimit(
  selectedDeckIds: string[],
  deckCardCounts: Map<string, number>,
  maxDeckSelection: number = 4,
  cardCountThreshold: number = 3000
): {
  maxDecks: number;
  currentCards: number;
  maxCards: number;
  canSelectMore: boolean;
  limitReason?: string;
} {
  const currentCards = selectedDeckIds.reduce((sum, id) => {
    return sum + (deckCardCounts.get(id) || 0);
  }, 0);

  // 如果当前卡片数超过阈值，只能选1个
  if (currentCards >= cardCountThreshold) {
    return {
      maxDecks: 1,
      currentCards,
      maxCards: cardCountThreshold,
      canSelectMore: false,
      limitReason: `卡片总数已超过${cardCountThreshold}张，只能选择1个牌组`
    };
  }

  // 如果已选数量达到上限
  if (selectedDeckIds.length >= maxDeckSelection) {
    return {
      maxDecks: maxDeckSelection,
      currentCards,
      maxCards: cardCountThreshold,
      canSelectMore: false,
      limitReason: `最多只能选择${maxDeckSelection}个牌组`
    };
  }

  // 可以继续选择
  return {
    maxDecks: maxDeckSelection,
    currentCards,
    maxCards: cardCountThreshold,
    canSelectMore: true
  };
}

/**
 * 构建牌组统计信息
 * 
 * @param decks 牌组列表
 * @param deckCardCounts 牌组卡片数量映射
 * @returns 统计信息列表
 */
export function buildDeckStats(
  decks: Deck[],
  deckCardCounts: Map<string, number>
): DeckStats[] {
  return decks.map(deck => ({
    deckId: deck.id,
    name: deck.name,
    cardCount: deckCardCounts.get(deck.id) || 0,
    path: deck.path,
    level: deck.level
  }));
}

