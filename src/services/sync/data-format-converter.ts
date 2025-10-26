/**
 * 数据格式转换器
 * 根据处理策略选择不同的转换方法，优化数据转换性能
 */

import type { TuankiCard } from '../../data/card-types';
import type { TriadTemplate } from '../../data/template-types';
import type { ProcessingStrategy } from './data-processing-strategy';

// Anki 数据结构
export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  options?: {
    allowDuplicate?: boolean;
    duplicateScope?: string;
  };
  audio?: AnkiMedia[];
  video?: AnkiMedia[];
  picture?: AnkiMedia[];
}

export interface AnkiModel {
  modelName: string;
  inOrderFields: string[];
  css: string;
  cardTemplates: AnkiCardTemplate[];
}

export interface AnkiCardTemplate {
  Name: string;
  Front: string;
  Back: string;
}

export interface AnkiMedia {
  url: string;
  filename: string;
  skipHash?: string;
  fields: string[];
}

// 转换配置
export interface ConversionConfig {
  fieldMappings: Record<string, string>;
  formatRules: FormatRule[];
  mediaHandling: MediaHandlingConfig;
  validation: ValidationConfig;
}

export interface FormatRule {
  name: string;
  pattern: RegExp;
  replacement: string;
  description: string;
}

export interface MediaHandlingConfig {
  enabled: boolean;
  maxFileSize: number;
  allowedTypes: string[];
  compressionQuality: number;
}

export interface ValidationConfig {
  maxFieldLength: number;
  requiredFields: string[];
  sanitizeHtml: boolean;
  allowedHtmlTags: string[];
}

// 转换结果
export interface ConversionResult {
  success: boolean;
  data: AnkiNote | TuankiCard;
  warnings: string[];
  errors: string[];
  metadata: {
    strategy: string;
    processingTime: number;
    fieldsProcessed: number;
    mediaFiles: number;
  };
}

/**
 * 智能数据转换器
 */
export class IntelligentDataConverter {
  private formatRules: Map<string, FormatRule[]> = new Map();
  private conversionCache = new Map<string, ConversionResult>();

  constructor() {
    this.initializeFormatRules();
  }

  /**
   * 转换 Tuanki 卡片到 Anki 格式
   */
  async convertToAnki(
    card: TuankiCard,
    template: TriadTemplate,
    strategy: SyncStrategy,
    config?: Partial<ConversionConfig>
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(card, template, strategy);

    // 检查缓存
    if (this.conversionCache.has(cacheKey)) {
      const cached = this.conversionCache.get(cacheKey)!;
      return { ...cached, metadata: { ...cached.metadata, processingTime: Date.now() - startTime } };
    }

    try {
      let result: ConversionResult;

      // 根据策略选择转换方法
      switch (strategy.type) {
        case 'fast-field-only':
          result = await this.fastFieldConversion(card, template, config);
          break;
        case 'format-preserving':
          result = await this.formatPreservingConversion(card, template, config);
          break;
        case 'full-feature':
          result = await this.fullFeatureConversion(card, template, config);
          break;
        default:
          result = await this.formatPreservingConversion(card, template, config);
      }

      // 更新元数据
      result.metadata.strategy = strategy.type;
      result.metadata.processingTime = Date.now() - startTime;

      // 缓存结果
      this.conversionCache.set(cacheKey, result);

      return result;
    } catch (error) {
      return {
        success: false,
        data: {} as AnkiNote,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
        metadata: {
          strategy: strategy.type,
          processingTime: Date.now() - startTime,
          fieldsProcessed: 0,
          mediaFiles: 0
        }
      };
    }
  }

