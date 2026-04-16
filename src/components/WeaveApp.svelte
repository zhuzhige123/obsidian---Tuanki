<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { WeavePlugin } from "../main";
  import type { WeaveDataStorage } from "../data/storage";
  import type { FSRS } from "../algorithms/fsrs";
  import WeaveCardManagementPage from "./pages/WeaveCardManagementPage.svelte";
  import DeckStudyPage from "./pages/DeckStudyPage.svelte";
  import SettingsPage from "./settings/SettingsPanel.svelte";
  import AIAssistantPage from "./pages/AIAssistantPage.svelte";
  import SidebarNavHeader from "./navigation/SidebarNavHeader.svelte";
  import ResponsiveContainer from "./ui/ResponsiveContainer.svelte";
  import { getViewSurfaceTokens, isInSidebar as isLeafInSidebar } from "../utils/view-location-utils";

  import { Platform } from 'obsidian';
  import type { WorkspaceLeaf } from 'obsidian';
  import { logger } from "../utils/logger";
  import { addThemeClasses, createThemeListener } from "../utils/theme-detection";
  import AutoRulesConfigModal from "./modals/AutoRulesConfigModal.svelte";

  interface Props {
    plugin: WeavePlugin;
    dataStorage: WeaveDataStorage;
    fsrs: FSRS;
    currentLeaf: WorkspaceLeaf;
  }

  interface ResponsiveState {
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    width: number;
  }


  let { plugin, dataStorage, fsrs, currentLeaf }: Props = $props();
  let activePage = $state<string>("deck-study");

  function normalizeDeckStudyView(view: string | null | undefined): 'grid' | 'kanban' {
    return view === 'kanban' ? 'kanban' : 'grid';
  }

  function getInitialDeckStudyView(): 'grid' | 'kanban' {
    return normalizeDeckStudyView(plugin.getCachedDeckViewPreference());
  }

  // 移动端检测状态
  let isMobileDevice = $state(false);
  
  // 侧边栏模式检测状态
  let isInSidebarMode = $state(false);
  
  // 侧边栏导航状态（用于与子页面同步）
  let sidebarDeckFilter = $state<'memory' | 'incremental-reading' | 'question-bank'>('memory');
  let sidebarCardView = $state<'table' | 'grid' | 'kanban'>('table');
  let sidebarDeckStudyView = $state<'grid' | 'kanban'>(getInitialDeckStudyView());
  // 卡片管理页面的数据源状态
  let cardDataSource = $state<'memory' | 'questionBank' | 'incremental-reading'>('memory');

  let appElement: HTMLElement;
  let themeClassCleanup: (() => void) | null = null;
  let themeSurfaceCleanup: (() => void) | null = null;
  let mobileViewportCleanup: (() => void) | null = null;
  let nativeTooltipCleanup: (() => void) | null = null;

  function createNavigationVisibilitySnapshot() {
    return {
      deckStudy: true,
      cardManagement: true,
      incrementalReading: true,
      aiAssistant: true,
      ...(plugin.settings.navigationVisibility ?? {})
    };
  }
  
  // 导航可见性本地响应式状态
  let navigationVisibility = $state(untrack(() => createNavigationVisibilitySnapshot()));

  // 插件配置模态窗状态
  let showPluginConfigModal = $state<string | null>(null);

  function detectSidebarMode() {
    if (!currentLeaf || !appElement) {
      isInSidebarMode = false;
      return;
    }

    try {
      isInSidebarMode = isLeafInSidebar(currentLeaf);
      const surfaceTokens = getViewSurfaceTokens(currentLeaf);
      appElement.dataset.weaveSurfaceContext = surfaceTokens.context;
      appElement.style.setProperty('--weave-surface-background', surfaceTokens.surfaceBackground);
      appElement.style.setProperty('--weave-surface', surfaceTokens.surfaceBackground);
      appElement.style.setProperty('--weave-elevated-background', surfaceTokens.elevatedBackground);
      appElement.style.setProperty('--weave-secondary-bg', surfaceTokens.elevatedBackground);
      appElement.style.setProperty('--weave-surface-secondary', surfaceTokens.elevatedBackground);
      logger.debug('[WeaveApp] 侧边栏模式:', isInSidebarMode);
    } catch (error) {
      logger.error('[WeaveApp] 侧边栏检测失败:', error);
      isInSidebarMode = false;
      delete appElement.dataset.weaveSurfaceContext;
      appElement.style.setProperty('--weave-surface-background', 'var(--background-primary)');
      appElement.style.setProperty('--weave-surface', 'var(--background-primary)');
      appElement.style.setProperty('--weave-elevated-background', 'var(--background-secondary)');
      appElement.style.setProperty('--weave-secondary-bg', 'var(--background-secondary)');
      appElement.style.setProperty('--weave-surface-secondary', 'var(--background-secondary)');
    }
  }

  function stripNativeTitleTooltip(node: Element) {
    if (!node.hasAttribute('title') || !node.hasAttribute('aria-label')) return;
    const title = node.getAttribute('title');
    if (!title || !title.trim()) return;
    node.removeAttribute('title');
  }

  function setupNativeTooltipCleanup(root: HTMLElement): () => void {
    const selector = '[title][aria-label]';
    let cleanupRaf = 0;

    const runCleanup = () => {
      root.querySelectorAll(selector).forEach((el) => stripNativeTitleTooltip(el));
      cleanupRaf = 0;
    };

    const scheduleCleanup = () => {
      if (cleanupRaf) return;
      cleanupRaf = window.requestAnimationFrame(runCleanup);
    };

    runCleanup();

    const observer = new MutationObserver(() => {
      scheduleCleanup();
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label'],
    });

    return () => {
      observer.disconnect();
      if (cleanupRaf) {
        window.cancelAnimationFrame(cleanupRaf);
        cleanupRaf = 0;
      }
    };
  }

  onMount(() => {
    // 检测移动端设备
    isMobileDevice = Platform.isMobile || document.body.classList.contains('is-mobile');
    logger.debug('[WeaveApp] 移动端检测结果:', isMobileDevice);
    
    const handleNavigate = (e: CustomEvent<string>) => {
      activePage = e.detail;
    };

    // 监听导航可见性更新事件
    const handleNavigationVisibilityUpdate = (e: CustomEvent<any>) => {
      navigationVisibility = { ...e.detail };
      logger.debug('[WeaveApp] 导航可见性已更新:', navigationVisibility);
      
      // 如果当前页面被隐藏，自动切换到第一个可见页面
      const pageVisibilityMap: Record<string, boolean> = {
        'deck-study': navigationVisibility.deckStudy !== false,
        'weave-card-management': navigationVisibility.cardManagement !== false,
        'incremental-reading': navigationVisibility.incrementalReading !== false,
        'ai-assistant': navigationVisibility.aiAssistant !== false,
      };
      
      // 如果当前页面被隐藏，切换到第一个可见页面
      if (pageVisibilityMap[activePage] === false) {
        const firstVisiblePage = Object.keys(pageVisibilityMap).find(page => pageVisibilityMap[page]);
        if (firstVisiblePage) {
          activePage = firstVisiblePage;
          logger.info(`[WeaveApp] 当前页面已隐藏，自动切换到: ${firstVisiblePage}`);
        }
      }
    };

    window.addEventListener("Weave:navigate", handleNavigate as EventListener);
    window.addEventListener("Weave:navigation-visibility-update", handleNavigationVisibilityUpdate as EventListener);
    
    // 监听插件配置打开事件
    const handleOpenPluginConfig = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.pluginId) {
        showPluginConfigModal = detail.pluginId;
      }
    };
    document.addEventListener('Weave:open-plugin-config', handleOpenPluginConfig);
    
    // 监听子页面状态变化（用于侧边栏导航同步）
    const handleDeckFilterChange = (e: CustomEvent<string>) => {
      sidebarDeckFilter = e.detail as 'memory' | 'question-bank' | 'incremental-reading';
      logger.debug('[WeaveApp] 牌组筛选变化:', sidebarDeckFilter);
    };
    const handleCardViewChange = (e: CustomEvent<string>) => {
      sidebarCardView = e.detail as 'table' | 'grid' | 'kanban';
      logger.debug('[WeaveApp] 卡片视图变化:', sidebarCardView);
    };
    const handleDeckViewChange = (e: CustomEvent<string>) => {
      const view = e.detail as 'grid' | 'kanban' | string;
      if (view === 'grid' || view === 'kanban') {
        sidebarDeckStudyView = view;
        logger.debug('[WeaveApp] 牌组学习视图变化:', sidebarDeckStudyView);
      }
    };
    window.addEventListener("Weave:deck-filter-change", handleDeckFilterChange as EventListener);
    window.addEventListener("Weave:card-view-change", handleCardViewChange as EventListener);
    window.addEventListener("Weave:deck-view-change", handleDeckViewChange as EventListener);

    // 应用主题类到应用容器
    if (appElement) {
      themeClassCleanup = addThemeClasses(appElement);
      themeSurfaceCleanup = createThemeListener(() => {
        detectSidebarMode();
      });
      logger.debug('[WeaveApp] 主题类已应用到应用容器');
      
      detectSidebarMode();
      nativeTooltipCleanup = setupNativeTooltipCleanup(appElement);
    }

    const setupMobileViewportSync = () => {
      if (!appElement) return () => {};
      const isMobileLayout = Platform.isMobile
        || document.body.classList.contains('is-mobile')
        || document.body.classList.contains('is-phone');

      if (!isMobileLayout) {
        appElement.style.removeProperty('--weave-mobile-viewport-height');
        return () => {};
      }

      const viewport = window.visualViewport;
      const updateViewportMetrics = () => {
        const height = viewport?.height ?? window.innerHeight;

        appElement.style.setProperty('--weave-mobile-viewport-height', `${Math.max(0, height)}px`);
      };

      updateViewportMetrics();
      viewport?.addEventListener('resize', updateViewportMetrics);
      viewport?.addEventListener('scroll', updateViewportMetrics);
      window.addEventListener('resize', updateViewportMetrics);
      window.addEventListener('orientationchange', updateViewportMetrics);

      return () => {
        viewport?.removeEventListener('resize', updateViewportMetrics);
        viewport?.removeEventListener('scroll', updateViewportMetrics);
        window.removeEventListener('resize', updateViewportMetrics);
        window.removeEventListener('orientationchange', updateViewportMetrics);
      };
    };

    mobileViewportCleanup = setupMobileViewportSync();

    const layoutChangeRef = plugin.app.workspace.on('layout-change', () => {
      detectSidebarMode();

      if (mobileViewportCleanup) {
        mobileViewportCleanup();
      }
      mobileViewportCleanup = setupMobileViewportSync();
    });

    return () => {
      window.removeEventListener("Weave:navigate", handleNavigate as EventListener);
      window.removeEventListener("Weave:navigation-visibility-update", handleNavigationVisibilityUpdate as EventListener);
      window.removeEventListener("Weave:deck-filter-change", handleDeckFilterChange as EventListener);
      window.removeEventListener("Weave:card-view-change", handleCardViewChange as EventListener);
      window.removeEventListener("Weave:deck-view-change", handleDeckViewChange as EventListener);
      document.removeEventListener('Weave:open-plugin-config', handleOpenPluginConfig);
      plugin.app.workspace.offref(layoutChangeRef);
      if (mobileViewportCleanup) {
        mobileViewportCleanup();
        mobileViewportCleanup = null;
      }

      if (themeClassCleanup) {
        themeClassCleanup();
        themeClassCleanup = null;
      }
      if (themeSurfaceCleanup) {
        themeSurfaceCleanup();
        themeSurfaceCleanup = null;
      }
      if (nativeTooltipCleanup) {
        nativeTooltipCleanup();
        nativeTooltipCleanup = null;
      }
    };
  });

  $effect(() => {
    window.dispatchEvent(new CustomEvent('Weave:page-changed', { detail: activePage }));
  });

