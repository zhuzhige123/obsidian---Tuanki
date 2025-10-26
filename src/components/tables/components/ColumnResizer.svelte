<script lang="ts">
  import type { ColumnResizerProps } from "../types/table-types";

  let { columnKey, onResize }: ColumnResizerProps = $props();

  let isResizing = $state(false);
  let startX = $state(0);

  function handleMouseDown(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    isResizing = true;
    startX = e.clientX;
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.classList.add('resizing-column');
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing) return;
    const deltaX = e.clientX - startX;
    onResize(columnKey, deltaX);
    startX = e.clientX;
  }

  function handleMouseUp() {
    if (!isResizing) return;
    
    isResizing = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.classList.remove('resizing-column');
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: rect.left,
        clientY: rect.top,
        button: 0
      });
      handleMouseDown(mouseEvent);
    }
  }
</script>

<div
  class="tuanki-column-resizer"
  aria-label="调整列宽度"
  onmousedown={handleMouseDown}
  onkeydown={handleKeyDown}
  tabindex="0"
  role="button"
></div>

<style>
  .tuanki-column-resizer {
    position: absolute;
    top: 0;
    right: -2px;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    background: transparent;
    z-index: 20;
    transition: all 0.2s ease;
    border-radius: 2px;
  }

  .tuanki-column-resizer:hover {
    background: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
  }

  .tuanki-column-resizer:active {
    background: var(--color-accent-hover);
    box-shadow: 0 0 0 2px var(--color-accent-hover);
  }

  .tuanki-column-resizer::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 16px;
    background: currentColor;
    opacity: 0;
    transition: opacity 0.2s ease;
    border-radius: 1px;
  }

  .tuanki-column-resizer:hover::before {
    opacity: 0.6;
  }

  .tuanki-column-resizer:active::before {
    opacity: 1;
  }
</style>


