<script lang="ts">
  import type { Deck } from '../../data/types';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { createEventDispatcher } from 'svelte';

  interface Props {
    decks: Deck[];
    cardData: {
      deckId: string;
    }
  }

  let { decks, cardData }: Props = $props();
  
  const dispatch = createEventDispatcher<{
    change: { deckId?: string; };
  }>();

  let isDeckOpen = $state(false);
  let lastSelectedDeckId = $state('');

  function toggleDeck() {
    isDeckOpen = !isDeckOpen;
  }

  function selectDeck(deckId: string) {
    // 防止重复选择同一个牌组
    if (deckId === lastSelectedDeckId || deckId === cardData.deckId) {
      console.log('CardMetadataEditor: 跳过重复的牌组选择');
      isDeckOpen = false;
      return;
    }

    console.log(`CardMetadataEditor: 选择牌组 ${deckId}`);
    lastSelectedDeckId = deckId;

    dispatch('change', { deckId });
    isDeckOpen = false;
  }

</script>

<div class="ce-dropdown {isDeckOpen ? 'active' : ''}">
  <button class="ce-btn ce-btn-secondary ce-dropdown-toggle" onclick={toggleDeck}>
    牌组
    <EnhancedIcon name="chevronDown" size={12} />
  </button>
  <div class="ce-dropdown-menu">
    {#each decks as deck}
      <div class="ce-dropdown-item {deck.id === cardData.deckId ? 'active' : ''}" role="button" tabindex="0" onclick={() => selectDeck(deck.id)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectDeck(deck.id); } }}>
        <span class="deck-name">
          {#if deck.id === cardData.deckId}⭐ {/if}{deck.name}
        </span>
        <small>{deck.stats?.totalCards || 0} 张卡片</small>
      </div>
    {/each}
  </div>
</div>
