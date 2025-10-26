<script lang="ts">
  /**
   * 增强的激活表单组件
   * 统一的激活码输入和验证界面
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

  import { ActivationErrorCode } from '../../../utils/types/license-types';

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
  let validationState = $state<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  let activationError = $state<string | null>(null);
  let activationSuccess = $state(false);
  let showHelp = $state(false);
  let remainingAttempts = $state<number | null>(null);

  // ==================== Derived State ====================
  
  let cleanedCode = $derived(cleanActivationCodeInput(activationCode));

  let isValidLength = $derived(cleanedCode ? isActivationCodeLengthValid(cleanedCode) : false);

  let isValidFormat = $derived(cleanedCode ? isActivationCodeFormatValid(cleanedCode) : false);

  let canActivate = $derived(isValidLength && isValidFormat && !isActivating);

  let characterCount = $derived(cleanedCode.length);

  let isInOptimalRange = $derived(() => {
    const [min, max] = ACTIVATION_CODE_FORMAT.OPTIMAL_LENGTH_RANGE;
    return characterCount >= min && characterCount <= max;
  });

  // ==================== License Status ====================

  let currentLicenseInfo = $derived(plugin.settings?.license || null);

  let isLicenseActive = $derived(currentLicenseInfo?.isActivated || false);

  // ==================== Event Handlers ====================
  
  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    activationCode = target.value;
    
    // 清除之前的错误状态
    if (activationError) {
      activationError = null;
    }
    
    // 实时验证
    if (ACTIVATION_CODE_UI.FEEDBACK.SHOW_REAL_TIME) {
      validateInput();
    }
  }

  function handlePaste(event: ClipboardEvent) {
    // 允许粘贴，然后清理格式
    setTimeout(() => {
      activationCode = cleanActivationCodeInput(activationCode);
      validateInput();
    }, 0);
  }

  function validateInput() {
    if (!cleanedCode) {
      validationState = 'idle';
      return;
    }

    validationState = 'validating';
    
    // 模拟验证延迟
    setTimeout(() => {
      if (isValidLength && isValidFormat) {
        validationState = 'valid';
      } else {
        validationState = 'invalid';
      }
    }, ACTIVATION_CODE_UI.FEEDBACK.DEBOUNCE_MS);
  }

  // ==================== Activation Logic ====================
  
  async function handleActivation() {
    if (!canActivate) return;

    // 检查激活尝试限制
    const attemptCheck = await ActivationAttemptLimiter.canAttemptActivation();
    if (!attemptCheck.canAttempt) {
      activationError = attemptCheck.error || '激活尝试次数过多';
      validationState = 'invalid';
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
        validationState = 'idle';
        
        // 调用成功回调
        if (onActivationSuccess) {
          onActivationSuccess(result.licenseInfo);
        }
        
        // 显示成功消息
        showSuccessNotification();
      } else {
        // 激活失败
        activationError = result.error || '激活失败';
        validationState = 'invalid';
        
        // 调用错误回调
        if (onActivationError) {
          onActivationError(result.error);
        }
        
        // 更新剩余尝试次数
        await updateRemainingAttempts();
      }
    } catch (error) {
      // 未预期的错误
      activationError = error instanceof Error ? error.message : '激活过程中发生未知错误';
      validationState = 'invalid';
      
      // 记录失败
      await ActivationAttemptLimiter.recordAttempt(false);
    } finally {
      isActivating = false;
    }
  }

  // ==================== Helper Functions ====================
  
  function showSuccessNotification() {
    // 这里可以集成通知系统
    console.log('✅ 激活成功！');
  }

  function toggleHelp() {
    showHelp = !showHelp;
  }

  function clearInput() {
    activationCode = '';
    validationState = 'idle';
    activationError = null;
  }

  async function updateRemainingAttempts() {
    try {
      const attemptCheck = await ActivationAttemptLimiter.canAttemptActivation();
      // 根据限制器的逻辑计算剩余次数
      remainingAttempts = attemptCheck.canAttempt ? 5 : 0;
    } catch (error) {
      console.warn('无法获取剩余尝试次数:', error);
      remainingAttempts = null;
    }
  }

  // ==================== Lifecycle ====================
  
  // 组件挂载时更新尝试次数
  $effect(() => {
    updateRemainingAttempts();
  });
</script>

<!-- 激活表单容器 -->
<div class="enhanced-activation-form">
  <!-- 表单标题 -->
  <div class="form-header">
    <h3 class="form-title">
      <span class="title-icon">🔐</span>
      许可证激活
    </h3>
    <p class="form-description">
      输入激活码以解锁高级功能
    </p>
  </div>

  {#if isLicenseActive}
    <!-- 已激活状态 -->
    <div class="activation-success-state">
      <div class="success-icon">✅</div>
      <div class="success-content">
        <h4 class="success-title">许可证已激活</h4>
        {#if currentLicenseInfo}
          <p class="success-details">
            激活时间: {new Date(currentLicenseInfo.activatedAt).toLocaleString()}
          </p>
          <p class="success-details">
            许可证类型: {currentLicenseInfo.licenseType === 'lifetime' ? '终身许可' : '订阅许可'}
          </p>
          {#if currentLicenseInfo.expiresAt && currentLicenseInfo.licenseType === 'subscription'}
            <p class="success-details">
              到期时间: {new Date(currentLicenseInfo.expiresAt).toLocaleString()}
            </p>
          {/if}
        {/if}
      </div>
    </div>
  {:else}
    <!-- 激活表单 -->
    <div class="activation-form">
      <!-- 激活码输入区域 -->
      <div class="input-section">
        <label for="activation-code" class="input-label">
          激活码
          <span class="input-hint">请粘贴完整的激活码</span>
        </label>
        
        <div class="input-container" 
             class:valid={validationState === 'valid'} 
             class:invalid={validationState === 'invalid'}
             class:validating={validationState === 'validating'}>
          
          <textarea
            id="activation-code"
            class="activation-textarea"
            placeholder={ACTIVATION_CODE_UI.INPUT.PLACEHOLDER}
            rows={ACTIVATION_CODE_UI.INPUT.TEXTAREA_ROWS}
            maxlength={ACTIVATION_CODE_UI.INPUT.MAX_LENGTH_ATTR}
            bind:value={activationCode}
            oninput={handleInput}
            onpaste={handlePaste}
            disabled={isActivating}
          ></textarea>
          
          <!-- 验证状态指示器 -->
          <div class="validation-indicator">
            {#if validationState === 'validating'}
              <span class="indicator validating">⏳</span>
            {:else if validationState === 'valid'}
              <span class="indicator valid">✅</span>
            {:else if validationState === 'invalid'}
              <span class="indicator invalid">❌</span>
            {/if}
          </div>
          
          <!-- 清除按钮 -->
          {#if activationCode}
            <button 
              class="clear-button" 
              onclick={clearInput}
              disabled={isActivating}
              title="清除输入"
            >
              ✕
            </button>
          {/if}
        </div>
        
        <!-- 字符计数和格式提示 -->
        {#if ACTIVATION_CODE_UI.FEEDBACK.SHOW_CHARACTER_COUNT}
          <div class="input-feedback">
            <span class="character-count" class:optimal={isInOptimalRange}>
              {characterCount} / {ACTIVATION_CODE_FORMAT.MAX_LENGTH} 字符
            </span>
            {#if ACTIVATION_CODE_UI.FEEDBACK.SHOW_FORMAT_HINTS && cleanedCode}
              <span class="format-hint">
                {#if isValidLength && isValidFormat}
                  ✅ 格式正确
                {:else if !isValidLength}
                  ⚠️ 长度不符合要求
                {:else if !isValidFormat}
                  ⚠️ 格式不正确
                {/if}
              </span>
            {/if}
          </div>
        {/if}
      </div>

      <!-- 操作按钮区域 -->
      <div class="action-section">
        <button 
          class="activate-button"
          class:loading={isActivating}
          disabled={!canActivate}
          onclick={handleActivation}
        >
          {#if isActivating}
            <span class="loading-spinner"></span>
            激活中...
          {:else}
            🚀 激活许可证
          {/if}
        </button>
        
        <button 
          class="help-button"
          onclick={toggleHelp}
          disabled={isActivating}
        >
          {showHelp ? '隐藏帮助' : '显示帮助'}
        </button>
      </div>
    </div>
  {/if}

  <!-- 帮助信息区域 -->
  {#if showHelp}
    <div class="help-section">
      <div class="help-content">
        <h4>激活码格式说明</h4>
        <p>{ACTIVATION_HELP_TEXT.FORMAT_HELP}</p>

        <h4>输入提示</h4>
        <ul>
          {#each ACTIVATION_HELP_TEXT.INPUT_TIPS as tip}
            <li>{tip}</li>
          {/each}
        </ul>

        <h4>故障排除</h4>
        <ul>
          {#each ACTIVATION_HELP_TEXT.TROUBLESHOOTING as tip}
            <li>{tip}</li>
          {/each}
        </ul>

        <h4>联系支持</h4>
        <p>
          如需帮助，请联系：
          <a href="mailto:{ACTIVATION_HELP_TEXT.CONTACT_INFO.email}?subject={ACTIVATION_HELP_TEXT.CONTACT_INFO.subject}">
            {ACTIVATION_HELP_TEXT.CONTACT_INFO.email}
          </a>
        </p>
      </div>
    </div>
  {/if}

  <!-- 错误信息显示 -->
  {#if activationError}
    {@const errorInfo = getActivationErrorMessage(activationError.code)}
    <div class="error-section">
      <div class="error-header">
        <span class="error-icon">⚠️</span>
        <span class="error-title">{errorInfo.title}</span>
      </div>
      <div class="error-message">{activationError.message}</div>
      {#if activationError.details}
        <div class="error-details">{activationError.details}</div>
      {/if}
      {#if activationError.suggestedAction}
        <div class="error-action">
          <strong>建议操作：</strong> {activationError.suggestedAction}
        </div>
      {/if}
      {#if remainingAttempts !== null}
        <div class="remaining-attempts">
          剩余尝试次数：{remainingAttempts}
        </div>
      {/if}
    </div>
  {/if}

  <!-- 成功信息显示 -->
  {#if activationSuccess}
    <div class="success-section">
      <div class="success-header">
        <span class="success-icon">✅</span>
        <span class="success-title">激活成功！</span>
      </div>
      <div class="success-message">许可证已成功激活，高级功能已启用</div>
    </div>
  {/if}
</div>

<!-- ==================== Styles ==================== -->

<style>
  .enhanced-activation-form {
    max-width: 700px;
    margin: 0 auto 2rem auto;
    padding: 2rem;
    background: linear-gradient(135deg,
      var(--background-primary) 0%,
      color-mix(in oklab, var(--background-primary), var(--background-secondary) 10%) 100%);
    border-radius: 12px;
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--background-modifier-border), transparent 50%);
  }

  /* 表单标题 */
  .form-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .form-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .title-icon {
    font-size: 1.2em;
  }

  .form-description {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  /* 已激活状态 */
  .activation-success-state {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    background: color-mix(in oklab, var(--color-green), transparent 90%);
    border: 1px solid color-mix(in oklab, var(--color-green), transparent 70%);
    border-radius: 8px;
  }

  .success-icon {
    font-size: 2rem;
  }

  .success-content h4 {
    margin: 0 0 0.5rem 0;
    color: var(--color-green);
    font-size: 1.1rem;
  }

  .success-details {
    margin: 0.25rem 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  /* 激活表单 */
  .activation-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* 输入区域 */
  .input-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .input-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 500;
    color: var(--text-normal);
  }

  .input-hint {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-weight: normal;
  }

  .input-container {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .activation-textarea {
    flex: 1;
    padding: 0.75rem;
    border: 2px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-monospace);
    font-size: 0.85rem;
    line-height: 1.4;
    resize: vertical;
    min-height: 100px;
    transition: all 0.2s ease;
  }

  .activation-textarea:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--interactive-accent), transparent 80%);
  }

  .input-container.valid .activation-textarea {
    border-color: var(--color-green);
  }

  .input-container.invalid .activation-textarea {
    border-color: var(--color-red);
  }

  .input-container.validating .activation-textarea {
    border-color: var(--color-orange);
  }

  .validation-indicator {
    position: absolute;
    right: 0.5rem;
    top: 0.5rem;
    font-size: 1rem;
  }

  .clear-button {
    position: absolute;
    right: 0.5rem;
    bottom: 0.5rem;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: var(--background-modifier-hover);
    color: var(--text-muted);
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    transition: all 0.2s ease;
  }

  .clear-button:hover {
    background: var(--background-modifier-border);
    color: var(--text-normal);
  }

  /* 输入反馈 */
  .input-feedback {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .character-count.optimal {
    color: var(--color-green);
  }

  .format-hint {
    font-weight: 500;
  }

  /* 操作按钮 */
  .action-section {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .activate-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 2rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 150px;
  }

  .activate-button:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
  }

  .activate-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .help-button {
    padding: 0.75rem 1.5rem;
    background: var(--background-secondary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .help-button:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  /* 加载动画 */
  .loading-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* 帮助区域 */
  .help-section {
    margin-top: 1.5rem;
    padding: 1.5rem;
    background: var(--background-secondary);
    border-radius: 8px;
    border-left: 4px solid var(--interactive-accent);
  }

  .help-content h4 {
    margin: 1rem 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .help-content h4:first-child {
    margin-top: 0;
  }

  .help-content ul {
    margin: 0.5rem 0 1rem 0;
    padding-left: 1.5rem;
  }

  .help-content li {
    margin: 0.25rem 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .help-content p {
    margin: 0.5rem 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .help-content a {
    color: var(--text-accent);
    text-decoration: none;
  }

  .help-content a:hover {
    text-decoration: underline;
  }

  /* 错误区域 */
  .error-section {
    margin-top: 1rem;
    padding: 1rem;
    background: color-mix(in oklab, var(--color-red), transparent 90%);
    border: 1px solid color-mix(in oklab, var(--color-red), transparent 70%);
    border-radius: 6px;
  }

  .error-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .error-icon {
    font-size: 1.2rem;
  }

  .error-title {
    font-weight: 600;
    color: var(--color-red);
  }

  .error-message {
    color: var(--text-normal);
    margin-bottom: 0.5rem;
  }

  .error-details {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }

  .error-action {
    color: var(--text-normal);
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }

  .remaining-attempts {
    color: var(--color-orange);
    font-weight: 500;
    font-size: 0.9rem;
  }

  /* 成功区域 */
  .success-section {
    margin-top: 1rem;
    padding: 1rem;
    background: color-mix(in oklab, var(--color-green), transparent 90%);
    border: 1px solid color-mix(in oklab, var(--color-green), transparent 70%);
    border-radius: 6px;
  }

  .success-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .success-icon {
    font-size: 1.2rem;
  }

  .success-title {
    font-weight: 600;
    color: var(--color-green);
  }

  .success-message {
    color: var(--text-normal);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .enhanced-activation-form {
      margin: 0 0 1rem 0;
      padding: 1.5rem;
    }

    .form-title {
      font-size: 1.3rem;
    }

    .activation-textarea {
      font-size: 0.8rem;
    }

    .action-section {
      flex-direction: column;
    }

    .activate-button {
      min-width: auto;
    }
  }
</style>
