<script lang="ts">
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import EnhancedButton from '../ui/EnhancedButton.svelte';
  import { ICON_NAMES } from '../../icons/index.js';
  import type { Deck } from '../../data/types';
  import type { DeckTreeNode } from '../../services/deck/DeckHierarchyService';

  interface Props {
    open: boolean;
    currentDeck: Deck;
    deckTree: DeckTreeNode[];
    onconfirm?: (targetParentId: string | null) => void;
    oncancel?: () => void;
  }

  let { open, currentDeck, deckTree, onconfirm, oncancel }: Props = $props();

  // 状态管理
  let selectedParentId = $state<string | null>(null);
  let searchQuery = $state('');
  let expandedDeckIds = $state<Set<string>>(new Set());

  // 筛选可选的牌组（排除自己及其所有子牌组）
  let availableDecks = $derived.by(() => {
    const excludedIds = new Set<string>();
    
    // 递归收集当前牌组及其所有子牌组的ID
    function collectDescendants(nodeId: string, nodes: DeckTreeNode[]) {
      excludedIds.add(nodeId);
      const node = findNodeById(nodeId, nodes);
      if (node?.children) {
        node.children.forEach(child => collectDescendants(child.deck.id, nodes));
      }
    }
    
    collectDescendants(currentDeck.id, deckTree);
    
    // 过滤掉被排除的牌组
    return flattenTree(deckTree).filter(node => !excludedIds.has(node.deck.id));
  });

  // 搜索过滤
  let filteredDecks = $derived.by(() => {
    if (!searchQuery.trim()) {
      return availableDecks;
    }
    const query = searchQuery.toLowerCase();
    return availableDecks.filter(node =>
      node.deck.name.toLowerCase().includes(query) ||
      node.deck.description?.toLowerCase().includes(query)
    );
  });

  // 工具函数：查找节点
  function findNodeById(id: string, nodes: DeckTreeNode[]): DeckTreeNode | null {
    for (const node of nodes) {
      if (node.deck.id === id) return node;
      if (node.children) {
        const found = findNodeById(id, node.children);
        if (found) return found;
      }
    }
    return null;
  }

  // 工具函数：扁平化树
  function flattenTree(nodes: DeckTreeNode[]): DeckTreeNode[] {
    const result: DeckTreeNode[] = [];
    function traverse(nodes: DeckTreeNode[]) {
      for (const node of nodes) {
        result.push(node);
        if (node.children) {
          traverse(node.children);
        }
      }
    }
    traverse(nodes);
    return result;
  }

  // 切换展开状态
  function toggleExpand(deckId: string) {
    if (expandedDeckIds.has(deckId)) {
      expandedDeckIds.delete(deckId);
    } else {
      expandedDeckIds.add(deckId);
    }
    expandedDeckIds = new Set(expandedDeckIds);
  }

  // 选择牌组
  function handleDeckSelect(deckId: string | null) {
    selectedParentId = deckId;
  }

  // 确认移动
  function handleConfirm() {
    onconfirm?.(selectedParentId);
    resetState();
  }

  // 取消操作
  function handleCancel() {
    oncancel?.();
    resetState();
  }

  // 重置状态
  function resetState() {
    selectedParentId = null;
    searchQuery = '';
    expandedDeckIds = new Set();
  }

  // 仅监听 open 变化，避免无限循环
  let isInitialized = false;
  
  $effect(() => {
    if (!open) {
      resetState();
      isInitialized = false;
    } else if (!isInitialized) {
      // 只在首次打开时初始化展开状态
      isInitialized = true;
      const initialExpanded = new Set<string>();
      deckTree.forEach(node => {
        initialExpanded.add(node.deck.id);
      });
      expandedDeckIds = initialExpanded;
    }
  });

  // 渲染牌组树节点
  function renderDeckNode(node: DeckTreeNode, depth: number = 0) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedDeckIds.has(node.deck.id);
    const isSelected = selectedParentId === node.deck.id;
    const isExcluded = node.deck.id === currentDeck.id;

    return { node, depth, hasChildren, isExpanded, isSelected, isExcluded };
  }
</script>

