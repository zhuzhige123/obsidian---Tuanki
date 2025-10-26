/**
 * 统一日期时间处理系统
 * 解决重复的日期格式化和时间处理函数问题
 */

import { Injectable, ServiceLifetime } from '../architecture/dependency-injection';
import { ArchitectureLayer, ComponentType } from '../architecture/layered-architecture';

// ============================================================================
// 日期时间类型定义
// ============================================================================

/**
 * 日期格式类型
 */
export enum DateFormat {
  ISO_DATE = 'YYYY-MM-DD',
  ISO_DATETIME = 'YYYY-MM-DD HH:mm:ss',
  ISO_FULL = 'YYYY-MM-DDTHH:mm:ss.sssZ',
  CHINESE_DATE = 'YYYY年MM月DD日',
  CHINESE_DATETIME = 'YYYY年MM月DD日 HH:mm:ss',
  RELATIVE = 'relative',
  ANKI_TIMESTAMP = 'anki'
}

/**
 * 时区配置
 */
export interface TimezoneConfig {
  timezone: string;
  locale: string;
  use24Hour: boolean;
}

/**
 * 相对时间配置
 */
export interface RelativeTimeConfig {
  locale: string;
  numeric: 'always' | 'auto';
  style: 'long' | 'short' | 'narrow';
}

// ============================================================================
// 统一日期时间处理器
// ============================================================================

/**
 * 统一日期时间处理服务
 */
@Injectable({
  lifetime: ServiceLifetime.SINGLETON,
  layer: ArchitectureLayer.INFRASTRUCTURE,
  type: ComponentType.INFRASTRUCTURE_SERVICE
})
export class UnifiedDateTimeProcessor {
  private static instance: UnifiedDateTimeProcessor;
  
  // 默认配置
  private defaultTimezone: TimezoneConfig = {
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
    use24Hour: true
  };
  
  private defaultRelativeConfig: RelativeTimeConfig = {
    locale: 'zh-CN',
    numeric: 'auto',
    style: 'long'
  };

  static getInstance(): UnifiedDateTimeProcessor {
    if (!UnifiedDateTimeProcessor.instance) {
      UnifiedDateTimeProcessor.instance = new UnifiedDateTimeProcessor();
    }
    return UnifiedDateTimeProcessor.instance;
  }

  /**
   * 格式化日期
   */
  formatDate(
    date: string | Date | number | null | undefined,
    format: DateFormat = DateFormat.ISO_DATE,
    config?: Partial<TimezoneConfig>
  ): string {
    if (!date) return "-";
    
    const dateObj = this.normalizeDate(date);
    if (!dateObj || isNaN(dateObj.getTime())) return "-";
    
    const finalConfig = { ...this.defaultTimezone, ...config };
    
    switch (format) {
      case DateFormat.ISO_DATE:
        return this.formatISODate(dateObj);
      case DateFormat.ISO_DATETIME:
        return this.formatISODateTime(dateObj);
      case DateFormat.ISO_FULL:
        return dateObj.toISOString();
      case DateFormat.CHINESE_DATE:
        return this.formatChineseDate(dateObj);
      case DateFormat.CHINESE_DATETIME:
        return this.formatChineseDateTime(dateObj);
      case DateFormat.RELATIVE:
        return this.formatRelativeTime(dateObj);
      case DateFormat.ANKI_TIMESTAMP:
        return this.formatAnkiTimestamp(dateObj);
      default:
        return this.formatISODate(dateObj);
    }
  }

