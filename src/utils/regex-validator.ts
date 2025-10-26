/**
 * 正则表达式验证工具
 * 用于防止 ReDoS 攻击和验证正则表达式的安全性
 */

export interface RegexValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  criticalIssues?: string[];
  complexity?: 'low' | 'medium' | 'high' | 'dangerous';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  performanceMetrics?: {
    maxExecutionTime: number;
    averageTime: number;
    failedTests: string[];
  };
  suggestions?: string[];
}

export interface RegexSecurityOptions {
  maxLength?: number;
  maxComplexity?: number;
  allowLookahead?: boolean;
  allowLookbehind?: boolean;
  allowBackreferences?: boolean;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<RegexSecurityOptions> = {
  maxLength: 1000,
  maxComplexity: 100,
  allowLookahead: false,
  allowLookbehind: false,
  allowBackreferences: false,
  timeoutMs: 1000
};

/**
 * 检测可能导致 ReDoS 的危险模式
 */
const REDOS_PATTERNS = [
  // 嵌套量词 - 最危险的模式
  {
    pattern: /(\*|\+|\?|\{[^}]*\})\s*(\*|\+|\?|\{[^}]*\})/g,
    severity: 'critical',
    description: '嵌套量词可能导致指数级回溯'
  },
  // 重复的分组
  {
    pattern: /\([^)]*(\*|\+|\?|\{[^}]*\})[^)]*\)\s*(\*|\+|\?|\{[^}]*\})/g,
    severity: 'high',
    description: '对包含量词的分组使用量词'
  },
  // 交替分支中的重复
  {
    pattern: /\([^|]*\|[^)]*\)\s*(\*|\+|\?|\{[^}]*\})/g,
    severity: 'high',
    description: '对交替分支使用量词'
  },
  // 复杂的字符类重复
  {
    pattern: /\[[^\]]*\]\s*(\*|\+|\?|\{[^}]*\})/g,
    severity: 'medium',
    description: '字符类与量词组合'
  },
  // 贪婪量词后跟非贪婪量词
  {
    pattern: /(\*|\+)\?\s*(\*|\+)/g,
    severity: 'high',
    description: '贪婪和非贪婪量词混合使用'
  },
  // 重叠的字符类
  {
    pattern: /\[[^\]]*\]\s*\[[^\]]*\]/g,
    severity: 'medium',
    description: '连续的字符类可能导致性能问题'
  },
  // 过度使用 .* 或 .+
  {
    pattern: /\.\*.*\.\*/g,
    severity: 'medium',
    description: '多个贪婪的通配符匹配'
  },
  // 复杂的前瞻/后瞻组合
  {
    pattern: /\(\?[=!<][^)]*\(\?[=!<]/g,
    severity: 'high',
    description: '嵌套的前瞻/后瞻断言'
  }
];

/**
 * 计算正则表达式的复杂度
 */
function calculateComplexity(pattern: string): number {
  let complexity = 0;
  
  // 基础复杂度
  complexity += pattern.length * 0.1;
  
  // 量词复杂度
  const quantifiers = pattern.match(/(\*|\+|\?|\{[^}]*\})/g) || [];
  complexity += quantifiers.length * 5;
  
  // 分组复杂度
  const groups = pattern.match(/\([^)]*\)/g) || [];
  complexity += groups.length * 3;
  
  // 字符类复杂度
  const charClasses = pattern.match(/\[[^\]]*\]/g) || [];
  complexity += charClasses.length * 2;
  
  // 交替分支复杂度
  const alternations = pattern.match(/\|/g) || [];
  complexity += alternations.length * 4;
  
  // 前瞻/后瞻复杂度
  const lookarounds = pattern.match(/\(\?[=!<]/g) || [];
  complexity += lookarounds.length * 10;
  
  // 反向引用复杂度
  const backrefs = pattern.match(/\\[1-9]/g) || [];
  complexity += backrefs.length * 8;
  
  return Math.round(complexity);
}

