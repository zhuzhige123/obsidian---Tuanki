<script lang="ts">
  /**
   * 虚拟化设置部分组件
   * 
   * 提供虚拟滚动和性能优化的配置选项
   */
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  import { VirtualizationConfigManager } from '../../../services/virtualization-config-manager';
  import type { KanbanVirtualizationConfig, TableVirtualizationConfig } from '../../../types/virtualization-types';
  
  // 🌍 导入国际化
  import { tr } from '../../../utils/i18n';
  
  interface Props {
    onSave?: () => void;
  }
  
  let { onSave }: Props = $props();
  
  // 🌍 响应式翻译函数
  let t = $derived($tr);
  
  // 加载配置
  let kanbanConfig = $state<KanbanVirtualizationConfig>(
    VirtualizationConfigManager.getKanbanConfig()
  );
  
  let tableConfig = $state<TableVirtualizationConfig>(
    VirtualizationConfigManager.getTableConfig()
  );
  
  // 保存配置
  function saveConfig() {
    VirtualizationConfigManager.updateKanbanConfig(kanbanConfig);
    VirtualizationConfigManager.updateTableConfig(tableConfig);
    
    if (onSave) {
      onSave();
    }
  }
  
  // 重置为默认值
  function resetToDefaults() {
    const confirmed = confirm(t('virtualization.resetConfirm'));
    if (confirmed) {
      VirtualizationConfigManager.resetToDefaults();
      kanbanConfig = VirtualizationConfigManager.getKanbanConfig();
      tableConfig = VirtualizationConfigManager.getTableConfig();
      saveConfig();
    }
  }
</script>

<div class="tuanki-settings settings-section virtualization-settings">
  <div class="section-header">
    <h3 class="section-title with-accent-bar accent-pink">
      {t('virtualization.title')}
    </h3>
    <p class="section-description">
      {t('virtualization.description')}
    </p>
  </div>
  
  <!-- 看板视图配置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-blue">
      {t('virtualization.kanban.title')}
    </h4>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.kanban.enableVirtualScroll.label')}</div>
        <div class="setting-description">
          {t('virtualization.kanban.enableVirtualScroll.description')}
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={kanbanConfig.enabled}
            onchange={saveConfig}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.kanban.enableColumnVirtualization.label')}</div>
        <div class="setting-description">
          {t('virtualization.kanban.enableColumnVirtualization.description')}
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={kanbanConfig.enableColumnVirtualization}
            disabled={!kanbanConfig.enabled}
            onchange={saveConfig}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.kanban.overscan.label')}</div>
        <div class="setting-description">
          {t('virtualization.kanban.overscan.description')}
        </div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          bind:value={kanbanConfig.overscan}
          min="0"
          max="20"
          onchange={saveConfig}
          class="number-input"
        />
      </div>
    </div>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.kanban.initialBatchSize.label')}</div>
        <div class="setting-description">
          {t('virtualization.kanban.initialBatchSize.description')}
        </div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          bind:value={kanbanConfig.initialCardsPerColumn}
          min="10"
          max="100"
          onchange={saveConfig}
          class="number-input"
        />
      </div>
    </div>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.kanban.loadMoreBatchSize.label')}</div>
        <div class="setting-description">
          {t('virtualization.kanban.loadMoreBatchSize.description')}
        </div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          bind:value={kanbanConfig.batchSize}
          min="10"
          max="50"
          onchange={saveConfig}
          class="number-input"
        />
      </div>
    </div>
  </div>
  
  <!-- 表格视图配置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-cyan">
      {t('virtualization.table.title')}
    </h4>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.table.enableVirtualScroll.label')}</div>
        <div class="setting-description">
          {t('virtualization.table.enableVirtualScroll.description')}
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={tableConfig.enabled}
            onchange={saveConfig}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.table.enableTableVirtualization.label')}</div>
        <div class="setting-description">
          {t('virtualization.table.enableTableVirtualization.description')}
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={tableConfig.enableVirtualScroll}
            disabled={!tableConfig.enabled}
            onchange={saveConfig}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.table.paginationThreshold.label')}</div>
        <div class="setting-description">
          {t('virtualization.table.paginationThreshold.description')}
        </div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          bind:value={tableConfig.paginationThreshold}
          min="100"
          max="2000"
          step="100"
          onchange={saveConfig}
          class="number-input"
        />
      </div>
    </div>
  </div>
  
  <!-- 高级选项 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-purple">
      {t('virtualization.advanced.title')}
    </h4>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.advanced.cacheItemHeight.label')}</div>
        <div class="setting-description">
          {t('virtualization.advanced.cacheItemHeight.description')}
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={kanbanConfig.measurementCache}
            onchange={saveConfig}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.advanced.estimatedItemHeight.label')}</div>
        <div class="setting-description">
          {t('virtualization.advanced.estimatedItemHeight.description')}
        </div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          bind:value={kanbanConfig.estimatedItemSize}
          min="100"
          max="500"
          step="10"
          onchange={() => {
            // 同步到表格配置
            tableConfig.estimatedItemSize = kanbanConfig.estimatedItemSize;
            saveConfig();
          }}
          class="number-input"
        />
      </div>
    </div>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('virtualization.advanced.resetSettings.label')}</div>
        <div class="setting-description">
          {t('virtualization.advanced.resetSettings.description')}
        </div>
      </div>
      <div class="setting-control">
        <button class="reset-btn" onclick={resetToDefaults}>
          <EnhancedIcon name="rotate-ccw" size={14} />
          {t('virtualization.resetButton')}
        </button>
      </div>
    </div>
  </div>
  
  <!-- 性能提示 -->
  <div class="performance-tips">
    <div class="tip-header">
      <EnhancedIcon name="info" size={16} />
      <span>{t('virtualization.tips.title')}</span>
    </div>
    <ul class="tip-list">
      <li>{t('virtualization.tips.tip1')}</li>
      <li>{t('virtualization.tips.tip2')}</li>
      <li>{t('virtualization.tips.tip3')}</li>
      <li>{t('virtualization.tips.tip4')}</li>
    </ul>
  </div>
