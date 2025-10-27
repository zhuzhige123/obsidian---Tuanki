/**
 * 记忆曲线计算工具函数
 */

import type { Card, ReviewLog, Rating } from '../data/types';
import type { MemoryCurvePoint, MemoryCurveData, TimeRange } from '../types/view-card-modal-types';

/**
 * 计算预测记忆曲线
 * 基于FSRS算法的遗忘曲线公式: R(t) = e^(-t/S)
 * 
 * @param stability 稳定性（天）
 * @param days 时间跨度（天）
 * @param pointCount 数据点数量
 * @returns 预测曲线数据点数组
 */
export function calculatePredictedCurve(
  stability: number,
  days: number = 60,
  pointCount: number = 100
): MemoryCurvePoint[] {
  const points: MemoryCurvePoint[] = [];
  const step = days / pointCount;
  
  for (let i = 0; i <= pointCount; i++) {
    const day = i * step;
    // FSRS遗忘曲线公式: R(t) = e^(-t/S)
    const retrievability = Math.exp(-day / Math.max(stability, 0.01));
    
    points.push({
      day: Math.round(day * 10) / 10, // 保留1位小数
      retrievability: retrievability * 100, // 转换为百分比
      isActual: false
    });
  }
  
  return points;
}

/**
 * 从复习历史计算实际记忆曲线
 * 
 * @param reviewHistory 复习历史记录
 * @param currentElapsedDays 当前已过天数
 * @param currentRetrievability 当前可提取性
 * @returns 实际曲线数据点数组
 */
export function calculateActualCurve(
  reviewHistory: ReviewLog[],
  currentElapsedDays: number,
  currentRetrievability: number
): MemoryCurvePoint[] {
  const points: MemoryCurvePoint[] = [];
  
  // 按时间排序复习记录
  const sortedHistory = [...reviewHistory].sort((a, b) => {
    const timeA = new Date(a.review).getTime();
    const timeB = new Date(b.review).getTime();
    return timeA - timeB;
  });
  
  // 添加历史复习点
  sortedHistory.forEach((review) => {
    // 计算该复习时刻的可提取性
    const retrievability = Math.exp(-review.elapsedDays / Math.max(review.stability, 0.01));
    
    points.push({
      day: review.elapsedDays,
      retrievability: retrievability * 100,
      isActual: true,
      rating: review.rating
    });
  });
  
  // 添加当前状态点
  if (currentElapsedDays > 0) {
    points.push({
      day: currentElapsedDays,
      retrievability: currentRetrievability * 100,
      isActual: true
    });
  }
  
  return points;
}

/**
 * 生成复习标记点（用于在图表上标注）
 * 
 * @param reviewHistory 复习历史
 * @returns 标记点数组
 */
export function generateReviewMarkers(reviewHistory: ReviewLog[]): Array<{
  day: number;
  retrievability: number;
  rating: Rating;
}> {
  return reviewHistory.map(review => {
    const retrievability = Math.exp(-review.elapsedDays / Math.max(review.stability, 0.01));
    return {
      day: review.elapsedDays,
      retrievability: retrievability * 100,
      rating: review.rating
    };
  });
}

/**
 * 根据时间范围过滤曲线数据
 * 
 * @param points 曲线数据点
 * @param range 时间范围
 * @returns 过滤后的数据点
 */
export function filterCurveByTimeRange(
  points: MemoryCurvePoint[],
  range: TimeRange
): MemoryCurvePoint[] {
  const maxDays = getMaxDaysForRange(range);
  
  if (maxDays === null) {
    return points; // 显示全部
  }
  
  return points.filter(point => point.day <= maxDays);
}

/**
 * 获取时间范围对应的最大天数
 * 
 * @param range 时间范围
 * @returns 最大天数，null表示无限制
 */
export function getMaxDaysForRange(range: TimeRange): number | null {
  switch (range) {
    case '7d': return 7;
    case '30d': return 30;
    case '90d': return 90;
    case 'all': return null;
  }
}

/**
 * 生成完整的记忆曲线数据
 * 
 * @param card 卡片数据
 * @param timeRange 时间范围
 * @returns 完整的曲线数据集
 */
export function generateMemoryCurveData(
  card: Card,
  timeRange: TimeRange = '30d'
): MemoryCurveData {
  const maxDays = getMaxDaysForRange(timeRange) || 90; // 默认90天
  
  // 计算预测曲线
  const predicted = calculatePredictedCurve(
    card.fsrs?.stability || 0,
    maxDays,
    100
  );
  
  // 计算实际曲线
  const actual = calculateActualCurve(
    card.reviewHistory || [],
    card.fsrs?.elapsedDays || 0,
    card.fsrs?.retrievability || 0
  );
  
  // 生成复习标记点
  const reviewMarkers = generateReviewMarkers(card.reviewHistory || []);
  
  return {
    predicted: filterCurveByTimeRange(predicted, timeRange),
    actual: filterCurveByTimeRange(actual, timeRange),
    reviewMarkers: reviewMarkers.filter(marker => {
      const maxDaysValue = getMaxDaysForRange(timeRange);
      return maxDaysValue === null || marker.day <= maxDaysValue;
    })
  };
}

/**
 * 获取评分对应的颜色
 * 
 * @param rating 评分
 * @returns 颜色代码
 */
export function getRatingColor(rating: Rating): string {
  switch (rating) {
    case 1: return '#ef4444'; // Again - 红色
    case 2: return '#f59e0b'; // Hard - 橙色
    case 3: return '#22c55e'; // Good - 绿色
    case 4: return '#3b82f6'; // Easy - 蓝色
    default: return '#6b7280'; // 灰色
  }
}

/**
 * 获取评分对应的标签
 * 
 * @param rating 评分
 * @returns 标签文本
 */
export function getRatingLabel(rating: Rating): string {
  switch (rating) {
    case 1: return '遗忘';
    case 2: return '困难';
    case 3: return '良好';
    case 4: return '简单';
    default: return '未知';
  }
}

