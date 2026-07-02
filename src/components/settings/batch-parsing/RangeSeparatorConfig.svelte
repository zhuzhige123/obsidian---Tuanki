<script lang="ts">
  /**
   * 范围分隔符配置组件
   *
   * 共享组件：用于配置卡片范围的分隔方式
   * - 支持自定义文本分隔符
   * - 支持空行分隔符
   * - 支持正反面分隔符（标题型卡片分隔符时隐藏）
   */

  import { tr } from '../../../utils/i18n';

  let t = $derived($tr);

  export interface RangeSeparatorConfigValue {
    cardSeparator?: string;
    frontBackSeparator?: string;
    emptyLineSeparator?: {
      enabled: boolean;
      lineCount: number;
    };
  }

  interface Props {
    config: RangeSeparatorConfigValue;
    name?: string;
    hideFrontBack?: boolean;
    onChange?: (config: RangeSeparatorConfigValue) => void;
  }

  let {
    config,
    name = 'separator-type',
    hideFrontBack = false,
    onChange,
  }: Props = $props();

  const safeEmptyLineSeparator = $derived(
    config.emptyLineSeparator || { enabled: false, lineCount: 2 }
  );

  const safeCardSeparator = $derived(config.cardSeparator || '<->');
  const safeFrontBackSeparator = $derived(config.frontBackSeparator ?? '---div---');

  function emitChange(updates: Partial<RangeSeparatorConfigValue>) {
    onChange?.({
      ...config,
      ...updates,
      emptyLineSeparator: updates.emptyLineSeparator ?? config.emptyLineSeparator,
    });
  }

  function switchToCustomSeparator() {
    emitChange({
      emptyLineSeparator: {
        enabled: false,
        lineCount: safeEmptyLineSeparator.lineCount,
      },
    });
  }

  function switchToEmptyLineSeparator() {
    emitChange({
      emptyLineSeparator: {
        enabled: true,
        lineCount: safeEmptyLineSeparator.lineCount,
      },
    });
  }

  function updateLineCount(count: number) {
    emitChange({
      emptyLineSeparator: {
        enabled: true,
        lineCount: count,
      },
    });
  }

  function updateCardSeparator(separator: string) {
    emitChange({ cardSeparator: separator });
  }

  function updateFrontBackSeparator(separator: string) {
    emitChange({ frontBackSeparator: separator });
  }
</script>

<div class="range-separator-config">
  <div class="form-group">
    <div class="form-label">{t('dataManagement.batchScan.separator.cardSeparatorMethod')}</div>
    <div class="separator-type-switch">
      <label class="switch-option">
        <input
          type="radio"
          {name}
          checked={!safeEmptyLineSeparator.enabled}
          onchange={switchToCustomSeparator}
        />
        <span>{t('dataManagement.batchScan.separator.useCustomSeparator')}</span>
      </label>
      <label class="switch-option">
        <input
          type="radio"
          {name}
          checked={safeEmptyLineSeparator.enabled}
          onchange={switchToEmptyLineSeparator}
        />
        <span>{t('dataManagement.batchScan.separator.useEmptyLine')}</span>
      </label>
    </div>
  </div>

  {#if safeEmptyLineSeparator.enabled}
    <div class="form-group">
      <label for="empty-line-count">{t('dataManagement.batchScan.separator.emptyLineCount')}</label>
      <input
        type="number"
        id="empty-line-count"
        min="1"
        max="10"
        value={safeEmptyLineSeparator.lineCount}
        onchange={(e) => updateLineCount(parseInt(e.currentTarget.value) || 2)}
        placeholder={t('dataManagement.batchScan.separator.emptyLineCountPlaceholder')}
      />
      <small class="help-text">{t('dataManagement.batchScan.separator.emptyLineCountHelp')}</small>
    </div>
  {:else}
    <div class="form-group">
      <label for="card-separator">{t('dataManagement.batchScan.separator.cardRangeSeparator')}</label>
      <input
        type="text"
        id="card-separator"
        value={safeCardSeparator}
        oninput={(e) => updateCardSeparator(e.currentTarget.value)}
        placeholder={t('dataManagement.batchScan.separator.cardRangeSeparatorPlaceholder')}
      />
      <small class="help-text">{t('dataManagement.batchScan.separator.cardRangeSeparatorHelp')}</small>
    </div>
  {/if}

  {#if !hideFrontBack}
    <div class="form-group">
      <label for="front-back-separator">{t('dataManagement.batchScan.separator.frontBackSeparator')}</label>
      <input
        type="text"
        id="front-back-separator"
        value={safeFrontBackSeparator}
        oninput={(e) => updateFrontBackSeparator(e.currentTarget.value)}
        placeholder={t('dataManagement.batchScan.separator.frontBackSeparatorPlaceholder')}
      />
      <small class="help-text">{t('dataManagement.batchScan.separator.frontBackSeparatorHelp')}</small>
    </div>
  {/if}
</div>

<style>
  .range-separator-config {
    display: contents;
  }

  .separator-type-switch {
    display: flex;
    gap: 12px;
    padding: 8px 0;
  }

  .switch-option {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    transition: all 0.2s;
  }

  .switch-option:hover {
    background: var(--background-modifier-hover);
  }

  .switch-option input[type="radio"] {
    margin: 0;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label,
  .form-label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .form-group input[type="text"],
  .form-group input[type="number"] {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
  }

  .help-text {
    display: block;
    margin-top: 4px;
    font-size: 0.875em;
    color: var(--text-muted);
  }
</style>
