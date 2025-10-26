/**
 * 卡片高度估算工具
 * 
 * 为虚拟滚动提供准确的高度估算，基于布局模式、内容长度和 Markdown 复杂度
 * 
 * @module card-height-estimator
 */

import type { Card } from '../data/types';

/**
 * 布局模式类型
 */
export type LayoutMode = 'compact' | 'comfortable' | 'spacious';

/**
 * 基础高度映射（像素）
 */
const BASE_HEIGHTS: Record<LayoutMode, number> = {
  compact: 120,
  comfortable: 180,
  spacious: 240
};

/**
 * 最小和最大高度限制（像素）
 */
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 500;

/**
 * 估算卡片渲染高度
 * 
 * @param card - 卡片数据对象
 * @param layoutMode - 布局模式
 * @param hasMarkdown - 是否包含 Markdown 内容（默认：true）
 * @returns 估算的高度（像素）
 * 
 * @remarks
 * 此函数基于内容长度、布局模式和 Markdown 复杂度进行估算。
 * 估算值用于虚拟滚动的初始渲染，实际高度由 ResizeObserver 测量。
 * 
 * @example
 * ```typescript
 * const height = estimateCardHeight(card, 'comfortable', true);
 * // => 240 (基础高度 + 各种修正)
 * ```
 */
export function estimateCardHeight(
  card: Card,
  layoutMode: LayoutMode = 'comfortable',
  hasMarkdown = true
): number {
  // 1. 获取基础高度
  let height = BASE_HEIGHTS[layoutMode];
  
  // 2. 内容长度修正
  height = applyContentLengthAdjustment(height, card);
  
  // 3. Markdown 复杂度修正
  if (hasMarkdown) {
    height = applyMarkdownComplexityAdjustment(height, card);
  }
  
  // 4. 标签数量修正
  height = applyTagsAdjustment(height, card);
  
  // 5. 应用高度范围限制
  return clampHeight(height);
}

/**
 * 应用内容长度修正
 * 
 * @param baseHeight - 基础高度
 * @param card - 卡片数据
 * @returns 修正后的高度
 */
function applyContentLengthAdjustment(baseHeight: number, card: Card): number {
  // 获取卡片正反面内容
  const frontContent = card.fields?.front || card.fields?.question || '';
  const backContent = card.fields?.back || card.fields?.answer || '';
  const totalContent = frontContent + backContent;
  const contentLength = totalContent.length;
  
  // 根据内容长度调整高度
  if (contentLength < 50) {
    // 短内容：减少 20%
    return baseHeight * 0.8;
  } else if (contentLength < 200) {
    // 中等内容：保持基础高度
    return baseHeight;
  } else {
    // 长内容：增加 50%
    return baseHeight * 1.5;
  }
}

/**
 * 应用 Markdown 复杂度修正
 * 
 * @param baseHeight - 基础高度
 * @param card - 卡片数据
 * @returns 修正后的高度
 */
function applyMarkdownComplexityAdjustment(baseHeight: number, card: Card): number {
  const frontContent = card.fields?.front || card.fields?.question || '';
  const backContent = card.fields?.back || card.fields?.answer || '';
  const combinedContent = frontContent + backContent;
  
  let adjustment = 0;
  
  // 检测代码块 (```...``` 或 `...`)
  const codeBlockMatch = combinedContent.match(/```[\s\S]*?```/g);
  if (codeBlockMatch && codeBlockMatch.length > 0) {
    adjustment += 80; // 每个代码块增加 80px
  }
  
  // 检测图片 (![...](...) 或 ![[...]])
  const imageMatch = combinedContent.match(/!\[.*?\]\(.*?\)|!\[\[.*?\]\]/g);
  if (imageMatch && imageMatch.length > 0) {
    adjustment += 120; // 每个图片增加 120px
  }
  
  // 检测列表 (- ... 或 * ... 或 1. ...)
  const listMatch = combinedContent.match(/^[\s]*[-*+]|\d+\./gm);
  if (listMatch && listMatch.length > 2) {
    adjustment += 40; // 多行列表增加 40px
  }
  
  // 检测引用 (> ...)
  const quoteMatch = combinedContent.match(/^[\s]*>/gm);
  if (quoteMatch && quoteMatch.length > 0) {
    adjustment += 30; // 引用块增加 30px
  }
  
  return baseHeight + adjustment;
}

/**
 * 应用标签数量修正
 * 
 * @param baseHeight - 基础高度
 * @param card - 卡片数据
 * @returns 修正后的高度
 */
function applyTagsAdjustment(baseHeight: number, card: Card): number {
  const tags = card.tags || [];
  
  // 每个标签增加 8px，最多计入 3 个标签
  const tagCount = Math.min(tags.length, 3);
  const tagAdjustment = tagCount * 8;
  
  return baseHeight + tagAdjustment;
}

/**
 * 限制高度在合理范围内
 * 
 * @param height - 计算的高度
 * @returns 限制后的高度
 */
function clampHeight(height: number): number {
  return Math.max(MIN_HEIGHT, Math.min(height, MAX_HEIGHT));
}

/**
 * 批量估算卡片高度
 * 
 * @param cards - 卡片数组
 * @param layoutMode - 布局模式
 * @returns 高度数组
 */
export function estimateCardHeightsBatch(
  cards: Card[],
  layoutMode: LayoutMode = 'comfortable'
): number[] {
  return cards.map(card => estimateCardHeight(card, layoutMode));
}

/**
 * 计算平均估算高度
 * 
 * @param cards - 卡片数组
 * @param layoutMode - 布局模式
 * @returns 平均高度
 */
export function calculateAverageEstimatedHeight(
  cards: Card[],
  layoutMode: LayoutMode = 'comfortable'
): number {
  if (cards.length === 0) {
    return BASE_HEIGHTS[layoutMode];
  }
  
  const heights = estimateCardHeightsBatch(cards, layoutMode);
  const sum = heights.reduce((acc, h) => acc + h, 0);
  return Math.round(sum / heights.length);
}



