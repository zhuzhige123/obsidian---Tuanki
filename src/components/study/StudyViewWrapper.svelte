<script lang="ts">
/**
 * StudyViewWrapper - 学习视图包装组件
 * 为标签页模式提供学习界面，直接复用 StudyInterface 组件
 */

import type AnkiPlugin from '../../main';
import type { StudyView } from '../../views/StudyView';
import type { PersistedStudySession } from '../../types/study-types';
import type { Card } from '../../data/types';
import type { StudySession } from '../../data/study-types';
import { CardState } from '../../data/types';
import StudyInterface from './StudyInterface.svelte';
import { onMount } from 'svelte';
import { Notice } from 'obsidian';
import CelebrationModal from '../modals/CelebrationModal.svelte';
import type { CelebrationStats } from '../../types/celebration-types';

// 🆕 导入学习完成逻辑辅助函数
import { loadDeckCardsForStudy, loadAllDueCardsForStudy, loadCardsByIds, getAdvanceStudyCards } from '../../utils/study/studyCompletionHelper';
import type { StudyMode } from '../../types/study-types';

// Props
interface Props {
  plugin: AnkiPlugin;
  viewInstance: StudyView;
  deckId?: string;
  mode?: StudyMode;
  cardIds?: string[];
  resumeData?: PersistedStudySession;
  onClose: () => void;
}

let {
  plugin,
  viewInstance,
  deckId,
  mode,
  cardIds,
  resumeData,
  onClose
}: Props = $props();

// 状态管理
// ✅ 移除暂停功能（影响使用体验）
let isLoading = $state(true);
let studyCards = $state<Card[]>([]);
let showStudyContent = $state(false);

// 🎉 庆祝模态窗状态
let showCelebrationModal = $state(false);
let celebrationDeckName = $state<string>('');
let celebrationStats = $state<CelebrationStats | null>(null);
let shouldCloseAfterCelebration = $state(false); // 🔧 标记是否需要在庆祝后关闭

// 状态监控（已移除调试日志）
let currentDeckId = $state(deckId || '');
let currentMode = $state(mode);
let currentCardIds = $state(cardIds);
let sessionStats = $state({
  completed: 0,
  correct: 0,
  incorrect: 0
});

// 学习会话数据
let currentCardIndex = $state(0);
let remainingCardIds = $state<string[]>([]);
let sessionType = $state<'review' | 'new' | 'learning' | 'mixed'>('mixed');

// 监听学习参数变化
$effect(() => {
  if (deckId !== undefined) {
    currentDeckId = deckId;
  }
  if (mode !== undefined) {
    currentMode = mode;
  }
  if (cardIds !== undefined) {
    currentCardIds = cardIds;
  }
});

// 加载待学习的卡片
onMount(async () => {
  await loadStudyCards();
});

// ✅ 移除暂停/恢复功能（影响使用体验）

/**
 * 获取当前会话数据（用于持久化）
 */
export function getSessionData() {
  return {
    deckId: currentDeckId,
    currentCardIndex,
    remainingCardIds,
    stats: sessionStats,
    sessionType
  };
}

/**
 * 是否需要持久化
 */
export function shouldPersist(): boolean {
  // 如果还有剩余卡片且已学习了一些，则需要持久化
  return remainingCardIds.length > 0 && sessionStats.completed > 0;
}

/**
 * 更新学习参数并重新加载卡片
 * 由 StudyView 在检测到参数变化时调用
 */
export async function updateStudyParams(params: {
  deckId?: string;
  mode?: StudyMode;
  cardIds?: string[];
}): Promise<void> {
  // 更新参数
  currentDeckId = params.deckId || '';
  currentMode = params.mode;
  currentCardIds = params.cardIds;
  
  console.log('[StudyViewWrapper] 更新学习参数:', { 
    deckId: currentDeckId, 
    mode: currentMode, 
    cardIds: currentCardIds?.length 
  });
  
  // 重置状态
  isLoading = true;
  showStudyContent = false;
  
  // 重新加载卡片
  await loadStudyCards();
}

/**
 * 🔄 向后兼容：保留旧的 updateDeckId 方法
 */
export async function updateDeckId(newDeckId: string | undefined): Promise<void> {
  await updateStudyParams({ deckId: newDeckId });
}

/**
 * 处理关闭
 */
function handleClose(): void {
  onClose();
}

/**
 * 加载待学习的卡片（🆕 智能加载逻辑）
 */
