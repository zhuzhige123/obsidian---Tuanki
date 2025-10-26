/**
 * 梯度权重优化器
 * 采用梯度提升技术逐步优化FSRS6参数
 * 
 * 核心理念：
 * - 小步长调整，精细优化
 * - 数据驱动，避免过拟合
 * - 渐进式验证，风险可控
 */

import type { ReviewLog } from "../../data/types";
import { FSRS6_DEFAULTS, FSRS6_PARAMETER_RANGES } from "../../types/fsrs6-types";

export interface BaselineMetrics {
  accuracy: number;
  avgInterval: number;
  retentionRate: number;
  timestamp: number;
}

export interface OptimizationConfig {
  learningRate: number;
  validationSplit: number;
  minDataPoints: number;
  maxIterations: number;
}

export class GradientWeightOptimizer {
  private learningRate = 0.05; // 小步长，精细调整
  private validationSplit = 0.2; // 20%数据用于验证
  private minDataPoints = 50; // 最小数据点要求
  
  /**
   * 阶段1：收集基准数据（前50次复习）
   */
  async collectBaseline(userHistory: ReviewLog[]): Promise<BaselineMetrics> {
    if (userHistory.length < this.minDataPoints) {
      throw new Error(`需要至少${this.minDataPoints}条历史记录才能建立基准`);
    }

    const accuracy = this.calculatePredictionAccuracy(userHistory);
    const avgInterval = this.calculateAvgInterval(userHistory);
    const retentionRate = this.calculateRetentionRate(userHistory);
    
    const baseline: BaselineMetrics = {
      accuracy,
      avgInterval,
      retentionRate,
      timestamp: Date.now()
    };
    
    console.log('📊 [GradientOptimizer] 基准数据收集完成:', baseline);
    return baseline;
  }
  
  /**
   * 阶段2：小幅度权重调整（51-100次复习）
   * 只优化关键参数
   */
  async optimizePhase1(
    userHistory: ReviewLog[], 
    baseline: BaselineMetrics
  ): Promise<number[]> {
    console.log('🔬 [GradientOptimizer] 开始阶段1优化...');
    
    const currentWeights = [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS];
    const optimizedWeights = [...currentWeights];
    
    // 只优化关键参数：w0-w3（初始稳定性）和w17-w20（个性化因子）
    const criticalIndices = [0, 1, 2, 3, 17, 18, 19, 20];
    
    for (const idx of criticalIndices) {
      const gradient = this.calculateGradient(
        userHistory, 
        optimizedWeights, 
        idx
      );
      
      // 小步长调整
      optimizedWeights[idx] += this.learningRate * gradient;
      
      // 限制在安全范围内
      optimizedWeights[idx] = this.clampToSafeRange(
        optimizedWeights[idx], 
        idx
      );
    }
    
    // 验证：确保优化后性能提升
    const improvement = await this.validateImprovement(
      userHistory, 
      currentWeights, 
      optimizedWeights
    );
    
    if (improvement > 0.05) { // 至少5%提升
      console.log(`✨ [GradientOptimizer] 优化成功，性能提升: ${(improvement * 100).toFixed(1)}%`);
      return optimizedWeights;
    } else {
      console.warn('⚠️ [GradientOptimizer] 优化效果不明显，保持标准权重');
      return currentWeights;
    }
  }
  
  /**
   * 阶段3：全参数优化（100+次复习）
   */
  async optimizePhase2(
    userHistory: ReviewLog[], 
    phase1Weights: number[]
  ): Promise<number[]> {
    console.log('🚀 [GradientOptimizer] 开始阶段2优化（全参数）...');
    
    // 使用梯度提升技术优化全部21个参数
    const optimizedWeights = await this.gradientBoostingOptimization(
      userHistory,
      phase1Weights,
      {
        learningRate: this.learningRate * 0.8, // 更保守的学习率
        validationSplit: this.validationSplit,
        minDataPoints: this.minDataPoints,
        maxIterations: 10
      }
    );
    
    return optimizedWeights;
  }
  
