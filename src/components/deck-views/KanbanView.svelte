<script lang="ts">
  import { logger } from '../../utils/logger';
  import { vaultStorage } from '../../utils/vault-local-storage';

  import { onMount, tick, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { Menu, Notice, type MenuPositionDef } from 'obsidian';
  import type { Deck, Card, DeckStats } from '../../data/types';
  import type { DeckTreeNode } from '../../services/deck/DeckHierarchyService';
  import type { WeaveDataStorage } from '../../data/storage';
  import type AnkiObsidianPlugin from '../../main';
  import type { MemoryDeckLevelProgress } from '../../services/deck/MemoryDeckLevelService';
  import type { EmergentDeckCandidate, FormalDeckBindingSummary, MemoryDeckView } from '../../types/emergent-deck-types';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import DeckGridCard from './DeckGridCard.svelte';
  import ChineseElegantDeckCard from './ChineseElegantDeckCard.svelte';
  import { QuestionBankAnalyticsModalObsidian } from '../modals/QuestionBankAnalyticsModalObsidian';
  import type { DeckCardStyle } from '../../types/plugin-settings.d';
  import { getColorSchemeForDeck } from '../../config/card-color-schemes';
  import { MEMORY_DECK_UI_TEXT } from '../../constants/memory-deck-ui-text';
  
  // 导入牌组聚合服务和类型
  import { DeckAggregationService } from '../../services/deck/DeckAggregationService';
  import type { DeckGroupByType, DeckTagGroup } from '../../types/deck-kanban-types';
  import {
    createDeckTagColumnKey,
    DECK_GROUP_CONFIGS,
    DECK_GROUP_BY_LABELS,
    DECK_TAG_EMPTY_GROUP_KEY,
    DECK_TAG_GROUP_OTHER_KEY,
    getDeckTagLabelFromColumnKey,
    normalizeDeckTagGroup,
    normalizeDeckTagGroupTags
  } from '../../types/deck-kanban-types';
  import { tr } from '../../utils/i18n';
  import { showObsidianConfirm } from '../../utils/obsidian-confirm';
  import { type MemoryDeckMenuAction } from '../../services/deck/MemoryDeckMenu';
  import { PremiumFeatureGuard, PREMIUM_FEATURES, type PremiumFeatureAccessContext } from '../../services/premium/PremiumFeatureGuard';
  import { saveMemoryDeck } from '../../services/weave-domain';
  
  // 导入快速标签组创建器
  import QuickTagGroupCreator from './QuickTagGroupCreator.svelte';
  
  interface Props {
    deckTree: DeckTreeNode[];
    deckStats: Record<string, DeckStats>;
    dataStorage: WeaveDataStorage;
    plugin?: AnkiObsidianPlugin;
    memoryDeckLevels?: Record<string, MemoryDeckLevelProgress>;
    emergentCandidates?: EmergentDeckCandidate[];
    emergentDeckViews?: MemoryDeckView[];
    emergentDeckStats?: Record<string, DeckStats>;
    formalDeckBindingSummary?: Record<string, FormalDeckBindingSummary>;
    memoryDeckDisplayMode?: 'formal' | 'emergent';
    groupBy?: DeckGroupByType;
    deckMode?: 'memory' | 'question-bank' | 'incremental-reading';
    onStartStudy: (deckId: string) => void;
    onStartEmergentStudy?: (deckId: string, deckName: string) => void | Promise<void>;
    onDeckUpdate?: () => void; //  牌组更新回调
    onOpenDeckAnalytics?: (deckId: string) => void;
    onOpenLoadForecast?: (deckId: string) => void;
    onEditDeck?: (deckId: string) => void;
    onDeleteDeck?: (deckId: string) => void;
    onOpenKnowledgeGraph?: (deckId: string) => void;
    onAssociateQuestionBank?: (deckId: string, bankId?: string) => void | Promise<void>;
    getQuestionBankSubmenuData?: (deckId: string) => Promise<{
      banks: Array<{ id: string; name: string; isCurrent: boolean }>;
    } | null>;
    onBeforeOpenDeckMenu?: () => void;
    memoryDeckMenuActionHandler?: (action: MemoryDeckMenuAction, deckId: string) => void | Promise<void>;
    // 引用式牌组系统
    onDissolveDeck?: (deckId: string) => void;
    onPromoteEmergentDeck?: (candidate: EmergentDeckCandidate, event: MouseEvent) => void | Promise<void>;
  }

  type MemoryDeckDisplayMode = 'formal' | 'emergent';

  function normalizeMemoryDeckDisplayMode(mode: MemoryDeckDisplayMode | undefined): MemoryDeckDisplayMode {
    return mode === 'emergent' ? 'emergent' : 'formal';
  }

  //  响应式翻译函数
  let t = $derived($tr);
  
  let { 
    deckTree, 
    deckStats, 
    dataStorage,
    plugin,
    memoryDeckLevels = {},
    emergentCandidates = [],
    emergentDeckViews = [],
    emergentDeckStats = {},
    formalDeckBindingSummary = {},
    memoryDeckDisplayMode = 'formal',
    groupBy: initialGroupBy = 'completion',
    deckMode = 'memory',
    onStartStudy,
    onStartEmergentStudy,
    onDeckUpdate,
    onOpenDeckAnalytics,
    onOpenLoadForecast,
    onEditDeck,
    onDeleteDeck,
    onOpenKnowledgeGraph,
    onAssociateQuestionBank,
    getQuestionBankSubmenuData,
    onBeforeOpenDeckMenu,
    memoryDeckMenuActionHandler,
    // 引用式牌组系统
    onDissolveDeck,
    onPromoteEmergentDeck
  }: Props = $props();
  
  // 状态管理
  let groupBy = $state<DeckGroupByType>(untrack(() => initialGroupBy));
  let groupedDecks = $state<Record<string, Deck[]>>({});
  let isLoading = $state(false);
  let aggregationService: DeckAggregationService;
  const premiumGuard = PremiumFeatureGuard.getInstance();
  const deckStudyFeatureContext: PremiumFeatureAccessContext = { page: 'deck-study' };
  const deckAnalyticsEntryFeatures = [
    PREMIUM_FEATURES.DECK_ANALYTICS,
    PREMIUM_FEATURES.DECK_ANALYTICS_RETENTION,
    PREMIUM_FEATURES.DECK_ANALYTICS_TIMING,
  ] as const;
  
  // 标签组分组相关状态
  let selectedTagGroupId = $state<string | null>(null);
  let showQuickCreator = $state(false);
  let editingTagGroup = $state<DeckTagGroup | undefined>(undefined); // 编辑中的标签组
  
  // 看板配置状态
  let activeKanbanMenu: Menu | null = null;
  let lastKanbanMenuPosition: MenuPositionDef | null = null;
  let questionBankAnalyticsModalInstance: QuestionBankAnalyticsModalObsidian | null = null;
  
  // 列可见性配置
  interface ColumnConfig {
    hidden: string[];             // 隐藏的列
    pinned: string[];             // 固定的列  
    order: string[];              // 列顺序
    hideEmptyGroups: boolean;     // 隐藏空白分组
  }
  
  let columnConfig = $state<ColumnConfig>({
    hidden: [],
    pinned: [],
    order: [],
    hideEmptyGroups: false
  });
  
  // 拖拽状态
  // 拖拽状态管理
  let draggedDeck = $state<Deck | null>(null);
  let dragOverColumn = $state<string | null>(null);
  
  // 获取当前牌组卡片设计样式
  const deckCardStyle = $derived<DeckCardStyle>(
    (plugin?.settings?.deckCardStyle as DeckCardStyle) || 'default'
  );

  //  初始化聚合服务，传入实时统计数据
  aggregationService = untrack(() => new DeckAggregationService(dataStorage, deckStats));
  
  //  监听 deckStats 变化，动态更新服务
  $effect(() => {
    aggregationService.updateDeckStats(deckStats);
  });
  
  // 将牌组树扁平化为列表
  function flattenDeckTree(nodes: DeckTreeNode[]): Deck[] {
    const result: Deck[] = [];
    for (const node of nodes) {
      result.push(node.deck);
      if (node.children.length > 0) {
        result.push(...flattenDeckTree(node.children));
      }
    }
    return result;
  }

  function createVirtualDeck(view: MemoryDeckView): Deck {
    return {
      id: view.id,
      name: view.name,
      description: '',
      category: '默认',
      cardUUIDs: view.cardUUIDs,
      path: view.name,
      level: 0,
      order: 0,
      inheritSettings: false,
      settings: {} as any,
      includeSubdecks: false,
      created: new Date(0).toISOString(),
      modified: new Date().toISOString(),
      stats: emergentDeckStats[view.id] || {
        totalCards: view.cardUUIDs.length,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        todayNew: 0,
        todayReview: 0,
        todayTime: 0,
        totalReviews: 0,
        totalTime: 0,
        memoryRate: 0,
        averageEase: 0,
        forecastDays: {}
      },
      tags: Array.isArray(view.sourceTags) ? view.sourceTags : [],
      metadata: {
        weaveVirtualDeckKind: view.kind,
        statusBadge: view.statusBadge
      },
      purpose: 'memory'
    };
  }
  
  const allFormalDecks = $derived(flattenDeckTree(deckTree));
  const currentMemoryDeckDisplayMode = $derived(normalizeMemoryDeckDisplayMode(memoryDeckDisplayMode));
  const showingEmergentMemoryDecks = $derived(
    deckMode === 'memory' && currentMemoryDeckDisplayMode === 'emergent'
  );
  const emergentDeckViewMap = $derived(new Map(emergentDeckViews.map((view) => [view.id, view])));
  const allDecks = $derived(
    showingEmergentMemoryDecks ? emergentDeckViews.map((view) => createVirtualDeck(view)) : allFormalDecks
  );

  $effect(() => {
    allDecks;
    aggregationService.clearCache();
  });
  
  // 获取选定的标签组
  const selectedTagGroup = $derived((() => {
    if (groupBy === 'tagGroup' && selectedTagGroupId && plugin?.settings.deckTagGroups) {
      const tagGroup = plugin.settings.deckTagGroups.find(tg => tg.id === selectedTagGroupId);
      return tagGroup ? normalizeDeckTagGroup(tagGroup) : null;
    }
    return null;
  })());
  
  // 获取当前分组配置（动态生成标签分组）
  const currentGroupConfig = $derived((() => {
    if (groupBy === 'tag') {
      const tagColumnKeys = Array.from(
        new Set(
          Object.keys(groupedDecks).filter(
            (key) => key === DECK_TAG_EMPTY_GROUP_KEY || getDeckTagLabelFromColumnKey(key) !== null
          )
        )
      );
      
      const tagColors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444'];
      const tagGroups = tagColumnKeys
        .filter((key) => key !== DECK_TAG_EMPTY_GROUP_KEY)
        .sort((left, right) => {
          const leftLabel = getDeckTagLabelFromColumnKey(left) || '';
          const rightLabel = getDeckTagLabelFromColumnKey(right) || '';
          return leftLabel.localeCompare(rightLabel, 'zh-CN');
        })
        .map((key, index) => ({
        key,
        label: getDeckTagLabelFromColumnKey(key) || key,
        color: tagColors[index % tagColors.length],
        icon: 'tag'
      }));
      
      // 添加"无标签"分组
      tagGroups.push({
        key: DECK_TAG_EMPTY_GROUP_KEY,
        label: t('decks.kanban.noTag'),
        color: '#6b7280',
        icon: 'circle'
      });
      
      return {
        title: t('decks.kanban.tagGrouping'),
        icon: 'tag',
        groups: tagGroups
      };
    } else if (groupBy === 'tagGroup' && selectedTagGroup) {
      // 标签组分组
      const tagGroups = normalizeDeckTagGroupTags(selectedTagGroup.tags).map((tag: string) => ({
        key: createDeckTagColumnKey(tag),
        label: tag,
        color: selectedTagGroup.color || '#3b82f6',
        icon: 'tag'
      }));
      
      // 添加"其他"分组
      tagGroups.push({
        key: DECK_TAG_GROUP_OTHER_KEY,
        label: t('decks.kanban.other'),
        color: '#6b7280',
        icon: 'circle'
      });
      
      return {
        title: t('decks.kanban.tagGroupPrefix', { name: selectedTagGroup.name }),
        icon: selectedTagGroup.icon || 'tags',
        groups: tagGroups
      };
    }
    return DECK_GROUP_CONFIGS[groupBy];
  })());
  
  const currentGroupLabel = $derived(DECK_GROUP_BY_LABELS[groupBy]);
  
  // 获取有序的列配置（用于渲染）
  const orderedGroups = $derived((() => {
    const groups = currentGroupConfig.groups;
    
    // 如果有自定义顺序，应用排序
    if (columnConfig.order.length > 0) {
      const currentKeys = groups.map((g: any) => g.key);
      const validOrder = columnConfig.order.filter((key: string) => currentKeys.includes(key));
      const missingKeys = currentKeys.filter((key: string) => !validOrder.includes(key));
      const finalOrder = [...validOrder, ...missingKeys];
      
      // 按照顺序重新排列分组
      return finalOrder.map((key: string) => groups.find((g: any) => g.key === key)).filter((g: any) => g !== undefined)
        .filter((group: any) => {
          // 应用隐藏和空白过滤
          const isHidden = columnConfig.hidden.includes(group.key);
          const isEmpty = (groupedDecks[group.key] || []).length === 0;
          return !isHidden && (!columnConfig.hideEmptyGroups || !isEmpty);
        });
    }
    
    return groups.filter((group: any) => {
      const isHidden = columnConfig.hidden.includes(group.key);
      const isEmpty = (groupedDecks[group.key] || []).length === 0;
      return !isHidden && (!columnConfig.hideEmptyGroups || !isEmpty);
    });
  })());
  
  // 动态分组逻辑
  $effect(() => {
    async function updateGrouping() {
      isLoading = true;
      try {
        // 如果是 tagGroup 分组，传入 selectedTagGroup
        if (groupBy === 'tagGroup') {
          groupedDecks = await aggregationService.groupDecks(allDecks, groupBy, selectedTagGroup || undefined);
        } else {
          groupedDecks = await aggregationService.groupDecks(allDecks, groupBy);
        }
      } catch (error) {
        logger.error('Error grouping decks:', error);
        groupedDecks = {};
      } finally {
        isLoading = false;
      }
    }
    
    updateGrouping();
  });

  function shouldShowDeckAnalyticsEntry(isPremium: boolean, showPremiumFeaturesPreview: boolean): boolean {
    return premiumGuard.shouldShowAnyFeatureEntry(
      [...deckAnalyticsEntryFeatures],
      {
        isPremium,
        showPremiumPreview: showPremiumFeaturesPreview
      },
      deckStudyFeatureContext
    );
  }

  function getDeckAnalyticsEntryTitle(): string {
    return premiumGuard.getAnyFeatureEntryTitle(
      t('decks.menu.deckAnalytics'),
      [...deckAnalyticsEntryFeatures],
      deckStudyFeatureContext
    );
  }

  function hasTagGroupChanged(original: DeckTagGroup, normalized: DeckTagGroup): boolean {
    if (original.name !== normalized.name) return true;
    if (original.tags.length !== normalized.tags.length) return true;
    return original.tags.some((tag, index) => tag !== normalized.tags[index]);
  }

  async function normalizePersistedTagGroupsIfNeeded() {
    if (!plugin?.settings.deckTagGroups?.length) {
      return;
    }

    const normalizedGroups = plugin.settings.deckTagGroups.map((tagGroup) => normalizeDeckTagGroup(tagGroup));
    const hasChanges = normalizedGroups.some((tagGroup, index) => {
      const original = plugin.settings.deckTagGroups?.[index];
      return original ? hasTagGroupChanged(original, tagGroup) : false;
    });

    if (!hasChanges) {
      return;
    }

    plugin.settings.deckTagGroups = normalizedGroups;
    await plugin.saveSettings();
  }
  
  // 从 localStorage 加载配置
  onMount(() => {
    void normalizePersistedTagGroupsIfNeeded();

    // 加载分组方式
    const saved = vaultStorage.getItem('weave-deck-kanban-groupby');
    const validTypes = deckMode === 'memory'
      ? ['completion', 'timeRange', 'priority', 'tag', 'tagGroup']
      : ['tag', 'tagGroup'];
    if (saved && validTypes.includes(saved)) {
      groupBy = saved as DeckGroupByType;
    } else if (deckMode !== 'memory') {
      groupBy = 'tag';
    }
    
    // 加载选定的标签组
    const savedTagGroupId = vaultStorage.getItem('weave-selected-tag-group');
    if (savedTagGroupId) {
      selectedTagGroupId = savedTagGroupId;
    }
    
    // 加载列配置
    const savedColumnConfig = vaultStorage.getItem('weave-deck-kanban-columns');
    if (savedColumnConfig) {
      try {
        const config = JSON.parse(savedColumnConfig);
        columnConfig = {
          hidden: config.hidden || [],
          pinned: config.pinned || [],
          order: config.order || [],
          hideEmptyGroups: config.hideEmptyGroups || false
        };
      } catch (e) {
        logger.error('Failed to parse column config:', e);
      }
    }
    
    // 监听移动端头部按钮的菜单打开事件
    const handleOpenKanbanMenu = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number }>).detail;
      if (detail) {
        openKanbanNativeMenuAtPosition(detail.x, detail.y);
      }
    };
    window.addEventListener('Weave:open-deck-kanban-menu', handleOpenKanbanMenu);
    
    return () => {
      questionBankAnalyticsModalInstance?.close();
      questionBankAnalyticsModalInstance = null;
      closeActiveKanbanMenu();
      window.removeEventListener('Weave:open-deck-kanban-menu', handleOpenKanbanMenu);
    };
  });
  
  // 保存配置
  function saveColumnConfig() {
    // 直接保存，无需转换
    vaultStorage.setItem('weave-deck-kanban-columns', JSON.stringify(columnConfig));
  }

  function setSelectedTagGroupId(tagGroupId: string | null) {
    selectedTagGroupId = tagGroupId;
    if (tagGroupId) {
      vaultStorage.setItem('weave-selected-tag-group', tagGroupId);
    } else {
      vaultStorage.removeItem('weave-selected-tag-group');
    }
  }

  function getConfiguredGroups(): Array<{ key: string; label: string; color?: string; icon?: string }> {
    const groups = currentGroupConfig.groups as Array<{ key: string; label: string; color?: string; icon?: string }>;
    if (groups.length === 0) {
      return [];
    }

    const groupMap = new Map(groups.map((group) => [group.key, group]));
    const orderedKeys = columnConfig.order.filter((key) => groupMap.has(key));
    const missingKeys = groups.map((group) => group.key).filter((key) => !orderedKeys.includes(key));

    return [...orderedKeys, ...missingKeys]
      .map((key) => groupMap.get(key))
      .filter((group): group is { key: string; label: string; color?: string; icon?: string } => Boolean(group));
  }

  function ensureColumnOrderInitialized() {
    const groups = getConfiguredGroups();
    if (columnConfig.order.length === 0 && groups.length > 0) {
      columnConfig.order = groups.map((group) => group.key);
      saveColumnConfig();
    }
    return groups;
  }

  function moveConfiguredGroup(groupKey: string, direction: 'up' | 'down' | 'start' | 'end') {
    const orderedKeys = ensureColumnOrderInitialized().map((group) => group.key);
    const currentIndex = orderedKeys.indexOf(groupKey);
    if (currentIndex === -1) {
      return;
    }

    const nextOrder = [...orderedKeys];
    const [movedKey] = nextOrder.splice(currentIndex, 1);

    let targetIndex = currentIndex;
    if (direction === 'up') targetIndex = Math.max(0, currentIndex - 1);
    if (direction === 'down') targetIndex = Math.min(nextOrder.length, currentIndex + 1);
    if (direction === 'start') targetIndex = 0;
    if (direction === 'end') targetIndex = nextOrder.length;

    nextOrder.splice(targetIndex, 0, movedKey);
    columnConfig.order = nextOrder;
    saveColumnConfig();
  }

  function buildKanbanMenuPosition(x: number, y: number): MenuPositionDef {
    const padding = 12;
    return {
      x: Math.round(Math.min(Math.max(x, padding), window.innerWidth - padding)),
      y: Math.round(Math.min(Math.max(y, padding), window.innerHeight - padding)),
      overlap: false
    };
  }

  function withSubmenu(item: unknown, builder: (submenu: Menu) => void): boolean {
    const submenuFactory = (item as { setSubmenu?: () => Menu }).setSubmenu;
    if (typeof submenuFactory !== 'function') {
      return false;
    }

    const submenu = submenuFactory.call(item as { setSubmenu: () => Menu });
    submenu.setUseNativeMenu(false);
    builder(submenu);
    return true;
  }

  function closeActiveKanbanMenu() {
    if (!activeKanbanMenu) {
      return;
    }

    const menu = activeKanbanMenu;
    activeKanbanMenu = null;
    menu.hide();
  }

  function registerKanbanMenu(menu: Menu) {
    closeActiveKanbanMenu();
    menu.setUseNativeMenu(false);
    activeKanbanMenu = menu;
    menu.onHide(() => {
      if (activeKanbanMenu === menu) {
        activeKanbanMenu = null;
      }
    });
    return menu;
  }

  function showKanbanNativeMenuAtPosition(position: MenuPositionDef) {
    ensureColumnOrderInitialized();
    lastKanbanMenuPosition = position;

    const menu = registerKanbanMenu(new Menu());
    buildKanbanNativeSettingsMenu(menu);
    menu.showAtPosition(position);
  }

  function reopenKanbanNativeMenu() {
    const position = lastKanbanMenuPosition;
    if (!position) {
      return;
    }

    closeActiveKanbanMenu();
    window.setTimeout(() => {
      showKanbanNativeMenuAtPosition(position);
    }, 0);
  }
  
  
  // 保存标签组（创建或更新）
  function openKanbanNativeMenuAtPosition(x: number, y: number) {
    const position = buildKanbanMenuPosition(x, y + 4);

    if (activeKanbanMenu) {
      closeActiveKanbanMenu();
      return;
    }

    showKanbanNativeMenuAtPosition(position);
  }

  function buildKanbanNativeSettingsMenu(menu: Menu) {
    menu.addItem((item) => {
      item.setTitle(t('decks.kanban.viewOptions')).setIsLabel(true);
    });

    menu.addItem((item) => {
      item
        .setTitle(`${t('decks.kanban.groupByLabel')}: ${currentGroupLabel}`)
        .setIcon(currentGroupConfig.icon || DECK_GROUP_CONFIGS[groupBy].icon);
      withSubmenu(item, buildKanbanNativeGroupBySubmenu);
    });

    if (plugin) {
      menu.addItem((item) => {
        item
          .setTitle(
            selectedTagGroup
              ? t('decks.kanban.tagGroupPrefix', { name: selectedTagGroup.name })
              : t('decks.kanban.tagGroup')
          )
          .setIcon(selectedTagGroup?.icon || 'tags');
        withSubmenu(item, buildKanbanNativeTagGroupSubmenu);
      });
    }

    menu.addItem((item) => {
      item
        .setTitle(t('decks.kanban.hideEmptyGroups'))
        .setIcon(columnConfig.hideEmptyGroups ? 'check-square' : 'square')
        .setChecked(columnConfig.hideEmptyGroups)
        .onClick(() => {
          handleToggleHideEmpty();
          reopenKanbanNativeMenu();
        });
    });

    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle(t('decks.kanban.groups')).setIsLabel(true);
    });
    menu.addItem((item) => {
      item
        .setTitle(isAllHidden ? t('decks.kanban.showAllBtn') : t('decks.kanban.hideAllBtn'))
        .setIcon(isAllHidden ? 'eye' : 'eye-off')
        .onClick(() => {
          handleToggleAllVisibility();
          reopenKanbanNativeMenu();
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(t('decks.kanban.reset'))
        .setIcon('rotate-ccw')
        .onClick(() => {
          resetColumnConfig();
          reopenKanbanNativeMenu();
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(t('cardManagement.tools.columnSettings'))
        .setIcon('list');
      withSubmenu(item, buildKanbanNativeColumnSubmenu);
    });
  }

  function buildKanbanNativeGroupBySubmenu(menu: Menu) {
    const groupTypes: DeckGroupByType[] = deckMode === 'memory'
      ? ['completion', 'timeRange', 'priority', 'tag', 'tagGroup']
      : ['tag', 'tagGroup'];
    const tagGroupUnavailable = !plugin?.settings.deckTagGroups || plugin.settings.deckTagGroups.length === 0;

    menu.addItem((item) => {
      item.setTitle(t('decks.kanban.groupByLabel')).setIsLabel(true);
    });

    for (const type of groupTypes) {
      const config = DECK_GROUP_CONFIGS[type];
      const disabled = type === 'tagGroup' && tagGroupUnavailable;

      menu.addItem((item) => {
        item
          .setTitle(config.title)
          .setIcon(config.icon)
          .setChecked(groupBy === type)
          .setDisabled(disabled)
          .onClick(() => {
            void applyKanbanNativeGroupByChange(type);
          });
      });
    }
  }

  function buildKanbanNativeTagGroupSubmenu(menu: Menu) {
    const tagGroups = plugin?.settings.deckTagGroups || [];

    menu.addItem((item) => {
      item.setTitle(t('decks.kanban.tagGroup')).setIsLabel(true);
    });

    if (tagGroups.length === 0) {
      menu.addItem((item) => {
        item
          .setTitle(t('decks.kanban.createNew'))
          .setIcon('plus')
          .onClick(() => {
            closeActiveKanbanMenu();
            editingTagGroup = undefined;
            showQuickCreator = true;
          });
      });
      return;
    }

    for (const tagGroup of tagGroups) {
      menu.addItem((item) => {
        item
          .setTitle(`${tagGroup.icon ? `${tagGroup.icon} ` : ''}${tagGroup.name}`)
          .setChecked(selectedTagGroupId === tagGroup.id)
          .onClick(() => {
            setSelectedTagGroupId(tagGroup.id);
            void applyKanbanNativeGroupByChange('tagGroup');
          });
      });
    }

    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle(t('decks.kanban.newTagGroup'))
        .setIcon('plus')
        .onClick(() => {
          closeActiveKanbanMenu();
          editingTagGroup = undefined;
          showQuickCreator = true;
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(t('decks.kanban.editTagGroup'))
        .setIcon('edit')
        .setDisabled(!selectedTagGroupId)
        .onClick(() => {
          closeActiveKanbanMenu();
          handleEditTagGroup();
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(t('decks.kanban.deleteTagGroup'))
        .setIcon('trash-2')
        .setWarning(true)
        .setDisabled(!selectedTagGroupId)
        .onClick(() => {
          closeActiveKanbanMenu();
          void handleDeleteTagGroup();
        });
    });
  }

  function buildKanbanNativeColumnSubmenu(menu: Menu) {
    const groups = getConfiguredGroups();

    if (groups.length === 0) {
      menu.addItem((item) => {
        item.setTitle(t('decks.kanban.emptyColumn')).setDisabled(true);
      });
      return;
    }

    for (const [index, group] of groups.entries()) {
      const hidden = columnConfig.hidden.includes(group.key);
      const count = groupedDecks[group.key]?.length || 0;

      menu.addItem((item) => {
        item
          .setTitle(`${group.label} (${count})`)
          .setIcon(hidden ? 'eye-off' : 'eye')
          .setChecked(!hidden);
        withSubmenu(item, (submenu) => {
          buildKanbanNativeSingleColumnSubmenu(submenu, group, index, groups.length);
        });
      });
    }
  }

  function buildKanbanNativeSingleColumnSubmenu(
    menu: Menu,
    group: { key: string; label: string },
    index: number,
    total: number
  ) {
    const hidden = columnConfig.hidden.includes(group.key);

    menu.addItem((item) => {
      item.setTitle(group.label).setIsLabel(true);
    });
    menu.addItem((item) => {
      item
        .setTitle(hidden ? t('decks.kanban.showColumn') : t('decks.kanban.hideColumn'))
        .setIcon(hidden ? 'eye' : 'eye-off')
        .onClick(() => {
          handleToggleVisibility(group.key);
          reopenKanbanNativeMenu();
        });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle(t('decks.kanban.moveUp'))
        .setIcon('arrow-up')
        .setDisabled(index === 0)
        .onClick(() => {
          moveConfiguredGroup(group.key, 'up');
          reopenKanbanNativeMenu();
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(t('decks.kanban.moveDown'))
        .setIcon('arrow-down')
        .setDisabled(index === total - 1)
        .onClick(() => {
          moveConfiguredGroup(group.key, 'down');
          reopenKanbanNativeMenu();
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(t('decks.kanban.moveToFirst'))
        .setIcon('chevrons-up')
        .setDisabled(index === 0)
        .onClick(() => {
          moveConfiguredGroup(group.key, 'start');
          reopenKanbanNativeMenu();
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(t('decks.kanban.moveToLast'))
        .setIcon('chevrons-down')
        .setDisabled(index === total - 1)
        .onClick(() => {
          moveConfiguredGroup(group.key, 'end');
          reopenKanbanNativeMenu();
        });
    });
  }

  async function applyKanbanNativeGroupByChange(newGroupBy: DeckGroupByType) {
    groupBy = newGroupBy;
    vaultStorage.setItem('weave-deck-kanban-groupby', newGroupBy);

    await tick();

    const newKeys = Object.keys(groupedDecks);
    columnConfig.order = newKeys;
    columnConfig.hidden = [];
    saveColumnConfig();

    reopenKanbanNativeMenu();
  }

  async function handleSaveTagGroup(tagGroup: DeckTagGroup) {
    if (!plugin) return;
    const normalizedTagGroup = normalizeDeckTagGroup(tagGroup);
    
    const tagGroups = plugin.settings.deckTagGroups || [];
    const existingIndex = tagGroups.findIndex(tg => tg.id === normalizedTagGroup.id);
    
    if (existingIndex !== -1) {
      // 更新现有标签组
      tagGroups[existingIndex] = normalizedTagGroup;
      new Notice(t('decks.kanban.tagGroupUpdated', { name: normalizedTagGroup.name }));
    } else {
      // 添加新标签组
      tagGroups.push(normalizedTagGroup);
      new Notice(t('decks.kanban.tagGroupCreated', { name: normalizedTagGroup.name }));
    }
    
    plugin.settings.deckTagGroups = tagGroups;
    await plugin.saveSettings();
    
    // 自动选择标签组
    setSelectedTagGroupId(normalizedTagGroup.id);
    
    // 关闭创建器并清除编辑状态
    showQuickCreator = false;
    editingTagGroup = undefined;
  }
  
  // 编辑标签组
  function handleEditTagGroup() {
    if (!plugin || !selectedTagGroupId) return;
    
    const tagGroup = plugin.settings.deckTagGroups?.find(tg => tg.id === selectedTagGroupId);
    if (!tagGroup) return;
    
    // 设置编辑状态并打开创建器
    editingTagGroup = tagGroup;
    showQuickCreator = true;
  }
  
  // 删除标签组
  async function handleDeleteTagGroup() {
    if (!plugin || !selectedTagGroupId) return;
    
    const tagGroup = plugin.settings.deckTagGroups?.find(tg => tg.id === selectedTagGroupId);
    if (!tagGroup) return;
    
    //  使用 Obsidian Modal 代替原生确认框，避免焦点劫持问题
    const confirmed = await showObsidianConfirm(plugin!.app, t('decks.kanban.tagGroupDeleteConfirm', { name: tagGroup.name }), { title: t('decks.kanban.confirmDelete') });
    if (!confirmed) {
      return;
    }
    
    // 从设置中移除
    plugin.settings.deckTagGroups = plugin.settings.deckTagGroups?.filter(tg => tg.id !== selectedTagGroupId) || [];
    await plugin.saveSettings();
    
    // 清除选择
    const remainingTagGroups = plugin.settings.deckTagGroups || [];
    if (remainingTagGroups.length > 0) {
      setSelectedTagGroupId(remainingTagGroups[0].id);
    } else {
      setSelectedTagGroupId(null);
      if (groupBy === 'tagGroup') {
        await applyKanbanNativeGroupByChange('tag');
      }
    }
    
    new Notice(t('decks.kanban.tagGroupDeleted', { name: tagGroup.name }));
  }
  
  // 列可见性切换
  function handleToggleVisibility(key: string) {
    if (columnConfig.hidden.includes(key)) {
      columnConfig.hidden = columnConfig.hidden.filter(k => k !== key);
    } else {
      columnConfig.hidden = [...columnConfig.hidden, key];
    }
    saveColumnConfig();
  }
  
  
  // 隐藏空白分组切换
  function handleToggleHideEmpty() {
    columnConfig.hideEmptyGroups = !columnConfig.hideEmptyGroups;
    saveColumnConfig();
  }
  
  
  // 全部显示
  function handleShowAll() {
    columnConfig.hidden = [];
    saveColumnConfig();
  }
  
  // 全部隐藏
  function handleHideAll() {
    const allKeys = Object.keys(groupedDecks);
    columnConfig.hidden = [...allKeys];
    saveColumnConfig();
  }

  // 列管理：切换显示/隐藏所有列
  function handleToggleAllVisibility() {
    if (isAllHidden) {
      handleShowAll();
    } else {
      handleHideAll();
    }
  }

  // 计算属性：判断是否所有列都被隐藏
  const isAllHidden = $derived.by(() => {
    const totalGroups = Object.keys(groupedDecks).length;
    const hiddenGroups = columnConfig.hidden.length;
    return hiddenGroups >= totalGroups;
  });

  
  // 重置配置
  function resetColumnConfig() {
    columnConfig = {
      hidden: [],
      pinned: [],
      order: Object.keys(groupedDecks),
      hideEmptyGroups: false
    };
    saveColumnConfig();
  }

  const emptyDeckStats: DeckStats = {
    totalCards: 0,
    newCards: 0,
    learningCards: 0,
    reviewCards: 0,
    todayNew: 0,
    todayReview: 0,
    todayTime: 0,
    totalReviews: 0,
    totalTime: 0,
    memoryRate: 0,
    averageEase: 0,
    forecastDays: {}
  };

  function addEmergentDeckMenuItems(menu: Menu, deckId: string): boolean {
    let hasItems = false;
    const isPremium = get(premiumGuard.isPremiumActive);
    const showPremiumFeaturesPreview = get(premiumGuard.premiumFeaturesPreviewEnabled);

    menu.addItem((item) =>
      item
        .setTitle(t('decks.menu.advanceStudy'))
        .setIcon('fast-forward')
        .onClick(async () => await dispatchMemoryDeckMenuAction('advance-study', deckId))
    );
    hasItems = true;

    if (shouldShowDeckAnalyticsEntry(isPremium, showPremiumFeaturesPreview)) {
      menu.addItem((item) =>
        item
          .setTitle(getDeckAnalyticsEntryTitle())
          .setIcon('bar-chart-2')
          .onClick(async () => await dispatchMemoryDeckMenuAction('deck-analytics', deckId))
      );
    }

    menu.addItem((item) =>
      item
        .setTitle(t('decks.menu.knowledgeGraph'))
        .setIcon('git-fork')
        .onClick(async () => await dispatchMemoryDeckMenuAction('knowledge-graph', deckId))
    );

    return hasItems;
  }

  // 显示牌组菜单（根据 deckMode 显示不同菜单项）
  async function dispatchMemoryDeckMenuAction(action: MemoryDeckMenuAction, deckId: string): Promise<void> {
    try {
      if (memoryDeckMenuActionHandler) {
        await memoryDeckMenuActionHandler(action, deckId);
        return;
      }

      window.dispatchEvent(new CustomEvent('Weave:request-memory-deck-action', {
        detail: { action, deckId }
      }));
    } catch (error) {
      logger.error('[KanbanView] 转发记忆牌组菜单动作失败:', error);
    }
  }

  async function openQuestionBankAnalytics(deckId: string): Promise<void> {
    try {
      if (!plugin?.questionBankService) {
        new Notice(t('decks.kanban.qbServiceNotInit'));
        return;
      }

      const bank = await plugin.questionBankService.getBankById(deckId);
      if (!bank) {
        new Notice(t('decks.kanban.qbNotFound'));
        return;
      }

      questionBankAnalyticsModalInstance?.close();
      questionBankAnalyticsModalInstance = new QuestionBankAnalyticsModalObsidian(plugin.app, {
        plugin,
        questionBank: bank,
        onClose: () => {
          questionBankAnalyticsModalInstance = null;
        }
      });
      questionBankAnalyticsModalInstance.open();
    } catch (error) {
      logger.error('[KanbanView] 打开题组分析图表失败:', error);
      new Notice(t('decks.kanban.openAnalyticsFailed'));
    }
  }

  async function showDeckMenu(event: MouseEvent, deckId: string) {
    event.preventDefault();
    event.stopPropagation();
    onBeforeOpenDeckMenu?.();
    const menu = registerKanbanMenu(new Menu());
    
    const deck = allDecks.find(d => d.id === deckId);
    if (!deck) return;

    const emergentView = emergentDeckViewMap.get(deckId);
    if (deckMode === 'memory' && showingEmergentMemoryDecks && emergentView) {
      const candidate = emergentCandidates.find(item => item.id === emergentView.id);
      const hasSharedItems = addEmergentDeckMenuItems(menu, emergentView.id);

      if (candidate && onPromoteEmergentDeck) {
        if (hasSharedItems) {
          menu.addSeparator();
        }

        menu.addItem((item) =>
          item
            .setTitle('转为正式牌组')
            .setIcon('folder-plus')
            .onClick(async () => await onPromoteEmergentDeck(candidate, event))
        );
      }

      menu.showAtMouseEvent(event);
      return;
    }
    
    if (deckMode === 'incremental-reading') {
      // === 增量阅读牌组菜单（与历史 IR 牌组网格视图一致）===
      menu.addItem((item) =>
        item.setTitle('专题编辑').setIcon('edit-3')
          .onClick(() => onEditDeck?.(deckId))
      );
      
      menu.addItem((item) =>
        item.setTitle('专题分析').setIcon('bar-chart-2')
          .onClick(() => onOpenLoadForecast?.(deckId))
      );
      
      menu.addSeparator();
      
      menu.addItem((item) =>
        item.setTitle('删除专题').setIcon('trash-2').setWarning(true)
          .onClick(() => onDeleteDeck?.(deckId))
      );
    } else if (deckMode === 'question-bank') {
      // === 考试牌组菜单（与 QuestionBankGridView 网格视图一致）===
      menu.addItem((item) =>
        item.setTitle(t('decks.kanban.editDeck')).setIcon('edit-3')
          .onClick(() => onEditDeck?.(deckId))
      );
      
      menu.addItem((item) =>
        item.setTitle(t('decks.kanban.analytics')).setIcon('bar-chart-2')
          .onClick(async () => await openQuestionBankAnalytics(deckId))
      );
      
      menu.addSeparator();
      
      menu.addItem((item) =>
        item.setTitle(t('decks.menu.delete')).setIcon('trash-2')
          .onClick(() => onDeleteDeck?.(deckId))
      );
    } else {
      // === 记忆牌组菜单 ===
      const isPremium = get(premiumGuard.isPremiumActive);
      const showPremiumFeaturesPreview = get(premiumGuard.premiumFeaturesPreviewEnabled);

      menu.addItem((item) =>
        item
          .setTitle(t('decks.menu.advanceStudy'))
          .setIcon('fast-forward')
          .onClick(async () => await dispatchMemoryDeckMenuAction('advance-study', deckId))
      );

      if (shouldShowDeckAnalyticsEntry(isPremium, showPremiumFeaturesPreview)) {
        menu.addItem((item) =>
          item
            .setTitle(getDeckAnalyticsEntryTitle())
            .setIcon('bar-chart-2')
            .onClick(async () => await dispatchMemoryDeckMenuAction('deck-analytics', deckId))
        );
      }

      menu.addItem((item) =>
        item
          .setTitle(t('decks.menu.knowledgeGraph'))
          .setIcon('git-fork')
          .onClick(async () => await dispatchMemoryDeckMenuAction('knowledge-graph', deckId))
      );

      if (onAssociateQuestionBank) {
        const canUseQuestionBank = premiumGuard.canUseFeature(PREMIUM_FEATURES.QUESTION_BANK);

        if (!canUseQuestionBank) {
          menu.addItem((item) =>
            item
              .setTitle(`${t('decks.menu.linkQuestionBank')} (高级)`)
              .setIcon('link-2')
              .onClick(async () => await onAssociateQuestionBank?.(deckId))
          );
        } else {
          const submenuData = getQuestionBankSubmenuData
            ? await getQuestionBankSubmenuData(deckId)
            : null;

          if (submenuData && submenuData.banks.length > 0) {
            menu.addItem((item) => {
              item
                .setTitle(t('decks.menu.linkQuestionBank'))
                .setIcon('link-2');

              const hasSubmenu = withSubmenu(item, (submenu) => {
                submenuData.banks.forEach((bank) => {
                  submenu.addItem((subItem) => {
                    subItem
                      .setTitle(bank.name)
                      .setIcon(bank.isCurrent ? 'check' : 'gallery-vertical')
                      .onClick(async () => await onAssociateQuestionBank?.(deckId, bank.id));
                  });
                });
              });

              if (!hasSubmenu) {
                item.onClick(async () => await onAssociateQuestionBank?.(deckId));
              }
            });
          } else {
            menu.addItem((item) =>
              item
                .setTitle(t('decks.menu.linkQuestionBank'))
                .setIcon('link-2')
                .onClick(async () => await onAssociateQuestionBank?.(deckId))
            );
          }
        }
      }

      menu.addSeparator();

      menu.addItem((item) =>
        item
          .setTitle(t('decks.menu.editDeck'))
          .setIcon('edit')
          .onClick(async () => await dispatchMemoryDeckMenuAction('edit-deck', deckId))
      );

      menu.addItem((item) =>
        item
          .setTitle(t('decks.menu.delete'))
          .setIcon('trash-2')
          .onClick(async () => await dispatchMemoryDeckMenuAction('delete-deck', deckId))
      );

      menu.addItem((item) =>
        item
          .setTitle(t('decks.menu.dissolveDeck'))
          .setIcon('unlink')
          .onClick(async () => await dispatchMemoryDeckMenuAction('dissolve-deck', deckId))
      );
    }
    
    menu.showAtMouseEvent(event);
  }
  
  // 判断是否可拖拽（根据分组方式决定）
  function isDraggable(): boolean {
    // 只有在优先级分组时才允许拖拽
    return groupBy === 'priority' && !showingEmergentMemoryDecks;
  }
  
  // 拖拽开始
  function handleDragStart(e: DragEvent, deck: Deck) {
    if (!isDraggable()) return;
    
    draggedDeck = deck;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-weave-deck', deck.id);
    }
  }
  
  // 拖拽结束
  function handleDragEnd() {
    draggedDeck = null;
    dragOverColumn = null;
  }
  
  // 拖拽经过列
  function handleDragOver(e: DragEvent, groupKey: string) {
    if (!draggedDeck) return;
    e.preventDefault();
    dragOverColumn = groupKey;
  }
  
  // 离开列
  function handleDragLeave() {
    dragOverColumn = null;
  }
  
  // 放下
  async function handleDrop(targetGroupKey: string) {
    if (!draggedDeck || !isDraggable()) return;
    
    try {
      // 获取当前牌组的分组key
      const sourceGroupKey = getCurrentGroupKey(draggedDeck);
      
      // 如果拖到同一列，不做处理
      if (sourceGroupKey === targetGroupKey) {
        handleDragEnd();
        return;
      }
      
      // 更新牌组优先级（通过metadata存储）
      const updatedDeck: Deck = {
        ...draggedDeck,
        metadata: {
          ...draggedDeck.metadata,
          priority: targetGroupKey
        },
        modified: new Date().toISOString()
      };
      
      // 保存到数据库
      await saveMemoryDeck(plugin!, updatedDeck, 'update');
      
      // 触发父组件刷新数据
      if (onDeckUpdate) {
        onDeckUpdate();
      } else {
        // 如果没有回调，本地重新加载分组
        groupedDecks = await aggregationService.groupDecks(allDecks, groupBy);
      }
      
      logger.debug(`[KanbanView] 牌组 ${draggedDeck.name} 优先级已更新为 ${targetGroupKey}`);
    } catch (error) {
      logger.error('[KanbanView] 更新牌组优先级失败:', error);
    } finally {
      handleDragEnd();
    }
  }
  
  // 获取牌组当前所在的分组key
  function getCurrentGroupKey(deck: Deck): string {
    for (const [key, decks] of Object.entries(groupedDecks)) {
      if (decks.some(d => d.id === deck.id)) {
        return key;
      }
    }
    return '';
  }
</script>

<div class="kanban-view">
  <!-- 桌面端工具栏（移动端已移至头部） -->
  <!-- 加载状态 -->
  {#if isLoading}
    <div class="loading-indicator">
      <div class="spinner"></div>
      <span>{t('decks.kanban.grouping')}</span>
    </div>
  {:else}
    <!-- 看板列 -->
    <div class="kanban-columns">
      {#each orderedGroups as group (group?.key || '')}
        {#if group}
          {@const decks = groupedDecks[group.key] || []}
          <div 
            class="kanban-column" 
            class:drag-over={dragOverColumn === group.key}
            style="--column-color: {group.color}"
            role="region"
            aria-label={t('decks.kanban.groupLabel', { label: group.label })}
            ondragover={(e) => handleDragOver(e, group.key)}
            ondragleave={handleDragLeave}
            ondrop={() => handleDrop(group.key)}
          >
            <div class="column-header">
              <div class="header-content">
                <span class="header-icon">
                  <EnhancedIcon name={group.icon} size={16} color={group.color} />
                </span>
                <h3 class="header-title">{group.label}</h3>
              </div>
              <span class="count-badge">{decks.length}</span>
            </div>
            
            <div class="column-content">
              {#if decks.length === 0}
                <div class="empty-message">
                  <EnhancedIcon name="inbox" size={24} />
                  <span>{t('decks.kanban.emptyColumn')}</span>
                </div>
              {:else}
                {#each decks as deck (deck.id)}
                  {@const emergentView = showingEmergentMemoryDecks ? emergentDeckViewMap.get(deck.id) : undefined}
                  {@const stats = showingEmergentMemoryDecks ? (emergentDeckStats[deck.id] || deck.stats || emptyDeckStats) : (deckStats[deck.id] || emptyDeckStats)}
                  {@const colorScheme = getColorSchemeForDeck(deck.id)}
                  {@const colorVariant = ((decks.indexOf(deck) % 4) + 1) as 1 | 2 | 3 | 4}
                  {@const bindingSummary = !showingEmergentMemoryDecks ? formalDeckBindingSummary[deck.id] : undefined}
                  {@const formalStatusBadge = bindingSummary ? `${MEMORY_DECK_UI_TEXT.autoTopicPrefix} ${bindingSummary.bindingCount}` : undefined}
                  {@const levelProgress = !showingEmergentMemoryDecks ? memoryDeckLevels[deck.id] : undefined}
                  <div 
                    class="kanban-card-wrapper"
                    class:dragging={draggedDeck?.id === deck.id}
                    class:draggable={isDraggable()}
                    role="group"
                    draggable={isDraggable()}
                    ondragstart={(e) => handleDragStart(e, deck)}
                    ondragend={handleDragEnd}
                  >
                    {#if deckCardStyle === 'chinese-elegant'}
                      <ChineseElegantDeckCard
                        {deck}
                        stats={stats}
                        {levelProgress}
                        {colorVariant}
                        {deckMode}
                        statusBadge={showingEmergentMemoryDecks ? emergentView?.statusBadge : formalStatusBadge}
                        statusKind={showingEmergentMemoryDecks ? 'emergent' : 'formal'}
                        onStudy={() => showingEmergentMemoryDecks && emergentView
                          ? onStartEmergentStudy?.(emergentView.id, emergentView.name)
                          : onStartStudy(deck.id)}
                        onMenu={(e) => {
                          void showDeckMenu(e, deck.id);
                        }}
                      />
                    {:else}
                      <DeckGridCard
                        {deck}
                        stats={stats}
                        colorScheme={colorScheme}
                        {levelProgress}
                        {deckMode}
                        statusBadge={showingEmergentMemoryDecks ? emergentView?.statusBadge : formalStatusBadge}
                        statusKind={showingEmergentMemoryDecks ? 'emergent' : 'formal'}
                        onStudy={() => showingEmergentMemoryDecks && emergentView
                          ? onStartEmergentStudy?.(emergentView.id, emergentView.name)
                          : onStartStudy(deck.id)}
                        onMenu={(e) => {
                          void showDeckMenu(e, deck.id);
                        }}
                      />
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<!-- 快速创建/编辑标签组对话框 -->
{#if showQuickCreator && plugin}
  <QuickTagGroupCreator
    {plugin}
    editingTagGroup={editingTagGroup}
    onSave={handleSaveTagGroup}
    onCancel={() => { showQuickCreator = false; editingTagGroup = undefined; }}
  />
{/if}

<style>
  .kanban-view {
    --weave-kanban-page-bg: var(--weave-card-page-bg, var(--weave-surface-background, var(--background-primary)));
    --weave-kanban-panel-bg: var(
      --weave-card-panel-bg,
      var(--weave-elevated-background, var(--background-secondary))
    );
    container-type: inline-size;
    container-name: kanban-layout;
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow: hidden;
    gap: 16px;
    background: var(--weave-kanban-page-bg);
  }
  
  /* 加载状态 */
  .loading-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    color: var(--text-muted);
  }
  
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* 看板列 */
  .kanban-columns {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    flex: 1;
    min-height: 0;
    align-content: start;
    background: var(--weave-kanban-page-bg);
  }
  
  .kanban-column {
    display: flex;
    flex-direction: column;
    background: var(--weave-kanban-panel-bg);
    border-radius: 12px;
    padding: 16px;
    min-height: 0;
    transition: all 0.3s ease;
  }
  
  .column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid var(--column-color, var(--background-modifier-border));
  }
  
  .header-content {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .header-icon {
    display: flex;
    align-items: center;
  }
  
  .header-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0;
  }
  
  .count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    background: var(--column-color, var(--interactive-accent));
    color: white;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }
  
  .column-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .column-content::-webkit-scrollbar {
    width: 6px;
  }
  
  .column-content::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .column-content::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--background-modifier-border) 72%, var(--background-secondary) 28%);
    border-radius: 3px;
  }
  
  .column-content::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }
  
  /* 牌组卡片包装器（用于拖拽） */
  .kanban-card-wrapper {
    margin-bottom: 12px;
    min-width: 0;
    container-type: inline-size;
    container-name: deck-card;
    transition: all 0.2s;
  }
  
  /* 可拖拽的卡片 */
  .kanban-card-wrapper.draggable {
    cursor: grab;
  }
  
  .kanban-card-wrapper.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }
  
  /* 拖拽目标列高亮 */
  .kanban-column.drag-over {
    background: color-mix(in srgb, var(--column-color) 5%, var(--weave-kanban-panel-bg));
    border: 2px dashed var(--interactive-accent);
  }
  
  /* 空状态 */
  .empty-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 20px;
    color: var(--text-muted);
    font-size: 13px;
  }
  
  /* 响应式 */
  @container kanban-layout (max-width: 1100px) {
    .kanban-columns {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  
  @container kanban-layout (max-width: 760px) {
    .kanban-view {
      padding: 12px;
    }
    
    .kanban-columns {
      grid-template-columns: 1fr;
    }
    
  }

  @container kanban-layout (max-width: 420px) {
    .kanban-view {
      padding: 8px;
      gap: 12px;
    }

    .kanban-columns {
      gap: 10px;
    }

    .kanban-column {
      padding: 12px;
      border-radius: 10px;
    }

    .column-header {
      margin-bottom: 12px;
      padding-bottom: 10px;
    }

    .header-title {
      font-size: 14px;
    }

    .column-content {
      gap: 10px;
    }
  }
  
  /* 移动端专属样式 */
  :global(body.is-mobile) .kanban-view {
    padding: 8px;
    padding-bottom: 60px; /* 为 Obsidian 底部栏留出空间 */
  }
  
  :global(body.is-mobile) .kanban-columns {
    display: flex;
    flex-direction: row;
    gap: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    grid-template-columns: unset;
    padding-bottom: 8px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }
  
  :global(body.is-mobile) .kanban-column {
    min-width: 280px;
    max-width: 360px;
    flex-shrink: 0;
    padding: 12px;
    border-radius: 10px;
    scroll-snap-align: start;
  }

  :global(body.is-tablet) .kanban-columns {
    gap: 14px;
    padding-bottom: 10px;
  }

  :global(body.is-tablet) .kanban-column {
    min-width: 240px;
    max-width: 320px;
    padding: 14px;
  }

  :global(body.is-tablet) .header-title {
    font-size: 14px;
  }

  :global(body.is-tablet) .count-badge {
    min-width: 22px;
    height: 22px;
    font-size: 11px;
  }
  
  :global(body.is-mobile) .column-header {
    margin-bottom: 10px;
    padding-bottom: 8px;
  }
  
  :global(body.is-mobile) .header-title {
    font-size: 12px;
  }
  
  :global(body.is-mobile) .count-badge {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    font-size: 10px;
  }
  
  :global(body.is-mobile) .kanban-card-wrapper {
    margin-bottom: 6px;
  }
  
  :global(body.is-mobile) .empty-message {
    padding: 20px 10px;
    font-size: 11px;
  }

</style>
