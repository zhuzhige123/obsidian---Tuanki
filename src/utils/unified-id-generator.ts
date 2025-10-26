/**
 * 统一ID生成系统
 * 解决重复的ID生成函数问题，提供统一的ID生成服务
 */

import { Injectable, ServiceLifetime } from '../architecture/dependency-injection';
import { ArchitectureLayer, ComponentType } from '../architecture/layered-architecture';

// ============================================================================
// ID类型定义
// ============================================================================

/**
 * ID类型枚举
 */
export enum IDType {
  // 通用ID
  GENERIC = 'generic',
  UUID = 'uuid',
  
  // 业务ID
  CARD = 'card',
  DECK = 'deck',
  TEMPLATE = 'template',
  SESSION = 'session',
  
  // UI相关ID
  COMPONENT = 'component',
  MODAL = 'modal',
  NOTIFICATION = 'notification',
  
  // 系统ID
  BLOCK = 'block',
  CACHE_KEY = 'cache_key',
  ERROR = 'error'
}

/**
 * ID生成配置
 */
export interface IDGenerationConfig {
  type: IDType;
  prefix?: string;
  length?: number;
  includeTimestamp?: boolean;
  format?: 'base36' | 'base62' | 'hex' | 'uuid';
  separator?: string;
}

/**
 * ID生成结果
 */
export interface IDGenerationResult {
  id: string;
  type: IDType;
  timestamp: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// 统一ID生成器
// ============================================================================

/**
 * 统一ID生成器服务
 */
@Injectable({
  lifetime: ServiceLifetime.SINGLETON,
  layer: ArchitectureLayer.INFRASTRUCTURE,
  type: ComponentType.INFRASTRUCTURE_SERVICE
})
export class UnifiedIDGenerator {
  private static instance: UnifiedIDGenerator;
  
  // 字符集定义
  private readonly BASE36_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
  private readonly BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  private readonly HEX_CHARS = '0123456789abcdef';
  
  // 默认配置
  private readonly DEFAULT_CONFIGS: Record<IDType, IDGenerationConfig> = {
    [IDType.GENERIC]: {
      type: IDType.GENERIC,
      length: 12,
      format: 'base36',
      includeTimestamp: true
    },
    [IDType.UUID]: {
      type: IDType.UUID,
      format: 'uuid'
    },
    [IDType.CARD]: {
      type: IDType.CARD,
      prefix: 'card',
      length: 16,
      format: 'base36',
      includeTimestamp: true,
      separator: '-'
    },
    [IDType.DECK]: {
      type: IDType.DECK,
      prefix: 'deck',
      length: 12,
      format: 'base36',
      includeTimestamp: true,
      separator: '-'
    },
    [IDType.TEMPLATE]: {
      type: IDType.TEMPLATE,
      prefix: 'tpl',
      length: 10,
      format: 'base36',
      includeTimestamp: false,
      separator: '-'
    },
    [IDType.SESSION]: {
      type: IDType.SESSION,
      prefix: 'session',
      length: 12,
      format: 'base36',
      includeTimestamp: true,
      separator: '-'
    },
    [IDType.COMPONENT]: {
      type: IDType.COMPONENT,
      prefix: 'cmp',
      length: 8,
      format: 'base62',
      includeTimestamp: false,
      separator: '-'
    },
    [IDType.MODAL]: {
      type: IDType.MODAL,
      prefix: 'modal',
      length: 8,
      format: 'base36',
      includeTimestamp: false,
      separator: '-'
    },
    [IDType.NOTIFICATION]: {
      type: IDType.NOTIFICATION,
      prefix: 'notif',
      length: 10,
      format: 'base36',
      includeTimestamp: true,
      separator: '-'
    },
    [IDType.BLOCK]: {
      type: IDType.BLOCK,
      length: 12,
      format: 'base36',
      includeTimestamp: true
    },
    [IDType.CACHE_KEY]: {
      type: IDType.CACHE_KEY,
      length: 16,
      format: 'base62',
      includeTimestamp: false,
      separator: '_'
    },
    [IDType.ERROR]: {
      type: IDType.ERROR,
      prefix: 'err',
      length: 12,
      format: 'base36',
      includeTimestamp: true,
      separator: '-'
    }
  };