/**
 * 检测危险的正则表达式模式
 */
function detectDangerousPatterns(pattern: string): { warnings: string[], criticalIssues: string[], riskLevel: 'low' | 'medium' | 'high' | 'critical' } {
  const warnings: string[] = [];
  const criticalIssues: string[] = [];
  let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // 检测 ReDoS 模式
  for (const redosCheck of REDOS_PATTERNS) {
    const matches = pattern.match(redosCheck.pattern);
    if (matches) {
      const message = `${redosCheck.description} (发现 ${matches.length} 处)`;

      if (redosCheck.severity === 'critical') {
        criticalIssues.push(message);
        maxSeverity = 'critical';
      } else if (redosCheck.severity === 'high') {
        warnings.push(message);
        if (maxSeverity !== 'critical') maxSeverity = 'high';
      } else {
        warnings.push(message);
        if (maxSeverity === 'low') maxSeverity = 'medium';
      }
    }
  }

  // 检测前瞻/后瞻
  const lookarounds = pattern.match(/\(\?[=!<]/g);
  if (lookarounds) {
    warnings.push(`使用了 ${lookarounds.length} 个前瞻或后瞻断言，可能影响性能`);
    if (maxSeverity === 'low') maxSeverity = 'medium';
  }

  // 检测反向引用
  const backrefs = pattern.match(/\\[1-9]/g);
  if (backrefs) {
    warnings.push(`使用了 ${backrefs.length} 个反向引用，可能显著影响性能`);
    if (maxSeverity === 'low') maxSeverity = 'medium';
  }

  // 检测过多的嵌套分组
  const nestedGroups = pattern.match(/\([^)]*\([^)]*\)[^)]*\)/g);
  if (nestedGroups && nestedGroups.length > 3) {
    warnings.push(`嵌套分组过多 (${nestedGroups.length} 处)，可能影响性能`);
    if (maxSeverity === 'low') maxSeverity = 'medium';
  }

  // 检测过长的字符类
  const longCharClasses = pattern.match(/\[[^\]]{20,}\]/g);
  if (longCharClasses) {
    warnings.push(`字符类过长 (${longCharClasses.length} 处)，建议简化`);
  }

  // 检测过度复杂的量词
  const complexQuantifiers = pattern.match(/\{[0-9]+,[0-9]*\}/g);
  if (complexQuantifiers) {
    const largeQuantifiers = complexQuantifiers.filter(q => {
      const match = q.match(/\{([0-9]+),([0-9]*)\}/);
      if (match) {
        const min = parseInt(match[1]);
        const max = match[2] ? parseInt(match[2]) : Infinity;
        return min > 100 || max > 1000;
      }
      return false;
    });

    if (largeQuantifiers.length > 0) {
      warnings.push(`检测到大范围量词 (${largeQuantifiers.length} 处)，可能导致性能问题`);
      if (maxSeverity === 'low') maxSeverity = 'medium';
    }
  }

  // 检测潜在的灾难性回溯模式
  const catastrophicPatterns = [
    /\([^)]*\*[^)]*\)\*/, // (a*)*
    /\([^)]*\+[^)]*\)\+/, // (a+)+
    /\([^)]*\*[^)]*\)\+/, // (a*)+
    /\([^)]*\+[^)]*\)\*/, // (a+)*
  ];

  for (const catPattern of catastrophicPatterns) {
    if (catPattern.test(pattern)) {
      criticalIssues.push('检测到灾难性回溯模式，强烈建议重写正则表达式');
      maxSeverity = 'critical';
      break;
    }
  }

  return {
    warnings,
    criticalIssues,
    riskLevel: maxSeverity
  };
}

/**
 * 高级正则表达式性能测试
 */
