/**
 * 解析错误处理器
 * 统一处理智能解析系统中的各种错误情况
 */

import { Notice } from 'obsidian';

/**
 * 错误类型枚举
 */
export enum ParseErrorType {
  EMPTY_CONTENT = 'empty_content',
  INVALID_CONTENT = 'invalid_content',
  PATTERN_MATCH_FAILED = 'pattern_match_failed',
  TEMPLATE_SELECTION_FAILED = 'template_selection_failed',
  FIELD_MAPPING_FAILED = 'field_mapping_failed',
  CARD_DATA_CONSTRUCTION_FAILED = 'card_data_construction_failed',
  SYSTEM_ERROR = 'system_error'
}

/**
 * 解析错误接口
 */
export interface ParseError {
  type: ParseErrorType;
  message: string;
  originalContent: string;
  context?: any;
  timestamp: string;
  stack?: string;
}

/**
 * 错误恢复策略接口
 */
export interface ErrorRecoveryStrategy {
  canRecover(error: ParseError): boolean;
  recover(error: ParseError): any;
  description: string;
}

/**
 * 解析错误处理器类
 */
export class ParseErrorHandler {
  private recoveryStrategies: ErrorRecoveryStrategy[] = [];

  constructor() {
    this.initializeRecoveryStrategies();
  }

  /**
   * 初始化恢复策略
   */
  private initializeRecoveryStrategies(): void {
    // 1. 空内容恢复策略
    this.recoveryStrategies.push({
      canRecover: (error) => error.type === ParseErrorType.EMPTY_CONTENT,
      recover: (error) => {
        console.log('🔧 [ParseErrorHandler] 应用空内容恢复策略');
        return this.createEmptyContentFallback();
      },
      description: '空内容使用默认模板'
    });

    // 2. 模式匹配失败恢复策略
    this.recoveryStrategies.push({
      canRecover: (error) => error.type === ParseErrorType.PATTERN_MATCH_FAILED,
      recover: (error) => {
        console.log('🔧 [ParseErrorHandler] 应用模式匹配失败恢复策略');
        return this.createPatternMatchFallback(error.originalContent);
      },
      description: '模式匹配失败时使用内容保护模式'
    });

    // 3. 模板选择失败恢复策略
    this.recoveryStrategies.push({
      canRecover: (error) => error.type === ParseErrorType.TEMPLATE_SELECTION_FAILED,
      recover: (error) => {
        console.log('🔧 [ParseErrorHandler] 应用模板选择失败恢复策略');
        return this.createTemplateSelectionFallback(error.originalContent);
      },
      description: '模板选择失败时使用基础保障模板'
    });

    // 4. 字段映射失败恢复策略
    this.recoveryStrategies.push({
      canRecover: (error) => error.type === ParseErrorType.FIELD_MAPPING_FAILED,
      recover: (error) => {
        console.log('🔧 [ParseErrorHandler] 应用字段映射失败恢复策略');
        return this.createFieldMappingFallback(error.originalContent);
      },
      description: '字段映射失败时使用简单映射'
    });

    // 5. 系统错误恢复策略
    this.recoveryStrategies.push({
      canRecover: (error) => error.type === ParseErrorType.SYSTEM_ERROR,
      recover: (error) => {
        console.log('🔧 [ParseErrorHandler] 应用系统错误恢复策略');
        return this.createSystemErrorFallback(error.originalContent);
      },
      description: '系统错误时使用最基础的保护模式'
    });
  }

  /**
   * 处理解析错误
   */
  handleError(error: Error | ParseError, originalContent: string, context?: any): any {
    console.error('❌ [ParseErrorHandler] 处理解析错误:', error);

    let parseError: ParseError;

    // 转换为标准错误格式
    if (this.isParseError(error)) {
      parseError = error;
    } else {
      parseError = this.createParseError(error, originalContent, context);
    }

    // 记录错误
    this.logError(parseError);

    // 尝试恢复
    const recovery = this.attemptRecovery(parseError);
    
    if (recovery) {
      console.log('✅ [ParseErrorHandler] 错误恢复成功');
      return recovery;
    }

    // 最后的保障
    console.log('⚠️ [ParseErrorHandler] 使用最终保障策略');
    return this.createFinalFallback(originalContent);
  }