async function loadStudyCards() {
  try {
    isLoading = true;
    
    // 如果有恢复数据，使用恢复数据
    if (resumeData) {
      currentDeckId = resumeData.deckId;
      currentCardIndex = resumeData.currentCardIndex;
      remainingCardIds = resumeData.remainingCardIds;
      sessionStats = resumeData.stats;
      sessionType = resumeData.sessionType;
      
      // TODO: 从 remainingCardIds 加载实际卡片对象
      // studyCards = await loadCardsFromIds(remainingCardIds);
    } else {
      // 🎯 智能加载逻辑：根据学习模式选择加载策略
      if (currentCardIds && currentCardIds.length > 0) {
        // 🔑 模式1: 自定义卡片列表（提前学习会使用这个）
        console.log(`[StudyViewWrapper] 📋 加载自定义卡片列表: ${currentCardIds.length} 张`);
        studyCards = await loadCardsByIds(plugin.dataStorage, currentCardIds);
      } else if (currentMode === 'advance') {
        // 🔑 模式2: 提前学习模式（加载未到期的复习卡片）
        if (!currentDeckId) {
          console.error('[StudyViewWrapper] 提前学习模式缺少 deckId');
          new Notice('⚠️ 提前学习需要选择牌组');
          onClose();
          return;
        }
        console.log('[StudyViewWrapper] ⏩ 加载提前学习卡片');
        studyCards = await loadAdvanceCards(currentDeckId);
      } else {
        // 🔑 模式3: 正常模式（到期卡片 + 新卡片配额）
        console.log('[StudyViewWrapper] 📚 加载正常学习卡片');
        if (currentDeckId) {
          studyCards = await loadDeckCards(currentDeckId);
        } else {
          studyCards = await loadDueCards();
        }
      }
    }
    
    if (studyCards.length > 0) {
      showStudyContent = true;
    } else {
      // ✅ 修复：没有卡片时，显示完成或关闭界面
      console.log('[StudyViewWrapper] 没有待学习的卡片，自动关闭');
      
      // 延迟关闭，避免闪烁
      setTimeout(() => {
        onClose();
      }, 100);
    }
    
  } catch (error) {
    console.error('[StudyViewWrapper] 加载卡片失败:', error);
  } finally {
    isLoading = false;
  }
}

/**
 * 从牌组加载卡片（✅ 应用新卡片每日限额）
 */
async function loadDeckCards(deckId: string): Promise<Card[]> {
  try {
    const newCardsPerDay = plugin.settings.newCardsPerDay || 20;
    const reviewsPerDay = plugin.settings.reviewsPerDay || 20;
    
    // 🆕 使用新的辅助函数（应用新卡片限额）
    const cards = await loadDeckCardsForStudy(
      plugin.dataStorage,
      deckId,
      newCardsPerDay,
      reviewsPerDay
    );
    
    console.log(`[StudyViewWrapper] ✅ 加载卡片数: ${cards.length} (新卡片限额: ${newCardsPerDay})`);
    
    return cards;
  } catch (error) {
    console.error('[StudyViewWrapper] 加载牌组卡片失败:', error);
    return [];
  }
}

/**
 * 加载所有到期卡片（✅ 应用新卡片每日限额）
 */
async function loadDueCards(): Promise<Card[]> {
  try {
    const newCardsPerDay = plugin.settings.newCardsPerDay || 20;
    const reviewsPerDay = plugin.settings.reviewsPerDay || 20;
    
    // 🆕 使用新的辅助函数（应用新卡片限额）
    const cards = await loadAllDueCardsForStudy(
      plugin.dataStorage,
      newCardsPerDay,
      reviewsPerDay
    );
    
    console.log(`[StudyViewWrapper] ✅ 加载全局卡片数: ${cards.length} (新卡片限额: ${newCardsPerDay})`);
    
    return cards;
  } catch (error) {
    console.error('[StudyViewWrapper] 加载到期卡片失败:', error);
    return [];
  }
}

/**
 * 🆕 加载提前学习卡片（未到期的复习卡片）
 */
async function loadAdvanceCards(deckId: string): Promise<Card[]> {
  try {
    const allDeckCards = await plugin.dataStorage.getCards({ deckId });
    const advanceCards = getAdvanceStudyCards(allDeckCards, 20);
    
    console.log(`[StudyViewWrapper] ✅ 加载提前学习卡片: ${advanceCards.length} 张`);
    
    return advanceCards;
  } catch (error) {
    console.error('[StudyViewWrapper] 加载提前学习卡片失败:', error);
    return [];
  }
}

/**
 * 处理学习完成
 */
