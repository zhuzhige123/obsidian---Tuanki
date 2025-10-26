/**
 * 国际化系统
 * 提供多语言支持和文本本地化功能
 */

import { writable, derived } from 'svelte/store';

// ============================================================================
// 类型定义
// ============================================================================

export type SupportedLanguage = 'zh-CN' | 'en-US';

export interface TranslationKey {
  [key: string]: string | TranslationKey;
}

export interface I18nConfig {
  defaultLanguage: SupportedLanguage;
  fallbackLanguage: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
}

// ============================================================================
// 翻译资源
// ============================================================================

const translations: Record<SupportedLanguage, TranslationKey> = {
  'zh-CN': {
    analytics: {
      dashboard: {
        title: '统计分析',
        loading: '正在加载数据...',
        error: '数据加载失败',
        retry: '重试',
        refresh: '刷新',
        noData: '暂无数据',
        
        // KPI 卡片
        kpi: {
          todayReviews: '今日复习',
          todayNew: '今日新增',
          accuracy: '正确率',
          studyTime: '学习时长',
          memoryRate: '记忆率',
          streakDays: '连续天数',
          fsrsProgress: 'FSRS进度',
          
          // 趋势描述
          trend: {
            up: '上升',
            down: '下降',
            stable: '稳定',
            yesterdayCompare: '较昨日',
            newCardsAdded: '新卡片加入'
          }
        },
        
        // 图表标题
        charts: {
          reviewTrend: '复习趋势（{days}天）',
          ratingDistribution: '评分分布',
          calendarHeatmap: '热力图（日历）',
          timeHeatmap: '时段热力（24h×7）',
          intervalGrowth: '间隔增长（周均 scheduledDays）',
          deckComparison: '牌组对比'
        },
        
        // 表格标题
        table: {
          deck: '牌组',
          reviews: '复习量',
          accuracy: '正确率',
          avgInterval: '平均间隔',
          avgDifficulty: '平均难度'
        },
        
        // FSRS 分析
        fsrs: {
          title: 'FSRS6 算法分析',
          avgDifficulty: '平均难度',
          avgStability: '平均稳定性',
          difficultyScore: 'FSRS难度评分',
          stabilityDays: '天数',
          retentionRate: '记忆保持率',
          learningEfficiency: '学习效率'
        }
      },
      
      // 时间范围
      timeRange: {
        last7Days: '最近7天',
        last30Days: '最近30天',
        last90Days: '最近90天',
        thisMonth: '本月',
        lastMonth: '上月',
        thisYear: '今年',
        custom: '自定义'
      },
      
      // 错误消息
      errors: {
        loadFailed: '数据加载失败',
        networkError: '网络连接错误',
        dataCorrupted: '数据损坏',
        insufficientData: '数据不足',
        calculationError: '计算错误'
      }
    },
    
    common: {
      loading: '加载中...',
      error: '错误',
      success: '成功',
      warning: '警告',
      info: '信息',
      confirm: '确认',
      cancel: '取消',
      save: '保存',
      delete: '删除',
      edit: '编辑',
      close: '关闭',
      retry: '重试',
      refresh: '刷新',
      reset: '重置',
      clear: '清空',
      search: '搜索',
      filter: '筛选',
      sort: '排序',
      export: '导出',
      import: '导入',
      settings: '设置',
      help: '帮助',
      about: '关于'
    }
  },
  
  'en-US': {
    analytics: {
      dashboard: {
        title: 'Analytics Dashboard',
        loading: 'Loading data...',
        error: 'Failed to load data',
        retry: 'Retry',
        refresh: 'Refresh',
        noData: 'No data available',
        
        kpi: {
          todayReviews: 'Today Reviews',
          todayNew: 'Today New',
          accuracy: 'Accuracy',
          studyTime: 'Study Time',
          memoryRate: 'Memory Rate',
          streakDays: 'Streak Days',
          fsrsProgress: 'FSRS Progress',
          
          trend: {
            up: 'Up',
            down: 'Down',
            stable: 'Stable',
            yesterdayCompare: 'vs Yesterday',
            newCardsAdded: 'New cards added'
          }
        },
        
        charts: {
          reviewTrend: 'Review Trend ({days} days)',
          ratingDistribution: 'Rating Distribution',
          calendarHeatmap: 'Calendar Heatmap',
          timeHeatmap: 'Time Heatmap (24h×7)',
          intervalGrowth: 'Interval Growth (Weekly Avg)',
          deckComparison: 'Deck Comparison'
        },
        
        table: {
          deck: 'Deck',
          reviews: 'Reviews',
          accuracy: 'Accuracy',
          avgInterval: 'Avg Interval',
          avgDifficulty: 'Avg Difficulty'
        },
        
        fsrs: {
          title: 'FSRS6 Algorithm Analysis',
          avgDifficulty: 'Avg Difficulty',
          avgStability: 'Avg Stability',
          difficultyScore: 'FSRS Difficulty Score',
          stabilityDays: 'Days',
          retentionRate: 'Retention Rate',
          learningEfficiency: 'Learning Efficiency'
        }
      },
      
      timeRange: {
        last7Days: 'Last 7 Days',
        last30Days: 'Last 30 Days',
        last90Days: 'Last 90 Days',
        thisMonth: 'This Month',
        lastMonth: 'Last Month',
        thisYear: 'This Year',
        custom: 'Custom'
      },
      
      errors: {
        loadFailed: 'Failed to load data',
        networkError: 'Network connection error',
        dataCorrupted: 'Data corrupted',
        insufficientData: 'Insufficient data',
        calculationError: 'Calculation error'
      }
    },
    
    common: {
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      info: 'Info',
      confirm: 'Confirm',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      retry: 'Retry',
      refresh: 'Refresh',
      reset: 'Reset',
      clear: 'Clear',
      search: 'Search',
      filter: 'Filter',
      sort: 'Sort',
      export: 'Export',
      import: 'Import',
      settings: 'Settings',
      help: 'Help',
      about: 'About'
    }
  }
};

