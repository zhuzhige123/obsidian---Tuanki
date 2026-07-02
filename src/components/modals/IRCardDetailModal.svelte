<script lang="ts">
  import { Platform } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { Card } from '../../data/types';
  import TabNavigation from '../ui/TabNavigation.svelte';
  import IRCardInfoTab from './tabs/IRCardInfoTab.svelte';
  import IRCardScheduleTab from './tabs/IRCardScheduleTab.svelte';

  const isMobile = Platform.isMobile;

  interface Props {
    card: Card;
    plugin: WeavePlugin;
    allDecks?: Array<{ id: string; name: string }>;
  }

  let { card, plugin, allDecks }: Props = $props();

  let activeTab = $state<string>('info');

  function readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  function readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  const deckName = $derived.by(() => {
    const cardLike = card as Card & Record<string, unknown>;
    const explicitDeckName = readString(cardLike.ir_deck);
    if (explicitDeckName) return explicitDeckName;

    const deckIds = readStringArray(cardLike.ir_deck_ids);
    const primaryDeckId = deckIds[0] || readString(card.deckId);
    if (!primaryDeckId) return '未分配';

    const matchedDeck = allDecks?.find((deck) => deck.id === primaryDeckId);
    return matchedDeck?.name || primaryDeckId;
  });

  const tabs = $derived([
    { id: 'info' as const, label: '阅读点信息', icon: '' },
    { id: 'schedule' as const, label: '调度数据', icon: '' }
  ]);

  function handleTabChange(tabId: string) {
    activeTab = tabId;
  }
</script>

<div class="ir-card-detail-modal" class:mobile={isMobile}>
  <div class="modal-tabs" class:mobile={isMobile}>
    <TabNavigation
      {tabs}
      {activeTab}
      onTabChange={handleTabChange}
      useObsidianIcons={false}
      toolbarStyle={true}
    />
  </div>

  <div class="modal-tab-content" class:mobile={isMobile}>
    {#if activeTab === 'info'}
      <IRCardInfoTab {card} {plugin} {deckName} />
    {:else if activeTab === 'schedule'}
      <IRCardScheduleTab {card} />
    {/if}
  </div>
</div>

<style>
  .ir-card-detail-modal {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background-primary);
  }

  .modal-tabs {
    flex-shrink: 0;
    padding: 12px 16px 0 16px;
    background: transparent;
  }

  .modal-tabs :global(.tab-navigation) {
    width: fit-content;
    max-width: 100%;
  }

  .modal-tabs :global(.tab-button.active .tab-label) {
    font-weight: 600;
  }

  .modal-tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
    min-height: 0;
  }

  .modal-tab-content::-webkit-scrollbar {
    width: 8px;
  }

  .modal-tab-content::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .modal-tab-content::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .modal-tab-content::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  .ir-card-detail-modal.mobile {
    max-height: 70vh;
    min-height: 0;
    overflow: hidden;
  }

  .modal-tabs.mobile {
    padding: 8px 12px 0 12px;
  }

  .modal-tabs.mobile :global(.tab-navigation) {
    gap: 4px;
  }

  .modal-tabs.mobile :global(.tab-button) {
    min-height: 40px;
    padding: 8px 12px;
    flex: 1;
    justify-content: center;
  }

  .modal-tab-content.mobile {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }
</style>
