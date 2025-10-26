/**
 * 解析结果验证器
 * 检测内容截断、数据完整性和解析质量
 */

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  issues: ValidationIssue[];
  suggestions: string[];
  statistics: ValidationStatistics;
}

export interface ValidationIssue {
  type: 'truncation' | 'missing_field' | 'low_quality' | 'format_mismatch' | 'data_loss';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  field?: string;
  details?: any;
}

export interface ValidationStatistics {
  originalLength: number;
  parsedLength: number;
  coverage: number;
  fieldCount: number;
  emptyFields: number;
  averageFieldLength: number;
  contentDistribution: Record<string, number>;
}

export interface ParsedFields {
  [key: string]: string;
}

/**
 * 解析结果验证器
 * 提供全面的解析质量检查和问题诊断
 */
export class ParseResultValidator {
  private readonly MIN_COVERAGE_THRESHOLD = 0.85;
  private readonly MIN_FIELD_LENGTH = 3;
  private readonly MAX_FIELD_LENGTH = 10000;
  private readonly CRITICAL_FIELDS = ['question', 'answer', 'front', 'back'];

  /**
   * 验证解析结果的完整性和质量
   */
  validateParseResult(
    originalContent: string,
    parsedFields: ParsedFields,
    expectedFields?: string[]
  ): ValidationResult {
    const statistics = this.calculateStatistics(originalContent, parsedFields);
    const issues: ValidationIssue[] = [];
    
    // 1. 检查内容覆盖率（截断检测）
    this.checkContentCoverage(statistics, issues);
    
    // 2. 检查字段完整性
    this.checkFieldCompleteness(parsedFields, expectedFields, issues);
    
    // 3. 检查字段质量
    this.checkFieldQuality(parsedFields, issues);
    
    // 4. 检查内容分布合理性
    this.checkContentDistribution(statistics, issues);
    
    // 5. 检查数据丢失
    this.checkDataLoss(originalContent, parsedFields, issues);
    
    // 计算总体置信度
    const confidence = this.calculateConfidence(statistics, issues);
    
    // 生成修复建议
    const suggestions = this.generateSuggestions(issues, statistics);
    
    return {
      isValid: issues.filter(i => i.severity === 'critical').length === 0,
      confidence,
      issues,
      suggestions,
      statistics
    };
  }

  /**
   * 计算解析统计信息
   */
  private calculateStatistics(originalContent: string, parsedFields: ParsedFields): ValidationStatistics {
    const originalLength = originalContent.replace(/\s+/g, '').length;
    const parsedContent = Object.values(parsedFields).join('');
    const parsedLength = parsedContent.replace(/\s+/g, '').length;
    
    const fieldCount = Object.keys(parsedFields).length;
    const emptyFields = Object.values(parsedFields).filter(v => !v.trim()).length;
    const nonEmptyFields = Object.values(parsedFields).filter(v => v.trim());
    const averageFieldLength = nonEmptyFields.length > 0 
      ? nonEmptyFields.reduce((sum, field) => sum + field.length, 0) / nonEmptyFields.length 
      : 0;
    
    const contentDistribution: Record<string, number> = {};
    Object.entries(parsedFields).forEach(([key, value]) => {
      contentDistribution[key] = value.length;
    });
    
    return {
      originalLength,
      parsedLength,
      coverage: originalLength > 0 ? parsedLength / originalLength : 0,
      fieldCount,
      emptyFields,
      averageFieldLength,
      contentDistribution
    };
  }

  /**
   * 检查内容覆盖率（主要用于截断检测）
   */
  private checkContentCoverage(statistics: ValidationStatistics, issues: ValidationIssue[]): void {
    if (statistics.coverage < this.MIN_COVERAGE_THRESHOLD) {
      const missingPercentage = (1 - statistics.coverage) * 100;
      
      issues.push({
        type: 'truncation',
        severity: statistics.coverage < 0.5 ? 'critical' : 'warning',
        message: `内容覆盖率仅${(statistics.coverage * 100).toFixed(1)}%，可能存在${missingPercentage.toFixed(1)}%的内容截断`,
        details: {
          coverage: statistics.coverage,
          originalLength: statistics.originalLength,
          parsedLength: statistics.parsedLength,
          missingCharacters: statistics.originalLength - statistics.parsedLength
        }
      });
    }
  }

