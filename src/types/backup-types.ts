/**
 * 备份系统类型定义
 * 
 * 定义统一备份架构所需的所有类型接口
 */

import type { Card } from '../data/types';

/**
 * 备份层级
 */
export enum BackupLevel {
  CARD = 'card',        // 卡片级：单张卡片快照
  DECK = 'deck',        // 牌组级：整个牌组备份
  GLOBAL = 'global'     // 全局级：所有数据备份
}

/**
 * 备份触发原因
 */
export enum BackupTrigger {
  AUTO_IMPORT = 'auto_import',      // 导入前自动备份
  AUTO_SYNC = 'auto_sync',          // 同步前自动备份
  MANUAL = 'manual',                // 用户手动备份
  SCHEDULED = 'scheduled',          // 定时备份
  PRE_UPDATE = 'pre_update'         // 大版本更新前备份
}

/**
 * 备份类型
 */
export enum BackupType {
  FULL = 'full',                    // 完整备份
  INCREMENTAL = 'incremental'       // 增量备份
}

/**
 * 压缩类型
 */
export enum CompressionType {
  NONE = 'none',                    // 不压缩
  GZIP = 'gzip'                     // Gzip 压缩
}

/**
 * 备份元数据
 */
export interface BackupMetadata {
  id: string;
  timestamp: number;
  level: BackupLevel;
  trigger: BackupTrigger;
  
  // 设备信息
  deviceId: string;
  deviceName: string;
  
  // 版本信息
  obsidianVersion: string;
  pluginVersion: string;
  vaultName: string;
  
  // 内容摘要
  summary: {
    deckId?: string;
    deckName?: string;
    cardCount: number;
    modifiedCards?: number;  // 增量备份的变更数
  };
  
  // 文件信息
  storagePath: string;
  size: number;
  originalSize?: number;
  compressed: boolean;
  compressionType: CompressionType;
  compressionRatio?: number;
  encrypted: boolean;
  type: BackupType;
  baseBackupId?: string;  // 增量备份的基础备份
  
  // 健康状态
  isHealthy: boolean;
  verificationHash?: string;  // 数据完整性校验
  
  // 可删除性评估
  canDelete: boolean;
  deleteReason?: string;
  
  // 标签和描述
  tags: string[];
  description?: string;
  userNotes?: string;  // 用户添加的备注
}

/**
 * 备份数据结构
 */
export interface BackupData {
  info: {
    id: string;
    timestamp: string;
    deckId: string;
    deckName: string;
    cardCount: number;
    reason: 'import' | 'manual';
  };
  cards: Card[];
}

/**
 * 设备感知备份
 */
export interface DeviceAwareBackup {
  id: string;
  metadata: BackupMetadata;
  data: any;
  relativePaths?: any;  // 设备无关的相对路径
}

/**
 * 压缩后的备份
 */
export interface CompressedBackup {
  type: CompressionType;
  data: Uint8Array | string;
  size: number;
  originalSize?: number;
  compressionRatio?: number;
}

/**
 * 增量备份数据
 */
export interface IncrementalBackup {
  type: 'incremental';
  baseBackupId: string;
  data: Uint8Array;
  size: number;
  metadata: {
    type: 'incremental';
    baseBackupId: string;
    timestamp: number;
    changes: {
      added: Card[];
      modified: Card[];
      deleted: string[];  // 删除的卡片ID
    };
    cardCount: {
      total: number;
      changed: number;
    };
  };
}

/**
 * 加密备份
 */
export interface EncryptedBackup {
  version: number;
  algorithm: string;
  salt: number[];
  iv: number[];
  data: number[];
  timestamp: number;
}

/**
 * 备份创建选项
 */
export interface BackupOptions {
  level: BackupLevel;
  trigger: BackupTrigger;
  data: any;
  targetId?: string;  // card.id 或 deck.id
  reason?: string;
  encrypt?: boolean;
  password?: string;
}

/**
 * 备份创建结果
 */
export interface BackupResult {
  success: boolean;
  backupId: string;
  filePath: string;
  deviceId?: string;
  metadata?: BackupMetadata;
  error?: string;
}

/**
 * 备份恢复结果
 */
export interface RestoreResult {
  success: boolean;
  restoredItems?: number;
  error?: string;
}

/**
 * 设备备份信息
 */
export interface DeviceBackupInfo {
  deviceId: string;
  deviceName: string;
  backupCount: number;
  latestBackup: number;
  totalSize: number;
  isCurrent: boolean;
}

/**
 * 可删除性评估
 */
export interface DeleteAssessment {
  canDelete: boolean;
  reason: string;
  confidence?: 'low' | 'medium' | 'high';
  recommendDelete?: boolean;
  dependentBackups?: string[];
}

/**
 * 清理项
 */
export interface BackupCleanupItem {
  backupId: string;
  metadata: BackupMetadata;
  assessment: DeleteAssessment;
  potentialSavings: number;
  selected?: boolean;
}

/**
 * 清理建议
 */
export interface CleanupRecommendation {
  totalBackups: number;
  totalSize: number;
  recommendedDeletions: BackupCleanupItem[];
  potentialSavings: number;
  savingsPercentage: number;
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  failedCount?: number;
  message: string;
}

/**
 * 恢复上下文
 */
export interface RecoveryContext {
  type: 'import_failure' | 'data_corruption' | 'user_request';
  failureTime?: number;
  affectedDeckId?: string;
}

/**
 * 恢复建议
 */
export interface RecoverySuggestion {
  canRecover: boolean;
  suggestedBackup?: BackupMetadata;
  message: string;
  alternativeBackups?: BackupMetadata[];
}

/**
 * 备份索引数据
 */
export interface BackupIndexData {
  version: number;
  lastUpdated: number;
  backups: Record<string, BackupMetadata>;
  devices: Record<string, {
    deviceId: string;
    deviceName: string;
    lastSeen: number;
    backupCount: number;
  }>;
}


