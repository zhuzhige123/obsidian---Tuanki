/**
 * 统一状态管理系统
 * 使用Svelte 5 Runes提供全局状态管理和同步
 */

import type { Card } from '../data/types';
import type { SimplifiedParsingSettings } from '../types/newCardParsingTypes';
import type { PreviewData } from '../components/preview/ContentPreviewEngine';
import { globalPerformanceMonitor } from '../utils/parsing-performance-monitor';

// 应用状态接口
export interface AppState {
  // 用户界面状态
  ui: {
    currentView: 'study' | 'settings' | 'analytics' | 'deck';
    isLoading: boolean;
    sidebarCollapsed: boolean;
    theme: 'auto' | 'light' | 'dark';
    language: string;
  };

  // 学习状态
  study: {
    currentCard: Card | null;
    sessionCards: Card[];
    currentIndex: number;
    sessionStats: {
      totalCards: number;
      reviewedCards: number;
      correctAnswers: number;
      sessionStartTime: number;
      sessionDuration: number;
    };
    studyMode: 'review' | 'learn' | 'cram';
    showAnswer: boolean;
  };

  // 设置状态
  settings: {
    parsing: SimplifiedParsingSettings;
    ui: {
      cardDisplayMode: 'compact' | 'comfortable' | 'spacious';
      animationsEnabled: boolean;
      soundEnabled: boolean;
      keyboardShortcuts: Record<string, string>;
    };
    sync: {
      enabled: boolean;
      lastSyncTime: number;
      syncStatus: 'idle' | 'syncing' | 'error' | 'success';
    };
  };

  // 预览状态
  preview: {
    currentPreview: PreviewData | null;
    previewCache: Map<string, PreviewData>;
    renderingMode: 'performance' | 'quality';
    errorCount: number;
  };

  // 错误状态
  errors: {
    globalErrors: AppError[];
    componentErrors: Map<string, ComponentError>;
    recoveryAttempts: number;
    lastErrorTime: number;
  };

  // 性能状态
  performance: {
    memoryUsage: number;
    renderTime: number;
    cacheHitRate: number;
    operationCount: number;
  };
}

// 错误类型定义
export interface AppError {
  id: string;
  type: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  resolved: boolean;
}

export interface ComponentError {
  componentName: string;
  error: Error;
  timestamp: number;
  recoveryAttempts: number;
  recovered: boolean;
}

// 状态变更动作类型
export type StateAction = 
  | { type: 'SET_CURRENT_VIEW'; payload: AppState['ui']['currentView'] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_CURRENT_CARD'; payload: Card | null }
  | { type: 'UPDATE_SESSION_STATS'; payload: Partial<AppState['study']['sessionStats']> }
  | { type: 'SET_SHOW_ANSWER'; payload: boolean }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppState['settings']> }
  | { type: 'SET_PREVIEW_DATA'; payload: PreviewData | null }
  | { type: 'ADD_ERROR'; payload: AppError }
  | { type: 'RESOLVE_ERROR'; payload: string }
  | { type: 'UPDATE_PERFORMANCE'; payload: Partial<AppState['performance']> }
  | { type: 'RESET_STATE' };

/**
 * 统一状态管理器类
 */
