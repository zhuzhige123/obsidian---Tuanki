<script lang="ts">
  import EnhancedIcon from "./EnhancedIcon.svelte";
  import type { IconName } from "../../icons/index.js";

  interface DropdownItem {
    id: string;
    label: string;
    icon?: IconName;
    onClick: () => void;
    disabled?: boolean;
  }

  interface Props {
    items: DropdownItem[];
    buttonText: string;
    buttonIcon?: IconName;
    position?: "left" | "right";
    iconOnly?: boolean;
    showOnHover?: boolean;
  }

  let {
    items,
    buttonText,
    buttonIcon,
    position = "left",
    iconOnly = false,
    showOnHover = false,
  }: Props = $props();
  
  let isOpen = $state(false);
  let dropdownRef: HTMLDivElement;
  let menuPosition = $state({ top: '0px', left: '0px', right: 'auto' });

  function toggleDropdown() {
    isOpen = !isOpen;
    if (isOpen) {
      updateMenuPosition();
    }
  }

  function closeDropdown() {
    isOpen = false;
  }

  function openDropdown() {
    isOpen = true;
    updateMenuPosition();
  }

  function updateMenuPosition() {
    if (!dropdownRef) return;

    const rect = dropdownRef.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 菜单显示在按钮左下角，稍微偏移一点
    let top = rect.bottom + 4; // 按钮下方4px间距
    let left = rect.left - 8; // 按钮左侧稍微偏移8px

    // 如果是右对齐，菜单显示在按钮右下角
    if (position === 'right') {
      left = rect.right - 120; // 假设菜单宽度约120px，从右边界向左偏移
    }

    // 检查是否会超出视口底部
    if (top + 200 > viewportHeight) { // 假设菜单高度约200px
      top = rect.top - 204; // 显示在按钮上方，留出菜单高度和间距
    }

    // 检查是否会超出视口左边界
    if (left < 8) {
      left = 8; // 最小左边距
    }

    // 检查是否会超出视口右边界
    if (left + 150 > viewportWidth) { // 假设菜单宽度约150px
      left = viewportWidth - 158; // 从右边界向左偏移菜单宽度加间距
    }

    menuPosition = {
      top: `${top}px`,
      left: `${left}px`,
      right: 'auto'
    };
  }

  function handleItemClick(item: DropdownItem) {
    if (!item.disabled) {
      item.onClick();
      closeDropdown();
    }
  }

  function handleMouseEnter() {
    if (showOnHover) {
      openDropdown();
    }
  }

  function handleMouseLeave() {
    if (showOnHover) {
      closeDropdown();
    }
  }

  // Close dropdown when clicking outside
  $effect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
        closeDropdown();
      }
    }

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });


</script>

<div
  class="dropdown-container"
  bind:this={dropdownRef}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  role="button"
  tabindex="0"
>
  <button
    class="dropdown-trigger {iconOnly ? 'icon-only' : ''}"
    onclick={toggleDropdown}
    aria-expanded={isOpen}
    aria-label={iconOnly ? (buttonText || '菜单') : undefined}
  >
    {#if iconOnly}
      {#if buttonIcon}
        <EnhancedIcon name={buttonIcon} size="16" />
      {/if}
    {:else}
      {#if buttonIcon}
        <EnhancedIcon name={buttonIcon} size="16" />
      {/if}
      <span>{buttonText}</span>
      <span class="chevron" aria-hidden="true">
        <EnhancedIcon name="chevronDown" size="14" class={isOpen ? 'rotated' : ''} />
      </span>
    {/if}
  </button>

  {#if isOpen}
    <div
      class="dropdown-menu dropdown-{position}"
      style="top: {menuPosition.top}; left: {menuPosition.left}; right: {menuPosition.right};"
    >
      {#each items as item}
        {#if item.id === 'divider'}
          <div class="dropdown-divider"></div>
        {:else}
          <button
            class="dropdown-item"
            class:disabled={item.disabled}
            onclick={() => handleItemClick(item)}
          >
            {#if item.icon}
              <EnhancedIcon name={item.icon} size="14" />
            {/if}
            <span>{item.label}</span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .dropdown-container { position: relative; display: inline-block; }

  .dropdown-trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem;
    color: var(--text-normal);
    cursor: pointer;
    font-family: var(--font-interface);
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .icon-only {
    padding: 0.5rem;
    border-radius: 0.375rem;
  }

  .dropdown-trigger:hover {
    background: var(--background-modifier-hover);
  }

  .dropdown-trigger .chevron {
    display: inline-flex;
    transition: transform 0.2s ease;
  }

  .dropdown-trigger :global(.rotated) { transform: rotate(180deg); }

  .dropdown-menu {
    position: fixed; /* 改为fixed定位，避免被父容器截断 */
    margin-top: 0.25rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 2147483647; /* 使用最大z-index值，确保显示在所有元素之上 */
    min-width: auto;
    padding: 0.25rem;
    white-space: nowrap;
    /* 确保菜单可见性 */
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  /* 位置样式现在通过JavaScript动态设置 */

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    color: var(--text-normal);
    cursor: pointer;
    font-family: var(--font-interface);
    font-size: 0.875rem;
    text-align: left;
    transition: background 0.2s ease;
  }

  .dropdown-item:hover:not(.disabled) {
    background: var(--background-modifier-hover);
  }

  .dropdown-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dropdown-divider {
    height: 1px;
    background: var(--background-modifier-border);
    margin: 0.25rem 0;
  }

  .dropdown-item :global(.anki-icon),
  .dropdown-item :global(.tuanki-icon) {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  /* 确保 EnhancedIcon 组件在下拉菜单中的对齐 */
  .dropdown-item :global(.tuanki-icon) {
    min-width: 1rem;
    max-width: 1rem;
  }

  .dropdown-item :global(.tuanki-icon__content) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  /* 确保 SVG 图标在下拉菜单中正确显示 */
  .dropdown-item :global(.tuanki-icon svg),
  .dropdown-item :global(.anki-icon svg) {
    width: 14px;
    height: 14px;
    display: block;
  }

  .dropdown-trigger:focus-visible {
    outline: 2px solid var(--tuanki-accent-color);
    outline-offset: 2px;
  }
</style>
