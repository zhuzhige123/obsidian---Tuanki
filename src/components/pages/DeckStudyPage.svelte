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
  import { CreateDeckModalObsidian } from "../modals/CreateDeckModalObsidian";
  import { APKGImportModalObsidian } from "../modals/APKGImportModalObsidian";
  import { ClipboardImportModalObsidian } from "../modals/ClipboardImportModalObsidian";
  import CSVImportModal from "../modals/CSVImportModal.svelte";
  import CreateQuestionBankModal from "../modals/CreateQuestionBankModal.svelte";
  import { QuestionBankAssociationModal } from "../../modals/QuestionBankAssociationModal";
  import { QuestionBankSelectorModal } from "../../modals/QuestionBankSelectorModal";
  import { VaultFolderSuggestModal } from "../../modals/VaultFolderSuggestModal";
  import { BatchTagSuggestModal, type BatchTagSuggestItem } from "../../modals/BatchTagSuggestModal";
  import type { ImportResult } from "../../domain/apkg/types";
  import { Menu, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
  import type { DeckTreeNode } from "../../services/deck/DeckHierarchyService";
  import { buildMemoryDeckMenu, type MemoryDeckMenuAction } from "../../services/deck/MemoryDeckMenu";
  import { openFileWithExistingLeaf } from "../../utils/workspace-navigation";
  
  //  导入服务就绪检查工具
  import { waitForService, safeServiceCall } from "../../utils/service-ready-check";
  import { waitForServiceReady } from "../../utils/service-ready-event";
  
  // 进度条模态窗
  import { executeBatchWithProgress } from "../../utils/progress-modal";
  
// 导入视图组件
  import KanbanView from "../deck-views/KanbanView.svelte";
  import GridCardView from "../deck-views/GridCardView.svelte";
  
  //  导入庆祝模态窗
  import CelebrationModal from "../modals/CelebrationModal.svelte";
  
  //  导入增量阅读牌组视图
  import IRDeckView from "../incremental-reading/IRDeckView.svelte";
  import { toDeckStats } from "../../services/incremental-reading/IRDeckStatsMapper";
  import { getSharedIRWorkspaceSnapshotService } from "../../services/incremental-reading/IRWorkspaceSnapshotService";
  import type { CelebrationStats } from "../../types/celebration-types";
  
// 导入无卡片提示模态窗
  import NoCardsAvailableModal from "../modals/NoCardsAvailableModal.svelte";
  
  //  导入牌组分析模态窗
  import { DeckAnalyticsModalObsidian } from "../modals/DeckAnalyticsModalObsidian";
  
// 导入学习完成逻辑辅助函数
  import { loadDeckCardsForStudy, isDeckCompleteForToday, getAdvanceStudyCards, getLearnedNewCardsCountToday } from "../../utils/study/studyCompletionHelper";
  
  //  高级功能限制
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from "../../services/premium/PremiumFeatureGuard";
  import ActivationPrompt from "../premium/ActivationPrompt.svelte";
  import { get } from 'svelte/store';
  import { getEmergentDeckService } from "../../services/deck/EmergentDeckService";
  import {
    DEFAULT_EMERGENT_RULE_GROUP,
    getActiveEmergentRuleGroup,
    getNormalizedEmergentRuleGroups,
    type EmergentRuleGroup,
  } from "../../services/deck/emergent-rule-groups";
  import type { EmergentDeckCandidate, FormalDeckBindingSummary, MemoryDeckOrganizationRuntime, MemoryDeckView } from "../../types/emergent-deck-types";
  
  //  导入国际化
  import { tr } from '../../utils/i18n';
  
  //  导入移动端组件
  import MobileDeckStudyHeader from "../study/MobileDeckStudyHeader.svelte";
  import { Platform } from 'obsidian';
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

  interface MemoryDeckActionRequestDetail {
    action: MemoryDeckMenuAction;
    deckId: string;
  }

  let { dataStorage, plugin }: Props = $props();
  let t = $derived($tr);

  function getIRWorkspaceSnapshotService() {
    return getSharedIRWorkspaceSnapshotService(plugin.app);
  }

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
    learnedCards: number;
    nextDueTime?: string;
    todayNewCards?: number;
    todayNewLimit?: number;
  } | undefined>(undefined);
  let noCardsCurrentDeckId = $state<string>('');

  // 牌组分析模态窗状态
  let deckAnalyticsModalInstance: DeckAnalyticsModalObsidian | null = null;
  let createDeckModalInstance: CreateDeckModalObsidian | null = null;
  let editDeckModalInstance: CreateDeckModalObsidian | null = null;
  let apkgImportModalInstance: APKGImportModalObsidian | null = null;
  let clipboardImportModalInstance: ClipboardImportModalObsidian | null = null;
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
  let expandedDeckIds = $state<Set<string>>(new Set());
  let deckStats = $state<Record<string, DeckStats>>({});
  let studySessions = $state<StudySession[]>([]);
  
  // 考试题组和增量阅读的牌组树（用于看板视图）
  let qbDeckTree = $state<DeckTreeNode[]>([]);
  let qbDeckStats = $state<Record<string, DeckStats>>({});
  let irDeckTree = $state<DeckTreeNode[]>([]);
  let irDeckStats = $state<Record<string, DeckStats>>({});
  
  type ActiveDeckView = 'kanban' | 'grid';
  type ActiveDeckFilter = 'memory' | 'question-bank' | 'incremental-reading';
  type DeckFilterInput = ActiveDeckFilter | 'reading' | 'parent' | 'child' | 'all';

  function parseStoredDeckFilter(value: string | null): ActiveDeckFilter {
    if (value === 'question-bank' || value === 'incremental-reading') {
      return value;
    }

    return 'memory';
  }

  // 视图状态，从持久化存储加载，默认使用网格卡片视图
  function normalizeDeckStudyView(value: string | null | undefined): ActiveDeckView {
    return value === 'kanban' ? 'kanban' : 'grid';
  }

  function getInitialDeckStudyView(): ActiveDeckView {
    return normalizeDeckStudyView(plugin.getCachedDeckViewPreference());
  }

  let currentView = $state<ActiveDeckView>(getInitialDeckStudyView());
  
  // 牌组模式筛选状态
  // 只保留当前仍可用的筛选值；旧筛选值在读取阶段统一映射到 memory
  let selectedFilter = $state<ActiveDeckFilter>((() => {
    try {
      return parseStoredDeckFilter(vaultStorage.getItem('weave-deck-mode-filter'));
    } catch {}
    return 'memory';
  })());
  
  //  高级功能守卫
  const premiumGuard = PremiumFeatureGuard.getInstance();
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
    });
  }

  function getPremiumEntryTitle(baseTitle: string, featureId: string): string {
    return premiumGuard.canUseFeature(featureId) ? baseTitle : `${baseTitle} (高级)`;
  }

  function isAPKGImportEnabled(): boolean {
    return plugin.settings.navigationVisibility?.apkgImport !== false;
  }

  function isCSVImportEnabled(): boolean {
    return plugin.settings.navigationVisibility?.csvImport !== false;
  }

  function isClipboardImportEnabled(): boolean {
    return plugin.settings.navigationVisibility?.clipboardImport !== false;
  }

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
      groups.map((group) => [
        group.id,
        [
          ...(group.excludedTags.length > 0 ? ["excludedTags"] : []),
          ...(group.sourceFolders.length > 0 ? ["sourceFolders"] : []),
          ...(group.createdAfter || group.createdBefore ? ["createdAt"] : []),
          ...(group.priorityMin !== null || group.priorityMax !== null ? ["priority"] : []),
        ],
      ])
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
    return emergentChildPopupOpenCount > 0 || Date.now() < emergentChildPopupCloseGuardUntil;
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

  function getActiveEmergentRuleGroupDraft(): EmergentRuleGroup {
    return (
      emergentRuleGroupDrafts.find((group) => group.id === emergentRuleGroupDraftActiveId) ||
      emergentRuleGroupDrafts[0] ||
      DEFAULT_EMERGENT_RULE_GROUP
    );
  }

  function normalizeDraftStringList(raw: string): string[] {
    return raw
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.replace(/^#/, ""))
      .filter((item, index, array) => array.indexOf(item) === index);
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

  function collectAvailableVaultTags(): string[] {
    const metadataCacheAny = plugin.app.metadataCache as typeof plugin.app.metadataCache & {
      getTags?: () => Record<string, number>;
    };
    const tagsFromApi = typeof metadataCacheAny.getTags === "function" ? metadataCacheAny.getTags() : null;

    if (tagsFromApi && typeof tagsFromApi === "object") {
      return Object.keys(tagsFromApi)
        .map((tag) => String(tag || "").replace(/^#/, "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "zh-CN"));
    }

    const tagSet = new Set<string>();
    plugin.app.vault.getMarkdownFiles().forEach((file) => {
      const cache = plugin.app.metadataCache.getFileCache(file);
      const frontmatterTags = cache?.frontmatter?.tags;

      if (Array.isArray(frontmatterTags)) {
        frontmatterTags
          .map((tag) => String(tag || "").replace(/^#/, "").trim())
          .filter(Boolean)
          .forEach((tag) => tagSet.add(tag));
      } else if (typeof frontmatterTags === "string") {
        normalizeDraftStringList(frontmatterTags).forEach((tag) => tagSet.add(tag));
      }

      cache?.tags?.forEach((tagRef) => {
        const normalizedTag = String(tagRef.tag || "").replace(/^#/, "").trim();
        if (normalizedTag) {
          tagSet.add(normalizedTag);
        }
      });
    });

    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function updateEmergentRuleGroupDraftName(groupId: string, name: string): void {
    emergentRuleGroupDrafts = emergentRuleGroupDrafts.map((group) =>
      group.id === groupId ? { ...group, name: name.trim() || group.name } : group
    );
  }

  function updateEmergentRuleGroupDraftThreshold(groupId: string, value: string): void {
    const parsed = Number(value);
    emergentRuleGroupDrafts = emergentRuleGroupDrafts.map((group) =>
      group.id === groupId
        ? {
            ...group,
            minCandidateCardCount:
              Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : 1,
          }
        : group
    );
  }

  function createEmergentRuleGroupDraft(): void {
    const nextIndex = emergentRuleGroupDrafts.length + 1;
    const newGroup: EmergentRuleGroup = {
      id: `rule-group-${Date.now()}`,
      name: `规则组 ${nextIndex}`,
      minCandidateCardCount:
        emergentRuleGroupDrafts[emergentRuleGroupDrafts.length - 1]?.minCandidateCardCount ||
        DEFAULT_EMERGENT_RULE_GROUP.minCandidateCardCount,
      requiredTags: [],
      excludedTags: [],
      sourceFolders: [],
      priorityMin: null,
      priorityMax: null,
      createdAfter: null,
      createdBefore: null,
    };
    emergentRuleGroupDrafts = [...emergentRuleGroupDrafts, newGroup];
    emergentRuleGroupDraftActiveId = newGroup.id;
    emergentRuleGroupVisibleConditions = {
      ...emergentRuleGroupVisibleConditions,
      [newGroup.id]: [],
    };
  }

  function selectEmergentRuleGroupDraft(groupId: string): void {
    emergentRuleGroupDraftActiveId = groupId;
  }

  function getCurrentEmergentRuleGroupDraft(): EmergentRuleGroup {
    return (
      emergentRuleGroupDrafts.find((group) => group.id === emergentRuleGroupDraftActiveId) ||
      emergentRuleGroupDrafts[0] ||
      DEFAULT_EMERGENT_RULE_GROUP
    );
  }

  function appendEmergentRuleGroupTagDraft(
    groupId: string,
    field: "requiredTags" | "excludedTags",
    tag: string
  ): void {
    const normalizedTag = String(tag || "").replace(/^#/, "").trim();
    if (!normalizedTag) return;

    emergentRuleGroupDrafts = emergentRuleGroupDrafts.map((group) => {
      if (group.id !== groupId) return group;
      const currentTags = group[field] || [];
      if (currentTags.includes(normalizedTag)) return group;
      return {
        ...group,
        [field]: [...currentTags, normalizedTag],
      };
    });
  }

  function removeEmergentRuleGroupTagDraft(
    groupId: string,
    field: "requiredTags" | "excludedTags",
    tag: string
  ): void {
    emergentRuleGroupDrafts = emergentRuleGroupDrafts.map((group) =>
      group.id === groupId
        ? {
            ...group,
            [field]: (group[field] || []).filter((item) => item !== tag),
          }
        : group
    );
  }

  type EmergentRuleConditionKey = "requiredTags" | "excludedTags" | "sourceFolders" | "createdAt" | "priority";

  function getVisibleEmergentRuleConditions(groupId: string): EmergentRuleConditionKey[] {
    const group = emergentRuleGroupDrafts.find((item) => item.id === groupId);
    if (!group) return [];

    const visible = new Set<EmergentRuleConditionKey>(
      (emergentRuleGroupVisibleConditions[groupId] || []) as EmergentRuleConditionKey[]
    );

    if (group.excludedTags.length > 0) visible.add("excludedTags");
    if (group.sourceFolders.length > 0) visible.add("sourceFolders");
    if (group.createdAfter || group.createdBefore) visible.add("createdAt");
    if (group.priorityMin !== null || group.priorityMax !== null) visible.add("priority");

    return Array.from(visible);
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
    const sourceGroup = emergentRuleGroupDrafts.find((group) => group.id === groupId);
    if (!sourceGroup) return;

    const copyGroup: EmergentRuleGroup = {
      ...sourceGroup,
      id: `rule-group-${Date.now()}`,
      name: `${sourceGroup.name || "规则组"} 副本`,
      requiredTags: [...sourceGroup.requiredTags],
      excludedTags: [...sourceGroup.excludedTags],
      sourceFolders: [...sourceGroup.sourceFolders],
    };

    emergentRuleGroupDrafts = [...emergentRuleGroupDrafts, copyGroup];
    emergentRuleGroupDraftActiveId = copyGroup.id;
    emergentRuleGroupVisibleConditions = {
      ...emergentRuleGroupVisibleConditions,
      [copyGroup.id]: [...getVisibleEmergentRuleConditions(groupId)],
    };
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
    const nextVisible = new Set<EmergentRuleConditionKey>(
      (emergentRuleGroupVisibleConditions[groupId] || []) as EmergentRuleConditionKey[]
    );
    nextVisible.add(conditionKey);
    emergentRuleGroupVisibleConditions = {
      ...emergentRuleGroupVisibleConditions,
      [groupId]: Array.from(nextVisible),
    };
  }

  function hideEmergentRuleCondition(groupId: string, conditionKey: EmergentRuleConditionKey): void {
    const nextVisible = new Set<EmergentRuleConditionKey>(
      (emergentRuleGroupVisibleConditions[groupId] || []) as EmergentRuleConditionKey[]
    );
    nextVisible.delete(conditionKey);
    emergentRuleGroupVisibleConditions = {
      ...emergentRuleGroupVisibleConditions,
      [groupId]: Array.from(nextVisible),
    };
  }

  function clearEmergentRuleCondition(groupId: string, conditionKey: EmergentRuleConditionKey): void {
    emergentRuleGroupDrafts = emergentRuleGroupDrafts.map((group) => {
      if (group.id !== groupId) return group;

      if (conditionKey === "requiredTags") {
        return { ...group, requiredTags: [] };
      }

      if (conditionKey === "excludedTags") {
        return { ...group, excludedTags: [] };
      }

      if (conditionKey === "sourceFolders") {
        return { ...group, sourceFolders: [] };
      }

      if (conditionKey === "createdAt") {
        return { ...group, createdAfter: null, createdBefore: null };
      }

      return { ...group, priorityMin: null, priorityMax: null };
    });

    if (conditionKey === "requiredTags") {
      return;
    }

    hideEmergentRuleCondition(groupId, conditionKey);
  }

  function showEmergentRuleConditionMenu(event: MouseEvent, groupId: string): void {
    const visibleConditions = new Set(getVisibleEmergentRuleConditions(groupId));
    const menu = new Menu();
    let hasItem = false;

    ([
      { key: "excludedTags", title: "排除标签", icon: "minus-circle" },
      { key: "sourceFolders", title: "来源文件夹", icon: "folder-open" },
      { key: "createdAt", title: "创建时间", icon: "calendar" },
      { key: "priority", title: "优先级", icon: "list-ordered" },
    ] as const).forEach((condition) => {
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

    const existingTags = new Set(currentGroup[field] || []);
    const items: BatchTagSuggestItem[] = collectAvailableVaultTags()
      .filter((tag) => !existingTags.has(tag))
      .map((tag) => ({
        tag,
        label: tag,
        icon: "tag",
      }));

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
    const nextValue = String(value || "").trim() || null;
    emergentRuleGroupDrafts = emergentRuleGroupDrafts.map((group) =>
      group.id === groupId ? { ...group, [field]: nextValue } : group
    );
  }

  function updateEmergentRuleGroupPriorityDraft(
    groupId: string,
    field: "priorityMin" | "priorityMax",
    value: string
  ): void {
    const trimmed = String(value || "").trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    emergentRuleGroupDrafts = emergentRuleGroupDrafts.map((group) =>
      group.id === groupId
        ? {
            ...group,
            [field]: Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed as number)) : null,
          }
        : group
    );
  }

  async function addEmergentRuleGroupSourceFolderDraft(groupId: string): Promise<void> {
    const picker = new VaultFolderSuggestModal(plugin.app, {
      placeholder: "选择要观察的来源文件夹",
    });
    const selectedFolder = await picker.openAndSelect();
    if (!selectedFolder) return;

    const normalizedFolder = selectedFolder === "/" ? "/" : normalizePath(selectedFolder);
    emergentRuleGroupDrafts = emergentRuleGroupDrafts.map((group) => {
      if (group.id !== groupId) return group;
      if (group.sourceFolders.includes(normalizedFolder)) return group;
      return {
        ...group,
        sourceFolders: [...group.sourceFolders, normalizedFolder],
      };
    });
  }

  function removeEmergentRuleGroupSourceFolderDraft(groupId: string, folderPath: string): void {
    emergentRuleGroupDrafts = emergentRuleGroupDrafts.map((group) =>
      group.id === groupId
        ? {
            ...group,
            sourceFolders: group.sourceFolders.filter((folder) => folder !== folderPath),
          }
        : group
    );
  }

  function removeEmergentRuleGroupDraftV2(groupId: string): void {
    if (emergentRuleGroupDrafts.length <= 1) {
      new Notice("至少需要保留一个涌现筛选组", 3000);
      return;
    }

    const nextDrafts = emergentRuleGroupDrafts.filter((group) => group.id !== groupId);
    emergentRuleGroupDrafts = nextDrafts;
    if (emergentRuleGroupDraftActiveId === groupId) {
      emergentRuleGroupDraftActiveId = nextDrafts[0]?.id || DEFAULT_EMERGENT_RULE_GROUP.id;
    }
  }

  async function applyEmergentRuleGroupDraftsV2(): Promise<void> {
    const nextGroups = emergentRuleGroupDrafts.map((group, index) => ({
      ...group,
      name: String(group.name || "").trim() || `规则组 ${index + 1}`,
      minCandidateCardCount: Math.max(1, Math.floor(group.minCandidateCardCount || 1)),
      requiredTags: [...(group.requiredTags || [])],
      excludedTags: [...(group.excludedTags || [])],
      sourceFolders: [...(group.sourceFolders || [])],
      priorityMin: group.priorityMin ?? null,
      priorityMax:
        group.priorityMax !== null && group.priorityMin !== null
          ? Math.max(group.priorityMin, group.priorityMax)
          : group.priorityMax ?? null,
      createdAfter: group.createdAfter || null,
      createdBefore: group.createdBefore || null,
    }));
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
    if (!premiumGuard.canUseFeature(featureId)) {
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

  function handleClipboardImport(): void {
    if (!isClipboardImportEnabled()) {
      return;
    }

    openPremiumFeature(PREMIUM_FEATURES.CLIPBOARD_IMPORT, () => {
      showClipboardImportModalWithObsidianAPI();
    });
  }

  function normalizeDeckFilter(filter: DeckFilterInput): ActiveDeckFilter {
    if (filter === 'question-bank' && premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.QUESTION_BANK)) {
      return 'memory';
    }

    if (filter === 'incremental-reading' && premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.INCREMENTAL_READING)) {
      return 'memory';
    }

    if (filter === 'question-bank' || filter === 'incremental-reading') {
      return filter;
    }

    return 'memory';
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
  
// 从 Obsidian 持久化存储加载视图偏好
  onMount(() => {
    //  检测移动端
    const unregisterEmergentRuleGroupPopoverBridge = registerEmergentRuleGroupPopoverBridge();
    isMobile = Platform.isMobile || document.body.classList.contains('is-mobile');
    
// 订阅数据同步服务（在同步作用域中定义，以便清理函数可以访问）
    let unsubscribeDecks: (() => void) | undefined;
    let unsubscribeSessions: (() => void) | undefined;
    let unsubscribeCards: (() => void) | undefined;
    
    // 异步初始化（不阻塞清理函数的返回）
    (async () => {
      // selectedFilter 已在状态初始化时同步从 localStorage 恢复，此处无需重复读取
      
// 使用插件本地 state/local-storage.json 加载视图偏好
      try {
        const savedView = await plugin.loadDeckViewPreference();
        
        // 验证并加载保存的视图
        if (savedView && ['kanban', 'grid'].includes(savedView)) {
          currentView = normalizeDeckStudyView(savedView);
          window.dispatchEvent(new CustomEvent('Weave:deck-view-change', { detail: currentView }));
        } else if (savedView === 'classic' || savedView === 'timeline' || savedView === 'card') {
          // 已移除的旧视图统一回退到网格卡片视图
          currentView = normalizeDeckStudyView(null);
          window.dispatchEvent(new CustomEvent('Weave:deck-view-change', { detail: currentView }));
        } else {
          currentView = normalizeDeckStudyView(null);
          window.dispatchEvent(new CustomEvent('Weave:deck-view-change', { detail: currentView }));
        }
      } catch (error) {
        logger.warn('加载视图偏好失败:', error);
        currentView = normalizeDeckStudyView(null);
        window.dispatchEvent(new CustomEvent('Weave:deck-view-change', { detail: currentView }));
      }
      
// 订阅数据同步服务
      if (plugin.dataSyncService) {
        // 订阅数据变更通知
        
        // 订阅牌组变更
        unsubscribeDecks = plugin.dataSyncService.subscribe(
          'decks',
          async (event: DataChangeEvent) => {
            // 牌组数据变更
            await refreshData(false);
          },
          { debounce: 300 }
        );
        
        // 订阅学习会话变更
        unsubscribeSessions = plugin.dataSyncService.subscribe(
          'sessions',
          async (event: DataChangeEvent) => {
            // 学习会话变更
            await refreshData(false);
          },
          { debounce: 300 }
        );
        
        // 订阅卡片变更（影响统计）
        unsubscribeCards = plugin.dataSyncService.subscribe(
          'cards',
          async (event: DataChangeEvent) => {
            // 卡片数据变更
            await refreshData(false);
          },
          { debounce: 500 }
        );
        
        // 数据同步服务订阅成功
      }
    })(); // 结束异步IIFE
    
    // 3. 监听workspace事件（备用刷新机制）
    const handleCardCreated = async () => {
      // 卡片创建事件
      await refreshData(false);
    };
    
    const handleCardUpdated = async () => {
      logger.debug('[DeckStudyPage] 接收到卡片更新事件，刷新数据');
      await refreshData(false);
    };
    
    (plugin.app.workspace as any).on("Weave:card-created", handleCardCreated);
    (plugin.app.workspace as any).on("Weave:card-updated", handleCardUpdated);
    
    // 4. 从localStorage加载展开状态
    loadExpandedState();
    
    // 5. 立即刷新数据
    refreshData();
    
// 监听全局视图切换事件（移到 onMount，确保只注册一次）
    const handleShowViewMenu = (e: CustomEvent) => {
      showViewSwitcher(e.detail.event);
    };
    window.addEventListener('show-view-menu', handleShowViewMenu as EventListener);
    
// 监听侧边栏筛选事件
    const handleSidebarFilterSelect = (e: CustomEvent<string>) => {
      const filter = e.detail as ActiveDeckFilter;
      handleFilterSelect(filter);
    };
    window.addEventListener('Weave:sidebar-filter-select', handleSidebarFilterSelect as EventListener);

    const handleExternalDeckMenuAction = (e: Event) => {
      const detail = (e as CustomEvent<MemoryDeckActionRequestDetail>).detail;
      if (!detail?.deckId) {
        return;
      }
      void handleMemoryDeckMenuAction(detail.action, detail.deckId);
    };
    window.addEventListener('Weave:request-memory-deck-action', handleExternalDeckMenuAction as EventListener);

    const handleMainInterfaceMenuRequest = (e: Event) => {
      const detail = (e as CustomEvent<{
        page?: string;
        event?: MouseEvent;
        source?: string;
      }>).detail;

      if (detail?.page !== 'deck-study') {
        return;
      }

      if (!(detail.event instanceof MouseEvent)) {
        return;
      }

      e.preventDefault();
      void showMobileNavMenuWithObsidianAPI(detail.event);
    };
    window.addEventListener(
      'Weave:request-main-interface-menu',
      handleMainInterfaceMenuRequest as EventListener
    );

    const handleDeckStudyToolbarAction = (e: Event) => {
      const detail = (e as CustomEvent<{
        action?: string;
        anchor?: HTMLElement | null;
      }>).detail;

      if (detail?.action === 'open-emergent-rule-groups') {
        showEmergentRuleGroupMenu(detail.anchor || null);
      }
    };
    window.addEventListener(
      'Weave:deck-study-toolbar-action',
      handleDeckStudyToolbarAction as EventListener
    );
    
// 初始化时通知父组件当前筛选状态
    window.dispatchEvent(new CustomEvent('Weave:deck-filter-change', { detail: selectedFilter }));

    // 清理函数
    return () => {
      if (unsubscribeDecks) unsubscribeDecks();
      if (unsubscribeSessions) unsubscribeSessions();
      if (unsubscribeCards) unsubscribeCards();
      (plugin.app.workspace as any).off("Weave:card-created", handleCardCreated);
      (plugin.app.workspace as any).off("Weave:card-updated", handleCardUpdated);
      window.removeEventListener('show-view-menu', handleShowViewMenu as EventListener);
      window.removeEventListener('Weave:sidebar-filter-select', handleSidebarFilterSelect as EventListener);
      window.removeEventListener('Weave:request-memory-deck-action', handleExternalDeckMenuAction as EventListener);
      window.removeEventListener(
        'Weave:request-main-interface-menu',
        handleMainInterfaceMenuRequest as EventListener
      );
      window.removeEventListener(
        'Weave:deck-study-toolbar-action',
        handleDeckStudyToolbarAction as EventListener
      );
      unregisterEmergentRuleGroupPopoverBridge();
    };
  });

  onDestroy(() => {
    deckAnalyticsModalInstance?.close();
    deckAnalyticsModalInstance = null;
    createDeckModalInstance?.close();
    createDeckModalInstance = null;
    editDeckModalInstance?.close();
    editDeckModalInstance = null;
    apkgImportModalInstance?.close();
    apkgImportModalInstance = null;
    clipboardImportModalInstance?.close();
    clipboardImportModalInstance = null;
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
    const menu = new Menu();
    
    //  只保留网格卡片和看板视图
    const views = [
      { id: 'grid', label: t('deckStudyPage.views.grid'), icon: 'grid', desc: t('deckStudyPage.views.gridDesc') },
      { id: 'kanban', label: t('deckStudyPage.views.kanban'), icon: 'columns', desc: t('deckStudyPage.views.kanbanDesc') }
    ] as const;
    
    views.forEach(view => {
      menu.addItem((item) => {
        item
          .setTitle(view.label)
          .setIcon(view.icon)
          .setChecked(currentView === view.id)
          .onClick(async () => {
            currentView = view.id;
            // 保存偏好到插件本地 state/
            try {
              await plugin.saveDeckViewPreference(view.id);
            } catch (error) {
              logger.warn('保存视图偏好失败:', error);
            }
            window.dispatchEvent(new CustomEvent('Weave:deck-view-change', { detail: view.id }));
          });
      });
    });
    
    menu.showAtMouseEvent(evt);
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
    const menu = new Menu();
    
// 增量阅读模式：显示导入文件夹选项
    if (selectedFilter === 'incremental-reading') {
      menu.addItem((item) => {
        item
          .setTitle(t('deckStudyPage.menu.importFolder'))
          .setIcon("folder-plus")
          .onClick(() => {
            document.dispatchEvent(new CustomEvent('ir-import-folder'));
          });
      });
      
      menu.showAtMouseEvent(event);
      return;
    }
    
    // 记忆牌组模式的菜单
    if (isAPKGImportEnabled()) {
      menu.addItem((item) => {
        item
          .setTitle(t('deckStudyPage.menu.importAPKG'))
          .setIcon("package")
          .onClick(() => { showAPKGImportModalWithObsidianAPI(); });
      });
    }
    
    if (isCSVImportEnabled() && shouldShowPremiumEntry(PREMIUM_FEATURES.CSV_IMPORT)) {
      menu.addItem((item) => {
        item
          .setTitle(getPremiumEntryTitle(t('deckStudyPage.menu.importCSV'), PREMIUM_FEATURES.CSV_IMPORT))
          .setIcon("file-text")
          .onClick(handleCSVImport);
      });
    }

    if (isClipboardImportEnabled() && shouldShowPremiumEntry(PREMIUM_FEATURES.CLIPBOARD_IMPORT)) {
      menu.addItem((item) => {
        item
          .setTitle(getPremiumEntryTitle(t('deckStudyPage.menu.importClipboard'), PREMIUM_FEATURES.CLIPBOARD_IMPORT))
          .setIcon('clipboard-paste')
          .onClick(handleClipboardImport);
      });
    }
    
    menu.addItem((item) => {
      item
        .setTitle(t('deckStudyPage.menu.exportJSON'))
        .setIcon("download")
        .setDisabled(decks.length === 0)
        .onClick(exportDeck);
    });
    
    menu.showAtMouseEvent(event);
  }

// 数据刷新
  async function refreshData(showLoading = false) {
    if (showLoading) {
      isLoading = true;
    }
    
    try {
      // getCards() 依赖 cardFileService，这里需要等待全部核心服务就绪。
      await waitForServiceReady('allCoreServices', 15000);
      
      decks = await dataStorage.getDecks();
      const allStudySessionsPromise = dataStorage.getStudySessions().catch((error) => {
        logger.error('[DeckStudyPage] 加载学习历史失败:', error);
        return [] as StudySession[];
      });

      await Promise.all([
        (async () => {
          const allStudySessions = await allStudySessionsPromise;
          await calculateDeckStats(allStudySessions);
        })(),
        loadDeckTree(),
        (async () => {
          const allStudySessions = await allStudySessionsPromise;
          await loadStudySessions(allStudySessions);
        })()
      ]);
    } finally {
      if (showLoading) {
        isLoading = false;
      }
    }
  }
  
  // 当切换到kanban视图或切换模式时，加载对应的牌组树数据
  $effect(() => {
    const view = currentView;
    const filter = selectedFilter;
    if (view === 'kanban') {
      if (filter === 'question-bank') {
        loadQBDeckTree();
      } else if (filter === 'incremental-reading') {
        loadIRDeckTree();
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

  // 加载增量阅读牌组树（用于看板视图）
  async function loadIRDeckTree() {
    try {
      const snapshot = await getIRWorkspaceSnapshotService().getDeckOverview({
        dailyNewLimit: plugin.settings?.incrementalReading?.dailyNewLimit ?? 20,
        dailyReviewLimit: plugin.settings?.incrementalReading?.dailyReviewLimit ?? 50,
        learnAheadDays: plugin.settings?.incrementalReading?.learnAheadDays ?? 3,
        dailyTimeBudgetMinutes: plugin.settings?.incrementalReading?.dailyTimeBudgetMinutes ?? 30,
        loadRateDays: 3
      });
      const activeIRDecks = snapshot.decks.filter(d => !d.archivedAt);
      
      // 为每个IR牌组获取真实统计数据
      const stats: Record<string, DeckStats> = {};
      const treeNodes: DeckTreeNode[] = [];
      
      for (const irDeck of activeIRDecks) {
        // 使用 IRStorageService.getDeckStats 获取真实统计
        const deckKey = irDeck.id || irDeck.path || '';
        const nodeDeckId = deckKey || irDeck.name;
        const deckStats = toDeckStats(snapshot.deckStats[deckKey]);
        
        
        // 映射IR统计到DeckStats格式，与IRDeckCard显示一致:
        // newCards → 未读(dueToday), learningCards → 待读(dueWithinDays-dueToday), reviewCards → 提问(questionCount)
        
        
        const node: DeckTreeNode = {
          deck: {
            id: nodeDeckId,
            name: irDeck.name,
            description: irDeck.description || '',
            category: '',
            path: irDeck.path || irDeck.name,
            level: 0,
            order: 0,
            inheritSettings: false,
            settings: {} as any,
            includeSubdecks: false,
            created: irDeck.createdAt,
            modified: irDeck.updatedAt,
            tags: irDeck.tags || [],
            stats: deckStats,
            metadata: { isIRDeck: true, color: irDeck.color, icon: irDeck.icon }
          } as Deck,
          children: []
        };
        
        treeNodes.push(node);
        stats[nodeDeckId] = deckStats;
      }
      
      irDeckTree = treeNodes;
      irDeckStats = stats;
    } catch (e) {
      logger.warn('[DeckStudyPage] loadIRDeckTree failed:', e);
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
    if (filter === 'question-bank' && premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.QUESTION_BANK)) {
      promptFeatureId = PREMIUM_FEATURES.QUESTION_BANK;
      showActivationPrompt = true;
      return;
    }

    if (filter === 'incremental-reading' && premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.INCREMENTAL_READING)) {
      promptFeatureId = PREMIUM_FEATURES.INCREMENTAL_READING;
      showActivationPrompt = true;
      return;
    }

    selectedFilter = normalizeDeckFilter(filter);
    vaultStorage.setItem('weave-deck-mode-filter', selectedFilter);
    logger.debug('[DeckStudyPage] 切换模式筛选器:', selectedFilter);
    
    // 通知父组件状态变化（用于侧边栏导航同步）
    window.dispatchEvent(new CustomEvent('Weave:deck-filter-change', { detail: selectedFilter }));
  }
  
  //  移动端菜单按钮点击处理 - 使用 Obsidian Menu API
  function handleMobileMenuClick(evt: MouseEvent) {
    showMobileNavMenuWithObsidianAPI(evt);
  }
  
  //  使用 Obsidian 原生 Menu API 显示移动端导航菜单
  async function showMobileNavMenuWithObsidianAPI(evt: MouseEvent) {
    const menu = new Menu();
    
    // 功能切换分组
    menu.addItem((item) => {
      item
        .setTitle(t('navigation.deckStudy'))
        .setIcon('graduation-cap')
        .setChecked(true)
        .onClick(() => {
          // 已在牌组学习界面，无需操作
        });
    });
    
    menu.addItem((item) => {
      item
        .setTitle(t('navigation.cardManagement'))
        .setIcon('list')
        .onClick(() => {
          window.dispatchEvent(new CustomEvent('Weave:navigate', { 
            detail: 'weave-card-management' 
          }));
        });
    });
    
    menu.addItem((item) => {
      item
        .setTitle(t('navigation.aiAssistant'))
        .setIcon('bot')
        .onClick(() => {
          window.dispatchEvent(new CustomEvent('Weave:navigate', { 
            detail: 'ai-assistant' 
          }));
        });
    });
    
    menu.addSeparator();
    
    // 视图切换分组
    menu.addItem((item) => {
      item
        .setTitle(t('navigation.switchView'))
        .setIcon('layout-grid')
        .onClick(() => {
          const viewEvent = new MouseEvent('click', { bubbles: true, clientX: evt.clientX, clientY: evt.clientY });
          showViewSwitcher(viewEvent);
        });
    });
    
    menu.addItem((item) => {
      item
        .setTitle(getCreateEntryTitle())
        .setIcon('folder-plus')
        .onClick(() => {
          void handleCreateDeckForCurrentFilter();
        });
    });

    if (currentView === 'kanban') {
      menu.addItem((item) => {
        item
          .setTitle(t('study.mobileHeader.kanbanColumnSettings'))
          .setIcon('sliders')
          .onClick(() => {
            window.dispatchEvent(new CustomEvent('Weave:open-deck-kanban-menu', {
              detail: { x: evt.clientX, y: evt.clientY, filter: selectedFilter }
            }));
          });
      });
    }
    
    menu.addSeparator();

    // 导入功能
    if (isAPKGImportEnabled()) {
      menu.addItem((item) => {
        item
          .setTitle(t('deckStudyPage.menu.importAPKG'))
          .setIcon('package')
          .onClick(() => { showAPKGImportModalWithObsidianAPI(); });
      });
    }
    
    if (isCSVImportEnabled() && shouldShowPremiumEntry(PREMIUM_FEATURES.CSV_IMPORT)) {
      menu.addItem((item) => {
        item
          .setTitle(getPremiumEntryTitle(t('deckStudyPage.menu.importCSV'), PREMIUM_FEATURES.CSV_IMPORT))
          .setIcon('file-text')
          .onClick(handleCSVImport);
      });
    }

    if (isClipboardImportEnabled() && shouldShowPremiumEntry(PREMIUM_FEATURES.CLIPBOARD_IMPORT)) {
      menu.addItem((item) => {
        item
          .setTitle(getPremiumEntryTitle(t('deckStudyPage.menu.importClipboard'), PREMIUM_FEATURES.CLIPBOARD_IMPORT))
          .setIcon('clipboard-paste')
          .onClick(handleClipboardImport);
      });
    }
    
    menu.addSeparator();
    
    // 更多操作子菜单
    menu.addItem((item) => {
      const submenu = (item as any).setSubmenu();
      item.setTitle(t('deckStudyPage.menu.management')).setIcon('more-horizontal');
      
      submenu.addItem((subItem: any) => {
        subItem
          .setTitle(t('deckStudyPage.menu.restoreTutorialDeck'))
          .setIcon('book-open')
          .onClick(async () => {
            const success = await dataStorage.restoreGuideDeck();
            if (success) {
              await refreshData();
              plugin.app.workspace.trigger('Weave:data-changed');
              new Notice(t('deckStudyPage.notices.tutorialRestored'));
            } else {
              new Notice(t('deckStudyPage.notices.tutorialRestoreFailed'));
            }
          });
      });
    });
    
    menu.showAtMouseEvent(evt);
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
      
      // 首次加载时从 localStorage 恢复展开状态
      const hasStoredState = vaultStorage.getItem('weave-deck-expanded-state');
      
      if (hasStoredState) {
        // 恢复保存的展开状态
        loadExpandedState();
      } else if (expandedDeckIds.size === 0) {
        // 首次使用，默认展开根级牌组
        deckTree.forEach(node => {
          expandedDeckIds.add(node.deck.id);
        });
        expandedDeckIds = new Set(expandedDeckIds);
        saveExpandedState();
      }
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
    emergentRuntime = runtime;
    emergentCandidates = runtime.candidates.filter((candidate) => candidate.status !== 'ignored');
    emergentDeckViews = runtime.emergentDeckViews;
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

  async function calculateDeckStats(allStudySessions: StudySession[] = []) {
    const stats: Record<string, DeckStats> = {};
    
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
    
    logger.debug(`[calculateDeckStats] 🚀 开始计算统计 (v3.0 UnifiedStudyProvider), 牌组数: ${decks.length}, 卡片数: ${allCardsForStats.length}`);
    
    // 为每个牌组获取统一的学习数据
    for (const deck of decks) {
      try {
        const { stats: deckStat, queue, debug } = await unifiedProvider.getStudyDataFromDeckCards(
          deck.id,
          deckCardsMap.get(deck.id) || [],
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

    emergentDeckStats = nextEmergentDeckStats;

    deckStats = stats;
    
    // 防抖持久化统计数据到 decks.json，确保云同步后其他设备能看到最新统计
    debouncedPersistDeckStats(stats);
    
    logger.info('[DeckStudyPage] ✅ 统计完成 (v3.0 UnifiedStudyProvider):', {
      newCardsPerDay,
      filterSiblings,
      deckCount: decks.length,
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

  // 处理APKG导入完成
  async function handleAPKGImportComplete(result: ImportResult) {
    if (result.success) {
      const message = t('deckStudyPage.import.success', { deckName: result.deckName || t('common.unknown'), count: String(result.stats.importedCards) });
      const N = Notice;
      if (typeof N === 'function') {
        new N(`✅ ${message}`, 5000);
      }

      // 刷新牌组列表
      await refreshData();
      
      // 通知全局侧边栏刷新
      plugin.app.workspace.trigger('Weave:data-changed');
    } else {
      const errorMessage = result.errors && result.errors.length > 0
        ? result.errors[0].message
        : t('notifications.error.importFailed');
      const N = Notice;
      if (typeof N === 'function') {
        new N(`❌ ${errorMessage}`, 8000);
      }
    }
  }

  function showCreateDeckModalWithObsidianAPI() {
    createDeckModalInstance?.close();
    createDeckModalInstance = new CreateDeckModalObsidian(plugin.app, {
      plugin,
      dataStorage,
      mode: 'create',
      onCreated: async () => {
        await refreshData();
        plugin.app.workspace.trigger('Weave:data-changed');
      },
      onClose: () => {
        createDeckModalInstance = null;
      }
    });
    createDeckModalInstance.open();
  }

  function getCreateEntryTitle(): string {
    if (selectedFilter === 'incremental-reading') {
      return '新增增量阅读专题牌组';
    }

    if (selectedFilter === 'question-bank') {
      return '创建考试题组';
    }

    return '创建记忆牌组';
  }

  async function showCreateIRDeckPrompt(): Promise<void> {
    try {
      const { IRStorageService } = await import('../../services/incremental-reading/IRStorageService');
      const { IRDeckManager } = await import('../../services/incremental-reading/IRDeckManager');

      const storageService = new IRStorageService(plugin.app);
      await storageService.initialize();

      const deckManager = new IRDeckManager(
        plugin.app,
        storageService,
        plugin.settings?.incrementalReading?.importFolder
      );

      const modal = new Modal(plugin.app);
      modal.titleEl.setText('新增增量阅读专题牌组');

      let newName = '';
      let newTag = '';

      new Setting(modal.contentEl)
        .setName('名称')
        .addText((text: any) => {
          text.setPlaceholder('例如：世界史精读专题');
          text.onChange((value: string) => {
            newName = value;
          });
          text.inputEl.style.width = '100%';
          window.setTimeout(() => text.inputEl.focus(), 0);
        });

      new Setting(modal.contentEl)
        .setName('牌组标签(单选)')
        .setDesc('用于看板按标签分组，可留空');

      const tagContainer = modal.contentEl.createDiv({ cls: 'weave-tag-input-container' });
      const tagDisplay = tagContainer.createDiv({ cls: 'weave-tag-display' });

      function renderTag() {
        tagDisplay.empty();
        if (newTag) {
          const chip = tagDisplay.createSpan({ cls: 'weave-tag-chip', text: newTag });
          chip.createSpan({ cls: 'weave-tag-remove', text: '\u00d7' }).onclick = () => {
            newTag = '';
            renderTag();
          };
        }
      }

      renderTag();

      const tagInput = tagContainer.createEl('input', {
        type: 'text',
        placeholder: '输入标签后按回车添加'
      });
      tagInput.style.width = '100%';
      tagInput.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' && tagInput.value.trim()) {
          event.preventDefault();
          newTag = tagInput.value.trim();
          tagInput.value = '';
          renderTag();
        }
      });

      const btnContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
      btnContainer.style.display = 'flex';
      btnContainer.style.justifyContent = 'flex-end';
      btnContainer.style.gap = '8px';
      btnContainer.style.marginTop = '16px';

      btnContainer.createEl('button', { text: '取消' }).onclick = () => modal.close();

      const createBtn = btnContainer.createEl('button', { text: '创建', cls: 'mod-cta' });
      createBtn.onclick = async () => {
        const deckName = newName.trim();
        if (!deckName) {
          return;
        }

        try {
          const newDeck = await deckManager.createDeck(deckName);
          newDeck.tags = newTag ? [newTag] : [];
          newDeck.updatedAt = new Date().toISOString();
          await storageService.saveDeck(newDeck);

          await loadIRDeckTree();
          window.dispatchEvent(new CustomEvent('Weave:ir-data-updated'));
          plugin.app.workspace.trigger('Weave:data-changed');
          new Notice(`已创建增量阅读专题牌组：${deckName}`);
          modal.close();
        } catch (error) {
          logger.error('[DeckStudyPage] 创建增量阅读专题牌组失败:', error);
          new Notice('创建增量阅读专题牌组失败');
        }
      };

      modal.open();
    } catch (error) {
      logger.error('[DeckStudyPage] 打开增量阅读专题牌组创建弹窗失败:', error);
      new Notice('打开增量阅读专题牌组创建弹窗失败');
    }
  }

  async function handleCreateDeckForCurrentFilter(): Promise<void> {
    if (selectedFilter === 'incremental-reading') {
      await showCreateIRDeckPrompt();
      return;
    }

    if (selectedFilter === 'question-bank') {
      showCreateQuestionBankModal = true;
      return;
    }

    showCreateDeckModalWithObsidianAPI();
  }

  function showAPKGImportModalWithObsidianAPI() {
    apkgImportModalInstance?.close();
    apkgImportModalInstance = new APKGImportModalObsidian(plugin.app, {
      plugin,
      dataStorage,
      wasmUrl: "https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.wasm",
      onImportComplete: handleAPKGImportComplete,
      onClose: () => {
        apkgImportModalInstance = null;
      }
    });
    apkgImportModalInstance.open();
  }

  function showClipboardImportModalWithObsidianAPI() {
    clipboardImportModalInstance?.close();
    clipboardImportModalInstance = new ClipboardImportModalObsidian(plugin.app, {
      plugin,
      dataStorage,
      onImportComplete: async () => {
        await refreshData();
        plugin.app.workspace.trigger('Weave:data-changed');
      },
      onClose: () => {
        clipboardImportModalInstance = null;
      }
    });
    clipboardImportModalInstance.open();
  }

  function showEditDeckModalWithObsidianAPI(deck: Deck) {
    editDeckModalInstance?.close();
    editDeckModalInstance = new CreateDeckModalObsidian(plugin.app, {
      plugin,
      dataStorage,
      mode: 'edit',
      initialDeck: deck,
      onUpdated: async () => {
        await refreshData();
        plugin.app.workspace.trigger('Weave:data-changed');
      },
      onClose: () => {
        editDeckModalInstance = null;
      }
    });
    editDeckModalInstance.open();
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
    if (selectedFilter === 'incremental-reading') {
      // IR 牌组统一跳转到现役侧边栏阅读流程
      try {
        const { IRStorageService: IRStorageServiceCompat } = await import('../../services/incremental-reading/IRStorageService');
        const irStorageCompat = new IRStorageServiceCompat(plugin.app);
        await irStorageCompat.initialize();
        const irDeckCompat = await irStorageCompat.getDeckById(deckId);
        const redirectDeckName = irDeckCompat?.name || t('deckStudyPage.fallback.incrementalReading');

        await plugin.redirectIncrementalReadingToSidebar({
          deckPath: deckId,
          deckName: redirectDeckName,
          closeLegacyFocusLeaves: true
        });
      } catch (error) {
        logger.error('[DeckStudyPage] IR kanban 开始阅读失败:', error);
        new Notice(t('deckStudyPage.notices.startReadingFailed'));
      }
    } else if (selectedFilter === 'question-bank') {
      // QB牌组：打开考试界面
      try {
        if (!plugin.questionBankService) {
          new Notice(t('deckStudyPage.notices.qbServiceNotInit'));
          return;
        }
        const questions = await plugin.questionBankService.getQuestionsByBank(deckId);
        const bank = await plugin.questionBankService.getBankById(deckId);
        
        if (questions.length === 0) {
          new Notice(t('deckStudyPage.notices.noQuestions'));
          return;
        }
        
        await plugin.openQuestionBankSession({
          bankId: deckId,
          bankName: bank?.name || t('deckStudyPage.fallback.unknownBank'),
          mode: 'exam'
        });
      } catch (error) {
        logger.error('[DeckStudyPage] QB kanban 开始考试失败:', error);
        new Notice(t('deckStudyPage.notices.startExamFailed'));
      }
    } else {
      // 记忆牌组：原有逻辑
      await startStudy(deckId);
    }
  }
  
  async function kanbanEditDeck(deckId: string) {
    if (selectedFilter === 'incremental-reading') {
      // IR牌组编辑：使用IRDeckView的编辑模态窗逻辑
      try {
        const { IRStorageService } = await import('../../services/incremental-reading/IRStorageService');
        const { IRChunkFileService } = await import('../../services/incremental-reading/IRChunkFileService');
        const irStorage = new IRStorageService(plugin.app);
        await irStorage.initialize();
        const deck = await irStorage.getDeckById(deckId);
        if (!deck) { new Notice(t('deckStudyPage.notices.deckNotFound')); return; }
        
        const modal = new Modal(plugin.app);
        modal.titleEl.setText(t('deckStudyPage.edit.title'));
        let newName = deck.name;
        let newTag = (deck.tags && deck.tags.length > 0) ? deck.tags[0] : '';
        
        new Setting(modal.contentEl).setName(t('deckStudyPage.edit.name')).addText((text: any) => {
          text.setValue(newName).onChange((v: string) => { newName = v; });
          text.inputEl.style.width = '100%';
        });
        new Setting(modal.contentEl).setName(t('deckStudyPage.edit.tag')).setDesc(t('deckStudyPage.edit.tagDesc'));
        const tagContainer = modal.contentEl.createDiv({ cls: 'weave-tag-input-container' });
        const tagDisplay = tagContainer.createDiv({ cls: 'weave-tag-display' });
        function renderTag() {
          tagDisplay.empty();
          if (newTag) {
            const chip = tagDisplay.createSpan({ cls: 'weave-tag-chip', text: newTag });
            chip.createSpan({ cls: 'weave-tag-remove', text: '\u00d7' }).onclick = () => { newTag = ''; renderTag(); };
          }
        }
        renderTag();
        const tagInput = tagContainer.createEl('input', { type: 'text', placeholder: t('deckStudyPage.edit.tagPlaceholder') });
        tagInput.style.width = '100%';
        tagInput.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' && tagInput.value.trim()) { e.preventDefault(); newTag = tagInput.value.trim(); tagInput.value = ''; renderTag(); }
        });
        
        const btnContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
        btnContainer.createEl('button', { text: t('common.cancel') }).onclick = () => modal.close();
        const saveBtn = btnContainer.createEl('button', { text: t('common.save'), cls: 'mod-cta' });
        saveBtn.onclick = async () => {
          if (!newName.trim()) return;
          try {
            const oldName = deck.name;
            deck.name = newName.trim();
            deck.tags = newTag ? [newTag] : [];
            deck.updatedAt = new Date().toISOString();
            await irStorage.saveDeck(deck);
            if (oldName !== deck.name) {
              try { await irStorage.migrateChunkDeckNameInYAML(oldName, deck.name); } catch (e) { logger.warn('[kanbanEditDeck] IR YAML migration failed:', e); }
              try {
                const outputRoot = plugin.settings?.incrementalReading?.importFolder;
                const chunkFileService = new IRChunkFileService(plugin.app, outputRoot);
                await chunkFileService.renameDeckIndexCard(oldName, deck.name);
              } catch (e) { logger.warn('[kanbanEditDeck] IR index card rename failed:', e); }
            }
            await loadIRDeckTree();
            window.dispatchEvent(new CustomEvent('Weave:ir-data-updated'));
            plugin.app.workspace.trigger('Weave:data-changed');
            new Notice(t('deckStudyPage.notices.deckUpdated'));
            modal.close();
          } catch (error) { logger.error('[kanbanEditDeck] IR edit failed:', error); new Notice(t('deckStudyPage.notices.editFailed')); }
        };
        modal.open();
      } catch (error) { logger.error('[kanbanEditDeck] IR编辑模态窗创建失败:', error); }
    } else if (selectedFilter === 'question-bank') {
      // QB牌组编辑
      try {
        const bank = decks.find(d => d.id === deckId) || (await dataStorage.getDeck(deckId));
        if (!bank) { new Notice(t('deckStudyPage.notices.deckNotFound')); return; }
        
        const modal = new Modal(plugin.app);
        modal.titleEl.setText(t('deckStudyPage.edit.title'));
        let newName = bank.name;
        let newTag = (bank.tags && bank.tags.length > 0) ? bank.tags[0] : '';
        
        new Setting(modal.contentEl).setName(t('deckStudyPage.edit.name')).addText((text: any) => {
          text.setValue(newName).onChange((v: string) => { newName = v; });
          text.inputEl.style.width = '100%';
        });
        new Setting(modal.contentEl).setName(t('deckStudyPage.edit.tag')).setDesc(t('deckStudyPage.edit.tagDesc'));
        const tagContainer = modal.contentEl.createDiv({ cls: 'weave-tag-input-container' });
        const tagDisplay = tagContainer.createDiv({ cls: 'weave-tag-display' });
        function renderTag() {
          tagDisplay.empty();
          if (newTag) {
            const chip = tagDisplay.createSpan({ cls: 'weave-tag-chip', text: newTag });
            chip.createSpan({ cls: 'weave-tag-remove', text: '\u00d7' }).onclick = () => { newTag = ''; renderTag(); };
          }
        }
        renderTag();
        const tagInput = tagContainer.createEl('input', { type: 'text', placeholder: t('deckStudyPage.edit.tagPlaceholder') });
        tagInput.style.width = '100%';
        tagInput.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' && tagInput.value.trim()) { e.preventDefault(); newTag = tagInput.value.trim(); tagInput.value = ''; renderTag(); }
        });
        
        const btnContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
        btnContainer.createEl('button', { text: t('common.cancel') }).onclick = () => modal.close();
        const saveBtn = btnContainer.createEl('button', { text: t('common.save'), cls: 'mod-cta' });
        saveBtn.onclick = async () => {
          if (!newName.trim()) return;
          try {
            const updated = { ...bank, name: newName.trim(), tags: newTag ? [newTag] : [], modified: new Date().toISOString() };
            const result = await dataStorage.saveDeck(updated);
            if (!result.success) {
              throw new Error(result.error || t('common.unknown'));
            }
            await loadQBDeckTree();
            plugin.app.workspace.trigger('Weave:data-changed');
            new Notice(t('deckStudyPage.notices.deckUpdated'));
            modal.close();
          } catch (error) { logger.error('[kanbanEditDeck] QB edit failed:', error); new Notice(t('deckStudyPage.notices.editFailed')); }
        };
        modal.open();
      } catch (error) { logger.error('[kanbanEditDeck] QB编辑模态窗创建失败:', error); }
    } else {
      editDeck(deckId);
    }
  }
  
  async function kanbanDeleteDeck(deckId: string) {
    if (selectedFilter === 'incremental-reading') {
      try {
        const { showObsidianConfirm } = await import('../../utils/obsidian-confirm');
        const { IRStorageService } = await import('../../services/incremental-reading/IRStorageService');
        const irStorage = new IRStorageService(plugin.app);
        await irStorage.initialize();
        const deck = await irStorage.getDeckById(deckId);
        if (!deck) { new Notice(t('deckStudyPage.notices.deckNotFound')); return; }
        const confirmed = await showObsidianConfirm(plugin.app, `${t('common.confirmDelete')}: "${deck.name}"?`, { title: t('common.confirmDelete') });
        if (!confirmed) return;
        await irStorage.deleteDeck(deckId);
        await loadIRDeckTree();
        window.dispatchEvent(new CustomEvent('Weave:ir-data-updated'));
        plugin.app.workspace.trigger('Weave:data-changed');
        new Notice(t('notifications.success.cardDeleted'));
      } catch (error) { logger.error('[kanbanDeleteDeck] IR delete failed:', error); new Notice(t('notifications.error.deleteFailed')); }
    } else if (selectedFilter === 'question-bank') {
      try {
        const { showObsidianConfirm } = await import('../../utils/obsidian-confirm');
        const bank = decks.find(d => d.id === deckId) || (await dataStorage.getDeck(deckId));
        if (!bank) { new Notice(t('deckStudyPage.notices.deckNotFound')); return; }
        const confirmed = await showObsidianConfirm(plugin.app, `${t('common.confirmDelete')}: "${bank.name}"?`, { title: t('common.confirmDelete') });
        if (!confirmed) return;
        await dataStorage.deleteDeck(deckId);
        await loadQBDeckTree();
        plugin.app.workspace.trigger('Weave:data-changed');
        new Notice(t('notifications.success.cardDeleted'));
      } catch (error) { logger.error('[kanbanDeleteDeck] QB delete failed:', error); new Notice(t('notifications.error.deleteFailed')); }
    } else {
      await deleteDeck(deckId);
    }
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

          noCardsStats = {
            totalCards: physicalTotalCards,
            learnedCards: physicalTotalCards - learnableTotalCards,
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

  async function editWDeckDeck(deckId: string): Promise<void> {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;

    const filePaths = getWDeckFilePaths(deck);
    if (filePaths.length === 0) {
      new Notice('当前 `.wdeck` 牌组缺少可编辑的牌组文件。');
      return;
    }

    await openWDeckSegmentFile(filePaths[0]);
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
    if (isVirtualWDeckDeck(deck)) {
      await editWDeckDeck(deckId);
      return;
    }

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
          
          // 如果删除的是官方教程牌组，标记为跳过自动恢复
          const { GUIDE_DECK_NAME } = await import('../../data/guide-deck-data');
          if (deck.name === GUIDE_DECK_NAME && plugin.settings) {
            plugin.settings.skipGuideDeck = true;
            await plugin.saveSettings();
            logger.info('[DeckStudyPage] 用户删除了教程牌组，已标记 skipGuideDeck=true');
          }
          
          decks = decks.filter(existingDeck => existingDeck.id !== deckId);
          deckTree = deckTree.filter(node => node.deck.id !== deckId);
          expandedDeckIds.delete(deckId);
          expandedDeckIds = new Set(expandedDeckIds);
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

      // 检查引用式牌组服务是否可用
      if (!plugin.referenceDeckService) {
        new Notice(t('deckStudyPage.dissolve.serviceNotInit'));
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
          
          const result = await plugin.referenceDeckService!.dissolveDeck(deckId);
          
          if (!result.success) {
            throw new Error(result.error || t('deckStudyPage.dissolve.failed'));
          }
          
          // 刷新数据
          decks = await dataStorage.getDecks();
          await refreshData();
          
          // 通知全局侧边栏刷新
          plugin.app.workspace.trigger('Weave:data-changed');
          
          let message = t('deckStudyPage.dissolve.success', { name: deck.name });
          if (result.orphanedCards.length > 0) {
            message += t('deckStudyPage.dissolve.orphanedCards', { count: String(result.orphanedCards.length) });
          }
          new Notice(message);
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
      const deckCards = await dataStorage.getDeckCards(deckId);
      
      deckAnalyticsModalInstance?.close();
      deckAnalyticsModalInstance = new DeckAnalyticsModalObsidian(plugin.app, {
        plugin,
        deckId,
        cards: deckCards,
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
    switch (action) {
      case 'advance-study':
        await startAdvanceStudy(deckId);
        return;
      case 'deck-analytics':
        if (premiumGuard.isFeatureRestricted(PREMIUM_FEATURES.DECK_ANALYTICS)) {
          promptFeatureId = PREMIUM_FEATURES.DECK_ANALYTICS;
          showActivationPrompt = true;
          return;
        }
        openDeckAnalytics(deckId);
        return;
      case 'knowledge-graph':
        openKnowledgeGraph(deckId);
        return;
      case 'associate-question-bank':
        await associateQuestionBank(deckId);
        return;
      case 'edit-deck':
        await editDeck(deckId);
        return;
      case 'delete-deck':
        await deleteDeck(deckId);
        return;
      case 'dissolve-deck':
        await dissolveDeck(deckId);
        return;
    }
  }


  // 使用 Obsidian 原生 Menu
  function showDeckMenu(event: MouseEvent, deckId: string) {
    const menu = new Menu();
    const deck = decks.find(d => d.id === deckId);
    const useWDeckManagementSection = isVirtualWDeckDeck(deck);
    buildMemoryDeckMenu(
      menu,
      {
        advanceStudy: t('deckStudyPage.contextMenu.advanceStudy'),
        deckAnalytics: t('deckStudyPage.contextMenu.deckAnalytics'),
        knowledgeGraph: t('deckStudyPage.contextMenu.knowledgeGraph'),
        linkQuestionBank: t('deckStudyPage.contextMenu.linkQuestionBank'),
        editDeck: t('deckStudyPage.contextMenu.editDeck'),
        deleteDeck: t('deckStudyPage.contextMenu.delete'),
        dissolveDeck: t('deckStudyPage.contextMenu.dissolveDeck')
      },
      {
        onAdvanceStudy: async () => await handleMemoryDeckMenuAction('advance-study', deckId),
        onOpenDeckAnalytics: async () => await handleMemoryDeckMenuAction('deck-analytics', deckId),
        onOpenKnowledgeGraph: async () => await handleMemoryDeckMenuAction('knowledge-graph', deckId),
        onAssociateQuestionBank: async () => await handleMemoryDeckMenuAction('associate-question-bank', deckId),
        onEditDeck: async () => await handleMemoryDeckMenuAction('edit-deck', deckId),
        onDeleteDeck: async () => await handleMemoryDeckMenuAction('delete-deck', deckId),
        onDissolveDeck: async () => await handleMemoryDeckMenuAction('dissolve-deck', deckId)
      },
      {
        showDeckAnalytics: premiumGuard.shouldShowFeatureEntry(PREMIUM_FEATURES.DECK_ANALYTICS, {
          isPremium,
          showPremiumPreview: showPremiumFeaturesPreview
        }),
        lockDeckAnalytics: !premiumGuard.canUseFeature(PREMIUM_FEATURES.DECK_ANALYTICS),
        renderManagementSection: useWDeckManagementSection && deck
          ? (targetMenu) => renderWDeckManagementSection(targetMenu, deck)
          : undefined
      }
    );


    menu.showAtMouseEvent(event);
  }

  // 展开/折叠功能
  function toggleExpand(deckId: string) {
    if (expandedDeckIds.has(deckId)) {
      expandedDeckIds.delete(deckId);
    } else {
      expandedDeckIds.add(deckId);
    }
    expandedDeckIds = new Set(expandedDeckIds);
    
    // 保存到 localStorage
    saveExpandedState();
  }

  function isExpanded(deckId: string): boolean {
    return expandedDeckIds.has(deckId);
  }

  // 保存展开状态到 localStorage
  function saveExpandedState() {
    try {
      const stateArray = Array.from(expandedDeckIds);
      vaultStorage.setItem('weave-deck-expanded-state', JSON.stringify(stateArray));
    } catch (error) {
      logger.error('Failed to save expanded state:', error);
    }
  }

  // 从 localStorage 加载展开状态
  function loadExpandedState() {
    try {
      const saved = vaultStorage.getItem('weave-deck-expanded-state');
      if (saved) {
        const stateArray = JSON.parse(saved);
        expandedDeckIds = new Set(stateArray);
      }
    } catch (error) {
      logger.error('Failed to load expanded state:', error);
      expandedDeckIds = new Set();
    }
  }

  // 递归计算牌组总卡片数（包含子牌组）
  function getTotalCards(node: DeckTreeNode): number {
    const stats = deckStats[node.deck.id] || { newCards: 0, learningCards: 0, reviewCards: 0 };
    let total = stats.newCards + stats.learningCards + stats.reviewCards;
    
    for (const child of node.children) {
      total += getTotalCards(child);
    }
    
    return total;
  }

  // 递归计算子牌组的统计（不包含自己）
  function getSubdeckStats(node: DeckTreeNode): { newCards: number; learningCards: number; reviewCards: number } {
    let newCards = 0;
    let learningCards = 0;
    let reviewCards = 0;

    for (const child of node.children) {
      const childStats = deckStats[child.deck.id] || { newCards: 0, learningCards: 0, reviewCards: 0 };
      newCards += childStats.newCards;
      learningCards += childStats.learningCards;
      reviewCards += childStats.reviewCards;

      // 递归累加子牌组的子牌组
      const subStats = getSubdeckStats(child);
      newCards += subStats.newCards;
      learningCards += subStats.learningCards;
      reviewCards += subStats.reviewCards;
    }

    return { newCards, learningCards, reviewCards };
  }

  // 获取总统计（本牌组 + 所有子牌组）
  function getTotalStats(node: DeckTreeNode): { newCards: number; learningCards: number; reviewCards: number; total: number } {
    const ownStats = deckStats[node.deck.id] || { newCards: 0, learningCards: 0, reviewCards: 0 };
    const subStats = getSubdeckStats(node);

    const newCards = ownStats.newCards + subStats.newCards;
    const learningCards = ownStats.learningCards + subStats.learningCards;
    const reviewCards = ownStats.reviewCards + subStats.reviewCards;

    return {
      newCards,
      learningCards,
      reviewCards,
      total: newCards + learningCards + reviewCards
    };
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

    // 粘贴卡片批量导入
    const handleClipboardImport = () => {
      if (!isClipboardImportEnabled()) {
        return;
      }

      openPremiumFeature(PREMIUM_FEATURES.CLIPBOARD_IMPORT, () => {
        showClipboardImportModalWithObsidianAPI();
      });
    };

// 处理 JSON 导出
    const handleJSONExport = () => {
      exportDeck();
    };

    // 恢复官方教程牌组（来自 SidebarNavHeader 操作管理子菜单）
    const handleRestoreGuideDeck = async () => {
      const success = await dataStorage.restoreGuideDeck();
      if (success) {
        await refreshData();
        plugin.app.workspace.trigger('Weave:data-changed');
        new Notice(t('deckStudyPage.notices.tutorialRestored'));
      } else {
        new Notice(t('deckStudyPage.notices.tutorialRestoreFailed'));
      }
    };

    document.addEventListener('create-deck', handleCreateDeck);
    document.addEventListener('create-question-bank', handleCreateDeck);
    document.addEventListener('create-ir-deck', handleCreateDeck);
    document.addEventListener('more-actions', handleMoreActions);
    document.addEventListener('apkg-import', handleAPKGImport);
    document.addEventListener('csv-import', handleCSVImport);
    document.addEventListener('clipboard-import', handleClipboardImport);
    document.addEventListener('json-export', handleJSONExport);
    document.addEventListener('Weave:restore-guide-deck', handleRestoreGuideDeck);
    return () => {
      document.removeEventListener('create-deck', handleCreateDeck);
      document.removeEventListener('create-question-bank', handleCreateDeck);
      document.removeEventListener('create-ir-deck', handleCreateDeck);
      document.removeEventListener('more-actions', handleMoreActions);
      document.removeEventListener('apkg-import', handleAPKGImport);
      document.removeEventListener('csv-import', handleCSVImport);
      document.removeEventListener('clipboard-import', handleClipboardImport);
      document.removeEventListener('json-export', handleJSONExport);
      document.removeEventListener('Weave:restore-guide-deck', handleRestoreGuideDeck);
    };
  });



  function getUrgencyLevel(stats: any): 'urgent' | 'due' | 'completed' | 'normal' {
    if (!stats) return 'normal';

    const reviewCards = stats.reviewCards ?? 0;
    const newCards = stats.newCards ?? 0;
    const learningCards = stats.learningCards ?? 0;

    if (reviewCards > 10) return 'urgent';
    if (reviewCards > 0 || learningCards > 0) return 'due';
    if (newCards === 0 && reviewCards === 0 && learningCards === 0) return 'completed';
    return 'normal';
  }


</script>

{#snippet deckNode(node: DeckTreeNode, depth: number)}
  {@const stats = deckStats[node.deck.id]}
  {@const totalDue = (stats?.newCards ?? 0) + (stats?.learningCards ?? 0) + (stats?.reviewCards ?? 0)}
  {@const urgencyLevel = getUrgencyLevel(stats)}
  {@const hasChildren = node.children.length > 0}
  {@const expanded = isExpanded(node.deck.id)}

  <div
    class="new-deck-row anki-font-interface"
    class:urgent={urgencyLevel === 'urgent'}
    class:due={urgencyLevel === 'due'}
    class:completed={totalDue === 0}
    class:has-children={hasChildren}
    style="padding-left: {depth * 24}px"
    role="button"
    tabindex="0"
    oncontextmenu={(e) => {
      e.preventDefault();
      showDeckMenu(e, node.deck.id);
    }}
  >
    <!-- 展开/折叠按钮 -->
    <div class="row-deck-name">
      {#if hasChildren}
        <button
          class="expand-toggle"
          onclick={(e) => {
            toggleExpand(node.deck.id);
          }}
          aria-label={expanded ? t('deckStudyPage.studyActions.collapse') : t('deckStudyPage.studyActions.expand')}
        >
          <ObsidianIcon 
            name={expanded ? "chevron-down" : "chevron-right"} 
            size={14} 
          />
        </button>
      {:else}
        <span class="expand-spacer"></span>
      {/if}

      <div class="deck-name-content">
        {#if node.deck.icon}
          <span class="deck-emoji">{node.deck.icon}</span>
        {/if}
        <span class="deck-name">{node.deck.name}</span>
        
        <!-- 牌组类型徽章 -->
        {#if node.deck.deckType === 'choice-only'}
          <span class="choice-deck-badge">
            <ObsidianIcon name="check-square" size={12} />
            <span>{t('deckStudyPage.deckTypes.choice')}</span>
          </span>
        {/if}
        
        <!-- 子牌组统计气泡（仅当有子牌组时显示） -->
        {#if hasChildren}
          {@const totalStats = getTotalStats(node)}
          {@const subStats = getSubdeckStats(node)}
          {@const subTotal = subStats.newCards + subStats.learningCards + subStats.reviewCards}
          {#if subTotal > 0}
            <span class="subdeck-indicator" title={t('deckStudyPage.subdeck.indicator', { total: String(subTotal), newCards: String(subStats.newCards), learning: String(subStats.learningCards), review: String(subStats.reviewCards) })}>
              +{subTotal}
            </span>
          {/if}
        {/if}
        
        {#if urgencyLevel === 'urgent'}
          <span class="deck-status urgent">{t('deckStudyPage.urgency.urgent')}</span>
        {:else if totalDue === 0}
          <span class="deck-status completed">{t('deckStudyPage.urgency.completed')}</span>
        {/if}
      </div>
    </div>

    <!-- 统计数据区域（仅显示本牌组的统计） -->
    <div class="row-stat new-cards">
      <span class="stat-number">{stats?.newCards ?? 0}</span>
    </div>
    <div class="row-stat learning-cards">
      <span class="stat-number">{stats?.learningCards ?? 0}</span>
    </div>
    <div class="row-stat review-cards">
      <span class="stat-number">{stats?.reviewCards ?? 0}</span>
    </div>

    <!-- 操作 -->
    <div class="row-actions">
      <div class="deck-actions">
        {#if totalDue > 0}
          <button
            class="study-button primary"
            onclick={() => startStudy(node.deck.id)}
          >
            <ObsidianIcon name="play" size={16} />
            {t('deckStudyPage.studyActions.studyButton')} ({totalDue})
          </button>
        {:else}
          <button
            class="study-button completed"
            disabled
          >
            <ObsidianIcon name="check" size={16} />
            {t('deckStudyPage.studyActions.completedButton')}
          </button>
        {/if}

        <button
          class="icon-button menu-button"
          onclick={(e) => {
            showDeckMenu(e, node.deck.id);
          }}
          aria-label={t('deckStudyPage.moreActions')}
        >
          <EnhancedIcon name="more-horizontal" size={16} />
        </button>
      </div>
    </div>
  </div>

  <!-- 递归渲染子节点 -->
  {#if expanded && hasChildren}
    {#each node.children as child}
      {@render deckNode(child, depth + 1)}
    {/each}
  {/if}
{/snippet}

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
    <!-- 看板视图：三种模式统一支持 -->
    {#if currentView === 'kanban'}
      <KanbanView 
        deckTree={selectedFilter === 'question-bank' ? qbDeckTree : selectedFilter === 'incremental-reading' ? irDeckTree : deckTree}
        deckStats={selectedFilter === 'question-bank' ? qbDeckStats : selectedFilter === 'incremental-reading' ? irDeckStats : deckStats}
        deckMode={selectedFilter === 'question-bank' ? 'question-bank' : selectedFilter === 'incremental-reading' ? 'incremental-reading' : 'memory'}
        {dataStorage}
        {plugin}
        onStartStudy={kanbanStartStudy}
        onDeckUpdate={refreshData}
        onAssociateQuestionBank={selectedFilter === 'memory' ? associateQuestionBank : undefined}
        onEditDeck={kanbanEditDeck}
        onDeleteDeck={kanbanDeleteDeck}
        onOpenKnowledgeGraph={selectedFilter === 'memory' ? openKnowledgeGraph : undefined}
        onDissolveDeck={selectedFilter === 'memory' ? dissolveDeck : undefined}
      />
    <!-- 非看板视图：按模式分别渲染 -->
    {:else if selectedFilter === 'incremental-reading'}
      <IRDeckView {plugin} />
    {:else if currentView === 'grid'}
      <GridCardView 
        {deckTree}
        {deckStats}
        {studySessions}
        {emergentCandidates}
        {emergentDeckViews}
        {emergentDeckStats}
        {formalDeckBindingSummary}
        {plugin}
        {selectedFilter}
        onFilterSelect={handleFilterSelect}
        onStartStudy={startStudy}
        onContinueStudy={handleContinueStudy}
        onAdvanceStudy={startAdvanceStudy}
        onOpenDeckAnalytics={openDeckAnalytics}
        onAssociateQuestionBank={associateQuestionBank}
        onEditDeck={editDeck}
        onDeleteDeck={deleteDeck}
        onOpenKnowledgeGraph={openKnowledgeGraph}
        onDissolveDeck={dissolveDeck}
        onRefreshData={refreshData}
        onPromoteEmergentDeck={handlePromoteEmergentDeck}
        onStartEmergentStudy={startStudy}
      />
    {/if}
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
                  onclick={() => addEmergentRuleGroupSourceFolderDraft(currentRuleGroupDraft.id)}
                  onkeydown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      addEmergentRuleGroupSourceFolderDraft(currentRuleGroupDraft.id);
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

<!-- CSV导入向导模态窗 -->
{#if showCreateQuestionBankModal}
  <CreateQuestionBankModal
    bind:open={showCreateQuestionBankModal}
    {plugin}
    mode="create"
    onClose={() => { showCreateQuestionBankModal = false; }}
    onCreated={async () => {
      showCreateQuestionBankModal = false;
      await loadQBDeckTree();
      plugin.app.workspace.trigger('Weave:data-changed');
    }}
  />
{/if}

{#if showCSVImportModal}
  <CSVImportModal
    bind:open={showCSVImportModal}
    {plugin}
    {dataStorage}
    onClose={() => { showCSVImportModal = false; }}
    onImportComplete={async () => { showCSVImportModal = false; await refreshData(); plugin.app.workspace.trigger('Weave:data-changed'); }}
  />
{/if}

<!--  庆祝模态窗 -->
{#if showCelebrationModal && celebrationStats}
  <CelebrationModal
    deckName={celebrationDeckName}
    deckId={celebrationDeckId}
    stats={celebrationStats}
    soundEnabled={true}
    onClose={handleCloseCelebration}
    onStartPractice={handleStartPractice}
  />
{/if}

<!-- 无卡片提示模态窗 -->
{#if showNoCardsModal}
  <NoCardsAvailableModal
    deckName={noCardsDeckName}
    reason={noCardsReason}
    stats={noCardsStats}
    onClose={handleCloseNoCardsModal}
    onAdvanceStudy={handleAdvanceStudy}
    onViewStats={handleViewStats}
    onStartPractice={handleStartPracticeFromNoCards}
  />
{/if}

<!--  激活提示 -->
<ActivationPrompt
  featureId={promptFeatureId}
  visible={showActivationPrompt}
  onClose={() => showActivationPrompt = false}
/>

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


  /* 卡片化数据行样式 - CSS Table布局 */
  .new-deck-row {
    display: table !important; /* 强制table布局 */
    width: 100%;
    table-layout: fixed; /* 固定表格布局，与header保持一致 */
    padding: 8px 12px; /* 减少外层padding，避免与cell padding重复 */
    border-bottom: none;
    transition: all 0.2s ease;
    background: var(--weave-deck-card-bg);
    position: relative;
    border-radius: 8px;
    margin-bottom: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    border-collapse: separate; /* 确保table布局正常 */
    border-spacing: 0; /* 消除cell间距 */
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

  .new-deck-row:hover {
    background: var(--background-modifier-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  /* 卡片化状态指示 - 保持状态样式 */
  .new-deck-row.urgent {
    background: linear-gradient(135deg, var(--weave-deck-card-bg) 0%, rgba(239, 68, 68, 0.03) 100%);
    border: 1px solid rgba(239, 68, 68, 0.1);
    box-shadow: 0 1px 3px rgba(239, 68, 68, 0.1); /* 状态色阴影 */
  }

  .new-deck-row.due {
    background: linear-gradient(135deg, var(--weave-deck-card-bg) 0%, rgba(245, 158, 11, 0.03) 100%);
    border: 1px solid rgba(245, 158, 11, 0.1);
    box-shadow: 0 1px 3px rgba(245, 158, 11, 0.1); /* 状态色阴影 */
  }

  .new-deck-row.completed {
    background: linear-gradient(135deg, var(--weave-deck-card-bg) 0%, rgba(16, 185, 129, 0.03) 100%);
    border: 1px solid rgba(16, 185, 129, 0.1);
    box-shadow: 0 1px 3px rgba(16, 185, 129, 0.1); /* 状态色阴影 */
  }

  /* 牌组名称区域 */
  .row-deck-name {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  /* 展开/折叠按钮 */
  .expand-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .expand-toggle:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .expand-spacer {
    display: inline-block;
    width: 20px;
    flex-shrink: 0;
  }

  .deck-emoji {
    font-size: 1rem;
    line-height: 1;
    margin-right: 0.25rem;
  }

  .deck-name-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .deck-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0;
  }

  /* 子牌组统计气泡 */
  .subdeck-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem 0.375rem;
    margin-left: 0.5rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: help;
    transition: all 0.2s ease;
    opacity: 0.75;
  }

  .subdeck-indicator:hover {
    opacity: 1;
    transform: scale(1.05);
  }

  /* 菜单按钮 - Cursor 风格圆形设计 */
  .menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.2s ease;
    opacity: 0.6;
  }

  .menu-button:hover {
    opacity: 1;
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .menu-button:active {
    transform: scale(0.95);
    background: var(--background-modifier-active);
  }

  .deck-status {
    padding: 0.125rem 0.5rem;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .deck-status.urgent {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .deck-status.completed {
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }


  /* 数据行元素 - Table Cell布局 */
  .row-deck-name,
  .row-stat,
  .row-actions {
    display: table-cell !important; /* 强制覆盖其他样式 */
    vertical-align: middle;
    border: none; /* 确保无边框干扰 */
    position: static !important; /* 防止position干扰table布局 */
    float: none !important; /* 防止float干扰table布局 */
    /* 移除通用padding，使用各自的精确padding设置 */
  }

  .row-deck-name {
    width: 60%; /* 与header保持一致的宽度 */
    text-align: left;
    padding: 4px 0px 4px 8px; /* 右侧无padding，直接贴合统计列 */
  }

  .row-stat {
    width: 8%; /* 与header保持一致的宽度 */
    text-align: center;
    font-weight: 600;
    font-size: 0.9rem;
    padding: 4px 2px; /* 最小padding，节省空间 */
  }

  .row-actions {
    width: 16%; /* 与header保持一致的宽度 */
    text-align: right;
    padding: 4px 8px 4px 0px; /* 左侧无padding，贴合统计列 */
  }

  .row-stat.new-cards .stat-number {
    color: #3b82f6;
  }

  .row-stat.learning-cards .stat-number {
    color: #f59e0b;
  }

  .row-stat.review-cards .stat-number {
    color: #10b981;
  }


  .deck-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end; /* 确保按钮右对齐在操作列内 */
    gap: 0.5rem;
    width: 100%; /* 确保占满table-cell宽度 */
  }

  .study-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .study-button.primary {
    background: #3b82f6;
    color: white;
  }

  .study-button.primary:hover {
    background: #2563eb;
  }

  .study-button.completed {
    background: var(--background-modifier-border);
    color: var(--text-muted);
    cursor: not-allowed;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .row-deck-name {
      width: 55%; /* 中屏幕：保持名称列的最大化利用 */
    }

    .row-stat {
      width: 9%; /* 中屏幕：统计列适中宽度 */
    }

    .row-actions {
      width: 18%; /* 中屏幕：压缩操作列为名称列让出空间 */
    }

    .deck-name {
      font-size: 0.85rem;
    }

    .deck-status {
      font-size: 0.65rem;
      padding: 0.1rem 0.4rem;
    }

    .study-button {
      padding: 0.4rem 0.8rem;
      font-size: 0.75rem;
    }
  }

  @media (max-width: 480px) {
    .new-deck-row {
      padding: 0.75rem;
    }

    .row-deck-name {
      width: 50%; /* 小屏幕：仍然最大化利用名称空间 */
    }

    .row-stat {
      width: 10%; /* 小屏幕：统计列保持紧凑 */
    }

    .row-actions {
      width: 20%; /* 小屏幕：压缩操作列 */
    }

    .deck-actions {
      flex-direction: column;
      gap: 0.25rem;
    }

    .study-button {
      padding: 0.375rem 0.75rem;
      font-size: 0.7rem;
    }
  }


  .stat-number {
    font-weight: 600;
    font-size: 1.125rem;
  }
</style>
