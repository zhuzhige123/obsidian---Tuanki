/**
 * 自定义匹配模式管理器
 * 允许用户创建、管理和使用自定义的解析模式
 */

import { MatchPattern } from './multi-pattern-matcher';

export interface CustomPatternConfig {
  name: string;
  description: string;
  regex: string;
  flags: string;
  fieldMappings: Record<string, number>;
  priority: number;
  category: string;
  examples: string[];
  testCases?: CustomPatternTestCase[];
}

export interface CustomPatternTestCase {
  name: string;
  input: string;
  expectedFields: Record<string, string>;
  shouldMatch: boolean;
}

export interface PatternValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  complexity: number;
  performance: {
    averageTime: number;
    maxTime: number;
    iterations: number;
  };
}

export interface PatternTestResult {
  testCase: CustomPatternTestCase;
  passed: boolean;
  actualFields: Record<string, string>;
  error?: string;
  executionTime: number;
}

/**
 * 自定义匹配模式管理器
 */
export class CustomPatternManager {
  private customPatterns: Map<string, CustomPatternConfig> = new Map();
  private patternCache: Map<string, RegExp> = new Map();

  /**
   * 创建自定义模式
   */
  createCustomPattern(config: CustomPatternConfig): {
    success: boolean;
    patternId?: string;
    errors?: string[];
  } {
    console.log(`➕ [CustomPatternManager] 创建自定义模式: ${config.name}`);

    // 验证配置
    const validation = this.validatePatternConfig(config);
    if (!validation.isValid) {
      return {
        success: false,
        errors: validation.errors
      };
    }

    // 生成唯一ID
    const patternId = this.generatePatternId(config.name);
    
    // 保存模式
    this.customPatterns.set(patternId, { ...config });
    
    // 清除缓存
    this.patternCache.clear();
    
    console.log(`✅ [CustomPatternManager] 自定义模式创建成功: ${patternId}`);
    
    return {
      success: true,
      patternId
    };
  }

  /**
   * 更新自定义模式
   */
  updateCustomPattern(patternId: string, config: Partial<CustomPatternConfig>): {
    success: boolean;
    errors?: string[];
  } {
    const existingPattern = this.customPatterns.get(patternId);
    if (!existingPattern) {
      return {
        success: false,
        errors: [`模式 ${patternId} 不存在`]
      };
    }

    const updatedConfig = { ...existingPattern, ...config };
    const validation = this.validatePatternConfig(updatedConfig);
    
    if (!validation.isValid) {
      return {
        success: false,
        errors: validation.errors
      };
    }

    this.customPatterns.set(patternId, updatedConfig);
    this.patternCache.delete(patternId);
    
    console.log(`🔄 [CustomPatternManager] 模式更新成功: ${patternId}`);
    
    return { success: true };
  }

  /**
   * 删除自定义模式
   */
  deleteCustomPattern(patternId: string): boolean {
    const deleted = this.customPatterns.delete(patternId);
    if (deleted) {
      this.patternCache.delete(patternId);
      console.log(`🗑️ [CustomPatternManager] 模式删除成功: ${patternId}`);
    }
    return deleted;
  }

  /**
   * 获取自定义模式
   */
  getCustomPattern(patternId: string): CustomPatternConfig | undefined {
    return this.customPatterns.get(patternId);
  }

  /**
   * 获取所有自定义模式
   */
  getAllCustomPatterns(): Map<string, CustomPatternConfig> {
    return new Map(this.customPatterns);
  }

  /**
   * 将自定义模式转换为匹配模式
   */
  convertToMatchPattern(patternId: string): MatchPattern | null {
    const config = this.customPatterns.get(patternId);
    if (!config) {
      return null;
    }

    try {
      const regex = new RegExp(config.regex, config.flags);
      
      return {
        id: patternId,
        name: config.name,
        description: config.description,
        regex,
        priority: config.priority,
        fieldMapping: config.fieldMappings,
        examples: config.examples,
        category: config.category as any,
        confidence: 0.8 // 自定义模式的默认置信度
      };
    } catch (error) {
      console.error(`❌ [CustomPatternManager] 转换模式失败: ${patternId}`, error);
      return null;
    }
  }

