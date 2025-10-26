/**
 * 智能字段映射器
 * 解决模板切换时的字段映射和内容迁移问题
 */

import type { TriadTemplate, FieldTemplate } from '../data/template-types';

export interface FieldMappingRule {
  sourceField: string;
  targetField: string;
  confidence: number;
  mappingType: 'exact' | 'semantic' | 'positional' | 'fallback';
  reason: string;
}

export interface FieldMappingResult {
  success: boolean;
  mappings: FieldMappingRule[];
  migratedContent: Record<string, string>;
  unmappedFields: string[];
  warnings: string[];
  suggestions: string[];
}

export interface SemanticFieldGroup {
  group: string;
  fields: string[];
  aliases: string[];
  priority: number;
}

export class IntelligentFieldMapper {
  
  // 语义字段分组 - 定义哪些字段在语义上相似
  private semanticGroups: SemanticFieldGroup[] = [
    {
      group: 'question',
      fields: ['front', 'question', 'problem', 'prompt'],
      aliases: ['问题', '题目', '提示', '正面', '问', 'Q'],
      priority: 1
    },
    {
      group: 'answer',
      fields: ['back', 'answer', 'solution', 'response'],
      aliases: ['答案', '解答', '回答', '背面', '答', 'A'],
      priority: 1
    },
    {
      group: 'thinking',
      fields: ['thinking', 'thought', 'analysis', 'reasoning'],
      aliases: ['思考', '分析', '推理', '思路', '想法'],
      priority: 2
    },
    {
      group: 'explanation',
      fields: ['explanation', 'detail', 'elaboration', 'note'],
      aliases: ['解释', '说明', '详细', '备注', '注释'],
      priority: 2
    },
    {
      group: 'example',
      fields: ['example', 'sample', 'case', 'instance'],
      aliases: ['例子', '示例', '案例', '实例', '举例'],
      priority: 3
    },
    {
      group: 'hint',
      fields: ['hint', 'clue', 'tip', 'guide'],
      aliases: ['提示', '线索', '技巧', '指导', '暗示'],
      priority: 3
    },
    {
      group: 'tags',
      fields: ['tags', 'categories', 'labels', 'keywords'],
      aliases: ['标签', '分类', '关键词', '标记'],
      priority: 4
    },
    {
      group: 'metadata',
      fields: ['source', 'reference', 'author', 'date'],
      aliases: ['来源', '参考', '作者', '日期', '出处'],
      priority: 5
    }
  ];

  /**
   * 智能映射两个模板之间的字段
   */
  mapFields(
    sourceTemplate: TriadTemplate,
    targetTemplate: TriadTemplate,
    currentContent: Record<string, string>
  ): FieldMappingResult {
    console.log(`🎯 [FieldMapper] 开始字段映射: ${sourceTemplate.name} → ${targetTemplate.name}`);

    const sourceFields = this.extractFieldKeys(sourceTemplate);
    const targetFields = this.extractFieldKeys(targetTemplate);
    
    console.log(`📋 [FieldMapper] 源字段: [${sourceFields.join(', ')}]`);
    console.log(`📋 [FieldMapper] 目标字段: [${targetFields.join(', ')}]`);

    const mappings: FieldMappingRule[] = [];
    const migratedContent: Record<string, string> = {};
    const unmappedFields: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 1. 精确匹配 - 字段名完全相同
    const exactMappings = this.findExactMappings(sourceFields, targetFields, currentContent);
    mappings.push(...exactMappings.mappings);
    Object.assign(migratedContent, exactMappings.content);

    // 2. 语义匹配 - 基于语义分组
    const remainingSourceFields = sourceFields.filter(f => 
      !exactMappings.mappings.some(m => m.sourceField === f)
    );
    const remainingTargetFields = targetFields.filter(f => 
      !exactMappings.mappings.some(m => m.targetField === f)
    );

    const semanticMappings = this.findSemanticMappings(
      remainingSourceFields, 
      remainingTargetFields, 
      currentContent
    );
    mappings.push(...semanticMappings.mappings);
    Object.assign(migratedContent, semanticMappings.content);

    // 3. 位置匹配 - 基于字段在模板中的位置
    const stillRemainingSourceFields = remainingSourceFields.filter(f => 
      !semanticMappings.mappings.some(m => m.sourceField === f)
    );
    const stillRemainingTargetFields = remainingTargetFields.filter(f => 
      !semanticMappings.mappings.some(m => m.targetField === f)
    );

    const positionalMappings = this.findPositionalMappings(
      stillRemainingSourceFields,
      stillRemainingTargetFields,
      sourceTemplate,
      targetTemplate,
      currentContent
    );
    mappings.push(...positionalMappings.mappings);
    Object.assign(migratedContent, positionalMappings.content);

    // 4. 处理未映射的字段
    const finalUnmappedFields = stillRemainingSourceFields.filter(f => 
      !positionalMappings.mappings.some(m => m.sourceField === f)
    );

    for (const unmappedField of finalUnmappedFields) {
      if (currentContent[unmappedField]) {
        unmappedFields.push(unmappedField);
        warnings.push(`字段 "${unmappedField}" 无法自动映射，内容可能丢失`);
        suggestions.push(`考虑在目标模板中添加类似的字段，或手动迁移内容`);
      }
    }

    // 5. 为目标模板的新字段提供默认值
    for (const targetField of targetFields) {
      if (!migratedContent.hasOwnProperty(targetField)) {
        migratedContent[targetField] = '';
        suggestions.push(`新字段 "${targetField}" 已添加，请填写相关内容`);
      }
    }

    const result: FieldMappingResult = {
      success: unmappedFields.length === 0,
      mappings,
      migratedContent,
      unmappedFields,
      warnings,
      suggestions
    };

    console.log(`✅ [FieldMapper] 映射完成: ${mappings.length} 个映射, ${unmappedFields.length} 个未映射`);
    return result;
  }

