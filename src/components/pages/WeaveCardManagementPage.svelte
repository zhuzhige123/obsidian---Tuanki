<script lang="ts">
  import { logger } from '../../utils/logger';
  import { vaultStorage } from '../../utils/vault-local-storage';
  import { writeSystemClipboardText } from '../../utils/system-clipboard';

  import type { WeaveDataStorage } from "../../data/storage";
  import type { FSRS } from "../../algorithms/fsrs";
  import type { WeavePlugin } from "../../main";
  import {
    deleteMemoryCard as deleteMemoryCardCommand,
    deleteMemoryCards as deleteMemoryCardsCommand,
    saveMemoryCard as saveMemoryCardCommand,
  } from "../../services/weave-domain";

  import type { Card, Deck } from "../../data/types";
  import type { TimeFilterType } from "../../types/time-filter-types";
  import { MarkdownView, Platform, Menu, TFile, Modal, FuzzySuggestModal, normalizePath } from "obsidian";
  import type { WorkspaceLeaf } from "obsidian";
  import { default as EnhancedIcon } from "../ui/ObsidianIcon.svelte";
  import BouncingBallsLoader from "../ui/BouncingBallsLoader.svelte";
  import WeaveCardTable from "../tables/WeaveCardTable.svelte";
  import TableSortingOverlay from "../tables/components/TableSortingOverlay.svelte";
  import KanbanView from "../study/KanbanView.svelte";
  import GridView from "../views/GridView.svelte";
  import MasonryGridView from "../views/MasonryGridView.svelte";
  import GridTimelineView from "../views/GridTimelineView.svelte";
  import WeaveBatchToolbar from "../batch/WeaveBatchToolbar.svelte";
  // BatchTemplateChangeModal 已删除（基于弃用的字段模板系统）
  // BatchDeckChangeModal、BatchRemoveTagsModal、BatchAddTagsModal 已改用 Obsidian Menu API
  // v2.0 引用式牌组系统模态窗
  import BuildDeckModal from "../modals/BuildDeckModal.svelte";
  import { MarkdownFileSuggestModal } from "../../modals/MarkdownFileSuggestModal";
  import { BatchTagSuggestModal, type BatchTagSuggestItem } from "../../modals/BatchTagSuggestModal";
  // v2.2 数据管理模态窗
  import { ColumnManagerModalObsidian } from "../modals/ColumnManagerModalObsidian";
  import { DataManagementModalObsidian } from "../modals/DataManagementModalObsidian";
  import CardToMarkdownModal from "../modals/CardToMarkdownModal.svelte";
  // EditCardModal 已改为全局方法，不再局部导入
  import { EmbeddableEditorManager } from "../../services/editor/EmbeddableEditorManager";

  import TablePagination from "../ui/TablePagination.svelte";
  import { ICON_NAMES } from "../../icons/index.js";
  import { DEFAULT_COLUMN_ORDER, COLUMN_GROUPS, type ColumnOrder, type ColumnKey, type ColumnGroups } from "../tables/types/table-types";
  import { onDestroy, onMount, tick, untrack } from "svelte";

  import { waitForServiceReady } from "../../utils/service-ready-event";
  import {
    resolveKanbanGroupBy,
    normalizeKanbanGroupByForSource,
    type KanbanGroupBy,
    type KanbanDataSourceType,
  } from "../study/kanban-grouping";

  import { getCardContentBySide } from "../../utils/helpers";
  import { showNotification } from "../../utils/notifications";
  // 源文档路径筛选工具
  import { extractSourceBlock, extractSourcePath, filterCardsBySourceDocument } from "../../utils/source-path-matcher";
  // 标签层级筛选工具
  import { getCardTagValues, matchesTagFilter, removeHashPrefix } from "../../utils/tag-utils";
  // 旧的三位一体模板系统已完全移除
  import { Notice } from "obsidian";
  // v2.2: 导入牌组获取工具和内容解析工具（Content-Only 架构）
  import {
    getCardMetadata,
    setCardProperties,
    getCardDeckIds,
    getCardDeckIdsFromFormalSource,
    getCardDeckNames as getCardDeckNamesFromYaml,
    extractBodyContent,
    parseSourceInfo,
    parseYAMLFromContent,
    buildContentWithYAML
  } from "../../utils/yaml-utils";
  import { MAIN_SEPARATOR } from "../../constants/markdown-delimiters";
  import { cardsToCSV, groupCardsBySource, groupCardsByMonth, groupCardsByDeck, sanitizeFileName, type ExportGroupMode } from "../../utils/card-export-utils";
  import { showObsidianConfirm } from "../../utils/obsidian-confirm";
  import {
    addMenuRadioChoices,
    addMenuSubmenuGroup,
    attachMenuApp,
  } from "../../utils/obsidian-menu";
  import { detectCardQuestionType, getQuestionTypeDistribution } from "../../utils/card-type-utils";
  import { isInputClozeQuestionContent } from "../../utils/question-bank/input-cloze-utils";
  import { getErrorBookDistribution, getCardErrorLevel } from "../../utils/error-book-utils";
  import { syncCardStatsToCanonicalFormat } from "../../utils/card-stats-normalizer";
  import { CardType } from "../../data/types";
  import { applyTimeFilter } from "../../utils/time-filter-utils";
  import { batchUpdateCards, mergeUnmappedFields, deleteFields } from "../../services/batch-operation-service";
  import { WDECK_UNGROUPED_DECK_NAME } from "../../services/wdeck/WDeckService";
  import { getCanvasLocateSupportFromCardContent, normalizeCanvasNodeId } from "../../services/ui/canvas-source-locate";
  // 卡片详情模态窗改用全局方法 plugin.openViewCardModal()
  // 导入国际化
  import { tr } from "../../utils/i18n";
  import {
    buildTagSuggestionOptions,
    expandTagSuggestionPaths,
    formatTagSuggestionLabel,
    normalizeTagSuggestionOptions,
    normalizeTagSuggestionValue,
  } from "../../utils/tag-suggest";
  import { FilterManager } from "../../services/filter-manager";
  import { isCardManagementToolbarDispatchAction } from "../../utils/card-management-toolbar-contract";
  import { openWeaveMainMenu } from "../../utils/weave-main-menu";
  import { buildWeaveCardReferenceLabel, collectWeaveRelatedCardUUIDs } from "../../utils/weave-card-reference";
  import { TFolder } from "obsidian";
  
  // v2.1 YAML 元数据服务
  import { getCardMetadataService } from "../../services/CardMetadataService";
  import { invalidateCardCache } from "../../services/CardMetadataCache";
  import type { SavedFilter } from "../../types/filter-types";
  
  // 高级功能守卫
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from "../../services/premium/PremiumFeatureGuard";
  import ActivationPrompt from "../premium/ActivationPrompt.svelte";
  
  // 题库数据存储
  import { QuestionBankStorage } from "../../services/question-bank/QuestionBankStorage";
  import type { QuestionTestStats } from "../../types/question-bank-types";
  
  
  // 移动端组件
  import MobileCardManagementHeader from "../study/MobileCardManagementHeader.svelte";
  // MobileCardManagementMenu 已移除 - 现在使用 Obsidian Menu API
  
  // 卡片搜索组件
  import CardSearchInput from "../search/CardSearchInput.svelte";
  import { parseSearchQuery, matchSearchQuery } from "../../utils/search-parser";
  import type { SearchQuery } from "../../utils/search-parser";
  import { getQuestionTypeLabelFromCard } from "../../utils/question-type-utils";
  
  // 增量阅读活动文档 store（用于文档关联筛选）
  import { irActiveDocumentStore } from "../../stores/ir-active-document-store";
  // EPUB阅读器活动文档store（用于文档关联筛选）
  import { epubActiveDocumentStore } from "../../stores/epub-active-document-store";
  import { EPUB_RUNTIME } from "../../services/epub-integration";
  
  import { IRStorageService } from "../../services/incremental-reading/IRStorageService";
  import { loadIRCardManagementData } from "../../services/incremental-reading/IRCardManagementLoader";
  import {
    updateIRCardManagementAssociatedNotes,
    updateIRCardManagementDecks,
    updateIRCardManagementPriority,
    updateIRCardManagementTags,
  } from "../../services/incremental-reading/IRCardManagementMutationService";
  import { resolveAssociatedNotePaths } from "../../services/incremental-reading/IRAssociatedNoteSignals";
  import { IRPointWriteService } from "../../services/incremental-reading/IRPointWriteService";
  import { recomputeAndBroadcastIRData } from "../../services/incremental-reading";
  import {
    clearPendingCardManagementFilterByCardsRequest,
    consumePendingCardManagementFilterByCardsRequest,
    normalizeCardManagementFilterByCardsRequest,
    type CardManagementFilterByCardsRequest,
  } from "../../services/navigation/card-management-navigation";
  import {
    createAssociatedMarkdownNote,
    getAssociatedMarkdownLabel,
    openAssociatedMarkdownNote,
    populateAssociatedNoteMenu,
    resolvePreferredAssociatedNoteFolder,
  } from "../../services/incremental-reading/IRAssociatedNoteMenu";
  import { applyIRCardManagementSourceStats } from "../../services/incremental-reading/IRCardManagementSourceAdapter";
  import {
    detectTraceSourceKind,
    normalizeTraceDocumentKey,
    normalizeTraceSubunitKey,
    type IRTraceSourceKind
  } from "../../services/incremental-reading/IRSourceTraceStats";
  import { getEmergentDeckService } from "../../services/deck/EmergentDeckService";
  import type { IRBlock, IRDeck } from "../../types/ir-types";
  import type { MemoryDeckOrganizationRuntime } from "../../types/emergent-deck-types";
  import { getChunkTopicIds, getTaskTopicId } from "../../utils/ir-topic-compat";
  
  import { SourceNavigationService } from "../../services/ui/SourceNavigationService";
  import { createGlobalOperationController, type GlobalOperationController } from "../../utils/global-operation-progress";
  import { applyStyleProps } from "../../utils/style-props";
  
  class ExportFolderPickerModal extends FuzzySuggestModal<string> {
    private folders: string[];
    private onChoose: (item: string) => void;
    constructor(app: import('obsidian').App, folders: string[], onChoose: (item: string) => void) {
      super(app);
      this.folders = folders;
      this.onChoose = onChoose;
    }
    getItems(): string[] { return this.folders; }
    getItemText(item: string): string { return item || '/  (Vault Root)'; }
    onChooseItem(item: string): void { this.onChoose(item); }
  }

  interface Props {
    dataStorage: WeaveDataStorage;
    plugin: WeavePlugin;
    fsrs: FSRS;
    currentLeaf?: WorkspaceLeaf;
  }

  let { dataStorage, plugin, currentLeaf }: Props = $props();

  // 响应式翻译函数
  let t = $derived($tr);

  // 基础状态管理
  let isMounted = $state(false);  // 组件挂载状态（onMount设置）
  let isViewVisible = $state(true); // 视图可见性（组件被渲染即可见）
  let isLoading = $state(true);
  let isViewSwitching = $state(false); // 视图切换加载状态
  let isViewDestroyed = false;  // 添加视图销毁状态（非响应式，用于清理）
  let cards = $state<Card[]>([]);
  let selectedCards = $state(new Set<string>()); // Set<uuid>
  let searchQuery = $state("");
  let parsedSearchQuery = $state<SearchQuery | null>(null);
  
  // 视图状态（从 plugin.settings 初始化）
  type GridCardAttributeType =
    | 'none'
    | 'uuid'
    | 'source'
    | 'priority'
    | 'retention'
    | 'modified'
    | 'accuracy'
    | 'question_type'
    | 'ir_state'
    | 'ir_priority';
  type GridLayoutMode = 'fixed' | 'masonry' | 'timeline';
  
  const viewPrefs = untrack(() => ({
    currentView: 'table',
    gridLayout: 'fixed',
    gridCardAttribute: 'uuid',
    kanbanGroupBy: 'status',
    kanbanGroupByBySource: {
      memory: 'status',
      questionBank: 'status',
      'incremental-reading': 'deck'
    },
    kanbanSelectedTagGroupIdBySource: {
      memory: null,
      questionBank: null,
      'incremental-reading': null
    },
    kanbanLayoutMode: 'comfortable',
    tableViewMode: 'basic',
    enableCardRelationFilterMode: false,
    enableCardLocationJump: false,
    showTableGridBorders: true,
    ...(plugin.settings.cardManagementViewPreferences ?? {})
  }));
  
  // 高级功能守卫实例（优先初始化）
  const premiumGuard = PremiumFeatureGuard.getInstance();

  function resolveKanbanLayoutMode(value: unknown): 'compact' | 'comfortable' | 'spacious' {
    return value === 'compact' || value === 'comfortable' || value === 'spacious'
      ? value
      : 'comfortable';
  }

  function resolveTableViewMode(value: unknown): 'basic' | 'review' | 'questionBank' | 'irContent' {
    return value === 'basic' || value === 'review' || value === 'questionBank' || value === 'irContent'
      ? value
      : 'basic';
  }

  function resolveGridCardAttribute(value: unknown): GridCardAttributeType {
    return value === 'none'
      || value === 'uuid'
      || value === 'source'
      || value === 'priority'
      || value === 'retention'
      || value === 'modified'
      || value === 'accuracy'
      || value === 'question_type'
      || value === 'ir_state'
      || value === 'ir_priority'
      ? value
      : 'uuid';
  }

  function resolveGridLayoutMode(value: unknown): GridLayoutMode {
    if (value === 'timeline' && premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.TIMELINE_VIEW)) {
      return 'fixed';
    }

    return value === 'masonry' || value === 'timeline'
      ? value
      : 'fixed';
  }

  function resolveShowTableGridBorders(value: unknown): boolean {
    return typeof value === 'boolean' ? value : true;
  }

  function resolveGridCardBorderStyle(value: unknown): 'solid' | 'dashed' {
    return value === 'dashed' ? 'dashed' : 'solid';
  }

  function resolveKanbanGroupByBySource(value: unknown): Partial<Record<KanbanDataSourceType, KanbanGroupBy>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const sourceMap = value as Record<string, unknown>;
    const resolved: Partial<Record<KanbanDataSourceType, KanbanGroupBy>> = {};

    if (typeof sourceMap.memory !== 'undefined') {
      resolved.memory = resolveKanbanGroupBy(sourceMap.memory);
    }
    if (typeof sourceMap.questionBank !== 'undefined') {
      resolved.questionBank = resolveKanbanGroupBy(sourceMap.questionBank);
    }
    if (typeof sourceMap['incremental-reading'] !== 'undefined') {
      resolved['incremental-reading'] = resolveKanbanGroupBy(sourceMap['incremental-reading']);
    }

    return resolved;
  }

  function getLegacyKanbanSelectedTagGroupStorageKey(source: KanbanDataSourceType): string {
    return `weave-card-kanban-selected-tag-group:${source}`;
  }

  function resolveKanbanSelectedTagGroupIdBySource(
    value: unknown
  ): Partial<Record<KanbanDataSourceType, string | null>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const sourceMap = value as Record<string, unknown>;
    const resolved: Partial<Record<KanbanDataSourceType, string | null>> = {};
    const normalizeTagGroupId = (rawValue: unknown): string | null | undefined => {
      if (rawValue === null) {
        return null;
      }
      if (typeof rawValue !== 'string') {
        return undefined;
      }
      const normalizedValue = rawValue.trim();
      return normalizedValue || null;
    };

    if (typeof sourceMap.memory !== 'undefined') {
      const normalizedValue = normalizeTagGroupId(sourceMap.memory);
      if (typeof normalizedValue !== 'undefined') {
        resolved.memory = normalizedValue;
      }
    }
    if (typeof sourceMap.questionBank !== 'undefined') {
      const normalizedValue = normalizeTagGroupId(sourceMap.questionBank);
      if (typeof normalizedValue !== 'undefined') {
        resolved.questionBank = normalizedValue;
      }
    }
    if (typeof sourceMap['incremental-reading'] !== 'undefined') {
      const normalizedValue = normalizeTagGroupId(sourceMap['incremental-reading']);
      if (typeof normalizedValue !== 'undefined') {
        resolved['incremental-reading'] = normalizedValue;
      }
    }

    return resolved;
  }

  function getCardManagementViewPreferencesSnapshot() {
    return plugin.settings.cardManagementViewPreferences ?? viewPrefs;
  }

  function getPreferredKanbanGroupByForSource(
    source: KanbanDataSourceType,
    fallbackValue?: KanbanGroupBy
  ): KanbanGroupBy {
    const preferences = getCardManagementViewPreferencesSnapshot();
    const sourcePreferences = resolveKanbanGroupByBySource(preferences.kanbanGroupByBySource);
    const preferredValue = sourcePreferences[source] ?? fallbackValue ?? resolveKanbanGroupBy(preferences.kanbanGroupBy);
    return normalizeKanbanGroupByForSource(preferredValue, source);
  }

  function getPreferredKanbanSelectedTagGroupIdForSource(
    source: KanbanDataSourceType,
    fallbackValue?: string | null
  ): string | null {
    const preferences = getCardManagementViewPreferencesSnapshot();
    const sourcePreferences = resolveKanbanSelectedTagGroupIdBySource(preferences.kanbanSelectedTagGroupIdBySource);
    if (typeof sourcePreferences[source] !== 'undefined') {
      return sourcePreferences[source] ?? null;
    }
    if (typeof fallbackValue !== 'undefined') {
      return fallbackValue;
    }
    const legacyValue = vaultStorage.getItem(getLegacyKanbanSelectedTagGroupStorageKey(source));
    return legacyValue ? legacyValue : null;
  }
  
  // 视图权限检查和降级
  function getInitialView(): 'table' | 'grid' | 'kanban' {
    const savedView = viewPrefs.currentView;
    // 如果保存的是网格视图但没有权限，降级到表格视图
    if (savedView === 'grid' && !premiumGuard.canUseFeature(PREMIUM_FEATURES.GRID_VIEW)) {
      return 'table';
    }
    // 如果保存的是看板视图但没有权限，降级到表格视图
    if (savedView === 'kanban' && !premiumGuard.canUseFeature(PREMIUM_FEATURES.KANBAN_VIEW)) {
      return 'table';
    }
    // 只返回允许的视图类型
    if (savedView === 'table' || savedView === 'grid' || savedView === 'kanban') {
      return savedView;
    }
    return 'table';
  }

  const initialView = getInitialView();
  const initialGridLayout = resolveGridLayoutMode(viewPrefs.gridLayout);
  const initialKanbanGroupBy = getPreferredKanbanGroupByForSource('memory');
  const initialKanbanSelectedTagGroupId = getPreferredKanbanSelectedTagGroupIdForSource('memory');
  const initialSelectedTagGroupMap = resolveKanbanSelectedTagGroupIdBySource(viewPrefs.kanbanSelectedTagGroupIdBySource);
  const shouldPersistResolvedViewPreferences =
    initialView !== viewPrefs.currentView
    || initialGridLayout !== viewPrefs.gridLayout
    || initialKanbanGroupBy !== getPreferredKanbanGroupByForSource('memory', resolveKanbanGroupBy(viewPrefs.kanbanGroupBy))
    || (typeof initialSelectedTagGroupMap.memory === 'undefined' && initialKanbanSelectedTagGroupId !== null);
  
  let currentView = $state<'table' | 'grid' | 'kanban'>(initialView);
  let gridLayout = $state<GridLayoutMode>(initialGridLayout);
  let kanbanGroupBy = $state<KanbanGroupBy>(initialKanbanGroupBy); // 看板分组方式
  let kanbanSelectedTagGroupId = $state<string | null>(initialKanbanSelectedTagGroupId);
  let kanbanLayoutMode = $state<'compact' | 'comfortable' | 'spacious'>(resolveKanbanLayoutMode(viewPrefs.kanbanLayoutMode));
  let tableViewMode = $state<'basic' | 'review' | 'questionBank' | 'irContent'>(resolveTableViewMode(viewPrefs.tableViewMode));
  let enableCardRelationFilterMode = $state(Boolean(viewPrefs.enableCardRelationFilterMode));
  let enableCardLocationJump = $state(viewPrefs.enableCardLocationJump);
  let relationFilterAnchorCardUuid = $state<string | null>(null);
  let showTableGridBorders = $state(resolveShowTableGridBorders(viewPrefs.showTableGridBorders));
  let gridCardBorderStyle = $state<'solid' | 'dashed'>(
    resolveGridCardBorderStyle(viewPrefs.gridCardBorderStyle)
  );
  let gridCardAttribute = $state<GridCardAttributeType>(resolveGridCardAttribute(viewPrefs.gridCardAttribute));
  
  // 全局筛选状态（从FilterStateService同步）
  let globalSelectedDeckId = $state<string | null>(null);
  let globalSelectedCardTypes = $state<Set<CardType>>(new Set());
  let globalSelectedPriority = $state<number | null>(null);
  let globalSelectedTags = $state<Set<string>>(new Set());
  let globalSelectedTimeFilter = $state<TimeFilterType>(null);  // 时间筛选
  let globalShowOrphanCards = $state(false);  // v2.0 孤儿卡片筛选
  
  // 自定义卡片筛选（用于显示特定卡片集合，如变体卡片）
  let customCardIdsFilter = $state<Set<string> | null>(null);
  let customFilterName = $state<string | null>(null);
  let lastHandledExternalFilterRequestId = $state<string | null>(null);

  // isEditingCard 和 editingCard 已移除，统一使用嵌入式编辑器
  
  // 嵌入式编辑器管理器（方案A：永久隐藏Leaf）
  let editorPoolManager = $state<EmbeddableEditorManager | null>(null);
  
  // 题库数据存储和统计
  let questionBankStorage = $state<QuestionBankStorage | null>(null);
  let questionBankStats = $state<Map<string, QuestionTestStats>>(new Map());
  
  // 文档监听器清理函数
  let documentListenerCleanup: (() => void) | null = null;

  // 题库数据源
  let dataSource = $state<'memory' | 'questionBank' | 'incremental-reading'>('memory');  // 默认显示记忆学习数据
  let questionBankCards = $state<Card[]>([]);  // 题库数据
  let isLoadingQuestionBank = $state(false);  // 题库加载状态
  let questionBankDecks = $state<Deck[]>([]);

  function normalizeVisibleCardDataSource(
    source: 'memory' | 'questionBank' | 'incremental-reading'
  ): 'memory' | 'questionBank' | 'incremental-reading' {
    if (source === 'questionBank' || source === 'incremental-reading') {
      return source;
    }

    return 'memory';
  }
  
  // v2.0 增量阅读数据源
  let irContentCards = $state<Card[]>([]);  // IR内容块转换为Card格式
  let irBlocks = $state<Record<string, IRBlock>>({});  // 原始IR块数据
  let irDecks = $state<Record<string, IRDeck>>({});  // IR牌组数据
  let isLoadingIR = $state(false);  // IR数据加载状态
  let irStorageService: IRStorageService | null = null;  // IR存储服务
  let irExtractCardIds = $state<Set<string>>(new Set()); // 旧摘录卡回退识别
  let irTypeFilter = $state<'all' | 'md' | 'pdf'>('all');  // IR类型筛选：全部/MD文件/PDF书签
  let irReloadTimer: number | null = null;
  let irReloadQueued = false;

  let showColumnManager = $state(false);
  let columnManagerModalInstance: ColumnManagerModalObsidian | null = null;
  let isRefreshingColumnManagerModal = false;
  
  async function saveViewPreferences() {
    try {
      if (!plugin.settings.cardManagementViewPreferences) {
        plugin.settings.cardManagementViewPreferences = {
          currentView: 'table',
          gridLayout: 'fixed',
          gridCardAttribute: 'uuid',
          kanbanGroupBy: 'status',
          kanbanGroupByBySource: {
            memory: 'status',
            questionBank: 'status',
            'incremental-reading': 'deck'
          },
          kanbanSelectedTagGroupIdBySource: {
            memory: null,
            questionBank: null,
            'incremental-reading': null
          },
          kanbanLayoutMode: 'comfortable',
          tableViewMode: 'basic',
          enableCardRelationFilterMode: false,
          enableCardLocationJump: false,
          showTableGridBorders: true
        };
      }

      const kanbanGroupByBySource = {
        ...resolveKanbanGroupByBySource(plugin.settings.cardManagementViewPreferences.kanbanGroupByBySource),
        [dataSource]: kanbanGroupBy
      };
      const kanbanSelectedTagGroupIdBySource = {
        ...resolveKanbanSelectedTagGroupIdBySource(plugin.settings.cardManagementViewPreferences.kanbanSelectedTagGroupIdBySource),
        [dataSource]: kanbanSelectedTagGroupId
      };
      
      plugin.settings.cardManagementViewPreferences.currentView = currentView;
      plugin.settings.cardManagementViewPreferences.gridLayout = gridLayout;
      plugin.settings.cardManagementViewPreferences.gridCardAttribute = gridCardAttribute;
      plugin.settings.cardManagementViewPreferences.kanbanGroupBy = kanbanGroupBy;
      plugin.settings.cardManagementViewPreferences.kanbanGroupByBySource = kanbanGroupByBySource;
      plugin.settings.cardManagementViewPreferences.kanbanSelectedTagGroupIdBySource = kanbanSelectedTagGroupIdBySource;
      plugin.settings.cardManagementViewPreferences.kanbanLayoutMode = kanbanLayoutMode;
      plugin.settings.cardManagementViewPreferences.tableViewMode = tableViewMode;
      plugin.settings.cardManagementViewPreferences.enableCardRelationFilterMode = enableCardRelationFilterMode;
      plugin.settings.cardManagementViewPreferences.enableCardLocationJump = enableCardLocationJump;
      plugin.settings.cardManagementViewPreferences.gridCardBorderStyle = gridCardBorderStyle;
      plugin.settings.cardManagementViewPreferences.showTableGridBorders = true;
      
      await plugin.saveSettings();
    } catch (error) {
      logger.error('保存视图偏好失败:', error);
    }
  }
  // showNewCardModal 已移除
  // showBatchTemplateModal 已删除（基于弃用的字段模板系统）
  // showBatchDeckModal、showBatchRemoveTagsModal、showBatchAddTagsModal 已移除（改用 Obsidian Menu API）
  
  // v2.2 数据管理模态窗
  let showDataManagementModal = $state(false);
  let dataManagementModalInstance: DataManagementModalObsidian | null = null;
  // v2.0 引用式牌组系统模态窗状态
  let showBuildDeckModal = $state(false);
  let showCardToMarkdownModal = $state(false);
  let cardToMarkdown = $state<Card | null>(null);
  let isConvertingCardToMarkdown = $state(false);
  let filterManager = $state<FilterManager | null>(null);
  let savedFilters = $state<SavedFilter[]>([]);

  // 文档过滤功能状态
  let documentFilterMode = $state<'all' | 'current'>('all'); // 过滤模式
  let currentActiveDocument = $state<string | null>(null); // 当前活动文档路径
  let lastExternalActiveDocument = $state<string | null>(null); // 最近一次真正激活的外部文档路径
  let lastExternalDocumentKind = $state<'file' | 'epub' | 'ir' | null>(null);
  
  // 侧边栏检测状态
  let isInSidebar = $state(false);
  
  // 移动端状态 - 使用多种检测方法确保准确性
  function detectMobileDevice(): boolean {
    // 1. Platform.isMobile - Obsidian 官方 API
    if (Platform.isMobile) return true;
    // 2. body classes
    if (typeof document !== 'undefined') {
      const body = document.body;
      if (body.classList.contains('is-mobile') || 
          body.classList.contains('is-phone') || 
          body.classList.contains('is-tablet')) {
        return true;
      }
    }
    // 3. 触摸屏检测
    if (typeof window !== 'undefined' && 'ontouchstart' in window) return true;
    // 4. 用户代理检测
    if (typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return true;
    return false;
  }
  
  const isMobile = detectMobileDevice();
  let showMobileSearchInput = $state(false);

  // allFieldTemplates 已删除（新系统使用动态解析，无需预定义模板）
  let allDecks = $state<Deck[]>([]);
  let memoryDeckOrganizationRuntime = $state<MemoryDeckOrganizationRuntime | null>(null);
  
  let isPremium = $state(false);
  let showActivationPrompt = $state(false);
  let promptFeatureId = $state('');

  function promptPremiumFeature(featureId: string) {
    promptFeatureId = featureId;
    showActivationPrompt = true;
  }
  
  // 订阅高级版状态（添加挂载状态保护）
  $effect(() => {
    if (!isMounted) return;  // 只在组件挂载后订阅
    
    const unsubscribe = premiumGuard.isPremiumActive.subscribe(value => {
      if (isMounted) {  // 只在组件仍挂载时更新状态
        isPremium = value;
      }
    });
    return unsubscribe;
  });

  // 分页状态
  let currentPage = $state(1);
  let itemsPerPage = $state(25); // 性能优化：从50改为25，减少组件实例数量

  // 添加数据版本号，强制触发 UI 更新
  let dataVersion = $state(0);
  const locallyHandledCardSaveIds = new Set<string>();

  // 使用 $state + $effect 替代 $derived，避免 reconciliation 错误
  // 注意：$effect 必须正常追踪所有必要的依赖（包括 sortConfig），不能滥用 untrack
  let filteredAndSortedCards = $state<Card[]>([]);
  let totalFilteredItems = $state(0);
  let filteredCards = $state<Card[]>([]);
  
  // 判断是否有活动的全局筛选
  let hasActiveGlobalFilters = $derived(
    globalSelectedDeckId !== null ||
    globalSelectedCardTypes.size > 0 ||
    globalSelectedPriority !== null ||
    globalSelectedTags.size > 0 ||
    globalSelectedTimeFilter !== null ||
    globalShowOrphanCards ||  // v2.0 孤儿卡片筛选
    (customCardIdsFilter !== null && customCardIdsFilter.size > 0)
  );

  function dedupeCardsForManagement(cards: Card[]): Card[] {
    const deduped = new Map<string, Card>();
    const duplicateIds: string[] = [];
    let invalidCount = 0;

    for (const card of cards) {
      const uuid = String(card?.uuid || '').trim();
      if (!uuid) {
        invalidCount++;
        continue;
      }

      if (deduped.has(uuid)) {
        duplicateIds.push(uuid);
        deduped.delete(uuid);
      }
      deduped.set(uuid, card);
    }

    if (duplicateIds.length > 0 || invalidCount > 0) {
      logger.warn(
        `[WeaveCardManagementPage] 检测到重复或无效卡片，已自动去重: source=${dataSource}, duplicates=${duplicateIds.length}, invalid=${invalidCount}`,
        duplicateIds.length > 0
          ? { duplicateIds: Array.from(new Set(duplicateIds)).slice(0, 10) }
          : undefined
      );
    }

    return Array.from(deduped.values());
  }

  // 使用 $effect 来更新筛选和排序后的卡片
  $effect(() => {
    // 添加 dataVersion 依赖，确保数据更新时触发重新计算
    void dataVersion;
    
    // 性能优化：只在组件挂载且未销毁时计算
    if (!isMounted || !isViewVisible) {
      // 组件未挂载或已销毁时，清空数据避免内存泄漏
      filteredAndSortedCards = [];
      return;
    }
    
    // 修复说明：移除了 untrack 包裹，让排序配置变化能够正常触发 $effect
    // 原注释误判了"循环依赖"问题，实际上排序逻辑是单向的：sortConfig → 排序 → filteredAndSortedCards
    // 没有任何代码会在排序过程中修改 sortConfig，因此不存在循环依赖
    const currentSortField = sortConfig.field;
    const currentSortDirection = sortConfig.direction;
    
    const sourceCards = currentSourceCards;
    
    if (!Array.isArray(sourceCards)) {
      filteredAndSortedCards = [];
      return;
    }

    const activeDecks = currentDataSourceDecks;
    const deckById = new Map(activeDecks.map(d => [d.id, d] as const));
    const deckIdsCache = new Map<string, { deckIds: string[]; primaryDeckId?: string }>();
    const getCachedCardDeckIds = (card: Card) => {
      const key = card.uuid;
      const cached = deckIdsCache.get(key);
      if (cached) return cached;
      const computed =
        dataSource === "memory"
          ? getCardDeckIdsFromFormalSource(card, activeDecks)
          : getCardDeckIds(card, activeDecks);
      deckIdsCache.set(key, computed);
      return computed;
    };

    let result = dedupeCardsForManagement(sourceCards);

    // 过滤渐进式挖空子卡片（管理界面只显示父卡片，子卡片仅在学习队列中出现）
    result = result.filter(card => card.type !== 'progressive-child');

    // IR 类型筛选：按 MD/PDF 过滤
    if (dataSource === 'incremental-reading' && irTypeFilter !== 'all') {
      result = result.filter(card => {
        const isPdf = !!(card as any).metadata?.irPdfBookmark;
        return irTypeFilter === 'pdf' ? isPdf : !isPdf;
      });
    }

    // 应用自定义卡片 ID 筛选（最高优先级，用于显示特定卡片集合）
    if (customCardIdsFilter && customCardIdsFilter.size > 0) {
      result = result.filter(card => {
        const id = card.uuid;
        return customCardIdsFilter!.has(id);
      });
    }

    // 应用文档筛选（在其他筛选之前）
    if (documentFilterMode === 'current' && currentActiveDocument) {
      result = filterCardsBySourceDocument(result, currentActiveDocument);
    }
    
    // 应用全局筛选器的筛选条件
    // 1. 牌组筛选（v2.0: 引用式牌组架构）
    if (globalSelectedDeckId) {
      const selectedDeck = deckById.get(globalSelectedDeckId);
      const selectedDeckUuidSet = selectedDeck?.cardUUIDs?.length
        ? new Set(selectedDeck.cardUUIDs)
        : null;
      result = result.filter(card => {
        // 优先使用 deck.cardUUIDs
        if (selectedDeckUuidSet) {
          return selectedDeckUuidSet.has(card.uuid);
        }
        // 统一通过牌组解析器处理正式真源与兼容回退，避免页面层重复拼接旧字段判断
        const { deckIds } = getCachedCardDeckIds(card);
        return deckIds.includes(globalSelectedDeckId!);
      });
    }
    
    // 2. 题型筛选
    if (globalSelectedCardTypes.size > 0) {
      result = result.filter(card => {
        const cardType = detectCardQuestionType(card);
        return globalSelectedCardTypes.has(cardType as unknown as CardType);
      });
    }
    
    // 3. 优先级筛选
    if (globalSelectedPriority !== null) {
      result = result.filter(card => (card.priority || 0) === globalSelectedPriority);
    }
    
    // 4. 标签筛选（AND逻辑：卡片必须包含所有选中标签，支持层级筛选）
    // v2.1: 使用 CardMetadataService 兼容新旧格式
    if (globalSelectedTags.size > 0) {
      const metadataSvc = getCardMetadataService();
      result = result.filter(card => {
        // AND逻辑：卡片必须匹配所有选中的标签
        const cardTags = metadataSvc.getCardTags(card);
        return Array.from(globalSelectedTags).every(selectedTag => 
          matchesTagFilter(cardTags, selectedTag)
        );
      });
    }
    
    // 5. 时间筛选
    if (globalSelectedTimeFilter) {
      result = applyTimeFilter(result, globalSelectedTimeFilter);
    }
    
    // 孤儿卡片筛选：当前数据源下没有任何牌组归属的卡片
    if (globalShowOrphanCards) {
      const activeDecks = getDecksForDataSource();
      result = result.filter((card) => {
        if (activeDecks.some(deck => deck.cardUUIDs?.includes(card.uuid))) {
          return false;
        }
        return getDeckIdsForDataSource(card, activeDecks, dataSource).length === 0;
      });
    }

    // 应用搜索筛选（使用卡片搜索解析器）
    if (searchQuery.trim() && parsedSearchQuery) {
      // 创建适配器函数
      const getContentAdapter = (card: any, side: 'front' | 'back') => {
        return getCardContentBySide(card, side, []);
      };
      
      result = result.filter(card => 
        matchSearchQuery(
          card, 
          parsedSearchQuery!, 
          getContentAdapter,
          getCardDeckNames,  // 修复：使用 getCardDeckNames 支持 v2.0 引用式牌组
          detectCardQuestionType
        )
      );
    }

    // 应用状态筛选
    if (filters.status.size > 0) {
      result = result.filter(card => {
        if (!card.fsrs) return false;
        const statusString = getCardStatusString(card.fsrs.state);
        return filters.status.has(statusString);
      });
    }

    // 应用牌组筛选（v2.0: 引用式牌组架构）
    if (filters.decks.size > 0) {
      const deckUuidSets = new Map<string, Set<string>>();
      for (const deckId of filters.decks) {
        const deck = deckById.get(deckId);
        if (deck?.cardUUIDs?.length) {
          deckUuidSets.set(deckId, new Set(deck.cardUUIDs));
        }
      }
      result = result.filter(card => {
        // 检查卡片是否属于任意筛选的牌组
        for (const deckId of filters.decks) {
          const uuidSet = deckUuidSets.get(deckId);
          if (uuidSet?.has(card.uuid)) {
            return true;
          }
          // 统一通过牌组解析器处理正式真源与兼容回退，避免页面层重复拼接旧字段判断
          const { deckIds: cardDeckIds } = getCachedCardDeckIds(card);
          if (cardDeckIds.includes(deckId)) {
            return true;
          }
        }
        return false;
      });
    }

    // 应用标签筛选（支持层级筛选）
    // v2.1: 使用 CardMetadataService 兼容新旧格式
    if (filters.tags.size > 0) {
      const metadataSvc = getCardMetadataService();
      result = result.filter(card => {
        // AND逻辑：卡片必须匹配所有选中的标签
        const cardTags = metadataSvc.getCardTags(card);
        return Array.from(filters.tags).every(selectedTag =>
          matchesTagFilter(cardTags, selectedTag)
        );
      });
    }

    // 应用题型筛选
    if (filters.questionTypes.size > 0) {
      result = result.filter(card => {
        const questionType = detectCardQuestionType(card);
        return filters.questionTypes.has(questionType);
      });
    }

    // 应用错题集筛选
    if (filters.errorBooks.size > 0) {
      result = result.filter(card => {
        const errorLevel = getCardErrorLevel(card);
        return errorLevel && filters.errorBooks.has(errorLevel);
      });
    }

    if (dataSource === 'incremental-reading') {
      result = applyIRCardManagementSourceStats({
        rows: result,
        allCards: cards,
        extractCardIds: irExtractCardIds,
      });
    }

    const getSortKey = (card: Card): string | number => {
      switch (currentSortField) {
        case "front":
          return (getCardContentBySide(card, 'front', []) || '').toLowerCase();
        case "back":
          return (getCardContentBySide(card, 'back', []) || '').toLowerCase();
        case "status":
          return getCardStatusString(card.fsrs?.state ?? 0);
        case "created": {
          const ts = new Date(card.created || 0).getTime();
          return Number.isFinite(ts) ? ts : 0;
        }
        case "modified": {
          const ts = new Date(card.modified || 0).getTime();
          return Number.isFinite(ts) ? ts : 0;
        }
        case "tags":
          return (card.tags || []).join(" ").toLowerCase();
        case "obsidian_block_link":
          return ((extractSourceBlock(card) || '')).toLowerCase();
        case "source_document":
          return (extractSourcePath(card) || '').toLowerCase();
        case "uuid":
          return (card.uuid || '').toLowerCase();
        case "deck":
          return getCardDeckNames(card).toLowerCase();
        // IR 专用字段排序
        case "ir_title":
          return ((card as any).ir_title || '').toLowerCase();
        case "ir_source_file":
          return ((card as any).ir_source_file || '').toLowerCase();
        case "ir_state":
          return ((card as any).ir_state || '').toLowerCase();
        case "ir_priority":
          return (card as any).ir_priority_value ?? (card as any).ir_priority ?? 5;
        case "ir_tags":
          return ((card as any).ir_tags || []).join(' ').toLowerCase();
        case "ir_next_review": {
          const irTs = new Date((card as any).ir_next_review || 0).getTime();
          return Number.isFinite(irTs) ? irTs : 0;
        }
        case "ir_review_count":
          return (card as any).ir_review_count ?? 0;
        case "ir_reading_time":
          return (card as any).ir_reading_time ?? 0;
        case "ir_notes":
          return (card as any).ir_notes ?? (card as any).ir_associated_note_paths?.length ?? 0;
        case "ir_extract_cards":
          return (card as any).ir_extract_cards ?? 0;
        case "ir_memory_cards":
          return (card as any).ir_memory_cards ?? 0;
        case "ir_source_kind":
          return ((card as any).ir_source_kind || '').toLowerCase();
        case "ir_source_subunit":
          return ((card as any).ir_source_subunit || '').toLowerCase();
        case "ir_tag_group":
          return ((card as any).ir_tag_group || '默认').toLowerCase();
        case "ir_created": {
          const irCreatedTs = new Date((card as any).ir_created || 0).getTime();
          return Number.isFinite(irCreatedTs) ? irCreatedTs : 0;
        }
        case "ir_decks":
          return ((card as any).ir_deck || '').toLowerCase();
        default:
          return '';
      }
    };

    const decorated = result.map(card => ({ card, key: getSortKey(card) }));
    decorated.sort((a, b) => {
      const aKey = a.key;
      const bKey = b.key;
      if (typeof aKey === 'number' && typeof bKey === 'number') {
        return currentSortDirection === 'asc' ? aKey - bKey : bKey - aKey;
      }
      if (aKey < bKey) return currentSortDirection === "asc" ? -1 : 1;
      if (aKey > bKey) return currentSortDirection === "asc" ? 1 : -1;
      return 0;
    });
    result = decorated.map(d => d.card);

    // 更新状态，创建新数组避免引用问题
    filteredAndSortedCards = result;
    
    // 排序完成后释放锁
    // 注意：这里的 untrack 是必要的，因为我们在 $effect 内部读取和修改 isSorting
    // 不使用 untrack 会导致修改 isSorting 时再次触发当前 $effect，造成无限循环
    // 这与上面 sortConfig 的使用不同：sortConfig 的变化应该触发 $effect（用户主动排序）
    untrack(() => {
      if (sortingLock && isSorting) {
        // 清除之前的定时器（防止多次触发）
        if (sortLockReleaseTimer !== null) {
          clearTimeout(sortLockReleaseTimer);
          sortLockReleaseTimer = null;
        }
        
        // 捕获当前排序请求 ID，用于验证
        const currentRequestId = sortRequestId;
        
        queueMicrotask(() => {
          const elapsed = Date.now() - sortStartTime;
          const minDisplayTime = 200; // 最小显示时间200ms
          const remainingTime = Math.max(0, minDisplayTime - elapsed);
          
          sortLockReleaseTimer = window.setTimeout(() => {
            // 验证这是当前的排序请求才释放锁（防止过时的定时器释放锁）
            if (currentRequestId === sortRequestId) {
              isSorting = false;
              sortingLock = false;
              sortLockReleaseTimer = null;
            } else {
            }
          }, remainingTime);
        });
      }
    });
  });

  // 使用 $effect 来更新总数和分页数据
  $effect(() => {
    // 性能优化：只在组件挂载且视图可见时更新
    if (!isMounted || !isViewVisible) return;
    
    // 追踪所有的依赖项
    const sortedCards = filteredAndSortedCards;
    const page = currentPage;
    const perPage = itemsPerPage;
    
    // 计算总数
    totalFilteredItems = sortedCards.length;

    // 计算当前页的起止索引
    const startIndex = (page - 1) * perPage;
    const endIndex = Math.min(sortedCards.length, startIndex + perPage);

    // 性能优化：直接使用 slice 结果，不需要额外的展开运算符
    // slice 已经返回新数组，不需要再用 [...] 创建副本
    const newFilteredCards = sortedCards.slice(startIndex, endIndex);
    
    // 修复：移除过于激进的优化检查，确保数据更新时 UI 能正确刷新
    // 原来的检查只比较长度和第一个元素的 UUID，但当标签/优先级等属性更新时，
    // 这些条件都不会变化，导致 filteredCards 不更新，UI 不刷新
    // 现在直接赋值，让 Svelte 的响应式系统自行判断是否需要更新 DOM
    filteredCards = newFilteredCards;
  });


  type ColumnManagerPresetId = 'minimal' | 'learning' | 'review' | 'exam' | 'reading' | 'all';

  interface ColumnManagerPreset {
    id: ColumnManagerPresetId;
    label: string;
    description: string;
  }

  function createDefaultColumnVisibilityForSource(source: 'memory' | 'questionBank' | 'incremental-reading') {
    const next = {
      front: true,
      back: true,
      status: true,
      deck: true,
      tags: true,
      priority: true,
      created: true,
      modified: false,
      next_review: false,
      retention: false,
      interval: false,
      difficulty: false,
      review_count: false,
      actions: true,
      uuid: false,
      obsidian_block_link: true,
      source_document: true,
      field_template: true,
      source_document_status: true,
      question_type: false,
      accuracy: false,
      test_attempts: false,
      last_test: false,
      error_level: false,
      ir_title: false,
      ir_source_file: false,
      ir_state: false,
      ir_priority: false,
      ir_tags: false,
      ir_next_review: false,
      ir_review_count: false,
      ir_reading_time: false,
      ir_notes: false,
      ir_extract_cards: false,
      ir_memory_cards: false,
      ir_source_kind: false,
      ir_source_subunit: false,
      ir_tag_group: false,
      ir_created: false,
      ir_decks: false,
    };

    if (source === 'questionBank') {
      next.question_type = true;
      next.accuracy = true;
      next.test_attempts = true;
      next.last_test = true;
      next.error_level = true;
      return next;
    }

    if (source === 'incremental-reading') {
      next.front = false;
      next.back = false;
      next.status = false;
      next.deck = false;
      next.tags = false;
      next.priority = false;
      next.created = false;
      next.obsidian_block_link = false;
      next.source_document = false;
      next.field_template = false;
      next.source_document_status = false;

      next.ir_title = true;
      next.ir_source_file = true;
      next.ir_state = true;
      next.ir_priority = true;
      next.ir_tags = true;
      next.ir_tag_group = true;
      next.ir_next_review = true;
      next.ir_review_count = true;
      next.ir_notes = true;
      next.ir_extract_cards = true;
      next.ir_memory_cards = true;
      next.ir_source_kind = true;
      next.ir_created = true;
      next.ir_decks = true;
      return next;
    }

    return next;
  }

  const MEMORY_MINIMAL_COLUMNS: ColumnKey[] = ['front', 'status', 'deck', 'tags', 'priority', 'actions'];
  const MEMORY_LEARNING_COLUMNS: ColumnKey[] = ['front', 'back', 'status', 'deck', 'tags', 'priority', 'source_document', 'created', 'actions'];
  const MEMORY_REVIEW_COLUMNS: ColumnKey[] = ['front', 'back', 'status', 'next_review', 'retention', 'interval', 'difficulty', 'review_count', 'actions'];
  const QUESTION_BANK_MINIMAL_COLUMNS: ColumnKey[] = ['front', 'status', 'question_type', 'accuracy', 'error_level', 'actions'];
  const QUESTION_BANK_EXAM_COLUMNS: ColumnKey[] = ['front', 'back', 'status', 'deck', 'question_type', 'accuracy', 'test_attempts', 'last_test', 'error_level', 'actions'];
  const IR_MINIMAL_COLUMNS: ColumnKey[] = ['ir_title', 'ir_source_file', 'ir_state', 'ir_priority', 'actions'];
  const IR_READING_COLUMNS: ColumnKey[] = ['ir_title', 'ir_source_file', 'ir_source_kind', 'ir_notes', 'ir_extract_cards', 'ir_memory_cards', 'ir_decks', 'ir_state', 'ir_priority', 'ir_tags', 'ir_tag_group', 'ir_next_review', 'ir_review_count', 'ir_created', 'actions'];

  // 列可见性状态
  let columnVisibility = $state(createDefaultColumnVisibilityForSource('memory'));

  // 列顺序状态
  let columnOrder = $state<ColumnOrder>([...DEFAULT_COLUMN_ORDER]);

  function getColumnVisibilityStorageKey(source: 'memory' | 'questionBank' | 'incremental-reading' = dataSource): string {
    return `weave-column-visibility:${source}`;
  }

  function getColumnOrderStorageKey(source: 'memory' | 'questionBank' | 'incremental-reading' = dataSource): string {
    return `weave-column-order:${source}`;
  }

  function loadPersistedColumnVisibility(source: 'memory' | 'questionBank' | 'incremental-reading'): typeof columnVisibility {
    const defaultVisibility = createDefaultColumnVisibilityForSource(source);
    const scopedValue = vaultStorage.getItem(getColumnVisibilityStorageKey(source));
    const legacyValue = source === 'memory' ? vaultStorage.getItem('weave-column-visibility') : null;
    const rawValue = scopedValue ?? legacyValue;

    if (!rawValue) {
      return defaultVisibility;
    }

    try {
      const parsed = JSON.parse(rawValue);
      return { ...defaultVisibility, ...parsed };
    } catch (error) {
      logger.error(`解析列设置失败(${source}):`, error);
      return defaultVisibility;
    }
  }

  function loadPersistedColumnOrder(source: 'memory' | 'questionBank' | 'incremental-reading'): ColumnOrder {
    const defaultOrder = [...DEFAULT_COLUMN_ORDER];
    const scopedValue = vaultStorage.getItem(getColumnOrderStorageKey(source));
    const legacyValue = source === 'memory' ? vaultStorage.getItem('weave-column-order') : null;
    const rawValue = scopedValue ?? legacyValue;

    if (!rawValue) {
      return defaultOrder;
    }

    try {
      const parsed = JSON.parse(rawValue);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        logger.warn(`[ColumnOrder] 保存的列顺序无效(${source})，使用默认值`);
        return defaultOrder;
      }
      return [
        ...parsed.filter((key: ColumnKey) => defaultOrder.includes(key)),
        ...defaultOrder.filter((key: ColumnKey) => !parsed.includes(key))
      ];
    } catch (error) {
      logger.error(`解析列顺序失败(${source}):`, error);
      return defaultOrder;
    }
  }

  function persistColumnVisibility(nextVisibility = columnVisibility) {
    try {
      vaultStorage.setItem(getColumnVisibilityStorageKey(), JSON.stringify(nextVisibility));
    } catch (error) {
      logger.error('保存列设置失败:', error);
    }
  }

  function persistColumnOrder(nextOrder = columnOrder) {
    try {
      vaultStorage.setItem(getColumnOrderStorageKey(), JSON.stringify(nextOrder));
    } catch (error) {
      logger.error('保存列顺序失败:', error);
    }
  }

  function handleVisibilityChange(key: keyof typeof columnVisibility, value: boolean) {
    columnVisibility[key] = value;
    persistColumnVisibility();
  }

  function handleOrderChange(newOrder: ColumnOrder) {
    columnOrder = newOrder;
    persistColumnOrder(newOrder);
  }

  function applyColumnVisibilitySet(visibleKeys: ColumnKey[]) {
    const visibleSet = new Set<ColumnKey>(visibleKeys);
    const nextVisibility = { ...columnVisibility };

    for (const key of Object.keys(nextVisibility) as ColumnKey[]) {
      nextVisibility[key] = visibleSet.has(key);
    }

    nextVisibility.actions = true;
    columnVisibility = nextVisibility;
    persistColumnVisibility(nextVisibility);
  }

  function getColumnManagerPresets(): ColumnManagerPreset[] {
    if (dataSource === 'questionBank') {
      return [
        { id: 'minimal', label: t('cardManagement.columnPresets.minimal.label'), description: t('cardManagement.columnPresets.questionBankMinimal') },
        { id: 'exam', label: t('cardManagement.columnPresets.questionBankExam.label'), description: t('cardManagement.columnPresets.questionBankExam.description') },
        { id: 'all', label: t('cardManagement.columnPresets.all.label'), description: t('cardManagement.columnPresets.all.description') },
      ];
    }

    if (dataSource === 'incremental-reading') {
      return [
        { id: 'minimal', label: t('cardManagement.columnPresets.minimal.label'), description: t('cardManagement.columnPresets.incrementalReadingMinimal') },
        { id: 'reading', label: t('cardManagement.columnPresets.incrementalReadingReading.label'), description: t('cardManagement.columnPresets.incrementalReadingReading.description') },
        { id: 'all', label: t('cardManagement.columnPresets.all.label'), description: t('cardManagement.columnPresets.all.description') },
      ];
    }

    return [
      { id: 'minimal', label: t('cardManagement.columnPresets.minimal.label'), description: t('cardManagement.columnPresets.memoryMinimal') },
      { id: 'learning', label: t('cardManagement.columnPresets.memoryLearning.label'), description: t('cardManagement.columnPresets.memoryLearning.description') },
      { id: 'review', label: t('cardManagement.columnPresets.memoryReview.label'), description: t('cardManagement.columnPresets.memoryReview.description') },
      { id: 'all', label: t('cardManagement.columnPresets.all.label'), description: t('cardManagement.columnPresets.memoryAll') },
    ];
  }

  function getPresetColumns(presetId: ColumnManagerPresetId): ColumnKey[] {
    if (dataSource === 'questionBank') {
      if (presetId === 'minimal') return QUESTION_BANK_MINIMAL_COLUMNS;
      if (presetId === 'exam') return QUESTION_BANK_EXAM_COLUMNS;
      return DEFAULT_COLUMN_ORDER.filter((key) => !key.startsWith('ir_'));
    }

    if (dataSource === 'incremental-reading') {
      if (presetId === 'minimal') return IR_MINIMAL_COLUMNS;
      if (presetId === 'reading') return IR_READING_COLUMNS;
      return DEFAULT_COLUMN_ORDER.filter((key) => key.startsWith('ir_') || key === 'actions');
    }

    if (presetId === 'minimal') return MEMORY_MINIMAL_COLUMNS;
    if (presetId === 'learning') return MEMORY_LEARNING_COLUMNS;
    if (presetId === 'review') return MEMORY_REVIEW_COLUMNS;

    return DEFAULT_COLUMN_ORDER.filter((key) => !key.startsWith('ir_') && !['question_type', 'accuracy', 'test_attempts', 'last_test', 'error_level'].includes(key));
  }

  function applyColumnManagerPreset(presetId: ColumnManagerPresetId) {
    applyColumnVisibilitySet(getPresetColumns(presetId));
  }

  function resolveCurrentColumnManagerPreset(): ColumnManagerPresetId | null {
    const currentVisibleKeys = (Object.keys(columnVisibility) as ColumnKey[])
      .filter((key) => columnVisibility[key]);

    for (const preset of getColumnManagerPresets()) {
      const presetKeys = [...new Set(getPresetColumns(preset.id))].sort();
      const normalizedCurrent = [...currentVisibleKeys].sort();

      if (
        presetKeys.length === normalizedCurrent.length &&
        presetKeys.every((key, index) => key === normalizedCurrent[index])
      ) {
        return preset.id;
      }
    }

    return null;
  }

  function resetColumnManagerConfig() {
    columnVisibility = createDefaultColumnVisibilityForSource(dataSource);
    columnOrder = [...DEFAULT_COLUMN_ORDER];
    persistColumnVisibility(columnVisibility);
    persistColumnOrder(columnOrder);
  }

  function getColumnManagerGroups(): ColumnGroups {
    if (dataSource === 'incremental-reading') {
      return {
        basic: [
          'ir_title',
          'ir_source_file',
          'ir_source_kind',
          'ir_notes',
          'ir_extract_cards',
          'ir_memory_cards',
          'ir_decks',
          'ir_state',
          'ir_priority',
          'ir_tags',
          'ir_tag_group',
        ],
        review: [
          'ir_next_review',
          'ir_review_count',
          'ir_reading_time',
          'ir_created',
        ],
        advanced: [
          'ir_source_subunit',
        ],
        shared: [],
      };
    }

    if (dataSource === 'questionBank') {
      return {
        basic: [
          'front',
          'back',
          'deck',
          'tags',
          'priority',
          'created',
          'question_type',
          'accuracy',
          'error_level',
        ],
        review: [
          'test_attempts',
          'last_test',
        ],
        advanced: [
          'uuid',
          'source_document',
          'field_template',
          'source_document_status',
        ],
        shared: ['front', 'back'],
      };
    }

    return COLUMN_GROUPS;
  }

  /**
   * 同步列可见性与数据源
   * 确保表格头部属性与当前数据源匹配
   */
  function syncColumnVisibilityWithDataSource(source: 'memory' | 'questionBank' | 'incremental-reading') {
    if (source === 'questionBank') {
      tableViewMode = 'questionBank';
    } else if (source === 'incremental-reading') {
      tableViewMode = 'irContent';
    } else {
      tableViewMode = 'basic';
    }

    columnVisibility = loadPersistedColumnVisibility(source);
    columnOrder = loadPersistedColumnOrder(source);
    kanbanGroupBy = getPreferredKanbanGroupByForSource(source);
    kanbanSelectedTagGroupId = getPreferredKanbanSelectedTagGroupIdForSource(source);
  }

  async function handleKanbanGroupByChange(nextGroupBy: KanbanGroupBy) {
    const normalizedGroupBy = normalizeKanbanGroupByForSource(nextGroupBy, dataSource);
    if (kanbanGroupBy === normalizedGroupBy) {
      return;
    }

    kanbanGroupBy = normalizedGroupBy;
    await saveViewPreferences();
  }

  async function handleKanbanSelectedTagGroupIdChange(nextTagGroupId: string | null) {
    const normalizedTagGroupId = typeof nextTagGroupId === 'string' ? (nextTagGroupId.trim() || null) : null;
    if (kanbanSelectedTagGroupId === normalizedTagGroupId) {
      return;
    }

    kanbanSelectedTagGroupId = normalizedTagGroupId;
    await saveViewPreferences();
  }

  // 筛选状态
  let filters = $state({
    status: new Set<string>(),
    decks: new Set<string>(),
    tags: new Set<string>(),
    questionTypes: new Set<string>(),     // 新增：题型筛选
    errorBooks: new Set<string>(),        // 新增：错题集筛选
    searchQuery: ""
  });

  // 排序状态
  let sortConfig = $state({
    field: "created",
    direction: "desc" as "asc" | "desc"
  });

  // 排序加载状态
  let isSorting = $state(false);
  let sortingField = $state<string | null>(null);
  let sortingDirection = $state<'asc' | 'desc' | null>(null);
  
  // 同步标志位：立即阻止重复点击（不依赖响应式系统）
  let sortingLock = false;
  
  // 排序开始时间（用于确保最小显示时间）
  let sortStartTime = 0;
  
  // 排序请求 ID：用于追踪当前排序请求（防止多次 $effect 触发导致的混乱）
  let sortRequestId = 0;
  
  // 延迟释放锁的定时器引用（用于清理）
  let sortLockReleaseTimer: number | null = null;

  // 使用 $state + $effect 替代 $derived，避免 reconciliation 错误
  let statusCounts = $state<Record<string, number>>({});
  let availableDecks = $state<Array<{id: string, name: string, count: number}>>([]);
  let availableTags = $state<Array<{name: string, count: number}>>([]);
  let questionTypeCounts = $state<Record<string, number>>({});     // 新增：题型统计
  let errorBookCounts = $state<Record<string, number>>({});        // 新增：错题集统计
  
  const currentSourceCards = $derived.by(() => {
    return dataSource === 'questionBank'
      ? questionBankCards
      : dataSource === 'incremental-reading'
        ? irContentCards
        : cards;
  });

  function getDecksForDataSource(source: 'memory' | 'questionBank' | 'incremental-reading' = dataSource): Deck[] {
    if (source === 'questionBank') {
      return questionBankDecks;
    }
    if (source === 'incremental-reading') {
      return Object.values(irDecks).map(d => ({ id: d.id, name: d.name } as Deck));
    }
    return allDecks;
  }

  // 搜索组件需要的数据
  const searchSourceCards = $derived(currentSourceCards);

  const currentDataSourceDecks = $derived.by(() => getDecksForDataSource(dataSource));

  const searchAvailableDecks = $derived(currentDataSourceDecks);

  const searchAvailableTags = $derived.by(() => {
    return expandTagSuggestionPaths(availableTags.map((item) => item.name));
  });

  let searchAvailablePriorities = $derived.by(() => {
    const priorities = new Set<number>();
    searchSourceCards.forEach(card => {
      const p = (card as any).priority;
      if (p !== undefined && p !== null) {
        priorities.add(p);
      }
    });
    return Array.from(priorities).sort((a, b) => b - a);
  });
  
  let searchAvailableQuestionTypes = $derived.by(() => {
    const types = new Set<string>();
    for (const c of searchSourceCards) {
      const t = detectCardQuestionType(c);
      if (t) types.add(String(t));
    }
    return Array.from(types);
  });
  
  let searchAvailableSources = $derived.by(() => {
    const sources = new Set<string>();
    searchSourceCards.forEach(card => {
      const source = (card as any).sourceFile;
      if (source) {
        sources.add(source);
      }
    });
    return Array.from(sources).sort();
  });

  const searchAvailableStatuses = $derived.by(() => {
    if (dataSource !== 'memory') return [];
    return ['new', 'learning', 'review', 'relearning'];
  });

  const searchAvailableIRStates = $derived.by(() => {
    if (dataSource !== 'incremental-reading') return [];
    const set = new Set<string>();
    for (const c of irContentCards) {
      const s = (c as any).ir_state;
      if (s) set.add(String(s));
    }
    return Array.from(set);
  });

  const searchAvailableAccuracies = $derived.by(() => {
    if (dataSource !== 'questionBank') return [];
    return ['high', 'medium', 'low', '80', '60'];
  });

  const searchAvailableAttemptThresholds = $derived.by(() => {
    if (dataSource !== 'questionBank') return [];
    return [1, 3, 5, 10];
  });

  const searchAvailableErrorLevels = $derived.by(() => {
    if (dataSource !== 'questionBank') return [];
    return ['high', 'common', 'light', 'none'];
  });

  const searchAvailableYamlKeys = $derived.by(() => {
    const keySet = new Set<string>();
    const sample = searchSourceCards.slice(0, 200);
    for (const card of sample) {
      if (typeof card.content === 'string' && card.content) {
        try {
          const yaml = parseYAMLFromContent(card.content);
          for (const key of Object.keys(yaml)) {
            if (!key.startsWith('we_')) keySet.add(key);
          }
        } catch { /* ignore */ }
      }
    }
    return Array.from(keySet).sort();
  });

  // 使用 $effect 来更新统计数据
  let statisticsUpdateTimer: number | null = null;
  $effect(() => {
    // 性能优化：只在组件挂载且视图可见时计算
    if (!isMounted || !isViewVisible) {
      // 清理定时器
      if (statisticsUpdateTimer !== null) {
        clearTimeout(statisticsUpdateTimer);
        statisticsUpdateTimer = null;
      }
      return;
    }
    
    // 根据数据源选择统计用的源数据
    const currentSource = dataSource;
    const statsCards = currentSourceCards;
    
    if (!Array.isArray(statsCards)) {
      statusCounts = {};
      availableDecks = [];
      availableTags = [];
      questionTypeCounts = {};
      errorBookCounts = {};
      return;
    }
    
    // 性能优化：根据数据量决定是否延迟计算
    const shouldDefer = statsCards.length > 100; // 大数据集才延迟
    
    const updateStatistics = () => {

      // 计算状态统计
    if (currentSource === 'incremental-reading') {
      // IR模式：统计阅读状态
      const irStatusMap: Record<string, number> = {};
      statsCards.forEach(card => {
        const state = (card as any).ir_state || 'new';
        irStatusMap[state] = (irStatusMap[state] || 0) + 1;
      });
      statusCounts = irStatusMap;
    } else {
      const newStatusCounts = statsCards.reduce((acc, card) => {
        if (!card.fsrs) return acc;
        const status = getCardStatusString(card.fsrs.state);
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      statusCounts = newStatusCounts;
    }

    const statsDecks = getDecksForDataSource(currentSource);

    // v2.0: 引用式牌组架构 - 计算牌组统计
    const deckMap = new Map<string, number>();
    
    if (currentSource === 'incremental-reading') {
      // IR模式：从 ir_deck_ids 或 ir_deck 统计
      statsCards.forEach(card => {
        const deckIds = resolveIRDeckIds((card as any).ir_deck_ids || (card as any).metadata?.deckIds || []);
        if (deckIds.length > 0) {
          deckIds.forEach((did: string) => {
            deckMap.set(did, (deckMap.get(did) || 0) + 1);
          });
        } else {
          const deckName = (card as any).ir_deck || '未分配';
          deckMap.set(deckName, (deckMap.get(deckName) || 0) + 1);
        }
      });
      
      // IR 牌组名称解析
      availableDecks = Array.from(deckMap.entries()).map(([id, count]) => {
        return { id, name: getIRDeckName(id, id), count };
      });
    } else {
      const cardUUIDSet = new Set(statsCards.map(c => c.uuid));
      
      // 方式1：通过 deck.cardUUIDs 统计（优先）
      statsDecks.forEach(deck => {
        if (deck.cardUUIDs && deck.cardUUIDs.length > 0) {
          const count = deck.cardUUIDs.filter(uuid => cardUUIDSet.has(uuid)).length;
          if (count > 0) {
            deckMap.set(deck.id, count);
          }
        }
      });
      
      // 方式2：对于没有 cardUUIDs 的牌组，统一通过牌组解析器统计
      statsCards.forEach(card => {
        const cardDeckIds = getDeckIdsForDataSource(card, statsDecks, dataSource);
        if (cardDeckIds.length > 0) {
          cardDeckIds.forEach((deckId: string) => {
            const deck = statsDecks.find(d => d.id === deckId);
            if (!deck?.cardUUIDs?.length) {
              deckMap.set(deckId, (deckMap.get(deckId) || 0) + 1);
            }
          });
        }
      });
      
      availableDecks = Array.from(deckMap.entries()).map(([id, count]) => ({
        id,
        name: getDeckName(id, statsDecks),
        count
      }));
    }

    availableTags = buildTagSuggestionOptions(
      plugin.app,
      statsCards,
      currentSource === 'incremental-reading'
        ? 'incremental-reading'
        : currentSource === 'questionBank'
          ? 'questionBank'
          : 'memory'
    );

    // 计算题型统计
    questionTypeCounts = getQuestionTypeDistribution(statsCards);

      // 计算错题集统计
      errorBookCounts = getErrorBookDistribution(statsCards);
      
    };
    
    if (shouldDefer) {
      // 大数据集：延迟计算，避免阻塞主线程
      if (statisticsUpdateTimer !== null) {
        clearTimeout(statisticsUpdateTimer);
      }
      statisticsUpdateTimer = window.setTimeout(() => {
        updateStatistics();
        statisticsUpdateTimer = null;
      }, 150);
    } else {
      // 小数据集：立即更新，避免数据不一致
      updateStatistics();
    }
  });

  // 性能优化：缓存 VIEW_TYPE_WEAVE 常量，避免重复动态导入
  let VIEW_TYPE_WEAVE_CACHED: string | null = null;
  
  /**
   * 检测当前视图是否在侧边栏
   * 使用Obsidian官方API进行精确检测
   */
  async function detectSidebarContext() {
    if (!plugin?.app?.workspace) {
      isInSidebar = false; // 降级：无法检测时隐藏按钮
      return;
    }
    
    try {
      // 性能优化：只在第一次时动态导入，之后使用缓存
      if (!VIEW_TYPE_WEAVE_CACHED) {
        const module = await import('../../views/WeaveView');
        VIEW_TYPE_WEAVE_CACHED = module.VIEW_TYPE_WEAVE;
      }
      
      const leaves = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WEAVE_CACHED);
      
      if (leaves.length === 0) {
        isInSidebar = false; // 降级：找不到 leaf 时隐藏按钮（等待 leaf 创建）
        return;
      }
      
      const leaf = leaves[0];
      const leafRoot = leaf.getRoot();
      const workspace = plugin.app.workspace;
      
      // 精确判断：leaf不在主编辑区 = 在侧边栏
      const isInMainArea = leafRoot === workspace.rootSplit;
      const newState = !isInMainArea;
      
      // 仅在状态真正改变时更新（触发Svelte响应式更新）
      if (isInSidebar !== newState) {
        isInSidebar = newState;
      }
      
    } catch (error) {
      logger.error('侧边栏检测失败:', error);
      // 降级策略：检测失败时隐藏按钮（保守策略）
      if (isInSidebar !== false) {
        isInSidebar = false;
      }
    }
  }

  /**
   * 获取文件名（不含路径）
   */
  function getFileName(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1].replace(/\.md$/i, '');
  }

  const EPUB_VIEW_TYPES = new Set([
    EPUB_RUNTIME.viewTypes.reader,
    EPUB_RUNTIME.viewTypes.sidebar,
  ]);
  const IR_VIEW_TYPES = new Set(['weave-ir-calendar-view']);
  const INTERNAL_WEAVE_VIEW_TYPES = new Set([
    'weave-view',
    'weave-study-view',
    'weave-question-bank-view'
  ]);

  function getLeafFilePath(leaf?: WorkspaceLeaf | null): string | null {
    const view = leaf?.view as any;
    const directPath = view?.file?.path;
    if (typeof directPath === 'string' && directPath.trim()) {
      return directPath;
    }

    const viewState = view?.getState?.();
    const serializedPath = viewState?.filePath || viewState?.file;
    if (typeof serializedPath === 'string' && serializedPath.trim()) {
      return serializedPath;
    }

    return null;
  }

  function rememberExternalDocument(path: string | null, kind: 'file' | 'epub' | 'ir'): string | null {
    if (path) {
      lastExternalActiveDocument = path;
      lastExternalDocumentKind = kind;
    }
    return path;
  }

  function resolveCurrentActiveDocument(activeLeaf?: WorkspaceLeaf | null): string | null {
    const leaf = activeLeaf ?? plugin?.app?.workspace?.activeLeaf;
    if (!leaf) {
      return lastExternalActiveDocument;
    }

    if (currentLeaf && leaf === currentLeaf) {
      if (lastExternalDocumentKind === 'epub') {
        return epubActiveDocumentStore.getActiveDocument() ?? lastExternalActiveDocument;
      }
      if (lastExternalDocumentKind === 'ir') {
        return irActiveDocumentStore.getActiveDocument() ?? lastExternalActiveDocument;
      }
      return lastExternalActiveDocument;
    }

    const activeViewType = leaf?.view?.getViewType?.() ?? '';
    const leafFilePath = getLeafFilePath(leaf);

    if (leafFilePath) {
      return rememberExternalDocument(leafFilePath, 'file');
    }

    if (EPUB_VIEW_TYPES.has(activeViewType)) {
      const epubPath = epubActiveDocumentStore.getActiveDocument() ?? null;
      return epubPath ? rememberExternalDocument(epubPath, 'epub') : lastExternalActiveDocument;
    }

    if (IR_VIEW_TYPES.has(activeViewType)) {
      const irPath = irActiveDocumentStore.getActiveDocument() ?? null;
      return irPath ? rememberExternalDocument(irPath, 'ir') : lastExternalActiveDocument;
    }

    if (INTERNAL_WEAVE_VIEW_TYPES.has(activeViewType)) {
      return lastExternalActiveDocument;
    }

    const activeFile = plugin?.app?.workspace?.getActiveFile();
    return rememberExternalDocument(activeFile?.path ?? null, 'file');
  }

  // 监听活动文档变化
  function setupActiveDocumentListener() {
    if (!plugin?.app?.workspace) return;

    // 获取当前活动文档
    function updateActiveDocument() {
      currentActiveDocument = resolveCurrentActiveDocument(plugin.app.workspace.activeLeaf);
    }

    // 初始化当前活动文档
    updateActiveDocument();

    // 监听活动文档变化
    plugin.app.workspace.on('active-leaf-change', updateActiveDocument);
    plugin.app.workspace.on('file-open', updateActiveDocument);

    // 清理函数
    return () => {
      plugin.app.workspace.off('active-leaf-change', updateActiveDocument);
      plugin.app.workspace.off('file-open', updateActiveDocument);
    };
  }

  // 文档过滤切换函数
  function toggleDocumentFilter() {
    documentFilterMode = documentFilterMode === 'all' ? 'current' : 'all';
    // 修复：不再持久化过滤模式，避免自动触发过滤
    // 用户需要主动点击按钮才会应用文档过滤
  }

  // 异步初始化函数
  async function initializeAsync() {
    // 关键修复：等待所有核心服务就绪（包括 cardFileService）
    // 视图可能在 workspace 恢复时创建，此时 cardFileService 还未初始化
    // 必须等待 allCoreServices 而不是 dataStorage，因为 getCards() 依赖 cardFileService
    await waitForServiceReady('allCoreServices', 15000);
    
    // Load initial data
    allDecks = await dataStorage.getDecks();
    await loadCards();

    // 初始化嵌入式编辑器管理器（方案A：永久隐藏Leaf）
    editorPoolManager = new EmbeddableEditorManager(plugin.app);
    
    // 初始化题库数据存储
    questionBankStorage = new QuestionBankStorage(plugin.app);
    await questionBankStorage.initialize();
  }

  // 生命周期
  onMount(() => {
    isMounted = true;

    if (shouldPersistResolvedViewPreferences) {
      void saveViewPreferences();
    }
    
    // 订阅全局筛选状态（从FilterStateService）
    const filterUnsubscribe = plugin.filterStateService?.subscribe((state) => {
      
      // 同步全局筛选状态到本地
      globalSelectedDeckId = state.selectedDeckId;
      globalSelectedCardTypes = new Set(state.selectedCardTypes);
      globalSelectedPriority = state.selectedPriority;
      globalSelectedTags = new Set(state.selectedTags);
      globalSelectedTimeFilter = state.selectedTimeFilter;
      globalShowOrphanCards = state.showOrphanCards;  // v2.0 同步孤儿卡片筛选
    });
    
    // 订阅数据同步服务（卡片变更）
    let cardsUnsubscribe: (() => void) | undefined;
    if (plugin.dataSyncService) {
      cardsUnsubscribe = plugin.dataSyncService.subscribe(
        'cards',
        async (event) => {
          const eventIds = Array.isArray(event.ids)
            ? event.ids.map((id) => String(id || '').trim()).filter(Boolean)
            : [];

          if (eventIds.length > 0 && eventIds.every((id) => locallyHandledCardSaveIds.has(id))) {
            eventIds.forEach((id) => locallyHandledCardSaveIds.delete(id));
            return;
          }

          eventIds.forEach((id) => locallyHandledCardSaveIds.delete(id));
          await loadCards();
        },
        { debounce: 300 }
      );
    }
    
    // 订阅数据同步服务（牌组变更）
    let decksUnsubscribe: (() => void) | undefined;
    if (plugin.dataSyncService) {
      decksUnsubscribe = plugin.dataSyncService.subscribe(
        'decks',
        async (event) => {
          allDecks = await dataStorage.getDecks();
        },
        { debounce: 300 }
      );
    }
    
    // 初始化 FilterManager
    filterManager = new FilterManager();
    savedFilters = filterManager.getAllFilters();
    
    // 延迟初始化侧边栏检测（确保 leaf 已创建）
    setTimeout(async () => {
      await detectSidebarContext();  // 使用缓存的动态导入
    }, 200);
    
    // 监听窗口大小变化
    const handleResize = async () => {
      await detectSidebarContext();  // 使用缓存的动态导入
    };
    window.addEventListener('resize', handleResize);
    
    // 工具栏模式检测（使用 ResizeObserver + MutationObserver）
    // 修复：监听 workspace-leaf-content 而不是组件内部容器
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    
    // 使用 tick().then() 确保 DOM 已渲染
    tick().then(() => {
      // 查找最近的 workspace-leaf-content（这是 Obsidian 控制宽度的容器）
      const rootContainer = document.querySelector('.weave-card-management-page');
      const leafContent = rootContainer?.closest('.workspace-leaf-content');
      const observeTarget = leafContent || rootContainer;
      
      if (observeTarget) {
        // ResizeObserver 监听宽度变化
        resizeObserver = new ResizeObserver(() => {
        });
        resizeObserver.observe(observeTarget);
        
        // MutationObserver 监听 DOM 结构变化（视图移动到侧边栏）
        const workspace = document.querySelector('.workspace');
        if (workspace) {
          mutationObserver = new MutationObserver(() => {
            // DOM 结构变化时重新检测
          });
          mutationObserver.observe(workspace, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
          });
        }
        
      }
    });
    
    // 监听布局变化（视图拖动时触发）
    const layoutChangeHandler = () => {
      // 延迟执行，等待布局稳定
      setTimeout(async () => {
        await detectSidebarContext();  
      }, 150);
    };
    plugin.app.workspace.on('layout-change', layoutChangeHandler);
    
    // 修复：移除错误的 active-leaf-change 检测
    // 监听按卡片 ID 筛选事件（来自其他组件，如 CardInfoTab）
    const applyExternalCardFilterRequest = async (
      rawRequest: CardManagementFilterByCardsRequest | null | undefined
    ) => {
      const request = normalizeCardManagementFilterByCardsRequest(rawRequest);
      if (!request) {
        return;
      }

      if (request.requestId === lastHandledExternalFilterRequestId) {
        return;
      }
      lastHandledExternalFilterRequestId = request.requestId;
      clearPendingCardManagementFilterByCardsRequest(request.requestId);

      const {
        cardIds,
        filterName,
        parentCardPreview,
        replaceExisting = false,
        targetView,
        selectCards = false,
        scrollToCard = false,
      } = request;
      relationFilterAnchorCardUuid = null;

      if (replaceExisting || customCardIdsFilter === null || customCardIdsFilter.size === 0) {
        customCardIdsFilter = new Set(cardIds);
      } else {
        cardIds.forEach(id => customCardIdsFilter!.add(id));
      }

      customFilterName = filterName;
      currentPage = 1;

      if (targetView && targetView !== currentView) {
        await switchView(targetView);
      }

      if (selectCards) {
        selectedCards = new Set(cardIds);
      } else if (selectedCards.size > 0) {
        selectedCards = new Set();
      }

      if (scrollToCard || selectCards) {
        await tick();
      }

      // Notify user
      const filterMessage = parentCardPreview 
        ? t('cards.management.filterFromSource', { count: cardIds.length, source: parentCardPreview })
        : t('cards.management.filtered', { count: cardIds.length });
      new Notice(filterMessage);
    };

    const pendingExternalCardFilterRequest = consumePendingCardManagementFilterByCardsRequest();
    if (pendingExternalCardFilterRequest) {
      void applyExternalCardFilterRequest(pendingExternalCardFilterRequest);
    }

    const handleFilterByCards = async (event: Event) => {
      const request = (event as CustomEvent<CardManagementFilterByCardsRequest | null>).detail;
      await applyExternalCardFilterRequest(request);
    };
    window.addEventListener('Weave:filter-by-cards', handleFilterByCards as EventListener);
    
    // 监听侧边栏视图切换事件
    const handleSidebarViewChange = (e: CustomEvent<string>) => {
      const view = e.detail as 'table' | 'grid' | 'kanban';
      switchView(view);
    };
    window.addEventListener('Weave:sidebar-view-change', handleSidebarViewChange as EventListener);
    
    // 监听彩色圆点的数据源切换事件
    const handleCardDataSourceChange = async (e: Event) => {
      const source = normalizeVisibleCardDataSource(
        (e as CustomEvent<string>).detail as 'memory' | 'questionBank' | 'incremental-reading'
      );
      await switchDataSource(source);
    };
    window.addEventListener('Weave:card-data-source-change', handleCardDataSourceChange);

    const handleCardManagementSearchChange = (e: Event) => {
      const value = (e as CustomEvent<{ value?: string }>).detail?.value ?? '';
      handleSearch(value);
    };
    window.addEventListener('Weave:card-management-search-change', handleCardManagementSearchChange as EventListener);

    const handleIRTimerRefresh = (e: Event) => {
      if (dataSource !== 'incremental-reading') return;
      const detail = (e as CustomEvent<{ blockId?: string; totalSeconds?: number }>).detail;
      applyIRTimerUpdateToCards(
        String(detail?.blockId || '').trim(),
        Number(detail?.totalSeconds || 0)
      );
    };

    const handleIRRealtimeRefresh = () => {
      if (dataSource !== 'incremental-reading') return;
      queueIRContentReload({ silent: true, debounceMs: 120 });
    };
    window.addEventListener('Weave:ir-timer-updated', handleIRTimerRefresh);
    window.addEventListener('Weave:ir-data-updated', handleIRRealtimeRefresh);

    const handleCardManagementToolbarAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action?: string; anchor?: HTMLElement | null }>).detail;
      const action = detail?.action;
      const anchor = detail?.anchor ?? null;

      switch (action) {
        case 'create-card':
          handleCreateCard();
          break;
        case 'toggle-document-filter':
          if (currentActiveDocument) {
            toggleDocumentFilter();
          }
          break;
        case 'toggle-card-location-jump':
          void toggleCardLocationJump();
          break;
        case 'toggle-card-relation-filter':
          void toggleCardRelationFilterMode();
          break;
        case 'table-view-basic':
          void handleTableViewModeChange('basic');
          break;
        case 'table-view-review':
          void handleTableViewModeChange('review');
          break;
        case 'ir-type-md':
          irTypeFilter = irTypeFilter === 'md' ? 'all' : 'md';
          void saveViewPreferences();
          break;
        case 'ir-type-pdf':
          irTypeFilter = irTypeFilter === 'pdf' ? 'all' : 'pdf';
          void saveViewPreferences();
          break;
        case 'grid-layout-fixed':
          void handleLayoutModeChange('fixed');
          break;
        case 'grid-layout-masonry':
          void handleLayoutModeChange('masonry');
          break;
        case 'grid-layout-timeline':
          void handleLayoutModeChange('timeline');
          break;
        case 'grid-border-style-solid':
          void handleGridCardBorderStyleChange('solid');
          break;
        case 'grid-border-style-dashed':
          void handleGridCardBorderStyleChange('dashed');
          break;
        case 'toggle-search':
          handleMobileSearchClick();
          break;
        case 'kanban-layout-compact':
          void handleKanbanLayoutModeChange('compact');
          break;
        case 'kanban-layout-comfortable':
          void handleKanbanLayoutModeChange('comfortable');
          break;
        case 'kanban-layout-spacious':
          void handleKanbanLayoutModeChange('spacious');
          break;
        case 'open-data-management':
          openDataManagementModal();
          break;
        case 'open-column-manager':
          toggleColumnManager(anchor);
          break;
        case 'open-kanban-column-settings':
          window.dispatchEvent(new CustomEvent('Weave:open-kanban-column-settings-menu'));
          break;
        case 'open-grid-attribute-menu':
          openGridAttributeMenu(anchor);
          break;
        default:
          if (action && !isCardManagementToolbarDispatchAction(action)) {
            logger.warn('[CardManagement] 未识别的工具栏动作:', action);
          }
          break;
      }
    };
    window.addEventListener('Weave:card-management-toolbar-action', handleCardManagementToolbarAction as EventListener);

    /**
     * 仅移动端由页面自己接管主菜单请求。
     *
     * 原因：
     * - 移动端的卡片管理头部是页面内自定义头部，菜单状态以页面实时状态为准
     * - 桌面端则应继续交给 WeaveView/SidebarNavHeader 的桌面菜单逻辑处理
     * - 如果这里在桌面端也拦截，就会绕开桌面专用的“顶部已承担则菜单去重”规则，
     *   从而出现内容区重复显示
     */
    const handleMainInterfaceMenuRequest = (e: Event) => {
      const detail = (e as CustomEvent<{
        page?: string;
        event?: MouseEvent;
        source?: string;
      }>).detail;

      if (detail?.page !== 'weave-card-management') {
        return;
      }

      if (!(detail.event instanceof MouseEvent)) {
        return;
      }

      if (!isMobile) {
        return;
      }

      e.preventDefault();
      showMobileCardManagementMenu(detail.event);
    };
    window.addEventListener(
      'Weave:request-main-interface-menu',
      handleMainInterfaceMenuRequest as EventListener
    );
    
    // 初始化时通知父组件当前视图状态
    window.dispatchEvent(new CustomEvent('Weave:card-view-change', { detail: currentView }));
    
    // 立即订阅当前活动文档变化
    const updateActiveDocumentNow = () => {
      const nextActiveDocument = resolveCurrentActiveDocument(plugin.app.workspace.activeLeaf);
      currentActiveDocument = nextActiveDocument;
      logger.debug('[卡片管理] 当前活动文档更新:', currentActiveDocument, {
        activeLeafType: plugin.app.workspace.activeLeaf?.view?.getViewType?.() ?? 'unknown'
      });
    };
    
    // 调用一次，确保初始化
    updateActiveDocumentNow();
    
    // 订阅增量阅读活动文档变化
    const irUnsubscribe = irActiveDocumentStore.subscribe((filePath) => {
      currentActiveDocument = resolveCurrentActiveDocument(plugin.app.workspace.activeLeaf);
    });
    
    // 订阅EPUB阅读器活动文档变化
    const epubUnsubscribe = epubActiveDocumentStore.subscribe((filePath) => {
      currentActiveDocument = resolveCurrentActiveDocument(plugin.app.workspace.activeLeaf);
    });
    
    // 监听文档切换事件
    const eventRef = plugin.app.workspace.on('active-leaf-change', (leaf) => {
      currentActiveDocument = resolveCurrentActiveDocument((leaf as WorkspaceLeaf | null) ?? plugin.app.workspace.activeLeaf);
    });
    const fileOpenRef = plugin.app.workspace.on('file-open', () => {
      currentActiveDocument = resolveCurrentActiveDocument(plugin.app.workspace.activeLeaf);
    });
    
    // 保存清理函数
    documentListenerCleanup = () => {
      plugin.app.workspace.offref(eventRef);
      plugin.app.workspace.offref(fileOpenRef);
      irUnsubscribe();
      epubUnsubscribe();
    };
    
    // 异步初始化
    initializeAsync();

    // 修复：不再从 localStorage 恢复文档过滤模式
    // 保持初始值为 'all'，用户需要主动点击才会应用过滤
    // 这避免了自动触发文档过滤的问题

    // 关键修复：同步列可见性与当前数据源，防止表头与数据源错乱
    syncColumnVisibilityWithDataSource(dataSource);

    isLoading = false;

    // 清理函数
    const cleanupResources = () => {
      // 关闭活动的编辑器
      if (editorPoolManager) {
        try {
          // 编辑器管理器会在组件销毁时自动清理
          logger.debug('[cleanupResources] 编辑器管理器存在，将自动清理');
        } catch (error) {
          logger.debug('[cleanupResources] 清理编辑器失败:', error);
        }
      }
      
      isViewDestroyed = true;
      
      // 清理所有间隔
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
      
      // 清理导航超时
      if (navigationTimeout !== null) {
        clearTimeout(navigationTimeout);
        navigationTimeout = null;
      }
      
      // 清理内容缓存，防止内存泄漏
      // 但如果正在导航，保留缓存以避免返回时重新计算
      if (!isNavigatingToSource) {
        contentCache.clear();
      }
      
      // 清理订阅
      if (filterUnsubscribe) {
        filterUnsubscribe();
      }
      
      // 清理数据同步服务
      if (cardsUnsubscribe) {
        cardsUnsubscribe();
        // 数据订阅已取消
      }
      
      // 清理排序定时器
      if (sortLockReleaseTimer !== null) {
        clearTimeout(sortLockReleaseTimer);
        sortLockReleaseTimer = null;
        // 排序定时器已清理
        tableDataTimer = null;
      }
      
      // 清理统计数据更新定时器
      if (statisticsUpdateTimer !== null) {
        clearTimeout(statisticsUpdateTimer);
        statisticsUpdateTimer = null;
      }
      
      // 重置排序状态
      isSorting = false;
      sortingField = null;
      sortingDirection = null;
      
      // Clean up active document listener
      if (documentListenerCleanup) {
        documentListenerCleanup();
      }
      
      // Remove event listeners
      // 注：这些事件监听器未使用，已移除
      
      // 性能优化：清理缓存以释放内存
      contentCache.clear();
      cachedTransformedCards = [];
      
      isMounted = false;  // 标记组件已卸载
      
      window.removeEventListener('resize', handleResize);
      plugin.app.workspace.off('layout-change', layoutChangeHandler);
      window.removeEventListener('Weave:filter-by-cards', handleFilterByCards as EventListener);
      window.removeEventListener('Weave:sidebar-view-change', handleSidebarViewChange as EventListener);
      window.removeEventListener('Weave:card-data-source-change', handleCardDataSourceChange);
      window.removeEventListener('Weave:card-management-search-change', handleCardManagementSearchChange as EventListener);
      window.removeEventListener('Weave:card-management-toolbar-action', handleCardManagementToolbarAction as EventListener);
      window.removeEventListener(
        'Weave:request-main-interface-menu',
        handleMainInterfaceMenuRequest as EventListener
      );
      if (irReloadTimer !== null) {
        window.clearTimeout(irReloadTimer);
        irReloadTimer = null;
      }
      window.removeEventListener('Weave:ir-timer-updated', handleIRTimerRefresh);
      window.removeEventListener('Weave:ir-data-updated', handleIRRealtimeRefresh);
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
    
    // 返回清理函数
    return cleanupResources;
  });
  
  // 修复：添加 onDestroy，确保组件销毁时清理资源
  onDestroy(() => {
    logger.debug('[卡片管理] 组件销毁，清理资源');
    columnManagerModalInstance?.close();
    columnManagerModalInstance = null;
    dataManagementModalInstance?.close();
    dataManagementModalInstance = null;
    isViewVisible = false;  // 标记视图不可见
    isViewDestroyed = true; // 标记视图已销毁
  });

  // 已移除旧的 CustomEvent 监听器（Weave:refresh-cards）
  // 现在使用 DataSyncService 统一管理数据刷新

  // loadFieldTemplates 已删除（新系统使用动态解析，无需预加载模板）

  async function loadCards() {
    try {
      logger.debug('[卡片管理] 开始加载卡片数据...');
      
      // 等待所有核心服务就绪（包括 cardFileService）
      await waitForServiceReady('allCoreServices', 15000);
      
      // v2.0: 完全引用式架构 - 从统一存储获取所有卡片
      let allCards: Card[] = await dataStorage.getCards();
      
      // 同时加载牌组数据
      allDecks = await dataStorage.getDecks();
      logger.debug(`[卡片管理] 从统一存储加载 ${allCards.length} 张卡片`);
      allCards.forEach((card) => syncCardStatsToCanonicalFormat(card));

      // 确保是新引用，触发 Svelte 响应式更新
      cards = [...allCards];
      contentCache.clear();
      invalidateCardManagementDerivedCaches();
      await refreshMemoryDeckOrganizationRuntime(allCards, allDecks);

      // 卡片加载完成
    } catch (error) {
      logger.error('加载卡片失败:', error);
      cards = [];
      memoryDeckOrganizationRuntime = null;
      new Notice(t('cards.management.loadFailed', { error: error instanceof Error ? error.message : 'Unknown error' }), 5000);
    }
  }

  async function refreshMemoryDeckOrganizationRuntime(
    sourceCards?: Card[],
    sourceDecks?: Deck[]
  ): Promise<MemoryDeckOrganizationRuntime | null> {
    if (dataSource !== 'memory') {
      memoryDeckOrganizationRuntime = null;
      return null;
    }

    const emergentDeckService = getEmergentDeckService(plugin);
    if (!emergentDeckService.isEnabled()) {
      memoryDeckOrganizationRuntime = null;
      return null;
    }

    const cardsForRuntime = Array.isArray(sourceCards) ? sourceCards : await dataStorage.getCards();
    const decksForRuntime = Array.isArray(sourceDecks) ? sourceDecks : await dataStorage.getDecks();
    const runtime = await emergentDeckService.buildRuntimeWithBindings(cardsForRuntime, decksForRuntime);
    memoryDeckOrganizationRuntime = runtime;
    return runtime;
  }


  // 安全创建Date对象
  function createSafeDate(dateValue: any): Date | null {
    if (!dateValue) return null;
    
    try {
      const date = new Date(dateValue);
      // 检查是否是有效的Date对象
      if (isNaN(date.getTime())) {
        return null;
      }
      return date;
    } catch (error) {
      return null;
    }
  }

  // 获取牌组名称
  function getDeckName(deckId: string, decksForLookup: Array<{ id: string; name: string }> = getDecksForDataSource()): string {
    const deck = decksForLookup.find(d => d.id === deckId);
    return deck?.name || deckId;
  }

  function resolveIRDeckId(deckIdentifier?: string | null): string {
    const normalized = String(deckIdentifier || '').trim();
    if (!normalized) return '';

    const deck = getDecksForDataSource('incremental-reading').find(
      (candidate: any) => candidate.id === normalized || String(candidate?.path || '').trim() === normalized
    ) as any;
    return deck?.id || normalized;
  }

  function resolveIRDeckIds(deckIds: Array<string | null | undefined>): string[] {
    return Array.from(
      new Set(
        (Array.isArray(deckIds) ? deckIds : [])
          .map((deckId) => resolveIRDeckId(deckId))
          .filter(Boolean)
      )
    );
  }

  function getIRDeckName(deckId?: string | null, fallback: string = '未分配'): string {
    const resolvedDeckId = resolveIRDeckId(deckId);
    if (!resolvedDeckId) return fallback;
    return getDeckName(resolvedDeckId, getDecksForDataSource('incremental-reading')) || fallback;
  }

  function isIRDeckIdentifierLike(value: string | null | undefined): boolean {
    const normalized = String(value || '').trim();
    return /^deck-[a-z0-9_-]+$/i.test(normalized);
  }
  
  // v2.2: 获取卡片所属的所有牌组名称（Content-Only 架构）
  // 优先从 content YAML 的 we_decks 获取，回退到 referencedByDecks/deckId
  function getCardDeckNames(card: Card): string {
    if (dataSource === 'incremental-reading') {
      const names: string[] = [];
      const seen = new Set<string>();
      const ids = resolveIRDeckIds((card as any).ir_deck_ids || (card as any).metadata?.deckIds || []);
      if (Array.isArray(ids)) {
        for (const id of ids) {
          const name = getIRDeckName(id, '');
          if (name && !seen.has(name)) {
            seen.add(name);
            names.push(name);
          }
        }
      }
      const singleName = (card as any).ir_deck;
      if (
        typeof singleName === 'string' &&
        singleName &&
        singleName !== '未分配' &&
        !isIRDeckIdentifierLike(singleName) &&
        !seen.has(singleName)
      ) {
        names.push(singleName);
      }
      if (names.length > 0) return names.join(', ');
    }

    // 直接使用 yaml-utils 工具函数，内部已实现完整回退链：
    // 1. content YAML 的 we_decks（牌组名称）← 权威数据源
    // 2. card.referencedByDecks（牌组ID列表）
    // 3. card.deckId（单个牌组ID）
    const decksForLookup = getDecksForDataSource(dataSource);
    const names = getCardDeckNamesFromYaml(card, decksForLookup, '-');
    return names.join(', ');
  }

  function getIRReadingSeconds(
    id: string,
    readingSecondsById: Map<string, number>,
    fallback: number | null | undefined
  ): number {
    if (readingSecondsById.has(id)) {
      return readingSecondsById.get(id) || 0;
    }
    return Math.max(0, Number(fallback || 0));
  }


  function buildIRCardBase(params: {
    id: string;
    deckId?: string;
    templateId: string;
    type: string;
    content: string;
    front: string;
    back: string;
    sourceFile: string;
    sourcePosition?: { startLine: number; endLine: number; contentHash: string };
    created: string;
    modified: string;
    totalReviews?: number;
    totalTime?: number;
    averageTime?: number;
    fsrsState: number;
    stability?: number;
    due?: string;
    lastReview?: string;
    reps?: number;
    scheduledDays?: number;
    tags?: string[];
    priority?: number;
    suspended?: boolean;
    metadata?: Record<string, any>;
    sourceKind?: IRTraceSourceKind;
    sourceDocumentKey?: string;
    sourceSubunitKey?: string;
    primaryAssociatedNotePath?: string;
    associatedNotePath?: string;
    associatedNotePaths?: string[];
  }): Card & Record<string, any> {
    return {
      id: params.id,
      uuid: params.id,
      deckId: params.deckId || '',
      templateId: params.templateId as any,
      type: params.type as any,
      content: params.content,
      fields: {
        front: params.front,
        back: params.back
      },
      sourceFile: params.sourceFile,
      sourcePosition: params.sourcePosition || {
        startLine: 0,
        endLine: 0,
        contentHash: ''
      },
      created: params.created,
      modified: params.modified,
      stats: {
        totalReviews: params.totalReviews || 0,
        totalTime: params.totalTime || 0,
        averageTime: params.averageTime || 0
      },
      fsrs: {
        state: params.fsrsState as any,
        difficulty: 0.3,
        stability: params.stability || 0,
        due: params.due || new Date().toISOString(),
        lastReview: params.lastReview || undefined,
        reps: params.reps || 0,
        lapses: 0,
        elapsedDays: 0,
        scheduledDays: params.scheduledDays || 0,
        retrievability: 1
      },
      tags: params.tags || [],
      priority: params.priority || 2,
      sourceKind: params.sourceKind,
      sourceDocumentKey: params.sourceDocumentKey,
      sourceSubunitKey: params.sourceSubunitKey,
      primaryAssociatedNotePath: params.primaryAssociatedNotePath ?? params.associatedNotePath,
      associatedNotePath: params.associatedNotePath,
      associatedNotePaths: params.associatedNotePaths || (params.associatedNotePath ? [params.associatedNotePath] : []),
      suspended: params.suspended || false,
      metadata: params.metadata || {}
    };
  }

  // 将 Card 转换为表格显示格式
  // 添加缓存优化（使用computed状态）
  // 性能优化：添加内容缓存
  const contentCache = new Map<string, { front: string; back: string }>();
  
  // 性能优化：跟踪导航状态，避免缓存清理
  let isNavigatingToSource = $state(false);
  let navigationTimeout: number | null = null;
  let refreshInterval: number | null = null;  // 添加 refreshInterval 定义
  
  // 性能优化：添加转换结果缓存
  let lastFilteredCardsKey: string = '';
  let cachedTransformedCards: any[] = [];

  function invalidateCardManagementDerivedCaches(): void {
    lastFilteredCardsKey = '';
    cachedTransformedCards = [];
    dataVersion++;
  }

  function invalidateCardManagementContentCache(cardId?: string | null): void {
    const normalizedCardId = String(cardId || '').trim();
    if (!normalizedCardId) return;

    for (const [key] of contentCache) {
      if (key === normalizedCardId || key.startsWith(`${normalizedCardId}_`)) {
        contentCache.delete(key);
      }
    }
  }

  async function applySavedCardToCurrentDataSource(updatedCard: Card): Promise<void> {
    const normalizedCardId = String(updatedCard?.uuid || '').trim();
    if (!normalizedCardId) return;

    invalidateCardCache(normalizedCardId);
    invalidateCardManagementContentCache(normalizedCardId);

    if (dataSource === 'questionBank') {
      let changed = false;
      questionBankCards = questionBankCards.map((card) => {
        if (card.uuid !== normalizedCardId) return card;
        changed = true;
        return { ...card, ...updatedCard };
      });

      if (changed) {
        const nextStats = new Map(questionBankStats);
        const testStats = updatedCard.stats?.testStats;
        if (testStats) {
          nextStats.set(normalizedCardId, testStats);
        } else {
          nextStats.delete(normalizedCardId);
        }
        questionBankStats = nextStats;
        invalidateCardManagementDerivedCaches();
      }
      return;
    }

    if (dataSource === 'memory') {
      let changed = false;
      const nextCards = cards.map((card) => {
        if (card.uuid !== normalizedCardId) return card;
        changed = true;
        return { ...card, ...updatedCard };
      });

      if (changed) {
        cards = nextCards;
        await refreshMemoryDeckOrganizationRuntime(nextCards, allDecks);
        invalidateCardManagementDerivedCaches();
      }
    }
  }

  function applyIRCardPatch(cardId: string, patch: Partial<Card> & Record<string, unknown>): void {
    const normalizedCardId = String(cardId || '').trim();
    if (!normalizedCardId) return;

    let changed = false;
    irContentCards = irContentCards.map((card) => {
      if (card.uuid !== normalizedCardId) return card;
      changed = true;
      const nextCard = {
        ...card,
        ...patch,
        metadata: {
          ...(card.metadata || {}),
          ...((patch as any).metadata || {}),
        },
      } as Card;
      return nextCard;
    });

    if (changed) {
      invalidateCardManagementDerivedCaches();
    }
  }

  function applyIRTimerUpdateToCards(blockId: string, totalSeconds: number): void {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId || !Number.isFinite(totalSeconds)) return;

    let changed = false;
    irContentCards = irContentCards.map((card) => {
      if (card.uuid !== normalizedBlockId) return card;

      const previousSeconds = Number((card as any).ir_reading_time ?? card.stats?.totalTime ?? 0);
      if (previousSeconds === totalSeconds) {
        return card;
      }

      changed = true;
      return {
        ...card,
        ir_reading_time: totalSeconds,
        stats: {
          ...(card.stats || {}),
          totalTime: totalSeconds
        }
      } as Card;
    });

    if (changed) {
      invalidateCardManagementDerivedCaches();
    }
  }

  function queueIRContentReload(options: { silent?: boolean; debounceMs?: number } = {}): void {
    const debounceMs = Math.max(0, options.debounceMs ?? 120);

    if (irReloadTimer !== null) {
      window.clearTimeout(irReloadTimer);
      irReloadTimer = null;
    }

    irReloadTimer = window.setTimeout(async () => {
      irReloadTimer = null;
      if (isLoadingIR) {
        irReloadQueued = true;
        return;
      }
      await loadIRContentCards({ silent: options.silent ?? true });
    }, debounceMs);
  }
  
  // 生成卡片数组的缓存键（基于内容而非引用）
  function generateCacheKey(cards: Card[]): string {
    if (!cards || cards.length === 0) return 'empty';
    // 覆盖 IR/记忆/题库三类列表中会影响展示、分组、统计的关键字段
    const first10 = cards.slice(0, 10).map(c => 
      [
        c.uuid,
        (c.tags || []).join('|'),
        (c as any).ir_tags?.join('|') || '',
        c.priority || 0,
        (c as any).ir_priority_value ?? (c as any).ir_priority ?? '',
        (c as any).ir_tag_group || '',
        (c as any).ir_deck_ids?.join('|') || '',
        (c as any).metadata?.deckIds?.join('|') || '',
        (c as any).ir_notes ?? '',
        (c as any).ir_extract_cards ?? '',
        (c as any).ir_memory_cards ?? '',
        c.metadata?.favorite || false
      ].join(':')
    ).join(',');
    const count = cards.length;
    const firstMod = cards[0]?.modified || '';
    const lastMod = cards[cards.length - 1]?.modified || '';
    const propsHash = cards.map(c => 
      [
        [...(c.tags || [])].sort().join('|'),
        [...(((c as any).ir_tags || []))].sort().join('|'),
        c.priority || 0,
        (c as any).ir_priority_value ?? (c as any).ir_priority ?? 0,
        (c as any).ir_tag_group || '',
        [...(((c as any).ir_deck_ids || []))].sort().join('|'),
        [...(((c as any).metadata?.deckIds || []))].sort().join('|'),
        (c as any).ir_notes ?? 0,
        (c as any).ir_extract_cards ?? 0,
        (c as any).ir_memory_cards ?? 0,
        c.metadata?.favorite || false
      ].join(':')
    ).join(';');
    return `${count}:${first10}:${firstMod}:${lastMod}:${propsHash.length}`;
  }
  
  // 性能优化：延迟计算标志
  let isTableDataReady = $state(false);
  let tableDataTimer: number | null = null;
  let lastViewSwitch = 0;  // 记录上次视图切换时间
  
  // 监听视图切换，延迟初始化表格数据
  $effect(() => {
    if (currentView === 'table') {
      const now = Date.now();
      // 如果距离上次切换不到500ms，说明是标签切换导致的，使用更长的延迟
      const delay = (now - lastViewSwitch < 500) ? 300 : 100;
      lastViewSwitch = now;
      
      // 切换到表格视图时，延迟后才开始转换数据
      if (tableDataTimer) clearTimeout(tableDataTimer);
      tableDataTimer = window.setTimeout(() => {
        isTableDataReady = true;
        tableDataTimer = null;
      }, delay);
    } else {
      // 切换到其他视图时，保持表格数据状态但不重新计算
      lastViewSwitch = Date.now();
      if (tableDataTimer) {
        clearTimeout(tableDataTimer);
        tableDataTimer = null;
      }
      // 不立即设置 isTableDataReady = false，保留缓存
    }
  });
  
  // 性能优化：使用 $derived 缓存转换结果，避免每次渲染时重新计算
  let transformedCards = $derived.by(() => {
    // 添加 dataVersion 依赖，确保数据更新时触发重新计算
    void dataVersion;
    
    // 性能优化：如果不在表格视图或组件未挂载或视图不可见，直接返回空数组
    if (!isMounted || !isViewVisible || currentView !== 'table') {
      return [];
    }
    
    // 只在表格视图可见且数据准备好时才进行转换
    if (!isTableDataReady) {
      return cachedTransformedCards.length > 0 ? cachedTransformedCards : [];
    }
    
    // 生成当前数组的缓存键（包含dataVersion以确保缓存失效）
    const currentKey = generateCacheKey(filteredCards) + `-v${dataVersion}`;
    
    // 检查内容是否真的变化了（基于内容的缓存键比较）
    if (currentKey === lastFilteredCardsKey && cachedTransformedCards.length > 0) {
      return cachedTransformedCards; // 直接返回缓存
    }
    
    const startTime = performance.now();
    const result = transformCardsForTable(filteredCards);
    const elapsed = performance.now() - startTime;
    
    // 性能监控：记录所有转换
    logger.debug(`[性能优化] 卡片转换耗时: ${elapsed.toFixed(2)}ms, 卡片数量: ${filteredCards.length}, 每页: ${itemsPerPage}`);
    
    // 更新缓存
    lastFilteredCardsKey = currentKey;
    cachedTransformedCards = result;
    
    return result;
  });
  
  function transformCardsForTable(cards: Card[]): any[] {
    return cards.map(card => {
      // 安全获取修改时间
      const modifiedTime = createSafeDate(card.modified || card.created);
      
      // 安全获取FSRS数据
      const nextReview = card.fsrs?.due ? createSafeDate(card.fsrs.due) : null;
      const retention = card.fsrs?.retrievability ?? 0;
      const interval = card.fsrs?.scheduledDays ?? 0;
      // 将difficulty从number转换为字符串类型
      const difficultyNum = card.fsrs?.difficulty ?? 5;
      const difficulty: "easy" | "medium" | "hard" | undefined = 
        difficultyNum < 4 ? "easy" : difficultyNum < 7 ? "medium" : "hard";
      const reviewCount = card.reviewHistory?.length ?? 0;
      
      // 获取题库统计数据
      const testStats = questionBankStats.get(card.uuid);
      
      // 性能优化：使用缓存避免重复解析
      const cacheKey = `${card.uuid}_${card.modified || ''}`;
      
      let content = contentCache.get(cacheKey);
      
      if (!content) {
        // 性能优化：只在表格视图真正需要时才计算内容
        // 延迟计算：使用占位符，真正显示时才计算
        if (currentView !== 'table') {
          content = { front: '', back: '' };
        } else {
          // 修复：从 content 解析正反面（使用 ---div--- 分割符）
          let front = '';
          let back = '';
          
          if (card.content && card.content.trim()) {
            // 1. 先剥离 YAML frontmatter
            const bodyContent = extractBodyContent(card.content).trim();
            
            // 2. 使用 ---div--- 分割正反面
            const dividerIndex = bodyContent.indexOf(MAIN_SEPARATOR);
            
            if (dividerIndex >= 0) {
              front = bodyContent.substring(0, dividerIndex).trim();
              back = bodyContent.substring(dividerIndex + MAIN_SEPARATOR.length).trim();
            } else {
              // 无分割符：整个内容作为正面
              front = bodyContent;
            }
          } else {
            // 回退到 fields（兼容 Anki 同步格式）
            front = getCardContentBySide(card, 'front', []);
            back = getCardContentBySide(card, 'back', []);
          }
          
          content = { front, back };
        }
        contentCache.set(cacheKey, content);
        
        // 限制缓存大小，防止内存泄漏
        if (contentCache.size > 1000) { // 增加缓存大小
          // 批量删除旧缓存
          const keysToDelete = [];
          let count = 0;
          for (const key of contentCache.keys()) {
            keysToDelete.push(key);
            if (++count >= 100) break; // 批量删除100个
          }
          keysToDelete.forEach(key => contentCache.delete(key));
        }
      }
      
      return {
        ...card,
        // 修复：确保 tags 是新数组引用，触发 TagsCell 响应式更新
        tags: card.tags ? [...card.tags] : [],
        front: content.front,
        back: content.back,
        resolvedDeckRefs: dataSource === 'memory'
          ? memoryDeckOrganizationRuntime?.resolvedDeckRefsByCardUUID[card.uuid] || []
          : [],
        status: getCardStatusString(card.fsrs?.state ?? 0),
        deck: getCardDeckNames(card), // v2.0: 支持多牌组引用显示
        nextReview: card.fsrs?.due,
        sourceDocumentStatus: getSourceDocumentStatus(card),
        // 修复：添加块引用字段映射
        obsidian_block_link: extractSourceBlock(card) || '-',
        source_document: extractSourcePath(card) || '-',
        // 添加复习历史相关数据（保持字符串类型以兼容Card接口）
        modified: modifiedTime ? modifiedTime.toISOString() : new Date().toISOString(),
        next_review: nextReview,
        retention: retention,
        interval: interval,
        difficulty: difficulty,
        review_count: reviewCount,
        // 添加题库专用数据
        question_type: getQuestionTypeLabelFromCard(card, 'short', '未知'),
        accuracy: formatAccuracy(card),
        accuracy_class: getAccuracyColorClass(card),
        test_attempts: testStats?.totalAttempts ?? 0,
        last_test: testStats?.lastTestDate ? formatRelativeTime(testStats.lastTestDate) : '-',
        error_level: formatErrorLevel(card),
      };
    });
  }

  // 获取卡片状态字符串
  function getCardStatusString(state: number): string {
    switch (state) {
      case 0: return "new";
      case 1: return "learning";
      case 2: return "review";
      case 3: return "relearning";
      default: return "unknown";
    }
  }

  // 获取源文档状态
  // 遵循卡片数据结构规范 v1.0：使用专用字段 card.sourceFile
  // v2.1.1: 使用 metadataCache 支持仅文件名格式
  function getSourceDocumentStatus(card: Card): string {
    const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
    // 优先使用专用字段 card.sourceFile
    if (card.sourceFile) {
      const linkText = card.sourceFile.replace(/\.md$/, '');
      const file = plugin.app.metadataCache.getFirstLinkpathDest(linkText, contextPath);
      if (file) {
        return "存在";
      } else {
        return "已删除";
      }
    }
    
    // 向后兼容：检查旧的customFields字段
    if (card.customFields?.obsidianFilePath) {
      const filePath = card.customFields.obsidianFilePath as string;
      if (filePath && typeof filePath === 'string') {
        const linkText = filePath.replace(/\.md$/, '');
        const file = plugin.app.metadataCache.getFirstLinkpathDest(linkText, contextPath);
        if (file) return "存在";
      }
      return "已删除";
    }

    // 没有源文档信息的卡片（如导入的卡片）
    return "无源文档";
  }
  
  // 获取源文档显示文本（用于表格显示）
  function getSourceDocumentText(card: Card): string {
    // 优先使用专用字段
    if (card.sourceFile) {
      // 提取文件名（不含路径）
      const fileName = card.sourceFile.split('/').pop() || card.sourceFile;
      return fileName;
    }
    
    // 向后兼容：使用customFields
    if (card.customFields?.obsidianFilePath) {
      const filePath = card.customFields.obsidianFilePath as string;
      const fileName = filePath.split('/').pop() || filePath;
      return fileName;
    }
    
    return '';
  }
  
  // 点击源文档跳转到文件并高亮显示
  // v2.1.3: 使用 parseSourceInfo 从 card.content 解析源文件信息，与卡片详情模态窗保持一致
  async function jumpToSourceDocument(card: Card) {
    try {
      // 设置导航状态，防止缓存被清理
      isNavigatingToSource = true;
      
      // 清理之前的导航超时
      if (navigationTimeout !== null) {
        clearTimeout(navigationTimeout);
      }
      
      // 设置导航超时，3秒后重置状态
      navigationTimeout = window.setTimeout(() => {
        isNavigatingToSource = false;
        navigationTimeout = null;
      }, 3000);

      const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
      
      let filePath: string | undefined;
      let blockId: string | undefined;

      if (card.content) {
        const yaml = parseYAMLFromContent(card.content);
        const sourceValue = Array.isArray((yaml as any).we_source) ? (yaml as any).we_source[0] : (yaml as any).we_source;
        if (typeof sourceValue === 'string') {
          const start = sourceValue.indexOf('[[');
          const end = sourceValue.lastIndexOf(']]');
          if (start !== -1 && end !== -1 && end > start + 2) {
            let linkText = sourceValue.slice(start + 2, end).trim();
            const aliasIndex = linkText.indexOf('|');
            if (aliasIndex !== -1) {
              linkText = linkText.slice(0, aliasIndex).trim();
            }
            const pathOnly = linkText.split('#')[0].replace(/\.md$/, '');
            if (pathOnly) {
              const file = plugin.app.metadataCache.getFirstLinkpathDest(pathOnly, contextPath);
              if (file) {
                // EPUB文件：拦截到插件内置阅读器，避免系统外部阅读器打开
                if (pathOnly.toLowerCase().endsWith('.epub')) {
                  const hashPart = linkText.includes('#') ? linkText.slice(linkText.indexOf('#')) : '';
                  const { EpubLinkService } = await import('../../services/epub-integration/EpubLinkService');
                  const parsed = EpubLinkService.parseEpubLink(hashPart);
                  const linkService = new EpubLinkService(plugin.app);
                  await linkService.navigateToEpubLocation(file.path, parsed?.cfi || '', parsed?.text || '');
                  new Notice(parsed?.cfi ? t('cardManagement.notices.jumpedToEpubSource') : t('cardManagement.notices.openedEpubSource'));
                  return;
                }

                // Canvas 文件需要走后面的专用定位分支
                if (!pathOnly.toLowerCase().endsWith('.canvas')) {
                  await plugin.app.workspace.openLinkText(linkText, contextPath, false);
                  if (linkText.includes('#^')) {
                    new Notice(t('cardManagement.notices.jumpedToSourceBlock'));
                  } else {
                    new Notice(t('cardManagement.notices.openedSourceDocument'));
                  }
                  return;
                }
              }
            }
          }
        }
      }
      
      // v2.1.3: 优先从 card.content YAML 解析源文件信息（与卡片详情模态窗保持一致）
      if (card.content) {
        const sourceInfo = parseSourceInfo(card.content);
        if (sourceInfo.sourceFile) {
          filePath = sourceInfo.sourceFile;
          blockId = sourceInfo.sourceBlock?.replace(/^\^/, ''); // 移除^前缀
        }
      }
      
      // 向后兼容：如果 content 解析失败，使用派生字段
      if (!filePath && card.sourceFile) {
        filePath = card.sourceFile;
        blockId = card.sourceBlock?.replace(/^\^/, '');
      }
      
      // 向后兼容：customFields
      if (!filePath && card.customFields?.obsidianFilePath) {
        filePath = card.customFields.obsidianFilePath as string;
        blockId = card.customFields.blockId as string;
      }
      
      if (!filePath) {
        new Notice(t('cardManagement.notices.noSourceDocument'));
        return;
      }
      
      // EPUB文件：使用插件内置EPUB阅读器打开
      if (filePath.toLowerCase().endsWith('.epub')) {
        let epubCfi = '';
        let epubText = '';
        // 从卡片内容中提取CFI和文本（用于精确定位）
        if (card.content) {
          const epubLinkMatch = card.content.match(/obsidian:\/\/weave-epub\?[^)\s]*/);
          if (epubLinkMatch) {
            try {
              const url = new URL(epubLinkMatch[0]);
              epubCfi = url.searchParams.get('cfi') || '';
              epubText = url.searchParams.get('text') || '';
            } catch {
              const cfiMatch = epubLinkMatch[0].match(/[?&]cfi=([^&]*)/);
              const textMatch = epubLinkMatch[0].match(/[?&]text=([^&]*)/);
              if (cfiMatch) {
                try { epubCfi = decodeURIComponent(cfiMatch[1]); } catch { epubCfi = cfiMatch[1]; }
              }
              if (textMatch) {
                try { epubText = decodeURIComponent(textMatch[1]); } catch { epubText = textMatch[1]; }
              }
            }
          }
        }
        const { EpubLinkService } = await import('../../services/epub-integration/EpubLinkService');
        const linkService = new EpubLinkService(plugin.app);
        await linkService.navigateToEpubLocation(filePath, epubCfi, epubText);
        new Notice(epubCfi ? t('cardManagement.notices.jumpedToEpubSource') : t('cardManagement.notices.openedEpubSource'));
        return;
      }

      // Canvas 文件：使用专门的节点定位服务，而不是仅打开文件
      if (filePath.toLowerCase().endsWith('.canvas')) {
        const normalizedBlockId = normalizeCanvasNodeId(blockId);
        const sourceNavigationService = new SourceNavigationService(plugin.app);
        const { nodeRect: targetRect, textCandidates } = getCanvasLocateSupportFromCardContent(card?.content || '');

        const openedLeaf = await sourceNavigationService.openCanvasAndLocate(
          filePath,
          textCandidates,
            normalizedBlockId,
            {
              label: t('cardManagement.notices.locateSourcePosition'),
              icon: 'map-pinned',
              focus: true,
            openInNewTab: true,
            delayMs: 500,
            nodeRect: targetRect ?? undefined
          }
        );

        if (!openedLeaf) {
          new Notice(t('cardManagement.notices.sourceCanvasMissing'));
          return;
        }

        new Notice(normalizedBlockId || textCandidates.length > 0 || targetRect
          ? '已定位到 Canvas 溯源节点'
          : t('cardManagement.notices.openedSourceCanvas'));
        return;
      }
      
      // Markdown文件：使用Obsidian原生跳转
      const docName = filePath.replace(/\.md$/, '');
      const linktext = blockId ? `${docName}#^${blockId}` : docName;
      await plugin.app.workspace.openLinkText(linktext, contextPath, false);
      
      if (blockId) {
        new Notice(t('cardManagement.notices.jumpedToSourceBlock'));
      } else {
        new Notice(t('cardManagement.notices.openedSourceDocument'));
      }
    } catch (error) {
      logger.error('跳转到源文档失败:', error);
      new Notice(t('cardManagement.notices.navigateFailed'));
    } finally {
      // 确保导航状态被重置
      isNavigatingToSource = false;
    }
  }

  // 清除所有全局筛选
  function clearGlobalFilters() {
    plugin.filterStateService?.clearAll();
    // 清除自定义卡片 ID 筛选
    relationFilterAnchorCardUuid = null;
    customCardIdsFilter = null;
    customFilterName = '';
    new Notice(t('cardManagement.notices.clearedAllFilters'));
  }

  function clearCardRelationFilterResult() {
    relationFilterAnchorCardUuid = null;
    customCardIdsFilter = null;
    customFilterName = '';
  }

  function applyCardRelationFilter(card: Card) {
    const relatedCardIds = collectWeaveRelatedCardUUIDs(card, currentSourceCards);

    const relationResultIds = Array.from(new Set([card.uuid, ...relatedCardIds]));

    relationFilterAnchorCardUuid = card.uuid;
    customCardIdsFilter = new Set(relationResultIds);
    customFilterName = '关联卡片 · ' + buildWeaveCardReferenceLabel(card, 18);
    selectedCards = new Set();
    currentPage = 1;

    if (relationResultIds.length === 1) {
      showNotification(t('cardManagement.notices.noRelatedCardsLocated'), 'info');
      return;
    }

    showNotification(t('cardManagement.notices.filteredRelatedCards', { count: relationResultIds.length }), 'success');
  }

  // 批量更新源文档状态
  async function updateSourceDocumentStatus() {
    try {
      const updatedCards = await Promise.all(
        cards.map(async (card: Card) => {
          const status = getSourceDocumentStatus(card);
          const exists = status === "存在";

          // 更新卡片的 sourceDocumentExists 属性
          const updatedCard = {
            ...card,
            sourceDocumentExists: exists
          };

          // 保存到数据库
          await saveMemoryCardCommand(plugin, updatedCard, 'update');
          return updatedCard;
        })
      );

      // 重新加载卡片数据
      await loadCards();
      
      // 已移除旧的 CustomEvent 触发（Weave:refresh-decks）
      // 现在通过 DataSyncService 在 saveCard 时自动通知

      new Notice(t('cardManagement.notices.sourceStatusUpdated', { count: updatedCards.length }));
    } catch (error) {
      logger.error('更新源文档状态失败:', error);
      new Notice(t('cardManagement.notices.sourceStatusUpdateFailed'));
    }
  }
  // 孤儿卡片扫描（只在表格工具栏点击时触发）
  async function handleScanOrphanCards() {
    const files = plugin.app.vault.getMarkdownFiles();

    function findFileByName(name: string) {
      return files.find((f: any) => f.basename === name || f.name === name || f.name === `${name}.md`);
    }

    async function checkCard(card: Card): Promise<'存在' | '缺失' | '无源文档'> {
      try {
        const link = extractSourceBlock(card) || undefined;
        let filePath: string | undefined;
        let blockId: string | undefined;

        if (typeof link === 'string' && link.includes('#^')) {
          const m = link.match(/\[\[([^#\]]+)#\^([^\]]+)\]\]/);
          if (m) {
            const fileName = m[1];
            blockId = m[2];
            const f = findFileByName(fileName);
            filePath = f?.path;
          }
        } else if (typeof link === 'string' && link.startsWith('^')) {
          blockId = link.replace(/^\^/, '');
          const fileName = extractSourcePath(card) || undefined;
          if (fileName) filePath = findFileByName(fileName)?.path;
        } else if (typeof link === 'string') {
          blockId = link.replace(/^\^/, '');
        }

        if (!filePath) {
          filePath = extractSourcePath(card) || undefined;
        }

        if (!filePath) return '无源文档';
        if (!blockId) return '缺失';

        const f = plugin.app.vault.getAbstractFileByPath(filePath);
        if (!f) return '缺失';
        const content = await plugin.app.vault.read(f as any);
        const re = new RegExp(`\\^${blockId}(?![A-Za-z0-9_-])`);
        return re.test(content) ? '存在' : '缺失';
      } catch (e) {
        logger.warn('[Scan] 检查卡片失败', e);
        return '缺失';
      }
    }

    let exist = 0, missing = 0, none = 0;
    for (let i = 0; i < cards.length; i++) {
      const status = await checkCard(cards[i]);
      (cards[i] as any).sourceDocumentStatus = status;
      if (status === '存在') exist++; else if (status === '缺失') missing++; else none++;
    }

    // 触发渲染
    cards = [...cards];

    try {
      new Notice(t('cardManagement.notices.orphanScanSummary', { exist, missing, none }));
    } catch {
      logger.debug(`扫描完成：存在 ${exist}，缺失 ${missing}，无源文档 ${none}`);
    }
  }


  // 搜索功能
  function handleSearch(query: string) {
    searchQuery = query;
    // 解析搜索查询
    parsedSearchQuery = parseSearchQuery(query);
    currentPage = 1;
  }
  
  // 清除搜索
  function handleClearSearch() {
    searchQuery = "";
    parsedSearchQuery = null;
    currentPage = 1;
  }
  
  // 导航回调函数（用于 SidebarNavHeader）
  function handleNavigate(pageId: string) {
    // 触发页面切换事件
    window.dispatchEvent(new CustomEvent('Weave:navigate', { 
      detail: pageId 
    }));
  }
  
  function emitToolbarState() {
    window.dispatchEvent(new CustomEvent('Weave:card-management-toolbar-state', {
      detail: {
        tableViewMode,
        gridLayout,
        gridCardBorderStyle,
        gridCardAttribute,
        kanbanLayoutMode,
        irTypeFilter,
        searchQuery,
        showTableGridBorders,
        documentFilterMode,
        currentActiveDocument,
        enableCardRelationFilterMode,
        enableCardLocationJump,
        dataSource,
        availableDecks: searchAvailableDecks,
        availableTags: searchAvailableTags,
        availablePriorities: searchAvailablePriorities,
        availableQuestionTypes: searchAvailableQuestionTypes,
        availableSources: searchAvailableSources,
        availableStatuses: searchAvailableStatuses,
        availableStates: searchAvailableIRStates,
        availableAccuracies: searchAvailableAccuracies,
        availableAttemptThresholds: searchAvailableAttemptThresholds,
        availableErrorLevels: searchAvailableErrorLevels,
        availableYamlKeys: searchAvailableYamlKeys,
        matchCount: searchQuery ? totalFilteredItems : -1,
        totalCount: searchSourceCards.length,
        sortField: sortConfig.field,
        sortDirection: sortConfig.direction
      }
    }));
  }

  $effect(() => {
    if (!isMounted) return;
    emitToolbarState();
  });

  // 筛选功能
  function handleFilterChange(data: { type: string; value: string; checked: boolean }) {
    const { type, value, checked } = data;

    // 支持所有筛选类型
    if (type === 'status' || type === 'decks' || type === 'tags' || type === 'questionTypes' || type === 'errorBooks') {
      if (checked) {
        filters[type].add(value);
      } else {
        filters[type].delete(value);
      }
      filters = { ...filters }; // 触发响应式更新
      currentPage = 1;
    }
  }

  function handleClearFilters() {
    filters.status = new Set();
    filters.decks = new Set();
    filters.tags = new Set();
    filters.questionTypes = new Set();
    filters.errorBooks = new Set();
  }

  function handleDeleteSavedFilter(filterId: string) {
    if (!filterManager) return;
    
    filterManager.deleteFilter(filterId);
    savedFilters = filterManager.getAllFilters();
    showNotification(t('cardManagement.notices.savedFilterDeleted'), 'success');
  }

  function handleUpdateSavedFilter(filter: SavedFilter) {
    if (!filterManager) return;
    
    filterManager.updateFilter(filter.id, filter);
    savedFilters = filterManager.getAllFilters();
    showNotification(t('cardManagement.notices.savedFilterUpdated'), 'success');
  }
  
  /**
   * 清理空父文件夹
   * @param filePath 已删除文件的路径
   */
  async function cleanEmptyParentFolders(filePath: string): Promise<void> {
    // 获取父文件夹路径
    const parentPath = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!parentPath || parentPath === 'incremental-reading/files/chunks') {
      return; // 不删除根目录
    }
    
    // 尝试删除当前文件夹
    const deleted = await cleanEmptyFolder(parentPath);
    
    // 如果成功删除，继续检查上级文件夹
    if (deleted) {
      const grandParentPath = parentPath.substring(0, parentPath.lastIndexOf('/'));
      if (grandParentPath && grandParentPath.includes('chunks')) {
        await cleanEmptyFolder(grandParentPath);
      }
    }
  }
  
  /**
   * 检查并删除空文件夹
   * @param folderPath 文件夹路径
   * @returns 是否成功删除
   */
  async function cleanEmptyFolder(folderPath: string): Promise<boolean> {
    try {
      const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
      if (!folder || !(folder instanceof TFolder)) {
        return false;
      }
      
      // 检查文件夹是否为空
      if (folder.children.length === 0) {
        await plugin.app.fileManager.trashFile(folder);
        logger.info(`[卡片管理] 删除空文件夹: ${folderPath}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.warn(`[卡片管理] 删除空文件夹失败: ${folderPath}`, error);
      return false;
    }
  }

  function normalizeIRTopicIds(deckIds: Array<string | null | undefined>): string[] {
    const primaryTopicId = resolveIRDeckIds(deckIds)[0];
    return primaryTopicId ? [primaryTopicId] : [];
  }

  function createCardManagementGlobalOperation(config: {
    title: string;
    total: number;
    detail: string;
    allowNavigation?: boolean;
    navigationMessage?: string;
  }) {
    return createGlobalOperationController({
      title: config.title,
      total: config.total,
      detail: config.detail,
      allowNavigation: config.allowNavigation ?? false,
      navigationMessage: config.navigationMessage,
    });
  }

  function isIRManagedChunkCard(card: Card | undefined): boolean {
    if (!card) return false;
    if ((card as any).metadata?.irPdfBookmark || (card as any).metadata?.irEpubBookmark) {
      return false;
    }
    return card.templateId === CardType.IRChunk || card.type === CardType.IRChunk;
  }

  async function deleteIncrementalReadingCards(
    cardsToDelete: Card[],
    onProgress?: (current: number, total: number) => void
  ): Promise<{ ok: number; fail: number }> {
    if (cardsToDelete.length === 0) {
      return { ok: 0, fail: 0 };
    }

    if (!irStorageService) {
      irStorageService = new IRStorageService(plugin.app);
      await irStorageService.initialize();
    }

    const pointWriteService = new IRPointWriteService(plugin.app);
    const affectedSourceIds = new Set<string>();
    const foldersToCheck = new Set<string>();
    let ok = 0;
    let fail = 0;

    for (const card of cardsToDelete) {
      const id = card.uuid;
      try {
        if (isIRManagedChunkCard(card)) {
          const chunk = await irStorageService.getChunkData(id);
          if (chunk) {
            affectedSourceIds.add(chunk.sourceId);
            const file = plugin.app.vault.getAbstractFileByPath(chunk.filePath);
            if (file instanceof TFile) {
              await plugin.app.fileManager.trashFile(file);
              const parentPath = chunk.filePath.substring(0, chunk.filePath.lastIndexOf('/'));
              if (parentPath) {
                foldersToCheck.add(parentPath);
              }
            } else {
              const adapter = plugin.app.vault.adapter;
              if (await adapter.exists(chunk.filePath)) {
                await adapter.remove(chunk.filePath);
                const parentPath = chunk.filePath.substring(0, chunk.filePath.lastIndexOf('/'));
                if (parentPath) {
                  foldersToCheck.add(parentPath);
                }
              }
            }
          }

          await irStorageService.deleteChunkData(id);
          logger.debug(`[IR] 成功删除阅读点文件: ${id}`);
        } else {
          const deleted = await pointWriteService.deleteCard(card);
          if (!deleted) {
            throw new Error(t('cardManagement.notices.irDeleteRecordNotFound', { id }));
          }
          logger.debug(`[IR] 已通过统一写入口删除阅读点: ${id}`);
        }
        ok++;
      } catch (error) {
        logger.error(`[IR] 删除阅读点失败: ${id}`, error);
        fail++;
      } finally {
        onProgress?.(ok + fail, cardsToDelete.length);
      }
    }

    if (affectedSourceIds.size > 0) {
      const chunks = await irStorageService.getAllChunkData();
      const sources = await irStorageService.getAllSources();
      for (const sourceId of affectedSourceIds) {
        const source = sources[sourceId];
        if (!source) continue;

        const remainingChunkIds = (source.chunkIds || []).filter(chunkId => !!chunks[chunkId]);
        if (remainingChunkIds.length === 0) {
          try {
            if (source.indexFilePath) {
              const indexFile = plugin.app.vault.getAbstractFileByPath(source.indexFilePath);
              if (indexFile instanceof TFile) {
                await plugin.app.fileManager.trashFile(indexFile);
                const parentPath = source.indexFilePath.substring(0, source.indexFilePath.lastIndexOf('/'));
                if (parentPath) {
                  foldersToCheck.add(parentPath);
                }
              }
            }
          } catch (error) {
            logger.warn(`[IR] 删除源索引文件失败: ${source.indexFilePath}`, error);
          }

          try {
            await irStorageService.deleteSource(sourceId);
          } catch (error) {
            logger.warn(`[IR] 删除源材料元数据失败: ${sourceId}`, error);
          }
        } else if (remainingChunkIds.length !== (source.chunkIds || []).length) {
          try {
            source.chunkIds = remainingChunkIds;
            source.updatedAt = Date.now();
            await irStorageService.saveSource(source);
          } catch (error) {
            logger.warn(`[IR] 更新源材料元数据失败: ${sourceId}`, error);
          }
        }
      }
    }

    for (const folderPath of foldersToCheck) {
      await cleanEmptyParentFolders(folderPath);
    }

    return { ok, fail };
  }

  // 排序功能
  function handleSort(field: string) {
    // 第一层保护：同步标志位立即阻止
    if (sortingLock) {
      // 排序锁定中
      return;
    }

    // 第二层保护：响应式状态检查
    if (isSorting) {
      // 排序进行中
      return;
    }

    // 清除之前的定时器（如果存在）
    if (sortLockReleaseTimer !== null) {
      clearTimeout(sortLockReleaseTimer);
      sortLockReleaseTimer = null;
    }

    // 立即启用同步锁
    sortingLock = true;

    // 启用加载状态（UI更新）
    isSorting = true;
    
    // 记录排序开始时间
    sortStartTime = Date.now();
    
    // 生成新的排序请求 ID
    sortRequestId++;

    // 排序开始

    // 更新排序配置
    if (sortConfig.field === field) {
      sortConfig.direction = sortConfig.direction === "asc" ? "desc" : "asc";
    } else {
      sortConfig.field = field;
      sortConfig.direction = "desc";
    }
    
    // 注意：锁的释放现在在 $effect 中排序完成后执行
  }
  
  // 显示排序菜单
  function handleShowSortMenu(e: MouseEvent) {
    const menu = new Menu();
    const deckLabel = dataSource === 'incremental-reading' ? t('cardManagement.sortMenu.topic') : t('cardManagement.sortMenu.deck');
    
    const sortFields = [
      { field: 'created', label: t('cardManagement.sortMenu.created'), icon: ICON_NAMES.CLOCK },
      { field: 'modified', label: t('cardManagement.sortMenu.modified'), icon: ICON_NAMES.CLOCK },
      { field: 'front', label: t('cardManagement.sortMenu.front'), icon: ICON_NAMES.FILE_TEXT },
      { field: 'back', label: t('cardManagement.sortMenu.back'), icon: ICON_NAMES.FILE_TEXT },
      { field: 'deck', label: deckLabel, icon: ICON_NAMES.FOLDER },
      { field: 'tags', label: t('cardManagement.sortMenu.tags'), icon: ICON_NAMES.TAG },
      { field: 'status', label: t('cardManagement.sortMenu.status'), icon: ICON_NAMES.CHECK_CIRCLE },
    ];
    
    sortFields.forEach(({ field, label, icon }) => {
      menu.addItem((item) => {
        item.setTitle(label);
        item.setIcon(icon);
        
        // 显示当前排序状态
        if (sortConfig.field === field) {
          item.setChecked(true);
          if (sortConfig.direction === 'asc') {
            item.setTitle(`${label} ${t('cardManagement.sortMenu.ascending')}`);
          } else {
            item.setTitle(`${label} ${t('cardManagement.sortMenu.descending')}`);
          }
        }
        
        item.onClick(() => {
          handleSort(field);
        });
      });
    });
    
    const target = e.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  }


  // 选择功能
  function handleCardSelect(cardUuid: string, selected: boolean) {
    const newSelectedCards = new Set(selectedCards);
    if (selected) {
      newSelectedCards.add(cardUuid);
    } else {
      newSelectedCards.delete(cardUuid);
    }
    selectedCards = newSelectedCards; // 创建新的 Set 实例
  }

  function handleSelectAll(selected: boolean) {
    if (selected) {
      // 创建 filteredCards 的稳定副本，避免在状态变化过程中访问
      const currentFilteredCards = [...filteredCards];
      const visibleCardUuids = currentFilteredCards.map(card => card.uuid);
      selectedCards = new Set(visibleCardUuids);
    } else {
      selectedCards = new Set();
    }
  }

  function handleClearSelection() {
    selectedCards = new Set();
  }

  // 分页事件处理
  function handlePageChange(page: number) {
    currentPage = page;
    // 响应式系统会自动更新 filteredCards
  }

  function handleItemsPerPageChange(size: number) {
    itemsPerPage = size;
    currentPage = 1;
    // 响应式系统会自动更新 filteredCards，无需防抖
  }


  // 批量操作事件处理 - 使用 Obsidian Menu API
  let lastBatchDeckMenuPosition: { x: number; y: number } | null = null;

  function handleBatchChangeDeck(event?: MouseEvent) {
    const selectedCardIds = Array.from(selectedCards);
    logger.debug("更换牌组:", selectedCardIds);
    const batchDeckContext = getBatchMemoryDeckSelectionContext(selectedCardIds);
    const { memoryDecks, uniqueSourceDeckIds } = batchDeckContext;

    if (selectedCardIds.length === 0) {
      new Notice(t('cardManagement.notices.changeDeckSelectCardsFirst'));
      return;
    }

    if (uniqueSourceDeckIds.length !== 1) {
      showNotification(t('cardManagement.notices.batchDeckSameSourceRequired'), 'warning');
      return;
    }

    if (event) {
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      lastBatchDeckMenuPosition = { x: rect.left, y: rect.top - 8 };
    } else {
      lastBatchDeckMenuPosition = { x: window.innerWidth / 2, y: window.innerHeight - 100 };
    }

    const menu = attachMenuApp(new Menu(), plugin.app);
    const selectedSet = new Set(selectedCardIds);

    addMenuSubmenuGroup(
      menu,
      { title: t('cardManagement.batchDeckMenu.memoryDecks'), icon: 'graduation-cap' },
      (submenu) => {
        memoryDecks.forEach((deck) => {
          const deckCardUUIDs = new Set(deck.cardUUIDs || []);
          let anyInDeck = false;
          let allInDeck = true;
          for (const uuid of selectedSet) {
            if (deckCardUUIDs.has(uuid)) {
              anyInDeck = true;
            } else {
              allInDeck = false;
            }
          }
          const indentLevel = deck.level || 0;
          const prefix = indentLevel > 0 ? '  '.repeat(indentLevel) + '└ ' : '';

          submenu.addItem((subItem) => {
            subItem.setTitle(prefix + deck.name);
            if (allInDeck) {
              subItem.setIcon('check-square');
            } else {
              subItem.setIcon(anyInDeck ? 'minus-square' : 'square');
            }
            subItem.onClick(async () => {
              await handleBatchToggleDeckReference(deck, { allInDeck }, selectedCardIds);
            });
          });
        });
      }
    );

    if (premiumGuard.shouldShowFeatureEntry(PREMIUM_FEATURES.QUESTION_BANK)) {
      const questionBankLocked = premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.QUESTION_BANK);
      addMenuSubmenuGroup(
        menu,
        {
          title: questionBankLocked
            ? t('cardManagement.batchDeckMenu.questionBankDecksPremium')
            : t('cardManagement.batchDeckMenu.questionBankDecks'),
          icon: 'clipboard-list',
        },
        (submenu) => {
          if (questionBankLocked) {
            submenu.addItem((subItem) => {
              subItem
                .setTitle(t('cardManagement.batchDeckMenu.activateToUse'))
                .setIcon('lock')
                .onClick(() => {
                  promptPremiumFeature(PREMIUM_FEATURES.QUESTION_BANK);
                });
            });
            return;
          }

          if (questionBankStorage && plugin.questionBankService) {
            const banks = plugin.questionBankService.getAllQuestionBanks();
            if (banks.length > 0) {
              banks.forEach((bank) => {
                submenu.addItem((subItem) => {
                  subItem.setTitle(bank.name).setIcon('edit-3');
                  subItem.onClick(async () => {
                    await handleBatchAddToExamDeck(bank.id, selectedCardIds);
                  });
                });
              });
            } else {
              submenu.addItem((subItem) => {
                subItem.setTitle(t('cardManagement.batchDeckMenu.noQuestionBanks')).setDisabled(true);
              });
            }
          } else {
            submenu.addItem((subItem) => {
              subItem.setTitle(t('cardManagement.notices.questionBankServiceInitMissing')).setDisabled(true);
            });
          }
        }
      );
    }

    menu.showAtPosition(lastBatchDeckMenuPosition!);
  }

  // 批量将选择题卡片添加到考试牌组
  async function handleBatchAddToExamDeck(bankId: string, selectedCardIds: string[]) {
    try {
      if (premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.QUESTION_BANK)) {
        promptPremiumFeature(PREMIUM_FEATURES.QUESTION_BANK);
        return;
      }

      if (!plugin.questionBankService) {
        showNotification(t('cardManagement.notices.questionBankServiceInitMissing'), 'error');
        return;
      }

      // 从选中的卡片中筛选出可加入考试牌组的题型
      const sourceCards = currentSourceCards;
      const selectedCardData = sourceCards.filter(c => selectedCardIds.includes(c.uuid));
      const supportedQuestionCards = selectedCardData.filter(c => {
        const questionType = detectCardQuestionType(c);
        return questionType === 'single-choice'
          || questionType === 'multiple-choice'
          || isInputClozeQuestionContent(c.content);
      });
      const skippedUnsupportedCount = selectedCardData.length - supportedQuestionCards.length;

      if (supportedQuestionCards.length === 0) {
        showNotification(t('cardManagement.notices.noSupportedQuestionsForBank'), 'warning');
        return;
      }

      // 获取考试牌组信息
      const bank = plugin.questionBankService.getQuestionBank(bankId);
      if (!bank) {
        showNotification(t('cardManagement.notices.questionBankMissing'), 'error');
        return;
      }

      // 将支持的题目卡片 UUID 引用添加到考试牌组
      const existingUUIDs = new Set(bank.cardUUIDs || []);
      let addedCount = 0;
      let skippedExistingCount = 0;
      for (const card of supportedQuestionCards) {
        if (!existingUUIDs.has(card.uuid)) {
          existingUUIDs.add(card.uuid);
          addedCount++;
        } else {
          skippedExistingCount++;
        }
      }

      if (addedCount === 0) {
        showNotification(t('cardManagement.notices.allQuestionsAlreadyInBank'), 'info');
        return;
      }

      bank.cardUUIDs = Array.from(existingUUIDs);
      bank.modified = new Date().toISOString();
      await questionBankStorage!.saveBanks(plugin.questionBankService.getAllQuestionBanks());

      const summaryParts = [`已将 ${addedCount} 题加入考试题组"${bank.name}"`];
      if (skippedUnsupportedCount > 0) {
        summaryParts.push(`跳过 ${skippedUnsupportedCount} 张不支持的卡片`);
      }
      if (skippedExistingCount > 0) {
        summaryParts.push(`跳过 ${skippedExistingCount} 张已存在题目`);
      }
      showNotification(summaryParts.join('，'), 'success');
    } catch (error) {
      logger.error('添加到考试牌组失败:', error);
      showNotification(t('cardManagement.notices.operationFailed'), 'error');
    }
  }

  function showBatchDeckMultiSelectMenu(selectedCardIds: string[]) {
    if (!lastBatchDeckMenuPosition) {
      lastBatchDeckMenuPosition = { x: window.innerWidth / 2, y: window.innerHeight - 100 };
    }

    const menu = new Menu();
    (menu as any).app = plugin.app;

    menu.addItem((item) => {
      item.setTitle(t('cardManagement.dialogs.setDeckForCards', { count: selectedCardIds.length }));
      item.setDisabled(true);
    });

    menu.addSeparator();

    const selectedSet = new Set(selectedCardIds);

    const memoryDecks = getDecksForDataSource('memory');
    memoryDecks.forEach((deck) => {
      const deckCardUUIDs = new Set(deck.cardUUIDs || []);

      let anyInDeck = false;
      let allInDeck = true;

      for (const uuid of selectedSet) {
        if (deckCardUUIDs.has(uuid)) {
          anyInDeck = true;
        } else {
          allInDeck = false;
        }
      }

      const indentLevel = deck.level || 0;
      const prefix = indentLevel > 0 ? '  '.repeat(indentLevel) + '└ ' : '';

      menu.addItem((item) => {
        item.setTitle(prefix + deck.name);

        if (allInDeck) {
          item.setIcon('check-square');
        } else {
          item.setIcon(anyInDeck ? 'minus-square' : 'square');
        }

        item.onClick(async () => {
          await handleBatchToggleDeckReference(deck, { allInDeck }, selectedCardIds);

          if (lastBatchDeckMenuPosition) {
            setTimeout(() => {
              showBatchDeckMultiSelectMenu(selectedCardIds);
            }, 0);
          }
        });
      });
    });

    menu.showAtPosition(lastBatchDeckMenuPosition);
  }

  async function handleBatchToggleDeckReference(
    deck: Deck,
    current: { allInDeck: boolean },
    cardUUIDs: string[]
  ) {
    const { uniqueSourceDeckIds } = getBatchMemoryDeckSelectionContext(cardUUIDs);
    if (uniqueSourceDeckIds.length !== 1) {
      showNotification(t('cardManagement.notices.batchDeckSameSourceRequired'), 'warning');
      return;
    }

    if (!dataStorage || typeof dataStorage.moveCardsToDeck !== 'function') {
      showNotification(t('cardManagement.notices.dataStorageMissing'), 'error');
      return;
    }

    let progress: GlobalOperationController | null = null;
    try {
      progress = createCardManagementGlobalOperation({
        title: current.allInDeck ? t('cardManagement.batchOps.removeDeckTitle') : t('cardManagement.batchOps.moveDeckTitle'),
        total: cardUUIDs.length,
        detail: current.allInDeck
          ? t('cardManagement.batchOps.moveToUngrouped', { count: cardUUIDs.length })
          : t('cardManagement.batchOps.moveToDeck', { count: cardUUIDs.length, name: deck.name }),
        navigationMessage: t('cardManagement.batchOps.moveDeckNavigation')
      });
      const targetDeckId = current.allInDeck ? WDECK_UNGROUPED_DECK_NAME : deck.id;
      const moveResult = await dataStorage.moveCardsToDeck(cardUUIDs, targetDeckId, {
        onProgress: (currentCount, totalCount, detail) => {
          progress?.update({
            status: 'running',
            current: Math.max(0, Math.min(totalCount, currentCount)),
            total: Math.max(1, totalCount),
            detail
          });
        }
      });

      progress.update({
        status: 'running',
        current: cardUUIDs.length,
        detail: t('cardManagement.batchOps.refreshingCards')
      });
      await loadCards();

      progress.finish({
        status: moveResult.failed.length > 0 ? 'error' : 'success',
        current: cardUUIDs.length,
        detail: moveResult.failed.length > 0
          ? t('cardManagement.batchOps.moveDeckSummary', { success: moveResult.moved.length, failed: moveResult.failed.length })
          : current.allInDeck
            ? t('cardManagement.batchOps.moveToUngroupedDone', { count: moveResult.moved.length })
            : t('cardManagement.batchOps.moveToDeckDone', { count: moveResult.moved.length, name: deck.name })
      });

      if (moveResult.failed.length > 0) {
        const successCount = moveResult.moved.length;
        const failedCount = moveResult.failed.length;
        showNotification(t('cardManagement.batchOps.moveDeckSummary', { success: successCount, failed: failedCount }), 'warning');
        logger.warn('[WeaveCardManagement] 批量更换牌组部分失败:', moveResult.failed);
      } else {
        showNotification(
          current.allInDeck ? t('cardManagement.batchOps.moveToUngroupedDone', { count: moveResult.moved.length }) : t('cardManagement.batchOps.moveToDeckDone', { count: moveResult.moved.length, name: deck.name }),
          "success"
        );
      }

      dataVersion++;
    } catch (error) {
        progress?.finish({
          status: 'error',
          current: 0,
          detail: error instanceof Error ? error.message : t('cardManagement.batchOps.moveDeckFailed')
        }, 2500);
        logger.error('[WeaveCardManagement] 批量更换牌组失败:', error);
        showNotification(t('cardManagement.batchOps.moveDeckFailed'), 'error');
    }
  }

  function handleBatchCopy() {
    const selectedCardIds = Array.from(selectedCards);
    logger.debug("批量复制:", selectedCardIds);

    if (selectedCardIds.length === 0) {
      new Notice(t('cardManagement.notices.copySelectCardsFirst'));
      return;
    }

    // 获取选中的卡片数据
    const selectedCardData = filteredCards.filter(card => selectedCardIds.includes(card.uuid));

    // 创建复制的文本内容
    const copyText = selectedCardData.map(card => {
      const primaryDeckId =
        dataSource === "memory"
          ? getMemoryFormalDeckId(card, currentDataSourceDecks)
          : getCardDeckIds(card, currentDataSourceDecks).primaryDeckId || card.deckId;
      const deck = currentDataSourceDecks.find(d => d.id === primaryDeckId);
      return `正面: ${getCardContentBySide(card, 'front', [])}
背面: ${getCardContentBySide(card, 'back', [])}
标签: ${card.tags?.join(', ') || '无'}
牌组: ${deck?.name || '默认'}
---`;
    }).join('\n');

    // 复制到剪贴板
    void writeSystemClipboardText(copyText).then((copied) => {
      if (copied) {
        new Notice(t('cardManagement.notices.copyClipboardSuccess', { count: selectedCardIds.length }));
        return;
      }
      new Notice(t('cardManagement.notices.copyClipboardFailed'));
    });
  }

  function handleBatchExportSummaryMd() {
    const selectedCardIds = Array.from(selectedCards);
    if (selectedCardIds.length === 0) {
      new Notice(t('cardManagement.batchToolbar.exportNoCards'));
      return;
    }

    const cardsToExport = collectSelectedBatchCards(selectedCardIds);
    if (cardsToExport.length === 0) {
      new Notice(t('cardManagement.batchToolbar.exportNoCards'));
      return;
    }

    showExportFolderPicker('single', 'md', cardsToExport);
  }

  // 导出笔记（MD + CSV，支持多种分组方式）
  type ExportFormat = 'md' | 'csv';
  type ExportMode = 'single' | 'bySource' | 'byMonth' | 'byDeck';

  // 显示文件夹选择器
  function showExportFolderPicker(mode: ExportMode, format: ExportFormat, cardsToExport: Card[]) {
    const allFolders: string[] = [''];
    function collectFolders(folder: TFolder) {
      if (folder.path) allFolders.push(folder.path);
      for (const child of folder.children) {
        if (child instanceof TFolder) collectFolders(child);
      }
    }
    collectFolders(plugin.app.vault.getRoot());
    allFolders.sort((a, b) => a.localeCompare(b, 'zh-CN'));

    const modal = new ExportFolderPickerModal(plugin.app, allFolders, (item) => executeExport(mode, format, cardsToExport, item));
    modal.setPlaceholder(t('cardManagement.batchToolbar.exportSelectFolder'));
    modal.open();
  }

  // 执行导出（统一入口）
  async function executeExport(mode: ExportMode, format: ExportFormat, cardsToExport: Card[], folderPath: string) {
    try {
      if (format === 'csv') {
        await executeCSVExport(mode, cardsToExport, folderPath);
      } else {
        await executeMDExport(mode, cardsToExport, folderPath);
      }
    } catch (error: any) {
      logger.error('导出失败:', error);
      new Notice(t('cardManagement.batchToolbar.exportFailed').replace('{error}', error.message || String(error)));
    }
  }

  // MD 导出（含分组）
  async function executeMDExport(mode: ExportMode, cardsToExport: Card[], folderPath: string) {
    if (mode === 'single') {
      await exportAsSingleFile(cardsToExport, folderPath);
    } else {
      const groups = getExportGroups(mode, cardsToExport);
      await exportGroupedMD(groups, folderPath);
    }
  }

  // CSV 导出（含分组）
  async function executeCSVExport(mode: ExportMode, cardsToExport: Card[], folderPath: string) {
    if (mode === 'single') {
      const timestamp = new Date().toISOString().slice(0, 10);
      const fileName = `Weave Export ${timestamp}.csv`;
      const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
      const csvContent = cardsToCSV(cardsToExport, currentDataSourceDecks);
      const finalPath = await getUniqueFilePath(filePath);
      await plugin.app.vault.create(finalPath, csvContent);
      new Notice(t('cardManagement.batchToolbar.exportSuccess').replace('{count}', String(cardsToExport.length)).replace('{path}', finalPath));
    } else {
      const groups = getExportGroups(mode, cardsToExport);
      let totalExported = 0;
      let fileCount = 0;
      for (const [groupKey, groupCards] of groups) {
        const baseName = sanitizeFileName(groupKey === '__no_source__' || groupKey === '__no_deck__' || groupKey === '__unknown__'
          ? `Weave Export - Ungrouped`
          : `Weave Export - ${groupKey}`);
        const filePath = folderPath ? `${folderPath}/${baseName}.csv` : `${baseName}.csv`;
        const csvContent = cardsToCSV(groupCards, currentDataSourceDecks);
        const finalPath = await getUniqueFilePath(filePath);
        await plugin.app.vault.create(finalPath, csvContent);
        totalExported += groupCards.length;
        fileCount++;
      }
      new Notice(t('cardManagement.batchToolbar.exportSuccessMultiple').replace('{count}', String(totalExported)).replace('{fileCount}', String(fileCount)));
    }
  }

  // 获取分组结果
  function getExportGroups(mode: ExportMode, cardsToExport: Card[]): Map<string, Card[]> {
    switch (mode) {
      case 'bySource': return groupCardsBySource(cardsToExport);
      case 'byMonth': return groupCardsByMonth(cardsToExport);
      case 'byDeck': return groupCardsByDeck(cardsToExport, currentDataSourceDecks);
      default: {
        const m = new Map<string, Card[]>();
        m.set('all', cardsToExport);
        return m;
      }
    }
  }

  // MD 分组导出
  async function exportGroupedMD(groups: Map<string, Card[]>, folderPath: string) {
    let totalExported = 0;
    let fileCount = 0;
    for (const [groupKey, groupCards] of groups) {
      const baseName = sanitizeFileName(groupKey === '__no_source__' || groupKey === '__no_deck__' || groupKey === '__unknown__'
        ? 'Weave Export - Ungrouped'
        : `Weave Export - ${groupKey}`);
      const filePath = folderPath ? `${folderPath}/${baseName}.md` : `${baseName}.md`;
      const sections = groupCards.map(card => formatCardForExport(card));
      const content = sections.join('\n\n---\n\n') + '\n';
      const finalPath = await getUniqueFilePath(filePath);
      await plugin.app.vault.create(finalPath, content);
      totalExported += groupCards.length;
      fileCount++;
    }
    new Notice(
      t('cardManagement.batchToolbar.exportSuccessMultiple')
        .replace('{count}', String(totalExported))
        .replace('{fileCount}', String(fileCount))
    );
  }

  // 获取卡片的来源链接文本
  function getCardSourceLink(card: Card): string {
    // 优先从content YAML获取来源信息
    const sourceInfo = parseSourceInfo(card.content || '');
    if (sourceInfo.sourceFile) {
      const docName = sourceInfo.sourceFile.replace(/\.md$/, '');
      if (sourceInfo.sourceBlock) {
        return `[[${docName}#^${sourceInfo.sourceBlock}]]`;
      }
      return `[[${docName}]]`;
    }
    // 回退到卡片的sourceFile字段
    if (card.sourceFile) {
      const docName = card.sourceFile.replace(/\.md$/, '');
      if (card.sourceBlock) {
        return `[[${docName}#^${card.sourceBlock}]]`;
      }
      return `[[${docName}]]`;
    }
    return '';
  }

  // 获取卡片的来源文档标识（用于分组）
  function getCardSourceKey(card: Card): string {
    const sourceInfo = parseSourceInfo(card.content || '');
    if (sourceInfo.sourceFile) {
      return sourceInfo.sourceFile;
    }
    if (card.sourceFile) {
      return card.sourceFile;
    }
    return '__no_source__';
  }

  // 格式化单张卡片为MD内容
  function formatCardForExport(card: Card): string {
    let bodyContent = extractBodyContent(card.content || '').trim();

    // 将内部分隔符 ---div--- 替换为标准 Markdown 水平线
    bodyContent = bodyContent.replace(/^\s*---div---\s*$/gm, '---');

    const sourceLink = getCardSourceLink(card);

    let result = bodyContent;
    // 仅当来源是有效的 wikilink 时才添加 Source 行（排除内部ID）
    if (sourceLink && sourceLink.includes('[[')) {
      result += `\n\n> Source: ${sourceLink}`;
    }
    return result;
  }

  // 导出为单个文件
  async function exportAsSingleFile(cardsToExport: Card[], folderPath: string) {
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `Weave Export ${timestamp}.md`;
    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;

    const sections: string[] = [];
    for (const card of cardsToExport) {
      sections.push(formatCardForExport(card));
    }

    const content = sections.join('\n\n---\n\n') + '\n';

    // 检查文件是否已存在，若存在则加数字后缀
    const finalPath = await getUniqueFilePath(filePath);
    await plugin.app.vault.create(finalPath, content);

    new Notice(
      t('cardManagement.batchToolbar.exportSuccess')
        .replace('{count}', String(cardsToExport.length))
        .replace('{path}', finalPath)
    );
  }

  // 按来源文档分别导出
  async function exportBySource(cardsToExport: Card[], folderPath: string) {
    // 按来源文档分组（保持排序顺序）
    const groups = new Map<string, Card[]>();
    for (const card of cardsToExport) {
      const key = getCardSourceKey(card);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(card);
    }

    let totalExported = 0;
    let fileCount = 0;

    for (const [sourceKey, groupCards] of groups) {
      // 生成文件名
      let baseName: string;
      if (sourceKey === '__no_source__') {
        baseName = 'Weave Export - No Source';
      } else {
        baseName = `Weave Export - ${sourceKey.replace(/\.md$/, '').replace(/[\\/:*?"<>|]/g, '_')}`;
      }
      const fileName = `${baseName}.md`;
      const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;

      const sections: string[] = [];
      for (const card of groupCards) {
        sections.push(formatCardForExport(card));
      }

      const content = sections.join('\n\n---\n\n') + '\n';

      const finalPath = await getUniqueFilePath(filePath);
      await plugin.app.vault.create(finalPath, content);

      totalExported += groupCards.length;
      fileCount++;
    }

    new Notice(
      t('cardManagement.batchToolbar.exportSuccessMultiple')
        .replace('{count}', String(totalExported))
        .replace('{fileCount}', String(fileCount))
    );
  }

  // 获取唯一文件路径（避免覆盖已有文件，支持 .md 和 .csv）
  async function getUniqueFilePath(filePath: string): Promise<string> {
    const extMatch = filePath.match(/\.(md|csv)$/);
    const ext = extMatch ? extMatch[0] : '.md';
    const basePath = filePath.replace(/\.(md|csv)$/, '');
    let candidate = filePath;
    let counter = 1;
    while (plugin.app.vault.getAbstractFileByPath(candidate)) {
      candidate = `${basePath} ${counter}${ext}`;
      counter++;
    }
    return candidate;
  }

  type CardToMarkdownMode = 'create' | 'append';

  interface CardToMarkdownOptions {
    mode: CardToMarkdownMode;
    folderPath: string;
    fileName: string;
    targetFilePath: string;
    deleteOriginal: boolean;
  }

  function closeCardToMarkdownModal() {
    showCardToMarkdownModal = false;
    cardToMarkdown = null;
  }

  function openCardToMarkdownModal(card: Card) {
    cardToMarkdown = card;
    showCardToMarkdownModal = true;
  }

  function getCardMarkdownTitle(card: Card): string {
    const body = extractBodyContent(card.content || '').trim();
    const frontPart = (body.split(MAIN_SEPARATOR)[0] || body).trim();
    const lines = frontPart
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const cleaned = line.replace(/^#{1,6}\s+/, '').replace(/^>\s*/, '').trim();
      if (!cleaned) continue;
      if (/^---+$/.test(cleaned)) continue;
      if (/^[A-Za-z_][\w-]*\s*:\s*/.test(cleaned)) continue;
      if (/^-\s+/.test(cleaned)) continue;
      return cleaned;
    }

    return `Weave Card ${card.uuid.slice(0, 8)}`;
  }

  function buildCardMarkdownNote(card: Card, mode: CardToMarkdownMode): string {
    const body = formatCardForExport(card).trim();
    const rawBody = extractBodyContent(card.content || '')
      .trim()
      .replace(/^\s*---div---\s*$/gm, '---');
    const yaml = parseYAMLFromContent(card.content || '');
    const hasYaml = Object.keys(yaml).length > 0;

    if (!body) {
      return hasYaml && mode === 'create'
        ? `${buildContentWithYAML(yaml, '')}\n`
        : `${mode === 'append' ? '##' : '#'} ${getCardMarkdownTitle(card)}\n`;
    }

    if (mode === 'create' && hasYaml) {
      return `${buildContentWithYAML(yaml, rawBody).trim()}\n`;
    }

    const hasHeading = /^\s{0,3}#\s+/.test(body);
    if (mode === 'create') {
      const headingPrefix = hasHeading ? '' : `# ${getCardMarkdownTitle(card)}\n\n`;
      return `${headingPrefix}${body}\n`;
    }

    const headingPrefix = hasHeading ? '' : `## ${getCardMarkdownTitle(card)}\n\n`;
    return `${headingPrefix}${body}\n`;
  }

  function appendMarkdownToFile(existingContent: string, nextBlock: string): string {
    const trimmedExisting = existingContent.trimEnd();
    const trimmedBlock = nextBlock.trim();

    if (!trimmedExisting) {
      return `${trimmedBlock}\n`;
    }

    return `${trimmedExisting}\n\n---\n\n${trimmedBlock}\n`;
  }

  async function ensureFolderPathExists(folderPath: string): Promise<void> {
    const normalizedFolderPath = normalizePath(folderPath || '');
    if (!normalizedFolderPath) return;

    const parts = normalizedFolderPath.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!plugin.app.vault.getAbstractFileByPath(currentPath)) {
        await plugin.app.vault.createFolder(currentPath);
      }
    }
  }

  async function handleCardToMarkdownConfirm(options: CardToMarkdownOptions) {
    if (!cardToMarkdown) {
      return;
    }

    const sourceCard = cardToMarkdown;
    isConvertingCardToMarkdown = true;

    try {
      const markdownContent = buildCardMarkdownNote(sourceCard, options.mode);
      let targetPath = '';

      if (options.mode === 'create') {
        const rawName = options.fileName.trim().replace(/\.md$/i, '');
        const safeName = sanitizeFileName(rawName).trim();
        if (!safeName) {
          throw new Error(t('cardManagement.notices.validFileNameRequired'));
        }

        const normalizedFileName = `${safeName}.md`;
        const normalizedPath = normalizePath(
          options.folderPath ? `${options.folderPath}/${normalizedFileName}` : normalizedFileName
        );
        const lastSlashIndex = normalizedPath.lastIndexOf('/');
        const folder = lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : '';
        await ensureFolderPathExists(folder);

        targetPath = await getUniqueFilePath(normalizedPath);
        await plugin.app.vault.create(targetPath, markdownContent);
      } else {
        const normalizedTargetFilePath = normalizePath(options.targetFilePath || '');
        const targetFile = plugin.app.vault.getAbstractFileByPath(normalizedTargetFilePath);

        if (!(targetFile instanceof TFile) || targetFile.extension !== 'md') {
          throw new Error(t('cardManagement.notices.existingMarkdownRequired'));
        }

        const currentContent = await plugin.app.vault.read(targetFile);
        await plugin.app.vault.modify(targetFile, appendMarkdownToFile(currentContent, markdownContent));
        targetPath = targetFile.path;
      }

      let deleteFailed = false;
      if (options.deleteOriginal) {
        try {
          await deleteCardCore(sourceCard.uuid);
        } catch (error) {
          deleteFailed = true;
          logger.error('[WeaveCardManagement] 转换为 Markdown 后删除卡片失败:', error);
        }
      }

      closeCardToMarkdownModal();

      const saveMessage = options.mode === 'append'
        ? t('cardManagement.notices.appendedToPath', { path: targetPath })
        : t('cardManagement.notices.savedToPath', { path: targetPath });

      if (deleteFailed) {
        showNotification(t('cardManagement.notices.savedButDeleteOriginalFailed', { pathMessage: saveMessage }), 'warning');
      } else if (options.deleteOriginal) {
        showNotification(t('cardManagement.notices.savedAndDeletedOriginal', { pathMessage: saveMessage }), 'success');
      } else {
        showNotification(saveMessage, 'success');
      }
    } catch (error: any) {
      logger.error('[WeaveCardManagement] 转换卡片为 Markdown 失败:', error);
      showNotification(error?.message || t('cardManagement.notices.convertToMarkdownFailed'), 'error');
    } finally {
      isConvertingCardToMarkdown = false;
    }
  }

  function getBatchTagMenuAnchorRect(event?: MouseEvent) {
    const anchorEl =
      event?.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : event?.target instanceof HTMLElement
          ? event.target
          : null;

    if (!anchorEl) {
      return undefined;
    }

    const rect = anchorEl.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }

  function getBatchTagComparisonKey(tag: string): string {
    return normalizeTagSuggestionValue(tag).toLowerCase();
  }

  function sortBatchTags(tags: string[]): string[] {
    return [...tags].sort((a, b) =>
      removeHashPrefix(a).localeCompare(removeHashPrefix(b), "zh-CN")
    );
  }

  function collectCanonicalBatchTags(tags: string[]): string[] {
    const tagByKey = new Map<string, string>();

    for (const rawTag of tags) {
      const trimmed = String(rawTag || "").trim();
      if (!trimmed) continue;

      const key = getBatchTagComparisonKey(trimmed);
      if (!key) continue;

      const existing = tagByKey.get(key);
      if (!existing || (!existing.startsWith("#") && trimmed.startsWith("#"))) {
        tagByKey.set(key, trimmed);
      }
    }

    return sortBatchTags(Array.from(tagByKey.values()));
  }

  function mergeBatchTags(currentTags: string[], tagsToAdd: string[]): string[] {
    return collectCanonicalBatchTags([...currentTags, ...tagsToAdd]);
  }

  function removeBatchTags(currentTags: string[], tagsToRemove: string[]): string[] {
    const removeKeys = new Set(
      tagsToRemove
        .map((tag) => getBatchTagComparisonKey(tag))
        .filter(Boolean)
    );

    return collectCanonicalBatchTags(
      currentTags.filter((tag) => !removeKeys.has(getBatchTagComparisonKey(tag)))
    );
  }

  function formatBatchTagLabel(tag: string): string {
    return formatTagSuggestionLabel(tag);
  }

  function buildBatchTagCreateSuggestion(
    query: string,
    existingTagKeys: Set<string>
  ): BatchTagSuggestItem | null {
    const normalized = normalizeTagSuggestionValue(query);
    if (!normalized) {
      return null;
    }

    const key = normalized.toLowerCase();
    if (existingTagKeys.has(key)) {
      return null;
    }

    const label = formatTagSuggestionLabel(normalized);
    return {
      key,
      tag: normalized,
      label: t('cardManagement.tagMenu.createTagLabel', { label }),
      count: 0,
      keywords: [normalized, label, t('cardManagement.tagMenu.create')],
      searchText: [normalized, label, t('cardManagement.tagMenu.create')]
        .map((value) => value.toLowerCase())
        .join(' '),
      isCreateSuggestion: true,
    };
  }

  function getCardBatchTags(card: Card): string[] {
    return collectCanonicalBatchTags(
      getCardTagValues(
        card,
        dataSource === "incremental-reading"
          ? "incremental-reading"
          : dataSource === "questionBank"
            ? "questionBank"
            : "memory"
      )
    );
  }

  function collectSelectedBatchCards(selectedCardIds: string[]): Card[] {
    const selectedIdSet = new Set(selectedCardIds);
    return currentSourceCards.filter((card) => selectedIdSet.has(card.uuid));
  }

  function getMemoryFormalDeckId(card: Card, memoryDecks: Deck[]): string {
    const { primaryDeckId } = getCardDeckIdsFromFormalSource(card, memoryDecks);
    return primaryDeckId || WDECK_UNGROUPED_DECK_NAME;
  }

  function getDeckIdsForDataSource(card: Card, decks: Deck[], source: string): string[] {
    if (source === "memory") {
      return getCardDeckIdsFromFormalSource(card, decks).deckIds;
    }

    return getCardDeckIds(card, decks).deckIds;
  }

  function getPrimaryDeckIdForDataSource(card: Card, decks: Deck[], source: string): string | undefined {
    if (source === "memory") {
      const { primaryDeckId } = getCardDeckIdsFromFormalSource(card, decks);
      return primaryDeckId;
    }

    return getCardDeckIds(card, decks).primaryDeckId || card.deckId;
  }

  function getBatchMemorySourceDeckId(card: Card, memoryDecks: Deck[]): string {
    return getMemoryFormalDeckId(card, memoryDecks);
  }

  function getBatchMemoryDeckSelectionContext(selectedCardIds: string[]) {
    const memoryDecks = getDecksForDataSource('memory');
    const selectedCardData = collectSelectedBatchCards(selectedCardIds);
    const uniqueSourceDeckIds = Array.from(
      new Set(selectedCardData.map((card) => getBatchMemorySourceDeckId(card, memoryDecks)))
    );

    return {
      memoryDecks,
      selectedCardData,
      uniqueSourceDeckIds,
    };
  }

  function collectBatchTagStats(cardsForTags: Card[]): Array<{ tag: string; count: number }> {
    const tagCounts = new Map<string, number>();

    cardsForTags.forEach((card) => {
      getCardBatchTags(card).forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          removeHashPrefix(a.tag).localeCompare(removeHashPrefix(b.tag), "zh-CN")
      );
  }

  const BATCH_REMOVE_ALL_TAG = "__weave_remove_all_tags__";

  function openBatchAddTagsMenu(selectedCardIds: string[], event?: MouseEvent) {
    const selectedCardData = collectSelectedBatchCards(selectedCardIds);
    const existingTagKeys = new Set<string>();

    selectedCardData.forEach((card) => {
      getCardBatchTags(card).forEach((tag) => {
        existingTagKeys.add(getBatchTagComparisonKey(tag));
      });
    });

    const tagItems: BatchTagSuggestItem[] = normalizeTagSuggestionOptions(availableTags)
      .filter((item) => !existingTagKeys.has(item.key));

    if (tagItems.length === 0) {
      const placeholderItem = buildBatchTagCreateSuggestion(t('cardManagement.tagMenu.newTag'), existingTagKeys);
      if (!placeholderItem) {
        new Notice(t('cardManagement.tagMenu.noTagsToAdd'));
        return;
      }
    }

    new BatchTagSuggestModal(
      plugin.app,
      tagItems,
      (item) => {
        void handleBatchAddTags([item.tag]);
      },
      {
        placeholder: t('cardManagement.tagMenu.searchTagsToAdd', { count: selectedCardIds.length }),
        anchorRect: getBatchTagMenuAnchorRect(event),
        createSuggestion: (query) => buildBatchTagCreateSuggestion(query, existingTagKeys),
      }
    ).open();
  }

  function openBatchRemoveTagsMenu(selectedCardIds: string[], event?: MouseEvent) {
    const selectedCardData = collectSelectedBatchCards(selectedCardIds);
    const sortedTags = collectBatchTagStats(selectedCardData);

    if (sortedTags.length === 0) {
      new Notice(t('cardManagement.tagMenu.selectedCardsHaveNoTags'));
      return;
    }

    const allTags = sortedTags.map(({ tag }) => tag);
    const tagItems: BatchTagSuggestItem[] = [
      ...(sortedTags.length > 1
        ? [{
            key: BATCH_REMOVE_ALL_TAG,
            tag: BATCH_REMOVE_ALL_TAG,
            label: t('cardManagement.tagMenu.removeAllTags', { count: sortedTags.length }),
            keywords: [t('cardManagement.tagMenu.all'), t('cardManagement.tagMenu.removeAll')],
            count: 0,
            searchText: [t('cardManagement.tagMenu.all'), t('cardManagement.tagMenu.removeAll'), t('cardManagement.tagMenu.removeAllTags', { count: sortedTags.length })]
              .map((value) => value.toLowerCase())
              .join(' '),
          }]
        : []),
      ...sortedTags.map(({ tag, count }) => ({
        key: getBatchTagComparisonKey(tag),
        tag,
        label: formatBatchTagLabel(tag),
        count,
        keywords: [tag, formatBatchTagLabel(tag)],
        searchText: [tag, formatBatchTagLabel(tag)]
          .map((value) => value.toLowerCase())
          .join(' '),
      })),
    ];

    new BatchTagSuggestModal(
      plugin.app,
      tagItems,
      (item) => {
        if (item.tag === BATCH_REMOVE_ALL_TAG) {
          void handleBatchRemoveTagsConfirm(allTags);
          return;
        }
        void handleBatchRemoveTagsConfirm([item.tag]);
      },
      {
        placeholder: t('cardManagement.tagMenu.searchTagsToRemove', { count: selectedCardIds.length }),
        anchorRect: getBatchTagMenuAnchorRect(event),
      }
    ).open();
  }

  function handleBatchAddTagsMenu(event?: MouseEvent) {
    const selectedCardIds = Array.from(selectedCards);
    if (selectedCardIds.length === 0) {
      new Notice(t('cardManagement.notices.batchSelectCardsFirst'));
      return;
    }
    openBatchAddTagsMenu(selectedCardIds, event);
  }

  function handleBatchRemoveTagsMenu(event?: MouseEvent) {
    const selectedCardIds = Array.from(selectedCards);
    if (selectedCardIds.length === 0) {
      new Notice(t('cardManagement.notices.batchSelectCardsFirst'));
      return;
    }
    openBatchRemoveTagsMenu(selectedCardIds, event);
  }

  // v2.0 组建牌组
  function handleBuildDeck() {
    const selectedCardIds = Array.from(selectedCards);
    logger.debug("组建牌组:", selectedCardIds);

    if (selectedCardIds.length === 0) {
      new Notice(t('cardManagement.notices.buildDeckSelectCardsFirst'));
      return;
    }

    // 打开组建牌组模态窗
    showBuildDeckModal = true;
  }


  // v2.0 组建牌组完成回调
  function handleBuildDeckCreated(deck: Deck) {
    logger.info("牌组创建成功:", deck.name);
    // 清除选择
    selectedCards = new Set();
    // 刷新数据
    loadCards();
  }

  async function handleBatchDelete() {
    const selectedCardIds = Array.from(selectedCards);
    logger.debug("批量删除:", selectedCardIds, "数据源:", dataSource);

    if (selectedCardIds.length === 0) {
      new Notice(t('cardManagement.notices.batchDeleteSelectCardsFirst'));
      return;
    }

    // 使用 Obsidian Modal 代替 confirm()，避免焦点劫持问题
    const modal = new Modal(plugin.app);
    modal.titleEl.setText(t('cardManagement.dialogs.confirmDeleteTitle'));
    modal.contentEl.setText(
      t('cardManagement.dialogs.confirmDeleteMessage', { count: selectedCardIds.length })
    );
    
    const buttonContainer = modal.contentEl.createDiv({ cls: 'confirm-buttons' });
    applyStyleProps(buttonContainer, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '16px'
    });
    
    let shouldDelete = false;
    
    const cancelButton = buttonContainer.createEl('button', { text: t('cardManagement.dialogs.cancel') });
    cancelButton.onclick = () => modal.close();
    
    const deleteButton = buttonContainer.createEl('button', { 
      text: t('cardManagement.dialogs.confirmDelete'),
      cls: 'mod-warning'
    });
    deleteButton.onclick = () => {
      shouldDelete = true;
      modal.close();
    };
    modal.onClose = async () => {
      if (!shouldDelete) return;

      const progress = createCardManagementGlobalOperation({
        title: t('cardManagement.batchOps.deleteCardsTitle'),
        total: selectedCardIds.length,
        detail: t('cardManagement.batchOps.deleteCardsPrepare', { count: selectedCardIds.length }),
        navigationMessage: t('cardManagement.batchOps.deleteCardsNavigation')
      });

      let ok = 0;
      let fail = 0;

      try {
        if (dataSource === 'incremental-reading') {
          logger.debug("使用IR统一写入口删除阅读点");

          const cardsToDelete = selectedCardIds
            .map((id) => irContentCards.find((card) => card.uuid === id))
            .filter((card): card is Card => Boolean(card));

          const missingCount = selectedCardIds.length - cardsToDelete.length;
          fail += missingCount;
          if (missingCount > 0) {
            progress.update({
              status: 'running',
              current: missingCount,
              detail: t('cardManagement.batchOps.skippedMissingReadingDelete', { count: missingCount })
            });
          }

          const result = await deleteIncrementalReadingCards(cardsToDelete, (current) => {
            const processed = Math.min(selectedCardIds.length, missingCount + current);
            progress.update({
              status: 'running',
              current: processed,
              detail: t('cardManagement.batchOps.deletingReadingPoint', { current: processed, total: selectedCardIds.length })
            });
          });
          ok += result.ok;
          fail += result.fail;

          progress.update({
            status: 'running',
            current: selectedCardIds.length,
            detail: t('cardManagement.batchOps.refreshingReadingList')
          });
          await recomputeAndBroadcastIRData(plugin.app, 'remove_block');
          await loadIRContentCards({ silent: true });
        } else if (dataSource === 'questionBank') {
          logger.debug("使用题库存储删除卡片");

          if (!questionBankStorage) {
            throw new Error(t('cardManagement.notices.questionBankStorageMissing'));
          }
          if (!plugin.questionBankService) {
            throw new Error(t('cardManagement.notices.questionBankServiceMissing'));
          }

          const cardsByBank = new Map<string, Card[]>();
          for (const id of selectedCardIds) {
            const card = questionBankCards.find(c => c.uuid === id);
            if (!card) {
              logger.warn(`未找到题库卡片: ${id}`);
              fail++;
              continue;
            }

            const { primaryDeckId } = getCardDeckIds(card, questionBankDecks);
            const bankId = primaryDeckId || card.deckId || '';
            if (!cardsByBank.has(bankId)) {
              cardsByBank.set(bankId, []);
            }
            cardsByBank.get(bankId)!.push(card);
          }

          let processed = fail;
          if (processed > 0) {
            progress.update({
              status: 'running',
              current: processed,
              detail: t('cardManagement.batchOps.skippedMissingQuestionDelete', { count: processed })
            });
          }

          for (const [bankId, cardsToDelete] of cardsByBank) {
            for (const c of cardsToDelete) {
              try {
                await plugin.questionBankService.deleteQuestion(bankId, c.uuid);
                ok++;
              } catch (error) {
                logger.error(`删除题库 ${bankId} 中的卡片失败:`, error);
                fail++;
              } finally {
                processed++;
                progress.update({
                  status: 'running',
                  current: processed,
                  detail: t('cardManagement.batchOps.deletingQuestionCard', { current: processed, total: selectedCardIds.length })
                });
              }
            }
          }

          progress.update({
            status: 'running',
            current: selectedCardIds.length,
            detail: t('cardManagement.batchOps.refreshingQuestionBank')
          });
          await loadQuestionBankCards();
        } else {
          logger.debug("使用记忆存储删除卡片");

          progress.update({
            status: 'running',
            detail: t('cardManagement.batchOps.deletingCards', { count: selectedCardIds.length })
          });
          const batchResult = await deleteMemoryCardsCommand(plugin, selectedCardIds);
          ok = batchResult.deleted.length;
          fail = batchResult.failed.length;
          logger.info(`[CardMgmt] 批量删除: 成功${ok}, 失败${fail}`);

          progress.update({
            status: 'running',
            current: selectedCardIds.length,
            detail: t('cardManagement.batchOps.refreshingCards')
          });
          await loadCards();
        }

        progress.finish({
          status: fail > 0 ? 'error' : 'success',
          current: selectedCardIds.length,
          detail: fail > 0
            ? t('cardManagement.batchOps.deleteCardsSummary', { success: ok, failed: fail })
            : t('cardManagement.batchOps.deleteCardsSuccess', { count: ok })
        });

        new Notice(t('cardManagement.batchOps.deleteCardsNotice', {
          success: ok,
          failedPart: fail ? t('cardManagement.batchOps.failedPart', { count: fail }) : ''
        }));
        plugin.app.workspace.trigger('Weave:data-changed');
        handleClearSelection();
      } catch (error) {
        logger.error('[WeaveCardManagement] 批量删除失败:', error);
        progress.finish({
          status: 'error',
          current: Math.min(progress.total, ok + fail),
          detail: error instanceof Error ? error.message : t('cardManagement.batchOps.deleteCardsFailed')
        }, 2500);

        if (dataSource === 'questionBank') {
          await loadQuestionBankCards();
        } else if (dataSource === 'incremental-reading') {
          await loadIRContentCards({ silent: true });
        } else {
          await loadCards();
        }

        showNotification(t('cardManagement.batchOps.deleteCardsRetry'), 'error');
      }
    };
    
    modal.open();
  }



  // 加载考试牌组卡片数据
  async function loadQuestionBankCards(): Promise<void> {
    if (!questionBankStorage) {
      logger.error('[QuestionBank] Storage未初始化');
      return;
    }
    
    isLoadingQuestionBank = true;
    
    try {
      // 1. 加载所有题库牌组
      const banks = await questionBankStorage.loadBanks();
      logger.debug(`[QuestionBank] 加载了${banks.length}个题库`);
      questionBankDecks = banks;
      
      // 2. 加载所有题库的题目（真实数据源）
      const allQuestionsMap = new Map<string, Card>();
      for (const bank of banks) {
        const questions = plugin.questionBankService
          ? await plugin.questionBankService.getQuestionsByBank(bank.id)
          : [];
        for (const question of questions) {
          allQuestionsMap.set(question.uuid, question);
        }
      }
      logger.debug(`[QuestionBank] 加载了${allQuestionsMap.size}张实际存在的题目`);

      const statsMap = new Map<string, QuestionTestStats>();
      for (const q of allQuestionsMap.values()) {
        const testStats = q.stats?.testStats;
        if (testStats) {
          statsMap.set(q.uuid, testStats);
        }
      }

      // 3. 更新状态（只包含实际存在的题目）
      questionBankCards = Array.from(allQuestionsMap.values());
      questionBankStats = statsMap;
      contentCache.clear();
      invalidateCardManagementDerivedCaches();
      
      logger.debug(`[QuestionBank] 最终加载了${questionBankCards.length}张题目卡片`);
      showNotification(t('cardManagement.notices.loadQuestionBankSuccess', { count: questionBankCards.length }), 'success');
      
    } catch (error) {
      logger.error('[QuestionBank] 加载失败:', error);
      showNotification(t('cardManagement.notices.loadQuestionBankFailed'), 'error');
    } finally {
      isLoadingQuestionBank = false;
    }
  }
  
  // 统一数据源切换函数（供彩色圆点调用）
  async function switchDataSource(newSource: 'memory' | 'questionBank' | 'incremental-reading'): Promise<void> {
    newSource = normalizeVisibleCardDataSource(newSource);

    // 如果已经是当前数据源，不做处理
    if (dataSource === newSource) return;
    
    if (newSource === 'questionBank' && premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.QUESTION_BANK)) {
      promptFeatureId = PREMIUM_FEATURES.QUESTION_BANK;
      showActivationPrompt = true;
      return;
    }

    // 根据目标数据源加载数据
    if (newSource === 'questionBank' && questionBankCards.length === 0) {
      await loadQuestionBankCards();
    }
    
    dataSource = newSource;
    if (relationFilterAnchorCardUuid) {
      clearCardRelationFilterResult();
    }
    
    irTypeFilter = 'all';
    
    // 同步数据源到全局筛选状态服务
    plugin.filterStateService.updateFilter({ dataSource: newSource });
    
    // 使用统一的列可见性同步函数
    syncColumnVisibilityWithDataSource(newSource);
    await saveViewPreferences();
    if (showColumnManager) {
      refreshColumnManagerModal();
    }
    
    // 清空选中状态
    selectedCards.clear();
    
    // 显示切换提示
    const sourceNames: Record<string, string> = {
      'memory': t('cardManagement.dataSources.memory'),
      'questionBank': '考试牌组',
      'incremental-reading': '增量阅读'
    };
    showNotification(t('cardManagement.notices.switchDataSourceSuccess', { source: sourceNames[newSource] }), 'success');
  }
  
  // 加载增量阅读卡片，同时兼容旧版 blocks.json 与新版 chunks.json
  async function loadIRContentCards(options?: { silent?: boolean }): Promise<void> {
    if (isLoadingIR) return;
    
    isLoadingIR = true;
    try {
      // 初始化IR存储服务
      if (!irStorageService) {
        irStorageService = new IRStorageService(plugin.app);
        await irStorageService.initialize();
      }
      
      const irCardBuilderHelpers = {
        buildIRCardBase,
        resolveIRDeckId,
        resolveIRDeckIds,
        getIRDeckName,
        getIRReadingSeconds,
      };
      const loadResult = await loadIRCardManagementData({
        app: plugin.app,
        plugin,
        storage: irStorageService,
        helpers: irCardBuilderHelpers,
      });

      irBlocks = loadResult.irBlocks;
      irDecks = loadResult.irDecks;
      irExtractCardIds = loadResult.irExtractCardIds;
      irContentCards = loadResult.cards;
      invalidateCardManagementDerivedCaches();

      logger.debug(
        `[IR] 加载了 ${irContentCards.length} 个内容块 (旧版: ${loadResult.legacyCount}, 新版: ${loadResult.chunkCount}, PDF书签: ${loadResult.pdfTaskCount}, EPUB书签: ${loadResult.epubTaskCount})`
      );
      if (!options?.silent) {
        showNotification(t('cardManagement.notices.loadIRSuccess', { count: irContentCards.length }), 'success');
      }
      
    } catch (error) {
      logger.error('[IR] 加载失败:', error);
      showNotification(t('cardManagement.notices.loadIRFailed'), 'error');
    } finally {
      isLoadingIR = false;
      if (irReloadQueued) {
        irReloadQueued = false;
        queueIRContentReload({ silent: true, debounceMs: 0 });
      }
    }
  }

  // 增量阅读批量操作：更换专题
  async function handleIRBatchChangeDeck(event: MouseEvent): Promise<void> {
    const selectedIds = Array.from(selectedCards);
    if (selectedIds.length === 0) {
      showNotification(t('cardManagement.batchOps.selectReadingPointsFirst'), 'warning');
      return;
    }
    
    if (!irStorageService) {
      irStorageService = new IRStorageService(plugin.app);
      await irStorageService.initialize();
    }
    
    const validDecks = await irStorageService.getValidDeckList();
    const menu = new Menu();

    if (validDecks.length === 0) {
      menu.addItem((item) => {
        item.setTitle(t('cardManagement.batchOps.noTopicsAvailable'));
        item.setIcon('info');
        item.setDisabled(true);
      });
      menu.showAtMouseEvent(event);
      return;
    }

    menu.addItem((item) => {
      item.setTitle(t('cardManagement.batchOps.changeTopicMenuTitle', { count: selectedIds.length }));
      item.setDisabled(true);
    });
    menu.addSeparator();

    for (const deck of validDecks) {
      menu.addItem((item) => {
        item.setTitle(deck.name);
        item.setIcon('folder');
        item.onClick(async () => {
          const cardsToUpdate = selectedIds
            .map((id) => currentSourceCards.find((card) => card.uuid === id))
            .filter((card): card is Card => Boolean(card));

          const progress = createCardManagementGlobalOperation({
            title: t('cardManagement.batchOps.changeTopicTitle'),
            total: selectedIds.length,
            detail: t('cardManagement.batchOps.changeTopicDetail', { count: selectedIds.length, name: deck.name }),
            navigationMessage: t('cardManagement.batchOps.changeTopicNavigation')
          });

          try {
            let success = 0;
            let failed = selectedIds.length - cardsToUpdate.length;
            let processed = failed;

            if (processed > 0) {
              progress.update({
                status: 'running',
                current: processed,
                detail: t('cardManagement.batchOps.skippedMissingReadingPoints', { count: processed })
              });
            }

            for (const card of cardsToUpdate) {
              try {
                await updateIRCardManagementDecks(plugin.app, card, [deck.id]);
                success++;
              } catch (error) {
                logger.error(`[IR] 更换专题失败: ${card.uuid}`, error);
                failed++;
              } finally {
                processed++;
                progress.update({
                  status: 'running',
                  current: processed,
                  detail: t('cardManagement.batchOps.processingReadingPoints', { current: processed, total: selectedIds.length })
                });
              }
            }

            if (success > 0) {
              progress.update({
                status: 'running',
                current: selectedIds.length,
                detail: t('cardManagement.batchOps.refreshingReadingList')
              });
              await recomputeAndBroadcastIRData(plugin.app, 'ui_refresh', { deckIds: [deck.id] });
              await loadIRContentCards({ silent: true });
            }

            progress.finish({
              status: failed === 0 ? 'success' : 'error',
              current: selectedIds.length,
              detail: failed === 0
                ? t('cardManagement.batchOps.changeTopicSuccess', { count: success, name: deck.name })
                : t('cardManagement.batchOps.changeTopicSummary', { success, failed })
            });

            if (failed === 0) {
              showNotification(t('cardManagement.batchOps.changeTopicSuccess', { count: success, name: deck.name }), 'success');
            } else {
              showNotification(t('cardManagement.batchOps.changeTopicSummary', { success, failed }), 'warning');
            }
          } catch (error) {
            progress.finish({
              status: 'error',
              current: 0,
              detail: error instanceof Error ? error.message : t('cardManagement.batchOps.changeTopicFailed')
            }, 2500);
            logger.error('[IR] 批量更换专题失败:', error);
            showNotification(t('cardManagement.batchOps.changeTopicFailed'), 'error');
          }
        });
      });
    }

    menu.showAtMouseEvent(event);
  }

  // 格式化正确率显示
  function formatAccuracy(card: Card): string {
    const stats = questionBankStats.get(card.uuid);
    if (!stats) return '-';
    
    const percent = Math.round(stats.accuracy * 100);
    return `${percent}%`;
  }
  
  // 获取正确率颜色类
  function getAccuracyColorClass(card: Card): string {
    const stats = questionBankStats.get(card.uuid);
    if (!stats) return '';
    
    const percent = Math.round(stats.accuracy * 100);
    if (percent >= 80) return 'accuracy-high';
    if (percent >= 60) return 'accuracy-medium';
    return 'accuracy-low';
  }
  
  // 格式化错题等级
  function formatErrorLevel(card: Card): string {
    const stats = questionBankStats.get(card.uuid);
    if (!stats || !stats.isInErrorBook) return '-';
    
    const incorrectCount = stats.incorrectAttempts;
    if (incorrectCount >= 5) return '高频';
    if (incorrectCount >= 3) return '常见';
    return '轻度';
  }
  
  // 格式化相对时间
  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  }

  // 新建卡片
  function handleCreateCard() {
    plugin.openCreateCardModal(); // 使用复用的CardEditModal
  }


  // 编辑卡片 - 使用全局编辑器
  function handleEditCard(cardUuid: string) {
    handleTempFileEditCard(cardUuid);
  }

  // 删除卡片（并清理源文档中的 Weave 元数据与块锚点）
  async function deleteCardCore(cardUuid: string) {
    logger.debug('[WeaveCardManagement] 删除单个卡片:', cardUuid, '数据源:', dataSource);

      const sourceCards = currentSourceCards;
      const cardToDelete = sourceCards.find(c => c.uuid === cardUuid);
      if (!cardToDelete) {
        throw new Error(t('cardManagement.batchOps.deleteCardNotFound'));
      }

    if (dataSource === 'questionBank') {
      if (!questionBankStorage) {
        throw new Error(t('cardManagement.notices.questionBankStorageMissing'));
      }

      const bankId = cardToDelete.deckId || '';
      if (!plugin.questionBankService) {
        throw new Error(t('cardManagement.notices.questionBankServiceMissing'));
      }

      await plugin.questionBankService.deleteQuestion(bankId, cardUuid);
      await loadQuestionBankCards();
      logger.debug(`成功从题库 ${bankId} 删除卡片 ${cardUuid}`);
    } else if (dataSource === 'incremental-reading') {
      const result = await deleteIncrementalReadingCards([cardToDelete]);
      if (result.ok === 0) {
        throw new Error(t('cardManagement.notices.irDeleteRecordNotFound', { id: cardUuid }));
      }
      await recomputeAndBroadcastIRData(plugin.app, 'remove_block');
      await loadIRContentCards({ silent: true });
    } else {
      cards = cards.filter(c => c.uuid !== cardUuid);
      await deleteMemoryCardCommand(plugin, cardUuid);
      loadCards().catch(err => {
        logger.error('重新加载卡片失败:', err);
      });
    }

    plugin.app.workspace.trigger('Weave:data-changed');
  }

  async function handleDeleteCard(cardUuid: string) {
    const sourceCards = currentSourceCards;
    const cardToDelete = sourceCards.find(c => c.uuid === cardUuid);
    if (!cardToDelete) {
      logger.error('[WeaveCardManagement] 未找到要删除的卡片:', cardUuid, '数据源:', dataSource);
      return;
    }

    const frontContent = getCardContentBySide(cardToDelete, 'front', [], " / ");
    const confirmed = await showObsidianConfirm(
      plugin.app,
      t('cardManagement.confirms.deleteCardMessage', { content: frontContent }),
      { title: t('cardManagement.confirms.deleteTitle'), confirmText: t('cardManagement.confirms.deleteConfirm') }
    );
    if (!confirmed) return;

    try {
      await deleteCardCore(cardUuid);
      showNotification(t('cardManagement.notices.cardDeleted'), 'success');
    } catch (error) {
      logger.error('删除卡片失败:', error);
      if (dataSource === 'questionBank') {
        await loadQuestionBankCards();
      } else if (dataSource === 'incremental-reading') {
        await loadIRContentCards();
      } else {
        await loadCards();
      }
      showNotification(t('cardManagement.notices.deleteFailedRetry'), 'error');
    }
  }

  // handleCloseCardEditor 已移除，统一使用临时文件编辑器

  // 临时文件编辑卡片 - 改为使用全局方法
  function handleTempFileEditCard(cardId: string) {
    logger.debug('[WeaveCardManagementPage] 开始全局编辑:', cardId, '数据源:', dataSource);

    // 性能优化：清理该卡片的缓存，确保编辑后显示最新内容
    for (const [key] of contentCache) {
      if (key.startsWith(cardId)) {
        contentCache.delete(key);
      }
    }

    // 根据数据源选择正确的卡片数据
    const sourceCards = currentSourceCards;
    const cardToEdit = sourceCards.find(c => c.uuid === cardId);
    
    if (cardToEdit) {
      // IR 内容块特殊处理：跳转到源文件进行编辑
      if (dataSource === 'incremental-reading') {
        // PDF 书签：打开 PDF 链接
        if (cardToEdit.metadata?.irPdfBookmark) {
          const link = cardToEdit.metadata.link as string;
          const pdfPath = cardToEdit.metadata.pdfPath as string;
          if (link) {
            const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
            plugin.app.workspace.openLinkText(link, contextPath, false);
          } else if (pdfPath) {
            const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
            plugin.app.workspace.openLinkText(pdfPath, contextPath, false);
          } else {
            showNotification(t('cardManagement.notices.pdfBookmarkLinkMissing'), 'error');
          }
          return;
        }
        
        // 新版 IRChunk：直接打开 chunk 对应的 md 文件
        if (cardToEdit.metadata?.irChunk && cardToEdit.sourceFile) {
          const file = plugin.app.vault.getAbstractFileByPath(cardToEdit.sourceFile);
          if (file && file instanceof TFile) {
            const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
            plugin.app.workspace.openLinkText(cardToEdit.sourceFile, contextPath, false);
            return;
          } else {
            showNotification(t('cardManagement.notices.sourceFileMissing'), 'error');
            return;
          }
        }
        
        // 旧版 IRBlock：打开源文件并定位到对应行
        if (cardToEdit.metadata?.irBlock) {
          const block = irBlocks[cardId];
          if (block && block.filePath) {
            const file = plugin.app.vault.getAbstractFileByPath(block.filePath);
            if (file && file instanceof TFile) {
              const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
              plugin.app.workspace.openLinkText(block.filePath, contextPath, false).then(() => {
                const leaf = plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (leaf && block.startLine) {
                  const editor = leaf.editor;
                  editor.setCursor({ line: block.startLine - 1, ch: 0 });
                  editor.scrollIntoView({ from: { line: block.startLine - 1, ch: 0 }, to: { line: block.startLine - 1, ch: 0 } }, true);
                }
              });
              return;
            } else {
              showNotification(t('cardManagement.notices.sourceFileMissing'), 'error');
              return;
            }
          }
        }
      }
      
      // 普通卡片：立即打开模态窗，不等待（乐观 UI 策略）
      plugin.openEditCardModal(cardToEdit, {
        onSave: handleTempFileEditSave,
        onCancel: () => {
          logger.debug('[WeaveCardManagementPage] 编辑取消');
        }
      });
    } else {
      logger.error('[WeaveCardManagementPage] 未找到要编辑的卡片:', cardId, '数据源:', dataSource);
    }
  }

  // 临时文件编辑保存完成
  async function handleTempFileEditSave(_updatedCard: Card) {
    try {
      const normalizedCardId = String(_updatedCard?.uuid || '').trim();
      if (normalizedCardId) {
        locallyHandledCardSaveIds.add(normalizedCardId);
      }

      // 立即显示成功通知
      showNotification(t('cardManagement.notices.cardSaved'), 'success');
      await applySavedCardToCurrentDataSource(_updatedCard);
    } catch (error) {
      logger.error('临时文件编辑保存失败:', error);
      showNotification(t('cardManagement.notices.saveFailed'), 'error');
    }
  }

  // 查看卡片
  function handleViewCard(cardId: string) {
    logger.debug('[WeaveCardManagement] 查看卡片:', cardId, '数据源:', dataSource);
    
    // 根据数据源选择正确的卡片数据
    const sourceCards = currentSourceCards;
    const cardToView = sourceCards.find(c => c.uuid === cardId);
    
    if (cardToView) {
      // 使用全局模态窗，支持在其他标签页上方显示
      plugin.openViewCardModal(cardToView, {
        allDecks: currentDataSourceDecks,
        resolvedDeckRefs: dataSource === 'memory'
          ? memoryDeckOrganizationRuntime?.resolvedDeckRefsByCardUUID[cardToView.uuid] || []
          : [],
        source: dataSource
      });
    } else {
      logger.error('[WeaveCardManagement] 未找到要查看的卡片:', cardId, '数据源:', dataSource);
    }
  }

  function getIRAssociatedNotePaths(card: Card): string[] {
    return resolveAssociatedNotePaths({
      associatedNotePath:
        (card as any).ir_primary_associated_note_path ||
        (card as any).ir_associated_note_primary_path ||
        (card as any).primaryAssociatedNotePath ||
        (card as any).associatedNotePath,
      associatedNotePaths:
        (card as any).ir_associated_note_paths ||
        (card as any).associatedNotePaths,
    });
  }

  function getAssociatedNoteMenuLabel(notePath: string): string {
    return getAssociatedMarkdownLabel(plugin.app, notePath);
  }

  async function openIRAssociatedNote(notePath: string): Promise<void> {
    const file = await openAssociatedMarkdownNote(plugin.app, notePath);
    if (!(file instanceof TFile)) {
      new Notice(t('cardManagement.notices.associatedNoteMissing'));
    }
  }

  async function persistIRAssociatedNotes(card: Card, notePaths: string[]): Promise<void> {
    try {
      await updateIRCardManagementAssociatedNotes(plugin.app, card, notePaths);
      await recomputeAndBroadcastIRData(plugin.app, 'ui_refresh');
      await loadIRContentCards({ silent: true });
      lastFilteredCardsKey = '';
      cachedTransformedCards = [];
      dataVersion++;
      showNotification(notePaths.length > 0 ? t('cardManagement.notices.associatedNotesUpdated') : t('cardManagement.notices.associatedNotesCleared'), 'success');
    } catch (error) {
      logger.error('[WeaveCardManagement] 更新 IR 关联笔记失败:', error);
      showNotification(t('cardManagement.notices.associatedNotesUpdateFailed'), 'error');
    }
  }

  async function chooseIRAssociatedNote(card: Card, mode: 'replace' | 'append'): Promise<void> {
    const picker = new MarkdownFileSuggestModal(plugin.app, {
      placeholder: mode === 'append' ? t('cardManagement.notices.chooseAppendMarkdown') : t('cardManagement.notices.chooseLinkMarkdown')
    });
    const file = await picker.openAndSelect();
    if (!file) return;

    const currentPaths = getIRAssociatedNotePaths(card);
    const nextPaths = mode === 'append' ? [...currentPaths, file.path] : [file.path];
    await persistIRAssociatedNotes(card, nextPaths);
  }

  async function createIRAssociatedNote(card: Card, mode: 'replace' | 'append'): Promise<void> {
    const currentPaths = getIRAssociatedNotePaths(card);
    const preferredFolderPath = resolvePreferredAssociatedNoteFolder(plugin.app, {
      notePaths: currentPaths,
      fallbackFilePath: String((card as any).ir_source_file || (card as any).sourceFile || '')
    });
    const baseName =
      String((card as any).ir_title || '').trim() ||
      String((card as any).ir_source_file || '').split('/').pop()?.replace(/\.[^/.]+$/, '') ||
      t('cardManagement.notices.defaultReadingNote');
    const createdFile = await createAssociatedMarkdownNote(plugin.app, {
      baseName,
      preferredFolderPath
    });

    const nextPaths = mode === 'append' ? [...currentPaths, createdFile.path] : [createdFile.path];
    await persistIRAssociatedNotes(card, nextPaths);
    await openIRAssociatedNote(createdFile.path);
  }

  function handleIRAssociatedNotesManage(event: MouseEvent, card: Card) {
    event.preventDefault();
    event.stopPropagation();

    const notePaths = getIRAssociatedNotePaths(card);
    const menu = new Menu();
    populateAssociatedNoteMenu({
      menu,
      notePaths,
      getLabel: (notePath) => getAssociatedNoteMenuLabel(notePath),
      onOpen: (notePath) => openIRAssociatedNote(notePath),
      onPick: (mode) => chooseIRAssociatedNote(card, mode),
      onCreate: (mode) => createIRAssociatedNote(card, mode),
      onSetPrimary: (notePath) => {
        const nextPaths = [notePath, ...notePaths.filter((path) => path !== notePath)];
        return persistIRAssociatedNotes(card, nextPaths);
      },
      onRemove: (notePath) =>
        persistIRAssociatedNotes(
          card,
          notePaths.filter((path) => path !== notePath)
        ),
      onClear: () => persistIRAssociatedNotes(card, [])
    });

    menu.showAtMouseEvent(event);
  }

  // 处理标签更新
  async function handleTagsUpdate(cardId: string, tags: string[]) {
    logger.debug('[WeaveCardManagement] 更新卡片标签:', cardId, tags, '数据源:', dataSource);
    
    // 根据数据源选择正确的卡片数据
    const sourceCards = currentSourceCards;
    const cardToUpdate = sourceCards.find(c => c.uuid === cardId);
    
    if (!cardToUpdate) {
      logger.error('[WeaveCardManagement] 未找到要更新标签的卡片:', cardId, '数据源:', dataSource);
      showNotification(t('cardManagement.notices.cardNotFound'), 'error');
      return;
    }

    try {
      if (dataSource === 'questionBank') {
        // 考试牌组模式：更新题库中的卡片标签
        if (!questionBankStorage) {
          showNotification(t('cardManagement.notices.questionBankStorageMissing'), 'error');
          return;
        }

        const { setCardProperty } = await import('../../utils/yaml-utils');
        const updatedCard = {
          ...cardToUpdate,
          content: setCardProperty(cardToUpdate.content || '', 'tags', tags),
          tags,
          modified: new Date().toISOString(),
        };

        await dataStorage.updateCard(updatedCard);
        await loadQuestionBankCards();
        
        // 修复：递增数据版本号，强制触发 UI 更新
        dataVersion++;
        logger.debug('[WeaveCardManagement] 数据版本更新(题库):', dataVersion);
      } else if (dataSource === 'incremental-reading') {
        await updateIRCardManagementTags(plugin.app, cardToUpdate, tags);
        await loadIRContentCards({ silent: true });
        lastFilteredCardsKey = '';
        cachedTransformedCards = [];
        dataVersion++;
      } else {
        // 记忆牌组模式：更新卡片标签
        const { setCardProperty } = await import('../../utils/yaml-utils');
        const updatedCard = { 
          ...cardToUpdate, 
          content: setCardProperty(cardToUpdate.content || '', 'tags', tags),
          tags, 
          modified: new Date().toISOString() 
        };
        
        // 修复：先保存到数据库
        const result = await dataStorage.updateCard(updatedCard);
        
        logger.debug('[WeaveCardManagement] 数据库保存结果:', result.success);
        
        if (!result.success) {
          throw new Error(result.error || t('cardManagement.notices.saveFailed'));
        }
        
        // 修复：清理该卡片的缓存
        for (const [key] of contentCache) {
          if (key.startsWith(cardId)) {
            contentCache.delete(key);
          }
        }
        
        // 修复：清理元数据缓存，强制从新 content 重新提取标签
        invalidateCardCache(cardId);
        
        // 修复：清理 transformedCards 缓存，强制重新转换
        lastFilteredCardsKey = '';
        cachedTransformedCards = [];
        
        cards = cards.map(c => 
          c.uuid === cardId 
            ? { ...c, content: updatedCard.content, tags, modified: new Date().toISOString() }
            : c
        );
        
        // 修复：递增数据版本号，强制触发 UI 更新
        dataVersion++;
        logger.debug('[WeaveCardManagement] 数据版本更新:', dataVersion);
      }
      
      showNotification(t('cardManagement.notices.tagsUpdated'), 'success');
    } catch (error) {
      logger.error('[WeaveCardManagement] 标签更新失败:', error);
      showNotification(t('cardManagement.notices.tagsUpdateFailed'), 'error');
    }
  }

  // 处理优先级更新
  async function handlePriorityUpdate(cardId: string, priority: number) {
    logger.debug('[WeaveCardManagement] 更新卡片优先级:', cardId, priority, '数据源:', dataSource);
    
    // 根据数据源选择正确的卡片数据
    const sourceCards = currentSourceCards;
    const cardToUpdate = sourceCards.find(c => c.uuid === cardId);
    
    if (!cardToUpdate) {
      logger.error('[WeaveCardManagement] 未找到要更新优先级的卡片:', cardId, '数据源:', dataSource);
      showNotification(t('cardManagement.notices.cardNotFound'), 'error');
      return;
    }

    try {
      if (dataSource === 'questionBank') {
        // 考试牌组模式：更新题库中的卡片优先级
        if (!questionBankStorage) {
          showNotification(t('cardManagement.notices.questionBankStorageMissing'), 'error');
          return;
        }

        const updatedCard = {
          ...cardToUpdate,
          priority,
          modified: new Date().toISOString(),
        };

        await dataStorage.updateCard(updatedCard);
        await loadQuestionBankCards();
      } else if (dataSource === 'incremental-reading') {
        await updateIRCardManagementPriority(plugin.app, cardToUpdate, priority);
        await loadIRContentCards({ silent: true });
        lastFilteredCardsKey = '';
        cachedTransformedCards = [];
        dataVersion++;
      } else {
        // 记忆牌组模式：更新卡片优先级
        const updatedCard = { 
          ...cardToUpdate, 
          priority, 
          modified: new Date().toISOString() 
        };
        
        await dataStorage.updateCard(updatedCard);
        
        // 修复：清理 transformedCards 缓存，强制重新转换
        lastFilteredCardsKey = '';
        cachedTransformedCards = [];
        
        cards = cards.map(c => 
          c.uuid === cardId 
            ? { ...c, priority, modified: new Date().toISOString() }
            : c
        );
        
        // 修复：递增数据版本号，强制触发 UI 更新
        dataVersion++;
      }
      
      showNotification(t('cardManagement.notices.priorityUpdated'), 'success');
    } catch (error) {
      logger.error('[WeaveCardManagement] 优先级更新失败:', error);
      showNotification(t('cardManagement.notices.priorityUpdateFailed'), 'error');
    }
  }

  // 关闭查看卡片模态窗（全局方法）
  function handleCloseViewCardModal() {
    // 通过plugin关闭当前的查看卡片模态窗
    if ((plugin as any).currentViewCardModal) {
      const modal = (plugin as any).currentViewCardModal;
      modal.close?.();
    }
  }

  // 从查看模态窗跳转到编辑
  function handleViewCardEdit(card: Card) {
    // 关闭查看模态窗
    handleCloseViewCardModal();
    // 打开编辑模态窗
    handleTempFileEditCard(card.uuid);
  }

  // 从查看模态窗删除卡片
  async function handleViewCardDelete(cardId: string) {
    // 关闭查看模态窗
    handleCloseViewCardModal();
    // 执行删除
    await handleDeleteCard(cardId);
  }

  // 新建卡片相关方法已移除

  // handleBatchTemplateChangeConfirm 已删除（基于弃用的字段模板系统）


  // handleBatchDeckChangeCancel 已移除（改用 Obsidian Menu API）

  // 处理批量添加标签确认
  async function handleBatchAddTags(tagsToAdd: string[]) {
    const selectedCardIds = Array.from(selectedCards);
    let localProgress: GlobalOperationController | null = null;
    
    try {
      logger.debug('开始批量添加标签:', {
        tags: tagsToAdd,
        cardCount: selectedCardIds.length,
        dataSource
      });

      // 根据数据源获取要更新的卡片
      const sourceCards = currentSourceCards;
      const cardsToUpdate = sourceCards.filter(c => selectedCardIds.includes(c.uuid));

      if (dataSource === 'incremental-reading') {
        localProgress = createCardManagementGlobalOperation({
          title: t('cardManagement.batchOps.addTagsTitle'),
          total: selectedCardIds.length,
          detail: t('cardManagement.batchOps.addTagsReadingDetail', { count: selectedCardIds.length }),
          navigationMessage: t('cardManagement.batchOps.addTagsNavigation')
        });

        let success = 0;
        let failed = selectedCardIds.length - cardsToUpdate.length;
        let processed = failed;

        if (processed > 0) {
          localProgress.update({
            status: 'running',
            current: processed,
            detail: t('cardManagement.batchOps.skippedMissingBlocks', { count: processed })
          });
        }

        for (const card of cardsToUpdate) {
          try {
            const currentTags = getCardBatchTags(card);
            const newTags = mergeBatchTags(currentTags, tagsToAdd);
            await updateIRCardManagementTags(plugin.app, card, newTags);
            success++;
          } catch (error) {
            logger.error(`更新IR内容块 ${card.uuid} 标签失败:`, error);
            failed++;
          } finally {
            processed++;
            localProgress.update({
              status: 'running',
              current: processed,
              detail: t('cardManagement.batchOps.processingReadingBlocks', { current: processed, total: selectedCardIds.length })
            });
          }
        }

        localProgress.update({
          status: 'running',
          current: selectedCardIds.length,
          detail: t('cardManagement.batchOps.refreshingReadingList')
        });
        await loadIRContentCards();
        localProgress.finish({
          status: failed === 0 ? 'success' : 'error',
          current: selectedCardIds.length,
          detail: failed === 0
            ? t('cardManagement.batchOps.addTagsSuccessBlocks', { count: success })
            : t('cardManagement.batchOps.addTagsSummaryBlocks', { success, failed })
        });

        if (failed === 0) {
          showNotification(t('cardManagement.batchOps.addTagsSuccessBlocks', { count: success }), 'success');
        } else {
          showNotification(t('cardManagement.batchOps.addTagsSummaryBlocks', { success, failed }), 'warning');
        }
      } else if (dataSource === 'questionBank') {
        if (!questionBankStorage) {
          showNotification(t('cardManagement.notices.questionBankStorageMissing'), 'error');
          return;
        }

        localProgress = createCardManagementGlobalOperation({
          title: t('cardManagement.batchOps.addTagsTitle'),
          total: selectedCardIds.length,
          detail: t('cardManagement.batchOps.addTagsQuestionDetail', { count: selectedCardIds.length }),
          navigationMessage: t('cardManagement.batchOps.addTagsNavigation')
        });

        let success = 0;
        let failed = selectedCardIds.length - cardsToUpdate.length;
        const cardsByBank = new Map<string, Card[]>();
        
        for (const card of cardsToUpdate) {
          const { primaryDeckId } = getCardDeckIds(card, questionBankDecks);
          const bankId = primaryDeckId || card.deckId || '';
          if (!cardsByBank.has(bankId)) {
            cardsByBank.set(bankId, []);
          }
          cardsByBank.get(bankId)!.push(card);
        }

        const { setCardProperty } = await import('../../utils/yaml-utils');

        let processed = failed;
        if (processed > 0) {
          localProgress.update({
            status: 'running',
            current: processed,
            detail: t('cardManagement.batchOps.skippedMissingQuestionCards', { count: processed })
          });
        }

        for (const bankCards of cardsByBank.values()) {
          for (const c of bankCards) {
            try {
              const currentTags = collectCanonicalBatchTags(c.tags || []);
              const newTags = mergeBatchTags(currentTags, tagsToAdd);
              const updatedCard = {
                ...c,
                content: setCardProperty(c.content || '', 'tags', newTags),
                tags: newTags,
                modified: new Date().toISOString(),
              };
              await dataStorage.updateCard(updatedCard);
              success++;
            } catch (error) {
              logger.error(`更新题库卡片 ${c.uuid} 失败:`, error);
              failed++;
            } finally {
              processed++;
              localProgress.update({
                status: 'running',
                current: processed,
                detail: t('cardManagement.batchOps.processingQuestionCards', { current: processed, total: selectedCardIds.length })
              });
            }
          }
        }

        localProgress.update({
          status: 'running',
          current: selectedCardIds.length,
          detail: t('cardManagement.batchOps.refreshingQuestionBank')
        });
        await loadQuestionBankCards();
        localProgress.finish({
          status: failed === 0 ? 'success' : 'error',
          current: selectedCardIds.length,
          detail: failed === 0
            ? t('cardManagement.batchOps.addTagsSuccessCards', { count: success })
            : t('cardManagement.batchOps.addTagsSummaryCards', { success, failed })
        });

        if (failed === 0) {
          showNotification(t('cardManagement.batchOps.addTagsSuccessCards', { count: success }), 'success');
        } else {
          showNotification(t('cardManagement.batchOps.addTagsSummaryCards', { success, failed }), 'warning');
        }
      } else {
        // 记忆牌组模式：使用批量操作服务
        // v2.1 修复：直接修改 content YAML，而不是派生字段
        const { setCardProperty } = await import('../../utils/yaml-utils');
        
        const operationResult = await batchUpdateCards(
          cardsToUpdate,
          (card) => {
            const currentTags = collectCanonicalBatchTags(card.tags || []);
            const newTags = mergeBatchTags(currentTags, tagsToAdd);
            
            // 修改 content YAML（权威数据源）
            const newContent = setCardProperty(card.content || '', 'tags', newTags);
            
            return {
              ...card,
              content: newContent,
              tags: newTags,
              modified: new Date().toISOString()
            };
          },
          dataStorage,
          {
            progressTitle: t('cardManagement.batchOps.addTagsTitle'),
            progressDetail: t('cardManagement.batchOps.addTagsCardsDetail', { count: cardsToUpdate.length }),
            allowNavigation: false,
            navigationMessage: t('cardManagement.batchOps.addTagsNavigation')
          }
        );

        // 刷新数据
        await loadCards();

        // 显示结果通知
        if (operationResult.failed === 0) {
          showNotification(
            t('cardManagement.batchOps.addTagsSuccessCards', { count: operationResult.success }),
            "success"
          );
        } else {
          showNotification(
            t('cardManagement.batchOps.addTagsSummaryCards', {
              success: operationResult.success,
              failed: operationResult.failed
            }),
            "warning"
          );
          logger.error('[BatchAddTags] 失败详情:', operationResult.errors);
        }
      }

    } catch (error) {
      localProgress?.finish({
        status: 'error',
        current: 0,
        detail: error instanceof Error ? error.message : t('cardManagement.batchOps.addTagsFailed')
      }, 2500);
      logger.error('批量添加标签失败:', error);
      showNotification(t('cardManagement.batchOps.addTagsFailed'), 'error');
    }
  }

  // handleBatchAddTagsCancel 已移除（改用 Obsidian Menu API）

  // 处理批量删除标签确认
  async function handleBatchRemoveTagsConfirm(tagsToRemove: string[]) {
    const selectedCardIds = Array.from(selectedCards);
    let localProgress: GlobalOperationController | null = null;

    try {
      logger.debug('开始批量删除标签:', {
        tags: tagsToRemove,
        cardCount: selectedCardIds.length,
        dataSource
      });

      const sourceCards = currentSourceCards;
      const cardsToUpdate = sourceCards.filter(c => selectedCardIds.includes(c.uuid));

      if (dataSource === 'incremental-reading') {
        localProgress = createCardManagementGlobalOperation({
          title: t('cardManagement.batchOps.removeTagsTitle'),
          total: selectedCardIds.length,
          detail: t('cardManagement.batchOps.removeTagsReadingDetail', { count: selectedCardIds.length }),
          navigationMessage: t('cardManagement.batchOps.removeTagsNavigation')
        });

        let success = 0;
        let failed = selectedCardIds.length - cardsToUpdate.length;
        let processed = failed;

        if (processed > 0) {
          localProgress.update({
            status: 'running',
            current: processed,
            detail: t('cardManagement.batchOps.skippedMissingBlocks', { count: processed })
          });
        }

        for (const card of cardsToUpdate) {
          try {
            const currentTags = getCardBatchTags(card);
            const newTags = removeBatchTags(currentTags, tagsToRemove);
            await updateIRCardManagementTags(plugin.app, card, newTags);
            success++;
          } catch (error) {
            logger.error(`更新IR内容块 ${card.uuid} 标签失败:`, error);
            failed++;
          } finally {
            processed++;
            localProgress.update({
              status: 'running',
              current: processed,
              detail: t('cardManagement.batchOps.processingReadingBlocks', { current: processed, total: selectedCardIds.length })
            });
          }
        }

        localProgress.update({
          status: 'running',
          current: selectedCardIds.length,
          detail: t('cardManagement.batchOps.refreshingReadingList')
        });
        await loadIRContentCards();
        localProgress.finish({
          status: failed === 0 ? 'success' : 'error',
          current: selectedCardIds.length,
          detail: failed === 0
            ? t('cardManagement.batchOps.removeTagsSuccessBlocks', { count: success })
            : t('cardManagement.batchOps.removeTagsSummaryBlocks', { success, failed })
        });

        if (failed === 0) {
          showNotification(t('cardManagement.batchOps.removeTagsSuccessBlocks', { count: success }), 'success');
        } else {
          showNotification(t('cardManagement.batchOps.removeTagsSummaryBlocks', { success, failed }), 'warning');
        }
      } else if (dataSource === 'questionBank') {
        if (!questionBankStorage) {
          showNotification(t('cardManagement.notices.questionBankStorageMissing'), 'error');
          return;
        }

        localProgress = createCardManagementGlobalOperation({
          title: t('cardManagement.batchOps.removeTagsTitle'),
          total: selectedCardIds.length,
          detail: t('cardManagement.batchOps.removeTagsQuestionDetail', { count: selectedCardIds.length }),
          navigationMessage: t('cardManagement.batchOps.removeTagsNavigation')
        });

        let success = 0;
        let failed = selectedCardIds.length - cardsToUpdate.length;
        const cardsByBank = new Map<string, Card[]>();
        
        for (const card of cardsToUpdate) {
          const { primaryDeckId } = getCardDeckIds(card, questionBankDecks);
          const bankId = primaryDeckId || card.deckId || '';
          if (!cardsByBank.has(bankId)) {
            cardsByBank.set(bankId, []);
          }
          cardsByBank.get(bankId)!.push(card);
        }

        const { setCardProperty } = await import('../../utils/yaml-utils');

        let processed = failed;
        if (processed > 0) {
          localProgress.update({
            status: 'running',
            current: processed,
            detail: t('cardManagement.batchOps.skippedMissingQuestionCards', { count: processed })
          });
        }

        for (const bankCards of cardsByBank.values()) {
          for (const c of bankCards) {
            try {
              const currentTags = collectCanonicalBatchTags(c.tags || []);
              const newTags = removeBatchTags(currentTags, tagsToRemove);
              const updatedCard = {
                ...c,
                content: setCardProperty(c.content || '', 'tags', newTags),
                tags: newTags,
                modified: new Date().toISOString(),
              };
              await dataStorage.updateCard(updatedCard);
              success++;
            } catch (error) {
              logger.error(`更新题库卡片 ${c.uuid} 失败:`, error);
              failed++;
            } finally {
              processed++;
              localProgress.update({
                status: 'running',
                current: processed,
                detail: t('cardManagement.batchOps.processingQuestionCards', { current: processed, total: selectedCardIds.length })
              });
            }
          }
        }

        localProgress.update({
          status: 'running',
          current: selectedCardIds.length,
          detail: t('cardManagement.batchOps.refreshingQuestionBank')
        });
        await loadQuestionBankCards();
        localProgress.finish({
          status: failed === 0 ? 'success' : 'error',
          current: selectedCardIds.length,
          detail: failed === 0
            ? t('cardManagement.batchOps.removeTagsSuccessCards', { count: success })
            : t('cardManagement.batchOps.removeTagsSummaryCards', { success, failed })
        });

        if (failed === 0) {
          showNotification(t('cardManagement.batchOps.removeTagsSuccessCards', { count: success }), 'success');
        } else {
          showNotification(t('cardManagement.batchOps.removeTagsSummaryCards', { success, failed }), 'warning');
        }
      } else {
        // 记忆牌组模式：使用批量操作服务
        // v2.1 修复：直接修改 content YAML，而不是派生字段
        const { setCardProperty } = await import('../../utils/yaml-utils');
        
        const operationResult = await batchUpdateCards(
          cardsToUpdate,
          (card) => {
            const currentTags = collectCanonicalBatchTags(card.tags || []);
            const newTags = removeBatchTags(currentTags, tagsToRemove);
            
            // 修改 content YAML（权威数据源）
            const newContent = setCardProperty(card.content || '', 'tags', newTags);
            
            return {
              ...card,
              content: newContent,
              tags: newTags,
              modified: new Date().toISOString()
            };
          },
          dataStorage,
          {
            progressTitle: t('cardManagement.batchOps.removeTagsTitle'),
            progressDetail: t('cardManagement.batchOps.removeTagsCardsDetail', { count: cardsToUpdate.length }),
            allowNavigation: false,
            navigationMessage: t('cardManagement.batchOps.removeTagsNavigation')
          }
        );

        // 刷新数据
        await loadCards();

        // 显示结果通知
        if (operationResult.failed === 0) {
          showNotification(
            t('cardManagement.batchOps.removeTagsSuccessCards', { count: operationResult.success }),
            "success"
          );
        } else {
          showNotification(
            t('cardManagement.batchOps.removeTagsSummaryCards', {
              success: operationResult.success,
              failed: operationResult.failed
            }),
            "warning"
          );
          logger.error('[BatchRemoveTags] 失败详情:', operationResult.errors);
        }
      }

    } catch (error) {
      localProgress?.finish({
        status: 'error',
        current: 0,
        detail: error instanceof Error ? error.message : t('cardManagement.batchOps.removeTagsFailed')
      }, 2500);
      logger.error('批量删除标签失败:', error);
      showNotification(t('cardManagement.batchOps.removeTagsFailed'), 'error');
    }
  }

  // handleBatchRemoveTagsCancel 已移除（改用 Obsidian Menu API）

  function openDataManagementModal() {
    dataManagementModalInstance?.close();

    showDataManagementModal = true;
    dataManagementModalInstance = new DataManagementModalObsidian(plugin.app, {
      plugin,
      cards: filteredCards,
      allCards: cards,
      onClose: () => {
        showDataManagementModal = false;
        dataManagementModalInstance = null;
      }
    });
    dataManagementModalInstance.open();
  }

  function closeColumnManager() {
    columnManagerModalInstance?.close();
    columnManagerModalInstance = null;
    showColumnManager = false;
  }

  function createColumnManagerModal() {
    const previousModal = columnManagerModalInstance;
    if (previousModal) {
      isRefreshingColumnManagerModal = true;
      previousModal.close();
      isRefreshingColumnManagerModal = false;
    }

    const modal = new ColumnManagerModalObsidian(plugin.app, {
      visibility: columnVisibility,
      columnOrder,
      columnGroups: getColumnManagerGroups(),
      quickPresets: getColumnManagerPresets(),
      activePresetId: resolveCurrentColumnManagerPreset(),
      onVisibilityChange: handleVisibilityChange,
      onOrderChange: (newOrder) => {
        handleOrderChange(newOrder);
        refreshColumnManagerModal();
      },
      onApplyPreset: (presetId) => {
        applyColumnManagerPreset(presetId as ColumnManagerPresetId);
        refreshColumnManagerModal();
      },
      onResetToDefaults: () => {
        resetColumnManagerConfig();
        refreshColumnManagerModal();
      },
      onClose: () => {
        if (columnManagerModalInstance === modal) {
          columnManagerModalInstance = null;
        }
        if (!isRefreshingColumnManagerModal) {
          showColumnManager = false;
        }
      }
    });
    columnManagerModalInstance = modal;
    return modal;
  }

  function refreshColumnManagerModal() {
    if (!showColumnManager || !columnManagerModalInstance) return;
    createColumnManagerModal().open();
  }

  function toggleColumnManager(anchor?: HTMLElement | null) {
    if (showColumnManager) {
      closeColumnManager();
      return;
    }

    void openColumnManager(anchor);
  }

  function openColumnManager(anchor?: HTMLElement | null) {
    void anchor;
    if (currentView !== 'table') return;
    showColumnManager = true;
    createColumnManagerModal().open();
  }

  // 视图切换
  async function switchView(view: 'table' | 'grid' | 'kanban') {
    if (currentView === view) {
      return;
    }

    // 检查高级功能权限
    if (view === 'grid' && !premiumGuard.canUseFeature(PREMIUM_FEATURES.GRID_VIEW)) {
      promptFeatureId = PREMIUM_FEATURES.GRID_VIEW;
      showActivationPrompt = true;
      return;
    }
    
    if (view === 'kanban' && !premiumGuard.canUseFeature(PREMIUM_FEATURES.KANBAN_VIEW)) {
      promptFeatureId = PREMIUM_FEATURES.KANBAN_VIEW;
      showActivationPrompt = true;
      return;
    }
    
    // 显示加载状态
    isViewSwitching = true;
    const startTime = Date.now();
    
    // 切换视图
    currentView = view;
    await saveViewPreferences(); // 保存视图偏好
    
    // 通知父组件状态变化（用于侧边栏导航同步）
    window.dispatchEvent(new CustomEvent('Weave:card-view-change', { detail: view }));
    
    // 等待下一帧，确保DOM已更新
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 确保加载进度条至少显示800ms，让用户看到反馈
    const elapsed = Date.now() - startTime;
    const minDisplayTime = 800;
    if (elapsed < minDisplayTime) {
      await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed));
    }
    
    // 隐藏加载状态
    isViewSwitching = false;
    
    // 视图切换完成
  }
  
  // 处理激活提示关闭
  function handleActivationPromptClose() {
    showActivationPrompt = false;
  }

  const modalActive = $derived(
    showBuildDeckModal ||
      showCardToMarkdownModal ||
      showColumnManager ||
      showDataManagementModal ||
      showActivationPrompt
  );

  const showBatchToolbar = $derived(selectedCards.size > 0 && !modalActive);

  $effect(() => {
    if (showColumnManager && currentView !== 'table') {
      closeColumnManager();
    }
  });

  // 布局切换处理
  async function handleLayoutModeChange(layout: GridLayoutMode) {
    if (layout === 'timeline' && premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.TIMELINE_VIEW)) {
      promptPremiumFeature(PREMIUM_FEATURES.TIMELINE_VIEW);
      return;
    }

    if (gridLayout === layout) {
      return;
    }

    gridLayout = layout;
    await saveViewPreferences(); // 保存视图偏好
  }

  // 表格视图模式切换处理
  async function handleTableViewModeChange(mode: 'basic' | 'review') {
    tableViewMode = mode;
    logger.debug('[TableViewMode] 模式已切换为:', mode);
    await saveViewPreferences(); // 保存视图偏好
  }

  async function handleGridCardBorderStyleChange(style: 'solid' | 'dashed') {
    if (gridCardBorderStyle === style) {
      return;
    }

    gridCardBorderStyle = style;
    await saveViewPreferences();
  }

  // 移动端菜单项点击处理 - 使用 Obsidian Menu API
  function showMobileCardManagementMenu(evt: MouseEvent) {
    openWeaveMainMenu({
      currentPage: 'weave-card-management',
      leaf: currentLeaf,
      isMobile,
      isInSidebarMode: isInSidebar,
      currentView,
      cardDataSource: dataSource,
      tableViewMode,
      gridLayoutMode: gridLayout,
      gridCardBorderStyle,
      kanbanLayoutMode,
      irTypeFilter,
      documentFilterMode,
      currentActiveDocument,
      enableCardRelationFilterMode,
      enableCardLocationJump,
      event: evt,
      onNavigate: (pageId) => handleNavigate(pageId),
      onCardDataSourceChange: (source) => {
        void switchDataSource(source);
      },
      onViewChange: (view) => {
        void switchView(view);
      }
    });
  }

  // 移动端搜索按钮点击处理
  function handleMobileSearchClick() {
    showMobileSearchInput = !showMobileSearchInput;

    if (!showMobileSearchInput || typeof document === 'undefined') {
      return;
    }

    requestAnimationFrame(() => {
      const input = document.querySelector(
        '.weave-card-management-page .mobile-search-container .search-input'
      ) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  // 看板显示密度切换处理
  async function handleKanbanLayoutModeChange(layout: "compact" | "comfortable" | "spacious") {
    kanbanLayoutMode = layout;
    await saveViewPreferences(); // 保存视图偏好
  }
  
  // 网格视图卡片点击处理（切换选中状态）
  function handleGridCardClick(card: Card) {
    if (enableCardRelationFilterMode) {
      applyCardRelationFilter(card);
      return;
    }

    // 如果启用了定位跳转模式，点击卡片跳转到源文档
    if (enableCardLocationJump) {
      jumpToSourceDocument(card);
      return;
    }
    
    // 否则执行选中/取消选中逻辑
    const newSelectedCards = new Set(selectedCards);
    if (newSelectedCards.has(card.uuid)) {
      // 已选中 - 取消选中
      newSelectedCards.delete(card.uuid);
    } else {
      // 未选中 - 选中
      newSelectedCards.add(card.uuid);
    }
    selectedCards = newSelectedCards;
  }
  
  // 网格视图卡片长按处理（移动端多选）
  function handleGridCardLongPress(card: Card) {
    if (enableCardRelationFilterMode) {
      return;
    }

    // 长按触发多选：切换卡片选中状态
    const newSelectedCards = new Set(selectedCards);
    if (newSelectedCards.has(card.uuid)) {
      newSelectedCards.delete(card.uuid);
    } else {
      newSelectedCards.add(card.uuid);
    }
    selectedCards = newSelectedCards;
  }
  
  // 切换卡片定位跳转模式
  async function toggleCardLocationJump() {
    enableCardLocationJump = !enableCardLocationJump;

    if (enableCardLocationJump && enableCardRelationFilterMode) {
      enableCardRelationFilterMode = false;
      if (relationFilterAnchorCardUuid) {
        clearCardRelationFilterResult();
      }
    }

    await saveViewPreferences(); // 保存视图偏好
    
    // 切换到跳转模式时，清空已选中的卡片
    if (enableCardLocationJump && selectedCards.size > 0) {
      selectedCards = new Set();
      showNotification(t('cardManagement.notices.locationJumpEnabled'), 'success');
    } else if (enableCardLocationJump) {
      showNotification(t('cardManagement.notices.locationJumpEnabled'), 'success');
    } else {
      showNotification(t('cardManagement.notices.locationJumpDisabled'), 'info');
    }
  }

  async function toggleCardRelationFilterMode() {
    enableCardRelationFilterMode = !enableCardRelationFilterMode;

    if (enableCardRelationFilterMode) {
      if (enableCardLocationJump) {
        enableCardLocationJump = false;
      }

      if (selectedCards.size > 0) {
        selectedCards = new Set();
      }

      await saveViewPreferences();
      showNotification(t('cardManagement.notices.relationModeEnabled'), 'success');
      return;
    }

    if (relationFilterAnchorCardUuid) {
      clearCardRelationFilterResult();
    }

    await saveViewPreferences();
    showNotification(t('cardManagement.notices.relationModeDisabled'), 'info');
  }

  function openGridAttributeMenu(anchor?: HTMLElement | null) {
    const menu = attachMenuApp(new Menu(), plugin.app);
    type GridAttributeMenuValue = Extract<
      GridCardAttributeType,
      'none' | 'uuid' | 'source' | 'priority' | 'retention' | 'modified'
    >;

    addMenuRadioChoices<GridAttributeMenuValue>(
      menu,
      gridCardAttribute as GridAttributeMenuValue,
      [
        { title: t('cardManagement.gridAttributeSelector.none'), icon: 'eye-off', value: 'none' },
        { title: t('cardManagement.gridAttributeSelector.uuid'), icon: 'hash', value: 'uuid' },
        { title: t('cardManagement.gridAttributeSelector.source'), icon: 'file-text', value: 'source' },
        { title: t('cardManagement.gridAttributeSelector.priority'), icon: 'flag', value: 'priority' },
        { title: t('cardManagement.gridAttributeSelector.retention'), icon: 'activity', value: 'retention' },
        { title: t('cardManagement.gridAttributeSelector.modified'), icon: 'clock', value: 'modified' },
      ],
      (attr) => {
        void setGridCardAttribute(attr);
      }
    );

    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
      return;
    }

    menu.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  }
  
  async function setGridCardAttribute(attr: GridCardAttributeType) {
    gridCardAttribute = attr;
    await saveViewPreferences(); // 保存视图偏好
  }
  
  // 网格视图卡片编辑处理
  function handleGridCardEdit(card: Card) {
    handleTempFileEditCard(card.uuid);
  }
  
  // 网格视图卡片删除处理
  function handleGridCardDelete(card: Card) {
    handleDeleteCard(card.uuid);
  }
  
  // 网格视图卡片查看处理
  function handleGridCardView(card: Card) {
    handleViewCard(card.uuid);
  }

  function handleGridCardConvertToMarkdown(card: Card) {
    openCardToMarkdownModal(card);
  }

  // 看板视图处理函数
  function handleKanbanCardSelect(card: Card) {
    if (enableCardRelationFilterMode) {
      applyCardRelationFilter(card);
      return;
    }

    // 打开卡片编辑器
    handleEditCard(card.uuid);
  }

  function handleKanbanCardEdit(card: Card) {
    handleEditCard(card.uuid);
  }

  function handleKanbanStartStudy(cards: Card[]) {
    // 这里可以集成学习功能，暂时显示通知
    showNotification(t('cardManagement.notices.startStudyCards', { count: cards.length }), 'info');
  }

  // 看板视图卡片更新（包括新增和跨牌组移动）
  async function handleKanbanCardUpdate(updatedCard: Card, context?: { kind?: string; targetDeckId?: string }) {
    try {
      if (dataSource === 'incremental-reading') {
        const existingIRCard = currentSourceCards.find(c => c.uuid === updatedCard.uuid) || updatedCard;
        const nextPriority = Number((updatedCard as any).ir_priority_value ?? (updatedCard as any).ir_priority ?? updatedCard.priority);
        const prevPriority = Number((existingIRCard as any).ir_priority_value ?? (existingIRCard as any).ir_priority ?? existingIRCard.priority);

        if (Number.isFinite(nextPriority) && nextPriority !== prevPriority) {
          await updateIRCardManagementPriority(plugin.app, existingIRCard, nextPriority);
          applyIRCardPatch(existingIRCard.uuid, {
            priority: nextPriority,
            ir_priority: nextPriority,
            ir_priority_value: nextPriority,
            modified: new Date().toISOString(),
          });
          await recomputeAndBroadcastIRData(plugin.app, 'ui_refresh');
          showNotification(t('cardManagement.notices.priorityUpdated'), 'success');
          return;
        }

        const previousDeckIds = normalizeIRTopicIds(
          (existingIRCard as any).ir_deck_ids || (existingIRCard as any).metadata?.deckIds || []
        );
        const nextDeckIds = context?.kind === 'deck-drag' && context?.targetDeckId
          ? normalizeIRTopicIds([context.targetDeckId])
          : normalizeIRTopicIds(
              (updatedCard as any).ir_deck_ids ||
              (updatedCard as any).metadata?.deckIds ||
              (updatedCard.deckId ? [updatedCard.deckId] : [])
            );

        if (
          nextDeckIds.length > 0 &&
          (
            nextDeckIds.length !== previousDeckIds.length ||
            nextDeckIds.some((deckId, index) => deckId !== previousDeckIds[index])
          )
        ) {
          await updateIRCardManagementDecks(plugin.app, existingIRCard, nextDeckIds);
          applyIRCardPatch(existingIRCard.uuid, {
            deckId: nextDeckIds[0],
            ir_deck_ids: nextDeckIds,
            ir_deck: getIRDeckName(nextDeckIds[0]) || String((updatedCard as any).ir_deck || '').trim(),
            metadata: {
              ...((existingIRCard as any).metadata || {}),
              deckIds: nextDeckIds,
            },
            modified: new Date().toISOString(),
          });
          await recomputeAndBroadcastIRData(plugin.app, 'ui_refresh', { deckIds: nextDeckIds });
          showNotification(t('cardManagement.notices.topicUpdated'), 'success');
          return;
        }

        return;
      }

      // v2.2: 优先从 content YAML 的 we_decks 获取牌组 ID
      const currentDecks = getDecksForDataSource(dataSource);
      const existingCard = currentSourceCards.find(c => c.uuid === updatedCard.uuid);
      const existingDeckId = existingCard
        ? getPrimaryDeckIdForDataSource(existingCard, currentDecks, dataSource)
        : undefined;
      const updatedDeckId = getPrimaryDeckIdForDataSource(updatedCard, currentDecks, dataSource);
      const oldDeckId = existingDeckId || (dataSource === 'memory' ? undefined : existingCard?.deckId);
      const newDeckId = updatedDeckId || (dataSource === 'memory' ? undefined : updatedCard.deckId);
      const isMove = existingCard && oldDeckId !== newDeckId;
      
      let result;
      if (isMove) {
        // 验证：跨牌组移动必须有有效的源和目标牌组
        if (!oldDeckId || !newDeckId) {
          showNotification(t('cardManagement.notices.moveRequiresDeck'), 'error');
          logger.warn(`[KanbanCardUpdate] 跨牌组移动失败: 源=${oldDeckId}, 目标=${newDeckId}`);
          return;
        }
        
        // 使用安全的跨牌组移动方法
        result = await dataStorage.moveCardToDeck(
          updatedCard.uuid,
          oldDeckId,
          newDeckId
        );
        if (result.success) {
          showNotification(t('cardManagement.notices.cardMoved'), 'success');
        }
      } else {
        // 普通保存（优先级等属性更新）
        // 确保卡片有有效的 deckId
        if (!updatedCard.deckId) {
          showNotification(t('cardManagement.notices.saveRequiresDeck'), 'error');
          return;
        }
        result = await saveMemoryCardCommand(plugin, updatedCard, 'update');
        if (result.success) {
          const index = cards.findIndex(c => c.uuid === updatedCard.uuid);
          if (index !== -1) {
            showNotification(t('cardManagement.notices.cardUpdated'), 'success');
          } else {
            showNotification(t('cardManagement.notices.cardCreated'), 'success');
          }
        }
      }
      
      if (!result.success) {
        throw new Error(result.error || t('cardManagement.notices.saveFailed'));
      }
      
      // 更新本地状态
      const index = cards.findIndex(c => c.uuid === updatedCard.uuid);
      if (index !== -1) {
        cards[index] = result.data || updatedCard;
        cards = [...cards];
      } else {
        cards = [...cards, result.data || updatedCard];
      }
    } catch (error) {
      logger.error('保存卡片失败:', error);
      showNotification(t('cardManagement.notices.saveCardFailed', { error: error instanceof Error ? error.message : t('common.unknown') }), 'error');
      // 重新加载数据以恢复状态
      await loadCards();
    }
  }

  // 看板视图卡片删除
  async function handleKanbanCardDelete(cardId: string) {
    try {
      // 确认删除
      const cardToDelete = cards.find(c => c.uuid === cardId);
      if (!cardToDelete) return;
      
      const frontContent = getCardContentBySide(cardToDelete, 'front', [], " / ");
      // 使用 Obsidian Modal 代替 confirm()，避免焦点劫持问题
      const confirmed = await showObsidianConfirm(
        plugin.app,
        t('cardManagement.confirms.deleteCardMessage', { content: frontContent }),
        { title: t('cardManagement.confirms.deleteTitle'), confirmText: t('cardManagement.confirms.deleteConfirm') }
      );
      if (!confirmed) return;
      
      // 删除卡片
      await deleteMemoryCardCommand(plugin, cardId);
      
      // 更新本地状态
      cards = cards.filter(c => c.uuid !== cardId);
      
      // 通知全局侧边栏刷新
      plugin.app.workspace.trigger('Weave:data-changed');
      
      // 延迟显示通知，避免覆盖清理通知
      setTimeout(() => {
        showNotification(t('cardManagement.notices.cardDeleted'), 'success');
      }, 1000);
    } catch (error) {
      logger.error('删除卡片失败:', error);
      showNotification(t('cardManagement.notices.deleteFailedRetry'), 'error');
      // 重新加载数据以恢复状态
      await loadCards();
    }
  }


</script>

<div
  class="weave-card-management-page"
  class:is-table-view={currentView === 'table'}
>
  
  <!-- 加载动画 - 全屏显示 -->
  {#if isLoading || isViewSwitching}
    <div class="initial-loading-overlay">
      <BouncingBallsLoader 
        message={isLoading 
          ? t('cardManagement.loading.cards') 
          : currentView === 'grid' 
            ? (gridLayout === 'timeline' ? t('cardManagement.loading.timeline') : t('cardManagement.loading.grid')) 
            : currentView === 'kanban' 
              ? t('cardManagement.loading.kanban') 
              : t('cardManagement.loading.table')
        } 
      />
    </div>
  {:else}
    <!-- 移动端头部（仅在移动端显示） -->
    <MobileCardManagementHeader
      {currentView}
      onMenuClick={showMobileCardManagementMenu}
      onSearchClick={handleMobileSearchClick}
      onViewChange={switchView}
    />
    
    <!-- 移动端导航菜单已改用 Obsidian Menu API，不再使用 MobileCardManagementMenu 组件 -->
    
    <!-- 移动端搜索输入框 -->
    {#if showMobileSearchInput}
      <div class="mobile-search-container">
        <CardSearchInput
          bind:value={searchQuery}
          placeholder={`${t('cardManagement.search')}...`}
          onSearch={handleSearch}
          onClear={() => {
            handleClearSearch();
            showMobileSearchInput = false;
          }}
          onSort={handleSort}
          app={plugin.app}
          dataSource={dataSource}
          availableDecks={searchAvailableDecks}
          availableTags={availableTags}
          availablePriorities={searchAvailablePriorities}
          availableQuestionTypes={searchAvailableQuestionTypes}
          availableSources={searchAvailableSources}
          availableStatuses={searchAvailableStatuses}
          availableStates={searchAvailableIRStates}
          availableAccuracies={searchAvailableAccuracies}
          availableAttemptThresholds={searchAvailableAttemptThresholds}
          availableErrorLevels={searchAvailableErrorLevels}
          availableYamlKeys={searchAvailableYamlKeys}
          matchCount={searchQuery ? totalFilteredItems : -1}
          totalCount={searchSourceCards.length}
          sortField={sortConfig.field}
          sortDirection={sortConfig.direction}
        />
      </div>
    {/if}
    
  <!-- 批量操作工具栏 -->
  <WeaveBatchToolbar
    selectedCount={selectedCards.size}
    visible={showBatchToolbar}
    app={plugin.app}
    {dataSource}
    onBatchChangeDeck={dataSource === 'memory' ? handleBatchChangeDeck : undefined}
    onBatchAddTagsMenu={handleBatchAddTagsMenu}
    onBatchRemoveTagsMenu={handleBatchRemoveTagsMenu}
    onBatchExportSummaryMd={handleBatchExportSummaryMd}
    onBatchDelete={handleBatchDelete}
    onClearSelection={handleClearSelection}
    onBuildDeck={dataSource === 'memory' ? handleBuildDeck : undefined}
    onIRChangeDeck={dataSource === 'incremental-reading' ? handleIRBatchChangeDeck : undefined}
    {isMobile}
  />

    <!-- 主体容器 -->
    <div class="content-container">
      <!-- 主内容区域 -->
      <main class="main-content">
        <!-- 文档筛选状态指示器 -->
        {#if documentFilterMode === 'current' && currentActiveDocument}
          <div class="filter-status-bar" class:mobile={isMobile}>
            <div class="status-content">
              <span class="doc-name">{getFileName(currentActiveDocument)}</span>
            </div>
            <button 
              class="clear-filter-btn"
              onclick={() => documentFilterMode = 'all'}
              title={t('cardManagement.filters.showAll')}
              aria-label={t('cardManagement.filters.showAll')}
            >
              <EnhancedIcon name="x" size={14} />
            </button>
          </div>
        {/if}
      
      <!-- 全局筛选清除按钮 - 移动端简化显示 -->
      {#if hasActiveGlobalFilters}
        <div class="filter-status-bar global-filters" class:mobile={isMobile}>
          <div class="status-content">
            {#if isMobile}
              <!-- 移动端：仅显示筛选图标和数量 -->
              <EnhancedIcon name="filter" size={14} />
              {#if customCardIdsFilter && customCardIdsFilter.size > 0}
                <span class="filter-count">{customCardIdsFilter.size}</span>
              {:else}
                {@const filterCount = (globalSelectedDeckId ? 1 : 0) + 
                  (globalSelectedCardTypes.size > 0 ? 1 : 0) + 
                  (globalSelectedPriority !== null ? 1 : 0) + 
                  (globalSelectedTags.size > 0 ? 1 : 0) + 
                  (globalSelectedTimeFilter ? 1 : 0)}
                <span class="filter-count">{filterCount}</span>
              {/if}
            {:else}
              <!-- 桌面端：显示详细筛选条件 -->
              {#if customCardIdsFilter && customCardIdsFilter.size > 0}
                <span class="filter-title">{customFilterName}</span>
              {:else}
                <span>{t('cardManagement.filters.appliedFilters')}</span>
              {/if}
              {#if globalSelectedDeckId}
                <span class="filter-badge">{dataSource === 'incremental-reading' ? t('cardManagement.sortMenu.topic') : t('cardManagement.sortMenu.deck')}</span>
              {/if}
              {#if globalSelectedCardTypes.size > 0}
                <span class="filter-badge">{`${t('cardManagement.filters.cardType')} (${globalSelectedCardTypes.size})`}</span>
              {/if}
              {#if globalSelectedPriority !== null}
                <span class="filter-badge">{t('cardManagement.filters.priority')}</span>
              {/if}
              {#if globalSelectedTags.size > 0}
                <span class="filter-badge">{`${t('cardManagement.filters.tags')} (${globalSelectedTags.size})`}</span>
              {/if}
              {#if globalSelectedTimeFilter}
                <span class="filter-badge">{t('cardManagement.filters.time')}</span>
              {/if}
              {#if customCardIdsFilter && customCardIdsFilter.size > 0}
                <span class="filter-badge custom-id-filter">
                  <EnhancedIcon name="layout-grid" size={12} />
                  {t('cardManagement.management.filtered', { count: customCardIdsFilter.size })}
                </span>
              {/if}
            {/if}
          </div>
          <button 
            class="clear-filter-btn"
            onclick={clearGlobalFilters}
            title={t('cardManagement.filters.clearAll')}
            aria-label={t('cardManagement.filters.clearAll')}
          >
            <EnhancedIcon name="x" size={14} />
            {#if !isMobile}
              {t('cardManagement.filters.clearAll')}
            {/if}
          </button>
          </div>
        {/if}
        
        {#if currentView === "table"}
        <div class="table-view-wrapper">
          <WeaveCardTable
            cards={transformedCards}
            {selectedCards}
            columnVisibility={columnVisibility}
            columnOrder={columnOrder}
            tableViewMode={tableViewMode}
            onCardSelect={(cardId, selected) => handleCardSelect(cardId, selected)}
            onSelectAll={handleSelectAll}
            onSort={(field) => handleSort(field)}
            onEdit={handleEditCard}
            onDelete={handleDeleteCard}
            onTagsUpdate={handleTagsUpdate}
            onPriorityUpdate={handlePriorityUpdate}
            onIRAssociatedNotesManage={handleIRAssociatedNotesManage}
            onTempFileEdit={handleTempFileEditCard}
            onView={handleViewCard}
            onJumpToSource={jumpToSourceDocument}
            {sortConfig}
            {isSorting}
            loading={isLoading}
            fieldTemplates={[]}
            {availableTags}
            {plugin}
            decks={currentDataSourceDecks}
            isVisible={isViewVisible}
          />
          
          <!-- 排序加载遮罩 -->
          <TableSortingOverlay show={isSorting} />
        </div>
        <TablePagination
          {currentPage}
          totalItems={totalFilteredItems}
          {itemsPerPage}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      {:else if currentView === "grid"}
        <!-- 网格视图 -->
        {#if gridLayout === "masonry"}
          <MasonryGridView
            cards={filteredAndSortedCards}
            {selectedCards}
            focusedCards={relationFilterAnchorCardUuid ? new Set([relationFilterAnchorCardUuid]) : new Set()}
            {plugin}
            attributeType={gridCardAttribute}
            borderStyle={gridCardBorderStyle}
            {isMobile}
            onCardClick={handleGridCardClick}
             onCardEdit={handleGridCardEdit}
             onCardDelete={handleGridCardDelete}
             onCardView={handleGridCardView}
             onCardConvertToMarkdown={handleGridCardConvertToMarkdown}
             onSourceJump={jumpToSourceDocument}
             onCardLongPress={handleGridCardLongPress}
             loading={isLoading}
          />
        {:else if gridLayout === "timeline"}
          <GridTimelineView
            cards={filteredAndSortedCards}
            {selectedCards}
            focusedCards={relationFilterAnchorCardUuid ? new Set([relationFilterAnchorCardUuid]) : new Set()}
            {plugin}
            attributeType={gridCardAttribute}
            borderStyle={gridCardBorderStyle}
            {isMobile}
            documentFilterMode={documentFilterMode}
            activeDocumentName={currentActiveDocument ? getFileName(currentActiveDocument) : null}
            onCardClick={handleGridCardClick}
             onCardEdit={handleGridCardEdit}
             onCardDelete={handleGridCardDelete}
             onCardView={handleGridCardView}
             onCardConvertToMarkdown={handleGridCardConvertToMarkdown}
             onSourceJump={jumpToSourceDocument}
             onCardLongPress={handleGridCardLongPress}
             loading={isLoading}
          />
        {:else}
          <GridView
            cards={filteredAndSortedCards}
            {selectedCards}
            focusedCards={relationFilterAnchorCardUuid ? new Set([relationFilterAnchorCardUuid]) : new Set()}
            {plugin}
            layoutMode={gridLayout}
            attributeType={gridCardAttribute}
            borderStyle={gridCardBorderStyle}
            {isMobile}
            onCardClick={handleGridCardClick}
            onCardEdit={handleGridCardEdit}
            onCardDelete={handleGridCardDelete}
            onCardView={handleGridCardView}
            onCardConvertToMarkdown={handleGridCardConvertToMarkdown}
            onSourceJump={jumpToSourceDocument}
            onCardLongPress={handleGridCardLongPress}
            loading={isLoading}
          />
        {/if}
      {:else if currentView === "kanban"}
        <!-- 看板视图 -->
        <KanbanView
          cards={filteredAndSortedCards}
          focusedCardUUIDs={relationFilterAnchorCardUuid ? [relationFilterAnchorCardUuid] : []}
          {dataStorage}
          {plugin}
          decks={currentDataSourceDecks}
          {isMobile}
          interactionMode={enableCardRelationFilterMode ? 'action' : 'selection'}
          onCardSelect={handleKanbanCardSelect}
          onCardEdit={handleKanbanCardEdit}
          onCardUpdate={handleKanbanCardUpdate}
          onCardDelete={handleKanbanCardDelete}
          onCardView={handleViewCard}
          onStartStudy={handleKanbanStartStudy}
          onGroupByChange={handleKanbanGroupByChange}
          onSelectedTagGroupIdChange={handleKanbanSelectedTagGroupIdChange}
          groupBy={kanbanGroupBy}
          selectedTagGroupId={kanbanSelectedTagGroupId}
          dataSourceType={dataSource}
          showStats={true}
          layoutMode={kanbanLayoutMode}
          attributeType={gridCardAttribute}
        />
      {/if}
      </main>
    </div>
  {/if}
</div>

  <!-- v2.0 组建牌组模态窗 -->
  {#if showBuildDeckModal}
    <BuildDeckModal
      open={showBuildDeckModal}
      {plugin}
      selectedCardUUIDs={Array.from(selectedCards)}
      pairedMemoryDeckId={globalSelectedDeckId}
      onClose={() => showBuildDeckModal = false}
      onCreated={handleBuildDeckCreated}
    />
  {/if}

  <CardToMarkdownModal
    open={showCardToMarkdownModal}
    {plugin}
    card={cardToMarkdown}
    busy={isConvertingCardToMarkdown}
    onClose={closeCardToMarkdownModal}
    onConfirm={handleCardToMarkdownConfirm}
  />

  <!-- 高级功能激活提示 -->
  <ActivationPrompt
    featureId={promptFeatureId}
    visible={showActivationPrompt}
    onClose={handleActivationPromptClose}
  />
  
<style>
  .weave-card-management-page {
    --weave-card-management-page-bg: var(--background-primary);
    --weave-card-management-surface-bg: var(--background-secondary);
    --weave-card-management-table-top-gap: 0px;
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--weave-card-management-page-bg);
    overflow: hidden;
    position: relative;
    height: 100%;
    min-height: 0;
  }

  .weave-card-management-page.is-table-view {
    --weave-card-management-page-bg: var(--weave-surface-background, var(--weave-surface, var(--background-primary)));
    --weave-card-management-surface-bg: var(--weave-elevated-background, var(--weave-surface-secondary, var(--background-secondary)));
  }

  /* 桌面端彩色圆点视图切换栏样式已移除 - 现在由 WeaveApp 中的 SidebarNavHeader 统一处理 */

  /* 初始加载全屏覆盖层 */
  .initial-loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--weave-card-management-page-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--weave-z-top);
    animation: fadeIn 0.3s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* 内容区域全高度布局 */
  .content-container {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  /* 加载动画 */
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  /* 题库专用列样式 */
  
  /* 正确率颜色样式 */
  :global(.accuracy-high) {
    color: var(--color-green, var(--text-success, var(--text-normal)));
    font-weight: 600;
  }
  
  :global(.accuracy-medium) {
    color: var(--color-orange, var(--text-warning, var(--text-normal)));
    font-weight: 600;
  }
  
  :global(.accuracy-low) {
    color: var(--color-red, var(--text-error, var(--text-normal)));
    font-weight: 600;
  }

  /* 调整表格容器的边框半径 */
  :global(.weave-table-container) {
    border-radius: 0 0 var(--radius-m) var(--radius-m) !important;
    border-top: none !important;
  }

  /* 文档筛选功能样式 */

  /* 文档筛选控制 */
  /* 筛选状态栏 - 无底色差异 */
  .filter-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: transparent;
    font-size: var(--weave-font-size-sm);
    color: var(--weave-text-secondary);
  }

  /* 移动端筛选状态栏 - 更紧凑 */
  .filter-status-bar.mobile {
    padding: 6px 12px;
    gap: 8px;
  }

  .status-content {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .doc-name {
    color: var(--weave-accent-color);
    font-weight: 500;
    font-size: 13px;
  }

  /* 移动端筛选数量显示 */
  .filter-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 9px;
    font-size: 11px;
    font-weight: 600;
  }

  .clear-filter-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    border-radius: var(--weave-radius-sm);
    color: var(--weave-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: var(--weave-font-size-xs);
  }

  .clear-filter-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--weave-text-primary);
  }

  .clear-filter-btn:active {
    background: var(--background-modifier-active-hover);
  }

  /* 移动端清除按钮 - 仅图标 */
  .filter-status-bar.mobile .clear-filter-btn {
    padding: 6px;
    border-radius: 50%;
  }
  
  /* 筛选标记 */
  .filter-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 10px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }

  /* 自定义 ID 筛选徽章 */
  .filter-badge.custom-id-filter {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: linear-gradient(135deg, var(--interactive-accent) 0%, var(--interactive-accent-hover) 100%);
    font-weight: 600;
  }

  /* 筛选标题（用于自定义筛选） */
  .filter-title {
    font-weight: 600;
    color: var(--interactive-accent);
  }

  
  .filter-status-bar.global-filters {
    background: transparent;
  }

  /* 响应式调整 */
  @media (max-width: 768px) {
    .filter-status-bar:not(.mobile) {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--weave-space-xs);
    }
  }

  /* ============================================
     表格视图容器（用于排序遮罩）
     ============================================ */
  .table-view-wrapper {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding-top: var(--weave-card-management-table-top-gap);
    background: var(--weave-card-management-page-bg);
  }

  /* ============================================
     移动端样式
     ============================================ */
  
  /* 移动端搜索容器 */
  .mobile-search-container {
    display: none;
  }

  :global(body.is-mobile) .mobile-search-container {
    display: block;
    padding: 8px 12px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  /* 移动端内容区域底部间距 */
  :global(body.is-mobile) .weave-card-management-page .content-container {
    padding-bottom: var(--weave-mobile-content-bottom-padding, 60px);
  }

  :global(body.is-mobile .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .weave-card-management-page.is-table-view),
  :global(body.is-phone .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .weave-card-management-page.is-table-view) {
    --weave-card-management-table-top-gap: 6px;
  }

</style>
