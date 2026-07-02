/**
 * 高级功能守卫服务
 * 单例模式，管理高级功能的访问控制
 */

import { writable, get, type Writable } from 'svelte/store';
import { licenseManager } from '../../utils/licenseManager';
import type { EffectiveLicenseState, LicenseInfo, LicensedProduct } from '../../types/license';
import { LICENSED_PRODUCTS, resolveEffectiveLicenseState } from '../../utils/license-state';
import { i18n } from '../../utils/i18n';

declare const __WEAVE_IR_STANDALONE__: boolean;

/**
 * 高级功能ID定义
 */
export const PREMIUM_FEATURES = {
  GRID_VIEW: 'grid-view',
  KANBAN_VIEW: 'kanban-view',
  TIMELINE_VIEW: 'timeline-view',
  AI_ASSISTANT: 'ai-assistant',
  INCREMENTAL_READING: 'incremental-reading',
  EMERGENT_DECKS: 'emergent-decks',
  STUDY_SOURCE_INFO: 'study-source-info',
  MEMORY_DECK_LEVELS: 'memory-deck-levels',
  BATCH_PARSING: 'batch-parsing',
  QUESTION_BANK: 'question-bank',
  DECK_ANALYTICS: 'deck-analytics',
  DECK_ANALYTICS_RETENTION: 'deck-analytics-retention',
  DECK_ANALYTICS_TIMING: 'deck-analytics-timing',
  PROGRESSIVE_CLOZE: 'progressive-cloze',
  CSV_IMPORT: 'csv-import',
  VIEW_SOURCE: 'view-source'
} as const;

/**
 * 功能元数据（图标等非文案字段）
 */
export const FEATURE_METADATA: Record<string, {
  icon?: string;
}> = {
  [PREMIUM_FEATURES.GRID_VIEW]: { icon: 'th-large' },
  [PREMIUM_FEATURES.KANBAN_VIEW]: { icon: 'columns' },
  [PREMIUM_FEATURES.TIMELINE_VIEW]: { icon: 'history' },
  [PREMIUM_FEATURES.AI_ASSISTANT]: { icon: 'robot' },
  [PREMIUM_FEATURES.INCREMENTAL_READING]: { icon: 'book-reader' },
  [PREMIUM_FEATURES.EMERGENT_DECKS]: { icon: 'sparkles' },
  [PREMIUM_FEATURES.STUDY_SOURCE_INFO]: { icon: 'file-text' },
  [PREMIUM_FEATURES.MEMORY_DECK_LEVELS]: { icon: 'award' },
  [PREMIUM_FEATURES.BATCH_PARSING]: { icon: 'sync-alt' },
  [PREMIUM_FEATURES.QUESTION_BANK]: { icon: 'clipboard-list' },
  [PREMIUM_FEATURES.DECK_ANALYTICS]: { icon: 'chart-bar' },
  [PREMIUM_FEATURES.DECK_ANALYTICS_RETENTION]: { icon: 'chart-bar' },
  [PREMIUM_FEATURES.DECK_ANALYTICS_TIMING]: { icon: 'history' },
  [PREMIUM_FEATURES.PROGRESSIVE_CLOZE]: { icon: 'layers' },
  [PREMIUM_FEATURES.CSV_IMPORT]: { icon: 'file-text' },
  [PREMIUM_FEATURES.VIEW_SOURCE]: { icon: 'file-text' },
  'fsrs-study': {},
  'table-view': {},
  'obsidian-card-editing': {},
  'fill-input-mode': {},
  'ai-card-creation': {},
  'parse-preview-import': {},
  'anki-connect-sync': {},
  'apkg-import': {},
  'deck-view-embed': {},
  'active-document-filter': {},
  'related-cards': {},
  'image-mask': {},
};

