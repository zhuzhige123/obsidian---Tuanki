<script lang="ts">
  import { untrack } from 'svelte';
  import { tr as trStore } from '../../../utils/i18n';
  import type { AnkiModelInfo } from '../../../types/ankiconnect-types';
  import type {
    AnkiSyncCardType,
    CardTypeTemplateMapping,
    DeckSyncMapping
  } from '../types/settings-types';
  import ObsidianDropdown from '../../ui/ObsidianDropdown.svelte';
  import {
    CARD_TYPE_TEMPLATE_MAPPING_CONFIG,
    CARD_TYPE_TEMPLATE_MAPPING_ORDER,
    getCardTypeFieldDefinitions
  } from '../../../services/ankiconnect/card-type-template-mapping';

  interface Props {
    mappingId: string;
    mapping: DeckSyncMapping;
    ankiModels?: AnkiModelInfo[];
    isConnected?: boolean;
    onUpdateMapping: (id: string, updates: Partial<DeckSyncMapping>) => void;
    onClose: () => void;
  }

  function cloneCardTypeMapping(
    mapping: Partial<CardTypeTemplateMapping> | undefined
  ): CardTypeTemplateMapping {
    return {
      enabled: mapping?.enabled ?? false,
      ankiModelName: mapping?.ankiModelName ?? '',
      fieldMappings: { ...(mapping?.fieldMappings ?? {}) },
      lastValidatedAt: mapping?.lastValidatedAt
    };
  }

  function cloneDeckMapping(mapping: DeckSyncMapping): DeckSyncMapping {
    const cardTypeMappings: Partial<Record<AnkiSyncCardType, CardTypeTemplateMapping>> = {};

    for (const cardType of CARD_TYPE_TEMPLATE_MAPPING_ORDER) {
      const current = mapping.cardTypeMappings?.[cardType];
      if (current) {
        cardTypeMappings[cardType] = cloneCardTypeMapping(current);
      }
    }

    return {
      ...mapping,
      cardTypeMappings
    };
  }

  function sortModels(models: AnkiModelInfo[]): AnkiModelInfo[] {
    return [...models].sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
  }

  function resolveInitialCardType(mapping: DeckSyncMapping): AnkiSyncCardType {
    return (
      CARD_TYPE_TEMPLATE_MAPPING_ORDER.find((cardType) => {
        const cardTypeMapping = mapping.cardTypeMappings?.[cardType];
        return Boolean(cardTypeMapping?.ankiModelName?.trim() || cardTypeMapping?.enabled);
      }) ?? CARD_TYPE_TEMPLATE_MAPPING_ORDER[0]
    );
  }

  function getDefaultFieldOrder(cardType: AnkiSyncCardType): string[] {
    return getCardTypeFieldDefinitions(cardType).map((field) => field.key);
  }

  function createInitialFieldOrderState(): Record<AnkiSyncCardType, string[]> {
    return {
      'basic-qa': getDefaultFieldOrder('basic-qa'),
      'single-choice': getDefaultFieldOrder('single-choice'),
      'multiple-choice': getDefaultFieldOrder('multiple-choice'),
      'cloze-deletion': getDefaultFieldOrder('cloze-deletion')
    };
  }

  let {
    mappingId,
    mapping,
    ankiModels = [],
    isConnected = false,
    onUpdateMapping,
    onClose
  }: Props = $props();
  let t = $derived($trStore);

  let localMapping = $state(untrack(() => cloneDeckMapping(mapping)));
  let localModels = $derived(sortModels(ankiModels));
  let activeCardType = $state(untrack(() => resolveInitialCardType(mapping)));
  let fieldOrderByCardType = $state(createInitialFieldOrderState());

  let activeCardTypeMapping = $derived(getCardTypeMapping(activeCardType));
  let activeSelectedModel = $derived(getModelByName(activeCardTypeMapping.ankiModelName));
  let activeFieldDefinitions = $derived(getOrderedFieldDefinitions(activeCardType));
  let cardTypeOptions = $derived(
    CARD_TYPE_TEMPLATE_MAPPING_ORDER.map((cardType) => ({
      id: cardType,
      label: CARD_TYPE_TEMPLATE_MAPPING_CONFIG[cardType].label,
      description: CARD_TYPE_TEMPLATE_MAPPING_CONFIG[cardType].description
    }))
  );
  let ankiModelOptions = $derived(
    localModels.map((model) => ({
      id: model.name,
      label: model.name,
      description: t('ankiConnect.deckMapping.cardTypeModal.fieldsCount', { count: String(model.fields.length) })
    }))
  );

  function getCardTypeMapping(cardType: AnkiSyncCardType): CardTypeTemplateMapping {
    return localMapping.cardTypeMappings?.[cardType] ?? {
      enabled: false,
      ankiModelName: '',
      fieldMappings: {}
    };
  }

  function getModelByName(modelName: string): AnkiModelInfo | undefined {
    return localModels.find((model) => model.name === modelName);
  }

  function getModelFieldOptions(modelName: string) {
    const model = getModelByName(modelName);
    const baseOption = {
      id: '',
      label: t('ankiConnect.deckMapping.cardTypeModal.autoMatch'),
      description: t('ankiConnect.deckMapping.cardTypeModal.autoMatchDesc')
    };

    if (!model) {
      return [baseOption];
    }

    return [
      baseOption,
      ...model.fields.map((fieldName) => ({
        id: fieldName,
        label: fieldName
      }))
    ];
  }

  function getMappedFieldValue(cardType: AnkiSyncCardType, fieldKey: string): string {
    return getCardTypeMapping(cardType).fieldMappings?.[fieldKey] ?? '';
  }

  function getOrderedFieldDefinitions(cardType: AnkiSyncCardType) {
    const definitions = getCardTypeFieldDefinitions(cardType);
    const order = fieldOrderByCardType[cardType] ?? getDefaultFieldOrder(cardType);
    const definitionMap = new Map(definitions.map((definition) => [definition.key, definition]));
    const orderedDefinitions = order
      .map((key) => definitionMap.get(key))
      .filter((definition): definition is (typeof definitions)[number] => Boolean(definition));
    const missingDefinitions = definitions.filter((definition) => !order.includes(definition.key));

    return [...orderedDefinitions, ...missingDefinitions];
  }

  function getWeaveFieldOptions(cardType: AnkiSyncCardType) {
    return getCardTypeFieldDefinitions(cardType).map((fieldDefinition) => ({
      id: fieldDefinition.key,
      label: fieldDefinition.label
    }));
  }

  function reorderWeaveField(cardType: AnkiSyncCardType, rowIndex: number, nextKey: string) {
    const currentOrder = getOrderedFieldDefinitions(cardType).map((field) => field.key);
    const currentKey = currentOrder[rowIndex];
    const swapIndex = currentOrder.indexOf(nextKey);

    if (!nextKey || currentKey === nextKey || swapIndex === -1) {
      return;
    }

    [currentOrder[rowIndex], currentOrder[swapIndex]] = [currentOrder[swapIndex], currentOrder[rowIndex]];

    fieldOrderByCardType = {
      ...fieldOrderByCardType,
      [cardType]: currentOrder
    };
  }

  function commitCardTypeMapping(
    cardType: AnkiSyncCardType,
    nextCardTypeMapping: CardTypeTemplateMapping
  ) {
    const nextMapping: DeckSyncMapping = {
      ...localMapping,
      cardTypeMappings: {
        ...(localMapping.cardTypeMappings ?? {}),
        [cardType]: nextCardTypeMapping
      }
    };

    localMapping = nextMapping;
    onUpdateMapping(mappingId, {
      cardTypeMappings: nextMapping.cardTypeMappings
    });
  }

  function updateCardTypeMapping(
    cardType: AnkiSyncCardType,
    updates: Partial<CardTypeTemplateMapping>
  ) {
    const current = getCardTypeMapping(cardType);
    commitCardTypeMapping(cardType, {
      ...current,
      ...updates,
      fieldMappings:
        updates.fieldMappings !== undefined
          ? { ...updates.fieldMappings }
          : { ...(current.fieldMappings ?? {}) }
    });
  }

  function updateCardTypeModel(cardType: AnkiSyncCardType, ankiModelName: string) {
    const current = getCardTypeMapping(cardType);
    const modelChanged = current.ankiModelName !== ankiModelName;

    updateCardTypeMapping(cardType, {
      enabled: Boolean(ankiModelName),
      ankiModelName,
      fieldMappings: modelChanged ? {} : current.fieldMappings
    });
  }

  function updateCardTypeFieldMapping(
    cardType: AnkiSyncCardType,
    fieldKey: string,
    ankiFieldName: string
  ) {
    const current = getCardTypeMapping(cardType);
    const nextFieldMappings = {
      ...(current.fieldMappings ?? {})
    };

    if (ankiFieldName) {
      nextFieldMappings[fieldKey] = ankiFieldName;
    } else {
      delete nextFieldMappings[fieldKey];
    }

    updateCardTypeMapping(cardType, {
      enabled: current.enabled,
      fieldMappings: nextFieldMappings
    });
  }
