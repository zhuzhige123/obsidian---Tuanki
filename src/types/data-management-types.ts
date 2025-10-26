/**
 * 数据管理相关的类型定义
 * 为数据管理界面提供完整的类型支持
 */

// ==================== 核心数据类型 ====================

/**
 * 数据概览信息
 */
export interface DataOverview {
  /** 数据文件夹路径 */
  dataFolderPath: string;
  /** 数据文件夹总大小（字节） */
  totalSize: number;
  /** 牌组数量 */
  totalDecks: number;
  /** 卡片总数 */
  totalCards: number;
  /** 学习会话数量 */
  totalSessions: number;
  /** 最后更新时间 */
  lastUpdated: string;
}

/**
 * 文件夹结构节点
 */
export interface FolderNode {
  /** 节点ID */
  id: string;
  /** 节点名称 */
  name: string;
  /** 节点类型 */
  type: 'folder' | 'file';
  /** 文件大小（字节，仅文件类型有效） */
  size?: number;
  /** 相对路径 */
  path: string;
  /** 子节点 */
  children?: FolderNode[];
  /** 是否展开 */
  expanded?: boolean;
  /** 节点描述 */
  description?: string;
}

/**
 * 文件夹结构
 */
export interface FolderStructure {
  /** 根节点 */
  root: FolderNode;
  /** 总文件数 */
  totalFiles: number;
  /** 总文件夹数 */
  totalFolders: number;
  /** 扫描时间 */
  scannedAt: string;
}

/**
 * 备份信息
 */
export interface BackupInfo {
  /** 备份ID */
  id: string;
  /** 备份时间戳 */
  timestamp: string;
  /** 备份类型 */
  type: BackupType;
  /** 备份大小（字节） */
  size: number;
  /** 备份描述 */
  description?: string;
  /** 备份触发原因 */
  trigger?: BackupTrigger;
  /** 备份文件路径 */
  path: string;
  /** 是否有效 */
  isValid: boolean;
  /** 包含的数据类型 */
  dataTypes: DataType[];
}

// ==================== 枚举类型 ====================

/**
 * 操作类型
 */
export enum OperationType {
  EXPORT = 'export',
  IMPORT = 'import',
  BACKUP = 'backup',
  RESTORE = 'restore',
  RESET = 'reset',
  REFRESH = 'refresh',
  OPEN_FOLDER = 'open_folder',
  DELETE_BACKUP = 'delete_backup'
}

/**
 * 备份类型
 */
export enum BackupType {
  AUTO = 'auto',
  MANUAL = 'manual',
  PRE_OPERATION = 'pre_operation',
  SCHEDULED = 'scheduled'
}

/**
 * 备份触发条件
 */
export enum BackupTrigger {
  STARTUP = 'startup',
  BEFORE_IMPORT = 'before_import',
  BEFORE_RESET = 'before_reset',
  MANUAL_REQUEST = 'manual_request',
  SCHEDULED_TIME = 'scheduled_time',
  CARD_COUNT_THRESHOLD = 'card_count_threshold'
}

/**
 * 数据类型
 */
export enum DataType {
  DECKS = 'decks',
  CARDS = 'cards',
  SESSIONS = 'sessions',
  PROFILE = 'profile',
  TEMPLATES = 'templates',
  SETTINGS = 'settings'
}

/**
 * 操作安全等级
 */
export enum SecurityLevel {
  SAFE = 'safe',
  CAUTION = 'caution',
  DANGER = 'danger'
}

// ==================== 操作结果类型 ====================

/**
 * 基础操作结果
 */
export interface BaseResult {
  /** 操作是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 操作时间戳 */
  timestamp: string;
  /** 操作耗时（毫秒） */
  duration?: number;
}

/**
 * 导出结果
 */
export interface ExportResult extends BaseResult {
  /** 导出文件路径 */
  filePath?: string;
  /** 导出文件大小 */
  fileSize?: number;
  /** 导出的数据类型 */
  dataTypes: DataType[];
  /** 导出的记录数量 */
  recordCount: number;
}

