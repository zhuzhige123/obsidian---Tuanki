<!--
  牌组选择器组件
  
  功能：
  - 层级显示牌组
  - 多选牌组（带智能限制）
  - 搜索牌组
  - 持久化选择
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Deck } from '../../data/types';
  import type { DeckHierarchyNode } from '../../types/deck-selector-types';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import {
    buildDeckHierarchy,
    flattenHierarchy,
    searchDecks,
    toggleNodeExpanded,
    getExpandedDeckIds,
    calculateSelectionLimit,
    formatDeckPath
  } from '../../utils/deck-hierarchy';
  import { DeckSelectorStorage } from '../../services/deck-selector-storage';

  interface Props {
    /** 所有牌组列表 */
    decks: Deck[];
    /** 牌组卡片数量映射 */
    deckCardCounts: Map<string, number>;
    /** 已选中的牌组ID列表 */
    selectedDeckIds: string[];
    /** 选择变化回调 */
    onSelectionChange: (deckIds: string[]) => void;
    /** 最大牌组选择数 */
    maxDeckSelection?: number;
    /** 卡片数阈值 */
    cardCountThreshold?: number;
  }

  let {
    decks,
    deckCardCounts,
    selectedDeckIds,
    onSelectionChange,
    maxDeckSelection = 4,
    cardCountThreshold = 3000
  }: Props = $props();

  // 状态
  let showMenu = $state(false);
  let searchQuery = $state('');
  let expandedDeckIds = $state<Set<string>>(new Set());

  // 初始化
  onMount(() => {
    // 加载展开状态
    const storedExpanded = DeckSelectorStorage.loadExpandedDecks();
    expandedDeckIds = new Set(storedExpanded);
  });

  // 使用$derived来计算层级节点，避免手动状态管理
  const hierarchyNodes = $derived.by(() => {
    if (!decks || decks.length === 0) return [];
    
    const selectedSet = new Set(selectedDeckIds);
    const nodes = buildDeckHierarchy(
      decks,
      deckCardCounts,
      selectedSet,
      expandedDeckIds
    );
    
    // 应用禁用状态
    const limit = calculateSelectionLimit(
      selectedDeckIds,
      deckCardCounts,
      maxDeckSelection,
      cardCountThreshold
    );

    function setDisabled(node: DeckHierarchyNode) {
      // 已选中的永远不禁用
      if (node.selected) {
        node.disabled = false;
      } else {
        // 未选中的：如果不能再选了，就禁用
        node.disabled = !limit.canSelectMore;
        
        // 特殊情况：如果选择该牌组会超过卡片限制，也禁用
        if (!node.disabled && limit.currentCards + node.cardCount > cardCountThreshold) {
          node.disabled = true;
        }
      }
      
      node.children.forEach(setDisabled);
    }

    nodes.forEach(setDisabled);
    return nodes;
  });

  // 显示的节点（考虑搜索和展开状态）
  const displayNodes = $derived.by(() => {
    let nodes = hierarchyNodes;
    
    // 应用搜索过滤
    if (searchQuery.trim()) {
      nodes = searchDecks(nodes, searchQuery);
    }
    
    // 扁平化（只显示展开的）
    return flattenHierarchy(nodes, false);
  });

  // 选择限制信息
  const selectionLimit = $derived(() => {
    return calculateSelectionLimit(
      selectedDeckIds,
      deckCardCounts,
      maxDeckSelection,
      cardCountThreshold
    );
  });

  // 按钮显示文本
  const buttonText = $derived(() => {
    if (selectedDeckIds.length === 0) {
      return '全部牌组';
    }
    
    if (selectedDeckIds.length === 1) {
      const deckId = selectedDeckIds[0];
      const deck = decks.find(d => d.id === deckId);
      const count = deckCardCounts.get(deckId) || 0;
      return `${deck?.name || '未知'} (${count})`;
    }
    
    const totalCards = selectedDeckIds.reduce(
      (sum, id) => sum + (deckCardCounts.get(id) || 0),
      0
    );
    return `${selectedDeckIds.length}个牌组 (${totalCards})`;
  });

  // 切换菜单
  function toggleMenu() {
    showMenu = !showMenu;
    if (!showMenu) {
      searchQuery = '';
    }
  }

  // 关闭菜单
  function closeMenu() {
    showMenu = false;
    searchQuery = '';
  }

  // 切换牌组选择
  function toggleDeck(deckId: string) {
    const currentIndex = selectedDeckIds.indexOf(deckId);
    let newSelection: string[];

    if (currentIndex >= 0) {
      // 取消选择
      newSelection = selectedDeckIds.filter(id => id !== deckId);
    } else {
      // 添加选择
      newSelection = [...selectedDeckIds, deckId];
    }

    // 触发回调
    onSelectionChange(newSelection);
    
    // 保存到持久化
    DeckSelectorStorage.saveWithTimestamp(newSelection);
    
    // 注意：不在这里调用rebuildHierarchy()，让$effect处理
  }

  // 切换展开状态
  function toggleExpanded(deckId: string, event: MouseEvent) {
    event.stopPropagation(); // 阻止触发选择
    
    // 更新展开状态 - 创建新的Set以确保响应式更新
    const newExpandedIds = new Set(expandedDeckIds);
    if (newExpandedIds.has(deckId)) {
      newExpandedIds.delete(deckId);
    } else {
      newExpandedIds.add(deckId);
    }
    expandedDeckIds = newExpandedIds;
    
    // 保存展开状态
    DeckSelectorStorage.saveExpandedDecks(Array.from(expandedDeckIds));
  }

  // 清除所有选择
  function clearSelection() {
    onSelectionChange([]);
    DeckSelectorStorage.clearSelection();
  }
