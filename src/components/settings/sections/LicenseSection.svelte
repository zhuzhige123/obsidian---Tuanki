<script lang="ts">
  import { logger } from '../../../utils/logger';

  import type { PluginExtended } from '../types/settings-types';
  import { licenseManager } from '../../../utils/licenseManager';
  import { PremiumFeatureGuard } from '../../../services/premium/PremiumFeatureGuard';
  import {
    clearPluginLocalLicenses,
    getPluginEffectiveLicenseState,
    getPluginLicensedProduct,
    getPluginLocalLicenses,
    syncPluginLicenseSettings
  } from '../../../utils/plugin-license';
  import {
    showNotification,
    handleError
  } from '../utils/settings-utils';
  import {
    CSS_CLASSES
  } from '../constants/settings-constants';
  import EnhancedLicenseStatusCard from '../components/EnhancedLicenseStatusCard.svelte';
  import EnhancedActivationForm from '../components/EnhancedActivationForm.svelte';
  import { showObsidianConfirm } from '../../../utils/obsidian-confirm';

  interface Props {
    plugin: PluginExtended;
    onSave: () => Promise<void>;
  }

  let { plugin, onSave }: Props = $props();

  let stateVersion = $state(0);

  function refreshSnapshot(): void {
		stateVersion += 1;
	}

  let effectiveLicenseState = $derived.by(() => {
		stateVersion;
		return getPluginEffectiveLicenseState(plugin);
	});

  let currentLicense = $derived.by(() => {
		stateVersion;
		return effectiveLicenseState.primaryLicense || plugin.settings.license || null;
	});

  // 检查许可证状态
  async function checkLicenseStatus() {
    const localLicenses = getPluginLocalLicenses(plugin);
    if (localLicenses.length === 0) {
      return;
    }

    try {
      let hasValidLicense = false;
      let firstError: string | undefined;
      for (const license of localLicenses) {
        const validation = await licenseManager.validateCurrentLicense(license, {
          targetProduct: getPluginLicensedProduct(plugin)
        });
        if (validation.isValid) {
          hasValidLicense = true;
          continue;
        }
        firstError ??= validation.error;
      }

      await PremiumFeatureGuard.getInstance().updateLicenseState({
        product: getPluginLicensedProduct(plugin),
        localLicenses: getPluginLocalLicenses(plugin),
      });

      refreshSnapshot();

      if (hasValidLicense) {
        showNotification({
          message: '许可证验证成功',
          type: 'success'
        });
        return;
      }

      showNotification({
        message: firstError ? `许可证验证失败: ${firstError}` : '许可证验证失败',
        type: 'error'
      });
    } catch (error) {
      handleError(error, '许可证验证');
    }
  }

  // 重置许可证
  async function resetLicense() {
    const confirmed = await showObsidianConfirm(plugin.app, '确定要重置许可证吗？这将清除当前的激活状态。', { title: '确认重置' });
    if (confirmed) {
      clearPluginLocalLicenses(plugin);
      syncPluginLicenseSettings(plugin);
      
      await onSave();
		  refreshSnapshot();
      
      showNotification({
        message: "许可证已重置",
        type: 'success'
      });
    }
  }

  // 激活成功回调
  function handleActivationSuccess(licenseInfo: any) {
    logger.debug('[LicenseSection] 激活成功:', licenseInfo);
  }

  // 激活失败回调
  function handleActivationError(error: any) {
    logger.error('[LicenseSection] 激活失败:', error);
  }
</script>

<section class={CSS_CLASSES.LICENSE_SECTION}>
  <h2 class="section-title">许可证状态</h2>

  <!-- 使用增强的许可证状态卡片 -->
  <EnhancedLicenseStatusCard
    license={currentLicense}
    effectiveState={effectiveLicenseState}
    showActions={true}
    onVerify={checkLicenseStatus}
    onReset={resetLicense}
  />

  {#if !effectiveLicenseState.isPremiumActive}
    <!-- 使用增强的激活表单（包含邮箱输入） -->
    <EnhancedActivationForm
      {plugin}
      {onSave}
      onActivationSuccess={handleActivationSuccess}
      onActivationError={handleActivationError}
      standalone={false}
    />
  {/if}
</section>
