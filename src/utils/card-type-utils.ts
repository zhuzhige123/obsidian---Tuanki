/**
 * 卡片题型识别工具函数
 * 提供统一的题型识别和元数据获取功能
 */

import type { Card } from '../data/types';
import { UnifiedCardType, CARD_TYPE_METADATA, CARD_TYPE_MAPPINGS, getCardTypeName, getCardTypeIcon } from '../types/unified-card-types';
import { OFFICIAL_TEMPLATES } from '../constants/official-templates';

/**
 * 智能识别卡片的题型
 * 
 * 识别策略：
 * 1. 优先从官方模板映射
 * 2. 从 templateId 字符串模式推断
 * 3. 使用映射表转换 card.type
 * 4. 默认返回基础问答题型
 * 
 * @param card - 卡片对象
 * @returns 统一的题型枚举
 */
export function detectCardQuestionType(card: Card): UnifiedCardType {
  if (!card) {
    return UnifiedCardType.BASIC_QA;
  }

  // 策略1: 从官方模板查找
  if (card.templateId) {
    const officialTemplate = OFFICIAL_TEMPLATES.find(t => t.id === card.templateId);
    if (officialTemplate) {
      // 官方模板可能有 cardType 字段指示题型
      const cardType = (officialTemplate as any).cardType;
      if (cardType) {
        const mapping = CARD_TYPE_MAPPINGS.find(m => m.from === cardType);
        if (mapping) {
          return mapping.to;
        }
      }
    }

    // 策略2: 从 templateId 字符串模式推断
    const templateId = card.templateId.toLowerCase();
    
    if (templateId.includes('choice') || templateId.includes('mcq') || templateId.includes('multiple')) {
      if (templateId.includes('single')) {
        return UnifiedCardType.SINGLE_CHOICE;
      }
      if (templateId.includes('multiple')) {
        return UnifiedCardType.MULTIPLE_CHOICE;
      }
      // 默认单选
      return UnifiedCardType.SINGLE_CHOICE;
    }
    
    if (templateId.includes('cloze') || templateId.includes('挖空')) {
      return UnifiedCardType.CLOZE_DELETION;
    }
    
    if (templateId.includes('fill') || templateId.includes('blank') || templateId.includes('填空')) {
      return UnifiedCardType.FILL_IN_BLANK;
    }
    
    if (templateId.includes('sequence') || templateId.includes('顺序')) {
      return UnifiedCardType.SEQUENCE;
    }
  }

  // 策略3: 使用 card.type 映射
  if (card.type) {
    const mapping = CARD_TYPE_MAPPINGS.find(m => m.from === card.type.toLowerCase());
    if (mapping) {
      return mapping.to;
    }
  }

  // 策略4: 默认基础问答
  return UnifiedCardType.BASIC_QA;
}

/**
 * 获取题型的图标名称
 * @param cardType - 题型枚举
 * @returns 图标名称字符串
 */
export function getQuestionTypeIcon(cardType: UnifiedCardType): string {
  // 使用 unified-card-types 中的图标映射
  return getCardTypeIcon(cardType);
}

/**
 * 获取题型的显示名称
 * @param cardType - 题型枚举
 * @returns 中文显示名称
 */
export function getQuestionTypeName(cardType: UnifiedCardType): string {
  return getCardTypeName(cardType);
}

/**
 * 获取题型的元数据
 * @param cardType - 题型枚举
 * @returns 题型完整元数据
 */
export function getQuestionTypeMetadata(cardType: UnifiedCardType) {
  return CARD_TYPE_METADATA[cardType];
}

/**
 * 批量统计卡片的题型分布
 * @param cards - 卡片数组
 * @returns 题型分布统计对象 { [题型]: 数量 }
 */
export function getQuestionTypeDistribution(cards: Card[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  
  for (const card of cards) {
    const questionType = detectCardQuestionType(card);
    distribution[questionType] = (distribution[questionType] || 0) + 1;
  }
  
  return distribution;
}










