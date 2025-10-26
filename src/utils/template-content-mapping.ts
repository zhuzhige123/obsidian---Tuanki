import type { FieldTemplate, TriadTemplate } from '../data/template-types';

/**
 * 字段映射配置
 */
export interface FieldMappingConfig {
  // 字段映射：源字段 -> 目标字段(s)
  mappings: Record<string, string | string[]>;
  // 格式转换：字段 -> 转换规则
  formatTransforms?: Record<string, string>;
  // 合并分隔符
  mergeSeparator?: string;
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
    merged: number;
    transformed: number;
    skipped: number;
  };
  // 警告信息
  warnings: string[];
}

/**
 * 格式转换规则
 */
export const FORMAT_TRANSFORMS = {
  'h2-to-h3': {
    name: '## → ###',
    transform: (content: string) => content.replace(/^##\s+/gm, '### ')
  },
  'h3-to-h2': {
    name: '### → ##',
    transform: (content: string) => content.replace(/^###\s+/gm, '## ')
  },
  'h2-to-h4': {
    name: '## → ####',
    transform: (content: string) => content.replace(/^##\s+/gm, '#### ')
  },
  'h4-to-h2': {
    name: '#### → ##',
    transform: (content: string) => content.replace(/^####\s+/gm, '## ')
  },
  'add-prefix': {
    name: '添加前缀',
    transform: (content: string, prefix = '> ') => 
      content.split('\n').map(line => line.trim() ? prefix + line : line).join('\n')
  },
  'add-suffix': {
    name: '添加后缀',
    transform: (content: string, suffix = ' ✓') => 
      content.split('\n').map(line => line.trim() ? line + suffix : line).join('\n')
  },
  'remove-prefix': {
    name: '移除前缀',
    transform: (content: string) => content.replace(/^>\s*/gm, '')
  },
  'bold-to-italic': {
    name: '粗体 → 斜体',
    transform: (content: string) => content.replace(/\*\*(.*?)\*\*/g, '*$1*')
  },
  'italic-to-bold': {
    name: '斜体 → 粗体',
    transform: (content: string) => content.replace(/\*(.*?)\*/g, '**$1**')
  }
} as const;

/**
 * 应用字段映射
 */
export function applyFieldMapping(
  sourceFields: Record<string, string>,
  config: FieldMappingConfig
): FieldMappingResult {
  const result: FieldMappingResult = {
    fields: {},
    stats: {
      mapped: 0,
      merged: 0,
      transformed: 0,
      skipped: 0
    },
    warnings: []
  };

  // 处理每个映射
  for (const [sourceField, targetField] of Object.entries(config.mappings)) {
    const sourceValue = sourceFields[sourceField];
    
    if (!sourceValue || sourceValue.trim() === '') {
      result.stats.skipped++;
      continue;
    }

    // 应用格式转换
    let transformedValue = sourceValue;
    const transformRule = config.formatTransforms?.[sourceField];
    if (transformRule && FORMAT_TRANSFORMS[transformRule as keyof typeof FORMAT_TRANSFORMS]) {
      const transformer = FORMAT_TRANSFORMS[transformRule as keyof typeof FORMAT_TRANSFORMS];
      transformedValue = transformer.transform(sourceValue);
      result.stats.transformed++;
    }

    // 处理映射
    if (Array.isArray(targetField)) {
      // 多目标映射（字段分割）
      if (targetField.length > 1) {
        const separator = config.mergeSeparator || '\n\n---\n\n';
        const parts = transformedValue.split(separator);
        
        targetField.forEach((target, index) => {
          if (parts[index]) {
            result.fields[target] = parts[index].trim();
            result.stats.mapped++;
          }
        });
      } else if (targetField.length === 1) {
        result.fields[targetField[0]] = transformedValue;
        result.stats.mapped++;
      }
    } else if (targetField) {
      // 单目标映射
      if (result.fields[targetField]) {
        // 目标字段已存在，合并内容
        const separator = config.mergeSeparator || '\n\n';
        result.fields[targetField] += separator + transformedValue;
        result.stats.merged++;
        result.warnings.push(`字段 "${targetField}" 存在多个源，已合并内容`);
      } else {
        result.fields[targetField] = transformedValue;
        result.stats.mapped++;
      }
    }
  }

  return result;
}

/**
 * 生成智能映射建议
 */
export function generateMappingSuggestions(
  sourceTemplate: FieldTemplate | TriadTemplate,
  targetTemplate: FieldTemplate | TriadTemplate,
  mode: 'fields' | 'markdown'
): Record<string, string> {
  const suggestions: Record<string, string> = {};
  
  // 获取源字段和目标字段
  const sourceFields = getTemplateFields(sourceTemplate, mode);
  const targetFields = getTemplateFields(targetTemplate, mode);
  
  // 1. 精确匹配
  for (const sourceField of sourceFields) {
    if (targetFields.includes(sourceField)) {
      suggestions[sourceField] = sourceField;
    }
  }
  
  // 2. 模糊匹配
  const unmappedSource = sourceFields.filter(f => !suggestions[f]);
  const unmappedTarget = targetFields.filter(f => !Object.values(suggestions).includes(f));
  
  for (const sourceField of unmappedSource) {
    const bestMatch = findBestFieldMatch(sourceField, unmappedTarget);
    if (bestMatch) {
      suggestions[sourceField] = bestMatch;
      // 从未映射列表中移除
      const index = unmappedTarget.indexOf(bestMatch);
      if (index > -1) {
        unmappedTarget.splice(index, 1);
      }
    }
  }
  
  return suggestions;
}

/**
 * 获取模板的字段列表
 */
function getTemplateFields(template: FieldTemplate | TriadTemplate, mode: 'fields' | 'markdown'): string[] {
  if (mode === 'fields') {
    const fieldTemplate = 'fieldTemplate' in template ? template.fieldTemplate : template;
    return fieldTemplate.fields
      ?.filter(f => f.type === 'field')
      .map(f => (f as any).key) || [];
  } else {
    const triadTemplate = template as TriadTemplate;
    return triadTemplate.fieldTemplate.fields
      ?.filter(f => f.type === 'field')
      .map(f => (f as any).key) || [];
  }
}

/**
 * 查找最佳字段匹配
 */
function findBestFieldMatch(sourceField: string, targetFields: string[]): string | null {
  if (targetFields.length === 0) return null;
  
  // 计算相似度
  const similarities = targetFields.map(target => ({
    field: target,
    score: calculateFieldSimilarity(sourceField, target)
  }));
  
  // 排序并选择最佳匹配
  similarities.sort((a, b) => b.score - a.score);
  
  // 只有相似度超过阈值才返回
  const bestMatch = similarities[0];
  return bestMatch.score > 0.3 ? bestMatch.field : null;
}

/**
 * 计算字段相似度
 */
function calculateFieldSimilarity(field1: string, field2: string): number {
  // 转换为小写进行比较
  const f1 = field1.toLowerCase();
  const f2 = field2.toLowerCase();
  
  // 精确匹配
  if (f1 === f2) return 1.0;
  
  // 包含关系
  if (f1.includes(f2) || f2.includes(f1)) return 0.8;
  
  // 常见字段映射
  const commonMappings: Record<string, string[]> = {
    'front': ['question', 'prompt', 'problem', 'word', 'term'],
    'back': ['answer', 'solution', 'definition', 'meaning', 'explanation'],
    'question': ['front', 'prompt', 'problem', 'q'],
    'answer': ['back', 'solution', 'a'],
    'word': ['term', 'vocabulary', 'front'],
    'definition': ['meaning', 'explanation', 'back'],
    'example': ['sample', 'demo', 'instance'],
    'note': ['notes', 'comment', 'remark'],
    'tag': ['tags', 'category', 'type']
  };
  
  for (const [key, values] of Object.entries(commonMappings)) {
    if (f1 === key && values.includes(f2)) return 0.7;
    if (f2 === key && values.includes(f1)) return 0.7;
  }
  
  // Levenshtein距离
  const distance = levenshteinDistance(f1, f2);
  const maxLength = Math.max(f1.length, f2.length);
  return maxLength > 0 ? 1 - (distance / maxLength) : 0;
}

/**
 * 计算Levenshtein距离
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * 验证映射配置
 */
export function validateMappingConfig(config: FieldMappingConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // 检查映射是否为空
  if (!config.mappings || Object.keys(config.mappings).length === 0) {
    errors.push('映射配置不能为空');
  }
  
  // 检查格式转换规则是否有效
  if (config.formatTransforms) {
    for (const [field, rule] of Object.entries(config.formatTransforms)) {
      if (rule && !FORMAT_TRANSFORMS[rule as keyof typeof FORMAT_TRANSFORMS]) {
        errors.push(`未知的格式转换规则: ${rule}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
