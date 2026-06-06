<script lang="ts">
  import { logger } from '../../utils/logger';
  import { vaultStorage } from '../../utils/vault-local-storage';

  import type { Card } from '../../data/types';
  // FieldTemplate类型已废弃，现使用动态解析，不再需要预定义模板
  import { onMount } from "svelte";
  import TableHeader from "./components/TableHeader.svelte";
  import TableRow from './components/TableRow.svelte';
  import type { ColumnVisibility, ColumnWidths, ColumnOrder, TableRowCallbacks, TableViewMode, ColumnKey, TableTagOption } from "./types/table-types";
  import { validateTableIcons } from "../../utils/icon-validator";
  import { getMinColumnWidth } from "./utils/table-utils";

  interface Props {
    cards: Card[];
    selectedCards: Set<string>;
    columnVisibility: ColumnVisibility;
    columnOrder: ColumnOrder;
    tableViewMode?: TableViewMode;
    onCardSelect: (cardId: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
    onSort: (field: string) => void;
    sortConfig: { field: string; direction: "asc" | "desc" };
    onEdit: (cardId: string) => void;
    onDelete: (cardId: string) => void;
    onResetReviewHistory?: (cardId: string) => void;
    onTagsUpdate?: (cardId: string, tags: string[]) => void;
    onPriorityUpdate?: (cardId: string, priority: number) => void;
    loading?: boolean;
    isSorting?: boolean;
    fieldTemplates?: any[]; // 保持兼容性，但已不使用预定义模板
    plugin?: any;
    onTempFileEdit?: (cardId: string) => void;
    decks?: Array<{id: string; name: string}>;
    onView?: (cardId: string) => void;
    availableTags?: TableTagOption[];
    onJumpToSource?: (card: Card) => void;
    onIRAssociatedNotesManage?: (event: MouseEvent, card: Card) => void;
    isVisible?: boolean; // 🔧 性能优化：组件可见性
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
    tableViewMode = 'basic',
    onEdit,
    onDelete,
    onResetReviewHistory,
    onTagsUpdate,
    onPriorityUpdate,
    loading = false,
    isSorting = false,
    fieldTemplates = [],
    plugin,
    onTempFileEdit,
    decks = [],
    onView,
    availableTags = [],
    onJumpToSource,
    onIRAssociatedNotesManage,
    isVisible = true
  }: Props = $props();

  // 🔧 修复reconciliation错误：过滤掉无效的卡片
  // 确保所有卡片都有有效的uuid，避免重复的'unknown' key
  let validCards = $derived(
    Array.isArray(cards) 
      ? cards.filter(card => card && card.uuid) 
      : []
  );

  let selectionOrderByCardId = $derived.by(() => {
    const orderMap = new Map<string, number>();
    let order = 1;

    for (const card of validCards) {
      if (selectedCards.has(card.uuid)) {
        orderMap.set(card.uuid, order);
        order += 1;
      }
    }

    return orderMap;
  });

  // 列宽管理
  const COLUMN_WIDTHS_KEY = 'weave-table-column-widths';
  const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
    checkbox: 40,
    front: 250,
    back: 230,
    status: 126,
    deck: 168,
    tags: 190,
    priority: 82,
    created: 120,
    modified: 120,
    next_review: 130,
    retention: 100,
    interval: 90,
    difficulty: 90,
    review_count: 100,
    actions: 60,
    uuid: 120,
    obsidian_block_link: 150,
    source_document: 196,
    field_template: 148,
    source_document_status: 118,
    // 题库专用列宽度
    question_type: 108,
    accuracy: 92,
    test_attempts: 92,
    last_test: 118,
    error_level: 100,
    // 增量阅读专用列宽度
    ir_title: 250,
    ir_source_file: 180,
    ir_state: 100,
    ir_priority: 80,
    ir_tags: 150,
    ir_next_review: 130,
    ir_review_count: 90,
    ir_reading_time: 100,
    ir_notes: 88,
    ir_extract_cards: 88,
    ir_memory_cards: 88,
    ir_source_kind: 96,
    ir_source_subunit: 180,
    ir_tag_group: 120,
    ir_created: 120,
    ir_decks: 180,  // 所属牌组列宽度
  };

  // 表格视图模式列配置
  const TABLE_MODE_COLUMNS: Record<TableViewMode, ColumnKey[]> = {
    basic: [
      'front',
      'back',
      'status',
      'deck',
      'tags',
      'priority',
      'created',
      'modified',
      'source_document',
    ],
    review: [
      'front',
      'back',
      'status',
      'next_review',
      'retention',
      'interval',
      'difficulty',
      'review_count',
    ],
    // 题库考试模式
    questionBank: [
      'front',
      'back',
      'deck',
      'tags',
      'priority',
      'question_type',
      'accuracy',
      'test_attempts',
      'last_test',
      'error_level',
      'created',
    ],
    // 增量阅读内容块模式
    irContent: [
      'ir_title',
      'ir_source_file',
      'ir_source_kind',
      'ir_notes',
      'ir_extract_cards',
      'ir_memory_cards',
      'ir_decks',       // 所属牌组
      'ir_state',
      'ir_priority',
      'ir_tags',
      'ir_tag_group',
      'ir_next_review',
      'ir_review_count',
      'ir_reading_time',
      'ir_source_subunit',
      'ir_created',
    ],
  };

  let columnWidths = $state<ColumnWidths>({ ...DEFAULT_COLUMN_WIDTHS });
  let tableContainer = $state<HTMLElement | null>(null);
  let topScrollbar = $state<HTMLElement | null>(null);
  let bottomScrollbar = $state<HTMLElement | null>(null);
  let tableElement = $state<HTMLElement | null>(null);
  let scrollbarContent = $state<HTMLElement | null>(null);
  let hasHorizontalOverflow = $state(false);
  let tablePixelWidth = $derived.by(() => {
    const checkboxWidth = columnWidths.checkbox ?? DEFAULT_COLUMN_WIDTHS.checkbox;
    const visibleColumnsWidth = effectiveColumns.reduce((total, columnKey) => {
      return total + (columnWidths[columnKey as keyof ColumnWidths] ?? 0);
    }, 0);
    return checkboxWidth + visibleColumnsWidth;
  });

  // 根据模式和用户设置计算实际显示的列
  let effectiveColumns = $derived.by(() => {
    const modeColumns = TABLE_MODE_COLUMNS[tableViewMode];
    
    // 如果没有 modeColumns，则使用默认列
    if (!modeColumns || modeColumns.length === 0) {
      logger.warn('[WeaveCardTable] 未找到模式列配置:', tableViewMode);
      return ['front', 'back', 'status', 'actions'] as ColumnKey[];
    }
    
    // 定义每个模式下应该强制显示的列（忽略 columnVisibility）
    const forceShowColumns: Record<TableViewMode, ColumnKey[]> = {
      basic: [] as ColumnKey[],
      review: ['modified', 'next_review', 'retention', 'interval', 'difficulty', 'review_count'] as ColumnKey[],
      questionBank: ['question_type', 'accuracy', 'test_attempts', 'last_test', 'error_level'] as ColumnKey[],
      irContent: ['ir_title', 'ir_source_file', 'ir_state', 'ir_priority'] as ColumnKey[],
    };
    
    const forcedCols = forceShowColumns[tableViewMode];
    
    // 过滤出当前模式下可见的列
    // 规则：
    // 1. actions 列总是显示
    // 2. 模式列表中的列 + 强制显示的列（在复习模式下）
    // 3. 其他列根据 columnVisibility 决定
    // 🔧 防御性检查：确保columnOrder存在
    if (!columnOrder || !Array.isArray(columnOrder)) {
      return ['front', 'back', 'status', 'actions'] as ColumnKey[];
    }
    
    const filteredColumns = columnOrder.filter(key => {
      // actions 列总是显示
      if (key === 'actions') return true;
      
      // 不在当前模式的列表中，过滤掉
      if (!modeColumns || !modeColumns.includes(key)) return false;
      
      // 在强制显示列表中，显示（复习模式的FSRS列）
      if (forcedCols && forcedCols.includes(key)) return true;
      
      // 其他列根据 columnVisibility 决定
      return columnVisibility[key] !== false;
    });

    if (tableViewMode === 'irContent') {
      logger.debug('[WeaveCardTable] IR模式列:', filteredColumns);
    }

    return filteredColumns;
  });

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
    if (!tableElement || !scrollbarContent || !bottomScrollbar) {
      hasHorizontalOverflow = false;
      return;
    }

    // 使用setTimeout确保DOM已更新
    setTimeout(() => {
      if (!tableElement || !scrollbarContent || !bottomScrollbar) {
        hasHorizontalOverflow = false;
        return;
      }

      const tableWidth = tableElement.scrollWidth;
      const viewportWidth = bottomScrollbar.clientWidth;
      const overflow = tableWidth > viewportWidth + 1;

      scrollbarContent.style.width = `${tableWidth}px`;
      hasHorizontalOverflow = overflow;

      if (!overflow) {
        if (topScrollbar) {
          topScrollbar.scrollLeft = 0;
        }
        bottomScrollbar.scrollLeft = 0;
      }
    }, 0);
  }

  // 监听表格宽度变化 - 添加防抖优化
  let updateScrollbarTimer: number | null = null;
  let resizeDebounceTimer: number | null = null;
  
  $effect(() => {
    // 当列宽、列顺序、列可见性或模式变化时，更新滚动条
    if (columnWidths && effectiveColumns && columnVisibility && tableViewMode) {
      // 防抖：避免频繁的 DOM 操作
      if (updateScrollbarTimer !== null) {
        clearTimeout(updateScrollbarTimer);
      }
      updateScrollbarTimer = window.setTimeout(() => {
        updateScrollbarWidth();
        updateScrollbarTimer = null;
      }, 50); // 50ms 防抖
    }
  });

  // 监听cards变化 - 添加防抖优化
  let cardsUpdateTimer: number | null = null;
  
  $effect(() => {
    if (cards) {
      // 防抖：避免频繁的 DOM 操作
      if (cardsUpdateTimer !== null) {
        clearTimeout(cardsUpdateTimer);
      }
      cardsUpdateTimer = window.setTimeout(() => {
        updateScrollbarWidth();
        cardsUpdateTimer = null;
      }, 100); // 100ms 防抖
    }
  });

  $effect(() => {
    if (!tableElement && !bottomScrollbar) {
      hasHorizontalOverflow = false;
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (resizeDebounceTimer !== null) {
        clearTimeout(resizeDebounceTimer);
      }
      resizeDebounceTimer = window.setTimeout(() => {
        updateScrollbarWidth();
        resizeDebounceTimer = null;
      }, 100);
    });

    if (tableElement) {
      resizeObserver.observe(tableElement);
    }
    if (bottomScrollbar) {
      resizeObserver.observe(bottomScrollbar);
    }

    updateScrollbarWidth();

    return () => {
      if (resizeDebounceTimer !== null) {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = null;
      }
      resizeObserver.disconnect();
    };
  });

  // 加载保存的列宽设置
  function loadColumnWidths() {
    try {
      const saved = vaultStorage.getItem(COLUMN_WIDTHS_KEY);
      if (saved) {
        const parsedWidths = JSON.parse(saved);
        columnWidths = { ...DEFAULT_COLUMN_WIDTHS, ...parsedWidths };
      }
    } catch (error) {
      logger.warn('Failed to load column widths:', error);
    }
  }

  // 保存列宽设置
  function saveColumnWidths() {
    try {
      vaultStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
    } catch (error) {
      logger.warn('Failed to save column widths:', error);
    }
  }

  // 处理列宽调整
  function handleColumnResize(columnKey: string, deltaX: number) {
    const currentWidth = columnWidths[columnKey as keyof ColumnWidths] ?? DEFAULT_COLUMN_WIDTHS[columnKey as keyof ColumnWidths] ?? 50;
    const newWidth = Math.max(getMinColumnWidth(columnKey), currentWidth + deltaX);

    columnWidths = {
      ...columnWidths,
      [columnKey]: newWidth
    };
    
    saveColumnWidths();
  }

  function resetColumnWidths() {
    columnWidths = { ...DEFAULT_COLUMN_WIDTHS };
    saveColumnWidths();
  }

  // 组件挂载时加载保存的列宽
  onMount(() => {
    // 验证表格所需图标
    const iconValidation = validateTableIcons();
    if (!iconValidation.valid) {
      logger.warn('[Weave Table] 部分图标缺失，可能影响显示效果', iconValidation.missingIcons);
    }

    loadColumnWidths();

    // 监听重置列宽事件
    const handleResetColumnWidths = () => {
      resetColumnWidths();
    };

    if (tableContainer) {
      tableContainer.addEventListener('resetColumnWidths', handleResetColumnWidths);
    }

    // 清理事件监听器
    return () => {
      if (tableContainer) {
        tableContainer.removeEventListener('resetColumnWidths', handleResetColumnWidths);
      }
      if (resizeDebounceTimer !== null) {
        clearTimeout(resizeDebounceTimer);
      }
      // 清理定时器
      if (updateScrollbarTimer !== null) {
        clearTimeout(updateScrollbarTimer);
      }
      if (cardsUpdateTimer !== null) {
        clearTimeout(cardsUpdateTimer);
      }
      if (resizeDebounceTimer !== null) {
        clearTimeout(resizeDebounceTimer);
      }
    };
  });

  // 拖拽批量选择状态
  let isDragSelectMode = $state(false);
  let dragSelectStartCard = $state<string | null>(null);
  
  // 拖拽批量选择开始
  function handleDragSelectStart(cardId: string) {
    isDragSelectMode = true;
    dragSelectStartCard = cardId;
    // 开始拖拽批量选择
    
    // 阻止页面滚动
    activeDocument.body.style.overflow = 'hidden';
    
    // 监听全局鼠标释放事件
    activeDocument.addEventListener('mouseup', handleGlobalMouseUp);
  }
  
  // 拖拽批量选择移动
  function handleDragSelectMove(cardId: string) {
    if (!isDragSelectMode || !dragSelectStartCard) return;
    
    // 获取起始卡片和当前卡片的索引
    const startIndex = cards.findIndex(card => card.uuid === dragSelectStartCard);
    const currentIndex = cards.findIndex(card => card.uuid === cardId);
    
    if (startIndex === -1 || currentIndex === -1) return;
    
    // 确定选择范围
    const minIndex = Math.min(startIndex, currentIndex);
    const maxIndex = Math.max(startIndex, currentIndex);
    
    // 批量选择/取消选择
    const newSelectedCards = new Set(selectedCards);
    const startCardSelected = selectedCards.has(dragSelectStartCard);
    
    for (let i = minIndex; i <= maxIndex; i++) {
      const card = cards[i];
      if (card && card.uuid) {
        if (startCardSelected) {
          newSelectedCards.add(card.uuid);
        } else {
          newSelectedCards.delete(card.uuid);
        }
      }
    }
    
    // 触发选择状态变化
    for (const cardId of newSelectedCards) {
      if (!selectedCards.has(cardId)) {
        onCardSelect(cardId, true);
      }
    }
    
    for (const cardId of selectedCards) {
      if (!newSelectedCards.has(cardId)) {
        onCardSelect(cardId, false);
      }
    }
    
    // 拖拽批量选择范围操作完成
  }
  
  // 全局鼠标释放事件
  function handleGlobalMouseUp() {
    if (isDragSelectMode) {
      isDragSelectMode = false;
      dragSelectStartCard = null;
      
      // 恢复页面滚动
      activeDocument.body.style.overflow = '';
      
      // 移除全局事件监听
      activeDocument.removeEventListener('mouseup', handleGlobalMouseUp);
      
      // 退出拖拽批量选择模式
    }
  }

  // 构建回调函数对象
  let callbacks: TableRowCallbacks = $derived.by(() => ({
    onEdit: (cardId) => onEdit(cardId),
    onDelete: (cardId) => onDelete(cardId),
    onResetReviewHistory: onResetReviewHistory
      ? (cardId) => onResetReviewHistory(cardId)
      : undefined,
    onTagsUpdate: onTagsUpdate
      ? (cardId, tags) => onTagsUpdate(cardId, tags)
      : undefined,
    onPriorityUpdate: onPriorityUpdate
      ? (cardId, priority) => onPriorityUpdate(cardId, priority)
      : undefined,
    onTempFileEdit: onTempFileEdit
      ? (cardId) => onTempFileEdit(cardId)
      : undefined,
    onView: onView
      ? (cardId) => onView(cardId)
      : undefined,
    onJumpToSource: onJumpToSource
      ? (card) => onJumpToSource(card)
      : undefined,
    onIRAssociatedNotesManage: onIRAssociatedNotesManage
      ? (event, card) => onIRAssociatedNotesManage(event, card)
      : undefined
  }));

  // 🔧 性能优化：移除虚拟滚动，使用分页
  // 虚拟滚动与分页冲突，已经通过分页限制了显示数量
  // 分页每页25-50条，不需要额外的虚拟滚动
