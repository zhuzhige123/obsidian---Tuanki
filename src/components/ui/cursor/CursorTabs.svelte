<script lang="ts">
  // 简单的标签页组件占位符
  interface TabItem {
    id: string;
    label: string;
    disabled?: boolean;
  }

  interface Props {
    items: TabItem[];
    activeTab?: string;
    onTabChange?: (tabId: string) => void;
  }

  let {
    items = [],
    activeTab = items[0]?.id,
    onTabChange
  }: Props = $props();
</script>

<div class="cursor-tabs">
  <div class="tab-list">
    {#each items as item}
      <button
        class="tab-button"
        class:active={activeTab === item.id}
        disabled={item.disabled}
        onclick={() => {
          activeTab = item.id;
          onTabChange?.(item.id);
        }}
      >
        {item.label}
      </button>
    {/each}
  </div>
  <div class="tab-content">
    <slot />
  </div>
</div>

<style>
  .cursor-tabs {
    display: flex;
    flex-direction: column;
  }

  .tab-list {
    display: flex;
    border-bottom: 1px solid var(--tuanki-border);
  }

  .tab-button {
    padding: var(--tuanki-spacing-md);
    border: none;
    background: none;
    cursor: pointer;
    color: var(--tuanki-text-muted);
    border-bottom: 2px solid transparent;
  }

  .tab-button.active {
    color: var(--tuanki-primary);
    border-bottom-color: var(--tuanki-primary);
  }

  .tab-content {
    padding: var(--tuanki-spacing-lg);
  }
</style>
