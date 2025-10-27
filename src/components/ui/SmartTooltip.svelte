<script lang="ts">
  /**
   * 智能提示组件
   * 提供上下文相关的帮助信息和操作指导
   */
  
  import { onMount, onDestroy } from 'svelte';
  import EnhancedIcon from './EnhancedIcon.svelte';

  interface TooltipAction {
    label: string;
    action: () => void;
    icon?: string;
    variant?: 'primary' | 'secondary' | 'danger';
  }

  interface Props {
    content: string;
    title?: string;
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
    trigger?: 'hover' | 'click' | 'focus' | 'manual';
    delay?: number;
    maxWidth?: number;
    showArrow?: boolean;
    interactive?: boolean;
    actions?: TooltipAction[];
    variant?: 'default' | 'info' | 'warning' | 'error' | 'success';
    persistent?: boolean;
    zIndex?: number;
    onshow?: () => void;
    onhide?: () => void;
    onaction?: (action: TooltipAction) => void;
    children?: any;
  }

  let {
    content,
    title,
    placement = 'auto',
    trigger = 'hover',
    delay = 300,
    maxWidth = 300,
    showArrow = true,
    interactive = false,
    actions = [],
    variant = 'default',
    persistent = false,
    zIndex = 1000,
    onshow,
    onhide,
    onaction,
    children
  }: Props = $props();

  let triggerElement: HTMLElement;
  let tooltipElement = $state<HTMLElement>();
  let isVisible = $state(false);
  let actualPlacement = $state(placement);
  let showTimer: NodeJS.Timeout | null = null;
  let hideTimer: NodeJS.Timeout | null = null;

  // 计算位置
  function calculatePosition() {
    if (!triggerElement || !tooltipElement) return;

    const triggerRect = triggerElement.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    let finalPlacement = placement;

    // 自动计算最佳位置
    if (placement === 'auto') {
      const spaceTop = triggerRect.top;
      const spaceBottom = viewport.height - triggerRect.bottom;
      const spaceLeft = triggerRect.left;
      const spaceRight = viewport.width - triggerRect.right;

      const maxSpace = Math.max(spaceTop, spaceBottom, spaceLeft, spaceRight);

      if (maxSpace === spaceBottom) {
        finalPlacement = 'bottom';
      } else if (maxSpace === spaceTop) {
        finalPlacement = 'top';
      } else if (maxSpace === spaceRight) {
        finalPlacement = 'right';
      } else {
        finalPlacement = 'left';
      }
    }

    actualPlacement = finalPlacement;

    // 计算具体位置
    let top = 0;
    let left = 0;

    switch (finalPlacement) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - 8;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + 8;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.left - tooltipRect.width - 8;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.right + 8;
        break;
    }

    // 确保不超出视口
    left = Math.max(8, Math.min(left, viewport.width - tooltipRect.width - 8));
    top = Math.max(8, Math.min(top, viewport.height - tooltipRect.height - 8));

    tooltipElement.style.top = `${top}px`;
    tooltipElement.style.left = `${left}px`;
  }

  // 显示提示
  function show() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    if (showTimer) return;

    showTimer = setTimeout(() => {
      isVisible = true;
      onshow?.();
      showTimer = null;

      // 下一帧计算位置
      requestAnimationFrame(() => {
        calculatePosition();
      });
    }, delay);
  }

  // 隐藏提示
  function hide() {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }

    if (persistent) return;

    if (hideTimer) return;

    hideTimer = setTimeout(() => {
      isVisible = false;
      onhide?.();
      hideTimer = null;
    }, interactive ? 100 : 0);
  }

  // 立即隐藏
  function hideImmediate() {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    isVisible = false;
    onhide?.();
  }

  // 处理动作点击
  function handleActionClick(action: TooltipAction) {
    action.action();
    onaction?.(action);
    if (!persistent) {
      hideImmediate();
    }
  }

  // 事件处理
  function handleTriggerMouseEnter() {
    if (trigger === 'hover') {
      show();
    }
  }

  function handleTriggerMouseLeave() {
    if (trigger === 'hover') {
      hide();
    }
  }

  function handleTriggerClick() {
    if (trigger === 'click') {
      if (isVisible) {
        hideImmediate();
      } else {
        show();
      }
    }
  }

  function handleTriggerFocus() {
    if (trigger === 'focus') {
      show();
    }
  }

  function handleTriggerBlur() {
    if (trigger === 'focus') {
      hide();
    }
  }

  function handleTooltipMouseEnter() {
    if (interactive && hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function handleTooltipMouseLeave() {
    if (interactive) {
      hide();
    }
  }

  // 键盘事件
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isVisible) {
      hideImmediate();
    }
  }

  // 窗口调整大小时重新计算位置
  function handleResize() {
    if (isVisible) {
      calculatePosition();
    }
  }

  // 生命周期
  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('scroll', handleResize, true);
    
    if (showTimer) clearTimeout(showTimer);
    if (hideTimer) clearTimeout(hideTimer);
  });

  // 公开方法
  export function showTooltip() {
    show();
  }

  export function hideTooltip() {
    hideImmediate();
  }

  export function toggleTooltip() {
    if (isVisible) {
      hideImmediate();
    } else {
      show();
    }
  }
</script>