{#if open}
<div class="mdc-overlay" onclick={(e) => { if (e.currentTarget === e.target) handleCancel() }} onkeydown={(e) => { if (e.key === 'Escape') handleCancel() }} role="button" tabindex="0">
  <div class="mdc-modal" role="dialog" aria-labelledby="mdc-title">
    <header class="mdc-header">
      <h2 id="mdc-title">移动牌组</h2>
      <EnhancedButton variant="secondary" size="sm" onclick={handleCancel}>
        <EnhancedIcon name={ICON_NAMES.CLOSE} size={16} />
      </EnhancedButton>
    </header>

    <main class="mdc-main">
      <!-- 当前牌组信息 -->
      <div class="mdc-info">
        <EnhancedIcon name={ICON_NAMES.INFO} size={16} />
        <div class="mdc-info-content">
          <span>将 <strong>{currentDeck.name}</strong> 移动到新位置</span>
        </div>
      </div>

      <!-- 搜索框 -->
      <div class="mdc-search">
        <EnhancedIcon name={ICON_NAMES.SEARCH} size={16} />
        <input
          type="text"
          placeholder="搜索目标牌组..."
          bind:value={searchQuery}
        />
      </div>

      <!-- 目标位置选择 -->
      <div class="mdc-target-section">
        <h3>选择目标位置</h3>
        
        <!-- 根级选项 -->
        <div
          class="mdc-deck-item root-option"
          class:selected={selectedParentId === null}
          onclick={() => handleDeckSelect(null)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeckSelect(null); } }}
          role="button"
          tabindex="0"
          aria-label="移动为顶级牌组"
        >
          <div class="mdc-deck-icon">
            <EnhancedIcon name={ICON_NAMES.CHEVRON_UP} size={20} />
          </div>
          <div class="mdc-deck-info">
            <div class="mdc-deck-name">顶级（无父牌组）</div>
            <div class="mdc-deck-desc">升级为根级牌组</div>
          </div>
          {#if selectedParentId === null}
          <div class="mdc-deck-check">
            <EnhancedIcon name={ICON_NAMES.CHECK_CIRCLE} size={20} />
          </div>
          {/if}
        </div>

        <!-- 牌组树列表 -->
        <div class="mdc-deck-list">
          {#if filteredDecks.length === 0}
          <div class="mdc-empty">
            <EnhancedIcon name={ICON_NAMES.WARNING} size={24} />
            <p>没有找到可选的目标牌组</p>
          </div>
          {:else}
            {#each filteredDecks as deckNode}
              {@const { node, depth, hasChildren, isExpanded, isSelected, isExcluded } = renderDeckNode(deckNode, 0)}
              {#if !isExcluded}
              <div
                class="mdc-deck-item"
                class:selected={isSelected}
                style="padding-left: {depth * 24 + 16}px"
                onclick={() => handleDeckSelect(node.deck.id)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeckSelect(node.deck.id); } }}
                role="button"
                tabindex="0"
                aria-label={`选择牌组: ${node.deck.name}`}
              >
                {#if hasChildren}
                  <button
                    class="expand-toggle"
                    onclick={(e) => {
                      e.stopPropagation();
                      toggleExpand(node.deck.id);
                    }}
                    aria-label={isExpanded ? '折叠' : '展开'}
                  >
                    <EnhancedIcon 
                      name={isExpanded ? ICON_NAMES.CHEVRON_DOWN : ICON_NAMES.CHEVRON_RIGHT} 
                      size={14} 
                    />
                  </button>
                {:else}
                  <span class="expand-spacer"></span>
                {/if}

                <div class="mdc-deck-icon">
                  <EnhancedIcon name={ICON_NAMES.FOLDER} size={20} />
                </div>
                <div class="mdc-deck-info">
                  <div class="mdc-deck-name">{node.deck.name}</div>
                  {#if node.deck.description}
                  <div class="mdc-deck-desc">{node.deck.description}</div>
                  {/if}
                </div>
                {#if isSelected}
                <div class="mdc-deck-check">
                  <EnhancedIcon name={ICON_NAMES.CHECK_CIRCLE} size={20} />
                </div>
                {/if}
              </div>
              {/if}
            {/each}
          {/if}
        </div>
      </div>
    </main>

    <footer class="mdc-footer">
      <EnhancedButton variant="secondary" onclick={handleCancel}>
        取消
      </EnhancedButton>
      <EnhancedButton 
        variant="primary" 
        onclick={handleConfirm}
      >
        确认移动
        <EnhancedIcon name={ICON_NAMES.ARROW_RIGHT} size={16} />
      </EnhancedButton>
    </footer>
  </div>
</div>
{/if}

<style>
  .mdc-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .mdc-modal {
    background: var(--background-primary);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-l);
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .mdc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .mdc-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .mdc-main {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .mdc-info {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: var(--radius-m);
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .mdc-info-content {
    flex: 1;
  }

  .mdc-search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
  }

  .mdc-search input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-normal);
    font-size: 0.875rem;
  }

  .mdc-target-section h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .mdc-deck-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .mdc-deck-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 2px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mdc-deck-item:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .mdc-deck-item.selected {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-success);
  }

  .mdc-deck-item.root-option {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%);
  }

  .expand-toggle {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    transition: color 0.2s ease;
  }

  .expand-toggle:hover {
    color: var(--text-normal);
  }

  .expand-spacer {
    width: 24px;
    height: 24px;
  }

  .mdc-deck-icon {
    color: var(--text-accent);
    flex-shrink: 0;
  }

  .mdc-deck-info {
    flex: 1;
    min-width: 0;
  }

  .mdc-deck-name {
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mdc-deck-desc {
    color: var(--text-muted);
    font-size: 0.8125rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mdc-deck-check {
    color: var(--color-green);
    flex-shrink: 0;
  }

  .mdc-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    color: var(--text-muted);
    text-align: center;
  }

  .mdc-empty p {
    margin: 0.5rem 0 0 0;
  }

  .mdc-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }
</style>

