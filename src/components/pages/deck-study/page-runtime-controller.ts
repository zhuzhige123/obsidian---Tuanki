import { Platform } from "obsidian";
import type WeavePlugin from "../../../main";
import type { DataChangeEvent } from "../../../services/DataSyncService";
import type { MemoryDeckMenuAction } from "../../../services/deck/MemoryDeckMenu";
import { logger } from "../../../utils/logger";

interface MemoryDeckActionRequestDetail {
  action: MemoryDeckMenuAction;
  deckId: string;
}

interface MainInterfaceMenuRequestDetail {
  page?: string;
  event?: MouseEvent;
  source?: string;
}

interface ToolbarActionDetail {
  action?: string;
  anchor?: HTMLElement | null;
  mode?: string;
}

interface DeckStudyPageRuntimeControllerOptions {
  getPlugin: () => WeavePlugin;
  getSelectedFilter: () => string;
  normalizeDeckStudyView: (value: string | null | undefined) => string;
  setCurrentView: (value: string) => void;
  setIsMobile: (value: boolean) => void;
  registerEmergentRuleGroupPopoverBridge: () => () => void;
  refreshData: (showLoading?: boolean) => Promise<void>;
  scheduleBackgroundRefresh: (event?: DataChangeEvent) => void;
  handleFilterSelect: (filter: string) => void;
  handleMemoryDeckMenuAction: (action: MemoryDeckMenuAction, deckId: string) => Promise<void>;
  showViewSwitcher: (event: MouseEvent) => void;
  showMobileNavMenu: (event: MouseEvent) => Promise<void> | void;
  showEmergentRuleGroupMenu: (anchor?: HTMLElement | null) => void;
  setMemoryDeckDisplayMode: (mode: string | null | undefined) => void;
}

export interface DeckStudyPageRuntimeController {
  mount: () => () => void;
}

