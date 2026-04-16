<script lang="ts">
  /** IR calendar sidebar state and interactions. */
  import { onDestroy, onMount } from 'svelte';
  import { Menu, Notice, Platform, TFile, normalizePath } from 'obsidian';
  import { mount, unmount } from 'svelte';
  import type AnkiObsidianPlugin from '../../main';
  import type { IRDeck, IRBlock, IRBlockV4, IRSession, IRTagGroup } from '../../types/ir-types';
  import { createDefaultIRBlockV4, migrateToIRBlockV4 } from '../../types/ir-types';
  import type { ReadingMaterial } from '../../types/incremental-reading-types';
  import { IRStorageService } from '../../services/incremental-reading/IRStorageService';
  import { IRChunkScheduleAdapter } from '../../services/incremental-reading/IRChunkScheduleAdapter';
  import { IRPdfBookmarkTaskService, isPdfBookmarkTaskId } from '../../services/incremental-reading/IRPdfBookmarkTaskService';
  import { IREpubBookmarkTaskService, isEpubBookmarkTaskId } from '../../services/incremental-reading/IREpubBookmarkTaskService';
  import { EpubStorageService } from '../../services/epub/EpubStorageService';
  import { IRPointWriteService } from '../../services/incremental-reading/IRPointWriteService';
  import { IRPointTagService, normalizeReadingPointTags } from '../../services/incremental-reading/IRPointTagService';
  import { IRV4SchedulerService } from '../../services/incremental-reading/IRV4SchedulerService';
  import { IRScheduleKernel, getSharedIRScheduleKernel, type IRScheduleExplanation } from '../../services/incremental-reading/IRScheduleKernel';
  import {
    buildProjectedDayLoadMap,
    getProjectedScheduleSummary,
    type IRProjectedScheduleItem
  } from '../../services/incremental-reading/IRProjectedScheduleSummary';
  import {
    recomputeAndBroadcastIRData,
    type UpdatedEventDetail
  } from '../../services/incremental-reading/IRScheduleRefreshService';
  import { getSharedIRWorkspaceSnapshotService } from '../../services/incremental-reading/IRWorkspaceSnapshotService';
  import { calculatePsi } from '../../services/incremental-reading/IRCoreAlgorithmsV4';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import FloatingMenu from '../ui/FloatingMenu.svelte';
  import IRPrioritySlider from './IRPrioritySlider.svelte';
  import IRScheduleImpactPreviewPanel, { type PreviewDetails } from './IRScheduleImpactPreviewPanel.svelte';
  import { MaterialImportModalObsidian } from './MaterialImportModalObsidian';
  import AddReadingPointModal from './AddReadingPointModal.svelte';
  import { IRAnalyticsModalObsidian } from './IRAnalyticsModalObsidian';
  import IRBlockInfoModal from './IRBlockInfoModal.svelte';
  import IRReviewReminderModal from './IRReviewReminderModal.svelte';
  import { MarkdownFileSuggestModal } from '../../modals/MarkdownFileSuggestModal';
  import {
    createAssociatedMarkdownNote,
    getAssociatedMarkdownLabel,
    openAssociatedMarkdownNote,
    populateAssociatedNoteMenu,
    resolvePreferredAssociatedNoteFolder
  } from '../../services/incremental-reading/IRAssociatedNoteMenu';
  import { resolveAssociatedNotePaths } from '../../services/incremental-reading/IRAssociatedNoteSignals';
  import {
    getPointAssociatedNotePath,
    getVisibleAssociatedNotePath,
    hasPointAssociatedNote,
    hasVisibleAssociatedNote
  } from '../../services/incremental-reading/IRAssociatedNoteVisibility';
  import type { BatchImportResult } from '../../services/incremental-reading/ReadingMaterialManager';
  import { getChunkTopicIds, getTaskTopicId } from '../../utils/ir-topic-compat';
  import { logger } from '../../utils/logger';
  import { tr } from '../../utils/i18n';
  import { showDeleteConfirm, showObsidianInput } from '../../utils/obsidian-confirm';
  import { VIEW_TYPE_EPUB } from '../../views/EpubView';
  import { IRMonitoringService } from '../../services/incremental-reading/IRMonitoringService';
  import type { IRCalendarSidebarSettings } from '../../types/plugin-settings.d';
  import {
    getIRCalendarTimerRuntimeState,
    setIRCalendarTimerRuntimeState,
    type IRCalendarActiveReadingTimerState
  } from '../../stores/ir-calendar-timer-store';

  interface Props {
    plugin: AnkiObsidianPlugin;
  }

  interface IRMaterialFinishedEventDetail {
    blockId?: string;
    reason?: 'completed' | 'skipped';
    nextBlockId?: string;
    nextMaterial?: ScheduleItem | null;
    autoStartNextTimer?: boolean;
  }

  const DEFAULT_CALENDAR_SIDEBAR_SETTINGS: Required<IRCalendarSidebarSettings> = {
    continuousReadingEnabled: false,
    autoStartNextTimerEnabled: false,
    showSchedulingPreview: false,
    showMaterialTimers: true
  };

  function closeBlockInfoModal() {
    try {
      if (blockInfoModalInstance) {
        unmount(blockInfoModalInstance);
      }
    } catch {
    }
    blockInfoModalInstance = null;

    try {
      blockInfoModalContainer?.remove();
    } catch {
    }
    blockInfoModalContainer = null;
  }

  function closeReminderModal() {
    try {
      if (reminderModalInstance) {
        unmount(reminderModalInstance);
      }
    } catch {
    }
    reminderModalInstance = null;

    try {
      reminderModalContainer?.remove();
    } catch {
    }
    reminderModalContainer = null;
  }

  let { plugin }: Props = $props();
  let t = $derived($tr);


  let currentDate = $state(new Date());
  let selectedDate = $state(new Date());
  const today = new Date();
  today.setHours(0, 0, 0, 0);


  let irDecks = $state<IRDeck[]>([]);
  let allBlocks = $state<IRBlock[]>([]);
  let isLoading = $state(true);

  let readingMaterials = $state<ReadingMaterial[]>([]);


  let materialsByDate = $state<Map<string, ScheduleItem[]>>(new Map());
  let pinnedByDate = $state<Map<string, ScheduleItem[]>>(new Map());
  let processedChunkIds = $state(new Set<string>());
  let calendarProgressByDate = $state<Record<string, string[]>>({});
  let irStorage = $state<IRStorageService | null>(null);
  let chunkScheduleAdapter = $state<IRChunkScheduleAdapter | null>(null);
  let pdfBookmarkTaskService = $state<IRPdfBookmarkTaskService | null>(null);
  let epubBookmarkTaskService = $state<IREpubBookmarkTaskService | null>(null);
  let epubStorageService = $state<EpubStorageService | null>(null);
  let pointTagService = $state<IRPointTagService | null>(null);
  let readingPointTagsById = $state<Record<string, string[]>>({});
  let activeReadingTagFilter = $state('');
  let scheduleKernel = $state<IRScheduleKernel | null>(null);
  let monitoringService = $state<IRMonitoringService | null>(null);
  let v4SchedulerService = $state<IRV4SchedulerService | null>(null);

  let schedulingMenuAnchor = $state<HTMLElement | null>(null);
  let schedulingMenuOpen = $state(false);
  let schedulingMenuTarget = $state<ScheduleItem | null>(null);
  let schedulingMenuDateKey = $state<string>('');

  let priorityMenuAnchor = $state<HTMLElement | null>(null);
  let priorityMenuOpen = $state(false);
  let priorityMenuTarget = $state<ScheduleItem | null>(null);
  let prioritySliderExpanded = $state(true);
  type ImpactedPreviewItem = PreviewDetails['impactedItems'][number];
  type PreviewDayDelta = PreviewDetails['dayDeltas'][number];
  let priorityPreviewDetails = $state<PreviewDetails | null>(null);
  let schedulingPreviewByAction = $state<Record<SchedulingAction, PreviewDetails | null>>({
    intensive: null,
    normal: null,
    slow: null,
    postpone: null
  });
  let schedulingPreviewFocusAction = $state<SchedulingAction>('normal');

  let blockInfoModalContainer: HTMLElement | null = null;
  let blockInfoModalInstance: any | null = null;

  let reminderModalContainer: HTMLElement | null = null;
  let reminderModalInstance: any | null = null;

  let suppressClickOnce = $state(false);

  let longPressTimerId = $state<number | null>(null);
  let longPressStartX = $state(0);
  let longPressStartY = $state(0);
  let longPressTriggered = $state(false);


  let importModalInstance: MaterialImportModalObsidian | null = null;
  let analyticsModalInstance: IRAnalyticsModalObsidian | null = null;


  let showAddReadingPointModal = $state(false);
  let arpDeckId = $state('');
  let arpPdfPath = $state('');
  let arpParentTitle = $state('');


  let continuousReadingEnabled = $state(false);

  let autoStartNextTimerEnabled = $state(false);

  let showSchedulingPreview = $state(false);
  let expandedMaterialIds = $state(new Set<string>());
  let siblingCache = $state(new Map<string, ScheduleItem[]>());
  let loadingSiblings = $state(new Set<string>());
  type ActiveReadingTimerState = IRCalendarActiveReadingTimerState;
  type TimerPauseReason = 'manual' | 'switch' | 'completed' | 'skipped';
  let activeReadingTimer = $state<ActiveReadingTimerState | null>(null);
  let timerTotalsByBlockId = $state<Record<string, number>>({});
  let timerNowMs = $state(Date.now());
  let timerTickIntervalId = $state<number | null>(null);
  let timerBusyBlockId = $state<string | null>(null);
  let autoTimerChainBlockId = $state<string | null>(null);
  let loadDataRequestId = 0;
  let loadDataInFlight: Promise<void> | null = null;
  let loadDataQueued = false;
  let loadDataQueuedForceRecompute = false;
  let lastAppliedScheduleGeneratedAt = 0;
  let pendingLocalRefreshGeneratedAt = 0;
  let lastLocallyHandledBroadcastGeneratedAt = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function getWorkspaceSnapshotService() {
    return getSharedIRWorkspaceSnapshotService(plugin.app);
  }

  async function getWorkspaceChunkById(chunkId: string): Promise<any | null> {
    const normalizedId = String(chunkId || '').trim();
    if (!normalizedId) return null;

    const snapshotChunk = (await getWorkspaceSnapshotService().getWorkspaceData()).chunksRecord[normalizedId];
    if (snapshotChunk) {
      return snapshotChunk;
    }

    const storage = await getStorage();
    return await storage.getChunkData(normalizedId);
  }

  async function getWorkspaceLegacyBlockById(blockId: string): Promise<IRBlock | null> {
    const normalizedId = String(blockId || '').trim();
    if (!normalizedId) return null;

    const snapshotBlock = (await getWorkspaceSnapshotService().getWorkspaceData()).blocksRecord[normalizedId];
    if (snapshotBlock) {
      return snapshotBlock;
    }

    const storage = await getStorage();
    const blocks = await storage.getAllBlocks();
    return blocks[normalizedId] || null;
  }

  async function getWorkspacePdfTaskById(taskId: string): Promise<any | null> {
    const normalizedId = String(taskId || '').trim();
    if (!normalizedId) return null;

    const snapshot = await getWorkspaceSnapshotService().getWorkspaceData();
    const task = snapshot.pdfTasks.find((entry: any) => String(entry?.id || '').trim() === normalizedId);
    if (task) {
      return task;
    }

    const pdfService = await getPdfBookmarkTaskService();
    return await pdfService.getTask(normalizedId);
  }

  async function getWorkspaceEpubTaskById(taskId: string): Promise<any | null> {
    const normalizedId = String(taskId || '').trim();
    if (!normalizedId) return null;

    const snapshot = await getWorkspaceSnapshotService().getWorkspaceData();
    const task = snapshot.epubTasks.find((entry: any) => String(entry?.id || '').trim() === normalizedId);
    if (task) {
      return task;
    }

    const epubService = await getEpubBookmarkTaskService();
    return await epubService.getTask(normalizedId);
  }

  function syncTimerRuntimeState(): void {
    setIRCalendarTimerRuntimeState({
      activeReadingTimer: activeReadingTimer ? { ...activeReadingTimer } : null,
      autoTimerChainBlockId
    });
  }

  function restoreTimerRuntimeState(): void {
    const runtimeState = getIRCalendarTimerRuntimeState();
    activeReadingTimer = runtimeState.activeReadingTimer
      ? { ...runtimeState.activeReadingTimer }
      : null;
    autoTimerChainBlockId = runtimeState.autoTimerChainBlockId;
    timerNowMs = Date.now();

    if (activeReadingTimer) {
      ensureTimerTicker();
    } else {
      clearTimerTicker();
    }
  }

  function clearAutoTimerChain(): void {
    autoTimerChainBlockId = null;
    syncTimerRuntimeState();
  }

  function armAutoTimerChain(blockId: string): void {
    autoTimerChainBlockId = blockId;
    syncTimerRuntimeState();
  }

  function shouldContinueAutoTimerChainForBlock(blockId: string): boolean {
    return autoTimerChainBlockId === blockId || activeReadingTimer?.blockId === blockId;
  }

  function shouldAutoStartNextTimerAfterScheduling(blockId: string): boolean {
    if (!autoStartNextTimerEnabled) return false;


    if (!activeReadingTimer) return true;
    return activeReadingTimer.blockId === blockId;
  }

  function waitForMs(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function startReadingTimerWithRetry(
    material: ScheduleItem,
    options: { announceStart?: boolean; retries?: number } = {}
  ): Promise<boolean> {
    const retries = options.retries ?? 3;
    const delays = [0, 120, 280, 500];

    for (let attempt = 0; attempt < retries; attempt++) {
      const delay = delays[Math.min(attempt, delays.length - 1)] ?? 0;
      if (delay > 0) {
        await waitForMs(delay);
      }

      if (activeReadingTimer?.blockId === material.id) {
        return true;
      }

      if (timerBusyBlockId) {
        continue;
      }

      await toggleReadingTimer(material, { announceStart: options.announceStart });

      if (activeReadingTimer?.blockId === material.id) {
        return true;
      }
    }

    logger.warn('[IRCalendarSidebar] Failed to start reading timer after retries', {
      blockId: material.id,
      autoTimerChainBlockId,
      activeReadingTimerBlockId: activeReadingTimer?.blockId ?? null
    });
    return activeReadingTimer?.blockId === material.id;
  }

  function getCalendarSidebarSettings(): Required<IRCalendarSidebarSettings> {
    const raw = plugin.settings?.incrementalReading?.calendarSidebar;
    return {
      ...DEFAULT_CALENDAR_SIDEBAR_SETTINGS,
      ...(raw || {})
    };
  }

  function applyCalendarSidebarSettingsFromPlugin(): void {
    const settings = getCalendarSidebarSettings();
    continuousReadingEnabled = settings.continuousReadingEnabled;
    autoStartNextTimerEnabled = settings.autoStartNextTimerEnabled;
    showSchedulingPreview = settings.showSchedulingPreview;

    if (!continuousReadingEnabled) {
      expandedMaterialIds = new Set();
    }
  }

  async function saveCalendarSidebarSettings(patch: Partial<IRCalendarSidebarSettings>): Promise<void> {
    if (!plugin.settings.incrementalReading) {
      plugin.settings.incrementalReading = {};
    }

    plugin.settings.incrementalReading.calendarSidebar = {
      ...getCalendarSidebarSettings(),
      ...patch
    };

    await plugin.saveSettings();
  }

  async function setContinuousReadingEnabled(enabled: boolean): Promise<void> {
    continuousReadingEnabled = enabled;
    if (!enabled) {
      expandedMaterialIds = new Set();
    }

    try {
      await saveCalendarSidebarSettings({ continuousReadingEnabled: enabled });
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Failed to save sidebar settings:', error);
      new Notice('Failed to save sidebar settings');
    }
  }

  async function setAutoStartNextTimerEnabled(enabled: boolean): Promise<void> {
    autoStartNextTimerEnabled = enabled;

    try {
      await saveCalendarSidebarSettings({ autoStartNextTimerEnabled: enabled });
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Failed to save auto-start setting:', error);
      new Notice('Failed to save auto-start setting');
    }
  }

  async function setShowSchedulingPreviewEnabled(enabled: boolean): Promise<void> {
    showSchedulingPreview = enabled;

    try {
      await saveCalendarSidebarSettings({ showSchedulingPreview: enabled });
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Failed to save preview setting:', error);
      new Notice('Failed to save preview setting');
    }
  }


  function formatDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getScheduleItemLabel(material: ScheduleItem): string {
    return material.displayName || material.title || 'Untitled';
  }

  function findScheduleItemById(blockId: string): ScheduleItem | null {
    for (const item of selectedMaterials) {
      if (item.id === blockId) return item;
    }

    for (const siblings of siblingCache.values()) {
      const match = siblings.find((item) => item.id === blockId);
      if (match) return match;
    }

    for (const items of pinnedByDate.values()) {
      const match = items.find((item) => item.id === blockId);
      if (match) return match;
    }

    for (const items of materialsByDate.values()) {
      const match = items.find((item) => item.id === blockId);
      if (match) return match;
    }

    return null;
  }

  function getActiveReadingTimerLabel(): string {
    if (!activeReadingTimer) return 'Untitled';
    const currentItem = findScheduleItemById(activeReadingTimer.blockId);
    return currentItem ? getScheduleItemLabel(currentItem) : activeReadingTimer.title;
  }

  function formatTimerDuration(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatCompactTimerDuration(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    if (safeSeconds < 3600) {
      const minutes = Math.floor(safeSeconds / 60);
      const seconds = safeSeconds % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  function ensureTimerTicker(): void {
    if (timerTickIntervalId !== null) return;
    timerTickIntervalId = window.setInterval(() => {
      timerNowMs = Date.now();
    }, 1000);
  }

  function clearTimerTicker(): void {
    if (timerTickIntervalId === null) return;
    window.clearInterval(timerTickIntervalId);
    timerTickIntervalId = null;
  }

  function getDisplayedTimerSeconds(blockId: string): number {
    if (activeReadingTimer?.blockId === blockId) {
      return activeReadingTimer.baseSeconds + Math.max(0, Math.floor((timerNowMs - activeReadingTimer.startedAtMs) / 1000));
    }
    return timerTotalsByBlockId[blockId] ?? 0;
  }

  function isTimerRunningForBlock(blockId: string): boolean {
    return activeReadingTimer?.blockId === blockId;
  }

  function getReadingTimerButtonTitle(blockId: string): string {
    const timerText = formatTimerDuration(getDisplayedTimerSeconds(blockId));
    if (isTimerRunningForBlock(blockId)) {
      return `Pause timer (${timerText})`;
    }
    if (getDisplayedTimerSeconds(blockId) > 0) {
      return `Resume timer (${timerText})`;
    }
    return 'Start timer';
  }

  async function loadTimerTotalsFromHistory(): Promise<void> {
    try {
      const history = (await getWorkspaceSnapshotService().getWorkspaceData()).history;
      const totals: Record<string, number> = {};
      for (const session of history.sessions || []) {
        const blockId = String(session?.blockId || '');
        const duration = Number(session?.duration || 0);
        if (!blockId || duration <= 0) continue;
        totals[blockId] = (totals[blockId] || 0) + duration;
      }
      timerTotalsByBlockId = totals;
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Recovered warning message.', error);
    }
  }

  async function getStoredTimerTotalSeconds(blockId: string): Promise<number> {
    try {
      const storage = await getStorage();
      const sessions = await storage.getBlockSessions(blockId);
      return sessions.reduce((sum, session) => sum + Math.max(0, Number(session.duration || 0)), 0);
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Recovered warning message.', error);
      return timerTotalsByBlockId[blockId] ?? 0;
    }
  }

  async function appendTimerSession(
    blockId: string,
    deckId: string,
    startedAtMs: number,
    durationSeconds: number,
    reason: Exclude<TimerPauseReason, 'manual' | 'switch'>
      | 'manual'
      | 'switch'
  ): Promise<void> {
    if (durationSeconds <= 0) return;

    const storage = await getStorage();
    const endedAtMs = startedAtMs + durationSeconds * 1000;
    const action: IRSession['action'] = reason === 'completed'
      ? 'completed'
      : reason === 'skipped'
        ? 'skipped'
        : 'suspended';

    await storage.addSession({
      id: crypto.randomUUID(),
      blockId,
      deckId,
      startTime: new Date(startedAtMs).toISOString(),
      endTime: new Date(endedAtMs).toISOString(),
      duration: durationSeconds,
      action
    });
  }

  async function pauseActiveReadingTimer(reason: TimerPauseReason = 'manual', onlyBlockId?: string): Promise<boolean> {
    if (!activeReadingTimer) return false;
    if (onlyBlockId && activeReadingTimer.blockId !== onlyBlockId) return false;

    const snapshot = activeReadingTimer;
    const finalSeconds = getDisplayedTimerSeconds(snapshot.blockId);
    const sessionSeconds = Math.max(0, finalSeconds - snapshot.baseSeconds);
    const totalSeconds = snapshot.baseSeconds + sessionSeconds;

    try {
      await appendTimerSession(
        snapshot.blockId,
        snapshot.deckId,
        snapshot.startedAtMs,
        sessionSeconds,
        reason
      );
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Recovered warning message.', error);
      return false;
    }

    timerTotalsByBlockId = {
      ...timerTotalsByBlockId,
      [snapshot.blockId]: totalSeconds
    };
    getWorkspaceSnapshotService().invalidate();
    window.dispatchEvent(new CustomEvent('Weave:ir-timer-updated', {
      detail: {
        blockId: snapshot.blockId,
        totalSeconds,
        reason
      }
    }));
    activeReadingTimer = null;
    clearTimerTicker();
    if (reason === 'manual') {
      autoTimerChainBlockId = null;
    }
    syncTimerRuntimeState();

    if (reason === 'manual') {
      new Notice(snapshot.title ? 'Paused reading timer for ' + snapshot.title : 'Paused reading timer');
    }

    return true;
  }

  async function toggleReadingTimer(
    material: ScheduleItem,
    options: { announceStart?: boolean } = {}
  ): Promise<void> {
    if (timerBusyBlockId) return;

    const announceStart = options.announceStart !== false;
    timerBusyBlockId = material.id;

    try {
      if (activeReadingTimer?.blockId === material.id) {
        await pauseActiveReadingTimer('manual', material.id);
        return;
      }

      if (activeReadingTimer) {
        await pauseActiveReadingTimer('switch');
      }

      const deckId = await resolveDeckIdForScheduleItem(material);
      const baseSeconds = timerTotalsByBlockId[material.id] ?? await getStoredTimerTotalSeconds(material.id);
      const currentItem = findScheduleItemById(material.id) ?? material;

      activeReadingTimer = {
        blockId: material.id,
        deckId,
        title: getScheduleItemLabel(currentItem),
        startedAtMs: Date.now(),
        baseSeconds
      };
      autoTimerChainBlockId = material.id;
      timerNowMs = Date.now();
      ensureTimerTicker();
      syncTimerRuntimeState();
      if (announceStart) {
        new Notice('Started reading timer for ' + getScheduleItemLabel(currentItem));
      }
    } catch (error) {
      logger.error('[IRCalendarSidebar] Failed to toggle reading timer', error);
      new Notice('Failed to toggle reading timer');
    } finally {
      timerBusyBlockId = null;
    }
  }

  async function ensureDoneItemsVisibleForDate(dateKey: string): Promise<void> {
    try {
      const doneIds = calendarProgressByDate[dateKey] || [];
      if (!doneIds.length) return;

      const workspaceData = await getWorkspaceSnapshotService().getWorkspaceData();
      const allChunks = workspaceData.chunksRecord;
      const allLegacyBlocks = workspaceData.blocksRecord;

      const doneItems: ScheduleItem[] = [];
      const unresolvedPdfIds: string[] = [];
      const unresolvedEpubIds: string[] = [];

      for (const id of doneIds) {
        if (isPdfBookmarkTaskId(id)) {
          unresolvedPdfIds.push(id);
          continue;
        }
        if (isEpubBookmarkTaskId(id)) {
          unresolvedEpubIds.push(id);
          continue;
        }

        const chunk = allChunks[id] as any;
        if (chunk) {
          doneItems.push(buildScheduleItemFromChunkData(chunk, id));
          continue;
        }

        const legacyBlock = allLegacyBlocks[id];
        if (legacyBlock) {
          doneItems.push(buildScheduleItemFromLegacyBlock(legacyBlock));
        }
      }

      if (unresolvedPdfIds.length > 0) {
        try {
          const pdfService = await getPdfBookmarkTaskService();
          for (const pid of unresolvedPdfIds) {
            const task = await getWorkspacePdfTaskById(pid);
            if (!task) continue;
            const fullTitle = String(task.title || '').trim() || 'PDF';
            doneItems.push({
              id: pid,
              title: fullTitle,
              displayName: extractPdfHeading(fullTitle),
              sourceFile: task.pdfPath,
              primaryAssociatedNotePath: task.meta?.primaryAssociatedNotePath || task.meta?.associatedNotePath,
              associatedNotePath: task.meta?.associatedNotePath || task.meta?.primaryAssociatedNotePath,
              associatedNotePaths: resolveAssociatedNotePaths({
                associatedNotePath: task.meta?.primaryAssociatedNotePath || task.meta?.associatedNotePath,
                associatedNotePaths: task.meta?.associatedNotePaths
              }),
              associatedNoteScope:
                task.meta?.associatedNotePath || task.meta?.primaryAssociatedNotePath ? 'point' : undefined,
              resumeLink: task.link,
              priority: Number(task.priorityUi ?? task.priorityEff ?? 5),
              intervalDays: Number(task.intervalDays ?? 1),
              scheduleStatus: String(task.status || 'new'),
              nextRepDate: Number(task.nextRepDate || 0),
              nextReviewDate: task.nextRepDate ? new Date(task.nextRepDate) : null,
              sourceType: 'pdf',
            });
          }
        } catch (e) {
          logger.warn('[IRCalendarSidebar] Failed to load PDF reading materials', e);
        }
      }

      if (unresolvedEpubIds.length > 0) {
        try {
          for (const eid of unresolvedEpubIds) {
            const task = await getWorkspaceEpubTaskById(eid);
            if (!task) continue;
            const resolvedFilePath = await resolveEpubTaskFilePath(task);
            doneItems.push({
              id: eid,
              title: String(task.title || '').trim() || 'EPUB',
              sourceFile: resolvedFilePath,
              primaryAssociatedNotePath: task.meta?.primaryAssociatedNotePath || task.meta?.associatedNotePath,
              associatedNotePath: task.meta?.associatedNotePath || task.meta?.primaryAssociatedNotePath,
              associatedNotePaths: resolveAssociatedNotePaths({
                associatedNotePath: task.meta?.primaryAssociatedNotePath || task.meta?.associatedNotePath,
                associatedNotePaths: task.meta?.associatedNotePaths
              }),
              associatedNoteScope:
                task.meta?.associatedNotePath || task.meta?.primaryAssociatedNotePath ? 'point' : undefined,
              priority: Number(task.priorityUi ?? task.priorityEff ?? 5),
              intervalDays: Number(task.intervalDays ?? 1),
              scheduleStatus: String(task.status || 'new'),
              nextRepDate: Number(task.nextRepDate || 0),
              nextReviewDate: task.nextRepDate ? new Date(task.nextRepDate) : null,
              sourceType: 'epub',
            });
          }
        } catch (e) {
          logger.warn('[IRCalendarSidebar] Failed to load EPUB reading materials', e);
        }
      }

      if (!doneItems.length) return;

      const currentPinned = pinnedByDate.get(dateKey) || [];
      const merged = new Map<string, ScheduleItem>();
      for (const item of currentPinned) merged.set(item.id, item);
      for (const item of doneItems) merged.set(item.id, item);

      const nextPinnedByDate = new Map(pinnedByDate);
      nextPinnedByDate.set(dateKey, [...merged.values()]);
      pinnedByDate = nextPinnedByDate;
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
    }
  }

  function getMonthDays(year: number, month: number): Array<{ date: Date; otherMonth: boolean }> {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Array<{ date: Date; otherMonth: boolean }> = [];

    const startDay = (firstDay.getDay() + 6) % 7;
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month, -i), otherMonth: true });
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), otherMonth: false });
    }


    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), otherMonth: true });
    }

    return days;
  }


  function getHeatLevel(date: Date): number {
    const key = formatDateKey(date);
    const materials = materialsByDate.get(key) || [];
    const count = materials.length;
    
    if (count === 0) return 0;
    if (count >= 8) return 5;
    if (count >= 6) return 4;
    if (count >= 4) return 3;
    if (count >= 2) return 2;
    return 1;
  }

  function getHeatDots(date: Date): number[] {
    const level = Math.min(getHeatLevel(date), 3);
    return level > 0 ? Array.from({ length: level }, (_, index) => index) : [];
  }

  type CalendarDayVisualState = {
    key: string;
    totalCount: number;
    completedCount: number;
    pendingCount: number;
    completionRatio: number;
    hasTasks: boolean;
    isFullyCompleted: boolean;
    isPartiallyCompleted: boolean;
    isTodayPending: boolean;
    isOverduePending: boolean;
  };

  function getCalendarDayVisualState(date: Date): CalendarDayVisualState {
    const key = formatDateKey(date);
    const scheduledItems = materialsByDate.get(key) || [];
    const scheduledIds = new Set(scheduledItems.map((item) => item.id));
    const completedIds = Array.isArray(calendarProgressByDate[key])
      ? calendarProgressByDate[key].filter((id, index, source) => source.indexOf(id) === index)
      : [];
    const totalCount = scheduledIds.size + completedIds.filter((id) => !scheduledIds.has(id)).length;
    const completedCount = Math.min(completedIds.length, totalCount);
    const pendingCount = Math.max(0, totalCount - completedCount);
    const completionRatio = totalCount > 0 ? completedCount / totalCount : 0;
    const hasTasks = totalCount > 0;
    const isFullyCompleted = hasTasks && pendingCount === 0;
    const isPartiallyCompleted = completedCount > 0 && pendingCount > 0;
    const isTodayPending = isSameDay(date, today) && pendingCount > 0;
    const isOverduePending = !isSameDay(date, today) && date.getTime() < today.getTime() && pendingCount > 0;

    return {
      key,
      totalCount,
      completedCount,
      pendingCount,
      completionRatio,
      hasTasks,
      isFullyCompleted,
      isPartiallyCompleted,
      isTodayPending,
      isOverduePending,
    };
  }

  function getCalendarDayCellTitle(dayState: CalendarDayVisualState): string {
    if (!dayState.hasTasks) return '';
    return `${dayState.totalCount} tasks, ${dayState.completedCount} completed, ${dayState.pendingCount} pending`;
  }

  function getMaterialExpandButtonLabel(isExpanded: boolean): string {
    return isExpanded ? 'Collapse related materials' : 'Expand related materials';
  }

  function getMaterialTagLabels(materialId: string): string[] {
    return readingPointTagsById[materialId] || [];
  }

  // ?????????
  function getSelectedMaterialsBase(): ScheduleItem[] {
    const key = formatDateKey(selectedDate);
    const materials = materialsByDate.get(key) || [];
    const pinned = pinnedByDate.get(key) || [];
    const merged = new Map<string, ScheduleItem>();
    for (const m of materials) merged.set(m.id, m);
    for (const p of pinned) {
      if (!merged.has(p.id)) merged.set(p.id, p);
    }
    return [...merged.values()].sort((a, b) => {
      const scoreDiff = (b.explanation?.compositeScore ?? 0) - (a.explanation?.compositeScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (b.priority || 0) - (a.priority || 0);
    });
  }

  function getSelectedDateTagOptions(): Array<{ label: string; count: number }> {
    const counts = new Map<string, { label: string; count: number }>();
    for (const material of getSelectedMaterialsBase()) {
      for (const tag of getMaterialTagLabels(material.id)) {
        const key = tag.toLowerCase();
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { label: tag, count: 1 });
        }
      }
    }
    return Array.from(counts.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, 'zh-CN');
    });
  }

  function getSelectedMaterials(): ScheduleItem[] {
    const materials = getSelectedMaterialsBase();
    const normalizedFilter = activeReadingTagFilter.trim().toLowerCase();
    if (!normalizedFilter) return materials;
    return materials.filter((material) =>
      getMaterialTagLabels(material.id).some((tag) => tag.toLowerCase() === normalizedFilter)
    );
  }


  function prevMonth() {
    closeSchedulingMenu();
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  }

  function nextMonth() {
    closeSchedulingMenu();
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  }

  function goToToday() {
    closeSchedulingMenu();
    currentDate = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedDate = new Date(today);
    const key = formatDateKey(selectedDate);
    const done = calendarProgressByDate[key] || [];
    processedChunkIds = new Set(done);
    void ensureDoneItemsVisibleForDate(key);
  }


  function selectDay(date: Date) {
    closeSchedulingMenu();
    selectedDate = new Date(date);
    const key = formatDateKey(selectedDate);
    const done = calendarProgressByDate[key] || [];
    processedChunkIds = new Set(done);
    void ensureDoneItemsVisibleForDate(key);
  }


  function isSameDay(d1: Date, d2: Date): boolean {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }


  function openImportModal(): void {
    if (importModalInstance) {
      importModalInstance.close();
      importModalInstance = null;
    }

    importModalInstance = new MaterialImportModalObsidian(plugin.app, {
      plugin,
      onImportComplete: handleImportComplete,
      onClose: () => {
        importModalInstance = null;
      }
    });
    importModalInstance.open();
  }
  

  function handleImportComplete(result: BatchImportResult): void {
    if (result.errors.length > 0) {
      new Notice(`Import finished: ${result.success} created, ${result.skipped} skipped, ${result.errors.length} failed.`);
    } else if (result.skipped > 0) {
      new Notice(`Import finished: ${result.success} created, ${result.skipped} skipped.`);
    } else {
      new Notice(`Import finished: ${result.success} created.`);
    }

    void refreshSidebarData({ includeProgress: false });
  }

  async function getStorage(): Promise<IRStorageService> {
    if (!irStorage) {
      irStorage = new IRStorageService(plugin.app);
    }
    await irStorage.initialize();
    return irStorage;
  }

  async function loadCalendarProgress(): Promise<void> {
    try {
      const storage = await getStorage();
      calendarProgressByDate = await storage.getCalendarProgress();

      const key = formatDateKey(selectedDate);
      const done = calendarProgressByDate[key] || [];
      processedChunkIds = new Set(done);
      await ensureDoneItemsVisibleForDate(key);
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
    }
  }

  async function refreshSidebarData(options: { forceRecompute?: boolean; includeProgress?: boolean } = {}): Promise<void> {
    await loadData({ forceRecompute: options.forceRecompute });
    if (options.includeProgress !== false) {
      await loadCalendarProgress();
    }
  }

  async function recomputeAndRefreshSidebar(
    reason: UpdatedEventDetail['reason'],
    options?: { deckIds?: string[] }
  ): Promise<UpdatedEventDetail> {
    const detail = await recomputeAndBroadcastIRData(plugin.app, reason, options);
    pendingLocalRefreshGeneratedAt = detail.generatedAt;
    try {
      lastLocallyHandledBroadcastGeneratedAt = Math.max(
        lastLocallyHandledBroadcastGeneratedAt,
        detail.generatedAt
      );
      return detail;
    } finally {
      if (pendingLocalRefreshGeneratedAt === detail.generatedAt) {
        pendingLocalRefreshGeneratedAt = 0;
      }
    }
  }

  async function recomputeAndAcknowledgeSidebarBroadcast(
    reason: UpdatedEventDetail['reason'],
    options?: { deckIds?: string[] }
  ): Promise<UpdatedEventDetail> {
    const detail = await recomputeAndBroadcastIRData(plugin.app, reason, options);
    lastLocallyHandledBroadcastGeneratedAt = Math.max(
      lastLocallyHandledBroadcastGeneratedAt,
      detail.generatedAt
    );
    return detail;
  }

  function applyLocalMaterialSourcePathUpdate(
    materialId: string,
    nextPath: string,
    options: { previousPath?: string; nextTitle?: string } = {}
  ): void {
    const normalizedId = String(materialId || '').trim();
    const normalizedNextPath = String(nextPath || '').trim();
    if (!normalizedId || !normalizedNextPath) return;

    const updateItem = (item: ScheduleItem): ScheduleItem => {
      if (item.id !== normalizedId) return item;
      return {
        ...item,
        sourceFile: normalizedNextPath,
        ...(options.nextTitle ? { title: options.nextTitle } : {})
      };
    };

    materialsByDate = new Map(
      Array.from(materialsByDate.entries(), ([dateKey, items]) => [
        dateKey,
        items.map(updateItem)
      ])
    );

    pinnedByDate = new Map(
      Array.from(pinnedByDate.entries(), ([dateKey, items]) => [
        dateKey,
        items.map(updateItem)
      ])
    );

    siblingCache = new Map(
      Array.from(siblingCache.entries(), ([cacheKey, items]) => [
        cacheKey,
        items.map(updateItem)
      ])
    );

    const previousPath = String(options.previousPath || '').trim();
    if (previousPath) {
      readingMaterials = readingMaterials.map((entry) =>
        entry.filePath === previousPath
          ? {
              ...entry,
              filePath: normalizedNextPath,
              title: options.nextTitle || entry.title
            }
          : entry
      );
    }
  }

  async function getChunkScheduleAdapter(): Promise<IRChunkScheduleAdapter> {
    const storage = await getStorage();
    if (!chunkScheduleAdapter) {
      const { resolveIRImportFolder } = await import('../../config/paths');
      const chunkRoot = resolveIRImportFolder(
        plugin.settings?.incrementalReading?.importFolder,
        plugin.settings?.weaveParentFolder
      );
      chunkScheduleAdapter = new IRChunkScheduleAdapter(plugin.app, storage, chunkRoot);
    }
    return chunkScheduleAdapter;
  }

  async function getPdfBookmarkTaskService(): Promise<IRPdfBookmarkTaskService> {
    if (!pdfBookmarkTaskService) {
      pdfBookmarkTaskService = new IRPdfBookmarkTaskService(plugin.app);
    }
    await pdfBookmarkTaskService.initialize();
    return pdfBookmarkTaskService;
  }

  async function getEpubBookmarkTaskService(): Promise<IREpubBookmarkTaskService> {
    if (!epubBookmarkTaskService) {
      epubBookmarkTaskService = new IREpubBookmarkTaskService(plugin.app);
    }
    await epubBookmarkTaskService.initialize();
    return epubBookmarkTaskService;
  }

  function getEpubStorageService(): EpubStorageService {
    if (!epubStorageService) {
      epubStorageService = new EpubStorageService(plugin.app);
    }
    return epubStorageService;
  }

  async function resolveEpubTaskFilePath(task: { sourceId?: string; epubFilePath?: string }): Promise<string> {
    return (
      await getEpubStorageService().resolveSourceFilePath(
        String(task?.sourceId || '').trim() || undefined,
        String(task?.epubFilePath || '').trim() || undefined
      )
    ) || String(task?.epubFilePath || '').trim();
  }

  async function resolveEpubIdentityKey(input: { sourceId?: string; filePath?: string }): Promise<string> {
    const normalizedSourceId = String(input?.sourceId || '').trim();
    if (normalizedSourceId) {
      return normalizedSourceId;
    }
    const normalizedPath = String(input?.filePath || '').trim();
    if (!normalizedPath) {
      return '';
    }
    const sourceEntry = await getEpubStorageService().ensureSourceIdentity(normalizedPath);
    return sourceEntry?.sourceId || normalizedPath;
  }

  async function getPointTagService(): Promise<IRPointTagService> {
    if (!pointTagService) {
      pointTagService = new IRPointTagService(plugin.app);
    }
    await pointTagService.initialize();
    return pointTagService;
  }

  async function getScheduleKernel(): Promise<IRScheduleKernel> {
    if (!scheduleKernel) {
      scheduleKernel = getSharedIRScheduleKernel(plugin.app);
    }
    return scheduleKernel;
  }

  async function getMonitoringService(): Promise<IRMonitoringService> {
    if (!monitoringService) {
      monitoringService = new IRMonitoringService(plugin.app.vault);
      await monitoringService.load();
    }
    return monitoringService;
  }

  async function getV4SchedulerService(): Promise<IRV4SchedulerService> {
    if (!v4SchedulerService) {
      v4SchedulerService = new IRV4SchedulerService(plugin.app);
    }
    await v4SchedulerService.initialize();
    return v4SchedulerService;
  }

  async function resolveScheduleItemToBlockV4(item: ScheduleItem): Promise<IRBlockV4> {
    if (isPdfBookmarkTaskId(item.id)) {
      const pdfService = await getPdfBookmarkTaskService();
      const task = await getWorkspacePdfTaskById(item.id);
      if (task) return pdfService.toBlockV4(task);
    }

    if (isEpubBookmarkTaskId(item.id)) {
      const epubService = await getEpubBookmarkTaskService();
      const task = await getWorkspaceEpubTaskById(item.id);
      if (task) return epubService.toBlockV4(task);
    }

    const chunk = await getWorkspaceChunkById(item.id);
    if (chunk) {
      return {
        id: chunk.chunkId,
        sourcePath: chunk.filePath,
        blockId: chunk.chunkId,
        contentHash: '',
        status: chunk.scheduleStatus || 'new',
        priorityUi: chunk.priorityUi ?? chunk.priorityEff ?? item.priority ?? 5,
        priorityEff: chunk.priorityEff ?? chunk.priorityUi ?? item.priority ?? 5,
        intervalDays: chunk.intervalDays ?? item.intervalDays ?? 1,
        nextRepDate: chunk.nextRepDate ?? item.nextRepDate ?? 0,
        stats: { ...chunk.stats },
        meta: { ...chunk.meta, siblings: { ...(chunk.meta?.siblings || { prev: null, next: null }) } },
        createdAt: chunk.createdAt ?? Date.now(),
        updatedAt: chunk.updatedAt ?? Date.now()
      };
    }

    const legacyBlock = await getWorkspaceLegacyBlockById(item.id);
    if (legacyBlock) {
      return migrateToIRBlockV4(legacyBlock);
    }

    const fallback = createDefaultIRBlockV4(item.id, item.sourceFile, item.id);
    fallback.priorityUi = item.priority ?? 5;
    fallback.priorityEff = item.priority ?? 5;
    fallback.intervalDays = item.intervalDays ?? 1;
    fallback.nextRepDate = item.nextRepDate ?? 0;
    fallback.status = (item.scheduleStatus as any) || 'queued';
    return fallback;
  }

  async function resolveDeckIdForScheduleItem(item: ScheduleItem): Promise<string> {
    if (item.deckId) return resolveCanonicalDeckId(item.deckId);

    if (isPdfBookmarkTaskId(item.id)) {
      const task = await getWorkspacePdfTaskById(item.id);
      return resolveCanonicalDeckId(getTaskTopicId(task) || '') || irDecks[0]?.id || '';
    }

    if (isEpubBookmarkTaskId(item.id)) {
      const task = await getWorkspaceEpubTaskById(item.id);
      return resolveCanonicalDeckId(getTaskTopicId(task) || '') || irDecks[0]?.id || '';
    }

    const chunk = await getWorkspaceChunkById(item.id);
    if (chunk) {
      return resolveCanonicalDeckId(getChunkTopicIds(chunk)[0] || '') || irDecks[0]?.id || '';
    }

    const legacyBlock = await getWorkspaceLegacyBlockById(item.id);
    if (legacyBlock) {
      const matchingDeck = irDecks.find((deck) =>
        (deck.blockIds || []).includes(legacyBlock.id) ||
        String((deck as any)?.path || '').trim() === String((legacyBlock as any)?.deckPath || '').trim()
      );
      return (
        resolveCanonicalDeckId(matchingDeck?.id || String((legacyBlock as any)?.deckPath || '').trim()) ||
        irDecks[0]?.id ||
        ''
      );
    }

    return irDecks[0]?.id || '';
  }

  function resolveCanonicalDeckId(deckIdentifier: string): string {
    const normalized = String(deckIdentifier || '').trim();
    if (!normalized) {
      return '';
    }

    const matchedDeck = irDecks.find(
      (deck) => deck.id === normalized || String((deck as any)?.path || '').trim() === normalized
    );
    return matchedDeck?.id || normalized;
  }

  function getNextUnprocessedMaterial(currentId: string): ScheduleItem | null {
    const list = selectedMaterials;
    if (!list || list.length === 0) return null;

    const startIndex = Math.max(0, list.findIndex(m => m.id === currentId));

    for (let i = startIndex + 1; i < list.length; i++) {
      const m = list[i];
      if (!processedChunkIds.has(m.id)) return m;
    }

    for (let i = 0; i < startIndex; i++) {
      const m = list[i];
      if (!processedChunkIds.has(m.id)) return m;
    }

    return null;
  }


  async function tryResolveRenamedChunkSource(
    material: ScheduleItem,
    originalPath?: string
  ): Promise<string | null> {
    if (
      !material.id ||
      material.sourceType === 'legacy-block' ||
      isPdfBookmarkTaskId(material.id) ||
      isEpubBookmarkTaskId(material.id)
    ) {
      return null;
    }

    try {
      const storage = await getStorage();
      const chunk = await getWorkspaceChunkById(material.id);
      const chunkFilePath = String((chunk as any)?.filePath || '').trim();

      if (chunkFilePath) {
        const existingChunkFile = plugin.app.vault.getAbstractFileByPath(chunkFilePath);
        if (existingChunkFile instanceof TFile) {
          return existingChunkFile.path;
        }
      }

      const matched = plugin.app.vault.getMarkdownFiles().find((candidate) => {
        const cache = plugin.app.metadataCache.getFileCache(candidate);
        const fm = cache?.frontmatter as any;
        const chunkId = String(fm?.chunk_id || '').trim();
        return chunkId === material.id;
      });

      if (!matched) {
        return null;
      }

      if (chunk && (chunk as any).filePath !== matched.path) {
        (chunk as any).filePath = matched.path;
        (chunk as any).updatedAt = Date.now();
        await storage.saveChunkData(chunk);
      }

      applyLocalMaterialSourcePathUpdate(material.id, matched.path, {
        previousPath: originalPath,
        nextTitle: matched.basename
      });
      await recomputeAndAcknowledgeSidebarBroadcast('metadata_renamed');
      return matched.path;
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Recovered warning message.', error);
      return null;
    }
  }

  async function openMaterial(material: ScheduleItem) {
    try {

      const filePath = material.sourceFile;

      if (!filePath) {
        const recoveredPath = await tryResolveRenamedChunkSource(material);
        if (recoveredPath) {
          const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
          await plugin.app.workspace.openLinkText(recoveredPath, contextPath, false);
          return;
        }

        logger.warn('[IRCalendarSidebar] Failed to open associated note.', material);
        new Notice('Failed to open associated note');
        return;
      }
      
      if (!filePath) {
        logger.warn('[IRCalendarSidebar] Recovered warning message.', material);

        const event = new CustomEvent('Weave:ir-open-block', { 
          detail: { blockId: material.id } 
        });
        window.dispatchEvent(event);
        return;
      }

      // EPUB: reuse existing tab or open new, then navigate
      if (isEpubBookmarkTaskId(material.id)) {
        try {
          const task = await getWorkspaceEpubTaskById(material.id);
          if (task) {
            const resolvedFilePath = await resolveEpubTaskFilePath(task);
            const navDetail: any = { filePath: resolvedFilePath };
            if (task.resumeCfi) {
              navDetail.cfi = task.resumeCfi;
            } else if (task.tocHref) {
              navDetail.href = task.tocHref;
            }

            const existingLeaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_EPUB)
              .find(leaf => {
                try {
                  const state = (leaf.view as any)?.getState?.();
                  return state?.filePath === resolvedFilePath || state?.file === resolvedFilePath;
                } catch { return false; }
              });

            if (existingLeaf) {
              plugin.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
              window.dispatchEvent(new CustomEvent('Weave:epub-navigate', { detail: navDetail }));
            } else {
              (window as any).__weaveEpubPendingNav = navDetail;
              if (typeof plugin.openEpubReader === 'function') {
                await plugin.openEpubReader(resolvedFilePath);
              } else {
                const ctxPath = plugin.app.workspace.getActiveFile()?.path ?? '';
                await plugin.app.workspace.openLinkText(resolvedFilePath, ctxPath, false);
              }
            }
          }
        } catch (e) {
          logger.warn('[IRCalendarSidebar] Recovered warning message.', e);
        }
        return;
      }


      const file = plugin.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        logger.warn('[IRCalendarSidebar] Recovered warning message.', filePath);

        const recoveredPath = await tryResolveRenamedChunkSource(material, filePath);
        if (recoveredPath) {
          const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
          await plugin.app.workspace.openLinkText(recoveredPath, contextPath, false);
          return;
        }

        new Notice('Failed to open related file');
        return;
      }
      if (file instanceof TFile) {
        const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
        const rm = readingMaterials.find(m => m.filePath === filePath);
        let rawLink = (material.resumeLink && material.resumeLink.trim().length > 0)
          ? material.resumeLink
          : ((rm?.resumeLink && rm.resumeLink.trim().length > 0) ? rm.resumeLink : filePath);

        const linkToOpen = rawLink.trim().replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0];
        await plugin.app.workspace.openLinkText(linkToOpen, contextPath, false);
        logger.debug('[IRCalendarSidebar] Recovered debug message.', linkToOpen);
      } else {
        logger.warn('[IRCalendarSidebar] Recovered warning message.', filePath);


        try {
          const candidates = plugin.app.vault.getMarkdownFiles();
          const matched = candidates.find(f => {
            const cache = plugin.app.metadataCache.getFileCache(f);
            const fm = cache?.frontmatter as any;
            if (!fm) return false;
            const chunkId = String(fm.chunk_id || '').trim();
            if (!chunkId) return false;
            return chunkId === material.id;
          });

          if (matched) {
            const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
            await plugin.app.workspace.openLinkText(matched.path, contextPath, false);

            const storage = await getStorage();
            const chunk = await getWorkspaceChunkById(material.id);
            if (chunk && (chunk as any).filePath !== matched.path) {
              (chunk as any).filePath = matched.path;
              (chunk as any).updatedAt = Date.now();
              await storage.saveChunkData(chunk);
              applyLocalMaterialSourcePathUpdate(material.id, matched.path, {
                previousPath: filePath,
                nextTitle: matched.basename
              });
              await recomputeAndAcknowledgeSidebarBroadcast('ui_refresh');
            }

            return;
          }
        } catch (e) {
          logger.warn('[IRCalendarSidebar] Recovered warning message.', e);
        }


        const event = new CustomEvent('Weave:ir-open-block', { 
          detail: { blockId: material.id } 
        });
        window.dispatchEvent(event);
      }
    } catch (error) {
      logger.error('[IRCalendarSidebar] Failed to open block.', error);
      new Notice('Failed to open block');
      return;

      const event = new CustomEvent('Weave:ir-open-block', { 
        detail: { blockId: material.id } 
      });
      window.dispatchEvent(event);
    }
  }


  function extractPdfHeading(fullTitle: string): string {
    const sep = ' / ';
    const idx = fullTitle.lastIndexOf(sep);
    if (idx >= 0) {
      return fullTitle.substring(idx + sep.length);
    }
    return fullTitle;
  }


  type ScheduleItemSourceType = IRProjectedScheduleItem['sourceType'];

  interface ScheduleItem {
    id: string;
    title: string;
    displayName?: string;
    sourceFile: string;
    primaryAssociatedNotePath?: string;
    associatedNotePath?: string;
    associatedNotePaths?: string[];
    associatedNoteScope?: 'point' | 'material';
    deckId?: string;
    priority: number;
    intervalDays: number;
    scheduleStatus: string;
    nextRepDate: number;
    nextReviewDate: Date | null;
    resumeLink?: string;
    sourceType?: ScheduleItemSourceType;
    explanation?: IRScheduleExplanation;
  }

  function getLegacyBlockDisplayName(block: IRBlock): string | undefined {
    const displayName = Array.isArray(block.headingPath) && block.headingPath.length > 0
      ? String(block.headingPath[block.headingPath.length - 1] || '').trim()
      : '';
    return displayName || undefined;
  }

  function getLegacyBlockAssociatedNoteFields(block: IRBlock): Pick<
    ScheduleItem,
    'primaryAssociatedNotePath' | 'associatedNotePath' | 'associatedNotePaths' | 'associatedNoteScope'
  > {
    const associatedNotePaths = resolveAssociatedNotePaths({
      associatedNotePath:
        (block as any).primaryAssociatedNotePath ||
        (block as any).associatedNotePath ||
        (block as any).meta?.associatedNotePath,
      associatedNotePaths:
        (block as any).associatedNotePaths ||
        (block as any).meta?.associatedNotePaths
    });
    const primaryAssociatedNotePath = associatedNotePaths[0] || undefined;
    return {
      primaryAssociatedNotePath,
      associatedNotePath: primaryAssociatedNotePath,
      associatedNotePaths,
      associatedNoteScope: primaryAssociatedNotePath ? 'point' : undefined
    };
  }

  function buildScheduleItemFromLegacyBlock(block: IRBlock): ScheduleItem {
    const migrated = migrateToIRBlockV4(block);
    const displayName = getLegacyBlockDisplayName(block);
    const title =
      displayName ||
      String((block as any).headingText || '').trim() ||
      String(block.contentPreview || '').trim().replace(/\s+/g, ' ').slice(0, 60) ||
      String(block.id || '').trim() ||
      'Untitled';

    return {
      id: block.id,
      title,
      displayName,
      sourceFile: String(block.filePath || '').trim(),
      ...getLegacyBlockAssociatedNoteFields(block),
      priority: Number((block as any).priorityUi ?? (block as any).priorityEff ?? 5),
      intervalDays: Number(block.interval || migrated.intervalDays || 1),
      scheduleStatus: String(block.state || migrated.status || 'new'),
      nextRepDate: Number(migrated.nextRepDate || 0),
      nextReviewDate: migrated.nextRepDate ? new Date(migrated.nextRepDate) : null,
      sourceType: 'legacy-block'
    };
  }

  function buildScheduleItemFromChunkData(chunk: any, fallbackId?: string): ScheduleItem {
    const filePath = String(chunk?.filePath || '').trim();
    const base = filePath?.split('/').pop() || fallbackId || String(chunk?.chunkId || '').trim();
    const title = base.replace(/\.md$/i, '').replace(/^\d+_/, '');
    const associatedNotePaths = resolveAssociatedNotePaths({
      associatedNotePath: chunk?.meta?.primaryAssociatedNotePath || chunk?.meta?.associatedNotePath,
      associatedNotePaths: chunk?.meta?.associatedNotePaths
    });
    const primaryAssociatedNotePath = associatedNotePaths[0] || undefined;
    const nextRepDate = Number(chunk?.nextRepDate || 0);

    return {
      id: String(chunk?.chunkId || fallbackId || '').trim(),
      title,
      sourceFile: filePath,
      primaryAssociatedNotePath,
      associatedNotePath: primaryAssociatedNotePath,
      associatedNotePaths,
      associatedNoteScope: primaryAssociatedNotePath ? 'point' : undefined,
      priority: Number(chunk?.priorityUi ?? chunk?.priorityEff ?? 5),
      intervalDays: Number(chunk?.intervalDays ?? 1),
      scheduleStatus: String(chunk?.scheduleStatus || 'new'),
      nextRepDate,
      nextReviewDate: nextRepDate > 0 ? new Date(nextRepDate) : null,
      sourceType: 'chunk'
    };
  }


  function getIRScheduleParams(): { mBase: number; maxInterval: number; halfLifeDays: number; enableTagGroup: boolean } {
    const ir = plugin.settings?.incrementalReading;
    return {
      mBase: ir?.defaultIntervalFactor ?? 1.5,
      maxInterval: ir?.maxInterval ?? 365,
      halfLifeDays: ir?.priorityHalfLifeDays ?? 7,
      enableTagGroup: ir?.enableTagGroupPrior !== false
    };
  }

  function normalizeVaultPath(path?: string | null): string {
    return path ? normalizePath(path) : '';
  }

  function formatAssociatedNoteLabel(notePath?: string | null): string {
    const normalized = normalizeVaultPath(notePath);
    if (!normalized) return t('irSidebar.associatedNote.untitled');

    const filename = normalized.split('/').pop() || normalized;
    return filename.replace(/\.md$/i, '') || normalized;
  }

  function getAssociatedNoteActionLabel(material: ScheduleItem): string {
    const noteLabel = formatAssociatedNoteLabel(getVisibleAssociatedNotePath(material));
    return t('irSidebar.associatedNote.actionOpen', { name: noteLabel });
  }

  function getAssociatedNoteActionTooltip(material: ScheduleItem): string {
    const noteLabel = formatAssociatedNoteLabel(getVisibleAssociatedNotePath(material));
    return t('irSidebar.associatedNote.tooltipOpen', { name: noteLabel });
  }

  function withPointAssociatedNote(material: ScheduleItem, notePath: string | null): ScheduleItem {
    return withPointAssociatedNotes(material, notePath ? [notePath] : []);
  }

  function getAssociatedNotePathsForMaterial(material: ScheduleItem): string[] {
    return resolveAssociatedNotePaths({
      associatedNotePath: material.primaryAssociatedNotePath || material.associatedNotePath,
      associatedNotePaths: material.associatedNotePaths
    });
  }

  function withPointAssociatedNotes(material: ScheduleItem, notePaths: string[]): ScheduleItem {
    const normalizedNotePaths = resolveAssociatedNotePaths({
      associatedNotePaths: notePaths
    });
    const normalizedNotePath = normalizedNotePaths[0] || '';
    return {
      ...material,
      primaryAssociatedNotePath: normalizedNotePath || undefined,
      associatedNotePath: normalizedNotePath || undefined,
      associatedNotePaths: normalizedNotePaths,
      associatedNoteScope: normalizedNotePath ? 'point' : undefined
    };
  }

  function patchAssociatedNoteInItems(items: ScheduleItem[], blockId: string, notePaths: string[]): ScheduleItem[] {
    let changed = false;
    const nextItems = items.map((item) => {
      if (item.id !== blockId) return item;
      changed = true;
      return withPointAssociatedNotes(item, notePaths);
    });
    return changed ? nextItems : items;
  }

  function patchAssociatedNoteInMap(
    source: Map<string, ScheduleItem[]>,
    blockId: string,
    notePaths: string[]
  ): Map<string, ScheduleItem[]> {
    let changed = false;
    const next = new Map<string, ScheduleItem[]>();

    for (const [key, items] of source.entries()) {
      const patchedItems = patchAssociatedNoteInItems(items, blockId, notePaths);
      if (patchedItems !== items) {
        changed = true;
      }
      next.set(key, patchedItems);
    }

    return changed ? next : source;
  }

  function applyLocalAssociatedNoteUpdate(blockId: string, notePaths: string[]): void {
    materialsByDate = patchAssociatedNoteInMap(materialsByDate, blockId, notePaths);
    pinnedByDate = patchAssociatedNoteInMap(pinnedByDate, blockId, notePaths);
    siblingCache = patchAssociatedNoteInMap(siblingCache, blockId, notePaths);

    if (schedulingMenuTarget?.id === blockId) {
      schedulingMenuTarget = withPointAssociatedNotes(schedulingMenuTarget, notePaths);
    }

    if (priorityMenuTarget?.id === blockId) {
      priorityMenuTarget = withPointAssociatedNotes(priorityMenuTarget, notePaths);
    }
  }

  async function persistPointAssociatedNotePaths(material: ScheduleItem, notePaths: string[]): Promise<boolean> {
    const normalizedNotePaths = resolveAssociatedNotePaths({
      associatedNotePaths: notePaths
    });
    const normalizedNotePath = normalizedNotePaths[0] || undefined;

    if (isPdfBookmarkTaskId(material.id)) {
      const pdfService = await getPdfBookmarkTaskService();
      const task = await getWorkspacePdfTaskById(material.id);
      if (!task) return false;
      await pdfService.updateTask(material.id, {
        meta: {
          ...task.meta,
          siblings: { ...(task.meta?.siblings || { prev: null, next: null }) },
          primaryAssociatedNotePath: normalizedNotePath,
          associatedNotePath: normalizedNotePath,
          associatedNotePaths: normalizedNotePaths
        }
      });
      return true;
    }

    if (isEpubBookmarkTaskId(material.id)) {
      const epubService = await getEpubBookmarkTaskService();
      const task = await getWorkspaceEpubTaskById(material.id);
      if (!task) return false;
      await epubService.updateTask(material.id, {
        meta: {
          ...task.meta,
          siblings: { ...(task.meta?.siblings || { prev: null, next: null }) },
          primaryAssociatedNotePath: normalizedNotePath,
          associatedNotePath: normalizedNotePath,
          associatedNotePaths: normalizedNotePaths
        }
      });
      return true;
    }

    const storage = await getStorage();
    const chunk = await getWorkspaceChunkById(material.id);
    if (chunk) {
      await storage.saveChunkData({
        ...chunk,
        meta: {
          ...chunk.meta,
          siblings: { ...(chunk.meta?.siblings || { prev: null, next: null }) },
          primaryAssociatedNotePath: normalizedNotePath,
          associatedNotePath: normalizedNotePath,
          associatedNotePaths: normalizedNotePaths
        }
      });
      return true;
    }

    const legacyBlock = await getWorkspaceLegacyBlockById(material.id);
    if (!legacyBlock) return false;

    const updatedLegacyBlock: IRBlock = {
      ...legacyBlock,
      updatedAt: new Date().toISOString()
    };
    (updatedLegacyBlock as any).primaryAssociatedNotePath = normalizedNotePath;
    (updatedLegacyBlock as any).associatedNotePath = normalizedNotePath;
    (updatedLegacyBlock as any).associatedNotePaths = normalizedNotePaths;
    if ((updatedLegacyBlock as any).meta && typeof (updatedLegacyBlock as any).meta === 'object') {
      (updatedLegacyBlock as any).meta = {
        ...(updatedLegacyBlock as any).meta,
        primaryAssociatedNotePath: normalizedNotePath,
        associatedNotePath: normalizedNotePath,
        associatedNotePaths: normalizedNotePaths
      };
    }
    await storage.saveBlock(updatedLegacyBlock);
    return true;
  }

  async function setAssociatedNotePathForMaterial(material: ScheduleItem, notePath: string | null): Promise<void> {
    const normalizedNotePath = notePath ? normalizeVaultPath(notePath) : null;
    await setAssociatedNotePathsForMaterial(material, normalizedNotePath ? [normalizedNotePath] : []);
  }

  async function setAssociatedNotePathsForMaterial(material: ScheduleItem, notePaths: string[]): Promise<void> {
    const normalizedNotePaths = resolveAssociatedNotePaths({
      associatedNotePaths: notePaths
    });
    const currentNotePaths = getAssociatedNotePathsForMaterial(material);

    if (
      normalizedNotePaths.length === currentNotePaths.length &&
      normalizedNotePaths.every((path, index) => path === currentNotePaths[index])
    ) {
      if (normalizedNotePaths.length > 0) {
        new Notice(t('irSidebar.associatedNote.alreadyLinkedSame'), 2600);
      }
      return;
    }

    try {
      const saved = await persistPointAssociatedNotePaths(material, normalizedNotePaths);

      if (!saved) {
        new Notice(t('irSidebar.associatedNote.recordNotFound'), 3200);
        return;
      }

      applyLocalAssociatedNoteUpdate(material.id, normalizedNotePaths);
      new Notice(
        normalizedNotePaths[0]
          ? t('irSidebar.associatedNote.linked', { name: formatAssociatedNoteLabel(normalizedNotePaths[0]) })
          : t('irSidebar.associatedNote.unlinked'),
        2800
      );
      await recomputeAndRefreshSidebar('ui_refresh');
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.associatedNote.setFailed'), 3200);
    }
  }

  async function chooseAssociatedNoteForMaterial(material: ScheduleItem): Promise<void> {
    const picker = new MarkdownFileSuggestModal(plugin.app, {
      placeholder: t('irSidebar.associatedNote.pickerPlaceholder')
    });

    const file = await picker.openAndSelect();
    if (!file) return;

    await setAssociatedNotePathForMaterial(material, file.path);
  }

  async function addAssociatedNoteForMaterial(material: ScheduleItem): Promise<void> {
    const existingPaths = new Set(getAssociatedNotePathsForMaterial(material));
    const picker = new MarkdownFileSuggestModal(plugin.app, {
      placeholder: 'Select a Markdown note'
    });

    const file = await picker.openAndSelect();
    if (!file) return;

    const nextPaths = [...existingPaths, file.path];
    await setAssociatedNotePathsForMaterial(material, nextPaths);
  }

  async function setPrimaryAssociatedNoteForMaterial(material: ScheduleItem, notePath: string): Promise<void> {
    const currentPaths = getAssociatedNotePathsForMaterial(material);
    if (currentPaths.length === 0) return;

    const remainingPaths = currentPaths.filter((path) => path !== notePath);
    await setAssociatedNotePathsForMaterial(material, [notePath, ...remainingPaths]);
  }

  async function removeAssociatedNoteForMaterial(material: ScheduleItem, notePath: string): Promise<void> {
    const currentPaths = getAssociatedNotePathsForMaterial(material);
    if (currentPaths.length === 0) return;

    await setAssociatedNotePathsForMaterial(
      material,
      currentPaths.filter((path) => path !== notePath)
    );
  }

  async function openAssociatedNoteByPath(notePath: string): Promise<void> {
    const opened = await openAssociatedMarkdownNote(plugin.app, notePath);
    if (!(opened instanceof TFile)) {
      new Notice(t('irSidebar.associatedNote.missing'), 3200);
    }
  }

  async function openAssociatedNoteInSidebar(material: ScheduleItem): Promise<void> {
    const notePath = getVisibleAssociatedNotePath(material);
    if (!notePath) {
      new Notice(t('irSidebar.associatedNote.notLinked'), 2600);
      return;
    }

    await openAssociatedNoteByPath(notePath);
  }

  function handleAssociatedNoteClick(event: MouseEvent, material: ScheduleItem) {
    event.preventDefault();
    void openAssociatedNoteInSidebar(material);
  }

  async function createAssociatedNoteForMaterial(
    material: ScheduleItem,
    mode: 'replace' | 'append'
  ): Promise<void> {
    const existingPaths = getAssociatedNotePathsForMaterial(material);
    const preferredFolderPath = resolvePreferredAssociatedNoteFolder(plugin.app, {
      notePaths: existingPaths,
      fallbackFilePath: material.sourceFile
    });
    const baseName = material.displayName || material.title || 'Untitled';
    const createdFile = await createAssociatedMarkdownNote(plugin.app, {
      baseName,
      preferredFolderPath
    });

    const nextPaths = mode === 'append' ? [...existingPaths, createdFile.path] : [createdFile.path];
    await setAssociatedNotePathsForMaterial(material, nextPaths);
    await openAssociatedNoteByPath(createdFile.path);
  }

  function buildAssociatedNoteSubmenu(submenu: Menu, material: ScheduleItem) {
    const notePaths = getAssociatedNotePathsForMaterial(material);
    populateAssociatedNoteMenu({
      menu: submenu,
      notePaths,
      getLabel: (notePath) => getAssociatedMarkdownLabel(plugin.app, notePath) || formatAssociatedNoteLabel(notePath),
      onOpen: (notePath) => openAssociatedNoteByPath(notePath),
      onPick: (mode) => (mode === 'append' ? addAssociatedNoteForMaterial(material) : chooseAssociatedNoteForMaterial(material)),
      onCreate: (mode) => createAssociatedNoteForMaterial(material, mode),
      onSetPrimary: (notePath) => setPrimaryAssociatedNoteForMaterial(material, notePath),
      onRemove: (notePath) => removeAssociatedNoteForMaterial(material, notePath),
      onClear: () => setAssociatedNotePathsForMaterial(material, [])
    });
  }


  const schedulingConfig = [
    { action: 'intensive' as const, label: 'Intensive', color: 'var(--weave-error, #ef4444)', intervalMultiplier: 0.5 },
    { action: 'normal' as const, label: 'Normal', color: 'var(--weave-success, #10b981)', intervalMultiplier: 1.0 },
    { action: 'slow' as const, label: 'Slow', color: 'var(--weave-warning, #f59e0b)', intervalMultiplier: 1.8 },
    { action: 'postpone' as const, label: 'Postpone', color: 'var(--text-muted, #6b7280)', intervalMultiplier: 0, isPostpone: true },
  ];

  type SchedulingAction = typeof schedulingConfig[number]['action'];

  function closeSchedulingMenu() {
    schedulingMenuOpen = false;
    schedulingMenuTarget = null;
    schedulingMenuAnchor = null;
    schedulingMenuDateKey = '';
    schedulingPreviewByAction = { intensive: null, normal: null, slow: null, postpone: null };
    schedulingPreviewFocusAction = 'normal';
  }

  function openSchedulingMenu(event: MouseEvent, material: ScheduleItem) {
    event.preventDefault();

    const alreadyOpenForSame = schedulingMenuOpen && schedulingMenuTarget?.id === material.id;
    if (alreadyOpenForSame) {
      closeSchedulingMenu();
      return;
    }

    schedulingMenuTarget = material;
    schedulingMenuAnchor = event.currentTarget as HTMLElement;
    schedulingMenuDateKey = formatDateKey(selectedDate);
    schedulingMenuOpen = true;
    void loadSchedulingPreviews(material);
  }

  function openSchedulingMenuForAnchor(anchor: HTMLElement, material: ScheduleItem) {
    const alreadyOpenForSame = schedulingMenuOpen && schedulingMenuTarget?.id === material.id;
    if (alreadyOpenForSame) {
      closeSchedulingMenu();
      return;
    }

    schedulingMenuTarget = material;
    schedulingMenuAnchor = anchor;
    schedulingMenuDateKey = formatDateKey(selectedDate);
    schedulingMenuOpen = true;
    void loadSchedulingPreviews(material);
  }

  function closePriorityMenu() {
    priorityMenuOpen = false;
    priorityMenuTarget = null;
    priorityMenuAnchor = null;
    priorityPreviewDetails = null;
  }

  function openPriorityMenuForAnchor(anchor: HTMLElement, material: ScheduleItem) {
    const alreadyOpenForSame = priorityMenuOpen && priorityMenuTarget?.id === material.id;
    if (alreadyOpenForSame) {
      closePriorityMenu();
      return;
    }

    priorityMenuTarget = material;
    priorityMenuAnchor = anchor;
    prioritySliderExpanded = true;
    priorityMenuOpen = true;
    priorityPreviewDetails = null;
  }

  function formatReviewDateTextFromTimestamp(timestamp?: number): string {
    if (!timestamp || timestamp <= 0) return 'No review date';
    return new Date(timestamp).toLocaleDateString();
  }

  function buildPreviewDetails(
    futurePlanPreview: any,
    beforeBlock: IRBlockV4 | null,
    afterBlock: IRBlockV4 | null,
    title: string
  ): PreviewDetails | null {
    if (!afterBlock) return null;

    const beforeDateText = formatReviewDateTextFromTimestamp(beforeBlock?.nextRepDate);
    const afterDateText = formatReviewDateTextFromTimestamp(afterBlock.nextRepDate);
    const changeSummary = futurePlanPreview?.changeSummary;
    const impactedItems: ImpactedPreviewItem[] = (changeSummary?.movedItems || [])
      .filter((item: any) => item.itemId !== afterBlock.id)
      .slice(0, 3)
      .map((item: any) => ({
        id: item.itemId,
        title: item.title || title,
        beforeDateText: item.fromDateKey || 'Unscheduled',
        afterDateText: item.toDateKey || 'Unscheduled',
      }));
    const dayDeltas: PreviewDayDelta[] = (changeSummary?.impactedDays || [])
      .slice(0, 3)
      .map((day: any) => ({
        dateKey: day.dateKey,
        beforeMinutes: day.beforeMinutes,
        afterMinutes: day.afterMinutes
      }));
    const shiftedDays = dayDeltas.length;
    const changedCount = changeSummary?.changedItemCount ?? 0;

    return {
      headline: `Schedule change: ${beforeDateText} -> ${afterDateText}`,
      beforeDateText,
      afterDateText,
      changedItemCount: changedCount,
      impactedDays: shiftedDays,
      impactedItems,
      dayDeltas
    };
  }

  async function handlePriorityPreview(nextUi: number) {
    const target = priorityMenuTarget;
    if (!target) return;
    try {
      const scheduler = await getV4SchedulerService();
      const block = await resolveScheduleItemToBlockV4(target);
      const deckId = await resolveDeckIdForScheduleItem(target);
      const result = await scheduler.previewPriorityUpdateV4(
        block,
        Math.max(0, Math.min(10, nextUi)),
        'calendar_sidebar_preview',
        deckId
      );
      priorityPreviewDetails = buildPreviewDetails(result.futurePlanPreview, block, result.block, target.displayName || target.title || target.id);
    } catch {
      priorityPreviewDetails = null;
    }
  }

  async function loadSchedulingPreviews(material: ScheduleItem) {
    try {
      const scheduler = await getV4SchedulerService();
      const block = await resolveScheduleItemToBlockV4(material);
      const deckId = await resolveDeckIdForScheduleItem(material);
      const entries = await Promise.all(schedulingConfig.map(async cfg => {
        const result = (cfg as any).isPostpone
          ? await scheduler.previewPostponeBlockV4(block, 2, deckId)
          : await scheduler.previewScheduleModeBlockV4(block, cfg.action as 'intensive' | 'normal' | 'slow', deckId);
        return [
          cfg.action,
          buildPreviewDetails(result.futurePlanPreview, block, result.block, material.displayName || material.title || material.id)
        ] as const;
      }));

      schedulingPreviewByAction = {
        intensive: null,
        normal: null,
        slow: null,
        postpone: null,
        ...Object.fromEntries(entries)
      };
    } catch {
      schedulingPreviewByAction = { intensive: null, normal: null, slow: null, postpone: null };
    }
  }

  async function handlePriorityUiChange(nextUi: number) {
    const target = priorityMenuTarget;
    if (!target) return;

    try {
      const ui = Math.max(0, Math.min(10, nextUi));
      const oldPriorityUi = target.explanation?.manualPriority ?? target.priority ?? 5;
      const scheduler = await getV4SchedulerService();
      const block = await resolveScheduleItemToBlockV4(target);
      const deckId = await resolveDeckIdForScheduleItem(target);
      const oldEff = block.priorityEff ?? block.priorityUi ?? target.priority ?? 5;
      const result = await scheduler.updatePriorityWithPreviewV4(block, ui, 'calendar_sidebar_slider', deckId);
      const newEff = result.block.priorityEff ?? ui;

      const monitoring = await getMonitoringService();
      monitoring.recordPriorityChange(target.id, oldPriorityUi, ui, oldEff, newEff);
      monitoring.recordDecisionEvent({
        itemId: target.id,
        action: 'change_priority',
        beforeDate: target.nextReviewDate ? target.nextReviewDate.toISOString() : undefined,
        afterDate: target.nextReviewDate ? target.nextReviewDate.toISOString() : undefined,
        beforePriority: oldPriorityUi,
        afterPriority: ui,
        sourceType: 'calendar_sidebar'
      });
      await monitoring.save();

      closePriorityMenu();
      await recomputeAndRefreshSidebar('change_priority');
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.notices.prioritySetFailed'));
    }
  }

  async function suspendMaterial(material: ScheduleItem) {
    try {
      const scheduler = await getV4SchedulerService();
      const block = await resolveScheduleItemToBlockV4(material);
      const deckId = await resolveDeckIdForScheduleItem(material);
      await scheduler.suspendBlockWithPreviewV4(block, deckId);
      new Notice(t('irSidebar.notices.suspended'));
      closePriorityMenu();
      closeSchedulingMenu();
      await recomputeAndRefreshSidebar('suspend_block');
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.notices.suspendFailed'));
    }
  }

  async function archiveMaterial(material: ScheduleItem) {
    try {
      const scheduler = await getV4SchedulerService();
      const block = await resolveScheduleItemToBlockV4(material);
      const deckId = await resolveDeckIdForScheduleItem(material);
      await scheduler.archiveBlockWithPreviewV4(block, deckId);
      new Notice(t('irSidebar.notices.archived'));
      closePriorityMenu();
      closeSchedulingMenu();
      await recomputeAndRefreshSidebar('archive_block');
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.notices.archiveFailed'));
    }
  }

  async function removeMaterial(material: ScheduleItem) {
    try {
      const scheduler = await getV4SchedulerService();
      const block = await resolveScheduleItemToBlockV4(material);
      const deckId = await resolveDeckIdForScheduleItem(material);
      await scheduler.removeBlockWithPreviewV4(block, deckId);
      new Notice(t('irSidebar.notices.removed'));
      closePriorityMenu();
      closeSchedulingMenu();
      await recomputeAndRefreshSidebar('remove_block');
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.notices.removeFailed'));
    }
  }

  async function deleteMaterial(material: ScheduleItem) {
    try {
      const pointWriteService = new IRPointWriteService(plugin.app);
      const deleted = await pointWriteService.deletePoint({
        id: material.id,
        kind: material.sourceType === 'legacy-block' ? 'block' : material.sourceType === 'chunk' ? 'chunk' : undefined
      });
      if (!deleted) {
        throw new Error(`Failed to delete reading point: ${material.id}`);
      }
      new Notice(t('irSidebar.notices.deleted'));
      closePriorityMenu();
      closeSchedulingMenu();
      await recomputeAndRefreshSidebar('remove_block');
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.notices.deleteFailed'));
    }
  }

  async function loadTagGroupSubmenu(sub: Menu, material: ScheduleItem) {
    try {
      const tagService = await getPointTagService();
      const [currentTags, allGroups] = await Promise.all([
        getMaterialReadingPointTags(material),
        tagService.getTagGroups(),
      ]);
      const currentGroupId = await tagService.matchGroupForTags(currentTags);
      const currentGroup = allGroups.find((group) => group.id === currentGroupId);
      const visibleGroups = [...allGroups]
        .filter((group) => group.id !== 'default')
        .sort((a, b) => (a.matchPriority ?? 0) - (b.matchPriority ?? 0));

      sub.addItem((item) => {
        item
          .setTitle(`?????${currentGroup?.name || '?????'}`)
          .setIcon('check-circle')
          .setDisabled(true);
      });

      sub.addItem((item) => {
        item
          .setTitle(currentTags.length > 0 ? `?????${currentTags.join(' / ')}` : '??????')
          .setIcon('hash')
          .setDisabled(true);
      });

      sub.addSeparator();

      if (visibleGroups.length === 0) {
        sub.addItem((item) => {
          item.setTitle('???????').setIcon('inbox').setDisabled(true);
        });
      } else {
        for (const group of visibleGroups) {
          const matchedTags = normalizeReadingPointTags(group.matchAnyTags || []).filter((candidate) =>
            currentTags.some((tag) => tag.toLowerCase() === candidate.toLowerCase())
          );
          sub.addItem((item) => {
            const suffix = group.id === currentGroupId ? '??????' : '';
            const matchHint = matchedTags.length > 0 ? ` ? ???${matchedTags.join(', ')}` : '';
            item
              .setTitle(`${group.name}${suffix}${matchHint}`)
              .setIcon(group.id === currentGroupId ? 'check' : 'tags')
              .setDisabled(true);
          });
        }
      }

      sub.addSeparator();
      sub.addItem((item) => {
        item
          .setTitle('?????????????')
          .setIcon('info')
          .setDisabled(true);
      });
    } catch (error) {
      logger.error('[IRCalendarSidebar] ?????????:', error);
      sub.addItem((item) => {
        item.setTitle('?????????').setIcon('alert-triangle').setDisabled(true);
      });
    }
  }

  async function openBlockInfo(material: ScheduleItem, position?: { x: number; y: number }) {
    try {
      let blockInfoTarget: any;

      if (isPdfBookmarkTaskId(material.id) || isEpubBookmarkTaskId(material.id)) {
        const isPdf = isPdfBookmarkTaskId(material.id);
        const bookService = isPdf ? await getPdfBookmarkTaskService() : await getEpubBookmarkTaskService();
        const task = await bookService.getTask(material.id);
        if (!task) {
          new Notice(t(isPdf ? 'irSidebar.tagGroup.pdfTaskMissing' : 'irSidebar.tagGroup.epubTaskMissing'));
          return;
        }
        const filePath = isPdf
          ? (task as any).pdfPath
          : await resolveEpubTaskFilePath(task as any);
        const totalReadingTime = await getStoredTimerTotalSeconds(material.id);
        blockInfoTarget = {
          id: task.id,
          filePath: filePath ?? material.sourceFile ?? '',
          state: task.status ?? 'new',
          priority: Math.round(task.priorityUi ?? task.priorityEff ?? material.priority ?? 5),
          priorityUi: task.priorityUi ?? material.priority ?? 5,
          priorityEff: task.priorityEff ?? task.priorityUi ?? 5,
          interval: task.intervalDays ?? 1,
          intervalFactor: 1.5,
          reviewCount: task.stats?.impressions ?? 0,
          totalReadingTime,
          createdAt: new Date(task.createdAt ?? Date.now()).toISOString(),
          updatedAt: new Date(task.updatedAt ?? Date.now()).toISOString(),
          nextReview: task.nextRepDate ? new Date(task.nextRepDate).toISOString() : null,
          nextRepDate: task.nextRepDate,
          headingText: material.title || task.title || '',
          tags: task.tags ?? []
        };
      } else {
        const chunk = await getWorkspaceChunkById(material.id);
        const totalReadingTime = await getStoredTimerTotalSeconds(material.id);

        if (chunk) {
          const scheduleStatus = (chunk as any).scheduleStatus as string;
          const intervalDays = (chunk as any).intervalDays as number;
          const nextRepDate = (chunk as any).nextRepDate as number;
          const priorityUi = (chunk as any).priorityUi as number | undefined;
          const priorityEff = (chunk as any).priorityEff as number;

          blockInfoTarget = {
            id: (chunk as any).chunkId ?? material.id,
            filePath: (chunk as any).filePath ?? material.sourceFile ?? '',
            state: scheduleStatus ?? 'new',
            priority: Math.round(priorityUi ?? priorityEff ?? material.priority ?? 5),
            priorityUi: priorityUi ?? material.priority ?? 5,
            priorityEff: priorityEff,
            interval: intervalDays ?? 1,
            intervalFactor: 1.5,
            reviewCount: (chunk as any).stats?.impressions ?? 0,
            totalReadingTime,
            createdAt: new Date((chunk as any).createdAt ?? Date.now()).toISOString(),
            updatedAt: new Date((chunk as any).updatedAt ?? Date.now()).toISOString(),
            nextReview: nextRepDate ? new Date(nextRepDate).toISOString() : null,
            nextRepDate,
            headingText: material.title || (chunk as any).headingText || '',
            tags: (chunk as any).meta?.tags ?? (chunk as any).tags ?? []
          };
        } else {
          const legacyBlock = await getWorkspaceLegacyBlockById(material.id);
          if (!legacyBlock) {
            new Notice(t('irSidebar.notices.blockMissing'));
            return;
          }

          const migrated = migrateToIRBlockV4(legacyBlock);
          const nextRepDate = Number(migrated.nextRepDate || 0);
          const priorityUi = (legacyBlock as any).priorityUi as number | undefined;
          const priorityEff = (legacyBlock as any).priorityEff as number | undefined;

          blockInfoTarget = {
            id: legacyBlock.id,
            filePath: legacyBlock.filePath ?? material.sourceFile ?? '',
            state: legacyBlock.state ?? 'new',
            priority: Math.round(priorityUi ?? priorityEff ?? material.priority ?? 5),
            priorityUi: priorityUi ?? material.priority ?? 5,
            priorityEff: priorityEff ?? priorityUi ?? material.priority ?? 5,
            interval: legacyBlock.interval ?? migrated.intervalDays ?? 1,
            intervalFactor: legacyBlock.intervalFactor ?? 1.5,
            reviewCount: legacyBlock.reviewCount ?? migrated.stats?.impressions ?? 0,
            totalReadingTime,
            createdAt: legacyBlock.createdAt ?? new Date().toISOString(),
            updatedAt: legacyBlock.updatedAt ?? new Date().toISOString(),
            nextReview: legacyBlock.nextReview ?? (nextRepDate ? new Date(nextRepDate).toISOString() : null),
            nextRepDate,
            headingText: material.title || getLegacyBlockDisplayName(legacyBlock) || '',
            tags: legacyBlock.tags ?? []
          };
        }
      }

      closeBlockInfoModal();
      blockInfoModalContainer = document.createElement('div');
      blockInfoModalContainer.className = 'weave-ir-block-info-modal-container';
      document.body.append(blockInfoModalContainer);

      blockInfoModalInstance = mount(IRBlockInfoModal, {
        target: blockInfoModalContainer,
        props: {
          block: blockInfoTarget as any,
          app: plugin.app,
          position,
          onClose: () => closeBlockInfoModal()
        }
      });
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.notices.openFailed'));
    }
  }

  async function setReminderForMaterial(material: ScheduleItem, date: string, time: string) {
    if (!date || !time) {
      new Notice(t('irSidebar.notices.invalidDateTime'));
      return;
    }

    try {
      const reviewDateTime = new Date(`${date}T${time}`);
      if (reviewDateTime <= new Date()) {
        new Notice(t('irSidebar.notices.futureReviewTime'));
        return;
      }

      const scheduler = await getV4SchedulerService();
      const block = await resolveScheduleItemToBlockV4(material);
      const deckId = await resolveDeckIdForScheduleItem(material);
      await scheduler.manualRescheduleBlockWithPreviewV4(
        block,
        {
          nextRepDate: reviewDateTime.getTime(),
          scheduleStatus: 'queued'
        },
        deckId
      );

      new Notice(t('irSidebar.notices.reviewTimeSet', { time: reviewDateTime.toLocaleString() }));
      closeReminderModal();
      await recomputeAndRefreshSidebar('manual_reschedule');

    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.notices.reviewTimeSetFailed'));
    }
  }

  function openReminderModal(material: ScheduleItem, position?: { x: number; y: number }) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const initialDate = tomorrow.toISOString().split('T')[0];
    const initialTime = new Date().toTimeString().slice(0, 5);

    closeReminderModal();
    reminderModalContainer = document.createElement('div');
    reminderModalContainer.className = 'weave-ir-review-reminder-modal-container';
    document.body.append(reminderModalContainer);

    reminderModalInstance = mount(IRReviewReminderModal, {
      target: reminderModalContainer,
      props: {
        initialDate,
        initialTime,
        position,
        onCancel: () => closeReminderModal(),
        onConfirm: (date: string, time: string) => {
          void setReminderForMaterial(material, date, time);
        }
      }
    });
  }

  onDestroy(() => {
    clearTimerTicker();
    closeBlockInfoModal();
    closeReminderModal();
    importModalInstance?.close();
    importModalInstance = null;
    analyticsModalInstance?.close();
    analyticsModalInstance = null;
  });

  function openAnalyticsModal() {
    analyticsModalInstance?.close();
    analyticsModalInstance = new IRAnalyticsModalObsidian(plugin.app, {
      plugin,
      onClose: () => {
        analyticsModalInstance = null;
      }
    });
    analyticsModalInstance.open();
  }

  /**

   */
  async function getSiblingMaterials(material: ScheduleItem): Promise<ScheduleItem[]> {
    const sourceFile = material.sourceFile;
    if (!sourceFile) return [];

    const collectedIds = new Set<string>([material.id]);
    const siblings: ScheduleItem[] = [];


    for (const [_dateKey, items] of materialsByDate) {
      for (const item of items) {
        if (collectedIds.has(item.id)) continue;
        if (item.sourceFile !== sourceFile) continue;
        collectedIds.add(item.id);
        siblings.push(item);
      }
    }


    if (sourceFile.toLowerCase().endsWith('.pdf')) {
      try {
        const allTasks = (await getWorkspaceSnapshotService().getWorkspaceData()).pdfTasks;
        for (const task of allTasks) {
          if (collectedIds.has(task.id)) continue;
          if (task.pdfPath !== sourceFile) continue;
          const status = String(task.status || 'new');
          if (status === 'done' || status === 'removed') continue;
          collectedIds.add(task.id);
          siblings.push({
            id: task.id,
            title: String(task.title || '').trim() || 'PDF',
            displayName: extractPdfHeading(String(task.title || '')),
            sourceFile: task.pdfPath,
            associatedNotePath: task.meta?.associatedNotePath,
            associatedNoteScope: task.meta?.associatedNotePath ? 'point' : undefined,
            resumeLink: task.link,
            priority: Number(task.priorityUi ?? task.priorityEff ?? 5),
            intervalDays: Number(task.intervalDays ?? 1),
            scheduleStatus: status,
            nextRepDate: Number(task.nextRepDate || 0),
            nextReviewDate: task.nextRepDate ? new Date(task.nextRepDate) : null,
          });
        }
      } catch (e) {
        logger.warn('[IRCalendarSidebar] Failed to load PDF sibling materials', e);
      }
    } else if (isEpubBookmarkTaskId(material.id) || sourceFile.toLowerCase().endsWith('.epub')) {
      try {
        const identityKey = await resolveEpubIdentityKey({ filePath: sourceFile });
        const allTasks = (await getWorkspaceSnapshotService().getWorkspaceData()).epubTasks;
        for (const task of allTasks) {
          if (collectedIds.has(task.id)) continue;
          const status = String(task.status || 'new');
          if (status === 'done' || status === 'removed') continue;
          if (String(task.epubFilePath || '').trim() !== sourceFile.trim() && String(task.sourceId || '').trim() === '') {
            continue;
          }
          const taskIdentityKey = await resolveEpubIdentityKey({
            sourceId: task.sourceId,
            filePath: task.epubFilePath
          });
          if (identityKey && taskIdentityKey && identityKey !== taskIdentityKey) continue;
          const resolvedFilePath = await resolveEpubTaskFilePath(task);
          collectedIds.add(task.id);
          siblings.push({
            id: task.id,
            title: String(task.title || '').trim() || 'EPUB',
            sourceFile: resolvedFilePath,
            associatedNotePath: task.meta?.associatedNotePath,
            associatedNoteScope: task.meta?.associatedNotePath ? 'point' : undefined,
            priority: Number(task.priorityUi ?? task.priorityEff ?? 5),
            intervalDays: Number(task.intervalDays ?? 1),
            scheduleStatus: status,
            nextRepDate: Number(task.nextRepDate || 0),
            nextReviewDate: task.nextRepDate ? new Date(task.nextRepDate) : null,
          });
        }
      } catch (e) {
        logger.warn('[IRCalendarSidebar] Failed to load EPUB sibling materials', e);
      }
    }


    siblings.sort((a, b) => (a.nextRepDate || 0) - (b.nextRepDate || 0));
    return siblings;
  }

  /**

   */
  async function toggleMaterialExpand(material: ScheduleItem) {
    const id = material.id;
    if (expandedMaterialIds.has(id)) {
      const next = new Set(expandedMaterialIds);
      next.delete(id);
      expandedMaterialIds = next;
      return;
    }


    if (siblingCache.has(id)) {
      expandedMaterialIds = new Set([...expandedMaterialIds, id]);
      return;
    }


    loadingSiblings = new Set([...loadingSiblings, id]);
    try {
      const siblings = await getSiblingMaterials(material);
      const next = new Map(siblingCache);
      next.set(id, siblings);
      siblingCache = next;
      expandedMaterialIds = new Set([...expandedMaterialIds, id]);
    } catch (e) {
      logger.error('[IRCalendarSidebar] Recovered error message.', e);
    } finally {
      const ls = new Set(loadingSiblings);
      ls.delete(id);
      loadingSiblings = ls;
    }
  }

  async function refreshReadingPointTagMap(byDate: Map<string, ScheduleItem[]>): Promise<void> {
    const uniqueItems = new Map<string, ScheduleItem>();
    for (const items of byDate.values()) {
      for (const item of items) {
        uniqueItems.set(item.id, item);
      }
    }
    for (const items of pinnedByDate.values()) {
      for (const item of items) {
        uniqueItems.set(item.id, item);
      }
    }

    if (uniqueItems.size === 0) {
      readingPointTagsById = {};
      return;
    }

    const entries = await Promise.all(
      Array.from(uniqueItems.values()).map(async (item) => {
        try {
          return [item.id, await getMaterialReadingPointTags(item)] as const;
        } catch (error) {
          logger.warn('[IRCalendarSidebar] ?????????:', item.id, error);
          return [item.id, []] as const;
        }
      })
    );

    readingPointTagsById = Object.fromEntries(entries);
  }

  async function getMaterialReadingPointTags(material: ScheduleItem): Promise<string[]> {
    const tagService = await getPointTagService();

    if (isPdfBookmarkTaskId(material.id)) {
      const task = await getWorkspacePdfTaskById(material.id);
      return normalizeReadingPointTags(task?.tags || []);
    }

    if (isEpubBookmarkTaskId(material.id)) {
      const task = await getWorkspaceEpubTaskById(material.id);
      return normalizeReadingPointTags(task?.tags || []);
    }

    if (material.sourceType === 'legacy-block') {
      return [];
    }

    const chunk = await getWorkspaceChunkById(material.id);
    if (!chunk) return [];
    return await tagService.getChunkTags(chunk);
  }

  async function saveMaterialReadingPointTags(material: ScheduleItem, tags: string[]): Promise<boolean> {
    const tagService = await getPointTagService();
    const normalizedTags = normalizeReadingPointTags(tags);
    let saved = false;

    if (isPdfBookmarkTaskId(material.id)) {
      saved = !!(await tagService.savePdfTaskTags(material.id, normalizedTags));
    } else if (isEpubBookmarkTaskId(material.id)) {
      saved = !!(await tagService.saveEpubTaskTags(material.id, normalizedTags));
    } else {
      if (material.sourceType === 'legacy-block') {
        return false;
      }
      saved = !!(await tagService.saveChunkTags(material.id, normalizedTags));
    }

    if (saved) {
      readingPointTagsById = {
        ...readingPointTagsById,
        [material.id]: normalizedTags,
      };
    }

    return saved;
  }

  function buildGroupedTagSections(tags: string[], groups: IRTagGroup[]): Array<{ key: string; label: string; icon: string; tags: string[] }> {
    const sortedGroups = [...groups]
      .filter((group) => group.id !== 'default')
      .sort((a, b) => (a.matchPriority ?? 0) - (b.matchPriority ?? 0));
    const grouped = new Map<string, { key: string; label: string; icon: string; tags: string[] }>();
    const ungrouped: string[] = [];

    for (const rawTag of tags) {
      const tag = String(rawTag || '').trim();
      if (!tag) continue;
      const normalized = tag.toLowerCase();
      const matchedGroup = sortedGroups.find((group) =>
        (group.matchAnyTags || []).some((candidate) => String(candidate || '').trim().replace(/^#/, '').toLowerCase() === normalized.replace(/^#/, ''))
      );

      if (!matchedGroup) {
        ungrouped.push(tag);
        continue;
      }

      if (!grouped.has(matchedGroup.id)) {
        grouped.set(matchedGroup.id, {
          key: matchedGroup.id,
          label: matchedGroup.name,
          icon: 'tags',
          tags: [],
        });
      }
      grouped.get(matchedGroup.id)?.tags.push(tag);
    }

    const sections = Array.from(grouped.values())
      .map((section) => ({
        ...section,
        tags: [...new Set(section.tags)].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));

    if (ungrouped.length > 0) {
      sections.push({
        key: '__ungrouped__',
        label: 'Ungrouped',
        icon: 'tag',
        tags: [...new Set(ungrouped)].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      });
    }

    return sections;
  }

  async function loadReadingTagSubmenu(sub: Menu, material: ScheduleItem): Promise<void> {
    try {
      const tagService = await getPointTagService();
      const [currentTags, knownTags, groups] = await Promise.all([
        getMaterialReadingPointTags(material),
        tagService.getAllKnownTags(),
        tagService.getTagGroups(),
      ]);
      const currentTagSet = new Set(currentTags.map((tag) => tag.toLowerCase()));
      const currentGroupId = await tagService.matchGroupForTags(currentTags);
      const currentGroup = groups.find((group) => group.id === currentGroupId);

      sub.addItem((item) => {
        item
          .setTitle(`Current tag group: ${currentGroup?.name || 'None'}`)
          .setIcon('layers')
          .setDisabled(true);
      });

      sub.addSeparator();

      sub.addItem((item) => {
        item
          .setTitle('Create new tag')
          .setIcon('plus')
          .onClick(async () => {
            const input = await showObsidianInput(plugin.app, 'Enter a new tag name', '', {
              title: 'Create tag',
              placeholder: 'e.g. concept / quote / problem',
              confirmText: 'Create'
            });
            if (input === null) return;

            const [nextTag] = normalizeReadingPointTags([input]);
            if (!nextTag) {
              new Notice('Tag name cannot be empty');
              return;
            }
            if (currentTagSet.has(nextTag.toLowerCase())) {
              new Notice(`Tag already exists: ${nextTag}`);
              return;
            }

            const saved = await saveMaterialReadingPointTags(material, [...currentTags, nextTag]);
            if (!saved) {
              new Notice('Failed to save tag');
              return;
            }

            new Notice(`Added tag: ${nextTag}`);
            await recomputeAndRefreshSidebar('reading_point_tags_changed');
          });
      });

      sub.addItem((item) => {
        item.setTitle('Add existing tag').setIcon('tags');
        const selectSub = (item as any).setSubmenu();
        const sections = buildGroupedTagSections(knownTags, groups);

        if (sections.length === 0) {
          selectSub.addItem((subItem: any) => {
            subItem.setTitle('No available tags').setIcon('inbox').setDisabled(true);
          });
          return;
        }

        for (const section of sections) {
          selectSub.addItem((sectionItem: any) => {
            sectionItem.setTitle(section.label).setIcon(section.icon);
            const sectionSub = sectionItem.setSubmenu();

            for (const tag of section.tags) {
              const exists = currentTagSet.has(tag.toLowerCase());
              sectionSub.addItem((tagItem: any) => {
                tagItem
                  .setTitle(tag)
                  .setIcon(exists ? 'check' : 'tag')
                  .setChecked(exists)
                  .setDisabled(exists)
                  .onClick(async () => {
                    const saved = await saveMaterialReadingPointTags(material, [...currentTags, tag]);
                    if (!saved) {
                      new Notice('Failed to save tag');
                      return;
                    }

                    new Notice(`Added tag: ${tag}`);
                    await recomputeAndRefreshSidebar('reading_point_tags_changed');
                  });
              });
            }
          });
        }
      });

      sub.addItem((item) => {
        item.setTitle('Remove tag').setIcon('minus-circle');
        const removeSub = (item as any).setSubmenu();

        if (currentTags.length === 0) {
          removeSub.addItem((subItem: any) => {
            subItem.setTitle('No tags to remove').setIcon('inbox').setDisabled(true);
          });
          return;
        }

        for (const tag of currentTags) {
          removeSub.addItem((tagItem: any) => {
            tagItem
              .setTitle(tag)
              .setIcon('x')
              .onClick(async () => {
                const saved = await saveMaterialReadingPointTags(
                  material,
                  currentTags.filter((currentTag) => currentTag.toLowerCase() !== tag.toLowerCase())
                );
                if (!saved) {
                  new Notice('Failed to save tag');
                  return;
                }

                new Notice(`Removed tag: ${tag}`);
                await recomputeAndRefreshSidebar('reading_point_tags_changed');
              });
          });
        }
      });
    } catch (error) {
      logger.error('[IRCalendarSidebar] Failed to load reading tag submenu.', error);
      sub.addItem((item) => {
        item.setTitle('Failed to load tags').setIcon('alert-triangle').setDisabled(true);
      });
    }
  }

  function showMaterialMenuAt(
    menuPosition: { x: number; y: number },
    popoverPosition: { x: number; y: number },
    anchor: HTMLElement,
    material: ScheduleItem
  ) {
    try {
      const menu = new Menu();

      menu.addItem((item) => {
        item
          .setTitle(t('irSidebar.menu.view'))
          .setIcon('eye')
          .onClick(() => {
            void openBlockInfo(material, popoverPosition);
          });
      });

      menu.addSeparator();

      menu.addItem((item) => {
        item
          .setTitle(t('irSidebar.menu.setPriority'))
          .setIcon('star')
          .onClick(() => {
            openPriorityMenuForAnchor(anchor, material);
          });
      });

      menu.addItem((item) => {
        item
          .setTitle(t('irSidebar.menu.setNextReviewTime'))
          .setIcon('calendar-clock')
          .onClick(() => {
            openReminderModal(material, popoverPosition);
          });
      });

      menu.addItem((item) => {
        item
          .setTitle('Reading tags')
          .setIcon('hash');
        const sub = (item as any).setSubmenu();
        void loadReadingTagSubmenu(sub, material);
      });

      menu.addItem((item) => {
        item
          .setTitle('Tag group')
          .setIcon('tags');
        const sub = (item as any).setSubmenu();
        void loadTagGroupSubmenu(sub, material);
      });

      menu.addItem((item) => {
        item
          .setTitle('Associated note')
          .setIcon('link');
        const sub = (item as any).setSubmenu();
        buildAssociatedNoteSubmenu(sub, material);
      });

      menu.addSeparator();

      menu.addItem((item) => {
        item
          .setTitle(t('irSidebar.menu.suspend'))
          .setIcon('pause-circle')
          .onClick(() => {
            void suspendMaterial(material);
          });
      });

      menu.addItem((item) => {
        item
          .setTitle(t('irSidebar.menu.archive'))
          .setIcon('archive')
          .onClick(() => {
            void archiveMaterial(material);
          });
      });

      menu.addItem((item) => {
        item
          .setTitle(t('irSidebar.menu.remove'))
          .setIcon('x-circle')
          .onClick(() => {
            void removeMaterial(material);
          });
      });

      menu.addItem((item) => {
        item
          .setTitle(t('irSidebar.menu.delete'))
          .setIcon('trash-2')
          .onClick(async () => {
            const confirmed = await showDeleteConfirm(
              plugin.app,
              material.title || material.id,
              'Delete this reading material and its related incremental reading data? This action cannot be undone.'
            );
            if (confirmed) {
              void deleteMaterial(material);
            }
          });
      });


      if (material.sourceFile?.toLowerCase().endsWith('.pdf')) {
        menu.addSeparator();

        menu.addItem((item) => {
          item
            .setTitle(t('irSidebar.menu.addReadingPoint'))
            .setIcon('bookmark-plus')
            .onClick(() => {
              void openAddReadingPointModal(material);
            });
        });
      }

      menu.addSeparator();

      menu.addItem((item) => {
        item
          .setTitle(t('irSidebar.menu.moreActions'))
          .setIcon('settings');
        const sub = (item as any).setSubmenu();

        sub.addItem((subItem: any) => {
          subItem
            .setTitle(t('irSidebar.menu.continuousReading'))
            .setChecked(continuousReadingEnabled)
            .onClick(() => {
              void setContinuousReadingEnabled(!continuousReadingEnabled);
            });
        });

        sub.addItem((subItem: any) => {
          subItem
            .setTitle(t('irSidebar.menu.autoTimer'))
            .setChecked(autoStartNextTimerEnabled)
            .onClick(() => {
              void setAutoStartNextTimerEnabled(!autoStartNextTimerEnabled);
            });
        });

        sub.addItem((subItem: any) => {
          subItem
            .setTitle(t('irSidebar.menu.showRealtimePreview'))
            .setChecked(showSchedulingPreview)
            .onClick(() => {
              void setShowSchedulingPreviewEnabled(!showSchedulingPreview);
            });
        });
      });

      menu.showAtPosition(menuPosition);
    } catch (error) {
      logger.error('[IRCalendarSidebar] Failed to show material context menu:', error);
    }
  }


  function formatSiblingDueDate(nextRepDate: number): string {
    const due = new Date(nextRepDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)} day(s) overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return `Due in ${diffDays} day(s)`;
  }

  async function openAddReadingPointModal(material: ScheduleItem): Promise<void> {
    try {
      let resolvedDeckId = '';

      if (isPdfBookmarkTaskId(material.id)) {
        const task = await getWorkspacePdfTaskById(material.id);
        resolvedDeckId = resolveCanonicalDeckId(getTaskTopicId(task) || '');
      }

      if (!resolvedDeckId) {

        for (const deck of irDecks) {
          const deckIdentifiers = [deck.id, String((deck as any)?.path || '').trim()].filter(Boolean);
          const match = allBlocks.find(
            (b: any) =>
              b.sourcePath === material.sourceFile &&
              getChunkTopicIds(b).some((identifier) => deckIdentifiers.includes(identifier))
          );
          if (match) {
            resolvedDeckId = deck.id;
            break;
          }
        }
      }

      if (!resolvedDeckId && irDecks.length > 0) {
        resolvedDeckId = irDecks[0].id;
      }

      if (!resolvedDeckId) {
        new Notice(t('irSidebar.notices.noDecksAvailable'));
        return;
      }

      arpDeckId = resolvedDeckId;
      arpPdfPath = material.sourceFile;
      arpParentTitle = material.displayName || material.title || 'PDF';
      showAddReadingPointModal = true;
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.notices.actionFailedRetry'));
    }
  }

  function handleMaterialContextMenu(event: MouseEvent, anchor: HTMLElement, material: ScheduleItem) {
    event.preventDefault();
    showMaterialMenuAt(
      { x: event.pageX, y: event.pageY },
      { x: event.clientX, y: event.clientY },
      anchor,
      material
    );
  }

  function handleMaterialClick(material: ScheduleItem) {
    if (suppressClickOnce) {
      suppressClickOnce = false;
      return;
    }
    void openMaterial(material);
  }

  function clearLongPressTimer() {
    if (longPressTimerId !== null) {
      window.clearTimeout(longPressTimerId);
      longPressTimerId = null;
    }
  }

  function handleLongPressStart(event: PointerEvent, anchor: HTMLElement, material: ScheduleItem) {
    if (!Platform.isMobile) return;
    if (event.pointerType === 'mouse') return;

    clearLongPressTimer();

    longPressTriggered = false;
    longPressStartX = event.clientX;
    longPressStartY = event.clientY;

    longPressTimerId = window.setTimeout(() => {
      longPressTriggered = true;
      suppressClickOnce = true;
      showMaterialMenuAt({ x: event.pageX, y: event.pageY }, { x: event.clientX, y: event.clientY }, anchor, material);
    }, 450);
  }

  function handleLongPressMove(event: PointerEvent) {
    if (!Platform.isMobile) return;
    if (longPressTimerId === null) return;

    const dx = event.clientX - longPressStartX;
    const dy = event.clientY - longPressStartY;
    if (Math.hypot(dx, dy) > 12) {
      clearLongPressTimer();
    }
  }

  function handleLongPressEnd(event: PointerEvent) {
    if (!Platform.isMobile) return;
    clearLongPressTimer();
    if (longPressTriggered) {
      event.preventDefault();
    }
    longPressTriggered = false;
  }

  async function handleSchedulingAction(action: SchedulingAction) {
    const target = schedulingMenuTarget;
    if (!target) return;

    try {
      const cfg = schedulingConfig.find(c => c.action === action);
      if (!cfg) return;
      const isPostpone = Boolean((cfg as any).isPostpone);
      const shouldAutoStartNextTimer =
        !isPostpone &&
        shouldAutoStartNextTimerAfterScheduling(target.id);
      const shouldPauseTargetTimer = activeReadingTimer?.blockId === target.id;

      const scheduler = await getV4SchedulerService();
      const block = await resolveScheduleItemToBlockV4(target);
      const deckId = await resolveDeckIdForScheduleItem(target);

      const result = isPostpone
        ? await scheduler.postponeBlockWithPreviewV4(block, 2, deckId)
        : await scheduler.applyScheduleModeWithPreviewV4(block, action as 'intensive' | 'normal' | 'slow', deckId);

      const updatedBlock = result.block;
      const nextRepDate = updatedBlock.nextRepDate;
      const intervalDays = updatedBlock.intervalDays || 1;
      const scheduleStatus = updatedBlock.status;

      if (isPostpone) {
        new Notice(`Postponed to ${new Date(nextRepDate).toLocaleDateString()}.`);
      } else {
        const actionLabelMap: Record<string, string> = { intensive: 'Intensive review', normal: 'Normal review', slow: 'Slow review', postpone: 'Postpone' };
        const actionLabel = actionLabelMap[action] || action;
        new Notice(`${actionLabel}: next review in ${intervalDays} day(s).`);
      }

      processedChunkIds = new Set([...processedChunkIds, target.id]);

      const pinnedKey = schedulingMenuDateKey || formatDateKey(selectedDate);
      const pinnedList = pinnedByDate.get(pinnedKey) || [];
      const updated: ScheduleItem = {
        ...target,
        deckId,
        intervalDays,
        scheduleStatus,
        nextRepDate,
        nextReviewDate: nextRepDate > 0 ? new Date(nextRepDate) : null,
      };

      const newPinnedByDate = new Map(pinnedByDate);
      newPinnedByDate.set(
        pinnedKey,
        [...pinnedList.filter(p => p.id !== target.id), updated]
      );
      pinnedByDate = newPinnedByDate;

      const storage = await getStorage();
      await storage.addCalendarCompletion(pinnedKey, target.id);
      calendarProgressByDate = {
        ...calendarProgressByDate,
        [pinnedKey]: [...new Set([...(calendarProgressByDate[pinnedKey] || []), target.id])]
      };

      const nextMaterial = getNextUnprocessedMaterial(target.id);

      closeSchedulingMenu();


      await recomputeAndRefreshSidebar(isPostpone ? 'postpone_block' : 'complete_block');
      const monitoring = await getMonitoringService();
      monitoring.recordDecisionEvent({
        itemId: target.id,
        action: isPostpone ? 'postpone_block' : `schedule_${action}`,
        beforeDate: target.nextReviewDate ? target.nextReviewDate.toISOString() : undefined,
        afterDate: nextRepDate > 0 ? new Date(nextRepDate).toISOString() : undefined,
        beforePriority: target.explanation?.manualPriority ?? target.priority ?? 5,
        afterPriority: target.explanation?.manualPriority ?? target.priority ?? 5,
        sourceType: 'calendar_sidebar'
      });
      monitoring.recordDecisionOutcome({
        itemId: target.id,
        outcomeType: isPostpone ? 'rescheduled' : 'scheduled',
        completionSource: 'calendar_sidebar',
        beforeDate: target.nextReviewDate ? target.nextReviewDate.toISOString() : undefined,
        afterDate: nextRepDate > 0 ? new Date(nextRepDate).toISOString() : undefined
      });
      await monitoring.save();
      if (shouldPauseTargetTimer) {
        const paused = await pauseActiveReadingTimer(isPostpone ? 'skipped' : 'completed', target.id);
        if (!paused) {
          logger.warn('[IRCalendarSidebar] Recovered warning message.', {
            currentBlockId: target.id,
            nextBlockId: nextMaterial?.id
          });
        }
      }
      if (!shouldAutoStartNextTimer || !nextMaterial) {
        clearAutoTimerChain();
      }
      if (nextMaterial) {
        const refreshedNextMaterial = findScheduleItemById(nextMaterial.id) ?? nextMaterial;
        await openMaterial(refreshedNextMaterial);
        if (shouldAutoStartNextTimer) {
          const started = await startReadingTimerWithRetry(refreshedNextMaterial, { announceStart: false, retries: 4 });
          if (!started) {
            clearAutoTimerChain();
          } else {
            armAutoTimerChain(refreshedNextMaterial.id);
          }
        }
      }
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.notices.actionFailedRetry'));
    }
  }


  async function loadData(options: { forceRecompute?: boolean } = {}): Promise<void> {
    if (loadDataInFlight) {
      loadDataQueued = true;
      loadDataQueuedForceRecompute = loadDataQueuedForceRecompute || Boolean(options.forceRecompute);
      return loadDataInFlight;
    }

    const requestId = ++loadDataRequestId;
    loadDataInFlight = (async () => {
      isLoading = true;
      try {
        const workspaceData = await getWorkspaceSnapshotService().getWorkspaceData();
        const { decksRecord, blocksRecord } = workspaceData;

        let nextReadingMaterials: ReadingMaterial[] = [];
        try {
          if (plugin.readingMaterialManager) {
            nextReadingMaterials = await plugin.readingMaterialManager.getAllMaterials();
          }
        } catch {
          nextReadingMaterials = [];
        }

        const kernel = await getScheduleKernel();
        const schedule =
          !options.forceRecompute
            ? kernel.getCachedSchedule() ?? await kernel.recomputeScheduleForDeck('ui_refresh')
            : await kernel.recomputeScheduleForDeck('ui_refresh');
        const projectedSummary = await getProjectedScheduleSummary(plugin.app, {
          schedule,
          seedData: {
            decksRecord,
            blocksRecord,
            history: workspaceData.history
          }
        });
        const projectedDayLoadMap = buildProjectedDayLoadMap(projectedSummary);

        const byDate = new Map<string, ScheduleItem[]>();
        for (const [dateKey, dayLoad] of projectedDayLoadMap.entries()) {
          byDate.set(
            dateKey,
            dayLoad.items.map((item) => ({
              id: item.id,
              title: item.title,
              displayName: item.displayName,
              sourceFile: item.sourceFile,
              associatedNotePath: item.associatedNotePath,
              associatedNoteScope: item.associatedNoteScope,
              deckId: item.deckId,
              priority: item.priority,
              intervalDays: item.intervalDays,
              scheduleStatus: item.scheduleStatus,
              nextRepDate: item.nextRepDate,
              nextReviewDate: item.nextReviewDate,
              resumeLink: item.resumeLink,
              sourceType: item.sourceType,
              explanation: item.explanation
            }))
          );
        }

        await Promise.all([
          refreshReadingPointTagMap(byDate),
          loadTimerTotalsFromHistory()
        ]);

        if (requestId !== loadDataRequestId) {
          return;
        }

        irDecks = Object.values(decksRecord);
        allBlocks = Object.values(blocksRecord);
        readingMaterials = nextReadingMaterials;
        materialsByDate = byDate;
        lastAppliedScheduleGeneratedAt = projectedSummary.schedule.generatedAt;

        logger.debug('[IRCalendarSidebar] Recovered debug message.', {
          decks: irDecks.length,
          blocks: allBlocks.length,
          dates: byDate.size,
          generatedAt: projectedSummary.schedule.generatedAt,
          triggerReason: projectedSummary.schedule.triggerReason
        });
      } catch (error) {
        logger.error('[IRCalendarSidebar] Recovered error message.', error);
      } finally {
        if (requestId === loadDataRequestId) {
          isLoading = false;
        }
      }
    })();

    try {
      await loadDataInFlight;
    } finally {
      loadDataInFlight = null;
      if (loadDataQueued) {
        const queuedForceRecompute = loadDataQueuedForceRecompute;
        loadDataQueued = false;
        loadDataQueuedForceRecompute = false;
        await loadData({ forceRecompute: queuedForceRecompute });
      }
    }
    return;
    /*
    

      

        materialsByDate = byDate;

        logger.debug('[IRCalendarSidebar] Recovered debug message.', {
          decks: irDecks.length,
          dates: materialsByDate.size,
          generatedAt: schedule.generatedAt
        });
        return;
      }

      const now = new Date();
      now.setHours(0, 0, 0, 0);


      const byDate = new Map<string, ScheduleItem[]>();
      
      for (const chunk of chunks) {
        const scheduleStatus = (chunk as any).scheduleStatus as string || 'new';
        if (scheduleStatus === 'done' || scheduleStatus === 'suspended' || scheduleStatus === 'removed') continue;

        const nextRepDate = (chunk as any).nextRepDate as number || 0;
        const intervalDays = (chunk as any).intervalDays as number || 1;
        const priority = (chunk as any).priorityUi as number ?? (chunk as any).priorityEff as number ?? 5;
        const filePath = (chunk as any).filePath as string || '';
        const chunkId = (chunk as any).chunkId as string || '';


        const base = filePath?.split('/').pop() || chunkId;
        const title = base.replace(/\.md$/i, '').replace(/^\d+_/, '');

        let nextReviewDate: Date | null = null;
        let dateKey: string;

        if (nextRepDate > 0) {
          nextReviewDate = new Date(nextRepDate);
          dateKey = formatDateKey(nextReviewDate!);
        } else {

          dateKey = formatDateKey(now);
        }

        const rm = readingMaterials.find(m => m.filePath === filePath);

        const item: ScheduleItem = {
          id: chunkId,
          title,
          sourceFile: filePath,
          associatedNotePath: (chunk as any).meta?.associatedNotePath,
          associatedNoteScope: (chunk as any).meta?.associatedNotePath ? 'point' : undefined,
          resumeLink: rm?.resumeLink,
          priority,
          intervalDays,
          scheduleStatus,
          nextRepDate,
          nextReviewDate
        };

        if (!byDate.has(dateKey)) {
          byDate.set(dateKey, []);
        }
        byDate.get(dateKey)!.push(item);
      }

      try {
        const pdfService = await getPdfBookmarkTaskService();
        const tasks = await pdfService.getAllTasks();
        for (const task of tasks) {
          const status = String(task.status || 'new');
          if (status === 'done' || status === 'suspended' || status === 'removed') continue;

          let dateKey: string;
          let nextReviewDate: Date | null = null;
          const nextRepDate = Number(task.nextRepDate || 0);
          if (nextRepDate > 0) {
            nextReviewDate = new Date(nextRepDate);
            dateKey = formatDateKey(nextReviewDate!);
          } else {
            dateKey = formatDateKey(now);
          }

          const pdfFullTitle = String(task.title || '').trim() || 'PDF';
          const item: ScheduleItem = {
            id: task.id,
            title: pdfFullTitle,
            displayName: extractPdfHeading(pdfFullTitle),
            sourceFile: task.pdfPath,
            associatedNotePath: task.meta?.associatedNotePath,
            associatedNoteScope: task.meta?.associatedNotePath ? 'point' : undefined,
            resumeLink: task.link,
            priority: Number(task.priorityUi ?? task.priorityEff ?? 5),
            intervalDays: Number(task.intervalDays ?? 1),
            scheduleStatus: status,
            nextRepDate,
            nextReviewDate
          };

          if (!byDate.has(dateKey)) {
            byDate.set(dateKey, []);
          }
          byDate.get(dateKey)!.push(item);
        }
      } catch (e) {
        logger.warn('[IRCalendarSidebar] Failed to build PDF reading calendar data', e);
      }

      try {
        const epubService = await getEpubBookmarkTaskService();
        const epubTasks = await epubService.getAllTasks();
        for (const task of epubTasks) {
          const status = String(task.status || 'new');
          if (status === 'done' || status === 'suspended' || status === 'removed') continue;

          let dateKey: string;
          let nextReviewDate: Date | null = null;
          const nextRepDate = Number(task.nextRepDate || 0);
          if (nextRepDate > 0) {
            nextReviewDate = new Date(nextRepDate);
            dateKey = formatDateKey(nextReviewDate!);
          } else {
            dateKey = formatDateKey(now);
          }

          const resolvedFilePath = await resolveEpubTaskFilePath(task);
          const item: ScheduleItem = {
            id: task.id,
            title: String(task.title || '').trim() || 'EPUB',
            sourceFile: resolvedFilePath,
            associatedNotePath: task.meta?.associatedNotePath,
            associatedNoteScope: task.meta?.associatedNotePath ? 'point' : undefined,
            priority: Number(task.priorityUi ?? task.priorityEff ?? 5),
            intervalDays: Number(task.intervalDays ?? 1),
            scheduleStatus: status,
            nextRepDate,
            nextReviewDate
          };

          if (!byDate.has(dateKey)) {
            byDate.set(dateKey, []);
          }
          byDate.get(dateKey)!.push(item);
        }
      } catch (e) {
        logger.warn('[IRCalendarSidebar] Failed to build EPUB reading calendar data', e);
      }

      materialsByDate = byDate;
      await refreshReadingPointTagMap(byDate);
      await loadTimerTotalsFromHistory();

      logger.debug('[IRCalendarSidebar] Recovered debug message.', {
        chunks: chunks.length,
        dates: materialsByDate.size
      });
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
    } finally {
      isLoading = false;
    }
    */
  }

  onMount(() => {
    applyCalendarSidebarSettingsFromPlugin();
    restoreTimerRuntimeState();
    void refreshSidebarData();


    const handleDataUpdate = (event: Event) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      const detail = (event as CustomEvent<UpdatedEventDetail>).detail;
      debounceTimer = setTimeout(async () => {
        const generatedAt = detail?.generatedAt ?? 0;
        if (
          generatedAt > 0 &&
          (generatedAt === pendingLocalRefreshGeneratedAt ||
            generatedAt <= lastLocallyHandledBroadcastGeneratedAt)
        ) {
          return;
        }

        if (
          !loadDataInFlight &&
          generatedAt > 0 &&
          generatedAt <= lastAppliedScheduleGeneratedAt
        ) {
          return;
        }

        const previouslyExpanded = new Set(expandedMaterialIds);
        siblingCache = new Map();
        await refreshSidebarData();


        if (previouslyExpanded.size > 0) {
          const todayKey = formatDateKey(selectedDate);
          const todayItems = materialsByDate.get(todayKey) || [];
          for (const item of todayItems) {
            if (previouslyExpanded.has(item.id)) {
              const siblings = await getSiblingMaterials(item);
              const next = new Map(siblingCache);
              next.set(item.id, siblings);
              siblingCache = next;
            }
          }
        }
      }, 100);
    };
    window.addEventListener('Weave:ir-data-updated', handleDataUpdate);
    const handleMaterialFinished = (event: Event) => {
      const detail = (event as CustomEvent<IRMaterialFinishedEventDetail>).detail;
      if (!detail?.blockId) return;
      const currentBlockId = detail.blockId;

      void (async () => {
        const shouldAutoStartNextTimer =
          autoStartNextTimerEnabled &&
          detail.autoStartNextTimer === true &&
          shouldContinueAutoTimerChainForBlock(currentBlockId);
        await pauseActiveReadingTimer(detail.reason === 'skipped' ? 'skipped' : 'completed', currentBlockId);

        if (!shouldAutoStartNextTimer || !detail.nextBlockId) {
          clearAutoTimerChain();
          return;
        }

        const nextMaterial = detail.nextMaterial ?? findScheduleItemById(detail.nextBlockId);
        if (!nextMaterial) {
          logger.warn('[IRCalendarSidebar] No next material available for continuous reading', detail);
          clearAutoTimerChain();
          return;
        }

        const started = await startReadingTimerWithRetry(nextMaterial, { announceStart: false, retries: 4 });
        if (!started) {
          clearAutoTimerChain();
        } else {
          armAutoTimerChain(nextMaterial.id);
        }
      })();
    };
    window.addEventListener('Weave:ir-material-finished', handleMaterialFinished as EventListener);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('Weave:ir-data-updated', handleDataUpdate);
      window.removeEventListener('Weave:ir-material-finished', handleMaterialFinished as EventListener);
    };
  });


  let monthDays = $derived(getMonthDays(currentDate.getFullYear(), currentDate.getMonth()));
  let unfilteredSelectedMaterials = $derived(getSelectedMaterialsBase());
  let selectedMaterials = $derived(getSelectedMaterials());
  let selectedDateTagOptions = $derived(getSelectedDateTagOptions());
  let monthNumber = $derived(currentDate.getMonth() + 1);
  let monthYear = $derived(currentDate.getFullYear());
