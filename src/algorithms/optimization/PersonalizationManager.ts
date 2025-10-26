/**
 * 个性化管理器
 * 渐进式激活和管理FSRS6个性化优化
 * 
 * 阶段划分：
 * - baseline (0-50次)：收集基准数据
 * - phase1 (51-100次)：关键参数优化
 * - phase2 (101-200次)：全参数优化
 * - optimized (200+次)：持续运行优化
 */

import type { ReviewLog } from "../../data/types";
import type { AnkiDataStorage } from "../../data/storage";
import { GradientWeightOptimizer, type BaselineMetrics } from "./GradientWeightOptimizer";
import { Notice } from "obsidian";

type OptimizationState = 'baseline' | 'phase1' | 'phase2' | 'optimized';

export interface PersonalizationData {
  state: OptimizationState;
  baseline?: BaselineMetrics;
  phase1Weights?: number[];
  phase2Weights?: number[];
  lastUpdate: number;
  totalReviews: number;
}

export class PersonalizationManager {
  private optimizer: GradientWeightOptimizer;
  private storage: AnkiDataStorage;
  private userId: string;
  private personalizationData: PersonalizationData;
  
  constructor(storage: AnkiDataStorage, userId: string = 'default') {
    this.optimizer = new GradientWeightOptimizer();
    this.storage = storage;
    this.userId = userId;
    
    // 初始化个性化数据
    this.personalizationData = {
      state: 'baseline',
      lastUpdate: Date.now(),
      totalReviews: 0
    };
  }
  
  /**
   * 加载用户的个性化数据
   */
  async loadPersonalizationData(): Promise<PersonalizationData> {
    try {
      const stored = localStorage.getItem(`tuanki_personalization_${this.userId}`);
      if (stored) {
        this.personalizationData = JSON.parse(stored);
        console.log('📥 [PersonalizationManager] 加载个性化数据:', this.personalizationData.state);
      }
    } catch (error) {
      console.error('❌ [PersonalizationManager] 加载数据失败:', error);
    }
    
    return this.personalizationData;
  }
  
  /**
   * 保存个性化数据
   */
  private async savePersonalizationData(): Promise<void> {
    try {
      localStorage.setItem(
        `tuanki_personalization_${this.userId}`,
        JSON.stringify(this.personalizationData)
      );
    } catch (error) {
      console.error('❌ [PersonalizationManager] 保存数据失败:', error);
    }
  }
  
  /**
   * 复习后更新（核心入口）
   */
  async updateAfterReview(review: ReviewLog, allHistory: ReviewLog[]): Promise<void> {
    const historyCount = allHistory.length;
    this.personalizationData.totalReviews = historyCount;
    
    // 阶段判断和执行
    if (historyCount === 50 && this.personalizationData.state === 'baseline') {
      await this.executeBaselineCollection(allHistory);
    }
    else if (historyCount === 100 && this.personalizationData.state === 'phase1') {
      await this.executePhase1Optimization(allHistory);
    }
    else if (historyCount >= 200 && this.personalizationData.state === 'phase2') {
      await this.executePhase2Optimization(allHistory);
    }
    
    await this.savePersonalizationData();
  }
  
  /**
   * 执行基准数据收集
   */
  private async executeBaselineCollection(history: ReviewLog[]): Promise<void> {
    try {
      console.log('📊 [PersonalizationManager] 开始收集基准数据...');
      
      const baseline = await this.optimizer.collectBaseline(history);
      
      this.personalizationData.baseline = baseline;
      this.personalizationData.state = 'phase1';
      this.personalizationData.lastUpdate = Date.now();
      
      new Notice('🎯 Tuanki正在学习您的记忆模式...', 3000);
      
      console.log('✅ [PersonalizationManager] 基准数据收集完成');
    } catch (error) {
      console.error('❌ [PersonalizationManager] 基准收集失败:', error);
    }
  }
  