async function testRegexPerformanceAdvanced(pattern: string, timeoutMs: number): Promise<{
  passed: boolean,
  maxExecutionTime: number,
  failedTests: string[],
  averageTime: number
}> {
  const results: { testName: string, executionTime: number, passed: boolean }[] = [];
  const failedTests: string[] = [];

  // 生成各种测试字符串，包括可能触发ReDoS的模式
  const testCases = [
    { name: '短字符串', value: 'abc123' },
    { name: '中等长度', value: 'a'.repeat(50) + 'b'.repeat(50) },
    { name: '长字符串', value: 'x'.repeat(1000) },
    { name: '重复模式', value: 'abcabc'.repeat(100) },
    { name: '部分匹配', value: 'a'.repeat(100) + 'X' },
    { name: '无匹配', value: 'z'.repeat(100) },
    { name: '边界情况', value: '' },
    { name: '特殊字符', value: '!@#$%^&*()[]{}|\\:";\'<>?,./' },
    // ReDoS 攻击测试字符串
    { name: 'ReDoS测试1', value: 'a'.repeat(100) + 'X' },
    { name: 'ReDoS测试2', value: 'a'.repeat(50) + 'b'.repeat(50) + 'X' },
    { name: 'ReDoS测试3', value: ('ab'.repeat(50)) + 'X' },
    { name: '嵌套重复', value: 'a'.repeat(30) + 'b'.repeat(30) + 'c'.repeat(30) + 'X' }
  ];

  try {
    const regex = new RegExp(pattern);

    for (const testCase of testCases) {
      try {
        const startTime = performance.now();

        // 使用 Promise.race 来实现真正的超时控制
        const testPromise = new Promise<boolean>((resolve, reject) => {
          try {
            const result = regex.test(testCase.value);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('超时')), timeoutMs);
        });

        // 等待测试完成或超时
        await Promise.race([testPromise, timeoutPromise]);

        const executionTime = performance.now() - startTime;
        const passed = executionTime < timeoutMs;

        results.push({
          testName: testCase.name,
          executionTime,
          passed
        });

        if (!passed) {
          failedTests.push(`${testCase.name} (${executionTime.toFixed(2)}ms)`);
        }

      } catch (error) {
        const executionTime = performance.now() - startTime;
        results.push({
          testName: testCase.name,
          executionTime: timeoutMs,
          passed: false
        });
        failedTests.push(`${testCase.name} (超时或错误)`);
      }
    }

  } catch (error) {
    // 正则表达式创建失败
    return {
      passed: false,
      maxExecutionTime: 0,
      failedTests: ['正则表达式语法错误'],
      averageTime: 0
    };
  }

  const executionTimes = results.map(r => r.executionTime);
  const maxExecutionTime = Math.max(...executionTimes);
  const averageTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
  const passed = failedTests.length === 0;

  return {
    passed,
    maxExecutionTime,
    failedTests,
    averageTime
  };
}

/**
 * 简单的性能测试（向后兼容）
 */
function testRegexPerformance(pattern: string, testString: string, timeoutMs: number): boolean {
  try {
    const regex = new RegExp(pattern);
    const startTime = Date.now();

    regex.test(testString);

    const executionTime = Date.now() - startTime;
    return executionTime < timeoutMs;
  } catch (error) {
    return false;
  }
}

/**
 * 验证正则表达式的安全性
 */
