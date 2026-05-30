<script lang="ts">
  /**
   * 增强的许可证状态卡片组件
   * 提供清晰、突出的激活状态显示
   */

  import type { EffectiveLicenseState } from '../../../types/license';
  import type { LicenseInfo } from '../types/settings-types';
  import { tr } from '../../../utils/i18n';
  import {
    formatLicenseDeviceStats,
    isWeavePrimaryLicense,
    resolveLicenseDeviceStats,
  } from '../../../utils/license-device-stats';

  interface Props {
    license: LicenseInfo | null;
    effectiveState?: EffectiveLicenseState;
    showActions?: boolean;
    onVerify?: () => Promise<void>;
    onSaveCode?: () => Promise<void>;
    onReset?: () => Promise<void>;
    isSavingCode?: boolean;
    isResetting?: boolean;
  }

  let {
    license,
    effectiveState,
    showActions = true,
    onVerify,
    onSaveCode,
    onReset,
    isSavingCode = false,
    isResetting = false,
  }: Props = $props();
  let t = $derived($tr);

  function formatLicenseSourcePluginName(sourcePluginId: string | undefined): string {
    if (sourcePluginId === 'weave') {
      return t('settings.license.statusCard.source.weave');
    }
    if (sourcePluginId === 'weave-epub-reader') {
      return t('settings.license.statusCard.source.reader');
    }
    return t('settings.license.statusCard.source.related');
  }

  let localLicenseCount = $derived(effectiveState?.localLicenses.length ?? (license?.activationCode ? 1 : 0));

  let inheritedLicenseCount = $derived(effectiveState?.inheritedLicenses.length ?? 0);

  let displayLicense = $derived(effectiveState?.primaryLicense ?? license ?? null);

  let isActivated = $derived(effectiveState?.isPremiumActive ?? (displayLicense?.isActivated || false));

  let licenseSourceLabel = $derived.by(() => {
    if (!displayLicense) return t('settings.license.statusCard.source.unactivated');
    if (displayLicense.source === 'inherited') {
      return displayLicense.sourcePluginId
        ? t('settings.license.statusCard.source.sharedFrom', { product: formatLicenseSourcePluginName(displayLicense.sourcePluginId) })
        : t('settings.license.statusCard.source.shared');
    }
    return isWeavePrimaryLicense(displayLicense)
      ? t('settings.license.statusCard.source.weavePrimaryCode')
      : t('settings.license.statusCard.source.weaveActivationCode');
  });

  let hasLocalLicense = $derived(localLicenseCount > 0);

  let isInheritedOnly = $derived(isActivated && !hasLocalLicense && inheritedLicenseCount > 0);

  let statusBadgeText = $derived(
    isInheritedOnly
      ? t('settings.license.statusCard.sharedActive')
      : t('settings.license.statusCard.activated')
  );

  let statusBadgeClass = $derived(isInheritedOnly ? 'inherited' : 'success');

  let licenseTypeInfo = $derived.by(() => {
    if (!displayLicense?.licenseType) {
      return { text: t('settings.license.statusCard.licenseType.unknown'), color: 'gray' };
    }

    switch (displayLicense.licenseType) {
      case 'lifetime':
        return { text: t('settings.license.statusCard.licenseType.lifetime'), color: 'premium' };
      case 'subscription':
        return { text: t('settings.license.statusCard.licenseType.subscription'), color: 'subscription' };
      default:
        return { text: t('settings.license.statusCard.licenseType.default'), color: 'default' };
    }
  });

  let deviceStats = $derived(resolveLicenseDeviceStats(displayLicense));

  let expiryInfo = $derived.by(() => {
    if (!displayLicense?.expiresAt) return null;

    const expiryDate = new Date(displayLicense.expiresAt);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { status: 'expired', text: t('settings.license.statusCard.expiry.expired'), color: 'red' };
    } else if (daysUntilExpiry <= 30) {
      return { status: 'expiring', text: t('settings.license.statusCard.expiry.inDays', { days: daysUntilExpiry }), color: 'orange' };
    } else if (daysUntilExpiry <= 365) {
      return { status: 'active', text: t('settings.license.statusCard.expiry.inDays', { days: daysUntilExpiry }), color: 'green' };
    } else {
      return { status: 'long-term', text: t('settings.license.statusCard.expiry.longTerm'), color: 'green' };
    }
  });
</script>

