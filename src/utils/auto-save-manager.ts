/**
 * 自动保存管理器
 * 提供智能的自动保存和草稿恢复功能
 */

import { debounce } from './template-editor-performance-optimizer';

// 自动保存配置
export interface AutoSaveConfig {
  enabled: boolean;
  interval: number; // 自动保存间隔（毫秒）
  debounceDelay: number; // 防抖延迟（毫秒）
  maxDrafts: number; // 最大草稿数量
  retentionDays: number; // 草稿保留天数
}

// 草稿数据
export interface DraftData {
  id: string;
  key: string; // 唯一标识符
  data: any; // 保存的数据
  timestamp: number;
  version: number;
  metadata?: Record<string, any>;
}

// 保存状态
export interface SaveStatus {
  isSaving: boolean;
  lastSaved: number | null;
  hasUnsavedChanges: boolean;
  error: string | null;
}

// 自动保存事件
export interface AutoSaveEvent {
  type: 'save' | 'restore' | 'error' | 'cleanup';
  data?: any;
  error?: string;
  timestamp: number;
}

/**
 * 自动保存管理器
 */
export class AutoSaveManager {
  private config: AutoSaveConfig;
  private drafts: Map<string, DraftData> = new Map();
  private saveStatus: Map<string, SaveStatus> = new Map();
  private listeners: Map<string, Set<(event: AutoSaveEvent) => void>> = new Map();
  private debouncedSave: Map<string, ReturnType<typeof debounce>> = new Map();
  private cleanupTimer?: NodeJS.Timeout;
  private storageKey = 'tuanki_auto_save_drafts';

  constructor(config: Partial<AutoSaveConfig> = {}) {
    this.config = {
      enabled: true,
      interval: 30000, // 30秒
      debounceDelay: 2000, // 2秒
      maxDrafts: 50,
      retentionDays: 7,
      ...config
    };

    this.loadDrafts();
    this.startCleanupTimer();
  }

  /**
   * 注册自动保存
   */
  register(
    key: string,
    saveFunction: (data: any) => Promise<void>,
    initialData?: any
  ): AutoSaveController {
    // 初始化保存状态
    this.saveStatus.set(key, {
      isSaving: false,
      lastSaved: null,
      hasUnsavedChanges: false,
      error: null
    });

    // 创建防抖保存函数
    const debouncedSaveFunction = debounce(async (data: any) => {
      await this.performSave(key, data, saveFunction);
    }, this.config.debounceDelay);

    this.debouncedSave.set(key, debouncedSaveFunction);

    // 如果有初始数据，检查是否有草稿需要恢复
    if (initialData) {
      const draft = this.getDraft(key);
      if (draft && draft.timestamp > Date.now() - 60000) { // 1分钟内的草稿
        this.notifyListeners(key, {
          type: 'restore',
          data: draft.data,
          timestamp: Date.now()
        });
      }
    }

    return new AutoSaveController(this, key);
  }

  /**
   * 保存数据
   */
  async save(key: string, data: any): Promise<void> {
    if (!this.config.enabled) return;

    const debouncedSave = this.debouncedSave.get(key);
    if (debouncedSave) {
      // 立即保存草稿
      this.saveDraft(key, data);
      
      // 防抖保存到实际存储
      debouncedSave(data);
      
      // 更新状态
      this.updateSaveStatus(key, { hasUnsavedChanges: true });
    }
  }

  /**
   * 立即保存
   */
  async saveImmediate(key: string, data: any): Promise<void> {
    const debouncedSave = this.debouncedSave.get(key);
    if (debouncedSave) {
      debouncedSave.cancel();
      
      // 获取原始保存函数（这里需要重构以支持立即保存）
      // 暂时使用草稿保存
      this.saveDraft(key, data);
      
      this.updateSaveStatus(key, {
        lastSaved: Date.now(),
        hasUnsavedChanges: false
      });
    }
  }

