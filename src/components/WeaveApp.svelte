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
  import WeaveInspirationModal from "./navigation/WeaveInspirationModal.svelte";
  import ResponsiveContainer from "./ui/ResponsiveContainer.svelte";
  import GlobalOperationProgressBar from "./ui/GlobalOperationProgressBar.svelte";
  import { PremiumFeatureGuard, PREMIUM_FEATURES, type PremiumFeatureAccessContext } from "../services/premium/PremiumFeatureGuard";
  import { getViewSurfaceTokens, isInSidebar as isLeafInSidebar } from "../utils/view-location-utils";

  import { Notice, Platform } from 'obsidian';
  import type { WorkspaceLeaf } from 'obsidian';
  import { logger } from "../utils/logger";
  import { addThemeClasses, UnifiedThemeManager } from "../utils/theme-detection";
  import AutoRulesConfigModal from "./modals/AutoRulesConfigModal.svelte";
  import { weaveMainInterfaceStore } from "../stores/weave-main-interface-store";
  import { registerLegacyApkgImportRequestListener } from "../utils/legacy-apkg-import-action";
  import type {
    WeaveGlobalOperationProgressState,
    WeaveNavigationVisibilityState,
  } from "../stores/weave-main-interface-store";

  const deckStudyFeatureContext: PremiumFeatureAccessContext = { page: 'deck-study' };

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
  let activePage = $state<string>(weaveMainInterfaceStore.getState().currentPage);
  let deckStudyPageMounted = $state(activePage === "deck-study");

  let sidebarDeckStudyView = $state<'kanban'>('kanban');

  // 移动端检测状态
  let isMobileDevice = $state(false);
  
  // 侧边栏模式检测状态
  let isInSidebarMode = $state(false);
  
  // 侧边栏导航状态（用于与子页面同步）
  let sidebarDeckFilter = $state<'memory' | 'question-bank'>('memory');
  let sidebarCardView = $state<'table' | 'grid' | 'kanban'>('table');
  // 卡片管理页面的数据源状态
  let cardDataSource = $state<'memory' | 'questionBank' | 'incremental-reading'>('memory');
  let globalOperationProgress = $state<WeaveGlobalOperationProgressState>(
    weaveMainInterfaceStore.getState().globalOperationProgress
  );

  let appElement: HTMLElement;
  let themeClassCleanup: (() => void) | null = null;
  let themeSurfaceCleanup: (() => void) | null = null;
  let mobileViewportCleanup: (() => void) | null = null;
  let nativeTooltipCleanup: (() => void) | null = null;
  let visibilityCorrectionFrameId = 0;
  let lastVisibilityCorrectionSignature = '';

  function createNavigationVisibilitySnapshot() {
    weaveMainInterfaceStore.setNavigationVisibility(plugin.settings.navigationVisibility);
    return weaveMainInterfaceStore.getState().navigationVisibility;
  }

  function getNavigationVisibilitySignature(visibility: WeaveNavigationVisibilityState) {
    return JSON.stringify(visibility);
  }

  function getFirstVisiblePage(visibility: WeaveNavigationVisibilityState): string | null {
    const pageVisibilityMap: Record<string, boolean> = {
      'deck-study': visibility.deckStudy !== false,
      'weave-card-management': visibility.cardManagement !== false,
      'ai-assistant': visibility.aiAssistant !== false,
    };

    return Object.keys(pageVisibilityMap).find(page => pageVisibilityMap[page]) ?? null;
  }

  function scheduleCurrentPageVisibilityCorrection(currentPage: string, visibility: WeaveNavigationVisibilityState) {
    const pageVisibilityMap: Record<string, boolean> = {
      'deck-study': visibility.deckStudy !== false,
      'weave-card-management': visibility.cardManagement !== false,
      'ai-assistant': visibility.aiAssistant !== false,
    };

    if (pageVisibilityMap[currentPage] !== false) {
      lastVisibilityCorrectionSignature = '';
      if (visibilityCorrectionFrameId) {
        window.cancelAnimationFrame(visibilityCorrectionFrameId);
        visibilityCorrectionFrameId = 0;
      }
      return;
    }

    const firstVisiblePage = getFirstVisiblePage(visibility);
    if (!firstVisiblePage || firstVisiblePage === currentPage) {
      return;
    }

    const visibilitySignature = getNavigationVisibilitySignature(visibility);
    const correctionSignature = `${currentPage}->${firstVisiblePage}:${visibilitySignature}`;
    if (lastVisibilityCorrectionSignature === correctionSignature) {
      return;
    }

    lastVisibilityCorrectionSignature = correctionSignature;
    if (visibilityCorrectionFrameId) {
      window.cancelAnimationFrame(visibilityCorrectionFrameId);
    }

    visibilityCorrectionFrameId = window.requestAnimationFrame(() => {
      visibilityCorrectionFrameId = 0;
      const latestState = weaveMainInterfaceStore.getState();
      const latestVisibilitySignature = getNavigationVisibilitySignature(latestState.navigationVisibility);
      if (latestState.currentPage !== currentPage || latestVisibilitySignature !== visibilitySignature) {
        return;
      }

      weaveMainInterfaceStore.setCurrentPage(firstVisiblePage);
      logger.info(`[WeaveApp] 当前页面已隐藏，自动切换到: ${firstVisiblePage}`);
    });
  }
  
  // 导航可见性本地响应式状态
  let navigationVisibility = $state(untrack(() => createNavigationVisibilitySnapshot()));

  // 插件配置模态窗状态
  let showPluginConfigModal = $state<string | null>(null);
  let showInspirationPopover = $state(false);
  let inspirationPopoverAnchor = $state<HTMLElement | null>(null);

  function closeInspirationPopover() {
    showInspirationPopover = false;
    inspirationPopoverAnchor = null;
  }

  function toggleInspirationPopover(anchor: HTMLElement | null) {
    if (showInspirationPopover && inspirationPopoverAnchor === anchor) {
      closeInspirationPopover();
      return;
    }

    inspirationPopoverAnchor = anchor;
    showInspirationPopover = true;
  }

  function navigateToPage(pageId: string): boolean {
    if (typeof pageId !== 'string' || pageId.length === 0) {
      return false;
    }

    const progressState = weaveMainInterfaceStore.getState().globalOperationProgress;
    if (
      progressState.active
      && !progressState.allowNavigation
      && pageId !== weaveMainInterfaceStore.getState().currentPage
    ) {
      new Notice(progressState.navigationMessage || '当前任务处理中，请暂时不要切换页面。');
      return false;
    }

    weaveMainInterfaceStore.setCurrentPage(pageId);
    return true;
  }

  function requestNavigation(pageId: string) {
    if (typeof pageId !== 'string' || pageId.length === 0) {
      return;
    }

    const didNavigate = navigateToPage(pageId);
    if (!didNavigate) {
      return;
    }

    window.dispatchEvent(new CustomEvent('Weave:navigate', { detail: pageId }));
  }

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
      window.dispatchEvent(
        new CustomEvent("Weave:surface-location-change", {
          detail: { isInSidebar: isInSidebarMode },
        })
      );
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
    isMobileDevice = Platform.isMobile || activeDocument.body.classList.contains('is-mobile');
    logger.debug('[WeaveApp] 移动端检测结果:', isMobileDevice);

    weaveMainInterfaceStore.setNavigationVisibility(plugin.settings.navigationVisibility);

    const unsubscribeMainInterfaceStore = weaveMainInterfaceStore.subscribe((state) => {
      if (activePage !== state.currentPage) {
        activePage = state.currentPage;
      }
      if (state.currentPage === "deck-study") {
        deckStudyPageMounted = true;
      }

      const nextVisibility = state.navigationVisibility;
      if (getNavigationVisibilitySignature(navigationVisibility) !== getNavigationVisibilitySignature(nextVisibility)) {
        navigationVisibility = nextVisibility;
        logger.debug('[WeaveApp] 导航可见性已同步:', navigationVisibility);
      }

      globalOperationProgress = state.globalOperationProgress;

      scheduleCurrentPageVisibilityCorrection(state.currentPage, nextVisibility);
    });
    
    const handleNavigate = (e: CustomEvent<string | { page?: string }>) => {
      const nextPage = typeof e.detail === 'string' ? e.detail : e.detail?.page;
      if (typeof nextPage !== 'string') {
        return;
      }

      navigateToPage(nextPage);
    };

    window.addEventListener("Weave:navigate", handleNavigate as EventListener);

    // 监听打开来源说明模态窗事件
    const handleOpenInspirationModal = () => {
      toggleInspirationPopover(null);
    };
    window.addEventListener("Weave:open-inspiration-modal", handleOpenInspirationModal);

    // 监听插件配置打开事件
    const handleOpenPluginConfig = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.pluginId) {
        showPluginConfigModal = detail.pluginId;
      }
    };
    activeDocument.addEventListener('Weave:open-plugin-config', handleOpenPluginConfig);
    
    // 监听子页面状态变化（用于侧边栏导航同步）
    const handleDeckFilterChange = (e: CustomEvent<string>) => {
      sidebarDeckFilter = e.detail as 'memory' | 'question-bank';
      logger.debug('[WeaveApp] 牌组筛选变化:', sidebarDeckFilter);
    };
    const handleCardViewChange = (e: CustomEvent<string>) => {
      sidebarCardView = e.detail as 'table' | 'grid' | 'kanban';
      logger.debug('[WeaveApp] 卡片视图变化:', sidebarCardView);
    };
    const handleDeckViewChange = (e: CustomEvent<string>) => {
      if (e.detail === 'kanban') {
        sidebarDeckStudyView = 'kanban';
        void plugin.saveDeckViewPreference('kanban').catch((error) => {
          logger.warn('[WeaveApp] 保存牌组视图偏好失败:', error);
        });
      }
    };
    window.addEventListener("Weave:deck-filter-change", handleDeckFilterChange as EventListener);
    window.addEventListener("Weave:card-view-change", handleCardViewChange as EventListener);
    window.addEventListener("Weave:deck-view-change", handleDeckViewChange as EventListener);

    const unregisterLegacyApkgImport = registerLegacyApkgImportRequestListener(
      plugin,
      () => dataStorage,
      {
        onImportComplete: async (result) => {
          if (!result.success) {
            return;
          }

          plugin.app.workspace.trigger("Weave:data-changed");
        },
      }
    );

    // 应用主题类到应用容器
    if (appElement) {
      themeClassCleanup = addThemeClasses(appElement);
      const themeManager = UnifiedThemeManager.getInstance();
      themeSurfaceCleanup = themeManager.addListener(() => {
        detectSidebarMode();
      });
      logger.debug('[WeaveApp] 主题类已应用到应用容器');
      
      detectSidebarMode();
      nativeTooltipCleanup = setupNativeTooltipCleanup(appElement);
    }

    const setupMobileViewportSync = () => {
      if (!appElement) return () => {};
      const isMobileLayout = Platform.isMobile
        || activeDocument.body.classList.contains('is-mobile')
        || activeDocument.body.classList.contains('is-phone');

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
      if (visibilityCorrectionFrameId) {
        window.cancelAnimationFrame(visibilityCorrectionFrameId);
        visibilityCorrectionFrameId = 0;
      }
      unsubscribeMainInterfaceStore();
      window.removeEventListener("Weave:navigate", handleNavigate as EventListener);
      window.removeEventListener("Weave:open-inspiration-modal", handleOpenInspirationModal);
      window.removeEventListener("Weave:deck-filter-change", handleDeckFilterChange as EventListener);
      window.removeEventListener("Weave:card-view-change", handleCardViewChange as EventListener);
      window.removeEventListener("Weave:deck-view-change", handleDeckViewChange as EventListener);
      unregisterLegacyApkgImport();
      activeDocument.removeEventListener('Weave:open-plugin-config', handleOpenPluginConfig);
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
    if (isMobileDevice && showInspirationPopover) {
      closeInspirationPopover();
    }
  });

