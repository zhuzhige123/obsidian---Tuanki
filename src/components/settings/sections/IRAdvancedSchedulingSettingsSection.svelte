<script lang="ts">
  import { tr } from '../../../utils/i18n';
  import type { IncrementalReadingSettings } from '../../../types/plugin-settings.d';
  import type { IncrementalReadingSettingsHost } from '../types/incremental-reading-settings-host';
  import ObsidianDropdown from '../../ui/ObsidianDropdown.svelte';
  import IRTagGroupManager from './IRTagGroupManager.svelte';

  type DropdownOption = { id: string; label: string; desc: string };

  interface Props {
    plugin: IncrementalReadingSettingsHost;
    settings: { incrementalReading?: IncrementalReadingSettings };
    agingOptions: DropdownOption[];
    postponeOptions: DropdownOption[];
    handleTagGroupPriorChange: (event: Event) => void;
    handleTagGroupFollowModeChange: (value: string) => void;
    handleAgingStrengthChange: (value: string) => void;
    handlePostponeStrategyChange: (value: string) => void;
    handlePriorityHalfLifeChange: (event: Event) => void;
  }

  let {
    plugin,
    settings,
    agingOptions,
    postponeOptions,
    handleTagGroupPriorChange,
    handleTagGroupFollowModeChange,
    handleAgingStrengthChange,
    handlePostponeStrategyChange,
    handlePriorityHalfLifeChange
  }: Props = $props();

  let t = $derived($tr);
</script>

<div class="settings-group">
  <h4 class="group-title with-accent-bar accent-rose">{t('irSettings.advancedTitle')}</h4>

  <div class="group-content">
    <div class="row">
      <div class="label-with-desc">
        <label for="irTagGroupPrior">{t('irSettings.tagGroupPriorLabel')}</label>
        <p class="desc">{t('irSettings.tagGroupPriorDesc')}</p>
      </div>
      <label class="modern-switch">
        <input
          id="irTagGroupPrior"
          type="checkbox"
          checked={settings.incrementalReading?.enableTagGroupPrior ?? true}
          onchange={handleTagGroupPriorChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    {#if settings.incrementalReading?.enableTagGroupPrior !== false}
      <IRTagGroupManager {plugin} />

      <div class="row">
        <div class="label-with-desc">
          <label for="irTagGroupFollowMode">{t('irSettings.tagGroupFollowLabel')}</label>
          <p class="desc">{t('irSettings.tagGroupFollowDesc')}</p>
        </div>
        <div class="ir-dropdown-compact">
          <ObsidianDropdown
            options={[
              { id: 'off', label: t('irSettings.followOff'), description: t('irSettings.followOffDesc') },
              { id: 'ask', label: t('irSettings.followAsk'), description: t('irSettings.followAskDesc') },
              { id: 'auto', label: t('irSettings.followAuto'), description: t('irSettings.followAutoDesc') }
            ]}
            value={settings.incrementalReading?.tagGroupFollowMode ?? 'ask'}
            onchange={handleTagGroupFollowModeChange}
          />
        </div>
      </div>
    {/if}

    <div class="row">
      <div class="label-with-desc">
        <label for="irAgingStrength">{t('irSettings.agingStrengthLabel')}</label>
        <p class="desc">{t('irSettings.agingStrengthDesc')}</p>
      </div>
      <div class="ir-dropdown-compact">
        <ObsidianDropdown
          options={agingOptions.map((opt) => ({ id: opt.id, label: opt.label, description: opt.desc }))}
          value={settings.incrementalReading?.agingStrength ?? 'low'}
          onchange={handleAgingStrengthChange}
        />
      </div>
    </div>

    <div class="row">
      <div class="label-with-desc">
        <label for="irPostponeStrategy">{t('irSettings.postponeLabel')}</label>
        <p class="desc">{t('irSettings.postponeDesc')}</p>
      </div>
      <div class="ir-dropdown-compact">
        <ObsidianDropdown
          options={postponeOptions.map((opt) => ({ id: opt.id, label: opt.label, description: opt.desc }))}
          value={settings.incrementalReading?.autoPostponeStrategy ?? 'gentle'}
          onchange={handlePostponeStrategyChange}
        />
      </div>
    </div>

    <div class="row">
      <div class="label-with-desc">
        <label for="irPriorityHalfLife">{t('irSettings.priorityHalfLifeLabel')}</label>
        <p class="desc">{t('irSettings.priorityHalfLifeDesc')}</p>
      </div>
      <div class="slider-container">
        <input
          id="irPriorityHalfLife"
          type="range"
          min="3"
          max="30"
          step="1"
          value={settings.incrementalReading?.priorityHalfLifeDays ?? 7}
          class="modern-slider"
          oninput={handlePriorityHalfLifeChange}
        />
        <span class="slider-value">{settings.incrementalReading?.priorityHalfLifeDays ?? 7}{t('irSettings.unitDays')}</span>
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

  :global(.accent-rose) {
    --accent-color: #f43f5e;
  }

  :global(.with-accent-bar.accent-rose::before) {
    background: linear-gradient(180deg, #f43f5e, #e11d48);
  }

  @media (max-width: 768px) {
    .ir-dropdown-compact {
      flex: 1 1 auto;
      width: 100%;
      max-width: 100%;
      margin-left: 0;
    }
  }
</style>
