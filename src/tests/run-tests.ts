/**
 * 测试启动器
 * 运行所有测试用例
 */

import { testRunner } from '../utils/test-runner';

// 导入所有测试文件
import './sync-manager.test';
import './sync-system.test';
// import './data-import.test'; // APKG导入测试

/**
 * 运行所有测试
 */
export async function runAllTests(): Promise<boolean> {
  console.log('🚀 启动 Tuanki 插件测试套件\n');
  
  try {
    const report = await testRunner.run();
    
    // 返回测试是否全部通过
    return report.success;
    
  } catch (error) {
    console.error('❌ 测试运行失败:', error);
    return false;
  }
}

/**
 * 在开发环境中运行测试
 */
export async function runDevTests(): Promise<void> {
  const success = await runAllTests();
  
  if (success) {
    console.log('\n✅ 所有测试通过！插件功能正常。');
  } else {
    console.log('\n❌ 有测试失败！请检查代码。');
  }
}

// 🚨 修复：禁用自动执行测试，防止意外运行
// 测试应该通过明确调用来执行，而不是自动运行
// if (typeof window === 'undefined') {
//   // Node.js 环境
//   runDevTests().catch(console.error);
// }

export default runAllTests;
