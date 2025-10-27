<script lang="ts">
  import EnhancedIcon from "../../ui/EnhancedIcon.svelte";
  import ColumnResizer from "./ColumnResizer.svelte";
  import TableCheckbox from "./TableCheckbox.svelte";
  import { getSortIcon, isAllSelected, isIndeterminate } from "../utils/table-utils";
  import { getColumnLabel, isSortableColumn } from "../utils/column-config";
  import type { TableHeaderProps, ColumnKey } from "../types/table-types";

  let { 
    columnVisibility, 
    columnOrder,
    sortConfig, 
    selectedCards, 
    totalCards, 
    columnWidths,
    onSelectAll, 
    onSort,
    onColumnResize
  }: TableHeaderProps = $props();

  const allSelected = $derived(isAllSelected(selectedCards.size, totalCards));
  const indeterminate = $derived(isIndeterminate(selectedCards.size, totalCards));
</script>

<thead class="tuanki-table-header">
  <tr>
    <!-- 复选框列（固定） -->
    <th class="tuanki-checkbox-column tuanki-resizable-column" style="width: {columnWidths.checkbox}px;">
      <TableCheckbox
        checked={allSelected}
        indeterminate={indeterminate}
        onchange={onSelectAll}
        ariaLabel="全选"
      />
      <ColumnResizer columnKey="checkbox" onResize={onColumnResize} />
    </th>

    <!-- 动态列 -->
    {#each columnOrder as columnKey (columnKey)}
      {#if columnVisibility[columnKey]}
        {#if columnKey === 'actions'}
          <!-- 操作列（特殊处理） -->
          <th class="tuanki-actions-column tuanki-resizable-column" style="width: {columnWidths[columnKey]}px;">
            {getColumnLabel(columnKey)}
            <ColumnResizer {columnKey} onResize={onColumnResize} />
          </th>
        {:else if isSortableColumn(columnKey)}
          <!-- 可排序列 -->
          <th 
            class="tuanki-sortable-column tuanki-resizable-column" 
            style="width: {columnWidths[columnKey]}px;" 
            onclick={() => onSort(columnKey)}
          >
            <div class="tuanki-column-header">
              <span>{getColumnLabel(columnKey)}</span>
              <EnhancedIcon name={getSortIcon(columnKey, sortConfig.field, sortConfig.direction)} size={12} />
            </div>
            <ColumnResizer {columnKey} onResize={onColumnResize} />
          </th>
        {:else}
          <!-- 普通列 -->
          <th class="tuanki-resizable-column" style="width: {columnWidths[columnKey]}px;">
            {getColumnLabel(columnKey)}
            <ColumnResizer {columnKey} onResize={onColumnResize} />
          </th>
        {/if}
      {/if}
    {/each}
  </tr>
</thead>

<style>
  .tuanki-table-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: linear-gradient(135deg, var(--background-secondary) 0%, var(--background-primary) 100%);
    border-bottom: 2px solid var(--background-modifier-border);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  .tuanki-table-header th {
    padding: 12px 16px;
    text-align: left;
    font-weight: 600;
    color: var(--text-normal);
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-right: 1px solid var(--background-modifier-border);
    height: 52px;
    vertical-align: middle;
  }

  .tuanki-sortable-column {
    cursor: pointer;
    transition: background-color 0.2s ease;
    user-select: none;
  }

  .tuanki-sortable-column:hover {
    background: var(--background-modifier-hover);
  }

  .tuanki-column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .tuanki-checkbox-column {
    width: 48px;
    min-width: 48px;
    max-width: 48px;
  }

  .tuanki-resizable-column {
    position: relative;
  }

  .tuanki-actions-column {
    min-width: 100px;
  }
</style>


