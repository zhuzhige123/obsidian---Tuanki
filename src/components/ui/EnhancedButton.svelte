<script lang="ts">
  import type { Snippet } from "svelte";
  import EnhancedIcon from "./EnhancedIcon.svelte";
  import { createEventDispatcher } from "svelte";

  interface Props {
    // 基础属性
    variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "warning" | "info";
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    disabled?: boolean;
    loading?: boolean;
    
    // 图标相关
    icon?: string;
    iconPosition?: "left" | "right";
    iconOnly?: boolean;
    
    // 交互相关
    onclick?: (event: MouseEvent) => void;
    onhover?: (event: MouseEvent) => void;
    onfocus?: (event: FocusEvent) => void;
    
    // 无障碍和提示
    ariaLabel?: string;
    tooltip?: string;
    shortcut?: string;
    
    // 样式相关
    class?: string;
    fullWidth?: boolean;
    rounded?: boolean;
    
    // 高级功能
    href?: string;
    target?: string;
    type?: "button" | "submit" | "reset";
    
    // 内容
    children?: Snippet;
    
    // 支持所有 data-* 属性
    [key: `data-${string}`]: string | undefined;
  }
  
  let {
    variant = "secondary",
    size = "md",
    disabled = false,
    loading = false,
    icon,
    iconPosition = "left",
    iconOnly = false,
    onclick,
    onhover,
    onfocus,
    ariaLabel,
    tooltip,
    shortcut,
    class: className = "",
    fullWidth = false,
    rounded = false,
    href,
    target,
    type = "button",
    children,
    ...restProps
  }: Props = $props();

  const dispatch = createEventDispatcher();

  // 计算CSS类
  let buttonClasses = $derived(() => {
    const classes = [
      'tuanki-btn',
      `tuanki-btn--${variant}`,
      `tuanki-btn--${size}`,
    ];
    
    if (loading) classes.push('tuanki-btn--loading');
    if (disabled) classes.push('tuanki-btn--disabled');
    if (fullWidth) classes.push('tuanki-btn--full-width');
    if (rounded) classes.push('tuanki-btn--rounded');
    if (iconOnly) classes.push('tuanki-btn--icon-only');
    if (className) classes.push(className);
    
    return classes.join(' ');
  });

  // 处理点击事件
  function handleClick(event: MouseEvent) {
    if (disabled || loading) return;
    onclick?.(event);
    dispatch('click', event);
  }

  // 处理悬停事件
  function handleMouseOver(event: MouseEvent) {
    if (disabled) return;
    onhover?.(event);
    dispatch('hover', event);
  }

  // 处理焦点事件
  function handleFocus(event: FocusEvent) {
    if (disabled) return;
    onfocus?.(event);
    dispatch('focus', event);
  }

  // 计算图标尺寸
  let iconSize = $derived(() => {
    switch (size) {
      case 'xs': return 12;
      case 'sm': return 14;
      case 'md': return 16;
      case 'lg': return 18;
      case 'xl': return 20;
      default: return 16;
    }
  });
</script>

