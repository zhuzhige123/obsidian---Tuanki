<script lang="ts">
  import EnhancedActivationForm from '../components/EnhancedActivationForm.svelte';
  import EnhancedLicenseStatusCard from '../components/EnhancedLicenseStatusCard.svelte';
  import {
    getPluginEffectiveLicenseState,
    getPluginLicensedProduct,
    getPluginLocalLicenses,
    resetPluginLicenseActivation,
  } from '../../../utils/plugin-license';
  import { emitWeaveLicenseChanged } from '../../../utils/license-sync-bridge';
  import { PremiumFeatureGuard } from '../../../services/premium/PremiumFeatureGuard';
  import { writeSystemClipboardText } from '../../../utils/system-clipboard';
  import { showNotification } from '../utils/settings-utils';
  import { showObsidianConfirm } from '../../../utils/obsidian-confirm';
  import { tr } from '../../../utils/i18n';
  import { LIFETIME_LICENSE_PURCHASE_URL } from '../../../config/plugin-runtime';
  import type { PluginExtended } from '../types/settings-types';

  interface Props {
    plugin: PluginExtended;
    onSave: () => Promise<void>;
  }

  let { plugin, onSave }: Props = $props();
  let t = $derived($tr);

  let stateVersion = $state(0);
  let isRemoving = $state(false);
  let isSavingCode = $state(false);

  function refreshSnapshot(): void {
    stateVersion += 1;
  }

  let effectiveLicenseState = $derived.by(() => {
    stateVersion;
    return getPluginEffectiveLicenseState(plugin);
  });

  let currentLicense = $derived.by(() => {
    stateVersion;
    return effectiveLicenseState.primaryLicense || plugin.settings?.license || null;
  });

  async function save(): Promise<void> {
    await onSave();
    refreshSnapshot();
  }

  async function saveActivationCode(): Promise<void> {
    if (isSavingCode || isRemoving) {
      return;
    }

    const activationCode = currentLicense?.activationCode?.trim();
    if (!activationCode) {
      showNotification({
        message: t('settings.license.noSavableCode'),
        type: 'info',
      });
      return;
    }

    isSavingCode = true;
    try {
      const copied = await writeSystemClipboardText(activationCode);
      showNotification({
        message: copied ? t('settings.license.codeCopied') : t('settings.license.codeCopyFailed'),
        type: copied ? 'success' : 'error',
      });
    } finally {
      isSavingCode = false;
    }
  }

  async function resetLicense(): Promise<void> {
    if (isRemoving || isSavingCode) {
      return;
    }

    const hasLocalLicense = getPluginLocalLicenses(plugin).length > 0;
    if (!hasLocalLicense && !effectiveLicenseState.isPremiumActive) {
      refreshSnapshot();
      showNotification({
        message: t('settings.license.noActivationToRemove'),
        type: 'info',
      });
      return;
    }

    const confirmed = await showObsidianConfirm(
      plugin.app,
      t('settings.license.confirmRemove'),
      { title: t('settings.license.confirmRemoveTitle') }
    );

    if (!confirmed) {
      return;
    }

    isRemoving = true;
    try {
      await resetPluginLicenseActivation(plugin);
      await PremiumFeatureGuard.getInstance().updateLicenseState({
        product: getPluginLicensedProduct(plugin),
        localLicenses: getPluginLocalLicenses(plugin),
      });
      emitWeaveLicenseChanged(plugin.app);
      refreshSnapshot();

      const nextState = getPluginEffectiveLicenseState(plugin);
      if (getPluginLocalLicenses(plugin).length === 0 && !nextState.isPremiumActive) {
        showNotification({
          message: t('settings.license.removed'),
          type: 'success',
        });
        return;
      }

      showNotification({
        message: t('settings.license.removeAbnormal'),
        type: 'error',
      });
    } catch {
      showNotification({
        message: t('settings.license.removeFailed'),
        type: 'error',
      });
    } finally {
      isRemoving = false;
    }
  }
</script>

