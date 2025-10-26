<script lang="ts">
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import { isDarkMode as detectDarkMode, createThemeListener } from '../../utils/theme-detection';
  import { onMount } from 'svelte';
  import { getCardTypeName, type UnifiedCardType } from '../../types/unified-card-types';
  import { ERROR_LEVEL_CONFIG } from '../../utils/error-book-utils';

  interface FilterState {
    status: Set<string>;
    decks: Set<string>;
    tags: Set<string>;
    questionTypes: Set<string>;
    errorBooks: Set<string>;
    searchQuery: string;
  }

  interface Props {
    visible: boolean;
    filters: FilterState;
    availableDecks: Array<{ id: string; name: string; count: number }>;
    availableTags: Array<{ name: string; count: number }>;
    statusCounts: Record<string, number>;
    questionTypeCounts: Record<string, number>;
    errorBookCounts: Record<string, number>;
    onFilterChange: (data: { type: string; value: string; checked: boolean }) => void;
    onClearFilters: () => void;
    onClose: () => void;
    onOpenAdvancedFilter?: () => void;
  }

  let {
    visible,
    filters,
    availableDecks,
    availableTags,
    statusCounts,
    questionTypeCounts,
    errorBookCounts,
    onFilterChange,
    onClearFilters,
    onClose,
    onOpenAdvancedFilter
  }: Props = $props();

  // 状态配置
  const statusOptions = [
    { value: "new", label: "新卡片", class: "tuanki-status-new" },
    { value: "learning", label: "学习中", class: "tuanki-status-learning" },
    { value: "review", label: "复习中", class: "tuanki-status-review" },
    { value: "mastered", label: "已掌握", class: "tuanki-status-mastered" }
  ];

  // 处理筛选选项点击
  function handleFilterToggle(type: 'status' | 'decks' | 'tags' | 'questionTypes' | 'errorBooks', value: string) {
    const checked = !filters[type].has(value);
    onFilterChange({ type, value, checked });
  }


  // 移除折叠状态管理，采用扁平化设计

  // 检查是否有活动筛选
  function hasActiveFilters(): boolean {
    return filters.status.size > 0 || 
           filters.decks.size > 0 || 
           filters.tags.size > 0 ||
           filters.questionTypes.size > 0 ||
           filters.errorBooks.size > 0;
  }

  // 获取活动筛选数量
  function getActiveFilterCount(): number {
    return filters.status.size + 
           filters.decks.size + 
           filters.tags.size +
           filters.questionTypes.size +
           filters.errorBooks.size;
  }

  // 多彩标签颜色系统
  const tagColors = [
    {
      name: 'blue',
      light: { bg: 'rgba(59, 130, 246, 0.15)', text: 'rgb(59, 130, 246)', border: 'rgba(59, 130, 246, 0.3)' },
      dark: { bg: 'rgba(59, 130, 246, 0.2)', text: 'rgb(147, 197, 253)', border: 'rgba(59, 130, 246, 0.4)' }
    },
    {
      name: 'purple',
      light: { bg: 'rgba(139, 92, 246, 0.15)', text: 'rgb(139, 92, 246)', border: 'rgba(139, 92, 246, 0.3)' },
      dark: { bg: 'rgba(139, 92, 246, 0.2)', text: 'rgb(196, 181, 253)', border: 'rgba(139, 92, 246, 0.4)' }
    },
    {
      name: 'pink',
      light: { bg: 'rgba(236, 72, 153, 0.15)', text: 'rgb(236, 72, 153)', border: 'rgba(236, 72, 153, 0.3)' },
      dark: { bg: 'rgba(236, 72, 153, 0.2)', text: 'rgb(251, 207, 232)', border: 'rgba(236, 72, 153, 0.4)' }
    },
    {
      name: 'red',
      light: { bg: 'rgba(239, 68, 68, 0.15)', text: 'rgb(239, 68, 68)', border: 'rgba(239, 68, 68, 0.3)' },
      dark: { bg: 'rgba(239, 68, 68, 0.2)', text: 'rgb(252, 165, 165)', border: 'rgba(239, 68, 68, 0.4)' }
    },
    {
      name: 'orange',
      light: { bg: 'rgba(245, 158, 11, 0.15)', text: 'rgb(245, 158, 11)', border: 'rgba(245, 158, 11, 0.3)' },
      dark: { bg: 'rgba(245, 158, 11, 0.2)', text: 'rgb(253, 186, 116)', border: 'rgba(245, 158, 11, 0.4)' }
    },
    {
      name: 'green',
      light: { bg: 'rgba(34, 197, 94, 0.15)', text: 'rgb(34, 197, 94)', border: 'rgba(34, 197, 94, 0.3)' },
      dark: { bg: 'rgba(34, 197, 94, 0.2)', text: 'rgb(134, 239, 172)', border: 'rgba(34, 197, 94, 0.4)' }
    },
    {
      name: 'cyan',
      light: { bg: 'rgba(6, 182, 212, 0.15)', text: 'rgb(6, 182, 212)', border: 'rgba(6, 182, 212, 0.3)' },
      dark: { bg: 'rgba(6, 182, 212, 0.2)', text: 'rgb(165, 243, 252)', border: 'rgba(6, 182, 212, 0.4)' }
    },
    {
      name: 'gray',
      light: { bg: 'rgba(107, 114, 128, 0.15)', text: 'rgb(107, 114, 128)', border: 'rgba(107, 114, 128, 0.3)' },
      dark: { bg: 'rgba(107, 114, 128, 0.2)', text: 'rgb(209, 213, 219)', border: 'rgba(107, 114, 128, 0.4)' }
    }
  ];

  // 主题检测
  let isDarkMode = $state(detectDarkMode());

  onMount(() => {
    const cleanup = createThemeListener((isDark) => {
      isDarkMode = isDark;
    });
    return cleanup;
  });

  // 获取标签颜色索引
  function getTagColorIndex(tag: string): number {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      const char = tag.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % tagColors.length;
  }

  // 获取标签样式
  function getTagStyle(tag: string) {
    const colorIndex = getTagColorIndex(tag);
    const color = tagColors[colorIndex];
    const theme = isDarkMode ? color.dark : color.light;
    return {
      backgroundColor: theme.bg,
      color: theme.text,
      borderColor: theme.border
    };
  }