  /**
   * 精确匹配 - 字段名完全相同
   */
  private findExactMappings(
    sourceFields: string[],
    targetFields: string[],
    currentContent: Record<string, string>
  ): { mappings: FieldMappingRule[]; content: Record<string, string> } {
    const mappings: FieldMappingRule[] = [];
    const content: Record<string, string> = {};

    for (const sourceField of sourceFields) {
      if (targetFields.includes(sourceField)) {
        mappings.push({
          sourceField,
          targetField: sourceField,
          confidence: 100,
          mappingType: 'exact',
          reason: '字段名完全匹配'
        });
        
        content[sourceField] = currentContent[sourceField] || '';
        console.log(`🎯 [FieldMapper] 精确匹配: ${sourceField} → ${sourceField}`);
      }
    }

    return { mappings, content };
  }

  /**
   * 语义匹配 - 基于语义分组
   */
  private findSemanticMappings(
    sourceFields: string[],
    targetFields: string[],
    currentContent: Record<string, string>
  ): { mappings: FieldMappingRule[]; content: Record<string, string> } {
    const mappings: FieldMappingRule[] = [];
    const content: Record<string, string> = {};

    // 按优先级排序语义组
    const sortedGroups = [...this.semanticGroups].sort((a, b) => a.priority - b.priority);

    for (const group of sortedGroups) {
      // 找到源字段中属于这个语义组的字段
      const sourceFieldsInGroup = sourceFields.filter(field => 
        this.isFieldInSemanticGroup(field, group)
      );

      // 找到目标字段中属于这个语义组的字段
      const targetFieldsInGroup = targetFields.filter(field => 
        this.isFieldInSemanticGroup(field, group)
      );

      // 在同一语义组内进行映射
      for (let i = 0; i < Math.min(sourceFieldsInGroup.length, targetFieldsInGroup.length); i++) {
        const sourceField = sourceFieldsInGroup[i];
        const targetField = targetFieldsInGroup[i];
        
        const confidence = this.calculateSemanticConfidence(sourceField, targetField, group);
        
        mappings.push({
          sourceField,
          targetField,
          confidence,
          mappingType: 'semantic',
          reason: `语义匹配 (${group.group}组)`
        });
        
        content[targetField] = currentContent[sourceField] || '';
        console.log(`🧠 [FieldMapper] 语义匹配: ${sourceField} → ${targetField} (${group.group})`);
      }
    }

    return { mappings, content };
  }

