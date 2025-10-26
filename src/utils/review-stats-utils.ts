/**
 * 复习数据统计工具函数
 */

import type { Card, ReviewLog, Rating } from '../data/types';
import type { ReviewStatsData, FSRSMetrics } from '../types/view-card-modal-types';

/**
 * 聚合复习统计数据
 * 
 * @param card 卡片数据
 * @returns 复习统计数据
 */
export function aggregateReviewStats(card: Card): ReviewStatsData {
  const reviews = card.reviewHistory || [];
  
  // 计算成功率（Good和Easy的比例）
  const successfulReviews = reviews.filter(r => r.rating >= 3).length;
  const successRate = reviews.length > 0 ? successfulReviews / reviews.length : 0;
  
  // 计算平均间隔
  const averageInterval = calculateAverageInterval(reviews);
  
  return {
    totalReviews: card.stats?.totalReviews || 0,
    lapses: card.fsrs?.lapses || 0,
    successRate,
    averageInterval,
    totalStudyTime: card.stats?.totalTime || 0,
    averageStudyTime: card.stats?.averageTime || 0
  };
}

/**
 * 计算平均复习间隔
 * 
 * @param reviews 复习历史
 * @returns 平均间隔（天）
 */
export function calculateAverageInterval(reviews: ReviewLog[]): number {
  if (reviews.length === 0) return 0;
  
  const totalInterval = reviews.reduce((sum, review) => sum + review.scheduledDays, 0);
  return totalInterval / reviews.length;
}

/**
 * 计算成功率
 * 
 * @param reviews 复习历史
 * @returns 成功率 (0-1)
 */
export function calculateSuccessRate(reviews: ReviewLog[]): number {
  if (reviews.length === 0) return 0;
  
  const successfulReviews = reviews.filter(r => r.rating >= 3).length;
  return successfulReviews / reviews.length;
}

/**
 * 提取FSRS核心指标
 * 
 * @param card 卡片数据
 * @returns FSRS指标
 */
export function extractFSRSMetrics(card: Card): FSRSMetrics {
  return {
    stability: card.fsrs?.stability || 0,
    difficulty: card.fsrs?.difficulty || 0,
    retrievability: card.fsrs?.retrievability || 0,
    elapsedDays: card.fsrs?.elapsedDays || 0,
    scheduledDays: card.fsrs?.scheduledDays || 0
  };
}

/**
 * 按评分分组统计复习次数
 * 
 * @param reviews 复习历史
 * @returns 各评分的次数
 */
export function groupReviewsByRating(reviews: ReviewLog[]): Record<Rating, number> {
  const groups: Record<Rating, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0
  };
  
  reviews.forEach(review => {
    groups[review.rating] = (groups[review.rating] || 0) + 1;
  });
  
  return groups;
}

/**
 * 计算最近N天的复习统计
 * 
 * @param reviews 复习历史
 * @param days 天数
 * @returns 复习统计
 */
export function getRecentReviewStats(reviews: ReviewLog[], days: number): {
  count: number;
  successRate: number;
  averageInterval: number;
} {
  const now = Date.now();
  const cutoffTime = now - days * 24 * 60 * 60 * 1000;
  
  const recentReviews = reviews.filter(review => {
    const reviewTime = new Date(review.review).getTime();
    return reviewTime >= cutoffTime;
  });
  
  return {
    count: recentReviews.length,
    successRate: calculateSuccessRate(recentReviews),
    averageInterval: calculateAverageInterval(recentReviews)
  };
}

/**
 * 计算学习效率得分（0-100）
 * 基于成功率、平均间隔和遗忘次数
 * 
 * @param stats 复习统计数据
 * @returns 效率得分
 */
export function calculateEfficiencyScore(stats: ReviewStatsData): number {
  if (stats.totalReviews === 0) return 0;
  
  // 成功率权重：40%
  const successScore = stats.successRate * 40;
  
  // 平均间隔权重：30%（归一化到0-30，10天及以上为满分）
  const intervalScore = Math.min(stats.averageInterval / 10, 1) * 30;
  
  // 遗忘率权重：30%（遗忘率越低越好）
  const lapseRate = stats.totalReviews > 0 ? stats.lapses / stats.totalReviews : 0;
  const lapseScore = (1 - lapseRate) * 30;
  
  return Math.round(successScore + intervalScore + lapseScore);
}

/**
 * 格式化学习时间
 * 
 * @param seconds 秒数
 * @returns 格式化字符串
 */
export function formatStudyTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}秒`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}分钟`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  }
}

/**
 * 获取稳定性描述
 * 
 * @param stability 稳定性（天）
 * @returns 描述文本
 */
export function getStabilityDescription(stability: number): string {
  if (stability < 1) return '非常不稳定';
  if (stability < 3) return '不稳定';
  if (stability < 7) return '较不稳定';
  if (stability < 14) return '一般';
  if (stability < 30) return '较稳定';
  if (stability < 90) return '稳定';
  return '非常稳定';
}

/**
 * 获取难度描述
 * 
 * @param difficulty 难度 (1-10)
 * @returns 描述文本
 */
export function getDifficultyDescription(difficulty: number): string {
  if (difficulty <= 2) return '非常简单';
  if (difficulty <= 4) return '简单';
  if (difficulty <= 6) return '中等';
  if (difficulty <= 8) return '困难';
  return '非常困难';
}

/**
 * 获取可提取性描述
 * 
 * @param retrievability 可提取性 (0-1)
 * @returns 描述文本
 */
export function getRetrievabilityDescription(retrievability: number): string {
  if (retrievability >= 0.9) return '记忆清晰';
  if (retrievability >= 0.7) return '记忆良好';
  if (retrievability >= 0.5) return '记忆一般';
  if (retrievability >= 0.3) return '记忆模糊';
  return '几乎遗忘';
}