// ============================================================================
// 国际化配置
// ============================================================================

const defaultConfig: I18nConfig = {
  defaultLanguage: 'zh-CN',
  fallbackLanguage: 'zh-CN',
  supportedLanguages: ['zh-CN', 'en-US']
};

// ============================================================================
// 状态管理
// ============================================================================

export const currentLanguage = writable<SupportedLanguage>(defaultConfig.defaultLanguage);
export const i18nConfig = writable<I18nConfig>(defaultConfig);

// ============================================================================
// 国际化服务类
// ============================================================================

export class I18nService {
  private static instance: I18nService;
  private currentLang: SupportedLanguage = defaultConfig.defaultLanguage;
  private config: I18nConfig = defaultConfig;

  private constructor() {
    // 订阅语言变化
    currentLanguage.subscribe(lang => {
      this.currentLang = lang;
    });

    // 订阅配置变化
    i18nConfig.subscribe(config => {
      this.config = config;
    });
  }

  static getInstance(): I18nService {
    if (!I18nService.instance) {
      I18nService.instance = new I18nService();
    }
    return I18nService.instance;
  }

  /**
   * 获取翻译文本
   */
  t(key: string, params?: Record<string, string | number>): string {
    const translation = this.getTranslation(key, this.currentLang);

    if (!translation) {
      // 尝试回退语言
      const fallbackTranslation = this.getTranslation(key, this.config.fallbackLanguage);
      if (fallbackTranslation) {
        return this.interpolate(fallbackTranslation, params);
      }

      // 返回键名作为最后的回退
      console.warn(`Translation not found for key: ${key}`);
      return key;
    }

    return this.interpolate(translation, params);
  }

  /**
   * 获取指定语言的翻译
   */
  private getTranslation(key: string, language: SupportedLanguage): string | null {
    const keys = key.split('.');
    let current: any = translations[language];

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return null;
      }
    }

    return typeof current === 'string' ? current : null;
  }

  /**
   * 插值处理
   */
  private interpolate(text: string, params?: Record<string, string | number>): string {
    if (!params) return text;

    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key]?.toString() || match;
    });
  }

  /**
   * 设置当前语言
   */
  setLanguage(language: SupportedLanguage): void {
    if (this.config.supportedLanguages.includes(language)) {
      currentLanguage.set(language);
    } else {
      console.warn(`Unsupported language: ${language}`);
    }
  }

  /**
   * 获取当前语言
   */
  getCurrentLanguage(): SupportedLanguage {
    return this.currentLang;
  }

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return this.config.supportedLanguages;
  }

  /**
   * 检查是否支持指定语言
   */
  isLanguageSupported(language: string): language is SupportedLanguage {
    return this.config.supportedLanguages.includes(language as SupportedLanguage);
  }
}

// ============================================================================
// 导出实例和工具函数
// ============================================================================

export const i18n = I18nService.getInstance();

// 便捷的翻译函数
export const t = (key: string, params?: Record<string, string | number>) => i18n.t(key, params);

// Svelte store 用于响应式翻译
export const tr = derived(
  currentLanguage,
  ($currentLanguage) => (key: string, params?: Record<string, string | number>) => i18n.t(key, params)
);
