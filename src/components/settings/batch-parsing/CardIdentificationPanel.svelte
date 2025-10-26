<!--
  卡片识别系统配置面板
  全局UUID配置，用于所有卡片创建方式的去重
-->
<script lang="ts">
  import type { SimpleBatchParsingConfig } from '../../../services/batch-parsing';
  import type { UUIDConfig } from '../../../services/batch-parsing';

  interface Props {
    config: SimpleBatchParsingConfig;
    onConfigChange: (config: SimpleBatchParsingConfig) => void;
  }

  let { config, onConfigChange }: Props = $props();

  function updateConfig(updates: Partial<SimpleBatchParsingConfig>) {
    onConfigChange({ ...config, ...updates });
  }

  function updateEnabled(enabled: boolean) {
    updateConfig({
      uuid: {
        ...config.uuid,
        enabled
      }
    });
  }

  function updateUUIDOption<K extends keyof UUIDConfig>(key: K, value: UUIDConfig[K]) {
    updateConfig({
      uuid: {
        ...config.uuid,
        [key]: value
      }
    });
  }

  let showHelp = $state(false);

  // UUID格式示例
  const formatExamples = {
    comment: '<!-- tuanki-uuid-550e8400-e29b-41d4-a716-446655440000 -->',
    frontmatter: 'uuid: tuanki-uuid-550e8400-e29b-41d4-a716-446655440000',
    'inline-code': '`tuanki-uuid-550e8400-e29b-41d4-a716-446655440000`'
  };

  const positionExamples = {
    'before-card': `<!-- UUID -->
---tuanki/start---
问题内容
---div---
答案内容`,
    'after-card': `---tuanki/start---
问题内容
---div---
答案内容
<!-- UUID -->`,
    'in-metadata': `---tuanki/start---
<!-- UUID -->
问题内容
---div---
答案内容`
  };

  const strategyDescriptions = {
    skip: {
      label: '跳过重复',
      description: '检测到重复UUID时，跳过该卡片的导入，不创建新卡片',
      useCase: '适用于：防止意外重复导入'
    },
    update: {
      label: '更新现有',
      description: '检测到重复UUID时，更新已存在的卡片内容',
      useCase: '适用于：同步更新笔记变更'
    },
    'create-new': {
      label: '创建新卡片',
      description: '检测到重复UUID时，生成新UUID并创建新卡片',
      useCase: '适用于：允许同一内容创建多张卡片'
    }
  };
</script>

