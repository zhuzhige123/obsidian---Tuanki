/**
 * 设置界面相关的类型定义
 * 消除 any 类型，提供严格的类型安全
 */

import type AnkiPlugin from "../../../main";
import type { SimplifiedParsingSettings } from "../../../types/newCardParsingTypes";

// 基础设置接口扩展
export interface EditorSettings {
  linkStyle?: 'wikilink' | 'markdown';
  linkPath?: 'short' | 'relative' | 'absolute';
  preferAlias?: boolean;
  attachmentDir?: string;
  embedImages?: boolean;
}

export interface SettingsWithEditor {
  editor?: EditorSettings;
  enableDebugMode?: boolean;
  dataFolder?: string;
  backupRetentionCount?: number;
  // ⚠️ 已废弃：使用 autoBackupConfig 替代
  dataBackupIntervalHours?: number;
  autoBackup?: boolean;
  // 🆕 自动备份配置
  autoBackupConfig?: import('../../../types/data-management-types').AutoBackupConfig;
  fsrsParams: FSRSParameters;
  license: LicenseInfo;
  annotation?: AnnotationSettings;
  // 简化卡片解析设置
  simplifiedParsing?: SimplifiedParsingSettings;
  // 导航显示设置
  showReviewButton?: boolean;
  showBrowseButton?: boolean;
  showStatsButton?: boolean;
  showSyncButton?: boolean;
  showSettingsButton?: boolean;
  // 导航项显示控制
  navigationVisibility?: {
    deckStudy?: boolean;
    cardManagement?: boolean;
    aiAssistant?: boolean;
    statistics?: boolean;
  };
  // 编辑器模态窗尺寸设置
  editorModalSize?: {
    preset?: 'small' | 'medium' | 'large' | 'extra-large' | 'custom';
    customWidth?: number;
    customHeight?: number;
    rememberLastSize?: boolean;
    enableResize?: boolean;
  };
  // AnkiConnect 同步设置
  ankiConnect?: AnkiConnectSettings;
  // 🎯 FSRS6个性化优化设置
  enablePersonalization?: boolean; // 启用个性化算法优化
  personalizationSettings?: PersonalizationSettings;
}

// FSRS6个性化优化设置
export interface PersonalizationSettings {
  enabled: boolean; // 总开关
  minDataPoints: number; // 最小数据点要求（默认50）
  enableBacktracking: boolean; // 启用回溯策略
  checkpointInterval: number; // 检查点间隔（默认50次复习）
  performanceThreshold: number; // 性能下降阈值（默认10%）
  autoOptimization: boolean; // 自动优化（无需用户干预）
}

// FSRS6 参数类型
export interface FSRSParameters {
  w: number[]; // 21个权重参数 (w0-w20)
  requestRetention: number;
  maximumInterval: number;
  enableFuzz?: boolean;
  version?: string; // FSRS版本标识
}

// 标注功能设置类型
export interface AnnotationSettings {
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
  /** 🆕 是否启用双向同步（v0.7） */
  bidirectionalSyncEnabled?: boolean;
}

// 许可证信息类型
export interface LicenseInfo {
  activationCode: string;
  isActivated: boolean;
  activatedAt: string;
  expiresAt?: string;
  licenseType?: 'trial' | 'standard' | 'premium' | 'lifetime' | 'subscription';
  productVersion?: string;
}

// 插件扩展接口 - 数据管理相关接口已清理，等待重构
// TODO: 重构后将创建新的DataManagementService接口

// 临时保留的接口，用于过渡期间的类型检查
export interface SettingsTabInterface {
  // 数据管理方法已移除
}

export interface DataStorageInterface {
  dataFolder?: string;
  createBackup?: () => Promise<string>;
  exportData?: () => Promise<any>;
  importData?: (data: any) => Promise<any>;
  rebuildStatesFromLogs?: () => Promise<void>;
}

export interface PluginExtended extends AnkiPlugin {
  settingsTab?: SettingsTabInterface;
  dataStorage?: DataStorageInterface;
  settings: SettingsWithEditor;
}

// 许可证状态类型
export interface LicenseStatus {
  status: 'active' | 'inactive' | 'expired' | 'trial';
  text: string;
  color: string;
  icon: string;
}

// 激活码验证结果类型
export interface ActivationValidation {
  isValid: boolean;
  isComplete: boolean;
  warnings: string[];
  errors: string[];
}

