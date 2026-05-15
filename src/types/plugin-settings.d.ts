/**
 * 插件设置类型定义
 * 
 * 为plugin.settings提供完整的类型定义
 * 解决Settings访问时的类型不安全问题
 * 
 * @module types/plugin-settings
 */

// ============================================================================
// AI配置类型
// ============================================================================

/**
 * 卡片拆分配置
 */
export interface CardSplittingConfig {
  /**
   * 是否启用卡片拆分功能
   */
  enabled?: boolean;
  
  /**
   * 默认拆分指令
   */
  defaultInstruction?: string;
  
  /**
   * 目标卡片数量
   */
  targetCount?: number;
  
  /**
   * 最小卡片数量
   */
  minCount?: number;
  
  /**
   * 最大卡片数量
   */
  maxCount?: number;
}

/**
 * AI格式化配置
 */
export interface FormattingConfig {
  /**
   * 是否启用自动格式化
   */
  enabled?: boolean;
  
  /**
   * 默认格式化规则
   */
  defaultRules?: string[];
  
  /**
   * 自定义格式化动作
   */
  customActions?: CustomFormatAction[];
}

/**
 * AI配置总接口
 */
export interface AIConfig {
  /**
   * API密钥配置（多服务商）
   * 支持的提供商：openai, gemini, anthropic, deepseek, zhipu, siliconflow, xai
   */
  apiKeys?: Partial<Record<'openai' | 'gemini' | 'anthropic' | 'deepseek' | 'zhipu' | 'siliconflow' | 'xai', {
    apiKey: string;
    model: string;
    verified: boolean;
    lastVerified?: string;
    baseUrl?: string;
  }>>;
  
  /**
   * 默认AI服务提供商
   */
  defaultProvider?: string;
  
  /**
   * 上次使用的 AI 服务提供商（用于持久化用户选择）
   */
  lastUsedProvider?: string;
  
  /**
   * 上次使用的 AI 模型（用于持久化用户选择）
   */
  lastUsedModel?: string;
  
  /**
   * 卡片拆分配置
   */
  cardSplitting?: CardSplittingConfig;
  
  /**
   * 格式化配置
   */
  formatting?: FormattingConfig;
  
  /**
   * 自定义格式化功能
   */
  customFormatActions?: any[];
  
  /**
   * 自定义AI拆分功能
   */
  customSplitActions?: any[];
  
  /**
   * 温度参数（0-1）
   */
  temperature?: number;
  
  /**
   * 最大生成长度
   */
  maxTokens?: number;
}

// ============================================================================
// 学习设置类型
// ============================================================================

/**
 * FSRS算法配置
 */
export interface FSRSConfig {
  /**
   * 算法参数
   */
  parameters?: number[];
  
  /**
   * 请求保留率
   */
  requestRetention?: number;
  
  /**
   * 最大间隔天数
   */
  maximumInterval?: number;
  
  /**
   * 是否启用个性化优化
   */
  enableOptimization?: boolean;
}

/**
 * 兄弟卡片分散配置（渐进式挖空子卡片调度优化）
 * 
 * 基于认知科学研究和Anki最佳实践：
 * - 避免前摄干扰和倒摄干扰
 * - 为记忆巩固提供足够时间
 * - 提升渐进式挖空学习效果
 */
export interface SiblingDispersionConfig {
  /**
   * 是否启用兄弟分散
   * 默认: true（强烈推荐开启）
   */
  enabled?: boolean;
  
  /**
   * 最小间隔天数
   * 默认: 5天（基于Anki社区标准）
   * 范围: 3-10天
   */
  minSpacing?: number;
  
  /**
   * 基于间隔的动态分散比例
   * 默认: 0.05（5%）
   * 范围: 0.03-0.10
   * 
   * 实际分散间隔 = max(minSpacing, scheduledDays * spacingPercentage)
   */
  spacingPercentage?: number;
  
  /**
   * 队列生成时过滤
   * 默认: true
   * 避免同一会话中出现兄弟卡片
   */
  filterInQueue?: boolean;
  
  /**
   * 复习后自动调整（P2）
   * 默认: true
   * 复习后自动调整冲突的兄弟卡片due日期
   */
  autoAdjustAfterReview?: boolean;
  
  /**
   * 遵守FSRS的fuzz范围（P3）
   * 默认: true
   * 仅在fuzz范围内调整，不破坏最优间隔
   */
  respectFuzzRange?: boolean;
}

