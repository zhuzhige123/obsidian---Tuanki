<script lang="ts">
  /**
   * 分裂按钮组件
   * 提供主操作按钮 + 下拉菜单的组合
   */
  
  import EnhancedIcon from './EnhancedIcon.svelte';
  
  export interface MenuItem {
    id: string;
    label: string;
    icon?: string;
    disabled?: boolean;
    onClick: () => void;
  }
  
  interface Props {
    // 主按钮
    mainLabel: string;
    mainIcon?: string;
    mainDisabled?: boolean;
    onMainClick: () => void;
    
    // 下拉菜单项
    menuItems: MenuItem[];
    
    // 样式
    size?: 'small' | 'medium' | 'large';
    variant?: 'primary' | 'secondary' | 'ghost';
  }
  
  let {
    mainLabel,
    mainIcon,
    mainDisabled = false,
    onMainClick,
    menuItems,
    size = 'medium',
    variant = 'secondary'
  }: Props = $props();
  
  // 菜单状态
  let menuOpen = $state(false);
  let buttonElement = $state<HTMLDivElement | null>(null);
  let menuElement = $state<HTMLDivElement | null>(null);
  
  // 切换菜单
  function toggleMenu() {
    menuOpen = !menuOpen;
  }
  
  // 关闭菜单
  function closeMenu() {
    menuOpen = false;
  }
  
  // 处理菜单项点击
  function handleMenuItemClick(item: MenuItem) {
    if (!item.disabled) {
      item.onClick();
      closeMenu();
    }
  }
  
  // 点击外部关闭菜单
  function handleClickOutside(event: MouseEvent) {
    if (
      menuOpen &&
      buttonElement &&
      menuElement &&
      !buttonElement.contains(event.target as Node) &&
      !menuElement.contains(event.target as Node)
    ) {
      closeMenu();
    }
  }
  
  // 键盘导航
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && menuOpen) {
      closeMenu();
    }
  }
  
  // 监听点击外部
  $effect(() => {
    if (menuOpen) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  });
</script>

<div 
  class="split-button split-button-{size} split-button-{variant}"
  bind:this={buttonElement}
>
  <!-- 主按钮 -->
  <button
    class="split-button-main"
    disabled={mainDisabled}
    onclick={onMainClick}
    type="button"
  >
    {#if mainIcon}
      <EnhancedIcon name={mainIcon} size={size === 'small' ? 14 : size === 'large' ? 18 : 16} />
    {/if}
    <span>{mainLabel}</span>
  </button>
  
  <!-- 下拉切换按钮 -->
  <button
    class="split-button-toggle"
    class:open={menuOpen}
    onclick={toggleMenu}
    type="button"
    aria-haspopup="true"
    aria-expanded={menuOpen}
  >
    <EnhancedIcon 
      name="chevron-down" 
      size={size === 'small' ? 12 : size === 'large' ? 16 : 14}
    />
  </button>
  
  <!-- 下拉菜单 -->
  {#if menuOpen}
    <div class="split-button-menu" bind:this={menuElement}>
      {#each menuItems as item}
        <button
          class="menu-item"
          class:disabled={item.disabled}
          disabled={item.disabled}
          onclick={() => handleMenuItemClick(item)}
          type="button"
        >
          {#if item.icon}
            <EnhancedIcon name={item.icon} size={14} />
          {/if}
          <span>{item.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .split-button {
    position: relative;
    display: inline-flex;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--background-modifier-border);
  }
  
  .split-button-main,
  .split-button-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: none;
    background: var(--interactive-normal);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .split-button-main {
    padding: 6px 12px;
    flex: 1;
    border-right: 1px solid var(--background-modifier-border);
  }
  
  .split-button-toggle {
    padding: 6px 8px;
  }
  
  .split-button-main:hover,
  .split-button-toggle:hover {
    background: var(--interactive-hover);
  }
  
  .split-button-main:active,
  .split-button-toggle:active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  
  .split-button-main:disabled,
  .split-button-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .split-button-toggle.open {
    background: var(--interactive-hover);
  }
  
  /* 尺寸变体 */
  .split-button-small .split-button-main {
    padding: 4px 8px;
    font-size: 0.8rem;
  }
  
  .split-button-small .split-button-toggle {
    padding: 4px 6px;
  }
  
  .split-button-large .split-button-main {
    padding: 8px 16px;
    font-size: 0.95rem;
  }
  
  .split-button-large .split-button-toggle {
    padding: 8px 10px;
  }
  
  /* 样式变体 */
  .split-button-primary {
    border-color: var(--interactive-accent);
  }
  
  .split-button-primary .split-button-main,
  .split-button-primary .split-button-toggle {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  
  .split-button-primary .split-button-main:hover,
  .split-button-primary .split-button-toggle:hover {
    background: var(--interactive-accent-hover);
  }
  
  .split-button-ghost {
    border-color: transparent;
  }
  
  .split-button-ghost .split-button-main,
  .split-button-ghost .split-button-toggle {
    background: transparent;
  }
  
  /* 下拉菜单 */
  .split-button-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 180px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    box-shadow: var(--shadow-s);
    z-index: 1000;
    padding: 4px;
    animation: menuSlideIn 0.15s ease-out;
  }
  
  @keyframes menuSlideIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    cursor: pointer;
    border-radius: 4px;
    font-size: 0.875rem;
    text-align: left;
    transition: background 0.15s ease;
  }
  
  .menu-item:hover:not(.disabled) {
    background: var(--background-modifier-hover);
  }
  
  .menu-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

