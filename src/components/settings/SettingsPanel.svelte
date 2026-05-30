<script lang="ts">
  import { logger } from '../../utils/logger';

  import TabNavigation from "../atoms/TabNavigation.svelte";

  //  高级功能限制
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from "../../services/premium/PremiumFeatureGuard";
  import ActivationPrompt from "../premium/ActivationPrompt.svelte";

  // 重构后的设置组件
  import BasicSettingsSection from "./sections/BasicSettingsSection.svelte";
  import MemoryLearningSettingsSection from "./sections/MemoryLearningSettingsSection.svelte";


  import DataManagementPanel from "./sections/DataManagementPanel.svelte";

  // AnkiConnect 同步面板
  import AnkiConnectPanel from './AnkiConnectPanel.svelte';

  // 新的关于页面组件
  import ProductInfoSection from './components/ProductInfoSection.svelte';
  import WeaveLicenseSettingsPanel from './sections/WeaveLicenseSettingsPanel.svelte';

  // 新版简化卡片解析设置组件
  import SimplifiedParsingSettings from './SimplifiedParsingSettings.svelte';

  // AI配置组件
  import AIConfigSection from './sections/AIConfigSection.svelte';

  // 类型和常量
  import type { PluginExtended } from "./types/settings-types";
  import { SETTINGS_TABS, DEFAULT_ACTIVE_TAB } from "./constants/settings-constants";
  import { showNotification } from "./utils/settings-utils";

  import { onMount, untrack } from 'svelte';
  
  //  导入国际化系统
  import { tr } from "../../utils/i18n";

  interface Props { plugin: PluginExtended }
  let { plugin }: Props = $props();

  //  响应式翻译函数
  let t = $derived($tr);

  // 标签页配置
  let activeTab = $state(DEFAULT_ACTIVE_TAB);
  let isMobile = $state(false);

  // 高级功能守卫
  const premiumGuard = PremiumFeatureGuard.getInstance();
  let isPremium = $state(false);
  
  // 本地响应式状态，用于实时跟踪高级功能预览设置
  let showPremiumFeaturesPreview = $state(untrack(() => plugin.settings.showPremiumFeaturesPreview ?? false));

  // 订阅高级版状态
  $effect(() => {
    const unsubscribe = premiumGuard.isPremiumActive.subscribe(value => {
      isPremium = value;
    });
    return unsubscribe;
  });
  
  // 计算是否显示高级功能预览（已激活或设置中开启了预览）- 使用$derived实现响应式
  let showPremiumFeatures = $derived(isPremium || showPremiumFeaturesPreview);
  
  // 处理高级功能预览设置变更（由子组件调用）
  function handlePremiumFeaturesPreviewToggle(enabled: boolean) {
    showPremiumFeaturesPreview = enabled;
    
    // 如果当前在高级功能标签页且该标签被隐藏，自动切换到默认标签页
    if (PREMIUM_TABS.includes(activeTab) && !enabled && !isPremium) {
      activeTab = DEFAULT_ACTIVE_TAB;
    }
  }

  
  // 根据设置动态过滤标签页（响应式）
  // 高级功能标签页列表（未激活时隐藏）
  const PREMIUM_TABS = ['card-parsing'];

  function canUseSettingsPremiumTab(tabId: string): boolean {
    if (tabId === 'card-parsing') {
      return premiumGuard.canUseFeature(PREMIUM_FEATURES.BATCH_PARSING);
    }
    return true;
  }
  
  let visibleTabs = $derived(
    SETTINGS_TABS.filter(tab => {
      if (isMobile && tab.id === 'anki-connect') {
        return false;
      }
      // 如果是高级功能标签页，检查高级功能状态
      if (PREMIUM_TABS.includes(tab.id)) {
        return showPremiumFeatures;
      }
      return true;
    })
  );



  // 初始化组件
  onMount(() => {
    const updateIsMobile = () => {
      const cls = document.body?.classList;
      isMobile = !!cls && (cls.contains('is-mobile') || cls.contains('is-phone') || cls.contains('is-tablet'));

      if (isMobile && activeTab === 'anki-connect') {
        activeTab = DEFAULT_ACTIVE_TAB;
      }
    };

    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    return () => window.removeEventListener('resize', updateIsMobile);
  });

  // 防抖动保存函数
  let saveTimeout: NodeJS.Timeout | null = null;

  async function save() {
    // 清除之前的定时器
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // 设置新的防抖动定时器
    saveTimeout = setTimeout(async () => {
      try {
        await plugin.saveSettings();
      } catch (error) {
        logger.error('Failed to save settings:', error);
        showNotification({
          message: t('settings.actions.saveFailed'),
          type: 'error'
        });
      }
    }, 300);
  }
