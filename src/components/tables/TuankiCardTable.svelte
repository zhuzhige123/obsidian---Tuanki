<script lang="ts">
  import type { Card } from "../../data/types";
  import type { FieldTemplate } from "../../data/template-types";
  import { onMount } from "svelte";
  import TableHeader from "./components/TableHeader.svelte";
  import TableRow from "./components/TableRow.svelte";
  import TableEmptyState from "./components/TableEmptyState.svelte";
  import type { ColumnVisibility, ColumnWidths, ColumnOrder, TableRowCallbacks } from "./types/table-types";

  interface Props {
    cards: Card[];
    selectedCards: Set<string>;
    columnVisibility: ColumnVisibility;
    columnOrder: ColumnOrder;
    onCardSelect: (cardId: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
    onSort: (field: string) => void;
    sortConfig: { field: string; direction: "asc" | "desc" };
    onEdit: (cardId: string) => void;
    onDelete: (cardId: string) => void;
    onTagsUpdate?: (cardId: string, tags: string[]) => void;
    onPriorityUpdate?: (cardId: string, priority: number) => void;
    loading?: boolean;
    fieldTemplates?: FieldTemplate[];
    plugin?: any;
    onTempFileEdit?: (cardId: string) => void;
    decks?: Array<{id: string; name: string}>;
    onView?: (cardId: string) => void;
    availableTags?: string[];
    onJumpToSource?: (card: Card) => void;
  }

  let {
    cards,
    selectedCards,
    onCardSelect,
    onSelectAll,
    onSort,
    sortConfig,
    columnVisibility,
    columnOrder,
    onEdit,
    onDelete,
    onTagsUpdate,
    onPriorityUpdate,
    loading = false,
    fieldTemplates = [],
    plugin,
    onTempFileEdit,
    decks = [],
    onView,
    availableTags = [],
    onJumpToSource
  }: Props = $props();

  // 列宽管理
  const COLUMN_WIDTHS_KEY = 'tuanki-table-column-widths';
  const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
    checkbox: 48,
    front: 200,
    back: 200,
    status: 140,
    deck: 150,
    tags: 160,
    priority: 100,
    created: 120,
    actions: 60,
    uuid: 120,
    obsidian_block_link: 150,
    source_document: 180,
    field_template: 160,
    source_document_status: 120,
  };

  let columnWidths = $state<ColumnWidths>({ ...DEFAULT_COLUMN_WIDTHS });
  let tableContainer = $state<HTMLDivElement>();
  let topScrollbar = $state<HTMLDivElement>();
  let bottomScrollbar = $state<HTMLDivElement>();
  let tableElement = $state<HTMLTableElement>();
  let scrollbarContent = $state<HTMLDivElement>();

  // 同步滚动条
  function syncScrollbars(source: 'top' | 'bottom') {
    if (source === 'top' && topScrollbar && bottomScrollbar) {
      bottomScrollbar.scrollLeft = topScrollbar.scrollLeft;
    } else if (source === 'bottom' && topScrollbar && bottomScrollbar) {
      topScrollbar.scrollLeft = bottomScrollbar.scrollLeft;
    }
  }

  // 更新滚动条宽度
  function updateScrollbarWidth() {
    if (tableElement && scrollbarContent) {
      // 使用setTimeout确保DOM已更新
      setTimeout(() => {
        if (tableElement && scrollbarContent) {
          const tableWidth = tableElement.scrollWidth;
          scrollbarContent.style.width = `${tableWidth}px`;
        }
      }, 0);
    }
  }

  // 监听表格宽度变化
  $effect(() => {
    // 当列宽、列顺序或列可见性变化时，更新滚动条
    if (columnWidths && columnOrder && columnVisibility) {
      updateScrollbarWidth();
    }
  });

  // 监听cards变化
  $effect(() => {
    if (cards) {
      updateScrollbarWidth();
    }
  });

  // 加载保存的列宽设置
  function loadColumnWidths() {
    try {
      const saved = localStorage.getItem(COLUMN_WIDTHS_KEY);
      if (saved) {
        const parsedWidths = JSON.parse(saved);
        columnWidths = { ...DEFAULT_COLUMN_WIDTHS, ...parsedWidths };
      }
    } catch (error) {
      console.warn('Failed to load column widths:', error);
    }
  }

  // 保存列宽设置
  function saveColumnWidths() {
    try {
      localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
    } catch (error) {
      console.warn('Failed to save column widths:', error);
    }
  }

  // 处理列宽调整
  function handleColumnResize(columnKey: string, deltaX: number) {
    const currentWidth = columnWidths[columnKey as keyof ColumnWidths];
    const newWidth = Math.max(50, currentWidth + deltaX);

    columnWidths = {
      ...columnWidths,
      [columnKey]: newWidth
    };
    
    saveColumnWidths();
  }

  // 重置列宽到默认值
  function resetColumnWidths() {
    columnWidths = { ...DEFAULT_COLUMN_WIDTHS };
    saveColumnWidths();
  }

  // 组件挂载时加载保存的列宽
  onMount(() => {
    loadColumnWidths();

    // 监听重置列宽事件
    const handleResetColumnWidths = () => {
      resetColumnWidths();
    };

    if (tableContainer) {
      tableContainer.addEventListener('resetColumnWidths', handleResetColumnWidths);
    }

    // 使用ResizeObserver监听表格大小变化
    let resizeObserver: ResizeObserver | null = null;
    if (tableElement) {
      resizeObserver = new ResizeObserver(() => {
        updateScrollbarWidth();
      });
      resizeObserver.observe(tableElement);
    }

    // 清理事件监听器
    return () => {
      if (tableContainer) {
        tableContainer.removeEventListener('resetColumnWidths', handleResetColumnWidths);
      }
      if (resizeObserver && tableElement) {
        resizeObserver.unobserve(tableElement);
        resizeObserver.disconnect();
      }
    };
  });

  // 构建回调函数对象
  const callbacks: TableRowCallbacks = {
    onEdit,
    onDelete,
    onTagsUpdate,
    onPriorityUpdate,
    onTempFileEdit,
    onView,
    onJumpToSource
  };
