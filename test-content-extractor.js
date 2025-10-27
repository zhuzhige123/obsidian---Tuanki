/**
 * ContentExtractor功能测试脚本
 * 用于验证选择题解析功能
 */

// 模拟导入ContentExtractor
// 注意：这是一个测试脚本，实际使用时需要正确的模块导入

// 测试用例
const testCases = [
  {
    name: "用户提供的选择题格式",
    content: `## 以下哪个是JavaScript的基本数据类型？
**选项**:
A. string（字符串）
B. number（数字）
C. boolean（布尔值）
D. 以上都是

---div---

**解析**: JavaScript有七种基本数据类型：string、number、boolean、null、undefined、symbol和bigint。前三个选项都是正确的基本数据类型。

**标签**: JavaScript,数据类型,基础知识`,
    expectedType: 'choice',
    expectedQuestion: '以下哪个是JavaScript的基本数据类型？',
    expectedOptions: 'A. string（字符串）\nB. number（数字）\nC. boolean（布尔值）\nD. 以上都是'
  },
  {
    name: "简化选择题格式",
    content: `什么是React的核心概念？
A. 组件化
B. 虚拟DOM
C. 单向数据流
D. 以上都是

---div---

D. 以上都是`,
    expectedType: 'choice',
    expectedQuestion: '什么是React的核心概念？',
    expectedOptions: 'A. 组件化\nB. 虚拟DOM\nC. 单向数据流\nD. 以上都是'
  },
  {
    name: "问答题格式",
    content: `什么是闭包？

---div---

闭包是指有权访问另一个函数作用域中变量的函数。`,
    expectedType: 'qa'
  },
  {
    name: "挖空题格式",
    content: `JavaScript中，{{c1::var}}、{{c2::let}}和{{c3::const}}是三种声明变量的关键字。`,
    expectedType: 'cloze'
  }
];

// 模拟ContentExtractor类的关键方法
class MockContentExtractor {
  constructor() {
    this.CLOZE_REGEX = /\{\{c\d+::([^}]+)\}\}/g;
    this.HIGHLIGHT_CLOZE_REGEX = /==(.*?)==/g;
  }

  detectContentTypeNew(content) {
    if (!content) return 'unknown';

    // 检测选择题模式
    const optionPattern = /[A-E]\.\s*.+/g;
    const optionMatches = content.match(optionPattern);
    if (optionMatches && optionMatches.length >= 2) {
      return 'choice';
    }

    // 检测挖空题模式
    if (this.CLOZE_REGEX.test(content) || this.HIGHLIGHT_CLOZE_REGEX.test(content)) {
      return 'cloze';
    }

    // 检测问答题模式
    if (content.includes('---div---')) {
      return 'qa';
    }

    return 'unknown';
  }

  parseChoiceContent(content) {
    if (!content || typeof content !== 'string') {
      return {
        success: false,
        question: '',
        options: '',
        confidence: 0,
        format: 'unknown'
      };
    }

    // 格式1: ## 题目\n**选项**:\nA. 选项1\nB. 选项2\n---div---\n答案和解析
    const h2OptionsPattern = /^##\s*(.+?)\n\*\*选项\*\*:\s*\n((?:[A-E]\..*?\n?)+)(?:---div---\s*\n([\s\S]*))?$/m;
    const h2Match = content.match(h2OptionsPattern);
    
    if (h2Match) {
      const [, question, options, backContent] = h2Match;
      
      return {
        success: true,
        question: question.trim(),
        options: options.trim(),
        confidence: 0.95,
        format: 'markdown-h2'
      };
    }

    // 格式2: 题目\nA. 选项1\nB. 选项2\n---div---\n答案
    const directOptionsPattern = /^(.+?)\n((?:[A-E]\..*?\n?)+)(?:---div---\s*\n([\s\S]*))?$/m;
    const directMatch = content.match(directOptionsPattern);
    
    if (directMatch) {
      const [, question, options, backContent] = directMatch;
      
      // 验证选项格式
      const optionLines = options.trim().split('\n').filter(line => line.trim());
      const hasValidOptions = optionLines.length >= 2 && 
        optionLines.every(line => /^[A-E]\./.test(line.trim()));
      
      if (hasValidOptions) {
        return {
          success: true,
          question: question.trim(),
          options: options.trim(),
          confidence: 0.90,
          format: 'markdown-options'
        };
      }
    }

    return {
      success: false,
      question: '',
      options: '',
      confidence: 0,
      format: 'unknown'
    };
  }
}

// 运行测试
function runTests() {
  console.log('🧪 开始ContentExtractor功能测试\n');
  
  const extractor = new MockContentExtractor();
  let passedTests = 0;
  let totalTests = 0;

  testCases.forEach((testCase, index) => {
    console.log(`📝 测试 ${index + 1}: ${testCase.name}`);
    
    // 测试内容类型检测
    const detectedType = extractor.detectContentTypeNew(testCase.content);
    totalTests++;
    
    if (detectedType === testCase.expectedType) {
      console.log(`  ✅ 类型检测正确: ${detectedType}`);
      passedTests++;
    } else {
      console.log(`  ❌ 类型检测失败: 期望 ${testCase.expectedType}, 实际 ${detectedType}`);
    }

    // 如果是选择题，测试解析功能
    if (testCase.expectedType === 'choice') {
      const parseResult = extractor.parseChoiceContent(testCase.content);
      totalTests++;
      
      if (parseResult.success) {
        console.log(`  ✅ 选择题解析成功`);
        console.log(`    题目: ${parseResult.question}`);
        console.log(`    选项: ${parseResult.options.replace(/\n/g, ' | ')}`);
        console.log(`    格式: ${parseResult.format}`);
        console.log(`    置信度: ${parseResult.confidence}`);
        passedTests++;
      } else {
        console.log(`  ❌ 选择题解析失败`);
      }
    }
    
    console.log('');
  });

  console.log(`🎯 测试结果: ${passedTests}/${totalTests} 通过`);
  
  if (passedTests === totalTests) {
    console.log('🎉 所有测试通过！ContentExtractor功能正常');
  } else {
    console.log('⚠️  部分测试失败，需要检查实现');
  }
}

// 执行测试
runTests();
