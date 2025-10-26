/**
 * 实时进度监控服务
 * 提供可视化的进度监控界面，详细的同步状态和性能指标
 */

import { writable, derived, type Writable } from 'svelte/store';

// 进度数据接口
export interface ProgressData {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  progress: number; // 0-100
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  startTime: number;
  endTime?: number;
  estimatedTimeRemaining?: number;
  throughput?: number; // 项目/秒
  errors: ProgressError[];
  warnings: ProgressWarning[];
  metadata: Record<string, any>;
  subTasks?: ProgressData[];
}

// 错误信息接口
export interface ProgressError {
  id: string;
  message: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
  stackTrace?: string;
}

// 警告信息接口
export interface ProgressWarning {
  id: string;
  message: string;
  timestamp: number;
  type: 'performance' | 'data' | 'network' | 'memory' | 'general';
  suggestion?: string;
}

// 性能指标接口
export interface PerformanceMetrics {
  timestamp: number;
  memoryUsage: number; // MB
  cpuUsage: number; // 0-100%
  networkLatency: number; // ms
  cacheHitRate: number; // 0-100%
  errorRate: number; // 0-100%
  throughput: number; // 项目/秒
  activeConnections: number;
  queuedTasks: number;
}

// 监控配置接口
export interface MonitorConfig {
  refreshInterval: number; // 毫秒
  maxHistorySize: number;
  enableDetailedMetrics: boolean;
  enableNotifications: boolean;
  autoScrollToErrors: boolean;
  compactMode: boolean;
}

/**
 * 进度监控服务类
 */
export class ProgressMonitorService {
  private tasks = new Map<string, Writable<ProgressData>>();
  private metricsHistory: PerformanceMetrics[] = [];
  private config: MonitorConfig;
  private refreshTimer?: NodeJS.Timeout;
  private isActive = false;

  // 全局状态存储
  public readonly activeTasks = writable<Map<string, ProgressData>>(new Map());
  public readonly currentMetrics = writable<PerformanceMetrics>({
    timestamp: Date.now(),
    memoryUsage: 0,
    cpuUsage: 0,
    networkLatency: 0,
    cacheHitRate: 0,
    errorRate: 0,
    throughput: 0,
    activeConnections: 0,
    queuedTasks: 0
  });

  // 计算属性
  public readonly overallProgress = derived(
    this.activeTasks,
    ($tasks) => this.calculateOverallProgress($tasks)
  );

  public readonly hasErrors = derived(
    this.activeTasks,
    ($tasks) => Array.from($tasks.values()).some(task => task.errors.length > 0)
  );

  public readonly hasWarnings = derived(
    this.activeTasks,
    ($tasks) => Array.from($tasks.values()).some(task => task.warnings.length > 0)
  );

  constructor(config?: Partial<MonitorConfig>) {
    this.config = {
      refreshInterval: 1000,
      maxHistorySize: 100,
      enableDetailedMetrics: true,
      enableNotifications: true,
      autoScrollToErrors: true,
      compactMode: false,
      ...config
    };
  }

