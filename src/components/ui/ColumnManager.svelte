<script lang="ts">
  import type { ColumnVisibility, ColumnKey, ColumnOrder } from '../tables/types/table-types';
  import EnhancedIcon from './EnhancedIcon.svelte';

  interface Props {
    visibility: ColumnVisibility;
    columnOrder: ColumnOrder;
    onVisibilityChange: (key: ColumnKey, value: boolean) => void;
    onOrderChange: (newOrder: ColumnOrder) => void;
  }

  let { visibility, columnOrder, onVisibilityChange, onOrderChange }: Props = $props();

  const columnLabels: Record<ColumnKey, string> = {
    front: "正面内容",
    back: "背面内容",
    status: "状态",
    deck: "牌组",
    tags: "标签",
    priority: "优先级",
    created: "创建时间",
    actions: "操作",
    uuid: "唯一标识符",
    obsidian_block_link: "Obsidian块链接",
    source_document: "来源文档",
    field_template: "字段模板",
    source_document_status: "来源状态",
  };

  // 拖拽状态
  let draggedIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  function handleDragStart(event: DragEvent, index: number) {
    draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/html', '');
    }
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      draggedIndex = null;
      dragOverIndex = null;
      return;
    }

    const newOrder = [...columnOrder];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, removed);

    onOrderChange(newOrder);
    
    draggedIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
    dragOverIndex = null;
  }
</script>

<div class="column-manager">
  <div class="column-manager-header">
    <span>显示字段</span>
    <span class="drag-hint">拖拽调整顺序</span>
  </div>
  <ul class="column-manager-list">
    {#each columnOrder as key, index}
      <li
        class="column-manager-item"
        class:dragging={draggedIndex === index}
        class:drag-over={dragOverIndex === index}
        draggable="true"
        ondragstart={(e) => handleDragStart(e, index)}
        ondragover={(e) => handleDragOver(e, index)}
        ondragleave={handleDragLeave}
        ondrop={(e) => handleDrop(e, index)}
        ondragend={handleDragEnd}
      >
        <label>
          <input
            type="checkbox"
            checked={visibility[key]}
            onchange={(e) => onVisibilityChange(key, e.currentTarget.checked)}
          />
          <span>{columnLabels[key]}</span>
        </label>
      </li>
    {/each}
  </ul>
</div>

<style>
  .column-manager {
    background: var(--background-secondary);
    border-radius: var(--radius-m);
    padding: 0.5rem;
    min-width: 200px;
  }

  .column-manager-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    padding: 0.25rem 0.5rem;
    margin-bottom: 0.5rem;
  }

  .drag-hint {
    font-size: 0.65rem;
    color: var(--text-faint);
    font-weight: 400;
  }

  .column-manager-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .column-manager-item {
    display: flex;
    align-items: center;
    border-radius: var(--radius-s);
    transition: all 0.2s ease;
    cursor: grab;
    margin-bottom: 2px;
  }

  .column-manager-item:active {
    cursor: grabbing;
  }

  .column-manager-item.dragging {
    opacity: 0.5;
    background: var(--background-modifier-hover);
  }

  .column-manager-item.drag-over {
    border-top: 2px solid var(--color-accent);
    margin-top: 2px;
  }

  .column-manager-item label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    flex: 1;
    border-radius: var(--radius-s);
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .column-manager-item label:hover {
    background: var(--background-modifier-hover);
  }

  .column-manager-item input[type="checkbox"] {
    accent-color: var(--color-accent);
  }
</style>
