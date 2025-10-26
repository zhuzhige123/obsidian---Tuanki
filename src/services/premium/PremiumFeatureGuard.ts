/**
 * 高级功能守卫服务
 * 单例模式，管理高级功能的访问控制
 */

import { writable, type Writable } from 'svelte/store';
import { licenseManager } from '../../utils/licenseManager';
import type { LicenseInfo } from '../../utils/licenseManager';

/**
 * 高级功能ID定义
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
 * 功能元数据
 */
export const FEATURE_METADATA: Record<string, {
  name: string;
  description: string;
  icon?: string;
}> = {
  [PREMIUM_FEATURES.GRID_VIEW]: {
    name: '网格视图',
    description: '以卡片网格形式展示，让管理更直观',
    icon: '🎨'
  },
  [PREMIUM_FEATURES.KANBAN_VIEW]: {
    name: '看板视图',
    description: '看板式管理，按状态分类显示',
    icon: '📋'
  },
  [PREMIUM_FEATURES.ANKI_BIDIRECTIONAL_SYNC]: {
    name: 'Anki双向同步',
    description: '与Anki实现完整的双向数据同步',
    icon: '🔄'
  },
  [PREMIUM_FEATURES.MULTI_STUDY_VIEWS]: {
    name: '多学习视图',
    description: '时间线、网格等多种个性化学习方式',
    icon: '🎯'
  },
  [PREMIUM_FEATURES.ADVANCED_ANALYTICS]: {
    name: '高级统计分析',
    description: '详细的学习数据分析、热力图和可视化',
    icon: '📊'
  },
  [PREMIUM_FEATURES.AI_ASSISTANT]: {
    name: 'AI智能助手',
    description: '智能批量生成高质量记忆卡片',
    icon: '🤖'
  },
  [PREMIUM_FEATURES.ANNOTATION_SYSTEM]: {
    name: 'Tuanki标注系统',
    description: '基于文档标注快速创建卡片',
    icon: '✍️'
  },
  [PREMIUM_FEATURES.INCREMENTAL_READING]: {
    name: '渐进性阅读',
    description: '支持渐进式阅读工作流',
    icon: '📖'
  }
};

/**
 * 高级功能守卫类
 * 单例模式，管理许可证验证和功能访问控制
 */
export class PremiumFeatureGuard {
  private static instance: PremiumFeatureGuard;
  
  /**
   * 高级版状态 Store
   * 用于响应式更新UI
   */
  public isPremiumActive: Writable<boolean>;
  
  /**
   * 验证缓存
   * 避免频繁验证许可证
   */
  private validationCache: {
    isValid: boolean;
    timestamp: number;
  } | null = null;
  
  /**
   * 缓存有效期：5分钟
   */
  private readonly CACHE_DURATION = 5 * 60 * 1000;

  /**
   * 私有构造函数，确保单例
   */
  private constructor() {
    this.isPremiumActive = writable(false);
  }

  /**
   * 获取单例实例
   */
  static getInstance(): PremiumFeatureGuard {
    if (!PremiumFeatureGuard.instance) {
      PremiumFeatureGuard.instance = new PremiumFeatureGuard();
    }
    return PremiumFeatureGuard.instance;
  }

  /**
   * 初始化守卫
   * @param licenseInfo 许可证信息
   */
  async initialize(licenseInfo: LicenseInfo | null): Promise<void> {
    const isValid = await this.validateLicense(licenseInfo);
    this.isPremiumActive.set(isValid);
  }

  /**
   * 更新许可证状态
   * @param licenseInfo 新的许可证信息
   */
  async updateLicense(licenseInfo: LicenseInfo | null): Promise<void> {
    // 清除缓存
    this.clearCache();
    
    // 验证新的许可证
    const isValid = await this.validateLicense(licenseInfo);
    this.isPremiumActive.set(isValid);
  }

  /**
   * 验证许可证
   * 使用缓存优化性能
   */
  private async validateLicense(licenseInfo: LicenseInfo | null): Promise<boolean> {
    // 未激活直接返回false
    if (!licenseInfo?.isActivated) {
      return false;
    }

    // 检查缓存
    if (this.validationCache) {
      const now = Date.now();
      if (now - this.validationCache.timestamp < this.CACHE_DURATION) {
        return this.validationCache.isValid;
      }
    }

    // 验证许可证
    const validation = await licenseManager.validateCurrentLicense(licenseInfo);
    
    // 更新缓存
    this.validationCache = {
      isValid: validation.isValid,
      timestamp: Date.now()
    };

    return validation.isValid;
  }

  /**
   * 检查是否可以使用某个功能
   * @param featureId 功能ID
   * @returns true表示可以使用
   */
  canUseFeature(featureId: string): boolean {
    let isPremium = false;
    
    // 获取当前高级版状态
    this.isPremiumActive.subscribe(value => {
      isPremium = value;
    })();

    // 检查是否为高级功能
    const premiumFeatureIds = Object.values(PREMIUM_FEATURES);
    if (premiumFeatureIds.includes(featureId)) {
      return isPremium;
    }

    // 非高级功能，所有人都可以使用
    return true;
  }

  /**
   * 清除验证缓存
   */
  private clearCache(): void {
    this.validationCache = null;
  }
}

/**
 * 默认导出单例实例获取方法
 */
export default PremiumFeatureGuard;





