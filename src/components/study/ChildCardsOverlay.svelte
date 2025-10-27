<script lang="ts">
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import ChildCardMini from './ChildCardMini.svelte';
  import type { Card } from '../../data/types';

  interface Props {
    childCards: Card[];
  }

  let { childCards }: Props = $props();

  // 选中的卡片ID集合
  let selectedCardIds = $state(new Set<string>());

  // 切换卡片选中状态
  function toggleCardSelection(cardId: string) {
    if (selectedCardIds.has(cardId)) {
      selectedCardIds.delete(cardId);
    } else {
      selectedCardIds.add(cardId);
    }
    selectedCardIds = new Set(selectedCardIds); // 触发响应式更新
  }

  // 暴露选中的卡片ID供父组件使用
  export function getSelectedCardIds(): string[] {
    return Array.from(selectedCardIds);
  }

  // 清空选中状态
  export function clearSelection() {
    selectedCardIds.clear();
    selectedCardIds = new Set(selectedCardIds);
  }
</script>

{#if childCards.length > 0}
  <div 
    class="child-cards-overlay"
    transition:slide={{ duration: 300, easing: cubicOut }}
  >
    <div class="child-cards-scroll-container">
      {#each childCards as card, i}
        <ChildCardMini 
          {card}
          index={i}
          selected={selectedCardIds.has(card.id)}
          onclick={() => toggleCardSelection(card.id)}
        />
      {/each}
    </div>
  </div>
{/if}

<style>
  .child-cards-overlay {
    position: absolute;
    bottom: 140px; /* 在统一操作栏上方 */
    left: 0;
    right: 0;
    
    height: 360px; /* 固定高度，足以显示完整内容 */
    
    /* 完全透明背景 */
    background: transparent;
    border: none;
    box-shadow: none;
    
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem 3rem;
    
    z-index: 100;
    overflow: visible;
  }

  .child-cards-scroll-container {
    display: flex;
    justify-content: center; /* 居中显示，卡片向中间聚拢 */
    gap: 1rem;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.5rem 0 1rem;
    flex: 1;
    
    /* 优雅滚动条 */
    scrollbar-width: thin;
    scrollbar-color: rgba(76, 175, 80, 0.25) transparent;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
  }

  .child-cards-scroll-container::-webkit-scrollbar {
    height: 5px;
  }

  .child-cards-scroll-container::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.03);
    border-radius: 2.5px;
  }

  .child-cards-scroll-container::-webkit-scrollbar-thumb {
    background: rgba(76, 175, 80, 0.25);
    border-radius: 2.5px;
    transition: background 0.2s ease;
  }

  .child-cards-scroll-container::-webkit-scrollbar-thumb:hover {
    background: rgba(76, 175, 80, 0.4);
  }
</style>

