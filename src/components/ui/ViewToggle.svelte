<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import EnhancedIcon from "./EnhancedIcon.svelte";

  interface ViewOption {
    value: string;
    label: string;
    icon: string;
    description?: string;
  }

  interface Props {
    value: string;
    options: ViewOption[];
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
    onChange?: (value: string) => void;
    class?: string;
  }

  let {
    value = $bindable(),
    options = [],
    size = "md",
    disabled = false,
    onChange,
    class: className = ""
  }: Props = $props();

  const dispatch = createEventDispatcher();

  let componentClasses = $derived(() => {
    const classes = [
      'tuanki-view-toggle',
      `tuanki-view-toggle--${size}`,
    ];

    if (disabled) classes.push('tuanki-view-toggle--disabled');
    if (className) classes.push(className);

    return classes.join(' ');
  });

  function handleOptionClick(optionValue: string) {
    if (disabled || optionValue === value) return;

    value = optionValue;
    onChange?.(optionValue);
    dispatch('change', optionValue);
  }

  function handleKeydown(event: KeyboardEvent, optionValue: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOptionClick(optionValue);
    }
  }
</script>

<div class={componentClasses()} role="tablist" aria-label="视图切换">
  {#each options as option}
    <button
      type="button"
      class="tuanki-view-toggle__option"
      class:active={option.value === value}
      role="tab"
      aria-selected={option.value === value}
      aria-controls="view-content"
      tabindex={option.value === value ? 0 : -1}
      title={option.description || option.label}
      {disabled}
      onclick={() => handleOptionClick(option.value)}
      onkeydown={(e) => handleKeydown(e, option.value)}
    >
      <EnhancedIcon
        name={option.icon}
        size="sm"
        variant={option.value === value ? "primary" : "secondary"}
      />
      <span class="option-label">{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .tuanki-view-toggle {
    display: inline-flex;
    background: var(--tuanki-secondary-bg);
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-md);
    padding: var(--tuanki-space-xs);
    gap: var(--tuanki-space-xs);
  }

  .tuanki-view-toggle--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .tuanki-view-toggle__option {
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-xs);
    padding: var(--tuanki-space-sm) var(--tuanki-space-md);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--tuanki-radius-sm);
    color: var(--tuanki-text-secondary);
    font-family: var(--font-interface);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .tuanki-view-toggle__option:hover:not(:disabled) {
    background: var(--tuanki-hover);
    color: var(--tuanki-text-primary);
  }

  .tuanki-view-toggle__option:focus {
    outline: 2px solid var(--tuanki-accent-color);
    outline-offset: 2px;
  }

  .tuanki-view-toggle__option.active {
    background: var(--tuanki-surface);
    color: var(--tuanki-accent-color);
    border-color: var(--tuanki-border);
    box-shadow: var(--tuanki-shadow-sm);
  }

  .option-label {
    font-size: inherit;
    font-weight: inherit;
  }

  /* 尺寸变体 */
  .tuanki-view-toggle--sm .tuanki-view-toggle__option {
    padding: var(--tuanki-space-xs) var(--tuanki-space-sm);
    font-size: 0.75rem;
  }

  .tuanki-view-toggle--lg .tuanki-view-toggle__option {
    padding: var(--tuanki-space-md) var(--tuanki-space-lg);
    font-size: 1rem;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .option-label {
      display: none;
    }

    .tuanki-view-toggle__option {
      padding: var(--tuanki-space-sm);
    }
  }
</style>
