/**
 * 统一状态管理系统
 * 解决根本问题：状态分散、数据流混乱、组件间状态不一致
 */

import { writable, derived, get, type Writable, type Readable } from 'svelte/store';
import { TIME_CONSTANTS } from '../constants/app-constants';

// ============================================================================
// 状态管理核心接口
// ============================================================================

/**
 * 状态变更事件
 */
export interface StateChangeEvent<T = any> {
  type: string;
  payload: T;
  timestamp: number;
  source: string;
}

/**
 * 状态管理器接口
 */
export interface StateManager<T> {
  readonly state: Readable<T>;
  dispatch(event: StateChangeEvent): void;
  getSnapshot(): T;
  subscribe(listener: (state: T) => void): () => void;
}

/**
 * 状态中间件接口
 */
export interface StateMiddleware {
  name: string;
  process<T>(event: StateChangeEvent<T>, next: (event: StateChangeEvent<T>) => void): void;
}

// ============================================================================
// 应用状态定义
// ============================================================================

/**
 * 应用全局状态
 */
export interface AppState {
  // 用户界面状态
  ui: UIState;

  // 数据状态
  data: DataState;

  // 学习状态
  learning: LearningState;

  // 系统状态
  system: SystemState;

  // 🔄 新增：用户反馈状态
  feedback: FeedbackState;

  // 🔄 新增：性能监控状态
  monitoring: MonitoringState;

  // 🔄 新增：部署状态
  deployment: DeploymentState;

  // 🔄 新增：用户体验状态
  ux: UXState;
}

export interface UIState {
  currentPage: string;
  activeModal: string | null;
  loading: boolean;
  notifications: Notification[];
  theme: 'light' | 'dark' | 'auto';
  sidebarCollapsed: boolean;
}

export interface DataState {
  decks: Map<string, any>;
  cards: Map<string, any>;
  templates: Map<string, any>;
  lastSyncTime: string | null;
  isDirty: boolean;
}

export interface LearningState {
  currentSession: any | null;
  studyQueue: any[];
  statistics: any;
  fsrsParameters: any;
}

export interface SystemState {
  isOnline: boolean;
  performance: PerformanceMetrics;
  errors: ErrorState[];
  debugMode: boolean;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
  timestamp: number;
}

export interface PerformanceMetrics {
  memoryUsage: number;
  renderTime: number;
  apiLatency: number;
}

export interface ErrorState {
  id: string;
  message: string;
  stack?: string;
  timestamp: number;
  resolved: boolean;
}

// ============================================================================
// 🔄 新增状态接口定义
// ============================================================================

export interface FeedbackState {
  activeFeedbacks: UserFeedback[];
  recentStatistics: UsageStatistics[];
  smartSuggestions: SmartSuggestion[];
  userPatterns: UserPattern[];
  currentSessionId: string | null;
}

export interface MonitoringState {
  currentMetrics: Record<string, PerformanceMetric | null>;
  recentReports: PerformanceReport[];
  activeBottlenecks: PerformanceBottleneck[];
  monitoringStatus: boolean;
  performanceScore: number;
}

export interface DeploymentState {
  currentDeployment: DeploymentSession | null;
  deploymentHistory: DeploymentSession[];
  isDeploying: boolean;
  lastDeploymentResult: DeploymentResult | null;
}

export interface UXState {
  userPreferences: UserPreferences;
  behaviors: UserBehavior[];
  recommendations: UXRecommendation[];
  currentSession: UserSession | null;
}

// 辅助类型定义
export interface UserFeedback {
  id: string;
  type: 'bug' | 'feature' | 'improvement' | 'question';
  message: string;
  timestamp: number;
  resolved: boolean;
}

export interface UsageStatistics {
  action: string;
  count: number;
  averageTime: number;
  lastUsed: number;
}

export interface SmartSuggestion {
  id: string;
  type: string;
  message: string;
  priority: number;
  dismissed: boolean;
}

export interface UserPattern {
  pattern: string;
  frequency: number;
  confidence: number;
}

export interface PerformanceMetric {
  type: string;
  value: number;
  timestamp: number;
  threshold?: number;
}

export interface PerformanceReport {
  id: string;
  timestamp: number;
  metrics: PerformanceMetric[];
  score: number;
}

export interface PerformanceBottleneck {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: number;
}

export interface DeploymentSession {
  id: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'success' | 'failed';
  steps: DeploymentStep[];
}

export interface DeploymentStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startTime?: number;
  endTime?: number;
  error?: string;
}

