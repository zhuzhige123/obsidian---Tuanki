/**
 * 测试运行器 - 在开发环境中运行智能解析测试
 */

import { quickTest, runSingleTest, TEST_CASES } from './intelligent-parsing-test';

/**
 * 在控制台运行测试
 */
export function runTestsInConsole(): void {
  console.log('🚀 开始在控制台运行智能解析测试');
  
  try {
    const report = quickTest();
    console.log('\n📊 测试报告:\n');
    console.log(report);
  } catch (error) {
    console.error('❌ 测试运行失败:', error);
  }
}

/**
 * 运行特定测试用例
 */
export function runSpecificTest(testName: string): void {
  console.log(`🧪 运行特定测试: ${testName}`);
  
  const testCase = TEST_CASES.find(tc => tc.name === testName);
  if (!testCase) {
    console.error(`❌ 找不到测试用例: ${testName}`);
    return;
  }

  const result = runSingleTest(testCase);
  
  console.log('\n📊 测试结果:');
  console.log(`状态: ${result.passed ? '✅ 通过' : '❌ 失败'}`);
  console.log(`分数: ${result.score}/100`);
  
  if (result.parseResult) {
    console.log(`解析模式: ${result.parseResult.pattern}`);
    console.log(`置信度: ${result.parseResult.confidence}`);
    console.log(`提取字段: ${Object.keys(result.parseResult.fields).join(', ')}`);
  }
  
  if (result.cardData) {
    console.log(`选择模板: ${result.cardData.templateName}`);
  }
  
  if (result.issues.length > 0) {
    console.log('问题:');
    result.issues.forEach(issue => console.log(`  - ${issue}`));
  }
}

/**
 * 测试二级标题解析 - 重点测试
 */
export function testH2Parsing(): void {
  console.log('🎯 专项测试：二级标题解析');
  
  const h2TestCases = TEST_CASES.filter(tc => tc.category === 'h2-qa');
  
  console.log(`找到 ${h2TestCases.length} 个二级标题测试用例`);
  
  for (const testCase of h2TestCases) {
    console.log(`\n🧪 测试: ${testCase.name}`);
    const result = runSingleTest(testCase);
    
    console.log(`结果: ${result.passed ? '✅ 通过' : '❌ 失败'} (${result.score}/100)`);
    
    if (result.parseResult) {
      console.log(`  模式: ${result.parseResult.pattern}`);
      console.log(`  置信度: ${result.parseResult.confidence}`);
      console.log(`  问题字段: "${result.parseResult.fields.question || 'N/A'}"`);
      console.log(`  答案字段: "${(result.parseResult.fields.answer || 'N/A').substring(0, 50)}..."`);
    }
    
    if (result.issues.length > 0) {
      console.log('  问题:');
      result.issues.forEach(issue => console.log(`    - ${issue}`));
    }
  }
}

/**
 * 验证内容保护机制
 */
export function testContentProtection(): void {
  console.log('🛡️ 专项测试：内容保护机制');
  
  const testInputs = [
    '## 什么是TypeScript？\nTypeScript是JavaScript的超集，添加了静态类型检查。',
    '这是一段没有特定格式的纯文本，应该被完整保护。',
    'Q: 什么是React？\nA: React是一个用于构建用户界面的JavaScript库。'
  ];

  for (const input of testInputs) {
    console.log(`\n🧪 测试内容: "${input.substring(0, 30)}..."`);
    
    try {
      const parseResult = require('../utils/content-pattern-recognition').parseContentIntelligently(input);
      const cardData = require('../utils/template-selection-engine').convertParseResultToCardData(
        parseResult, 
        { blockLink: '[[test]]' }, 
        require('../data/official-triad-templates').OFFICIAL_TRIAD_TEMPLATES
      );

      // 验证内容保护
      const notesProtected = parseResult.notes === input;
      const cardNotesProtected = cardData.notes === input;
      
      console.log(`  解析notes保护: ${notesProtected ? '✅' : '❌'}`);
      console.log(`  卡片notes保护: ${cardNotesProtected ? '✅' : '❌'}`);
      console.log(`  解析模式: ${parseResult.pattern}`);
      console.log(`  选择模板: ${cardData.templateName}`);
      
      if (!notesProtected || !cardNotesProtected) {
        console.log('  ❌ 内容保护失败！');
      }
      
    } catch (error) {
      console.error(`  ❌ 测试异常: ${error.message}`);
    }
  }
}

/**
 * 性能测试
 */
export function testPerformance(): void {
  console.log('⚡ 专项测试：性能测试');
  
  const testContent = '## 什么是机器学习？\n机器学习是人工智能的一个分支，它使计算机能够在没有明确编程的情况下学习和改进。通过算法和统计模型，机器学习系统可以从数据中识别模式并做出预测或决策。';
  
  const iterations = 100;
  console.log(`运行 ${iterations} 次解析测试...`);
  
  const startTime = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    try {
      const parseResult = require('../utils/content-pattern-recognition').parseContentIntelligently(testContent);
      const cardData = require('../utils/template-selection-engine').convertParseResultToCardData(
        parseResult, 
        { blockLink: '[[test]]' }, 
        require('../data/official-triad-templates').OFFICIAL_TRIAD_TEMPLATES
      );
    } catch (error) {
      console.error(`第 ${i + 1} 次测试失败:`, error.message);
    }
  }
  
  const endTime = Date.now();
  const totalTime = endTime - startTime;
  const averageTime = totalTime / iterations;
  
  console.log(`总时间: ${totalTime}ms`);
  console.log(`平均时间: ${averageTime.toFixed(2)}ms`);
  console.log(`性能评估: ${averageTime < 10 ? '✅ 优秀' : averageTime < 50 ? '⚠️ 良好' : '❌ 需要优化'}`);
}

/**
 * 全面测试套件
 */
export function runFullTestSuite(): void {
  console.log('🎯 运行完整测试套件');
  
  console.log('\n=== 1. 基础功能测试 ===');
  runTestsInConsole();
  
  console.log('\n=== 2. 二级标题专项测试 ===');
  testH2Parsing();
  
  console.log('\n=== 3. 内容保护测试 ===');
  testContentProtection();
  
  console.log('\n=== 4. 性能测试 ===');
  testPerformance();
  
  console.log('\n🎉 完整测试套件运行完成！');
}

// 导出测试函数供外部调用
export {
  runTestsInConsole as runTests,
  runSpecificTest,
  testH2Parsing,
  testContentProtection,
  testPerformance,
  runFullTestSuite
};
