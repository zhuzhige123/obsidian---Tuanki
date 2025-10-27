/**
 * 统计分析界面配置
 * 消除硬编码，提供可配置的参数和常量
 */

// ============================================================================
// 时间范围配置
// ============================================================================

export const TIME_RANGE_CONFIG = {
  // 默认时间范围（天数）
  DEFAULT_DAYS: 30,
  
  // 预设时间范围
  PRESETS: {
    WEEK: 7,
    MONTH: 30,
    QUARTER: 90,
    YEAR: 365
  },
  
  // 最大时间范围
  MAX_DAYS: 365,
  
  // 最小时间范围
  MIN_DAYS: 1
} as const;

// ============================================================================
// 数据刷新配置
// ============================================================================

export const REFRESH_CONFIG = {
  // 自动刷新间隔（毫秒）
  AUTO_REFRESH_INTERVAL: 300000, // 5分钟

  // 防抖延迟（毫秒）
  DEBOUNCE_DELAY: 300
} as const;

// ============================================================================
// 性能配置
// ============================================================================

export const PERFORMANCE_CONFIG = {
  // 数据采样配置
  SAMPLING: {
    MAX_CARDS_SAMPLE: 1000,
    MAX_SESSIONS_SAMPLE: 500,
    MAX_REVIEWS_SAMPLE: 2000
  },
  
  // 批量处理配置
  BATCH_PROCESSING: {
    CHUNK_SIZE: 100,
    PROCESSING_DELAY: 10, // 毫秒
    MAX_CONCURRENT: 3
  },
  
  // 缓存配置 - 优化降低内存占用
  CACHE: {
    TTL: 120000, // 2分钟（从5分钟降低，数据刷新更频繁）
    MAX_SIZE: 20, // 最大缓存项数（从50降低到20，减少内存占用）
    CLEANUP_INTERVAL: 30000 // 30秒（从60秒降低，更频繁清理）
  }
} as const;

// ============================================================================
// 图表配置
// ============================================================================

export const CHART_CONFIG = {
  // 默认图表尺寸
  DEFAULT_HEIGHT: 180,
  DEFAULT_WIDTH: 400,
  
  // 颜色配置
  COLORS: {
    PRIMARY: '#8b5cf6',
    SECONDARY: '#06b6d4',
    SUCCESS: '#10b981',
    WARNING: '#f59e0b',
    ERROR: '#ef4444',
    MUTED: '#6b7280'
  },
  
  // 图表样式
  STYLES: {
    STROKE_WIDTH: 2,
    POINT_RADIUS: 3.5,
    BORDER_RADIUS: 6,
    OPACITY: {
      FILL: 0.15,
      HOVER: 0.8,
      DISABLED: 0.5
    }
  },
  
  // 动画配置
  ANIMATION: {
    DURATION: 300,
    EASING: 'ease-out',
    DELAY: 50
  }
} as const;

// ============================================================================
// KPI 配置
// ============================================================================

export const KPI_CONFIG = {
  // 格式化配置
  FORMATTING: {
    LARGE_NUMBER_THRESHOLD: 1000,
    DECIMAL_PLACES: {
      PERCENTAGE: 1,
      AVERAGE: 2,
      COUNT: 0
    }
  },
  
  // 趋势计算配置
  TREND: {
    THRESHOLD: {
      SIGNIFICANT_CHANGE: 0.05, // 5%
      MAJOR_CHANGE: 0.2 // 20%
    }
  },
  
  // 更新频率
  UPDATE_FREQUENCY: 60000 // 1分钟
} as const;

// ============================================================================
// 错误处理配置
// ============================================================================

