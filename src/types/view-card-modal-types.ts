/**
 * ViewCardModal相关类型定义
 */

import type { Rating } from '../data/types';

/**
 * 标签页ID类型
 */
export type TabId = 'info' | 'stats' | 'curve';

/**
 * 标签页定义
 */
export interface TabDefinition {
  id: TabId;
  label: string;
  icon: string;
}

/**
 * 记忆曲线数据点
 */
export interface MemoryCurvePoint {
  /** 天数 */
  day: number;
  /** 可提取性 (0-100) */
  retrievability: number;
  /** 是否为实际数据点（false表示预测） */
  isActual: boolean;
  /** 评分（仅实际数据点） */
  rating?: Rating;
}

/**
 * 记忆曲线数据集
 */
export interface MemoryCurveData {
  /** 预测曲线数据 */
  predicted: MemoryCurvePoint[];
  /** 实际曲线数据 */
  actual: MemoryCurvePoint[];
  /** 复习标记点 */
  reviewMarkers: Array<{
    day: number;
    retrievability: number;
    rating: Rating;
  }>;
}

/**
 * 时间范围选项
 */
export type TimeRange = '7d' | '30d' | '90d' | 'all';

/**
 * 时间范围配置
 */
export interface TimeRangeConfig {
  value: TimeRange;
  label: string;
  days: number | null; // null表示全部
}

/**
 * 复习统计数据
 */
export interface ReviewStatsData {
  /** 总复习次数 */
  totalReviews: number;
  /** 遗忘次数 */
  lapses: number;
  /** 成功率 (0-1) */
  successRate: number;
  /** 平均间隔（天） */
  averageInterval: number;
  /** 总学习时间（秒） */
  totalStudyTime: number;
  /** 平均学习时间（秒） */
  averageStudyTime: number;
}

/**
 * FSRS核心指标
 */
export interface FSRSMetrics {
  /** 稳定性（天） */
  stability: number;
  /** 难度 (1-10) */
  difficulty: number;
  /** 可提取性 (0-1) */
  retrievability: number;
  /** 已过天数 */
  elapsedDays: number;
  /** 预定天数 */
  scheduledDays: number;
}

/**
 * 卡片基本信息
 */
export interface CardBasicInfo {
  /** UUID */
  uuid: string;
  /** 卡片ID */
  id: string;
  /** 牌组名称 */
  deckName: string;
  /** 模板名称 */
  templateName: string;
  /** 卡片类型 */
  cardType: string;
  /** 创建时间 */
  created: string;
  /** 修改时间 */
  modified: string;
  /** 标签列表 */
  tags: string[];
  /** 来源文档 */
  sourceFile?: string;
  /** 块引用 */
  sourceBlock?: string;
  /** 文档是否存在 */
  sourceExists?: boolean;
  /** 优先级 */
  priority?: number;
}


