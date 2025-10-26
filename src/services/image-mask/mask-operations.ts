/**
 * 遮罩操作辅助函数集
 * 
 * 功能：
 * - 纯函数实现，无副作用
 * - 颜色处理和转换
 * - SVG坐标计算
 * - 遮罩碰撞检测
 * - 几何计算
 * 
 * @author Tuanki Team
 * @date 2025-10-22
 */

import type { Mask } from '../../types/image-mask-types';

// ===== 颜色处理 =====

/**
 * 颜色缓存（优化性能）
 */
const colorCache = new Map<string, {rgb: string; opacity: number}>();

/**
 * 解析RGBA颜色字符串
 * 
 * 支持格式：
 * - rgba(r, g, b, a)
 * - rgb(r, g, b)
 * - #RRGGBB
 * - #RGB
 * 
 * @param color 颜色字符串
 * @returns {rgb, opacity} RGB颜色和透明度
 */
export function parseRGBAColor(color: string): {rgb: string; opacity: number} {
  // 检查缓存
  if (colorCache.has(color)) {
    return colorCache.get(color)!;
  }
  
  const defaultResult = {
    rgb: 'rgb(0, 0, 0)',
    opacity: 0.7
  };
  
  if (!color || typeof color !== 'string') {
    return defaultResult;
  }
  
  // 标准化颜色字符串（移除多余空格）
  const normalized = color.replace(/\s+/g, ' ').trim();
  
  // 解析 rgba(r, g, b, a) 或 rgb(r, g, b)
  const rgbaMatch = normalized.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const result = {
      rgb: `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`,
      opacity: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1
    };
    colorCache.set(color, result);
    return result;
  }
  
  // 解析 #RRGGBB 或 #RGB
  const hexMatch = normalized.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    
    // 处理简写格式 #RGB -> #RRGGBB
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    const result = {
      rgb: `rgb(${r}, ${g}, ${b})`,
      opacity: 1
    };
    colorCache.set(color, result);
    return result;
  }
  
  // 无法解析，返回默认值
  colorCache.set(color, defaultResult);
  return defaultResult;
}

/**
 * 创建RGBA颜色字符串
 * 
 * @param rgb RGB部分 (如 "rgb(255, 0, 0)" 或 "255, 0, 0")
 * @param opacity 透明度 (0-1)
 * @returns RGBA字符串
 */
export function createRGBAColor(rgb: string, opacity: number): string {
  // 如果rgb已经是rgb()格式，提取数值
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
  }
  
  // 否则假设是逗号分隔的数值
  return `rgba(${rgb}, ${opacity})`;
}

/**
 * 清空颜色缓存（用于测试或内存管理）
 */
export function clearColorCache(): void {
  colorCache.clear();
}

// ===== SVG坐标转换 =====

/**
 * 从SVG事件获取相对坐标(0-1范围)
 * 
 * @param event 鼠标事件
 * @param svgElement SVG元素
 * @returns {x, y} 相对坐标
 */
export function getSVGPoint(
  event: MouseEvent,
  svgElement: SVGSVGElement
): {x: number; y: number} {
  const rect = svgElement.getBoundingClientRect();
  
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height
  };
}

/**
 * 限制坐标在0-1范围内
 * 
 * @param value 原始值
 * @returns 限制后的值
 */