export interface DeploymentResult {
  success: boolean;
  duration: number;
  errors: string[];
  warnings: string[];
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  animationSpeed: 'slow' | 'normal' | 'fast';
  compactMode: boolean;
  autoSave: boolean;
  showTooltips: boolean;
  keyboardShortcuts: boolean;
  accessibilityMode: boolean;
  language: string;
}

export interface UserBehavior {
  action: string;
  timestamp: number;
  context: Record<string, any>;
  duration?: number;
}

export interface UXRecommendation {
  id: string;
  type: string;
  message: string;
  priority: number;
  implemented: boolean;
}

export interface UserSession {
  id: string;
  startTime: number;
  endTime?: number;
  actions: UserBehavior[];
}

// ============================================================================
// 状态管理器实现
// ============================================================================

/**
 * 统一状态管理器
 */
export class UnifiedStateManager implements StateManager<AppState> {
  private static instance: UnifiedStateManager;
  
  private _state: Writable<AppState>;
  private middlewares: StateMiddleware[] = [];
  private eventHistory: StateChangeEvent[] = [];
  private subscribers = new Set<(state: AppState) => void>();

  private constructor() {
    this._state = writable(this.createInitialState());
    this.setupDefaultMiddlewares();
  }

  static getInstance(): UnifiedStateManager {
    if (!UnifiedStateManager.instance) {
      UnifiedStateManager.instance = new UnifiedStateManager();
    }
    return UnifiedStateManager.instance;
  }

  get state(): Readable<AppState> {
    return this._state;
  }

  /**
   * 分发状态变更事件
   */
  dispatch(event: StateChangeEvent): void {
    // 通过中间件处理事件
    this.processEventThroughMiddlewares(event, (processedEvent) => {
      this.applyStateChange(processedEvent);
      this.addToHistory(processedEvent);
      this.notifySubscribers();
    });
  }

  /**
   * 获取当前状态快照
   */
  getSnapshot(): AppState {
    return get(this._state);
  }

  /**
   * 订阅状态变更
   */
  subscribe(listener: (state: AppState) => void): () => void {
    this.subscribers.add(listener);
    
    // 立即调用一次
    listener(this.getSnapshot());
    
    return () => {
      this.subscribers.delete(listener);
    };
  }

