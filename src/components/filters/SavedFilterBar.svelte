<script lang="ts">
  import type { SavedFilter } from "../../types/filter-types";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import { filterManager } from "../../services/filter-manager";
  
  interface Props {
    activeFilterId?: string;
    onFilterSelect: (filter: SavedFilter | null) => void;
    onNewFilter: () => void;
    onManageFilters?: () => void;
  }

  let { 
    activeFilterId, 
    onFilterSelect, 
    onNewFilter,
    onManageFilters 
  }: Props = $props();

  // 获取固定的筛选器
  let pinnedFilters = $state<SavedFilter[]>([]);
  let showDropdown = $state(false);
  let allFilters = $state<SavedFilter[]>([]);

  // 加载筛选器
  function loadFilters() {
    pinnedFilters = filterManager.getPinnedFilters();
    allFilters = filterManager.getAllFilters();
  }

  // 初始化
  $effect(() => {
    loadFilters();
  });

  // 选择筛选器
  function selectFilter(filter: SavedFilter) {
    filterManager.recordFilterUsage(filter.id);
    onFilterSelect(filter);
    showDropdown = false;
    loadFilters(); // 重新加载以更新使用次数
  }

  // 清除筛选器
  function clearFilter() {
    onFilterSelect(null);
    showDropdown = false;
  }

  // 切换下拉菜单
  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  // 关闭下拉菜单
  function closeDropdown() {
    showDropdown = false;
  }

  // 获取筛选器显示名称
  function getFilterDisplayName(filter: SavedFilter): string {
    return filter.name + (filter.isBuiltIn ? '' : ' ⭐');
  }

  // 点击外部关闭下拉菜单
  function handleOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.saved-filter-bar')) {
      closeDropdown();
    }
  }

  $effect(() => {
    if (showDropdown) {
      document.addEventListener('click', handleOutsideClick);
      return () => {
        document.removeEventListener('click', handleOutsideClick);
      };
    }
  });
</script>

<div class="saved-filter-bar">
  <!-- 筛选器下拉菜单 -->
  <div class="filter-dropdown">
    <button class="dropdown-trigger" onclick={toggleDropdown}>
      <EnhancedIcon name="filter" size={16} />
      <span>我的筛选</span>
      <EnhancedIcon name="chevron-down" size={14} />
    </button>

    {#if showDropdown}
      <div class="dropdown-menu">
        <div class="dropdown-header">
          <span>筛选器</span>
          {#if onManageFilters}
            <button class="manage-btn" onclick={onManageFilters}>
              管理
            </button>
          {/if}
        </div>

        <div class="dropdown-content">
          <!-- 清除筛选 -->
          <button 
            class="dropdown-item clear-item"
            onclick={clearFilter}
          >
            <EnhancedIcon name="x-circle" size={16} />
            <span>清除筛选</span>
          </button>

          <div class="dropdown-divider"></div>

          <!-- 内置筛选器 -->
          <div class="filter-section">
            <div class="section-title">内置筛选</div>
            {#each allFilters.filter(f => f.isBuiltIn) as filter}
              <button
                class="dropdown-item filter-item"
                class:active={activeFilterId === filter.id}
                onclick={() => selectFilter(filter)}
              >
                <EnhancedIcon name={filter.icon || 'filter'} size={16} />
                <span class="filter-name">{filter.name}</span>
                {#if filter.useCount > 0}
                  <span class="use-count">{filter.useCount}</span>
                {/if}
              </button>
            {/each}
          </div>

          <!-- 自定义筛选器 -->
          {#if allFilters.filter(f => !f.isBuiltIn).length > 0}
            {@const customFilters = allFilters.filter(f => !f.isBuiltIn)}
            <div class="dropdown-divider"></div>
            <div class="filter-section">
              <div class="section-title">自定义筛选</div>
              {#each customFilters as filter}
                <button
                  class="dropdown-item filter-item"
                  class:active={activeFilterId === filter.id}
                  onclick={() => selectFilter(filter)}
                >
                  <EnhancedIcon name={filter.icon || 'star'} size={16} />
                  <span class="filter-name">{filter.name}</span>
                  {#if filter.useCount > 0}
                    <span class="use-count">{filter.useCount}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <div class="dropdown-footer">
          <button class="new-filter-btn" onclick={onNewFilter}>
            <EnhancedIcon name="plus" size={16} />
            <span>新建筛选器</span>
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- 快捷筛选器按钮 -->
  <div class="quick-filters">
    {#each pinnedFilters as filter}
      <button
        class="quick-filter-btn"
        class:active={activeFilterId === filter.id}
        style:border-color={filter.color || 'var(--interactive-accent)'}
        onclick={() => selectFilter(filter)}
        title={filter.description || filter.name}
      >
        {#if filter.icon}
          <EnhancedIcon name={filter.icon} size={14} />
        {/if}
        <span>{filter.name}</span>
      </button>
    {/each}
  </div>

  <!-- 新建筛选器按钮 -->
  <button class="new-filter-quick-btn" onclick={onNewFilter} title="新建筛选器">
    <EnhancedIcon name="plus" size={16} />
  </button>
</div>

<style>
  .saved-filter-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    flex-wrap: wrap;
  }

  /* 下拉菜单 */
  .filter-dropdown {
    position: relative;
  }

  .dropdown-trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--text-normal);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }

  .dropdown-trigger:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    min-width: 280px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    max-height: 400px;
    display: flex;
    flex-direction: column;
  }

  .dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
    font-weight: 600;
    font-size: 0.875rem;
  }

  .manage-btn {
    background: none;
    border: none;
    color: var(--text-accent);
    font-size: 0.8125rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-s);
  }

  .manage-btn:hover {
    background: var(--background-modifier-hover);
  }

  .dropdown-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    border-radius: var(--radius-s);
    color: var(--text-normal);
    font-size: 0.875rem;
    cursor: pointer;
    width: 100%;
    text-align: left;
    transition: background-color 0.2s ease;
  }

  .dropdown-item:hover {
    background: var(--background-modifier-hover);
  }

  .dropdown-item.active {
    background: var(--background-modifier-hover);
    color: var(--interactive-accent);
    font-weight: 500;
  }

  .clear-item {
    color: var(--text-error);
  }

  .filter-name {
    flex: 1;
  }

  .use-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    background: var(--background-modifier-border);
    padding: 2px 6px;
    border-radius: var(--radius-s);
  }

  .dropdown-divider {
    height: 1px;
    background: var(--background-modifier-border);
    margin: 0.5rem 0;
  }

  .filter-section {
    margin-bottom: 0.5rem;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    padding: 0.5rem 0.75rem 0.25rem;
  }

  .dropdown-footer {
    border-top: 1px solid var(--background-modifier-border);
    padding: 0.5rem;
  }

  .new-filter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: var(--radius-s);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s ease;
  }

  .new-filter-btn:hover {
    opacity: 0.9;
  }

  /* 快捷筛选按钮 */
  .quick-filters {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    flex-wrap: wrap;
  }

  .quick-filter-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4rem 0.75rem;
    background: var(--background-primary);
    border: 1.5px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--text-normal);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .quick-filter-btn:hover {
    background: var(--background-modifier-hover);
    transform: translateY(-1px);
  }

  .quick-filter-btn.active {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    color: var(--interactive-accent);
  }

  .new-filter-quick-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: var(--radius-s);
    cursor: pointer;
    transition: opacity 0.2s ease;
  }

  .new-filter-quick-btn:hover {
    opacity: 0.9;
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .saved-filter-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .quick-filters {
      justify-content: flex-start;
    }

    .dropdown-menu {
      min-width: 240px;
    }
  }
</style>

