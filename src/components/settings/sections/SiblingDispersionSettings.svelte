<!--
  兄弟卡片分散设置组件（渐进式挖空优化）
  
  职责：
  - 配置渐进式挖空子卡片的智能分散调度功能
  - 基于认知科学研究和Anki最佳实践
  - 提供完整的配置选项和最佳实践指导
  
  功能：
  - 队列生成时过滤
  - 创建时初始分散
  - 复习后动态调整
  - FSRS 调度集成
  
  @version 1.0.0
  @date 2025-12-08
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { logger } from '../../../utils/logger';
  import type WeavePlugin from '../../../main';
  import { tr } from '../../../utils/i18n';
  import type { SiblingDispersionConfig } from '../../../types/plugin-settings';

  interface Props {
    plugin: WeavePlugin;
  }

  let { plugin }: Props = $props();
  let settings = untrack(() => plugin.settings);
  let t = $derived($tr);

  // 默认配置（基于Anki最佳实践）
  const DEFAULT_CONFIG: SiblingDispersionConfig = {
    enabled: true,
    minSpacing: 5,
    spacingPercentage: 0.05,
    filterInQueue: true,
    autoAdjustAfterReview: true,
    respectFuzzRange: true
  };

  // 兄弟分散配置（带默认值）
  let siblingConfig = $state<SiblingDispersionConfig>({
    enabled: settings.studyConfig?.siblingDispersion?.enabled ?? DEFAULT_CONFIG.enabled,
    minSpacing: settings.studyConfig?.siblingDispersion?.minSpacing ?? DEFAULT_CONFIG.minSpacing,
    spacingPercentage: settings.studyConfig?.siblingDispersion?.spacingPercentage ?? DEFAULT_CONFIG.spacingPercentage,
    filterInQueue: settings.studyConfig?.siblingDispersion?.filterInQueue ?? DEFAULT_CONFIG.filterInQueue,
    autoAdjustAfterReview: settings.studyConfig?.siblingDispersion?.autoAdjustAfterReview ?? DEFAULT_CONFIG.autoAdjustAfterReview,
    respectFuzzRange: settings.studyConfig?.siblingDispersion?.respectFuzzRange ?? DEFAULT_CONFIG.respectFuzzRange
  });

  // 保存配置
  async function saveSettings() {
    try {
      // 确保studyConfig存在
      if (!settings.studyConfig) {
        settings.studyConfig = {};
      }

      // 更新配置
      settings.studyConfig.siblingDispersion = { ...siblingConfig };

      // 保存到文件
      plugin.settings = settings;
      await plugin.saveSettings();

logger.info('[兄弟分散设置] 配置已保存:', siblingConfig);
    } catch (error) {
      logger.error('[兄弟分散设置] 保存失败:', error);
      
}
  }

  // 处理启用状态变更
  function handleEnabledChange(event: Event) {
    siblingConfig.enabled = (event.target as HTMLInputElement).checked;
    saveSettings();
    
    if (siblingConfig.enabled) {
}
  }

  // 处理最小间隔变更
  function handleMinSpacingChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 3 && value <= 10) {
      siblingConfig.minSpacing = value;
      saveSettings();
    }
  }

  // 处理动态比例变更
  function handleSpacingPercentageChange(event: Event) {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(value) && value >= 0.03 && value <= 0.10) {
      siblingConfig.spacingPercentage = value;
      saveSettings();
    }
  }

  // 处理队列过滤变更
  function handleFilterInQueueChange(event: Event) {
    siblingConfig.filterInQueue = (event.target as HTMLInputElement).checked;
    saveSettings();
  }

  // 处理自动调整变更
  function handleAutoAdjustChange(event: Event) {
    siblingConfig.autoAdjustAfterReview = (event.target as HTMLInputElement).checked;
    saveSettings();
  }

  // 处理fuzz范围遵守变更
  function handleRespectFuzzChange(event: Event) {
    siblingConfig.respectFuzzRange = (event.target as HTMLInputElement).checked;
    saveSettings();
  }

  // 重置为默认值
  function resetToDefaults() {
    siblingConfig = { ...DEFAULT_CONFIG };
    saveSettings();
    
}

  // 格式化百分比显示
  function formatPercentage(value: number | undefined): string {
    if (value === undefined) return '5%';
    return `${(value * 100).toFixed(0)}%`;
  }
