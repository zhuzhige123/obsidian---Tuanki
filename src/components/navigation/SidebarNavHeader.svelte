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
  import { Notice, type App } from 'obsidian';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import CardSearchInput from '../search/CardSearchInput.svelte';
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from '../../services/premium/PremiumFeatureGuard';
  import { openWeaveMainMenu } from '../../utils/weave-main-menu';

  // 牌组学习页面的筛选类型
  export type DeckFilter = 'memory' | 'question-bank' | 'incremental-reading';
  export type DeckStudyViewType = 'grid' | 'kanban';
  // 卡片管理页面的视图类型
  export type CardViewType = 'table' | 'grid' | 'kanban';
  // 卡片管理页面的数据源类型（保留用于兼容）
  export type CardDataSource = 'memory' | 'questionBank' | 'incremental-reading';
  type TableViewMode = 'basic' | 'review';
  type GridLayoutMode = 'fixed' | 'masonry' | 'timeline';
  type KanbanLayoutMode = 'compact' | 'comfortable' | 'spacious';
  type IRTypeFilter = 'all' | 'md' | 'pdf';
  interface Props {
    currentPage: string;
    navigationVisibility?: {
      apkgImport?: boolean;
      csvImport?: boolean;
      clipboardImport?: boolean;
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
    // 导航回调
    onNavigate: (pageId: string) => void;
  }

  let {
    currentPage = 'deck-study',
    navigationVisibility = {},
    selectedFilter = 'memory',
    onFilterSelect,
    deckStudyView = 'grid',
    currentView = 'table',
    onViewChange,
    cardDataSource = 'memory',
    onCardDataSourceChange,
    app,
    isInSidebarMode = false,
    onNavigate
  }: Props = $props();

  const premiumGuard = PremiumFeatureGuard.getInstance();
  let isPremium = $state(get(premiumGuard.isPremiumActive));
  let showPremiumFeaturesPreview = $state(get(premiumGuard.premiumFeaturesPreviewEnabled));

  // 牌组学习页面的彩色圆点配置
  const deckFilters = [
    { id: 'incremental-reading' as DeckFilter, name: '增量阅读', colorStart: '#ef4444', colorEnd: '#dc2626' },
    { id: 'memory' as DeckFilter, name: '记忆牌组', colorStart: '#3b82f6', colorEnd: '#2563eb' },
    { id: 'question-bank' as DeckFilter, name: '考试题组', colorStart: '#10b981', colorEnd: '#059669' }
  ];

  // 卡片管理页面的彩色圆点配置（视图切换）
  const cardViewTypes = [
    { id: 'table' as CardViewType, name: '表格视图', colorStart: '#ef4444', colorEnd: '#dc2626' },
    { id: 'grid' as CardViewType, name: '网格视图', colorStart: '#3b82f6', colorEnd: '#2563eb' },
    { id: 'kanban' as CardViewType, name: '看板视图', colorStart: '#10b981', colorEnd: '#059669' }
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
    });
  }

  function getPremiumEntryTitle(baseTitle: string, featureId: string): string {
    return premiumGuard.canUseFeature(featureId) ? baseTitle : `${baseTitle} (高级)`;
  }

  function isClipboardImportMenuVisible(): boolean {
    return navigationVisibility?.clipboardImport !== false;
  }

  function isAPKGImportMenuVisible(): boolean {
    return navigationVisibility?.apkgImport !== false;
  }

  function isCSVImportMenuVisible(): boolean {
    return navigationVisibility?.csvImport !== false;
  }

  const visibleDeckFilters = $derived(
    deckFilters.filter(filter => {
      if (filter.id === 'incremental-reading') {
        return shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING);
      }

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

  let cardTableViewMode = $state<TableViewMode>('basic');
  let cardGridLayoutMode = $state<GridLayoutMode>('fixed');
  let cardKanbanLayoutMode = $state<KanbanLayoutMode>('comfortable');
  let cardIRTypeFilter = $state<IRTypeFilter>('all');
  let cardSearchQuery = $state('');
  let cardDocumentFilterMode = $state<'all' | 'current'>('all');
  let cardCurrentActiveDocument = $state<string | null>(null);
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
  const cardSearchLabel = '\u641c\u7d22\u5361\u7247';
  const cardSearchPlaceholder = '\u641c\u7d22\u5361\u7247...';

  function handleMenuClick(evt: MouseEvent) {
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
      kanbanLayoutMode: cardKanbanLayoutMode,
      irTypeFilter: cardIRTypeFilter,
      documentFilterMode: cardDocumentFilterMode,
      currentActiveDocument: cardCurrentActiveDocument,
      enableCardLocationJump: cardEnableLocationJump,
      event: evt,
      onNavigate,
      onCardDataSourceChange,
      onViewChange
    });
  }

  function handleDotClick(dotId: string) {
    if (currentPage === 'deck-study') {
      if (dotId === 'incremental-reading' && !premiumGuard.canUseFeature(PREMIUM_FEATURES.INCREMENTAL_READING)) {
          new Notice('增量阅读是高级功能，请激活许可证后使用');
          return;
      }
      if (dotId === 'question-bank' && !premiumGuard.canUseFeature(PREMIUM_FEATURES.QUESTION_BANK)) {
        new Notice('考试题组是高级功能，请激活许可证后使用');
        return;
      }
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
          premiumGuard.canUseFeature(PREMIUM_FEATURES.GRID_VIEW)
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
    action: 'file' | 'generate' | 'history' | 'prompt-file' | 'system-prompt' | 'model' | 'parse-template' | 'parse' | 'sub-view',
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

  function emitCardManagementToolbarAction(action: string, anchor?: HTMLElement | null) {
    window.dispatchEvent(new CustomEvent('Weave:card-management-toolbar-action', {
      detail: { action, anchor }
    }));
  }

  function emitDeckStudyToolbarAction(action: 'open-emergent-rule-groups', anchor?: HTMLElement | null) {
    window.dispatchEvent(new CustomEvent('Weave:deck-study-toolbar-action', {
      detail: { action, anchor }
    }));
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
    requestAnimationFrame(() => {
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
    const handleAIToolbarStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{
        subView?: 'generate' | 'parse-preview';
        selectedFileName?: string;
        selectedFilePath?: string;
        promptFileName?: string;
        promptFilePath?: string;
        modelLabel?: string;
        modelTitle?: string;
        parsePresetName?: string;
        parsePresetId?: string;
        historyCount?: number;
        canGenerate?: boolean;
        canParse?: boolean;
        isGenerating?: boolean;
        isParsing?: boolean;
      }>).detail;

      aiSubView = detail?.subView ?? aiSubView;
      aiSelectedFileName = detail?.selectedFileName?.trim() ?? '';
      aiPromptFileName = detail?.promptFileName?.trim() ?? '';
      aiPromptFilePath = detail?.promptFilePath?.trim() ?? '';
      aiModelLabel = detail?.modelLabel?.trim() ?? '';
      aiModelTitle = detail?.modelTitle?.trim() ?? '';
      aiParsePresetName = detail?.parsePresetName?.trim() ?? '';
      aiHistoryCount = Math.max(0, detail?.historyCount ?? 0);
      aiCanGenerate = !!detail?.canGenerate;
      aiCanParse = !!detail?.canParse;
      aiIsGenerating = !!detail?.isGenerating;
      aiIsParsing = !!detail?.isParsing;
    };

    const handleCardToolbarState = (event: Event) => { 
      const detail = (event as CustomEvent<{
        tableViewMode?: TableViewMode;
        gridLayout?: GridLayoutMode;
        kanbanLayoutMode?: KanbanLayoutMode;
        irTypeFilter?: IRTypeFilter;
        searchQuery?: string;
        documentFilterMode?: 'all' | 'current';
        currentActiveDocument?: string | null;
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

    window.addEventListener('Weave:ai-toolbar-state-change', handleAIToolbarStateChange as EventListener);
    window.addEventListener('Weave:card-management-toolbar-state', handleCardToolbarState as EventListener); 
 
    return () => { 
      window.removeEventListener('Weave:ai-toolbar-state-change', handleAIToolbarStateChange as EventListener);
      window.removeEventListener('Weave:card-management-toolbar-state', handleCardToolbarState as EventListener); 
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
      aria-label="打开导航菜单"
    >
      <ObsidianIcon name="menu" size={18} />
    </button>

    {#if currentPage === 'ai-assistant'}
      <button
        class="sidebar-action-btn ai-toolbar-btn ai-text-trigger ai-file-trigger"
        onclick={(evt) => emitAIAssistantToolbarAction('file', evt)}
        aria-label="文件列表"
        title={aiSelectedFileName ? `当前文件：${aiSelectedFileName}` : '文件列表'}
      >
        <span>{aiSelectedFileName || '文件列表'}</span>
      </button>
      {#if aiSubView === 'generate'}
        <button
          class="sidebar-action-btn ai-toolbar-btn ai-text-trigger ai-prompt-trigger"
          onclick={(evt) => emitAIAssistantToolbarAction('prompt-file', evt)}
          aria-label="提示词文件"
          title={aiPromptFilePath || aiPromptFileName || '提示词文件'}
        >
          <span>{aiPromptFileName || '提示词文件'}</span>
        </button>
        <button
          class="sidebar-action-btn ai-toolbar-btn ai-text-trigger ai-model-trigger"
          onclick={(evt) => emitAIAssistantToolbarAction('model', evt)}
          aria-label="AI模型"
          title={aiModelTitle || 'AI模型'}
        >
          <span>{aiModelLabel || 'AI模型'}</span>
        </button>
      {:else}
        <button
          class="sidebar-action-btn ai-toolbar-btn ai-text-trigger ai-parse-trigger"
          onclick={(evt) => emitAIAssistantToolbarAction('parse-template', evt)}
          aria-label="解析模板"
          title={aiParsePresetName || '解析模板'}
        >
          <span>{aiParsePresetName || '解析模板'}</span>
        </button>
      {/if}
      <button
        class="sidebar-action-btn ai-toolbar-btn ai-text-trigger ai-history-trigger"
        class:disabled={aiHistoryCount === 0}
        onclick={(evt) => emitAIAssistantToolbarAction('history', evt)}
        aria-label="历史记录"
        title={aiHistoryCount > 0 ? `最近 ${aiHistoryCount} 次生成记录` : '暂无生成记录'}
      >
        <span>历史记录</span>
      </button>
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
          aria-label="关联当前文档"
        >
          <EnhancedIcon name={cardDocumentFilterMode === 'current' ? 'file-text' : 'file'} size={16} />
        </button>
        <button
          class="sidebar-action-btn card-toolbar-btn"
          class:active={cardEnableLocationJump}
          onclick={() => emitCardManagementToolbarAction('toggle-card-location-jump')}
          aria-label="定位模式"
        >
          <EnhancedIcon name="bullseye" size={16} />
        </button>
        {/if}
        {#if !isInSidebarMode}
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={cardDataSource === 'memory'}
            onclick={() => {
              onCardDataSourceChange?.('memory');
            }}
            aria-label="记忆牌组"
          >
            <ObsidianIcon name="graduation-cap" size={16} />
            <span class="card-toolbar-btn-label">记忆</span>
          </button>
          {#if shouldShowPremiumEntry(PREMIUM_FEATURES.QUESTION_BANK)}
            <button
              class="sidebar-action-btn card-toolbar-btn"
              class:active={cardDataSource === 'questionBank'}
              onclick={() => {
                onCardDataSourceChange?.('questionBank');
              }}
              aria-label="考试题组"
            >
              <ObsidianIcon name="clipboard-list" size={16} />
              <span class="card-toolbar-btn-label">题组</span>
            </button>
          {/if}
          {#if shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)}
            <button
              class="sidebar-action-btn card-toolbar-btn"
              class:active={cardDataSource === 'incremental-reading'}
              onclick={() => {
                onCardDataSourceChange?.('incremental-reading');
              }}
              aria-label="增量阅读"
            >
              <ObsidianIcon name="bookmark" size={16} />
              <span class="card-toolbar-btn-label">阅读</span>
            </button>
          {/if}
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'table' && cardDataSource === 'memory' && cardTableViewMode === 'basic'}
            class:is-hidden-slot={!(currentView === 'table' && cardDataSource === 'memory')}
            onclick={() => emitCardManagementToolbarAction('table-view-basic')}
            aria-label="基础信息模式"
          >
            <ObsidianIcon name="table" size={16} />
            <span class="card-toolbar-btn-label">基础</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'table' && cardDataSource === 'memory' && cardTableViewMode === 'review'}
            class:is-hidden-slot={!(currentView === 'table' && cardDataSource === 'memory')}
            onclick={() => emitCardManagementToolbarAction('table-view-review')}
            aria-label="复习历史模式"
          >
            <ObsidianIcon name="bar-chart-2" size={16} />
            <span class="card-toolbar-btn-label">复习</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'table' && cardDataSource === 'incremental-reading' && cardIRTypeFilter === 'md'}
            class:is-hidden-slot={!(currentView === 'table' && cardDataSource === 'incremental-reading')}
            onclick={() => emitCardManagementToolbarAction('ir-type-md')}
            aria-label="MD文件"
          >
            <ObsidianIcon name="file-text" size={16} />
            <span class="card-toolbar-btn-label">MD</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'table' && cardDataSource === 'incremental-reading' && cardIRTypeFilter === 'pdf'}
            class:is-hidden-slot={!(currentView === 'table' && cardDataSource === 'incremental-reading')}
            onclick={() => emitCardManagementToolbarAction('ir-type-pdf')}
            aria-label="PDF书签"
          >
            <ObsidianIcon name="file" size={16} />
            <span class="card-toolbar-btn-label">PDF</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'grid' && cardGridLayoutMode === 'fixed'}
            class:is-hidden-slot={currentView !== 'grid'}
            onclick={() => emitCardManagementToolbarAction('grid-layout-fixed')}
            aria-label="固定高度"
          >
            <ObsidianIcon name="layout-grid" size={16} />
            <span class="card-toolbar-btn-label">固高</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'grid' && cardGridLayoutMode === 'masonry'}
            class:is-hidden-slot={currentView !== 'grid'}
            onclick={() => emitCardManagementToolbarAction('grid-layout-masonry')}
            aria-label="瀑布流"
          >
            <ObsidianIcon name="panels-top-left" size={16} />
            <span class="card-toolbar-btn-label">瀑布</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'grid' && cardGridLayoutMode === 'timeline'}
            class:is-hidden-slot={currentView !== 'grid'}
            onclick={() => emitCardManagementToolbarAction('grid-layout-timeline')}
            aria-label={getPremiumEntryTitle('时间线布局', PREMIUM_FEATURES.TIMELINE_VIEW)}
            title={getPremiumEntryTitle('时间线布局', PREMIUM_FEATURES.TIMELINE_VIEW)}
          >
            <ObsidianIcon name="history" size={16} />
            <span class="card-toolbar-btn-label">时间线</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'kanban' && cardKanbanLayoutMode === 'compact'}
            class:is-hidden-slot={currentView !== 'kanban'}
            onclick={() => emitCardManagementToolbarAction('kanban-layout-compact')}
            aria-label="紧凑布局"
          >
            <ObsidianIcon name="minimize-2" size={16} />
            <span class="card-toolbar-btn-label">紧凑</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'kanban' && cardKanbanLayoutMode === 'comfortable'}
            class:is-hidden-slot={currentView !== 'kanban'}
            onclick={() => emitCardManagementToolbarAction('kanban-layout-comfortable')}
            aria-label="舒适布局"
          >
            <ObsidianIcon name="square" size={16} />
            <span class="card-toolbar-btn-label">舒适</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:active={currentView === 'kanban' && cardKanbanLayoutMode === 'spacious'}
            class:is-hidden-slot={currentView !== 'kanban'}
            onclick={() => emitCardManagementToolbarAction('kanban-layout-spacious')}
            aria-label="宽松布局"
          >
            <ObsidianIcon name="maximize-2" size={16} />
            <span class="card-toolbar-btn-label">宽松</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            onclick={() => emitCardManagementToolbarAction('open-data-management')}
            aria-label="数据管理"
          >
            <ObsidianIcon name="database" size={16} />
            <span class="card-toolbar-btn-label">数据</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:is-hidden-slot={currentView !== 'table'}
            onclick={(event) => emitCardManagementToolbarAction('open-column-manager', event.currentTarget as HTMLElement)}
            aria-label="字段管理"
          >
            <ObsidianIcon name="columns-2" size={16} />
            <span class="card-toolbar-btn-label">列</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:is-hidden-slot={currentView !== 'kanban'}
            onclick={(event) => emitCardManagementToolbarAction('open-kanban-column-settings', event.currentTarget as HTMLElement)}
            aria-label="看板列设置"
          >
            <ObsidianIcon name="sliders-horizontal" size={16} />
            <span class="card-toolbar-btn-label">列设置</span>
          </button>
          <button
            class="sidebar-action-btn card-toolbar-btn"
            class:is-hidden-slot={!(currentView === 'grid' || currentView === 'kanban')}
            onclick={(event) => emitCardManagementToolbarAction('open-grid-attribute-menu', event.currentTarget as HTMLElement)}
            aria-label="属性选择"
          >
            <ObsidianIcon name="tag" size={16} />
            <span class="card-toolbar-btn-label">属性</span>
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- 中间：彩色圆点 + 插件菜单按钮 -->
  <div class="sidebar-header-center">
    <div class="sidebar-dots-container">
    {#if currentPage === 'deck-study'}
      {#each visibleDeckFilters as filter}
        <button
          class="sidebar-dot"
          class:selected={selectedFilter === filter.id}
          style={getGradientStyle(filter.colorStart, filter.colorEnd)}
          onclick={() => handleDotClick(filter.id)}
          aria-label={filter.name}
          title={filter.name}
        >
          {#if selectedFilter === filter.id}
            <span class="dot-indicator"></span>
          {/if}
        </button>
      {/each}
    {:else if currentPage === 'weave-card-management'}
      {#each visibleCardViewTypes as viewType}
        <button
          class="sidebar-dot"
          class:selected={currentView === viewType.id}
          style={getGradientStyle(viewType.colorStart, viewType.colorEnd)}
          onclick={() => handleDotClick(viewType.id)}
          aria-label={viewType.name}
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
        aria-label="AI制卡"
        title="AI制卡"
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
        aria-label="解析预览"
        title="解析预览"
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
          aria-label={aiSubView === 'generate' ? (aiIsGenerating ? '生成中' : '开始生成') : (aiIsParsing ? '解析中' : '开始解析')}
          title={aiSubView === 'generate' ? (aiIsGenerating ? '生成中' : '开始生成') : (aiIsParsing ? '解析中' : '开始解析')}
        >
          <span>{aiSubView === 'generate' ? (aiIsGenerating ? '生成中' : '开始生成') : (aiIsParsing ? '解析中' : '开始解析')}</span>
        </button>
      </div>
    {:else if currentPage === 'deck-study'}
      <div class="deck-study-header-actions">
        {#if selectedFilter === 'memory'}
          <button
            class="sidebar-action-btn deck-study-toolbar-btn"
            onclick={(event) => emitDeckStudyToolbarAction('open-emergent-rule-groups', event.currentTarget as HTMLElement)}
            aria-label="涌现筛选"
            title="涌现筛选"
          >
            <ObsidianIcon name="filter" size={16} />
          </button>
        {/if}
        {#if deckStudyView === 'kanban'}
          <button
            class="sidebar-action-btn deck-study-toolbar-btn"
            onclick={(evt) => {
              window.dispatchEvent(new CustomEvent('Weave:open-deck-kanban-menu', {
                detail: { x: evt.clientX, y: evt.clientY, filter: selectedFilter }
              }));
            }}
            aria-label="看板设置"
            title="看板设置"
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
              placeholder="搜索卡片..."
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
              placeholder="搜索卡片..."
              aria-label="搜索卡片"
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
            aria-label="新增卡片"
          >
            <ObsidianIcon name="plus" size={16} />
            <span>新增卡片</span>
          </button>
        {/if}
      </div>
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
          placeholder="Search cards..."
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
    gap: 6px;
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

  .sidebar-nav-header.card-management-desktop .card-toolbar-btn {
    width: auto;
    min-width: 0;
    height: 32px;
    padding: 0 10px;
    gap: 6px;
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

  .sidebar-nav-header.card-management-desktop .card-toolbar-btn.active .card-toolbar-btn-label {
    font-weight: 600;
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
