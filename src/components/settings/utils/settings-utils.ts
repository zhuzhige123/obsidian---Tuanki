/**
 * 设置界面相关的工具函数
 * 提取公共逻辑，消除代码重复
 */

import type { 
  NotificationOptions, 
  WindowWithNotice, 
  LicenseStatus, 
  LicenseInfo,
  ErrorResult,
  ActivationValidation,
  PluginExtended
} from '../types/settings-types';

import {
  NOTIFICATION_DURATION,
  LICENSE_STATUS_ICONS,
  ERROR_ICONS,
  VALIDATION_RULES
} from '../constants/settings-constants';

/**
 * 统一的通知显示函数
 */
export function showNotification(options: NotificationOptions): void {
  const { message, type = 'info', duration } = options;
  
  const Notice = (window as WindowWithNotice).Notice;
  if (!Notice) {
    console.warn('Notice constructor not available');
    return;
  }
  
  const finalDuration = duration ?? (type === 'error' ? NOTIFICATION_DURATION.ERROR : NOTIFICATION_DURATION.SUCCESS);
  new Notice(message, finalDuration);
}

/**
 * 统一的错误处理函数
 */
export function handleError(error: unknown, context: string, fallbackMessage?: string): ErrorResult {
  const message = error instanceof Error ? error.message : (fallbackMessage || '操作失败');
  const fullMessage = `${context}: ${message}`;
  
  showNotification({
    message: fullMessage,
    type: 'error'
  });
  
  return {
    success: false,
    error: fullMessage
  };
}

/**
 * 获取许可证状态信息
 */
export function getLicenseStatusInfo(license?: LicenseInfo): LicenseStatus {
  if (!license?.isActivated) {
    return { 
      status: 'inactive', 
      text: '未激活', 
      color: 'orange', 
      icon: LICENSE_STATUS_ICONS.inactive 
    };
  }

  const now = new Date();
  
  // 检查是否过期
  if (license.expiresAt) {
    const expiryDate = new Date(license.expiresAt);
    if (now > expiryDate) {
      return { 
        status: 'expired', 
        text: '已过期', 
        color: 'red', 
        icon: LICENSE_STATUS_ICONS.expired 
      };
    }
    
    // 检查是否即将过期（30天内）
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= 30) {
      return { 
        status: 'trial', 
        text: `${daysUntilExpiry}天后过期`, 
        color: 'yellow', 
        icon: LICENSE_STATUS_ICONS.trial 
      };
    }
  }

  return { 
    status: 'active', 
    text: '已激活', 
    color: 'green', 
    icon: LICENSE_STATUS_ICONS.active 
  };
}

/**
 * 获取错误类型对应的图标
 */
export function getErrorIcon(error: string): string {
  if (error.includes('格式') || error.includes('验证失败')) return ERROR_ICONS.format;
  if (error.includes('过期')) return ERROR_ICONS.expired;
  if (error.includes('设备') || error.includes('绑定')) return ERROR_ICONS.device;
  if (error.includes('网络') || error.includes('连接')) return ERROR_ICONS.network;
  if (error.includes('权限')) return ERROR_ICONS.permission;
  return ERROR_ICONS.default;
}

/**
 * 格式化激活码显示
 */
export function formatActivationCode(code: string, showFull: boolean = false): string {
  if (!code) return '';

  if (showFull) {
    // 每64个字符换行，便于阅读
    return code.match(/.{1,64}/g)?.join('\n') || code;
  } else {
    // 显示前20个字符，后面用省略号
    return code.length > 20 ? `${code.substring(0, 20)}...` : code;
  }
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * 验证激活码格式
 */
export function validateActivationCode(code: string): ActivationValidation {
  const result: ActivationValidation = {
    isValid: false,
    isComplete: false,
    warnings: [],
    errors: []
  };

  if (!code.trim()) {
    result.errors.push('激活码不能为空');
    return result;
  }

  const { MIN_LENGTH, PATTERN } = VALIDATION_RULES.ACTIVATION_CODE;

  // 检查长度
  if (code.length < MIN_LENGTH) {
    result.warnings.push(`激活码长度不足，至少需要 ${MIN_LENGTH} 个字符`);
  }

  // 检查格式
  if (!PATTERN.test(code)) {
    result.errors.push('激活码包含无效字符，只允许字母、数字、连字符和点号');
    return result;
  }

  // 基本格式正确
  result.isValid = true;

  // 检查是否完整（这里可以根据实际的激活码规则调整）
  if (code.length >= 32) { // 假设完整激活码至少32位
    result.isComplete = true;
  } else {
    result.warnings.push('激活码可能不完整，请确保复制了完整的激活码');
  }

  return result;
}

/**
 * 获取详细的错误信息和解决方案
 */
export function getDetailedErrorMessage(error: string): string {
  const errorMap: Record<string, { message: string; solution?: string }> = {
    '激活码格式无效': {
      message: '激活码格式不正确',
      solution: '请确保完整复制激活码，包括所有字符和点号分隔符'
    },
    '激活码已过期': {
      message: '激活码已过期',
      solution: '请联系客服获取新的激活码'
    },
    '设备绑定超限': {
      message: '设备绑定数量已达上限',
      solution: '请在其他设备上解绑后重试，或联系客服增加设备数量'
    },
    '网络连接失败': {
      message: '无法连接到激活服务器',
      solution: '请检查网络连接，或稍后重试'
    },
    '服务器错误': {
      message: '激活服务器暂时不可用',
      solution: '请稍后重试，如问题持续请联系客服'
    }
  };

  const errorInfo = errorMap[error];
  if (errorInfo) {
    return errorInfo.solution ? 
      `${errorInfo.message}。${errorInfo.solution}` : 
      errorInfo.message;
  }

  return error;
}

/**
 * 安全的设置更新函数
 */
export function updateSettings<T extends Record<string, any>>(
  settings: T, 
  path: string, 
  value: any
): T {
  const keys = path.split('.');
  const result = { ...settings };
  let current: any = result;

  // 创建嵌套对象路径
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    } else {
      current[key] = { ...current[key] };
    }
    current = current[key];
  }

  // 设置最终值
  current[keys[keys.length - 1]] = value;
  return result;
}

/**
 * 获取嵌套设置值
 */
export function getSettingsValue<T>(settings: any, path: string, defaultValue?: T): T {
  const keys = path.split('.');
  let current = settings;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return defaultValue as T;
    }
  }

  return current as T;
}









/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
