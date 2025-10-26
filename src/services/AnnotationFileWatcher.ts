/**
 * Tuanki标注文件监听器
 * 负责实时监听文档变更并检测标注变化
 */

import { TFile, Vault, EventRef } from 'obsidian';
import { TuankiAnnotation, AnnotationEvent, AnnotationEventType } from '../types/annotation-types';
import { AnnotationDetector } from './AnnotationDetector';
import { SyncManager } from './SyncManager';
import { showNotification } from '../utils/notifications';

/**
 * 文件监听选项
 */
export interface FileWatcherOptions {
  /** 防抖延迟（毫秒） */
  debounceDelay?: number;
  /** 是否监听所有文件 */
  watchAllFiles?: boolean;
  /** 监听的文件扩展名 */
  watchedExtensions?: string[];
  /** 排除的文件路径模式 */
  excludePatterns?: RegExp[];
  /** 是否自动同步检测到的标注 */
  autoSync?: boolean;
  /** 最大并发处理数 */
  maxConcurrency?: number;
  /** 仅对活动文件执行自动同步（仅在修改事件触发） */
  onlyActiveFileAutoSync?: boolean;
  /** 初始扫描期间是否允许自动同步（默认禁用） */
  initialScanAutoSync?: boolean;
  /** 获取当前活动文件路径的回调 */
  getActiveFilePath?: () => string | undefined;
}

/**
 * 文件变更记录
 */
interface FileChangeRecord {
  filePath: string;
  lastModified: number;
  lastContent: string;
  lastAnnotationCount: number;
  pendingTimeout?: NodeJS.Timeout;
}

/**
 * 标注变更类型
 */
export enum AnnotationChangeType {
  ADDED = 'added',
  MODIFIED = 'modified',
  REMOVED = 'removed'
}

/**
 * 标注变更事件
 */
export interface AnnotationChangeEvent {
  type: AnnotationChangeType;
  annotation: TuankiAnnotation;
  filePath: string;
  timestamp: string;
}

/**
 * 标注文件监听器类
 */
export class AnnotationFileWatcher {
  private static instance: AnnotationFileWatcher;

  private vault!: Vault; // 通过initialize方法初始化
  private annotationDetector: AnnotationDetector;
  private syncManager: SyncManager;
  private plugin: any; // 🆕 插件实例引用，用于访问settings

  // 监听器配置
  private options: FileWatcherOptions = {
    debounceDelay: 1000,
    watchAllFiles: true,
    watchedExtensions: ['.md'],
    excludePatterns: [/\.obsidian/, /node_modules/],
    autoSync: true,
    maxConcurrency: 3,
    onlyActiveFileAutoSync: true,
    initialScanAutoSync: false,
    getActiveFilePath: undefined
  };

  // 🆕 双向同步引擎（懒加载）
  private bidirectionalSyncEngine: any = null;

  // 文件监听状态
  private isWatching: boolean = false;
  private fileChangeRecords: Map<string, FileChangeRecord> = new Map();

  // Obsidian事件引用
  private eventRefs: EventRef[] = [];

  // 事件监听器
  private changeListeners: Array<(event: AnnotationChangeEvent) => void> = [];
  private eventListeners: Array<(event: AnnotationEvent) => void> = [];

  private constructor() {
    this.annotationDetector = AnnotationDetector.getInstance();
    this.syncManager = SyncManager.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): AnnotationFileWatcher {
    if (!AnnotationFileWatcher.instance) {
      AnnotationFileWatcher.instance = new AnnotationFileWatcher();
    }
    return AnnotationFileWatcher.instance;
  }

  /**
   * 初始化文件监听器
   */
  public initialize(vault: Vault, options?: Partial<FileWatcherOptions> & { plugin?: any }): void {
    this.vault = vault;
    
    // 🆕 设置plugin引用
    if (options?.plugin) {
      this.plugin = options.plugin;
      delete (options as any).plugin;
    }
    
    this.options = { ...this.options, ...options };

    console.log('👁️ [AnnotationFileWatcher] 初始化完成');
  }

