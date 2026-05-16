<script lang="ts">
  /** IR calendar sidebar state and interactions. */
  import { onDestroy, onMount, tick } from 'svelte';
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
  import { EpubStorageService } from '../../services/epub-integration/EpubStorageService';
  import { EPUB_RUNTIME } from '../../services/epub-integration';
  import { IRPointWriteService, type IRPointWriteTarget } from '../../services/incremental-reading/IRPointWriteService';
  import { IRPointTagService, normalizeReadingPointTags } from '../../services/incremental-reading/IRPointTagService';
  import { IRV4SchedulerService } from '../../services/incremental-reading/IRV4SchedulerService';
  import { getSharedIRCalendarQueryService } from '../../services/incremental-reading/IRCalendarQueryService';
  import {
    buildScheduleItemFromChunkData,
    buildScheduleItemFromEpubTask,
    buildScheduleItemFromLegacyBlock,
    buildScheduleItemFromPdfTask,
    type ScheduleItem
  } from '../../services/incremental-reading/IRCalendarScheduleItem';
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
  import {
    IRContinueReadingSuggestionsModalObsidian,
    type IRContinueReadingSuggestionModalItem,
    type IRContinueReadingSuggestionsModalObsidianOptions
  } from './IRContinueReadingSuggestionsModalObsidian';
  import IRBlockInfoModal from './IRBlockInfoModal.svelte';
  import IRReviewReminderModal from './IRReviewReminderModal.svelte';
  import { MarkdownFileSuggestModal } from '../../modals/MarkdownFileSuggestModal';
  import { VaultFileSuggestModal } from '../../modals/VaultFileSuggestModal';
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
  import { findOpenEpubLeaf } from '../../utils/epub-leaf-utils';
  import { logger } from '../../utils/logger';
  import { listVaultFiles } from '../../utils/vault-file-list';
  import { currentLanguage, tr } from '../../utils/i18n';
  import { getChunkTopicIds, getTaskTopicId } from '../../utils/ir-topic-compat';
  import { showObsidianConfirm, showObsidianInput } from '../../utils/obsidian-confirm';
  import { showMissingSourceDocumentModal } from './MissingSourceDocumentModal';
  import { IRMonitoringService } from '../../services/incremental-reading/IRMonitoringService';
  import { SourceNavigationService } from '../../services/ui/SourceNavigationService';
  import {
    getCanvasNodeIdFromSourceLink,
    getCanvasSourceNodeRectFromSourceLink
  } from '../../services/ui/canvas-source-locate';
  import type { IRCalendarSidebarSettings } from '../../types/plugin-settings.d';
  import type { Deck } from '../../data/types';
  import type { IRCalendarMaterialListProps } from './ir-calendar-sidebar-types';
  import {
    getIRCalendarTimerRuntimeState,
    setIRCalendarTimerRuntimeState,
    type IRCalendarActiveReadingTimerState
  } from '../../stores/ir-calendar-timer-store';
  import CardSearchInput from '../search/CardSearchInput.svelte';
  import { parseSearchQuery, type SearchQuery } from '../../utils/search-parser';
  import { buildMonthCalendarDays, IR_CALENDAR_WEEKDAY_KEYS } from './ir-calendar-date';
  import IRCalendarMaterialList from './IRCalendarMaterialList.svelte';
  import { populateCalendarBackgroundWallMenu } from './ir-calendar-tools-menu';

  interface Props {
    plugin: AnkiObsidianPlugin;
    initialDeckId?: string;
    initialDeckName?: string;
    sourceFilePath?: string;
  }

  interface IRMaterialFinishedEventDetail {
    blockId?: string;
    reason?: 'completed' | 'skipped';
    nextBlockId?: string;
    nextMaterial?: ScheduleItem | null;
    autoStartNextTimer?: boolean;
  }

  const DEFAULT_CALENDAR_BACKGROUND_WALL_FADE_PERCENT = 72;

  const DEFAULT_CALENDAR_SIDEBAR_SETTINGS: Required<IRCalendarSidebarSettings> = {
    continuousReadingEnabled: false,
    autoStartNextTimerEnabled: false,
    showSchedulingPreview: false,
    calendarViewMode: 'full',
    showMaterialTimers: true,
    backgroundWall: {
      imagePath: '',
      fadePercent: DEFAULT_CALENDAR_BACKGROUND_WALL_FADE_PERCENT
    }
  };
  const CALENDAR_BACKGROUND_WALL_IMAGE_EXTENSIONS = new Set([
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'svg',
    'bmp',
    'avif'
  ]);

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

  let {
    plugin,
    initialDeckId = '',
    initialDeckName = '',
    sourceFilePath = ''
  }: Props = $props();
  let t = $derived($tr);
  const isChineseUi = $derived($currentLanguage === 'zh-CN');

  function uiText(zh: string, en: string): string {
    return isChineseUi ? zh : en;
  }


  let currentDate = $state(new Date());
  let selectedDate = $state(new Date());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  const SUSPENDED_READING_POINT_TAG_KEYS = new Set([
    '搁置',
    '已搁置',
    '暂停',
    '已暂停',
    '挂起',
    '已挂起',
    'suspend',
    'suspended',
    'archive',
    'archived'
  ]);


  let irDecks = $state<IRDeck[]>([]);
  let allBlocks = $state<IRBlock[]>([]);
  let isLoading = $state(true);

  let readingMaterials = $state<ReadingMaterial[]>([]);


  let materialsByDate = $state<Map<string, ScheduleItem[]>>(new Map());
  let pinnedByDate = $state<Map<string, ScheduleItem[]>>(new Map());
  let continueReadingSuspendedItemsPool = $state<ScheduleItem[]>([]);
  let processedChunkIds = $state(new Set<string>());
  let calendarProgressByDate = $state<Record<string, string[]>>({});
  let irStorage = $state<IRStorageService | null>(null);
  let chunkScheduleAdapter = $state<IRChunkScheduleAdapter | null>(null);
  let pdfBookmarkTaskService = $state<IRPdfBookmarkTaskService | null>(null);
  let epubBookmarkTaskService = $state<IREpubBookmarkTaskService | null>(null);
  let epubStorageService = $state<EpubStorageService | null>(null);
  let pointTagService = $state<IRPointTagService | null>(null);
  let pointWriteService = $state<IRPointWriteService | null>(null);
  let readingPointTagsById = $state<Record<string, string[]>>({});
  let activeReadingTagFilter = $state('');
  let showSearchPanel = $state(false);
  let calendarBackgroundWallImagePath = $state('');
  let calendarBackgroundWallImageUrl = $state('');
  let calendarBackgroundWallFadePercent = $state<number>(DEFAULT_CALENDAR_BACKGROUND_WALL_FADE_PERCENT);
  let searchQuery = $state('');
  let parsedSearchQuery = $state<SearchQuery | null>(null);
  let continueReadingActionIds = $state(new Set<string>());
  let continueReadingResolvedTitleById = $state<Record<string, string>>({});
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
  let continueReadingSuggestionsModalInstance: IRContinueReadingSuggestionsModalObsidian | null = null;
  let continueReadingSuggestionsModalOpenSignature = $state('');
  let continueReadingSuggestionsModalDismissedSignature = $state('');
  let continueReadingSuggestionsModalCloseReason = $state<'dismiss' | 'action' | 'refresh'>('dismiss');
  let calendarSidebarEl = $state<HTMLDivElement | null>(null);
  let continueReadingTriggerEl = $state<HTMLButtonElement | null>(null);
  let calendarToolsTriggerEl = $state<HTMLButtonElement | null>(null);


  let showAddReadingPointModal = $state(false);
  let arpDeckId = $state('');
  let arpPdfPath = $state('');
  let arpParentTitle = $state('');

  let continuousReadingEnabled = $state(false);

  let showSchedulingPreview = $state(false);
  let calendarViewMode = $state<'full' | 'two-row'>('full');
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

  function getCalendarQueryService() {
    return getSharedIRCalendarQueryService(plugin.app);
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
      activeReadingTimer: activeReadingTimer ? { ...activeReadingTimer } : null
    });
  }

  function restoreTimerRuntimeState(): void {
    const runtimeState = getIRCalendarTimerRuntimeState();
    activeReadingTimer = runtimeState.activeReadingTimer
      ? { ...runtimeState.activeReadingTimer }
      : null;
    timerNowMs = Date.now();

    if (activeReadingTimer) {
      ensureTimerTicker();
    } else {
      clearTimerTicker();
    }
  }

  async function removeLocalMaterialReferences(materialId: string): Promise<void> {
    const normalizedId = String(materialId || '').trim();
    if (!normalizedId) {
      return;
    }

    const filterMapItems = (input: Map<string, ScheduleItem[]>): Map<string, ScheduleItem[]> => {
      const next = new Map<string, ScheduleItem[]>();
      for (const [dateKey, items] of input.entries()) {
        const filtered = items.filter((item) => item.id !== normalizedId);
        if (filtered.length > 0) {
          next.set(dateKey, filtered);
        }
      }
      return next;
    };

    materialsByDate = filterMapItems(materialsByDate);
    pinnedByDate = filterMapItems(pinnedByDate);
    siblingCache = filterMapItems(siblingCache);

    processedChunkIds = new Set(Array.from(processedChunkIds).filter((id) => id !== normalizedId));

    const nextCalendarProgress: Record<string, string[]> = {};
    for (const [dateKey, ids] of Object.entries(calendarProgressByDate)) {
      const filtered = ids.filter((id) => id !== normalizedId);
      if (filtered.length > 0) {
        nextCalendarProgress[dateKey] = filtered;
      }
    }
    calendarProgressByDate = nextCalendarProgress;

    const storage = await getStorage();
    await storage.removeCalendarCompletion(normalizedId);
  }

  function getCalendarSidebarSettings(): Required<IRCalendarSidebarSettings> {
    const raw = typeof plugin.getIRCalendarSidebarSettings === 'function'
      ? plugin.getIRCalendarSidebarSettings()
      : plugin.settings?.incrementalReading?.calendarSidebar;
    return {
      ...DEFAULT_CALENDAR_SIDEBAR_SETTINGS,
      ...(raw || {}),
      backgroundWall: {
        ...DEFAULT_CALENDAR_SIDEBAR_SETTINGS.backgroundWall,
        ...(raw?.backgroundWall || {})
      }
    };
  }

  function applyCalendarSidebarSettingsFromPlugin(): void {
    const settings = getCalendarSidebarSettings();
    continuousReadingEnabled = settings.continuousReadingEnabled;
    showSchedulingPreview = settings.showSchedulingPreview;
    calendarViewMode = settings.calendarViewMode;
    updateCalendarBackgroundWallState(settings.backgroundWall?.imagePath || '');
    calendarBackgroundWallFadePercent = normalizeCalendarBackgroundWallFadePercent(settings.backgroundWall?.fadePercent);

    if (!continuousReadingEnabled) {
      expandedMaterialIds = new Set();
    }
  }

  async function saveCalendarSidebarSettings(patch: Partial<IRCalendarSidebarSettings>): Promise<void> {
    const currentSettings = getCalendarSidebarSettings();

    const nextSettings: IRCalendarSidebarSettings = {
      ...currentSettings,
      ...patch,
      backgroundWall: {
        ...(currentSettings.backgroundWall || {}),
        ...(patch.backgroundWall || {})
      }
    };

    if (typeof plugin.saveIRCalendarSidebarSettings === 'function') {
      await plugin.saveIRCalendarSidebarSettings(nextSettings);
      return;
    }

    if (!plugin.settings.incrementalReading) {
      plugin.settings.incrementalReading = {};
    }

    plugin.settings.incrementalReading.calendarSidebar = nextSettings;
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
      new Notice(t('irSidebar.notices.settingsSaveFailed'));
    }
  }

  async function setCalendarBackgroundWallFadePercent(fadePercent: number): Promise<void> {
    const nextFadePercent = normalizeCalendarBackgroundWallFadePercent(fadePercent);
    const previousFadePercent = calendarBackgroundWallFadePercent;
    calendarBackgroundWallFadePercent = nextFadePercent;

    try {
      await saveCalendarSidebarSettings({
        backgroundWall: {
          fadePercent: nextFadePercent
        }
      });
      new Notice(t('irSidebar.notices.backgroundWallFadeSet'));
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Failed to save calendar background wall fade percent:', error);
      calendarBackgroundWallFadePercent = previousFadePercent;
      new Notice(t('irSidebar.notices.settingsSaveFailed'));
    }
  }

  async function promptCalendarBackgroundWallFadePercent(): Promise<void> {
    const input = await showObsidianInput(
      plugin.app,
      t('irSidebar.header.backgroundWallFadePrompt'),
      String(calendarBackgroundWallFadePercent),
      {
        title: t('irSidebar.header.backgroundWallFadeTitle'),
        placeholder: t('irSidebar.header.backgroundWallFadePlaceholder'),
        confirmText: t('irSidebar.header.backgroundWallFadeSet', { value: Number(calendarBackgroundWallFadePercent) })
      }
    );

    if (input === null) {
      return;
    }

    const trimmed = String(input || '').trim();
    if (!/^\d+$/.test(trimmed)) {
      new Notice(t('irSidebar.notices.backgroundWallFadeInvalid'));
      return;
    }

    const value = Number(trimmed);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      new Notice(t('irSidebar.notices.backgroundWallFadeInvalid'));
      return;
    }

    await setCalendarBackgroundWallFadePercent(value);
  }

  async function setCalendarViewMode(nextMode: 'full' | 'two-row'): Promise<void> {
    calendarViewMode = nextMode;

    try {
      await saveCalendarSidebarSettings({ calendarViewMode: nextMode });
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Failed to save calendar view mode:', error);
      new Notice(t('irSidebar.notices.settingsSaveFailed'));
    }
  }

  async function setShowSchedulingPreviewEnabled(enabled: boolean): Promise<void> {
    showSchedulingPreview = enabled;

    try {
      await saveCalendarSidebarSettings({ showSchedulingPreview: enabled });
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Failed to save preview setting:', error);
      new Notice(t('irSidebar.notices.settingsSaveFailed'));
    }
  }

  function isCalendarBackgroundWallImageFile(file: TFile | null | undefined): file is TFile {
    if (!(file instanceof TFile)) {
      return false;
    }
    return CALENDAR_BACKGROUND_WALL_IMAGE_EXTENSIONS.has(String(file.extension || '').toLowerCase());
  }

  function normalizeCalendarBackgroundWallFadePercent(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_CALENDAR_BACKGROUND_WALL_FADE_PERCENT;
    }
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }

  function getCalendarBackgroundWallImageFiles(): TFile[] {
    return listVaultFiles(plugin.app.vault, (file) => isCalendarBackgroundWallImageFile(file))
      .sort((left, right) => {
        const timeDelta = Number(right.stat?.mtime || 0) - Number(left.stat?.mtime || 0);
        if (timeDelta !== 0) {
          return timeDelta;
        }
        return left.path.localeCompare(right.path, 'zh-CN');
      });
  }

  function resolveCalendarBackgroundWallImageUrl(imagePath: string): string {
    const normalizedPath = normalizePath(String(imagePath || '').trim());
    if (!normalizedPath) {
      return '';
    }

    const abstractFile = plugin.app.vault.getAbstractFileByPath(normalizedPath);
    const file = abstractFile instanceof TFile ? abstractFile : null;
    if (!isCalendarBackgroundWallImageFile(file)) {
      return '';
    }

    try {
      return plugin.app.vault.getResourcePath(file);
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Failed to resolve calendar background wall image URL:', error);
      return '';
    }
  }

  function updateCalendarBackgroundWallState(imagePath: string): void {
    calendarBackgroundWallImagePath = normalizePath(String(imagePath || '').trim());
    calendarBackgroundWallImageUrl = resolveCalendarBackgroundWallImageUrl(calendarBackgroundWallImagePath);
  }

  async function chooseCalendarBackgroundWallImage(): Promise<void> {
    const picker = new VaultFileSuggestModal(plugin.app, {
      placeholder: t('irSidebar.header.backgroundWallPickerPlaceholder'),
      files: getCalendarBackgroundWallImageFiles(),
      icon: 'image',
      showFileIcon: false,
      showFilePath: false,
      anchorRect: calendarToolsTriggerEl?.getBoundingClientRect() ?? undefined,
      preferredWidth: 540
    });

    const file = await picker.openAndSelect();
    if (!file) {
      return;
    }

    const nextPath = normalizePath(file.path);
    updateCalendarBackgroundWallState(nextPath);

    try {
      await saveCalendarSidebarSettings({
        backgroundWall: {
          imagePath: nextPath
        }
      });
      new Notice(t('irSidebar.notices.backgroundWallSet'));
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Failed to save calendar background wall image:', error);
      updateCalendarBackgroundWallState(getCalendarSidebarSettings().backgroundWall?.imagePath || '');
      new Notice(t('irSidebar.notices.settingsSaveFailed'));
    }
  }

  async function clearCalendarBackgroundWallImage(): Promise<void> {
    updateCalendarBackgroundWallState('');

    try {
      await saveCalendarSidebarSettings({
        backgroundWall: {
          imagePath: ''
        }
      });
      new Notice(t('irSidebar.notices.backgroundWallCleared'));
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Failed to clear calendar background wall image:', error);
      updateCalendarBackgroundWallState(getCalendarSidebarSettings().backgroundWall?.imagePath || '');
      new Notice(t('irSidebar.notices.settingsSaveFailed'));
    }
  }

  function formatDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function parseDateKey(dateKey: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').trim());
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function handleSearch(query: string): void {
    searchQuery = query;
    parsedSearchQuery = query.trim() ? parseSearchQuery(query) : null;
  }

  function clearSearch(): void {
    searchQuery = '';
    parsedSearchQuery = null;
  }

  function toggleSearchPanel(): void {
    if (showSearchPanel) {
      showSearchPanel = false;
      clearSearch();
      return;
    }

    showSearchPanel = true;
  }

  function getRequestedDeckFilterId(): string {
    return String(initialDeckId || '').trim();
  }

  function getActiveDeckFilterId(): string {
    const requestedId = getRequestedDeckFilterId();
    return requestedId ? resolveCanonicalDeckId(requestedId) : '';
  }

  function getActiveDeckFilterName(): string {
    const activeDeckId = getActiveDeckFilterId();
    if (!activeDeckId) return '';
    const matchedDeck = irDecks.find((deck) => resolveCanonicalDeckId(deck.id) === activeDeckId);
    return matchedDeck?.name || String(initialDeckName || '').trim() || activeDeckId;
  }

  function matchesActiveDeckFilter(item: ScheduleItem): boolean {
    const activeDeckId = getActiveDeckFilterId();
    if (!activeDeckId) return true;
    return resolveCanonicalDeckId(item.deckId || '') === activeDeckId;
  }

  function getVisibleMaterialsForDate(dateKey: string): ScheduleItem[] {
    return (materialsByDate.get(dateKey) || []).filter(matchesActiveDeckFilter);
  }

  function getVisiblePinnedForDate(dateKey: string): ScheduleItem[] {
    return (pinnedByDate.get(dateKey) || []).filter(matchesActiveDeckFilter);
  }

  function matchesActiveTagFilter(material: ScheduleItem): boolean {
    const normalizedFilter = activeReadingTagFilter.trim().toLowerCase();
    if (!normalizedFilter) {
      return true;
    }

    return getMaterialTagLabels(material.id).some((tag) => tag.toLowerCase() === normalizedFilter);
  }

  function getScheduleItemDeckName(material: ScheduleItem): string {
    const deckId = resolveCanonicalDeckId(material.deckId || '');
    if (!deckId) {
      return '';
    }

    const matchedDeck = irDecks.find((deck) => resolveCanonicalDeckId(deck.id) === deckId);
    return String(matchedDeck?.name || '').trim();
  }

  function getScheduleItemSourceTFile(material: ScheduleItem): TFile | null {
    const abstractFile = plugin.app.vault.getAbstractFileByPath(String(material.sourceFile || '').trim());
    return abstractFile instanceof TFile ? abstractFile : null;
  }

  function getScheduleItemFrontmatter(material: ScheduleItem): Record<string, unknown> {
    const file = getScheduleItemSourceTFile(material);
    if (!file || file.extension !== 'md') {
      return {};
    }

    return (plugin.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined) || {};
  }

  function getReadingMaterialByPath(filePath: string): ReadingMaterial | undefined {
    const normalizedPath = normalizePath(String(filePath || '').trim());
    if (!normalizedPath) {
      return undefined;
    }

    return readingMaterials.find((material) => normalizePath(String(material.filePath || '').trim()) === normalizedPath);
  }

  function getScheduleItemCreatedDate(material: ScheduleItem): string {
    const readingMaterial = getReadingMaterialByPath(material.sourceFile);
    if (readingMaterial?.created) {
      return String(readingMaterial.created).slice(0, 10);
    }

    const file = getScheduleItemSourceTFile(material);
    return file ? new Date(file.stat.ctime).toISOString().slice(0, 10) : '';
  }

  function getScheduleItemModifiedDate(material: ScheduleItem): string {
    const readingMaterial = getReadingMaterialByPath(material.sourceFile);
    if (readingMaterial?.modified) {
      return String(readingMaterial.modified).slice(0, 10);
    }

    const file = getScheduleItemSourceTFile(material);
    return file ? new Date(file.stat.mtime).toISOString().slice(0, 10) : '';
  }

  function getScheduleItemDueDate(material: ScheduleItem): string {
    if (material.nextReviewDate instanceof Date && !Number.isNaN(material.nextReviewDate.getTime())) {
      return material.nextReviewDate.toISOString().slice(0, 10);
    }

    if (material.nextRepDate > 0) {
      return new Date(material.nextRepDate).toISOString().slice(0, 10);
    }

    return '';
  }

  function matchesDateRanges(
    dateValue: string,
    ranges: Array<{ from?: string; to?: string }>
  ): boolean {
    if (ranges.length === 0) {
      return true;
    }

    if (!dateValue) {
      return false;
    }

    return ranges.every((range) => {
      if (range.from && dateValue < range.from) return false;
      if (range.to && dateValue > range.to) return false;
      return true;
    });
  }

  function matchesAnyTokens(value: string, tokens: string[]): boolean {
    if (tokens.length === 0) {
      return true;
    }

    const normalizedValue = value.toLowerCase();
    return tokens.some((token) => normalizedValue.includes(token.toLowerCase()));
  }

  function excludesAllTokens(value: string, tokens: string[]): boolean {
    if (tokens.length === 0) {
      return true;
    }

    const normalizedValue = value.toLowerCase();
    return tokens.every((token) => !normalizedValue.includes(token.toLowerCase()));
  }

  function getScheduleItemSearchText(material: ScheduleItem): string {
    return [
      material.displayName,
      material.title,
      material.sourceFile,
      getVisibleAssociatedNotePath(material),
      getScheduleItemDeckName(material),
      ...getMaterialTagLabels(material.id)
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();
  }

  function matchesSearchQueryForMaterial(material: ScheduleItem, query: SearchQuery): boolean {
    if (!query.raw.trim()) {
      return true;
    }

    const deckName = getScheduleItemDeckName(material);
    const sourceFile = String(material.sourceFile || '');
    const tags = getMaterialTagLabels(material.id);
    const tagText = tags.join(' ').toLowerCase();
    const stateText = String(material.scheduleStatus || '').toLowerCase();
    const searchText = getScheduleItemSearchText(material);

    if (query.decks.length > 0 && !matchesAnyTokens(deckName, query.decks)) {
      return false;
    }

    if (query.tags.length > 0 && !query.tags.some((tag) => tagText.includes(tag.toLowerCase()))) {
      return false;
    }

    if (query.priorities.length > 0 && !query.priorities.includes(Number(material.priority || 0))) {
      return false;
    }

    if (query.sources.length > 0 && !matchesAnyTokens(sourceFile, query.sources)) {
      return false;
    }

    if (query.statuses.length > 0 && !query.statuses.some((status) => stateText.includes(status.toLowerCase()))) {
      return false;
    }

    if (query.states.length > 0 && !query.states.some((state) => stateText.includes(state.toLowerCase()))) {
      return false;
    }

    if (!matchesDateRanges(getScheduleItemCreatedDate(material), query.dateRanges)) {
      return false;
    }

    if (!matchesDateRanges(getScheduleItemModifiedDate(material), query.modifiedRanges)) {
      return false;
    }

    if (!matchesDateRanges(getScheduleItemDueDate(material), query.dueRanges)) {
      return false;
    }

    if (query.yamlFilters.length > 0) {
      const frontmatter = getScheduleItemFrontmatter(material);
      const matchesYaml = query.yamlFilters.every((filter) => {
        const rawValue = frontmatter[filter.key];
        if (rawValue === undefined || rawValue === null) {
          return false;
        }

        const valueText = Array.isArray(rawValue) ? rawValue.join(' ') : String(rawValue);
        return valueText.toLowerCase().includes(filter.value.toLowerCase());
      });
      if (!matchesYaml) {
        return false;
      }
    }

    if (!excludesAllTokens(deckName, query.excludeDecks)) {
      return false;
    }

    if (query.excludeTags.length > 0 && query.excludeTags.some((tag) => tagText.includes(tag.toLowerCase()))) {
      return false;
    }

    if (!excludesAllTokens(sourceFile, query.excludeSources)) {
      return false;
    }

    if (query.excludeStatuses.length > 0 && query.excludeStatuses.some((status) => stateText.includes(status.toLowerCase()))) {
      return false;
    }

    if (query.text.length > 0 && !query.text.every((text) => searchText.includes(text.toLowerCase()))) {
      return false;
    }

    if (query.excludeText.length > 0 && query.excludeText.some((text) => searchText.includes(text.toLowerCase()))) {
      return false;
    }

    return true;
  }

  function formatSearchResultDateLabel(dateKey: string): string {
    const parsed = parseDateKey(dateKey);
    if (!parsed) {
      return dateKey;
    }

    if (isSameDay(parsed, today)) {
      return uiText('今天', 'Today');
    }

    if (parsed.getFullYear() === today.getFullYear()) {
      return uiText(
        `${parsed.getMonth() + 1}月${parsed.getDate()}日`,
        `${parsed.getMonth() + 1}/${parsed.getDate()}`
      );
    }

    return uiText(
      `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日`,
      `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
    );
  }

  function getSearchableScheduleEntries(): SearchResultEntry[] {
    const merged = new Map<string, SearchResultEntry>();
    const appendEntries = (input: Map<string, ScheduleItem[]>) => {
      for (const [dateKey, items] of input.entries()) {
        for (const item of items) {
          if (!matchesActiveDeckFilter(item) || merged.has(item.id)) {
            continue;
          }

          merged.set(item.id, { item, dateKey });
        }
      }
    };

    appendEntries(materialsByDate);
    appendEntries(pinnedByDate);

    return Array.from(merged.values()).sort((left, right) => {
      const dateCompare = left.dateKey.localeCompare(right.dateKey);
      if (dateCompare !== 0) {
        return dateCompare;
      }

      const sequenceCompare = compareScheduleItemsWithinDay(left.item, right.item, left.dateKey);
      if (sequenceCompare !== 0) {
        return sequenceCompare;
      }

      return compareScheduleItemsDefault(left.item, right.item);
    });
  }

  function getMatchedSearchEntries(): SearchResultEntry[] {
    const query = parsedSearchQuery;
    if (!query?.raw.trim()) {
      return [];
    }

    return getSearchableScheduleEntries().filter(
      (entry) => matchesActiveTagFilter(entry.item) && matchesSearchQueryForMaterial(entry.item, query)
    );
  }

  function getDisplayedMaterialDateLabel(materialId: string, dateKeys: Map<string, string>): string {
    const dateKey = dateKeys.get(materialId);
    return dateKey ? formatSearchResultDateLabel(dateKey) : '';
  }

  function getSearchResultIdentityKey(material: ScheduleItem): string {
    const normalizedSource = normalizeSourcePathKey(material.sourceFile);
    if (normalizedSource) {
      return `${material.id}::${normalizedSource}`;
    }

    const title = String(material.title || '').trim();
    if (title) {
      return title;
    }

    return material.id;
  }

  function getScheduleItemLabel(material: ScheduleItem): string {
    const displayName = String(material.displayName || '').trim();
    if (displayName) {
      return displayName;
    }

    const title = String(material.title || '').trim();
    if (title) {
      return title;
    }

    const cachedResolvedTitle = String(continueReadingResolvedTitleById[material.id] || '').trim();
    if (cachedResolvedTitle) {
      return cachedResolvedTitle;
    }

    const sourceLabel = getSourceDisplayLabel(material.sourceFile);
    return sourceLabel || uiText('未命名阅读点', 'Untitled');
  }

  function getScheduleItemSourceLabel(material: ScheduleItem): string {
    if (isEpubBookmarkTaskId(material.id)) {
      return uiText('EPUB 源文件', 'EPUB source file');
    }

    if (isPdfBookmarkTaskId(material.id)) {
      return uiText('PDF 源文件', 'PDF source file');
    }

    return uiText('源文档', 'Source document');
  }

  async function showMissingSourceDocumentDialog(
    material: ScheduleItem,
    sourcePath?: string
  ): Promise<void> {
    const itemLabel = getScheduleItemLabel(material);
    const sourceLabel = getScheduleItemSourceLabel(material);
    const normalizedPath = String(sourcePath || material.sourceFile || '').trim();
    const messageLines = [
      uiText(
        `未找到阅读点「${itemLabel}」对应的${sourceLabel}。`,
        `The ${sourceLabel} for reading point "${itemLabel}" could not be found.`
      ),
      normalizedPath
        ? uiText(`记录路径：${normalizedPath}`, `Recorded path: ${normalizedPath}`)
        : uiText('当前阅读点没有可用的源文档路径记录。', 'This reading point has no usable source path recorded.'),
      uiText(
        '请检查源文档是否已被移动或删除；如果该阅读点已经失效，也可以清理它的相关增量阅读调度数据。',
        'Check whether the source file was moved or deleted. If this reading point is no longer valid, you can also clean up its incremental reading scheduling data.'
      )
    ];

    const action = await showMissingSourceDocumentModal(plugin.app, {
      title: uiText('源文档未找到', 'Source document not found'),
      message: messageLines,
      acknowledgeText: uiText('知道了', 'Got it'),
      removeButtonText: uiText('移除该阅读点', 'Remove this reading point'),
      removeDescription: uiText(
        '如果源文档已经不存在，可继续移除该阅读点并清理相关增量阅读调度数据。',
        'If the source file no longer exists, remove this reading point and clean up its incremental reading scheduling data.'
      ),
      onRemove: async () => {
        await removeMaterial(material, { sourceMissing: true });
      }
    });

    if (action === 'remove') {
      return;
    }
  }

  function isWeakContinueReadingLabel(label: string, material: ScheduleItem): boolean {
    const normalized = String(label || '').trim();
    if (!normalized) {
      return true;
    }

    if (/^untitled$/i.test(normalized)) {
      return true;
    }

    if (material.sourceType === 'chunk') {
      if (/^\d+_?$/.test(normalized)) {
        return true;
      }
      if (/^chunk-[a-z0-9-]+$/i.test(normalized)) {
        return true;
      }
    }

    return false;
  }

  function sanitizeContinueReadingPreviewText(rawText: string): string {
    const cleaned = String(rawText || '')
      .replace(/^#+\s*/, '')
      .replace(/^>\s*/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+\.\s+/, '')
      .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned.length > 60 ? `${cleaned.slice(0, 60).trim()}...` : cleaned;
  }

  async function deriveContinueReadingTitleFromChunkFile(material: ScheduleItem): Promise<string> {
    const normalizedPath = normalizePath(String(material.sourceFile || '').trim());
    if (!normalizedPath) {
      return '';
    }

    const file = plugin.app.vault.getAbstractFileByPath(normalizedPath);
    if (!(file instanceof TFile)) {
      return '';
    }

    try {
      const content = await plugin.app.vault.read(file);
      const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
      const lines = withoutFrontmatter.split(/\r?\n/);

      for (const rawLine of lines) {
        const headingMatch = String(rawLine || '').match(/^\s*#{1,6}\s+(.+)$/);
        if (!headingMatch?.[1]) {
          continue;
        }

        const cleanedHeading = sanitizeContinueReadingPreviewText(headingMatch[1]);
        if (cleanedHeading) {
          return cleanedHeading;
        }
      }

      for (const rawLine of lines) {
        const cleaned = sanitizeContinueReadingPreviewText(rawLine);
        if (cleaned) {
          return cleaned;
        }
      }
    } catch (error) {
      logger.warn('[IRCalendarSidebar] Failed to derive continue-reading title from chunk file', {
        path: normalizedPath,
        error
      });
    }

    return '';
  }

  async function resolveContinueReadingSuggestionTitle(material: ScheduleItem): Promise<string> {
    const cached = String(continueReadingResolvedTitleById[material.id] || '').trim();
    if (cached) {
      return cached;
    }

    const directLabel = getScheduleItemLabel(material);
    if (!isWeakContinueReadingLabel(directLabel, material)) {
      return directLabel;
    }

    let resolved = '';
    if (material.sourceType === 'chunk') {
      resolved = await deriveContinueReadingTitleFromChunkFile(material);
    }

    if (!resolved) {
      const fallbackTitle = String(material.title || '').trim();
      if (fallbackTitle && !isWeakContinueReadingLabel(fallbackTitle, material)) {
        resolved = fallbackTitle;
      }
    }

    if (!resolved) {
      const sourceLabel = getSourceDisplayLabel(material.sourceFile);
      if (sourceLabel && !isWeakContinueReadingLabel(sourceLabel, material)) {
        resolved = sourceLabel;
      }
    }

    if (!resolved) {
      resolved = uiText('未命名阅读点', 'Untitled');
    }

    continueReadingResolvedTitleById = {
      ...continueReadingResolvedTitleById,
      [material.id]: resolved
    };

    return resolved;
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
	if (!activeReadingTimer) return t('irSidebar.controls.untitled');
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
    return `${hours}${t('irSidebar.controls.timerHoursShort')} ${String(minutes).padStart(2, '0')}${t('irSidebar.controls.timerMinutesShort')}`;
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
	  return t('irSidebar.controls.pauseReadingTimer') + ` (${timerText})`;
    }
    if (getDisplayedTimerSeconds(blockId) > 0) {
	  return t('irSidebar.controls.resumeTimer', { duration: timerText });
    }
	return t('irSidebar.controls.startTimer');
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
    getCalendarQueryService().invalidate();
    window.dispatchEvent(new CustomEvent('Weave:ir-timer-updated', {
      detail: {
        blockId: snapshot.blockId,
        totalSeconds,
        reason
      }
    }));
    activeReadingTimer = null;
    clearTimerTicker();
    syncTimerRuntimeState();

    if (reason === 'manual') {
      new Notice(t('irSidebar.notices.timerPaused', { title: snapshot.title || t('irSidebar.controls.untitled') }));
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
      timerNowMs = Date.now();
      ensureTimerTicker();
      syncTimerRuntimeState();
      if (announceStart) {
        new Notice(t('irSidebar.notices.timerStarted', { title: getScheduleItemLabel(currentItem) }));
      }
    } catch (error) {
      logger.error('[IRCalendarSidebar] Failed to toggle reading timer', error);
      new Notice(t('irSidebar.notices.timerStartFailed'));
    } finally {
      timerBusyBlockId = null;
    }
  }

  async function ensureDoneItemsVisibleForDate(dateKey: string): Promise<void> {
    try {
      const doneIds = calendarProgressByDate[dateKey] || [];
      const currentPinned = pinnedByDate.get(dateKey) || [];
      if (!doneIds.length) {
        if (currentPinned.length > 0) {
          const nextPinnedByDate = new Map(pinnedByDate);
          nextPinnedByDate.delete(dateKey);
          pinnedByDate = nextPinnedByDate;
        }
        return;
      }

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
          for (const pid of unresolvedPdfIds) {
            const task = await getWorkspacePdfTaskById(pid);
            if (!task) continue;
            doneItems.push(buildScheduleItemFromPdfTask(task));
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
            doneItems.push(await buildScheduleItemFromEpubTask(task, { resolveFilePath: resolveEpubTaskFilePath }));
          }
        } catch (e) {
          logger.warn('[IRCalendarSidebar] Failed to load EPUB reading materials', e);
        }
      }

      if (!doneItems.length) {
        if (currentPinned.length > 0) {
          const nextPinnedByDate = new Map(pinnedByDate);
          nextPinnedByDate.delete(dateKey);
          pinnedByDate = nextPinnedByDate;
        }
        return;
      }

      const merged = new Map<string, ScheduleItem>();
      for (const item of doneItems) merged.set(item.id, item);

      const nextPinnedByDate = new Map(pinnedByDate);
      nextPinnedByDate.set(dateKey, [...merged.values()]);
      pinnedByDate = nextPinnedByDate;
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
    }
  }

  function getMonthDays(year: number, month: number): Array<{ date: Date; otherMonth: boolean }> {
    return buildMonthCalendarDays(year, month);
  }


  function getHeatLevel(date: Date): number {
    const key = formatDateKey(date);
    const materials = getVisibleMaterialsForDate(key);
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
    const scheduledItems = getVisibleMaterialsForDate(key);
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
    const materials = getVisibleMaterialsForDate(key);
    const pinned = getVisiblePinnedForDate(key);
    const merged = new Map<string, ScheduleItem>();
    for (const m of materials) merged.set(m.id, m);
    for (const p of pinned) {
      if (!merged.has(p.id)) merged.set(p.id, p);
    }
    return [...merged.values()].sort((a, b) => {
      const sequenceCompare = compareScheduleItemsWithinDay(a, b, key);
      if (sequenceCompare !== 0) return sequenceCompare;
      return compareScheduleItemsDefault(a, b);
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
    return materials.filter(matchesActiveTagFilter);
  }

  function getDateKeyDayOffsetFromToday(dateKey: string): number | null {
    const parsed = parseDateKey(dateKey);
    if (!parsed) return null;
    parsed.setHours(0, 0, 0, 0);
    return Math.round((parsed.getTime() - today.getTime()) / DAY_IN_MS);
  }

  function normalizeSourcePathKey(path?: string): string {
    const normalized = normalizePath(String(path || '').trim());
    return normalized ? normalized.toLowerCase() : '';
  }

  function getSourceDisplayLabel(path?: string): string {
    const normalized = normalizePath(String(path || '').trim());
    if (!normalized) {
      return '';
    }

    const baseName = normalized.split('/').pop() || normalized;
    return baseName.replace(/\.md$/i, '');
  }

  function getContinueReadingSourceHints(): Set<string> {
    const hints = new Set<string>();
    const focusedSource = normalizeSourcePathKey(sourceFilePath);
    if (focusedSource) {
      hints.add(focusedSource);
    }

    for (const material of getSelectedMaterialsBase()) {
      const sourceKey = normalizeSourcePathKey(material.sourceFile);
      if (sourceKey) {
        hints.add(sourceKey);
      }
    }

    return hints;
  }

  function hasActiveContinueReadingStatus(item: ScheduleItem): boolean {
    const normalizedStatus = String(item.scheduleStatus || '').trim().toLowerCase();
    return !['archived', 'removed', 'suspended', 'done', 'completed'].includes(normalizedStatus);
  }

  function hasSuspendedContinueReadingStatus(item: ScheduleItem): boolean {
    return isSuspendedContinueReadingStatus(item.scheduleStatus);
  }

  function getContinueReadingDueLabel(dayOffset: number | null): string {
    if (dayOffset === null || dayOffset <= 0) {
      return uiText('后续安排', 'Upcoming');
    }
    if (dayOffset === 1) {
      return uiText('明天', 'Tomorrow');
    }
    return isChineseUi ? `${dayOffset} 天后` : `In ${dayOffset} days`;
  }

  function getContinueReadingSuggestionMetaText(
    _item: ScheduleItem,
    dayOffset: number | null,
    _sourceHints: Set<string>
  ): string {
    return getContinueReadingDueLabel(dayOffset);
  }

  function getContinueReadingSuggestionScore(
    item: ScheduleItem,
    dayOffset: number | null,
    sourceHints: Set<string>
  ): number {
    const safeOffset = dayOffset ?? 99;
    const sourceMatched = sourceHints.has(normalizeSourcePathKey(item.sourceFile)) ? 1 : 0;
    return (
      sourceMatched * 180 +
      Number(item.priority || 0) * 12 +
      Math.round(Number(item.explanation?.compositeScore ?? 0)) -
      safeOffset * 1000
    );
  }

  function getSuspendedContinueReadingMetaText(
    _item: ScheduleItem,
    _sourceHints: Set<string>
  ): string {
    return uiText('已搁置', 'Suspended');
  }

  function getSuspendedContinueReadingScore(
    item: ScheduleItem,
    sourceHints: Set<string>
  ): number {
    const sourceMatched = sourceHints.has(normalizeSourcePathKey(item.sourceFile)) ? 1 : 0;
    return sourceMatched * 180 + Number(item.priority || 0) * 12 - Number(item.intervalDays || 0);
  }

  function getContinueReadingSuggestions(limit = 5): ContinueReadingSuggestion[] {
    const todayKey = formatDateKey(today);
    const sourceHints = getContinueReadingSourceHints();
    const suggestions: ContinueReadingSuggestion[] = [];
    const seenIds = new Set<string>();

    const futureDateKeys = Array.from(materialsByDate.keys())
      .filter((dateKey) => dateKey > todayKey)
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));

    for (const dateKey of futureDateKeys) {
      const dayOffset = getDateKeyDayOffsetFromToday(dateKey);
      if (dayOffset === null || dayOffset <= 0) {
        continue;
      }

      for (const item of getVisibleMaterialsForDate(dateKey)) {
        if (seenIds.has(item.id) || !hasActiveContinueReadingStatus(item)) {
          continue;
        }

        seenIds.add(item.id);
        suggestions.push({
          item,
          dateKey,
          dayOffset,
          metaText: getContinueReadingSuggestionMetaText(item, dayOffset, sourceHints),
          score: getContinueReadingSuggestionScore(item, dayOffset, sourceHints),
        });
      }
    }

    return suggestions
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (left.dayOffset !== right.dayOffset) {
          return left.dayOffset - right.dayOffset;
        }
        return (right.item.priority || 0) - (left.item.priority || 0);
      })
      .slice(0, limit);
  }

  function getSuspendedContinueReadingSuggestions(limit = 5): SuspendedContinueReadingSuggestion[] {
    const sourceHints = getContinueReadingSourceHints();
    const suggestions: SuspendedContinueReadingSuggestion[] = [];
    const seenIds = new Set<string>();

    for (const item of continueReadingSuspendedItemsPool) {
      if (seenIds.has(item.id) || !matchesActiveDeckFilter(item) || !hasSuspendedContinueReadingStatus(item)) {
        continue;
      }

      seenIds.add(item.id);
      suggestions.push({
        item,
        metaText: getSuspendedContinueReadingMetaText(item, sourceHints),
        score: getSuspendedContinueReadingScore(item, sourceHints)
      });
    }

    return suggestions
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return (right.item.priority || 0) - (left.item.priority || 0);
      })
      .slice(0, limit);
  }

  function hasContinueReadingCandidatesAvailable(): boolean {
    if (isLoading || !isSameDay(selectedDate, today)) {
      return false;
    }

    return getContinueReadingSuggestions().length > 0 || getSuspendedContinueReadingSuggestions().length > 0;
  }

  function hasReadableReadingPointsForDate(date: Date): boolean {
    const dateKey = formatDateKey(date);
    const doneIds = new Set(calendarProgressByDate[dateKey] || []);
    const merged = new Map<string, ScheduleItem>();

    for (const item of getVisibleMaterialsForDate(dateKey)) {
      merged.set(item.id, item);
    }

    for (const item of getVisiblePinnedForDate(dateKey)) {
      if (!merged.has(item.id)) {
        merged.set(item.id, item);
      }
    }

    return Array.from(merged.values()).some((item) => hasActiveContinueReadingStatus(item) && !doneIds.has(item.id));
  }

  function shouldOfferContinueReadingSuggestions(): boolean {
    if (!hasContinueReadingCandidatesAvailable()) {
      return false;
    }

    return !hasReadableReadingPointsForDate(today);
  }

  function getContinueReadingSuggestionsSignature(
    suggestions: ContinueReadingSuggestion[] = getContinueReadingSuggestions(),
    suspendedSuggestions: SuspendedContinueReadingSuggestion[] = getSuspendedContinueReadingSuggestions()
  ): string {
    const todayKey = formatDateKey(today);
    const scheduledSignature = suggestions.map((suggestion) => `${suggestion.item.id}@${suggestion.dateKey}`).join('|');
    const suspendedSignature = suspendedSuggestions.map((suggestion) => suggestion.item.id).join('|');
    const signatureBody = [scheduledSignature ? `scheduled:${scheduledSignature}` : '', suspendedSignature ? `suspended:${suspendedSignature}` : '']
      .filter(Boolean)
      .join('::');
    return signatureBody ? `${todayKey}::${signatureBody}` : '';
  }

  async function buildContinueReadingSuggestionModalItems(
    suggestions: ContinueReadingSuggestion[] = getContinueReadingSuggestions()
  ): Promise<IRContinueReadingSuggestionModalItem[]> {
    return await Promise.all(
      suggestions.map(async (suggestion) => ({
        id: suggestion.item.id,
        title: await resolveContinueReadingSuggestionTitle(suggestion.item),
        metaText: suggestion.metaText,
        contextLabel: getContinueReadingDueLabel(suggestion.dayOffset),
        priorityLabel: `P${suggestion.item.priority || 0}`,
        kind: 'scheduled' as const
      }))
    );
  }

  async function buildSuspendedContinueReadingModalItems(
    suggestions: SuspendedContinueReadingSuggestion[] = getSuspendedContinueReadingSuggestions()
  ): Promise<IRContinueReadingSuggestionModalItem[]> {
    return await Promise.all(
      suggestions.map(async (suggestion) => ({
        id: suggestion.item.id,
        title: await resolveContinueReadingSuggestionTitle(suggestion.item),
        metaText: suggestion.metaText,
        contextLabel: uiText('已搁置', 'Suspended'),
        priorityLabel: `P${suggestion.item.priority || 0}`,
        kind: 'suspended' as const
      }))
    );
  }

  function getCalendarDisplayDays(
    days: Array<{ date: Date; otherMonth: boolean }>
  ): Array<{ date: Date; otherMonth: boolean }> {
    if (calendarViewMode !== 'two-row') {
      return days;
    }

    const isCurrentDisplayedMonth =
      currentDate.getFullYear() === today.getFullYear() &&
      currentDate.getMonth() === today.getMonth();
    const isSelectedInDisplayedMonth =
      selectedDate.getFullYear() === currentDate.getFullYear() &&
      selectedDate.getMonth() === currentDate.getMonth();
    const anchorDate = isCurrentDisplayedMonth
      ? today
      : isSelectedInDisplayedMonth
        ? selectedDate
        : new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const anchorIndex = days.findIndex(({ date }) => isSameDay(date, anchorDate));

    if (anchorIndex < 0) {
      return days.slice(0, 14);
    }

    const rowStart = Math.floor(anchorIndex / 7) * 7;
    const visibleDays = days.slice(rowStart, Math.min(rowStart + 14, days.length));

    if (visibleDays.length === 14) {
      return visibleDays;
    }

    const lastVisibleDate = visibleDays.length > 0
      ? visibleDays[visibleDays.length - 1].date
      : anchorDate;
    const paddedDays = [...visibleDays];
    for (let offset = 1; paddedDays.length < 14; offset += 1) {
      paddedDays.push({
        date: new Date(
          lastVisibleDate.getFullYear(),
          lastVisibleDate.getMonth(),
          lastVisibleDate.getDate() + offset
        ),
        otherMonth: true
      });
    }

    return paddedDays;
  }

  function showMonthCalendarToolsMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle(t('irSidebar.header.analyticsTitle'))
        .setIcon('bar-chart-2')
        .onClick(() => {
          openAnalyticsModal();
        });
    });

    menu.addItem((item) => {
      item
        .setTitle(t('irSidebar.header.importTitle'))
        .setIcon('folder-input')
        .onClick(() => {
          openImportModal();
        });
    });

    menu.addSeparator();

    populateCalendarBackgroundWallMenu(menu, {
      backgroundWallTitle: t('irSidebar.header.backgroundWallTitle'),
      chooseTitle: t('irSidebar.header.backgroundWallChoose'),
      clearTitle: t('irSidebar.header.backgroundWallClear'),
      fadeTitle: t('irSidebar.header.backgroundWallFadeSet', { value: Number(calendarBackgroundWallFadePercent) }),
      hasImage: Boolean(calendarBackgroundWallImagePath),
      onChoose: () => {
        void chooseCalendarBackgroundWallImage();
      },
      onClear: () => {
        void clearCalendarBackgroundWallImage();
      },
      onSetFade: () => {
        void promptCalendarBackgroundWallFadePercent();
      }
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle(
          calendarViewMode === 'two-row'
            ? uiText('切换为完整月历视图', 'Switch to full month view')
            : uiText('切换为双行月历视图', 'Switch to two-row month view')
        )
        .setIcon('calendar')
        .onClick(() => {
          void setCalendarViewMode(calendarViewMode === 'two-row' ? 'full' : 'two-row');
        });
    });

    const triggerRect = calendarToolsTriggerEl?.getBoundingClientRect();
    menu.showAtPosition(
      triggerRect
        ? { x: triggerRect.right - 8, y: triggerRect.bottom + 6 }
        : { x: event.clientX, y: event.clientY }
    );
  }

  function getContinueReadingSuggestionById(
    suggestionId: string,
    suggestions: ContinueReadingSuggestion[] = getContinueReadingSuggestions()
  ): ContinueReadingSuggestion | null {
    return suggestions.find((suggestion) => suggestion.item.id === suggestionId) || null;
  }

  function getSuspendedContinueReadingSuggestionById(
    suggestionId: string,
    suggestions: SuspendedContinueReadingSuggestion[] = getSuspendedContinueReadingSuggestions()
  ): SuspendedContinueReadingSuggestion | null {
    return suggestions.find((suggestion) => suggestion.item.id === suggestionId) || null;
  }

  function buildContinueReadingPanelState(): ContinueReadingPanelState {
    const suggestions = getContinueReadingSuggestions();
    const suspended = getSuspendedContinueReadingSuggestions();
    return {
      suggestions,
      suspended,
      signature: getContinueReadingSuggestionsSignature(suggestions, suspended)
    };
  }

  async function buildContinueReadingSuggestionsModalOptions(
    panelState: ContinueReadingPanelState
  ): Promise<IRContinueReadingSuggestionsModalObsidianOptions> {
    const [suggestionItems, suspendedItems] = await Promise.all([
      buildContinueReadingSuggestionModalItems(panelState.suggestions),
      buildSuspendedContinueReadingModalItems(panelState.suspended)
    ]);

    return {
      suggestions: suggestionItems,
      suspendedItems,
      isChineseUi,
      anchorElement: continueReadingTriggerEl || calendarSidebarEl,
      onOpenSuggestion: async (suggestionId: string) => {
        const scheduledTarget = getContinueReadingSuggestionById(suggestionId, panelState.suggestions);
        const suspendedTarget = getSuspendedContinueReadingSuggestionById(suggestionId, panelState.suspended);
        const target = scheduledTarget?.item || suspendedTarget?.item;
        if (!target) {
          return;
        }

        closeContinueReadingSuggestionsModal('action');
        await openMaterial(target);
      },
      onAddSuggestion: async (suggestionId: string) => {
        const scheduledTarget = getContinueReadingSuggestionById(suggestionId, panelState.suggestions);
        if (scheduledTarget) {
          await addSuggestedMaterialToToday(scheduledTarget.item);
          return;
        }

        const suspendedTarget = getSuspendedContinueReadingSuggestionById(suggestionId, panelState.suspended);
        if (!suspendedTarget) {
          return;
        }

        await restoreSuspendedMaterialToToday(suspendedTarget.item);
      },
      onClose: () => {
        const closedSignature = continueReadingSuggestionsModalOpenSignature;
        const closeReason = continueReadingSuggestionsModalCloseReason;
        continueReadingSuggestionsModalInstance = null;
        continueReadingSuggestionsModalOpenSignature = '';
        continueReadingSuggestionsModalCloseReason = 'dismiss';
        if (closeReason === 'dismiss' && closedSignature) {
          continueReadingSuggestionsModalDismissedSignature = closedSignature;
        }
      }
    };
  }

  function closeContinueReadingSuggestionsModal(reason: 'dismiss' | 'action' | 'refresh' = 'dismiss'): void {
    if (!continueReadingSuggestionsModalInstance) {
      return;
    }

    continueReadingSuggestionsModalCloseReason = reason;
    continueReadingSuggestionsModalInstance.close();
  }

  async function openContinueReadingSuggestionsModal(force = false): Promise<void> {
    if (!shouldOfferContinueReadingSuggestions()) {
      if (continueReadingSuggestionsModalInstance) {
        closeContinueReadingSuggestionsModal('refresh');
      }
      return;
    }

    const panelState = buildContinueReadingPanelState();
    const signature = panelState.signature;
    if (!signature) {
      if (continueReadingSuggestionsModalInstance) {
        closeContinueReadingSuggestionsModal('refresh');
      }
      return;
    }

    if (
      !force &&
      continueReadingSuggestionsModalDismissedSignature &&
      continueReadingSuggestionsModalDismissedSignature === signature
    ) {
      return;
    }

    if (continueReadingSuggestionsModalInstance && continueReadingSuggestionsModalOpenSignature === signature) {
      return;
    }

    await tick();

    if (continueReadingSuggestionsModalInstance) {
      continueReadingSuggestionsModalOpenSignature = signature;
      continueReadingSuggestionsModalInstance.refresh(
        await buildContinueReadingSuggestionsModalOptions(panelState)
      );
      return;
    }

    continueReadingSuggestionsModalOpenSignature = signature;
    continueReadingSuggestionsModalInstance = new IRContinueReadingSuggestionsModalObsidian(
      plugin.app,
      await buildContinueReadingSuggestionsModalOptions(panelState)
    );
    continueReadingSuggestionsModalInstance.open();
  }

  function syncContinueReadingSuggestionsModalVisibility(): void {
    const panelState = buildContinueReadingPanelState();
    if (!panelState.signature || !shouldOfferContinueReadingSuggestions()) {
      if (continueReadingSuggestionsModalInstance) closeContinueReadingSuggestionsModal('refresh');
      return;
    }

    if (continueReadingSuggestionsModalInstance) {
      if (panelState.signature !== continueReadingSuggestionsModalOpenSignature) {
        const nextSignature = panelState.signature;
        continueReadingSuggestionsModalOpenSignature = nextSignature;
        void tick().then(() => {
          void buildContinueReadingSuggestionsModalOptions(panelState).then((options) => {
            if (
              continueReadingSuggestionsModalInstance &&
              continueReadingSuggestionsModalOpenSignature === nextSignature
            ) {
              continueReadingSuggestionsModalInstance.refresh(options);
            }
          });
        });
      }
    }
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
    syncContinueReadingSuggestionsModalVisibility();
  }


  function selectDay(date: Date) {
    closeSchedulingMenu();
    selectedDate = new Date(date);
    const key = formatDateKey(selectedDate);
    const done = calendarProgressByDate[key] || [];
    processedChunkIds = new Set(done);
    void ensureDoneItemsVisibleForDate(key);
    syncContinueReadingSuggestionsModalVisibility();
  }

  function syncSelectionToFocusedDeck(): void {
    const activeDeckId = getActiveDeckFilterId();
    if (!activeDeckId) {
      return;
    }

    const currentKey = formatDateKey(selectedDate);
    if (getVisibleMaterialsForDate(currentKey).length > 0 || getVisiblePinnedForDate(currentKey).length > 0) {
      return;
    }

    const candidateKeys = Array.from(new Set([
      ...Array.from(materialsByDate.keys()),
      ...Array.from(pinnedByDate.keys())
    ]))
      .filter((dateKey) => {
        return getVisibleMaterialsForDate(dateKey).length > 0 || getVisiblePinnedForDate(dateKey).length > 0;
      })
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));

    if (candidateKeys.length === 0) {
      return;
    }

    const todayKey = formatDateKey(today);
    let targetKey = candidateKeys.find((dateKey) => dateKey >= todayKey) || candidateKeys[0];
    if (getVisibleMaterialsForDate(todayKey).length > 0 || getVisiblePinnedForDate(todayKey).length > 0) {
      targetKey = todayKey;
    }

    const targetDate = parseDateKey(targetKey);
    if (!targetDate) {
      return;
    }

    currentDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    selectedDate = targetDate;
    const done = calendarProgressByDate[targetKey] || [];
    processedChunkIds = new Set(done);
    void ensureDoneItemsVisibleForDate(targetKey);
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

    void refreshSidebarAfterDataUpdate({ includeProgress: false });
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
      syncContinueReadingSuggestionsModalVisibility();
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

  async function restoreExpandedMaterialSiblings(previouslyExpanded: Set<string>): Promise<void> {
    if (previouslyExpanded.size === 0) {
      return;
    }

    const todayKey = formatDateKey(selectedDate);
    const todayItems = materialsByDate.get(todayKey) || [];
    for (const item of todayItems) {
      if (!previouslyExpanded.has(item.id)) {
        continue;
      }

      const siblings = await getSiblingMaterials(item);
      const next = new Map(siblingCache);
      next.set(item.id, siblings);
      siblingCache = next;
    }
  }

  async function refreshSidebarAfterDataUpdate(
    options: { forceRecompute?: boolean; includeProgress?: boolean } = {}
  ): Promise<void> {
    const previouslyExpanded = new Set(expandedMaterialIds);
    siblingCache = new Map();
    getWorkspaceSnapshotService().invalidate();
    getCalendarQueryService().invalidate();
    await refreshSidebarData(options);
    await restoreExpandedMaterialSiblings(previouslyExpanded);
    syncContinueReadingSuggestionsModalVisibility();
  }

  async function recomputeAndRefreshSidebar(
    reason: UpdatedEventDetail['reason'],
    options?: { deckIds?: string[] }
  ): Promise<UpdatedEventDetail> {
    const detail = await recomputeAndBroadcastIRData(plugin.app, reason, options);
    pendingLocalRefreshGeneratedAt = detail.generatedAt;
    try {
      await refreshSidebarAfterDataUpdate();
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
      chunkScheduleAdapter = new IRChunkScheduleAdapter(plugin.app, storage);
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

  async function getPointWriteService(): Promise<IRPointWriteService> {
    if (!pointWriteService) {
      pointWriteService = new IRPointWriteService(plugin.app);
    }
    return pointWriteService;
  }

  function getPointWriteTarget(material: ScheduleItem): IRPointWriteTarget {
    return {
      id: material.id,
      kind: material.sourceType === 'legacy-block' ? 'block' : material.sourceType === 'chunk' ? 'chunk' : undefined,
      sourceDocumentPath: material.sourceFile || undefined
    };
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

        logger.warn('[IRCalendarSidebar] Recovered warning message.', material);
        await showMissingSourceDocumentDialog(material);
        return;
      }

      // EPUB: reuse existing tab or open new, then navigate
      if (isEpubBookmarkTaskId(material.id)) {
        try {
          const task = await getWorkspaceEpubTaskById(material.id);
          if (!task) {
            logger.warn('[IRCalendarSidebar] Recovered warning message.', { materialId: material.id, reason: 'epub_task_missing' });
            await showMissingSourceDocumentDialog(material, filePath);
            return;
          }

          const resolvedFilePath = await resolveEpubTaskFilePath(task);
          const epubFile = plugin.app.vault.getAbstractFileByPath(resolvedFilePath);
          if (!(epubFile instanceof TFile)) {
            logger.warn('[IRCalendarSidebar] Recovered warning message.', { materialId: material.id, resolvedFilePath, reason: 'epub_source_missing' });
            await showMissingSourceDocumentDialog(material, resolvedFilePath || filePath);
            return;
          }

          const navDetail: any = { filePath: resolvedFilePath };
          if (task.resumeCfi) {
            navDetail.cfi = task.resumeCfi;
          } else if (task.tocHref) {
            navDetail.href = task.tocHref;
          }

          const existingLeaf = findOpenEpubLeaf(plugin.app, resolvedFilePath);

          if (existingLeaf) {
            plugin.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
            window.dispatchEvent(new CustomEvent(EPUB_RUNTIME.events.navigate, { detail: navDetail }));
          } else {
            (window as any)[EPUB_RUNTIME.globals.pendingNavigationKey] = navDetail;
            if (typeof plugin.openEpubReader === 'function') {
              await plugin.openEpubReader(resolvedFilePath);
            } else {
              const ctxPath = plugin.app.workspace.getActiveFile()?.path ?? '';
              await plugin.app.workspace.openLinkText(resolvedFilePath, ctxPath, false);
            }
          }
        } catch (e) {
          logger.warn('[IRCalendarSidebar] Recovered warning message.', e);
          await showMissingSourceDocumentDialog(material, filePath);
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

        await showMissingSourceDocumentDialog(material, filePath);
        return;
      }

      const normalizedFilePath = normalizePath(filePath).toLowerCase();

      if (material.sourceType === 'chunk' && normalizedFilePath.endsWith('.canvas')) {
        const rm = readingMaterials.find(m => normalizePath(String(m.filePath || '').trim()) === normalizePath(filePath));
        const chunk = await getWorkspaceChunkById(material.id);
        const chunkMeta = ((chunk as any)?.meta || {}) as Record<string, unknown>;
        const rawLink = (material.resumeLink && material.resumeLink.trim().length > 0)
          ? material.resumeLink.trim()
          : (typeof chunkMeta.resumeLink === 'string' && chunkMeta.resumeLink.trim().length > 0)
            ? chunkMeta.resumeLink.trim()
            : ((rm?.resumeLink && rm.resumeLink.trim().length > 0) ? rm.resumeLink.trim() : `[[${filePath}]]`);
        const nodeId =
          (typeof chunkMeta.canvasNodeId === 'string' && chunkMeta.canvasNodeId.trim().length > 0)
            ? chunkMeta.canvasNodeId.trim()
            : getCanvasNodeIdFromSourceLink(rawLink);
        const textCandidates = Array.isArray(chunkMeta.canvasTextCandidates)
          ? chunkMeta.canvasTextCandidates
            .map((value) => String(value || '').trim())
            .filter(Boolean)
          : [];
        const sourceNavigationService = new SourceNavigationService(plugin.app);
        await sourceNavigationService.openCanvasAndLocate(
          filePath,
          textCandidates,
          nodeId,
          {
            focus: true,
            nodeRect: getCanvasSourceNodeRectFromSourceLink(rawLink)
          }
        );
        return;
      }

      const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
      const rm = readingMaterials.find(m => m.filePath === filePath);
      let rawLink = (material.resumeLink && material.resumeLink.trim().length > 0)
        ? material.resumeLink
        : ((rm?.resumeLink && rm.resumeLink.trim().length > 0) ? rm.resumeLink : filePath);

      const linkToOpen = rawLink.trim().replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0];
      await plugin.app.workspace.openLinkText(linkToOpen, contextPath, false);
      logger.debug('[IRCalendarSidebar] Recovered debug message.', linkToOpen);
    } catch (error) {
      logger.error('[IRCalendarSidebar] Failed to open block.', error);
      new Notice(uiText('打开阅读点失败', 'Failed to open reading point'));
    }
  }


  interface SearchResultEntry {
    item: ScheduleItem;
    dateKey: string;
  }

  interface ContinueReadingSuggestion {
    item: ScheduleItem;
    dateKey: string;
    dayOffset: number;
    metaText: string;
    score: number;
  }

  interface SuspendedContinueReadingSuggestion {
    item: ScheduleItem;
    metaText: string;
    score: number;
  }

  interface ContinueReadingPanelState {
    suggestions: ContinueReadingSuggestion[];
    suspended: SuspendedContinueReadingSuggestion[];
    signature: string;
  }

  function getScheduleItemDayKey(item: ScheduleItem): string {
    const anchorDayKey = String(item.sourceSequenceAnchorDateKey || '').trim();
    if (anchorDayKey) {
      return anchorDayKey;
    }
    if (item.nextReviewDate) {
      return formatDateKey(item.nextReviewDate);
    }
    if (item.nextRepDate > 0) {
      return formatDateKey(new Date(item.nextRepDate));
    }
    return '';
  }

  function isScheduleItemInitialSequenceLockedForDay(item: ScheduleItem, dayKey: string): boolean {
    return Boolean(
      item.sourceSequenceLocked &&
        item.sourceSequenceGroup &&
        typeof item.sourceSequenceOrder === 'number' &&
        item.sourceSequenceAnchorDateKey &&
        item.sourceSequenceAnchorDateKey === dayKey
    );
  }

  function compareScheduleItemsWithinDay(left: ScheduleItem, right: ScheduleItem, dayKey: string): number {
    if (!isScheduleItemInitialSequenceLockedForDay(left, dayKey) || !isScheduleItemInitialSequenceLockedForDay(right, dayKey)) {
      return 0;
    }
    if (left.sourceSequenceGroup !== right.sourceSequenceGroup) {
      return 0;
    }
    return Number(left.sourceSequenceOrder || 0) - Number(right.sourceSequenceOrder || 0);
  }

  function compareScheduleItemsDefault(left: ScheduleItem, right: ScheduleItem): number {
    const scoreDiff = (right.explanation?.compositeScore ?? 0) - (left.explanation?.compositeScore ?? 0);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const priorityDiff = (right.priority || 0) - (left.priority || 0);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const nextRepDateDiff = (left.nextRepDate || 0) - (right.nextRepDate || 0);
    if (nextRepDateDiff !== 0) {
      return nextRepDateDiff;
    }

    return String(left.id || '').localeCompare(String(right.id || ''), 'zh-CN');
  }

  function compareScheduleItemsByScheduledDay(left: ScheduleItem, right: ScheduleItem): number {
    const leftDayKey = getScheduleItemDayKey(left);
    const rightDayKey = getScheduleItemDayKey(right);
    const dayCompare = leftDayKey.localeCompare(rightDayKey, 'zh-CN');
    if (dayCompare !== 0) {
      return dayCompare;
    }

    if (leftDayKey) {
      const sequenceCompare = compareScheduleItemsWithinDay(left, right, leftDayKey);
      if (sequenceCompare !== 0) {
        return sequenceCompare;
      }
    }

    return compareScheduleItemsDefault(left, right);
  }

  function getLegacyBlockDisplayName(block: IRBlock): string | undefined {
    const displayName = Array.isArray(block.headingPath) && block.headingPath.length > 0
      ? String(block.headingPath[block.headingPath.length - 1] || '').trim()
      : '';
    return displayName || undefined;
  }

  function isSuspendedContinueReadingStatus(status: string | undefined | null): boolean {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    return normalizedStatus === 'suspended' || normalizedStatus === 'archived';
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
    const pointWriteService = await getPointWriteService();
    const result = await pointWriteService.updatePointAssociatedNotes(
      getPointWriteTarget(material),
      normalizedNotePaths
    );
    return !!result;
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
      placeholder: t('irSidebar.associatedNote.pickerPlaceholder')
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
    const baseName = material.displayName || material.title || t('irSidebar.controls.untitled');
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


  let schedulingConfig = $derived([
    { action: 'intensive' as const, label: t('irSidebar.scheduling.intensive'), color: 'var(--weave-error, #ef4444)', intervalMultiplier: 0.5 },
    { action: 'normal' as const, label: t('irSidebar.scheduling.normal'), color: 'var(--weave-success, #10b981)', intervalMultiplier: 1.0 },
    { action: 'slow' as const, label: t('irSidebar.scheduling.slow'), color: 'var(--weave-warning, #f59e0b)', intervalMultiplier: 1.8 },
    { action: 'postpone' as const, label: t('irSidebar.scheduling.postpone'), color: 'var(--text-muted, #6b7280)', intervalMultiplier: 0, isPostpone: true },
  ]);

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

  async function removeMaterial(
    material: ScheduleItem,
    options: { sourceMissing?: boolean } = {}
  ) {
    try {
      const confirmedMessage = options.sourceMissing
        ? `确定要将「${getScheduleItemLabel(material)}」从增量阅读调度中移除吗？\n\n这只会清理该阅读点的增量阅读调度数据。由于源文档已缺失，不会再清理源文档中的阅读记录，也不会写入已删除标记。`
        : `确定要将「${getScheduleItemLabel(material)}」从增量阅读调度中移除吗？\n\n这会清理该文档中的增量阅读记录，并添加 we_已删除 标签，但会保留源文档。`;
      const confirmed = await showObsidianConfirm(
        plugin.app,
        confirmedMessage,
        {
          title: '移除阅读点',
          confirmText: '移除',
          confirmClass: 'mod-warning'
        }
      );
      if (!confirmed) {
        return;
      }

      const pointWriteService = await getPointWriteService();
      const target = getPointWriteTarget(material);
      const removed = await pointWriteService.deletePoint({
        id: target.id,
        kind: target.kind
      });
      if (!removed) {
        throw new Error(`Failed to remove reading point: ${material.id}`);
      }

      await removeLocalMaterialReferences(material.id);
      new Notice(t('irSidebar.notices.removed'));
      closePriorityMenu();
      closeSchedulingMenu();
      await recomputeAndRefreshSidebar('ui_refresh');
    } catch (error) {
      logger.error('[IRCalendarSidebar] Recovered error message.', error);
      new Notice(t('irSidebar.notices.removeFailed'));
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
      const currentGroupName = currentGroup?.name || uiText('\u9ed8\u8ba4', 'Default');

      sub.addItem((item) => {
        item
          .setTitle(uiText(`\u5f53\u524d\u6807\u7b7e\u7ec4\uff1a${currentGroupName}`, `Current tag group: ${currentGroupName}`))
          .setIcon('check-circle')
          .setDisabled(true);
      });

      sub.addItem((item) => {
        item
          .setTitle(
            currentTags.length > 0
              ? uiText(`\u5f53\u524d\u6807\u7b7e\uff1a${currentTags.join(' / ')}`, `Current tags: ${currentTags.join(' / ')}`)
              : uiText('\u6682\u65e0\u6807\u7b7e', 'No tags')
          )
          .setIcon('hash')
          .setDisabled(true);
      });

      sub.addSeparator();

      if (allGroups.length === 0) {
        sub.addItem((item) => {
          item.setTitle(uiText('\u6682\u65e0\u53ef\u7528\u6807\u7b7e\u7ec4', 'No tag groups available')).setIcon('inbox').setDisabled(true);
        });
      } else {
        for (const group of allGroups) {
          const matchedTags = normalizeReadingPointTags(group.matchAnyTags || []).filter((candidate) =>
            currentTags.some((tag) => tag.toLowerCase() === candidate.toLowerCase())
          );
          sub.addItem((item) => {
            const suffix = group.id === currentGroupId ? uiText('\uff08\u5f53\u524d\uff09', ' (current)') : '';
            const matchHint = matchedTags.length > 0
              ? uiText(` - \u5339\u914d\uff1a${matchedTags.join(', ')}`, ` - Match: ${matchedTags.join(', ')}`)
              : '';
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
          .setTitle(uiText('\u6807\u7b7e\u7ec4\u4f1a\u6839\u636e\u9605\u8bfb\u6807\u7b7e\u81ea\u52a8\u5339\u914d\uff0c\u4ec5\u4f9b\u67e5\u770b', 'Tag groups are matched from reading tags and shown here for reference'))
          .setIcon('info')
          .setDisabled(true);
      });
    } catch (error) {
      logger.error('[IRCalendarSidebar] Failed to load tag-group submenu:', error);
      sub.addItem((item) => {
        item.setTitle(uiText('\u52a0\u8f7d\u6807\u7b7e\u7ec4\u5931\u8d25', 'Failed to load tag groups')).setIcon('alert-triangle').setDisabled(true);
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

  async function addSuggestedMaterialToToday(material: ScheduleItem): Promise<void> {
    if (continueReadingActionIds.has(material.id)) {
      return;
    }

    continueReadingActionIds = new Set([...continueReadingActionIds, material.id]);
    try {
      const scheduler = await getV4SchedulerService();
      const block = await resolveScheduleItemToBlockV4(material);
      const deckId = await resolveDeckIdForScheduleItem(material);
      const now = new Date();
      now.setSeconds(0, 0);

      await scheduler.manualRescheduleBlockWithPreviewV4(
        block,
        {
          nextRepDate: now.getTime(),
          scheduleStatus: 'queued'
        },
        deckId
      );

      new Notice(uiText('已加入今天的阅读列表', 'Added to today'));
      await recomputeAndRefreshSidebar('manual_reschedule');
    } catch (error) {
      logger.error('[IRCalendarSidebar] Failed to add suggested material to today', error);
      new Notice(uiText('加入今天失败', 'Failed to add to today'));
    } finally {
      const nextIds = new Set(continueReadingActionIds);
      nextIds.delete(material.id);
      continueReadingActionIds = nextIds;
    }
  }

  async function restoreSuspendedMaterialToToday(material: ScheduleItem): Promise<void> {
    if (continueReadingActionIds.has(material.id)) {
      return;
    }

    continueReadingActionIds = new Set([...continueReadingActionIds, material.id]);
    try {
      const scheduler = await getV4SchedulerService();
      const block = await resolveScheduleItemToBlockV4(material);
      const deckId = await resolveDeckIdForScheduleItem(material);

      await scheduler.resumeBlockWithPreviewV4(block, deckId);
      await clearSuspendedMarkersForMaterial(material);

      new Notice(uiText('已恢复到今天的阅读列表', 'Restored to today'));
      await recomputeAndRefreshSidebar('manual_reschedule');
    } catch (error) {
      logger.error('[IRCalendarSidebar] Failed to restore suspended material to today', error);
      new Notice(uiText('恢复搁置阅读点失败', 'Failed to restore suspended reading point'));
    } finally {
      const nextIds = new Set(continueReadingActionIds);
      nextIds.delete(material.id);
      continueReadingActionIds = nextIds;
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
    closeContinueReadingSuggestionsModal('refresh');
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
        if (!matchesActiveDeckFilter(item)) continue;
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
          const siblingItem = buildScheduleItemFromPdfTask(task);
          if (!matchesActiveDeckFilter(siblingItem)) continue;
          collectedIds.add(task.id);
          siblings.push(siblingItem);
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
          const siblingItem = await buildScheduleItemFromEpubTask(task, { resolvedFilePath });
          if (!matchesActiveDeckFilter(siblingItem)) continue;
          collectedIds.add(task.id);
          siblings.push(siblingItem);
        }
      } catch (e) {
        logger.warn('[IRCalendarSidebar] Failed to load EPUB sibling materials', e);
      }
    }


    siblings.sort(compareScheduleItemsByScheduledDay);
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
    const normalizedTags = normalizeReadingPointTags(tags);
    const pointWriteService = await getPointWriteService();
    const saved = !!(await pointWriteService.updatePointTags(getPointWriteTarget(material), normalizedTags));

    if (saved) {
      readingPointTagsById = {
        ...readingPointTagsById,
        [material.id]: normalizedTags,
      };
    }

    return saved;
  }

  function stripSuspendedReadingPointTags(tags: string[]): string[] {
    return normalizeReadingPointTags(tags).filter((tag) => {
      const normalized = String(tag || '').trim().replace(/^#/, '').toLowerCase();
      return normalized ? !SUSPENDED_READING_POINT_TAG_KEYS.has(normalized) : false;
    });
  }

  async function clearSuspendedMarkersForMaterial(material: ScheduleItem): Promise<void> {
    if (material.sourceType === 'legacy-block') {
      return;
    }

    const currentTags = await getMaterialReadingPointTags(material);
    const nextTags = stripSuspendedReadingPointTags(currentTags);
    const changed =
      nextTags.length !== currentTags.length ||
      nextTags.some((tag, index) => tag !== currentTags[index]);

    if (!changed) {
      return;
    }

    await saveMaterialReadingPointTags(material, nextTags);
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
        label: uiText('\u672a\u5206\u7ec4', 'Ungrouped'),
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
      const currentGroupName = currentGroup?.name || uiText('\u9ed8\u8ba4', 'Default');

      sub.addItem((item) => {
        item
          .setTitle(uiText(`\u5f53\u524d\u6807\u7b7e\u7ec4\uff1a${currentGroupName}`, `Current tag group: ${currentGroupName}`))
          .setIcon('layers')
          .setDisabled(true);
      });

      sub.addSeparator();

      sub.addItem((item) => {
        item
          .setTitle(uiText('\u65b0\u5efa\u6807\u7b7e', 'Create new tag'))
          .setIcon('plus')
          .onClick(async () => {
            const input = await showObsidianInput(plugin.app, uiText('\u8f93\u5165\u65b0\u7684\u6807\u7b7e\u540d', 'Enter a new tag name'), '', {
              title: uiText('\u65b0\u5efa\u6807\u7b7e', 'Create tag'),
              placeholder: uiText('\u4f8b\u5982\uff1a\u6982\u5ff5 / \u5f15\u6587 / \u95ee\u9898', 'e.g. concept / quote / problem'),
              confirmText: uiText('\u521b\u5efa', 'Create')
            });
            if (input === null) return;

            const [nextTag] = normalizeReadingPointTags([input]);
            if (!nextTag) {
              new Notice(uiText('\u6807\u7b7e\u540d\u4e0d\u80fd\u4e3a\u7a7a', 'Tag name cannot be empty'));
              return;
            }
            if (currentTagSet.has(nextTag.toLowerCase())) {
              new Notice(uiText(`\u6807\u7b7e\u5df2\u5b58\u5728\uff1a${nextTag}`, `Tag already exists: ${nextTag}`));
              return;
            }

            const saved = await saveMaterialReadingPointTags(material, [...currentTags, nextTag]);
            if (!saved) {
              new Notice(uiText('\u4fdd\u5b58\u6807\u7b7e\u5931\u8d25', 'Failed to save tag'));
              return;
            }

            new Notice(uiText(`\u5df2\u6dfb\u52a0\u6807\u7b7e\uff1a${nextTag}`, `Added tag: ${nextTag}`));
            await recomputeAndRefreshSidebar('reading_point_tags_changed');
          });
      });

      sub.addItem((item) => {
        item.setTitle(uiText('\u6dfb\u52a0\u5df2\u6709\u6807\u7b7e', 'Add existing tag')).setIcon('tags');
        const selectSub = (item as any).setSubmenu();
        const sections = buildGroupedTagSections(knownTags, groups);

        if (sections.length === 0) {
          selectSub.addItem((subItem: any) => {
            subItem.setTitle(uiText('\u6682\u65e0\u53ef\u6dfb\u52a0\u6807\u7b7e', 'No available tags')).setIcon('inbox').setDisabled(true);
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
                      new Notice(uiText('\u4fdd\u5b58\u6807\u7b7e\u5931\u8d25', 'Failed to save tag'));
                      return;
                    }

                    new Notice(uiText(`\u5df2\u6dfb\u52a0\u6807\u7b7e\uff1a${tag}`, `Added tag: ${tag}`));
                    await recomputeAndRefreshSidebar('reading_point_tags_changed');
                  });
              });
            }
          });
        }
      });

      sub.addItem((item) => {
        item.setTitle(uiText('\u79fb\u9664\u6807\u7b7e', 'Remove tag')).setIcon('minus-circle');
        const removeSub = (item as any).setSubmenu();

        if (currentTags.length === 0) {
          removeSub.addItem((subItem: any) => {
            subItem.setTitle(uiText('\u6682\u65e0\u53ef\u79fb\u9664\u6807\u7b7e', 'No tags to remove')).setIcon('inbox').setDisabled(true);
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
                  new Notice(uiText('\u4fdd\u5b58\u6807\u7b7e\u5931\u8d25', 'Failed to save tag'));
                  return;
                }

                new Notice(uiText(`\u5df2\u79fb\u9664\u6807\u7b7e\uff1a${tag}`, `Removed tag: ${tag}`));
                await recomputeAndRefreshSidebar('reading_point_tags_changed');
              });
          });
        }
      });
    } catch (error) {
      logger.error('[IRCalendarSidebar] Failed to load reading tag submenu.', error);
      sub.addItem((item) => {
        item.setTitle(uiText('\u52a0\u8f7d\u6807\u7b7e\u5931\u8d25', 'Failed to load tags')).setIcon('alert-triangle').setDisabled(true);
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
          .setTitle(uiText('\u9605\u8bfb\u6807\u7b7e', 'Reading tags'))
          .setIcon('hash');
        const sub = (item as any).setSubmenu();
        void loadReadingTagSubmenu(sub, material);
      });

      menu.addItem((item) => {
        item
          .setTitle(uiText('\u6807\u7b7e\u7ec4', 'Tag group'))
          .setIcon('tags');
        const sub = (item as any).setSubmenu();
        void loadTagGroupSubmenu(sub, material);
      });

      menu.addItem((item) => {
        item
          .setTitle(uiText('\u5173\u8054\u7b14\u8bb0', 'Associated note'))
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

    if (diffDays < 0) return t('irSidebar.controls.overdueDays', { count: Math.abs(diffDays) });
    if (diffDays === 0) return t('irSidebar.controls.dueToday');
    if (diffDays === 1) return t('irSidebar.controls.dueTomorrow');
    return t('irSidebar.controls.dueInDays', { count: diffDays });
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
        new Notice(t('irSidebar.scheduling.postponed', { date: new Date(nextRepDate).toLocaleDateString() }));
      } else {
        const actionLabelMap: Record<string, string> = {
          intensive: t('irSidebar.scheduling.intensive'),
          normal: t('irSidebar.scheduling.normal'),
          slow: t('irSidebar.scheduling.slow'),
          postpone: t('irSidebar.scheduling.postpone')
        };
        const actionLabel = actionLabelMap[action] || action;
        new Notice(t('irSidebar.scheduling.modeApplied', { mode: actionLabel, days: intervalDays }));
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
      if (nextMaterial) {
        const refreshedNextMaterial = findScheduleItemById(nextMaterial.id) ?? nextMaterial;
        await openMaterial(refreshedNextMaterial);
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
        const requestedDeckId = getRequestedDeckFilterId();
        const queryResult = await getCalendarQueryService().getCalendarQueryResult({
          deckIds: requestedDeckId ? [requestedDeckId] : undefined,
          forceRecompute: options.forceRecompute,
          reason: 'ui_refresh'
        });
        const { workspaceData } = queryResult;
        const { decksRecord, blocksRecord } = workspaceData;
        const byDate = queryResult.materialsByDate;
        const suspendedPool = queryResult.continueReadingSuspendedItemsPool;

        await Promise.all([
          refreshReadingPointTagMap(byDate),
          loadTimerTotalsFromHistory()
        ]);

        if (requestId !== loadDataRequestId) {
          return;
        }

        irDecks = Object.values(decksRecord);
        allBlocks = Object.values(blocksRecord);
        readingMaterials = queryResult.readingMaterials;
        materialsByDate = byDate;
        continueReadingSuspendedItemsPool = suspendedPool;
        lastAppliedScheduleGeneratedAt = queryResult.schedule.generatedAt;
        syncSelectionToFocusedDeck();

        logger.debug('[IRCalendarSidebar] Recovered debug message.', {
          decks: irDecks.length,
          blocks: allBlocks.length,
          dates: byDate.size,
          generatedAt: queryResult.schedule.generatedAt,
          triggerReason: queryResult.schedule.triggerReason
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

        await refreshSidebarAfterDataUpdate();
      }, 100);
    };
    window.addEventListener('Weave:ir-data-updated', handleDataUpdate);
    const handleMaterialFinished = (event: Event) => {
      const detail = (event as CustomEvent<IRMaterialFinishedEventDetail>).detail;
      if (!detail?.blockId) return;
      const currentBlockId = detail.blockId;

      void (async () => {
        if (activeReadingTimer?.blockId === currentBlockId) {
          await pauseActiveReadingTimer(detail.reason === 'skipped' ? 'skipped' : 'completed', currentBlockId);
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


  let monthDays = $derived(getCalendarDisplayDays(getMonthDays(currentDate.getFullYear(), currentDate.getMonth())));
  let weekdayLabels = $derived(IR_CALENDAR_WEEKDAY_KEYS.map((key) => ({
    key,
    label: t(`irSidebar.controls.${key}`),
    isWeekend: key === 'weekdaySat' || key === 'weekdaySun'
  })));
  let unfilteredSelectedMaterials = $derived(getSelectedMaterialsBase());
  let selectedMaterials = $derived(getSelectedMaterials());
  let searchableScheduleEntries = $derived(getSearchableScheduleEntries());
  let hasActiveSearch = $derived(Boolean(parsedSearchQuery?.raw.trim()));
  let searchMatchedEntries = $derived(getMatchedSearchEntries());
  let displayedMaterials = $derived.by(() =>
    hasActiveSearch ? searchMatchedEntries.map((entry) => entry.item) : selectedMaterials
  );
  let displayedMaterialDateKeys = $derived.by(() => {
    const dateKeys = new Map<string, string>();
    if (hasActiveSearch) {
      for (const entry of searchMatchedEntries) {
        dateKeys.set(entry.item.id, entry.dateKey);
      }
      return dateKeys;
    }

    const currentDateKey = formatDateKey(selectedDate);
    for (const item of selectedMaterials) {
      dateKeys.set(item.id, currentDateKey);
    }
    return dateKeys;
  });
  let searchAvailableDecks = $derived.by(() =>
    irDecks.map((deck) => ({
      id: String(deck.id || '').trim(),
      name: String(deck.name || '').trim(),
      description: '',
      category: '',
      path: String((deck as any).path || deck.id || '').trim(),
      level: 0,
      order: 0,
      inheritSettings: false,
      settings: {
        newCardsPerDay: 0,
        maxReviewsPerDay: 0,
        showAnswerTimer: false,
        answerTimerSeconds: 0,
        randomMode: false,
        useFSRS: false,
        easyInterval: 0,
      },
      stats: {
        totalCards: 0,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        suspendedCards: 0,
        averageEase: 0,
        retentionRate: 0,
        studyStreak: 0,
        totalReviews: 0,
        averageReviewTime: 0,
      },
      includeSubdecks: false,
      created: '',
      modified: '',
      tags: [],
      metadata: {},
    } as unknown as Deck))
  );
  let searchAvailableTags = $derived.by(() =>
    Array.from(
      new Set(
        Object.values(readingPointTagsById)
          .flatMap((tags) => tags || [])
          .map((tag) => String(tag || '').trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  );
  let searchAvailablePriorities = $derived.by(() =>
    Array.from(new Set(searchableScheduleEntries.map((entry) => Number(entry.item.priority || 0)))).sort((a, b) => a - b)
  );
  let searchAvailableSources = $derived.by(() =>
    Array.from(
      new Set(
        searchableScheduleEntries
          .map((entry) => String(entry.item.sourceFile || '').trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  );
  let searchAvailableStates = $derived.by(() =>
    Array.from(
      new Set(
        searchableScheduleEntries
          .map((entry) => String(entry.item.scheduleStatus || '').trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  );
  let searchAvailableYamlKeys = $derived.by(() => {
    const keys = new Set<string>();
    for (const entry of searchableScheduleEntries) {
      for (const key of Object.keys(getScheduleItemFrontmatter(entry.item))) {
        if (key) {
          keys.add(key);
        }
      }
    }
    return Array.from(keys).sort((left, right) => left.localeCompare(right, 'zh-CN'));
  });
  let hasContinueReadingSuggestionOffer = $derived(shouldOfferContinueReadingSuggestions());
  let shouldShowTodayCompletedEmptyState = $derived(
    !isLoading &&
    !hasActiveSearch &&
    isSameDay(selectedDate, today) &&
    selectedMaterials.length === 0 &&
    unfilteredSelectedMaterials.length === 0 &&
    !activeReadingTagFilter
  );
  let selectedDateTagOptions = $derived(getSelectedDateTagOptions());
  let materialListProps = $derived({
    displayedMaterials,
    hasActiveSearch,
    displayedMaterialDateKeys,
    continuousReadingEnabled,
    expandedMaterialIds,
    loadingSiblings,
    siblingCache,
    processedChunkIds,
    timerBusyBlockId,
    t,
    getDisplayedMaterialDateLabel,
    getScheduleItemDeckName,
    getMaterialExpandButtonLabel,
    handleMaterialClick,
    openMaterial,
    toggleMaterialExpand,
    handleMaterialContextMenu,
    handleLongPressStart,
    handleLongPressMove,
    handleLongPressEnd,
    openSchedulingMenu,
    hasVisibleAssociatedNote,
    getAssociatedNoteActionLabel,
    getAssociatedNoteActionTooltip,
    handleAssociatedNoteClick,
    isTimerRunningForBlock,
    getDisplayedTimerSeconds,
    getReadingTimerButtonTitle,
    toggleReadingTimer,
    formatCompactTimerDuration,
    formatTimerDuration,
    formatSiblingDueDate,
  } satisfies IRCalendarMaterialListProps);
  let monthNumber = $derived(currentDate.getMonth() + 1);
  let monthYear = $derived(currentDate.getFullYear());
</script>

<div
  class="ir-calendar-sidebar"
  class:has-background-wall={Boolean(calendarBackgroundWallImageUrl)}
  style={`--calendar-background-wall-fade-ratio: ${Number(calendarBackgroundWallFadePercent) / 100};`}
  bind:this={calendarSidebarEl}
>
  <div class="calendar-background-wall" aria-hidden="true">
    {#if calendarBackgroundWallImageUrl}
      <div class="calendar-background-wall__image" style={`background-image: url('${calendarBackgroundWallImageUrl}');`}></div>
      <div class="calendar-background-wall__veil"></div>
      <div class="calendar-background-wall__mist"></div>
    {/if}
  </div>
  <!-- Incremental reading calendar sidebar -->
  <div class="calendar-header">
    <div class="calendar-title-group">
      <span class="month-title">
        <span class="month-title__month">{monthNumber}</span>
        <span class="month-title__year">{monthYear}</span>
      </span>
      {#if getActiveDeckFilterName()}
        <span class="month-focus-topic" title={sourceFilePath || getActiveDeckFilterName()}>
          {t('irSidebar.header.topicPrefix')}：{getActiveDeckFilterName()}
        </span>
      {/if}
    </div>
    <div class="month-nav" aria-label={t('irSidebar.title')}>
      <button
        class="calendar-tool-btn clickable-icon nav-btn"
        type="button"
        onclick={prevMonth}
        aria-label={t('irSidebar.header.prevMonth')}
        title={t('irSidebar.header.prevMonth')}
      >
        <ObsidianIcon name="chevron-left" size={14} />
      </button>
      <button class="today-btn clickable-icon" type="button" onclick={goToToday} title={t('irSidebar.header.today')}>{t('irSidebar.header.today')}</button>
      <button
        class="calendar-tool-btn clickable-icon nav-btn"
        type="button"
        onclick={nextMonth}
        aria-label={t('irSidebar.header.nextMonth')}
        title={t('irSidebar.header.nextMonth')}
      >
        <ObsidianIcon name="chevron-right" size={14} />
      </button>
    </div>
    <div class="calendar-tools">
      {#if hasContinueReadingSuggestionOffer}
        <button
          class="today-btn continue-reading-trigger-btn"
          type="button"
          bind:this={continueReadingTriggerEl}
          onclick={() => { void openContinueReadingSuggestionsModal(true); }}
          title={uiText('打开继续阅读建议', 'Open continue reading suggestions')}
          aria-label={uiText('打开继续阅读建议', 'Open continue reading suggestions')}
        >
          {uiText('建议', 'More')}
        </button>
      {/if}
      <button
        class="calendar-tool-btn clickable-icon"
        class:active={showSearchPanel}
        type="button"
        onclick={toggleSearchPanel}
        title={uiText('搜索增量阅读材料', 'Search incremental reading materials')}
        aria-label={uiText('搜索增量阅读材料', 'Search incremental reading materials')}
      >
        <ObsidianIcon name="search" size={15} />
      </button>
      <button
        class="calendar-tool-btn clickable-icon"
        type="button"
        bind:this={calendarToolsTriggerEl}
        onclick={showMonthCalendarToolsMenu}
        title={uiText('更多月历功能', 'More calendar actions')}
        aria-label={uiText('更多月历功能', 'More calendar actions')}
      >
        <ObsidianIcon name="more-vertical" size={16} />
      </button>
    </div>
  </div>

  {#if showSearchPanel}
    <div class="calendar-search-panel">
      <CardSearchInput
        app={plugin.app}
        bind:value={searchQuery}
        dataSource="incremental-reading"
        availableDecks={searchAvailableDecks}
        availableTags={searchAvailableTags}
        availablePriorities={searchAvailablePriorities}
        availableSources={searchAvailableSources}
        availableStates={searchAvailableStates}
        availableYamlKeys={searchAvailableYamlKeys}
        matchCount={hasActiveSearch ? searchMatchedEntries.length : -1}
        totalCount={searchableScheduleEntries.length}
        onSearch={handleSearch}
        onClear={clearSearch}
        placeholder={uiText('搜索阅读点、专题、来源、状态', 'Search points, decks, sources, states')}
      />
    </div>
  {/if}


  <div class="calendar-grid-container">
    <div class="weekdays">
      {#each weekdayLabels as weekday}
        <span class="weekday" class:weekend={weekday.isWeekend}>{weekday.label}</span>
      {/each}
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
        <span>{t('irSidebar.loadingCalendar')}</span>
      </div>
    {:else if displayedMaterials.length > 0}
      <IRCalendarMaterialList {...materialListProps} />
    {:else if hasActiveSearch}
      <div class="loading-state search-empty-state">
        <ObsidianIcon name="search" size={20} />
        <span>{uiText('未找到符合搜索条件的增量阅读材料', 'No incremental reading materials matched your search')}</span>
        <button type="button" class="clear-tag-filter-btn" onclick={clearSearch}>{uiText('清空搜索', 'Clear search')}</button>
      </div>
    {:else if unfilteredSelectedMaterials.length > 0 && activeReadingTagFilter}
      <div class="loading-state">
        <ObsidianIcon name="tag" size={20} />
        <span>??????? #{activeReadingTagFilter} ????</span>
        <button type="button" class="clear-tag-filter-btn" onclick={() => { activeReadingTagFilter = ''; }}>??????</button>
      </div>
    {:else if shouldShowTodayCompletedEmptyState}
      <div class="reading-empty-state" aria-live="polite">
        <div class="reading-empty-state__title">当天所有阅读点都已阅读完毕！</div>
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
    --calendar-background-wall-fade-ratio: 0.72;
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
    position: relative;
    isolation: isolate;
  }

  .ir-calendar-sidebar > :not(.calendar-background-wall) {
    position: relative;
    z-index: 1;
  }

  .calendar-background-wall {
    position: absolute;
    inset: 0 0 auto 0;
    height: min(58%, 420px);
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }

  .calendar-background-wall__image,
  .calendar-background-wall__veil,
  .calendar-background-wall__mist {
    position: absolute;
    inset: 0;
  }

  .calendar-background-wall__image {
    background-position: center top;
    background-repeat: no-repeat;
    background-size: cover;
    opacity: calc(1 - (var(--calendar-background-wall-fade-ratio) * 0.78));
    transform: scale(calc(1 + (var(--calendar-background-wall-fade-ratio) * 0.04)));
    filter:
      saturate(calc(1 - (var(--calendar-background-wall-fade-ratio) * 0.1)))
      contrast(calc(1 - (var(--calendar-background-wall-fade-ratio) * 0.04)));
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.96) 0%, rgba(0, 0, 0, 0.78) 54%, transparent 100%);
    -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.96) 0%, rgba(0, 0, 0, 0.78) 54%, transparent 100%);
  }

  .calendar-background-wall__veil {
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--weave-ir-sidebar-surface-background) calc(var(--calendar-background-wall-fade-ratio) * 18%), transparent) 0%,
        color-mix(in srgb, var(--weave-ir-sidebar-surface-background) calc(var(--calendar-background-wall-fade-ratio) * 34%), transparent) 22%,
        color-mix(in srgb, var(--weave-ir-sidebar-surface-background) calc(var(--calendar-background-wall-fade-ratio) * 62%), transparent) 58%,
        var(--weave-ir-sidebar-surface-background) 100%
      );
  }

  .calendar-background-wall__mist {
    background:
      radial-gradient(circle at 14% 14%, color-mix(in srgb, white calc(var(--calendar-background-wall-fade-ratio) * 12%), transparent) 0%, transparent 48%),
      radial-gradient(circle at 86% 22%, color-mix(in srgb, white calc(var(--calendar-background-wall-fade-ratio) * 10%), transparent) 0%, transparent 42%),
      linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--weave-ir-sidebar-surface-background) calc(var(--calendar-background-wall-fade-ratio) * 12%), transparent) 72%, transparent 100%);
    opacity: calc(var(--calendar-background-wall-fade-ratio) * 0.78);
  }

  .ir-calendar-sidebar.has-background-wall .calendar-grid-container {
    position: relative;
  }


  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 18px;
    min-width: 0;
  }

  .month-focus-topic {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--background-modifier-border) 30%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

  .calendar-tool-btn.active {
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-secondary));
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
    min-width: 0;
  }

  .calendar-search-panel {
    margin: 0 0 10px;
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

  .continue-reading-trigger-btn {
    color: var(--interactive-accent);
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 32%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--interactive-accent) 8%, transparent);
  }

  .continue-reading-trigger-btn:hover {
    color: var(--interactive-accent);
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
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

  .ir-calendar-sidebar.has-background-wall .weekday {
    color: color-mix(in srgb, var(--text-normal) 84%, var(--weave-ir-sidebar-surface-background));
    text-shadow:
      0 1px 2px color-mix(in srgb, var(--weave-ir-sidebar-surface-background) 74%, transparent),
      0 0 1px color-mix(in srgb, var(--weave-ir-sidebar-surface-background) 68%, transparent);
  }

  .ir-calendar-sidebar.has-background-wall .weekday.weekend {
    color: color-mix(in srgb, var(--color-orange) 42%, var(--text-normal));
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
    opacity: 1;
  }

  .day-cell.other-month .day-number {
    color: color-mix(in srgb, var(--text-muted) 86%, var(--weave-ir-sidebar-surface-background));
    opacity: 0.72;
  }

  .day-cell.other-month .day-status-chip,
  .day-cell.other-month .heat-dot-row {
    opacity: 0.52;
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

  .ir-calendar-sidebar.has-background-wall .day-number {
    color: color-mix(in srgb, var(--text-normal) 94%, var(--weave-ir-sidebar-surface-background));
    text-shadow:
      0 1px 2px color-mix(in srgb, var(--weave-ir-sidebar-surface-background) 76%, transparent),
      0 0 1px color-mix(in srgb, var(--weave-ir-sidebar-surface-background) 62%, transparent);
  }

  .ir-calendar-sidebar.has-background-wall .day-cell.other-month .day-number {
    color: color-mix(in srgb, var(--text-muted) 92%, var(--weave-ir-sidebar-surface-background));
    opacity: 0.78;
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

  .reading-empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px 12px 22px;
    margin-top: 8px;
    border: 1px dashed color-mix(in srgb, var(--background-modifier-border) 86%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--background-secondary) 72%, transparent);
    text-align: center;
    pointer-events: none;
  }

  .reading-empty-state__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    line-height: 1.5;
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
  
  .ir-calendar-scheduling-menu {
    min-width: 220px;
  }

  :global(.floating-menu.ir-calendar-priority-menu) {
    width: min(360px, calc(100vw - 24px));
    min-width: min(360px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    border-radius: 20px;
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 16%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--background-primary) 94%, var(--background-secondary));
    box-shadow:
      0 18px 40px color-mix(in srgb, var(--background-primary) 18%, transparent),
      0 4px 14px rgba(0, 0, 0, 0.08);
    backdrop-filter: blur(10px);
    overflow: hidden;
  }

  :global(.floating-menu.ir-calendar-priority-menu .ir-calendar-priority-panel) {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
    background: transparent;
  }

  :global(.floating-menu.ir-calendar-priority-menu .ir-calendar-preview-summary) {
    margin: 0 16px 16px;
    padding: 12px 14px;
    border-radius: 16px;
    border-color: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-modifier-border));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--interactive-accent) 5%, var(--background-secondary)),
      color-mix(in srgb, var(--background-primary) 96%, var(--background-secondary))
    );
    box-shadow: none;
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

  .search-empty-state {
    gap: 8px;
  }
</style>
