<script lang="ts">
  import { tr } from '../../../utils/i18n';
  import type {
    CalloutSignalSettings,
    CalloutTypeWeight,
    IncrementalReadingSettings
  } from '../../../types/plugin-settings.d';

  interface Props {
    settings: { incrementalReading?: IncrementalReadingSettings };
    defaultCalloutSignal: CalloutSignalSettings;
    defaultCalloutTypes: CalloutTypeWeight[];
    onCalloutSignalEnabledChange: (enabled: boolean) => void;
    onCalloutTypeEnabledChange: (type: string, enabled: boolean) => void;
    onCalloutTypeWeightChange: (type: string, weight: number) => void;
    onMaxBoostChange: (value: number) => void;
    onSaturationParamChange: (value: number) => void;
    onMinContentLengthChange: (value: number) => void;
    onAddCustomType: (type: string, weight: number) => void;
    onRemoveCustomType: (type: string) => void;
  }

  let {
    settings,
    defaultCalloutSignal,
    defaultCalloutTypes,
    onCalloutSignalEnabledChange,
    onCalloutTypeEnabledChange,
    onCalloutTypeWeightChange,
    onMaxBoostChange,
    onSaturationParamChange,
    onMinContentLengthChange,
    onAddCustomType,
    onRemoveCustomType
  }: Props = $props();

  let t = $derived($tr);
  let newCalloutType = $state('');
  let newCalloutWeight = $state(1.5);

  const CALLOUT_TYPE_LABELS: Record<string, string> = {
    question: 'Question / Help / FAQ',
    warning: 'Warning / Caution / Attention',
    quote: 'Quote / Cite',
    tip: 'Tip / Hint / Important',
    info: 'Info',
    note: 'Note'
  };

  const BUILTIN_TYPES = ['question', 'warning', 'quote', 'tip', 'info', 'note'];

  function getCalloutSignal(): CalloutSignalSettings {
    return settings.incrementalReading?.calloutSignal ?? { ...defaultCalloutSignal };
  }

  function getTypeWeights(): CalloutTypeWeight[] {
    return getCalloutSignal().typeWeights ?? [...defaultCalloutTypes];
  }

  function handleCalloutSignalEnabledChange(event: Event) {
    onCalloutSignalEnabledChange((event.target as HTMLInputElement).checked);
  }

  function handleCalloutTypeEnabledChange(type: string, enabled: boolean) {
    onCalloutTypeEnabledChange(type, enabled);
  }

  function handleCalloutTypeWeightChange(type: string, weight: number) {
    onCalloutTypeWeightChange(type, weight);
  }

  function handleMaxBoostChange(event: Event) {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value) && value >= 1.0 && value <= 2.0) {
      onMaxBoostChange(value);
    }
  }

  function handleSaturationParamChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(value) && value >= 3 && value <= 6) {
      onSaturationParamChange(value);
    }
  }

  function handleMinContentLengthChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(value) && value >= 0 && value <= 50) {
      onMinContentLengthChange(value);
    }
  }

  function handleAddCustomType() {
    const typeName = newCalloutType.trim().toLowerCase();
    if (!typeName) return;
    if (getTypeWeights().some((item) => item.type === typeName)) return;

    onAddCustomType(typeName, newCalloutWeight);

    newCalloutType = '';
    newCalloutWeight = 1.5;
  }

  function handleRemoveCustomType(type: string) {
    if (BUILTIN_TYPES.includes(type)) return;
    onRemoveCustomType(type);
  }

  function isCustomType(type: string): boolean {
    return !BUILTIN_TYPES.includes(type);
  }
</script>

