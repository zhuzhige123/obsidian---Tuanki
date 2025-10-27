/**
 * FSRS Algorithm Implementation
 * Free Spaced Repetition Scheduler - 基于FSRS6.1.1标准的间隔重复算法
 *
 * 这个类现在作为FSRS6CoreAlgorithm的包装器，保持向后兼容性
 * 同时提供完整的FSRS6功能
 */

import type { FSRSCard, FSRSParameters, ReviewLog } from "../data/types";
import { CardState, Rating } from "../data/types";
import { FSRS6CoreAlgorithm } from "./fsrs6-core";
import type { FSRS6Card, FSRS6Parameters } from "../types/fsrs6-types";
import { FSRS6_DEFAULTS } from "../types/fsrs6-types";

export class FSRS {
  private core: FSRS6CoreAlgorithm;
  private params: FSRSParameters;

  constructor(params?: Partial<FSRSParameters>) {
    // 转换为FSRS6参数格式
    const fsrs6Params: Partial<FSRS6Parameters> = {
      version: '6.1.1',
      w: params?.w || [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS] as any,
      requestRetention: params?.requestRetention || FSRS6_DEFAULTS.REQUEST_RETENTION,
      maximumInterval: params?.maximumInterval || FSRS6_DEFAULTS.MAXIMUM_INTERVAL,
      enableFuzz: params?.enableFuzz ?? FSRS6_DEFAULTS.ENABLE_FUZZ,
      shortTermMemoryEnabled: true,
      longTermStabilityEnabled: true
    };

    this.core = new FSRS6CoreAlgorithm(fsrs6Params);

    // 保持向后兼容的参数格式
    this.params = {
      w: fsrs6Params.w || [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS],
      requestRetention: fsrs6Params.requestRetention || FSRS6_DEFAULTS.REQUEST_RETENTION,
      maximumInterval: fsrs6Params.maximumInterval || FSRS6_DEFAULTS.MAXIMUM_INTERVAL,
      enableFuzz: fsrs6Params.enableFuzz ?? FSRS6_DEFAULTS.ENABLE_FUZZ
    };
  }

  /**
   * 创建新卡片 - 使用FSRS6核心算法
   */
  createCard(): FSRSCard {
    const fsrs6Card = this.core.createCard();

    // 转换为向后兼容的FSRSCard格式
    return this.convertFromFSRS6Card(fsrs6Card);
  }

  /**
   * 复习卡片 - 使用FSRS6核心算法
   */
  review(card: FSRSCard, rating: Rating, reviewTime?: string): { card: FSRSCard, log: ReviewLog } {
    // 转换为FSRS6Card格式
    const fsrs6Card = this.convertToFSRS6Card(card);

    // 使用FSRS6核心算法进行复习
    const result = this.core.review(fsrs6Card, rating, reviewTime);

    // 转换回向后兼容的格式
    return {
      card: this.convertFromFSRS6Card(result.card),
      log: result.log
    };
  }

  /**
   * 转换FSRSCard到FSRS6Card格式
   */
  private convertToFSRS6Card(card: FSRSCard): FSRS6Card {
    return {
      ...card,
      version: '6.1.1',
      shortTermMemoryFactor: 1.0,
      longTermStabilityFactor: 1.0
    };
  }

  /**
   * 转换FSRS6Card到FSRSCard格式 (向后兼容)
   */
  private convertFromFSRS6Card(fsrs6Card: FSRS6Card): FSRSCard {
    const { version, shortTermMemoryFactor, longTermStabilityFactor, memoryPrediction, personalizedWeights, ...fsrsCard } = fsrs6Card;
    return fsrsCard;
  }

  /**
   * 获取当前参数
   */
  getParameters(): FSRSParameters {
    return { ...this.params };
  }

  /**
   * 更新参数
   */
  updateParameters(newParams: Partial<FSRSParameters>): void {
    // 转换为FSRS6参数格式并更新核心算法
    const fsrs6Params: Partial<FSRS6Parameters> = {
      ...newParams,
      version: '6.1.1'
    };

    this.core.updateParameters(fsrs6Params);
    this.params = { ...this.params, ...newParams };
  }

  /**
   * 获取FSRS6版本信息
   */
  getVersionInfo() {
    return this.core.getVersionInfo();
  }

  /**
   * 获取算法性能指标
   */
  getPerformanceMetrics() {
    return this.core.getPerformanceMetrics();
  }

  /**
   * 预测未来的记忆状态
   */
  predictMemoryState(card: FSRSCard, futureDays: number): number {
    const fsrs6Card = this.convertToFSRS6Card(card);
    const futureElapsed = fsrs6Card.elapsedDays + futureDays;
    if (fsrs6Card.stability <= 0) return 0;
    return Math.exp(-futureElapsed / fsrs6Card.stability);
  }

  /**
   * 计算学习进度（0-1）
   */
  calculateProgress(card: FSRSCard): number {
    if (card.state === CardState.New) return 0;
    if (card.state === CardState.Review && card.stability > 100) return 1;

    // 基于稳定性和复习次数计算进度
    const stabilityProgress = Math.min(card.stability / 100, 1);
    const repsProgress = Math.min(card.reps / 10, 1);
    return (stabilityProgress + repsProgress) / 2;
  }

  /**
   * 获取推荐的学习时间
   */
  getRecommendedStudyTime(totalCards: number, targetCards: number): number {
    // 基于卡片数量和目标估算学习时间（分钟）
    const avgTimePerCard = 30; // 30秒每张卡片
    const effectiveCards = Math.min(totalCards, targetCards);
    return Math.ceil(effectiveCards * avgTimePerCard / 60);
  }
}
