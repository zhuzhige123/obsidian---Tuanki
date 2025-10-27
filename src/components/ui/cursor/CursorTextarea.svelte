<script lang="ts">
  import { DesignTokens } from '../../design/tokens';

  // Props
  interface Props {
    value: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    error?: string | null;
    success?: boolean;
    fullWidth?: boolean;
    rows?: number;
    cols?: number;
    maxlength?: number;
    minlength?: number;
    resize?: 'none' | 'both' | 'horizontal' | 'vertical';
    autoResize?: boolean;
    
    oninput?: (value: string) => void;
    onchange?: (value: string) => void;
    onfocus?: (event: FocusEvent) => void;
    onblur?: (event: FocusEvent) => void;
    onkeydown?: (event: KeyboardEvent) => void;
  }

  let {
    value = $bindable(),
    placeholder = '',
    disabled = false,
    readonly = false,
    required = false,
    error = null,
    success = false,
    fullWidth = false,
    rows = 4,
    cols,
    maxlength,
    minlength,
    resize = 'vertical',
    autoResize = false,
    
    oninput,
    onchange,
    onfocus,
    onblur,
    onkeydown
  }: Props = $props();

  // 内部状态
  let focused = $state(false);
  let textareaElement: HTMLTextAreaElement;

  // 响应式计算
  const hasError = $derived(!!error);
  const hasValue = $derived(value.length > 0);

  function handleInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    value = target.value;
    
    if (autoResize) {
      autoResizeTextarea(target);
    }
    
    if (oninput) {
      oninput(value);
    }
  }

  function handleChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    if (onchange) {
      onchange(target.value);
    }
  }

  function handleFocus(event: FocusEvent): void {
    focused = true;
    if (onfocus) {
      onfocus(event);
    }
  }

  function handleBlur(event: FocusEvent): void {
    focused = false;
    if (onblur) {
      onblur(event);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (onkeydown) {
      onkeydown(event);
    }
  }

  function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  function getTextareaClass(): string {
    const classes = ['cursor-textarea'];
    
    if (disabled) classes.push('disabled');
    if (readonly) classes.push('readonly');
    if (focused) classes.push('focused');
    if (hasError) classes.push('error');
    if (success) classes.push('success');
    if (fullWidth) classes.push('full-width');
    if (autoResize) classes.push('auto-resize');
    
    return classes.join(' ');
  }

  // 公开方法
  export function focus(): void {
    textareaElement?.focus();
  }

  export function blur(): void {
    textareaElement?.blur();
  }

  export function select(): void {
    textareaElement?.select();
  }

  export function setSelectionRange(start: number, end: number): void {
    textareaElement?.setSelectionRange(start, end);
  }
</script>

<div class="cursor-textarea-wrapper" class:full-width={fullWidth}>
  <textarea
    bind:this={textareaElement}
    bind:value
    {placeholder}
    {disabled}
    {readonly}
    {required}
    {rows}
    {cols}
    {maxlength}
    {minlength}
    class={getTextareaClass()}
    style="resize: {resize};"
    oninput={handleInput}
    onchange={handleChange}
    onfocus={handleFocus}
    onblur={handleBlur}
    onkeydown={handleKeydown}
  ></textarea>
  
  {#if hasError}
    <div class="error-message">
      {error}
    </div>
  {/if}
</div>

<style>
  .cursor-textarea-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-space-xs);
  }

  .cursor-textarea-wrapper.full-width {
    width: 100%;
  }

  .cursor-textarea {
    width: 100%;
    padding: var(--tuanki-space-sm);
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-md);
    background: var(--tuanki-surface);
    color: var(--tuanki-text-primary);
    font-family: var(--tuanki-font-interface);
    font-size: var(--tuanki-font-size-sm);
    line-height: 1.5;
    transition: all var(--tuanki-duration-fast);
    outline: none;
    min-height: 80px;
  }

  .cursor-textarea::placeholder {
    color: var(--tuanki-text-placeholder);
  }

  .cursor-textarea:hover:not(:disabled):not(:readonly) {
    border-color: var(--tuanki-border-hover);
  }

  .cursor-textarea:focus {
    border-color: var(--tuanki-primary);
    box-shadow: 0 0 0 2px var(--tuanki-primary-alpha);
  }

  .cursor-textarea.error {
    border-color: var(--tuanki-error);
  }

  .cursor-textarea.error:focus {
    border-color: var(--tuanki-error);
    box-shadow: 0 0 0 2px var(--tuanki-error-alpha);
  }

  .cursor-textarea.success {
    border-color: var(--tuanki-success);
  }

  .cursor-textarea.success:focus {
    border-color: var(--tuanki-success);
    box-shadow: 0 0 0 2px var(--tuanki-success-alpha);
  }

  .cursor-textarea:disabled {
    background: var(--tuanki-surface-disabled);
    color: var(--tuanki-text-disabled);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .cursor-textarea:readonly {
    background: var(--tuanki-surface-readonly);
    cursor: default;
  }

  .cursor-textarea.auto-resize {
    resize: none;
    overflow: hidden;
  }

  .error-message {
    font-size: var(--tuanki-text-xs);
    color: var(--tuanki-error);
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .cursor-textarea {
      transition: none;
    }
  }
</style>
