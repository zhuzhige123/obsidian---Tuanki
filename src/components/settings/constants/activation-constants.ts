/**
 * 激活码功能统一常量配置
 * 消除硬编码，提供统一的配置管理
 */

import { ActivationErrorCode } from '../../../utils/types/license-types';

// ==================== 激活码格式规则 ====================

/**
 * 激活码格式配置
 */
export const ACTIVATION_CODE_FORMAT = {
  // 长度限制
  MIN_LENGTH: 200,
  MAX_LENGTH: 2000,
  OPTIMAL_LENGTH_RANGE: [500, 800] as const,
  
  // 结构要求
  EXPECTED_PARTS: 2,
  SEPARATOR: '.',
  
  // 字符模式
  BASE64_PATTERN: /^[A-Za-z0-9+/=]+$/,
  FULL_PATTERN: /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/,
  WHITESPACE_PATTERN: /\s+/g,
  
  // 验证阈值
  MIN_DATA_PART_LENGTH: 100,
  MIN_SIGNATURE_PART_LENGTH: 50
} as const;

/**
 * 激活码UI配置
 */
export const ACTIVATION_CODE_UI = {
  // 输入框配置
  INPUT: {
    PLACEHOLDER: '请粘贴完整的激活码（约500-800字符）',
    TEXTAREA_ROWS: 4,
    TEXTAREA_COLS: 60,
    MAX_LENGTH_ATTR: 2500, // 允许稍微超出以便用户粘贴
    AUTO_TRIM: true,
    AUTO_RESIZE: true
  },
  
  // 显示配置
  DISPLAY: {
    MAX_LENGTH: 64,
    TRUNCATE_SUFFIX: '...',
    PREVIEW_LENGTH: 20,
    MASKED_CHAR: '*',
    SHOW_LENGTH_HINT: true
  },
  
  // 验证反馈
  FEEDBACK: {
    SHOW_REAL_TIME: true,
    DEBOUNCE_MS: 300,
    SHOW_CHARACTER_COUNT: true,
    SHOW_FORMAT_HINTS: true
  }
} as const;

// ==================== 验证规则配置 ====================

/**
 * 激活码验证规则
 */
export const ACTIVATION_CODE_VALIDATION = {
  // 必需字段
  REQUIRED_FIELDS: [
    'userId',
    'productId', 
    'licenseType',
    'expiresAt',
    'maxDevices',
    'features',
    'issuedAt'
  ] as const,
  
  // 支持的值
  SUPPORTED_LICENSE_TYPES: ['lifetime', 'subscription'] as const,
  SUPPORTED_PRODUCTS: ['tuanki-obsidian-plugin'] as const,
  
  // 时间验证
  TIME_VALIDATION: {
    MAX_FUTURE_DAYS: 365 * 10, // 最多10年后过期
    MIN_ISSUE_AGE_MS: 0, // 发行时间不能是未来
    MAX_ACTIVATION_DELAY_DAYS: 365 * 2 // 激活码有效期最多2年
  },
  
  // 设备限制
  DEVICE_LIMITS: {
    MIN_DEVICES: 1,
    MAX_DEVICES: 10,
    DEFAULT_DEVICES: 1
  }
} as const;

// ==================== 错误消息配置 ====================

/**
 * 激活码错误消息映射
 */
export const ACTIVATION_ERROR_MESSAGES: Record<ActivationErrorCode, {
  title: string;
  message: string;
  details?: string;
  suggestedAction: string;
  recoverable: boolean;
}> = {
  [ActivationErrorCode.INVALID_FORMAT]: {
    title: '激活码格式错误',
    message: '激活码格式不正确，请检查是否完整复制',
    details: '激活码应为两部分用点号分隔的Base64编码字符串',
    suggestedAction: '请重新复制完整的激活码，确保包含所有字符',
    recoverable: true
  },
  
  [ActivationErrorCode.INCOMPLETE_DATA]: {
    title: '激活码数据不完整',
    message: '激活码包含的数据不完整或损坏',
    details: '激活码中缺少必要的许可证信息',
    suggestedAction: '请联系客服获取新的激活码',
    recoverable: false
  },
  
  [ActivationErrorCode.SIGNATURE_VERIFICATION_FAILED]: {
    title: '激活码验证失败',
    message: '激活码签名验证失败，可能已被篡改',
    details: 'RSA数字签名验证不通过',
    suggestedAction: '请确保激活码来源可靠，如有疑问请联系客服',
    recoverable: false
  },
  
  [ActivationErrorCode.EXPIRED_CODE]: {
    title: '激活码已过期',
    message: '此激活码已过期，无法继续使用',
    suggestedAction: '请联系客服获取新的激活码或续费',
    recoverable: false
  },
  
  [ActivationErrorCode.PRODUCT_ID_MISMATCH]: {
    title: '产品不匹配',
    message: '此激活码不适用于当前产品',
    details: '激活码产品ID与当前插件不匹配',
    suggestedAction: '请确认激活码是否为Tuanki插件专用',
    recoverable: false
  },
  
  [ActivationErrorCode.DEVICE_FINGERPRINT_MISMATCH]: {
    title: '设备验证失败',
    message: '设备指纹不匹配，许可证可能已绑定到其他设备',
    details: '当前设备与激活时的设备特征差异过大',
    suggestedAction: '如更换了设备，请联系客服进行设备迁移',
    recoverable: false
  },
  
  [ActivationErrorCode.ATTEMPT_LIMIT_EXCEEDED]: {
    title: '尝试次数过多',
    message: '激活尝试次数过多，已被暂时锁定',
    suggestedAction: '请等待15分钟后重试，或联系客服寻求帮助',
    recoverable: true
  },
  
  [ActivationErrorCode.CRYPTO_ERROR]: {
    title: '加密验证错误',
    message: '激活码加密验证过程中发生错误',
    details: '可能是浏览器不支持所需的加密算法',
    suggestedAction: '请尝试更新浏览器或联系技术支持',
    recoverable: true
  },
  
  [ActivationErrorCode.STORAGE_ERROR]: {
    title: '存储错误',
    message: '无法保存激活信息到本地存储',
    details: '可能是存储空间不足或权限问题',
    suggestedAction: '请检查存储空间并重试',
    recoverable: true
  },
  
  [ActivationErrorCode.UNKNOWN_ERROR]: {
    title: '未知错误',
    message: '激活过程中发生未知错误',
    suggestedAction: '请重试，如问题持续请联系技术支持',
    recoverable: true
  },
  
  // 其他错误类型的默认处理
  [ActivationErrorCode.MALFORMED_STRUCTURE]: {
    title: '激活码结构错误',
    message: '激活码内部结构异常',
    suggestedAction: '请重新获取激活码',
    recoverable: false
  },
  
  [ActivationErrorCode.UNSUPPORTED_VERSION]: {
    title: '版本不支持',
    message: '激活码版本与当前插件不兼容',
    suggestedAction: '请更新插件或联系客服',
    recoverable: false
  },
  
  [ActivationErrorCode.DEVICE_LIMIT_EXCEEDED]: {
    title: '设备数量超限',
    message: '已达到许可证允许的最大设备数量',
    suggestedAction: '请在其他设备上解绑后重试',
    recoverable: false
  },
  
  [ActivationErrorCode.RATE_LIMIT_EXCEEDED]: {
    title: '操作过于频繁',
    message: '操作过于频繁，请稍后重试',
    suggestedAction: '请等待一段时间后重试',
    recoverable: true
  },
  
  [ActivationErrorCode.NETWORK_ERROR]: {
    title: '网络错误',
    message: '网络连接异常',
    suggestedAction: '请检查网络连接后重试',
    recoverable: true
  }
};

