<script lang="ts">
  import { logger } from '../../utils/logger';

/**
 * StudyViewWrapper - 学习视图包装组件
 * 为标签页模式提供学习界面，直接复用 StudyInterface 组件
 */

import type { WeavePlugin } from '../../main';
import type { StudyView } from '../../views/StudyView';
import type { PersistedStudySession, StudyMode, StudyQueueState, StudySessionSnapshot } from '../../types/study-types';
import type { Card, Deck } from '../../data/types';
import type { StudySession } from '../../data/study-types';
import { CardState } from '../../data/types';
import StudyInterface from './StudyInterface.svelte';
import { onMount, untrack } from 'svelte';
import { Notice } from 'obsidian';
import CelebrationModal from '../modals/CelebrationModal.svelte';
import { QuestionBankSelectorModal } from '../../modals/QuestionBankSelectorModal';
import type { CelebrationStats } from '../../types/celebration-types';
//  导入国际化
import { tr } from '../../utils/i18n';

// 导入学习完成逻辑辅助函数
import { loadDeckCardsForStudy, loadAllDueCardsForStudy, loadCardsByIds, getAdvanceStudyCards } from '../../utils/study/studyCompletionHelper';

//  导入服务就绪检查工具
import { waitForService } from '../../utils/service-ready-check';

// Props
interface Props {
  plugin: WeavePlugin;
  viewInstance: StudyView;
  deckId?: string;
  deckName?: string;
  mode?: StudyMode;
  cardIds?: string[];
  cards?: Card[];  // 直接传递的卡片对象
  resumeData?: PersistedStudySession;
  queueState?: StudyQueueState;
  onClose: () => void;
}

let {
  plugin,
  viewInstance,
  deckId,
  deckName,
  mode,
  cardIds,
  cards,
  resumeData,
  queueState,
  onClose
}: Props = $props();

//  响应式翻译函数
let t = $derived($tr);

// 状态管理
let isLoading = $state(true);
let studyCards = $state<Card[]>([]);

//  庆祝模态窗状态
let showCelebrationModal = $state(false);
let celebrationDeckName = $state<string>('');
let celebrationDeckId = $state<string>('');
let celebrationStats = $state<CelebrationStats | null>(null);
let shouldCloseAfterCelebration = $state(false); //  标记是否需要在庆祝后关闭

// 状态监控
let currentDeckId = $state(untrack(() => deckId || ''));
let currentDeckName = $state(untrack(() => deckName || ''));
let currentMode = $state(untrack(() => mode));
let currentCardIds = $state(untrack(() => cardIds));
let currentCards = $state(untrack(() => cards));  //  添加cards状态
let activeResumeData = $state<PersistedStudySession | null>(untrack(() => resumeData ?? null));
let activeQueueState = $state<Props['queueState']>(untrack(() => queueState));

function formatNextDueTime(dueIso: string): string | null {
  const dueDate = new Date(dueIso);
  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const now = new Date();
  const diff = dueDate.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (days > 1) {
    const dateStr = `${dueDate.getMonth() + 1}/${dueDate.getDate()}`;
    const timeStr = `${String(dueDate.getHours()).padStart(2, '0')}:${String(dueDate.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} ${timeStr}`;
  }

  if (days === 1) {
    const timeStr = `${String(dueDate.getHours()).padStart(2, '0')}:${String(dueDate.getMinutes()).padStart(2, '0')}`;
    return `${t('deckStudyPage.time.tomorrow')} ${timeStr}`;
  }

  if (hours > 0) {
    return t('deckStudyPage.time.hoursLater', { hours: String(hours) });
  }

  const minutes = Math.max(1, Math.floor(diff / (1000 * 60)));
  return t('deckStudyPage.time.minutesLater', { minutes: String(minutes) });
}

// 学习会话数据
let studyInterfaceRef = $state<{
  getQueueProgress?: () => StudyQueueState | null;
  getSessionData?: () => StudySessionSnapshot;
  shouldPersist?: () => boolean;
} | null>(null);

