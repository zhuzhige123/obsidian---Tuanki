/**
 * 模板系统统一化测试
 * 验证模板系统统一化实施的效果
 */

import type AnkiPlugin from '../main';
// 使用现有的预设模板管理器
import { defaultPresetTemplateManager } from '../templates/preset-templates';
// import { validateEmergencyTemplate, getEmergencyTriadTemplate } from '../data/official-triad-templates';
import { validateTemplateArchitecture } from '../utils/template-architecture-validator';

export interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  details?: any;
}

export interface TestSuite {
  suiteName: string;
  results: TestResult[];
  passed: boolean;
  summary: string;
}

export class TemplateUnificationTester {
  private plugin: AnkiPlugin;
  private triadService: any;

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    this.triadService = getTriadTemplateService(plugin);
  }

  /**
   * 运行完整的测试套件
   */
  async runFullTestSuite(): Promise<TestSuite[]> {
    const suites: TestSuite[] = [];

    // 1. 基础保障模板测试
    suites.push(await this.testEmergencyTemplate());

    // 2. 模板服务测试
    suites.push(await this.testTemplateService());

    // 3. 降级策略测试
    suites.push(await this.testFallbackStrategies());

    // 4. 架构统一性测试
    suites.push(await this.testArchitectureUnification());

    // 5. 错误恢复测试
    suites.push(await this.testErrorRecovery());

    return suites;
  }

  /**
   * 测试基础保障模板
   */
  private async testEmergencyTemplate(): Promise<TestSuite> {
    const results: TestResult[] = [];

    // 测试1: 基础保障模板存在性
    try {
      const emergencyTemplate = getEmergencyTriadTemplate();
      results.push({
        testName: '基础保障模板存在性',
        passed: !!emergencyTemplate,
        message: emergencyTemplate ? '基础保障模板存在' : '基础保障模板不存在'
      });
    } catch (error) {
      results.push({
        testName: '基础保障模板存在性',
        passed: false,
        message: `获取基础保障模板失败: ${error.message}`
      });
    }

    // 测试2: 基础保障模板验证
    try {
      const isValid = validateEmergencyTemplate();
      results.push({
        testName: '基础保障模板验证',
        passed: isValid,
        message: isValid ? '基础保障模板验证通过' : '基础保障模板验证失败'
      });
    } catch (error) {
      results.push({
        testName: '基础保障模板验证',
        passed: false,
        message: `基础保障模板验证异常: ${error.message}`
      });
    }

    // 测试3: 基础保障模板字段完整性
    try {
      const emergencyTemplate = getEmergencyTriadTemplate();
      const requiredFields = ['question', 'answer', 'uuid'];
      const templateFields = emergencyTemplate.fieldTemplate.fields.map(f => f.key);
      
      const missingFields = requiredFields.filter(field => !templateFields.includes(field));
      results.push({
        testName: '基础保障模板字段完整性',
        passed: missingFields.length === 0,
        message: missingFields.length === 0 
          ? '所有必需字段都存在' 
          : `缺少字段: ${missingFields.join(', ')}`,
        details: { requiredFields, templateFields, missingFields }
      });
    } catch (error) {
      results.push({
        testName: '基础保障模板字段完整性',
        passed: false,
        message: `字段完整性检查失败: ${error.message}`
      });
    }

    // 测试4: 三位一体结构完整性
    try {
      const emergencyTemplate = getEmergencyTriadTemplate();
      const hasAllComponents = !!(
        emergencyTemplate.fieldTemplate &&
        emergencyTemplate.markdownTemplate &&
        emergencyTemplate.regexParseTemplate
      );
      
      results.push({
        testName: '三位一体结构完整性',
        passed: hasAllComponents,
        message: hasAllComponents ? '三位一体结构完整' : '三位一体结构不完整'
      });
    } catch (error) {
      results.push({
        testName: '三位一体结构完整性',
        passed: false,
        message: `三位一体结构检查失败: ${error.message}`
      });
    }

    const passed = results.every(r => r.passed);
    return {
      suiteName: '基础保障模板测试',
      results,
      passed,
      summary: passed ? '所有基础保障模板测试通过' : '部分基础保障模板测试失败'
    };
  }

  /**
   * 测试模板服务
   */
  private async testTemplateService(): Promise<TestSuite> {
    const results: TestResult[] = [];

    // 测试1: 模板服务可用性
    try {
      const isAvailable = await this.triadService.ensureTemplateAvailability();
      results.push({
        testName: '模板服务可用性',
        passed: isAvailable,
        message: isAvailable ? '模板服务可用' : '模板服务不可用'
      });
    } catch (error) {
      results.push({
        testName: '模板服务可用性',
        passed: false,
        message: `模板服务检查失败: ${error.message}`
      });
    }

    // 测试2: 基础保障模板获取
    try {
      const emergencyTemplate = this.triadService.getEmergencyTemplate();
      results.push({
        testName: '基础保障模板获取',
        passed: !!emergencyTemplate,
        message: emergencyTemplate ? '成功获取基础保障模板' : '无法获取基础保障模板'
      });
    } catch (error) {
      results.push({
        testName: '基础保障模板获取',
        passed: false,
        message: `获取基础保障模板失败: ${error.message}`
      });
    }

    // 测试3: 模板加载
    try {
      await this.triadService.loadTriadTemplates();
      const allTemplates = this.triadService.getAllTriadTemplates();
      results.push({
        testName: '模板加载',
        passed: allTemplates.length > 0,
        message: `成功加载 ${allTemplates.length} 个模板`,
        details: { templateCount: allTemplates.length }
      });
    } catch (error) {
      results.push({
        testName: '模板加载',
        passed: false,
        message: `模板加载失败: ${error.message}`
      });
    }

    const passed = results.every(r => r.passed);
    return {
      suiteName: '模板服务测试',
      results,
      passed,
      summary: passed ? '所有模板服务测试通过' : '部分模板服务测试失败'
    };
  }

  /**
   * 测试降级策略
   */
  private async testFallbackStrategies(): Promise<TestSuite> {
    const results: TestResult[] = [];

    const testCases = [
      { input: 'non-existent-template', description: '不存在的模板ID' },
      { input: '', description: '空字符串' },
      { input: null, description: 'null值' },
      { input: undefined, description: 'undefined值' }
    ];

    for (const testCase of testCases) {
      try {
        const result = this.triadService.getTemplateWithFallback(testCase.input);
        const passed = !!result;
        results.push({
          testName: `降级策略 - ${testCase.description}`,
          passed,
          message: passed 
            ? `成功降级到模板: ${result.name}` 
            : '降级策略失效',
          details: { input: testCase.input, result: result?.name }
        });
      } catch (error) {
        results.push({
          testName: `降级策略 - ${testCase.description}`,
          passed: false,
          message: `降级策略异常: ${error.message}`,
          details: { input: testCase.input, error: error.message }
        });
      }
    }

    const passed = results.every(r => r.passed);
    return {
      suiteName: '降级策略测试',
      results,
      passed,
      summary: passed ? '所有降级策略测试通过' : '部分降级策略测试失败'
    };
  }

  /**
   * 测试架构统一性
   */
  private async testArchitectureUnification(): Promise<TestSuite> {
    const results: TestResult[] = [];

    try {
      const validationResult = await validateTemplateArchitecture(this.plugin);
      
      results.push({
        testName: '架构统一性验证',
        passed: validationResult.isValid,
        message: validationResult.summary,
        details: {
          score: validationResult.score,
          issues: validationResult.issues,
          recommendations: validationResult.recommendations
        }
      });

      // 检查是否有严重错误
      const criticalErrors = validationResult.issues.filter(i => i.type === 'error' && i.severity >= 8);
      results.push({
        testName: '严重错误检查',
        passed: criticalErrors.length === 0,
        message: criticalErrors.length === 0 
          ? '没有严重错误' 
          : `发现 ${criticalErrors.length} 个严重错误`,
        details: { criticalErrors }
      });

    } catch (error) {
      results.push({
        testName: '架构统一性验证',
        passed: false,
        message: `架构验证失败: ${error.message}`
      });
    }

    const passed = results.every(r => r.passed);
    return {
      suiteName: '架构统一性测试',
      results,
      passed,
      summary: passed ? '架构统一性测试通过' : '架构统一性测试失败'
    };
  }

  /**
   * 测试错误恢复
   */
  private async testErrorRecovery(): Promise<TestSuite> {
    const results: TestResult[] = [];

    // 测试1: 模板服务重置后恢复
    try {
      // 清空模板缓存
      this.triadService.triadTemplates?.clear?.();
      
      // 尝试恢复
      const isAvailable = await this.triadService.ensureTemplateAvailability();
      results.push({
        testName: '模板服务重置后恢复',
        passed: isAvailable,
        message: isAvailable ? '成功恢复模板服务' : '模板服务恢复失败'
      });
    } catch (error) {
      results.push({
        testName: '模板服务重置后恢复',
        passed: false,
        message: `模板服务恢复测试失败: ${error.message}`
      });
    }

    // 测试2: 强制基础保障模板
    try {
      await this.triadService.forceEmergencyTemplate?.();
      const emergencyTemplate = this.triadService.getEmergencyTemplate();
      results.push({
        testName: '强制基础保障模板',
        passed: !!emergencyTemplate,
        message: emergencyTemplate ? '强制基础保障模板成功' : '强制基础保障模板失败'
      });
    } catch (error) {
      results.push({
        testName: '强制基础保障模板',
        passed: false,
        message: `强制基础保障模板测试失败: ${error.message}`
      });
    }

    const passed = results.every(r => r.passed);
    return {
      suiteName: '错误恢复测试',
      results,
      passed,
      summary: passed ? '所有错误恢复测试通过' : '部分错误恢复测试失败'
    };
  }

  /**
   * 生成测试报告
   */
  generateReport(suites: TestSuite[]): string {
    const totalTests = suites.reduce((sum, suite) => sum + suite.results.length, 0);
    const passedTests = suites.reduce((sum, suite) => sum + suite.results.filter(r => r.passed).length, 0);
    const passedSuites = suites.filter(s => s.passed).length;

    let report = `# 模板系统统一化测试报告\n\n`;
    report += `## 总体结果\n`;
    report += `- 测试套件: ${passedSuites}/${suites.length} 通过\n`;
    report += `- 测试用例: ${passedTests}/${totalTests} 通过\n`;
    report += `- 成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%\n\n`;

    for (const suite of suites) {
      report += `## ${suite.suiteName}\n`;
      report += `**状态**: ${suite.passed ? '✅ 通过' : '❌ 失败'}\n`;
      report += `**摘要**: ${suite.summary}\n\n`;

      for (const result of suite.results) {
        report += `### ${result.testName}\n`;
        report += `- **结果**: ${result.passed ? '✅ 通过' : '❌ 失败'}\n`;
        report += `- **信息**: ${result.message}\n`;
        if (result.details) {
          report += `- **详情**: ${JSON.stringify(result.details, null, 2)}\n`;
        }
        report += `\n`;
      }
    }

    return report;
  }
}

/**
 * 快速测试函数
 */
export async function runTemplateUnificationTests(plugin: AnkiPlugin): Promise<string> {
  const tester = new TemplateUnificationTester(plugin);
  const suites = await tester.runFullTestSuite();
  return tester.generateReport(suites);
}
