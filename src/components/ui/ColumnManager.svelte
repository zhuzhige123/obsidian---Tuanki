<script lang="ts">
  import { onMount } from 'svelte';
  import { vaultStorage } from '../../utils/vault-local-storage';
  import type { ColumnVisibility, ColumnKey, ColumnOrder, ColumnGroupType, ColumnGroups } from '../tables/types/table-types';
  import { COLUMN_GROUPS } from '../tables/types/table-types';

  interface Props {
    visibility: ColumnVisibility;
    columnOrder: ColumnOrder;
    columnGroups?: ColumnGroups;
    onVisibilityChange: (key: ColumnKey, value: boolean) => void;
    onOrderChange: (newOrder: ColumnOrder) => void;
    quickPresets?: Array<{
      id: string;
      label: string;
      description: string;
    }>;
    activePresetId?: string | null;
    onApplyPreset?: (presetId: string) => void;
    onResetToDefaults?: () => void;
  }

  let {
    visibility,
    columnOrder,
    columnGroups = COLUMN_GROUPS,
    onVisibilityChange,
    onOrderChange,
    quickPresets = [],
    activePresetId = null,
    onApplyPreset = () => {},
    onResetToDefaults = () => {},
  }: Props = $props();

  const columnLabels: Record<ColumnKey, string> = {
    front: "正面内容",
    back: "背面内容",
    status: "状态",
    deck: "牌组",
    tags: "标签",
    priority: "优先级",
    created: "创建时间",
    modified: "修改时间",
    next_review: "下次复习",
    retention: "记忆率",
    interval: "间隔",
    difficulty: "难度",
    review_count: "复习次数",
    actions: "操作",
    uuid: "唯一标识符",
    obsidian_block_link: "Obsidian块链接",
    source_document: "来源文档",
    field_template: "字段模板",
    source_document_status: "来源状态",
    // 题库专用列
    question_type: "题型",
    accuracy: "正确率",
    test_attempts: "测试次数",
    last_test: "最后测试",
    error_level: "错题等级",
    // 增量阅读专用列
    ir_title: "标题",
    ir_source_file: "源文档",
    ir_state: "阅读状态",
    ir_priority: "优先级",
    ir_tags: "标签",
    ir_next_review: "下次复习",
    ir_review_count: "复习次数",
    ir_reading_time: "阅读时长",
    ir_notes: "关联笔记",
    ir_extract_cards: "摘录卡",
    ir_memory_cards: "记忆卡",
    ir_source_kind: "来源类型",
    ir_source_subunit: "目录书签",
    ir_tag_group: "标签组",
    ir_created: "创建时间",
    ir_decks: "专题",
  };

  // 高级选项展开状态
  const ADVANCED_EXPANDED_KEY = 'weave-column-manager-advanced-expanded';
  let showAdvanced = $state(false);

  // 拖拽状态（扩展为包含分组信息）
  let draggedKey = $state<ColumnKey | null>(null);
  let draggedGroup = $state<ColumnGroupType | null>(null);
  let dragOverKey = $state<ColumnKey | null>(null);

  // 过滤出各分组的字段（添加防御性检查）
  const safeColumnOrder = $derived(columnOrder || []);
  
  const basicColumns = $derived(
    safeColumnOrder.filter(key => 
      columnGroups.basic?.includes(key) && !columnGroups.advanced?.includes(key)
    )
  );

  const reviewColumns = $derived(
    safeColumnOrder.filter(key => 
      columnGroups.review?.includes(key) && 
      !columnGroups.basic?.includes(key) &&
      !columnGroups.advanced?.includes(key)
    )
  );

  const advancedColumns = $derived(
    safeColumnOrder.filter(key => columnGroups.advanced?.includes(key))
  );

  const basicSelectedCount = $derived(basicColumns.filter((key) => visibility[key]).length);
  const reviewSelectedCount = $derived(reviewColumns.filter((key) => visibility[key]).length);
  const advancedSelectedCount = $derived(advancedColumns.filter((key) => visibility[key]).length);
  const totalSelectedCount = $derived(
    (Object.keys(visibility) as ColumnKey[]).filter((key) => visibility[key]).length
  );

  /**
   * 恢复高级选项展开状态
   */
  onMount(() => {
    const saved = vaultStorage.getItem(ADVANCED_EXPANDED_KEY);
    if (saved !== null) {
      showAdvanced = saved === 'true';
    }
  });

  /**
   * 切换高级选项展开状态
   */
  function toggleAdvanced() {
    showAdvanced = !showAdvanced;
    vaultStorage.setItem(ADVANCED_EXPANDED_KEY, String(showAdvanced));
  }

  function toggleVisibility(key: ColumnKey) {
    onVisibilityChange(key, !visibility[key]);
  }

  /**
   * 判断字段属于哪个分组
   */
  function getColumnGroup(key: ColumnKey): ColumnGroupType {
    if (columnGroups.advanced.includes(key)) return 'advanced';
    if (columnGroups.review.includes(key) && !columnGroups.basic.includes(key)) {
      return 'review';
    }
    return 'basic';
  }

  /**
   * 判断是否为通用字段
   */
  function isSharedColumn(key: ColumnKey): boolean {
    return columnGroups.shared.includes(key);
  }

  /**
   * 开始拖拽
   */
  function handleDragStart(event: DragEvent, key: ColumnKey, group: ColumnGroupType) {
    draggedKey = key;
    draggedGroup = group;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/html', '');
    }
  }

  /**
   * 拖拽经过
   */
  function handleDragOver(event: DragEvent, key: ColumnKey, group: ColumnGroupType) {
    event.preventDefault();
    
    // 只允许在同一分组内拖拽
    if (draggedGroup !== group) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
      return;
    }
    
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    dragOverKey = key;
  }

  /**
   * 拖拽离开
   */
  function handleDragLeave() {
    dragOverKey = null;
  }

  /**
   * 放置拖拽项
   */
  function handleDrop(event: DragEvent, dropKey: ColumnKey, dropGroup: ColumnGroupType) {
    event.preventDefault();
    
    // 验证：必须在同一分组内
    if (!draggedKey || draggedGroup !== dropGroup || draggedKey === dropKey) {
      draggedKey = null;
      draggedGroup = null;
      dragOverKey = null;
      return;
    }

    // 在columnOrder中找到两个key的索引
    const draggedIndex = columnOrder.indexOf(draggedKey);
    const dropIndex = columnOrder.indexOf(dropKey);

    if (draggedIndex === -1 || dropIndex === -1) {
      draggedKey = null;
      draggedGroup = null;
      dragOverKey = null;
      return;
    }

    // 重新排序
    const newOrder = [...columnOrder];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, removed);

    onOrderChange(newOrder);
    
    // 重置拖拽状态
    draggedKey = null;
    draggedGroup = null;
    dragOverKey = null;
  }

  /**
   * 结束拖拽
   */
  function handleDragEnd() {
    draggedKey = null;
    draggedGroup = null;
    dragOverKey = null;
  }