function createEmptySessionSnapshot(deckId = currentDeckId): StudySessionSnapshot {
  return {
    deckId,
    currentCardIndex: 0,
    remainingCardIds: [],
    stats: {
      completed: 0,
      correct: 0,
      incorrect: 0
    },
    sessionType: 'mixed'
  };
}

function setFallbackSessionSnapshot(snapshot?: StudySessionSnapshot | null) {
  fallbackSessionSnapshot = snapshot
    ? {
        deckId: snapshot.deckId,
        currentCardIndex: snapshot.currentCardIndex,
        remainingCardIds: [...snapshot.remainingCardIds],
        stats: { ...snapshot.stats },
        sessionType: snapshot.sessionType
      }
    : createEmptySessionSnapshot();
}

let fallbackSessionSnapshot = $state<StudySessionSnapshot>(untrack(() => createEmptySessionSnapshot()));

// 队列恢复的初始卡片索引（用于重启后恢复到之前的位置）
let initialCardIndex = $state(0);
let studyInterfaceRenderKey = $state(0);

// 监听学习参数变化
$effect(() => {
  if (deckId !== undefined) {
    currentDeckId = deckId;
  }
  if (deckName !== undefined) {
    currentDeckName = deckName;
  }
  if (mode !== undefined) {
    currentMode = mode;
  }
  if (cardIds !== undefined) {
    currentCardIds = cardIds;
  }
  if (cards !== undefined) {
    currentCards = cards;  //  更新cards状态
  }
  
});

// 加载待学习的卡片
onMount(async () => {
  await loadStudyCards();
});

/**
 * 获取当前会话数据（用于持久化）
 */
export function getSessionData() {
  if (studyInterfaceRef?.getSessionData) {
    return studyInterfaceRef.getSessionData();
  }

  return fallbackSessionSnapshot;
}

/**
 * 获取当前队列进度（供 StudyView.getState() 主动查询）
 * 数据来源：StudyInterface authoritative 导出
 */
export function getQueueProgress(): StudyQueueState | null {
  if (studyInterfaceRef?.getQueueProgress) {
    const queueProgress = studyInterfaceRef.getQueueProgress();
    if (queueProgress) {
      return queueProgress;
    }
  }

  return null;
}

/**
 * 是否需要持久化
 */
export function shouldPersist(): boolean {
  if (studyInterfaceRef?.shouldPersist) {
    return studyInterfaceRef.shouldPersist();
  }

  return fallbackSessionSnapshot.remainingCardIds.length > 0 && fallbackSessionSnapshot.stats.completed > 0;
}

/**
 * 更新学习参数并重新加载卡片
 * 由 StudyView 在检测到参数变化时调用
 */
export async function updateStudyParams(params: {
  deckId?: string;
  deckName?: string;
  mode?: StudyMode;
  cardIds?: string[];
  cards?: Card[];
  resumeData?: PersistedStudySession | null;
  queueState?: Props['queueState'];
}): Promise<void> {
  // 更新参数
  currentDeckId = params.deckId || '';
  currentDeckName = params.deckName || '';
  currentMode = params.mode;
  currentCardIds = params.cardIds;
  currentCards = params.cards;
  activeResumeData = params.resumeData ?? null;
  activeQueueState = params.queueState;
  
  // 重置状态
  studyCards = [];
  setFallbackSessionSnapshot(null);
  initialCardIndex = 0;
  studyInterfaceRef = null;
  studyInterfaceRenderKey += 1;
  isLoading = true;
  
  // 重新加载卡片
  await loadStudyCards();
}

/**
 * 处理关闭
 */
function handleClose(): void {
  onClose();
}

/**
 * 加载待学习的卡片
 */
