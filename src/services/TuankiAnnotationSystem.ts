/**
 * Tuanki标注系统主控制器
 * 协调各个组件的工作流程，提供统一的API接口
 */

import { Plugin, TFile, Vault } from 'obsidian';
import {
  TuankiAnnotation,
  AnnotationSystemState,
  AnnotationConfig,
  SyncStatus,
  BatchProcessingResult,
  AnnotationEvent,
  AnnotationEventType
} from '../types/annotation-types';

import { AnnotationDetector } from './AnnotationDetector';
import { ContentExtractor } from './ContentExtractor';
import { MetadataGenerator } from './MetadataGenerator';
import { CardCreationBridge } from './CardCreationBridge';
import { DocumentModifier } from './DocumentModifier';
import { SyncManager } from './SyncManager';
import { AnnotationFileWatcher, AnnotationChangeEvent } from './AnnotationFileWatcher';
import { performanceProfiler, measurePerformance } from '../utils/AnnotationPerformanceProfiler';
import { uxOptimizer } from '../utils/AnnotationUXOptimizer';

/**
 * 系统初始化选项
 */
export interface SystemInitOptions {
  /** 插件实例 */
  plugin: Plugin;
  /** 文件系统 */
  vault: Vault;
  /** 数据存储服务 */
  dataStorage: any;
  /** 牌组服务 */
  deckService: any;
  /** 模板服务 */
  templateService: any;
  /** FSRS算法服务 */
  fsrs: any;
  /** 初始配置 */
  config?: Partial<AnnotationConfig>;
}

/**
 * API响应结果
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Tuanki标注系统主控制器类
 */
export class TuankiAnnotationSystem {
  private static instance: TuankiAnnotationSystem;

  // 核心组件
  private annotationDetector: AnnotationDetector;
  private contentExtractor: ContentExtractor;
  private metadataGenerator: MetadataGenerator;
  private cardCreationBridge: CardCreationBridge;
  private documentModifier: DocumentModifier;
  private syncManager: SyncManager;
  private fileWatcher: AnnotationFileWatcher;

  // 系统状态
  private systemState: AnnotationSystemState = {
    status: SyncStatus.IDLE,
    isProcessing: false,
    detectedAnnotations: [],
    processingQueue: [],
    completedTasks: [],
    errorLog: [],
    stats: {
      totalDetected: 0,
      totalProcessed: 0,
      totalErrors: 0,
      successRate: 0
    }
  };

  // 配置
  private config: AnnotationConfig = {
    autoDetectionEnabled: true,
    detectionInterval: 1000,
    autoCreateDecks: true,
    defaultDeckId: '',
    defaultTemplateId: '',
    showNotifications: true,
    maxConcurrentTasks: 3,
    debounceDelay: 1000,
    debugMode: false
  };

  // 系统依赖
  private plugin: Plugin;
  private vault: Vault;
  private isInitialized: boolean = false;

  // 事件监听器
  private eventListeners: Array<(event: AnnotationEvent) => void> = [];

  private constructor() {
    this.annotationDetector = AnnotationDetector.getInstance();
    this.contentExtractor = ContentExtractor.getInstance();
    this.metadataGenerator = MetadataGenerator.getInstance();
    this.cardCreationBridge = CardCreationBridge.getInstance();
    this.documentModifier = DocumentModifier.getInstance();
    this.syncManager = SyncManager.getInstance();
    this.fileWatcher = AnnotationFileWatcher.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): TuankiAnnotationSystem {
    if (!TuankiAnnotationSystem.instance) {
      TuankiAnnotationSystem.instance = new TuankiAnnotationSystem();
    }
    return TuankiAnnotationSystem.instance;
  }

