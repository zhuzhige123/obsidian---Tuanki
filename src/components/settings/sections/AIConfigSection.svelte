<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { WeaveTimerHandle } from "../../../types/timer-handle.js";
  import type WeavePlugin from "../../../main";
  import { DEFAULT_API_URLS, AI_PROVIDER_LABELS, AI_MODEL_OPTIONS, AI_PROVIDER_CAPABILITIES } from "../constants/settings-constants";
  import type { AIProvider } from "../constants/settings-constants";
  import ObsidianIcon from "../../ui/ObsidianIcon.svelte";
  import ObsidianDropdown from "../../ui/ObsidianDropdown.svelte";
  import { Menu, Notice } from 'obsidian';
  import { CustomApiUrlModal } from '../components/CustomApiUrlModal';
  import { CustomModelModal } from '../components/CustomModelModal';
  import { AIServiceFactory } from '../../../services/ai/AIServiceFactory';
  import {
    AI_PROVIDERS,
    applyAIRequestPolicyFromSettings,
    clampAIGlobalParam,
    mergeAIConfigWithDefaults,
    normalizeProviderBaseUrl,
    resolveSettingsSelectedProvider,
    setActiveAIProvider,
    type AIGlobalParamKey,
  } from '../../../services/ai/AIConfigService';
  import {
    buildAIProviderVerificationFingerprintMap,
    invalidateAIProviderVerification
  } from '../utils/ai-config-verification';
  
  //  导入国际化
  import { tr } from '../../../utils/i18n';

  interface Props {
    plugin: WeavePlugin;
  }

  let { plugin }: Props = $props();
  
  //  响应式翻译函数
  let t = $derived($tr);

  const providers: AIProvider[] = [...AI_PROVIDERS];

  // 初始化AI配置
  function initializeAIConfig() {
    return mergeAIConfigWithDefaults(plugin.settings.aiConfig);
  }

  let aiConfig = $state(initializeAIConfig());

  function getInitialSelectedProvider(): AIProvider {
    return resolveSettingsSelectedProvider(aiConfig);
  }

  let selectedProvider = $state<AIProvider>(getInitialSelectedProvider());

  // API密钥显示/隐藏状态
  let showApiKey = $state<Record<AIProvider, boolean>>({
    openai: false,
    gemini: false,
    anthropic: false,
    deepseek: false,
    zhipu: false,
    siliconflow: false,
    xai: false
  });

  // 测试状态
  let testingProvider = $state<AIProvider | null>(null);
  let testResults = $state<Record<AIProvider, { success: boolean; message: string } | null>>({
    openai: null,
    gemini: null,
    anthropic: null,
    deepseek: null,
    zhipu: null,
    siliconflow: null,
    xai: null
  });

  let selectedProviderConfig = $derived(aiConfig.apiKeys?.[selectedProvider]);
  let selectedProviderVerified = $derived(!!selectedProviderConfig?.verified);
  let selectedProviderTesting = $derived(testingProvider === selectedProvider);
  let selectedProviderTestResult = $derived(testResults[selectedProvider]);

  // 保存配置的防抖函数
  let saveTimeout: WeaveTimerHandle | null = null;

  function commitAIConfigToPlugin() {
    plugin.settings.aiConfig = aiConfig;
    applyAIRequestPolicyFromSettings(plugin);
  }

  function schedulePersistAIConfig() {
    if (saveTimeout) {
      window.clearTimeout(saveTimeout);
    }

    saveTimeout = window.setTimeout(async () => {
      saveTimeout = null;
      commitAIConfigToPlugin();
      await plugin.saveSettings();
    }, 500);
  }

  async function persistAIConfigNow() {
    if (saveTimeout) {
      window.clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    commitAIConfigToPlugin();
    await plugin.saveSettings();
  }

  onDestroy(() => {
    if (!saveTimeout) {
      return;
    }

    window.clearTimeout(saveTimeout);
    saveTimeout = null;
    commitAIConfigToPlugin();
    void plugin.saveSettings();
  });

  let providerFingerprints = $state(buildAIProviderVerificationFingerprintMap(providers, aiConfig.apiKeys));

  function selectProvider(provider: AIProvider) {
    if (selectedProvider === provider) {
      return;
    }

    selectedProvider = provider;
    setActiveAIProvider(aiConfig, provider);
    schedulePersistAIConfig();
  }

  function markProviderVerificationDirty(provider: AIProvider) {
    const config = aiConfig.apiKeys?.[provider];
    const currentFingerprint = buildAIProviderVerificationFingerprintMap([provider], aiConfig.apiKeys)[provider];

    if (providerFingerprints[provider] === currentFingerprint) {
      return;
    }

    invalidateAIProviderVerification(config);
    testResults[provider] = null;
    providerFingerprints[provider] = currentFingerprint;
  }

  function updateProviderApiKey(provider: AIProvider, value: string) {
    const config = aiConfig.apiKeys?.[provider];
    if (!config) {
      return;
    }

    config.apiKey = value;
    markProviderVerificationDirty(provider);
    schedulePersistAIConfig();
  }

  function updateProviderModel(provider: AIProvider, value: string) {
    const config = aiConfig.apiKeys?.[provider];
    if (!config) {
      return;
    }

    config.model = value;
    markProviderVerificationDirty(provider);
    schedulePersistAIConfig();
  }

  function updateProviderBaseUrl(provider: AIProvider, value?: string) {
    const config = aiConfig.apiKeys?.[provider];
    if (!config) {
      return;
    }

    config.baseUrl = normalizeProviderBaseUrl(provider, value);
    markProviderVerificationDirty(provider);
    schedulePersistAIConfig();
  }

  function updateGlobalParam(key: AIGlobalParamKey, rawValue: number) {
    if (!aiConfig.globalParams) {
      return;
    }

    aiConfig.globalParams[key] = clampAIGlobalParam(key, rawValue);
    schedulePersistAIConfig();
  }

  // 切换API密钥显示
  function toggleApiKeyVisibility(provider: AIProvider) {
    showApiKey[provider] = !showApiKey[provider];
  }

  function showProviderSelector(event: MouseEvent) {
    const menu = new Menu();

    providers.forEach((provider) => {
      const config = aiConfig.apiKeys?.[provider];
      const isVerified = !!config?.verified;
      const isDefault = provider === aiConfig.defaultProvider;

      menu.addItem((item) => {
        item
          .setTitle(AI_PROVIDER_LABELS[provider])
          .setIcon(
            provider === selectedProvider
              ? 'check'
              : isDefault
                ? 'star'
                : isVerified
                  ? 'shield-check'
                  : 'circle'
          )
          .onClick(() => {
            selectProvider(provider);
          });
      });
    });

    menu.showAtMouseEvent(event);
  }

  // 测试API连接（真实调用API）
  async function testConnection(provider: AIProvider) {
    testingProvider = provider;
    testResults[provider] = null;

    try {
      const config = aiConfig.apiKeys?.[provider];
      if (!config?.apiKey?.trim()) {
        throw new Error(t('aiConfig.apiKeys.testApiKeyMissing'));
      }

      await persistAIConfigNow();

      const service = AIServiceFactory.createService(
        provider as import('../../../types/ai-types').AIProvider,
        plugin
      );
      const success = await service.testConnection();

      if (success) {
        testResults[provider] = {
          success: true,
          message: t('aiConfig.apiKeys.testSuccess')
        };
        config.verified = true;
        config.lastVerified = new Date().toISOString();
        providerFingerprints[provider] = buildAIProviderVerificationFingerprintMap([provider], aiConfig.apiKeys)[provider];
        await persistAIConfigNow();
      } else {
        throw new Error(t('aiConfig.apiKeys.testConnectionFailed'));
      }
    } catch (error) {
      testResults[provider] = {
        success: false,
        message: error instanceof Error ? error.message : t('aiConfig.apiKeys.testConnectionFailed')
      };

      const config = aiConfig.apiKeys?.[provider];
      if (config) {
        invalidateAIProviderVerification(config);
        await persistAIConfigNow();
      }
    } finally {
      testingProvider = null;
    }
  }

  // 显示提供商配置菜单
  function showProviderMenu(provider: AIProvider, event: MouseEvent) {
    const menu = new Menu();
    const hasCustomUrl = !!aiConfig.apiKeys?.[provider]?.baseUrl;

    // 自定义 API 地址
    menu.addItem((item) => {
      item
        .setTitle(hasCustomUrl ? t('aiConfig.apiKeys.menu.editApiUrl') : t('aiConfig.apiKeys.menu.customApiUrl'))
        .setIcon('link')
        .onClick(() => {
          openCustomUrlModal(provider);
        });
    });
    
    // 重置为默认地址（仅在存在自定义 URL 时显示）
    if (hasCustomUrl) {
      menu.addItem((item) => {
        item
          .setTitle(t('aiConfig.apiKeys.menu.resetApiUrl'))
          .setIcon('rotate-ccw')
          .onClick(async () => {
            await resetToDefaultUrl(provider);
          });
      });
    }
    
    // 分割线
    menu.addSeparator();
    
    // 新增自定义AI模型
    menu.addItem((item) => {
      item
        .setTitle(t('aiConfig.apiKeys.menu.addCustomModel'))
        .setIcon('plus')
        .onClick(() => {
          openCustomModelModal(provider);
        });
    });
    
    menu.showAtMouseEvent(event);
  }

  // 显示自定义模型弹窗（Obsidian Modal）
  function openCustomModelModal(provider: AIProvider) {
    const modal = new CustomModelModal(plugin.app, provider, (modelName) => {
      updateProviderModel(provider, modelName);
      new Notice(t('aiConfig.notices.customModelSaved', { model: modelName }), 2000);
    });
    modal.open();
  }

  // 打开自定义URL弹窗（使用Obsidian原生Modal）
  function openCustomUrlModal(provider: AIProvider) {
    const currentUrl = aiConfig.apiKeys?.[provider]?.baseUrl || DEFAULT_API_URLS[provider] || '';
    const modal = new CustomApiUrlModal(
      plugin.app,
      provider,
      currentUrl,
      async (url: string) => {
        updateProviderBaseUrl(provider, url);
        await persistAIConfigNow();
        new Notice(t('aiConfig.notices.apiUrlUpdated', { provider: AI_PROVIDER_LABELS[provider] }), 2000);
      }
    );
    modal.open();
  }

  // 重置为默认URL
  async function resetToDefaultUrl(provider: AIProvider) {
    updateProviderBaseUrl(provider, undefined);
    await persistAIConfigNow();
    new Notice(t('aiConfig.notices.apiUrlReset', { provider: AI_PROVIDER_LABELS[provider] }), 2000);
  }

  // 获取提供商的模型选项
  function getModelOptions(provider: AIProvider) {
    const staticOptions: Array<{ id: string; label: string; description?: string }> =
      (AI_MODEL_OPTIONS[provider] || []).map((opt) => ({
        id: opt.id,
        label: opt.label,
        description: opt.description
      }));
    const configuredModel = aiConfig.apiKeys?.[provider]?.model?.trim();

    if (configuredModel && !staticOptions.some((opt) => opt.id === configuredModel)) {
      staticOptions.unshift({
        id: configuredModel,
        label: configuredModel,
        description: t('aiConfig.apiKeys.customHint')
      });
    }

    return staticOptions;
  }

</script>

<div class="weave-settings settings-section ai-config-section">
  <div class="settings-group">
    <div class="group-header-with-menu">
      <button
        type="button"
        class="provider-selector-button group-title with-accent-bar accent-purple"
        aria-label={t('aiConfig.providers.select')}
        title={t('aiConfig.providers.select')}
        onclick={showProviderSelector}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const buttonRect = e.currentTarget.getBoundingClientRect();
            const syntheticEvent = new MouseEvent('click', {
              clientX: buttonRect.left,
              clientY: buttonRect.bottom,
              bubbles: true
            });
            showProviderSelector(syntheticEvent);
          }
        }}
      >
        <span>{AI_PROVIDER_LABELS[selectedProvider]}</span>
        <ObsidianIcon name="chevron-down" size={16} />
      </button>

      <div class="provider-header-actions">
        {#if selectedProviderVerified}
          <span class="badge badge-success">{t('aiConfig.apiKeys.verified')}</span>
        {/if}
        <button 
          type="button"
          class="provider-menu-btn"
          aria-label={t('aiConfig.apiKeys.menuLabel')}
          title={`${AI_PROVIDER_LABELS[selectedProvider]} ${t('aiConfig.apiKeys.configOptions')}`}
          onclick={(e) => showProviderMenu(selectedProvider, e)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const buttonRect = e.currentTarget.getBoundingClientRect();
              const syntheticEvent = new MouseEvent('click', {
                clientX: buttonRect.left,
                clientY: buttonRect.bottom,
                bubbles: true
              });
              showProviderMenu(selectedProvider, syntheticEvent);
            }
          }}
        >
          <ObsidianIcon name="more-horizontal" size={18} />
        </button>
      </div>
    </div>

    {#if selectedProviderConfig}
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-label">{t('aiConfig.apiKeys.apiKeyLabel')}</div>
        </div>
        <div class="setting-control">
          <div class="input-with-button">
            <input
              type={showApiKey[selectedProvider] ? 'text' : 'password'}
              value={selectedProviderConfig.apiKey}
              oninput={(event) => updateProviderApiKey(selectedProvider, (event.currentTarget as HTMLInputElement).value)}
              placeholder={AI_PROVIDER_CAPABILITIES[selectedProvider].keyPlaceholder}
              class="text-input"
            />
            <button
              type="button"
              class="clickable-icon ai-config-icon-btn"
              onclick={() => toggleApiKeyVisibility(selectedProvider)}
              title={showApiKey[selectedProvider] ? t('aiConfig.apiKeys.hide') : t('aiConfig.apiKeys.show')}
              aria-label={showApiKey[selectedProvider] ? t('aiConfig.apiKeys.hide') : t('aiConfig.apiKeys.show')}
            >
              <ObsidianIcon 
                name={showApiKey[selectedProvider] ? 'eye-off' : 'eye'} 
                size={16} 
              />
            </button>
          </div>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-label">{t('aiConfig.apiKeys.modelListLabel')}</div>
        </div>
        <div class="setting-control">
          <ObsidianDropdown
            options={getModelOptions(selectedProvider).map(opt => ({ id: opt.id, label: opt.label, description: opt.description }))}
            value={selectedProviderConfig.model}
            onchange={(value) => updateProviderModel(selectedProvider, value)}
          />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-label">{t('aiConfig.apiKeys.testConnection')}</div>
        </div>
        <div class="setting-control">
          <div class="test-control-group">
            {#if selectedProviderTestResult}
              <div class="test-result" class:success={selectedProviderTestResult.success} class:error={!selectedProviderTestResult.success}>
                <ObsidianIcon 
                  name={selectedProviderTestResult.success ? 'check-circle' : 'x-circle'} 
                  size={14} 
                />
                <span>{selectedProviderTestResult.message}</span>
              </div>
            {/if}

            <button
              type="button"
              class="clickable-icon ai-config-test-btn"
              onclick={() => testConnection(selectedProvider)}
              disabled={!selectedProviderConfig?.apiKey || selectedProviderTesting}
            >
              {#if selectedProviderTesting}
                <ObsidianIcon name="loader" size={14} />
                <span>{t('aiConfig.apiKeys.testing')}</span>
              {:else}
                <ObsidianIcon name="zap" size={14} />
                <span>{t('aiConfig.apiKeys.testConnection')}</span>
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  {#if aiConfig.globalParams}
  <div class="settings-group">
    <h3 class="group-title with-accent-bar accent-blue">{t('aiConfig.globalParams.title')}</h3>

    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('aiConfig.globalParams.temperature.label')}</div>
        <div class="setting-desc">{t('aiConfig.globalParams.temperature.description')}</div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          min="0"
          max="2"
          step="0.1"
          value={aiConfig.globalParams.temperature}
          oninput={(event) => {
            updateGlobalParam('temperature', parseFloat((event.currentTarget as HTMLInputElement).value));
          }}
          class="text-input number-input"
        />
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('aiConfig.globalParams.maxTokens.label')}</div>
        <div class="setting-desc">{t('aiConfig.globalParams.maxTokens.description')}</div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          min="256"
          max="64000"
          step="100"
          value={aiConfig.globalParams.maxTokens}
          oninput={(event) => {
            updateGlobalParam('maxTokens', parseInt((event.currentTarget as HTMLInputElement).value, 10));
          }}
          class="text-input number-input"
        />
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('aiConfig.globalParams.requestTimeout.label')}</div>
        <div class="setting-desc">{t('aiConfig.globalParams.requestTimeout.description')}</div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          min="5"
          max="600"
          step="5"
          value={aiConfig.globalParams.requestTimeout}
          oninput={(event) => {
            updateGlobalParam('requestTimeout', parseInt((event.currentTarget as HTMLInputElement).value, 10));
          }}
          class="text-input number-input"
        />
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('aiConfig.globalParams.concurrentLimit.label')}</div>
        <div class="setting-desc">{t('aiConfig.globalParams.concurrentLimit.description')}</div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          min="1"
          max="10"
          step="1"
          value={aiConfig.globalParams.concurrentLimit}
          oninput={(event) => {
            updateGlobalParam('concurrentLimit', parseInt((event.currentTarget as HTMLInputElement).value, 10));
          }}
          class="text-input number-input"
        />
      </div>
    </div>
  </div>
  {/if}
