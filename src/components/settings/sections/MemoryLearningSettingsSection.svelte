<script lang="ts">
  import { untrack } from 'svelte';
  import { logger } from '../../../utils/logger';
  import type WeavePlugin from '../../../main';
  import ObsidianDropdown from '../../ui/ObsidianDropdown.svelte';
  import { tr } from '../../../utils/i18n';
  import { PremiumFeatureGuard } from '../../../services/premium/PremiumFeatureGuard';
  import { getConfiguredClozeSyntaxExample } from '../../../utils/cloze-syntax';
  import FSRS6SettingsSection from './FSRS6SettingsSection.svelte';

  interface Props {
    plugin: WeavePlugin;
  }

  let { plugin }: Props = $props();
  let settings = $state(untrack(() => plugin.settings));

  let t = $derived($tr);
  const premiumGuard = PremiumFeatureGuard.getInstance();
  let isPremium = $state(false);
  let showPremiumFeatures = $derived(isPremium || (settings.showPremiumFeaturesPreview ?? false));

  type ShortTermSchedulingPreset = 'recommended' | 'pure-fsrs' | 'custom';

  $effect(() => {
    const unsubscribe = premiumGuard.isPremiumActive.subscribe(value => {
      isPremium = value;
    });
    return unsubscribe;
  });

  async function saveSettings() {
    try {
      plugin.settings = settings;
      await plugin.saveSettings();

} catch (error) {
      logger.error('Failed to save settings:', error);
}
  }

  function handleDefaultDeckChange(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    if (value.length > 0) {
      settings.defaultDeck = value;
      saveSettings();
    }
  }

  function handleReviewsPerDayChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    const MAX_REVIEWS_PER_DAY = 200;
    if (!isNaN(value) && value >= 1 && value <= MAX_REVIEWS_PER_DAY) {
      settings.reviewsPerDay = value;
      saveSettings();
    }
  }

  function handleNewCardsPerDayChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    const MAX_NEW_CARDS_PER_DAY = 100;
    if (!isNaN(value) && value >= 0 && value <= MAX_NEW_CARDS_PER_DAY) {
      settings.newCardsPerDay = value;
      saveSettings();
    }
  }

  function handleAutoShowAnswerChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 0 && value <= 10) {
      settings.autoShowAnswerSeconds = value;
      saveSettings();
    }
  }

  function handleLearningStepsChange(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    const steps = value.length === 0
      ? []
      : value.split(/\s+/)
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n) && n >= 0);

    settings.learningSteps = steps;
    saveSettings();
  }

  function handleRelearningStepsChange(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    const steps = value.length === 0
      ? []
      : value.split(/\s+/)
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n) && n >= 0);

    settings.relearningSteps = steps;
    saveSettings();
  }

  function handleGraduatingIntervalChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 1 && value <= 30) {
      settings.graduatingInterval = value;
      saveSettings();
    }
  }

  function handleMaxAdvanceDaysChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 1 && value <= 7) {
      settings.maxAdvanceDays = value;
      saveSettings();
    }
  }

  function handleStudyViewSpacingChange(value: string) {
    settings.studyViewSpacing = value as 'compact' | 'default' | 'comfortable';
    plugin.settings.studyViewSpacing = settings.studyViewSpacing;
    plugin.refreshStudyViewSpacing?.();
    saveSettings();
  }

  function handleClozeDelimiterChange(
    key: 'openDelimiter' | 'closeDelimiter',
    event: Event
  ) {
    const sanitized = (event.target as HTMLInputElement).value.replace(/[\r\n]+/g, '').trim();
    const fallback = key === 'openDelimiter' ? '==' : '==';
    const current = settings.clozeSettings ?? { enabled: true, openDelimiter: '==', closeDelimiter: '==', placeholder: '[...]' };
    settings.clozeSettings = {
      ...current,
      enabled: true,
      [key]: sanitized || fallback
    };
    saveSettings();
  }

  function getCurrentClozeSyntaxExample(): string {
    return getConfiguredClozeSyntaxExample('示例', settings.clozeSettings);
  }

  function formatLearningSteps(steps: number[]): string {
    return steps.join(' ');
  }

  function formatAutoShowAnswer(seconds: number): string {
    return seconds === 0 ? t('common.time.manual') : t('common.time.seconds', { count: seconds });
  }

  function arraysEqual(a: number[] = [], b: number[] = []): boolean {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
  }

  function getShortTermSchedulingPreset(): ShortTermSchedulingPreset {
    const learningSteps = settings.learningSteps || [];
    const relearningSteps = settings.relearningSteps || [];

    if (learningSteps.length === 0 && relearningSteps.length === 0) {
      return 'pure-fsrs';
    }

    if (arraysEqual(learningSteps, [1, 10]) && arraysEqual(relearningSteps, [10])) {
      return 'recommended';
    }

    return 'custom';
  }

  function getShortTermSchedulingSelectValue(): 'recommended' | 'pure-fsrs' {
    return getShortTermSchedulingPreset() === 'pure-fsrs' ? 'pure-fsrs' : 'recommended';
  }

  function handleShortTermSchedulingPresetChange(value: string) {
    if (value === 'pure-fsrs') {
      applyPureFsrsSchedulingPreset();
      return;
    }
    applyRecommendedSchedulingPreset();
  }

  function applyRecommendedSchedulingPreset() {
    settings.learningSteps = [1, 10];
    settings.relearningSteps = [10];
    saveSettings();
  }

  function applyPureFsrsSchedulingPreset() {
    settings.learningSteps = [];
    settings.relearningSteps = [];
    saveSettings();
  }
