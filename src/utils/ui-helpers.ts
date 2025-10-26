/**
 * UI辅助工具函数
 * 包含各种UI相关的帮助函数
 */

/**
 * 获取Obsidian主题颜色变量
 * 从CSS变量中提取当前主题的颜色值
 * @returns 主题颜色对象
 */
export function getObsidianThemeColors() {
  const style = getComputedStyle(document.body);
  
  return {
    // 背景色
    backgroundPrimary: style.getPropertyValue('--background-primary').trim() || '#ffffff',
    backgroundSecondary: style.getPropertyValue('--background-secondary').trim() || '#f5f5f5',
    backgroundModifierBorder: style.getPropertyValue('--background-modifier-border').trim() || '#e0e0e0',
    backgroundModifierBorderHover: style.getPropertyValue('--background-modifier-border-hover').trim() || '#d0d0d0',
    backgroundModifierBorderFocus: style.getPropertyValue('--background-modifier-border-focus').trim() || '#4a9eff',
    backgroundModifierHover: style.getPropertyValue('--background-modifier-hover').trim() || '#f0f0f0',
    
    // 文本色
    textNormal: style.getPropertyValue('--text-normal').trim() || '#2e3338',
    textMuted: style.getPropertyValue('--text-muted').trim() || '#888888',
    textFaint: style.getPropertyValue('--text-faint').trim() || '#999999',
    
    // 交互色
    interactiveAccent: style.getPropertyValue('--interactive-accent').trim() || '#7c3aed',
    interactiveAccentHover: style.getPropertyValue('--interactive-accent-hover').trim() || '#6d28d9',
    
    // 状态色
    textSuccess: style.getPropertyValue('--text-success').trim() || '#22c55e',
    textWarning: style.getPropertyValue('--text-warning').trim() || '#f59e0b',
    textError: style.getPropertyValue('--text-error').trim() || '#ef4444',
    
    // 标签色
    tagBlueBg: style.getPropertyValue('--tag-blue-bg').trim() || '#dbeafe',
    tagBlueText: style.getPropertyValue('--tag-blue-text').trim() || '#1e3a8a',
    tagBlueBorder: style.getPropertyValue('--tag-blue-border').trim() || '#60a5fa',
    
    tagPurpleBg: style.getPropertyValue('--tag-purple-bg').trim() || '#f3e8ff',
    tagPurpleText: style.getPropertyValue('--tag-purple-text').trim() || '#581c87',
    tagPurpleBorder: style.getPropertyValue('--tag-purple-border').trim() || '#a78bfa',
    
    tagPinkBg: style.getPropertyValue('--tag-pink-bg').trim() || '#fce7f3',
    tagPinkText: style.getPropertyValue('--tag-pink-text').trim() || '#831843',
    tagPinkBorder: style.getPropertyValue('--tag-pink-border').trim() || '#f472b6',
    
    tagRedBg: style.getPropertyValue('--tag-red-bg').trim() || '#fee2e2',
    tagRedText: style.getPropertyValue('--tag-red-text').trim() || '#7f1d1d',
    tagRedBorder: style.getPropertyValue('--tag-red-border').trim() || '#f87171',
    
    tagOrangeBg: style.getPropertyValue('--tag-orange-bg').trim() || '#ffedd5',
    tagOrangeText: style.getPropertyValue('--tag-orange-text').trim() || '#7c2d12',
    tagOrangeBorder: style.getPropertyValue('--tag-orange-border').trim() || '#fb923c',
    
    tagGreenBg: style.getPropertyValue('--tag-green-bg').trim() || '#dcfce7',
    tagGreenText: style.getPropertyValue('--tag-green-text').trim() || '#14532d',
    tagGreenBorder: style.getPropertyValue('--tag-green-border').trim() || '#4ade80',
    
    tagCyanBg: style.getPropertyValue('--tag-cyan-bg').trim() || '#cffafe',
    tagCyanText: style.getPropertyValue('--tag-cyan-text').trim() || '#164e63',
    tagCyanBorder: style.getPropertyValue('--tag-cyan-border').trim() || '#22d3ee',
    
    tagGrayBg: style.getPropertyValue('--tag-gray-bg').trim() || '#f3f4f6',
    tagGrayText: style.getPropertyValue('--tag-gray-text').trim() || '#1f2937',
    tagGrayBorder: style.getPropertyValue('--tag-gray-border').trim() || '#9ca3af'
  };
}

/**
 * 根据标签名称获取标签颜色类别
 * @param tag 标签名称
 * @returns 颜色类别
 */
export function getTagColor(tag: string): string {
  const hash = tag.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  
  const colors = ['blue', 'purple', 'pink', 'red', 'orange', 'green', 'cyan', 'gray'];
  return colors[Math.abs(hash) % colors.length];
}

/**
 * 截断文本
 * @param text 文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * 获取文件名（不含路径）
 * @param filePath 文件路径
 * @returns 文件名
 */
export function getFileName(filePath: string): string {
  const parts = filePath.split(/[\/\\]/);
  return parts[parts.length - 1];
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化的文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * 防抖函数
 * @param func 要执行的函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    const context = this;
    
    if (timeout) clearTimeout(timeout);
    
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}

/**
 * 节流函数
 * @param func 要执行的函数
 * @param limit 时间限制（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;
  
  return function(this: any, ...args: Parameters<T>) {
    const context = this;
    
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * 生成唯一ID
 * @param prefix 前缀
 * @returns 唯一ID
 */
export function generateUniqueId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 深度克隆对象
 * @param obj 要克隆的对象
 * @returns 克隆后的对象
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 检查是否为暗色主题
 * @returns 是否为暗色主题
 */
export function isDarkTheme(): boolean {
  return document.body.classList.contains('theme-dark');
}

/**
 * 获取对比色
 * @param hexColor 十六进制颜色值
 * @returns 对比色（黑色或白色）
 */
export function getContrastColor(hexColor: string): string {
  // 移除 # 符号
  const hex = hexColor.replace('#', '');
  
  // 转换为RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // 计算亮度
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  // 返回黑色或白色
  return brightness > 128 ? '#000000' : '#ffffff';
}

/**
 * 将RGB颜色转换为十六进制
 * @param r 红色值
 * @param g 绿色值
 * @param b 蓝色值
 * @returns 十六进制颜色值
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * 解析RGB字符串
 * @param rgb RGB字符串，如 "rgb(255, 255, 255)"
 * @returns RGB值数组
 */
export function parseRgbString(rgb: string): [number, number, number] | null {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return null;
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}