  /**
   * 格式化相对时间
   */
  formatRelativeTime(
    date: string | Date | number,
    config?: Partial<RelativeTimeConfig>
  ): string {
    const dateObj = this.normalizeDate(date);
    if (!dateObj) return "-";
    
    const finalConfig = { ...this.defaultRelativeConfig, ...config };
    
    try {
      const rtf = new Intl.RelativeTimeFormat(finalConfig.locale, {
        numeric: finalConfig.numeric,
        style: finalConfig.style
      });
      
      const now = new Date();
      const diffMs = dateObj.getTime() - now.getTime();
      
      // 计算合适的时间单位
      const absDiffMs = Math.abs(diffMs);
      
      if (absDiffMs < 60 * 1000) {
        // 小于1分钟
        return '刚刚';
      } else if (absDiffMs < 60 * 60 * 1000) {
        // 小于1小时
        const minutes = Math.round(diffMs / (60 * 1000));
        return rtf.format(minutes, 'minute');
      } else if (absDiffMs < 24 * 60 * 60 * 1000) {
        // 小于1天
        const hours = Math.round(diffMs / (60 * 60 * 1000));
        return rtf.format(hours, 'hour');
      } else if (absDiffMs < 30 * 24 * 60 * 60 * 1000) {
        // 小于30天
        const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
        return rtf.format(days, 'day');
      } else if (absDiffMs < 365 * 24 * 60 * 60 * 1000) {
        // 小于1年
        const months = Math.round(diffMs / (30 * 24 * 60 * 60 * 1000));
        return rtf.format(months, 'month');
      } else {
        // 大于1年
        const years = Math.round(diffMs / (365 * 24 * 60 * 60 * 1000));
        return rtf.format(years, 'year');
      }
    } catch (error) {
      // 降级方案
      return this.formatSimpleRelativeTime(dateObj);
    }
  }

  /**
   * 解析日期字符串
   */
  parseDate(dateString: string): Date | null {
    if (!dateString) return null;
    
    try {
      // 尝试解析ISO格式
      if (dateString.includes('T') || dateString.includes('-')) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) return date;
      }
      