</script>

<!-- 选择器按钮 -->
<div class="deck-selector">
  <button
    class="deck-selector-button"
    class:active={showMenu}
    onclick={toggleMenu}
    title="选择要显示的牌组"
  >
    <EnhancedIcon name="folder" size="16" />
    <span class="deck-selector-text">{buttonText}</span>
    <EnhancedIcon name={showMenu ? "chevron-up" : "chevron-down"} size="14" />
  </button>

  <!-- 下拉菜单 -->
  {#if showMenu}
    <div 
      class="deck-selector-overlay"
      role="presentation"
      onclick={closeMenu}
      onkeydown={(e) => {
        if (e.key === 'Escape') closeMenu();
      }}
    >
      <div 
        class="deck-selector-menu" 
        role="dialog"
        aria-label="选择牌组"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <!-- 菜单头部 -->
        <div class="deck-selector-header">
          <div class="deck-selector-title">
            <EnhancedIcon name="folder" size="14" />
            <span>选择牌组</span>
          </div>
          <button
            class="deck-selector-close"
            onclick={closeMenu}
            title="关闭"
          >
            <EnhancedIcon name="x" size="14" />
          </button>
        </div>

        <!-- 搜索框 -->
        <div class="deck-selector-search">
          <EnhancedIcon name="search" size="14" />
          <input
            type="text"
            placeholder="搜索牌组..."
            bind:value={searchQuery}
            class="deck-selector-search-input"
          />
        </div>

        <!-- 限制提示 -->
        {#if selectionLimit().limitReason}
          <div class="deck-limit-warning">
            <EnhancedIcon name="alert-triangle" size="14" />
            <span>{selectionLimit().limitReason}</span>
          </div>
        {/if}

        <!-- 统计信息 -->
        <div class="deck-selector-stats">
          <span>已选: {selectedDeckIds.length}/{selectionLimit().maxDecks}</span>
          <span>|</span>
          <span>卡片: {selectionLimit().currentCards}/{selectionLimit().maxCards}</span>
          {#if selectedDeckIds.length > 0}
            <button
              class="deck-clear-btn"
              onclick={clearSelection}
              title="清除所有选择"
            >
              <EnhancedIcon name="x-circle" size="12" />
              清除
            </button>
          {/if}
        </div>

        <!-- 牌组列表 -->
        <div class="deck-selector-list">
          {#if displayNodes.length === 0}
            <div class="deck-empty-state">
              {#if searchQuery.trim()}
                <EnhancedIcon name="search" size="24" />
                <p>未找到匹配的牌组</p>
              {:else}
                <EnhancedIcon name="folder" size="24" />
                <p>暂无牌组</p>
              {/if}
            </div>
          {:else}
            {#each displayNodes as node (node.deck.id)}
              {@const hasChildren = node.children.length > 0}
              {@const indentStyle = `padding-left: ${node.level * 20 + 12}px;`}
              
              <div
                class="deck-hierarchy-item"
                class:selected={node.selected}
                class:disabled={node.disabled}
                style={indentStyle}
                role="button"
                tabindex="0"
                onclick={() => !node.disabled && toggleDeck(node.deck.id)}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    !node.disabled && toggleDeck(node.deck.id);
                  }
                }}
              >
                <!-- 展开/折叠图标 -->
                <div class="deck-expand-icon">
                  {#if hasChildren}
                    <button
                      class="deck-expand-btn"
                      onclick={(e) => toggleExpanded(node.deck.id, e)}
                      title={node.expanded ? '折叠' : '展开'}
                    >
                      <EnhancedIcon 
                        name={node.expanded ? "chevron-down" : "chevron-right"} 
                        size="14" 
                      />
                    </button>
                  {:else}
                    <span class="deck-expand-placeholder"></span>
                  {/if}
                </div>

                <!-- 复选框 -->
                <div class="deck-checkbox">
                  <input
                    type="checkbox"
                    checked={node.selected}
                    disabled={node.disabled}
                    onclick={(e) => e.stopPropagation()}
                    onchange={() => !node.disabled && toggleDeck(node.deck.id)}
                  />
                </div>

                <!-- 牌组信息 -->
                <div class="deck-info">
                  <div class="deck-name">{node.deck.name}</div>
                  <div class="deck-count">
                    {node.cardCount} 张卡片
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* 选择器容器 */
  .deck-selector {
    position: relative;
    display: inline-block;
  }

  /* 选择器按钮 */
  .deck-selector-button {
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
    transition: all 0.2s ease;
    white-space: nowrap;
    min-width: 120px;
    max-width: 280px;
  }

  .deck-selector-button:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .deck-selector-button.active {
    background: var(--background-modifier-active-hover);
    border-color: var(--accent-color);
  }

  .deck-selector-text {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 遮罩层 */
  .deck-selector-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: transparent;
    z-index: 1000;
  }

  /* 下拉菜单 */
  .deck-selector-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: 360px;
    max-height: 500px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: var(--shadow-l);
    z-index: 1001;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* 菜单头部 */
  .deck-selector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .deck-selector-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .deck-selector-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .deck-selector-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  /* 搜索框 */
  .deck-selector-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
  }

  .deck-selector-search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-normal);
    font-size: 13px;
  }

  /* 限制警告 */
  .deck-limit-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--background-modifier-error);
    color: var(--text-error);
    font-size: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  /* 统计信息 */
  .deck-selector-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    font-size: 12px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .deck-clear-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding: 2px 8px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .deck-clear-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-error);
  }

  /* 牌组列表 */
  .deck-selector-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  /* 层级项 */
  .deck-hierarchy-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .deck-hierarchy-item:hover:not(.disabled) {
    background: var(--background-modifier-hover);
  }

  .deck-hierarchy-item.selected {
    background: var(--background-modifier-active-hover);
  }

  .deck-hierarchy-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 展开图标 */
  .deck-expand-icon {
    width: 20px;
    flex-shrink: 0;
  }

  .deck-expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .deck-expand-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .deck-expand-placeholder {
    display: block;
    width: 20px;
    height: 20px;
  }

  /* 复选框 */
  .deck-checkbox {
    flex-shrink: 0;
  }

  .deck-checkbox input[type="checkbox"] {
    cursor: pointer;
  }

  .deck-checkbox input[type="checkbox"]:disabled {
    cursor: not-allowed;
  }

  /* 牌组信息 */
  .deck-info {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .deck-name {
    flex: 1;
    font-size: 13px;
    color: var(--text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .deck-count {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-muted);
  }

  /* 空状态 */
  .deck-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: var(--text-muted);
    text-align: center;
  }

  .deck-empty-state p {
    margin-top: 12px;
    font-size: 13px;
  }
</style>

