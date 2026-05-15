<script lang="ts">
  import TabNavigation from "../ui/TabNavigation.svelte";
  import type { IncrementalReadingSettingsHost } from "./types/incremental-reading-settings-host";
  import IncrementalReadingSettingsSection from "./sections/IncrementalReadingSettingsSection.svelte";

  interface Props {
    plugin: IncrementalReadingSettingsHost;
  }

  type StandaloneIRSettingsTabId = "basic" | "auto-subscribe" | "advanced" | "signals" | "storage" | "about";

  let { plugin }: Props = $props();
  let activeTab = $state<StandaloneIRSettingsTabId>("basic");
  let stateVersion = $state(0);
  let importFolderDraft = $state("");
  let lastFolderDraft = $state("");
  let weaveParentFolderDraft = $state("");

  const tabs = [
    { id: "basic", label: "基础", icon: "" },
    { id: "auto-subscribe", label: "订阅剪藏文件夹", icon: "" },
    { id: "advanced", label: "高级调度", icon: "" },
    { id: "signals", label: "Callout 信号", icon: "" },
    { id: "storage", label: "兼容与存储", icon: "" },
    { id: "about", label: "关于", icon: "" }
  ];

  let pluginVersion = $derived.by(() => plugin.manifest?.version || "-");
  let incrementalReadingSettings = $derived.by(() => {
    stateVersion;
    return plugin.getIncrementalReadingSettings();
  });

  $effect(() => {
    stateVersion;
    importFolderDraft = incrementalReadingSettings.importFolder ?? "";
    lastFolderDraft = incrementalReadingSettings.selectionQuickCreateLastFolder ?? "";
    weaveParentFolderDraft = plugin.settings.weaveParentFolder ?? "";
  });

  async function save(): Promise<void> {
    await plugin.saveSettings();
    stateVersion += 1;
  }

  async function updateStorageField(
    updater: (settings: NonNullable<typeof plugin.settings.incrementalReading>) => void
  ): Promise<void> {
    const next = {
      ...incrementalReadingSettings,
    };
    updater(next);
    await plugin.saveIncrementalReadingSettings(next);
    stateVersion += 1;
  }

  async function updateRootSettings(
    updater: (settings: typeof plugin.settings) => void
  ): Promise<void> {
    updater(plugin.settings);
    await save();
  }

  async function commitImportFolder(): Promise<void> {
    const nextValue = importFolderDraft.trim();
    if (nextValue === (incrementalReadingSettings.importFolder ?? "")) {
      return;
    }
    await updateStorageField((settings) => {
      settings.importFolder = nextValue;
    });
  }

  async function commitLastFolder(): Promise<void> {
    const nextValue = lastFolderDraft.trim();
    if (nextValue === (incrementalReadingSettings.selectionQuickCreateLastFolder ?? "")) {
      return;
    }
    await updateStorageField((settings) => {
      settings.selectionQuickCreateLastFolder = nextValue;
    });
  }

  async function commitWeaveParentFolder(): Promise<void> {
    const nextValue = weaveParentFolderDraft.trim();
    if (nextValue === (plugin.settings.weaveParentFolder ?? "")) {
      return;
    }
    await updateRootSettings((settings) => {
      settings.weaveParentFolder = nextValue;
    });
  }
</script>

