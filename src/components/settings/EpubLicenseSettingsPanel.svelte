<script lang="ts">
  import EnhancedActivationForm from "./components/EnhancedActivationForm.svelte";
  import EnhancedLicenseStatusCard from "./components/EnhancedLicenseStatusCard.svelte";
  import {
    clearPluginLocalLicenses,
    getPluginEffectiveLicenseState,
    getPluginLocalLicenses,
    syncPluginLicenseSettings,
  } from "../../utils/plugin-license";
  import { showObsidianConfirm } from "../../utils/obsidian-confirm";
  import { showNotification } from "../../utils/notifications";

  interface Props {
    plugin: any;
  }

  let { plugin }: Props = $props();

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
		return effectiveLicenseState.primaryLicense || plugin.settings?.license || null;
	});

  let hasLocalLicenseRecord = $derived.by(() => {
		stateVersion;
		return getPluginLocalLicenses(plugin).length > 0;
	});

  async function save(): Promise<void> {
    await plugin.saveSettings();
    refreshSnapshot();
  }

  async function verifyLicense(): Promise<void> {
    await plugin.refreshPremiumState?.();
    refreshSnapshot();
  }

  async function resetLicense(): Promise<void> {
    if (getPluginLocalLicenses(plugin).length === 0) {
		showNotification("当前没有可清除的许可证记录", "info");
		refreshSnapshot();
		return;
	}

    const confirmed = await showObsidianConfirm(
      plugin.app,
      "确定要清除当前 EPUB 许可证状态吗？",
      { title: "确认重置" }
    );

    if (!confirmed) {
      return;
    }

    clearPluginLocalLicenses(plugin);
    syncPluginLicenseSettings(plugin);
    await plugin.saveSettings();
    await plugin.refreshPremiumState?.();
    refreshSnapshot();
    showNotification("EPUB 许可证记录已清除", "success");
  }
</script>

<section class="epub-license-settings-panel">
  <h3 class="section-title">授权设置</h3>
  <p class="section-description">支持独立 EPUB 激活码，同时可继承已安装 Weave 的有效高级授权。</p>

  {#if effectiveLicenseState.isPremiumActive}
    <EnhancedLicenseStatusCard
      license={currentLicense}
      effectiveState={effectiveLicenseState}
      showActions={true}
      onVerify={verifyLicense}
      onReset={hasLocalLicenseRecord ? resetLicense : undefined}
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
</section>

<style>
  .epub-license-settings-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 0;
  }

  .section-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
  }

  .section-description {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.6;
  }
</style>
