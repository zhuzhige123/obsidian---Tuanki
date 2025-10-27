/**
 * Tuanki同步管理器
 * 负责处理增量更新和重复检测
 */

import { TuankiAnnotation, SyncStatus, AnnotationTask, AnnotationTaskType, BatchProcessingResult } from '../types/annotation-types';
import { AnnotationDetector } from './AnnotationDetector';
import { ContentExtractor } from './ContentExtractor';
import { MetadataGenerator } from './MetadataGenerator';
import { CardCreationBridge } from './CardCreationBridge';
import { DocumentModifier } from './DocumentModifier';
import { Vault, TFile } from 'obsidian';
import { showNotification } from '../utils/notifications';

/**
 * 同步选项
 */
export interface SyncOptions {
  /** 是否强制同步所有标注 */
  forceSync?: boolean;
  /** 是否跳过重复检查 */
  skipDuplicateCheck?: boolean;
  /** 最大并发处理数 */
  maxConcurrency?: number;
  /** 是否自动创建牌组 */
  autoCreateDecks?: boolean;
  /** 默认牌组ID */
  defaultDeckId?: string;
  /** 默认模板ID */
  defaultTemplateId?: string;
}

/**
 * 同步状态信息
 */
export interface SyncStatusInfo {
  status: SyncStatus;
  currentFile?: string;
  processedCount: number;
  totalCount: number;
  errorCount: number;
  startTime?: string;
  estimatedTimeRemaining?: number;
}

/**
 * 重复检测结果
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingAnnotation?: TuankiAnnotation;
  conflictReason?: string;
  canMerge?: boolean;
}

/**
 * 同步管理器类
 */
export class SyncManager {
  private static instance: SyncManager;

  // 依赖服务
  private annotationDetector: AnnotationDetector;
  private contentExtractor: ContentExtractor;
  private metadataGenerator: MetadataGenerator;
  private cardCreationBridge: CardCreationBridge;
  private documentModifier: DocumentModifier;

  // 文件读取依赖（由系统初始化时注入）
  private vault: Vault | null = null;
  public setVault(v: Vault) {
    this.vault = v;
  }


  // 状态管理
  private currentStatus: SyncStatus = SyncStatus.IDLE;
  private syncStatusInfo: SyncStatusInfo = {
    status: SyncStatus.IDLE,
    processedCount: 0,
    totalCount: 0,
    errorCount: 0
  };

  // 任务队列
  private taskQueue: AnnotationTask[] = [];
  private processingTasks: Set<string> = new Set();

  // 重复检测缓存
  private duplicateCache: Map<string, TuankiAnnotation> = new Map();

  // 事件监听器
  private statusListeners: Array<(status: SyncStatusInfo) => void> = [];

  private constructor() {
    this.annotationDetector = AnnotationDetector.getInstance();
    this.contentExtractor = ContentExtractor.getInstance();
    this.metadataGenerator = MetadataGenerator.getInstance();
    this.cardCreationBridge = CardCreationBridge.getInstance();
    this.documentModifier = DocumentModifier.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  /**
   * 同步单个文件的标注
   */
  public async syncFile(filePath: string, options: SyncOptions = {}): Promise<BatchProcessingResult> {
    console.log(`🔄 [SyncManager] 开始同步文件: ${filePath}`);

    this.updateStatus(SyncStatus.DETECTING, { currentFile: filePath });

    try {
      // 1. 检测文件中的标注
      const fileContent = await this.readFileContent(filePath);
      const detectedAnnotations = this.annotationDetector.detectAnnotationsInText(fileContent, filePath);

      console.log(`🔍 [SyncManager] 检测到 ${detectedAnnotations.length} 个标注`);

      // 2. 过滤和去重
      const filteredAnnotations = await this.filterAnnotations(detectedAnnotations, options);

      // 3. 批量处理
      const result = await this.batchProcessAnnotations(filteredAnnotations, options);

      this.updateStatus(SyncStatus.COMPLETED);

      console.log(`✅ [SyncManager] 文件同步完成: 成功=${result.successCount}, 失败=${result.failureCount}`);

      // 🆕 批量同步汇总通知
      if (result.successCount > 0) {
        showNotification(`✅ 成功创建 ${result.successCount} 张卡片`, 'success');
      }

      return result;

    } catch (error) {
      console.error(`❌ [SyncManager] 文件同步失败:`, error);
      this.updateStatus(SyncStatus.ERROR);

      return {
        totalProcessed: 0,
        successCount: 0,
        failureCount: 1,
        skippedCount: 0,
        results: [{
          annotationId: 'unknown',
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }],
        processingTime: 0
      };
    }
  }

  /**
   * 同步多个文件
   */
  public async syncMultipleFiles(filePaths: string[], options: SyncOptions = {}): Promise<BatchProcessingResult> {
    console.log(`🔄 [SyncManager] 开始批量同步: ${filePaths.length} 个文件`);

    const startTime = Date.now();
    let totalResult: BatchProcessingResult = {
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
      results: [],
      processingTime: 0
    };

    this.updateStatus(SyncStatus.PROCESSING, {
      totalCount: filePaths.length,
      processedCount: 0
    });

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];

      try {
        const fileResult = await this.syncFile(filePath, options);

        // 合并结果
        totalResult.totalProcessed += fileResult.totalProcessed;
        totalResult.successCount += fileResult.successCount;
        totalResult.failureCount += fileResult.failureCount;
        totalResult.skippedCount += fileResult.skippedCount;
        totalResult.results.push(...fileResult.results);

        // 更新进度
        this.updateStatus(SyncStatus.PROCESSING, {
          processedCount: i + 1,
          totalCount: filePaths.length
        });

      } catch (error) {
        console.error(`文件同步失败: ${filePath}`, error);
        totalResult.failureCount++;
      }
    }

