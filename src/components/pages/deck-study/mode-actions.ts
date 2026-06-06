import { Notice } from "obsidian";
import type WeavePlugin from "../../../main";
import type { Deck } from "../../../data/types";
import type { WeaveDataStorage } from "../../../data/storage";
import type { MemoryDeckMenuAction } from "../../../services/deck/MemoryDeckMenu";
import { recomputeAndBroadcastIRData } from "../../../services/incremental-reading/IRScheduleRefreshService";
import { logger } from "../../../utils/logger";
import { openObsidianDeckEditModal } from "../../../utils/obsidian-deck-edit-modal";

interface DeckStudyModeActionsOptions {
  getPlugin: () => WeavePlugin;
  getDataStorage: () => WeaveDataStorage;
  tr: (key: string, vars?: Record<string, string>) => string;
  getDecks: () => Deck[];
  startStudy: (deckId: string) => Promise<void>;
  startAdvanceStudy: (deckId: string) => Promise<void>;
  editDeck: (deckId: string) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<void>;
  dissolveDeck: (deckId: string) => Promise<void>;
  openDeckAnalytics: (deckId: string) => Promise<void>;
  loadQBDeckTree: () => Promise<void>;
  promptPremiumFeature: (featureId: string) => void;
  isFeatureRestricted: (featureId: string) => boolean;
}

export interface DeckStudyModeActions {
  kanbanStartStudy: (selectedFilter: string, deckId: string) => Promise<void>;
  kanbanEditDeck: (selectedFilter: string, deckId: string) => Promise<void>;
  kanbanDeleteDeck: (selectedFilter: string, deckId: string) => Promise<void>;
  handleMemoryDeckMenuAction: (action: MemoryDeckMenuAction, deckId: string) => Promise<void>;
}

