<script lang="ts">
  // ============================================
  //  导入声明区
  // ============================================
  
  // UI组件导入
  import EnhancedButton from "../ui/EnhancedButton.svelte";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import FloatingMenu from "../ui/FloatingMenu.svelte";
  import PriorityPickerPopover from "../shared/PriorityPickerPopover.svelte";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import MarkdownView from "../atoms/MarkdownRenderer.svelte";
  import StatsCards from "./StatsCards.svelte";
  import SourceInfoBar from "./SourceInfoBar.svelte";
  import MobileProficiencyStatsBar from "./MobileProficiencyStatsBar.svelte";  // 学习进度统计栏
  import MobileTimingInfoBar from "./MobileTimingInfoBar.svelte";  // 卡片计时信息栏
  import VerticalToolbar from "./VerticalToolbar.svelte";
  import RatingSection from "./RatingSection.svelte";
  import PreviewContainer from "../preview/PreviewContainer.svelte";
  import StudyHeader from "./StudyHeader.svelte";
  import CardEditorContainer from "./CardEditorContainer.svelte";
  import type { Menu } from "obsidian";
  import type { MenuCallbacks } from "../../services/menu/StudyToolbarMenuBuilder";
  import { populateStudyToolbarMenuSession } from "../../services/menu/study-toolbar-menu-session";
  import {
    getRatingLabelStyleLabel,
    normalizeRatingLabelStyle,
    resolveRatingLabelStyleFromPreferences,
    shouldShowRatingIntervalOnButtons,
    type RatingLabelStyle
  } from "./rating-label-style";

  //  高级功能限制
  import { PremiumFeatureGuard } from "../../services/premium/PremiumFeatureGuard";
  import { get } from 'svelte/store';

  import type { EmbeddableEditorManager } from "../../services/editor/EmbeddableEditorManager";
  import type { Deck } from "../../data/types";
  import type { Card } from "../../data/types";
  import { CardState, CardType, Rating } from "../../data/types";
  import type { StudySession } from "../../data/study-types";
  import type { FSRS } from "../../algorithms/fsrs";
  import type { WeaveDataStorage } from "../../data/storage";
  import type { WeavePlugin } from "../../main";
  import type { StudyInterfaceViewPreferences } from "../settings/types/settings-types";
  import type { ChoiceOptionOrder } from '../../utils/study/choiceOptionOrder';
  import {
    applyStudyCardOrderToQueue,
    collectStudyInterfaceViewPreferencesFromBindings,
    reorderStudyQueuePreservingCurrentCard,
  } from '../../utils/study/studyInterfaceViewPreferences';
  import { MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE } from "../../services/DataSyncService";
  import { generateId } from "../../utils/helpers";
  import { Component, MarkdownRenderer, Notice, Platform } from "obsidian";
  import { onMount, onDestroy, tick, untrack } from "svelte";
  import { getSourceLocateOverlayService } from "../../services/ui/SourceLocateOverlayService";
  import { SourceNavigationService } from "../../services/ui/SourceNavigationService";
  import StudyProgressBar from "./StudyProgressBar.svelte";
  import { StudySessionManager } from "../../services/StudySessionManager";
  import { CachedChoiceStatistics } from '../../utils/cached-choice-statistics';
  import { LoadBalanceManager } from '../../services/LoadBalanceManager';

  import { CardType as PreviewCardType } from "../preview/ContentPreviewEngine";
  import { UnifiedCardType, getCardTypeName } from "../../types/unified-card-types";
  import { detectCardQuestionType } from "../../utils/card-type-utils";
  import type { ParseTemplate } from "../../types/newCardParsingTypes";
  import { UI_CONSTANTS } from "../../constants/app-constants";
  import { detectClozeModeFromContent, setClozeModeInContent, type ClozeMode } from "../../utils/cloze-mode";
  import { ClozeInputModeHintModal } from "../../modals/ClozeInputModeHintModal";
  import {
    GLOBAL_TUTORIAL_HINT_IDS,
    markTutorialHintDismissed,
    shouldShowTutorialHint
  } from "../../services/tutorial/GlobalTutorialHints";
  import { CardFormatService } from "../../services/CardFormatService";
  import { AISplitService } from "../../services/ai/AISplitService";
  import { resolveDefaultAISplitInstruction } from "../../services/ai/ai-host";
  import type { AIAction } from "../../types/ai-types";
  
  //  AI配置Store（单一数据源）
  import { customActionsForMenu } from "../../stores/ai-config.store";

  //  复习撤销功能
  import { ReviewUndoManager, type ReviewSnapshot } from "../../services/ReviewUndoManager";

  //  父子卡片功能
  import { CardRelationService } from "../../services/relation/CardRelationService";
  import { DerivationMethod } from "../../services/relation/types";
  import ChildCardsOverlay from "./ChildCardsOverlay.svelte";
  
  //  渐进式挖空 V2架构
  import { CardAccessor } from "../../services/progressive-cloze/CardAccessor";
  import { showObsidianConfirm } from "../../utils/obsidian-confirm";
  import { CardStoreAdapter } from "../../services/progressive-cloze/CardStoreAdapter";
  // 卡片详细信息模态窗由全局方法 plugin.openViewCardModal() 处理
  //  导入国际化
  import { tr } from "../../utils/i18n";
  import UnifiedActionsBar from "./UnifiedActionsBar.svelte";
 

  //  学习界面工具函数
  import {
    processClozeText,
    enhanceEmbeds,
    parseCSVLine,
    findColumnIndex,
    clearHoverTooltips,
    attachHoverCleanup,
    removeHoverCleanup,
    setupBlockLinkHandlers
  } from "../../utils/study/studyInterfaceUtils";
  import { resolveMemorySchedulingForCard as resolveCardMemoryScheduling } from "../../utils/study/memorySchedulingResolver";
  import { formatStudyTime } from "../../utils/study/timeCalculation";
  import { StepIndexCalculator } from "../../utils/learning-steps/StepIndexCalculator";
  import { applyLearningStepScheduling } from "../../utils/learning-steps/learningStepScheduling";
  import {
    DEFAULT_MEMORY_SCHEDULING_SETTINGS,
    normalizeMemorySchedulingSettings,
  } from "../../utils/learning-steps/memorySchedulingConfig";
  
  // 回收卡片工具
  import { filterRecycledCards, recycleCard, getRecycleTagText } from "../../utils/recycle-utils";
  import { RecycleReason } from "../../constants/app-constants";  // 回收原因枚举
  import { TagExtractor } from "../../utils/tag-extractor";
  import { logger } from "../../utils/logger";
  import { openLinkWithExistingLeaf } from "../../utils/workspace-navigation";
  import { vaultStorage } from '../../utils/vault-local-storage';
  import { getCardBack, getCardFront } from "../../utils/card-field-helper";
  import { WDECK_UNGROUPED_DECK_NAME } from "../../services/wdeck/WDeckService";
  // 牌组信息获取工具
  import { getCardMetadata, parseEpubSourceInfo, parseSourceInfo, setCardProperties, getCardDeckIds, createContentWithMetadata } from "../../utils/yaml-utils";
  import { resolveStudySessionDeckId } from "../../utils/study/sessionDeckId";
  // 使用 CardMetadataService 获取卡片元数据
  import { getCardMetadataService } from "../../services/CardMetadataService";
  
  //  渐进式挖空支持 V2
  import { isProgressiveClozeChild } from "../../types/progressive-cloze-v2";
  import type { ProgressiveClozeChildCard } from "../../types/progressive-cloze-v2";
  import { StudyQueueGenerator } from "../../utils/study/StudyQueueGenerator";
  import {
    deleteMemoryCard as deleteMemoryCardCommand,
    saveMemoryCard as saveMemoryCardCommand,
  } from "../../services/weave-domain";
  import {
    setCardErrorBookState,
    syncCardStatsToCanonicalFormat,
  } from "../../utils/card-stats-normalizer";
  import { createMemoryStudySessionController } from "./memory-study-session-controller";
  import { StudyTimerService } from "../../services/study/StudyTimerService";
  
  //  组件辅助工具和常量
  import {
    UI_TIMING,
    LAYOUT_SPACING,
    RESPONSE_TIME_THRESHOLDS,
    PROGRESS_NOTIFICATION,
    FSRS_STATS_WEIGHTS,
    LOG_PREFIX
  } from './study-interface-constants';
  import {
    saveCardUnified,
    updateArrayItem,
    handleError,
    initializeChoiceStats,
    initializeCardStats,
    isValidCard,
    ensureCardFields,
    devLog
  } from './study-interface-helpers';

  async function runWithMemoryStudyDataChangeContext<T>(deckId: string | undefined, task: () => Promise<T>): Promise<T> {
    const previousDataChangeContext = (plugin as any).__weaveDataChangeContext;
    (plugin as any).__weaveDataChangeContext = {
      ...previousDataChangeContext,
      source: MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE,
      deckIds: deckId ? [deckId] : []
    };
    try {
      return await task();
    } finally {
      (plugin as any).__weaveDataChangeContext = previousDataChangeContext;
    }
  }

  // ============================================
  //  类型定义与接口
  // ============================================

  interface Props {
    cards: Card[];
    fsrs: FSRS;
    dataStorage: WeaveDataStorage;
    plugin: WeavePlugin;
    viewInstance?: any;  //  StudyView 实例，用于设置移动端菜单回调
    sessionDeckId?: string;
    forcedDeckName?: string;
    showSourceInfoToggle?: boolean;
    mode?: 'normal' | 'advance';  // 学习模式：normal=正常，advance=提前学习
    initialCardIndex?: number;  // 重启恢复时的初始卡片索引
    isStagingSession?: boolean;
    onStagingCardReviewed?: (card: Card) => void;
    onStagingCardEdited?: (card: Card) => void;
    onStagingDiscard?: (cardUuid: string) => void;
    onStagingSessionComplete?: () => void;
    onClose: () => void;
    onComplete: (session: StudySession) => void;
  }

  interface LearningConfig {
    learningSteps: number[];
    relearningSteps: number[];
    graduatingInterval: number;
    easyInterval: number;
  }

  // ============================================
  //  核心状态管理 (43个$state变量)
  // ============================================

  let {
    cards: rawCards,
    fsrs,
    dataStorage,
    plugin,
    viewInstance,
    sessionDeckId = '',
    forcedDeckName = '',
    showSourceInfoToggle = false,
    mode,
    initialCardIndex = 0,
    isStagingSession = false,
    onStagingCardReviewed,
    onStagingCardEdited,
    onStagingDiscard,
    onStagingSessionComplete,
    onClose,
    onComplete
  }: Props = $props();

  //  过滤回收的卡片（初始化时过滤，后续手动管理）
  let cards = $state(untrack(() => filterRecycledCards(rawCards)));

  //  响应式翻译函数
  let t = $derived($tr);

  // --- 管理器实例 ---
  const sessionManager = StudySessionManager.getInstance();
  const premiumGuard = PremiumFeatureGuard.getInstance();
  const reviewUndoManager = new ReviewUndoManager();
  const cardRelationService = untrack(() => new CardRelationService(dataStorage));
  const queueGenerator = new StudyQueueGenerator();
  
  
  //  数据预处理标志（避免重复修复）
  let cardsPreprocessed = $state(false);
  
  //  预处理cards：修复数据不一致问题（在$effect中执行，避免在$derived中修改状态）
  $effect(() => {
    if (cards && cards.length > 0 && !cardsPreprocessed) {
      try {
        // 设置 session 的 deckId，优先使用用户当前进入学习的牌组。
        if (!session.deckId) {
          session.deckId = resolveStudySessionDeckId({
            currentDeckId: sessionDeckId,
            firstCard: cards[0],
            decks
          });
          
          if (session.deckId) {
            devLog('debug', `${LOG_PREFIX.SESSION} 设置会话牌组ID: ${session.deckId}`);
          } else {
            logger.warn('[StudyInterface] 无法获取牌组ID，进度条可能无法显示');
          }
        }
        
        cardsPreprocessed = true;
        devLog('debug', `${LOG_PREFIX.SESSION} 卡片数据预处理完成，共${cards.length}张`);
      } catch (error) {
        logger.error('[StudyInterface] 卡片预处理失败:', error);
      }
    }
  });
  
  //  学习队列生成（固定队列模式 - 修复动态变化问题）
  //  v3.0: 直接使用传入的 cards（已由 loadDeckCardsForStudy 处理）
  // 核心改进：不再重复调用 generateQueuePure，避免与统计不一致
  // 传入的 cards 已经应用了：回收过滤、兄弟过滤、每日限制等
  let studyQueue = $state<Card[]>([]);
  let orderedBaseStudyQueue = $state<Card[]>([]);
  let queueInitialized = $state(false);
  
  // 初始化队列（仅执行一次）
  $effect(() => {
    if (cardsPreprocessed && !queueInitialized && cards.length > 0) {
      //  v3.0: 直接使用传入的 cards，不再重复生成队列
      // cards 已由 loadDeckCardsForStudy() 或 UnifiedStudyProvider 处理
      // 这确保了学习队列与牌组统计 100% 一致
      let queue = [...cards];
      
      // 使用 get() 同步获取当前激活状态，避免时序问题
      const currentPremiumStatus = get(premiumGuard.isPremiumActive);
      
      //  高级功能限制：未激活时过滤渐进式挖空子卡片
      if (!currentPremiumStatus) {
        const beforeCount = queue.length;
        queue = queueGenerator.filterQueue(queue, { excludeProgressiveCloze: true });
        const filteredCount = beforeCount - queue.length;
        if (filteredCount > 0) {
          logger.debug(`[StudyInterface] 🔒 已过滤 ${filteredCount} 张渐进式挖空卡片（高级功能未激活）`);
        }
      }
      
      logger.debug(`[StudyInterface] 🔑 激活状态检查: ${currentPremiumStatus ? '✅ 已激活' : '❌ 未激活'}`);
      
      orderedBaseStudyQueue = queue;
      studyQueue = applyStudyCardOrderToQueue(orderedBaseStudyQueue, cardOrder);
      queueInitialized = true;
      
      //  详细的队列初始化日志
      const queueStats = {
        total: studyQueue.length,
        newCards: studyQueue.filter(c => c.fsrs?.state === CardState.New).length,
        learning: studyQueue.filter(c => c.fsrs?.state === CardState.Learning).length,
        review: studyQueue.filter(c => c.fsrs?.state === CardState.Review).length,
        mode: mode || 'normal'
      };
      
      devLog('info', `${LOG_PREFIX.SESSION} ✅ 队列已初始化 (v3.0 直接使用传入cards):`, queueStats);
      logger.info('[StudyInterface] ✅ 队列初始化完成 (v3.0):', {
        inputCards: cards.length,
        queueLength: studyQueue.length,
        cardIds: studyQueue.slice(0, 5).map(c => c.uuid.slice(0, 8)),
        stats: queueStats
      });
    }
  });

  // --- 会话核心状态 ---
  let currentSessionId = $state<string | null>(null);
  let currentCardIndex = $state(untrack(() => initialCardIndex));
  let showAnswer = $state(false);
  const studyTimer = new StudyTimerService();
  //  移动端检测
  const isMobile = Platform.isMobile;
  
  // 会话记忆：记录本次会话已学习的卡片
  // 用于防止学习完成后立即可以重新学习
  let sessionStudiedCards = $state(new Set<string>());
  
  //  移动端牌组统计（用于顶部栏显示）
  let deckStats = $derived.by(() => {
    if (!studyQueue || studyQueue.length === 0) return undefined;
    
    return {
      newCards: studyQueue.filter(c => c.fsrs?.state === CardState.New).length,
      learningCards: studyQueue.filter(c => c.fsrs?.state === CardState.Learning || c.fsrs?.state === CardState.Relearning).length,
      reviewCards: studyQueue.filter(c => c.fsrs?.state === CardState.Review).length,
      masteredCards: 0  // 已掌握的卡片不在学习队列中
    };
  });
  
  //  同步牌组统计到 StudyView（用于移动端顶部栏显示）
  $effect(() => {
    if (viewInstance && typeof viewInstance.updateDeckStats === 'function' && deckStats) {
      viewInstance.updateDeckStats(
        deckStats.newCards,
        deckStats.learningCards,
        deckStats.reviewCards
      );
    }
  });

  // --- 数据状态 ---
  let decks = $state<Deck[]>([]);
  let availableTemplates = $state<ParseTemplate[]>([]);

  let fieldTemplates = $state<ParseTemplate[]>([]);
  let learningConfig = $state<LearningConfig | null>(null);
  let currentStudyTime = $state(0);

  // --- 题型与预览状态 ---
  let detectedCardType = $state<UnifiedCardType | null>(null);
  let cardTypeDisplayName = $derived(detectedCardType ? getCardTypeName(detectedCardType) : t('studyInterface.labels.unknownCardType'));

  // --- 媒体自动播放状态 ---
  let autoPlayMedia = $state(untrack(() => plugin.settings.mediaAutoPlay?.enabled ?? false));
  let playMediaMode = $state<'first' | 'all'>(untrack(() => plugin.settings.mediaAutoPlay?.mode ?? 'first'));
  let playMediaTiming = $state<'cardChange' | 'showAnswer'>(untrack(() => plugin.settings.mediaAutoPlay?.timing ?? 'cardChange'));
  let playbackInterval = $state(untrack(() => plugin.settings.mediaAutoPlay?.playbackInterval ?? 2000));

  // --- 父子卡片浮层状态 ---
  let showChildCardsOverlay = $state(false);
  let childCards = $state<Card[]>([]);
  let aiSplitInProgress = $state(false);
  
  let childCardsOverlayRef: any = $state(null); // 浮层组件引用
  let regeneratingCardIds = $state(new Set<string>()); // 正在重新生成的卡片ID集合
  let isRegenerating = $derived(regeneratingCardIds.size > 0); // 是否正在重新生成
  let currentSplitAction = $state<AIAction | null>(null); //  当前使用的AI拆分功能
  
  //  AI拆分目标牌组选择
  let targetDeckIdForSplit = $state<string>(''); // AI拆分的目标记忆牌组ID
  // 过滤出记忆牌组（排除题库牌组），兼容 deckType 和 purpose 两种标识
  let memoryDecks = $derived(decks.filter(d => {
    const deckAny = d as any;
    return deckAny.deckType !== 'question-bank' && deckAny.purpose !== 'test';
  }));
  //  缓存转换后的牌组列表，避免每次渲染都重新创建数组
  let availableDecksList = $derived(memoryDecks.map(d => ({ id: d.id, name: d.name })));

  // --- 卡片详细信息模态窗状态 ---
  //  改用全局模态窗，不再需要本地状态

  // --- 图谱联动状态 ---
  let isGraphLinkEnabled = $state(false);
  let graphLinkEnabled = $derived(isGraphLinkEnabled); // 别名，为了兼容
  // 保存专属 graphSyncLeaf 引用，避免与官方功能冲突
  let graphSyncLeaf = $state<any>(null);

  // ============================================
  //  计算属性 ($derived)
  // ============================================

  // --- 选择题统计 ---
  let currentCardChoiceStats = $derived.by(() => {
    if (!currentCard) return null;
    
    const isChoiceType = detectedCardType === UnifiedCardType.SINGLE_CHOICE || 
                        detectedCardType === UnifiedCardType.MULTIPLE_CHOICE;
    
    if (!isChoiceType) return null;
    
    return currentCard.stats?.choiceStats || null;
  });

  // 实时反应时间计算（仅在显示答案后有效）
  let currentResponseTime = $derived.by(() => {
    if (!showAnswer) return 0;
    void currentStudyTime;
    return studyTimer.getResponseTimeMs();
  });

  let choiceStatsDisplay = $derived.by(() => {
    if (!currentCardChoiceStats || currentCardChoiceStats.totalAttempts === 0) {
      return null;
    }
    
    const accuracy = Math.round(currentCardChoiceStats.accuracy * 100);
    return {
      accuracy,
      correct: currentCardChoiceStats.correctAttempts,
      total: currentCardChoiceStats.totalAttempts
    };
  });

  let showClozeModeSwitchButton = $state(untrack(() => plugin.settings.showClozeModeSwitchButton ?? true));

  let currentStudyClozeMode = $derived.by(() => {
    return detectClozeModeFromContent(currentCard?.content || '');
  });

  let showStudyClozeModeToggle = $derived.by(() => {
    if (!showClozeModeSwitchButton) return false;
    if (showAnswer || !currentCard) return false;

    const isProgressiveCard =
      currentCard.type === CardType.ProgressiveParent ||
      currentCard.type === CardType.ProgressiveChild;

    if (isProgressiveCard) return false;

    return detectedCardType === UnifiedCardType.CLOZE_DELETION ||
      (detectedCardType as string) === 'cloze-deletion';
  });

  // ============================================
  //  核心业务逻辑
  // ============================================

  // --- 图谱联动功能 ---
  async function handleGraphLinkToggle(enabled: boolean) {
    isGraphLinkEnabled = enabled;
    logger.debug(`[图谱联动] 状态变更: ${enabled}`);
    try {
      await persistStudyInterfaceViewPreferences({ graphLinkEnabled: enabled });
    } catch (error) {
      logger.error('[StudyInterface] 保存图谱联动设置失败:', error);
    }
  }
  
  // 别名函数，为了兼容
  const handleGraphSyncToggle = handleGraphLinkToggle;
  
  // 接收 VerticalToolbar 传递的 graphSyncLeaf 引用
  function handleGraphLeafChange(leaf: any) {
    graphSyncLeaf = leaf;
    logger.debug(`[图谱联动] Leaf引用更新:`, leaf ? '已设置' : '已清除');
  }

  async function syncLocalGraphWithCard(sourceFilePath: string) {
    try {
      // 只使用专属 leaf 引用，避免与官方功能冲突
      if (!graphSyncLeaf) {
        logger.warn('[图谱同步] 未找到专属图谱视图引用，请先开启图谱联动');
        return;
      }
      
      //  增强方案：多重刷新机制确保图谱稳定更新
      const view = graphSyncLeaf.view;
      
      // 方法1：设置新的视图状态
      await graphSyncLeaf.setViewState({
        type: 'localgraph',
        state: { file: sourceFilePath }
      });
      
      // 方法2：尝试调用视图内部的刷新方法（如果存在）
      if (view) {
        // 尝试多种可能的内部刷新方法
        if (typeof (view as any).onFileChange === 'function') {
          (view as any).onFileChange(sourceFilePath);
          logger.debug('[图谱同步] 调用 onFileChange');
        }
        
        if (typeof (view as any).update === 'function') {
          (view as any).update();
          logger.debug('[图谱同步] 调用 update');
        }
        
        if (typeof (view as any).render === 'function') {
          (view as any).render();
          logger.debug('[图谱同步] 调用 render');
        }
        
        // 触发 resize 事件强制重绘
        if (typeof view.onResize === 'function') {
          view.onResize();
          logger.debug('[图谱同步] 调用 onResize');
        }
      }
      
      // 方法3：触发 workspace 布局变化事件
      plugin.app.workspace.trigger('layout-change');
      
      // 方法4：延迟后再次设置状态（处理异步渲染问题）
      setTimeout(async () => {
        if (graphSyncLeaf && !graphSyncLeaf.detached) {
          try {
            await graphSyncLeaf.setViewState({
              type: 'localgraph',
              state: { file: sourceFilePath }
            });
            logger.debug('[图谱同步] 延迟刷新完成');
          } catch (e) {
            // 忽略延迟刷新的错误
          }
        }
      }, 100);
      
      logger.debug('[图谱同步] 图谱已切换到:', sourceFilePath);
      
    } catch (error) {
      logger.error('[图谱同步] 同步失败:', error);
    }
  }

  //  监听卡片切换，自动同步图谱
  //  增强：添加防抖和更可靠的状态追踪
  let lastSyncedSourceFile = $state<string | null>(null);
  let graphSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  
  $effect(() => {
    //  关键：在条件判断之前先访问所有依赖，建立明确的依赖关系
    const card = currentCard;
    const sourceFile = card?.sourceFile;
    const cardId = card?.uuid;
    const cardIndex = currentCardIndex;
    const graphEnabled = isGraphLinkEnabled;
    const leafRef = graphSyncLeaf;
    
    // 只在图谱联动启用且有源文件时同步
    if (graphEnabled && sourceFile && leafRef) {
      //  防抖：避免快速切换卡片时频繁刷新
      if (graphSyncDebounceTimer) {
        clearTimeout(graphSyncDebounceTimer);
      }
      
      //  检查是否需要同步（源文件变化时才同步）
      if (sourceFile !== lastSyncedSourceFile) {
        graphSyncDebounceTimer = setTimeout(() => {
          logger.debug('[图谱联动] 检测到卡片切换，同步图谱到:', {
            cardId: cardId?.slice(0, 8),
            sourceFile: sourceFile,
            cardIndex: cardIndex,
            previousFile: lastSyncedSourceFile
          });
          
          syncLocalGraphWithCard(sourceFile);
          lastSyncedSourceFile = sourceFile;
        }, 50); // 50ms 防抖延迟
      }
    }
    
    // 清理函数
    return () => {
      if (graphSyncDebounceTimer) {
        clearTimeout(graphSyncDebounceTimer);
      }
    };
  });

  // --- 预览系统回调 ---
  function handleCardTypeDetected(cardType: UnifiedCardType): void {
    logger.debug(`检测到卡片题型: ${cardType}`);
    
    // 直接使用统一题型
    detectedCardType = cardType;

    logger.debug(`统一题型: ${detectedCardType} (${cardTypeDisplayName})`);
  }

  function handlePreviewReady(previewData: any): void {
    logger.debug(`预览就绪:`, previewData);

    // 如果预览数据包含题型信息，更新检测结果
    if (previewData?.cardType) {
      detectedCardType = previewData.cardType;
    }
  }

  // --- 错题集管理 ---
  /**
   * 将当前卡片加入错题集
   */
  async function handleAddToErrorBook() {
    if (!isValidCard(currentCard)) return;

    setCardErrorBookState(currentCard, true);

    // 保存卡片
    const result = await saveCardUnified(currentCard, plugin, {
      operation: '加入错题集',
      showSuccessNotice: true,
      successMessage: '✅ 已加入错题集',
      errorMessage: '❌ 加入错题集失败'
    });

    if (result.success) {
      // 触发界面刷新
      cards = [...cards];
      devLog('debug', `${LOG_PREFIX.ERROR_BOOK} 卡片已加入错题集: ${currentCard.uuid}`);
    }
  }

  /**
   * 将当前卡片移出错题集
   */
  async function handleRemoveFromErrorBook() {
    if (!isValidCard(currentCard)) return;

    setCardErrorBookState(currentCard, false);

    // 保存卡版
    const result = await saveCardUnified(currentCard, plugin, {
      operation: '移出错题集',
      showSuccessNotice: true,
      successMessage: '✅ 已移出错题集',
      errorMessage: '❌ 移出错题集失败'
    });

    if (result.success) {
      // 触发界面刷新
      cards = [...cards];
      devLog('debug', `${LOG_PREFIX.ERROR_BOOK} 卡片已移出错题集: ${currentCard.uuid}`);
    }
  }

  // ============================================
  //  父子卡片功能
  // ============================================

  /**
   * AI拆分父卡片
   * @param actionId AI拆分功能ID，用于查找配置
   * @param targetCount 目标生成数量，0表示让AI自动决定
   * @param positionMap 可选的位置映射 Map<原索引, 卡片ID>，用于重新生成时按原位置替换
   */
  async function handleAISplit(actionId: string, targetCount: number = 0, positionMap?: Map<number, string>) {
    if (!currentCard || aiSplitInProgress) return;

    //  确保牌组数据已加载（修复首次AI拆分时牌组选择器不显示的问题）
    if (decks.length === 0) {
      try {
        const loadedDecks = await dataStorage.getDecks();
        decks = loadedDecks;
        const map = new Map<string, any>();
        for (const d of loadedDecks) map.set(d.id, d.settings);
        deckSettingsMap = map;
        decksLoaded = true;
        logger.debug('[AI拆分] 牌组数据延迟加载完成:', loadedDecks.length);
      } catch (e) {
        logger.warn('[AI拆分] 加载牌组数据失败', e);
      }
    }

    //  从 Store 中查找 AI拆分配置（与 AI格式化使用相同数据源）
    const action = customActions.split.find((a: AIAction) => a.id === actionId);
    if (!action) {
      new Notice(t('studyInterface.notices.aiSplitActionNotFound'));
      return;
    }
    

    // 捕获 currentCard 到局部变量，确保类型安全
    const card = currentCard;
    if (!card) return;

    try {
      aiSplitInProgress = true;
      
      // 区分首次拆分和重新生成
      const isRegeneration = positionMap && positionMap.size > 0;
      if (!isRegeneration) {
        new Notice(t('studyInterface.notices.aiSplitting'));
      }

      //  使用CardAccessor获取内容（处理子卡片）
      let cardContent = '';
      try {
        const cardStore = new CardStoreAdapter(plugin.dataStorage);
        const accessor = new CardAccessor(card, cardStore);
        cardContent = accessor.getContent();
      } catch (error) {
        logger.error('[StudyInterface] CardAccessor获取内容失败:', error);
        cardContent = card.content || '';
      }

      //  统一走 AISplitService（Action驱动提示词：systemPrompt/userPromptTemplate + 变量解析）
      const splitService = new AISplitService(plugin);
      const effectiveTargetCount = targetCount > 0
        ? targetCount
        : (action.splitConfig?.targetCount || 3);
      const splitResult = await splitService.splitCard(
        { ...card, content: cardContent || card.content || '' },
        action,
        {
          targetCount: effectiveTargetCount,
          instruction: resolveDefaultAISplitInstruction(plugin)
        }
      );

      if (!splitResult.success || !splitResult.splitCards || splitResult.splitCards.length === 0) {
        throw new Error(splitResult.error || '拆分失败');
      }

      // 转换为临时卡片数据（用于预览）
      // 使用工具函数获取牌组 ID 和名称
      const { primaryDeckId } = getCardDeckIds(card, decks, { fallbackToReferences: false });
      const targetDeckId = primaryDeckId || card.deckId;
      const targetDeck = decks.find(d => d.id === targetDeckId);
      const targetDeckName = targetDeck?.name;
      
      const tempChildCards: Card[] = splitResult.splitCards.map((child: any, index: number) => {
        // 构建带有 we_decks 的 content
        const bodyContent = child.content || '';
        const contentWithMetadata = targetDeckName 
          ? createContentWithMetadata({ we_decks: [targetDeckName] }, bodyContent)
          : bodyContent;
        
        return {
          uuid: `temp-uuid-${Date.now()}-${index}`,
          deckId: targetDeckId,
          templateId: card.templateId,
          type: CardType.Basic,
          content: contentWithMetadata,
          //  不使用已弃用的fields字段
          tags: child.tags || card.tags || [],
          priority: 0,
          fsrs: {
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            retrievability: 0
          },
          reviewHistory: [],
          stats: {
            totalReviews: 0,
            totalTime: 0,
            averageTime: 0,
            memoryRate: 0
          },
          created: new Date().toISOString(),
          modified: new Date().toISOString()
        };
      });

      // 根据是否有位置映射决定如何更新 childCards
      if (isRegeneration && positionMap) {
        // 重新生成模式：按位置替换卡片
        const newChildCards = [...childCards];
        const positionArray = Array.from(positionMap.keys()).sort((a, b) => a - b);
        
        tempChildCards.forEach((newCard, i) => {
          const targetIndex = positionArray[i];
          if (targetIndex !== undefined && targetIndex < newChildCards.length) {
            newChildCards[targetIndex] = newCard;
          }
        });
        
        childCards = newChildCards;
      } else {
        // 首次拆分模式：直接替换整个数组
        childCards = tempChildCards;
        currentSplitAction = action; //  保存当前使用的AI拆分配置，供重新生成时使用
        
        //  设置默认目标牌组为当前卡片所在的牌组
        // 使用工具函数获取牌组 ID
        targetDeckIdForSplit = primaryDeckId || card.deckId || '';
        
        showChildCardsOverlay = true;
        new Notice(t('studyInterface.notices.aiSplitSuccess', { count: childCards.length }));
      }
    } catch (error) {
      logger.error('[StudyInterface] AI拆分失败:', error);
      new Notice(t('studyInterface.notices.aiSplitFailed', {
        error: error instanceof Error ? error.message : t('study.view.unknownError')
      }));
    } finally {
      aiSplitInProgress = false;
    }
  }

  /**
   * 重新生成子卡片
   * - 如果有选中的卡片：只重新生成选中的部分，未选中的保留
   * - 如果没有选中：全部重新生成
   * - 重新生成的卡片替换原位置，未选中的卡片保持显示（待定状态）
   */
  async function handleRegenerateChildCards() {
    if (!currentCard || !childCardsOverlayRef) return;

    try {
      // 获取选中的卡片ID
      const selectedIds = childCardsOverlayRef.getSelectedCardIds() || [];
      const hasSelection = selectedIds.length > 0;
      
      const isSplitMode = currentSplitAction !== null;

      if (hasSelection) {
        // 有选中：只重新生成选中的，保留未选中的
        const selectedCount = selectedIds.length;
        
        // 创建位置映射 Map<原索引, 卡片ID>
        const positionMap = new Map<number, string>();
        childCards.forEach((card, index) => {
          if (selectedIds.includes(card.uuid)) {
            positionMap.set(index, card.uuid);
          }
        });
        
        new Notice(t('studyInterface.notices.regenerateSelected', {
          count: selectedCount,
          itemType: t('studyInterface.notices.cardsLabel')
        }));
        
        // 将选中的卡片 ID 添加到 regeneratingCardIds（触发 UI 更新）
        regeneratingCardIds = new Set(selectedIds);
        
        // 清空选中状态
        childCardsOverlayRef.clearSelection();
        
        if (isSplitMode && currentSplitAction) {
          await handleAISplit(currentSplitAction.id, selectedCount, positionMap);
        } else {
          new Notice(t('studyInterface.notices.regenerateConfigMissing'));
        }
        
        new Notice(t('studyInterface.notices.regenerateSelectedDone', {
          count: selectedCount,
          itemType: t('studyInterface.notices.cardsLabel')
        }));
      } else {
        // 无选中：全部重新生成
        const totalCount = childCards.length;
        
        // 创建全部卡片的位置映射
        const positionMap = new Map<number, string>();
        childCards.forEach((card, index) => {
          positionMap.set(index, card.uuid);
        });
        
        new Notice(t('studyInterface.notices.regenerateAll', {
          count: totalCount,
          itemType: t('studyInterface.notices.cardsLabel')
        }));
        
        // 将所有卡片 ID 添加到 regeneratingCardIds
        regeneratingCardIds = new Set(childCards.map(card => card.uuid));
        
        // 清空选中状态
        childCardsOverlayRef.clearSelection();
        
        if (isSplitMode && currentSplitAction) {
          await handleAISplit(currentSplitAction.id, totalCount > 0 ? totalCount : 0, positionMap);
        } else {
          new Notice(t('studyInterface.notices.regenerateConfigMissing'));
        }
        
        new Notice(t('studyInterface.notices.regenerateAllDone', {
          count: totalCount,
          itemType: t('studyInterface.notices.cardsLabel')
        }));
      }
    } catch (error) {
      logger.error('[StudyInterface] 重新生成失败:', error);
      new Notice(t('studyInterface.notices.regenerateFailedKeepOriginal'));
    } finally {
      // 清除 regeneratingCardIds 状态（恢复 UI 正常状态）
      regeneratingCardIds = new Set();
    }
  }

  /**
   *  保存AI拆分的子卡片到记忆牌组
   * 建立父子关系，设置cardPurpose='memory'
   */
  async function saveChildCardsToMemoryDeck(
    cards: Card[], 
    parentCard: Card, 
    targetDeckId: string
  ): Promise<number> {
    try {
      const { generateCardUUID } = await import('../../services/identifier/WeaveIDGenerator');
      let savedCount = 0;

      // 获取目标牌组名称
      const memoryDeck = decks.find(d => d.id === targetDeckId);
      const memoryDeckName = memoryDeck?.name;
      
      for (const card of cards) {
        try {
          // 在 content 中写入 we_decks
          let finalContent = card.content;
          if (memoryDeckName && card.content) {
            finalContent = createContentWithMetadata({ we_decks: [memoryDeckName] }, card.content);
          }
          
          //  构造子卡片，设置正确的字段
          const childCard: Card = {
            ...card,
            uuid: generateCardUUID(), // 生成新的UUID
            deckId: targetDeckId, //  使用用户选择的目标牌组
            content: finalContent, // 包含 we_decks 的内容
            cardPurpose: 'memory', //  设置为记忆卡片（非测试卡片）
            
            //  建立父子关系
            parentCardId: parentCard.uuid,
            relationMetadata: {
              isParent: false,
              level: 1,
              derivationMetadata: {
                //  使用DerivationMethod枚举而非字符串
                method: DerivationMethod.AI_SPLIT,
                splitTimestamp: new Date().toISOString(),
                splitReason: currentSplitAction?.name || 'AI拆分'
              }
            },
            
            //  保留其他元数据
            metadata: {
              ...card.metadata,
              sourceCardId: parentCard.uuid,
              sourceDeckId: parentCard.deckId
            },
            
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          };
          
          //  显式删除已弃用的fields字段（防止扩展运算符复制）
          delete (childCard as any).fields;

          // 保存到数据库
          const result = await saveMemoryCardCommand(plugin, childCard, 'create');
          if (result.success) {
            savedCount++;
            logger.debug(`[AI拆分] 已保存子卡片: ${childCard.uuid}`);
          } else {
            logger.error(`[AI拆分] 保存子卡片失败: ${result.error}`);
          }
        } catch (error) {
          logger.error('[AI拆分] 保存单张子卡片失败:', error);
        }
      }

      //  更新父卡片的relationMetadata
      if (savedCount > 0) {
        try {
          const existingChildIds = parentCard.relationMetadata?.childCardIds || [];
          // 使用函数参数 cards，而非未定义的 selectedCards
          const newChildIds = cards.map((c: Card) => c.uuid);
          const updatedParent = {
            ...parentCard,
            relationMetadata: {
              isParent: true,
              level: 0,
              childCardIds: [...existingChildIds, ...newChildIds]
            },
            modified: new Date().toISOString()
          };
          await saveMemoryCardCommand(plugin, updatedParent, 'update');
          logger.debug(`[AI拆分] 已更新父卡片关系: ${parentCard.uuid}`);
        } catch (error) {
          logger.error('[AI拆分] 更新父卡片失败:', error);
        }
      }

      logger.debug(`[AI拆分] 成功保存${savedCount}张子卡片到记忆牌组`);
      return savedCount;
    } catch (error) {
      logger.error('[AI拆分] 保存到记忆牌组失败:', error);
      throw error;
    }
  }

  /**
   * 保存选中的子卡片到记忆牌组
   */
  async function handleSaveSelectedChildCards() {
    if (!currentCard || childCards.length === 0) return;

    try {
      // 获取选中的卡片ID
      const selectedIds = childCardsOverlayRef?.getSelectedCardIds?.() || [];
      
      if (selectedIds.length === 0) {
        new Notice(t('studyInterface.notices.selectCardsFirst'));
        return;
      }

      // 过滤出选中的卡片
      const selectedCards = childCards.filter(card => selectedIds.includes(card.uuid));

      const isSplitMode = currentSplitAction !== null;

      if (isSplitMode) {
        //  AI拂分模式：保存到记忆牌组
        if (!targetDeckIdForSplit) {
          new Notice(t('studyInterface.notices.selectTargetMemoryDeckFirst'));
          return;
        }
        
        new Notice(t('studyInterface.notices.savingToMemoryDeck'));
        const savedCount = await saveChildCardsToMemoryDeck(selectedCards, currentCard, targetDeckIdForSplit);
        new Notice(t('studyInterface.notices.savedToMemoryDeck', { count: savedCount }));
      } else {
        new Notice(t('studyInterface.notices.saveModeUndetermined'));
        return;
      }

      // 关闭浮层
      showChildCardsOverlay = false;
      childCards = [];
      
      //  清除当前使用的AI配置和目标牌组
      currentSplitAction = null;
      targetDeckIdForSplit = '';
      
      // 清空选中状态
      if (childCardsOverlayRef?.clearSelection) {
        childCardsOverlayRef.clearSelection();
      }
    } catch (error) {
      logger.error('[StudyInterface] 保存子卡片失败:', error);
      new Notice(t('study.view.saveFailed', {
        error: error instanceof Error ? error.message : t('study.view.unknownError')
      }));
    }
  }

  /**
   *  处理AI拆分目标牌组选择
   */
  function handleSplitDeckChange(deckId: string) {
    targetDeckIdForSplit = deckId;
    logger.debug('[AI拆分] 选择目标牌组:', deckId);
  }

  /**
   * 关闭子卡片浮层
   */
  function handleCloseChildOverlay() {
    showChildCardsOverlay = false;
    childCards = [];
    
    //  清除当前使用的AI配置和目标牌组
    currentSplitAction = null;
    targetDeckIdForSplit = '';
    
    // 清空选中状态
    if (childCardsOverlayRef?.clearSelection) {
      childCardsOverlayRef.clearSelection();
    }
  }

  // 打开卡片详细信息模态窗，使用全局方法
  function handleOpenViewCardModal() {
    if (!currentCard) return;
    //  使用全局模态窗，支持在其他标签页上方显示
    plugin.openViewCardModal(currentCard, {
      allDecks: decks
    });
  }

  /**
   * 关闭卡片数据结构调试模态窗
   */
  // --- UI控制状态 ---
  const initialViewPrefs = untrack(() => plugin.getStudyInterfaceViewPreferences());
  const hasStoredStudyInterfaceViewPreferences = untrack(() => Boolean(plugin.settings.studyInterfaceViewPreferences));
  const legacySidebarCompactMode =
    !hasStoredStudyInterfaceViewPreferences && typeof window !== 'undefined'
      ? (() => {
          try {
            const savedCompactMode = vaultStorage.getItem('weave-sidebar-compact-mode-setting');
            return savedCompactMode === 'auto' || savedCompactMode === 'fixed' ? savedCompactMode : null;
          } catch (error) {
            logger.debug('[StudyInterface] 恢复localStorage设置失败:', error);
            return null;
          }
        })()
      : null;
  
  let loadBalanceManager = $state<LoadBalanceManager | null>(null);
  
  let showSidebar = $state(initialViewPrefs.showSidebar);
  let statsCollapsed = $state(initialViewPrefs.statsCollapsed);
  let sourceInfoCollapsed = $state(true);
  let showProficiencyStats = $state(false);  // 学习进度统计栏展开状态
  let showTimingInfo = $state(false);
  let showEditModal = $state(false);
  let editTargetCard = $state<Card | null>(null);

  const editorSessionId = `weave-study-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  //  删除功能设置
  let enableDirectDelete = $state(untrack(() => plugin.settings.enableDirectDelete ?? false));

  // 教程按钮显示设置
  
  //  响应式侧边栏紧凑模式控制
  let sidebarCompactMode = $state(false);
  let sidebarResizeObserver: ResizeObserver | null = null;
  let checkTimeoutId: number | null = null; // 防抖定时器
  let lastCheckResult = $state<boolean | null>(null); // 缓存上次检测结果
  let lastContentSize = { width: 0, height: 0 }; // 缓存上次内容尺寸，防止ResizeObserver无限触发
  
  //  侧边栏紧凑模式设置：auto(自动) | fixed(固定显示图标+名称)
  let sidebarCompactModeSetting = $state<'auto' | 'fixed'>(
    legacySidebarCompactMode ?? initialViewPrefs.sidebarCompactModeSetting
  );
  
  // 卡片学习顺序设置
  let cardOrder = $state<'sequential' | 'random'>(initialViewPrefs.cardOrder);
  let choiceOptionOrder = $state<ChoiceOptionOrder>(initialViewPrefs.choiceOptionOrder);

  let ratingLabelStyle = $state<RatingLabelStyle>(
    resolveRatingLabelStyleFromPreferences(
      initialViewPrefs.ratingLabelStyle,
      initialViewPrefs.showRatingIntervalOnButtons
    )
  );
  let skipViewPreferencesAutosave = $state(true);
  isGraphLinkEnabled = initialViewPrefs.graphLinkEnabled === true;
  
  //  监听侧边栏显示/隐藏状态变化，以及模式设置变化，及时重新检测
  $effect(() => {
    // 追踪依赖：showSidebar 和 sidebarCompactModeSetting
    if (showSidebar) {
      if (sidebarCompactModeSetting === 'auto') {
        // 自动模式：延迟重新检测以确保DOM已更新
        setTimeout(() => {
          checkSidebarScrollable();
        }, 100);
      } else if (sidebarCompactModeSetting === 'fixed') {
        // 固定模式：立即设置为紧凑模式
        sidebarCompactMode = true;
        lastCheckResult = true;
      }
    }
  });
  
  // 监听视图偏好状态变化并自动保存（防抖）
  let saveTimeoutId: number | null = null;

  function syncViewPreferencesFromPlugin(): void {
    const prefs = plugin.getStudyInterfaceViewPreferences();
    showSidebar = prefs.showSidebar;
    sidebarCompactModeSetting = prefs.sidebarCompactModeSetting;
    statsCollapsed = prefs.statsCollapsed;
    cardOrder = prefs.cardOrder;
    choiceOptionOrder = prefs.choiceOptionOrder;
    ratingLabelStyle = resolveRatingLabelStyleFromPreferences(
      prefs.ratingLabelStyle,
      prefs.showRatingIntervalOnButtons
    );
    isGraphLinkEnabled = prefs.graphLinkEnabled === true;
  }

  $effect(() => {
    if (skipViewPreferencesAutosave) {
      return;
    }

    // 追踪状态变化
    showSidebar;
    sidebarCompactModeSetting;
    statsCollapsed;
    ratingLabelStyle;
    cardOrder;
    choiceOptionOrder;
    isGraphLinkEnabled;
    
    // 清除之前的定时器
    if (saveTimeoutId !== null) {
      clearTimeout(saveTimeoutId);
    }
    
    // 延迟保存（300ms防抖），避免频繁写入
    saveTimeoutId = window.setTimeout(() => {
      saveViewPreferences();
      saveTimeoutId = null;
    }, 300);
    
    // 清理函数
    return () => {
      if (saveTimeoutId !== null) {
        clearTimeout(saveTimeoutId);
      }
    };
  });
  
  // --- 高级功能状态（渐进式挖空等） ---
  let isPremium = $state(get(premiumGuard.isPremiumActive));

  // 订阅高级版状态变化
  $effect(() => {
    const unsubscribePremium = premiumGuard.isPremiumActive.subscribe(value => {
      isPremium = value;
      logger.debug(`[StudyInterface] 激活状态更新: ${value ? '已激活' : '未激活'}`);
    });

    return () => {
      unsubscribePremium();
    };
  });



  // 注：挖空处理、Hover清理等工具函数已提取到utils/study/studyInterfaceUtils.ts

  // 从 ModernCardTable.svelte 移植并适配的函数 - 增强字段视觉分隔 + 挖空处理 + 错误处理
  function getFieldContent(card: Card, side: 'front' | 'back'): string {
    try {
      // 验证输入参数
      if (!card) {
        logger.warn('getFieldContent: card is null/undefined');
        return `<div class="field-container error-field"><div class="field-label">${t('studyInterface.labels.error')}</div><div class="field-content">${t('studyInterface.errors.invalidCard')}</div></div>`;
      }

      if (!card.uuid) {
        logger.warn('getFieldContent: card has no uuid', card);
        return `<div class="field-container error-field"><div class="field-label">${t('studyInterface.labels.error')}</div><div class="field-content">${t('studyInterface.errors.invalidCardUuid')}</div></div>`;
      }

      // 确保 fields 存在，即使为空对象
      const fields = card.fields || {};
      logger.debug(`getFieldContent: card ${card.uuid}, side ${side}, fields:`, fields);

      // 验证字段数据类型
      if (typeof fields !== 'object' || Array.isArray(fields)) {
        logger.error('getFieldContent: invalid fields structure', { cardId: card.uuid, fields });
        return `<div class="field-container error-field"><div class="field-label">${t('studyInterface.labels.error')}</div><div class="field-content">${t('studyInterface.errors.invalidFields')}</div></div>`;
      }

      // 查找模板，使用新的模板系统
      let template = null;
      try {
        template = availableTemplates?.find(t => t && t.id === card.templateId) || null;
      } catch (templateError) {
        logger.error('getFieldContent: template search failed', templateError);
      }

      // 验证通过后，模板必定存在
      if (!template) {
        logger.debug(`getFieldContent: no template found for ${card.templateId}, using default fields`);
        return handleDefaultFieldContent(fields, side);
      }

      // 使用模板处理字段
      return handleTemplateFieldContent(fields, template, side);

    } catch (error) {
      logger.error('getFieldContent: unexpected error', {
        error: error instanceof Error ? error.message : String(error),
        cardId: card?.uuid || 'unknown',
        side
      });

      return `<div class="field-container error-field">
                <div class="field-label">${t('studyInterface.fieldContent.renderErrorTitle')}</div>
                <div class="field-content">${t('studyInterface.fieldContent.renderErrorBody')}</div>
              </div>`;
    }
  }

  // 处理默认字段内容 - 从getFieldContent中提取出来提高可维护性
  function handleDefaultFieldContent(fields: Record<string, any>, side: 'front' | 'back'): string {
    try {
      // 尝试多种字段名称的组合
      let content = '';
      if (side === 'front') {
        content = fields['question'] || fields['front'] || fields['prompt'] || '';
      } else {
        content = fields['answer'] || fields['back'] || fields['response'] || '';
      }

      logger.debug(`handleDefaultFieldContent: default field content for ${side}:`, content);

      // 验证内容类型
      if (content && typeof content !== 'string') {
        logger.warn('handleDefaultFieldContent: content is not string', { content, type: typeof content });
        content = String(content);
      }

      if (!content || !content.trim()) {
        // 如果默认字段也没有内容，显示所有可用字段
        const availableFields = Object.keys(fields).filter(k => {
          const value = fields[k];
          return !['templateId', 'templateName', 'notes'].includes(k) &&
                 value &&
                 typeof value === 'string' &&
                 value.trim();
        });

        if (availableFields.length > 0) {
          logger.debug(`handleDefaultFieldContent: using first available field: ${availableFields[0]}`);
          content = String(fields[availableFields[0]]);
        } else {
          logger.debug('handleDefaultFieldContent: no content found in any field');
          return `<div class="field-container error-field">
                    <div class="field-label">${t('studyInterface.fieldContent.noContentTitle')}</div>
                    <div class="field-content">${side === 'front' ? t('studyInterface.fieldContent.noFrontContent') : t('studyInterface.fieldContent.noBackContent')}</div>
                  </div>`;
        }
      }

      // 应用挖空处理，传递showAnswer状态
      const processedContent = processClozeText(content, side, showAnswer);

      // 为默认字段添加标签
      const label = side === 'front' ? t('studyInterface.fieldContent.frontLabel') : t('studyInterface.fieldContent.backLabel');
      return `<div class="field-container default-field">
                <div class="field-label">${label}</div>
                <div class="field-content">${processedContent}</div>
              </div>`;

    } catch (error) {
      logger.error('handleDefaultFieldContent: error processing default fields', error);
      return `<div class="field-container error-field">
                <div class="field-label">${t('studyInterface.fieldContent.processingErrorTitle')}</div>
                <div class="field-content">${t('studyInterface.fieldContent.defaultFieldFailed')}</div>
              </div>`;
    }
  }
  // 处理模板字段内容 - 从getFieldContent中提取出来提高可维护性
  function handleTemplateFieldContent(fields: Record<string, any>, template: any, side: 'front' | 'back'): string {
    try {
      // 验证模板结构
      if (!template || !template.fields || !Array.isArray(template.fields)) {
        logger.error('handleTemplateFieldContent: invalid template structure', template);
        return handleDefaultFieldContent(fields, side);
      }

      logger.debug(`handleTemplateFieldContent: using template ${template.name}`);

      // 根据模板组合字段，为每个字段创建独立的视觉容器
      const relevantFields = template.fields
        .filter((f: any) => {
          try {
            return f && f.type === 'field' && (f.side === side || f.side === 'both');
          } catch (error) {
            logger.warn('handleTemplateFieldContent: field filter error', error);
            return false;
          }
        })
        .filter((f: any) => {
          try {
            const field = f as any; // FieldTemplateField类型
            const fieldValue = fields[field.key];
            const hasContent = fieldValue && typeof fieldValue === 'string' && fieldValue.trim();
            logger.debug(`handleTemplateFieldContent: field ${field.key} has content:`, hasContent);
            return hasContent;
          } catch (error) {
            logger.warn('handleTemplateFieldContent: field content check error', error);
            return false;
          }
        }) // 过滤掉空值或未定义的字段
        .map((f: any) => {
          try {
            const field = f as any; // FieldTemplateField类型
            const content = String(fields[field.key] || '');
            const label = field.name || field.key;

            // 应用挖空处理，传递showAnswer状态
            const processedContent = processClozeText(content, side, showAnswer);

            return `<div class="field-container template-field" data-field-key="${field.key}">
                      <div class="field-label">${label}</div>
                      <div class="field-content">${processedContent}</div>
                    </div>`;
          } catch (error) {
            logger.error('handleTemplateFieldContent: field mapping error', error);
            return '';
          }
        })
        .filter(Boolean); // 过滤掉空字符串

      logger.debug(`handleTemplateFieldContent: found ${relevantFields.length} relevant fields for ${side}`);

      if (relevantFields.length === 0) {
        logger.debug(`handleTemplateFieldContent: no relevant fields found for ${side}, using fallback`);
        return handleFallbackFieldContent(fields, side);
      }

      return relevantFields.join('');

    } catch (error) {
      logger.error('handleTemplateFieldContent: unexpected error', error);
      return handleDefaultFieldContent(fields, side);
    }
  }

  // 处理降级字段内容 - 当模板字段都为空时使用
  function handleFallbackFieldContent(fields: Record<string, any>, side: 'front' | 'back'): string {
    try {
      // 如果模板中没有匹配的字段，显示所有可用字段
      const availableFields = Object.keys(fields).filter(k => {
        try {
          const value = fields[k];
          return !['templateId', 'templateName', 'notes'].includes(k) &&
                 value &&
                 typeof value === 'string' &&
                 value.trim();
        } catch (error) {
          logger.warn('handleFallbackFieldContent: field check error', error);
          return false;
        }
      });

      if (availableFields.length > 0) {
        return availableFields.map(key => {
          try {
            const content = String(fields[key]);
            const processedContent = processClozeText(content, side, showAnswer);
            return `<div class="field-container fallback-field" data-field-key="${key}">
                      <div class="field-label">${key}</div>
                      <div class="field-content">${processedContent}</div>
                    </div>`;
          } catch (error) {
            logger.error('handleFallbackFieldContent: field processing error', error);
            return '';
          }
        }).filter(Boolean).join('');
      } else {
        return `<div class="field-container error-field">
                  <div class="field-label">${t('studyInterface.fieldContent.noContentTitle')}</div>
                  <div class="field-content">${side === 'front' ? t('studyInterface.fieldContent.noDisplayableFrontContent') : t('studyInterface.fieldContent.noDisplayableBackContent')}</div>
                </div>`;
      }
    } catch (error) {
      logger.error('handleFallbackFieldContent: unexpected error', error);
      return `<div class="field-container error-field">
                <div class="field-label">${t('studyInterface.fieldContent.processingErrorTitle')}</div>
                <div class="field-content">${t('studyInterface.fieldContent.fallbackFieldFailed')}</div>
              </div>`;
    }
  }

  // enhanceEmbeds已提取到utils/study/studyInterfaceUtils.ts
  const sourceLocateOverlay = getSourceLocateOverlayService();
  const sourceNavigationService = untrack(() => new SourceNavigationService(plugin.app));

  function stripMarkdownLocateSyntax(line: string): string {
    return String(line || '')
      .replace(/\s*\^[a-zA-Z0-9-]+\s*$/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+\.\s+/, '')
      .replace(/^\s*\[[ xX]\]\s+/, '')
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/`+/g, '')
      .trim();
  }

  async function resolveBlockLocateContext(file: any, blockId: string): Promise<{
    lines: string[];
    targetLine: number;
    blockStartLine: number;
    blockContent: string;
    locateTextCandidates: string[];
  }> {
    const content = await plugin.app.vault.read(file);
    const lines = content.split('\n');

    let targetLine = -1;
    let blockStartLine = -1;
    const blockLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes(`^${blockId}`)) {
        continue;
      }

      targetLine = i;
      for (let j = i; j >= 0; j--) {
        if (lines[j].trim() && !lines[j].includes(`^${blockId}`)) {
          blockStartLine = j;
          break;
        }
      }

      if (blockStartLine >= 0) {
        for (let k = blockStartLine; k <= i; k++) {
          const cleanedLine = stripMarkdownLocateSyntax(lines[k]);
          if (cleanedLine) {
            blockLines.push(cleanedLine);
          }
        }
      }
      break;
    }

    const blockContent = blockLines.join(' ').trim();
    const locateTextCandidates = Array.from(new Set([
      blockContent,
      ...blockLines,
    ].map((item) => String(item || '').trim()).filter((item) => item.length >= 8)));

    return {
      lines,
      targetLine,
      blockStartLine,
      blockContent,
      locateTextCandidates,
    };
  }

  function getEditorSelectionRect(containerEl: HTMLElement | null | undefined): DOMRect | null {
    if (!containerEl) return null;

    const selectionEls = Array.from(
      containerEl.querySelectorAll('.cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground')
    ) as HTMLElement[];
    if (selectionEls.length === 0) {
      return null;
    }

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const el of selectionEls) {
      const rect = el.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        continue;
      }
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }

    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
      return null;
    }

    return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
  }

  // Handle block link click - navigate to Obsidian file and block with highlighting
  function handleBlockLinkClick(blockLink: string) {
    try {
      const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
      // Parse block link format: [[filename#^block-id]] or [[filename#^block-id|alias]]
      const match = blockLink.match(/\[\[([^#]+)#\^([^|\]]+)(?:\|[^\]]+)?\]\]/);
      if (!match) {
        logger.debug('Invalid block link format:', blockLink);
        new Notice(t('studyInterface.notices.invalidBlockLink'));
        return;
      }

      const [, fileName, blockId] = match;

      // Find the file
      const files = plugin.app.vault.getMarkdownFiles();
      const file = files.find(f => f.basename === fileName || f.name === fileName + '.md');

      if (!file) {
        logger.debug('File not found:', fileName);
        new Notice(t('studyInterface.notices.fileNotFound', { fileName }));
        return;
      }

      // Open the file and navigate to the block with enhanced targeting
      const linkText = `${file.basename}#^${blockId}`;
      openLinkWithExistingLeaf(plugin.app, linkText, contextPath, { openInNewTab: true, focus: true }).then(async (openedLeaf) => {
        // Wait a bit longer to ensure file is fully loaded
        setTimeout(async () => {
          const activeView = (openedLeaf?.view?.getViewType?.() === 'markdown'
            ? openedLeaf.view
            : plugin.app.workspace.getActiveViewOfType('markdown' as any)) as any;
          let blockContext: Awaited<ReturnType<typeof resolveBlockLocateContext>> | null = null;
          try {
            blockContext = await resolveBlockLocateContext(file, blockId);
          } catch (readError) {
            logger.error('Error reading file content for source locate:', readError);
          }

          const locateCandidates = [
            blockLink,
            `${fileName}#^${blockId}`,
            blockId,
            `^${blockId}`,
            file.path,
            ...(blockContext?.locateTextCandidates || [])
          ];

          const locatedInPreview = await sourceNavigationService.locateInMarkdownView(activeView, [
            ...locateCandidates
          ], { label: t('studyInterface.notices.locatedSource'), icon: 'map-pinned' });
          if (locatedInPreview) {
            new Notice(t('studyInterface.notices.locatedSource'));
            return;
          }
          if (activeView && (activeView as any).editor) {
            const editor = (activeView as any).editor;

            try {
              const lines = blockContext?.lines || [];
              const targetLine = blockContext?.targetLine ?? -1;
              const blockStartLine = blockContext?.blockStartLine ?? -1;
              const blockContent = blockContext?.blockContent || '';

              if (targetLine >= 0) {
                // Navigate to the target line
                const cursorLine = blockStartLine >= 0 ? blockStartLine : targetLine;
                editor.setCursor({ line: cursorLine, ch: 0 });
                editor.scrollIntoView({
                  from: { line: cursorLine, ch: 0 },
                  to: { line: targetLine, ch: lines[targetLine].length }
                });

                window.setTimeout(() => {
                  try {
                    const selectionRect = getEditorSelectionRect((activeView as any)?.containerEl as HTMLElement | null);
                    const lineEl = (activeView as any)?.containerEl?.querySelector('.cm-active, .cm-line') as HTMLElement | null;
                    const rect = selectionRect || lineEl?.getBoundingClientRect();
                    if (rect) {
                      sourceLocateOverlay.showAtRect(rect, { label: t('studyInterface.notices.locatedSource'), icon: 'map-pinned' });
                    }
                  } catch (_e) { /* ignore */ }
                }, 120);

                // Highlight the content if we found it
                if (blockStartLine >= 0 && blockContent) {
                  // Select the block content for visual feedback
                  const startCh = 0;
                  const endLine = targetLine;
                  const endCh = lines[targetLine].replace(/\s*\^[a-zA-Z0-9-]+\s*$/, '').length;

                  editor.setSelection(
                    { line: blockStartLine, ch: startCh },
                    { line: endLine, ch: endCh }
                  );

                  // Clear selection after a moment to show highlight effect
                  setTimeout(() => {
                    editor.setCursor({ line: cursorLine, ch: 0 });
                  }, 1000);

                  new Notice(t('studyInterface.notices.locatedBlockContent', {
                    content: `${blockContent.slice(0, 50)}${blockContent.length > 50 ? '...' : ''}`
                  }));
                } else {
                  new Notice(t('studyInterface.notices.locatedBlockReference'));
                }
              } else {
                logger.debug(`Block reference ^${blockId} not found in file`);
                new Notice(t('studyInterface.notices.blockReferenceNotFound', { blockId }));
              }
            } catch (readError) {
              logger.error('Error reading file content:', readError);
              new Notice(t('studyInterface.notices.readFileFailed'));
            }
          } else {
            logger.debug('Could not access markdown editor');
            new Notice(t('studyInterface.notices.markdownEditorUnavailable'));
          }
        }, 200);
      }).catch(error => {
        logger.error('Error opening file:', error);
        new Notice(t('studyInterface.notices.openFileFailed'));
      });

    } catch (error) {
      logger.error('Error handling block link click:', error);
      new Notice(t('studyInterface.notices.handleBlockLinkFailed'));
    }
  }

  // --- 编辑器状态 ---
  let editorPoolManager: EmbeddableEditorManager | null = $state(null);
  let editorUnavailable = $state(false);
  let isClozeMode = $state(false);

  function populateStudyPaneMenu(menu: Menu): void {
    if (!currentCard) {
      return;
    }

    const callbacks: MenuCallbacks = {
      onToggleEdit: () => {
        showEditModal = !showEditModal;
      },
      onDelete: (skipConfirm) => {
        handleDeleteCard(skipConfirm);
      },
      onSetReminder: handleSetReminder,
      onChangePriority: handleMobilePriorityChange,
      onChangeDeck: handleChangeDeck,
      onRecycleCard: suspendCurrentCard,
      onSplitCard: (actionId) => handleAISplit(actionId, 0),
      onOpenAIConfig: openAIActionManagerWithObsidianAPI,
      onGraphLinkToggle: handleGraphLinkToggle,
      onOpenDetailedView: handleOpenViewCardModal,
      onOpenSourceBlock: handleOpenSourceBlock,
      onToggleTimingInfo: () => {
        showTimingInfo = !showTimingInfo;
      },
      onMediaAutoPlayChange: handleMediaAutoPlayChange,
      onDirectDeleteToggle: handleDirectDeleteToggle,
      onCardOrderChange: handleCardOrderChange,
      onChoiceOptionOrderChange: handleChoiceOptionOrderChange,
      onRatingLabelStyleChange: handleRatingLabelStyleChange,
      onTimerAutoPauseChange: handleTimerAutoPauseChange,
      onClozeModeSwitchButtonToggle: handleClozeModeSwitchButtonToggle,
    };

    populateStudyToolbarMenuSession(menu, {
      card: currentCard,
      decks,
      isPremium,
      isGraphLinked: isGraphLinkEnabled,
      enableDirectDelete,
      showTimingInfo,
      autoPlayMedia,
      playMediaMode,
      playMediaTiming,
      playbackInterval,
      cardOrder,
      choiceOptionOrder,
      ratingLabelStyle,
      timerAutoPauseSeconds,
      showClozeModeSwitchButton,
      aiSplitActions: customActions.split || [],
      callbacks,
    });
  }

  // 初始化编辑器管理器和模板数据
  onMount(async () => {
    try {
      syncViewPreferencesFromPlugin();
      if (legacySidebarCompactMode) {
        await persistStudyInterfaceViewPreferences({
          sidebarCompactModeSetting: legacySidebarCompactMode,
        });
      }
      skipViewPreferencesAutosave = false;

      // 使用插件实例中的嵌入式编辑器管理器
      editorPoolManager = plugin.editorPoolManager;

      // 加载模板数据
      await loadTemplateData();
      
      if (viewInstance && typeof viewInstance.setPopulatePaneMenuCallback === 'function') {
        viewInstance.setPopulatePaneMenuCallback(populateStudyPaneMenu);
        logger.debug('[StudyInterface] 📱 官方更多菜单填充回调已设置到 StudyView');
      }

      if (viewInstance && typeof viewInstance.setMobilePanelStateGetter === 'function') {
        viewInstance.setMobilePanelStateGetter(() => ({
          showProficiencyStats,
          statsExpanded: !statsCollapsed,
        }));
      }
      
      //  设置展开/折叠统计栏回调
      if (viewInstance && typeof viewInstance.setToggleStatsCallback === 'function') {
        viewInstance.setToggleStatsCallback(() => {
          // 互斥逻辑：展开 FSRS 信息栏时，折叠学习进度栏
          if (statsCollapsed) {
            // 当前是折叠状态，要展开
            showProficiencyStats = false;  // 先折叠学习进度栏
            statsCollapsed = false;  // 再展开FSRS信息栏
          } else {
            // 当前是展开状态，要折叠
            statsCollapsed = true;
          }
        });
        logger.debug('[StudyInterface] 📱 展开/折叠统计栏回调已设置到 StudyView');
      }
      
      //  设置展开/折叠学习进度统计栏回调
      if (viewInstance && typeof viewInstance.setToggleProficiencyStatsCallback === 'function') {
        viewInstance.setToggleProficiencyStatsCallback(() => {
          // 互斥逻辑：展开学习进度栏时，折叠 FSRS 信息栏
          if (!showProficiencyStats) {
            // 当前是折叠状态，要展开
            statsCollapsed = true;  // 先折叠FSRS信息栏
            showProficiencyStats = true;  // 再展开学习进度栏
          } else {
            // 当前是展开状态，要折叠
            showProficiencyStats = false;
          }
        });
        logger.debug('[StudyInterface] 📱 展开/折叠学习进度统计栏回调已设置到 StudyView');
      }
      
    } catch (error) {
      logger.error('Failed to initialize editor manager:', error);
    }
  });

  // 加载模板数据
  async function loadTemplateData() {
    try {
      // 从插件设置中获取模板数据
      const settings = plugin.settings;
      if (settings?.simplifiedParsing?.templates) {
        availableTemplates = settings.simplifiedParsing.templates;
        fieldTemplates = settings.simplifiedParsing.templates; // 同步更新 fieldTemplates
        logger.debug('已加载模板数据:', availableTemplates.length, '个模板');
      } else {
        logger.warn('[StudyModal] 未找到模板数据');
        availableTemplates = [];
        fieldTemplates = [];
      }
    } catch (error) {
      logger.error('[StudyModal] 加载模板数据失败:', error);
      availableTemplates = [];
      fieldTemplates = [];
    }
  }

  // --- 学习会话数据 ---
  let session = $state<StudySession>({
    id: generateId(),
    deckId: untrack(() => sessionDeckId || ""),  // 优先绑定当前学习牌组，避免引用式牌组统计错位
    startTime: new Date(),
    cardsReviewed: 0,
    newCardsLearned: 0,
    correctAnswers: 0,
    totalTime: 0,
    cardReviews: []
  });

  function setSessionCompletionStatus(reason: "completed" | "paused-until-next-due", pendingNextDueAt?: string) {
    session.completionReason = reason;
    session.pendingNextDueAt = pendingNextDueAt;
  }

  // 牌组设置缓存
  // --- 牌组设置 ---
  let deckSettingsMap = $state(new Map<string, any>());

  function resolveMemorySchedulingForCard(card: Card): LearningConfig {
    return resolveCardMemoryScheduling({
      card,
      decks,
      deckSettingsMap,
      globalSettings: plugin.settings
    });
  }

  const memoryStudySessionController = createMemoryStudySessionController({
    getFsrs: () => fsrs,
    getMode: () => mode,
    state: {
      getCurrentCard: () => currentCard,
      getShowAnswer: () => showAnswer,
      setShowAnswer: (value) => {
        showAnswer = value;
      },
      getCurrentCardIndex: () => currentCardIndex,
      setCurrentCardIndex: (value) => {
        currentCardIndex = value;
      },
      getCardStartTime: () => studyTimer.getStartTime(),
      setCardStartTime: (value) => {
        studyTimer.setStartTime(value);
      },
      getResponseTimeMs: () => studyTimer.getResponseTimeMs(),
      getStudyQueue: () => studyQueue,
      setStudyQueue: (queue) => {
        studyQueue = queue;
      },
      getQueueInitialized: () => queueInitialized,
      getSession: () => session,
      getSessionStudiedCards: () => sessionStudiedCards,
      setTimerPaused: (value) => {
        studyTimer.setPaused(value);
      }
    },
    getLearningConfigForCard: (card) => resolveMemorySchedulingForCard(card),
    applyLearningScheduling,
    saveReviewSnapshot: ({ card, rating, responseTime, currentCardIndex, session }) => {
      const snapshotFsrs = card.fsrs;
      if (!snapshotFsrs) {
        throw new Error(t('studyInterface.errors.reviewSnapshotMissingFsrs'));
      }

      const snapshot: ReviewSnapshot = {
        cardIndex: currentCardIndex,
        cardId: card.uuid,
        cardSnapshot: {
          fsrs: snapshotFsrs,
          reviewHistory: card.reviewHistory || [],
          stats: card.stats || {
            totalReviews: 0,
            totalTime: 0,
            averageTime: 0,
            memoryRate: 0
          },
          modified: card.modified || new Date().toISOString()
        },
        sessionSnapshot: {
          cardsReviewed: session.cardsReviewed,
          newCardsLearned: session.newCardsLearned,
          correctAnswers: session.correctAnswers,
          totalTime: session.totalTime
        },
        reviewInfo: {
          rating,
          timestamp: Date.now(),
          responseTime
        }
      };

      reviewUndoManager.saveSnapshot(snapshot);
      updateUndoCount();
    },
    updateReviewStats: (card, rating, responseTime) => {
      updateFSRS6Statistics(card, rating, responseTime);
      updateMemorySuccessRate(card, rating);
      updateChoiceQuestionStats(card, rating, responseTime);
    },
    persistRatedCard: async (card) => {
      if (isStagingSession) {
        onStagingCardReviewed?.(card);
        return;
      }
      await runWithMemoryStudyDataChangeContext(card.deckId, () =>
        saveMemoryCardCommand(plugin, card, 'update')
      );
    },
    afterCardPersisted: async () => {
      progressBarRefreshTrigger++;
      logger.debug('Card saved, triggering progress bar refresh:', progressBarRefreshTrigger);
    },
    onInvalidFsrs: () => {
      logger.error('[StudyModal] fsrs is undefined, cannot rate card');
      new Notice(t('studyInterface.notices.ratingDataInvalid'));
    },
    onBeforeAdvance: async () => {
      if (showEditModal) {
        logger.debug('切换卡片前退出编辑模式');
        handleEditorCancel();
        await tick();
      }
    },
    onAfterAdvance: async ({ movedCount, nextIndex, nextPendingDueAt }) => {
      if (movedCount > 0) {
        logger.debug('[StudyModal] Deferred future-due cards in session queue', {
          movedCount,
          nextIndex,
          nextCardId: studyQueue[currentCardIndex]?.uuid,
          nextPendingDueAt
        });
      }

      if (plugin?.settings?.enableDebugMode) {
        logger.debug('[StudyModal] Card index updated:', {
          to: currentCardIndex,
          newCardId: studyQueue[currentCardIndex]?.uuid
        });
      }

      if (autoPlayMedia && playMediaTiming === 'cardChange') {
        autoPlayMediaFiles();
      }

      if (plugin.settings.autoShowAnswerSeconds > 0) {
      }
    },
    setSessionCompletionStatus,
    onFinishSession: async (finishedSession) => {
      reviewUndoManager.clear();
      updateUndoCount();

      if (isStagingSession) {
        onStagingSessionComplete?.();
        return;
      }

      try {
        await runWithMemoryStudyDataChangeContext(finishedSession.deckId, () => dataStorage.saveStudySession(finishedSession));
      } catch (e) {
        logger.error("保存学习会话失败", e);
      }

      // 由 StudyViewWrapper 在庆祝窗关闭后关闭学习视图；不在此处调用 onClose，避免与庆祝窗状态竞态
      onComplete(finishedSession);
    },
    shouldSkipLearningStepsInsertion: () => isStagingSession,
  });

  export function getQueueProgress() {
    return memoryStudySessionController.getQueueProgress();
  }

  export function getSessionData() {
    return memoryStudySessionController.getSessionSnapshot();
  }

  export function shouldPersist() {
    if (isStagingSession) {
      return false;
    }
    return memoryStudySessionController.shouldPersist();
  }

  //  从学习队列获取当前卡片（支持渐进式挖空）
  let currentCard = $derived.by(() => {
    if (Array.isArray(studyQueue) && currentCardIndex >= 0 && currentCardIndex < studyQueue.length) {
      const instance = studyQueue[currentCardIndex];
      // 添加调试日志
      if (plugin?.settings?.enableDebugMode) {
        logger.debug('[StudyModal] currentCard updated:', {
          cardId: instance?.uuid,
          isProgressiveCloze: isProgressiveClozeChild(instance),
          activeClozeOrd: isProgressiveClozeChild(instance) ? instance.clozeOrd : undefined,
          currentCardIndex,
          queueLength: studyQueue.length
        });
      }
      return instance;
    }
    return undefined;
  });

  // 提取当前卡片的激活挖空序号（渐进式挖空专用）
  let activeClozeOrdinal = $derived.by(() => {
    if (!currentCard) return undefined;
    
    // V2架构：从渐进式挖空子卡片提取激活序号
    if (isProgressiveClozeChild(currentCard)) {
      // clozeOrd 是 0-based，需要转换为 1-based 供 ObsidianRenderer 使用
      return currentCard.clozeOrd + 1;
    }
    
    return undefined;
  });

  let currentIndexDisplay = $derived.by(() => {
    // 使用 studyQueue 的长度（支持渐进式挖空展开）
    return studyQueue.length > 0 ? Math.min(currentCardIndex + 1, studyQueue.length) : 0;
  });

  let remainingCards = $derived.by(() => {
    // 使用 studyQueue 的长度（支持渐进式挖空展开）
    return Math.max(0, studyQueue.length - currentCardIndex);
  });

  let progress = $derived.by(() => {
    // 使用 studyQueue 的长度（支持渐进式挖空展开）
    if (studyQueue.length === 0) return 100;
    const displayIndex = currentIndexDisplay;
    const ratio = displayIndex / studyQueue.length;
    return Math.max(0, Math.min(100, ratio * 100));
  });

  // 优先显示进入学习时的牌组名，避免多牌组卡片把标题带偏
  let currentDeckName = $derived.by(() => {
    if (forcedDeckName) {
      return forcedDeckName;
    }

    const sessionDeck = session.deckId ? decks.find(x => x.id === session.deckId) : null;
    if (sessionDeck?.name) {
      return sessionDeck.name;
    }

    const card = currentCard;
    if (card) {
      // 会话牌组不可用时，才回退到卡片自身的关联牌组名称
      const service = getCardMetadataService();
      const names = service.getCardDeckNames(card);
      return names.length > 0 ? names[0] : '';
    }

    return '';
  });
  
  // 获取当前卡片所属的牌组列表。
  let currentCardReferencedDecks = $derived.by(() => {
    const card = currentCard;
    if (!card) {
      return [];
    }

    const { deckIds } = getCardDeckIds(card, decks, { fallbackToReferences: false });
    if (deckIds.length === 0) {
      return [];
    }

    return deckIds
      .map(deckId => {
        const deck = decks.find(d => d.id === deckId);
        return deck ? { id: deckId, name: deck.name } : null;
      })
      .filter((d): d is { id: string; name: string } => d !== null);
  });
  
  // 是否显示多牌组引用标识
  let hasMultipleReferences = $derived(currentCardReferencedDecks.length > 1);
  
  //  直接订阅Store（自动响应）
  let customActions = $derived($customActionsForMenu);
  
  //  获取可撤销次数
  let undoCount = $state(0);
  
  // 更新撤销计数（需要手动触发）
  function updateUndoCount() {
    undoCount = reviewUndoManager.getUndoCount();
  }
  
  //  同步编辑模式状态到 StudyView（用于移动端顶部栏按钮切换）
  $effect(() => {
    if (viewInstance && typeof viewInstance.updateEditMode === 'function') {
      viewInstance.updateEditMode(showEditModal);
    }
  });
  
  //  同步当前卡片源文件到 StudyView（用于移动端图谱联动按钮）
  $effect(() => {
    if (viewInstance && typeof viewInstance.updateCurrentSourceFile === 'function') {
      viewInstance.updateCurrentSourceFile(currentCard?.sourceFile || null);
    }
  });
  
  //  设置保存回调（用于移动端顶部栏保存按钮）
  $effect(() => {
    if (viewInstance && typeof viewInstance.setSaveCallback === 'function') {
      viewInstance.setSaveCallback(async () => {
        // 调用 handleToggleEdit 保存并退出编辑模式
        await handleToggleEdit();
      });
    }
  });

  let timerAutoPauseSeconds = $state(untrack(() => plugin.settings.timerAutoPauseSeconds ?? 60));

  $effect(() => {
    const autoPauseSeconds = timerAutoPauseSeconds;
    studyTimer.setAutoPauseSeconds(autoPauseSeconds);
    studyTimer.setOnAutoPaused(() => {
      const duration = autoPauseSeconds >= 60
        ? t('studyInterface.intervals.minutes', { n: String(autoPauseSeconds / 60) })
        : t('studyInterface.intervals.seconds', { n: String(autoPauseSeconds) });
      new Notice(t('studyInterface.notices.timerAutoPaused', { duration }), 3000);
    });
  });

  let averageTime = $state(0);

  $effect(() => {
    if (session.cardReviews.length === 0) {
      averageTime = 0;
    } else {
      const totalTime = session.cardReviews.reduce((sum, review) => sum + review.responseTime, 0);
      averageTime = totalTime / session.cardReviews.length;
    }
  });

  // 进度条刷新触发器
  let progressBarRefreshTrigger = $state(0);

  // 独立的学习配置更新 $effect
  $effect(() => {
    const card = currentCard;
    learningConfig = card
      ? resolveMemorySchedulingForCard(card)
      : normalizeMemorySchedulingSettings((plugin as any)?.settings || {}).settings;
  });

  // 学习会话管理 - 当卡片变化时创建新会话
  $effect(() => {
    const card = currentCard;

    if (!card?.uuid) {
      const staleSessionId = untrack(() => currentSessionId);
      if (staleSessionId) {
        sessionManager.dispose(staleSessionId);
        currentSessionId = null;
      }
      return;
    }

    const learningSteps =
      learningConfig?.learningSteps ?? [...DEFAULT_MEMORY_SCHEDULING_SETTINGS.learningSteps];
    const relearningSteps =
      learningConfig?.relearningSteps ?? [...DEFAULT_MEMORY_SCHEDULING_SETTINGS.relearningSteps];
    const sessionId = sessionManager.createSession(card, learningSteps, relearningSteps);

    currentSessionId = sessionId;

    return () => {
      sessionManager.dispose(sessionId);
      if (untrack(() => currentSessionId) === sessionId) {
        currentSessionId = null;
      }
    };
  });

  // 模板驱动的预览字段生成 - 已被新系统替代
  function handleTemplateMenuPosition() {
    try {
      // 使用实际宽度再次精确定位（始终显示在按钮左侧，避免遮挡功能键）
      if (lastTemplateAnchor && templateMenuEl) {
        const width = templateMenuEl.offsetWidth || UI_CONSTANTS.ESTIMATED_WIDTH;
        const height = templateMenuEl.offsetHeight || 200;

        // 水平定位：确保在按钮左侧且不遮挡其他功能键
        const candidateLeft = lastTemplateAnchor.left - width - UI_CONSTANTS.GAP;
        const safeLeft = Math.max(8, Math.min(candidateLeft, window.innerWidth - width - 8));
        templateMenuLeft = Math.round(safeLeft);

        // 垂直定位：避免遮挡上下功能键，优先向上展开
        const buttonCenterY = lastTemplateAnchor.top + lastTemplateAnchor.height / 2;
        const BUTTON_HEIGHT = 48; // 功能键高度估算
        const BUTTON_GAP = 8;     // 功能键间距

        // 尝试向上展开（菜单底部对齐按钮中心）
        let candidateTop = buttonCenterY - height + BUTTON_HEIGHT / 2;

        // 如果向上空间不足，改为向下展开
        if (candidateTop < 12) {
          candidateTop = buttonCenterY - BUTTON_HEIGHT / 2;
        }

        // 最终安全边界检查
        const safeTop = Math.max(12, Math.min(candidateTop, window.innerHeight - height - 12));
        templateMenuTop = Math.round(safeTop);
      }

      logger.debug(`显示模板列表，共 ${templateList.length} 个模板`, {
        anchorRect: lastTemplateAnchor,
        left: templateMenuLeft,
        top: templateMenuTop
      });
    } catch (error) {
      logger.error('[StudyModal] 获取模板列表失败:', error);
      templateList = [];
      showTemplateList = true;
    }
  }

  function handleCloseTemplateList() {
    showTemplateList = false;
  }

  function closeOnBackdropClick(event: MouseEvent, close: () => void) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  function closeOnEscape(event: KeyboardEvent, close: () => void) {
    if (event.key === 'Escape') {
      close();
    }
  }

  // 处理模板选择
  function handleTemplateSelect(template: ParseTemplate) {
    logger.debug('选择模板:', template.name);
    // 这里可以添加模板切换逻辑
    showTemplateList = false;
    new Notice(t('studyInterface.notices.templateSelected', { name: template.name }));
  }

  /**
   *  更新 cards 数组中的当前卡片
   * 
   * V2架构：所有实例都是真实Card对象，直接更新
   * 
   * @param updatedCard 更新后的卡片数据
   */
  function updateCurrentCardInCardsArray(updatedCard: Card) {
    // V2架构：所有实例都是真实Card对象
    const actualCard = currentCard;
    
    if (!actualCard) return;
    
    // 在 cards 数组中找到这张卡片的索引
    const cardIndex = cards.findIndex(c => c.uuid === actualCard.uuid);
    
    if (cardIndex >= 0) {
      // 更新 cards 数组
      cards[cardIndex] = updatedCard;
      cards = [...cards];  // 触发响应式更新，studyQueue 会自动重新生成
    }
  }

  function extractClozeOrdinals(content: string): number[] {
    const ordinals = new Set<number>();
    const clozePattern = /\{\{c(\d+)::/g;
    let match: RegExpExecArray | null;

    while ((match = clozePattern.exec(content)) !== null) {
      const ord = Number.parseInt(match[1], 10);
      if (Number.isFinite(ord) && ord >= 1) {
        ordinals.add(ord);
      }
    }

    return Array.from(ordinals).sort((a, b) => a - b);
  }

  function buildProgressiveClozeSaveNotice(
    previousEditTarget: Card | null,
    persistedCard: Card,
    newlyAddedChildren: ProgressiveClozeChildCard[]
  ): string | null {
    const previousOrdinals = previousEditTarget ? extractClozeOrdinals(previousEditTarget.content || '') : [];
    const nextOrdinals = extractClozeOrdinals(persistedCard.content || '');

    const previousOrdinalSet = new Set(previousOrdinals);
    const nextOrdinalSet = new Set(nextOrdinals);

    const removedOrdinals = previousOrdinals.filter(ord => !nextOrdinalSet.has(ord));
    const addedOrdinals = nextOrdinals.filter(ord => !previousOrdinalSet.has(ord));
    const retainedOrdinals = nextOrdinals.filter(ord => previousOrdinalSet.has(ord));

    const parts: string[] = [];

    if (addedOrdinals.length > 0) {
      const labels = addedOrdinals.map(ord => `c${ord}`).join('、');
      parts.push(`已新增子卡片 ${labels}，并通过 UUID 加入当前牌组引用`);
    }

    if (removedOrdinals.length > 0) {
      const labels = removedOrdinals.map(ord => `c${ord}`).join('、');
      parts.push(`已删除子卡片 ${labels}，对应子卡片及其复习历史已删除`);
    }

    if (addedOrdinals.length === 0 && removedOrdinals.length === 0 && retainedOrdinals.length > 0) {
      parts.push(`已同步 ${retainedOrdinals.length} 张现有渐进式子卡片的内容`);
    }

    if (newlyAddedChildren.length > 0) {
      parts.push('新增子卡片不会进入当前学习会话，下次学习时再由兄弟分散规则自动处理');
    }

    return parts.length > 0 ? parts.join('；') : null;
  }

  function getStudyCardTypeDisplayName(card: Card | null | undefined): string {
    if (!card) return t('studyInterface.labels.unknownCardType');

    switch (card.type) {
      case CardType.ProgressiveParent:
      case CardType.ProgressiveChild:
        return t('studyInterface.labels.progressiveClozeCard');
      case CardType.Basic:
        return t('studyInterface.labels.basicQACard');
      case CardType.Cloze:
        return t('studyInterface.labels.clozeCard');
      case CardType.Multiple:
        return t('studyInterface.labels.choiceCard');
      default:
        return getCardTypeName(detectCardQuestionType(card));
    }
  }

  function notifyCardTypeChange(
    previousEditTarget: Card | null,
    persistedCard: Card
  ) {
    if (!previousEditTarget || previousEditTarget.type === persistedCard.type) {
      return;
    }

    const previousTypeLabel = getStudyCardTypeDisplayName(previousEditTarget);
    const nextTypeLabel = getStudyCardTypeDisplayName(persistedCard);
    new Notice(t('studyInterface.notices.cardTypeChanged', {
      from: previousTypeLabel,
      to: nextTypeLabel
    }), 7000);
  }

  async function syncStudyQueueAfterProgressiveEdit(
    persistedCard: Card,
    previousStudyCard: Card,
    previousEditTarget: Card | null
  ) {
    const editedParentId = previousEditTarget?.uuid || persistedCard.uuid;
    const currentStudyCardId = previousStudyCard.uuid;

    const { primaryDeckId: persistedDeckId } = getCardDeckIds(persistedCard, decks);
    const { primaryDeckId: previousDeckId } = getCardDeckIds(previousStudyCard, decks);
    const deckId =
      persistedDeckId ||
      previousDeckId ||
      persistedCard.deckId ||
      previousStudyCard.deckId ||
      session.deckId;

    if (!deckId) {
      logger.warn('[StudyInterface] 渐进式挖空保存后无法确定牌组，降级为单卡同步');
      const cardsIndex = cards.findIndex(c => c.uuid === persistedCard.uuid);
      if (cardsIndex !== -1) {
        cards[cardsIndex] = persistedCard;
        cards = [...cards];
      }

      const queueIndex = studyQueue.findIndex(c => c.uuid === currentStudyCardId || c.uuid === persistedCard.uuid);
      if (queueIndex !== -1) {
        studyQueue[queueIndex] = persistedCard;
        studyQueue = [...studyQueue];
      }
      return;
    }

    const latestDeckCards = await dataStorage.getDeckCards(deckId);
    const latestParent = latestDeckCards.find(c => c.uuid === editedParentId) || persistedCard;

    const latestRelatedCards =
      latestParent.type === CardType.ProgressiveParent
        ? latestDeckCards
            .filter(c =>
              c.uuid === latestParent.uuid ||
              (c.type === CardType.ProgressiveChild && (c as ProgressiveClozeChildCard).parentCardId === latestParent.uuid)
            )
            .sort((a, b) => {
              if (a.uuid === latestParent.uuid) return -1;
              if (b.uuid === latestParent.uuid) return 1;
              const ordA = isProgressiveClozeChild(a) ? a.clozeOrd : -1;
              const ordB = isProgressiveClozeChild(b) ? b.clozeOrd : -1;
              return ordA - ordB;
            })
        : [latestParent];

    const previousRelatedIds = new Set<string>([
      editedParentId,
      persistedCard.uuid,
      ...(previousEditTarget?.type === CardType.ProgressiveParent
        ? (previousEditTarget as Card & { progressiveCloze?: { childCardIds?: string[] } }).progressiveCloze?.childCardIds || []
        : []),
      ...cards
        .filter(c => c.uuid === editedParentId || ((c as ProgressiveClozeChildCard).parentCardId === editedParentId))
        .map(c => c.uuid),
      ...studyQueue
        .filter(c => c.uuid === editedParentId || ((c as ProgressiveClozeChildCard).parentCardId === editedParentId))
        .map(c => c.uuid)
    ]);

    const newlyAddedChildren = latestRelatedCards.filter(
      (c): c is ProgressiveClozeChildCard =>
        isProgressiveClozeChild(c) && !previousRelatedIds.has(c.uuid)
    );

    const relatedIds = new Set<string>([
      ...previousRelatedIds,
      ...latestRelatedCards.map(c => c.uuid)
    ]);

    const baseCards = cards.filter(c => !relatedIds.has(c.uuid));
    cards = [
      ...baseCards,
      ...latestRelatedCards
    ];

    const latestById = new Map(latestRelatedCards.map(card => [card.uuid, card] as const));
    const matchProgressiveChildByOrd = (card: Card): ProgressiveClozeChildCard | undefined => {
      if (!isProgressiveClozeChild(card)) return undefined;

      return latestRelatedCards.find(
        (candidate): candidate is ProgressiveClozeChildCard =>
          isProgressiveClozeChild(candidate) &&
          candidate.parentCardId === latestParent.uuid &&
          candidate.clozeOrd === card.clozeOrd
      );
    };

    const resolveLatestRelatedCard = (card: Card): Card => {
      if (latestById.has(card.uuid)) {
        return latestById.get(card.uuid) || card;
      }

      return matchProgressiveChildByOrd(card) || card;
    };

    studyQueue = studyQueue.map(card => resolveLatestRelatedCard(card));

    const currentReplacement = resolveLatestRelatedCard(previousStudyCard);
    const queueIndex = studyQueue.findIndex(c => {
      if (c.uuid === currentStudyCardId) {
        return true;
      }

      return (
        isProgressiveClozeChild(previousStudyCard) &&
        isProgressiveClozeChild(c) &&
        c.parentCardId === latestParent.uuid &&
        c.clozeOrd === previousStudyCard.clozeOrd
      );
    });
    if (queueIndex !== -1) {
      studyQueue[queueIndex] = currentReplacement;
      currentCardIndex = queueIndex;
    }

    const progressiveSaveNotice = buildProgressiveClozeSaveNotice(
      previousEditTarget,
      persistedCard,
      newlyAddedChildren
    );
    if (progressiveSaveNotice) {
      new Notice(progressiveSaveNotice, 7000);
    }

    cards = [...cards];
    studyQueue = [...studyQueue];
    detectedCardType = detectCardQuestionType(currentReplacement);
    forceRefresh();
  }

  function isProgressiveEditContext(
    persistedCard: Card,
    previousStudyCard: Card,
    previousEditTarget: Card | null
  ): boolean {
    return (
      persistedCard.type === CardType.ProgressiveParent ||
      persistedCard.type === CardType.ProgressiveChild ||
      previousStudyCard.type === CardType.ProgressiveParent ||
      previousStudyCard.type === CardType.ProgressiveChild ||
      previousEditTarget?.type === CardType.ProgressiveParent ||
      previousEditTarget?.type === CardType.ProgressiveChild
    );
  }

  function syncStudyQueueAfterRegularEdit(
    persistedCard: Card,
    previousStudyCard: Card
  ) {
    const currentStudyCardId = previousStudyCard.uuid;

    const cardsIndex = cards.findIndex(c => c.uuid === currentStudyCardId || c.uuid === persistedCard.uuid);
    if (cardsIndex !== -1) {
      cards[cardsIndex] = persistedCard;
    }

    const queueIndex = studyQueue.findIndex(c => c.uuid === currentStudyCardId || c.uuid === persistedCard.uuid);
    if (queueIndex !== -1) {
      studyQueue[queueIndex] = persistedCard;
    }

    cards = [...cards];
    studyQueue = [...studyQueue];
    detectedCardType = detectCardQuestionType(persistedCard);
    forceRefresh();
  }

  type PersistEditedStudyCardResult =
    | { success: true; card: Card }
    | { success: false; cancelled?: boolean; error?: string };

  async function persistEditedStudyCard(updatedCard: Card): Promise<PersistEditedStudyCardResult> {
    if (isStagingSession) {
      onStagingCardEdited?.(updatedCard);
      return { success: true, card: updatedCard };
    }

    const saveResult = await saveMemoryCardCommand(plugin, updatedCard, 'update');
    if (!saveResult.success) {
      if (saveResult.error === 'SAVE_CANCELLED') {
        return { success: false, cancelled: true };
      }
      return { success: false, error: saveResult.error };
    }

    return { success: true, card: saveResult.data || updatedCard };
  }

  function getCurrentTemplateInfo() {
    if (!currentCard) return null;

    const card = currentCard;
    if (!card) return null;

    try {
      // 使用新模板系统
      const template = availableTemplates?.find(t => t && t.id === card.templateId);

      if (template && template.fields) {
        const frontFields = template.fields.filter((f: any) =>
          f.name && (f.name.toLowerCase().includes('front') || f.name.toLowerCase().includes('question'))
        ).length;
        const backFields = template.fields.filter((f: any) =>
          f.name && (f.name.toLowerCase().includes('back') || f.name.toLowerCase().includes('answer'))
        ).length;

        return {
          template,
          frontFieldCount: frontFields,
          backFieldCount: backFields
        };
      }
    } catch (error) {
      logger.error('[StudyModal] 获取当前模板信息失败:', error);
    }

    return null;
  }

  // 响应式刷新机制 - 确保界面状态与数据同步
  // --- 刷新触发器 ---
  let refreshTrigger = $state(0);
  let isClozeModeSaving = $state(false);

  function forceRefresh() {
    refreshTrigger++;
    // 触发PreviewContainer重新渲染
    logger.debug('强制刷新界面，触发器:', refreshTrigger);
  }

  //  已禁用传统渲染逻辑 - 监听刷新触发器，确保界面更新
  $effect(() => {
    if (refreshTrigger > 0) {
      //  新系统：PreviewContainer会自动处理刷新，无需手动调用renderMarkdown
      logger.debug('刷新触发，PreviewContainer会自动更新');
    }
  });

  // 学习进度实时更新机制 - 移除重复的progress更新避免循环
  let progressUpdateInterval: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    // 每秒更新一次学习时间统计（不更新progress，避免与主effect冲突）
    progressUpdateInterval = setInterval(() => {
      if (!showEditModal && currentCard) {
        currentStudyTime = studyTimer.getElapsedMs();
        session.totalTime = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
      }
    }, 1000);

    return () => {
      if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
      }
    };
  });

  // --- 模板相关状态 ---
  let showTemplateList = $state(false);
  let templateMenuTop = $state(0);
  let templateMenuLeft = $state(0);
  let templateMenuEl: HTMLDivElement | null = $state(null);
  let lastTemplateAnchor: DOMRect | null = $state(null);
  let templateList = $state<ParseTemplate[]>([]);
  // 载入牌组设置（仅在组件挂载时执行一次）
  let decksLoaded = false;
  $effect(() => {
    if (decksLoaded) return;

    (async () => {
      try {
        const loadedDecks = await dataStorage.getDecks();
        const map = new Map<string, any>();
        for (const d of loadedDecks) map.set(d.id, d.settings);
        deckSettingsMap = map;
        // 载入牌组列表供编辑模态使用
        decks = loadedDecks;
        decksLoaded = true;
      } catch (e) {
        logger.warn('加载牌组设置失败', e);
      }
    })();
  });

  function applyLearningScheduling(prevState: number, rating: Rating, updatedFsrsCard: any, card: Card) {
    const resolvedMemoryScheduling = resolveMemorySchedulingForCard(card);
    const {
      learningSteps,
      relearningSteps,
      graduatingInterval,
      easyInterval,
    } = resolvedMemoryScheduling;
    
    // 从 SessionManager 读取当前 stepIndex；若会话刚创建，则从 FSRS 推断一次。
    const sessionState = currentSessionId ? sessionManager.getSessionState(currentSessionId) : null;
    const currentStepIndex =
      sessionState?.learningStepIndex ??
      StepIndexCalculator.calculate(card, learningSteps, relearningSteps);

    const { applied, nextStepIndex } = applyLearningStepScheduling({
      prevState,
      rating,
      updatedCard: updatedFsrsCard,
      config: {
        learningSteps,
        relearningSteps,
        graduatingInterval,
        easyInterval
      },
      currentStepIndex
    });

    if (!applied) {
      return;
    }

    if (nextStepIndex !== null && updatedFsrsCard.state !== CardState.Review && currentSessionId) {
      sessionManager.updateStepIndex(currentSessionId, nextStepIndex);
    }
  }

  // 判断事件目标是否在可编辑区域（输入框、contenteditable 或 CodeMirror 编辑器内）
  function isEditableTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    return Boolean(
      element.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor, .cm-content'
      )
    );
  }

  // 快捷键处理（受设置控制）
  function handleKeyPress(event: KeyboardEvent) {
    if (!plugin.settings.enableShortcuts) return;
    // 当编辑模态窗打开时，暂停学习模态的快捷键处理，避免冲突
    if (showEditModal) return;
    if (!currentCard) return;

    // 当焦点在可编辑控件或 CodeMirror 内时，放行按键（例如空格键输入）
    if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) return;

    switch (event.key) {
      case ' ':
      case 'Enter':
      case 'NumpadEnter':
        event.preventDefault();
        if (!showAnswer) {
          showAnswerCard();
        }
        break;
      case '1':
      case 'Numpad1':
        if (showAnswer) {
          event.preventDefault();
          rateCard(1);
        }
        break;
      case '2':
      case 'Numpad2':
        if (showAnswer) {
          event.preventDefault();
          rateCard(2);
        }
        break;
      case '3':
      case 'Numpad3':
        if (showAnswer) {
          event.preventDefault();
          rateCard(3);
        }
        break;
      case '4':
      case 'Numpad4':
        if (showAnswer) {
          event.preventDefault();
          rateCard(4);
        }
        break;
    }
  }

  // 显示答案
  /**
   * 显示当前卡片的答案
   * 
   * 功能：
   * - 切换showAnswer状态
   * - 触发PreviewContainer重新渲染
   * - 启用评分按钮
   * -  强制触发媒体自动播放（播放背面内容）
   */
  function showAnswerCard() {
    showAnswer = true;
    // 不再重置cardStartTime，计时从看到卡片开始而非显示答案开始

    //  自动播放媒体文件
    //  关键改进：无论时机设置如何，都在显示答案时触发一次
    // 这样可以确保用户在正面停留时间长后，点击背面仍能播放背面的音频
    if (autoPlayMedia) {
      logger.debug('🎵 显示答案，触发背面内容自动播放');
      // 使用 'callback' 触发方式，优先级高
      autoPlayMediaFiles('callback');
    }
  }

  // 撤销显示答案 - 回到隐藏答案状态
  function undoShowAnswer() {
    showAnswer = false;
    // 不重置cardStartTime，保持从看到卡片开始的计时
    logger.debug('撤销显示答案，返回预览状态');
  }

  //  撤销上一次评分
  /**
   * 撤销最后一次评分操作
   * 
   * 功能：
   * - 从撤销栈获取快照
   * - 恢复卡片FSRS数据、reviewHistory、stats
   * - 恢复会话统计
   * - 返回上一张卡片（currentCardIndex--）
   * - 保存到数据库
   */
  async function handleUndoReview() {
    const snapshot = reviewUndoManager.undo();
    
    if (!snapshot) {
      new Notice(t('studyInterface.notices.nothingToUndo'));
      logger.debug('撤销栈为空');
      return;
    }
    
    try {
      logger.debug('开始撤销评分:', {
        cardId: snapshot.cardId,
        cardIndex: snapshot.cardIndex,
        rating: snapshot.reviewInfo.rating
      });
      
      // 恢复卡片索引
      currentCardIndex = snapshot.cardIndex;
      
      // 等待currentCard更新
      await tick();
      
      if (!currentCard || currentCard.uuid !== snapshot.cardId) {
        throw new Error(t('studyInterface.errors.restoreCardIndexFailed'));
      }
      
      // 恢复卡片数据
      currentCard.fsrs = JSON.parse(JSON.stringify(snapshot.cardSnapshot.fsrs));
      currentCard.reviewHistory = JSON.parse(JSON.stringify(snapshot.cardSnapshot.reviewHistory));
      currentCard.stats = JSON.parse(JSON.stringify(snapshot.cardSnapshot.stats));
      currentCard.modified = snapshot.cardSnapshot.modified;
      
      // 恢复会话统计
      session.cardsReviewed = snapshot.sessionSnapshot.cardsReviewed;
      session.newCardsLearned = snapshot.sessionSnapshot.newCardsLearned;
      session.correctAnswers = snapshot.sessionSnapshot.correctAnswers;
      session.totalTime = snapshot.sessionSnapshot.totalTime;
      
      // 保存到数据库
      const result = await runWithMemoryStudyDataChangeContext(currentCard.deckId, () =>
        saveMemoryCardCommand(plugin, currentCard, 'update')
      );
      
      if (result.success) {
        // 更新内存中的cards数组
        cards[currentCardIndex] = currentCard;
        cards = [...cards]; // 触发响应式更新
        
        // 重置UI状态
        showAnswer = false;
        studyTimer.reset();
        
        // 更新撤销计数
        updateUndoCount();
        
        // 触发进度条刷新
        progressBarRefreshTrigger++;
        
        new Notice(t('studyInterface.notices.undoSuccess'));
        logger.debug('撤销成功');
      } else {
        throw new Error(t('studyInterface.errors.saveCardFailed'));
      }
    } catch (error) {
      logger.error('[StudyModal] 撤销失败:', error);
      new Notice(t('studyInterface.notices.undoFailed', {
        error: error instanceof Error ? error.message : t('study.view.unknownError')
      }));
      
      // 恢复撤销栈（将快照放回）
      if (snapshot) {
        reviewUndoManager.saveSnapshot(snapshot);
        updateUndoCount();
      }
    }
  }


  // 评分卡片 - 使用FSRS6增强算法
  /**
   * 对卡片进行评分并更新FSRS数据
   * 
   * @param rating - 评分等级 (1=Again, 2=Hard, 3=Good, 4=Easy)
   * 
   * 核心流程：
   * 1. 计算响应时间
   * 2. 调用FSRS算法计算新的间隔
   * 3. 应用学习步骤逻辑
   * 4. 更新卡片统计数据
   * 5. 更新FSRS6增强统计
   * 6. 触发个性化优化
   * 7. 保存卡片并切换下一张
   */
  async function rateCard(rating: Rating) {
    const cardToRate = currentCard;

    logger.debug('rateCard called:', {
      rating,
      hasCurrentCard: !!cardToRate,
      currentCardId: cardToRate?.uuid,
      showAnswer,
      responseTimeMs: studyTimer.getResponseTimeMs()
    });

    if (!cardToRate || !showAnswer) {
      logger.debug('rateCard early return:', {
        hasCurrentCard: !!cardToRate,
        showAnswer
      });
      return;
    }

    try {
      await memoryStudySessionController.rateCurrentCard(rating);
    } catch (error) {
      logger.error('[StudyModal] 评分流程失败:', error);
    }
  }
  
  /**
   * 处理 Learning Steps 插入逻辑
   * 
   * 根据评分和卡片状态，判断是否需要在会话中重学
   * 
   * @param card 卡片对象
   * @param rating 评分
   * @param prevState 评分前的状态
   */
  async function handleLearningStepsInsertion(
    card: Card,
    rating: Rating,
    prevState: CardState
  ) {
    await memoryStudySessionController.handleLearningStepsInsertion(card, rating, prevState);
  }

  /**
   * 更新FSRS6增强统计信息
   * 
   * @param card - 卡片对象
   * @param rating - 评分等级
   * @param responseTime - 响应时间（毫秒）
   * 
   * 更新内容：
   * - 预测准确性（基于评分和响应时间）
   * - 稳定性趋势（连续复习的稳定性变化）
   * - 难度趋势（难度的动态变化）
   */
  /**
   * 更新FSRS6增强统计信息
   * 使用常量代替硬编码权重，提高可维护性
   */
  function updateFSRS6Statistics(card: Card, rating: Rating, responseTime: number) {
    // 更新预测准确性 (基于评分和响应时间)
    if (card.stats.predictionAccuracy !== undefined) {
      const isCorrect = rating >= 3 ? 1 : 0;
      // 考虑响应时间：快速正确回答提高准确性权重
      const timeBonus = responseTime < RESPONSE_TIME_THRESHOLDS.FAST_RESPONSE && isCorrect 
        ? FSRS_STATS_WEIGHTS.FAST_CORRECT_BONUS 
        : 0;
      const currentAccuracy = card.stats.predictionAccuracy;
      card.stats.predictionAccuracy = 
        (currentAccuracy * FSRS_STATS_WEIGHTS.PREDICTION_ACCURACY_HISTORY) + 
        ((isCorrect + timeBonus) * FSRS_STATS_WEIGHTS.PREDICTION_ACCURACY_CURRENT);
    } else {
      card.stats.predictionAccuracy = rating >= 3 ? 1 : 0;
    }

    // 更新稳定性趋势
    if (card.reviewHistory && card.reviewHistory.length >= 2 && card.fsrs) {
      const prevStability = card.reviewHistory[card.reviewHistory.length - 2].stability;
      const currentStability = card.fsrs.stability;
      const stabilityChange = (currentStability - prevStability) / prevStability;

      if (card.stats.stabilityTrend !== undefined) {
        card.stats.stabilityTrend = 
          (card.stats.stabilityTrend * FSRS_STATS_WEIGHTS.STABILITY_TREND_HISTORY) + 
          (stabilityChange * FSRS_STATS_WEIGHTS.STABILITY_TREND_CURRENT);
      } else {
        card.stats.stabilityTrend = stabilityChange;
      }
    }

    // 更新难度趋势
    if (card.reviewHistory && card.reviewHistory.length >= 2 && card.fsrs) {
      const prevDifficulty = card.reviewHistory[card.reviewHistory.length - 2].difficulty;
      const currentDifficulty = card.fsrs.difficulty;
      const difficultyChange = currentDifficulty - prevDifficulty;

      if (card.stats.difficultyTrend !== undefined) {
        card.stats.difficultyTrend = 
          (card.stats.difficultyTrend * FSRS_STATS_WEIGHTS.DIFFICULTY_TREND_HISTORY) + 
          (difficultyChange * FSRS_STATS_WEIGHTS.DIFFICULTY_TREND_CURRENT);
      } else {
        card.stats.difficultyTrend = difficultyChange;
      }
    }
  }

  /**
   * 更新记忆成功率
   * 
   * @param card - 卡片对象
   * @param rating - 评分等级 (>=3为成功)
   * 
   * 计算累计的记忆成功率百分比
   */
  function updateMemorySuccessRate(card: Card, rating: Rating) {
    const isSuccess = rating >= 3;
    const totalReviews = card.stats.totalReviews;

    if (totalReviews === 1) {
      card.stats.memoryRate = isSuccess ? 1 : 0;
    } else {
      const prevSuccessCount = Math.round((card.stats.memoryRate || 0) * (totalReviews - 1));
      const newSuccessCount = prevSuccessCount + (isSuccess ? 1 : 0);
      card.stats.memoryRate = newSuccessCount / totalReviews;
    }
    
    // 确保ustats.memoryRate存在
    if (card.stats.memoryRate === undefined) {
      card.stats.memoryRate = isSuccess ? 1 : 0;
    }
  }

  /**
   * 更新选择题统计数据
   * 
   * @param card - 卡片对象
   * @param rating - 评分等级
   * @param responseTime - 响应时间（毫秒）
   * 
   * 功能：
   * - 判断选择题答案是否正确
   * - 更新正确率统计
   * - 更新平均响应时间
   * - 记录最近10次答题历史
   * - 更新错题计数
   * 
   * 仅处理单选题和多选题类型
   */
  function updateChoiceQuestionStats(card: Card, rating: Rating, responseTime: number) {
    // 仅处理选择题类型
    const isChoiceType = detectedCardType === UnifiedCardType.SINGLE_CHOICE || 
                        detectedCardType === UnifiedCardType.MULTIPLE_CHOICE;
    
    if (!isChoiceType) {
      return; // 非选择题，直接返回
    }

    // 获取选择题数据
    const choiceData = previewContainer?.getChoiceQuestionData?.();
    if (!choiceData || !choiceData.isChoiceQuestion) {
      logger.warn('[StudyModal] 无法获取选择题数据');
      return;
    }

    const { questionData, selectedOptions } = choiceData;
    if (!questionData) {
      return;
    }

    //  无答案容错：缺少答案的选择题不参与判分统计
    if (!Array.isArray(questionData.correctAnswers) || questionData.correctAnswers.length === 0) {
      return;
    }

    // 判断用户回答是否正确
    const correctLabels = questionData.correctAnswers;
    let isCorrect = false;
    
    if (questionData.isMultipleChoice) {
      // 多选题：必须完全匹配
      const selectedSet = new Set(selectedOptions);
      const correctSet = new Set(correctLabels);
      
      if (selectedSet.size === correctSet.size) {
        isCorrect = true;
        for (const label of selectedOptions) {
          if (!correctSet.has(label)) {
            isCorrect = false;
            break;
          }
        }
      }
    } else {
      // 单选题：选中的选项必须是正确答案
      isCorrect = selectedOptions.length === 1 && correctLabels.includes(selectedOptions[0]);
    }

    logger.debug('选择题答题结果:', {
      selected: selectedOptions,
      correct: correctLabels,
      isCorrect
    });

    // 初始化选择题统计（如果不存在）
    if (!card.stats.choiceStats) {
      card.stats.choiceStats = {
        totalAttempts: 0,
        correctAttempts: 0,
        accuracy: 0,
        averageResponseTime: 0,
        recentAttempts: [],
        isInErrorBook: false,
        errorCount: 0
      };
    }

    const stats = card.stats.choiceStats;

    // 更新统计数据
    stats.totalAttempts++;
    if (isCorrect) {
      stats.correctAttempts++;
    } else {
      stats.errorCount++;
      stats.lastErrorDate = new Date().toISOString();
    }

    // 重新计算正确率
    stats.accuracy = stats.correctAttempts / stats.totalAttempts;

    // 更新平均反应时间（加权平均）
    if (stats.totalAttempts === 1) {
      stats.averageResponseTime = responseTime;
    } else {
      stats.averageResponseTime = 
        (stats.averageResponseTime * (stats.totalAttempts - 1) + responseTime) / stats.totalAttempts;
    }

    // 添加到历史记录
    const attemptRecord = {
      timestamp: new Date().toISOString(),
      selectedOptions: [...selectedOptions],
      correctOptions: [...correctLabels],
      correct: isCorrect,
      responseTime: responseTime
    };

    stats.recentAttempts.unshift(attemptRecord);

    // 只保留最近10条记录
    if (stats.recentAttempts.length > 10) {
      stats.recentAttempts = stats.recentAttempts.slice(0, 10);
    }

    syncCardStatsToCanonicalFormat(card);

    logger.debug('选择题统计已更新:', {
      totalAttempts: stats.totalAttempts,
      correctAttempts: stats.correctAttempts,
      accuracy: `${Math.round(stats.accuracy * 100)}%`,
      avgResponseTime: `${Math.round(stats.averageResponseTime / 1000)}s`
    });
  }

  /**
   * 查找容器中的所有媒体元素
   * 
   * 支持：
   * - Obsidian 原生媒体嵌入
   * - media-extended 插件
   * - Shadow DOM
   * - 深度嵌套结构
   * 
   * @param rootContainer 根容器（默认为 document.body）
   * @param debug 是否输出调试信息
   * @returns 去重后的媒体元素数组
   */
  function findMediaElements(rootContainer?: HTMLElement, debug: boolean = false): HTMLMediaElement[] {
    const container = rootContainer || document.body;
    const elementsSet = new Set<HTMLMediaElement>();
    
    if (debug) {
      logger.debug('[findMediaElements] 🔍 开始媒体元素搜索');
      logger.debug('[findMediaElements] 容器:', container.className, container.id);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 策略 1: 标准选择器（基础覆盖）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const standardSelectors = [
      // 标准 HTML5 媒体元素
      'audio',
      'video',
      // Obsidian internal-embed 结构
      '.internal-embed audio',
      '.internal-embed video',
      // Obsidian media-embed 结构
      '.media-embed audio',
      '.media-embed video',
      // 类型特定的 embed
      '.audio-embed audio',
      '.video-embed video',
      // file-embed（某些 Obsidian 版本）
      '.file-embed audio',
      '.file-embed video',
      // markdown 渲染容器
      '.markdown-preview-view audio',
      '.markdown-preview-view video',
      '.markdown-reading-view audio',
      '.markdown-reading-view video',
      // 学习界面特定容器
      '.card-preview audio',
      '.card-preview video',
      '.preview-container audio',
      '.preview-container video',
      '.main-study-area audio',
      '.main-study-area video',
      '.weave-obsidian-renderer audio',
      '.weave-obsidian-renderer video'
    ];
    
    standardSelectors.forEach(selector => {
      try {
        const elements = container.querySelectorAll<HTMLMediaElement>(selector);
        elements.forEach(el => elementsSet.add(el));
        if (debug && elements.length > 0) {
          logger.debug(`[findMediaElements] ✅ 标准选择器 "${selector}" 找到 ${elements.length} 个元素`);
        }
      } catch (e) {
        logger.warn(`[findMediaElements] 选择器查询失败: ${selector}`, e);
      }
    });
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 策略 2: media-extended 插件专用选择器
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const mediaExtendedSelectors = [
      // media-extended 已知类名模式
      '.mx-video-player video',
      '.mx-audio-player audio',
      '.mx-media-player video',
      '.mx-media-player audio',
      '.media-extended-player video',
      '.media-extended-player audio',
      // media-extended 可能的容器
      '[data-mx-video] video',
      '[data-mx-audio] audio',
      '[data-media-extended] video',
      '[data-media-extended] audio',
      // iframe 内的媒体（某些版本）
      'iframe video',
      'iframe audio'
    ];
    
    mediaExtendedSelectors.forEach(selector => {
      try {
        const elements = container.querySelectorAll<HTMLMediaElement>(selector);
        elements.forEach(el => elementsSet.add(el));
        if (debug && elements.length > 0) {
          logger.debug(`[findMediaElements] 🔌 media-extended 选择器 "${selector}" 找到 ${elements.length} 个元素`);
        }
      } catch (e) {
        // 静默失败，因为这些是可选选择器
      }
    });
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 策略 3: 深度遍历（查找所有嵌套的媒体元素）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    function deepFindMedia(element: Element): void {
      // 检查当前元素是否是媒体元素
      if (element.tagName === 'AUDIO' || element.tagName === 'VIDEO') {
        elementsSet.add(element as HTMLMediaElement);
        if (debug) {
          logger.debug(`[findMediaElements] 🌲 深度遍历找到: ${element.tagName}`, {
            src: (element as HTMLMediaElement).src,
            parent: element.parentElement?.className
          });
        }
      }
      
      // 遍历子元素（包括 Shadow DOM）
      if (element.shadowRoot) {
        if (debug) {
          logger.debug('[findMediaElements] 🌑 检测到 Shadow DOM');
        }
        element.shadowRoot.querySelectorAll('audio, video').forEach(media => {
          elementsSet.add(media as HTMLMediaElement);
          if (debug) {
            logger.debug(`[findMediaElements] 🌑 Shadow DOM 找到: ${media.tagName}`);
          }
        });
      }
      
      // 递归遍历子节点
      Array.from(element.children).forEach(child => deepFindMedia(child));
    }
    
    // 仅在前两个策略失败时进行深度遍历（性能优化）
    if (elementsSet.size === 0) {
      if (debug) {
        logger.debug('[findMediaElements] ⚠️ 前两个策略未找到媒体，启动深度遍历');
      }
      deepFindMedia(container);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 策略 4: iframe 内的媒体元素（media-extended 在线视频）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const iframes = container.querySelectorAll<HTMLIFrameElement>('iframe');
    iframes.forEach(iframe => {
      try {
        // 尝试访问 iframe 内容（同源限制）
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.querySelectorAll<HTMLMediaElement>('audio, video').forEach(media => {
            elementsSet.add(media);
            if (debug) {
              logger.debug(`[findMediaElements] 🖼️ iframe 内找到: ${media.tagName}`);
            }
          });
        }
      } catch (e) {
        // 跨域 iframe 无法访问，静默失败
        if (debug) {
          logger.debug('[findMediaElements] ⚠️ iframe 跨域，无法访问内容');
        }
      }
    });
    
    const result = Array.from(elementsSet);
    
    if (debug) {
      logger.debug(`[findMediaElements] 📊 总计找到 ${result.length} 个媒体元素`);
      if (result.length > 0) {
        result.forEach((media, index) => {
          logger.debug(`[findMediaElements]   ${index + 1}. ${media.tagName}:`, {
            src: media.src || media.currentSrc || 'no-src',
            className: media.className,
            parent: media.parentElement?.className,
            controls: media.controls,
            autoplay: media.autoplay
          });
        });
      }
    }
    
    return result;
  }

  /**
   * 播放媒体元素，支持等待加载和顺序播放
   * 
   * @param mediaElements 要播放的媒体元素数组
   */
  async function playMediaElements(mediaElements: HTMLMediaElement[]): Promise<void> {
    if (mediaElements.length === 0) {
      logger.debug(' 没有媒体元素需要播放');
      return;
    }

    logger.debug(`🎵 找到 ${mediaElements.length} 个媒体元素，播放模式: ${playMediaMode}`);

    try {
      if (playMediaMode === 'first') {
        // 只播放第一个（等待就绪）
        const firstMedia = mediaElements[0];
        await playMediaElement(firstMedia, 1, 1);
      } else {
        //  改进：顺序播放所有媒体（而非同时播放）
        // 第一个播放完 → 间隔2秒 → 播放第二个 → ...
        logger.debug(' 🎵 开始顺序播放所有媒体');
        for (let i = 0; i < mediaElements.length; i++) {
          const media = mediaElements[i];
          
          //  播放当前媒体并等待播放完成
          await playMediaElementSequentially(media, i + 1, mediaElements.length);
          
          // ⏸ 如果不是最后一个，等待间隔后再播放下一个
          if (i < mediaElements.length - 1) {
            logger.debug(`⏸️ 等待 ${playbackInterval}ms 后播放下一个媒体`);
            await new Promise(resolve => setTimeout(resolve, playbackInterval));
          }
        }
        logger.debug(' ✅ 所有媒体顺序播放完成');
      }
    } catch (error) {
      // 自动播放失败（浏览器策略限制）
      logger.warn('[StudyInterface] ⚠️ 自动播放失败（可能需要用户交互）:', error);
      // 静默失败，不影响用户体验
    }
  }

  /**
   *  播放单个媒体元素并等待播放完成（用于顺序播放）
   * 
   * @param media 媒体元素
   * @param index 索引（用于日志）
   * @param total 总数（用于日志）
   */
  async function playMediaElementSequentially(media: HTMLMediaElement, index: number, total: number): Promise<void> {
    const prefix = total > 1 ? `${index}/${total}` : '';
    const logTag = prefix ? `[${prefix}]` : '';
    
    logger.debug(`${logTag} 🎬 顺序播放: ${media.tagName}`, {
      src: media.src || media.currentSrc || 'no-src',
      readyState: media.readyState,
      networkState: media.networkState
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 1: 检查媒体源是否有效
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const src = media.src || media.currentSrc;
    if (!src || src === 'no-src' || src.trim() === '') {
      logger.warn(`[StudyInterface] ${logTag} ⚠️ 跳过：媒体源未设置`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 2: 等待媒体就绪
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (media.readyState < 2) {
      logger.debug(` ${logTag} ⏳ 等待媒体加载 (readyState: ${media.readyState})`);
      try {
        await waitForMediaReady(media, 5000);
        logger.debug(` ${logTag} ✅ 媒体加载完成 (readyState: ${media.readyState})`);
      } catch (error) {
        logger.warn(`[StudyInterface] ${logTag} ⚠️ 等待超时：媒体加载失败`);
        return;
      }
    } else {
      logger.debug(` ${logTag} ✅ 媒体已就绪 (readyState: ${media.readyState})`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 3: 播放并等待播放完成
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      // 重置媒体到开始位置
      media.currentTime = 0;
      
      // 开始播放
      await media.play();
      logger.debug(`${logTag} ▶️ 开始播放`);
      
      //  关键：等待播放完成
      await waitForMediaEnded(media);
      logger.debug(`${logTag} ✅ 播放完成`);
    } catch (error) {
      logger.warn(`[StudyInterface] ${logTag} ⚠️ 播放失败:`, error);
    }
  }

  /**
   * ⏸ 等待媒体播放完成
   * 
   * @param media 媒体元素
   * @returns Promise（播放完成后 resolve）
   */
  function waitForMediaEnded(media: HTMLMediaElement): Promise<void> {
    return new Promise((resolve) => {
      // 如果已经播放完成，立即返回
      if (media.ended) {
        resolve();
        return;
      }

      // 监听播放结束事件
      const onEnded = () => {
        cleanup();
        resolve();
      };

      // 监听错误事件
      const onError = () => {
        cleanup();
        resolve(); // 即使出错也resolve，继续播放下一个
      };

      // 监听暂停事件（用户可能手动暂停）
      const onPause = () => {
        // 只在真正结束时清理，不在暂停时清理
        if (media.ended) {
          cleanup();
          resolve();
        }
      };

      function cleanup() {
        media.removeEventListener('ended', onEnded);
        media.removeEventListener('error', onError);
        media.removeEventListener('pause', onPause);
      }

      // 添加事件监听器
      media.addEventListener('ended', onEnded);
      media.addEventListener('error', onError);
      media.addEventListener('pause', onPause);
    });
  }

  /**
   *  播放单个媒体元素（等待加载就绪）
   * 
   * @param media 媒体元素
   * @param index 索引（用于日志）
   * @param total 总数（用于日志）
   */
  async function playMediaElement(media: HTMLMediaElement, index: number, total: number): Promise<void> {
    const prefix = total > 1 ? `${index}/${total}` : '';
    const logTag = prefix ? `[${prefix}]` : '';
    
    logger.debug(`${logTag} 准备播放: ${media.tagName}`, {
      src: media.src || media.currentSrc || 'no-src',
      readyState: media.readyState,
      networkState: media.networkState
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 1: 检查媒体源是否有效
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const src = media.src || media.currentSrc;
    if (!src || src === 'no-src' || src.trim() === '') {
      logger.warn(`[StudyInterface] ${logTag} ⚠️ 跳过：媒体源未设置`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 2: 检查媒体是否已就绪
    // readyState:
    //   0 = HAVE_NOTHING - 没有关于媒体资源的信息
    //   1 = HAVE_METADATA - 已获取元数据
    //   2 = HAVE_CURRENT_DATA - 当前播放位置的数据可用
    //   3 = HAVE_FUTURE_DATA - 当前及未来数据可用
    //   4 = HAVE_ENOUGH_DATA - 足够的数据可用
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (media.readyState >= 2) {
      // 媒体已就绪，可以直接播放
      logger.debug(` ${logTag} ✅ 媒体已就绪 (readyState: ${media.readyState})`);
      try {
        await media.play();
        logger.debug(`${logTag} ✅ 播放成功`);
        return;
      } catch (error) {
        logger.warn(`[StudyInterface] ${logTag} ⚠️ 播放失败:`, error);
        return;
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 3: 等待媒体加载完成（最多等待 5 秒）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logger.debug(` ${logTag} ⏳ 等待媒体加载 (readyState: ${media.readyState})`);
    
    try {
      await waitForMediaReady(media, 5000);
      logger.debug(` ${logTag} ✅ 媒体加载完成 (readyState: ${media.readyState})`);
      
      // 尝试播放
      await media.play();
      logger.debug(`${logTag} ✅ 播放成功`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        logger.warn(`[StudyInterface] ${logTag} ⚠️ 等待超时：媒体加载失败`);
      } else {
        logger.warn(`[StudyInterface] ${logTag} ⚠️ 播放失败:`, error);
      }
    }
  }

  /**
   * ⏳ 等待媒体元素加载就绪
   * 
   * @param media 媒体元素
   * @param timeout 超时时间（毫秒）
   * @returns Promise（媒体就绪或超时后 resolve）
   */
  function waitForMediaReady(media: HTMLMediaElement, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // 如果已经就绪，立即返回
      if (media.readyState >= 2) {
        resolve();
        return;
      }

      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error('Media loading timeout'));
        }
      }, timeout);

      // 监听多个加载事件
      const onLoadedData = () => {
        if (!resolved && media.readyState >= 2) {
          resolved = true;
          cleanup();
          resolve();
        }
      };

      const onCanPlay = () => {
        if (!resolved && media.readyState >= 2) {
          resolved = true;
          cleanup();
          resolve();
        }
      };

      const onError = (e: Event) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`Media loading error: ${(e as ErrorEvent).message || 'unknown'}`));
        }
      };

      function cleanup() {
        clearTimeout(timeoutId);
        media.removeEventListener('loadeddata', onLoadedData);
        media.removeEventListener('canplay', onCanPlay);
        media.removeEventListener('error', onError);
      }

      // 添加事件监听器
      media.addEventListener('loadeddata', onLoadedData);
      media.addEventListener('canplay', onCanPlay);
      media.addEventListener('error', onError);

      //  关键：主动触发加载（如果还未开始）
      if (media.networkState === 0) { // NETWORK_EMPTY
        logger.debug('[waitForMediaReady] 主动触发加载: load()');
        media.load();
      }
    });
  }

  /**
   *  使用 MutationObserver 监听媒体元素出现
   * 
   * 作为备用方案，当立即查找和重试都失败时使用
   * 支持 media-extended 插件和深度嵌套结构
   * 
   * @returns Promise（在找到媒体元素或超时后resolve）
   */
  function observeMediaElements(): Promise<void> {
    return new Promise((resolve) => {
      const container = document.querySelector('.main-study-area') || document.body;
      let resolved = false;
      let checkCount = 0;

      const observer = new MutationObserver((mutations) => {
        if (resolved) return;
        
        checkCount++;
        // 静默检查，不输出日志
        const mediaElements = findMediaElements(container as HTMLElement, false);
        if (mediaElements.length > 0) {
          resolved = true;
          observer.disconnect();
          logger.debug('✅ MutationObserver 检测到媒体元素');
          playMediaElements(mediaElements);
          resolve();
        }
      });

      // 监听 DOM 变化（包括子树和属性变化）
      observer.observe(container, {
        childList: true,      // 监听子节点添加/删除
        subtree: true,        // 监听所有后代节点
        attributes: true,     // 监听属性变化（media-extended 可能动态设置属性）
        attributeFilter: ['src', 'class', 'data-mx-video', 'data-mx-audio'] // 只监听相关属性
      });

      // 超时保护（3秒后放弃，比之前增加1秒给 media-extended 更多时间）
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          // 静默超时，最后尝试查找
          const lastAttempt = findMediaElements(container as HTMLElement, false);
          if (lastAttempt.length > 0) {
            playMediaElements(lastAttempt);
          }
          
          resolve();
        }
      }, 3000); // 增加到 3 秒
    });
  }

  /**
   * 自动播放媒体文件
   * 
   * 四重策略确保可靠性：
   * 1. 立即查找（快速响应）
   * 2. 重试机制（应对渲染延迟）
   * 3. 深度调试查找（media-extended 等插件支持）
   * 4. MutationObserver（备用方案）
   * 
   * @param triggeredBy 触发来源（用于调试）
   */
  async function autoPlayMediaFiles(triggeredBy: 'callback' | 'mutation' | 'manual' = 'manual'): Promise<void> {
    if (!autoPlayMedia) {
      return; // 未启用自动播放
    }

    //  策略1: 立即查找（最快，无调试）
    await tick(); // 等待 Svelte 更新 DOM
    let mediaElements = findMediaElements();
    
    if (mediaElements.length > 0) {
      await playMediaElements(mediaElements);
      return;
    }

    //  策略2: 重试机制（应对异步渲染延迟）
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 200; // 200ms 间隔
    
    for (let i = 0; i < MAX_RETRIES; i++) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      mediaElements = findMediaElements();
      
      if (mediaElements.length > 0) {
        await playMediaElements(mediaElements);
        return;
      }
      // 静默重试，不输出日志
    }

    //  策略3: 深度调试查找（静默）
    await new Promise(resolve => setTimeout(resolve, 300));
    mediaElements = findMediaElements(undefined, false);
    
    if (mediaElements.length > 0) {
      await playMediaElements(mediaElements);
      return;
    }

    //  策略4: MutationObserver 备用方案
    await observeMediaElements();
  }

  /**
   *  处理渲染完成回调
   * 
   * 当 Obsidian 渲染引擎完成内容渲染时触发
   * 这是最可靠的媒体播放时机（未来集成）
   * 
   * @param container 渲染完成的容器元素
   */
  function handleRenderComplete(container: HTMLElement): void {
    logger.debug(' 📢 收到渲染完成回调');
    
    // 如果启用了自动播放且时机为切换卡片
    if (autoPlayMedia && playMediaTiming === 'cardChange') {
      // 使用回调触发方式，优先级最高
      autoPlayMediaFiles('callback');
    }
  }

  /**
   * 切换到下一张卡片
   * 
   * 功能：
   * - 退出编辑模式（如果正在编辑）
   * - 更新索引并重置状态
   * - 到达末尾时结束学习会话
   */
  async function nextCard() {
    const prevIndex = currentCardIndex;

    devLog('debug', `${LOG_PREFIX.SESSION} ➡️  切换卡片:`, {
      from: currentCardIndex,
      queueLength: studyQueue.length,
      remaining: studyQueue.length - currentCardIndex - 1,
      currentCardId: currentCard?.uuid.slice(0, 8),
      sessionStudied: sessionStudiedCards.size
    });

    await memoryStudySessionController.nextCard();

    if (plugin?.settings?.enableDebugMode && prevIndex !== currentCardIndex) {
      logger.debug('[StudyModal] Card index updated:', {
        from: prevIndex,
        to: currentCardIndex,
        newCardId: studyQueue[currentCardIndex]?.uuid
      });
    }
  }


  async function finishSession() {
    await memoryStudySessionController.finishSession();
  }



  async function handleClose() {
    // 清理hover tooltips
    clearHoverTooltips(plugin);

    if (session.cardsReviewed > 0) {
      const shouldExit = await showObsidianConfirm(
        plugin.app,
        t('studyInterface.labels.exitConfirmMessage'),
        {
          title: t('study.session.exit'),
          confirmText: t('study.session.exit'),
          cancelText: t('common.cancel'),
          confirmClass: 'mod-cta'
        }
      );
      if (shouldExit) {
        finishSession();
      }
    } else {
      onClose();
    }
  }

  // 工具栏操作 - 行内编辑切换
  async function handleToggleEdit() {
    if (!currentCard) {
      logger.warn('No current card available for editing');
      return;
    }

    if (!showEditModal) {
      // 进入编辑模式：如果当前卡片是子卡片，解析父卡片进行编辑
      editorUnavailable = false;
      
      if (isProgressiveClozeChild(currentCard) && !isStagingSession) {
        // 子卡片：获取父卡片作为编辑目标
        try {
          const parentId = currentCard.parentCardId;
          const allCards = await dataStorage.getCards();
          const parentCard = allCards.find((c: Card) => c.uuid === parentId);
          if (parentCard) {
            editTargetCard = parentCard;
            logger.debug(`[StudyInterface] 子卡片编辑重定向到父卡片: ${parentId}`);
          } else {
            logger.warn(`[StudyInterface] 未找到父卡片: ${parentId}，使用子卡片编辑`);
            editTargetCard = currentCard;
          }
        } catch (error) {
          logger.error('[StudyInterface] 获取父卡片失败:', error);
          editTargetCard = currentCard;
        }
      } else {
        editTargetCard = currentCard;
      }
      
      showEditModal = true;
      await tick();
    } else {
      // 退出编辑模式前先保存
      if (!editorPoolManager) {
        logger.error('Cannot save: editorPoolManager not available');
        showEditModal = false;
        editTargetCard = null;
        return;
      }

      try {
        const sessionCardId = editorSessionId;
        const previousStudyCard = currentCard;
        const previousEditTarget = editTargetCard;
        const saveTargetId = editTargetCard?.uuid || currentCard.uuid;
        
        // 使用学习会话模式保存
        const result = await editorPoolManager.finishEditing(sessionCardId, true, {
          isStudySession: true,
          targetCardId: saveTargetId
        });

        if (result.success && result.updatedCard) {
          let persistedCard = result.updatedCard;
          const saveResult = await persistEditedStudyCard(result.updatedCard);
          if (!saveResult.success) {
            if (saveResult.cancelled) {
              logger.info('[StudyInterface] 用户取消了保存，返回编辑模式');
              return;
            }
            logger.error('卡片持久化失败（点击预览）:', saveResult.error);
            new Notice(t('study.view.saveFailed', {
              error: saveResult.error || t('study.view.unknownError')
            }));
            return;
          }
          persistedCard = saveResult.card;
          if (!isStagingSession) {
            logger.debug('卡片已持久化到数据库:', persistedCard.uuid);
          }
          
          new Notice(t('studyInterface.notices.cardSaved'));

          notifyCardTypeChange(previousEditTarget, persistedCard);
          
          if (isProgressiveEditContext(persistedCard, previousStudyCard, previousEditTarget)) {
            await syncStudyQueueAfterProgressiveEdit(persistedCard, previousStudyCard, previousEditTarget);
          } else {
            syncStudyQueueAfterRegularEdit(persistedCard, previousStudyCard);
          }
          
          // 退出编辑模式
          showEditModal = false;
          editTargetCard = null;
          editorUnavailable = false;
          isClozeMode = false;
        } else {
          logger.error('保存失败（点击预览）:', result.error);
          new Notice(t('study.view.saveFailed', {
            error: result.error || t('study.view.unknownError')
          }));
        }
      } catch (error) {
        logger.error('保存异常（点击预览）:', error);
        new Notice(t('study.view.saveFailed', {
          error: error instanceof Error ? error.message : t('study.view.unknownError')
        }));
      }
    }
  }

  // 编辑器取消回调
  async function handleEditorCancel() {
    logger.debug('Editor cancel callback triggered');
    
    // 退出编辑状态
    showEditModal = false;
    editTargetCard = null;
    editorUnavailable = false;
    isClozeMode = false;
  }



  // 挖空预览切换回调
  // 注意：实际的编辑器容器切换逻辑已移至 CardEditorContainer 组件
  // 这里只更新状态，组件会自动应用CSS类
  async function maybeShowClozeInputModeHint(): Promise<void> {
    if (showAnswer) return;
    if (!plugin?.app) return;

    const shouldShowHint = shouldShowTutorialHint(
      plugin.settings,
      GLOBAL_TUTORIAL_HINT_IDS.CLOZE_INPUT_MODE_SWITCH
    );
    if (!shouldShowHint) return;

    const modal = new ClozeInputModeHintModal(plugin.app, {
      onConfirm: async (dismissPermanently: boolean) => {
        if (!dismissPermanently) return;

        try {
          markTutorialHintDismissed(
            plugin.settings,
            GLOBAL_TUTORIAL_HINT_IDS.CLOZE_INPUT_MODE_SWITCH
          );
          await plugin.saveSettings();
        } catch (error) {
          logger.error('[StudyInterface] 保存教程提示状态失败:', error);
          new Notice(t('studyInterface.notices.saveTutorialHintFailed'));
        }
      }
    });
    modal.open();
  }

  async function handlePreviewClozeModeChange(mode: ClozeMode) {
    const previousStudyCard = currentCard;
    if (!previousStudyCard) return;

    if (
      previousStudyCard.type === CardType.ProgressiveParent ||
      previousStudyCard.type === CardType.ProgressiveChild
    ) {
      return;
    }

    const currentContent = previousStudyCard.content || '';
    const nextContent = setClozeModeInContent(currentContent, mode);

    if (nextContent === currentContent) {
      return;
    }

    const updatedCard: Card = {
      ...previousStudyCard,
      content: nextContent
    };

    try {
      isClozeModeSaving = true;

      const saveResult = await saveCardUnified(updatedCard, plugin, {
        operation: t('studyInterface.notices.clozeModeToggleOperation'),
        showErrorNotice: true,
        errorMessage: t('studyInterface.notices.clozeModeToggleFailed')
      });

      if (!saveResult.success) {
        return;
      }

      syncStudyQueueAfterRegularEdit(updatedCard, previousStudyCard);
      new Notice(
        mode === 'input'
          ? t('studyInterface.notices.clozeModeSwitchedInput')
          : t('studyInterface.notices.clozeModeSwitchedReveal')
      );
      if (mode === 'input') {
        void maybeShowClozeInputModeHint();
      }
    } catch (error) {
      logger.error('[StudyInterface] 切换挖空模式失败:', error);
      new Notice(error instanceof Error ? error.message : t('studyInterface.notices.clozeModeToggleFailed'));
    } finally {
      isClozeModeSaving = false;
    }
  }

  async function handleDeleteCard(skipConfirm = false) {
    if (!currentCard) return;

    // 根据直接删除设置决定是否跳过确认弹窗
    if (!skipConfirm) {
      const rawFront = getCardFront(currentCard);
      const frontText = rawFront.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const cardIdentifier = frontText.slice(0, 30) || `UUID: ${currentCard.uuid}`;
      const confirmed = await showObsidianConfirm(
        plugin.app,
        `${t('studyInterface.labels.confirmDeleteMessage', { cardId: cardIdentifier })}\n${t('studyInterface.labels.deleteIrreversible')}`,
        {
          title: t('studyInterface.labels.confirmDeleteCard'),
          confirmText: t('common.confirmDelete'),
          cancelText: t('common.cancel'),
          confirmClass: 'mod-warning'
        }
      );
      if (!confirmed) return;
    }

    if (isStagingSession) {
      const cardUuid = currentCard.uuid;
      onStagingDiscard?.(cardUuid);

      if (showEditModal) {
        showEditModal = false;
        editorUnavailable = false;
        isClozeMode = false;
      }

      cards = cards.filter((c) => c.uuid !== cardUuid);
      studyQueue = studyQueue.filter((c) => c.uuid !== cardUuid);

      if (studyQueue.length === 0) {
        currentCardIndex = 0;
        showAnswer = false;
        onStagingSessionComplete?.();
        return;
      }

      if (currentCardIndex >= studyQueue.length) {
        currentCardIndex = studyQueue.length - 1;
      }
      showAnswer = false;
      studyTimer.reset();
      return;
    }

    try {
      const res = await deleteMemoryCardCommand(plugin, currentCard.uuid);
      if (!res?.success) {
        try {
          new Notice(t('studyInterface.notices.deleteFailed', {
            error: res?.error || t('study.view.unknownError')
          }));
        } catch {
          logger.warn('[StudyInterface] 删除失败:', res?.error || '未知错误');
        }
        return;
      }

      //  增强：如果正在编辑模式，退出编辑模式
      if (showEditModal) {
        showEditModal = false;
        editorUnavailable = false;
        isClozeMode = false;
      }

      //  同步更新：使用与回收功能相同的索引调整策略
      const cardUuid = currentCard.uuid;
      
      // 记录删除前的信息
      const beforeRemove = {
        cardsLength: cards.length,
        queueLength: studyQueue.length,
        currentIndex: currentCardIndex
      };

      // 1 从 cards 移除
      cards = cards.filter(c => c.uuid !== cardUuid);
      
      // 2 从 studyQueue 移除（保持数据结构同步）
      studyQueue = studyQueue.filter(c => c.uuid !== cardUuid);

      // 3 智能索引调整（自动切换到下一张）
      if (studyQueue.length === 0) {
        // 没有卡片了，结束学习会话
        currentCardIndex = 0;
        showAnswer = false;
        logger.info('[Delete] 所有卡片已完成，结束学习会话');
        finishSession();
        return;
      }
      
      // 有剩余卡片，调整索引
      if (currentCardIndex >= studyQueue.length) {
        // 当前索引超出范围，调整到最后一张
        currentCardIndex = studyQueue.length - 1;
      }
      // else: currentCardIndex 保持不变，自动指向下一张卡片
      
      // 重置显示状态
      showAnswer = false;
      studyTimer.reset();
      showEditModal = false;

      // 强制触发界面刷新
      cards = [...cards];
      studyQueue = [...studyQueue];
      forceRefresh();

      // 显示删除成功提示
      try {
        new Notice(t('studyInterface.notices.cardDeleted'));
      } catch {
        logger.debug('卡片已删除');
      }

      // 详细日志
      logger.info('[Delete] 卡片已删除并切换:', {
        deletedCard: cardUuid.slice(0, 8),
        before: beforeRemove,
        after: {
          cardsLength: cards.length,
          queueLength: studyQueue.length,
          currentIndex: currentCardIndex,
          nextCard: studyQueue[currentCardIndex]?.uuid.slice(0, 8)
        }
      });

    } catch (e) {
      logger.error('删除失败', e);
      try {
        new Notice(t('studyInterface.notices.deleteRetry'));
      } catch {
        logger.warn('[StudyInterface] 删除卡片时发生错误，请重试');
      }
    }
  }

  /**
   * 回收当前卡片
   * 新版设计：通过添加 #回收 或 #recycle 标签实现
   * 强调主动改进而非被动搁置
   */
  async function suspendCurrentCard() {
    if (!currentCard) return;

    try {
      // 使用回收功能（而非旧版搁置）
      const cardToRecycle: Card = { ...currentCard };
      await recycleCard(cardToRecycle, RecycleReason.MANUAL, 5);

      // 保存回收后的卡片
      const res = await saveMemoryCardCommand(plugin, cardToRecycle, 'update');
      if (!res?.success) {
        new Notice(t('studyInterface.notices.recycleFailed', {
          error: res?.error || t('study.view.unknownError')
        }));
        return;
      }

      // 同步更新三层数据结构
      const cardUuid = currentCard.uuid;
      
      // 记录移除前的信息
      const beforeRemove = {
        cardsLength: cards.length,
        queueLength: studyQueue.length,
        currentIndex: currentCardIndex
      };

      // 1 从 cards 移除
      cards = cards.filter(c => c.uuid !== cardUuid);
      
      // 2 从 studyQueue 移除（关键：解决概率性切换问题）
      studyQueue = studyQueue.filter(c => c.uuid !== cardUuid);

      // 智能索引调整（自动切换到下一张）
      if (studyQueue.length === 0) {
        // 没有卡片了，结束学习会话
        currentCardIndex = 0;
        showAnswer = false;
        logger.info('[Recycle] 所有卡片已完成，结束学习会话');
        finishSession();
        return;
      }
      
      // 有剩余卡片，调整索引
      // 移除当前卡片后，索引自然指向下一张（不需要手动+1）
      // 只需要处理边界情况
      if (currentCardIndex >= studyQueue.length) {
        // 当前索引超出范围，调整到最后一张
        currentCardIndex = studyQueue.length - 1;
      }
      // else: currentCardIndex 保持不变，自动指向下一张卡片
      
      // 重置显示状态
      showAnswer = false;
      studyTimer.reset();
      showEditModal = false;

      // 强制刷新界面
      cards = [...cards];
      studyQueue = [...studyQueue];
      forceRefresh();

      // 显示成功通知
      const tagText = getRecycleTagText(true);  // #回收
      new Notice(t('studyInterface.notices.recycleSuccessAddedTag', { tag: tagText }));

      // 详细日志
      logger.info('[Recycle] 卡片已回收并切换:', {
        removedCard: cardUuid.slice(0, 8),
        tagAdded: tagText,
        before: beforeRemove,
        after: {
          cardsLength: cards.length,
          queueLength: studyQueue.length,
          currentIndex: currentCardIndex,
          nextCard: studyQueue[currentCardIndex]?.uuid.slice(0, 8)
        }
      });

    } catch (error) {
      logger.error('[Recycle] 回收卡片失败:', error);
      new Notice(t('studyInterface.notices.recycleRetry'));
    }
  }

  // 提醒功能状态
  let showReminderModal = $state(false);
  let customReviewDate = $state("");
  let customReviewTime = $state("");
  let reminderAnchorElement: HTMLElement | null = $state(null);

  // 优先级功能状态
  let showPriorityModal = $state(false);
  let selectedPriority = $state(2);
  let priorityAnchorElement: HTMLElement | null = $state(null);

  // 倒计时定时器ID
  let countdownTimerId: number | null = $state(null);

  function handleSetReminder() {
    if (!currentCard) return;

    // 设置默认值为明天此时
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    customReviewDate = tomorrow.toISOString().split('T')[0];
    customReviewTime = new Date().toTimeString().slice(0, 5);

    showPriorityModal = false;
    showReminderModal = true;
  }

  async function confirmSetReminder() {
    if (!currentCard || !customReviewDate || !customReviewTime) {
      new Notice(t('studyInterface.notices.reminderInvalidDateTime'));
      return;
    }

    try {
      // 组合日期和时间
      const reviewDateTime = new Date(`${customReviewDate}T${customReviewTime}`);

      if (reviewDateTime <= new Date()) {
        new Notice(t('studyInterface.notices.reminderMustBeFuture'));
        return;
      }

      // 更新卡片的复习时间
      const updatedCard: Card = {
        ...currentCard,
        fsrs: currentCard.fsrs ? {
          ...currentCard.fsrs,
          due: reviewDateTime.toISOString()
        } : undefined,
        modified: new Date().toISOString()
      } as Card;

      // 保存卡片
      const result = await saveMemoryCardCommand(plugin, updatedCard, 'update');
      if (result.success) {
        //  同步更新 cards 和 studyQueue
        const cardUuid = currentCard.uuid;
        
        const cardsIndex = cards.findIndex(c => c.uuid === cardUuid);
        if (cardsIndex !== -1) {
          cards[cardsIndex] = updatedCard;
          cards = [...cards];
        }
        
        const queueIndex = studyQueue.findIndex(c => c.uuid === cardUuid);
        if (queueIndex !== -1) {
          studyQueue[queueIndex] = updatedCard;
          studyQueue = [...studyQueue];
        }
        
        new Notice(t('studyInterface.notices.reminderSetAt', {
          time: reviewDateTime.toLocaleString()
        }));
        showReminderModal = false;
      } else {
        new Notice(t('studyInterface.notices.reminderSetFailed'));
      }
    } catch (error) {
      logger.error('Error setting reminder:', error);
      new Notice(t('studyInterface.notices.reminderSetError'));
    }
  }

  function handleChangePriority() {
    if (!currentCard) return;
    selectedPriority = (currentCard as any).priority || 2;
    showReminderModal = false;
    showPriorityModal = true;
  }

  function getPriorityText(priority: number): string {
    return [
      '',
      t('study.priority.low'),
      t('study.priority.medium'),
      t('study.priority.high'),
      t('study.priority.urgent')
    ][priority] || t('study.priority.medium');
  }

  async function savePriorityChange(priority: number, onSuccess?: () => void) {
    if (!currentCard) return;

    try {
      const nextContent = setCardProperties(currentCard.content || '', {
        we_priority: priority
      });

      // 更新卡片的优先级和 YAML
      const updatedCard = {
        ...currentCard,
        content: nextContent,
        priority,
        modified: new Date().toISOString()
      } as any;

      // 保存卡片
      const result = await saveMemoryCardCommand(plugin, updatedCard, 'update');
      if (result.success) {
        const savedCard = (result.data || updatedCard) as any;

        //  同步更新 cards 和 studyQueue
        const cardUuid = currentCard.uuid;
        
        const cardsIndex = cards.findIndex(c => c.uuid === cardUuid);
        if (cardsIndex !== -1) {
          cards[cardsIndex] = savedCard;
          cards = [...cards];
        }
        
        const queueIndex = studyQueue.findIndex(c => c.uuid === cardUuid);
        if (queueIndex !== -1) {
          studyQueue[queueIndex] = savedCard;
          studyQueue = [...studyQueue];
        }

        const priorityText = getPriorityText(priority);
        new Notice(t('studyInterface.notices.prioritySetTo', { priority: priorityText }));
        onSuccess?.();
      } else {
        new Notice(t('studyInterface.notices.prioritySetFailed'));
      }
    } catch (error) {
      logger.error('Error changing priority:', error);
      new Notice(t('studyInterface.notices.prioritySetError'));
    }
  }

  /**
   *  移动端菜单优先级变更处理（Obsidian Menu API 直接传递优先级值）
   */
  async function handleMobilePriorityChange(priority: number) {
    await savePriorityChange(priority);
  }


  // 防止牌组切换无限循环的状态
  // --- 牌组切换状态 ---
  let isDeckChanging = $state(false);

  function openAIActionManagerWithObsidianAPI() {
    void plugin.openAISplitConfigModal({
      availableDecks: decks,
      title: t('study.aiActionManager.splitConfigTitle')
    });
  }
  // 处理牌组切换（正式牌组单归属：重复点击清空，改选直接替换）
  async function handleChangeDeck(deckId: string) {
    if (!currentCard || isDeckChanging) {
      logger.debug('handleChangeDeck: 跳过 - 无当前卡片或正在切换中');
      return;
    }

    isDeckChanging = true;

    try {
      if (!plugin?.dataStorage) {
        new Notice(t('studyInterface.notices.dataStorageUnavailable'));
        return;
      }

      const targetDeck = decks.find((d) => d.id === deckId);
      if (!targetDeck) {
        new Notice(t('studyInterface.notices.targetDeckNotFound'));
        return;
      }

      const cardUuid = currentCard.uuid;
      const { primaryDeckId } = getCardDeckIds(currentCard, decks, { fallbackToReferences: false });
      const sourceDeckId = primaryDeckId || currentCard.deckId || '';
      const isSelected = sourceDeckId === deckId;
      const nextDeckId = isSelected ? WDECK_UNGROUPED_DECK_NAME : deckId;
      const result = await plugin.dataStorage.moveCardToDeck(cardUuid, sourceDeckId, nextDeckId);
      if (!result.success || !result.data) {
        throw new Error(result.error || t('studyInterface.notices.changeDeckFailed'));
      }

      const updatedCard: Card = result.data;

      cards = cards.map((c) => (c.uuid === cardUuid ? updatedCard : c));
      studyQueue = studyQueue.map((c) => (c.uuid === cardUuid ? updatedCard : c));

      // 强制刷新
      cards = [...cards];
      studyQueue = [...studyQueue];
      forceRefresh();

      new Notice(isSelected
        ? t('studyInterface.notices.removedFromDeck', { name: targetDeck.name })
        : t('studyInterface.notices.addedToDeck', { name: targetDeck.name }));
    } catch (error) {
      logger.error('Error changing deck:', error);
      try {
        new Notice(t('studyInterface.notices.changeDeckError'));
      } catch {
        logger.warn('[StudyInterface] 更换牌组时发生错误');
      }
    } finally {
      isDeckChanging = false;
    }
  }

  // 处理媒体自动播放设置变更
  async function handleMediaAutoPlayChange(setting: 'enabled' | 'mode' | 'timing' | 'interval', value: boolean | 'first' | 'all' | 'cardChange' | 'showAnswer' | number) {
    if (setting === 'enabled' && typeof value === 'boolean') {
      autoPlayMedia = value;
      plugin.settings.mediaAutoPlay = plugin.settings.mediaAutoPlay || { enabled: false, mode: 'first', timing: 'cardChange', playbackInterval: 2000 };
      plugin.settings.mediaAutoPlay.enabled = value;
    } else if (setting === 'mode' && (value === 'first' || value === 'all')) {
      playMediaMode = value;
      plugin.settings.mediaAutoPlay = plugin.settings.mediaAutoPlay || { enabled: false, mode: 'first', timing: 'cardChange', playbackInterval: 2000 };
      plugin.settings.mediaAutoPlay.mode = value;
    } else if (setting === 'timing' && (value === 'cardChange' || value === 'showAnswer')) {
      playMediaTiming = value;
      plugin.settings.mediaAutoPlay = plugin.settings.mediaAutoPlay || { enabled: false, mode: 'first', timing: 'cardChange', playbackInterval: 2000 };
      plugin.settings.mediaAutoPlay.timing = value;
    } else if (setting === 'interval' && typeof value === 'number') {
      playbackInterval = value;
      plugin.settings.mediaAutoPlay = plugin.settings.mediaAutoPlay || { enabled: false, mode: 'first', timing: 'cardChange', playbackInterval: 2000 };
      plugin.settings.mediaAutoPlay.playbackInterval = value;
    }
    
    try {
      await plugin.saveSettings();
    } catch (error) {
      logger.error('[StudyInterface] 保存媒体自动播放设置失败:', error);
    }
  }

  //  全局键盘监听器 - 修复 Obsidian 快捷键阻塞问题
  // 参照 ResizableModal.svelte 的成功实现，使用 <svelte:window> 全局监听
  // 只处理 ESC 键关闭学习界面，其他键让 Obsidian 快捷键系统处理
  function handleGlobalKeydown(event: KeyboardEvent) {
    //  编辑模式下完全不处理，让 Obsidian 快捷键正常工作
    if (showEditModal) return;
    
  }

  // 自动显示答案与快捷键绑定（编辑模态开启时暂停监听与自动计时）
  $effect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!showEditModal && plugin.settings.autoShowAnswerSeconds > 0 && !showAnswer) {
      timer = setTimeout(() => showAnswerCard(), plugin.settings.autoShowAnswerSeconds * 1000);
    }
    if (!showEditModal) document.addEventListener('keydown', handleKeyPress);
    return () => { document.removeEventListener('keydown', handleKeyPress); if (timer) clearTimeout(timer); };
  });

  // 高度自适应响应式监听（仅预览区，编辑器高度由 flex 布局决定）
  $effect(() => {
    if (modalRef && (showEditModal !== undefined || showAnswer !== undefined || statsCollapsed !== undefined)) {
      if (showEditModal) {
        return;
      }
      setTimeout(applyAdaptiveHeight, UI_TIMING.DOM_READY_DELAY);
    }
  });

  //  移动端编辑模式：切换 weave-edit-active 类
  // 用于隐藏头部和统计栏，提供沉浸式编辑体验
  $effect(() => {
    if (document.body.classList.contains('is-mobile') || document.body.classList.contains('is-phone')) {
      if (showEditModal) {
        document.body.classList.add('weave-edit-active');
      } else {
        document.body.classList.remove('weave-edit-active');
      }
    }
  });

  // 高度自适应计算
  let modalRef = $state<HTMLDivElement | null>(null);
  // --- 组件引用 ---
  let previewContainer = $state<any>(null);

  /**
   * 计算可用的内容区域高度
   */
  function calculateAvailableHeight(): number {
    if (!modalRef) return LAYOUT_SPACING.MIN_CONTAINER_HEIGHT;

    const modalRect = modalRef.getBoundingClientRect();
    const headerEl = modalRef.querySelector('.study-header') as HTMLElement;
    const footerEl = modalRef.querySelector('.study-footer') as HTMLElement;
    const statsEl = modalRef.querySelector('.stats-cards') as HTMLElement;

    let usedHeight = 0;

    // 计算已使用的高度
    if (headerEl) usedHeight += headerEl.offsetHeight;
    if (footerEl && !showEditModal) usedHeight += footerEl.offsetHeight; // 编辑状态无footer
    if (statsEl && !statsCollapsed) usedHeight += statsEl.offsetHeight;

    // 预留间距：顶部、底部、内部间距
    const reservedSpacing = showEditModal 
      ? LAYOUT_SPACING.EDITOR_RESERVED 
      : LAYOUT_SPACING.PREVIEW_RESERVED;

    return Math.max(
      LAYOUT_SPACING.MIN_CONTAINER_HEIGHT, 
      modalRect.height - usedHeight - reservedSpacing
    );
  }

  /**
   * 应用高度自适应
   * 编辑器高度由 CardEditorContainer 组件处理，这里只处理预览容器
   */
  function applyAdaptiveHeight(): void {
    const availableHeight = calculateAvailableHeight();

    // 为预览容器设置高度（编辑器高度由 CardEditorContainer 组件处理）
    const previewContainer = modalRef?.querySelector('.weave-preview-container') as HTMLElement;
    if (previewContainer && !showEditModal) {
      // 移除固定高度限制，改用min-height确保基础高度，允许内容自适应扩展
      previewContainer.style.height = 'auto';
      previewContainer.style.minHeight = `${Math.max(LAYOUT_SPACING.MIN_PREVIEW_HEIGHT, availableHeight)}px`;
      previewContainer.style.maxHeight = 'none';
    }
  }

  /**
   * 可访问性：焦点陷阱
   * 当编辑模态打开时，禁用学习模态的焦点陷阱，避免双重陷阱导致卡住
   */
  function trapFocus(e: FocusEvent) {
    if (showEditModal) return;
    if (!modalRef) return;
    const focusable = modalRef.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.target === document.body) first.focus();
    modalRef.addEventListener('keydown', (ke: KeyboardEvent) => {
      if (ke.key !== 'Tab') return;
      if (ke.shiftKey && document.activeElement === first) { ke.preventDefault(); (last as HTMLElement).focus(); }
      else if (!ke.shiftKey && document.activeElement === last) { ke.preventDefault(); (first as HTMLElement).focus(); }
    }, { once: true });
  }
  
  //  检测侧边栏是否需要紧凑模式（带防抖和稳定性检测）
  function checkSidebarScrollable() {
    //  如果是固定模式，不执行自动检测，保持紧凑模式（仅显示图标）
    if (sidebarCompactModeSetting === 'fixed') {
      sidebarCompactMode = true;
      lastCheckResult = true;
      return;
    }
    
    // 清除之前的防抖定时器
    if (checkTimeoutId !== null) {
      clearTimeout(checkTimeoutId);
      checkTimeoutId = null;
    }
    
    // 防抖：延迟执行实际检测
    checkTimeoutId = window.setTimeout(() => {
      performScrollCheck();
    }, 150); // 150ms 防抖延迟
  }

  function getSidebarScrollContainer(): HTMLElement | null {
    if (!modalRef) {
      return null;
    }

    return modalRef.querySelector('.sidebar-content .toolbar-actions-scroll') as HTMLElement | null
      ?? modalRef.querySelector('.sidebar-content .weave-vertical-toolbar') as HTMLElement | null;
  }
  
  // 实际执行检测的函数
  function performScrollCheck() {
    if (!modalRef) {
      return;
    }
    
    // 方案A：视口高度检测（兜底方案）
    const viewportHeight = window.innerHeight;
    const viewportTooSmall = viewportHeight < 750;
    
    // 方案B：检测真正的滚动容器 .weave-vertical-toolbar
    const sidebarContent = getSidebarScrollContainer();
    let contentScrollable = false;
    
    if (sidebarContent) {
      const scrollHeight = sidebarContent.scrollHeight;
      const clientHeight = sidebarContent.clientHeight;
      
      //  关键：增加阈值避免临界值抖动
      // 进入紧凑模式：需要超过 20px 才触发
      // 退出紧凑模式：需要小于 -20px 才退出
      const threshold = sidebarCompactMode ? -20 : 20;
      const diff = scrollHeight - clientHeight;
      contentScrollable = diff > threshold;
    }
    
    // 双重检测：任一条件满足即触发紧凑模式
    const shouldCompact = viewportTooSmall || contentScrollable;
    
    //  状态稳定性检测：只在状态真正需要改变时才改变
    if (lastCheckResult !== shouldCompact) {
      sidebarCompactMode = shouldCompact;
      lastCheckResult = shouldCompact;
    }
  }
  
  // 保存视图偏好到 plugin.settings（使用 Obsidian 官方持久化方案）
  async function persistStudyInterfaceViewPreferences(
    overrides: Partial<StudyInterfaceViewPreferences> = {}
  ) {
    await plugin.saveStudyInterfaceViewPreferences({
      ...collectStudyInterfaceViewPreferencesFromBindings({
        showSidebar,
        sidebarCompactModeSetting,
        statsCollapsed,
        cardOrder,
        choiceOptionOrder,
        ratingLabelStyle,
        isGraphLinkEnabled,
      }),
      ...overrides,
    });
  }

  async function saveViewPreferences() {
    try {
      await persistStudyInterfaceViewPreferences();
      logger.debug('✅ 学习界面视图偏好已保存到插件本地 state/');
    } catch (error) {
      logger.error('[StudyInterface] ❌ 保存视图偏好失败:', error);
    }
  }

  // 处理直接删除开关切换
  async function handleDirectDeleteToggle(enabled: boolean) {
    enableDirectDelete = enabled;
    plugin.settings.enableDirectDelete = enabled;
    try {
      await plugin.saveSettings();
      logger.debug('直接删除设置已保存:', enabled);
    } catch (error) {
      logger.error('[StudyInterface] 保存直接删除设置失败:', error);
    }
  }

  async function handleClozeModeSwitchButtonToggle(enabled: boolean) {
    showClozeModeSwitchButton = enabled;
    plugin.settings.showClozeModeSwitchButton = enabled;
    try {
      await plugin.saveSettings();
      logger.debug('作答方式切换按钮显示设置已保存:', enabled);
    } catch (error) {
      logger.error('[StudyInterface] 保存作答方式切换按钮显示设置失败:', error);
    }
  }

  // 处理超时自动暂停计时设置变化
  async function handleTimerAutoPauseChange(seconds: number) {
    timerAutoPauseSeconds = seconds;
    studyTimer.setAutoPauseSeconds(seconds);
    plugin.settings.timerAutoPauseSeconds = seconds;
    try {
      await plugin.saveSettings();
      logger.debug('超时自动暂停计时设置已保存:', seconds);
    } catch (error) {
      logger.error('[StudyInterface] 保存超时自动暂停计时设置失败:', error);
    }
  }

  // 处理卡片学习顺序变化
  async function handleCardOrderChange(order: 'sequential' | 'random') {
    cardOrder = order;
    if (queueInitialized && orderedBaseStudyQueue.length > 0) {
      const currentCardId = studyQueue[currentCardIndex]?.uuid;
      const reordered = reorderStudyQueuePreservingCurrentCard(
        orderedBaseStudyQueue,
        order,
        currentCardId
      );
      studyQueue = reordered.queue;
      currentCardIndex = reordered.currentIndex;
    }
    try {
      await persistStudyInterfaceViewPreferences({ cardOrder: order });
      const orderLabel = order === 'sequential'
        ? t('studyInterface.notices.cardOrderSequential')
        : t('studyInterface.notices.cardOrderRandom');
      new Notice(t('studyInterface.notices.cardOrderChanged', { orderLabel }));
      logger.debug('卡片学习顺序设置已保存:', order);
    } catch (error) {
      logger.error('[StudyInterface] 保存卡片学习顺序设置失败:', error);
      new Notice(t('studyInterface.notices.cardOrderChangeFailed'));
    }
  }

  async function handleChoiceOptionOrderChange(order: ChoiceOptionOrder) {
    choiceOptionOrder = order;
    try {
      await persistStudyInterfaceViewPreferences({ choiceOptionOrder: order });
      forceRefresh();
      const orderLabel = order === 'sequential'
        ? t('studyInterface.notices.choiceOptionOrderSequential')
        : t('studyInterface.notices.choiceOptionOrderRandom');
      new Notice(t('studyInterface.notices.choiceOptionOrderChanged', { orderLabel }));
      logger.debug('选择题选项顺序设置已保存:', order);
    } catch (error) {
      logger.error('[StudyInterface] 保存选择题选项顺序设置失败:', error);
      new Notice(t('studyInterface.notices.choiceOptionOrderChangeFailed'));
    }
  }

  async function handleRatingLabelStyleChange(style: RatingLabelStyle) {
    ratingLabelStyle = normalizeRatingLabelStyle(style);
    try {
      await persistStudyInterfaceViewPreferences({
        ratingLabelStyle,
        showRatingIntervalOnButtons: shouldShowRatingIntervalOnButtons(ratingLabelStyle),
      });
      const styleLabel = getRatingLabelStyleLabel(ratingLabelStyle, t);
      new Notice(t('studyInterface.notices.ratingLabelStyleChanged', { styleLabel }));
    } catch (error) {
      logger.error('[StudyInterface] 保存回忆按钮风格设置失败:', error);
      new Notice(t('studyInterface.notices.ratingLabelStyleChangeFailed'));
    }
  }
  
  //  处理紧凑模式设置变化
  async function handleCompactModeSettingChange(setting: 'auto' | 'fixed') {
    sidebarCompactModeSetting = setting;
    
    // 立即应用新设置
    if (setting === 'fixed') {
      // 固定紧凑模式：仅显示图标
      sidebarCompactMode = true;
      lastCheckResult = true;
      new Notice(t('studyInterface.notices.sidebarFixedCompact'));
    } else {
      // 自动调整模式：根据内容动态检测
      new Notice(t('studyInterface.notices.sidebarAutoMode'));
      
      // 强制重置缓存，确保重新评估状态
      lastCheckResult = null;
      
      // 立即执行一次检测并更新状态
      setTimeout(() => {
        performScrollCheck();
      }, 100);
    }

    try {
      await persistStudyInterfaceViewPreferences({ sidebarCompactModeSetting: setting });
    } catch (error) {
      logger.error('[StudyInterface] 保存侧边栏紧凑模式设置失败:', error);
    }
  }
  
  //  初始化智能推荐服务
  $effect(() => {
    if (!loadBalanceManager && dataStorage && fsrs) {
      const loadConfig = plugin.settings.loadBalance;
      loadBalanceManager = new LoadBalanceManager(
        dataStorage,
        fsrs,
        loadConfig ? {
          dailyCapacity: loadConfig.dailyCapacity,
          thresholds: loadConfig.thresholds,
          smartFuzz: {
            enabled: true,
            range: loadConfig.fuzzRangeDays,
            algorithm: loadConfig.fuzzMethod
          },
          forecast: {
            days: loadConfig.forecast.defaultDays,
            includeEstimated: true
          }
        } : undefined
      );
    }
    
  });
  
  function handleCardSelect(cardId: string) {
    // 切换到指定卡片
    const index = cards.findIndex(c => c.uuid === cardId);
    if (index >= 0) {
      currentCardIndex = index;
      showAnswer = false;
    }
  }
  
  function handleOpenSourceNote() {
    if (!currentCard?.sourceFile) return;
    
    // 当前先提供提示，避免点击后无反馈。
    new Notice(t('studyInterface.notices.openingNote', { path: currentCard.sourceFile }));
  }
  
  /**
   *  打开源文本块（跳转到卡片来源位置）
   * 使用 Obsidian 原生 openLinkText API，支持仅文件名格式
   * 添加文件存在性检查，防止创建新文档
   */
  async function handleOpenSourceBlock() {
    const content = currentCard?.content || '';
    const parsedSource = parseSourceInfo(content);
    const epubSource = parseEpubSourceInfo(content);
    const sourceFile = epubSource.sourceFile || parsedSource.sourceFile || currentCard?.sourceFile;

    if (!sourceFile) {
      new Notice(t('studyInterface.notices.noSourceFile'));
      return;
    }
    
    try {
      const app = plugin.app;
      const contextPath = app.workspace.getActiveFile()?.path ?? '';
      // 移除 .md 后缀，使用 wikilink 格式
      const docName = sourceFile.replace(/\.md$/, '');
      
      // 验证文件是否存在
      const file = app.vault.getAbstractFileByPath(sourceFile) ?? app.metadataCache.getFirstLinkpathDest(docName, contextPath);
      if (!file) {
        new Notice(t('studyInterface.notices.sourceDocMissing'));
        return;
      }
      
      // EPUB文件：拦截到插件内置阅读器
      if (file.path.toLowerCase().endsWith('.epub')) {
        const { EpubLinkService } = await import('../../services/epub-integration/EpubLinkService');
        const linkService = new EpubLinkService(app);
        await linkService.navigateToEpubLocation(file.path, epubSource.cfi || '', epubSource.text || '');
        new Notice(t('studyInterface.notices.epubSourceOpened'));
        return;
      }
      
      const blockId = (parsedSource.sourceBlock || (currentCard as any).sourceBlock)?.replace(/^\^/, '');
      
      // 构建 wikilink 格式：文档名#^blockId
      const linkText = blockId ? `${docName}#^${blockId}` : docName;
      
      // 使用 Obsidian 原生 API 跳转，自动处理文件查找和块定位
      await openLinkWithExistingLeaf(app, linkText, contextPath, { focus: true });
      
      new Notice(t('studyInterface.notices.sourceOpened', { path: sourceFile }));
    } catch (error) {
      logger.error('打开源文件失败:', error);
      new Notice(t('studyInterface.notices.sourceOpenFailed'));
    }
  }

  function handleOpenGraphLeaf() {
    // 当前先提供提示，等图谱入口合并后再接入实际跳转。
    new Notice(t('studyInterface.notices.graphInDevelopment'));
  }
  
  onMount(() => {
    document.addEventListener('focus', trapFocus, true);

    //  移动端：添加学习界面激活类，用于隐藏 Obsidian 顶部栏
    if (document.body.classList.contains('is-phone')) {
      document.body.classList.add('weave-study-active');
    }

    const handleResize = () => {
      if (!showEditModal) {
        setTimeout(applyAdaptiveHeight, 100);
      }
      setTimeout(checkSidebarScrollable, 150);
    };
    window.addEventListener('resize', handleResize);

    // 初始化高度自适应
    setTimeout(() => {
      const el = modalRef as HTMLDivElement | null;
      if (el && typeof (el as any).focus === 'function') {
        el.focus();
      }
      applyAdaptiveHeight();
    }, 100);
    
    //  初始侧边栏检测（只执行一次）
    setTimeout(() => checkSidebarScrollable(), 500);
    
    //  设置 ResizeObserver 监听侧边栏内容变化（带尺寸缓存防止无限触发）
    setTimeout(() => {
      if (!modalRef) return;
      
      const sidebarContent = getSidebarScrollContainer();
      if (sidebarContent) {
        sidebarResizeObserver = new ResizeObserver((entries) => {
          try {
            //  固定模式下不执行动态检测，避免不必要的计算
            if (sidebarCompactModeSetting === 'fixed') {
              return;
            }
            
            for (const entry of entries) {
              const newWidth = entry.contentRect.width;
              const newHeight = entry.contentRect.height;
              
              //  关键：只有尺寸真正变化超过阈值时才触发检测
              const widthDiff = Math.abs(newWidth - lastContentSize.width);
              const heightDiff = Math.abs(newHeight - lastContentSize.height);
              
              if (widthDiff > 5 || heightDiff > 5) {
                lastContentSize = { width: newWidth, height: newHeight };
                checkSidebarScrollable();
              }
            }
          } catch (error) {
            //  捕获 ResizeObserver 循环警告，避免传播到全局错误处理器
            if (error instanceof Error && error.message.includes('ResizeObserver')) {
              // 忽略 ResizeObserver 循环警告，这是无害的
              return;
            }
            logger.error('[StudyInterface] ResizeObserver error:', error);
          }
        });
        sidebarResizeObserver.observe(sidebarContent);
      }
    }, 500);

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });
  onDestroy(() => {
    if (saveTimeoutId !== null) {
      clearTimeout(saveTimeoutId);
      saveTimeoutId = null;
    }

    void plugin.flushStudyInterfaceViewPreferences().catch((error) => {
      logger.error('[StudyInterface] 离开学习界面时保存视图偏好失败:', error);
    });

    if (viewInstance && typeof viewInstance.setPopulatePaneMenuCallback === 'function') {
      viewInstance.setPopulatePaneMenuCallback(null);
    }
    if (viewInstance && typeof viewInstance.setMobilePanelStateGetter === 'function') {
      viewInstance.setMobilePanelStateGetter(null);
    }

    document.removeEventListener('focus', trapFocus, true);

    //  移动端：移除学习界面激活类
    document.body.classList.remove('weave-study-active');
    document.body.classList.remove('weave-edit-active');

    //  清理侧边栏滚动检测
    if (sidebarResizeObserver) {
      sidebarResizeObserver.disconnect();
      sidebarResizeObserver = null;
    }
    
    //  清理防抖定时器
    if (checkTimeoutId !== null) {
      clearTimeout(checkTimeoutId);
      checkTimeoutId = null;
    }

    // 清理倒计时定时器
    if (countdownTimerId !== null) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }

    // 清理学习会话编辑器资源
    if (editorPoolManager) {
      logger.debug(' 🧹 清理学习会话编辑器资源');
      
      // 清理所有编辑器会话
      editorPoolManager.cleanup();
    }

    // 清理学习会话
    if (currentSessionId) {
      sessionManager.dispose(currentSessionId);
      logger.debug(' 会话已清理:', currentSessionId);
    }
  });

  // setupBlockLinkHandlers 已提取到 utils/study/studyInterfaceUtils.ts
