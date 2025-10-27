<script lang="ts">
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
  let debounceTimer: number;
  let isFocused = $state(false);

  // 计算 CSS 类
  let searchBarClasses = $derived(() => {
    const classes = [
      'tuanki-search-bar',
      `tuanki-search-bar--${size}`
    ];
    
    if (disabled) classes.push('tuanki-search-bar--disabled');
    if (isFocused) classes.push('tuanki-search-bar--focused');
    if (value) classes.push('tuanki-search-bar--has-value');
    if (className) classes.push(className);
    
    return classes.join(' ');
  });

  // 防抖搜索
  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    value = target.value;
    
    if (debounceTimer) clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(() => {
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
    } else if (event.key === 'Escape') {
      if (value) {
        handleClear();
      } else {
        inputRef?.blur();
      }
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

<div class={searchBarClasses()}>
  <!-- 前缀插槽 -->
  {#if prefix}
    <div class="tuanki-search-bar__prefix">
      {@render prefix()}
    </div>
  {/if}

  <!-- 搜索图标 -->
  <div class="tuanki-search-bar__icon">
    <EnhancedIcon name="search" variant="muted" size="sm" />
  </div>

  <!-- 输入框 -->
  <input
    bind:this={inputRef}
    type="search"
    class="tuanki-search-bar__input"
    {placeholder}
    {disabled}
    {autofocus}
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
      class="tuanki-search-bar__clear"
    />
  {/if}

  <!-- 搜索按钮 -->
  {#if showSearchButton}
    <EnhancedButton
      variant="primary"
      size={size}
      onclick={handleSearchClick}
      disabled={disabled}
      class="tuanki-search-bar__button"
    >
      {searchButtonText}
    </EnhancedButton>
  {/if}

  <!-- 后缀插槽 -->
  {#if suffix}
    <div class="tuanki-search-bar__suffix">
      {@render suffix()}
    </div>
  {/if}
</div>

<style>
  .tuanki-search-bar {
    display: flex;
    align-items: center;
    background: var(--tuanki-surface);
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-md);
    transition: all 0.2s ease;
    position: relative;
  }

  .tuanki-search-bar:hover:not(.tuanki-search-bar--disabled) {
    border-color: var(--tuanki-border-hover);
  }

  .tuanki-search-bar--focused {
    border-color: var(--tuanki-accent-color);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1);
  }

  .tuanki-search-bar--disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--tuanki-disabled-bg);
  }

  /* 尺寸变体 */
  .tuanki-search-bar--sm {
    padding: var(--tuanki-space-xs) var(--tuanki-space-sm);
    gap: var(--tuanki-space-xs);
  }

  .tuanki-search-bar--md {
    padding: var(--tuanki-space-sm) var(--tuanki-space-md);
    gap: var(--tuanki-space-sm);
  }

  .tuanki-search-bar--lg {
    padding: var(--tuanki-space-md) var(--tuanki-space-lg);
    gap: var(--tuanki-space-sm);
  }

  /* 搜索图标 */
  .tuanki-search-bar__icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* 输入框 */
  .tuanki-search-bar__input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--tuanki-text-primary);
    font-family: inherit;
    font-size: inherit;
    line-height: 1.5;
    min-width: 0;
  }

  .tuanki-search-bar__input::placeholder {
    color: var(--tuanki-text-faint);
  }

  .tuanki-search-bar__input:disabled {
    cursor: not-allowed;
  }

  /* 清除搜索结果的默认样式 */
  .tuanki-search-bar__input::-webkit-search-cancel-button {
    display: none;
  }

  /* 前缀和后缀 */
  .tuanki-search-bar__prefix,
  .tuanki-search-bar__suffix {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* 清除按钮 */
  .tuanki-search-bar__clear {
    flex-shrink: 0;
  }

  /* 搜索按钮 */
  .tuanki-search-bar__button {
    flex-shrink: 0;
    margin-left: var(--tuanki-space-xs);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .tuanki-search-bar--lg {
      padding: var(--tuanki-space-sm) var(--tuanki-space-md);
    }
  }

  /* 高对比度模式支持 */
  @media (prefers-contrast: high) {
    .tuanki-search-bar {
      border-width: 2px;
    }

    .tuanki-search-bar--focused {
      outline: 2px solid var(--tuanki-accent-color);
      outline-offset: 2px;
    }
  }
</style>
