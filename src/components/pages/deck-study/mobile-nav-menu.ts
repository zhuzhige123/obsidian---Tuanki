import { Menu } from "obsidian";
import { PREMIUM_FEATURES } from "../../../services/premium/PremiumFeatureGuard";

export interface DeckStudyMobileNavMenuOptions {
  evt?: MouseEvent;
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

/** 将牌组学习移动菜单项写入已有 Menu（用于 Obsidian 官方 onPaneMenu） */
export function populateDeckStudyMobileNavMenu(
  menu: Menu,
  options: DeckStudyMobileNavMenuOptions
): void {
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
      .onClick((evt) => {
        const viewEvent =
          evt instanceof MouseEvent
            ? evt
            : options.evt ??
              new MouseEvent("click", {
                bubbles: true,
                clientX: Math.round(window.innerWidth / 2),
                clientY: Math.max(96, Math.round(window.innerHeight / 2)),
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
          const anchor = options.evt;
          window.dispatchEvent(
            new CustomEvent("Weave:open-deck-kanban-menu", {
              detail: {
                x: anchor?.clientX ?? Math.round(window.innerWidth / 2),
                y: anchor?.clientY ?? Math.max(96, Math.round(window.innerHeight / 2)),
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

}

export function showDeckStudyMobileNavMenu(options: DeckStudyMobileNavMenuOptions & { evt: MouseEvent }): void {
  const menu = new Menu();
  populateDeckStudyMobileNavMenu(menu, options);
  menu.showAtMouseEvent(options.evt);
}