async function loadStudyCards() {
  try {
    isLoading = true;
    studyCards = [];
    
    // 如果有恢复数据，使用恢复数据
    if (activeResumeData) {
      const resumedSnapshot: StudySessionSnapshot = {
        deckId: activeResumeData.deckId,
        currentCardIndex: activeResumeData.currentCardIndex,
        remainingCardIds: [...activeResumeData.remainingCardIds],
        stats: { ...activeResumeData.stats },
        sessionType: activeResumeData.sessionType
      };

      currentDeckId = activeResumeData.deckId;
      currentDeckName = activeResumeData.deckName || currentDeckName;
      currentMode = activeResumeData.mode || currentMode;
      setFallbackSessionSnapshot(resumedSnapshot);

      if (activeResumeData.queueState && activeResumeData.queueState.studyQueueCardIds?.length > 0) {
        logger.info('[StudyViewWrapper] 从持久化队列恢复学习会话:', {
          savedIndex: activeResumeData.queueState.currentCardIndex,
          queueLength: activeResumeData.queueState.studyQueueCardIds.length
        });

        const dataStorage = await waitForService(
          () => plugin?.dataStorage,
          'DataStorage',
          10000
        );

        const uniqueCardIds = [...new Set(activeResumeData.queueState.studyQueueCardIds)];
        const uniqueCards = await loadCardsByIds(dataStorage, uniqueCardIds, currentDeckId);
        const cardMap = new Map<string, Card>();
        for (const card of uniqueCards) {
          cardMap.set(card.uuid, card);
        }

        studyCards = activeResumeData.queueState.studyQueueCardIds
          .map(id => cardMap.get(id))
          .filter((card): card is Card => !!card);

        initialCardIndex = Math.min(activeResumeData.queueState.currentCardIndex, Math.max(studyCards.length - 1, 0));
        initialCardIndex = Math.max(0, initialCardIndex);
      } else {
        const dataStorage = await waitForService(
          () => plugin?.dataStorage,
          'DataStorage',
          10000
        );
        studyCards = await loadCardsByIds(dataStorage, resumedSnapshot.remainingCardIds, currentDeckId);
        initialCardIndex = 0;
      }
    } else if (activeQueueState && activeQueueState.studyQueueCardIds && activeQueueState.studyQueueCardIds.length > 0) {
      // 重启恢复：按保存的队列顺序和索引加载卡片
      logger.info('[StudyViewWrapper] 重启恢复：从保存的队列状态恢复', {
        savedIndex: activeQueueState.currentCardIndex,
        queueLength: activeQueueState.studyQueueCardIds.length,
        studiedCount: activeQueueState.sessionStudiedCardIds?.length || 0
      });
      
      const dataStorage = await waitForService(
        () => plugin?.dataStorage,
        'DataStorage',
        10000
      );
      
      // 1. 提取唯一卡片ID（队列可能含重复ID，因learning steps插入）
      const uniqueCardIds = [...new Set(activeQueueState.studyQueueCardIds)];
      const uniqueCards = await loadCardsByIds(dataStorage, uniqueCardIds, currentDeckId);
      
      if (uniqueCards.length > 0) {
        // 2. 建立UUID到Card的映射
        const cardMap = new Map<string, Card>();
        for (const card of uniqueCards) {
          cardMap.set(card.uuid, card);
        }
        
        // 3. 按原始队列顺序重建完整队列（含重复）
        const restoredQueue: Card[] = [];
        for (const id of activeQueueState.studyQueueCardIds) {
          const card = cardMap.get(id);
          if (card) {
            restoredQueue.push(card);
          }
        }
        
        studyCards = restoredQueue;
        // 4. 设置初始卡片索引，确保不超出范围
        initialCardIndex = Math.min(activeQueueState.currentCardIndex, restoredQueue.length - 1);
        initialCardIndex = Math.max(0, initialCardIndex);
        
        logger.info('[StudyViewWrapper] 队列恢复完成:', {
          uniqueCards: uniqueCards.length,
          restoredQueueLength: restoredQueue.length,
          initialCardIndex,
          currentCardId: restoredQueue[initialCardIndex]?.uuid?.slice(0, 8)
        });
      } else {
        // 加载失败，回退到正常加载
        logger.warn('[StudyViewWrapper] 队列恢复失败，回退到正常加载');
        if (currentDeckId) {
          studyCards = await loadDeckCards(currentDeckId);
        } else {
          studyCards = await loadDueCards();
        }
      }
    } else {
      //  智能加载逻辑：根据学习模式选择加载策略
      if (Array.isArray(currentCards)) {
        logger.debug('[StudyViewWrapper] 📥 模式0: 使用显式传入的 cards', {
          cardsCount: currentCards.length,
          deckId: currentDeckId
        });
        studyCards = currentCards;
        initialCardIndex = 0;
      } else if (currentCardIds && currentCardIds.length > 0) {
        //  模式1: 自定义卡片列表（提前学习会使用这个）
        logger.debug('[StudyViewWrapper] 📥 模式1: 使用CardIds加载', {
          cardIdsCount: currentCardIds.length,
          cardIds: currentCardIds.map(id => id.slice(0, 8)),
          mode: currentMode
        });
        
        // 等待 dataStorage 初始化完成
        const dataStorage = await waitForService(
          () => plugin?.dataStorage,
          'DataStorage',
          10000  // 增加到10秒，处理大数据量情况
        );
        
        // 传递 deckId，确保从正确的牌组加载卡片
        studyCards = await loadCardsByIds(dataStorage, currentCardIds, currentDeckId);
        
        logger.debug('[StudyViewWrapper] ✅ 卡片加载完成:', {
          requestedCount: currentCardIds.length,
          loadedCount: studyCards.length,
          cardIds: studyCards.map(c => c.uuid.slice(0, 8)),
          deckId: currentDeckId
        });
      } else if (currentMode === 'advance') {
        //  模式2: 提前学习模式（加载未到期的复习卡片）
        if (!currentDeckId) {
          logger.error('[StudyViewWrapper] 提前学习模式缺少 deckId');
          new Notice(t('deckStudyPage.studyActions.advanceStudyRequiresDeck'));
          onClose();
          return;
        }
        studyCards = await loadAdvanceCards(currentDeckId);
      } else {
        //  模式3: 正常模式（到期卡片 + 新卡片配额）
        if (currentDeckId) {
          studyCards = await loadDeckCards(currentDeckId);
        } else {
          studyCards = await loadDueCards();
        }
      }
    }
    
    if (studyCards.length === 0) {
      // 没有卡片时，立即显示友好提示并关闭
      logger.warn('[StudyViewWrapper] ⚠️ 无可学卡片，关闭学习界面');
      
      // 显示提示
      new Notice(t('deckStudyPage.study.noDeckAvailable'));
      
      // 立即关闭界面
      onClose();
    }
    
  } catch (error) {
    logger.error('[StudyViewWrapper] 加载卡片失败:', error);
  } finally {
    isLoading = false;
  }
}

