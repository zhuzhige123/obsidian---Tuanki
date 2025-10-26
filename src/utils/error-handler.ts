/**
 * 统一错误处理和通知系统
 */

import { Notice } from 'obsidian';

export type ErrorLevel = 'info' | 'warning' | 'error' | 'success';

export interface ErrorContext {
  component?: string;
  action?: string;
  details?: Record<string, any>;
}

export interface NotificationOptions {
  duration?: number;
  level?: ErrorLevel;
  showInConsole?: boolean;
}

/**
 * 错误处理器类
 */
export class ErrorHandler {
  private static instance: ErrorHandler;

  private constructor() {}

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * 处理错误并显示通知
   */
  handleError(
    error: unknown,
    message: string,
    context?: ErrorContext,
    options: NotificationOptions = {}
  ): void {
    const {
      duration = 5000,
      level = 'error',
      showInConsole = true
    } = options;

    // 格式化错误信息
    const formattedMessage = this.formatErrorMessage(error, message, context);
    
    // 显示通知
    this.showNotification(formattedMessage, level, duration);

    // 控制台输出
    if (showInConsole) {
      this.logToConsole(error, message, context, level);
    }
  }

  /**
   * 显示成功通知
   */
  showSuccess(message: string, duration = 3000): void {
    this.showNotification(message, 'success', duration);
  }

  /**
   * 显示信息通知
   */
  showInfo(message: string, duration = 3000): void {
    this.showNotification(message, 'info', duration);
  }

  /**
   * 显示警告通知
   */
  showWarning(message: string, duration = 4000): void {
    this.showNotification(message, 'warning', duration);
  }

  /**
   * 格式化错误信息
   */
  private formatErrorMessage(
    error: unknown,
    message: string,
    context?: ErrorContext
  ): string {
    let formattedMessage = message;

    // 添加上下文信息
    if (context?.component) {
      formattedMessage = `[${context.component}] ${formattedMessage}`;
    }

    // 添加具体错误信息
    const errorMessage = this.extractErrorMessage(error);
    if (errorMessage && errorMessage !== message) {
      formattedMessage += `: ${errorMessage}`;
    }

    return formattedMessage;
  }

  /**
   * 提取错误信息
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as any).message);
    }

    return '未知错误';
  }

  /**
   * 显示通知
   */
  private showNotification(message: string, level: ErrorLevel, duration: number): void {
    // 根据级别添加图标
    const icons: Record<ErrorLevel, string> = {
      success: '✅',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌'
    };

    const iconMessage = `${icons[level]} ${message}`;
    new Notice(iconMessage, duration);
  }

  /**
   * 控制台日志
   */
  private logToConsole(
    error: unknown,
    message: string,
    context?: ErrorContext,
    level: ErrorLevel
  ): void {
    const logMethod = level === 'error' ? console.error : 
                     level === 'warning' ? console.warn : 
                     console.log;

    const logData = {
      message,
      error,
      context,
      timestamp: new Date().toISOString()
    };

    logMethod('[Tuanki Plugin]', logData);
  }
}

/**
 * 全局错误处理器实例
 */
export const errorHandler = ErrorHandler.getInstance();



/**
 * 性能监控工具
 */
export class PerformanceMonitor {
  private static timers = new Map<string, number>();

  /**
   * 开始计时
   */
  static start(label: string): void {
    this.timers.set(label, performance.now());
  }

  /**
   * 结束计时并记录
   */
  static end(label: string, threshold = 100): void {
    const startTime = this.timers.get(label);
    if (!startTime) return;

    const duration = performance.now() - startTime;
    this.timers.delete(label);

    if (duration > threshold) {
      console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * 测量函数执行时间
   */
  static async measure<T>(
    label: string,
    fn: () => Promise<T>,
    threshold = 100
  ): Promise<T> {
    this.start(label);
    try {
      const result = await fn();
      this.end(label, threshold);
      return result;
    } catch (error) {
      this.end(label, threshold);
      throw error;
    }
  }
}

/**
 * 便捷的错误处理函数
 */
export function handleError(
  error: unknown,
  message: string,
  context?: ErrorContext
): void {
  errorHandler.handleError(error, message, context);
}

export function showSuccess(message: string): void {
  errorHandler.showSuccess(message);
}

export function showInfo(message: string): void {
  errorHandler.showInfo(message);
}

export function showWarning(message: string): void {
  errorHandler.showWarning(message);
}
