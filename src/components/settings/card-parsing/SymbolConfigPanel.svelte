<!--
  符号配置面板组件
  职责：管理卡片解析的符号配置（分隔符、触发标签等）
-->
<script lang="ts">
  import type { SimplifiedParsingSettings } from '../../../types/newCardParsingTypes';
  import { tr } from '../../../utils/i18n';

  interface Props {
    settings: SimplifiedParsingSettings;
    onSettingsChange: (settings: SimplifiedParsingSettings) => void;
  }

  let { settings, onSettingsChange }: Props = $props();
  let t = $derived($tr);

  /**
   * 统一的设置更新函数
   * 确保响应式更新和对象引用刷新
   */
  function updateSetting<K extends keyof SimplifiedParsingSettings>(
    key: K,
    value: SimplifiedParsingSettings[K]
  ) {
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

  /**
   * 更新排除标签列表
   * 解析逗号分隔的标签字符串
   * 自动移除用户输入的 `#` 符号
   */
  function updateExcludeTags(value: string) {
    // 按逗号分隔，去除空白，移除 # 符号，过滤空值
    const tags = value
      .split(',')
      .map(tag => tag.trim())
      .map(tag => tag.startsWith('#') ? tag.substring(1) : tag)  // 自动移除 `#` 符号
      .filter(tag => tag.length > 0);
    
    updateBatchParsing('excludeTags', tags);
  }
</script>

<div class="symbol-config-panel">
  <!-- 标题栏 -->
  <div class="config-header">
    <div class="config-header-left">
      <h4 class="group-title with-accent-bar accent-purple">{t('settings.cardParsing.dividerConfig.title')}</h4>
    </div>
  </div>

  <!-- 配置内容 -->
  <div class="config-grid">
      <div class="config-item">
        <label for="cardDelimiter" class="config-label">
          {t('settings.cardParsing.dividerConfig.cardSeparator')}
        </label>
        <input
          type="text"
          id="cardDelimiter"
          class="config-input"
          value={settings.symbols.cardDelimiter}
          oninput={(e) => updateSymbol('cardDelimiter', e.currentTarget.value)}
          placeholder="<->"
        />
        <small class="help-text">{t('settings.cardParsing.dividerConfig.cardSeparatorDesc')}</small>
      </div>

      <div class="config-item">
        <label for="faceDelimiter" class="config-label">
          {t('settings.cardParsing.dividerConfig.regex')}
        </label>
        <input
          type="text"
          id="faceDelimiter"
          class="config-input"
          value={settings.symbols.faceDelimiter}
          oninput={(e) => updateSymbol('faceDelimiter', e.currentTarget.value)}
          placeholder="---div---"
        />
        <small class="help-text">{t('settings.cardParsing.dividerConfig.regexDesc')}</small>
      </div>

      <div class="config-item">
        <label for="clozeMarker" class="config-label">
          {t('settings.cardParsing.dividerConfig.marker')}
        </label>
        <input
          type="text"
          id="clozeMarker"
          class="config-input"
          value={settings.symbols.clozeMarker}
          oninput={(e) => updateSymbol('clozeMarker', e.currentTarget.value)}
          placeholder="=="
        />
        <small class="help-text">{t('settings.cardParsing.dividerConfig.markerDesc')}</small>
      </div>
  </div>

  <div class="exclude-section">
    <h5 class="subsection-title">{t('settings.cardParsing.excludeTags.title')}</h5>
    <div class="config-grid">
      <!-- 文件级别排除标签（系统硬编码，只读显示） -->
      <div class="config-item">
        <label for="systemExcludeTags" class="config-label">
          {t('settings.cardParsing.systemExcludeTags.label')}
          <span class="readonly-badge">{t('dataManagement.officialStandard')}</span>
        </label>
        <input
          type="text"
          id="systemExcludeTags"
          class="config-input readonly-input"
          value={t('settings.cardParsing.systemExcludeTags.value')}
          readonly
        />
        <small class="help-text">
          {t('settings.cardParsing.systemExcludeTags.desc')}
        </small>
      </div>

      <!-- 用户自定义排除标签 -->
      <div class="config-item config-item-wide">
        <label for="excludeTags" class="config-label">
          {t('settings.cardParsing.excludeTags.label')}
        </label>
        <input
          type="text"
          id="excludeTags"
          class="config-input"
          value={settings.batchParsing.excludeTags?.join(', ') || ''}
          oninput={(e) => updateExcludeTags(e.currentTarget.value)}
          placeholder={t('settings.cardParsing.excludeTags.placeholder')}
        />
        <small class="help-text">{t('settings.cardParsing.excludeTags.desc')}</small>
      </div>
    </div>
  </div>
</div>

<style>
  /* 根元素 - 完全透明，不干扰父元素样式 */
  .symbol-config-panel {
    width: 100%;
  }

  /* 标题栏样式 */
  .config-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 0 12px 0;
    background: transparent;
    border-bottom: 1px solid var(--background-modifier-border);
    margin-bottom: 16px;
  }

  /*  深色模式 - 增强分隔线可见性 */
  :global(body.theme-dark) .config-header {
    border-bottom-color: rgba(255, 255, 255, 0.15);
  }

  /*  浅色模式 - 增强分隔线可见性 */
  :global(body.theme-light) .config-header {
    border-bottom-color: rgba(0, 0, 0, 0.1);
  }

  .config-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .exclude-section {
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--background-modifier-border);
  }

  .subsection-title {
    margin: 0 0 1rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
  }

  .config-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .config-item-wide {
    grid-column: 1 / -1;
  }

  .config-label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .config-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-monospace);
    font-size: 14px;
    transition: all 0.2s ease;
  }

  /*  深色模式 - 增强输入框边框可见性 */
  :global(body.theme-dark) .config-input {
    border-color: rgba(255, 255, 255, 0.3);
  }

  /*  浅色模式 - 增强输入框边框可见性 */
  :global(body.theme-light) .config-input {
    border-color: rgba(0, 0, 0, 0.25);
  }

  .config-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 3px var(--interactive-accent-hover);
  }

  .config-input:hover {
    border-color: var(--interactive-accent);
  }

  .help-text {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  /* 只读输入框样式 */
  .readonly-input {
    background: var(--background-modifier-form-field-highlighted) !important;
    cursor: not-allowed;
    opacity: 0.8;
  }

  .readonly-badge {
    display: inline-block;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: 500;
    margin-left: 8px;
    vertical-align: middle;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .config-grid {
      grid-template-columns: 1fr;
    }
    
    .readonly-badge {
      font-size: 9px;
      padding: 1px 4px;
    }
  }
</style>