export function createDeckStudyPageRuntimeController(
  options: DeckStudyPageRuntimeControllerOptions
): DeckStudyPageRuntimeController {
  function dispatchDeckViewChange(view: string): void {
    window.dispatchEvent(new CustomEvent("Weave:deck-view-change", { detail: view }));
  }

  function dispatchDeckFilterChange(): void {
    window.dispatchEvent(
      new CustomEvent("Weave:deck-filter-change", { detail: options.getSelectedFilter() })
    );
  }

  function mount(): () => void {
    const plugin = options.getPlugin();
    const unregisterEmergentRuleGroupPopoverBridge = options.registerEmergentRuleGroupPopoverBridge();
    options.setIsMobile(Platform.isMobile || document.body.classList.contains("is-mobile"));

    let unsubscribeDecks: (() => void) | undefined;
    let unsubscribeSessions: (() => void) | undefined;
    let unsubscribeCards: (() => void) | undefined;

    void (async () => {
      try {
        const savedView = await plugin.loadDeckViewPreference();
        if (savedView && ["kanban", "grid"].includes(savedView)) {
          const normalizedView = options.normalizeDeckStudyView(savedView);
          options.setCurrentView(normalizedView);
          dispatchDeckViewChange(normalizedView);
        } else {
          const normalizedView = options.normalizeDeckStudyView(null);
          options.setCurrentView(normalizedView);
          dispatchDeckViewChange(normalizedView);
        }
      } catch (error) {
        logger.warn("加载视图偏好失败:", error);
        const normalizedView = options.normalizeDeckStudyView(null);
        options.setCurrentView(normalizedView);
        dispatchDeckViewChange(normalizedView);
      }

      if (plugin.dataSyncService) {
        unsubscribeDecks = plugin.dataSyncService.subscribe(
          "decks",
          async (event: DataChangeEvent) => {
            options.scheduleBackgroundRefresh(event);
          },
          { debounce: 300 }
        );

        unsubscribeSessions = plugin.dataSyncService.subscribe(
          "sessions",
          async (event: DataChangeEvent) => {
            options.scheduleBackgroundRefresh(event);
          },
          { debounce: 300 }
        );

        unsubscribeCards = plugin.dataSyncService.subscribe(
          "cards",
          async (event: DataChangeEvent) => {
            options.scheduleBackgroundRefresh(event);
          },
          { debounce: 500 }
        );
      }
    })();

    const handleCardCreated = async () => {
      await options.refreshData(false);
    };

    const handleCardUpdated = async () => {
      logger.debug("[DeckStudyPage] 接收到卡片更新事件，刷新数据");
      await options.refreshData(false);
    };

    const workspace = plugin.app.workspace as typeof plugin.app.workspace & {
      on: (eventName: string, callback: (...args: any[]) => void) => void;
      off: (eventName: string, callback: (...args: any[]) => void) => void;
    };
    workspace.on("Weave:card-created", handleCardCreated);
    workspace.on("Weave:card-updated", handleCardUpdated);

    void options.refreshData();

    const handleShowViewMenu = (event: Event) => {
      const detail = (event as CustomEvent<{ event?: MouseEvent }>).detail;
      if (detail?.event instanceof MouseEvent) {
        options.showViewSwitcher(detail.event);
      }
    };
    window.addEventListener("show-view-menu", handleShowViewMenu as EventListener);

    const handleSidebarFilterSelect = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string") {
        options.handleFilterSelect(detail);
      }
    };
    window.addEventListener(
      "Weave:sidebar-filter-select",
      handleSidebarFilterSelect as EventListener
    );

    const handleExternalDeckMenuAction = (event: Event) => {
      const detail = (event as CustomEvent<MemoryDeckActionRequestDetail>).detail;
      if (!detail?.deckId) {
        return;
      }
      void options.handleMemoryDeckMenuAction(detail.action, detail.deckId);
    };
    window.addEventListener(
      "Weave:request-memory-deck-action",
      handleExternalDeckMenuAction as EventListener
    );

    const handleMainInterfaceMenuRequest = (event: Event) => {
      const detail = (event as CustomEvent<MainInterfaceMenuRequestDetail>).detail;
      if (detail?.page !== "deck-study") {
        return;
      }
      if (!(detail.event instanceof MouseEvent)) {
        return;
      }
      event.preventDefault();
      void options.showMobileNavMenu(detail.event);
    };
    window.addEventListener(
      "Weave:request-main-interface-menu",
      handleMainInterfaceMenuRequest as EventListener
    );

    const handleDeckStudyToolbarAction = (event: Event) => {
      const detail = (event as CustomEvent<ToolbarActionDetail>).detail;
      if (detail?.action === "open-emergent-rule-groups") {
        options.showEmergentRuleGroupMenu(detail.anchor || null);
        return;
      }

      if (detail?.action === "set-memory-deck-display-mode") {
        options.setMemoryDeckDisplayMode(detail.mode);
      }
    };
    window.addEventListener(
      "Weave:deck-study-toolbar-action",
      handleDeckStudyToolbarAction as EventListener
    );

    dispatchDeckFilterChange();

    return () => {
      unsubscribeDecks?.();
      unsubscribeSessions?.();
      unsubscribeCards?.();
      workspace.off("Weave:card-created", handleCardCreated);
      workspace.off("Weave:card-updated", handleCardUpdated);
      window.removeEventListener("show-view-menu", handleShowViewMenu as EventListener);
      window.removeEventListener(
        "Weave:sidebar-filter-select",
        handleSidebarFilterSelect as EventListener
      );
      window.removeEventListener(
        "Weave:request-memory-deck-action",
        handleExternalDeckMenuAction as EventListener
      );
      window.removeEventListener(
        "Weave:request-main-interface-menu",
        handleMainInterfaceMenuRequest as EventListener
      );
      window.removeEventListener(
        "Weave:deck-study-toolbar-action",
        handleDeckStudyToolbarAction as EventListener
      );
      unregisterEmergentRuleGroupPopoverBridge();
    };
  }

  return {
    mount,
  };
}
