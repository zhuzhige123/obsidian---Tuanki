/**
 * 自动备份调度器
 * 负责管理自动备份的定时触发和条件判断
 */

import type { Plugin } from 'obsidian';
import { Notice } from 'obsidian';
import { SmartBackupEngine } from './SmartBackupEngine';
import type { AutoBackupConfig } from '../../types/data-management-types';

export class AutoBackupScheduler {
  private engine: SmartBackupEngine;
  private timerId: number | null = null;
  private isRunning: boolean = false;
  private lastCardCount: number = 0;

  constructor(
    private plugin: Plugin,
    private getConfig: () => AutoBackupConfig,
    private saveConfig: (config: Partial<AutoBackupConfig>) => Promise<void>
  ) {
    this.engine = new SmartBackupEngine(plugin);
  }

  /**
   * 启动自动备份调度器
   */
  start(): void {
    if (this.isRunning) {
      console.log('⏰ 自动备份调度器已在运行');
      return;
    }

    const config = this.getConfig();
    if (!config.enabled) {
      console.log('⏰ 自动备份已禁用');
      return;
    }

    this.isRunning = true;
    console.log(`⏰ 启动自动备份调度器，间隔: ${config.intervalHours} 小时`);

    // 设置定时器
    const intervalMs = config.intervalHours * 60 * 60 * 1000;
    this.timerId = window.setInterval(() => {
      this.checkAndBackup('scheduled');
    }, intervalMs);

    // 初始化卡片计数
    this.updateCardCount();
  }

  /**
   * 停止自动备份调度器
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }

    this.isRunning = false;
    console.log('⏰ 自动备份调度器已停止');
  }

  /**
   * 重启调度器（配置更改时）
   */
  restart(): void {
    console.log('⏰ 重启自动备份调度器...');
    this.stop();
    this.start();
  }

  /**
   * 检查并执行启动备份
   */
  async checkAndCreateStartupBackup(): Promise<void> {
    const config = this.getConfig();
    
    if (!config.enabled || !config.triggers.onStartup) {
      console.log('⏰ 启动备份已禁用');
      return;
    }

    // 检查是否需要创建启动备份
    if (!this.shouldCreateStartupBackup()) {
      console.log('⏰ 跳过启动备份（时间间隔未到）');
      return;
    }

    console.log('⏰ 执行启动备份...');
    await this.createAutoBackup('startup');
  }

  /**
   * 检查卡片数量变化并触发备份
   */
  async checkCardCountThreshold(): Promise<void> {
    const config = this.getConfig();
    
    if (!config.enabled || !config.triggers.onCardThreshold) {
      return;
    }

    const currentCount = await this.getCardCount();
    const difference = Math.abs(currentCount - this.lastCardCount);

    if (difference >= config.triggers.cardThresholdCount) {
      console.log(`⏰ 卡片数量变化达到阈值: ${difference} (阈值: ${config.triggers.cardThresholdCount})`);
      await this.createAutoBackup('card_threshold');
      this.lastCardCount = currentCount;
    }
  }

  /**
   * 手动触发一次自动备份（用于测试）
   */
  async triggerManualAutoBackup(): Promise<boolean> {
    console.log('⏰ 手动触发自动备份');
    return await this.createAutoBackup('manual_trigger');
  }

  /**
   * 检查并执行备份
   */
  private async checkAndBackup(reason: string): Promise<void> {
    const config = this.getConfig();
    
    if (!config.enabled) {
      console.log('⏰ 自动备份已禁用，跳过');
      return;
    }

    // 检查时间间隔
    if (!this.shouldCreateTimedBackup()) {
      console.log('⏰ 时间间隔未到，跳过自动备份');
      return;
    }

    console.log(`⏰ 执行自动备份 (原因: ${reason})`);
    await this.createAutoBackup(reason);
  }

  /**
   * 创建自动备份
   */
  private async createAutoBackup(trigger: string): Promise<boolean> {
    const config = this.getConfig();
    
    try {
      console.log(`⏰ 开始创建自动备份 (触发: ${trigger})`);
      
      const backup = await this.engine.createBackup({
        description: `自动备份 (${trigger})`,
        autoCleanup: true,
        type: 'auto'  // 标记为自动备份
      });

      // 更新统计信息
      await this.saveConfig({
        lastAutoBackupTime: new Date().toISOString(),
        autoBackupCount: (config.autoBackupCount || 0) + 1
      });

      // 显示通知
      if (config.notifications.onSuccess) {
        new Notice(`✅ 自动备份完成 (${this.formatFileSize(backup.size)})`);
      }

      console.log(`⏰ 自动备份完成: ${backup.id}`);
      return true;
    } catch (error) {
      console.error('⏰ 自动备份失败:', error);
      
      // 显示失败通知
      if (config.notifications.onFailure) {
        new Notice(`❌ 自动备份失败: ${error instanceof Error ? error.message : '未知错误'}`, 5000);
      }

      return false;
    }
  }

  /**
   * 判断是否应该创建启动备份
   */
  private shouldCreateStartupBackup(): boolean {
    const config = this.getConfig();
    
    if (!config.lastAutoBackupTime) {
      return true; // 首次启动，创建备份
    }

    const lastBackupTime = new Date(config.lastAutoBackupTime).getTime();
    const now = Date.now();
    const intervalMs = config.intervalHours * 60 * 60 * 1000;

    return (now - lastBackupTime) >= intervalMs;
  }

  /**
   * 判断是否应该创建定时备份
   */
  private shouldCreateTimedBackup(): boolean {
    const config = this.getConfig();
    
    if (!config.lastAutoBackupTime) {
      return true;
    }

    const lastBackupTime = new Date(config.lastAutoBackupTime).getTime();
    const now = Date.now();
    const intervalMs = config.intervalHours * 60 * 60 * 1000;

    return (now - lastBackupTime) >= intervalMs;
  }

  /**
   * 获取当前卡片数量
   */
  private async getCardCount(): Promise<number> {
    try {
      const dataStorage = (this.plugin as any).dataStorage;
      if (!dataStorage) {
        return 0;
      }

      const cards = await dataStorage.getCards();
      return Array.isArray(cards) ? cards.length : 0;
    } catch (error) {
      console.error('获取卡片数量失败:', error);
      return 0;
    }
  }

  /**
   * 更新卡片计数
   */
  private async updateCardCount(): Promise<void> {
    this.lastCardCount = await this.getCardCount();
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  /**
   * 获取下次备份时间
   */
  getNextBackupTime(): Date | null {
    const config = this.getConfig();
    
    if (!config.enabled || !config.lastAutoBackupTime) {
      return null;
    }

    const lastBackupTime = new Date(config.lastAutoBackupTime);
    const intervalMs = config.intervalHours * 60 * 60 * 1000;
    
    return new Date(lastBackupTime.getTime() + intervalMs);
  }

  /**
   * 获取调度器状态
   */
  getStatus(): {
    isRunning: boolean;
    nextBackupTime: Date | null;
    lastBackupTime: string | null;
    totalAutoBackups: number;
  } {
    const config = this.getConfig();
    
    return {
      isRunning: this.isRunning,
      nextBackupTime: this.getNextBackupTime(),
      lastBackupTime: config.lastAutoBackupTime || null,
      totalAutoBackups: config.autoBackupCount || 0
    };
  }
}