{#if isActivated}
  <div class="license-status-card activated">
    <div class="status-header">
      <div class="status-badge {statusBadgeClass}">
        <span class="badge-text">{statusBadgeText}</span>
      </div>
    </div>

    <div class="license-details">
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">{t('settings.license.statusCard.labels.licenseType')}</div>
          <div class="detail-value">
            <span class="license-type-badge {licenseTypeInfo.color}">
              {licenseTypeInfo.text}
            </span>
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">{t('settings.license.statusCard.labels.source')}</div>
          <div class="detail-value">{licenseSourceLabel}</div>
        </div>

        <div class="detail-item">
          <div class="detail-label">{t('settings.license.statusCard.labels.localCount')}</div>
          <div class="detail-value">{localLicenseCount}</div>
        </div>

        {#if inheritedLicenseCount > 0}
          <div class="detail-item">
            <div class="detail-label">{t('settings.license.statusCard.labels.inheritedCount')}</div>
            <div class="detail-value">{inheritedLicenseCount}</div>
          </div>
        {/if}

        {#if deviceStats}
          <div class="detail-item">
            <div class="detail-label">{t('settings.license.statusCard.labels.deviceUsage')}</div>
            <div class="detail-value">{formatLicenseDeviceStats(deviceStats)}</div>
          </div>
        {/if}

        <div class="detail-item">
          <div class="detail-label">{t('settings.license.statusCard.labels.activatedAt')}</div>
          <div class="detail-value">
            {displayLicense?.activatedAt ? new Date(displayLicense.activatedAt).toLocaleString() : '-'}
          </div>
        </div>

        {#if displayLicense?.expiresAt && displayLicense.licenseType !== 'lifetime'}
          <div class="detail-item">
            <div class="detail-label">{t('settings.license.statusCard.labels.expiresAt')}</div>
            <div class="detail-value">
              <span class="expiry-date {expiryInfo?.color}">
                {new Date(displayLicense.expiresAt).toLocaleString()}
              </span>
              {#if expiryInfo}
                <span class="expiry-status {expiryInfo?.color ?? ''}">
                  ({expiryInfo?.text ?? ''})
                </span>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      {#if isInheritedOnly}
        <div class="license-source-note">
          {t('settings.license.statusCard.inheritedNote')}
        </div>
      {/if}
    </div>

    {#if showActions}
      <div class="license-actions">
        <div class="license-actions-left">
          {#if onSaveCode}
            <button class="action-button" onclick={onSaveCode} disabled={isSavingCode || isResetting}>
              {t('settings.license.statusCard.saveCode')}
            </button>
          {:else if onVerify}
            <button class="action-button" onclick={onVerify} disabled={isSavingCode || isResetting}>
              {t('about.license.statusCard.verifyLicense')}
            </button>
          {/if}
        </div>

        <div class="license-actions-right">
          {#if onReset}
            <button class="action-button secondary" onclick={onReset} disabled={isSavingCode || isResetting}>
              {t('settings.license.statusCard.removeActivation')}
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="license-status-card not-activated">
    <div class="status-header">
      <div class="status-badge inactive">
        <span class="badge-text">{t('settings.license.statusCard.notActivated')}</span>
      </div>
    </div>

    <div class="inactive-message">
      <p>{t('settings.license.statusCard.freeOnlyMessage')}</p>
    </div>
  </div>
{/if}

<style>
  .license-status-card {
    --weave-license-settings-font-size-label: var(--font-ui-small, 0.95rem);
    --weave-license-settings-font-size-desc: var(--font-ui-smaller, 0.85rem);
    --weave-license-settings-gap-xs: 0.25rem;
    --weave-license-settings-gap-sm: 0.35rem;
    --weave-license-settings-gap-md: 0.5rem;
    --weave-license-settings-gap-lg: 1rem;
    --weave-license-settings-radius-sm: var(--radius-s, 6px);
    --weave-license-settings-radius-md: var(--radius-m, 8px);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--weave-license-settings-radius-md);
    padding: 0;
    background: var(--background-primary-alt, var(--background-primary));
    overflow: hidden;
  }

  .license-status-card.activated {
    border-color: color-mix(in srgb, var(--background-modifier-border) 75%, var(--color-green));
  }

  .license-status-card.not-activated {
    border-color: color-mix(in srgb, var(--background-modifier-border) 75%, var(--color-orange));
  }

  .status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--weave-license-settings-gap-lg) var(--weave-license-settings-gap-lg) 0;
    margin-bottom: calc(var(--weave-license-settings-gap-md) + var(--weave-license-settings-gap-xs));
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--weave-license-settings-gap-md);
    padding: var(--weave-license-settings-gap-xs) calc(var(--weave-license-settings-gap-md) + 0.125rem);
    border-radius: var(--weave-license-settings-radius-sm);
    font-weight: 600;
    font-size: var(--font-ui-small);
    border: 1px solid var(--background-modifier-border);
  }

  .status-badge.success {
    background: color-mix(in srgb, var(--background-secondary) 88%, var(--color-green));
    color: var(--color-green);
    border-color: color-mix(in srgb, var(--background-modifier-border) 60%, var(--color-green));
  }

  .status-badge.inherited {
    background: color-mix(in srgb, var(--background-secondary) 88%, var(--color-purple));
    color: var(--color-purple);
    border-color: color-mix(in srgb, var(--background-modifier-border) 60%, var(--color-purple));
  }

  .status-badge.inactive {
    background: color-mix(in srgb, var(--background-secondary) 88%, var(--color-orange));
    color: var(--color-orange);
    border-color: color-mix(in srgb, var(--background-modifier-border) 60%, var(--color-orange));
  }

  .license-type-badge {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--weave-license-settings-gap-sm) - 0.025rem);
    padding: calc(var(--weave-license-settings-gap-xs) - 0.05rem) calc(var(--weave-license-settings-gap-md) + 0.05rem);
    border-radius: var(--weave-license-settings-radius-sm);
    font-weight: 500;
    font-size: 0.75rem;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-normal);
  }

  .license-type-badge.premium {
    border-color: color-mix(in srgb, var(--background-modifier-border) 60%, var(--color-purple));
  }

  .license-type-badge.subscription {
    border-color: color-mix(in srgb, var(--background-modifier-border) 60%, var(--color-green));
  }

  .detail-grid {
    display: grid;
    gap: 0;
    margin-bottom: 0;
  }

  .detail-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--weave-license-settings-gap-lg);
    padding: calc(var(--weave-license-settings-gap-md) + var(--weave-license-settings-gap-sm)) var(--weave-license-settings-gap-lg);
    background: transparent;
    border-radius: 0;
    border-top: 1px solid var(--background-modifier-border);
  }

  .detail-grid .detail-item:first-child {
    border-top: none;
  }

  .detail-label {
    font-weight: 500;
    color: var(--text-muted);
    font-size: var(--weave-license-settings-font-size-desc);
  }

  .action-button:disabled {
    opacity: 0.65;
    cursor: default;
  }

  .detail-value {
    font-weight: 500;
    color: var(--text-normal);
    text-align: right;
  }

  .license-source-note {
    padding: calc(var(--weave-license-settings-gap-md) + var(--weave-license-settings-gap-sm)) var(--weave-license-settings-gap-lg) 0;
    color: var(--text-muted);
    line-height: 1.55;
    font-size: var(--weave-license-settings-font-size-desc);
  }

  .expiry-status.green {
    color: var(--color-green);
  }

  .expiry-status.orange {
    color: var(--color-orange);
  }

  .expiry-status.red {
    color: var(--color-red);
  }

  .license-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: calc(var(--weave-license-settings-gap-md) + var(--weave-license-settings-gap-xs));
    padding: var(--weave-license-settings-gap-lg);
    border-top: 1px solid var(--background-modifier-border);
  }

  .license-actions-left,
  .license-actions-right {
    display: flex;
    align-items: center;
    gap: calc(var(--weave-license-settings-gap-md) + var(--weave-license-settings-gap-xs));
  }

  button.action-button,
  button.action-button:hover,
  button.action-button:active,
  button.action-button:focus,
  button.action-button:focus-visible,
  button.action-button.secondary,
  button.action-button.secondary:hover,
  button.action-button.secondary:active,
  button.action-button.secondary:focus,
  button.action-button.secondary:focus-visible {
    padding: calc(var(--weave-license-settings-gap-xs) + 0.05rem) 0 !important;
    min-height: auto !important;
    height: auto !important;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    background: transparent !important;
    color: var(--text-muted) !important;
    cursor: pointer;
    transition: color 0.15s ease !important;
    font-size: var(--weave-license-settings-font-size-desc);
    font-weight: 500;
    line-height: 1.4;
  }

  button.action-button:hover,
  button.action-button.secondary:hover {
    color: var(--text-normal) !important;
  }

  button.action-button:focus-visible,
  button.action-button.secondary:focus-visible {
    color: var(--interactive-accent) !important;
  }

  .inactive-message {
    padding: 0 var(--weave-license-settings-gap-lg) var(--weave-license-settings-gap-lg);
    color: var(--text-muted);
    line-height: 1.55;
  }

  .inactive-message p {
    margin: 0;
  }

  @media (max-width: 720px) {
    .detail-item {
      flex-direction: column;
      align-items: stretch;
    }

    .detail-value {
      text-align: left;
    }

    .license-actions {
      justify-content: flex-end;
      flex-wrap: wrap;
    }
  }
</style>
