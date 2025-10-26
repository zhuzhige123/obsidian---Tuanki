/**
 * 错误报告和分析系统
 * 提供全面的错误收集、分析和报告功能
 */

import { globalPerformanceMonitor } from './parsing-performance-monitor';
import type { AppError } from '../stores/unified-state-manager';

// 错误分类
export enum ErrorCategory {
  PARSING = 'parsing',
  RENDERING = 'rendering',
  DATA = 'data',
  NETWORK = 'network',
  PERFORMANCE = 'performance',
  USER_INPUT = 'user_input',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

// 错误严重程度
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// 错误上下文信息
export interface ErrorContext {
  userId?: string;
  sessionId: string;
  timestamp: number;
  userAgent: string;
  url: string;
  cardId?: string;
  componentName?: string;
  operationType?: string;
  performanceMetrics?: any;
  stackTrace?: string;
  additionalData?: Record<string, any>;
}

// 错误报告
export interface ErrorReport {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  error: Error;
  context: ErrorContext;
  frequency: number;
  firstOccurrence: number;
  lastOccurrence: number;
  resolved: boolean;
  resolutionMethod?: string;
  impactScore: number;
}

// 错误分析结果
export interface ErrorAnalysis {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  topErrors: ErrorReport[];
  errorTrends: {
    hourly: number[];
    daily: number[];
    weekly: number[];
  };
  impactAnalysis: {
    userImpact: number;
    performanceImpact: number;
    systemStability: number;
  };
  recommendations: string[];
}

/**
 * 错误报告和分析系统
 */
export class ErrorReportingSystem {
  private errors: Map<string, ErrorReport> = new Map();
  private sessionId: string;
  private maxErrorHistory = 1000;
  private analysisCache: ErrorAnalysis | null = null;
  private analysisCacheTime = 0;
  private readonly CACHE_DURATION = 60000; // 1分钟

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupGlobalErrorHandlers();
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 设置全局错误处理器
   */
  private setupGlobalErrorHandlers(): void {
    // 捕获未处理的JavaScript错误
    window.addEventListener('error', (event) => {
      this.reportError({
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        message: event.message,
        error: event.error || new Error(event.message),
        context: {
          sessionId: this.sessionId,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          url: window.location.href,
          stackTrace: event.error?.stack,
          additionalData: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          }
        }
      });
    });

    // 捕获未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error 
        ? event.reason 
        : new Error(String(event.reason));