</script>

<div class="anki-app settings-root">
  <div class="header">
    <div class="header-text">
      <h1 class="title">{t('settings.title')}</h1>
    </div>
  </div>

  <div class="tabs">
    <TabNavigation items={visibleTabs} activeId={activeTab} onChange={(id) => activeTab = id} />
  </div>

  <!-- About -->
  {#if activeTab === 'about'}
    <div class="about-container">
      <ProductInfoSection {plugin} />
    </div>
  {/if}

  {#if activeTab === 'license'}
    <WeaveLicenseSettingsPanel {plugin} onSave={save} />
  {/if}

  <!-- Basic -->
  {#if activeTab === 'basic'}
    <!-- 使用重构后的基础设置组件 -->
    <BasicSettingsSection 
      {plugin} 
      onPremiumFeaturesPreviewToggle={handlePremiumFeaturesPreviewToggle}
    />
  {/if}

  {#if activeTab === 'memory-learning'}
    <MemoryLearningSettingsSection {plugin} />
  {/if}

  <!-- Simplified Card Parsing Settings -->
  {#if activeTab === 'card-parsing'}
    {#if canUseSettingsPremiumTab('card-parsing')}
      <SimplifiedParsingSettings
        settings={plugin.settings.simplifiedParsing}
        onSettingsChange={(newSettings: any) => {
          plugin.settings.simplifiedParsing = newSettings;
          plugin.saveSettings();
        }}
        {plugin}
      />
    {:else}
      <ActivationPrompt
        featureId={PREMIUM_FEATURES.BATCH_PARSING}
        visible={true}
        onClose={() => { activeTab = DEFAULT_ACTIVE_TAB; }}
      />
    {/if}
  {/if}

  <!-- AI Configuration -->
  {#if activeTab === 'ai-config'}
    <AIConfigSection {plugin} />
  {/if}
  
  <!-- Data Management -->
  {#if activeTab === 'data-management'}
    <DataManagementPanel {plugin} onSave={save} />
  {/if}

  <!-- Anki Connect -->
  {#if activeTab === 'anki-connect'}
    <AnkiConnectPanel {plugin} />
  {/if}

</div>

<style>
  /* 基础布局样式 */
  .settings-root {
    --weave-settings-font-size-title: var(--font-ui-medium, 1rem);
    --weave-settings-font-size-label: var(--font-ui-small, 0.95rem);
    --weave-settings-font-size-desc: var(--font-ui-smaller, 0.85rem);
    --weave-settings-gap-xs: 0.25rem;
    --weave-settings-gap-sm: 0.35rem;
    --weave-settings-gap-md: 0.75rem;
    --weave-settings-gap-lg: 1rem;
    display: flex;
    flex-direction: column;
    gap: var(--weave-settings-gap-lg);
    overflow-y: auto;
    height: 100%;
    pointer-events: auto;
    padding: 0 0 1.5rem;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: var(--weave-settings-gap-sm);
    min-width: 0;
  }

  .title {
    margin: 0;
    font-size: var(--weave-settings-font-size-title);
    font-weight: 700;
    background: var(--anki-gradient-primary);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tabs {
    margin-top: var(--weave-settings-gap-xs);
    position: relative;
    z-index: 0;
  }

  .tabs :global(.weave-tabs) {
    background: transparent;
    border-radius: 0;
    padding: 0;
    gap: var(--weave-settings-gap-sm);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tabs :global(.weave-tabs::-webkit-scrollbar) {
    display: none;
  }

  .tabs :global(.weave-tab) {
    appearance: none;
    -webkit-appearance: none;
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
    color: var(--text-muted);
    transform: none;
    transition: background-color 0.15s ease, color 0.15s ease !important;
    border-radius: var(--radius-s, 8px);
    padding: 0.45rem 0.85rem;
    font-size: var(--weave-settings-font-size-label);
    line-height: 1.35;
    font-weight: 600;
  }

  .tabs :global(.weave-tab:hover:not(.disabled)) {
    background: color-mix(in srgb, var(--background-modifier-hover) 60%, transparent) !important;
    color: var(--text-normal);
    transform: none;
  }

  .tabs :global(.weave-tab.active) {
    background: var(--color-accent, var(--interactive-accent)) !important;
    color: var(--text-on-accent, #ffffff) !important;
    box-shadow: none !important;
    font-weight: 600;
  }

  .tabs :global(.weave-tab.active:hover:not(.disabled)) {
    background: var(--color-accent, var(--interactive-accent)) !important;
    color: var(--text-on-accent, #ffffff) !important;
  }

  /* 关于页面样式 */
  .about-container {
    width: 100%;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* 动画定义 */
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
