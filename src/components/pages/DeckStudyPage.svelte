<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import BouncingBallsLoader from "../ui/BouncingBallsLoader.svelte";

  import type { WeaveDataStorage } from "../../data/storage";
  import type { Card, Deck, DeckStats } from "../../data/types";
  import type { StudySession } from "../../data/study-types";
  import type { DataChangeEvent } from "../../services/DataSyncService";
  import { CardType } from "../../data/types";
  //  移除不存在的DeckTreeBuilder导入 - 使用DeckHierarchyService代替
  import { logger } from '../../utils/logger';
  import { vaultStorage } from '../../utils/vault-local-storage';
  import type WeavePlugin from '../../main';
  //  导入回收卡片过滤工具（原搁置功能已重构）
  import { filterRecycledCards } from '../../utils/recycle-utils';
  //  导入ID生成工具函数
  import { generateId } from '../../utils/helpers';
// 渐进式挖空支持
  import { isProgressiveClozeParent, isProgressiveClozeChild } from '../../types/progressive-cloze-v2';
  import CSVImportModal from "../modals/CSVImportModal.svelte";
  import CreateQuestionBankModal from "../modals/CreateQuestionBankModal.svelte";
  import { QuestionBankAssociationModal } from "../../modals/QuestionBankAssociationModal";
  import { QuestionBankSelectorModal } from "../../modals/QuestionBankSelectorModal";
  import { VaultFolderSuggestModal } from "../../modals/VaultFolderSuggestModal";
  import { BatchTagSuggestModal, type BatchTagSuggestItem } from "../../modals/BatchTagSuggestModal";
  import { Menu, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
  import type { DeckTreeNode } from "../../services/deck/DeckHierarchyService";
  import { buildMemoryDeckMenu, type MemoryDeckMenuAction } from "../../services/deck/MemoryDeckMenu";
  import { openFileWithExistingLeaf } from "../../utils/workspace-navigation";
  import {
    buildTagSuggestionOptions,
    normalizeTagSuggestionOptions,
    normalizeTagSuggestionValue,
  } from "../../utils/tag-suggest";
  
  //  导入服务就绪检查工具
  import { waitForService, safeServiceCall } from "../../utils/service-ready-check";
  import { waitForServiceReady } from "../../utils/service-ready-event";
  
  // 进度条模态窗
  import { executeBatchWithProgress } from "../../utils/progress-modal";
  
// 导入视图组件
  import DeckStudyContentArea from "./deck-study/DeckStudyContentArea.svelte";
  import DeckStudyModalHost from "./deck-study/DeckStudyModalHost.svelte";
  import { createDeckStudyMenuCoordinator } from "./deck-study/menu-coordinator";
  import { createDeckStudyModalCoordinator } from "./deck-study/modal-coordinator";
  import { createDeckStudyModeActions } from "./deck-study/mode-actions";
  import { createDeckStudyPageRuntimeController } from "./deck-study/page-runtime-controller";
  import { createDeckStudyRefreshCoordinator } from "./deck-study/refresh-coordinator";
  import type {
    DeckStudyContentAreaProps,
    DeckStudyModalHostProps,
  } from "./deck-study/page-shell-types";
  import type { CelebrationStats } from "../../types/celebration-types";
  
  //  导入牌组分析模态窗
  import { DeckAnalyticsModalObsidian } from "../modals/DeckAnalyticsModalObsidian";
  
// 导入学习完成逻辑辅助函数
  import { loadDeckCardsForStudy, isDeckCompleteForToday, getAdvanceStudyCards, getLearnedNewCardsCountToday, getLatestCompletedStudySessionToday } from "../../utils/study/studyCompletionHelper";
  
  //  高级功能限制
  import { PremiumFeatureGuard, PREMIUM_FEATURES, type PremiumFeatureAccessContext } from "../../services/premium/PremiumFeatureGuard";
  import { get } from 'svelte/store';
  import { getEmergentDeckService } from "../../services/deck/EmergentDeckService";
  import {
    getMemoryDeckLevelProgressFromCards,
    type MemoryDeckLevelProgress,
  } from "../../services/deck/MemoryDeckLevelService";
  import {
    DEFAULT_EMERGENT_RULE_GROUP,
    getActiveEmergentRuleGroup,
    getNormalizedEmergentRuleGroups,
    type EmergentRuleGroup,
  } from "../../services/deck/emergent-rule-groups";
  import {
    appendCreatedEmergentRuleGroupDraftState,
    appendDuplicatedEmergentRuleGroupDraftState,
    appendEmergentRuleGroupSourceFolder,
    appendEmergentRuleGroupTag,
    clearEmergentRuleConditionState,
    getCurrentEmergentRuleGroupDraft as resolveCurrentEmergentRuleGroupDraft,
    normalizeEmergentRuleGroupsForSave,
    removeEmergentRuleGroupDraftState,
    removeEmergentRuleGroupSourceFolder,
    removeEmergentRuleGroupTag,
    setEmergentRuleConditionVisible as setEmergentRuleConditionVisibleInState,
    updateEmergentRuleGroupDate,
    updateEmergentRuleGroupName,
    updateEmergentRuleGroupOnlyLearnable,
    updateEmergentRuleGroupPriority,
    updateEmergentRuleGroupThreshold,
  } from "../../services/deck/emergent-rule-group-drafts";
  import {
    EMERGENT_RULE_ADDABLE_CONDITION_OPTIONS,
    buildVisibleEmergentRuleConditionKeys,
    mergeVisibleEmergentRuleConditionKeys,
    type EmergentRuleConditionKey,
  } from "../../services/deck/emergent-rule-group-editor";
  import type { EmergentDeckCandidate, FormalDeckBindingSummary, MemoryDeckOrganizationRuntime, MemoryDeckView } from "../../types/emergent-deck-types";
  
  //  导入国际化
  import { tr } from '../../utils/i18n';
  
  //  导入移动端组件
  import MobileDeckStudyHeader from "../study/MobileDeckStudyHeader.svelte";
  import { DirectoryUtils } from '../../utils/directory-utils';
  import { extractAllTags, getCardDeckIds, parseSourceInfo } from '../../utils/yaml-utils';
  import { sanitizeFileName } from '../../utils/card-export-utils';
  import { getV2Paths, getReadableWeaveRoot } from '../../config/paths';
  import { migrateLegacyDirectory } from '../../services/data-migration/LegacyWeaveFolderMigration';
  import { resolveDeckNoCardsReason } from '../../utils/study/noCardsReason';

  interface Props {
    dataStorage: WeaveDataStorage;
    plugin: WeavePlugin;
  }

  let { dataStorage, plugin }: Props = $props();
  let t = $derived($tr);

  // 核心状态
  let showCSVImportModal = $state(false);
  let showCreateQuestionBankModal = $state(false);
  
  //  加载状态
  let isLoading = $state(true);

  //  庆祝模态窗状态
  let showCelebrationModal = $state(false);
  let celebrationDeckName = $state<string>('');
  let celebrationDeckId = $state<string>('');
  let celebrationStats = $state<CelebrationStats | null>(null);
  
// 无卡片提示模态窗状态
  let showNoCardsModal = $state(false);
  let noCardsDeckName = $state<string>('');
  let noCardsReason = $state<'empty' | 'all-learned' | 'no-due'>('empty');
  let noCardsStats = $state<{
    totalCards: number;
    sessionCompletedCards?: number;
    showSessionCompletedCards?: boolean;
    nextDueTime?: string;
    todayNewCards?: number;
    todayNewLimit?: number;
  } | undefined>(undefined);
  let noCardsCurrentDeckId = $state<string>('');

  // 牌组分析模态窗状态
  let deckAnalyticsModalInstance: DeckAnalyticsModalObsidian | null = null;
  let showEmergentRuleGroupPopover = $state(false);
  let emergentRuleGroupPopoverStyle = $state('top: 56px; left: calc(100vw - 320px);');
  let emergentRuleGroupAnchor = $state<HTMLElement | null>(null);
  let emergentRuleGroupDrafts = $state<EmergentRuleGroup[]>([]);
  let emergentRuleGroupDraftActiveId = $state(DEFAULT_EMERGENT_RULE_GROUP.id);
  let emergentRuleGroupVisibleConditions = $state<Record<string, string[]>>({});
  let emergentChildPopupOpenCount = $state(0);
  let emergentChildPopupCloseGuardUntil = $state(0);

  const EMERGENT_CHILD_POPUP_OPEN_EVENT = 'Weave:emergent-child-popup-open';
  const EMERGENT_CHILD_POPUP_CLOSE_EVENT = 'Weave:emergent-child-popup-close';

  //  移动端状态
  let isMobile = $state(false);
  
  //  移动端彩色圆点配置（用于分类筛选）
  // 使用数据层的 Deck 类型

  // 数据状态
  let decks = $state<Deck[]>([]);
  let deckTree = $state<DeckTreeNode[]>([]);
  let emergentCandidates = $state<EmergentDeckCandidate[]>([]);
  let emergentRuntime = $state<MemoryDeckOrganizationRuntime | null>(null);
  let emergentDeckViews = $state<MemoryDeckView[]>([]);
  let emergentDeckStats = $state<Record<string, DeckStats>>({});
  let formalDeckBindingSummary = $state<Record<string, FormalDeckBindingSummary>>({});
  let deckStats = $state<Record<string, DeckStats>>({});
  let studySessions = $state<StudySession[]>([]);
  let memoryDeckLevels = $state<Record<string, MemoryDeckLevelProgress>>({});
  
  // 考试题组和增量阅读的牌组树（用于看板视图）
  let qbDeckTree = $state<DeckTreeNode[]>([]);
  let qbDeckStats = $state<Record<string, DeckStats>>({});
  let irDeckTree = $state<DeckTreeNode[]>([]);
  let irDeckStats = $state<Record<string, DeckStats>>({});
  
  type ActiveDeckView = 'kanban' | 'grid';
  type ActiveDeckFilter = 'memory' | 'question-bank';
  type MemoryDeckDisplayMode = 'formal' | 'emergent';
  type DeckFilterInput = ActiveDeckFilter | 'reading' | 'parent' | 'child' | 'all';

  const premiumGuard = PremiumFeatureGuard.getInstance();
  const deckStudyFeatureContext: PremiumFeatureAccessContext = { page: 'deck-study' };
  const deckAnalyticsEntryFeatures = [
    PREMIUM_FEATURES.DECK_ANALYTICS,
    PREMIUM_FEATURES.DECK_ANALYTICS_RETENTION,
    PREMIUM_FEATURES.DECK_ANALYTICS_TIMING,
  ] as const;

  function parseStoredDeckFilter(value: string | null): ActiveDeckFilter {
    if (value === 'question-bank') {
      return value;
    }

    return 'memory';
  }

  function normalizeDeckStudyView(value: string | null | undefined): ActiveDeckView {
    return value === 'kanban' && premiumGuard.canUseFeature(PREMIUM_FEATURES.KANBAN_VIEW, deckStudyFeatureContext)
      ? 'kanban'
      : 'grid';
  }

  function getInitialDeckStudyView(): ActiveDeckView {
    return normalizeDeckStudyView(plugin.getCachedDeckViewPreference());
  }

  function normalizeMemoryDeckDisplayMode(value: string | null | undefined): MemoryDeckDisplayMode {
    return value === 'emergent' && premiumGuard.canUseFeature(PREMIUM_FEATURES.EMERGENT_DECKS, deckStudyFeatureContext)
      ? 'emergent'
      : 'formal';
  }

  let currentView = $state<ActiveDeckView>(getInitialDeckStudyView());
  let memoryDeckDisplayMode = $state<MemoryDeckDisplayMode>((() => {
    try {
      return normalizeMemoryDeckDisplayMode(vaultStorage.getItem('weave-memory-deck-display-mode'));
    } catch {}
    return 'formal';
  })());
  
  // 牌组模式筛选状态
  // 只保留当前仍可用的筛选值；旧筛选值在读取阶段统一映射到 memory
  let selectedFilter = $state<ActiveDeckFilter>((() => {
    try {
      return parseStoredDeckFilter(vaultStorage.getItem('weave-deck-mode-filter'));
    } catch {}
    return 'memory';
  })());
  
  let isPremium = $state(get(premiumGuard.isPremiumActive));
  let showPremiumFeaturesPreview = $state(get(premiumGuard.premiumFeaturesPreviewEnabled));
  let showActivationPrompt = $state(false);
  let promptFeatureId = $state('');

  // 订阅高级版状态
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
    }, deckStudyFeatureContext);
  }

  function getPremiumEntryTitle(baseTitle: string, featureId: string): string {
    return premiumGuard.getFeatureEntryTitle(baseTitle, featureId, deckStudyFeatureContext);
  }

  function isAPKGImportEnabled(): boolean {
    return plugin.settings.navigationVisibility?.apkgImport !== false;
  }

  function isCSVImportEnabled(): boolean {
    return plugin.settings.navigationVisibility?.csvImport !== false;
  }

  function applyMemoryDeckDisplayMode(
    mode: string | null | undefined,
    { persist = true }: { persist?: boolean } = {}
  ): void {
    const normalizedMode = normalizeMemoryDeckDisplayMode(mode);

    if (
      normalizedMode === 'emergent' &&
      premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.EMERGENT_DECKS, deckStudyFeatureContext)
    ) {
      promptFeatureId = PREMIUM_FEATURES.EMERGENT_DECKS;
      showActivationPrompt = true;
      return;
    }

    memoryDeckDisplayMode = normalizedMode;

    if (persist) {
      vaultStorage.setItem('weave-memory-deck-display-mode', normalizedMode);
    }

    window.dispatchEvent(
      new CustomEvent('Weave:memory-deck-display-mode-change', {
        detail: { mode: normalizedMode },
      })
    );
  }

  let canShowMemoryDeckLevels = $derived(
    premiumGuard.canUseFeature(PREMIUM_FEATURES.MEMORY_DECK_LEVELS, deckStudyFeatureContext)
  );

  const menuCoordinator = createDeckStudyMenuCoordinator({
    getPlugin: () => plugin,
    getDeckCount: () => decks.length,
    getCurrentView: () => currentView,
    setCurrentView: (view) => {
      currentView = view;
    },
    getSelectedFilter: () => selectedFilter,
    setSelectedFilter: (filter) => {
      selectedFilter = filter;
    },
    getMemoryDeckDisplayMode: () => memoryDeckDisplayMode,
    setMemoryDeckDisplayMode: (mode) => {
      applyMemoryDeckDisplayMode(mode);
    },
    showEmergentRuleGroupMenu,
    tr: (key: string, vars?: Record<string, string>) => t(key, vars),
    isFeatureRestricted: (featureId: string) => premiumGuard.isFeatureRestricted(featureId, deckStudyFeatureContext),
    canUseFeature: (featureId: string) => premiumGuard.canUseFeature(featureId, deckStudyFeatureContext),
    promptPremiumFeature: (featureId: string) => {
      promptFeatureId = featureId;
      showActivationPrompt = true;
    },
    isAPKGImportEnabled,
    isCSVImportEnabled,
    shouldShowPremiumEntry,
    getPremiumEntryTitle,
    openAPKGImport: () => {
      modalCoordinator.showAPKGImportModal();
    },
    handleCSVImport,
    exportDeck,
    routeCreateDeckByFilter: async (filter: string) => {
      await modalCoordinator.handleCreateDeckForCurrentFilter(filter);
    },
  });

  function getEmergentRuleGroups(): EmergentRuleGroup[] {
    return getNormalizedEmergentRuleGroups(plugin.settings.memoryDeckOrganization);
  }

  function getActiveEmergentRuleGroupState(): EmergentRuleGroup {
    return getActiveEmergentRuleGroup(plugin.settings.memoryDeckOrganization);
  }

  async function saveEmergentRuleGroups(
    groups: EmergentRuleGroup[],
    activeRuleGroupId: string
  ): Promise<void> {
    const normalizedGroups = groups.length > 0 ? groups : [DEFAULT_EMERGENT_RULE_GROUP];
    const activeGroup =
      normalizedGroups.find((group) => group.id === activeRuleGroupId) || normalizedGroups[0];

    plugin.settings.memoryDeckOrganization = {
      ...(plugin.settings.memoryDeckOrganization || {}),
      enabled: plugin.settings.memoryDeckOrganization?.enabled !== false,
      minCandidateCardCount: activeGroup.minCandidateCardCount,
      activeRuleGroupId: activeGroup.id,
      ruleGroups: normalizedGroups,
    };

    await plugin.saveSettings();
    await refreshData(true);
    plugin.app.workspace.trigger("Weave:data-changed");
  }

  function getEmergentRuleViewportBox(): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const viewport = window.visualViewport;
    if (viewport) {
      return {
        left: viewport.offsetLeft,
        top: viewport.offsetTop,
        width: viewport.width,
        height: viewport.height,
      };
    }

    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  function updateEmergentRuleGroupPopoverPosition(): void {
    const viewport = getEmergentRuleViewportBox();
    const isCompactViewport = viewport.width <= 720;
    const preferredWidth = isCompactViewport
      ? Math.min(400, Math.max(292, viewport.width - 24))
      : Math.min(720, Math.max(560, viewport.width - 96));
    const maxHeight = Math.max(320, Math.min(680, viewport.height - 40));
    const minLeft = viewport.left + 12;
    const maxLeft = Math.max(minLeft, viewport.left + viewport.width - preferredWidth - 12);

    let left = maxLeft;
    let top = viewport.top + 56;

    if (emergentRuleGroupAnchor?.isConnected) {
      const rect = emergentRuleGroupAnchor.getBoundingClientRect();
      left = Math.max(minLeft, Math.min(rect.right - preferredWidth, maxLeft));

      const preferredTop = rect.bottom + 8;
      const maxTop = viewport.top + viewport.height - maxHeight - 12;
      if (preferredTop <= maxTop) {
        top = preferredTop;
      } else {
        top = Math.max(viewport.top + 12, rect.top - maxHeight - 8);
      }
    }

    emergentRuleGroupPopoverStyle =
      `top: ${Math.round(top)}px; ` +
      `left: ${Math.round(left)}px; ` +
      `width: ${Math.round(preferredWidth)}px; ` +
      `max-height: ${Math.round(maxHeight)}px;`;
  }

  function openEmergentRuleGroupPopover(anchor?: HTMLElement | null): void {
    const groups = getEmergentRuleGroups();
    const activeGroup = getActiveEmergentRuleGroupState();
    emergentRuleGroupDrafts = groups.map((group) => ({ ...group }));
    emergentRuleGroupDraftActiveId = activeGroup.id;
    emergentRuleGroupVisibleConditions = Object.fromEntries(
      groups.map((group) => [group.id, buildVisibleEmergentRuleConditionKeys(group)])
    );
    emergentRuleGroupAnchor = anchor || null;
    updateEmergentRuleGroupPopoverPosition();
    showEmergentRuleGroupPopover = true;
  }

  function registerEmergentRuleGroupPopoverBridge(): () => void {
    const api = window as Window & {
      __weaveOpenEmergentRuleGroupPopover?: (anchor?: HTMLElement | null) => void;
    };
    const openPopover = (anchor?: HTMLElement | null) => {
      openEmergentRuleGroupPopover(anchor);
    };

    api.__weaveOpenEmergentRuleGroupPopover = openPopover;

    return () => {
      if (api.__weaveOpenEmergentRuleGroupPopover === openPopover) {
        delete api.__weaveOpenEmergentRuleGroupPopover;
      }
    };
  }

  function closeEmergentRuleGroupPopover(): void {
    showEmergentRuleGroupPopover = false;
    emergentRuleGroupAnchor = null;
    emergentRuleGroupVisibleConditions = {};
  }

  function markEmergentChildPopupClosed(graceMs = 180): void {
    emergentChildPopupCloseGuardUntil = Date.now() + Math.max(0, graceMs);
  }

  function isEmergentChildPopupInteractionProtected(): boolean {
    return Date.now() <= emergentChildPopupCloseGuardUntil;
  }

  function portalToBody(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode === document.body) {
          document.body.removeChild(node);
        }
      }
    };
  }

  function getAnchorRect(anchor?: HTMLElement | null):
    | {
        left: number;
        right: number;
        top: number;
        bottom: number;
        width: number;
        height: number;
      }
    | undefined {
    if (!anchor) return undefined;
    const rect = anchor.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }

  function collectAvailableVaultTags(): Array<{ name: string; count: number }> {
    return buildTagSuggestionOptions(plugin.app, [], "memory");
  }

  function updateEmergentRuleGroupDraftName(groupId: string, name: string): void {
    emergentRuleGroupDrafts = updateEmergentRuleGroupName(
      emergentRuleGroupDrafts,
      groupId,
      name.trim() || resolveCurrentEmergentRuleGroupDraft(emergentRuleGroupDrafts, groupId).name
    );
  }

  function updateEmergentRuleGroupDraftThreshold(groupId: string, value: string): void {
    emergentRuleGroupDrafts = updateEmergentRuleGroupThreshold(emergentRuleGroupDrafts, groupId, value);
  }

  function createEmergentRuleGroupDraft(): void {
    const nextState = appendCreatedEmergentRuleGroupDraftState({
      groups: emergentRuleGroupDrafts,
      activeGroupId: emergentRuleGroupDraftActiveId,
      primaryTagFieldByGroup: {},
      visibleConditionsByGroup: emergentRuleGroupVisibleConditions,
    });
    emergentRuleGroupDrafts = nextState.groups;
    emergentRuleGroupDraftActiveId = nextState.activeGroupId;
    emergentRuleGroupVisibleConditions = nextState.visibleConditionsByGroup;
  }

  function selectEmergentRuleGroupDraft(groupId: string): void {
    emergentRuleGroupDraftActiveId = groupId;
  }

  function getCurrentEmergentRuleGroupDraft(): EmergentRuleGroup {
    return resolveCurrentEmergentRuleGroupDraft(emergentRuleGroupDrafts, emergentRuleGroupDraftActiveId);
  }

  function appendEmergentRuleGroupTagDraft(
    groupId: string,
    field: "requiredTags" | "excludedTags",
    tag: string
  ): void {
    emergentRuleGroupDrafts = appendEmergentRuleGroupTag(emergentRuleGroupDrafts, groupId, field, tag);
  }

  function removeEmergentRuleGroupTagDraft(
    groupId: string,
    field: "requiredTags" | "excludedTags",
    tag: string
  ): void {
    emergentRuleGroupDrafts = removeEmergentRuleGroupTag(emergentRuleGroupDrafts, groupId, field, tag);
  }

  function getVisibleEmergentRuleConditions(groupId: string): EmergentRuleConditionKey[] {
    const group = emergentRuleGroupDrafts.find((item) => item.id === groupId);
    if (!group) return [];

    return mergeVisibleEmergentRuleConditionKeys(
      emergentRuleGroupVisibleConditions[groupId] || [],
      group
    );
  }

  function showEmergentRuleGroupSwitcherMenu(event: MouseEvent): void {
    const menu = new Menu();

    emergentRuleGroupDrafts.forEach((group, index) => {
      menu.addItem((item) => {
        item
          .setTitle(group.name || `规则组 ${index + 1}`)
          .setIcon(group.id === emergentRuleGroupDraftActiveId ? "check" : "gallery-vertical")
          .onClick(() => {
            selectEmergentRuleGroupDraft(group.id);
          });
      });
    });

    menu.showAtMouseEvent(event);
  }

  function duplicateEmergentRuleGroupDraft(groupId: string): void {
    const nextState = appendDuplicatedEmergentRuleGroupDraftState(
      {
        groups: emergentRuleGroupDrafts,
        activeGroupId: emergentRuleGroupDraftActiveId,
        primaryTagFieldByGroup: {},
        visibleConditionsByGroup: emergentRuleGroupVisibleConditions,
      },
      groupId
    );
    if (!nextState) return;
    emergentRuleGroupDrafts = nextState.groups;
    emergentRuleGroupDraftActiveId = nextState.activeGroupId;
    emergentRuleGroupVisibleConditions = nextState.visibleConditionsByGroup;
  }

  function showEmergentRuleGroupMoreMenu(event: MouseEvent, groupId: string): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle("复制筛选组")
        .setIcon("copy")
        .onClick(() => duplicateEmergentRuleGroupDraft(groupId));
    });

    menu.addItem((item) => {
      item
        .setTitle("删除筛选组")
        .setIcon("trash")
        .onClick(() => removeEmergentRuleGroupDraftV2(groupId));
    });

    menu.showAtMouseEvent(event);
  }

  function setEmergentRuleConditionVisible(groupId: string, conditionKey: EmergentRuleConditionKey): void {
    emergentRuleGroupVisibleConditions = setEmergentRuleConditionVisibleInState(emergentRuleGroupVisibleConditions, groupId, conditionKey);
  }

  function clearEmergentRuleCondition(groupId: string, conditionKey: EmergentRuleConditionKey): void {
    const nextState = clearEmergentRuleConditionState(
      emergentRuleGroupDrafts,
      emergentRuleGroupVisibleConditions,
      groupId,
      conditionKey
    );
    emergentRuleGroupDrafts = nextState.groups;
    emergentRuleGroupVisibleConditions = nextState.visibleConditionsByGroup;
  }

  function showEmergentRuleConditionMenu(event: MouseEvent, groupId: string): void {
    const visibleConditions = new Set(getVisibleEmergentRuleConditions(groupId));
    const menu = new Menu();
    let hasItem = false;

    EMERGENT_RULE_ADDABLE_CONDITION_OPTIONS.forEach((condition) => {
      if (visibleConditions.has(condition.key)) return;
      hasItem = true;
      menu.addItem((item) => {
        item
          .setTitle(condition.title)
          .setIcon(condition.icon)
          .onClick(() => setEmergentRuleConditionVisible(groupId, condition.key));
      });
    });

    if (!hasItem) {
      new Notice("可添加的条件已经全部显示", 2500);
      return;
    }

    menu.showAtMouseEvent(event);
  }

  function showEmergentRuleConditionRowMenu(
    event: MouseEvent,
    groupId: string,
    conditionKey: EmergentRuleConditionKey
  ): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle("清空条件")
        .setIcon("eraser")
        .onClick(() => clearEmergentRuleCondition(groupId, conditionKey));
    });

    menu.showAtMouseEvent(event);
  }

  function openEmergentRuleTagSuggestModal(
    groupId: string,
    field: "requiredTags" | "excludedTags",
    anchor?: HTMLElement | null
  ): void {
    const currentGroup = emergentRuleGroupDrafts.find((group) => group.id === groupId);
    if (!currentGroup) return;

    const existingTags = new Set(
      (currentGroup[field] || [])
        .map((tag) => normalizeTagSuggestionValue(tag).toLowerCase())
        .filter(Boolean)
    );
    const items: BatchTagSuggestItem[] = normalizeTagSuggestionOptions(collectAvailableVaultTags())
      .filter((item) => !existingTags.has(item.key));

    if (items.length === 0) {
      new Notice("没有可添加的标签", 2500);
      return;
    }

    new BatchTagSuggestModal(
      plugin.app,
      items,
      (item) => {
        appendEmergentRuleGroupTagDraft(groupId, field, item.tag);
      },
      {
        placeholder: field === "requiredTags" ? "搜索要包含的标签..." : "搜索要排除的标签...",
        anchorRect: getAnchorRect(anchor),
      }
    ).open();
  }

  function updateEmergentRuleGroupDateDraft(
    groupId: string,
    field: "createdAfter" | "createdBefore",
    value: string
  ): void {
    emergentRuleGroupDrafts = updateEmergentRuleGroupDate(emergentRuleGroupDrafts, groupId, field, value);
  }

  function updateEmergentRuleGroupPriorityDraft(
    groupId: string,
    field: "priorityMin" | "priorityMax",
    value: string
  ): void {
    emergentRuleGroupDrafts = updateEmergentRuleGroupPriority(emergentRuleGroupDrafts, groupId, field, value);
  }

  function updateEmergentRuleGroupOnlyLearnableDraft(groupId: string, value: boolean): void {
    emergentRuleGroupDrafts = updateEmergentRuleGroupOnlyLearnable(emergentRuleGroupDrafts, groupId, value);
  }

  async function addEmergentRuleGroupSourceFolderDraft(groupId: string, anchor?: HTMLElement | null): Promise<void> {
    const picker = new VaultFolderSuggestModal(plugin.app, {
      placeholder: "选择要观察的来源文件夹",
      anchorRect: getAnchorRect(anchor),
    });
    const selectedFolder = await picker.openAndSelect();
    if (!selectedFolder) return;

    const normalizedFolder = selectedFolder === "/" ? "/" : normalizePath(selectedFolder);
    emergentRuleGroupDrafts = appendEmergentRuleGroupSourceFolder(emergentRuleGroupDrafts, groupId, normalizedFolder);
  }

  function removeEmergentRuleGroupSourceFolderDraft(groupId: string, folderPath: string): void {
    emergentRuleGroupDrafts = removeEmergentRuleGroupSourceFolder(emergentRuleGroupDrafts, groupId, folderPath);
  }

  function removeEmergentRuleGroupDraftV2(groupId: string): void {
    const nextState = removeEmergentRuleGroupDraftState(
      {
        groups: emergentRuleGroupDrafts,
        activeGroupId: emergentRuleGroupDraftActiveId,
        primaryTagFieldByGroup: {},
        visibleConditionsByGroup: emergentRuleGroupVisibleConditions,
      },
      groupId
    );
    if (!nextState) {
      new Notice("至少需要保留一个涌现筛选组", 3000);
      return;
    }
    emergentRuleGroupDrafts = nextState.groups;
    emergentRuleGroupDraftActiveId = nextState.activeGroupId;
    emergentRuleGroupVisibleConditions = nextState.visibleConditionsByGroup;
  }

  async function applyEmergentRuleGroupDraftsV2(): Promise<void> {
    const nextGroups = normalizeEmergentRuleGroupsForSave(emergentRuleGroupDrafts);
    await saveEmergentRuleGroups(nextGroups, emergentRuleGroupDraftActiveId);
    const activeGroup = nextGroups.find((group) => group.id === emergentRuleGroupDraftActiveId) || nextGroups[0];
    new Notice(`已应用涌现筛选组：${activeGroup?.name || "默认规则组"}`, 3000);
    closeEmergentRuleGroupPopover();
  }

  function promptPremiumFeature(featureId: string): void {
    promptFeatureId = featureId;
    showActivationPrompt = true;
  }

  function openPremiumFeature(featureId: string, onAllowed: () => void): void {
    if (!premiumGuard.canUseFeature(featureId, deckStudyFeatureContext)) {
      promptPremiumFeature(featureId);
      return;
    }

    onAllowed();
  }

  function handleCSVImport(): void {
    if (!isCSVImportEnabled()) {
      return;
    }

    openPremiumFeature(PREMIUM_FEATURES.CSV_IMPORT, () => {
      showCSVImportModal = true;
    });
  }

  function normalizeDeckFilter(filter: DeckFilterInput): ActiveDeckFilter {
    return menuCoordinator.normalizeDeckFilter(filter) as ActiveDeckFilter;
  }

  $effect(() => {
    const normalizedFilter = normalizeDeckFilter(selectedFilter);
    if (normalizedFilter === selectedFilter) {
      return;
    }

    selectedFilter = normalizedFilter;
    vaultStorage.setItem('weave-deck-mode-filter', selectedFilter);
    window.dispatchEvent(new CustomEvent('Weave:deck-filter-change', { detail: selectedFilter }));
  });

  const pageRuntimeController = createDeckStudyPageRuntimeController({
    getPlugin: () => plugin,
    getSelectedFilter: () => selectedFilter,
    normalizeDeckStudyView,
    setCurrentView: (value: string) => {
      currentView = normalizeDeckStudyView(value);
    },
    setIsMobile: (value: boolean) => {
      isMobile = value;
    },
    registerEmergentRuleGroupPopoverBridge,
    refreshData,
    scheduleBackgroundRefresh,
    handleFilterSelect: (filter: string) => {
      handleFilterSelect(filter as DeckFilterInput);
    },
    handleMemoryDeckMenuAction,
    showViewSwitcher,
    showMobileNavMenu: showMobileNavMenuWithObsidianAPI,
    showEmergentRuleGroupMenu,
    setMemoryDeckDisplayMode: (mode: string | null | undefined) => {
      applyMemoryDeckDisplayMode(mode);
    },
  });

  onMount(() => pageRuntimeController.mount());

  onDestroy(() => {
    deckAnalyticsModalInstance?.close();
    deckAnalyticsModalInstance = null;
    modalCoordinator.closeAll();
    refreshCoordinator.dispose();
    if (persistStatsTimer) {
      clearTimeout(persistStatsTimer);
      persistStatsTimer = null;
    }
  });

  $effect(() => {
    const handleEmergentChildPopupOpen = () => {
      emergentChildPopupOpenCount += 1;
    };

    const handleEmergentChildPopupClose = (event: Event) => {
      const detail = (event as CustomEvent<{ graceMs?: number } | undefined>).detail;
      emergentChildPopupOpenCount = Math.max(0, emergentChildPopupOpenCount - 1);
      markEmergentChildPopupClosed(detail?.graceMs ?? 180);
    };

    window.addEventListener(EMERGENT_CHILD_POPUP_OPEN_EVENT, handleEmergentChildPopupOpen as EventListener);
    window.addEventListener(EMERGENT_CHILD_POPUP_CLOSE_EVENT, handleEmergentChildPopupClose as EventListener);

    return () => {
      window.removeEventListener(EMERGENT_CHILD_POPUP_OPEN_EVENT, handleEmergentChildPopupOpen as EventListener);
      window.removeEventListener(EMERGENT_CHILD_POPUP_CLOSE_EVENT, handleEmergentChildPopupClose as EventListener);
    };
  });

  $effect(() => {
    if (!showEmergentRuleGroupPopover) return;

    updateEmergentRuleGroupPopoverPosition();

    const hasEmergentChildPopupOpen = () => {
      if (typeof document === "undefined") return false;
      return Boolean(
        document.querySelector(".menu") ||
        document.querySelector(".suggestion-container") ||
        document.querySelector(".weave-vault-folder-suggest-popover") ||
        document.querySelector(".weave-batch-tag-suggest-popover") ||
        document.querySelector(".weave-ir-deck-suggest-popover")
      );
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (hasEmergentChildPopupOpen() || isEmergentChildPopupInteractionProtected()) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.weave-emergent-rule-popover')) return;
      if (target?.closest('.deck-study-toolbar-btn')) return;
      if (target?.closest('.menu')) return;
      if (target?.closest('.menu-item')) return;
      if (target?.closest('.suggestion')) return;
      if (target?.closest('.suggestion-container')) return;
      if (target?.closest('.suggestion-item')) return;
      closeEmergentRuleGroupPopover();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeEmergentRuleGroupPopover();
      }
    };

    const handleViewportChange = () => {
      updateEmergentRuleGroupPopoverPosition();
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  });
  
