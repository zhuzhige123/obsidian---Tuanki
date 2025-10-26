<script lang="ts">
  import EnhancedIcon from "../../../ui/EnhancedIcon.svelte";
  import { getStarState } from "../../utils/table-utils";
  import type { PriorityCellProps } from "../../types/table-types";

  let { card, onPriorityUpdate }: PriorityCellProps = $props();

  let hoveringCardId = $state<string | null>(null);
  let hoveringStarIndex = $state<number>(-1);

  function handleClick(starIndex: number) {
    if (!onPriorityUpdate) return;
    const newPriority = starIndex + 1;
    onPriorityUpdate(card.id, newPriority);
  }

  function handleHover(starIndex: number) {
    hoveringCardId = card.id;
    hoveringStarIndex = starIndex;
  }

  function handleLeave() {
    hoveringCardId = null;
    hoveringStarIndex = -1;
  }
</script>

<td class="tuanki-priority-column">
  <div
    class="tuanki-priority-container interactive"
    role="group"
    aria-label="优先级评分"
    onmouseleave={handleLeave}
  >
    {#each Array(4) as _, i}
      {@const starState = getStarState(card.id, i, card.priority || 2, hoveringCardId, hoveringStarIndex)}
      <button
        class="tuanki-priority-star"
        onclick={() => handleClick(i)}
        onmouseenter={() => handleHover(i)}
        aria-label="设置优先级为 {i + 1} 星"
        title="设置优先级为 {i + 1} 星"
      >
        <EnhancedIcon
          name={starState === 'empty' ? 'star' : 'starFilled'}
          size="14"
          color={starState === 'hover' ? 'var(--tuanki-warning)' : (starState === 'filled' ? 'var(--tuanki-warning)' : 'var(--text-faint)')}
        />
      </button>
    {/each}
  </div>
</td>

<style>
  .tuanki-priority-column {
    width: 100px;
    min-width: 100px;
    max-width: 100px;
    text-align: center;
  }

  .tuanki-priority-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }

  .tuanki-priority-container.interactive {
    padding: 2px;
    border-radius: 4px;
    transition: background-color 0.2s ease;
  }

  .tuanki-priority-container.interactive:hover {
    background: var(--background-modifier-hover);
  }

  .tuanki-priority-star {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 3px;
    transition: all 0.15s ease;
    padding: 0;
  }

  .tuanki-priority-star:hover {
    background: var(--background-modifier-hover);
    transform: scale(1.1);
  }

  .tuanki-priority-star:active {
    transform: scale(0.95);
  }

  .tuanki-priority-star:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
</style>