  /**
   * 判断是否为解析错误
   */
  private isParseError(error: any): error is ParseError {
    return error && typeof error === 'object' && 'type' in error && 'originalContent' in error;
  }

  /**
   * 创建解析错误对象
   */
  private createParseError(error: Error, originalContent: string, context?: any): ParseError {
    let errorType = ParseErrorType.SYSTEM_ERROR;

    // 根据错误信息判断类型
    if (error.message.includes('empty') || error.message.includes('空')) {
      errorType = ParseErrorType.EMPTY_CONTENT;
    } else if (error.message.includes('pattern') || error.message.includes('模式')) {
      errorType = ParseErrorType.PATTERN_MATCH_FAILED;
    } else if (error.message.includes('template') || error.message.includes('模板')) {
      errorType = ParseErrorType.TEMPLATE_SELECTION_FAILED;
    } else if (error.message.includes('field') || error.message.includes('字段')) {
      errorType = ParseErrorType.FIELD_MAPPING_FAILED;
    }

    return {
      type: errorType,
      message: error.message,
      originalContent,
      context,
      timestamp: new Date().toISOString(),
      stack: error.stack
    };
  }

  /**
   * 记录错误
   */
  private logError(error: ParseError): void {
    console.error('📝 [ParseErrorHandler] 错误详情:', {
      type: error.type,
      message: error.message,
      contentLength: error.originalContent.length,
      timestamp: error.timestamp,
      context: error.context
    });

    // 在开发环境显示用户友好的通知
    if (process.env.NODE_ENV === 'development') {
      new Notice(`解析错误: ${error.message}`, 3000);
    }
  }

  /**
   * 尝试错误恢复
   */
  private attemptRecovery(error: ParseError): any {
    for (const strategy of this.recoveryStrategies) {
      if (strategy.canRecover(error)) {
        console.log(`🔧 [ParseErrorHandler] 尝试恢复策略: ${strategy.description}`);
        try {
          return strategy.recover(error);
        } catch (recoveryError) {
          console.error(`❌ [ParseErrorHandler] 恢复策略失败: ${strategy.description}`, recoveryError);
        }
      }
    }
    return null;
  }

  /**
   * 空内容回退方案
   */
  private createEmptyContentFallback(): any {
    return {
      success: false,
      pattern: 'empty-content',
      confidence: 0,
      fields: {
        question: '请输入问题内容',
        answer: '请输入答案内容',
        notes: ''
      },
      notes: '',
      metadata: {
        parseMethod: 'empty-content-fallback',
        parsePattern: 'empty-content',
        parseConfidence: 0,
        matchedAt: new Date().toISOString(),
        processingTime: 0
      }
    };
  }

  /**
   * 模式匹配失败回退方案
   */
  private createPatternMatchFallback(originalContent: string): any {
    return {
      success: false,
      pattern: 'no-match',
      confidence: 0,
      fields: {
        question: originalContent,
        answer: '请补充答案内容',
        notes: originalContent
      },
      notes: originalContent,
      metadata: {
        parseMethod: 'pattern-match-fallback',
        parsePattern: 'no-match',
        parseConfidence: 0,
        matchedAt: new Date().toISOString(),
        processingTime: 0
      }
    };
  }