  /**
   * 开始监听文件变更
   */
  public startWatching(): void {
    if (this.isWatching) {
      console.warn('文件监听器已在运行');
      return;
    }

    console.log('👁️ [AnnotationFileWatcher] 开始监听文件变更');

    // 监听文件修改事件
    const modifyRef = this.vault.on('modify', (file) => {
      if (file instanceof TFile) {
        this.handleFileModified(file);
      }
    });

    // 监听文件创建事件
    const createRef = this.vault.on('create', (file) => {
      if (file instanceof TFile) {
        this.handleFileCreated(file);
      }
    });

    // 监听文件删除事件
    const deleteRef = this.vault.on('delete', (file) => {
      if (file instanceof TFile) {
        this.handleFileDeleted(file);
      }
    });

    // 监听文件重命名事件
    const renameRef = this.vault.on('rename', async (file, oldPath) => {
      if (file instanceof TFile) {
        await this.handleFileRenamed(file, oldPath);
      }
    });

    this.eventRefs = [modifyRef, createRef, deleteRef, renameRef];
    this.isWatching = true;

    // 初始扫描现有文件
    this.performInitialScan();
  }

  /**
   * 停止监听文件变更
   */
  public stopWatching(): void {
    if (!this.isWatching) {
      return;
    }

    console.log('👁️ [AnnotationFileWatcher] 停止监听文件变更');

    // 清理事件监听器
    this.eventRefs.forEach(ref => {
      this.vault.offref(ref);
    });
    this.eventRefs = [];

    // 清理待处理的超时
    this.fileChangeRecords.forEach(record => {
      if (record.pendingTimeout) {
        clearTimeout(record.pendingTimeout);
      }
    });
    this.fileChangeRecords.clear();

    this.isWatching = false;
  }

  /**
   * 处理文件修改事件
   */
  /**
   * 🆕 处理文件修改（简化版）
   * 不再需要复杂的缓存和抑制逻辑
   */
  private async handleFileModified(file: TFile): Promise<void> {
    if (!this.shouldWatchFile(file)) {
      return;
    }

    // 仅对活动文件自动同步（如果开启）
    if (this.options.onlyActiveFileAutoSync && this.options.getActiveFilePath) {
      const active = this.options.getActiveFilePath();
      if (active && file.path !== active) {
        console.log(`⏭️ [AnnotationFileWatcher] 跳过非活动文件: ${file.path} (当前活动: ${active})`);
        return;
      }
    }

    console.log(`📝 [AnnotationFileWatcher] 文件修改: ${file.path}`);

    // 防抖处理
    const existingRecord = this.fileChangeRecords.get(file.path);
    if (existingRecord?.pendingTimeout) {
      clearTimeout(existingRecord.pendingTimeout);
    }

    const timeout = setTimeout(async () => {
      await this.processFileChange(file, /* suppressAutoSync */ false);
    }, this.options.debounceDelay);

    // 更新记录（仅用于防抖）
    const record: FileChangeRecord = {
      filePath: file.path,
      lastModified: file.stat.mtime,
      lastContent: '',
      lastAnnotationCount: 0,
      pendingTimeout: timeout
    };

    this.fileChangeRecords.set(file.path, record);
  }

  /**
   * 处理文件创建事件
   */
  private async handleFileCreated(file: TFile): Promise<void> {
    if (!this.shouldWatchFile(file)) {
      return;
    }

    console.log(`➕ [AnnotationFileWatcher] 文件创建: ${file.path}`);

    // 延迟处理，等待文件内容稳定；创建事件不触发自动同步
    setTimeout(async () => {
      await this.processFileChange(file, /* suppressAutoSync */ true);
    }, this.options.debounceDelay);
  }

