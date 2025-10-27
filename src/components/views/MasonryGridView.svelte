<!--
  瀑布流网格视图
  使用列式布局实现真正的瀑布流效果
  自动分配卡片到最短的列
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
    onCardClick?: (card: Card) => void;
    onCardEdit?: (card: Card) => void;
    onCardDelete?: (card: Card) => void;
    onCardView?: (card: Card) => void;
    columnCount?: number;
    loading?: boolean;
  }

  let {
    cards,
    selectedCards,
    plugin,
    onCardClick,
    onCardEdit,
    onCardDelete,
    onCardView,
    columnCount = 4,
    loading = false
  }: Props = $props();

  // 状态管理
  let containerElement: HTMLElement;
  let columns = $state<Card[][]>([]);
  let actualColumnCount = $state(columnCount);
  
  // 横向滚动条相关
  let topScrollbar = $state<HTMLDivElement>();
  let bottomScrollbar = $state<HTMLDivElement>();
  let scrollbarContent = $state<HTMLDivElement>();
  let columnsContainer = $state<HTMLDivElement>();
  
  // 防抖和性能优化
  let updateScrollbarRAF: number | null = null;
  let distributeCardsRAF: number | null = null;
  let lastScrollbarWidth = 0;
  
  // ✅ 性能优化：渐进式加载
  const INITIAL_VISIBLE_COUNT = 40;     // 初始显示40张
  const LOAD_MORE_BATCH_SIZE = 30;      // 每次加载30张
  let visibleCount = $state(INITIAL_VISIBLE_COUNT);
  let isLoadingMore = $state(false);
  let sentinel = $state<HTMLElement>();
  let observer: IntersectionObserver | null = null;

  /**
   * 计算响应式列数
   */
  function calculateColumnCount(): number {
    if (!containerElement) return columnCount;
    
    const width = containerElement.clientWidth;
    
    if (width >= 1400) return 4;
    if (width >= 1024) return 3;
    if (width >= 768) return 2;
    return 1;
  }

  /**
   * 计算可见卡片
   */
  const visibleCards = $derived(cards.slice(0, visibleCount));
  const hasMore = $derived(visibleCount < cards.length);
  
  /**
   * 加载更多卡片
   */
  function loadMore() {
    if (isLoadingMore || !hasMore) return;
    
    isLoadingMore = true;
    
    // 使用requestAnimationFrame避免阻塞主线程
    requestAnimationFrame(() => {
      visibleCount = Math.min(visibleCount + LOAD_MORE_BATCH_SIZE, cards.length);
      isLoadingMore = false;
    });
  }
  
  /**
   * 分配卡片到列
   * 使用贪心算法：总是将卡片添加到当前高度最小的列
   * 使用RAF批处理，避免强制回流
   */
  function distributeCards() {
    // 取消之前的RAF
    if (distributeCardsRAF !== null) {
      cancelAnimationFrame(distributeCardsRAF);
    }
    
    // 使用RAF批处理
    distributeCardsRAF = requestAnimationFrame(() => {
      const newColumns: Card[][] = Array.from(
        { length: actualColumnCount },
        () => []
      );
      
      // 只分配可见的卡片
      visibleCards.forEach((card, index) => {
        const columnIndex = index % actualColumnCount;
        newColumns[columnIndex].push(card);
      });
      
      columns = newColumns;
      distributeCardsRAF = null;
    });
  }

  /**
   * 处理窗口大小变化
   */
  function handleResize() {
    const newColumnCount = calculateColumnCount();
    if (newColumnCount !== actualColumnCount) {
      actualColumnCount = newColumnCount;
      distributeCards();
    }
  }

  /**
   * 检查卡片是否被选中
   */
  function isCardSelected(cardId: string): boolean {
    return selectedCards.has(cardId);
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
   * 同步顶部和底部滚动条
   */
  function syncScrollbars(source: 'top' | 'bottom') {
    if (source === 'top' && topScrollbar && bottomScrollbar) {
      bottomScrollbar.scrollLeft = topScrollbar.scrollLeft;
    } else if (source === 'bottom' && topScrollbar && bottomScrollbar) {
      topScrollbar.scrollLeft = bottomScrollbar.scrollLeft;
    }
  }

  /**
   * 更新滚动条宽度
   * 使用RAF和缓存避免频繁读取scrollWidth导致强制回流
   */
  function updateScrollbarWidth() {
    // 取消之前的RAF
    if (updateScrollbarRAF !== null) {
      cancelAnimationFrame(updateScrollbarRAF);
    }
    
    // 使用RAF批处理布局读取
    updateScrollbarRAF = requestAnimationFrame(() => {
      if (columnsContainer && scrollbarContent) {
        const containerWidth = columnsContainer.scrollWidth;
        
        // 🎯 关键：只有宽度真正变化时才更新DOM
        if (Math.abs(containerWidth - lastScrollbarWidth) > 1) {
          lastScrollbarWidth = containerWidth;
          scrollbarContent.style.width = `${containerWidth}px`;
        }
      }
      updateScrollbarRAF = null;
    });
  }

  /**
   * 设置IntersectionObserver
   */
  function setupIntersectionObserver() {
    if (observer) {
      observer.disconnect();
    }
    
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && hasMore && !isLoadingMore) {
            loadMore();
          }
        });
      },
      {
        rootMargin: '400px',  // 提前400px触发
        threshold: 0.1
      }
    );

    if (sentinel) {
      observer.observe(sentinel);
    }
  }
  
  /**
   * 组件挂载
   */
  onMount(() => {
    tick().then(() => {
      actualColumnCount = calculateColumnCount();
      distributeCards();
      
      // 设置滚动加载
      if (hasMore) {
        setupIntersectionObserver();
      }
    });

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
      if (observer) {
        observer.disconnect();
      }
      // 清理RAF
      if (updateScrollbarRAF !== null) {
        cancelAnimationFrame(updateScrollbarRAF);
      }
      if (distributeCardsRAF !== null) {
        cancelAnimationFrame(distributeCardsRAF);
      }
    };
  });

  /**
   * 监听卡片数量和可见数量变化，重新分配列
   * 合并后避免重复调用distributeCards
   */
  $effect(() => {
    const cardCount = cards.length;
    const count = visibleCount;
    
    if (count > 0) {
      distributeCards();
    }
  });
  
  /**
   * 监听hasMore变化，设置Observer
   * 确保只在必要时设置
   */
  $effect(() => {
    const more = hasMore;
    const hasSentinel = !!sentinel;
    
    if (more && hasSentinel) {
      setupIntersectionObserver();
    }
  });

  /**
   * 监听列数、卡片数量和可见数量变化，更新滚动条宽度
   * 合并后避免重复调用updateScrollbarWidth
   */
  $effect(() => {
    const colCount = actualColumnCount;
    const cardCount = cards.length;
    const count = visibleCount;
    
    if (colCount > 0 && count > 0) {
      updateScrollbarWidth();
    }
  });