</div>

<style>
  /* 侧边颜色条样式 */
  .section-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .section-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 80%;
    border-radius: 2px;
  }

  .section-title.accent-pink::before {
    background: linear-gradient(135deg, rgba(236, 72, 153, 0.8), rgba(219, 39, 119, 0.6));
  }

  /* 子标题颜色条样式 */
  .group-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
  }

  .group-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 80%;
    border-radius: 2px;
  }

  .group-title.accent-blue::before {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.6));
  }

  .group-title.accent-cyan::before {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.8), rgba(14, 165, 233, 0.6));
  }

  .group-title.accent-purple::before {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(147, 51, 234, 0.6));
  }

  .section-header {
    margin-bottom: 2rem;
  }
  
  .section-header .section-title {
    margin: 0 0 0.5rem 0;
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--text-normal);
  }
  
  .section-description {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  
  .settings-group {
    margin-bottom: 2rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: var(--radius-m);
  }
  
  .group-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
    font-weight: 500;
    color: var(--text-normal);
  }
  
  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .setting-item:last-child {
    border-bottom: none;
  }
  
  .setting-info {
    flex: 1;
  }
  
  .setting-label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: 500;
    color: var(--text-normal);
  }
  
  .setting-description {
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
  
  .setting-control {
    flex-shrink: 0;
  }
  
  /* Number Input */
  .number-input {
    width: 80px;
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.875rem;
    text-align: center;
    transition: all 0.2s;
  }
  
  .number-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }
  
  .number-input:hover {
    border-color: var(--text-muted);
  }
  
  /* Toggle Switch */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    cursor: pointer;
  }
  
  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  .toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--background-modifier-border);
    border-radius: 24px;
    transition: all 0.2s;
  }
  
  .toggle-slider::before {
    content: '';
    position: absolute;
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background: white;
    border-radius: 50%;
    transition: all 0.2s;
  }
  
  .toggle-switch input:checked + .toggle-slider {
    background: var(--interactive-accent);
  }
  
  .toggle-switch input:checked + .toggle-slider::before {
    transform: translateX(20px);
  }
  
  .toggle-switch input:disabled + .toggle-slider {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Reset Button */
  .reset-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--text-normal);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .reset-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }
  
  /* Performance Tips */
  .performance-tips {
    padding: 1rem;
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-secondary));
    border-left: 3px solid var(--interactive-accent);
    border-radius: var(--radius-s);
  }
  
  .tip-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    font-weight: 500;
    color: var(--text-normal);
  }
  
  .tip-list {
    margin: 0;
    padding-left: 1.5rem;
    color: var(--text-muted);
    font-size: 0.875rem;
    line-height: 1.6;
  }
  
  .tip-list li {
    margin-bottom: 0.5rem;
  }
  
  .tip-list li:last-child {
    margin-bottom: 0;
  }
  
  /* Responsive */
  @media (max-width: 768px) {
    .setting-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
    
    .setting-control {
      width: 100%;
      display: flex;
      justify-content: flex-end;
    }
  }
</style>