    totalResult.processingTime = Date.now() - startTime;
    this.updateStatus(SyncStatus.COMPLETED);

    console.log(`✅ [SyncManager] 批量同步完成: ${JSON.stringify(totalResult)}`);

    return totalResult;
  }

  /**
   * 过滤标注（去重和验证）
   */
  private async filterAnnotations(annotations: TuankiAnnotation[], options: SyncOptions): Promise<TuankiAnnotation[]> {
    const filtered: TuankiAnnotation[] = [];

    for (const annotation of annotations) {
      // 跳过重复检查
      if (options.skipDuplicateCheck) {
        filtered.push(annotation);
        continue;
      }

      // 检查重复
      const duplicateCheck = await this.checkDuplicate(annotation);
      if (duplicateCheck.isDuplicate && !options.forceSync) {
        console.log(`⏭️ [SyncManager] 跳过重复标注: ${annotation.id}`);
        continue;
      }

      // 验证标注内容
      if (this.validateAnnotation(annotation)) {
        filtered.push(annotation);
      } else {
        console.warn(`⚠️ [SyncManager] 标注验证失败: ${annotation.id}`);
      }
    }

    return filtered;
  }

  /**
   * 批量处理标注
   */
  private async batchProcessAnnotations(annotations: TuankiAnnotation[], options: SyncOptions): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const results: BatchProcessingResult['results'] = [];
    const maxConcurrency = options.maxConcurrency || 3;

    // 分批处理
    const batches = this.chunkArray(annotations, maxConcurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(annotation => this.processAnnotation(annotation, options));
      const batchResults = await Promise.allSettled(batchPromises);

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const annotation = batch[i];

        if (result.status === 'fulfilled') {
          results.push({
            annotationId: annotation.id,
            success: result.value.success,
            cardId: result.value.cardId,
            error: result.value.error
          });
        } else {
          results.push({
            annotationId: annotation.id,
            success: false,
            error: result.reason?.message || '处理失败'
          });
        }
      }
    }

    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return {
      totalProcessed: results.length,
      successCount,
      failureCount,
      skippedCount: 0,
      results,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * 处理单个标注
   */
  private async processAnnotation(annotation: TuankiAnnotation, options: SyncOptions): Promise<{
    success: boolean;
    cardId?: string;
    error?: string;
  }> {
    // 基于文件+起始行+blockId/uuid 的一次性并发防抖键，避免同一标注短时间内被并发处理两次
    const inflightKey = `${annotation.position.filePath}:${annotation.position.startLine}:${annotation.metadata.blockId || ''}:${annotation.metadata.uuid || ''}`;
    if (this.processingTasks.has(inflightKey)) {
      console.warn(`⏭️ [SyncManager] 跳过重复中的标注处理: ${inflightKey}`);
      return { success: false, error: '重复处理已在进行中' };
    }
    this.processingTasks.add(inflightKey);

    try {
      console.log(`🔄 [SyncManager] 处理标注: ${annotation.id}`);

      // 1. 创建卡片
      const cardResult = await this.cardCreationBridge.createCardFromAnnotation(annotation, {
        autoCreateDeck: options.autoCreateDecks,
        defaultDeckId: options.defaultDeckId,
        defaultTemplateId: options.defaultTemplateId
      });

      if (!cardResult.success) {
        return {
          success: false,
          error: cardResult.error?.message || '卡片创建失败'
        };
      }

      // 文档回写功能已停用（按用户要求移除双向同步）；跳过写回，直接更新缓存
      this.updateDuplicateCache(annotation);

      console.log(`✅ [SyncManager] 标注处理完成: ${annotation.id}`);

      return {
        success: true,
        cardId: cardResult.card?.id
      };
    } catch (error) {
      console.error(`❌ [SyncManager] 标注处理失败: ${annotation.id}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.processingTasks.delete(inflightKey);
    }
  }

  /**
   * 检查重复标注
   */
  private async checkDuplicate(annotation: TuankiAnnotation): Promise<DuplicateCheckResult> {
    // 检查UUID重复
    if (annotation.metadata.uuid) {
      const existing = this.duplicateCache.get(annotation.metadata.uuid);
      if (existing) {
        return {
          isDuplicate: true,
          existingAnnotation: existing,
          conflictReason: 'UUID重复',
          canMerge: false
        };
      }
    }

    // 检查内容哈希重复
    if (annotation.metadata.contentHash) {
      for (const [uuid, existingAnnotation] of this.duplicateCache) {
        if (existingAnnotation.metadata.contentHash === annotation.metadata.contentHash &&
            existingAnnotation.position.filePath === annotation.position.filePath) {
          return {
            isDuplicate: true,
            existingAnnotation,
            conflictReason: '内容重复',
            canMerge: true
          };
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * 验证标注
   */
  private validateAnnotation(annotation: TuankiAnnotation): boolean {
    // 检查必要字段
    if (!annotation.id || !annotation.cardContent || !annotation.position) {
      return false;
    }

    // 检查内容长度
    if (annotation.cardContent.trim().length < 5) {
      return false;
    }

    // 检查文件路径
    if (!annotation.position.filePath) {
      return false;
    }

    return true;
  }

  /**
   * 更新重复检测缓存
   */
  private updateDuplicateCache(annotation: TuankiAnnotation): void {
    if (annotation.metadata.uuid) {
      this.duplicateCache.set(annotation.metadata.uuid, annotation);
    }
  }

  /**
   * 更新同步状态
   */
  private updateStatus(status: SyncStatus, updates?: Partial<SyncStatusInfo>): void {
    this.currentStatus = status;
    this.syncStatusInfo = {
      ...this.syncStatusInfo,
      status,
      ...updates
    };

    // 通知监听器
    this.statusListeners.forEach(listener => {
      try {
        listener(this.syncStatusInfo);
      } catch (error) {
        console.error('状态监听器执行失败:', error);
      }
    });
  }

  /**
   * 添加状态监听器
   */
  public addStatusListener(listener: (status: SyncStatusInfo) => void): void {
    this.statusListeners.push(listener);
  }

  /**
   * 移除状态监听器
   */
  public removeStatusListener(listener: (status: SyncStatusInfo) => void): void {
    const index = this.statusListeners.indexOf(listener);
    if (index > -1) {
      this.statusListeners.splice(index, 1);
    }
  }

  /**
   * 获取当前状态
   */
  public getCurrentStatus(): SyncStatusInfo {
    return { ...this.syncStatusInfo };
  }

  /**
   * 清理缓存
   */
  public clearCache(): void {
    this.duplicateCache.clear();
    this.taskQueue.length = 0;
    this.processingTasks.clear();
    console.log('🧹 [SyncManager] 缓存已清理');
  }

  /**
   * 工具方法：分割数组
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 工具方法：读取文件内容
   */
  private async readFileContent(filePath: string): Promise<string> {
    if (!this.vault) throw new Error('Vault not set in SyncManager');
    const file = this.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      return await this.vault.read(file);
    }
    throw new Error(`文件不存在或不是可读取文件: ${filePath}`);
  }
}
