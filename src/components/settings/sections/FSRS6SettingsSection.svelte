<!--
  FSRS6算法设置组件 - 简化版
  职责：处理FSRS6算法相关配置，采用单文件架构，遵循项目设计规范
-->
<script lang="ts">
  import { logger } from '../../../utils/logger';
  import { FSRS6_DEFAULTS } from '../../../types/fsrs6-types';
  import { Notice } from 'obsidian';
  import { showObsidianConfirm } from '../../../utils/obsidian-confirm';
  import type WeavePlugin from '../../../main';
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  import SiblingDispersionSettings from './SiblingDispersionSettings.svelte';

  import { tr as trStore } from '../../../utils/i18n';
  
  // 子组件
  import BasicParametersPanel from './fsrs/components/BasicParametersPanel.svelte';
  
  import { untrack } from 'svelte';

  interface Props {
    plugin: WeavePlugin;
    showSiblingDispersionAfterBasic?: boolean;
  }

  let { plugin, showSiblingDispersionAfterBasic = false }: Props = $props();
  // 直接引用 plugin.settings，避免 $state 代理导致修改无法同步回 plugin.settings
  let settings = untrack(() => plugin.settings);
  
  // 响应式翻译函数
  let t = $derived($trStore);

  // FSRS6状态管理 - 统一在主组件中管理
  let fsrs6State = $state({
    // 基础参数
    retention: settings.fsrsParams.requestRetention || FSRS6_DEFAULTS.REQUEST_RETENTION,
    maxInterval: settings.fsrsParams.maximumInterval || FSRS6_DEFAULTS.MAXIMUM_INTERVAL,
    enableFuzz: settings.fsrsParams.enableFuzz ?? FSRS6_DEFAULTS.ENABLE_FUZZ,

    // 权重参数
    weights: Array.from(settings.fsrsParams.w || FSRS6_DEFAULTS.DEFAULT_WEIGHTS),

    // 界面状态
    enableWeightEditing: false // 权重参数编辑开关
  });

  // 保存设置的统一方法
  async function saveSettings() {
    try {
      // 更新插件设置
      settings.fsrsParams.requestRetention = fsrs6State.retention;
      settings.fsrsParams.maximumInterval = fsrs6State.maxInterval;
      settings.fsrsParams.enableFuzz = fsrs6State.enableFuzz;
      settings.fsrsParams.w = [...fsrs6State.weights];
      
      await plugin.saveSettings();
      plugin.fsrs?.updateParameters({
        w: [...fsrs6State.weights],
        requestRetention: fsrs6State.retention,
        maximumInterval: fsrs6State.maxInterval,
        enableFuzz: fsrs6State.enableFuzz,
      });
} catch (error) {
      logger.error('保存FSRS6设置失败:', error);
}
  }

  // 重置为默认值
  async function resetToDefaults() {
    const resetLabel = t('fsrs.advancedSettings.weights.reset');
    const confirmed = await showObsidianConfirm(
      plugin.app,
      `${resetLabel}?`,
      { title: t('common.confirmReset') }
    );
    if (!confirmed) return;

    fsrs6State.retention = FSRS6_DEFAULTS.REQUEST_RETENTION;
    fsrs6State.maxInterval = FSRS6_DEFAULTS.MAXIMUM_INTERVAL;
    fsrs6State.enableFuzz = FSRS6_DEFAULTS.ENABLE_FUZZ;
    fsrs6State.weights = Array.from(FSRS6_DEFAULTS.DEFAULT_WEIGHTS);
    await saveSettings();
    new Notice(`${resetLabel} ${t('common.success')}`, 2500);
  }







  // 处理目标记忆率变更
  function handleRetentionChange(value: number) {
    if (!isNaN(value) && value >= 0.5 && value <= 0.99) {
      fsrs6State.retention = value;
      saveSettings();
    }
  }

  // 处理最大间隔变更
  function handleMaxIntervalChange(value: number) {
    if (!isNaN(value) && value >= 30 && value <= 36500) {
      fsrs6State.maxInterval = value;
      saveSettings();
    }
  }

  // 处理随机化开关
  function handleFuzzToggle() {
    fsrs6State.enableFuzz = !fsrs6State.enableFuzz;
    saveSettings();
  }

  // 处理权重参数变更
  function handleWeightChange(index: number, event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseFloat(target.value);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      fsrs6State.weights[index] = value;
      saveSettings();
    }
  }
</script>

