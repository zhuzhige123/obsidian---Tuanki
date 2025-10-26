/**
 * 解析测试运行器
 * 执行增强解析算法的完整测试套件
 */

import { EnhancedParsingTestSuite } from './enhanced-parsing-test-suite';

/**
 * 运行所有解析测试
 */
export async function runParsingTests(): Promise<void> {
  console.log('🚀 开始运行增强解析算法测试套件');
  console.log('=' .repeat(60));
  
  const testSuite = new EnhancedParsingTestSuite();
  
  try {
    // 1. 运行功能测试
    console.log('\n📋 运行功能测试...');
    const functionalResults = await testSuite.runAllTests();
    
    console.log('\n📊 功能测试结果:');
    console.log(functionalResults.summary);
    
    // 2. 运行性能测试
    console.log('\n⚡ 运行性能测试...');
    const performanceResults = await testSuite.runPerformanceTest();
    
    // 3. 生成最终报告
    console.log('\n📈 最终测试报告:');
    console.log('=' .repeat(60));
    
    const overallSuccess = functionalResults.passedTests / functionalResults.totalTests >= 0.8;
    const performanceGood = performanceResults.averageExecutionTime < 100; // 100ms阈值
    
    console.log(`✅ 功能测试: ${functionalResults.passedTests}/${functionalResults.totalTests} 通过 (${(functionalResults.passedTests/functionalResults.totalTests*100).toFixed(1)}%)`);
    console.log(`⚡ 性能测试: 平均 ${performanceResults.averageExecutionTime.toFixed(2)}ms ${performanceGood ? '✅' : '⚠️'}`);
    console.log(`📊 平均覆盖率: ${(functionalResults.averageCoverage * 100).toFixed(1)}%`);
    console.log(`🎯 平均置信度: ${(functionalResults.averageConfidence * 100).toFixed(1)}%`);
    
    if (overallSuccess && performanceGood) {
      console.log('\n🎉 所有测试通过！增强解析算法工作正常。');
    } else {
      console.log('\n⚠️ 部分测试失败，需要进一步优化。');
      
      // 显示失败的测试
      const failedTests = functionalResults.results.filter(r => !r.passed);
      if (failedTests.length > 0) {
        console.log('\n❌ 失败的测试:');
        failedTests.forEach(test => {
          console.log(`   - ${test.testName}: ${test.error}`);
        });
      }
    }
    
  } catch (error) {
    console.error('💥 测试执行失败:', error);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🏁 测试套件执行完成');
}

/**
 * 如果直接运行此文件，执行测试
 */
if (require.main === module) {
  runParsingTests().catch(console.error);
}
