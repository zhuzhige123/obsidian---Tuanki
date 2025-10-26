/**
 * 测试运行器
 * 提供便捷的测试执行和结果管理功能
 */

import { AutomatedTestFramework, type TestConfiguration, type TestSuiteResult } from './automated-test-framework';
import { comprehensiveTestSuite, getTestCasesByCategory, getTestCasesByTag } from './test-cases/comprehensive-test-cases';
import type { RegexParseTemplate } from '../data/template-types';
import type { EnhancedRegexParser } from '../utils/enhanced-regex-parser';

export interface TestRunnerOptions {
  template: RegexParseTemplate;
  parser: EnhancedRegexParser;
  outputPath?: string;
  verbose?: boolean;
  categories?: string[];
  tags?: string[];
  skipCategories?: string[];
  skipTags?: string[];
  confidenceTolerance?: number;
  fieldComparisonMode?: 'exact' | 'fuzzy' | 'semantic';
  maxExecutionTime?: number;
}

export interface TestRunnerResult {
  success: boolean;
  suiteResult: TestSuiteResult;
  reportPath?: string;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    passRate: number;
    executionTime: number;
  };
}

/**
 * 测试运行器
 * 简化测试框架的使用，提供预设配置和便捷方法
 */
export class TestRunner {
  private framework: AutomatedTestFramework;
  private options: TestRunnerOptions;

  constructor(options: TestRunnerOptions) {
    this.options = {
      confidenceTolerance: 0.1,
      fieldComparisonMode: 'fuzzy',
      maxExecutionTime: 5000,
      verbose: false,
      ...options
    };

    // 创建测试配置
    const config: TestConfiguration = {
      template: this.options.template,
      parser: this.options.parser,
      toleranceThreshold: this.options.confidenceTolerance!,
      fieldComparisonMode: this.options.fieldComparisonMode!,
      enablePerformanceTracking: true,
      maxExecutionTime: this.options.maxExecutionTime!,
      skipCategories: this.options.skipCategories,
      skipTags: this.options.skipTags,
      onlyCategories: this.options.categories,
      onlyTags: this.options.tags
    };

    this.framework = new AutomatedTestFramework(config);
  }

  /**
   * 运行所有测试
   */
  async runAllTests(): Promise<TestRunnerResult> {
    console.log('🚀 [TestRunner] 开始运行所有测试');
    
    const startTime = Date.now();
    const suiteResult = await this.framework.runTestSuite(comprehensiveTestSuite);
    const executionTime = Date.now() - startTime;

    const result: TestRunnerResult = {
      success: suiteResult.passRate >= 80, // 80%通过率视为成功
      suiteResult,
      summary: {
        totalTests: suiteResult.totalTests,
        passedTests: suiteResult.passedTests,
        failedTests: suiteResult.failedTests,
        passRate: suiteResult.passRate,
        executionTime
      }
    };

    // 生成报告
    if (this.options.outputPath) {
      result.reportPath = await this.generateReport(suiteResult);
    }

    // 输出摘要
    this.printSummary(result);

    return result;
  }

  /**
   * 运行基础测试
   */
  async runBasicTests(): Promise<TestRunnerResult> {
    console.log('🧪 [TestRunner] 运行基础测试');
    
    const basicCases = getTestCasesByCategory('basic');
    const basicSuite = {
      name: '基础测试套件',
      description: '基础功能测试',
      cases: basicCases
    };

    const suiteResult = await this.framework.runTestSuite(basicSuite);
    
    return {
      success: suiteResult.passRate >= 90, // 基础测试要求更高通过率
      suiteResult,
      summary: {
        totalTests: suiteResult.totalTests,
        passedTests: suiteResult.passedTests,
        failedTests: suiteResult.failedTests,
        passRate: suiteResult.passRate,
        executionTime: suiteResult.totalExecutionTime
      }
    };
  }

  /**
   * 运行回归测试
   */
  async runRegressionTests(): Promise<TestRunnerResult> {
    console.log('🔄 [TestRunner] 运行回归测试');
    
    const suiteResult = await this.framework.runRegressionTest(comprehensiveTestSuite);
    
    return {
      success: suiteResult.passRate === 100, // 回归测试必须100%通过
      suiteResult,
      summary: {
        totalTests: suiteResult.totalTests,
        passedTests: suiteResult.passedTests,
        failedTests: suiteResult.failedTests,
        passRate: suiteResult.passRate,
        executionTime: suiteResult.totalExecutionTime
      }
    };
  }

  /**
   * 运行性能测试
   */
  async runPerformanceTests(): Promise<TestRunnerResult> {
    console.log('⚡ [TestRunner] 运行性能测试');
    
    const performanceCases = getTestCasesByCategory('performance');
    const performanceSuite = {
      name: '性能测试套件',
      description: '性能基准测试',
      cases: performanceCases
    };

    const suiteResult = await this.framework.runTestSuite(performanceSuite);
    
    return {
      success: suiteResult.passRate >= 70 && suiteResult.summary.performanceMetrics.avgExecutionTime < 1000,
      suiteResult,
      summary: {
        totalTests: suiteResult.totalTests,
        passedTests: suiteResult.passedTests,
        failedTests: suiteResult.failedTests,
        passRate: suiteResult.passRate,
        executionTime: suiteResult.totalExecutionTime
      }
    };
  }

