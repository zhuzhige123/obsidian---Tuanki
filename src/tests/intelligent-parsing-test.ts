/**
 * 智能解析系统测试套件
 * 验证先解析后模板选择的完整流程
 */

import { parseContentIntelligently, getAllContentPatterns } from '../utils/content-pattern-recognition';
import { convertParseResultToCardData } from '../utils/template-selection-engine';
import { OFFICIAL_TRIAD_TEMPLATES } from '../data/official-triad-templates';

/**
 * 测试用例接口
 */
interface TestCase {
  name: string;
  description: string;
  input: string;
  expectedPattern: string;
  expectedFields: string[];
  expectedConfidence: number;
  category: 'h2-qa' | 'h3-qa' | 'qa-pair' | 'multiple-choice' | 'cloze' | 'definition' | 'list' | 'comparison';
}

/**
 * 测试结果接口
 */
interface TestResult {
  testCase: TestCase;
  parseResult: any;
  cardData: any;
  passed: boolean;
  issues: string[];
  score: number;
}

/**
 * 预定义测试用例
 */
export const TEST_CASES: TestCase[] = [
  // 1. 二级标题问答测试
  {
    name: '二级标题问答 - 基础',
    description: '测试基础的二级标题问答格式解析',
    input: '## 什么是间隔重复？\n间隔重复是一种学习技术，通过在逐渐增长的时间间隔内复习信息来提高长期记忆。',
    expectedPattern: 'h2-qa-pattern',
    expectedFields: ['question', 'answer', 'notes'],
    expectedConfidence: 0.9,
    category: 'h2-qa'
  },
  {
    name: '二级标题问答 - 复杂内容',
    description: '测试包含多段落和格式的二级标题问答',
    input: '## Python中的列表推导式是什么？\n\n列表推导式是Python的一个特性，允许你用简洁的语法创建列表。\n\n基本语法：\n```python\n[expression for item in iterable]\n```\n\n例如：\n```python\nsquares = [x**2 for x in range(10)]\n```',
    expectedPattern: 'h2-qa-pattern',
    expectedFields: ['question', 'answer', 'notes'],
    expectedConfidence: 0.9,
    category: 'h2-qa'
  },

  // 2. 三级标题问答测试
  {
    name: '三级标题问答 - 基础',
    description: '测试三级标题问答格式解析',
    input: '### 如何使用Git进行版本控制？\nGit是一个分布式版本控制系统，用于跟踪文件的变化。基本命令包括git add、git commit、git push等。',
    expectedPattern: 'h3-qa-pattern',
    expectedFields: ['question', 'answer', 'notes'],
    expectedConfidence: 0.85,
    category: 'h3-qa'
  },

  // 3. 问答对格式测试
  {
    name: '问答对格式 - 标准',
    description: '测试Q:A:格式的问答对解析',
    input: 'Q: 什么是机器学习？\nA: 机器学习是人工智能的一个分支，它使计算机能够在没有明确编程的情况下学习和改进。',
    expectedPattern: 'qa-pair-pattern',
    expectedFields: ['question', 'answer', 'notes'],
    expectedConfidence: 0.9,
    category: 'qa-pair'
  },

  // 4. 选择题格式测试
  {
    name: '选择题格式 - 标准',
    description: '测试选择题格式解析',
    input: '下列哪个是Python的特点？\nA. 编译型语言\nB. 解释型语言\nC. 汇编语言\nD. 机器语言',
    expectedPattern: 'multiple-choice-pattern',
    expectedFields: ['question', 'options', 'notes'],
    expectedConfidence: 0.85,
    category: 'multiple-choice'
  },

  // 5. 填空题格式测试
  {
    name: '填空题格式 - 基础',
    description: '测试填空题格式解析',
    input: 'Python是一种__解释型__编程语言，具有__简洁__的语法。',
    expectedPattern: 'cloze-pattern',
    expectedFields: ['cloze', 'notes'],
    expectedConfidence: 0.8,
    category: 'cloze'
  },

  // 6. 定义格式测试
  {
    name: '定义格式 - 术语定义',
    description: '测试术语定义格式解析',
    input: '算法: 解决问题的一系列明确指令或规则，通常用于计算、数据处理和自动推理任务。',
    expectedPattern: 'definition-pattern',
    expectedFields: ['term', 'definition', 'notes'],
    expectedConfidence: 0.75,
    category: 'definition'
  },

  // 7. 列表格式测试
  {
    name: '列表格式 - 要点列表',
    description: '测试列表格式解析',
    input: 'Python的优点：\n- 语法简洁易读\n- 库丰富强大\n- 跨平台支持\n- 社区活跃',
    expectedPattern: 'list-pattern',
    expectedFields: ['topic', 'items', 'notes'],
    expectedConfidence: 0.7,
    category: 'list'
  },

  // 8. 对比格式测试
  {
    name: '对比格式 - 概念对比',
    description: '测试对比格式解析',
    input: 'SQL vs NoSQL\nSQL数据库使用结构化查询语言，具有ACID特性；NoSQL数据库更灵活，适合大数据和快速开发。',
    expectedPattern: 'comparison-pattern',
    expectedFields: ['concept1', 'concept2', 'comparison', 'notes'],
    expectedConfidence: 0.75,
    category: 'comparison'
  },

  // 9. 边界情况测试
  {
    name: '空内容测试',
    description: '测试空内容的处理',
    input: '',
    expectedPattern: 'no-match',
    expectedFields: ['notes'],
    expectedConfidence: 0,
    category: 'h2-qa'
  },
  {
    name: '纯文本测试',
    description: '测试无特定格式的纯文本',
    input: '这是一段没有特定格式的纯文本内容，应该被保护在基础模板中。',
    expectedPattern: 'no-match',
    expectedFields: ['question', 'answer', 'notes'],
    expectedConfidence: 0,
    category: 'h2-qa'
  }
];

