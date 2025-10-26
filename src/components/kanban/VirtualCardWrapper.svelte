<script lang="ts">
  /**
   * 虚拟卡片包装器组件
   * 
   * 根据渲染模式显示不同内容，处理高度测量
   */
  import { onMount } from 'svelte';
  import type { Card } from '../../data/types';
  import type { CardRenderMode } from '../../types/card-render-types';
  import { DEFAULT_SKELETON_CONFIG } from '../../types/card-render-types';
  import type { LayoutMode } from '../../utils/card-height-estimator';
  import type AnkiPlugin from '../../main';
  
  import CardSkeleton from './CardSkeleton.svelte';
  import MarkdownRenderer from '../atoms/MarkdownRenderer.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  
  interface Props {
    /** 卡片数据 */
    card: Card;
    /** 渲染模式 */
    renderMode: CardRenderMode;
    /** 估算高度 */
    estimatedHeight: number;
    /** 高度测量回调 */
    onHeightMeasured?: (height: number) => void;
    /** 布局模式 */
    layoutMode?: LayoutMode;
    /** 插件实例（用于 Markdown 渲染） */
    plugin?: AnkiPlugin;
    /** 是否选中 */
    selected?: boolean;
    /** 是否悬停 */
    hovered?: boolean;
    /** 点击回调 */
    onClick?: () => void;
    /** 双击回调 */
    onDoubleClick?: () => void;
  }
  
  let {
    card,
    renderMode,
    estimatedHeight,
    onHeightMeasured,
    layoutMode = 'comfortable',
    plugin,
    selected = false,
    hovered = false,
    onClick,
    onDoubleClick
  }: Props = $props();
  
  // DOM 引用
  let cardElement: HTMLDivElement | undefined = $state();
  let resizeObserver: ResizeObserver | null = null;
  
  // 获取卡片内容
  function getCardContent(side: 'front' | 'back'): string {
    if (side === 'front') {
      return card.fields?.front || card.fields?.question || '';
    } else {
      return card.fields?.back || card.fields?.answer || '';
    }
  }
  
  // 获取卡片预览文本
  function getCardPreview(): string {
    const front = getCardContent('front');
    return front.length > 50 ? front.substring(0, 50) + '...' : front;
  }
  
  // 挂载时设置高度观察
  onMount(() => {
    if (renderMode === 'full' && cardElement && onHeightMeasured) {
      // 创建 ResizeObserver 监听高度变化
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const height = entry.contentRect.height;
          if (height > 0 && onHeightMeasured) {
            onHeightMeasured(height);
          }
        }
      });
      
      resizeObserver.observe(cardElement);
    }
    
    // 清理函数
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
    };
  });
  
  // 处理卡片点击
  function handleClick() {
    if (onClick) {
      onClick();
    }
  }
  
  // 处理卡片双击
  function handleDoubleClick() {
    if (onDoubleClick) {
      onDoubleClick();
    }
  }
</script>

<div
  bind:this={cardElement}
  class="virtual-card-wrapper"
  class:selected
  class:hovered
  class:full-render={renderMode === 'full'}
  class:skeleton-render={renderMode === 'skeleton'}
  class:placeholder-render={renderMode === 'placeholder'}
  style="min-height: {renderMode === 'placeholder' ? estimatedHeight : 0}px;"
  role={onClick ? 'button' : 'article'}
  tabindex={onClick ? 0 : -1}
  onclick={handleClick}
  ondblclick={handleDoubleClick}
  onkeydown={(e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleClick();
    }
  }}