// ==================== 成功消息配置 ====================

/**
 * 激活成功消息配置
 */
export const ACTIVATION_SUCCESS_MESSAGES = {
  ACTIVATION_SUCCESS: {
    title: '激活成功！',
    message: '许可证已成功激活，高级功能已启用',
    duration: 5000
  },
  
  REACTIVATION_SUCCESS: {
    title: '重新激活成功！',
    message: '许可证已重新激活，功能已恢复',
    duration: 5000
  },
  
  LICENSE_RENEWED: {
    title: '许可证已续期！',
    message: '许可证有效期已延长',
    duration: 5000
  }
} as const;

// ==================== 警告消息配置 ====================

/**
 * 激活警告消息配置
 */
export const ACTIVATION_WARNING_MESSAGES = {
  EXPIRY_WARNING: (days: number) => ({
    title: '许可证即将过期',
    message: `您的许可证将在${days}天后过期`,
    suggestedAction: '请及时续费以避免功能中断'
  }),
  
  DEVICE_CHANGE_WARNING: {
    title: '检测到设备环境变化',
    message: '系统检测到您的设备环境发生了变化',
    suggestedAction: '如果这是预期的变化，请忽略此警告'
  },
  
  VERSION_MISMATCH_WARNING: (licenseVersion: string, currentVersion: string) => ({
    title: '版本不匹配',
    message: `许可证版本(${licenseVersion})与当前版本(${currentVersion})不匹配`,
    suggestedAction: '建议更新到匹配的版本以获得最佳体验'
  })
} as const;

// ==================== 帮助文本配置 ====================

/**
 * 激活码帮助文本
 */
export const ACTIVATION_HELP_TEXT = {
  FORMAT_HELP: '激活码是一个长字符串，通常包含500-800个字符，由两部分组成并用点号分隔',

  INPUT_TIPS: [
    '请完整复制激活码，包括所有字符',
    '激活码区分大小写，请确保准确输入',
    '如果激活码很长，建议使用粘贴功能',
    '激活码只能在授权设备上使用'
  ],

  TROUBLESHOOTING: [
    '如果提示格式错误，请检查是否完整复制了激活码',
    '如果提示已过期，请联系客服获取新的激活码',
    '如果提示设备不匹配，可能需要进行设备迁移',
    '如果多次尝试失败，请等待15分钟后重试'
  ],

  CONTACT_INFO: {
    email: 'tutaoyuan8@outlook.com',
    subject: 'Tuanki插件激活问题咨询',
    github: 'https://github.com/zhuzhige123/obsidian---Tuanki',
    purchase: 'https://pay.ldxp.cn/item/ned9pw'
  }
} as const;

// ==================== 工具函数 ====================

/**
 * 获取错误消息
 */
export function getActivationErrorMessage(code: ActivationErrorCode): typeof ACTIVATION_ERROR_MESSAGES[ActivationErrorCode] {
  return ACTIVATION_ERROR_MESSAGES[code] || ACTIVATION_ERROR_MESSAGES[ActivationErrorCode.UNKNOWN_ERROR];
}

/**
 * 检查激活码长度是否在合理范围内
 */
export function isActivationCodeLengthValid(code: string): boolean {
  const length = code.trim().length;
  return length >= ACTIVATION_CODE_FORMAT.MIN_LENGTH && length <= ACTIVATION_CODE_FORMAT.MAX_LENGTH;
}

/**
 * 检查激活码格式是否正确
 */
export function isActivationCodeFormatValid(code: string): boolean {
  return ACTIVATION_CODE_FORMAT.FULL_PATTERN.test(code.trim());
}

/**
 * 清理激活码输入
 */
export function cleanActivationCodeInput(input: string): string {
  return input.replace(ACTIVATION_CODE_FORMAT.WHITESPACE_PATTERN, '').trim();
}
