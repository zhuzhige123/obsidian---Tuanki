/**
 * 转换层抽象接口和基础类
 * 定义格式转换层的统一接口
 */

import type { ConversionContext, LayerConversionResult } from '../../../types/ankiconnect-types';

/**
 * 转换层接口
 */
export interface IConversionLayer {
  /** 层名称（唯一标识） */
  name: string;
  
  /** 优先级（数字越大优先级越高） */
  priority: number;
  
  /** 是否启用 */
  enabled: boolean;
  
  /** 层描述 */
  description: string;
  
  /**
   * 执行转换
   * @param content 待转换的内容
   * @param context 转换上下文
   * @returns 转换结果
   */
  convert(content: string, context: ConversionContext): LayerConversionResult;
}

/**
 * 转换层基础抽象类
 * 提供通用功能实现
 */
export abstract class BaseConversionLayer implements IConversionLayer {
  abstract name: string;
  abstract priority: number;
  abstract description: string;
  
  enabled: boolean = true;

  /**
   * 执行转换（子类必须实现）
   */
  abstract convert(content: string, context: ConversionContext): LayerConversionResult;

  /**
   * 辅助方法：创建转换结果
   */
  protected createResult(
    content: string,
    changeCount: number = 0,
    warnings: string[] = []
  ): LayerConversionResult {
    return {
      content,
      changeCount,
      warnings
    };
  }

  /**
   * 辅助方法：安全执行正则替换
   * 捕获异常并记录警告
   */
  protected safeReplace(
    content: string,
    pattern: RegExp,
    replacement: string | ((substring: string, ...args: any[]) => string),
    operationName: string = '替换操作'
  ): { content: string; count: number; error?: string } {
    try {
      let count = 0;
      const result = content.replace(pattern, (...args) => {
        count++;
        if (typeof replacement === 'function') {
          return replacement(...args);
        }
        return replacement;
      });
      
      return { content: result, count };
    } catch (error) {
      console.error(`[${this.name}] ${operationName}失败:`, error);
      return {
        content,
        count: 0,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 辅助方法：计数匹配项
   */
  protected countMatches(content: string, pattern: RegExp): number {
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  /**
   * 辅助方法：检查内容是否包含指定模式
   */
  protected containsPattern(content: string, pattern: RegExp): boolean {
    return pattern.test(content);
  }

  /**
   * 辅助方法：记录调试信息
   */
  protected debug(message: string, data?: any): void {
    console.log(`[${this.name}] ${message}`, data || '');
  }
}


