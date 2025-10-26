<script lang="ts">
  import TabNavigation from "../atoms/TabNavigation.svelte";
  // import TemplateManager from "./TemplateManager.svelte"; // 暂时注释，已被新系统替代

  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import EnhancedButton from "../ui/EnhancedButton.svelte";

  // 重构后的设置组件
  import BasicSettingsSection from "./sections/BasicSettingsSection.svelte";
  import FSRS6SettingsSection from "./sections/FSRS6SettingsSection.svelte";

  import ConvenientCardCreationSection from "./sections/ConvenientCardCreationSection.svelte";


  import DataManagementPanel from "./sections/DataManagementPanel.svelte";

  // AnkiConnect 同步面板
  import AnkiConnectPanel from './AnkiConnectPanel.svelte';

  // 新的关于页面组件
  import ProductInfoSection from './components/ProductInfoSection.svelte';

  // 新版简化卡片解析设置组件
  import SimplifiedParsingSettings from './SimplifiedParsingSettings.svelte';
  import { DEFAULT_SIMPLIFIED_PARSING_SETTINGS } from '../../types/newCardParsingTypes';

  // AI配置组件
  import AIConfigSection from './sections/AIConfigSection.svelte';
  
  // 虚拟化设置组件
  import VirtualizationSettingsSection from './sections/VirtualizationSettingsSection.svelte';

  // 架构组件
  import { dispatchUI } from "../../architecture/unified-state-management";

  // 类型和常量
  import type { PluginExtended } from "./types/settings-types";
  import { SETTINGS_TABS, DEFAULT_ACTIVE_TAB } from "./constants/settings-constants";
  import { showNotification } from "./utils/settings-utils";

  import { onMount } from 'svelte';

  interface Props { plugin: PluginExtended }
  let { plugin }: Props = $props();

  // 标签页配置
  let activeTab = $state(DEFAULT_ACTIVE_TAB);



  // 初始化组件
  onMount(() => {
    // 通知状态管理器当前页面
    dispatchUI('SET_CURRENT_PAGE', 'settings');
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
        console.error('保存设置失败:', error);
        showNotification({
          message: '设置保存失败，请重试',
          type: 'error'
        });
      }
    }, 300);
  }

  // 重试机制函数
  async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        console.warn(`操作失败，${delay}ms后重试 (${i + 1}/${maxRetries}):`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }

  // 通用数据操作错误处理函数
  async function handleDataOperation<T>(
    operation: () => Promise<T>,
    successMessage: string,
    errorMessage: string,
    errorContext?: string,
    enableRetry: boolean = false
  ): Promise<T | null> {
    try {
      const result = enableRetry
        ? await withRetry(operation)
        : await operation();
      showNotification({ message: successMessage, type: 'success' });
      return result;
    } catch (error) {
      const context = errorContext || errorMessage;
      console.error(`${context}:`, error);
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      showNotification({
        message: `${errorMessage}: ${errorMsg}`,
        type: 'error'
      });
      return null;
    }
  }
















</script>

<div class="anki-app settings-root">
  <div class="header">
    <h1 class="title">Anki 插件设置</h1>
  </div>

  <div class="tabs">
    <TabNavigation items={SETTINGS_TABS} activeId={activeTab} onChange={(id) => activeTab = id} />
  </div>

  <!-- About -->
  {#if activeTab === 'about'}
    <div class="about-container">
      <!-- 产品信息区域 - 包含集成的激活功能 -->
      <ProductInfoSection {plugin} onSave={save} />
    </div>
  {/if}

  <!-- Basic -->
  {#if activeTab === 'basic'}
    <!-- 使用重构后的基础设置组件 -->
    <BasicSettingsSection {plugin} />
  {/if}

  <!-- FSRS6 Algorithm -->
  {#if activeTab === 'fsrs6'}
    <FSRS6SettingsSection {plugin} />
  {/if}

  <!-- Convenient Card Creation -->
  {#if activeTab === 'annotation'}
    <ConvenientCardCreationSection {plugin} />
  {/if}

  <!-- Simplified Card Parsing Settings -->
  {#if activeTab === 'card-parsing'}
    <SimplifiedParsingSettings
      settings={plugin.settings.simplifiedParsing || DEFAULT_SIMPLIFIED_PARSING_SETTINGS}
      onSettingsChange={(newSettings: any) => {
        plugin.settings.simplifiedParsing = newSettings;
        plugin.saveSettings();
      }}
      {plugin}
    />
  {/if}

  <!-- AI Configuration -->
  {#if activeTab === 'ai-config'}
    <AIConfigSection {plugin} />
  {/if}
  
  <!-- Virtualization Settings -->
  {#if activeTab === 'virtualization'}
    <VirtualizationSettingsSection onSave={save} />
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
  /* ===== 基础布局样式 ===== */
  .settings-root {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    /* 🔧 修复UI阻塞：确保设置面板可滚动和交互 */
    overflow-y: auto;
    height: 100%;
    pointer-events: auto;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    margin: 0;
    font-size: var(--tuanki-font-size-lg);
    font-weight: 700;
    background: var(--anki-gradient-primary);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tabs {
    margin-top: 0.25rem;
  }







  /* ===== 关于页面样式 ===== */
  .about-container {
    width: 100%;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* 保留必要的动画和其他样式 */













  @keyframes spin {
    to { transform: rotate(360deg); }
  }











  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }





</style>
