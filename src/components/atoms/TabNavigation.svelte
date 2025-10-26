<script lang="ts">
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import type { IconName } from "../../icons/index.js";

  interface TabItem {
    id: string;
    label: string;
    icon?: IconName;
    badge?: number | string;
    disabled?: boolean;
    tooltip?: string;
  }

  interface Props {
    items: TabItem[];
    activeId: string;
    onChange: (id: string) => void;
    variant?: 'default' | 'pills' | 'underline' | 'compact';
    size?: 'sm' | 'md' | 'lg';
    orientation?: 'horizontal' | 'vertical';
    fullWidth?: boolean;
    animated?: boolean;
  }

  let {
    items,
    activeId,
    onChange,
    variant = 'default',
    size = 'md',
    orientation = 'horizontal',
    fullWidth = false,
    animated = true
  }: Props = $props();

  // 计算当前活动标签的索引
  let activeIndex = $derived(items.findIndex(item => item.id === activeId));

  // 计算指示器位置和大小
  let indicatorStyle = $derived.by(() => {
    if (!animated || activeIndex === -1) return '';
    
    if (orientation === 'horizontal') {
      const width = 100 / items.length;
      const translateX = activeIndex * 100;
      return `transform: translateX(${translateX}%); width: ${width}%;`;
    } else {
      const height = 100 / items.length;
      const translateY = activeIndex * 100;
      return `transform: translateY(${translateY}%); height: ${height}%;`;
    }
  });

  function handleTabClick(item: TabItem) {
    if (item.disabled) return;
    onChange(item.id);
  }

  function handleKeyDown(event: KeyboardEvent, item: TabItem) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleTabClick(item);
    }
  }
</script>

<div
  class="tuanki-tabs tuanki-tabs-{variant} tuanki-tabs-{size} tuanki-tabs-{orientation}"
  class:tuanki-tabs-full={fullWidth}
  class:tuanki-tabs-animated={animated}
  role="tablist"
  aria-orientation={orientation}
