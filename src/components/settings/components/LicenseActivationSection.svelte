<script lang="ts">
  import type { PluginExtended } from '../types/settings-types';
  import { 
    validateActivationCode,
    showNotification,
    handleError,
    getLicenseStatusInfo
  } from '../utils/settings-utils';
  import { CONTACT_INFO } from '../constants/settings-constants';
  import { licenseManager } from "../../../utils/licenseManager";

  interface Props {
    plugin: PluginExtended;
    onSave: () => Promise<void>;
  }

  let { plugin, onSave }: Props = $props();

  // 激活码相关状态
  let activationCodeInput = $state("");
  let isActivating = $state(false);
  let activationMessage = $state("");
  let activationError = $state("");
  let isValidFormat = $state(false);

  // 获取许可证状态信息
  const licenseStatusInfo = $derived(getLicenseStatusInfo(plugin.settings.license));

  // 计算派生状态
  const isLicenseActive = $derived(licenseStatusInfo.status === 'active');
  const licenseDisplayName = $derived(() => {
    const license = plugin.settings.license;
    if (!license?.isActivated) return '';
    switch (license.licenseType) {
      case 'trial': return '试用许可';
      case 'standard': return '标准许可';
      case 'premium': return '高级许可';
      default: return '许可证';
    }
  });
  const licenseExpiryDate = $derived(() => {
    const license = plugin.settings.license;
    if (!license?.expiresAt) return null;
    return new Date(license.expiresAt).toLocaleDateString();
  });

  // 实时验证激活码输入
  function validateActivationCodeInput() {
    activationError = "";
    
    if (!activationCodeInput.trim()) {
      isValidFormat = false;
      return;
    }

    const validation = validateActivationCode(activationCodeInput);
    isValidFormat = validation.isValid;
    
    if (!validation.isValid && activationCodeInput.length >= 8) {
      activationError = validation.errors[0] || "激活码格式不正确";
    }
  }

  // 激活许可证
  async function activateLicense() {
    if (!isValidFormat || isActivating) return;

    isActivating = true;
    activationMessage = "";
    activationError = "";

    try {
      const result = await licenseManager.activateLicense(activationCodeInput.trim());
      
      if (result.success) {
        // 类型转换以匹配设置类型
        const licenseInfo = result.licenseInfo!;
        plugin.settings.license = {
          activationCode: licenseInfo.activationCode,
          isActivated: licenseInfo.isActivated,
          activatedAt: licenseInfo.activatedAt,
          expiresAt: licenseInfo.expiresAt,
          licenseType: licenseInfo.licenseType === 'lifetime' ? 'premium' : 'standard',
          productVersion: licenseInfo.productVersion
        };
        await onSave();

        activationMessage = "许可证激活成功！";
        activationCodeInput = "";
        showNotification({ message: "许可证激活成功", type: "success" });
      } else {
        activationError = result.error || "激活失败";
        showNotification({ message: activationError, type: "error" });
      }
    } catch (error) {
      const errorResult = handleError(error, "激活许可证时发生错误");
      activationError = errorResult.error || "激活失败";
      showNotification({ message: activationError, type: "error" });
    } finally {
      isActivating = false;
    }
  }

  // 处理输入变化
  function handleInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    activationCodeInput = target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    validateActivationCodeInput();
  }

  // 处理键盘事件
  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && isValidFormat && !isActivating) {
      activateLicense();
    }
  }
</script>

