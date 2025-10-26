<script lang="ts">
  import type { Snippet } from "svelte";
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
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
    ...restProps
  }: Props = $props();

  const dispatch = createEventDispatcher();

  let modalRef = $state<HTMLDivElement | null>(null);
  let isOkLoading = $state(false);
  let shouldRender = $state(open);

  // 计算模态窗样式
  let modalStyle = $derived(() => {
    const styles: Record<string, string> = {};
    
    if (width) styles.width = width;
    if (height) styles.height = height;
    if (zIndex) styles.zIndex = zIndex.toString();
    
    return Object.entries(styles)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
  });

  // 计算遮罩样式
  let backdropStyle = $derived(() => {
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
  let modalClasses = $derived(() => {
    const classes = [
      'tuanki-modal',
      `tuanki-modal--${size}`
    ];
    
    if (centered) classes.push('tuanki-modal--centered');
    if (draggable) classes.push('tuanki-modal--draggable');
    if (resizable) classes.push('tuanki-modal--resizable');
    if (loading) classes.push('tuanki-modal--loading');
    if (confirmDialog) classes.push('tuanki-modal--confirm');
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

  // 处理键盘事件
  function handleKeydown(event: KeyboardEvent) {
    if (keyboard && event.key === 'Escape') {
      handleClose();
    }
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
      console.error('Modal ok handler error:', error);
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
      // 添加键盘监听
      document.addEventListener('keydown', handleKeydown);
      // 防止背景滚动
      document.body.style.overflow = 'hidden';
    } else {
      // 移除键盘监听
      document.removeEventListener('keydown', handleKeydown);
      // 恢复背景滚动
      document.body.style.overflow = '';
      
      // 延迟销毁内容
      if (destroyOnClose) {
        setTimeout(() => {
          shouldRender = false;
        }, 300);
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
      class="tuanki-modal-backdrop"
      class:open
      style={backdropStyle()}
      onclick={handleMaskClick}
      role="presentation"
    ></div>
  {/if}

  <!-- 模态窗容器 -->
  <div 
    class="tuanki-modal-container"
    class:centered
    style="z-index: {zIndex}"
  >
    <div 
      bind:this={modalRef}
      class={modalClasses()}
      class:open
      style={modalStyle()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      {...restProps}
    >
      <!-- 加载遮罩 -->
      {#if loading}
        <div class="tuanki-modal__loading">
          <EnhancedIcon name="spinner" animation="spin" size="xl" variant="primary" />
        </div>
      {/if}

      <!-- 头部 -->
      {#if header || title || closable}
        <div class="tuanki-modal__header">
          {#if header}
            {@render header()}
          {:else}
            <div class="tuanki-modal__title-wrapper">
              {#if title}
                <h3 id="modal-title" class="tuanki-modal__title">{title}</h3>
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
                class="tuanki-modal__close"
              />
            {/if}
          {/if}
        </div>
      {/if}

      <!-- 内容区域 -->
      <div class="tuanki-modal__body">
        {@render children?.()}
      </div>

      <!-- 底部 -->
      {#if footer || confirmDialog}
        <div class="tuanki-modal__footer">
          {#if footer}
            {@render footer()}
          {:else if confirmDialog}
            <div class="tuanki-modal__actions">
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
  .tuanki-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .tuanki-modal-backdrop.open {
    opacity: 1;
  }

  /* 模态窗容器 */
  .tuanki-modal-container {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: var(--tuanki-space-lg);
    overflow-y: auto;
  }

  .tuanki-modal-container.centered {
    align-items: center;
  }

  /* 模态窗主体 */
  .tuanki-modal {
    background: radial-gradient(1200px 800px at 70% -20%, rgba(139,92,246,.12), transparent 60%),
                radial-gradient(800px 600px at 10% -10%, rgba(79,70,229,.10), transparent 50%),
                var(--tuanki-surface);
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-xl);
    box-shadow: var(--tuanki-shadow-xl);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
    position: relative;
    transform: scale(0.9) translateY(-20px);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .tuanki-modal.open {
    transform: scale(1) translateY(0);
    opacity: 1;
  }

  /* 尺寸变体 */
  .tuanki-modal--xs {
    width: 100%;
    max-width: 400px;
  }

  .tuanki-modal--sm {
    width: 100%;
    max-width: 500px;
  }

  .tuanki-modal--md {
    width: 100%;
    max-width: 700px;
  }

  .tuanki-modal--lg {
    width: 100%;
    max-width: 900px;
  }

  .tuanki-modal--xl {
    width: 100%;
    max-width: 1200px;
  }

  .tuanki-modal--full {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    border-radius: 0;
  }

  /* 头部样式 */
  .tuanki-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--tuanki-space-lg) var(--tuanki-space-xl);
    border-bottom: 1px solid var(--tuanki-border);
    background: var(--tuanki-secondary-bg);
    border-radius: var(--tuanki-radius-xl) var(--tuanki-radius-xl) 0 0;
  }

  .tuanki-modal__title-wrapper {
    flex: 1;
  }

  .tuanki-modal__title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--tuanki-text-primary);
  }

  .tuanki-modal__close {
    margin-left: var(--tuanki-space-md);
  }

  /* 内容区域 */
  .tuanki-modal__body {
    flex: 1;
    padding: var(--tuanki-space-xl);
    overflow-y: auto;
    color: var(--tuanki-text-primary);
  }

  /* 底部样式 */
  .tuanki-modal__footer {
    padding: var(--tuanki-space-lg) var(--tuanki-space-xl);
    border-top: 1px solid var(--tuanki-border);
    background: var(--tuanki-secondary-bg);
    border-radius: 0 0 var(--tuanki-radius-xl) var(--tuanki-radius-xl);
  }

  .tuanki-modal__actions {
    display: flex;
    gap: var(--tuanki-space-md);
    justify-content: flex-end;
  }

  /* 加载遮罩 */
  .tuanki-modal__loading {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999998;
    border-radius: inherit;
  }

  /* 确认对话框样式 */
  .tuanki-modal--confirm .tuanki-modal__body {
    text-align: center;
    padding: var(--tuanki-space-2xl) var(--tuanki-space-xl);
  }

  /* 可拖拽样式 */
  .tuanki-modal--draggable .tuanki-modal__header {
    cursor: move;
    user-select: none;
  }

  /* 可调整大小样式 */
  .tuanki-modal--resizable {
    resize: both;
    overflow: hidden;
  }

  .tuanki-modal--resizable::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 20px;
    height: 20px;
    background: linear-gradient(-45deg, transparent 30%, var(--tuanki-border) 30%, var(--tuanki-border) 70%, transparent 70%);
    cursor: se-resize;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .tuanki-modal-container {
      padding: var(--tuanki-space-md);
    }

    .tuanki-modal--xs,
    .tuanki-modal--sm,
    .tuanki-modal--md,
    .tuanki-modal--lg,
    .tuanki-modal--xl {
      width: 100%;
      max-width: none;
      margin: 0;
    }

    .tuanki-modal__header,
    .tuanki-modal__body,
    .tuanki-modal__footer {
      padding-left: var(--tuanki-space-lg);
      padding-right: var(--tuanki-space-lg);
    }
  }

  /* 高对比度模式支持 */
  @media (prefers-contrast: high) {
    .tuanki-modal {
      border-width: 2px;
    }

    .tuanki-modal__header,
    .tuanki-modal__footer {
      border-width: 2px;
    }
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .tuanki-modal-backdrop,
    .tuanki-modal {
      transition: none;
    }

    .tuanki-modal {
      transform: none;
    }
  }
</style>
