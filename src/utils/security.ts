/**
 * 安全工具函数 - 防止XSS攻击和其他安全漏洞
 */

/**
 * HTML转义函数 - 防止XSS攻击
 */
export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return String(unsafe || '');
  }
  
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\//g, "&#x2F;");
}

/**
 * 安全的HTML内容渲染 - 只允许基本的格式化标签
 */
export function sanitizeHtmlContent(content: string): string {
  const escaped = escapeHtml(content);
  
  // 只允许基本的格式化，将转义后的标签还原为安全的HTML
  return escaped
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;strong&gt;(.*?)&lt;\/strong&gt;/gi, '<strong>$1</strong>')
    .replace(/&lt;em&gt;(.*?)&lt;\/em&gt;/gi, '<em>$1</em>')
    .replace(/&lt;code&gt;(.*?)&lt;\/code&gt;/gi, '<code>$1</code>');
}

/**
 * 文件验证配置
 */
export interface FileValidationConfig {
  maxSize: number;
  allowedTypes: string[];
  allowedExtensions: string[];
}

/**
 * 默认文件验证配置
 */
export const DEFAULT_FILE_CONFIG: FileValidationConfig = {
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
};

/**
 * 文件验证结果
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedName?: string;
}

/**
 * 严格的文件验证函数
 */
export function validateFile(file: File, config: FileValidationConfig = DEFAULT_FILE_CONFIG): FileValidationResult {
  // 检查文件大小
  if (file.size > config.maxSize) {
    return {
      valid: false,
      error: `文件大小超出限制 (最大 ${formatFileSize(config.maxSize)})`
    };
  }

  // 检查MIME类型
  if (!config.allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `不支持的文件类型: ${file.type}`
    };
  }

  // 检查文件扩展名
  const extension = getFileExtension(file.name).toLowerCase();
  if (!config.allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `不支持的文件扩展名: ${extension}`
    };
  }

  // 检查文件名安全性
  const sanitizedName = sanitizeFileName(file.name);
  if (!sanitizedName) {
    return {
      valid: false,
      error: '文件名包含非法字符'
    };
  }

  return {
    valid: true,
    sanitizedName
  };
}

/**
 * 获取文件扩展名
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.slice(lastDot);
}

/**
 * 安全的文件名处理
 */
export function sanitizeFileName(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return '';
  }

  // 移除或替换危险字符
  const sanitized = filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // 替换非法字符
    .replace(/^\.+/, '') // 移除开头的点
    .replace(/\.+$/, '') // 移除结尾的点
    .replace(/\s+/g, '_') // 替换空格
    .substring(0, 255); // 限制长度

  // 避免保留文件名
  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedNames.test(sanitized.split('.')[0])) {
    return `file_${sanitized}`;
  }

  return sanitized || 'unnamed_file';
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * 生成安全的随机文件名
 */
export function generateSecureFileName(originalName: string): string {
  const extension = getFileExtension(originalName);
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  
  return `file_${timestamp}_${randomId}${extension}`;
}

/**
 * URL安全检查
 */
export function isUrlSafe(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    
    // 只允许http和https协议
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false;
    }
    
    // 检查是否包含危险字符
    const dangerousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
      /<script/i,
      /<iframe/i
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(url));
  } catch {
    return false;
  }
}
