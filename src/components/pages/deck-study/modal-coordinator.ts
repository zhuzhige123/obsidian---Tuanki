import { Notice } from "obsidian";
import type WeavePlugin from "../../../main";
import type { WeaveDataStorage } from "../../../data/storage";
import type { Deck } from "../../../data/types";
import type { ImportResult } from "../../../domain/apkg/types";
import { APKGImportModalObsidian } from "../../modals/APKGImportModalObsidian";
import { CreateDeckModalObsidian } from "../../modals/CreateDeckModalObsidian";
import { logger } from "../../../utils/logger";

interface DeckStudyModalCoordinatorOptions {
  getPlugin: () => WeavePlugin;
  getDataStorage: () => WeaveDataStorage;
  tr: (key: string, vars?: Record<string, string>) => string;
  setShowCreateQuestionBankModal: (value: boolean) => void;
  refreshData: (showLoading?: boolean) => Promise<void>;
  refreshTargetedDeckData: (targetDeckIds: string[]) => Promise<void>;
}

export interface DeckStudyModalCoordinator {
  showCreateDeckModal: () => void;
  handleCreateDeckForCurrentFilter: (selectedFilter: string) => Promise<void>;
  showAPKGImportModal: () => void;
  showEditDeckModal: (deck: Deck) => void;
  closeAll: () => void;
}

export function createDeckStudyModalCoordinator(
  options: DeckStudyModalCoordinatorOptions
): DeckStudyModalCoordinator {
  let createDeckModalInstance: CreateDeckModalObsidian | null = null;
  let editDeckModalInstance: CreateDeckModalObsidian | null = null;
  let apkgImportModalInstance: APKGImportModalObsidian | null = null;

  async function handleAPKGImportComplete(result: ImportResult): Promise<void> {
    if (result.success) {
      const message = options.tr("deckStudyPage.import.success", {
        deckName: result.deckName || options.tr("common.unknown"),
        count: String(result.stats.importedCards),
      });
      new Notice(`✅ ${message}`, 5000);

      const importedDeckId = String(result.deckId || "").trim();
      if (importedDeckId) {
        await options.refreshTargetedDeckData([importedDeckId]);
      } else {
        await options.refreshData();
      }

      options.getPlugin().app.workspace.trigger("Weave:data-changed");
      return;
    }

    const errorMessage = result.errors && result.errors.length > 0
      ? result.errors[0].message
      : options.tr("notifications.error.importFailed");
    new Notice(`❌ ${errorMessage}`, 8000);
  }

  function showCreateDeckModal(): void {
    createDeckModalInstance?.close();
    const plugin = options.getPlugin();
    createDeckModalInstance = new CreateDeckModalObsidian(plugin.app, {
      plugin,
      dataStorage: options.getDataStorage(),
      mode: "create",
      onDeckCreated: async () => {
        await options.refreshData();
        plugin.app.workspace.trigger("Weave:data-changed");
      },
      onClose: () => {
        createDeckModalInstance = null;
      },
    });
    createDeckModalInstance.open();
  }

  async function handleCreateDeckForCurrentFilter(selectedFilter: string): Promise<void> {
    if (selectedFilter === "question-bank") {
      options.setShowCreateQuestionBankModal(true);
      return;
    }

    showCreateDeckModal();
  }

  function showAPKGImportModal(): void {
    apkgImportModalInstance?.close();
    const plugin = options.getPlugin();
    apkgImportModalInstance = new APKGImportModalObsidian(plugin.app, {
      plugin,
      dataStorage: options.getDataStorage(),
      wasmUrl: plugin.wasmUrl,
      legacyImportAvailable: plugin.hasLegacyApkgImportRuntime(),
      legacyImportHelpText: plugin.getLegacyApkgImportUnavailableMessage(),
      onImportComplete: handleAPKGImportComplete,
      onClose: () => {
        apkgImportModalInstance = null;
      },
    });
    apkgImportModalInstance.open();
  }

  function showEditDeckModal(deck: Deck): void {
    editDeckModalInstance?.close();
    const plugin = options.getPlugin();
    editDeckModalInstance = new CreateDeckModalObsidian(plugin.app, {
      plugin,
      dataStorage: options.getDataStorage(),
      mode: "edit",
      initialDeck: deck,
      onDeckUpdated: async () => {
        await options.refreshData();
        plugin.app.workspace.trigger("Weave:data-changed");
      },
      onClose: () => {
        editDeckModalInstance = null;
      },
    });
    editDeckModalInstance.open();
  }

  function closeAll(): void {
    createDeckModalInstance?.close();
    createDeckModalInstance = null;
    editDeckModalInstance?.close();
    editDeckModalInstance = null;
    apkgImportModalInstance?.close();
    apkgImportModalInstance = null;
  }

  return {
    showCreateDeckModal,
    handleCreateDeckForCurrentFilter,
    showAPKGImportModal,
    showEditDeckModal,
    closeAll,
  };
}
