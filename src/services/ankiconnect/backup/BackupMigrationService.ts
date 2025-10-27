/**
 * 备份数据迁移服务
 * 
 * 将旧备份数据从 settings.json 迁移到文件系统
 */

import type { Plugin } from 'obsidian';
import { Notice } from 'obsidian';
import type {
  MigrationResult,
  BackupLevel,
  BackupTrigger
} from '../../../types/backup-types';
import { UnifiedBackupService } from './UnifiedBackupService';

export class BackupMigrationService {
  private plugin: Plugin;
  private backupService: UnifiedBackupService;
  
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.backupService = new UnifiedBackupService(plugin);
  }
  
  /**
   * 检查是否需要迁移
   * @returns 是否需要迁移
   */
  async needsMigration(): Promise<boolean> {
    const settings = (this.plugin.settings as any).ankiConnect;
    
    if (!settings?.backups) {
      return false;
    }
    
    const backupCount = Object.keys(settings.backups).length;
    
    if (backupCount === 0) {
      return false;
    }
    
    console.log(`📦 检测到 ${backupCount} 个旧备份需要迁移`);
    return true;
  }
  
  /**
   * 从 settings.json 迁移备份到文件系统
   * @returns 迁移结果
   */
  async migrateBackupsFromSettings(): Promise<MigrationResult> {
    const settings = (this.plugin.settings as any).ankiConnect;
    
    if (!settings?.backups || Object.keys(settings.backups).length === 0) {
      return {
        success: true,
        migratedCount: 0,
        message: '无需迁移，未找到旧备份数据'
      };
    }
    
    console.log('🚀 开始迁移备份数据...');
    
    const startTime = Date.now();
    const migrated: string[] = [];
    const failed: string[] = [];
    
    // 初始化备份服务
    await this.backupService.initialize();
    
    const backups = settings.backups;
    const totalCount = Object.keys(backups).length;
    
    console.log(`📊 准备迁移 ${totalCount} 个备份...`);
    
    for (const [backupId, backupData] of Object.entries(backups)) {
      try {
        console.log(`  迁移备份 ${migrated.length + 1}/${totalCount}: ${backupId}`);
        
        // 使用新的备份服务创建备份
        const result = await this.backupService.createBackup({
          level: 'deck' as BackupLevel,
          trigger: 'manual' as BackupTrigger,
          data: backupData,
          targetId: (backupData as any).info?.deckId,
          reason: `从旧版本迁移 (原ID: ${backupId})`
        });
        
        if (result.success) {
          migrated.push(backupId);
          console.log(`    ✅ 迁移成功 → ${result.backupId}`);
        } else {
          failed.push(backupId);
          console.error(`    ❌ 迁移失败:`, result.error);
        }
      } catch (error) {
        console.error(`  ❌ 迁移备份 ${backupId} 失败:`, error);
        failed.push(backupId);
      }
    }
    
    // 清理已迁移的备份（保留失败的）
    for (const backupId of migrated) {
      delete settings.backups[backupId];
    }
    
    // 如果所有备份都迁移成功，删除 backups 字段
    if (failed.length === 0) {
      delete settings.backups;
    }
    
    // 保存设置
    await this.plugin.saveSettings();
    
    const duration = Date.now() - startTime;
    const message = `
✅ 备份迁移完成
━━━━━━━━━━━━━━━━━━
✓ 成功迁移: ${migrated.length} 个
${failed.length > 0 ? `✗ 失败: ${failed.length} 个` : ''}
⏱ 耗时: ${(duration / 1000).toFixed(2)} 秒
━━━━━━━━━━━━━━━━━━
新备份位置: tuanki/.backups/
    `.trim();
    
    console.log(message);
    
    // 显示通知
    new Notice(
      failed.length === 0
        ? `✅ 成功迁移 ${migrated.length} 个备份到新位置`
        : `⚠️ 迁移完成：成功 ${migrated.length}，失败 ${failed.length}`,
      5000
    );
    
    return {
      success: failed.length === 0,
      migratedCount: migrated.length,
      failedCount: failed.length,
      message
    };
  }
  
  /**
   * 自动迁移（插件启动时调用）
   */
  async autoMigrate(): Promise<void> {
    try {
      const needs = await this.needsMigration();
      
      if (!needs) {
        return;
      }
      
      console.log('🔄 检测到旧版本备份，开始自动迁移...');
      
      // 延迟2秒再迁移，避免影响插件启动
      setTimeout(async () => {
        const result = await this.migrateBackupsFromSettings();
        
        if (result.success) {
          console.log('✅ 自动迁移成功');
        } else {
          console.warn('⚠️ 自动迁移部分失败，部分备份可能需要手动处理');
        }
      }, 2000);
    } catch (error) {
      console.error('❌ 自动迁移失败:', error);
    }
  }
}


