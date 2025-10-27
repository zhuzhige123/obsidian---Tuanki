<script lang="ts">
  /**
   * 牌组类型筛选器
   * - parent: 父卡片牌组
   * - child: 子卡片牌组
   * - all: 全部牌组
   */
  export type DeckFilter = 'parent' | 'child' | 'all';

  interface Props {
    selectedFilter: DeckFilter;
    onSelect: (filter: DeckFilter) => void;
  }

  let { selectedFilter, onSelect }: Props = $props();

  // 固定的三个筛选选项
  const filters: Array<{ id: DeckFilter; name: string; colorStart: string; colorEnd: string }> = [
    {
      id: 'parent',
      name: '父卡片牌组',
      colorStart: '#ef4444',
      colorEnd: '#dc2626'
    },
    {
      id: 'child',
      name: '子卡片牌组',
      colorStart: '#3b82f6',
      colorEnd: '#2563eb'
    },
    {
      id: 'all',
      name: '全部牌组',
      colorStart: '#f59e0b',
      colorEnd: '#d97706'
    }
  ];

  function getGradientStyle(filter: typeof filters[0]): string {
    return `background: linear-gradient(135deg, ${filter.colorStart}, ${filter.colorEnd})`;
  }
</script>

<div class="category-filter">
  {#each filters as filter}
    <button
      class="category-dot"
      class:selected={selectedFilter === filter.id}
      style={getGradientStyle(filter)}
      onclick={() => onSelect(filter.id)}
      aria-label={filter.name}
      title={filter.name}
    >
      {#if selectedFilter === filter.id}
        <span class="selected-indicator"></span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .category-filter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 0px 0 0px 0; /* 🆕 完全移除padding，最大化向上移动 */
    margin-bottom: 4px;
  }

  .category-dot {
    position: relative;
    width: 16px; /* 🆕 增大到16px，参考加载进度条圆点 */
    height: 16px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    padding: 0;
    outline: none;
  }

  .category-dot:hover {
    transform: scale(1.25);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }

  .category-dot:active {
    transform: scale(1.15);
  }

  .category-dot:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .category-dot.selected {
    transform: scale(1.35);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
  }

  /* 选中状态的脉冲边框 */
  .category-dot.selected::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.6);
    opacity: 0.6;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.15);
      opacity: 0.3;
    }
  }

  /* 选中指示器（白色小圆点） */
  .selected-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 6px; /* 🆕 调整为16px圆点的合适比例 */
    height: 6px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.5);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .category-filter {
      gap: 12px;
      padding: 0px 0 0px 0; /* 移动端也完全移除padding */
    }

    .category-dot {
      width: 14px;
      height: 14px;
    }

    .selected-indicator {
      width: 5px;
      height: 5px;
    }
  }
</style>
