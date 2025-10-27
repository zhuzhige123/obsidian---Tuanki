/**
 * 智能重试系统
 * 提供自动重试、降级策略和错误恢复功能
 */

import { DEFAULT_ANALYTICS_CONFIG } from '../config/analytics-config';
import { i18n } from './i18n';

// ============================================================================
// 类型定义
// ============================================================================

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
  retryCondition?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
  onFailure?: (error: Error, attempts: number) => void;
}

export interface FallbackStrategy<T> {
  name: string;
  execute: () => Promise<T>;
  condition?: (error: Error) => boolean;
  priority: number;
}

export interface RecoveryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  strategy?: string;
  attempts: number;
  duration: number;
}

// ============================================================================
// 错误分类
// ============================================================================

export enum ErrorType {
  NETWORK = 'network',
  DATA_CORRUPTION = 'data_corruption',
  TIMEOUT = 'timeout',
  PERMISSION = 'permission',
  CALCULATION = 'calculation',
  UNKNOWN = 'unknown'
}

export function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (name.includes('network') || message.includes('fetch') || message.includes('network')) {
    return ErrorType.NETWORK;
  }
  
  if (message.includes('数据') || message.includes('data') || message.includes('corrupt')) {
    return ErrorType.DATA_CORRUPTION;
  }
  
  if (message.includes('timeout') || message.includes('超时')) {
    return ErrorType.TIMEOUT;
  }
  
  if (message.includes('permission') || message.includes('权限')) {
    return ErrorType.PERMISSION;
  }
  
  if (message.includes('calculation') || message.includes('计算')) {
    return ErrorType.CALCULATION;
  }
  
  return ErrorType.UNKNOWN;
}

// ============================================================================
// 智能重试服务
// ============================================================================

export class SmartRetryService {
  private static instance: SmartRetryService;
  private config = DEFAULT_ANALYTICS_CONFIG.error;

  private constructor() {}

  static getInstance(): SmartRetryService {
    if (!SmartRetryService.instance) {
      SmartRetryService.instance = new SmartRetryService();
    }
    return SmartRetryService.instance;
  }