  /**
   * 执行阶段1优化
   */
  private async executePhase1Optimization(history: ReviewLog[]): Promise<void> {
    try {
      console.log('🔬 [PersonalizationManager] 开始阶段1优化...');
      
      if (!this.personalizationData.baseline) {
        console.warn('⚠️ [PersonalizationManager] 缺少基准数据，跳过优化');
        return;
      }
      
      const phase1Weights = await this.optimizer.optimizePhase1(
        history,
        this.personalizationData.baseline
      );
      
      this.personalizationData.phase1Weights = phase1Weights;
      this.personalizationData.state = 'phase2';
      this.personalizationData.lastUpdate = Date.now();
      
      // 应用优化权重
      await this.applyOptimizedWeights(phase1Weights);
      
      new Notice('✨ 个性化优化已激活（阶段1）', 4000);
      
      console.log('✅ [PersonalizationManager] 阶段1优化完成');
    } catch (error) {
      console.error('❌ [PersonalizationManager] 阶段1优化失败:', error);
    }
  }
  
  /**
   * 执行阶段2优化
   */
  private async executePhase2Optimization(history: ReviewLog[]): Promise<void> {
    try {
      console.log('🚀 [PersonalizationManager] 开始阶段2优化...');
      
      const phase1Weights = this.personalizationData.phase1Weights || 
                           [...(await this.loadOptimizedWeights())];
      
      const phase2Weights = await this.optimizer.optimizePhase2(
        history,
        phase1Weights
      );
      
      this.personalizationData.phase2Weights = phase2Weights;
      this.personalizationData.state = 'optimized';
      this.personalizationData.lastUpdate = Date.now();
      
      // 应用优化权重
      await this.applyOptimizedWeights(phase2Weights);
      
      new Notice('🚀 个性化优化已完成（阶段2）', 4000);
      
      console.log('✅ [PersonalizationManager] 阶段2优化完成');
    } catch (error) {
      console.error('❌ [PersonalizationManager] 阶段2优化失败:', error);
    }
  }
  
  /**
   * 应用优化后的权重
   */
  private async applyOptimizedWeights(weights: number[]): Promise<void> {
    try {
      // 保存到localStorage供FSRS使用
      localStorage.setItem(
        `tuanki_optimized_weights_${this.userId}`,
        JSON.stringify(weights)
      );
      
      console.log('✅ [PersonalizationManager] 优化权重已应用');
    } catch (error) {
      console.error('❌ [PersonalizationManager] 应用权重失败:', error);
    }
  }
  
  /**
   * 加载优化的权重
   */
  async loadOptimizedWeights(): Promise<number[]> {
    try {
      const stored = localStorage.getItem(`tuanki_optimized_weights_${this.userId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('❌ [PersonalizationManager] 加载权重失败:', error);
    }
    
    // 返回默认权重
    return [...Array(21)].map((_, i) => {
      // FSRS6默认权重的简化版本
      const defaults = [
        0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
        0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
        0.5425, 0.0912, 0.0658, 0.1542
      ];
      return defaults[i] || 1.0;
    });
  }
  
  /**
   * 保存基准数据
   */
  private async saveBaseline(baseline: BaselineMetrics): Promise<void> {
    this.personalizationData.baseline = baseline;
    await this.savePersonalizationData();
  }
  
  /**
   * 获取当前优化状态
   */
  getOptimizationState(): OptimizationState {
    return this.personalizationData.state;
  }
  
  /**
   * 获取优化进度
   */
  getOptimizationProgress(): {
    state: OptimizationState;
    progress: number;
    nextMilestone: number;
  } {
    const { state, totalReviews } = this.personalizationData;
    
    let progress = 0;
    let nextMilestone = 50;
    
    if (state === 'baseline') {
      progress = Math.min(totalReviews / 50, 1) * 25;
      nextMilestone = 50;
    } else if (state === 'phase1') {
      progress = 25 + Math.min((totalReviews - 50) / 50, 1) * 25;
      nextMilestone = 100;
    } else if (state === 'phase2') {
      progress = 50 + Math.min((totalReviews - 100) / 100, 1) * 25;
      nextMilestone = 200;
    } else {
      progress = 100;
      nextMilestone = 200;
    }
    
    return { state, progress, nextMilestone };
  }
  
  /**
   * 重置个性化数据
   */
  async resetPersonalization(): Promise<void> {
    this.personalizationData = {
      state: 'baseline',
      lastUpdate: Date.now(),
      totalReviews: 0
    };
    
    await this.savePersonalizationData();
    
    // 清除优化权重
    localStorage.removeItem(`tuanki_optimized_weights_${this.userId}`);
    
    new Notice('🔄 个性化数据已重置', 3000);
    console.log('🔄 [PersonalizationManager] 个性化数据已重置');
  }
}