/**
 * 运行单个测试用例
 */
export function runSingleTest(testCase: TestCase): TestResult {
  console.log(`🧪 [runSingleTest] 开始测试: ${testCase.name}`);
  
  const issues: string[] = [];
  let passed = true;
  let score = 0;

  try {
    // 1. 测试内容解析
    let parseResult;
    if (testCase.input === '') {
      // 空内容应该抛出错误
      try {
        parseResult = parseContentIntelligently(testCase.input);
        issues.push('空内容应该抛出错误，但没有');
        passed = false;
      } catch (error) {
        // 预期的错误
        parseResult = {
          success: false,
          pattern: 'no-match',
          confidence: 0,
          fields: { notes: testCase.input },
          notes: testCase.input,
          metadata: {
            parseMethod: 'error-handling',
            parsePattern: 'no-match',
            parseConfidence: 0,
            matchedAt: new Date().toISOString(),
            processingTime: 0
          }
        };
      }
    } else {
      parseResult = parseContentIntelligently(testCase.input);
    }

    // 2. 验证解析结果
    if (parseResult.pattern !== testCase.expectedPattern) {
      issues.push(`模式不匹配: 期望 ${testCase.expectedPattern}, 实际 ${parseResult.pattern}`);
      passed = false;
    } else {
      score += 30;
    }

    if (parseResult.confidence < testCase.expectedConfidence - 0.1) {
      issues.push(`置信度过低: 期望 >= ${testCase.expectedConfidence}, 实际 ${parseResult.confidence}`);
      passed = false;
    } else {
      score += 20;
    }

    // 3. 验证字段提取
    for (const expectedField of testCase.expectedFields) {
      if (!parseResult.fields[expectedField]) {
        issues.push(`缺少期望字段: ${expectedField}`);
        passed = false;
      } else {
        score += 10;
      }
    }

    // 4. 验证notes字段保护
    if (parseResult.notes !== testCase.input) {
      issues.push('notes字段未正确保护原始内容');
      passed = false;
    } else {
      score += 20;
    }

    // 5. 测试模板选择和卡片数据转换
    let cardData;
    try {
      cardData = convertParseResultToCardData(parseResult, {
        blockLink: '[[测试文档#^test123]]',
        sourceDocument: '测试文档.md',
        sourceFile: '/path/to/test.md',
        lineNumber: 1
      }, OFFICIAL_TRIAD_TEMPLATES);

      // 验证卡片数据
      if (!cardData.notes || cardData.notes !== testCase.input) {
        issues.push('卡片数据中notes字段未正确保护');
        passed = false;
      } else {
        score += 10;
      }

      if (!cardData.templateId) {
        issues.push('未选择有效的模板');
        passed = false;
      } else {
        score += 10;
      }

    } catch (error) {
      issues.push(`卡片数据转换失败: ${error.message}`);
      passed = false;
      cardData = null;
    }

    console.log(`${passed ? '✅' : '❌'} [runSingleTest] 测试完成: ${testCase.name}, 分数: ${score}/100`);

    return {
      testCase,
      parseResult,
      cardData,
      passed,
      issues,
      score
    };

  } catch (error) {
    console.error(`❌ [runSingleTest] 测试异常: ${testCase.name}`, error);
    return {
      testCase,
      parseResult: null,
      cardData: null,
      passed: false,
      issues: [`测试执行异常: ${error.message}`],
      score: 0
    };
  }
}

