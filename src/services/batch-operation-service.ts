/**
 * 批量操作服务
 * 提供统一的批量更新、事务处理、进度跟踪功能
 */

import type { Card } from '../data/types';
import type { AnkiDataStorage } from '../data/storage';
import type {
  BatchOperationResult,
  BatchProgressCallback,
  BatchUpdateFunction
} from '../types/batch-operation-types';

/**
 * 批量更新卡片
 * @param cards 要更新的卡片数组
 * @param updateFn 更新函数，接收旧卡片返回新卡片
 * @param dataStorage 数据存储实例
 * @param onProgress 进度回调函数
 * @returns 批量操作结果
 */
export async function batchUpdateCards(
  cards: Card[],
  updateFn: BatchUpdateFunction,
  dataStorage: AnkiDataStorage,
  onProgress?: BatchProgressCallback
): Promise<BatchOperationResult> {
  const startTime = Date.now();
  const result: BatchOperationResult = {
    total: cards.length,
    success: 0,
    failed: 0,
    errors: [],
    duration: 0
  };

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    try {
      const updatedCard = updateFn(card);
      const response = await dataStorage.saveCard(updatedCard);
      
      if (response.success) {
        result.success++;
      } else {
        result.failed++;
        result.errors.push({
          cardId: card.id,
          cardTitle: getCardTitle(card),
          error: response.error || '保存失败'
        });
        console.error(`[BatchOperation] 保存卡片失败: ${card.id}`, response.error);
      }
    } catch (error) {
      result.failed++;
      result.errors.push({
        cardId: card.id,
        cardTitle: getCardTitle(card),
        error: error instanceof Error ? error.message : '未知错误'
      });
      console.error(`[BatchOperation] 更新卡片失败: ${card.id}`, error);
    }

    // 报告进度
    onProgress?.(i + 1, cards.length);

    // 每10张卡片让出控制权，避免阻塞UI
    if ((i + 1) % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  result.duration = Date.now() - startTime;
  
  console.log('[BatchOperation] 批量操作完成:', result);
  
  return result;
}

/**
 * 获取卡片标题（用于错误报告）
 */
function getCardTitle(card: Card): string {
  return (
    card.fields.front ||
    card.fields.question ||
    card.fields.word ||
    card.fields.term ||
    `卡片 ${card.id.substring(0, 8)}`
  );
}

/**
 * 合并未映射字段到目标字段
 * @param card 卡片
 * @param unmappedFields 未映射的字段名数组
 * @param targetField 目标字段名
 * @returns 合并后的内容
 */
export function mergeUnmappedFields(
  card: Card,
  unmappedFields: string[],
  targetField: string
): string {
  const mergedContent = unmappedFields
    .map(fieldKey => {
      const value = card.fields[fieldKey];
      if (!value || !value.trim()) return null;
      return `**${fieldKey}**: ${value}`;
    })
    .filter(Boolean)
    .join('\n\n');

  // 如果目标字段已有内容，追加到末尾
  const existingContent = card.fields[targetField] || '';
  
  if (!mergedContent) {
    return existingContent;
  }

  if (!existingContent) {
    return mergedContent;
  }

  return `${existingContent}\n\n---\n\n${mergedContent}`;
}

/**
 * 删除指定字段
 * @param card 卡片
 * @param fieldsToDelete 要删除的字段名数组
 * @returns 新的fields对象
 */
export function deleteFields(
  card: Card,
  fieldsToDelete: string[]
): Record<string, string> {
  const newFields = { ...card.fields };
  
  fieldsToDelete.forEach(fieldKey => {
    delete newFields[fieldKey];
  });

  return newFields;
}