  /**
   * 添加中间件
   */
  addMiddleware(middleware: StateMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * 移除中间件
   */
  removeMiddleware(name: string): void {
    this.middlewares = this.middlewares.filter(m => m.name !== name);
  }

  /**
   * 创建初始状态
   */
  private createInitialState(): AppState {
    return {
      ui: {
        currentPage: 'deck-study',
        activeModal: null,
        loading: false,
        notifications: [],
        theme: 'auto',
        sidebarCollapsed: false
      },
      data: {
        decks: new Map(),
        cards: new Map(),
        templates: new Map(),
        lastSyncTime: null,
        isDirty: false
      },
      learning: {
        currentSession: null,
        studyQueue: [],
        statistics: {},
        fsrsParameters: {}
      },
      system: {
        isOnline: navigator.onLine,
        performance: {
          memoryUsage: 0,
          renderTime: 0,
          apiLatency: 0
        },
        errors: [],
        debugMode: false
      },
      // 🔄 新增状态域初始化
      feedback: {
        activeFeedbacks: [],
        recentStatistics: [],
        smartSuggestions: [],
        userPatterns: [],
        currentSessionId: null
      },
      monitoring: {
        currentMetrics: {},
        recentReports: [],
        activeBottlenecks: [],
        monitoringStatus: false,
        performanceScore: 100
      },
      deployment: {
        currentDeployment: null,
        deploymentHistory: [],
        isDeploying: false,
        lastDeploymentResult: null
      },
      ux: {
        userPreferences: {
          theme: 'auto',
          animationSpeed: 'normal',
          compactMode: false,
          autoSave: true,
          showTooltips: true,
          keyboardShortcuts: true,
          accessibilityMode: false,
          language: 'zh-CN'
        },
        behaviors: [],
        recommendations: [],
        currentSession: null
      }
    };
  }

  /**
   * 设置默认中间件
   */
  private setupDefaultMiddlewares(): void {
    this.addMiddleware(new LoggingMiddleware());
    this.addMiddleware(new ValidationMiddleware());
    this.addMiddleware(new PerformanceMiddleware());
  }

  /**
   * 通过中间件处理事件
   */
  private processEventThroughMiddlewares(
    event: StateChangeEvent,
    finalHandler: (event: StateChangeEvent) => void
  ): void {
    let index = 0;
    
    const next = (processedEvent: StateChangeEvent) => {
      if (index >= this.middlewares.length) {
        finalHandler(processedEvent);
        return;
      }
      
      const middleware = this.middlewares[index++];
      middleware.process(processedEvent, next);
    };
    
    next(event);
  }

  /**
   * 应用状态变更
   */
  private applyStateChange(event: StateChangeEvent): void {
    this._state.update(currentState => {
      return this.reduceState(currentState, event);
    });
  }

  /**
   * 状态归约器
   */
  private reduceState(state: AppState, event: StateChangeEvent): AppState {
    const [domain, action] = event.type.split('/');
    
    switch (domain) {
      case 'ui':
        return { ...state, ui: this.reduceUIState(state.ui, action, event.payload) };
      case 'data':
        return { ...state, data: this.reduceDataState(state.data, action, event.payload) };
      case 'learning':
        return { ...state, learning: this.reduceLearningState(state.learning, action, event.payload) };
      case 'system':
        return { ...state, system: this.reduceSystemState(state.system, action, event.payload) };
      // 🔄 新增状态域归约器
      case 'feedback':
        return { ...state, feedback: this.reduceFeedbackState(state.feedback, action, event.payload) };
      case 'monitoring':
        return { ...state, monitoring: this.reduceMonitoringState(state.monitoring, action, event.payload) };
      case 'deployment':
        return { ...state, deployment: this.reduceDeploymentState(state.deployment, action, event.payload) };
      case 'ux':
        return { ...state, ux: this.reduceUXState(state.ux, action, event.payload) };
      default:
        console.warn(`未知的状态域: ${domain}`);
        return state;
    }
  }

  /**
   * UI状态归约器
   */
  private reduceUIState(state: UIState, action: string, payload: any): UIState {
    switch (action) {
      case 'SET_CURRENT_PAGE':
        return { ...state, currentPage: payload };
      case 'SET_ACTIVE_MODAL':
        return { ...state, activeModal: payload };
      case 'SET_LOADING':
        return { ...state, loading: payload };
      case 'ADD_NOTIFICATION':
        return { ...state, notifications: [...state.notifications, payload] };
      case 'REMOVE_NOTIFICATION':
        return { ...state, notifications: state.notifications.filter(n => n.id !== payload) };
      case 'SET_THEME':
        return { ...state, theme: payload };
      case 'TOGGLE_SIDEBAR':
        return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
      default:
        return state;
    }
  }

  /**
   * 数据状态归约器
   */
  private reduceDataState(state: DataState, action: string, payload: any): DataState {
    switch (action) {
      case 'SET_DECKS':
        return { ...state, decks: new Map(payload), isDirty: true };
      case 'ADD_DECK':
        const newDecks = new Map(state.decks);
        newDecks.set(payload.id, payload);
        return { ...state, decks: newDecks, isDirty: true };
      case 'UPDATE_DECK':
        const updatedDecks = new Map(state.decks);
        updatedDecks.set(payload.id, { ...updatedDecks.get(payload.id), ...payload });
        return { ...state, decks: updatedDecks, isDirty: true };
      case 'DELETE_DECK':
        const filteredDecks = new Map(state.decks);
        filteredDecks.delete(payload);
        return { ...state, decks: filteredDecks, isDirty: true };
      case 'SET_SYNC_TIME':
        return { ...state, lastSyncTime: payload, isDirty: false };
      default:
        return state;
    }
  }

  /**
   * 学习状态归约器
   */
  private reduceLearningState(state: LearningState, action: string, payload: any): LearningState {
    switch (action) {
      case 'START_SESSION':
        return { ...state, currentSession: payload };
      case 'END_SESSION':
        return { ...state, currentSession: null };
      case 'UPDATE_QUEUE':
        return { ...state, studyQueue: payload };
      case 'UPDATE_STATISTICS':
        return { ...state, statistics: { ...state.statistics, ...payload } };
      case 'UPDATE_FSRS_PARAMS':
        return { ...state, fsrsParameters: { ...state.fsrsParameters, ...payload } };
      default:
        return state;
    }
  }

  /**
   * 系统状态归约器
   */
  private reduceSystemState(state: SystemState, action: string, payload: any): SystemState {
    switch (action) {
      case 'SET_ONLINE_STATUS':
        return { ...state, isOnline: payload };
      case 'UPDATE_PERFORMANCE':
        return { ...state, performance: { ...state.performance, ...payload } };
      case 'ADD_ERROR':
        return { ...state, errors: [...state.errors, payload] };
      case 'RESOLVE_ERROR':
        return {
          ...state,
          errors: state.errors.map(e => e.id === payload ? { ...e, resolved: true } : e)
        };
      case 'SET_DEBUG_MODE':
        return { ...state, debugMode: payload };
      case 'ENABLE_GRACEFUL_DEGRADATION':
        // 启用优雅降级模式
        return {
          ...state,
          performance: {
            ...state.performance,
            gracefulDegradation: true,
            degradationReason: payload.reason
          }
        };
      default:
        return state;
    }
  }

  // 🔄 新增状态归约器实现

  /**
   * 用户反馈状态归约器
   */
  private reduceFeedbackState(state: FeedbackState, action: string, payload: any): FeedbackState {
    switch (action) {
      case 'ADD_FEEDBACK':
        return { ...state, activeFeedbacks: [...state.activeFeedbacks, payload] };
      case 'REMOVE_FEEDBACK':
        return { ...state, activeFeedbacks: state.activeFeedbacks.filter(f => f.id !== payload) };
      case 'UPDATE_STATISTICS':
        return { ...state, recentStatistics: payload };
      case 'SET_SUGGESTIONS':
        return { ...state, smartSuggestions: payload };
      case 'ADD_SUGGESTION':
        return { ...state, smartSuggestions: [...state.smartSuggestions, payload] };
      case 'DISMISS_SUGGESTION':
        return {
          ...state,
          smartSuggestions: state.smartSuggestions.map(s =>
            s.id === payload ? { ...s, dismissed: true } : s
          )
        };
      case 'UPDATE_PATTERNS':
        return { ...state, userPatterns: payload };
      case 'SET_SESSION_ID':
        return { ...state, currentSessionId: payload };
      default:
        return state;
    }
  }

  /**
   * 性能监控状态归约器
   */
  private reduceMonitoringState(state: MonitoringState, action: string, payload: any): MonitoringState {
    switch (action) {
      case 'UPDATE_METRICS':
        return { ...state, currentMetrics: { ...state.currentMetrics, ...payload } };
      case 'ADD_REPORT':
        return { ...state, recentReports: [...state.recentReports, payload] };
      case 'ADD_BOTTLENECK':
        return { ...state, activeBottlenecks: [...state.activeBottlenecks, payload] };
      case 'RESOLVE_BOTTLENECK':
        return {
          ...state,
          activeBottlenecks: state.activeBottlenecks.filter(b => b.id !== payload)
        };
      case 'SET_MONITORING_STATUS':
        return { ...state, monitoringStatus: payload };
      case 'UPDATE_PERFORMANCE_SCORE':
        return { ...state, performanceScore: payload };
      case 'CLEAR_REPORTS':
        return { ...state, recentReports: [] };
      default:
        return state;
    }
  }

  /**
   * 部署状态归约器
   */
  private reduceDeploymentState(state: DeploymentState, action: string, payload: any): DeploymentState {
    switch (action) {
      case 'START_DEPLOYMENT':
        return {
          ...state,
          currentDeployment: payload,
          isDeploying: true
        };
      case 'UPDATE_DEPLOYMENT':
        return {
          ...state,
          currentDeployment: state.currentDeployment ?
            { ...state.currentDeployment, ...payload } : null
        };
      case 'COMPLETE_DEPLOYMENT':
        return {
          ...state,
          currentDeployment: null,
          isDeploying: false,
          deploymentHistory: [...state.deploymentHistory, payload],
          lastDeploymentResult: payload.result
        };
      case 'FAIL_DEPLOYMENT':
        return {
          ...state,
          currentDeployment: null,
          isDeploying: false,
          lastDeploymentResult: payload
        };
      case 'CLEAR_DEPLOYMENT_HISTORY':
        return { ...state, deploymentHistory: [] };
      default:
        return state;
    }
  }

  /**
   * 用户体验状态归约器
   */
  private reduceUXState(state: UXState, action: string, payload: any): UXState {
    switch (action) {
      case 'UPDATE_PREFERENCES':
        return {
          ...state,
          userPreferences: { ...state.userPreferences, ...payload }
        };
      case 'ADD_BEHAVIOR':
        return { ...state, behaviors: [...state.behaviors, payload] };
      case 'ADD_RECOMMENDATION':
        return { ...state, recommendations: [...state.recommendations, payload] };
      case 'IMPLEMENT_RECOMMENDATION':
        return {
          ...state,
          recommendations: state.recommendations.map(r =>
            r.id === payload ? { ...r, implemented: true } : r
          )
        };
      case 'START_SESSION':
        return { ...state, currentSession: payload };
      case 'END_SESSION':
        return {
          ...state,
          currentSession: state.currentSession ?
            { ...state.currentSession, endTime: Date.now() } : null
        };
      case 'CLEAR_BEHAVIORS':
        return { ...state, behaviors: [] };
      default:
        return state;
    }
  }

  /**
   * 添加到历史记录
   */
  private addToHistory(event: StateChangeEvent): void {
    this.eventHistory.push(event);
    
    // 限制历史记录大小
    if (this.eventHistory.length > 1000) {
      this.eventHistory.splice(0, this.eventHistory.length - 1000);
    }
  }

  /**
   * 通知订阅者
   */
  private notifySubscribers(): void {
    const currentState = this.getSnapshot();
    this.subscribers.forEach(listener => {
      try {
        listener(currentState);
      } catch (error) {
        console.error('状态订阅者执行错误:', error);
      }
    });
  }
}

// ============================================================================
// 默认中间件实现
// ============================================================================

/**
 * 日志中间件
 */
class LoggingMiddleware implements StateMiddleware {
  name = 'logging';

