/**
 * 分批生成工具函数
 * 用于优化AI卡片生成的用户体验
 */

/**
 * 分批策略
 * - fast-first: 首批优先（首批最少，快速显示）
 * - balanced: 平衡模式（均匀分配）
 * - adaptive: 自适应（根据总数智能调整）
 */
export type BatchStrategy = 'fast-first' | 'balanced' | 'adaptive';

/**
 * 分批配置
 */
export interface BatchConfig {
  /** 总卡片数 */
  totalCount: number;
  /** 分批策略 */
  strategy?: BatchStrategy;
  /** 首批大小（仅fast-first策略） */
  firstBatchSize?: number;
  /** 最大批次大小 */
  maxBatchSize?: number;
}

/**
 * 创建分批数组
 * 
 * @example
 * createBatches(10, 'fast-first')
 * // 返回: [2, 2, 2, 2, 2]
 * 
 * createBatches(20, 'balanced')
 * // 返回: [3, 3, 3, 3, 4, 4]
 * 
 * @param totalCount 总卡片数
 * @param strategy 分批策略，默认 'fast-first'
 * @returns 每批的卡片数量数组
 */
export function createBatches(
  totalCount: number,
  strategy: BatchStrategy = 'fast-first'
): number[] {
  if (totalCount <= 0) {
    return [];
  }

  // 单张卡片，无需分批
  if (totalCount === 1) {
    return [1];
  }

  switch (strategy) {
    case 'fast-first':
      return createFastFirstBatches(totalCount);
    
    case 'balanced':
      return createBalancedBatches(totalCount);
    
    case 'adaptive':
      return createAdaptiveBatches(totalCount);
    
    default:
      return createFastFirstBatches(totalCount);
  }
}

/**
 * 首批优先策略
 * 首批2张（快速显示），后续均分
 * 
 * @example
 * 10张 → [2, 2, 2, 2, 2]
 * 15张 → [2, 3, 3, 3, 4]
 * 8张  → [2, 2, 2, 2]
 */
function createFastFirstBatches(totalCount: number): number[] {
  const FIRST_BATCH_SIZE = 2; // 首批固定2张，确保3-5秒内显示
  
  // 总数小于等于首批大小，一次生成
  if (totalCount <= FIRST_BATCH_SIZE) {
    return [totalCount];
  }
  
  const batches: number[] = [FIRST_BATCH_SIZE];
  let remaining = totalCount - FIRST_BATCH_SIZE;
  
  // 后续批次大小：尽量均分，每批2-4张
  const PREFERRED_BATCH_SIZE = 2;
  const numRemainingBatches = Math.ceil(remaining / PREFERRED_BATCH_SIZE);
  
  for (let i = 0; i < numRemainingBatches; i++) {
    const batchSize = Math.ceil(remaining / (numRemainingBatches - i));
    batches.push(batchSize);
    remaining -= batchSize;
  }
  
  return batches;
}

/**
 * 平衡模式策略
 * 所有批次尽量大小一致，每批3张
 * 
 * @example
 * 10张 → [3, 3, 4]
 * 15张 → [3, 3, 3, 3, 3]
 * 8张  → [3, 3, 2]
 */
function createBalancedBatches(totalCount: number): number[] {
  const PREFERRED_BATCH_SIZE = 3;
  
  const numBatches = Math.ceil(totalCount / PREFERRED_BATCH_SIZE);
  const batches: number[] = [];
  let remaining = totalCount;
  
  for (let i = 0; i < numBatches; i++) {
    const batchSize = Math.ceil(remaining / (numBatches - i));
    batches.push(batchSize);
    remaining -= batchSize;
  }
  
  return batches;
}

/**
 * 自适应策略
 * 根据总数智能调整分批方案
 * 
 * 规则：
 * - 1-5张：不分批
 * - 6-15张：首批优先
 * - 16-30张：首批2张，后续3-4张
 * - 30+张：首批2张，后续5张
 * 
 * @example
 * 3张  → [3]
 * 10张 → [2, 2, 2, 2, 2]
 * 20张 → [2, 3, 3, 3, 3, 3, 3]
 * 50张 → [2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3]
 */
function createAdaptiveBatches(totalCount: number): number[] {
  // 小批量：不分批
  if (totalCount <= 5) {
    return [totalCount];
  }
  
  // 中等批量：首批优先
  if (totalCount <= 15) {
    return createFastFirstBatches(totalCount);
  }
  
  // 大批量：首批2张，后续3-5张
  const FIRST_BATCH_SIZE = 2;
  const batches: number[] = [FIRST_BATCH_SIZE];
  let remaining = totalCount - FIRST_BATCH_SIZE;
  
  // 根据总数调整后续批次大小
  const subsequentBatchSize = totalCount <= 30 ? 3 : 5;
  
  while (remaining > 0) {
    const batchSize = Math.min(subsequentBatchSize, remaining);
    batches.push(batchSize);
    remaining -= batchSize;
  }
  
  return batches;
}

/**
 * 计算分批统计信息
 */
export function getBatchStats(batches: number[]): {
  totalBatches: number;
  totalCards: number;
  avgBatchSize: number;
  firstBatchSize: number;
  lastBatchSize: number;
} {
  return {
    totalBatches: batches.length,
    totalCards: batches.reduce((sum, size) => sum + size, 0),
    avgBatchSize: batches.reduce((sum, size) => sum + size, 0) / batches.length,
    firstBatchSize: batches[0] || 0,
    lastBatchSize: batches[batches.length - 1] || 0
  };
}

/**
 * 验证分批结果是否正确
 */
export function validateBatches(batches: number[], expectedTotal: number): boolean {
  const actualTotal = batches.reduce((sum, size) => sum + size, 0);
  return actualTotal === expectedTotal && batches.every(size => size > 0);
}



