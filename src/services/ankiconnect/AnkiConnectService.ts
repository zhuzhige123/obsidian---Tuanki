/**
 * AnkiConnect 主服务
 * 协调所有 AnkiConnect 相关功能的核心服务
 */

import type { App } from 'obsidian';
import type { Card, Deck } from '../../data/types';
import type { ParseTemplate } from '../../types/newCardParsingTypes';
import type {
  AnkiConnectSettings,
  SyncLogEntry,
  DeckSyncMapping,
  CardSyncMetadata
} from '../../components/settings/types/settings-types';
import type {
  ConnectionStatus,
  SyncProgress,
  AnkiDeckInfo,
  AnkiModelInfo,
  AnkiNote
} from '../../types/ankiconnect-types';

import { AnkiConnectClient } from './AnkiConnectClient';
import { SyncStateTracker } from './SyncStateTracker';
import { TemplateAutoIdentifier } from './TemplateAutoIdentifier';
import { MediaSyncService } from './MediaSyncService';
// TODO: ConflictResolver 功能暂未实现，临时注释
// import { ConflictResolver, type ConflictInfo } from './ConflictResolver';
import { ConnectionErrorType, AnkiConnectError, SyncStatus } from '../../types/ankiconnect-types';
import { AnkiTemplateConverter } from './AnkiTemplateConverter';
import { TuankiTemplateExporter } from './TuankiTemplateExporter';
import { CardImporter } from './CardImporter';
import { CardExporter } from './CardExporter';
import { TemplateManager } from './TemplateManager';
import { ConnectionManager } from './ConnectionManager';
import { IncrementalSyncTracker } from './IncrementalSyncTracker';
import { AutoSyncScheduler } from './AutoSyncScheduler';
import type { IncrementalSyncResult, ConnectionState } from '../../types/ankiconnect-types';
import type AnkiPlugin from '../../main';

export class AnkiConnectService {
  private client: AnkiConnectClient;
  private stateTracker: SyncStateTracker;
  private templateIdentifier: TemplateAutoIdentifier;
  private mediaService: MediaSyncService;
  // TODO: ConflictResolver 功能暂未实现
  // private conflictResolver: ConflictResolver;
  
  // 新增：模板和卡片管理服务
  private templateConverter: AnkiTemplateConverter;
  private templateExporter: TuankiTemplateExporter;
  private cardImporter: CardImporter;
  private cardExporter: CardExporter;
  private templateManager: TemplateManager;
  
  // 🆕 连接管理和自动同步服务
  private connectionManager: ConnectionManager;
  private incrementalTracker: IncrementalSyncTracker;
  private autoSyncScheduler: AutoSyncScheduler | null = null;

  private connectionStatus: ConnectionStatus = {
    isConnected: false,
    lastCheckTime: new Date().toISOString()
  };

  private syncProgress: SyncProgress = {
    status: SyncStatus.IDLE,
    current: 0,
    total: 0,
    percentage: 0
  };

