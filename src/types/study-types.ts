/**
 * 学习相关的类型定义
 */

/**
 * 学习模式类型
 * - normal: 正常学习（到期卡片 + 新卡片配额）
 * - advance: 提前学习（未到期的复习卡片）
 * - custom: 自定义学习（指定卡片ID列表）
 */
export type StudyMode = 'normal' | 'advance' | 'custom';

/**
 * 学习视图状态
 */
export interface StudyViewState {
  /** 牌组ID（undefined表示全局学习） */
  deckId?: string;
  
  /** 学习模式 */
  mode?: StudyMode;
  
  /** 自定义卡片ID列表（当mode='custom'或'advance'时使用） */
  cardIds?: string[];
}

/**
 * 持久化的学习会话状态
 * 用于会话恢复
 */
export interface PersistedStudySession {
  /** 会话ID */
  sessionId: string;
  
  /** 牌组ID */
  deckId: string;
  
  /** 当前卡片索引 */
  currentCardIndex: number;
  
  /** 当前卡片ID */
  currentCardId: string;
  
  /** 剩余待学习的卡片ID列表 */
  remainingCardIds: string[];
  
  /** 会话开始时间 */
  startTime: number;
  
  /** 暂停时间 */
  pauseTime?: number;
  
  /** 学习统计 */
  stats: {
    /** 已完成数量 */
    completed: number;
    /** 正确数量 */
    correct: number;
    /** 错误数量 */
    incorrect: number;
  };
  
  /** 是否处于暂停状态 */
  isPaused: boolean;
  
  /** 会话类型 */
  sessionType: 'review' | 'new' | 'learning' | 'mixed';
}

export interface StudySession {
  /** 会话ID */
  id: string;
  
  /** 牌组ID */
  deckId: string;
  
  /** 开始时间 */
  startTime: number;
  
  /** 结束时间 */
  endTime?: number;
  
  /** 总学习时间（秒） */
  totalTime: number;
  
  /** 学习的卡片数量 */
  cardsStudied: number;
  
  /** 正确回答数量 */
  correctAnswers: number;
  
  /** 错误回答数量 */
  incorrectAnswers: number;
  
  /** 学习的卡片记录 */
  cardRecords: StudyCardRecord[];
  
  /** 会话类型 */
  sessionType: 'review' | 'new' | 'learning' | 'mixed';
  
  /** 是否完成 */
  completed: boolean;
}

export interface StudyCardRecord {
  /** 卡片ID */
  cardId: string;
  
  /** 回答时间戳 */
  timestamp: number;
  
  /** 回答评分 */
  rating: 1 | 2 | 3 | 4;
  
  /** 响应时间（毫秒） */
  responseTime: number;
  
  /** 是否正确 */
  correct: boolean;
  
  /** 学习前的间隔 */
  previousInterval: number;
  
  /** 学习后的间隔 */
  newInterval: number;
  
  /** 学习前的记忆强度 */
  previousStability?: number;
  
  /** 学习后的记忆强度 */
  newStability?: number;
}

export interface StudyStatistics {
  /** 总学习天数 */
  totalDays: number;
  
  /** 总学习时间（分钟） */
  totalMinutes: number;
  
  /** 总学习卡片数 */
  totalCards: number;
  
  /** 总正确数 */
  totalCorrect: number;
  
  /** 平均准确率 */
  averageAccuracy: number;
  
  /** 每日学习数据 */
  dailyStats: DailyStudyStats[];
  
  /** 记忆保持率数据 */
  retentionData: RetentionDataPoint[];
  
  /** FSRS预测数据 */
  fsrsPredictions: FSRSPredictionPoint[];
}

export interface DailyStudyStats {
  /** 日期 (YYYY-MM-DD) */
  date: string;
  
  /** 当天学习卡片数 */
  cardsStudied: number;
  
  /** 当天学习时间（分钟） */
  studyTime: number;
  
  /** 当天准确率 */
  accuracy: number;
  
  /** 新卡片数 */
  newCards: number;
  
  /** 复习卡片数 */
  reviewCards: number;
  
  /** 学习中卡片数 */
  learningCards: number;
}

export interface RetentionDataPoint {
  /** 天数 */
  days: number;
  
  /** 实际记忆保持率 */
  actualRetention: number;
  
  /** 预测记忆保持率 */
  predictedRetention?: number;
  
  /** 样本数量 */
  sampleSize: number;
}

export interface FSRSPredictionPoint {
  /** 天数 */
  days: number;
  
  /** 预测记忆保持率 */
  predictedRetention: number;
  
  /** 置信区间下限 */
  confidenceLower?: number;
  
  /** 置信区间上限 */
  confidenceUpper?: number;
}

export interface StudyProgress {
  /** 当前会话进度 */
  currentSession: {
    /** 已完成卡片数 */
    completed: number;
    
    /** 总卡片数 */
    total: number;
    
    /** 正确数 */
    correct: number;
    
    /** 错误数 */
    incorrect: number;
    
    /** 开始时间 */
    startTime: number;
  };
  
  /** 今日进度 */
  todayProgress: {
    /** 新卡片进度 */
    newCards: { completed: number; total: number };
    
    /** 复习卡片进度 */
    reviewCards: { completed: number; total: number };
    
    /** 学习中卡片进度 */
    learningCards: { completed: number; total: number };
  };
  
  /** 本周进度 */
  weeklyProgress: {
    /** 已学习天数 */
    daysStudied: number;
    
    /** 总天数 */
    totalDays: number;
    
    /** 本周学习卡片数 */
    cardsStudied: number;
    
    /** 本周学习时间 */
    studyTime: number;
  };
}

export interface StudyGoal {
  /** 目标类型 */
  type: 'daily' | 'weekly' | 'monthly';
  
  /** 目标值 */
  target: number;
  
  /** 目标单位 */
  unit: 'cards' | 'minutes' | 'accuracy';
  
  /** 当前进度 */
  current: number;
  
  /** 是否完成 */
  completed: boolean;
  
  /** 完成时间 */
  completedAt?: number;
}

export interface StudyStreak {
  /** 当前连续学习天数 */
  current: number;
  
  /** 最长连续学习天数 */
  longest: number;
  
  /** 上次学习日期 */
  lastStudyDate: string;
  
  /** 连续学习开始日期 */
  streakStartDate: string;
}
