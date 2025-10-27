/**
 * Tuanki ID生成器
 * 
 * 负责生成卡片UUID和Obsidian BlockID
 * 
 * UUID格式：tk-{7位时间戳}{5位随机} (总长15位)
 * BlockID格式：{6位随机} (符合Obsidian原生风格)
 * 
 * @module services/identifier
 */

import {
  UUID_PREFIX,
  UUID_ALPHABET,
  UUID_LENGTH,
  UUID_REGEX,
  UUID_BASE,
  BLOCK_ID_ALPHABET,
  BLOCK_ID_LENGTH,
  BLOCK_ID_REGEX,
  UNIQUENESS_CONFIG,
  ERROR_MESSAGES,
} from './constants';

import type {
  UUIDValidationResult,
  BlockIDValidationResult,
} from './types';

/**
 * Tuanki ID生成器类
 * 单例模式，确保全局唯一实例
 */
export class TuankiIDGenerator {
  private static instance: TuankiIDGenerator;
  
  // 冲突检测计数器（用于生成唯一ID）
  private uuidCollisionCount = 0;
  private blockIdCollisionCount = 0;
  
  // 最后生成的时间戳（毫秒）
  private lastTimestamp = 0;
  
  // 同一毫秒内的生成计数
  private sameMillisecondCount = 0;