/**
 * 从牌组加载卡片（ v3.0 使用 UnifiedStudyProvider 确保与统计一致）
 */
async function loadDeckCards(deckId: string): Promise<Card[]> {
  try {
    const newCardsPerDay = plugin.settings.newCardsPerDay || 20;
    const reviewsPerDay = plugin.settings.reviewsPerDay || 200;
    const filterSiblings = plugin.settings.studyConfig?.siblingDispersion?.filterInQueue ?? true;
    
    // 等待 dataStorage 初始化完成
    const dataStorage = await waitForService(
      () => plugin?.dataStorage,
      'DataStorage',
      10000  // 增加到10秒，处理大数据量情况
    );
    
    //  v3.0: 使用 UnifiedStudyProvider（与统计使用相同的数据源）
    const { UnifiedStudyProvider } = await import('../../services/study/UnifiedStudyProvider');
    const unifiedProvider = new UnifiedStudyProvider(dataStorage);
    
    const { queue, stats, debug } = await unifiedProvider.getStudyData(deckId, {
      newCardsPerDay,
      reviewsPerDay,
      filterSiblings,
      onlyDue: true
    });
    
    //  关键日志：验证队列与统计一致性
    logger.info('[StudyViewWrapper] ✅ v3.0 统一数据加载完成:', {
      deckId: deckId.slice(0, 8),
      queueLength: queue.length,
      stats: {
        new: stats.newCards,
        learning: stats.learningCards,
        review: stats.reviewCards,
        total: stats.newCards + stats.learningCards + stats.reviewCards
      },
      debug,
      consistency: queue.length === (stats.newCards + stats.learningCards + stats.reviewCards) ? '✅ 一致' : '❌ 不一致'
    });
    
    return queue;
  } catch (error) {
    logger.error('[StudyViewWrapper] 加载牌组卡片失败:', error);
    return [];
  }
}