<div class="weave-settings settings-section fsrs6-settings">
  <!-- 基础设置 -->
  <div class="settings-group">
    <div class="group-title-row">
      <h4 class="group-title with-accent-bar accent-blue">{t('fsrs.basicParams.title')}</h4>
      <span class="version-badge">v6.1.1</span>
    </div>
    <p class="group-description">{t('settings.memoryLearning.fsrsShortTermNote')}</p>
    <div class="group-content">
      <BasicParametersPanel
        parameters={{
          retention: fsrs6State.retention,
          maxInterval: fsrs6State.maxInterval,
          enableFuzz: fsrs6State.enableFuzz
        }}
        onRetentionChange={handleRetentionChange}
        onMaxIntervalChange={handleMaxIntervalChange}
        onFuzzToggle={handleFuzzToggle}
        onReset={resetToDefaults}
      />
    </div>
  </div>

  {#if showSiblingDispersionAfterBasic}
    <SiblingDispersionSettings {plugin} />
  {/if}

  <!-- 权重参数面板 -->
  <div class="settings-group">

    <div class="weights-panel section-panel">
          <div class="panel-header">
            <div class="panel-info">
              <div class="panel-text">
                <h5 class="panel-title with-accent-bar accent-purple">{t('fsrs.advancedSettings.weights.title')}</h5>
                <p class="panel-subtitle">{t('fsrs.advancedSettings.weights.description')}</p>
              </div>
            </div>

            <!-- 权重编辑开关 -->
            <div class="panel-controls">
              <div class="weight-edit-toggle">
                <label class="toggle-label" for="weight-edit-switch">
                  <span class="toggle-text">{t('fsrs.advancedSettings.weights.allowEdit')}</span>
                  <div class="modern-switch">
                    <input
                      id="weight-edit-switch"
                      type="checkbox"
                      checked={fsrs6State.enableWeightEditing}
                      onchange={(e) => {
                        const target = e.target as HTMLInputElement;
                        fsrs6State.enableWeightEditing = target.checked;
                      }}
                    />
                    <span class="switch-slider"></span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div class="weights-grid">
            {#each fsrs6State.weights as weight, index}
              <div class="weight-item">
                <label class="weight-label" for="weight-{index}">w{index}</label>
                <input
                  id="weight-{index}"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={(weight as number).toFixed(4)}
                  onchange={(e) => handleWeightChange(index, e)}
                  class="weight-input"
                  class:disabled={!fsrs6State.enableWeightEditing}
                  disabled={!fsrs6State.enableWeightEditing}
                  readonly={!fsrs6State.enableWeightEditing}
                />
              </div>
            {/each}
          </div>

          <!-- 权重编辑提示 -->
          {#if !fsrs6State.enableWeightEditing}
            <div class="weight-edit-notice">
              <EnhancedIcon name="info" size="14" />
              <span>{t('fsrs.advancedSettings.weights.locked')}</span>
            </div>
          {:else}
            <div class="weight-edit-warning">
              <EnhancedIcon name="alert-triangle" size="14" />
              <span>{t('fsrs.advancedSettings.weights.warning')}</span>
            </div>
          {/if}
    </div>
  </div>

</div>

<style>
  /* 标题行样式 */
  .group-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .group-description {
    margin: 0 0 1rem 0;
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    color: var(--text-muted);
    line-height: 1.55;
  }

  .version-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    background: var(--interactive-accent);
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: var(--radius-s);
    white-space: nowrap;
  }

  /* 侧边颜色条样式 */
  .group-title.with-accent-bar,
  .panel-title.with-accent-bar,
  .history-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
  }

  .group-title.with-accent-bar::before,
  .panel-title.with-accent-bar::before,
  .history-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 80%;
    border-radius: 2px;
  }

  /* 颜色定义 */
  .group-title.accent-blue::before {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.6));
  }

  .group-title.accent-green::before {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.6));
  }

  .panel-title.accent-purple::before,
  .history-title.accent-purple::before {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(147, 51, 234, 0.6));
  }

  /* 滑块和开关样式已在settings-common.css中定义 */

  /* 权重参数面板样式 */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .panel-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .panel-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .panel-title {
    margin: 0;
    font-size: var(--weave-settings-font-size-label, 0.95rem);
    font-weight: 600;
    color: var(--text-normal);
    line-height: 1.4;
  }

  .panel-subtitle {
    margin: 0;
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    color: var(--text-muted);
    line-height: 1.55;
  }

  /* 面板控制区域 */
  .panel-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .weight-edit-toggle {
    display: flex;
    align-items: center;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: background-color 0.2s ease;
  }

  .toggle-label:hover {
    background-color: var(--background-modifier-hover);
  }

  .toggle-text {
    font-size: 0.85rem;
    color: var(--text-normal);
    font-weight: 500;
  }

  /* 权重参数网格 */
  .weights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.75rem;
    max-height: 300px;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .weight-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .weight-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
  }

  .weight-input {
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.8rem;
    font-family: var(--font-monospace);
    transition: all 0.2s ease;
  }

  .weight-input:focus {
    outline: none;
    border-color: var(--weave-accent-color);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
  }

  .weight-input.disabled,
  .weight-input:disabled {
    background: var(--background-modifier-border);
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .weight-input.disabled:hover,
  .weight-input:disabled:hover {
    border-color: var(--background-modifier-border);
  }

  /* 权重编辑提示样式 */
  .weight-edit-notice,
  .weight-edit-warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.85rem;
    margin-top: 1rem;
  }

  .weight-edit-notice {
    color: var(--text-muted);
  }

  .weight-edit-warning {
    background: rgba(255, 193, 7, 0.1);
    color: var(--text-normal);
  }

  @media (max-width: 768px) {
    .weights-grid {
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    }
  }
</style>
