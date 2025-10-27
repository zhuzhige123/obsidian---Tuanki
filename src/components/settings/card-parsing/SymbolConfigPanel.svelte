<!--
  符号配置面板组件
  职责：管理卡片解析的符号配置（分隔符、触发标签等）
-->
<script lang="ts">
  import type { SimplifiedParsingSettings } from '../../../types/newCardParsingTypes';

  interface Props {
    settings: SimplifiedParsingSettings;
    onSettingsChange: (settings: SimplifiedParsingSettings) => void;
  }

  let { settings, onSettingsChange }: Props = $props();

  /**
   * 统一的设置更新函数
   * 确保响应式更新和对象引用刷新
   */
  function updateSetting<K extends keyof SimplifiedParsingSettings>(
    key: K,
    value: SimplifiedParsingSettings[K]
  ) {
    console.log(`[SymbolConfigPanel] 更新设置: ${String(key)} =`, value);
    
    // 创建新对象引用（关键！）
    settings = { ...settings, [key]: value };
    
    // 通知父组件
    onSettingsChange(settings);
  }

  /**
   * 更新嵌套的 symbols 对象
   */
  function updateSymbol<K extends keyof SimplifiedParsingSettings['symbols']>(
    key: K,
    value: SimplifiedParsingSettings['symbols'][K]
  ) {
    console.log(`[SymbolConfigPanel] 更新符号: ${String(key)} =`, value);
    
    // 创建新的嵌套对象引用
    settings = {
      ...settings,
      symbols: {
        ...settings.symbols,
        [key]: value
      }
    };
    
    onSettingsChange(settings);
  }

  /**
   * 更新嵌套的 batchParsing 对象
   */
  function updateBatchParsing<K extends keyof SimplifiedParsingSettings['batchParsing']>(
    key: K,
    value: SimplifiedParsingSettings['batchParsing'][K]
  ) {
    console.log(`[SymbolConfigPanel] 更新批量解析配置: ${String(key)} =`, value);
    
    // 创建新的嵌套对象引用
    settings = {
      ...settings,
      batchParsing: {
        ...settings.batchParsing,
        [key]: value
      }
    };
    
    onSettingsChange(settings);
  }
</script>

<div class="tuanki-settings symbol-config-content">
  <h3 class="section-title with-accent-bar accent-purple">全局分隔符配置</h3>
  
  <!-- 通用分隔符配置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-cyan">通用分隔符</h4>
    <div class="symbol-grid">
      <div>
        <label for="faceDelimiter">正反面分隔符</label>
        <input
          type="text"
          id="faceDelimiter"
          value={settings.symbols.faceDelimiter}
          oninput={(e) => updateSymbol('faceDelimiter', e.currentTarget.value)}
        />
        <small class="help-text">分隔卡片正面和背面内容</small>
      </div>
      <div>
        <label for="clozeMarker">挖空标记</label>
        <input
          type="text"
          id="clozeMarker"
          value={settings.symbols.clozeMarker}
          oninput={(e) => updateSymbol('clozeMarker', e.currentTarget.value)}
        />
        <small class="help-text">挖空题的标记格式</small>
      </div>
    </div>
  </div>

  <!-- 批量解析配置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-blue">批量解析配置</h4>
    
    <!-- 范围分隔符 -->
    <div class="symbol-grid">
      <div>
        <label for="rangeStart">批量范围起始</label>
        <input
          type="text"
          id="rangeStart"
          value={settings.symbols.rangeStart}
          oninput={(e) => updateSymbol('rangeStart', e.currentTarget.value)}
          placeholder="---tuanki/start---"
        />
        <small class="help-text">标记批量解析范围的开始</small>
      </div>
      <div>
        <label for="rangeEnd">批量范围结束</label>
        <input
          type="text"
          id="rangeEnd"
          value={settings.symbols.rangeEnd}
          oninput={(e) => updateSymbol('rangeEnd', e.currentTarget.value)}
          placeholder="---tuanki/end---"
        />
        <small class="help-text">标记批量解析范围的结束</small>
      </div>
      <div>
        <label for="cardDelimiter">卡片分隔符</label>
        <input
          type="text"
          id="cardDelimiter"
          value={settings.symbols.cardDelimiter}
          oninput={(e) => updateSymbol('cardDelimiter', e.currentTarget.value)}
          placeholder="---cd---"
        />
        <small class="help-text">在批量范围内分隔多张卡片</small>
      </div>
    </div>
  </div>
</div>

<style>
  /* 侧边颜色条样式 */
  .section-title.with-accent-bar,
  .group-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
  }

  .section-title.with-accent-bar::before,
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

  .section-title.accent-purple::before {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(147, 51, 234, 0.6));
  }

  .group-title.accent-cyan::before {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.8), rgba(14, 165, 233, 0.6));
  }

  .group-title.accent-blue::before {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.6));
  }

  .symbol-config-content {
    width: 100%;
    box-sizing: border-box;
  }

  .symbol-config-content > .section-title {
    margin: 0 0 1.5rem 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .settings-group {
    background: var(--tuanki-secondary-bg, var(--background-primary));
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .group-title {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .settings-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .settings-group input[type="text"] {
    width: 100%;
    padding: 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 14px;
    transition: border-color 0.2s;
  }

  .settings-group input[type="text"]:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--interactive-accent-hover);
  }

  .symbol-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-top: 15px;
  }

  .help-text {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 4px;
    line-height: 1.3;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .symbol-grid {
      grid-template-columns: 1fr;
      gap: var(--tuanki-space-md);
    }
  }
</style>


