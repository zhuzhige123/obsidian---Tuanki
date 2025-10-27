<!--
  批量解析扫描范围配置面板
  职责：管理批量解析的自动触发、文件夹包含/排除设置
-->
<script lang="ts">
  import type { SimplifiedParsingSettings } from '../../../types/newCardParsingTypes';
  import { TFolder } from 'obsidian';

  interface Props {
    settings: SimplifiedParsingSettings;
    onSettingsChange: (settings: SimplifiedParsingSettings) => void;
    app: any; // Obsidian App
  }

  let { settings, onSettingsChange, app }: Props = $props();

  // 获取所有文件夹
  function getAllFolders(): string[] {
    const folders: string[] = ['.']; // 根目录
    function traverse(folder: TFolder) {
      if (folder.path !== '/') {
        folders.push(folder.path);
      }
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          traverse(child);
        }
      }
    }
    const root = app.vault.getRoot();
    traverse(root);
    return folders.sort();
  }

  let allFolders = $derived(getAllFolders());

  // 添加包含文件夹
  function addIncludeFolder(folderPath: string) {
    if (!settings.batchParsing.includeFolders.includes(folderPath)) {
      settings.batchParsing.includeFolders = [...settings.batchParsing.includeFolders, folderPath];
      settings = { ...settings }; // 触发响应式更新
      onSettingsChange(settings);
    }
  }

  // 移除包含文件夹
  function removeIncludeFolder(folderPath: string) {
    settings.batchParsing.includeFolders = settings.batchParsing.includeFolders.filter(f => f !== folderPath);
    settings = { ...settings }; // 触发响应式更新
    onSettingsChange(settings);
  }

  // 添加排除文件夹
  function addExcludeFolder(folderPath: string) {
    if (!settings.batchParsing.excludeFolders.includes(folderPath)) {
      settings.batchParsing.excludeFolders = [...settings.batchParsing.excludeFolders, folderPath];
      settings = { ...settings }; // 触发响应式更新
      onSettingsChange(settings);
    }
  }

  // 移除排除文件夹
  function removeExcludeFolder(folderPath: string) {
    settings.batchParsing.excludeFolders = settings.batchParsing.excludeFolders.filter(f => f !== folderPath);
    settings = { ...settings }; // 触发响应式更新
    onSettingsChange(settings);
  }

  // 更新配置
  function updateBatchParsing(key: keyof SimplifiedParsingSettings['batchParsing'], value: any) {
    settings.batchParsing[key] = value;
    settings = { ...settings }; // 触发响应式更新
    onSettingsChange(settings);
  }
  
  // 获取所有牌组
  async function getAllDecks(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await (app as any).dataStorage?.getDecks();
      if (response?.success && response.data) {
        return response.data.map((deck: any) => ({
          id: deck.id,
          name: deck.name
        }));
      }
    } catch (error) {
      console.error('获取牌组列表失败:', error);
    }
    return [];
  }
  
  let decks = $state<Array<{ id: string; name: string }>>([]);
  
  // 异步加载牌组列表
  $effect(() => {
    getAllDecks().then(result => {
      decks = result;
    });
  });

  // 显示/隐藏提示
  let showTips = $state(false);
  
  function toggleTips() {
    showTips = !showTips;
  }

  // 控制文件夹选择器展开状态
  let showIncludeFolderSelector = $state(false);
  let showExcludeFolderSelector = $state(false);
</script>

