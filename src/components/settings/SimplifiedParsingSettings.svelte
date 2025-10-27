<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    SimplifiedParsingSettings,
  } from '../../types/newCardParsingTypes';
  import {
    DEFAULT_SIMPLIFIED_PARSING_SETTINGS,
    DEFAULT_TEMPLATES
  } from '../../types/newCardParsingTypes';
  import type AnkiPlugin from '../../main';

  // 导入拆分后的子组件
  import SymbolConfigPanel from './card-parsing/SymbolConfigPanel.svelte';
  import TemplateManagementPanel from './card-parsing/TemplateManagementPanel.svelte';
  
  // 导入新的批量解析设置面板（扁平化设计）
  import SimpleBatchParsingPanel from './batch-parsing/SimpleBatchParsingPanel.svelte';

  // Props (Svelte 5 Runes 模式)
  interface Props {
    settings?: SimplifiedParsingSettings;
    onSettingsChange?: (settings: SimplifiedParsingSettings) => void;
    plugin?: AnkiPlugin;
  }

  let {
    settings = { ...DEFAULT_SIMPLIFIED_PARSING_SETTINGS },
    onSettingsChange = () => {},
    plugin
  }: Props = $props();

  // 状态管理
  let currentTab = $state('symbols');
  
  // 批量解析配置的响应式状态
  let batchConfig = $state(plugin?.batchParsingManager?.getConfig());

  // 初始化
  onMount(() => {
    // 确保模板系统正确初始化
    if (!settings.templates || settings.templates.length === 0) {
      console.log('[SimplifiedParsingSettings] 初始化默认模板');
      settings.templates = [...DEFAULT_TEMPLATES];
      settings.enableTemplateSystem = true;
      onSettingsChange(settings);
    }
    
    // 初始化批量解析配置
    if (plugin?.batchParsingManager) {
      batchConfig = plugin.batchParsingManager.getConfig();
    }
  });

  // 标签页切换
  function switchTab(tab: string) {
    currentTab = tab;
  }
</script>

<div class="simplified-parsing-settings">
  <!-- 标签页导航 -->
  <div class="tabs-nav">
    <button
      class="tab-button"
      class:active={currentTab === 'symbols'}
      onclick={() => switchTab('symbols')}
    >
      分隔符配置
    </button>
    <button
      class="tab-button"
      class:active={currentTab === 'templates'}
      onclick={() => switchTab('templates')}
    >
      模板管理
    </button>
  </div>

  <!-- 分隔符配置面板 -->
  {#if currentTab === 'symbols'}
    <SymbolConfigPanel
      {settings}
      onSettingsChange={onSettingsChange}
    />

    <!-- 批量解析配置 -->
    {#if plugin?.batchParsingManager && batchConfig}
      <SimpleBatchParsingPanel
        config={batchConfig}
        onConfigChange={(newConfig) => {
          if (plugin.batchParsingManager) {
            plugin.batchParsingManager.updateConfig(newConfig);
            plugin.saveSettings();
            // 重新获取配置，触发响应式更新
            batchConfig = plugin.batchParsingManager.getConfig();
          }
        }}
        app={plugin.app}
        plugin={plugin}
      />
    {/if}
  {/if}

  <!-- 模板管理面板 -->
  {#if currentTab === 'templates'}
    <TemplateManagementPanel
      templates={settings.templates}
      onTemplatesChange={(newTemplates) => {
        settings.templates = newTemplates;
        onSettingsChange(settings);
      }}
      {plugin}
    />
  {/if}
</div>

<style>
  .simplified-parsing-settings {
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .tabs-nav {
    display: flex;
    gap: 2px;
    margin-bottom: var(--tuanki-space-lg);
    background: var(--background-modifier-border);
    border-radius: var(--tuanki-radius-md);
    padding: 4px;
  }

  .tab-button {
    flex: 1;
    padding: var(--tuanki-space-md) var(--tuanki-space-lg);
    background: transparent;
    border: none;
    border-radius: var(--tuanki-radius-sm);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: all 0.2s;
    text-align: center;
  }

  .tab-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .tab-button.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .tabs-nav {
      margin-bottom: var(--tuanki-space-md);
    }

    .tab-button {
      padding: var(--tuanki-space-sm) var(--tuanki-space-md);
      font-size: 0.85rem;
    }
  }

  /* 容器适应性 */
  .simplified-parsing-settings {
    container-type: inline-size;
  }

  @container (max-width: 600px) {
    .tabs-nav {
      flex-direction: column;
      gap: var(--tuanki-space-xs);
    }
  }
</style>