  /**
   * 位置匹配 - 基于字段在模板中的位置
   */
  private findPositionalMappings(
    sourceFields: string[],
    targetFields: string[],
    sourceTemplate: TriadTemplate,
    targetTemplate: TriadTemplate,
    currentContent: Record<string, string>
  ): { mappings: FieldMappingRule[]; content: Record<string, string> } {
    const mappings: FieldMappingRule[] = [];
    const content: Record<string, string> = {};

    // 获取字段在模板中的位置
    const sourcePositions = this.getFieldPositions(sourceTemplate, sourceFields);
    const targetPositions = this.getFieldPositions(targetTemplate, targetFields);

    // 按位置顺序映射
    const minLength = Math.min(sourceFields.length, targetFields.length);
    for (let i = 0; i < minLength; i++) {
      const sourceField = sourceFields[i];
      const targetField = targetFields[i];
      
      mappings.push({
        sourceField,
        targetField,
        confidence: 60,
        mappingType: 'positional',
        reason: `位置匹配 (第${i + 1}个字段)`
      });
      
      content[targetField] = currentContent[sourceField] || '';
      console.log(`📍 [FieldMapper] 位置匹配: ${sourceField} → ${targetField} (位置${i + 1})`);
    }

    return { mappings, content };
  }

  /**
   * 检查字段是否属于某个语义组
   */
  private isFieldInSemanticGroup(fieldKey: string, group: SemanticFieldGroup): boolean {
    const lowerFieldKey = fieldKey.toLowerCase();
    
    // 检查字段名
    if (group.fields.some(f => f.toLowerCase() === lowerFieldKey)) {
      return true;
    }
    
    // 检查别名
    if (group.aliases.some(alias => 
      lowerFieldKey.includes(alias.toLowerCase()) || alias.toLowerCase().includes(lowerFieldKey)
    )) {
      return true;
    }
    
    return false;
  }

  /**
   * 计算语义匹配的置信度
   */
  private calculateSemanticConfidence(sourceField: string, targetField: string, group: SemanticFieldGroup): number {
    let confidence = 80; // 基础语义匹配置信度
    
    // 如果字段名相似度高，增加置信度
    const similarity = this.calculateStringSimilarity(sourceField, targetField);
    confidence += similarity * 20;
    
    // 高优先级组增加置信度
    if (group.priority <= 2) {
      confidence += 10;
    }
    
    return Math.min(100, confidence);
  }

  /**
   * 计算字符串相似度
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * 计算编辑距离
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * 提取模板的字段键
   */
  private extractFieldKeys(template: TriadTemplate): string[] {
    return template.fieldTemplate.fields
      .filter((field: any) => field.type === 'field')
      .map((field: any) => field.key);
  }

  /**
   * 获取字段在模板中的位置
   */
  private getFieldPositions(template: TriadTemplate, fields: string[]): Record<string, number> {
    const positions: Record<string, number> = {};
    
    template.fieldTemplate.fields.forEach((field: any, index: number) => {
      if (field.type === 'field' && fields.includes(field.key)) {
        positions[field.key] = index;
      }
    });
    
    return positions;
  }

  /**
   * 生成映射预览
   */
  generateMappingPreview(mappingResult: FieldMappingResult): string {
    let preview = '字段映射预览:\n\n';
    
    mappingResult.mappings.forEach(mapping => {
      const confidenceIcon = mapping.confidence >= 90 ? '✅' : 
                           mapping.confidence >= 70 ? '⚠️' : '❓';
      preview += `${confidenceIcon} ${mapping.sourceField} → ${mapping.targetField} (${mapping.confidence}% - ${mapping.reason})\n`;
    });
    
    if (mappingResult.unmappedFields.length > 0) {
      preview += '\n未映射字段:\n';
      mappingResult.unmappedFields.forEach(field => {
        preview += `❌ ${field}\n`;
      });
    }
    
    if (mappingResult.warnings.length > 0) {
      preview += '\n⚠️ 警告:\n';
      mappingResult.warnings.forEach(warning => {
        preview += `• ${warning}\n`;
      });
    }
    
    if (mappingResult.suggestions.length > 0) {
      preview += '\n💡 建议:\n';
      mappingResult.suggestions.forEach(suggestion => {
        preview += `• ${suggestion}\n`;
      });
    }
    
    return preview;
  }
}
