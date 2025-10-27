<!--
  模板来源筛选器组件
  职责：提供模板的来源筛选（Tuanki/Anki）
-->
<script lang="ts">
  interface Props {
    sourceFilter: 'all' | 'tuanki' | 'anki';
    onSourceFilterChange: (filter: 'all' | 'tuanki' | 'anki') => void;
  }

  let { 
    sourceFilter, 
    onSourceFilterChange 
  }: Props = $props();
</script>

<!-- 模板来源筛选器 -->
<div class="template-source-filter">
  <div class="filter-label">模板来源筛选：</div>
  <div class="filter-buttons">
    <button
      class="filter-btn"
      class:active={sourceFilter === 'all'}
      onclick={() => onSourceFilterChange('all')}
    >
      全部来源
    </button>
    <button
      class="filter-btn tuanki"
      class:active={sourceFilter === 'tuanki'}
      onclick={() => onSourceFilterChange('tuanki')}
    >
      🔵 Tuanki模板
    </button>
    <button
      class="filter-btn anki"
      class:active={sourceFilter === 'anki'}
      onclick={() => onSourceFilterChange('anki')}
    >
      🟢 外部Anki模板
    </button>
  </div>
</div>

<style>
  /* 模板来源筛选器容器 */
  .template-source-filter {
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-md);
    margin-bottom: var(--tuanki-space-lg);
    padding: var(--tuanki-space-md);
    background: var(--background-secondary);
    border-radius: var(--tuanki-radius-md);
    border: 1px solid var(--background-modifier-border);
  }

  /* 筛选标签 */
  .filter-label {
    font-weight: 500;
    color: var(--text-normal);
    white-space: nowrap;
    font-size: 0.9rem;
  }

  /* 按钮组容器 */
  .filter-buttons {
    display: flex;
    gap: var(--tuanki-space-xs);
    flex-wrap: wrap;
  }

  /* 筛选按钮样式 */
  .filter-btn {
    padding: var(--tuanki-space-xs) var(--tuanki-space-sm);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--tuanki-radius-sm);
    color: var(--text-muted);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .filter-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }

  .filter-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
    font-weight: 600;
  }

  /* 响应式设计：窄屏幕下垂直布局 */
  @media (max-width: 768px) {
    .template-source-filter {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--tuanki-space-sm);
    }

    .filter-buttons {
      width: 100%;
    }

    .filter-btn {
      flex: 1;
    }
  }
</style>
