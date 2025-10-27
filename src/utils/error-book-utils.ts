/**
 * 错题集管理工具函数
 * 提供错题等级计算和统计功能
 */

import type { Card, ErrorLevel } from '../data/types';

/**
 * 错题等级配置
 * 定义三个等级的阈值、样式和显示信息
 */
export const ERROR_LEVEL_CONFIG = {
  light: {
    label: '轻度错题',
    icon: 'alert-circle',
    color: 'var(--color-yellow)',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    range: '1-2次错误',
    description: '偶尔出错，需要适度复习',
    threshold: { min: 1, max: 2 }
  },
  medium: {
    label: '中度错题',
    icon: 'alert-triangle',
    color: 'var(--color-orange)',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    range: '3-5次错误',
    description: '多次出错，需要重点关注',
    threshold: { min: 3, max: 5 }
  },
  severe: {
    label: '重度错题',
    icon: 'alert-octagon',
    color: 'var(--color-red)',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    range: '6+次错误',
    description: '频繁出错，强烈建议深入学习',
    threshold: { min: 6, max: Infinity }
  }
} as const;

/**
 * 根据错误次数计算错题等级
 * 
 * 分级标准：
 * - 轻度：1-2次错误
 * - 中度：3-5次错误
 * - 重度：6+次错误
 * 
 * @param errorCount - 累计错误次数
 * @returns 错题等级或null（0次错误）
 */
export function calculateErrorLevel(errorCount: number): ErrorLevel | null {
  if (errorCount === 0 || errorCount < 0) {
    return null;
  }
  
  if (errorCount <= ERROR_LEVEL_CONFIG.light.threshold.max) {
    return 'light';
  }
  
  if (errorCount <= ERROR_LEVEL_CONFIG.medium.threshold.max) {
    return 'medium';
  }
  
  return 'severe';
}

/**
 * 获取卡片的错题等级
 * 
 * 优先级：
 * 1. card.stats.errorTracking.errorLevel（缓存值）
 * 2. 从 errorTracking.errorCount 计算
 * 3. 从 choiceStats.errorCount 计算（向后兼容）
 * 
 * @param card - 卡片对象
 * @returns 错题等级或null
 */
export function getCardErrorLevel(card: Card): ErrorLevel | null {
  // 🆕 安全检查：确保 card.stats 存在
  if (!card?.stats) {
    return null;
  }
  
  // 优先使用已缓存的等级
  if (card.stats.errorTracking?.errorLevel) {
    return card.stats.errorTracking.errorLevel;
  }
  
  // 从 errorTracking 计算
  if (card.stats.errorTracking?.errorCount !== undefined) {
    return calculateErrorLevel(card.stats.errorTracking.errorCount);
  }
  
  // 向后兼容：从 choiceStats 计算
  if (card.stats.choiceStats?.errorCount !== undefined) {
    return calculateErrorLevel(card.stats.choiceStats.errorCount);
  }
  
  return null;
}

/**
 * 检查卡片是否在错题集中
 * @param card - 卡片对象
 * @returns 是否在错题集中
 */
export function isInErrorBook(card: Card): boolean {
  // 🆕 安全检查：确保 card.stats 存在
  if (!card?.stats) {
    return false;
  }
  
  // 优先使用 errorTracking
  if (card.stats.errorTracking?.isInErrorBook !== undefined) {
    return card.stats.errorTracking.isInErrorBook;
  }
  
  // 向后兼容：使用 choiceStats
  if (card.stats.choiceStats?.isInErrorBook !== undefined) {
    return card.stats.choiceStats.isInErrorBook;
  }
  
  // 默认：如果有错误次数，则视为在错题集中
  const errorLevel = getCardErrorLevel(card);
  return errorLevel !== null;
}

/**
 * 批量统计错题集分布
 * @param cards - 卡片数组
 * @returns 错题集分布统计对象 { light: 数量, medium: 数量, severe: 数量 }
 */
export function getErrorBookDistribution(cards: Card[]): Record<ErrorLevel, number> {
  const distribution: Record<ErrorLevel, number> = {
    light: 0,
    medium: 0,
    severe: 0
  };
  
  for (const card of cards) {
    const errorLevel = getCardErrorLevel(card);
    if (errorLevel) {
      distribution[errorLevel]++;
    }
  }
  
  return distribution;
}

/**
 * 获取错题等级的配置信息
 * @param level - 错题等级
 * @returns 配置信息对象
 */
export function getErrorLevelConfig(level: ErrorLevel) {
  return ERROR_LEVEL_CONFIG[level];
}

/**
 * 更新卡片的错题追踪数据
 * 
 * 在卡片答题后调用此函数更新错题统计
 * 
 * @param card - 卡片对象
 * @param isCorrect - 本次是否回答正确
 * @returns 更新后的 errorTracking 对象
 */
export function updateCardErrorTracking(card: Card, isCorrect: boolean) {
  const errorTracking = card.stats.errorTracking || {
    isInErrorBook: false,
    errorCount: 0,
    correctCount: 0,
    accuracy: 0
  };
  
  // 更新计数
  if (isCorrect) {
    errorTracking.correctCount++;
  } else {
    errorTracking.errorCount++;
    errorTracking.lastErrorDate = new Date().toISOString();
  }
  
  // 重新计算正确率
  const totalAttempts = errorTracking.errorCount + errorTracking.correctCount;
  errorTracking.accuracy = totalAttempts > 0 
    ? errorTracking.correctCount / totalAttempts 
    : 0;
  
  // 重新计算错题等级
  errorTracking.errorLevel = calculateErrorLevel(errorTracking.errorCount);
  
  // 更新错题集标记
  errorTracking.isInErrorBook = errorTracking.errorLevel !== null;
  
  return errorTracking;
}










