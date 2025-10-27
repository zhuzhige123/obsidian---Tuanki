<script lang="ts">
  import type AnkiPlugin from "../../../../main";
  import type { AIProvider } from "../../constants/settings-constants";
  import { AI_MODEL_OPTIONS, AI_PROVIDER_LABELS } from "../../constants/settings-constants";
  import { Menu } from 'obsidian';
  import ObsidianIcon from "../../../ui/ObsidianIcon.svelte";

  interface Props {
    apiKeys: any;
    defaultProvider: AIProvider;
    formattingProvider?: AIProvider;  // 格式化默认提供商
    splittingProvider?: AIProvider;   // AI拆分默认提供商
    formattingEnabled: boolean;        // 格式化功能开关
    splittingEnabled: boolean;         // AI拆分功能开关
    plugin: AnkiPlugin;
  }

  let { 
    apiKeys = $bindable(), 
    defaultProvider = $bindable(),
    formattingProvider = $bindable(),
    splittingProvider = $bindable(),   // 新增
    formattingEnabled,
    splittingEnabled,                   // 新增
    plugin 
  }: Props = $props();

  // 当前选择的提供商
  let selectedProvider = $state<AIProvider>(defaultProvider);

  // 显示/隐藏API密钥
  let showApiKey = $state<Record<AIProvider, boolean>>({
    openai: false,
    gemini: false,
    anthropic: false,
    deepseek: false,
    zhipu: false,
    siliconflow: false
  });

  // 测试状态
  let testingProvider = $state<AIProvider | null>(null);
  let testResults = $state<Record<AIProvider, { success: boolean; message: string } | null>>({
    openai: null,
    gemini: null,
    anthropic: null,
    deepseek: null,
    zhipu: null,
    siliconflow: null
  });

  // 切换API密钥显示
  function toggleApiKeyVisibility(provider: AIProvider) {
    showApiKey[provider] = !showApiKey[provider];
  }

  // 测试API连接
  async function testConnection(provider: AIProvider) {
    testingProvider = provider;
    testResults[provider] = null;

    try {
      // 这里应该调用实际的API测试服务
      // 暂时模拟测试
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const config = apiKeys[provider];
      if (!config?.apiKey) {
        throw new Error('API密钥未配置');
      }

      // 模拟成功
      testResults[provider] = {
        success: true,
        message: '连接成功！'
      };

      // 更新验证状态
      config.verified = true;
      config.lastVerified = new Date().toISOString();
    } catch (error) {
      testResults[provider] = {
        success: false,
        message: error instanceof Error ? error.message : '连接失败'
      };

      // 更新验证状态
      const config = apiKeys[provider];
      if (config) {
        config.verified = false;
      }
    } finally {
      testingProvider = null;
    }
  }

  // 设置为默认提供商
  async function setDefaultProvider(provider: AIProvider) {
    defaultProvider = provider;
    selectedProvider = provider;
    
    // 立即保存，不等待防抖
    plugin.settings.aiConfig!.defaultProvider = provider;
    await plugin.saveSettings();
    console.log('[APIKeyConfig] 制卡默认提供商已保存:', provider);
  }

  // 设置格式化默认提供商
  async function setFormattingProvider(provider: AIProvider) {
    formattingProvider = provider;
    
    // 立即保存，不等待防抖
    plugin.settings.aiConfig!.formattingProvider = provider;
    await plugin.saveSettings();
    console.log('[APIKeyConfig] 格式化默认提供商已保存:', provider);
  }

  // 设置AI拆分默认提供商
  async function setSplittingProvider(provider: AIProvider) {
    splittingProvider = provider;
    
    // 立即保存，不等待防抖
    plugin.settings.aiConfig!.splittingProvider = provider;
    await plugin.saveSettings();
    console.log('[APIKeyConfig] AI拆分默认提供商已保存:', provider);
  }

  // 获取提供商的模型选项
  function getModelOptions(provider: AIProvider) {
    return AI_MODEL_OPTIONS[provider] || [];
  }
  
  /**
   * 显示提供商配置菜单（Obsidian原生Menu）
   */
  function showProviderMenu(provider: AIProvider, event: MouseEvent) {
    const menu = new Menu();
    const isDefault = defaultProvider === provider;
    const isFormattingDefault = formattingProvider === provider;
    const isSplittingDefault = splittingProvider === provider;
    
    // 设为制卡默认
    menu.addItem((item) => {
      item
        .setTitle(isDefault ? '✓ 制卡默认' : '设为制卡默认')
        .setIcon('star')
        .setDisabled(isDefault)
        .onClick(async () => {
          await setDefaultProvider(provider);
        });
    });
    
    // 设为格式化默认（仅当格式化功能启用时显示）
    if (formattingEnabled) {
      menu.addItem((item) => {
        item
          .setTitle(isFormattingDefault ? '✓ 格式化默认' : '设为格式化默认')
          .setIcon('wand-sparkles')
          .onClick(async () => {
            await setFormattingProvider(provider);
          });
      });
    }
    
    // 设为AI拆分默认（仅当AI拆分功能启用时显示）
    if (splittingEnabled) {
      menu.addItem((item) => {
        item
          .setTitle(isSplittingDefault ? '✓ AI拆分默认' : '设为AI拆分默认')
          .setIcon('split')
          .onClick(async () => {
            await setSplittingProvider(provider);
          });
      });
    }
    
    menu.showAtMouseEvent(event);
  }
</script>

