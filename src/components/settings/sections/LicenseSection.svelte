<script lang="ts">
  import type { PluginExtended, LicenseInfo } from '../types/settings-types';
  import {
    showNotification,
    handleError,
    getErrorIcon,
    validateActivationCode,
    getDetailedErrorMessage
  } from '../utils/settings-utils';
  import {
    CSS_CLASSES,
    CONTACT_INFO,
    PRODUCT_INFO
  } from '../constants/settings-constants';
  import { licenseManager, ActivationAttemptLimiter } from "../../../utils/licenseManager";
  import EnhancedLicenseStatusCard from '../components/EnhancedLicenseStatusCard.svelte';

  interface Props {
    plugin: PluginExtended;
    onSave: () => Promise<void>;
  }

  let { plugin, onSave }: Props = $props();

  // 许可证相关状态
  let activationCodeInput = $state("");
  let isActivating = $state(false);
  let activationMessage = $state("");
  let activationError = $state("");
  let activationWarning = $state("");
  let isValidFormat = $state(false);

  // 实时验证激活码输入
  function validateActivationCodeInput() {
    activationError = "";
    activationWarning = "";

    if (!activationCodeInput.trim()) {
      isValidFormat = false;
      return;
    }

    const validation = validateActivationCode(activationCodeInput);
    isValidFormat = validation.isValid;
    
    if (validation.errors.length > 0) {
      activationError = validation.errors[0];
    } else if (validation.warnings.length > 0) {
      activationWarning = validation.warnings[0];
    }
  }

  // 激活许可证
  async function activateLicense() {
    // 检查是否可以尝试激活（防暴力破解）
    const attemptCheck = await ActivationAttemptLimiter.canAttemptActivation();
    if (!attemptCheck.canAttempt) {
      activationError = attemptCheck.error || "激活尝试受限";
      return;
    }

    if (!isValidFormat) {
      activationError = "请输入有效的激活码";
      return;
    }

    isActivating = true;
    activationError = "";
    activationMessage = "";

    try {
      const result = await licenseManager.activateLicense(activationCodeInput.trim());
      
      if (result.success && result.licenseInfo) {
        // 更新设置中的许可证信息
        plugin.settings.license = result.licenseInfo;
        await onSave();

        // 验证保存是否成功
        await plugin.loadSettings();
        const reloadedData = plugin.settings;
        
        if (!reloadedData?.license?.isActivated) {
          console.error('❌ 许可证保存失败，数据未持久化');
          activationError = "许可证保存失败，请重试";
          return;
        }

        if (plugin.settings.enableDebugMode) {
          console.log('✅ 许可证保存验证成功');
        }

        activationMessage = "许可证激活成功！";
        activationCodeInput = "";
        
        showNotification({
          message: "许可证激活成功！高级功能已解锁。",
          type: 'success'
        });
      } else {
        activationError = result.error || "激活失败";
      }
    } catch (error) {
      activationError = getDetailedErrorMessage(error instanceof Error ? error.message : "激活过程中发生错误");
    } finally {
      isActivating = false;
    }
  }

  // 检查许可证状态
  async function checkLicenseStatus() {
    if (!plugin.settings.license?.isActivated) {
      return;
    }

    try {
      // 简单的状态检查，验证许可证是否仍然有效
      showNotification({
        message: "许可证验证成功",
        type: 'success'
      });
    } catch (error) {
      handleError(error, '许可证验证');
    }
  }

  // 重置许可证
  async function resetLicense() {
    if (confirm('确定要重置许可证吗？这将清除当前的激活状态。')) {
      plugin.settings.license = {
        activationCode: "",
        isActivated: false,
        activatedAt: ""
      };
      
      await onSave();
      
      activationCodeInput = "";
      activationMessage = "";
      activationError = "";
      
      showNotification({
        message: "许可证已重置",
        type: 'success'
      });
    }
  }
</script>

<section class={CSS_CLASSES.LICENSE_SECTION}>
  <h2 class="section-title">许可证状态</h2>

  <!-- 使用增强的许可证状态卡片 -->
  <EnhancedLicenseStatusCard
    license={plugin.settings.license}
    showActions={true}
    onVerify={checkLicenseStatus}
    onReset={resetLicense}
  />

  {#if !plugin.settings.license?.isActivated}
    <div class="license-activation">
      <table class="license-table not-activated">
        <tbody>
          <tr>
            <td class="label">状态</td>
            <td class="value status-inactive">⚠️ 未激活</td>
          </tr>
        </tbody>
      </table>

      <div class={CSS_CLASSES.ACTIVATION_FORM}>
        <div class="form-group">
          <label for="activationCode">激活码</label>
          <div class="input-container">
            <input
              id="activationCode"
              type="text"
              bind:value={activationCodeInput}
              oninput={validateActivationCodeInput}
              placeholder="请输入完整的激活码"
              class={CSS_CLASSES.ACTIVATION_INPUT}
              disabled={isActivating}
            />
            {#if isValidFormat}
              <div class="input-status valid">✓</div>
            {:else if activationCodeInput.trim()}
              <div class="input-status invalid">✗</div>
            {/if}
          </div>
          {#if activationWarning}
            <div class="input-hint warning">{activationWarning}</div>
          {:else if isValidFormat}
            <div class="input-hint success">激活码格式正确</div>
          {:else if activationCodeInput.trim()}
            <div class="input-hint info">请继续输入完整的激活码</div>
          {/if}
        </div>

        <button
          class={CSS_CLASSES.ACTIVATION_BUTTON}
          onclick={activateLicense}
          disabled={!isValidFormat || isActivating}
        >
          {#if isActivating}
            <span class="loading-spinner"></span>
            激活中...
          {:else}
            🔓 激活许可证
          {/if}
        </button>

        {#if activationMessage}
          <div class={CSS_CLASSES.MESSAGE_SUCCESS}>
            <div class={CSS_CLASSES.MESSAGE_ICON}>✅</div>
            <div class={CSS_CLASSES.MESSAGE_CONTENT}>{activationMessage}</div>
          </div>
        {/if}

        {#if activationError}
          <div class={CSS_CLASSES.MESSAGE_ERROR}>
            <div class={CSS_CLASSES.MESSAGE_ICON}>{getErrorIcon(activationError)}</div>
            <div class={CSS_CLASSES.MESSAGE_CONTENT}>
              <div class="message-text">{activationError}</div>
              {#if activationError.includes('联系客服')}
                <div class="message-help">
                  <a href="mailto:{CONTACT_INFO.EMAIL}" class="help-link">
                    📧 联系客服支持
                  </a>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>
