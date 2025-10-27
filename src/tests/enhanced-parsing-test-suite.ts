/**
 * 增强解析算法测试套件
 * 测试各种复杂的Markdown内容，验证解析完整性
 */

import { EnhancedRegexParser } from '../utils/enhanced-regex-parser';
import { ParseResultValidator } from '../utils/parse-result-validator';
import { RegexParseTemplate } from '../data/template-types';

export interface TestCase {
  name: string;
  description: string;
  input: string;
  expectedFields: Record<string, string>;
  template: RegexParseTemplate;
  expectedIssues?: string[];
  minCoverage?: number;
  category: string;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  actualFields: Record<string, string>;
  coverage: number;
  confidence: number;
  issues: string[];
  executionTime: number;
  error?: string;
}

export interface TestSuiteResult {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageCoverage: number;
  averageConfidence: number;
  results: TestResult[];
  summary: string;
}

/**
 * 增强解析算法测试套件
 */
export class EnhancedParsingTestSuite {
  private parser: EnhancedRegexParser;
  private validator: ParseResultValidator;
  private testCases: TestCase[];

  constructor() {
    this.parser = new EnhancedRegexParser();
    this.validator = new ParseResultValidator();
    this.testCases = this.createTestCases();
  }

  /**
   * 运行完整的测试套件
   */
  async runAllTests(): Promise<TestSuiteResult> {
    console.log(`🧪 [TestSuite] 开始运行${this.testCases.length}个测试用例`);
    
    const results: TestResult[] = [];
    let totalCoverage = 0;
    let totalConfidence = 0;
    
    for (const testCase of this.testCases) {
      const result = await this.runSingleTest(testCase);
      results.push(result);
      
      if (result.passed) {
        totalCoverage += result.coverage;
        totalConfidence += result.confidence;
      }
      
      // 输出测试结果
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} [TestSuite] ${result.testName}: ${result.passed ? 'PASSED' : 'FAILED'}`);
      if (!result.passed && result.error) {
        console.log(`   错误: ${result.error}`);
      }
    }
    
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;
    
    const summary = this.generateSummary(results);
    
    return {
      totalTests: results.length,
      passedTests,
      failedTests,
      averageCoverage: passedTests > 0 ? totalCoverage / passedTests : 0,
      averageConfidence: passedTests > 0 ? totalConfidence / passedTests : 0,
      results,
      summary
    };
  }

  /**
   * 运行单个测试用例
   */
  private async runSingleTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // 执行解析
      const parseResult = this.parser.parseContent(testCase.input, testCase.template);
      
      // 验证结果
      const validation = this.validator.validateParseResult(
        testCase.input,
        parseResult.fields,
        Object.keys(testCase.expectedFields)
      );
      
      // 检查是否通过测试
      const passed = this.evaluateTestResult(testCase, parseResult.fields, validation);
      
      const executionTime = Date.now() - startTime;
      
      return {
        testName: testCase.name,
        passed,
        actualFields: parseResult.fields,
        coverage: validation.statistics.coverage,
        confidence: validation.confidence,
        issues: validation.issues.map(i => i.message),
        executionTime,
        error: passed ? undefined : this.getFailureReason(testCase, parseResult.fields, validation)
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        testName: testCase.name,
        passed: false,
        actualFields: { notes: testCase.input },
        coverage: 0,
        confidence: 0,
        issues: [],
        executionTime,
        error: `测试执行异常: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 创建测试用例
   */
  private createTestCases(): TestCase[] {
    const basicTemplate: RegexParseTemplate = {
      id: 'test-basic-qa',
      name: '基础问答测试模板',
      regex: '^([^\\n]+)\\n\\n---div---\\n\\n([\\s\\S]*?)(?:\\n\\n#|$)',
      fieldMappings: { question: 1, answer: 2 },
      parseOptions: { multiline: true, ignoreCase: false, global: false }
    };

    return [
      // 1. 基础二级标题问答
      {
        name: '基础二级标题问答',
        description: '测试最常见的二级标题问答格式',
        input: '## 什么是间隔重复？\n间隔重复是一种学习技术，通过在逐渐增长的时间间隔内复习信息来提高长期记忆。',
        expectedFields: {
          question: '什么是间隔重复？',
          answer: '间隔重复是一种学习技术，通过在逐渐增长的时间间隔内复习信息来提高长期记忆。'
        },
        template: basicTemplate,
        minCoverage: 0.9,
        category: 'basic'
      },

      // 2. 复杂内容结构
      {
        name: '复杂内容结构',
        description: '测试包含多段落、代码块、列表的复杂内容',
        input: `## Python中的列表推导式是什么？

列表推导式是Python的一个特性，允许你用简洁的语法创建列表。

### 基本语法
\`\`\`python
[expression for item in iterable]
\`\`\`

### 示例
\`\`\`python
squares = [x**2 for x in range(10)]
print(squares)  # [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]
\`\`\`

### 优势
- 代码更简洁
- 执行效率更高
- 可读性更好`,
        expectedFields: {
          question: 'Python中的列表推导式是什么？',
          answer: '列表推导式是Python的一个特性，允许你用简洁的语法创建列表。'
        },
        template: basicTemplate,
        minCoverage: 0.8,
        category: 'complex'
      },

      // 3. 多个标题的边界测试
      {
        name: '多标题边界测试',
        description: '测试多个标题时的边界识别',
        input: `## 第一个问题
这是第一个问题的答案。

## 第二个问题  
这是第二个问题的答案。

### 子标题
这是子标题的内容。

## 第三个问题
这是第三个问题的答案。`,
        expectedFields: {
          question: '第一个问题',
          answer: '这是第一个问题的答案。'
        },
        template: basicTemplate,
        minCoverage: 0.3, // 只期望解析第一个问题
        category: 'boundary'
      },

      // 4. 特殊字符和格式
      {
        name: '特殊字符处理',
        description: '测试包含特殊字符和格式的内容',
        input: `## 什么是正则表达式中的 \`.*?\` 和 \`.*\`？

\`.*?\` 是非贪婪匹配，\`.*\` 是贪婪匹配。

**区别**：
- \`.*\` 会匹配尽可能多的字符
- \`.*?\` 会匹配尽可能少的字符

**示例**：
对于字符串 "abc123def456"：
- \`a.*f\` 匹配 "abc123def"
- \`a.*?f\` 匹配 "abc123def"`,
        expectedFields: {
          question: '什么是正则表达式中的 `.*?` 和 `.*`？',
          answer: '`.*?` 是非贪婪匹配，`.*` 是贪婪匹配。'
        },
        template: basicTemplate,
        minCoverage: 0.8,
        category: 'special_chars'
      },

      // 5. 空行和格式变化
      {
        name: '空行格式变化',
        description: '测试不同空行和格式变化的处理',
        input: `##    什么是TypeScript？   


TypeScript是JavaScript的超集。


它添加了静态类型检查。



### 主要特性

- 静态类型
- 编译时检查
- 更好的IDE支持`,
        expectedFields: {
          question: '什么是TypeScript？',
          answer: 'TypeScript是JavaScript的超集。'
        },
        template: basicTemplate,
        minCoverage: 0.7,
        category: 'formatting'
      },

      // 6. 极短内容
      {
        name: '极短内容',
        description: '测试极短内容的处理',
        input: '## A?\nB.',
        expectedFields: {
          question: 'A?',
          answer: 'B.'
        },
        template: basicTemplate,
        minCoverage: 0.9,
        category: 'edge_case'
      },

      // 7. 极长内容
      {
        name: '极长内容',
        description: '测试极长内容的处理',
        input: `## 详细解释机器学习的工作原理？

${'机器学习是人工智能的一个分支。'.repeat(100)}

### 监督学习
${'监督学习使用标记的训练数据。'.repeat(50)}

### 无监督学习  
${'无监督学习从未标记的数据中发现模式。'.repeat(50)}

### 强化学习
${'强化学习通过试错来学习最优策略。'.repeat(50)}`,
        expectedFields: {
          question: '详细解释机器学习的工作原理？',
          answer: '机器学习是人工智能的一个分支。'.repeat(100)
        },
        template: basicTemplate,
        minCoverage: 0.6,
        category: 'performance'
      }
    ];
  }

  /**
   * 评估测试结果
   */
  private evaluateTestResult(
    testCase: TestCase,
    actualFields: Record<string, string>,
    validation: any
  ): boolean {
    // 检查最小覆盖率
    if (testCase.minCoverage && validation.statistics.coverage < testCase.minCoverage) {
      return false;
    }

    // 检查关键字段是否存在且不为空
    for (const [expectedKey, expectedValue] of Object.entries(testCase.expectedFields)) {
      const actualValue = actualFields[expectedKey];
      if (!actualValue || actualValue.trim() === '') {
        return false;
      }
      
      // 对于问题字段，检查是否包含预期的关键词
      if (expectedKey === 'question') {
        const expectedWords = expectedValue.toLowerCase().split(/\s+/);
        const actualWords = actualValue.toLowerCase().split(/\s+/);
        const matchedWords = expectedWords.filter(word => 
          actualWords.some(actualWord => actualWord.includes(word) || word.includes(actualWord))
        );
        
        if (matchedWords.length < expectedWords.length * 0.7) {
          return false;
        }
      }
    }

    // 检查是否有严重的验证问题
    const criticalIssues = validation.issues.filter((issue: any) => issue.severity === 'critical');
    if (criticalIssues.length > 0) {
      return false;
    }

    return true;
  }

  /**
   * 获取失败原因
   */
  private getFailureReason(
    testCase: TestCase,
    actualFields: Record<string, string>,
    validation: any
  ): string {
    const reasons: string[] = [];

    if (testCase.minCoverage && validation.statistics.coverage < testCase.minCoverage) {
      reasons.push(`覆盖率不足: ${(validation.statistics.coverage * 100).toFixed(1)}% < ${(testCase.minCoverage * 100).toFixed(1)}%`);
    }

    for (const [expectedKey, expectedValue] of Object.entries(testCase.expectedFields)) {
      const actualValue = actualFields[expectedKey];
      if (!actualValue || actualValue.trim() === '') {
        reasons.push(`字段 "${expectedKey}" 为空`);
      }
    }

    const criticalIssues = validation.issues.filter((issue: any) => issue.severity === 'critical');
    if (criticalIssues.length > 0) {
      reasons.push(`严重问题: ${criticalIssues.map((i: any) => i.message).join(', ')}`);
    }

    return reasons.join('; ');
  }

  /**
   * 生成测试总结
   */
  private generateSummary(results: TestResult[]): string {
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;
    const passRate = (passedTests / results.length * 100).toFixed(1);
    
    const avgCoverage = results.reduce((sum, r) => sum + r.coverage, 0) / results.length;
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    const avgExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;
    
    // 按类别统计
    const categoryStats: Record<string, { passed: number; total: number }> = {};
    results.forEach(result => {
      const testCase = this.testCases.find(tc => tc.name === result.testName);
      if (testCase) {
        const category = testCase.category;
        if (!categoryStats[category]) {
          categoryStats[category] = { passed: 0, total: 0 };
        }
        categoryStats[category].total++;
        if (result.passed) {
          categoryStats[category].passed++;
        }
      }
    });
    
    let summary = `测试套件执行完成:\n`;
    summary += `- 总测试数: ${results.length}\n`;
    summary += `- 通过: ${passedTests} (${passRate}%)\n`;
    summary += `- 失败: ${failedTests}\n`;
    summary += `- 平均覆盖率: ${(avgCoverage * 100).toFixed(1)}%\n`;
    summary += `- 平均置信度: ${(avgConfidence * 100).toFixed(1)}%\n`;
    summary += `- 平均执行时间: ${avgExecutionTime.toFixed(1)}ms\n\n`;
    
    summary += `分类统计:\n`;
    Object.entries(categoryStats).forEach(([category, stats]) => {
      const categoryPassRate = (stats.passed / stats.total * 100).toFixed(1);
      summary += `- ${category}: ${stats.passed}/${stats.total} (${categoryPassRate}%)\n`;
    });
    
    return summary;
  }

  /**
   * 运行性能测试
   */
  async runPerformanceTest(): Promise<{
    averageExecutionTime: number;
    maxExecutionTime: number;
    minExecutionTime: number;
    throughput: number;
  }> {
    const iterations = 100;
    const testCase = this.testCases[1]; // 使用复杂内容测试用例
    const executionTimes: number[] = [];
    
    console.log(`⚡ [TestSuite] 运行性能测试 (${iterations} 次迭代)`);
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      await this.runSingleTest(testCase);
      const executionTime = Date.now() - startTime;
      executionTimes.push(executionTime);
    }
    
    const averageExecutionTime = executionTimes.reduce((sum, time) => sum + time, 0) / iterations;
    const maxExecutionTime = Math.max(...executionTimes);
    const minExecutionTime = Math.min(...executionTimes);
    const throughput = 1000 / averageExecutionTime; // 每秒处理数
    
    console.log(`📊 [TestSuite] 性能测试结果:`);
    console.log(`   - 平均执行时间: ${averageExecutionTime.toFixed(2)}ms`);
    console.log(`   - 最大执行时间: ${maxExecutionTime}ms`);
    console.log(`   - 最小执行时间: ${minExecutionTime}ms`);
    console.log(`   - 吞吐量: ${throughput.toFixed(2)} 次/秒`);
    
    return {
      averageExecutionTime,
      maxExecutionTime,
      minExecutionTime,
      throughput
    };
  }
}