<div class="card-identification-panel">
  <div class="section-title">
    <div class="title-bar"></div>
    <h3>卡片识别系统</h3>
  </div>

  <div class="section-desc">
    为卡片分配唯一标识符，防止重复导入，支持卡片更新追踪。适用于批量解析和单卡创建。
  </div>

  {#if showHelp}
    <div class="help-box">
      <h4>工作原理</h4>
      <div class="help-content">
        <div class="help-item">
          <strong>首次解析：</strong>为每张卡片生成UUID并插入到源文件
        </div>
        <div class="help-item">
          <strong>后续解析：</strong>检测UUID，识别已导入的卡片
        </div>
        <div class="help-item">
          <strong>重复处理：</strong>根据策略决定跳过、更新或创建新卡片
        </div>
      </div>
      <div class="warning-box">
        <strong>注意：</strong>启用后会自动修改源文件内容插入UUID标记。虽然这些标记设计为尽可能不干扰阅读，但仍建议在首次使用前备份重要笔记。
      </div>
    </div>
  {/if}

  <button class="help-toggle" onclick={() => showHelp = !showHelp}>
    {showHelp ? '隐藏' : '显示'}说明
  </button>

  <!-- 启用开关 -->
  <div class="form-group">
    <div class="setting-item featured">
      <div class="setting-info">
        <div class="setting-name">启用卡片识别系统</div>
        <div class="setting-desc">
          在源文件中插入唯一标识符，防止重复导入同一内容
        </div>
      </div>
      <label class="toggle-switch">
        <input
          type="checkbox"
          checked={config.uuid.enabled}
          onchange={(e) => updateEnabled(e.currentTarget.checked)}
        />
        <span class="slider"></span>
      </label>
    </div>
  </div>

  {#if config.uuid.enabled}
    <!-- UUID前缀 -->
    <div class="form-group">
      <label class="field-label" for="uuid-prefix">UUID前缀</label>
      <input
        id="uuid-prefix"
        type="text"
        value={config.uuid.prefix}
        oninput={(e) => updateUUIDOption('prefix', e.currentTarget.value)}
        placeholder="tuanki-uuid-"
      />
      <div class="hint">
        用于识别Tuanki生成的UUID，建议使用易识别的前缀
      </div>
    </div>

    <!-- UUID格式 -->
    <div class="form-group">
      <div class="field-label">UUID格式</div>
      <div class="radio-group">
        {#each Object.entries(formatExamples) as [format, example]}
          <label class="radio-option">
            <input
              type="radio"
              name="uuid-format"
              value={format}
              checked={config.uuid.format === format}
              onchange={() => updateUUIDOption('format', format as any)}
            />
            <div class="radio-content">
              <div class="radio-label">
                {format === 'comment' ? 'HTML注释' : format === 'frontmatter' ? 'Frontmatter' : '行内代码'}
              </div>
              <code class="format-example">{example}</code>
              <div class="format-note">
                {#if format === 'comment'}
                  推荐：不影响笔记渲染，对阅读无干扰
                {:else if format === 'frontmatter'}
                  适合已使用Frontmatter的笔记
                {:else}
                  显示为行内代码，阅读时可见
                {/if}
              </div>
            </div>
          </label>
        {/each}
      </div>
    </div>

    <!-- UUID插入位置 -->
    <div class="form-group">
      <div class="field-label">UUID插入位置</div>
      <div class="radio-group">
        {#each Object.entries(positionExamples) as [position, example]}
          <label class="radio-option">
            <input
              type="radio"
              name="uuid-position"
              value={position}
              checked={config.uuid.insertPosition === position}
              onchange={() => updateUUIDOption('insertPosition', position as any)}
            />
            <div class="radio-content">
              <div class="radio-label">
                {position === 'before-card' ? '卡片前' : position === 'after-card' ? '卡片后' : '元数据中'}
              </div>
              <pre class="position-example">{example}</pre>
            </div>
          </label>
        {/each}
      </div>
    </div>

    <!-- 重复处理策略 -->
    <div class="form-group">
      <div class="field-label">重复UUID处理策略</div>
      <div class="strategy-group">
        {#each Object.entries(strategyDescriptions) as [strategy, info]}
          <label class="strategy-option">
            <input
              type="radio"
              name="uuid-strategy"
              value={strategy}
              checked={config.uuid.duplicateStrategy === strategy}
              onchange={() => updateUUIDOption('duplicateStrategy', strategy as any)}
            />
            <div class="strategy-content">
              <div class="strategy-label">{info.label}</div>
              <div class="strategy-desc">{info.description}</div>
              <div class="strategy-usecase">{info.useCase}</div>
            </div>
          </label>
        {/each}
      </div>
    </div>

    <!-- 高级选项 -->
    <div class="advanced-options">
      <details>
        <summary>高级选项</summary>
        
        <div class="form-group">
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-name">自动修复缺失的UUID</div>
              <div class="setting-desc">
                解析时发现卡片缺少UUID，自动生成并插入
              </div>
            </div>
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={config.uuid.autoFixMissing}
                onchange={(e) => updateUUIDOption('autoFixMissing', e.currentTarget.checked)}
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </details>
    </div>

    <!-- 预览当前配置 -->
    <div class="config-preview">
      <h4>当前配置预览</h4>
      <div class="preview-content">
        <div class="preview-item">
          <span class="preview-label">UUID格式：</span>
          <code class="preview-value">{formatExamples[config.uuid.format]}</code>
        </div>
        <div class="preview-item">
          <span class="preview-label">插入位置：</span>
          <span class="preview-value">
            {config.uuid.insertPosition === 'before-card' ? '卡片前' : 
             config.uuid.insertPosition === 'after-card' ? '卡片后' : '元数据中'}
          </span>
        </div>
        <div class="preview-item">
          <span class="preview-label">重复策略：</span>
          <span class="preview-value">
            {strategyDescriptions[config.uuid.duplicateStrategy].label}
          </span>
        </div>
      </div>
    </div>
  {:else}
    <!-- 未启用时的提示 -->
    <div class="disabled-notice">
      <div class="notice-content">
        <h4>UUID识别功能未启用</h4>
        <p>
          当前每次解析都会创建新卡片，可能导致重复内容。
          启用UUID识别可以：
        </p>
        <ul>
          <li>防止同一笔记被多次导入</li>
          <li>支持更新已导入的卡片</li>
          <li>维护卡片与笔记的对应关系</li>
        </ul>
        <button class="enable-btn" onclick={() => updateEnabled(true)}>
          立即启用
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .card-identification-panel {
    padding: 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* 区块标题样式 */
  .section-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .title-bar {
    width: 4px;
    height: 24px;
    background: var(--interactive-accent);
    border-radius: 2px;
  }

  .section-title h3 {
    margin: 0;
    font-size: 1.1em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .section-desc {
    margin-top: -0.5rem;
    font-size: 0.9em;
    color: var(--text-muted);
    line-height: 1.6;
  }

  /* 帮助说明 */
  .help-toggle {
    align-self: flex-start;
    padding: 0.5rem 1rem;
    background: var(--interactive-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-normal);
    cursor: pointer;
    font-size: 0.85em;
    transition: all 0.2s;
  }

  .help-toggle:hover {
    background: var(--interactive-hover);
  }

  .help-box {
    padding: 1.5rem;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
  }

  .help-box h4 {
    margin: 0 0 1rem 0;
    font-size: 1em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .help-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .help-item {
    font-size: 0.9em;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .help-item strong {
    color: var(--text-normal);
  }

  .warning-box {
    padding: 1rem;
    background: var(--background-modifier-warning, rgba(255, 193, 7, 0.1));
    border-left: 3px solid var(--text-warning, #ffc107);
    border-radius: 4px;
    font-size: 0.9em;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .warning-box strong {
    color: var(--text-warning, #ffc107);
  }

  /* 表单样式 */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field-label {
    font-weight: 500;
    color: var(--text-normal);
    font-size: 0.9em;
  }

  input[type="text"] {
    width: 100%;
    padding: 0.6rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9em;
    font-family: var(--font-monospace);
  }

  .hint {
    font-size: 0.875em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  /* 设置项样式 */
  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
  }

  .setting-item.featured {
    border: 2px solid var(--interactive-accent);
    background: var(--background-primary);
  }

  .setting-info {
    flex: 1;
  }

  .setting-name {
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: var(--text-normal);
    font-size: 1em;
  }

  .setting-desc {
    font-size: 0.875em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  /* 统一的开关样式 */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 24px;
    margin-left: 1rem;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
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

  .slider:before {
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

  input:checked + .slider {
    background-color: var(--interactive-accent);
  }

  input:checked + .slider:before {
    transform: translateX(18px);
  }

  /* 单选组 */
  .radio-group,
  .strategy-group {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .radio-option,
  .strategy-option {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .radio-option:hover,
  .strategy-option:hover {
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .radio-option:has(input:checked),
  .strategy-option:has(input:checked) {
    border-color: var(--interactive-accent);
    border-width: 2px;
    background: var(--background-primary);
  }

  .radio-option input[type="radio"],
  .strategy-option input[type="radio"] {
    margin-top: 0.25rem;
    cursor: pointer;
  }

  .radio-content,
  .strategy-content {
    flex: 1;
  }

  .radio-label,
  .strategy-label {
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 0.5rem;
  }

  .format-example,
  .position-example {
    display: block;
    margin: 0.5rem 0;
    padding: 0.5rem;
    background: var(--background-primary);
    border-radius: 4px;
    font-family: var(--font-monospace);
    font-size: 0.85em;
    color: var(--text-muted);
    overflow-x: auto;
  }

  .position-example {
    white-space: pre;
    line-height: 1.5;
  }

  .format-note {
    font-size: 0.85em;
    color: var(--text-faint);
    margin-top: 0.25rem;
  }

  .strategy-desc {
    font-size: 0.9em;
    color: var(--text-muted);
    line-height: 1.5;
    margin-bottom: 0.5rem;
  }

  .strategy-usecase {
    font-size: 0.85em;
    color: var(--text-faint);
    font-style: italic;
  }

  /* 高级选项 */
  .advanced-options details {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 1rem;
  }

  .advanced-options summary {
    font-weight: 600;
    color: var(--text-normal);
    cursor: pointer;
    user-select: none;
  }

  .advanced-options summary:hover {
    color: var(--interactive-accent);
  }

  /* 配置预览 */
  .config-preview {
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
  }

  .config-preview h4 {
    margin: 0 0 1rem 0;
    font-size: 0.95em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .preview-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .preview-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9em;
  }

  .preview-label {
    color: var(--text-muted);
    min-width: 100px;
  }

  .preview-value {
    font-weight: 500;
    color: var(--text-normal);
  }

  code.preview-value {
    background: var(--background-primary);
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    font-family: var(--font-monospace);
    font-size: 0.9em;
  }

  /* 禁用提示 */
  .disabled-notice {
    padding: 1.5rem;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
  }

  .notice-content h4 {
    margin: 0 0 0.75rem 0;
    font-size: 1em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .notice-content p {
    margin: 0.5rem 0;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .notice-content ul {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
    color: var(--text-muted);
  }

  .notice-content li {
    margin-bottom: 0.5rem;
  }

  .enable-btn {
    margin-top: 1rem;
    padding: 0.6rem 1.5rem;
    background: var(--interactive-accent);
    border: none;
    border-radius: 4px;
    color: white;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .enable-btn:hover {
    opacity: 0.9;
  }
</style>