  /**
   * 处理文件删除事件
   */
  private handleFileDeleted(file: TFile): void {
    console.log(`🗑️ [AnnotationFileWatcher] 文件删除: ${file.path}`);

    // 清理记录
    const record = this.fileChangeRecords.get(file.path);
    if (record?.pendingTimeout) {
      clearTimeout(record.pendingTimeout);
    }
    this.fileChangeRecords.delete(file.path);

    // 触发删除事件
    this.emitEvent({
      type: AnnotationEventType.ANNOTATION_PROCESSED,
      data: { action: 'file_deleted', filePath: file.path },
      timestamp: new Date().toISOString(),
      source: 'AnnotationFileWatcher'
    });
  }

  /**
   * 处理文件重命名事件
   */
  private async handleFileRenamed(file: TFile, oldPath: string): Promise<void> {
    console.log(`📝 [AnnotationFileWatcher] 文件重命名: ${oldPath} -> ${file.path}`);

    // 更新记录中的路径
    const record = this.fileChangeRecords.get(oldPath);
    if (record) {
      record.filePath = file.path;
      this.fileChangeRecords.delete(oldPath);
      this.fileChangeRecords.set(file.path, record);
    }

    // 🆕 更新UUID注册表中的文件路径
    try {
      const { UUIDRegistry } = await import('./UUIDRegistry');
      const registry = UUIDRegistry.getInstance();
      registry.updateFilePath(oldPath, file.path);
      console.log(`✅ [AnnotationFileWatcher] UUID注册表已更新`);
    } catch (error) {
      console.error('❌ [AnnotationFileWatcher] 更新UUID注册表失败:', error);
    }
  }

  /**
   * 🆕 处理文件变更（简化版）
   * 不再依赖previousContent对比，直接调用SimpleSyncEngine
   */
  private async processFileChange(file: TFile, suppressAutoSync: boolean = false): Promise<void> {
    try {
      console.log(`🔍 [AnnotationFileWatcher] 处理文件变更: ${file.path}`);

      // 读取文件内容
      const content = await this.vault.read(file);

      // 检测标注
      const annotations = this.annotationDetector.detectAnnotationsInText(content, file.path);
      
      console.log(`📊 [AnnotationFileWatcher] 检测到 ${annotations.length} 个标注`);

      // 🆕 自动同步：直接调用SimpleSyncEngine处理每个标注
      if (this.options.autoSync && !suppressAutoSync) {
        // 若限制仅活动文件，检查当前文件是否为活动文件
        if (this.options.onlyActiveFileAutoSync && this.options.getActiveFilePath) {
          const active = this.options.getActiveFilePath();
          if (active && file.path !== active) {
            console.log(`⏭️ [AnnotationFileWatcher] 跳过非活动文件的自动同步: ${file.path}`);
            return;
          }
        }

        // 🆕 使用SimpleSyncEngine同步每个标注
        const syncEngine = await this.getSimpleSyncEngine();
        
        for (const annotation of annotations) {
          try {
            await syncEngine.smartSync(annotation);
          } catch (error) {
            console.error(`❌ [AnnotationFileWatcher] 同步标注失败:`, error);
          }
        }
      }

    } catch (error) {
      console.error(`❌ [AnnotationFileWatcher] 处理文件变更失败: ${file.path}`, error);
    }
  }

  /**
   * 同步标注
   */
  private async syncAnnotation(annotation: TuankiAnnotation): Promise<void> {
    try {
      console.log(`🔄 [AnnotationFileWatcher] 自动同步标注: ${annotation.id}`);

      await this.syncManager.syncFile(annotation.position.filePath, {
        skipDuplicateCheck: false,
        autoCreateDecks: true
      });

    } catch (error) {
      console.error(`❌ [AnnotationFileWatcher] 自动同步失败:`, error);
    }
  }

