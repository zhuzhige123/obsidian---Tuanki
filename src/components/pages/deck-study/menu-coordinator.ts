import { Menu } from "obsidian";
import type WeavePlugin from "../../../main";
import { PREMIUM_FEATURES } from "../../../services/premium/PremiumFeatureGuard";
import { logger } from "../../../utils/logger";
import { vaultStorage } from "../../../utils/vault-local-storage";
import { showDeckStudyMobileNavMenu } from "./mobile-nav-menu";

interface DeckStudyMenuCoordinatorOptions {
  getPlugin: () => WeavePlugin;
  getDeckCount: () => number;
  getCurrentView: () => "grid" | "kanban";
  setCurrentView: (view: "grid" | "kanban") => void;
  getSelectedFilter: () => string;
  setSelectedFilter: (filter: "memory" | "question-bank") => void;
  getMemoryDeckDisplayMode: () => "formal" | "emergent";
  setMemoryDeckDisplayMode: (mode: "formal" | "emergent") => void;
  showEmergentRuleGroupMenu: (anchor?: HTMLElement | null) => void;
  tr: (key: string, vars?: Record<string, string>) => string;
  isFeatureRestricted: (featureId: string) => boolean;
  canUseFeature: (featureId: string) => boolean;
  promptPremiumFeature: (featureId: string) => void;
  isAPKGImportEnabled: () => boolean;
  isCSVImportEnabled: () => boolean;
  shouldShowPremiumEntry: (featureId: string) => boolean;
  getPremiumEntryTitle: (baseTitle: string, featureId: string) => string;
  openAPKGImport: () => void;
  handleCSVImport: () => void;
  exportDeck: () => void;
  routeCreateDeckByFilter: (filter: string) => Promise<void>;
}

export interface DeckStudyMenuCoordinator {
  normalizeDeckFilter: (filter: string) => "memory" | "question-bank";
  handleFilterSelect: (filter: string) => void;
  showViewSwitcher: (event: MouseEvent) => void;
  showMoreActionsMenu: (event: MouseEvent) => void;
  getCreateEntryTitle: () => string;
  handleCreateDeckForCurrentFilter: () => Promise<void>;
  showMobileNavMenu: (event: MouseEvent) => void;
}

