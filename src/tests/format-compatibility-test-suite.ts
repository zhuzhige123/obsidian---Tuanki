/**
 * 格式兼容性测试套件
 * 验证系统对各种常见和边缘情况的处理能力
 */

import { FormatPreprocessor } from '../utils/format-preprocessor';
import { MultiPatternMatcher } from '../utils/multi-pattern-matcher';
import { SemanticContentExtractor } from '../utils/semantic-content-extractor';
import { EnhancedRegexParser } from '../utils/enhanced-regex-parser';
import { RegexParseTemplate } from '../data/template-types';

export interface FormatTestCase {
  name: string;
  category: 'punctuation' | 'spacing' | 'heading' | 'encoding' | 'mixed' | 'edge_case';
  description: string;
  input: string;
  expectedQuestion: string;
  expectedAnswer: string;
  minConfidence: number;
  shouldPreprocess: boolean;
  expectedTransformations?: string[];
}

export interface FormatTestResult {
  testCase: FormatTestCase;
  passed: boolean;
  actualQuestion: string;
  actualAnswer: string;
  confidence: number;
  appliedTransformations: string[];
  processingTime: number;
  issues: string[];
}

export interface CompatibilityTestSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageConfidence: number;
  averageProcessingTime: number;
  categoryResults: Record<string, { passed: number; total: number }>;
  commonIssues: string[];
}

/**
 * 格式兼容性测试套件
 */
export class FormatCompatibilityTestSuite {
  private preprocessor: FormatPreprocessor;
  private patternMatcher: MultiPatternMatcher;
  private semanticExtractor: SemanticContentExtractor;
  private enhancedParser: EnhancedRegexParser;
  private testCases: FormatTestCase[];

  constructor() {
    this.preprocessor = new FormatPreprocessor();
    this.patternMatcher = new MultiPatternMatcher();
    this.semanticExtractor = new SemanticContentExtractor();
    this.enhancedParser = new EnhancedRegexParser();
    this.testCases = this.createTestCases();
  }

  /**
   * 运行所有格式兼容性测试
   */
  async runAllTests(): Promise<{
    results: FormatTestResult[];
    summary: CompatibilityTestSummary;
  }> {
    console.log(`🧪 [FormatCompatibilityTest] 开始运行${this.testCases.length}个格式兼容性测试`);

    const results: FormatTestResult[] = [];
    const basicTemplate = this.createBasicTemplate();

    for (const testCase of this.testCases) {
      const result = await this.runSingleTest(testCase, basicTemplate);
      results.push(result);

      const status = result.passed ? '✅' : '❌';
      console.log(`${status} [FormatCompatibilityTest] ${result.testCase.name}: ${result.passed ? 'PASSED' : 'FAILED'}`);
      
      if (!result.passed && result.issues.length > 0) {
        console.log(`   问题: ${result.issues.join(', ')}`);
      }
    }

    const summary = this.generateSummary(results);
    console.log(`📊 [FormatCompatibilityTest] 测试完成: ${summary.passedTests}/${summary.totalTests} 通过`);

    return { results, summary };
  }

