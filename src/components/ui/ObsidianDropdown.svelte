<script lang="ts">
  import { Menu } from 'obsidian';
  import ObsidianIcon from './ObsidianIcon.svelte';

  interface DropdownOption {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    disabled?: boolean;
  }

  interface Props {
    options: DropdownOption[];
    value: string;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    /** field：表单下拉；toolbar：底部/顶栏工具区（无边框扁平） */
    appearance?: 'field' | 'toolbar';
    iconPosition?: 'left' | 'right';
    onchange?: (value: string) => void;
  }

  let {
    options,
    value = $bindable(),
    placeholder = '请选择...',
    disabled = false,
    className = '',
    appearance = 'field',
    iconPosition = 'right',
    onchange
  }: Props = $props();

  let buttonRef: HTMLButtonElement;

  // 获取当前选中的选项
  let selectedOption = $derived(options.find(opt => opt.id === value));

  // 显示菜单
  function showMenu(triggerEvent?: MouseEvent) {
    if (disabled) return;

    const menu = new Menu();
    menu.setUseNativeMenu?.(false);

    for (const option of options) {
      menu.addItem((item) => {
        const title = option.description ? `${option.label} - ${option.description}` : option.label;
        item.setTitle(title);
        if (option.id === value) {
          item.setChecked(true);
        }

        if (option.icon) {
          item.setIcon(option.icon);
        }

        if (option.disabled) {
          item.setDisabled(true);
        }

        item.onClick(() => {
          if (option.disabled) return;
          value = option.id;
          onchange?.(option.id);
        });
      });
    }

    try {
      if (triggerEvent) {
        menu.showAtMouseEvent(triggerEvent);
        return;
      }

      const rect = buttonRef.getBoundingClientRect();
      const position = {
        x: Math.round(rect.left),
        y: Math.round(rect.bottom)
      };
      menu.showAtPosition(position);
    } catch {
      const rect = buttonRef.getBoundingClientRect();
      const position = {
        x: Math.round(rect.left),
        y: Math.round(rect.bottom)
      };
      menu.showAtPosition(position);
    }
  }

  // 处理点击
  function handleClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    showMenu(event);
  }

  // 处理键盘
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      showMenu();
    }
  }
</script>

<button
  bind:this={buttonRef}
  class="obsidian-dropdown-trigger appearance-{appearance} {className}"
  class:disabled
  onclick={handleClick}
  onkeydown={handleKeydown}
  {disabled}
  type="button"
>
  <ObsidianIcon
    name="chevron-down"
    size={14}
    class={iconPosition === 'left' ? 'dropdown-icon is-leading' : 'dropdown-icon'}
  />
  <span class="dropdown-text">
    {#if selectedOption}
      {selectedOption.label}
    {:else}
      <span class="placeholder">{placeholder}</span>
    {/if}
  </span>
</button>

<style>
  .obsidian-dropdown-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--input-radius);
    color: var(--text-normal);
    font-family: var(--font-interface);
    font-size: var(--font-ui-small);
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .obsidian-dropdown-trigger:hover:not(.disabled) {
    border-color: var(--background-modifier-border-hover);
  }

  .obsidian-dropdown-trigger:focus-visible {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .obsidian-dropdown-trigger.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dropdown-text {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-icon.is-leading {
    order: -1;
  }

  .placeholder {
    color: var(--text-muted);
  }

  /* 工具栏：覆盖上方 field 样式，避免 scoped 边框压过全局 */
  .obsidian-dropdown-trigger.appearance-toolbar {
    width: auto;
    max-width: min(100%, 9rem);
    padding: 0.35rem 0.5rem;
    background: transparent;
    border: none;
    box-shadow: none;
    color: var(--text-muted);
    justify-content: flex-start;
  }

  .obsidian-dropdown-trigger.appearance-toolbar:hover:not(.disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border: none;
    box-shadow: none;
  }

  .obsidian-dropdown-trigger.appearance-toolbar:focus-visible {
    border: none;
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  :global(body > .menu) {
    z-index: var(--weave-z-dropdown, 1600);
  }
</style>