  /**
   * 获取所有有效的匹配模式
   */
  getAllMatchPatterns(): MatchPattern[] {
    const patterns: MatchPattern[] = [];
    
    for (const [patternId] of this.customPatterns) {
      const matchPattern = this.convertToMatchPattern(patternId);
      if (matchPattern) {
        patterns.push(matchPattern);
      }
    }
    
    return patterns;
  }

  /**
   * 验证模式配置
   */
  validatePatternConfig(config: CustomPatternConfig): PatternValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 验证基本字段
    if (!config.name || config.name.trim().length === 0) {
      errors.push('模式名称不能为空');
    }

    if (!config.regex || config.regex.trim().length === 0) {
      errors.push('正则表达式不能为空');
    }

    if (!config.fieldMappings || Object.keys(config.fieldMappings).length === 0) {
      errors.push('字段映射不能为空');
    }

    // 验证正则表达式
    let regex: RegExp | null = null;
    let complexity = 0;
    
    if (config.regex) {
      try {
        regex = new RegExp(config.regex, config.flags || '');
        complexity = this.calculateRegexComplexity(config.regex);
        
        if (complexity > 100) {
          warnings.push('正则表达式过于复杂，可能影响性能');
        }
      } catch (error) {
        errors.push(`正则表达式语法错误: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 验证字段映射
    if (config.fieldMappings) {
      const groupIndices = Object.values(config.fieldMappings);
      const maxGroup = Math.max(...groupIndices);
      
      if (regex) {
        // 检查捕获组数量
        const testMatch = ''.match(regex);
        // 注意：这里无法准确检测捕获组数量，只能给出建议
        if (maxGroup > 10) {
          warnings.push('捕获组数量较多，请确保正则表达式包含足够的捕获组');
        }
      }

      // 检查重复的组索引
      const duplicateGroups = groupIndices.filter((index, i) => groupIndices.indexOf(index) !== i);
      if (duplicateGroups.length > 0) {
        errors.push(`字段映射包含重复的捕获组索引: ${duplicateGroups.join(', ')}`);
      }
    }

    // 验证优先级
    if (config.priority < 0 || config.priority > 100) {
      warnings.push('建议优先级设置在0-100之间');
    }

    // 性能测试
    const performance = regex ? this.performanceTest(regex) : {
      averageTime: 0,
      maxTime: 0,
      iterations: 0
    };

    if (performance.averageTime > 10) {
      warnings.push('正则表达式执行时间较长，可能影响性能');
    }

    // 生成建议
    if (config.examples.length === 0) {
      suggestions.push('建议添加示例以便测试和理解');
    }

    if (!config.testCases || config.testCases.length === 0) {
      suggestions.push('建议添加测试用例以验证模式正确性');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      complexity,
      performance
    };
  }

  /**
   * 测试自定义模式
   */
  testCustomPattern(patternId: string): {
    success: boolean;
    results: PatternTestResult[];
    summary: {
      totalTests: number;
      passedTests: number;
      failedTests: number;
      averageExecutionTime: number;
    };
  } {
    const config = this.customPatterns.get(patternId);
    if (!config) {
      return {
        success: false,
        results: [],
        summary: { totalTests: 0, passedTests: 0, failedTests: 0, averageExecutionTime: 0 }
      };
    }

    const testCases = config.testCases || [];
    if (testCases.length === 0) {
      return {
        success: true,
        results: [],
        summary: { totalTests: 0, passedTests: 0, failedTests: 0, averageExecutionTime: 0 }
      };
    }

    const results: PatternTestResult[] = [];
    let totalExecutionTime = 0;

    try {
      const regex = new RegExp(config.regex, config.flags || '');

      for (const testCase of testCases) {
        const startTime = Date.now();
        
        try {
          const match = testCase.input.match(regex);
          const executionTime = Date.now() - startTime;
          totalExecutionTime += executionTime;

          if (testCase.shouldMatch && match) {
            // 提取字段
            const actualFields: Record<string, string> = {};
            Object.entries(config.fieldMappings).forEach(([fieldKey, groupIndex]) => {
              actualFields[fieldKey] = match[groupIndex] || '';
            });

            // 检查字段是否匹配预期
            const fieldsMatch = this.compareFields(actualFields, testCase.expectedFields);

            results.push({
              testCase,
              passed: fieldsMatch,
              actualFields,
              executionTime,
              error: fieldsMatch ? undefined : '字段内容不匹配预期'
            });
          } else if (!testCase.shouldMatch && !match) {
            results.push({
              testCase,
              passed: true,
              actualFields: {},
              executionTime
            });
          } else {
            results.push({
              testCase,
              passed: false,
              actualFields: {},
              executionTime,
              error: testCase.shouldMatch ? '应该匹配但未匹配' : '不应该匹配但匹配了'
            });
          }
        } catch (error) {
          const executionTime = Date.now() - startTime;
          totalExecutionTime += executionTime;

          results.push({
            testCase,
            passed: false,
            actualFields: {},
            executionTime,
            error: `测试执行错误: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }
    } catch (error) {
      return {
        success: false,
        results: [],
        summary: { totalTests: 0, passedTests: 0, failedTests: 0, averageExecutionTime: 0 }
      };
    }

    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;
    const averageExecutionTime = totalExecutionTime / results.length;

    return {
      success: true,
      results,
      summary: {
        totalTests: results.length,
        passedTests,
        failedTests,
        averageExecutionTime
      }
    };
  }

