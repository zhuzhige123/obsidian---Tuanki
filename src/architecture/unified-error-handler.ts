/**
 * 统一错误处理系统
 * 解决根本问题：错误处理方式不一致、错误恢复机制缺失、错误传播混乱
 */

import { dispatchUI, dispatchSystem } from './unified-state-management';
import { TIME_CONSTANTS, ERROR_CODES } from '../constants/app-constants';

// ============================================================================
// 错误类型定义
// ============================================================================

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * 错误类别
 */
export enum ErrorCategory {
  NETWORK = 'network',
  DATA = 'data',
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  SYSTEM = 'system',
  USER = 'user',
  BUSINESS = 'business'
}

/**
 * 统一错误接口
 */
export interface UnifiedError {
  id: string;
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: ErrorContext;
  timestamp: number;
  stack?: string;
  cause?: Error;
  recoverable: boolean;
  userMessage?: string;
  actionable?: boolean;
}

/**
 * 错误上下文
 */
export interface ErrorContext {
  component?: string;
  operation?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

/**
 * 错误恢复策略
 */
export interface ErrorRecoveryStrategy {
  name: string;
  description: string;
  execute: (error: UnifiedError) => Promise<boolean>;
  maxAttempts: number;
  retryDelay: number;
}

/**
 * 错误处理结果
 */
export interface ErrorHandlingResult {
  handled: boolean;
  recovered: boolean;
  userNotified: boolean;
  logged: boolean;
  retryable: boolean;
  nextAction?: string;
}

// ============================================================================
// 统一错误处理器
// ============================================================================

/**
 * 统一错误处理器
 */
export class UnifiedErrorHandler {
  private static instance: UnifiedErrorHandler;
  private recoveryStrategies = new Map<string, ErrorRecoveryStrategy>();
  private errorHistory: UnifiedError[] = [];
  private maxHistorySize = 1000;

  static getInstance(): UnifiedErrorHandler {
    if (!UnifiedErrorHandler.instance) {
      UnifiedErrorHandler.instance = new UnifiedErrorHandler();
    }
    return UnifiedErrorHandler.instance;
  }

  private constructor() {
    this.setupDefaultRecoveryStrategies();
  }

  /**
   * 处理错误的主要入口点
   */
  async handleError(
    error: Error | UnifiedError | string,
    context?: Partial<ErrorContext>
  ): Promise<ErrorHandlingResult> {
    const unifiedError = this.normalizeError(error, context);
    
    // 添加到历史记录
    this.addToHistory(unifiedError);
    
    // 更新系统状态
    this.updateSystemState(unifiedError);
    
    // 执行错误处理流程
    const result = await this.processError(unifiedError);
    
    return result;
  }

  /**
   * 标准化错误对象
   */
  private normalizeError(
    error: Error | UnifiedError | string,
    context?: Partial<ErrorContext>
  ): UnifiedError {
    if (typeof error === 'string') {
      return this.createUnifiedError(error, context);
    }
    
    if (this.isUnifiedError(error)) {
      return {
        ...error,
        context: { ...error.context, ...context }
      };
    }
    
    // 标准Error对象
    return this.createUnifiedErrorFromError(error, context);
  }

  /**
   * 创建统一错误对象
   */
  private createUnifiedError(
    message: string,
    context?: Partial<ErrorContext>
  ): UnifiedError {
    return {
      id: this.generateErrorId(),
      code: this.inferErrorCode(message),
      message,
      category: this.inferErrorCategory(message),
      severity: this.inferErrorSeverity(message),
      context: {
        component: 'unknown',
        operation: 'unknown',
        ...context
      },
      timestamp: Date.now(),
      recoverable: this.isRecoverable(message),
      userMessage: this.generateUserMessage(message),
      actionable: this.isActionable(message)
    };
  }

