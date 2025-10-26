// Anki Plugin Data Types
// 定义所有数据结构，包括牌组、卡片和FSRS学习数据

// 🆕 v0.8: 导入关系系统类型
import type { CardRelationMetadata } from '../services/relation/types';

// ===== 标注块双向绑定接口 (v0.7) =====

/**
 * 标注源信息
 * 记录卡片关联的标注块位置，用于双向同步
 */
export interface AnnotationSource {
  /** 文档路径 */
  filePath: string;
  /** Obsidian块ID */
  blockId: string;
  /** 最后同步时间 (ISO 8601) */
  lastSync?: string;
  /** 行范围（起始行，结束行） */
  lineRange?: [number, number];
}

// ===== FSRS算法参数 =====

export interface FSRSParameters {
  // FSRS6算法参数 (21个权重参数)
  w: number[];          // 权重参数 (FSRS6标准为21个参数)
  requestRetention: number;  // 目标记忆率 (0.5-0.99)
  maximumInterval: number;   // 最大间隔天数
  enableFuzz: boolean;       // 是否启用随机化
}

export interface FSRSCard {
  // FSRS6卡片状态
  due: string;            // 下次复习时间 (ISO 8601 string)
  stability: number;      // 稳定性
  difficulty: number;     // 难度 (1-10)
  elapsedDays: number;    // 已经过天数
  scheduledDays: number;  // 预定天数
  reps: number;           // 复习次数
  lapses: number;         // 遗忘次数
  state: CardState;       // 卡片状态
  lastReview?: string;    // 上次复习时间 (ISO 8601 string)
  retrievability: number; // 可提取性 (0-1)

  // FSRS6兼容性字段 (可选，用于向后兼容)
  reviewHistory?: ReviewLog[]; // 完整复习历史
}

export enum CardState {
  New = 0,        // 新卡片
  Learning = 1,   // 学习中
  Review = 2,     // 复习
  Relearning = 3  // 重新学习
}

export enum Rating {
  Again = 1,    // 再次学习
  Hard = 2,     // 困难
  Good = 3,     // 良好
  Easy = 4      // 简单
}

export interface ReviewLog {
  // 复习记录
  rating: Rating;
  state: CardState;
  due: string; // (ISO 8601 string)
  stability: number;
  difficulty: number;
  elapsedDays: number;
  lastElapsedDays: number;
  scheduledDays: number;
  review: string; // (ISO 8601 string)
}

// ===== 选择题统计接口 =====

/**
 * 选择题答题历史记录
 */
export interface ChoiceAttempt {
  timestamp: string;              // 答题时间 (ISO 8601)
  selectedOptions: string[];      // 用户选择的选项标签 (如 ['A', 'C'])
  correctOptions: string[];       // 正确答案标签
  correct: boolean;               // 是否回答正确
  responseTime: number;           // 反应时间（毫秒）
}

/**
 * 选择题专用统计数据
 */
export interface ChoiceQuestionStats {
  totalAttempts: number;          // 总尝试次数
  correctAttempts: number;        // 正确次数
  accuracy: number;               // 正确率 (0-1)
  averageResponseTime: number;    // 平均反应时间（毫秒）
  
  // 历史记录（最近10次）
  recentAttempts: ChoiceAttempt[];
  
  // 错题集标记
  isInErrorBook: boolean;         // 是否在错题集中
  errorCount: number;             // 累计错误次数
  lastErrorDate?: string;         // 最后一次错误时间 (ISO 8601)
}

export interface Card {
  // ===== 基础标识 =====
  id: string;
  uuid: string;                       // 全局唯一标识符，用于Anki同步（必选）
  deckId: string;
  templateId: string;                 // 关联的字段模板ID
  type: CardType;                     // 卡片类型
  
  // 🆕 父子卡片关系（v0.8）
  parentCardId?: string;              // 父卡片UUID（子卡片填写，用于建立层级关系）
  
  // ===== 内容存储（双层架构）=====
  // content: 用户编辑的原始Markdown内容（包含语义标记、分隔符等）
  // fields: 从content解析出的结构化字段（用于Anki同步和内部处理）
  content: string;                    // 原始Markdown内容（包含语义标记）- 用户编辑层
  fields?: Record<string, string>;    // 解析后的结构化字段（用于Anki同步）- 数据存储层
  
