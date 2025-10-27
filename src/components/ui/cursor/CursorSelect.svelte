<script lang="ts">
  import { DesignTokens } from '../../design/tokens';

  // 选项类型定义
  interface SelectOption {
    value: string | number;
    label: string;
    disabled?: boolean;
    group?: string;
  }

  // Props
  interface Props {
    value: string | number;
    options?: SelectOption[];
    placeholder?: string;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'default' | 'filled' | 'outline';
    disabled?: boolean;
    required?: boolean;
    error?: string | null;
    success?: boolean;
    fullWidth?: boolean;
    searchable?: boolean;
    clearable?: boolean;
    multiple?: boolean;
    maxSelections?: number;

    onChange?: (value: string | number | (string | number)[]) => void;
    onFocus?: (event: FocusEvent) => void;
    onBlur?: (event: FocusEvent) => void;
  }

  let {
    value = $bindable(),
    options = [],
    placeholder = '请选择...',
    size = 'md',
    variant = 'default',
    disabled = false,
    required = false,
    error = null,
    success = false,
    fullWidth = false,
    searchable = false,
    clearable = false,
    multiple = false,
    maxSelections,

    onChange,
    onFocus,
    onBlur
  }: Props = $props();

  // 内部状态
  let isOpen = $state(false);
  let focused = $state(false);
  let searchQuery = $state('');
  let selectedValues = $state<(string | number)[]>(multiple ? (Array.isArray(value) ? value : []) : []);
  let selectElement: HTMLSelectElement;
  let dropdownElement: HTMLDivElement;

  // 响应式计算
  const hasError = $derived(!!error);
  const selectedOption = $derived(options.find(opt => opt.value === value));
  const filteredOptions = $derived(searchable && searchQuery
    ? options.filter(opt => opt.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : options);
  const groupedOptions = $derived(groupOptions(filteredOptions));
  const canClear = $derived(clearable && (multiple ? selectedValues.length > 0 : value !== undefined && value !== ''));
  const isMaxSelected = $derived(multiple && maxSelections && selectedValues.length >= maxSelections);

  function groupOptions(opts: SelectOption[]): Record<string, SelectOption[]> {
    const grouped: Record<string, SelectOption[]> = {};
    
    opts.forEach(option => {
      const group = option.group || '';
      if (!grouped[group]) {
        grouped[group] = [];
      }
      grouped[group].push(option);
    });
    
    return grouped;
  }

  function handleToggle(): void {
    if (disabled) return;
    isOpen = !isOpen;
  }

  function handleSelect(option: SelectOption): void {
    if (option.disabled) return;

    if (multiple) {
      const index = selectedValues.indexOf(option.value);
      if (index > -1) {
        selectedValues = selectedValues.filter(v => v !== option.value);
      } else if (!isMaxSelected) {
        selectedValues = [...selectedValues, option.value];
      }
      value = selectedValues as any;
    } else {
      value = option.value;
      isOpen = false;
    }

    if (onChange) {
      onChange(value);
    }
  }

  function handleClear(): void {
    if (multiple) {
      selectedValues = [];
      value = [] as any;
    } else {
      value = '' as any;
    }
    
    if (onChange) {
      onChange(value);
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
    // 延迟关闭下拉框，允许点击选项
    setTimeout(() => {
      isOpen = false;
    }, 150);
  }

  function handleKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleToggle();
        break;
      case 'Escape':
        isOpen = false;
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          isOpen = true;
        }
        // TODO: 实现键盘导航
        break;
      case 'ArrowUp':
        event.preventDefault();
        // TODO: 实现键盘导航
        break;
    }
  }

  function getSelectClass(): string {
    const classes = ['cursor-select'];
    
    classes.push(`size-${size}`);
    classes.push(`variant-${variant}`);
    
    if (disabled) classes.push('disabled');
    if (focused) classes.push('focused');
    if (hasError) classes.push('error');
    if (success) classes.push('success');
    if (fullWidth) classes.push('full-width');
    if (isOpen) classes.push('open');
    
    return classes.join(' ');
  }

  function getDisplayText(): string {
    if (multiple) {
      if (selectedValues.length === 0) return placeholder;
      if (selectedValues.length === 1) {
        const option = options.find(opt => opt.value === selectedValues[0]);
        return option?.label || String(selectedValues[0]);
      }
      return `已选择 ${selectedValues.length} 项`;
    } else {
      return selectedOption?.label || placeholder;
    }
  }

  function isSelected(option: SelectOption): boolean {
    if (multiple) {
      return selectedValues.includes(option.value);
    }
    return value === option.value;
  }

  // 点击外部关闭下拉框
  function handleClickOutside(event: MouseEvent): void {
    if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  // 监听点击外部事件
  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  });
</script>

