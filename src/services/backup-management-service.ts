/**
 * 备份管理服务
 * 提供智能备份策略、备份清理、备份恢复等功能
 */

import type { AnkiDataStorage } from '../data/storage';
import type {
  BackupInfo,
  BackupResult,
  RestoreResult,
  ValidationResult,
  PruneResult,
  BackupPreview,
  RestoreOptions
} from '../types/data-management-types';
import {
  BackupType,
  BackupTrigger,
  DataType
} from '../types/data-management-types';

export class BackupManagementService {
  private dataStorage: AnkiDataStorage;
  private plugin: any; // TuankiPlugin type
  private readonly MAX_BACKUPS = 3;

  constructor(dataStorage: AnkiDataStorage, plugin: any) {
    this.dataStorage = dataStorage;
    this.plugin = plugin;
  }

  /**
   * 创建自动备份
   * @deprecated 已废弃，请使用 AutoBackupScheduler 代替
   * @see {@link AutoBackupScheduler}
   */
  async createAutoBackup(trigger: BackupTrigger): Promise<BackupResult> {
    const startTime = Date.now();
    
    try {
      // 检查是否需要创建备份
      if (!this.shouldCreateAutoBackup(trigger)) {
        return {
          success: false,
          error: '不满足自动备份条件',
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime
        };
      }

      // 创建备份
      const backupPath = await this.dataStorage.createBackup();
      const backupInfo = await this.createBackupInfo(backupPath, BackupType.AUTO, trigger);
      
      // 清理旧备份
      const pruneResult = await this.pruneBackups();
      
      return {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        backupInfo,
        backupPath,
        prunedCount: pruneResult.beforeCount - pruneResult.afterCount
      };
    } catch (error) {
      console.error('自动备份失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 创建手动备份
   */
  async createManualBackup(description?: string): Promise<BackupResult> {
    const startTime = Date.now();
    
    try {
      // 创建备份
      const backupPath = await this.dataStorage.createBackup();
      const backupInfo = await this.createBackupInfo(
        backupPath, 
        BackupType.MANUAL, 
        BackupTrigger.MANUAL_REQUEST,
        description
      );
      
      // 清理旧备份（手动备份优先保留）
      const pruneResult = await this.pruneBackups();
      
      return {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        backupInfo,
        backupPath,
        prunedCount: pruneResult.beforeCount - pruneResult.afterCount
      };
    } catch (error) {
      console.error('手动备份失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 清理备份（保留最重要的3个）
   */
  async pruneBackups(): Promise<PruneResult> {
    const startTime = Date.now();
    
    try {
      const backups = await this.getBackupHistory();
      const beforeCount = backups.length;
      
      if (beforeCount <= this.MAX_BACKUPS) {
        return {
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          beforeCount,
          afterCount: beforeCount,
          prunedBackups: [],
          retainedBackups: backups.map(b => b.id)
        };
      }

      // 智能选择要保留的备份
      const toRetain = this.selectBackupsToRetain(backups);
      const toDelete = backups.filter(b => !toRetain.some(r => r.id === b.id));
      
      // 删除多余的备份
      const prunedBackups: string[] = [];
      for (const backup of toDelete) {
        try {
          await this.deleteBackupFiles(backup);
          prunedBackups.push(backup.id);
        } catch (error) {
          console.warn(`删除备份失败: ${backup.id}`, error);
        }
      }

      return {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        beforeCount,
        afterCount: beforeCount - prunedBackups.length,
        prunedBackups,
        retainedBackups: toRetain.map(b => b.id)
      };
    } catch (error) {
      console.error('备份清理失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        beforeCount: 0,
        afterCount: 0,
        prunedBackups: [],
        retainedBackups: []
      };
    }
  }

  /**
   * 验证备份完整性
   */
  async validateBackupIntegrity(backupId: string): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const backup = await this.getBackupById(backupId);
      if (!backup) {
        throw new Error(`备份不存在: ${backupId}`);
      }

      const issues: any[] = [];
      let validatedCount = 0;

      // 验证备份文件夹存在
      const adapter = this.plugin.app.vault.adapter;
      const exists = await adapter.exists(backup.path);
      if (!exists) {
        issues.push({
          id: 'missing_backup_folder',
          type: 'missing_file',
          description: `备份文件夹不存在: ${backup.path}`,
          severity: 'critical'
        });
      } else {
        validatedCount++;
        
        // 验证备份内容
        const listing = await adapter.list(backup.path);
        const expectedFiles = ['decks.json', 'cards.json', 'settings.json'];
        
        for (const expectedFile of expectedFiles) {
          const filePath = `${backup.path}/${expectedFile}`;
          const fileExists = (listing.files || []).includes(filePath);
          
          if (!fileExists) {
            issues.push({
              id: `missing_${expectedFile}`,
              type: 'missing_file',
              description: `缺少备份文件: ${expectedFile}`,
              severity: 'error'
            });
          } else {
            validatedCount++;
            
            // 验证文件内容
            try {
              const content = await adapter.read(filePath);
              JSON.parse(content); // 验证JSON格式
            } catch (error) {
              issues.push({
                id: `corrupted_${expectedFile}`,
                type: 'corrupted_data',
                description: `备份文件损坏: ${expectedFile}`,
                severity: 'error'
              });
            }
          }
        }
      }

      return {
        success: issues.filter(i => i.severity === 'critical').length === 0,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        validatedCount,
        issueCount: issues.length,
        issues
      };
    } catch (error) {
      console.error('备份验证失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        validatedCount: 0,
        issueCount: 1,
        issues: [{
          id: 'validation_error',
          type: 'corrupted_data',
          description: error instanceof Error ? error.message : String(error),
          severity: 'critical'
        }]
      };
    }
  }

  /**
   * 预览备份内容
   */
  async previewBackupContent(backupId: string): Promise<BackupPreview> {
    try {
      const backup = await this.getBackupById(backupId);
      if (!backup) {
        throw new Error(`备份不存在: ${backupId}`);
      }

      const adapter = this.plugin.app.vault.adapter;
      const listing = await adapter.list(backup.path);
      const files = listing.files || [];

      // 读取统计信息
      const statistics = await this.calculateBackupStatistics(backup.path);

      return {
        backupInfo: backup,
        files,
        statistics
      };
    } catch (error) {
      console.error('预览备份内容失败:', error);
      throw new Error(`预览备份内容失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从备份恢复
   */
  async restoreFromBackup(backupId: string, options: RestoreOptions): Promise<RestoreResult> {
    const startTime = Date.now();
    
    try {
      const backup = await this.getBackupById(backupId);
      if (!backup) {
        throw new Error(`备份不存在: ${backupId}`);
      }

      // 验证备份完整性
      const validation = await this.validateBackupIntegrity(backupId);
      if (!validation.success) {
        throw new Error(`备份验证失败: ${validation.issues?.[0]?.description}`);
      }

      // 创建恢复前备份
      let preRestoreBackupId: string | undefined;
      if (options.createPreRestoreBackup) {
        const preBackupResult = await this.createManualBackup('恢复前自动备份');
        preRestoreBackupId = preBackupResult.backupInfo?.id;
      }

      // 执行恢复
      const restoreResult = await this.executeRestore(backup, options);

      return {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        restoredFileCount: restoreResult.fileCount,
        restoredDataTypes: restoreResult.dataTypes,
        preRestoreBackupId
      };
    } catch (error) {
      console.error('备份恢复失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        restoredFileCount: 0,
        restoredDataTypes: []
      };
    }
  }

  /**
   * 获取备份历史
   */
  async getBackupHistory(): Promise<BackupInfo[]> {
    try {
      const dataFolder = this.getDataFolderPath();
      const backupsFolder = `${dataFolder}/backups`;
      const adapter = this.plugin.app.vault.adapter;
      
      const exists = await adapter.exists(backupsFolder);
      if (!exists) {
        return [];
      }

      const listing = await adapter.list(backupsFolder);
      const backupFolders = listing.folders || [];
      
      const backups: BackupInfo[] = [];
      for (const folder of backupFolders) {
        try {
          const backupInfo = await this.loadBackupInfo(folder);
          if (backupInfo) {
            backups.push(backupInfo);
          }
        } catch (error) {
          console.warn(`加载备份信息失败: ${folder}`, error);
        }
      }

      // 按时间倒序排列
      return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('获取备份历史失败:', error);
      return [];
    }
  }

  // ==================== 私有辅助方法 ====================

  private getDataFolderPath(): string {
    return this.plugin.settings?.dataFolder || 'tuanki';
  }

  private shouldCreateAutoBackup(trigger: BackupTrigger): boolean {
    // 根据触发条件判断是否需要创建备份
    switch (trigger) {
      case BackupTrigger.STARTUP:
        return this.shouldCreateStartupBackup();
      case BackupTrigger.CARD_COUNT_THRESHOLD:
        return this.shouldCreateThresholdBackup();
      default:
        return true;
    }
  }

  private shouldCreateStartupBackup(): boolean {
    // 检查上次启动备份时间
    const lastBackup = this.plugin.settings?.lastStartupBackup;
    if (!lastBackup) return true;
    
    const lastBackupTime = new Date(lastBackup).getTime();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    return (now - lastBackupTime) > oneDayMs;
  }

  private shouldCreateThresholdBackup(): boolean {
    // 检查卡片数量变化
    const lastCardCount = this.plugin.settings?.lastBackupCardCount || 0;
    const currentCardCount = this.plugin.dataStorage?.getCards()?.length || 0;
    
    return Math.abs(currentCardCount - lastCardCount) >= 100;
  }

  private async createBackupInfo(
    backupPath: string,
    type: BackupType,
    trigger?: BackupTrigger,
    description?: string
  ): Promise<BackupInfo> {
    const adapter = this.plugin.app.vault.adapter;
    const timestamp = new Date().toISOString();
    const id = this.generateBackupId(timestamp);
    
    // 计算备份大小
    let size = 0;
    try {
      const listing = await adapter.list(backupPath);
      for (const file of listing.files || []) {
        const stat = await adapter.stat(file);
        size += stat?.size || 0;
      }
    } catch (error) {
      console.warn('计算备份大小失败:', error);
    }

    const backupInfo: BackupInfo = {
      id,
      timestamp,
      type,
      size,
      description,
      trigger,
      path: backupPath,
      isValid: true,
      dataTypes: [DataType.DECKS, DataType.CARDS, DataType.SESSIONS, DataType.PROFILE]
    };

    // 保存备份信息
    await this.saveBackupInfo(backupInfo);
    
    return backupInfo;
  }

  private generateBackupId(timestamp: string): string {
    return timestamp.replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
  }

  private async saveBackupInfo(backupInfo: BackupInfo): Promise<void> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      const infoPath = `${backupInfo.path}/.backup-info.json`;
      await adapter.write(infoPath, JSON.stringify(backupInfo, null, 2));
    } catch (error) {
      console.warn('保存备份信息失败:', error);
    }
  }

  private async loadBackupInfo(backupPath: string): Promise<BackupInfo | null> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      const infoPath = `${backupPath}/.backup-info.json`;
      
      const exists = await adapter.exists(infoPath);
      if (!exists) {
        // 尝试从路径推断备份信息
        return this.inferBackupInfo(backupPath);
      }

      const content = await adapter.read(infoPath);
      return JSON.parse(content);
    } catch (error) {
      console.warn(`加载备份信息失败: ${backupPath}`, error);
      return null;
    }
  }

  private inferBackupInfo(backupPath: string): BackupInfo {
    const folderName = backupPath.split('/').pop() || '';
    const timestamp = folderName.replace(/_/g, 'T').replace(/-/g, ':');
    
    return {
      id: folderName,
      timestamp: new Date(timestamp).toISOString(),
      type: BackupType.AUTO,
      size: 0,
      path: backupPath,
      isValid: true,
      dataTypes: [DataType.DECKS, DataType.CARDS]
    };
  }

  private selectBackupsToRetain(backups: BackupInfo[]): BackupInfo[] {
    // 智能选择策略：
    // 1. 最新的备份
    // 2. 最新的手动备份
    // 3. 最新的操作前备份

    const sorted = [...backups].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const toRetain: BackupInfo[] = [];
    
    // 1. 最新备份
    if (sorted.length > 0) {
      toRetain.push(sorted[0]);
    }

    // 2. 最新手动备份
    const latestManual = sorted.find(b => b.type === BackupType.MANUAL && !toRetain.includes(b));
    if (latestManual) {
      toRetain.push(latestManual);
    }

    // 3. 最新操作前备份
    const latestPreOp = sorted.find(b => b.type === BackupType.PRE_OPERATION && !toRetain.includes(b));
    if (latestPreOp) {
      toRetain.push(latestPreOp);
    }

    // 如果还不够3个，补充最新的备份
    while (toRetain.length < this.MAX_BACKUPS && toRetain.length < sorted.length) {
      const next = sorted.find(b => !toRetain.includes(b));
      if (next) {
        toRetain.push(next);
      } else {
        break;
      }
    }

    return toRetain.slice(0, this.MAX_BACKUPS);
  }

  private async deleteBackupFiles(backup: BackupInfo): Promise<void> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      
      // 删除备份文件夹
      const exists = await adapter.exists(backup.path);
      if (exists) {
        await this.deleteRecursively(backup.path, adapter);
      }
    } catch (error) {
      console.error(`删除备份文件失败: ${backup.id}`, error);
      throw error;
    }
  }

  private async deleteRecursively(path: string, adapter: any): Promise<void> {
    const listing = await adapter.list(path);
    
    // 删除文件
    for (const file of listing.files || []) {
      await adapter.remove(file);
    }
    
    // 递归删除子文件夹
    for (const folder of listing.folders || []) {
      await this.deleteRecursively(folder, adapter);
    }
    
    // 删除空文件夹
    await adapter.rmdir(path);
  }

  private async getBackupById(backupId: string): Promise<BackupInfo | null> {
    const backups = await this.getBackupHistory();
    return backups.find(b => b.id === backupId) || null;
  }

  private async calculateBackupStatistics(backupPath: string): Promise<any> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      
      const stats = {
        deckCount: 0,
        cardCount: 0,
        sessionCount: 0,
        templateCount: 0
      };

      // 读取各种数据文件并统计
      try {
        const decksContent = await adapter.read(`${backupPath}/decks.json`);
        const decks = JSON.parse(decksContent);
        stats.deckCount = Array.isArray(decks) ? decks.length : 0;
      } catch {}

      try {
        const cardsContent = await adapter.read(`${backupPath}/cards.json`);
        const cards = JSON.parse(cardsContent);
        stats.cardCount = Array.isArray(cards) ? cards.length : 0;
      } catch {}

      return stats;
    } catch (error) {
      console.warn('计算备份统计失败:', error);
      return {
        deckCount: 0,
        cardCount: 0,
        sessionCount: 0,
        templateCount: 0
      };
    }
  }

  private async executeRestore(backup: BackupInfo, options: RestoreOptions): Promise<any> {
    const adapter = this.plugin.app.vault.adapter;
    const dataFolder = this.getDataFolderPath();
    
    let fileCount = 0;
    const restoredDataTypes: DataType[] = [];

    // 恢复各种数据类型
    for (const dataType of options.dataTypes) {
      try {
        switch (dataType) {
          case DataType.DECKS:
            await this.restoreDataFile(backup.path, dataFolder, 'decks.json', adapter);
            restoredDataTypes.push(DataType.DECKS);
            fileCount++;
            break;
          case DataType.CARDS:
            await this.restoreDataFile(backup.path, dataFolder, 'cards.json', adapter);
            restoredDataTypes.push(DataType.CARDS);
            fileCount++;
            break;
          case DataType.SESSIONS:
            await this.restoreDataFile(backup.path, dataFolder, 'sessions.json', adapter);
            restoredDataTypes.push(DataType.SESSIONS);
            fileCount++;
            break;
        }
      } catch (error) {
        console.warn(`恢复数据类型失败: ${dataType}`, error);
      }
    }

    return {
      fileCount,
      dataTypes: restoredDataTypes
    };
  }

  private async restoreDataFile(backupPath: string, dataFolder: string, fileName: string, adapter: any): Promise<void> {
    const sourcePath = `${backupPath}/${fileName}`;
    const targetPath = `${dataFolder}/${fileName}`;
    
    const exists = await adapter.exists(sourcePath);
    if (exists) {
      const content = await adapter.read(sourcePath);
      await adapter.write(targetPath, content);
    }
  }
}