  // ===== 语义标记系统元数据 =====
  // 从content中解析出的额外字段信息（hint、explanation等）
  parsedMetadata?: import('../types/metadata-types').CardMetadata;
  
  // ===== Obsidian溯源信息 =====
  sourceFile?: string;                // 源文档路径（新增：直接字段）
  sourceBlock?: string;               // 块引用ID（如 ^block-abc123）
  sourceRange?: SourceRange;          // 精确位置（新增）
  sourceExists?: boolean;             // 源文档是否仍存在（新增）
  sourceDocumentExists?: boolean;     // 保留用于向后兼容
  
  // 🆕 文档引用 (v0.6预留 - 保留用于复杂场景)
  documentRef?: DocumentReference;
  
  // 🆕 标注块双向绑定 (v0.7)
  annotationSources?: AnnotationSource[];  // 关联的标注块位置列表
  
  // ===== FSRS学习数据 =====
  fsrs: FSRSCard;
  reviewHistory: ReviewLog[];
  
  // ===== 统计信息 =====
  stats: {
    totalReviews: number;
    totalTime: number;                // 总学习时间(秒)
    averageTime: number;              // 平均时间
    memoryRate: number;               // 记忆成功率
    predictionAccuracy?: number;      // 预测准确性
    stabilityTrend?: number;          // 稳定性趋势
    difficultyTrend?: number;         // 难度趋势
    
    // 🆕 通用错题追踪（适用于所有题型）
    errorTracking?: {
      isInErrorBook: boolean;         // 是否在错题集中
      errorCount: number;              // 累计错误次数
      correctCount: number;            // 累计正确次数
      accuracy: number;                // 正确率 (0-1)
      lastErrorDate?: string;          // 最后一次错误时间 (ISO 8601)
      errorLevel?: 'light' | 'medium' | 'severe';  // 错题等级
    };
    
    // 选择题专用统计（仅选择题类型有效）
    choiceStats?: ChoiceQuestionStats;
  };
  
  // ===== FSRS6个性化数据 =====
  personalization?: {
    personalizedWeights?: number[];   // 个性化权重
    learningPattern?: string;         // 学习模式识别
    optimalInterval?: number;         // 最优间隔
    confidenceLevel?: number;         // 置信水平
  };
  
  
  // ===== 标注相关 =====
  annotation?: {
    blockId: string;                  // 标注块ID
    lastSyncTime?: string;
  };
  
  // ===== 时间戳 =====
  created: string;                    // 创建时间 (ISO 8601 string)
  modified: string;                   // 修改时间 (ISO 8601 string)
  
  // ===== 标签和优先级 =====
  tags?: string[];                    // 标签
  priority?: number;                  // 优先级 (1-4)
  
  // ===== 来源标识 =====
  source?: 'tuanki' | 'anki' | 'apkg' | 'incremental';  // 卡片创建来源
  
  // ===== 内部扩展数据 =====
  _internal?: {
    parsingContext?: {
      originalText: string;
      parsingMethod: 'direct' | 'regex' | 'semantic';
      templateUsed?: string;
      confidence: number;
      lossDetected: boolean;
      lossDetails?: string[];
      timestamp: string;
    };
  };
  
  // ===== 扩展字段 =====
  customFields?: {
    ankiOriginal?: {
      noteId: number;
      modelId: number;
      modelName: string;
      fields: Record<string, string>;
      tags: string[];
    };
    [key: string]: unknown;
  };
  
  // ===== 元数据 =====
  metadata?: {
    fieldSideMap?: Record<string, 'front' | 'back' | 'both'>;
    ankiModel?: {
      id: number;
      name: string;
      fields: string[];
    };
    
    // 🆕 卡片关系元数据（v0.8）
    cardRelation?: CardRelationMetadata;
    
    [key: string]: unknown;
  };
  
  // 保留旧的incrementalData用于向后兼容
  incrementalData?: IncrementalReadingData;
}

export enum CardType {
  Basic = "basic",           // 基础问答卡片
  Cloze = "cloze",          // 挖空卡片
  Multiple = "multiple",     // 多选卡片
  Code = "code"              // 代码卡片
}

