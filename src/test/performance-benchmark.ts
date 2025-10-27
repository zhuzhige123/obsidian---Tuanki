/**
 * 性能基准测试系统
 * 对解析算法进行全面的性能测试和优化分析
 */

import type { RegexParseTemplate } from '../data/template-types';
import type { EnhancedRegexParser } from '../utils/enhanced-regex-parser';

export interface BenchmarkConfig {
  iterations: number;
  warmupIterations: number;
  contentSizes: number[]; // 内容大小（字符数）
  complexityLevels: string[]; // 复杂度级别
  memoryTracking: boolean;
  gcBetweenTests: boolean;
  timeoutMs: number;
}

export interface BenchmarkResult {
  testName: string;
  contentSize: number;
  complexity: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  medianTime: number;
  standardDeviation: number;
  throughput: number; // 字符/秒
  memoryUsage?: MemoryUsage;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface BenchmarkSuite {
  name: string;
  description: string;
  config: BenchmarkConfig;
  results: BenchmarkResult[];
  summary: BenchmarkSummary;
  timestamp: number;
}

export interface BenchmarkSummary {
  totalTests: number;
  totalTime: number;
  averagePerformance: number;
  bestPerformance: BenchmarkResult;
  worstPerformance: BenchmarkResult;
  performanceBySize: Record<number, number>;
  performanceByComplexity: Record<string, number>;
  recommendations: string[];
}

/**
 * 性能基准测试器
 * 提供全面的性能测试和分析功能
 */
export class PerformanceBenchmark {
  private parser: EnhancedRegexParser;
  private template: RegexParseTemplate;
  private config: BenchmarkConfig;

  constructor(
    parser: EnhancedRegexParser,
    template: RegexParseTemplate,
    config?: Partial<BenchmarkConfig>
  ) {
    this.parser = parser;
    this.template = template;
    this.config = {
      iterations: 100,
      warmupIterations: 10,
      contentSizes: [100, 500, 1000, 2000, 5000, 10000],
      complexityLevels: ['simple', 'medium', 'complex'],
      memoryTracking: true,
      gcBetweenTests: true,
      timeoutMs: 30000,
      ...config
    };
  }