</script>

<div class="tuanki-table-wrapper">
  {#if !loading && Array.isArray(cards) && cards.length > 0}
    <!-- 顶部横向滚动条 -->
    <div 
      class="tuanki-table-top-scrollbar" 
      bind:this={topScrollbar}
      onscroll={() => syncScrollbars('top')}
    >
      <div class="tuanki-table-scrollbar-content" bind:this={scrollbarContent}></div>
    </div>
  {/if}

  <!-- 主表格容器 -->
  <div 
    class="tuanki-table-container" 
    bind:this={tableContainer}
    onscroll={() => syncScrollbars('bottom')}
  >
    {#if loading}
      <TableEmptyState loading={true} isEmpty={false} />
    {:else if !Array.isArray(cards) || cards.length === 0}
      <TableEmptyState loading={false} isEmpty={true} />
    {:else}
      <div bind:this={bottomScrollbar} style="overflow-x: auto; overflow-y: hidden;">
        <table class="tuanki-table" bind:this={tableElement}>
          <TableHeader
            {columnVisibility}
            {columnOrder}
            {sortConfig}
            {selectedCards}
            totalCards={cards.length}
            {columnWidths}
            {onSelectAll}
            {onSort}
            onColumnResize={handleColumnResize}
          />
          <tbody class="tuanki-table-body">
              {#each cards as card (card?.id || 'unknown')}
                {#if card && card.id}
            <TableRow
              {card}
              selected={selectedCards.has(card.id)}
              {columnVisibility}
              {columnOrder}
              {callbacks}
              {plugin}
              {decks}
              {fieldTemplates}
              {availableTags}
              onSelect={onCardSelect}
            />
                {/if}
                        {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  .tuanki-table-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--background-primary);
    border-radius: var(--radius-m);
    border: 1px solid var(--background-modifier-border);
  }

  /* 顶部横向滚动条 */
  .tuanki-table-top-scrollbar {
    overflow-x: auto;
    overflow-y: hidden;
    height: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .tuanki-table-scrollbar-content {
    height: 1px;
    min-width: 1200px; /* 最小宽度与表格最小宽度一致 */
  }

  .tuanki-table-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: var(--background-primary);
  }

  .tuanki-table {
    width: 100%;
    min-width: 1200px;
    border-collapse: separate;
    border-spacing: 0;
    position: relative;
    table-layout: fixed;
  }

  .tuanki-table-body {
    position: relative;
  }

  /* 全局拖拽状态 */
  :global(body.resizing-column) {
    cursor: col-resize !important;
    user-select: none !important;
  }

  :global(body.resizing-column *) {
    cursor: col-resize !important;
    user-select: none !important;
  }
</style>
