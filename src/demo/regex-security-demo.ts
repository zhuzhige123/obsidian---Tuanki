/**
 * 正则表达式安全验证演示
 * 展示增强的正则表达式验证器如何检测和防护ReDoS攻击
 */

import { validateRegexSync, getRegexSecurityAdvice } from '../utils/regex-validator';

/**
 * 演示危险的正则表达式模式
 */
export function demonstrateDangerousPatterns() {
  console.log('\n=== 危险正则表达式模式检测演示 ===\n');

  const dangerousPatterns = [
    {
      name: '嵌套量词（最危险）',
      pattern: '(a*)*',
      description: '可能导致指数级回溯，造成CPU占用100%'
    },
    {
      name: '重复分组',
      pattern: '(a+)+b',
      description: '对包含量词的分组使用量词'
    },
    {
      name: '交替分支重复',
      pattern: '(a|b)*c',
      description: '对交替分支使用量词'
    },
    {
      name: '复杂前瞻断言',
      pattern: '(?=.*a)(?=.*b)(?=.*c)',
      description: '多个前瞻断言会影响性能'
    }
  ];

  for (const { name, pattern, description } of dangerousPatterns) {
    console.log(`\n${name}:`);
    console.log(`模式: ${pattern}`);
    console.log(`说明: ${description}`);
    
    const result = validateRegexSync(pattern);
    console.log(`验证结果: ${result.isValid ? '✅ 通过' : '❌ 拒绝'}`);
    console.log(`风险级别: ${result.riskLevel || 'unknown'}`);
    console.log(`复杂度: ${result.complexity || 'unknown'}`);
    
    if (result.criticalIssues && result.criticalIssues.length > 0) {
      console.log(`严重问题: ${result.criticalIssues.join(', ')}`);
    }
    
    if (result.warnings && result.warnings.length > 0) {
      console.log(`警告: ${result.warnings.join(', ')}`);
    }
    
    if (result.error) {
      console.log(`错误: ${result.error}`);
    }
    
    const advice = getRegexSecurityAdvice(pattern);
    if (advice.length > 0) {
      console.log(`建议: ${advice.join('; ')}`);
    }
  }
}

/**
 * 演示安全的正则表达式模式
 */
export function demonstrateSafePatterns() {
  console.log('\n=== 安全正则表达式模式演示 ===\n');

  const safePatterns = [
    {
      name: '简单字符匹配',
      pattern: '^[a-zA-Z0-9]+$',
      description: '匹配字母和数字'
    },
    {
      name: '日期格式',
      pattern: '\\d{4}-\\d{2}-\\d{2}',
      description: 'YYYY-MM-DD 格式日期'
    },
    {
      name: '邮箱格式',
      pattern: '[a-z]+@[a-z]+\\.[a-z]+',
      description: '简单的邮箱格式验证'
    },
    {
      name: 'Markdown标题',
      pattern: '^##\\s*([^\\n]+)\\s*\\n+([\\s\\S]*?)$',
      description: 'tuanki插件使用的Markdown标题解析'
    }
  ];

  for (const { name, pattern, description } of safePatterns) {
    console.log(`\n${name}:`);
    console.log(`模式: ${pattern}`);
    console.log(`说明: ${description}`);
    
    const result = validateRegexSync(pattern);
    console.log(`验证结果: ${result.isValid ? '✅ 通过' : '❌ 拒绝'}`);
    console.log(`风险级别: ${result.riskLevel || 'unknown'}`);
    console.log(`复杂度: ${result.complexity || 'unknown'}`);
    
    if (result.warnings && result.warnings.length > 0) {
      console.log(`警告: ${result.warnings.join(', ')}`);
    }
  }
}

/**
 * 演示性能测试
 */
export function demonstratePerformanceTesting() {
  console.log('\n=== 正则表达式性能测试演示 ===\n');

  const testCases = [
    {
      name: '高性能模式',
      pattern: '^[a-z]+$'
    },
    {
      name: '中等性能模式',
      pattern: '([a-z]+)\\s+(\\d+)'
    },
    {
      name: '可能有性能问题的模式',
      pattern: '(a|a)*b'
    }
  ];

  for (const { name, pattern } of testCases) {
    console.log(`\n${name}: ${pattern}`);
    
    const startTime = Date.now();
    const result = validateRegexSync(pattern, { timeoutMs: 1000 });
    const validationTime = Date.now() - startTime;
    
    console.log(`验证耗时: ${validationTime}ms`);
    console.log(`验证结果: ${result.isValid ? '✅ 通过' : '❌ 拒绝'}`);
    
    if (result.performanceMetrics) {
      console.log(`最大执行时间: ${result.performanceMetrics.maxExecutionTime.toFixed(2)}ms`);
      console.log(`平均执行时间: ${result.performanceMetrics.averageTime.toFixed(2)}ms`);
      if (result.performanceMetrics.failedTests.length > 0) {
        console.log(`失败的测试: ${result.performanceMetrics.failedTests.join(', ')}`);
      }
    }
  }
}

