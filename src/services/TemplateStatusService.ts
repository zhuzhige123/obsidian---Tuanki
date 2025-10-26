/**
 * 模板状态检测服务
 * 负责检测卡片模板的匹配状态和提供相关信息
 */

import type { Card } from '../data/types';
import type { ParseTemplate } from '../types/newCardParsingTypes';

/**
 * 模板匹配状态枚举
 */
export enum TemplateMatchStatus {
  PERFECT_MATCH = 'perfect_match',      // 完全匹配
  PARTIAL_MATCH = 'partial_match',      // 部分匹配  
  NOT_FOUND = 'not_found',              // 模板不存在
  SYSTEM_EXTERNAL = 'system_external',  // 外部系统模板
  DEPRECATED = 'deprecated'             // 已废弃模板
}

/**
 * 模板状态信息接口
 */
export interface TemplateStatusInfo {
  status: TemplateMatchStatus;
  currentTemplate: ParseTemplate | null;
  availableTemplates: ParseTemplate[];
  recommendedTemplate: ParseTemplate | null;
  warningMessage?: string;
  isSystemTemplate: boolean;
}

/**
 * 模板状态检测服务类
 */
export class TemplateStatusService {
  private templateCache = new Map<string, ParseTemplate>();
  private statusCache = new Map<string, TemplateStatusInfo>();

  /**
   * 检测卡片的模板状态
   */
  checkTemplateStatus(
    card: Card, 
    availableTemplates: ParseTemplate[]
  ): TemplateStatusInfo {
    const cacheKey = `${card.id}_${card.templateId}`;
    
    // 检查缓存
    if (this.statusCache.has(cacheKey)) {
      return this.statusCache.get(cacheKey)!;
    }

    const statusInfo = this.analyzeTemplateStatus(card, availableTemplates);
    
    // 缓存结果
    this.statusCache.set(cacheKey, statusInfo);
    
    return statusInfo;
  }

  /**
   * 分析模板状态
   */
  private analyzeTemplateStatus(
    card: Card, 
    availableTemplates: ParseTemplate[]
  ): TemplateStatusInfo {
    const currentTemplateId = card.templateId;
    
    // 查找当前模板
    const currentTemplate = availableTemplates.find(t => t.id === currentTemplateId);
    
    if (!currentTemplate) {
      return {
        status: TemplateMatchStatus.NOT_FOUND,
        currentTemplate: null,
        availableTemplates,
        recommendedTemplate: this.getRecommendedTemplate(card, availableTemplates),
        warningMessage: '当前卡片使用的模板不存在于插件模板系统中',
        isSystemTemplate: false
      };
    }

    // 检查是否为系统模板
    const isSystemTemplate = this.isSystemTemplate(currentTemplate);
    
    if (!isSystemTemplate) {
      return {
        status: TemplateMatchStatus.SYSTEM_EXTERNAL,
        currentTemplate,
        availableTemplates,
        recommendedTemplate: this.getRecommendedTemplate(card, availableTemplates),
        warningMessage: '当前模板不是插件模板系统中的标准模板',
        isSystemTemplate: false
      };
    }

    return {
      status: TemplateMatchStatus.PERFECT_MATCH,
      currentTemplate,
      availableTemplates,
      recommendedTemplate: null,
      isSystemTemplate: true
    };
  }

  /**
   * 判断是否为系统模板
   */
  private isSystemTemplate(template: ParseTemplate): boolean {
    // 检查是否为官方模板
    if (template.isOfficial) {
      return true;
    }

    // 检查是否为用户在插件中创建的模板
    if (template.createdAt && template.id.startsWith('template_')) {
      return true;
    }

    return false;
  }

  /**
   * 获取推荐模板
   */
  private getRecommendedTemplate(
    card: Card, 
    availableTemplates: ParseTemplate[]
  ): ParseTemplate | null {
    // 根据卡片类型推荐模板
    const cardType = card.type;
    
    // 优先推荐官方模板
    const officialTemplates = availableTemplates.filter(t => t.isOfficial);
    
    if (cardType === 'basic-qa') {
      return officialTemplates.find(t => t.id === 'official-qa') || officialTemplates[0] || null;
    }
    
    if (cardType === 'multiple-choice') {
      return officialTemplates.find(t => t.id === 'official-choice') || officialTemplates[0] || null;
    }
    
    if (cardType === 'cloze-deletion') {
      return officialTemplates.find(t => t.id === 'official-cloze') || officialTemplates[0] || null;
    }

    // 默认推荐第一个官方模板
    return officialTemplates[0] || availableTemplates[0] || null;
  }

  /**
   * 获取模板显示名称
   */
  getTemplateDisplayName(template: ParseTemplate | null): string {
    if (!template) return '未知模板';
    
    let displayName = template.name;
    
    if (template.isOfficial) {
      displayName += ' (官方)';
    }
    
    return displayName;
  }

  /**
   * 获取状态显示文本
   */
  getStatusDisplayText(status: TemplateMatchStatus): string {
    switch (status) {
      case TemplateMatchStatus.PERFECT_MATCH:
        return '模板匹配';
      case TemplateMatchStatus.PARTIAL_MATCH:
        return '部分匹配';
      case TemplateMatchStatus.NOT_FOUND:
        return '模板不存在';
      case TemplateMatchStatus.SYSTEM_EXTERNAL:
        return '外部模板';
      case TemplateMatchStatus.DEPRECATED:
        return '已废弃';
      default:
        return '未知状态';
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.templateCache.clear();
    this.statusCache.clear();
  }

  /**
   * 清除特定卡片的缓存
   */
  clearCardCache(cardId: string): void {
    const keysToDelete = Array.from(this.statusCache.keys())
      .filter(key => key.startsWith(`${cardId}_`));
    
    keysToDelete.forEach(key => this.statusCache.delete(key));
  }
}

// 导出单例实例
export const templateStatusService = new TemplateStatusService();
