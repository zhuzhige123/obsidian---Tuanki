<script lang="ts">
  import { DesignTokens } from '../../design/tokens';
  import type { ButtonVariant, ButtonSize } from './index';

  // Props
  interface Props {
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    onclick?: (event?: MouseEvent) => void;
  }
  const {
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    fullWidth = false,
    onclick
  }: Props = $props();

  // 内部状态
  let buttonElement: HTMLButtonElement;

  // 计算样式类
  const variantClass = $derived(getVariantClass(variant));
  const sizeClass = $derived(getSizeClass(size));
  const classes = $derived([
    'cursor-button',
    variantClass,
    sizeClass,
    fullWidth && 'full-width',
    disabled && 'disabled',
    loading && 'loading'
  ].filter(Boolean).join(' '));

  function getVariantClass(variant: ButtonVariant): string {
    switch (variant) {
      case 'primary':
        return 'variant-primary';
      case 'secondary':
        return 'variant-secondary';
      case 'outline':
        return 'variant-outline';
      case 'ghost':
        return 'variant-ghost';
      case 'danger':
        return 'variant-danger';
      default:
        return 'variant-primary';
    }
  }

  function getSizeClass(size: ButtonSize): string {
    switch (size) {
      case 'sm':
        return 'size-sm';
      case 'md':
        return 'size-md';
      case 'lg':
        return 'size-lg';
      default:
        return 'size-md';
    }
  }

  function handleClick() {
    if (!disabled && !loading && onclick) {
      onclick();
    }
  }
</script>

<button
  bind:this={buttonElement}
  class={classes}
  {disabled}
  onclick={handleClick}
  type="button"
>
  {#if loading}
    <span class="loading-spinner" aria-hidden="true"></span>
  {/if}
  <span class="button-content" class:loading>
    <slot />
  </span>
</button>

<style>
  .cursor-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: 1px solid transparent;
    border-radius: var(--tuanki-radius-md);
    font-family: var(--tuanki-font-sans);
    font-weight: 500;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition: all var(--tuanki-duration-fast) var(--tuanki-easing-ease);
    user-select: none;
    white-space: nowrap;
    outline: none;
    box-shadow: var(--tuanki-shadow-sm);
  }

  .cursor-button:focus-visible {
    outline: 2px solid var(--tuanki-primary);
    outline-offset: 2px;
  }

  /* 尺寸变体 */
  .size-sm {
    height: 2rem;
    padding: 0 0.75rem;
    font-size: var(--tuanki-text-sm);
  }

  .size-md {
    height: 2.5rem;
    padding: 0 1rem;
    font-size: var(--tuanki-text-base);
  }

  .size-lg {
    height: 3rem;
    padding: 0 1.5rem;
    font-size: var(--tuanki-text-lg);
  }

  /* 颜色变体 */
  .variant-primary {
    background-color: var(--tuanki-primary);
    border-color: var(--tuanki-primary);
    color: var(--tuanki-text-inverse);
  }

  .variant-primary:hover:not(.disabled):not(.loading) {
    background-color: var(--tuanki-primary-hover);
    border-color: var(--tuanki-primary-hover);
    box-shadow: var(--tuanki-shadow-md);
  }

  .variant-primary:active:not(.disabled):not(.loading) {
    background-color: var(--tuanki-primary-active);
    border-color: var(--tuanki-primary-active);
    transform: translateY(1px);
  }

  .variant-secondary {
    background-color: var(--tuanki-surface);
    border-color: var(--tuanki-border);
    color: var(--tuanki-text-primary);
  }

  .variant-secondary:hover:not(.disabled):not(.loading) {
    background-color: var(--tuanki-surface-hover);
    border-color: var(--tuanki-border-hover);
    box-shadow: var(--tuanki-shadow-md);
  }

  .variant-secondary:active:not(.disabled):not(.loading) {
    background-color: var(--tuanki-surface-active);
    border-color: var(--tuanki-border-active);
    transform: translateY(1px);
  }

  .variant-outline {
    background-color: transparent;
    border-color: var(--tuanki-primary);
    color: var(--tuanki-primary);
  }

  .variant-outline:hover:not(.disabled):not(.loading) {
    background-color: var(--tuanki-primary);
    color: var(--tuanki-text-inverse);
    box-shadow: var(--tuanki-shadow-md);
  }

  .variant-outline:active:not(.disabled):not(.loading) {
    background-color: var(--tuanki-primary-active);
    border-color: var(--tuanki-primary-active);
    transform: translateY(1px);
  }

  .variant-ghost {
    background-color: var(--background-primary);
    border-color: var(--background-modifier-border);
    color: var(--text-normal);
    box-shadow: none;
  }

  .variant-ghost:hover:not(.disabled):not(.loading) {
    background-color: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    color: var(--text-normal);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .variant-ghost:active:not(.disabled):not(.loading) {
    background-color: var(--background-modifier-hover);
    transform: translateY(1px);
  }

  .variant-danger {
    background-color: var(--tuanki-error);
    border-color: var(--tuanki-error);
    color: var(--tuanki-text-inverse);
  }

  .variant-danger:hover:not(.disabled):not(.loading) {
    background-color: #dc2626;
    border-color: #dc2626;
    box-shadow: var(--tuanki-shadow-md);
  }

  .variant-danger:active:not(.disabled):not(.loading) {
    background-color: #b91c1c;
    border-color: #b91c1c;
    transform: translateY(1px);
  }

  /* 状态 */
  .full-width {
    width: 100%;
  }

  .disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  .loading {
    cursor: wait;
  }

  .button-content.loading {
    opacity: 0.7;
  }

  /* 加载动画 */
  .loading-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* 响应式 */
  @media (max-width: 640px) {
    .cursor-button {
      min-height: 2.75rem;
      touch-action: manipulation;
    }
  }
</style>
