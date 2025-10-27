<script lang="ts">
  /**
   * 紧凑的激活表单组件
   * 参考PKMer设计风格的简洁激活界面
   */
  
  import {
    ACTIVATION_CODE_FORMAT,
    ACTIVATION_CODE_UI,
    ACTIVATION_ERROR_MESSAGES,
    ACTIVATION_SUCCESS_MESSAGES,
    ACTIVATION_HELP_TEXT,
    cleanActivationCodeInput,
    isActivationCodeLengthValid,
    isActivationCodeFormatValid,
    getActivationErrorMessage
  } from '../constants/activation-constants';
  
  import { licenseManager, ActivationAttemptLimiter } from '../../../utils/licenseManager';

  // ==================== Props ====================
  
  interface Props {
    plugin: any; // PluginExtended type
    onSave: () => Promise<void>;
    onActivationSuccess?: (licenseInfo: any) => void;
    onActivationError?: (error: any) => void;
  }

  let { 
    plugin, 
    onSave, 
    onActivationSuccess, 
    onActivationError 
  }: Props = $props();

  // ==================== State Management ====================
  
  let activationCode = $state('');
  let isActivating = $state(false);
  let activationError = $state<string | null>(null);
  let activationSuccess = $state(false);

  // ==================== Derived State ====================
  
  let cleanedCode = $derived(cleanActivationCodeInput(activationCode));

  let isValidLength = $derived(cleanedCode ? isActivationCodeLengthValid(cleanedCode) : false);

  let isValidFormat = $derived(cleanedCode ? isActivationCodeFormatValid(cleanedCode) : false);

  let canActivate = $derived(isValidLength && isValidFormat && !isActivating && cleanedCode.length > 0);

  // ==================== License Status ====================

  let currentLicenseInfo = $derived(plugin.settings?.license || null);

  let isLicenseActive = $derived(currentLicenseInfo?.isActivated || false);

  // ==================== Event Handlers ====================
  
  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    activationCode = target.value;
    
    // 清除之前的错误状态
    if (activationError) {
      activationError = null;
    }
  }

  function handlePaste(event: ClipboardEvent) {
    // 允许粘贴，然后清理格式
    setTimeout(() => {
      activationCode = cleanActivationCodeInput(activationCode);
    }, 0);
  }

  // ==================== Activation Logic ====================
  
  async function handleActivation() {
    if (!canActivate) return;

    // 检查激活尝试限制
    const attemptCheck = await ActivationAttemptLimiter.canAttemptActivation();
    if (!attemptCheck.canAttempt) {
      activationError = attemptCheck.error || '激活尝试次数过多';
      return;
    }

    isActivating = true;
    activationError = null;
    activationSuccess = false;

    try {
      const result = await licenseManager.activateLicense(cleanedCode);

      // 记录激活尝试
      await ActivationAttemptLimiter.recordAttempt(result.success);

      if (result.success && result.licenseInfo) {
        // 更新插件设置
        plugin.settings.license = result.licenseInfo;
        await onSave();
        
        // 显示成功状态
        activationSuccess = true;
        activationCode = '';
        
        // 调用成功回调
        if (onActivationSuccess) {
          onActivationSuccess(result.licenseInfo);
        }
        
        // 3秒后隐藏成功消息
        setTimeout(() => {
          activationSuccess = false;
        }, 3000);
      } else {
        // 激活失败
        activationError = result.error || '激活失败';
        
        // 调用错误回调
        if (onActivationError) {
          onActivationError(result.error);
        }
      }
    } catch (error) {
      // 未预期的错误
      activationError = error instanceof Error ? error.message : '激活过程中发生未知错误';
      
      // 记录失败
      await ActivationAttemptLimiter.recordAttempt(false);
    } finally {
      isActivating = false;
    }
  }

  // 获取激活码
  function handleGetLicense() {
    window.open('https://pay.ldxp.cn/item/ned9pw', '_blank');
  }
</script>

