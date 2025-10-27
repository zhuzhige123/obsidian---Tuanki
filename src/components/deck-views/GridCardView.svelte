<script lang="ts">
  import { onMount } from 'svelte';
  import { Menu } from 'obsidian';
  import type { Deck, DeckStats } from '../../data/types';
  import type { DeckTreeNode } from '../../services/deck/DeckHierarchyService';
  import type { StudySession } from '../../data/study-types';
  import type AnkiPlugin from '../../main';
  import DeckGridCard from './DeckGridCard.svelte';
  import CategoryFilter, { type DeckFilter } from './CategoryFilter.svelte';
  import { getColorSchemeForDeck } from '../../config/card-color-schemes';

  interface Props {
    deckTree: DeckTreeNode[];
    deckStats: Record<string, DeckStats>;
    studySessions: StudySession[];
    plugin: AnkiPlugin;
    onStartStudy: (deckId: string) => void;
    onContinueStudy: () => void;
    // 菜单操作回调
    onCreateSubdeck?: (deckId: string) => void;
    onMoveDeck?: (deckId: string) => void;
    onEditDeck?: (deckId: string) => void;
    onDeleteDeck?: (deckId: string) => void;
    onAnalyzeDeck?: (deckId: string) => void;
    onRefreshData?: () => Promise<void>;
  }

  let {
    deckTree,
    deckStats,
    studySessions,
    plugin,
    onStartStudy,
    onContinueStudy,
    onCreateSubdeck,
    onMoveDeck,
    onEditDeck,
    onDeleteDeck,
    onAnalyzeDeck,
    onRefreshData
  }: Props = $props();

  // 牌组类型筛选状态
  let selectedFilter = $state<DeckFilter>('all');

  // 初始化筛选器
  onMount(() => {
    // 恢复上次选择的筛选器
    const savedFilter = localStorage.getItem('tuanki-grid-deck-filter') as DeckFilter;
    if (savedFilter && ['parent', 'child', 'all'].includes(savedFilter)) {
      selectedFilter = savedFilter;
    }
    console.log('[GridCardView] 筛选器初始化:', selectedFilter);
  });

  // 筛选器选择处理
  function handleFilterSelect(filter: DeckFilter) {
    selectedFilter = filter;
    localStorage.setItem('tuanki-grid-deck-filter', filter);
    console.log('[GridCardView] 切换筛选器:', filter);
  }

  // 扁平化牌组树（保持层级结构）
  function flattenDeckTree(nodes: DeckTreeNode[]): Deck[] {
    const result: Deck[] = [];
    for (const node of nodes) {
      result.push(node.deck);
      if (node.children.length > 0) {
        result.push(...flattenDeckTree(node.children));
      }
    }
    return result;
  }

  const allDecks = $derived(flattenDeckTree(deckTree));

  // 判断牌组是否为父卡片牌组
  function isParentCardDeck(deck: Deck): boolean {
    return deck.metadata?.pairedChildDeck != null;
  }

  // 判断牌组是否为子卡片牌组
  function isChildCardDeck(deck: Deck): boolean {
    return deck.metadata?.pairedParentDeck != null;
  }

  // 根据类型筛选牌组
  const filteredDecks = $derived(() => {
    if (selectedFilter === 'all') {
      return allDecks;
    } else if (selectedFilter === 'parent') {
      return allDecks.filter(deck => isParentCardDeck(deck));
    } else if (selectedFilter === 'child') {
      return allDecks.filter(deck => isChildCardDeck(deck));
    }
    return allDecks;
  });

  // 🔧 获取牌组类型标签（根据父子卡片关系）
  function getDeckTypeLabel(deck: Deck): string {
    if (isParentCardDeck(deck)) {
      return '父卡片牌组';
    } else if (isChildCardDeck(deck)) {
      return '子卡片牌组';
    }
    return ''; // 普通牌组不显示标签
  }

  // 显示牌组菜单
  function showDeckMenu(event: MouseEvent, deckId: string) {
    const menu = new Menu();

    const deck = allDecks.find(d => d.id === deckId);
    const isSubdeck = deck?.parentId != null;

    // 创建子牌组
    menu.addItem((item) =>
      item
        .setTitle("创建子牌组")
        .setIcon("folder-plus")
        .onClick(() => onCreateSubdeck?.(deckId))
    );

    // 移动牌组
    menu.addItem((item) =>
      item
        .setTitle("移动牌组")
        .setIcon("move")
        .onClick(() => onMoveDeck?.(deckId))
    );

    menu.addSeparator();

    // 编辑
    menu.addItem((item) =>
      item
        .setTitle("编辑")
        .setIcon("edit")
        .onClick(() => onEditDeck?.(deckId))
    );

    // 删除
    menu.addItem((item) =>
      item
        .setTitle("删除")
        .setIcon("trash-2")
        .onClick(() => onDeleteDeck?.(deckId))
    );

    menu.addSeparator();

    // 分析
    menu.addItem((item) =>
      item
        .setTitle("分析")
        .setIcon("bar-chart-2")
        .onClick(() => onAnalyzeDeck?.(deckId))
    );

    menu.showAtMouseEvent(event);
  }

</script>

<div class="grid-card-view">
  <!-- 牌组类型筛选器 -->
  <div class="category-filter-wrapper">
    <CategoryFilter
      {selectedFilter}
      onSelect={handleFilterSelect}
    />
  </div>

  <!-- 网格卡片容器 -->
  <div class="cards-grid">
    {#if filteredDecks().length === 0}
      <!-- 空状态提示 -->
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <div class="empty-text">该分类暂无牌组</div>
        <div class="empty-hint">创建新牌组时可为其分配分类</div>
      </div>
    {:else}
      {#each filteredDecks() as deck (deck.id)}
        {@const stats = deckStats[deck.id] || {
          newCards: 0,
          learningCards: 0,
          reviewCards: 0,
          memoryRate: 0,
          totalCards: 0,
          todayNew: 0,
          todayReview: 0,
          todayTime: 0,
          totalReviews: 0,
          totalTime: 0,
          averageEase: 0,
          forecastDays: {}
        }}
        {@const colorScheme = getColorSchemeForDeck(deck.id)}
        {@const deckTypeLabel = getDeckTypeLabel(deck)}
        <DeckGridCard
          {deck}
          {stats}
          {colorScheme}
          categoryName={deckTypeLabel}
          onStudy={() => onStartStudy(deck.id)}
          onMenu={(e) => showDeckMenu(e, deck.id)}
        />
      {/each}
    {/if}
  </div>
</div>

<style>
  .grid-card-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow-y: auto;
    background: var(--background-primary);
  }

  .category-filter-wrapper {
    padding: 16px 0 8px 0;
    flex-shrink: 0;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 24px;
    padding: 8px 0;
  }

  /* 空状态 */
  .empty-state {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    text-align: center;
  }

  .empty-icon {
    font-size: 64px;
    margin-bottom: 20px;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 8px;
  }

  .empty-hint {
    font-size: 14px;
    color: var(--text-muted);
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .grid-card-view {
      padding: 16px;
    }

    .cards-grid {
      grid-template-columns: 1fr;
      gap: 16px;
    }
  }

  @media (min-width: 769px) and (max-width: 1200px) {
    .cards-grid {
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
  }

  @media (min-width: 1201px) {
    .cards-grid {
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 24px;
    }
  }
</style>