</script>

<div class="weave-settings settings-section memory-learning-settings">
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-blue">{t('settings.memoryLearning.studyExperience.title')}</h4>

    <div class="group-content">
      <div class="row weave-inline-input default-deck-row">
        <label for="defaultDeck">{t('settings.basic.defaultDeck.label')}</label>
        <input
          id="defaultDeck"
          type="text"
          value={settings.defaultDeck}
          placeholder={t('settings.basic.defaultDeck.placeholder')}
          class="modern-input default-deck-input"
          oninput={handleDefaultDeckChange}
        />
      </div>

      <div class="row">
        <label for="deckCardStyle">{t('settings.basic.deckCardStyle.label')}</label>
        <div class="settings-dropdown-compact">
          <ObsidianDropdown
            options={[
              { id: 'default', label: t('settings.basic.deckCardStyle.options.default') },
              { id: 'chinese-elegant', label: t('settings.basic.deckCardStyle.options.chineseElegant') }
            ]}
            value={settings.deckCardStyle ?? 'default'}
            onchange={(value) => {
              settings.deckCardStyle = value as 'default' | 'chinese-elegant';
              plugin.settings.deckCardStyle = settings.deckCardStyle;
              window.dispatchEvent(new CustomEvent('Weave:deck-card-style-change', {
                detail: settings.deckCardStyle
              }));
              saveSettings();
            }}
          />
        </div>
      </div>

      <div class="row">
        <label for="studyViewSpacing">{t('settings.basic.studyViewSpacing.label')}</label>
        <div class="settings-dropdown-compact">
          <ObsidianDropdown
            options={[
              { id: 'compact', label: t('settings.basic.studyViewSpacing.compact') },
              { id: 'default', label: t('settings.basic.studyViewSpacing.default') },
              { id: 'comfortable', label: t('settings.basic.studyViewSpacing.comfortable') }
            ]}
            value={settings.studyViewSpacing ?? 'compact'}
            onchange={handleStudyViewSpacingChange}
          />
        </div>
      </div>

      <div class="row learning-steps-row cloze-delimiter-row">
        <div class="label-with-desc memory-label-with-desc">
          <label for="clozeOpenDelimiter">{t('settings.memoryLearning.clozeDelimiters.label')}</label>
          <p class="desc">{t('settings.memoryLearning.clozeDelimiters.helpText')}</p>
          <p class="desc cloze-delimiter-preview">{t('settings.memoryLearning.clozeDelimiters.currentSyntax', { syntax: getCurrentClozeSyntaxExample() })}</p>
        </div>
        <div class="cloze-delimiter-controls">
          <input
            id="clozeOpenDelimiter"
            type="text"
            class="modern-input learning-steps-input"
            value={settings.clozeSettings?.openDelimiter ?? '=='}
            placeholder="=="
            oninput={(event) => handleClozeDelimiterChange('openDelimiter', event)}
          />
          <input
            id="clozeCloseDelimiter"
            type="text"
            class="modern-input learning-steps-input"
            value={settings.clozeSettings?.closeDelimiter ?? '=='}
            placeholder="=="
            oninput={(event) => handleClozeDelimiterChange('closeDelimiter', event)}
          />
        </div>
      </div>

      {#if showPremiumFeatures}
        <div class="row">
          <label for="progressive-cloze-history">{t('settings.basic.progressiveCloze.historyInheritance.label')}</label>
          <div class="settings-dropdown-compact">
            <ObsidianDropdown
              options={[
                { id: 'first', label: t('settings.basic.progressiveCloze.historyInheritance.first') },
                { id: 'proportional', label: t('settings.basic.progressiveCloze.historyInheritance.proportional') },
                { id: 'reset', label: t('settings.basic.progressiveCloze.historyInheritance.reset') },
                { id: 'prompt', label: t('settings.basic.progressiveCloze.historyInheritance.prompt') }
              ]}
              value={settings.progressiveCloze?.historyInheritance ?? 'first'}
              onchange={(value) => {
                if (!settings.progressiveCloze) {
                  settings.progressiveCloze = { enableAutoSplit: true };
                }
                settings.progressiveCloze.historyInheritance = value as 'first' | 'proportional' | 'reset' | 'prompt';
                saveSettings();
              }}
            />
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-orange">{t('settings.learning.title')}</h4>

    <div class="group-content">
      <div class="row">
        <label for="reviewsPerDay">{t('settings.learning.reviewsPerDay.label')}</label>
        <div class="slider-container">
          <input
            id="reviewsPerDay"
            type="range"
            min="1"
            max="200"
            step="5"
            value={settings.reviewsPerDay}
            class="modern-slider"
            oninput={handleReviewsPerDayChange}
          />
          <span class="slider-value">{settings.reviewsPerDay}</span>
        </div>
      </div>

      <div class="row">
        <label for="newCardsPerDay">{t('settings.learning.newCardsPerDay.label')}</label>
        <div class="slider-container">
          <input
            id="newCardsPerDay"
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.newCardsPerDay || 20}
            class="modern-slider"
            oninput={handleNewCardsPerDayChange}
          />
          <span class="slider-value">{settings.newCardsPerDay || 20}</span>
        </div>
      </div>

      <div class="row">
        <label for="autoShowAnswer">{t('settings.learning.autoAdvance.label')}</label>
        <div class="slider-container">
          <input
            id="autoShowAnswer"
            type="range"
            min="0"
            max="10"
            step="1"
            value={settings.autoShowAnswerSeconds}
            class="modern-slider"
            oninput={handleAutoShowAnswerChange}
          />
          <span class="slider-value">{formatAutoShowAnswer(settings.autoShowAnswerSeconds)}</span>
        </div>
      </div>

      <div class="row learning-steps-row">
        <div class="label-with-desc memory-label-with-desc">
          <label for="learningSteps">{t('settings.memoryLearning.learningSteps.label')}</label>
          <p class="desc">{t('settings.memoryLearning.learningSteps.helpText')}</p>
        </div>
        <div class="learning-steps-controls">
          <input
            id="learningSteps"
            type="text"
            placeholder="1 10"
            value={formatLearningSteps(settings.learningSteps)}
            class="modern-input learning-steps-input"
            oninput={handleLearningStepsChange}
          />
        </div>
      </div>

      <div class="row short-term-scheduling-row">
        <div class="label-with-desc memory-label-with-desc">
          <div class="memory-setting-title">{t('settings.memoryLearning.shortTermScheduling.label')}</div>
          <p class="desc preset-status">
            {t(`settings.memoryLearning.shortTermScheduling.status.${getShortTermSchedulingPreset()}`)}
          </p>
        </div>
        <div class="settings-dropdown-compact short-term-preset-dropdown">
          <ObsidianDropdown
            options={[
              { id: 'recommended', label: t('settings.memoryLearning.shortTermScheduling.recommended') },
              { id: 'pure-fsrs', label: t('settings.memoryLearning.shortTermScheduling.pureFsrs') }
            ]}
            value={getShortTermSchedulingSelectValue()}
            onchange={handleShortTermSchedulingPresetChange}
          />
        </div>
      </div>

      <div class="row learning-steps-row">
        <div class="label-with-desc memory-label-with-desc">
          <label for="relearningSteps">{t('settings.memoryLearning.relearningSteps.label')}</label>
          <p class="desc">{t('settings.memoryLearning.relearningSteps.helpText')}</p>
        </div>
        <div class="learning-steps-controls">
          <input
            id="relearningSteps"
            type="text"
            placeholder="10"
            value={formatLearningSteps(settings.relearningSteps || [])}
            class="modern-input learning-steps-input"
            oninput={handleRelearningStepsChange}
          />
        </div>
      </div>

      <div class="row memory-inline-note-row">
        <div class="memory-inline-note">
          {t('settings.memoryLearning.fsrsShortTermNote')}
        </div>
      </div>

      <div class="row">
        <label for="maxAdvanceDays">{t('settings.memoryLearning.maxAdvanceDays.label')}</label>
        <div class="slider-container">
          <input
            id="maxAdvanceDays"
            type="range"
            min="1"
            max="7"
            step="1"
            value={settings.maxAdvanceDays || 7}
            class="modern-slider"
            oninput={handleMaxAdvanceDaysChange}
          />
          <span class="slider-value">{settings.maxAdvanceDays || 7} {t('settings.memoryLearning.maxAdvanceDays.unit')}</span>
        </div>
      </div>
    </div>
  </div>

  <FSRS6SettingsSection {plugin} showSiblingDispersionAfterBasic={true} />