</script>

<div class="ir-calendar-sidebar">
  <!-- Incremental reading calendar sidebar -->
  <div class="calendar-header">
    <div class="calendar-title-group">
      <span class="month-title">
        <span class="month-title__month">{monthNumber}</span>
        <span class="month-title__year">{monthYear}</span>
      </span>
    </div>
    <div class="month-nav" aria-label="Month navigation">
      <button
        class="calendar-tool-btn clickable-icon nav-btn"
        type="button"
        onclick={prevMonth}
        aria-label="Previous month"
        title="Previous month"
      >
        <ObsidianIcon name="chevron-left" size={14} />
      </button>
      <button class="today-btn clickable-icon" type="button" onclick={goToToday} title="Today">Today</button>
      <button
        class="calendar-tool-btn clickable-icon nav-btn"
        type="button"
        onclick={nextMonth}
        aria-label="Next month"
        title="Next month"
      >
        <ObsidianIcon name="chevron-right" size={14} />
      </button>
    </div>
    <div class="calendar-tools">
      <button
        class="calendar-tool-btn clickable-icon"
        type="button"
        onclick={openAnalyticsModal}
        title="Open analytics"
        aria-label="Open analytics"
      >
        <ObsidianIcon name="bar-chart-2" size={16} />
      </button>
      <button
        class="calendar-tool-btn clickable-icon"
        type="button"
        onclick={openImportModal}
        title="Import materials"
        aria-label="Import materials"
      >
        <ObsidianIcon name="folder-input" size={16} />
      </button>
    </div>
  </div>


  <div class="calendar-grid-container">
    <div class="weekdays">
      <span class="weekday weekend">Sun</span>
      <span class="weekday">Mon</span>
      <span class="weekday">Tue</span>
      <span class="weekday">Wed</span>
      <span class="weekday">Thu</span>
      <span class="weekday">Fri</span>
      <span class="weekday weekend">Sat</span>
    </div>
    <div class="calendar-grid">
      {#each monthDays as { date, otherMonth }}
        {@const isToday = isSameDay(date, today)}
        {@const isSelected = isSameDay(date, selectedDate)}
        {@const heatLevel = getHeatLevel(date)}
        {@const dayState = getCalendarDayVisualState(date)}
        <button
          class="day-cell"
          class:other-month={otherMonth}
          class:today={isToday}
          class:selected={isSelected}
          class:has-tasks={dayState.hasTasks}
          class:fully-completed={dayState.isFullyCompleted}
          class:partially-completed={dayState.isPartiallyCompleted}
          class:today-pending={dayState.isTodayPending}
          class:overdue-pending={dayState.isOverduePending}
          onclick={() => selectDay(date)}
          title={getCalendarDayCellTitle(dayState)}
        >
          <span class="day-surface" aria-hidden="true"></span>
          {#if dayState.isFullyCompleted}
            <span class="day-complete-icon" aria-hidden="true">
              <ObsidianIcon name="check" size={14} />
            </span>
          {:else}
            <span class="day-number">{date.getDate()}</span>
          {/if}
          {#if dayState.hasTasks && !dayState.isFullyCompleted}
            <span
              class="day-status-chip"
              class:neutral={!dayState.isTodayPending && !dayState.isOverduePending}
              class:warn={dayState.isTodayPending}
              class:danger={dayState.isOverduePending}
              aria-hidden="true"
            >
              {#if dayState.isOverduePending}
                <ObsidianIcon name="x" size={10} />
              {:else}
                <span class="day-status-dot"></span>
              {/if}
            </span>
          {/if}
          <span class="heat-dot-row" aria-hidden="true">
            {#each getHeatDots(date) as dotIndex}
              <span class="heat-dot level-{heatLevel}" data-dot-index={dotIndex}></span>
            {/each}
          </span>
        </button>
      {/each}
    </div>
  </div>


  <div class="reading-list">
    {#if isLoading}
      <div class="loading-state">
        <ObsidianIcon name="loader" size={20} />
        <span>Loading reading materials...</span>
      </div>
    {:else if selectedMaterials.length > 0}
      {#each selectedMaterials as material, index}
        {@const priority = material.priority || 0}
        {@const priorityClass = priority >= 8 ? 'high' : priority >= 4 ? 'medium' : 'low'}
        {@const isExpanded = expandedMaterialIds.has(material.id)}
        {@const isLoadingSibling = loadingSiblings.has(material.id)}
        {@const siblings = siblingCache.get(material.id) || []}
        <div class="reading-item-wrapper">
          <div class="reading-item">
            {#if continuousReadingEnabled}
              <button
                class="expand-btn"
                class:expanded={isExpanded}
                class:loading={isLoadingSibling}
                aria-label={getMaterialExpandButtonLabel(isExpanded)}
                onclick={() => toggleMaterialExpand(material)}
              >
                {#if isLoadingSibling}
                  <ObsidianIcon name="loader" size={12} />
                {:else}
                  <ObsidianIcon name="chevron-right" size={12} />
                {/if}
              </button>
            {/if}
            <div class="reading-item-content">
              <button
                class="reading-item-main"
                onclick={() => handleMaterialClick(material)}
                oncontextmenu={(e) => handleMaterialContextMenu(e, e.currentTarget as unknown as HTMLElement, material)}
                onpointerdown={(e) => handleLongPressStart(e, e.currentTarget as unknown as HTMLElement, material)}
                onpointermove={handleLongPressMove}
                onpointerup={handleLongPressEnd}
                onpointercancel={handleLongPressEnd}
              >
                <span class="item-rank" class:top={index < 3}>{index + 1}</span>
                <span class="item-text">
                  <span class="item-title" class:processed={processedChunkIds.has(material.id)}>{material.displayName || material.title || 'Untitled'}</span>
                </span>
              </button>
            </div>
            <div class="reading-item-controls">
              <button
                class="schedule-checkbox"
                aria-label="Adjust schedule"
                onclick={(e) => openSchedulingMenu(e, material)}
              >
                <span class="checkbox-box" class:checked={processedChunkIds.has(material.id)} aria-hidden="true"></span>
              </button>
              {#if hasVisibleAssociatedNote(material)}
                <button
                  type="button"
                  class="associated-note-link"
                  aria-label={getAssociatedNoteActionLabel(material)}
                  title={getAssociatedNoteActionTooltip(material)}
                  oncontextmenu={(event) => handleMaterialContextMenu(event, event.currentTarget as HTMLElement, material)}
                  onclick={(event) => handleAssociatedNoteClick(event, material)}
                >
                  <span>Note</span>
                </button>
              {/if}
              <button
                class="reading-timer-btn"
                class:active={isTimerRunningForBlock(material.id)}
                class:tracked={!isTimerRunningForBlock(material.id) && getDisplayedTimerSeconds(material.id) > 0}
                aria-label={isTimerRunningForBlock(material.id) ? 'Pause timer' : 'Start timer'}
                title={getReadingTimerButtonTitle(material.id)}
                disabled={timerBusyBlockId === material.id}
                onclick={(event) => {
                  void toggleReadingTimer(material);
                }}
              >
                <ObsidianIcon name={isTimerRunningForBlock(material.id) ? 'pause' : 'timer'} size={12} />
              </button>
              {#if getDisplayedTimerSeconds(material.id) > 0}
                <span
                  class="reading-timer-chip"
                  class:active={isTimerRunningForBlock(material.id)}
                  class:tracked={!isTimerRunningForBlock(material.id)}
                  title={'Tracked reading time: ' + formatTimerDuration(getDisplayedTimerSeconds(material.id))}
                >
                  {formatCompactTimerDuration(getDisplayedTimerSeconds(material.id))}
                </span>
              {/if}
              <span class="priority-badge {priorityClass}">P{priority}</span>
            </div>
          </div>
          {#if continuousReadingEnabled && isExpanded && siblings.length > 0}
            <div class="sibling-list">
              {#each siblings as sibling}
                {@const sPriority = sibling.priority || 0}
                {@const sPriorityClass = sPriority >= 8 ? 'high' : sPriority >= 4 ? 'medium' : 'low'}
                {@const dueText = sibling.nextRepDate > 0 ? formatSiblingDueDate(sibling.nextRepDate) : 'No due date'}
                <div class="sibling-item">
                  <div class="sibling-item-content">
                    <button
                      class="sibling-item-main"
                      onclick={() => void openMaterial(sibling)}
                      oncontextmenu={(e) => handleMaterialContextMenu(e, e.currentTarget as unknown as HTMLElement, sibling)}
                      onpointerdown={(e) => handleLongPressStart(e, e.currentTarget as unknown as HTMLElement, sibling)}
                      onpointermove={handleLongPressMove}
                      onpointerup={handleLongPressEnd}
                      onpointercancel={handleLongPressEnd}
                      title={sibling.title || sibling.id}
                    >
                      <span class="sibling-title">{sibling.displayName || sibling.title || sibling.id}</span>
                      <span class="sibling-due">{dueText}</span>
                    </button>
                  </div>
                  <div class="reading-item-controls">
                    <button
                      class="schedule-checkbox"
                      aria-label="Adjust schedule"
                      onclick={(e) => openSchedulingMenu(e, sibling)}
                    >
                      <span class="checkbox-box" class:checked={processedChunkIds.has(sibling.id)} aria-hidden="true"></span>
                    </button>
                    {#if hasVisibleAssociatedNote(sibling)}
                      <button
                        type="button"
                        class="associated-note-link sibling-associated-note-link"
                        aria-label={getAssociatedNoteActionLabel(sibling)}
                        title={getAssociatedNoteActionTooltip(sibling)}
                        oncontextmenu={(event) => handleMaterialContextMenu(event, event.currentTarget as HTMLElement, sibling)}
                        onclick={(event) => handleAssociatedNoteClick(event, sibling)}
                      >
                        <span>Note</span>
                      </button>
                    {/if}
                    <button
                      class="reading-timer-btn"
                      class:active={isTimerRunningForBlock(sibling.id)}
                      class:tracked={!isTimerRunningForBlock(sibling.id) && getDisplayedTimerSeconds(sibling.id) > 0}
                      aria-label={isTimerRunningForBlock(sibling.id) ? 'Pause timer' : 'Start timer'}
                      title={getReadingTimerButtonTitle(sibling.id)}
                      disabled={timerBusyBlockId === sibling.id}
                      onclick={(event) => {
                        void toggleReadingTimer(sibling);
                      }}
                    >
                      <ObsidianIcon name={isTimerRunningForBlock(sibling.id) ? 'pause' : 'timer'} size={12} />
                    </button>
                    {#if getDisplayedTimerSeconds(sibling.id) > 0}
                      <span
                        class="reading-timer-chip"
                        class:active={isTimerRunningForBlock(sibling.id)}
                        class:tracked={!isTimerRunningForBlock(sibling.id)}
                        title={'Tracked reading time: ' + formatTimerDuration(getDisplayedTimerSeconds(sibling.id))}
                      >
                        {formatCompactTimerDuration(getDisplayedTimerSeconds(sibling.id))}
                      </span>
                    {/if}
                    <span class="priority-badge {sPriorityClass}">P{sPriority}</span>
                  </div>
                </div>
              {/each}
            </div>
          {:else if continuousReadingEnabled && isExpanded && siblings.length === 0}
            <div class="sibling-list">
              <div class="sibling-empty">No related materials</div>
            </div>
          {/if}
        </div>
      {/each}
    {:else if unfilteredSelectedMaterials.length > 0 && activeReadingTagFilter}
      <div class="loading-state">
        <ObsidianIcon name="tag" size={20} />
        <span>??????? #{activeReadingTagFilter} ????</span>
        <button type="button" class="clear-tag-filter-btn" onclick={() => { activeReadingTagFilter = ''; }}>??????</button>
      </div>
    {/if}
  </div>

  {#if activeReadingTimer}
    <div class="footer-timer-bar">
      <div class="footer-timer-info">
        <span class="footer-timer-kicker">Active timer</span>
        <span class="footer-timer-title" title={getActiveReadingTimerLabel()}>{getActiveReadingTimerLabel()}</span>
      </div>
      <div class="footer-timer-meta">
        <span class="footer-timer-value">{formatTimerDuration(getDisplayedTimerSeconds(activeReadingTimer.blockId))}</span>
        <button
          type="button"
          class="footer-timer-pause"
          onclick={() => void pauseActiveReadingTimer('manual')}
          title="Pause timer"
        >
          <ObsidianIcon name="pause" size={12} />
        </button>
      </div>
    </div>
  {/if}

</div>

<FloatingMenu
  bind:show={schedulingMenuOpen}
  anchor={schedulingMenuAnchor}
  placement="left-start"
  onClose={closeSchedulingMenu}
  class="ir-calendar-scheduling-menu"
>
  {#snippet children()}
    <div class="ir-calendar-scheduling-grid">
      {#each schedulingConfig as cfg}
        <button
          class="ir-calendar-scheduling-btn"
          style="--accent: {cfg.color}"
          onmouseenter={() => schedulingPreviewFocusAction = cfg.action}
          onclick={() => handleSchedulingAction(cfg.action)}
        >
          <span class="ir-calendar-scheduling-label">{cfg.label}</span>
        </button>
      {/each}
    </div>
    {#if showSchedulingPreview}
      <IRScheduleImpactPreviewPanel preview={schedulingPreviewByAction[schedulingPreviewFocusAction]} />
    {/if}
  {/snippet}
</FloatingMenu>

<FloatingMenu
  bind:show={priorityMenuOpen}
  anchor={priorityMenuAnchor}
  placement="left-start"
  onClose={closePriorityMenu}
  class="ir-calendar-priority-menu"
>
  {#snippet children()}
    {#if priorityMenuTarget}
      <div class="ir-calendar-priority-panel">
        <IRPrioritySlider
          value={priorityMenuTarget.priority ?? 5}
          expanded={prioritySliderExpanded}
          onToggle={() => {
            prioritySliderExpanded = !prioritySliderExpanded;
            if (!prioritySliderExpanded) closePriorityMenu();
          }}
          onPreview={handlePriorityPreview}
          onChange={handlePriorityUiChange}
        />
        <IRScheduleImpactPreviewPanel preview={priorityPreviewDetails} />
      </div>
    {/if}
  {/snippet}
</FloatingMenu>


{#if showAddReadingPointModal}
  <AddReadingPointModal
    {plugin}
    deckId={arpDeckId}
    pdfPath={arpPdfPath}
    parentTitle={arpParentTitle}
    onClose={() => { showAddReadingPointModal = false; }}
    onCreated={() => { showAddReadingPointModal = false; }}
  />
{/if}

<style>
  :global(.workspace-leaf-content[data-type="weave-ir-calendar-view"] > .view-content) {
    padding: 0;
    overflow: hidden;
    background: var(--weave-surface-background, var(--background-primary));
  }

  .ir-calendar-sidebar {

    --weave-ir-sidebar-surface-background: var(--weave-surface-background, var(--background-primary));
    --weave-ir-sidebar-elevated-background: var(--weave-surface-background, var(--background-primary));
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    height: 100%;
    min-height: 0;
    padding: 12px;
    background: var(--weave-ir-sidebar-surface-background);
    box-sizing: border-box;
    container-type: inline-size;
    overflow: hidden;
  }


  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 18px;
    min-width: 0;
  }

  .calendar-title-group {
    min-width: 0;
    flex: 1 1 auto;
  }

  .month-title {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    white-space: nowrap;
  }

  .month-title__month {
    font-size: 18px;
    font-weight: 560;
    line-height: 1;
    letter-spacing: -0.02em;
    color: color-mix(in srgb, var(--text-normal) 92%, white);
  }

  .month-title__year {
    font-size: 11px;
    font-weight: 650;
    line-height: 1;
    letter-spacing: 0;
    color: color-mix(in srgb, var(--color-orange) 58%, var(--text-normal));
  }

  .calendar-tool-btn {
    width: var(--clickable-icon-size, 32px);
    height: var(--clickable-icon-size, 32px);
    padding: 0;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--text-normal) 66%, transparent);
    border-radius: 999px;
    box-shadow: none;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
    transition:
      background-color 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
  }

  .calendar-tool-btn:hover {
    color: var(--text-normal);
    background: color-mix(in srgb, var(--background-modifier-hover) 78%, transparent);
  }

  .calendar-tool-btn:focus-visible {
    outline: 2px solid var(--background-modifier-border-focus, rgba(var(--interactive-accent-rgb), 0.22));
    outline-offset: 1px;
  }

  .calendar-tools {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .month-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    justify-content: center;
    min-width: 0;
    padding: 0 4px;
  }

  .nav-btn {
    color: color-mix(in srgb, var(--text-normal) 58%, transparent);
  }

  .today-btn {
    width: auto;
    min-width: 0;
    height: 22px;
    padding: 0 6px;
    border: none;
    background: transparent;
    box-shadow: none;
    color: color-mix(in srgb, var(--text-normal) 68%, transparent);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 560;
    line-height: 1;
    cursor: pointer;
    transition:
      background-color 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }

  .today-btn:hover {
    color: var(--text-normal);
    background: color-mix(in srgb, var(--background-modifier-hover) 78%, transparent);
  }

  .today-btn:focus-visible {
    outline: 2px solid var(--background-modifier-border-focus, rgba(var(--interactive-accent-rgb), 0.22));
    outline-offset: 1px;
  }


  .calendar-grid-container {
    background: transparent;
    border-radius: 0;
    padding: 0 0 8px;
    margin-bottom: 10px;
    min-width: 0;
    overflow: clip;
    box-sizing: border-box;
  }

  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 12px;
    min-width: 0;
  }

  .weekday {
    min-width: 0;
    text-align: center;
    font-size: 8px;
    font-weight: 540;
    letter-spacing: 0.01em;
    color: color-mix(in srgb, var(--text-muted) 96%, var(--text-normal));
    padding: 0;
  }

  .weekday.weekend {
    color: color-mix(in srgb, var(--color-orange) 26%, var(--text-muted));
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 14px;
    min-width: 0;
  }

  .day-cell {
    width: 100%;
    aspect-ratio: 1;
    min-width: 0;
    padding: 0;
    border: 0 !important;
    border-color: transparent !important;
    border-style: solid !important;
    border-width: 0 !important;
    border-image: none !important;
    background: transparent !important;
    border-radius: 0;
    box-shadow: none !important;
    filter: none !important;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    position: relative;
    transition:
      transform 0.18s ease,
      color 0.18s ease,
      opacity 0.18s ease;
  }

  .day-surface {
    position: absolute;
    top: calc(50% - 1px);
    left: 50%;
    width: 28px;
    height: 28px;
    transform: translate(-50%, -50%);
    border-radius: 999px;
    background: transparent;
    border: 1px solid transparent;
    pointer-events: none;
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }

  .day-cell:hover {
    background: transparent !important;
    transform: translateY(-1px);
  }

  .day-cell.other-month {
    opacity: 0.28;
  }

  .day-cell.selected {
    background: transparent !important;
  }

  .day-cell.has-tasks.selected .day-surface {
    background: color-mix(in srgb, var(--interactive-accent) 5%, transparent);
    border-color: color-mix(in srgb, var(--interactive-accent) 18%, transparent);
  }

  .day-cell.today-pending .day-surface {
    background: transparent;
    border-color: color-mix(in srgb, var(--color-orange) 22%, transparent);
  }

  .day-cell.has-tasks.today .day-surface,
  .day-cell.has-tasks.selected .day-surface {
    width: 28px;
    height: 28px;
  }

  .day-cell.overdue-pending .day-surface {
    background: transparent;
    border-color: transparent;
  }

  .day-cell.has-tasks.selected .day-number {
    color: color-mix(in srgb, var(--text-normal) 96%, white);
    font-weight: 620;
  }

  .day-cell.has-tasks.selected .heat-dot {
    transform: scale(1.05);
    opacity: 1;
  }

  .day-cell.has-tasks.today .day-number {
    font-weight: 580;
    color: color-mix(in srgb, var(--text-normal) 92%, white);
  }

  .day-cell.has-tasks.selected.today .day-number {
    color: color-mix(in srgb, var(--text-normal) 96%, white);
  }

  .day-cell:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--interactive-accent) 38%, transparent);
    outline-offset: 2px;
    border-radius: 6px;
  }

  .day-number {
    position: relative;
    z-index: 1;
    font-size: 13px;
    font-weight: 560;
    line-height: 1;
    letter-spacing: -0.01em;
    color: color-mix(in srgb, var(--text-normal) 86%, transparent);
    font-variation-settings: "wght" 500;
    text-shadow: none;
  }

  .day-complete-icon {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: color-mix(in srgb, var(--color-green) 88%, black);
  }

  .day-status-chip {
    position: relative;
    z-index: 1;
    min-width: auto;
    height: auto;
    padding: 0;
    border-radius: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 600;
    line-height: 1;
    color: var(--text-faint);
    background: transparent;
  }

  .day-status-chip.warn {
    color: color-mix(in srgb, var(--color-orange) 88%, black);
  }

  .day-status-chip.danger {
    color: color-mix(in srgb, var(--color-red) 88%, white);
  }

  .day-status-chip.neutral {
    color: var(--text-faint);
  }

  .day-status-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--text-muted) 62%, var(--background-modifier-border));
  }

  .heat-dot-row {
    position: relative;
    z-index: 1;
    min-height: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }


  .heat-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }

  .heat-dot.level-0 { background: color-mix(in srgb, var(--background-modifier-border) 72%, transparent); opacity: 0.35; }
  .heat-dot.level-1 { background: color-mix(in srgb, var(--color-green) 68%, white); opacity: 0.28; }
  .heat-dot.level-2 { background: color-mix(in srgb, var(--color-green) 80%, white); opacity: 0.42; }
  .heat-dot.level-3 { background: color-mix(in srgb, var(--color-yellow) 78%, white); opacity: 0.5; }
  .heat-dot.level-4 { background: color-mix(in srgb, var(--color-orange) 80%, white); opacity: 0.58; }
  .heat-dot.level-5 { background: color-mix(in srgb, var(--color-red) 80%, white); opacity: 0.64; }

  :global(.workspace-leaf-content[data-type="weave-ir-calendar-view"] .day-cell) {
    border: 0 !important;
    border-image: none !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  :global(.workspace-leaf-content[data-type="weave-ir-calendar-view"] .day-cell:hover) {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }


  .reading-tag-filter-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding: 0 0 8px;
    margin-bottom: 4px;
    scrollbar-width: none;
  }

  .reading-tag-filter-bar::-webkit-scrollbar {
    display: none;
  }

  .reading-tag-filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    border: 1px solid var(--background-modifier-border);
    background: var(--weave-ir-sidebar-elevated-background);
    color: var(--text-muted);
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }

  .reading-tag-filter-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--background-modifier-border) 78%, transparent);
    color: var(--text-faint);
    font-size: 10px;
    padding: 0 4px;
  }

  .reading-tag-filter-chip.active {
    border-color: color-mix(in srgb, var(--interactive-accent) 38%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--interactive-accent) 12%, var(--weave-ir-sidebar-surface-background));
    color: var(--interactive-accent);
  }


  .reading-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
    background: transparent;
    padding: 0;
    min-width: 0;
  }

  @container (max-width: 340px) {
    .ir-calendar-sidebar {
      padding: 8px;
    }

    .calendar-header {
      gap: 8px;
      margin-bottom: 8px;
    }

    .month-title {
      gap: 6px;
    }

    .month-title__month {
      font-size: 16px;
    }

    .month-title__year {
      font-size: 10px;
    }

    .calendar-tool-btn {
      width: 28px;
      height: 28px;
    }

    .month-nav {
      gap: 4px;
      padding: 0;
    }

    .today-btn {
      height: 28px;
      padding: 0 8px;
      font-size: 10px;
    }

    .calendar-grid-container {
      padding: 0 0 6px;
      margin-bottom: 6px;
    }

    .weekdays,
    .calendar-grid {
      gap: 6px;
    }

    .weekday {
      font-size: 8px;
    }

    .day-number {
      font-size: 11px;
    }

    .day-complete-icon {
      width: 16px;
      height: 16px;
    }

    .day-surface,
    .day-cell.has-tasks.today .day-surface,
    .day-cell.has-tasks.selected .day-surface {
      width: 24px;
      height: 24px;
      top: calc(50% - 1px);
    }

    .heat-dot {
      width: 4px;
      height: 4px;
    }
  }

  @container (max-width: 280px) {
    .ir-calendar-sidebar {
      padding: 6px;
    }

    .calendar-header {
      gap: 4px;
    }

    .month-title {
      gap: 4px;
    }

    .month-title__month {
      font-size: 14px;
    }

    .month-title__year {
      font-size: 10px;
    }

    .calendar-tool-btn {
      width: 26px;
      height: 26px;
    }

    .month-nav {
      gap: 3px;
    }

    .today-btn {
      height: 26px;
      padding: 0 5px;
      font-size: 9px;
    }

    .calendar-grid-container {
      padding: 0 0 4px;
    }

    .day-number {
      font-size: 10px;
    }

    .day-complete-icon {
      width: 14px;
      height: 14px;
    }

    .day-surface,
    .day-cell.has-tasks.today .day-surface,
    .day-cell.has-tasks.selected .day-surface {
      width: 22px;
      height: 22px;
      top: calc(50% - 1px);
    }
  }

  .footer-timer-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    margin-top: 8px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 32%, var(--background-modifier-border));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--interactive-accent) 8%, var(--weave-ir-sidebar-elevated-background)),
      var(--weave-ir-sidebar-surface-background)
    );
  }

  .footer-timer-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .footer-timer-kicker {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-faint);
  }

  .footer-timer-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .footer-timer-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .footer-timer-value {
    font-size: 12px;
    font-weight: 700;
    color: var(--interactive-accent);
    font-variant-numeric: tabular-nums;
  }

  .footer-timer-pause {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--background-modifier-border);
    border-radius: 7px;
    background: var(--weave-ir-sidebar-elevated-background);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .footer-timer-pause:hover {
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .reading-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 4px;
    background: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
    outline: none;
    text-align: left;
    width: 100%;
  }

  .reading-item:hover {
    background: var(--background-modifier-hover);
  }

  .reading-item-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .reading-item-main {
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: none;
    box-shadow: none;
    outline: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    width: 100%;
    min-width: 0;
  }

  .reading-item-main:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
    border-radius: 6px;
  }

  .item-text {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .item-text-content {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    width: 100%;
  }

  .item-tags {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .item-tag {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--weave-ir-sidebar-elevated-background));
    color: var(--interactive-accent);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
  }

  .item-tag.more {
    color: var(--text-muted);
    background: color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
  }

  .reading-item-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    flex-shrink: 0;
  }

  .associated-note-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 18px;
    padding: 0 6px;
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 38%, var(--background-modifier-border));
    border-radius: 6px;
    background: color-mix(in srgb, var(--interactive-accent) 12%, var(--weave-ir-sidebar-surface-background));
    box-shadow: none;
    color: var(--interactive-accent);
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
    flex-shrink: 0;
  }

  .associated-note-link:hover {
    color: var(--interactive-accent);
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 18%, var(--weave-ir-sidebar-surface-background));
  }

  .associated-note-link:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .associated-note-link span {
    display: block;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .schedule-checkbox {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .schedule-checkbox:hover .checkbox-box {
    border-color: color-mix(in srgb, var(--interactive-accent) 50%, var(--background-modifier-border));
  }

  .schedule-checkbox:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .checkbox-box {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    position: relative;
  }

  .checkbox-box.checked {
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 25%, var(--weave-ir-sidebar-elevated-background));
  }

  .checkbox-box.checked::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 4px;
    height: 8px;
    border-right: 2px solid var(--interactive-accent);
    border-bottom: 2px solid var(--interactive-accent);
    transform: rotate(45deg);
  }

  .reading-timer-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .reading-timer-btn:hover:not(:disabled) {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .reading-timer-btn.tracked {
    color: var(--interactive-accent);
  }

  .reading-timer-btn.active {
    color: var(--color-red);
    background: color-mix(in srgb, var(--color-red) 14%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-red) 20%, transparent);
  }

  .reading-timer-btn:disabled {
    opacity: 0.55;
    cursor: wait;
  }

  .reading-timer-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 42px;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 85%, transparent);
    background: color-mix(in srgb, var(--weave-ir-sidebar-elevated-background) 92%, transparent);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .reading-timer-chip.tracked {
    color: var(--interactive-accent);
    border-color: color-mix(in srgb, var(--interactive-accent) 32%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--interactive-accent) 9%, var(--weave-ir-sidebar-surface-background));
  }

  .reading-timer-chip.active {
    color: var(--color-red);
    border-color: color-mix(in srgb, var(--color-red) 35%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--color-red) 10%, var(--weave-ir-sidebar-surface-background));
  }

  .item-rank {
    width: 18px;
    height: 18px;
    font-size: 10px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .item-rank.top {
    background: var(--color-orange);
    color: white;
  }

  .item-title {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .item-title.processed {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  .item-due {
    font-size: 10px;
    color: var(--text-faint);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ir-calendar-scheduling-menu {
    min-width: 220px;
  }

  .ir-calendar-scheduling-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 10px;
  }

  .ir-calendar-scheduling-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border: 1px solid transparent;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--weave-ir-sidebar-elevated-background) 92%, white 8%),
      var(--weave-ir-sidebar-elevated-background)
    );
    border-radius: 10px;
    min-height: 54px;
    padding: 12px 10px;
    cursor: pointer;
    text-align: center;
    position: relative;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    outline: none;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  }

  .ir-calendar-scheduling-btn:hover {
    background: var(--background-modifier-hover);
    border-color: color-mix(in srgb, var(--accent) 38%, var(--background-modifier-border));
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  }

  .ir-calendar-scheduling-label {
    display: block;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-normal);
  }

  .priority-badge {
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .priority-badge.high {
    background: rgba(var(--color-red-rgb), 0.15);
    color: var(--color-red);
  }

  .priority-badge.medium {
    background: rgba(var(--color-yellow-rgb), 0.15);
    color: var(--color-yellow);
  }

  .priority-badge.low {
    background: rgba(var(--color-green-rgb), 0.15);
    color: var(--color-green);
  }

  .clear-tag-filter-btn {
    border: 1px solid var(--background-modifier-border);
    background: var(--weave-ir-sidebar-elevated-background);
    color: var(--text-muted);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 11px;
    cursor: pointer;
  }

  .clear-tag-filter-btn:hover {
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }


  .expand-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 3px;
    transition: transform 0.15s ease, color 0.15s ease;
  }

  .expand-btn:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .expand-btn.expanded {
    transform: rotate(90deg);
  }

  .expand-btn.loading {
    transform: none;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }


  .reading-item-wrapper {
    display: flex;
    flex-direction: column;
    background: none;
    border: none;
    box-shadow: none;
    outline: none;
  }


  .sibling-list {
    margin-left: 26px;
    padding-left: 10px;
    border-left: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 2px;
    margin-bottom: 4px;
  }

  .sibling-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    border: none;
    border-radius: 0;
    box-shadow: none;
    outline: none;
    background: none;
  }

  .sibling-item:hover {
    background: var(--background-modifier-hover);
  }

  .sibling-item-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sibling-item-main {
    display: flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: none;
    box-shadow: none;
    outline: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    flex: 1;
    min-width: 0;
  }

  .sibling-associated-note-link {
    min-width: 34px;
  }

  .sibling-title {
    flex: 1;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .sibling-due {
    font-size: 10px;
    color: var(--text-faint);
    flex-shrink: 0;
    margin-left: 4px;
  }

  .sibling-empty {
    font-size: 11px;
    color: var(--text-faint);
    padding: 4px 0;
  }
</style>
