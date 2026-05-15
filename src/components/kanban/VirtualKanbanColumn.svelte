<script lang="ts">
  import { logger } from '../../utils/logger';

  /**
   * 虚拟看板列组件
   * 
   * 实现列内虚拟滚动，支持动态高度测量和拖拽功能
   */
  import { createVirtualizer } from '@tanstack/svelte-virtual';
  import { onMount, tick, untrack } from 'svelte';
  
  import type { Card } from '../../data/types';
  import type { KanbanVirtualizationConfig } from '../../types/virtualization-types';
  import type { CardRenderMode } from '../../types/card-render-types';
  import type { LayoutMode } from '../../utils/card-height-estimator';
  import type { WeavePlugin } from '../../main';
  
  import { estimateCardHeight } from '../../utils/card-height-estimator';
  import { HeightCacheService } from '../../services/height-cache-service';
  import VirtualCardWrapper from './VirtualCardWrapper.svelte';
  
  interface Props {
    /** 卡片数组 */
    cards: Card[];
    /** 分组键值 */
    groupKey: string;
    /** 列配置 */
    columnConfig: KanbanVirtualizationConfig;
    focusedCardUUIDs?: string[];
    interactionMode?: 'selection' | 'action';
    /** 卡片选择回调 */
    onCardSelect?: (card: Card) => void;
    /** 卡片编辑回调 */
    onCardEdit?: (card: Card) => void;
    /** 卡片更新回调 */
    onCardUpdate?: (card: Card) => void;
    /** 卡片删除回调 */
    onCardDelete?: (cardId: string) => void;
    /** 插件实例 */
    plugin?: WeavePlugin;
    /** 布局模式 */
    layoutMode?: LayoutMode;
    /**  是否允许拖拽卡片 */
    isDraggable?: boolean;
  }
  
  let {
    cards,
    groupKey,
    columnConfig,
    focusedCardUUIDs = [],
    interactionMode = 'selection',
    onCardSelect,
    onCardEdit,
    onCardUpdate,
    onCardDelete,
    plugin,
    layoutMode = 'comfortable',
    isDraggable = true
  }: Props = $props();
  
  // 状态管理
  let scrollElement: HTMLElement | undefined = $state();
  let heightCache: HeightCacheService;
  let draggingCardId: string | null = $state(null);
  let hoveredCardId: string | null = $state(null);
  let selectedCards = $state(new Set<string>());
  let focusedCardSet = $derived(new Set(focusedCardUUIDs));
  
  // 初始化高度缓存
  heightCache = untrack(() => new HeightCacheService(columnConfig.overscan * 50)); // 动态缓存大小
  
  // 创建虚拟化器
  //  使用 $state：因为 virtualizer 变量会被重新赋值（null -> object -> null）
  //  使用 $derived：响应式访问 TanStack Virtual 内部状态
  // 两层响应式协同工作：变量层($state) + 对象层(TanStack响应式)
  let virtualizer: any = $state(null);
  
  // 追踪上次的卡片数量，用于去重
  let lastCardCount = $state(0);
  
  /**
   * 初始化虚拟化器
   * 
   * 创建 TanStack Virtual 实例并配置测量逻辑
   */
  function initializeVirtualizer(): void {
    if (!scrollElement) {
      logger.warn('[VirtualKanbanColumn] scrollElement 未就绪，跳过初始化');
      return;
    }
    
    if (cards.length === 0) {
      logger.warn('[VirtualKanbanColumn] 卡片列表为空，跳过初始化');
      return;
    }
    
    try {
      virtualizer = createVirtualizer({
        count: cards.length,
        getScrollElement: () => scrollElement!,
        estimateSize: (index) => estimateCardSize(index),
        overscan: columnConfig.overscan,
        // 动态高度测量
        measureElement: (element) => {
          // 测量实际 DOM 元素高度
          const height = element.getBoundingClientRect().height;
          // 缓存高度
          const dataIndex = element.getAttribute('data-index');
          if (dataIndex) {
            const card = cards[parseInt(dataIndex)];
            if (card) {
              heightCache.set(card.uuid, height);
            }
          }
          return height;
        }
      });
      
      lastCardCount = cards.length;
      logger.debug(`[VirtualKanbanColumn] 虚拟化器初始化成功: ${cards.length} 张卡片`);
    } catch (error) {
      logger.error('[VirtualKanbanColumn] 虚拟化器初始化失败:', error);
      virtualizer = null;
    }
  }
  
  // 监听 cards 数量变化，仅在数量真正改变时更新
  // 使用 $effect.pre 确保在渲染前更新，避免闪烁
  $effect.pre(() => {
    // 只读取 cards.length 作为依赖
    const currentCount = cards.length;
    
    // 防止无限循环：只在数量真正变化且 virtualizer 已存在时更新
    if (virtualizer && currentCount !== lastCardCount && currentCount > 0) {
      logger.debug(`[VirtualKanbanColumn] 卡片数量变化: ${lastCardCount} -> ${currentCount}`);
      initializeVirtualizer();
    }
  });
  
  // 虚拟项目列表 - 使用 $derived.by 来安全访问
  const virtualItems = $derived.by(() => {
    if (!virtualizer) return [];
    try {
      return virtualizer.getVirtualItems();
    } catch (e) {
      logger.warn('Failed to get virtual items:', e);
      return [];
    }
  });
  
  // 总高度
  const totalSize = $derived.by(() => {
    if (!virtualizer) return 0;
    try {
      return virtualizer.getTotalSize();
    } catch (e) {
      logger.warn('Failed to get total size:', e);
      return 0;
    }
  });
  
  /**
   * 估算卡片高度
   * 
   * 优先使用缓存，否则调用估算函数
   */
  function estimateCardSize(index: number): number {
    const card = cards[index];
    if (!card) return columnConfig.estimatedItemSize;
    
    // 检查缓存
    const cached = heightCache.get(card.uuid);
    if (cached !== null) {
      return cached;
    }
    
    // 使用估算函数
    return estimateCardHeight(card, layoutMode, true);
  }
  
  /**
   * 更新高度缓存
   */
  function updateHeightCache(cardId: string, height: number): void {
    heightCache.set(cardId, height);
    
    // 触发虚拟化器重新测量
    if (virtualizer) {
      virtualizer.measure();
    }
  }
  
  /**
   * 获取卡片渲染模式
   * 
   * 根据卡片在视口中的位置决定渲染模式
   */
  function getCardRenderMode(index: number): CardRenderMode {
    if (!virtualizer) return 'skeleton';
    
    const virtualItems = virtualizer.getVirtualItems();
    const visibleIndices = new Set(virtualItems.map((item: any) => item.index));
    
    // 在可见范围内：完整渲染
    if (visibleIndices.has(index)) {
      return 'full';
    }
    
    // 在 overscan 范围内：骨架屏
    const overscanStart = Math.max(0, virtualItems[0]?.index - columnConfig.overscan);
    const overscanEnd = virtualItems[virtualItems.length - 1]?.index + columnConfig.overscan;
    
    if (index >= overscanStart && index <= overscanEnd) {
      return 'skeleton';
    }
    
    // 其他：占位符
    return 'placeholder';
  }
  
  /**
   * 处理卡片点击
   */
  function handleCardClick(card: Card): void {
    if (interactionMode === 'action') {
      onCardSelect?.(card);
      return;
    }

    // 切换选中状态
    if (selectedCards.has(card.uuid)) {
      selectedCards.delete(card.uuid);
    } else {
      selectedCards.add(card.uuid);
    }
    selectedCards = new Set(selectedCards);
  }
  
  /**
   * 处理卡片双击
   */
  function handleCardDoubleClick(card: Card): void {
    if (onCardEdit) {
      onCardEdit(card);
    }
  }

  $effect(() => {
    if (interactionMode === 'action' && selectedCards.size > 0) {
      selectedCards = new Set();
    }
  });
  
  /**
   * 拖拽处理：开始
   */
  function handleVirtualDragStart(cardId: string): void {
    draggingCardId = cardId;
  }
  
  /**
   * 拖拽处理：结束
   */
  function handleVirtualDragEnd(): void {
    draggingCardId = null;
  }
  
  /**
   * 判断是否应保持在 DOM
   * 
   * 拖拽中的卡片必须保持在 DOM 中
   */
  function shouldKeepInDOM(cardId: string): boolean {
    return draggingCardId === cardId;
  }
  
  /**
   * 处理卡片悬停
   */
  function handleCardHover(cardId: string): void {
    hoveredCardId = cardId;
  }
  
  /**
   * 处理卡片离开
   */
  function handleCardLeave(): void {
    hoveredCardId = null;
  }
  
  // 组件挂载
  onMount(() => {
    logger.debug(`[VirtualKanbanColumn] 挂载列 ${groupKey}，卡片数: ${cards.length}`);
    
    // 等待 DOM 元素绑定完成
    tick().then(() => {
      if (scrollElement && cards.length > 0) {
        initializeVirtualizer();
      } else {
        logger.warn('[VirtualKanbanColumn] 初始化条件不满足:', {
          hasScrollElement: !!scrollElement,
          cardCount: cards.length
        });
      }
    });
    
    // 清理函数
    return () => {
      heightCache.clear();
      logger.debug(`[VirtualKanbanColumn] 清理列 ${groupKey}`);
    };
  });