</script>

<aside 
  class="tuanki-filter-sidebar"
  class:visible
>
  <div class="sidebar-header">
    <div class="header-title">
      <EnhancedIcon name="filter" size={16} />
      <span>侧边栏</span>
    </div>
    <div class="header-actions">
      {#if hasActiveFilters()}
        <button class="clear-btn" onclick={onClearFilters}>
          清除
        </button>
      {/if}
      <button class="close-btn" onclick={onClose}>
        <EnhancedIcon name="x" size={16} />
      </button>
    </div>
  </div>

  <div class="sidebar-content">
    <!-- 卡片状态筛选 -->
    <div class="filter-group">
      <h4>卡片状态</h4>
      {#each statusOptions as option}
        <button 
          type="button"
          class="tuanki-filter-option"
          class:active={filters.status.has(option.value)}
          onclick={() => handleFilterToggle('status', option.value)}
        >
          <span class="option-label">{option.label}</span>
          <span class="option-count">{statusCounts[option.value] || 0}</span>
        </button>
      {/each}
    </div>

    <!-- 牌组筛选 -->
    <div class="filter-group">
      <h4>牌组</h4>
      {#each availableDecks as deck}
        <button 
          type="button"
          class="tuanki-filter-option"
          class:active={filters.decks.has(deck.id)}
          onclick={() => handleFilterToggle('decks', deck.id)}
        >
          <span class="option-label">{deck.name}</span>
          <span class="option-count">{deck.count}</span>
        </button>
      {/each}
      
      {#if availableDecks.length === 0}
        <div class="tuanki-empty-state">
          <span class="tuanki-text-muted">暂无牌组</span>
        </div>
      {/if}
    </div>

    <!-- 标签筛选 -->
    <div class="filter-group">
      <h4>标签</h4>
      {#each availableTags as tag}
        {@const tagStyle = getTagStyle(tag.name)}
        <button
          type="button"
          class="tuanki-filter-option tag-option"
          class:active={filters.tags.has(tag.name)}
          onclick={() => handleFilterToggle('tags', tag.name)}
        >
          <span
            class="tag-chip"
            style="background-color: {tagStyle.backgroundColor}; color: {tagStyle.color};"
          >
            {tag.name}
          </span>
          <span class="option-count">{tag.count}</span>
        </button>
      {/each}

      {#if availableTags.length === 0}
        <div class="tuanki-empty-state">
          <span class="tuanki-text-muted">暂无标签</span>
        </div>
      {/if}
    </div>

    <!-- 🆕 题型筛选 -->
    <div class="filter-group">
      <h4>题型</h4>
      {#each Object.entries(questionTypeCounts) as [type, count]}
        <button
          type="button"
          class="tuanki-filter-option"
          class:active={filters.questionTypes.has(type)}
          onclick={() => handleFilterToggle('questionTypes', type)}
        >
          <span class="option-label">{getCardTypeName(type as UnifiedCardType)}</span>
          <span class="option-count">{count}</span>
        </button>
      {/each}

      {#if Object.keys(questionTypeCounts).length === 0}
        <div class="tuanki-empty-state">
          <span class="tuanki-text-muted">暂无题型</span>
        </div>
      {/if}
    </div>

    <!-- 🆕 错题集筛选 -->
    <div class="filter-group">
      <h4>错题集</h4>
      {#each Object.entries(ERROR_LEVEL_CONFIG) as [level, config]}
        {@const count = errorBookCounts[level] || 0}
        {#if count > 0}
          <button
            type="button"
            class="tuanki-filter-option error-book-option"
            class:active={filters.errorBooks.has(level)}
            onclick={() => handleFilterToggle('errorBooks', level)}
          >
            <div class="error-level-indicator" style="background: {config.color};"></div>
            <span class="option-label">{config.label}</span>
            <span class="option-count" style="color: {config.color};">{count}</span>
          </button>
        {/if}
      {/each}

      {#if Object.values(errorBookCounts).every(c => c === 0)}
        <div class="tuanki-empty-state">
          <span class="tuanki-text-muted">暂无错题</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- 筛选摘要 -->
  {#if hasActiveFilters()}
    <footer class="tuanki-sidebar-footer">
      <div class="tuanki-filter-summary">
        <EnhancedIcon name="info-circle" size={14} />
        <span>已应用 {getActiveFilterCount()} 个筛选条件</span>
      </div>
    </footer>
  {/if}
</aside>

<style>
  /* Base button reset for semantic buttons */
  button.tuanki-filter-option {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  
  .tuanki-filter-sidebar {
    width: 280px;
    max-width: 0;
    background: var(--background-secondary);
    border-right: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
    padding: 0;
  }

  .tuanki-filter-sidebar.visible {
    max-width: 280px;
    padding: 1rem;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .clear-btn {
    background: none;
    border: none;
    color: var(--text-accent);
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-s);
  }

  .clear-btn:hover {
    background: var(--background-modifier-hover);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: var(--radius-s);
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  /* --- UI 优化 --- */

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding-right: 0.5rem; /* 为滚动条留出空间 */
    margin-right: -0.5rem;
  }

  /* 滚动条美化 */
  .sidebar-content::-webkit-scrollbar {
    width: 6px;
  }
  .sidebar-content::-webkit-scrollbar-track {
    background: transparent;
  }
  .sidebar-content::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 3px;
  }
  .sidebar-content::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  .filter-group {
    padding-bottom: 1.5rem;
    /* 移除分隔线，使用间距分隔 */
  }

  .filter-group:last-child {
    padding-bottom: 0;
  }

  /* 移除折叠组样式，采用扁平化设计 */

  .filter-group h4 {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin: 0 0 0.75rem 0;
    padding: 0 0.25rem;
  }

  /* Obsidian 原生风格扁平化列表项 - 类似文件列表 */
  .tuanki-filter-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.375rem 0.5rem;
    border-radius: var(--radius-s);
    font-size: 0.875rem;
    transition: background-color 0.12s ease;
    position: relative;
    color: var(--text-normal);
    border: none;
    box-shadow: none;
  }

  .tuanki-filter-option:hover {
    background: var(--background-modifier-hover);
  }

  .tuanki-filter-option.active {
    background: var(--background-modifier-active-hover);
    color: var(--text-normal);
    font-weight: 500;
  }

  .tuanki-filter-option.active .option-count {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-weight: 600;
  }

  .option-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0;
    border-radius: 0;
    transition: all 0.2s ease;
    background-color: transparent;
    border: none;
  }

  .tuanki-filter-option:hover .option-label {
    background-color: transparent;
    border-color: transparent;
    color: var(--text-normal);
  }

  .option-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 2px 6px;
    border-radius: var(--radius-l);
    font-weight: 500;
  }

  /* 标签芯片样式 - 保留多彩设计 */
  .tag-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    border-radius: var(--tag-radius);
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid currentColor;
    transition: transform 0.15s ease, opacity 0.15s ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
    opacity: 0.9;
  }

  .tag-option {
    align-items: center;
    gap: 0.75rem;
  }

  .tag-option:hover .tag-chip {
    opacity: 1;
  }

  /* 选中标签时保留其原有颜色，仅增强显示 */
  .tag-option.active .tag-chip {
    opacity: 1;
    font-weight: 600;
    border-width: 1.5px;
    transform: scale(1.02);
  }
  
  .tuanki-sidebar-footer {
    border-top: 1px solid var(--background-modifier-border);
    padding-top: 1rem;
    margin-top: auto;
    flex-shrink: 0;
  }

  .tuanki-filter-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  
  .tuanki-empty-state {
    padding: 0.5rem;
    text-align: center;
  }
  
  .tuanki-text-muted {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }


  /* 🆕 错题集选项样式 */
  .error-book-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .error-level-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .error-book-option.active .error-level-indicator {
    box-shadow: 0 0 0 2px currentColor;
  }

  /* 移动端适配 */
  @media (max-width: 768px) {
    .tuanki-filter-sidebar {
      width: 280px;
    }
  }

  @media (max-width: 480px) {
    .tuanki-filter-sidebar {
      width: 100%;
      max-width: 320px;
    }
  }
</style>
