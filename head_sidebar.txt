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
  import { AbstractInputSuggest, Menu, Notice, type App } from 'obsidian';
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import CardSearchInput from '../search/CardSearchInput.svelte';
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from '../../services/premium/PremiumFeatureGuard';
  import { openWeaveMainMenu } from '../../utils/weave-main-menu';
  import { addWeaveNavigationItems } from '../../utils/weave-navigation-menu';

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
  type AIPromptSuggestion = {
    id: string;
    name: string;
    description?: string;
    category: 'official' | 'custom';
  };

  class AIPromptInputSuggest extends AbstractInputSuggest<AIPromptSuggestion> {
    private getItems: () => AIPromptSuggestion[];
    private applyItem: (prompt: AIPromptSuggestion) => void;

    constructor(
      app: App,
      inputEl: HTMLInputElement,
      getItems: () => AIPromptSuggestion[],
      applyItem: (prompt: AIPromptSuggestion) => void
    ) {
      super(app, inputEl);
      this.getItems = getItems;
      this.applyItem = applyItem;
      this.limit = 8;
    }

    getSuggestions(query: string): AIPromptSuggestion[] {
      const normalized = query.trim().toLowerCase();
      const items = this.getItems();
      if (!normalized) return items.slice(0, 8);
      return items.filter((prompt) => {
        const text = `${prompt.name} ${prompt.description ?? ''}`.toLowerCase();
        return text.includes(normalized);
      }).slice(0, 8);
    }

    renderSuggestion(prompt: AIPromptSuggestion, el: HTMLElement): void {
      el.addClass('weave-ai-prompt-suggest-item');

      const row = el.createDiv({ cls: 'weave-ai-prompt-suggest-row' });
      row.createDiv({ text: prompt.name, cls: 'weave-ai-prompt-suggest-title' });
      row.createDiv({ text: prompt.category === 'official' ? '内置' : '自定义', cls: 'weave-ai-prompt-suggest-badge' });

      if (prompt.description) {
        el.createDiv({ text: prompt.description, cls: 'weave-ai-prompt-suggest-desc' });
      }
    }

    selectSuggestion(prompt: AIPromptSuggestion, evt: MouseEvent | KeyboardEvent): void {
      this.applyItem(prompt);
      super.selectSuggestion(prompt, evt);
    }
  }

  interface Props {
    currentPage: string;
    navigationVisibility?: {
      apkgImport?: boolean;
      csvImport?: boolean;
      clipboardImport?: boolean;
      settingsEntry?: boolean;
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
    aiCustomPrompt?: string;
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
    aiCustomPrompt = '',
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
  let aiHistoryCount = $state(0);
  let aiPromptInputValue = $state(untrack(() => aiCustomPrompt));
  let aiSelectedPromptId = $state('');
  let aiSelectedPromptName = $state('');
  let aiPromptSuggestions = $state<AIPromptSuggestion[]>([]);
  let aiPromptInputEl = $state<HTMLInputElement | null>(null);
  let aiPromptSuggest: AIPromptInputSuggest | null = null;
  let aiPromptSuggestInputEl: HTMLInputElement | null = null;
  const cardSearchLabel = '\u641c\u7d22\u5361\u7247';
  const cardSearchPlaceholder = '\u641c\u7d22\u5361\u7247...';
  function applyAIPromptSuggestion(prompt: AIPromptSuggestion) {
    aiPromptInputValue = prompt.name;
    aiSelectedPromptId = prompt.id;
    aiSelectedPromptName = prompt.name;
    window.dispatchEvent(new CustomEvent('Weave:ai-prompt-template-select', {
      detail: { id: prompt.id }
    }));
  }

  function handleAIPromptInput(value: string) {
    aiPromptInputValue = value;
    if (value.trim()) {
      aiSelectedPromptId = '';
      aiSelectedPromptName = '';
    }
    window.dispatchEvent(new CustomEvent('Weave:ai-custom-prompt-change', {
      detail: { value }
    }));
  }

  function clearSelectedAIPrompt() {
    aiPromptInputValue = '';
    aiSelectedPromptId = '';
    aiSelectedPromptName = '';
    window.dispatchEvent(new CustomEvent('Weave:ai-custom-prompt-change', {
      detail: { value: '' }
    }));
    aiPromptInputEl?.focus();
  }

  function destroyAIPromptSuggest() {
    aiPromptSuggest?.close();
    aiPromptSuggest = null;
    aiPromptSuggestInputEl = null;
  }

  function syncAIPromptSuggestPopover() {
    if (!aiPromptInputEl) return;
    const inputEl = aiPromptInputEl;
    window.requestAnimationFrame(() => {
      const popovers = Array.from(document.querySelectorAll('.suggestion-container')) as HTMLElement[];
      const activePopover = popovers.at(-1);
      if (!activePopover) return;
      document
        .querySelectorAll('.weave-ai-prompt-suggest-popover')
        .forEach((el) => el.classList.remove('weave-ai-prompt-suggest-popover'));
      activePopover.classList.add('weave-ai-prompt-suggest-popover');
      const inputRect = inputEl.getBoundingClientRect();
      const width = Math.min(
        Math.max(420, Math.round(inputRect.width)),
        Math.max(280, window.innerWidth - 24)
      );
      activePopover.style.width = `${width}px`;
      activePopover.style.maxWidth = `${width}px`;
      activePopover.style.minWidth = `${width}px`;
    });
  }

  function showNativeAIPromptSuggestions() {
    if (!aiPromptInputEl || !aiPromptSuggest) return;
    aiPromptSuggest.setValue(aiPromptInputEl.value);
    aiPromptInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    syncAIPromptSuggestPopover();
  }

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
    return;

    // 创建 Obsidian 原生菜单
    const menu = new Menu();
    addWeaveNavigationItems(menu, currentPage, onNavigate);

    menu.addSeparator();

    // 牌组学习页面专属功能（仅在牌组学习页面显示）
    if (currentPage === 'deck-study') {
      menu.addItem((item) => {
        item
          .setTitle('切换视图')
          .setIcon('layout-grid')
          .onClick(() => {
            const event = new CustomEvent('show-view-menu', { detail: { event: evt } });
            window.dispatchEvent(event);
          });
      });

      menu.addItem((item) => {
        item
          .setTitle('新建牌组')
          .setIcon('folder-plus')
          .onClick(() => {
            const event = new CustomEvent('create-deck', { detail: { event: evt } });
            document.dispatchEvent(event);
          });
      });
    }

    // 卡片管理页面专属功能（仅在卡片管理页面显示）
    if (currentPage === 'weave-card-management') {
      // 数据源切换子菜单
      menu.addItem((item) => {
        item
          .setTitle('数据源切换')
          .setIcon('database');
        const submenu = (item as any).setSubmenu();
        
        submenu.addItem((subItem: any) => {
          subItem
            .setTitle('记忆牌组')
            .setIcon('brain')
            .setChecked(cardDataSource === 'memory')
            .onClick(() => {
              if (onCardDataSourceChange) {
                onCardDataSourceChange('memory');
              }
              window.dispatchEvent(new CustomEvent('Weave:card-data-source-change', { detail: 'memory' }));
            });
        });
        
        if (shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) {
          submenu.addItem((subItem: any) => {
            const irLocked = !premiumGuard.canUseFeature(PREMIUM_FEATURES.INCREMENTAL_READING);
            subItem
              .setTitle(irLocked ? '增量阅读 (高级)' : '增量阅读')
              .setIcon('book-open')
              .setChecked(cardDataSource === 'incremental-reading')
              .onClick(() => {
                if (onCardDataSourceChange) {
                  onCardDataSourceChange('incremental-reading');
                }
                window.dispatchEvent(new CustomEvent('Weave:card-data-source-change', { detail: 'incremental-reading' }));
              });
          });
        }
        
        if (shouldShowPremiumEntry(PREMIUM_FEATURES.QUESTION_BANK)) {
          submenu.addItem((subItem: any) => {
            const questionBankLocked = !premiumGuard.canUseFeature(PREMIUM_FEATURES.QUESTION_BANK);
            subItem
              .setTitle(questionBankLocked ? '考试题组 (高级)' : '考试题组')
              .setIcon('edit-3')
              .setChecked(cardDataSource === 'questionBank')
              .onClick(() => {
                if (onCardDataSourceChange) {
                  onCardDataSourceChange('questionBank');
                }
                window.dispatchEvent(new CustomEvent('Weave:card-data-source-change', { detail: 'questionBank' }));
              });
          });
        }
      });

      if (shouldShowPremiumEntry(PREMIUM_FEATURES.TIMELINE_VIEW) || currentView === 'grid') {
        const gridLocked = !premiumGuard.canUseFeature(PREMIUM_FEATURES.GRID_VIEW);
        menu.addItem((item) => {
          item
            .setTitle(getPremiumEntryTitle('时间线视图', PREMIUM_FEATURES.TIMELINE_VIEW))
            .setIcon('history')
            .setChecked(currentView === 'grid' && cardGridLayoutMode === 'timeline')
            .onClick(() => {
              if (currentView !== 'grid') {
                onViewChange?.('grid');
                if (gridLocked) {
                  return;
                }
              }

              emitCardManagementToolbarAction('grid-layout-timeline');
            });
        });
      }

      if (isInSidebarMode) {
        menu.addItem((item) => {
          item
            .setTitle('关联当前活动文档')
            .setIcon(cardDocumentFilterMode === 'current' ? 'file-text' : 'file')
            .setChecked(cardDocumentFilterMode === 'current')
            .setDisabled(!cardCurrentActiveDocument)
            .onClick(() => {
              if (cardCurrentActiveDocument) {
                emitCardManagementToolbarAction('toggle-document-filter');
              }
            });
        });

        menu.addItem((item) => {
          item
            .setTitle('定位跳转模式')
            .setIcon('navigation')
            .setChecked(cardEnableLocationJump)
            .onClick(() => {
              emitCardManagementToolbarAction('toggle-card-location-jump');
            });
        });
      }
      
      menu.addSeparator();
    }

    // 仅在牌组学习页面显示这些操作。
    // 它们的事件监听当前挂在 DeckStudyPage 中，在其他页面显示会造成“点击无反应”的误导。
    if (currentPage === 'deck-study') {
      if (isAPKGImportMenuVisible()) {
        menu.addItem((item) => {
          item
            .setTitle('APKG导入')
            .setIcon('package')
            .onClick(() => {
              const event = new CustomEvent('apkg-import', { detail: { event: evt } });
              document.dispatchEvent(event);
            });
        });
      }

      if (isCSVImportMenuVisible() && shouldShowPremiumEntry(PREMIUM_FEATURES.CSV_IMPORT)) {
        menu.addItem((item) => {
          item
            .setTitle(getPremiumEntryTitle('导入CSV文件', PREMIUM_FEATURES.CSV_IMPORT))
            .setIcon('file-text')
            .onClick(() => {
              const event = new CustomEvent('csv-import', { detail: { event: evt } });
              document.dispatchEvent(event);
            });
        });
      }

      if (isClipboardImportMenuVisible() && shouldShowPremiumEntry(PREMIUM_FEATURES.CLIPBOARD_IMPORT)) {
        menu.addItem((item) => {
          item
            .setTitle(getPremiumEntryTitle('粘贴卡片批量导入', PREMIUM_FEATURES.CLIPBOARD_IMPORT))
            .setIcon('clipboard-paste')
            .onClick(() => {
              const event = new CustomEvent('clipboard-import', { detail: { event: evt } });
              document.dispatchEvent(event);
            });
        });
      }

      menu.addSeparator();

      // 操作管理子菜单
      menu.addItem((item) => {
        item.setTitle('操作管理').setIcon('more-horizontal');
        const operationSub = (item as any).setSubmenu();

        operationSub.addItem((subItem: any) => {
          subItem
            .setTitle('恢复官方教程牌组')
            .setIcon('book-open')
            .onClick(() => {
              document.dispatchEvent(new CustomEvent('Weave:restore-guide-deck'));
            });
        });
      });

    }

    // 显示菜单
    menu.showAtMouseEvent(evt);
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

  function emitAIAssistantToolbarAction(action: 'file' | 'generate' | 'tools' | 'history', evt: MouseEvent) {
    const anchor = evt.currentTarget instanceof HTMLElement ? evt.currentTarget.getBoundingClientRect() : null;
    window.dispatchEvent(new CustomEvent('Weave:ai-toolbar-action', {
      detail: {
        action,
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
    const handleAISelectedFileChange = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      aiSelectedFileName = detail?.name?.trim() || '';
    };

    const handleAIHistoryStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      aiHistoryCount = Math.max(0, detail?.count ?? 0);
    };

    const handleAIPromptStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{
        templates?: AIPromptSuggestion[];
        selectedPromptId?: string;
        selectedPromptName?: string;
        customPrompt?: string;
      }>).detail;
      aiPromptSuggestions = detail?.templates ?? [];
      aiSelectedPromptId = detail?.selectedPromptId?.trim() ?? '';
      aiSelectedPromptName = detail?.selectedPromptName?.trim() ?? '';
      aiPromptInputValue = detail?.customPrompt?.trim()
        ? detail.customPrompt
        : (aiSelectedPromptName || '');
      syncAIPromptSuggestPopover();
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

    window.addEventListener('Weave:ai-selected-file-change', handleAISelectedFileChange as EventListener);
    window.addEventListener('Weave:ai-history-state-change', handleAIHistoryStateChange as EventListener);
    window.addEventListener('Weave:ai-prompt-state-change', handleAIPromptStateChange as EventListener);
    window.addEventListener('Weave:card-management-toolbar-state', handleCardToolbarState as EventListener); 
 
    return () => { 
      window.removeEventListener('Weave:ai-selected-file-change', handleAISelectedFileChange as EventListener);
      window.removeEventListener('Weave:ai-history-state-change', handleAIHistoryStateChange as EventListener);
      window.removeEventListener('Weave:ai-prompt-state-change', handleAIPromptStateChange as EventListener);
      window.removeEventListener('Weave:card-management-toolbar-state', handleCardToolbarState as EventListener); 
      destroyAIPromptSuggest();
    }; 
  }); 

  $effect(() => {
    if (currentPage !== 'ai-assistant' || !app || !aiPromptInputEl) {
      destroyAIPromptSuggest();
      return;
    }

    if (aiPromptSuggest && aiPromptSuggestInputEl === aiPromptInputEl) return;

    destroyAIPromptSuggest();
    aiPromptSuggest = new AIPromptInputSuggest(
      app,
      aiPromptInputEl,
      () => aiPromptSuggestions,
      (prompt) => applyAIPromptSuggestion(prompt)
    );
    aiPromptSuggestInputEl = aiPromptInputEl;
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
        class="sidebar-action-btn ai-toolbar-btn ai-file-trigger"
        onclick={(evt) => emitAIAssistantToolbarAction('file', evt)}
        aria-label="文件列表"
        title={aiSelectedFileName ? `当前文件：${aiSelectedFileName}` : '文件列表'}
      >
        <ObsidianIcon name="file-text" size={16} />
        <span>{aiSelectedFileName || '文件列表'}</span>
      </button>
      <button
        class="sidebar-action-btn ai-toolbar-btn ai-history-trigger"
        class:disabled={aiHistoryCount === 0}
        onclick={(evt) => emitAIAssistantToolbarAction('history', evt)}
        aria-label="历史记录"
        title={aiHistoryCount > 0 ? `最近 ${aiHistoryCount} 次生成记录` : '暂无生成记录'}
      >
        <ObsidianIcon name="history" size={16} />
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
  <div class="sidebar-dots-container" class:collapsed={currentPage === 'ai-assistant'}>
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
    {:else}
      <div class="sidebar-dots-placeholder"></div>
    {/if}

  </div>

  <!-- 右侧：占位符（保持布局平衡） -->
  <div class="sidebar-header-actions" class:ai-assistant-actions={currentPage === 'ai-assistant'}>
    {#if currentPage === 'ai-assistant'}
      <div class="ai-header-actions">
        <div class="ai-toolbar-prompt-shell">
          <div class="ai-toolbar-prompt-input">
            <input
              bind:this={aiPromptInputEl}
              type="text"
              placeholder="或输入自定义提示词..."
              aria-label="自定义提示词"
              value={aiPromptInputValue}
              onclick={() => showNativeAIPromptSuggestions()}
              onfocus={() => showNativeAIPromptSuggestions()}
              oninput={(evt) => {
                const value = (evt.currentTarget as HTMLInputElement).value;
                handleAIPromptInput(value);
              }}
            />
          </div>
          {#if aiSelectedPromptId && aiSelectedPromptName}
            <div class="ai-toolbar-prompt-status">
              <span class="ai-toolbar-prompt-status-label">已选</span>
              <span class="ai-toolbar-prompt-status-name" title={aiSelectedPromptName}>{aiSelectedPromptName}</span>
              <button
                class="ai-toolbar-prompt-clear"
                onclick={clearSelectedAIPrompt}
                aria-label="清除已选提示词"
                title="清除已选提示词"
              >
                清除
              </button>
            </div>
          {/if}
        </div>
        <button
          class="sidebar-action-btn ai-toolbar-btn ai-tools-trigger"
          onclick={(evt) => emitAIAssistantToolbarAction('tools', evt)}
          aria-label="AI菜单"
          title="AI菜单"
        >
          <ObsidianIcon name="sliders" size={16} />
          <span>AI菜单</span>
        </button>
        <button
          class="sidebar-action-btn ai-toolbar-btn primary"
          onclick={(evt) => emitAIAssistantToolbarAction('generate', evt)}
          aria-label="开始生成"
          title="开始生成"
        >
          <ObsidianIcon name="sparkles" size={16} />
          <span>开始生成</span>
        </button>
      </div>
    {:else if currentPage === 'deck-study' && deckStudyView === 'kanban'}
      <button
        class="sidebar-action-btn"
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
    align-items: center;
    padding: 6px 8px;
    background: var(--weave-header-bg);
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
    min-height: 44px;
  }

  .sidebar-nav-header.ai-assistant-layout {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .sidebar-nav-header.card-management-desktop {
    padding: 6px 8px;
    gap: 8px;
    background: var(--weave-header-bg);
    border-bottom: 1px solid var(--background-modifier-border);
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
  }

  .sidebar-header-left.ai-assistant-left {
    flex: 0 0 auto;
    max-width: min(52vw, 560px);
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

  .sidebar-dots-container {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 14px;
    min-width: 0;
    justify-self: center;
  }

  .sidebar-dots-container.collapsed {
    flex: 0 0 0;
    width: 0;
    min-width: 0;
    overflow: hidden;
    gap: 0;
  }

  .sidebar-dots-placeholder {
    height: 16px;
  }

  .sidebar-dot {
    position: relative;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    padding: 0;
    outline: none;
    -webkit-tap-highlight-color: transparent;
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
  }

  .sidebar-header-actions.ai-assistant-actions {
    flex: 1 1 auto;
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
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
    flex: 1 1 auto;
    justify-content: flex-end;
    width: 100%;
    overflow: hidden;
    flex-wrap: nowrap;
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
    border-bottom: 1px solid var(--background-modifier-border);
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

  .ai-toolbar-prompt-shell {
    position: relative;
    flex: 1 1 240px;
    min-width: 140px;
    max-width: min(480px, 100%);
  }

  .ai-toolbar-prompt-input { 
    display: flex; 
    align-items: center; 
    width: 100%;
    height: 36px; 
    padding: 0 10px; 
    border-radius: 8px; 
    background: color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary)); 
    border: 1px solid var(--background-modifier-border);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--background-primary) 72%, transparent);
    overflow: hidden;
  } 
 
  .ai-toolbar-prompt-input input { 
    width: 100%; 
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-normal); 
    font-size: 0.85rem; 
  } 

  .ai-toolbar-prompt-input:hover {
    border-color: color-mix(in srgb, var(--interactive-accent) 28%, var(--background-modifier-border));
  }

  .ai-toolbar-prompt-input:focus-within {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--interactive-accent) 14%, transparent);
  }
 
  .ai-toolbar-prompt-input input::placeholder { 
    color: var(--text-muted); 
  } 

  .ai-toolbar-prompt-status {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
    padding: 6px 2px 0;
    min-width: 0;
  }

  .ai-toolbar-prompt-status-label {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: 0.76rem;
    white-space: nowrap;
  }

  .ai-toolbar-prompt-status-name {
    min-width: 0;
    color: var(--text-normal);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ai-toolbar-prompt-clear {
    flex: 0 0 auto;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-muted);
    font-size: 0.74rem;
    cursor: pointer;
  }

  .ai-toolbar-prompt-clear:hover {
    color: var(--text-normal);
    border-color: color-mix(in srgb, var(--interactive-accent) 28%, var(--background-modifier-border));
    background: var(--background-modifier-hover);
  }

  .ai-toolbar-btn {
    width: auto;
    min-width: 0;
    padding: 0 10px;
    gap: 6px;
    border: none;
    border-radius: 8px;
    background: transparent;
    box-shadow: none;
  }

  .ai-toolbar-btn span {
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ai-file-trigger {
    flex: 0 1 260px;
    min-width: 120px;
    max-width: min(32vw, 320px);
    padding: 0 12px;
    justify-content: flex-start;
    gap: 8px;
    color: var(--text-normal);
    overflow: hidden;
  }

  .ai-file-trigger span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-tools-trigger {
    flex: 0 0 auto;
  }

  .ai-history-trigger {
    flex: 0 0 auto;
    color: var(--text-normal);
  }

  @media (max-width: 900px) {
    .sidebar-header-left.ai-assistant-left {
      max-width: min(46vw, 380px);
    }

    .ai-file-trigger {
      flex-basis: 200px;
      max-width: min(28vw, 240px);
      padding: 0 10px;
    }

    .ai-toolbar-prompt-shell {
      flex-basis: 180px;
      max-width: 280px;
    }

    .ai-toolbar-btn span {
      max-width: 72px;
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
      flex-basis: 136px;
      max-width: 28vw;
      padding: 0 8px;
    }

    .ai-toolbar-prompt-shell {
      flex-basis: 120px;
      min-width: 96px;
      max-width: none;
    }

    .ai-toolbar-prompt-input {
      min-height: 40px;
      padding: 0 12px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--background-primary) 86%, transparent);
      border-color: color-mix(in srgb, var(--background-modifier-border) 76%, transparent);
      box-shadow:
        0 8px 20px rgba(0, 0, 0, 0.08),
        inset 0 1px 0 color-mix(in srgb, white 18%, transparent);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .ai-toolbar-prompt-input input {
      font-size: 0.92rem;
    }

    .ai-toolbar-prompt-status {
      padding-top: 4px;
      gap: 6px;
    }

    .ai-toolbar-prompt-status-label,
    .ai-toolbar-prompt-clear {
      font-size: 0.72rem;
    }

    .ai-toolbar-prompt-status-name {
      font-size: 0.76rem;
    }

    .ai-history-trigger span,
    .ai-tools-trigger span,
    .ai-toolbar-btn.primary span {
      display: none;
    }

    .ai-history-trigger,
    .ai-tools-trigger,
    .ai-toolbar-btn.primary {
      padding: 0 8px;
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

  :global(.suggestion-container.weave-ai-prompt-suggest-popover) {
    padding: 8px;
    border-radius: 14px;
  }

  @media (max-width: 640px) {
    :global(.suggestion-container.weave-ai-prompt-suggest-popover) {
      border-radius: 18px;
      padding: 10px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);
    }

    :global(.suggestion-container.weave-ai-prompt-suggest-popover .suggestion-item) {
      padding: 12px 14px;
      border-radius: 12px;
      margin: 3px 0;
    }
  }

  :global(.suggestion-container.weave-ai-prompt-suggest-popover .suggestion) {
    padding: 0;
  }

  :global(.suggestion-container.weave-ai-prompt-suggest-popover .suggestion-item) {
    padding: 10px 12px;
    border-radius: 10px;
    margin: 2px 0;
  }

  :global(.suggestion-container.weave-ai-prompt-suggest-popover .suggestion-item.is-selected) {
    background: var(--background-modifier-hover);
  }

  :global(.suggestion-container .weave-ai-prompt-suggest-item) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 0;
  }

  :global(.suggestion-container .weave-ai-prompt-suggest-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  :global(.suggestion-container .weave-ai-prompt-suggest-title) {
    min-width: 0;
    font-size: 0.88rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-normal);
  }

  :global(.suggestion-container .weave-ai-prompt-suggest-badge) {
    flex: 0 0 auto;
    padding: 2px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 16%, transparent);
    color: var(--text-muted);
    font-size: 0.7rem;
    line-height: 1.2;
  }

  :global(.suggestion-container .weave-ai-prompt-suggest-desc) {
    color: var(--text-muted);
    font-size: 0.8rem;
    line-height: 1.45;
    white-space: normal;
    overflow: hidden;
    line-clamp: 2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
</style>