</script>

<!--  全局键盘监听 - 修复 Obsidian 快捷键阻塞问题 -->
<!-- 参照 ResizableModal.svelte 的成功实现，在 window 对象上监听键盘事件 -->
<!-- 这样可以避免被 aria-modal="true" 的元素阻塞事件传播 -->
<svelte:window onkeydown={handleGlobalKeydown} />

<div
  class="study-interface-overlay"
  class:mobile-edit-mode={Platform.isMobile && showEditModal}
  role="presentation"
  ondrop={(e) => e.preventDefault()}
  ondragover={(e) => e.preventDefault()}
  ondragleave={(e) => e.preventDefault()}
>
  <div
    class="study-interface-content"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    bind:this={modalRef}
    onclick={(e) => {
      // Svelte 5: 不阻止传播，让事件系统正常工作
    }}
    onkeydown={(e) => {
      // Svelte 5: 不阻止传播，让事件系统正常工作
    }}
  >
    <!-- 头部工具栏 -->
    <StudyHeader
      {currentDeckName}
      {currentIndexDisplay}
      cardsLength={studyQueue.length}
      {statsCollapsed}
      {sourceInfoCollapsed}
      showSourceInfoToggle={showSourceInfoToggle}
      {showSidebar}
      {session}
      {dataStorage}
      {progressBarRefreshTrigger}
      referencedDecks={currentCardReferencedDecks}
      cards={cards}
      onToggleStats={() => {
        statsCollapsed = !statsCollapsed;
        if (!statsCollapsed) sourceInfoCollapsed = true;
      }}
      onToggleSourceInfo={() => {
        sourceInfoCollapsed = !sourceInfoCollapsed;
        if (!sourceInfoCollapsed) statsCollapsed = true;
      }}
      onToggleSidebar={() => showSidebar = !showSidebar}
    />

    <!-- 主要内容区域 -->
    <div class="study-content" class:with-sidebar={showSidebar} class:editing={showEditModal}>
      <!-- 主学习区域 -->
      <div class="main-study-area">
        {#if currentCard}
          <!--  学习进度统计栏（移动端专用，与FSRS信息栏互斥） -->
          {#if isMobile && !showEditModal && deckStats}
            <MobileProficiencyStatsBar 
              expanded={showProficiencyStats} 
              stats={{
                newCards: deckStats.newCards,
                learningCards: deckStats.learningCards,
                reviewCards: deckStats.reviewCards
              }}
            />
          {/if}
          
          <!--  卡片计时信息栏（移动端专用） -->
          {#if isMobile && !showEditModal}
            <MobileTimingInfoBar 
              expanded={showTimingInfo} 
              currentTime={currentStudyTime}
              averageTime={(currentCard?.stats?.averageTime || 0) * 1000}
              difficulty={currentCard?.fsrs?.difficulty || 5}
            />
          {/if}
          
          <!-- 来源信息栏（独立折叠控制） -->
          {#if !showEditModal && !sourceInfoCollapsed}
            <SourceInfoBar
              card={currentCard}
              {plugin}
              studyQueue={studyQueue}
              onOpenSource={handleOpenSourceBlock}
            />
          {/if}

          <!-- 统计卡片（可折叠） -->
          {#if !showEditModal && !statsCollapsed}
            <StatsCards card={currentCard} {fsrs} />
          {/if}

          <!-- 卡片学习区域 - 预览与编辑互斥显示，高度自适应 -->
          <div class="card-study-container">
            <div class="card-container" class:editing={showEditModal}>
              {#if showEditModal}
                <!-- 编辑器容器组件 -->
                <CardEditorContainer
                  {plugin}
                  card={editTargetCard || currentCard}
                  editorSessionId={editorSessionId}
                  {showEditModal}
                  tempFileUnavailable={editorUnavailable}
                  isClozeMode={isClozeMode}
                  editorPoolManager={editorPoolManager}
                  dataStorage={dataStorage}
                  {modalRef}
                  {statsCollapsed}
                  onEditComplete={async (updatedCard) => {
                    const previousStudyCard = currentCard;
                    const previousEditTarget = editTargetCard;

                    const saveResult = await persistEditedStudyCard(updatedCard);
                    if (!saveResult.success) {
                      if (saveResult.cancelled) {
                        logger.info('[StudyInterface] 用户取消了保存，返回编辑模式');
                        return;
                      }
                      logger.error('[StudyInterface] 卡片保存失败:', saveResult.error);
                      new Notice(t('study.view.saveFailed', {
                        error: saveResult.error || t('study.view.unknownError')
                      }));
                      return;
                    }

                    const persistedCard = saveResult.card;
                    if (!isStagingSession) {
                      logger.debug('[StudyInterface] 卡片已保存到数据库:', persistedCard.uuid);
                    }
                    
                    notifyCardTypeChange(previousEditTarget, persistedCard);

                    if (previousStudyCard) {
                      if (isProgressiveEditContext(persistedCard, previousStudyCard, previousEditTarget)) {
                        await syncStudyQueueAfterProgressiveEdit(persistedCard, previousStudyCard, previousEditTarget);
                      } else {
                        syncStudyQueueAfterRegularEdit(persistedCard, previousStudyCard);
                      }
                    }
                    
                    showEditModal = false;
                    editTargetCard = null;
                    editorUnavailable = false;
                    isClozeMode = false;
                  }}
                  onEditCancel={handleEditorCancel}
                />
              {:else}
            <!-- 新的预览系统 - 统一处理所有题型 -->
            <PreviewContainer
              bind:this={previewContainer}
              card={currentCard}
              {showAnswer}
              {choiceOptionOrder}
              {refreshTrigger}
              plugin={plugin}
              activeClozeOrdinal={activeClozeOrdinal}
              enableAnimations={true}
              enableAnswerControls={false}
              themeMode="auto"
              renderingMode="quality"
              onCardTypeDetected={handleCardTypeDetected}
              onPreviewReady={handlePreviewReady}
              onAddToErrorBook={handleAddToErrorBook}
              onRemoveFromErrorBook={handleRemoveFromErrorBook}
              {currentResponseTime}
              onClozeModeChange={handlePreviewClozeModeChange}
              isClozeModeSaving={isClozeModeSaving}
            />

          {/if}
            </div><!-- 关闭 card-container -->
          </div><!-- 关闭 card-study-container -->
        {/if}

      <!-- 子卡片浮层 -->
      {#if currentCard && !showEditModal && showChildCardsOverlay}
        <ChildCardsOverlay 
          {childCards}
          {regeneratingCardIds}
          {isRegenerating}
          bind:this={childCardsOverlayRef}
        />
      {/if}

      <!-- 统一操作栏 - 只在子卡片模式下显示 -->
      {#if currentCard && !showEditModal && showChildCardsOverlay}
        <UnifiedActionsBar
          showChildOverlay={showChildCardsOverlay}
          selectedCount={childCardsOverlayRef?.getSelectedCardIds?.().length || 0}
          onReturn={handleCloseChildOverlay}
          onRegenerate={handleRegenerateChildCards}
          onSave={handleSaveSelectedChildCards}
          canUndo={reviewUndoManager.canUndo()}
          onUndo={handleUndoReview}
          {isRegenerating}
          showDeckSelector={currentSplitAction !== null}
          availableDecks={availableDecksList}
          selectedDeckId={targetDeckIdForSplit}
          onDeckChange={handleSplitDeckChange}
        />
      {/if}

      <!-- 卡片详细信息模态窗由全局方法 plugin.openViewCardModal() 处理 -->

      <!-- 底部功能栏 - 移到Grid内部 -->
      {#if currentCard && !showEditModal}
        <div class="study-footer">
          <!-- 底部左侧工具行：未显示答案时显示挖空模式切换；显示答案后显示返回预览/撤销 -->
          {#if showStudyClozeModeToggle || showAnswer}
            <div class="footer-top-controls">
              {#if showStudyClozeModeToggle}
                <div class="footer-cloze-mode-switch" role="group" aria-label={t('studyInterface.clozeMode.switchAriaLabel')}>
                  <span class="cloze-mode-label">{t('studyInterface.clozeMode.label')}</span>
                  <div class="cloze-mode-segmented">
                    <button
                      type="button"
                      class="clickable-icon cloze-mode-btn"
                      class:active={currentStudyClozeMode === 'reveal'}
                      onclick={() => handlePreviewClozeModeChange('reveal')}
                      disabled={isClozeModeSaving || currentStudyClozeMode === 'reveal'}
                      aria-pressed={currentStudyClozeMode === 'reveal'}
                    >
                      {t('studyInterface.clozeMode.reveal')}
                    </button>
                    <button
                      type="button"
                      class="clickable-icon cloze-mode-btn"
                      class:active={currentStudyClozeMode === 'input'}
                      onclick={() => handlePreviewClozeModeChange('input')}
                      disabled={isClozeModeSaving || currentStudyClozeMode === 'input'}
                      aria-pressed={currentStudyClozeMode === 'input'}
                    >
                      {t('studyInterface.clozeMode.input')}
                    </button>
                  </div>
                </div>
              {/if}

              {#if showAnswer}
                <!-- 返回预览按钮 -->
                <button
                  type="button"
                  class="clickable-icon footer-side-action-btn return-btn"
                  onclick={undoShowAnswer}
                  title={t('studyInterface.labels.returnToPreview')}
                  aria-label={t('studyInterface.labels.returnToPreviewAria')}
                >
                  <ObsidianIcon name="chevron-left" size={16} />
                </button>
                
                <!-- 撤销按钮 -->
                <button
                  type="button"
                  class="clickable-icon footer-side-action-btn undo-btn"
                  onclick={undoCount > 0 ? handleUndoReview : undefined}
                  title={undoCount > 0 ? t('studyInterface.notices.undoLastRating') : t('studyInterface.notices.nothingToUndo')}
                  disabled={undoCount === 0}
                >
                  <ObsidianIcon name="rotate-ccw" size={16} />
                  {#if undoCount > 0}
                    <span class="footer-side-action-badge">{undoCount}</span>
                  {/if}
                </button>
              {/if}
            </div>
          {/if}
          
          <RatingSection
            card={currentCard}
            {fsrs}
            {showAnswer}
            onRate={rateCard}
            onShowAnswer={showAnswerCard}
            cardType={detectedCardType}
            learningConfig={learningConfig ?? undefined}
            learningStepIndex={currentSessionId ? sessionManager.getSessionState(currentSessionId)?.learningStepIndex : undefined}
            {ratingLabelStyle}
            shortcutEnabled={plugin.settings.enableShortcuts}
          />
        </div>
      {/if}
      <!-- 提醒设置浮窗 -->
      <FloatingMenu
        bind:show={showReminderModal}
        anchor={reminderAnchorElement}
        placement="left-start"
        onClose={() => showReminderModal = false}
        class="study-side-panel-menu"
      >
        {#snippet children()}
          <div class="study-side-panel reminder-modal" role="dialog" aria-modal="true" tabindex="-1">
            <div class="modal-header">
              <h3>{t('studyInterface.labels.setReminder')}</h3>
              <button class="modal-close" onclick={() => showReminderModal = false}>×</button>
            </div>
            <div class="modal-body">
              <p class="modal-description">{t('studyInterface.labels.reminderDescription')}</p>
              <div class="form-group">
                <label for="review-date">{t('studyInterface.labels.reviewDate')}</label>
                <input id="review-date" type="date" bind:value={customReviewDate} class="date-input" />
              </div>
              <div class="form-group">
                <label for="review-time">{t('studyInterface.labels.reviewTime')}</label>
                <input id="review-time" type="time" bind:value={customReviewTime} class="time-input" />
              </div>
              <div class="warning-message">
                <EnhancedIcon name="info" size="16" />
                <span>{t('studyInterface.labels.reminderNotice')}</span>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" onclick={() => showReminderModal = false}>{t('settings.actions.cancel')}</button>
              <button class="btn-primary" onclick={confirmSetReminder}>{t('studyInterface.labels.confirmSet')}</button>
            </div>
          </div>
        {/snippet}
      </FloatingMenu>

      <PriorityPickerPopover
        bind:show={showPriorityModal}
        anchor={priorityAnchorElement}
        currentPriority={selectedPriority}
        onSelect={(priority) => void savePriorityChange(priority)}
        onClose={() => showPriorityModal = false}
      />

      </div><!-- 关闭 main-study-area -->

      <!-- 右侧垂直工具栏 -->
      {#if currentCard && showSidebar && !(Platform.isMobile && showEditModal)}
        <div class="sidebar-content">
          <VerticalToolbar
            compactMode={sidebarCompactMode}
            compactModeSetting={sidebarCompactModeSetting}
            onCompactModeSettingChange={handleCompactModeSettingChange}
            card={currentCard}
            currentCardTime={currentStudyTime}
            {averageTime}
            {plugin}
            decks={decks}
            isEditing={showEditModal}
            tempFileUnavailable={editorUnavailable}
            onToggleEdit={handleToggleEdit}
            onDelete={handleDeleteCard}
            onSetReminder={handleSetReminder}
            onChangePriority={handleChangePriority}
            onReminderAnchorChange={(element) => reminderAnchorElement = element}
            onPriorityAnchorChange={(element) => priorityAnchorElement = element}
            onPanelOpen={() => { showReminderModal = false; showPriorityModal = false; }}
            onRecycleCard={suspendCurrentCard}
            onChangeDeck={handleChangeDeck}
            {enableDirectDelete}
            onDirectDeleteToggle={handleDirectDeleteToggle}
            {showClozeModeSwitchButton}
            onClozeModeSwitchButtonToggle={handleClozeModeSwitchButtonToggle}
            {cardOrder}
            onCardOrderChange={handleCardOrderChange}
            {choiceOptionOrder}
            onChoiceOptionOrderChange={handleChoiceOptionOrderChange}
            {ratingLabelStyle}
            onRatingLabelStyleChange={handleRatingLabelStyleChange}
            onOpenPlainEditor={() => {
              editorUnavailable = true;
              showEditModal = true;
            }}
            onSplitCard={(actionId) => handleAISplit(actionId, 0)}
            onManageFormatActions={openAIActionManagerWithObsidianAPI}
            onOpenDetailedView={handleOpenViewCardModal}
            {autoPlayMedia}
            {playMediaMode}
            {playMediaTiming}
            {playbackInterval}
            onMediaAutoPlayChange={handleMediaAutoPlayChange}
            isGraphLinked={isGraphLinkEnabled}
            onGraphLinkToggle={handleGraphLinkToggle}
            onGraphLeafChange={handleGraphLeafChange}
            {isPremium}
            {timerAutoPauseSeconds}
            onTimerAutoPauseChange={handleTimerAutoPauseChange}
          />
        </div><!-- 关闭 sidebar-content -->
      {/if}

    </div><!-- 关闭 study-content -->

  </div><!-- 关闭 study-interface-content -->
  
</div><!-- 关闭 study-interface-overlay -->

<!-- 模板选择列表（锚定到功能键左侧展开） -->
{#if showTemplateList}
  <div class="menu-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={(event) => closeOnBackdropClick(event, handleCloseTemplateList)} onkeydown={(event) => closeOnEscape(event, handleCloseTemplateList)}>
    <div
      class="template-menu"
      role="menu"
      tabindex="0"
      bind:this={templateMenuEl}
      style={`top:${templateMenuTop}px; left:${templateMenuLeft}px;`}
      onkeydown={(_e) => {
        // 其他键不阻止传播，让编辑器接收 Obsidian 快捷键
      }}
    >
      <div class="template-dropdown-list">
        {#if templateList.length > 0}
          {#each templateList as template}
            {@const isCurrent = currentCard && template.id === currentCard.templateId}
            <div class="template-dropdown-item" class:current={isCurrent} onclick={() => handleTemplateSelect(template)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && handleTemplateSelect(template)}>
              <span class="template-name">{template.name}</span>
              {#if isCurrent}
                <span class="current-marker">[*]</span>
              {/if}
            </div>
          {/each}
        {:else}
          <div class="no-templates-message">{t('studyInterface.labels.noTemplates')}</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

  <style>
    /* 主题系统变量 */
    .study-interface-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(17, 17, 17, 0.88);
    backdrop-filter: blur(8px);
    z-index: var(--weave-z-float);
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--weave-study-view-spacing, 12px);
  }

  .study-interface-content {
    --weave-study-page-bg: var(--weave-surface-background, var(--background-primary));
    --weave-study-panel-bg: var(--weave-elevated-background, var(--background-secondary));
    --weave-study-panel-alt-bg: color-mix(
      in srgb,
      var(--weave-study-panel-bg) 88%,
      var(--weave-study-page-bg)
    );
    background: var(--weave-study-page-bg);
    border-radius: var(--radius-l, 12px);
    width: 100%;
    max-width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-shadow: var(--weave-shadow-xl);
    border: 1px solid var(--background-modifier-border);
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
  }

  /* 头部工具栏样式已移至 StudyHeader.svelte 组件 */

  /* 主要内容区域 - Grid布局优化 */
  .study-content {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr auto; /* 主内容区自适应 + 侧边栏 */
    grid-template-rows: 1fr auto; /* 内容区自适应 + 底部栏 */
    overflow: hidden;
    transition: all 0.3s ease;
    min-height: 0; /* 允许flex子元素收缩 */
    
    /* Grid自动流，允许元素按照grid定位自动排列 */
    grid-auto-flow: dense;
  }
  
  /* 当侧边栏隐藏时，恢复单列布局 */
  .study-content:not(.with-sidebar) {
    grid-template-columns: 1fr;
  }

  /* 编辑模式下（没有footer），调整网格行为单行 */
  .study-content.editing {
    grid-template-rows: 1fr; /* 只有一行 */
  }

  /* 主学习区域 - Grid布局优化 */
  .main-study-area {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-height: 0; /* 允许flex子元素收缩 */
    overflow: hidden;
    position: relative; /* 为模态窗提供定位上下文 */
  }

  /* 侧边栏内容容器 - 延伸到底部 */
  .sidebar-content {
    grid-column: 2;
    grid-row: 1 / 3; /* 跨越两行，延伸到底部 */
    display: flex;
    flex-direction: column;
    width: 70px;
    flex-shrink: 0;
    min-height: 0;
    overflow: hidden;
    position: relative;
    z-index: 4;
  }

  /* 卡片学习容器 - 高度自适应优化，合理间距设计 */
  .card-study-container {
    flex: 1;
    padding: var(--weave-space-md, 1rem); /* 恢复合理间距 */
    overflow: visible; /* 不滚动容器，让内容自己滚动 */
    display: flex;
    align-items: stretch; /* 改为 stretch，让子元素填充高度 */
    justify-content: center; /* 居中显示卡片容器 */
    min-height: 0; /* 允许flex子元素收缩 */
  }

  .card-container {
    /* 极简透明容器 - 只负责布局 */
    width: min(100%, 1300px);
    max-width: 100%;
    height: 100%; /* 确保填充父容器的全部高度 */
    
    /* 移除所有视觉样式 */
    border: none;
    border-radius: 0;
    padding: var(--weave-space-md);
    background: transparent;
    box-shadow: none;
    
    /* 保留布局功能 */
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  
  /*  编辑模式时移除card-container的padding，让编辑器占满空间 */
  .card-container.editing {
    padding: 0;
    overflow: hidden;
    flex: 1;
    min-height: 0;
  }

  /* 新的预览系统样式已移至 PreviewContainer 组件 */




  /* 桌面端不进行布局重排，侧边栏始终在右侧，头部始终水平 */
  /* 移动端布局由 :global(body.is-phone) / :global(body.is-mobile) 控制 */

  /* 增强动画效果 */
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes bounceIn {
    0% {
      opacity: 0;
      transform: scale(0.3);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes statsSlideDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
      max-height: 0;
    }
    to {
      opacity: 1;
      transform: translateY(0);
      max-height: 200px;
    }
  }

  @keyframes progressPulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(var(--weave-info-rgb), 0.4);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(var(--weave-info-rgb), 0);
    }
  }

  .study-interface-content {
    animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }



  .card-container {
    animation: fadeIn 0.4s ease-out 0.2s both;
  }


  /* 提醒和优先级浮窗样式 - 统一复用侧边功能栏 FloatingMenu 定位逻辑 */
  :global(.study-side-panel-menu) {
    min-width: 300px;
    max-width: 340px;
  }

  /* 移动端：提醒/优先级浮窗改为屏幕居中，避免锚点缺失时跑到左上角 */
  :global(body.is-mobile) :global(.floating-menu.study-side-panel-menu),
  :global(body.is-phone) :global(.floating-menu.study-side-panel-menu) {
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    animation: none !important;
    width: min(92vw, 340px);
    max-width: 92vw;
    min-width: 0;
  }

  :global(body.is-mobile) .study-side-panel,
  :global(body.is-mobile) .reminder-modal,
  :global(body.is-mobile) .priority-modal,
  :global(body.is-phone) .study-side-panel,
  :global(body.is-phone) .reminder-modal,
  :global(body.is-phone) .priority-modal {
    width: min(92vw, 340px);
    min-width: 0;
    max-width: 92vw;
    max-height: min(78vh, 640px);
  }

  .study-side-panel,
  .reminder-modal,
  .priority-modal {
    position: relative;
    background: var(--weave-study-panel-bg);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    box-shadow: var(--shadow-s);
    min-width: 300px;
    max-width: 340px;
    max-height: min(70vh, 720px);
    overflow: hidden;
    animation: slideInRight 0.2s ease-out;
  }

  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--weave-study-panel-alt-bg);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .modal-close {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    font-size: 1.2rem;
    line-height: 1;
    transition: all 0.15s ease;
  }

  .modal-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .modal-body {
    padding: 1.5rem;
  }

  .modal-description {
    margin: 0 0 1rem 0;
    color: var(--text-normal);
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-normal);
    font-weight: 500;
    font-size: 0.9rem;
  }

  .date-input,
  .time-input {
    width: 100%;
    padding: 0.75rem;
    border: 1.5px solid var(--background-modifier-border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--weave-study-panel-bg) 84%, var(--weave-study-page-bg));
    color: var(--text-normal);
    font-size: 0.95rem;
    transition: all 0.2s ease;
  }

  .date-input:focus,
  .time-input:focus {
    outline: none;
    border-color: var(--text-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--text-accent) 20%, transparent);
  }

  .warning-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: color-mix(in srgb, var(--text-warning) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--text-warning) 30%, transparent);
    border-radius: 6px;
    color: var(--text-warning);
    font-size: 0.85rem;
    margin-top: 1rem;
  }

  .priority-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .priority-option {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 1rem;
    padding: 1rem;
    border: 1.5px solid var(--background-modifier-border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--weave-study-panel-bg) 88%, var(--weave-study-page-bg));
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .priority-option:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .priority-option.selected {
    background: color-mix(in srgb, var(--text-accent) 10%, var(--weave-study-panel-bg));
    border-color: var(--text-accent);
  }

  .priority-stars {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: #fbbf24; /* 统一使用金黄色 */
  }

  .priority-label {
    color: var(--text-normal);
    font-weight: 500;
  }

  .priority-option.selected .priority-label {
    color: var(--text-accent);
    font-weight: 600;
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding: 1rem 1.5rem;
    background: var(--weave-study-panel-alt-bg);
  }

  .btn-secondary,
  .btn-primary {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    border: none;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 80px;
  }

  .btn-secondary {
    background: var(--weave-study-page-bg);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  .btn-primary {
    background: var(--text-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    background: color-mix(in srgb, var(--text-accent) 90%, black);
    transform: translateY(-1px);
  }

  /* 所有预览相关样式已移至新的预览系统 */

  /* 学习页脚（难度选择固定在底部，减小高度突出内容区） */
  .study-footer {
    grid-column: 1;
    grid-row: 2;
    padding: 0.75rem 1.5rem;
    background: var(--weave-study-page-bg);
    position: relative;
    z-index: 1;
    overflow: visible;
  }

  /* 底部功能按钮区域（撤销/返回预览），放在评分按钮上方左侧 */
  .footer-top-controls {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    margin-top: -36px;
    margin-bottom: 0.25rem;
    position: relative;
    z-index: 1;
  }

  .footer-cloze-mode-switch {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .footer-cloze-mode-switch .cloze-mode-label {
    padding: 0 2px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .footer-cloze-mode-switch .cloze-mode-segmented {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border-radius: 0;
    background: transparent;
    border: none;
  }

  .footer-cloze-mode-switch .cloze-mode-btn {
    border: none;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: var(--clickable-icon-radius, 999px);
    padding: 0 10px;
    min-height: 40px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .footer-cloze-mode-switch .cloze-mode-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    transform: none;
  }

  .footer-cloze-mode-switch .cloze-mode-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .footer-cloze-mode-switch .cloze-mode-btn.active {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border: none;
    box-shadow: none;
    transform: none;
  }

  .footer-cloze-mode-switch .cloze-mode-btn:disabled {
    opacity: 0.62;
    cursor: not-allowed;
    transform: none;
  }

  .footer-side-action-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-width: 40px;
    padding: 0;
    border: none;
    box-shadow: none;
    border-radius: var(--clickable-icon-radius, 999px);
    background: transparent;
    color: var(--icon-color, var(--text-muted));
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .footer-side-action-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--icon-color-hover, var(--text-normal));
  }

  .footer-side-action-btn:focus-visible {
    outline: 2px solid var(--background-modifier-border-focus);
    outline-offset: 2px;
  }

  .footer-side-action-btn:active {
    background: var(--background-modifier-active-hover);
  }

  .footer-side-action-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .footer-side-action-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--interactive-accent) 88%, #ffffff 12%);
    color: var(--text-on-accent, #fff);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    border: 1.5px solid var(--weave-study-page-bg);
    pointer-events: none;
  }

  .footer-side-action-btn:disabled .footer-side-action-badge {
    opacity: 0.5;
    background: color-mix(in srgb, var(--text-muted) 76%, var(--background-modifier-border) 24%);
  }

  /* 编辑器样式已移至 CardEditorContainer.svelte 组件 */





  /* 移除未使用的模板字段样式 */

  /* 挖空样式已移至PreviewContainer组件 */

  /* 模板下拉菜单样式已移至VerticalToolbar组件 */

  .template-dropdown-list {
    max-height: 50vh;
    overflow-y: auto;
  }

  .template-dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .template-dropdown-item:last-child {
    border-bottom: none;
  }

  .template-dropdown-item:hover {
    background: var(--background-modifier-hover);
  }

  .template-dropdown-item.current {
    background: var(--color-accent-2);
  }

  .template-dropdown-item .template-name {
    font-size: 0.875rem;
    color: var(--text-normal);
    font-weight: 500;
    white-space: nowrap; /* 自适应宽度：单行不换行 */
  }

  /* 锚定菜单样式 */
  .menu-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--weave-z-menu);
    background: transparent;
    pointer-events: none; /* 让遮罩层透明且不捕获鼠标事件 */
  }

  .template-menu {
    position: fixed;
    width: max-content;   /* 随内容自适应宽度 */
    min-width: 140px;     /* 保底宽度避免过窄 */
    max-width: 60vw;      /* 视口保护 */
    background: var(--weave-study-page-bg);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    transform: none;      /* 移除垂直居中，改用精确定位 */
    padding: 0;
    z-index: calc(var(--weave-z-menu) + 1);
    pointer-events: auto; /* 恢复菜单内容的交互能力 */
  }

  .current-marker {
    color: var(--text-accent);
    font-size: 0.9rem;
    font-weight: 700;
    margin-left: 8px;
  }

  .no-templates-message {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* 预览容器样式已移至PreviewContainer组件 */

  /* 响应式适配已移至PreviewContainer组件 */

  /* 移动端适配 ==================== */
  
  /* 所有移动设备通用样式（与刷题学习一致：不用桌面模态深色遮罩） */
  :global(body.is-mobile) .study-interface-overlay,
  :global(body.is-phone) .study-interface-overlay {
    position: absolute;
    padding: 0;
    top: 0;
    bottom: var(
      --weave-workspace-bottom-offset,
      var(--weave-modal-bottom, env(safe-area-inset-bottom, 0px))
    );
    height: auto;
    background: transparent;
    backdrop-filter: none;
    align-items: stretch;
    justify-content: stretch;
    z-index: 1;
    overflow: hidden;
  }

  /* 移动端编辑：占满 leaf，不随键盘收缩高度（与官方笔记编辑一致） */
  :global(body.is-mobile.weave-edit-active) .study-interface-overlay,
  :global(body.is-phone.weave-edit-active) .study-interface-overlay {
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    height: 100%;
    max-height: none;
  }

  :global(body.is-mobile.weave-edit-active) .study-interface-content,
  :global(body.is-phone.weave-edit-active) .study-interface-content {
    height: 100%;
    flex: 1;
    min-height: 0;
    transition: none;
  }

  :global(body.is-mobile.weave-edit-active) .study-content,
  :global(body.is-phone.weave-edit-active) .study-content {
    transition: none;
  }

  .study-interface-overlay.mobile-edit-mode,
  .study-interface-overlay.mobile-edit-mode .study-interface-content,
  .study-interface-overlay.mobile-edit-mode .study-content.editing,
  .study-interface-overlay.mobile-edit-mode .main-study-area,
  .study-interface-overlay.mobile-edit-mode .card-study-container,
  .study-interface-overlay.mobile-edit-mode .card-container.editing,
  .study-interface-overlay.mobile-edit-mode .inline-editor-container {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .study-interface-overlay.mobile-edit-mode .study-interface-content {
    overflow: hidden;
  }

  .study-interface-overlay.mobile-edit-mode .card-study-container,
  .study-interface-overlay.mobile-edit-mode .card-container.editing {
    padding: 0;
  }

  :global(body.is-mobile.weave-edit-active) .study-content.editing,
  :global(body.is-phone.weave-edit-active) .study-content.editing,
  :global(body.is-mobile.weave-edit-active) .main-study-area,
  :global(body.is-phone.weave-edit-active) .main-study-area,
  :global(body.is-mobile.weave-edit-active) .card-study-container,
  :global(body.is-phone.weave-edit-active) .card-study-container {
    flex: 1;
    min-height: 0;
    padding: 0;
  }

  :global(body.is-mobile) .study-interface-content {
    /* 使用 100% 而非 100vh，让容器适应 Obsidian 的可用空间 */
    height: 100%;
    max-width: 100%;
    border-radius: 0;
    margin: 0;
    /* 移除边框和阴影 */
    border: none;
    box-shadow: none;
    /* 避免进入编辑态时 width/布局过渡露出两侧深色遮罩 */
    transition: none;
  }

  :global(body.is-mobile) .card-study-container {
    padding: 0;
  }

  :global(body.is-mobile) .card-container {
    padding: var(--weave-mobile-spacing-sm, 0.5rem);
    /* 移除边框 */
    border: none;
    box-shadow: none;
  }

  :global(body.is-mobile) .study-footer {
    /* 使用与内容区一致的背景色，避免色差形成边框 */
    background: var(--weave-study-page-bg);
    /* 移除所有多余间距 */
    padding: 0;
    margin: 0;
    /* 移除边框，避免视觉分割 */
    border: none;
  }

  /* 手机端专用样式 */
  :global(body.is-phone) .study-content {
    display: flex;
    flex-direction: column;
    /* 确保内容区域占满可用高度 */
    height: 100%;
  }

  /* 手机端学习界面容器高度 */
  :global(body.is-phone) .study-interface-content {
    /* 使用 100% 高度，让 Obsidian 管理可用空间 */
    height: 100%;
    /* 移除 max-height 限制，避免与 Obsidian 布局冲突 */
  }

  /* 手机端完全隐藏侧边栏容器，不占用空间 */
  :global(body.is-phone) .sidebar-content {
    display: none;
  }

  :global(body.is-phone) .card-container {
    width: 100%;
    border-radius: 0;
    /* 移除两侧间距，让内容占满宽度 */
    padding: 0.25rem 0;
    margin: 0;
  }

  :global(body.is-phone) .card-study-container {
    /* 移除外层容器间距，最大化内容显示 */
    padding: 0;
    flex: 1;
    min-height: 0;
  }

  /* 手机端：底部功能按钮区域样式 */
  :global(body.is-phone) .footer-top-controls {
    margin-bottom: 0.25rem;
    gap: 0.75rem;
  }

  :global(body.is-phone) .footer-cloze-mode-switch {
    width: 100%;
    gap: 0.4rem;
    padding: 0.35rem 0.4rem 0.35rem 0.55rem;
  }

  :global(body.is-phone) .footer-cloze-mode-switch .cloze-mode-label {
    font-size: 11px;
    padding: 0;
    flex-shrink: 0;
  }

  :global(body.is-phone) .footer-cloze-mode-switch .cloze-mode-segmented {
    flex: 1;
    justify-content: stretch;
  }

  :global(body.is-phone) .footer-cloze-mode-switch .cloze-mode-btn {
    flex: 1;
    min-height: var(--weave-mobile-touch-min, 44px);
    padding: 0 8px;
    font-size: 11px;
  }

  /*  手机端：撤销/返回预览按钮仅图标，居中显示 */
  :global(body.is-phone) .footer-side-action-btn {
    width: var(--weave-mobile-touch-min, 44px);
    height: var(--weave-mobile-touch-min, 44px);
  }

  /* 手机端底部评分区域，紧贴 Obsidian 底部导航栏 */
  :global(body.is-phone) .study-footer {
    /*  使用与内容区一致的背景色，避免色差形成边框 */
    background: var(--weave-study-page-bg);
    /* 移除所有多余间距 */
    padding: 0;
    margin: 0;
    /* 移除边框 */
    border: none;
  }

  /* 手机端主学习区域布局优化 */
  :global(body.is-phone) .main-study-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  /* 平板端专用样式 */
  :global(body.is-tablet) .study-interface-content {
    max-width: 95vw;
    height: 95%;
    border-radius: var(--radius-l, 12px);
  }

  :global(body.is-tablet) .card-container {
    width: min(100%, 1100px);
    padding: var(--weave-mobile-spacing-lg, 1.25rem);
  }

</style>