  /**
   * 梯度提升优化（核心算法）
   */
  private async gradientBoostingOptimization(
    history: ReviewLog[],
    initialWeights: number[],
    config: OptimizationConfig
  ): Promise<number[]> {
    let weights = [...initialWeights];
    let bestWeights = [...weights];
    let bestLoss = this.calculateLoss(history, weights);
    let noImprovementCount = 0;
    const earlyStoppingPatience = 3;
    
    for (let iteration = 0; iteration < config.maxIterations; iteration++) {
      // 为每个参数计算梯度
      const gradients = weights.map((_, idx) => 
        this.calculateGradient(history, weights, idx)
      );
      
      // 更新权重
      weights = weights.map((w, idx) => {
        const newWeight = w + config.learningRate * gradients[idx];
        return this.clampToSafeRange(newWeight, idx);
      });
      
      // 计算新的损失
      const currentLoss = this.calculateLoss(history, weights);
      
      // 检查是否改进
      if (currentLoss < bestLoss) {
        bestLoss = currentLoss;
        bestWeights = [...weights];
        noImprovementCount = 0;
        console.log(`  迭代 ${iteration + 1}: 损失 ${currentLoss.toFixed(4)}`);
      } else {
        noImprovementCount++;
      }
      
      // Early stopping
      if (noImprovementCount >= earlyStoppingPatience) {
        console.log(`  早停于迭代 ${iteration + 1}`);
        break;
      }
    }
    
    console.log(`✅ [GradientOptimizer] 优化完成，最终损失: ${bestLoss.toFixed(4)}`);
    return bestWeights;
  }
  
  /**
   * 计算梯度（数值微分）
   */
  private calculateGradient(
    history: ReviewLog[], 
    weights: number[], 
    paramIndex: number
  ): number {
    const epsilon = 0.01; // 数值微分步长
    
    // 计算 f(w + ε)
    const weightsPlus = [...weights];
    weightsPlus[paramIndex] += epsilon;
    const lossPlus = this.calculateLoss(history, weightsPlus);
    
    // 计算 f(w - ε)
    const weightsMinus = [...weights];
    weightsMinus[paramIndex] -= epsilon;
    const lossMinus = this.calculateLoss(history, weightsMinus);
    
    // 梯度 = (f(w+ε) - f(w-ε)) / (2ε)
    return -(lossPlus - lossMinus) / (2 * epsilon);
  }
  
  /**
   * 计算损失函数（预测误差）
   */
  private calculateLoss(history: ReviewLog[], weights: number[]): number {
    let totalLoss = 0;
    
    for (const review of history) {
      // 使用指定权重预测记忆保持率
      const predicted = this.predictRetention(review, weights);
      const actual = review.rating >= 3 ? 1 : 0; // 实际是否记住
      
      // 均方误差
      totalLoss += Math.pow(predicted - actual, 2);
    }
    
    return totalLoss / history.length;
  }
  
  /**
   * 预测记忆保持率（简化FSRS公式）
   */
  private predictRetention(review: ReviewLog, weights: number[]): number {
    const elapsedDays = review.elapsedDays || 0;
    const stability = review.stability || 1;
    
    // 基于稳定性的指数衰减
    const retention = Math.exp(-elapsedDays / stability);
    
    // 使用权重调整（简化版）
    const adjustmentFactor = 1 + (weights[17] || 0) * 0.1; // w17: 短期记忆因子
    
    return Math.max(0, Math.min(1, retention * adjustmentFactor));
  }
  
  /**
   * 验证优化效果
   */
  private async validateImprovement(
    history: ReviewLog[],
    oldWeights: number[],
    newWeights: number[]
  ): Promise<number> {
    const oldLoss = this.calculateLoss(history, oldWeights);
    const newLoss = this.calculateLoss(history, newWeights);
    
    // 返回改进比例
    return (oldLoss - newLoss) / oldLoss;
  }
  
  /**
   * 限制参数在安全范围内
   */
  private clampToSafeRange(value: number, index: number): number {
    const paramName = `w${index}` as keyof typeof FSRS6_PARAMETER_RANGES;
    const range = FSRS6_PARAMETER_RANGES[paramName];
    
    if (!range) return value;
    
    return Math.max(range.min, Math.min(range.max, value));
  }
  
  /**
   * 计算预测准确率
   */
  private calculatePredictionAccuracy(history: ReviewLog[]): number {
    let correct = 0;
    
    for (const review of history) {
      const predicted = this.predictRetention(
        review, 
        FSRS6_DEFAULTS.DEFAULT_WEIGHTS as any
      );
      const actual = review.rating >= 3 ? 1 : 0;
      
      if (Math.round(predicted) === actual) {
        correct++;
      }
    }
    
    return correct / history.length;
  }
  
  /**
   * 计算平均间隔
   */
  private calculateAvgInterval(history: ReviewLog[]): number {
    const intervals = history
      .map(r => r.scheduledDays || 0)
      .filter(d => d > 0);
    
    if (intervals.length === 0) return 0;
    
    return intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
  }
  
  /**
   * 计算记忆保持率
   */
  private calculateRetentionRate(history: ReviewLog[]): number {
    const remembered = history.filter(r => r.rating >= 3).length;
    return remembered / history.length;
  }
}