      // 尝试解析时间戳
      const timestamp = parseInt(dateString, 10);
      if (!isNaN(timestamp)) {
        // Anki时间戳（秒）
        if (timestamp < 10000000000) {
          return new Date(timestamp * 1000);
        }
        // JavaScript时间戳（毫秒）
        return new Date(timestamp);
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 转换Anki时间戳
   */
  convertAnkiTimestamp(ankiTimestamp: number): Date {
    // Anki使用秒级时间戳
    return new Date(ankiTimestamp * 1000);
  }

  /**
   * 转换为Anki时间戳
   */
  toAnkiTimestamp(date: string | Date | number): number {
    const dateObj = this.normalizeDate(date);
    if (!dateObj) return 0;
    
    // 转换为秒级时间戳
    return Math.floor(dateObj.getTime() / 1000);
  }

  /**
   * 获取一天的开始时间
   */
  startOfDay(date: string | Date | number): Date {
    const dateObj = this.normalizeDate(date);
    if (!dateObj) return new Date();
    
    const result = new Date(dateObj);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  /**
   * 获取一天的结束时间
   */
  endOfDay(date: string | Date | number): Date {
    const dateObj = this.normalizeDate(date);
    if (!dateObj) return new Date();
    
    const result = new Date(dateObj);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  /**
   * 日期分桶（用于统计）
   */
  bucketDate(date: string | Date | number, bucketType: 'day' | 'week' | 'month' | 'year' = 'day'): string {
    const dateObj = this.normalizeDate(date);
    if (!dateObj) return '';
    
    switch (bucketType) {
      case 'day':
        return this.formatISODate(dateObj);
      case 'week':
        const weekStart = this.getWeekStart(dateObj);
        return this.formatISODate(weekStart);
      case 'month':
        return `${dateObj.getFullYear()}-${this.pad2(dateObj.getMonth() + 1)}`;
      case 'year':
        return dateObj.getFullYear().toString();
      default:
        return this.formatISODate(dateObj);
    }
  }

  /**
   * 计算时间差
   */
  timeDifference(
    date1: string | Date | number,
    date2: string | Date | number,
    unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' = 'milliseconds'
  ): number {
    const d1 = this.normalizeDate(date1);
    const d2 = this.normalizeDate(date2);
    
    if (!d1 || !d2) return 0;
    
    const diffMs = d1.getTime() - d2.getTime();
    
    switch (unit) {
      case 'seconds':
        return diffMs / 1000;
      case 'minutes':
        return diffMs / (1000 * 60);
      case 'hours':
        return diffMs / (1000 * 60 * 60);
      case 'days':
        return diffMs / (1000 * 60 * 60 * 24);
      default:
        return diffMs;
    }
  }

  /**
   * 私有辅助方法
   */
  private normalizeDate(date: string | Date | number | null | undefined): Date | null {
    if (!date) return null;
    
    if (date instanceof Date) {
      return isNaN(date.getTime()) ? null : date;
    }
    
    if (typeof date === 'number') {
      // 处理时间戳
      const timestamp = date < 10000000000 ? date * 1000 : date;
      return new Date(timestamp);
    }
    
    if (typeof date === 'string') {
      return this.parseDate(date);
    }
    
    return null;
  }

  private formatISODate(date: Date): string {
    return `${date.getFullYear()}-${this.pad2(date.getMonth() + 1)}-${this.pad2(date.getDate())}`;
  }

  private formatISODateTime(date: Date): string {
    return `${this.formatISODate(date)} ${this.pad2(date.getHours())}:${this.pad2(date.getMinutes())}:${this.pad2(date.getSeconds())}`;
  }

  private formatChineseDate(date: Date): string {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  private formatChineseDateTime(date: Date): string {
    return `${this.formatChineseDate(date)} ${this.pad2(date.getHours())}:${this.pad2(date.getMinutes())}:${this.pad2(date.getSeconds())}`;
  }

  private formatAnkiTimestamp(date: Date): string {
    return this.toAnkiTimestamp(date).toString();
  }

  private formatSimpleRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const absDiffMs = Math.abs(diffMs);
    
    if (absDiffMs < 60 * 1000) {
      return '刚刚';
    } else if (absDiffMs < 60 * 60 * 1000) {
      const minutes = Math.floor(absDiffMs / (60 * 1000));
      return `${minutes}分钟${diffMs > 0 ? '前' : '后'}`;
    } else if (absDiffMs < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(absDiffMs / (60 * 60 * 1000));
      return `${hours}小时${diffMs > 0 ? '前' : '后'}`;
    } else {
      const days = Math.floor(absDiffMs / (24 * 60 * 60 * 1000));
      return `${days}天${diffMs > 0 ? '前' : '后'}`;
    }
  }

  private getWeekStart(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day + (day === 0 ? -6 : 1); // 周一为一周开始
    result.setDate(diff);
    return this.startOfDay(result);
  }

  private pad2(num: number): string {
    return num.toString().padStart(2, '0');
  }

  /**
   * 设置默认时区配置
   */
  setDefaultTimezone(config: Partial<TimezoneConfig>): void {
    this.defaultTimezone = { ...this.defaultTimezone, ...config };
  }

  /**
   * 设置默认相对时间配置
   */
  setDefaultRelativeConfig(config: Partial<RelativeTimeConfig>): void {
    this.defaultRelativeConfig = { ...this.defaultRelativeConfig, ...config };
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

const dateTimeProcessor = UnifiedDateTimeProcessor.getInstance();

/**
 * 格式化日期
 */
export const formatDate = (date: string | Date | number | null, format?: DateFormat) => 
  dateTimeProcessor.formatDate(date, format);

/**
 * 格式化日期时间
 */
export const formatDateTime = (date: string | Date | number | null) => 
  dateTimeProcessor.formatDate(date, DateFormat.ISO_DATETIME);

/**
 * 格式化相对时间
 */
export const formatRelativeTime = (date: string | Date | number) => 
  dateTimeProcessor.formatRelativeTime(date);

/**
 * 格式化ISO日期
 */
export const fmtISODate = (date: Date) => 
  dateTimeProcessor.formatDate(date, DateFormat.ISO_DATE);

/**
 * 转换Anki时间戳
 */
export const convertAnkiTimestamp = (timestamp: number) => 
  dateTimeProcessor.convertAnkiTimestamp(timestamp);

/**
 * 获取一天开始时间
 */
export const startOfDay = (date: string | Date | number) => 
  dateTimeProcessor.startOfDay(date);

/**
 * 日期分桶
 */
export const bucketDate = (date: string | Date | number, bucketType?: 'day' | 'week' | 'month' | 'year') => 
  dateTimeProcessor.bucketDate(date, bucketType);

/**
 * 解析日期
 */
export const parseDate = (dateString: string) => 
  dateTimeProcessor.parseDate(dateString);

/**
 * 获取日期时间处理器实例
 */
export const getDateTimeProcessor = () => dateTimeProcessor;