  /**
   * 从Error对象创建统一错误
   */
  private createUnifiedErrorFromError(
    error: Error,
    context?: Partial<ErrorContext>
  ): UnifiedError {
    return {
      id: this.generateErrorId(),
      code: this.inferErrorCode(error.message),
      message: error.message,
      category: this.inferErrorCategory(error.message),
      severity: this.inferErrorSeverity(error.message),
      context: {
        component: 'unknown',
        operation: 'unknown',
        ...context
      },
      timestamp: Date.now(),
      stack: error.stack,
      cause: error,
      recoverable: this.isRecoverable(error.message),
      userMessage: this.generateUserMessage(error.message),
      actionable: this.isActionable(error.message)
    };
  }

  /**
   * 处理错误的核心逻辑
   */
  private async processError(error: UnifiedError): Promise<ErrorHandlingResult> {
    const result: ErrorHandlingResult = {
      handled: false,
      recovered: false,
      userNotified: false,
      logged: false,
      retryable: false
    };

    try {
      // 1. 记录错误
      this.logError(error);
      result.logged = true;

      // 2. 尝试恢复
      if (error.recoverable) {
        result.recovered = await this.attemptRecovery(error);
        result.retryable = !result.recovered;
      }

      // 3. 通知用户
      if (this.shouldNotifyUser(error)) {
        this.notifyUser(error);
        result.userNotified = true;
      }

      // 4. 执行特定处理逻辑
      await this.executeSpecificHandling(error);
      result.handled = true;

      return result;
    } catch (handlingError) {
      console.error('错误处理过程中发生异常:', handlingError);
      return result;
    }
  }

  /**
   * 尝试错误恢复
   */
  private async attemptRecovery(error: UnifiedError): Promise<boolean> {
    const strategy = this.getRecoveryStrategy(error);
    if (!strategy) {
      return false;
    }

    let attempts = 0;
    while (attempts < strategy.maxAttempts) {
      try {
        const recovered = await strategy.execute(error);
        if (recovered) {
          console.log(`✅ 错误恢复成功: ${error.code} (尝试 ${attempts + 1}/${strategy.maxAttempts})`);
          return true;
        }
      } catch (recoveryError) {
        console.warn(`⚠️ 错误恢复失败: ${error.code} (尝试 ${attempts + 1}/${strategy.maxAttempts})`, recoveryError);
      }

      attempts++;
      if (attempts < strategy.maxAttempts) {
        await this.delay(strategy.retryDelay * Math.pow(2, attempts - 1)); // 指数退避
      }
    }

    return false;
  }

  /**
   * 获取恢复策略
   */
  private getRecoveryStrategy(error: UnifiedError): ErrorRecoveryStrategy | undefined {
    // 按优先级查找恢复策略
    const strategies = [
      error.code,
      error.category,
      'default'
    ];

    for (const strategyKey of strategies) {
      const strategy = this.recoveryStrategies.get(strategyKey);
      if (strategy) {
        return strategy;
      }
    }

    return undefined;
  }

  /**
   * 通知用户
   */
  private notifyUser(error: UnifiedError): void {
    const message = error.userMessage || error.message;
    const duration = this.getNotificationDuration(error.severity);

    dispatchUI('ADD_NOTIFICATION', {
      id: error.id,
      type: this.mapSeverityToNotificationType(error.severity),
      message,
      duration,
      timestamp: error.timestamp
    });
  }

  /**
   * 记录错误
   */
  private logError(error: UnifiedError): void {
    const logLevel = this.mapSeverityToLogLevel(error.severity);
    const logMessage = `[${error.category.toUpperCase()}] ${error.code}: ${error.message}`;
    
    switch (logLevel) {
      case 'error':
        console.error(logMessage, error);
        break;
      case 'warn':
        console.warn(logMessage, error);
        break;
      case 'info':
        console.info(logMessage, error);
        break;
      default:
        console.log(logMessage, error);
    }
  }

  /**
   * 执行特定错误处理逻辑
   */
  private async executeSpecificHandling(error: UnifiedError): Promise<void> {
    switch (error.category) {
      case ErrorCategory.NETWORK:
        await this.handleNetworkError(error);
        break;
      case ErrorCategory.DATA:
        await this.handleDataError(error);
        break;
      case ErrorCategory.VALIDATION:
        await this.handleValidationError(error);
        break;
      case ErrorCategory.PERMISSION:
        await this.handlePermissionError(error);
        break;
      case ErrorCategory.SYSTEM:
        await this.handleSystemError(error);
        break;
      default:
        // 默认处理
        break;
    }
  }

