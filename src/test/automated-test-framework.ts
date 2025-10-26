/**
 * 自动化测试框架
 * 批量测试不同模板和内容的解析结果，及时发现回归问题
 */

import type { TestCase, TestSuite } from './test-cases/comprehensive-test-cases';
import type { RegexParseTemplate } from '../data/template-types';
import type { EnhancedRegexParser, EnhancedParseResult } from '../utils/enhanced-regex-parser';

export interface TestResult {
  testCaseId: string;
  testCaseName: string;
  passed: boolean;
  actualResult: EnhancedParseResult;
  expectedFields: Record<string, string>;
  actualFields: Record<string, string>;
  fieldMatches: Record<string, boolean>;
  confidenceMatch: boolean;
  actualConfidence: number;
  expectedConfidence: number;
  executionTime: number;
  errors: string[];
  warnings: string[];
}

export interface TestSuiteResult {
  suiteName: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  totalExecutionTime: number;
  passRate: number;
  results: TestResult[];
  summary: TestSummary;
}

export interface TestSummary {
  categorySummary: Record<string, CategorySummary>;
  tagSummary: Record<string, TagSummary>;
  confidenceDistribution: ConfidenceDistribution;
  performanceMetrics: PerformanceMetrics;
}

export interface CategorySummary {
  category: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgExecutionTime: number;
}

export interface TagSummary {
  tag: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

export interface ConfidenceDistribution {
  excellent: number; // >= 0.9
  good: number;      // 0.8-0.89
  fair: number;      // 0.6-0.79
  poor: number;      // 0.4-0.59
  veryPoor: number;  // < 0.4
}

export interface PerformanceMetrics {
  avgExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  medianExecutionTime: number;
  slowestTests: Array<{ testId: string; time: number }>;
  fastestTests: Array<{ testId: string; time: number }>;
}

export interface TestConfiguration {
  template: RegexParseTemplate;
  parser: EnhancedRegexParser;
  toleranceThreshold: number; // 置信度容差阈值
  fieldComparisonMode: 'exact' | 'fuzzy' | 'semantic';
  enablePerformanceTracking: boolean;
  maxExecutionTime: number; // 最大执行时间（毫秒）
  skipCategories?: string[];
  skipTags?: string[];
  onlyCategories?: string[];
  onlyTags?: string[];
}

/**
 * 自动化测试框架
 * 提供完整的测试执行、结果分析和报告生成功能
 */
export class AutomatedTestFramework {
  private config: TestConfiguration;
  private testHistory: TestSuiteResult[] = [];

  constructor(config: TestConfiguration) {
    this.config = config;
  }

  /**
   * 运行单个测试用例
   */
  async runSingleTest(testCase: TestCase): Promise<TestResult> {
    const startTime = performance.now();
    
    console.log(`🧪 [TestFramework] 运行测试: ${testCase.id} - ${testCase.name}`);

    try {
      // 执行解析
      const actualResult = this.config.parser.parseContent(testCase.input, this.config.template);
      const executionTime = performance.now() - startTime;

      // 检查执行时间
      if (executionTime > this.config.maxExecutionTime) {
        console.warn(`⚠️ [TestFramework] 测试 ${testCase.id} 执行时间过长: ${executionTime}ms`);
      }

      // 比较结果
      const fieldMatches = this.compareFields(actualResult.fields, testCase.expectedFields);
      const confidenceMatch = this.compareConfidence(actualResult.confidence, testCase.expectedConfidence);

      // 判断测试是否通过
      const allFieldsMatch = Object.values(fieldMatches).every(match => match);
      const passed = allFieldsMatch && confidenceMatch;

      const result: TestResult = {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        passed,
        actualResult,
        expectedFields: testCase.expectedFields,
        actualFields: actualResult.fields,
        fieldMatches,
        confidenceMatch,
        actualConfidence: actualResult.confidence,
        expectedConfidence: testCase.expectedConfidence,
        executionTime,
        errors: [],
        warnings: actualResult.warnings || []
      };

      // 添加错误信息
      if (!passed) {
        if (!allFieldsMatch) {
          const failedFields = Object.entries(fieldMatches)
            .filter(([_, match]) => !match)
            .map(([field, _]) => field);
          result.errors.push(`字段不匹配: ${failedFields.join(', ')}`);
        }
        
        if (!confidenceMatch) {
          result.errors.push(`置信度不匹配: 期望 ${testCase.expectedConfidence}, 实际 ${actualResult.confidence}`);
        }
      }

      console.log(`${passed ? '✅' : '❌'} [TestFramework] 测试 ${testCase.id} ${passed ? '通过' : '失败'} (${executionTime.toFixed(2)}ms)`);

      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;
      
      console.error(`❌ [TestFramework] 测试 ${testCase.id} 执行异常:`, error);

      return {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        passed: false,
        actualResult: {
          success: false,
          fields: {},
          confidence: 0,
          method: 'error',
          warnings: [],
          originalContent: testCase.input
        },
        expectedFields: testCase.expectedFields,
        actualFields: {},
        fieldMatches: {},
        confidenceMatch: false,
        actualConfidence: 0,
        expectedConfidence: testCase.expectedConfidence,
        executionTime,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: []
      };
    }
  }

