<!--
  添加牌组映射表单组件
  职责：提供添加新映射的表单界面
-->
<script lang="ts">
  import type { AnkiDeckInfo } from '../../../../../types/ankiconnect-types';
  import type { Deck } from '../../../../../data/types';
  import type { DeckSyncMapping } from '../../../types/settings-types';
  import ObsidianDropdown from '../../../../ui/ObsidianDropdown.svelte';
  import { tr } from '../../../../../utils/i18n';

  let t = $derived($tr);

  interface Props {
    isVisible: boolean;
    ankiDecks: AnkiDeckInfo[];
    weaveDecks: Deck[];
    onAdd: (mapping: DeckSyncMapping) => void;
  }

  let { 
    isVisible, 
    ankiDecks, 
    weaveDecks, 
    onAdd
  }: Props = $props();

  let selectedWeaveDeckId = $state('');
  let selectedAnkiDeckName = $state('');
  let selectedContentConversion = $state<'standard' | 'preserve_style' | 'minimal'>('standard');

  function handleAdd() {
    if (!selectedWeaveDeckId || !selectedAnkiDeckName) return;

    const weaveDeck = weaveDecks.find(d => d.id === selectedWeaveDeckId);
    if (!weaveDeck) return;

    onAdd({
      weaveDeckId: selectedWeaveDeckId,
      weaveDeckName: weaveDeck.name,
      ankiDeckName: selectedAnkiDeckName,
      syncDirection: 'to_anki',
      contentConversion: selectedContentConversion,
      enabled: false,
      lastSyncTime: undefined
    });

    // 重置表单
    selectedWeaveDeckId = '';
    selectedAnkiDeckName = '';
    selectedContentConversion = 'standard';
  }

</script>

{#if isVisible}
  <div class="add-mapping-form">
    <h5>{t('ankiConnect.addMapping.title')}</h5>
    <div class="form-row">
      <div class="form-field">
        <label for="weave-deck-select">{t('ankiConnect.addMapping.weaveDeckLabel')}</label>
        <ObsidianDropdown
          options={[
            { id: '', label: t('ankiConnect.addMapping.weaveDeckPlaceholder') },
            ...weaveDecks.map(deck => ({ id: deck.id, label: deck.name }))
          ]}
          value={selectedWeaveDeckId}
          onchange={(value) => { selectedWeaveDeckId = value; }}
        />
      </div>
      <div class="form-field">
        <label for="anki-deck-select">{t('ankiConnect.addMapping.ankiDeckLabel')}</label>
        <ObsidianDropdown
          options={[
            { id: '', label: t('ankiConnect.addMapping.ankiDeckPlaceholder') },
            ...ankiDecks.map(deck => ({ id: deck.name, label: deck.name }))
          ]}
          value={selectedAnkiDeckName}
          onchange={(value) => { selectedAnkiDeckName = value; }}
        />
      </div>
      <div class="form-field">
        <label for="content-conversion-select">{t('ankiConnect.addMapping.contentConversionLabel')}</label>
        <ObsidianDropdown
          options={[
            { id: 'standard', label: t('ankiConnect.deckMapping.contentOptions.standard') },
            { id: 'preserve_style', label: t('ankiConnect.deckMapping.contentOptions.preserveStyle') },
            { id: 'minimal', label: t('ankiConnect.deckMapping.contentOptions.minimal') }
          ]}
          value={selectedContentConversion}
          onchange={(value) => { selectedContentConversion = value as any; }}
        />
      </div>
      <div class="form-actions">
        <button
          class="btn btn-primary"
          onclick={handleAdd}
          disabled={!selectedWeaveDeckId || !selectedAnkiDeckName}
        >
          {t('ankiConnect.addMapping.addButton')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .add-mapping-form {
    background: var(--background-secondary);
    border-radius: var(--weave-radius-md);
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

  .form-actions {
    display: flex;
    align-items: flex-end;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: var(--weave-radius-sm);
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