<div class="settings-panel">
  <div class="section-header">
    <h3 class="section-title">批量解析自动触发</h3>
    <button class="help-btn" onclick={toggleTips} title="使用提示">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="8" cy="8" r="6.5"/>
        <text x="8" y="11.5" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor">?</text>
      </svg>
    </button>
  </div>

  {#if showTips}
    <div class="tips-box">
      <ul>
        <li><strong>自动触发</strong>：编辑文件时自动解析（仅当前文件）</li>
        <li><strong>手动触发</strong>：使用快捷键执行批量解析命令</li>
        <li><strong>快捷键设置</strong>：在 Obsidian 设置 → 快捷键 中搜索"批量解析"</li>
        <li><strong>性能建议</strong>：防抖延迟建议 2000ms，批量处理限制在 50 个文件</li>
      </ul>
    </div>
  {/if}

  <!-- 自动触发配置 -->
  <div class="form-group">
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">启用自动触发</div>
        <div class="setting-item-description">
          在编辑文件时自动检测并解析批量范围（仅限当前活动文件）
        </div>
      </div>
      <div class="setting-item-control">
        <label class="modern-switch">
          <input
            type="checkbox"
            bind:checked={settings.batchParsing.autoTrigger}
            onchange={() => updateBatchParsing('autoTrigger', settings.batchParsing.autoTrigger)}
          />
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>
  </div>

  {#if settings.batchParsing.autoTrigger}
    <div class="form-group subsection">
      <label>防抖延迟（毫秒）</label>
      <input
        type="number"
        bind:value={settings.batchParsing.triggerDebounce}
        min="500"
        max="5000"
        step="100"
        oninput={() => updateBatchParsing('triggerDebounce', settings.batchParsing.triggerDebounce)}
      />
      <div class="hint">
        编辑停止后等待多久才触发解析（建议 1000-3000ms）
      </div>
    </div>

    <div class="form-group subsection">
      <div class="setting-item">
        <div class="setting-item-info">
          <div class="setting-item-name">仅限活动文件</div>
          <div class="setting-item-description">
            自动触发仅对当前正在编辑的文件生效
          </div>
        </div>
        <div class="setting-item-control">
          <label class="modern-switch">
            <input
              type="checkbox"
              bind:checked={settings.batchParsing.onlyActiveFile}
              onchange={() => updateBatchParsing('onlyActiveFile', settings.batchParsing.onlyActiveFile)}
            />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>
    </div>
  {/if}

  <h3 class="section-title">批量解析配置</h3>
  
  <!-- 默认牌组选择 -->
  <div class="form-group">
    <label>默认牌组</label>
    <div class="hint">
      批量解析创建的卡片将默认添加到此牌组。如果不指定，将使用第一个可用牌组。
    </div>
    <select 
      bind:value={settings.batchParsing.defaultDeckId}
      onchange={() => updateBatchParsing('defaultDeckId', settings.batchParsing.defaultDeckId)}
      class="dropdown"
    >
      <option value={undefined}>（使用第一个可用牌组）</option>
      {#each decks as deck}
        <option value={deck.id}>{deck.name}</option>
      {/each}
    </select>
  </div>
  
  <!-- 默认优先级 -->
  <div class="form-group">
    <label>默认优先级</label>
    <div class="hint">
      批量解析创建的卡片的默认优先级（0-10，0为最低）
    </div>
    <input
      type="number"
      bind:value={settings.batchParsing.defaultPriority}
      min="0"
      max="10"
      step="1"
      oninput={() => updateBatchParsing('defaultPriority', settings.batchParsing.defaultPriority)}
    />
  </div>

  <h3 class="section-title">文件夹扫描范围</h3>

  <!-- 包含文件夹 -->
  <div class="form-group">
    <label>包含的文件夹</label>
    <div class="hint">
      指定需要扫描的文件夹。留空则扫描整个库（除排除列表外）。
    </div>

    <div class="folder-list">
      {#each settings.batchParsing.includeFolders as folder}
        <div class="folder-item">
          <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
          <span class="folder-path">{folder === '.' ? '(根目录)' : folder}</span>
          <button
            class="remove-btn"
            onclick={() => removeIncludeFolder(folder)}
            aria-label="移除文件夹"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      {/each}
    </div>

    {#if showIncludeFolderSelector}
      <div class="folder-selector-modal">
        <div class="folder-selector-header">
          <span>选择文件夹</span>
          <button class="close-btn" onclick={() => showIncludeFolderSelector = false}>×</button>
        </div>
        <div class="folder-dropdown">
          {#each allFolders as folder}
            <button
              class="folder-option"
              onclick={() => {
                addIncludeFolder(folder);
                showIncludeFolderSelector = false;
              }}
              disabled={settings.batchParsing.includeFolders.includes(folder)}
            >
              <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
              </svg>
              {folder === '.' ? '(根目录)' : folder}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <button class="add-folder-btn" onclick={() => showIncludeFolderSelector = true}>
      + 添加文件夹
    </button>
  </div>

  <!-- 排除文件夹 -->
  <div class="form-group">
    <label>排除的文件夹</label>
    <div class="hint">
      指定需要排除的文件夹（不会被扫描）
    </div>

    <div class="folder-list">
      {#each settings.batchParsing.excludeFolders as folder}
        <div class="folder-item">
          <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
          <span class="folder-path">{folder === '.' ? '(根目录)' : folder}</span>
          <button
            class="remove-btn"
            onclick={() => removeExcludeFolder(folder)}
            aria-label="移除文件夹"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      {/each}
    </div>

    {#if showExcludeFolderSelector}
      <div class="folder-selector-modal">
        <div class="folder-selector-header">
          <span>选择文件夹</span>
          <button class="close-btn" onclick={() => showExcludeFolderSelector = false}>×</button>
        </div>
        <div class="folder-dropdown">
          {#each allFolders as folder}
            <button
              class="folder-option"
              onclick={() => {
                addExcludeFolder(folder);
                showExcludeFolderSelector = false;
              }}
              disabled={settings.batchParsing.excludeFolders.includes(folder)}
            >
              <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
              </svg>
              {folder === '.' ? '(根目录)' : folder}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <button class="add-folder-btn" onclick={() => showExcludeFolderSelector = true}>
      + 添加文件夹
    </button>
  </div>

  <!-- 批量处理限制 -->
  <div class="form-group">
    <label>单次批量处理最大文件数</label>
    <input
      type="number"
      bind:value={settings.batchParsing.maxFilesPerBatch}
      min="1"
      max="500"
      step="10"
      oninput={() => updateBatchParsing('maxFilesPerBatch', settings.batchParsing.maxFilesPerBatch)}
    />
    <div class="hint">
      手动触发批量解析时，一次最多处理多少个文件（防止性能问题）
    </div>
  </div>

  <!-- 预览统计 -->
  <div class="scope-preview">
    <h4>扫描范围预览</h4>
    <div class="stats">
      <div class="stat-item">
        <span class="stat-label">包含文件夹:</span>
        <span class="stat-value">
          {settings.batchParsing.includeFolders.length || '全部'}
        </span>
      </div>
      <div class="stat-item">
        <span class="stat-label">排除文件夹:</span>
        <span class="stat-value">
          {settings.batchParsing.excludeFolders.length}
        </span>
      </div>
      <div class="stat-item">
        <span class="stat-label">自动触发:</span>
        <span class="stat-value" class:enabled={settings.batchParsing.autoTrigger}>
          {settings.batchParsing.autoTrigger ? '已启用' : '已禁用'}
        </span>
      </div>
    </div>
  </div>
</div>

<style>
  .settings-panel {
    padding: 1rem 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .section-title {
    margin: 2rem 0 1rem 0;
    font-size: 1.1em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .section-header .section-title {
    margin: 0;
  }

  .help-btn {
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .help-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border-color: var(--text-muted);
  }

  .tips-box {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
  }

  .tips-box ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .tips-box li {
    margin-bottom: 0.5rem;
    line-height: 1.5;
    color: var(--text-normal);
  }

  .tips-box strong {
    color: var(--text-accent);
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .subsection {
    margin-left: 2rem;
    padding-left: 1rem;
    border-left: 2px solid var(--background-modifier-border);
  }

  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 0;
  }

  .setting-item-info {
    flex: 1;
  }

  .setting-item-name {
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: var(--text-normal);
  }

  .setting-item-description {
    font-size: 0.875em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .setting-item-control {
    margin-left: 1rem;
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

  .switch-slider {
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

  .switch-slider:before {
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

  input:checked + .switch-slider {
    background-color: var(--interactive-accent);
  }

  input:checked + .switch-slider:before {
    transform: translateX(18px);
  }

  label {
    display: block;
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: var(--text-normal);
  }

  input[type="number"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9em;
  }

  .hint {
    margin-top: 0.5rem;
    font-size: 0.875em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .folder-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 1rem 0;
    max-height: 300px;
    overflow-y: auto;
  }

  .folder-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    transition: background 0.2s;
  }

  .folder-item:hover {
    background: var(--background-modifier-hover);
  }

  .folder-icon {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .folder-path {
    flex: 1;
    font-family: var(--font-monospace);
    font-size: 0.9em;
    color: var(--text-normal);
  }

  .remove-btn {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .remove-btn:hover {
    background: var(--background-modifier-error);
    color: var(--text-error);
  }

  .add-folder-btn {
    width: 100%;
    padding: 0.5rem 1rem;
    background: var(--interactive-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-normal);
    cursor: pointer;
    font-size: 0.9em;
    transition: all 0.2s;
  }

  .add-folder-btn:hover {
    background: var(--interactive-hover);
  }

  .folder-selector-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 500px;
    max-width: 90vw;
    max-height: 70vh;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .folder-selector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
    font-weight: 600;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1.5em;
    line-height: 1;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .folder-dropdown {
    overflow-y: auto;
    padding: 0.5rem;
  }

  .folder-option {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-align: left;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font-family: var(--font-monospace);
    font-size: 0.9em;
    color: var(--text-normal);
    transition: background 0.2s;
    border-radius: 4px;
  }

  .folder-option:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .folder-option:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .scope-preview {
    margin-top: 2rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
  }

  .scope-preview h4 {
    margin: 0 0 1rem 0;
    font-size: 0.95em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-label {
    color: var(--text-muted);
    font-size: 0.9em;
  }

  .stat-value {
    font-weight: 500;
    color: var(--text-normal);
  }

  .stat-value.enabled {
    color: var(--text-success, #10b981);
  }
</style>
