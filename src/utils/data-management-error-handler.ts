/**
 * 数据管理专用错误处理机制
 * 提供用户友好的错误消息和恢复建议
 */

import type { DataManagementErrorInfo } from '../types/data-management-types';

/**
 * 数据管理错误类型
 */
export enum DataManagementErrorType {
  // 文件系统错误
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED = 'FILE_ACCESS_DENIED',
  DISK_FULL = 'DISK_FULL',
  FILE_CORRUPTED = 'FILE_CORRUPTED',
  
  // 数据错误
  DATA_VALIDATION_FAILED = 'DATA_VALIDATION_FAILED',
  DATA_FORMAT_INVALID = 'DATA_FORMAT_INVALID',
  DATA_CONFLICT = 'DATA_CONFLICT',
  DATA_TOO_LARGE = 'DATA_TOO_LARGE',
  
  // 操作错误
  OPERATION_CANCELLED = 'OPERATION_CANCELLED',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  OPERATION_FAILED = 'OPERATION_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // 服务错误
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  SERVICE_TIMEOUT = 'SERVICE_TIMEOUT',
  DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',
  
  // 备份错误
  BACKUP_CREATION_FAILED = 'BACKUP_CREATION_FAILED',
  BACKUP_RESTORATION_FAILED = 'BACKUP_RESTORATION_FAILED',
  BACKUP_VALIDATION_FAILED = 'BACKUP_VALIDATION_FAILED',
  BACKUP_NOT_FOUND = 'BACKUP_NOT_FOUND',
  
  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  
  // 未知错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * 数据管理错误类
 */
export class DataManagementError extends Error {
  public readonly type: DataManagementErrorType;
  public readonly code: string;
  public readonly details?: string;
  public readonly suggestions: string[];
  public readonly severity: 'low' | 'medium' | 'high' | 'critical';
  public readonly recoverable: boolean;

