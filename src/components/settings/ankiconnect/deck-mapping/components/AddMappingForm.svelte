<!--
  添加牌组映射表单组件
  职责：提供添加新映射的表单界面
-->
<script lang="ts">
  import type { AnkiDeckInfo } from '../../../../../types/ankiconnect-types';
  import type { Deck } from '../../../../../data/types';
  import type { DeckSyncMapping } from '../../../types/settings-types';

  interface Props {
    isVisible: boolean;
    ankiDecks: AnkiDeckInfo[];
    tuankiDecks: Deck[];
    isPremium: boolean;
    onAdd: (mapping: DeckSyncMapping) => void;
    onShowActivationPrompt: () => void;
  }

  let { 
    isVisible, 
    ankiDecks, 
    tuankiDecks, 
    isPremium,
    onAdd,
    onShowActivationPrompt
  }: Props = $props();

  let selectedTuankiDeckId = $state('');
  let selectedAnkiDeckName = $state('');
  let selectedSyncDirection = $state<'to_anki' | 'from_anki'>('to_anki');

  function handleAdd() {
    if (!selectedTuankiDeckId || !selectedAnkiDeckName) return;

    const tuankiDeck = tuankiDecks.find(d => d.id === selectedTuankiDeckId);
    if (!tuankiDeck) return;

    onAdd({
      tuankiDeckId: selectedTuankiDeckId,
      tuankiDeckName: tuankiDeck.name,
      ankiDeckName: selectedAnkiDeckName,
      syncDirection: selectedSyncDirection,
      enabled: false,
      lastSyncTime: undefined
    });

    // 重置表单
    selectedTuankiDeckId = '';
    selectedAnkiDeckName = '';
    selectedSyncDirection = 'to_anki';
  }

</script>

{#if isVisible}
  <div class="add-mapping-form">
    <h5>➕ 添加新的牌组映射</h5>
    <div class="form-row">
      <div class="form-field">
        <label for="tuanki-deck-select">Tuanki 牌组</label>
        <select id="tuanki-deck-select" bind:value={selectedTuankiDeckId} class="modern-select">
          <option value="">请选择 Tuanki 牌组...</option>
          {#each tuankiDecks as deck}
            <option value={deck.id}>{deck.name}</option>
          {/each}
        </select>
      </div>
      <div class="form-field">
        <label for="anki-deck-select">Anki 牌组</label>
        <select id="anki-deck-select" bind:value={selectedAnkiDeckName} class="modern-select">
          <option value="">请选择 Anki 牌组...</option>
          {#each ankiDecks as deck}
            <option value={deck.name}>{deck.name}</option>
          {/each}
        </select>
      </div>
      <div class="form-field">
        <label for="sync-direction-select">同步方向</label>
        <select 
          id="sync-direction-select" 
          bind:value={selectedSyncDirection} 
          class="modern-select"
        >
          <option value="to_anki">→ 到 Anki</option>
          <option value="from_anki">← 从 Anki</option>
        </select>
      </div>
      <div class="form-actions">
        <button
          class="btn btn-primary"
          onclick={handleAdd}
          disabled={!selectedTuankiDeckId || !selectedAnkiDeckName}
        >
          ✓ 添加
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .add-mapping-form {
    background: var(--background-secondary);
    border-radius: var(--tuanki-radius-md);
    padding: 16px;
    margin-bottom: 16px;
    border: 1px solid var(--background-modifier-border);
  }

  .add-mapping-form h5 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr auto;
    gap: 12px;
    align-items: end;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-field label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .modern-select {
    width: 100%;
    padding: 8px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--tuanki-radius-sm);
    color: var(--text-normal);
    font-size: 14px;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .modern-select:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--interactive-accent-hover);
  }

  .form-actions {
    display: flex;
    align-items: flex-end;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: var(--tuanki-radius-sm);
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 响应式设计 */
  @media (max-width: 1024px) {
    .form-row {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .form-actions {
      justify-content: flex-start;
    }
  }
</style>