// 视图切换逻辑（使用 Obsidian Menu API）
  function showViewSwitcher(evt: MouseEvent) {
    menuCoordinator.showViewSwitcher(evt);
  }

  function showEmergentRuleGroupMenu(anchor?: HTMLElement | null): void {
    if (showEmergentRuleGroupPopover) {
      closeEmergentRuleGroupPopover();
      return;
    }

    openEmergentRuleGroupPopover(anchor);
  }

  // 显示更多操作菜单（使用 Obsidian 原生菜单）
  function showMoreActionsMenu(event: MouseEvent) {
    menuCoordinator.showMoreActionsMenu(event);
  }

  async function waitForAllCoreServices(): Promise<void> {
    await waitForServiceReady('allCoreServices', 15000);
  }

  async function loadDecks(): Promise<Deck[]> {
    decks = await dataStorage.getDecks();
    return decks;
  }

  async function loadStudySessionsData(): Promise<StudySession[]> {
    return dataStorage.getStudySessions();
  }

  async function resolveRefreshTargetDeckIds(
    targetDeckIds: string[],
    availableDecks: Deck[]
  ): Promise<string[]> {
    const availableDeckIds = new Set(availableDecks.map((deck) => deck.id));
    return Array.from(
      new Set(targetDeckIds.map((deckId) => String(deckId || '').trim()).filter(Boolean))
    ).filter((deckId) => availableDeckIds.has(deckId));
  }

  const refreshCoordinator = createDeckStudyRefreshCoordinator({
    setIsLoading: (value: boolean) => {
      isLoading = value;
    },
    loadDecks,
    loadStudySessionsData,
    calculateDeckStats,
    loadDeckTree,
    loadStudySessions,
    resolveRefreshTargetDeckIds,
    waitForAllCoreServices,
  });

  async function refreshData(showLoading = false) {
    await refreshCoordinator.refreshData(showLoading);
  }

  async function refreshTargetedDeckData(targetDeckIds: string[]) {
    await refreshCoordinator.refreshTargetedDeckData(targetDeckIds);
  }

  function scheduleBackgroundRefresh(event?: DataChangeEvent): void {
    refreshCoordinator.scheduleBackgroundRefresh(event);
  }
  
  // 当切换到kanban视图或切换模式时，加载对应的牌组树数据
  $effect(() => {
    const view = currentView;
    const filter = selectedFilter;
    if (view === 'kanban') {
      if (filter === 'question-bank') {
        loadQBDeckTree();
      }
    }
  });

  // 加载考试题组树（用于看板视图）
  async function loadQBDeckTree() {
    try {
      if (!plugin.questionBankService || !plugin.questionBankHierarchy || !plugin.deckHierarchy) return;
      const memoryTree = await plugin.deckHierarchy.getDeckTree();
      qbDeckTree = await plugin.questionBankHierarchy.buildQuestionBankTree(memoryTree);
      // 构建统计
      // 映射QB统计到DeckStats格式，与QuestionBankGridCard显示一致:
      // newCards → 总题(total), learningCards → 已练(completed), reviewCards → 错题(errorCount)
      const stats: Record<string, DeckStats> = {};
      for (const node of qbDeckTree) {
        const bank = node.deck;
        const questions = plugin.questionBankService ? await plugin.questionBankService.getQuestionsByBank(bank.id) : [];
        const total = questions.length;
        let completed = 0;
        let errorCount = 0;
        for (const q of questions) {
          if ((q as any).stats?.testStats?.attempts > 0) {
            completed++;
            errorCount += (q as any).stats?.testStats?.incorrectAttempts || 0;
          }
        }
        stats[bank.id] = {
          totalCards: total, newCards: total, learningCards: completed, reviewCards: errorCount,
          todayNew: 0, todayReview: 0, todayTime: 0, totalReviews: 0, totalTime: 0, memoryRate: 0, averageEase: 0, forecastDays: {}
        };
      }
      qbDeckStats = stats;
    } catch (e) {
      logger.warn('[DeckStudyPage] loadQBDeckTree failed:', e);
    }
  }
