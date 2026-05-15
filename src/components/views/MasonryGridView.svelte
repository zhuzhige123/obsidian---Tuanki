<!--
  瀑布流网格视图
  使用列式布局实现真正的瀑布流效果
  自动分配卡片到最短的列
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Card } from '../../data/types';
  import type { WeavePlugin } from '../../main';
  import LazyGridCard from '../cards/LazyGridCard.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';

  type GridCardAttributeType = 'none' | 'uuid' | 'source' | 'priority' | 'retention' | 'modified' | 'accuracy' | 'question_type' | 'ir_state' | 'ir_priority';
  
  interface Props {
    cards: Card[];
    selectedCards: Set<string>;
    focusedCards?: Set<string>;
    plugin: WeavePlugin;
    attributeType?: GridCardAttributeType;
    isMobile?: boolean; // 移动端状态
    onCardClick?: (card: Card) => void;
    onCardEdit?: (card: Card) => void;
    onCardDelete?: (card: Card) => void;
    onCardView?: (card: Card) => void;
    onCardConvertToMarkdown?: (card: Card) => void;
    onSourceJump?: (card: Card) => void; // 源文档跳转
    onCardLongPress?: (card: Card) => void; // 长按触发多选
    columnCount?: number;
    loading?: boolean;
  }

  let {
    cards,
    selectedCards,
    focusedCards = new Set<string>(),
    plugin,
    attributeType = 'uuid',
    isMobile = false,
    onCardClick,
    onCardEdit,
    onCardDelete,
    onCardView,
    onCardConvertToMarkdown,
    onSourceJump,
    onCardLongPress,
    columnCount = 4,
    loading = false
  }: Props = $props();

  // 状态管理
  let containerElement: HTMLElement;
  let columns = $state<Card[][]>([]);
  let actualColumnCount = $state(untrack(() => columnCount));
  
  // 横向滚动条相关
  let topScrollbar = $state<HTMLDivElement>();
  let bottomScrollbar = $state<HTMLDivElement>();
  let scrollbarContent = $state<HTMLDivElement>();
  let columnsContainer = $state<HTMLDivElement>();
  
  // 防抖和性能优化
  let updateScrollbarRAF: number | null = null;
  let distributeCardsRAF: number | null = null;
  let lastScrollbarWidth = 0;
  let lastContainerWidth = 0;
  let resizeRAF: number | null = null;
  
  //  性能优化：渐进式加载
  const INITIAL_VISIBLE_COUNT = 40;     // 初始显示40张
  const LOAD_MORE_BATCH_SIZE = 30;      // 每次加载30张
  let visibleCount = $state(INITIAL_VISIBLE_COUNT);
  let isLoadingMore = $state(false);
  let sentinel = $state<HTMLElement>();
  let observer: IntersectionObserver | null = null;

  // 渲染状态检测
  const RENDERING_OVERLAY_THRESHOLD = 30;
  let isRendering = $state(false);
  let renderingProgress = $derived(
    cards.length > 0 ? Math.round((visibleCount / cards.length) * 100) : 0
  );

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
   * 使用轮询分配：按索引依次分配到各列
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
   * 设置 ResizeObserver 监听容器宽度
   */
  function setupResizeObserver(): ResizeObserver | null {
    if (!containerElement) return null;

    const resizeObserver = new ResizeObserver((entries) => {
      if (resizeRAF !== null) {
        cancelAnimationFrame(resizeRAF);
      }
      resizeRAF = requestAnimationFrame(() => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          if (Math.abs(width - lastContainerWidth) < 10) return;
          lastContainerWidth = width;
          const newColumnCount = calculateColumnCount();
          if (newColumnCount !== actualColumnCount) {
            actualColumnCount = newColumnCount;
            distributeCards();
          }
        }
        resizeRAF = null;
      });
    });

    resizeObserver.observe(containerElement);
    return resizeObserver;
  }

  /**
   * 检查卡片是否被选中
   */
  function isCardSelected(cardId: string): boolean {
    return selectedCards.has(cardId);
  }

  function isCardFocused(cardId: string): boolean {
    return focusedCards.has(cardId);
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
        
        //  关键：只有宽度真正变化时才更新DOM
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
    let resizeObserver: ResizeObserver | null = null;

    tick().then(() => {
      actualColumnCount = calculateColumnCount();
      distributeCards();
      
      // 设置滚动加载
      if (hasMore) {
        setupIntersectionObserver();
      }

      // 使用 ResizeObserver 监听容器宽度变化（侧边栏展开/收起等）
      resizeObserver = setupResizeObserver();
    });

    // 清理函数
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (observer) {
        observer.disconnect();
      }
      if (updateScrollbarRAF !== null) {
        cancelAnimationFrame(updateScrollbarRAF);
      }
      if (distributeCardsRAF !== null) {
        cancelAnimationFrame(distributeCardsRAF);
      }
      if (resizeRAF !== null) {
        cancelAnimationFrame(resizeRAF);
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

  // 渲染状态检测：卡片数据变化时显示遮罩
  $effect(() => {
    const totalCards = cards.length;
    if (totalCards >= RENDERING_OVERLAY_THRESHOLD) {
      isRendering = true;
      tick().then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isRendering = false;
          });
        });
      });
    } else {
      isRendering = false;
    }
  });