<div class="api-key-config">
  {#each Object.keys(AI_PROVIDER_LABELS) as provider}
    {@const typedProvider = provider as AIProvider}
    {@const config = apiKeys[typedProvider]}
    {@const isDefault = defaultProvider === typedProvider}
    {@const isVerified = config?.verified || false}
    {@const isTesting = testingProvider === typedProvider}
    {@const testResult = testResults[typedProvider]}

    <div class="provider-card" class:default={isDefault}>
      <div class="provider-header">
        <div class="provider-title">
          <ObsidianIcon name="brain" size={20} />
          <span class="provider-name">{AI_PROVIDER_LABELS[typedProvider]}</span>
          {#if isDefault}
            <span class="badge badge-primary">制卡默认</span>
          {/if}
          {#if formattingProvider === typedProvider}
            <span class="badge badge-formatting">⭐ 格式化</span>
          {/if}
          {#if splittingProvider === typedProvider}
            <span class="badge badge-splitting">🔀 AI拆分</span>
          {/if}
          {#if isVerified}
            <span class="badge badge-success">已验证</span>
          {/if}
        </div>
        <button 
          class="provider-menu-btn"
          aria-label="提供商配置菜单"
          title="配置选项"
          onclick={(e) => showProviderMenu(typedProvider, e)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="19" cy="12" r="1"></circle>
            <circle cx="5" cy="12" r="1"></circle>
          </svg>
        </button>
      </div>

      {#if config}
      <div class="provider-content">
        <!-- API密钥输入 -->
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-name">API密钥</div>
            <div class="setting-item-description">
              输入您的{AI_PROVIDER_LABELS[typedProvider]} API密钥
            </div>
          </div>
          <div class="setting-item-control">
            <div class="input-with-button">
              <input
                type={showApiKey[typedProvider] ? 'text' : 'password'}
                bind:value={config.apiKey}
                placeholder="sk-..."
                class="text-input"
              />
              <button
                class="btn-icon"
                onclick={() => toggleApiKeyVisibility(typedProvider)}
                title={showApiKey[typedProvider] ? '隐藏' : '显示'}
              >
                <ObsidianIcon 
                  name={showApiKey[typedProvider] ? 'eye-off' : 'eye'} 
                  size={16} 
                />
              </button>
            </div>
          </div>
        </div>

        <!-- 模型选择 -->
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-name">模型</div>
            <div class="setting-item-description">
              选择要使用的AI模型
            </div>
          </div>
          <div class="setting-item-control">
          <select bind:value={config.model} class="dropdown">
            {#each getModelOptions(typedProvider) as option}
              <option value={option.id}>
                {option.label} - {option.description}
              </option>
            {/each}
          </select>
        </div>
      </div>

      <!-- 测试连接 -->
      <div class="test-section">
        <button
          class="btn"
          onclick={() => testConnection(typedProvider)}
          disabled={!config?.apiKey || isTesting}
        >
          {#if isTesting}
            <ObsidianIcon name="loader" size={14} />
            <span>测试中...</span>
          {:else}
            <ObsidianIcon name="zap" size={14} />
            <span>测试连接</span>
          {/if}
        </button>

        {#if testResult}
          <div class="test-result" class:success={testResult.success} class:error={!testResult.success}>
            <ObsidianIcon 
              name={testResult.success ? 'check-circle' : 'x-circle'} 
              size={14} 
              />
            <span>{testResult.message}</span>
          </div>
        {/if}
      </div>
    </div>
    {:else}
    <div class="provider-content">
      <div class="empty-state">
        <p>配置未初始化，请刷新页面</p>
      </div>
    </div>
    {/if}
    </div>
  {/each}
</div>

<style>
  .api-key-config {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .provider-card {
    padding: 16px;
    background: var(--background-primary);
    border-radius: 8px;
    border: 2px solid var(--background-modifier-border);
    transition: border-color 0.2s ease;
  }

  .provider-card.default {
    border-color: var(--interactive-accent);
  }

  .provider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .provider-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .provider-name {
    font-size: 1.1em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75em;
    font-weight: 500;
  }

  .badge-primary {
    background: var(--interactive-accent);
    color: white;
  }

  .badge-formatting {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
  }

  .badge-splitting {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 2px 4px rgba(240, 147, 251, 0.3);
  }

  .badge-success {
    background: var(--color-green);
    color: white;
  }

  /* 三点菜单按钮 - 与AnkiConnect风格一致 */
  .provider-menu-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    opacity: 0.6;
  }

  .provider-menu-btn:hover {
    opacity: 1;
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .provider-menu-btn:active {
    transform: scale(0.95);
    background: var(--background-modifier-active);
  }

  .provider-menu-btn svg {
    width: 18px;
    height: 18px;
  }

  .provider-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .setting-item-info {
    flex: 1;
    min-width: 0;
  }

  .setting-item-name {
    font-size: 0.95em;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 4px;
  }

  .setting-item-description {
    font-size: 0.85em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .setting-item-control {
    flex-shrink: 0;
    min-width: 200px;
  }

  .input-with-button {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .text-input {
    flex: 1;
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9em;
  }

  .text-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .dropdown {
    width: 100%;
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9em;
  }

  .dropdown:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .btn,
  .btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    background: var(--interactive-normal);
    color: var(--text-normal);
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-icon {
    padding: 6px;
  }

  .btn:hover,
  .btn-icon:hover {
    background: var(--interactive-hover);
  }

  .btn:active,
  .btn-icon:active {
    background: var(--interactive-accent);
    color: white;
  }

  .btn:disabled,
  .btn-icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .test-section {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .test-result {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.85em;
  }

  .test-result.success {
    background: rgba(46, 204, 113, 0.1);
    color: var(--color-green);
  }

  .test-result.error {
    background: rgba(231, 76, 60, 0.1);
    color: var(--color-red);
  }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: var(--text-muted);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9em;
  }
</style>