  static getInstance(): UnifiedIDGenerator {
    if (!UnifiedIDGenerator.instance) {
      UnifiedIDGenerator.instance = new UnifiedIDGenerator();
    }
    return UnifiedIDGenerator.instance;
  }

  /**
   * 生成指定类型的ID
   */
  generate(type: IDType, customConfig?: Partial<IDGenerationConfig>): string {
    const config = { ...this.DEFAULT_CONFIGS[type], ...customConfig };
    return this.generateWithConfig(config).id;
  }

  /**
   * 生成带详细信息的ID
   */
  generateWithDetails(type: IDType, customConfig?: Partial<IDGenerationConfig>): IDGenerationResult {
    const config = { ...this.DEFAULT_CONFIGS[type], ...customConfig };
    return this.generateWithConfig(config);
  }

  /**
   * 根据配置生成ID
   */
  private generateWithConfig(config: IDGenerationConfig): IDGenerationResult {
    const timestamp = Date.now();
    let id: string;

    switch (config.format) {
      case 'uuid':
        id = this.generateUUID();
        break;
      case 'hex':
        id = this.generateRandomString(config.length || 12, this.HEX_CHARS);
        break;
      case 'base62':
        id = this.generateRandomString(config.length || 12, this.BASE62_CHARS);
        break;
      case 'base36':
      default:
        id = this.generateBase36ID(config);
        break;
    }

    // 添加前缀
    if (config.prefix) {
      const separator = config.separator || '';
      id = `${config.prefix}${separator}${id}`;
    }

    return {
      id,
      type: config.type,
      timestamp,
      metadata: {
        format: config.format,
        length: config.length,
        hasPrefix: !!config.prefix,
        hasTimestamp: config.includeTimestamp
      }
    };
  }

  /**
   * 生成Base36格式ID
   */
  private generateBase36ID(config: IDGenerationConfig): string {
    let id = '';

    if (config.includeTimestamp) {
      // 时间戳部分（Base36编码）
      const timestampPart = Date.now().toString(36);
      id += timestampPart;
    }

    // 随机部分
    const randomLength = (config.length || 12) - (config.includeTimestamp ? 0 : 0);
    const randomPart = this.generateRandomString(randomLength, this.BASE36_CHARS);
    id += randomPart;

    return id;
  }

  /**
   * 生成UUID v4（兼容旧代码，但推荐使用TuankiIDGenerator）
   * @deprecated 请使用 TuankiIDGenerator.generateCardUUID() 生成新格式UUID
   */
  private generateUUID(): string {
    // 为了向后兼容，保留标准UUID v4生成
    // 但新代码应该使用TuankiIDGenerator
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // 降级方案：手动生成UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 生成指定字符集的随机字符串
   */
  private generateRandomString(length: number, charset: string): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }

  /**
   * 验证ID格式
   */
  validateID(id: string, type: IDType): boolean {
    const config = this.DEFAULT_CONFIGS[type];
    
    // 检查前缀
    if (config.prefix) {
      const separator = config.separator || '';
      const expectedPrefix = `${config.prefix}${separator}`;
      if (!id.startsWith(expectedPrefix)) {
        return false;
      }
    }

    // 检查UUID格式
    if (config.format === 'uuid') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuidRegex.test(id);
    }

    return true; // 其他格式的简单验证
  }

