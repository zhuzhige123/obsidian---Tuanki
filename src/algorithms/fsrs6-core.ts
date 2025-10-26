/**
 * FSRS6 核心算法实现
 * 基于 FSRS6.1.1 标准规范的完整数学模型
 */

import type { FSRSCard, ReviewLog } from "../data/types";
import { CardState, Rating } from "../data/types";
import type { 
  FSRS6Card, 
  FSRS6Parameters, 
  FSRS6VersionInfo,
  FSRS6PerformanceMetrics,
  FSRS6AlgorithmState
} from "../types/fsrs6-types";
import { 
  FSRS6_DEFAULTS, 
  FSRS6_PARAMETER_RANGES,
  FSRS6Error,
  FSRS6ParameterError,
  FSRS6ComputationError
} from "../types/fsrs6-types";

/**
 * FSRS6 核心算法类
 * 实现标准FSRS6数学模型和所有核心功能
 */
export class FSRS6CoreAlgorithm {
  private params: FSRS6Parameters;
  private state: FSRS6AlgorithmState;
  private performanceMetrics: FSRS6PerformanceMetrics;

  constructor(params?: Partial<FSRS6Parameters>) {
    this.params = this.initializeParameters(params);
    this.state = this.initializeState();
    this.performanceMetrics = this.initializeMetrics();
    
    this.validateParameters();
  }

  /**
   * 获取FSRS6版本信息
   */
  getVersionInfo(): FSRS6VersionInfo {
    return {
      version: '6.1.1',
      algorithmName: 'FSRS6',
      parameterCount: 21,
      implementationDate: new Date().toISOString(),
      compatibilityLevel: 'standard'
    };
  }

  /**
   * 创建新的FSRS6卡片
   */
  createCard(): FSRS6Card {
    const startTime = performance.now();
    
    try {
      const now = new Date();
      const card: FSRS6Card = {
        version: '6.1.1',
        due: now.toISOString(),
        stability: 0,
        difficulty: this.calculateInitialDifficulty(),
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: undefined,
        retrievability: 1,
        shortTermMemoryFactor: this.params.shortTermMemoryEnabled ? 1.0 : undefined,
        longTermStabilityFactor: this.params.longTermStabilityEnabled ? 1.0 : undefined
      };

      this.updatePerformanceMetrics('createCard', performance.now() - startTime);
      return card;
    } catch (error) {
      throw new FSRS6ComputationError(
        `Failed to create FSRS6 card: ${error.message}`,
        'createCard',
        { params: this.params }
      );
    }
  }

  /**
   * 复习卡片 - FSRS6核心算法
   */
  review(card: FSRS6Card, rating: Rating, reviewTime?: string): { card: FSRS6Card, log: ReviewLog } {
    const startTime = performance.now();
    
    try {
      this.validateCard(card);
      this.validateRating(rating);

      const now = reviewTime ? new Date(reviewTime) : new Date();
      const prevState = card.state;
      const prevStability = card.stability;
      const prevDifficulty = card.difficulty;

      // 计算已过天数
      const elapsedDays = card.lastReview 
        ? this.calculateElapsedDays(card.lastReview, now.toISOString())
        : 0;

      // 创建更新后的卡片副本
      let updatedCard: FSRS6Card = { 
        ...card,
        lastReview: now.toISOString(),
        elapsedDays: elapsedDays,
        reps: card.reps + 1
      };

      // 根据评分更新卡片状态
      updatedCard = this.updateCardByRating(updatedCard, rating);

      // 计算下次复习时间
      const dueTime = this.calculateNextDue(updatedCard, now);
      updatedCard.due = dueTime.toISOString();

      // 更新可回忆性
      updatedCard.retrievability = this.calculateRetrievability(updatedCard);

      // FSRS6特有：更新短期记忆和长期稳定性因子
      if (this.params.shortTermMemoryEnabled) {
        updatedCard.shortTermMemoryFactor = this.calculateShortTermMemoryFactor(updatedCard, rating);
      }
      
      if (this.params.longTermStabilityEnabled) {
        updatedCard.longTermStabilityFactor = this.calculateLongTermStabilityFactor(updatedCard, rating);
      }

      // 创建复习记录
      const log: ReviewLog = {
        rating,
        state: prevState,
        due: card.due,
        stability: prevStability,
        difficulty: prevDifficulty,
        elapsedDays: card.elapsedDays,
        lastElapsedDays: elapsedDays,
        scheduledDays: updatedCard.scheduledDays,
        review: now.toISOString()
      };

      this.updateState(updatedCard, rating);
      this.updatePerformanceMetrics('review', performance.now() - startTime);

      return { card: updatedCard, log };
    } catch (error) {
      throw new FSRS6ComputationError(
        `Failed to review card: ${error.message}`,
        'review',
        { card, rating, reviewTime }
      );
    }
  }