</script>


<ResponsiveContainer classPrefix="weave">
  {#snippet children(responsive: ResponsiveState)}
    {@const isCompactLayout =
      Platform.isMobile
      || responsive?.isMobile
      || responsive?.isTablet
      || activeDocument.body.classList.contains('is-mobile')
      || activeDocument.body.classList.contains('is-phone')}
    {@const showInPageToolbar = !isCompactLayout || isInSidebarMode}
    <div
      bind:this={appElement}
      class="weave-app weave-app-inner"
      class:is-in-sidebar={isInSidebarMode}
      class:is-in-main-area={!isInSidebarMode}
      class:compact-layout={isCompactLayout}
      role="application"
    >
      {#if showInPageToolbar}
        <div
          class="weave-main-toolbar"
          class:compact-sidebar-toolbar={isCompactLayout && isInSidebarMode}
        >
          <SidebarNavHeader
            currentPage={activePage}
            {navigationVisibility}
            selectedFilter={sidebarDeckFilter}
            deckStudyView={activePage === 'deck-study' ? sidebarDeckStudyView : 'kanban'}
            currentView={sidebarCardView}
            cardDataSource={cardDataSource}
            app={plugin.app}
            {isInSidebarMode}
            inspirationPopoverOpen={showInspirationPopover}
            onOpenInspirationModal={toggleInspirationPopover}
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
              requestNavigation(pageId);
            }}
          />
        </div>
      {/if}

      <GlobalOperationProgressBar progress={globalOperationProgress} />
      
      <main
        class="weave-main-content"
        class:mobile={isMobileDevice}
        class:ai-assistant-active={isMobileDevice && activePage === 'ai-assistant'}
      >
        {#if deckStudyPageMounted}
          <div
            class="weave-page-host weave-page-host--deck-study"
            class:is-active={activePage === "deck-study"}
            aria-hidden={activePage !== "deck-study"}
          >
            <DeckStudyPage {dataStorage} {plugin} />
          </div>
        {/if}
        {#if activePage === "weave-card-management"}
          <WeaveCardManagementPage {dataStorage} {fsrs} {plugin} {currentLeaf} />
        {:else if activePage === "ai-assistant"}
          <AIAssistantPage
            {plugin}
            {dataStorage}
            {fsrs}
            onNavigate={(pageId) => {
              requestNavigation(pageId);
            }}
          />
        {:else if activePage === "settings"}
          <SettingsPage plugin={plugin as any} />
        {/if}

        <WeaveInspirationModal
          visible={showInspirationPopover}
          anchorEl={inspirationPopoverAnchor}
          onClose={closeInspirationPopover}
        />
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
    position: relative;
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
    position: relative;
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding-top: 0;
    margin-top: 0;
    transition: padding-top 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .weave-page-host {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .weave-page-host:not(.is-active) {
    display: none;
  }

  .weave-main-toolbar {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--weave-surface-background, var(--background-primary));
  }

  .weave-main-toolbar.compact-sidebar-toolbar {
    z-index: 4;
  }

  :global(body.is-mobile) .weave-app.is-in-sidebar .weave-main-toolbar .sidebar-nav-header,
  :global(body.is-phone) .weave-app.is-in-sidebar .weave-main-toolbar .sidebar-nav-header {
    min-height: 40px;
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

  :global(.weave-app.is-in-sidebar .ai-mobile-toolbar) {
    display: none;
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

</style>
