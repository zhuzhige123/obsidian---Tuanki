<script lang="ts">
  import { logger } from '../../utils/logger';
  import { getWorkspaceBounds, isMobileDevice, type WorkspaceBounds } from '../../utils/mobile-modal-bounds';

  import type { Snippet } from "svelte";
  import { createEventDispatcher, onMount, onDestroy, untrack } from "svelte";
  import EnhancedButton from "./EnhancedButton.svelte";
  import EnhancedIcon from "./EnhancedIcon.svelte";

  interface Props {
    /** 是否显示模态窗 */
    open: boolean;
    
    /** 关闭回调 */
    onClose: () => void;
    
    /** 模态窗尺寸 */
    size?: "xs" | "sm" | "md" | "lg" | "xl" | "full";
    
    /** 自定义宽度 - 覆盖尺寸设置 */
    width?: string;
    
    /** 自定义高度 */
    height?: string;
    
    /** 标题 */
    title?: string;
    
    /** 是否显示关闭按钮 */
    closable?: boolean;
    
    /** 点击遮罩是否关闭 */
    maskClosable?: boolean;
    
    /** 键盘 ESC 是否关闭 */
    keyboard?: boolean;
    
    /** 是否垂直居中 */
    centered?: boolean;
    
    /** 关闭时是否销毁内容 */
    destroyOnClose?: boolean;
    
    /** 自定义 z-index */
    zIndex?: number;
    
    /** 是否显示遮罩 */
    mask?: boolean;
    
    /** 遮罩样式 */
    maskStyle?: string;
    
    /** 是否可拖拽 */
    draggable?: boolean;
    
    /** 是否可调整大小 */
    resizable?: boolean;
    
    /** 加载状态 */
    loading?: boolean;
    
    /** 确认对话框模式 */
    confirmDialog?: boolean;
    
    /** 确认按钮文本 */
    okText?: string;
    
    /** 取消按钮文本 */
    cancelText?: string;
    
    /** 确认按钮类型 */
    okType?: "primary" | "danger";
    
    /** 确认回调 */
    onOk?: () => void | Promise<void>;
    
    /** 取消回调 */
    onCancel?: () => void;
    
    /** 自定义类名 */
    class?: string;
    
    /** 内容插槽 */
    children?: Snippet;
    
    /** 头部插槽 */
    header?: Snippet;
    
    /** 底部插槽 */
    footer?: Snippet;
    
    /** 标题栏彩色条颜色变体 */
    accentColor?: 'blue' | 'green' | 'purple' | 'orange' | 'cyan' | 'pink' | 'red';
    
    /** 支持所有 data-* 属性 */
    [key: `data-${string}`]: string | undefined;
  }
  
  let {
    open,
    onClose,
    size = "md",
    width,
    height,
    title,
    closable = true,
    maskClosable = true,
    keyboard = true,
    centered = true,
    destroyOnClose = false,
    zIndex = 999999,
    mask = true,
    maskStyle,
    draggable = false,
    resizable = false,
    loading = false,
    confirmDialog = false,
    okText = "确定",
    cancelText = "取消",
    okType = "primary",
    onOk,
    onCancel,
    class: className = "",
    children,
    header,
    footer,
    accentColor,
    ...restProps
  }: Props = $props();

  const dispatch = createEventDispatcher();

  let modalRef = $state<HTMLDivElement | null>(null);
  let isOkLoading = $state(false);
  let shouldRender = $state(untrack(() => open));
  
  //  移动端边界状态
  let mobileBounds = $state<WorkspaceBounds | null>(null);
  let isMobile = $state(false);
  
  // 更新移动端边界
  function updateMobileBounds() {
    isMobile = isMobileDevice();
    if (isMobile) {
      mobileBounds = getWorkspaceBounds();
    }
  }

  // 计算模态窗样式
  let modalStyle = $derived.by(() => {
    const styles: Record<string, string> = {};
    
    if (width) styles.width = width;
    if (height) styles.height = height;
    if (zIndex) styles.zIndex = zIndex.toString();
    
    return Object.entries(styles)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
  });

  // 计算遮罩样式
  let backdropStyle = $derived.by(() => {
    const styles: Record<string, string> = {
      zIndex: (zIndex - 1).toString()
    };
    
    if (maskStyle) {
      Object.assign(styles, Object.fromEntries(
        maskStyle.split(';').map(s => s.split(':').map(p => p.trim()))
      ));
    }
    
    return Object.entries(styles)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
  });

  // 计算 CSS 类
  let modalClasses = $derived.by(() => {
    const classes = [
      'weave-modal',
      `weave-modal--${size}`
    ];
    
    if (centered) classes.push('weave-modal--centered');
    if (draggable) classes.push('weave-modal--draggable');
    if (resizable) classes.push('weave-modal--resizable');
    if (loading) classes.push('weave-modal--loading');
    if (confirmDialog) classes.push('weave-modal--confirm');
    if (className) classes.push(className);
    
    return classes.join(' ');
  });

  // 处理关闭事件
  function handleClose() {
    if (loading || isOkLoading) return;
    onClose();
    dispatch('close');
  }

  // 处理遮罩点击
  function handleMaskClick() {
    if (maskClosable) {
      handleClose();
    }
  }

  // 键盘事件（Escape 已移除，由 Obsidian 原生处理）
  function handleKeydown(_event: KeyboardEvent) {
  }

  // 处理确认
  async function handleOk() {
    if (isOkLoading) return;
    
    try {
      isOkLoading = true;
      await onOk?.();
      dispatch('ok');
      if (!confirmDialog) handleClose();
    } catch (error) {
      logger.error('Modal ok handler error:', error);
      dispatch('error', error);
    } finally {
      isOkLoading = false;
    }
  }

  // 处理取消
  function handleCancel() {
    onCancel?.();
    dispatch('cancel');
    handleClose();
  }

  // 监听 open 状态变化
  $effect(() => {
    if (open) {
      shouldRender = true;
      //  更新移动端边界
      updateMobileBounds();
      // 添加键盘监听
      document.addEventListener('keydown', handleKeydown);
      // 防止背景滚动
      document.body.style.overflow = 'hidden';
    } else {
      // 移除键盘监听
      document.removeEventListener('keydown', handleKeydown);
      // 恢复背景滚动
      document.body.style.overflow = '';
      
      // 统一使用 shouldRender 控制挂载/卸载，避免嵌套条件渲染导致的 reconciliation 错误
      if (destroyOnClose) {
        // 延迟销毁内容，给动画时间
        setTimeout(() => {
          shouldRender = false;
        }, 300);
      } else {
        //  修复关键点：即使不销毁内容，也要立即设置 shouldRender = false
        // 避免外层 {#if shouldRender} 为 true 而内层 {#if open} 为 false 的不同步状态
        shouldRender = false;
      }
    }
  });

  // 组件销毁时清理
  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = '';
  });