  /**
   * 计算初始难度 (FSRS6优化版本)
   */
  private calculateInitialDifficulty(): number {
    const w4 = this.params.w[4];
    const w5 = this.params.w[5];
    
    // FSRS6改进的初始难度计算
    const baseDifficulty = w4 - w5 * 3;
    return Math.max(Math.min(baseDifficulty, 10), 1);
  }

  /**
   * 根据评分更新卡片状态
   */
  private updateCardByRating(card: FSRS6Card, rating: Rating): FSRS6Card {
    switch (rating) {
      case Rating.Again:
        return this.handleAgainRating(card);
      case Rating.Hard:
        return this.handleHardRating(card);
      case Rating.Good:
        return this.handleGoodRating(card);
      case Rating.Easy:
        return this.handleEasyRating(card);
      default:
        throw new FSRS6ParameterError('Invalid rating value', 'rating', rating);
    }
  }

  /**
   * 处理"再次学习"评分 (FSRS6优化)
   */
  private handleAgainRating(card: FSRS6Card): FSRS6Card {
    const updatedCard = { ...card };
    
    updatedCard.lapses += 1;
    updatedCard.difficulty = this.calculateNextDifficulty(card.difficulty, Rating.Again);
    updatedCard.stability = this.calculateForgetStability(card);
    updatedCard.state = card.state === CardState.New ? CardState.Learning : CardState.Relearning;
    updatedCard.scheduledDays = 0;

    return updatedCard;
  }

  /**
   * 处理"困难"评分 (FSRS6优化)
   */
  private handleHardRating(card: FSRS6Card): FSRS6Card {
    const updatedCard = { ...card };
    
    updatedCard.difficulty = this.calculateNextDifficulty(card.difficulty, Rating.Hard);
    
    if (card.state === CardState.New) {
      updatedCard.stability = this.calculateInitialStability(Rating.Hard);
      updatedCard.state = CardState.Learning;
      updatedCard.scheduledDays = this.calculateNextInterval(updatedCard.stability);
    } else {
      updatedCard.stability = this.calculateRecallStability(card, Rating.Hard);
      updatedCard.state = CardState.Review;
      updatedCard.scheduledDays = this.calculateNextInterval(updatedCard.stability * 0.85); // Hard惩罚
    }
    
    return updatedCard;
  }

  /**
   * 处理"良好"评分 (FSRS6优化)
   */
  private handleGoodRating(card: FSRS6Card): FSRS6Card {
    const updatedCard = { ...card };
    
    updatedCard.difficulty = this.calculateNextDifficulty(card.difficulty, Rating.Good);
    
    if (card.state === CardState.New) {
      updatedCard.stability = this.calculateInitialStability(Rating.Good);
      updatedCard.state = CardState.Review;
      updatedCard.scheduledDays = this.calculateNextInterval(updatedCard.stability);
    } else {
      updatedCard.stability = this.calculateRecallStability(card, Rating.Good);
      updatedCard.state = CardState.Review;
      updatedCard.scheduledDays = this.calculateNextInterval(updatedCard.stability);
    }
    
    return updatedCard;
  }

  /**
   * 处理"简单"评分 (FSRS6优化)
   */
  private handleEasyRating(card: FSRS6Card): FSRS6Card {
    const updatedCard = { ...card };
    
    updatedCard.difficulty = this.calculateNextDifficulty(card.difficulty, Rating.Easy);
    
    if (card.state === CardState.New) {
      updatedCard.stability = this.calculateInitialStability(Rating.Easy);
      updatedCard.state = CardState.Review;
      updatedCard.scheduledDays = this.calculateNextInterval(updatedCard.stability);
    } else {
      updatedCard.stability = this.calculateRecallStability(card, Rating.Easy);
      updatedCard.state = CardState.Review;
      updatedCard.scheduledDays = this.calculateNextInterval(updatedCard.stability * 1.15); // Easy奖励
    }
    
    return updatedCard;
  }

