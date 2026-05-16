<script lang="ts">
  import TabNavigation from "../ui/TabNavigation.svelte";
  import { VaultFolderSuggestModal } from "../../modals/VaultFolderSuggestModal";
  import {
    DEFAULT_EPUB_BOOKMARK_FOLDER,
    getEpubBookmarkFolderDisplayPath,
    normalizeEpubBookmarkFolderPath,
  } from "../../services/epub-integration";
  import EpubLicenseSettingsPanel from "./EpubLicenseSettingsPanel.svelte";
  import { showNotification } from "../../utils/notifications";

  interface Props {
    plugin: any;
  }

  type EpubSettingsTabId = "basic" | "license" | "about";

  let { plugin }: Props = $props();

  let activeTab = $state<EpubSettingsTabId>("basic");
  let stateVersion = $state(0);

  const tabs: Array<{ id: EpubSettingsTabId; label: string; icon: string }> = [
    { id: "basic", label: "基础", icon: "" },
    { id: "license", label: "授权", icon: "" },
    { id: "about", label: "关于", icon: "" },
  ];

  const supportedFormats = ["EPUB", "MOBI", "AZW3", "FB2", "FBZ", "TXT", "CBZ"];

  const featureItems = [
    {
      title: "阅读",
      description: "分页、目录、脚注与位置恢复。",
    },
    {
      title: "标注",
      description: "高亮、摘录、笔记与回链定位。",
    },
    {
      title: "书签",
      description: "按书保存，重新打开时继续阅读。",
    },
    {
      title: "导出",
      description: "导出章节与阅读结果。",
    },
  ];

  let bookmarkFolderDisplay = $derived.by(() => {
    stateVersion;
    return getEpubBookmarkFolderDisplayPath(
      plugin.settings?.bookmarkFolder || DEFAULT_EPUB_BOOKMARK_FOLDER
    );
  });

  let pluginName = $derived.by(() => plugin.manifest?.name || "EPUB 阅读器");
  let pluginVersion = $derived.by(() => plugin.manifest?.version || "-");
  let aboutInfoItems = $derived.by(() => [
    {
      label: "当前版本",
      value: pluginVersion,
      description: "已安装的插件版本。",
    },
    {
      label: "授权方式",
      value: "独立授权，可继承 Weave 的有效授权",
      description: "授权页可查看当前状态与激活信息。",
    },
    {
      label: "支持格式",
      value: supportedFormats.join(" / "),
      description: "当前可直接打开的书籍格式。",
    },
  ]);

  async function save(): Promise<void> {
    await plugin.saveSettings();
    stateVersion += 1;
  }

  async function chooseBookmarkFolder(event?: MouseEvent): Promise<void> {
    const trigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const picker = new VaultFolderSuggestModal(plugin.app, {
      placeholder: "选择书签 Markdown 保存文件夹...",
      anchorRect: trigger?.getBoundingClientRect?.() || undefined,
    });
    const folderPath = await picker.openAndSelect();
    if (!folderPath) {
      return;
    }
    plugin.settings.bookmarkFolder =
      normalizeEpubBookmarkFolderPath(folderPath) || DEFAULT_EPUB_BOOKMARK_FOLDER;
    await save();
    showNotification("书签目录已更新", "success");
  }

  function switchTab(tabId: EpubSettingsTabId): void {
    activeTab = tabId;
  }
</script>

