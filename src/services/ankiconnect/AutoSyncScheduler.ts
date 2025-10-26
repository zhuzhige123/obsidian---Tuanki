/**
 * 自动同步调度器
 * 负责定时同步和文件变更检测同步
 */

import type { App, TFile } from 'obsidian';
import type AnkiPlugin from '../../main';
import type { AnkiConnectService } from './AnkiConnectService';

/**
 * 同步任务类型
 */
export interface SyncTask {
  type: 'scheduled' | 'on_change' | 'manual';
  timestamp: number;
  triggeredBy?: string;  // 文件路径或事件名
}

/**
 * 自动同步调度器配置
 */
export interface AutoSyncSchedulerConfig {
  intervalMinutes: number;  // 定时同步间隔（分钟）
  syncOnStartup: boolean;  // 启动时同步
  onlyWhenAnkiRunning: boolean;  // 仅在 Anki 运行时同步
  enableFileWatcher: boolean;  // 启用文件变更检测
  debounceDelay: number;  // 文件变更防抖延迟（毫秒）
}

/**
 * 自动同步调度器
 */
export class AutoSyncScheduler {
  private intervalTimer: number | null = null;
  private debounceTimer: number | null = null;
  private isRunning = false;
  private isSyncing = false;

  // Obsidian 事件引用（用于清理）
  private fileModifyRef: any = null;

  constructor(
    private app: App,
    private plugin: AnkiPlugin,
    private ankiService: AnkiConnectService,
    private config: AutoSyncSchedulerConfig
  ) {}

  /**
   * 启动调度器
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[AutoSyncScheduler] 调度器已在运行中');
      return;
    }

    console.log('[AutoSyncScheduler] 启动自动同步调度器', {
      定时间隔: `${this.config.intervalMinutes}分钟`,
      启动时同步: this.config.syncOnStartup,
      文件监听: this.config.enableFileWatcher
    });

    this.isRunning = true;

    // 启动时同步
    if (this.config.syncOnStartup) {
      console.log('[AutoSyncScheduler] 执行启动时同步...');
      this.scheduleSyncTask('scheduled', 2000); // 延迟 2 秒执行
    }

    // 启动定时同步
    this.startScheduledSync();

    // 启动文件变更监听
    if (this.config.enableFileWatcher) {
      this.startFileWatcher();
    }
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[AutoSyncScheduler] 停止自动同步调度器');

    // 清理定时器
    if (this.intervalTimer !== null) {
      window.clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // 清理文件监听
    if (this.fileModifyRef) {
      this.app.vault.offref(this.fileModifyRef);
      this.fileModifyRef = null;
    }

    this.isRunning = false;
  }

  /**
   * 启动定时同步
   */
  private startScheduledSync(): void {
    const intervalMs = this.config.intervalMinutes * 60 * 1000;

    console.log(`[AutoSyncScheduler] 启动定时同步，间隔: ${this.config.intervalMinutes} 分钟`);

    this.intervalTimer = window.setInterval(() => {
      console.log('[AutoSyncScheduler] 触发定时同步');
      this.scheduleSyncTask('scheduled');
    }, intervalMs);
  }

  /**
   * 启动文件变更监听
   */
  private startFileWatcher(): void {
    console.log('[AutoSyncScheduler] 启动文件变更监听');

    this.fileModifyRef = this.app.vault.on('modify', (file) => {
      this.onFileChange(file);
    });
  }

  /**
   * 文件变更处理（带防抖）
   */
  private onFileChange(file: TFile): void {
    // 只监听 Tuanki 卡片文件
    if (!this.isTuankiCardFile(file)) {
      return;
    }

    console.log('[AutoSyncScheduler] 检测到卡片文件变更:', file.path);

    // 清理已有的防抖定时器
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }

    // 设置新的防抖定时器
    this.debounceTimer = window.setTimeout(() => {
      console.log('[AutoSyncScheduler] 触发变更检测同步');
      this.scheduleSyncTask('on_change', 0, file.path);
    }, this.config.debounceDelay);
  }

  /**
   * 判断是否为 Tuanki 卡片文件
   */
  private isTuankiCardFile(file: TFile): boolean {
    // 检查是否在 Tuanki 数据文件夹中
    const tuankiFolder = this.plugin.settings.tuanki?.dataFolder || 'tuanki';
    if (!file.path.startsWith(tuankiFolder)) {
      return false;
    }

    // 检查是否为 markdown 文件
    if (file.extension !== 'md') {
      return false;
    }

    // 排除模板文件和其他非卡片文件
    if (file.path.includes('template') || file.path.includes('settings')) {
      return false;
    }

    return true;
  }

  /**
   * 计划同步任务
   */
  private scheduleSyncTask(
    type: SyncTask['type'],
    delay: number = 0,
    triggeredBy?: string
  ): void {
    const task: SyncTask = {
      type,
      timestamp: Date.now(),
      triggeredBy
    };

    if (delay > 0) {
      setTimeout(() => this.executeSync(task), delay);
    } else {
      this.executeSync(task);
    }
  }

  /**
   * 执行同步任务
   */
  private async executeSync(task: SyncTask): Promise<void> {
    // 防止重复同步
    if (this.isSyncing) {
      console.log('[AutoSyncScheduler] 同步正在进行中，跳过本次任务');
      return;
    }

    // 检查是否仅在 Anki 运行时同步
    if (this.config.onlyWhenAnkiRunning) {
      const connectionState = this.ankiService.getConnectionState();
      if (connectionState.status !== 'connected') {
        console.log('[AutoSyncScheduler] Anki 未连接，跳过同步');
        return;
      }
    }

    this.isSyncing = true;

    try {
      console.log('[AutoSyncScheduler] 🔄 开始执行同步:', {
        类型: task.type,
        触发源: task.triggeredBy || '无'
      });

      // 调用 AnkiConnectService 的增量同步方法
      const result = await this.ankiService.performIncrementalSync();

      console.log('[AutoSyncScheduler] ✅ 同步完成:', {
        总卡片数: result.totalCards,
        变更数: result.changedCards,
        导入数: result.importedCards,
        导出数: result.exportedCards,
        跳过数: result.skippedCards,
        错误数: result.errors.length
      });

      // 如果是定时同步或手动同步，显示通知
      if (task.type === 'scheduled' || task.type === 'manual') {
        this.showCompletionNotice(result);
      }

    } catch (error) {
      console.error('[AutoSyncScheduler] ❌ 同步失败:', error);
      
      // 显示错误通知
      if (this.plugin.app && this.plugin.app.workspace) {
        const { Notice } = require('obsidian');
        new Notice(`同步失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 显示同步完成通知
   */
  private showCompletionNotice(result: any): void {
    if (!this.plugin.app || !this.plugin.app.workspace) {
      return;
    }

    const { Notice } = require('obsidian');
    
    if (result.changedCards === 0) {
      new Notice('同步完成：无需更新');
    } else {
      const message = `同步完成：导入 ${result.importedCards} 张，导出 ${result.exportedCards} 张`;
      new Notice(message);
    }
  }

  /**
   * 手动触发同步
   */
  public manualSync(): void {
    console.log('[AutoSyncScheduler] 手动触发同步');
    this.scheduleSyncTask('manual');
  }

  /**
   * 获取调度器状态
   */
  public getStatus(): {
    isRunning: boolean;
    isSyncing: boolean;
  } {
    return {
      isRunning: this.isRunning,
      isSyncing: this.isSyncing
    };
  }
}




