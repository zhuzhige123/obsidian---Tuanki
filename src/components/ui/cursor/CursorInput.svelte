<script lang="ts">
  import { DesignTokens } from '../../design/tokens';

  import type { FullAutoFill } from 'svelte/elements';

  // Props
  interface Props {
    value: string;
    placeholder?: string;
    type?: 'text' | 'password' | 'email' | 'number' | 'search' | 'url';
    size?: 'sm' | 'md' | 'lg';
    variant?: 'default' | 'filled' | 'outline';
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    error?: string | null;
    success?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    leftIcon?: string | null;
    rightIcon?: string | null;
    clearable?: boolean;
    maxlength?: number;
    minlength?: number;
    pattern?: string;
    autocomplete?: FullAutoFill | null;
    spellcheck?: boolean;

    onInput?: (value: string) => void;
    onChange?: (value: string) => void;
    onFocus?: (event: FocusEvent) => void;
    onBlur?: (event: FocusEvent) => void;
    onKeydown?: (event: KeyboardEvent) => void;
    onClear?: () => void;
  }

  let {
    value = $bindable(),
    placeholder = '',
    type = 'text',
    size = 'md',
    variant = 'default',
    disabled = false,
    readonly = false,
    required = false,
    error = null,
    success = false,
    loading = false,
    fullWidth = false,
    leftIcon = null,
    rightIcon = null,
    clearable = false,
    maxlength,
    minlength,
    pattern,
    autocomplete,
    spellcheck = true,

    onInput,
    onChange,
    onFocus,
    onBlur,
    onKeydown,
    onClear
  }: Props = $props();

  // 内部状态
  let focused = $state(false);
  let inputElement: HTMLInputElement;

  // 响应式计算
  const hasError = $derived(!!error);
  const hasValue = $derived(value.length > 0);
  const showClearButton = $derived(clearable && hasValue && !disabled && !readonly);
  const showLeftIcon = $derived(!!leftIcon && !loading);
  const showRightIcon = $derived(!!rightIcon && !loading && !showClearButton);

  function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    value = target.value;
    if (onInput) {
      onInput(value);
    }
  }

  function handleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (onChange) {
      onChange(target.value);
    }
  }

  function handleFocus(event: FocusEvent): void {
    focused = true;
    if (onFocus) {
      onFocus(event);
    }
  }

  function handleBlur(event: FocusEvent): void {
    focused = false;
    if (onBlur) {
      onBlur(event);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (onKeydown) {
      onKeydown(event);
    }
  }

  function handleClear(): void {
    value = '';
    if (onClear) {
      onClear();
    }
    if (onInput) {
      onInput('');
    }
    inputElement?.focus();
  }

  function getInputClass(): string {
    const classes = ['cursor-input'];

    classes.push(`size-${size}`);
    classes.push(`variant-${variant}`);

    if (disabled) classes.push('disabled');
    if (readonly) classes.push('readonly');
    if (focused) classes.push('focused');
    if (hasError) classes.push('error');
    if (success) classes.push('success');
    if (loading) classes.push('loading');
    if (fullWidth) classes.push('full-width');
    if (showLeftIcon) classes.push('has-left-icon');
    if (showRightIcon || showClearButton || loading) classes.push('has-right-icon');

    return classes.join(' ');
  }

  // 公开方法
  export function focus(): void {
    inputElement?.focus();
  }

  export function blur(): void {
    inputElement?.blur();
  }

  export function select(): void {
    inputElement?.select();
  }
</script>

<div class="cursor-input-wrapper" class:full-width={fullWidth}>
  <div class={getInputClass()}>
    <!-- 左侧图标 -->
    {#if showLeftIcon}
      <div class="input-icon left-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          {@html leftIcon}
        </svg>
      </div>
    {/if}

    <!-- 加载指示器 -->
    {#if loading}
      <div class="input-icon left-icon loading-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="tuanki-animate-spin">
          <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z" opacity="0.25"/>
          <path d="M8 0a8 8 0 018 8h-2a6 6 0 00-6-6V0z"/>
        </svg>
      </div>
    {/if}

    <!-- 输入框 -->
    <input
      bind:this={inputElement}
      bind:value
      {type}
      {placeholder}
      {disabled}
      {readonly}
      {required}
      {maxlength}
      {minlength}
      {pattern}
      {autocomplete}
      {spellcheck}
      class="input-element"
      oninput={handleInput}
      onchange={handleChange}
      onfocus={handleFocus}
      onblur={handleBlur}
      onkeydown={handleKeydown}
    />

    <!-- 清除按钮 -->
    {#if showClearButton}
      <button
        type="button"
        class="input-icon right-icon clear-button"
        onclick={handleClear}
        tabindex="-1"
        aria-label="清除输入"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z"/>
        </svg>
      </button>
    {/if}

    <!-- 右侧图标 -->
    {#if showRightIcon}
      <div class="input-icon right-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          {@html rightIcon}
        </svg>
      </div>
    {/if}
  </div>

  <!-- 错误信息 -->
  {#if hasError}
    <div class="input-error">
      {error}
    </div>
  {/if}
</div>

<style>
  .cursor-input-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-space-xs);
  }

  .cursor-input-wrapper.full-width {
    width: 100%;
  }

  .cursor-input {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: var(--tuanki-radius-md);
    transition: all var(--tuanki-duration-fast);
    background: var(--tuanki-surface);
    border: 1px solid var(--tuanki-border);
  }

  /* 尺寸变体 */
  .cursor-input.size-sm {
    height: 2rem;
    font-size: var(--tuanki-font-size-sm);
  }

  .cursor-input.size-md {
    height: 2.5rem;
    font-size: var(--tuanki-font-size-md);
  }

  .cursor-input.size-lg {
    height: 3rem;
    font-size: var(--tuanki-font-size-lg);
  }

  /* 样式变体 */
  .cursor-input.variant-default {
    background: var(--tuanki-surface);
    border-color: var(--tuanki-border);
  }

  .cursor-input.variant-filled {
    background: var(--tuanki-surface-active);
    border-color: transparent;
  }

  .cursor-input.variant-outline {
    background: transparent;
    border-color: var(--tuanki-border);
  }

  /* 状态样式 */
  .cursor-input:hover:not(.disabled) {
    border-color: var(--tuanki-border-hover);
  }

  .cursor-input.focused {
    border-color: var(--tuanki-primary);
    box-shadow: 0 0 0 3px var(--tuanki-primary-light);
  }

  .cursor-input.error {
    border-color: var(--tuanki-error);
  }

  .cursor-input.error.focused {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
  }

  .cursor-input.success {
    border-color: var(--tuanki-success);
  }

  .cursor-input.disabled {
    background: var(--tuanki-surface-active);
    border-color: var(--tuanki-border);
    opacity: 0.6;
    cursor: not-allowed;
  }

  .cursor-input.readonly {
    background: var(--tuanki-surface-active);
    cursor: default;
  }

  .cursor-input.full-width {
    width: 100%;
  }

  /* 输入框元素 */
  .input-element {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--tuanki-text-primary);
    font-size: inherit;
    font-family: inherit;
    outline: none;
    padding: 0;
    margin: 0;
  }

  .cursor-input.size-sm .input-element {
    padding: 0 var(--tuanki-spacing-sm);
  }

  .cursor-input.size-md .input-element {
    padding: 0 var(--tuanki-spacing-md);
  }

  .cursor-input.size-lg .input-element {
    padding: 0 var(--tuanki-spacing-lg);
  }

  .cursor-input.has-left-icon .input-element {
    padding-left: 0;
  }

  .cursor-input.has-right-icon .input-element {
    padding-right: 0;
  }

  .input-element::placeholder {
    color: var(--tuanki-text-muted);
  }

  .input-element:disabled {
    cursor: not-allowed;
  }

  .input-element:read-only {
    cursor: default;
  }

  /* 图标样式 */
  .input-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tuanki-text-muted);
    pointer-events: none;
  }

  .input-icon.left-icon {
    padding-left: var(--tuanki-spacing-sm);
  }

  .input-icon.right-icon {
    padding-right: var(--tuanki-spacing-sm);
  }

  .cursor-input.size-lg .input-icon {
    padding-left: var(--tuanki-spacing-md);
    padding-right: var(--tuanki-spacing-md);
  }

  .loading-icon {
    color: var(--tuanki-primary);
  }

  /* 清除按钮 */
  .clear-button {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--tuanki-text-muted);
    transition: color var(--tuanki-duration-fast);
    pointer-events: auto;
    border-radius: var(--tuanki-radius-sm);
    padding: 2px;
  }

  .clear-button:hover {
    color: var(--tuanki-text-secondary);
    background: var(--tuanki-surface-hover);
  }

  .clear-button:active {
    background: var(--tuanki-surface-active);
  }

  /* 错误信息 */
  .input-error {
    font-size: var(--tuanki-text-sm);
    color: var(--tuanki-error);
    margin-top: var(--tuanki-spacing-xs);
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .cursor-input.size-sm {
      height: 2.25rem;
    }

    .cursor-input.size-md {
      height: 2.75rem;
    }

    .cursor-input.size-lg {
      height: 3.25rem;
    }
  }

  /* 高对比度模式 */
  @media (prefers-contrast: high) {
    .cursor-input {
      border-width: 2px;
    }

    .cursor-input.focused {
      border-width: 3px;
    }
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .cursor-input {
      transition: none;
    }

    .clear-button {
      transition: none;
    }
  }
</style>
