<script lang="ts">
  /**
   * 激活组件（使用Obsidian原生Modal）
   * 通过按钮触发显示激活表单，界面更简洁优雅
   */
  
  import { untrack } from 'svelte';
  import { ActivationModal } from './ActivationModalObsidian';
  import { tr } from '../../../utils/i18n';
  import { getPluginEffectiveLicenseState } from '../../../utils/plugin-license';
  
  interface Props {
    plugin: any;
    onSave: () => Promise<void>;
    purchaseUrl?: string; // 购买激活码的链接
  }
  
  let { 
    plugin, 
    onSave,
    purchaseUrl = 'https://pay.ldxp.cn/item/ned9pw' 
  }: Props = $props();

  // 响应式翻译
  let t = $derived($tr);
  
  // 当前许可证状态
  let currentLicenseInfo = $state(
    untrack(() => getPluginEffectiveLicenseState(plugin).primaryLicense ?? plugin?.settings?.license ?? null)
  );
  let isLicenseActive = $derived(
    currentLicenseInfo?.isActivated && currentLicenseInfo?.activationCode
  );

  async function handleSave() {
    await onSave();
    currentLicenseInfo = getPluginEffectiveLicenseState(plugin).primaryLicense ?? plugin?.settings?.license ?? null;
  }
  
  function openModal() {
    // 使用Obsidian原生Modal API
    const modal = new ActivationModal(plugin.app, plugin, handleSave);
    modal.open();
  }
</script>

<div class="activation-modal-wrapper">
  {#if isLicenseActive}
    <!-- 已激活状态 - 左右布局 -->
    <div class="activation-status-card activated">
      <!-- 左侧：状态信息 -->
      <div class="status-left">
        <div class="status-content">
          <h4 class="status-title">{t('about.license.statusActive')}</h4>
          <p class="status-description">
            {#if currentLicenseInfo.boundEmail}
              {t('license.boundEmail')}: {currentLicenseInfo.boundEmail}
            {/if}
            {#if currentLicenseInfo.cloudSync?.devicesUsed}
              · {t('license.activatedDevices')}: {currentLicenseInfo.cloudSync.devicesUsed}/{currentLicenseInfo.cloudSync.devicesMax || 5}
            {/if}
          </p>
        </div>
      </div>
      
      <!-- 右侧：管理按钮 -->
      <div class="status-right">
        <button class="manage-button" onclick={openModal}>
          {t('about.license.manage')}
        </button>
      </div>
    </div>
  {:else}
    <!-- 未激活状态 - 左右布局 -->
    <div class="activation-status-card inactive">
      <!-- 左侧：状态标题 -->
      <div class="status-left">
        <div class="status-content">
          <h4 class="status-title">{t('about.license.statusInactive')}</h4>
        </div>
      </div>
      
      <!-- 右侧：获取激活码 + 激活按钮（同一行） -->
      <div class="status-right inline-actions">
        <a 
          href={purchaseUrl} 
          class="get-code-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('license.getActivationCode')} →
        </a>
        <button class="activate-trigger-button" onclick={openModal}>
          {t('license.activatePremium')}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .activation-modal-wrapper {
    width: 100%;
    margin: 2rem 0;
  }
  
  /* 状态卡片 */
  .activation-status-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    padding: 1.5rem 2rem;
    border-radius: 12px;
    background: var(--background-secondary);
    border: 2px solid var(--background-modifier-border);
    transition: all 0.3s ease;
  }
  
  .activation-status-card:hover {
    border-color: var(--interactive-accent);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--background-modifier-border), transparent 50%);
  }

  /* 左侧区域 */
  .status-left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex: 1;
    min-width: 0;
  }

  /* 右侧区域 */
  .status-right {
    flex-shrink: 0;
  }
  
  /* 同一行显示：获取激活码 + 激活按钮 */
  .status-right.inline-actions {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  
  .activation-status-card.activated {
    background: var(--background-secondary);
    border-color: var(--interactive-accent);
  }
  
  .status-content {
    flex: 1;
    min-width: 0;
  }
  
  .status-title {
    margin: 0 0 0.25rem 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-normal);
  }
  
  .status-description {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  /* 获取激活码链接 */
  .get-code-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--interactive-accent);
    font-size: 0.9rem;
    font-weight: 500;
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .get-code-link:hover {
    color: var(--interactive-accent-hover);
    text-decoration: underline;
    transform: translateX(2px);
  }
  
  /* 按钮样式 */
  .activate-trigger-button {
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, var(--interactive-accent) 0%, var(--color-blue) 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    white-space: nowrap;
  }
  
  .activate-trigger-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px color-mix(in oklab, var(--interactive-accent), transparent 60%);
  }
  
  .manage-button {
    padding: 0.5rem 1.5rem;
    background: var(--background-primary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }
  
  .manage-button:hover {
    border-color: var(--interactive-accent);
    background: color-mix(in oklab, var(--interactive-accent), transparent 95%);
  }
  
  /* 响应式设计 */
  @media (max-width: 768px) {
    .activation-status-card {
      flex-direction: column;
      gap: 1.5rem;
      padding: 1.5rem;
    }

    .status-left {
      text-align: center;
    }

    .status-right {
      width: 100%;
    }
    
    .status-right.inline-actions {
      flex-direction: column;
      gap: 1rem;
    }
    
    .activate-trigger-button,
    .manage-button {
      width: 100%;
    }

    .get-code-link {
      justify-content: center;
    }
  }
</style>
