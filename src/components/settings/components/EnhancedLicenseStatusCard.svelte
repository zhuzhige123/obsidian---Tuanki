<script lang="ts">
  /**
   * 增强的许可证状态卡片组件
   * 提供清晰、突出的激活状态显示
   */
  
  import type { LicenseInfo } from '../types/settings-types';
  import { formatActivationCode, copyToClipboard, showNotification } from '../utils/settings-utils';
  
  interface Props {
    license: LicenseInfo;
    showActions?: boolean;
    onVerify?: () => Promise<void>;
    onReset?: () => Promise<void>;
  }
  
  let { license, showActions = true, onVerify, onReset }: Props = $props();
  
  // 状态计算
  let isActivated = $derived(license?.isActivated || false);
  let showFullActivationCode = $state(false);
  
  // 许可证类型显示
  let licenseTypeInfo = $derived(() => {
    if (!license?.licenseType) return { text: '未知', icon: '❓', color: 'gray' };

    switch (license.licenseType) {
      case 'lifetime':
        return { text: '永久买断', icon: '💎', color: 'premium' };
      case 'subscription':
        return { text: '订阅许可', icon: '🔄', color: 'subscription' };
      case 'premium':
        return { text: '高级版', icon: '💎', color: 'premium' };
      case 'standard':
        return { text: '标准版', icon: '⭐', color: 'standard' };
      case 'trial':
        return { text: '试用版', icon: '🔄', color: 'trial' };
      default:
        return { text: '许可证', icon: '🔑', color: 'default' };
    }
  });
  
  // 到期状态
  let expiryInfo = $derived(() => {
    if (!license?.expiresAt) return null;
    
    const expiryDate = new Date(license.expiresAt);
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
  
  // 复制激活码
  async function handleCopyActivationCode() {
    if (!license?.activationCode) return;
    
    const success = await copyToClipboard(license.activationCode);
    if (success) {
      showNotification({
        message: "激活码已复制到剪贴板",
        type: 'success'
      });
    } else {
      showNotification({
        message: "复制失败，请手动复制",
        type: 'error'
      });
    }
  }
</script>

{#if isActivated}
  <!-- 激活状态卡片 -->
  <div class="license-status-card activated">
    <!-- 状态头部 -->
    <div class="status-header">
      <div class="status-badge success">
        <span class="badge-icon">✅</span>
        <span class="badge-text">许可证已激活</span>
      </div>
      
      <div class="license-type-badge {licenseTypeInfo().color}">
        <span class="type-icon">{licenseTypeInfo().icon}</span>
        <span class="type-text">{licenseTypeInfo().text}</span>
      </div>
    </div>
    
    <!-- 许可证详情 -->
    <div class="license-details">
      <div class="detail-grid">
        <!-- 许可证类型 -->
        <div class="detail-item">
          <div class="detail-label">许可证类型</div>
          <div class="detail-value">
            <span class="license-type-display {licenseTypeInfo().color}">
              {licenseTypeInfo().icon} {licenseTypeInfo().text}
            </span>
            {#if license.licenseType === 'lifetime'}
              <span class="lifetime-badge">永久有效</span>
            {/if}
          </div>
        </div>
        
        <!-- 激活时间 -->
        <div class="detail-item">
          <div class="detail-label">激活时间</div>
          <div class="detail-value">
            {new Date(license.activatedAt).toLocaleString('zh-CN')}
          </div>
        </div>
        
        <!-- 到期时间 -->
        {#if license.expiresAt && license.licenseType !== 'lifetime'}
          <div class="detail-item">
            <div class="detail-label">到期时间</div>
            <div class="detail-value">
              <span class="expiry-date {expiryInfo?.color}">
                {new Date(license.expiresAt).toLocaleString('zh-CN')}
              </span>
              {#if expiryInfo}
                <span class="expiry-status {expiryInfo.color}">
                  ({expiryInfo.text})
                </span>
              {/if}
            </div>
          </div>
        {/if}
        
        <!-- 产品版本 -->
        <div class="detail-item">
          <div class="detail-label">产品版本</div>
          <div class="detail-value">
            {license.productVersion || 'v0.5.0'}
          </div>
        </div>
      </div>
      
      <!-- 激活码显示 -->
      <div class="activation-code-section">
        <div class="activation-code-header">
          <span class="code-label">激活码</span>
          <div class="code-actions">
            <button
              class="action-button"
              onclick={() => showFullActivationCode = !showFullActivationCode}
              title={showFullActivationCode ? "收起" : "展开"}
            >
              {showFullActivationCode ? "📄" : "👁️"}
            </button>
            <button
              class="action-button"
              onclick={handleCopyActivationCode}
              title="复制激活码"
            >
              📋
            </button>
          </div>
        </div>
        
        <div class="activation-code-display">
          <code class="activation-code-text" class:full={showFullActivationCode}>
            {formatActivationCode(license.activationCode, showFullActivationCode)}
          </code>
        </div>
      </div>
    </div>
    
    <!-- 操作按钮 -->
    {#if showActions}
      <div class="license-actions">
        {#if onVerify}
          <button class="action-button primary" onclick={onVerify}>
            🔍 验证许可证
          </button>
        {/if}
        {#if onReset}
          <button class="action-button secondary" onclick={onReset}>
            🔄 重置许可证
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
        <span class="badge-icon">⚠️</span>
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
    border-radius: 12px;
    padding: 1.5rem;
    background: var(--background-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .license-status-card.activated {
    border-color: var(--color-green);
    background: linear-gradient(135deg, var(--background-primary) 0%, rgba(16, 185, 129, 0.05) 100%);
  }
  
  .license-status-card.not-activated {
    border-color: var(--color-orange);
    background: linear-gradient(135deg, var(--background-primary) 0%, rgba(245, 158, 11, 0.05) 100%);
  }
  
  .status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }
  
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    font-weight: 600;
    font-size: 0.875rem;
  }
  
  .status-badge.success {
    background: rgba(16, 185, 129, 0.1);
    color: var(--color-green);
    border: 1px solid rgba(16, 185, 129, 0.2);
  }
  
  .status-badge.inactive {
    background: rgba(245, 158, 11, 0.1);
    color: var(--color-orange);
    border: 1px solid rgba(245, 158, 11, 0.2);
  }
  
  .license-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-weight: 500;
    font-size: 0.75rem;
  }
  
  .license-type-badge.premium {
    background: linear-gradient(135deg, #8B5CF6 0%, #A855F7 100%);
    color: white;
  }
  
  .license-type-badge.standard {
    background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
    color: white;
  }
  
  .license-type-badge.trial {
    background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
    color: white;
  }

  .license-type-badge.subscription {
    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    color: white;
  }
  
  .detail-grid {
    display: grid;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .detail-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--background-secondary);
    border-radius: 8px;
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
  
  .activation-code-section {
    background: var(--background-secondary);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  
  .activation-code-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .code-label {
    font-weight: 500;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  
  .code-actions {
    display: flex;
    gap: 0.25rem;
  }
  
  .activation-code-display {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 0.75rem;
  }
  
  .activation-code-text {
    font-family: var(--font-monospace);
    font-size: 0.75rem;
    color: var(--text-muted);
    word-break: break-all;
    line-height: 1.4;
  }
  
  .activation-code-text.full {
    white-space: pre-wrap;
  }
  
  .license-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }
  
  .action-button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-secondary);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.875rem;
  }
  
  .action-button:hover {
    background: var(--background-modifier-hover);
    transform: translateY(-1px);
  }
  
  .action-button.primary {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }
  
  .action-button.primary:hover {
    background: var(--color-accent-hover);
  }
  
  .inactive-message {
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
  }
</style>
