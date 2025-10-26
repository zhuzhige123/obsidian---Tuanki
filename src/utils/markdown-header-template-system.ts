import type { TriadTemplate, FieldTemplate, MarkdownTemplate } from '../data/template-types';
import { generateId } from './helpers';

/**
 * Markdown标题模板系统
 * 将Mustache语法模板转换为清晰的Markdown标题结构
 */

/**
 * Markdown标题模板配置
 */
export interface MarkdownHeaderTemplateConfig {
  // 字段映射：字段key -> 标题名称
  fieldHeaders: Record<string, string>;
  // 元数据字段
  includeTemplateId: boolean;
  includeTemplateName: boolean;
  // 自定义标题映射
  customHeaders?: Record<string, string>;
}

/**
 * 字段映射结果
 */
export interface FieldMappingResult {
  // 映射后的字段数据
  fields: Record<string, string>;
  // 映射统计
  stats: {
    mapped: number;
    created: number;
    merged: number;
    skipped: number;
  };
  // 映射详情
  mappings: FieldMappingDetail[];
  // 警告信息
  warnings: string[];
}

/**
 * 字段映射详情
 */
export interface FieldMappingDetail {
  sourceField: string;
  targetField: string;
  action: 'mapped' | 'created' | 'merged' | 'skipped';
  reason?: string;
}

/**
 * 内容解析结果
 */
export interface ContentParseResult {
  success: boolean;
  fields?: Record<string, string>;
  templateId?: string;
  templateName?: string;
  error?: string;
  warnings?: string[];
}

/**
 * 内容生成结果
 */
export interface ContentGenerationResult {
  success: boolean;
  content?: string;
  error?: string;
  warnings?: string[];
}

/**
 * Markdown标题模板系统核心类
 */
export class MarkdownHeaderTemplateSystem {
  
