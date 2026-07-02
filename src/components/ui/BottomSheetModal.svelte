<script lang="ts">
  /**
   * 底部抽屉式模态窗组件
   * 
   * 专为移动端设计的模态窗组件，从底部滑出
   * 支持三种高度模式：auto（自适应）、half（半屏）、full（全屏）
   * 支持拖动关闭
   */
  import { onMount, onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';
  import EnhancedIcon from './EnhancedIcon.svelte';

  interface Props {
    isOpen: boolean;
    title?: string;
    height?: 'auto' | 'half' | 'full';
    showCloseButton?: boolean;
    closeOnBackdrop?: boolean;
    closeOnSwipeDown?: boolean;
    onClose: () => void;
    children: Snippet;
    footer?: Snippet;
  }

  let {
    isOpen = false,
    title = '',
    height = 'auto',
    showCloseButton = true,
    closeOnBackdrop = true,
    closeOnSwipeDown = true,
    onClose,
    children,
    footer
  }: Props = $props();

  // 拖动状态
  let isDragging = $state(false);
  let dragStartY = $state(0);
  let currentTranslateY = $state(0);

  // 动画状态
  let isAnimating = $state(false);
  let isVisible = $state(false);

  // 监听 isOpen 变化
  $effect(() => {
    if (isOpen) {
      isVisible = true;
      // 延迟添加动画类，确保 DOM 已渲染
      requestAnimationFrame(() => {
        isAnimating = true;
      });
    } else {
      isAnimating = false;
      // 等待动画完成后隐藏
      window.setTimeout(() => {
        isVisible = false;
      }, 300);
    }
  });

  // 处理背景点击
  function handleBackdropClick(event: MouseEvent) {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onClose();
    }
  }

  // 处理拖动开始
  function handleDragStart(event: TouchEvent | MouseEvent) {
    if (!closeOnSwipeDown) return;
    
    isDragging = true;
    dragStartY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    currentTranslateY = 0;
  }

  // 处理拖动移动
  function handleDragMove(event: TouchEvent | MouseEvent) {
    if (!isDragging) return;
    
    const currentY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    const deltaY = currentY - dragStartY;
    
    // 只允许向下拖动
    if (deltaY > 0) {
      currentTranslateY = deltaY;
    }
  }

  // 处理拖动结束
  function handleDragEnd() {
    if (!isDragging) return;
    
    isDragging = false;
    
    // 如果拖动超过 100px，关闭模态窗
    if (currentTranslateY > 100) {
      onClose();
    }
    
    currentTranslateY = 0;
  }

  // 获取高度样式
  function getHeightStyle(): string {
    switch (height) {
      case 'full':
        return 'max-height: calc(100vh - env(safe-area-inset-top, 20px));';
      case 'half':
        return 'max-height: 50vh;';
      case 'auto':
      default:
        return 'max-height: 80vh;';
    }
  }

  // 获取变换样式
  function getTransformStyle(): string {
    if (currentTranslateY > 0) {
      return `transform: translateY(${currentTranslateY}px);`;
    }
    return '';
  }

  onMount(() => {
  });

  onDestroy(() => {
  });
</script>

{#if isVisible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="bottom-sheet-backdrop"
    class:open={isAnimating}
    onclick={handleBackdropClick}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="bottom-sheet"
      class:open={isAnimating}
      class:dragging={isDragging}
      style="{getHeightStyle()} {getTransformStyle()}"
      ontouchstart={handleDragStart}
      ontouchmove={handleDragMove}
      ontouchend={handleDragEnd}
      onmousedown={handleDragStart}
      onmousemove={handleDragMove}
      onmouseup={handleDragEnd}
      onmouseleave={handleDragEnd}
    >
      <!-- 拖动指示条 -->
      {#if closeOnSwipeDown}
        <div class="drag-handle">
          <div class="drag-indicator"></div>
        </div>
      {/if}

      <!-- 头部 -->
      {#if title || showCloseButton}
        <div class="sheet-header">
          {#if title}
            <h3 class="sheet-title">{title}</h3>
          {/if}
          {#if showCloseButton}
            <button 
              class="close-btn"
              onclick={onClose}
              aria-label="关闭"
            >
              <EnhancedIcon name="x" size={20} />
            </button>
          {/if}
        </div>
      {/if}

      <!-- 内容区域 -->
      <div class="sheet-content">
        {@render children()}
      </div>

      <!-- 底部操作区域 -->
      {#if footer}
        <div class="sheet-footer">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bottom-sheet-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0);
    z-index: var(--layer-modal);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    transition: background 0.3s ease;
  }

  .bottom-sheet-backdrop.open {
    background: rgba(0, 0, 0, 0.5);
  }

  .bottom-sheet {
    width: 100%;
    max-width: 100%;
    background: var(--background-primary);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    /* iOS 安全区域 + Obsidian 底部栏 (44px) */
    padding-bottom: calc(44px + env(safe-area-inset-bottom, 0));
    /* 限制最大高度，确保不遮挡 Obsidian 底部栏 */
    max-height: calc(100vh - 44px - env(safe-area-inset-top, 20px));
  }

  .bottom-sheet.open {
    transform: translateY(0);
  }

  .bottom-sheet.dragging {
    transition: none;
  }

  /* 拖动指示条 */
  .drag-handle {
    display: flex;
    justify-content: center;
    padding: 12px 0 8px;
    cursor: grab;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .drag-indicator {
    width: 36px;
    height: 4px;
    background: var(--background-modifier-border);
    border-radius: 2px;
  }

  /* 头部 */
  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .sheet-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: var(--background-modifier-hover);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: var(--background-modifier-border);
    color: var(--text-normal);
  }

  /* 内容区域 */
  .sheet-content {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 16px;
  }

  /* 底部操作区域 */
  .sheet-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  /* 平板端优化 */
  @media (min-width: 481px) {
    .bottom-sheet {
      max-width: 480px;
      margin: 0 auto;
      border-radius: 16px 16px 0 0;
    }
  }

  /* 桌面端 - 居中显示 */
  @media (min-width: 769px) {
    .bottom-sheet-backdrop {
      align-items: center;
    }

    .bottom-sheet {
      max-width: 500px;
      max-height: 80vh !important;
      border-radius: 16px;
      margin-bottom: 0;
    }

    .drag-handle {
      display: none;
    }
  }

  /* ==================== Obsidian 移动端适配 ==================== */
  
  /* 手机端：全宽底部抽屉，确保不遮挡 Obsidian 底部栏 */
  :global(body.is-phone) .bottom-sheet {
    max-width: 100%;
    border-radius: 16px 16px 0 0;
    /* 关键：确保 Obsidian 底部栏 (44px) 始终可见 */
    bottom: 44px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0));
    max-height: calc(100vh - 44px - env(safe-area-inset-top, 20px));
  }

  :global(body.is-phone) .bottom-sheet-backdrop {
    /* 背景遮罩不覆盖 Obsidian 底部栏 */
    bottom: 44px;
  }

  :global(body.is-phone) .sheet-content {
    padding: var(--weave-mobile-spacing-md, 12px);
  }

  :global(body.is-phone) .close-btn {
    width: var(--weave-mobile-touch-min, 44px);
    height: var(--weave-mobile-touch-min, 44px);
  }

  /* 平板端：居中显示，适中宽度 */
  :global(body.is-tablet) .bottom-sheet {
    max-width: 480px;
    margin: 0 auto;
  }

  /* 桌面端模拟移动端时隐藏拖动指示条 */
  :global(body:not(.is-mobile)) .drag-handle {
    display: none;
  }
</style>
