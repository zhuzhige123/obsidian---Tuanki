<script lang="ts">
  import { onMount } from 'svelte';
  import { Menu } from 'obsidian';
  import type { Deck } from '../../data/types';
  import type { DeckTreeNode } from '../../services/deck/DeckHierarchyService';
  import type { AnkiDataStorage } from '../../data/storage';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  
  // 导入牌组聚合服务和类型
  import { DeckAggregationService } from '../../services/deck/DeckAggregationService';
  import type { DeckGroupByType } from '../../types/deck-kanban-types';
  import { DECK_GROUP_CONFIGS, DECK_GROUP_BY_LABELS } from '../../types/deck-kanban-types';
  
  interface DeckStats {
    newCards: number;
    learningCards: number;
    reviewCards: number;
    memoryRate: number;
  }
  
  interface Props {
    deckTree: DeckTreeNode[];
    deckStats: Record<string, DeckStats>;
    dataStorage: AnkiDataStorage;
    groupBy?: DeckGroupByType;
    onStartStudy: (deckId: string) => void;
    onDeckUpdate?: () => void; // 🎯 牌组更新回调
  }
  
  let { 
    deckTree, 
    deckStats, 
    dataStorage,
    groupBy: initialGroupBy = 'completion',
    onStartStudy,
    onDeckUpdate
  }: Props = $props();
  
  // 状态管理
  let groupBy = $state<DeckGroupByType>(initialGroupBy);
  let groupedDecks = $state<Record<string, Deck[]>>({});
  let isLoading = $state(false);
  let aggregationService: DeckAggregationService;
  
  // 拖拽状态管理
  let draggedDeck = $state<Deck | null>(null);
  let dragOverColumn = $state<string | null>(null);
  
  // 🎯 初始化聚合服务，传入实时统计数据
  aggregationService = new DeckAggregationService(dataStorage, deckStats);
  
  // 🎯 监听 deckStats 变化，动态更新服务
  $effect(() => {
    aggregationService.updateDeckStats(deckStats);
  });
  
  // 将牌组树扁平化为列表
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
  
  // 获取当前分组配置
  const currentGroupConfig = $derived(DECK_GROUP_CONFIGS[groupBy]);
  const currentGroupLabel = $derived(DECK_GROUP_BY_LABELS[groupBy]);
  
  // 动态分组逻辑
  $effect(() => {
    async function updateGrouping() {
      isLoading = true;
      try {
        groupedDecks = await aggregationService.groupDecks(allDecks, groupBy);
      } catch (error) {
        console.error('Error grouping decks:', error);
        groupedDecks = {};
      } finally {
        isLoading = false;
      }
    }
    
    updateGrouping();
  });
  
  // 从localStorage加载保存的分组方式
  onMount(() => {
    const saved = localStorage.getItem('tuanki-deck-kanban-groupby');
    if (saved && ['completion', 'timeRange', 'typeDistribution', 'priority'].includes(saved)) {
      groupBy = saved as DeckGroupByType;
    }
  });
  
  // 显示分组菜单
  function showGroupMenu(evt: MouseEvent) {
    const menu = new Menu();
    
    // 添加分组选项
    const groupTypes: DeckGroupByType[] = ['completion', 'timeRange', 'typeDistribution', 'priority'];
    
    groupTypes.forEach(type => {
      const config = DECK_GROUP_CONFIGS[type];
      menu.addItem((item) => {
        item
          .setTitle(config.title)
          .setIcon(config.icon)
          .setChecked(groupBy === type)
          .onClick(() => {
            groupBy = type;
            // 保存到localStorage
            localStorage.setItem('tuanki-deck-kanban-groupby', type);
          });
      });
    });
    
    menu.showAtMouseEvent(evt);
  }
  
  // 获取牌组统计数据（用于显示）
  function getDeckStats(deck: Deck) {
    return deckStats[deck.id] || {
      newCards: 0,
      learningCards: 0,
      reviewCards: 0,
      memoryRate: 0
    };
  }
  
  // 🎯 拖拽功能
  // 检查当前分组方式是否支持拖拽
  function isDraggable(): boolean {
    // 只有优先级分组支持拖拽改变
    return groupBy === 'priority';
  }
  
  // 拖拽开始
  function handleDragStart(e: DragEvent, deck: Deck) {
    if (!isDraggable()) return;
    
    draggedDeck = deck;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-tuanki-deck', deck.id);
    }
  }
  
  // 拖拽结束
  function handleDragEnd() {
    draggedDeck = null;
    dragOverColumn = null;
  }
  
  // 拖拽经过列
  function handleDragOver(e: DragEvent, groupKey: string) {
    if (!draggedDeck) return;
    e.preventDefault();
    dragOverColumn = groupKey;
  }
  
  // 离开列
  function handleDragLeave() {
    dragOverColumn = null;
  }
  
  // 放下
  async function handleDrop(targetGroupKey: string) {
    if (!draggedDeck || !isDraggable()) return;
    
    try {
      // 获取当前牌组的分组key
      const sourceGroupKey = getCurrentGroupKey(draggedDeck);
      
      // 如果拖到同一列，不做处理
      if (sourceGroupKey === targetGroupKey) {
        handleDragEnd();
        return;
      }
      
      // 更新牌组优先级（通过metadata存储）
      const updatedDeck: Deck = {
        ...draggedDeck,
        metadata: {
          ...draggedDeck.metadata,
          priority: targetGroupKey
        },
        modified: new Date().toISOString()
      };
      
      // 保存到数据库
      await dataStorage.saveDeck(updatedDeck);
      
      // 🎯 触发父组件刷新数据
      if (onDeckUpdate) {
        onDeckUpdate();
      } else {
        // 如果没有回调，本地重新加载分组
        groupedDecks = await aggregationService.groupDecks(allDecks, groupBy);
      }
      
      console.log(`[KanbanView] 牌组 ${draggedDeck.name} 优先级已更新为 ${targetGroupKey}`);
    } catch (error) {
      console.error('[KanbanView] 更新牌组优先级失败:', error);
    } finally {
      handleDragEnd();
    }
  }
  
  // 获取牌组当前所在的分组key
  function getCurrentGroupKey(deck: Deck): string {
    for (const [key, decks] of Object.entries(groupedDecks)) {
      if (decks.some(d => d.id === deck.id)) {
        return key;
      }
    }
    return '';
  }