</script>

<div class="masonry-grid-view" bind:this={containerElement}>
    <!-- 渲染进度遮罩 -->
    {#if isRendering && !loading}
      <div class="weave-rendering-overlay"></div>
      <div class="weave-rendering-progress-container">
        {#if renderingProgress < 100}
          <div class="weave-rendering-progress-bar" style="width: {renderingProgress}%"></div>
        {:else}
          <div class="weave-rendering-progress-bar weave-rendering-progress-bar--indeterminate"></div>
        {/if}
      </div>
      <div class="weave-rendering-info">
        <div class="weave-spinner-small"></div>
        <span>{Math.min(visibleCount, cards.length)} / {cards.length} 张卡片</span>
      </div>
    {/if}

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
        <div class="weave-loading-state">
          <div class="weave-spinner"></div>
          <p>加载中...</p>
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
            {#each column as card, cardIdx (card.uuid || `__idx_${columnIndex}_${cardIdx}`)}
              <div class="masonry-card-wrapper" data-card-index={columnIndex * 100 + cardIdx}>
                <LazyGridCard
                  {card}
                  selected={isCardSelected(card.uuid)}
                  emphasized={isCardFocused(card.uuid)}
                  {plugin}
                  layoutMode="masonry"
                  {attributeType}
                  {isMobile}
                  onClick={handleCardClick}
                  onEdit={handleCardEdit}
                  onDelete={onCardDelete}
                  onView={onCardView}
                  onConvertToMarkdown={onCardConvertToMarkdown}
                  onSourceJump={onSourceJump}
                  onLongPress={onCardLongPress}
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
              <div class="weave-spinner"></div>
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

  /* 内容区 */
  .masonry-grid-view {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    background: var(--background-primary);
  }

  /* 顶部横向滚动条 */
  .masonry-top-scrollbar {
    overflow-x: auto;
    overflow-y: hidden;
    height: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
  }

  .masonry-scrollbar-content {
    height: 1px;
    min-width: 100%;
  }

  /* 主容器 */
  .masonry-container {
    flex: 1;
    min-height: 0;
    overflow-x: auto;
    overflow-y: auto;
    padding: var(--weave-space-lg);
  }

  /* 瀑布流列容器 */
  .masonry-columns {
    display: flex;
    gap: var(--weave-space-lg);
    align-items: flex-start;
    min-width: fit-content;
  }

  .masonry-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--weave-space-lg);
  }

  .masonry-card-wrapper {
    break-inside: avoid;
  }


  /* 响应式 */
  @media (max-width: 1023px) {
    .masonry-container {
      padding: var(--weave-space-md);
    }

    .masonry-columns {
      gap: var(--weave-space-md);
    }

    .masonry-column {
      gap: var(--weave-space-md);
    }
  }

  @media (max-width: 767px) {
    .masonry-container {
      padding: var(--weave-space-sm);
    }

    .masonry-columns {
      gap: var(--weave-space-sm);
    }

    .masonry-column {
      gap: var(--weave-space-sm);
    }
  }

  /* 加载更多哨兵 */
  .load-more-sentinel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--weave-space-xl) var(--weave-space-lg);
    min-height: 80px;
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    gap: var(--weave-space-md);
    color: var(--weave-text-secondary);
    font-size: var(--weave-font-size-sm);
  }


  /* 性能统计 */
  .performance-stats {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--weave-space-sm);
    padding: var(--weave-space-md);
    margin-top: var(--weave-space-lg);
    background: var(--background-secondary);
    border-radius: var(--weave-radius-md);
    border: 1px solid var(--weave-border);
  }

  .stats-text {
    font-size: var(--weave-font-size-sm);
    color: var(--weave-text-secondary);
  }

  .stats-text strong {
    color: var(--weave-text-primary);
    font-weight: 600;
  }

  .performance-hint {
    display: flex;
    align-items: center;
    gap: var(--weave-space-xs);
    font-size: var(--weave-font-size-xs);
    color: var(--weave-accent-color);
  }

</style>