<div class="license-activation-section">
  <!-- 激活区域头部 -->
  <div class="activation-header">
    <div class="activation-icon">🔑</div>
    <div class="activation-content">
      <h3 class="activation-title">高级功能激活</h3>
      <p class="activation-subtitle">
        {#if isLicenseActive}
          您的高级功能已激活，享受完整的 Tuanki 体验
        {:else}
          输入激活码解锁所有高级功能
        {/if}
      </p>
    </div>
  </div>

  {#if !isLicenseActive}
    <!-- 激活表单 -->
    <div class="activation-form">
      <div class="input-group">
        <input
          type="text"
          class="activation-input"
          class:error={activationError}
          class:valid={isValidFormat}
          placeholder="请输入激活码"
          maxlength="32"
          value={activationCodeInput}
          oninput={handleInputChange}
          onkeypress={handleKeyPress}
          disabled={isActivating}
        />
        <button
          class="activation-btn"
          class:loading={isActivating}
          disabled={!isValidFormat || isActivating}
          onclick={activateLicense}
        >
          {#if isActivating}
            <span class="loading-spinner"></span>
            激活中...
          {:else}
            激活
          {/if}
        </button>
      </div>

      <!-- 状态信息 -->
      <div class="activation-status">
        <span class="status-indicator inactive">
          <span class="status-dot"></span>
          未激活
        </span>
        <a 
          href={`mailto:${CONTACT_INFO.EMAIL}?subject=${encodeURIComponent(CONTACT_INFO.SUPPORT_EMAIL_SUBJECT)}`}
          class="purchase-link"
        >
          购买激活码
        </a>
      </div>

      <!-- 错误和成功消息 -->
      {#if activationError}
        <div class="activation-message error">
          <span class="message-icon">⚠️</span>
          {activationError}
        </div>
      {/if}

      {#if activationMessage}
        <div class="activation-message success">
          <span class="message-icon">✅</span>
          {activationMessage}
        </div>
      {/if}
    </div>
  {:else}
    <!-- 已激活状态 -->
    <div class="activation-active">
      <div class="active-status">
        <span class="status-indicator active">
          <span class="status-dot"></span>
          已激活
        </span>
        <span class="license-type">{licenseDisplayName}</span>
      </div>

      {#if licenseExpiryDate}
        <div class="license-info">
          <span class="info-label">有效期至:</span>
          <span class="info-value">{licenseExpiryDate}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .license-activation-section {
    background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
    border: 2px solid var(--color-accent);
    border-radius: 1rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    position: relative;
    overflow: hidden;
  }

  .license-activation-section::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--color-accent) 0%, #3b82f6 100%);
  }

  .activation-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .activation-icon {
    font-size: 2rem;
    color: var(--color-accent);
  }

  .activation-content {
    flex: 1;
  }

  .activation-title {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .activation-subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .activation-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .input-group {
    display: flex;
    gap: 0.5rem;
  }

  .activation-input {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-family: var(--font-monospace);
    background: var(--background-primary);
    color: var(--text-normal);
    transition: all 0.15s ease;
  }

  .activation-input:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1);
  }

  .activation-input.valid {
    border-color: var(--color-green);
  }

  .activation-input.error {
    border-color: var(--color-red);
  }

  .activation-btn {
    padding: 0.75rem 1.5rem;
    background: var(--color-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .activation-btn:hover:not(:disabled) {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .activation-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .loading-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .activation-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .status-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-indicator.inactive {
    background: rgba(107, 114, 128, 0.1);
    color: var(--text-muted);
  }

  .status-indicator.active {
    background: rgba(16, 185, 129, 0.1);
    color: var(--color-green);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .purchase-link {
    color: var(--color-accent);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .purchase-link:hover {
    text-decoration: underline;
  }

  .activation-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .activation-message.error {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-red);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .activation-message.success {
    background: rgba(16, 185, 129, 0.1);
    color: var(--color-green);
    border: 1px solid rgba(16, 185, 129, 0.2);
  }

  .activation-active {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .active-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .license-type {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  .license-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .info-label {
    color: var(--text-muted);
  }

  .info-value {
    color: var(--text-normal);
    font-weight: 500;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .activation-header {
      flex-direction: column;
      text-align: center;
      gap: 0.5rem;
    }

    .input-group {
      flex-direction: column;
    }

    .activation-btn {
      width: 100%;
      justify-content: center;
    }

    .activation-status {
      flex-direction: column;
      gap: 0.5rem;
      text-align: center;
    }

    .active-status {
      flex-direction: column;
      gap: 0.5rem;
      text-align: center;
    }
  }
</style>
