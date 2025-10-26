<script lang="ts">
  import type AnkiPlugin from "../../../main";
  import { DEFAULT_AI_CONFIG } from "../constants/settings-constants";
  import APIKeyConfig from "./ai-config/APIKeyConfig.svelte";
  import PromptTemplateManager from "./ai-config/PromptTemplateManager.svelte";
  import GlobalAIParams from "./ai-config/GlobalAIParams.svelte";
  import ImageGenerationConfig from "./ai-config/ImageGenerationConfig.svelte";
  import SystemPromptConfig from "../ai-config/SystemPromptConfig.svelte";
  import CardSplittingConfig from "./ai-config/CardSplittingConfig.svelte";
  import EnhancedIcon from "../../ui/EnhancedIcon.svelte";

  interface Props {
    plugin: AnkiPlugin;
  }

  let { plugin }: Props = $props();

  // 初始化AI配置，确保所有字段都存在（包括新添加的zhipu和系统提示词配置）
  function initializeAIConfig() {
    const defaultConfig = JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG));
    
    if (!plugin.settings.aiConfig) {
      return defaultConfig;
    }
    
    const existingConfig = plugin.settings.aiConfig as any;
    
    // 🆕 迁移旧版本提示词模板（添加新字段）
    const migratePromptTemplates = (templates: any) => {
      if (!templates) return defaultConfig.promptTemplates;
      
      return {
        official: (templates.official || []).map((t: any) => ({
          ...t,
          useBuiltinSystemPrompt: t.useBuiltinSystemPrompt ?? true,
          description: t.description || '',
          systemPrompt: t.systemPrompt
        })),
        custom: (templates.custom || []).map((t: any) => ({
          ...t,
          useBuiltinSystemPrompt: t.useBuiltinSystemPrompt ?? true,
          description: t.description || '',
          systemPrompt: t.systemPrompt
        }))
      };
    };
    
    // 深度合并配置，确保所有默认字段都存在
    const mergedConfig = {
      ...defaultConfig,
      ...existingConfig,
      apiKeys: {
        ...defaultConfig.apiKeys,
        ...existingConfig.apiKeys
      },
      globalParams: {
        ...defaultConfig.globalParams,
        ...existingConfig.globalParams
      },
      formatting: {
        enabled: existingConfig.formatting?.enabled ?? true  // 仅保留开关
      },
      formattingProvider: existingConfig.formattingProvider,  // 可选字段
      // 🆕 系统提示词配置迁移
      systemPromptConfig: {
        ...defaultConfig.systemPromptConfig,
        ...(existingConfig.systemPromptConfig || {})
      },
      promptTemplates: migratePromptTemplates(existingConfig.promptTemplates),
      imageGeneration: {
        ...defaultConfig.imageGeneration,
        ...existingConfig.imageGeneration
      },
      // 🆕 AI拆分卡片配置迁移
      cardSplitting: {
        ...defaultConfig.cardSplitting,
        ...(existingConfig.cardSplitting || {})
      },
      // 🆕 AI拆分默认提供商迁移
      splittingProvider: existingConfig.splittingProvider
    };
    
    return mergedConfig;
  }

  let aiConfig = $state(initializeAIConfig());

  // 保存配置的防抖函数
  let saveTimeout: NodeJS.Timeout | null = null;
  
  function saveSettings() {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(async () => {
      plugin.settings.aiConfig = aiConfig;
      await plugin.saveSettings();
    }, 500);
  }

  // 监听配置变化并自动保存
  $effect(() => {
    // 监听aiConfig的变化
    if (aiConfig) {
      saveSettings();
    }
  });
</script>

<div class="tuanki-settings settings-section ai-config-section">
  <!-- API密钥配置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-cyan">API密钥配置</h4>
    <APIKeyConfig 
      bind:apiKeys={aiConfig.apiKeys}
      bind:defaultProvider={aiConfig.defaultProvider}
      bind:formattingProvider={aiConfig.formattingProvider}
      bind:splittingProvider={aiConfig.splittingProvider}
      formattingEnabled={aiConfig.formatting.enabled}
      splittingEnabled={aiConfig.cardSplitting?.enabled ?? false}
      {plugin}
    />
  </div>

  <!-- 全局AI参数 - 隐藏UI但保留功能 -->
  <!-- <div class="setting-subsection">
    <h3 class="section-title with-accent-bar accent-blue">全局AI参数</h3>
    <GlobalAIParams 
      bind:globalParams={aiConfig.globalParams}
    />
  </div> -->

  <!-- 系统提示词配置 - 隐藏UI但保留功能 -->
  <!-- <div class="setting-subsection">
    <h3 class="section-title with-accent-bar accent-purple">系统提示词配置</h3>
    <SystemPromptConfig 
      bind:systemPromptConfig={aiConfig.systemPromptConfig}
    />
  </div> -->

  <!-- AI格式化总开关 -->
  <div class="formatting-toggle">
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">
          <EnhancedIcon name="wand-sparkles" size={18} />
          启用AI格式化
        </div>
      </div>
      <div class="setting-item-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={aiConfig.formatting.enabled}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </div>

  <!-- 提示词模板管理 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-green">提示词模板管理</h4>
    <PromptTemplateManager 
      {plugin}
      bind:promptTemplates={aiConfig.promptTemplates}
    />
  </div>

  <!-- 图片生成配置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-orange">图片生成配置</h4>
    <ImageGenerationConfig 
      bind:imageGeneration={aiConfig.imageGeneration}
    />
  </div>

  <!-- AI拆分卡片配置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-purple">AI拆分卡片配置</h4>
    <CardSplittingConfig 
      bind:cardSplitting={aiConfig.cardSplitting}
    />
  </div>
</div>

<style>
  /* AI格式化总开关样式 */
  .formatting-toggle {
    margin-bottom: 2rem;
    padding: 1rem;
    background: var(--tuanki-secondary-bg, var(--background-primary));
    border-radius: var(--radius-m);
    border: 1px solid var(--background-modifier-border);
  }

  .formatting-toggle .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .formatting-toggle .setting-item-info {
    flex: 1;
  }

  .formatting-toggle .setting-item-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    font-size: 1.05em;
    color: var(--text-normal);
    margin-bottom: 0.5rem;
  }

  .formatting-toggle .setting-item-control {
    flex-shrink: 0;
  }

  /* Toggle Switch 样式 */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
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

  .toggle-slider:before {
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

  .toggle-switch input:checked + .toggle-slider {
    background-color: var(--interactive-accent);
  }

  .toggle-switch input:checked + .toggle-slider:before {
    transform: translateX(20px);
  }

  .toggle-switch input:focus + .toggle-slider {
    box-shadow: 0 0 1px var(--interactive-accent);
  }
</style>

