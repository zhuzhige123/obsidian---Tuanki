/**
 * Tuanki标注功能核心数据类型定义
 * 支持Obsidian标注自动卡片生成功能
 */

/**
 * 同步状态枚举
 */
export enum SyncStatus {
  IDLE = 'idle',                    // 空闲状态
  DETECTING = 'detecting',          // 检测标注中
  PROCESSING = 'processing',        // 处理标注中
  SYNCING = 'syncing',             // 同步文档中
  COMPLETED = 'completed',          // 处理完成
  ERROR = 'error'                   // 处理错误
}

/**
 * 标注任务类型
 */
export enum AnnotationTaskType {
  CREATE = 'create',                // 创建新卡片
  UPDATE = 'update',                // 更新现有卡片
  DELETE = 'delete',                // 删除卡片
  SYNC = 'sync'                     // 同步元数据
}

/**
 * 标注错误类型
 */
export enum AnnotationErrorType {
  PARSE_ERROR = 'parse_error',              // 解析错误
  DUPLICATE_UUID = 'duplicate_uuid',        // UUID重复
  INVALID_FORMAT = 'invalid_format',        // 格式无效
  DECK_NOT_FOUND = 'deck_not_found',       // 牌组不存在
  TEMPLATE_NOT_FOUND = 'template_not_found', // 模板不存在
  FILE_WRITE_ERROR = 'file_write_error',    // 文件写入错误
  CARD_CREATION_ERROR = 'card_creation_error' // 卡片创建错误
}

/**
 * 标注位置信息
 */
export interface AnnotationPosition {
  /** 文件路径 */
  filePath: string;
  /** 开始行号（从0开始） */
  startLine: number;
  /** 结束行号（从0开始） */
  endLine: number;
  /** 开始字符位置 */
  startChar: number;
  /** 结束字符位置 */
  endChar: number;
  /** 块链接ID */
  blockId?: string;
}

/**
 * 牌组和模板信息
 * 
 * 标注格式：#deck/牌组名
 * 模板由系统根据内容类型自动检测
 */
export interface DeckTemplateInfo {
  /** 牌组名称（从 #deck/牌组名 中提取） */
  deckName?: string;
  /** 牌组ID（解析后） */
  deckId?: string;
  /** 模板ID（由系统自动检测后填充） */
  templateId?: string;
  /** 是否需要创建新牌组 */
  createNewDeck?: boolean;
}

/**
 * 标注元数据
 */
export interface AnnotationMetadata {
  /** 唯一标识符 */
  uuid?: string;
  /** 创建时间 */
  created?: string;
  /** 修改时间 */
  modified?: string;
  /** 版本号 */
  version?: number;
  /** 块链接ID */
  blockId?: string;
  /** 内容哈希（用于检测变更） */
  contentHash?: string;
}

/**
 * Tuanki标注核心接口
 */
export interface TuankiAnnotation {
  /** 标注ID */
  id: string;
  /** 标注位置信息 */
  position: AnnotationPosition;
  /** 原始标注内容 */
  rawContent: string;
  /** 解析后的卡片内容 */
  cardContent: string;
  /** 牌组和模板信息 */
  deckTemplate: DeckTemplateInfo;
  /** 元数据信息 */
  metadata: AnnotationMetadata;
  /** 检测时间 */
  detectedAt: string;
  /** 最后处理时间 */
  lastProcessed?: string;
  /** 是否已处理 */
  isProcessed: boolean;
  /** 关联的卡片ID */
  cardId?: string;
}

/**
 * 标注处理任务
 */
export interface AnnotationTask {
  /** 任务ID */
  id: string;
  /** 任务类型 */
  type: AnnotationTaskType;
  /** 关联的标注 */
  annotation: TuankiAnnotation;
  /** 任务优先级（1-10，数字越大优先级越高） */
  priority: number;
  /** 重试次数 */
  retryCount: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 任务状态 */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** 创建时间 */
  createdAt: string;
  /** 开始处理时间 */
  startedAt?: string;
  /** 完成时间 */
  completedAt?: string;
  /** 错误信息 */
  error?: AnnotationError;
}

