import { Notice } from "obsidian";
import type WeavePlugin from "../../../main";
import type { WeaveDataStorage } from "../../../data/storage";
import type { Deck } from "../../../data/types";
import type { ImportResult } from "../../../domain/apkg/types";
import { CreateDeckModalObsidian } from "../../modals/CreateDeckModalObsidian";
import { CreateQuestionBankModalObsidian } from "../../modals/CreateQuestionBankModalObsidian";
import {
	closeLegacyApkgImportModal,
	openLegacyApkgImportModal,
} from "../../../utils/legacy-apkg-import-action";

interface DeckStudyModalCoordinatorOptions {
  getPlugin: () => WeavePlugin;
  getDataStorage: () => WeaveDataStorage;
  tr: (key: string, vars?: Record<string, string>) => string;
  loadQBDeckTree: () => Promise<void>;
  refreshData: (showLoading?: boolean) => Promise<void>;
  refreshTargetedDeckData: (targetDeckIds: string[]) => Promise<void>;
}

export interface DeckStudyModalCoordinator {
  showCreateDeckModal: () => void;
  showCreateQuestionBankModal: () => void;
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
  let createQuestionBankModalInstance: CreateQuestionBankModalObsidian | null = null;
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
      onDeckCreated: () => {
        void (async () => {
          await options.refreshData();
          plugin.app.workspace.trigger("Weave:data-changed");
        })();
      },
      onClose: () => {
        createDeckModalInstance = null;
      },
    });
    createDeckModalInstance.open();
  }

  function showCreateQuestionBankModal(): void {
    createQuestionBankModalInstance?.close();
    const plugin = options.getPlugin();
    createQuestionBankModalInstance = new CreateQuestionBankModalObsidian(plugin.app, {
      plugin,
      onBankCreated: () => {
        void (async () => {
          await options.loadQBDeckTree();
          plugin.app.workspace.trigger("Weave:data-changed");
        })();
      },
      onClose: () => {
        createQuestionBankModalInstance = null;
      },
    });
    createQuestionBankModalInstance.open();
  }

  async function handleCreateDeckForCurrentFilter(selectedFilter: string): Promise<void> {
    if (selectedFilter === "question-bank") {
      showCreateQuestionBankModal();
      return;
    }

    showCreateDeckModal();
  }

  function showAPKGImportModal(): void {
    void openLegacyApkgImportModal(options.getPlugin(), options.getDataStorage(), {
      onImportComplete: handleAPKGImportComplete,
    });
  }

  function showEditDeckModal(deck: Deck): void {
    editDeckModalInstance?.close();
    const plugin = options.getPlugin();
    editDeckModalInstance = new CreateDeckModalObsidian(plugin.app, {
      plugin,
      dataStorage: options.getDataStorage(),
      mode: "edit",
      initialDeck: deck,
      onDeckUpdated: () => {
        void (async () => {
          await options.refreshData();
          plugin.app.workspace.trigger("Weave:data-changed");
        })();
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
    createQuestionBankModalInstance?.close();
    createQuestionBankModalInstance = null;
    closeLegacyApkgImportModal();
  }

  return {
    showCreateDeckModal,
    showCreateQuestionBankModal,
    handleCreateDeckForCurrentFilter,
    showAPKGImportModal,
    showEditDeckModal,
    closeAll,
  };
}
