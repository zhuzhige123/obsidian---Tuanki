/**
 * 🔧 Tuanki 统一错误处理系统
 * 提供用户友好的错误信息和自动恢复机制
 */

import { Notice } from 'obsidian';

/**
 * 错误类型枚举
 */
export enum TuankiErrorType {
  PARSE_ERROR = 'PARSE_ERROR',
  METADATA_ERROR = 'METADATA_ERROR',
  BLOCK_LINK_ERROR = 'BLOCK_LINK_ERROR',
  CARD_CREATION_ERROR = 'CARD_CREATION_ERROR',
  FILE_ACCESS_ERROR = 'FILE_ACCESS_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * 错误严重程度
 */
export enum TuankiErrorSeverity {
  LOW = 'LOW',       // 警告，不影响核心功能
  MEDIUM = 'MEDIUM', // 错误，影响部分功能
  HIGH = 'HIGH',     // 严重错误，影响核心功能
  CRITICAL = 'CRITICAL' // 致命错误，系统无法继续
}

/**
 * Tuanki 错误接口
 */
export interface TuankiError {
  type: TuankiErrorType;
  severity: TuankiErrorSeverity;
  message: string;
  userMessage: string;
  context?: Record<string, any>;
  originalError?: Error;
  timestamp: string;
  recoverable: boolean;
  recoveryActions?: string[];
}

/**
 * 错误处理结果
 */
export interface ErrorHandlingResult {
  handled: boolean;
  recovered: boolean;
  userNotified: boolean;
  actions: string[];
}

/**
 * 统一错误处理器
 */
export class TuankiErrorHandler {
  private static instance: TuankiErrorHandler;
  private errorHistory: TuankiError[] = [];
  private maxHistorySize = 100;

  private constructor() {}

  static getInstance(): TuankiErrorHandler {
    if (!TuankiErrorHandler.instance) {
      TuankiErrorHandler.instance = new TuankiErrorHandler();
    }
    return TuankiErrorHandler.instance;
  }

  /**
   * 处理错误
   */
  async handleError(error: Error | TuankiError, context?: Record<string, any>): Promise<ErrorHandlingResult> {
    const tuankiError = this.normalizeError(error, context);
    
    // 记录错误
    this.recordError(tuankiError);
    
    // 记录日志
    this.logError(tuankiError);
    
    // 通知用户
    const userNotified = this.notifyUser(tuankiError);
    
    // 尝试恢复
    const recovered = await this.attemptRecovery(tuankiError);
    
    return {
      handled: true,
      recovered,
      userNotified,
      actions: tuankiError.recoveryActions || []
    };
  }

  /**
   * 标准化错误对象
   */
  private normalizeError(error: Error | TuankiError, context?: Record<string, any>): TuankiError {
    if (this.isTuankiError(error)) {
      return error;
    }

    // 根据错误信息推断错误类型
    const type = this.inferErrorType(error);
    const severity = this.inferErrorSeverity(type, error);
    
    return {
      type,
      severity,
      message: error.message,
      userMessage: this.generateUserMessage(type, error.message),
      context,
      originalError: error,
      timestamp: new Date().toISOString(),
      recoverable: this.isRecoverable(type),
      recoveryActions: this.getRecoveryActions(type)
    };
  }

  /**
   * 推断错误类型
   */
  private inferErrorType(error: Error): TuankiErrorType {
    const message = error.message.toLowerCase();
    
    if (message.includes('parse') || message.includes('解析')) {
      return TuankiErrorType.PARSE_ERROR;
    }
    if (message.includes('metadata') || message.includes('元数据')) {
      return TuankiErrorType.METADATA_ERROR;
    }
    if (message.includes('block') || message.includes('块链接')) {
      return TuankiErrorType.BLOCK_LINK_ERROR;
    }
    if (message.includes('card') || message.includes('卡片')) {
      return TuankiErrorType.CARD_CREATION_ERROR;
    }
    if (message.includes('file') || message.includes('文件')) {
      return TuankiErrorType.FILE_ACCESS_ERROR;
    }
    if (message.includes('network') || message.includes('网络')) {
      return TuankiErrorType.NETWORK_ERROR;
    }
    if (message.includes('validation') || message.includes('验证')) {
      return TuankiErrorType.VALIDATION_ERROR;
    }
    
    return TuankiErrorType.UNKNOWN_ERROR;
  }

  /**
   * 推断错误严重程度
   */
  private inferErrorSeverity(type: TuankiErrorType, error: Error): TuankiErrorSeverity {
    switch (type) {
      case TuankiErrorType.PARSE_ERROR:
      case TuankiErrorType.VALIDATION_ERROR:
        return TuankiErrorSeverity.MEDIUM;
      
      case TuankiErrorType.METADATA_ERROR:
      case TuankiErrorType.BLOCK_LINK_ERROR:
        return TuankiErrorSeverity.LOW;
      
      case TuankiErrorType.CARD_CREATION_ERROR:
        return TuankiErrorSeverity.HIGH;
      
      case TuankiErrorType.FILE_ACCESS_ERROR:
      case TuankiErrorType.NETWORK_ERROR:
        return TuankiErrorSeverity.MEDIUM;
      
      default:
        return TuankiErrorSeverity.MEDIUM;
    }
  }