  /**
   * 运行单个测试用例
   */
  private async runSingleTest(testCase: FormatTestCase, template: RegexParseTemplate): Promise<FormatTestResult> {
    const startTime = Date.now();
    const issues: string[] = [];

    try {
      // 使用增强解析器处理内容
      const parseResult = this.enhancedParser.parseContent(testCase.input, template);
      
      const actualQuestion = parseResult.fields.question || '';
      const actualAnswer = parseResult.fields.answer || '';
      const confidence = parseResult.confidence;
      
      // 检查是否通过测试
      let passed = true;
      
      // 检查置信度
      if (confidence < testCase.minConfidence) {
        passed = false;
        issues.push(`置信度不足: ${(confidence * 100).toFixed(1)}% < ${(testCase.minConfidence * 100).toFixed(1)}%`);
      }
      
      // 检查问题匹配
      if (!this.isContentSimilar(actualQuestion, testCase.expectedQuestion)) {
        passed = false;
        issues.push(`问题不匹配: 期望"${testCase.expectedQuestion}", 实际"${actualQuestion}"`);
      }
      
      // 检查答案匹配
      if (!this.isContentSimilar(actualAnswer, testCase.expectedAnswer)) {
        passed = false;
        issues.push(`答案不匹配: 期望"${testCase.expectedAnswer}", 实际"${actualAnswer}"`);
      }

      const processingTime = Date.now() - startTime;

      return {
        testCase,
        passed,
        actualQuestion,
        actualAnswer,
        confidence,
        appliedTransformations: parseResult.warnings || [],
        processingTime,
        issues
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        testCase,
        passed: false,
        actualQuestion: '',
        actualAnswer: '',
        confidence: 0,
        appliedTransformations: [],
        processingTime,
        issues: [`测试执行异常: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * 创建测试用例
   */
  private createTestCases(): FormatTestCase[] {
    return [
      // 1. 标点符号测试
      {
        name: '中英文标点符号混合',
        category: 'punctuation',
        description: '测试中英文标点符号的标准化处理',
        input: '## 什么是编程？？\n编程是创建计算机程序的过程，使用特定的编程语言。',
        expectedQuestion: '什么是编程?',
        expectedAnswer: '编程是创建计算机程序的过程，使用特定的编程语言。',
        minConfidence: 0.8,
        shouldPreprocess: true,
        expectedTransformations: ['标准化标点符号']
      },

      {
        name: '全角半角字符混合',
        category: 'punctuation',
        description: '测试全角半角字符的处理',
        input: '##　什么是ＡＩ（人工智能）？\nＡＩ是Artificial Intelligence的缩写。',
        expectedQuestion: '什么是AI(人工智能)?',
        expectedAnswer: 'AI是Artificial Intelligence的缩写。',
        minConfidence: 0.7,
        shouldPreprocess: true
      },

      // 2. 空格和格式测试
      {
        name: '不规范空格处理',
        category: 'spacing',
        description: '测试各种不规范空格的处理',
        input: '##    什么是　　机器学习   ？   \n\n\n机器学习是    人工智能的一个    分支。   \n\n',
        expectedQuestion: '什么是机器学习?',
        expectedAnswer: '机器学习是人工智能的一个分支。',
        minConfidence: 0.8,
        shouldPreprocess: true,
        expectedTransformations: ['标准化空白字符', '移除多余空格']
      },

      {
        name: '制表符和特殊空白字符',
        category: 'spacing',
        description: '测试制表符和特殊空白字符的处理',
        input: '##\t什么是\u00A0数据结构？\n数据结构是\u2000计算机\u3000存储数据的方式。',
        expectedQuestion: '什么是数据结构?',
        expectedAnswer: '数据结构是计算机存储数据的方式。',
        minConfidence: 0.8,
        shouldPreprocess: true
      },

      // 3. 标题格式测试
      {
        name: '不同级别标题混合',
        category: 'heading',
        description: '测试不同级别标题的处理',
        input: '# 编程基础\n## 什么是变量？\n变量是存储数据的容器。\n### 变量类型\n包括数字、字符串等。',
        expectedQuestion: '什么是变量?',
        expectedAnswer: '变量是存储数据的容器。',
        minConfidence: 0.7,
        shouldPreprocess: false
      },

      {
        name: '标题格式不规范',
        category: 'heading',
        description: '测试不规范的标题格式',
        input: '##什么是算法\n算法是解决问题的步骤。',
        expectedQuestion: '什么是算法',
        expectedAnswer: '算法是解决问题的步骤。',
        minConfidence: 0.8,
        shouldPreprocess: true,
        expectedTransformations: ['标准化标题格式']
      },

      // 4. 编码和特殊字符测试
      {
        name: '特殊Unicode字符',
        category: 'encoding',
        description: '测试特殊Unicode字符的处理',
        input: '## 什么是🤖人工智能？\n人工智能是模拟人类智能的技术💡。包括：\n• 机器学习\n• 深度学习',
        expectedQuestion: '什么是🤖人工智能?',
        expectedAnswer: '人工智能是模拟人类智能的技术💡。包括：\n• 机器学习\n• 深度学习',
        minConfidence: 0.7,
        shouldPreprocess: true
      },

      {
        name: '数学符号和公式',
        category: 'encoding',
        description: '测试数学符号的处理',
        input: '## 什么是π（圆周率）？\nπ ≈ 3.14159，表示圆的周长与直径的比值。公式：C = 2πr',
        expectedQuestion: '什么是π(圆周率)?',
        expectedAnswer: 'π ≈ 3.14159，表示圆的周长与直径的比值。公式：C = 2πr',
        minConfidence: 0.8,
        shouldPreprocess: true
      },

      // 5. 混合格式测试
      {
        name: '复杂混合格式',
        category: 'mixed',
        description: '测试多种格式问题的综合处理',
        input: '##　　什么是　　"深度学习"？？？\n\n\n深度学习是机器学习的一个　　分支，　　使用多层神经网络。\n\n主要特点：：\n１．　自动特征提取\n２．　层次化表示',
        expectedQuestion: '什么是"深度学习"?',
        expectedAnswer: '深度学习是机器学习的一个分支，使用多层神经网络。\n\n主要特点:\n1. 自动特征提取\n2. 层次化表示',
        minConfidence: 0.7,
        shouldPreprocess: true
      },

      // 6. 边缘情况测试
      {
        name: '极短内容',
        category: 'edge_case',
        description: '测试极短内容的处理',
        input: '## A?\nB.',
        expectedQuestion: 'A?',
        expectedAnswer: 'B.',
        minConfidence: 0.6,
        shouldPreprocess: false
      },

      {
        name: '只有问题无答案',
        category: 'edge_case',
        description: '测试只有问题没有答案的情况',
        input: '## 什么是量子计算？',
        expectedQuestion: '什么是量子计算?',
        expectedAnswer: '',
        minConfidence: 0.5,
        shouldPreprocess: true
      },

      {
        name: '多个问题连续',
        category: 'edge_case',
        description: '测试多个问题连续出现的情况',
        input: '## 第一个问题？\n第一个答案。\n## 第二个问题？\n第二个答案。',
        expectedQuestion: '第一个问题?',
        expectedAnswer: '第一个答案。',
        minConfidence: 0.7,
        shouldPreprocess: true
      },

      {
        name: '无标准格式的自由文本',
        category: 'edge_case',
        description: '测试完全无格式的自由文本',
        input: '编程语言有很多种，包括Python、Java、JavaScript等。每种语言都有其特点和适用场景。',
        expectedQuestion: '编程语言有很多种，包括Python、Java、JavaScript等。',
        expectedAnswer: '每种语言都有其特点和适用场景。',
        minConfidence: 0.4,
        shouldPreprocess: true
      }
    ];
  }

  /**
   * 创建基础测试模板
   */
  private createBasicTemplate(): RegexParseTemplate {
    return {
      id: 'test-basic-template',
      name: '基础测试模板',
      regex: '^## (.+)\\n([\\s\\S]*?)(?=\\n##|\\n#|$)',
      fieldMappings: { question: 1, answer: 2 },
      parseOptions: { multiline: true, ignoreCase: false, global: false }
    };
  }

  /**
   * 检查内容相似性
   */
  private isContentSimilar(actual: string, expected: string): boolean {
    if (!expected) {
      return !actual || actual.trim() === '';
    }

    // 标准化比较
    const normalizeText = (text: string) => text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[？?]/g, '?')
      .replace(/[：:]/g, ':')
      .replace(/[，,]/g, ',')
      .replace(/[。.]/g, '.')
      .trim();

    const normalizedActual = normalizeText(actual);
    const normalizedExpected = normalizeText(expected);

    // 完全匹配
    if (normalizedActual === normalizedExpected) {
      return true;
    }

    // 包含关系检查（用于部分匹配）
    if (normalizedExpected.length > 10) {
      const similarity = this.calculateSimilarity(normalizedActual, normalizedExpected);
      return similarity > 0.8;
    }

    return false;
  }

  /**
   * 计算文本相似度
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);
    
    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  /**
   * 生成测试总结
   */
  private generateSummary(results: FormatTestResult[]): CompatibilityTestSummary {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    
    const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence = totalTests > 0 ? totalConfidence / totalTests : 0;
    
    const totalProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0);
    const averageProcessingTime = totalTests > 0 ? totalProcessingTime / totalTests : 0;

    // 按类别统计
    const categoryResults: Record<string, { passed: number; total: number }> = {};
    results.forEach(result => {
      const category = result.testCase.category;
      if (!categoryResults[category]) {
        categoryResults[category] = { passed: 0, total: 0 };
      }
      categoryResults[category].total++;
      if (result.passed) {
        categoryResults[category].passed++;
      }
    });

    // 统计常见问题
    const allIssues = results.flatMap(r => r.issues);
    const issueCount: Record<string, number> = {};
    allIssues.forEach(issue => {
      const key = issue.split(':')[0]; // 取问题类型
      issueCount[key] = (issueCount[key] || 0) + 1;
    });
    
    const commonIssues = Object.entries(issueCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([issue, count]) => `${issue} (${count}次)`);

    return {
      totalTests,
      passedTests,
      failedTests,
      averageConfidence,
      averageProcessingTime,
      categoryResults,
      commonIssues
    };
  }

  /**
   * 运行特定类别的测试
   */
  async runCategoryTests(category: FormatTestCase['category']): Promise<{
    results: FormatTestResult[];
    summary: CompatibilityTestSummary;
  }> {
    const categoryTests = this.testCases.filter(tc => tc.category === category);
    const originalTestCases = this.testCases;
    
    this.testCases = categoryTests;
    const result = await this.runAllTests();
    this.testCases = originalTestCases;
    
    return result;
  }

  /**
   * 获取所有测试用例
   */
  getAllTestCases(): FormatTestCase[] {
    return [...this.testCases];
  }

  /**
   * 添加自定义测试用例
   */
  addCustomTestCase(testCase: FormatTestCase): void {
    this.testCases.push(testCase);
  }
}
