<script lang="ts">
  import type { ColumnResizerProps } from "../types/table-types";

  let { columnKey, onResize }: ColumnResizerProps = $props();

  let isResizing = $state(false);
  let startX = $state(0);

  function handlePointerDown(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();

    isResizing = true;
    startX = event.clientX;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    activeDocument.body.classList.add('resizing-column');
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isResizing) return;

    const deltaX = event.clientX - startX;
    onResize(columnKey, deltaX);
    startX = event.clientX;
  }

  function handlePointerUp() {
    if (!isResizing) return;

    isResizing = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
    activeDocument.body.classList.remove('resizing-column');
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onResize(columnKey, 24);
    }
  }
</script>

<div
  class="weave-column-resizer"
  aria-label="调整列宽"
  onpointerdown={handlePointerDown}
  onkeydown={handleKeyDown}
  tabindex="0"
  role="button"
></div>

<style>
  .weave-column-resizer {
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
    touch-action: none;
  }

  .weave-column-resizer:hover {
    background: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
  }

  .weave-column-resizer:active {
    background: var(--color-accent-hover);
    box-shadow: 0 0 0 2px var(--color-accent-hover);
  }

  .weave-column-resizer::before {
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

  .weave-column-resizer:hover::before {
    opacity: 0.6;
  }

  .weave-column-resizer:active::before {
    opacity: 1;
  }

  @media (hover: none), (pointer: coarse) {
    .weave-column-resizer {
      right: -6px;
      width: 12px;
    }

    .weave-column-resizer::before {
      opacity: 0.35;
      width: 3px;
      height: 18px;
    }
  }
</style>
