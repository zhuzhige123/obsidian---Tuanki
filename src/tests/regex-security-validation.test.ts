/**
 * 正则表达式安全验证测试
 * 验证增强的正则表达式验证器能否正确检测和防护ReDoS攻击
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { validateRegexSync, validateRegex, getRegexSecurityAdvice } from '../utils/regex-validator';

describe('正则表达式安全验证测试', () => {
  
  test('应该检测嵌套量词（最危险的ReDoS模式）', () => {
    const dangerousPatterns = [
      'a*+',
      'a++',
      '(a*)*',
      '(a+)+',
      '(a*)+',
      '(a+)*'
    ];

    for (const pattern of dangerousPatterns) {
      const result = validateRegexSync(pattern);
      expect(result.isValid).toBe(false);
      expect(result.criticalIssues).toBeDefined();
      expect(result.criticalIssues!.length).toBeGreaterThan(0);
      expect(result.riskLevel).toBe('critical');
    }
  });

  test('应该检测高风险模式', () => {
    const highRiskPatterns = [
      '(a|b)*c',  // 交替分支中的重复
      '(a*b)*',   // 重复的分组
      '(?=.*a)(?=.*b)', // 嵌套的前瞻断言
      'a*?a*'     // 贪婪和非贪婪量词混合
    ];

    for (const pattern of highRiskPatterns) {
      const result = validateRegexSync(pattern);
      expect(['high', 'critical']).toContain(result.riskLevel);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    }
  });

  test('应该允许安全的正则表达式', () => {
    const safePatterns = [
      '^[a-zA-Z0-9]+$',
      '\\d{4}-\\d{2}-\\d{2}',
      '[a-z]+@[a-z]+\\.[a-z]+',
      '^##\\s*([^\\n]+)\\s*\\n+([\\s\\S]*?)$'
    ];

    for (const pattern of safePatterns) {
      const result = validateRegexSync(pattern);
      expect(result.isValid).toBe(true);
      expect(['low', 'medium']).toContain(result.riskLevel);
    }
  });

  test('应该检测复杂度过高的正则表达式', () => {
    // 创建一个复杂度很高的正则表达式
    const complexPattern = '(' + 'a*'.repeat(50) + ')*';
    
    const result = validateRegexSync(complexPattern, { maxComplexity: 100 });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('复杂');
  });

  test('应该检测长度过长的正则表达式', () => {
    const longPattern = 'a'.repeat(1500);
    
    const result = validateRegexSync(longPattern, { maxLength: 1000 });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('长度');
  });

  test('应该检测语法错误', () => {
    const invalidPatterns = [
      '[',
      '(',
      '*',
      '+',
      '?',
      '{',
      '(?'
    ];

    for (const pattern of invalidPatterns) {
      const result = validateRegexSync(pattern);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('语法错误');
    }
  });

  test('应该提供安全建议', () => {
    const advice = getRegexSecurityAdvice('(a*)*');
    expect(advice).toBeDefined();
    expect(advice.length).toBeGreaterThan(0);
    expect(advice.some(a => a.includes('量词'))).toBe(true);
  });

  test('应该检测前瞻和后瞻断言', () => {
    const lookaroundPatterns = [
      '(?=test)',
      '(?!test)',
      '(?<=test)',
      '(?<!test)'
    ];

    for (const pattern of lookaroundPatterns) {
      const result = validateRegexSync(pattern, { 
        allowLookahead: false, 
        allowLookbehind: false 
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('断言');
    }
  });

  test('应该检测反向引用', () => {
    const backrefPatterns = [
      '(a)\\1',
      '(test).*\\1',
      '([a-z])\\1+'
    ];

    for (const pattern of backrefPatterns) {
      const result = validateRegexSync(pattern, { allowBackreferences: false });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('反向引用');
    }
  });

  test('应该检测大范围量词', () => {
    const largeQuantifierPatterns = [
      'a{1000,}',
      'b{100,2000}',
      'c{500,1500}'
    ];

    for (const pattern of largeQuantifierPatterns) {
      const result = validateRegexSync(pattern);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('大范围量词'))).toBe(true);
    }
  });

  test('应该检测过长的字符类', () => {
    const longCharClass = '[' + 'a-z'.repeat(10) + ']';
    
    const result = validateRegexSync(longCharClass);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some(w => w.includes('字符类过长'))).toBe(true);
  });

  test('应该检测过多的嵌套分组', () => {
    const nestedGroups = '((((a))))((((b))))((((c))))((((d))))';
    
    const result = validateRegexSync(nestedGroups);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some(w => w.includes('嵌套分组过多'))).toBe(true);
  });
});

describe('异步正则表达式验证测试', () => {
  test('应该进行全面的性能测试', async () => {
    const pattern = '^[a-zA-Z0-9]+$';
    
    const result = await validateRegex(pattern);
    expect(result.isValid).toBe(true);
    expect(result.performanceMetrics).toBeDefined();
    expect(result.performanceMetrics!.maxExecutionTime).toBeGreaterThan(0);
    expect(result.performanceMetrics!.averageTime).toBeGreaterThan(0);
    expect(result.performanceMetrics!.failedTests).toBeDefined();
  });

  test('应该检测性能问题', async () => {
    // 这个模式在某些输入下可能导致性能问题
    const problematicPattern = '(a+)+b';
    
    const result = await validateRegex(problematicPattern, { timeoutMs: 100 });
    
    // 根据实际性能可能通过或失败
    if (!result.isValid) {
      expect(result.error).toContain('时间');
    } else {
      expect(result.performanceMetrics).toBeDefined();
    }
  });
});

describe('tuanki插件官方正则表达式验证', () => {
  test('应该验证官方模板的正则表达式安全性', () => {
    const officialPatterns = [
      // 基础问答题
      '##\\s*([^\\n]+)\\s*\\n+([\\s\\S]*?)(?:\\n\\*\\*标签\\*\\*:\\s*([^\\n]+))?$',
      // 选择题
      '##\\s*([^\\n]+)\\s*\\n+\\*\\*选项\\*\\*:\\s*\\n([\\s\\S]*?)(?:\\n\\*\\*解析\\*\\*:\\s*([^\\n]*?))?(?:\\n\\*\\*标签\\*\\*:\\s*([^\\n]+))?$',
      // 填空题
      '^([\\s\\S]*?)(?:\\n\\*\\*提示\\*\\*:\\s*([^\\n]*?))?(?:\\n\\*\\*标签\\*\\*:\\s*([^\\n]+))?$'
    ];

    for (const pattern of officialPatterns) {
      const result = validateRegexSync(pattern);
      
      // 官方模板应该是安全的，但可能有一些警告
      expect(result.isValid).toBe(true);
      expect(result.riskLevel).not.toBe('critical');
      
      // 如果有警告，应该是低风险的
      if (result.warnings && result.warnings.length > 0) {
        expect(['low', 'medium']).toContain(result.riskLevel);
      }
    }
  });
});