<div class="settings-group">
  <h4 class="group-title with-accent-bar accent-indigo">{t('irSettings.calloutSignalTitle')} <span class="badge">v3.1</span></h4>

  <div class="group-content">
    <div class="row">
      <div class="label-with-desc">
        <label for="irCalloutSignalEnabled">{t('irSettings.calloutSignalLabel')}</label>
        <p class="desc">{t('irSettings.calloutSignalDesc')}</p>
      </div>
      <label class="modern-switch">
        <input
          id="irCalloutSignalEnabled"
          type="checkbox"
          checked={getCalloutSignal().enabled ?? true}
          onchange={handleCalloutSignalEnabledChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    {#if getCalloutSignal().enabled !== false}
      <div class="callout-types-section">
        <div class="section-label">{t('irSettings.calloutTypeWeightsLabel')}</div>
        <p class="section-desc">{t('irSettings.calloutTypeWeightsDesc')}</p>

        <div class="callout-types-list">
          {#each getTypeWeights() as typeWeight (typeWeight.type)}
            <div class="callout-type-row" class:disabled={!typeWeight.enabled}>
              <div class="type-left">
                <label class="type-checkbox">
                  <input
                    type="checkbox"
                    checked={typeWeight.enabled}
                    onchange={(e) => handleCalloutTypeEnabledChange(typeWeight.type, (e.target as HTMLInputElement).checked)}
                  />
                  <span class="type-name">{CALLOUT_TYPE_LABELS[typeWeight.type] ?? typeWeight.type}</span>
                </label>
                {#if isCustomType(typeWeight.type)}
                  <button
                    class="type-remove-btn"
                    onclick={() => handleRemoveCustomType(typeWeight.type)}
                    type="button"
                    title={t('irSettings.deleteBtn')}
                  >×</button>
                {/if}
              </div>
              <div class="type-weight-control">
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.1"
                  value={typeWeight.weight}
                  class="type-weight-slider"
                  disabled={!typeWeight.enabled}
                  oninput={(e) => handleCalloutTypeWeightChange(typeWeight.type, parseFloat((e.target as HTMLInputElement).value))}
                />
                <span class="type-weight-value">{typeWeight.weight.toFixed(1)}</span>
              </div>
            </div>
          {/each}
        </div>

        <div class="add-custom-type">
          <input
            type="text"
            class="custom-type-input"
            placeholder={t('irSettings.calloutTypePlaceholder')}
            bind:value={newCalloutType}
            onkeydown={(e) => e.key === 'Enter' && handleAddCustomType()}
          />
          <div class="custom-type-weight">
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              bind:value={newCalloutWeight}
              class="type-weight-slider"
            />
            <span class="type-weight-value">{newCalloutWeight.toFixed(1)}</span>
          </div>
          <button
            class="add-type-btn"
            onclick={handleAddCustomType}
            type="button"
            disabled={!newCalloutType.trim()}
          >{t('irSettings.addBtn')}</button>
        </div>
      </div>

      <div class="row">
        <div class="label-with-desc">
          <label for="irMaxBoost">{t('irSettings.maxBoostLabel')}</label>
          <p class="desc">{t('irSettings.maxBoostDesc')}</p>
        </div>
        <div class="slider-container">
          <input
            id="irMaxBoost"
            type="range"
            min="1.0"
            max="2.0"
            step="0.1"
            value={getCalloutSignal().maxBoost ?? 2.0}
            class="modern-slider"
            oninput={handleMaxBoostChange}
          />
          <span class="slider-value">+{(getCalloutSignal().maxBoost ?? 2.0).toFixed(1)}</span>
        </div>
      </div>

      <div class="row">
        <div class="label-with-desc">
          <label for="irSaturationParam">{t('irSettings.saturationLabel')}</label>
          <p class="desc">{t('irSettings.saturationDesc')}</p>
        </div>
        <div class="slider-container">
          <input
            id="irSaturationParam"
            type="range"
            min="3"
            max="6"
            step="1"
            value={getCalloutSignal().saturationParam ?? 4}
            class="modern-slider"
            oninput={handleSaturationParamChange}
          />
          <span class="slider-value">{getCalloutSignal().saturationParam ?? 4}</span>
        </div>
      </div>

      <div class="row">
        <div class="label-with-desc">
          <label for="irMinContentLength">{t('irSettings.minContentLabel')}</label>
          <p class="desc">{t('irSettings.minContentDesc')}</p>
        </div>
        <div class="slider-container">
          <input
            id="irMinContentLength"
            type="range"
            min="0"
            max="50"
            step="5"
            value={getCalloutSignal().minContentLength ?? 0}
            class="modern-slider"
            oninput={handleMinContentLengthChange}
          />
          <span class="slider-value">{getCalloutSignal().minContentLength ?? 0}{t('irSettings.unitChars')}</span>
        </div>
      </div>

      <div class="algorithm-hint">
        <div class="hint-title">{t('irSettings.algorithmHintTitle')}</div>
        <div class="hint-content">
          <code>signal = maxBoost × tanh(Σ(count × weight) / s)</code>
          <p>{t('irSettings.algorithmHintContent')}</p>
        </div>
      </div>
    {/if}
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

  .badge {
    display: inline-block;
    padding: 2px 6px;
    font-size: 0.65rem;
    font-weight: 600;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 4px;
    margin-left: 8px;
    vertical-align: middle;
  }

  :global(.accent-indigo) {
    --accent-color: #6366f1;
  }

  :global(.with-accent-bar.accent-indigo::before) {
    background: linear-gradient(180deg, #6366f1, #4f46e5);
  }

  .callout-types-section {
    margin: 12px 0;
    padding: 12px;
    background: var(--background-secondary);
    border-radius: 8px;
  }

  .section-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 4px;
  }

  .section-desc {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .callout-types-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .callout-type-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: var(--background-primary);
    border-radius: 6px;
    transition: opacity 0.15s ease;
  }

  .callout-type-row.disabled {
    opacity: 0.5;
  }

  .type-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .type-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .type-checkbox input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .type-name {
    font-size: 0.85rem;
    color: var(--text-normal);
  }

  .type-weight-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .type-weight-slider {
    width: 80px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--background-modifier-border);
    border-radius: 2px;
    cursor: pointer;
  }

  .type-weight-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    background: var(--interactive-accent);
    border-radius: 50%;
    cursor: pointer;
  }

  .type-weight-slider:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .type-weight-value {
    min-width: 32px;
    font-size: 0.8rem;
    color: var(--text-muted);
    text-align: right;
  }

  .type-remove-btn {
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .type-remove-btn:hover {
    background: var(--background-modifier-error);
    color: var(--text-on-accent);
  }

  .add-custom-type {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .custom-type-input {
    flex: 1;
    min-width: 120px;
    padding: 6px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.85rem;
  }

  .custom-type-input::placeholder {
    color: var(--text-faint);
  }

  .custom-type-weight {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .add-type-btn {
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .add-type-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .algorithm-hint {
    margin-top: 12px;
    padding: 12px;
    background: var(--background-secondary);
    border-radius: 8px;
  }

  .algorithm-hint .hint-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 8px;
  }

  .algorithm-hint .hint-content {
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .algorithm-hint code {
    display: block;
    padding: 8px 10px;
    margin-bottom: 8px;
    background: var(--background-primary);
    border-radius: 4px;
    font-family: var(--font-monospace);
    font-size: 0.8rem;
    color: var(--text-accent);
  }

  .algorithm-hint p {
    margin: 0;
  }
</style>
