<script lang="ts">
  /**
   * 增强的许可证状态卡片组件
   * 提供清晰、突出的激活状态显示
   */
  
  import type { EffectiveLicenseState } from '../../../types/license';
  import type { LicenseInfo } from '../types/settings-types';
  
  interface Props {
    license: LicenseInfo | null;
    effectiveState?: EffectiveLicenseState;
    showActions?: boolean;
    onVerify?: () => Promise<void>;
    onReset?: () => Promise<void>;
  }
  
  let { license, effectiveState, showActions = true, onVerify, onReset }: Props = $props();
 
  function formatLicenseSourcePluginName(sourcePluginId: string | undefined): string {
    if (sourcePluginId === 'weave') {
      return 'Weave';
    }
    if (sourcePluginId === 'weave-epub-reader') {
      return 'EPUB 阅读器';
    }
    return '关联产品';
  }
  
  // 状态计算
  let localLicenseCount = $derived(effectiveState?.localLicenses.length ?? (license?.activationCode ? 1 : 0));

  let inheritedLicenseCount = $derived(effectiveState?.inheritedLicenses.length ?? 0);

  let displayLicense = $derived(effectiveState?.primaryLicense ?? license ?? null);

  let isActivated = $derived(effectiveState?.isPremiumActive ?? (displayLicense?.isActivated || false));

  let licenseSourceLabel = $derived.by(() => {
    if (!displayLicense) return '未激活';
    if (displayLicense.source === 'inherited') {
      return displayLicense.sourcePluginId
				? `共享授权（来自 ${formatLicenseSourcePluginName(displayLicense.sourcePluginId)})`
				: '共享授权';
    }
    return '当前产品授权';
  });
  
  // 许可证类型显示
  let licenseTypeInfo = $derived.by(() => {
    if (!displayLicense?.licenseType) return { text: '未知', color: 'gray' };

    switch (displayLicense.licenseType) {
      case 'lifetime':
        return { text: '永久买断', color: 'premium' };
      case 'subscription':
        return { text: '订阅许可', color: 'subscription' };
      default:
        return { text: '许可证', color: 'default' };
    }
  });
  
  // 到期状态
  let expiryInfo = $derived.by(() => {
    if (!displayLicense?.expiresAt) return null;
    
    const expiryDate = new Date(displayLicense.expiresAt);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      return { status: 'expired', text: '已过期', color: 'red' };
    } else if (daysUntilExpiry <= 30) {
      return { status: 'expiring', text: `${daysUntilExpiry}天后过期`, color: 'orange' };
    } else if (daysUntilExpiry <= 365) {
      return { status: 'active', text: `${daysUntilExpiry}天后过期`, color: 'green' };
    } else {
      return { status: 'long-term', text: '长期有效', color: 'green' };
    }
  });
  
</script>