/**
 * 牌组类型
 * - mixed: 混合题型（默认），可以添加所有类型的卡片
 * - choice-only: 选择题专用，只能添加选择题类型的卡片
 * - video-course: 视频课程，用于学习视频课程，自动显示视频目录
 */
export type DeckType = 'mixed' | 'choice-only' | 'video-course';

/**
 * 牌组分类（用于彩色圆点过滤）
 */
export interface DeckCategory {
  id: string;
  name: string;
  colorStart: string;      // 渐变色起始
  colorEnd: string;        // 渐变色结束
  order: number;           // 显示顺序
  isDefault: boolean;      // 是否为默认分类
  created: string;
  modified: string;
}

/**
 * 默认分类
 */
export const DEFAULT_CATEGORIES: DeckCategory[] = [
  {
    id: 'basic',
    name: '基础',
    colorStart: '#ef4444',
    colorEnd: '#dc2626',
    order: 0,
    isDefault: true,
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: 'reading',
    name: '阅读',
    colorStart: '#3b82f6',
    colorEnd: '#2563eb',
    order: 1,
    isDefault: true,
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: 'interest',
    name: '兴趣',
    colorStart: '#f59e0b',
    colorEnd: '#d97706',
    order: 2,
    isDefault: true,
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  }
];

export interface Deck {
  // ===== 基础信息 =====
  id: string;
  name: string;
  description: string;
  category: string;                   // 分类标签（已弃用，保留向后兼容）
  categoryIds?: string[];             // 新的多分类支持
  
  // ===== 层级结构（新增）=====
  parentId?: string;                  // 父牌组ID
  path: string;                       // 层级路径（如"语言学习::英语::词汇"）
  level: number;                      // 层级深度（0=根牌组）
  order: number;                      // 同级排序
  
  // ===== 设置继承（新增）=====
  inheritSettings: boolean;           // 是否继承父牌组设置
  settings: DeckSettings;
  
  // ===== 统计信息（增强）=====
  stats: DeckStats;
  includeSubdecks: boolean;           // 统计是否包含子牌组
  
  // ===== 视觉元素（新增）=====
  icon?: string;                      // emoji图标
  color?: string;                     // 颜色标记
  
  // ===== 牌组类型（新增）=====
  deckType?: DeckType;                // 牌组类型，默认为mixed
  
  // ===== 时间戳 =====
  created: string;                    // (ISO 8601 string)
  modified: string;                   // (ISO 8601 string)
  
  // ===== 标签和元数据 =====
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface DeckSettings {
  // 牌组学习设置
  newCardsPerDay: number;       // 每日新卡片数
  maxReviewsPerDay: number;     // 每日最大复习数
  enableAutoAdvance: boolean;   // 自动进入下一张
  showAnswerTime: number;       // 显示答案时间(秒)
  
  // FSRS参数
  fsrsParams: FSRSParameters;
  
  // 学习模式
  learningSteps: number[];      // 学习步骤(分钟)
  relearningSteps: number[];    // 重学步骤
  graduatingInterval: number;   // 毕业间隔(天)
  easyInterval: number;         // 简单间隔(天)
}

export interface DeckStats {
  // 牌组统计
  totalCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
  
  // 今日统计
  todayNew: number;
  todayReview: number;
  todayTime: number;
  
  // 总体统计
  totalReviews: number;
  totalTime: number;
  memoryRate: number;           // 整体记忆率
  averageEase: number;          // 平均难度
  
  // 未来预测
  forecastDays: Record<string, number>; // 未来几天的复习数量
}

// StudySession 已在 study-types.ts 中定义

export interface UserProfile {
  // 用户配置
  id: string;
  name: string;
  created: string; // (ISO 8601 string)
  
  // 全局设置
  globalSettings: {
    timezone: string;
    language: string;
    theme: "light" | "dark" | "auto";
    
    // 学习偏好
    defaultDeckSettings: DeckSettings;
    enableNotifications: boolean;
    enableSounds: boolean;
    
    // 高级设置
    enableDebugMode: boolean;
    dataBackupInterval: number; // 备份间隔(小时)
  };
  
  // 统计总览
  overallStats: {
    totalDecks: number;
    totalCards: number;
    totalStudyTime: number;
    streakDays: number;
    lastStudyDate?: string; // (ISO 8601 string)
  };
}

// 数据导入/导出格式
export interface AnkiExportData {
  version: string;
  exportDate: string; // (ISO 8601 string)
  decks: Deck[];
  cards: Card[];
  userProfile: UserProfile;
}

// API响应类型
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string; // (ISO 8601 string)
}