</script>

<div class="masonry-grid-view" bind:this={containerElement}>
  {#if !loading && cards.length > 0}
    <!-- 顶部横向滚动条 -->
    <div 
      class="masonry-top-scrollbar" 
      bind:this={topScrollbar}
      onscroll={() => syncScrollbars('top')}
    >
      <div class="masonry-scrollbar-content" bind:this={scrollbarContent}></div>
    </div>
  {/if}

  <!-- 主容器 -->
  <div 
    class="masonry-container"
    bind:this={bottomScrollbar}
    onscroll={() => syncScrollbars('bottom')}
  >
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
      <!-- 瀑布流列容器 -->
      <div 
        class="masonry-columns" 
        bind:this={columnsContainer}
        style="--column-count: {actualColumnCount}"
      >
      {#each columns as column, columnIndex (columnIndex)}
        <div class="masonry-column">
          {#each column as card (card.uuid || card.id)}
            <div class="masonry-card-wrapper">
              <LazyGridCard
                {card}
                selected={isCardSelected(card.id)}
                {plugin}
                layoutMode="masonry"
                onClick={handleCardClick}
                onEdit={handleCardEdit}
                onDelete={onCardDelete}
                onView={onCardView}
              />
            </div>
          {/each}
        </div>
      {/each}
      </div>
    
      <!-- 加载更多哨兵 -->
    {#if hasMore}
      <div bind:this={sentinel} class="load-more-sentinel">
        {#if isLoadingMore}
          <div class="loading-indicator">
            <div class="spinner"></div>
            <span>正在加载更多卡片...</span>
          </div>
        {/if}
      </div>
    {/if}
    
      <!-- 性能统计 -->
      {#if cards.length > 0}
        <div class="performance-stats">
          <span class="stats-text">
            已显示 <strong>{visibleCount}</strong> / {cards.length} 张卡片
          </span>
          {#if cards.length > 100}
            <span class="performance-hint">
              <EnhancedIcon name="zap" size={12} />
              提示：固定高度模式性能更佳
            </span>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  @import './styles/grid-common.css';

  /* 外层包装器 */
  .masonry-grid-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--background-primary);
  }

  /* 顶部横向滚动条 */
  .masonry-top-scrollbar {
    overflow-x: scroll;  /* 强制显示滚动条，而不是 auto */
    overflow-y: hidden;
    height: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
  }

  .masonry-top-scrollbar::-webkit-scrollbar {
    height: 12px;
  }

  .masonry-top-scrollbar::-webkit-scrollbar-track {
    background: var(--tuanki-scrollbar-track);
  }

  .masonry-top-scrollbar::-webkit-scrollbar-thumb {
    background: var(--tuanki-scrollbar-thumb);
    border-radius: 4px;
  }

  .masonry-top-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  .masonry-scrollbar-content {
    height: 1px;
    min-width: 100%;
  }

  /* 主容器 */
  .masonry-container {
    flex: 1;
    min-height: 0;
    overflow-x: scroll;  /* 强制显示滚动条，与顶部保持一致 */
    overflow-y: auto;
    padding: var(--tuanki-space-lg);
  }

  /* 自定义滚动条 */
  .masonry-container::-webkit-scrollbar {
    width: 8px;
    height: 12px;
  }

  .masonry-container::-webkit-scrollbar-track {
    background: var(--tuanki-scrollbar-track);
    border-radius: 4px;
  }

  .masonry-container::-webkit-scrollbar-thumb {
    background: var(--tuanki-scrollbar-thumb);
    border-radius: 4px;
  }

  .masonry-container::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  /* 瀑布流列容器 */
  .masonry-columns {
    display: flex;
    gap: var(--tuanki-space-lg);
    align-items: flex-start;
    min-width: fit-content;
  }

  .masonry-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-space-lg);
  }

  .masonry-card-wrapper {
    break-inside: avoid;
  }


  /* 响应式 */
  @media (max-width: 1023px) {
    .masonry-container {
      padding: var(--tuanki-space-md);
    }

    .masonry-columns {
      gap: var(--tuanki-space-md);
    }

    .masonry-column {
      gap: var(--tuanki-space-md);
    }
  }

  @media (max-width: 767px) {
    .masonry-container {
      padding: var(--tuanki-space-sm);
    }

    .masonry-columns {
      gap: var(--tuanki-space-sm);
    }

    .masonry-column {
      gap: var(--tuanki-space-sm);
    }
  }

  /* 加载更多哨兵 */
  .load-more-sentinel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--tuanki-space-xl) var(--tuanki-space-lg);
    min-height: 80px;
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-md);
    color: var(--tuanki-text-secondary);
    font-size: var(--tuanki-font-size-sm);
  }


  /* 性能统计 */
  .performance-stats {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--tuanki-space-sm);
    padding: var(--tuanki-space-md);
    margin-top: var(--tuanki-space-lg);
    background: var(--background-secondary);
    border-radius: var(--tuanki-radius-md);
    border: 1px solid var(--tuanki-border);
  }

  .stats-text {
    font-size: var(--tuanki-font-size-sm);
    color: var(--tuanki-text-secondary);
  }

  .stats-text strong {
    color: var(--tuanki-text-primary);
    font-weight: 600;
  }

  .performance-hint {
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-xs);
    font-size: var(--tuanki-font-size-xs);
    color: var(--tuanki-accent-color);
  }

</style>

