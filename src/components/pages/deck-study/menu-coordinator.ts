import { Menu } from "obsidian";
import type WeavePlugin from "../../../main";
import { PREMIUM_FEATURES } from "../../../services/premium/PremiumFeatureGuard";
import { logger } from "../../../utils/logger";
import { vaultStorage } from "../../../utils/vault-local-storage";
import {
  populateDeckStudyMobileNavMenu,
  showDeckStudyMobileNavMenu,
} from "./mobile-nav-menu";

interface DeckStudyMenuCoordinatorOptions {
  getPlugin: () => WeavePlugin;
  getDeckCount: () => number;
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
  showMoreActionsMenu: (event: MouseEvent) => void;
  getCreateEntryTitle: () => string;
  handleCreateDeckForCurrentFilter: () => Promise<void>;
  populateMobileNavMenu: (menu: Menu) => void;
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

  function showMoreActionsMenu(event: MouseEvent): void {
    const menu = new Menu();

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

  function buildMobileNavMenuOptions(evt?: MouseEvent) {
    return {
      evt,
      selectedFilter: options.getSelectedFilter(),
      memoryDeckDisplayMode: options.getMemoryDeckDisplayMode(),
      tr: options.tr,
      getCreateEntryTitle,
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
    };
  }

  function populateMobileNavMenu(menu: Menu): void {
    populateDeckStudyMobileNavMenu(menu, buildMobileNavMenuOptions());
  }

  function showMobileNavMenu(event: MouseEvent): void {
    showDeckStudyMobileNavMenu({
      ...buildMobileNavMenuOptions(event),
      evt: event,
    });
  }

  return {
    normalizeDeckFilter,
    handleFilterSelect,
    showMoreActionsMenu,
    getCreateEntryTitle,
    handleCreateDeckForCurrentFilter,
    populateMobileNavMenu,
    showMobileNavMenu,
  };
}
