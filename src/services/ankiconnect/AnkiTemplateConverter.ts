/**
 * Anki 模板转换器
 * 负责将 AnkiModelInfo 转换为 Tuanki 的 ParseTemplate
 */

import type { AnkiModelInfo } from '../../types/ankiconnect-types';
import type { ParseTemplate, TemplateField } from '../../types/newCardParsingTypes';
import type AnkiPlugin from '../../main';

export interface ConversionResult {
  template: ParseTemplate;
  warnings: string[];
}

export class AnkiTemplateConverter {
  private plugin: AnkiPlugin;

  // 字段类型推断规则
  private readonly FIELD_TYPE_PATTERNS = {
    question: ['front', 'question', '问题', 'q', 'prompt', '题目'],
    answer: ['back', 'answer', '答案', 'a', 'response', '回答'],
    tags: ['tags', '标签', 'tag'],
    extra: ['extra', 'note', 'remark', '备注', '注释', 'additional'],
    cloze: ['text', 'content', '内容', '正文']
  };

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
  }

  /**
   * 将 AnkiModelInfo 转换为 ParseTemplate
   */
  convertModelToTemplate(ankiModel: AnkiModelInfo): ConversionResult {
    const warnings: string[] = [];

    // 生成模板 ID
    const templateId = this.generateTemplateId(ankiModel.id);

    // 推断字段类型
    const fields = this.inferFieldTypes(ankiModel.fields);

    // 检测卡片类型
    const cardType = this.detectCardType(ankiModel.fields, ankiModel.templates);

    // 转换 HTML 模板（如果需要）
    const templateHtml = ankiModel.templates?.[0];
    if (templateHtml && (templateHtml.Front || templateHtml.Back)) {
      // 记录警告：HTML 模板可能无法完全转换
      warnings.push('Anki 模板包含 HTML 格式，可能需要手动调整');
    }

    const template: ParseTemplate = {
      id: templateId,
      name: `[来自Anki] ${ankiModel.name}`,
      description: `从 Anki 导入的模板：${ankiModel.name}`,
      type: 'single-field',
      cardType: cardType,
      fields: fields,
      regex: '',
      scenarios: ['newCard', 'study', 'edit'],
      isOfficial: false,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // 标记为从 Anki 导入
      tuankiMetadata: {
        signature: '',
        version: '1.0',
        ankiCompatible: true,
        source: 'anki_imported',
        createdInTuanki: false,
        editedInTuanki: false
      },
      
      // 不支持双向同步（初始状态）
      syncCapability: {
        supportsBidirectional: false,
        isTuankiExclusive: false,
        ankiModelMapping: {
          modelId: ankiModel.id,
          modelName: ankiModel.name,
          lastSyncVersion: '1.0'
        }
      }
    };

    return { template, warnings };
  }

  /**
   * 推断字段类型
   */
  inferFieldTypes(fields: string[]): TemplateField[] {
    const templateFields: TemplateField[] = [];

    for (const fieldName of fields) {
      const normalizedName = fieldName.toLowerCase().trim();
      let fieldType: string | null = null;
      
      // 尝试匹配字段类型
      for (const [type, patterns] of Object.entries(this.FIELD_TYPE_PATTERNS)) {
        if (patterns.some(pattern => normalizedName.includes(pattern))) {
          fieldType = type;
          break;
        }
      }

      // 如果无法推断，标记为自定义类型
      if (!fieldType) {
        fieldType = 'custom';
      }

      templateFields.push({
        name: fieldType === 'custom' ? fieldName : fieldType,
        pattern: fieldName,
        isRegex: false,
        required: fieldType === 'question' || fieldType === 'answer',
        description: `Anki 字段: ${fieldName}`
      });
    }

    return templateFields;
  }

  /**
   * 检测卡片类型
   */
  private detectCardType(
    fields: string[],
    templates?: Array<{ Name: string; Front: string; Back: string }>
  ): 'basic-qa' | 'multiple-choice' | 'cloze-deletion' | 'other' {
    const fieldNames = fields.map(f => f.toLowerCase());

    // 检查是否为挖空卡片
    if (fieldNames.some(name => name.includes('text') || name.includes('内容'))) {
      if (templates?.[0]?.Front?.includes('{{c') || templates?.[0]?.Back?.includes('{{c')) {
        return 'cloze-deletion';
      }
    }

    // 检查是否为选择题
    if (fieldNames.some(name => 
      name.includes('choice') || 
      name.includes('option') || 
      name.includes('选项')
    )) {
      return 'multiple-choice';
    }

    // 检查是否为基础问答
    const hasQuestion = fieldNames.some(name => 
      this.FIELD_TYPE_PATTERNS.question.some(p => name.includes(p))
    );
    const hasAnswer = fieldNames.some(name => 
      this.FIELD_TYPE_PATTERNS.answer.some(p => name.includes(p))
    );

    if (hasQuestion && hasAnswer) {
      return 'basic-qa';
    }

    return 'other';
  }

  /**
   * 转换 HTML 为 Markdown（简化版）
   */
  convertHtmlToMarkdown(html: string): string {
    if (!html) return '';

    let markdown = html;

    // 基础 HTML 标签转换
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    markdown = markdown.replace(/<\/p>/gi, '\n\n');
    markdown = markdown.replace(/<p[^>]*>/gi, '');
    markdown = markdown.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<i>(.*?)<\/i>/gi, '*$1*');
    markdown = markdown.replace(/<em>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<u>(.*?)<\/u>/gi, '==$1==');
    markdown = markdown.replace(/<code>(.*?)<\/code>/gi, '`$1`');
    
    // 移除其他 HTML 标签，但保留内容
    markdown = markdown.replace(/<[^>]+>/g, '');
    
    // 清理多余的空白
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    markdown = markdown.trim();

    return markdown;
  }

  /**
   * 生成模板 ID
   */
  generateTemplateId(ankiModelId: number): string {
    return `anki-${ankiModelId}-${Date.now()}`;
  }

  /**
   * 批量转换多个模板
   */
  convertMultipleModels(ankiModels: AnkiModelInfo[]): Map<string, ConversionResult> {
    const results = new Map<string, ConversionResult>();
    
    for (const model of ankiModels) {
      try {
        const result = this.convertModelToTemplate(model);
        results.set(model.name, result);
      } catch (error) {
        console.error(`转换模板 ${model.name} 失败:`, error);
        // 继续处理其他模板
      }
    }

    return results;
  }

  /**
   * 检查模板是否已经导入
   */
  isTemplateAlreadyImported(ankiModelId: number): boolean {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings?.templates) return false;

    return settings.templates.some(template => 
      template.syncCapability?.ankiModelMapping?.modelId === ankiModelId
    );
  }

  /**
   * 根据 Anki Model ID 查找已导入的模板
   */
  findImportedTemplate(ankiModelId: number): ParseTemplate | null {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings?.templates) return null;

    return settings.templates.find(template => 
      template.syncCapability?.ankiModelMapping?.modelId === ankiModelId
    ) || null;
  }
}