// 父子卡片牌组筛选相关函数
  function isParentCardDeck(deck: Deck): boolean {
    return deck.metadata?.pairedChildDeck != null;
  }

  function isChildCardDeck(deck: Deck): boolean {
    return deck.metadata?.pairedParentDeck != null;
  }

  function handleFilterSelect(filter: DeckFilterInput) {
    menuCoordinator.handleFilterSelect(filter);
  }
  
  //  移动端菜单按钮点击处理 - 使用 Obsidian Menu API
  function handleMobileMenuClick(evt: MouseEvent) {
    showMobileNavMenuWithObsidianAPI(evt);
  }
  
  //  使用 Obsidian 原生 Menu API 显示移动端导航菜单
  function showMobileNavMenuWithObsidianAPI(evt: MouseEvent) {
    menuCoordinator.showMobileNavMenu(evt);
  }
  
  // 获取最近学习的牌组ID
  function getRecentlyStudiedDeck(): string | null {
    if (studySessions.length === 0) return null;
    
    // 按开始时间倒序排序
    const sorted = [...studySessions].sort((a, b) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
    
    // 返回最近一次学习的牌组ID
    return sorted[0].deckId;
  }
  
  // 继续学习功能（选择最近学习的牌组）
  async function handleContinueStudy() {
    try {
      // 尝试获取最近学习的牌组
      let targetDeckId = getRecentlyStudiedDeck();
      
      // 如果没有最近学习记录，选择第一个有待办的牌组
      if (!targetDeckId) {
        for (const deckId of Object.keys(deckStats)) {
          const stats = deckStats[deckId];
          const totalDue = (stats?.newCards ?? 0) + (stats?.learningCards ?? 0) + (stats?.reviewCards ?? 0);
          if (totalDue > 0) {
            targetDeckId = deckId;
            break;
          }
        }
      }
      
      // 如果找到了目标牌组，开始学习
      if (targetDeckId) {
        await startStudy(targetDeckId);
      } else {
        new Notice(t('deckStudyPage.study.noDeckAvailable'));
      }
    } catch (error) {
      logger.error('[DeckStudyPage] 继续学习失败:', error);
      new Notice(t('notifications.error.startStudy'));
    }
  }

  // 加载牌组树
  async function loadDeckTree() {
    try {
      //  等待 deckHierarchy 服务就绪
      const deckHierarchy = await waitForService(
        () => plugin?.deckHierarchy,
        'deckHierarchy',
        5000
      );
      
      deckTree = await deckHierarchy.getDeckTree();
    } catch (error) {
      logger.error('[DeckStudyPage] Failed to load deck tree:', error);
      deckTree = [];
    }
  }

  // 计算牌组统计
  //  v3.0: 使用 UnifiedStudyProvider 确保统计与队列 100% 一致（参考Anki架构）
  // 核心改进：统计数据直接从学习队列派生，而非独立计算
  function buildDeckCardsMap(cards: Card[], deckList: Deck[]): Map<string, Card[]> {
    const cardsByDeck = new Map<string, Card[]>();
    const activeDeckIds = new Set<string>();

    for (const deck of deckList) {
      cardsByDeck.set(deck.id, []);
      activeDeckIds.add(deck.id);
    }

    for (const card of cards) {
      const deckIds = plugin.settings.memoryDeckOrganization?.enabled === false
        ? getCardDeckIds(card, deckList, { fallbackToReferences: false }).deckIds
        : getEmergentDeckService(plugin).getResolvedDeckIdsForCard(card, deckList, emergentRuntime || undefined);
      if (!deckIds || deckIds.length === 0) {
        continue;
      }

      for (const deckId of deckIds) {
        if (!activeDeckIds.has(deckId)) {
          continue;
        }
        cardsByDeck.get(deckId)?.push(card);
      }
    }

    return cardsByDeck;
  }

  function getEmergentRuleCardTags(card: Card): string[] {
    const contentTags = extractAllTags(card.content || "");
    const legacyTags = Array.isArray(card.tags) ? card.tags : [];
    return [...new Set([...contentTags, ...legacyTags].map((tag) => String(tag || "").trim()).filter(Boolean))];
  }

  function getEmergentRuleCardSourcePath(card: Card): string {
    const sourceInfo = parseSourceInfo(card.content || "");
    const fromYaml =
      typeof sourceInfo?.sourceFile === "string"
        ? sourceInfo.sourceFile
        : typeof (sourceInfo as { source?: string } | null)?.source === "string"
          ? (sourceInfo as { source?: string }).source || ""
          : "";
    return normalizePath(String(card.sourceFile || fromYaml || "").trim());
  }

  function getEmergentRuleCardFolderPath(card: Card): string {
    const sourcePath = getEmergentRuleCardSourcePath(card);
    if (!sourcePath) {
      return "";
    }

    const parts = sourcePath.split("/");
    parts.pop();
    return parts.length > 0 ? parts.join("/") : "/";
  }

  function matchesEmergentRuleGroup(card: Card, group: EmergentRuleGroup): boolean {
    const tags = getEmergentRuleCardTags(card);
    const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));

    if (group.requiredTags.length > 0) {
      const hasRequiredTag = group.requiredTags.some((tag) => tagSet.has(String(tag).toLowerCase()));
      if (!hasRequiredTag) {
        return false;
      }
    }

    if (group.excludedTags.length > 0) {
      const hasExcludedTag = group.excludedTags.some((tag) => tagSet.has(String(tag).toLowerCase()));
      if (hasExcludedTag) {
        return false;
      }
    }

    if (group.sourceFolders.length > 0) {
      const folderPath = getEmergentRuleCardFolderPath(card);
      const matchesFolder = group.sourceFolders.some((folder) => {
        const normalizedFolder = folder === "/" ? "/" : normalizePath(folder);
        if (!normalizedFolder) return false;
        if (normalizedFolder === "/") return !!folderPath;
        return folderPath === normalizedFolder || folderPath.startsWith(`${normalizedFolder}/`);
      });
      if (!matchesFolder) {
        return false;
      }
    }

    const priority = typeof card.priority === "number" ? card.priority : null;
    if (group.priorityMin !== null && (priority === null || priority < group.priorityMin)) {
      return false;
    }
    if (group.priorityMax !== null && (priority === null || priority > group.priorityMax)) {
      return false;
    }

    const createdAt = new Date(card.created).getTime();
    if (group.createdAfter) {
      const afterTime = new Date(`${group.createdAfter}T00:00:00`).getTime();
      if (Number.isFinite(afterTime) && (!Number.isFinite(createdAt) || createdAt < afterTime)) {
        return false;
      }
    }
    if (group.createdBefore) {
      const beforeTime = new Date(`${group.createdBefore}T23:59:59.999`).getTime();
      if (Number.isFinite(beforeTime) && (!Number.isFinite(createdAt) || createdAt > beforeTime)) {
        return false;
      }
    }

    return true;
  }

  function hasLearnableCardsInDeckStats(stats?: DeckStats | null): boolean {
    if (!stats) return false;
    return (stats.newCards ?? 0) + (stats.learningCards ?? 0) + (stats.reviewCards ?? 0) > 0;
  }

  async function refreshEmergentDeckRuntime(cards?: Card[]): Promise<MemoryDeckOrganizationRuntime | null> {
    const emergentDeckService = getEmergentDeckService(plugin);
    if (!emergentDeckService.isEnabled()) {
      emergentRuntime = null;
      emergentCandidates = [];
      emergentDeckViews = [];
      emergentDeckStats = {};
      formalDeckBindingSummary = {};
      return null;
    }

    const allCards = Array.isArray(cards) ? cards : await dataStorage.getAllCards();
    const activeRuleGroup = getActiveEmergentRuleGroupState();
    const filteredCards = allCards.filter((card) => matchesEmergentRuleGroup(card, activeRuleGroup));
    const runtime = await emergentDeckService.buildRuntimeWithBindings(filteredCards, decks, {
      minCandidateCardCount: activeRuleGroup.minCandidateCardCount,
    });
    const shouldDeferLearnableOnlyVisibility = activeRuleGroup.onlyLearnableDecks === true;
    emergentRuntime = runtime;
    emergentCandidates = shouldDeferLearnableOnlyVisibility
      ? []
      : runtime.candidates.filter((candidate) => candidate.status !== 'ignored');
    emergentDeckViews = shouldDeferLearnableOnlyVisibility ? [] : runtime.emergentDeckViews;
    formalDeckBindingSummary = runtime.formalDeckSummary;
    return runtime;
  }

  function buildTodayLearnedNewCardsMap(allSessions: StudySession[]): Map<string, number> {
    const counts = new Map<string, number>();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    for (const session of allSessions) {
      const startTime = new Date(session.startTime).getTime();
      if (startTime < todayStart || !session.deckId) {
        continue;
      }

      counts.set(
        session.deckId,
        (counts.get(session.deckId) || 0) + (session.newCardsLearned || 0)
      );
    }

    return counts;
  }

  async function loadStudySessions(allStudySessions?: StudySession[]) {
    try {
      const sessions = Array.isArray(allStudySessions)
        ? allStudySessions
        : await dataStorage.getStudySessions();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const threshold = thirtyDaysAgo.getTime();

      studySessions = sessions.filter((session) => {
        const startTime = new Date(session.startTime).getTime();
        return Number.isFinite(startTime) && startTime >= threshold;
      });
    } catch (error) {
      logger.error('[DeckStudyPage] 加载学习历史失败:', error);
      studySessions = [];
    }
  }

  async function calculateDeckStats(allStudySessions: StudySession[] = [], targetDeckIds?: string[]) {
    const normalizedTargetDeckIds = Array.isArray(targetDeckIds)
      ? Array.from(new Set(targetDeckIds.map((deckId) => String(deckId || '').trim()).filter(Boolean)))
      : [];
    const shouldRefreshAllDecks = normalizedTargetDeckIds.length === 0;
    const stats: Record<string, DeckStats> = shouldRefreshAllDecks ? {} : { ...deckStats };
    const nextMemoryDeckLevels: Record<string, MemoryDeckLevelProgress> = shouldRefreshAllDecks
      ? {}
      : { ...memoryDeckLevels };
    
    //  使用 UnifiedStudyProvider（统一数据源）
    const { UnifiedStudyProvider } = await import('../../services/study/UnifiedStudyProvider');
    const unifiedProvider = new UnifiedStudyProvider(dataStorage);
    
    // 读取配置
    const filterSiblings = plugin.settings.studyConfig?.siblingDispersion?.filterInQueue ?? true;
    const newCardsPerDay = plugin.settings.newCardsPerDay || 20;
    const reviewsPerDay = plugin.settings.reviewsPerDay || 200;
    const allCardsForStats = await dataStorage.getAllCards();
    const runtime = await refreshEmergentDeckRuntime(allCardsForStats);
    const deckCardsMap = buildDeckCardsMap(allCardsForStats, decks);
    const learnedNewCardsTodayMap = buildTodayLearnedNewCardsMap(allStudySessions);
    const targetDeckIdSet = shouldRefreshAllDecks ? null : new Set(normalizedTargetDeckIds);
    const decksToRefresh = shouldRefreshAllDecks
      ? decks
      : decks.filter((deck) => targetDeckIdSet?.has(deck.id));
    
    logger.debug(`[calculateDeckStats] 🚀 开始计算统计 (v3.0 UnifiedStudyProvider), 牌组数: ${decksToRefresh.length}, 卡片数: ${allCardsForStats.length}`);
    
    // 为每个牌组获取统一的学习数据
    for (const deck of decksToRefresh) {
      try {
        const deckCards = deckCardsMap.get(deck.id) || [];
        nextMemoryDeckLevels[deck.id] = getMemoryDeckLevelProgressFromCards(deckCards);
        const { stats: deckStat, queue, debug } = await unifiedProvider.getStudyDataFromDeckCards(
          deck.id,
          deckCards,
          {
          newCardsPerDay,
          reviewsPerDay,
          filterSiblings,
          onlyDue: true,
          learnedNewCardsToday: learnedNewCardsTodayMap.get(deck.id) || 0
        });
        
        // 计算记忆率（从队列派生）
        let memoryRateSum = 0;
        for (const card of queue) {
          const fsrs = card.fsrs;
          if (fsrs) {
            const elapsed = Math.max(0, fsrs.elapsedDays || 0);
            const stability = Math.max(0.01, fsrs.stability || 0.01);
            const retention = Math.exp(-elapsed / stability);
            memoryRateSum += retention;
          }
        }
        
        stats[deck.id] = {
          ...deckStat,
          memoryRate: queue.length > 0 ? memoryRateSum / queue.length : 0
        };
        
        logger.debug(`[calculateDeckStats] ✅ 牌组 ${deck.name}:`, {
          queueLength: queue.length,
          new: deckStat.newCards,
          learning: deckStat.learningCards,
          review: deckStat.reviewCards,
          debug
        });
      } catch (error) {
        logger.error(`[calculateDeckStats] ❌ 牌组 ${deck.name} 统计失败:`, error);
        stats[deck.id] = {
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
      }
    }

    if (!shouldRefreshAllDecks && targetDeckIdSet) {
      for (const deckId of targetDeckIdSet) {
        if (!decks.some((deck) => deck.id === deckId)) {
          delete nextMemoryDeckLevels[deckId];
        }
      }
    }

    const nextEmergentDeckStats: Record<string, DeckStats> = {};
    if (runtime?.emergentDeckViews?.length) {
      for (const view of runtime.emergentDeckViews) {
        try {
          const deckCards = allCardsForStats.filter((card) => view.cardUUIDs.includes(card.uuid));
          const learnedNewCardsToday = learnedNewCardsTodayMap.get(view.id) || 0;
          const { stats: emergentStats } = await unifiedProvider.getStudyDataFromDeckCards(
            view.id,
            deckCards,
            {
              newCardsPerDay,
              reviewsPerDay,
              filterSiblings,
              onlyDue: true,
              learnedNewCardsToday,
            }
          );
          nextEmergentDeckStats[view.id] = {
            ...emergentStats,
            totalCards: view.cardUUIDs.length,
          };
        } catch (error) {
          logger.warn(`[DeckStudyPage] 计算涌现牌组统计失败: ${view.id}`, error);
        }
      }
    }

    const activeRuleGroup = getActiveEmergentRuleGroupState();
    const visibleEmergentDeckViews = activeRuleGroup.onlyLearnableDecks
      ? (runtime?.emergentDeckViews || []).filter((view) => hasLearnableCardsInDeckStats(nextEmergentDeckStats[view.id]))
      : runtime?.emergentDeckViews || [];
    const visibleEmergentDeckIds = new Set(visibleEmergentDeckViews.map((view) => view.id));

    emergentDeckStats = nextEmergentDeckStats;
    emergentDeckViews = visibleEmergentDeckViews;
    emergentCandidates = (runtime?.candidates || []).filter(
      (candidate) => candidate.status !== 'ignored' && visibleEmergentDeckIds.has(candidate.id)
    );

    deckStats = stats;
    memoryDeckLevels = nextMemoryDeckLevels;
    
    // 防抖持久化统计数据到 decks.json，确保云同步后其他设备能看到最新统计
    debouncedPersistDeckStats(stats);
    
    logger.info('[DeckStudyPage] ✅ 统计完成 (v3.0 UnifiedStudyProvider):', {
      newCardsPerDay,
      filterSiblings,
      deckCount: decksToRefresh.length,
      refreshMode: shouldRefreshAllDecks ? 'full' : 'targeted',
      statsKeys: Object.keys(stats)
    });
  }

  async function handlePromoteEmergentDeck(candidate: EmergentDeckCandidate, event: MouseEvent): Promise<void> {
    const emergentDeckService = getEmergentDeckService(plugin);
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle(`新建正式牌组：${candidate.name}`)
        .setIcon('plus-circle')
        .onClick(async () => {
          try {
            const newDeck = await plugin.deckHierarchy.createDeck(candidate.name);
            await emergentDeckService.promoteCandidateToDeck(candidate, newDeck.id);
            await refreshData(true);
            plugin.app.workspace.trigger('Weave:data-changed');
            new Notice(`已将“${candidate.name}”转为正式牌组`);
          } catch (error) {
            logger.error('[DeckStudyPage] 创建正式牌组失败:', error);
            new Notice(`创建正式牌组失败: ${error instanceof Error ? error.message : '未知错误'}`);
          }
        });
    });

    if (decks.length > 0) {
      menu.addSeparator();
      for (const deck of decks) {
        menu.addItem((item) => {
          item
            .setTitle(`归入正式牌组：${deck.name}`)
            .setIcon('folder')
            .onClick(async () => {
              try {
                await emergentDeckService.promoteCandidateToDeck(candidate, deck.id);
                await refreshData(true);
                plugin.app.workspace.trigger('Weave:data-changed');
                new Notice(`已将“${candidate.name}”绑定到正式牌组“${deck.name}”`);
              } catch (error) {
                logger.error('[DeckStudyPage] 绑定正式牌组失败:', error);
                new Notice(`绑定正式牌组失败: ${error instanceof Error ? error.message : '未知错误'}`);
              }
            });
        });
      }
    }

    menu.showAtMouseEvent(event);
  }

  // 防抖持久化 deckStats（5秒延迟，合并多次快速刷新）
  let persistStatsTimer: ReturnType<typeof setTimeout> | null = null;
  function debouncedPersistDeckStats(stats: Record<string, DeckStats>) {
    if (persistStatsTimer) clearTimeout(persistStatsTimer);
    persistStatsTimer = setTimeout(async () => {
      try {
        await dataStorage.persistAllDeckStats(stats);
      } catch (e) {
        logger.warn('[DeckStudyPage] 持久化 deckStats 失败:', e);
      }
    }, 5000);
  }

  const modalCoordinator = createDeckStudyModalCoordinator({
    getPlugin: () => plugin,
    getDataStorage: () => dataStorage,
    tr: (key: string, vars?: Record<string, string>) => t(key, vars),
    setShowCreateQuestionBankModal: (value: boolean) => {
      showCreateQuestionBankModal = value;
    },
    refreshData,
    refreshTargetedDeckData,
  });

  const modeActions = createDeckStudyModeActions({
    getPlugin: () => plugin,
    getDataStorage: () => dataStorage,
    tr: (key: string, vars?: Record<string, string>) => t(key, vars),
    getDecks: () => decks,
    startStudy,
    startAdvanceStudy,
    editDeck,
    deleteDeck,
    dissolveDeck,
    openDeckAnalytics,
    openKnowledgeGraph,
    associateQuestionBank,
    loadQBDeckTree,
    promptPremiumFeature: (featureId: string) => {
      promptFeatureId = featureId;
      showActivationPrompt = true;
    },
    isFeatureRestricted: (featureId: string) => premiumGuard.isFeatureRestricted(featureId, deckStudyFeatureContext),
  });

  function showCreateDeckModalWithObsidianAPI() {
    modalCoordinator.showCreateDeckModal();
  }

  function getCreateEntryTitle(): string {
    return menuCoordinator.getCreateEntryTitle();
  }

  async function handleCreateDeckForCurrentFilter(): Promise<void> {
    await menuCoordinator.handleCreateDeckForCurrentFilter();
  }

  function showAPKGImportModalWithObsidianAPI() {
    modalCoordinator.showAPKGImportModal();
  }

  function showEditDeckModalWithObsidianAPI(deck: Deck) {
    modalCoordinator.showEditDeckModal(deck);
  }


  async function exportDeck() {
    try {
      const data = await dataStorage.exportData();
      const dataStr = JSON.stringify(data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anki-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      logger.error(t('deckStudyPage.notices.exportFailed'), e);
    }
  }


  // ===== 看板视图模式感知回调 =====
  // 根据 selectedFilter 路由到正确的牌组类型处理函数
  
  async function kanbanStartStudy(deckId: string) {
    await modeActions.kanbanStartStudy(selectedFilter, deckId);
  }
  
  async function kanbanEditDeck(deckId: string) {
    await modeActions.kanbanEditDeck(selectedFilter, deckId);
  }
  
  async function kanbanDeleteDeck(deckId: string) {
    await modeActions.kanbanDeleteDeck(selectedFilter, deckId);
  }

  // 防止重复点击的锁
  let isStartingStudy = false;
  
  async function startStudy(deckId: string, deckNameOverride?: string) {
    //  防止重复点击
    if (isStartingStudy) {
      logger.debug('[DeckStudyPage] 正在启动学习，忽略重复点击');
      return;
    }
    
    try {
      isStartingStudy = true;
      let cardsToStudy: Card[] = [];
      
      const deck = decks.find(d => d.id === deckId);
      const emergentDeckView = emergentDeckViews.find((candidate) => candidate.id === deckId);
      const allDeckCardsRaw = await dataStorage.getDeckCards(deckId);
      logger.debug(`[DeckStudyPage] 按卡片 YAML 获取牌组卡片:`, {
        deckId: deckId.slice(0, 8),
        foundCards: allDeckCardsRaw.length
      });
      
      // 过滤回收卡片，确保与统计和加载逻辑一致。
      const allDeckCards = filterRecycledCards(allDeckCardsRaw);
      
      logger.debug(`[DeckStudyPage] 卡片过滤:`, {
        deckId: deckId.slice(0, 8),
        totalCards: allDeckCardsRaw.length,
        afterFilterRecycled: allDeckCards.length
      });
      
      const newCardsPerDay = plugin.settings.newCardsPerDay || 20;
      const reviewsPerDay = plugin.settings.reviewsPerDay || 20;
      
      // 获取今天已学习的新卡片数量
      const learnedNewCardsToday = await getLearnedNewCardsCountToday(dataStorage, deckId);
      
      // 完成判定需要与队列生成逻辑保持一致。
      const isComplete = await isDeckCompleteForToday(allDeckCards, newCardsPerDay, learnedNewCardsToday);
      
      logger.debug(`[DeckStudyPage] 学习状态检查:`, {
        deckId: deckId.slice(0, 8),
        allCardsCount: allDeckCards.length,
        isComplete,
        newCardsPerDay,
        learnedNewCardsToday
      });
      
      if (isComplete) {
        logger.debug(`[DeckStudyPage] 牌组 ${deckId.slice(0, 8)} 今日学习已完成`);
      } else {
        // 读取兄弟卡片过滤配置，并生成学习队列。
        const filterSiblings = plugin.settings.studyConfig?.siblingDispersion?.filterInQueue ?? true;
        
        cardsToStudy = await loadDeckCardsForStudy(
          dataStorage,
          deckId,
          newCardsPerDay,
          reviewsPerDay,
          filterSiblings
        );
        
        logger.debug(`[DeckStudyPage] 加载卡片完成:`, {
          studyCardsLength: cardsToStudy.length,
          newCardsPerDay,
          learnedNewCardsToday,
          cardIds: cardsToStudy.slice(0, 3).map(c => c.uuid.slice(0, 8))
        });
      }

      // 只有拿到有效卡片时才继续打开学习会话。
      const hasValidCards = cardsToStudy.length > 0;
      
      logger.debug(`[DeckStudyPage] 最终决策:`, {
        studyCardsLength: cardsToStudy.length,
        hasValidCards,
        willOpenSession: hasValidCards
      });
      
      // 只有在确定有卡片可学时才打开学习界面
      if (hasValidCards) {
        // 传递卡片ID列表，避免 StudyView 重复加载。
        const cardIds = cardsToStudy.map(c => c.uuid);
        logger.info(`[DeckStudyPage] 打开学习界面:`, {
          deckId: deckId.slice(0, 8),
          cardCount: cardsToStudy.length,
          cardIds: cardIds.slice(0, 3).map(id => id.slice(0, 8))
        });
        
        await plugin.openStudySession({
          deckId,
          deckName: deck?.name || deckNameOverride || emergentDeckView?.name,
          cardIds
        });
      } else {
        logger.info(`[DeckStudyPage] 无可学卡片，显示提示模态窗`);
        //  智能判断：是完成学习、配额用完、暂无到期，还是空牌组
        const stats = deckStats[deckId] || emergentDeckStats[deckId];
        
        // 用物理卡片总数判断是否真的是空牌组。
        const physicalTotalCards = allDeckCards.length;  // 物理总卡片数
        const learnableTotalCards = stats?.totalCards ?? 0;  // 可学卡片数（FSRS6过滤后）
        const newCards = stats?.newCards ?? 0;
        const learningCards = stats?.learningCards ?? 0;
        const reviewCards = stats?.reviewCards ?? 0;
        
        logger.debug(`[DeckStudyPage] 卡片数量对比:`, {
          deckId: deckId.slice(0, 8),
          physicalTotal: physicalTotalCards,
          learnableTotal: learnableTotalCards,
          newCards,
          learningCards,
          reviewCards
        });
        
        noCardsDeckName = deck?.name || deckNameOverride || emergentDeckView?.name || t('deckStudyPage.fallback.deck');
        noCardsReason = resolveDeckNoCardsReason({
          physicalTotalCards,
          isComplete,
          learningCards,
          reviewCards,
          newCards,
          learnedNewCardsToday,
          newCardsPerDay
        });

        if (noCardsReason === 'empty') {
          noCardsStats = undefined;
        } else {
          const nextDueCard = allDeckCards
            .filter(c => c.fsrs && new Date(c.fsrs.due) > new Date())
            .sort((a, b) => new Date(a.fsrs!.due).getTime() - new Date(b.fsrs!.due).getTime())[0];

          const nextDueTime = nextDueCard ? formatNextDueTime(new Date(nextDueCard.fsrs!.due)) : undefined;
          const latestCompletedSession = noCardsReason === 'all-learned'
            ? await getLatestCompletedStudySessionToday(dataStorage, deckId)
            : null;

          noCardsStats = {
            totalCards: physicalTotalCards,
            sessionCompletedCards: latestCompletedSession?.cardsReviewed,
            showSessionCompletedCards: noCardsReason === 'all-learned' && !!latestCompletedSession,
            nextDueTime,
            todayNewCards: learnedNewCardsToday,
            todayNewLimit: newCardsPerDay
          };
        }

        noCardsCurrentDeckId = deckId;
        showNoCardsModal = true;
      }
    } catch (error) {
      logger.error('Error starting study:', error);
      const N = Notice;
      if (typeof N === 'function') {
        new N(t('deckStudyPage.studyActions.startError'), 3000);
      }
    } finally {
      //  释放锁
      isStartingStudy = false;
    }
  }

  /**
   * 启动提前学习（学习未到期的复习卡片）。
   */
  async function startAdvanceStudy(deckId: string) {
    try {
      const deck = decks.find(d => d.id === deckId);
      const allDeckCardsRaw = await dataStorage.getDeckCards(deckId);
      logger.debug(`[DeckStudyPage] 提前学习 - 按卡片 YAML 获取牌组卡片:`, {
        deckId: deckId.slice(0, 8),
        foundCards: allDeckCardsRaw.length
      });
      
      // 过滤回收卡片，确保与统计和加载逻辑一致。
      const allDeckCards = filterRecycledCards(allDeckCardsRaw);
      
      logger.debug('[DeckStudyPage] 牌组卡片（提前学习）:', {
        deckId,
        totalCards: allDeckCardsRaw.length,
        afterFilterRecycled: allDeckCards.length,
        sampleCardIds: allDeckCards.slice(0, 5).map(c => c.uuid.slice(0, 8)),
        cardTypes: allDeckCards.slice(0, 5).map(c => c.type),
        parentCards: allDeckCards.filter(c => c.type === 'progressive-parent').length,
        childCards: allDeckCards.filter(c => c.type === 'progressive-child').length
      });
      
      //  获取未到期的复习卡片（限制提前学习天数，避免影响记忆效果）
      const maxAdvanceDays = plugin.settings.maxAdvanceDays || 7;
      const advanceCards = getAdvanceStudyCards(allDeckCards, 20, maxAdvanceDays);
      
      if (advanceCards.length === 0) {
        new Notice(t('deckStudyPage.studyActions.noAdvanceCards'));
        return;
      }
      
      logger.debug(`[DeckStudyPage] 提前学习: ${advanceCards.length} 张卡片`, {
        cardCount: advanceCards.length,
        cardIds: advanceCards.map(c => c.uuid.slice(0, 8)),
        cardTypes: advanceCards.map(c => c.type),
        sampleCard: {
          uuid: advanceCards[0].uuid.slice(0, 8),
          type: advanceCards[0].type,
          isProgressiveParent: advanceCards[0].type === 'progressive-parent',
          isProgressiveChild: advanceCards[0].type === 'progressive-child',
          hasFsrs: !!advanceCards[0].fsrs,
          fsrsState: advanceCards[0].fsrs?.state
        }
      });
      
      //  传递卡片ID列表和学习模式到学习界面
      const cardIds = advanceCards.map(card => card.uuid);
      logger.debug('[DeckStudyPage] 传递给 openStudySession:', {
        deckId,
        mode: 'advance',
        cardIdsCount: cardIds.length,
        cardIds: cardIds.map(id => id.slice(0, 8))
      });
      
      await plugin.openStudySession({
        deckId,
        deckName: deck?.name,
        mode: 'advance',
        cardIds
      });
      
      new Notice(t('deckStudyPage.studyActions.advanceStudyStarted', { count: String(advanceCards.length) }));
    } catch (error) {
      logger.error('[DeckStudyPage] 启动提前学习失败:', error);
      new Notice(t('deckStudyPage.studyActions.advanceStudyFailed'));
    }
  }

  async function pickQuestionBankForDeck(deckId: string): Promise<Deck | null> {
    const currentDeck = await dataStorage.getDeck(deckId);
    logger.info('[DeckStudyPage] 当前牌组信息:', currentDeck ? {
      id: currentDeck.id,
      name: currentDeck.name,
      deckType: currentDeck.deckType,
      pairedMemoryDeckId: (currentDeck.metadata as any)?.pairedMemoryDeckId
    } : '未找到');

    if (currentDeck && currentDeck.deckType === 'question-bank') {
      logger.info('[DeckStudyPage] 当前牌组本身就是考试题组，直接使用');
      return currentDeck;
    }

    const candidates = await plugin.questionBankService!.getBankCandidatesByMemoryDeckId(deckId);
    logger.info('[DeckStudyPage] 候选考试题组:', candidates.map((candidate) => ({
      id: candidate.bank.id,
      name: candidate.bank.name,
      pairedMemoryDeckId: (candidate.bank.metadata as any)?.pairedMemoryDeckId,
      matchType: candidate.matchType,
      overlapCount: candidate.overlapCount
    })));

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0].bank;
    }

    new Notice('找到多个可用考试题组，请选择要进入的题组');
    return await new Promise<Deck | null>((resolve) => {
      let settled = false;
      const modal = new QuestionBankSelectorModal(plugin.app, candidates, (candidate) => {
        settled = true;
        resolve(candidate.bank);
      });
      const originalOnClose = modal.onClose.bind(modal);
      modal.onClose = () => {
        originalOnClose();
        if (!settled) {
          resolve(null);
        }
      };
      modal.open();
    });
  }
  
  //  关闭庆祝模态窗
  function handleCloseCelebration() {
    showCelebrationModal = false;
    celebrationStats = null;
    celebrationDeckId = '';
  }
  
  //  开始考试模式
  async function handleStartPractice() {
    // 关闭庆祝模态窗
    showCelebrationModal = false;
    const deckId = celebrationDeckId;
    celebrationStats = null;
    celebrationDeckId = '';
    
    if (!deckId) {
      logger.error('[DeckStudyPage] 无法开始考试：缺少牌组ID');
      new Notice(t('deckStudyPage.exam.missingDeckInfo'));
      return;
    }
    
    try {
      logger.info('[DeckStudyPage] Starting exam mode from celebration modal, deckId:', deckId);
      
      // Check if question bank service is available
      if (!plugin.questionBankService) {
        logger.error('[DeckStudyPage] Question bank service not initialized');
        new Notice(t('deckStudyPage.exam.qbNotEnabled'));
        return;
      }
      
      //  调试日志：查看所有题库
      const allBanks = await plugin.questionBankService.getAllBanks();
      logger.info('[DeckStudyPage] 当前所有题库:', allBanks.map(b => ({
        id: b.id,
        name: b.name,
        deckType: b.deckType,
        pairedMemoryDeckId: (b.metadata as any)?.pairedMemoryDeckId
      })));
      
      logger.info('[DeckStudyPage] 🔍 详细匹配信息 (handleStartPractice):', {
        searchingForMemoryDeckId: deckId,
        searchingForMemoryDeckIdType: typeof deckId,
        allBanksWithPairing: allBanks.map(b => ({
          bankId: b.id,
          bankName: b.name,
          pairedMemoryDeckId: (b.metadata as any)?.pairedMemoryDeckId,
          pairedMemoryDeckIdType: typeof (b.metadata as any)?.pairedMemoryDeckId,
          strictEquals: (b.metadata as any)?.pairedMemoryDeckId === deckId,
          looseEquals: (b.metadata as any)?.pairedMemoryDeckId == deckId
        }))
      });
      
      logger.info('[DeckStudyPage] 当前牌组是记忆牌组，查找对应的考试题组');
      const questionBank = await pickQuestionBankForDeck(deckId);
      
      if (!questionBank) {
        logger.info('[DeckStudyPage] 暂无该记忆牌组对应的考试题组');
        new Notice(t('deckStudyPage.exam.noPairedBank'));
        return;
      }
      
      // Open exam session
      logger.info('[DeckStudyPage] Opening question bank:', questionBank.id, questionBank.name);
      await plugin.openQuestionBankSession({
        bankId: questionBank.id,
        bankName: questionBank.name
      });
      
    } catch (error) {
      logger.error('[DeckStudyPage] Failed to start exam:', error);
      new Notice(t('deckStudyPage.exam.startFailed'));
    }
  }
  
  // Close no-cards modal
  function handleCloseNoCardsModal() {
    showNoCardsModal = false;
  }
  
  // Start exam from no-cards modal
  async function handleStartPracticeFromNoCards() {
    showNoCardsModal = false;
    const deckId = noCardsCurrentDeckId;
    
    if (!deckId) {
      logger.error('[DeckStudyPage] Cannot start exam: missing deck ID');
      new Notice(t('deckStudyPage.exam.missingDeckInfo'));
      return;
    }
    
    try {
      logger.info('[DeckStudyPage] 从无卡片模态窗开始考试模式，牌组ID:', deckId);
      
      // 检查题库服务是否可用
      if (!plugin.questionBankService) {
        logger.error('[DeckStudyPage] 题库服务未初始化');
        new Notice(t('deckStudyPage.exam.qbNotEnabled'));
        return;
      }
      
      //  调试日志：查看所有题库
      const allBanks = await plugin.questionBankService.getAllBanks();
      logger.info('[DeckStudyPage] 当前所有题库:', allBanks.map(b => ({
        id: b.id,
        name: b.name,
        deckType: b.deckType,
        pairedMemoryDeckId: (b.metadata as any)?.pairedMemoryDeckId
      })));
      
      logger.info('[DeckStudyPage] 🔍 详细匹配信息 (handleStartPracticeFromNoCards):', {
        searchingForMemoryDeckId: deckId,
        searchingForMemoryDeckIdType: typeof deckId,
        allBanksWithPairing: allBanks.map(b => ({
          bankId: b.id,
          bankName: b.name,
          pairedMemoryDeckId: (b.metadata as any)?.pairedMemoryDeckId,
          pairedMemoryDeckIdType: typeof (b.metadata as any)?.pairedMemoryDeckId,
          strictEquals: (b.metadata as any)?.pairedMemoryDeckId === deckId,
          looseEquals: (b.metadata as any)?.pairedMemoryDeckId == deckId
        }))
      });
      
      logger.info('[DeckStudyPage] 当前牌组是记忆牌组，查找对应的考试题组');
      const questionBank = await pickQuestionBankForDeck(deckId);
      
      if (!questionBank) {
        logger.info('[DeckStudyPage] 暂无该记忆牌组对应的考试题组');
        new Notice(t('deckStudyPage.exam.noPairedBank'));
        return;
      }
      
      // Open exam session
      logger.info('[DeckStudyPage] Opening question bank:', questionBank.id, questionBank.name);
      await plugin.openQuestionBankSession({
        bankId: questionBank.id,
        bankName: questionBank.name
      });
      
    } catch (error) {
      logger.error('[DeckStudyPage] Failed to start exam:', error);
      new Notice(t('deckStudyPage.exam.startFailed'));
    }
  }

  async function associateQuestionBank(deckId: string): Promise<void> {
    try {
      if (!plugin.questionBankService) {
        new Notice(t('deckStudyPage.exam.qbNotEnabled'));
        return;
      }

      const memoryDeck = decks.find((deck) => deck.id === deckId) ?? await dataStorage.getDeck(deckId);
      if (!memoryDeck) {
        new Notice(t('deckStudyPage.notices.deckNotFound'));
        return;
      }

      const allBanks = (await plugin.questionBankService.getAllBanks())
        .filter((bank) => bank.deckType === 'question-bank')
        .sort((a, b) => {
          const orderDiff = (a.order || 0) - (b.order || 0);
          if (orderDiff !== 0) return orderDiff;
          return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
        });

      if (allBanks.length === 0) {
        new Notice(t('deckStudyPage.exam.noBanksAvailable'));
        return;
      }

      const currentBank =
        allBanks.find((bank) => (bank.metadata as any)?.pairedMemoryDeckId === deckId) ?? null;

      const modal = new QuestionBankAssociationModal(
        plugin.app,
        allBanks,
        currentBank?.id ?? null,
        async (bank) => {
          try {
            await plugin.questionBankService!.pairBankWithMemoryDeck(bank.id, deckId);
            await refreshData();
            plugin.app.workspace.trigger('Weave:data-changed');
            new Notice(t('deckStudyPage.exam.linkSuccess', {
              bank: bank.name || t('deckStudyPage.fallback.unknownBank'),
              deck: memoryDeck.name || t('deckStudyPage.fallback.deck')
            }));
          } catch (error) {
            logger.error('[DeckStudyPage] 关联考试题组失败:', error);
            new Notice(t('deckStudyPage.exam.linkFailed'));
          }
        }
      );

      modal.open();
    } catch (error) {
      logger.error('[DeckStudyPage] 打开考试题组关联选择器失败:', error);
      new Notice(t('deckStudyPage.exam.linkFailed'));
    }
  }
  
