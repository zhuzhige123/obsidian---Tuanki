<script lang="ts">
  import { logger } from '../../../utils/logger';

  import type WeavePlugin from "../../../main";
  import { DEFAULT_AI_CONFIG, DEFAULT_API_URLS } from "../constants/settings-constants";
  import { AI_PROVIDER_LABELS, AI_MODEL_OPTIONS, AI_PROVIDER_CAPABILITIES } from "../constants/settings-constants";
  import type { AIProvider } from "../constants/settings-constants";
  import ObsidianIcon from "../../ui/ObsidianIcon.svelte";
  import ObsidianDropdown from "../../ui/ObsidianDropdown.svelte";
  import { Menu, Notice } from 'obsidian';
  import { CustomApiUrlModal } from '../components/CustomApiUrlModal';
  import { AIServiceFactory } from '../../../services/ai/AIServiceFactory';
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

  // 初始化AI配置
  function initializeAIConfig() {
    const defaultConfig = JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG));
    
    if (!plugin.settings.aiConfig) {
      return defaultConfig;
    }
    
    const existingConfig = plugin.settings.aiConfig as any;
    
    // 深度合并配置
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
      cardSplitting: {
        ...defaultConfig.cardSplitting,
        ...(existingConfig.cardSplitting || {})
      }
    };
    
    return mergedConfig;
  }

  let aiConfig = $state(initializeAIConfig());

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

  // 自定义模型浮窗状态
  let showCustomModelModal = $state(false);
  let modalProvider = $state<AIProvider | null>(null);
  let modalCustomModelName = $state('');

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

  const providers: AIProvider[] = ['openai', 'gemini', 'anthropic', 'deepseek', 'zhipu', 'siliconflow', 'xai'];
  let providerFingerprints = $state(buildAIProviderVerificationFingerprintMap(providers, aiConfig.apiKeys));

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
  }

  function updateProviderModel(provider: AIProvider, value: string) {
    const config = aiConfig.apiKeys?.[provider];
    if (!config) {
      return;
    }

    config.model = value;
    markProviderVerificationDirty(provider);
  }

  function updateProviderBaseUrl(provider: AIProvider, value?: string) {
    const config = aiConfig.apiKeys?.[provider];
    if (!config) {
      return;
    }

    config.baseUrl = value;
    markProviderVerificationDirty(provider);
  }

  // 监听配置变化并自动保存（跳过首次初始化）
  let initialized = false;
  $effect(() => {
    if (aiConfig) {
      if (!initialized) {
        initialized = true;
        return;
      }
      saveSettings();
    }
  });

  // 切换API密钥显示
  function toggleApiKeyVisibility(provider: AIProvider) {
    showApiKey[provider] = !showApiKey[provider];
  }

  // 测试API连接（真实调用API）
  async function testConnection(provider: AIProvider) {
    testingProvider = provider;
    testResults[provider] = null;

    try {
      const config = aiConfig.apiKeys[provider];
      if (!config?.apiKey) {
        throw new Error(t('aiConfig.apiKeys.testFailed'));
      }

      // 先保存当前配置，确保 Factory 能读取到最新的 apiKey/model/baseUrl
      plugin.settings.aiConfig = aiConfig;
      await plugin.saveSettings();

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
      } else {
        throw new Error(t('aiConfig.apiKeys.testFailed'));
      }
    } catch (error) {
      testResults[provider] = {
        success: false,
        message: error instanceof Error ? error.message : t('aiConfig.apiKeys.testFailed')
      };

      const config = aiConfig.apiKeys[provider];
      if (config) {
        invalidateAIProviderVerification(config);
      }
    } finally {
      testingProvider = null;
    }
  }

  // 显示提供商配置菜单
  function showProviderMenu(provider: AIProvider, event: MouseEvent) {
    const menu = new Menu();
    const hasCustomUrl = !!aiConfig.apiKeys[provider].baseUrl; // 检查是否存在自定义 URL

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

  // 显示自定义模型浮窗
  function openCustomModelModal(provider: AIProvider) {
    modalProvider = provider;
    modalCustomModelName = '';
    showCustomModelModal = true;
  }

  // 关闭自定义模型浮窗
  function closeCustomModelModal() {
    showCustomModelModal = false;
    modalProvider = null;
    modalCustomModelName = '';
  }

  // 验证自定义模型名称
  function validateCustomModel(provider: AIProvider, modelName: string): { valid: boolean; message: string } {
    if (!modelName.trim()) {
      return { valid: false, message: t('aiConfig.apiKeys.customModel.emptyError') };
    }

    // 基本格式验证
    const modelNameRegex = /^[a-zA-Z0-9\-._/]+$/;
    if (!modelNameRegex.test(modelName)) {
      return { valid: false, message: t('aiConfig.apiKeys.customModel.invalidCharsError') };
    }

    // 长度检查
    if (modelName.length > 100) {
      return { valid: false, message: t('aiConfig.apiKeys.customModel.tooLongError') };
    }

    return { valid: true, message: t('aiConfig.apiKeys.customModel.validMessage') };
  }

  // 保存自定义模型
  async function saveCustomModel() {
    if (!modalProvider || !modalCustomModelName.trim()) return;
    
    const validation = validateCustomModel(modalProvider, modalCustomModelName);
    if (!validation.valid) {
      logger.error('Model name validation failed:', validation.message);
      return;
    }

    // 更新配置
    const config = aiConfig.apiKeys[modalProvider];
    if (config) {
      updateProviderModel(modalProvider, modalCustomModelName);
    }

    // 保存设置
    plugin.settings.aiConfig = aiConfig;
    await plugin.saveSettings();
    
    closeCustomModelModal();
  }

  // 打开自定义URL弹窗（使用Obsidian原生Modal）
  function openCustomUrlModal(provider: AIProvider) {
    const currentUrl = aiConfig.apiKeys[provider].baseUrl || DEFAULT_API_URLS[provider] || '';
    const modal = new CustomApiUrlModal(
      plugin.app,
      provider,
      currentUrl,
      async (url: string) => {
        updateProviderBaseUrl(provider, url);
        plugin.settings.aiConfig = aiConfig;
        await plugin.saveSettings();
        new Notice(t('aiConfig.notices.apiUrlUpdated', { provider: AI_PROVIDER_LABELS[provider] }), 2000);
      }
    );
    modal.open();
  }

  // 重置为默认URL
  async function resetToDefaultUrl(provider: AIProvider) {
    updateProviderBaseUrl(provider, undefined);
    
    plugin.settings.aiConfig = aiConfig;
    await plugin.saveSettings();
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
  

  <!-- 每个 API 提供商作为独立的 settings-group -->
  {#each providers as provider}
    {@const config = aiConfig.apiKeys[provider]}
    {@const isVerified = config?.verified || false}
    {@const isTesting = testingProvider === provider}
    {@const testResult = testResults[provider]}

    <div class="settings-group">
      <div class="group-header-with-menu">
        <h4 class="group-title with-accent-bar accent-purple">
          <span>{AI_PROVIDER_LABELS[provider]}</span>
          {#if isVerified}
            <span class="badge badge-success">{t('aiConfig.apiKeys.verified')}</span>
          {/if}
          <!-- provider description removed for cleaner UI -->
        </h4>
        <button 
          type="button"
          class="provider-menu-btn"
          aria-label={t('aiConfig.apiKeys.menuLabel')}
          title={t('aiConfig.apiKeys.configOptions')}
          onclick={(e) => showProviderMenu(provider, e)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              // 对于键盘事件，创建一个模拟的MouseEvent用于菜单定位
              const buttonRect = e.currentTarget.getBoundingClientRect();
              const syntheticEvent = new MouseEvent('click', {
                clientX: buttonRect.left,
                clientY: buttonRect.bottom,
                bubbles: true
              });
              showProviderMenu(provider, syntheticEvent);
            }
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="19" cy="12" r="1"></circle>
            <circle cx="5" cy="12" r="1"></circle>
          </svg>
        </button>
      </div>

      {#if config}
        <!-- API密钥 -->
        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{t('aiConfig.apiKeys.apiKeyLabel')}</div>
          </div>
          <div class="setting-control">
            <div class="input-with-button">
              <input
                type={showApiKey[provider] ? 'text' : 'password'}
                value={config.apiKey}
                oninput={(event) => updateProviderApiKey(provider, (event.currentTarget as HTMLInputElement).value)}
                placeholder={AI_PROVIDER_CAPABILITIES[provider].keyPlaceholder}
                class="text-input"
              />
              <button
                class="btn-icon"
                onclick={() => toggleApiKeyVisibility(provider)}
                title={showApiKey[provider] ? t('aiConfig.apiKeys.hide') : t('aiConfig.apiKeys.show')}
              >
                <ObsidianIcon 
                  name={showApiKey[provider] ? 'eye-off' : 'eye'} 
                  size={16} 
                />
              </button>
            </div>
          </div>
        </div>

        <!-- 模型列表 -->
        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{t('aiConfig.apiKeys.modelListLabel')}</div>
          </div>
          <div class="setting-control">
            <ObsidianDropdown
              options={getModelOptions(provider).map(opt => ({ id: opt.id, label: opt.label, description: opt.description }))}
              value={config.model}
              onchange={(value) => updateProviderModel(provider, value)}
            />
          </div>
        </div>

        <!-- 测试连接 -->
        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{t('aiConfig.apiKeys.testConnection')}</div>
          </div>
          <div class="setting-control">
            <div class="test-control-group">
              <button
                class="test-btn"
                onclick={() => testConnection(provider)}
                disabled={!config?.apiKey || isTesting}
              >
                {#if isTesting}
                  <ObsidianIcon name="loader" size={14} />
                  <span>{t('aiConfig.apiKeys.testing')}</span>
                {:else}
                  <ObsidianIcon name="zap" size={14} />
                  <span>{t('aiConfig.apiKeys.testConnection')}</span>
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
        </div>
      {/if}
    </div>
  {/each}
</div>

<!-- 自定义模型浮窗 -->
{#if showCustomModelModal && modalProvider}
  <div class="custom-model-modal" role="dialog" aria-modal="true" aria-labelledby="custom-model-title">
    <div class="modal-header">
      <h3 id="custom-model-title">{t('aiConfig.apiKeys.customModel.title')}</h3>
      <button class="btn-close" onclick={closeCustomModelModal}>
        <ObsidianIcon name="x" size={16} />
      </button>
    </div>
    
    <div class="custom-modal-body">
      <div class="provider-info">
        <span class="provider-name">{AI_PROVIDER_LABELS[modalProvider]}</span>
      </div>
      
      <div class="input-group">
        <label for="custom-model-input">{t('aiConfig.apiKeys.customModel.nameLabel')}</label>
        <input
          id="custom-model-input"
          type="text"
          bind:value={modalCustomModelName}
          placeholder={t('aiConfig.apiKeys.customModel.namePlaceholder')}
          class="text-input"
        />
        
        {#if modalCustomModelName}
          {@const validation = validateCustomModel(modalProvider, modalCustomModelName)}
          <small class="input-hint" class:error={!validation.valid}>
            {validation.message}
          </small>
        {/if}
      </div>
    </div>
    
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick={closeCustomModelModal}>
        {t('aiConfig.apiKeys.customModel.cancel')}
      </button>
      <button 
        class="btn btn-primary" 
        onclick={saveCustomModel}
        disabled={!modalCustomModelName.trim() || !validateCustomModel(modalProvider, modalCustomModelName).valid}
      >
        {t('aiConfig.apiKeys.customModel.save')}
      </button>
    </div>
  </div>
{/if}


<style>
  /* 未使用的CSS选择器已清理 */

  /* 组标题带菜单按钮 */
  .group-header-with-menu {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 0;
    padding-bottom: 0.4rem;
  }

  .group-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  /* 徽章 */
  .badge {
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 0.75em;
    font-weight: 500;
  }


  .badge-success {
    background: var(--color-green);
    color: white;
  }

  /* 三点菜单按钮 */
  .provider-menu-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 10px;
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
    gap: 8px;
    align-items: center;
    width: 100%;
  }

  .text-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9em;
  }

  .text-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border: none;
    border-radius: 4px;
    background: var(--interactive-normal);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-icon:hover {
    background: var(--interactive-hover);
  }

  /* 下拉框 */

  /* 数字输入框 */

  /* 测试控制组 */
  .test-control-group {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .test-btn {
    display: inline-flex;
    align-items: center;
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

  .test-btn:hover {
    background: var(--interactive-hover);
  }

  .test-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  /* Toggle Switch */

  .custom-model-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    z-index: var(--layer-modal, 50);
    animation: modalSlideIn 0.2s ease-out;
  }

  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: translate(-50%, -55%) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.1em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .btn-close {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    border-radius: 4px;
    color: var(--text-muted);
    transition: all 0.2s ease;
  }

  .btn-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .custom-modal-body {
    padding: 20px 24px;
  }

  .provider-info {
    margin-bottom: 16px;
  }

  .provider-name {
    display: inline-block;
    padding: 4px 12px;
    background: var(--interactive-accent-bg);
    color: var(--interactive-accent);
    border-radius: 12px;
    font-size: 0.85em;
    font-weight: 500;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-group label {
    font-weight: 500;
    color: var(--text-normal);
    font-size: 0.9em;
  }

  .input-hint {
    color: var(--text-muted);
    font-size: 0.8em;
    font-style: italic;
    margin-top: 2px;
  }

  .input-hint.error {
    color: var(--text-error);
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding: 16px 24px 20px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid;
    cursor: pointer;
    font-size: 0.9em;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-secondary {
    background: var(--background-primary);
    border-color: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  .btn-primary {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    background: var(--interactive-accent-hover);
    border-color: var(--interactive-accent-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary:disabled:hover {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

</style>