  /**
   * 解析ID信息
   */
  parseID(id: string, type: IDType): IDParseResult {
    const config = this.DEFAULT_CONFIGS[type];
    const result: IDParseResult = {
      id,
      type,
      isValid: this.validateID(id, type),
      hasPrefix: false,
      hasTimestamp: false
    };

    // 解析前缀
    if (config.prefix) {
      const separator = config.separator || '';
      const expectedPrefix = `${config.prefix}${separator}`;
      if (id.startsWith(expectedPrefix)) {
        result.hasPrefix = true;
        result.prefix = config.prefix;
        result.content = id.substring(expectedPrefix.length);
      }
    } else {
      result.content = id;
    }

    // 解析时间戳（仅对Base36格式）
    if (config.format === 'base36' && config.includeTimestamp && result.content) {
      try {
        // 尝试解析时间戳部分
        const timestampLength = Date.now().toString(36).length;
        const timestampPart = result.content.substring(0, timestampLength);
        const timestamp = parseInt(timestampPart, 36);
        
        if (!isNaN(timestamp) && timestamp > 0) {
          result.hasTimestamp = true;
          result.timestamp = timestamp;
          result.createdAt = new Date(timestamp);
        }
      } catch (error) {
        // 解析失败，忽略
      }
    }

    return result;
  }

  /**
   * 批量生成ID
   */
  generateBatch(type: IDType, count: number, customConfig?: Partial<IDGenerationConfig>): string[] {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(this.generate(type, customConfig));
    }
    return ids;
  }

  /**
   * 生成缓存键
   */
  generateCacheKey(namespace: string, ...parts: string[]): string {
    const keyParts = [namespace, ...parts].filter(Boolean);
    const content = keyParts.join('_');
    return this.generate(IDType.CACHE_KEY, { prefix: content });
  }
}

// ============================================================================
// 类型定义
// ============================================================================

export interface IDParseResult {
  id: string;
  type: IDType;
  isValid: boolean;
  hasPrefix: boolean;
  hasTimestamp: boolean;
  prefix?: string;
  content?: string;
  timestamp?: number;
  createdAt?: Date;
}

// ============================================================================
// 便捷函数
// ============================================================================

const idGenerator = UnifiedIDGenerator.getInstance();

/**
 * 生成通用ID
 */
export const generateID = (type: IDType = IDType.GENERIC, config?: Partial<IDGenerationConfig>) => 
  idGenerator.generate(type, config);

/**
 * 生成UUID
 */
export const generateUUID = () => idGenerator.generate(IDType.UUID);

/**
 * 生成卡片ID
 */
export const generateCardID = () => idGenerator.generate(IDType.CARD);

/**
 * 生成牌组ID
 */
export const generateDeckID = () => idGenerator.generate(IDType.DECK);

/**
 * 生成模板ID
 */
export const generateTemplateID = () => idGenerator.generate(IDType.TEMPLATE);

/**
 * 生成会话ID
 */
export const generateSessionID = () => idGenerator.generate(IDType.SESSION);

/**
 * 生成组件ID
 */
export const generateComponentID = (prefix?: string) => 
  idGenerator.generate(IDType.COMPONENT, { prefix });

/**
 * 生成通知ID
 */
export const generateNotificationID = () => idGenerator.generate(IDType.NOTIFICATION);

/**
 * 生成错误ID
 */
export const generateErrorID = () => idGenerator.generate(IDType.ERROR);

/**
 * 生成块ID（Obsidian）
 */
export const generateBlockID = () => idGenerator.generate(IDType.BLOCK);

/**
 * 生成缓存键
 */
export const generateCacheKey = (namespace: string, ...parts: string[]) => 
  idGenerator.generateCacheKey(namespace, ...parts);

/**
 * 验证ID
 */
export const validateID = (id: string, type: IDType) => idGenerator.validateID(id, type);

/**
 * 解析ID
 */
export const parseID = (id: string, type: IDType) => idGenerator.parseID(id, type);

/**
 * 获取ID生成器实例
 */
export const getIDGenerator = () => idGenerator;
