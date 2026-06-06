<!--
  FSRS6基础参数配置面板
  职责：目标记忆率、最大间隔、随机化等基础参数配置
-->
<script lang="ts">
  import EnhancedIcon from '../../../../ui/EnhancedIcon.svelte';
  import { tr } from '../../../../../utils/i18n';

  // 响应式翻译函数
  let t = $derived($tr);

  interface BasicParameters {
    retention: number;
    maxInterval: number;
    enableFuzz: boolean;
  }

  interface Props {
    parameters: BasicParameters;
    onRetentionChange: (value: number) => void;
    onMaxIntervalChange: (value: number) => void;
    onFuzzToggle: () => void;
    onReset: () => void | Promise<void>;
  }

  let { 
    parameters, 
    onRetentionChange,
    onMaxIntervalChange,
    onFuzzToggle,
    onReset
  }: Props = $props();

  function formatPercentage(value: number): string {
    return `${(value * 100).toFixed(0)}%`;
  }

  function formatInterval(days: number): string {
    if (days >= 365) {
      const years = (days / 365).toFixed(1);
      return `${years} ${t('common.timeUnits.years').replace('{n}', '').trim()}`;
    }
    return `${days} ${t('common.timeUnits.days').replace('{n}', '').trim()}`;
  }

  function handleRetentionChange(e: Event) {
    const target = e.target as HTMLInputElement;
    onRetentionChange(parseFloat(target.value));
  }

  function handleMaxIntervalChange(e: Event) {
    const target = e.target as HTMLInputElement;
    onMaxIntervalChange(parseInt(target.value));
  }
</script>

<div class="basic-parameters-panel">
  <!-- 目标记忆率 -->
  <div class="row">
    <div class="row-label-section">
      <label for="fsrs6-retention">{t('fsrs.basicParams.retention.label')}</label>
      <span class="param-hint">{t('fsrs.basicParams.retention.description')}</span>
    </div>
    <div class="slider-container">
      <input
        id="fsrs6-retention"
        type="range"
        min="0.5"
        max="0.99"
        step="0.01"
        value={parameters.retention}
        onchange={handleRetentionChange}
        class="modern-slider"
      />
      <span class="slider-value">{formatPercentage(parameters.retention)}</span>
    </div>
  </div>

  <!-- 最大间隔 -->
  <div class="row">
    <div class="row-label-section">
      <label for="fsrs6-max-interval">{t('fsrs.basicParams.maxInterval.label')}</label>
      <span class="param-hint">{t('fsrs.basicParams.maxInterval.description')}</span>
    </div>
    <div class="slider-container">
      <input
        id="fsrs6-max-interval"
        type="range"
        min="30"
        max="36500"
        step="1"
        value={parameters.maxInterval}
        onchange={handleMaxIntervalChange}
        class="modern-slider"
      />
      <span class="slider-value">{formatInterval(parameters.maxInterval)}</span>
    </div>
  </div>

  <!-- 启用随机化 -->
  <div class="row">
    <div class="row-label-section">
      <label for="fsrs6-fuzz">{t('fsrs.basicParams.enableFuzz.label')}</label>
      <span class="param-hint">{t('fsrs.basicParams.enableFuzz.description')}</span>
    </div>
    <label class="modern-switch">
      <input
        id="fsrs6-fuzz"
        type="checkbox"
        checked={parameters.enableFuzz}
        onchange={onFuzzToggle}
      />
      <span class="switch-slider"></span>
    </label>
  </div>

  <!-- 操作按钮 -->
  <div class="action-row">
    <button
      type="button"
      class="icon-button reset-icon-button"
      onclick={onReset}
      title={t('fsrs.advancedSettings.weights.reset')}
      aria-label={t('fsrs.advancedSettings.weights.reset')}
    >
      <EnhancedIcon name="refresh-cw" size="16" />
    </button>
  </div>
</div>

<style>
  .basic-parameters-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
  }

  label {
    font-size: var(--weave-settings-font-size-label, 0.95rem);
    font-weight: 500;
    color: var(--text-normal);
    margin: 0;
    line-height: 1.4;
  }

  .row-label-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .param-hint {
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    color: var(--text-muted);
    line-height: 1.55;
  }

  .slider-container {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    max-width: 400px;
  }

  .modern-slider {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--background-modifier-border);
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .modern-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--interactive-accent);
    cursor: pointer;
    transition: transform 0.2s;
  }

  .modern-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  .modern-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--interactive-accent);
    cursor: pointer;
    border: none;
    transition: transform 0.2s;
  }

  .modern-slider::-moz-range-thumb:hover {
    transform: scale(1.2);
  }

  .slider-value {
    min-width: 60px;
    text-align: right;
    font-size: var(--weave-settings-font-size-label, 0.95rem);
    font-weight: 600;
    color: var(--text-accent);
  }

  .modern-switch {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 24px;
  }

  .modern-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .modern-switch .switch-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--background-modifier-border);
    transition: 0.3s;
    border-radius: 24px;
  }

  .modern-switch .switch-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }

  .modern-switch input:checked + .switch-slider {
    background-color: var(--interactive-accent);
  }

  .modern-switch input:checked + .switch-slider:before {
    transform: translateX(18px);
  }

  .action-row {
    display: flex;
    justify-content: flex-end;
    padding-top: 8px;
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: 4px;
    cursor: pointer;
    transition: color 0.2s ease, background-color 0.2s ease;
  }

  .icon-button:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .icon-button:focus-visible {
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .icon-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  :global(.weave-settings) .basic-parameters-panel .action-row {
    border-top: none;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .row {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .row-label-section {
      width: 100%;
    }

    .slider-container {
      width: 100%;
      max-width: none;
    }
  }
</style>