  /**
   * 计算初始稳定性 (FSRS6标准公式)
   */
  private calculateInitialStability(rating: Rating): number {
    const w = this.params.w;
    return Math.max(w[rating - 1], 0.1);
  }

  /**
   * 计算下一个难度 (FSRS6标准公式)
   */
  private calculateNextDifficulty(difficulty: number, rating: Rating): number {
    const w = this.params.w;
    const delta = -w[6] * (rating - 3);
    const meanReversion = w[4] * (this.calculateInitialDifficulty() - difficulty);
    const newDifficulty = difficulty + delta + meanReversion;
    
    return Math.max(Math.min(newDifficulty, 10), 1);
  }

  /**
   * 计算遗忘后的稳定性 (FSRS6标准公式)
   */
  private calculateForgetStability(card: FSRS6Card): number {
    const w = this.params.w;
    const dr = Math.exp(w[11] * (card.difficulty - w[4]));
    const dsf = Math.pow(card.stability, w[12]) * Math.pow(Math.max(card.elapsedDays, 1), w[13]);
    
    return Math.max(w[10] * dsf * dr, 0.01);
  }

  /**
   * 计算回忆后的稳定性 (FSRS6标准公式)
   */
  private calculateRecallStability(card: FSRS6Card, rating: Rating): number {
    const w = this.params.w;
    const hardPenalty = rating === Rating.Hard ? w[15] : 1;
    const easyBonus = rating === Rating.Easy ? w[16] : 1;
    
    const retrievability = this.calculateRetrievability(card);
    const successRecall = Math.exp(w[8] * (rating - 3 + w[9] * (1 - retrievability)));
    
    let stability = card.stability * successRecall * hardPenalty * easyBonus;
    
    // FSRS6特有：短期记忆效应
    if (this.params.shortTermMemoryEnabled && card.elapsedDays <= 3) {
      const shortTermFactor = 1 + w[17] * Math.exp(-w[18] * card.elapsedDays);
      stability *= shortTermFactor;
    }
    
    // FSRS6特有：长期稳定性优化
    if (this.params.longTermStabilityEnabled && card.elapsedDays >= 30) {
      const longTermFactor = 1 + w[19] * Math.log(1 + w[20] * card.elapsedDays / 30);
      stability *= longTermFactor;
    }
    
    return Math.max(stability, 0.01);
  }

  /**
   * 计算可回忆性 (FSRS6标准公式)
   */
  private calculateRetrievability(card: FSRS6Card): number {
    if (card.elapsedDays <= 0 || card.stability <= 0) return 1;
    return Math.exp(-card.elapsedDays / card.stability);
  }

  /**
   * 计算下次间隔 (FSRS6优化版本)
   */
  private calculateNextInterval(stability: number): number {
    const base = Math.max(1, Math.round(stability));
    const request = Math.min(Math.max(this.params.requestRetention, 0.5), 0.99);

    // FSRS6改进的间隔计算
    const scaling = Math.log(request) / Math.log(0.9);
    const interval = Math.max(1, Math.round(base * Math.abs(scaling)));

    return Math.min(interval, this.params.maximumInterval);
  }

  /**
   * 计算下次复习时间
   */
  private calculateNextDue(card: FSRS6Card, reviewTime: Date): Date {
    const due = new Date(reviewTime);
    due.setDate(due.getDate() + card.scheduledDays);

    // 应用随机化
    if (this.params.enableFuzz) {
      const fuzzedDue = this.applyFuzz(due, card.scheduledDays);
      return fuzzedDue;
    }

    return due;
  }

  /**
   * 应用随机化 (FSRS6标准实现)
   */
  private applyFuzz(due: Date, scheduledDays: number): Date {
    if (scheduledDays < 2.5) return due;

    const fuzzRange = Math.min(0.05 * scheduledDays, 1);
    const fuzz = (Math.random() - 0.5) * 2 * fuzzRange;

    const fuzzedDue = new Date(due);
    fuzzedDue.setDate(fuzzedDue.getDate() + Math.round(fuzz));

    return fuzzedDue;
  }

  /**
   * 计算短期记忆因子 (FSRS6特有)
   */
  private calculateShortTermMemoryFactor(card: FSRS6Card, rating: Rating): number {
    const w = this.params.w;
    const baseFactor = card.shortTermMemoryFactor || 1.0;

    if (card.elapsedDays <= 3) {
      const improvement = rating >= 3 ? w[17] : -w[17];
      return Math.max(0.5, Math.min(2.0, baseFactor + improvement));
    }

    return baseFactor;
  }