// 数据库查询接口
export interface DataQuery {
  deckId?: string;
  cardIds?: string[];
  state?: CardState;
  dueDate?: {
    from?: string; // (ISO 8601 string)
    to?: string; // (ISO 8601 string)
  };
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ===== 源位置范围类型（新增）=====
export interface SourceRange {
  start: { line: number; ch: number };
  end: { line: number; ch: number };
}

// 🆕 文档引用接口 (v0.6预留)
export interface DocumentReference {
  // 文档路径
  path: string;
  
  // 文档片段位置
  position?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  
  // 块引用ID
  blockId?: string;
}

// 🆕 渐进式阅读数据接口（完整版）
export interface IncrementalReadingData {
  // 文档标识
  sourceFile: string;                 // Obsidian文档路径
  documentTitle: string;
  
  // 阅读进度
  progress: number;                   // 0-100
  currentPosition: {
    paragraph: number;
    scrollPercent: number;
  };
  
  // 提取片段
  extracts: IncrementalExtract[];
  
  // 阅读计划
  priority: number;                   // 1-10
  targetCompletionDate?: string;
  estimatedReadingTime?: number;      // 分钟
  
  // 时间追踪
  totalReadingTime: number;           // 总阅读时间（秒）
  lastRead: string;
  readingSessions: ReadingSession[];
  
  // 状态
  status: 'active' | 'paused' | 'completed' | 'archived';
  
  // 元数据
  category?: string;
  tags?: string[];
  relatedCards?: string[];            // 已生成的卡片IDs
  
  // 兼容旧版本
  position?: {
    paragraph: number;
    sentence: number;
  };
}

// 渐进式阅读提取片段
export interface IncrementalExtract {
  id: string;
  content: string;
  sourceRange: SourceRange;
  importance: 1 | 2 | 3 | 4 | 5;
  timestamp: string;
  converted: boolean;                 // 是否已转为卡片
  cardId?: string;
  notes?: string;                     // 用户备注
}

// 阅读会话
export interface ReadingSession {
  start: string;
  end: string;
  duration: number;                   // 秒
  progressBefore: number;
  progressAfter: number;
}

// 渐进式阅读文档
export interface IncrementalDocument {
  id: string;
  reading: IncrementalReadingData;
  created: string;
  modified: string;
}

// 🆕 导入映射接口
export interface ImportMapping {
  // 映射ID (uuid)
  id: string;
  
  // Tuanki卡片ID
  tuankiCardId: string;
  
  // Anki Note ID
  ankiNoteId: number;
  
  // 全局UUID（跨平台追踪）
  uuid: string;
  
  // 最后同步时间
  lastSyncTime: string; // ISO 8601 string
  
  // Tuanki侧最后修改时间
  lastModifiedInTuanki: string; // ISO 8601 string
  
  // Anki侧最后修改时间
  lastModifiedInAnki: string; // ISO 8601 string
  
  // 同步版本号
  syncVersion: number;
  
  // 内容指纹（用于快速检测变更）
  contentHash: string;
  
  // Anki模型信息
  ankiModelId?: number;
  ankiModelName?: string;
  
  // 同步状态
  syncStatus?: 'synced' | 'tuanki_modified' | 'anki_modified';
}

// 🆕 错题等级类型
export type ErrorLevel = 'light' | 'medium' | 'severe';

// ===== 媒体管理相关类型（新增）=====

// 媒体文件
export interface MediaFile {
  id: string;
  filename: string;
  
  // 存储路径（按牌组路径组织）
  deckPath: string;                   // "语言学习::英语::词汇"
  storagePath: string;                // "语言学习/英语/词汇/image1.jpg"
  
  // 文件信息
  hash: string;                       // SHA256（去重）
  size: number;
  mimeType: string;
  
  // 引用追踪
  usedByCards: string[];              // 使用此媒体的卡片IDs
  
  // 时间戳
  created: string;
  lastAccessed: string;
}

// 媒体索引（每个牌组一个）
export interface MediaIndex {
  deckPath: string;
  files: MediaFile[];
  lastUpdated: string;
}