/**
 * 运行所有测试用例
 */
export function runAllTests(): TestResult[] {
  console.log('🚀 [runAllTests] 开始运行所有测试用例');
  
  const results: TestResult[] = [];
  
  for (const testCase of TEST_CASES) {
    const result = runSingleTest(testCase);
    results.push(result);
  }

  console.log('🎯 [runAllTests] 所有测试完成');
  return results;
}

/**
 * 生成测试报告
 */
export function generateTestReport(results: TestResult[]): string {
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const averageScore = results.reduce((sum, r) => sum + r.score, 0) / totalTests;

  let report = `# 智能解析系统测试报告\n\n`;
  report += `## 总体结果\n`;
  report += `- 测试用例总数: ${totalTests}\n`;
  report += `- 通过测试: ${passedTests}\n`;
  report += `- 失败测试: ${totalTests - passedTests}\n`;
  report += `- 成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`;
  report += `- 平均分数: ${averageScore.toFixed(1)}/100\n\n`;

  // 按类别统计
  const categories = [...new Set(results.map(r => r.testCase.category))];
  report += `## 分类结果\n`;
  for (const category of categories) {
    const categoryResults = results.filter(r => r.testCase.category === category);
    const categoryPassed = categoryResults.filter(r => r.passed).length;
    report += `- ${category}: ${categoryPassed}/${categoryResults.length} 通过\n`;
  }
  report += `\n`;

  // 详细结果
  report += `## 详细结果\n`;
  for (const result of results) {
    report += `### ${result.testCase.name}\n`;
    report += `- **状态**: ${result.passed ? '✅ 通过' : '❌ 失败'}\n`;
    report += `- **分数**: ${result.score}/100\n`;
    report += `- **描述**: ${result.testCase.description}\n`;
    
    if (result.parseResult) {
      report += `- **解析模式**: ${result.parseResult.pattern}\n`;
      report += `- **置信度**: ${result.parseResult.confidence}\n`;
    }
    
    if (result.cardData) {
      report += `- **选择模板**: ${result.cardData.templateName}\n`;
    }
    
    if (result.issues.length > 0) {
      report += `- **问题**:\n`;
      for (const issue of result.issues) {
        report += `  - ${issue}\n`;
      }
    }
    report += `\n`;
  }

  return report;
}

/**
 * 快速测试函数 - 对外接口
 */
export function quickTest(): string {
  console.log('🧪 开始快速测试智能解析系统');
  
  const results = runAllTests();
  const report = generateTestReport(results);
  
  console.log('📊 测试报告生成完成');
  return report;
}