export function createDeckStudyMenuCoordinator(
  options: DeckStudyMenuCoordinatorOptions
): DeckStudyMenuCoordinator {
  function dispatchDeckFilterChange(filter: string): void {
    window.dispatchEvent(new CustomEvent("Weave:deck-filter-change", { detail: filter }));
  }

  function normalizeDeckFilter(
    filter: string
  ): "memory" | "question-bank" {
    if (
      filter === "question-bank" &&
      options.isFeatureRestricted(PREMIUM_FEATURES.QUESTION_BANK)
    ) {
      return "memory";
    }

    if (filter === "question-bank") {
      return filter;
    }

    return "memory";
  }

  function handleFilterSelect(filter: string): void {
    if (
      filter === "question-bank" &&
      options.isFeatureRestricted(PREMIUM_FEATURES.QUESTION_BANK)
    ) {
      options.promptPremiumFeature(PREMIUM_FEATURES.QUESTION_BANK);
      return;
    }

    const normalizedFilter = normalizeDeckFilter(filter);
    options.setSelectedFilter(normalizedFilter);
    vaultStorage.setItem("weave-deck-mode-filter", normalizedFilter);
    logger.debug("[DeckStudyPage] 切换模式筛选器:", normalizedFilter);
    dispatchDeckFilterChange(normalizedFilter);
  }

  function showViewSwitcher(event: MouseEvent): void {
    const menu = new Menu();
    const currentView = options.getCurrentView();
    const views = [
      { id: "grid", label: options.tr("deckStudyPage.views.grid"), icon: "grid", featureId: null },
      {
        id: "kanban",
        label: options.getPremiumEntryTitle(
          options.tr("deckStudyPage.views.kanban"),
          PREMIUM_FEATURES.KANBAN_VIEW
        ),
        icon: "columns",
        featureId: PREMIUM_FEATURES.KANBAN_VIEW,
      },
    ] as const;

    views.forEach((view) => {
      menu.addItem((item) => {
        item
          .setTitle(view.label)
          .setIcon(view.icon)
          .setChecked(currentView === view.id)
          .onClick(async () => {
            if (view.featureId && options.isFeatureRestricted(view.featureId)) {
              options.promptPremiumFeature(view.featureId);
              return;
            }

            options.setCurrentView(view.id);
            try {
              await options.getPlugin().saveDeckViewPreference(view.id);
            } catch (error) {
              logger.warn("保存视图偏好失败:", error);
            }
            window.dispatchEvent(new CustomEvent("Weave:deck-view-change", { detail: view.id }));
          });
      });
    });

    menu.showAtMouseEvent(event);
  }

  function showMoreActionsMenu(event: MouseEvent): void {
    const menu = new Menu();
    const selectedFilter = options.getSelectedFilter();

    if (options.isAPKGImportEnabled()) {
      menu.addItem((item) => {
        item
          .setTitle(options.tr("mainMenu.deckStudy.importLegacyPackage"))
          .setIcon("package")
          .onClick(() => {
            options.openAPKGImport();
          });
      });
    }

    if (
      options.isCSVImportEnabled() &&
      options.shouldShowPremiumEntry(PREMIUM_FEATURES.CSV_IMPORT)
    ) {
      menu.addItem((item) => {
        item
          .setTitle(
            options.getPremiumEntryTitle(
              options.tr("mainMenu.deckStudy.importCsv"),
              PREMIUM_FEATURES.CSV_IMPORT
            )
          )
          .setIcon("file-text")
          .onClick(options.handleCSVImport);
      });
    }

    menu.addItem((item) => {
      item
        .setTitle(options.tr("deckStudyPage.menu.exportJSON"))
        .setIcon("download")
        .setDisabled(options.getDeckCount() === 0)
        .onClick(options.exportDeck);
    });

    menu.showAtMouseEvent(event);
  }

  function getCreateEntryTitle(): string {
    const selectedFilter = options.getSelectedFilter();
    if (selectedFilter === "question-bank") {
      return options.tr("mainMenu.deckStudy.createQuestionBank");
    }

    return options.tr("mainMenu.deckStudy.createMemoryDeck");
  }

  async function handleCreateDeckForCurrentFilter(): Promise<void> {
    await options.routeCreateDeckByFilter(options.getSelectedFilter());
  }

  function showMobileNavMenu(event: MouseEvent): void {
    showDeckStudyMobileNavMenu({
      evt: event,
      selectedFilter: options.getSelectedFilter(),
      currentView: options.getCurrentView(),
      memoryDeckDisplayMode: options.getMemoryDeckDisplayMode(),
      tr: options.tr,
      getCreateEntryTitle,
      showViewSwitcher,
      handleCreateDeckForCurrentFilter,
      setMemoryDeckDisplayMode: options.setMemoryDeckDisplayMode,
      showEmergentRuleGroupMenu: () => {
        options.showEmergentRuleGroupMenu(null);
      },
      openAPKGImport: options.openAPKGImport,
      handleCSVImport: options.handleCSVImport,
      canUseFeature: options.canUseFeature,
      isAPKGImportEnabled: options.isAPKGImportEnabled,
      isCSVImportEnabled: options.isCSVImportEnabled,
      shouldShowPremiumEntry: options.shouldShowPremiumEntry,
      getPremiumEntryTitle: options.getPremiumEntryTitle,
    });
  }

  return {
    normalizeDeckFilter,
    handleFilterSelect,
    showViewSwitcher,
    showMoreActionsMenu,
    getCreateEntryTitle,
    handleCreateDeckForCurrentFilter,
    showMobileNavMenu,
  };
}
