/**
 * 学习完成逻辑辅助函数
 * 
 * 根据Anki的逻辑实现：
 * 1. 新卡片每日限额管理
 * 2. 学习完成判定
 * 3. 提前学习功能
 */

import type { Card, CardState } from '../../data/types';
import type { StudySession } from '../../data/study-types';
import type { AnkiDataStorage } from '../../data/storage';

/**
 * 统一的时间解析函数
 * 处理 string | number | Date 类型的时间
 */
export function parseDueTime(due: string | number | Date): number {
  if (typeof due === 'number') return due;
  if (typeof due === 'string') return Date.parse(due);
  return due.getTime();
}

/**
 * 获取今天已学习的新卡片数量
 * 
 * @param dataStorage 数据存储实例
 * @param deckId 牌组ID（可选，null表示全局）
 * @returns 今天已学习的新卡片数量
 */
export async function getLearnedNewCardsCountToday(
  dataStorage: AnkiDataStorage,
  deckId?: string
): Promise<number> {
  try {
    // 获取今天的开始时间（零点）
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStartTimestamp = todayStart.getTime();
    
    // 获取所有学习会话
    const allSessions = await dataStorage.getStudySessions();
    
    // 筛选今天的会话
    const todaySessions = allSessions.filter(session => {
      const sessionStart = new Date(session.startTime).getTime();
      const matchesTime = sessionStart >= todayStartTimestamp;
      const matchesDeck = !deckId || session.deckId === deckId;
      return matchesTime && matchesDeck;
    });
    
    // 统计新卡片数量
    const totalNewCards = todaySessions.reduce((sum, session) => {
      return sum + (session.newCardsLearned || 0);
    }, 0);
    
    return totalNewCards;
  } catch (error) {
    console.error('[studyCompletionHelper] 获取今日新卡片数量失败:', error);
    return 0;
  }
}

/**
 * 计算剩余的新卡片配额
 * 
 * @param newCardsPerDay 每日新卡片限额
 * @param learnedToday 今天已学习的新卡片数量
 * @returns 剩余配额
 */
export function getRemainingNewCardsQuota(
  newCardsPerDay: number,
  learnedToday: number
): number {
  return Math.max(0, newCardsPerDay - learnedToday);
}

/**
 * 判断牌组是否完成今天的学习任务
 * 
 * 完成条件：
 * 1. 没有到期的卡片（学习中、复习、重新学习）
 * 2. 新卡片配额已用完
 * 
 * @param cards 牌组中的所有卡片
 * @param newCardsPerDay 每日新卡片限额
 * @param learnedNewCardsToday 今天已学习的新卡片数量
 * @returns 是否完成
 */
export function isDeckCompleteForToday(
  cards: Card[],
  newCardsPerDay: number,
  learnedNewCardsToday: number
): boolean {
  const now = Date.now();
  
  // 1. 计算到期卡片数量（不包括新卡片）
  const dueCount = cards.filter(card => {
    if (card.fsrs.state === 0) return false; // CardState.New = 0
    const dueTime = parseDueTime(card.fsrs.due);
    return dueTime <= now;
  }).length;
  
  // 2. 计算剩余新卡片配额
  const remainingQuota = getRemainingNewCardsQuota(newCardsPerDay, learnedNewCardsToday);
  
  // 3. 完成判定
  return dueCount === 0 && remainingQuota === 0;
}

/**
 * 获取提前学习的卡片
 * 
 * 选择未到期的学习中和复习卡片（state=1或2），按到期时间排序
 * 不包括新卡片（state=0）和重新学习卡片（state=3）
 * 
 * @param cards 牌组中的所有卡片
 * @param count 获取数量
 * @returns 未到期的学习中和复习卡片数组
 */
export function getAdvanceStudyCards(
  cards: Card[],
  count: number = 20
): Card[] {
  const now = Date.now();
  
  // 筛选未到期的学习中和复习卡片
  // state=1: Learning（学习中）
  // state=2: Review（复习）
  const futureCards = cards
    .filter(card => {
      const isLearningOrReview = card.fsrs.state === 1 || card.fsrs.state === 2;
      const dueTime = parseDueTime(card.fsrs.due);
      const isNotDueYet = dueTime > now;
      return isLearningOrReview && isNotDueYet;
    })
    .sort((a, b) => {
      // 按到期时间升序排序（最早到期的排在前面）
      return parseDueTime(a.fsrs.due) - parseDueTime(b.fsrs.due);
    });
  
  return futureCards.slice(0, count);
}

/**
 * 根据卡片ID列表加载卡片
 * 
 * @param dataStorage 数据存储实例
 * @param cardIds 卡片ID数组
 * @returns 卡片数组（保持cardIds的顺序，过滤无效ID）
 */
