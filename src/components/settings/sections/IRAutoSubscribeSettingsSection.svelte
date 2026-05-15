<script lang="ts">
  import { tr } from '../../../utils/i18n';
  import type {
    IncrementalReadingFolderSubscriptionInitialScheduleMode,
    IncrementalReadingFolderSubscriptionRule
  } from '../../../types/plugin-settings.d';
  import ObsidianDropdown from '../../ui/ObsidianDropdown.svelte';
  import ObsidianIcon from '../../ui/ObsidianIcon.svelte';

  type ScheduleModeOption = { id: string; label: string; desc: string };
  type SubscriptionDeckOption = { id: string; label: string; description: string };

  interface Props {
    rules: IncrementalReadingFolderSubscriptionRule[];
    initialScheduleModeOptions: ScheduleModeOption[];
    getFolderSubscriptionRuleLabel: (rule: IncrementalReadingFolderSubscriptionRule) => string;
    getSubscriptionDeckOptionsForRule: (
      rule: IncrementalReadingFolderSubscriptionRule
    ) => SubscriptionDeckOption[];
    getFolderSubscriptionInitialScheduleMode: () => IncrementalReadingFolderSubscriptionInitialScheduleMode;
    getFolderSubscriptionImportConfirmThreshold: () => number;
    handleAddFolderSubscriptionRule: () => Promise<void>;
    chooseFolderSubscriptionFolder: (
      ruleId: string,
      triggerEl?: HTMLElement | null
    ) => Promise<void>;
    handleFolderSubscriptionDeckChange: (ruleId: string, value: string) => Promise<void>;
    handleFolderSubscriptionEnabledChange: (ruleId: string, event: Event) => Promise<void>;
    removeFolderSubscriptionRule: (ruleId: string) => Promise<void>;
    handleFolderSubscriptionInitialScheduleModeChange: (value: string) => Promise<void>;
    handleFolderSubscriptionImportConfirmThresholdChange: (event: Event) => void;
  }

  let {
    rules,
    initialScheduleModeOptions,
    getFolderSubscriptionRuleLabel,
    getSubscriptionDeckOptionsForRule,
    getFolderSubscriptionInitialScheduleMode,
    getFolderSubscriptionImportConfirmThreshold,
    handleAddFolderSubscriptionRule,
    chooseFolderSubscriptionFolder,
    handleFolderSubscriptionDeckChange,
    handleFolderSubscriptionEnabledChange,
    removeFolderSubscriptionRule,
    handleFolderSubscriptionInitialScheduleModeChange,
    handleFolderSubscriptionImportConfirmThresholdChange
  }: Props = $props();

  let t = $derived($tr);
</script>

