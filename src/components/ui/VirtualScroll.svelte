<!--
  虚拟滚动组件
  为大数据集提供高性能的滚动渲染
-->
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    items: any[];
    itemHeight: number;
    containerHeight: number;
    overscan?: number;
    className?: string;
    onScroll?: (scrollTop: number) => void;
    onItemsRendered?: (startIndex: number, endIndex: number) => void;
    children?: any;
  }

  let {
    items = [],
    itemHeight = 50,
    containerHeight = 400,
    overscan = 5,
    className = '',
    onScroll,
    onItemsRendered,
    children
  }: Props = $props();

  // 状态管理
  let scrollContainer: HTMLDivElement;
  let scrollTop = $state(0);
  let isScrolling = $state(false);
  let scrollTimeout: NodeJS.Timeout | null = null;

  // 计算可见范围
  let visibleRange = $derived(() => {
    const totalItems = items.length;
    if (totalItems === 0) {
      return { start: 0, end: 0, visibleItems: [] };
    }

    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(totalItems - 1, startIndex + visibleCount + overscan * 2);

    const visibleItems = items.slice(startIndex, endIndex + 1);

    return {
      start: startIndex,
      end: endIndex,
      visibleItems
    };
  });

  // 总高度
  let totalHeight = $derived(items.length * itemHeight);

  // 偏移量
  let offsetY = $derived(visibleRange().start * itemHeight);

  /**
   * 处理滚动事件
   */
  function handleScroll(event: Event) {
    const target = event.target as HTMLDivElement;
    scrollTop = target.scrollTop;
    
    // 标记正在滚动
    isScrolling = true;
    
    // 清除之前的超时
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
    // 设置滚动结束检测
    scrollTimeout = setTimeout(() => {
      isScrolling = false;
    }, 150);

    // 调用滚动回调
    if (onScroll) {
      onScroll(scrollTop);
    }

    // 调用渲染回调
    if (onItemsRendered) {
      const range = visibleRange();
      onItemsRendered(range.start, range.end);
    }
  }

  /**
   * 滚动到指定索引
   */
  export function scrollToIndex(index: number, align: 'start' | 'center' | 'end' = 'start') {
    if (!scrollContainer) return;

    let targetScrollTop: number;
    
    switch (align) {
      case 'start':
        targetScrollTop = index * itemHeight;
        break;
      case 'center':
        targetScrollTop = index * itemHeight - containerHeight / 2 + itemHeight / 2;
        break;
      case 'end':
        targetScrollTop = index * itemHeight - containerHeight + itemHeight;
        break;
    }

    // 确保在有效范围内
    targetScrollTop = Math.max(0, Math.min(targetScrollTop, totalHeight - containerHeight));
    
    scrollContainer.scrollTop = targetScrollTop;
  }

  /**
   * 滚动到指定位置
   */
  export function scrollTo(scrollTop: number) {
    if (!scrollContainer) return;
    scrollContainer.scrollTop = Math.max(0, Math.min(scrollTop, totalHeight - containerHeight));
  }

  /**
   * 获取当前滚动信息
   */
  export function getScrollInfo() {
    return {
      scrollTop,
      scrollHeight: totalHeight,
      clientHeight: containerHeight,
      isScrolling,
      visibleRange: visibleRange
    };
  }

  // 组件挂载时的初始化
  onMount(() => {
    if (scrollContainer) {
      // 初始化滚动位置
      scrollTop = scrollContainer.scrollTop;
    }
  });

  // 清理定时器
  $effect(() => {
    return () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  });
</script>

<div 
  class="virtual-scroll-container {className}"
  style="height: {containerHeight}px; overflow-y: auto;"
  bind:this={scrollContainer}
  onscroll={handleScroll}
>
  <!-- 总高度占位符 -->
  <div 
    class="virtual-scroll-spacer"
    style="height: {totalHeight}px; position: relative;"
  >
    <!-- 可见项容器 -->
    <div 
      class="virtual-scroll-items"
      style="transform: translateY({offsetY}px); position: absolute; top: 0; left: 0; right: 0;"
    >
      {#each visibleRange().visibleItems as item, index (visibleRange().start + index)}
        <div
          class="virtual-scroll-item"
          style="height: {itemHeight}px;"
          data-index={visibleRange().start + index}
        >
          {@render children?.(item, visibleRange().start + index)}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .virtual-scroll-container {
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .virtual-scroll-container::-webkit-scrollbar {
    width: 8px;
  }

  .virtual-scroll-container::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .virtual-scroll-container::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .virtual-scroll-container::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  .virtual-scroll-spacer {
    position: relative;
  }

  .virtual-scroll-items {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  .virtual-scroll-item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--background-modifier-border);
    transition: background-color 0.1s ease;
  }

  .virtual-scroll-item:hover {
    background-color: var(--background-modifier-hover);
  }

  .virtual-scroll-item:last-child {
    border-bottom: none;
  }

  /* 滚动性能优化 */
  .virtual-scroll-container {
    will-change: scroll-position;
    -webkit-overflow-scrolling: touch;
  }

  .virtual-scroll-items {
    will-change: transform;
  }

  /* 加载状态样式 */
  .virtual-scroll-container.loading {
    pointer-events: none;
  }

  .virtual-scroll-container.loading .virtual-scroll-item {
    opacity: 0.6;
  }

  /* 空状态样式 */
  .virtual-scroll-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .virtual-scroll-container::-webkit-scrollbar {
      width: 4px;
    }
    
    .virtual-scroll-item {
      padding: 0.5rem;
    }
  }
</style>