  /**
   * 检查字段完整性
   */
  private checkFieldCompleteness(
    parsedFields: ParsedFields, 
    expectedFields: string[] | undefined, 
    issues: ValidationIssue[]
  ): void {
    // 检查关键字段是否存在
    for (const criticalField of this.CRITICAL_FIELDS) {
      if (expectedFields?.includes(criticalField) && !parsedFields[criticalField]) {
        issues.push({
          type: 'missing_field',
          severity: 'critical',
          message: `关键字段 "${criticalField}" 缺失`,
          field: criticalField
        });
      }
    }

    // 检查预期字段
    if (expectedFields) {
      for (const expectedField of expectedFields) {
        if (!parsedFields[expectedField]) {
          issues.push({
            type: 'missing_field',
            severity: 'warning',
            message: `预期字段 "${expectedField}" 缺失`,
            field: expectedField
          });
        }
      }
    }

    // 检查空字段
    const emptyFields = Object.entries(parsedFields)
      .filter(([key, value]) => key !== 'notes' && !value.trim())
      .map(([key]) => key);

    if (emptyFields.length > 0) {
      issues.push({
        type: 'missing_field',
        severity: 'warning',
        message: `发现${emptyFields.length}个空字段: ${emptyFields.join(', ')}`,
        details: { emptyFields }
      });
    }
  }

  /**
   * 检查字段质量
   */
  private checkFieldQuality(parsedFields: ParsedFields, issues: ValidationIssue[]): void {
    Object.entries(parsedFields).forEach(([fieldKey, fieldValue]) => {
      if (fieldKey === 'notes') return; // notes字段不检查质量
      
      const trimmedValue = fieldValue.trim();
      
      // 检查字段长度
      if (trimmedValue.length > 0 && trimmedValue.length < this.MIN_FIELD_LENGTH) {
        issues.push({
          type: 'low_quality',
          severity: 'warning',
          message: `字段 "${fieldKey}" 内容过短 (${trimmedValue.length} 字符)`,
          field: fieldKey,
          details: { length: trimmedValue.length, content: trimmedValue }
        });
      }
      
      if (trimmedValue.length > this.MAX_FIELD_LENGTH) {
        issues.push({
          type: 'low_quality',
          severity: 'warning',
          message: `字段 "${fieldKey}" 内容过长 (${trimmedValue.length} 字符)，可能包含了其他字段的内容`,
          field: fieldKey,
          details: { length: trimmedValue.length }
        });
      }
      
      // 检查问题字段的质量
      if (fieldKey === 'question' && trimmedValue) {
        if (!this.isValidQuestion(trimmedValue)) {
          issues.push({
            type: 'low_quality',
            severity: 'info',
            message: `问题字段可能不是有效的问题格式: "${trimmedValue.substring(0, 50)}..."`,
            field: fieldKey
          });
        }
      }
    });
  }

  /**
   * 检查内容分布合理性
   */
  private checkContentDistribution(statistics: ValidationStatistics, issues: ValidationIssue[]): void {
    const { contentDistribution } = statistics;
    const totalLength = Object.values(contentDistribution).reduce((sum, len) => sum + len, 0);
    
    // 检查是否有字段占用了过多内容
    Object.entries(contentDistribution).forEach(([fieldKey, length]) => {
      if (fieldKey === 'notes') return;
      
      const percentage = totalLength > 0 ? (length / totalLength) * 100 : 0;
      
      if (percentage > 80) {
        issues.push({
          type: 'format_mismatch',
          severity: 'warning',
          message: `字段 "${fieldKey}" 占用了${percentage.toFixed(1)}%的内容，可能存在解析边界问题`,
          field: fieldKey,
          details: { percentage, length }
        });
      }
    });
  }

