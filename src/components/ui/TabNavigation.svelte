<script lang="ts">
  import EnhancedIcon from './EnhancedIcon.svelte';
  import type { TabDefinition } from '../../types/view-card-modal-types';

  interface Props {
    tabs: TabDefinition[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
  }

  let { tabs, activeTab, onTabChange }: Props = $props();

  // 计算指示器位置（使用 left 而不是 transform）
  let indicatorLeft = $derived(() => {
    const index = tabs.findIndex(tab => tab.id === activeTab);
    if (index === -1) return 0;
    return index * (100 / tabs.length);
  });

  let indicatorWidth = $derived(100 / tabs.length);

  // 键盘导航
  function handleKeyDown(event: KeyboardEvent) {
    const currentIndex = tabs.findIndex(tab => tab.id === activeTab);
    if (currentIndex === -1) return;

    let newIndex = currentIndex;
    
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
    }

    if (newIndex !== currentIndex) {
      onTabChange(tabs[newIndex].id);
    }
  }
</script>

<div 
  class="tab-navigation" 
  role="tablist"
  tabindex="0"
  onkeydown={handleKeyDown}
>
  {#each tabs as tab}
    <button
      class="tab-button"
      class:active={activeTab === tab.id}
      role="tab"
      aria-selected={activeTab === tab.id}
      aria-controls="{tab.id}-panel"
      tabindex={activeTab === tab.id ? 0 : -1}
      onclick={() => onTabChange(tab.id)}
    >
      {#if tab.icon}
        <EnhancedIcon name={tab.icon} size={16} />
      {/if}
      <span class="tab-label">{tab.label}</span>
    </button>
  {/each}
  <div 
    class="tab-indicator" 
    style="left: {indicatorLeft()}%; width: {indicatorWidth}%"
  ></div>
</div>

<style>
  .tab-navigation {
    position: relative;
    display: flex;
    align-items: stretch;
    background: transparent;
    border-bottom: 2px solid var(--background-modifier-border);
  }

  .tab-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--size-4-2);
    padding: var(--size-4-3) var(--size-4-2);
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: var(--font-ui-medium);
    font-weight: 500;
    cursor: pointer;
    transition: color 0.2s ease;
    position: relative;
  }

  .tab-button:hover {
    color: var(--text-normal);
  }

  .tab-button.active {
    color: var(--interactive-accent);
    font-weight: 600;
  }

  .tab-button:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: -2px;
  }

  .tab-label {
    white-space: nowrap;
  }

  .tab-indicator {
    position: absolute;
    bottom: -2px;
    height: 3px;
    background: var(--interactive-accent);
    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1), 
                width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 2px 2px 0 0;
  }

  /* 响应式适配 */
  @media (max-width: 600px) {
    .tab-label {
      font-size: var(--font-ui-small);
    }

    .tab-button {
      padding: var(--size-4-2) var(--size-4-1);
      gap: var(--size-4-1);
    }
  }
</style>