  constructor(
    private plugin: AnkiPlugin,
    private app: App,
    private settings: AnkiConnectSettings
  ) {
    this.client = new AnkiConnectClient(settings.endpoint);
    this.stateTracker = new SyncStateTracker({});
    this.templateIdentifier = new TemplateAutoIdentifier();
    this.mediaService = new MediaSyncService(app, this.client, settings.mediaSync);
    // TODO: ConflictResolver 功能暂未实现
    // this.conflictResolver = new ConflictResolver(settings.bidirectionalSync.conflictResolution);
    
    // 初始化新服务
    this.templateConverter = new AnkiTemplateConverter(plugin);
    this.templateExporter = new TuankiTemplateExporter(plugin, this.client);
    this.cardImporter = new CardImporter(plugin, this.client, this.templateConverter);
    this.cardExporter = new CardExporter(plugin, this.client, this.templateExporter);
    this.templateManager = new TemplateManager(plugin);
    
    // 🆕 初始化连接管理和自动同步服务
    this.connectionManager = new ConnectionManager(this.client);
    this.incrementalTracker = new IncrementalSyncTracker(plugin);
    
    // 监听连接状态变化
    this.connectionManager.onStateChange((state) => {
      this.connectionStatus = {
        isConnected: state.status === 'connected',
        lastCheckTime: new Date(state.lastHeartbeat).toISOString(),
        error: state.error ? {
          type: ConnectionErrorType.UNKNOWN,
          message: state.error,
          suggestion: '请检查 Anki 是否正在运行'
        } : undefined
      };
    });
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<ConnectionStatus> {
    try {
      const version = await this.client.getVersion();
      
      this.connectionStatus = {
        isConnected: true,
        lastCheckTime: new Date().toISOString(),
        apiVersion: version,
        ankiVersion: version.toString()
      };
    } catch (error: any) {
      this.connectionStatus = {
        isConnected: false,
        lastCheckTime: new Date().toISOString(),
        error: {
          type: error.type || ConnectionErrorType.UNKNOWN,
          message: error.message,
          suggestion: error.suggestion || '请检查 Anki 是否正在运行'
        }
      };
    }

    return this.connectionStatus;
  }

  /**
   * 获取 Anki 牌组列表
   */
  async getAnkiDecks(): Promise<AnkiDeckInfo[]> {
    const deckNames = await this.client.getDeckNames();
    const decks: AnkiDeckInfo[] = [];

    for (const name of deckNames) {
      try {
        const stats = await this.client.getDeckStats(name);
        decks.push(stats);
      } catch {
        // 获取统计失败，添加基本信息
        decks.push({
          id: 0,
          name,
          cardCount: 0,
          newCount: 0,
          learnCount: 0,
          reviewCount: 0
        });
      }
    }

    return decks;
  }

  /**
   * 获取 Anki 模型列表（优化版）
   * 
   * 优化点：
   * 1. 并发控制（最多3个并发）
   * 2. 错误容忍（单个失败不影响整体）
   * 3. 进度回调
   */
  async getAnkiModels(
    onProgress?: (current: number, total: number) => void
  ): Promise<AnkiModelInfo[]> {
    const modelNames = await this.client.getModelNames();
    const models: AnkiModelInfo[] = [];
    const errors: Array<{ name: string; error: string }> = [];
    
    const concurrencyLimit = 3; // 并发限制
    
    for (let i = 0; i < modelNames.length; i += concurrencyLimit) {
      const batch = modelNames.slice(i, i + concurrencyLimit);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (name) => {
          try {
            return await this.client.getModelInfo(name);
          } catch (error: any) {
            errors.push({ name, error: error.message });
            return null;
          }
        })
      );
      
      // 收集成功的结果
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          models.push(result.value);
        }
      }
      
      // 报告进度
      if (onProgress) {
        const current = Math.min(i + concurrencyLimit, modelNames.length);
        onProgress(current, modelNames.length);
      }
    }
    
    // 如果有错误，记录但不抛出（错误容忍）
    if (errors.length > 0) {
      console.warn(`获取 ${errors.length} 个模型信息失败:`, errors);
    }
    
    return models;
  }

  /**
   * 同步牌组到 Anki
   */
  async syncDeckToAnki(
    deck: Deck,
    cards: Card[],
    template: ParseTemplate
  ): Promise<SyncLogEntry> {
    const startTime = Date.now();
    const logEntry: SyncLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      direction: 'to_anki',
      summary: {
        totalCards: cards.length,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0
      },
      duration: 0,
      errors: [],
      details: []
    };

    try {
      // 更新同步进度
      this.updateProgress(SyncStatus.PREPARING, 0, cards.length);

      // 获取需要同步的卡片（增量同步）
      const cardsToSync = this.settings.autoSync.prioritizeRecent
        ? this.stateTracker.getCardsToSync(cards, this.settings.autoSync.maxCardsPerSync)
        : cards;

      logEntry.summary.totalCards = cardsToSync.length;
      this.updateProgress(SyncStatus.SYNCING, 0, cardsToSync.length);

      // 检测冲突（如果启用双向同步）
      if (this.settings.bidirectionalSync.enabled) {
        const conflicts = await this.detectConflicts(cardsToSync);
        
        if (conflicts.length > 0) {
          // 处理冲突
          const resolved = await this.resolveConflicts(conflicts);
          // 更新卡片列表
          for (const resolution of resolved) {
            if (resolution.mergedCard) {
              const index = cardsToSync.findIndex(c => c.id === resolution.mergedCard!.id);
              if (index !== -1) {
                cardsToSync[index] = resolution.mergedCard;
              }
            }
          }
        }
      }

      // 批量同步卡片
      for (let i = 0; i < cardsToSync.length; i++) {
        const card = cardsToSync[i];
        
        try {
          await this.syncSingleCard(card, deck, template);
          
          logEntry.summary.successCount++;
          logEntry.details?.push({
            cardId: card.id,
            cardTitle: (card.fields?.front || card.fields?.question || '').substring(0, 50),
            status: 'success'
          });
        } catch (error: any) {
          logEntry.summary.failedCount++;
          logEntry.errors?.push(`卡片 ${card.id}: ${error.message}`);
          logEntry.details?.push({
            cardId: card.id,
            cardTitle: (card.fields?.front || card.fields?.question || '').substring(0, 50),
            status: 'failed',
            reason: error.message
          });
        }

        this.updateProgress(SyncStatus.SYNCING, i + 1, cardsToSync.length);
      }

      this.updateProgress(SyncStatus.COMPLETED, cardsToSync.length, cardsToSync.length);
    } catch (error: any) {
      this.updateProgress(SyncStatus.FAILED, 0, 0, error.message);
      logEntry.errors?.push(`同步失败: ${error.message}`);
    }

    logEntry.duration = Date.now() - startTime;
    return logEntry;
  }

  /**
   * 同步单张卡片
   */
  private async syncSingleCard(
    card: Card,
    deck: Deck,
    template: ParseTemplate
  ): Promise<void> {
    // 处理媒体文件
    let frontContent = card.fields?.front || card.fields?.question || '';
    let backContent = card.fields?.back || card.fields?.answer || '';

    if (this.settings.mediaSync.enabled) {
      const deckPath = (deck.metadata?.path as string) || '';
      const frontMedia = await this.mediaService.syncMediaToAnki(
        frontContent,
        deckPath
      );
      frontContent = frontMedia.updatedContent;

      const backMedia = await this.mediaService.syncMediaToAnki(
        backContent,
        deckPath
      );
      backContent = backMedia.updatedContent;
    }

    // 添加 Obsidian 回链
    if (this.settings.mediaSync.createBacklinks) {
      const backlinkHtml = this.generateCardBacklink(card, deck);
      
      if (this.settings.mediaSync.createBacklinks) {
        backContent += `\n\n<hr>\n${backlinkHtml}`;
      }
    }

    // 获取或创建 Anki 牌组
    const ankiDeckName = this.getAnkiDeckName(deck);
    
    // 检查是否已存在
    const metadata = this.stateTracker.getMetadata(card.id);
    
    if (metadata?.ankiNoteId) {
      // 更新现有笔记
      await this.client.updateNoteFields(metadata.ankiNoteId, {
        Front: frontContent,
        Back: backContent,
        Extra: (card.fields?.extra || card.customFields?.extra as string) || ''
      });

      if (card.tags && card.tags.length > 0) {
        await this.client.updateNoteTags(metadata.ankiNoteId, card.tags);
      }

      this.stateTracker.updateAfterSync(card.id, metadata.ankiNoteId);
    } else {
      // 创建新笔记
      const ankiNote: AnkiNote = {
        deckName: ankiDeckName,
        modelName: template.syncCapability?.ankiModelMapping?.modelName || 'Basic',
        fields: {
          Front: frontContent,
          Back: backContent,
          Extra: (card.fields?.extra || card.customFields?.extra as string) || ''
        },
        tags: card.tags || []
      };

      const noteId = await this.client.addNote(ankiNote);
      
      this.stateTracker.initializeMetadata(
        card,
        noteId,
        this.settings.bidirectionalSync.enabled
      );
    }
  }

  /**
   * 从 Anki 导入牌组
   */
  async importDeckFromAnki(
    ankiDeckName: string,
    targetDeck: Deck,
    template: ParseTemplate
  ): Promise<SyncLogEntry> {
    const startTime = Date.now();
    const logEntry: SyncLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      direction: 'from_anki',
      summary: {
        totalCards: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0
      },
      duration: 0,
      errors: [],
      details: []
    };

    try {
      this.updateProgress(SyncStatus.PREPARING, 0, 0);

      // 查找所有笔记
      const noteIds = await this.client.findNotesByDeck(ankiDeckName);
      logEntry.summary.totalCards = noteIds.length;

      this.updateProgress(SyncStatus.SYNCING, 0, noteIds.length);

      // 获取笔记信息（分批处理）
      const batchSize = 50;
      for (let i = 0; i < noteIds.length; i += batchSize) {
        const batch = noteIds.slice(i, i + batchSize);
        const notesInfo = await this.client.getNotesInfo(batch);

        for (const note of notesInfo) {
          try {
            await this.importSingleNote(note, targetDeck, template);
            logEntry.summary.successCount++;
          } catch (error: any) {
            logEntry.summary.failedCount++;
            logEntry.errors?.push(`笔记 ${note.noteId}: ${error.message}`);
          }
        }

        this.updateProgress(SyncStatus.SYNCING, Math.min(i + batchSize, noteIds.length), noteIds.length);
      }

      this.updateProgress(SyncStatus.COMPLETED, noteIds.length, noteIds.length);
    } catch (error: any) {
      this.updateProgress(SyncStatus.FAILED, 0, 0, error.message);
      logEntry.errors?.push(`导入失败: ${error.message}`);
    }

    logEntry.duration = Date.now() - startTime;
    return logEntry;
  }

  /**
   * 导入单条笔记
   */
  private async importSingleNote(
    note: any,
    targetDeck: Deck,
    template: ParseTemplate
  ): Promise<void> {
    // 这里需要调用卡片创建服务
    // 由于依赖其他服务，这里先预留接口
    console.log('导入笔记:', note, targetDeck, template);
  }

  /**
   * 检测冲突
   * 注意：双向同步功能已移除，此方法返回空数组
   */
  private async detectConflicts(cards: Card[]): Promise<any[]> {
    return [];
  }

  /**
   * 解决冲突
   * TODO: ConflictResolver 功能暂未实现，临时返回空数组
   */
  private async resolveConflicts(conflicts: any[]): Promise<any[]> {
    // const resolutions = [];
    
    // for (const conflict of conflicts) {
    //   const resolution = await this.conflictResolver.resolve(conflict);
    //   resolutions.push(resolution);
    // }

    // return resolutions;
    return [];
  }

  /**
   * 更新同步进度
   */
  private updateProgress(
    status: SyncProgress['status'],
    current: number,
    total: number,
    message?: string
  ): void {
    this.syncProgress = {
      status,
      current,
      total,
      percentage: total > 0 ? Math.round((current / total) * 100) : 0,
      message
    };
  }

  /**
   * 生成卡片回链
   */
  private generateCardBacklink(card: Card, deck: Deck): string {
    const vaultName = this.app.vault.getName();
    const deckPath = (deck.metadata?.path as string) || '';
    const encodedPath = encodeURIComponent(deckPath);
    const url = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodedPath}`;
    
    return `<a href="${url}" class="obsidian-backlink" style="display: inline-block; padding: 6px 10px; background: #4A5568; color: #E2E8F0; text-decoration: none; border-radius: 3px; font-size: 12px;">
  <span style="margin-right: 4px;">🔗</span>
  <span>在 Obsidian 中打开</span>