</script>

<div class="mapping-modal-shell">
  <div class="mapping-modal-toolbar">
    <div class="toolbar-selects">
      <div class="toolbar-control">
        <span class="toolbar-label">{t('ankiConnect.deckMapping.cardTypeModal.weaveCardType')}</span>
        <ObsidianDropdown
          className="mapping-dropdown"
          options={cardTypeOptions}
          value={activeCardType}
          onchange={(value) => activeCardType = value as AnkiSyncCardType}
        />
      </div>

      <div class="toolbar-control toolbar-control-wide">
        <span class="toolbar-label">{t('ankiConnect.deckMapping.cardTypeModal.ankiModel')}</span>
        <ObsidianDropdown
          className="mapping-dropdown template-dropdown"
          options={ankiModelOptions}
          value={activeCardTypeMapping.ankiModelName}
          placeholder={localModels.length > 0 ? t('ankiConnect.deckMapping.cardTypeModal.selectAnkiModel') : t('ankiConnect.deckMapping.cardTypeModal.fetchModelsFirst')}
          disabled={localModels.length === 0}
          onchange={(value) => updateCardTypeModel(activeCardType, value)}
        />
      </div>
    </div>

    <div class="toolbar-actions">
      <button class="toolbar-btn toolbar-btn-primary" type="button" onclick={onClose}>{t('ankiConnect.deckMapping.cardTypeModal.save')}</button>
    </div>
  </div>

  <div class="status-stack">
    {#if !isConnected}
      <div class="status-card warning">
        {t('ankiConnect.deckMapping.cardTypeModal.connectionHint')}
      </div>
    {/if}

    {#if localModels.length === 0}
      <div class="status-card warning">
        {t('ankiConnect.deckMapping.cardTypeModal.noModelsHint')}
      </div>
    {/if}

    {#if activeCardTypeMapping.ankiModelName && !activeSelectedModel}
      <div class="status-card warning">
        {t('ankiConnect.deckMapping.cardTypeModal.missingSelectedModel')}
      </div>
    {/if}
  </div>

  <section class="mapping-table-card" aria-label={t('ankiConnect.deckMapping.cardTypeModal.tableLabel')}>
    <div class="mapping-table-scroll">
      <table class="mapping-table">
        <thead>
          <tr>
            <th>{t('ankiConnect.deckMapping.cardTypeModal.weaveField')}</th>
            <th>{t('ankiConnect.deckMapping.cardTypeModal.ankiField')}</th>
          </tr>
        </thead>
        <tbody>
          {#each activeFieldDefinitions as fieldDefinition, index}
            <tr class:group-start={index === 0}>
              <td class="field-cell">
                <ObsidianDropdown
                  className="mapping-dropdown weave-field-dropdown"
                  options={getWeaveFieldOptions(activeCardType)}
                  value={fieldDefinition.key}
                  onchange={(value) => reorderWeaveField(activeCardType, index, value)}
                />
              </td>

              <td class="anki-field-cell">
                <ObsidianDropdown
                  className="mapping-dropdown"
                  options={getModelFieldOptions(activeSelectedModel?.name ?? '')}
                  value={getMappedFieldValue(activeCardType, fieldDefinition.key)}
                  placeholder={activeSelectedModel ? t('ankiConnect.deckMapping.cardTypeModal.autoMatch') : t('ankiConnect.deckMapping.cardTypeModal.selectAnkiModel')}
                  disabled={!activeSelectedModel}
                  onchange={(value) =>
                    updateCardTypeFieldMapping(activeCardType, fieldDefinition.key, value)}
                />
              </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
</div>

<style>
  .mapping-modal-shell {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    padding: 2px 0 6px;
    color: var(--text-normal);
  }

  .mapping-modal-toolbar,
  .toolbar-selects,
  .toolbar-actions,
  .status-stack {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .mapping-modal-toolbar,
  .toolbar-selects,
  .toolbar-actions,
  .status-stack {
    flex-wrap: wrap;
  }

  .mapping-modal-toolbar {
    justify-content: space-between;
    align-items: flex-end;
    padding: 2px 0 4px;
  }

  .toolbar-selects {
    flex: 0 1 auto;
  }

  .toolbar-control {
    display: grid;
    gap: 6px;
    min-width: 220px;
  }

  .toolbar-control-wide {
    flex: 0 1 auto;
    width: clamp(320px, 38vw, 520px);
  }

  .toolbar-label {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .toolbar-actions {
    align-self: flex-end;
    margin-left: auto;
    justify-content: flex-end;
  }

  .status-card,
  .mapping-table-card {
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    border-radius: 16px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
  }

  .toolbar-btn {
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-normal);
    border-radius: 10px;
    min-height: 42px;
    padding: 9px 14px;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .toolbar-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toolbar-btn-primary {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .toolbar-btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--interactive-accent) 88%, white);
    border-color: color-mix(in srgb, var(--interactive-accent) 88%, white);
  }

  .status-stack {
    gap: 10px;
  }

  .status-card {
    padding: 12px 14px;
    line-height: 1.6;
  }

  .status-card.warning {
    background: color-mix(in srgb, var(--color-orange, #f59e0b) 10%, var(--background-secondary));
  }

  .mapping-table-card {
    flex: 0 0 auto;
    overflow: hidden;
  }

  .mapping-table-scroll {
    overflow: visible;
  }

  .mapping-table {
    width: 100%;
    min-width: 560px;
    border-collapse: separate;
    border-spacing: 0;
  }

  .mapping-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 16px 18px 14px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--background-secondary) 96%, var(--background-primary));
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .mapping-table td {
    padding: 12px 18px;
    vertical-align: middle;
  }

  .mapping-table tbody tr td {
    border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 72%, transparent);
  }

  .mapping-table tbody tr {
    transition: background 0.18s ease;
  }

  .mapping-table tbody tr:hover {
    background: color-mix(in srgb, var(--interactive-accent) 4%, transparent);
  }

  .mapping-table tbody tr:first-child td {
    border-top: none;
  }

  .field-cell,
  .anki-field-cell {
    width: 50%;
  }

  :global(.weave-field-dropdown),
  :global(.mapping-dropdown) {
    width: 100%;
    min-height: 38px;
  }

  :global(.template-dropdown) {
    max-width: 520px;
  }

  :global(.mapping-dropdown .obsidian-dropdown-trigger) {
    border-radius: 11px;
  }

  @media (max-width: 900px) {
    .mapping-modal-toolbar {
      align-items: stretch;
    }

    .toolbar-actions {
      margin-left: 0;
      justify-content: flex-start;
    }
  }

  @media (max-width: 720px) {
    .toolbar-selects,
    .toolbar-actions {
      width: 100%;
    }

    .toolbar-control,
    .toolbar-control-wide {
      flex: 1 1 100%;
      min-width: 0;
    }

    .toolbar-actions .toolbar-btn {
      flex: 1;
    }

    .mapping-table {
      min-width: 520px;
    }
  }
</style>
  let t = $derived($tr);
