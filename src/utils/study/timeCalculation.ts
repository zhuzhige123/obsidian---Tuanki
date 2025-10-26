/**
 * 时间计算工具函数
 * 
 * 提供学习时间相关的计算和格式化功能
 */

import type { ReviewHistory } from "../../data/types";

/**
 * 将分钟转换为天数
 * 
 * @param minutes - 分钟数
 * @returns 天数（保留2位小数）
 */
export function minutesToDays(minutes: number): number {
  return Math.max(0, (minutes || 0) / (24 * 60));
}

/**
 * 格式化学习时间
 * 
 * @param ms - 毫秒数
 * @returns 格式化的时间字符串（如："1分30秒"）
 */
export function formatStudyTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}分${remainingSeconds}秒`;
  }
  return `${seconds}秒`;
}

/**
 * 计算平均学习时间
 * 
 * @param reviews - 复习历史记录数组
 * @returns 平均时间（毫秒）
 */
export function calculateAverageTime(reviews: { responseTime: number }[]): number {
  if (!reviews || reviews.length === 0) return 0;

  const totalTime = reviews.reduce((sum, review) => sum + review.responseTime, 0);
  return totalTime / reviews.length;
}

/**
 * 格式化间隔时间
 * 
 * @param days - 天数
 * @returns 格式化的间隔字符串
 * 
 * @example
 * formatInterval(0.5) // "12小时"
 * formatInterval(1) // "1天"
 * formatInterval(7) // "7天"
 * formatInterval(30) // "1个月"
 * formatInterval(365) // "1年"
 */
export function formatInterval(days: number): string {
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours}小时`;
  }

  if (days < 30) {
    return `${Math.round(days)}天`;
  }

  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months}个月`;
  }

  const years = (days / 365).toFixed(1);
  return `${years}年`;
}

/**
 * 计算剩余学习时间估算
 * 
 * @param remainingCards - 剩余卡片数
 * @param averageTimePerCard - 每张卡片平均时间（毫秒）
 * @returns 格式化的预估时间
 */
export function estimateRemainingTime(
  remainingCards: number,
  averageTimePerCard: number
): string {
  if (remainingCards <= 0 || averageTimePerCard <= 0) {
    return "即将完成";
  }

  const totalMs = remainingCards * averageTimePerCard;
  return formatStudyTime(totalMs);
}

/**
 * 判断是否是同一天
 * 
 * @param date1 - 日期1
 * @param date2 - 日期2
 * @returns 是否同一天
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * 获取今天开始的时间戳
 * 
 * @returns 今天00:00:00的Date对象
 */
export function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * 获取今天结束的时间戳
 * 
 * @returns 今天23:59:59的Date对象
 */
export function getTodayEnd(): Date {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
}

