<script lang="ts">
  import { tr } from '../../../utils/i18n';
  import type { IncrementalReadingSettings } from '../../../types/plugin-settings.d';

  interface Props {
    settings: { incrementalReading?: IncrementalReadingSettings };
    handleDailyNewLimitChange: (event: Event) => void;
    handleDailyReviewLimitChange: (event: Event) => void;
    handleLearnAheadDaysChange: (event: Event) => void;
    handleIntervalFactorChange: (event: Event) => void;
    handleReviewThresholdChange: (event: Event) => void;
    handleMaxIntervalChange: (event: Event) => void;
  }

  let {
    settings,
    handleDailyNewLimitChange,
    handleDailyReviewLimitChange,
    handleLearnAheadDaysChange,
    handleIntervalFactorChange,
    handleReviewThresholdChange,
    handleMaxIntervalChange
  }: Props = $props();

  let t = $derived($tr);
</script>

<div class="settings-group">
  <h4 class="group-title with-accent-bar accent-amber">{t('irSettings.scheduleTitle')}</h4>

  <div class="group-content">
    <div class="row">
      <div class="label-with-desc">
        <label for="irDailyNewLimit">{t('irSettings.dailyNewLabel')}</label>
        <p class="desc">{t('irSettings.dailyNewDesc')}</p>
      </div>
      <div class="slider-container">
        <input
          id="irDailyNewLimit"
          type="range"
          min="0"
          max="50"
          step="5"
          value={settings.incrementalReading?.dailyNewLimit ?? 20}
          class="modern-slider"
          oninput={handleDailyNewLimitChange}
        />
        <span class="slider-value">{settings.incrementalReading?.dailyNewLimit ?? 20}</span>
      </div>
    </div>

    <div class="row">
      <div class="label-with-desc">
        <label for="irDailyReviewLimit">{t('irSettings.dailyReviewLabel')}</label>
        <p class="desc">{t('irSettings.dailyReviewDesc')}</p>
      </div>
      <div class="slider-container">
        <input
          id="irDailyReviewLimit"
          type="range"
          min="0"
          max="200"
          step="10"
          value={settings.incrementalReading?.dailyReviewLimit ?? 50}
          class="modern-slider"
          oninput={handleDailyReviewLimitChange}
        />
        <span class="slider-value">{settings.incrementalReading?.dailyReviewLimit ?? 50}</span>
      </div>
    </div>

    <div class="row">
      <div class="label-with-desc">
        <label for="irLearnAheadDays">{t('irSettings.learnAheadLabel')}</label>
        <p class="desc">{t('irSettings.learnAheadDesc')}</p>
      </div>
      <div class="slider-container">
        <input
          id="irLearnAheadDays"
          type="range"
          min="1"
          max="14"
          step="1"
          value={settings.incrementalReading?.learnAheadDays ?? 3}
          class="modern-slider"
          oninput={handleLearnAheadDaysChange}
        />
        <span class="slider-value">{settings.incrementalReading?.learnAheadDays ?? 3}{t('irSettings.unitDays')}</span>
      </div>
    </div>

    <div class="row">
      <div class="label-with-desc">
        <label for="irIntervalFactor">{t('irSettings.intervalFactorLabel')}</label>
        <p class="desc">{t('irSettings.intervalFactorDesc')}</p>
      </div>
      <div class="slider-container">
        <input
          id="irIntervalFactor"
          type="range"
          min="1.0"
          max="3.0"
          step="0.1"
          value={settings.incrementalReading?.defaultIntervalFactor ?? 1.5}
          class="modern-slider"
          oninput={handleIntervalFactorChange}
        />
        <span class="slider-value">{(settings.incrementalReading?.defaultIntervalFactor ?? 1.5).toFixed(1)}x</span>
      </div>
    </div>

    <div class="row">
      <div class="label-with-desc">
        <label for="irReviewThreshold">{t('irSettings.reviewThresholdLabel')}</label>
        <p class="desc">{t('irSettings.reviewThresholdDesc')}</p>
      </div>
      <div class="slider-container">
        <input
          id="irReviewThreshold"
          type="range"
          min="3"
          max="14"
          step="1"
          value={settings.incrementalReading?.reviewThreshold ?? 7}
          class="modern-slider"
          oninput={handleReviewThresholdChange}
        />
        <span class="slider-value">{settings.incrementalReading?.reviewThreshold ?? 7}{t('irSettings.unitDays')}</span>
      </div>
    </div>

    <div class="row">
      <div class="label-with-desc">
        <label for="irMaxInterval">{t('irSettings.maxIntervalLabel')}</label>
        <p class="desc">{t('irSettings.maxIntervalDesc')}</p>
      </div>
      <div class="slider-container">
        <input
          id="irMaxInterval"
          type="range"
          min="30"
          max="365"
          step="30"
          value={settings.incrementalReading?.maxInterval ?? 365}
          class="modern-slider"
          oninput={handleMaxIntervalChange}
        />
        <span class="slider-value">{settings.incrementalReading?.maxInterval ?? 365}{t('irSettings.unitDays')}</span>
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

  :global(.accent-amber) {
    --accent-color: #f59e0b;
  }

  :global(.with-accent-bar.accent-amber::before) {
    background: linear-gradient(180deg, #f59e0b, #d97706);
  }
</style>
