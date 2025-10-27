<script lang="ts">
  import { DesignTokens } from '../../design/tokens';

  // Props
  interface Props {
    checked: boolean;
    label?: string;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    description?: string;
    
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(),
    label,
    disabled = false,
    size = 'md',
    loading = false,
    description,
    
    onchange
  }: Props = $props();

  // 内部状态
  let focused = $state(false);
  let switchElement: HTMLInputElement;

  // 响应式计算
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

  function getSwitchClass(): string {
    const classes = ['cursor-switch'];
    
    classes.push(`size-${size}`);
    
    if (disabled) classes.push('disabled');
    if (focused) classes.push('focused');
    if (loading) classes.push('loading');
    if (checked) classes.push('checked');
    
    return classes.join(' ');
  }

  // 公开方法
  export function focus(): void {
    switchElement?.focus();
  }

  export function blur(): void {
    switchElement?.blur();
  }

  export function toggle(): void {
    if (!disabled && !loading) {
      checked = !checked;
      if (onchange) {
        onchange(checked);
      }
    }
  }
</script>

<div class="cursor-switch-wrapper">
  <label class={getSwitchClass()}>
    <input
      bind:this={switchElement}
      bind:checked
      type="checkbox"
      {disabled}
      class="switch-input"
      onchange={handleChange}
      onfocus={handleFocus}
      onblur={handleBlur}
    />
    
    <div class="switch-track">
      <div class="switch-thumb">
        {#if loading}
          <div class="switch-spinner">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" class="tuanki-animate-spin">
              <path d="M6 1a5 5 0 100 10 5 5 0 000-10zM0 6a6 6 0 1112 0A6 6 0 010 6z" opacity="0.25"/>
              <path d="M6 0a6 6 0 016 6h-1a5 5 0 00-5-5V0z"/>
            </svg>
          </div>
        {/if}
      </div>
    </div>
    
    {#if hasLabel || hasDescription}
      <div class="switch-content">
        {#if hasLabel}
          <span class="switch-label">{label}</span>
        {/if}
        {#if hasDescription}
          <span class="switch-description">{description}</span>
        {/if}
      </div>
    {/if}
  </label>
</div>

<style>
  .cursor-switch-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-spacing-xs);
  }

  .cursor-switch {
    display: flex;
    align-items: flex-start;
    gap: var(--tuanki-spacing-sm);
    cursor: pointer;
    position: relative;
  }

  .cursor-switch.disabled,
  .cursor-switch.loading {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .switch-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    margin: 0;
  }

  .switch-track {
    position: relative;
    width: 36px;
    height: 20px;
    background: var(--tuanki-border);
    border-radius: 10px;
    transition: all var(--tuanki-duration-fast);
    flex-shrink: 0;
  }

  .cursor-switch.size-sm .switch-track {
    width: 28px;
    height: 16px;
    border-radius: 8px;
  }

  .cursor-switch.size-lg .switch-track {
    width: 44px;
    height: 24px;
    border-radius: 12px;
  }

  .switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: var(--tuanki-surface);
    border-radius: 50%;
    transition: all var(--tuanki-duration-fast);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .cursor-switch.size-sm .switch-thumb {
    width: 12px;
    height: 12px;
  }

  .cursor-switch.size-lg .switch-thumb {
    width: 20px;
    height: 20px;
  }

  .switch-spinner {
    color: var(--tuanki-text-muted);
  }

  .cursor-switch.size-sm .switch-spinner svg {
    width: 8px;
    height: 8px;
  }

  .cursor-switch.size-lg .switch-spinner svg {
    width: 14px;
    height: 14px;
  }

  .cursor-switch:hover:not(.disabled):not(.loading) .switch-track {
    background: var(--tuanki-border-hover);
  }

  .cursor-switch.focused .switch-track {
    box-shadow: 0 0 0 2px var(--tuanki-primary-alpha);
  }

  .cursor-switch.checked .switch-track {
    background: var(--tuanki-primary);
  }

  .cursor-switch.checked .switch-thumb {
    transform: translateX(16px);
  }

  .cursor-switch.size-sm.checked .switch-thumb {
    transform: translateX(12px);
  }

  .cursor-switch.size-lg.checked .switch-thumb {
    transform: translateX(20px);
  }

  .switch-content {
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-spacing-xs);
    flex: 1;
  }

  .switch-label {
    font-size: var(--tuanki-text-sm);
    font-weight: 500;
    color: var(--tuanki-text-primary);
    line-height: 1.4;
  }

  .cursor-switch.size-sm .switch-label {
    font-size: var(--tuanki-text-xs);
  }

  .cursor-switch.size-lg .switch-label {
    font-size: var(--tuanki-text-base);
  }

  .switch-description {
    font-size: var(--tuanki-text-xs);
    color: var(--tuanki-text-muted);
    line-height: 1.4;
  }

  .cursor-switch.size-sm .switch-description {
    font-size: 10px;
  }

  .cursor-switch.size-lg .switch-description {
    font-size: var(--tuanki-text-sm);
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .switch-track,
    .switch-thumb {
      transition: none;
    }
  }
</style>