>
  {#each items as item, index}
    <button
      role="tab"
      tabindex={item.disabled ? -1 : 0}
      aria-selected={activeId === item.id}
      aria-disabled={item.disabled}
      class="tuanki-tab"
      class:active={activeId === item.id}
      class:disabled={item.disabled}
      onclick={() => handleTabClick(item)}
      onkeydown={(e) => handleKeyDown(e, item)}
      title={item.tooltip}
    >
      {#if item.icon}
        <div class="tuanki-tab-icon">
          <EnhancedIcon
            name={item.icon}
            size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16}
          />
          {#if item.badge}
            <span class="tuanki-tab-badge">{item.badge}</span>
          {/if}
        </div>
      {/if}

      <span class="tuanki-tab-label">{item.label}</span>

      {#if item.badge && !item.icon}
        <span class="tuanki-tab-badge tuanki-tab-badge-standalone">{item.badge}</span>
      {/if}
    </button>
  {/each}

  <!-- 活动指示器 -->
  {#if animated && variant === 'underline'}
    <div
      class="tuanki-tab-indicator"
      style={indicatorStyle}
    ></div>
  {/if}

  <!-- 占位器（用于某些布局） -->
  {#if !fullWidth && orientation === 'horizontal'}
    <div class="tuanki-tabs-spacer"></div>
  {/if}
</div>

<style>
  .tuanki-tabs {
    display: flex;
    position: relative;
    background: var(--background-secondary);
    border-radius: var(--radius-m, 0.5rem);
    padding: 0.25rem;
    gap: 0.125rem;
    transition: all 0.2s ease;
  }

  .tuanki-tabs-vertical {
    flex-direction: column;
    width: fit-content;
  }

  .tuanki-tabs-horizontal {
    flex-direction: row;
  }

  .tuanki-tabs-full {
    width: 100%;
  }

  .tuanki-tabs-full .tuanki-tab {
    flex: 1;
  }

  /* 尺寸变体 */
  .tuanki-tabs-sm {
    padding: 0.125rem;
    gap: 0.0625rem;
  }

  .tuanki-tabs-lg {
    padding: 0.375rem;
    gap: 0.25rem;
  }

  /* 样式变体 */
  .tuanki-tabs-pills {
    background: transparent;
    gap: 0.5rem;
    padding: 0;
  }

  .tuanki-tabs-underline {
    background: transparent;
    border-bottom: 1px solid var(--background-modifier-border);
    border-radius: 0;
    padding: 0;
    gap: 0;
  }

  .tuanki-tabs-compact {
    padding: 0.125rem;
    gap: 0.0625rem;
  }

  /* 标签按钮 */
  .tuanki-tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.875rem;
    border: none;
    border-radius: var(--radius-s, 0.375rem);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 500;
    font-family: var(--font-interface);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    position: relative;
    z-index: 1;
  }

  .tuanki-tab:hover:not(.disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    transform: translateY(-1px);
  }

  .tuanki-tab:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .tuanki-tab.active {
    background: linear-gradient(135deg, var(--color-accent), var(--color-accent-2, #6366f1));
    color: white;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.25);
  }

  .tuanki-tab.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* 尺寸变体的标签 */
  .tuanki-tabs-sm .tuanki-tab {
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    gap: 0.375rem;
  }

  .tuanki-tabs-lg .tuanki-tab {
    padding: 0.75rem 1.125rem;
    font-size: 1rem;
    gap: 0.625rem;
  }

  /* Pills 变体 */
  .tuanki-tabs-pills .tuanki-tab {
    border-radius: var(--radius-l, 0.75rem);
    border: 1px solid var(--background-modifier-border);
  }

  .tuanki-tabs-pills .tuanki-tab.active {
    border-color: var(--color-accent);
  }

  /* Underline 变体 */
  .tuanki-tabs-underline .tuanki-tab {
    border-radius: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    padding-bottom: 0.75rem;
  }

  .tuanki-tabs-underline .tuanki-tab:hover:not(.disabled) {
    background: var(--background-modifier-hover);
    border-bottom-color: var(--text-muted);
  }

  .tuanki-tabs-underline .tuanki-tab.active {
    background: transparent;
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
    box-shadow: none;
  }

  /* Compact 变体 */
  .tuanki-tabs-compact .tuanki-tab {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    gap: 0.25rem;
  }

  /* 图标和标签 */
  .tuanki-tab-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .tuanki-tab-label {
    flex-shrink: 0;
  }

  /* 徽章 */
  .tuanki-tab-badge {
    position: absolute;
    top: -6px;
    right: -8px;
    background: var(--tuanki-error);
    color: var(--tuanki-text-on-accent);
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-l, 0.75rem);
    line-height: 1;
    min-width: 1rem;
    text-align: center;
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
  }

  .tuanki-tab-badge-standalone {
    position: static;
    margin-left: 0.375rem;
  }

  .tuanki-tab.active .tuanki-tab-badge {
    background: var(--tuanki-text-on-accent);
    color: var(--color-accent);
  }

  /* 活动指示器（用于 underline 变体） */
  .tuanki-tab-indicator {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--color-accent);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 1px 1px 0 0;
  }

  /* 占位器 */
  .tuanki-tabs-spacer {
    flex: 1;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .tuanki-tabs-horizontal {
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .tuanki-tabs-horizontal::-webkit-scrollbar {
      display: none;
    }

    .tuanki-tab {
      flex-shrink: 0;
    }

    .tuanki-tabs-sm .tuanki-tab {
      padding: 0.25rem 0.5rem;
    }

    .tuanki-tabs-lg .tuanki-tab {
      padding: 0.5rem 0.875rem;
    }
  }

  @media (max-width: 480px) {
    .tuanki-tab-label {
      display: none;
    }

    .tuanki-tabs-compact .tuanki-tab-label {
      display: inline;
    }

    .tuanki-tab {
      min-width: 2.5rem;
      justify-content: center;
    }
  }

  /* 动画优化 */
  @media (prefers-reduced-motion: reduce) {
    .tuanki-tab,
    .tuanki-tab-indicator {
      transition: none;
    }
  }

  /* 高对比度模式 */
  @media (prefers-contrast: high) {
    .tuanki-tab.active {
      border: 2px solid var(--color-accent);
    }

    .tuanki-tabs-underline .tuanki-tab.active {
      border-bottom-width: 3px;
    }
  }
</style>
