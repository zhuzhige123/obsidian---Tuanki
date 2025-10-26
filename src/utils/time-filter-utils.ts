/**
 * 时间筛选工具函数
 * 用于根据时间条件筛选卡片
 */

import type { Card } from '../data/types';
import type { TimeFilterType } from '../types/time-filter-types';

/**
 * 获取今天的时间范围
 */
function getTodayRange(): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  return { start, end };
}

/**
 * 检查时间戳是否在今天
 */
function isToday(timestamp: number | Date): boolean {
  const { start, end } = getTodayRange();
  const time = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
  return time >= start && time <= end;
}

/**
 * 今天到期的卡片
 */
function isDueToday(card: Card): boolean {
  if (!card.fsrs?.due) return false;
  // due 字段是时间戳（数字），而不是Date对象
  const dueTime = typeof card.fsrs.due === 'number' ? card.fsrs.due : Number(card.fsrs.due);
  return isToday(dueTime);
}

/**
 * 今天添加的卡片
 */
function isAddedToday(card: Card): boolean {
  if (!card.created) return false;
  // created 可能是 ISO 字符串或时间戳，统一转换为时间戳
  const createdTime = typeof card.created === 'string' ? new Date(card.created).getTime() : Number(card.created);
  return isToday(createdTime);
}

/**
 * 今天编辑的卡片
 */
function isEditedToday(card: Card): boolean {
  if (!card.updated) return false;
  // updated 可能是 ISO 字符串或时间戳，统一转换为时间戳
  const updatedTime = typeof card.updated === 'string' ? new Date(card.updated).getTime() : Number(card.updated);
  return isToday(updatedTime);
}

/**
 * 今天复习的卡片
 */
function isReviewedToday(card: Card): boolean {
  if (!card.fsrs?.reviewHistory || card.fsrs.reviewHistory.length === 0) {
    return false;
  }
  
  // 检查最后一次复习是否在今天
  const lastReview = card.fsrs.reviewHistory[card.fsrs.reviewHistory.length - 1];
  if (lastReview && lastReview.timestamp) {
    // timestamp 可能是 ISO 字符串或时间戳，统一转换为时间戳
    const reviewTime = typeof lastReview.timestamp === 'string' 
      ? new Date(lastReview.timestamp).getTime() 
      : Number(lastReview.timestamp);
    return isToday(reviewTime);
  }
  
  return false;
}

/**
 * 首次复习的卡片（学习中状态）
 * FSRS state: 0=New, 1=Learning, 2=Review, 3=Relearning
 */
function isFirstReview(card: Card): boolean {
  return card.fsrs?.state === 1;  // Learning state
}

/**
 * 今天重来的卡片（重新学习状态）
 */
function isRetryToday(card: Card): boolean {
  // 检查是否为Relearning状态
  if (card.fsrs?.state !== 3) return false;
  
  // 检查最后一次复习是否在今天
  return isReviewedToday(card);
}

/**
 * 从未复习的卡片
 */
function isNeverReviewed(card: Card): boolean {
  return !card.fsrs?.reviewHistory || card.fsrs.reviewHistory.length === 0;
}

/**
 * 应用时间筛选
 * @param cards 卡片数组
 * @param timeFilter 时间筛选类型
 * @returns 筛选后的卡片数组
 */
export function applyTimeFilter(cards: Card[], timeFilter: TimeFilterType): Card[] {
  if (!timeFilter) return cards;
  
  switch (timeFilter) {
    case 'today':
      // 今天：今天到期或需要复习的
      return cards.filter(card => {
        if (!card.fsrs?.due) return false;
        const { start } = getTodayRange();
        const dueTime = typeof card.fsrs.due === 'number' ? card.fsrs.due : Number(card.fsrs.due);
        return dueTime <= start + 86400000; // 今天结束前
      });
      
    case 'due-today':
      return cards.filter(isDueToday);
      
    case 'added-today':
      return cards.filter(isAddedToday);
      
    case 'edited-today':
      return cards.filter(isEditedToday);
      
    case 'reviewed-today':
      return cards.filter(isReviewedToday);
      
    case 'first-review':
      return cards.filter(isFirstReview);
      
    case 'retry-today':
      return cards.filter(isRetryToday);
      
    case 'never-reviewed':
      return cards.filter(isNeverReviewed);
      
    default:
      return cards;
  }
}

/**
 * 计算时间筛选的卡片数量
 * @param cards 卡片数组
 * @param timeFilter 时间筛选类型
 * @returns 符合条件的卡片数量
 */
export function countTimeFilterCards(cards: Card[], timeFilter: TimeFilterType): number {
  return applyTimeFilter(cards, timeFilter).length;
}

/**
 * 获取所有时间筛选的卡片数量统计
 * @param cards 卡片数组
 * @returns 时间筛选类型到卡片数量的映射
 */
export function getTimeFilterCounts(cards: Card[]): Record<string, number> {
  const { start } = getTodayRange();
  
  return {
    'today': cards.filter(card => {
      if (!card.fsrs?.due) return false;
      const dueTime = typeof card.fsrs.due === 'number' ? card.fsrs.due : Number(card.fsrs.due);
      return dueTime <= start + 86400000;
    }).length,
    'due-today': cards.filter(isDueToday).length,
    'added-today': cards.filter(isAddedToday).length,
    'edited-today': cards.filter(isEditedToday).length,
    'reviewed-today': cards.filter(isReviewedToday).length,
    'first-review': cards.filter(isFirstReview).length,
    'retry-today': cards.filter(isRetryToday).length,
    'never-reviewed': cards.filter(isNeverReviewed).length,
    'all': cards.length
  };
}

