<!--
  可拖拽调整尺寸的模态窗组件
  职责：提供可拖拽边框调整尺寸的模态窗功能
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';
  import { MODAL_SIZE_PRESETS, MODAL_SIZE_LIMITS } from '../settings/constants/settings-constants';
  import type AnkiPlugin from '../../main';

  interface Props {
    /** 是否显示模态窗 */
    open: boolean;

    /** 关闭回调 */
    onClose: () => void;

    /** 插件实例 - 用于获取尺寸设置 */
    plugin: AnkiPlugin;

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
    headerActions
  }: Props = $props();

  let modalElement = $state<HTMLElement>();
  let isDragging = $state(false);
  let dragHandle = $state('');
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

  // ✅ 性能优化：延迟初始化标志
  let isDragInitialized = $state(false);
  let isWindowDragInitialized = $state(false);

  // 获取当前尺寸设置
  let modalSettings = $state(plugin.settings.editorModalSize || {
    preset: 'large',
    customWidth: 800,
    customHeight: 600,
    rememberLastSize: true,
    enableResize: true
  });

  // 当前模态窗尺寸
  let currentWidth = $state(modalSettings.customWidth || 800);
  let currentHeight = $state(modalSettings.customHeight || 600);

  // ✅ 性能优化：仅初始化必要的尺寸，延迟初始化拖拽功能
  onMount(() => {
    const presetKey = modalSettings.preset as keyof typeof MODAL_SIZE_PRESETS;
    if (modalSettings.preset !== 'custom' && MODAL_SIZE_PRESETS[presetKey]) {
      const preset = MODAL_SIZE_PRESETS[presetKey];
      currentWidth = preset.width;
      currentHeight = preset.height;
    }

    // ✅ 修复：如果启用窗口拖拽，初始化时就计算居中位置
    // （确保窗口打开时就在正确位置，而不是左上角）
    if (enableWindowDrag) {
      windowX = Math.max(0, (window.innerWidth - currentWidth) / 2);
      windowY = Math.max(50, (window.innerHeight - currentHeight) / 2);
      isWindowDragInitialized = true;
    }
  });

  // 处理键盘事件
  function handleKeydown(event: KeyboardEvent) {
    if (keyboard && event.key === 'Escape' && open) {
      handleClose();
    }
  }

  // 处理关闭
  function handleClose() {
    // 如果启用了记忆尺寸，保存当前尺寸
    if (modalSettings.rememberLastSize) {
      saveCurrentSize();
    }
    open = false;
    onClose();
  }

  // 保存当前尺寸到设置
  async function saveCurrentSize() {
    try {
      plugin.settings.editorModalSize = {
        ...modalSettings,
        customWidth: currentWidth,
        customHeight: currentHeight,
        preset: 'custom'
      };
      await plugin.saveSettings();
    } catch (error) {
      console.error('保存模态窗尺寸失败:', error);
    }
  }

  // ✅ 性能优化：延迟初始化拖拽功能
  function initializeDragIfNeeded() {
    if (isDragInitialized) return;
    isDragInitialized = true;
    console.log('[ResizableModal] 拖拽功能已初始化');
  }

  // 处理拖拽开始
  function handleMouseDown(event: MouseEvent, handle: string) {
    if (!modalSettings.enableResize) return;

    // ✅ 性能优化：首次拖拽时才初始化
    initializeDragIfNeeded();

    event.preventDefault();
    isDragging = true;
    dragHandle = handle;
    startX = event.clientX;
    startY = event.clientY;
    startWidth = currentWidth;
    startHeight = currentHeight;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = getCursorForHandle(handle);
    document.body.style.userSelect = 'none';
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

  // 处理模态框键盘导航
  function handleModalKeyDown(event: KeyboardEvent) {
    // ✅ 只处理 ESC 键，其他键让 Obsidian 处理
    if (event.key === 'Escape' && keyboard) {
      event.preventDefault();
      event.stopPropagation();
      handleClose();
    }
    // ✅ 不阻止其他键事件，让 Obsidian 快捷键正常工作
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
    isDragging = false;
    dragHandle = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // ✅ 性能优化：延迟初始化窗口拖拽（位置已在 onMount 中初始化）
  function initializeWindowDragIfNeeded() {
    if (isWindowDragInitialized) return;
    
    // 如果由于某种原因位置未初始化，这里作为后备
    if (windowX === 0 && windowY === 0) {
      windowX = Math.max(0, (window.innerWidth - currentWidth) / 2);
      windowY = Math.max(50, (window.innerHeight - currentHeight) / 2);
    }
    isWindowDragInitialized = true;
    
    console.log('[ResizableModal] 窗口拖拽功能已初始化');
  }

  // 处理标题栏拖拽开始（移动窗口）
  function handleHeaderDragStart(event: MouseEvent) {
    if (!enableWindowDrag) return;
    
    // 只允许在标题栏空白区域拖拽，不包括按钮和下拉面板
    const target = event.target as HTMLElement;
    
    // ✅ 排除按钮元素
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }
    
    // ✅ 排除下拉面板和下拉面板内的元素（双重保险）
    if (target.classList.contains('dropdown-panel') || 
        target.closest('.dropdown-panel') ||
        target.classList.contains('dropdown-item') ||
        target.closest('.dropdown-item')) {
      return;
    }
    
    // ✅ 性能优化：首次拖拽时才初始化
    initializeWindowDragIfNeeded();
    
    event.preventDefault();
    isDraggingWindow = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartWindowX = windowX;
    dragStartWindowY = windowY;
    
    // ✅ 新增：派发拖拽开始事件，通知子组件关闭下拉列表
    if (modalElement) {
      modalElement.dispatchEvent(new CustomEvent('modal-drag-start', {
        bubbles: true,
        composed: true
      }));
    }
    
    document.addEventListener('mousemove', handleHeaderDragMove);
    document.addEventListener('mouseup', handleHeaderDragEnd);
    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';
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
    
    document.removeEventListener('mousemove', handleHeaderDragMove);
    document.removeEventListener('mouseup', handleHeaderDragEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
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

  // 清理事件监听器
  onDestroy(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div 
    class="resizable-modal-overlay"
    class:transparent={enableTransparentMask}
    onclick={maskClosable ? handleClose : undefined}
    role="presentation"
  >
    <div
      bind:this={modalElement}
      class="resizable-modal {className}"
      style:width="{currentWidth}px"
      style:height="{currentHeight}px"
      style:left={enableWindowDrag ? `${windowX}px` : undefined}
      style:top={enableWindowDrag ? `${windowY}px` : undefined}
      style:transform={enableWindowDrag ? 'none' : undefined}
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleModalKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      tabindex="-1"
    >
      <!-- 模态窗头部 -->
      {#if title || closable || headerActions}
        <header 
          class="modal-header"
          class:draggable={enableWindowDrag}
          role={enableWindowDrag ? 'button' : undefined}
          tabindex={enableWindowDrag ? 0 : undefined}
          aria-label={enableWindowDrag ? '拖动窗口' : undefined}
          onmousedown={enableWindowDrag ? handleHeaderDragStart : undefined}
          onkeydown={(e) => {
            if (enableWindowDrag && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleHeaderDragStart(e as any);
            }
          }}
          style:cursor={enableWindowDrag ? 'move' : 'default'}
        >
          <div class="modal-header-left">
            {#if title}
              <h2 id="modal-title" class="modal-title">{title}</h2>
            {/if}
          </div>
          
          <div class="modal-header-right">
            <!-- 自定义标题栏操作（牌组、模板选择器等） -->
            {#if headerActions}
              <div class="modal-header-actions">
                {@render headerActions()}
              </div>
            {/if}
            
            {#if closable}
              <button
                class="modal-close-btn"
                onclick={handleClose}
                aria-label="关闭"
              >
                ✕
              </button>
            {/if}
          </div>
        </header>
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
    /* ✅ 超高 z-index 确保在所有界面之上显示 */
    z-index: 10000000;
    backdrop-filter: blur(2px);
    /* ✅ 关键修复：遮罩层不拦截鼠标事件，允许与Obsidian主界面和菜单交互 */
    pointer-events: none;
  }

  .resizable-modal {
    background: var(--background-primary);
    border-radius: 8px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    position: relative;
    min-width: 400px;
    min-height: 300px;
    max-width: 90vw;
    max-height: 90vh;
    /* ✅ 关键修复：模态窗本体恢复事件接收 */
    pointer-events: auto;
    /* ✅ 确保模态窗内容在遮罩层之上 */
    z-index: 1;
  }

  /* 透明遮罩模式 */
  .resizable-modal-overlay.transparent {
    background: transparent !important;
    backdrop-filter: none !important;
    pointer-events: none !important;
  }

  .resizable-modal-overlay.transparent .resizable-modal {
    pointer-events: auto !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
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
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
    /* ✅ 确保标题栏在模态窗内容之上 */
    position: relative;
    z-index: 10;
  }

  .modal-header.draggable {
    cursor: move;
    user-select: none;
  }

  .modal-header.draggable:active {
    cursor: grabbing;
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
    /* ✅ 确保右侧控件在标题栏之上 */
    position: relative;
    z-index: 20;
  }

  .modal-header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    /* ✅ 超高 z-index 确保下拉选项显示在最上层 */
    position: relative;
    z-index: 100;
  }

  .modal-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .modal-close-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .modal-close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .modal-content {
    flex: 1;
    /* ✅ 关键：不设置overflow，让内部组件自行管理滚动 */
    /* InlineCardEditor内部已有overflow: auto的滚动容器 */
    overflow: visible;
    padding: 0;
    /* ✅ 最小高度为0，确保flex正确工作 */
    min-height: 0;
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