{#if isActivated}
  <!-- 激活状态卡片 -->
  <div class="license-status-card activated">
    <!-- 状态头部 -->
    <div class="status-header">
      <div class="status-badge success">
        <span class="badge-text">许可证已激活</span>
      </div>
    </div>
    
    <!-- 许可证详情 -->
    <div class="license-details">
      <div class="detail-grid">
        <!-- 许可证类型 -->
        <div class="detail-item">
          <div class="detail-label">许可证类型</div>
          <div class="detail-value">
            <span class="license-type-badge {licenseTypeInfo.color}">
              {licenseTypeInfo.text}
            </span>
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">授权来源</div>
          <div class="detail-value">{licenseSourceLabel}</div>
        </div>

        <div class="detail-item">
          <div class="detail-label">当前产品授权数</div>
          <div class="detail-value">{localLicenseCount}</div>
        </div>

        {#if inheritedLicenseCount > 0}
          <div class="detail-item">
            <div class="detail-label">共享授权数</div>
            <div class="detail-value">{inheritedLicenseCount}</div>
          </div>
        {/if}
        
        <!-- 激活时间 -->
        <div class="detail-item">
          <div class="detail-label">激活时间</div>
          <div class="detail-value">
            {displayLicense?.activatedAt ? new Date(displayLicense.activatedAt).toLocaleString('zh-CN') : '-'}
          </div>
        </div>
        
        <!-- 到期时间 -->
        {#if displayLicense?.expiresAt && displayLicense.licenseType !== 'lifetime'}
          <div class="detail-item">
            <div class="detail-label">到期时间</div>
            <div class="detail-value">
              <span class="expiry-date {expiryInfo?.color}">
                {new Date(displayLicense.expiresAt).toLocaleString('zh-CN')}
              </span>
              {#if expiryInfo}
                <span class="expiry-status {expiryInfo?.color ?? ''}">
                  ({expiryInfo?.text ?? ''})
                </span>
              {/if}
            </div>
          </div>
        {/if}
        
        <!-- 产品版本 -->
        <div class="detail-item">
          <div class="detail-label">产品版本</div>
          <div class="detail-value">
            {displayLicense?.productVersion || 'v0.5.0'}
          </div>
        </div>
      </div>
      
    </div>
    
    <!-- 操作按钮 -->
    {#if showActions}
      <div class="license-actions">
        {#if onVerify}
          <button class="action-button primary" onclick={onVerify}>
            验证许可证
          </button>
        {/if}
        {#if onReset}
          <button class="action-button secondary" onclick={onReset}>
            重置许可证
          </button>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <!-- 未激活状态 -->
  <div class="license-status-card not-activated">
    <div class="status-header">
      <div class="status-badge inactive">
        <span class="badge-text">许可证未激活</span>
      </div>
    </div>
    
    <div class="inactive-message">
      <p>当前仅可使用免费功能，激活许可证后可解锁所有高级功能。</p>
    </div>
  </div>
{/if}

<style>
  .license-status-card {
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m, 8px);
    padding: 1rem 1.1rem;
    background: var(--background-primary);
  }
  
  .license-status-card.activated {
    border-color: var(--color-green);
    background: color-mix(in srgb, var(--background-primary) 92%, var(--color-green));
  }
  
  .license-status-card.not-activated {
    border-color: var(--color-orange);
    background: color-mix(in srgb, var(--background-primary) 92%, var(--color-orange));
  }
  
  .status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.625rem;
    border-radius: var(--radius-s, 6px);
    font-weight: 600;
    font-size: var(--font-ui-small);
  }
  
  .status-badge.success {
    background: color-mix(in srgb, var(--background-secondary) 72%, var(--color-green));
    color: var(--color-green);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 60%, var(--color-green));
  }
  
  .status-badge.inactive {
    background: color-mix(in srgb, var(--background-secondary) 72%, var(--color-orange));
    color: var(--color-orange);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 60%, var(--color-orange));
  }
  
  .license-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.2rem 0.55rem;
    border-radius: var(--radius-s, 6px);
    font-weight: 500;
    font-size: 0.75rem;
    border: 1px solid var(--background-modifier-border);
  }
  
  .license-type-badge.premium {
    background: color-mix(in srgb, var(--background-secondary) 76%, var(--color-purple));
    color: var(--text-normal);
  }
  
  .license-type-badge.standard {
    background: color-mix(in srgb, var(--background-secondary) 76%, var(--color-blue));
    color: var(--text-normal);
  }
  
  .license-type-badge.trial {
    background: color-mix(in srgb, var(--background-secondary) 76%, var(--color-orange));
    color: var(--text-normal);
  }

  .license-type-badge.subscription {
    background: color-mix(in srgb, var(--background-secondary) 76%, var(--color-green));
    color: var(--text-normal);
  }
  
  .detail-grid {
    display: grid;
    gap: 0;
    margin-bottom: 1rem;
  }
  
  .detail-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 0.75rem 0;
    background: transparent;
    border-radius: 0;
    border-top: 1px solid var(--background-modifier-border-hover);
  }

  .detail-grid .detail-item:first-child {
    border-top: none;
    padding-top: 0;
  }
  
  .detail-label {
    font-weight: 500;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  
  .detail-value {
    font-weight: 600;
    color: var(--text-normal);
    text-align: right;
  }
  
  .license-type-display {
    font-weight: 600;
  }
  
  .license-type-display.premium {
    color: var(--color-purple);
  }
  
  .lifetime-badge {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.125rem 0.5rem;
    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    color: white;
    border-radius: 4px;
    font-size: 0.625rem;
    font-weight: 700;
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
    gap: 0.75rem;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  
  .action-button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--button-radius, 6px);
    background: var(--background-secondary);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.875rem;
  }
  
  .action-button:hover {
    background: var(--background-modifier-hover);
  }
  
  .action-button.primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }
  
  .action-button.primary:hover {
    background: var(--interactive-accent-hover);
  }
  
  .inactive-message {
    color: var(--text-muted);
    line-height: 1.6;
  }
</style>
