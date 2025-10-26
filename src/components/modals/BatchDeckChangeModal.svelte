<!--
  批量更换牌组模态框
  允许批量将卡片移动到其他牌组
-->
<script lang="ts">
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import EnhancedButton from '../ui/EnhancedButton.svelte';
  import { ICON_NAMES } from '../../icons/index.js';
  import type { Card, Deck } from '../../data/types';

  interface Props {
    open: boolean;
    selectedCards: Card[];
    decks: Deck[];
    onconfirm?: (targetDeckId: string, operationType: 'move' | 'copy') => void;
    oncancel?: () => void;
  }

  let { open, selectedCards, decks, onconfirm, oncancel }: Props = $props();

  // 状态管理
  let selectedDeckId = $state('');
  let searchQuery = $state('');
  let operationType = $state<'move' | 'copy'>('move'); // ✅ 默认为移动

  // 计算当前牌组分布
  let deckDistribution = $derived.by(() => {
    const distribution = new Map<string, number>();
    selectedCards.forEach(card => {
      const count = distribution.get(card.deckId) || 0;
      distribution.set(card.deckId, count + 1);
    });
    return Array.from(distribution.entries()).map(([deckId, count]) => ({
      deckId,
      deckName: decks.find(d => d.id === deckId)?.name || '未知牌组',
      cardCount: count
    }));
  });

  // 筛选牌组
  let filteredDecks = $derived.by<Deck[]>(() => {
    if (!searchQuery.trim()) {
      return decks;
    }
    const query = searchQuery.toLowerCase();
    return decks.filter(deck => 
      deck.name.toLowerCase().includes(query) ||
      deck.description?.toLowerCase().includes(query)
    );
  });

  // 重置状态
  function resetState() {
    selectedDeckId = '';
    searchQuery = '';
    operationType = 'move'; // ✅ 重置为移动
  }

  // 选择牌组
  function handleDeckSelect(deckId: string) {
    selectedDeckId = deckId;
  }

  // 确认更换
  function handleConfirm() {
    if (!selectedDeckId) return;
    onconfirm?.(selectedDeckId, operationType); // ✅ 传递操作类型
    resetState();
  }

  // 取消操作
  function handleCancel() {
    oncancel?.();
    resetState();
  }

  // 监听open变化，重置状态
  $effect(() => {
    if (!open) {
      resetState();
    }
  });
</script>