// 通知类型
export interface NotificationOptions {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

// 窗口扩展接口（用于 Notice）
export interface WindowWithNotice extends Window {
  Notice?: new (message: string, duration?: number) => void;
}

// 标签页定义
export interface SettingsTab {
  id: string;
  label: string;
}



// 错误处理类型
export interface ErrorContext {
  operation: string;
  component: string;
  timestamp: number;
}

export interface ErrorResult {
  success: boolean;
  error?: string;
  data?: any;
}

// 备份相关类型
export interface BackupInfo {
  folder: string;
  timestamp: number;
  files: string[];
}

export interface RestoreResult {
  success: boolean;
  restoredFiles: number;
  errors: string[];
}

// 表单验证类型
export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean;
}

export interface FieldValidation {
  field: string;
  rules: ValidationRule[];
  message: string;
}

// 设置更新事件类型
export interface SettingsUpdateEvent {
  section: string;
  field: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
}

// AnkiConnect 同步设置类型
export interface AnkiConnectSettings {
  // 连接配置
  enabled: boolean;
  endpoint: string;
  apiKey?: string;
  
  // 媒体同步配置
  mediaSync: {
    enabled: boolean;
    largeFileThresholdMB: number;
    supportedTypes: string[];
    createBacklinks: boolean;
  };
  
  // 自动同步配置
  autoSync: {
    enabled: boolean;
    intervalMinutes: number;
    syncOnStartup: boolean;
    onlyWhenAnkiRunning: boolean;
    maxCardsPerSync?: number;
    prioritizeRecent: boolean;
    enableFileWatcher?: boolean;  // 启用文件变更检测同步
  };
  
  // 增量同步状态（由 IncrementalSyncTracker 管理）
  incrementalSyncState?: import('../../../services/ankiconnect/IncrementalSyncTracker').IncrementalSyncState;
  
  // 牌组映射
  deckMappings: Record<string, DeckSyncMapping>;
  
  // 模板映射
  templateMappings: Record<string, TemplateSyncMapping>;
  
  // 同步日志
  syncLogs: SyncLogEntry[];
  maxLogEntries: number;
  
  // 🆕 导入映射现在存储在独立文件 importMappings.json
  // syncMetadata 已移除，由 ImportMappingManager 管理
  
  // 备份数据
  backups?: Record<string, BackupData>;
  
  // 教程状态
  tutorialCompleted: boolean;
  tutorialStep: number;
  
  // UI 状态缓存
  uiCache?: {
    ankiDecks: import('../../types/ankiconnect-types').AnkiDeckInfo[];
    ankiModels: import('../../types/ankiconnect-types').AnkiModelInfo[];
    lastFetchTime: string;
    lastConnectionStatus?: import('../../types/ankiconnect-types').ConnectionStatus;
  };
  
  // 快速操作配置
  quickActions?: {
    showInCommandPalette: boolean;
    enableKeyboardShortcuts: boolean;
  };
}

// 牌组同步映射
export interface DeckSyncMapping {
  tuankiDeckId: string;
  tuankiDeckName: string;
  ankiDeckName: string;
  syncDirection: 'to_anki' | 'from_anki';
  enabled: boolean;
  lastSyncTime?: string;
}

// 模板同步映射
export interface TemplateSyncMapping {
  tuankiTemplateId: string;
  tuankiTemplateName: string;
  ankiModelName: string;
  fieldMappings: Record<string, string>;
  lastSyncTime?: string;
}

// 同步日志条目
export interface SyncLogEntry {
  id: string;
  timestamp: string;
  direction: 'to_anki' | 'from_anki';
  summary: {
    totalCards: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
  };
  duration: number;
  errors?: string[];
  details?: SyncItemDetail[];
}

// 同步项详情
export interface SyncItemDetail {
  cardId: string;
  cardTitle: string;
  status: 'success' | 'failed' | 'skipped';
  reason?: string;
}

// 卡片同步元数据
export interface CardSyncMetadata {
  cardId: string;
  uuid: string;
  lastSyncTime: string;
  lastModifiedInTuanki: string;
  lastModifiedInAnki?: string;
  syncVersion: number;
  contentHash: string;
  mediaHash?: string;
  ankiNoteId?: number;
}

// 导出所有类型
export type {
  AnkiPlugin,
  SettingsWithEditor as Settings
};
