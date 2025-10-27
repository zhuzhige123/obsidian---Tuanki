/**
 * 功能守卫服务 - 开源免费版本
 * 所有功能完全免费开放
 */

import { writable, type Writable } from 'svelte/store';

/**
 * 功能ID定义（仅用于兼容性）
 */
export const PREMIUM_FEATURES = {
  GRID_VIEW: 'grid-view',
  KANBAN_VIEW: 'kanban-view',
  ANKI_BIDIRECTIONAL_SYNC: 'anki-bidirectional-sync',
  MULTI_STUDY_VIEWS: 'multi-study-views',
  ADVANCED_ANALYTICS: 'advanced-analytics',
  AI_ASSISTANT: 'ai-assistant',
  ANNOTATION_SYSTEM: 'annotation-system',
  INCREMENTAL_READING: 'incremental-reading'
} as const;

/**
 * 功能守卫类 - 开源免费版本
 * 所有功能返回 true，完全免费使用
 */
export class PremiumFeatureGuard {
  private static instance: PremiumFeatureGuard;
  
  /**
   * 激活状态（始终为 true）
   */
  public isPremiumActive: Writable<boolean>;
  
  private constructor() {
    this.isPremiumActive = writable(true);
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(): PremiumFeatureGuard {
    if (!PremiumFeatureGuard.instance) {
      PremiumFeatureGuard.instance = new PremiumFeatureGuard();
    }
    return PremiumFeatureGuard.instance;
  }
  
  /**
   * 检查功能是否可用（始终返回 true）
   */
  public canUseFeature(featureId: string): boolean {
    return true;
  }
  
  /**
   * 初始化守卫
   */
  public async initialize(): Promise<void> {
    // 开源版本无需初始化
  }
  
  /**
   * 显示升级提示（开源版本不显示）
   */
  public showUpgradePrompt(featureName: string): void {
    // 开源版本不显示升级提示
  }
}