<div class="tooltip-container">
  <!-- 触发元素 -->
  <div
    bind:this={triggerElement}
    class="tooltip-trigger"
    onmouseenter={handleTriggerMouseEnter}
    onmouseleave={handleTriggerMouseLeave}
    onclick={handleTriggerClick}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleTriggerClick()}
    onfocus={handleTriggerFocus}
    onblur={handleTriggerBlur}
    role="button"
    tabindex="0"
    aria-describedby={isVisible ? 'tooltip-content' : undefined}
    aria-label="显示提示信息"
  >
{@render children?.()}
  </div>

  <!-- 提示内容 -->
  {#if isVisible}
    <div
      bind:this={tooltipElement}
      class="tooltip tooltip--{variant} tooltip--{actualPlacement}"
      class:tooltip--interactive={interactive}
      class:tooltip--with-actions={actions.length > 0}
      style="max-width: {maxWidth}px; z-index: {zIndex};"
      onmouseenter={handleTooltipMouseEnter}
      onmouseleave={handleTooltipMouseLeave}
      role="tooltip"
      id="tooltip-content"
    >
      {#if showArrow}
        <div class="tooltip-arrow"></div>
      {/if}

      <div class="tooltip-content">
        {#if title}
          <div class="tooltip-title">{title}</div>
        {/if}
        
        <div class="tooltip-body">
          {@html content}
        </div>

        {#if actions.length > 0}
          <div class="tooltip-actions">
            {#each actions as action}
              <button
                type="button"
                class="tooltip-action tooltip-action--{action.variant || 'secondary'}"
                onclick={() => handleActionClick(action)}
              >
                {#if action.icon}
                  <EnhancedIcon name={action.icon} size="14" />
                {/if}
                {action.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .tooltip-container {
    position: relative;
    display: inline-block;
  }

  .tooltip-trigger {
    display: contents;
  }

  .tooltip {
    position: fixed;
    background-color: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 13px;
    line-height: 1.4;
    opacity: 0;
    transform: scale(0.95);
    animation: tooltipShow 0.15s ease forwards;
    pointer-events: none;
  }

  .tooltip--interactive {
    pointer-events: auto;
  }

  .tooltip-content {
    padding: 8px 12px;
  }

  .tooltip--with-actions .tooltip-content {
    padding-bottom: 4px;
  }

  .tooltip-title {
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--text-normal);
  }

  .tooltip-body {
    color: var(--text-muted);
  }

  .tooltip-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .tooltip-action {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tooltip-action--primary {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .tooltip-action--primary:hover {
    background-color: var(--interactive-accent-hover);
  }

  .tooltip-action--secondary {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .tooltip-action--secondary:hover {
    background-color: var(--background-modifier-border);
  }

  .tooltip-action--danger {
    background-color: var(--text-error);
    color: var(--text-on-accent);
  }

  .tooltip-action--danger:hover {
    background-color: var(--text-error);
    opacity: 0.9;
  }

  /* 箭头 */
  .tooltip-arrow {
    position: absolute;
    width: 8px;
    height: 8px;
    background-color: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    transform: rotate(45deg);
  }

  .tooltip--top .tooltip-arrow {
    bottom: -5px;
    left: 50%;
    margin-left: -4px;
    border-top: none;
    border-left: none;
  }

  .tooltip--bottom .tooltip-arrow {
    top: -5px;
    left: 50%;
    margin-left: -4px;
    border-bottom: none;
    border-right: none;
  }

  .tooltip--left .tooltip-arrow {
    right: -5px;
    top: 50%;
    margin-top: -4px;
    border-left: none;
    border-bottom: none;
  }

  .tooltip--right .tooltip-arrow {
    left: -5px;
    top: 50%;
    margin-top: -4px;
    border-right: none;
    border-top: none;
  }

  /* 变体样式 */
  .tooltip--info {
    border-color: var(--text-accent);
  }

  .tooltip--info .tooltip-arrow {
    border-color: var(--text-accent);
  }

  .tooltip--warning {
    border-color: var(--text-warning);
    background-color: var(--background-modifier-warning);
  }

  .tooltip--warning .tooltip-arrow {
    border-color: var(--text-warning);
    background-color: var(--background-modifier-warning);
  }

  .tooltip--error {
    border-color: var(--text-error);
    background-color: var(--background-modifier-error);
  }

  .tooltip--error .tooltip-arrow {
    border-color: var(--text-error);
    background-color: var(--background-modifier-error);
  }

  .tooltip--success {
    border-color: var(--text-success);
    background-color: var(--background-modifier-success);
  }

  .tooltip--success .tooltip-arrow {
    border-color: var(--text-success);
    background-color: var(--background-modifier-success);
  }

  /* 动画 */
  @keyframes tooltipShow {
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .tooltip {
      max-width: calc(100vw - 32px) !important;
      font-size: 14px;
    }

    .tooltip-content {
      padding: 12px 16px;
    }

    .tooltip-actions {
      flex-direction: column;
    }

    .tooltip-action {
      justify-content: center;
      padding: 8px 12px;
    }
  }

  /* 高对比度模式 */
  @media (prefers-contrast: high) {
    .tooltip {
      border-width: 2px;
    }

    .tooltip-arrow {
      border-width: 2px;
    }
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .tooltip {
      animation: none;
      opacity: 1;
      transform: scale(1);
    }

    .tooltip-action {
      transition: none;
    }
  }
</style>
