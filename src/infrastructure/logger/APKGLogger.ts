/**
 * APKG 导入日志系统
 * 
 * 提供统一的日志记录功能，支持不同级别的日志输出
 * 
 * @module infrastructure/logger
 */

import type { LogLevel, LogEntry } from '../../domain/apkg/types';

/**
 * APKG 日志器配置
 */
export interface APKGLoggerConfig {
  /** 日志级别 */
  level: LogLevel;
  /** 是否启用控制台输出 */
  enableConsole: boolean;
  /** 是否启用文件输出 */
  enableFile: boolean;
  /** 日志前缀 */
  prefix: string;
  /** 最大日志条目数 */
  maxEntries: number;
}

/**
 * 默认日志配置
 */
const DEFAULT_CONFIG: APKGLoggerConfig = {
  level: 'info',
  enableConsole: true,
  enableFile: false,
  prefix: '[APKG Import]',
  maxEntries: 1000
};

/**
 * 日志级别权重
 */
const LOG_LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * APKG 日志器
 */
export class APKGLogger {
  private config: APKGLoggerConfig;
  private entries: LogEntry[] = [];

  constructor(config?: Partial<APKGLoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 记录 debug 级别日志
   */
  debug(message: string, data?: unknown, source?: string): void {
    this.log('debug', message, data, source);
  }

  /**
   * 记录 info 级别日志
   */
  info(message: string, data?: unknown, source?: string): void {
    this.log('info', message, data, source);
  }

  /**
   * 记录 warn 级别日志
   */
  warn(message: string, data?: unknown, source?: string): void {
    this.log('warn', message, data, source);
  }

  /**
   * 记录 error 级别日志
   */
  error(message: string, error?: unknown, source?: string): void {
    this.log('error', message, error, source);
  }

  /**
   * 核心日志方法
   */
  private log(level: LogLevel, message: string, data?: unknown, source?: string): void {
    // 检查日志级别
    if (!this.shouldLog(level)) {
      return;
    }

    // 创建日志条目
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
      source: source || this.config.prefix
    };

    // 添加到历史记录
    this.entries.push(entry);
    
    // 限制历史记录数量
    if (this.entries.length > this.config.maxEntries) {
      this.entries.shift();
    }

    // 控制台输出
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    // 文件输出（暂不实现，预留接口）
    if (this.config.enableFile) {
      this.outputToFile(entry);
    }
  }

  /**
   * 检查是否应该记录该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_WEIGHTS[level] >= LOG_LEVEL_WEIGHTS[this.config.level];
  }

  /**
   * 输出到控制台
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = entry.source || this.config.prefix;
    const message = `${timestamp} ${prefix} [${entry.level.toUpperCase()}] ${entry.message}`;

    switch (entry.level) {
      case 'debug':
        console.debug(message, entry.data || '');
        break;
      case 'info':
        console.log(message, entry.data || '');
        break;
      case 'warn':
        console.warn(message, entry.data || '');
        break;
      case 'error':
        console.error(message, entry.data || '');
        if (entry.data instanceof Error) {
          console.error('Stack:', entry.data.stack);
        }
        break;
    }
  }

  /**
   * 输出到文件（预留）
   */
  private outputToFile(entry: LogEntry): void {
    // TODO: 实现文件输出
    // 可以使用 Obsidian 的 Vault API 写入日志文件
  }

  /**
   * 获取所有日志条目
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * 获取特定级别的日志
   */
  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter(e => e.level === level);
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * 导出日志为文本
   */
  exportAsText(): string {
    return this.entries.map(entry => {
      const timestamp = new Date(entry.timestamp).toISOString();
      const dataStr = entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : '';
      return `${timestamp} [${entry.level.toUpperCase()}] ${entry.message}${dataStr}`;
    }).join('\n');
  }

  /**
   * 导出日志为JSON
   */
  exportAsJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * 创建子日志器（带特定来源标识）
   */
  createChild(source: string): ChildLogger {
    return new ChildLogger(this, source);
  }
}

/**
 * 子日志器（用于特定模块）
 */
class ChildLogger {
  constructor(
    private parent: APKGLogger,
    private source: string
  ) {}

  debug(message: string, data?: unknown): void {
    this.parent.debug(message, data, this.source);
  }

  info(message: string, data?: unknown): void {
    this.parent.info(message, data, this.source);
  }

  warn(message: string, data?: unknown): void {
    this.parent.warn(message, data, this.source);
  }

  error(message: string, error?: unknown): void {
    this.parent.error(message, error, this.source);
  }
}

/**
 * 全局日志器实例
 */
export const globalAPKGLogger = new APKGLogger({
  level: 'info',
  enableConsole: true,
  prefix: '[APKG]'
});