  /**
   * 运行测试套件
   */
  async runTestSuite(testSuite: TestSuite): Promise<TestSuiteResult> {
    const startTime = performance.now();
    
    console.log(`🚀 [TestFramework] 开始运行测试套件: ${testSuite.name}`);
    console.log(`📊 [TestFramework] 总计 ${testSuite.cases.length} 个测试用例`);

    // 过滤测试用例
    const filteredCases = this.filterTestCases(testSuite.cases);
    console.log(`🔍 [TestFramework] 过滤后 ${filteredCases.length} 个测试用例`);

    const results: TestResult[] = [];
    let passedTests = 0;
    let failedTests = 0;
    let skippedTests = testSuite.cases.length - filteredCases.length;

    // 运行所有测试用例
    for (const testCase of filteredCases) {
      const result = await this.runSingleTest(testCase);
      results.push(result);
      
      if (result.passed) {
        passedTests++;
      } else {
        failedTests++;
      }
    }

    const totalExecutionTime = performance.now() - startTime;
    const passRate = filteredCases.length > 0 ? (passedTests / filteredCases.length) * 100 : 0;

    // 生成摘要
    const summary = this.generateTestSummary(results, testSuite.cases);

    const suiteResult: TestSuiteResult = {
      suiteName: testSuite.name,
      totalTests: filteredCases.length,
      passedTests,
      failedTests,
      skippedTests,
      totalExecutionTime,
      passRate,
      results,
      summary
    };

    // 保存到历史记录
    this.testHistory.push(suiteResult);

    console.log(`🎉 [TestFramework] 测试套件完成: ${testSuite.name}`);
    console.log(`📈 [TestFramework] 通过率: ${passRate.toFixed(1)}% (${passedTests}/${filteredCases.length})`);
    console.log(`⏱️ [TestFramework] 总执行时间: ${totalExecutionTime.toFixed(2)}ms`);

    return suiteResult;
  }

  /**
   * 运行回归测试
   */
  async runRegressionTest(testSuite: TestSuite): Promise<TestSuiteResult> {
    console.log(`🔄 [TestFramework] 开始回归测试`);
    
    // 只运行回归测试用例
    const regressionCases = testSuite.cases.filter(testCase => testCase.category === 'regression');
    const regressionSuite: TestSuite = {
      name: `${testSuite.name} - 回归测试`,
      description: '回归测试套件',
      cases: regressionCases
    };

    return this.runTestSuite(regressionSuite);
  }