<div class="settings-group">
  <h4 class="group-title with-accent-bar accent-blue">{t('irSettings.autoSubscribeTitle')}</h4>

  <div class="group-content">
    <div class="subscription-rules-toolbar">
      <div class="label-with-desc">
        <p class="desc">{t('irSettings.autoSubscribeFolderDesc')}</p>
        <p class="subscription-rules-hint">{t('irSettings.autoSubscribePriorityHint')}</p>
      </div>
      <button type="button" class="mod-cta" onclick={() => void handleAddFolderSubscriptionRule()}>
        {t('irSettings.autoSubscribeAddRule')}
      </button>
    </div>

    <div class="subscription-rules-legend" aria-hidden="true">
      <div>{t('irSettings.autoSubscribeTableFolderHeader')}</div>
      <div>{t('irSettings.autoSubscribeTableDeckHeader')}</div>
      <div class="subscription-rules-legend-center">{t('irSettings.autoSubscribeTableEnabledHeader')}</div>
      <div class="subscription-rules-legend-end"></div>
    </div>

    <div class="subscription-rules-list" aria-label={t('irSettings.autoSubscribeTitle')}>
      {#if rules.length === 0}
        <div class="subscription-rules-empty">{t('irSettings.autoSubscribeRuleEmpty')}</div>
      {:else}
        {#each rules as rule (rule.id)}
          <div class="subscription-rules-item">
            <div class="subscription-rules-item-folder">
              <div class="subscription-rules-mobile-label">{t('irSettings.autoSubscribeTableFolderHeader')}</div>
              <button
                type="button"
                class="subscription-folder-trigger"
                onclick={(event) => void chooseFolderSubscriptionFolder(String(rule.id || ''), event.currentTarget as HTMLElement)}
              >
                <span class:placeholder={!rule.folderPath}>{getFolderSubscriptionRuleLabel(rule)}</span>
              </button>
            </div>

            <div class="subscription-rules-cell subscription-rules-cell-deck">
              <div class="subscription-rules-mobile-label">{t('irSettings.autoSubscribeTableDeckHeader')}</div>
              <ObsidianDropdown
                className="subscription-rule-dropdown"
                options={getSubscriptionDeckOptionsForRule(rule)}
                value={rule.deckId || ''}
                placeholder={t('irSettings.autoSubscribeDeckEmpty')}
                onchange={(value) => {
                  void handleFolderSubscriptionDeckChange(String(rule.id || ''), value);
                }}
              />
            </div>

            <div class="subscription-rules-cell subscription-rules-cell-enabled-only">
              <div class="subscription-rules-mobile-label">{t('irSettings.autoSubscribeTableEnabledHeader')}</div>
              <label class="modern-switch">
                <input
                  type="checkbox"
                  checked={rule.enabled ?? false}
                  onchange={(event) => void handleFolderSubscriptionEnabledChange(String(rule.id || ''), event)}
                />
                <span class="switch-slider"></span>
              </label>
            </div>

            <div class="subscription-rules-cell subscription-rules-cell-delete">
              <div class="subscription-rules-mobile-label">{t('irSettings.autoSubscribeRuleRemove')}</div>
              <button
                type="button"
                class="subscription-rule-delete-btn clickable-icon"
                onclick={() => void removeFolderSubscriptionRule(String(rule.id || ''))}
                title={t('irSettings.autoSubscribeRuleRemove')}
                aria-label={t('irSettings.autoSubscribeRuleRemove')}
              >
                <ObsidianIcon name="trash" size={16} />
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <div class="row">
      <div class="label-with-desc">
        <label for="irFolderSubscriptionInitialScheduleMode">{t('irSettings.autoSubscribeInitialScheduleLabel')}</label>
        <p class="desc">{t('irSettings.autoSubscribeInitialScheduleDesc')}</p>
      </div>
      <div class="ir-dropdown-compact">
        <ObsidianDropdown
          options={initialScheduleModeOptions.map((opt) => ({ id: opt.id, label: opt.label, description: opt.desc }))}
          value={getFolderSubscriptionInitialScheduleMode()}
          onchange={(value) => {
            void handleFolderSubscriptionInitialScheduleModeChange(value);
          }}
        />
      </div>
    </div>

    <div class="row">
      <div class="label-with-desc">
        <label for="irFolderSubscriptionImportConfirmThreshold">{t('irSettings.autoSubscribeConfirmThresholdLabel')}</label>
        <p class="desc">{t('irSettings.autoSubscribeConfirmThresholdDesc')}</p>
      </div>
      <div class="slider-container">
        <input
          id="irFolderSubscriptionImportConfirmThreshold"
          type="range"
          min="0"
          max="200"
          step="5"
          value={getFolderSubscriptionImportConfirmThreshold()}
          class="modern-slider"
          oninput={handleFolderSubscriptionImportConfirmThresholdChange}
        />
        <span class="slider-value">{getFolderSubscriptionImportConfirmThreshold()}</span>
      </div>
    </div>
  </div>
</div>

<style>
  .label-with-desc {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .label-with-desc > label {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--text-normal);
  }

  .label-with-desc > .desc {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--text-muted);
  }

  .ir-dropdown-compact {
    flex: 0 0 220px;
    width: 220px;
    max-width: 100%;
    margin-left: auto;
  }

  .subscription-rules-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }

  .subscription-rules-hint {
    margin: 6px 0 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--text-faint);
  }

  .subscription-rules-list {
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--background-secondary) 72%, transparent);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 16px;
  }

  .subscription-rules-legend {
    display: grid;
    grid-template-columns: minmax(0, 1.9fr) minmax(220px, 1fr) 72px 40px;
    gap: 16px;
    padding: 0 16px 8px;
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .subscription-rules-legend-center {
    text-align: center;
  }

  .subscription-rules-legend-end {
    text-align: right;
  }

  .subscription-rules-item {
    display: grid;
    grid-template-columns: minmax(0, 1.9fr) minmax(220px, 1fr) 72px 40px;
    gap: 16px;
    padding: 12px 16px;
    align-items: center;
  }

  .subscription-rules-item + .subscription-rules-item {
    border-top: 1px solid var(--background-modifier-border);
  }

  .subscription-rules-empty {
    padding: 16px;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .subscription-rules-cell {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
  }

  .subscription-rules-item-folder {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    justify-content: center;
  }

  .subscription-rules-cell-enabled-only,
  .subscription-rules-cell-delete {
    align-items: center;
    justify-content: center;
  }

  .subscription-rules-mobile-label {
    display: none;
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .subscription-folder-trigger {
    width: 100%;
    min-height: 36px;
    padding: 8px 10px;
    border: none;
    border-radius: var(--input-radius);
    background: color-mix(in srgb, var(--background-primary) 85%, transparent);
    color: var(--text-normal);
    text-align: left;
    box-shadow: none;
    overflow: hidden;
  }

  .subscription-folder-trigger span {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .subscription-folder-trigger span.placeholder {
    color: var(--text-muted);
  }

  .subscription-folder-trigger:hover {
    background: color-mix(in srgb, var(--background-modifier-hover) 80%, transparent);
  }

  .subscription-folder-trigger:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .subscription-rule-delete-btn {
    width: var(--clickable-icon-size, 32px);
    height: var(--clickable-icon-size, 32px);
    border-radius: var(--clickable-icon-radius, 4px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    box-shadow: none;
  }

  .subscription-rule-delete-btn:hover:not(:disabled) {
    color: var(--text-error);
  }

  :global(.accent-blue) {
    --accent-color: #3b82f6;
  }

  :global(.with-accent-bar.accent-blue::before) {
    background: linear-gradient(180deg, #3b82f6, #2563eb);
  }

  @media (max-width: 768px) {
    .ir-dropdown-compact {
      flex: 1 1 auto;
      width: 100%;
      max-width: 100%;
      margin-left: 0;
    }

    .subscription-rules-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .subscription-rules-toolbar > .mod-cta {
      align-self: flex-start;
    }

    .subscription-rules-item {
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 12px 14px;
    }

    .subscription-rules-legend {
      display: none;
    }

    .subscription-rules-mobile-label {
      display: block;
    }

    .subscription-rules-cell-enabled-only,
    .subscription-rules-cell-delete {
      align-items: flex-start;
    }
  }
</style>
