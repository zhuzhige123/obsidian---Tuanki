<script lang="ts">
  /**
   * 侧边栏导航头部组件
   *
   * 当插件界面位于 Obsidian 侧边栏时显示的紧凑导航头部
   * - 左侧：菜单按钮（☰）触发导航列表菜单
   * - 中间：彩色圆点（根据页面不同有不同功能）
   *   - 牌组学习：增量阅读、记忆牌组、考试题组（数据源切换）
   *   - 卡片管理：表格视图、网格视图、看板视图（视图切换）
   *   - AI助手：无圆点
   * - 右侧：留空占位
   *
   * @module components/navigation/SidebarNavHeader
   * @version 1.3.0 - 卡片管理页面圆点改为视图切换
   */
  import { Menu, type App } from 'obsidian';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import CardSearchInput from '../search/CardSearchInput.svelte';
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from '../../services/premium/PremiumFeatureGuard';
  import { emitCardManagementToolbarAction } from '../../utils/card-management-toolbar-contract';
  import { openWeaveMainMenu } from '../../utils/weave-main-menu';
  import { addMenuRadioChoices, attachMenuApp } from '../../utils/obsidian-menu';
  import { weaveMainInterfaceStore } from '../../stores/weave-main-interface-store';
  import { vaultStorage } from '../../utils/vault-local-storage';
  import { tr } from '../../utils/i18n';

  // 牌组学习页面的筛选类型
  export type DeckFilter = 'memory' | 'question-bank';
  export type DeckStudyViewType = 'kanban';
  // 卡片管理页面的视图类型
  export type CardViewType = 'table' | 'grid' | 'kanban';
  // 卡片管理页面的数据源类型（保留用于兼容）
  export type CardDataSource = 'memory' | 'questionBank' | 'incremental-reading';
  type MemoryDeckDisplayMode = 'formal' | 'emergent';
  type TableViewMode = 'basic' | 'review';
  type GridLayoutMode = 'fixed' | 'masonry' | 'timeline';
  type KanbanLayoutMode = 'compact' | 'comfortable' | 'spacious';
  type IRTypeFilter = 'all' | 'md' | 'pdf';
  interface Props {
    currentPage: string;
    navigationVisibility?: {
      deckStudy?: boolean;
      cardManagement?: boolean;
      incrementalReading?: boolean;
      aiAssistant?: boolean;
      apkgImport?: boolean;
      csvImport?: boolean;
    };
    // 牌组学习页面的筛选状态
    selectedFilter?: DeckFilter;
    onFilterSelect?: (filter: DeckFilter) => void;
    deckStudyView?: DeckStudyViewType;
    // 卡片管理页面的视图状态
    currentView?: CardViewType;
    onViewChange?: (view: CardViewType) => void;
    // 卡片管理页面的数据源状态（保留用于兼容，但不再用于圆点）
    cardDataSource?: CardDataSource;
    onCardDataSourceChange?: (source: CardDataSource) => void;
    app?: App;
    isInSidebarMode?: boolean;
    inspirationPopoverOpen?: boolean;
    onOpenInspirationModal?: (anchor: HTMLElement | null) => void;
    // 导航回调
    onNavigate: (pageId: string) => void;
  }

  let {
    currentPage = 'deck-study',
    navigationVisibility = {},
    selectedFilter = 'memory',
    onFilterSelect,
    deckStudyView = 'kanban',
    currentView = 'table',
    onViewChange,
    cardDataSource = 'memory',
    onCardDataSourceChange,
    app,
    isInSidebarMode = false,
    inspirationPopoverOpen = false,
    onOpenInspirationModal,
    onNavigate
  }: Props = $props();

  const premiumGuard = PremiumFeatureGuard.getInstance();
  let t = $derived($tr);
  const deckStudyFeatureContext = { page: 'deck-study' };
  const cardManagementFeatureContext = { page: 'weave-card-management' };
  let isPremium = $state(get(premiumGuard.isPremiumActive));
  let showPremiumFeaturesPreview = $state(get(premiumGuard.premiumFeaturesPreviewEnabled));

  function getCurrentFeatureContext() {
    if (currentPage === 'deck-study') {
      return deckStudyFeatureContext;
    }

    if (currentPage === 'weave-card-management') {
      return cardManagementFeatureContext;
    }

    return undefined;
  }

  // 牌组学习页面的彩色圆点配置
  const deckFilters = [
    { id: 'memory' as DeckFilter, name: 'mainMenu.cardManagement.memoryDeck', colorStart: '#3b82f6', colorEnd: '#2563eb' },
    { id: 'question-bank' as DeckFilter, name: 'mainMenu.cardManagement.questionBank', colorStart: '#10b981', colorEnd: '#059669' }
  ];

  // 卡片管理页面的彩色圆点配置（视图切换）
  const cardViewTypes = [
    { id: 'table' as CardViewType, name: 'cardManagement.viewModes.table', colorStart: '#ef4444', colorEnd: '#dc2626' },
    { id: 'grid' as CardViewType, name: 'cardManagement.viewModes.grid', colorStart: '#3b82f6', colorEnd: '#2563eb' },
    { id: 'kanban' as CardViewType, name: 'cardManagement.viewModes.kanban', colorStart: '#10b981', colorEnd: '#059669' }
  ];

  $effect(() => {
    const unsubscribePremium = premiumGuard.isPremiumActive.subscribe(value => {
      isPremium = value;
    });
    const unsubscribePreview = premiumGuard.premiumFeaturesPreviewEnabled.subscribe(value => {
      showPremiumFeaturesPreview = value;
    });

    return () => {
      unsubscribePremium();
      unsubscribePreview();
    };
  });

  function shouldShowPremiumEntry(featureId: string): boolean {
    return premiumGuard.shouldShowFeatureEntry(featureId, {
      isPremium,
      showPremiumPreview: showPremiumFeaturesPreview
    }, getCurrentFeatureContext());
  }

  function getPremiumEntryTitle(baseTitle: string, featureId: string): string {
    return premiumGuard.getFeatureEntryTitle(
      baseTitle,
      featureId,
      getCurrentFeatureContext()
    );
  }

  const visibleDeckFilters = $derived(
    deckFilters.filter(filter => {
      if (filter.id === 'question-bank') {
        return shouldShowPremiumEntry(PREMIUM_FEATURES.QUESTION_BANK);
      }

      return true;
    })
  );

  const visibleCardViewTypes = $derived(
    cardViewTypes.filter(viewType => {
      if (viewType.id === 'grid') {
        return shouldShowPremiumEntry(PREMIUM_FEATURES.GRID_VIEW);
      }

      if (viewType.id === 'kanban') {
        return shouldShowPremiumEntry(PREMIUM_FEATURES.KANBAN_VIEW);
      }

      return true;
    })
  );

  const shouldRenderDeckStudyDots = $derived(visibleDeckFilters.length > 1);
  const shouldRenderCardManagementDots = $derived(visibleCardViewTypes.length > 1);

  let cardTableViewMode = $state<TableViewMode>('basic');
  let cardGridLayoutMode = $state<GridLayoutMode>('fixed');
  let cardGridBorderStyle = $state<'solid' | 'dashed'>('solid');
  let cardKanbanLayoutMode = $state<KanbanLayoutMode>('comfortable');
  let cardIRTypeFilter = $state<IRTypeFilter>('all');
  let cardSearchQuery = $state('');
  let cardDocumentFilterMode = $state<'all' | 'current'>('all');
  let cardCurrentActiveDocument = $state<string | null>(null);
  let cardEnableRelationFilter = $state(false);
  let cardEnableLocationJump = $state(false);
  let cardSearchAvailableDecks = $state<any[]>([]);
  let cardSearchAvailableTags = $state<string[]>([]);
  let cardSearchAvailablePriorities = $state<number[]>([]);
  let cardSearchAvailableQuestionTypes = $state<string[]>([]);
  let cardSearchAvailableSources = $state<string[]>([]);
  let cardSearchAvailableStatuses = $state<string[]>([]);
  let cardSearchAvailableStates = $state<string[]>([]);
  let cardSearchAvailableAccuracies = $state<string[]>([]);
  let cardSearchAvailableAttemptThresholds = $state<number[]>([]);
  let cardSearchAvailableErrorLevels = $state<string[]>([]);
  let cardSearchAvailableYamlKeys = $state<string[]>([]);
  let cardSearchMatchCount = $state(-1);
  let cardSearchTotalCount = $state(-1);
  let cardSortField = $state('created');
  let cardSortDirection = $state<'asc' | 'desc'>('desc');
  let showSidebarCardSearch = $state(false);
  let aiSelectedFileName = $state('');
  let aiActiveDocumentName = $state('');
  let aiFollowActiveDocument = $state(true);
  let aiCanStartStaging = $state(false);
  let aiPromptFileName = $state('');
  let aiPromptFilePath = $state('');
  let aiModelLabel = $state('');
  let aiModelTitle = $state('');
  let aiParsePresetName = $state('');
  let aiSubView = $state<'generate' | 'parse-preview'>('generate');
  let aiHistoryCount = $state(0);
  let aiIsGenerating = $state(false);
  let aiIsParsing = $state(false);
  let aiCanGenerate = $state(false);
  let aiCanParse = $state(false);
  let memoryDeckDisplayMode = $state<MemoryDeckDisplayMode>((() => {
    try {
      return normalizeMemoryDeckDisplayMode(vaultStorage.getItem('weave-memory-deck-display-mode'));
    } catch {}
    return 'formal';
  })());
  let cardSearchLabel = $derived(t('cardManagement.search'));
  let cardSearchPlaceholder = $derived(`${t('cardManagement.search')}...`);

  function normalizeMemoryDeckDisplayMode(value: string | null | undefined): MemoryDeckDisplayMode {
    return value === 'emergent' && premiumGuard.canUseFeature(PREMIUM_FEATURES.EMERGENT_DECKS, deckStudyFeatureContext)
      ? 'emergent'
      : 'formal';
  }

  function getCardDataSourceLabel(source: CardDataSource): string {
    if (source === 'questionBank') return t('mainMenu.cardManagement.questionBank');
    if (source === 'incremental-reading') return t('mainMenu.cardManagement.incrementalReading');
    return t('mainMenu.cardManagement.memoryDeck');
  }

  const cardKanbanLayoutModeLabels: Record<KanbanLayoutMode, string> = {
    compact: 'cardManagement.density.compact',
    comfortable: 'cardManagement.density.comfortable',
    spacious: 'cardManagement.density.spacious'
  };

  const cardKanbanLayoutModeIcons: Record<KanbanLayoutMode, string> = {
    compact: 'minimize-2',
    comfortable: 'square',
    spacious: 'maximize-2'
  };

  const cardKanbanLayoutModeOrder: KanbanLayoutMode[] = ['compact', 'comfortable', 'spacious'];

  function getNextCardKanbanLayoutMode(mode: KanbanLayoutMode): KanbanLayoutMode {
    const currentIndex = cardKanbanLayoutModeOrder.indexOf(mode);
    return cardKanbanLayoutModeOrder[(currentIndex + 1) % cardKanbanLayoutModeOrder.length] ?? 'comfortable';
  }

  function toggleCardKanbanLayoutMode() {
    const nextMode = getNextCardKanbanLayoutMode(cardKanbanLayoutMode);
    emitCardManagementToolbarAction(`kanban-layout-${nextMode}`);
  }

  function getCardKanbanLayoutButtonLabel(mode: KanbanLayoutMode): string {
    return `${t('cardManagement.density.title')}·${t(cardKanbanLayoutModeLabels[mode])}`;
  }

  function getCardKanbanLayoutButtonTitle(mode: KanbanLayoutMode): string {
    const nextMode = getNextCardKanbanLayoutMode(mode);
    return `${t('cardManagement.density.title')}：${t(cardKanbanLayoutModeLabels[mode])} → ${t(cardKanbanLayoutModeLabels[nextMode])}`;
  }

  function getCardKanbanLayoutButtonAriaLabel(mode: KanbanLayoutMode): string {
    return `${t('cardManagement.density.title')}（${t(cardKanbanLayoutModeLabels[mode])}）`;
  }

  const cardGridLayoutModeLabels: Record<GridLayoutMode, string> = {
    fixed: 'mainMenu.cardManagement.fixedShort',
    masonry: 'mainMenu.cardManagement.masonryShort',
    timeline: 'mainMenu.cardManagement.timelineShort'
  };

  const cardGridLayoutModeIcons: Record<GridLayoutMode, string> = {
    fixed: 'layout-grid',
    masonry: 'panels-top-left',
    timeline: 'history'
  };

  const cardGridLayoutToolbarActions: Record<GridLayoutMode, 'grid-layout-fixed' | 'grid-layout-masonry' | 'grid-layout-timeline'> = {
    fixed: 'grid-layout-fixed',
    masonry: 'grid-layout-masonry',
    timeline: 'grid-layout-timeline'
  };

  function getCardGridLayoutButtonLabel(mode: GridLayoutMode): string {
    return t(cardGridLayoutModeLabels[mode]);
  }

  function getCardGridBorderButtonLabel(style: 'solid' | 'dashed'): string {
    return style === 'solid'
      ? t('mainMenu.cardManagement.gridBorderSolidShort')
      : t('mainMenu.cardManagement.gridBorderDashedShort');
  }

  function showCardToolbarMenuAt(evt: MouseEvent, populate: (menu: Menu) => void) {
    if (!app) {
      return;
    }

    const menu = attachMenuApp(new Menu(), app);
    populate(menu);

    const anchor = evt.currentTarget instanceof HTMLElement ? evt.currentTarget : null;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
      return;
    }

    menu.showAtPosition({ x: evt.clientX, y: evt.clientY + 4 });
  }

  function openCardGridLayoutMenu(evt: MouseEvent) {
    showCardToolbarMenuAt(evt, (menu) => {
      const choices: Array<{
        title: string;
        icon: 'layout-grid' | 'panels-top-left' | 'history';
        value: GridLayoutMode;
      }> = [
        {
          title: t('mainMenu.cardManagement.gridFixed'),
          icon: 'layout-grid',
          value: 'fixed'
        },
        {
          title: t('mainMenu.cardManagement.gridMasonry'),
          icon: 'panels-top-left',
          value: 'masonry'
        }
      ];

      if (shouldShowPremiumEntry(PREMIUM_FEATURES.TIMELINE_VIEW)) {
        choices.push({
          title: getPremiumEntryTitle(t('mainMenu.cardManagement.timeline'), PREMIUM_FEATURES.TIMELINE_VIEW),
          icon: 'history',
          value: 'timeline'
        });
      }

      addMenuRadioChoices(menu, cardGridLayoutMode, choices, (mode) => {
        emitCardManagementToolbarAction(cardGridLayoutToolbarActions[mode]);
      });
    });
  }

  function openCardGridBorderStyleMenu(evt: MouseEvent) {
    showCardToolbarMenuAt(evt, (menu) => {
      addMenuRadioChoices(
        menu,
        cardGridBorderStyle,
        [
          {
            title: t('mainMenu.cardManagement.gridBorderSolid'),
            icon: 'square',
            value: 'solid' as const
          },
          {
            title: t('mainMenu.cardManagement.gridBorderDashed'),
            icon: 'square-dashed',
            value: 'dashed' as const
          }
        ],
        (style) => {
          emitCardManagementToolbarAction(
            style === 'solid' ? 'grid-border-style-solid' : 'grid-border-style-dashed'
          );
        }
      );
    });
  }

  function getAiPrimaryActionLabel(): string {
    if (aiSubView === 'generate') {
      return aiIsGenerating ? t('mainMenu.aiAssistant.generating') : t('mainMenu.aiAssistant.startGenerate');
    }

    return aiIsParsing ? t('mainMenu.aiAssistant.parsing') : t('mainMenu.aiAssistant.startParse');
  }

  function handleMenuClick(evt: MouseEvent) {
    const anchorEl = evt.currentTarget instanceof HTMLElement ? evt.currentTarget : null;
    openWeaveMainMenu({
      currentPage,
      isMobile: false,
      isInSidebarMode,
      navigationVisibility,
      deckStudyView,
      deckStudyFilter: selectedFilter,
      cardDataSource,
      currentView,
      tableViewMode: cardTableViewMode,
      gridLayoutMode: cardGridLayoutMode,
      gridCardBorderStyle: cardGridBorderStyle,
      kanbanLayoutMode: cardKanbanLayoutMode,
      irTypeFilter: cardIRTypeFilter,
      documentFilterMode: cardDocumentFilterMode,
      currentActiveDocument: cardCurrentActiveDocument,
      enableCardRelationFilterMode: cardEnableRelationFilter,
      enableCardLocationJump: cardEnableLocationJump,
      anchorEl,
      onNavigate,
      onCardDataSourceChange,
      onViewChange
    });
  }

  function openCardDataSourceMenu(evt: MouseEvent) {
    showCardToolbarMenuAt(evt, (menu) => {
      const choices: Array<{
        title: string;
        icon: 'graduation-cap' | 'clipboard-list' | 'bookmark';
        value: CardDataSource;
      }> = [
        {
          title: t('mainMenu.cardManagement.memoryDeck'),
          icon: 'graduation-cap',
          value: 'memory',
        },
      ];

      if (shouldShowPremiumEntry(PREMIUM_FEATURES.QUESTION_BANK)) {
        choices.push({
          title: getPremiumEntryTitle(t('mainMenu.cardManagement.questionBank'), PREMIUM_FEATURES.QUESTION_BANK),
          icon: 'clipboard-list',
          value: 'questionBank',
        });
      }

      if (shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) {
        choices.push({
          title: getPremiumEntryTitle(t('mainMenu.cardManagement.incrementalReading'), PREMIUM_FEATURES.INCREMENTAL_READING),
          icon: 'bookmark',
          value: 'incremental-reading',
        });
      }

      addMenuRadioChoices(menu, cardDataSource, choices, (source) => {
        onCardDataSourceChange?.(source);
      });
    });
  }

  function handleDotClick(dotId: string) {
    if (currentPage === 'deck-study') {
      // 牌组学习页面：切换筛选
      if (onFilterSelect) {
        onFilterSelect(dotId as DeckFilter);
      }
    } else if (currentPage === 'weave-card-management') {
      if (dotId === 'grid') {
        if (currentView !== 'grid') {
          onViewChange?.('grid');
        }

        // 蓝色圆点表示“标准网格视图”，点击时需要从时间线/瀑布流回到固定网格布局。
        if (
          premiumGuard.canUseFeature(PREMIUM_FEATURES.GRID_VIEW, cardManagementFeatureContext)
          && cardGridLayoutMode !== 'fixed'
        ) {
          emitCardManagementToolbarAction('grid-layout-fixed');
        }

        return;
      }

      // 卡片管理页面：切换视图
      if (onViewChange) {
        onViewChange(dotId as CardViewType);
      }
    }
  }

  function getGradientStyle(colorStart: string, colorEnd: string): string {
    return `background: linear-gradient(135deg, ${colorStart}, ${colorEnd})`;
  }

  function emitAIAssistantToolbarAction(
    action: 'file' | 'generate' | 'history' | 'prompt-file' | 'system-prompt' | 'model' | 'parse-template' | 'parse' | 'sub-view' | 'toggle-follow-document' | 'start-staging' | 'toggle-preview-view',
    evt: MouseEvent,
    value?: 'generate' | 'parse-preview'
  ) {
    const anchor = evt.currentTarget instanceof HTMLElement ? evt.currentTarget.getBoundingClientRect() : null;
    window.dispatchEvent(new CustomEvent('Weave:ai-toolbar-action', {
      detail: {
        action,
        value,
        x: evt.clientX,
        y: evt.clientY,
        rect: anchor
          ? {
              left: anchor.left,
              top: anchor.top,
              right: anchor.right,
              bottom: anchor.bottom,
              width: anchor.width,
              height: anchor.height
            }
          : undefined
      }
    }));
  }

  function emitDeckStudyToolbarAction(
    action: 'open-emergent-rule-groups' | 'set-memory-deck-display-mode',
    anchor?: HTMLElement | null,
    mode?: MemoryDeckDisplayMode
  ) {
    window.dispatchEvent(new CustomEvent('Weave:deck-study-toolbar-action', {
      detail: { action, anchor, mode }
    }));
  }

  function toggleMemoryDeckDisplayMode(anchor?: HTMLElement | null) {
    const nextMode: MemoryDeckDisplayMode = memoryDeckDisplayMode === 'formal' ? 'emergent' : 'formal';

    if (nextMode === 'emergent' && !premiumGuard.canUseFeature(PREMIUM_FEATURES.EMERGENT_DECKS, deckStudyFeatureContext)) {
      emitDeckStudyToolbarAction('set-memory-deck-display-mode', anchor, nextMode);
      return;
    }

    memoryDeckDisplayMode = nextMode;
    emitDeckStudyToolbarAction('set-memory-deck-display-mode', anchor, nextMode);
  }

  function getFileName(path: string | null | undefined): string {
    if (!path) return '';
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }

  function emitCardManagementSearchChange(value: string) {
    cardSearchQuery = value;
    window.dispatchEvent(new CustomEvent('Weave:card-management-search-change', {
      detail: { value }
    }));
  }

  function focusSidebarSearchInput() {
    if (typeof document === 'undefined') {
      return;
    }

    requestAnimationFrame(() => {
      if (typeof document === 'undefined') {
        return;
      }

      const input = document.querySelector('.sidebar-card-search-panel .search-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  function toggleSidebarCardSearch() {
    showSidebarCardSearch = !showSidebarCardSearch;

    if (showSidebarCardSearch) {
      focusSidebarSearchInput();
    }
  }

  function handleHeaderMenuClick(evt: MouseEvent) {
    handleMenuClick(evt);
  }

  onMount(() => {  
    const unsubscribeMainInterfaceStore = weaveMainInterfaceStore.subscribe((state) => {
      aiSubView = state.aiToolbar.subView;
      aiSelectedFileName = state.aiToolbar.selectedFileName;
      aiActiveDocumentName = state.aiToolbar.activeDocumentName;
      aiFollowActiveDocument = state.aiToolbar.followActiveDocument;
      aiCanStartStaging = state.aiToolbar.canStartStaging;
      aiPromptFileName = state.aiToolbar.promptFileName;
      aiPromptFilePath = state.aiToolbar.promptFilePath;
      aiModelLabel = state.aiToolbar.modelLabel;
      aiModelTitle = state.aiToolbar.modelTitle;
      aiParsePresetName = state.aiToolbar.parsePresetName;
      aiHistoryCount = state.aiToolbar.historyCount;
      aiCanGenerate = state.aiToolbar.canGenerate;
      aiCanParse = state.aiToolbar.canParse;
      aiIsGenerating = state.aiToolbar.isGenerating;
      aiIsParsing = state.aiToolbar.isParsing;
    });

    const handleCardToolbarState = (event: Event) => { 
      const detail = (event as CustomEvent<{
        tableViewMode?: TableViewMode;
        gridLayout?: GridLayoutMode;
        gridCardBorderStyle?: 'solid' | 'dashed';
        kanbanLayoutMode?: KanbanLayoutMode;
        irTypeFilter?: IRTypeFilter;
        searchQuery?: string;
        documentFilterMode?: 'all' | 'current';
        currentActiveDocument?: string | null;
        enableCardRelationFilterMode?: boolean;
        enableCardLocationJump?: boolean;
        dataSource?: CardDataSource;
        availableDecks?: any[];
        availableTags?: string[];
        availablePriorities?: number[];
        availableQuestionTypes?: string[];
        availableSources?: string[];
        availableStatuses?: string[];
        availableStates?: string[];
        availableAccuracies?: string[];
        availableAttemptThresholds?: number[];
        availableErrorLevels?: string[];
        availableYamlKeys?: string[];
        matchCount?: number;
        totalCount?: number;
        sortField?: string;
        sortDirection?: 'asc' | 'desc';
      }>).detail;

      if (detail.tableViewMode) {
        cardTableViewMode = detail.tableViewMode;
      }

      if (detail.gridLayout) {
        cardGridLayoutMode = detail.gridLayout;
      }

      if (detail.gridCardBorderStyle === 'solid' || detail.gridCardBorderStyle === 'dashed') {
        cardGridBorderStyle = detail.gridCardBorderStyle;
      }

      if (detail.kanbanLayoutMode) {
        cardKanbanLayoutMode = detail.kanbanLayoutMode;
      }

      if (detail.irTypeFilter) {
        cardIRTypeFilter = detail.irTypeFilter;
      }

      if (typeof detail.searchQuery === 'string') {
        cardSearchQuery = detail.searchQuery;
        if (isInSidebarMode && detail.searchQuery.trim()) {
          showSidebarCardSearch = true;
        }
      }

      if (detail.documentFilterMode) {
        cardDocumentFilterMode = detail.documentFilterMode;
      }

      if (typeof detail.currentActiveDocument !== 'undefined') {
        cardCurrentActiveDocument = detail.currentActiveDocument;
      }

      if (typeof detail.enableCardRelationFilterMode === 'boolean') {
        cardEnableRelationFilter = detail.enableCardRelationFilterMode;
      }

      if (typeof detail.enableCardLocationJump === 'boolean') {
        cardEnableLocationJump = detail.enableCardLocationJump;
      }

      if (detail.dataSource) {
        cardDataSource = detail.dataSource;
      }

      if (detail.availableDecks) cardSearchAvailableDecks = detail.availableDecks;
      if (detail.availableTags) cardSearchAvailableTags = detail.availableTags;
      if (detail.availablePriorities) cardSearchAvailablePriorities = detail.availablePriorities;
      if (detail.availableQuestionTypes) cardSearchAvailableQuestionTypes = detail.availableQuestionTypes;
      if (detail.availableSources) cardSearchAvailableSources = detail.availableSources;
      if (detail.availableStatuses) cardSearchAvailableStatuses = detail.availableStatuses;
      if (detail.availableStates) cardSearchAvailableStates = detail.availableStates;
      if (detail.availableAccuracies) cardSearchAvailableAccuracies = detail.availableAccuracies;
      if (detail.availableAttemptThresholds) cardSearchAvailableAttemptThresholds = detail.availableAttemptThresholds;
      if (detail.availableErrorLevels) cardSearchAvailableErrorLevels = detail.availableErrorLevels;
      if (detail.availableYamlKeys) cardSearchAvailableYamlKeys = detail.availableYamlKeys;
      if (typeof detail.matchCount === 'number') cardSearchMatchCount = detail.matchCount;
      if (typeof detail.totalCount === 'number') cardSearchTotalCount = detail.totalCount;
      if (detail.sortField) cardSortField = detail.sortField;
      if (detail.sortDirection) cardSortDirection = detail.sortDirection;
    };

    const handleMemoryDeckDisplayModeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: string } | string>).detail;
      const nextMode = typeof detail === 'string' ? detail : detail?.mode;
      memoryDeckDisplayMode = normalizeMemoryDeckDisplayMode(nextMode);
    };

    window.addEventListener('Weave:card-management-toolbar-state', handleCardToolbarState as EventListener); 
    window.addEventListener('Weave:memory-deck-display-mode-change', handleMemoryDeckDisplayModeChange as EventListener);
 
    return () => { 
      unsubscribeMainInterfaceStore();
      window.removeEventListener('Weave:card-management-toolbar-state', handleCardToolbarState as EventListener); 
      window.removeEventListener('Weave:memory-deck-display-mode-change', handleMemoryDeckDisplayModeChange as EventListener);
    }; 
  });