<div class="cursor-select-wrapper" class:full-width={fullWidth}>
  <div class={getSelectClass()} bind:this={dropdownElement}>
    <!-- 选择器触发器 -->
    <button
      type="button"
      class="select-trigger"
      {disabled}
      onclick={handleToggle}
      onfocus={handleFocus}
      onblur={handleBlur}
      onkeydown={handleKeydown}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
    >
      <span class="select-value" class:placeholder={!selectedOption && !multiple}>
        {getDisplayText()}
      </span>

      <div class="select-icons">
        {#if canClear}
          <div
            class="clear-button"
            onclick={(e) => { e.stopPropagation(); handleClear(); }}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleClear(); } }}
            role="button"
            tabindex="-1"
            aria-label="清除选择"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z"/>
            </svg>
          </div>
        {/if}

        <div class="chevron-icon" class:rotated={isOpen}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.293 6.293a1 1 0 011.414 0L8 8.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
          </svg>
        </div>
      </div>
    </button>

    <!-- 下拉选项 -->
    {#if isOpen}
      <div class="select-dropdown">
        {#if searchable}
          <div class="search-box">
            <input
              type="text"
              placeholder="搜索选项..."
              bind:value={searchQuery}
              class="search-input"
            />
          </div>
        {/if}

        <div class="options-container">
          {#each Object.entries(groupedOptions) as [groupName, groupOptions]}
            {#if groupName}
              <div class="option-group">
                <div class="group-label">{groupName}</div>
                {#each groupOptions as option}
                  <button
                    type="button"
                    class="select-option"
                    class:selected={isSelected(option)}
                    class:disabled={option.disabled || (multiple && !isSelected(option) && isMaxSelected)}
                    onclick={() => handleSelect(option)}
                    disabled={!!(option.disabled || (multiple && !isSelected(option) && isMaxSelected))}
                  >
                    {#if multiple}
                      <div class="checkbox" class:checked={isSelected(option)}>
                        {#if isSelected(option)}
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M10 3L4.5 8.5 2 6"/>
                          </svg>
                        {/if}
                      </div>
                    {/if}
                    <span class="option-label">{option.label}</span>
                  </button>
                {/each}
              </div>
            {:else}
              {#each groupOptions as option}
                <button
                  type="button"
                  class="select-option"
                  class:selected={isSelected(option)}
                  class:disabled={option.disabled || (multiple && !isSelected(option) && isMaxSelected)}
                  onclick={() => handleSelect(option)}
                  disabled={!!(option.disabled || (multiple && !isSelected(option) && isMaxSelected))}
                >
                  {#if multiple}
                    <div class="checkbox" class:checked={isSelected(option)}>
                      {#if isSelected(option)}
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M10 3L4.5 8.5 2 6"/>
                        </svg>
                      {/if}
                    </div>
                  {/if}
                  <span class="option-label">{option.label}</span>
                </button>
              {/each}
            {/if}
          {/each}

          {#if filteredOptions.length === 0}
            <div class="no-options">
              {searchable && searchQuery ? '未找到匹配选项' : '暂无选项'}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- 错误信息 -->
  {#if hasError}
    <div class="select-error">
      {error}
    </div>
  {/if}
</div>

<style>
  .cursor-select-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-spacing-xs);
  }

  .cursor-select-wrapper.full-width {
    width: 100%;
  }

  .cursor-select {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .cursor-select.full-width {
    width: 100%;
  }

  /* 触发器样式 */
  .select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-md);
    background: var(--tuanki-surface);
    color: var(--tuanki-text-primary);
    cursor: pointer;
    transition: all var(--tuanki-duration-fast);
    font-size: inherit;
    font-family: inherit;
  }

  /* 尺寸变体 */
  .cursor-select.size-sm .select-trigger {
    height: 2rem;
    padding: 0 var(--tuanki-spacing-sm);
    font-size: var(--tuanki-text-sm);
  }

  .cursor-select.size-md .select-trigger {
    height: 2.5rem;
    padding: 0 var(--tuanki-spacing-md);
    font-size: var(--tuanki-text-base);
  }

  .cursor-select.size-lg .select-trigger {
    height: 3rem;
    padding: 0 var(--tuanki-spacing-lg);
    font-size: var(--tuanki-text-lg);
  }

  /* 样式变体 */
  .cursor-select.variant-default .select-trigger {
    background: var(--tuanki-surface);
    border-color: var(--tuanki-border);
  }

  .cursor-select.variant-filled .select-trigger {
    background: var(--tuanki-surface-active);
    border-color: transparent;
  }

  .cursor-select.variant-outline .select-trigger {
    background: transparent;
    border-color: var(--tuanki-border);
  }

  /* 状态样式 */
  .select-trigger:hover:not(:disabled) {
    border-color: var(--tuanki-border-hover);
  }

  .cursor-select.focused .select-trigger {
    border-color: var(--tuanki-primary);
    box-shadow: 0 0 0 3px var(--tuanki-primary-light);
  }

  .cursor-select.error .select-trigger {
    border-color: var(--tuanki-error);
  }

  .cursor-select.error.focused .select-trigger {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
  }

  .cursor-select.success .select-trigger {
    border-color: var(--tuanki-success);
  }

  .cursor-select.disabled .select-trigger {
    background: var(--tuanki-surface-active);
    border-color: var(--tuanki-border);
    opacity: 0.6;
    cursor: not-allowed;
  }

  .cursor-select.open .select-trigger {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  /* 选择值显示 */
  .select-value {
    flex: 1;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .select-value.placeholder {
    color: var(--tuanki-text-muted);
  }

  /* 图标区域 */
  .select-icons {
    display: flex;
    align-items: center;
    gap: var(--tuanki-spacing-xs);
    margin-left: var(--tuanki-spacing-sm);
  }

  .clear-button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--tuanki-text-muted);
    cursor: pointer;
    border-radius: var(--tuanki-radius-sm);
    padding: 2px;
    transition: all var(--tuanki-duration-fast);
  }

  .clear-button:hover {
    color: var(--tuanki-text-secondary);
    background: var(--tuanki-surface-hover);
  }

  .chevron-icon {
    display: flex;
    align-items: center;
    color: var(--tuanki-text-muted);
    transition: transform var(--tuanki-duration-fast);
  }

  .chevron-icon.rotated {
    transform: rotate(180deg);
  }

  /* 下拉框样式 */
  .select-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    background: var(--tuanki-surface);
    border: 1px solid var(--tuanki-border);
    border-top: none;
    border-radius: 0 0 var(--tuanki-radius-md) var(--tuanki-radius-md);
    box-shadow: var(--tuanki-shadow-lg);
    max-height: 200px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* 搜索框 */
  .search-box {
    padding: var(--tuanki-spacing-sm);
    border-bottom: 1px solid var(--tuanki-border);
  }

  .search-input {
    width: 100%;
    padding: var(--tuanki-spacing-xs) var(--tuanki-spacing-sm);
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-sm);
    background: var(--tuanki-bg);
    color: var(--tuanki-text-primary);
    font-size: var(--tuanki-text-sm);
    outline: none;
  }

  .search-input:focus {
    border-color: var(--tuanki-primary);
  }

  /* 选项容器 */
  .options-container {
    flex: 1;
    overflow-y: auto;
  }

  /* 选项组 */
  .option-group {
    border-bottom: 1px solid var(--tuanki-border);
  }

  .option-group:last-child {
    border-bottom: none;
  }

  .group-label {
    padding: var(--tuanki-spacing-xs) var(--tuanki-spacing-md);
    font-size: var(--tuanki-text-xs);
    font-weight: 600;
    color: var(--tuanki-text-secondary);
    background: var(--tuanki-surface-hover);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* 选项样式 */
  .select-option {
    display: flex;
    align-items: center;
    width: 100%;
    padding: var(--tuanki-spacing-sm) var(--tuanki-spacing-md);
    border: none;
    background: none;
    color: var(--tuanki-text-primary);
    font-size: inherit;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--tuanki-duration-fast);
  }

  .select-option:hover:not(:disabled) {
    background: var(--tuanki-surface-hover);
  }

  .select-option.selected {
    background: var(--tuanki-primary-light);
    color: var(--tuanki-primary);
  }

  .select-option:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 复选框 */
  .checkbox {
    width: 16px;
    height: 16px;
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-sm);
    margin-right: var(--tuanki-spacing-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tuanki-surface);
    transition: all var(--tuanki-duration-fast);
  }

  .checkbox.checked {
    background: var(--tuanki-primary);
    border-color: var(--tuanki-primary);
    color: white;
  }

  .option-label {
    flex: 1;
  }

  /* 无选项提示 */
  .no-options {
    padding: var(--tuanki-spacing-md);
    text-align: center;
    color: var(--tuanki-text-muted);
    font-size: var(--tuanki-text-sm);
    font-style: italic;
  }

  /* 错误信息 */
  .select-error {
    font-size: var(--tuanki-text-sm);
    color: var(--tuanki-error);
    margin-top: var(--tuanki-spacing-xs);
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .select-dropdown {
      max-height: 150px;
    }
  }

  /* 高对比度模式 */
  @media (prefers-contrast: high) {
    .select-trigger {
      border-width: 2px;
    }

    .cursor-select.focused .select-trigger {
      border-width: 3px;
    }
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .select-trigger,
    .select-option,
    .chevron-icon,
    .checkbox {
      transition: none;
    }
  }
</style>
