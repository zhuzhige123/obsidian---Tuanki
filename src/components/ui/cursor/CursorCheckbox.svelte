<script lang="ts">
  import { DesignTokens } from '../../design/tokens';

  // Props
  interface Props {
    checked: boolean;
    label?: string;
    disabled?: boolean;
    indeterminate?: boolean;
    size?: 'sm' | 'md' | 'lg';
    error?: string | null;
    description?: string;
    
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(),
    label,
    disabled = false,
    indeterminate = false,
    size = 'md',
    error = null,
    description,
    
    onchange
  }: Props = $props();

  // 内部状态
  let focused = $state(false);
  let checkboxElement: HTMLInputElement;

  // 响应式计算
  const hasError = $derived(!!error);
  const hasLabel = $derived(!!label);
  const hasDescription = $derived(!!description);

  function handleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    checked = target.checked;
    if (onchange) {
      onchange(checked);
    }
  }

  function handleFocus(): void {
    focused = true;
  }

  function handleBlur(): void {
    focused = false;
  }

  function getCheckboxClass(): string {
    const classes = ['cursor-checkbox'];
    
    classes.push(`size-${size}`);
    
    if (disabled) classes.push('disabled');
    if (focused) classes.push('focused');
    if (hasError) classes.push('error');
    if (indeterminate) classes.push('indeterminate');
    
    return classes.join(' ');
  }

  // 公开方法
  export function focus(): void {
    checkboxElement?.focus();
  }

  export function blur(): void {
    checkboxElement?.blur();
  }
</script>

<div class="cursor-checkbox-wrapper">
  <label class={getCheckboxClass()}>
    <input
      bind:this={checkboxElement}
      bind:checked
      type="checkbox"
      {disabled}
      {indeterminate}
      class="checkbox-input"
      oninput={handleChange}
      onfocus={handleFocus}
      onblur={handleBlur}
    />
    
    <div class="checkbox-indicator">
      {#if indeterminate}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M2 6h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      {:else if checked}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      {/if}
    </div>
    
    {#if hasLabel || hasDescription}
      <div class="checkbox-content">
        {#if hasLabel}
          <span class="checkbox-label">{label}</span>
        {/if}
        {#if hasDescription}
          <span class="checkbox-description">{description}</span>
        {/if}
      </div>
    {/if}
  </label>
  
  {#if hasError}
    <div class="error-message">
      {error}
    </div>
  {/if}
</div>

<style>
  .cursor-checkbox-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-spacing-xs);
  }

  .cursor-checkbox {
    display: flex;
    align-items: flex-start;
    gap: var(--tuanki-spacing-sm);
    cursor: pointer;
    position: relative;
  }

  .cursor-checkbox.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .checkbox-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    margin: 0;
  }

  .checkbox-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 2px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-sm);
    background: var(--tuanki-surface);
    transition: all var(--tuanki-duration-fast);
    flex-shrink: 0;
    color: var(--tuanki-surface);
  }

  .cursor-checkbox.size-sm .checkbox-indicator {
    width: 14px;
    height: 14px;
  }

  .cursor-checkbox.size-lg .checkbox-indicator {
    width: 18px;
    height: 18px;
  }

  .cursor-checkbox:hover:not(.disabled) .checkbox-indicator {
    border-color: var(--tuanki-primary);
  }

  .cursor-checkbox.focused .checkbox-indicator {
    border-color: var(--tuanki-primary);
    box-shadow: 0 0 0 2px var(--tuanki-primary-alpha);
  }

  .checkbox-input:checked + .checkbox-indicator,
  .cursor-checkbox.indeterminate .checkbox-indicator {
    background: var(--tuanki-primary);
    border-color: var(--tuanki-primary);
  }

  .cursor-checkbox.error .checkbox-indicator {
    border-color: var(--tuanki-error);
  }

  .cursor-checkbox.error.focused .checkbox-indicator {
    box-shadow: 0 0 0 2px var(--tuanki-error-alpha);
  }

  .checkbox-content {
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-spacing-xs);
    flex: 1;
  }

  .checkbox-label {
    font-size: var(--tuanki-text-sm);
    font-weight: 500;
    color: var(--tuanki-text-primary);
    line-height: 1.4;
  }

  .cursor-checkbox.size-sm .checkbox-label {
    font-size: var(--tuanki-text-xs);
  }

  .cursor-checkbox.size-lg .checkbox-label {
    font-size: var(--tuanki-text-base);
  }

  .checkbox-description {
    font-size: var(--tuanki-text-xs);
    color: var(--tuanki-text-muted);
    line-height: 1.4;
  }

  .cursor-checkbox.size-sm .checkbox-description {
    font-size: 10px;
  }

  .cursor-checkbox.size-lg .checkbox-description {
    font-size: var(--tuanki-text-sm);
  }

  .error-message {
    font-size: var(--tuanki-text-xs);
    color: var(--tuanki-error);
    margin-top: var(--tuanki-spacing-xs);
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .checkbox-indicator {
      transition: none;
    }
  }
</style>
