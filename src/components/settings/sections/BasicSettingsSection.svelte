<!--
  基础设置组件
  职责：处理基础配置项与主界面入口相关设置
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { logger } from '../../../utils/logger';
  import ObsidianDropdown from '../../ui/ObsidianDropdown.svelte';
  import VirtualizationSettingsSection from './VirtualizationSettingsSection.svelte';
  import type WeavePlugin from '../../../main';
  import { PremiumFeatureGuard } from '../../../services/premium/PremiumFeatureGuard';
  // 导入国际化系统
  import { tr } from '../../../utils/i18n';

  interface Props {
    plugin: WeavePlugin;
    onPremiumFeaturesPreviewToggle?: (enabled: boolean) => void;
  }

  let { plugin, onPremiumFeaturesPreviewToggle }: Props = $props();
  let settings = $state(untrack(() => plugin.settings));
  const premiumGuard = PremiumFeatureGuard.getInstance();
  
  // 响应式翻译函数
  let t = $derived($tr);

  // 保存设置的统一方法
  async function saveSettings() {
    try {
      plugin.settings = settings;
      await plugin.saveSettings();
    } catch (error) {
      logger.error('保存设置失败:', error);
    }
  }

  // 处理悬浮按钮设置变更
  function handleFloatingButtonChange(event: Event) {
    const enabled = (event.target as HTMLInputElement).checked;
    settings.showFloatingCreateButton = enabled;
    saveSettings();
    
    // 动态控制悬浮按钮显示
    plugin.toggleFloatingButton(enabled);
  }

  // 处理拖拽调整设置变更
  function handleResizeEnabledChange(event: Event) {
    const editorModalSize = settings.editorModalSize ?? (settings.editorModalSize = {
      preset: 'large',
      rememberLastSize: true,
      enableResize: true
    });
    editorModalSize.enableResize = (event.target as HTMLInputElement).checked;
    saveSettings();
  }

  // 处理导航可见性变更
  function handleNavigationVisibilityChange(key: string) {
    return (event: Event) => {
      if (!settings.navigationVisibility) {
        settings.navigationVisibility = {};
      }
      (settings.navigationVisibility as any)[key] = (event.target as HTMLInputElement).checked;
      plugin.settings.navigationVisibility = { ...settings.navigationVisibility };
      
      // 立即通知主界面更新导航
      window.dispatchEvent(new CustomEvent('Weave:navigation-visibility-update', {
        detail: plugin.settings.navigationVisibility
      }));
      
      saveSettings();
    };
  }

  // 处理调试模式变更
  async function handleDebugModeChange(event: Event) {
    settings.enableDebugMode = (event.target as HTMLInputElement).checked;
    const { logger } = await import('../../../utils/logger');
    logger.setDebugMode(settings.enableDebugMode);
    saveSettings();
  }

  // 处理性能优化设置显示变更
  function handleShowPerformanceSettingsChange(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    settings.showPerformanceSettings = checked;
    plugin.settings.showPerformanceSettings = checked;
    saveSettings();
  }
  
  // 处理显示高级功能预览变更
  function handleShowPremiumFeaturesPreviewChange(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    settings.showPremiumFeaturesPreview = checked;
    plugin.settings.showPremiumFeaturesPreview = checked;
    premiumGuard.setPremiumFeaturesPreview(checked);
    
    saveSettings();
    
    // 通知父组件实时刷新标签页和界面
    onPremiumFeaturesPreviewToggle?.(checked);
    
  }


</script>