  /**
   * 生成用户友好的错误信息
   */
  private generateUserMessage(type: TuankiErrorType, originalMessage: string): string {
    const userMessages = {
      [TuankiErrorType.PARSE_ERROR]: '标注格式不正确，请检查语法',
      [TuankiErrorType.METADATA_ERROR]: '元数据处理失败，将使用默认值',
      [TuankiErrorType.BLOCK_LINK_ERROR]: '块链接生成失败，将使用备用方案',
      [TuankiErrorType.CARD_CREATION_ERROR]: '卡片创建失败，请检查内容格式',
      [TuankiErrorType.FILE_ACCESS_ERROR]: '文件访问失败，请检查文件权限',
      [TuankiErrorType.NETWORK_ERROR]: '网络连接失败，请检查网络设置',
      [TuankiErrorType.VALIDATION_ERROR]: '数据验证失败，请检查输入内容',
      [TuankiErrorType.UNKNOWN_ERROR]: '发生未知错误，请重试'
    };

    return userMessages[type] || originalMessage;
  }

  /**
   * 判断错误是否可恢复
   */
  private isRecoverable(type: TuankiErrorType): boolean {
    const recoverableTypes = [
      TuankiErrorType.METADATA_ERROR,
      TuankiErrorType.BLOCK_LINK_ERROR,
      TuankiErrorType.NETWORK_ERROR
    ];
    
    return recoverableTypes.includes(type);
  }

  /**
   * 获取恢复操作建议
   */
  private getRecoveryActions(type: TuankiErrorType): string[] {
    const recoveryActions = {
      [TuankiErrorType.PARSE_ERROR]: [
        '检查标注语法格式',
        '参考标注语法文档',
        '使用标注模板'
      ],
      [TuankiErrorType.METADATA_ERROR]: [
        '重新生成元数据',
        '检查文件权限',
        '使用默认元数据'
      ],
      [TuankiErrorType.BLOCK_LINK_ERROR]: [
        '重新生成块链接',
        '使用备用链接格式',
        '检查文件路径'
      ],
      [TuankiErrorType.CARD_CREATION_ERROR]: [
        '检查卡片内容格式',
        '验证必填字段',
        '使用简化模板'
      ],
      [TuankiErrorType.FILE_ACCESS_ERROR]: [
        '检查文件是否存在',
        '验证文件权限',
        '重新打开文件'
      ],
      [TuankiErrorType.NETWORK_ERROR]: [
        '检查网络连接',
        '重试操作',
        '使用离线模式'
      ],
      [TuankiErrorType.VALIDATION_ERROR]: [
        '检查输入格式',
        '验证必填字段',
        '使用默认值'
      ],
      [TuankiErrorType.UNKNOWN_ERROR]: [
        '重试操作',
        '重启插件',
        '查看详细日志'
      ]
    };

    return recoveryActions[type] || ['重试操作'];
  }

  /**
   * 记录错误到历史
   */
  private recordError(error: TuankiError): void {
    this.errorHistory.unshift(error);
    
    // 限制历史记录大小
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * 记录错误日志
   */
  private logError(error: TuankiError): void {
    const logLevel = this.getLogLevel(error.severity);
    const logMessage = `[Tuanki ${error.type}] ${error.message}`;
    
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
   * 获取日志级别
   */
  private getLogLevel(severity: TuankiErrorSeverity): string {
    switch (severity) {
      case TuankiErrorSeverity.CRITICAL:
      case TuankiErrorSeverity.HIGH:
        return 'error';
      case TuankiErrorSeverity.MEDIUM:
        return 'warn';
      case TuankiErrorSeverity.LOW:
        return 'info';
      default:
        return 'log';
    }
  }

  /**
   * 通知用户
   */
  private notifyUser(error: TuankiError): boolean {
    // 只对中等及以上严重程度的错误通知用户
    if (error.severity === TuankiErrorSeverity.LOW) {
      return false;
    }

    try {
      new Notice(`Tuanki: ${error.userMessage}`, 5000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 尝试自动恢复
   */
  private async attemptRecovery(error: TuankiError): Promise<boolean> {
    if (!error.recoverable) {
      return false;
    }

    try {
      // 这里可以实现具体的恢复逻辑
      console.log(`🔄 [ErrorHandler] 尝试恢复错误: ${error.type}`);
      
      // 模拟恢复操作
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log(`✅ [ErrorHandler] 错误恢复成功: ${error.type}`);
      return true;
    } catch (recoveryError) {
      console.error(`❌ [ErrorHandler] 错误恢复失败: ${error.type}`, recoveryError);
      return false;
    }
  }

  /**
   * 判断是否为 TuankiError
   */
  private isTuankiError(error: any): error is TuankiError {
    return error && typeof error === 'object' && 'type' in error && 'severity' in error;
  }

  /**
   * 获取错误历史
   */
  getErrorHistory(): TuankiError[] {
    return [...this.errorHistory];
  }

  /**
   * 清除错误历史
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * 创建特定类型的错误
   */
  static createError(
    type: TuankiErrorType,
    message: string,
    context?: Record<string, any>,
    originalError?: Error
  ): TuankiError {
    const handler = TuankiErrorHandler.getInstance();
    return handler.normalizeError(
      originalError || new Error(message),
      { ...context, errorType: type }
    );
  }
}