<div class="epub-settings-root weave-settings">
  <div class="epub-settings-header">
    <h2 class="epub-settings-title">{pluginName}</h2>
    <p class="epub-settings-description">管理独立阅读器的基础配置、授权状态和插件信息。</p>
  </div>

  <div class="epub-settings-tabs">
    <TabNavigation
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(tabId) => switchTab(tabId as EpubSettingsTabId)}
      useObsidianIcons={false}
      variant="plain"
    />
  </div>

  <div class="epub-settings-tab-panel" id={`epub-settings-panel-${activeTab}`}>
    {#if activeTab === "basic"}
      <section class="epub-settings-section">
        <div class="epub-settings-group">
          <div class="epub-settings-group-header">
            <h3 class="epub-settings-group-title">书签与存储</h3>
            <p class="epub-settings-group-description">设置阅读书签的 Markdown 保存位置。</p>
          </div>

          <div class="epub-settings-list">
            <div class="epub-setting-item">
              <div class="epub-setting-info">
                <label class="epub-setting-label" for="epub-bookmark-folder-button">书签目录</label>
                <p class="epub-setting-description">书签文件会保存到这个文件夹。</p>
                <div class="epub-setting-meta" title={bookmarkFolderDisplay}>{bookmarkFolderDisplay}</div>
              </div>

              <div class="epub-setting-control">
                <button
                  id="epub-bookmark-folder-button"
                  type="button"
                  class="epub-setting-button mod-cta"
                  onclick={chooseBookmarkFolder}
                >
                  选择文件夹
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    {/if}

    {#if activeTab === "license"}
      <section class="epub-settings-section">
        <EpubLicenseSettingsPanel {plugin} />
      </section>
    {/if}

    {#if activeTab === "about"}
      <section class="epub-settings-section">
        <div class="epub-settings-group">
          <div class="epub-settings-group-header">
            <h3 class="epub-settings-group-title">插件信息</h3>
            <p class="epub-settings-group-description">用于查看当前版本、授权形态和支持格式。</p>
          </div>

          <div class="epub-settings-list">
            {#each aboutInfoItems as item}
              <div class="epub-setting-item epub-setting-item--static">
                <div class="epub-setting-info">
                  <div class="epub-setting-label">{item.label}</div>
                  <p class="epub-setting-description">{item.description}</p>
                </div>

                <div class="epub-setting-value" title={item.value}>{item.value}</div>
              </div>
            {/each}
          </div>
        </div>

        <div class="epub-settings-group">
          <div class="epub-settings-group-header">
            <h3 class="epub-settings-group-title">核心能力</h3>
            <p class="epub-settings-group-description">当前阅读器已经覆盖的主要阅读链路。</p>
          </div>

          <div class="epub-settings-list">
            {#each featureItems as item}
              <div class="epub-setting-item epub-setting-item--static">
                <div class="epub-setting-info">
                  <div class="epub-setting-label">{item.title}</div>
                  <p class="epub-setting-description">{item.description}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .epub-settings-root {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0 0 1.5rem;
  }

  .epub-settings-header {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .epub-settings-title {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .epub-settings-description {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.6;
    max-width: 42rem;
  }

  .epub-settings-tabs {
    min-width: 0;
  }

  .epub-settings-tabs :global(.tab-navigation) {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    gap: 0.35rem;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .epub-settings-tabs :global(.tab-navigation::-webkit-scrollbar) {
    display: none;
  }

  .epub-settings-tab-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-width: 0;
    padding-inline: 0.5rem;
  }

  .epub-settings-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  .epub-settings-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 18px;
    background: color-mix(in oklab, var(--background-primary), var(--background-secondary) 26%);
  }

  .epub-settings-group-header {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-bottom: 0.4rem;
  }

  .epub-settings-group-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .epub-settings-group-description {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.55;
  }

  .epub-settings-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .epub-setting-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border: none;
    border-radius: 14px;
    background: var(--background-secondary);
  }

  .epub-setting-info {
    flex: 1;
    min-width: 0;
  }

  .epub-setting-label {
    display: block;
    margin: 0;
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  .epub-setting-description {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .epub-setting-meta {
    margin-top: 0.5rem;
    color: var(--text-normal);
    font-size: 0.875rem;
    line-height: 1.5;
    word-break: break-word;
  }

  .epub-setting-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  .epub-setting-button {
    white-space: nowrap;
  }

  .epub-setting-value {
    max-width: 28rem;
    color: var(--text-normal);
    font-size: 0.95rem;
    font-weight: 500;
    line-height: 1.5;
    text-align: right;
    word-break: break-word;
  }

  @media (max-width: 720px) {
    .epub-settings-tabs :global(.tab-navigation) {
      gap: 0.25rem;
    }

    .epub-setting-item {
      flex-direction: column;
      align-items: stretch;
      padding: 1rem;
    }

    .epub-setting-control {
      justify-content: flex-start;
    }

    .epub-setting-value {
      max-width: none;
      text-align: left;
    }

    .epub-settings-group {
      padding: 0.9rem;
    }
  }
</style>