<!-- 如果有href，渲染为链接 -->
{#if href}
  <a
    {href}
    {target}
    class={buttonClasses()}
    aria-label={ariaLabel}
    title={tooltip}
    onclick={handleClick}
    onmouseover={handleMouseOver}
    onfocus={handleFocus}
    {...restProps}
  >
    {#if loading}
      <EnhancedIcon name="spinner" size={iconSize()} animation="spin" />
    {:else if icon && iconPosition === "left"}
      <EnhancedIcon name={icon} size={iconSize()} />
    {/if}

    {#if !iconOnly}
      <span class="tuanki-btn__text">
        {@render children?.()}
      </span>
    {/if}

    {#if icon && iconPosition === "right" && !loading}
      <EnhancedIcon name={icon} size={iconSize()} />
    {/if}
    
    {#if shortcut}
      <kbd class="tuanki-btn__shortcut">{shortcut}</kbd>
    {/if}
  </a>
{:else}
  <!-- 普通按钮 -->
  <button
    {type}
    class={buttonClasses()}
    {disabled}
    aria-label={ariaLabel}
    title={tooltip}
    onclick={handleClick}
    onmouseover={handleMouseOver}
    onfocus={handleFocus}
    {...restProps}
  >
    {#if loading}
      <EnhancedIcon name="spinner" size={iconSize()} animation="spin" />
    {:else if icon && iconPosition === "left"}
      <EnhancedIcon name={icon} size={iconSize()} />
    {/if}

    {#if !iconOnly}
      <span class="tuanki-btn__text">
        {@render children?.()}
      </span>
    {/if}

    {#if icon && iconPosition === "right" && !loading}
      <EnhancedIcon name={icon} size={iconSize()} />
    {/if}
    
    {#if shortcut}
      <kbd class="tuanki-btn__shortcut">{shortcut}</kbd>
    {/if}
  </button>
{/if}

<style>
  /* 基础按钮样式 */
  .tuanki-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-family: var(--font-interface);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    position: relative;
    overflow: hidden;
    white-space: nowrap;
    user-select: none;
    min-width: auto;
    width: auto;
    box-sizing: border-box;
  }

  .tuanki-btn:focus-visible {
    outline: 2px solid var(--tuanki-accent-color);
    outline-offset: 2px;
  }

  /* 禁用状态 */
  .tuanki-btn--disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* 加载状态 */
  .tuanki-btn--loading {
    cursor: wait;
    pointer-events: none;
  }

  /* 全宽 */
  .tuanki-btn--full-width {
    width: 100%;
  }

  /* 圆角 */
  .tuanki-btn--rounded {
    border-radius: 9999px;
  }

  /* 仅图标 */
  .tuanki-btn--icon-only {
    aspect-ratio: 1;
    padding: var(--tuanki-space-sm);
  }

  /* 尺寸变体 - 优化内边距，内容自适应宽度 */
  .tuanki-btn--xs {
    font-size: 0.75rem;
    padding: 4px 8px;
    min-height: 1.5rem;
    min-width: auto;
  }

  .tuanki-btn--sm {
    font-size: 0.875rem;
    padding: 6px 12px;
    min-height: 2rem;
    min-width: auto;
  }

  .tuanki-btn--md {
    font-size: 0.875rem;
    padding: 8px 16px;
    min-height: 2.25rem;
    min-width: auto;
  }

  .tuanki-btn--lg {
    font-size: 1rem;
    padding: 10px 20px;
    min-height: 2.75rem;
    min-width: auto;
  }

  .tuanki-btn--xl {
    font-size: 1.125rem;
    padding: 12px 24px;
    min-height: 3rem;
    min-width: auto;
  }

  /* 仅图标尺寸调整 */
  .tuanki-btn--icon-only.tuanki-btn--xs {
    width: 1.5rem;
    height: 1.5rem;
    padding: var(--tuanki-space-xs);
  }

  .tuanki-btn--icon-only.tuanki-btn--sm {
    width: 2rem;
    height: 2rem;
    padding: var(--tuanki-space-xs);
  }

  .tuanki-btn--icon-only.tuanki-btn--md {
    width: 2.25rem;
    height: 2.25rem;
    padding: var(--tuanki-space-sm);
  }

  .tuanki-btn--icon-only.tuanki-btn--lg {
    width: 2.75rem;
    height: 2.75rem;
    padding: var(--tuanki-space-sm);
  }

  .tuanki-btn--icon-only.tuanki-btn--xl {
    width: 3rem;
    height: 3rem;
    padding: var(--tuanki-space-md);
  }

  /* 颜色变体 */
  .tuanki-btn--primary {
    background: var(--tuanki-gradient-primary);
    color: var(--tuanki-text-on-accent);
    border-color: transparent;
  }

  .tuanki-btn--primary:hover:not(.tuanki-btn--disabled):not(.tuanki-btn--loading) {
    background: var(--tuanki-primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
  }

  .tuanki-btn--secondary {
    background: var(--tuanki-secondary-bg);
    color: var(--tuanki-text-primary);
    border-color: var(--tuanki-border);
  }

  .tuanki-btn--secondary:hover:not(.tuanki-btn--disabled):not(.tuanki-btn--loading) {
    background: var(--tuanki-hover);
    border-color: var(--tuanki-border-hover);
  }

  .tuanki-btn--ghost {
    background: transparent;
    color: var(--tuanki-text-primary);
    border-color: transparent;
  }

  .tuanki-btn--ghost:hover:not(.tuanki-btn--disabled):not(.tuanki-btn--loading) {
    background: var(--tuanki-hover);
  }

  .tuanki-btn--danger {
    background: var(--tuanki-error);
    color: var(--tuanki-text-on-accent);
    border-color: transparent;
  }

  .tuanki-btn--danger:hover:not(.tuanki-btn--disabled):not(.tuanki-btn--loading) {
    background: var(--tuanki-danger-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }

  .tuanki-btn--success {
    background: var(--tuanki-success);
    color: var(--tuanki-text-on-accent);
    border-color: transparent;
  }

  .tuanki-btn--success:hover:not(.tuanki-btn--disabled):not(.tuanki-btn--loading) {
    background: var(--tuanki-success-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  }

  .tuanki-btn--warning {
    background: var(--tuanki-warning);
    color: var(--tuanki-text-on-accent);
    border-color: transparent;
  }

  .tuanki-btn--warning:hover:not(.tuanki-btn--disabled):not(.tuanki-btn--loading) {
    background: var(--tuanki-warning-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  }

  .tuanki-btn--info {
    background: var(--tuanki-info);
    color: var(--tuanki-text-on-accent);
    border-color: transparent;
  }

  .tuanki-btn--info:hover:not(.tuanki-btn--disabled):not(.tuanki-btn--loading) {
    background: var(--tuanki-info-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  /* 按钮内容 */
  .tuanki-btn__text {
    line-height: 1;
  }

  /* 快捷键显示 */
  .tuanki-btn__shortcut {
    font-family: var(--font-monospace, monospace);
    font-size: 0.75em;
    padding: 0.125rem 0.25rem;
    background: rgba(255, 255, 255, 0.2);
    border-radius: var(--tuanki-radius-sm);
    margin-left: var(--tuanki-space-sm);
    opacity: 0.8;
  }

  /* 活动状态 */
  .tuanki-btn:active:not(.tuanki-btn--disabled):not(.tuanki-btn--loading) {
    transform: translateY(0);
    box-shadow: none;
  }

  /* 焦点状态增强 */
  .tuanki-btn:focus-visible {
    outline: 2px solid var(--tuanki-accent-color);
    outline-offset: 2px;
    z-index: 1;
  }
</style>
