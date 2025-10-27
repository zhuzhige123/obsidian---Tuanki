<script lang="ts">
  import type { AnkiDataStorage } from "../../data/storage";
  import type { FSRS } from "../../algorithms/fsrs";
  import type AnkiPlugin from "../../main";

  import type { Card, Deck } from "../../data/types";
  import type { TimeFilterType } from "../../types/time-filter-types";
  import { MarkdownView } from "obsidian";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import EnhancedButton from "../ui/EnhancedButton.svelte";
  import BouncingBallsLoader from "../ui/BouncingBallsLoader.svelte";
  import FloatingMenu from "../ui/FloatingMenu.svelte";
  import TuankiCardTable from "../tables/TuankiCardTable.svelte";
  import KanbanView from "../study/KanbanView.svelte";
  import GridView from "../views/GridView.svelte";
  import MasonryGridView from "../views/MasonryGridView.svelte";
  import SavedFilterBar from "../filters/SavedFilterBar.svelte";
  import TuankiBatchToolbar from "../batch/TuankiBatchToolbar.svelte";
  import BatchTemplateChangeModal from "../modals/BatchTemplateChangeModal.svelte";
  import BatchDeckChangeModal from "../modals/BatchDeckChangeModal.svelte";
  import BatchAddTagsModal from "../modals/BatchAddTagsModal.svelte";
  import BatchRemoveTagsModal from "../modals/BatchRemoveTagsModal.svelte";
  import EditCardModal from "../modals/EditCardModal.svelte";
  import { TempFileManager } from "../../services/temp-file-manager";

  import ColumnManager from "../ui/ColumnManager.svelte";
  import TablePagination from "../ui/TablePagination.svelte";
  import { DEFAULT_COLUMN_ORDER, type ColumnOrder } from "../tables/types/table-types";

  import { ICON_NAMES } from "../../icons/index.js";
  import { onMount } from "svelte";

  import { getCardContentBySide } from "../../utils/helpers";
  import { showNotification } from "../../utils/notifications";
  import type { FieldTemplate } from "../../data/template-types";
  
  // 🆕 源文档路径匹配工具
  import { 
    matchesSourceDocument, 
    filterCardsBySourceDocument,
    extractSourcePath 
  } from "../../utils/source-path-matcher";
  // import { getTriadTemplateService } from "../../services/triad-template-service"; // 暂时注释，已被新系统替代
  // import { OFFICIAL_TRIAD_TEMPLATES } from "../../data/official-triad-templates"; // 暂时注释，已被新系统替代
  import { Notice } from "obsidian";
  import { detectCardQuestionType, getQuestionTypeDistribution } from "../../utils/card-type-utils";
  import { getErrorBookDistribution, getCardErrorLevel } from "../../utils/error-book-utils";
  import type { CardType } from "../../types/newCardParsingTypes";
  import { applyTimeFilter } from "../../utils/time-filter-utils";
  import { batchUpdateCards, mergeUnmappedFields, deleteFields } from "../../services/batch-operation-service";
  import ViewCardModal from "../modals/ViewCardModal.svelte";
  import { migrateCardsErrorTracking, getMigrationStats } from "../../utils/data-migration-utils";
  import { FilterManager } from "../../services/filter-manager";
  import type { FilterConfig, SavedFilter } from "../../types/filter-types";
  
  // 牌组选择器
  import { DeckSelectorStorage } from "../../services/deck-selector-storage";
  
  // 高级功能守卫
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from "../../services/premium/PremiumFeatureGuard";
  import ActivationPrompt from "../premium/ActivationPrompt.svelte";
  import PremiumBadge from "../premium/PremiumBadge.svelte";


  interface Props {
    dataStorage: AnkiDataStorage;
    plugin: AnkiPlugin;
    fsrs: FSRS;
  }

  let { dataStorage, plugin }: Props = $props();

  // 基础状态管理
  let isLoading = $state(true);
  let isViewSwitching = $state(false); // 视图切换加载状态
  let cards = $state<Card[]>([]);
  let selectedCards = $state(new Set<string>());
  let searchQuery = $state("");
  
  // 视图状态（支持持久化）
  let currentView = $state<string>("table"); // table | grid | kanban
  let gridLayout = $state<"fixed" | "masonry">("fixed"); // 网格布局模式
  let kanbanGroupBy = $state<'status' | 'type' | 'priority'>('status'); // 看板分组方式
  let kanbanLayoutMode = $state<'compact' | 'comfortable' | 'spacious'>('comfortable'); // 看板显示密度
  
  // 卡片定位跳转模式（启用后点击卡片跳转到源文档，禁用选中功能）
  let enableCardLocationJump = $state(false);
  
  // 🆕 全局筛选状态（从FilterStateService同步）
  let globalSelectedDeckId = $state<string | null>(null);
  let globalSelectedCardTypes = $state<Set<CardType>>(new Set());
  let globalSelectedPriority = $state<number | null>(null);
  let globalSelectedTags = $state<Set<string>>(new Set());
  let globalSelectedTimeFilter = $state<TimeFilterType>(null);  // 🆕 时间筛选
  
  // 初始化时从localStorage恢复状态
  if (typeof window !== 'undefined') {
    try {
      // 恢复卡片定位跳转模式
      const savedJumpMode = localStorage.getItem('tuanki-card-location-jump-enabled');
      if (savedJumpMode) {
        enableCardLocationJump = JSON.parse(savedJumpMode);
      }
      
      // 恢复视图状态
      const savedView = localStorage.getItem('tuanki-current-view');
      if (savedView && ['table', 'grid', 'kanban'].includes(savedView)) {
        currentView = savedView;
      }
      
      const savedGridLayout = localStorage.getItem('tuanki-grid-layout');
      if (savedGridLayout && ['fixed', 'masonry'].includes(savedGridLayout)) {
        gridLayout = savedGridLayout as "fixed" | "masonry";
      }
      
      const savedKanbanLayout = localStorage.getItem('tuanki-kanban-layout-mode');
      if (savedKanbanLayout && ['compact', 'comfortable', 'spacious'].includes(savedKanbanLayout)) {
        kanbanLayoutMode = savedKanbanLayout as 'compact' | 'comfortable' | 'spacious';
      }
    } catch (error) {
      console.warn('[CardManagement] 恢复状态失败:', error);
    }
  }

  // 监听卡片定位跳转模式变化并持久化
  $effect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tuanki-card-location-jump-enabled', JSON.stringify(enableCardLocationJump));
      } catch (error) {
        console.warn('[CardManagement] 保存定位跳转模式失败:', error);
      }
    }
  });
  
  // 监听视图状态变化并持久化
  $effect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tuanki-current-view', currentView);
      } catch (error) {
        console.warn('[CardManagement] 保存当前视图失败:', error);
      }
    }
  });
  
  $effect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tuanki-grid-layout', gridLayout);
      } catch (error) {
        console.warn('[CardManagement] 保存网格布局失败:', error);
      }
    }
  });
  
  $effect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tuanki-kanban-layout-mode', kanbanLayoutMode);
      } catch (error) {
        console.warn('[CardManagement] 保存看板布局失败:', error);
      }
    }
  });

  // isEditingCard 和 editingCard 已移除，统一使用临时文件编辑器

  // 临时文件编辑相关状态
  let isTempFileEditing = $state(false);
  let tempFileEditingCard = $state<Card | undefined>(undefined);
  let tempFileManager = $state<TempFileManager | null>(null);
  let showColumnManager = $state(false);
  
  // 🆕 查看卡片模态窗状态
  let showViewCardModal = $state(false);
  let viewingCard = $state<Card | undefined>(undefined);
  // showNewCardModal 已移除
  let showBatchTemplateModal = $state(false); // 批量更换模板模态框
  let showBatchDeckModal = $state(false); // 批量更换牌组模态框
  let showBatchAddTagsModal = $state(false); // 批量添加标签模态框
  let showBatchRemoveTagsModal = $state(false); // 批量删除标签模态框
  let filterManager = $state<FilterManager | null>(null);
  let savedFilters = $state<SavedFilter[]>([]);

  // 文档过滤功能状态
  let documentFilterMode = $state<'all' | 'current'>('all'); // 过滤模式
  let currentActiveDocument = $state<string | null>(null); // 当前活动文档路径
  
  // 🆕 侧边栏检测状态
  let isInSidebar = $state(false);
  let viewWidth = $state(0);
  
  // 🆕 工具栏响应式状态
  let toolbarMode = $state<'sidebar' | 'full'>('full');
  let toolbarContainerRef = $state<HTMLElement | null>(null);
  
  // 更多菜单状态
  let showMoreMenu = $state(false);
  let moreButtonElement = $state<HTMLElement | null>(null);

  let allFieldTemplates = $state<FieldTemplate[]>([]);
  let allDecks = $state<Deck[]>([]);
  
  // 高级功能相关状态
  const premiumGuard = PremiumFeatureGuard.getInstance();
  let isPremium = $state(false);
  let showActivationPrompt = $state(false);
  let promptFeatureId = $state('');
  
  // 订阅高级版状态
  $effect(() => {
    const unsubscribe = premiumGuard.isPremiumActive.subscribe(value => {
      isPremium = value;
    });
    return unsubscribe;
  });

  // 分页状态
  let currentPage = $state(1);
  let itemsPerPage = $state(50);

  // 使用 $state + $effect 替代 $derived，避免 reconciliation 错误
  let filteredAndSortedCards = $state<Card[]>([]);
  let totalFilteredItems = $state(0);
  let filteredCards = $state<Card[]>([]);
  
  // 🆕 判断是否有活动的全局筛选
  let hasActiveGlobalFilters = $derived(
    globalSelectedDeckId !== null ||
    globalSelectedCardTypes.size > 0 ||
    globalSelectedPriority !== null ||
    globalSelectedTags.size > 0 ||
    globalSelectedTimeFilter !== null
  );

  // 使用 $effect 来更新筛选和排序后的卡片
  $effect(() => {
    if (!Array.isArray(cards)) {
      filteredAndSortedCards = [];
      return;
    }

    let result = [...cards];

    // 🆕 应用文档筛选（在其他筛选之前）
    if (documentFilterMode === 'current' && currentActiveDocument) {
      result = filterCardsBySourceDocument(result, currentActiveDocument);
      console.log('[CardManagement] 文档筛选:', {
        mode: documentFilterMode,
        activeDoc: currentActiveDocument,
        totalCards: cards.length,
        filteredCount: result.length
      });
    }
    
    // 🆕 应用全局筛选器的筛选条件
    // 1. 牌组筛选
    if (globalSelectedDeckId) {
      result = result.filter(card => card.deckId === globalSelectedDeckId);
      console.log('[CardManagement] 牌组筛选:', {
        deckId: globalSelectedDeckId,
        filteredCount: result.length
      });
    }
    
    // 2. 题型筛选
    if (globalSelectedCardTypes.size > 0) {
      result = result.filter(card => {
        const cardType = detectCardQuestionType(card);
        return globalSelectedCardTypes.has(cardType as unknown as CardType);
      });
      console.log('[CardManagement] 题型筛选:', {
        types: Array.from(globalSelectedCardTypes),
        filteredCount: result.length
      });
    }
    
    // 3. 优先级筛选
    if (globalSelectedPriority !== null) {
      result = result.filter(card => (card.priority || 0) === globalSelectedPriority);
      console.log('[CardManagement] 优先级筛选:', {
        priority: globalSelectedPriority,
        filteredCount: result.length
      });
    }
    
    // 4. 标签筛选（AND逻辑：卡片必须包含所有选中标签）
    if (globalSelectedTags.size > 0) {
      result = result.filter(card => {
        const cardTags = new Set(card.tags || []);
        return Array.from(globalSelectedTags).every(tag => cardTags.has(tag));
      });
      console.log('[CardManagement] 标签筛选:', {
        tags: Array.from(globalSelectedTags),
        filteredCount: result.length
      });
    }
    
    // 🆕 5. 时间筛选
    if (globalSelectedTimeFilter) {
      result = applyTimeFilter(result, globalSelectedTimeFilter);
      console.log('[CardManagement] 时间筛选:', {
        timeFilter: globalSelectedTimeFilter,
        filteredCount: result.length
      });
    }

    // 应用搜索筛选
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(card => {
        const front = getCardContentBySide(card, 'front', allFieldTemplates).toLowerCase();
        const back = getCardContentBySide(card, 'back', allFieldTemplates).toLowerCase();
        return front.includes(query) ||
               back.includes(query) ||
               card.tags?.some(tag => tag.toLowerCase().includes(query));
      });
    }

    // 应用状态筛选
    if (filters.status.size > 0) {
      result = result.filter(card => {
        const statusString = getCardStatusString(card.fsrs.state);
        return filters.status.has(statusString);
      });
    }

    // 应用牌组筛选
    if (filters.decks.size > 0) {
      result = result.filter(card => filters.decks.has(card.deckId));
    }

    // 应用标签筛选
    if (filters.tags.size > 0) {
      result = result.filter(card =>
        card.tags?.some(tag => filters.tags.has(tag))
      );
    }

    // 🆕 应用题型筛选
    if (filters.questionTypes.size > 0) {
      result = result.filter(card => {
        const questionType = detectCardQuestionType(card);
        return filters.questionTypes.has(questionType);
      });
    }

    // 🆕 应用错题集筛选
    if (filters.errorBooks.size > 0) {
      result = result.filter(card => {
        const errorLevel = getCardErrorLevel(card);
        return errorLevel && filters.errorBooks.has(errorLevel);
      });
    }

    // 应用排序
    result.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      // 根据字段获取值
      switch (sortConfig.field) {
        case "front":
          aValue = getCardContentBySide(a, 'front', allFieldTemplates);
          bValue = getCardContentBySide(b, 'front', allFieldTemplates);
          break;
        case "back":
          aValue = getCardContentBySide(a, 'back', allFieldTemplates);
          bValue = getCardContentBySide(b, 'back', allFieldTemplates);
          break;
        case "status":
          aValue = getCardStatusString(a.fsrs.state);
          bValue = getCardStatusString(b.fsrs.state);
          break;
        case "created":
          aValue = new Date(a.created || 0);
          bValue = new Date(b.created || 0);
          break;
        case "modified":
          aValue = new Date(a.modified || 0);
          bValue = new Date(b.modified || 0);
          break;
        case "tags":
          aValue = (a.tags || []).join(" ");
          bValue = (b.tags || []).join(" ");
          break;
        case "obsidian_block_link":
          aValue = a.fields?.obsidian_block_link || "";
          bValue = b.fields?.obsidian_block_link || "";
          break;
        case "source_document":
          aValue = a.fields?.source_document || "";
          bValue = b.fields?.source_document || "";
          break;
        case "uuid":
          aValue = a.uuid || "";
          bValue = b.uuid || "";
          break;
        case "deck":
          aValue = getDeckName(a.deckId);
          bValue = getDeckName(b.deckId);
          break;
        default:
          aValue = "";
          bValue = "";
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    // 更新状态，创建新数组避免引用问题
    filteredAndSortedCards = [...result];
  });

  // 使用 $effect 来更新总数和分页数据
  $effect(() => {
    totalFilteredItems = filteredAndSortedCards.length;

    const startIndex = Math.max(0, (currentPage - 1) * itemsPerPage);
    const endIndex = Math.min(filteredAndSortedCards.length, startIndex + itemsPerPage);

    // 创建新数组避免引用问题
    filteredCards = [...filteredAndSortedCards.slice(startIndex, endIndex)];
  });


  // 列可见性状态
  let columnVisibility = $state({
    front: true,
    back: true,
    status: true,
    deck: true,     // 🆕 新增：牌组列，默认显示
    tags: true,
    priority: true,
    created: true,
    actions: true,
    // 新增字段，默认显示
    uuid: false,  // UUID默认隐藏，避免界面过于复杂
    obsidian_block_link: true,
    source_document: true,
    field_template: true, // 新增：字段模板列，默认显示
    source_document_status: true, // 新增：源文档状态列，默认显示
  });

  // 列顺序状态
  let columnOrder = $state<ColumnOrder>([...DEFAULT_COLUMN_ORDER]);

  function handleVisibilityChange(key: keyof typeof columnVisibility, value: boolean) {
    columnVisibility[key] = value;
    
    // 持久化到 localStorage
    try {
      localStorage.setItem('tuanki-column-visibility', JSON.stringify(columnVisibility));
      console.log('[CardManagement] 列可见性设置已保存');
    } catch (error) {
      console.error('[CardManagement] 保存列可见性设置失败:', error);
    }
  }

  function handleOrderChange(newOrder: ColumnOrder) {
    columnOrder = newOrder;
    
    // 持久化到 localStorage
    try {
      localStorage.setItem('tuanki-column-order', JSON.stringify(newOrder));
      console.log('[CardManagement] 列顺序已保存:', newOrder);
    } catch (error) {
      console.error('[CardManagement] 保存列顺序失败:', error);
    }
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

  // 使用 $state + $effect 替代 $derived，避免 reconciliation 错误
  let statusCounts = $state<Record<string, number>>({});
  let availableDecks = $state<Array<{id: string, name: string, count: number}>>([]);
  let availableTags = $state<Array<{name: string, count: number}>>([]);
  let questionTypeCounts = $state<Record<string, number>>({});     // 新增：题型统计
  let errorBookCounts = $state<Record<string, number>>({});        // 新增：错题集统计

  // 使用 $effect 来更新统计数据
  $effect(() => {
    if (!Array.isArray(cards)) {
      statusCounts = {};
      availableDecks = [];
      availableTags = [];
      questionTypeCounts = {};
      errorBookCounts = {};
      return;
    }

    // 计算状态统计
    const newStatusCounts = cards.reduce((acc, card) => {
      const status = getCardStatusString(card.fsrs.state);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    statusCounts = newStatusCounts;

    // 计算牌组统计
    const deckMap = new Map<string, number>();
    cards.forEach(card => {
      if (card.deckId) {
        deckMap.set(card.deckId, (deckMap.get(card.deckId) || 0) + 1);
      }
    });
    availableDecks = Array.from(deckMap.entries()).map(([id, count]) => ({
      id,
      name: getDeckName(id),
      count
    }));

    // 计算标签统计
    const tagMap = new Map<string, number>();
    cards.forEach(card => {
      if (card.tags) {
        card.tags.forEach(tag => {
          tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
        });
      }
    });
    availableTags = Array.from(tagMap.entries()).map(([name, count]) => ({
      name,
      count
    })).sort((a, b) => b.count - a.count);

    // 🆕 计算题型统计
    questionTypeCounts = getQuestionTypeDistribution(cards);

    // 🆕 计算错题集统计
    errorBookCounts = getErrorBookDistribution(cards);
  });

  /**
   * 检测当前视图是否在侧边栏
   * 使用Obsidian官方API进行精确检测
   */
  function detectSidebarContext() {
    if (!plugin?.app?.workspace) {
      isInSidebar = false; // 🔧 降级：无法检测时隐藏按钮
      return;
    }
    
    try {
      // ✅ 方法：使用Obsidian官方API检测leaf位置
      const leaves = plugin.app.workspace.getLeavesOfType('anki-view');
      
      if (leaves.length === 0) {
        isInSidebar = false; // 🔧 降级：找不到leaf时隐藏按钮（等待leaf创建）
        console.log('[CardManagement] ⚠️ 未找到anki-view leaf，等待leaf创建');
        return;
      }
      
      const leaf = leaves[0];
      const leafRoot = leaf.getRoot();
      const workspace = plugin.app.workspace;
      
      // 精确判断：leaf不在主编辑区 = 在侧边栏
      const isInMainArea = leafRoot === workspace.rootSplit;
      const newState = !isInMainArea;
      
      // 🔧 仅在状态真正改变时更新（触发Svelte响应式更新）
      if (isInSidebar !== newState) {
        isInSidebar = newState;
        console.log('[CardManagement] 🔄 状态变化:', {
          从: !newState ? '侧边栏' : '主编辑区',
          到: newState ? '侧边栏' : '主编辑区',
          isInSidebar: newState
        });
      }
      
      // 详细调试信息
      console.log('[CardManagement] 🔍 视图位置检测（官方API）:', {
        isInSidebar,
        isInMainArea,
        leafCount: leaves.length,
        判断: isInSidebar ? '✅ 侧边栏 - 显示按钮' : '📝 主编辑区 - 隐藏按钮'
      });
      
    } catch (error) {
      console.error('[CardManagement] ❌ 侧边栏检测失败:', error);
      // 🔧 降级策略：检测失败时隐藏按钮（保守策略）
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

  // 监听活动文档变化
  function setupActiveDocumentListener() {
    if (!plugin?.app?.workspace) return;

    // 获取当前活动文档
    function updateActiveDocument() {
      const activeFile = plugin.app.workspace.getActiveFile();
      currentActiveDocument = activeFile ? activeFile.path : null;
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
    // 保存用户偏好
    localStorage.setItem('tuanki-document-filter-mode', documentFilterMode);
  }

  // 🆕 工具栏模式检测
  function detectToolbarMode() {
    if (!toolbarContainerRef) return;
    
    const width = toolbarContainerRef.clientWidth;
    
    // 判断是否在侧边栏模式
    // 侧边栏宽度通常 < 600px，或者已检测到在侧边栏中
    if (isInSidebar || width < 600) {
      toolbarMode = 'sidebar';
    } else {
      toolbarMode = 'full';
    }
    
    console.log('[Toolbar] 模式检测:', {
      mode: toolbarMode,
      width,
      isInSidebar
    });
  }

  // 关闭更多菜单
  function closeMoreMenu() {
    showMoreMenu = false;
  }
  
  // 切换更多菜单
  function toggleMoreMenu() {
    showMoreMenu = !showMoreMenu;
  }

  // 生命周期
  onMount(() => {
    // 🆕 订阅全局筛选状态（从FilterStateService）
    const filterUnsubscribe = plugin.filterStateService?.subscribe((state) => {
      console.log('[CardManagement] 全局筛选状态更新:', state);
      
      // 同步全局筛选状态到本地
      globalSelectedDeckId = state.selectedDeckId;
      globalSelectedCardTypes = new Set(state.selectedCardTypes);
      globalSelectedPriority = state.selectedPriority;
      globalSelectedTags = new Set(state.selectedTags);
      globalSelectedTimeFilter = state.selectedTimeFilter;  // 🆕 同步时间筛选
      
      console.log('[CardManagement] 本地筛选状态已更新:', {
        deckId: globalSelectedDeckId,
        types: Array.from(globalSelectedCardTypes),
        priority: globalSelectedPriority,
        tags: Array.from(globalSelectedTags),
        timeFilter: globalSelectedTimeFilter  // 🆕 日志输出时间筛选
      });
    });
    
    // 🆕 订阅数据同步服务（卡片变更）
    let cardsUnsubscribe: (() => void) | undefined;
    if (plugin.dataSyncService) {
      console.log('[CardManagement] 订阅卡片数据变更通知');
      cardsUnsubscribe = plugin.dataSyncService.subscribe(
        'cards',
        async (event) => {
          console.log('[CardManagement] 卡片数据变更:', event.action, event.ids);
          await loadCards();
        },
        { debounce: 300 }
      );
    }
    
    // 初始化 FilterManager
    filterManager = new FilterManager();
    savedFilters = filterManager.getAllFilters();
    console.log('[CardManagement] FilterManager initialized with', savedFilters.length, 'filters');
    
    // 🆕 延迟初始化侧边栏检测（确保leaf已创建）
    setTimeout(() => {
      detectSidebarContext();
      detectToolbarMode();
    }, 200);
    
    // 🆕 监听窗口大小变化
    const handleResize = () => {
      detectSidebarContext();
      detectToolbarMode();
    };
    window.addEventListener('resize', handleResize);
    
    // 🆕 工具栏宽度检测（使用 ResizeObserver）
    let resizeObserver: ResizeObserver | null = null;
    if (toolbarContainerRef) {
      resizeObserver = new ResizeObserver(() => {
        detectToolbarMode();
      });
      resizeObserver.observe(toolbarContainerRef);
    }
    
    // 🆕 监听布局变化（视图拖动时触发）
    const layoutChangeHandler = () => {
      setTimeout(() => {
        detectSidebarContext();
        detectToolbarMode();
      }, 150);
    };
    plugin.app.workspace.on('layout-change', layoutChangeHandler);
    
    // 🆕 监听活动leaf变化（视图切换时触发）
    const activeLeafChangeHandler = () => {
      setTimeout(() => {
        detectSidebarContext();
        detectToolbarMode();
      }, 150);
    };
    plugin.app.workspace.on('active-leaf-change', activeLeafChangeHandler);
    
    const initializeAsync = async () => {
      loadFieldTemplates();
      allDecks = await dataStorage.getDecks();
      await loadCards();

      // 初始化临时文件管理器
      tempFileManager = new TempFileManager(plugin);

      // 加载文档过滤偏好
      const savedFilterMode = localStorage.getItem('tuanki-document-filter-mode');
      if (savedFilterMode && ['all', 'current'].includes(savedFilterMode)) {
        documentFilterMode = savedFilterMode as typeof documentFilterMode;
      }

      // 加载列可见性设置
      const savedColumnVisibility = localStorage.getItem('tuanki-column-visibility');
      if (savedColumnVisibility) {
        try {
          const parsed = JSON.parse(savedColumnVisibility);
          // 合并保存的设置和默认设置（确保新增字段有默认值）
          columnVisibility = { ...columnVisibility, ...parsed };
          console.log('[CardManagement] 已加载列可见性设置');
        } catch (error) {
          console.error('[CardManagement] 解析列可见性设置失败:', error);
        }
      }

      // 加载列顺序设置
      const savedColumnOrder = localStorage.getItem('tuanki-column-order');
      if (savedColumnOrder) {
        try {
          const parsed = JSON.parse(savedColumnOrder);
          columnOrder = parsed;
          console.log('[CardManagement] 已加载列顺序设置:', parsed);
        } catch (error) {
          console.error('[CardManagement] 解析列顺序设置失败:', error);
        }
      }

      isLoading = false;
    };

    initializeAsync();

    // 设置活动文档监听
    const cleanup = setupActiveDocumentListener();

    // 返回清理函数
    return () => {
      // 🆕 取消订阅全局筛选状态
      if (filterUnsubscribe) {
        filterUnsubscribe();
      }
      
      // 🆕 取消订阅数据同步服务
      if (cardsUnsubscribe) {
        cardsUnsubscribe();
        console.log('[CardManagement] 已取消卡片数据订阅');
      }
      
      window.removeEventListener('resize', handleResize);
      plugin.app.workspace.off('layout-change', layoutChangeHandler);
      plugin.app.workspace.off('active-leaf-change', activeLeafChangeHandler);
      if (resizeObserver) resizeObserver.disconnect();
      if (cleanup) cleanup();
    };
  });

  // 🗑️ 已移除旧的 CustomEvent 监听器（tuanki:refresh-cards）
  // 现在使用 DataSyncService 统一管理数据刷新

  // 数据加载 - 使用新的简化解析系统
  async function loadFieldTemplates() {
    try {
      console.log('✅ [CardManagement] 使用新的简化解析系统，无需预加载模板');
      // 新系统不需要预加载字段模板
      allFieldTemplates = [];

    } catch (error) {
      console.error("❌ [CardManagement] 加载模板失败:", error);
      // 使用新模板系统的默认模板
      allFieldTemplates = [];
      console.warn('⚠️ [CardManagement] 使用新模板系统，等待集成完成');
    }
  }

  async function loadCards() {
    try {
      // 从数据存储中加载卡片
      let allCards: Card[] = await dataStorage.getCards();

      // 🆕 数据迁移：自动迁移旧版错题集数据
      const migrationStats = getMigrationStats(allCards);
      if (migrationStats.needsMigration > 0) {
        console.log(`🔄 检测到 ${migrationStats.needsMigration} 张卡片需要迁移错题集数据`);
        allCards = migrateCardsErrorTracking(allCards);
        console.log('✅ 错题集数据迁移完成');
        
        // 可选：将迁移后的数据保存回数据库
        // 这里暂时不自动保存，避免影响性能
        // 如果需要持久化，可以在后台异步保存
      }

      cards = allCards;

      console.log(`📊 已加载 ${cards.length} 张卡片`);
    } catch (error) {
      console.error("❌ 加载卡片失败:", error);
      // 显示空状态
      cards = [];
      
      // 显示错误通知
      new Notice(`加载卡片数据失败: ${error instanceof Error ? error.message : '未知错误'}`, 5000);
    }
  }


  // 获取牌组名称
  function getDeckName(deckId: string): string {
    // 从allDecks数据中获取正确的牌组名称
    const deck = allDecks.find(d => d.id === deckId);
    return deck?.name || deckId;
  }

  // 将 Card 转换为表格显示格式
  function transformCardsForTable(cards: Card[]) {
    return cards.map(card => ({
      ...card,
      front: getCardContentBySide(card, 'front', allFieldTemplates, " / "),
      back: getCardContentBySide(card, 'back', allFieldTemplates, " / "),
      status: getCardStatusString(card.fsrs.state),
      nextReview: card.fsrs.due,
      sourceDocumentStatus: getSourceDocumentStatus(card)
    }));
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
  // ✅ 遵循卡片数据结构规范 v1.0：使用专用字段 card.sourceFile
  function getSourceDocumentStatus(card: Card): string {
    // 优先使用专用字段 card.sourceFile
    if (card.sourceFile) {
      const file = plugin.app.vault.getAbstractFileByPath(card.sourceFile);
      if (file) {
        return "存在";
      } else {
        return "已删除";
      }
    }
    
    // 向后兼容：检查旧的customFields字段
    if (card.customFields?.obsidianFilePath) {
      const filePath = card.customFields.obsidianFilePath as string;
      if (filePath && typeof filePath === 'string' && plugin.app.vault.getAbstractFileByPath(filePath)) {
        return "存在";
      } else {
        return "已删除";
      }
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
  async function jumpToSourceDocument(card: Card) {
    try {
      let filePath: string | undefined;
      let blockId: string | undefined;
      
      // ✅ 优先使用专用字段
      if (card.sourceFile) {
        filePath = card.sourceFile;
        blockId = card.sourceBlock?.replace(/^\^/, ''); // 移除^前缀
      } else if (card.customFields?.obsidianFilePath) {
        // 向后兼容
        filePath = card.customFields.obsidianFilePath as string;
        blockId = card.customFields.blockId as string;
      }
      
      if (!filePath) {
        new Notice('此卡片没有关联的源文档');
        return;
      }
      
      const file = plugin.app.vault.getAbstractFileByPath(filePath);
      if (!file) {
        new Notice('源文档已被删除');
        return;
      }
      
      // 打开文件
      const leaf = plugin.app.workspace.getLeaf(false);
      await leaf.openFile(file as any);
      
      // 如果有blockId，跳转到指定块并高亮
      if (blockId) {
        const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
          const content = await plugin.app.vault.read(file as any);
          const lines = content.split('\n');
          
          // 查找包含blockId的行
          let targetLine = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`^${blockId}`)) {
              targetLine = i;
              break;
            }
          }
          
          if (targetLine >= 0) {
            // 跳转到该行
            view.editor.setCursor({ line: targetLine, ch: 0 });
            view.editor.scrollIntoView({ from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } }, true);
            
            // 高亮显示该行
            const lineContent = lines[targetLine];
            // 查找实际内容（排除blockId部分）
            const blockIdMatch = lineContent.match(/\s*\^\w+$/);
            const contentEnd = blockIdMatch ? lineContent.length - blockIdMatch[0].length : lineContent.length;
            
            view.editor.setSelection(
              { line: targetLine, ch: 0 },
              { line: targetLine, ch: contentEnd }
            );
            
            new Notice('已跳转到源文档');
          } else {
            new Notice('无法找到源文本块');
          }
        }
      } else {
        new Notice('已打开源文档');
      }
    } catch (error) {
      console.error('[CardManagement] 跳转到源文档失败:', error);
      new Notice('跳转失败');
    }
  }

  // 🆕 清除所有全局筛选
  function clearGlobalFilters() {
    plugin.filterStateService?.clearAll();
    new Notice('已清除所有筛选');
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
          await plugin.dataStorage.saveCard(updatedCard);
          return updatedCard;
        })
      );

      // 重新加载卡片数据
      await loadCards();
      
      // 🗑️ 已移除旧的 CustomEvent 触发（tuanki:refresh-decks）
      // 现在通过 DataSyncService 在 saveCard 时自动通知

      new Notice(`已更新 ${updatedCards.length} 张卡片的源文档状态`);
    } catch (error) {
      console.error('更新源文档状态失败:', error);
      new Notice('更新源文档状态失败');
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
        const fields = (card as any).fields || {};
        const link: string | undefined = fields.obsidian_block_link;
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
          const fileName = typeof fields.source_document === 'string' ? fields.source_document : undefined;
          if (fileName) filePath = findFileByName(fileName)?.path;
          if (!filePath && typeof fields.source_file === 'string') filePath = fields.source_file;
        }

        if (!filePath) return '无源文档';
        if (!blockId) return '缺失';

        const f = plugin.app.vault.getAbstractFileByPath(filePath);
        if (!f) return '缺失';
        const content = await plugin.app.vault.read(f as any);
        const re = new RegExp(`\\^${blockId}(?![A-Za-z0-9_-])`);
        return re.test(content) ? '存在' : '缺失';
      } catch (e) {
        console.warn('[Scan] 检查卡片失败', e);
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
      new (window as any).Notice(`扫描完成：存在 ${exist}，缺失 ${missing}，无源文档 ${none}`);
    } catch {
      console.log(`扫描完成：存在 ${exist}，缺失 ${missing}，无源文档 ${none}`);
    }
  }


  // 搜索功能
  function handleSearch(query: string) {
    searchQuery = query;
    // 响应式系统会自动更新 filteredAndSortedCards 和 filteredCards
  }

  // 筛选功能
  function handleFilterChange(data: { type: string; value: string; checked: boolean }) {
    const { type, value, checked } = data;

    // 🔧 支持所有筛选类型
    if (type === 'status' || type === 'decks' || type === 'tags' || type === 'questionTypes' || type === 'errorBooks') {
      if (checked) {
        filters[type].add(value);
      } else {
        filters[type].delete(value);
      }
      filters = { ...filters }; // 触发响应式更新
    }
    // 响应式系统会自动更新 filteredAndSortedCards 和 filteredCards
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
    showNotification('筛选器已删除', 'success');
  }

  function handleUpdateSavedFilter(filter: SavedFilter) {
    if (!filterManager) return;
    
    filterManager.updateFilter(filter.id, filter);
    savedFilters = filterManager.getAllFilters();
    showNotification('筛选器已更新', 'success');
  }

  // 排序功能
  function handleSort(field: string) {
    if (sortConfig.field === field) {
      sortConfig.direction = sortConfig.direction === "asc" ? "desc" : "asc";
    } else {
      sortConfig.field = field;
      sortConfig.direction = "desc";
    }
    // 响应式系统会自动更新 filteredAndSortedCards 和 filteredCards
  }


  // 选择功能
  function handleCardSelect(cardId: string, selected: boolean) {
    const newSelectedCards = new Set(selectedCards);
    if (selected) {
      newSelectedCards.add(cardId);
    } else {
      newSelectedCards.delete(cardId);
    }
    selectedCards = newSelectedCards; // 创建新的 Set 实例
  }

  function handleSelectAll(selected: boolean) {
    if (selected) {
      // 创建 filteredCards 的稳定副本，避免在状态变化过程中访问
      const currentFilteredCards = [...filteredCards];
      const visibleCardIds = currentFilteredCards.map(card => card.id);
      selectedCards = new Set(visibleCardIds);
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


  // 批量操作事件处理
  function handleBatchChangeDeck() {
    const selectedCardIds = Array.from(selectedCards);
    console.log("更换牌组:", selectedCardIds);

    if (selectedCardIds.length === 0) {
      new Notice("请先选择要更换牌组的卡片");
      return;
    }

    // 打开批量更换牌组模态框
    showBatchDeckModal = true;
  }

  function handleBatchChangeTemplate() {
    const selectedCardIds = Array.from(selectedCards);
    console.log("更换模板:", selectedCardIds);

    if (selectedCardIds.length === 0) {
      showNotification("请先选择要更换模板的卡片", "warning");
      return;
    }

    // 打开批量更换模板模态框
    showBatchTemplateModal = true;
  }

  function handleBatchCopy() {
    const selectedCardIds = Array.from(selectedCards);
    console.log("批量复制:", selectedCardIds);

    if (selectedCardIds.length === 0) {
      new Notice("请先选择要复制的卡片");
      return;
    }

    // 获取选中的卡片数据
    const selectedCardData = filteredCards.filter(card => selectedCardIds.includes(card.id));

    // 创建复制的文本内容
    const copyText = selectedCardData.map(card => {
      const deck = allDecks.find(d => d.id === card.deckId);
      return `正面: ${card.fields?.front || card.fields?.question || ''}
背面: ${card.fields?.back || card.fields?.answer || ''}
标签: ${card.tags?.join(', ') || '无'}
牌组: ${deck?.name || '默认'}
---`;
    }).join('\n');

    // 复制到剪贴板
    navigator.clipboard.writeText(copyText).then(() => {
      new Notice(`已复制 ${selectedCardIds.length} 张卡片到剪贴板`);
    }).catch(() => {
      new Notice("复制失败，请重试");
    });
  }

  function handleBatchAddTags() {
    const selectedCardIds = Array.from(selectedCards);
    console.log("添加标签:", selectedCardIds);

    if (selectedCardIds.length === 0) {
      new Notice("请先选择要添加标签的卡片");
      return;
    }

    // 打开批量添加标签模态框
    showBatchAddTagsModal = true;
  }

  function handleBatchRemoveTags() {
    const selectedCardIds = Array.from(selectedCards);
    console.log("删除标签:", selectedCardIds);

    if (selectedCardIds.length === 0) {
      new Notice("请先选择要删除标签的卡片");
      return;
    }

    // 打开批量删除标签模态框
    showBatchRemoveTagsModal = true;
  }

  async function handleBatchDelete() {
    const selectedCardIds = Array.from(selectedCards);
    console.log("批量删除:", selectedCardIds);

    if (selectedCardIds.length === 0) {
      new Notice("请先选择要删除的卡片");
      return;
    }

    // 显示确认对话框
    const confirmed = confirm(`确定要删除选中的 ${selectedCardIds.length} 张卡片吗？\n\n此操作不可撤销！`);

    if (confirmed) {
      // 执行批量删除：对每张卡片尝试清理源文档后再删除
      let ok = 0, fail = 0;
      for (const id of selectedCardIds) {
        const card = cards.find(c => c.id === id);
        if (!card) { fail++; continue; }



        // 直接删除卡片（暂不回写源文档，双向同步已停用）
        try {
          await dataStorage.deleteCard(id);
          ok++;
        } catch {
          fail++;
        }
      }

      new Notice(`已删除 ${ok} 张卡片${fail ? `，失败 ${fail}` : ''}`);

      // 清除选择状态
      handleClearSelection();

      // 刷新数据
      await loadCards();
    }
  }



  // 新建卡片
  function handleCreateCard() {
    plugin.openCreateCardModal(); // 使用复用的CardEditModal
  }


  // 编辑卡片 - 使用临时文件编辑器
  function handleEditCard(cardId: string) {
    handleTempFileEditCard(cardId);
  }

  // 删除卡片（并清理源文档中的 tuanki 元数据与块锚点）
  async function handleDeleteCard(cardId: string) {
    const cardToDelete = cards.find(c => c.id === cardId);
    if (!cardToDelete) return;

    const frontContent = getCardContentBySide(cardToDelete, 'front', allFieldTemplates, " / ");
    const confirmed = confirm(`确定要删除卡片 "${frontContent}" 吗？`);
    if (!confirmed) return;

    // 删除卡片数据
    await dataStorage.deleteCard(cardId);
    await loadCards();
    showNotification('卡片已删除');
  }

  // handleCloseCardEditor 已移除，统一使用临时文件编辑器

  // 临时文件编辑卡片
  function handleTempFileEditCard(cardId: string) {
    console.log('[TuankiCardManagementPage] 开始临时文件编辑:', cardId);
    console.log('[TuankiCardManagementPage] tempFileManager状态:', tempFileManager ? '已初始化' : '未初始化');

    const cardToEdit = cards.find(c => c.id === cardId);
    if (cardToEdit) {
      tempFileEditingCard = { ...cardToEdit };
      isTempFileEditing = true;

      console.log('[TuankiCardManagementPage] 状态设置完成:', {
        isTempFileEditing,
        hasCard: !!tempFileEditingCard,
        hasManager: !!tempFileManager
      });
    } else {
      console.error('[TuankiCardManagementPage] 未找到要编辑的卡片:', cardId);
    }
  }

  // 关闭临时文件编辑器
  function handleCloseTempFileEditor() {
    isTempFileEditing = false;
    tempFileEditingCard = undefined;
  }

  // 临时文件编辑保存完成
  async function handleTempFileEditSave(_updatedCard: Card) {
    try {
      // 刷新卡片列表
      await loadCards();

      // 关闭编辑器
      handleCloseTempFileEditor();

      showNotification("卡片保存成功", "success");
    } catch (error) {
      console.error('临时文件编辑保存失败:', error);
      showNotification("保存失败", "error");
    }
  }

  // 🆕 查看卡片
  function handleViewCard(cardId: string) {
    console.log('[TuankiCardManagement] 查看卡片:', cardId);
    const cardToView = cards.find(c => c.id === cardId);
    if (cardToView) {
      viewingCard = cardToView;
      showViewCardModal = true;
    } else {
      console.error('[TuankiCardManagement] 未找到要查看的卡片:', cardId);
    }
  }

  // 🆕 关闭查看模态窗
  function handleCloseViewCardModal() {
    showViewCardModal = false;
    viewingCard = undefined;
  }

  // 🆕 从查看模态窗跳转到编辑
  function handleViewCardEdit(card: Card) {
    // 关闭查看模态窗
    handleCloseViewCardModal();
    // 打开编辑模态窗
    handleTempFileEditCard(card.id);
  }

  // 🆕 从查看模态窗删除卡片
  async function handleViewCardDelete(cardId: string) {
    // 关闭查看模态窗
    handleCloseViewCardModal();
    // 执行删除
    await handleDeleteCard(cardId);
  }

  // 新建卡片相关方法已移除

  // 处理批量更换模板确认
  async function handleBatchTemplateChangeConfirm(result: {
    targetTemplateId: string;
    fieldMappings: Array<{sourceField: string; targetField: string; sourceValue?: string}>;
    unmappedFieldHandling: {
      mode: 'delete' | 'merge';
      mergeTargetField?: string;
    };
  }) {
    const { targetTemplateId, fieldMappings, unmappedFieldHandling } = result;
    const selectedCardIds = Array.from(selectedCards);

    try {
      console.log('🔄 开始批量更换模板:', {
        targetTemplateId,
        cardCount: selectedCardIds.length,
        fieldMappings,
        unmappedFieldHandling
      });

      // 获取目标模板
      const targetTemplate = allFieldTemplates.find(t => t.id === targetTemplateId);
      if (!targetTemplate) {
        showNotification("目标模板不存在", "error");
        return;
      }

      // 获取要更新的卡片
      const cardsToUpdate = cards.filter(c => selectedCardIds.includes(c.id));

      // 使用批量操作服务
      const operationResult = await batchUpdateCards(
        cardsToUpdate,
        (card) => {
          const newFields: Record<string, string> = {};

          // 应用字段映射
          for (const mapping of fieldMappings) {
            if (mapping.targetField && card.fields?.[mapping.sourceField]) {
              newFields[mapping.targetField] = card.fields[mapping.sourceField];
            }
          }

          // 处理未映射字段
          const mappedSourceFields = new Set(fieldMappings.map(m => m.sourceField));
          const unmappedFields: string[] = [];
          
          if (card.fields) {
            for (const key of Object.keys(card.fields)) {
              if (!mappedSourceFields.has(key) && key !== 'templateId' && key !== 'templateName') {
                unmappedFields.push(key);
              }
            }
          }

          if (unmappedFields.length > 0) {
            if (unmappedFieldHandling.mode === 'merge' && unmappedFieldHandling.mergeTargetField) {
              // 合并未映射字段
              const mergedContent = mergeUnmappedFields(
                card,
                unmappedFields,
                unmappedFieldHandling.mergeTargetField
              );
              newFields[unmappedFieldHandling.mergeTargetField] = mergedContent;
            }
            // 如果mode === 'delete'，未映射字段将被自动删除（不添加到newFields）
          }

          // 更新卡片
          return {
            ...card,
            templateId: targetTemplateId,
            fields: {
              ...newFields,
              templateId: targetTemplateId,
              templateName: targetTemplate.name
            },
            modified: new Date().toISOString()
          };
        },
        dataStorage
      );

      // 关闭模态框
      showBatchTemplateModal = false;

      // 清除选择
      handleClearSelection();

      // 显示结果通知
      if (operationResult.failed === 0) {
        showNotification(
          `✅ 成功更换 ${operationResult.success} 张卡片的模板`,
          "success"
        );
      } else {
        showNotification(
          `⚠️ 更换完成：成功 ${operationResult.success} 张，失败 ${operationResult.failed} 张`,
          "warning"
        );
        console.error('[BatchTemplate] 失败详情:', operationResult.errors);
      }

      // 刷新数据
      await loadCards();

    } catch (error) {
      console.error('批量更换模板失败:', error);
      showNotification("❌ 批量更换模板失败", "error");
    }
  }

  // 取消批量更换模板
  function handleBatchTemplateChangeCancel() {
    showBatchTemplateModal = false;
  }

  // 处理批量更换牌组确认
  async function handleBatchDeckChangeConfirm(targetDeckId: string, operationType: 'move' | 'copy' = 'move') {
    const selectedCardIds = Array.from(selectedCards);

    try {
      console.log('🔄 开始批量更换牌组:', {
        targetDeckId,
        operationType,
        cardCount: selectedCardIds.length
      });

      // 获取要更新的卡片
      const cardsToUpdate = cards.filter(c => selectedCardIds.includes(c.id));

      let operationResult: any;

      if (operationType === 'copy') {
        // ✅ 复制操作：创建新卡片副本
        console.log('📋 执行复制操作');
        // 🆕 v0.8: 导入新ID生成器
        const { generateUUID } = require('../../utils/helpers');
        
        const copiedCards = cardsToUpdate.map(card => ({
          ...card,
          id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          uuid: generateUUID(), // 🆕 使用新格式UUID
          deckId: targetDeckId,
          created: new Date().toISOString(),
          modified: new Date().toISOString()
        }));

        // 批量保存新卡片
        let success = 0, failed = 0;
        const errors: any[] = [];
        for (const newCard of copiedCards) {
          try {
            await dataStorage.saveCard(newCard);
            success++;
          } catch (error) {
            failed++;
            errors.push({ card: newCard, error });
          }
        }
        operationResult = { success, failed, errors };
      } else {
        // ✅ 移动操作：修改原卡片的 deckId
        console.log('➡️ 执行移动操作');
        operationResult = await batchUpdateCards(
          cardsToUpdate,
          (card) => ({
            ...card,
            deckId: targetDeckId,
            modified: new Date().toISOString()
          }),
          dataStorage
        );
      }

      // 关闭模态框
      showBatchDeckModal = false;

      // 清除选择
      handleClearSelection();

      // 显示结果通知
      const actionText = operationType === 'copy' ? '复制' : '移动';
      if (operationResult.failed === 0) {
        showNotification(
          `✅ 成功将 ${operationResult.success} 张卡片${actionText}到新牌组`,
          "success"
        );
      } else {
        showNotification(
          `⚠️ ${actionText}完成：成功 ${operationResult.success} 张，失败 ${operationResult.failed} 张`,
          "warning"
        );
        console.error(`[Batch${operationType === 'copy' ? 'Copy' : 'Move'}] 失败详情:`, operationResult.errors);
      }

      // 刷新数据
      await loadCards();

      // 🗑️ 已移除旧的 CustomEvent 触发（tuanki:refresh-decks）
      // 现在通过 DataSyncService 在 saveCard 时自动通知

    } catch (error) {
      console.error('批量更换牌组失败:', error);
      showNotification("❌ 批量更换牌组失败", "error");
    }
  }

  // 取消批量更换牌组
  function handleBatchDeckChangeCancel() {
    showBatchDeckModal = false;
  }

  // 处理批量添加标签确认
  async function handleBatchAddTagsConfirm(tagsToAdd: string[]) {
    const selectedCardIds = Array.from(selectedCards);

    try {
      console.log('🔄 开始批量添加标签:', {
        tags: tagsToAdd,
        cardCount: selectedCardIds.length
      });

      // 获取要更新的卡片
      const cardsToUpdate = cards.filter(c => selectedCardIds.includes(c.id));

      // 使用批量操作服务
      const operationResult = await batchUpdateCards(
        cardsToUpdate,
        (card) => {
          // 合并标签（去重）
          const currentTags = card.tags || [];
          const newTags = [...new Set([...currentTags, ...tagsToAdd])];
          
          return {
            ...card,
            tags: newTags,
            modified: new Date().toISOString()
          };
        },
        dataStorage
      );

      // 关闭模态框
      showBatchAddTagsModal = false;

      // 清除选择
      handleClearSelection();

      // 显示结果通知
      if (operationResult.failed === 0) {
        showNotification(
          `✅ 成功为 ${operationResult.success} 张卡片添加标签`,
          "success"
        );
      } else {
        showNotification(
          `⚠️ 添加完成：成功 ${operationResult.success} 张，失败 ${operationResult.failed} 张`,
          "warning"
        );
        console.error('[BatchAddTags] 失败详情:', operationResult.errors);
      }

      // 刷新数据
      await loadCards();

    } catch (error) {
      console.error('批量添加标签失败:', error);
      showNotification("❌ 批量添加标签失败", "error");
    }
  }

  // 取消批量添加标签
  function handleBatchAddTagsCancel() {
    showBatchAddTagsModal = false;
  }

  // 处理批量删除标签确认
  async function handleBatchRemoveTagsConfirm(tagsToRemove: string[]) {
    const selectedCardIds = Array.from(selectedCards);

    try {
      console.log('🔄 开始批量删除标签:', {
        tags: tagsToRemove,
        cardCount: selectedCardIds.length
      });

      // 获取要更新的卡片
      const cardsToUpdate = cards.filter(c => selectedCardIds.includes(c.id));

      // 使用批量操作服务
      const operationResult = await batchUpdateCards(
        cardsToUpdate,
        (card) => {
          // 过滤掉要删除的标签
          const currentTags = card.tags || [];
          const newTags = currentTags.filter(tag => !tagsToRemove.includes(tag));
          
          return {
            ...card,
            tags: newTags,
            modified: new Date().toISOString()
          };
        },
        dataStorage
      );

      // 关闭模态框
      showBatchRemoveTagsModal = false;

      // 清除选择
      handleClearSelection();

      // 显示结果通知
      if (operationResult.failed === 0) {
        showNotification(
          `✅ 成功从 ${operationResult.success} 张卡片中删除标签`,
          "success"
        );
      } else {
        showNotification(
          `⚠️ 删除完成：成功 ${operationResult.success} 张，失败 ${operationResult.failed} 张`,
          "warning"
        );
        console.error('[BatchRemoveTags] 失败详情:', operationResult.errors);
      }

      // 刷新数据
      await loadCards();

    } catch (error) {
      console.error('批量删除标签失败:', error);
      showNotification("❌ 批量删除标签失败", "error");
    }
  }

  // 取消批量删除标签
  function handleBatchRemoveTagsCancel() {
    showBatchRemoveTagsModal = false;
  }

  // 处理标签更新
  async function handleTagsUpdate(cardId: string, newTags: string[]) {
    try {
      const cardToUpdate = cards.find(c => c.id === cardId);
      if (!cardToUpdate) {
        showNotification('卡片不存在', 'error');
        return;
      }

      // 更新卡片的标签
      const updatedCard = {
        ...cardToUpdate,
        tags: newTags
      };

      // 保存到数据存储
      const result = await dataStorage.saveCard(updatedCard);
      if (!result.success) {
        throw new Error(result.error || '保存失败');
      }

      // 重新加载卡片列表以反映更改
      await loadCards();

      showNotification('标签已更新', 'success');
    } catch (error) {
      console.error('更新标签失败:', error);
      showNotification('更新标签失败', 'error');
    }
  }

  // 处理优先级更新
  async function handlePriorityUpdate(cardId: string, newPriority: number) {
    try {
      const cardToUpdate = cards.find(c => c.id === cardId);
      if (!cardToUpdate) {
        showNotification('卡片不存在', 'error');
        return;
      }

      // 更新卡片的优先级
      const updatedCard = {
        ...cardToUpdate,
        priority: newPriority
      };

      // 保存到数据存储
      const result = await dataStorage.saveCard(updatedCard);
      if (!result.success) {
        throw new Error(result.error || '保存失败');
      }

      // 重新加载卡片列表以反映更改
      await loadCards();

      const priorityText = ['', '低', '中', '高', '紧急'][newPriority] || '中';
      showNotification(`优先级已设置为：${priorityText}`, 'success');
    } catch (error) {
      console.error('更新优先级失败:', error);
      showNotification('更新优先级失败', 'error');
    }
  }


  // 视图切换
  async function switchView(view: string) {
    // 检查高级功能权限
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
    
    console.log('[CardManagement] 视图切换完成:', {
      view,
      duration: Date.now() - startTime
    });
  }
  
  // 处理激活提示关闭
  function handleActivationPromptClose() {
    showActivationPrompt = false;
  }

  // 布局切换处理
  function handleLayoutModeChange(layout: "fixed" | "masonry") {
    gridLayout = layout;
    // ✅ 自动通过 $effect 保存到 localStorage
  }

  // 看板显示密度切换处理
  function handleKanbanLayoutModeChange(layout: "compact" | "comfortable" | "spacious") {
    kanbanLayoutMode = layout;
    // ✅ 自动通过 $effect 保存到 localStorage
  }
  
  // 网格视图卡片点击处理（切换选中状态）
  function handleGridCardClick(card: Card) {
    // 如果启用了定位跳转模式，点击卡片跳转到源文档
    if (enableCardLocationJump) {
      jumpToSourceDocument(card);
      return;
    }
    
    // 否则执行选中/取消选中逻辑
    const newSelectedCards = new Set(selectedCards);
    if (newSelectedCards.has(card.id)) {
      // 已选中 - 取消选中
      newSelectedCards.delete(card.id);
    } else {
      // 未选中 - 选中
      newSelectedCards.add(card.id);
    }
    selectedCards = newSelectedCards;
  }
  
  // 切换卡片定位跳转模式
  function toggleCardLocationJump() {
    enableCardLocationJump = !enableCardLocationJump;
    
    // 切换到跳转模式时，清空已选中的卡片
    if (enableCardLocationJump && selectedCards.size > 0) {
      selectedCards = new Set();
      showNotification('已启用卡片定位跳转模式，点击卡片将跳转到源文档', 'success');
    } else if (enableCardLocationJump) {
      showNotification('已启用卡片定位跳转模式', 'success');
    } else {
      showNotification('已禁用卡片定位跳转模式，恢复卡片选中功能', 'info');
    }
  }
  
  // 网格视图卡片编辑处理
  function handleGridCardEdit(card: Card) {
    handleTempFileEditCard(card.id);
  }
  
  // 网格视图卡片删除处理
  function handleGridCardDelete(card: Card) {
    handleDeleteCard(card.id);
  }
  
  // 网格视图卡片查看处理
  function handleGridCardView(card: Card) {
    handleViewCard(card.id);
  }

  // 看板视图处理函数
  function handleKanbanCardSelect(card: Card) {
    // 打开卡片编辑器
    handleEditCard(card.id);
  }

  function handleKanbanStartStudy(cards: Card[]) {
    // 这里可以集成学习功能，暂时显示通知
    showNotification(`开始学习 ${cards.length} 张卡片`, "info");
  }

  // 看板视图卡片更新（包括新增）
  async function handleKanbanCardUpdate(updatedCard: Card) {
    try {
      // 保存到数据库
      const result = await dataStorage.saveCard(updatedCard);
      if (!result.success) {
        throw new Error(result.error || '保存失败');
      }
      
      // 更新本地状态
      const index = cards.findIndex(c => c.id === updatedCard.id);
      if (index !== -1) {
        // 更新现有卡片
        cards[index] = updatedCard;
        cards = [...cards];
        showNotification('卡片已更新', 'success');
      } else {
        // 新增卡片
        cards = [...cards, updatedCard];
        showNotification('卡片已创建', 'success');
      }
    } catch (error) {
      console.error('保存卡片失败:', error);
      showNotification('保存卡片失败', 'error');
      // 重新加载数据以恢复状态
      await loadCards();
    }
  }

  // 看板视图卡片删除
  async function handleKanbanCardDelete(cardId: string) {
    try {
      // 确认删除
      const cardToDelete = cards.find(c => c.id === cardId);
      if (!cardToDelete) return;
      
      const frontContent = getCardContentBySide(cardToDelete, 'front', allFieldTemplates, " / ");
      const confirmed = confirm(`确定要删除卡片 "${frontContent}" 吗？`);
      if (!confirmed) return;
      
      // 删除卡片
      await dataStorage.deleteCard(cardId);
      
      // 更新本地状态
      cards = cards.filter(c => c.id !== cardId);
      
      showNotification('卡片已删除', 'success');
    } catch (error) {
      console.error('删除卡片失败:', error);
      showNotification('删除卡片失败', 'error');
      // 重新加载数据以恢复状态
      await loadCards();
    }
  }


</script>

<div class="tuanki-card-management-page">
  
  <!-- 加载动画 - 全屏显示 -->
  {#if isLoading || isViewSwitching}
    <div class="initial-loading-overlay">
      <BouncingBallsLoader 
        message={isLoading 
          ? "正在加载卡片数据..." 
          : currentView === 'grid' 
            ? '正在加载网格视图...' 
            : currentView === 'kanban' 
              ? '正在加载看板视图...' 
              : '正在加载表格视图...'
        } 
      />
    </div>
  {:else}

  <!-- 🆕 响应式页面工具栏 -->
  <header class="page-header" bind:this={toolbarContainerRef}>
    <div class="header-actions" class:sidebar-mode={toolbarMode === 'sidebar'}>

      {#if toolbarMode === 'sidebar'}
        <!-- ============================================
             侧边栏模式：紧凑布局
             ============================================ -->
        
        <!-- 更多菜单按钮 -->
        <div class="more-menu-container">
          <button
            bind:this={moreButtonElement}
            class="more-menu-button"
            onclick={toggleMoreMenu}
            aria-label="更多"
            title="更多"
          >
            <EnhancedIcon name="ellipsis-h" size={16} />
          </button>
        </div>
        
        <!-- 文档筛选（侧边栏模式） -->
        <button
          class="toolbar-button"
          class:active={documentFilterMode === 'current'}
          onclick={toggleDocumentFilter}
          disabled={!currentActiveDocument}
          aria-label="文档筛选"
          title={
            !currentActiveDocument 
              ? '请先打开一个文档' 
              : documentFilterMode === 'current'
                ? `仅显示: ${getFileName(currentActiveDocument)}`
                : '显示全部文档'
          }
        >
          <EnhancedIcon name={documentFilterMode === 'current' ? 'file-text' : 'file'} size={16} />
        </button>
        
        <!-- 卡片定位跳转按钮（侧边栏模式） -->
        <button
          class="toolbar-button"
          class:active={enableCardLocationJump}
          onclick={toggleCardLocationJump}
          aria-label="卡片定位跳转"
          title={enableCardLocationJump ? '点击关闭定位跳转（恢复卡片选中功能）' : '点击启用定位跳转（点击卡片将跳转到源文档）'}
        >
          <EnhancedIcon name="bullseye" size={16} />
        </button>

        <!-- 搜索按钮（移到最右侧） -->
        <button
          class="toolbar-button search-button-right"
          onclick={() => {
            console.log('[搜索] 搜索按钮点击');
            const searchInput = document.querySelector('.toolbar-search-input-hidden') as HTMLInputElement;
            if (searchInput) {
              searchInput.style.display = 'block';
              searchInput.style.position = 'absolute';
              searchInput.style.right = '50px';
              searchInput.style.top = '50%';
              searchInput.style.transform = 'translateY(-50%)';
              searchInput.style.width = '220px';
              searchInput.style.zIndex = '1000';
              searchInput.focus();
              console.log('[搜索] 显示并聚焦搜索框');
            } else {
              console.error('[搜索] 未找到搜索输入框');
            }
          }}
          aria-label="搜索"
          title="搜索"
        >
          <EnhancedIcon name="search" size={16} />
        </button>
        
        <!-- 隐藏的搜索输入框（用于侧边栏模式） -->
        <input
          type="search"
          class="toolbar-search-input-hidden"
          placeholder="搜索卡片..."
          bind:value={searchQuery}
          oninput={(e) => handleSearch((e.target as HTMLInputElement).value)}
          onblur={(e) => {
            // 失焦时隐藏（延迟以允许点击事件）
            setTimeout(() => {
              (e.target as HTMLInputElement).style.display = 'none';
            }, 200);
          }}
        />

      {:else}
        <!-- ============================================
             完整模式：展开所有功能
             ============================================ -->
        
        <!-- 视图切换按钮组 -->
        <div class="btn-group view-toggle">
        <EnhancedButton
          variant={currentView === "table" ? "primary" : "secondary"}
          size="sm"
          onclick={() => switchView("table")}
          tooltip="表格视图"
        >
            <EnhancedIcon name="list" size={16} />
        </EnhancedButton>
        <EnhancedButton
          variant={currentView === "grid" ? "primary" : "secondary"}
          size="sm"
          onclick={() => switchView("grid")}
          tooltip="网格视图"
        >
            <EnhancedIcon name="th" size={16} />
        </EnhancedButton>
        <EnhancedButton
          variant={currentView === "kanban" ? "primary" : "secondary"}
          size="sm"
          onclick={() => switchView("kanban")}
          tooltip="看板视图"
        >
          <EnhancedIcon name="columns" size={16} />
          {#if !isPremium}
            <PremiumBadge variant="lock" size="small" />
          {/if}
        </EnhancedButton>
      </div>
      
      <!-- 动态布局模式切换器 -->
      {#if currentView === "grid"}
          <div class="btn-group layout-mode-toggle">
          <EnhancedButton
            variant={gridLayout === "fixed" ? "primary" : "secondary"}
            size="sm"
            onclick={() => handleLayoutModeChange("fixed")}
            tooltip="固定高度"
          >
              <EnhancedIcon name="th" size={16} />
          </EnhancedButton>
          <EnhancedButton
            variant={gridLayout === "masonry" ? "primary" : "secondary"}
            size="sm"
            onclick={() => handleLayoutModeChange("masonry")}
            tooltip="瀑布流"
          >
              <EnhancedIcon name="th-large" size={16} />
          </EnhancedButton>
        </div>
      {:else if currentView === "kanban"}
          <div class="btn-group layout-mode-toggle">
          <EnhancedButton
            variant={kanbanLayoutMode === "compact" ? "primary" : "secondary"}
            size="sm"
            onclick={() => handleKanbanLayoutModeChange("compact")}
            tooltip="紧凑布局"
          >
              <EnhancedIcon name="compress" size={16} />
          </EnhancedButton>
          <EnhancedButton
            variant={kanbanLayoutMode === "comfortable" ? "primary" : "secondary"}
            size="sm"
            onclick={() => handleKanbanLayoutModeChange("comfortable")}
            tooltip="舒适布局"
          >
            <EnhancedIcon name="square" size={16} />
          </EnhancedButton>
          <EnhancedButton
            variant={kanbanLayoutMode === "spacious" ? "primary" : "secondary"}
            size="sm"
            onclick={() => handleKanbanLayoutModeChange("spacious")}
            tooltip="宽敞布局"
          >
              <EnhancedIcon name="expand" size={16} />
          </EnhancedButton>
        </div>
      {/if}

      <!-- 工具操作按钮组 -->
        <div class="btn-group utility-actions">
        <EnhancedButton
          variant="secondary"
          size="sm"
          onclick={handleScanOrphanCards}
          tooltip="扫描孤儿卡片"
        >
            <EnhancedIcon name="refresh" size={16} />
        </EnhancedButton>

          {#if currentView === 'table'}
          <EnhancedButton
            variant="secondary"
            size="sm"
              onclick={() => {
                console.log('[字段管理] 完整模式按钮点击，当前状态:', showColumnManager);
                showColumnManager = !showColumnManager;
                console.log('[字段管理] 新状态:', showColumnManager);
              }}
            tooltip="字段管理"
          >
              <EnhancedIcon name="columns" size={16} />
          </EnhancedButton>
          {:else if currentView === 'kanban'}
            <EnhancedButton
              variant="secondary"
              size="sm"
              onclick={() => {
                // 触发看板视图的列设置
                const kanbanView = document.querySelector('.tuanki-kanban-view');
                if (kanbanView) {
                  const columnButton = kanbanView.querySelector('[title="列设置"]') as HTMLButtonElement;
                  if (columnButton) {
                    columnButton.click();
                  }
                }
              }}
              tooltip="看板列设置"
            >
              <EnhancedIcon name="sliders" size={16} />
            </EnhancedButton>
          {/if}

      <EnhancedButton
            variant={enableCardLocationJump ? "primary" : "secondary"}
            size="sm"
            onclick={toggleCardLocationJump}
            tooltip={enableCardLocationJump ? '关闭定位跳转（恢复卡片选中功能）' : '启用定位跳转（点击卡片将跳转到源文档）'}
          >
            <EnhancedIcon name="bullseye" size={16} />
      </EnhancedButton>
    </div>

        <!-- 新增卡片（完整按钮） -->
        <!-- 搜索框（完整模式 - 移到右侧） -->
      <input
          type="search"
          class="toolbar-search-input search-input-right"
        placeholder="搜索卡片内容、标签..."
        bind:value={searchQuery}
        oninput={(e) => handleSearch((e.target as HTMLInputElement).value)}
        />

        <EnhancedButton
          variant="primary"
          size="md"
          onclick={handleCreateCard}
        >
          <EnhancedIcon name="plus" size={16} />
          新增卡片
        </EnhancedButton>
      {/if}
    </div>
  </header>

  <!-- 更多菜单（使用FloatingMenu） -->
  <FloatingMenu
    bind:show={showMoreMenu}
    anchor={moreButtonElement}
    placement="bottom-end"
    offset={4}
    onClose={closeMoreMenu}
  >
    <div class="more-menu">
      <!-- 视图切换 -->
      <div class="menu-section">
        <div class="menu-section-title">视图</div>
        <button class="menu-item" class:active={currentView === 'table'} onclick={() => { switchView('table'); closeMoreMenu(); }}>
          <EnhancedIcon name={currentView === 'table' ? 'check-circle' : 'circle'} size={14} />
          <span>表格视图</span>
        </button>
        <button class="menu-item" class:active={currentView === 'grid'} onclick={() => { switchView('grid'); closeMoreMenu(); }}>
          <EnhancedIcon name={currentView === 'grid' ? 'check-circle' : 'circle'} size={14} />
          <span>网格视图</span>
        </button>
        <button class="menu-item" class:active={currentView === 'kanban'} class:disabled={!isPremium} onclick={() => { if (isPremium) { switchView('kanban'); closeMoreMenu(); } }}>
          <EnhancedIcon name={currentView === 'kanban' ? 'check-circle' : 'circle'} size={14} />
          <span>看板视图</span>
          {#if !isPremium}
            <PremiumBadge variant="lock" size="small" />
          {/if}
        </button>
      </div>

      <!-- 网格布局选项 -->
      {#if currentView === 'grid'}
        <div class="menu-divider"></div>
        <div class="menu-section">
          <div class="menu-section-title">布局</div>
          <button class="menu-item" class:active={gridLayout === 'fixed'} onclick={() => { handleLayoutModeChange('fixed'); closeMoreMenu(); }}>
            <EnhancedIcon name="th" size={14} />
            <span>固定高度</span>
            {#if gridLayout === 'fixed'}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </button>
          <button class="menu-item" class:active={gridLayout === 'masonry'} onclick={() => { handleLayoutModeChange('masonry'); closeMoreMenu(); }}>
            <EnhancedIcon name="th-large" size={14} />
            <span>瀑布流</span>
            {#if gridLayout === 'masonry'}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </button>
        </div>
      {/if}

      <!-- 看板密度选项 -->
      {#if currentView === 'kanban'}
        <div class="menu-divider"></div>
        <div class="menu-section">
          <div class="menu-section-title">密度</div>
          <button class="menu-item" class:active={kanbanLayoutMode === 'compact'} onclick={() => { handleKanbanLayoutModeChange('compact'); closeMoreMenu(); }}>
            <EnhancedIcon name={kanbanLayoutMode === 'compact' ? 'check-circle' : 'circle'} size={14} />
            <span>紧凑</span>
          </button>
          <button class="menu-item" class:active={kanbanLayoutMode === 'comfortable'} onclick={() => { handleKanbanLayoutModeChange('comfortable'); closeMoreMenu(); }}>
            <EnhancedIcon name={kanbanLayoutMode === 'comfortable' ? 'check-circle' : 'circle'} size={14} />
            <span>舒适</span>
          </button>
          <button class="menu-item" class:active={kanbanLayoutMode === 'spacious'} onclick={() => { handleKanbanLayoutModeChange('spacious'); closeMoreMenu(); }}>
            <EnhancedIcon name={kanbanLayoutMode === 'spacious' ? 'check-circle' : 'circle'} size={14} />
            <span>宽敞</span>
          </button>
        </div>
      {/if}

      <!-- 工具 -->
      <div class="menu-divider"></div>
      <div class="menu-section">
        <div class="menu-section-title">工具</div>
        <button class="menu-item" onclick={() => { handleScanOrphanCards(); closeMoreMenu(); }}>
          <EnhancedIcon name="refresh" size={14} />
          <span>扫描孤儿卡片</span>
        </button>
        <button class="menu-item" onclick={() => { 
          console.log('[字段管理] 按钮点击，当前状态:', showColumnManager);
          showColumnManager = !showColumnManager; 
          console.log('[字段管理] 新状态:', showColumnManager);
          closeMoreMenu(); 
        }}>
          <EnhancedIcon name="columns" size={14} />
          <span>字段管理</span>
        </button>
      </div>
    </div>
  </FloatingMenu>

  <!-- 批量操作工具栏 -->
  <TuankiBatchToolbar
    selectedCount={selectedCards.size}
    visible={selectedCards.size > 0}
    onBatchCopy={handleBatchCopy}
    onBatchChangeDeck={handleBatchChangeDeck}
    onBatchChangeTemplate={handleBatchChangeTemplate}
    onBatchAddTags={handleBatchAddTags}
    onBatchRemoveTags={handleBatchRemoveTags}
    onBatchDelete={handleBatchDelete}
    onClearSelection={handleClearSelection}
  />

  <!-- 主体容器 -->
  <div class="content-container">
    <!-- 主内容区域 -->
    <main class="main-content">
      <!-- 🆕 文档筛选状态指示器 -->
      {#if documentFilterMode === 'current' && currentActiveDocument}
        <div class="filter-status-bar">
          <div class="status-content">
            <span>
              来源：<strong class="doc-name">{getFileName(currentActiveDocument)}</strong>
            </span>
          </div>
          <button 
            class="clear-filter-btn"
            onclick={() => documentFilterMode = 'all'}
            title="显示全部"
          >
            <EnhancedIcon name="x" size={14} />
            显示全部
          </button>
        </div>
      {/if}
      
      <!-- 🆕 全局筛选清除按钮 -->
      {#if hasActiveGlobalFilters}
        <div class="filter-status-bar global-filters">
          <div class="status-content">
            <span>已应用筛选条件</span>
            {#if globalSelectedDeckId}
              <span class="filter-badge">牌组</span>
            {/if}
            {#if globalSelectedCardTypes.size > 0}
              <span class="filter-badge">题型 ({globalSelectedCardTypes.size})</span>
            {/if}
            {#if globalSelectedPriority !== null}
              <span class="filter-badge">优先级</span>
            {/if}
            {#if globalSelectedTags.size > 0}
              <span class="filter-badge">标签 ({globalSelectedTags.size})</span>
            {/if}
            {#if globalSelectedTimeFilter}
              <span class="filter-badge">时间</span>
            {/if}
          </div>
          <button 
            class="clear-filter-btn"
            onclick={clearGlobalFilters}
            title="清除所有筛选"
          >
            <EnhancedIcon name="x" size={14} />
            清除筛选
          </button>
        </div>
      {/if}
      
      {#if currentView === "table"}
        <TuankiCardTable
          cards={transformCardsForTable(filteredCards)}
          {selectedCards}
          columnVisibility={columnVisibility}
          columnOrder={columnOrder}
          onCardSelect={(cardId, selected) => handleCardSelect(cardId, selected)}
          onSelectAll={handleSelectAll}
          onSort={(field) => handleSort(field)}
          onEdit={handleEditCard}
          onDelete={handleDeleteCard}
          onTagsUpdate={handleTagsUpdate}
          onPriorityUpdate={handlePriorityUpdate}
          onTempFileEdit={handleTempFileEditCard}
          onView={handleViewCard}
          onJumpToSource={jumpToSourceDocument}
          {sortConfig}
          loading={isLoading}
          fieldTemplates={allFieldTemplates}
          availableTags={availableTags.map(t => t.name)}
          {plugin}
          decks={allDecks}
        />
        <TablePagination
          {currentPage}
          totalItems={totalFilteredItems}
          {itemsPerPage}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      {:else if currentView === "grid"}
        <!-- 网格视图 -->
        {#if filteredAndSortedCards.length === 0 && !isLoading}
          <!-- 🆕 优化的空状态 -->
          <div class="empty-state-container">
            <div class="empty-state-content">
              <EnhancedIcon name="inbox" size={64} />
              <h3>
                {#if documentFilterMode === 'current'}
                  当前文档暂无卡片
                {:else if searchQuery || filters.status.size > 0 || filters.decks.size > 0 || filters.tags.size > 0}
                  未找到匹配的卡片
                {:else}
                  暂无卡片
                {/if}
              </h3>
              
              {#if documentFilterMode === 'current' && currentActiveDocument}
                <p class="empty-hint">
                  来自 <code>{getFileName(currentActiveDocument)}</code> 的卡片为空
                </p>
                <div class="empty-actions">
                  <EnhancedButton
                    variant="primary"
                    onclick={() => documentFilterMode = 'all'}
                  >
                    <EnhancedIcon name="list" size={16} />
                    查看全部文档的卡片
                  </EnhancedButton>
                  <EnhancedButton
                    variant="secondary"
                    onclick={handleCreateCard}
                  >
                    <EnhancedIcon name="plus" size={16} />
                    在此文档创建卡片
                  </EnhancedButton>
                </div>
              {:else}
                <p class="empty-hint">请添加卡片或调整筛选条件</p>
              {/if}
            </div>
          </div>
        {:else}
          <!-- 正常显示网格视图 -->
        {#if gridLayout === "masonry"}
          <MasonryGridView
            cards={filteredAndSortedCards}
            {selectedCards}
            {plugin}
            onCardClick={handleGridCardClick}
            onCardEdit={handleGridCardEdit}
            onCardDelete={handleGridCardDelete}
            onCardView={handleGridCardView}
            loading={isLoading}
          />
        {:else}
          <GridView
            cards={filteredAndSortedCards}
            {selectedCards}
            {plugin}
            layoutMode={gridLayout}
            onCardClick={handleGridCardClick}
            onCardEdit={handleGridCardEdit}
            onCardDelete={handleGridCardDelete}
            onCardView={handleGridCardView}
            loading={isLoading}
          />
          {/if}
        {/if}
      {:else if currentView === "kanban"}
        <!-- 看板视图 -->
        <KanbanView
          cards={filteredAndSortedCards}
          {dataStorage}
          {plugin}
          decks={allDecks}
          onCardSelect={handleKanbanCardSelect}
          onCardUpdate={handleKanbanCardUpdate}
          onCardDelete={handleKanbanCardDelete}
          onStartStudy={handleKanbanStartStudy}
          groupBy={kanbanGroupBy}
          showStats={true}
          layoutMode={kanbanLayoutMode}
        />
      {/if}
    </main>
  </div>

  <!-- 编辑卡片模态窗 -->
  {#if isTempFileEditing && tempFileEditingCard && tempFileManager}
    <EditCardModal
      bind:open={isTempFileEditing}
      card={tempFileEditingCard}
      {plugin}
      {tempFileManager}
      onSave={handleTempFileEditSave}
      onCancel={handleCloseTempFileEditor}
      onClose={handleCloseTempFileEditor}
    />
  {/if}

  <!-- 新建卡片模态窗已移除，等待重新实现 -->

  <!-- 批量更换模板模态窗 -->
  {#if showBatchTemplateModal}
    <BatchTemplateChangeModal
      open={showBatchTemplateModal}
      selectedCards={Array.from(selectedCards).map(id => cards.find(c => c.id === id)).filter(Boolean) as Card[]}
      fieldTemplates={allFieldTemplates}
      onconfirm={handleBatchTemplateChangeConfirm}
      oncancel={handleBatchTemplateChangeCancel}
    />
  {/if}

  <!-- 批量更换牌组模态窗 -->
  {#if showBatchDeckModal}
    <BatchDeckChangeModal
      open={showBatchDeckModal}
      selectedCards={Array.from(selectedCards).map(id => cards.find(c => c.id === id)).filter(Boolean) as Card[]}
      decks={allDecks}
      onconfirm={handleBatchDeckChangeConfirm}
      oncancel={handleBatchDeckChangeCancel}
    />
  {/if}

  <!-- 批量添加标签模态窗 -->
  {#if showBatchAddTagsModal}
    <BatchAddTagsModal
      open={showBatchAddTagsModal}
      selectedCards={Array.from(selectedCards).map(id => cards.find(c => c.id === id)).filter(Boolean) as Card[]}
      existingTags={availableTags.map(t => t.name)}
      onconfirm={handleBatchAddTagsConfirm}
      oncancel={handleBatchAddTagsCancel}
    />
  {/if}

  <!-- 批量删除标签模态窗 -->
  {#if showBatchRemoveTagsModal}
    <BatchRemoveTagsModal
      open={showBatchRemoveTagsModal}
      selectedCards={Array.from(selectedCards).map(id => cards.find(c => c.id === id)).filter(Boolean) as Card[]}
      onconfirm={handleBatchRemoveTagsConfirm}
      oncancel={handleBatchRemoveTagsCancel}
    />
  {/if}

  <!-- 🆕 查看卡片模态窗 -->
  {#if showViewCardModal && viewingCard}
    <ViewCardModal
      bind:open={showViewCardModal}
      card={viewingCard}
      {plugin}
      allDecks={allDecks}
      onClose={handleCloseViewCardModal}
    />
  {/if}
  
  <!-- 字段管理器（全局，支持侧边栏和完整模式） -->
  {#if showColumnManager}
    <div 
      class="column-manager-overlay"
      role="dialog"
      aria-label="字段管理器"
      tabindex="-1"
      onclick={(e) => {
        // 点击遮罩层关闭
        if (e.target === e.currentTarget) {
          console.log('[字段管理] 点击遮罩层关闭');
          showColumnManager = false;
        }
      }}
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          console.log('[字段管理] 按ESC关闭');
          showColumnManager = false;
        }
      }}
    >
      <div class="column-manager-wrapper">
        <ColumnManager
          visibility={columnVisibility}
          columnOrder={columnOrder}
          onVisibilityChange={handleVisibilityChange}
          onOrderChange={handleOrderChange}
        />
        <button 
          class="column-manager-close"
          onclick={() => {
            console.log('[字段管理] 点击关闭按钮');
            showColumnManager = false;
          }}
          aria-label="关闭"
        >
          <EnhancedIcon name="x" size={20} />
        </button>
      </div>
    </div>
  {/if}
  
  <!-- 高级功能激活提示 -->
  <ActivationPrompt
    featureId={promptFeatureId}
    visible={showActivationPrompt}
    onClose={handleActivationPromptClose}
  />

  {/if}
</div>

<style>
  .tuanki-card-management-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
    overflow: hidden;
    position: relative;
    min-height: 100vh;
  }

  /* 初始加载全屏覆盖层 */
  .initial-loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--background-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
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

  /* ============================================
     🆕 响应式工具栏样式
     ============================================ */

  .page-header {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 12px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    flex-wrap: nowrap;
    transition: gap 0.3s ease;
  }

  /* 侧边栏模式：紧凑间距 */
  .header-actions.sidebar-mode {
    gap: 8px;
  }

  /* ============================================
     按钮组样式
     ============================================ */

  .btn-group {
    display: inline-flex;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    flex-shrink: 0;
  }

  .btn-group :global(.tuanki-btn) {
    border-radius: 0 !important;
    border: none !important;
    border-right: 1px solid var(--background-modifier-border) !important;
  }

  .btn-group :global(.tuanki-btn:last-child) {
    border-right: none !important;
  }

  .btn-group :global(.tuanki-btn--primary) {
    background: var(--tuanki-gradient-primary);
    color: var(--tuanki-text-on-accent);
    border-color: transparent !important;
  }

  /* ============================================
     特定按钮组样式
     ============================================ */

  .view-toggle {
    flex-shrink: 0;
  }

  .layout-mode-toggle {
    flex-shrink: 0;
  }

  .utility-actions {
    flex-shrink: 0;
    position: relative;
  }


  /* ============================================
     工具栏按钮（统一样式）
     ============================================ */

  .toolbar-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toolbar-button:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .toolbar-button:active:not(:disabled) {
    transform: scale(0.95);
  }

  .toolbar-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .toolbar-button.active {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  /* ============================================
     更多菜单容器
     ============================================ */

  .more-menu-container {
    display: inline-flex;
    align-items: center;
  }

  .more-menu-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .more-menu-button:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .more-menu-button:active {
    transform: scale(0.95);
  }

  /* 更多菜单内容 */
  .more-menu {
    padding: 8px;
    min-width: 180px;
  }

  .menu-section {
    margin-bottom: 4px;
  }

  .menu-section:last-child {
    margin-bottom: 0;
  }

  .menu-section-title {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 6px 8px 4px;
    user-select: none;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--text-normal);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.1s ease;
  }

  .menu-item:hover:not(.disabled) {
    background: var(--background-modifier-hover);
  }

  .menu-item.active {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .menu-item.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .menu-item span {
    flex: 1;
  }

  .menu-divider {
    height: 1px;
    background: var(--background-modifier-border);
    margin: 6px 0;
  }

  /* ============================================
     搜索框样式（完整模式）
     ============================================ */

  .toolbar-search-input {
    flex: 0 1 auto;
    min-width: 200px;
    max-width: 300px;
    padding: 6px 12px;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-family: var(--font-interface);
    font-size: 13px;
    transition: all 0.2s ease;
    outline: none;
  }

  .toolbar-search-input:focus {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .toolbar-search-input::placeholder {
    color: var(--text-muted);
  }

  /* 移除默认搜索框样式 */
  .toolbar-search-input::-webkit-search-cancel-button {
    display: none;
  }

  /* 搜索框和按钮右对齐 */
  .search-button-right,
  .search-input-right {
    margin-left: auto;
  }

  /* 隐藏的搜索输入框（侧边栏模式） */
  .toolbar-search-input-hidden {
    display: none;
    padding: 6px 12px;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: var(--font-ui-small);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .toolbar-search-input-hidden:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  /* 字段管理器遮罩层 */
  .column-manager-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ============================================
     动画效果
     ============================================ */

  .header-actions > :global(*) {
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeInUp {
    from { 
      opacity: 0; 
      transform: translateY(4px);
    }
    to { 
      opacity: 1; 
      transform: translateY(0);
    }
  }

  /* ============================================
     响应式适配
     ============================================ */

  /* 侧边栏模式优化 */
  @media (max-width: 600px) {
    .page-header {
      padding: 8px 12px;
    }
    
    .header-actions {
      gap: 6px;
    }
    
    .btn-group {
      gap: 0;
    }
  }

  /* 极窄屏幕 */
  @media (max-width: 400px) {
    .page-header {
      padding: 6px 8px;
    }
    
    .header-actions {
      gap: 4px;
    }
  }

  /* ============================================
     旧样式保留（向后兼容）
     ============================================ */

  /* 内容区域全高度布局 */
  .content-container {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .view-toggle {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--background-modifier-hover);
    border-radius: 0.5rem;
  }

  .layout-mode-toggle {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--background-modifier-hover);
    border-radius: 0.5rem;
  }

  .utility-actions {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--background-modifier-hover);
    border-radius: 0.5rem;
  }

  /* 字段管理器包装器 */
  .column-manager-wrapper {
    position: relative;
    background: var(--background-primary);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
    padding: 16px;
  }

  /* 字段管理器关闭按钮 */
  .column-manager-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    z-index: 1001;
  }

  .column-manager-close:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .column-manager-close:active {
    transform: scale(0.95);
  }

  /* 重复的样式已在上面定义 */


  /* 调整表格容器的边框半径 */
  :global(.tuanki-table-container) {
    border-radius: 0 0 var(--radius-m) var(--radius-m) !important;
    border-top: none !important;
  }

  /* ========== 🆕 文档筛选功能样式 ========== */

  /* 文档筛选控制 */
  /* 筛选状态栏 */
  .filter-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--tuanki-space-sm) var(--tuanki-space-md);
    background: var(--background-secondary);
    border-bottom: 1px solid var(--tuanki-border);
    font-size: var(--tuanki-font-size-sm);
    color: var(--tuanki-text-secondary);
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .status-content {
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-xs);
  }

  .doc-name {
    color: var(--tuanki-accent-color);
    font-weight: 600;
    font-family: monospace;
  }

  .clear-filter-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    background: transparent;
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-sm);
    color: var(--tuanki-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: var(--tuanki-font-size-xs);
  }

  .clear-filter-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--tuanki-accent-color);
    color: var(--tuanki-text-primary);
  }
  
  /* 🆕 筛选标记 */
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
  
  .filter-status-bar.global-filters {
    background: var(--background-primary-alt);
    border-color: var(--interactive-accent);
    border-width: 1px;
  }

  /* 空状态容器 - 使用正常文档流，避免遮挡 */
  .empty-state-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    padding: var(--tuanki-space-xl);
  }

  .empty-state-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--tuanki-space-md);
    text-align: center;
    max-width: 500px;
  }

  .empty-state-content h3 {
    margin: 0;
    font-size: var(--tuanki-font-size-xl);
    font-weight: 600;
    color: var(--tuanki-text-primary);
  }

  .empty-hint {
    margin: 0;
    font-size: var(--tuanki-font-size-sm);
    color: var(--tuanki-text-secondary);
    line-height: 1.6;
  }

  .empty-hint code {
    background: var(--background-modifier-border);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    color: var(--tuanki-accent-color);
  }

  .empty-actions {
    display: flex;
    gap: var(--tuanki-space-sm);
    margin-top: var(--tuanki-space-sm);
  }

  /* 响应式调整 */
  @media (max-width: 768px) {
    .filter-status-bar {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--tuanki-space-xs);
    }
    
    .empty-actions {
      flex-direction: column;
      width: 100%;
    }
  }
</style>