/**
 * 导入结果
 */
export interface ImportResult extends BaseResult {
  /** 导入的记录数量 */
  importedCount: number;
  /** 跳过的记录数量 */
  skippedCount: number;
  /** 冲突的记录数量 */
  conflictCount: number;
  /** 导入的数据类型 */
  dataTypes: DataType[];
  /** 冲突处理详情 */
  conflicts?: ConflictInfo[];
}

/**
 * 备份结果
 */
export interface BackupResult extends BaseResult {
  /** 备份信息 */
  backupInfo?: BackupInfo;
  /** 备份文件夹路径 */
  backupPath?: string;
  /** 清理的旧备份数量 */
  prunedCount?: number;
}

/**
 * 恢复结果
 */
export interface RestoreResult extends BaseResult {
  /** 恢复的文件数量 */
  restoredFileCount: number;
  /** 恢复的数据类型 */
  restoredDataTypes: DataType[];
  /** 恢复前创建的备份ID */
  preRestoreBackupId?: string;
}

/**
 * 重置结果
 */
export interface ResetResult extends BaseResult {
  /** 重置前创建的备份ID */
  backupId?: string;
  /** 清理的数据类型 */
  clearedDataTypes: DataType[];
  /** 清理的记录数量 */
  clearedRecordCount: number;
}

/**
 * 验证结果
 */
export interface ValidationResult extends BaseResult {
  /** 验证的项目数量 */
  validatedCount?: number;
  /** 发现的问题数量 */
  issueCount?: number;
  /** 验证是否通过 */
  passed: boolean;
  /** 验证问题详情 */
  issues?: ValidationIssue[] | string[];
}

/**
 * 清理结果
 */
export interface PruneResult extends BaseResult {
  /** 清理前的备份数量 */
  beforeCount: number;
  /** 清理后的备份数量 */
  afterCount: number;
  /** 清理的备份列表 */
  prunedBackups: string[];
  /** 保留的备份列表 */
  retainedBackups: string[];
}

// ==================== 配置和选项类型 ====================

/**
 * 导出选项
 */
export interface ExportOptions {
  /** 导出的数据类型 */
  dataTypes: DataType[];
  /** 是否包含媒体文件 */
  includeMedia: boolean;
  /** 是否压缩导出文件 */
  compress: boolean;
  /** 导出格式 */
  format: 'json' | 'csv' | 'anki';
  /** 时间范围过滤 */
  dateRange?: {
    start: string;
    end: string;
  };
  /** 牌组过滤 */
  deckIds?: string[];
}

/**
 * 导入选项
 */
export interface ImportOptions {
  /** 冲突处理策略 */
  conflictStrategy: 'skip' | 'overwrite' | 'merge' | 'ask';
  /** 是否创建备份 */
  createBackup: boolean;
  /** 是否验证数据 */
  validateData: boolean;
  /** 批量大小 */
  batchSize: number;
  /** 目标牌组ID */
  targetDeckId?: string;
}

/**
 * 恢复选项
 */
export interface RestoreOptions {
  /** 恢复的数据类型 */
  dataTypes: DataType[];
  /** 是否创建恢复前备份 */
  createPreRestoreBackup: boolean;
  /** 冲突处理策略 */
  conflictStrategy: 'overwrite' | 'merge' | 'ask';
}

// ==================== 错误和冲突类型 ====================

/**
 * 数据管理错误信息
 * 专用于数据管理操作的错误信息
 */