{#if open}
<div class="bdc-overlay" onclick={(e) => { if (e.currentTarget === e.target) handleCancel() }} onkeydown={(e) => { if (e.key === 'Escape') handleCancel() }} role="button" tabindex="0">
  <div class="bdc-modal" role="dialog" aria-labelledby="bdc-title">
    <header class="bdc-header">
      <h2 id="bdc-title">批量更换牌组</h2>
      <EnhancedButton variant="secondary" size="sm" onclick={handleCancel}>
        <EnhancedIcon name={ICON_NAMES.CLOSE} size={16} />
      </EnhancedButton>
    </header>

    <main class="bdc-main">
      <!-- 操作类型选择 -->
      <div class="bdc-operation-type">
        <div class="bdc-operation-label">
          <EnhancedIcon name={ICON_NAMES.INFO} size={16} />
          <span>选择操作类型：</span>
        </div>
        <div class="bdc-radio-group">
          <label class="bdc-radio-option" class:selected={operationType === 'move'}>
            <input 
              type="radio" 
              name="operation-type" 
              value="move" 
              bind:group={operationType}
            />
            <div class="bdc-radio-content">
              <EnhancedIcon name={ICON_NAMES.ARROW_RIGHT} size={16} />
              <div>
                <div class="bdc-radio-title">移动</div>
                <div class="bdc-radio-desc">将 {selectedCards.length} 张卡片移动到新牌组</div>
              </div>
            </div>
          </label>
          <label class="bdc-radio-option" class:selected={operationType === 'copy'}>
            <input 
              type="radio" 
              name="operation-type" 
              value="copy" 
              bind:group={operationType}
            />
            <div class="bdc-radio-content">
              <EnhancedIcon name={ICON_NAMES.COPY} size={16} />
              <div>
                <div class="bdc-radio-title">复制</div>
                <div class="bdc-radio-desc">复制 {selectedCards.length} 张卡片到新牌组（保留原卡片）</div>
              </div>
            </div>
          </label>
        </div>
      </div>

      <!-- 搜索框 -->
      <div class="bdc-search">
        <EnhancedIcon name={ICON_NAMES.SEARCH} size={16} />
        <input
          type="text"
          placeholder="搜索牌组..."
          bind:value={searchQuery}
        />
      </div>

      <!-- 牌组列表 -->
      <div class="bdc-deck-list">
        {#each filteredDecks as deck (deck.id)}
          <div
            class="bdc-deck-item"
            class:selected={selectedDeckId === deck.id}
            onclick={() => handleDeckSelect(deck.id)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeckSelect(deck.id); } }}
            role="button"
            tabindex="0"
            aria-label={`选择牌组: ${deck.name}`}
          >
            <div class="bdc-deck-icon">
              <EnhancedIcon name={ICON_NAMES.FOLDER} size={20} />
            </div>
            <div class="bdc-deck-info">
              <div class="bdc-deck-name">{deck.name}</div>
              {#if deck.description}
              <div class="bdc-deck-desc">{deck.description}</div>
              {/if}
            </div>
            {#if selectedDeckId === deck.id}
            <div class="bdc-deck-check">
              <EnhancedIcon name={ICON_NAMES.CHECK_CIRCLE} size={20} />
            </div>
            {/if}
          </div>
        {/each}
        
        {#if filteredDecks.length === 0}
        <div class="bdc-empty">
          <EnhancedIcon name={ICON_NAMES.WARNING} size={24} />
          <p>没有找到匹配的牌组</p>
        </div>
        {/if}
      </div>
    </main>

    <footer class="bdc-footer">
      <EnhancedButton variant="secondary" onclick={handleCancel}>
        取消
      </EnhancedButton>
      <EnhancedButton 
        variant="primary" 
        onclick={handleConfirm}
        disabled={!selectedDeckId}
      >
        {operationType === 'move' ? '确认移动' : '确认复制'}
        <EnhancedIcon name={operationType === 'move' ? ICON_NAMES.ARROW_RIGHT : ICON_NAMES.COPY} size={16} />
      </EnhancedButton>
    </footer>
  </div>
</div>
{/if}

<style>
  .bdc-overlay {
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

  .bdc-modal {
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

  .bdc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .bdc-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .bdc-main {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* ✅ 操作类型选择器样式 */
  .bdc-operation-type {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .bdc-operation-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .bdc-radio-group {
    display: flex;
    gap: 0.75rem;
  }

  .bdc-radio-option {
    flex: 1;
    position: relative;
    cursor: pointer;
  }

  .bdc-radio-option input[type="radio"] {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .bdc-radio-content {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    border: 2px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    background: var(--background-secondary);
    transition: all 0.2s ease;
  }

  .bdc-radio-option:hover .bdc-radio-content {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .bdc-radio-option.selected .bdc-radio-content {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-success);
  }

  .bdc-radio-title {
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
  }

  .bdc-radio-desc {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .bdc-search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
  }

  .bdc-search input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-normal);
    font-size: 0.875rem;
  }

  .bdc-deck-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 200px;
  }

  .bdc-deck-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border: 2px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .bdc-deck-item:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .bdc-deck-item.selected {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-success);
  }

  .bdc-deck-icon {
    color: var(--text-accent);
  }

  .bdc-deck-info {
    flex: 1;
  }

  .bdc-deck-name {
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
  }

  .bdc-deck-desc {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .bdc-deck-check {
    color: var(--color-green);
  }

  .bdc-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    color: var(--text-muted);
    text-align: center;
  }

  .bdc-empty p {
    margin: 0.5rem 0 0 0;
  }

  .bdc-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }
</style>

