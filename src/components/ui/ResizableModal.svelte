<!--
  可拖拽调整尺寸的模态窗组件
  职责：提供可拖拽边框调整尺寸的模态窗功能
-->
<script lang="ts">
  import { logger } from '../../utils/logger';
  import { focusManager } from '../../utils/focus-manager';
  import { getWorkspaceBounds, isMobileDevice, type WorkspaceBounds } from '../../utils/mobile-modal-bounds';

  import { onMount, onDestroy, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { getModalSizePresets, MODAL_SIZE_LIMITS } from '../settings/constants/settings-constants';
  import type { WeavePlugin } from '../../main';

  interface Props {
    /** 是否显示模态窗 */
    open: boolean;

    /** 关闭回调 */
    onClose: () => void;

    /** 插件实例 - 用于获取尺寸设置 */
    plugin: WeavePlugin;

    /** 标题 */
    title?: string;

    /** 是否显示关闭按钮 */
    closable?: boolean;

    /** 点击遮罩是否关闭 */
    maskClosable?: boolean;

    /** 键盘 ESC 是否关闭 */
    keyboard?: boolean;

    /** 自定义类名 */
    className?: string;

    /** 启用透明遮罩（允许外部交互） */
    enableTransparentMask?: boolean;

    /** 启用窗口拖拽移动 */
    enableWindowDrag?: boolean;

    /** 子内容渲染片段 */
    children?: Snippet;

    /** 标题栏右侧自定义内容片段 */
    headerActions?: Snippet;

    /** 模态窗尺寸配置键名（支持多个模态窗独立配置） */
    modalSizeKey?: 'editorModalSize';

    /** 标题栏彩色条颜色变体 */
    accentColor?: 'blue' | 'green' | 'purple' | 'orange' | 'cyan' | 'pink' | 'red';
    
    /** 初始宽度（优先级高于设置存储） */
    initialWidth?: number;
    
    /** 初始高度（优先级高于设置存储） */
    initialHeight?: number;

  }

  let {
    open = $bindable(),
    onClose,
    plugin,
    title,
    closable = true,
    maskClosable = true,
    keyboard = true,
    className = '',
    enableTransparentMask = false,
    enableWindowDrag = false,
    children,
    headerActions,
    modalSizeKey = 'editorModalSize',
    accentColor = 'blue',
    initialWidth,
    initialHeight
  }: Props = $props();

  let modalElement = $state<HTMLElement>();
  let isDragging = $state(false);
  let dragHandle = $state('');
  let justFinishedDragging = $state(false); // 防止拖拽结束时触发遮罩层点击
  let startX = $state(0);
  let startY = $state(0);
  let startWidth = $state(0);
  let startHeight = $state(0);

  // 窗口位置状态（用于拖拽移动）
  let windowX = $state<number>(0);
  let windowY = $state<number>(0);
  let isDraggingWindow = $state(false);
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let dragStartWindowX = $state(0);
  let dragStartWindowY = $state(0);

  //  性能优化：延迟初始化标志
  let isDragInitialized = $state(false);
  let isWindowDragInitialized = $state(false);
  
  //  移动端边界状态
  let mobileBounds = $state<WorkspaceBounds | null>(null);
  let isMobile = $state(false);
  let mobileBoundsCleanup: (() => void) | null = null;
  
  // 更新移动端边界
  function updateMobileBounds() {
    isMobile = isMobileDevice();
    if (isMobile) {
      mobileBounds = getWorkspaceBounds();
    }
  }

  // 动态获取当前尺寸设置（默认启用尺寸记忆）
  let modalSettings = $derived(plugin.settings[modalSizeKey] || {
    rememberLastSize: true,  //  默认启用尺寸记忆
    enableResize: true
  });
  let persistedModalSize = $state(untrack(() => plugin.getEditorModalSizeState()));

  // 当前模态窗尺寸 - 响应式更新
  let currentWidth = $state(800);
  let currentHeight = $state(600);
  
  // 监听设置变化，动态更新尺寸
  $effect(() => {
    // 优先使用传入的初始尺寸
    if (initialWidth && initialHeight) {
      currentWidth = initialWidth;
      currentHeight = initialHeight;
      return;
    }
    
    currentWidth = persistedModalSize.customWidth || 800;
    currentHeight = persistedModalSize.customHeight || 600;
  });

  //  性能优化：仅初始化必要的尺寸，延迟初始化拖拽功能
  onMount(() => {
    // 保存当前焦点
    focusManager.saveFocus();
    
    //  初始化移动端边界检测
    updateMobileBounds();
    
    if (isMobile) {
      const handleBoundsChange = () => {
        updateMobileBounds();
      };

      window.addEventListener('resize', handleBoundsChange);

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleBoundsChange);
        window.visualViewport.addEventListener('scroll', handleBoundsChange);
      }

      mobileBoundsCleanup = () => {
        window.removeEventListener('resize', handleBoundsChange);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleBoundsChange);
          window.visualViewport.removeEventListener('scroll', handleBoundsChange);
        }
      };
    }
    
    const sizePresets = getModalSizePresets();
    const presetKey = persistedModalSize.preset as keyof ReturnType<typeof getModalSizePresets>;
    if (persistedModalSize.preset !== 'custom' && sizePresets[presetKey]) {
      const preset = sizePresets[presetKey];
      currentWidth = preset.width;
      currentHeight = preset.height;
    }

    // 如果启用窗口拖拽，初始化时就计算居中位置
    // （确保窗口打开时就在正确位置，而不是左上角）
    if (enableWindowDrag && !isMobile) {
      windowX = Math.max(0, (window.innerWidth - currentWidth) / 2);
      windowY = Math.max(50, (window.innerHeight - currentHeight) / 2);
      isWindowDragInitialized = true;
    }
  });

  // 键盘事件（Escape 已移除，由 Obsidian 原生处理）
  function handleKeydown(_event: KeyboardEvent) {
  }

  // 处理关闭
  function handleClose() {
    //  关闭时自动保存当前尺寸（始终保存，无需选项控制）
    saveCurrentSize();
    // 恢复之前保存的焦点
    focusManager.restoreFocus();
    open = false;
    onClose();
  }

  // 保存当前尺寸到设置
  async function saveCurrentSize() {
    try {
      if (modalSettings.rememberLastSize === false) {
        return;
      }

      persistedModalSize = {
        customWidth: currentWidth,
        customHeight: currentHeight,
        preset: 'custom'
      };
      await plugin.saveEditorModalSizeState(persistedModalSize);
      logger.debug(`[ResizableModal] 保存${modalSizeKey}尺寸:`, { width: currentWidth, height: currentHeight });
    } catch (error) {
      logger.error(`保存${modalSizeKey}尺寸失败:`, error);
    }
  }

  //  性能优化：延迟初始化拖拽功能
  function initializeDragIfNeeded() {
    if (isDragInitialized) return;
    isDragInitialized = true;
    logger.debug('[ResizableModal] 拖拽功能已初始化');
  }

  // 处理拖拽开始
  function handleMouseDown(event: MouseEvent, handle: string) {
    if (!modalSettings.enableResize) return;

    //  性能优化：首次拖拽时才初始化
    initializeDragIfNeeded();

    event.preventDefault();
    isDragging = true;
    dragHandle = handle;
    startX = event.clientX;
    startY = event.clientY;
    startWidth = currentWidth;
    startHeight = currentHeight;

    activeDocument.addEventListener('mousemove', handleMouseMove);
    activeDocument.addEventListener('mouseup', handleMouseUp);
    activeDocument.body.style.cursor = getCursorForHandle(handle);
    activeDocument.body.style.userSelect = 'none';
  }

  // 处理键盘事件
  function handleKeyDown(event: KeyboardEvent, handle: string) {
    if (!modalSettings.enableResize) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // 模拟鼠标按下事件
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true
      });
      handleMouseDown(mouseEvent, handle);
    }
  }

  // 处理模态框键盘导航（Escape 已移除，由 Obsidian 原生处理）
  function handleModalKeyDown(_event: KeyboardEvent) {
  }

  // 处理拖拽移动
  function handleMouseMove(event: MouseEvent) {
    if (!isDragging) return;

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    let newWidth = startWidth;
    let newHeight = startHeight;

    // 根据拖拽手柄计算新尺寸
    switch (dragHandle) {
      case 'right':
        newWidth = startWidth + deltaX;
        break;
      case 'bottom':
        newHeight = startHeight + deltaY;
        break;
      case 'bottom-right':
        newWidth = startWidth + deltaX;
        newHeight = startHeight + deltaY;
        break;
      case 'left':
        newWidth = startWidth - deltaX;
        break;
      case 'top':
        newHeight = startHeight - deltaY;
        break;
      case 'top-left':
        newWidth = startWidth - deltaX;
        newHeight = startHeight - deltaY;
        break;
      case 'top-right':
        newWidth = startWidth + deltaX;
        newHeight = startHeight - deltaY;
        break;
      case 'bottom-left':
        newWidth = startWidth - deltaX;
        newHeight = startHeight + deltaY;
        break;
    }

    // 应用尺寸限制
    newWidth = Math.max(MODAL_SIZE_LIMITS.MIN_WIDTH, Math.min(MODAL_SIZE_LIMITS.MAX_WIDTH, newWidth));
    newHeight = Math.max(MODAL_SIZE_LIMITS.MIN_HEIGHT, Math.min(MODAL_SIZE_LIMITS.MAX_HEIGHT, newHeight));

    currentWidth = newWidth;
    currentHeight = newHeight;
  }

  // 处理拖拽结束
  function handleMouseUp() {
    if (!isDragging) return;

    isDragging = false;
    dragHandle = '';
    
    // 设置标志，防止立即触发遮罩层点击关闭
    justFinishedDragging = true;
    window.setTimeout(() => {
      justFinishedDragging = false;
    }, 100);

    activeDocument.removeEventListener('mousemove', handleMouseMove);
    activeDocument.removeEventListener('mouseup', handleMouseUp);
    activeDocument.body.style.cursor = '';
    activeDocument.body.style.userSelect = '';

    //  拖拽结束后自动保存尺寸
    saveCurrentSize();
  }

  //  性能优化：延迟初始化窗口拖拽（位置已在 onMount 中初始化）
  function initializeWindowDragIfNeeded() {
    if (isWindowDragInitialized) return;

    // 如果由于某种原因位置未初始化，这里作为后备
    if (windowX === 0 && windowY === 0) {
      windowX = Math.max(0, (window.innerWidth - currentWidth) / 2);
      windowY = Math.max(50, (window.innerHeight - currentHeight) / 2);
    }
    isWindowDragInitialized = true;

    logger.debug('[ResizableModal] 窗口拖拽功能已初始化');
  }

  // 处理标题栏拖拽开始（移动窗口）
  function handleHeaderDragStart(event: MouseEvent) {
    if (!enableWindowDrag) return;

    // 只允许在标题栏空白区域拖拽，不包括按钮和下拉面板
    const target = event.target as HTMLElement;

    //  排除按钮元素
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }

    //  排除输入框、下拉框等交互元素
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.closest('input') || target.closest('select')) {
      return;
    }

    //  排除下拉菜单相关元素（包括根容器、面板、选项）
    if (target.classList.contains('custom-dropdown') ||
        target.closest('.custom-dropdown') ||
        target.classList.contains('dropdown-panel') || 
        target.closest('.dropdown-panel') ||
        target.classList.contains('dropdown-item') ||
        target.closest('.dropdown-item')) {
      return;
    }

    //  只响应header或其直接子元素的拖拽
    const header = target.closest('.modal-header');
    if (!header) {
      return;
    }

    //  性能优化：首次拖拽时才初始化
    initializeWindowDragIfNeeded();

    event.preventDefault();
    isDraggingWindow = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartWindowX = windowX;
    dragStartWindowY = windowY;
    
    //  新增：派发拖拽开始事件，通知子组件关闭下拉列表
    if (modalElement) {
      modalElement.dispatchEvent(new CustomEvent('modal-drag-start', {
        bubbles: true,
        composed: true
      }));
    }
    
    activeDocument.addEventListener('mousemove', handleHeaderDragMove);
    activeDocument.addEventListener('mouseup', handleHeaderDragEnd);
    activeDocument.body.style.cursor = 'move';
    activeDocument.body.style.userSelect = 'none';
  }

  // 处理标题栏拖拽移动
  function handleHeaderDragMove(event: MouseEvent) {
    if (!isDraggingWindow) return;
    
    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;
    
    windowX = dragStartWindowX + deltaX;
    windowY = dragStartWindowY + deltaY;
    
    // 边界限制（保留至少100px可见区域）
    const maxX = window.innerWidth - Math.min(currentWidth, 100);
    const maxY = window.innerHeight - 100;
    const minX = -(currentWidth - 100);
    
    windowX = Math.max(minX, Math.min(windowX, maxX));
    windowY = Math.max(0, Math.min(windowY, maxY));
  }

  // 处理标题栏拖拽结束
  function handleHeaderDragEnd() {
    if (!isDraggingWindow) return;
    
    isDraggingWindow = false;
    
    activeDocument.removeEventListener('mousemove', handleHeaderDragMove);
    activeDocument.removeEventListener('mouseup', handleHeaderDragEnd);
    activeDocument.body.style.cursor = '';
    activeDocument.body.style.userSelect = '';
  }

  // 获取拖拽手柄对应的鼠标样式
  function getCursorForHandle(handle: string): string {
    switch (handle) {
      case 'right':
      case 'left':
        return 'ew-resize';
      case 'top':
      case 'bottom':
        return 'ns-resize';
      case 'top-left':
      case 'bottom-right':
        return 'nw-resize';
      case 'top-right':
      case 'bottom-left':
        return 'ne-resize';
      default:
        return 'default';
    }
  }


  function portalToBody(node: HTMLElement) {
    if (typeof activeDocument === 'undefined' || !activeDocument.body) {
      return;
    }

    activeDocument.body.appendChild(node);

    return {
      destroy() {
        if (node.isConnected) {
          node.remove();
        }
      }
    };
  }


  // 清理事件监听器
  onDestroy(() => {
    activeDocument.removeEventListener('mousemove', handleMouseMove);
    activeDocument.removeEventListener('mouseup', handleMouseUp);
    activeDocument.body.style.cursor = '';
    activeDocument.body.style.userSelect = '';

    if (mobileBoundsCleanup) {
      mobileBoundsCleanup();
      mobileBoundsCleanup = null;
    }
    
    // 如果模态窗口异常关闭，确保恢复焦点
    if (open) {
      focusManager.restoreFocus();
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div 
    class="resizable-modal-overlay"
    use:portalToBody
    class:transparent={enableTransparentMask}
    class:is-mobile={isMobile}
    style={isMobile && mobileBounds ? `top: ${mobileBounds.top}px; bottom: ${mobileBounds.bottom}px;` : undefined}
    onclick={maskClosable ? (e) => {
      // 只有点击背景时才关闭，且不是刚结束拖拽
      if (e.target === e.currentTarget && !justFinishedDragging) {
        handleClose();
      }
    } : undefined}
    role="presentation"
  >
    <div
      bind:this={modalElement}
      class="resizable-modal {className}"
      class:is-mobile={isMobile}
      style:width={isMobile ? '100%' : `${currentWidth}px`}
      style:height={isMobile ? 'auto' : `${currentHeight}px`}
      style:max-height={isMobile && mobileBounds ? `${mobileBounds.height - 24}px` : undefined}
      style:left={enableWindowDrag && !isMobile ? `${windowX}px` : undefined}
      style:top={enableWindowDrag && !isMobile ? `${windowY}px` : undefined}
      style:transform={enableWindowDrag && !isMobile ? 'none' : undefined}
      onkeydown={handleModalKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      tabindex="-1"
    >
      <!-- 模态窗头部 -->  
      {#if title || closable || headerActions}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <header 
          class="modal-header"
          class:draggable={enableWindowDrag}
          class:minimal={!title && !headerActions}
          onmousedown={enableWindowDrag ? handleHeaderDragStart : undefined}
          role={enableWindowDrag ? "button" : undefined}
          aria-label={enableWindowDrag ? "拖拽移动模态窗" : undefined}
          tabindex={enableWindowDrag ? 0 : undefined}
        >
          <div class="modal-header-left">
            {#if title}
              <h2 id="modal-title" class="modal-title with-accent-bar accent-{accentColor}">{title}</h2>
            {/if}
          </div>
          
          <div class="modal-header-right">
            <!-- 自定义标题栏操作（牌组、模板选择器等） -->
            {#if headerActions}
              <div class="modal-header-actions weave-modal-header-toolbar">
                {@render headerActions()}
              </div>
            {/if}
            
            {#if closable}
              <button
                class="clickable-icon modal-close-btn"
                onclick={handleClose}
                aria-label="关闭"
              >
                ✕
              </button>
            {/if}
          </div>
        </header>
      {/if}

      <!-- 隐藏拖拽区域（当没有header时） -->
      {#if enableWindowDrag && !title && !closable && !headerActions}
        <!-- 无标题栏时的拖拽按钮 -->
        <button
          type="button"
          class="top-drag-handle"
          onmousedown={handleHeaderDragStart}
          aria-label="拖动窗口"
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleHeaderDragStart(e as any);
            }
          }}
        >
          <span class="drag-handle-icon">⋮⋮</span>
        </button>
      {/if}

      <!-- 模态窗内容 -->
      <main class="modal-content">
        {@render children?.()}
      </main>

      <!-- 拖拽调整手柄 -->
      {#if modalSettings.enableResize}
        <!-- 边缘手柄 -->
        <div
          class="resize-handle resize-handle-right"
          role="button"
          tabindex="0"
          aria-label="调整窗口右边缘"
          onmousedown={(e) => handleMouseDown(e, 'right')}
          onkeydown={(e) => handleKeyDown(e, 'right')}
        ></div>
        <div
          class="resize-handle resize-handle-bottom"
          role="button"
          tabindex="0"
          aria-label="调整窗口下边缘"
          onmousedown={(e) => handleMouseDown(e, 'bottom')}
          onkeydown={(e) => handleKeyDown(e, 'bottom')}
        ></div>
        <div
          class="resize-handle resize-handle-left"
          role="button"
          tabindex="0"
          aria-label="调整窗口左边缘"
          onmousedown={(e) => handleMouseDown(e, 'left')}
          onkeydown={(e) => handleKeyDown(e, 'left')}
        ></div>
        <div
          class="resize-handle resize-handle-top"
          role="button"
          tabindex="0"
          aria-label="调整窗口上边缘"
          onmousedown={(e) => handleMouseDown(e, 'top')}
          onkeydown={(e) => handleKeyDown(e, 'top')}
        ></div>

        <!-- 角落手柄 -->
        <div
          class="resize-handle resize-handle-bottom-right"
          role="button"
          tabindex="0"
          aria-label="调整窗口右下角"
          onmousedown={(e) => handleMouseDown(e, 'bottom-right')}
          onkeydown={(e) => handleKeyDown(e, 'bottom-right')}
        ></div>
        <div
          class="resize-handle resize-handle-top-left"
          role="button"
          tabindex="0"
          aria-label="调整窗口左上角"
          onmousedown={(e) => handleMouseDown(e, 'top-left')}
          onkeydown={(e) => handleKeyDown(e, 'top-left')}
        ></div>
        <div
          class="resize-handle resize-handle-top-right"
          role="button"
          tabindex="0"
          aria-label="调整窗口右上角"
          onmousedown={(e) => handleMouseDown(e, 'top-right')}
          onkeydown={(e) => handleKeyDown(e, 'top-right')}
        ></div>
        <div
          class="resize-handle resize-handle-bottom-left"
          role="button"
          tabindex="0"
          aria-label="调整窗口左下角"
          onmousedown={(e) => handleMouseDown(e, 'bottom-left')}
          onkeydown={(e) => handleKeyDown(e, 'bottom-left')}
        ></div>
      {/if}

      <!-- 尺寸显示 -->
      {#if isDragging}
        <div class="size-indicator">
          {currentWidth} × {currentHeight}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .resizable-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    /* 遵循 Obsidian 层级：--layer-modal(50)，低于 --layer-menu(65) */
    z-index: var(--layer-modal);
    backdrop-filter: none;
    /*  修复焦点问题：遮罩层必须拦截事件，否则会导致焦点丢失 */
    pointer-events: auto;
    /*  移动端：添加 padding 确保居中 */
    padding: 12px;
  }

  .resizable-modal {
    background: var(--background-primary);
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    position: relative;
    min-width: 400px;
    min-height: 300px;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    /* 模态窗本体恢复事件接收 */
    pointer-events: auto;
    /*  确保模态窗内容在遮罩层之上 */
    z-index: 1;
  }
  
  /*  移动端适配：优化尺寸和间距，符合移动端设计规范 */
  @media (max-width: 768px) {
    .resizable-modal-overlay.is-mobile {
      /*  移动端：移除遮罩层背景，避免遮挡 Obsidian 底部编辑功能栏 */
      background: transparent !important;
      backdrop-filter: none !important;
      /* 移动端遮罩层使用 padding 确保内容不紧贴边缘 */
      padding: 16px;
      /* 确保垂直居中 */
      display: flex;
      align-items: center;
      justify-content: center;
      /* 移动端仍需要遮罩层拦截事件，避免触摸穿透到 Obsidian 底层 UI */
      pointer-events: auto !important;
    }
    
    .resizable-modal.is-mobile {
      /* 宽度：填满可用空间（减去 padding） */
      min-width: 100%;
      max-width: 100%;
      width: 100% !important;
      /* 使用固定高度而非 auto，确保滚动条能正常显示 */
      /* height: auto 会导致内容无限撑大，滚动条永远不会出现 */
      height: calc(100vh - 32px) !important;
      max-height: calc(100vh - 32px); /* 减去上下 padding */
      /* 圆角：移动端使用较大圆角 */
      border-radius: 12px;
      border: 1px solid var(--background-modifier-border);
      /* 移除 margin，由 overlay 的 padding 控制间距 */
      margin: 0;
      /* 阴影：增强层次感 */
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      /*  确保内容不溢出 */
      overflow: hidden;
      /* 模态窗本体必须接收事件 */
      pointer-events: auto !important;
    }
    
    /* 移动端禁用拖拽调整尺寸 */
    .resizable-modal.is-mobile .resize-handle {
      display: none;
    }
    
    /* 移动端禁用窗口拖拽 */
    .resizable-modal.is-mobile .modal-header.draggable {
      cursor: default;
    }
    
    .resizable-modal.is-mobile .modal-header.draggable:hover {
      background-color: transparent;
    }
    
    .resizable-modal.is-mobile .modal-header.draggable:active {
      cursor: default;
      background-color: transparent;
    }
  }

  /* 透明遮罩模式 - 允许点击外部区域 */
  .resizable-modal-overlay.transparent {
    background: transparent !important;
    backdrop-filter: none !important;
    /* 透明遮罩不拦截事件，允许点击外部区域 */
    pointer-events: none;
  }

  /*  移动端透明遮罩：仍然允许外部交互（覆盖 is-mobile 的默认拦截行为） */
  .resizable-modal-overlay.is-mobile.transparent {
    pointer-events: none !important;
  }

  .resizable-modal-overlay.transparent .resizable-modal {
    /*  模态窗本体仍然接收事件 */
    pointer-events: auto !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  /*  移动端适配 - 使用动态边界检测 */
  .resizable-modal-overlay.is-mobile {
    background: transparent !important;
    backdrop-filter: none !important;
    pointer-events: auto !important;
    padding: 12px;
  }

  .resizable-modal.is-mobile {
    min-width: 100% !important;
    max-width: 100% !important;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    pointer-events: auto !important;
    overflow: hidden;
  }

  /* 拖拽窗口时的定位 */
  .resizable-modal[style*="left"] {
    position: fixed;
    margin: 0;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem 0.5rem 1.5rem; /* 🎯 减少底部padding，消除间隙 */
    /*  移除分割线：border-bottom: 1px solid var(--background-modifier-border); */
    flex-shrink: 0;
    /*  确保标题栏在模态窗内容之上 */
    position: relative;
    z-index: 10;
    /*  标题栏圆角，与模态窗整体一致 */
    border-radius: 12px 12px 0 0;
  }

  .modal-header.draggable {
    /*  鼠标悬停时显示move光标 */
    cursor: move;
    user-select: none;
    /* 添加微妙的背景色提示 */
    transition: background-color 0.2s ease;
  }

  .modal-header.draggable:hover {
    /* 悬停时轻微高亮 */
    background-color: var(--background-modifier-hover);
  }

  .modal-header.draggable:active {
    /* 拖拽时显示grabbing光标 */
    cursor: grabbing;
    background-color: var(--background-modifier-active);
  }

  /*  最小化header样式 - 仅用于拖拽 */
  .modal-header.minimal {
    min-height: 32px;
    padding: 8px 12px;
    border-bottom: none;
    background: transparent;
    border-radius: 12px 12px 0 0;
  }
  
  .modal-header.minimal.draggable:hover {
    background: var(--background-modifier-hover);
  }

  .modal-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 0 0 auto;
  }

  .modal-header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 0 0 auto;
    margin-left: auto;
    /*  确保右侧控件在标题栏之上 */
    position: relative;
    z-index: 20;
  }

  .modal-header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    /*  超高 z-index 确保下拉选项显示在最上层 */
    position: relative;
    z-index: var(--weave-z-float);
  }

  .modal-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  /* 侧边颜色条见 accent-bar.css */

  .modal-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-width: 40px;
    padding: 0;
    background: transparent;
    border: none;
    box-shadow: none;
    font-size: 1.2rem;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--clickable-icon-radius, var(--radius-s));
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .modal-close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .modal-content {
    flex: 1;
    /* 使用 overflow: hidden 配合 flex 布局 */
    /* 让内部编辑器组件正确计算高度并启用滚动 */
    overflow: hidden;
    padding: 0;
    /*  最小高度为0，确保flex正确工作 */
    min-height: 0;
    /*  确保内容区域接收触摸事件 */
    pointer-events: auto;
    /*  确保内容区域参与 flex 布局 */
    display: flex;
    flex-direction: column;
  }
  
  /*  移动端：内容区域使用 flex 布局，让内部编辑器处理滚动 */
  @media (max-width: 768px) {
    .modal-content {
      /* 移除 overflow-y: auto，让内部 .cm-scroller 处理滚动 */
      /* 之前的 overflow-y: auto 会与编辑器内部滚动冲突 */
      overflow: hidden !important;
      -webkit-overflow-scrolling: touch;
      /*  确保 flex 布局正确传递高度约束 */
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  }

  /*  最小化header时，content区域上移贴合 */
  .modal-header.minimal + .modal-content {
    margin-top: -4px;
  }

  /*  已移除拖拽按钮，标题栏直接可拖拽 */

  /* 顶部拖拽按钮（无header时） */
  .top-drag-handle {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: none;
    border: none;
    cursor: move;
    padding: 4px 8px;
    border-radius: 3px;
    color: var(--text-muted);
    transition: all 0.2s ease;
    z-index: 10;
  }

  .top-drag-handle:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .top-drag-handle:active {
    cursor: grabbing;
    background: var(--background-modifier-active);
  }

  /* 拖拽调整手柄 */
  .resize-handle {
    position: absolute;
    background: transparent;
    z-index: 10;
  }

  .resize-handle:hover {
    background: var(--interactive-accent);
    opacity: 0.3;
  }

  /* 边缘手柄 */
  .resize-handle-right {
    top: 0;
    right: 0;
    width: 8px;
    height: 100%;
    cursor: ew-resize;
  }

  .resize-handle-bottom {
    bottom: 0;
    left: 0;
    width: 100%;
    height: 8px;
    cursor: ns-resize;
  }

  .resize-handle-left {
    top: 0;
    left: 0;
    width: 8px;
    height: 100%;
    cursor: ew-resize;
  }

  .resize-handle-top {
    top: 0;
    left: 0;
    width: 100%;
    height: 8px;
    cursor: ns-resize;
  }

  /* 角落手柄 */
  .resize-handle-bottom-right {
    bottom: 0;
    right: 0;
    width: 16px;
    height: 16px;
    cursor: nw-resize;
  }

  .resize-handle-top-left {
    top: 0;
    left: 0;
    width: 16px;
    height: 16px;
    cursor: nw-resize;
  }

  .resize-handle-top-right {
    top: 0;
    right: 0;
    width: 16px;
    height: 16px;
    cursor: ne-resize;
  }

  .resize-handle-bottom-left {
    bottom: 0;
    left: 0;
    width: 16px;
    height: 16px;
    cursor: ne-resize;
  }

  /* 尺寸指示器 */
  .size-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    color: var(--text-normal);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: none;
    z-index: 20;
  }

</style>