export function clampCoordinate(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * 限制遮罩在图片范围内
 * 
 * @param mask 遮罩对象
 * @returns 限制后的遮罩
 */
export function clampMask(mask: Mask): Mask {
  if (mask.type === 'rect') {
    return {
      ...mask,
      x: clampCoordinate(mask.x),
      y: clampCoordinate(mask.y),
      width: Math.min(mask.width!, 1 - mask.x),
      height: Math.min(mask.height!, 1 - mask.y)
    };
  } else if (mask.type === 'circle') {
    const maxRadius = Math.min(
      mask.x,
      mask.y,
      1 - mask.x,
      1 - mask.y
    );
    return {
      ...mask,
      x: clampCoordinate(mask.x),
      y: clampCoordinate(mask.y),
      radius: Math.min(mask.radius!, maxRadius)
    };
  }
  
  return mask;
}

// ===== 几何计算 =====

/**
 * 计算两点之间的距离
 * 
 * @param p1 点1
 * @param p2 点2
 * @returns 距离
 */
export function distance(
  p1: {x: number; y: number},
  p2: {x: number; y: number}
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 计算矩形的边界框
 * 
 * @param mask 矩形遮罩
 * @returns 边界框 {left, top, right, bottom}
 */
export function getRectBounds(mask: Mask): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  if (mask.type !== 'rect') {
    throw new Error('getRectBounds只能用于矩形遮罩');
  }
  
  return {
    left: mask.x,
    top: mask.y,
    right: mask.x + (mask.width || 0),
    bottom: mask.y + (mask.height || 0)
  };
}

/**
 * 检查点是否在遮罩内
 * 
 * @param point 点坐标
 * @param mask 遮罩对象
 * @returns 是否在遮罩内
 */
export function isPointInMask(
  point: {x: number; y: number},
  mask: Mask
): boolean {
  if (mask.type === 'rect') {
    const bounds = getRectBounds(mask);
    return (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    );
  } else if (mask.type === 'circle') {
    const dist = distance(point, {x: mask.x, y: mask.y});
    return dist <= (mask.radius || 0);
  }
  
  return false;
}

/**
 * 检测两个遮罩是否碰撞
 * 
 * @param mask1 遮罩1
 * @param mask2 遮罩2
 * @returns 是否碰撞
 */
export function checkMaskCollision(mask1: Mask, mask2: Mask): boolean {
  // 矩形 vs 矩形
  if (mask1.type === 'rect' && mask2.type === 'rect') {
    const b1 = getRectBounds(mask1);
    const b2 = getRectBounds(mask2);
    
    return !(
      b1.right < b2.left ||
      b1.left > b2.right ||
      b1.bottom < b2.top ||
      b1.top > b2.bottom
    );
  }
  
  // 圆形 vs 圆形
  if (mask1.type === 'circle' && mask2.type === 'circle') {
    const dist = distance(
      {x: mask1.x, y: mask1.y},
      {x: mask2.x, y: mask2.y}
    );
    const radiusSum = (mask1.radius || 0) + (mask2.radius || 0);
    return dist < radiusSum;
  }
  
  // 矩形 vs 圆形（简化检测：检查圆心是否在矩形内）
  if (mask1.type === 'rect' && mask2.type === 'circle') {
    return isPointInMask({x: mask2.x, y: mask2.y}, mask1);
  }
  
  if (mask1.type === 'circle' && mask2.type === 'rect') {
    return isPointInMask({x: mask1.x, y: mask1.y}, mask2);
  }
  
  return false;
}

/**
 * 查找点击位置下的遮罩
 * 
 * @param point 点击点
 * @param masks 遮罩数组
 * @returns 找到的遮罩或null（返回最上层的遮罩）
 */
export function findMaskAtPoint(
  point: {x: number; y: number},
  masks: Mask[]
): Mask | null {
  // 从后往前查找（后面的遮罩在上层）
  for (let i = masks.length - 1; i >= 0; i--) {
    if (isPointInMask(point, masks[i])) {
      return masks[i];
    }
  }
  
  return null;
}

// ===== 控制点计算 =====

/**
 * 控制点位置枚举
 */
export type ResizeHandle =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * 获取矩形的所有控制点位置
 * 
 * @param mask 矩形遮罩
 * @returns 控制点位置数组
 */
export function getRectResizeHandles(mask: Mask): Array<{
  type: ResizeHandle;
  x: number;
  y: number;
}> {
  if (mask.type !== 'rect') {
    throw new Error('getRectResizeHandles只能用于矩形遮罩');
  }
  
  const width = mask.width || 0;
  const height = mask.height || 0;
  
  return [
    { type: 'top-left', x: mask.x, y: mask.y },
    { type: 'top-center', x: mask.x + width / 2, y: mask.y },
    { type: 'top-right', x: mask.x + width, y: mask.y },
    { type: 'middle-left', x: mask.x, y: mask.y + height / 2 },
    { type: 'middle-right', x: mask.x + width, y: mask.y + height / 2 },
    { type: 'bottom-left', x: mask.x, y: mask.y + height },
    { type: 'bottom-center', x: mask.x + width / 2, y: mask.y + height },
    { type: 'bottom-right', x: mask.x + width, y: mask.y + height }
  ];
}

/**
 * 获取圆形的控制点位置
 * 
 * @param mask 圆形遮罩
 * @returns 控制点位置数组（4个方向）
 */
export function getCircleResizeHandles(mask: Mask): Array<{
  type: 'top' | 'right' | 'bottom' | 'left';
  x: number;
  y: number;
}> {
  if (mask.type !== 'circle') {
    throw new Error('getCircleResizeHandles只能用于圆形遮罩');
  }
  
  const radius = mask.radius || 0;
  
  return [
    { type: 'top', x: mask.x, y: mask.y - radius },
    { type: 'right', x: mask.x + radius, y: mask.y },
    { type: 'bottom', x: mask.x, y: mask.y + radius },
    { type: 'left', x: mask.x - radius, y: mask.y }
  ];
}

/**
 * 检查点是否在控制点附近
 * 
 * @param point 点坐标
 * @param handlePoint 控制点坐标
 * @param threshold 阈值（相对坐标，默认0.02）
 * @returns 是否在控制点附近
 */
export function isNearHandle(
  point: {x: number; y: number},
  handlePoint: {x: number; y: number},
  threshold: number = 0.02
): boolean {
  const dist = distance(point, handlePoint);
  return dist <= threshold;
}

// ===== 遮罩验证 =====

/**
 * 验证遮罩数据是否有效
 * 
 * @param mask 遮罩对象
 * @returns 是否有效
 */
export function isValidMask(mask: Partial<Mask>): boolean {
  if (!mask.type || !['rect', 'circle'].includes(mask.type)) {
    return false;
  }
  
  if (typeof mask.x !== 'number' || typeof mask.y !== 'number') {
    return false;
  }
  
  if (mask.type === 'rect') {
    if (typeof mask.width !== 'number' || typeof mask.height !== 'number') {
      return false;
    }
    if (mask.width <= 0 || mask.height <= 0) {
      return false;
    }
  }
  
  if (mask.type === 'circle') {
    if (typeof mask.radius !== 'number') {
      return false;
    }
    if (mask.radius <= 0) {
      return false;
    }
  }
  
  return true;
}

/**
 * 检查遮罩是否太小（可能是误操作）
 * 
 * @param mask 遮罩对象
 * @param threshold 最小尺寸阈值（默认0.01，即1%）
 * @returns 是否太小
 */
export function isMaskTooSmall(mask: Mask, threshold: number = 0.01): boolean {
  if (mask.type === 'rect') {
    return (mask.width || 0) < threshold || (mask.height || 0) < threshold;
  } else if (mask.type === 'circle') {
    return (mask.radius || 0) < threshold;
  }
  
  return false;
}