<div class="weave-settings settings-section basic-settings">
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-blue">{t('settings.basic.title')}</h4>
  
    <div class="group-content">
    <!-- 显示悬浮新建卡片按钮 -->
    <div class="row">
      <label for="showFloatingCreateButton">{t('settings.basic.floatingButton.label')}</label>
      <label class="modern-switch">
        <input
          id="showFloatingCreateButton"
          type="checkbox"
          checked={settings.showFloatingCreateButton}
          onchange={handleFloatingButtonChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <!-- 主界面默认显示位置 -->
    <div class="row">
      <label for="mainInterfaceOpenLocation">{t('settings.basic.mainInterfaceOpenLocation.label')}</label>
      <div class="settings-dropdown-compact">
        <ObsidianDropdown
          options={[
            { id: 'content', label: t('settings.basic.mainInterfaceOpenLocation.content') },
            { id: 'sidebar', label: t('settings.basic.mainInterfaceOpenLocation.sidebar') }
          ]}
          value={settings.mainInterfaceOpenLocation ?? 'content'}
          onchange={(value) => {
            settings.mainInterfaceOpenLocation = value as 'content' | 'sidebar';
            saveSettings();
          }}
        />
      </div>
    </div>

    <!-- 性能优化界面 -->
    <div class="row">
      <label for="showPerformanceSettings">{t('settings.basic.showPerformanceSettings.label')}</label>
      <label class="modern-switch">
        <input
          id="showPerformanceSettings"
          type="checkbox"
          checked={settings.showPerformanceSettings ?? false}
          onchange={handleShowPerformanceSettingsChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <!-- 高级功能预览 -->
    <div class="row">
      <label for="showPremiumFeaturesPreview">{t('settings.basic.premiumFeaturesPreview.label')}</label>
      <label class="modern-switch">
        <input
          id="showPremiumFeaturesPreview"
          type="checkbox"
          checked={settings.showPremiumFeaturesPreview ?? false}
          onchange={handleShowPremiumFeaturesPreviewChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <!-- 启用编辑器拖拽调整 -->
    <div class="row">
      <label for="enable-resize-switch">{t('settings.editor.window.enableResize.label')}</label>
      <label class="modern-switch">
        <input
          id="enable-resize-switch"
          type="checkbox"
          checked={settings.editorModalSize?.enableResize ?? true}
          onchange={handleResizeEnabledChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <!-- 调试模式 -->
    <div class="row">
      <label for="enableDebugMode">{t('settings.basic.debugMode.label')}</label>
      <label class="modern-switch">
        <input
          id="enableDebugMode"
          type="checkbox"
          checked={settings.enableDebugMode ?? false}
          onchange={handleDebugModeChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>
  </div>

  {#if settings.showPerformanceSettings}
    <VirtualizationSettingsSection app={plugin.app} />
  {/if}

  <!-- 导航项显示 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-purple">{t('settings.navigation.title')}</h4>
  
    <div class="group-content">
    <div class="row">
      <label for="navDeckStudy">{t('navigation.deckStudy')}</label>
      <label class="modern-switch">
        <input
          id="navDeckStudy"
          type="checkbox"
          checked={settings.navigationVisibility?.deckStudy !== false}
          onchange={handleNavigationVisibilityChange('deckStudy')}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="row">
      <label for="navCardManagement">{t('navigation.cardManagement')}</label>
      <label class="modern-switch">
        <input
          id="navCardManagement"
          type="checkbox"
          checked={settings.navigationVisibility?.cardManagement !== false}
          onchange={handleNavigationVisibilityChange('cardManagement')}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="row">
      <label for="navAiAssistant">{t('navigation.aiAssistant')}</label>
      <label class="modern-switch">
        <input
          id="navAiAssistant"
          type="checkbox"
          checked={settings.navigationVisibility?.aiAssistant !== false}
          onchange={handleNavigationVisibilityChange('aiAssistant')}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="row">
      <label for="navApkgImport">{t('deckStudyPage.menu.importAPKG')}</label>
      <label class="modern-switch">
        <input
          id="navApkgImport"
          type="checkbox"
          checked={settings.navigationVisibility?.apkgImport !== false}
          onchange={handleNavigationVisibilityChange('apkgImport')}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="row">
      <label for="navCsvImport">{t('deckStudyPage.menu.importCSV')}</label>
      <label class="modern-switch">
        <input
          id="navCsvImport"
          type="checkbox"
          checked={settings.navigationVisibility?.csvImport !== false}
          onchange={handleNavigationVisibilityChange('csvImport')}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="row">
      <label for="navClipboardImport">{t('deckStudyPage.menu.importClipboard')}</label>
      <label class="modern-switch">
        <input
          id="navClipboardImport"
          type="checkbox"
          checked={settings.navigationVisibility?.clipboardImport !== false}
          onchange={handleNavigationVisibilityChange('clipboardImport')}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

  </div>
  </div>
</div>

<style>
  :global(body.is-phone) .settings-dropdown-compact {
    flex: 0 1 auto;
    width: auto;
    max-width: none;
    margin-left: auto;
  }
</style>