function handleStudyComplete(session: StudySession) {
  
  // 更新统计 (使用 StudySession 的实际字段)
  sessionStats = {
    completed: session.cardsReviewed || 0,
    correct: session.correctAnswers || 0,
    incorrect: (session.cardsReviewed || 0) - (session.correctAnswers || 0)
  };
  
  // 🎉 显示庆祝界面
  if (session.cardsReviewed && session.cardsReviewed > 0) {
    // ✅ 关键修复：立即同步设置所有必需的状态
    const memoryRate = session.cardsReviewed > 0 
      ? (session.correctAnswers || 0) / session.cardsReviewed 
      : 0;
    
    // 先用默认值初始化，确保模态窗可以立即显示
    celebrationDeckName = '加载中...';
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
        const deck = await plugin.dataStorage.getDeck(session.deckId);
        celebrationDeckName = deck?.name || '未知牌组';
      } catch (error) {
        console.error('[StudyViewWrapper] 加载牌组名称失败:', error);
        celebrationDeckName = '未知牌组';
      }
    })();
  } else {
    // 没有学习卡片，直接关闭
    onClose();
  }
}

/**
 * 处理关闭请求（拦截版本，用于 StudyInterface）
 * 🔧 如果庆祝界面正在显示，不立即关闭，而是等待用户关闭庆祝界面
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
 * 🎉 关闭庆祝模态窗
 */
function handleCloseCelebration() {
  showCelebrationModal = false;
  celebrationStats = null;
  
  // 如果学习已完成（shouldCloseAfterCelebration = true），关闭整个学习视图
  if (shouldCloseAfterCelebration) {
    // 延迟一点让动画完成
    setTimeout(() => {
      onClose();
    }, 100);
  }
  
  // 重置标志
  shouldCloseAfterCelebration = false;
}
</script>

<div class="tuanki-study-view-wrapper">
  <!-- ✅ 只在有内容时显示工具栏和状态栏 -->
  {#if !isLoading && showStudyContent && studyCards.length > 0}
    <!-- 顶部工具栏 -->
    <div class="study-view-toolbar">
      <div class="toolbar-left">
        <span class="study-view-title">
          📚 正在学习
        </span>
        <span class="study-stats">
          完成: {sessionStats.completed} | 
          正确: {sessionStats.correct} | 
          错误: {sessionStats.incorrect}
        </span>
      </div>
      
      <div class="toolbar-right">
        <!-- ✅ 移除暂停/恢复按钮（影响使用体验） -->
        
        <button 
          class="toolbar-btn close-btn"
          onclick={handleClose}
          title="关闭学习界面"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- 学习内容区域 -->
    <div class="study-view-content">
      <div class="study-interface-embedded">
        <StudyInterface
          cards={studyCards}
          fsrs={plugin.fsrs}
          dataStorage={plugin.dataStorage}
          {plugin}
          onClose={handleCloseRequest}
          onComplete={handleStudyComplete}
        />
      </div>
    </div>

    <!-- 底部状态栏 -->
    <div class="study-view-statusbar">
      <span class="status-text">
        学习中 | 
        进度: {currentCardIndex + 1} / {remainingCardIds.length + currentCardIndex + 1}
      </span>
    </div>
  {:else if isLoading}
    <!-- 加载中状态 -->
    <div class="loading-container-fullscreen">
      <div class="loading-spinner"></div>
      <p>加载学习卡片中...</p>
    </div>
  {/if}
  
  <!-- 🎉 庆祝模态窗 -->
  {#if showCelebrationModal && celebrationStats}
    <CelebrationModal
      deckName={celebrationDeckName}
      stats={celebrationStats}
      soundEnabled={true}
      soundVolume={0.5}
      onClose={handleCloseCelebration}
    />
  {/if}
</div>

<style>
  .tuanki-study-view-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--background-primary);
    /* ✅ 不需要 position: relative，庆祝模态窗使用 fixed 定位 */
  }

  .study-view-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    flex-shrink: 0;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .study-view-title {
    font-weight: 600;
    font-size: 14px;
  }

  .study-stats {
    font-size: 12px;
    color: var(--text-muted);
  }

  .toolbar-right {
    display: flex;
    gap: 4px;
  }

  .toolbar-btn {
    padding: 4px 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    font-size: 16px;
    transition: background-color 0.2s;
  }

  .toolbar-btn:hover {
    background: var(--background-modifier-hover);
  }

  .close-btn {
    color: var(--text-error);
  }

  .study-view-content {
    flex: 1;
    overflow: auto;
    position: relative;
    padding: 20px;
  }

  /* ✅ 移除暂停功能相关样式（影响使用体验） */

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 40px;
    text-align: center;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-container p {
    margin: 16px 0;
    color: var(--text-muted);
  }

  /* ✅ 全屏加载容器 */
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

  .study-view-statusbar {
    padding: 8px 12px;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    font-size: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .status-text {
    display: inline-block;
  }
</style>