  /**
   * 导出自定义模式
   */
  exportPatterns(): string {
    const patterns = Array.from(this.customPatterns.entries()).map(([id, config]) => ({
      id,
      ...config
    }));
    
    return JSON.stringify(patterns, null, 2);
  }

  /**
   * 导入自定义模式
   */
  importPatterns(jsonData: string): {
    success: boolean;
    imported: number;
    errors: string[];
  } {
    try {
      const patterns = JSON.parse(jsonData);
      let imported = 0;
      const errors: string[] = [];

      if (!Array.isArray(patterns)) {
        return {
          success: false,
          imported: 0,
          errors: ['导入数据格式错误，应为数组']
        };
      }

      for (const pattern of patterns) {
        try {
          const { id, ...config } = pattern;
          const validation = this.validatePatternConfig(config);
          
          if (validation.isValid) {
            const patternId = id || this.generatePatternId(config.name);
            this.customPatterns.set(patternId, config);
            imported++;
          } else {
            errors.push(`模式 "${config.name}" 验证失败: ${validation.errors.join(', ')}`);
          }
        } catch (error) {
          errors.push(`导入模式失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      this.patternCache.clear();

      return {
        success: imported > 0,
        imported,
        errors
      };
    } catch (error) {
      return {
        success: false,
        imported: 0,
        errors: [`JSON解析失败: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  // 私有辅助方法

  private generatePatternId(name: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return `custom_${safeName}_${timestamp}_${random}`;
  }

  private calculateRegexComplexity(regex: string): number {
    let complexity = regex.length;
    
    // 增加复杂度的因素
    complexity += (regex.match(/[+*?{]/g) || []).length * 2; // 量词
    complexity += (regex.match(/[()]/g) || []).length; // 分组
    complexity += (regex.match(/[|]/g) || []).length * 3; // 选择
    complexity += (regex.match(/\[.*?\]/g) || []).length * 2; // 字符类
    complexity += (regex.match(/\\./g) || []).length; // 转义字符
    
    return complexity;
  }

  private performanceTest(regex: RegExp): {
    averageTime: number;
    maxTime: number;
    iterations: number;
  } {
    const testStrings = [
      'Simple test string',
      '## This is a heading\nWith some content below',
      'Q: What is this?\nA: This is an answer',
      '**Bold question**: Regular answer text',
      'Very long text '.repeat(100)
    ];

    const iterations = 50;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const testString = testStrings[i % testStrings.length];
      const startTime = performance.now();
      
      try {
        testString.match(regex);
      } catch (error) {
        // 忽略错误，只测试性能
      }
      
      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const maxTime = Math.max(...times);

    return {
      averageTime,
      maxTime,
      iterations
    };
  }

  private compareFields(actual: Record<string, string>, expected: Record<string, string>): boolean {
    const expectedKeys = Object.keys(expected);
    
    for (const key of expectedKeys) {
      if (actual[key] !== expected[key]) {
        return false;
      }
    }
    
    return true;
  }
}
