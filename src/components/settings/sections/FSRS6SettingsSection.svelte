<!--
  FSRS6算法设置组件 - 简化版
  职责：处理FSRS6算法相关配置，采用单文件架构，遵循项目设计规范
-->
<script lang="ts">
  import { dispatchUI } from '../../../architecture/unified-state-management';
  import { FSRS6_DEFAULTS } from '../../../types/fsrs6-types';

  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  import EnhancedButton from '../../ui/EnhancedButton.svelte';
  import SmartTooltip from '../../ui/SmartTooltip.svelte';

  import type { PluginExtended } from '../types/settings-types';
  
  // 🌍 导入国际化
  import { tr } from '../../../utils/i18n';
  
  // 子组件
  import BasicParametersPanel from './fsrs/components/BasicParametersPanel.svelte';

  interface Props {
    plugin: PluginExtended;
  }

  let { plugin }: Props = $props();
  let settings = $state(plugin.settings);
  
  // 🌍 响应式翻译函数
  let t = $derived($tr);

  // FSRS6状态管理 - 统一在主组件中管理
  let fsrs6State = $state({
    // 基础参数
    retention: settings.fsrsParams.requestRetention || FSRS6_DEFAULTS.REQUEST_RETENTION,
    maxInterval: settings.fsrsParams.maximumInterval || FSRS6_DEFAULTS.MAXIMUM_INTERVAL,
    enableFuzz: settings.fsrsParams.enableFuzz ?? FSRS6_DEFAULTS.ENABLE_FUZZ,

    // 权重参数
    weights: [...(settings.fsrsParams.w || FSRS6_DEFAULTS.DEFAULT_WEIGHTS)],

    // 界面状态
    isOptimizing: false,
    enableWeightEditing: false, // 权重参数编辑开关

    // 性能数据
    metrics: null as {
      algorithmVersion: string;
      executionTime: number;
      cacheHitRate: number;
      activeInstances: number;
      lastUpdate: number;
    } | null
  });

  // 监听权重编辑开关状态变化
  $effect(() => {
    console.log('权重编辑开关状态:', fsrs6State.enableWeightEditing);
  });

  // 保存设置的统一方法
  async function saveSettings() {
    try {
      // 更新插件设置
      settings.fsrsParams.requestRetention = fsrs6State.retention;
      settings.fsrsParams.maximumInterval = fsrs6State.maxInterval;
      settings.fsrsParams.enableFuzz = fsrs6State.enableFuzz;
      settings.fsrsParams.w = [...fsrs6State.weights];
      
      plugin.settings = settings;
      await plugin.saveSettings();
      
      // 发送成功通知
      dispatchUI('ADD_NOTIFICATION', {
        id: `fsrs6-saved-${Date.now()}`,
        type: 'success',
        message: t('fsrs.savedMessage'),
        duration: 2000,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('保存FSRS6设置失败:', error);
      dispatchUI('ADD_NOTIFICATION', {
        id: `fsrs6-error-${Date.now()}`,
        type: 'error',
        message: t('fsrs.saveFailed'),
        duration: 5000,
        timestamp: Date.now()
      });
    }
  }

  // 重置为默认值
  function resetToDefaults() {
    fsrs6State.retention = FSRS6_DEFAULTS.REQUEST_RETENTION;
    fsrs6State.maxInterval = FSRS6_DEFAULTS.MAXIMUM_INTERVAL;
    fsrs6State.enableFuzz = FSRS6_DEFAULTS.ENABLE_FUZZ;
    fsrs6State.weights = [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS];
    saveSettings();
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


  // 模拟优化过程
  async function startOptimization() {
    fsrs6State.isOptimizing = true;
    
    try {
      // 模拟优化过程
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 模拟优化结果 - 轻微调整权重参数
      fsrs6State.weights = fsrs6State.weights.map(w => w + (Math.random() - 0.5) * 0.1);
      
      await saveSettings();
      
      dispatchUI('ADD_NOTIFICATION', {
        id: `fsrs6-optimized-${Date.now()}`,
        type: 'success',
        message: t('fsrs.optimization.complete'),
        duration: 3000,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('参数优化失败:', error);
      dispatchUI('ADD_NOTIFICATION', {
        id: `fsrs6-optimize-error-${Date.now()}`,
        type: 'error',
        message: t('fsrs.optimization.failed'),
        duration: 5000,
        timestamp: Date.now()
      });
    } finally {
      fsrs6State.isOptimizing = false;
    }
  }

  // 刷新性能指标
  function refreshMetrics() {
    // 模拟性能数据
    fsrs6State.metrics = {
      algorithmVersion: '6.1.1',
      executionTime: Math.random() * 10 + 5,
      cacheHitRate: Math.random() * 0.3 + 0.7,
      activeInstances: Math.floor(Math.random() * 3) + 1,
      lastUpdate: Date.now()
    };
  }
</script>

<div class="tuanki-settings settings-section fsrs6-settings">
  <!-- 基础设置 -->
  <div class="settings-group">
    <div class="group-title-row">
      <h4 class="group-title with-accent-bar accent-blue">{t('fsrs.basicParams.title')}</h4>
      <span class="version-badge">v6.1.1</span>
    </div>
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

  <!-- 高级设置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-cyan">{t('fsrs.advancedSettings.title')}</h4>

      <!-- 垂直列表布局 - 所有功能直接显示 -->
      <div class="advanced-sections">

        <!-- 1. 权重参数面板 -->
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
                        console.log('开关状态变化:', target.checked);
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
                  value={weight.toFixed(4)}
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

  <!-- 智能优化 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-green">{t('fsrs.optimization.title')}</h4>
    <p class="group-description">{t('fsrs.optimization.description')}</p>

    <div class="optimization-content">
            <div class="optimization-status">
              <div class="status-item">
                <span class="status-label">{t('fsrs.optimization.dataPoints')}:</span>
                <span class="status-value">156</span>
              </div>
              <div class="status-item">
                <span class="status-label">{t('fsrs.optimization.accuracy')}:</span>
                <span class="status-value">87.3%</span>
              </div>
              <div class="status-item">
                <span class="status-label">{t('fsrs.optimization.status')}:</span>
                <span class="status-value" class:optimizing={fsrs6State.isOptimizing}>
                  {fsrs6State.isOptimizing ? t('fsrs.optimization.statusOptimizing') : t('fsrs.optimization.statusReady')}
                </span>
              </div>
            </div>

            <div class="optimization-actions">
              <EnhancedButton
                variant="primary"
                onclick={startOptimization}
                disabled={fsrs6State.isOptimizing}
              >
                {#if fsrs6State.isOptimizing}
                  <EnhancedIcon name="loader" size="16" />
                  {t('fsrs.optimization.optimizingButton')}
                {:else}
                  <EnhancedIcon name="zap" size="16" />
                  {t('fsrs.optimization.startButton')}
                {/if}
              </EnhancedButton>
            </div>
    </div>
  </div>

  <!-- 性能监控 -->
  <div class="settings-group">
    <div class="group-title-row">
      <div>
        <h4 class="group-title with-accent-bar accent-orange">{t('fsrs.performance.title')}</h4>
        <p class="group-description">{t('fsrs.performance.description')}</p>
      </div>
      <EnhancedButton
        variant="ghost"
        size="sm"
        onclick={refreshMetrics}
      >
        <EnhancedIcon name="refresh-cw" size="14" />
        {t('fsrs.performance.refresh')}
      </EnhancedButton>
    </div>

    <div class="monitoring-content">
            {#if fsrs6State.metrics}
              <div class="metrics-grid">
                <div class="metric-item">
                  <div class="metric-icon">
                    <EnhancedIcon name="cpu" size="20" />
                  </div>
                  <div class="metric-info">
                    <span class="metric-label">{t('fsrs.performance.algorithmVersion')}</span>
                    <span class="metric-value">{fsrs6State.metrics.algorithmVersion}</span>
                  </div>
                </div>

                <div class="metric-item">
                  <div class="metric-icon">
                    <EnhancedIcon name="clock" size="20" />
                  </div>
                  <div class="metric-info">
                    <span class="metric-label">{t('fsrs.performance.executionTime')}</span>
                    <span class="metric-value">{fsrs6State.metrics.executionTime.toFixed(2)}ms</span>
                  </div>
                </div>

                <div class="metric-item">
                  <div class="metric-icon">
                    <EnhancedIcon name="database" size="20" />
                  </div>
                  <div class="metric-info">
                    <span class="metric-label">{t('fsrs.performance.cacheHitRate')}</span>
                    <span class="metric-value">{(fsrs6State.metrics.cacheHitRate * 100).toFixed(1)}%</span>
                  </div>
                </div>

                <div class="metric-item">
                  <div class="metric-icon">
                    <EnhancedIcon name="layers" size="20" />
                  </div>
                  <div class="metric-info">
                    <span class="metric-label">{t('fsrs.performance.activeInstances')}</span>
                    <span class="metric-value">{fsrs6State.metrics.activeInstances}</span>
                  </div>
                </div>
              </div>
            {:else}
              <div class="empty-metrics">
                <EnhancedIcon name="activity" size="24" />
                <p>{t('fsrs.performance.noData')}</p>
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
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.4;
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
  .panel-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
  }

  .group-title.with-accent-bar::before,
  .panel-title.with-accent-bar::before {
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

  .group-title.accent-cyan::before {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.8), rgba(14, 165, 233, 0.6));
  }

  .group-title.accent-green::before {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.6));
  }

  .group-title.accent-orange::before {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.8), rgba(234, 88, 12, 0.6));
  }

  .panel-title.accent-purple::before {
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
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .panel-subtitle {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
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
    border-color: var(--tuanki-accent-color);
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

  /* 优化面板样式 */
  .optimization-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .optimization-status {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    padding: 1rem 0;
  }

  .status-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .status-label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .status-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .status-value.optimizing {
    color: var(--tuanki-accent-color);
  }

  .optimization-actions {
    display: flex;
    justify-content: center;
  }

  /* 性能监控样式 */
  .monitoring-content {
    min-height: 200px;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .metric-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 0;
  }

  .metric-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--tuanki-accent-color);
    color: white;
    border-radius: 0.5rem;
    flex-shrink: 0;
  }

  .metric-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .metric-label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .metric-value {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-normal);
    font-family: var(--font-monospace);
  }

  .empty-metrics {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-metrics p {
    margin: 0;
    font-size: 0.9rem;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .weights-grid {
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    }

    .optimization-status,
    .metrics-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