  /**
   * 执行带重试的操作
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const retryConfig: RetryConfig = {
      maxAttempts: this.config.RETRY.MAX_ATTEMPTS,
      initialDelay: this.config.RETRY.INITIAL_DELAY,
      backoffMultiplier: this.config.RETRY.BACKOFF_MULTIPLIER,
      maxDelay: this.config.RETRY.MAX_DELAY,
      retryCondition: this.shouldRetry.bind(this),
      ...config
    };

    let lastError: Error;
    
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // 检查是否应该重试
        if (attempt === retryConfig.maxAttempts || 
            (retryConfig.retryCondition && !retryConfig.retryCondition(lastError))) {
          break;
        }

        // 计算延迟时间
        const delay = Math.min(
          retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxDelay
        );

        // 调用重试回调
        if (retryConfig.onRetry) {
          retryConfig.onRetry(attempt, lastError);
        }

        console.warn(`Retry attempt ${attempt}/${retryConfig.maxAttempts} after ${delay}ms:`, lastError.message);
        
        // 等待后重试
        await this.delay(delay);
      }
    }

    // 调用失败回调
    if (retryConfig.onFailure) {
      retryConfig.onFailure(lastError, retryConfig.maxAttempts);
    }

    throw lastError;
  }

  /**
   * 执行带降级策略的操作
   */
  async executeWithFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackStrategies: FallbackStrategy<T>[],
    retryConfig?: Partial<RetryConfig>
  ): Promise<RecoveryResult<T>> {
    const startTime = performance.now();
    let attempts = 0;

    // 首先尝试主要操作
    try {
      attempts++;
      const result = await this.executeWithRetry(primaryOperation, retryConfig);
      return {
        success: true,
        data: result,
        strategy: 'primary',
        attempts,
        duration: performance.now() - startTime
      };
    } catch (primaryError) {
      console.warn('Primary operation failed, trying fallback strategies:', primaryError);

      // 按优先级排序降级策略
      const sortedStrategies = fallbackStrategies.sort((a, b) => a.priority - b.priority);

      // 尝试降级策略
      for (const strategy of sortedStrategies) {
        // 检查策略条件
        if (strategy.condition && !strategy.condition(primaryError as Error)) {
          continue;
        }

        try {
          attempts++;
          const result = await this.executeWithRetry(strategy.execute, {
            ...retryConfig,
            maxAttempts: Math.max(1, (retryConfig?.maxAttempts || 3) - 1) // 降级策略减少重试次数
          });
          
          console.log(`Fallback strategy '${strategy.name}' succeeded`);
          return {
            success: true,
            data: result,
            strategy: strategy.name,
            attempts,
            duration: performance.now() - startTime
          };
        } catch (fallbackError) {
          console.warn(`Fallback strategy '${strategy.name}' failed:`, fallbackError);
        }
      }

      // 所有策略都失败
      return {
        success: false,
        error: primaryError as Error,
        attempts,
        duration: performance.now() - startTime
      };
    }
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: Error): boolean {
    const errorType = classifyError(error);
    
    switch (errorType) {
      case ErrorType.NETWORK:
      case ErrorType.TIMEOUT:
        return true; // 网络和超时错误可以重试
      
      case ErrorType.DATA_CORRUPTION:
      case ErrorType.PERMISSION:
        return false; // 数据损坏和权限错误不应重试
      
      case ErrorType.CALCULATION:
        return false; // 计算错误通常不应重试
      
      case ErrorType.UNKNOWN:
      default:
        return true; // 未知错误默认重试
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 创建用户友好的错误消息
   */
  createUserFriendlyMessage(error: Error, context?: string): string {
    const errorType = classifyError(error);
    
    switch (errorType) {
      case ErrorType.NETWORK:
        return i18n.t('analytics.errors.networkError');
      
      case ErrorType.DATA_CORRUPTION:
        return i18n.t('analytics.errors.dataCorrupted');
      
      case ErrorType.TIMEOUT:
        return '操作超时，请稍后重试';
      
      case ErrorType.PERMISSION:
        return '权限不足，请检查设置';
      
      case ErrorType.CALCULATION:
        return i18n.t('analytics.errors.calculationError');
      
      default:
        return context ? `${context}: ${error.message}` : error.message;
    }
  }

  /**
   * 获取错误恢复建议
   */
  getRecoverySuggestions(error: Error): string[] {
    const errorType = classifyError(error);
    
    switch (errorType) {
      case ErrorType.NETWORK:
        return [
          '检查网络连接',
          '稍后重试',
          '尝试刷新页面'
        ];
      
      case ErrorType.DATA_CORRUPTION:
        return [
          '重新加载数据',
          '检查数据完整性',
          '联系技术支持'
        ];
      
      case ErrorType.TIMEOUT:
        return [
          '减少数据范围',
          '稍后重试',
          '检查系统性能'
        ];
      
      case ErrorType.PERMISSION:
        return [
          '检查权限设置',
          '重新登录',
          '联系管理员'
        ];
      
      case ErrorType.CALCULATION:
        return [
          '检查输入数据',
          '重新计算',
          '使用默认参数'
        ];
      
      default:
        return [
          '刷新页面',
          '重试操作',
          '联系技术支持'
        ];
    }
  }
}

// ============================================================================
// 导出实例和工具函数
// ============================================================================

export const smartRetry = SmartRetryService.getInstance();

// 便捷的重试装饰器
export function withRetry(config?: Partial<RetryConfig>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      return smartRetry.executeWithRetry(
        () => originalMethod.apply(this, args),
        config
      );
    };
    
    return descriptor;
  };
}

// 便捷的降级装饰器
export function withFallback<T>(fallbackStrategies: FallbackStrategy<T>[], config?: Partial<RetryConfig>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await smartRetry.executeWithFallback(
        () => originalMethod.apply(this, args),
        fallbackStrategies,
        config
      );
      
      if (!result.success) {
        throw result.error;
      }
      
      return result.data;
    };
    
    return descriptor;
  };
}
