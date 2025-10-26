<!--
  网格视图主容器
  支持固定高度和瀑布流两种布局模式
  根据卡片数量自动选择渲染策略
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Card } from '../../data/types';
  import type AnkiPlugin from '../../main';
  import LazyGridCard from '../cards/LazyGridCard.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';

  interface Props {
    cards: Card[];
    selectedCards: Set<string>;
    plugin: AnkiPlugin;
    layoutMode?: 'fixed' | 'masonry';
    onCardClick?: (card: Card) => void;
    onCardEdit?: (card: Card) => void;
    onCardDelete?: (card: Card) => void;
    onCardView?: (card: Card) => void;
    loading?: boolean;
  }

  let {
    cards,
    selectedCards,
    plugin,
    layoutMode = 'fixed',
    onCardClick,
    onCardEdit,
    onCardDelete,
    onCardView,
    loading = false
  }: Props = $props();

  // 状态管理
  let scrollContainer: HTMLElement;
  let gridContainer = $state<HTMLElement>();
  let visibleCount = $state(30); // 初始显示30张卡片
  let isLoadingMore = $state(false);
  let sentinel = $state<HTMLElement>(); // 哨兵元素，用于触发加载更多
  let observer: IntersectionObserver | null = null;
  let columnCount = $state(4); // 响应式列数，默认4列
  
  // 性能优化：缓存上次的容器宽度
  let lastContainerWidth = 0;

  // 计算属性
  const shouldUseVirtualScroll = $derived(cards.length > 100); // ✅ 从300降低到100
  const visibleCards = $derived(
    shouldUseVirtualScroll ? cards : cards.slice(0, visibleCount)
  );
  const hasMore = $derived(!shouldUseVirtualScroll && visibleCount < cards.length);

  /**
   * 加载更多卡片
   */
  function loadMore() {
    if (isLoadingMore || !hasMore) return;
    
    isLoadingMore = true;
    
    // 模拟异步加载
    setTimeout(() => {
      visibleCount = Math.min(visibleCount + 30, cards.length);
      isLoadingMore = false;
    }, 100);
  }

  /**
   * 设置 Intersection Observer
   */
  function setupIntersectionObserver() {
    if (shouldUseVirtualScroll) return; // 虚拟滚动模式不需要

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && hasMore && !isLoadingMore) {
            loadMore();
          }
        });
      },
      {
        root: scrollContainer,
        rootMargin: '200px', // 提前200px触发加载
        threshold: 0.1
      }
    );

    if (sentinel) {
      observer.observe(sentinel);
    }
  }

  /**
   * 处理卡片点击
   */
  function handleCardClick(card: Card) {
    onCardClick?.(card);
  }

  /**
   * 处理卡片编辑
   */
  function handleCardEdit(card: Card) {
    onCardEdit?.(card);
  }

  /**
   * 检查卡片是否被选中
   */
  function isCardSelected(cardId: string): boolean {
    return selectedCards.has(cardId);
  }

  /**
   * 更新列数基于容器宽度
   * 添加阈值检查，避免微小变化导致频繁更新
   */
  function updateColumnCount(width: number) {
    // 🎯 关键：只有宽度变化超过阈值才更新
    if (Math.abs(width - lastContainerWidth) < 10) {
      return;
    }
    
    lastContainerWidth = width;
    
    // 根据容器宽度动态计算列数
    // 每列最小宽度约300px，加上间隙
    let newColumnCount: number;
    if (width >= 1400) {
      newColumnCount = 4; // 超宽屏：4列
    } else if (width >= 1024) {
      newColumnCount = 3; // 大屏：3列
    } else if (width >= 768) {
      newColumnCount = 2; // 平板：2列
    } else {
      newColumnCount = 1; // 移动端：1列
    }
    
    // 只有列数真正变化时才更新
    if (newColumnCount !== columnCount) {
      columnCount = newColumnCount;
    }
  }

  /**
   * 设置 ResizeObserver 监听容器宽度
   * 使用RAF批处理，避免强制回流
   */
  function setupResizeObserver() {
    if (!gridContainer) {
      return null;
    }

    let resizeRAF: number | null = null;

    const resizeObserver = new ResizeObserver((entries) => {
      // 取消之前的RAF
      if (resizeRAF !== null) {
        cancelAnimationFrame(resizeRAF);
      }
      
      // 使用RAF批处理布局读取
      resizeRAF = requestAnimationFrame(() => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          updateColumnCount(width);
        }
        resizeRAF = null;
      });
    });

    resizeObserver.observe(gridContainer);
    
    // 初始化列数（使用RAF）
    requestAnimationFrame(() => {
      if (gridContainer) {
        const initialWidth = gridContainer.clientWidth;
        updateColumnCount(initialWidth);
      }
    });

    return resizeObserver;
  }

  /**
   * 组件挂载
   */
  onMount(() => {
    let resizeObserver: ResizeObserver | null = null;
    
    // 先等待DOM渲染
    tick().then(() => {
      setupIntersectionObserver();
      
      // 确保gridContainer已绑定后再设置ResizeObserver
      setTimeout(() => {
        resizeObserver = setupResizeObserver();
      }, 100);
    });
    
    // 清理函数
    return () => {
      if (observer) {
        observer.disconnect();
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  });

  /**
   * 监听卡片数量变化，重置可见数量
   */
  $effect(() => {
    if (!shouldUseVirtualScroll) {
      visibleCount = Math.min(30, cards.length);
    }
  });
</script>

<div class="grid-view" bind:this={scrollContainer}>
  {#if loading}
    <!-- 加载状态 -->
    <div class="loading-state">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>
  {:else if cards.length === 0}
    <!-- 空状态 -->
    <div class="empty-state">
      <EnhancedIcon name="inbox" size={48} />
      <h3>暂无卡片</h3>
      <p>请添加卡片或调整筛选条件</p>
    </div>
  {:else}
    <!-- 网格容器 -->
    <div 
      bind:this={gridContainer}
      class="grid-container"
      class:fixed-layout={layoutMode === 'fixed'}
      class:masonry-layout={layoutMode === 'masonry'}
      style="--column-count: {columnCount}"
    >
      {#each visibleCards as card (card.uuid || card.id)}
        <LazyGridCard
          {card}
          selected={isCardSelected(card.id)}
          {plugin}
          {layoutMode}
          onClick={handleCardClick}
          onEdit={handleCardEdit}
          onDelete={onCardDelete}
          onView={onCardView}
        />
      {/each}
    </div>

    <!-- 加载更多哨兵 -->
    {#if !shouldUseVirtualScroll && hasMore}
      <div bind:this={sentinel} class="load-more-sentinel">
        {#if isLoadingMore}
          <div class="loading-more">
            <div class="spinner-small"></div>
            <span>加载更多...</span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- 性能提示 -->
    {#if shouldUseVirtualScroll}
      <div class="performance-hint">
        <EnhancedIcon name="zap" size={14} />
        <span>已启用虚拟滚动优化（{cards.length} 张卡片）</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  @import './styles/grid-common.css';

  .grid-view {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--tuanki-space-lg);
    background: var(--background-primary);
  }

  /* 网格容器 - 使用CSS变量动态控制列数 */
  .grid-container {
    display: grid;
    gap: var(--tuanki-space-lg);
    width: 100%;
    --column-count: 4; /* 默认4列，通过JS动态更新 */
  }

  /* 固定高度布局 */
  .grid-container.fixed-layout {
    grid-template-columns: repeat(var(--column-count), 1fr);
    grid-auto-rows: 280px;
  }

  /* 瀑布流布局 */
  .grid-container.masonry-layout {
    grid-template-columns: repeat(var(--column-count), 1fr);
    grid-auto-rows: auto;
  }

  /* 响应式内边距调整 */
  @media (max-width: 1023px) {
    .grid-view {
      padding: var(--tuanki-space-md);
    }
  }

  @media (max-width: 767px) {
    .grid-view {
      padding: var(--tuanki-space-sm);
    }
    
    .grid-container {
      gap: var(--tuanki-space-md);
    }
  }


  /* 加载更多 */
  .load-more-sentinel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--tuanki-space-lg);
    min-height: 60px;
  }

  .loading-more {
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-sm);
    color: var(--tuanki-text-secondary);
    font-size: var(--tuanki-font-size-sm);
  }

  /* 性能提示 */
  .performance-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--tuanki-space-xs);
    padding: var(--tuanki-space-md);
    margin-top: var(--tuanki-space-md);
    background: var(--background-secondary);
    border-radius: var(--tuanki-radius-md);
    color: var(--tuanki-text-secondary);
    font-size: var(--tuanki-font-size-xs);
  }

</style>