</script>

<header
  class="sidebar-nav-header"
  class:ai-assistant-layout={currentPage === 'ai-assistant'}
  class:card-management-desktop={currentPage === 'weave-card-management' && !isInSidebarMode}
  class:card-management-inline-search={currentPage === 'weave-card-management' && !isInSidebarMode}
>
  <!-- 左侧：菜单按钮 -->
  <div class="sidebar-header-left" class:ai-assistant-left={currentPage === 'ai-assistant'}>
    <button
      class="sidebar-menu-trigger"
      onclick={handleHeaderMenuClick}
      aria-label={t('weave.mobileOpenMenu')}
    >
      <ObsidianIcon name="menu" size={18} />
    </button>

    {#if currentPage === 'ai-assistant'}
      <button
        class="sidebar-action-btn ai-toolbar-btn ai-file-trigger"
        class:active={isInSidebarMode
          ? aiFollowActiveDocument
          : Boolean(aiSelectedFileName || aiActiveDocumentName)}
        onclick={(evt) => emitAIAssistantToolbarAction(isInSidebarMode ? 'toggle-follow-document' : 'file', evt)}
        aria-label={isInSidebarMode
          ? t('aiAssistant.staging.followActiveDocument')
          : t('mainMenu.aiAssistant.fileList')}
        title={isInSidebarMode
          ? (aiFollowActiveDocument
            ? (aiActiveDocumentName || aiSelectedFileName || t('aiAssistant.staging.followActiveDocument'))
            : t('aiAssistant.staging.followActiveDocumentOff'))
          : (aiSelectedFileName || aiActiveDocumentName || t('mainMenu.aiAssistant.fileList'))}
      >
        {#if isInSidebarMode}
          <EnhancedIcon name={aiFollowActiveDocument ? 'file-text' : 'file'} size={16} />
        {:else}
          <span>{aiSelectedFileName || aiActiveDocumentName || t('mainMenu.aiAssistant.fileList')}</span>
        {/if}
      </button>
      {#if aiSubView === 'generate'}
        <button
          class="sidebar-action-btn ai-toolbar-btn ai-text-trigger ai-model-trigger"
          onclick={(evt) => emitAIAssistantToolbarAction('model', evt)}
          aria-label={t('mainMenu.aiAssistant.model')}
          title={aiModelTitle || t('mainMenu.aiAssistant.model')}
        >
          {#if isInSidebarMode}
            <ObsidianIcon name="bot" size={16} />
          {:else}
            <span>{aiModelLabel || t('mainMenu.aiAssistant.model')}</span>
          {/if}
        </button>
      {:else}
        <button
          class="sidebar-action-btn ai-toolbar-btn ai-text-trigger ai-parse-trigger"
          onclick={(evt) => emitAIAssistantToolbarAction('parse-template', evt)}
          aria-label={t('mainMenu.aiAssistant.parseTemplate')}
          title={aiParsePresetName || t('mainMenu.aiAssistant.parseTemplate')}
        >
          {#if isInSidebarMode}
            <ObsidianIcon name="file-search" size={16} />
          {:else}
            <span>{aiParsePresetName || t('mainMenu.aiAssistant.parseTemplate')}</span>
          {/if}
        </button>
      {/if}
      {#if !isInSidebarMode}
      <button
        class="sidebar-action-btn ai-toolbar-btn ai-history-trigger"
        class:disabled={aiHistoryCount === 0}
        onclick={(evt) => emitAIAssistantToolbarAction('history', evt)}
        aria-label={t('mainMenu.aiAssistant.history')}
        title={aiHistoryCount > 0 ? t('mainMenu.aiAssistant.recentHistory', { count: aiHistoryCount }) : t('mainMenu.aiAssistant.noHistory')}
      >
        {#if isInSidebarMode}
          <ObsidianIcon name="history" size={16} />
        {:else}
          <span>{t('mainMenu.aiAssistant.history')}</span>
        {/if}
      </button>
      {/if}
    {:else if currentPage === 'weave-card-management'}
      <div class="card-header-actions card-header-actions-left">
        {#if isInSidebarMode}
        <button
          class="sidebar-action-btn card-toolbar-btn"
          class:active={cardDocumentFilterMode === 'current'}
          class:disabled={!cardCurrentActiveDocument}
          onclick={() => {
            if (cardCurrentActiveDocument) {
              emitCardManagementToolbarAction('toggle-document-filter');
            }
          }}
          aria-label={t('mainMenu.cardManagement.currentDocumentOnly')}
        >
          <EnhancedIcon name={cardDocumentFilterMode === 'current' ? 'file-text' : 'file'} size={16} />
        </button>
        <button
          class="sidebar-action-btn card-toolbar-btn"
          class:active={cardEnableLocationJump}
          onclick={() => emitCardManagementToolbarAction('toggle-card-location-jump')}
          aria-label={t('mainMenu.cardManagement.cardLocationJump')}
        >
          <ObsidianIcon name="navigation" size={16} />
        </button>
        <button
          class="sidebar-action-btn card-toolbar-btn relation-mode-btn"
          class:active={cardEnableRelationFilter}
          class:relation-active={cardEnableRelationFilter}
          class:is-hidden-slot={!(currentView === 'grid' || currentView === 'kanban')}
          onclick={() => emitCardManagementToolbarAction('toggle-card-relation-filter')}
          aria-label={t('mainMenu.cardManagement.relationMode')}
        >
          <ObsidianIcon name="link-2" size={16} />
        </button>
        {/if}
        {#if !isInSidebarMode}
          <button
            class="sidebar-action-btn card-toolbar-btn"
            onclick={openCardDataSourceMenu}
            aria-label={getCardDataSourceLabel(cardDataSource)}
            title={getCardDataSourceLabel(cardDataSource)}
          >
            <ObsidianIcon name="database" size={16} />
            <span class="card-toolbar-btn-label">{getCardDataSourceLabel(cardDataSource)}</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'table' && cardDataSource === 'incremental-reading' && cardIRTypeFilter === 'md'}
            class:is-hidden-slot={!(currentView === 'table' && cardDataSource === 'incremental-reading')}
            onclick={() => emitCardManagementToolbarAction('ir-type-md')}
            aria-label={t('mainMenu.cardManagement.irMarkdownLabel')}
          >
            <ObsidianIcon name="file-text" size={16} />
            <span class="card-toolbar-btn-label">MD</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'table' && cardDataSource === 'incremental-reading' && cardIRTypeFilter === 'pdf'}
            class:is-hidden-slot={!(currentView === 'table' && cardDataSource === 'incremental-reading')}
            onclick={() => emitCardManagementToolbarAction('ir-type-pdf')}
            aria-label={t('mainMenu.cardManagement.irPdfLabel')}
          >
            <ObsidianIcon name="file" size={16} />
            <span class="card-toolbar-btn-label">PDF</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'table' && cardDataSource === 'memory' && cardTableViewMode === 'basic'}
            class:is-hidden-slot={!(currentView === 'table' && cardDataSource === 'memory')}
            onclick={() => emitCardManagementToolbarAction('table-view-basic')}
            aria-label={t('mainMenu.cardManagement.tableBasic')}
          >
            <ObsidianIcon name="table" size={16} />
            <span class="card-toolbar-btn-label">{t('mainMenu.cardManagement.basicShort')}</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'table' && cardDataSource === 'memory' && cardTableViewMode === 'review'}
            class:is-hidden-slot={!(currentView === 'table' && cardDataSource === 'memory')}
            onclick={() => emitCardManagementToolbarAction('table-view-review')}
            aria-label={t('mainMenu.cardManagement.tableReview')}
          >
            <ObsidianIcon name="bar-chart-2" size={16} />
            <span class="card-toolbar-btn-label">{t('mainMenu.cardManagement.reviewShort')}</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:is-hidden-slot={currentView !== 'grid'}
            onclick={openCardGridLayoutMenu}
            aria-label={t('mainMenu.cardManagement.gridLayout')}
            title={t('mainMenu.cardManagement.gridLayout')}
          >
            <ObsidianIcon name={cardGridLayoutModeIcons[cardGridLayoutMode]} size={16} />
            <span class="card-toolbar-btn-label">{getCardGridLayoutButtonLabel(cardGridLayoutMode)}</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:is-hidden-slot={currentView !== 'grid'}
            onclick={openCardGridBorderStyleMenu}
            aria-label={t('mainMenu.cardManagement.gridBorderStyle')}
            title={t('mainMenu.cardManagement.gridBorderStyle')}
          >
            <ObsidianIcon name={cardGridBorderStyle === 'solid' ? 'square' : 'square-dashed'} size={16} />
            <span class="card-toolbar-btn-label">{getCardGridBorderButtonLabel(cardGridBorderStyle)}</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:is-hidden-slot={currentView !== 'kanban'}
            onclick={toggleCardKanbanLayoutMode}
            aria-label={getCardKanbanLayoutButtonAriaLabel(cardKanbanLayoutMode)}
            title={getCardKanbanLayoutButtonTitle(cardKanbanLayoutMode)}
          >
            <ObsidianIcon name={cardKanbanLayoutModeIcons[cardKanbanLayoutMode]} size={16} />
            <span class="card-toolbar-btn-label">{getCardKanbanLayoutButtonLabel(cardKanbanLayoutMode)}</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn relation-mode-btn"
            class:active={cardEnableRelationFilter}
            class:relation-active={cardEnableRelationFilter}
            class:is-hidden-slot={!(currentView === 'grid' || currentView === 'kanban')}
            onclick={() => emitCardManagementToolbarAction('toggle-card-relation-filter')}
            aria-label={t('mainMenu.cardManagement.relationMode')}
          >
            <ObsidianIcon name="link-2" size={16} />
            <span class="card-toolbar-btn-label">{cardEnableRelationFilter ? t('mainMenu.cardManagement.relationOn') : t('mainMenu.cardManagement.relationOff')}</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:is-hidden-slot={!(currentView === 'grid' || currentView === 'kanban')}
            onclick={(event) => emitCardManagementToolbarAction('open-grid-attribute-menu', event.currentTarget as HTMLElement)}
            aria-label={t('mainMenu.cardManagement.attributeSelector')}
          >
            <ObsidianIcon name="tag" size={16} />
            <span class="card-toolbar-btn-label">{t('mainMenu.cardManagement.gridAttributes')}</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            onclick={() => emitCardManagementToolbarAction('open-data-management')}
            aria-label={t('mainMenu.cardManagement.dataManagement')}
          >
            <ObsidianIcon name="database" size={16} />
            <span class="card-toolbar-btn-label">{t('mainMenu.cardManagement.dataShort')}</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:is-hidden-slot={currentView !== 'table'}
            onclick={(event) => emitCardManagementToolbarAction('open-column-manager', event.currentTarget as HTMLElement)}
            aria-label={t('mainMenu.cardManagement.columnManager')}
          >
            <ObsidianIcon name="columns-2" size={16} />
            <span class="card-toolbar-btn-label">{t('mainMenu.cardManagement.columnShort')}</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:is-hidden-slot={currentView !== 'kanban'}
            onclick={(event) => emitCardManagementToolbarAction('open-kanban-column-settings', event.currentTarget as HTMLElement)}
            aria-label={t('mainMenu.cardManagement.kanbanColumnSettings')}
          >
            <ObsidianIcon name="sliders-horizontal" size={16} />
            <span class="card-toolbar-btn-label">{t('mainMenu.cardManagement.columnSettingsShort')}</span>
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- 中间：彩色圆点 + 插件菜单按钮 -->
  <div class="sidebar-header-center">
    <div class="sidebar-dots-container">
    {#if currentPage === 'deck-study' && shouldRenderDeckStudyDots}
      {#each visibleDeckFilters as filter}
        <button
          class="sidebar-dot"
          class:selected={selectedFilter === filter.id}
          style={getGradientStyle(filter.colorStart, filter.colorEnd)}
          onclick={() => handleDotClick(filter.id)}
          aria-label={t(filter.name)}
          title={t(filter.name)}
        >
          {#if selectedFilter === filter.id}
            <span class="dot-indicator"></span>
          {/if}
        </button>
      {/each}
    {:else if currentPage === 'weave-card-management' && shouldRenderCardManagementDots}
      {#each visibleCardViewTypes as viewType}
        <button
          class="sidebar-dot"
          class:selected={currentView === viewType.id}
          style={getGradientStyle(viewType.colorStart, viewType.colorEnd)}
          onclick={() => handleDotClick(viewType.id)}
          aria-label={t(viewType.name)}
        >
          {#if currentView === viewType.id}
            <span class="dot-indicator"></span>
          {/if}
        </button>
      {/each}
    {:else if currentPage === 'ai-assistant'}
      <button
        class="sidebar-dot"
        class:selected={aiSubView === 'generate'}
        style={getGradientStyle('#ef4444', '#dc2626')}
        onclick={(evt) => emitAIAssistantToolbarAction('sub-view', evt, 'generate')}
        aria-label={t('navigation.aiAssistant')}
        title={t('navigation.aiAssistant')}
      >
        {#if aiSubView === 'generate'}
          <span class="dot-indicator"></span>
        {/if}
      </button>
      <button
        class="sidebar-dot"
        class:selected={aiSubView === 'parse-preview'}
        style={getGradientStyle('#3b82f6', '#2563eb')}
        onclick={(evt) => emitAIAssistantToolbarAction('sub-view', evt, 'parse-preview')}
        aria-label={t('mainMenu.aiAssistant.parsePreview')}
        title={t('mainMenu.aiAssistant.parsePreview')}
      >
        {#if aiSubView === 'parse-preview'}
          <span class="dot-indicator"></span>
        {/if}
      </button>
    {:else}
      <div class="sidebar-dots-placeholder"></div>
    {/if}

    </div>
  </div>

  <!-- 右侧：占位符（保持布局平衡） -->
  <div class="sidebar-header-actions" class:ai-assistant-actions={currentPage === 'ai-assistant'}>
    {#if currentPage === 'ai-assistant'}
      <div class="ai-header-actions">
        <button
          class="sidebar-action-btn ai-toolbar-btn primary ai-primary-trigger"
          class:disabled={aiSubView === 'generate' ? !aiCanGenerate : !aiCanParse}
          onclick={(evt) => emitAIAssistantToolbarAction(aiSubView === 'generate' ? 'generate' : 'parse', evt)}
          aria-label={getAiPrimaryActionLabel()}
          title={getAiPrimaryActionLabel()}
        >
          <span>{getAiPrimaryActionLabel()}</span>
        </button>
      </div>
    {:else if currentPage === 'deck-study'}
      <div class="deck-study-header-actions">
        {#if selectedFilter === 'memory'}
          {#if shouldShowPremiumEntry(PREMIUM_FEATURES.EMERGENT_DECKS)}
            <button
              class="sidebar-action-btn deck-study-toolbar-btn"
              class:active={memoryDeckDisplayMode === 'emergent' && premiumGuard.canUseFeature(PREMIUM_FEATURES.EMERGENT_DECKS, deckStudyFeatureContext)}
              onclick={(event) => toggleMemoryDeckDisplayMode(event.currentTarget as HTMLElement)}
              aria-label={memoryDeckDisplayMode === 'formal' ? getPremiumEntryTitle(t('mainMenu.deckStudy.switchToEmergent'), PREMIUM_FEATURES.EMERGENT_DECKS) : t('mainMenu.deckStudy.switchToFormal')}
              title={memoryDeckDisplayMode === 'formal'
                ? getPremiumEntryTitle(t('mainMenu.deckStudy.showingFormal'), PREMIUM_FEATURES.EMERGENT_DECKS)
                : t('mainMenu.deckStudy.showingEmergent')}
            >
              <ObsidianIcon name={memoryDeckDisplayMode === 'formal' ? 'folder' : 'sparkles'} size={16} />
            </button>
          {/if}
          {#if memoryDeckDisplayMode === 'emergent' && premiumGuard.canUseFeature(PREMIUM_FEATURES.EMERGENT_DECKS, deckStudyFeatureContext)}
            <button
              class="sidebar-action-btn deck-study-toolbar-btn"
              onclick={(event) => emitDeckStudyToolbarAction('open-emergent-rule-groups', event.currentTarget as HTMLElement)}
              aria-label={t('mainMenu.deckStudy.emergentFilter')}
              title={t('mainMenu.deckStudy.emergentFilter')}
            >
              <ObsidianIcon name="filter" size={16} />
            </button>
          {/if}
        {/if}
        {#if premiumGuard.canUseFeature(PREMIUM_FEATURES.KANBAN_VIEW, deckStudyFeatureContext)}
          <button
            class="sidebar-action-btn deck-study-toolbar-btn"
            onclick={(evt) => {
              window.dispatchEvent(new CustomEvent('Weave:open-deck-kanban-menu', {
                detail: { x: evt.clientX, y: evt.clientY, filter: selectedFilter }
              }));
            }}
            aria-label={t('mainMenu.deckStudy.kanbanColumnSettings')}
            title={t('mainMenu.deckStudy.kanbanColumnSettings')}
          >
            <EnhancedIcon name="sliders" size={16} />
          </button>
        {/if}
      </div>
    {:else if currentPage === 'weave-card-management'}
      <div class="card-header-actions card-header-actions-right">
        {#if isInSidebarMode}
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={showSidebarCardSearch || !!cardSearchQuery}
            onclick={toggleSidebarCardSearch}
            aria-label={cardSearchLabel}
            aria-expanded={showSidebarCardSearch}
          >
            <EnhancedIcon name="search" size={16} />
          </button>
        {:else}
        <div class="card-toolbar-search">
          {#if app}
            <CardSearchInput
              bind:value={cardSearchQuery}
              placeholder={cardSearchPlaceholder}
              onSearch={emitCardManagementSearchChange}
              onClear={() => emitCardManagementSearchChange('')}
              app={app}
              dataSource={cardDataSource}
              availableDecks={cardSearchAvailableDecks}
              availableTags={cardSearchAvailableTags}
              availablePriorities={cardSearchAvailablePriorities}
              availableQuestionTypes={cardSearchAvailableQuestionTypes}
              availableSources={cardSearchAvailableSources}
              availableStatuses={cardSearchAvailableStatuses}
              availableStates={cardSearchAvailableStates}
              availableAccuracies={cardSearchAvailableAccuracies}
              availableAttemptThresholds={cardSearchAvailableAttemptThresholds}
              availableErrorLevels={cardSearchAvailableErrorLevels}
              availableYamlKeys={cardSearchAvailableYamlKeys}
              matchCount={cardSearchQuery ? cardSearchMatchCount : -1}
              totalCount={cardSearchTotalCount}
              sortField={cardSortField}
              sortDirection={cardSortDirection}
              showSortButton={false}
            />
          {:else}
            <input
              type="text"
              placeholder={cardSearchPlaceholder}
              aria-label={cardSearchLabel}
              value={cardSearchQuery}
              oninput={(event) => emitCardManagementSearchChange((event.currentTarget as HTMLInputElement).value)}
            />
          {/if}
        </div>
        {/if}
        {#if !isInSidebarMode}
          <button
            class="sidebar-action-btn card-create-btn"
            onclick={() => emitCardManagementToolbarAction('create-card')}
            aria-label={t('ui.newCard')}
          >
            <ObsidianIcon name="plus" size={16} />
            <span>{t('ui.newCard')}</span>
          </button>
        {/if}
      </div>
    {/if}

    {#if currentPage === 'deck-study'}
    <button
      class="sidebar-action-btn sidebar-inspiration-trigger"
      onclick={(event) => onOpenInspirationModal?.(event.currentTarget as HTMLElement)}
      aria-label={t('mainMenu.deckStudy.designInspiration')}
      aria-expanded={inspirationPopoverOpen}
      aria-haspopup="dialog"
      title={t('mainMenu.deckStudy.designInspiration')}
    >
      <ObsidianIcon name="circle-help" size={16} />
    </button>
    {/if}
  </div>
</header>

{#if currentPage === 'weave-card-management' && isInSidebarMode && showSidebarCardSearch}
  <div class="sidebar-card-search-panel">
    <div class="card-toolbar-search">
      {#if app}
        <CardSearchInput
          bind:value={cardSearchQuery}
          placeholder={cardSearchPlaceholder}
          onSearch={emitCardManagementSearchChange}
          onClear={() => emitCardManagementSearchChange('')}
          app={app}
          dataSource={cardDataSource}
          availableDecks={cardSearchAvailableDecks}
          availableTags={cardSearchAvailableTags}
          availablePriorities={cardSearchAvailablePriorities}
          availableQuestionTypes={cardSearchAvailableQuestionTypes}
          availableSources={cardSearchAvailableSources}
          availableStatuses={cardSearchAvailableStatuses}
          availableStates={cardSearchAvailableStates}
          availableAccuracies={cardSearchAvailableAccuracies}
          availableAttemptThresholds={cardSearchAvailableAttemptThresholds}
          availableErrorLevels={cardSearchAvailableErrorLevels}
          availableYamlKeys={cardSearchAvailableYamlKeys}
          matchCount={cardSearchQuery ? cardSearchMatchCount : -1}
          totalCount={cardSearchTotalCount}
          sortField={cardSortField}
          sortDirection={cardSortDirection}
          showSortButton={false}
        />
      {:else}
        <input
          type="text"
          placeholder={cardSearchPlaceholder}
          aria-label={cardSearchLabel}
          value={cardSearchQuery}
          oninput={(event) => emitCardManagementSearchChange((event.currentTarget as HTMLInputElement).value)}
        />
      {/if}
    </div>
  </div>
{/if}

<style>
  .sidebar-nav-header {
    --weave-header-bg: var(--weave-surface-background, var(--weave-surface, var(--background-primary)));
    --weave-header-surface: var(--weave-elevated-background, var(--weave-surface-secondary, var(--background-secondary)));
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    position: relative;
    align-items: center;
    padding: 6px 8px;
    background: var(--weave-header-bg);
    flex-shrink: 0;
    min-height: 44px;
  }

  .sidebar-nav-header.ai-assistant-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 8px;
  }

  .sidebar-nav-header.card-management-desktop {
    padding: 6px 8px;
    gap: 8px;
    background: var(--weave-header-bg);
  }

  .sidebar-nav-header.card-management-desktop .sidebar-header-left,
  .sidebar-nav-header.card-management-desktop .sidebar-header-actions {
    gap: 6px;
  }

  .sidebar-nav-header.card-management-desktop .sidebar-menu-trigger {
    margin-right: 4px;
  }

  .sidebar-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1 1 0;
    grid-column: 1;
  }

  .sidebar-header-left.ai-assistant-left {
    flex: 1 1 auto;
    max-width: none;
    overflow: hidden;
    gap: 5px;
  }

  .sidebar-menu-trigger {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 0.15s ease, color 0.15s ease;
    box-shadow: none;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .sidebar-menu-trigger:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .sidebar-menu-trigger:active {
    background: var(--background-modifier-active-hover);
  }

  .sidebar-header-center {
    position: relative;
    grid-column: 2;
    justify-self: center;
    display: flex;
    justify-content: center;
    align-items: center;
    min-width: 0;
    pointer-events: auto;
    z-index: 3;
  }

  .sidebar-header-center > * {
    pointer-events: auto;
  }

  .sidebar-dots-container {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .sidebar-dots-placeholder {
    height: 16px;
  }

  .sidebar-dot {
    --weave-sidebar-dot-size: 16px;
    position: relative;
    display: block;
    flex: 0 0 auto;
    width: var(--weave-sidebar-dot-size);
    height: var(--weave-sidebar-dot-size);
    min-width: var(--weave-sidebar-dot-size);
    min-height: var(--weave-sidebar-dot-size);
    border-radius: 50%;
    border: none;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    padding: 0;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .sidebar-dot::before {
    /* 保持圆点视觉尺寸不变，同时复用全局触控尺寸变量扩展点击热区 */
    content: '';
    position: absolute;
    inset: calc((var(--weave-sidebar-dot-size) - var(--weave-touch-sm, 44px)) / 2);
    border-radius: 50%;
    background: transparent;
  }

  .sidebar-dot:hover {
    transform: scale(1.25);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }

  .sidebar-dot:active {
    transform: scale(1.15);
  }

  .sidebar-dot:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .sidebar-dot.selected {
    transform: scale(1.35);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
  }

  /* 选中状态的脉冲边框 */
  .sidebar-dot.selected::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.6);
    opacity: 0.6;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.15);
      opacity: 0.3;
    }
  }

  /* 选中指示器（白色小圆点） */
  .dot-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 6px;
    height: 6px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.5);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .sidebar-header-actions {
    flex: 1 1 auto;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    grid-column: 3;
  }

  .sidebar-header-actions.ai-assistant-actions {
    flex: 1 1 auto;
    justify-self: end;
    overflow: visible;
  }

  .sidebar-header-left,
  .sidebar-header-actions {
    position: relative;
    z-index: 2;
  }

  .sidebar-nav-header.card-management-inline-search,
  .sidebar-nav-header.card-management-inline-search .sidebar-header-actions,
  .sidebar-nav-header.card-management-inline-search .card-header-actions-right,
  .sidebar-nav-header.card-management-inline-search .card-toolbar-search,
  .sidebar-nav-header.card-management-inline-search .card-toolbar-search :global(.card-search-container) {
    overflow: visible;
  }

  .sidebar-action-btn {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none !important;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 0.15s ease, color 0.15s ease;
    box-shadow: none !important;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .sidebar-action-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .sidebar-action-btn:active {
    background: var(--background-modifier-active-hover);
  }

  .sidebar-action-btn.disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  }

  .sidebar-inspiration-trigger {
    color: var(--text-normal);
  }

  .sidebar-inspiration-trigger :global(svg) {
    stroke-width: 1.9;
  }

  .ai-header-actions {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    flex: 0 0 auto;
    justify-content: flex-end;
    width: auto;
    overflow: visible;
    flex-wrap: nowrap;
  }

  .deck-study-header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
    overflow: visible;
  }

  .card-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .card-header-actions-left {
    overflow: hidden;
    flex-wrap: nowrap;
  }

  .sidebar-nav-header.card-management-desktop .card-header-actions-left {
    gap: 5px;
  }

  .sidebar-nav-header.card-management-desktop .card-header-actions-left::-webkit-scrollbar {
    display: none;
  }

  .sidebar-nav-header.card-management-desktop .card-header-actions-left {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .is-hidden-slot {
    display: none !important;
  }

  .card-toolbar-btn {
    color: var(--text-normal);
  }

  .card-toolbar-btn.active {
    color: var(--text-accent);
    background: var(--background-modifier-hover);
  }

  .relation-mode-btn {
    position: relative;
  }

  .relation-mode-btn.relation-active {
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 16%, var(--background-modifier-hover));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 44%, transparent) !important;
  }

  .relation-mode-btn.relation-active::after {
    content: '';
    position: absolute;
    top: 6px;
    right: 6px;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--interactive-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }

  .deck-study-toolbar-btn.active {
    color: var(--text-accent);
    background: var(--background-modifier-hover);
    box-shadow: inset 0 0 0 1px var(--background-modifier-border-hover, var(--background-modifier-border));
  }

  .sidebar-nav-header.card-management-desktop .card-toolbar-btn {
    width: auto;
    min-width: 0;
    height: 32px;
    padding: 0 9px;
    gap: 5px;
    border-radius: 6px;
    color: var(--text-muted);
    justify-content: flex-start;
    transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  }

  .sidebar-nav-header.card-management-desktop .card-toolbar-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .sidebar-nav-header.card-management-desktop .card-toolbar-btn:active {
    background: var(--background-modifier-active-hover);
  }

  .sidebar-nav-header.card-management-desktop .card-toolbar-btn.active {
    color: var(--text-accent);
    background: var(--background-modifier-hover);
    box-shadow: inset 0 0 0 1px var(--background-modifier-border-hover, var(--background-modifier-border));
  }

  .sidebar-nav-header.card-management-desktop .relation-mode-btn.relation-active {
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-modifier-hover));
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 42%, transparent),
      0 0 0 1px color-mix(in srgb, var(--interactive-accent) 12%, transparent);
  }

  .sidebar-nav-header.card-management-desktop .card-toolbar-btn.active .card-toolbar-btn-label {
    font-weight: 600;
  }

  .sidebar-nav-header.card-management-desktop .relation-mode-btn.relation-active .card-toolbar-btn-label {
    font-weight: 700;
  }

  .sidebar-nav-header.card-management-desktop .card-toolbar-btn :global(svg) {
    stroke-width: 1.9;
  }

  .card-toolbar-btn-label {
    display: inline-block;
    font-size: 0.82rem;
    line-height: 1;
    font-weight: 500;
    white-space: nowrap;
    color: currentColor;
  }

  .card-toolbar-search {
    display: flex;
    align-items: center;
    min-width: 240px;
    max-width: 360px;
    min-height: 36px;
  }

  .card-toolbar-search :global(.card-search-container) {
    width: 100%;
  }

  .card-toolbar-search :global(.search-input-wrapper) {
    min-height: 36px;
    border-radius: 8px;
    background: var(--weave-header-surface);
    border-color: transparent;
  }

  .card-toolbar-search :global(.search-input-wrapper:focus-within) {
    border-color: var(--interactive-accent);
  }

  .card-toolbar-search :global(.search-input) {
    font-size: 0.85rem;
  }

  .sidebar-card-search-panel {
    display: flex;
    align-items: center;
    padding: 8px;
    background: var(--weave-header-bg);
  }

  .sidebar-card-search-panel .card-toolbar-search {
    width: 100%;
    min-width: 0;
    max-width: none;
  }

  .card-create-btn {
    width: auto;
    padding: 0 12px;
    gap: 6px;
    border-radius: 8px;
    color: var(--text-normal);
    border: none !important;
    box-shadow: none !important;
  }

  .card-create-btn span {
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .ai-toolbar-btn {
    width: auto;
    min-width: 0;
    padding: 0 9px;
    gap: 5px;
    border: none;
    border-radius: 8px;
    background: transparent;
    box-shadow: none;
  }

  .ai-toolbar-btn span {
    font-size: 0.85rem;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ai-text-trigger {
    justify-content: flex-start;
    color: var(--text-normal);
    overflow: hidden;
  }

  .ai-file-trigger {
    flex: 0 1 auto;
    min-width: 0;
    max-width: min(20vw, 240px);
    padding: 0 11px;
    justify-content: flex-start;
    gap: 5px;
    color: var(--text-normal);
    overflow: hidden;
  }

  .ai-prompt-trigger,
  .ai-model-trigger,
  .ai-parse-trigger {
    flex: 0 1 auto;
    min-width: 0;
    max-width: min(17vw, 196px);
  }

  .ai-file-trigger span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-prompt-trigger span,
  .ai-model-trigger span,
  .ai-parse-trigger span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-history-trigger {
    flex: 0 0 auto;
    color: var(--text-normal);
    padding: 0 11px;
  }

  @media (max-width: 900px) {
    .sidebar-header-center {
      position: static;
      transform: none;
      justify-self: center;
      pointer-events: auto;
      z-index: auto;
    }

    .sidebar-nav-header .sidebar-header-center {
      grid-column: 2;
    }

    .sidebar-header-left.ai-assistant-left {
      max-width: none;
    }

    .ai-file-trigger {
      max-width: min(22vw, 190px);
      padding: 0 8px;
    }

    .ai-toolbar-btn span {
      max-width: 76px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  @media (max-width: 640px) {
    .sidebar-nav-header {
      gap: 8px;
    }

    .sidebar-nav-header.ai-assistant-layout {
      padding-right: 6px;
    }

    .sidebar-header-left.ai-assistant-left {
      min-width: 0;
      max-width: 44vw;
    }

    .ai-file-trigger {
      max-width: 28vw;
      padding: 0 8px;
    }

    .ai-history-trigger span,
    .ai-toolbar-btn.primary span {
      display: inline-block;
    }

    .ai-history-trigger,
    .ai-toolbar-btn.primary {
      padding: 0 10px;
    }
  }

  .ai-toolbar-btn.primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .ai-toolbar-btn.primary:hover {
    background: var(--interactive-accent-hover);
    color: var(--text-on-accent);
  }

</style>