</script>

<div
  bind:this={scrollElement}
  class="virtual-kanban-column-scroll"
  style="height: 100%; max-height: 100%; overflow-y: auto; overflow-x: hidden;"
>
  {#if virtualizer}
    <!-- 虚拟滚动容器 -->
    <div
      class="virtual-column-container"
      style="
        height: {totalSize}px;
        width: 100%;
        position: relative;
      "
    >
      <!-- 渲染虚拟项目 -->
      {#each virtualItems as virtualRow (virtualRow.key)}
        {@const card = cards[virtualRow.index]}
        {@const renderMode = getCardRenderMode(virtualRow.index)}
        {@const isSelected = selectedCards.has(card.uuid)}
        {@const isFocused = focusedCardSet.has(card.uuid)}
        {@const isHovered = hoveredCardId === card.uuid}
        {@const isDragging = draggingCardId === card.uuid}
        
        <div
          data-index={virtualRow.index}
          data-card-id={card.uuid}
          class="virtual-card-item"
          class:dragging={isDragging}
          role="listitem"
          style="
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            transform: translateY({virtualRow.start}px);
          "
          draggable={isDraggable}
          ondragstart={(e) => {
            if (!isDraggable) return;
            handleVirtualDragStart(card.uuid);
            // 设置拖拽数据（供父组件处理）
            if (e.dataTransfer) {
              e.dataTransfer.setData('application/x-weave-kanban-card', card.uuid);
              e.dataTransfer.effectAllowed = 'move';
            }
          }}
          ondragend={() => handleVirtualDragEnd()}
          onmouseenter={() => handleCardHover(card.uuid)}
          onmouseleave={() => handleCardLeave()}
        >
          <VirtualCardWrapper
            {card}
            {renderMode}
            estimatedHeight={estimateCardSize(virtualRow.index)}
            onHeightMeasured={(height) => updateHeightCache(card.uuid, height)}
            {layoutMode}
            {plugin}
            selected={isSelected}
            emphasized={isFocused}
            hovered={isHovered}
            onClick={() => handleCardClick(card)}
            onDoubleClick={() => handleCardDoubleClick(card)}
          />
        </div>
      {/each}
    </div>
  {:else}
    <!-- 加载状态 -->
    <div class="virtual-column-loading">
      <p>初始化虚拟滚动...</p>
    </div>
  {/if}
</div>

<style>
  .virtual-kanban-column-scroll {
    position: relative;
    -webkit-overflow-scrolling: touch;
    max-height: 100%; /* 防御性高度约束 */
  }
  
  .virtual-kanban-column-scroll::-webkit-scrollbar {
    width: 8px;
  }
  
  .virtual-kanban-column-scroll::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }
  
  .virtual-kanban-column-scroll::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }
  
  .virtual-kanban-column-scroll::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }
  
  .virtual-column-container {
    will-change: transform;
  }
  
  .virtual-card-item {
    padding: 0 0.5rem 0.5rem 0.5rem;
  }
  
  .virtual-card-item.dragging {
    opacity: 0.6;
    transform: rotate(3deg) scale(1.02);
    z-index: var(--weave-z-overlay);
  }
  
  .virtual-column-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  
  /* 性能优化 */
  .virtual-column-container {
    contain: layout style paint;
  }
  
  .virtual-card-item {
    will-change: transform;
  }
</style>

