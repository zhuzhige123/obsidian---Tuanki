/**
 * 模板管理器
 * 负责统一管理和操作 ParseTemplate
 */

import type { ParseTemplate } from '../../types/newCardParsingTypes';
import type AnkiPlugin from '../../main';

export class TemplateManager {
  private plugin: AnkiPlugin;

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
  }

  /**
   * 保存模板到设置
   */
  async saveTemplate(template: ParseTemplate): Promise<void> {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) {
      throw new Error('SimplifiedParsing 设置未初始化');
    }

    // 检查是否已存在
    const existingIndex = settings.templates.findIndex(t => t.id === template.id);
    
    if (existingIndex >= 0) {
      // 更新现有模板
      settings.templates[existingIndex] = {
        ...template,
        updatedAt: new Date().toISOString()
      };
    } else {
      // 添加新模板
      settings.templates.push(template);
    }

    // 保存设置
    await this.plugin.saveSettings();
  }

  /**
   * 根据 Anki Model ID 查找模板
   */
  async getTemplateByAnkiModel(modelId: number): Promise<ParseTemplate | null> {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) return null;

    return settings.templates.find(template => 
      template.syncCapability?.ankiModelMapping?.modelId === modelId
    ) || null;
  }

  /**
   * 根据 Anki Model 名称查找模板
   */
  async getTemplateByAnkiModelName(modelName: string): Promise<ParseTemplate | null> {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) return null;

    return settings.templates.find(template => 
      template.syncCapability?.ankiModelMapping?.modelName === modelName
    ) || null;
  }

  /**
   * 根据模板 ID 获取模板
   */
  getTemplateById(templateId: string): ParseTemplate | null {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) return null;

    return settings.templates.find(t => t.id === templateId) || null;
  }

  /**
   * 转换模板为 Tuanki 专属
   */
  async convertToTuankiExclusive(templateId: string): Promise<ParseTemplate> {
    const template = this.getTemplateById(templateId);
    if (!template) {
      throw new Error(`找不到模板: ${templateId}`);
    }

    // 创建转换后的模板
    const convertedTemplate: ParseTemplate = {
      ...template,
      name: template.name.replace(/^\[来自Anki\]\s*/, ''), // 移除"来自Anki"前缀
      tuankiMetadata: {
        ...template.tuankiMetadata,
        signature: this.generateTuankiSignature(templateId),
        version: '1.0',
        ankiCompatible: false,
        source: 'user_custom', // 从 anki_imported 转为 user_custom
        createdInTuanki: false, // 保留原始来源
        editedInTuanki: true // 标记为已编辑
      },
      syncCapability: {
        supportsBidirectional: true, // 启用双向同步
        isTuankiExclusive: true,
        ankiModelMapping: template.syncCapability?.ankiModelMapping // 保留原始映射
      },
      updatedAt: new Date().toISOString()
    };

    // 保存更新后的模板
    await this.saveTemplate(convertedTemplate);

    return convertedTemplate;
  }

  /**
   * 删除模板
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) {
      throw new Error('SimplifiedParsing 设置未初始化');
    }

    const templateIndex = settings.templates.findIndex(t => t.id === templateId);
    if (templateIndex < 0) {
      throw new Error(`找不到模板: ${templateId}`);
    }

    // 检查是否为官方模板
    const template = settings.templates[templateIndex];
    if (template.isOfficial) {
      throw new Error('不能删除官方模板');
    }

    // 检查是否有卡片使用此模板
    const cardsUsingTemplate = await this.getCardsUsingTemplate(templateId);
    if (cardsUsingTemplate > 0) {
      throw new Error(`有 ${cardsUsingTemplate} 张卡片正在使用此模板，无法删除`);
    }

    // 删除模板
    settings.templates.splice(templateIndex, 1);
    await this.plugin.saveSettings();
  }

  /**
   * 按来源获取模板列表
   */
  getTemplatesBySource(
    source: 'official' | 'anki_imported' | 'tuanki_created' | 'user_custom'
  ): ParseTemplate[] {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) return [];

    return settings.templates.filter(template => {
      if (source === 'official') {
        return template.isOfficial === true;
      }
      return template.tuankiMetadata?.source === source;
    });
  }

  /**
   * 获取所有支持双向同步的模板
   */
  getBidirectionalTemplates(): ParseTemplate[] {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) return [];

    return settings.templates.filter(template => 
      template.syncCapability?.supportsBidirectional === true
    );
  }

  /**
   * 获取所有从 Anki 导入的模板
   */
  getAnkiImportedTemplates(): ParseTemplate[] {
    return this.getTemplatesBySource('anki_imported');
  }

  /**
   * 获取模板统计信息
   */
  getTemplateStatistics(): {
    total: number;
    official: number;
    ankiImported: number;
    tuankiCreated: number;
    userCustom: number;
    bidirectional: number;
  } {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) {
      return {
        total: 0,
        official: 0,
        ankiImported: 0,
        tuankiCreated: 0,
        userCustom: 0,
        bidirectional: 0
      };
    }

    const templates = settings.templates;

    return {
      total: templates.length,
      official: templates.filter(t => t.isOfficial).length,
      ankiImported: templates.filter(t => t.tuankiMetadata?.source === 'anki_imported').length,
      tuankiCreated: templates.filter(t => t.tuankiMetadata?.source === 'tuanki_created').length,
      userCustom: templates.filter(t => t.tuankiMetadata?.source === 'user_custom').length,
      bidirectional: templates.filter(t => t.syncCapability?.supportsBidirectional).length
    };
  }

  /**
   * 生成 Tuanki 签名
   */
  private generateTuankiSignature(templateId: string): string {
    return `tuanki-template-${templateId}-${Date.now()}`;
  }

  /**
   * 获取使用某模板的卡片数量
   */
  private async getCardsUsingTemplate(templateId: string): Promise<number> {
    const dataStorage = this.plugin.dataStorage;
    if (!dataStorage) return 0;

    try {
      const allCards = await dataStorage.getAllCards();
      return allCards.filter(card => card.template === templateId).length;
    } catch (error) {
      console.error('获取卡片数量失败:', error);
      return 0;
    }
  }

  /**
   * 批量保存模板
   */
  async saveMultipleTemplates(templates: ParseTemplate[]): Promise<void> {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) {
      throw new Error('SimplifiedParsing 设置未初始化');
    }

    for (const template of templates) {
      const existingIndex = settings.templates.findIndex(t => t.id === template.id);
      
      if (existingIndex >= 0) {
        settings.templates[existingIndex] = {
          ...template,
          updatedAt: new Date().toISOString()
        };
      } else {
        settings.templates.push(template);
      }
    }

    await this.plugin.saveSettings();
  }

  /**
   * 更新模板的 Anki 模型映射
   */
  async updateAnkiModelMapping(
    templateId: string,
    modelId: number,
    modelName: string
  ): Promise<void> {
    const template = this.getTemplateById(templateId);
    if (!template) {
      throw new Error(`找不到模板: ${templateId}`);
    }

    const updatedTemplate: ParseTemplate = {
      ...template,
      syncCapability: {
        ...template.syncCapability,
        supportsBidirectional: template.syncCapability?.supportsBidirectional ?? false,
        isTuankiExclusive: template.syncCapability?.isTuankiExclusive ?? false,
        ankiModelMapping: {
          modelId,
          modelName,
          lastSyncVersion: '1.0'
        }
      },
      updatedAt: new Date().toISOString()
    };

    await this.saveTemplate(updatedTemplate);
  }
}