  /**
   * 私有构造函数（单例模式）
   */
  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): TuankiIDGenerator {
    if (!TuankiIDGenerator.instance) {
      TuankiIDGenerator.instance = new TuankiIDGenerator();
    }
    return TuankiIDGenerator.instance;
  }

  // ============================================================================
  // UUID生成
  // ============================================================================

  /**
   * 生成卡片UUID
   * 
   * 格式：tk-{7位时间戳}{5位随机}
   * 示例：tk-xm8k3p2a7b9h
   * 
   * @returns 新生成的UUID字符串
   */
  generateCardUUID(): string {
    // 获取当前时间戳
    const now = Date.now();
    
    // 检查是否在同一毫秒内
    if (now === this.lastTimestamp) {
      this.sameMillisecondCount++;
      
      // 防止同一毫秒内生成过多ID
      if (this.sameMillisecondCount >= UNIQUENESS_CONFIG.MAX_PER_MILLISECOND) {
        // 等待下一毫秒
        while (Date.now() === this.lastTimestamp) {
          // 自旋等待
        }
        this.sameMillisecondCount = 0;
      }
    } else {
      this.lastTimestamp = now;
      this.sameMillisecondCount = 0;
    }
    
    // 1. 生成时间戳部分（7位base32）
    const timeStr = this.encodeTimestamp(now);
    
    // 2. 生成随机部分（5位base32）
    const randomStr = this.generateRandomString(UUID_LENGTH.RANDOM, UUID_ALPHABET);
    
    // 3. 组合成完整UUID
    return `${UUID_PREFIX}${timeStr}${randomStr}`;
  }

  /**
   * 将时间戳编码为Base32字符串
   * @param timestamp 毫秒时间戳
   * @returns 7位Base32字符串
   */
  private encodeTimestamp(timestamp: number): string {
    let result = '';
    let value = timestamp;
    
    // 转换为Base32（7位）
    for (let i = 0; i < UUID_LENGTH.TIMESTAMP; i++) {
      const index = value % UUID_BASE;
      result = UUID_ALPHABET[index] + result;
      value = Math.floor(value / UUID_BASE);
    }
    
    return result;
  }

  /**
   * 从UUID提取时间戳
   * @param uuid UUID字符串
   * @returns 毫秒时间戳，如果提取失败返回0
   */
  extractTimestamp(uuid: string): number {
    if (!this.isValidUUID(uuid)) {
      return 0;
    }
    
    // 去掉前缀，取前7位
    const timeStr = uuid.replace(UUID_PREFIX, '').substring(0, UUID_LENGTH.TIMESTAMP);
    
    let timestamp = 0;
    for (let i = 0; i < timeStr.length; i++) {
      const charIndex = UUID_ALPHABET.indexOf(timeStr[i]);
      if (charIndex === -1) {
        return 0; // 无效字符
      }
      timestamp = timestamp * UUID_BASE + charIndex;
    }
    
    return timestamp;
  }

  /**
   * 验证UUID格式
   * @param uuid UUID字符串
   * @returns 是否有效
   */
  isValidUUID(uuid: string): boolean {
    return UUID_REGEX.test(uuid);
  }

  /**
   * 详细验证UUID
   * @param uuid UUID字符串
   * @returns 详细验证结果
   */
  validateUUID(uuid: string): UUIDValidationResult {
    const result: UUIDValidationResult = {
      isValid: false,
      formatValid: false,
      alphabetValid: false,
    };

    // 1. 检查基本格式
    result.formatValid = UUID_REGEX.test(uuid);
    if (!result.formatValid) {
      result.error = ERROR_MESSAGES.INVALID_UUID_FORMAT;
      return result;
    }

    // 2. 检查字符集
    const content = uuid.replace(UUID_PREFIX, '');
    result.alphabetValid = [...content].every(char => UUID_ALPHABET.includes(char));
    if (!result.alphabetValid) {
      result.error = ERROR_MESSAGES.INVALID_ALPHABET;
      return result;
    }

    // 3. 提取并验证时间戳
    const timestamp = this.extractTimestamp(uuid);
    result.timestamp = timestamp;
    result.timestampValid = timestamp > 0 && timestamp < Date.now() + 86400000; // 未来24小时内

    // 全部通过
    result.isValid = true;
    return result;
  }

  // ============================================================================
  // BlockID生成
  // ============================================================================

  /**
   * 生成Obsidian风格的BlockID
   * 
   * 格式：6位base36随机字符
   * 示例：3ka8m2
   * 
   * @returns 新生成的BlockID字符串（不含^前缀）
   */
  generateBlockID(): string {
    return this.generateRandomString(BLOCK_ID_LENGTH, BLOCK_ID_ALPHABET);
  }

  /**
   * 验证BlockID格式
   * @param blockId BlockID字符串（不含^前缀）
   * @returns 是否有效
   */
  isValidBlockID(blockId: string): boolean {
    return BLOCK_ID_REGEX.test(blockId);
  }

  /**
   * 详细验证BlockID
   * @param blockId BlockID字符串
   * @returns 详细验证结果
   */
  validateBlockID(blockId: string): BlockIDValidationResult {
    const result: BlockIDValidationResult = {
      isValid: false,
      formatValid: false,
      alphabetValid: false,
    };

    // 1. 检查基本格式
    result.formatValid = BLOCK_ID_REGEX.test(blockId);
    if (!result.formatValid) {
      result.error = ERROR_MESSAGES.INVALID_BLOCK_ID_FORMAT;
      return result;
    }

    // 2. 检查字符集
    result.alphabetValid = [...blockId].every(char => BLOCK_ID_ALPHABET.includes(char));
    if (!result.alphabetValid) {
      result.error = ERROR_MESSAGES.INVALID_ALPHABET;
      return result;
    }

    // 全部通过
    result.isValid = true;
    return result;
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 生成指定长度的随机字符串
   * @param length 长度
   * @param alphabet 字符集
   * @returns 随机字符串
   */
  private generateRandomString(length: number, alphabet: string): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * alphabet.length);
      result += alphabet[randomIndex];
    }
    return result;
  }

  /**
   * 批量生成UUID
   * @param count 数量
   * @returns UUID数组
   */
  generateBatchUUIDs(count: number): string[] {
    const uuids: string[] = [];
    for (let i = 0; i < count; i++) {
      uuids.push(this.generateCardUUID());
    }
    return uuids;
  }

  /**
   * 批量生成BlockID
   * @param count 数量
   * @returns BlockID数组
   */
  generateBatchBlockIDs(count: number): string[] {
    const blockIds: string[] = [];
    for (let i = 0; i < count; i++) {
      blockIds.push(this.generateBlockID());
    }
    return blockIds;
  }

  /**
   * 重置计数器（用于测试）
   */
  resetCounters(): void {
    this.uuidCollisionCount = 0;
    this.blockIdCollisionCount = 0;
    this.lastTimestamp = 0;
    this.sameMillisecondCount = 0;
  }

  /**
   * 获取统计信息（用于调试）
   */
  getStatistics(): {
    uuidCollisions: number;
    blockIdCollisions: number;
    lastTimestamp: number;
    sameMillisecondCount: number;
  } {
    return {
      uuidCollisions: this.uuidCollisionCount,
      blockIdCollisions: this.blockIdCollisionCount,
      lastTimestamp: this.lastTimestamp,
      sameMillisecondCount: this.sameMillisecondCount,
    };
  }
}

// ============================================================================
// 便捷函数导出
// ============================================================================

const generator = TuankiIDGenerator.getInstance();

/**
 * 生成卡片UUID（便捷函数）
 */
export const generateCardUUID = () => generator.generateCardUUID();

/**
 * 生成BlockID（便捷函数）
 */
export const generateBlockID = () => generator.generateBlockID();

/**
 * 验证UUID（便捷函数）
 */
export const isValidUUID = (uuid: string) => generator.isValidUUID(uuid);

/**
 * 验证BlockID（便捷函数）
 */
export const isValidBlockID = (blockId: string) => generator.isValidBlockID(blockId);

/**
 * 提取时间戳（便捷函数）
 */
export const extractTimestamp = (uuid: string) => generator.extractTimestamp(uuid);

/**
 * 获取生成器实例（便捷函数）
 */
export const getIDGenerator = () => generator;