  /**
   * 处理网络错误
   */
  private async handleNetworkError(error: UnifiedError): Promise<void> {
    // 更新网络状态
    dispatchSystem('SET_ONLINE_STATUS', false);
    
    // 设置重连定时器
    setTimeout(() => {
      dispatchSystem('SET_ONLINE_STATUS', navigator.onLine);
    }, TIME_CONSTANTS.NETWORK_TIMEOUT);
  }

  /**
   * 处理数据错误
   */
  private async handleDataError(error: UnifiedError): Promise<void> {
    // 标记数据为脏数据
    // 触发数据验证
    // 可能需要重新加载数据
  }

  /**
   * 处理验证错误
   */
  private async handleValidationError(error: UnifiedError): Promise<void> {
    // 验证错误通常需要用户修正输入
    // 高亮错误字段
    // 显示具体的验证提示
  }

  /**
   * 处理权限错误
   */
  private async handlePermissionError(error: UnifiedError): Promise<void> {
    // 可能需要重新认证
    // 或者引导用户到权限设置页面
  }

  /**
   * 处理系统错误
   */
  private async handleSystemError(error: UnifiedError): Promise<void> {
    // 检查是否为内存相关错误
    if (error.message.includes('内存') || error.message.includes('memory')) {
      await this.handleMemoryError(error);
      return;
    }

    // 其他系统错误可能需要重启某些服务
    // 或者降级到安全模式
  }

  /**
   * 处理内存相关错误
   */
  private async handleMemoryError(error: UnifiedError): Promise<void> {
    console.warn('🧠 处理内存相关错误:', error.message);

    // 触发内存清理
    try {
      // 通知系统进行内存清理
      dispatchSystem('TRIGGER_MEMORY_CLEANUP', {
        severity: error.severity,
        timestamp: error.timestamp
      });

      // 如果是严重内存问题，启用优雅降级
      if (error.severity === ErrorSeverity.CRITICAL) {
        dispatchSystem('ENABLE_GRACEFUL_DEGRADATION', {
          reason: 'memory_pressure',
          timestamp: error.timestamp
        });
      }
    } catch (cleanupError) {
      console.error('内存清理失败:', cleanupError);
    }
  }

  /**
   * 设置默认恢复策略
   */
  private setupDefaultRecoveryStrategies(): void {
    // 网络错误恢复策略
    this.addRecoveryStrategy({
      name: 'network-retry',
      description: '网络错误重试策略',
      execute: async (error) => {
        // 简单的网络重试
        return navigator.onLine;
      },
      maxAttempts: 3,
      retryDelay: TIME_CONSTANTS.RETRY_DELAY
    }, ErrorCategory.NETWORK);

    // 数据错误恢复策略
    this.addRecoveryStrategy({
      name: 'data-reload',
      description: '数据重新加载策略',
      execute: async (error) => {
        // 尝试重新加载数据
        return false; // 需要具体实现
      },
      maxAttempts: 2,
      retryDelay: TIME_CONSTANTS.RETRY_DELAY
    }, ErrorCategory.DATA);

    // 默认恢复策略
    this.addRecoveryStrategy({
      name: 'default-retry',
      description: '默认重试策略',
      execute: async (error) => {
        // 默认不进行恢复
        return false;
      },
      maxAttempts: 1,
      retryDelay: TIME_CONSTANTS.RETRY_DELAY
    }, 'default');
  }

  /**
   * 添加恢复策略
   */
  addRecoveryStrategy(strategy: ErrorRecoveryStrategy, key: string | ErrorCategory): void {
    this.recoveryStrategies.set(key.toString(), strategy);
  }

  /**
   * 工具方法
   */
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isUnifiedError(obj: any): obj is UnifiedError {
    return obj && typeof obj === 'object' && 'id' in obj && 'code' in obj && 'category' in obj;
  }