export async function validateRegex(pattern: string, options: RegexSecurityOptions = {}): Promise<RegexValidationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // 基础验证
  if (!pattern || typeof pattern !== 'string') {
    return {
      isValid: false,
      error: '正则表达式不能为空'
    };
  }
  
  if (pattern.length > opts.maxLength) {
    return {
      isValid: false,
      error: `正则表达式长度不能超过 ${opts.maxLength} 个字符`
    };
  }
  
  // 语法验证
  try {
    new RegExp(pattern);
  } catch (error) {
    return {
      isValid: false,
      error: `正则表达式语法错误: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
  
  // 复杂度检查
  const complexity = calculateComplexity(pattern);
  if (complexity > opts.maxComplexity) {
    return {
      isValid: false,
      error: `正则表达式过于复杂 (复杂度: ${complexity}，最大允许: ${opts.maxComplexity})`
    };
  }
  
  // 安全性检查
  const dangerousPatterns = detectDangerousPatterns(pattern);

  // 如果有关键问题，直接拒绝
  if (dangerousPatterns.criticalIssues.length > 0) {
    return {
      isValid: false,
      error: '检测到严重的安全风险',
      criticalIssues: dangerousPatterns.criticalIssues,
      warnings: dangerousPatterns.warnings,
      riskLevel: dangerousPatterns.riskLevel,
      suggestions: getRegexSecurityAdvice(pattern)
    };
  }

  // 功能限制检查
  if (!opts.allowLookahead && /\(\?=/.test(pattern)) {
    return {
      isValid: false,
      error: '不允许使用正向前瞻断言'
    };
  }

  if (!opts.allowLookbehind && /\(\?<=/.test(pattern)) {
    return {
      isValid: false,
      error: '不允许使用正向后瞻断言'
    };
  }

  if (!opts.allowBackreferences && /\\[1-9]/.test(pattern)) {
    return {
      isValid: false,
      error: '不允许使用反向引用'
    };
  }
  
  // 高级性能测试
  const performanceTest = await testRegexPerformanceAdvanced(pattern, opts.timeoutMs);

  if (!performanceTest.passed) {
    return {
      isValid: false,
      error: '正则表达式执行时间过长，存在 ReDoS 风险',
      warnings: dangerousPatterns.warnings,
      criticalIssues: ['性能测试失败'],
      riskLevel: 'critical',
      performanceMetrics: {
        maxExecutionTime: performanceTest.maxExecutionTime,
        averageTime: performanceTest.averageTime,
        failedTests: performanceTest.failedTests
      },
      suggestions: getRegexSecurityAdvice(pattern)
    };
  }

  // 确定复杂度等级
  let complexityLevel: 'low' | 'medium' | 'high' | 'dangerous';
  if (complexity < 20) {
    complexityLevel = 'low';
  } else if (complexity < 50) {
    complexityLevel = 'medium';
  } else if (complexity < 80) {
    complexityLevel = 'high';
  } else {
    complexityLevel = 'dangerous';
  }

  // 根据风险级别决定是否通过验证
  const shouldReject = dangerousPatterns.riskLevel === 'critical' ||
                      (dangerousPatterns.riskLevel === 'high' && performanceTest.maxExecutionTime > opts.timeoutMs * 0.5);

  if (shouldReject) {
    return {
      isValid: false,
      error: '正则表达式存在高风险，建议重写',
      warnings: dangerousPatterns.warnings,
      criticalIssues: dangerousPatterns.criticalIssues,
      riskLevel: dangerousPatterns.riskLevel,
      complexity: complexityLevel,
      performanceMetrics: {
        maxExecutionTime: performanceTest.maxExecutionTime,
        averageTime: performanceTest.averageTime,
        failedTests: performanceTest.failedTests
      },
      suggestions: getRegexSecurityAdvice(pattern)
    };
  }

  return {
    isValid: true,
    warnings: dangerousPatterns.warnings,
    criticalIssues: dangerousPatterns.criticalIssues,
    riskLevel: dangerousPatterns.riskLevel,
    complexity: complexityLevel,
    performanceMetrics: {
      maxExecutionTime: performanceTest.maxExecutionTime,
      averageTime: performanceTest.averageTime,
      failedTests: performanceTest.failedTests
    },
    suggestions: dangerousPatterns.warnings.length > 0 ? getRegexSecurityAdvice(pattern) : undefined
  };
}

/**
 * 同步版本的正则表达式验证（向后兼容）
 */
export function validateRegexSync(pattern: string, options: RegexSecurityOptions = {}): RegexValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 基础验证
  if (!pattern || typeof pattern !== 'string') {
    return {
      isValid: false,
      error: '正则表达式不能为空'
    };
  }

  if (pattern.length > opts.maxLength) {
    return {
      isValid: false,
      error: `正则表达式长度不能超过 ${opts.maxLength} 个字符`
    };
  }

  // 语法验证
  try {
    new RegExp(pattern);
  } catch (error) {
    return {
      isValid: false,
      error: `正则表达式语法错误: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }

  // 复杂度检查
  const complexity = calculateComplexity(pattern);
  if (complexity > opts.maxComplexity) {
    return {
      isValid: false,
      error: `正则表达式过于复杂 (复杂度: ${complexity}，最大允许: ${opts.maxComplexity})`
    };
  }

  // 安全性检查
  const dangerousPatterns = detectDangerousPatterns(pattern);

  // 如果有关键问题，直接拒绝
  if (dangerousPatterns.criticalIssues.length > 0) {
    return {
      isValid: false,
      error: '检测到严重的安全风险',
      criticalIssues: dangerousPatterns.criticalIssues,
      warnings: dangerousPatterns.warnings,
      riskLevel: dangerousPatterns.riskLevel,
      suggestions: getRegexSecurityAdvice(pattern)
    };
  }

  // 简单的性能测试
  const testStrings = [
    'a'.repeat(100),
    'ab'.repeat(50),
    'abc'.repeat(33),
    '1234567890'.repeat(10)
  ];

  for (const testString of testStrings) {
    if (!testRegexPerformance(pattern, testString, opts.timeoutMs)) {
      return {
        isValid: false,
        error: '正则表达式执行时间过长，可能存在 ReDoS 风险',
        warnings: dangerousPatterns.warnings,
        criticalIssues: ['性能测试失败'],
        riskLevel: 'critical',
        suggestions: getRegexSecurityAdvice(pattern)
      };
    }
  }

  // 确定复杂度等级
  let complexityLevel: 'low' | 'medium' | 'high' | 'dangerous';
  if (complexity < 20) {
    complexityLevel = 'low';
  } else if (complexity < 50) {
    complexityLevel = 'medium';
  } else if (complexity < 80) {
    complexityLevel = 'high';
  } else {
    complexityLevel = 'dangerous';
  }

  return {
    isValid: true,
    warnings: dangerousPatterns.warnings,
    criticalIssues: dangerousPatterns.criticalIssues,
    riskLevel: dangerousPatterns.riskLevel,
    complexity: complexityLevel,
    suggestions: dangerousPatterns.warnings.length > 0 ? getRegexSecurityAdvice(pattern) : undefined
  };
}