  /**
   * 生成测试报告
   */
  generateTestReport(suiteResult: TestSuiteResult): string {
    const report = [];
    
    report.push(`# 测试报告: ${suiteResult.suiteName}`);
    report.push(`生成时间: ${new Date().toLocaleString('zh-CN')}`);
    report.push('');
    
    // 总体统计
    report.push('## 总体统计');
    report.push(`- 总测试数: ${suiteResult.totalTests}`);
    report.push(`- 通过测试: ${suiteResult.passedTests}`);
    report.push(`- 失败测试: ${suiteResult.failedTests}`);
    report.push(`- 跳过测试: ${suiteResult.skippedTests}`);
    report.push(`- 通过率: ${suiteResult.passRate.toFixed(1)}%`);
    report.push(`- 总执行时间: ${suiteResult.totalExecutionTime.toFixed(2)}ms`);
    report.push('');

    // 分类统计
    report.push('## 分类统计');
    Object.values(suiteResult.summary.categorySummary).forEach(category => {
      report.push(`### ${category.category}`);
      report.push(`- 测试数: ${category.total}`);
      report.push(`- 通过率: ${category.passRate.toFixed(1)}%`);
      report.push(`- 平均执行时间: ${category.avgExecutionTime.toFixed(2)}ms`);
      report.push('');
    });

    // 性能指标
    report.push('## 性能指标');
    const perf = suiteResult.summary.performanceMetrics;
    report.push(`- 平均执行时间: ${perf.avgExecutionTime.toFixed(2)}ms`);
    report.push(`- 最快测试: ${perf.minExecutionTime.toFixed(2)}ms`);
    report.push(`- 最慢测试: ${perf.maxExecutionTime.toFixed(2)}ms`);
    report.push(`- 中位数: ${perf.medianExecutionTime.toFixed(2)}ms`);
    report.push('');

    // 失败测试详情
    const failedTests = suiteResult.results.filter(result => !result.passed);
    if (failedTests.length > 0) {
      report.push('## 失败测试详情');
      failedTests.forEach(test => {
        report.push(`### ${test.testCaseId}: ${test.testCaseName}`);
        report.push(`**错误信息:**`);
        test.errors.forEach(error => {
          report.push(`- ${error}`);
        });
        report.push('');
      });
    }

    return report.join('\n');
  }

  // 私有方法

  private filterTestCases(testCases: TestCase[]): TestCase[] {
    return testCases.filter(testCase => {
      // 跳过指定分类
      if (this.config.skipCategories?.includes(testCase.category)) {
        return false;
      }

      // 跳过指定标签
      if (this.config.skipTags?.some(tag => testCase.tags.includes(tag))) {
        return false;
      }

      // 只运行指定分类
      if (this.config.onlyCategories && !this.config.onlyCategories.includes(testCase.category)) {
        return false;
      }

      // 只运行指定标签
      if (this.config.onlyTags && !this.config.onlyTags.some(tag => testCase.tags.includes(tag))) {
        return false;
      }

      return true;
    });
  }

  private compareFields(actualFields: Record<string, string>, expectedFields: Record<string, string>): Record<string, boolean> {
    const matches: Record<string, boolean> = {};

    for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
      const actualValue = actualFields[fieldName] || '';
      
      switch (this.config.fieldComparisonMode) {
        case 'exact':
          matches[fieldName] = actualValue === expectedValue;
          break;
        case 'fuzzy':
          matches[fieldName] = this.fuzzyCompare(actualValue, expectedValue);
          break;
        case 'semantic':
          matches[fieldName] = this.semanticCompare(actualValue, expectedValue);
          break;
        default:
          matches[fieldName] = actualValue === expectedValue;
      }
    }

    return matches;
  }

  private compareConfidence(actualConfidence: number, expectedConfidence: number): boolean {
    return Math.abs(actualConfidence - expectedConfidence) <= this.config.toleranceThreshold;
  }

  private fuzzyCompare(actual: string, expected: string): boolean {
    // 简单的模糊比较：忽略空格和换行的差异
    const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();
    return normalize(actual) === normalize(expected);
  }

  private semanticCompare(actual: string, expected: string): boolean {
    // 简单的语义比较：检查关键词覆盖率
    const extractKeywords = (str: string) => {
      return str.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2);
    };