  constructor(
    type: DataManagementErrorType,
    message: string,
    options: {
      code?: string;
      details?: string;
      suggestions?: string[];
      severity?: 'low' | 'medium' | 'high' | 'critical';
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'DataManagementError';
    this.type = type;
    this.code = options.code || type;
    this.details = options.details;
    this.suggestions = options.suggestions || [];
    this.severity = options.severity || 'medium';
    this.recoverable = options.recoverable ?? true;
    
    if (options.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * 转换为DataManagementErrorInfo格式
   */
  toErrorInfo(): DataManagementErrorInfo {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
      suggestions: this.suggestions,
      severity: this.severity
    };
  }
}

/**
 * 数据管理错误处理器
 */
export class DataManagementErrorHandler {
  private static instance: DataManagementErrorHandler;
  private errorMessages: Map<DataManagementErrorType, string> = new Map();
  private errorSuggestions: Map<DataManagementErrorType, string[]> = new Map();

  private constructor() {
    this.initializeErrorMessages();
    this.initializeErrorSuggestions();
  }

  public static getInstance(): DataManagementErrorHandler {
    if (!DataManagementErrorHandler.instance) {
      DataManagementErrorHandler.instance = new DataManagementErrorHandler();
    }
    return DataManagementErrorHandler.instance;
  }

  /**
   * 初始化错误消息
   */
  private initializeErrorMessages(): void {
    this.errorMessages.set(DataManagementErrorType.FILE_NOT_FOUND, '文件或文件夹不存在');
    this.errorMessages.set(DataManagementErrorType.FILE_ACCESS_DENIED, '文件访问被拒绝');
    this.errorMessages.set(DataManagementErrorType.DISK_FULL, '磁盘空间不足');
    this.errorMessages.set(DataManagementErrorType.FILE_CORRUPTED, '文件已损坏');
    
    this.errorMessages.set(DataManagementErrorType.DATA_VALIDATION_FAILED, '数据验证失败');
    this.errorMessages.set(DataManagementErrorType.DATA_FORMAT_INVALID, '数据格式无效');
    this.errorMessages.set(DataManagementErrorType.DATA_CONFLICT, '数据冲突');
    this.errorMessages.set(DataManagementErrorType.DATA_TOO_LARGE, '数据文件过大');
    
    this.errorMessages.set(DataManagementErrorType.OPERATION_CANCELLED, '操作已取消');
    this.errorMessages.set(DataManagementErrorType.OPERATION_TIMEOUT, '操作超时');
    this.errorMessages.set(DataManagementErrorType.OPERATION_FAILED, '操作执行失败');
    this.errorMessages.set(DataManagementErrorType.PERMISSION_DENIED, '权限不足');
    
    this.errorMessages.set(DataManagementErrorType.SERVICE_UNAVAILABLE, '服务不可用');
    this.errorMessages.set(DataManagementErrorType.SERVICE_TIMEOUT, '服务响应超时');
    this.errorMessages.set(DataManagementErrorType.DEPENDENCY_MISSING, '缺少必要依赖');
    
    this.errorMessages.set(DataManagementErrorType.BACKUP_CREATION_FAILED, '备份创建失败');
    this.errorMessages.set(DataManagementErrorType.BACKUP_RESTORATION_FAILED, '备份恢复失败');
    this.errorMessages.set(DataManagementErrorType.BACKUP_VALIDATION_FAILED, '备份验证失败');
    this.errorMessages.set(DataManagementErrorType.BACKUP_NOT_FOUND, '备份文件不存在');
    
    this.errorMessages.set(DataManagementErrorType.NETWORK_ERROR, '网络连接错误');
    this.errorMessages.set(DataManagementErrorType.CONNECTION_TIMEOUT, '连接超时');
    
    this.errorMessages.set(DataManagementErrorType.UNKNOWN_ERROR, '未知错误');
  }

  /**
   * 初始化错误建议
   */
  private initializeErrorSuggestions(): void {
    this.errorSuggestions.set(DataManagementErrorType.FILE_NOT_FOUND, [
      '检查文件路径是否正确',
      '确认文件是否已被删除或移动',
      '尝试重新创建文件夹'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.FILE_ACCESS_DENIED, [
      '检查文件权限设置',
      '以管理员身份运行应用',
      '确认文件未被其他程序占用'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.DISK_FULL, [
      '清理磁盘空间',
      '删除不必要的文件',
      '选择其他存储位置'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.FILE_CORRUPTED, [
      '尝试从备份恢复',
      '重新下载或创建文件',
      '运行文件系统检查'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.DATA_VALIDATION_FAILED, [
      '检查数据格式是否正确',
      '确认数据完整性',
      '尝试重新导入数据'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.DATA_FORMAT_INVALID, [
      '确认文件格式正确',
      '检查文件是否完整',
      '尝试使用其他格式导入'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.DATA_CONFLICT, [
      '选择冲突解决策略',
      '手动合并冲突数据',
      '创建备份后重试'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.DATA_TOO_LARGE, [
      '分批处理数据',
      '压缩数据文件',
      '增加可用内存'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.OPERATION_CANCELLED, [
      '重新执行操作',
      '检查操作参数',
      '确认操作权限'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.OPERATION_TIMEOUT, [
      '增加超时时间',
      '检查网络连接',
      '分批处理数据'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.BACKUP_CREATION_FAILED, [
      '检查存储空间',
      '确认备份路径可写',
      '重试备份操作'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.BACKUP_RESTORATION_FAILED, [
      '验证备份文件完整性',
      '检查目标路径权限',
      '尝试其他备份文件'
    ]);
    
    this.errorSuggestions.set(DataManagementErrorType.NETWORK_ERROR, [
      '检查网络连接',
      '重试操作',
      '使用离线模式'
    ]);
  }

  /**
   * 处理错误并转换为用户友好的格式
   */
  public handleError(error: Error, context?: string): DataManagementError {
    // 如果已经是DataManagementError，直接返回
    if (error instanceof DataManagementError) {
      return error;
    }

    // 根据错误消息推断错误类型
    const errorType = this.inferErrorType(error);
    const userMessage = this.getUserFriendlyMessage(errorType, error.message);
    const suggestions = this.getSuggestions(errorType);
    const severity = this.getSeverity(errorType);

    return new DataManagementError(errorType, userMessage, {
      code: errorType,
      details: context ? `${context}: ${error.message}` : error.message,
      suggestions,
      severity,
      cause: error
    });
  }

  /**
   * 根据错误消息推断错误类型
   */
  private inferErrorType(error: Error): DataManagementErrorType {
    const message = error.message.toLowerCase();

    // 文件系统错误
    if (message.includes('no such file') || message.includes('not found')) {
      return DataManagementErrorType.FILE_NOT_FOUND;
    }
    if (message.includes('permission denied') || message.includes('access denied')) {
      return DataManagementErrorType.FILE_ACCESS_DENIED;
    }
    if (message.includes('no space') || message.includes('disk full')) {
      return DataManagementErrorType.DISK_FULL;
    }
    if (message.includes('corrupted') || message.includes('invalid format')) {
      return DataManagementErrorType.FILE_CORRUPTED;
    }

    // 数据错误
    if (message.includes('validation') || message.includes('invalid data')) {
      return DataManagementErrorType.DATA_VALIDATION_FAILED;
    }
    if (message.includes('format') || message.includes('parse')) {
      return DataManagementErrorType.DATA_FORMAT_INVALID;
    }
    if (message.includes('conflict')) {
      return DataManagementErrorType.DATA_CONFLICT;
    }
    if (message.includes('too large') || message.includes('size limit')) {
      return DataManagementErrorType.DATA_TOO_LARGE;
    }

    // 操作错误
    if (message.includes('cancelled') || message.includes('aborted')) {
      return DataManagementErrorType.OPERATION_CANCELLED;
    }
    if (message.includes('timeout')) {
      return DataManagementErrorType.OPERATION_TIMEOUT;
    }

    // 备份错误
    if (message.includes('backup')) {
      if (message.includes('create') || message.includes('creation')) {
        return DataManagementErrorType.BACKUP_CREATION_FAILED;
      }
      if (message.includes('restore') || message.includes('restoration')) {
        return DataManagementErrorType.BACKUP_RESTORATION_FAILED;
      }
      if (message.includes('validation') || message.includes('verify')) {
        return DataManagementErrorType.BACKUP_VALIDATION_FAILED;
      }
      return DataManagementErrorType.BACKUP_NOT_FOUND;
    }

    // 网络错误
    if (message.includes('network') || message.includes('connection')) {
      return DataManagementErrorType.NETWORK_ERROR;
    }

    return DataManagementErrorType.UNKNOWN_ERROR;
  }

  /**
   * 获取用户友好的错误消息
   */
  private getUserFriendlyMessage(type: DataManagementErrorType, originalMessage: string): string {
    const friendlyMessage = this.errorMessages.get(type);
    return friendlyMessage || originalMessage;
  }

  /**
   * 获取错误建议
   */
  private getSuggestions(type: DataManagementErrorType): string[] {
    return this.errorSuggestions.get(type) || ['请重试操作或联系技术支持'];
  }

  /**
   * 获取错误严重程度
   */
  private getSeverity(type: DataManagementErrorType): 'low' | 'medium' | 'high' | 'critical' {
    const criticalErrors = [
      DataManagementErrorType.FILE_CORRUPTED,
      DataManagementErrorType.DISK_FULL,
      DataManagementErrorType.DATA_VALIDATION_FAILED
    ];

    const highErrors = [
      DataManagementErrorType.FILE_ACCESS_DENIED,
      DataManagementErrorType.BACKUP_RESTORATION_FAILED,
      DataManagementErrorType.PERMISSION_DENIED
    ];

    const lowErrors = [
      DataManagementErrorType.OPERATION_CANCELLED,
      DataManagementErrorType.NETWORK_ERROR
    ];

    if (criticalErrors.includes(type)) return 'critical';
    if (highErrors.includes(type)) return 'high';
    if (lowErrors.includes(type)) return 'low';
    return 'medium';
  }

  /**
   * 创建特定类型的错误
   */
  public createError(
    type: DataManagementErrorType,
    customMessage?: string,
    options?: {
      details?: string;
      suggestions?: string[];
      severity?: 'low' | 'medium' | 'high' | 'critical';
    }
  ): DataManagementError {
    const message = customMessage || this.getUserFriendlyMessage(type, '');
    const suggestions = options?.suggestions || this.getSuggestions(type);
    const severity = options?.severity || this.getSeverity(type);

    return new DataManagementError(type, message, {
      code: type,
      details: options?.details,
      suggestions,
      severity
    });
  }
}

/**
 * 全局错误处理器实例
 */
export const dataManagementErrorHandler = DataManagementErrorHandler.getInstance();

/**
 * 便捷的错误处理函数
 */
export function handleDataManagementError(error: Error, context?: string): DataManagementError {
  return dataManagementErrorHandler.handleError(error, context);
}

/**
 * 创建数据管理错误的便捷函数
 */
export function createDataManagementError(
  type: DataManagementErrorType,
  message?: string,
  options?: {
    details?: string;
    suggestions?: string[];
    severity?: 'low' | 'medium' | 'high' | 'critical';
  }
): DataManagementError {
  return dataManagementErrorHandler.createError(type, message, options);
}
