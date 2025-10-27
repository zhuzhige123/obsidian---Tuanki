/**
 * UUID 生成工具
 * 
 * ⚠️ @deprecated v0.8+
 * 此文件已废弃，请使用新的统一标识符系统：
 * - 使用 `utils/helpers.ts` 中的 `generateUUID()` 和 `isValidUUID()`
 * - 新格式：tk-{12位base32}，更短、更可读、时间可排序
 * - 向后兼容旧UUID格式
 * 
 * 迁移指南：
 * ```ts
 * // 旧代码
 * import { generateUUID } from './utils/uuid-generator';
 * 
 * // 新代码
 * import { generateUUID } from './utils/helpers';
 * ```
 */

/**
 * 生成 UUID v4
 */
export function generateUUID(): string {
  // 使用 crypto.randomUUID() 如果可用
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // 兜底实现
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 生成短 UUID（8位）
 */
export function generateShortUUID(): string {
  return generateUUID().split('-')[0];
}

/**
 * 验证 UUID 格式
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 生成基于时间戳的 ID
 */
export function generateTimestampId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成基于内容的哈希 ID
 */
export function generateContentBasedId(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash).toString(36);
}