/**
 * 加载所有到期卡片（ 应用新卡片每日限额）
 */
async function loadDueCards(): Promise<Card[]> {
  try {
    const newCardsPerDay = plugin.settings.newCardsPerDay || 20;
    const reviewsPerDay = plugin.settings.reviewsPerDay || 20;
    
    // 等待 dataStorage 初始化完成
    const dataStorage = await waitForService(
      () => plugin?.dataStorage,
      'DataStorage',
      10000  // 增加到10秒，处理大数据量情况
    );
    
    // 使用辅助函数（应用新卡片限额）
    const cards = await loadAllDueCardsForStudy(
      dataStorage,
      newCardsPerDay,
      reviewsPerDay
    );
    
    return cards;
  } catch (error) {
    logger.error('[StudyViewWrapper] 加载到期卡片失败:', error);
    return [];
  }
}

/**
 * 加载提前学习卡片（未到期的复习卡片）
 */
async function loadAdvanceCards(deckId: string): Promise<Card[]> {
  try {
    // 等待 dataStorage 初始化完成
    const dataStorage = await waitForService(
      () => plugin?.dataStorage,
      'DataStorage',
      10000  // 增加到10秒，处理大数据量情况
    );
    
    const allDeckCards = await dataStorage.getCards({ deckId });
    const maxAdvanceDays = plugin.settings.maxAdvanceDays || 7;
    const advanceCards = getAdvanceStudyCards(allDeckCards, 20, maxAdvanceDays);
    
    return advanceCards;
  } catch (error) {
    logger.error('[StudyViewWrapper] 加载提前学习卡片失败:', error);
    return [];
  }
}

/**
 * 处理学习完成
 */