  /**
   * 判断是否应该监听文件
   */
  private shouldWatchFile(file: TFile): boolean {
    // 检查文件扩展名
    if (this.options.watchedExtensions && this.options.watchedExtensions.length > 0) {
      const hasValidExtension = this.options.watchedExtensions.some(ext =>
        file.path.endsWith(ext)
      );
      if (!hasValidExtension) {
        return false;
      }
    }

    // 检查排除模式
    if (this.options.excludePatterns) {
      const isExcluded = this.options.excludePatterns.some(pattern =>
        pattern.test(file.path)
      );
      if (isExcluded) {
        return false;
      }
    }

    return true;
  }

  /**
   * 执行初始扫描
   */
  private async performInitialScan(): Promise<void> {
    console.log('🔍 [AnnotationFileWatcher] 执行初始扫描');

    try {
      const markdownFiles = this.vault.getMarkdownFiles();
      const filesToScan = markdownFiles.filter(file => this.shouldWatchFile(file));

      console.log(`📊 [AnnotationFileWatcher] 找到 ${filesToScan.length} 个文件需要扫描`);

      // 批量处理文件
      const batchSize = this.options.maxConcurrency || 3;
      for (let i = 0; i < filesToScan.length; i += batchSize) {
        const batch = filesToScan.slice(i, i + batchSize);
        const promises = batch.map(file => this.processFileChange(file, /* suppressAutoSync during initial scan */ !this.options.initialScanAutoSync));
        await Promise.allSettled(promises);
      }

      console.log('✅ [AnnotationFileWatcher] 初始扫描完成');

    } catch (error) {
      console.error('❌ [AnnotationFileWatcher] 初始扫描失败:', error);
    }
  }

  /**
   * 发射变更事件
   */
  private emitChangeEvent(event: AnnotationChangeEvent): void {
    this.changeListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('变更事件监听器执行失败:', error);
      }
    });
  }

  /**
   * 发射通用事件
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
   * 添加变更监听器
   */
  public addChangeListener(listener: (event: AnnotationChangeEvent) => void): void {
    this.changeListeners.push(listener);
  }

  /**
   * 移除变更监听器
   */
  public removeChangeListener(listener: (event: AnnotationChangeEvent) => void): void {
    const index = this.changeListeners.indexOf(listener);
    if (index > -1) {
      this.changeListeners.splice(index, 1);
    }
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
   * 获取监听状态
   */
  public isWatchingFiles(): boolean {
    return this.isWatching;
  }

  /**
   * 🆕 获取双向同步引擎（懒加载）
   */
  private async getBidirectionalSyncEngine(): Promise<any> {
    if (!this.bidirectionalSyncEngine) {
      try {
        const { BidirectionalSyncEngine } = await import('./BidirectionalSyncEngine');
        this.bidirectionalSyncEngine = BidirectionalSyncEngine.getInstance();
      } catch (error) {
        console.error('❌ [AnnotationFileWatcher] 加载双向同步引擎失败:', error);
        return null;
      }
    }
    return this.bidirectionalSyncEngine;
  }

  /**
   * 🆕 获取SimpleSyncEngine（懒加载）
   */
  private simpleSyncEngine: any = null;

  private async getSimpleSyncEngine(): Promise<any> {
    if (!this.simpleSyncEngine) {
      try {
        const { SimpleSyncEngine } = await import('./SimpleSyncEngine');
        this.simpleSyncEngine = SimpleSyncEngine.getInstance();
        console.log('✅ [AnnotationFileWatcher] SimpleSyncEngine已加载');
      } catch (error) {
        console.error('❌ [AnnotationFileWatcher] 加载SimpleSyncEngine失败:', error);
        return null;
      }
    }
    return this.simpleSyncEngine;
  }

  /**
   * 获取文件变更统计
   */
  public getWatchingStats(): {
    watchedFiles: number;
    totalAnnotations: number;
    lastScanTime?: string;
  } {
    const totalAnnotations = Array.from(this.fileChangeRecords.values())
      .reduce((sum, record) => sum + record.lastAnnotationCount, 0);

    return {
      watchedFiles: this.fileChangeRecords.size,
      totalAnnotations,
      lastScanTime: new Date().toISOString()
    };
  }
}