>
  {#if renderMode === 'full'}
    <!-- 完整渲染模式 -->
    <div 
      class="card-full-content" 
      class:layout-compact={layoutMode === 'compact'}
      class:layout-comfortable={layoutMode === 'comfortable'}
      class:layout-spacious={layoutMode === 'spacious'}
    >
      <!-- 卡片头部 -->
      <div class="card-header">
        <div class="card-type">
          <EnhancedIcon name="file-text" size={14} />
          <span>{card.type}</span>
        </div>
        {#if card.priority && card.priority > 2}
          <div class="card-priority">
            <EnhancedIcon name="flag" size={12} />
          </div>
        {/if}
      </div>
      
      <!-- 卡片正面内容 -->
      {#if plugin && getCardContent('front')}
        <div class="card-front">
          <MarkdownRenderer
            {plugin}
            source={getCardContent('front')}
            sourcePath={String(card.fields?.source_document || '')}
          />
        </div>
      {:else}
        <div class="card-front-text">
          {getCardContent('front')}
        </div>
      {/if}
      
      <!-- 卡片背面内容（如果有） -->
      {#if getCardContent('back')}
        <div class="card-back">
          {#if plugin}
            <MarkdownRenderer
              {plugin}
              source={getCardContent('back')}
              sourcePath={String(card.fields?.source_document || '')}
            />
          {:else}
            <div class="card-back-text">
              {getCardContent('back')}
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- 卡片页脚 -->
      <div class="card-footer">
        {#if card.tags && card.tags.length > 0}
          <div class="card-tags">
            {#each card.tags.slice(0, 3) as tag}
              <span class="card-tag">{tag}</span>
            {/each}
            {#if card.tags.length > 3}
              <span class="card-tag-more">+{card.tags.length - 3}</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
    
  {:else if renderMode === 'skeleton'}
    <!-- 骨架屏模式 -->
    <CardSkeleton 
      config={DEFAULT_SKELETON_CONFIG}
      {layoutMode}
      {estimatedHeight}
    />
    
  {:else}
    <!-- 占位符模式（最小渲染） -->
    <div class="card-placeholder" style="height: {estimatedHeight}px;">
      <div class="placeholder-content">
        <span class="placeholder-text">{getCardPreview()}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .virtual-card-wrapper {
    position: relative;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .virtual-card-wrapper.selected {
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-primary));
    box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb), 0.2);
  }
  
  .virtual-card-wrapper.hovered {
    border-color: var(--interactive-accent);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }
  
  .virtual-card-wrapper[role="button"] {
    cursor: pointer;
    user-select: none;
  }
  
  .virtual-card-wrapper[role="button"]:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }
  
  /* 完整渲染内容 */
  .card-full-content {
    padding: 0.75rem;
  }
  
  .card-full-content.layout-compact {
    padding: 0.625rem;
  }
  
  .card-full-content.layout-comfortable {
    padding: 0.75rem;
  }
  
  .card-full-content.layout-spacious {
    padding: 1rem;
  }
  
  /* 卡片头部 */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  
  .card-type {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  
  .card-priority {
    color: var(--color-orange);
  }
  
  /* 卡片内容 */
  .card-front,
  .card-back {
    margin-bottom: 0.5rem;
    overflow: hidden;
  }
  
  .card-front {
    border-bottom: 1px solid var(--background-modifier-border);
    padding-bottom: 0.5rem;
    max-height: 150px;
    position: relative;
  }
  
  .card-front::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 30px;
    background: linear-gradient(transparent, var(--background-primary));
    pointer-events: none;
  }
  
  .card-back {
    opacity: 0.8;
    font-size: 0.9em;
    max-height: 100px;
  }
  
  .card-front-text,
  .card-back-text {
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--text-normal);
  }
  
  /* 卡片页脚 */
  .card-footer {
    border-top: 1px solid var(--background-modifier-border);
    padding-top: 0.5rem;
  }
  
  .card-tags {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }
  
  .card-tag {
    padding: 0.125rem 0.375rem;
    background: var(--background-modifier-border);
    border-radius: 10px;
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  
  .card-tag-more {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-style: italic;
  }
  
  /* 占位符模式 */
  .card-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: var(--background-secondary);
    opacity: 0.3;
  }
  
  .placeholder-content {
    text-align: center;
  }
  
  .placeholder-text {
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  
  /* 性能优化：CSS containment */
  .virtual-card-wrapper.full-render {
    content-visibility: auto;
    contain-intrinsic-size: auto var(--estimated-height, 200px);
  }
  
  /* 响应式设计 */
  @media (max-width: 768px) {
    .card-full-content {
      padding: 0.625rem;
    }
    
    .card-front {
      max-height: 120px;
    }
    
    .card-back {
      max-height: 80px;
    }
  }
</style>

