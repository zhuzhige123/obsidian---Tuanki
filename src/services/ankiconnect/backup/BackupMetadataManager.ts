/**
 * 备份元数据索引系统
 * 
 * 功能：
 * - 维护备份元数据索引
 * - 评估备份可删除性
 * - 智能清理推荐
 */

import type { Plugin } from 'obsidian';
import type {
  BackupMetadata,
  BackupIndexData,
  DeleteAssessment,
  CleanupRecommendation,
  BackupCleanupItem
} from '../../../types/backup-types';
import { StoragePathManager } from '../StoragePathManager';

export class BackupMetadataManager {
  private plugin: Plugin;
  private pathManager: StoragePathManager;
  private index: Map<string, BackupMetadata> = new Map();
  private indexLoaded = false;
  
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.pathManager = new StoragePathManager(plugin);
  }
  
  /**
   * 加载元数据索引
   */
  async loadIndex(): Promise<void> {
    if (this.indexLoaded) return;
    
    const indexPath = this.pathManager.getBackupIndexPath();
    
    try {
      const exists = await this.plugin.app.vault.adapter.exists(indexPath);
      
      if (!exists) {
        console.log('📊 元数据索引不存在，创建新索引');
        await this.saveIndex();
        this.indexLoaded = true;
        return;
      }
      
      const content = await this.plugin.app.vault.adapter.read(indexPath);
      const indexData: BackupIndexData = JSON.parse(content);
      
      for (const [id, metadata] of Object.entries(indexData.backups)) {
        this.index.set(id, metadata);
      }
      
      console.log(`📊 已加载 ${this.index.size} 个备份元数据`);
      this.indexLoaded = true;
    } catch (error) {
      console.error('加载元数据索引失败:', error);
      this.indexLoaded = true;
    }
  }
  
  /**
   * 保存元数据索引
   */
  async saveIndex(): Promise<void> {
    const indexPath = this.pathManager.getBackupIndexPath();
    
    const indexData: BackupIndexData = {
      version: 1,
      lastUpdated: Date.now(),
      backups: Object.fromEntries(this.index),
      devices: this.collectDeviceInfo()
    };
    
    try {
      await this.pathManager.ensureFolder(this.pathManager.getBackupPath());
      await this.plugin.app.vault.adapter.write(
        indexPath,
        JSON.stringify(indexData, null, 2)
      );
      console.log(`💾 已保存元数据索引: ${this.index.size} 项`);
    } catch (error) {
      console.error('保存元数据索引失败:', error);
    }
  }
  
  /**
   * 添加或更新备份元数据
   * @param metadata 备份元数据
   */
  async addOrUpdate(metadata: BackupMetadata): Promise<void> {
    await this.loadIndex();
    this.index.set(metadata.id, metadata);
    await this.saveIndex();
  }
  
  /**
   * 获取备份元数据
   * @param backupId 备份ID
   * @returns 元数据或 undefined
   */
  async get(backupId: string): Promise<BackupMetadata | undefined> {
    await this.loadIndex();
    return this.index.get(backupId);
  }
  
  /**
   * 删除备份元数据
   * @param backupId 备份ID
   */
  async remove(backupId: string): Promise<void> {
    await this.loadIndex();
    this.index.delete(backupId);
    await this.saveIndex();
  }
  
  /**
   * 列出所有备份元数据
   * @returns 元数据数组
   */
  async listAll(): Promise<BackupMetadata[]> {
    await this.loadIndex();
    return Array.from(this.index.values());
  }
  
  /**
   * 智能评估备份可删除性
   * @param backupId 备份ID
   * @returns 可删除性评估
   */
  async assessDeletability(backupId: string): Promise<DeleteAssessment> {
    await this.loadIndex();
    
    const metadata = this.index.get(backupId);
    if (!metadata) {
      return { canDelete: false, reason: '备份不存在' };
    }
    
    const allBackups = Array.from(this.index.values());
    const sameDevice = allBackups.filter(b => b.deviceId === metadata.deviceId);
    
    // 规则 1: 如果是增量备份的基础，不能删除
    const isBase = allBackups.some(b => b.baseBackupId === backupId);
    if (isBase) {
      return {
        canDelete: false,
        reason: '此备份是其他增量备份的基础',
        dependentBackups: allBackups.filter(b => b.baseBackupId === backupId).map(b => b.id)
      };
    }
    
    // 规则 2: 如果是最近的备份（3天内），建议保留
    const age = Date.now() - metadata.timestamp;
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    if (age < threeDays) {
      return {
        canDelete: true,
        reason: '最近的备份，建议保留',
        confidence: 'low'
      };
    }
    
    // 规则 3: 如果同设备有更新的备份，可以删除
    const newerBackups = sameDevice.filter(b => 
      b.timestamp > metadata.timestamp &&
      b.level === metadata.level &&
      b.summary.deckId === metadata.summary.deckId
    );
    
    if (newerBackups.length >= 2) {
      return {
        canDelete: true,
        reason: `同设备有 ${newerBackups.length} 个更新的备份`,
        confidence: 'high',
        recommendDelete: true
      };
    }
    
    // 规则 4: 如果数据不健康，建议删除
    if (!metadata.isHealthy) {
      return {
        canDelete: true,
        reason: '备份数据已损坏或不完整',
        confidence: 'high',
        recommendDelete: true
      };
    }
    
    // 规则 5: 自动备份超过30天，可以删除
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (metadata.trigger === 'auto_import' && age > thirtyDays) {
      return {
        canDelete: true,
        reason: '自动备份已超过30天',
        confidence: 'medium',
        recommendDelete: true
      };
    }
    
    return {
      canDelete: true,
      reason: '可以安全删除',
      confidence: 'medium'
    };
  }
  
  /**
   * 推荐清理策略
   * @returns 清理建议
   */
  async recommendCleanup(): Promise<CleanupRecommendation> {
    await this.loadIndex();
    
    const allBackups = Array.from(this.index.values());
    const totalSize = allBackups.reduce((sum, b) => sum + b.size, 0);
    
    const recommendations: BackupCleanupItem[] = [];
    
    for (const backup of allBackups) {
      const assessment = await this.assessDeletability(backup.id);
      
      if (assessment.recommendDelete) {
        recommendations.push({
          backupId: backup.id,
          metadata: backup,
          assessment,
          potentialSavings: backup.size
        });
      }
    }
    
    // 按潜在节省空间排序
    recommendations.sort((a, b) => b.potentialSavings - a.potentialSavings);
    
    const totalSavings = recommendations.reduce((sum, r) => sum + r.potentialSavings, 0);
    
    return {
      totalBackups: allBackups.length,
      totalSize,
      recommendedDeletions: recommendations,
      potentialSavings: totalSavings,
      savingsPercentage: totalSize > 0 ? (totalSavings / totalSize) * 100 : 0
    };
  }
  
  /**
   * 收集设备信息
   * @returns 设备信息映射
   */
  private collectDeviceInfo(): Record<string, any> {
    const devices: Record<string, any> = {};
    
    for (const metadata of this.index.values()) {
      const deviceId = metadata.deviceId;
      
      if (!devices[deviceId]) {
        devices[deviceId] = {
          deviceId,
          deviceName: metadata.deviceName,
          lastSeen: metadata.timestamp,
          backupCount: 0
        };
      }
      
      devices[deviceId].backupCount++;
      if (metadata.timestamp > devices[deviceId].lastSeen) {
        devices[deviceId].lastSeen = metadata.timestamp;
      }
    }
    
    return devices;
  }
  
  /**
   * 获取统计信息
   * @returns 统计数据
   */
  async getStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    byLevel: Record<string, number>;
    byDevice: Record<string, number>;
    oldest: number;
    newest: number;
  }> {
    await this.loadIndex();
    
    const allBackups = Array.from(this.index.values());
    const totalSize = allBackups.reduce((sum, b) => sum + b.size, 0);
    
    const byLevel: Record<string, number> = {};
    const byDevice: Record<string, number> = {};
    
    for (const backup of allBackups) {
      byLevel[backup.level] = (byLevel[backup.level] || 0) + 1;
      byDevice[backup.deviceId] = (byDevice[backup.deviceId] || 0) + 1;
    }
    
    const timestamps = allBackups.map(b => b.timestamp);
    const oldest = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const newest = timestamps.length > 0 ? Math.max(...timestamps) : 0;
    
    return {
      totalBackups: allBackups.length,
      totalSize,
      byLevel,
      byDevice,
      oldest,
      newest
    };
  }
}