/**
 * 演示tuanki插件官方模板的安全性检查
 */
export function demonstrateOfficialTemplateValidation() {
  console.log('\n=== tuanki插件官方模板安全性检查 ===\n');

  const officialTemplates = [
    {
      name: '基础问答题',
      pattern: '##\\s*([^\\n]+)\\s*\\n+([\\s\\S]*?)(?:\\n\\*\\*标签\\*\\*:\\s*([^\\n]+))?$'
    },
    {
      name: '选择题',
      pattern: '##\\s*([^\\n]+)\\s*\\n+\\*\\*选项\\*\\*:\\s*\\n([\\s\\S]*?)(?:\\n\\*\\*解析\\*\\*:\\s*([^\\n]*?))?(?:\\n\\*\\*标签\\*\\*:\\s*([^\\n]+))?$'
    },
    {
      name: '填空题',
      pattern: '^([\\s\\S]*?)(?:\\n\\*\\*提示\\*\\*:\\s*([^\\n]*?))?(?:\\n\\*\\*标签\\*\\*:\\s*([^\\n]+))?$'
    }
  ];

  for (const { name, pattern } of officialTemplates) {
    console.log(`\n${name}:`);
    console.log(`模式: ${pattern}`);
    
    const result = validateRegexSync(pattern);
    console.log(`验证结果: ${result.isValid ? '✅ 通过' : '❌ 拒绝'}`);
    console.log(`风险级别: ${result.riskLevel || 'unknown'}`);
    console.log(`复杂度: ${result.complexity || 'unknown'}`);
    
    if (result.warnings && result.warnings.length > 0) {
      console.log(`⚠️ 警告: ${result.warnings.join(', ')}`);
    }
    
    if (result.criticalIssues && result.criticalIssues.length > 0) {
      console.log(`🚨 严重问题: ${result.criticalIssues.join(', ')}`);
    }
    
    if (result.suggestions && result.suggestions.length > 0) {
      console.log(`💡 建议: ${result.suggestions.join('; ')}`);
    }
  }
}

/**
 * 模拟ReDoS攻击场景
 */
export function simulateReDoSAttack() {
  console.log('\n=== ReDoS攻击模拟演示 ===\n');

  const attackScenarios = [
    {
      name: '经典ReDoS攻击',
      pattern: '(a+)+b',
      attackString: 'a'.repeat(30) + 'X', // 不匹配的字符串会导致大量回溯
      description: '使用不匹配的字符串触发大量回溯'
    },
    {
      name: '邮箱验证ReDoS',
      pattern: '([a-zA-Z0-9_\\.-]+)@([a-zA-Z0-9_\\.-]+)\\.([a-zA-Z]{2,5})$',
      attackString: 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.',
      description: '邮箱验证中的ReDoS漏洞'
    }
  ];

  for (const { name, pattern, attackString, description } of attackScenarios) {
    console.log(`\n${name}:`);
    console.log(`模式: ${pattern}`);
    console.log(`攻击字符串: ${attackString.substring(0, 20)}...`);
    console.log(`说明: ${description}`);
    
    // 首先验证正则表达式的安全性
    const validation = validateRegexSync(pattern);
    console.log(`安全验证: ${validation.isValid ? '✅ 通过' : '❌ 拒绝'}`);
    
    if (!validation.isValid) {
      console.log(`🛡️ 验证器成功阻止了潜在的ReDoS攻击！`);
      console.log(`错误: ${validation.error}`);
      continue;
    }
    
    // 如果通过了验证，测试实际性能
    console.log(`⚠️ 正则表达式通过了验证，但让我们测试实际性能...`);
    
    try {
      const regex = new RegExp(pattern);
      const startTime = Date.now();
      
      // 设置超时保护
      const timeoutId = setTimeout(() => {
        console.log(`🚨 检测到性能问题！执行时间超过1秒`);
      }, 1000);
      
      const result = regex.test(attackString);
      clearTimeout(timeoutId);
      
      const executionTime = Date.now() - startTime;
      console.log(`执行时间: ${executionTime}ms`);
      console.log(`匹配结果: ${result}`);
      
      if (executionTime > 100) {
        console.log(`⚠️ 性能警告：执行时间较长`);
      }
      
    } catch (error) {
      console.log(`❌ 执行错误: ${error}`);
    }
  }
}

// 如果直接运行此文件，执行所有演示
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  demonstrateDangerousPatterns();
  demonstrateSafePatterns();
  demonstratePerformanceTesting();
  demonstrateOfficialTemplateValidation();
  simulateReDoSAttack();
}