export async function loadCardsByIds(
  dataStorage: AnkiDataStorage,
  cardIds: string[]
): Promise<Card[]> {
  try {
    const allCards = await dataStorage.getAllCards();
    
    // 创建ID到卡片的映射
    const cardMap = new Map<string, Card>();
    allCards.forEach(card => {
      cardMap.set(card.id, card);
    });
    
    // 按照cardIds的顺序加载卡片（过滤无效ID）
    const loadedCards: Card[] = [];
    for (const cardId of cardIds) {
      const card = cardMap.get(cardId);
      if (card) {
        loadedCards.push(card);
      } else {
        console.warn(`[loadCardsByIds] 卡片ID不存在: ${cardId}`);
      }
    }
    
    console.log(`[loadCardsByIds] ✅ 加载 ${loadedCards.length}/${cardIds.length} 张卡片`);
    return loadedCards;
  } catch (error) {
    console.error('[loadCardsByIds] 加载卡片失败:', error);
    return [];
  }
}

/**
 * 加载牌组的学习卡片（应用新卡片限额）
 * 
 * 优先级：学习中 > 重新学习 > 复习 > 新卡片（限额）
 * 
 * @param dataStorage 数据存储实例
 * @param deckId 牌组ID
 * @param newCardsPerDay 每日新卡片限额
 * @param reviewsPerDay 每日总复习限制
 * @returns 排序后的学习卡片数组
 */
export async function loadDeckCardsForStudy(
  dataStorage: AnkiDataStorage,
  deckId: string,
  newCardsPerDay: number,
  reviewsPerDay: number
): Promise<Card[]> {
  try {
    const allCards = await dataStorage.getAllCards();
    const now = Date.now();
    const deckCards = allCards.filter(card => card.deckId === deckId);
    
    // 1. 学习中的到期卡片（state=1, 优先级最高）
    const learningCards = deckCards.filter(card => 
      card.fsrs.state === 1 && // CardState.Learning
      parseDueTime(card.fsrs.due) <= now
    );
    
    // 2. 重新学习的到期卡片（state=3）
    const relearningCards = deckCards.filter(card => 
      card.fsrs.state === 3 && // CardState.Relearning
      parseDueTime(card.fsrs.due) <= now
    );
    
    // 3. 复习到期的卡片（state=2）
    const reviewCards = deckCards.filter(card => 
      card.fsrs.state === 2 && // CardState.Review
      parseDueTime(card.fsrs.due) <= now
    );
    
    // 4. 新卡片（state=0，应用每日限额）
    const allNewCards = deckCards.filter(card => card.fsrs.state === 0);
    
    // 🔑 关键：计算今天还能学多少张新卡片
    const learnedNewCardsToday = await getLearnedNewCardsCountToday(dataStorage, deckId);
    const remainingNewCards = getRemainingNewCardsQuota(newCardsPerDay, learnedNewCardsToday);
    
    // 5. 合并：优先级顺序很重要
    const combined = [
      ...learningCards,
      ...relearningCards,
      ...reviewCards,
      ...allNewCards.slice(0, remainingNewCards)  // 🔑 限制新卡片数量
    ];
    
    // 6. 应用每日总限制
    return combined.slice(0, reviewsPerDay);
  } catch (error) {
    console.error('[studyCompletionHelper] 加载牌组卡片失败:', error);
    return [];
  }
}

/**
 * 加载全局学习卡片（所有牌组）
 * 
 * @param dataStorage 数据存储实例
 * @param newCardsPerDay 每日新卡片限额
 * @param reviewsPerDay 每日总复习限制
 * @returns 排序后的学习卡片数组
 */
export async function loadAllDueCardsForStudy(
  dataStorage: AnkiDataStorage,
  newCardsPerDay: number,
  reviewsPerDay: number
): Promise<Card[]> {
  try {
    const allCards = await dataStorage.getAllCards();
    const now = Date.now();
    
    // 1. 学习中的到期卡片
    const learningCards = allCards.filter(card => 
      card.fsrs.state === 1 && 
      parseDueTime(card.fsrs.due) <= now
    );
    
    // 2. 重新学习的到期卡片
    const relearningCards = allCards.filter(card => 
      card.fsrs.state === 3 && 
      parseDueTime(card.fsrs.due) <= now
    );
    
    // 3. 复习到期的卡片
    const reviewCards = allCards.filter(card => 
      card.fsrs.state === 2 && 
      parseDueTime(card.fsrs.due) <= now
    );
    
    // 4. 新卡片（应用每日限额）
    const allNewCards = allCards.filter(card => card.fsrs.state === 0);
    
    const learnedNewCardsToday = await getLearnedNewCardsCountToday(dataStorage);
    const remainingNewCards = getRemainingNewCardsQuota(newCardsPerDay, learnedNewCardsToday);
    
    // 5. 合并
    const combined = [
      ...learningCards,
      ...relearningCards,
      ...reviewCards,
      ...allNewCards.slice(0, remainingNewCards)
    ];
    
    // 6. 应用每日总限制
    return combined.slice(0, reviewsPerDay);
  } catch (error) {
    console.error('[studyCompletionHelper] 加载全局卡片失败:', error);
    return [];
  }
}