function handleStudyComplete(session: StudySession) {
  
  // 更新统计 (使用 StudySession 的实际字段)
  setFallbackSessionSnapshot({
    deckId: session.deckId,
    currentCardIndex: fallbackSessionSnapshot.currentCardIndex,
    remainingCardIds: [...fallbackSessionSnapshot.remainingCardIds],
    stats: {
      completed: session.cardsReviewed || 0,
      correct: session.correctAnswers || 0,
      incorrect: (session.cardsReviewed || 0) - (session.correctAnswers || 0)
    },
    sessionType: fallbackSessionSnapshot.sessionType
  });

  if (session.completionReason === 'paused-until-next-due') {
    const nextDueTime = session.pendingNextDueAt ? formatNextDueTime(session.pendingNextDueAt) : null;
    new Notice(
      nextDueTime
        ? t('deckStudyPage.notices.shortTermResumeAt', { time: nextDueTime })
        : t('deckStudyPage.notices.shortTermResumeSoon')
    );
    return;
  }
  
  //  显示庆祝界面
  if (session.cardsReviewed && session.cardsReviewed > 0) {
    // 立即同步设置所有必需的状态
    const memoryRate = session.cardsReviewed > 0 
      ? (session.correctAnswers || 0) / session.cardsReviewed 
      : 0;
    
    // 先用默认值初始化，确保模态窗可以立即显示
    celebrationDeckName = t('deckStudyPage.state.loadingDeckName');
    celebrationDeckId = session.deckId;
    celebrationStats = {
      reviewed: session.cardsReviewed,
      studyTime: Math.floor(session.totalTime / 1000), // 转换为秒
      memoryRate: memoryRate,
      newCards: session.newCardsLearned || 0
    };
    
    // 立即显示庆祝界面
    showCelebrationModal = true;
    shouldCloseAfterCelebration = true; // 标记需要在庆祝后关闭
    
    // 然后异步加载牌组名称
    (async () => {
      try {
        // 等待 dataStorage 初始化完成
        const dataStorage = await waitForService(
          () => plugin?.dataStorage,
          'DataStorage',
          10000  // 增加到10秒，处理大数据量情况
        );
        const deck = await dataStorage.getDeck(session.deckId);
        celebrationDeckName = deck?.name || t('toolbar.unknownDeck');
      } catch (error) {
        logger.error('[StudyViewWrapper] 加载牌组名称失败:', error);
        celebrationDeckName = t('toolbar.unknownDeck');
      }
    })();
  } else {
    // 没有学习卡片，直接关闭
    onClose();
  }
}

/**
 * 处理关闭请求（拦截版本，用于 StudyInterface）
 *  如果庆祝界面正在显示，不立即关闭，而是等待用户关闭庆祝界面
 */
function handleCloseRequest() {
  if (showCelebrationModal) {
    // 庆祝界面正在显示，延迟关闭
    shouldCloseAfterCelebration = true;
  } else {
    // 没有庆祝界面，直接关闭
    onClose();
  }
}

/**
 *  关闭庆祝模态窗
 */
async function handleCloseCelebration() {
  showCelebrationModal = false;
  celebrationStats = null;
  celebrationDeckId = '';
  
  // 如果学习已完成（shouldCloseAfterCelebration = true），关闭整个学习视图
  if (shouldCloseAfterCelebration) {
    try {
      await plugin.returnToDeckStudyView('memory');
    } finally {
      // 延迟一点让动画完成
      setTimeout(() => {
        onClose();
      }, 100);
    }
  }
  
  // 重置标志
  shouldCloseAfterCelebration = false;
}

/**
 *  开始考试模式
 */
