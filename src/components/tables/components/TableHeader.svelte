<script lang="ts">
  import EnhancedIcon from "../../ui/EnhancedIcon.svelte";
  import { currentLanguage } from '../../../utils/i18n';
  import ColumnResizer from "./ColumnResizer.svelte";
  import TableCheckbox from "./TableCheckbox.svelte";
  import { getSortIcon, getSortAriaLabel, isAllSelected, isIndeterminate } from "../utils/table-utils";
  import { getColumnLabel, getColumnTooltip, isSortableColumn } from "../utils/column-config";
  import type { TableHeaderProps, ColumnKey, TableViewMode } from "../types/table-types";

  let { 
    columnOrder,
    tableViewMode = 'basic',
    sortConfig, 
    selectedCards, 
    totalCards, 
    columnWidths,
    onSelectAll, 
    onSort,
    isSorting = false,
    onColumnResize
  }: TableHeaderProps = $props();
  
  // 获取列的分组样式类
  function getColumnGroupClass(key: ColumnKey, mode: TableViewMode = 'basic'): string {
    const groupConfig: Record<TableViewMode, Record<string, ColumnKey[]>> = {
      basic: {
        core: ['front', 'back'],
        basic: ['status', 'deck', 'tags', 'priority', 'created', 'modified'],
        source: ['source_document', 'obsidian_block_link'],
      },
      review: {
        core: ['front', 'back'],
        review: ['status', 'next_review', 'retention', 'interval', 'difficulty', 'review_count'],
      },
      questionBank: {
        core: ['front', 'back'],
        basic: ['deck', 'question_bank_deck', 'tags', 'priority'],
        test: ['question_type', 'accuracy', 'test_attempts', 'last_test', 'error_level'],
        meta: ['created'],
      },
      irContent: {
        core: ['ir_title'],
        schedule: ['ir_state', 'ir_priority', 'ir_next_review', 'ir_review_count', 'ir_reading_time'],
        content: ['ir_notes', 'ir_extract_cards', 'ir_memory_cards'],
        meta: ['ir_source_file', 'ir_source_kind', 'ir_source_subunit', 'ir_tags', 'ir_decks', 'ir_created'],
      },
    };
    
    const groups = groupConfig[mode];
    if (!groups) return ''; //  防御性编程：如果mode不存在，返回空字符串
    for (const groupName in groups) {
      const keys = groups[groupName];
      if (keys.includes(key)) {
        const isLastInGroup = keys[keys.length - 1] === key;
        return `group-${groupName}${isLastInGroup ? ' group-end' : ''}`;
      }
    }
    return '';
  }

  const allSelected = $derived(isAllSelected(selectedCards.size, totalCards));
  const indeterminate = $derived(isIndeterminate(selectedCards.size, totalCards));
  
  // 获取当前语言（统一走全局 i18n，避免和其他区域语言状态分叉）
  const currentLocale = $derived.by<'zh' | 'en'>(() => {
    return $currentLanguage === 'en-US' ? 'en' : 'zh';
  });
</script>

