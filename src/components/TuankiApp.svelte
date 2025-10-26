<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type AnkiPlugin from "../main";
  import type { AnkiDataStorage } from "../data/storage";
  import type { FSRS } from "../algorithms/fsrs";
  import TuankiCardManagementPage from "./pages/TuankiCardManagementPage.svelte";
  import DeckStudyPage from "./pages/DeckStudyPage.svelte";
  import AnalyticsDashboard from "./pages/AnalyticsDashboard.svelte";
  import SettingsPage from "./settings/SettingsPanel.svelte";
  import AIAssistantPage from "./pages/AIAssistantPage.svelte";
  import NavBar from "./navigation/NavBar.svelte";
  import ResponsiveContainer from "./ui/ResponsiveContainer.svelte";
  import ErrorBoundary from "./ui/ErrorBoundary.svelte";
  import { getVisibleNavigationItems } from "../data/navigation-config";


  import { Notice } from 'obsidian';
  // import { getTriadTemplateService } from '../services/triad-template-service'; // 暂时注释，已被新系统替代

  // 导入主题管理器
  import { addThemeClasses } from "../utils/theme-detection";

  // 调试组件已移除

  interface Props {
    plugin: AnkiPlugin;
    dataStorage: AnkiDataStorage;
    fsrs: FSRS;
  }

  interface ResponsiveState {
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    width: number;
  }


  let { plugin, dataStorage, fsrs }: Props = $props();
  let activePage = $state<string>("deck-study");

  let appElement: HTMLElement;
  let themeCleanup: (() => void) | null = null;

  // 牌组数据
  let decks = $state<any[]>([]);

  // 🗑️ 已移除旧的页面切换刷新逻辑
  // 现在使用 DataSyncService，每个组件独立订阅数据变更

  onMount(() => {
    const handleNavigate = (e: CustomEvent<string>) => {
      activePage = e.detail;
    };

    window.addEventListener("tuanki:navigate", handleNavigate as EventListener);

    // 加载牌组数据
    (async () => {
      try {
        decks = await dataStorage.getDecks();
      } catch (error) {
        console.error('加载牌组数据失败:', error);
        decks = [];
      }
    })();

    // 应用主题类到应用容器
    if (appElement) {
      themeCleanup = addThemeClasses(appElement);
      console.debug('[TuankiApp] 主题类已应用到应用容器');
    }

    return () => {
      window.removeEventListener("tuanki:navigate", handleNavigate as EventListener);

      // 清理主题监听器
      if (themeCleanup) {
        themeCleanup();
        themeCleanup = null;
      }
    };
  });

  onDestroy(() => {
    // 清理主题监听器
    if (themeCleanup) {
      themeCleanup();
      themeCleanup = null;
    }
  });


</script>


<ResponsiveContainer classPrefix="tuanki">
  {#snippet children(responsive: ResponsiveState)}
    <div
      bind:this={appElement}
      class="tuanki-app tuanki-app-inner"

      role="application"
    >
      <NavBar
        items={getVisibleNavigationItems(plugin.settings.navigationVisibility)}
        currentPage={activePage}
        {responsive}
        showSettingsButton={plugin.settings.showSettingsButton !== false}
        pageActions={activePage === "deck-study" ? [
          {
            id: "view-switcher",
            label: "切换视图",
            icon: "layout",
            onClick: (e: MouseEvent) => {
              window.dispatchEvent(new CustomEvent('show-view-menu', { detail: { event: e } }));
            }
          },
          {
            id: "create-deck",
            label: "新建牌组",
            icon: "plus",
            onClick: (e: MouseEvent) => {
              const event = new CustomEvent('create-deck', { detail: { event: e } });
              document.dispatchEvent(event);
            },
            variant: 'primary'
          },
          {
            id: "more-actions",
            label: "更多操作",
            icon: "more-horizontal",
            onClick: (e: MouseEvent) => {
              const event = new CustomEvent('more-actions', { detail: { event: e } });
              document.dispatchEvent(event);
            }
          }
        ] : []}
        on:navigate={(e) => (activePage = e.detail)}
        on:settings={() => (activePage = "settings")}
      />
      <main class="tuanki-main-content">
        {#if activePage === "deck-study"}
          <DeckStudyPage {dataStorage} {fsrs} {plugin} />
        {:else if activePage === "tuanki-card-management"}
          <TuankiCardManagementPage {dataStorage} {fsrs} {plugin} />
        {:else if activePage === "ai-assistant"}
          <AIAssistantPage {plugin} {dataStorage} {fsrs} />
        {:else if activePage === "statistics"}
          <ErrorBoundary
            showDetails={true}
            allowRetry={true}
            onError={(error, errorInfo) => {
              console.error('Analytics Dashboard Error:', error, errorInfo);
              // 可以在这里添加错误上报逻辑
            }}
          >
            <AnalyticsDashboard {dataStorage} {fsrs} {plugin} />
          </ErrorBoundary>

        {:else if activePage === "settings"}
          <SettingsPage plugin={plugin as any} />
        {/if}
      </main>


    </div>
  {/snippet}
</ResponsiveContainer>

<!-- ⚠️ 全局新建卡片模态窗已重构：不再使用 GlobalModalContainer，
     现在直接在 main.ts 的 openCreateCardModal() 中挂载到 document.body -->

<style>
  .tuanki-app {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-interface);
    overflow: hidden;
  }

  .tuanki-app-inner {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tuanki-main-content {
    flex: 1;
    overflow-y: auto;  /* 🔧 修复：改为 auto 允许滚动 */
    display: flex;
    flex-direction: column;
  }

  /* 页面通用样式 */
  .tuanki-page {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .tuanki-page h1 {
    margin: 0 0 20px 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .content-placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 1rem;
  }

  .content-placeholder p {
    margin: 0;
    text-align: center;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .tuanki-page {
      padding: 15px;
    }

    .tuanki-page h1 {
      font-size: 1.25rem;
    }
  }

  @media (max-width: 480px) {
    .tuanki-page {
      padding: 10px;
    }

    .tuanki-page h1 {
      font-size: 1.125rem;
    }
  }
</style>