</script>

<div class="weave-settings settings-section sibling-dispersion-settings">
  <!-- 主配置区 -->
  <div class="settings-group">
    <div class="group-title-row">
      <h4 class="group-title with-accent-bar accent-purple">
        {t('settings.siblingDispersion.title') || '兄弟卡片智能分散'}
      </h4>
      <button
        class="icon-button reset-button"
        onclick={resetToDefaults}
        disabled={!siblingConfig.enabled}
        title={t('settings.siblingDispersion.resetButton') || '重置为推荐配置'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
          <path d="M3 21v-5h5"/>
        </svg>
      </button>
    </div>
    
    <div class="group-content">
      <!-- 主开关行 -->
      <div class="row weave-setting-row--toggle">
        <div class="setting-label-group">
          <label for="sibling-enabled" class="setting-label">
            {t('settings.siblingDispersion.enable.label') || '启用智能分散'}
          </label>
          <span class="setting-description">
            {t('settings.siblingDispersion.enable.description') || '自动管理兄弟卡片的学习日期，避免在同一学习会话或相近日期出现'}
          </span>
        </div>
        <label class="modern-switch">
          <input
            id="sibling-enabled"
            type="checkbox"
            checked={siblingConfig.enabled}
            onchange={handleEnabledChange}
          />
          <span class="switch-slider"></span>
        </label>
      </div>

      <!-- 功能开关 -->
      {#if siblingConfig.enabled}
      <!-- 队列过滤 -->
      <div class="row weave-setting-row--toggle">
        <div class="setting-label-group">
          <label for="filter-queue" class="setting-label">
            {t('settings.siblingDispersion.filterInQueue.label') || '队列生成时过滤'}
          </label>
          <span class="setting-description">
            {t('settings.siblingDispersion.filterInQueue.description') || '避免同一学习会话中出现兄弟卡片（立即生效）'}
          </span>
        </div>
        <label class="modern-switch">
          <input
            id="filter-queue"
            type="checkbox"
            checked={siblingConfig.filterInQueue}
            onchange={handleFilterInQueueChange}
            disabled={!siblingConfig.enabled}
          />
          <span class="switch-slider"></span>
        </label>
      </div>

      <!-- P2: 复习后调整 -->
      <div class="row weave-setting-row--toggle">
        <div class="setting-label-group">
          <label for="auto-adjust" class="setting-label">
            {t('settings.siblingDispersion.autoAdjustAfterReview.label') || '复习后动态调整'}
          </label>
          <span class="setting-description">
            {t('settings.siblingDispersion.autoAdjustAfterReview.description') || '复习后自动调整冲突的兄弟卡片due日期'}
          </span>
        </div>
        <label class="modern-switch">
          <input
            id="auto-adjust"
            type="checkbox"
            checked={siblingConfig.autoAdjustAfterReview}
            onchange={handleAutoAdjustChange}
            disabled={!siblingConfig.enabled}
          />
          <span class="switch-slider"></span>
        </label>
      </div>

      <!-- P3: FSRS集成 -->
      <div class="row weave-setting-row--toggle">
        <div class="setting-label-group">
          <label for="respect-fuzz" class="setting-label">
            {t('settings.siblingDispersion.respectFuzzRange.label') || '遵守FSRS的fuzz范围'}
          </label>
          <span class="setting-description">
            {t('settings.siblingDispersion.respectFuzzRange.description') || '仅在FSRS的fuzz范围内调整，不破坏最优复习间隔'}
          </span>
        </div>
        <label class="modern-switch">
          <input
            id="respect-fuzz"
            type="checkbox"
            checked={siblingConfig.respectFuzzRange}
            onchange={handleRespectFuzzChange}
            disabled={!siblingConfig.enabled}
          />
          <span class="switch-slider"></span>
        </label>
      </div>
      {/if}
    </div>
  </div>

  <!-- 核心参数配置 -->
  {#if siblingConfig.enabled}
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-blue">
      {t('settings.siblingDispersion.parameters.title') || '核心参数'}
    </h4>
    
    <div class="group-content">
      <!-- 最小间隔天数 -->
      <div class="row">
        <div class="setting-label-group">
          <label for="min-spacing" class="setting-label">
            {t('settings.siblingDispersion.minSpacing.label') || '最小间隔天数'}
          </label>
          <span class="setting-description">
            {t('settings.siblingDispersion.minSpacing.description') || '兄弟卡片之间的最小时间间隔（推荐：5天）'}
          </span>
        </div>
        <div class="setting-control-group">
          <input
            id="min-spacing"
            type="range"
            min="3"
            max="10"
            step="1"
            value={siblingConfig.minSpacing}
            oninput={handleMinSpacingChange}
            disabled={!siblingConfig.enabled}
            class="modern-slider"
          />
          <span class="setting-value">{siblingConfig.minSpacing} {t('common.timeUnits.days') || '天'}</span>
        </div>
      </div>

      <!-- 动态分散比例 -->
      <div class="row">
        <div class="setting-label-group">
          <label for="spacing-percentage" class="setting-label">
            {t('settings.siblingDispersion.spacingPercentage.label') || '动态分散比例'}
          </label>
          <span class="setting-description">
            {t('settings.siblingDispersion.spacingPercentage.description') || '基于复习间隔的动态调整比例（推荐：5%）'}
          </span>
        </div>
        <div class="setting-control-group">
          <input
            id="spacing-percentage"
            type="range"
            min="0.03"
            max="0.10"
            step="0.01"
            value={siblingConfig.spacingPercentage}
            oninput={handleSpacingPercentageChange}
            disabled={!siblingConfig.enabled}
            class="modern-slider"
          />
          <span class="setting-value">{formatPercentage(siblingConfig.spacingPercentage)}</span>
        </div>
      </div>
    </div>
  </div>
  {/if}

</div>

<style>
  /* 标题样式继承自settings-common.css，这里不需要重复定义 */

  .group-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0;
    padding-bottom: 0.4rem;
  }

  .icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .icon-button:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .icon-button:active:not(:disabled) {
    background: var(--background-modifier-active-hover);
  }

  .icon-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .reset-button svg {
    width: 16px;
    height: 16px;
  }

  /* ===== 设置行 ===== */
  .row {
    align-items: flex-start;
  }

  .setting-label-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-right: 16px;
  }

  .setting-label {
    font-weight: 500;
    color: var(--text-normal);
    font-size: var(--weave-settings-font-size-label, 0.95rem);
    line-height: 1.4;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .setting-description {
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    color: var(--text-muted);
    line-height: 1.55;
  }

  /* ===== 控制元素 ===== */
  .setting-control-group {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 200px;
  }

  .modern-slider {
    flex: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--background-modifier-border);
    border-radius: 3px;
    outline: none;
  }

  .modern-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--interactive-accent);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .modern-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 0 0 4px var(--background-modifier-hover);
  }

  .modern-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: var(--interactive-accent);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .modern-slider::-moz-range-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 0 0 4px var(--background-modifier-hover);
  }

  .modern-slider:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .setting-value {
    font-weight: 600;
    color: var(--interactive-accent);
    min-width: 50px;
    text-align: right;
    font-size: 13px;
  }

  /* ===== 响应式设计 ===== */
  @media (max-width: 768px) {
    .row {
      flex-direction: column;
      align-items: stretch;
    }

    .setting-label-group {
      margin-right: 0;
      margin-bottom: 12px;
    }

    .setting-control-group {
      min-width: auto;
      width: 100%;
    }
  }
</style>