  /**
   * 将Mustache模板转换为Markdown标题格式
   */
  static convertMustacheToMarkdownHeaders(
    mustacheContent: string,
    fieldTemplate: FieldTemplate,
    config?: Partial<MarkdownHeaderTemplateConfig>
  ): MarkdownTemplate {
    const defaultConfig: MarkdownHeaderTemplateConfig = {
      fieldHeaders: {},
      includeTemplateId: true,
      includeTemplateName: true,
      ...config
    };

    // 提取字段信息
    const fields = fieldTemplate.fields.filter(f => f.type === 'field') as any[];
    
    // 生成字段标题映射
    const fieldHeaders = this.generateFieldHeaders(fields, defaultConfig);
    
    // 生成Markdown标题内容
    const markdownContent = this.generateMarkdownHeaderContent(fields, fieldHeaders, defaultConfig);
    
    // 生成字段占位符映射
    const fieldPlaceholders = this.generateFieldPlaceholders(fields);

    return {
      id: generateId(),
      name: `${fieldTemplate.name} - 标题模板`,
      description: '基于Markdown标题结构的模板',
      fieldTemplateId: fieldTemplate.id,
      markdownContent,
      fieldPlaceholders,
      isOfficial: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 从字段生成Markdown标题内容（纯净格式）
   */
  static generateContentFromFields(
    fields: Record<string, string>,
    template: TriadTemplate
  ): ContentGenerationResult {
    try {
      let content = '';

      // 获取模板字段定义
      const templateFields = template.fieldTemplate.fields.filter(f => f.type === 'field') as any[];

      // 生成字段内容（如果字段有值则显示，否则留空）
      templateFields.forEach(field => {
        const fieldValue = fields[field.key] || '';
        const headerName = this.getFieldHeaderName(field);

        // 只显示标题和实际内容，不添加示例文本
        content += `!${headerName}\n\n${fieldValue}\n\n`;
      });

      // 🔥 移除元数据字段 - 用户编辑的Markdown字段模板不应包含TemplateId和TemplateName
      // 这些元数据由系统内部管理，不需要在用户界面中显示

      return {
        success: true,
        content: content.trim()
      };
    } catch (error) {
      return {
        success: false,
        error: `内容生成失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 解析Markdown标题内容到字段
   */
  static parseContentToFields(content: string): ContentParseResult {
    try {
      const fields: Record<string, string> = {};
      let templateId: string | undefined;
      let templateName: string | undefined;
      const warnings: string[] = [];

      // 🚫 已弃用：旧的"!字段名"解析已被简化解析系统替代
      console.warn('[MarkdownHeaderTemplateSystem] 旧的"!字段名"解析已弃用，请使用简化解析系统');

      // ✅ 使用当前简化解析格式
      const parts = content.split('---div---');
      if (parts.length >= 2) {
        fields['front'] = parts[0].trim();
        fields['back'] = parts[1].trim();

        // 提取标签作为额外字段
        const tagMatches = content.match(/#\w+/g);
        if (tagMatches) {
          fields['tags'] = tagMatches.join(' ');
        }
      } else {
        // 单字段内容
        fields['content'] = content.trim();
      }

      return {
        success: true,
        fields,
        templateId,
        templateName,
        warnings
      };
    } catch (error) {
      return {
        success: false,
        error: `内容解析失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 智能字段映射
   */
  static mapFieldsToNewTemplate(
    sourceFields: Record<string, string>,
    sourceTemplate: TriadTemplate,
    targetTemplate: TriadTemplate
  ): FieldMappingResult {
    const result: FieldMappingResult = {
      fields: {},
      stats: { mapped: 0, created: 0, merged: 0, skipped: 0 },
      mappings: [],
      warnings: []
    };

    const sourceFieldDefs = sourceTemplate.fieldTemplate.fields.filter(f => f.type === 'field') as any[];
    const targetFieldDefs = targetTemplate.fieldTemplate.fields.filter(f => f.type === 'field') as any[];

    // 创建字段映射表
    const mappingTable = this.createFieldMappingTable(sourceFieldDefs, targetFieldDefs);

    // 执行字段映射
    Object.entries(sourceFields).forEach(([sourceKey, value]) => {
      if (sourceKey === 'templateId' || sourceKey === 'templateName') {
        // 跳过元数据字段
        return;
      }

      const mapping = mappingTable.get(sourceKey);
      if (mapping) {
        if (Array.isArray(mapping)) {
          // 一对多映射：分割内容
          mapping.forEach((targetKey, index) => {
            const splitContent = this.splitContent(value, mapping.length);
            result.fields[targetKey] = splitContent[index] || '';
            result.mappings.push({
              sourceField: sourceKey,
              targetField: targetKey,
              action: 'mapped'
            });
          });
          result.stats.mapped++;
        } else {
          // 一对一映射
          if (result.fields[mapping]) {
            // 目标字段已存在，合并内容
            result.fields[mapping] += '\n\n' + value;
            result.stats.merged++;
            result.mappings.push({
              sourceField: sourceKey,
              targetField: mapping,
              action: 'merged'
            });
          } else {
            result.fields[mapping] = value;
            result.stats.mapped++;
            result.mappings.push({
              sourceField: sourceKey,
              targetField: mapping,
              action: 'mapped'
            });
          }
        }
      } else {
        // 没有找到映射，尝试创建新字段
        const newFieldKey = this.createCompatibleFieldKey(sourceKey, targetFieldDefs);
        result.fields[newFieldKey] = value;
        result.stats.created++;
        result.mappings.push({
          sourceField: sourceKey,
          targetField: newFieldKey,
          action: 'created',
          reason: '未找到匹配字段，创建新字段'
        });
        result.warnings.push(`字段 "${sourceKey}" 未找到匹配，已创建为 "${newFieldKey}"`);
      }
    });

    // 设置目标模板的元数据
    result.fields.templateId = targetTemplate.id;
    result.fields.templateName = targetTemplate.name;

    return result;
  }

  /**
   * 生成字段标题映射
   */
  private static generateFieldHeaders(
    fields: any[],
    config: MarkdownHeaderTemplateConfig
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    
    fields.forEach(field => {
      if (config.customHeaders?.[field.key]) {
        headers[field.key] = config.customHeaders[field.key];
      } else if (config.fieldHeaders[field.key]) {
        headers[field.key] = config.fieldHeaders[field.key];
      } else {
        // 使用字段名称作为标题
        headers[field.key] = field.name || this.fieldKeyToHeaderName(field.key);
      }
    });
    
    return headers;
  }

  /**
   * 生成Markdown标题内容模板（纯净格式，无示例内容）
   */
  private static generateMarkdownHeaderContent(
    fields: any[],
    fieldHeaders: Record<string, string>,
    config: MarkdownHeaderTemplateConfig
  ): string {
    let content = '';

    // 生成字段标题（仅标题，无内容）
    fields.forEach(field => {
      const headerName = fieldHeaders[field.key];
      content += `# ${headerName}\n\n\n\n`;
    });

    // 添加元数据标题（仅标题，无内容）
    if (config.includeTemplateId) {
      content += `# TemplateId\n\n\n\n`;
    }

    if (config.includeTemplateName) {
      content += `# TemplateName\n\n\n\n`;
    }

    return content.trim();
  }

  /**
   * 生成字段占位符映射
   */
  private static generateFieldPlaceholders(fields: any[]): Record<string, string> {
    const placeholders: Record<string, string> = {};
    
    fields.forEach(field => {
      placeholders[field.key] = `{{${field.key}}}`;
    });
    
    return placeholders;
  }

  /**
   * 获取字段标题名称
   */
  private static getFieldHeaderName(field: any): string {
    return field.name || this.fieldKeyToHeaderName(field.key);
  }

  /**
   * 字段key转换为标题名称
   * 注意：此方法已废弃，仅保留用于兼容性
   * @deprecated 请使用新的SimplifiedParsingSettings系统
   */
  private static fieldKeyToHeaderName(fieldKey: string): string {
    // 🚨 已废弃：旧版三位一体模板系统的字段映射
    // 现在使用SimplifiedParsingSettings系统，不再使用!字段名格式
    console.warn('[DEPRECATED] fieldKeyToHeaderName方法已废弃，请使用新的解析系统');

    // 返回简单的字段名，不再使用!前缀
    return fieldKey;
  }

  /**
   * 标题名称转换为字段key
   * @deprecated 此方法已废弃，请使用新的SimplifiedParsingSettings系统
   */
  private static headerNameToFieldKey(headerName: string): string {
    console.warn('[DEPRECATED] headerNameToFieldKey方法已废弃，请使用新的解析系统');

    // 简单返回原标题名，不再进行复杂映射
    return headerName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  /**
   * 创建字段映射表
   */
  private static createFieldMappingTable(
    sourceFields: any[],
    targetFields: any[]
  ): Map<string, string | string[]> {
    const mappingTable = new Map<string, string | string[]>();

    // 精确匹配
    sourceFields.forEach(sourceField => {
      const exactMatch = targetFields.find(targetField =>
        targetField.key === sourceField.key
      );
      if (exactMatch) {
        mappingTable.set(sourceField.key, exactMatch.key);
        return;
      }

      // 语义匹配
      const semanticMatch = this.findSemanticMatch(sourceField, targetFields);
      if (semanticMatch) {
        mappingTable.set(sourceField.key, semanticMatch.key);
        return;
      }

      // 名称匹配
      const nameMatch = targetFields.find(targetField =>
        targetField.name === sourceField.name
      );
      if (nameMatch) {
        mappingTable.set(sourceField.key, nameMatch.key);
      }
    });

    return mappingTable;
  }

  /**
   * 查找语义匹配的字段
   */
  private static findSemanticMatch(sourceField: any, targetFields: any[]): any | null {
    // 扩展的语义分组，支持更多字段类型
    const semanticGroups = {
      question: [
        'question', 'front', 'title', 'prompt', 'query', 'problem',
        'stem', 'text', '问题', '题干', '题目', '正面'
      ],
      answer: [
        'answer', 'back', 'content', 'response', 'solution', 'result',
        '答案', '背面', '内容', '解答', '结果'
      ],
      explanation: [
        'explanation', 'note', 'comment', 'remark', 'analysis', 'reasoning',
        'rationale', 'detail', '解析', '说明', '注释', '分析', '详解'
      ],
      options: [
        'options', 'choices', 'alternatives', 'selections',
        '选项', '选择', '备选项'
      ],
      correct_answer: [
        'correct_answer', 'correct', 'solution', 'right_answer', 'key',
        '正确答案', '标准答案', '答案'
      ],
      hint: [
        'hint', 'clue', 'tip', 'suggestion',
        '提示', '线索', '小贴士'
      ],
      example: [
        'example', 'sample', 'demo', 'illustration', 'case',
        '示例', '例子', '案例', '演示'
      ],
      tags: [
        'tags', 'labels', 'categories', 'keywords',
        '标签', '分类', '关键词'
      ],
      difficulty: [
        'difficulty', 'level', 'grade', 'complexity',
        '难度', '等级', '级别'
      ],
      source: [
        'source', 'reference', 'origin', 'from',
        '来源', '参考', '出处', '引用'
      ]
    };

    // 找到源字段所属的语义组
    let sourceGroup: string | null = null;
    for (const [group, keywords] of Object.entries(semanticGroups)) {
      if (keywords.some(keyword => {
        const sourceKey = sourceField.key?.toLowerCase() || '';
        const sourceName = sourceField.name?.toLowerCase() || '';
        const keywordLower = keyword.toLowerCase();

        return sourceKey.includes(keywordLower) ||
               sourceName.includes(keywordLower) ||
               keywordLower.includes(sourceKey) ||
               keywordLower.includes(sourceName);
      })) {
        sourceGroup = group;
        break;
      }
    }

    if (!sourceGroup) return null;

    // 在目标字段中查找同一语义组的字段
    const groupKeywords = semanticGroups[sourceGroup as keyof typeof semanticGroups];
    return targetFields.find(targetField => {
      const targetKey = targetField.key?.toLowerCase() || '';
      const targetName = targetField.name?.toLowerCase() || '';

      return groupKeywords.some(keyword => {
        const keywordLower = keyword.toLowerCase();
        return targetKey.includes(keywordLower) ||
               targetName.includes(keywordLower) ||
               keywordLower.includes(targetKey) ||
               keywordLower.includes(targetName);
      });
    });
  }

  /**
   * 分割内容
   */
  private static splitContent(content: string, parts: number): string[] {
    if (parts <= 1) return [content];

    const lines = content.split('\n');
    const linesPerPart = Math.ceil(lines.length / parts);
    const result: string[] = [];

    for (let i = 0; i < parts; i++) {
      const start = i * linesPerPart;
      const end = Math.min(start + linesPerPart, lines.length);
      result.push(lines.slice(start, end).join('\n').trim());
    }

    return result;
  }

  /**
   * 创建兼容的字段key
   */
  private static createCompatibleFieldKey(sourceKey: string, targetFields: any[]): string {
    let baseKey = sourceKey;
    let counter = 1;

    // 确保字段key不冲突
    while (targetFields.some(field => field.key === baseKey)) {
      baseKey = `${sourceKey}_${counter}`;
      counter++;
    }

    return baseKey;
  }

  /**
   * 验证Markdown标题格式
   */
  static validateMarkdownHeaderFormat(content: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查是否包含一级标题
    const headerPattern = /^#\s+(.+)/gm;
    const headers = content.match(headerPattern);

    if (!headers || headers.length === 0) {
      errors.push('内容中没有找到一级标题（# 标题）');
    }

    // 检查标题格式
    if (headers) {
      headers.forEach((header, index) => {
        const headerName = header.replace(/^#\s+/, '').trim();
        if (!headerName) {
          errors.push(`第${index + 1}个标题为空`);
        }

        // 检查是否有对应的内容
        const nextHeaderIndex = content.indexOf(headers[index + 1] || '\n\n\n');
        const headerIndex = content.indexOf(header);
        const contentBetween = content.slice(
          headerIndex + header.length,
          nextHeaderIndex === -1 ? content.length : nextHeaderIndex
        ).trim();

        if (!contentBetween) {
          warnings.push(`标题"${headerName}"下没有内容`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 格式化Markdown标题内容
   * @deprecated 此方法已废弃，请使用新的SimplifiedParsingSettings系统
   */
  static formatMarkdownHeaderContent(content: string): string {
    console.warn('[DEPRECATED] formatMarkdownHeaderContent方法已废弃，请使用新的解析系统');

    // 简单返回原内容，不再处理!字段名格式
    return content.trim();
  }

  /**
   * 提取模板元数据
   */
  static extractTemplateMetadata(content: string): {
    templateId?: string;
    templateName?: string;
    fields: Record<string, string>;
  } {
    const parseResult = this.parseContentToFields(content);

    if (parseResult.success && parseResult.fields) {
      return {
        templateId: parseResult.templateId,
        templateName: parseResult.templateName,
        fields: parseResult.fields
      };
    }

    return { fields: {} };
  }

  /**
   * 生成模板预览（纯净格式，无示例内容）- 🔥 内测阶段：只使用新格式
   */
  static generateTemplatePreview(template: TriadTemplate): string {
    const fields = template.fieldTemplate.fields.filter(f => f.type === 'field') as any[];
    let preview = '';

    fields.forEach(field => {
      const headerName = this.getFieldHeaderName(field);
      preview += `!${headerName}\n\n\n\n`;
    });

    preview += `!TemplateId\n\n${template.id}\n\n`;
    preview += `!TemplateName\n\n${template.name}\n\n`;

    return preview.trim();
  }

  // generateExampleContent 函数已移除 - 使用纯净格式，不生成示例内容
}