/**
 * 学习配置
 */
export interface StudyConfig {
  /**
   * 每日新卡数量
   */
  newCardsPerDay?: number;
  
  /**
   * 每日复习卡数量
   */
  reviewsPerDay?: number;
  
  /**
   * FSRS配置
   */
  fsrs?: FSRSConfig;
  
  /**
   * 兄弟卡片分散配置
   */
  siblingDispersion?: SiblingDispersionConfig;
  
  /**
   * 是否显示答案按钮
   */
  showAnswerButtons?: boolean;
  
  /**
   * 是否启用键盘快捷键
   */
  enableKeyboardShortcuts?: boolean;
}

// ============================================================================
// 界面设置类型
// ============================================================================

/**
 * 主题配置
 */
export interface ThemeConfig {
  /**
   * 主题名称
   */
  name?: 'light' | 'dark' | 'auto';
  
  /**
   * 主色调
   */
  primaryColor?: string;
  
  /**
   * 字体大小
   */
  fontSize?: number;
}

/**
 * 牌组卡片设计样式
 */
export type DeckCardStyle = 'default' | 'chinese-elegant';

/**
 * 界面配置
 */
export interface UIConfig {
  /**
   * 主题配置
   */
  theme?: ThemeConfig;
  
  /**
   * 是否显示侧边栏
   */
  showSidebar?: boolean;
  
  /**
   * 是否启用动画
   */
  enableAnimations?: boolean;
  
  /**
   * 默认视图
   */
  defaultView?: 'cards' | 'decks' | 'stats';
  
  /**
   * 牌组卡片设计样式
   */
  deckCardStyle?: DeckCardStyle;
}

// ============================================================================
// 增量阅读设置类型
// ============================================================================

/**
 * Incremental reading global sidebar settings.
 */
export interface IRCalendarSidebarSettings {
  continuousReadingEnabled?: boolean;
  autoStartNextTimerEnabled?: boolean;
  showSchedulingPreview?: boolean;
  calendarViewMode?: 'full' | 'two-row';
  showMaterialTimers?: boolean;
  backgroundWall?: {
    imagePath?: string;
    fadePercent?: number;
  };
}

/**
 * 增量阅读全局设置
 */
export type IncrementalReadingFolderSubscriptionInitialScheduleMode = 'today' | 'scheduled';

export interface IncrementalReadingFolderSubscriptionRule {
  id?: string;
  enabled?: boolean;
  folderPath?: string;
  deckId?: string;
}

export interface IncrementalReadingFolderSubscriptionSettings {
  rules?: IncrementalReadingFolderSubscriptionRule[];
  enabled?: boolean;
  folderPath?: string;
  deckId?: string;
  initialScheduleMode?: IncrementalReadingFolderSubscriptionInitialScheduleMode;
  importConfirmThreshold?: number;
}

export interface IncrementalReadingSettings {
  /**
   * 默认间隔因子
   * 范围: 1.0-3.0, 默认: 1.5
   */
  defaultIntervalFactor?: number;
  
  /**
   * 每日新块上限
   * 范围: 0-50, 默认: 20
   */
  dailyNewLimit?: number;
  
  /**
   * 每日复习上限
   * 范围: 0-200, 默认: 50
   */
  dailyReviewLimit?: number;
  
  /**
   * 默认拆分标题级别
   * 范围: 1-6, 默认: 2 (##)
   */
  defaultSplitLevel?: number;
  
  /**
   * 是否启用交错学习模式
   * 默认: true
   */
  interleaveMode?: boolean;
  
  /**
   * 交错学习最大连续同主题块数
   * 范围: 1-10, 默认: 3
   */
  maxConsecutiveSameTopic?: number;
  
  /**
   * 进入复习状态的最小间隔（天）
   * 范围: 3-14, 默认: 7
   */
  reviewThreshold?: number;
  
  /**
   * 最大间隔天数
   * 范围: 30-365, 默认: 365
   */
  maxInterval?: number;
  
  /**
   * 旧材料导入 / 非 Markdown 源文件复制用的兼容目录
   * 不再决定新的正文 Markdown 默认创建位置
   * @default 'weave/incremental-reading'
   */
  importFolder?: string;

  selectionQuickCreateDeleteSource?: boolean;

  /**
   * 正文 Markdown 上一次手动选择的目录
   * 为空时回退 Obsidian 默认新建笔记位置，再回退库根目录
   */
  selectionQuickCreateLastFolder?: string;