  /**
   * 运行完整的基准测试套件
   */
  async runBenchmarkSuite(): Promise<BenchmarkSuite> {
    console.log('🚀 [PerformanceBenchmark] 开始性能基准测试');
    console.log(`📊 [PerformanceBenchmark] 配置: ${this.config.iterations}次迭代, ${this.config.contentSizes.length}种大小, ${this.config.complexityLevels.length}种复杂度`);

    const startTime = Date.now();
    const results: BenchmarkResult[] = [];

    // 为每种内容大小和复杂度组合运行测试
    for (const contentSize of this.config.contentSizes) {
      for (const complexity of this.config.complexityLevels) {
        console.log(`🧪 [PerformanceBenchmark] 测试: ${contentSize}字符, ${complexity}复杂度`);
        
        const testContent = this.generateTestContent(contentSize, complexity);
        const result = await this.runSingleBenchmark(
          `${contentSize}_${complexity}`,
          testContent,
          contentSize,
          complexity
        );
        
        results.push(result);

        // 垃圾回收
        if (this.config.gcBetweenTests && typeof global !== 'undefined' && global.gc) {
          global.gc();
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const summary = this.generateSummary(results, totalTime);

    const suite: BenchmarkSuite = {
      name: '解析性能基准测试',
      description: '全面的解析算法性能测试',
      config: this.config,
      results,
      summary,
      timestamp: Date.now()
    };

    console.log(`✅ [PerformanceBenchmark] 基准测试完成，总耗时: ${totalTime}ms`);
    this.printSummary(summary);

    return suite;
  }

  /**
   * 运行单个基准测试
   */
  async runSingleBenchmark(
    testName: string,
    content: string,
    contentSize: number,
    complexity: string
  ): Promise<BenchmarkResult> {
    const times: number[] = [];
    let memoryBefore: MemoryUsage | undefined;
    let memoryAfter: MemoryUsage | undefined;

    // 预热
    console.log(`🔥 [PerformanceBenchmark] 预热 ${this.config.warmupIterations} 次`);
    for (let i = 0; i < this.config.warmupIterations; i++) {
      try {
        this.parser.parseContent(content, this.template);
      } catch (error) {
        console.warn(`⚠️ [PerformanceBenchmark] 预热失败:`, error);
      }
    }

    // 记录内存使用（开始）
    if (this.config.memoryTracking) {
      memoryBefore = this.getMemoryUsage();
    }

    // 正式测试
    console.log(`⏱️ [PerformanceBenchmark] 正式测试 ${this.config.iterations} 次`);
    for (let i = 0; i < this.config.iterations; i++) {
      const startTime = performance.now();
      
      try {
        this.parser.parseContent(content, this.template);
        const endTime = performance.now();
        times.push(endTime - startTime);
      } catch (error) {
        console.warn(`⚠️ [PerformanceBenchmark] 测试失败 (${i + 1}/${this.config.iterations}):`, error);
        // 记录一个很大的时间值表示失败
        times.push(this.config.timeoutMs);
      }
    }

    // 记录内存使用（结束）
    if (this.config.memoryTracking) {
      memoryAfter = this.getMemoryUsage();
    }

    // 计算统计数据
    const sortedTimes = times.sort((a, b) => a - b);
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / times.length;
    const minTime = sortedTimes[0];
    const maxTime = sortedTimes[sortedTimes.length - 1];
    const medianTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
    
    // 计算标准差
    const variance = times.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / times.length;
    const standardDeviation = Math.sqrt(variance);

    // 计算吞吐量（字符/秒）
    const throughput = contentSize / (averageTime / 1000);

    // 计算百分位数
    const percentiles = {
      p50: sortedTimes[Math.floor(sortedTimes.length * 0.5)],
      p90: sortedTimes[Math.floor(sortedTimes.length * 0.9)],
      p95: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
      p99: sortedTimes[Math.floor(sortedTimes.length * 0.99)]
    };

    const result: BenchmarkResult = {
      testName,
      contentSize,
      complexity,
      iterations: this.config.iterations,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      medianTime,
      standardDeviation,
      throughput,
      percentiles
    };

    // 添加内存使用信息
    if (memoryBefore && memoryAfter) {
      result.memoryUsage = {
        heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
        heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
        external: memoryAfter.external - memoryBefore.external,
        rss: memoryAfter.rss - memoryBefore.rss
      };
    }

    console.log(`📊 [PerformanceBenchmark] ${testName}: 平均 ${averageTime.toFixed(2)}ms, 吞吐量 ${throughput.toFixed(0)} 字符/秒`);

    return result;
  }

  /**
   * 运行压力测试
   */
  async runStressTest(maxContentSize: number = 50000, step: number = 5000): Promise<BenchmarkResult[]> {
    console.log(`💪 [PerformanceBenchmark] 开始压力测试，最大内容大小: ${maxContentSize}`);
    
    const results: BenchmarkResult[] = [];
    
    for (let size = step; size <= maxContentSize; size += step) {
      console.log(`🔥 [PerformanceBenchmark] 压力测试: ${size} 字符`);
      
      const content = this.generateTestContent(size, 'complex');
      const result = await this.runSingleBenchmark(
        `stress_${size}`,
        content,
        size,
        'stress'
      );
      
      results.push(result);
      
      // 如果性能急剧下降，提前结束
      if (result.averageTime > 5000) { // 5秒超时
        console.warn(`⚠️ [PerformanceBenchmark] 性能下降严重，提前结束压力测试`);
        break;
      }
    }
    
    return results;
  }

  /**
   * 运行内存泄漏测试
   */
  async runMemoryLeakTest(iterations: number = 1000): Promise<MemoryUsage[]> {
    console.log(`🧠 [PerformanceBenchmark] 开始内存泄漏测试，${iterations} 次迭代`);
    
    const memorySnapshots: MemoryUsage[] = [];
    const content = this.generateTestContent(1000, 'medium');
    
    for (let i = 0; i < iterations; i++) {
      // 执行解析
      this.parser.parseContent(content, this.template);
      
      // 每100次迭代记录一次内存使用
      if (i % 100 === 0) {
        const memory = this.getMemoryUsage();
        memorySnapshots.push(memory);
        console.log(`📊 [PerformanceBenchmark] 迭代 ${i}: 堆内存 ${(memory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      }
    }
    
    return memorySnapshots;
  }

  // 私有方法

  private generateTestContent(size: number, complexity: string): string {
    const templates = {
      simple: (size: number) => {
        const baseContent = '## 什么是JavaScript？\n\nJavaScript是一种编程语言。';
        return baseContent.repeat(Math.ceil(size / baseContent.length)).substring(0, size);
      },
      
      medium: (size: number) => {
        const baseContent = `## 什么是React？

React是一个用于构建用户界面的JavaScript库。

### 主要特点

1. 组件化开发
2. 虚拟DOM
3. 单向数据流

### 示例代码

\`\`\`jsx
function Welcome(props) {
  return <h1>Hello, {props.name}</h1>;
}
\`\`\`

> React使开发更加高效。`;
        return baseContent.repeat(Math.ceil(size / baseContent.length)).substring(0, size);
      },
      
      complex: (size: number) => {
        const baseContent = `## 什么是机器学习？

机器学习（Machine Learning, ML）是人工智能（AI）的一个分支。

### 主要类型

#### 1. 监督学习
- 分类任务
- 回归任务

#### 2. 无监督学习
- 聚类算法
- 降维算法

#### 3. 强化学习
- 智能体与环境交互
- 奖励机制

### 算法示例

| 算法 | 类型 | 应用 |
|------|------|------|
| 线性回归 | 监督学习 | 预测 |
| K-means | 无监督学习 | 聚类 |
| Q-learning | 强化学习 | 决策 |

### 数学公式

损失函数：$L(y, \\hat{y}) = \\frac{1}{2}(y - \\hat{y})^2$

### 代码示例

\`\`\`python
import numpy as np
from sklearn.linear_model import LinearRegression

# 创建模型
model = LinearRegression()

# 训练数据
X = np.array([[1], [2], [3], [4]])
y = np.array([2, 4, 6, 8])

# 训练模型
model.fit(X, y)

# 预测
prediction = model.predict([[5]])
print(f"预测结果: {prediction}")
\`\`\`

**重要提示**: 机器学习需要大量数据和计算资源。

![机器学习流程图](https://example.com/ml-flow.png)

---

*参考文献*:
1. Pattern Recognition and Machine Learning
2. The Elements of Statistical Learning
3. Hands-On Machine Learning`;
        return baseContent.repeat(Math.ceil(size / baseContent.length)).substring(0, size);
      }
    };

    return templates[complexity] ? templates[complexity](size) : templates.medium(size);
  }

  private getMemoryUsage(): MemoryUsage {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        rss: usage.rss
      };
    } else if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      return {
        heapUsed: memory.usedJSHeapSize || 0,
        heapTotal: memory.totalJSHeapSize || 0,
        external: 0,
        rss: 0
      };
    } else {
      return {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0
      };
    }
  }

  private generateSummary(results: BenchmarkResult[], totalTime: number): BenchmarkSummary {
    const totalTests = results.length;
    const averagePerformance = results.reduce((sum, r) => sum + r.averageTime, 0) / totalTests;
    
    const bestPerformance = results.reduce((best, current) => 
      current.averageTime < best.averageTime ? current : best
    );
    
    const worstPerformance = results.reduce((worst, current) => 
      current.averageTime > worst.averageTime ? current : worst
    );

    // 按大小分组性能
    const performanceBySize: Record<number, number> = {};
    const sizeGroups: Record<number, BenchmarkResult[]> = {};
    
    results.forEach(result => {
      if (!sizeGroups[result.contentSize]) {
        sizeGroups[result.contentSize] = [];
      }
      sizeGroups[result.contentSize].push(result);
    });
    
    Object.entries(sizeGroups).forEach(([size, groupResults]) => {
      const avgTime = groupResults.reduce((sum, r) => sum + r.averageTime, 0) / groupResults.length;
      performanceBySize[parseInt(size)] = avgTime;
    });

    // 按复杂度分组性能
    const performanceByComplexity: Record<string, number> = {};
    const complexityGroups: Record<string, BenchmarkResult[]> = {};
    
    results.forEach(result => {
      if (!complexityGroups[result.complexity]) {
        complexityGroups[result.complexity] = [];
      }
      complexityGroups[result.complexity].push(result);
    });
    
    Object.entries(complexityGroups).forEach(([complexity, groupResults]) => {
      const avgTime = groupResults.reduce((sum, r) => sum + r.averageTime, 0) / groupResults.length;
      performanceByComplexity[complexity] = avgTime;
    });

    // 生成建议
    const recommendations = this.generateRecommendations(results);

    return {
      totalTests,
      totalTime,
      averagePerformance,
      bestPerformance,
      worstPerformance,
      performanceBySize,
      performanceByComplexity,
      recommendations
    };
  }

  private generateRecommendations(results: BenchmarkResult[]): string[] {
    const recommendations: string[] = [];
    
    // 检查性能问题
    const slowResults = results.filter(r => r.averageTime > 100);
    if (slowResults.length > 0) {
      recommendations.push(`发现${slowResults.length}个慢速测试用例，建议优化解析算法`);
    }
    
    // 检查内存使用
    const highMemoryResults = results.filter(r => 
      r.memoryUsage && r.memoryUsage.heapUsed > 10 * 1024 * 1024 // 10MB
    );
    if (highMemoryResults.length > 0) {
      recommendations.push(`发现${highMemoryResults.length}个高内存使用测试，建议优化内存管理`);
    }
    
    // 检查吞吐量
    const lowThroughputResults = results.filter(r => r.throughput < 10000); // 10k字符/秒
    if (lowThroughputResults.length > 0) {
      recommendations.push(`发现${lowThroughputResults.length}个低吞吐量测试，建议优化处理速度`);
    }
    
    // 检查标准差
    const highVarianceResults = results.filter(r => r.standardDeviation > r.averageTime * 0.5);
    if (highVarianceResults.length > 0) {
      recommendations.push(`发现${highVarianceResults.length}个高方差测试，性能不稳定`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('性能表现良好，无需特别优化');
    }
    
    return recommendations;
  }

  private printSummary(summary: BenchmarkSummary): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 性能基准测试摘要');
    console.log('='.repeat(60));
    console.log(`总测试数: ${summary.totalTests}`);
    console.log(`总耗时: ${summary.totalTime}ms`);
    console.log(`平均性能: ${summary.averagePerformance.toFixed(2)}ms`);
    console.log(`最佳性能: ${summary.bestPerformance.averageTime.toFixed(2)}ms (${summary.bestPerformance.testName})`);
    console.log(`最差性能: ${summary.worstPerformance.averageTime.toFixed(2)}ms (${summary.worstPerformance.testName})`);

    console.log('\n📏 按内容大小分组:');
    Object.entries(summary.performanceBySize).forEach(([size, avgTime]) => {
      console.log(`  ${size}字符: ${avgTime.toFixed(2)}ms`);
    });

    console.log('\n🎯 按复杂度分组:');
    Object.entries(summary.performanceByComplexity).forEach(([complexity, avgTime]) => {
      console.log(`  ${complexity}: ${avgTime.toFixed(2)}ms`);
    });

    console.log('\n💡 优化建议:');
    summary.recommendations.forEach(rec => {
      console.log(`  - ${rec}`);
    });

    console.log('='.repeat(60));
  }

  /**
   * 生成性能报告
   */
  generatePerformanceReport(suite: BenchmarkSuite): string {
    const report = [];

    report.push(`# 性能基准测试报告`);
    report.push(`生成时间: ${new Date(suite.timestamp).toLocaleString('zh-CN')}`);
    report.push(`测试套件: ${suite.name}`);
    report.push('');

    // 配置信息
    report.push('## 测试配置');
    report.push(`- 迭代次数: ${suite.config.iterations}`);
    report.push(`- 预热次数: ${suite.config.warmupIterations}`);
    report.push(`- 内容大小: ${suite.config.contentSizes.join(', ')} 字符`);
    report.push(`- 复杂度级别: ${suite.config.complexityLevels.join(', ')}`);
    report.push(`- 内存跟踪: ${suite.config.memoryTracking ? '启用' : '禁用'}`);
    report.push(`- 超时时间: ${suite.config.timeoutMs}ms`);
    report.push('');

    // 总体统计
    report.push('## 总体统计');
    report.push(`- 总测试数: ${suite.summary.totalTests}`);
    report.push(`- 总耗时: ${suite.summary.totalTime}ms`);
    report.push(`- 平均性能: ${suite.summary.averagePerformance.toFixed(2)}ms`);
    report.push(`- 最佳性能: ${suite.summary.bestPerformance.averageTime.toFixed(2)}ms`);
    report.push(`- 最差性能: ${suite.summary.worstPerformance.averageTime.toFixed(2)}ms`);
    report.push('');

    // 详细结果
    report.push('## 详细测试结果');
    report.push('| 测试名称 | 内容大小 | 复杂度 | 平均时间(ms) | 最小时间(ms) | 最大时间(ms) | 吞吐量(字符/秒) |');
    report.push('|----------|----------|--------|--------------|--------------|--------------|-----------------|');

    suite.results.forEach(result => {
      report.push(`| ${result.testName} | ${result.contentSize} | ${result.complexity} | ${result.averageTime.toFixed(2)} | ${result.minTime.toFixed(2)} | ${result.maxTime.toFixed(2)} | ${result.throughput.toFixed(0)} |`);
    });
    report.push('');

    // 性能分析
    report.push('## 性能分析');

    report.push('### 按内容大小分组');
    Object.entries(suite.summary.performanceBySize).forEach(([size, avgTime]) => {
      report.push(`- ${size}字符: ${avgTime.toFixed(2)}ms`);
    });
    report.push('');

    report.push('### 按复杂度分组');
    Object.entries(suite.summary.performanceByComplexity).forEach(([complexity, avgTime]) => {
      report.push(`- ${complexity}: ${avgTime.toFixed(2)}ms`);
    });
    report.push('');

    // 优化建议
    report.push('## 优化建议');
    suite.summary.recommendations.forEach(rec => {
      report.push(`- ${rec}`);
    });
    report.push('');

    return report.join('\n');
  }

  /**
   * 比较两个基准测试结果
   */
  static compareBenchmarks(baseline: BenchmarkSuite, current: BenchmarkSuite): {
    improvement: number;
    regression: number;
    details: Array<{
      testName: string;
      baselineTime: number;
      currentTime: number;
      change: number;
      changePercent: number;
    }>;
  } {
    const details: Array<{
      testName: string;
      baselineTime: number;
      currentTime: number;
      change: number;
      changePercent: number;
    }> = [];

    let totalImprovement = 0;
    let totalRegression = 0;

    baseline.results.forEach(baselineResult => {
      const currentResult = current.results.find(r => r.testName === baselineResult.testName);
      if (currentResult) {
        const change = currentResult.averageTime - baselineResult.averageTime;
        const changePercent = (change / baselineResult.averageTime) * 100;

        details.push({
          testName: baselineResult.testName,
          baselineTime: baselineResult.averageTime,
          currentTime: currentResult.averageTime,
          change,
          changePercent
        });

        if (change < 0) {
          totalImprovement += Math.abs(change);
        } else {
          totalRegression += change;
        }
      }
    });

    return {
      improvement: totalImprovement,
      regression: totalRegression,
      details
    };
  }
}
