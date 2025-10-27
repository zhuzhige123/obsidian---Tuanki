/**
 * 网络优化器演示
 * 展示请求合并、连接池管理和智能重试机制
 */

import { 
  NetworkOptimizer, 
  ConnectionPoolManager,
  RequestBatcher,
  type RequestConfig,
  type BatchConfig,
  type ConnectionPoolConfig 
} from './network-optimizer';

/**
 * 演示基本网络优化功能
 */
export async function demonstrateBasicNetworkOptimization(): Promise<void> {
  console.log('🌐 基本网络优化功能演示\n');

  const optimizer = new NetworkOptimizer(
    {
      maxConnections: 5,
      maxConnectionsPerHost: 2,
      connectionTimeout: 10000,
      maxRetries: 2
    },
    {
      maxBatchSize: 5,
      batchTimeout: 200,
      endpoint: '/api/batch',
      mergeStrategy: 'array'
    }
  );

  try {
    console.log('📊 初始网络状态:');
    let stats = optimizer.getNetworkStats();
    console.log(`  活跃连接: ${stats.activeConnections}`);
    console.log(`  队列请求: ${stats.queuedRequests}`);

    // 单个请求测试
    console.log('\n🔗 单个请求测试:');
    const singleRequests: RequestConfig[] = [
      {
        url: 'https://api.example.com/templates/1',
        method: 'GET',
        cacheable: true,
        priority: 'high'
      },
      {
        url: 'https://api.example.com/cards/123',
        method: 'GET',
        cacheable: true,
        priority: 'medium'
      },
      {
        url: 'https://api.example.com/decks/456',
        method: 'GET',
        cacheable: false,
        priority: 'low'
      }
    ];

    for (const request of singleRequests) {
      const startTime = Date.now();
      const result = await optimizer.request(request);
      const duration = Date.now() - startTime;
      
      console.log(`  ${result.success ? '✅' : '❌'} ${request.url}`);
      console.log(`     耗时: ${duration}ms, 重试: ${result.timing.retries}次`);
      console.log(`     缓存: ${result.fromCache ? '命中' : '未命中'}`);
    }

    // 缓存命中测试
    console.log('\n💾 缓存命中测试:');
    const cachedRequest = singleRequests[0]; // 重复第一个请求
    const cachedResult = await optimizer.request(cachedRequest);
    console.log(`  缓存命中: ${cachedResult.fromCache ? '是' : '否'}`);
    console.log(`  响应时间: ${cachedResult.timing.duration}ms`);

    // 显示网络统计
    console.log('\n📈 网络统计:');
    stats = optimizer.getNetworkStats();
    console.log(`  总请求数: ${stats.totalRequests}`);
    console.log(`  成功请求: ${stats.successfulRequests}`);
    console.log(`  失败请求: ${stats.failedRequests}`);
    console.log(`  平均延迟: ${stats.averageLatency.toFixed(2)}ms`);
    console.log(`  缓存命中率: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
    console.log(`  重试次数: ${stats.retryCount}`);

  } finally {
    optimizer.destroy();
  }
}

/**
 * 演示批量请求处理
 */
export async function demonstrateBatchProcessing(): Promise<void> {
  console.log('\n\n📦 批量请求处理演示\n');

  const batchConfig: BatchConfig = {
    maxBatchSize: 3,
    batchTimeout: 500,
    endpoint: '/api/batch',
    mergeStrategy: 'array'
  };

  const optimizer = new NetworkOptimizer(undefined, batchConfig);

  try {
    console.log('🚀 创建批量请求:');
    
    // 创建可批量处理的请求
    const batchableRequests: RequestConfig[] = [
      {
        url: '/api/cards/1',
        method: 'POST',
        body: { content: 'Card 1' },
        batchable: true,
        priority: 'medium'
      },
      {
        url: '/api/cards/2',
        method: 'POST',
        body: { content: 'Card 2' },
        batchable: true,
        priority: 'medium'
      },
      {
        url: '/api/cards/3',
        method: 'POST',
        body: { content: 'Card 3' },
        batchable: true,
        priority: 'medium'
      },
      {
        url: '/api/cards/4',
        method: 'POST',
        body: { content: 'Card 4' },
        batchable: true,
        priority: 'low'
      },
      {
        url: '/api/cards/5',
        method: 'POST',
        body: { content: 'Card 5' },
        batchable: true,
        priority: 'low'
      }
    ];

    // 并发发送批量请求
    console.log(`发送 ${batchableRequests.length} 个批量请求...`);
    const promises = batchableRequests.map(async (request, index) => {
      const startTime = Date.now();
      const result = await optimizer.request(request);
      const duration = Date.now() - startTime;
      
      console.log(`  ${index + 1}. ${result.success ? '✅' : '❌'} 批量请求完成`);
      console.log(`     耗时: ${duration}ms, 批次ID: ${result.batchId || 'N/A'}`);
      
      return result;
    });

    const results = await Promise.all(promises);
    
    // 分析批量处理结果
    console.log('\n📊 批量处理分析:');
    const batchIds = new Set(results.map(r => r.batchId).filter(Boolean));
    console.log(`  生成的批次数: ${batchIds.size}`);
    console.log(`  成功处理: ${results.filter(r => r.success).length}/${results.length}`);
    
    const avgDuration = results.reduce((sum, r) => sum + r.timing.duration, 0) / results.length;
    console.log(`  平均处理时间: ${avgDuration.toFixed(2)}ms`);

    // 网络统计
    const stats = optimizer.getNetworkStats();
    console.log(`  批量请求数: ${stats.batchedRequests}`);

  } finally {
    optimizer.destroy();
  }
}

/**
 * 演示连接池管理
 */
export async function demonstrateConnectionPooling(): Promise<void> {
  console.log('\n\n🏊‍♂️ 连接池管理演示\n');

  const poolConfig: ConnectionPoolConfig = {
    maxConnections: 3,
    maxConnectionsPerHost: 2,
    connectionTimeout: 5000,
    keepAliveTimeout: 10000,
    retryDelay: 500,
    maxRetries: 2
  };

  const poolManager = new ConnectionPoolManager(poolConfig);

  try {
    console.log('🔗 测试连接池限制:');
    
    // 创建多个并发请求
    const concurrentRequests: RequestConfig[] = [];
    for (let i = 0; i < 8; i++) {
      concurrentRequests.push({
        url: `https://host${i % 3}.example.com/api/data/${i}`,
        method: 'GET',
        priority: i < 4 ? 'high' : 'medium'
      });
    }

    console.log(`发送 ${concurrentRequests.length} 个并发请求...`);
    
    const startTime = Date.now();
    const promises = concurrentRequests.map(async (request, index) => {
      try {
        const result = await poolManager.executeRequest(request);
        console.log(`  ${index + 1}. ✅ 请求完成: ${request.url.split('/').pop()}`);
        console.log(`     耗时: ${result.timing.duration}ms, 重试: ${result.timing.retries}次`);
        return result;
      } catch (error) {
        console.log(`  ${index + 1}. ❌ 请求失败: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });

    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    console.log('\n📊 连接池性能分析:');
    const successfulResults = results.filter(r => r !== null);
    console.log(`  总耗时: ${totalTime}ms`);
    console.log(`  成功请求: ${successfulResults.length}/${concurrentRequests.length}`);
    console.log(`  平均延迟: ${successfulResults.reduce((sum, r) => sum + r!.timing.duration, 0) / successfulResults.length}ms`);
    
    const stats = poolManager.getStats();
    console.log(`  活跃连接: ${stats.activeConnections}`);
    console.log(`  总重试次数: ${stats.retryCount}`);

    // 等待连接清理
    console.log('\n⏳ 等待连接清理...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const finalStats = poolManager.getStats();
    console.log(`清理后活跃连接: ${finalStats.activeConnections}`);

  } finally {
    poolManager.destroy();
  }
}

/**
 * 演示智能重试机制
 */
export async function demonstrateIntelligentRetry(): Promise<void> {
  console.log('\n\n🔄 智能重试机制演示\n');

  const optimizer = new NetworkOptimizer({
    maxRetries: 3,
    retryDelay: 200
  });

  try {
    console.log('🎯 测试不同重试策略:');
    
    const retryTestRequests: RequestConfig[] = [
      {
        url: 'https://unreliable.example.com/api/data/1',
        method: 'GET',
        retries: 1,
        priority: 'high'
      },
      {
        url: 'https://unreliable.example.com/api/data/2',
        method: 'GET',
        retries: 3,
        priority: 'medium'
      },
      {
        url: 'https://unreliable.example.com/api/data/3',
        method: 'GET',
        retries: 5,
        priority: 'low'
      }
    ];

    for (const request of retryTestRequests) {
      console.log(`\n🔄 测试请求: ${request.url.split('/').pop()} (最大重试: ${request.retries}次)`);
      
      const startTime = Date.now();
      const result = await optimizer.request(request);
      const totalTime = Date.now() - startTime;
      
      console.log(`  结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
      console.log(`  总耗时: ${totalTime}ms`);
      console.log(`  实际重试: ${result.timing.retries}次`);
      console.log(`  平均每次: ${(result.timing.duration / (result.timing.retries + 1)).toFixed(2)}ms`);
      
      if (!result.success) {
        console.log(`  错误信息: ${result.error}`);
      }
    }

    // 显示重试统计
    console.log('\n📊 重试统计:');
    const stats = optimizer.getNetworkStats();
    console.log(`  总重试次数: ${stats.retryCount}`);
    console.log(`  成功率: ${(stats.successfulRequests / stats.totalRequests * 100).toFixed(1)}%`);

  } finally {
    optimizer.destroy();
  }
}

/**
 * 性能基准测试
 */
export async function runNetworkPerformanceBenchmark(): Promise<void> {
  console.log('\n\n📊 网络性能基准测试\n');

  const configs = [
    {
      name: '无优化',
      config: { maxConnections: 1, maxConnectionsPerHost: 1 },
      batchConfig: undefined
    },
    {
      name: '连接池优化',
      config: { maxConnections: 5, maxConnectionsPerHost: 3 },
      batchConfig: undefined
    },
    {
      name: '完整优化',
      config: { maxConnections: 5, maxConnectionsPerHost: 3 },
      batchConfig: { maxBatchSize: 5, batchTimeout: 100, endpoint: '/api/batch', mergeStrategy: 'array' as const }
    }
  ];

  const testRequests: RequestConfig[] = [];
  for (let i = 0; i < 20; i++) {
    testRequests.push({
      url: `https://api.example.com/test/${i}`,
      method: 'GET',
      cacheable: i % 3 === 0, // 1/3 的请求可缓存
      batchable: i % 2 === 0, // 1/2 的请求可批量
      priority: i < 5 ? 'high' : i < 15 ? 'medium' : 'low'
    });
  }

  for (const { name, config, batchConfig } of configs) {
    console.log(`\n🧪 测试配置: ${name}`);
    
    const optimizer = new NetworkOptimizer(config, batchConfig);
    
    const startTime = Date.now();
    const promises = testRequests.map(request => optimizer.request(request));
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    const successCount = results.filter(r => r.success).length;
    const avgLatency = results.reduce((sum, r) => sum + r.timing.duration, 0) / results.length;
    
    console.log(`  总耗时: ${totalTime}ms`);
    console.log(`  成功率: ${(successCount / testRequests.length * 100).toFixed(1)}%`);
    console.log(`  平均延迟: ${avgLatency.toFixed(2)}ms`);
    console.log(`  吞吐量: ${(testRequests.length / (totalTime / 1000)).toFixed(2)} 请求/秒`);
    
    const stats = optimizer.getNetworkStats();
    console.log(`  缓存命中率: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
    console.log(`  重试次数: ${stats.retryCount}`);
    
    optimizer.destroy();
  }
}

/**
 * 运行完整演示
 */
export async function runFullDemo(): Promise<void> {
  console.log('🎯 网络优化器完整演示');
  console.log('=' .repeat(60));

  try {
    await demonstrateBasicNetworkOptimization();
    await demonstrateBatchProcessing();
    await demonstrateConnectionPooling();
    await demonstrateIntelligentRetry();
    await runNetworkPerformanceBenchmark();

    console.log('\n\n🎉 演示完成！');
    console.log('\n💡 总结:');
    console.log('- 连接池管理显著提升并发请求性能');
    console.log('- 请求批量处理减少网络开销');
    console.log('- 智能缓存机制提升响应速度');
    console.log('- 自适应重试确保请求可靠性');
    console.log('- 综合优化策略大幅提升网络效率');

  } catch (error) {
    console.error('❌ 演示过程中发生错误:', error);
  }
}

// 如果直接运行此文件，执行演示
if (typeof window === 'undefined') {
  runFullDemo().catch(console.error);
}