</div>

<style>
  .default-deck-row .default-deck-input {
    flex: 0 0 220px;
    width: 220px;
    max-width: 100%;
  }

  .learning-steps-row,
  .short-term-scheduling-row {
    align-items: flex-start;
  }

  .memory-label-with-desc {
    flex: 1 1 auto;
    min-width: 0;
    margin-right: 1rem;
    max-width: min(640px, 100%);
  }

  .memory-label-with-desc > label,
  .memory-setting-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--text-normal);
  }

  .memory-label-with-desc > .desc {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .learning-steps-controls {
    flex: 0 0 210px;
    width: 210px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .learning-steps-input {
    width: 100%;
    max-width: 100%;
  }

  .cloze-delimiter-controls {
    flex: 0 0 210px;
    width: 210px;
    max-width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .cloze-delimiter-preview {
    margin-top: 4px;
  }

  .memory-inline-note-row {
    align-items: flex-start;
  }

  .memory-inline-note {
    flex: 1;
    min-width: 0;
    max-width: min(760px, 100%);
    font-size: 0.78rem;
    color: var(--text-muted);
    line-height: 1.5;
    padding-right: 0.5rem;
  }

  .preset-status {
    margin-top: 2px;
  }

  .short-term-preset-dropdown {
    flex: 0 0 210px;
    width: 210px;
    max-width: 100%;
  }

  @media (max-width: 768px) {
    .default-deck-row .default-deck-input {
      flex: 1 1 auto;
      width: 100%;
    }

    .memory-label-with-desc {
      margin-right: 0;
      max-width: 100%;
    }

    .learning-steps-controls {
      flex: 1 1 auto;
      width: 100%;
      align-items: stretch;
      gap: 6px;
    }

    .cloze-delimiter-controls {
      flex: 1 1 auto;
      width: 100%;
    }

    .memory-inline-note {
      max-width: 100%;
      padding-right: 0;
    }

    .short-term-preset-dropdown {
      flex: 1 1 auto;
      width: 100%;
      max-width: 100%;
    }
  }
</style>
