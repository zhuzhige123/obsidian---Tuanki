import type { FieldTemplate, FieldTemplateField, TemplateItem } from '../data/template-types';
import { generateId } from './helpers';


/**
 * 模板验证结果接口
 */
export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 字段验证结果接口
 */
export interface FieldValidationResult {
  valid: boolean;
  errors: string[];
  fieldIndex: number;
}

/**
 * 验证字段模板的完整性和正确性
 */
export function validateFieldTemplate(template: any): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 基础属性验证
  if (!template) {
    errors.push('模板对象为空');
    return { valid: false, errors, warnings };
  }

  if (!template.id || typeof template.id !== 'string' || template.id.trim() === '') {
    errors.push('模板ID无效或为空');
  }

  if (!template.name || typeof template.name !== 'string' || template.name.trim() === '') {
    errors.push('模板名称无效或为空');
  }

  // 字段列表验证
  if (!Array.isArray(template.fields)) {
    errors.push('字段列表必须是数组');
  } else {
    const fieldValidations = validateTemplateFields(template.fields);
    fieldValidations.forEach(validation => {
      if (!validation.valid) {
        errors.push(...validation.errors.map(err => `字段 ${validation.fieldIndex}: ${err}`));
      }
    });

    // 检查是否至少有一个字段
    const fieldCount = template.fields.filter((f: any) => f.type === 'field').length;
    if (fieldCount === 0) {
      errors.push('模板至少需要一个字段');
    }

    // 检查字段key的唯一性
    const fieldKeys = template.fields
      .filter((f: any) => f.type === 'field')
      .map((f: any) => f.key);
    const uniqueKeys = new Set(fieldKeys);
    if (fieldKeys.length !== uniqueKeys.size) {
      errors.push('字段key必须唯一');
    }
  }

  // 模板HTML验证
  if (typeof template.frontTemplate !== 'string') {
    errors.push('frontTemplate 必须是字符串');
  } else if (template.frontTemplate.trim() === '') {
    warnings.push('frontTemplate 为空，可能影响卡片显示');
  }

  if (typeof template.backTemplate !== 'string') {
    errors.push('backTemplate 必须是字符串');
  } else if (template.backTemplate.trim() === '') {
    warnings.push('backTemplate 为空，可能影响卡片显示');
  }

  // 描述验证（可选）
  if (template.description !== undefined && typeof template.description !== 'string') {
    warnings.push('description 应该是字符串类型');
  }

  // isOfficial验证（可选）
  if (template.isOfficial !== undefined && typeof template.isOfficial !== 'boolean') {
    warnings.push('isOfficial 应该是布尔类型');
  }

  // MD格式模板验证
  if (template.markdownEnabled) {
    if (typeof template.markdownFrontTemplate !== 'string') {
      errors.push('markdownFrontTemplate 必须是字符串');
    } else if (template.markdownFrontTemplate.trim() === '') {
      warnings.push('markdownFrontTemplate 为空，可能影响MD模式显示');
    }

    if (typeof template.markdownBackTemplate !== 'string') {
      errors.push('markdownBackTemplate 必须是字符串');
    } else if (template.markdownBackTemplate.trim() === '') {
      warnings.push('markdownBackTemplate 为空，可能影响MD模式显示');
    }


  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 验证模板字段列表
 */
function validateTemplateFields(fields: any[]): FieldValidationResult[] {
  return fields.map((field, index) => {
    const errors: string[] = [];

    if (!field) {
      errors.push('字段对象为空');
      return { valid: false, errors, fieldIndex: index };
    }

    // 验证字段类型
    if (!field.type || !['field', 'hr'].includes(field.type)) {
      errors.push('字段类型必须是 "field" 或 "hr"');
    }

    // 验证字段ID
    if (!field.id || typeof field.id !== 'string' || field.id.trim() === '') {
      errors.push('字段ID无效或为空');
    }

    // 如果是字段类型，验证字段特有属性
    if (field.type === 'field') {
      if (!field.name || typeof field.name !== 'string' || field.name.trim() === '') {
        errors.push('字段名称无效或为空');
      }

      if (!field.key || typeof field.key !== 'string' || field.key.trim() === '') {
        errors.push('字段key无效或为空');
      }

      if (!field.side || !['front', 'back', 'both'].includes(field.side)) {
        errors.push('字段side必须是 "front", "back" 或 "both"');
      }

      // 验证key格式（允许中文字符和更灵活的格式）
      if (field.key && (field.key.trim() === '' || /[<>"/\\|?*:]/.test(field.key))) {
        errors.push('字段key格式无效，不能包含特殊字符 < > " / \\ | ? * :');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      fieldIndex: index
    };
  });
}

/**
 * 修复无效的字段模板
 */
export function repairFieldTemplate(template: any): FieldTemplate {
  const repaired: any = { ...template };

  // 修复基础属性
  if (!repaired.id || typeof repaired.id !== 'string') {
    repaired.id = generateId();
  }

  if (!repaired.name || typeof repaired.name !== 'string') {
    repaired.name = '未命名模板';
  }

  if (!repaired.description || typeof repaired.description !== 'string') {
    repaired.description = '';
  }

  // 修复字段列表
  if (!Array.isArray(repaired.fields)) {
    repaired.fields = [];
  }

  // 修复字段属性
  repaired.fields = repaired.fields.map((field: any, index: number) => {
    if (!field || typeof field !== 'object') {
      return {
        id: generateId(),
        type: 'field',
        name: `字段${index + 1}`,
        key: `field_${index + 1}`,
        side: 'both'
      };
    }

    const repairedField: any = { ...field };

    if (!repairedField.id) {
      repairedField.id = generateId();
    }

    if (repairedField.type !== 'field' && repairedField.type !== 'hr') {
      repairedField.type = 'field';
    }

    if (repairedField.type === 'field') {
      if (!repairedField.name || typeof repairedField.name !== 'string') {
        repairedField.name = (typeof repairedField.key === 'string' ? repairedField.key : `字段${index + 1}`);
      }

      if (!repairedField.key || typeof repairedField.key !== 'string') {
        const safeName = typeof repairedField.name === 'string' ? repairedField.name : `字段${index + 1}`;
        repairedField.key = safeName.toLowerCase().replace(/\s+/g, '_') || `field_${index + 1}`;
      }

      if (!['front', 'back', 'both'].includes(repairedField.side)) {
        repairedField.side = 'both';
      }

      // 移除无效属性
      delete repairedField.label;
      delete repairedField.required;
      delete repairedField.enabled;
    }

    return repairedField;
  });

  // 确保至少有一个字段
  const fieldCount = repaired.fields.filter((f: any) => f.type === 'field').length;
  if (fieldCount === 0) {
    repaired.fields.push({
      id: generateId(),
      type: 'field',
      name: '正面',
      key: 'front',
      side: 'front'
    });
    repaired.fields.push({
      id: generateId(),
      type: 'field',
      name: '背面',
      key: 'back',
      side: 'back'
    });
  }

  // 生成或修复模板HTML
  const frontFields = repaired.fields.filter((f: any) => f.type === 'field' && (f.side === 'front' || f.side === 'both'));
  const backFields = repaired.fields.filter((f: any) => f.type === 'field' && (f.side === 'back' || f.side === 'both'));
  
  repaired.frontTemplate = frontFields.length > 0 
    ? frontFields.map((f: any) => `{{${f.key}}}`).join('<br>')
    : '';
  
  repaired.backTemplate = backFields.length > 0 
    ? backFields.map((f: any) => `{{${f.key}}}`).join('<br>')
    : '';

  // 设置默认值
  if (typeof repaired.isOfficial !== 'boolean') {
    repaired.isOfficial = false;
  }

  // 移除无效属性
  delete repaired.enabled;

  return repaired as FieldTemplate;
}

/**
 * 验证并修复模板数组（使用迁移服务）
 */
export function validateAndRepairTemplates(templates: any[]): FieldTemplate[] {
  if (!Array.isArray(templates)) {
    console.warn('模板数据不是数组，返回空数组');
    return [];
  }

  // 首先尝试迁移所有模板
  const migratedTemplates = TemplateMigrationService.migrateTemplates(templates);

  // 然后验证迁移后的模板
  return migratedTemplates.map((template, index) => {
    const validation = validateFieldTemplate(template);

    if (!validation.valid) {
      console.warn(`模板 ${index} (${template.name}) 迁移后仍然无效:`, validation.errors);

      // 最后的修复尝试
      const repaired = repairFieldTemplate(template);
      const revalidation = validateFieldTemplate(repaired);

      if (!revalidation.valid) {
        console.error(`模板 ${index} (${template.name}) 无法修复:`, revalidation.errors);
        return null;
      }

      console.log(`模板 ${index} (${template.name}) 最终修复成功`);
      return repaired;
    }

    if (validation.warnings.length > 0) {
      console.warn(`模板 ${template.name} 有警告:`, validation.warnings);
    }

    return template;
  }).filter(Boolean) as FieldTemplate[];
}

/**
 * 快速验证模板数组（不进行修复）
 */
export function quickValidateTemplates(templates: any[]): { valid: boolean; issues: string[] } {
  if (!Array.isArray(templates)) {
    return { valid: false, issues: ['模板数据不是数组'] };
  }

  const issues: string[] = [];

  templates.forEach((template, index) => {
    const validation = validateFieldTemplate(template);
    if (!validation.valid) {
      issues.push(`模板 ${index} (${template.name || 'unknown'}): ${validation.errors.join(', ')}`);
    }
    if (validation.warnings.length > 0) {
      issues.push(`模板 ${index} (${template.name || 'unknown'}) 警告: ${validation.warnings.join(', ')}`);
    }
  });

  return {
    valid: issues.length === 0,
    issues
  };
}
