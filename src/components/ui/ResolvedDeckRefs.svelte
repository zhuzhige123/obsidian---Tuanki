<script lang="ts">
  import { MEMORY_DECK_UI_TEXT } from "../../constants/memory-deck-ui-text";
  import type { ResolvedDeckRef } from "../../types/emergent-deck-types";

  interface Props {
    refs?: ResolvedDeckRef[];
    label?: string;
    truncateLength?: number;
    compact?: boolean;
    showLabel?: boolean;
    emptyText?: string;
    containerClass?: string;
  }

  let {
    refs = [],
    label = MEMORY_DECK_UI_TEXT.resolvedRefsLabel,
    truncateLength,
    compact = false,
    showLabel = true,
    emptyText = MEMORY_DECK_UI_TEXT.unassigned,
    containerClass = "",
  }: Props = $props();

  function truncateText(value: string, maxLength?: number): string {
    if (!maxLength || value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(1, maxLength - 1))}…`;
  }
</script>

<div class={`resolved-deck-refs ${compact ? "resolved-deck-refs--compact" : ""} ${containerClass}`.trim()}>
  {#if showLabel}
    <div class="resolved-deck-refs__label">{label}</div>
  {/if}

  <div class="resolved-deck-refs__list">
    {#if refs.length > 0}
      {#each refs as deckRef}
        <span
          class="resolved-deck-refs__badge {deckRef.kind === 'emergent' ? 'resolved-deck-refs__badge--emergent' : 'resolved-deck-refs__badge--formal'}"
          title={`${deckRef.kind === 'emergent' ? MEMORY_DECK_UI_TEXT.emergentDeck : MEMORY_DECK_UI_TEXT.formalDeck}${deckRef.isPrimary ? MEMORY_DECK_UI_TEXT.primaryDeckSuffix : ''}`}
        >
          {truncateText(deckRef.name, truncateLength)}
        </span>
      {/each}
    {:else if emptyText}
      <span class="resolved-deck-refs__empty">{emptyText}</span>
    {/if}
  </div>
</div>

<style>
  .resolved-deck-refs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    min-width: 0;
  }

  .resolved-deck-refs--compact {
    gap: 0.35rem;
  }

  .resolved-deck-refs__label {
    color: var(--text-muted);
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .resolved-deck-refs__list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    min-width: 0;
  }

  .resolved-deck-refs__badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0.2rem 0.55rem;
    font-size: 0.78rem;
    line-height: 1.2;
    border: 1px solid transparent;
  }

  .resolved-deck-refs__badge--formal {
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    color: var(--interactive-accent);
    border-color: color-mix(in srgb, var(--interactive-accent) 18%, transparent);
  }

  .resolved-deck-refs__badge--emergent {
    background: color-mix(in srgb, var(--color-orange, #d97706) 10%, transparent);
    color: var(--color-orange, #d97706);
    border-color: color-mix(in srgb, var(--color-orange, #d97706) 18%, transparent);
  }

  .resolved-deck-refs__empty {
    color: var(--text-muted);
    font-size: 0.82rem;
  }
</style>
