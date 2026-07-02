<script lang="ts">
  import type { WeaveTimerHandle } from "../../types/timer-handle.js";
  import type { Snippet } from "svelte";
  import { createEventDispatcher } from "svelte";
  import EnhancedIcon from "./EnhancedIcon.svelte";
  import EnhancedButton from "./EnhancedButton.svelte";

  interface Props {
    /** 搜索值 */
    value?: string;
    
    /** 占位符文本 */
    placeholder?: string;
    
    /** 是否禁用 */
    disabled?: boolean;
    
    /** 是否显示清除按钮 */
    clearable?: boolean;
    
    /** 是否显示搜索按钮 */
    showSearchButton?: boolean;
    
    /** 搜索按钮文本 */
    searchButtonText?: string;
    
    /** 尺寸 */
    size?: "sm" | "md" | "lg";
    
    /** 是否自动聚焦 */
    autofocus?: boolean;
    
    /** 防抖延迟 (ms) */
    debounce?: number;
    
    /** 最大长度 */
    maxLength?: number;
    
    /** 事件处理器 */
    onSearch?: (value: string) => void;
    onClear?: () => void;
    onFocus?: (event: FocusEvent) => void;
    onBlur?: (event: FocusEvent) => void;
    
    /** 自定义类名 */
    class?: string;
    
    /** 前缀插槽 */
    prefix?: Snippet;
    
    /** 后缀插槽 */
    suffix?: Snippet;
  }
  
  let {
    value = $bindable(""),
    placeholder = "搜索...",
    disabled = false,
    clearable = true,
    showSearchButton = false,
    searchButtonText = "搜索",
    size = "md",
    autofocus = false,
    debounce = 300,
    maxLength,
    onSearch,
    onClear,
    onFocus,
    onBlur,
    class: className = "",
    prefix,
    suffix
  }: Props = $props();

  const dispatch = createEventDispatcher();

  let inputRef: HTMLInputElement;
  let debounceTimer: WeaveTimerHandle;
  let isFocused = $state(false);

  $effect(() => {
    if (autofocus && inputRef && !disabled) {
      inputRef.focus();
    }
  });

  // 计算 CSS 类
  let searchBarClasses = $derived.by(() => {
    const classes = [
      'weave-search-bar',
      `weave-search-bar--${size}`
    ];
    
    if (disabled) classes.push('weave-search-bar--disabled');
    if (isFocused) classes.push('weave-search-bar--focused');
    if (value) classes.push('weave-search-bar--has-value');
    if (className) classes.push(className);
    
    return classes.join(' ');
  });

  // 防抖搜索
  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    value = target.value;
    
    if (debounceTimer) window.clearTimeout(debounceTimer);
    
    debounceTimer = window.setTimeout(() => {
      onSearch?.(value);
      dispatch('search', value);
    }, debounce);
  }

  // 处理清除
  function handleClear() {
    value = "";
    onClear?.();
    dispatch('clear');
    dispatch('search', "");
    inputRef?.focus();
  }

  // 处理搜索按钮点击
  function handleSearchClick() {
    onSearch?.(value);
    dispatch('search', value);
  }

  // 处理键盘事件
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSearchClick();
    }
  }

  // 处理焦点事件
  function handleFocus(event: FocusEvent) {
    isFocused = true;
    onFocus?.(event);
    dispatch('focus', event);
  }

  function handleBlur(event: FocusEvent) {
    isFocused = false;
    onBlur?.(event);
    dispatch('blur', event);
  }
</script>

<div class={searchBarClasses}>
  <!-- 前缀插槽 -->
  {#if prefix}
    <div class="weave-search-bar__prefix">
      {@render prefix()}
    </div>
  {/if}

  <!-- 搜索图标 -->
  <div class="weave-search-bar__icon">
    <EnhancedIcon name="search" variant="muted" size="sm" />
  </div>

  <!-- 输入框 -->
  <input
    bind:this={inputRef}
    type="search"
    class="weave-search-bar__input"
    {placeholder}
    {disabled}
    maxlength={maxLength}
    value={value}
    oninput={handleInput}
    onkeydown={handleKeydown}
    onfocus={handleFocus}
    onblur={handleBlur}
    aria-label={placeholder}
  />

  <!-- 清除按钮 -->
  {#if clearable && value && !disabled}
    <EnhancedButton
      variant="ghost"
      size="sm"
      iconOnly
      icon="times"
      onclick={handleClear}
      ariaLabel="清除搜索"
      class="weave-search-bar__clear"
    />
  {/if}

  <!-- 搜索按钮 -->
  {#if showSearchButton}
    <EnhancedButton
      variant="primary"
      size={size}
      onclick={handleSearchClick}
      disabled={disabled}
      class="weave-search-bar__button"
    >
      {searchButtonText}
    </EnhancedButton>
  {/if}

  <!-- 后缀插槽 -->
  {#if suffix}
    <div class="weave-search-bar__suffix">
      {@render suffix()}
    </div>
  {/if}
</div>

<style>
  .weave-search-bar {
    display: flex;
    align-items: center;
    background: var(--weave-surface);
    border: 1px solid var(--weave-border);
    border-radius: var(--weave-radius-md);
    transition: all 0.2s ease;
    position: relative;
  }

  .weave-search-bar:hover:not(.weave-search-bar--disabled) {
    border-color: var(--weave-border-hover);
  }

  .weave-search-bar--focused {
    border-color: var(--weave-accent-color);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1);
  }

  .weave-search-bar--disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--weave-disabled-bg);
  }

  /* 尺寸变体 */
  .weave-search-bar--sm {
    padding: var(--weave-space-xs) var(--weave-space-sm);
    gap: var(--weave-space-xs);
  }

  .weave-search-bar--md {
    padding: var(--weave-space-sm) var(--weave-space-md);
    gap: var(--weave-space-sm);
  }

  .weave-search-bar--lg {
    padding: var(--weave-space-md) var(--weave-space-lg);
    gap: var(--weave-space-sm);
  }

  /* 搜索图标 */
  .weave-search-bar__icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* 输入框 */
  .weave-search-bar__input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--weave-text-primary);
    font-family: inherit;
    font-size: inherit;
    line-height: 1.5;
    min-width: 0;
  }

  .weave-search-bar__input::placeholder {
    color: var(--weave-text-faint);
  }

  .weave-search-bar__input:disabled {
    cursor: not-allowed;
  }

  /* 清除搜索结果的默认样式 */
  .weave-search-bar__input::-webkit-search-cancel-button {
    display: none;
  }

  /* 前缀和后缀 */
  .weave-search-bar__prefix,
  .weave-search-bar__suffix {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* 清除按钮 */
  .weave-search-bar__clear {
    flex-shrink: 0;
  }

  /* 搜索按钮 */
  .weave-search-bar__button {
    flex-shrink: 0;
    margin-left: var(--weave-space-xs);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .weave-search-bar--lg {
      padding: var(--weave-space-sm) var(--weave-space-md);
    }
  }

  /* 高对比度模式支持 */
  @media (prefers-contrast: high) {
    .weave-search-bar {
      border-width: 2px;
    }

    .weave-search-bar--focused {
      outline: 2px solid var(--weave-accent-color);
      outline-offset: 2px;
    }
  }
</style>
