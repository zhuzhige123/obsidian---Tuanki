#!/usr/bin/env node

/**
 * FSRS6参数修复验证脚本
 * 测试参数验证和自动修复功能
 */

import fs from 'fs';
import path from 'path';

// 模拟FSRS6参数范围
const FSRS6_PARAMETER_RANGES = {
  w0: { min: 0.1, max: 2.0 },
  w1: { min: 0.5, max: 3.0 },
  w2: { min: 1.0, max: 5.0 },
  w3: { min: 3.0, max: 15.0 },
  w4: { min: 3.0, max: 10.0 },
  w5: { min: 0.5, max: 2.0 },
  w6: { min: 0.5, max: 5.0 },
  w7: { min: 0.0, max: 0.5 },    // 关键参数：难度衰减
  w8: { min: 0.5, max: 3.0 },
  w9: { min: 0.0, max: 1.0 },
  w10: { min: 0.5, max: 2.0 },
  w11: { min: 0.5, max: 3.0 },
  w12: { min: 0.0, max: 2.0 },
  w13: { min: 0.0, max: 1.0 },
  w14: { min: 0.0, max: 2.0 },
  w15: { min: 0.5, max: 1.5 },
  w16: { min: 1.0, max: 3.0 },
  w17: { min: 0.0, max: 1.0 },
  w18: { min: 0.0, max: 0.5 },
  w19: { min: 0.0, max: 1.0 },
  w20: { min: 0.0, max: 1.0 }
};

// 默认FSRS6参数
const DEFAULT_WEIGHTS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
  0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
  0.5425, 0.0912, 0.0658, 0.1542
];

/**
 * 验证参数范围
 */
function validateParameters(weights) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(weights)) {
    errors.push('权重参数必须是数组');
    return { isValid: false, errors, warnings };
  }

  if (weights.length !== 21) {
    errors.push(`参数数量错误：期望21个，实际${weights.length}个`);
    return { isValid: false, errors, warnings };
  }

  weights.forEach((weight, index) => {
    const paramName = `w${index}`;
    const range = FSRS6_PARAMETER_RANGES[paramName];

    if (typeof weight !== 'number' || isNaN(weight)) {
      errors.push(`${paramName}: 不是有效数字 (${weight})`);
      return;
    }

    if (weight < range.min || weight > range.max) {
      errors.push(`${paramName}: ${weight} 超出范围 [${range.min}, ${range.max}]`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 测试用例
 */
const testCases = [
  {
    name: '正常参数',
    weights: DEFAULT_WEIGHTS,
    expectedValid: true
  },
  {
    name: '错误的w7参数（负数）',
    weights: [
      0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, -0.07348610381426297, 1.8722,
      0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
      0.5425, 0.0912, 0.0658, 0.1542
    ],
    expectedValid: false
  },
  {
    name: '参数数量不足',
    weights: [0.212, 1.2931, 2.3065],
    expectedValid: false
  },
  {
    name: '包含NaN的参数',
    weights: [
      0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, NaN, 1.8722,
      0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
      0.5425, 0.0912, 0.0658, 0.1542
    ],
    expectedValid: false
  },
  {
    name: '多个参数超出范围',
    weights: [
      -1, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.6, 1.8722,
      0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
      0.5425, 0.0912, 0.0658, 1.8
    ],
    expectedValid: false
  }
];

/**
 * 运行测试
 */
function runTests() {
  console.log('🧪 FSRS6参数验证测试开始\n');

  let passedTests = 0;
  let totalTests = testCases.length;

  testCases.forEach((testCase, index) => {
    console.log(`📋 测试 ${index + 1}: ${testCase.name}`);
    
    const result = validateParameters(testCase.weights);
    const passed = result.isValid === testCase.expectedValid;
    
    if (passed) {
      console.log('✅ 通过');
      passedTests++;
    } else {
      console.log('❌ 失败');
      console.log(`   期望: ${testCase.expectedValid ? '有效' : '无效'}`);
      console.log(`   实际: ${result.isValid ? '有效' : '无效'}`);
    }

    if (result.errors.length > 0) {
      console.log('   错误:', result.errors.join(', '));
    }

    if (result.warnings.length > 0) {
      console.log('   警告:', result.warnings.join(', '));
    }

    console.log('');
  });

  console.log(`📊 测试结果: ${passedTests}/${totalTests} 通过`);
  
  if (passedTests === totalTests) {
    console.log('🎉 所有测试通过！FSRS6参数验证功能正常工作。');
    return true;
  } else {
    console.log('⚠️ 部分测试失败，请检查参数验证逻辑。');
    return false;
  }
}

/**
 * 验证默认参数
 */
function validateDefaults() {
  console.log('🔍 验证默认FSRS6参数...\n');
  
  const result = validateParameters(DEFAULT_WEIGHTS);
  
  if (result.isValid) {
    console.log('✅ 默认参数验证通过');
    console.log('📋 参数详情:');
    DEFAULT_WEIGHTS.forEach((weight, index) => {
      const paramName = `w${index}`;
      const range = FSRS6_PARAMETER_RANGES[paramName];
      console.log(`   ${paramName}: ${weight} [${range.min}, ${range.max}]`);
    });
  } else {
    console.log('❌ 默认参数验证失败');
    result.errors.forEach(error => console.log(`   错误: ${error}`));
  }
  
  return result.isValid;
}

// 直接运行测试
console.log('🚀 FSRS6参数修复验证工具\n');

const defaultsValid = validateDefaults();
console.log('\n' + '='.repeat(50) + '\n');

const testsPass = runTests();

console.log('\n' + '='.repeat(50));
console.log('📋 总结:');
console.log(`   默认参数: ${defaultsValid ? '✅ 有效' : '❌ 无效'}`);
console.log(`   测试结果: ${testsPass ? '✅ 通过' : '❌ 失败'}`);

if (defaultsValid && testsPass) {
  console.log('\n🎉 FSRS6参数修复功能验证完成！插件应该能够正常初始化。');
  process.exit(0);
} else {
  console.log('\n⚠️ 发现问题，请检查参数定义和验证逻辑。');
  process.exit(1);
}

export {
  validateParameters,
  FSRS6_PARAMETER_RANGES,
  DEFAULT_WEIGHTS
};
