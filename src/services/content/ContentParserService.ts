/**
 * 内容解析服务
 * 负责在运行时从Card.content解析字段，实现单一数据源策略
 */

import type { Card } from '../../data/types';
import type { FieldTemplate } from '../../data/template-types';

interface FieldCache {
  fields: Record<string, string>;
  timestamp: number;
}

/**
 * 内容解析服务
 * 
 * 核心原则：
 * - Card.content 是唯一持久化的内容来源
 * - fields 在运行时动态解析，使用内存缓存提升性能
 * - 卡片修改后自动清除缓存
 */
export class ContentParserService {
  private fieldCache: Map<string, FieldCache>;
  private cacheExpiry = 5 * 60 * 1000; // 5分钟缓存过期
  private templateService: any; // 将在初始化时注入

  constructor() {
    this.fieldCache = new Map();
  }

  /**
   * 注入模板服务
   */
  setTemplateService(templateService: any): void {
    this.templateService = templateService;
  }

  /**
   * 从content解析字段（带缓存）
   * 
   * @param card - 卡片对象
   * @returns 解析后的字段对象
   */
  parseFields(card: Card): Record<string, string> {
    // 生成缓存键：卡片ID + 修改时间
    const cacheKey = `${card.id}:${card.modified}`;
    const cached = this.fieldCache.get(cacheKey);
    
    // 检查缓存
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return { ...cached.fields };
    }

    // 解析content
    const fields = this.parse(card.content, card.templateId);
    
    // 更新缓存
    this.fieldCache.set(cacheKey, {
      fields,
      timestamp: Date.now()
    });

    // 清理过期缓存
    this.cleanExpiredCache();

    return { ...fields };
  }

  /**
   * 从字段生成content
   * 
   * @param fields - 字段对象
   * @param templateId - 模板ID
   * @returns 生成的content字符串
   */
  generateContent(fields: Record<string, string>, templateId: string): string {
    // 获取模板
    const template = this.getTemplate(templateId);
    
    if (!template) {
      // 如果没有模板，使用默认格式
      return this.generateDefaultContent(fields);
    }

    // 根据模板规则生成content
    return this.generate(fields, template);
  }

  /**
   * 清除特定卡片的缓存
   * 
   * @param cardId - 卡片ID（可选）
   */
  clearCache(cardId?: string): void {
    if (cardId) {
      // 清除特定卡片的所有缓存
      for (const key of this.fieldCache.keys()) {
        if (key.startsWith(cardId + ':')) {
          this.fieldCache.delete(key);
        }
      }
    } else {
      // 清除所有缓存
      this.fieldCache.clear();
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; expiry: number } {
    return {
      size: this.fieldCache.size,
      expiry: this.cacheExpiry
    };
  }

  // ===== 私有方法 =====

  /**
   * 核心解析逻辑
   */
  private parse(content: string, templateId: string): Record<string, string> {
    if (!content) {
      return {};
    }

    const fields: Record<string, string> = {};
    
    // 支持 ---div--- 分隔符（Tuanki标准格式）
    if (content.includes('---div---')) {
      const parts = content.split('---div---').map(p => p.trim());
      
      if (parts.length >= 2) {
        // 基础双面卡片
        fields['front'] = parts[0];
        fields['back'] = parts[1];
        fields['question'] = parts[0];
        fields['answer'] = parts[1];
      }
    } else {
      // 单面或特殊格式
      // 尝试解析字段标记格式（**字段名**: 内容）
      const fieldPattern = /\*\*([^*]+)\*\*:\s*([^\n]+)/g;
      let match;
      
      while ((match = fieldPattern.exec(content)) !== null) {
        const fieldName = match[1].trim();
        const fieldValue = match[2].trim();
        fields[fieldName] = fieldValue;
      }
      
      // 如果没有解析到任何字段，将整个content作为单一字段
      if (Object.keys(fields).length === 0) {
        fields['content'] = content;
      }
    }

    return fields;
  }

  /**
   * 核心生成逻辑
   */
  private generate(fields: Record<string, string>, template: FieldTemplate): string {
    const front = fields['front'] || fields['question'] || '';
    const back = fields['back'] || fields['answer'] || '';
    
    if (front && back) {
      // 标准双面卡片格式
      return `${front}\n---div---\n${back}`;
    }
    
    // 单面或自定义格式
    return fields['content'] || '';
  }

  /**
   * 生成默认content格式
   */
  private generateDefaultContent(fields: Record<string, string>): string {
    const front = fields['front'] || fields['question'] || '';
    const back = fields['back'] || fields['answer'] || '';
    
    if (front && back) {
      return `${front}\n---div---\n${back}`;
    }
    
    return fields['content'] || Object.values(fields).join('\n');
  }

  /**
   * 获取模板（通过模板服务）
   */
  private getTemplate(templateId: string): FieldTemplate | null {
    if (!this.templateService) {
      console.warn('Template service not injected');
      return null;
    }

    try {
      return this.templateService.getTemplate(templateId);
    } catch (error) {
      console.error('Failed to get template:', error);
      return null;
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, cache] of this.fieldCache.entries()) {
      if (now - cache.timestamp > this.cacheExpiry) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.fieldCache.delete(key);
    }
  }
}

/**
 * 全局单例实例
 */
export const contentParser = new ContentParserService();