/**
 * 标注错误信息
 */
export interface AnnotationError {
  /** 错误类型 */
  type: AnnotationErrorType;
  /** 错误消息 */
  message: string;
  /** 错误详情 */
  details?: string;
  /** 发生时间 */
  timestamp: string;
  /** 关联的标注ID */
  annotationId?: string;
  /** 错误堆栈 */
  stack?: string;
  /** 是否可恢复 */
  recoverable: boolean;
}

/**
 * 标注系统状态
 */
export interface AnnotationSystemState {
  /** 当前状态 */
  status: SyncStatus;
  /** 是否正在处理 */
  isProcessing: boolean;
  /** 检测到的标注列表 */
  detectedAnnotations: TuankiAnnotation[];
  /** 处理队列 */
  processingQueue: AnnotationTask[];
  /** 已完成的任务 */
  completedTasks: AnnotationTask[];
  /** 错误日志 */
  errorLog: AnnotationError[];
  /** 统计信息 */
  stats: {
    totalDetected: number;
    totalProcessed: number;
    totalErrors: number;
    successRate: number;
  };
}

/**
 * 标注配置选项
 */
export interface AnnotationConfig {
  /** 是否启用自动检测 */
  autoDetectionEnabled: boolean;
  /** 检测间隔（毫秒） */
  detectionInterval: number;
  /** 是否自动创建牌组 */
  autoCreateDecks: boolean;
  /** 默认牌组ID */
  defaultDeckId: string;
  /** 默认模板ID */
  defaultTemplateId: string;
  /** 是否显示处理通知 */
  showNotifications: boolean;
  /** 最大并发处理数 */
  maxConcurrentTasks: number;
  /** 文件监听防抖延迟（毫秒） */
  debounceDelay: number;
  /** 是否启用调试模式 */
  debugMode: boolean;
  /** 🆕 是否仅对当前活动文件执行自动同步 */
  onlyActiveFileAutoSync: boolean;
}

/**
 * 内容提取结果
 */
export interface ContentExtractionResult {
  /** 是否成功 */
  success: boolean;
  /** 提取的内容 */
  content?: string;
  /** 牌组模板信息 */
  deckTemplate?: DeckTemplateInfo;
  /** 现有元数据 */
  existingMetadata?: AnnotationMetadata;
  /** 错误信息 */
  error?: string;
  /** 警告信息 */
  warnings?: string[];
}

/**
 * 文档修改结果
 */
export interface DocumentModificationResult {
  /** 是否成功 */
  success: boolean;
  /** 修改的行数 */
  modifiedLines?: number;
  /** 插入的元数据 */
  insertedMetadata?: AnnotationMetadata;
  /** 错误信息 */
  error?: string;
  /** 修改前的内容（用于撤销） */
  originalContent?: string;
}

/**
 * 批量处理结果
 */
export interface BatchProcessingResult {
  /** 总处理数量 */
  totalProcessed: number;
  /** 成功数量 */
  successCount: number;
  /** 失败数量 */
  failureCount: number;
  /** 跳过数量 */
  skippedCount: number;
  /** 处理详情 */
  results: Array<{
    annotationId: string;
    success: boolean;
    cardId?: string;
    error?: string;
  }>;
  /** 处理耗时（毫秒） */
  processingTime: number;
}

/**
 * 标注事件类型
 */
export enum AnnotationEventType {
  ANNOTATION_DETECTED = 'annotation_detected',
  ANNOTATION_PROCESSED = 'annotation_processed',
  CARD_CREATED = 'card_created',
  DOCUMENT_MODIFIED = 'document_modified',
  ERROR_OCCURRED = 'error_occurred',
  BATCH_COMPLETED = 'batch_completed'
}

/**
 * 标注事件数据
 */
export interface AnnotationEvent {
  /** 事件类型 */
  type: AnnotationEventType;
  /** 事件数据 */
  data: any;
  /** 事件时间 */
  timestamp: string;
  /** 事件来源 */
  source: string;
}