async function pickQuestionBankForDeck(deckId: string): Promise<Deck | null> {
  const currentDeck = await plugin.dataStorage.getDeck(deckId);
  logger.info('[StudyViewWrapper] 当前牌组信息:', currentDeck ? {
    id: currentDeck.id,
    name: currentDeck.name,
    deckType: currentDeck.deckType,
    pairedMemoryDeckId: (currentDeck.metadata as any)?.pairedMemoryDeckId
  } : '未找到');

  if (currentDeck && currentDeck.deckType === 'question-bank') {
    logger.info('[StudyViewWrapper] 当前牌组本身就是考试题组，直接使用');
    return currentDeck;
  }

  const candidates = await plugin.questionBankService!.getBankCandidatesByMemoryDeckId(deckId);
  logger.info('[StudyViewWrapper] 候选考试题组:', candidates.map((candidate) => ({
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

  new Notice(t('deckStudyPage.exam.multipleBanksFound'));
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

async function handleStartPractice() {
  // 关闭庆祝模态窗
  showCelebrationModal = false;
  const deckId = celebrationDeckId;
  celebrationStats = null;
  celebrationDeckId = '';
  
  if (!deckId) {
    logger.error('[StudyViewWrapper] 无法开始考试：缺少牌组ID');
    new Notice(t('deckStudyPage.exam.missingDeckInfo'));
    return;
  }
  
  try {
    logger.info('[StudyViewWrapper] 开始考试模式，牌组ID:', deckId);
    
    // 检查题库服务是否可用
    if (!plugin.questionBankService) {
      logger.error('[StudyViewWrapper] 题库服务未初始化');
      new Notice(t('deckStudyPage.exam.qbNotEnabled'));
      return;
    }
    
    //  调试日志：查看所有题库
    const allBanks = await plugin.questionBankService.getAllBanks();
    logger.info('[StudyViewWrapper] 当前所有题库:', allBanks.map(b => ({
      id: b.id,
      name: b.name,
      deckType: b.deckType,
      pairedMemoryDeckId: (b.metadata as any)?.pairedMemoryDeckId
    })));
    
    logger.info('[StudyViewWrapper] 🔍 详细匹配信息:', {
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
    
    logger.info('[StudyViewWrapper] 当前牌组是记忆牌组，查找对应的考试题组');
    const questionBank = await pickQuestionBankForDeck(deckId);
    
    if (!questionBank) {
      logger.info('[StudyViewWrapper] 暂无该记忆牌组对应的考试题组');
      new Notice(t('deckStudyPage.exam.noPairedBank'));
      return;
    }
    
    // 打开考试学习会话
    logger.info('[StudyViewWrapper] 打开考试题组:', questionBank.id, questionBank.name);
    await plugin.openQuestionBankSession({
      bankId: questionBank.id,
      bankName: questionBank.name
    });
    
    // 关闭当前学习视图
    if (shouldCloseAfterCelebration) {
      setTimeout(() => {
        onClose();
      }, 100);
    }
    
  } catch (error) {
    logger.error('[StudyViewWrapper] 开始考试失败:', error);
    new Notice(t('deckStudyPage.exam.startFailed'));
  }
  
  // 重置标志
  shouldCloseAfterCelebration = false;
}
</script>

<div class="weave-study-view-wrapper">
  {#if !isLoading && studyCards.length > 0}
    <!-- 学习内容区域 -->
    <div class="study-view-content">
      <div class="study-interface-embedded">
        {#key studyInterfaceRenderKey}
          <StudyInterface
            bind:this={studyInterfaceRef}
            cards={studyCards}
            fsrs={plugin.fsrs}
            dataStorage={plugin.dataStorage}
            {plugin}
            {viewInstance}
            sessionDeckId={currentDeckId}
            forcedDeckName={currentDeckName}
            showSourceInfoToggle={true}
            mode={currentMode === 'custom' ? 'normal' : currentMode}
            {initialCardIndex}
            onClose={handleCloseRequest}
            onComplete={handleStudyComplete}
          />
        {/key}
      </div>
    </div>
  {:else if isLoading}
    <!-- 加载中状态 -->
    <div class="loading-container-fullscreen">
      <div class="loading-spinner"></div>
      <p>{t('studyInterface.loadingStudyCards')}</p>
    </div>
  {/if}
  
  <!--  庆祝模态窗 -->
  {#if showCelebrationModal && celebrationStats}
    <CelebrationModal
      deckName={celebrationDeckName}
      deckId={celebrationDeckId}
      stats={celebrationStats}
      soundEnabled={true}
      soundVolume={0.5}
      onClose={handleCloseCelebration}
      onStartPractice={handleStartPractice}
    />
  {/if}
</div>

<style>
  .weave-study-view-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--background-primary);
  }

  .study-view-content {
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /*  全屏加载容器 */
  .loading-container-fullscreen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    padding: 40px;
    text-align: center;
  }

  .loading-container-fullscreen .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-container-fullscreen p {
    margin: 16px 0;
    color: var(--text-muted);
  }

  /* StudyInterface 嵌入样式 */
  .study-interface-embedded {
    width: 100%;
    height: 100%;
    overflow: auto;
  }

  /* 隐藏 StudyInterface 自带的关闭按钮（如果有） */
  .study-interface-embedded :global(.interface-close-button) {
    display: none;
  }

</style>