<section class="weave-license-settings-panel">
  <div class="weave-license-settings-card">
    <div class="weave-license-settings-header">
      <div class="section-title-row">
        <h3 class="section-title with-accent-bar accent-purple">{t('settings.license.title')}</h3>
        <a
          class="license-purchase-link"
          href={LIFETIME_LICENSE_PURCHASE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('settings.license.purchaseLink')}
        </a>
      </div>
      <p class="section-description">{t('settings.license.description')}</p>
    </div>

    <div class="weave-license-settings-content">
      {#if effectiveLicenseState.isPremiumActive}
        <EnhancedLicenseStatusCard
          license={currentLicense}
          effectiveState={effectiveLicenseState}
          showActions={true}
          isSavingCode={isSavingCode}
          isResetting={isRemoving}
          onSaveCode={saveActivationCode}
          onReset={resetLicense}
        />
      {/if}

      {#if !effectiveLicenseState.isPremiumActive}
        <EnhancedActivationForm
          {plugin}
          onSave={save}
          showHeader={false}
          displayState={effectiveLicenseState}
          standalone={false}
        />
      {/if}
    </div>
  </div>
</section>

<style>
  .weave-license-settings-panel {
    --weave-license-settings-gap-sm: 0.35rem;
    --weave-license-settings-gap-lg: 1rem;
    --weave-license-settings-panel-padding: 1rem;
    --weave-license-settings-radius-panel: 18px;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .weave-license-settings-card {
    display: flex;
    flex-direction: column;
    gap: var(--weave-license-settings-gap-lg);
    padding: var(--weave-license-settings-panel-padding);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--weave-license-settings-radius-panel);
    background: color-mix(in oklab, var(--background-primary), var(--background-secondary) 26%);
  }

  .weave-license-settings-header {
    display: flex;
    flex-direction: column;
    gap: var(--weave-license-settings-gap-sm);
    min-width: 0;
  }

  .section-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--weave-license-settings-gap-lg);
    min-width: 0;
  }

  .section-title-row .section-title {
    flex: 1 1 auto;
    min-width: 0;
  }

  .license-purchase-link {
    flex-shrink: 0;
    font-size: var(--weave-settings-font-size-desc, var(--font-ui-smaller, 0.85rem));
    color: var(--text-accent);
    text-decoration: none;
    white-space: nowrap;
    transition: color 0.15s ease, opacity 0.15s ease;
  }

  .license-purchase-link:hover {
    color: var(--text-accent-hover, var(--text-accent));
    opacity: 0.88;
  }

  .weave-license-settings-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--weave-license-settings-gap-lg);
  }

  .section-title {
    margin: 0;
    font-size: var(--weave-settings-font-size-title, var(--font-ui-medium, 1rem));
    font-weight: 600;
    color: var(--text-normal);
    line-height: 1.4;
  }

  .section-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
  }

  .section-title.with-accent-bar::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 80%;
    border-radius: var(--radius-s, 2px);
  }

  .section-title.accent-purple::before {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(147, 51, 234, 0.6));
  }

  .section-description {
    margin: 0;
    font-size: var(--weave-settings-font-size-desc, var(--font-ui-smaller, 0.85rem));
    color: var(--text-muted);
    line-height: 1.55;
  }

  .weave-license-settings-content :global(.enhanced-activation-form .activation-form) {
    gap: 1.1rem;
  }

  .weave-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child)) {
    display: grid;
    grid-template-columns: minmax(7rem, 9rem) minmax(0, 1fr);
    column-gap: var(--weave-license-settings-gap-lg);
    row-gap: var(--weave-license-settings-gap-sm);
    align-items: start;
  }

  .weave-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .input-label) {
    display: block;
    grid-column: 1;
    padding-top: 0.4rem;
  }

  .weave-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .input-hint) {
    display: none;
  }

  .weave-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .email-input),
  .weave-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .email-hint) {
    grid-column: 2;
    width: 100%;
  }

  .weave-license-settings-content :global(.enhanced-activation-form .action-section) {
    justify-content: flex-end;
  }

  @media (max-width: 720px) {
    .weave-license-settings-card {
      padding: calc(var(--weave-license-settings-panel-padding) - 0.1rem);
      border-radius: var(--radius-l, 14px);
    }

    .section-title-row {
      flex-wrap: wrap;
      row-gap: var(--weave-license-settings-gap-sm);
    }

    .license-purchase-link {
      white-space: normal;
    }

    .weave-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child)) {
      grid-template-columns: 1fr;
      row-gap: 0.25rem;
    }

    .weave-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .input-label),
    .weave-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .email-input),
    .weave-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .email-hint) {
      grid-column: 1;
    }

    .weave-license-settings-content :global(.enhanced-activation-form .action-section) {
      justify-content: center;
    }
  }
</style>