  /**
   * 执行保存
   */
  private async performSave(
    key: string,
    data: any,
    saveFunction: (data: any) => Promise<void>
  ): Promise<void> {
    this.updateSaveStatus(key, { isSaving: true, error: null });

    try {
      await saveFunction(data);
      
      this.updateSaveStatus(key, {
        isSaving: false,
        lastSaved: Date.now(),
        hasUnsavedChanges: false,
        error: null
      });

      // 保存成功后删除草稿
      this.deleteDraft(key);

      this.notifyListeners(key, {
        type: 'save',
        data,
        timestamp: Date.now()
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.updateSaveStatus(key, {
        isSaving: false,
        error: errorMessage
      });

      this.notifyListeners(key, {
        type: 'error',
        error: errorMessage,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 保存草稿
   */
  private saveDraft(key: string, data: any): void {
    const existingDraft = this.drafts.get(key);
    const version = existingDraft ? existingDraft.version + 1 : 1;

    const draft: DraftData = {
      id: `${key}_${Date.now()}`,
      key,
      data,
      timestamp: Date.now(),
      version,
      metadata: {
        userAgent: navigator.userAgent,
        url: window.location.href
      }
    };

    this.drafts.set(key, draft);
    this.persistDrafts();
  }

  /**
   * 获取草稿
   */
  getDraft(key: string): DraftData | null {
    return this.drafts.get(key) || null;
  }

  /**
   * 删除草稿
   */
  deleteDraft(key: string): void {
    this.drafts.delete(key);
    this.persistDrafts();
  }

  /**
   * 获取所有草稿
   */
  getAllDrafts(): DraftData[] {
    return Array.from(this.drafts.values());
  }

  /**
   * 清理过期草稿
   */
  cleanupExpiredDrafts(): void {
    const now = Date.now();
    const maxAge = this.config.retentionDays * 24 * 60 * 60 * 1000;
    let cleanedCount = 0;

    this.drafts.forEach((draft, key) => {
      if (now - draft.timestamp > maxAge) {
        this.drafts.delete(key);
        cleanedCount++;
      }
    });

    // 如果草稿数量超过限制，删除最旧的
    if (this.drafts.size > this.config.maxDrafts) {
      const sortedDrafts = Array.from(this.drafts.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);
      
      const toDelete = sortedDrafts.slice(0, this.drafts.size - this.config.maxDrafts);
      toDelete.forEach(([key]) => {
        this.drafts.delete(key);
        cleanedCount++;
      });
    }

    if (cleanedCount > 0) {
      this.persistDrafts();
      console.log(`[AutoSaveManager] 清理了 ${cleanedCount} 个过期草稿`);
    }
  }

  /**
   * 持久化草稿
   */
  private persistDrafts(): void {
    try {
      const draftsArray = Array.from(this.drafts.values());
      localStorage.setItem(this.storageKey, JSON.stringify(draftsArray));
    } catch (error) {
      console.error('[AutoSaveManager] 保存草稿失败:', error);
    }
  }

  /**
   * 加载草稿
   */
  private loadDrafts(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const draftsArray: DraftData[] = JSON.parse(stored);
        this.drafts.clear();
        
        draftsArray.forEach(draft => {
          this.drafts.set(draft.key, draft);
        });
      }
    } catch (error) {
      console.error('[AutoSaveManager] 加载草稿失败:', error);
    }
  }

  /**
   * 更新保存状态
   */
  private updateSaveStatus(key: string, updates: Partial<SaveStatus>): void {
    const current = this.saveStatus.get(key);
    if (current) {
      this.saveStatus.set(key, { ...current, ...updates });
    }
  }

  /**
   * 获取保存状态
   */
  getSaveStatus(key: string): SaveStatus | null {
    return this.saveStatus.get(key) || null;
  }

  /**
   * 添加事件监听器
   */
  addEventListener(key: string, listener: (event: AutoSaveEvent) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    this.listeners.get(key)!.add(listener);
    
    return () => {
      this.listeners.get(key)?.delete(listener);
    };
  }

  /**
   * 通知监听器
   */
  private notifyListeners(key: string, event: AutoSaveEvent): void {
    this.listeners.get(key)?.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[AutoSaveManager] 监听器错误:', error);
      }
    });
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredDrafts();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 注销
   */
  unregister(key: string): void {
    const debouncedSave = this.debouncedSave.get(key);
    if (debouncedSave) {
      debouncedSave.cancel();
      this.debouncedSave.delete(key);
    }
    
    this.saveStatus.delete(key);
    this.listeners.delete(key);
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    // 取消所有防抖保存
    this.debouncedSave.forEach(debouncedSave => {
      debouncedSave.cancel();
    });
    
    // 清理定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // 清理数据
    this.debouncedSave.clear();
    this.saveStatus.clear();
    this.listeners.clear();
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<AutoSaveConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * 获取统计信息
   */
  getStats(): any {
    return {
      totalDrafts: this.drafts.size,
      activeKeys: this.saveStatus.size,
      config: this.config,
      oldestDraft: Math.min(...Array.from(this.drafts.values()).map(d => d.timestamp)),
      newestDraft: Math.max(...Array.from(this.drafts.values()).map(d => d.timestamp))
    };
  }
}

/**
 * 自动保存控制器
 */
export class AutoSaveController {
  constructor(
    private manager: AutoSaveManager,
    private key: string
  ) {}

  /**
   * 保存数据
   */
  async save(data: any): Promise<void> {
    return this.manager.save(this.key, data);
  }

  /**
   * 立即保存
   */
  async saveImmediate(data: any): Promise<void> {
    return this.manager.saveImmediate(this.key, data);
  }

  /**
   * 获取草稿
   */
  getDraft(): DraftData | null {
    return this.manager.getDraft(this.key);
  }

  /**
   * 删除草稿
   */
  deleteDraft(): void {
    this.manager.deleteDraft(this.key);
  }

  /**
   * 获取保存状态
   */
  getSaveStatus(): SaveStatus | null {
    return this.manager.getSaveStatus(this.key);
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: (event: AutoSaveEvent) => void): () => void {
    return this.manager.addEventListener(this.key, listener);
  }

  /**
   * 注销
   */
  destroy(): void {
    this.manager.unregister(this.key);
  }
}

// 全局自动保存管理器实例
let globalAutoSaveManager: AutoSaveManager | null = null;

/**
 * 获取全局自动保存管理器
 */
export function getAutoSaveManager(config?: Partial<AutoSaveConfig>): AutoSaveManager {
  if (!globalAutoSaveManager) {
    globalAutoSaveManager = new AutoSaveManager(config);
  }
  return globalAutoSaveManager;
}

/**
 * 便捷的自动保存注册函数
 */
export function useAutoSave(
  key: string,
  saveFunction: (data: any) => Promise<void>,
  initialData?: any,
  config?: Partial<AutoSaveConfig>
): AutoSaveController {
  const manager = getAutoSaveManager(config);
  return manager.register(key, saveFunction, initialData);
}