// 提前学习回调
  async function handleAdvanceStudy() {
    showNoCardsModal = false;
    if (noCardsCurrentDeckId) {
      await startAdvanceStudy(noCardsCurrentDeckId);
    }
  }
  
// 查看统计回调
  function handleViewStats() {
    showNoCardsModal = false;
    if (noCardsCurrentDeckId) {
      openDeckAnalytics(noCardsCurrentDeckId);
    }
  }
  
// 格式化下次到期时间
  function formatNextDueTime(dueDate: Date): string {
    const now = new Date();
    const diff = dueDate.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 1) {
      const dateStr = `${dueDate.getMonth() + 1}/${dueDate.getDate()}`;
      const timeStr = `${String(dueDate.getHours()).padStart(2, '0')}:${String(dueDate.getMinutes()).padStart(2, '0')}`;
      return `${dateStr} ${timeStr}`;
    } else if (days === 1) {
      const timeStr = `${String(dueDate.getHours()).padStart(2, '0')}:${String(dueDate.getMinutes()).padStart(2, '0')}`;
      return `${t('deckStudyPage.time.tomorrow')} ${timeStr}`;
    } else if (hours > 0) {
      return t('deckStudyPage.time.hoursLater', { hours: String(hours) });
    } else {
      const minutes = Math.floor(diff / (1000 * 60));
      return t('deckStudyPage.time.minutesLater', { minutes: String(minutes) });
    }
  }

  function isVirtualWDeckDeck(deck: any): boolean {
    if (!deck) return false;
    return deck?.metadata?.fileType === 'wdeck' || !!plugin.wdeckService?.isWDeckDeckId?.(deck.id);
  }

  function getWDeckFilePaths(deck: Deck | undefined): string[] {
    if (!deck) return [];
    const rawPaths = Array.isArray((deck as any)?.metadata?.filePaths)
      ? (deck as any).metadata.filePaths
      : [];

    return Array.from(
      new Set(
        rawPaths
          .map((path: unknown) => normalizePath(String(path || '').trim()))
          .filter(Boolean)
      )
    );
  }

  function getWDeckFileLabel(filePath: string): string {
    const normalizedPath = normalizePath(String(filePath || '').trim());
    return normalizedPath.split('/').pop() || normalizedPath || '.wdeck';
  }

  async function openWDeckSegmentFile(filePath: string): Promise<void> {
    const normalizedPath = normalizePath(String(filePath || '').trim());
    if (!normalizedPath) {
      new Notice('未找到可打开的 `.wdeck` 文件路径。');
      return;
    }

    const abstractFile = plugin.app.vault.getAbstractFileByPath(normalizedPath);
    if (!(abstractFile instanceof TFile)) {
      new Notice(`对应的 .wdeck 文件不存在：${normalizedPath}`);
      return;
    }

    await openFileWithExistingLeaf(plugin.app, abstractFile, {
      openInNewTab: true,
      focus: true
    });
  }

  function renderWDeckManagementSection(menu: Menu, deck: Deck): void {
    const filePaths = getWDeckFilePaths(deck);

    menu.addItem((item) =>
      item
        .setTitle(filePaths.length > 1 ? '编辑首个牌组文件' : '编辑牌组文件')
        .setIcon('file-json')
        .onClick(async () => {
          if (filePaths.length === 0) {
            new Notice('当前 `.wdeck` 牌组缺少分卷文件路径信息。');
            return;
          }
          await openWDeckSegmentFile(filePaths[0]);
        })
    );

    if (filePaths.length > 1) {
      menu.addItem((item) => {
        item.setTitle(`编辑指定牌组文件 (${filePaths.length})`).setIcon('files');
        const submenu = (item as any).setSubmenu();

        filePaths.forEach((filePath, index) => {
          submenu.addItem((subItem: any) => {
            subItem
              .setTitle(`${String(index + 1).padStart(2, '0')} · ${getWDeckFileLabel(filePath)}`)
              .setIcon('file')
              .onClick(async () => {
                await openWDeckSegmentFile(filePath);
              });
          });
        });
      });
    }

    menu.addItem((item) =>
      item
        .setTitle('从牌组文件重新进入学习')
        .setIcon('refresh-cw')
        .onClick(async () => {
          if (filePaths.length === 0) {
            new Notice('当前 `.wdeck` 牌组缺少分卷文件路径信息。');
            return;
          }
          await plugin.openWDeckStudy(filePaths[0]);
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle('删除牌组文件')
        .setIcon('trash-2')
        .onClick(async () => {
          await deleteWDeckDeck(deck.id);
        })
    );

    menu.addItem((item) =>
      item
        .setTitle('解散牌组文件')
        .setIcon('unlink')
        .onClick(async () => {
          await dissolveWDeckDeck(deck.id);
        })
    );
  }

  async function deleteWDeckDeck(deckId: string): Promise<void> {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;

    const { showDangerConfirm } = await import('../../utils/obsidian-confirm');
    const confirmed = await showDangerConfirm(
      plugin.app,
      `将删除牌组文件“${deck.name}”及其全部分卷，文件内卡片与复习数据会一并删除。`,
      '确认删除牌组文件'
    );
    if (!confirmed) return;

    try {
      await plugin.wdeckService?.deleteDeckByDeckId(deckId);
      decks = await dataStorage.getDecks();
      await refreshData();
      plugin.app.workspace.trigger('Weave:data-changed');
      new Notice(`已删除牌组文件“${deck.name}”。`);
    } catch (error) {
      logger.error('[DeckStudyPage] 删除 .wdeck 牌组文件失败:', error);
      new Notice(`删除牌组文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async function dissolveWDeckDeck(deckId: string): Promise<void> {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;

    const { showDangerConfirm } = await import('../../utils/obsidian-confirm');
    const confirmed = await showDangerConfirm(
      plugin.app,
      `将解散牌组文件“${deck.name}”。其中卡片会整体迁入“未归组卡片”牌组文件，并保留复习数据。`,
      '确认解散牌组文件'
    );
    if (!confirmed) return;

    try {
      const result = await plugin.wdeckService?.dissolveDeckByDeckId(deckId);
      decks = await dataStorage.getDecks();
      await refreshData();
      plugin.app.workspace.trigger('Weave:data-changed');
      new Notice(`已解散牌组文件“${deck.name}”，共迁移 ${result?.movedCards || 0} 张卡片到“${result?.targetDeckName || '未归组卡片'}”。`);
    } catch (error) {
      logger.error('[DeckStudyPage] 解散 .wdeck 牌组文件失败:', error);
      new Notice(`解散牌组文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async function editDeck(deckId: string) {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;
    showEditDeckModalWithObsidianAPI(deck);
  }

  async function deleteDeck(deckId: string) {
    try {
      const targetDeck = decks.find(d => d.id === deckId);
      if (isVirtualWDeckDeck(targetDeck)) {
        await deleteWDeckDeck(deckId);
        return;
      }

      //  等待 deckHierarchy 服务就绪
      const deckHierarchy = await waitForService(
        () => plugin?.deckHierarchy,
        'deckHierarchy',
        5000
      );
      
      // 获取牌组信息
      const deck = decks.find(d => d.id === deckId);
      if (!deck) {
        new Notice(t('deckStudyPage.notices.deckNotFound'));
        return;
      }
      
      const cardUUIDs = deck.cardUUIDs || [];
      const cardCount = cardUUIDs.length;
      
      let confirmMessage = t('deckStudyPage.deleteModal.confirmMessage', { name: deck.name });
      if (cardCount > 0) {
        confirmMessage += `\n\n${t('deckStudyPage.deleteModal.cardWarning', { count: String(cardCount) })}`;
      }
      confirmMessage += `\n\n${t('deckStudyPage.deleteModal.irreversible')}`;
      
      const modal = new Modal(plugin.app);
      modal.titleEl.setText(t('deckStudyPage.deleteModal.title'));
      
      // 创建消息内容（支持多行）
      const messageEl = modal.contentEl.createDiv({ cls: 'delete-confirm-message' });
      confirmMessage.split('\n').forEach(line => {
        messageEl.createEl('p', { text: line });
      });
      
      // 创建按钮容器
      const buttonContainer = modal.contentEl.createDiv({ cls: 'delete-confirm-buttons' });
      buttonContainer.style.display = 'flex';
      buttonContainer.style.justifyContent = 'flex-end';
      buttonContainer.style.gap = '10px';
      buttonContainer.style.marginTop = '16px';
      
      let shouldDelete = false;
      
      const cancelButton = buttonContainer.createEl('button', { text: t('common.cancel') });
      cancelButton.onclick = () => {
        modal.close();
      };
      
      const deleteButton = buttonContainer.createEl('button', { 
        text: t('deckStudyPage.deleteModal.confirmButton'),
        cls: 'mod-warning'
      });
      deleteButton.onclick = () => {
        shouldDelete = true;
        modal.close();
      };
      
      modal.onClose = async () => {
        if (!shouldDelete) return;
        
        try {
          let deleteProgress: any = null;

          if (cardUUIDs.length > 0) {
            // ===== 高效批量删除卡片 =====
            // 直接走存储层的批量删除链路：
            // - 批量移除其他牌组引用
            // - 批量删除统一存储中的卡片
            // - 仅对真正有溯源的卡片执行源文档清理
            
            const { ProgressModal } = await import('../../utils/progress-modal');
            deleteProgress = new ProgressModal(plugin.app, {
              title: t('deckStudyPage.deleteModal.progressTitle'),
              description: `正在删除牌组“${deck.name}”中的 ${cardCount} 张卡片；如这些卡片关联了来源文档，也会一并清理对应残留记录...`,
              total: 2,
              cancellable: false
            });
            deleteProgress.open();
            
            logger.suspendVerboseLogs();
            
            // 阶段 1/2: 统一通过 dataStorage 删除；如存在来源文档则一并清理
            deleteProgress.updateDescription(`正在删除卡片数据；如这些卡片关联了来源文档，也会一并清理对应残留记录...`);
            deleteProgress.updateProgress(1, '删除卡片数据并处理关联清理...');
            const deleteResult = await dataStorage.deleteCards(cardUUIDs, {
              skipCascadeDeckIds: [deckId]
            });
            const deletedCount = deleteResult.deleted.length;
            logger.info(`[DeckStudyPage] 统一批量删除完成: 成功${deleteResult.deleted.length}, 失败${deleteResult.failed.length}`);
            deleteProgress.increment(`已删除 ${deletedCount} 张卡片，并完成关联清理`);

            deleteProgress.updateDescription('正在删除牌组并刷新界面...');
            deleteProgress.updateProgress(2, '删除牌组并刷新界面...');
            
            logger.info(`[DeckStudyPage] 删除牌组卡片完成: ${deletedCount}/${cardCount}`);
          }
          
          // 删除牌组本身
          await deckHierarchy.deleteDeck(deckId, {
            skipCardDeletion: cardUUIDs.length > 0
          });
          
          decks = decks.filter(existingDeck => existingDeck.id !== deckId);
          deckTree = deckTree.filter(node => node.deck.id !== deckId);
          if (deckStats[deckId]) {
            const { [deckId]: _removedStats, ...remainingStats } = deckStats;
            deckStats = remainingStats;
          }

          if (deleteProgress) {
            deleteProgress.setComplete(`已删除 ${cardCount} 张卡片，并完成牌组移除`);
          }

          void refreshData(false).catch((refreshError) => {
            logger.warn('[DeckStudyPage] 删除牌组后的后台刷新失败:', refreshError);
          });

          // 通知全局侧边栏刷新
          plugin.app.workspace.trigger('Weave:data-changed');
          
          const successMsg = cardCount > 0
            ? t('deckStudyPage.deleteModal.successWithCards', { name: deck.name, count: String(cardCount) })
            : t('deckStudyPage.deleteModal.success', { name: deck.name });
          new Notice(successMsg);
          logger.resumeVerboseLogs();
        } catch (error) {
          logger.resumeVerboseLogs();
          logger.error('[DeckStudyPage] Delete deck failed:', error);
          new Notice(`${t('deckStudyPage.deleteModal.failed')}: ${error instanceof Error ? error.message : t('common.unknown')}`);
        }
      };
      
      modal.open();
    } catch (error) {
      logger.error('[DeckStudyPage] Delete deck failed:', error);
      new Notice(`${t('deckStudyPage.deleteModal.failed')}: ${error instanceof Error ? error.message : t('common.unknown')}`);
    }
  }

  type RowMenuItem = { id: string; label: string; icon?: string; onClick: () => void };

  type DeckGraphSource = {
    filePath: string;
    blockId?: string;
  };

  function stripMarkdownExtension(path: string): string {
    return path.replace(/\.md$/i, '');
  }

  function extractDeckKnowledgeGraphIdentityFromContent(content: string): {
    weaveType?: string;
    deckId?: string;
  } {
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatterMatch) return {};

    const frontmatter = frontmatterMatch[1];
    const readField = (fieldName: string): string | undefined => {
      const fieldMatch = frontmatter.match(
        new RegExp(`(?:^|\\r?\\n)${fieldName}:\\s*(.+?)\\s*(?=\\r?\\n|$)`)
      );
      if (!fieldMatch) return undefined;

      return fieldMatch[1].trim().replace(/^['"]|['"]$/g, '');
    };

    return {
      weaveType: readField('weave_type'),
      deckId: readField('deck_id'),
    };
  }

  async function isMatchingDeckKnowledgeGraphFile(file: TFile, deckId: string): Promise<boolean> {
    const cachedFrontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    const cachedWeaveType = typeof cachedFrontmatter?.weave_type === 'string'
      ? cachedFrontmatter.weave_type.trim()
      : undefined;
    const cachedDeckId = cachedFrontmatter?.deck_id != null
      ? String(cachedFrontmatter.deck_id).trim()
      : undefined;

    if (cachedWeaveType || cachedDeckId) {
      return cachedWeaveType === 'deck_knowledge_graph' && cachedDeckId === deckId;
    }

    try {
      const content = await plugin.app.vault.cachedRead(file);
      const parsed = extractDeckKnowledgeGraphIdentityFromContent(content);
      return parsed.weaveType === 'deck_knowledge_graph' && parsed.deckId === deckId;
    } catch (error) {
      logger.warn('[DeckStudyPage] 读取牌组知识图谱 frontmatter 失败:', file.path, error);
      return false;
    }
  }

  async function resolveDeckKnowledgeGraphPath(deck: Deck, graphDir: string): Promise<string> {
    const preferredPath = normalizePath(`${graphDir}/${sanitizeFileName(deck.name || deck.id)}.md`);
    const graphDirPrefix = `${graphDir}/`;
    const graphFiles = plugin.app.vault.getMarkdownFiles().filter((file) =>
      normalizePath(file.path).startsWith(graphDirPrefix)
    );

    const matches: TFile[] = [];
    for (const file of graphFiles) {
      if (await isMatchingDeckKnowledgeGraphFile(file, deck.id)) {
        matches.push(file);
      }
    }

    if (matches.length > 0) {
      matches.sort((a, b) => {
        const normalizedA = normalizePath(a.path);
        const normalizedB = normalizePath(b.path);
        if (normalizedA === preferredPath) return -1;
        if (normalizedB === preferredPath) return 1;
        return normalizedA.localeCompare(normalizedB, 'zh-Hans-CN');
      });
      return normalizePath(matches[0].path);
    }

    const existingPreferredFile = plugin.app.vault.getAbstractFileByPath(preferredPath);
    if (existingPreferredFile instanceof TFile) {
      return preferredPath;
    }

    return preferredPath;
  }

  function buildDeckKnowledgeGraphContent(
    deck: Deck,
    cards: Card[],
    sources: DeckGraphSource[],
    skippedNonMarkdownCount: number
  ): string {
    const lines = sources.map((source) => {
      const target = stripMarkdownExtension(source.filePath);
      return source.blockId
        ? `- [[${target}#^${source.blockId}]]`
        : `- [[${target}]]`;
    });

    const skippedSection = skippedNonMarkdownCount > 0
      ? [
          '',
          '## 说明',
          `- 已跳过 ${skippedNonMarkdownCount} 个非 Markdown 来源，当前版本的牌组知识图谱只纳入可参与 Obsidian 双链图谱的 Markdown 文档。`
        ]
      : [];

    return [
      '---',
      'weave_type: deck_knowledge_graph',
      `deck_id: ${deck.id}`,
      `deck_name: ${JSON.stringify(deck.name)}`,
      `generated_at: ${new Date().toISOString()}`,
      `source_count: ${sources.length}`,
      `card_count: ${cards.length}`,
      '---',
      '',
      `# ${deck.name} - 牌组知识图谱`,
      '',
      '## 源文档',
      ...lines,
      ...skippedSection,
      '',
      '> 此页面由 Weave 自动生成，用于驱动 Obsidian 局部关系图谱。'
    ].join('\n');
  }

  async function migrateLegacyKnowledgeGraphDirIfNeeded(targetDir: string): Promise<void> {
    const adapter = plugin.app.vault.adapter as any;
    const rawSettings = plugin.settings as any;
    const parentFolder = rawSettings?.weaveParentFolder as string | undefined;
    const legacyDir = normalizePath(`${getReadableWeaveRoot(parentFolder)}/deck-graphs`);
    if (legacyDir === targetDir) return;

    const legacyExists = await adapter.exists?.(legacyDir);
    if (!legacyExists) return;

    await DirectoryUtils.ensureDirRecursive(adapter, targetDir);

    let targetHasContent = false;
    if (typeof adapter.list === 'function') {
      try {
        const listed = await adapter.list(targetDir);
        targetHasContent = (listed?.files?.length || 0) > 0 || (listed?.folders?.length || 0) > 0;
      } catch {
        targetHasContent = false;
      }
    }
    if (targetHasContent) return;

    if (typeof adapter.list !== 'function') return;

    const listed = await adapter.list(legacyDir);
    for (const file of listed?.files || []) {
      const fileName = String(file).split('/').pop();
      if (!fileName) continue;
      const content = await adapter.read(String(file));
      await adapter.write(`${targetDir}/${fileName}`, content);
    }

    if (typeof adapter.rmdir === 'function') {
      try {
        await adapter.rmdir(legacyDir, true);
      } catch (error) {
        logger.warn('[DeckStudyPage] 旧牌组图谱目录清理失败:', error);
      }
    }
  }

  async function openKnowledgeGraph(deckId: string) {
    try {
      const deck = decks.find(d => d.id === deckId) || await dataStorage.getDeck(deckId);
      if (!deck) {
        new Notice(t('deckStudyPage.notices.deckNotFound'));
        return;
      }

      const deckCards = filterRecycledCards(await dataStorage.getDeckCards(deckId));
      if (deckCards.length === 0) {
        new Notice(t('deckStudyPage.knowledgeGraph.emptyDeck'));
        return;
      }

      const sourceMap = new Map<string, DeckGraphSource>();
      let skippedNonMarkdownCount = 0;

      for (const card of deckCards) {
        const parsedSource = parseSourceInfo(card.content || '');
        const sourceFile = parsedSource.sourceFile || card.sourceFile;
        const sourceBlock = (parsedSource.sourceBlock || card.sourceBlock || '').replace(/^\^/, '');

        if (!sourceFile) continue;
        if (!sourceFile.toLowerCase().endsWith('.md')) {
          skippedNonMarkdownCount++;
          continue;
        }

        const normalizedFilePath = normalizePath(sourceFile);
        const sourceKey = `${normalizedFilePath}#${sourceBlock}`;
        if (!sourceMap.has(sourceKey)) {
          sourceMap.set(sourceKey, {
            filePath: normalizedFilePath,
            blockId: sourceBlock || undefined
          });
        }
      }

      const sources = Array.from(sourceMap.values()).sort((a, b) => {
        const aKey = `${a.filePath}#${a.blockId || ''}`;
        const bKey = `${b.filePath}#${b.blockId || ''}`;
        return aKey.localeCompare(bKey, 'zh-Hans-CN');
      });

      if (sources.length === 0) {
        new Notice(t('deckStudyPage.knowledgeGraph.noSources'));
        return;
      }

      const rawSettings = plugin.settings as any;
      const parentFolder = rawSettings?.weaveParentFolder as string | undefined;
      const graphDir = normalizePath(getV2Paths(parentFolder).memory.knowledgeGraphs);
      const adapter = plugin.app.vault.adapter;
      await migrateLegacyDirectory(plugin.app, {
        legacyPath: normalizePath(`${getV2Paths(parentFolder).root}/deck-graphs`),
        targetPath: graphDir,
        label: 'deck-graphs',
      });
      await DirectoryUtils.ensureDirRecursive(adapter, graphDir);
      const graphPath = await resolveDeckKnowledgeGraphPath(deck, graphDir);

      const content = buildDeckKnowledgeGraphContent(deck, deckCards, sources, skippedNonMarkdownCount);
      if (await adapter.exists(graphPath)) {
        await adapter.write(graphPath, content);
      } else {
        await plugin.app.vault.create(graphPath, content);
      }

      const graphFile = plugin.app.vault.getAbstractFileByPath(graphPath);
      if (!graphFile) {
        throw new Error(`Knowledge graph source file not found: ${graphPath}`);
      }

      // 先在当前标签页体系中创建一个后台 markdown 宿主 leaf，
      // 让 localgraph 始终跟随该索引 md，而不是被当前活动文档抢走上下文。
      const sourceLeaf = plugin.app.workspace.getLeaf('tab');
      await sourceLeaf.openFile(graphFile as any, { active: false });

      const graphLeaf = plugin.app.workspace.getLeaf('tab');
      if (typeof (graphLeaf as any).setGroupMember === 'function') {
        (graphLeaf as any).setGroupMember(sourceLeaf);
      }
      await graphLeaf.setViewState({
        type: 'localgraph',
        state: { file: graphPath }
      });

      plugin.app.workspace.setActiveLeaf(graphLeaf, { focus: true });

      const view = graphLeaf.view;
      if (view) {
        if (typeof (view as any).update === 'function') (view as any).update();
        if (typeof (view as any).render === 'function') (view as any).render();
        if (typeof view.onResize === 'function') view.onResize();
      }
      plugin.app.workspace.trigger('layout-change');

      setTimeout(async () => {
        if (graphLeaf && !(graphLeaf as any).detached) {
          try {
            await graphLeaf.setViewState({
              type: 'localgraph',
              state: { file: graphPath }
            });
          } catch {
            // 忽略局部图谱延迟刷新失败
          }
        }
      }, 150);

      new Notice(t('deckStudyPage.knowledgeGraph.opened', { name: deck.name, count: String(sources.length) }));
    } catch (error) {
      logger.error('[DeckStudyPage] 打开牌组知识图谱失败:', error);
      new Notice(t('deckStudyPage.knowledgeGraph.openFailed'));
    }
  }

// 解散牌组
  async function dissolveDeck(deckId: string) {
    try {
      const targetDeck = decks.find(d => d.id === deckId);
      if (isVirtualWDeckDeck(targetDeck)) {
        await dissolveWDeckDeck(deckId);
        return;
      }
      
      const deck = decks.find(d => d.id === deckId);
      if (!deck) {
        new Notice(t('deckStudyPage.notices.deckNotFound'));
        return;
      }
      
      const cardCount = deck.cardUUIDs?.length || 0;
      
      // 使用 Obsidian Modal 确认
      const modal = new Modal(plugin.app);
      modal.titleEl.setText(t('deckStudyPage.dissolve.title'));
      
      // 创建消息内容
      const messageEl = modal.contentEl.createDiv({ cls: 'dissolve-confirm-message' });
      messageEl.createEl('p', { text: t('deckStudyPage.dissolve.confirmMessage', { name: deck.name }) });
      messageEl.createEl('p', { 
        text: t('deckStudyPage.dissolve.cardCount', { count: String(cardCount) }),
        cls: 'dissolve-card-count'
      });
      messageEl.createEl('p', { 
        text: t('deckStudyPage.dissolve.warning'),
        cls: 'dissolve-warning'
      });
      
      // 创建按钮容器
      const buttonContainer = modal.contentEl.createDiv({ cls: 'dissolve-confirm-buttons' });
      buttonContainer.style.display = 'flex';
      buttonContainer.style.justifyContent = 'flex-end';
      buttonContainer.style.gap = '10px';
      buttonContainer.style.marginTop = '16px';
      
      let shouldDissolve = false;
      
      const cancelButton = buttonContainer.createEl('button', { text: t('common.cancel') });
      cancelButton.onclick = () => {
        modal.close();
      };
      
      const dissolveButton = buttonContainer.createEl('button', { 
        text: t('deckStudyPage.dissolve.confirmButton'),
        cls: 'mod-warning'
      });
      dissolveButton.onclick = () => {
        shouldDissolve = true;
        modal.close();
      };
      
      modal.onClose = async () => {
        if (!shouldDissolve) return;
        
        try {
          new Notice(t('deckStudyPage.dissolve.inProgress'));

          const result = await dataStorage.deleteDeck(deckId, {
            skipCardDeletion: true,
          });
          if (!result.success) {
            throw new Error(result.error || t('deckStudyPage.dissolve.failed'));
          }
          
          // 刷新数据
          decks = await dataStorage.getDecks();
          await refreshData();
          
          // 通知全局侧边栏刷新
          plugin.app.workspace.trigger('Weave:data-changed');
          
          new Notice(t('deckStudyPage.dissolve.success', { name: deck.name }));
        } catch (error) {
          logger.error('[DeckStudyPage] Dissolve deck failed:', error);
          new Notice(`${t('deckStudyPage.dissolve.failed')}: ${error instanceof Error ? error.message : t('common.unknown')}`);
        }
      };
      
      modal.open();
    } catch (error) {
      logger.error('[DeckStudyPage] Dissolve deck failed:', error);
      new Notice(`${t('deckStudyPage.dissolve.failed')}: ${error instanceof Error ? error.message : t('common.unknown')}`);
    }
  }

  // 打开牌组分析
  async function openDeckAnalytics(deckId: string) {
    try {
      if (!premiumGuard.canUseAnyFeature([...deckAnalyticsEntryFeatures], deckStudyFeatureContext)) {
        promptPremiumFeature(PREMIUM_FEATURES.DECK_ANALYTICS);
        return;
      }

      const deckCards = await dataStorage.getDeckCards(deckId);
      const initialAnalyticsTab = premiumGuard.canUseFeature(PREMIUM_FEATURES.DECK_ANALYTICS_RETENTION, deckStudyFeatureContext)
        ? 'retention'
        : premiumGuard.canUseFeature(PREMIUM_FEATURES.DECK_ANALYTICS_TIMING, deckStudyFeatureContext)
          ? 'timing'
          : 'quantity';
      
      deckAnalyticsModalInstance?.close();
      deckAnalyticsModalInstance = new DeckAnalyticsModalObsidian(plugin.app, {
        plugin,
        deckId,
        cards: deckCards,
        initialTab: initialAnalyticsTab,
        onClose: () => {
          deckAnalyticsModalInstance = null;
        }
      });
      deckAnalyticsModalInstance.open();
      
      logger.debug('[DeckStudyPage] 打开牌组分析:', { deckId, cardCount: deckCards.length });
    } catch (error) {
      logger.error('[DeckStudyPage] 打开牌组分析失败:', error);
      new Notice(t('deckStudyPage.analyticsAction.openFailed'));
    }
  }

  async function handleMemoryDeckMenuAction(action: MemoryDeckMenuAction, deckId: string): Promise<void> {
    await modeActions.handleMemoryDeckMenuAction(action, deckId);
  }


  // 初始化加载牌组和卡片
  // 初始化数据加载
  $effect(() => {
    (async () => {
      try {
        isLoading = true;
        await refreshData();
      } catch (error) {
        logger.error('[DeckStudyPage] ❌ 初始化失败:', error);
        // 即使初始化失败，也不阻止组件渲染
        // 用户可以通过手动刷新重试
      } finally {
        isLoading = false;
      }
    })();
  });

  // 监听导航栏功能键事件
  $effect(() => {
    const handleCreateDeck = () => {
      void handleCreateDeckForCurrentFilter();
    };

    const handleMoreActions = (e: Event) => {
      // 从 CustomEvent 中获取原始鼠标事件
      const customEvent = e as CustomEvent<{ event: MouseEvent }>;
      const mouseEvent = customEvent.detail?.event;
      if (mouseEvent) {
        showMoreActionsMenu(mouseEvent);
      }
    };

// 处理 APKG 导入
    const handleAPKGImport = () => {
      if (!isAPKGImportEnabled()) {
        return;
      }

      showAPKGImportModalWithObsidianAPI();
    };

// 处理 CSV 导入（使用 CSVImportModal 向导）
    const handleCSVImport = () => {
      if (!isCSVImportEnabled()) {
        return;
      }

      openPremiumFeature(PREMIUM_FEATURES.CSV_IMPORT, () => {
        showCSVImportModal = true;
      });
    };

// 处理 JSON 导出
    const handleJSONExport = () => {
      exportDeck();
    };

    document.addEventListener('create-deck', handleCreateDeck);
    document.addEventListener('create-question-bank', handleCreateDeck);
    document.addEventListener('more-actions', handleMoreActions);
    document.addEventListener('apkg-import', handleAPKGImport);
    document.addEventListener('csv-import', handleCSVImport);
    document.addEventListener('json-export', handleJSONExport);
    return () => {
      document.removeEventListener('create-deck', handleCreateDeck);
      document.removeEventListener('create-question-bank', handleCreateDeck);
      document.removeEventListener('more-actions', handleMoreActions);
      document.removeEventListener('apkg-import', handleAPKGImport);
      document.removeEventListener('csv-import', handleCSVImport);
      document.removeEventListener('json-export', handleJSONExport);
    };
  });



  let contentAreaProps = $derived({
    currentView,
    selectedFilter,
    dataStorage,
    plugin,
    deckTree,
    deckStats,
    qbDeckTree,
    qbDeckStats,
    irDeckTree,
    irDeckStats,
    studySessions,
    memoryDeckLevels,
    emergentCandidates,
    emergentDeckViews,
    emergentDeckStats,
    formalDeckBindingSummary,
    memoryDeckDisplayMode,
    canShowMemoryDeckLevels,
    onFilterSelect: handleFilterSelect,
    onStartStudy: startStudy,
    onContinueStudy: handleContinueStudy,
    onAdvanceStudy: startAdvanceStudy,
    onOpenDeckAnalytics: openDeckAnalytics,
    onAssociateQuestionBank: associateQuestionBank,
    onEditDeck: editDeck,
    onDeleteDeck: deleteDeck,
    onOpenKnowledgeGraph: openKnowledgeGraph,
    onDissolveDeck: dissolveDeck,
    onRefreshData: refreshData,
    onPromoteEmergentDeck: handlePromoteEmergentDeck,
    memoryDeckMenuActionHandler: handleMemoryDeckMenuAction,
    onKanbanStartStudy: kanbanStartStudy,
    onKanbanEditDeck: kanbanEditDeck,
    onKanbanDeleteDeck: kanbanDeleteDeck,
  } satisfies DeckStudyContentAreaProps);

  let modalHostProps = $derived({
    plugin,
    dataStorage,
    showCreateQuestionBankModal,
    showCSVImportModal,
    showCelebrationModal,
    celebrationStats,
    celebrationDeckName,
    celebrationDeckId,
    showNoCardsModal,
    noCardsDeckName,
    noCardsReason,
    noCardsStats,
    promptFeatureId,
    showActivationPrompt,
    onSetShowCreateQuestionBankModal: (value: boolean) => {
      showCreateQuestionBankModal = value;
    },
    onSetShowCSVImportModal: (value: boolean) => {
      showCSVImportModal = value;
    },
    onLoadQBDeckTree: loadQBDeckTree,
    onRefreshData: async () => {
      await refreshData();
    },
    onCloseCelebration: handleCloseCelebration,
    onStartPractice: handleStartPractice,
    onCloseNoCardsModal: handleCloseNoCardsModal,
    onAdvanceStudy: handleAdvanceStudy,
    onViewStats: handleViewStats,
    onStartPracticeFromNoCards: handleStartPracticeFromNoCards,
    onCloseActivationPrompt: () => {
      showActivationPrompt = false;
    },
  } satisfies DeckStudyModalHostProps);
</script>

<div class="anki-app deck-study-page">
  <!--  移动端头部组件 -->
  {#if isMobile}
    <MobileDeckStudyHeader
      {selectedFilter}
      onMenuClick={handleMobileMenuClick}
      onFilterSelect={handleFilterSelect}
    />
  {/if}

  <!--  加载动画 - 全屏显示 -->
  {#if isLoading}
    <div class="deck-loading-overlay">
      <BouncingBallsLoader message={t('deckStudyPage.studyActions.loading')} />
    </div>
  {:else}
  <div class="deck-study-content">
    <DeckStudyContentArea {...contentAreaProps} />
  </div>
  {/if}
</div>

{#if showEmergentRuleGroupPopover}
  {@const currentRuleGroupDraft = getCurrentEmergentRuleGroupDraft()}
  {@const visibleConditions = getVisibleEmergentRuleConditions(currentRuleGroupDraft.id)}
  <div
    class="weave-emergent-rule-popover"
    use:portalToBody
    style={emergentRuleGroupPopoverStyle}
  >
    <div class="weave-emergent-rule-popover__header">
      <div class="weave-emergent-rule-popover__header-main">
        <div class="weave-emergent-rule-popover__title">涌现筛选组</div>
      </div>

      <div class="weave-emergent-rule-popover__header-actions">
        <button
          class="weave-emergent-rule-popover__icon-btn"
          type="button"
          onclick={createEmergentRuleGroupDraft}
          aria-label="新增筛选组"
          title="新增筛选组"
        >
          <ObsidianIcon name="plus" size={14} />
        </button>
        <button
          class="weave-emergent-rule-popover__icon-btn"
          type="button"
          onclick={(event) => showEmergentRuleGroupMoreMenu(event, currentRuleGroupDraft.id)}
          aria-label="更多"
          title="更多"
        >
          <ObsidianIcon name="more-horizontal" size={14} />
        </button>
      </div>
    </div>

    <div class="weave-emergent-rule-popover__body">
      <section class="weave-emergent-rule-popover__workspace">
        <div class="weave-emergent-rule-popover__group-row">
          <button
            type="button"
            class="weave-emergent-rule-popover__switcher"
            onclick={(event) => showEmergentRuleGroupSwitcherMenu(event)}
          >
            <span>{currentRuleGroupDraft.name || "默认观察"}</span>
            <ObsidianIcon name="chevron-down" size={14} />
          </button>
          <label class="weave-emergent-rule-popover__field is-inline">
            <span>筛选组名称</span>
            <input
              type="text"
              value={currentRuleGroupDraft.name}
              oninput={(event) => updateEmergentRuleGroupDraftName(currentRuleGroupDraft.id, (event.currentTarget as HTMLInputElement).value)}
              placeholder="默认观察"
            />
          </label>
        </div>

        <section class="weave-emergent-rule-popover__block">
          <div class="weave-emergent-rule-popover__block-head">
            <div class="weave-emergent-rule-popover__block-meta">
              <div class="weave-emergent-rule-popover__block-label">显示门槛</div>
            </div>
          </div>

          <div class="weave-emergent-rule-popover__threshold-row">
            <button type="button" class="weave-emergent-rule-popover__token is-static">
              标签簇卡片数
            </button>
            <button type="button" class="weave-emergent-rule-popover__token is-static">
              至少
            </button>
            <input
              class="weave-emergent-rule-popover__inline-input"
              type="number"
              min="1"
              value={currentRuleGroupDraft.minCandidateCardCount}
              oninput={(event) => updateEmergentRuleGroupDraftThreshold(currentRuleGroupDraft.id, (event.currentTarget as HTMLInputElement).value)}
            />
            <span class="weave-emergent-rule-popover__inline-suffix">张</span>
          </div>
        </section>

        <section class="weave-emergent-rule-popover__block">
          <div class="weave-emergent-rule-popover__block-head">
            <div class="weave-emergent-rule-popover__block-meta">
              <div class="weave-emergent-rule-popover__block-label">候选池过滤</div>
            </div>
          </div>

          <div class="weave-emergent-rule-popover__condition-list">
            <div class="weave-emergent-rule-popover__condition-row">
              <button type="button" class="weave-emergent-rule-popover__drag-handle" aria-label="条件顺序">
                <ObsidianIcon name="grip-vertical" size={14} />
              </button>
              <button type="button" class="weave-emergent-rule-popover__logic-pill">当</button>
              <button type="button" class="weave-emergent-rule-popover__token is-static">标签</button>
              <button type="button" class="weave-emergent-rule-popover__token is-static">包含任一</button>
              <div
                class="weave-emergent-rule-popover__value-surface is-clickable"
                role="button"
                tabindex="0"
                onclick={(event) => openEmergentRuleTagSuggestModal(currentRuleGroupDraft.id, "requiredTags", event.currentTarget as HTMLElement)}
                onkeydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEmergentRuleTagSuggestModal(currentRuleGroupDraft.id, "requiredTags", event.currentTarget as HTMLElement);
                  }
                }}
              >
                {#if currentRuleGroupDraft.requiredTags.length > 0}
                  {#each currentRuleGroupDraft.requiredTags as tag (tag)}
                    <span class="weave-emergent-rule-popover__tag-chip">
                      <span>{tag}</span>
                      <button
                        type="button"
                        class="weave-emergent-rule-popover__tag-chip-remove"
                        onclick={(event) => {
                          event.stopPropagation();
                          removeEmergentRuleGroupTagDraft(currentRuleGroupDraft.id, "requiredTags", tag);
                        }}
                        aria-label={`移除标签 ${tag}`}
                      >
                        <ObsidianIcon name="x" size={12} />
                      </button>
                    </span>
                  {/each}
                {:else}
                  <span class="weave-emergent-rule-popover__placeholder-text">选择标签</span>
                {/if}
              </div>
              <button
                type="button"
                class="weave-emergent-rule-popover__row-menu"
                aria-label="更多"
                onclick={(event) => showEmergentRuleConditionRowMenu(event, currentRuleGroupDraft.id, "requiredTags")}
              >
                <ObsidianIcon name="more-horizontal" size={14} />
              </button>
            </div>

            {#if visibleConditions.includes("createdAt")}
              <div class="weave-emergent-rule-popover__condition-row">
                <button type="button" class="weave-emergent-rule-popover__drag-handle" aria-label="条件顺序">
                  <ObsidianIcon name="grip-vertical" size={14} />
                </button>
                <button type="button" class="weave-emergent-rule-popover__logic-pill">与</button>
                <button type="button" class="weave-emergent-rule-popover__token is-static">创建时间</button>
                <button type="button" class="weave-emergent-rule-popover__token is-static">在范围内</button>
                <div class="weave-emergent-rule-popover__value-surface is-split">
                  <input
                    type="date"
                    value={currentRuleGroupDraft.createdAfter || ""}
                    oninput={(event) => updateEmergentRuleGroupDateDraft(currentRuleGroupDraft.id, "createdAfter", (event.currentTarget as HTMLInputElement).value)}
                  />
                  <span class="weave-emergent-rule-popover__split-divider"></span>
                  <input
                    type="date"
                    value={currentRuleGroupDraft.createdBefore || ""}
                    oninput={(event) => updateEmergentRuleGroupDateDraft(currentRuleGroupDraft.id, "createdBefore", (event.currentTarget as HTMLInputElement).value)}
                  />
                </div>
                <button
                  type="button"
                  class="weave-emergent-rule-popover__row-menu"
                  aria-label="更多"
                  onclick={(event) => showEmergentRuleConditionRowMenu(event, currentRuleGroupDraft.id, "createdAt")}
                >
                  <ObsidianIcon name="more-horizontal" size={14} />
                </button>
              </div>
            {/if}

            {#if visibleConditions.includes("onlyLearnableDecks")}
              <div class="weave-emergent-rule-popover__condition-row">
                <button type="button" class="weave-emergent-rule-popover__drag-handle" aria-label="条件顺序">
                  <ObsidianIcon name="grip-vertical" size={14} />
                </button>
                <button type="button" class="weave-emergent-rule-popover__logic-pill">与</button>
                <button type="button" class="weave-emergent-rule-popover__token is-static">卡片状态</button>
                <button type="button" class="weave-emergent-rule-popover__token is-static">仅显示</button>
                <label class="weave-emergent-rule-popover__value-surface">
                  <input
                    type="checkbox"
                    checked={currentRuleGroupDraft.onlyLearnableDecks}
                    onchange={(event) => updateEmergentRuleGroupOnlyLearnableDraft(currentRuleGroupDraft.id, (event.currentTarget as HTMLInputElement).checked)}
                  />
                  <span>含有可学习卡片的涌现牌组</span>
                </label>
                <button
                  type="button"
                  class="weave-emergent-rule-popover__row-menu"
                  aria-label="更多"
                  onclick={(event) => showEmergentRuleConditionRowMenu(event, currentRuleGroupDraft.id, "onlyLearnableDecks")}
                >
                  <ObsidianIcon name="more-horizontal" size={14} />
                </button>
              </div>
            {/if}

            {#if visibleConditions.includes("sourceFolders")}
              <div class="weave-emergent-rule-popover__condition-row">
                <button type="button" class="weave-emergent-rule-popover__drag-handle" aria-label="条件顺序">
                  <ObsidianIcon name="grip-vertical" size={14} />
                </button>
                <button type="button" class="weave-emergent-rule-popover__logic-pill">与</button>
                <button type="button" class="weave-emergent-rule-popover__token is-static">来源文件夹</button>
                <button type="button" class="weave-emergent-rule-popover__token is-static">位于</button>
                <div
                  class="weave-emergent-rule-popover__value-surface is-clickable"
                  role="button"
                  tabindex="0"
                  onclick={(event) => addEmergentRuleGroupSourceFolderDraft(currentRuleGroupDraft.id, event.currentTarget as HTMLElement)}
                  onkeydown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      addEmergentRuleGroupSourceFolderDraft(currentRuleGroupDraft.id, event.currentTarget as HTMLElement);
                    }
                  }}
                >
                  {#if currentRuleGroupDraft.sourceFolders.length > 0}
                    {#each currentRuleGroupDraft.sourceFolders as folderPath (folderPath)}
                      <span class="weave-emergent-rule-popover__folder-chip">
                        <span>{folderPath}</span>
                        <button
                          type="button"
                          class="weave-emergent-rule-popover__folder-chip-remove"
                          onclick={(event) => {
                            event.stopPropagation();
                            removeEmergentRuleGroupSourceFolderDraft(currentRuleGroupDraft.id, folderPath);
                          }}
                          aria-label={`移除文件夹 ${folderPath}`}
                        >
                          <ObsidianIcon name="x" size={12} />
                        </button>
                      </span>
                    {/each}
                  {:else}
                    <span class="weave-emergent-rule-popover__placeholder-text">选择文件夹</span>
                  {/if}
                </div>
                <button
                  type="button"
                  class="weave-emergent-rule-popover__row-menu"
                  aria-label="更多"
                  onclick={(event) => showEmergentRuleConditionRowMenu(event, currentRuleGroupDraft.id, "sourceFolders")}
                >
                  <ObsidianIcon name="more-horizontal" size={14} />
                </button>
              </div>
            {/if}

            {#if visibleConditions.includes("priority")}
              <div class="weave-emergent-rule-popover__condition-row">
                <button type="button" class="weave-emergent-rule-popover__drag-handle" aria-label="条件顺序">
                  <ObsidianIcon name="grip-vertical" size={14} />
                </button>
                <button type="button" class="weave-emergent-rule-popover__logic-pill">与</button>
                <button type="button" class="weave-emergent-rule-popover__token is-static">优先级</button>
                <button type="button" class="weave-emergent-rule-popover__token is-static">介于</button>
                <div class="weave-emergent-rule-popover__value-surface is-split">
                  <input
                    type="number"
                    min="0"
                    placeholder="最低"
                    value={currentRuleGroupDraft.priorityMin ?? ""}
                    oninput={(event) => updateEmergentRuleGroupPriorityDraft(currentRuleGroupDraft.id, "priorityMin", (event.currentTarget as HTMLInputElement).value)}
                  />
                  <span class="weave-emergent-rule-popover__split-divider"></span>
                  <input
                    type="number"
                    min="0"
                    placeholder="最高"
                    value={currentRuleGroupDraft.priorityMax ?? ""}
                    oninput={(event) => updateEmergentRuleGroupPriorityDraft(currentRuleGroupDraft.id, "priorityMax", (event.currentTarget as HTMLInputElement).value)}
                  />
                </div>
                <button
                  type="button"
                  class="weave-emergent-rule-popover__row-menu"
                  aria-label="更多"
                  onclick={(event) => showEmergentRuleConditionRowMenu(event, currentRuleGroupDraft.id, "priority")}
                >
                  <ObsidianIcon name="more-horizontal" size={14} />
                </button>
              </div>
            {/if}

            {#if visibleConditions.includes("excludedTags")}
              <div class="weave-emergent-rule-popover__condition-row">
                <button type="button" class="weave-emergent-rule-popover__drag-handle" aria-label="条件顺序">
                  <ObsidianIcon name="grip-vertical" size={14} />
                </button>
                <button type="button" class="weave-emergent-rule-popover__logic-pill">与</button>
                <button type="button" class="weave-emergent-rule-popover__token is-static">标签</button>
                <button type="button" class="weave-emergent-rule-popover__token is-static">不包含</button>
                <div
                  class="weave-emergent-rule-popover__value-surface is-clickable"
                  role="button"
                  tabindex="0"
                  onclick={(event) => openEmergentRuleTagSuggestModal(currentRuleGroupDraft.id, "excludedTags", event.currentTarget as HTMLElement)}
                  onkeydown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openEmergentRuleTagSuggestModal(currentRuleGroupDraft.id, "excludedTags", event.currentTarget as HTMLElement);
                    }
                  }}
                >
                  {#if currentRuleGroupDraft.excludedTags.length > 0}
                    {#each currentRuleGroupDraft.excludedTags as tag (tag)}
                      <span class="weave-emergent-rule-popover__tag-chip is-muted">
                        <span>{tag}</span>
                        <button
                          type="button"
                          class="weave-emergent-rule-popover__tag-chip-remove"
                          onclick={(event) => {
                            event.stopPropagation();
                            removeEmergentRuleGroupTagDraft(currentRuleGroupDraft.id, "excludedTags", tag);
                          }}
                          aria-label={`移除标签 ${tag}`}
                        >
                          <ObsidianIcon name="x" size={12} />
                        </button>
                      </span>
                    {/each}
                  {:else}
                    <span class="weave-emergent-rule-popover__placeholder-text">选择排除标签</span>
                  {/if}
                </div>
                <button
                  type="button"
                  class="weave-emergent-rule-popover__row-menu"
                  aria-label="更多"
                  onclick={(event) => showEmergentRuleConditionRowMenu(event, currentRuleGroupDraft.id, "excludedTags")}
                >
                  <ObsidianIcon name="more-horizontal" size={14} />
                </button>
              </div>
            {/if}
          </div>
          <div class="weave-emergent-rule-popover__block-actions is-condition-footer">
            <button
              type="button"
              class="weave-emergent-rule-popover__text-btn is-inline-action"
              onclick={(event) => showEmergentRuleConditionMenu(event, currentRuleGroupDraft.id)}
            >
              <ObsidianIcon name="plus" size={14} />
              <span>添加条件</span>
            </button>
          </div>
        </section>
      </section>
    </div>

    <div class="weave-emergent-rule-popover__footer">
      <button type="button" class="weave-emergent-rule-popover__text-btn" onclick={closeEmergentRuleGroupPopover}>取消</button>
      <button type="button" class="weave-emergent-rule-popover__primary-btn" onclick={applyEmergentRuleGroupDraftsV2}>保存并应用</button>
    </div>
  </div>
{/if}

<DeckStudyModalHost {...modalHostProps} />

<style>
  .deck-study-page {
    --weave-deck-page-bg: var(--weave-surface-background, var(--weave-surface, var(--background-primary)));
    --weave-deck-card-bg: color-mix(
      in srgb,
      var(--weave-deck-page-bg) 88%,
      var(--weave-elevated-background, var(--background-secondary))
    );
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--weave-deck-page-bg);
    overflow: hidden;
    /*  不需要 position: relative，庆祝模态窗使用 fixed 定位 */
    min-height: 100vh;
  }

  /*  加载覆盖层 */
  .deck-loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--weave-deck-page-bg);
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

  .deck-study-content {
    --weave-deck-page-content-gap: 1rem;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    background: var(--weave-deck-page-bg);
    overflow: hidden;
  }

  /*  移动端内容区间距优化 */
  :global(body.is-mobile) .deck-study-content {
    padding: 4px 2px; /* 减少内容区与标签页的间距 */
  }

  .weave-emergent-rule-popover {
    position: fixed;
    z-index: calc(var(--z-index-overlay, 300) + 20);
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    border-radius: 20px;
    border: 1px solid var(--background-modifier-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 24%),
      color-mix(in srgb, var(--background-primary) 96%, transparent);
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(14px);
    overflow: visible;
  }

  :global(.menu) {
    z-index: calc(var(--z-index-modal, 400) + 10);
    font-size: var(--font-ui-small, 13px);
  }

  :global(.menu .menu-item) {
    font-size: var(--font-ui-small, 13px);
  }

  .weave-emergent-rule-popover__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .weave-emergent-rule-popover__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px 14px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .weave-emergent-rule-popover__header-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
  }

  .weave-emergent-rule-popover__title {
    font-size: var(--font-ui-medium, 14px);
    font-weight: 700;
    color: var(--text-normal);
    line-height: 1.35;
  }

  .weave-emergent-rule-popover__switcher {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-secondary) 88%, transparent);
    color: var(--text-normal);
    cursor: pointer;
    font-size: var(--font-ui-small, 13px);
    font-weight: 600;
    box-sizing: border-box;
  }

  .weave-emergent-rule-popover__switcher:hover,
  .weave-emergent-rule-popover__icon-btn:hover,
  .weave-emergent-rule-popover__text-btn:hover,
  .weave-emergent-rule-popover__row-menu:hover,
  .weave-emergent-rule-popover__drag-handle:hover {
    border-color: transparent;
    background: color-mix(in srgb, var(--background-modifier-hover) 82%, transparent);
  }

  .weave-emergent-rule-popover__switcher:focus-visible,
  .weave-emergent-rule-popover__icon-btn:focus-visible,
  .weave-emergent-rule-popover__text-btn:focus-visible,
  .weave-emergent-rule-popover__row-menu:focus-visible,
  .weave-emergent-rule-popover__drag-handle:focus-visible,
  .weave-emergent-rule-popover__value-surface.is-clickable:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, var(--interactive-accent) 55%, var(--background-modifier-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 22%, transparent);
  }

  .weave-emergent-rule-popover__header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .weave-emergent-rule-popover__icon-btn,
  .weave-emergent-rule-popover__text-btn,
  .weave-emergent-rule-popover__primary-btn,
  .weave-emergent-rule-popover__token,
  .weave-emergent-rule-popover__logic-pill,
  .weave-emergent-rule-popover__drag-handle,
  .weave-emergent-rule-popover__row-menu {
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-secondary) 88%, transparent);
    color: var(--text-normal);
    cursor: pointer;
  }

  .weave-emergent-rule-popover__icon-btn,
  .weave-emergent-rule-popover__row-menu,
  .weave-emergent-rule-popover__drag-handle {
    border: none;
    background: transparent;
    box-shadow: none;
    color: var(--text-muted);
  }

  .weave-emergent-rule-popover__icon-btn {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 8px;
  }

  .weave-emergent-rule-popover__body {
    padding: 14px 18px 18px;
    overflow: auto;
  }

  .weave-emergent-rule-popover__workspace {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .weave-emergent-rule-popover__group-row {
    display: grid;
    grid-template-columns: minmax(150px, 180px) minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }

  .weave-emergent-rule-popover__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .weave-emergent-rule-popover__field.is-inline {
    min-width: 0;
  }

  .weave-emergent-rule-popover__field.is-inline span {
    display: none;
  }

  .weave-emergent-rule-popover__field span {
    font-size: var(--font-ui-small, 13px);
    color: var(--text-muted);
  }

  .weave-emergent-rule-popover__field input {
    width: 100%;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-secondary) 82%, transparent);
    color: var(--text-normal);
    font-size: var(--font-ui-medium, 14px);
    font-weight: 600;
    transition: border-color 0.14s ease, background-color 0.14s ease, box-shadow 0.14s ease;
  }

  .weave-emergent-rule-popover__field input:hover,
  .weave-emergent-rule-popover__inline-input:hover,
  .weave-emergent-rule-popover__value-surface:hover {
    border-color: color-mix(in srgb, var(--background-modifier-border) 92%, var(--text-muted));
  }

  .weave-emergent-rule-popover__field input:focus,
  .weave-emergent-rule-popover__field input:focus-visible,
  .weave-emergent-rule-popover__inline-input:focus,
  .weave-emergent-rule-popover__inline-input:focus-visible,
  .weave-emergent-rule-popover__value-surface.is-split:focus-within {
    outline: none;
    border-color: color-mix(in srgb, var(--interactive-accent) 55%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--background-primary) 86%, var(--background-secondary));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 22%, transparent);
  }

  .weave-emergent-rule-popover__block {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border-radius: 16px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 55%, transparent);
    background: color-mix(in srgb, var(--background-secondary) 62%, transparent);
    transition: border-color 0.14s ease, background-color 0.14s ease;
  }

  .weave-emergent-rule-popover__block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .weave-emergent-rule-popover__block-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .weave-emergent-rule-popover__block-label,
  .weave-emergent-rule-popover__placeholder-text,
  .weave-emergent-rule-popover__inline-suffix {
    font-size: var(--font-ui-small, 13px);
    color: var(--text-muted);
  }

  .weave-emergent-rule-popover__text-btn,
  .weave-emergent-rule-popover__primary-btn {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 10px;
    font-size: var(--font-ui-small, 13px);
  }

  .weave-emergent-rule-popover__primary-btn {
    background: color-mix(in srgb, var(--interactive-accent) 82%, black 6%);
    color: var(--text-on-accent);
    border-color: color-mix(in srgb, var(--interactive-accent) 72%, black 8%);
  }

  .weave-emergent-rule-popover__threshold-row {
    display: grid;
    grid-template-columns: minmax(110px, max-content) minmax(64px, max-content) 84px minmax(24px, max-content);
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 80%, transparent);
    background: color-mix(in srgb, var(--background-primary) 78%, var(--background-secondary));
    transition: border-color 0.14s ease, background-color 0.14s ease;
  }

  .weave-emergent-rule-popover__token,
  .weave-emergent-rule-popover__logic-pill {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: var(--font-ui-small, 13px);
    font-weight: 500;
  }

  .weave-emergent-rule-popover__logic-pill {
    min-width: 42px;
    padding: 0 12px;
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-secondary));
    border-color: color-mix(in srgb, var(--interactive-accent) 16%, var(--background-modifier-border));
    color: var(--text-normal);
    font-weight: 600;
  }

  .weave-emergent-rule-popover__inline-input {
    width: 100%;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-secondary) 82%, transparent);
    color: var(--text-normal);
    font-size: var(--font-ui-medium, 14px);
    font-weight: 600;
  }

  .weave-emergent-rule-popover__condition-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .weave-emergent-rule-popover__condition-row {
    display: grid;
    grid-template-columns: 32px 44px minmax(68px, max-content) minmax(84px, max-content) minmax(0, 1fr) 32px;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 80%, transparent);
    background: color-mix(in srgb, var(--background-primary) 78%, var(--background-secondary));
    transition: border-color 0.14s ease, background-color 0.14s ease;
  }

  .weave-emergent-rule-popover__threshold-row:hover,
  .weave-emergent-rule-popover__condition-row:hover {
    border-color: color-mix(in srgb, var(--background-modifier-border) 96%, var(--text-muted));
    background: color-mix(in srgb, var(--background-primary) 82%, var(--background-secondary));
  }

  .weave-emergent-rule-popover__threshold-row .weave-emergent-rule-popover__token {
    padding-left: 10px;
    padding-right: 10px;
  }

  .weave-emergent-rule-popover__threshold-row .weave-emergent-rule-popover__inline-suffix {
    justify-self: start;
    white-space: nowrap;
  }

  .weave-emergent-rule-popover__drag-handle,
  .weave-emergent-rule-popover__row-menu {
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .weave-emergent-rule-popover__row-menu {
    margin-left: auto;
  }

  .weave-emergent-rule-popover__value-surface {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 4px 10px;
    border-radius: 12px;
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary) 74%, var(--background-secondary));
    width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    transition: border-color 0.14s ease, background-color 0.14s ease, box-shadow 0.14s ease;
  }

  .weave-emergent-rule-popover__token,
  .weave-emergent-rule-popover__logic-pill,
  .weave-emergent-rule-popover__placeholder-text {
    white-space: nowrap;
  }

  .weave-emergent-rule-popover__condition-row .weave-emergent-rule-popover__token {
    padding-left: 10px;
    padding-right: 10px;
  }

  .weave-emergent-rule-popover__condition-row .weave-emergent-rule-popover__logic-pill {
    min-width: 44px;
    padding-left: 10px;
    padding-right: 10px;
  }

  .weave-emergent-rule-popover__value-surface.is-clickable {
    cursor: pointer;
  }

  .weave-emergent-rule-popover__value-surface.is-split {
    flex-wrap: nowrap;
    gap: 10px;
  }

  .weave-emergent-rule-popover__value-surface.is-split input {
    min-width: 0;
    flex: 1 1 0;
    min-height: 36px;
    border: 0;
    background: transparent;
    color: var(--text-normal);
    font-size: var(--font-ui-small, 13px);
    outline: none;
  }

  .weave-emergent-rule-popover__split-divider {
    width: 1px;
    height: 18px;
    background: var(--background-modifier-border);
    flex: 0 0 auto;
  }

  .weave-emergent-rule-popover__tag-chip,
  .weave-emergent-rule-popover__folder-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 999px;
    font-size: var(--font-ui-small, 13px);
    color: var(--text-normal);
  }

  .weave-emergent-rule-popover__tag-chip {
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 22%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--interactive-accent) 18%, var(--background-primary));
  }

  .weave-emergent-rule-popover__tag-chip.is-muted {
    border-color: var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary) 88%, transparent);
  }

  .weave-emergent-rule-popover__folder-chip {
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary) 82%, transparent);
  }

  .weave-emergent-rule-popover__folder-chip-remove,
  .weave-emergent-rule-popover__tag-chip-remove,
  .weave-emergent-rule-popover__switcher {
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-secondary) 88%, transparent);
    color: var(--text-normal);
    cursor: pointer;
  }

  .weave-emergent-rule-popover__folder-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 999px;
  }

  .weave-emergent-rule-popover__tag-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 999px;
  }

  .weave-emergent-rule-popover__block-actions {
    display: flex;
    justify-content: flex-start;
    padding-top: 2px;
  }

  .weave-emergent-rule-popover__block-actions.is-condition-footer {
    padding-top: 0;
  }

  .weave-emergent-rule-popover__text-btn.is-inline-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding-left: 4px;
    padding-right: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    box-shadow: none;
  }

  .weave-emergent-rule-popover__text-btn.is-inline-action:hover {
    color: var(--text-normal);
    background: transparent;
  }

  .weave-emergent-rule-popover__footer {
    padding: 12px 18px 16px;
    border-top: 1px solid var(--background-modifier-border);
  }

  @media (max-width: 960px) {
    .weave-emergent-rule-popover__threshold-row {
      grid-template-columns: minmax(0, 1fr) minmax(64px, max-content) 76px minmax(24px, max-content);
    }

    .weave-emergent-rule-popover__condition-row {
      grid-template-columns: 36px 52px 1fr;
      align-items: start;
    }

    .weave-emergent-rule-popover__group-row {
      grid-template-columns: 1fr;
    }

    .weave-emergent-rule-popover__token,
    .weave-emergent-rule-popover__value-surface,
    .weave-emergent-rule-popover__row-menu {
      grid-column: 2 / -1;
    }

    .weave-emergent-rule-popover__row-menu {
      justify-self: end;
    }
  }

  @media (max-width: 720px) {
    .weave-emergent-rule-popover__header,
    .weave-emergent-rule-popover__body,
    .weave-emergent-rule-popover__footer {
      padding-left: 16px;
      padding-right: 16px;
    }

    .weave-emergent-rule-popover__header {
      padding-top: 18px;
      padding-bottom: 16px;
    }

    .weave-emergent-rule-popover__body {
      padding-top: 16px;
      padding-bottom: 16px;
    }

    .weave-emergent-rule-popover__footer {
      padding-top: 14px;
      padding-bottom: 16px;
    }

    .weave-emergent-rule-popover__header {
      flex-direction: column;
      align-items: stretch;
    }

    .weave-emergent-rule-popover__header-actions {
      justify-content: flex-end;
    }

    .weave-emergent-rule-popover__block-head,
    .weave-emergent-rule-popover__threshold-row {
      flex-wrap: wrap;
    }
  }
</style>
