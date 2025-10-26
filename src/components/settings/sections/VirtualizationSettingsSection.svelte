<script lang="ts">
  /**
   * 虚拟化设置部分组件
   * 
   * 提供虚拟滚动和性能优化的配置选项
   */
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  import { VirtualizationConfigManager } from '../../../services/virtualization-config-manager';
  import type { KanbanVirtualizationConfig, TableVirtualizationConfig } from '../../../types/virtualization-types';
  
  interface Props {
    onSave?: () => void;
  }
  
  let { onSave }: Props = $props();
  
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
    const confirmed = confirm('确定要重置所有虚拟化设置为默认值吗？');
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
      性能优化
    </h3>
    <p class="section-description">
      配置虚拟滚动和渲染优化，提升大量卡片时的性能表现
    </p>
  </div>
  
  <!-- 看板视图配置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-blue">
      看板视图设置
    </h4>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">启用虚拟滚动</div>
        <div class="setting-description">
          在看板列内启用虚拟滚动，大幅提升大量卡片时的性能（推荐 >200 张卡片时启用）
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
        <div class="setting-label">列内虚拟化</div>
        <div class="setting-description">
          单独对每一列启用虚拟滚动（关闭后仍可使用渐进加载）
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
        <div class="setting-label">预渲染数量 (Overscan)</div>
        <div class="setting-description">
          视口外预渲染的卡片数量，增加可减少滚动时的白屏，但会占用更多内存
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
        <div class="setting-label">初始加载数量</div>
        <div class="setting-description">
          每列初始加载的卡片数量（非虚拟化模式下有效）
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
        <div class="setting-label">批量加载数量</div>
        <div class="setting-description">
          点击"加载更多"时一次加载的卡片数量
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
      表格视图设置
    </h4>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">启用虚拟滚动</div>
        <div class="setting-description">
          在表格视图启用虚拟滚动（当前默认使用分页）
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
        <div class="setting-label">启用表格虚拟滚动</div>
        <div class="setting-description">
          对表格行启用虚拟滚动（需先启用虚拟滚动）
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
        <div class="setting-label">分页阈值</div>
        <div class="setting-description">
          少于此数量时使用分页而非虚拟滚动（推荐 500）
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
      高级选项
    </h4>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">缓存测量高度</div>
        <div class="setting-description">
          缓存卡片的测量高度以提升性能（推荐开启）
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
        <div class="setting-label">估算项目高度</div>
        <div class="setting-description">
          虚拟滚动的初始高度估算值（像素）
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
        <div class="setting-label">重置设置</div>
        <div class="setting-description">
          将所有虚拟化设置重置为默认值
        </div>
      </div>
      <div class="setting-control">
        <button class="reset-btn" onclick={resetToDefaults}>
          <EnhancedIcon name="rotate-ccw" size={14} />
          重置为默认
        </button>
      </div>
    </div>
  </div>
  
  <!-- 性能提示 -->
  <div class="performance-tips">
    <div class="tip-header">
      <EnhancedIcon name="info" size={16} />
      <span>性能优化提示</span>
    </div>
    <ul class="tip-list">
      <li>虚拟滚动在卡片数量超过 200 张时自动启用，无需手动干预</li>
      <li>增加 Overscan 值可减少滚动时的白屏，但会增加内存占用</li>
      <li>表格视图推荐使用分页模式，除非需要快速浏览大量数据</li>
      <li>启用高度缓存可显著提升滚动性能，但会占用少量内存</li>
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