export function toPremiumFeatureTranslationId(featureId: string): string {
  return featureId.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

export function resolveFeatureMetadata(featureId: string): {
  name: string;
  description: string;
  icon?: string;
} {
  const translationId = toPremiumFeatureTranslationId(featureId);
  const nameKey = `premium.features.${translationId}.name`;
  const descriptionKey = `premium.features.${translationId}.description`;
  return {
    name: i18n.hasTranslation(nameKey) ? i18n.t(nameKey) : featureId,
    description: i18n.hasTranslation(descriptionKey) ? i18n.t(descriptionKey) : '',
    icon: FEATURE_METADATA[featureId]?.icon,
  };
}

/** 激活提示中「基础使用」展示顺序（永久免费能力） */
export const BASE_BENEFIT_FEATURE_ORDER = [
  'fsrs-study',
  'table-view',
  'obsidian-card-editing',
  'fill-input-mode',
  'ai-card-creation',
  'parse-preview-import',
  PREMIUM_FEATURES.AI_ASSISTANT,
  PREMIUM_FEATURES.VIEW_SOURCE,
  PREMIUM_FEATURES.STUDY_SOURCE_INFO,
  PREMIUM_FEATURES.DECK_ANALYTICS_RETENTION,
  PREMIUM_FEATURES.CSV_IMPORT,
  'anki-connect-sync',
  'apkg-import',
] as const;

export const PREMIUM_BENEFIT_FEATURE_ORDER = [
  PREMIUM_FEATURES.GRID_VIEW,
  PREMIUM_FEATURES.KANBAN_VIEW,
  PREMIUM_FEATURES.TIMELINE_VIEW,
  'deck-view-embed',
  'active-document-filter',
  'related-cards',
  PREMIUM_FEATURES.MEMORY_DECK_LEVELS,
  'image-mask',
  PREMIUM_FEATURES.QUESTION_BANK,
  PREMIUM_FEATURES.INCREMENTAL_READING,
  PREMIUM_FEATURES.EMERGENT_DECKS,
  PREMIUM_FEATURES.BATCH_PARSING,
  PREMIUM_FEATURES.DECK_ANALYTICS,
  PREMIUM_FEATURES.PROGRESSIVE_CLOZE,
] as const;

/** 基础版永久免费的功能（不含牌组分析中的记忆率曲线） */
export const FREE_FEATURE_IDS = new Set<string>([
  'fsrs-study',
  'table-view',
  PREMIUM_FEATURES.AI_ASSISTANT,
  PREMIUM_FEATURES.DECK_ANALYTICS_RETENTION,
  PREMIUM_FEATURES.CSV_IMPORT,
  PREMIUM_FEATURES.VIEW_SOURCE,
  PREMIUM_FEATURES.STUDY_SOURCE_INFO,
]);

export interface PremiumFeatureAccessContext {
  /** 功能入口所在页面，用于按页面区分限时开放等功能策略 */
  page?: string;
}

/** 牌组学习页上下文标识 */
export const DECK_STUDY_PAGE_CONTEXT = 'deck-study';

/**
 * 按页面配置的限时开放高级功能：未激活也可在该页面使用，入口标题带「限时开放」。
 */
const LIMITED_TIME_OPEN_FEATURES_BY_PAGE: Readonly<Record<string, ReadonlySet<string>>> = {
  [DECK_STUDY_PAGE_CONTEXT]: new Set<string>([PREMIUM_FEATURES.KANBAN_VIEW]),
};

export function isLimitedTimeOpenFeature(
  featureId: string,
  context?: PremiumFeatureAccessContext
): boolean {
  const page = context?.page;
  if (!page) {
    return false;
  }

  return LIMITED_TIME_OPEN_FEATURES_BY_PAGE[page]?.has(featureId) ?? false;
}

/**
 * 高级功能守卫类
 * 单例模式，管理许可证验证和功能访问控制
 */
export class PremiumFeatureGuard {
  private static instance: PremiumFeatureGuard;
  private currentProduct: LicensedProduct = LICENSED_PRODUCTS.WEAVE;
  private localLicenses: LicenseInfo[] = [];
  private inheritedLicenses: LicenseInfo[] = [];
  private effectiveState: EffectiveLicenseState = resolveEffectiveLicenseState({
    product: LICENSED_PRODUCTS.WEAVE,
  });
  
  /**
   * 高级版状态 Store
   * 用于响应式更新UI
   */
  public isPremiumActive: Writable<boolean>;

  /**
   * 是否显示高级功能预览入口
   * 兼容新版 UI 的公开分支降级实现
   */
  public premiumFeaturesPreviewEnabled: Writable<boolean>;
  
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
    this.premiumFeaturesPreviewEnabled = writable(false);
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
   */
  async initializeForProduct(input: {
    product: LicensedProduct;
    localLicenses?: LicenseInfo[];
    inheritedLicenses?: LicenseInfo[];
  }): Promise<void> {
    this.currentProduct = input.product;
    this.localLicenses = input.localLicenses ?? [];
    this.inheritedLicenses = input.inheritedLicenses ?? [];
    const effectiveState = await this.validateLicenseState();
    this.effectiveState = effectiveState;
    this.isPremiumActive.set(effectiveState.isPremiumActive);
  }

  /**
   * 更新许可证状态
   */
  async updateLicenseState(input: {
    product?: LicensedProduct;
    localLicenses?: LicenseInfo[];
    inheritedLicenses?: LicenseInfo[];
  }): Promise<void> {
    this.clearCache();
    this.currentProduct = input.product ?? this.currentProduct;
    this.localLicenses = input.localLicenses ?? this.localLicenses;
    this.inheritedLicenses = input.inheritedLicenses ?? this.inheritedLicenses;
    const effectiveState = await this.validateLicenseState();
    this.effectiveState = effectiveState;
    this.isPremiumActive.set(effectiveState.isPremiumActive);
  }

  getEffectiveState(): EffectiveLicenseState {
    return this.effectiveState;
  }

  /**
   * 设置是否显示高级功能预览入口
   */
  setPremiumFeaturesPreview(enabled: boolean): void {
    this.premiumFeaturesPreviewEnabled.set(enabled);
  }

  /**
   * 判断一个功能是否属于高级功能
   */
  isPremiumFeature(featureId: string): boolean {
    if (FREE_FEATURE_IDS.has(featureId)) {
      return false;
    }

    const premiumFeatureIds = Object.values(PREMIUM_FEATURES) as string[];
    return premiumFeatureIds.includes(featureId);
  }

  /**
   * 判断当前 UI 是否应该展示某个功能入口
   * 已激活用户始终展示；未激活用户仅在开启预览时展示高级功能入口。
   */
  shouldShowFeatureEntry(
    featureId: string,
    options?: {
      isPremium?: boolean;
      showPremiumPreview?: boolean;
    },
    _context?: PremiumFeatureAccessContext
  ): boolean {
    if (!this.isPremiumFeature(featureId)) {
      return true;
    }

    const isPremium = options?.isPremium ?? get(this.isPremiumActive);
    if (isPremium) {
      return true;
    }

    const showPremiumPreview =
      options?.showPremiumPreview ?? get(this.premiumFeaturesPreviewEnabled);
    return showPremiumPreview;
  }

  /**
   * 检查是否可以使用某个功能
   * @param featureId 功能ID
   * @returns true表示可以使用
   */
  canUseFeature(featureId: string, _context?: PremiumFeatureAccessContext): boolean {
    if (
      typeof __WEAVE_IR_STANDALONE__ !== "undefined" &&
      __WEAVE_IR_STANDALONE__ &&
      featureId === PREMIUM_FEATURES.INCREMENTAL_READING
    ) {
      return true;
    }

    const isPremium = get(this.isPremiumActive);

    if (FREE_FEATURE_IDS.has(featureId)) {
      return true;
    }

    if (isLimitedTimeOpenFeature(featureId, _context)) {
      return true;
    }

    if (this.isPremiumFeature(featureId)) {
      return isPremium;
    }

    return true;
  }

  /**
   * 检查功能是否受限（canUseFeature的反向）
   */
  isFeatureRestricted(featureId: string, context?: PremiumFeatureAccessContext): boolean {
    return !this.canUseFeature(featureId, context);
  }

  canUseAnyFeature(featureIds: string[], context?: PremiumFeatureAccessContext): boolean {
    return featureIds.some((featureId) => this.canUseFeature(featureId, context));
  }

  shouldShowAnyFeatureEntry(
    featureIds: string[],
    options?: {
      isPremium?: boolean;
      showPremiumPreview?: boolean;
    },
    context?: PremiumFeatureAccessContext
  ): boolean {
    return featureIds.some((featureId) => this.shouldShowFeatureEntry(featureId, options, context));
  }

  getAnyFeatureEntryTitle(
    baseTitle: string,
    featureIds: string[],
    context?: PremiumFeatureAccessContext
  ): string {
    if (get(this.isPremiumActive)) {
      return baseTitle;
    }

    if (featureIds.some((featureId) => isLimitedTimeOpenFeature(featureId, context))) {
      return this.formatLimitedTimeOpenEntryTitle(baseTitle);
    }

    return this.canUseAnyFeature(featureIds, context) ? baseTitle : this.formatPremiumEntryTitle(baseTitle);
  }

  getFeatureEntryTitle(
    baseTitle: string,
    featureId: string,
    context?: PremiumFeatureAccessContext
  ): string {
    if (get(this.isPremiumActive)) {
      return baseTitle;
    }

    if (isLimitedTimeOpenFeature(featureId, context)) {
      return this.formatLimitedTimeOpenEntryTitle(baseTitle);
    }

    return this.canUseFeature(featureId, context) ? baseTitle : this.formatPremiumEntryTitle(baseTitle);
  }

  private formatPremiumEntryTitle(baseTitle: string): string {
    const suffix = i18n.hasTranslation('premium.entryTitlePremiumSuffix')
      ? i18n.t('premium.entryTitlePremiumSuffix')
      : ' (Premium)';
    return `${baseTitle}${suffix}`;
  }

  private formatLimitedTimeOpenEntryTitle(baseTitle: string): string {
    const suffix = i18n.hasTranslation('premium.entryTitleLimitedTimeSuffix')
      ? i18n.t('premium.entryTitleLimitedTimeSuffix')
      : ' (Limited-time access)';
    return `${baseTitle}${suffix}`;
  }

  /**
   * 验证许可证
   * 使用缓存优化性能
   */
  private async validateLicenseState(): Promise<EffectiveLicenseState> {
    if (this.validationCache) {
      const now = Date.now();
      if (now - this.validationCache.timestamp < this.CACHE_DURATION) {
        return this.effectiveState;
      }
    }

    const validatedLocalLicenses: LicenseInfo[] = [];
    for (const license of this.localLicenses) {
      const validation = await licenseManager.validateCurrentLicense(license, {
        targetProduct: this.currentProduct,
      });
      if (validation.isValid) {
        validatedLocalLicenses.push(license);
      }
    }

    const validatedInheritedLicenses: LicenseInfo[] = [];
    for (const license of this.inheritedLicenses) {
      const validation = await licenseManager.validateCurrentLicense(license, {
        targetProduct: this.currentProduct,
      });
      if (validation.isValid) {
        validatedInheritedLicenses.push(license);
      }
    }

    const effectiveState = resolveEffectiveLicenseState({
      product: this.currentProduct,
      localLicenses: validatedLocalLicenses,
      inheritedLicenses: validatedInheritedLicenses,
    });
    
    this.validationCache = {
      isValid: effectiveState.isPremiumActive,
      timestamp: Date.now()
    };

    return effectiveState;
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
