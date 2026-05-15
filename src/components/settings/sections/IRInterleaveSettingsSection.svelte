<script lang="ts">
  import { tr } from '../../../utils/i18n';
  import type { IncrementalReadingSettings } from '../../../types/plugin-settings.d';
  import SettingsHelpTriggerButton from '../components/SettingsHelpTriggerButton.svelte';

  interface Props {
    settings: { incrementalReading?: IncrementalReadingSettings };
    onOpenHelp: () => void;
    handleInterleaveModeChange: (event: Event) => void;
    handleMaxConsecutiveChange: (event: Event) => void;
  }

  let {
    settings,
    onOpenHelp,
    handleInterleaveModeChange,
    handleMaxConsecutiveChange
  }: Props = $props();

  let t = $derived($tr);
</script>

<div class="settings-group">
  <div class="group-header">
    <h4 class="group-title with-accent-bar accent-green">{t('irSettings.interleaveTitle')}</h4>
    <SettingsHelpTriggerButton
      label={t('irSettings.interleaveHintModalTitle')}
      onClick={onOpenHelp}
    />
  </div>

  <div class="group-content">
    <div class="row">
      <div class="label-with-desc">
        <label for="irInterleaveMode">{t('irSettings.interleaveModeLabel')}</label>
        <p class="desc">{t('irSettings.interleaveModeDesc')}</p>
      </div>
      <label class="modern-switch">
        <input
          id="irInterleaveMode"
          type="checkbox"
          checked={settings.incrementalReading?.interleaveMode ?? true}
          onchange={handleInterleaveModeChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    {#if settings.incrementalReading?.interleaveMode !== false}
      <div class="row">
        <div class="label-with-desc">
          <label for="irMaxConsecutive">{t('irSettings.maxConsecutiveLabel')}</label>
          <p class="desc">{t('irSettings.maxConsecutiveDesc')}</p>
        </div>
        <div class="slider-container">
          <input
            id="irMaxConsecutive"
            type="range"
            min="1"
            max="10"
            step="1"
            value={settings.incrementalReading?.maxConsecutiveSameTopic ?? 3}
            class="modern-slider"
            oninput={handleMaxConsecutiveChange}
          />
          <span class="slider-value">{settings.incrementalReading?.maxConsecutiveSameTopic ?? 3}{t('irSettings.unitBlocks')}</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .group-header > .group-title {
    flex: 1;
    min-width: 0;
    margin-bottom: 0;
  }

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

  :global(.accent-green) {
    --accent-color: #10b981;
  }

  :global(.with-accent-bar.accent-green::before) {
    background: linear-gradient(180deg, #10b981, #059669);
  }
</style>