export interface DataManagementErrorInfo {
  /** 错误代码 */
  code: string;
  /** 错误消息 */
  message: string;
  /** 错误详情 */
  details?: string;
  /** 错误堆栈 */
  stack?: string;
  /** 恢复建议 */
  suggestions?: string[];
  /** 错误严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 冲突信息
 */
export interface ConflictInfo {
  /** 冲突ID */
  id: string;
  /** 冲突类型 */
  type: 'duplicate_id' | 'different_content' | 'missing_dependency';
  /** 冲突描述 */
  description: string;
  /** 现有数据 */
  existing: any;
  /** 导入数据 */
  incoming: any;
  /** 建议的解决方案 */
  suggestedResolution: 'skip' | 'overwrite' | 'merge';
}

/**
 * 验证问题
 */
export interface ValidationIssue {
  /** 问题ID */
  id: string;
  /** 问题类型 */
  type: 'missing_file' | 'corrupted_data' | 'invalid_format' | 'broken_reference';
  /** 问题描述 */
  description: string;
  /** 问题严重程度 */
  severity: 'warning' | 'error' | 'critical';
  /** 问题位置 */
  location?: string;
  /** 修复建议 */
  fixSuggestion?: string;
}

// ==================== 进度和状态类型 ====================

/**
 * 操作进度
 */
export interface OperationProgress {
  /** 操作类型 */
  operation: OperationType;
  /** 当前进度（0-100） */
  progress: number;
  /** 当前状态描述 */
  status: string;
  /** 已处理项目数 */
  processedCount: number;
  /** 总项目数 */
  totalCount: number;
  /** 开始时间 */
  startTime: string;
  /** 预计剩余时间（毫秒） */
  estimatedTimeRemaining?: number;
  /** 是否可取消 */
  cancellable: boolean;
}

/**
 * 文件夹大小信息
 */
export interface FolderSizeInfo {
  /** 文件夹路径到大小的映射 */
  folderSizes: Record<string, number>;
  /** 文件路径到大小的映射 */
  fileSizes: Record<string, number>;
  /** 计算时间 */
  calculatedAt: string;
}

/**
 * 备份预览
 */
export interface BackupPreview {
  /** 备份信息 */
  backupInfo: BackupInfo;
  /** 包含的文件列表 */
  files: string[];
  /** 数据统计 */
  statistics: {
    deckCount: number;
    cardCount: number;
    sessionCount: number;
    templateCount: number;
  };
}

// ==================== 扩展类型定义 ====================

/**
 * 数据完整性检查结果
 */
export interface DataIntegrityResult {
  /** 检查是否通过 */
  passed: boolean;
  /** 检查分数 (0-100) */
  score: number;
  /** 发现的问题 */
  issues: ValidationIssue[];
  /** 检查时间戳 */
  timestamp: string;
  /** 检查类型 */
  checkType: 'manual' | 'automatic' | 'periodic';
}

/**
 * 操作确认配置
 */
export interface ConfirmationConfig {
  /** 确认标题 */
  title: string;
  /** 确认消息 */
  message: string;
  /** 安全等级 */
  securityLevel: SecurityLevel;
  /** 是否需要文本确认 */
  requireTextConfirmation: boolean;
  /** 确认短语 */
  confirmationPhrase?: string;
  /** 详细信息 */
  details?: string[];
  /** 警告项目 */
  warningItems?: string[];
}

// ==================== 自动备份配置类型 ====================

/**
 * 自动备份配置
 */
export interface AutoBackupConfig {
  /** 是否启用自动备份 */
  enabled: boolean;
  /** 备份间隔（小时）1-168 */
  intervalHours: number;
  /** 触发条件配置 */
  triggers: {
    /** 启动时备份 */
    onStartup: boolean;
    /** 卡片数量阈值备份 */
    onCardThreshold: boolean;
    /** 阈值数量 */
    cardThresholdCount: number;
  };
  /** 通知配置 */
  notifications: {
    /** 成功通知 */
    onSuccess: boolean;
    /** 失败通知 */
    onFailure: boolean;
  };
  /** 上次自动备份时间 */
  lastAutoBackupTime?: string;
  /** 自动备份总次数 */
  autoBackupCount?: number;
}

/**
 * 自动备份统计信息
 */
export interface AutoBackupStats {
  /** 是否正在运行 */
  isRunning: boolean;
  /** 下次备份时间 */
  nextBackupTime: Date | null;
  /** 上次备份时间 */
  lastBackupTime: string | null;
  /** 自动备份总次数 */
  totalAutoBackups: number;
  /** 配置状态 */
  config: AutoBackupConfig;
}
