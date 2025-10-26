/**
 * Tuanki 标识符系统常量定义
 * 
 * 定义UUID、BlockID等标识符的格式规范和常量
 * 
 * @module services/identifier
 */

// ============================================================================
// UUID 常量
// ============================================================================

/**
 * UUID前缀
 * 用于命名空间隔离，避免与其他系统ID冲突
 */
export const UUID_PREFIX = 'tk-';

/**
 * UUID字符集（Base32，去除易混淆字符）
 * 排除了：0、O、1、l、I 等易混淆字符
 */
export const UUID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/**
 * UUID长度配置
 */
export const UUID_LENGTH = {
  /** 时间戳部分长度（Base32编码） */
  TIMESTAMP: 7,
  /** 随机数部分长度（Base32编码） */
  RANDOM: 5,
  /** 总长度（不含前缀） */
  TOTAL: 12,
  /** 完整长度（含前缀 tk-） */
  FULL: 15
} as const;

/**
 * UUID格式验证正则表达式
 */
export const UUID_REGEX = /^tk-[23456789abcdefghjkmnpqrstuvwxyz]{12}$/;

/**
 * UUID Base进制
 */
export const UUID_BASE = 32;

// ============================================================================
// BlockID 常量
// ============================================================================

/**
 * BlockID字符集（Base36，符合Obsidian原生风格）
 */
export const BLOCK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * BlockID长度（Obsidian默认）
 */
export const BLOCK_ID_LENGTH = 6;

/**
 * BlockID格式验证正则表达式
 */
export const BLOCK_ID_REGEX = /^[0-9a-z]{6}$/;

/**
 * BlockID前缀（Obsidian标准）
 */
export const BLOCK_ID_PREFIX = '^';

// ============================================================================
// 写入格式常量
// ============================================================================

/**
 * UUID写入格式
 */
export const UUID_WRITE_FORMAT = {
  /** HTML注释格式（用于批量解析） */
  HTML_COMMENT: (uuid: string) => `<!-- tuanki-uuid: ${uuid} -->`,
  
  /** YAML字段格式（用于标注块） */
  YAML_FIELD: (uuid: string) => `uuid: ${uuid}`,
  
  /** 行内代码格式（备用） */
  INLINE_CODE: (uuid: string) => `\`${uuid}\``,
} as const;

/**
 * BlockID写入格式
 */
export const BLOCK_ID_WRITE_FORMAT = {
  /** Obsidian标准格式 */
  STANDARD: (blockId: string) => `^${blockId}`,
} as const;

// ============================================================================
// ID生成配置
// ============================================================================

/**
 * 唯一性保证配置
 */
export const UNIQUENESS_CONFIG = {
  /** 最大重试次数（冲突时） */
  MAX_RETRY: 10,
  
  /** 预期冲突概率阈值 */
  COLLISION_THRESHOLD: 0.0001,  // 0.01%
  
  /** 同一毫秒内最大生成数 */
  MAX_PER_MILLISECOND: 100,
} as const;

/**
 * 时间戳配置
 */
export const TIMESTAMP_CONFIG = {
  /** 起始时间（用于压缩时间戳） */
  EPOCH_START: new Date('2025-01-01T00:00:00Z').getTime(),
  
  /** 支持的最大时间（约100年） */
  MAX_TIMESTAMP: new Date('2125-01-01T00:00:00Z').getTime(),
} as const;

// ============================================================================
// 验证配置
// ============================================================================

/**
 * ID验证严格程度
 */
export enum ValidationLevel {
  /** 宽松：仅检查基本格式 */
  LOOSE = 'loose',
  
  /** 标准：检查格式和字符集 */
  STANDARD = 'standard',
  
  /** 严格：检查格式、字符集和时间戳有效性 */
  STRICT = 'strict',
}

/**
 * 默认验证级别
 */
export const DEFAULT_VALIDATION_LEVEL = ValidationLevel.STANDARD;

// ============================================================================
// 错误消息
// ============================================================================

/**
 * ID相关错误消息
 */
export const ERROR_MESSAGES = {
  INVALID_UUID_FORMAT: 'UUID格式无效',
  INVALID_BLOCK_ID_FORMAT: 'BlockID格式无效',
  UUID_COLLISION: 'UUID冲突，已达到最大重试次数',
  BLOCK_ID_COLLISION: 'BlockID冲突',
  TIMESTAMP_OUT_OF_RANGE: '时间戳超出有效范围',
  INVALID_ALPHABET: '包含无效字符',
  GENERATION_FAILED: 'ID生成失败',
} as const;

// ============================================================================
// 导出配置对象
// ============================================================================

/**
 * 完整的ID系统配置
 */
export const ID_SYSTEM_CONFIG = {
  uuid: {
    prefix: UUID_PREFIX,
    alphabet: UUID_ALPHABET,
    length: UUID_LENGTH,
    regex: UUID_REGEX,
    base: UUID_BASE,
  },
  blockId: {
    alphabet: BLOCK_ID_ALPHABET,
    length: BLOCK_ID_LENGTH,
    regex: BLOCK_ID_REGEX,
    prefix: BLOCK_ID_PREFIX,
  },
  uniqueness: UNIQUENESS_CONFIG,
  timestamp: TIMESTAMP_CONFIG,
  validation: {
    level: DEFAULT_VALIDATION_LEVEL,
  },
  errors: ERROR_MESSAGES,
} as const;

/**
 * 类型导出：配置类型
 */
export type IDSystemConfig = typeof ID_SYSTEM_CONFIG;