  /**
   * 转换 Anki 数据到 Tuanki 格式
   */
  async convertFromAnki(
    ankiNote: AnkiNote,
    template: TriadTemplate,
    strategy: SyncStrategy,
    config?: Partial<ConversionConfig>
  ): Promise<ConversionResult> {
    const startTime = Date.now();

    try {
      const tuankiCard: TuankiCard = {
        id: this.generateCardId(),
        uuid: this.generateUUID(),
        templateId: template.id,
        fields: {},
        tags: ankiNote.tags || [],
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      };

      const warnings: string[] = [];
      const errors: string[] = [];
      let fieldsProcessed = 0;
      let mediaFiles = 0;

      // 字段映射和转换
      const fieldMappings = this.generateFieldMappings(template, config);
      
      for (const [ankiField, tuankiField] of Object.entries(fieldMappings)) {
        if (ankiNote.fields[ankiField] !== undefined) {
          let fieldValue = ankiNote.fields[ankiField];

          // 根据策略应用不同的处理
          if (strategy.type === 'full-feature') {
            fieldValue = await this.processComplexField(fieldValue, template, tuankiField);
          } else if (strategy.type === 'format-preserving') {
            fieldValue = this.applyFormatRules(fieldValue, 'anki-to-tuanki');
          }
          // fast-field-only 直接使用原值

          tuankiCard.fields[tuankiField] = fieldValue;
          fieldsProcessed++;
        }
      }

      // 处理媒体文件
      if (strategy.type !== 'fast-field-only') {
        mediaFiles = await this.processMediaFiles(ankiNote, tuankiCard);
      }

      return {
        success: true,
        data: tuankiCard,
        warnings,
        errors,
        metadata: {
          strategy: strategy.type,
          processingTime: Date.now() - startTime,
          fieldsProcessed,
          mediaFiles
        }
      };
    } catch (error) {
      return {
        success: false,
        data: {} as TuankiCard,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
        metadata: {
          strategy: strategy.type,
          processingTime: Date.now() - startTime,
          fieldsProcessed: 0,
          mediaFiles: 0
        }
      };
    }
  }

  /**
   * 生成 Anki 模型配置
   */
  generateAnkiModel(template: TriadTemplate): AnkiModel {
    const fieldNames = template.fieldTemplate.fields
      .filter(f => f.type === 'field')
      .map(f => f.key);

    return {
      modelName: `Tuanki-${template.name}`,
      inOrderFields: [...fieldNames, 'TuankiUUID', 'TuankiTemplate'],
      css: this.generateModelCSS(template),
      cardTemplates: this.generateCardTemplates(template)
    };
  }

  // 私有方法

  /**
   * 快速字段转换（仅字段映射）
   */
  private async fastFieldConversion(
    card: TuankiCard,
    template: TriadTemplate,
    config?: Partial<ConversionConfig>
  ): Promise<ConversionResult> {
    const ankiNote: AnkiNote = {
      deckName: this.getDeckName(card),
      modelName: `Tuanki-${template.name}`,
      fields: {},
      tags: card.tags || []
    };

    const warnings: string[] = [];
    const fieldMappings = this.generateFieldMappings(template, config);
    let fieldsProcessed = 0;

    // 直接字段映射
    for (const [tuankiField, ankiField] of Object.entries(fieldMappings)) {
      if (card.fields[tuankiField] !== undefined) {
        ankiNote.fields[ankiField] = card.fields[tuankiField];
        fieldsProcessed++;
      }
    }

    // 添加元数据
    ankiNote.fields['TuankiUUID'] = card.uuid;
    ankiNote.fields['TuankiTemplate'] = template.id;

    return {
      success: true,
      data: ankiNote,
      warnings,
      errors: [],
      metadata: {
        strategy: 'fast-field-only',
        processingTime: 0,
        fieldsProcessed,
        mediaFiles: 0
      }
    };
  }

  /**
   * 格式保持转换
   */
  private async formatPreservingConversion(
    card: TuankiCard,
    template: TriadTemplate,
    config?: Partial<ConversionConfig>
  ): Promise<ConversionResult> {
    const result = await this.fastFieldConversion(card, template, config);
    const ankiNote = result.data as AnkiNote;
    const warnings = [...result.warnings];

    // 应用格式转换规则
    for (const [field, value] of Object.entries(ankiNote.fields)) {
      if (this.needsFormatConversion(value)) {
        const converted = this.applyFormatRules(value, 'tuanki-to-anki');
        if (converted !== value) {
          ankiNote.fields[field] = converted;
          warnings.push(`字段 ${field} 应用了格式转换`);
        }
      }
    }

    return {
      ...result,
      data: ankiNote,
      warnings
    };
  }

