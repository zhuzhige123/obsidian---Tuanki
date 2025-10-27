<!--
  虚拟化列表组件
  为大量数据项提供高性能的列表显示
-->
<script lang="ts">
  import VirtualScroll from '../ui/VirtualScroll.svelte';

  interface Props {
    items: any[];
    itemHeight?: number;
    height?: number;
    loading?: boolean;
    emptyText?: string;
    className?: string;
    onItemClick?: (item: any, index: number) => void;
    onScroll?: (scrollTop: number) => void;
  }

  let {
    items = [],
    itemHeight = 60,
    height = 300,
    loading = false,
    emptyText = '暂无数据',
    className = '',
    onItemClick,
    onScroll,
    children
  }: Props = $props();

  // 虚拟滚动实例
  let virtualScroll: any;

  /**
   * 处理项目点击
   */
  function handleItemClick(item: any, index: number) {
    if (onItemClick) {
      onItemClick(item, index);
    }
  }

  /**
   * 滚动到指定项目
   */
  export function scrollToItem(index: number, align: 'start' | 'center' | 'end' = 'start') {
    if (virtualScroll) {
      virtualScroll.scrollToIndex(index, align);
    }
  }

  /**
   * 获取滚动信息
   */
  export function getScrollInfo() {
    return virtualScroll?.getScrollInfo() || null;
  }
</script>

<div class="virtualized-list {className}" class:loading>
  {#if items.length === 0 && !loading}
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <p class="empty-text">{emptyText}</p>
    </div>
  {:else}
    <VirtualScroll
      bind:this={virtualScroll}
      {items}
      {itemHeight}
      containerHeight={height}
      overscan={3}
      className="list-virtual-scroll"
      {onScroll}
    >
      {#snippet children(item, index)}
        <div 
          class="list-item"
          class:clickable={!!onItemClick}
          onclick={() => handleItemClick(item, index)}
        >
          {@render children?.(item, index)}
        </div>
      {/snippet}
    </VirtualScroll>
  {/if}

  <!-- 加载遮罩 -->
  {#if loading}
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <p class="loading-text">加载中...</p>
    </div>
  {/if}
</div>

<style>
  .virtualized-list {
    position: relative;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--background-primary);
  }

  .list-item {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
    transition: background-color 0.1s ease;
    display: flex;
    align-items: center;
    min-height: 60px;
  }

  .list-item:hover {
    background-color: var(--background-modifier-hover);
  }

  .list-item.clickable {
    cursor: pointer;
  }

  .list-item:last-child {
    border-bottom: none;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--text-muted);
  }

  .empty-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    opacity: 0.5;
  }

  .empty-text {
    margin: 0;
    font-size: 0.875rem;
  }

  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(var(--background-primary-rgb), 0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 20;
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--background-modifier-border);
    border-top: 2px solid var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 0.5rem;
  }

  .loading-text {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .list-item {
      padding: 0.5rem 0.75rem;
      min-height: 50px;
    }
  }
</style>