</script>

<div class="kanban-view">
  <!-- 工具栏 -->
  <div class="deck-kanban-toolbar">
    <div class="toolbar-left">
      <h3 class="kanban-title">
        {currentGroupLabel}
        <span class="total-count-badge">{allDecks.length}</span>
      </h3>
    </div>
    <div class="toolbar-right">
      <button 
        class="group-menu-button"
        onclick={showGroupMenu}
        title="切换分组方式"
      >
        <EnhancedIcon name="sliders" size={16} />
        <span>分组方式</span>
        <EnhancedIcon name="chevron-down" size={12} />
      </button>
    </div>
  </div>

  <!-- 加载状态 -->
  {#if isLoading}
    <div class="loading-indicator">
      <div class="spinner"></div>
      <span>正在分组...</span>
    </div>
  {:else}
    <!-- 看板列 -->
    <div class="kanban-columns">
      {#each currentGroupConfig.groups as group (group.key)}
        {@const decks = groupedDecks[group.key] || []}
        <div 
          class="kanban-column" 
          class:drag-over={dragOverColumn === group.key}
          style="--column-color: {group.color}"
          role="region"
          aria-label={`${group.label}分组`}
          ondragover={(e) => handleDragOver(e, group.key)}
          ondragleave={handleDragLeave}
          ondrop={() => handleDrop(group.key)}
        >
          <div class="column-header">
            <div class="header-content">
              <span class="header-icon">
                <EnhancedIcon name={group.icon} size={16} color={group.color} />
              </span>
              <h3 class="header-title">{group.label}</h3>
              {#if isDraggable()}
                <span class="draggable-hint" title="可拖拽分组">
                  <EnhancedIcon name="grip-vertical" size={12} />
                </span>
              {/if}
            </div>
            <span class="count-badge">{decks.length}</span>
          </div>
          
          <div class="column-content">
            {#each decks as deck (deck.id)}
              {@const stats = getDeckStats(deck)}
              <div 
                class="kanban-card"
                class:dragging={draggedDeck?.id === deck.id}
                class:draggable={isDraggable()}
                role="button"
                tabindex={isDraggable() ? 0 : -1}
                draggable={isDraggable()}
                ondragstart={(e) => handleDragStart(e, deck)}
                ondragend={handleDragEnd}
              >
              <div class="card-header">
                <span class="deck-icon">
                  {#if deck.icon}
                    {deck.icon}
                  {:else}
                    <EnhancedIcon name="folder" size={16} />
                  {/if}
                </span>
                <h4 class="deck-name" title={deck.name}>{deck.name}</h4>
              </div>
                
                <div class="card-stats">
                  {#if stats.newCards > 0}
                    <div class="stat-item">
                      <span class="stat-value new">{stats.newCards}</span>
                      <span class="stat-label">新</span>
                    </div>
                  {/if}
                  {#if stats.learningCards > 0}
                    <div class="stat-item">
                      <span class="stat-value learning">{stats.learningCards}</span>
                      <span class="stat-label">学习</span>
                    </div>
                  {/if}
                  {#if stats.reviewCards > 0}
                    <div class="stat-item">
                      <span class="stat-value review">{stats.reviewCards}</span>
                      <span class="stat-label">复习</span>
                    </div>
                  {/if}
                  {#if stats.newCards === 0 && stats.learningCards === 0 && stats.reviewCards === 0}
                    <span class="stat-label">今日已完成</span>
                  {/if}
                </div>
                
                <button 
                  class="action-button"
                  onclick={() => onStartStudy(deck.id)}
                >
                  <EnhancedIcon name="play" size={12} />
                  学习
                </button>
              </div>
            {/each}
            
            {#if decks.length === 0}
              <div class="empty-message">
                <EnhancedIcon name="inbox" size={24} />
                <span>暂无牌组</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .kanban-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow: hidden;
    gap: 16px;
  }
  
  /* 工具栏样式 */
  .deck-kanban-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
  }
  
  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .kanban-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .total-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }
  
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .group-menu-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .group-menu-button:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }
  
  /* 加载状态 */
  .loading-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    color: var(--text-muted);
  }
  
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* 看板列 */
  .kanban-columns {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    flex: 1;
    min-height: 0;
  }
  
  .kanban-column {
    display: flex;
    flex-direction: column;
    background: var(--background-secondary);
    border-radius: 12px;
    padding: 16px;
    min-height: 0;
    transition: all 0.3s ease;
  }
  
  .column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid var(--column-color, var(--background-modifier-border));
  }
  
  .header-content {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .header-icon {
    display: flex;
    align-items: center;
  }
  
  .header-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0;
  }
  
  .count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    background: var(--column-color, var(--interactive-accent));
    color: white;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }
  
  .column-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .column-content::-webkit-scrollbar {
    width: 6px;
  }
  
  .column-content::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .column-content::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 3px;
  }
  
  .column-content::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }
  
  /* 牌组卡片 */
  .kanban-card {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 12px;
    transition: all 0.2s;
    cursor: default;
  }
  
  /* 可拖拽的卡片 */
  .kanban-card.draggable {
    cursor: grab;
  }
  
  .kanban-card.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }
  
  .kanban-card:hover {
    border-color: var(--interactive-accent);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
  
  /* 拖拽目标列高亮 */
  .kanban-column.drag-over {
    background: color-mix(in srgb, var(--column-color) 5%, var(--background-secondary));
    border: 2px dashed var(--interactive-accent);
  }
  
  /* 拖拽提示图标 */
  .draggable-hint {
    display: inline-flex;
    align-items: center;
    margin-left: 4px;
    color: var(--text-faint);
    opacity: 0.6;
  }
  
  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  
  .deck-icon {
    font-size: 16px;
    display: flex;
    align-items: center;
  }
  
  .deck-name {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-normal);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .card-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
    min-height: 20px;
  }
  
  .stat-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .stat-value {
    font-size: 14px;
    font-weight: 600;
  }
  
  .stat-value.new {
    color: #10b981;
  }
  
  .stat-value.learning {
    color: #f59e0b;
  }
  
  .stat-value.review {
    color: #3b82f6;
  }
  
  .stat-label {
    font-size: 11px;
    color: var(--text-muted);
  }
  
  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    padding: 6px 12px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .action-button:hover {
    background: var(--interactive-accent-hover);
    transform: scale(1.02);
  }
  
  /* 空状态 */
  .empty-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 20px;
    color: var(--text-muted);
    font-size: 13px;
  }
  
  /* 响应式 */
  @media (max-width: 1200px) {
    .kanban-columns {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  
  @media (max-width: 768px) {
    .kanban-view {
      padding: 12px;
    }
    
    .kanban-columns {
      grid-template-columns: 1fr;
    }
    
    .group-menu-button span {
      display: none;
    }
  }
</style>

