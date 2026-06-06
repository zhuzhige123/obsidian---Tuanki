<script lang="ts">
  /**
   * 可拖拽复选框包裹器
   * 负责处理长按触发拖拽批量选择的交互逻辑
   * 将交互逻辑与复选框UI分离，符合单一职责原则
   */
  import TableCheckbox from "./TableCheckbox.svelte";
  
  interface Props {
    checked: boolean;
    indeterminate?: boolean;
    onchange: (checked: boolean) => void;
    ariaLabel?: string;
    cardId: string;
    onDragSelectStart?: (cardId: string) => void;
    onDragSelectMove?: (cardId: string) => void;
    isDragSelectActive?: boolean;
  }
  
  let {
    checked,
    indeterminate = false,
    onchange,
    ariaLabel = "选择",
    cardId,
    onDragSelectStart,
    onDragSelectMove,
    isDragSelectActive = false
  }: Props = $props();
  
  // 长按状态（纯Svelte响应式）
  let isLongPressing = $state(false);
  let longPressTimer: NodeJS.Timeout | null = null;
  let isPressed = $state(false);
  
  const LONG_PRESS_DURATION = 500; // 500ms
  
  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return; // 只处理左键
    
    isPressed = true;
    
    // 设置长按定时器
    longPressTimer = setTimeout(() => {
      if (isPressed) {
        isLongPressing = true;
      }
    }, LONG_PRESS_DURATION);
  }
  
  function handleMouseUp(event: MouseEvent) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    
    // 在拖拽模式下防止触发正常的点击事件
    if (isDragSelectActive) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    isPressed = false;
    isLongPressing = false;
  }
  
  function handleMouseEnter() {
    if (isDragSelectActive && onDragSelectMove) {
      onDragSelectMove(cardId);
    }
  }
  
  function handleMouseLeave() {
    if (longPressTimer && !isDragSelectActive) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      isPressed = false;
    }
  }
  
  function handleSelectStart(event: Event) {
    if (isDragSelectActive) {
      event.preventDefault();
    }
  }
  
  // 长按触发拖拽选择
  $effect(() => {
    if (isLongPressing && onDragSelectStart) {
      onDragSelectStart(cardId);
      
      // 阻止页面滚动和文本选择
      activeDocument.body.style.userSelect = 'none';
      
      // 触发后重置长按状态
      isLongPressing = false;
    }
  });
  
  // 拖拽模式结束时恢复页面状态
  $effect(() => {
    if (!isDragSelectActive) {
      activeDocument.body.style.userSelect = '';
    }
  });
</script>

<div
  class="draggable-checkbox-wrapper"
  class:drag-select-mode={isDragSelectActive}
  class:long-pressing={isLongPressing}
  onmousedown={handleMouseDown}
  onmouseup={handleMouseUp}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onselectstart={handleSelectStart}
  role="gridcell"
  tabindex="0"
  aria-label={ariaLabel}
>
  <TableCheckbox
    {checked}
    {indeterminate}
    {onchange}
  />
</div>

<style>
  .draggable-checkbox-wrapper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: pointer;
    /* 移除 padding，避免与表头复选框位置不一致 */
    padding: 0;
  }
  
  /* 拖拽批量选择模式 */
  .draggable-checkbox-wrapper.drag-select-mode {
    cursor: crosshair;
  }
  
  .draggable-checkbox-wrapper.drag-select-mode :global(.weave-checkbox-custom) {
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent, var(--interactive-accent)) 50%, transparent);
    transform: scale(1.1);
    border-color: var(--color-accent, var(--interactive-accent));
  }
  
  /* 长按激活动画 */
  .draggable-checkbox-wrapper.long-pressing :global(.weave-checkbox-custom) {
    animation: pulse-select 0.3s ease-in-out;
  }
  
  @keyframes pulse-select {
    0% { transform: scale(1); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1.1); }
  }
  
  /* 防止文本选择 */
  .draggable-checkbox-wrapper.drag-select-mode {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }
</style>