  /**
   * 完整功能转换
   */
  private async fullFeatureConversion(
    card: TuankiCard,
    template: TriadTemplate,
    config?: Partial<ConversionConfig>
  ): Promise<ConversionResult> {
    const result = await this.formatPreservingConversion(card, template, config);
    const ankiNote = result.data as AnkiNote;
    const warnings = [...result.warnings];
    let mediaFiles = 0;

    // 使用完整的三位一体模板系统
    if (template.markdownTemplate) {
      const generatedContent = await this.generateWithMarkdownTemplate(card.fields, template);
      if (generatedContent) {
        // 将生成的内容分配到适当的字段
        const primaryField = this.getPrimaryField(template);
        if (primaryField) {
          ankiNote.fields[primaryField] = generatedContent;
          warnings.push(`使用 Markdown 模板生成了 ${primaryField} 字段内容`);
        }
      }
    }

    // 处理媒体文件
    mediaFiles = await this.processMediaFiles(card, ankiNote);

    // 应用高级转换规则
    await this.applyAdvancedTransformations(ankiNote, template, card);

    return {
      ...result,
      data: ankiNote,
      warnings,
      metadata: {
        ...result.metadata,
        mediaFiles
      }
    };
  }

  /**
   * 生成字段映射
   */
  private generateFieldMappings(
    template: TriadTemplate,
    config?: Partial<ConversionConfig>
  ): Record<string, string> {
    if (config?.fieldMappings) {
      return config.fieldMappings;
    }

    // 默认映射策略
    const mappings: Record<string, string> = {};
    const fields = template.fieldTemplate.fields.filter(f => f.type === 'field');

    for (const field of fields) {
      // 智能映射：尝试找到最佳的 Anki 字段名
      mappings[field.key] = this.findBestAnkiFieldName(field.key);
    }

    return mappings;
  }

  /**
   * 查找最佳 Anki 字段名
   */
  private findBestAnkiFieldName(tuankiFieldKey: string): string {
    const mappingRules = new Map([
      ['question', 'Front'],
      ['answer', 'Back'],
      ['front', 'Front'],
      ['back', 'Back'],
      ['note', 'Extra'],
      ['example', 'Example'],
      ['hint', 'Hint']
    ]);

    const lowerKey = tuankiFieldKey.toLowerCase();
    
    // 精确匹配
    if (mappingRules.has(lowerKey)) {
      return mappingRules.get(lowerKey)!;
    }

    // 模糊匹配
    for (const [pattern, ankiField] of mappingRules) {
      if (lowerKey.includes(pattern) || pattern.includes(lowerKey)) {
        return ankiField;
      }
    }

    // 默认使用首字母大写的字段名
    return tuankiFieldKey.charAt(0).toUpperCase() + tuankiFieldKey.slice(1);
  }

  /**
   * 应用格式转换规则
   */
  private applyFormatRules(content: string, direction: 'tuanki-to-anki' | 'anki-to-tuanki'): string {
    const rules = this.formatRules.get(direction) || [];
    let result = content;

    for (const rule of rules) {
      result = result.replace(rule.pattern, rule.replacement);
    }

    return result;
  }

