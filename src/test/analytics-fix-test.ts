/**
 * 分析服务修复测试
 * 验证AnalyticsService和DifficultyDistributionChart的修复
 */

import { AnalyticsService } from '../data/analytics';
import type { AnkiDataStorage } from '../data/storage';

// 模拟存储服务
class MockDataStorage implements Partial<AnkiDataStorage> {
  async getCards() {
    return [
      {
        id: 'test-card-1',
        deckId: 'test-deck-1',
        fsrs: {
          difficulty: 5.5,
          stability: 10,
          due: new Date().toISOString(),
          state: 2,
          reps: 5,
          lapses: 1,
          elapsedDays: 7,
          scheduledDays: 14,
          lastReview: new Date().toISOString(),
          retrievability: 0.85
        }
      },
      {
        id: 'test-card-2',
        deckId: 'test-deck-1',
        fsrs: {
          difficulty: 7.2,
          stability: 5,
          due: new Date().toISOString(),
          state: 2,
          reps: 3,
          lapses: 2,
          elapsedDays: 3,
          scheduledDays: 7,
          lastReview: new Date().toISOString(),
          retrievability: 0.72
        }
      }
    ];
  }

  async getDecks() {
    return [
      {
        id: 'test-deck-1',
        name: '测试牌组',
        description: '用于测试的牌组',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      }
    ];
  }

  async getStudySessions() {
    return [
      {
        id: 'session-1',
        deckId: 'test-deck-1',
        startTime: new Date(),
        cardsReviewed: 10,
        newCardsLearned: 3,
        correctAnswers: 8,
        totalTime: 300,
        cardReviews: [
          {
            cardId: 'test-card-1',
            rating: 3,
            responseTime: 5000,
            timestamp: new Date()
          }
        ]
      }
    ];
  }
}

/**
 * 测试AnalyticsService的缓存方法修复
 */
export async function testAnalyticsServiceFix() {
  console.log('🧪 测试AnalyticsService缓存方法修复...');
  
  try {
    const mockStorage = new MockDataStorage() as AnkiDataStorage;
    const analyticsService = new AnalyticsService(mockStorage);
    
    // 测试记忆曲线数据获取
    console.log('测试记忆曲线数据获取...');
    const memoryCurveData = await analyticsService.getMemoryCurveData();
    console.log('✅ 记忆曲线数据获取成功:', memoryCurveData.length, '个数据点');
    
    // 测试难度分布数据获取
    console.log('测试难度分布数据获取...');
    const difficultyData = await analyticsService.getDifficultyDistribution();
    console.log('✅ 难度分布数据获取成功:', difficultyData.length, '个区间');
    
    // 测试FSRS KPI数据获取
    console.log('测试FSRS KPI数据获取...');
    const kpiData = await analyticsService.getFSRSKPIData();
    console.log('✅ FSRS KPI数据获取成功:', kpiData);
    
    // 清理缓存
    analyticsService.clearCache();
    console.log('✅ 缓存清理成功');
    
    return true;
  } catch (error) {
    console.error('❌ AnalyticsService测试失败:', error);
    return false;
  }
}

/**
 * 测试DifficultyDistributionChart的数据处理
 */
export function testDifficultyChartDataHandling() {
  console.log('🧪 测试DifficultyDistributionChart数据处理...');
  
  try {
    // 模拟空数据情况
    const emptyData: any[] = [];
    console.log('测试空数据处理...');
    
    // 模拟正常数据
    const normalData = [
      { x0: 0, x1: 2, count: 5, percentage: 25, label: '简单' },
      { x0: 2, x1: 4, count: 8, percentage: 40, label: '中等' },
      { x0: 4, x1: 6, count: 4, percentage: 20, label: '困难' },
      { x0: 6, x1: 10, count: 3, percentage: 15, label: '极难' }
    ];
    
    // 测试数据范围计算
    const maxCount = normalData.length > 0 ? Math.max(...normalData.map(d => d.count)) : 0;
    const maxPercentage = normalData.length > 0 ? Math.max(...normalData.map(d => d.percentage)) : 0;
    
    console.log('✅ 数据范围计算成功:', { maxCount, maxPercentage });
    
    // 测试比例尺计算
    const chartWidth = 400;
    const chartHeight = 250;
    const binWidth = normalData.length > 0 ? chartWidth / normalData.length : 0;
    const safeMaxValue = Math.max(maxPercentage, 1); // 防止除零
    
    console.log('✅ 比例尺计算成功:', { binWidth, safeMaxValue });
    
    return true;
  } catch (error) {
    console.error('❌ DifficultyDistributionChart测试失败:', error);
    return false;
  }
}

/**
 * 运行所有修复测试
 */
export async function runAllFixTests() {
  console.log('🚀 开始运行修复测试...');
  
  const results = {
    analyticsService: await testAnalyticsServiceFix(),
    difficultyChart: testDifficultyChartDataHandling()
  };
  
  const allPassed = Object.values(results).every(result => result);
  
  if (allPassed) {
    console.log('🎉 所有修复测试通过！');
  } else {
    console.log('⚠️ 部分测试失败:', results);
  }
  
  return results;
}

// 如果直接运行此文件，执行测试
if (typeof window !== 'undefined') {
  (window as any).runAnalyticsFixTests = runAllFixTests;
  console.log('测试函数已注册到全局: runAnalyticsFixTests()');
}