export function createDeckStudyModeActions(
  options: DeckStudyModeActionsOptions
): DeckStudyModeActions {
  function collectAvailableTags(decks: Array<{ tags?: string[] }>): string[] {
    return Array.from(
      new Set(
        decks.flatMap((deck) => (Array.isArray(deck.tags) ? deck.tags : [])).filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right, "zh-CN"));
  }

  async function kanbanStartStudy(selectedFilter: string, deckId: string): Promise<void> {
    if (selectedFilter === "incremental-reading") {
      try {
        const plugin = options.getPlugin();
        const { IRStorageService: IRStorageServiceCompat } = await import(
          "../../../services/incremental-reading/IRStorageService"
        );
        const irStorageCompat = new IRStorageServiceCompat(plugin.app);
        await irStorageCompat.initialize();
        const irDeckCompat = await irStorageCompat.getDeckById(deckId);
        const redirectDeckName =
          irDeckCompat?.name || options.tr("deckStudyPage.fallback.incrementalReading");

        await plugin.redirectIncrementalReadingToSidebar({
          deckPath: deckId,
          deckName: redirectDeckName,
          closeLegacyFocusLeaves: true,
        });
      } catch (error) {
        logger.error("[DeckStudyPage] IR kanban 开始阅读失败:", error);
        new Notice(options.tr("deckStudyPage.notices.startReadingFailed"));
      }
      return;
    }

    if (selectedFilter === "question-bank") {
      try {
        const plugin = options.getPlugin();
        if (!plugin.questionBankService) {
          new Notice(options.tr("deckStudyPage.notices.qbServiceNotInit"));
          return;
        }
        const questions = await plugin.questionBankService.getQuestionsByBank(deckId);
        const bank = plugin.questionBankService.getBankById(deckId);

        if (questions.length === 0) {
          new Notice(options.tr("deckStudyPage.notices.noQuestions"));
          return;
        }

        await plugin.openQuestionBankSession({
          bankId: deckId,
          bankName: bank?.name || options.tr("deckStudyPage.fallback.unknownBank"),
          mode: "exam",
        });
      } catch (error) {
        logger.error("[DeckStudyPage] QB kanban 开始考试失败:", error);
        new Notice(options.tr("deckStudyPage.notices.startExamFailed"));
      }
      return;
    }

    await options.startStudy(deckId);
  }

  async function kanbanEditDeck(selectedFilter: string, deckId: string): Promise<void> {
    if (selectedFilter === "incremental-reading") {
      try {
        const plugin = options.getPlugin();
        const { IRStorageService } = await import("../../../services/incremental-reading/IRStorageService");
        const irStorage = new IRStorageService(plugin.app);
        await irStorage.initialize();
        const deck = await irStorage.getDeckById(deckId);
        if (!deck) {
          new Notice(options.tr("deckStudyPage.notices.deckNotFound"));
          return;
        }

        const allIRDecks = Object.values(await irStorage.getAllDecks());
        openObsidianDeckEditModal({
          app: plugin.app,
          title: "编辑专题",
          nameLabel: options.tr("deckStudyPage.edit.name"),
          tagLabel: "标签",
          tagPlaceholder: options.tr("deckStudyPage.edit.tagPlaceholder"),
          tagHint: "可为专题设置一个标签，用于分组和筛选。",
          confirmText: options.tr("common.save"),
          cancelText: options.tr("common.cancel"),
          initialName: deck.name,
          initialTag: deck.tags && deck.tags.length > 0 ? deck.tags[0] : "",
          availableTags: collectAvailableTags(allIRDecks),
          onSubmit: async ({ name, tag }) => {
            try {
              deck.name = name;
              deck.tags = tag ? [tag] : [];
              deck.updatedAt = new Date().toISOString();
              await irStorage.saveDeck(deck);

              await recomputeAndBroadcastIRData(plugin.app, "tag_group_changed", {
                deckIds: [String(deck.id || deckId || "").trim()].filter(Boolean),
              });
              plugin.app.workspace.trigger("Weave:data-changed");
              new Notice(options.tr("deckStudyPage.notices.deckUpdated"));
            } catch (error) {
              logger.error("[kanbanEditDeck] IR edit failed:", error);
              new Notice(options.tr("deckStudyPage.notices.editFailed"));
              throw error;
            }
          },
        });
      } catch (error) {
        logger.error("[kanbanEditDeck] IR编辑模态窗创建失败:", error);
      }
      return;
    }

    if (selectedFilter === "question-bank") {
      try {
        const bank =
          options.getDecks().find((deck) => deck.id === deckId) ||
          (await options.getDataStorage().getDeck(deckId));
        if (!bank) {
          new Notice(options.tr("deckStudyPage.notices.deckNotFound"));
          return;
        }

        const plugin = options.getPlugin();
        const allDecks = await options.getDataStorage().getDecks();
        const questionBankDecks = allDecks.filter(
          (deck) => deck.purpose === "test" || deck.deckType === "question-bank"
        );
        openObsidianDeckEditModal({
          app: plugin.app,
          title: "编辑考试题组",
          nameLabel: options.tr("deckStudyPage.edit.name"),
          tagLabel: "标签",
          tagPlaceholder: options.tr("deckStudyPage.edit.tagPlaceholder"),
          tagHint: "可为考试题组设置一个标签，用于分组和筛选。",
          confirmText: options.tr("common.save"),
          cancelText: options.tr("common.cancel"),
          initialName: bank.name,
          initialTag: bank.tags && bank.tags.length > 0 ? bank.tags[0] : "",
          availableTags: collectAvailableTags(questionBankDecks),
          onSubmit: async ({ name, tag }) => {
            try {
              const updated = {
                ...bank,
                name,
                tags: tag ? [tag] : [],
                modified: new Date().toISOString(),
              };
              const result = await options.getDataStorage().saveDeck(updated);
              if (!result.success) {
                throw new Error(result.error || options.tr("common.unknown"));
              }
              await options.loadQBDeckTree();
              plugin.app.workspace.trigger("Weave:data-changed");
              new Notice(options.tr("deckStudyPage.notices.deckUpdated"));
            } catch (error) {
              logger.error("[kanbanEditDeck] QB edit failed:", error);
              new Notice(options.tr("deckStudyPage.notices.editFailed"));
              throw error;
            }
          },
        });
      } catch (error) {
        logger.error("[kanbanEditDeck] QB编辑模态窗创建失败:", error);
      }
      return;
    }

    await options.editDeck(deckId);
  }

  async function kanbanDeleteDeck(selectedFilter: string, deckId: string): Promise<void> {
    if (selectedFilter === "incremental-reading") {
      try {
        const plugin = options.getPlugin();
        const { showObsidianConfirm } = await import("../../../utils/obsidian-confirm");
        const { IRStorageService } = await import("../../../services/incremental-reading/IRStorageService");
        const irStorage = new IRStorageService(plugin.app);
        await irStorage.initialize();
        const deck = await irStorage.getDeckById(deckId);
        if (!deck) {
          new Notice(options.tr("deckStudyPage.notices.deckNotFound"));
          return;
        }
        const confirmed = await showObsidianConfirm(
          plugin.app,
          `${options.tr("common.confirmDelete")}: "${deck.name}"?`,
          { title: options.tr("common.confirmDelete") }
        );
        if (!confirmed) {
          return;
        }
        await irStorage.deleteDeck(deckId);
        await recomputeAndBroadcastIRData(plugin.app, "ui_refresh", {
          deckIds: [String(deckId || "").trim()].filter(Boolean),
        });
        plugin.app.workspace.trigger("Weave:data-changed");
        new Notice(options.tr("notifications.success.cardDeleted"));
      } catch (error) {
        logger.error("[kanbanDeleteDeck] IR delete failed:", error);
        new Notice(options.tr("notifications.error.deleteFailed"));
      }
      return;
    }

    if (selectedFilter === "question-bank") {
      try {
        const plugin = options.getPlugin();
        const { showObsidianConfirm } = await import("../../../utils/obsidian-confirm");
        const bank =
          options.getDecks().find((deck) => deck.id === deckId) ||
          (await options.getDataStorage().getDeck(deckId));
        if (!bank) {
          new Notice(options.tr("deckStudyPage.notices.deckNotFound"));
          return;
        }
        const confirmed = await showObsidianConfirm(
          plugin.app,
          `${options.tr("common.confirmDelete")}: "${bank.name}"?`,
          { title: options.tr("common.confirmDelete") }
        );
        if (!confirmed) {
          return;
        }
        await options.getDataStorage().deleteDeck(deckId);
        await options.loadQBDeckTree();
        plugin.app.workspace.trigger("Weave:data-changed");
        new Notice(options.tr("notifications.success.cardDeleted"));
      } catch (error) {
        logger.error("[kanbanDeleteDeck] QB delete failed:", error);
        new Notice(options.tr("notifications.error.deleteFailed"));
      }
      return;
    }

    await options.deleteDeck(deckId);
  }

  async function handleMemoryDeckMenuAction(
    action: MemoryDeckMenuAction,
    deckId: string
  ): Promise<void> {
    switch (action) {
      case "advance-study":
        await options.startAdvanceStudy(deckId);
        return;
      case "deck-analytics":
        await options.openDeckAnalytics(deckId);
        return;
      case "edit-deck":
        await options.editDeck(deckId);
        return;
      case "delete-deck":
        await options.deleteDeck(deckId);
        return;
      case "dissolve-deck":
        await options.dissolveDeck(deckId);
        return;
    }
  }

  return {
    kanbanStartStudy,
    kanbanEditDeck,
    kanbanDeleteDeck,
    handleMemoryDeckMenuAction,
  };
}