  /**
   * 检查是否需要格式转换
   */
  private needsFormatConversion(content: string): boolean {
    // 检查是否包含需要转换的格式
    return /(\[.*\]\(.*\)|!\[.*\]\(.*\)|```|#{1,6}|\*\*.*\*\*|\*.*\*|<[^>]+>)/.test(content);
  }

  /**
   * 使用 Markdown 模板生成内容
   */
  private async generateWithMarkdownTemplate(
    fields: Record<string, string>,
    template: TriadTemplate
  ): Promise<string | null> {
    if (!template.markdownTemplate) return null;

    let content = template.markdownTemplate.markdownContent;

    // 替换字段占位符
    for (const [fieldKey, placeholder] of Object.entries(template.markdownTemplate.fieldPlaceholders)) {
      const value = fields[fieldKey] || '';
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      content = content.replace(new RegExp(escapedPlaceholder, 'g'), value);
    }

    return content;
  }

  /**
   * 处理媒体文件
   */
  private async processMediaFiles(source: any, target: any): Promise<number> {
    // 模拟媒体文件处理
    let mediaCount = 0;

    // 这里应该实现实际的媒体文件处理逻辑
    // 包括文件上传、格式转换、压缩等

    return mediaCount;
  }

  /**
   * 应用高级转换规则
   */
  private async applyAdvancedTransformations(
    ankiNote: AnkiNote,
    template: TriadTemplate,
    card: TuankiCard
  ): Promise<void> {
    // 实现高级转换逻辑
    // 例如：公式转换、代码高亮、图表处理等
  }

  /**
   * 生成模型CSS
   */
  private generateModelCSS(template: TriadTemplate): string {
    return `
.card {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  background-color: #fff;
  padding: 20px;
}

.tuanki-field {
  margin-bottom: 15px;
}

.tuanki-question {
  font-weight: bold;
  color: #2c3e50;
}

.tuanki-answer {
  color: #34495e;
}

.tuanki-example {
  background-color: #f8f9fa;
  padding: 10px;
  border-left: 4px solid #007bff;
  margin: 10px 0;
}

code {
  background-color: #f1f3f4;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Monaco', 'Consolas', monospace;
}

pre {
  background-color: #f8f9fa;
  padding: 15px;
  border-radius: 5px;
  overflow-x: auto;
}
    `.trim();
  }

  /**
   * 生成卡片模板
   */
  private generateCardTemplates(template: TriadTemplate): AnkiCardTemplate[] {
    const frontTemplate = this.convertToAnkiTemplate(template.fieldTemplate.frontTemplate || '{{Front}}');
    const backTemplate = this.convertToAnkiTemplate(template.fieldTemplate.backTemplate || '{{FrontSide}}<hr>{{Back}}');

    return [
      {
        Name: 'Card 1',
        Front: frontTemplate,
        Back: backTemplate
      }
    ];
  }

  /**
   * 转换为 Anki 模板语法
   */
  private convertToAnkiTemplate(htmlTemplate: string): string {
    return htmlTemplate
      .replace(/\{\{(\w+)\}\}/g, '{{$1}}') // 保持字段引用
      .replace(/class="tuanki-/g, 'class="anki-tuanki-') // 添加样式前缀
      .replace(/<tuanki-/g, '<div class="tuanki-') // 转换自定义标签
      .replace(/<\/tuanki-/g, '</div>'); // 转换自定义标签结束
  }

  /**
   * 专门用于 AnkiConnect 的转换方法
   * 优化批量操作和网络传输
   */
  async convertToAnkiConnect(
    card: TuankiCard,
    template: TriadTemplate,
    deckName: string,
    config?: Partial<ConversionConfig>
  ): Promise<ConversionResult> {
    const startTime = Date.now();

    try {
      // 使用快速字段转换策略，适合 AnkiConnect 批量操作
      const strategy: SyncStrategy = {
        type: 'fast-field-only',
        batchThreshold: 50,
        enableCaching: true,
        compressionLevel: 'medium'
      };

      const result = await this.convertToAnki(card, template, strategy, config);

      if (result.success) {
        // 为 AnkiConnect 优化数据结构
        const ankiNote = result.data as AnkiNote;
        ankiNote.deckName = deckName;

        // 确保字段格式符合 AnkiConnect 要求
        ankiNote.fields = this.optimizeFieldsForAnkiConnect(ankiNote.fields);

        // 添加 AnkiConnect 特定选项
        ankiNote.options = {
          allowDuplicate: false,
          duplicateScope: 'deck',
          ...ankiNote.options
        };

        // 优化标签格式
        ankiNote.tags = this.optimizeTagsForAnkiConnect(ankiNote.tags);
      }

      result.metadata.processingTime = Date.now() - startTime;
      result.metadata.optimizedForAnkiConnect = true;

      return result;

    } catch (error) {
      return {
        success: false,
        data: {} as AnkiNote,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
        metadata: {
          strategy: 'fast-field-only',
          processingTime: Date.now() - startTime,
          optimizedForAnkiConnect: true
        }
      };
    }
  }

  /**
   * 优化字段格式以适配 AnkiConnect
   */
  private optimizeFieldsForAnkiConnect(fields: Record<string, string>): Record<string, string> {
    const optimized: Record<string, string> = {};

    for (const [key, value] of Object.entries(fields)) {
      // 清理字段值，移除可能导致 AnkiConnect 错误的内容
      let cleanValue = value
        .replace(/\r\n/g, '\n') // 统一换行符
        .replace(/\r/g, '\n')
        .trim();

      // 转义特殊字符
      cleanValue = cleanValue
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      // 确保字段名符合 Anki 要求
      const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_');

      optimized[cleanKey] = cleanValue;
    }

    return optimized;
  }

  /**
   * 优化标签格式以适配 AnkiConnect
   */
  private optimizeTagsForAnkiConnect(tags: string[]): string[] {
    return tags
      .filter(tag => tag && tag.trim().length > 0)
      .map(tag => tag
        .trim()
        .replace(/\s+/g, '_') // 替换空格为下划线
        .replace(/[^a-zA-Z0-9_\-]/g, '') // 移除特殊字符
        .toLowerCase()
      )
      .filter(tag => tag.length > 0)
      .slice(0, 20); // 限制标签数量
  }

  /**
   * 初始化格式转换规则
   */
  private initializeFormatRules(): void {
    // Tuanki 到 Anki 的转换规则
    this.formatRules.set('tuanki-to-anki', [
      {
        name: 'markdown-bold',
        pattern: /\*\*(.*?)\*\*/g,
        replacement: '<b>$1</b>',
        description: 'Markdown 粗体转 HTML'
      },
      {
        name: 'markdown-italic',
        pattern: /\*(.*?)\*/g,
        replacement: '<i>$1</i>',
        description: 'Markdown 斜体转 HTML'
      },
      {
        name: 'markdown-code',
        pattern: /`(.*?)`/g,
        replacement: '<code>$1</code>',
        description: 'Markdown 代码转 HTML'
      }
    ]);

    // Anki 到 Tuanki 的转换规则
    this.formatRules.set('anki-to-tuanki', [
      {
        name: 'html-bold',
        pattern: /<b>(.*?)<\/b>/g,
        replacement: '**$1**',
        description: 'HTML 粗体转 Markdown'
      },
      {
        name: 'html-italic',
        pattern: /<i>(.*?)<\/i>/g,
        replacement: '*$1*',
        description: 'HTML 斜体转 Markdown'
      },
      {
        name: 'html-code',
        pattern: /<code>(.*?)<\/code>/g,
        replacement: '`$1`',
        description: 'HTML 代码转 Markdown'
      }
    ]);
  }

  // 🔄 重构：使用统一ID生成系统
  private generateCacheKey(card: TuankiCard, template: TriadTemplate, strategy: SyncStrategy): string {
    const { generateCacheKey } = require('../../utils/unified-id-generator');
    return generateCacheKey('sync', card.id, template.id, strategy.type);
  }

  private generateCardId(): string {
    const { generateCardID } = require('../../utils/unified-id-generator');
    return generateCardID();
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private getDeckName(card: TuankiCard): string {
    return 'Tuanki'; // 默认牌组名
  }

  private getPrimaryField(template: TriadTemplate): string | null {
    const fields = template.fieldTemplate.fields.filter(f => f.type === 'field');
    return fields.length > 0 ? this.findBestAnkiFieldName(fields[0].key) : null;
  }

  private processComplexField(fieldValue: string, template: TriadTemplate, fieldKey: string): string {
    // 实现复杂字段处理逻辑
    return fieldValue;
  }
}
