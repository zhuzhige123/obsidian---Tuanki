/**
 * 提示词模板变量解析服务
 * 负责解析和验证AI提示词中的动态变量
 */

import type { Card } from '../../data/types';
import type { ParseTemplate } from '../../types/newCardParsingTypes';
import type { Deck } from '../../data/types';
import { TEMPLATE_VARIABLES } from '../../types/ai-types';

/**
 * 提示词变量解析器
 */
export class PromptVariableResolver {
  /**
   * 解析提示词模板中的变量
   * @param template 包含变量的模板字符串
   * @param card 当前卡片对象
   * @param context 上下文信息（模板、牌组等）
   * @returns 解析后的字符串
   */
  resolve(
    template: string,
    card: Card,
    context: {
      template?: ParseTemplate;
      deck?: Deck;
    }
  ): string {
    let resolved = template;
    
    // 替换卡片内容变量
    resolved = resolved.replace(/\{\{cardContent\}\}/g, card.content || '');
    resolved = resolved.replace(/\{\{cardFront\}\}/g, this.getCardFront(card));
    resolved = resolved.replace(/\{\{cardBack\}\}/g, this.getCardBack(card));
    
    // 替换元数据变量
    resolved = resolved.replace(/\{\{cardType\}\}/g, this.getCardType(card));
    resolved = resolved.replace(/\{\{templateName\}\}/g, context.template?.name || '未知模板');
    resolved = resolved.replace(/\{\{deckName\}\}/g, context.deck?.name || '未知牌组');
    resolved = resolved.replace(/\{\{tags\}\}/g, card.tags?.join(', ') || '');
    
    return resolved;
  }
  
  /**
   * 验证模板中的变量是否有效
   * @param template 要验证的模板字符串
   * @returns 验证结果，包含是否有效及无效变量列表
   */
  validate(template: string): { 
    isValid: boolean; 
    invalidVariables: string[] 
  } {
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const matches = template.matchAll(variablePattern);
    const validVariables = Object.keys(TEMPLATE_VARIABLES);
    const invalidVariables: string[] = [];
    
    for (const match of matches) {
      const variable = `{{${match[1]}}}`;
      if (!validVariables.includes(variable)) {
        invalidVariables.push(variable);
      }
    }
    
    return {
      isValid: invalidVariables.length === 0,
      invalidVariables
    };
  }
  
  /**
   * 获取所有可用变量的列表
   * @returns 变量名和描述的映射
   */
  getAvailableVariables(): typeof TEMPLATE_VARIABLES {
    return TEMPLATE_VARIABLES;
  }
  
  /**
   * 提取模板中使用的所有变量
   * @param template 模板字符串
   * @returns 变量数组
   */
  extractVariables(template: string): string[] {
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const matches = template.matchAll(variablePattern);
    const variables: string[] = [];
    
    for (const match of matches) {
      const variable = `{{${match[1]}}}`;
      if (!variables.includes(variable)) {
        variables.push(variable);
      }
    }
    
    return variables;
  }
  
  /**
   * 获取卡片正面内容
   * @param card 卡片对象
   * @returns 正面内容字符串
   */
  private getCardFront(card: Card): string {
    // 尝试多种字段名称
    return card.fields?.front || 
           card.fields?.question || 
           card.fields?.prompt ||
           '';
  }
  
  /**
   * 获取卡片背面内容
   * @param card 卡片对象
   * @returns 背面内容字符串
   */
  private getCardBack(card: Card): string {
    // 尝试多种字段名称
    return card.fields?.back || 
           card.fields?.answer || 
           card.fields?.response ||
           '';
  }
  
  /**
   * 推断卡片类型
   * @param card 卡片对象
   * @returns 卡片类型描述
   */
  private getCardType(card: Card): string {
    // 基于字段和内容推断卡片类型
    if (card.fields?.choices || card.fields?.correctAnswer) {
      return '选择题';
    }
    
    const content = card.content || '';
    if (content.includes('==') || content.includes('{{c')) {
      return '挖空题';
    }
    
    return '问答题';
  }
}