<div class="standalone-ir-settings-root weave-settings">
  <div class="standalone-ir-settings-tabs">
    <TabNavigation
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(tabId) => activeTab = tabId as StandaloneIRSettingsTabId}
      variant="plain"
    />
  </div>

  <div class="standalone-ir-settings-tab-panel" id={`standalone-ir-settings-panel-${activeTab}`}>
    {#if activeTab === "basic" || activeTab === "auto-subscribe" || activeTab === "advanced" || activeTab === "signals"}
      <IncrementalReadingSettingsSection
        {plugin}
        showTabs={false}
        forcedTab={activeTab}
      />
    {/if}

    {#if activeTab === "storage"}
      <section class="standalone-ir-settings-section">
        <div class="standalone-ir-settings-group">
          <div class="standalone-ir-settings-group-header">
            <h3 class="standalone-ir-settings-group-title">兼容导入目录</h3>
            <p class="standalone-ir-settings-group-description">这些设置只影响独立 IR 插件的兼容扫描、旧路径解析和选区建点默认位置。</p>
          </div>

          <div class="standalone-ir-settings-list">
            <div class="standalone-ir-setting-item">
              <div class="standalone-ir-setting-info">
                <label class="standalone-ir-setting-label" for="standalone-ir-import-folder">导入根目录</label>
                <p class="standalone-ir-setting-description">独立增量阅读扫描与兼容导入时使用的根目录。</p>
              </div>
              <div class="standalone-ir-setting-control">
                <input
                  id="standalone-ir-import-folder"
                  type="text"
                  class="standalone-ir-setting-input"
                  bind:value={importFolderDraft}
                  onblur={() => void commitImportFolder()}
                  onkeydown={(event) => {
                    if (event.key === "Enter") {
                      void commitImportFolder();
                    }
                  }}
                />
              </div>
            </div>

            <div class="standalone-ir-setting-item">
              <div class="standalone-ir-setting-info">
                <label class="standalone-ir-setting-label" for="standalone-ir-last-folder">阅读点默认保存位置</label>
                <p class="standalone-ir-setting-description">从选区创建阅读点时，默认保存到这个文件夹；留空则遵循 Obsidian 新建笔记位置。</p>
              </div>
              <div class="standalone-ir-setting-control">
                <input
                  id="standalone-ir-last-folder"
                  type="text"
                  class="standalone-ir-setting-input"
                  bind:value={lastFolderDraft}
                  placeholder="留空则使用 Obsidian 默认位置"
                  onblur={() => void commitLastFolder()}
                  onkeydown={(event) => {
                    if (event.key === "Enter") {
                      void commitLastFolder();
                    }
                  }}
                />
              </div>
            </div>

            <div class="standalone-ir-setting-item">
              <div class="standalone-ir-setting-info">
                <label class="standalone-ir-setting-label" for="standalone-ir-parent-folder">Weave 父目录</label>
                <p class="standalone-ir-setting-description">仅用于兼容旧路径解析；不填写也可以正常使用。</p>
              </div>
              <div class="standalone-ir-setting-control">
                <input
                  id="standalone-ir-parent-folder"
                  type="text"
                  class="standalone-ir-setting-input"
                  bind:value={weaveParentFolderDraft}
                  onblur={() => void commitWeaveParentFolder()}
                  onkeydown={(event) => {
                    if (event.key === "Enter") {
                      void commitWeaveParentFolder();
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    {/if}

    {#if activeTab === "about"}
      <section class="standalone-ir-settings-section">
        <div class="standalone-ir-settings-group">
          <div class="standalone-ir-settings-group-header">
            <h3 class="standalone-ir-settings-group-title">插件信息</h3>
            <p class="standalone-ir-settings-group-description">用于确认当前独立增量阅读插件版本与边界定位。</p>
          </div>

          <div class="standalone-ir-settings-list">
            <div class="standalone-ir-setting-item standalone-ir-setting-item--static">
              <div class="standalone-ir-setting-info">
                <div class="standalone-ir-setting-label">当前版本</div>
                <p class="standalone-ir-setting-description">已安装的独立增量阅读插件版本。</p>
              </div>
              <div class="standalone-ir-setting-value">{pluginVersion}</div>
            </div>

            <div class="standalone-ir-setting-item standalone-ir-setting-item--static">
              <div class="standalone-ir-setting-info">
                <div class="standalone-ir-setting-label">产品定位</div>
                <p class="standalone-ir-setting-description">负责专题、阅读点、调度、来源追踪与摘录转卡入口。</p>
              </div>
              <div class="standalone-ir-setting-value">独立增量阅读主控插件</div>
            </div>

            <div class="standalone-ir-setting-item standalone-ir-setting-item--static">
              <div class="standalone-ir-setting-info">
                <div class="standalone-ir-setting-label">协作关系</div>
                <p class="standalone-ir-setting-description">可与 Weave 主插件和独立 EPUB 阅读器协同，但不再依赖它们承载全部设置编辑职责。</p>
              </div>
              <div class="standalone-ir-setting-value">Weave / EPUB Reader 协作</div>
            </div>
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .standalone-ir-settings-root {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 0.25rem 0 1.5rem;
  }

  .standalone-ir-settings-tabs {
    min-width: 0;
  }

  .standalone-ir-settings-tabs :global(.tab-navigation) {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    gap: 0.35rem;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .standalone-ir-settings-tabs :global(.tab-navigation::-webkit-scrollbar) {
    display: none;
  }

  .standalone-ir-settings-tab-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-width: 0;
    padding-inline: 0.5rem;
  }

  .standalone-ir-settings-section,
  .standalone-ir-settings-group {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    min-width: 0;
  }

  .standalone-ir-settings-section {
    gap: 1.5rem;
  }

  .standalone-ir-settings-group-header {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .standalone-ir-settings-group-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .standalone-ir-settings-group-description {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.55;
  }

  .standalone-ir-settings-list {
    display: flex;
    flex-direction: column;
  }

  .standalone-ir-setting-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .standalone-ir-setting-item:last-child {
    border-bottom: none;
  }

  .standalone-ir-setting-info {
    flex: 1;
    min-width: 0;
  }

  .standalone-ir-setting-label {
    display: block;
    margin: 0;
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  .standalone-ir-setting-description {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .standalone-ir-setting-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-shrink: 0;
    width: min(24rem, 46%);
  }

  .standalone-ir-setting-input {
    width: 100%;
  }

  .standalone-ir-setting-value {
    max-width: 28rem;
    color: var(--text-normal);
    font-size: 0.95rem;
    font-weight: 500;
    line-height: 1.5;
    text-align: right;
    word-break: break-word;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings) {
    gap: 0;
    padding: 0;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings .incremental-reading-tab-content),
  .standalone-ir-settings-root :global(.incremental-reading-settings .incremental-reading-tab-followup) {
    gap: 1rem;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings .incremental-reading-tab-panel) {
    gap: 1.5rem;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings.settings-layout-flat .settings-group) {
    padding: 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 18px;
    background: color-mix(in oklab, var(--background-primary), var(--background-secondary) 26%);
    box-shadow: none;
    gap: 0.25rem;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings.settings-layout-flat .group-content) {
    gap: 0.75rem;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings.settings-layout-flat .group-header),
  .standalone-ir-settings-root :global(.incremental-reading-settings.settings-layout-flat .group-title) {
    margin-bottom: 0;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings.settings-layout-flat .group-header) {
    gap: 0.35rem;
    padding-bottom: 0.4rem;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings.settings-layout-flat .row) {
    border: none;
    border-radius: 14px;
    background: var(--background-secondary);
    padding: 1.25rem 1.5rem;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings.settings-layout-flat .row:last-child) {
    border-bottom: none;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings .group-title) {
    margin: 0;
    font-size: 1rem;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings .group-header) {
    margin-bottom: 0.35rem;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings .group-description) {
    margin: 0;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings .label-with-desc > label) {
    font-weight: 500;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings .label-with-desc > .desc) {
    font-size: 0.85rem;
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings .strategy-hint) {
    margin: 0;
    padding: 1rem 1.25rem;
    background: var(--background-secondary);
    border-radius: 14px;
    color: var(--text-muted);
  }

  .standalone-ir-settings-root :global(.incremental-reading-settings .subscription-rules-list) {
    margin-bottom: 0;
  }

  @media (max-width: 720px) {
    .standalone-ir-settings-tabs :global(.tab-navigation) {
      gap: 0.5rem;
    }

    .standalone-ir-setting-item {
      flex-direction: column;
      align-items: stretch;
    }

    .standalone-ir-setting-control {
      width: 100%;
      justify-content: flex-start;
    }

    .standalone-ir-setting-value {
      max-width: none;
      text-align: left;
    }

    .standalone-ir-settings-root :global(.incremental-reading-settings.settings-layout-flat .row) {
      padding: 1rem;
    }

    .standalone-ir-settings-root :global(.incremental-reading-settings.settings-layout-flat .settings-group) {
      padding: 0.9rem;
    }
  }
</style>