    const actualKeywords = new Set(extractKeywords(actual));
    const expectedKeywords = new Set(extractKeywords(expected));
    
    const intersection = new Set([...actualKeywords].filter(x => expectedKeywords.has(x)));
    const coverage = intersection.size / expectedKeywords.size;
    
    return coverage >= 0.8; // 80%关键词覆盖率
  }

  private generateTestSummary(results: TestResult[], allTestCases: TestCase[]): TestSummary {
    // 分类统计
    const categorySummary: Record<string, CategorySummary> = {};
    const tagSummary: Record<string, TagSummary> = {};

    // 初始化分类统计
    allTestCases.forEach(testCase => {
      if (!categorySummary[testCase.category]) {
        categorySummary[testCase.category] = {
          category: testCase.category,
          total: 0,
          passed: 0,
          failed: 0,
          passRate: 0,
          avgExecutionTime: 0
        };
      }
      categorySummary[testCase.category].total++;

      // 标签统计
      testCase.tags.forEach(tag => {
        if (!tagSummary[tag]) {
          tagSummary[tag] = {
            tag,
            total: 0,
            passed: 0,
            failed: 0,
            passRate: 0
          };
        }
        tagSummary[tag].total++;
      });
    });

    // 统计结果
    results.forEach(result => {
      const testCase = allTestCases.find(tc => tc.id === result.testCaseId);
      if (!testCase) return;

      const category = categorySummary[testCase.category];
      if (result.passed) {
        category.passed++;
      } else {
        category.failed++;
      }
      category.avgExecutionTime += result.executionTime;

      // 标签统计
      testCase.tags.forEach(tag => {
        const tagStat = tagSummary[tag];
        if (result.passed) {
          tagStat.passed++;
        } else {
          tagStat.failed++;
        }
      });
    });

    // 计算平均值和通过率
    Object.values(categorySummary).forEach(category => {
      if (category.total > 0) {
        category.passRate = (category.passed / category.total) * 100;
        category.avgExecutionTime = category.avgExecutionTime / category.total;
      }
    });

    Object.values(tagSummary).forEach(tag => {
      if (tag.total > 0) {
        tag.passRate = (tag.passed / tag.total) * 100;
      }
    });

    // 置信度分布
    const confidenceDistribution: ConfidenceDistribution = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      veryPoor: 0
    };

    results.forEach(result => {
      const confidence = result.actualConfidence;
      if (confidence >= 0.9) confidenceDistribution.excellent++;
      else if (confidence >= 0.8) confidenceDistribution.good++;
      else if (confidence >= 0.6) confidenceDistribution.fair++;
      else if (confidence >= 0.4) confidenceDistribution.poor++;
      else confidenceDistribution.veryPoor++;
    });

    // 性能指标
    const executionTimes = results.map(r => r.executionTime).sort((a, b) => a - b);
    const performanceMetrics: PerformanceMetrics = {
      avgExecutionTime: executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length,
      minExecutionTime: executionTimes[0] || 0,
      maxExecutionTime: executionTimes[executionTimes.length - 1] || 0,
      medianExecutionTime: executionTimes[Math.floor(executionTimes.length / 2)] || 0,
      slowestTests: results
        .sort((a, b) => b.executionTime - a.executionTime)
        .slice(0, 5)
        .map(r => ({ testId: r.testCaseId, time: r.executionTime })),
      fastestTests: results
        .sort((a, b) => a.executionTime - b.executionTime)
        .slice(0, 5)
        .map(r => ({ testId: r.testCaseId, time: r.executionTime }))
    };

    return {
      categorySummary,
      tagSummary,
      confidenceDistribution,
      performanceMetrics
    };
  }

  /**
   * 获取测试历史
   */
  getTestHistory(): TestSuiteResult[] {
    return [...this.testHistory];
  }

  /**
   * 清除测试历史
   */
  clearTestHistory(): void {
    this.testHistory = [];
  }

  /**
   * 更新配置
   */
  updateConfiguration(newConfig: Partial<TestConfiguration>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
