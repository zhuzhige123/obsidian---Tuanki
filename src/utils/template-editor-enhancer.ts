/**
 * 模板编辑器增强工具
 * 为不同来源和类型的模板提供统一的编辑体验
 */

import type { TriadTemplate, FieldTemplate } from '../data/template-types';
import type AnkiPlugin from '../main';

export interface TemplateEditContext {
  /** 模板来源 */
  source: 'official' | 'custom' | 'apkg_import' | 'migrated';
  /** 是否可编辑 */
  editable: boolean;
  /** 编辑限制 */
  restrictions: {
    canEditName: boolean;
    canEditFields: boolean;
    canEditMarkdown: boolean;
    canEditRegex: boolean;
    canDelete: boolean;
  };
  /** 显示标识 */
  badges: TemplateBadge[];
  /** 编辑提示 */
  hints: string[];
}

export interface TemplateBadge {
  text: string;
  type: 'official' | 'imported' | 'migrated' | 'custom' | 'warning' | 'info';
  tooltip?: string;
}

export class TemplateEditorEnhancer {
  private plugin: AnkiPlugin;

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
  }

  /**
   * 获取模板编辑上下文
   */
  getEditContext(template: TriadTemplate): TemplateEditContext {
    const source = this.determineTemplateSource(template);
    const restrictions = this.getEditRestrictions(template, source);
    const badges = this.generateTemplateBadges(template, source);
    const hints = this.generateEditHints(template, source);

    return {
      source,
      editable: !template.isOfficial,
      restrictions,
      badges,
      hints
    };
  }

  /**
   * 确定模板来源
   */
  private determineTemplateSource(template: TriadTemplate): TemplateEditContext['source'] {
    if (template.isOfficial) {
      return 'official';
    }

    // 检查是否为APKG导入的模板
    if (template.name.includes('APKG导入') || 
        template.fieldTemplate.metadata?.source === 'apkg_import') {
      return 'apkg_import';
    }

    // 检查是否为迁移的模板
    if (template.name.includes('(迁移)') || 
        template.category === 'migrated') {
      return 'migrated';
    }

    return 'custom';
  }

  /**
   * 获取编辑限制
   */
  private getEditRestrictions(
    template: TriadTemplate, 
    source: TemplateEditContext['source']
  ): TemplateEditContext['restrictions'] {
    const baseRestrictions = {
      canEditName: true,
      canEditFields: true,
      canEditMarkdown: true,
      canEditRegex: true,
      canDelete: true
    };

    switch (source) {
      case 'official':
        // 官方模板只能查看，不能编辑
        return {
          canEditName: false,
          canEditFields: false,
          canEditMarkdown: false,
          canEditRegex: false,
          canDelete: false
        };

      case 'apkg_import':
        // APKG导入的模板可以编辑，但建议谨慎
        return {
          ...baseRestrictions,
          canEditFields: true, // 可以编辑字段，但要小心
        };

      case 'migrated':
        // 迁移的模板完全可编辑
        return baseRestrictions;

      case 'custom':
      default:
        // 自定义模板完全可编辑
        return baseRestrictions;
    }
  }

  /**
   * 生成模板标识
   */
  private generateTemplateBadges(
    template: TriadTemplate, 
    source: TemplateEditContext['source']
  ): TemplateBadge[] {
    const badges: TemplateBadge[] = [];

    switch (source) {
      case 'official':
        badges.push({
          text: '官方模板',
          type: 'official',
          tooltip: '这是官方提供的模板，不可编辑'
        });
        break;

      case 'apkg_import':
        badges.push({
          text: 'APKG导入',
          type: 'imported',
          tooltip: '从APKG文件导入的模板'
        });
        break;

      case 'migrated':
        badges.push({
          text: '已迁移',
          type: 'migrated',
          tooltip: '从旧字段模板系统迁移的模板'
        });
        break;

      case 'custom':
        badges.push({
          text: '自定义',
          type: 'custom',
          tooltip: '用户创建的自定义模板'
        });
        break;
    }

    // 检查一致性状态
    if (!template.syncStatus.isConsistent) {
      badges.push({
        text: '需要同步',
        type: 'warning',
        tooltip: '模板的三个组件之间存在不一致，建议检查和修复'
      });
    }

    // 检查版本信息
    if (template.version && template.version !== '1.0.0') {
      badges.push({
        text: `v${template.version}`,
        type: 'info',
        tooltip: `模板版本: ${template.version}`
      });
    }

    return badges;
  }

  /**
   * 生成编辑提示
   */
  private generateEditHints(
    template: TriadTemplate, 
    source: TemplateEditContext['source']
  ): string[] {
    const hints: string[] = [];

    switch (source) {
      case 'official':
        hints.push('官方模板是只读的，如需修改请复制后编辑');
        break;

      case 'apkg_import':
        hints.push('这是从APKG文件导入的模板，编辑时请确保与原始Anki卡片兼容');
        hints.push('建议在编辑前先备份，以防止数据丢失');
        break;

      case 'migrated':
        hints.push('这是从旧字段模板系统迁移的模板');
        hints.push('您可以安全地编辑此模板，迁移过程已确保数据完整性');
        break;

      case 'custom':
        hints.push('这是您创建的自定义模板，可以自由编辑');
        break;
    }

    // 一致性提示
    if (!template.syncStatus.isConsistent) {
      hints.push('⚠️ 检测到模板组件间不一致，建议使用一致性检查工具修复');
    }

    // 字段数量提示
    const fieldCount = template.fieldTemplate.fields.filter(f => f.type === 'field').length;
    if (fieldCount > 10) {
      hints.push('💡 模板包含较多字段，建议考虑简化以提高学习效率');
    }

    return hints;
  }

  /**
   * 验证模板编辑的合法性
   */
  validateEdit(
    template: TriadTemplate, 
    editType: 'name' | 'fields' | 'markdown' | 'regex' | 'delete',
    newValue?: any
  ): { valid: boolean; message?: string } {
    const context = this.getEditContext(template);

    // 检查基本编辑权限
    if (!context.editable) {
      return {
        valid: false,
        message: '此模板不可编辑'
      };
    }

    // 检查具体编辑权限
    switch (editType) {
      case 'name':
        if (!context.restrictions.canEditName) {
          return {
            valid: false,
            message: '此模板的名称不可编辑'
          };
        }
        break;

      case 'fields':
        if (!context.restrictions.canEditFields) {
          return {
            valid: false,
            message: '此模板的字段不可编辑'
          };
        }
        break;

      case 'markdown':
        if (!context.restrictions.canEditMarkdown) {
          return {
            valid: false,
            message: '此模板的Markdown模板不可编辑'
          };
        }
        break;

      case 'regex':
        if (!context.restrictions.canEditRegex) {
          return {
            valid: false,
            message: '此模板的正则解析模板不可编辑'
          };
        }
        break;

      case 'delete':
        if (!context.restrictions.canDelete) {
          return {
            valid: false,
            message: '此模板不可删除'
          };
        }
        break;
    }

    // APKG导入模板的特殊验证
    if (context.source === 'apkg_import' && editType === 'fields') {
      const fieldTemplate = template.fieldTemplate;
      const originalAnkiModelId = fieldTemplate.metadata?.originalAnkiModelId;
      
      if (originalAnkiModelId && newValue) {
        // 检查是否保留了关键字段
        const newFields = Array.isArray(newValue) ? newValue : [];
        const hasRequiredFields = newFields.some((f: any) => 
          f.key === 'front' || f.key === 'back' || f.key === 'question' || f.key === 'answer'
        );
        
        if (!hasRequiredFields) {
          return {
            valid: false,
            message: 'APKG导入的模板必须保留至少一个主要字段（front/back/question/answer）'
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * 获取模板编辑建议
   */
  getEditSuggestions(template: TriadTemplate): string[] {
    const suggestions: string[] = [];
    const context = this.getEditContext(template);

    // 基于来源的建议
    switch (context.source) {
      case 'apkg_import':
        suggestions.push('考虑为导入的模板添加Obsidian特有的字段，如双链和标签');
        suggestions.push('检查Markdown模板是否符合Obsidian的语法规范');
        break;

      case 'migrated':
        suggestions.push('检查迁移后的模板是否需要优化字段结构');
        suggestions.push('考虑利用三位一体模板的新特性改进学习体验');
        break;

      case 'custom':
        suggestions.push('定期检查模板的学习效果，根据需要调整字段和格式');
        break;
    }

    // 一致性建议
    if (!template.syncStatus.isConsistent) {
      suggestions.push('使用一致性检查工具修复模板组件间的不一致');
    }

    // 性能建议
    const fieldCount = template.fieldTemplate.fields.filter(f => f.type === 'field').length;
    if (fieldCount > 8) {
      suggestions.push('考虑减少字段数量以提高复习效率');
    }

    return suggestions;
  }
}