  selectionQuickCreateBacklinkPosition?: 'start' | 'end';

  selectionQuickCreateSourceDocumentBacklinkPosition?: 'start' | 'end';

  appendSourceDocumentBacklinkOnSplitImport?: boolean;
  
  /**
   * Global sidebar settings.
   */
  calendarSidebar?: IRCalendarSidebarSettings;
  
  // ============================================
  // v3.0 调度系统新增设置
  // ============================================
  
  /**
   * 调度策略
   * - 'processing': 加工流（同日可多次回访）
   * - 'reading-list': 阅读清单（每天最多1次）
   * @default 'processing'
   */
  scheduleStrategy?: 'processing' | 'reading-list';
  
  /**
   * 每日时间预算（分钟）
   * 范围: 10-120, 默认: 40
   */
  dailyTimeBudgetMinutes?: number;
  
  /**
   * 同一内容块每日最大出现次数
   * 范围: 1-5, 默认: 2
   */
  maxAppearancesPerDay?: number;
  
  /**
   * 是否启用标签组先验（自动调整间隔因子）
   * @default true
   */
  enableTagGroupPrior?: boolean;
  
  /**
   * 防沉底强度（aging机制）
   * @default 'low'
   */
  agingStrength?: 'low' | 'medium' | 'high';
  
  /**
   * 过载自动后推策略
   * @default 'gentle'
   */
  autoPostponeStrategy?: 'off' | 'gentle' | 'aggressive';
  
  /**
   * 优先级EWMA半衰期（天）
   * 范围: 3-30, 默认: 7
   */
  priorityHalfLifeDays?: number;
  
  /**
   * 标签组自动跟随模式
   * 当文档标签变化导致匹配到不同标签组时的行为
   * - 'off': 不检测，导入时确定后不再变化
   * - 'ask': 检测到漂移时弹出通知提醒用户选择
   * - 'auto': 静默自动切换标签组
   * @default 'ask'
   */
  tagGroupFollowMode?: 'off' | 'ask' | 'auto';
  
  /**
   * 待读天数（统一用于统计和提前阅读范围）
   * 用于统计N天内到期的内容块，显示为"待读"，同时限制提前阅读范围
   * 范围: 1-14, 默认: 3
   */
  learnAheadDays?: number;
  
  // ============================================
  // v3.1 标注信号配置
  // ============================================
  
  /**
   * 标注信号配置
   * 控制 Callout 标注如何影响内容块优先级
   */
  calloutSignal?: CalloutSignalSettings;

  folderSubscription?: IncrementalReadingFolderSubscriptionSettings;
}

/**
 * Callout 类型权重配置
 */
export interface CalloutTypeWeight {
  /** Callout 类型 ID (如 'question', 'quote' 等) */
  type: string;
  /** 是否启用此类型作为信号源 */
  enabled: boolean;
  /** 权重值 (0.5 ~ 3.0) */
  weight: number;
}

/**
 * 标注信号设置
 */
export interface CalloutSignalSettings {
  /**
   * 是否启用标注信号功能
   * @default true
   */
  enabled?: boolean;
  
  /**
   * 各 Callout 类型的权重配置
   */
  typeWeights?: CalloutTypeWeight[];
  
  /**
   * 对优先级的最大增益
   * 范围: 1.0 ~ 2.0, 默认: 2.0
   */
  maxBoost?: number;
  
  /**
   * 饱和参数（控制边际收益递减速度）
   * 范围: 3 ~ 6, 默认: 4
   * 越小越快饱和
   */
  saturationParam?: number;
  
  /**
   * 最小内容阈值（字符数）
   * Callout 内容少于此值不计入统计
   * 范围: 0 ~ 50, 默认: 0（不启用）
   */
  minContentLength?: number;
}

/**
 * 增量阅读默认设置（使用统一的 PATHS 配置）
 */
