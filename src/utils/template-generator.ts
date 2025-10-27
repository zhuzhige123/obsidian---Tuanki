import type {
  FieldTemplate,
  MarkdownTemplate,
  RegexParseTemplate
} from '../data/template-types';
import { generateId } from './helpers';

/**
 * 模板生成器工具类
 * 提供统一的模板生成逻辑
 */
export class TemplateGenerator {
  /**
   * 从字段模板生成Markdown模板
   */
  static generateMarkdownTemplate(fieldTemplate: FieldTemplate): MarkdownTemplate {
    const fields = fieldTemplate.fields.filter(f => f.type === 'field') as any[];
    let content = '';

    // 智能识别主要字段
    const titleField = fields.find(f =>
      f.key.includes('question') || f.key.includes('title') || f.key.includes('front')
    );
    const contentField = fields.find(f =>
      f.key.includes('answer') || f.key.includes('content') || f.key.includes('back')
    );

    // 🚫 已弃用：旧的"!字段名"格式已被简化解析系统替代
    console.warn('[TemplateGenerator] 旧的"!字段名"格式已弃用，请使用简化解析系统');

    // ✅ 使用当前简化解析格式
    if (titleField) {
      content += `{{${titleField.key}}}\n\n`;
    }

    if (contentField) {
      content += `---div---\n\n{{${contentField.key}}}\n\n`;
    }

    // 其他字段作为标签或附加内容
    const otherFields = fields.filter(f => f !== titleField && f !== contentField);
    otherFields.forEach(field => {
      content += `#${field.key} `;
    });

    // 生成示例内容
    const exampleContent = this.generateExampleContent(fields);

    return {
      id: generateId(),
      name: `${fieldTemplate.name} - MD模板`,
      description: '自动生成的Markdown模板',
      fieldTemplateId: fieldTemplate.id,
      markdownContent: content.trim(),
      fieldPlaceholders: fields.reduce((acc, field) => {
        acc[field.key] = `{{${field.key}}}`;
        return acc;
      }, {} as Record<string, string>),
      exampleContent,
      isOfficial: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 从字段模板生成正则解析模板
   */
  static generateRegexTemplate(fieldTemplate: FieldTemplate): RegexParseTemplate {
    const fields = fieldTemplate.fields.filter(f => f.type === 'field') as any[];

    // 生成基于Markdown结构的正则表达式
    let regex = '';
    const fieldMappings: Record<string, number> = {};
    let groupIndex = 1;

    // 智能识别主要字段
    const titleField = fields.find(f =>
      f.key.includes('question') || f.key.includes('title') || f.key.includes('front')
    );
    const contentField = fields.find(f =>
      f.key.includes('answer') || f.key.includes('content') || f.key.includes('back')
    );

    // 🚫 已弃用：旧的"!字段名"正则已被简化解析系统替代
    console.warn('[TemplateGenerator] 旧的"!字段名"正则已弃用，请使用简化解析系统');

    // ✅ 使用当前简化解析格式的正则
    if (titleField) {
      regex += `^(.+?)(?=---div---|$)`;
      fieldMappings[titleField.key] = groupIndex++;
    }

    if (contentField) {
      regex += `(?:---div---)([\\s\\S]*?)(?:#|$)`;
      fieldMappings[contentField.key] = groupIndex++;
    }

    // 标签字段
    const otherFields = fields.filter(f => f !== titleField && f !== contentField);
    otherFields.forEach(field => {
      regex += `#${field.key}`;
      fieldMappings[field.key] = groupIndex++;
    });

    return {
      id: generateId(),
      name: `${fieldTemplate.name} - 正则模板`,
      description: '自动生成的正则解析模板',
      fieldTemplateId: fieldTemplate.id,
      regex: regex || '([\\s\\S]*)', // 默认匹配所有内容
      fieldMappings,
      parseOptions: {
        multiline: true,
        ignoreCase: false,
        global: false
      },
      isOfficial: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 生成示例内容
   */
  private static generateExampleContent(fields: any[]): string {
    let example = '';

    // 智能识别主要字段
    const titleField = fields.find(f =>
      f.key.includes('question') || f.key.includes('title') || f.key.includes('front')
    );
    const contentField = fields.find(f =>
      f.key.includes('answer') || f.key.includes('content') || f.key.includes('back')
    );

    // 🚫 已弃用：旧的"!字段名"示例已被简化解析系统替代
    console.warn('[TemplateGenerator] 旧的"!字段名"示例已弃用，请使用简化解析系统');

    // ✅ 使用当前简化解析格式的示例
    if (titleField) {
      example += `${this.getExampleValue(titleField)}\n\n`;
    }

    if (contentField) {
      example += `---div---\n\n${this.getExampleValue(contentField)}\n\n`;
    }

    // 其他字段作为标签
    const otherFields = fields.filter(f => f !== titleField && f !== contentField);
    otherFields.forEach(field => {
      example += `#${field.key} `;
    });

    return example.trim();
  }

  /**
   * 获取字段的示例值
   */
  private static getExampleValue(field: any): string {
    const key = field.key.toLowerCase();
    const name = field.name.toLowerCase();

    // 根据字段类型和名称生成示例值
    if (key.includes('question') || name.includes('问题')) {
      return '什么是TypeScript？';
    }
    if (key.includes('answer') || name.includes('答案')) {
      return 'TypeScript是JavaScript的超集，添加了静态类型检查。';
    }
    if (key.includes('title') || name.includes('标题')) {
      return 'TypeScript基础';
    }
    if (key.includes('content') || name.includes('内容')) {
      return '这里是详细的内容描述...';
    }
    if (key.includes('tag') || name.includes('标签')) {
      return 'programming, typescript';
    }
    if (key.includes('category') || name.includes('分类')) {
      return '编程语言';
    }
    if (key.includes('source') || name.includes('来源')) {
      return 'TypeScript官方文档';
    }

    // 默认示例值
    return `示例${field.name}`;
  }

  /**
   * 从字段数据生成Markdown内容
   */
  static generateMarkdownFromFields(
    fieldTemplate: FieldTemplate,
    fieldValues: Record<string, string>
  ): string {
    const fields = fieldTemplate.fields.filter(f => f.type === 'field') as any[];
    let content = '';

    // 智能识别主要字段
    const titleField = fields.find(f =>
      f.key.includes('question') || f.key.includes('title') || f.key.includes('front')
    );
    const contentField = fields.find(f =>
      f.key.includes('answer') || f.key.includes('content') || f.key.includes('back')
    );

    // 生成标题
    if (titleField) {
      const value = fieldValues[titleField.key] || '';
      content += `# ${value}\n\n`;
    }

    // 生成主要内容
    if (contentField) {
      const value = fieldValues[contentField.key] || '';
      content += `## 📝 ${contentField.name}\n${value}\n\n`;
    }

    // 处理其他字段
    const otherFields = fields.filter(f => f !== titleField && f !== contentField);
    otherFields.forEach(field => {
      const value = fieldValues[field.key] || '';
      if (value.trim()) {
        content += `**${field.name}**: ${value}\n\n`;
      }
    });

    return content.trim();
  }

  /**
   * 解析Markdown内容到字段
   */
  static parseMarkdownToFields(
    content: string,
    regexTemplate: RegexParseTemplate
  ): Record<string, string> {
    const fields: Record<string, string> = {};

    try {
      const regex = new RegExp(regexTemplate.regex, 'gm');
      const match = regex.exec(content);

      if (match) {
        Object.entries(regexTemplate.fieldMappings).forEach(([fieldKey, groupIndex]) => {
          fields[fieldKey] = match[groupIndex]?.trim() || '';
        });
      }
    } catch (error) {
      console.error('Failed to parse markdown content:', error);
    }

    return fields;
  }

  /**
   * 验证正则表达式的安全性和复杂度
   */
  static validateRegex(pattern: string): {
    isValid: boolean;
    complexity: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let complexity = 0;

    try {
      // 基本语法验证
      new RegExp(pattern);

      // 复杂度计算
      complexity += (pattern.match(/\*/g) || []).length * 2; // 星号量词
      complexity += (pattern.match(/\+/g) || []).length * 2; // 加号量词
      complexity += (pattern.match(/\{/g) || []).length * 1; // 重复量词
      complexity += (pattern.match(/\(/g) || []).length * 1; // 捕获组
      complexity += (pattern.match(/\[/g) || []).length * 1; // 字符类

      // 安全性检查
      if (pattern.includes('.*.*')) {
        warnings.push('包含嵌套的贪婪量词，可能导致性能问题');
      }
      if (pattern.includes('(.+)+')) {
        warnings.push('包含灾难性回溯模式');
      }
      if (complexity > 50) {
        warnings.push('正则表达式过于复杂，建议简化');
      }

      return {
        isValid: true,
        complexity,
        warnings
      };
    } catch (error) {
      return {
        isValid: false,
        complexity: 0,
        warnings: [`正则表达式语法错误: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }
}