</script>


<ResponsiveContainer classPrefix="weave">
  {#snippet children(responsive: ResponsiveState)}
    <div
      bind:this={appElement}
      class="weave-app weave-app-inner"
      class:is-in-sidebar={isInSidebarMode}
      class:is-in-main-area={!isInSidebarMode}
      role="application"
    >
      {#if !isMobileDevice}
        <div class="weave-main-toolbar">
          <SidebarNavHeader
            currentPage={activePage}
            {navigationVisibility}
            selectedFilter={sidebarDeckFilter}
            deckStudyView={activePage === 'deck-study' ? sidebarDeckStudyView : 'grid'}
            currentView={sidebarCardView}
            cardDataSource={cardDataSource}
            app={plugin.app}
            {isInSidebarMode}
            onFilterSelect={(filter) => {
              sidebarDeckFilter = filter;
              window.dispatchEvent(new CustomEvent('Weave:sidebar-filter-select', { detail: filter }));
            }}
            onViewChange={(view) => {
              sidebarCardView = view;
              window.dispatchEvent(new CustomEvent('Weave:sidebar-view-change', { detail: view }));
            }}
            onCardDataSourceChange={(source) => {
              cardDataSource = source;
              window.dispatchEvent(new CustomEvent('Weave:card-data-source-change', { detail: source }));
            }}
            onNavigate={(pageId) => {
              activePage = pageId;
            }}
          />
        </div>
      {/if}
      
      <main
        class="weave-main-content"
        class:mobile={isMobileDevice}
        class:ai-assistant-active={isMobileDevice && activePage === 'ai-assistant'}
      >
        {#if activePage === "deck-study"}
          <DeckStudyPage {dataStorage} {plugin} />
        {:else if activePage === "weave-card-management"}
          <WeaveCardManagementPage {dataStorage} {fsrs} {plugin} {currentLeaf} />
        {:else if activePage === "incremental-reading"}
          <div class="removed-feature-notice">
            <div class="notice-icon">提示</div>
            <h3>增量阅读</h3>
            <p>增量阅读功能已整合到左侧边栏中。<br />点击左侧边栏图标即可访问日历视图和材料列表。</p>
          </div>
        {:else if activePage === "ai-assistant"}
          <AIAssistantPage
            {plugin}
            {dataStorage}
            {fsrs}
            onNavigate={(pageId) => {
              activePage = pageId;
            }}
          />
        {:else if activePage === "settings"}
          <SettingsPage plugin={plugin as any} />
        {/if}
      </main>
      {#if showPluginConfigModal === 'auto-rules'}
        <AutoRulesConfigModal
          open={true}
          onClose={() => { showPluginConfigModal = null; }}
          {plugin}
        />
      {/if}

    </div>
  {/snippet}
</ResponsiveContainer>

<style>
  .weave-app {
    --weave-surface-background: var(--background-primary);
    --weave-surface: var(--weave-surface-background);
    --weave-elevated-background: var(--background-secondary);
    --weave-secondary-bg: var(--weave-elevated-background);
    --weave-surface-secondary: var(--weave-elevated-background);
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    background: var(--weave-surface-background);
    color: var(--text-normal);
    font-family: var(--font-interface);
    overflow: hidden;
  }

  .weave-app-inner {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :global(body.is-mobile) .weave-app,
  :global(body.is-phone) .weave-app,
  :global(body.is-mobile) .weave-app-inner,
  :global(body.is-phone) .weave-app-inner {
    height: var(--weave-mobile-viewport-height, 100%);
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: none;
  }

  .weave-main-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding-top: 0;
    margin-top: 0;
    transition: padding-top 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .weave-main-toolbar {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .weave-main-content.mobile {
    padding-top: 0;
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: none;
  }

  .weave-main-content.mobile.ai-assistant-active {
    overflow: hidden;
    min-height: 0;
  }

  :global(body.is-mobile .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header-title-container),
  :global(body.is-mobile .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header-title-parent),
  :global(body.is-mobile .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header-title-wrapper),
  :global(body.is-mobile .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header-title),
  :global(body.is-mobile .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header-breadcrumb),
  :global(body.is-phone .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header-title-container),
  :global(body.is-phone .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header-title-parent),
  :global(body.is-phone .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header-title-wrapper),
  :global(body.is-phone .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header-title),
  :global(body.is-phone .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header-breadcrumb) {
    display: none !important;
    width: 0 !important;
    min-width: 0 !important;
    max-width: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    border: 0 !important;
  }

  :global(body.is-mobile .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-content),
  :global(body.is-phone .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-content) {
    padding-top: 0 !important;
    margin-top: 0 !important;
  }

  /* 功能移除提示样式 */
  .removed-feature-notice {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
    color: var(--text-muted);
    max-width: 600px;
    margin: 0 auto;
  }

  .removed-feature-notice .notice-icon {
    font-size: 4rem;
    margin-bottom: 20px;
    opacity: 0.4;
  }

  .removed-feature-notice h3 {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0 0 12px 0;
  }

  .removed-feature-notice p {
    font-size: 1rem;
    line-height: 1.6;
    color: var(--text-muted);
    margin: 0;
  }
</style>