export const ERROR_CONFIG = {
  // 错误类型
  TYPES: {
    NETWORK: 'network',
    DATA: 'data',
    CALCULATION: 'calculation',
    PERMISSION: 'permission',
    TIMEOUT: 'timeout'
  },

  // 超时配置
  TIMEOUTS: {
    DATA_LOAD: 30000, // 30秒
    CALCULATION: 10000, // 10秒
    CHART_RENDER: 5000 // 5秒
  },

  // 重试配置
  RETRY: {
    MAX_ATTEMPTS: 3,
    INITIAL_DELAY: 1000,
    BACKOFF_MULTIPLIER: 2,
    MAX_DELAY: 10000
  },

  // 错误恢复配置
  RECOVERY: {
    AUTO_RETRY: true,
    FALLBACK_DATA: true,
    GRACEFUL_DEGRADATION: true
  }
} as const;

// ============================================================================
// FSRS 分析配置
// ============================================================================

export const FSRS_CONFIG = {
  // 参数范围
  PARAMETER_RANGES: {
    DIFFICULTY: { MIN: 0, MAX: 10 },
    STABILITY: { MIN: 0, MAX: 365 },
    RETENTION: { MIN: 0, MAX: 1 }
  },
  
  // 分析配置
  ANALYSIS: {
    MIN_REVIEWS_FOR_ANALYSIS: 10,
    CONFIDENCE_THRESHOLD: 0.8,
    PREDICTION_DAYS: 30
  },
  
  // 优化配置
  OPTIMIZATION: {
    MIN_DATA_POINTS: 50,
    CONVERGENCE_THRESHOLD: 0.001,
    MAX_ITERATIONS: 100
  }
} as const;

// ============================================================================
// 数据验证配置
// ============================================================================

export const VALIDATION_CONFIG = {
  // 数据完整性检查
  DATA_INTEGRITY: {
    REQUIRED_FIELDS: ['id', 'timestamp'],
    MAX_MISSING_RATIO: 0.1, // 10%
    MIN_DATA_POINTS: 5
  },
  
  // 数值范围验证
  VALUE_RANGES: {
    RATING: { MIN: 1, MAX: 4 },
    INTERVAL: { MIN: 0, MAX: 36500 },
    RESPONSE_TIME: { MIN: 0, MAX: 3600000 } // 1小时
  },
  
  // 异常值检测
  OUTLIER_DETECTION: {
    ENABLED: true,
    Z_SCORE_THRESHOLD: 3,
    IQR_MULTIPLIER: 1.5
  }
} as const;

// ============================================================================
// 用户体验配置
// ============================================================================

export const UX_CONFIG = {
  // 加载状态
  LOADING: {
    MIN_DISPLAY_TIME: 500, // 最小显示时间
    SKELETON_COUNT: 6,
    PROGRESS_STEPS: ['数据加载', '数据处理', '图表渲染', '完成']
  },
  
  // 空状态
  EMPTY_STATE: {
    MIN_DATA_THRESHOLD: 3,
    SHOW_SUGGESTIONS: true,
    SHOW_HELP_LINKS: true
  },
  
  // 交互反馈
  FEEDBACK: {
    HOVER_DELAY: 100,
    TOOLTIP_DELAY: 500,
    NOTIFICATION_DURATION: 3000
  }
} as const;

// ============================================================================
// 导出配置类型
// ============================================================================

export type AnalyticsConfig = {
  timeRange: typeof TIME_RANGE_CONFIG;
  refresh: typeof REFRESH_CONFIG;
  performance: typeof PERFORMANCE_CONFIG;
  chart: typeof CHART_CONFIG;
  kpi: typeof KPI_CONFIG;
  error: typeof ERROR_CONFIG;
  fsrs: typeof FSRS_CONFIG;
  validation: typeof VALIDATION_CONFIG;
  ux: typeof UX_CONFIG;
};

// ============================================================================
// 默认配置导出
// ============================================================================

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  timeRange: TIME_RANGE_CONFIG,
  refresh: REFRESH_CONFIG,
  performance: PERFORMANCE_CONFIG,
  chart: CHART_CONFIG,
  kpi: KPI_CONFIG,
  error: ERROR_CONFIG,
  fsrs: FSRS_CONFIG,
  validation: VALIDATION_CONFIG,
  ux: UX_CONFIG
} as const;