</div>

<!-- removed legacy inline custom model modal -->


<style>
  /* 未使用的CSS选择器已清理 */
  .ai-config-section {
    --weave-settings-gap-xs: var(--size-2-1, 0.25rem);
    --weave-settings-gap-sm: var(--size-2-2, 0.5rem);
    --weave-settings-gap-md: var(--size-4-2, 0.75rem);
    --weave-settings-gap-lg: var(--size-4-3, 1rem);
    --weave-settings-gap-xl: var(--size-4-5, 1.5rem);
    --weave-settings-radius-sm: var(--radius-s, 6px);
    --weave-settings-radius-md: var(--radius-m, 10px);
    --weave-settings-radius-lg: var(--radius-l, 14px);
  }

  /* 组标题带菜单按钮 */
  .group-header-with-menu {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--weave-settings-gap-md);
    margin-bottom: 0;
    padding-bottom: var(--weave-settings-gap-sm);
  }

  .group-title {
    display: flex;
    align-items: center;
    gap: var(--weave-settings-gap-sm);
    margin: 0;
    font-size: var(--weave-settings-font-size-title, 1rem);
    font-weight: 600;
  }

  .provider-selector-button {
    padding: 0;
    border: 0 !important;
    outline: none;
    box-shadow: none !important;
    background: transparent !important;
    appearance: none;
    -webkit-appearance: none;
    color: var(--text-normal);
    cursor: pointer;
    text-align: left;
  }

  .provider-selector-button:hover {
    color: var(--interactive-accent);
  }

  .provider-selector-button:focus-visible {
    color: var(--interactive-accent);
  }

  .provider-header-actions {
    display: flex;
    align-items: center;
    gap: var(--weave-settings-gap-sm);
  }

  /* 徽章 */
  .badge {
    padding: var(--weave-settings-gap-xs) var(--weave-settings-gap-sm);
    border-radius: var(--weave-settings-radius-sm);
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    font-weight: 500;
  }


  .badge-success {
    background: var(--color-green);
    color: white;
  }

  .setting-desc {
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    color: var(--text-muted);
    margin-top: var(--weave-settings-gap-xs);
  }

  .number-input {
    max-width: 140px;
  }

  /* 三点菜单按钮 */
  .provider-menu-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--weave-settings-radius-md);
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

  /* 输入框组合 */
  .input-with-button {
    display: flex;
    gap: var(--weave-settings-gap-sm);
    align-items: center;
    width: 100%;
  }

  .text-input {
    flex: 1;
    padding: var(--weave-settings-gap-sm) var(--weave-settings-gap-md);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--weave-settings-radius-md);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: var(--weave-settings-font-size-label, 0.95rem);
  }

  .text-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .ai-config-section button.clickable-icon.ai-config-icon-btn,
  .ai-config-section button.clickable-icon.ai-config-test-btn {
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--weave-settings-gap-xs);
    padding: var(--weave-settings-gap-xs);
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--clickable-icon-radius, var(--radius-s));
    transition: color 0.15s ease, background-color 0.15s ease;
  }

  .ai-config-section button.clickable-icon.ai-config-test-btn {
    padding: var(--weave-settings-gap-xs) var(--weave-settings-gap-sm);
    font-size: var(--weave-settings-font-size-label, 0.95rem);
  }

  .ai-config-section button.clickable-icon.ai-config-icon-btn:hover,
  .ai-config-section button.clickable-icon.ai-config-test-btn:hover:not(:disabled) {
    background-color: var(--background-modifier-hover) !important;
    color: var(--text-normal);
  }

  .ai-config-section button.clickable-icon.ai-config-icon-btn:focus-visible,
  .ai-config-section button.clickable-icon.ai-config-test-btn:focus-visible:not(:disabled) {
    background-color: var(--background-modifier-hover) !important;
    color: var(--text-normal);
    outline: none;
  }

  .ai-config-section button.clickable-icon.ai-config-test-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* 测试控制组 */
  .test-control-group {
    display: flex;
    align-items: center;
    gap: var(--weave-settings-gap-md);
    flex-wrap: wrap;
  }

  .test-result {
    display: inline-flex;
    align-items: center;
    gap: var(--weave-settings-gap-xs);
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
  }

  .test-result.success {
    color: var(--color-green);
  }

  .test-result.error {
    color: var(--color-red);
  }

</style>