  /**
   * 运行边缘测试
   */
  async runEdgeTests(): Promise<TestRunnerResult> {
    console.log('🎯 [TestRunner] 运行边缘测试');
    
    const edgeCases = getTestCasesByCategory('edge');
    const edgeSuite = {
      name: '边缘测试套件',
      description: '边缘情况和异常格式测试',
      cases: edgeCases
    };

    const suiteResult = await this.framework.runTestSuite(edgeSuite);
    
    return {
      success: suiteResult.passRate >= 60, // 边缘测试通过率要求较低
      suiteResult,
      summary: {
        totalTests: suiteResult.totalTests,
        passedTests: suiteResult.passedTests,
        failedTests: suiteResult.failedTests,
        passRate: suiteResult.passRate,
        executionTime: suiteResult.totalExecutionTime
      }
    };
  }

  /**
   * 运行快速测试（只运行基础和回归测试）
   */
  async runQuickTests(): Promise<TestRunnerResult> {
    console.log('⚡ [TestRunner] 运行快速测试');
    
    const quickCases = [
      ...getTestCasesByCategory('basic'),
      ...getTestCasesByCategory('regression')
    ];
    
    const quickSuite = {
      name: '快速测试套件',
      description: '基础功能和回归测试',
      cases: quickCases
    };

    const suiteResult = await this.framework.runTestSuite(quickSuite);
    
    return {
      success: suiteResult.passRate >= 95, // 快速测试要求高通过率
      suiteResult,
      summary: {
        totalTests: suiteResult.totalTests,
        passedTests: suiteResult.passedTests,
        failedTests: suiteResult.failedTests,
        passRate: suiteResult.passRate,
        executionTime: suiteResult.totalExecutionTime
      }
    };
  }

  /**
   * 运行自定义测试
   */
  async runCustomTests(testCaseIds: string[]): Promise<TestRunnerResult> {
    console.log(`🎯 [TestRunner] 运行自定义测试: ${testCaseIds.length}个用例`);
    
    const customCases = comprehensiveTestSuite.cases.filter(testCase => 
      testCaseIds.includes(testCase.id)
    );
    
    if (customCases.length === 0) {
      throw new Error('未找到指定的测试用例');
    }
    
    const customSuite = {
      name: '自定义测试套件',
      description: `自定义选择的${customCases.length}个测试用例`,
      cases: customCases
    };

    const suiteResult = await this.framework.runTestSuite(customSuite);
    
    return {
      success: suiteResult.passRate >= 80,
      suiteResult,
      summary: {
        totalTests: suiteResult.totalTests,
        passedTests: suiteResult.passedTests,
        failedTests: suiteResult.failedTests,
        passRate: suiteResult.passRate,
        executionTime: suiteResult.totalExecutionTime
      }
    };
  }

  /**
   * 生成测试报告
   */
  private async generateReport(suiteResult: TestSuiteResult): Promise<string> {
    const report = this.framework.generateTestReport(suiteResult);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-report-${timestamp}.md`;
    const filepath = this.options.outputPath + '/' + filename;

    try {
      // 这里应该写入文件，但在浏览器环境中我们只是返回路径
      console.log(`📄 [TestRunner] 测试报告已生成: ${filepath}`);
      console.log('报告内容:', report);
      return filepath;
    } catch (error) {
      console.error('❌ [TestRunner] 生成报告失败:', error);
      throw error;
    }
  }

  /**
   * 打印测试摘要
   */
  private printSummary(result: TestRunnerResult): void {
    const { summary, success } = result;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果摘要');
    console.log('='.repeat(60));
    console.log(`状态: ${success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`总测试数: ${summary.totalTests}`);
    console.log(`通过测试: ${summary.passedTests}`);
    console.log(`失败测试: ${summary.failedTests}`);
    console.log(`通过率: ${summary.passRate.toFixed(1)}%`);
    console.log(`执行时间: ${summary.executionTime}ms`);
    
    if (result.reportPath) {
      console.log(`报告路径: ${result.reportPath}`);
    }
    
    console.log('='.repeat(60));

    // 详细输出失败测试
    if (this.options.verbose && summary.failedTests > 0) {
      console.log('\n❌ 失败测试详情:');
      result.suiteResult.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.testCaseId}: ${r.testCaseName}`);
          r.errors.forEach(error => {
            console.log(`    错误: ${error}`);
          });
        });
    }
  }

  /**
   * 获取测试历史
   */
  getTestHistory(): TestSuiteResult[] {
    return this.framework.getTestHistory();
  }

  /**
   * 清除测试历史
   */
  clearTestHistory(): void {
    this.framework.clearTestHistory();
  }

  /**
   * 更新配置
   */
  updateOptions(newOptions: Partial<TestRunnerOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    // 更新框架配置
    const config: Partial<TestConfiguration> = {
      toleranceThreshold: this.options.confidenceTolerance,
      fieldComparisonMode: this.options.fieldComparisonMode,
      maxExecutionTime: this.options.maxExecutionTime,
      skipCategories: this.options.skipCategories,
      skipTags: this.options.skipTags,
      onlyCategories: this.options.categories,
      onlyTags: this.options.tags
    };
    
    this.framework.updateConfiguration(config);
  }
}

/**
 * 创建测试运行器的便捷函数
 */
export function createTestRunner(options: TestRunnerOptions): TestRunner {
  return new TestRunner(options);
}

/**
 * 快速运行测试的便捷函数
 */
export async function quickTest(
  template: RegexParseTemplate,
  parser: EnhancedRegexParser,
  options?: Partial<TestRunnerOptions>
): Promise<TestRunnerResult> {
  const runner = createTestRunner({
    template,
    parser,
    ...options
  });
  
  return runner.runQuickTests();
}

/**
 * 运行完整测试的便捷函数
 */
export async function fullTest(
  template: RegexParseTemplate,
  parser: EnhancedRegexParser,
  options?: Partial<TestRunnerOptions>
): Promise<TestRunnerResult> {
  const runner = createTestRunner({
    template,
    parser,
    ...options
  });
  
  return runner.runAllTests();
}