export const DEFAULT_IR_SETTINGS: IncrementalReadingSettings = {
  defaultIntervalFactor: 1.5,
  dailyNewLimit: 20,
  dailyReviewLimit: 50,
  defaultSplitLevel: 2,
  interleaveMode: true,
  maxConsecutiveSameTopic: 3,
  reviewThreshold: 7,
  maxInterval: 365,
  importFolder: '',
  selectionQuickCreateDeleteSource: false,
  selectionQuickCreateLastFolder: '',
  selectionQuickCreateBacklinkPosition: 'start',
  selectionQuickCreateSourceDocumentBacklinkPosition: 'start',
  appendSourceDocumentBacklinkOnSplitImport: false,
  // v3.0 新增
  scheduleStrategy: 'processing',
  dailyTimeBudgetMinutes: 40,
  maxAppearancesPerDay: 2,
  enableTagGroupPrior: true,
  agingStrength: 'low',
  autoPostponeStrategy: 'gentle',
  priorityHalfLifeDays: 7,
  learnAheadDays: 3,
  tagGroupFollowMode: 'ask',
  folderSubscription: {
    rules: [],
    initialScheduleMode: 'today',
    importConfirmThreshold: 20
  },
  calendarSidebar: {
    continuousReadingEnabled: false,
    autoStartNextTimerEnabled: false,
    showSchedulingPreview: false,
    calendarViewMode: 'full',
    showMaterialTimers: true,
    backgroundWall: {
      imagePath: '',
      fadePercent: 72
    }
  }
};

// ============================================================================
// 插件设置主接口
// ============================================================================

/**
 * Weave插件完整设置
 */
export interface WeaveSettings {
  /**
   * AI功能配置
   */
  aiConfig?: AIConfig;
  
  /**
   * 学习配置
   */
  studyConfig?: StudyConfig;
  
  /**
   * 界面配置
   */
  uiConfig?: UIConfig;
  
  /**
   * 牌组标签组配置
   * 用于看板视图按标签组分组
   */
  deckTagGroups?: import('../types/deck-kanban-types').DeckTagGroup[];

  /**
   * 记忆牌组组织配置
   * 用于正式牌组与涌现式牌组双区模型
   */
  memoryDeckOrganization?: {
    enabled?: boolean;
    minCandidateCardCount?: number;
    tagDriftFollowMode?: 'off' | 'ask' | 'auto';
    activeRuleGroupId?: string;
    ruleGroups?: import('../services/deck/emergent-rule-groups').EmergentRuleGroup[];
  };
  
  /**
   * 默认牌组
   */
  defaultDeck?: string;
  
  /**
   * 数据存储路径
   */
  dataPath?: string;
  
  /**
   * 是否启用调试模式
   */
  enableDebugMode?: boolean;
  
  /**
   * 是否显示高级功能预览
   * 开启后，未激活的高级功能将以锁定状态显示
   */
  showPremiumFeaturesPreview?: boolean;
  
  /**
   * 是否显示性能优化设置
   */
  showPerformanceSettings?: boolean;

  /**
   * 是否启用预览
   */
  enablePreview?: boolean;
  
  /**
   * 是否自动保存
   */
  autoSave?: boolean;
  
  /**
   * 自动保存间隔（毫秒）
   */
  autoSaveInterval?: number;
  
  /**
   * 简化解析配置
   */
  simplifiedParsing?: {
    templates?: any[];
    enabled?: boolean;
  };

  clozeSettings?: {
    enabled?: boolean;
    openDelimiter?: string;
    closeDelimiter?: string;
    placeholder?: string;
  };
  
  /**
   * 批量解析配置
   */
  batchParsing?: {
    enabled?: boolean;
    scope?: string[];
  };
  
  /**
   * AnkiConnect配置
   */
  ankiConnect?: {
    enabled?: boolean;
    host?: string;
    port?: number;
  };
  
  /**
   * 增量阅读全局设置
   */
  incrementalReading?: IncrementalReadingSettings;

  weaveParentFolder?: string;

  createCardPreferences?: {
    lastSelectedDeckId?: string;
    lastSelectedDeckNames?: string[];
  };

  /**
   * 超时自动暂停计时（秒）
   * 单张卡片计时超过此值后自动暂停，防止离开时计时虚高
   * @default 60
   */
  timerAutoPauseSeconds?: number;

  /**
   * 提示功能每次学习会话最大使用次数
   * @default 5
   */
  hintMaxUses?: number;

  /**
   * 记忆学习底部“作答方式（显示答案/输入作答）”切换按钮显示设置
   * @default true
   */
  showClozeModeSwitchButton?: boolean;

  /**
   * 全局教程提示持久化状态（true 表示永久不再显示）
   */
  tutorialHints?: import('../services/tutorial/GlobalTutorialHints').GlobalTutorialHintState;
}

/**
 * 自定义格式化动作
 */
export interface CustomFormatAction {
  id: string;
  name: string;
  instruction: string;
  enabled: boolean;
}
