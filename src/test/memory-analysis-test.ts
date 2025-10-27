/**
 * 记忆分析组件测试
 * 验证修复后的组件是否正常工作
 */

import { EnhancedFSRS } from '../algorithms/enhanced-fsrs';
import { getThemeColors, getAdaptiveTextColor } from '../utils/adaptive-theme';

// 测试增强的FSRS算法
export function testEnhancedFSRS() {
  console.log('🧪 测试增强的FSRS算法...');
  
  try {
    const fsrs = new EnhancedFSRS();
    
    // 测试默认曲线生成
    const curve = fsrs.generateMemoryCurve([], 30, 85);
    console.log('✅ 默认记忆曲线生成成功:', curve.length, '个数据点');
    
    // 测试洞察生成
    const insights = fsrs.generatePersonalizedInsights([], 85);
    console.log('✅ 智能洞察生成成功:', insights.length, '个建议');
    
    // 测试学习模式分析
    const pattern = fsrs.analyzeLearningPattern();
    console.log('✅ 学习模式分析成功:', pattern);
    
    return true;
  } catch (error) {
    console.error('❌ FSRS算法测试失败:', error);
    return false;
  }
}

// 测试主题系统
export function testThemeSystem() {
  console.log('🎨 测试主题系统...');
  
  try {
    // 测试颜色获取
    const colors = getThemeColors();
    console.log('✅ 主题颜色获取成功:', Object.keys(colors).length, '个颜色变量');
    
    // 测试自适应文本颜色
    const textColor = getAdaptiveTextColor('#ffffff');
    console.log('✅ 自适应文本颜色计算成功:', textColor);
    
    return true;
  } catch (error) {
    console.error('❌ 主题系统测试失败:', error);
    return false;
  }
}

// 测试数据验证
export function testDataValidation() {
  console.log('📊 测试数据验证...');
  
  try {
    const fsrs = new EnhancedFSRS();
    
    // 测试空数据处理
    const emptyCurve = fsrs.generateMemoryCurve([], 30, 80);
    if (emptyCurve.length !== 30) {
      throw new Error('空数据处理失败');
    }
    
    // 测试数据点结构
    const firstPoint = emptyCurve[0];
    const requiredFields = ['day', 'fsrsPredicted', 'actualPredicted', 'retentionGap', 'confidenceInterval'];
    for (const field of requiredFields) {
      if (!(field in firstPoint)) {
        throw new Error(`缺少必需字段: ${field}`);
      }
    }
    
    console.log('✅ 数据验证通过');
    return true;
  } catch (error) {
    console.error('❌ 数据验证失败:', error);
    return false;
  }
}

// 运行所有测试
export function runAllTests() {
  console.log('🚀 开始运行记忆分析组件测试...');
  
  const results = {
    fsrs: testEnhancedFSRS(),
    theme: testThemeSystem(),
    data: testDataValidation()
  };
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  console.log(`📋 测试结果: ${passed}/${total} 通过`);
  
  if (passed === total) {
    console.log('🎉 所有测试通过！记忆分析组件已准备就绪。');
  } else {
    console.log('⚠️ 部分测试失败，请检查相关组件。');
  }
  
  return results;
}

// 如果在浏览器环境中，自动运行测试
if (typeof window !== 'undefined') {
  // 延迟运行，确保所有模块都已加载
  setTimeout(() => {
    runAllTests();
  }, 1000);
}
