/**
 * 响应式备份存储
 * 普通 TypeScript 类，用于在 Svelte 组件中管理备份状态
 */

import type { Plugin } from 'obsidian';
import { SmartBackupEngine, type BackupOptions } from '../services/backup/SmartBackupEngine';
import type {
  BackupInfo,
  OperationType
} from '../types/data-management-types';

const MAX_BACKUPS = 3;

export class BackupReactiveStore {
  // 核心状态（普通属性）
  public backups: BackupInfo[] = [];
  public isLoading: boolean = false;
  public error: string | null = null;
  public currentOperation: {
    type: OperationType;
    progress: number;
    status: string;
  } | null = null;

  // 备份引擎
  private engine: SmartBackupEngine;
  
  // 状态变化回调
  private onStateChange: (() => void) | null = null;

  constructor(private plugin: Plugin) {
    this.engine = new SmartBackupEngine(plugin);
  }

  // 注册状态变化回调
  subscribe(callback: () => void) {
    this.onStateChange = callback;
  }

  // 触发状态更新
  private notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange();
    }
  }

  // 计算统计信息
  get stats() {
    const total = this.backups.length;
    const totalSize = this.backups.reduce((sum, b) => sum + b.size, 0);
    const validCount = this.backups.filter(b => b.isValid).length;
    const invalidBackups = this.backups.filter(b => !b.isValid);

    return {
      total,
      totalSize,
      validCount,
      invalidCount: total - validCount,
      invalidBackups,
      needsCleanup: total > MAX_BACKUPS,
      oldestBackup: this.backups[this.backups.length - 1],
      newestBackup: this.backups[0]
    };
  }

  /**
   * 加载备份列表
   */
  async loadBackups(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.notifyStateChange();

    try {
      const backups = await this.engine.listBackups();
      this.backups = backups;
    } catch (error) {
      console.error('加载备份列表失败:', error);
      this.error = error instanceof Error ? error.message : '加载失败';
      this.backups = [];
    } finally {
      this.isLoading = false;
      this.notifyStateChange();
    }
  }

  /**
   * 创建备份
   */
  async createBackup(description?: string): Promise<BackupInfo | null> {
    this.currentOperation = {
      type: 'backup' as OperationType,
      progress: 0,
      status: '准备创建备份...'
    };
    this.error = null;
    this.notifyStateChange();

    try {
      // 注册进度回调
      this.engine.onProgress((progress) => {
        if (this.currentOperation) {
          this.currentOperation = {
            ...this.currentOperation,
            progress: progress.percentage,
            status: progress.message
          };
          this.notifyStateChange();
        }
      });

      const backup = await this.engine.createBackup({
        description,
        autoCleanup: true,
        type: 'manual'  // 标记为手动备份
      });

      // 增量更新：添加到列表头部
      this.backups = [backup, ...this.backups];

      this.currentOperation = null;
      this.notifyStateChange();
      return backup;
    } catch (error) {
      console.error('创建备份失败:', error);
      this.error = error instanceof Error ? error.message : '创建备份失败';
      this.currentOperation = null;
      this.notifyStateChange();
      return null;
    }
  }

  /**
   * 删除备份
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    this.error = null;

    try {
      await this.engine.deleteBackup(backupId);

      // 响应式更新：从列表中移除
      this.backups = this.backups.filter(b => b.id !== backupId);
      this.notifyStateChange();

      return true;
    } catch (error) {
      console.error('删除备份失败:', error);
      this.error = error instanceof Error ? error.message : '删除备份失败';
      this.notifyStateChange();
      return false;
    }
  }

  /**
   * 自动修复备份
   */
  async autoRepairBackup(backupId: string): Promise<boolean> {
    this.error = null;

    try {
      const result = await this.engine.autoRepair(backupId);

      if (result.success) {
        // 更新备份状态
        const index = this.backups.findIndex(b => b.id === backupId);
        if (index !== -1) {
          // 创建新对象以触发响应式更新
          this.backups[index] = {
            ...this.backups[index],
            isValid: true
          };
          // 强制更新数组引用
          this.backups = [...this.backups];
          this.notifyStateChange();
        }
        return true;
      } else {
        this.error = result.error || '修复失败';
        this.notifyStateChange();
        return false;
      }
    } catch (error) {
      console.error('自动修复失败:', error);
      this.error = error instanceof Error ? error.message : '修复失败';
      this.notifyStateChange();
      return false;
    }
  }

  /**
   * 批量修复所有无效备份
   */
  async autoRepairAll(): Promise<{ success: number; failed: number }> {
    const invalidBackups = this.backups.filter(b => !b.isValid);
    let success = 0;
    let failed = 0;

    for (const backup of invalidBackups) {
      const result = await this.autoRepairBackup(backup.id);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * 刷新单个备份的验证状态
   */
  async refreshBackupValidation(backupId: string): Promise<void> {
    try {
      const validation = await this.engine.validateBackup(backupId);
      
      const index = this.backups.findIndex(b => b.id === backupId);
      if (index !== -1) {
        this.backups[index] = {
          ...this.backups[index],
          isValid: validation.passed
        };
        // 强制更新数组引用
        this.backups = [...this.backups];
        this.notifyStateChange();
      }
    } catch (error) {
      console.error('刷新验证状态失败:', error);
    }
  }

  /**
   * 批量清理所有无效备份
   */
  async cleanupInvalidBackups(): Promise<{ deleted: number; failed: number } | null> {
    this.currentOperation = {
      type: 'cleanup' as OperationType,
      progress: 0,
      status: '正在清理无效备份...'
    };
    this.error = null;
    this.notifyStateChange();

    try {
      const result = await this.engine.cleanupInvalidBackups();
      
      // 重新加载备份列表
      await this.loadBackups();
      
      this.currentOperation = null;
      this.notifyStateChange();
      return result;
    } catch (error) {
      console.error('清理无效备份失败:', error);
      this.error = error instanceof Error ? error.message : '清理无效备份失败';
      this.currentOperation = null;
      this.notifyStateChange();
      return null;
    }
  }

  /**
   * 预览备份内容
   */
  async previewBackup(backupId: string): Promise<{
    decks: any[];
    cards: any[];
    deckCount: number;
    cardCount: number;
  } | null> {
    try {
      const result = await this.engine.previewBackup(backupId);
      return result;
    } catch (error) {
      console.error('预览备份失败:', error);
      this.error = error instanceof Error ? error.message : '预览备份失败';
      this.notifyStateChange();
      return null;
    }
  }

  /**
   * 清除错误状态
   */
  clearError(): void {
    this.error = null;
    this.notifyStateChange();
  }

  /**
   * 重置存储状态
   */
  reset(): void {
    this.backups = [];
    this.isLoading = false;
    this.error = null;
    this.currentOperation = null;
    this.notifyStateChange();
  }
}

