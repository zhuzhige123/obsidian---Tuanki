<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { IconName } from "../../icons/index.js";

  interface SelectOption {
    value: string;
    label: string;
    icon?: IconName;
    disabled?: boolean;
  }

  interface Props {
    options: SelectOption[];
    value: string;
    placeholder?: string;
    disabled?: boolean;
    size?: "sm" | "md" | "lg";
    onchange?: (value: string) => void;
  }
  
  let {
    options,
    value = $bindable(),
    placeholder = "请选择...",
    disabled = false,
    size = "md",
    onchange
  }: Props = $props();
  
  let isOpen = $state(false);
  let selectRef: HTMLDivElement;

  // 获取当前选中的选项
  let selectedOption = $derived(options.find(opt => opt.value === value));

  function toggleDropdown() {
    if (disabled) return;
    isOpen = !isOpen;
  }

  function closeDropdown() {
    isOpen = false;
  }

  function selectOption(option: SelectOption) {
    if (option.disabled) return;
    value = option.value;
    onchange?.(option.value);
    closeDropdown();
  }

  // 点击外部关闭下拉菜单
  $effect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectRef && !selectRef.contains(event.target as Node)) {
        closeDropdown();
      }
    }

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });

  // 键盘导航
  function handleKeydown(event: KeyboardEvent) {
    if (disabled) return;
    
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        toggleDropdown();
        break;
      case 'Escape':
        closeDropdown();
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          toggleDropdown();
        }
        break;
    }
  }
</script>

<div 
  class="select-container {size}" 
  class:disabled
  bind:this={selectRef}
>
  <button 
    class="select-trigger"
    class:open={isOpen}
    onclick={toggleDropdown}
    onkeydown={handleKeydown}
    {disabled}
    aria-expanded={isOpen}
    aria-haspopup="listbox"
    role="combobox"
  >
    <div class="select-content">
      {#if selectedOption}
        {#if selectedOption.icon}
          <Icon name={selectedOption.icon} size="16" />
        {/if}
        <span class="select-text">{selectedOption.label}</span>
      {:else}
        <span class="select-placeholder">{placeholder}</span>
      {/if}
    </div>
    <div class="select-arrow">
      <Icon name="chevronDown" size="14" class={isOpen ? 'rotated' : ''} />
    </div>
  </button>

  {#if isOpen}
    <div class="select-dropdown" role="listbox">
      {#each options as option}
        <button
          class="select-option"
          class:selected={option.value === value}
          class:disabled={option.disabled}
          onclick={() => selectOption(option)}
          role="option"
          aria-selected={option.value === value}
          disabled={option.disabled}
        >
          {#if option.icon}
            <Icon name={option.icon} size="16" />
          {/if}
          <span>{option.label}</span>
          {#if option.value === value}
            <Icon name="check" size="14" class="check-icon" />
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .select-container {
    position: relative;
    display: inline-block;
    width: 100%;
  }

  .select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    color: var(--text-normal);
    cursor: pointer;
    font-family: var(--font-interface);
    font-size: 0.875rem;
    transition: all 0.2s ease;
    text-align: left;
  }

  .select-trigger:hover:not(:disabled) {
    border-color: var(--background-modifier-border-hover);
    background: var(--background-modifier-hover);
  }

  .select-trigger:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .select-trigger.open {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
  }

  .select-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .select-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  .select-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .select-placeholder {
    color: var(--text-muted);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .select-arrow {
    display: flex;
    align-items: center;
    margin-left: 0.5rem;
    transition: transform 0.2s ease;
  }

  .select-arrow :global(.rotated) {
    transform: rotate(180deg);
  }

  .select-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    max-height: 200px;
    overflow-y: auto;
    padding: 0.25rem;
  }

  .select-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    color: var(--text-normal);
    cursor: pointer;
    font-family: var(--font-interface);
    font-size: 0.875rem;
    text-align: left;
    transition: background 0.2s ease;
  }

  .select-option:hover:not(.disabled) {
    background: var(--background-modifier-hover);
  }

  .select-option.selected {
    background: var(--background-modifier-active-hover);
    color: var(--color-accent);
  }

  .select-option.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .check-icon {
    margin-left: auto;
    color: var(--color-accent);
  }

  /* Size variants */
  .sm .select-trigger {
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
  }

  .lg .select-trigger {
    padding: 0.75rem 1rem;
    font-size: 1rem;
  }

  .disabled {
    opacity: 0.6;
    pointer-events: none;
  }
</style>
