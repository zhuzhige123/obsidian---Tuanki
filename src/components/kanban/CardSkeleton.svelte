<script lang="ts">
  /**
   * 卡片骨架屏组件
   * 
   * 用于虚拟滚动中显示加载占位
   */
  import type { SkeletonConfig } from '../../types/card-render-types';
  import type { LayoutMode } from '../../utils/card-height-estimator';
  
  interface Props {
    /** 骨架屏配置 */
    config: SkeletonConfig;
    /** 布局模式 */
    layoutMode?: LayoutMode;
    /** 估算高度（像素） */
    estimatedHeight: number;
  }
  
  let { 
    config, 
    layoutMode = 'comfortable',
    estimatedHeight
  }: Props = $props();
  
  // 根据布局模式调整内边距
  const paddingMap = {
    compact: '0.625rem',
    comfortable: '0.75rem',
    spacious: '1rem'
  };
  
  const padding = $derived(paddingMap[layoutMode]);
</script>

<div 
  class="card-skeleton"
  class:enable-shimmer={config.enableShimmer}
  style="min-height: {estimatedHeight}px; padding: {padding};"
  role="status"
  aria-label="加载中..."
>
  <!-- 卡片头部 -->
  <div class="skeleton-header">
    {#if config.showAvatar}
      <div class="skeleton-avatar"></div>
    {/if}
    {#if config.showTitle}
      <div class="skeleton-title"></div>
    {/if}
  </div>
  
  <!-- 卡片内容 -->
  {#if config.showContent}
    <div class="skeleton-content">
      {#each Array(config.contentLines || 3) as _, i}
        <div 
          class="skeleton-line" 
          class:short={i === (config.contentLines || 3) - 1}
        ></div>
      {/each}
    </div>
  {/if}
  
  <!-- 卡片页脚 -->
  {#if config.showFooter}
    <div class="skeleton-footer">
      <div class="skeleton-tag"></div>
      <div class="skeleton-tag"></div>
    </div>
  {/if}
</div>

<style>
  .card-skeleton {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    overflow: hidden;
    pointer-events: none;
    user-select: none;
  }
  
  /* 骨架屏头部 */
  .skeleton-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  /* 头像骨架 */
  .skeleton-avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--background-modifier-border);
    flex-shrink: 0;
  }
  
  /* 标题骨架 */
  .skeleton-title {
    height: 1.25rem;
    flex: 1;
    background: var(--background-modifier-border);
    border-radius: var(--radius-s);
  }
  
  /* 内容骨架 */
  .skeleton-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  /* 内容行骨架 */
  .skeleton-line {
    height: 0.875rem;
    background: var(--background-modifier-border);
    border-radius: var(--radius-s);
  }
  
  .skeleton-line.short {
    width: 70%;
  }
  
  /* 页脚骨架 */
  .skeleton-footer {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }
  
  /* 标签骨架 */
  .skeleton-tag {
    height: 1.5rem;
    width: 3rem;
    background: var(--background-modifier-border);
    border-radius: 0.75rem;
  }
  
  /* Shimmer 动画 */
  .card-skeleton.enable-shimmer .skeleton-avatar,
  .card-skeleton.enable-shimmer .skeleton-title,
  .card-skeleton.enable-shimmer .skeleton-line,
  .card-skeleton.enable-shimmer .skeleton-tag {
    position: relative;
    overflow: hidden;
  }
  
  .card-skeleton.enable-shimmer .skeleton-avatar::after,
  .card-skeleton.enable-shimmer .skeleton-title::after,
  .card-skeleton.enable-shimmer .skeleton-line::after,
  .card-skeleton.enable-shimmer .skeleton-tag::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.1) 50%,
      transparent 100%
    );
    animation: shimmer 1.5s infinite;
  }
  
  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
  
  /* 响应式设计 */
  @media (max-width: 768px) {
    .skeleton-title {
      height: 1rem;
    }
    
    .skeleton-line {
      height: 0.75rem;
    }
  }
  
  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .card-skeleton.enable-shimmer .skeleton-avatar::after,
    .card-skeleton.enable-shimmer .skeleton-title::after,
    .card-skeleton.enable-shimmer .skeleton-line::after,
    .card-skeleton.enable-shimmer .skeleton-tag::after {
      animation: none;
    }
  }
</style>