</a>`;
  }

  /**
   * 获取 Anki 牌组名称
   */
  private getAnkiDeckName(deck: Deck): string {
    const mapping = this.settings.deckMappings[deck.id];
    return mapping?.ankiDeckName || deck.name;
  }

  /**
   * 生成日志 ID
   */
  private generateLogId(): string {
    return `sync-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * 获取同步进度
   */
  getSyncProgress(): SyncProgress {
    return this.syncProgress;
  }

  /**
   * 获取同步统计
   */
  getSyncStatistics(): any {
    return this.stateTracker.getStatistics();
  }

  /**
   * 更新设置
   */
  updateSettings(settings: Partial<AnkiConnectSettings>): void {
    Object.assign(this.settings, settings);
    
    if (settings.endpoint) {
      this.client = new AnkiConnectClient(settings.endpoint);
    }
    
    if (settings.mediaSync) {
      this.mediaService.updateOptions(settings.mediaSync);
    }
    
    // 双向同步功能已移除
  }

  /**
   * 导出同步元数据（用于保存到设置）
   */
  exportSyncMetadata(): Record<string, CardSyncMetadata> {
    return this.stateTracker.getAllMetadata();
  }

  /**
   * 获取 Tuanki 牌组列表
   * 注意：此方法为占位符，实际应从 plugin.dataStorage 获取
   */
  async getTuankiDecks(): Promise<Deck[]> {
    // 此方法暂未使用，批量同步在 UI 层直接从 plugin.dataStorage 获取
    return [];
  }

  /**
   * 获取牌组的卡片数量
   * 注意：此方法为占位符，实际应从 plugin.dataStorage 获取
   */
  async getDeckCardCount(deckId: string): Promise<number> {
    // 此方法暂未使用，批量同步在 UI 层直接从 plugin.dataStorage 获取
    return 0;
  }

  /**
   * 验证牌组映射
   */
  validateDeckMapping(mapping: DeckSyncMapping): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!mapping.tuankiDeckId) {
      errors.push('Tuanki 牌组 ID 不能为空');
    }

    if (!mapping.ankiDeckName) {
      errors.push('Anki 牌组名称不能为空');
    }

    if (!['to_anki', 'from_anki', 'bidirectional'].includes(mapping.syncDirection)) {
      errors.push('无效的同步方向');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 批量同步多个牌组
   * 
   * 注意：此方法已废弃，批量同步逻辑已迁移到 UI 层（AnkiConnectPanel.performSync）
   * 保留此方法仅为向后兼容，实际不再使用
   */
  async batchSyncDecks(
    deckIds: string[],
    options: any
  ): Promise<SyncLogEntry[]> {
    console.warn('batchSyncDecks 方法已废弃，请使用 UI 层的批量同步逻辑');
    return [];
  }

  /**
   * 取消当前同步
   */
  private syncCancelled = false;

  cancelCurrentSync(): void {
    this.syncCancelled = true;
    this.updateProgress(SyncStatus.CANCELLED, 0, 0, '同步已取消');
  }

  /**
   * 导出同步日志为 JSON
   */
  exportLogsToJson(logs: SyncLogEntry[]): string {
    return JSON.stringify(logs, null, 2);
  }

  // ==================== 新增：模板和卡片导入导出功能 ====================

  /**
   * 从 Anki 导入整个牌组（包括模板和卡片）
   */
  async importDeckWithTemplates(
    ankiDeckName: string,
    targetTuankiDeckId: string,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<import('../../types/ankiconnect-types').ImportResult> {
    try {
      const result = await this.cardImporter.importDeck(
        ankiDeckName,
        targetTuankiDeckId,
        onProgress
      );

      return result;
    } catch (error: any) {
      console.error('导入牌组失败:', error);
      throw new AnkiConnectError(
        `导入牌组失败: ${error.message}`,
        ConnectionErrorType.UNKNOWN
      );
    }
  }

  /**
   * 导出 Tuanki 牌组到 Anki
   */
  async exportDeckToAnki(
    tuankiDeckId: string,
    ankiDeckName: string,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<import('../../types/ankiconnect-types').ExportResult> {
    try {
      const result = await this.cardExporter.exportDeck(
        tuankiDeckId,
        ankiDeckName,
        onProgress
      );

      return result;
    } catch (error: any) {
      console.error('导出牌组失败:', error);
      throw new AnkiConnectError(
        `导出牌组失败: ${error.message}`,
        ConnectionErrorType.UNKNOWN
      );
    }
  }

  /**
   * 获取模板管理器（供 UI 使用）
   */
  getTemplateManager(): TemplateManager {
    return this.templateManager;
  }

  /**
   * 获取模板转换器（供 UI 使用）
   */
  getTemplateConverter(): AnkiTemplateConverter {
    return this.templateConverter;
  }

  /**
   * 批量导入 Anki 模板
   */
  async importAnkiModels(
    modelNames: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<{ imported: ParseTemplate[]; errors: string[] }> {
    const imported: ParseTemplate[] = [];
    const errors: string[] = [];

    for (let i = 0; i < modelNames.length; i++) {
      try {
        const modelName = modelNames[i];
        const modelInfo = await this.client.getModelInfo(modelName);
        
        // 检查是否已导入
        if (this.templateConverter.isTemplateAlreadyImported(modelInfo.id)) {
          console.log(`模板 ${modelName} 已存在，跳过`);
          continue;
        }

        // 转换并保存
        const { template, warnings } = this.templateConverter.convertModelToTemplate(modelInfo);
        await this.templateManager.saveTemplate(template);
        imported.push(template);

        if (warnings.length > 0) {
          errors.push(`${modelName}: ${warnings.join(', ')}`);
        }

        onProgress?.(i + 1, modelNames.length);
      } catch (error: any) {
        errors.push(`${modelNames[i]}: ${error.message}`);
      }
    }

    return { imported, errors };
  }

  /**
   * 转换模板为 Tuanki 专属（启用双向同步）
   */
  async convertToTuankiExclusive(templateId: string): Promise<ParseTemplate> {
    return await this.templateManager.convertToTuankiExclusive(templateId);
  }

  /**
   * 获取模板统计信息
   */
  getTemplateStatistics() {
    return this.templateManager.getTemplateStatistics();
  }

  /**
   * 按来源获取模板列表
   */
  getTemplatesBySource(source: 'official' | 'anki_imported' | 'tuanki_created' | 'user_custom'): ParseTemplate[] {
    return this.templateManager.getTemplatesBySource(source);
  }

  /**
   * 获取所有支持双向同步的模板
   */
  getBidirectionalTemplates(): ParseTemplate[] {
    return this.templateManager.getBidirectionalTemplates();
  }

  // ==================== 🆕 连接管理和自动同步方法 ====================

  /**
   * 启动连接监控（心跳检测）
   */
  startConnectionMonitoring(): void {
    console.log('[AnkiConnectService] 启动连接监控');
    this.connectionManager.startHeartbeat();
  }

  /**
   * 停止连接监控
   */
  stopConnectionMonitoring(): void {
    console.log('[AnkiConnectService] 停止连接监控');
    this.connectionManager.stopHeartbeat();
  }

  /**
   * 启动自动同步
   */
  startAutoSync(): void {
    if (!this.settings.autoSync.enabled) {
      console.log('[AnkiConnectService] 自动同步未启用，跳过');
      return;
    }

    if (this.autoSyncScheduler) {
      console.warn('[AnkiConnectService] 自动同步调度器已在运行');
      return;
    }

    console.log('[AnkiConnectService] 启动自动同步调度器');
    
    this.autoSyncScheduler = new AutoSyncScheduler(
      this.app,
      this.plugin,
      this,
      {
        intervalMinutes: this.settings.autoSync.intervalMinutes,
        syncOnStartup: this.settings.autoSync.syncOnStartup,
        onlyWhenAnkiRunning: this.settings.autoSync.onlyWhenAnkiRunning,
        enableFileWatcher: this.settings.autoSync.enableFileWatcher ?? false,
        debounceDelay: 5000  // 5秒防抖
      }
    );

    this.autoSyncScheduler.start();
  }

  /**
   * 停止自动同步
   */
  stopAutoSync(): void {
    if (!this.autoSyncScheduler) {
      return;
    }

    console.log('[AnkiConnectService] 停止自动同步调度器');
    this.autoSyncScheduler.stop();
    this.autoSyncScheduler = null;
  }

  /**
   * 手动触发同步
   */
  manualSync(): void {
    if (this.autoSyncScheduler) {
      this.autoSyncScheduler.manualSync();
    } else {
      console.warn('[AnkiConnectService] 自动同步调度器未启动');
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionState(): ConnectionState {
    return this.connectionManager.getState();
  }

  /**
   * 执行增量同步
   */
  async performIncrementalSync(): Promise<IncrementalSyncResult> {
    const startTime = Date.now();
    
    console.log('[AnkiConnectService] 🔄 开始增量同步...');

    try {
      // 获取所有牌组映射
      const deckMappings = Object.values(this.settings.deckMappings || {});
      
      if (deckMappings.length === 0) {
        console.log('[AnkiConnectService] 无牌组映射，跳过同步');
        return {
          totalCards: 0,
          changedCards: 0,
          skippedCards: 0,
          importedCards: 0,
          exportedCards: 0,
          errors: [],
          duration: Date.now() - startTime
        };
      }

      let totalCards = 0;
      let changedCards = 0;
      let importedCards = 0;
      let exportedCards = 0;
      const errors: string[] = [];

      // 遍历牌组映射执行同步
      for (const mapping of deckMappings) {
        if (!mapping.enabled) {
          continue;
        }

        try {
          // 根据同步方向执行
          if (mapping.syncDirection === 'from_anki' || mapping.syncDirection === 'bidirectional') {
            // 从 Anki 导入
            const importResult = await this.cardImporter.importDeck(
              mapping.ankiDeckName,
              mapping.tuankiDeckId
            );
            
            importedCards += importResult.importedCards;
            totalCards += importResult.importedCards + importResult.skippedCards;
            
            if (importResult.errors.length > 0) {
              errors.push(...importResult.errors.map(e => e.message));
            }
          }

          if (mapping.syncDirection === 'to_anki' || mapping.syncDirection === 'bidirectional') {
            // 导出到 Anki
            const exportResult = await this.cardExporter.exportDeck(
              mapping.tuankiDeckId,
              mapping.ankiDeckName
            );
            
            exportedCards += exportResult.exportedCards;
            
            if (exportResult.errors.length > 0) {
              errors.push(...exportResult.errors.map(e => e.message));
            }
          }
        } catch (error) {
          errors.push(`牌组 ${mapping.ankiDeckName}: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      }

      changedCards = importedCards + exportedCards;
      const skippedCards = totalCards - changedCards;

      const result: IncrementalSyncResult = {
        totalCards,
        changedCards,
        skippedCards,
        importedCards,
        exportedCards,
        errors,
        duration: Date.now() - startTime
      };

      console.log('[AnkiConnectService] ✅ 增量同步完成:', result);

      // 持久化同步状态
      await this.incrementalTracker.persist();

      return result;
    } catch (error) {
      console.error('[AnkiConnectService] ❌ 增量同步失败:', error);
      
      return {
        totalCards: 0,
        changedCards: 0,
        skippedCards: 0,
        importedCards: 0,
        exportedCards: 0,
        errors: [error instanceof Error ? error.message : '未知错误'],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 获取增量同步统计信息
   */
  getIncrementalSyncStats() {
    return this.incrementalTracker.getStats();
  }

  /**
   * 重置增量同步状态（强制全量同步）
   */
  resetIncrementalSync(): void {
    this.incrementalTracker.reset();
    console.log('[AnkiConnectService] 增量同步状态已重置');
  }

  /**
   * 清理过期的同步记录
   */
  cleanupOldSyncRecords(maxAgeDays: number = 90): number {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    return this.incrementalTracker.cleanupOldRecords(maxAgeMs);
  }
}