  private inferErrorCode(message: string): string {
    // 根据消息内容推断错误代码
    if (message.includes('网络') || message.includes('连接')) return ERROR_CODES.NETWORK_ERROR;
    if (message.includes('超时')) return ERROR_CODES.TIMEOUT_ERROR;
    if (message.includes('权限') || message.includes('访问')) return ERROR_CODES.PERMISSION_DENIED;
    if (message.includes('验证') || message.includes('格式')) return ERROR_CODES.VALIDATION_ERROR;
    if (message.includes('数据') || message.includes('解析')) return ERROR_CODES.DATA_CORRUPTION;
    return ERROR_CODES.UNKNOWN_ERROR;
  }

  private inferErrorCategory(message: string): ErrorCategory {
    if (message.includes('网络') || message.includes('连接')) return ErrorCategory.NETWORK;
    if (message.includes('权限') || message.includes('访问')) return ErrorCategory.PERMISSION;
    if (message.includes('验证') || message.includes('格式')) return ErrorCategory.VALIDATION;
    if (message.includes('数据') || message.includes('解析')) return ErrorCategory.DATA;
    return ErrorCategory.SYSTEM;
  }

  private inferErrorSeverity(message: string): ErrorSeverity {
    if (message.includes('严重') || message.includes('致命')) return ErrorSeverity.CRITICAL;
    if (message.includes('错误') || message.includes('失败')) return ErrorSeverity.ERROR;
    if (message.includes('警告') || message.includes('注意')) return ErrorSeverity.WARNING;
    return ErrorSeverity.INFO;
  }

  private isRecoverable(message: string): boolean {
    // 网络错误、超时错误通常可恢复
    return message.includes('网络') || message.includes('超时') || message.includes('连接');
  }

  private isActionable(message: string): boolean {
    // 验证错误、权限错误通常需要用户操作
    return message.includes('验证') || message.includes('权限') || message.includes('格式');
  }

  private generateUserMessage(message: string): string {
    // 生成用户友好的错误消息
    if (message.includes('网络')) return '网络连接异常，请检查网络设置';
    if (message.includes('权限')) return '权限不足，请检查相关权限设置';
    if (message.includes('验证')) return '输入格式不正确，请检查后重试';
    return message;
  }

  private shouldNotifyUser(error: UnifiedError): boolean {
    // 严重错误和用户可操作的错误需要通知用户
    return error.severity !== ErrorSeverity.INFO || (error as any).actionable || false;
  }

  private getNotificationDuration(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 10000; // 10秒
      case ErrorSeverity.ERROR:
        return 5000;  // 5秒
      case ErrorSeverity.WARNING:
        return 3000;  // 3秒
      default:
        return 2000;  // 2秒
    }
  }

  private mapSeverityToNotificationType(severity: ErrorSeverity): 'info' | 'success' | 'warning' | 'error' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.ERROR:
        return 'error';
      case ErrorSeverity.WARNING:
        return 'warning';
      default:
        return 'info';
    }
  }

  private mapSeverityToLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' | 'log' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.ERROR:
        return 'error';
      case ErrorSeverity.WARNING:
        return 'warn';
      case ErrorSeverity.INFO:
        return 'info';
      default:
        return 'log';
    }
  }

  private addToHistory(error: UnifiedError): void {
    this.errorHistory.push(error);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.splice(0, this.errorHistory.length - this.maxHistorySize);
    }
  }

  private updateSystemState(error: UnifiedError): void {
    dispatchSystem('ADD_ERROR', {
      id: error.id,
      message: error.message,
      stack: error.stack,
      timestamp: error.timestamp,
      resolved: false
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取错误历史
   */
  getErrorHistory(): UnifiedError[] {
    return [...this.errorHistory];
  }

  /**
   * 清除错误历史
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

const errorHandler = UnifiedErrorHandler.getInstance();

/**
 * 处理错误的便捷函数
 */
export const handleError = (
  error: Error | string,
  context?: Partial<ErrorContext>
) => errorHandler.handleError(error, context);

/**
 * 创建错误上下文的便捷函数
 */
export const createErrorContext = (
  component: string,
  operation: string,
  metadata?: Record<string, any>
): ErrorContext => ({
  component,
  operation,
  metadata
});

/**
 * 获取错误处理器实例
 */
export const getErrorHandler = () => errorHandler;