  /**
   * 模板选择失败回退方案
   */
  private createTemplateSelectionFallback(originalContent: string): any {
    // 动态导入基础保障模板
    return import('../data/official-triad-templates').then(({ getEmergencyTriadTemplate }) => {
      const emergencyTemplate = getEmergencyTriadTemplate();
      
      return {
        templateId: emergencyTemplate.id,
        templateName: emergencyTemplate.name,
        notes: originalContent,
        fields: {
          question: originalContent,
          answer: '请补充答案内容',
          notes: originalContent
        },
        uuid: `emergency-${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parseMetadata: {
          parseMethod: 'template-selection-fallback',
          parsePattern: 'emergency',
          parseConfidence: 0.5,
          templateSelectionReason: '模板选择失败，使用基础保障模板',
          mappingMethod: 'emergency-mapping'
        }
      };
    });
  }

  /**
   * 字段映射失败回退方案
   */
  private createFieldMappingFallback(originalContent: string): any {
    return {
      success: true,
      mappedFields: {
        question: originalContent,
        answer: '请补充答案内容',
        notes: originalContent
      },
      unmappedFields: [],
      templateFields: ['question', 'answer', 'notes'],
      notes: originalContent,
      metadata: {
        mappingMethod: 'field-mapping-fallback',
        mappingConfidence: 0.5,
        mappedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 系统错误回退方案
   */
  private createSystemErrorFallback(originalContent: string): any {
    return {
      success: false,
      error: 'system_error',
      originalContent,
      fallbackData: {
        notes: originalContent,
        fields: {
          content: originalContent,
          notes: originalContent
        },
        metadata: {
          errorHandling: 'system-error-fallback',
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  /**
   * 最终保障方案
   */
  private createFinalFallback(originalContent: string): any {
    console.log('🛡️ [ParseErrorHandler] 使用最终保障方案');
    
    return {
      success: false,
      pattern: 'final-fallback',
      confidence: 0,
      fields: {
        content: originalContent || '内容保护失败',
        notes: originalContent || '内容保护失败'
      },
      notes: originalContent || '内容保护失败',
      metadata: {
        parseMethod: 'final-fallback',
        parsePattern: 'final-fallback',
        parseConfidence: 0,
        matchedAt: new Date().toISOString(),
        processingTime: 0,
        errorHandling: true
      }
    };
  }

  /**
   * 添加自定义恢复策略
   */
  addRecoveryStrategy(strategy: ErrorRecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
    console.log(`✅ [ParseErrorHandler] 添加自定义恢复策略: ${strategy.description}`);
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): { [key in ParseErrorType]: number } {
    // 这里可以实现错误统计逻辑
    return {
      [ParseErrorType.EMPTY_CONTENT]: 0,
      [ParseErrorType.INVALID_CONTENT]: 0,
      [ParseErrorType.PATTERN_MATCH_FAILED]: 0,
      [ParseErrorType.TEMPLATE_SELECTION_FAILED]: 0,
      [ParseErrorType.FIELD_MAPPING_FAILED]: 0,
      [ParseErrorType.CARD_DATA_CONSTRUCTION_FAILED]: 0,
      [ParseErrorType.SYSTEM_ERROR]: 0
    };
  }
}

/**
 * 全局错误处理器实例
 */
let globalErrorHandler: ParseErrorHandler | null = null;

/**
 * 获取全局错误处理器
 */
export function getParseErrorHandler(): ParseErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new ParseErrorHandler();
  }
  return globalErrorHandler;
}

/**
 * 安全执行解析函数的包装器
 */
export function safeParseExecution<T>(
  parseFunction: () => T,
  originalContent: string,
  context?: any
): T {
  try {
    return parseFunction();
  } catch (error) {
    const errorHandler = getParseErrorHandler();
    return errorHandler.handleError(error as Error, originalContent, context);
  }
}

/**
 * 异步安全执行解析函数的包装器
 */
export async function safeAsyncParseExecution<T>(
  parseFunction: () => Promise<T>,
  originalContent: string,
  context?: any
): Promise<T> {
  try {
    return await parseFunction();
  } catch (error) {
    const errorHandler = getParseErrorHandler();
    return errorHandler.handleError(error as Error, originalContent, context);
  }
}