      this.reportError({
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        message: `未处理的Promise拒绝: ${error.message}`,
        error,
        context: {
          sessionId: this.sessionId,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          url: window.location.href,
          stackTrace: error.stack,
          additionalData: {
            promiseRejection: true
          }
        }
      });
    });
  }

  /**
   * 报告错误
   */
  reportError(errorData: {
    category: ErrorCategory;
    severity: ErrorSeverity;
    message: string;
    error: Error;
    context: Partial<ErrorContext>;
  }): string {
    const errorId = this.generateErrorId(errorData.error, errorData.message);
    const now = Date.now();

    // 完善上下文信息
    const fullContext: ErrorContext = {
      sessionId: this.sessionId,
      timestamp: now,
      userAgent: navigator.userAgent,
      url: window.location.href,
      performanceMetrics: globalPerformanceMonitor.getSystemMetrics(),
      stackTrace: errorData.error.stack,
      ...errorData.context
    };

    // 检查是否是重复错误
    if (this.errors.has(errorId)) {
      const existingError = this.errors.get(errorId)!;
      existingError.frequency++;
      existingError.lastOccurrence = now;
      
      // 更新严重程度（频繁出现的错误提升严重程度）
      if (existingError.frequency > 10 && existingError.severity === ErrorSeverity.LOW) {
        existingError.severity = ErrorSeverity.MEDIUM;
      } else if (existingError.frequency > 50 && existingError.severity === ErrorSeverity.MEDIUM) {
        existingError.severity = ErrorSeverity.HIGH;
      }
    } else {
      // 新错误
      const errorReport: ErrorReport = {
        id: errorId,
        category: errorData.category,
        severity: errorData.severity,
        message: errorData.message,
        error: errorData.error,
        context: fullContext,
        frequency: 1,
        firstOccurrence: now,
        lastOccurrence: now,
        resolved: false,
        impactScore: this.calculateImpactScore(errorData.category, errorData.severity)
      };

      this.errors.set(errorId, errorReport);

      // 限制错误历史记录数量
      if (this.errors.size > this.maxErrorHistory) {
        this.cleanupOldErrors();
      }
    }

    // 清除分析缓存
    this.analysisCache = null;

    // 记录到性能监控
    globalPerformanceMonitor.recordOperation(
      `error_${errorData.category}`,
      0,
      false,
      0,
      false
    );

    // 控制台输出（开发模式）
    if (process.env.NODE_ENV === 'development') {
      console.error(`🚨 [ErrorReporting] ${errorData.category}:`, {
        id: errorId,
        message: errorData.message,
        error: errorData.error,
        context: fullContext
      });
    }

    return errorId;
  }

  /**
   * 生成错误ID
   */
  private generateErrorId(error: Error, message: string): string {
    const key = `${error.name}_${message}_${error.stack?.split('\n')[1] || ''}`;
    return btoa(key).replace(/[^a-zA-Z0-9]/g, '').substr(0, 16);
  }

  /**
   * 计算影响分数
   */
  private calculateImpactScore(category: ErrorCategory, severity: ErrorSeverity): number {
    let baseScore = 0;

    // 根据类别计算基础分数
    switch (category) {
      case ErrorCategory.CRITICAL:
      case ErrorCategory.SYSTEM:
        baseScore = 80;
        break;
      case ErrorCategory.RENDERING:
      case ErrorCategory.PARSING:
        baseScore = 60;
        break;
      case ErrorCategory.DATA:
      case ErrorCategory.NETWORK:
        baseScore = 40;
        break;
      case ErrorCategory.PERFORMANCE:
        baseScore = 30;
        break;
      case ErrorCategory.USER_INPUT:
        baseScore = 20;
        break;
      default:
        baseScore = 10;
    }

    // 根据严重程度调整分数
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return baseScore * 1.5;
      case ErrorSeverity.HIGH:
        return baseScore * 1.2;
      case ErrorSeverity.MEDIUM:
        return baseScore * 1.0;
      case ErrorSeverity.LOW:
        return baseScore * 0.7;
      default:
        return baseScore;
    }
  }

  /**
   * 清理旧错误
   */
  private cleanupOldErrors(): void {
    const errors = Array.from(this.errors.values());
    const sortedErrors = errors.sort((a, b) => b.lastOccurrence - a.lastOccurrence);
    
    // 保留最近的错误
    const toKeep = sortedErrors.slice(0, this.maxErrorHistory * 0.8);
    
    this.errors.clear();
    toKeep.forEach(error => {
      this.errors.set(error.id, error);
    });
  }

  /**
   * 标记错误为已解决
   */
  resolveError(errorId: string, resolutionMethod: string): boolean {
    const error = this.errors.get(errorId);
    if (error) {
      error.resolved = true;
      error.resolutionMethod = resolutionMethod;
      this.analysisCache = null; // 清除缓存
      return true;
    }
    return false;
  }

  /**
   * 获取错误报告
   */
  getErrorReport(errorId: string): ErrorReport | null {
    return this.errors.get(errorId) || null;
  }

  /**
   * 获取所有错误
   */
  getAllErrors(): ErrorReport[] {
    return Array.from(this.errors.values());
  }

  /**
   * 分析错误数据
   */
  analyzeErrors(): ErrorAnalysis {
    const now = Date.now();
    
    // 检查缓存
    if (this.analysisCache && (now - this.analysisCacheTime) < this.CACHE_DURATION) {
      return this.analysisCache;
    }

    const errors = this.getAllErrors();
    const unresolvedErrors = errors.filter(e => !e.resolved);

    // 按类别统计
    const errorsByCategory = {} as Record<ErrorCategory, number>;
    Object.values(ErrorCategory).forEach(category => {
      errorsByCategory[category] = unresolvedErrors.filter(e => e.category === category).length;
    });

    // 按严重程度统计
    const errorsBySeverity = {} as Record<ErrorSeverity, number>;
    Object.values(ErrorSeverity).forEach(severity => {
      errorsBySeverity[severity] = unresolvedErrors.filter(e => e.severity === severity).length;
    });

    // 获取影响最大的错误
    const topErrors = unresolvedErrors
      .sort((a, b) => b.impactScore * b.frequency - a.impactScore * a.frequency)
      .slice(0, 10);

    // 计算趋势（简化版本）
    const errorTrends = this.calculateErrorTrends(errors);

    // 影响分析
    const impactAnalysis = this.calculateImpactAnalysis(unresolvedErrors);

    // 生成建议
    const recommendations = this.generateRecommendations(unresolvedErrors, errorsByCategory, errorsBySeverity);

    const analysis: ErrorAnalysis = {
      totalErrors: unresolvedErrors.length,
      errorsByCategory,
      errorsBySeverity,
      topErrors,
      errorTrends,
      impactAnalysis,
      recommendations
    };

    // 缓存结果
    this.analysisCache = analysis;
    this.analysisCacheTime = now;

    return analysis;
  }

  /**
   * 计算错误趋势
   */
  private calculateErrorTrends(errors: ErrorReport[]): ErrorAnalysis['errorTrends'] {
    const now = Date.now();
    const hourly = new Array(24).fill(0);
    const daily = new Array(7).fill(0);
    const weekly = new Array(4).fill(0);

    errors.forEach(error => {
      const errorTime = new Date(error.lastOccurrence);
      const timeDiff = now - error.lastOccurrence;

      // 小时趋势（过去24小时）
      if (timeDiff < 24 * 60 * 60 * 1000) {
        const hourIndex = Math.floor(timeDiff / (60 * 60 * 1000));
        if (hourIndex < 24) hourly[23 - hourIndex]++;
      }

      // 日趋势（过去7天）
      if (timeDiff < 7 * 24 * 60 * 60 * 1000) {
        const dayIndex = Math.floor(timeDiff / (24 * 60 * 60 * 1000));
        if (dayIndex < 7) daily[6 - dayIndex]++;
      }

      // 周趋势（过去4周）
      if (timeDiff < 4 * 7 * 24 * 60 * 60 * 1000) {
        const weekIndex = Math.floor(timeDiff / (7 * 24 * 60 * 60 * 1000));
        if (weekIndex < 4) weekly[3 - weekIndex]++;
      }
    });

    return { hourly, daily, weekly };
  }

  /**
   * 计算影响分析
   */
  private calculateImpactAnalysis(errors: ErrorReport[]): ErrorAnalysis['impactAnalysis'] {
    const totalImpact = errors.reduce((sum, error) => sum + error.impactScore * error.frequency, 0);
    const maxPossibleImpact = errors.length * 100 * 10; // 假设最大影响

    const userImpact = Math.min(100, (totalImpact / (maxPossibleImpact || 1)) * 100);
    
    const performanceErrors = errors.filter(e => 
      e.category === ErrorCategory.PERFORMANCE || 
      e.category === ErrorCategory.RENDERING
    );
    const performanceImpact = Math.min(100, (performanceErrors.length / (errors.length || 1)) * 100);

    const systemErrors = errors.filter(e => 
      e.category === ErrorCategory.SYSTEM || 
      e.severity === ErrorSeverity.CRITICAL
    );
    const systemStability = Math.max(0, 100 - (systemErrors.length / (errors.length || 1)) * 100);

    return {
      userImpact,
      performanceImpact,
      systemStability
    };
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(
    errors: ErrorReport[], 
    byCategory: Record<ErrorCategory, number>,
    bySeverity: Record<ErrorSeverity, number>
  ): string[] {
    const recommendations: string[] = [];

    // 基于错误类别的建议
    if (byCategory[ErrorCategory.PARSING] > 5) {
      recommendations.push('解析错误较多，建议优化内容解析算法或增强输入验证');
    }

    if (byCategory[ErrorCategory.RENDERING] > 3) {
      recommendations.push('渲染错误频发，建议检查组件状态管理和数据流');
    }

    if (byCategory[ErrorCategory.PERFORMANCE] > 2) {
      recommendations.push('性能问题较多，建议启用缓存和优化算法复杂度');
    }

    // 基于严重程度的建议
    if (bySeverity[ErrorSeverity.CRITICAL] > 0) {
      recommendations.push('存在严重错误，需要立即修复以确保系统稳定性');
    }

    if (bySeverity[ErrorSeverity.HIGH] > 5) {
      recommendations.push('高严重程度错误较多，建议优先处理影响用户体验的问题');
    }

    // 基于频率的建议
    const highFrequencyErrors = errors.filter(e => e.frequency > 10);
    if (highFrequencyErrors.length > 0) {
      recommendations.push('存在高频错误，建议分析根本原因并实施预防措施');
    }

    // 通用建议
    if (errors.length > 50) {
      recommendations.push('错误总数较多，建议实施更严格的质量控制和测试流程');
    }

    return recommendations;
  }

  /**
   * 导出错误数据
   */
  exportErrorData(): {
    errors: ErrorReport[];
    analysis: ErrorAnalysis;
    sessionInfo: {
      sessionId: string;
      exportTime: number;
      totalErrors: number;
    };
  } {
    return {
      errors: this.getAllErrors(),
      analysis: this.analyzeErrors(),
      sessionInfo: {
        sessionId: this.sessionId,
        exportTime: Date.now(),
        totalErrors: this.errors.size
      }
    };
  }

  /**
   * 清理所有错误数据
   */
  clearAllErrors(): void {
    this.errors.clear();
    this.analysisCache = null;
  }

  /**
   * 销毁错误报告系统
   */
  destroy(): void {
    this.clearAllErrors();
  }
}

// 全局错误报告系统实例
export const globalErrorReporter = new ErrorReportingSystem();