export class UnifiedStateManager {
  private state = $state<AppState>(this.getInitialState());
  private subscribers = new Set<(state: AppState) => void>();
  private persistenceKey = 'tuanki-app-state';
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.loadPersistedState();
    this.startAutoSave();
    this.setupPerformanceMonitoring();
  }

  /**
   * 获取初始状态
   */
  private getInitialState(): AppState {
    return {
      ui: {
        currentView: 'study',
        isLoading: false,
        sidebarCollapsed: false,
        theme: 'auto',
        language: 'zh-CN'
      },
      study: {
        currentCard: null,
        sessionCards: [],
        currentIndex: 0,
        sessionStats: {
          totalCards: 0,
          reviewedCards: 0,
          correctAnswers: 0,
          sessionStartTime: Date.now(),
          sessionDuration: 0
        },
        studyMode: 'review',
        showAnswer: false
      },
      settings: {
        parsing: {
          enableTemplateSystem: true,
          enableBatchParsing: true,
          symbols: {
            divider: '---div---',
            rangeStart: '---start---',
            rangeEnd: '---end---',
            clozeStart: '==',
            clozeEnd: '=='
          },
          templates: [],
          fieldTemplates: []
        },
        ui: {
          cardDisplayMode: 'comfortable',
          animationsEnabled: true,
          soundEnabled: false,
          keyboardShortcuts: {
            'show-answer': 'Space',
            'next-card': 'ArrowRight',
            'prev-card': 'ArrowLeft',
            'mark-correct': '1',
            'mark-incorrect': '2'
          }
        },
        sync: {
          enabled: false,
          lastSyncTime: 0,
          syncStatus: 'idle'
        }
      },
      preview: {
        currentPreview: null,
        previewCache: new Map(),
        renderingMode: 'quality',
        errorCount: 0
      },
      errors: {
        globalErrors: [],
        componentErrors: new Map(),
        recoveryAttempts: 0,
        lastErrorTime: 0
      },
      performance: {
        memoryUsage: 0,
        renderTime: 0,
        cacheHitRate: 0,
        operationCount: 0
      }
    };
  }

  /**
   * 获取当前状态
   */
  getState(): AppState {
    return this.state;
  }

  /**
   * 分发状态变更动作
   */
  dispatch(action: StateAction): void {
    const previousState = { ...this.state };
    
    try {
      this.state = this.reducer(this.state, action);
      
      // 通知订阅者
      this.notifySubscribers();
      
      // 记录状态变更
      this.logStateChange(action, previousState, this.state);
      
    } catch (error) {
      console.error('状态变更失败:', error);
      this.addError({
        id: `state-error-${Date.now()}`,
        type: 'critical',
        message: `状态变更失败: ${action.type}`,
        timestamp: Date.now(),
        context: { action, error },
        resolved: false
      });
    }
  }

  /**
   * 状态缩减器
   */
  private reducer(state: AppState, action: StateAction): AppState {
    switch (action.type) {
      case 'SET_CURRENT_VIEW':
        return {
          ...state,
          ui: { ...state.ui, currentView: action.payload }
        };

      case 'SET_LOADING':
        return {
          ...state,
          ui: { ...state.ui, isLoading: action.payload }
        };

      case 'SET_CURRENT_CARD':
        return {
          ...state,
          study: { ...state.study, currentCard: action.payload }
        };

      case 'UPDATE_SESSION_STATS':
        return {
          ...state,
          study: {
            ...state.study,
            sessionStats: { ...state.study.sessionStats, ...action.payload }
          }
        };

      case 'SET_SHOW_ANSWER':
        return {
          ...state,
          study: { ...state.study, showAnswer: action.payload }
        };

      case 'UPDATE_SETTINGS':
        return {
          ...state,
          settings: { ...state.settings, ...action.payload }
        };

      case 'SET_PREVIEW_DATA':
        return {
          ...state,
          preview: { ...state.preview, currentPreview: action.payload }
        };

      case 'ADD_ERROR':
        return {
          ...state,
          errors: {
            ...state.errors,
            globalErrors: [...state.errors.globalErrors, action.payload],
            lastErrorTime: Date.now()
          }
        };

      case 'RESOLVE_ERROR':
        return {
          ...state,
          errors: {
            ...state.errors,
            globalErrors: state.errors.globalErrors.map(error =>
              error.id === action.payload ? { ...error, resolved: true } : error
            )
          }
        };

      case 'UPDATE_PERFORMANCE':
        return {
          ...state,
          performance: { ...state.performance, ...action.payload }
        };

      case 'RESET_STATE':
        return this.getInitialState();

      default:
        return state;
    }
  }

  /**
   * 订阅状态变更
   */
  subscribe(callback: (state: AppState) => void): () => void {
    this.subscribers.add(callback);
    
    // 返回取消订阅函数
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * 通知订阅者
   */
  private notifySubscribers(): void {
    this.subscribers.forEach(callback => {
      try {
        callback(this.state);
      } catch (error) {
        console.error('订阅者回调错误:', error);
      }
    });
  }

  /**
   * 添加错误
   */
  addError(error: Omit<AppError, 'id'> & { id?: string }): void {
    const errorWithId: AppError = {
      id: error.id || `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...error
    };

    this.dispatch({ type: 'ADD_ERROR', payload: errorWithId });
  }

  /**
   * 解决错误
   */
  resolveError(errorId: string): void {
    this.dispatch({ type: 'RESOLVE_ERROR', payload: errorId });
  }

  /**
   * 更新性能指标
   */
  updatePerformance(metrics: Partial<AppState['performance']>): void {
    this.dispatch({ type: 'UPDATE_PERFORMANCE', payload: metrics });
  }

  /**
   * 加载持久化状态
   */
  private loadPersistedState(): void {
    try {
      const persistedData = localStorage.getItem(this.persistenceKey);
      if (persistedData) {
        const parsed = JSON.parse(persistedData);
        
        // 合并持久化状态，保留当前状态的结构
        this.state = {
          ...this.state,
          settings: { ...this.state.settings, ...parsed.settings },
          ui: { ...this.state.ui, ...parsed.ui }
        };
      }
    } catch (error) {
      console.error('加载持久化状态失败:', error);
    }
  }

  /**
   * 保存状态到本地存储
   */
  private persistState(): void {
    try {
      const stateToPersist = {
        settings: this.state.settings,
        ui: {
          theme: this.state.ui.theme,
          language: this.state.ui.language,
          sidebarCollapsed: this.state.ui.sidebarCollapsed
        }
      };

      localStorage.setItem(this.persistenceKey, JSON.stringify(stateToPersist));
    } catch (error) {
      console.error('持久化状态失败:', error);
    }
  }

  /**
   * 开始自动保存
   */
  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      this.persistState();
    }, 30000); // 每30秒保存一次
  }

  /**
   * 停止自动保存
   */
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * 设置性能监控
   */
  private setupPerformanceMonitoring(): void {
    setInterval(() => {
      const metrics = globalPerformanceMonitor.getMetrics();
      this.updatePerformance({
        memoryUsage: metrics.memoryUsage,
        renderTime: metrics.parseTime,
        cacheHitRate: metrics.cacheHitRate,
        operationCount: metrics.totalOperations
      });
    }, 5000); // 每5秒更新一次性能指标
  }

  /**
   * 记录状态变更日志
   */
  private logStateChange(action: StateAction, previousState: AppState, newState: AppState): void {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 [StateManager] 状态变更:', {
        action: action.type,
        payload: action.type !== 'RESET_STATE' ? (action as any).payload : undefined,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 获取状态快照
   */
  getSnapshot(): AppState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stopAutoSave();
    this.persistState();
    this.subscribers.clear();
  }
}

// 全局状态管理器实例
export const globalStateManager = new UnifiedStateManager();

/**
 * 状态持久化和同步系统
 */
export class StatePersistenceManager {
  private stateManager: UnifiedStateManager;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime = 0;
  private readonly SYNC_INTERVAL = 60000; // 1分钟

  constructor(stateManager: UnifiedStateManager) {
    this.stateManager = stateManager;
    this.setupAutoSync();
  }

  /**
   * 设置自动同步
   */
  private setupAutoSync(): void {
    this.syncInterval = setInterval(() => {
      this.syncState();
    }, this.SYNC_INTERVAL);
  }

  /**
   * 同步状态
   */
  async syncState(): Promise<void> {
    const state = this.stateManager.getState();

    if (!state.settings.sync.enabled) {
      return;
    }

    try {
      this.stateManager.dispatch({
        type: 'UPDATE_SETTINGS',
        payload: {
          sync: { ...state.settings.sync, syncStatus: 'syncing' }
        }
      });

      // 模拟同步过程
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.lastSyncTime = Date.now();

      this.stateManager.dispatch({
        type: 'UPDATE_SETTINGS',
        payload: {
          sync: {
            ...state.settings.sync,
            syncStatus: 'success',
            lastSyncTime: this.lastSyncTime
          }
        }
      });

      console.log('✅ [StatePersistence] 状态同步成功');

    } catch (error) {
      console.error('❌ [StatePersistence] 状态同步失败:', error);

      this.stateManager.dispatch({
        type: 'UPDATE_SETTINGS',
        payload: {
          sync: { ...state.settings.sync, syncStatus: 'error' }
        }
      });

      this.stateManager.addError({
        type: 'warning',
        message: '状态同步失败',
        timestamp: Date.now(),
        context: { error },
        resolved: false
      });
    }
  }

  /**
   * 手动同步
   */
  async manualSync(): Promise<boolean> {
    try {
      await this.syncState();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 停止同步
   */
  stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stopSync();
  }
}

// 全局持久化管理器
export const globalPersistenceManager = new StatePersistenceManager(globalStateManager);