  /**
   * 检查数据丢失
   */
  private checkDataLoss(originalContent: string, parsedFields: ParsedFields, issues: ValidationIssue[]): void {
    // 检查重要内容是否丢失
    const importantPatterns = [
      /```[\s\S]*?```/g, // 代码块
      /!\[.*?\]\(.*?\)/g, // 图片
      /\[.*?\]\(.*?\)/g, // 链接
      /#{1,6}\s+.+/g, // 标题
      /\*\*.*?\*\*/g, // 粗体
      /\*.*?\*/g, // 斜体
    ];
    
    const originalMatches = new Set();
    const parsedContent = Object.values(parsedFields).join('\n');
    
    importantPatterns.forEach(pattern => {
      const matches = originalContent.match(pattern) || [];
      matches.forEach(match => originalMatches.add(match));
    });
    
    const lostContent: string[] = [];
    originalMatches.forEach(match => {
      if (!parsedContent.includes(match as string)) {
        lostContent.push(match as string);
      }
    });
    
    if (lostContent.length > 0) {
      issues.push({
        type: 'data_loss',
        severity: 'warning',
        message: `检测到${lostContent.length}个重要内容可能丢失（代码块、图片、链接等）`,
        details: { lostContent: lostContent.slice(0, 5) } // 只显示前5个
      });
    }
  }

  /**
   * 计算总体置信度
   */
  private calculateConfidence(statistics: ValidationStatistics, issues: ValidationIssue[]): number {
    let confidence = 1.0;
    
    // 基于覆盖率的置信度
    confidence *= statistics.coverage;
    
    // 基于问题严重程度的置信度调整
    issues.forEach(issue => {
      switch (issue.severity) {
        case 'critical':
          confidence *= 0.3;
          break;
        case 'warning':
          confidence *= 0.8;
          break;
        case 'info':
          confidence *= 0.95;
          break;
      }
    });
    
    // 基于字段完整性的置信度
    if (statistics.emptyFields > 0) {
      const emptyRatio = statistics.emptyFields / statistics.fieldCount;
      confidence *= (1 - emptyRatio * 0.5);
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * 生成修复建议
   */
  private generateSuggestions(issues: ValidationIssue[], statistics: ValidationStatistics): string[] {
    const suggestions: string[] = [];
    
    // 基于问题类型生成建议
    const issueTypes = new Set(issues.map(i => i.type));
    
    if (issueTypes.has('truncation')) {
      suggestions.push('检查正则表达式的边界匹配规则，确保使用贪婪匹配');
      suggestions.push('验证模板的字段映射是否正确');
      suggestions.push('考虑使用智能边界识别算法');
    }
    
    if (issueTypes.has('missing_field')) {
      suggestions.push('检查原始内容是否包含所有必需的字段');
      suggestions.push('验证正则表达式的捕获组设置');
      suggestions.push('考虑调整模板以匹配实际内容格式');
    }
    
    if (issueTypes.has('low_quality')) {
      suggestions.push('检查字段内容是否被正确识别和分割');
      suggestions.push('验证内容格式是否符合模板预期');
    }
    
    if (issueTypes.has('data_loss')) {
      suggestions.push('确保notes字段保存了完整的原始内容');
      suggestions.push('检查特殊格式内容（代码块、链接等）的处理');
    }
    
    // 基于统计信息生成建议
    if (statistics.coverage < 0.5) {
      suggestions.push('内容覆盖率过低，建议使用保护性解析策略');
    }
    
    return suggestions;
  }

  /**
   * 检查是否为有效的问题格式
   */
  private isValidQuestion(text: string): boolean {
    const questionPatterns = [
      /[？?]$/, // 以问号结尾
      /^(什么|如何|为什么|怎么|哪个|哪些|何时|何地|Who|What|When|Where|Why|How)/i, // 疑问词开头
      /^(请|试|解释|说明|描述|分析|比较|列举)/i, // 指令性开头
    ];
    
    return questionPatterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * 快速验证方法 - 仅检查关键问题
   */
  quickValidate(originalContent: string, parsedFields: ParsedFields): {
    hasIssues: boolean;
    criticalIssues: string[];
    coverage: number;
  } {
    const statistics = this.calculateStatistics(originalContent, parsedFields);
    const criticalIssues: string[] = [];
    
    if (statistics.coverage < 0.5) {
      criticalIssues.push(`严重内容截断：覆盖率仅${(statistics.coverage * 100).toFixed(1)}%`);
    }
    
    const emptyFields = Object.entries(parsedFields)
      .filter(([key, value]) => key !== 'notes' && !value.trim())
      .map(([key]) => key);
    
    if (emptyFields.length > 0) {
      criticalIssues.push(`关键字段为空：${emptyFields.join(', ')}`);
    }
    
    return {
      hasIssues: criticalIssues.length > 0,
      criticalIssues,
      coverage: statistics.coverage
    };
  }
}
