<script lang="ts">
  interface DragDropItem { id: string; [key: string]: any; }
  interface Props { items: DragDropItem[]; onReorder?: (items: DragDropItem[]) => void; }
  let { items = [], onReorder }: Props = $props();
</script>

<div class="drag-drop-list">
  {#each items as item}
    <div class="drag-item" draggable="true">
      <slot {item} />
    </div>
  {/each}
</div>

<style>
  .drag-drop-list { display: flex; flex-direction: column; gap: var(--tuanki-spacing-sm); }
  .drag-item { padding: var(--tuanki-spacing-md); background: var(--tuanki-surface); border: 1px solid var(--tuanki-border); border-radius: var(--tuanki-radius-md); cursor: move; }
  .drag-item:hover { background: var(--tuanki-surface-hover); }
</style>