</script>

{#if shouldRender}
  <!-- 遮罩层 -->
  {#if mask}
    <div 
      class="weave-modal-backdrop"
      class:open={open}
      class:is-mobile={isMobile}
      style="{backdropStyle}{isMobile && mobileBounds ? `; top: ${mobileBounds.top}px; bottom: ${mobileBounds.bottom}px;` : ''}"
      onclick={handleMaskClick}
      role="presentation"
    ></div>
  {/if}

  <!-- 模态窗容器 -->
  <div 
    class="weave-modal-container"
    class:centered
    class:open={open}
    class:is-mobile={isMobile}
    style="z-index: {zIndex}{isMobile && mobileBounds ? `; top: ${mobileBounds.top}px; bottom: ${mobileBounds.bottom}px;` : ''}"
  >
    <div 
      bind:this={modalRef}
      class={modalClasses}
      class:open
      style="{modalStyle}{isMobile && mobileBounds ? `; max-height: ${mobileBounds.height - 24}px;` : ''}"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      tabindex="-1"
      onclick={(e) => {
        // Svelte 5: 已移除 stopPropagation，让事件正常冒泡
        // 模态框内部点击不应该关闭模态框
      }}
      {...restProps}
    >
      <!-- 加载遮罩 -->
      {#if loading}
        <div class="weave-modal__loading">
          <EnhancedIcon name="spinner" animation="spin" size="xl" variant="primary" />
        </div>
      {/if}

      <!-- 头部 -->
      {#if header || title || closable}
        <div class="weave-modal__header">
          {#if header}
            {@render header()}
          {:else}
            <div class="weave-modal__title-wrapper">
              {#if title}
                <h3 id="modal-title" class="weave-modal__title" class:with-accent-bar={accentColor} class:accent-blue={accentColor === 'blue'} class:accent-green={accentColor === 'green'} class:accent-purple={accentColor === 'purple'} class:accent-orange={accentColor === 'orange'} class:accent-cyan={accentColor === 'cyan'} class:accent-pink={accentColor === 'pink'} class:accent-red={accentColor === 'red'}>{title}</h3>
              {/if}
            </div>
            {#if closable}
              <EnhancedButton
                variant="ghost"
                size="sm"
                iconOnly
                icon="times"
                onclick={handleClose}
                ariaLabel="关闭"
                class="weave-modal__close"
              />
            {/if}
          {/if}
        </div>
      {/if}

      <!-- 内容区域 -->
      <div class="weave-modal__body">
        {@render children?.()}
      </div>

      <!-- 底部 -->
      {#if footer || confirmDialog}
        <div class="weave-modal__footer">
          {#if footer}
            {@render footer()}
          {:else if confirmDialog}
            <div class="weave-modal__actions">
              <EnhancedButton
                variant="secondary"
                onclick={handleCancel}
                disabled={isOkLoading}
              >
                {cancelText}
              </EnhancedButton>
              <EnhancedButton
                variant={okType}
                onclick={handleOk}
                loading={isOkLoading}
              >
                {okText}
              </EnhancedButton>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* 遮罩层 */
  .weave-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: auto;
  }

  .weave-modal-backdrop.open {
    opacity: 1;
  }

  /* 模态窗容器 */
  .weave-modal-container {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: var(--weave-space-lg);
    overflow-y: auto;
    pointer-events: none;
  }
  
  .weave-modal-container.centered {
    align-items: center;
  }

  /* 模态窗主体 */
  .weave-modal {
    /*  CSS变量定义（确保在非.weave-app容器中也能使用） */
    --weave-space-xs: 4px;
    --weave-space-sm: 8px;
    --weave-space-md: 12px;
    --weave-space-lg: 16px;
    --weave-space-xl: 24px;
    --weave-space-2xl: 32px;
    
    --weave-radius-sm: 4px;
    --weave-radius-md: 8px;
    --weave-radius-lg: 12px;
    --weave-radius-xl: 16px;
    
    --weave-text-primary: var(--text-normal);
    --weave-text-secondary: var(--text-muted);
    --weave-text-faint: var(--text-faint);
    --weave-border: var(--background-modifier-border);
    --weave-surface: var(--background-primary);
    --weave-secondary-bg: var(--background-secondary);
    --weave-shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.15);
    
    /* 模态窗样式 */
    background: var(--background-primary, var(--weave-surface));
    border: 1px solid var(--weave-border);
    border-radius: var(--weave-radius-xl);
    box-shadow: var(--weave-shadow-xl);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
    position: relative;
    transform: scale(0.9) translateY(-20px);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: auto; /* 恢复点击事件，确保内容可交互 */
  }

  .weave-modal.open {
    transform: scale(1) translateY(0);
    opacity: 1;
  }

  /* 尺寸变体 */
  .weave-modal--xs {
    width: 100%;
    max-width: 400px;
  }

  .weave-modal--sm {
    width: 100%;
    max-width: 500px;
  }

  .weave-modal--md {
    width: 100%;
    max-width: 700px;
  }

  .weave-modal--lg {
    width: 100%;
    max-width: 900px;
  }

  .weave-modal--xl {
    width: 100%;
    max-width: 1200px;
  }

  .weave-modal--full {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    border-radius: 0;
  }

  /* 头部样式 */
  .weave-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--weave-space-lg) var(--weave-space-xl);
    border-bottom: 1px solid var(--weave-border);
    background: var(--weave-secondary-bg);
    border-radius: var(--weave-radius-xl) var(--weave-radius-xl) 0 0;
  }

  .weave-modal__title-wrapper {
    flex: 1;
  }

  .weave-modal__title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--weave-text-primary);
  }

  .weave-modal__close {
    margin-left: var(--weave-space-md);
  }

  /* 内容区域 */
  .weave-modal__body {
    flex: 1;
    padding: var(--weave-space-xl);
    overflow-y: auto;
    color: var(--weave-text-primary);
  }

  /* 底部样式 */
  .weave-modal__footer {
    padding: var(--weave-space-lg) var(--weave-space-xl);
    border-top: 1px solid var(--weave-border);
    background: var(--weave-secondary-bg);
    border-radius: 0 0 var(--weave-radius-xl) var(--weave-radius-xl);
  }

  .weave-modal__actions {
    display: flex;
    gap: var(--weave-space-md);
    justify-content: flex-end;
  }

  /* 加载遮罩 */
  .weave-modal__loading {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--layer-modal); /* 模态窗主体层级 */
    border-radius: inherit;
  }

  /* 确认对话框样式 */
  .weave-modal--confirm .weave-modal__body {
    text-align: center;
    padding: var(--weave-space-2xl) var(--weave-space-xl);
  }

  /* 可拖拽样式 */
  .weave-modal--draggable .weave-modal__header {
    cursor: move;
    user-select: none;
  }

  /* 可调整大小样式 */
  .weave-modal--resizable {
    resize: both;
    overflow: hidden;
  }

  .weave-modal--resizable::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 20px;
    height: 20px;
    background: linear-gradient(-45deg, transparent 30%, var(--weave-border) 30%, var(--weave-border) 70%, transparent 70%);
    cursor: se-resize;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .weave-modal-container {
      padding: var(--weave-space-md);
    }

    .weave-modal--xs,
    .weave-modal--sm,
    .weave-modal--md,
    .weave-modal--lg,
    .weave-modal--xl {
      width: 100%;
      max-width: none;
      margin: 0;
    }

    .weave-modal__header,
    .weave-modal__body,
    .weave-modal__footer {
      padding-left: var(--weave-space-lg);
      padding-right: var(--weave-space-lg);
    }
  }

  /* 高对比度模式支持 */
  @media (prefers-contrast: high) {
    .weave-modal {
      border-width: 2px;
    }

    .weave-modal__header,
    .weave-modal__footer {
      border-width: 2px;
    }
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .weave-modal-backdrop,
    .weave-modal {
      transition: none;
    }

    .weave-modal {
      transform: none;
    }
  }

  /*  移动端适配 - 避让 Obsidian 功能栏 */
  .weave-modal-backdrop.is-mobile {
    background: transparent !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  .weave-modal-container.is-mobile {
    padding: 12px;
  }

  .weave-modal-container.is-mobile .weave-modal {
    max-width: 100%;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }
</style>
