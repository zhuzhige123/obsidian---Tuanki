<script lang="ts">
  import { DesignTokens } from '../../design/tokens';

  // Props
  interface Props {
    value: string | number;
    checked?: boolean;
    name?: string;
    label?: string;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    error?: string | null;
    description?: string;
    
    onchange?: (value: string | number) => void;
  }

  let {
    value,
    checked = false,
    name,
    label,
    disabled = false,
    size = 'md',
    error = null,
    description,
    
    onchange
  }: Props = $props();

  // 内部状态
  let focused = $state(false);
  let radioElement: HTMLInputElement;

  // 响应式计算
  const hasError = $derived(!!error);
  const hasLabel = $derived(!!label);
  const hasDescription = $derived(!!description);

  function handleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.checked && onchange) {
      onchange(value);
    }
  }

  function handleFocus(): void {
    focused = true;
  }

  function handleBlur(): void {
    focused = false;
  }

  function getRadioClass(): string {
    const classes = ['cursor-radio'];
    
    classes.push(`size-${size}`);
    
    if (disabled) classes.push('disabled');
    if (focused) classes.push('focused');
    if (hasError) classes.push('error');
    if (checked) classes.push('checked');
    
    return classes.join(' ');
  }

  // 公开方法
  export function focus(): void {
    radioElement?.focus();
  }

  export function blur(): void {
    radioElement?.blur();
  }
</script>

<div class="cursor-radio-wrapper">
  <label class={getRadioClass()}>
    <input
      bind:this={radioElement}
      {checked}
      type="radio"
      {name}
      {value}
      {disabled}
      class="radio-input"
      onchange={handleChange}
      onfocus={handleFocus}
      onblur={handleBlur}
    />
    
    <div class="radio-indicator">
      {#if checked}
        <div class="radio-dot"></div>
      {/if}
    </div>
    
    {#if hasLabel || hasDescription}
      <div class="radio-content">
        {#if hasLabel}
          <span class="radio-label">{label}</span>
        {/if}
        {#if hasDescription}
          <span class="radio-description">{description}</span>
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
  .cursor-radio-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-spacing-xs);
  }

  .cursor-radio {
    display: flex;
    align-items: flex-start;
    gap: var(--tuanki-spacing-sm);
    cursor: pointer;
    position: relative;
  }

  .cursor-radio.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .radio-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    margin: 0;
  }

  .radio-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 2px solid var(--tuanki-border);
    border-radius: 50%;
    background: var(--tuanki-surface);
    transition: all var(--tuanki-duration-fast);
    flex-shrink: 0;
  }

  .cursor-radio.size-sm .radio-indicator {
    width: 14px;
    height: 14px;
  }

  .cursor-radio.size-lg .radio-indicator {
    width: 18px;
    height: 18px;
  }

  .radio-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--tuanki-primary);
    transition: all var(--tuanki-duration-fast);
  }

  .cursor-radio.size-sm .radio-dot {
    width: 5px;
    height: 5px;
  }

  .cursor-radio.size-lg .radio-dot {
    width: 7px;
    height: 7px;
  }

  .cursor-radio:hover:not(.disabled) .radio-indicator {
    border-color: var(--tuanki-primary);
  }

  .cursor-radio.focused .radio-indicator {
    border-color: var(--tuanki-primary);
    box-shadow: 0 0 0 2px var(--tuanki-primary-alpha);
  }

  .cursor-radio.checked .radio-indicator {
    border-color: var(--tuanki-primary);
  }

  .cursor-radio.error .radio-indicator {
    border-color: var(--tuanki-error);
  }

  .cursor-radio.error.focused .radio-indicator {
    box-shadow: 0 0 0 2px var(--tuanki-error-alpha);
  }

  .radio-content {
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-spacing-xs);
    flex: 1;
  }

  .radio-label {
    font-size: var(--tuanki-text-sm);
    font-weight: 500;
    color: var(--tuanki-text-primary);
    line-height: 1.4;
  }

  .cursor-radio.size-sm .radio-label {
    font-size: var(--tuanki-text-xs);
  }

  .cursor-radio.size-lg .radio-label {
    font-size: var(--tuanki-text-base);
  }

  .radio-description {
    font-size: var(--tuanki-text-xs);
    color: var(--tuanki-text-muted);
    line-height: 1.4;
  }

  .cursor-radio.size-sm .radio-description {
    font-size: 10px;
  }

  .cursor-radio.size-lg .radio-description {
    font-size: var(--tuanki-text-sm);
  }

  .error-message {
    font-size: var(--tuanki-text-xs);
    color: var(--tuanki-error);
    margin-top: var(--tuanki-spacing-xs);
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .radio-indicator,
    .radio-dot {
      transition: none;
    }
  }
</style>