<thead class="weave-table-header">
  <tr>
    <!-- 复选框列（固定） -->
    <th 
      class="weave-checkbox-column weave-resizable-column" 
      style="width: {columnWidths.checkbox}px;"
      title={currentLocale === 'zh' ? '全选' : 'Select all'}
    >
      <div class="weave-checkbox-wrapper">
        <TableCheckbox
          checked={allSelected}
          indeterminate={indeterminate}
          onchange={onSelectAll}
        />
      </div>
      <ColumnResizer columnKey="checkbox" onResize={onColumnResize} />
    </th>

    <!-- 动态列 -->
    {#each columnOrder as columnKey (columnKey)}
      {#if columnKey === 'actions'}
        <!-- 操作列（特殊处理） -->
        <th 
          class="weave-actions-column weave-resizable-column" 
          style="width: {columnWidths[columnKey]}px;"
          title={getColumnTooltip(columnKey, currentLocale)}
        >
          <span class="weave-column-text">
            {getColumnLabel(columnKey, currentLocale)}
          </span>
          <ColumnResizer {columnKey} onResize={onColumnResize} />
        </th>
      {:else if isSortableColumn(columnKey)}
        <!-- 可排序列 -->
        <th 
          class="weave-sortable-column weave-resizable-column {getColumnGroupClass(columnKey, tableViewMode)}" 
          class:sorting-disabled={isSorting}
          class:sorted={columnKey === sortConfig.field}
          style="width: {columnWidths[columnKey]}px;" 
          onclick={() => {
            if (!isSorting) {
              onSort(columnKey);
            }
          }}
          role="button"
          tabindex={isSorting ? -1 : 0}
          aria-label={getSortAriaLabel(columnKey, sortConfig.field, sortConfig.direction, currentLocale)}
          aria-disabled={isSorting}
          title={isSorting ? '排序进行中，请稍候...' : getColumnTooltip(columnKey, currentLocale)}
          onkeydown={(e) => {
            if (!isSorting && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSort(columnKey);
            }
          }}
        >
          <div class="weave-column-header">
            <span class="weave-column-text">
              {getColumnLabel(columnKey, currentLocale)}
            </span>
            <span class="weave-sort-icon" aria-hidden="true">
              <EnhancedIcon 
                name={getSortIcon(columnKey, sortConfig.field, sortConfig.direction)} 
                size={12}
                variant={columnKey === sortConfig.field ? 'primary' : 'muted'}
              />
            </span>
          </div>
          <ColumnResizer {columnKey} onResize={onColumnResize} />
        </th>
      {:else}
        <!-- 普通列 -->
        <th 
          class="weave-resizable-column" 
          style="width: {columnWidths[columnKey]}px;"
          title={getColumnTooltip(columnKey, currentLocale)}
        >
          <span class="weave-column-text">
            {getColumnLabel(columnKey, currentLocale)}
          </span>
          <ColumnResizer {columnKey} onResize={onColumnResize} />
        </th>
      {/if}
    {/each}
  </tr>
</thead>

<style>
  /* ============================================
     表格头部增强样式
     ============================================ */
  
  .weave-table-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(
      --weave-table-header-bg,
      var(--background-secondary-alt, var(--background-secondary))
    );
    border-bottom: 1px solid var(--weave-table-header-border, var(--background-modifier-border));
  }

  .weave-table-header th {
    padding: var(--weave-table-header-padding-y, 8px) var(--weave-table-header-padding-x, 16px);
    text-align: left;
    font-weight: 600;
    color: var(--weave-table-header-fg, var(--text-muted));
    font-size: 11px;
    text-transform: none;
    letter-spacing: 0.04em;
    background: transparent;
    border-right: 1px solid var(--weave-table-header-divider, var(--background-modifier-border));
    height: var(--weave-table-header-cell-height, 34px);
    vertical-align: middle;
    transition: background-color 0.15s ease, color 0.15s ease;
  }
  
  /* 分组列结构：分组结束标记 */
  .weave-table-header th.group-end {
    border-right: 2px solid var(--weave-table-header-divider, var(--background-modifier-border));
  }

  /* 可排序列样式 */
  .weave-sortable-column {
    cursor: pointer;
    user-select: none;
  }

  .weave-sortable-column:hover {
    background: var(--weave-table-header-cell-hover-bg, var(--background-modifier-hover));
    color: var(--weave-table-header-fg, var(--text-muted));
  }

  .weave-sortable-column:active {
    background: var(--background-modifier-active-hover);
  }

  .weave-sortable-column.sorted {
    background: var(--weave-table-header-cell-sorted-bg, var(--background-modifier-active-hover));
    color: var(--weave-table-header-cell-sorted-fg, var(--text-normal));
  }

  /* 排序禁用状态 */
  .weave-sortable-column.sorting-disabled {
    cursor: wait !important;
    pointer-events: none;
    opacity: 0.6;
    user-select: none;
  }

  /* 焦点样式（键盘导航） */
  .weave-sortable-column:focus {
    outline: 2px solid var(--background-modifier-border-focus);
    outline-offset: -2px;
  }

  /* 列头布局 */
  .weave-column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
  }

  .weave-column-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .weave-sort-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.45;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .weave-sortable-column:hover .weave-sort-icon {
    opacity: 1;
  }

  .weave-sortable-column.sorted .weave-sort-icon {
    opacity: 1;
    transform: translateY(-0.5px);
  }

  /* 复选框列：宽度由 colgroup / columnWidths 控制，勿在此写死 min/max-width */
  .weave-table-header .weave-checkbox-column {
    text-align: center;
    padding: var(--weave-table-cell-padding-y, 6px) 8px;
    text-overflow: clip;
    overflow: visible;
  }
  
  /* 复选框包裹器，与表格行的 DraggableCheckboxWrapper 保持一致 */
  .weave-checkbox-wrapper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* 可调整大小列 */
  .weave-resizable-column {
    position: relative;
  }

  /* 操作列 */
  .weave-actions-column {
    min-width: 100px;
    text-align: center;
    color: var(--weave-table-header-fg, var(--text-muted));
  }

  /* 响应式：移动端优化 */
  @media (max-width: 768px) {
    .weave-table-header th {
      padding: 5px 10px;
      font-size: 0.75rem; /* 12px */
      height: 28px;
    }
    
    .weave-column-header {
      gap: 4px;
    }
  }

  /* 无障碍：高对比度模式 */
  @media (prefers-contrast: high) {
    .weave-table-header {
      border-bottom-width: 2px;
    }
    
    .weave-sortable-column:focus {
      outline-width: 3px;
    }
  }

  /* 无障碍：减少动画 */
  @media (prefers-reduced-motion: reduce) {
    .weave-table-header th,
    .weave-sort-icon {
      transition: none;
    }
  }
</style>