/**
 * 获取正则表达式的安全建议
 */
export function getRegexSecurityAdvice(pattern: string): string[] {
  const advice: string[] = [];
  
  if (/(\*|\+)\s*(\*|\+)/.test(pattern)) {
    advice.push('避免使用嵌套量词，如 a*+ 或 a++');
  }
  
  if (/\([^)]*(\*|\+)[^)]*\)\s*(\*|\+)/.test(pattern)) {
    advice.push('避免对包含量词的分组再次使用量词');
  }
  
  if (pattern.length > 100) {
    advice.push('考虑将复杂的正则表达式拆分为多个简单的表达式');
  }
  
  if (/\(\?[=!<]/.test(pattern)) {
    advice.push('前瞻和后瞻断言会影响性能，请谨慎使用');
  }
  
  if (/\\[1-9]/.test(pattern)) {
    advice.push('反向引用会显著影响性能，建议使用其他方法');
  }
  
  return advice;
}

/**
 * 清理和优化正则表达式
 */
export function sanitizeRegex(pattern: string): string {
  // 移除多余的空白字符
  let cleaned = pattern.trim();
  
  // 简化重复的字符类
  cleaned = cleaned.replace(/\[(.)\1+\]/g, '[$1]');
  
  // 简化不必要的分组
  cleaned = cleaned.replace(/\(([^|()]*)\)/g, '$1');
  
  // 移除多余的转义
  cleaned = cleaned.replace(/\\(.)/g, (match, char) => {
    const needsEscape = /[.*+?^${}()|[\]\\]/.test(char);
    return needsEscape ? match : char;
  });
  
  return cleaned;
}