  process<T>(event: StateChangeEvent<T>, next: (event: StateChangeEvent<T>) => void): void {
    console.log(`🔄 状态变更: ${event.type}`, event.payload);
    next(event);
  }
}

/**
 * 验证中间件
 */
class ValidationMiddleware implements StateMiddleware {
  name = 'validation';

  process<T>(event: StateChangeEvent<T>, next: (event: StateChangeEvent<T>) => void): void {
    // 验证事件格式
    if (!event.type || typeof event.type !== 'string') {
      console.error('❌ 无效的事件类型:', event);
      return;
    }

    if (!event.type.includes('/')) {
      console.error('❌ 事件类型必须包含域名和动作:', event.type);
      return;
    }

    next(event);
  }
}

/**
 * 性能监控中间件
 */
class PerformanceMiddleware implements StateMiddleware {
  name = 'performance';

  process<T>(event: StateChangeEvent<T>, next: (event: StateChangeEvent<T>) => void): void {
    const startTime = performance.now();
    
    next(event);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    if (duration > 10) { // 超过10ms的状态变更记录警告
      console.warn(`⚠️ 状态变更耗时过长: ${event.type} (${duration.toFixed(2)}ms)`);
    }
  }
}

// ============================================================================
// 便捷的状态操作函数
// ============================================================================

const stateManager = UnifiedStateManager.getInstance();

/**
 * 分发UI事件
 */
export const dispatchUI = (action: string, payload?: any) => {
  stateManager.dispatch({
    type: `ui/${action}`,
    payload,
    timestamp: Date.now(),
    source: 'ui'
  });
};

/**
 * 分发数据事件
 */
export const dispatchData = (action: string, payload?: any) => {
  stateManager.dispatch({
    type: `data/${action}`,
    payload,
    timestamp: Date.now(),
    source: 'data'
  });
};

/**
 * 分发学习事件
 */
export const dispatchLearning = (action: string, payload?: any) => {
  stateManager.dispatch({
    type: `learning/${action}`,
    payload,
    timestamp: Date.now(),
    source: 'learning'
  });
};

/**
 * 分发系统事件
 */
export const dispatchSystem = (action: string, payload?: any) => {
  stateManager.dispatch({
    type: `system/${action}`,
    payload,
    timestamp: Date.now(),
    source: 'system'
  });
};

/**
 * 获取状态管理器实例
 */
export const getStateManager = () => stateManager;

/**
 * 获取当前状态
 */
export const getCurrentState = () => stateManager.getSnapshot();

// 🔄 新增便捷分发函数

/**
 * 分发用户反馈事件
 */
export const dispatchFeedback = (action: string, payload?: any) => {
  stateManager.dispatch({
    type: `feedback/${action}`,
    payload,
    timestamp: Date.now(),
    source: 'feedback'
  });
};

/**
 * 分发性能监控事件
 */
export const dispatchMonitoring = (action: string, payload?: any) => {
  stateManager.dispatch({
    type: `monitoring/${action}`,
    payload,
    timestamp: Date.now(),
    source: 'monitoring'
  });
};

/**
 * 分发部署事件
 */
export const dispatchDeployment = (action: string, payload?: any) => {
  stateManager.dispatch({
    type: `deployment/${action}`,
    payload,
    timestamp: Date.now(),
    source: 'deployment'
  });
};

/**
 * 分发用户体验事件
 */
export const dispatchUX = (action: string, payload?: any) => {
  stateManager.dispatch({
    type: `ux/${action}`,
    payload,
    timestamp: Date.now(),
    source: 'ux'
  });
};

/**
 * 订阅状态变更
 */
export const subscribeToState = (listener: (state: AppState) => void) =>
  stateManager.subscribe(listener);
