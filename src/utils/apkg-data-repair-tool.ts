/**
 * APKG数据修复工具
 * 
 * 用于修复旧版APKG导入产生的字段重复问题
 * 
 * @module utils/apkg-data-repair-tool
 */

import type { Card } from '../data/types';

export interface RepairResult {
  success: boolean;
  repairedCount: number;
  skippedCount: number;
  errors: string[];
  details: RepairDetail[];
}

export interface RepairDetail {
  cardId: string;
  action: 'cleaned' | 'skipped' | 'error';
  removedFields: string[];
  message?: string;
}

/**
 * APKG数据修复工具类
 */
export class APKGDataRepairTool {
  /**
   * 检测卡片是否有字段重复问题
   */
  static detectDuplication(card: Card): boolean {
    if (!card.fields || typeof card.fields !== 'object') {
      return false;
    }

    const fields = card.fields;
    const hasStandardFields = 'front' in fields || 'back' in fields;
    const hasCompatFields = 'question' in fields || 'answer' in fields;
    const hasAnkiFields = Object.keys(fields).some(key => 
      key !== 'front' && key !== 'back' && key !== 'question' && key !== 'answer'
    );

    // 如果同时存在标准字段和兼容字段，或者有Anki原始字段，说明有重复
    return (hasStandardFields && hasCompatFields) || hasAnkiFields;
  }

  /**
   * 清理卡片的重复字段
   */
  static cleanDuplicateFields(card: Card): RepairDetail {
    const removedFields: string[] = [];
    
    try {
      if (!card.fields || typeof card.fields !== 'object') {
        return {
          cardId: card.id,
          action: 'skipped',
          removedFields: [],
          message: 'fields为空或格式错误'
        };
      }

      const originalFields = { ...card.fields };
      const cleanedFields: Record<string, string> = {};

      // 🆕 只保留标准字段 front 和 back
      if (originalFields.front) {
        cleanedFields.front = originalFields.front;
      } else if (originalFields.question) {
        // 如果没有front但有question，使用question的值
        cleanedFields.front = originalFields.question;
        removedFields.push('question (merged to front)');
      }

      if (originalFields.back) {
        cleanedFields.back = originalFields.back;
      } else if (originalFields.answer) {
        // 如果没有back但有answer，使用answer的值
        cleanedFields.back = originalFields.answer;
        removedFields.push('answer (merged to back)');
      }

      // 🆕 移除所有其他字段
      for (const key of Object.keys(originalFields)) {
        if (key !== 'front' && key !== 'back') {
          removedFields.push(key);
        }
      }

      // 更新卡片
      card.fields = cleanedFields;

      // 🆕 将Anki原始字段移到customFields（如果尚未移动）
      if (removedFields.length > 0 && !card.customFields?.ankiOriginal) {
        if (!card.customFields) {
          card.customFields = {};
        }

        // 保存被移除的Anki字段到customFields
        const ankiFields: Record<string, string> = {};
        for (const key of Object.keys(originalFields)) {
          if (key !== 'front' && key !== 'back' && key !== 'question' && key !== 'answer') {
            ankiFields[key] = originalFields[key];
          }
        }

        if (Object.keys(ankiFields).length > 0) {
          card.customFields.ankiOriginal = {
            ...(card.customFields.ankiOriginal || {}),
            fields: ankiFields
          };
        }
      }

      return {
        cardId: card.id,
        action: 'cleaned',
        removedFields,
        message: `已清理${removedFields.length}个重复字段`
      };

    } catch (error) {
      return {
        cardId: card.id,
        action: 'error',
        removedFields: [],
        message: `清理失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 修复content中的分隔符位置
   */
  static repairContentDivider(card: Card): boolean {
    if (!card.content) {
      return false;
    }

    const content = card.content;
    
    // 检测分隔符是否在开头（异常情况）
    if (content.startsWith('---div---')) {
      // 移除开头的分隔符
      const afterDivider = content.substring('---div---'.length).trim();
      card.content = afterDivider;
      return true;
    }

    return false;
  }

  /**
   * 批量修复卡片
   */
  static repairCards(cards: Card[]): RepairResult {
    const result: RepairResult = {
      success: true,
      repairedCount: 0,
      skippedCount: 0,
      errors: [],
      details: []
    };

    for (const card of cards) {
      // 修复字段重复
      const cleanDetail = this.cleanDuplicateFields(card);
      result.details.push(cleanDetail);

      if (cleanDetail.action === 'cleaned') {
        result.repairedCount++;
      } else if (cleanDetail.action === 'skipped') {
        result.skippedCount++;
      } else if (cleanDetail.action === 'error') {
        result.errors.push(cleanDetail.message || '未知错误');
      }

      // 修复content分隔符
      const dividerRepaired = this.repairContentDivider(card);
      if (dividerRepaired) {
        result.details.push({
          cardId: card.id,
          action: 'cleaned',
          removedFields: [],
          message: '已修复content分隔符位置'
        });
      }
    }

    result.success = result.errors.length === 0;

    return result;
  }

  /**
   * 生成修复报告
   */
  static generateReport(result: RepairResult): string {
    const lines: string[] = [];
    
    lines.push('# APKG数据修复报告');
    lines.push('');
    lines.push(`## 总结`);
    lines.push(`- 修复状态: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    lines.push(`- 已修复卡片: ${result.repairedCount}`);
    lines.push(`- 跳过卡片: ${result.skippedCount}`);
    lines.push(`- 错误数量: ${result.errors.length}`);
    lines.push('');

    if (result.errors.length > 0) {
      lines.push(`## 错误列表`);
      result.errors.forEach((error, index) => {
        lines.push(`${index + 1}. ${error}`);
      });
      lines.push('');
    }

    lines.push(`## 详细信息`);
    lines.push('');
    
    const cleanedCards = result.details.filter(d => d.action === 'cleaned');
    if (cleanedCards.length > 0) {
      lines.push(`### 已清理的卡片 (${cleanedCards.length})`);
      cleanedCards.forEach(detail => {
        lines.push(`- 卡片 ${detail.cardId}:`);
        if (detail.removedFields.length > 0) {
          lines.push(`  - 移除字段: ${detail.removedFields.join(', ')}`);
        }
        if (detail.message) {
          lines.push(`  - ${detail.message}`);
        }
      });
      lines.push('');
    }

    const skippedCards = result.details.filter(d => d.action === 'skipped');
    if (skippedCards.length > 0) {
      lines.push(`### 跳过的卡片 (${skippedCards.length})`);
      skippedCards.slice(0, 10).forEach(detail => {
        lines.push(`- 卡片 ${detail.cardId}: ${detail.message || '无需修复'}`);
      });
      if (skippedCards.length > 10) {
        lines.push(`- ... 还有 ${skippedCards.length - 10} 张卡片`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * 使用示例：
 * 
 * ```typescript
 * import { APKGDataRepairTool } from './utils/apkg-data-repair-tool';
 * 
 * // 检测单个卡片
 * const hasDuplication = APKGDataRepairTool.detectDuplication(card);
 * 
 * // 清理单个卡片
 * const detail = APKGDataRepairTool.cleanDuplicateFields(card);
 * 
 * // 批量修复
 * const result = APKGDataRepairTool.repairCards(cards);
 * 
 * // 生成报告
 * const report = APKGDataRepairTool.generateReport(result);
 * console.log(report);
 * 
 * // 保存修复后的卡片
 * await dataStorage.saveDeckCards(deckId, cards);
 * ```
 */




