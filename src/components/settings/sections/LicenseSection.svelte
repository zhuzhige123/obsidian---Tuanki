<script lang="ts">
  import { logger } from '../../../utils/logger';

  import type { PluginExtended } from '../types/settings-types';
  import { licenseManager } from '../../../utils/licenseManager';
  import { PremiumFeatureGuard } from '../../../services/premium/PremiumFeatureGuard';
  import {
    getPluginEffectiveLicenseState,
    getPluginLicensedProduct,
    getPluginLocalLicenses,
    resetPluginLicenseActivation
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
  import { i18n, tr } from '../../../utils/i18n';

  interface Props {
    plugin: PluginExtended;
    onSave: () => Promise<void>;
  }

  let { plugin, onSave }: Props = $props();

  let stateVersion = $state(0);
  let t = $derived($tr);

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
          message: i18n.t('about.license.notices.verifySuccess'),
          type: 'success'
        });
        return;
      }

      showNotification({
        message: firstError
          ? i18n.t('about.license.notices.verifyFailedWithReason', { reason: firstError })
          : i18n.t('about.license.notices.verifyFailed'),
        type: 'error'
      });
    } catch (error) {
      handleError(error, i18n.t('about.license.notices.verifyAction'));
    }
  }

  // 重置许可证
  async function resetLicense() {
    const confirmed = await showObsidianConfirm(
      plugin.app,
      i18n.t('about.license.notices.resetConfirm'),
      { title: i18n.t('about.license.notices.resetConfirmTitle') }
    );
    if (confirmed) {
      await resetPluginLicenseActivation(plugin);
      refreshSnapshot();
      
      showNotification({
        message: i18n.t('about.license.notices.resetSuccess'),
        type: 'success'
      });
    }
  }

  // 激活成功回调
  function handleActivationSuccess(licenseInfo: any) {
    logger.debug('[LicenseSection] 激活成功:', licenseInfo);
    refreshSnapshot();
  }

  // 激活失败回调
  function handleActivationError(error: any) {
    logger.error('[LicenseSection] 激活失败:', error);
  }
</script>

<section class={CSS_CLASSES.LICENSE_SECTION}>
  <div class="group-title">{t('about.license.statusCard.license')}</div>

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