</script>

<div class="column-manager">
  <!-- 头部 -->
  <div class="column-manager-header">
    <span class="column-count-chip summary">已选 {totalSelectedCount}</span>
    <button type="button" class="column-reset-btn" onclick={onResetToDefaults}>
      恢复默认
    </button>
  </div>

  {#if quickPresets.length > 0}
    <div class="preset-toolbar">
      {#each quickPresets as preset}
        <button
          type="button"
          class="preset-chip"
          class:is-active={activePresetId === preset.id}
          title={preset.description}
          onclick={() => onApplyPreset(preset.id)}
        >
          {preset.label}
        </button>
      {/each}
    </div>
  {/if}

  <!-- 两列布局 -->
  <div class="column-manager-grid">
    <!-- 左列：基础信息 -->
    <div class="column-group">
      <div class="column-group-header">
        <span>基础信息</span>
        <span class="column-count-chip">{basicSelectedCount}/{basicColumns.length}</span>
      </div>
      <ul class="column-group-list">
        {#each basicColumns as key}
          <li
            class="column-manager-item"
            class:dragging={draggedKey === key}
            class:drag-over={dragOverKey === key}
            draggable="true"
            ondragstart={(e) => handleDragStart(e, key, 'basic')}
            ondragover={(e) => handleDragOver(e, key, 'basic')}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, key, 'basic')}
            ondragend={handleDragEnd}
          >
            <label class="column-toggle-row">
              <span class="column-label">
                {columnLabels[key]}
                {#if isSharedColumn(key)}
                  <span class="shared-badge">[通用]</span>
                {/if}
              </span>
              <span class="column-toggle-switch">
                <input
                  class="column-toggle-input"
                  type="checkbox"
                  checked={visibility[key]}
                  onchange={() => toggleVisibility(key)}
                  aria-label={columnLabels[key]}
                />
                <span
                  class="column-toggle-track"
                  class:is-enabled={visibility[key]}
                  aria-hidden="true"
                ></span>
              </span>
            </label>
          </li>
        {/each}
      </ul>
    </div>

    <!-- 右列：复习数据 -->
    <div class="column-group">
      <div class="column-group-header">
        <span>复习数据</span>
        <span class="column-count-chip">{reviewSelectedCount}/{reviewColumns.length}</span>
      </div>
      <ul class="column-group-list">
        {#each reviewColumns as key}
          <li
            class="column-manager-item"
            class:dragging={draggedKey === key}
            class:drag-over={dragOverKey === key}
            draggable="true"
            ondragstart={(e) => handleDragStart(e, key, 'review')}
            ondragover={(e) => handleDragOver(e, key, 'review')}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, key, 'review')}
            ondragend={handleDragEnd}
          >
            <label class="column-toggle-row">
              <span class="column-label">{columnLabels[key]}</span>
              <span class="column-toggle-switch">
                <input
                  class="column-toggle-input"
                  type="checkbox"
                  checked={visibility[key]}
                  onchange={() => toggleVisibility(key)}
                  aria-label={columnLabels[key]}
                />
                <span
                  class="column-toggle-track"
                  class:is-enabled={visibility[key]}
                  aria-hidden="true"
                ></span>
              </span>
            </label>
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <!-- 高级选项（可折叠） -->
  <div class="advanced-section" class:expanded={showAdvanced}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="advanced-section-header" onclick={toggleAdvanced}>
      <div class="advanced-section-title">
        <span>高级选项</span>
        <span class="column-count-chip">{advancedSelectedCount}/{advancedColumns.length}</span>
      </div>
      <span class="toggle-icon">{showAdvanced ? '▲' : '▼'}</span>
    </div>
    {#if showAdvanced}
      <ul class="advanced-section-list">
        {#each advancedColumns as key}
          <li
            class="column-manager-item"
            class:dragging={draggedKey === key}
            class:drag-over={dragOverKey === key}
            draggable="true"
            ondragstart={(e) => handleDragStart(e, key, 'advanced')}
            ondragover={(e) => handleDragOver(e, key, 'advanced')}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, key, 'advanced')}
            ondragend={handleDragEnd}
          >
            <label class="column-toggle-row">
              <span class="column-label">{columnLabels[key]}</span>
              <span class="column-toggle-switch">
                <input
                  class="column-toggle-input"
                  type="checkbox"
                  checked={visibility[key]}
                  onchange={() => toggleVisibility(key)}
                  aria-label={columnLabels[key]}
                />
                <span
                  class="column-toggle-track"
                  class:is-enabled={visibility[key]}
                  aria-hidden="true"
                ></span>
              </span>
            </label>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .column-manager {
    background: transparent;
    border-radius: 0;
    padding: 0;
    min-width: min(560px, 100%);
    max-width: 100%;
  }

  /* 头部 */
  .column-manager-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 0.75rem;
    padding-right: 40px;
  }

  .column-count-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 42px;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .column-count-chip.summary {
    background: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-primary));
    border-color: color-mix(in srgb, var(--interactive-accent) 24%, var(--background-modifier-border));
    color: var(--text-normal);
  }

  .column-reset-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    padding: 0.35rem 0.75rem;
    background: var(--interactive-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--button-radius, 8px);
    color: var(--text-normal);
    font-size: 0.76rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .column-reset-btn:hover {
    background: var(--interactive-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .preset-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 1rem;
  }

  .preset-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    padding: 0.35rem 0.8rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    color: var(--text-muted);
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .preset-chip:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border-color: var(--background-modifier-border-hover);
  }

  .preset-chip.is-active {
    background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-primary));
    border-color: color-mix(in srgb, var(--interactive-accent) 34%, var(--background-modifier-border));
    color: var(--text-normal);
  }

  /* 两列网格布局 */
  .column-manager-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 0.75rem;
  }

  /* 列分组 */
  .column-group {
    display: flex;
    flex-direction: column;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
  }

  .column-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
    padding: 0.45rem 0 0.45rem;
    border-bottom: none;
    margin-bottom: 0.35rem;
  }

  .column-group-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* 列表项 */
  .column-manager-item {
    display: flex;
    align-items: center;
    border-radius: 0;
    transition: background-color 0.2s ease, opacity 0.2s ease;
    cursor: grab;
    margin-bottom: 0;
    border: none;
    box-shadow: none;
    background: transparent;
  }

  .column-manager-item:active {
    cursor: grabbing;
  }

  .column-manager-item.dragging {
    opacity: 0.5;
    background: var(--background-modifier-hover);
  }

  .column-manager-item.drag-over {
    outline: 1px solid var(--interactive-accent);
    outline-offset: -1px;
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
  }

  .column-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.7rem 0;
    width: 100%;
    border-radius: 0;
    cursor: pointer;
    margin: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 1.35;
    text-align: left;
    transition: background-color 0.2s ease;
    box-shadow: none;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
  }

  .column-toggle-row:hover {
    background: var(--background-modifier-hover);
  }

  .column-toggle-switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 22px;
    flex-shrink: 0;
  }

  .column-toggle-input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .column-toggle-input:focus-visible + .column-toggle-track {
    outline: 2px solid color-mix(in srgb, var(--interactive-accent) 42%, transparent);
    outline-offset: 2px;
  }

  .column-toggle-track {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    width: 36px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 999px;
    background: var(--background-modifier-border);
    transition: background-color 0.15s ease;
  }

  .column-toggle-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--background-primary);
    box-shadow: none;
    transition: transform 0.15s ease;
  }

  .column-toggle-track.is-enabled {
    background: var(--interactive-accent);
  }

  .column-toggle-track.is-enabled::after {
    transform: translateX(14px);
  }

  /* 字段标签 */
  .column-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
    min-height: 22px;
  }

  /* 通用字段标签 */
  .shared-badge {
    font-size: 0.65rem;
    color: var(--text-faint);
    font-weight: 400;
    opacity: 0.7;
    margin-left: 0.25rem;
  }

  /* 高级选项区域 */
  .advanced-section {
    border-top: none;
    background: transparent;
    border-radius: 0;
    margin-top: 0.75rem;
    overflow: visible;
  }

  .advanced-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
    transition: background-color 0.2s ease;
    user-select: none;
  }

  .advanced-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .advanced-section-header:hover {
    background: var(--background-modifier-hover);
  }

  .toggle-icon {
    font-size: 0.7rem;
    color: var(--text-faint);
    transition: transform 0.2s ease;
  }

  .advanced-section-list {
    list-style: none;
    margin: 0;
    padding: 0.2rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* 响应式：小屏幕单列布局 */
  @media (max-width: 500px) {
    .column-manager {
      min-width: unset;
      width: 100%;
      max-width: 100%;
    }

    .column-manager-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    
    .column-manager-header {
      flex-direction: column;
      align-items: stretch;
      padding-right: 0;
    }
    
    .column-group-header {
      padding: 0.75rem 0 0.5rem;
    }
    
    .column-toggle-row {
      padding: 0.75rem 0;
    }
  }
</style>