</script>

<div class="weave-table-wrapper show-grid-borders">
  {#if !loading && Array.isArray(cards) && cards.length > 0}
    <!-- 顶部横向滚动条 -->
    <div 
      class="weave-table-top-scrollbar" 
      hidden={!hasHorizontalOverflow}
      bind:this={topScrollbar}
      onscroll={() => syncScrollbars('top')}
    >
      <div class="weave-table-scrollbar-content" bind:this={scrollbarContent}></div>
    </div>
  {/if}

  <!-- 主表格容器 -->
  <div 
    class="weave-table-container" 
    bind:this={tableContainer}
    onscroll={() => syncScrollbars('bottom')}
  >
    {#if !loading}
      <div bind:this={bottomScrollbar} style="overflow-x: auto; overflow-y: hidden;">
        <table
          class="weave-table"
          bind:this={tableElement}
          style={`min-width:${tablePixelWidth}px;width:max(100%, ${tablePixelWidth}px);table-layout:fixed;`}
        >
          <colgroup>
            <col class="weave-col-checkbox" style="width: {columnWidths.checkbox}px;" />
            {#each effectiveColumns as columnKey (columnKey)}
              <col style="width: {columnWidths[columnKey as keyof ColumnWidths] ?? 0}px;" />
            {/each}
          </colgroup>
          <TableHeader
            {columnVisibility}
            columnOrder={effectiveColumns}
            tableViewMode={tableViewMode}
            {sortConfig}
            {selectedCards}
            totalCards={cards.length}
            {columnWidths}
            {onSelectAll}
            {onSort}
            {isSorting}
            onColumnResize={handleColumnResize}
          />
          <tbody class="weave-table-body">
            {#each validCards as card (card.uuid)}
              <TableRow
                {card}
                selected={selectedCards.has(card.uuid)}
                selectionOrder={selectionOrderByCardId.get(card.uuid) ?? null}
                {columnVisibility}
                columnOrder={effectiveColumns}
                tableViewMode={tableViewMode}
                {callbacks}
                {plugin}
                {decks}
                {fieldTemplates}
                {availableTags}
                onSelect={onCardSelect}
                onDragSelectStart={handleDragSelectStart}
                onDragSelectMove={handleDragSelectMove}
                isDragSelectActive={isDragSelectMode}
                {isVisible}
              />
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  .weave-table-wrapper {
    --weave-table-page-bg: var(--weave-card-management-page-bg, var(--weave-surface-background, var(--weave-surface, var(--background-primary))));
    --weave-table-surface-bg: var(--weave-card-management-surface-bg, var(--weave-elevated-background, var(--weave-surface-secondary, var(--background-secondary))));
    --weave-table-grid-border-color: var(--table-border-color, var(--divider-color, var(--background-modifier-border)));
    --weave-table-grid-strong-border-color: var(--divider-color, var(--background-modifier-border-hover, var(--background-modifier-border)));
    --weave-table-grid-hover-border-color: var(--divider-color, var(--background-modifier-border-hover, var(--background-modifier-border)));
    --weave-table-header-cell-height: 32px;
    --weave-table-header-padding-y: 8px;
    --weave-table-header-padding-x: 16px;
    --weave-table-cell-padding-y: 6px;
    --weave-table-cell-padding-x: 16px;
    --weave-table-pill-height: 20px;
    --weave-table-pill-padding-x: 7px;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--weave-table-page-bg);
    border-radius: var(--radius-m);
    border: 1px solid var(--weave-table-grid-strong-border-color);
  }

  .weave-table-wrapper.show-grid-borders {
    --weave-table-grid-border-color: var(--divider-color, var(--background-modifier-border-hover, var(--background-modifier-border)));
    --weave-table-grid-strong-border-color: var(--divider-color, var(--background-modifier-border-hover, var(--background-modifier-border)));
    --weave-table-grid-hover-border-color: var(--divider-color, var(--background-modifier-border-hover, var(--background-modifier-border)));
    border-color: var(--weave-table-grid-strong-border-color);
    box-shadow: inset 0 0 0 1px var(--weave-table-grid-border-color);
  }

  /* 顶部横向滚动条 */
  .weave-table-top-scrollbar {
    overflow-x: auto;
    overflow-y: hidden;
    height: 12px;
    background: var(--weave-table-page-bg);
    border-bottom: 1px solid var(--weave-table-grid-strong-border-color);
  }

  .weave-table-scrollbar-content {
    height: 1px;
    min-width: 1200px; /* 最小宽度与表格最小宽度一致 */
  }

  .weave-table-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: var(--weave-table-page-bg);
  }


  .weave-table {
    width: 100%;
    min-width: 1200px;
    border-collapse: separate;
    border-spacing: 0;
    position: relative;
    table-layout: fixed;
  }

  .weave-table-body {
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
