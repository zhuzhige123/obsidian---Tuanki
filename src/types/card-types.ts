/**
 * FSRS 状态枚举
 */
export enum FSRSState {
  NEW = 'new',
  LEARNING = 'learning',
  REVIEW = 'review',
  RELEARNING = 'relearning'
}

/**
 * FSRS 评分枚举
 */
export enum FSRSRating {
  AGAIN = 1,
  HARD = 2,
  GOOD = 3,
  EASY = 4
}

/**
 * FSRS 数据接口
 */
export interface FSRSData {
  state: FSRSState;
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  last_review: Date | null;
  parameters: number[] | null;
}

/**
 * 卡片源位置信息
 */
export interface CardSourcePosition {
  blockId?: string;
  startLine: number;
  endLine: number;
  contentHash: string;
}

/**
 * 卡片元数据
 */
export interface CardMetadata {
  annotationId?: string;
  uuid?: string;
  version?: number;
  parseMethod?: 'exact' | 'fuzzy' | 'fallback';
  parseConfidence?: number;
  orphaned?: {
    reason: string;
    detectedAt: string;
    originalSourceFile: string;
    recoverable: boolean;
  };
  [key: string]: any;
}

/**
 * 卡片接口
 */
export interface Card {
  id: string;
  deckId: string;
  templateId: string;
  fields: Record<string, string>;
  
  // 源文档信息
  sourceFile?: string;
  sourcePosition?: CardSourcePosition;
  
  // 时间戳
  created: string;
  lastModified: string;
  
  // FSRS 数据
  fsrs: FSRSData;
  
  // 其他属性
  tags?: string[];
  type: string;
  priority: number;
  suspended: boolean;
  
  // 元数据
  metadata?: CardMetadata;
}

/**
 * 牌组配置
 */
export interface DeckConfig {
  newCardsPerDay: number;
  maxReviewsPerDay: number;
  learningSteps: number[];
  graduatingInterval: number;
  easyInterval: number;
  startingEase: number;
  easyBonus: number;
  intervalModifier: number;
  hardInterval: number;
  newInterval: number;
}

/**
 * 牌组接口
 */
export interface Deck {
  id: string;
  name: string;
  description?: string;
  
  // 时间戳
  created: string;
  lastModified: string;
  
  // 统计信息
  cardCount: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  
  // 状态
  suspended: boolean;
  
  // 分类和标签
  tags?: string[];
  
  // 配置
  config: DeckConfig;
}

/**
 * 学习会话信息
 */
export interface StudySession {
  id: string;
  deckId: string;
  startTime: string;
  endTime?: string;
  cardsStudied: number;
  correctAnswers: number;
  totalTime: number; // 毫秒
  averageTime: number; // 毫秒
}

/**
 * 复习记录
 */
export interface ReviewRecord {
  id: string;
  cardId: string;
  sessionId: string;
  rating: FSRSRating;
  responseTime: number; // 毫秒
  timestamp: string;
  previousState: FSRSState;
  newState: FSRSState;
  previousDue: string;
  newDue: string;
}

/**
 * 卡片统计信息
 */
export interface CardStatistics {
  totalCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
  suspendedCards: number;
  matureCards: number;
  youngCards: number;
  
  // 按牌组分组
  byDeck: Record<string, {
    total: number;
    new: number;
    learning: number;
    review: number;
  }>;
  
  // 按模板分组
  byTemplate: Record<string, number>;
  
  // 按标签分组
  byTag: Record<string, number>;
}

/**
 * 学习统计信息
 */
export interface StudyStatistics {
  totalSessions: number;
  totalCardsStudied: number;
  totalTimeSpent: number; // 毫秒
  averageSessionTime: number; // 毫秒
  averageCardTime: number; // 毫秒
  
  // 准确率统计
  overallAccuracy: number;
  accuracyByDeck: Record<string, number>;
  accuracyByTemplate: Record<string, number>;
  
  // 时间趋势
  dailyStats: Array<{
    date: string;
    cardsStudied: number;
    timeSpent: number;
    accuracy: number;
  }>;
  
  // 最近表现
  recentPerformance: {
    last7Days: number;
    last30Days: number;
    thisWeek: number;
    thisMonth: number;
  };
}

/**
 * 卡片搜索选项
 */
export interface CardSearchOptions {
  query?: string;
  deckIds?: string[];
  templateIds?: string[];
  tags?: string[];
  states?: FSRSState[];
  suspended?: boolean;
  dueOnly?: boolean;
  sortBy?: 'created' | 'modified' | 'due' | 'difficulty' | 'stability';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * 卡片搜索结果
 */
export interface CardSearchResult {
  cards: Card[];
  total: number;
  hasMore: boolean;
  searchTime: number;
}

/**
 * 卡片导入导出格式
 */
export interface CardExportFormat {
  version: string;
  cards: Card[];
  decks: Deck[];
  metadata: {
    exportedAt: string;
    exportedBy?: string;
    source?: string;
    description?: string;
  };
}

/**
 * 卡片事件类型
 */
export enum CardEventType {
  CREATED = 'card_created',
  UPDATED = 'card_updated',
  DELETED = 'card_deleted',
  REVIEWED = 'card_reviewed',
  SUSPENDED = 'card_suspended',
  RESUMED = 'card_resumed',
  MOVED = 'card_moved'
}

/**
 * 卡片事件数据
 */
export interface CardEvent {
  type: CardEventType;
  cardId: string;
  timestamp: string;
  data?: any;
  source?: string;
}

/**
 * 数据存储接口
 */
export interface DataStorage {
  // 卡片操作
  getCard(id: string): Promise<Card | null>;
  getAllCards(): Promise<Card[]>;
  saveCard(card: Card): Promise<void>;
  deleteCard(id: string): Promise<boolean>;
  searchCards(options: CardSearchOptions): Promise<CardSearchResult>;
  
  // 牌组操作
  getDeck(id: string): Promise<Deck | null>;
  getAllDecks(): Promise<Deck[]>;
  saveDeck(deck: Deck): Promise<void>;
  deleteDeck(id: string): Promise<boolean>;
  
  // 查询操作
  getCardsByDeck(deckId: string): Promise<Card[]>;
  getCardsByTemplate(templateId: string): Promise<Card[]>;
  getCardsBySourceFile(filePath: string): Promise<Card[]>;
  getDueCards(deckId?: string): Promise<Card[]>;
  
  // 统计操作
  getCardStatistics(): Promise<CardStatistics>;
  getStudyStatistics(): Promise<StudyStatistics>;
  
  // 导入导出
  exportData(options?: { cardIds?: string[]; deckIds?: string[] }): Promise<CardExportFormat>;
  importData(data: CardExportFormat): Promise<{ cards: number; decks: number }>;
  
  // 事件处理
  on(event: CardEventType, callback: (event: CardEvent) => void): void;
  off(event: CardEventType, callback: (event: CardEvent) => void): void;
  emit(event: CardEvent): void;
}
