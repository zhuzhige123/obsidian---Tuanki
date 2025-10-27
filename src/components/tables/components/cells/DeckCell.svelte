<script lang="ts">
  import EnhancedIcon from "../../../ui/EnhancedIcon.svelte";
  import { getDeckName, truncateText } from "../../utils/table-utils";
  import type { DeckCellProps } from "../../types/table-types";

  let { card, decks = [] }: DeckCellProps = $props();

  const deckName = $derived(getDeckName(card.deckId, decks));
  const displayName = $derived(truncateText(deckName, 20));
</script>

<td class="tuanki-deck-column">
  <div class="tuanki-cell-content">
    {#if card.deckId}
      <span class="tuanki-deck-name" title={deckName}>
        {displayName}
      </span>
    {:else}
      <span class="tuanki-text-muted">
        无牌组
      </span>
    {/if}
  </div>
</td>

<style>
  @import '../../styles/cell-common.css';

  .tuanki-deck-column {
    width: 150px;
    min-width: 150px;
    max-width: 200px;
    text-align: left;
  }

  .tuanki-deck-name {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--text-normal);
    font-size: 0.875rem;
    font-weight: 500;
  }
</style>

