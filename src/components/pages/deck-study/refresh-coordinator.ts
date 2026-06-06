import type { Deck } from "../../../data/types";
import type { StudySession } from "../../../data/study-types";
import {
  MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE,
  type DataChangeEvent,
} from "../../../services/DataSyncService";
import { logger } from "../../../utils/logger";

interface DeckStudyRefreshCoordinatorOptions {
  setIsLoading: (value: boolean) => void;
  loadDecks: () => Promise<Deck[]>;
  loadStudySessionsData: () => Promise<StudySession[]>;
  calculateDeckStats: (sessions: StudySession[], targetDeckIds?: string[]) => Promise<void>;
  loadDeckTree: () => Promise<void>;
  loadStudySessions: (sessions: StudySession[]) => Promise<void>;
  resolveRefreshTargetDeckIds: (targetDeckIds: string[], availableDecks: Deck[]) => Promise<string[]>;
  waitForAllCoreServices: () => Promise<void>;
}

export interface DeckStudyRefreshCoordinator {
  refreshData: (showLoading?: boolean) => Promise<void>;
  refreshTargetedDeckData: (targetDeckIds: string[]) => Promise<void>;
  scheduleBackgroundRefresh: (event?: DataChangeEvent) => void;
  dispose: () => void;
}

export function createDeckStudyRefreshCoordinator(
  options: DeckStudyRefreshCoordinatorOptions
): DeckStudyRefreshCoordinator {
  let backgroundRefreshPromise: Promise<void> | null = null;
  let backgroundRefreshRequestedDeckIds = new Set<string>();
  let backgroundRefreshNeedsFull = false;
  let deferredMemoryStudyRefreshDeckIds = new Set<string>();
  let deferredMemoryStudyRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  function loadStudySessionsSafely(): Promise<StudySession[]> {
    return options.loadStudySessionsData().catch((error) => {
      logger.error("[DeckStudyPage] 加载学习历史失败:", error);
      return [] as StudySession[];
    });
  }

  async function refreshData(showLoading = false): Promise<void> {
    if (showLoading) {
      options.setIsLoading(true);
    }

    try {
      await options.waitForAllCoreServices();
      await options.loadDecks();
      const allStudySessionsPromise = loadStudySessionsSafely();

      await Promise.all([
        (async () => {
          const allStudySessions = await allStudySessionsPromise;
          await options.calculateDeckStats(allStudySessions);
        })(),
        options.loadDeckTree(),
        (async () => {
          const allStudySessions = await allStudySessionsPromise;
          await options.loadStudySessions(allStudySessions);
        })(),
      ]);
    } finally {
      if (showLoading) {
        options.setIsLoading(false);
      }
    }
  }

  function normalizeDeckIdValue(value: unknown): string {
    if (typeof value === "string") {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return "";
  }

  function getBackgroundRefreshDeckIds(event?: DataChangeEvent): string[] {
    const metadata = event?.metadata as { deckId?: unknown; deckIds?: unknown } | undefined;
    const normalizedDeckIds = Array.isArray(metadata?.deckIds)
      ? metadata.deckIds.map((deckId) => normalizeDeckIdValue(deckId)).filter(Boolean)
      : [];

    if (normalizedDeckIds.length > 0) {
      return Array.from(new Set(normalizedDeckIds));
    }

    const singleDeckId = normalizeDeckIdValue(metadata?.deckId);
    return singleDeckId ? [singleDeckId] : [];
  }

  function getBackgroundRefreshSource(event?: DataChangeEvent): string {
    const metadata = event?.metadata as { source?: unknown } | undefined;
    return typeof metadata?.source === "string" ? metadata.source : "";
  }

  function enqueueBackgroundRefresh(targetDeckIds: string[]): void {
    if (targetDeckIds.length > 0) {
      for (const deckId of targetDeckIds) {
        backgroundRefreshRequestedDeckIds.add(deckId);
      }
    } else {
      backgroundRefreshNeedsFull = true;
    }

    if (backgroundRefreshPromise) {
      return;
    }

    backgroundRefreshPromise = runBackgroundRefresh()
      .catch((error) => {
        logger.error("[DeckStudyPage] 后台刷新失败:", error);
      })
      .finally(() => {
        backgroundRefreshPromise = null;
        if (backgroundRefreshNeedsFull || backgroundRefreshRequestedDeckIds.size > 0) {
          scheduleBackgroundRefresh();
        }
      });
  }

  function scheduleDeferredMemoryStudyRefresh(): void {
    if (deferredMemoryStudyRefreshTimer) {
      window.clearTimeout(deferredMemoryStudyRefreshTimer);
    }

    deferredMemoryStudyRefreshTimer = window.setTimeout(() => {
      deferredMemoryStudyRefreshTimer = null;
      const targetDeckIds = Array.from(deferredMemoryStudyRefreshDeckIds);
      deferredMemoryStudyRefreshDeckIds = new Set<string>();
      if (targetDeckIds.length === 0) {
        return;
      }
      enqueueBackgroundRefresh(targetDeckIds);
    }, 650);
  }

  async function refreshTargetedDeckData(targetDeckIds: string[]): Promise<void> {
    const normalizedDeckIds = Array.from(
      new Set(targetDeckIds.map((deckId) => String(deckId || "").trim()).filter(Boolean))
    );
    if (normalizedDeckIds.length === 0) {
      await refreshData(false);
      return;
    }

    await options.waitForAllCoreServices();
    const decks = await options.loadDecks();
    const resolvedTargetDeckIds = await options.resolveRefreshTargetDeckIds(normalizedDeckIds, decks);
    if (resolvedTargetDeckIds.length === 0) {
      await refreshData(false);
      return;
    }

    const allStudySessionsPromise = loadStudySessionsSafely();

    await Promise.all([
      (async () => {
        const allStudySessions = await allStudySessionsPromise;
        await options.calculateDeckStats(allStudySessions, resolvedTargetDeckIds);
        await options.loadStudySessions(allStudySessions);
      })(),
      options.loadDeckTree(),
    ]);
  }

  async function runBackgroundRefresh(): Promise<void> {
    do {
      const shouldRunFullRefresh =
        backgroundRefreshNeedsFull || backgroundRefreshRequestedDeckIds.size === 0;
      const requestedDeckIds = Array.from(backgroundRefreshRequestedDeckIds);
      backgroundRefreshNeedsFull = false;
      backgroundRefreshRequestedDeckIds = new Set<string>();

      if (shouldRunFullRefresh) {
        await refreshData(false);
      } else {
        await refreshTargetedDeckData(requestedDeckIds);
      }
    } while (backgroundRefreshNeedsFull || backgroundRefreshRequestedDeckIds.size > 0);
  }

  function scheduleBackgroundRefresh(event?: DataChangeEvent): void {
    const source = getBackgroundRefreshSource(event);
    const targetDeckIds = getBackgroundRefreshDeckIds(event);

    if (
      source === MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE &&
      (event?.type === "cards" || event?.type === "sessions")
    ) {
      for (const deckId of targetDeckIds) {
        deferredMemoryStudyRefreshDeckIds.add(deckId);
      }

      if (event?.type === "sessions") {
        scheduleDeferredMemoryStudyRefresh();
      }
      return;
    }

    enqueueBackgroundRefresh(targetDeckIds);
  }

  function dispose(): void {
    if (deferredMemoryStudyRefreshTimer) {
      window.clearTimeout(deferredMemoryStudyRefreshTimer);
      deferredMemoryStudyRefreshTimer = null;
    }
    deferredMemoryStudyRefreshDeckIds = new Set<string>();
    backgroundRefreshRequestedDeckIds = new Set<string>();
    backgroundRefreshNeedsFull = false;
  }

  return {
    refreshData,
    refreshTargetedDeckData,
    scheduleBackgroundRefresh,
    dispose,
  };
}
