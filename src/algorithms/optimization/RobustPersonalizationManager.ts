/**
 * 健壮个性化管理器
 * 在PersonalizationManager基础上集成回溯策略
 * 
 * 增强功能：
 * - 自动创建检查点
 * - 性能监控和回溯
 * - 自适应参数调整
 */

import type { ReviewLog } from "../../data/types";
import type { AnkiDataStorage } from "../../data/storage";
import { PersonalizationManager } from "./PersonalizationManager";
import { MemoryBacktrackingStrategy, type PerformanceMetrics } from "./MemoryBacktrackingStrategy";
import { Notice } from "obsidian";

export class RobustPersonalizationManager extends PersonalizationManager {
  private backtracking: MemoryBacktrackingStrategy;
  private lastCheckpointReviewCount = 0;
  private checkpointInterval = 50; // 每50次复习创建检查点
  
  constructor(storage: AnkiDataStorage, userId: string = 'default') {
    super(storage, userId);
    this.backtracking = new MemoryBacktrackingStrategy();
  }
  
  /**
   * 复习后更新（增强版）
   */
  async updateAfterReview(review: ReviewLog, allHistory: ReviewLog[]): Promise<void> {
    // 1. 执行基础优化
    await super.updateAfterReview(review, allHistory);
    
    const currentReviewCount = allHistory.length;
    
    // 2. 定期创建检查点
    if (currentReviewCount - this.lastCheckpointReviewCount >= this.checkpointInterval) {
      await this.createPerformanceCheckpoint(allHistory);
      this.lastCheckpointReviewCount = currentReviewCount;
    }
    
    // 3. 检测并回溯（如果需要）
    const currentPerformance = await this.calculatePerformance(allHistory);
    const backtrackedWeights = await this.backtracking.detectAndBacktrack(
      currentPerformance
    );
    
    if (backtrackedWeights) {
      await this.handleBacktracking(backtrackedWeights, currentPerformance, allHistory);
    }
  }
  
  /**
   * 创建性能检查点
   */
  private async createPerformanceCheckpoint(history: ReviewLog[]): Promise<void> {
    const currentWeights = await this.loadOptimizedWeights();
    const performance = await this.calculatePerformance(history);
    const reviewCount = history.length;
    
    this.backtracking.createCheckpoint(
      reviewCount,
      currentWeights,
      performance
    );
    
    console.log(`📍 [RobustPersonalizationManager] 创建检查点 @${reviewCount}次复习`);
  }
  
  /**
   * 处理回溯
   */
  private async handleBacktracking(
    backtrackedWeights: number[],
    currentPerformance: PerformanceMetrics,
    history: ReviewLog[]
  ): Promise<void> {
    console.warn('🔄 [RobustPersonalizationManager] 执行参数回溯...');
    
    const currentWeights = await this.loadOptimizedWeights();
    
    // 获取上一个检查点的性能
    const checkpoints = this.backtracking.getCheckpointHistory();
    const lastCheckpoint = checkpoints[checkpoints.length - 1];
    
    // 计算自适应衰减因子
    const decayFactor = lastCheckpoint 
      ? this.backtracking.calculateAdaptiveDecayFactor(
          lastCheckpoint.performance,
          currentPerformance
        )
      : 0.8;
    
    // 应用回溯权重（带衰减）
    const stabilizedWeights = this.backtracking.applyDecayToCheckpoint(
      backtrackedWeights,
      currentWeights,
      decayFactor
    );
    
    // 应用稳定化的权重
    await this.applyOptimizedWeights(stabilizedWeights);
    
    // 显示通知
    new Notice(`📉 检测到学习效果波动，已自动优化参数（衰减因子: ${(decayFactor * 100).toFixed(0)}%）`, 4000);
    
    console.log(`✅ [RobustPersonalizationManager] 回溯完成，衰减因子: ${decayFactor.toFixed(2)}`);
  }
  
  /**
   * 计算当前性能指标
   */
  private async calculatePerformance(history: ReviewLog[]): Promise<PerformanceMetrics> {
    // 使用最近的复习数据
    const recentHistory = history.slice(-50);
    
    // 计算预测准确率
    const predictionAccuracy = this.calculatePredictionAccuracy(recentHistory);
    
    // 计算记忆保持率
    const retentionRate = this.calculateRetentionRate(recentHistory);
    
    // 计算平均响应时间（如果有）
    const avgResponseTime = this.calculateAvgResponseTime(recentHistory);
    
    return {
      predictionAccuracy,
      retentionRate,
      avgResponseTime,
      reviewCount: history.length,
      timestamp: Date.now()
    };
  }
  
  /**
   * 计算预测准确率
   */
  private calculatePredictionAccuracy(history: ReviewLog[]): number {
    if (history.length === 0) return 0;
    
    let correct = 0;
    for (const review of history) {
      // 简化：使用稳定性预测
      const stability = review.stability || 1;
      const elapsedDays = review.elapsedDays || 0;
      const predicted = Math.exp(-elapsedDays / stability);
      const actual = review.rating >= 3 ? 1 : 0;
      
      if ((predicted > 0.5 && actual === 1) || (predicted <= 0.5 && actual === 0)) {
        correct++;
      }
    }
    
    return correct / history.length;
  }
  
  /**
   * 计算记忆保持率
   */
  private calculateRetentionRate(history: ReviewLog[]): number {
    if (history.length === 0) return 0;
    
    const remembered = history.filter(r => r.rating >= 3).length;
    return remembered / history.length;
  }
  
  /**
   * 计算平均响应时间
   */
  private calculateAvgResponseTime(history: ReviewLog[]): number {
    // ReviewLog中可能没有响应时间，返回默认值
    return 5000; // 5秒默认
  }
  
  /**
   * 应用优化权重（重写以支持回溯）
   */
  private async applyOptimizedWeights(weights: number[]): Promise<void> {
    try {
      // 保存到localStorage供FSRS使用
      localStorage.setItem(
        `tuanki_optimized_weights_default`,
        JSON.stringify(weights)
      );
      
      console.log('✅ [RobustPersonalizationManager] 优化权重已应用');
    } catch (error) {
      console.error('❌ [RobustPersonalizationManager] 应用权重失败:', error);
    }
  }
  
  /**
   * 获取回溯统计
   */
  getBacktrackingStatistics() {
    return this.backtracking.getStatistics();
  }
  
  /**
   * 重置（包括回溯数据）
   */
  async resetPersonalization(): Promise<void> {
    await super.resetPersonalization();
    this.backtracking.clearCheckpoints();
    this.lastCheckpointReviewCount = 0;
    
    console.log('🔄 [RobustPersonalizationManager] 包括回溯数据在内的所有数据已重置');
  }
}