  /**
   * 计算长期稳定性因子 (FSRS6特有)
   */
  private calculateLongTermStabilityFactor(card: FSRS6Card, rating: Rating): number {
    const w = this.params.w;
    const baseFactor = card.longTermStabilityFactor || 1.0;

    if (card.elapsedDays >= 30) {
      const improvement = rating >= 3 ? w[19] : -w[19];
      return Math.max(0.5, Math.min(2.0, baseFactor + improvement));
    }

    return baseFactor;
  }

  /**
   * 计算已过天数
   */
  private calculateElapsedDays(lastReview: string, currentTime: string): number {
    const last = new Date(lastReview);
    const current = new Date(currentTime);
    const diffTime = Math.abs(current.getTime() - last.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * 初始化参数（带安全检查）
   */
  private initializeParameters(params?: Partial<FSRS6Parameters>): FSRS6Parameters {
    // 安全检查和修复输入参数
    const safeParams = this.sanitizeInputParameters(params);

    return {
      version: '6.1.1',
      w: safeParams.w || [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS] as any,
      requestRetention: safeParams.requestRetention || FSRS6_DEFAULTS.REQUEST_RETENTION,
      maximumInterval: safeParams.maximumInterval || FSRS6_DEFAULTS.MAXIMUM_INTERVAL,
      enableFuzz: safeParams.enableFuzz ?? FSRS6_DEFAULTS.ENABLE_FUZZ,
      shortTermMemoryEnabled: safeParams.shortTermMemoryEnabled ?? FSRS6_DEFAULTS.SHORT_TERM_MEMORY_ENABLED,
      longTermStabilityEnabled: safeParams.longTermStabilityEnabled ?? FSRS6_DEFAULTS.LONG_TERM_STABILITY_ENABLED
    };
  }

  /**
   * 安全检查和修复输入参数
   */
  private sanitizeInputParameters(params?: Partial<FSRS6Parameters>): Partial<FSRS6Parameters> {
    if (!params) return {};

    const sanitized: Partial<FSRS6Parameters> = { ...params };

    // 检查权重参数
    if (params.w) {
      if (!Array.isArray(params.w) || params.w.length !== 21) {
        console.warn(`Invalid weight array length: ${params.w?.length}. Using defaults.`);
        sanitized.w = [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS] as any;
      } else {
        // 检查每个权重参数是否在有效范围内
        const validWeights = params.w.map((weight, index) => {
          const paramName = `w${index}` as keyof typeof FSRS6_PARAMETER_RANGES;
          const range = FSRS6_PARAMETER_RANGES[paramName];

          if (typeof weight !== 'number' || isNaN(weight) || weight < range.min || weight > range.max) {
            console.warn(`Invalid weight w${index}: ${weight}. Using default: ${FSRS6_DEFAULTS.DEFAULT_WEIGHTS[index]}`);
            return FSRS6_DEFAULTS.DEFAULT_WEIGHTS[index];
          }
          return weight;
        });
        sanitized.w = validWeights as any;
      }
    }

    // 检查目标记忆率
    if (params.requestRetention !== undefined) {
      if (typeof params.requestRetention !== 'number' ||
          isNaN(params.requestRetention) ||
          params.requestRetention < 0.5 ||
          params.requestRetention > 0.99) {
        console.warn(`Invalid request retention: ${params.requestRetention}. Using default: ${FSRS6_DEFAULTS.REQUEST_RETENTION}`);
        sanitized.requestRetention = FSRS6_DEFAULTS.REQUEST_RETENTION;
      }
    }

    // 检查最大间隔（上限5年，参考Anki社区实践）
    if (params.maximumInterval !== undefined) {
      if (typeof params.maximumInterval !== 'number' ||
          isNaN(params.maximumInterval) ||
          params.maximumInterval < 1 ||
          params.maximumInterval > 1825) {
        console.warn(`Invalid maximum interval: ${params.maximumInterval}. Using default: ${FSRS6_DEFAULTS.MAXIMUM_INTERVAL}`);
        sanitized.maximumInterval = FSRS6_DEFAULTS.MAXIMUM_INTERVAL;
      }
    }

    return sanitized;
  }

  /**
   * 初始化算法状态
   */
  private initializeState(): FSRS6AlgorithmState {
    return {
      isInitialized: true,
      parametersLoaded: true,
      personalizationEnabled: false,
      totalReviews: 0,
      averageAccuracy: 0,
      currentWeights: [...this.params.w]
    };
  }

  /**
   * 初始化性能指标
   */
  private initializeMetrics(): FSRS6PerformanceMetrics {
    return {
      algorithmVersion: '6.1.1',
      executionTime: 0,
      memoryUsage: 0,
      predictionAccuracy: 0,
      parameterStability: 1.0,
      convergenceRate: 0,
      cacheHitRate: 0
    };
  }

  /**
   * 验证参数有效性（带自动修复）
   */
  private validateParameters(): void {
    if (this.params.w.length !== 21) {
      console.warn(`FSRS6 parameter count mismatch: expected 21, got ${this.params.w.length}. Auto-fixing...`);
      this.params.w = [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS] as any;
    }

    // 验证每个参数的范围，自动修复超出范围的参数
    let hasInvalidParams = false;
    this.params.w.forEach((weight, index) => {
      const paramName = `w${index}` as keyof typeof FSRS6_PARAMETER_RANGES;
      const range = FSRS6_PARAMETER_RANGES[paramName];

      if (weight < range.min || weight > range.max || isNaN(weight)) {
        console.warn(`Parameter ${paramName} (${weight}) is outside valid range [${range.min}, ${range.max}]. Auto-fixing...`);
        hasInvalidParams = true;
      }
    });

    // 如果有无效参数，使用默认值
    if (hasInvalidParams) {
      console.warn('Detected invalid FSRS6 parameters. Resetting to defaults...');
      this.params.w = [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS] as any;
    }

    // 验证目标记忆率
    if (this.params.requestRetention < 0.5 || this.params.requestRetention > 0.99 || isNaN(this.params.requestRetention)) {
      console.warn(`Invalid request retention: ${this.params.requestRetention}. Resetting to default...`);
      this.params.requestRetention = FSRS6_DEFAULTS.REQUEST_RETENTION;
    }

    // 验证最大间隔（上限5年）
    if (this.params.maximumInterval < 1 || this.params.maximumInterval > 1825 || isNaN(this.params.maximumInterval)) {
      console.warn(`Invalid maximum interval: ${this.params.maximumInterval}. Resetting to default...`);
      this.params.maximumInterval = FSRS6_DEFAULTS.MAXIMUM_INTERVAL;
    }
  }

  /**
   * 验证卡片数据
   */
  private validateCard(card: FSRS6Card): void {
    if (!card || typeof card !== 'object') {
      throw new FSRS6Error('Invalid card data', 'INVALID_CARD');
    }

    if (card.version !== '6.1.1') {
      throw new FSRS6Error(
        `Card version mismatch: expected 6.1.1, got ${card.version}`,
        'VERSION_MISMATCH'
      );
    }
  }

  /**
   * 验证评分
   */
  private validateRating(rating: Rating): void {
    if (![1, 2, 3, 4].includes(rating)) {
      throw new FSRS6ParameterError('Rating must be 1, 2, 3, or 4', 'rating', rating);
    }
  }

  /**
   * 更新算法状态
   */
  private updateState(card: FSRS6Card, rating: Rating): void {
    this.state.totalReviews++;

    // 更新平均准确率
    const isCorrect = rating >= 3 ? 1 : 0;
    this.state.averageAccuracy =
      (this.state.averageAccuracy * (this.state.totalReviews - 1) + isCorrect) / this.state.totalReviews;
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(operation: string, executionTime: number): void {
    this.performanceMetrics.executionTime =
      (this.performanceMetrics.executionTime + executionTime) / 2;
  }

  /**
   * 获取当前参数
   */
  getParameters(): FSRS6Parameters {
    return { ...this.params };
  }

  /**
   * 更新参数
   */
  updateParameters(newParams: Partial<FSRS6Parameters>): void {
    this.params = { ...this.params, ...newParams };
    this.validateParameters();
    this.state.currentWeights = [...this.params.w];
  }

  /**
   * 获取算法状态
   */
  getState(): FSRS6AlgorithmState {
    return { ...this.state };
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): FSRS6PerformanceMetrics {
    return { ...this.performanceMetrics };
  }
}