<!-- 紧凑激活表单容器 -->
<div class="compact-activation-form">
  {#if isLicenseActive}
    <!-- 已激活状态 -->
    <div class="activation-status active">
      <div class="status-icon">✅</div>
      <div class="status-content">
        <div class="status-title">许可证已激活</div>
        <div class="status-details">
          {#if currentLicenseInfo}
            {currentLicenseInfo.licenseType === 'lifetime' ? '终身许可' : '订阅许可'}
            {#if currentLicenseInfo.expiresAt && currentLicenseInfo.licenseType === 'subscription'}
              · 到期: {new Date(currentLicenseInfo.expiresAt).toLocaleDateString()}
            {/if}
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <!-- 激活表单 -->
    <div class="activation-form">
      <!-- 标题和链接 -->
      <div class="form-header">
        <span class="header-text">解锁高级功能，获取激活码</span>
        <a 
          href="https://pay.ldxp.cn/item/ned9pw" 
          target="_blank" 
          class="header-link"
        >
          →
        </a>
      </div>

      <!-- 激活码输入 -->
      <div class="input-container">
        <input
          type="text"
          class="activation-input"
          placeholder="在这里输入激活码"
          bind:value={activationCode}
          oninput={handleInput}
          onpaste={handlePaste}
          disabled={isActivating}
        />
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <button 
          class="action-button secondary"
          onclick={handleGetLicense}
          disabled={isActivating}
        >
          获取激活码
        </button>
        <button 
          class="action-button primary"
          class:loading={isActivating}
          disabled={!canActivate}
          onclick={handleActivation}
        >
          {#if isActivating}
            激活中...
          {:else}
            激活许可证
          {/if}
        </button>
      </div>

      <!-- 支持信息 -->
      <div class="support-info">
        遇到问题？
        <a 
          href={`mailto:${ACTIVATION_HELP_TEXT.CONTACT_INFO.email}?subject=${ACTIVATION_HELP_TEXT.CONTACT_INFO.subject}`}
          class="support-link"
        >
          联系 Tuanki 团队获取支持
        </a>
      </div>
    </div>
  {/if}

  <!-- 错误信息 -->
  {#if activationError}
    <div class="error-message">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{activationError}</span>
    </div>
  {/if}

  <!-- 成功信息 -->
  {#if activationSuccess}
    <div class="success-message">
      <span class="success-icon">✅</span>
      <span class="success-text">激活成功！高级功能已启用</span>
    </div>
  {/if}
</div>

<style>
  .compact-activation-form {
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid var(--background-modifier-border);
    width: 100%;
    box-sizing: border-box;
  }

  /* 已激活状态 */
  .activation-status.active {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: color-mix(in oklab, var(--color-green), transparent 90%);
    border: 1px solid color-mix(in oklab, var(--color-green), transparent 70%);
    border-radius: 0.5rem;
  }

  .status-icon {
    font-size: 1.25rem;
  }

  .status-title {
    font-weight: 600;
    color: var(--color-green);
    margin-bottom: 0.25rem;
  }

  .status-details {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* 激活表单 */
  .activation-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .header-text {
    flex: 1;
  }

  .header-link {
    color: var(--text-accent);
    text-decoration: none;
    font-weight: 600;
    font-size: 1rem;
  }

  .header-link:hover {
    color: var(--text-accent-hover);
  }

  /* 输入框 */
  .input-container {
    position: relative;
  }

  .activation-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .activation-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--interactive-accent), transparent 80%);
  }

  .activation-input::placeholder {
    color: var(--text-faint);
  }

  /* 操作按钮 */
  .action-buttons {
    display: flex;
    gap: 0.75rem;
  }

  .action-button {
    flex: 1;
    padding: 0.625rem 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-button.secondary {
    background: var(--background-secondary);
    color: var(--text-normal);
  }

  .action-button.secondary:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .action-button.primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }

  .action-button.primary:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }

  .action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-button.loading {
    position: relative;
  }

  /* 支持信息 */
  .support-info {
    text-align: center;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .support-link {
    color: var(--text-accent);
    text-decoration: none;
  }

  .support-link:hover {
    text-decoration: underline;
  }

  /* 错误和成功消息 */
  .error-message,
  .success-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  .error-message {
    background: color-mix(in oklab, var(--color-red), transparent 90%);
    border: 1px solid color-mix(in oklab, var(--color-red), transparent 70%);
    color: var(--color-red);
  }

  .success-message {
    background: color-mix(in oklab, var(--color-green), transparent 90%);
    border: 1px solid color-mix(in oklab, var(--color-green), transparent 70%);
    color: var(--color-green);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .action-buttons {
      flex-direction: column;
    }
    
    .form-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
  }
</style>
