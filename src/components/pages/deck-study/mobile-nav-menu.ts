import { Menu } from "obsidian";
import { PREMIUM_FEATURES } from "../../../services/premium/PremiumFeatureGuard";

interface MobileNavMenuOptions {
  evt: MouseEvent;
  selectedFilter: string;
  currentView: "grid" | "kanban";
  memoryDeckDisplayMode: "formal" | "emergent";
  tr: (key: string, vars?: Record<string, string>) => string;
  getCreateEntryTitle: () => string;
  showViewSwitcher: (evt: MouseEvent) => void;
  handleCreateDeckForCurrentFilter: () => Promise<void>;
  setMemoryDeckDisplayMode: (mode: "formal" | "emergent") => void;
  showEmergentRuleGroupMenu: () => void;
  openAPKGImport: () => void;
  handleCSVImport: () => void;
  canUseFeature: (featureId: string) => boolean;
  isAPKGImportEnabled: () => boolean;
  isCSVImportEnabled: () => boolean;
  shouldShowPremiumEntry: (featureId: string) => boolean;
  getPremiumEntryTitle: (baseTitle: string, featureId: string) => string;
}

export function showDeckStudyMobileNavMenu(options: MobileNavMenuOptions): void {
  const menu = new Menu();

  menu.addItem((item) => {
    item
      .setTitle(options.tr("navigation.deckStudy"))
      .setIcon("graduation-cap")
      .setChecked(true)
      .onClick(() => {});
  });

  menu.addItem((item) => {
    item
      .setTitle(options.tr("navigation.cardManagement"))
      .setIcon("list")
      .onClick(() => {
        window.dispatchEvent(
          new CustomEvent("Weave:navigate", {
            detail: "weave-card-management",
          })
        );
      });
  });

  menu.addItem((item) => {
    item
      .setTitle(options.tr("navigation.aiAssistant"))
      .setIcon("bot")
      .onClick(() => {
        window.dispatchEvent(
          new CustomEvent("Weave:navigate", {
            detail: "ai-assistant",
          })
        );
      });
  });

  menu.addSeparator();

  menu.addItem((item) => {
    item
      .setTitle(options.tr("navigation.switchView"))
      .setIcon("layout-grid")
      .onClick(() => {
        const viewEvent = new MouseEvent("click", {
          bubbles: true,
          clientX: options.evt.clientX,
          clientY: options.evt.clientY,
        });
        options.showViewSwitcher(viewEvent);
      });
  });

  menu.addItem((item) => {
    item
      .setTitle(options.getCreateEntryTitle())
      .setIcon("folder-plus")
      .onClick(() => {
        void options.handleCreateDeckForCurrentFilter();
      });
  });

  if (options.currentView === "kanban") {
    menu.addItem((item) => {
      item
        .setTitle(options.tr("study.mobileHeader.kanbanColumnSettings"))
        .setIcon("sliders")
        .onClick(() => {
          window.dispatchEvent(
            new CustomEvent("Weave:open-deck-kanban-menu", {
              detail: {
                x: options.evt.clientX,
                y: options.evt.clientY,
                filter: options.selectedFilter,
              },
            })
          );
        });
    });
  }

  if (options.selectedFilter === "memory" && options.shouldShowPremiumEntry(PREMIUM_FEATURES.EMERGENT_DECKS)) {
    const nextMode = options.memoryDeckDisplayMode === "formal" ? "emergent" : "formal";
    const toggleTitle = nextMode === "emergent"
      ? options.getPremiumEntryTitle("切换到涌现牌组", PREMIUM_FEATURES.EMERGENT_DECKS)
      : "切换到正式牌组";

    menu.addItem((item) => {
      item
        .setTitle(toggleTitle)
        .setIcon(nextMode === "emergent" ? "sparkles" : "folder")
        .setChecked(options.memoryDeckDisplayMode === "emergent")
        .onClick(() => {
          options.setMemoryDeckDisplayMode(nextMode);
        });
    });

    if (
      options.memoryDeckDisplayMode === "emergent" &&
      options.canUseFeature(PREMIUM_FEATURES.EMERGENT_DECKS)
    ) {
      menu.addItem((item) => {
        item
          .setTitle("涌现筛选")
          .setIcon("filter")
          .onClick(() => {
            options.showEmergentRuleGroupMenu();
          });
      });
    }
  }

  menu.addSeparator();

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

  if (options.isCSVImportEnabled() && options.shouldShowPremiumEntry(PREMIUM_FEATURES.CSV_IMPORT)) {
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

  menu.showAtMouseEvent(options.evt);
}
