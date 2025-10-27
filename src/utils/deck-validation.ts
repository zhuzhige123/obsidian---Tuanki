/**
 * 牌组卡片类型验证工具
 * 
 * 用于验证卡片是否可以添加到特定类型的牌组
 */

import type { Card, Deck, CardType, DeckType } from '../data/types';

/**
 * 检查卡片类型是否符合牌组要求
 * 
 * @param cardType 卡片类型
 * @param deckType 牌组类型
 * @returns 是否允许添加
 */
export function isCardTypeAllowed(cardType: CardType | string, deckType?: DeckType): boolean {
  // 如果牌组类型未设置或为mixed，允许所有类型
  if (!deckType || deckType === 'mixed') {
    return true;
  }
  
  // 如果是选择题专用牌组
  if (deckType === 'choice-only') {
    // 只允许选择题类型（multiple 或 choice）
    return cardType === 'multiple' || cardType === 'choice';
  }
  
  return true;
}

/**
 * 检查卡片是否可以添加到指定牌组
 * 
 * @param card 卡片对象
 * @param deck 牌组对象
 * @returns 是否可以添加
 */
export function canAddCardToDeck(card: Card, deck: Deck): boolean {
  return isCardTypeAllowed(card.type, deck.deckType);
}

/**
 * 获取牌组的卡片类型限制说明
 * 
 * @param deck 牌组对象
 * @returns 限制说明文本，如果无限制则返回null
 */
export function getDeckTypeRestrictionMessage(deck: Deck): string | null {
  if (!deck.deckType || deck.deckType === 'mixed') {
    return null;
  }
  
  if (deck.deckType === 'choice-only') {
    return '该牌组为选择题专用牌组，只能添加选择题类型的卡片';
  }
  
  return null;
}

/**
 * 获取添加卡片失败的错误消息
 * 
 * @param card 卡片对象
 * @param deck 牌组对象
 * @returns 错误消息
 */
export function getAddCardErrorMessage(card: Card, deck: Deck): string {
  if (!deck.deckType || deck.deckType === 'mixed') {
    return '无法添加卡片到此牌组';
  }
  
  if (deck.deckType === 'choice-only') {
    const cardTypeLabel = getCardTypeLabel(card.type);
    return `无法添加${cardTypeLabel}到选择题专用牌组。该牌组只能添加选择题类型的卡片。`;
  }
  
  return '无法添加卡片到此牌组';
}

/**
 * 获取卡片类型的中文标签
 * 
 * @param cardType 卡片类型
 * @returns 中文标签
 */
function getCardTypeLabel(cardType: CardType | string): string {
  const labels: Record<string, string> = {
    'basic': '基础问答题',
    'cloze': '挖空题',
    'multiple': '选择题',
    'choice': '选择题',
    'code': '代码题'
  };
  
  return labels[cardType] || '此类型卡片';
}

/**
 * 批量验证卡片是否可以添加到牌组
 * 
 * @param cards 卡片数组
 * @param deck 牌组对象
 * @returns { allowed: Card[], denied: Card[] } 允许和拒绝的卡片列表
 */
export function validateCardsForDeck(
  cards: Card[],
  deck: Deck
): { allowed: Card[]; denied: Card[] } {
  const allowed: Card[] = [];
  const denied: Card[] = [];
  
  for (const card of cards) {
    if (canAddCardToDeck(card, deck)) {
      allowed.push(card);
    } else {
      denied.push(card);
    }
  }
  
  return { allowed, denied };
}

/**
 * 获取牌组类型的显示名称
 * 
 * @param deckType 牌组类型
 * @returns 显示名称
 */
export function getDeckTypeLabel(deckType?: DeckType): string {
  const labels: Record<DeckType, string> = {
    'mixed': '混合题型',
    'choice-only': '选择题专用'
  };
  
  return deckType ? labels[deckType] : '混合题型';
}

/**
 * 获取牌组类型的描述
 * 
 * @param deckType 牌组类型
 * @returns 描述文本
 */
export function getDeckTypeDescription(deckType?: DeckType): string {
  const descriptions: Record<DeckType, string> = {
    'mixed': '可以添加所有类型的卡片',
    'choice-only': '只能添加选择题类型的卡片'
  };
  
  return deckType ? descriptions[deckType] : '可以添加所有类型的卡片';
}