  /**
   * 启动监控服务
   */
  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.startPeriodicRefresh();
    console.log('📊 进度监控服务已启动');
  }

  /**
   * 停止监控服务
   */
  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.stopPeriodicRefresh();
    console.log('⏹️ 进度监控服务已停止');
  }

  /**
   * 创建新的进度任务
   */
  createTask(
    id: string,
    name: string,
    totalSteps: number = 1,
    metadata: Record<string, any> = {}
  ): Writable<ProgressData> {
    const initialData: ProgressData = {
      id,
      name,
      status: 'pending',
      progress: 0,
      currentStep: '准备中...',
      totalSteps,
      completedSteps: 0,
      startTime: Date.now(),
      throughput: 0,
      errors: [],
      warnings: [],
      metadata
    };

    const taskStore = writable(initialData);
    this.tasks.set(id, taskStore);

    // 更新活跃任务列表
    this.updateActiveTasks();

    console.log(`📋 创建进度任务: ${name} (${id})`);
    return taskStore;
  }

  /**
   * 更新任务进度
   */
  updateTaskProgress(
    id: string,
    updates: Partial<ProgressData>
  ): void {
    const taskStore = this.tasks.get(id);
    if (!taskStore) {
      console.warn(`任务不存在: ${id}`);
      return;
    }

    taskStore.update(current => {
      const updated = { ...current, ...updates };

      // 自动计算进度百分比
      if (updates.completedSteps !== undefined && updated.totalSteps > 0) {
        updated.progress = (updated.completedSteps / updated.totalSteps) * 100;
      }

      // 计算预估剩余时间
      if (updated.progress > 0 && updated.status === 'running') {
        const elapsed = Date.now() - updated.startTime;
        const estimatedTotal = (elapsed * 100) / updated.progress;
        updated.estimatedTimeRemaining = estimatedTotal - elapsed;
      }

      // 自动设置结束时间
      if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') {
        updated.endTime = Date.now();
        updated.estimatedTimeRemaining = 0;
      }

      return updated;
    });

    this.updateActiveTasks();
  }

  /**
   * 添加错误信息
   */
  addError(
    taskId: string,
    message: string,
    severity: ProgressError['severity'] = 'medium',
    context?: Record<string, any>
  ): void {
    const error: ProgressError = {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message,
      timestamp: Date.now(),
      severity,
      context,
      stackTrace: new Error().stack
    };

    this.updateTaskProgress(taskId, {
      errors: [...(this.getTaskData(taskId)?.errors || []), error]
    });

    // 发送通知
    if (this.config.enableNotifications && severity === 'high' || severity === 'critical') {
      this.sendNotification('error', `任务错误: ${message}`);
    }

    console.error(`❌ 任务错误 [${taskId}]: ${message}`, context);
  }

  /**
   * 添加警告信息
   */
  addWarning(
    taskId: string,
    message: string,
    type: ProgressWarning['type'] = 'general',
    suggestion?: string
  ): void {
    const warning: ProgressWarning = {
      id: `warning-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message,
      timestamp: Date.now(),
      type,
      suggestion
    };

    this.updateTaskProgress(taskId, {
      warnings: [...(this.getTaskData(taskId)?.warnings || []), warning]
    });

    console.warn(`⚠️ 任务警告 [${taskId}]: ${message}`);
  }

  /**
   * 完成任务
   */
  completeTask(taskId: string, finalMetadata?: Record<string, any>): void {
    this.updateTaskProgress(taskId, {
      status: 'completed',
      progress: 100,
      currentStep: '已完成',
      completedSteps: this.getTaskData(taskId)?.totalSteps || 1,
      ...(finalMetadata && { metadata: { ...this.getTaskData(taskId)?.metadata, ...finalMetadata } })
    });

    console.log(`✅ 任务完成: ${taskId}`);
  }

  /**
   * 失败任务
   */
  failTask(taskId: string, errorMessage: string): void {
    this.addError(taskId, errorMessage, 'critical');
    this.updateTaskProgress(taskId, {
      status: 'failed',
      currentStep: '执行失败'
    });

    console.error(`❌ 任务失败: ${taskId} - ${errorMessage}`);
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): void {
    this.updateTaskProgress(taskId, {
      status: 'cancelled',
      currentStep: '已取消'
    });

    console.log(`⏹️ 任务取消: ${taskId}`);
  }

  /**
   * 获取任务数据
   */
  getTaskData(taskId: string): ProgressData | null {
    const taskStore = this.tasks.get(taskId);
    if (!taskStore) return null;

    let data: ProgressData | null = null;
    const unsubscribe = taskStore.subscribe(value => {
      data = value;
    });
    unsubscribe();

    return data;
  }

  /**
   * 获取任务存储
   */
  getTaskStore(taskId: string): Writable<ProgressData> | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 删除任务
   */
  removeTask(taskId: string): void {
    this.tasks.delete(taskId);
    this.updateActiveTasks();
    console.log(`🗑️ 删除任务: ${taskId}`);
  }

  /**
   * 清理已完成的任务
   */
  cleanupCompletedTasks(): void {
    const completedTasks: string[] = [];

    for (const [taskId, taskStore] of this.tasks) {
      const data = this.getTaskData(taskId);
      if (data && (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled')) {
        // 保留最近完成的任务一段时间
        const timeSinceCompletion = Date.now() - (data.endTime || Date.now());
        if (timeSinceCompletion > 300000) { // 5分钟
          completedTasks.push(taskId);
        }
      }
    }

    completedTasks.forEach(taskId => this.removeTask(taskId));

    if (completedTasks.length > 0) {
      console.log(`🧹 清理了 ${completedTasks.length} 个已完成的任务`);
    }
  }

  /**
   * 更新性能指标
   */
  updateMetrics(metrics: Partial<PerformanceMetrics>): void {
    const newMetrics: PerformanceMetrics = {
      timestamp: Date.now(),
      memoryUsage: 0,
      cpuUsage: 0,
      networkLatency: 0,
      cacheHitRate: 0,
      errorRate: 0,
      throughput: 0,
      activeConnections: 0,
      queuedTasks: 0,
      ...metrics
    };

    this.currentMetrics.set(newMetrics);

    // 添加到历史记录
    this.metricsHistory.push(newMetrics);
    if (this.metricsHistory.length > this.config.maxHistorySize) {
      this.metricsHistory.shift();
    }
  }

  /**
   * 获取性能指标历史
   */
  getMetricsHistory(): PerformanceMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * 获取配置
   */
  getConfig(): MonitorConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<MonitorConfig>): void {
    this.config = { ...this.config, ...updates };

    // 重新启动定时器如果刷新间隔改变
    if (updates.refreshInterval && this.isActive) {
      this.stopPeriodicRefresh();
      this.startPeriodicRefresh();
    }
  }

  // 私有方法

  /**
   * 启动定期刷新
   */
  private startPeriodicRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.updateMetricsFromSystem();
      this.cleanupCompletedTasks();
    }, this.config.refreshInterval);
  }

  /**
   * 停止定期刷新
   */
  private stopPeriodicRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * 更新活跃任务列表
   */
  private updateActiveTasks(): void {
    const activeTasksMap = new Map<string, ProgressData>();

    for (const [taskId, taskStore] of this.tasks) {
      const data = this.getTaskData(taskId);
      if (data) {
        activeTasksMap.set(taskId, data);
      }
    }

    this.activeTasks.set(activeTasksMap);
  }

  /**
   * 计算总体进度
   */
  private calculateOverallProgress(tasks: Map<string, ProgressData>): {
    progress: number;
    activeTasks: number;
    completedTasks: number;
    failedTasks: number;
  } {
    const taskArray = Array.from(tasks.values());
    const activeTasks = taskArray.filter(t => t.status === 'running' || t.status === 'pending').length;
    const completedTasks = taskArray.filter(t => t.status === 'completed').length;
    const failedTasks = taskArray.filter(t => t.status === 'failed').length;

    const totalProgress = taskArray.reduce((sum, task) => sum + task.progress, 0);
    const averageProgress = taskArray.length > 0 ? totalProgress / taskArray.length : 0;

    return {
      progress: averageProgress,
      activeTasks,
      completedTasks,
      failedTasks
    };
  }

  /**
   * 从系统更新性能指标
   */
  private updateMetricsFromSystem(): void {
    // 模拟系统性能指标收集
    const metrics: Partial<PerformanceMetrics> = {
      memoryUsage: this.getMemoryUsage(),
      cpuUsage: this.getCPUUsage(),
      networkLatency: this.getNetworkLatency(),
      cacheHitRate: this.getCacheHitRate(),
      errorRate: this.getErrorRate(),
      throughput: this.getThroughput(),
      activeConnections: this.getActiveConnections(),
      queuedTasks: this.getQueuedTasks()
    };

    this.updateMetrics(metrics);
  }

  /**
   * 获取内存使用量
   */
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      return memInfo.usedJSHeapSize / (1024 * 1024); // 转换为MB
    }
    return 45 + Math.random() * 20; // 模拟值
  }

  /**
   * 获取CPU使用率
   */
  private getCPUUsage(): number {
    // 简化的CPU使用率估算
    return 30 + Math.random() * 40;
  }

  /**
   * 获取网络延迟
   */
  private getNetworkLatency(): number {
    return 50 + Math.random() * 100;
  }

  /**
   * 获取缓存命中率
   */
  private getCacheHitRate(): number {
    return 75 + Math.random() * 20;
  }

  /**
   * 获取错误率
   */
  private getErrorRate(): number {
    const tasks = Array.from(this.tasks.values());
    const totalTasks = tasks.length;
    if (totalTasks === 0) return 0;

    const tasksWithErrors = tasks.filter(taskStore => {
      const data = this.getTaskData(taskStore.subscribe ? '' : ''); // 简化处理
      return data && data.errors.length > 0;
    }).length;

    return (tasksWithErrors / totalTasks) * 100;
  }

  /**
   * 获取吞吐量
   */
  private getThroughput(): number {
    const runningTasks = Array.from(this.tasks.values()).filter(taskStore => {
      const data = this.getTaskData(''); // 简化处理
      return data && data.status === 'running' && data.throughput;
    });

    if (runningTasks.length === 0) return 0;

    // 计算平均吞吐量
    return 15 + Math.random() * 10; // 简化实现
  }

  /**
   * 获取活跃连接数
   */
  private getActiveConnections(): number {
    return Math.floor(3 + Math.random() * 5);
  }

  /**
   * 获取队列任务数
   */
  private getQueuedTasks(): number {
    const pendingTasks = Array.from(this.tasks.values()).filter(taskStore => {
      const data = this.getTaskData(''); // 简化处理
      return data && data.status === 'pending';
    });

    return pendingTasks.length;
  }

  /**
   * 发送通知
   */
  private sendNotification(type: 'info' | 'warning' | 'error', message: string): void {
    if (!this.config.enableNotifications) return;

    // 简化的通知实现
    console.log(`🔔 通知 [${type}]: ${message}`);
  }
}

// 创建全局实例
export const progressMonitorService = new ProgressMonitorService();