  /**
   * 初始化系统
   */
  public async initialize(options: SystemInitOptions): Promise<ApiResponse<void>> {
    const startTime = Date.now();

    try {
      console.log('🚀 [TuankiAnnotationSystem] 开始初始化系统');

      // 启用性能分析和UX优化（如果启用调试模式）
      if (options.config?.debugMode) {
        performanceProfiler.enable();
        uxOptimizer.enable();
        console.log('📊 [TuankiAnnotationSystem] 性能分析和UX优化已启用');
      }

      // 保存依赖
      this.plugin = options.plugin;
      this.vault = options.vault;

      // 更新配置
      if (options.config) {
        this.config = { ...this.config, ...options.config };
      }

      // 初始化各个组件
      this.documentModifier.initialize(this.vault);
      this.fileWatcher.initialize(this.vault, {
        debounceDelay: this.config.debounceDelay,
        autoSync: this.config.autoDetectionEnabled,
        maxConcurrency: this.config.maxConcurrentTasks,
        onlyActiveFileAutoSync: this.config.onlyActiveFileAutoSync,
        initialScanAutoSync: false,
        getActiveFilePath: () => this.plugin.app.workspace.getActiveFile()?.path,
        plugin: options.plugin // 🆕 传递plugin实例
      });

      // 为同步管理器注入 Vault 以读取文件内容
      this.syncManager.setVault(this.vault);


      // 注入服务依赖
      this.cardCreationBridge.injectServices({
        dataStorage: options.dataStorage,
        deckService: options.deckService,
        templateService: options.templateService,
        fsrs: options.fsrs
      });

      // 🆕 初始化SimpleSyncEngine
      const { SimpleSyncEngine } = await import('./SimpleSyncEngine');
      const simpleSyncEngine = SimpleSyncEngine.getInstance();
      simpleSyncEngine.initialize({
        dataStorage: options.dataStorage,
        cardCreationBridge: this.cardCreationBridge,
        vault: this.vault  // 🆕 传递vault以支持多源标注同步
      });
      console.log('✅ [TuankiAnnotationSystem] SimpleSyncEngine初始化完成');

      // 设置事件监听
      this.setupEventListeners();

      // 启动文件监听（如果启用）
      if (this.config.autoDetectionEnabled) {
        this.fileWatcher.startWatching();
      }

      this.isInitialized = true;
      this.updateSystemState({ status: SyncStatus.IDLE });

      const duration = Date.now() - startTime;
      uxOptimizer.recordInteraction('system_initialize', duration, true, {
        componentsCount: 7,
        autoDetectionEnabled: this.config.autoDetectionEnabled,
        debugMode: this.config.debugMode
      });

      console.log('✅ [TuankiAnnotationSystem] 系统初始化完成');

      return {
        success: true,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      uxOptimizer.recordInteraction('system_initialize', duration, false, {}, error.message);

      console.error('❌ [TuankiAnnotationSystem] 系统初始化失败:', error);

      return {
        success: false,
        error: `系统初始化失败: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 销毁系统
   */
  public async destroy(): Promise<void> {
    console.log('🔄 [TuankiAnnotationSystem] 开始销毁系统');

    try {
      // 停止文件监听
      this.fileWatcher.stopWatching();

      // 清理各组件缓存
      this.annotationDetector.clearCache();
      this.metadataGenerator.clearCache();
      this.syncManager.clearCache();
      this.documentModifier.cleanup();

      // 清理事件监听器
      this.eventListeners.length = 0;

      // 重置状态
      this.systemState = {
        status: SyncStatus.IDLE,
        isProcessing: false,
        detectedAnnotations: [],
        processingQueue: [],
        completedTasks: [],
        errorLog: [],
        stats: {
          totalDetected: 0,
          totalProcessed: 0,
          totalErrors: 0,
          successRate: 0
        }
      };

      this.isInitialized = false;

      console.log('✅ [TuankiAnnotationSystem] 系统销毁完成');

    } catch (error) {
      console.error('❌ [TuankiAnnotationSystem] 系统销毁失败:', error);
    }
  }

  /**
   * 检测文件中的标注
   */
  @measurePerformance('detectAnnotations')
  public async detectAnnotations(filePath: string): Promise<ApiResponse<TuankiAnnotation[]>> {
    try {
      if (!this.isInitialized) {
        throw new Error('系统未初始化');
      }

      console.log(`🔍 [TuankiAnnotationSystem] 检测标注: ${filePath}`);

      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        throw new Error(`文件不存在: ${filePath}`);
      }

      const content = await this.vault.read(file);
      const annotations = this.annotationDetector.detectAnnotationsInText(content, filePath);

      // 更新系统状态
      this.updateSystemState({
        detectedAnnotations: [...this.systemState.detectedAnnotations, ...annotations],
        stats: {
          ...this.systemState.stats,
          totalDetected: this.systemState.stats.totalDetected + annotations.length
        }
      });

      console.log(`✅ [TuankiAnnotationSystem] 检测完成: 找到 ${annotations.length} 个标注`);

      return {
        success: true,
        data: annotations,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ [TuankiAnnotationSystem] 标注检测失败:', error);

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 同步文件标注
   */
  public async syncFile(filePath: string, options?: {
    forceSync?: boolean;
    autoCreateDecks?: boolean;
  }): Promise<ApiResponse<BatchProcessingResult>> {
    try {
      if (!this.isInitialized) {
        throw new Error('系统未初始化');
      }

      console.log(`🔄 [TuankiAnnotationSystem] 同步文件: ${filePath}`);

      this.updateSystemState({
        status: SyncStatus.PROCESSING,
        isProcessing: true
      });

      const result = await this.syncManager.syncFile(filePath, {
        forceSync: options?.forceSync,
        autoCreateDecks: options?.autoCreateDecks ?? this.config.autoCreateDecks,
        defaultDeckId: this.config.defaultDeckId,
        defaultTemplateId: this.config.defaultTemplateId,
        maxConcurrency: this.config.maxConcurrentTasks
      });

      // 更新统计信息
      this.updateSystemState({
        status: SyncStatus.COMPLETED,
        isProcessing: false,
        stats: {
          ...this.systemState.stats,
          totalProcessed: this.systemState.stats.totalProcessed + result.successCount,
          totalErrors: this.systemState.stats.totalErrors + result.failureCount,
          successRate: this.calculateSuccessRate()
        }
      });

      // 发射事件
      this.emitEvent({
        type: AnnotationEventType.BATCH_COMPLETED,
        data: result,
        timestamp: new Date().toISOString(),
        source: 'TuankiAnnotationSystem'
      });

      console.log(`✅ [TuankiAnnotationSystem] 文件同步完成: ${JSON.stringify(result)}`);

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ [TuankiAnnotationSystem] 文件同步失败:', error);

      this.updateSystemState({
        status: SyncStatus.ERROR,
        isProcessing: false
      });

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 批量同步多个文件
   */
  public async syncMultipleFiles(filePaths: string[]): Promise<ApiResponse<BatchProcessingResult>> {
    try {
      if (!this.isInitialized) {
        throw new Error('系统未初始化');
      }

      console.log(`🔄 [TuankiAnnotationSystem] 批量同步: ${filePaths.length} 个文件`);

      this.updateSystemState({
        status: SyncStatus.PROCESSING,
        isProcessing: true
      });

      const result = await this.syncManager.syncMultipleFiles(filePaths, {
        autoCreateDecks: this.config.autoCreateDecks,
        defaultDeckId: this.config.defaultDeckId,
        defaultTemplateId: this.config.defaultTemplateId,
        maxConcurrency: this.config.maxConcurrentTasks
      });

      // 更新统计信息
      this.updateSystemState({
        status: SyncStatus.COMPLETED,
        isProcessing: false,
        stats: {
          ...this.systemState.stats,
          totalProcessed: this.systemState.stats.totalProcessed + result.successCount,
          totalErrors: this.systemState.stats.totalErrors + result.failureCount,
          successRate: this.calculateSuccessRate()
        }
      });

      console.log(`✅ [TuankiAnnotationSystem] 批量同步完成: ${JSON.stringify(result)}`);

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ [TuankiAnnotationSystem] 批量同步失败:', error);

      this.updateSystemState({
        status: SyncStatus.ERROR,
        isProcessing: false
      });

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 获取系统状态
   */
  public getSystemState(): AnnotationSystemState {
    return { ...this.systemState };
  }

  /**
   * 获取系统配置
   */
  public getConfig(): AnnotationConfig {
    return { ...this.config };
  }

  /**
   * 更新系统配置
   */
  public updateConfig(updates: Partial<AnnotationConfig>): void {
    this.config = { ...this.config, ...updates };

    // 应用配置变更
    if (updates.autoDetectionEnabled !== undefined) {
      if (updates.autoDetectionEnabled && !this.fileWatcher.isWatchingFiles()) {
        this.fileWatcher.startWatching();
      } else if (!updates.autoDetectionEnabled && this.fileWatcher.isWatchingFiles()) {
        this.fileWatcher.stopWatching();
      }
    }

    console.log('⚙️ [TuankiAnnotationSystem] 配置已更新');
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    // 监听文件变更事件
    this.fileWatcher.addChangeListener((event: AnnotationChangeEvent) => {
      console.log(`📝 [TuankiAnnotationSystem] 标注变更: ${event.type} - ${event.annotation.id}`);

      this.emitEvent({
        type: AnnotationEventType.ANNOTATION_DETECTED,
        data: event,
        timestamp: new Date().toISOString(),
        source: 'AnnotationFileWatcher'
      });
    });

    // 监听同步状态变更
    this.syncManager.addStatusListener((status) => {
      this.updateSystemState({
        status: status.status,
        isProcessing: status.status === SyncStatus.PROCESSING
      });
    });
  }

  /**
   * 更新系统状态
   */
  private updateSystemState(updates: Partial<AnnotationSystemState>): void {
    this.systemState = { ...this.systemState, ...updates };
  }

  /**
   * 计算成功率
   */
  private calculateSuccessRate(): number {
    const total = this.systemState.stats.totalProcessed + this.systemState.stats.totalErrors;
    return total > 0 ? (this.systemState.stats.totalProcessed / total) * 100 : 0;
  }

  /**
   * 发射事件
   */
  private emitEvent(event: AnnotationEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('事件监听器执行失败:', error);
      }
    });
  }

  /**
   * 添加事件监听器
   */
  public addEventListener(listener: (event: AnnotationEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * 移除事件监听器
   */
  public removeEventListener(listener: (event: AnnotationEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * 获取系统健康状态
   */
  public getHealthStatus(): {
    isHealthy: boolean;
    issues: string[];
    uptime: number;
  } {
    const issues: string[] = [];

    if (!this.isInitialized) {
      issues.push('系统未初始化');
    }

    if (this.systemState.stats.successRate < 80 && this.systemState.stats.totalProcessed > 10) {
      issues.push('成功率过低');
    }

    if (this.systemState.errorLog.length > 100) {
      issues.push('错误日志过多');
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      uptime: Date.now() // 简化的运行时间
    };
  }
}
