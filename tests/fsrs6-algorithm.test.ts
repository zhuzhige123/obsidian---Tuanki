/**
 * FSRS6 算法测试套件
 * 验证FSRS6核心算法的正确性和性能
 */

import { FSRS6CoreAlgorithm } from "../algorithms/fsrs6-core";
import { FSRS } from "../algorithms/fsrs";
import { FSRS6ServiceManager } from "../services/fsrs6-service-manager";
import { Rating, CardState } from "../data/types";
import { FSRS6_DEFAULTS } from "../types/fsrs6-types";

describe('FSRS6 Core Algorithm', () => {
  let fsrs6: FSRS6CoreAlgorithm;

  beforeEach(() => {
    fsrs6 = new FSRS6CoreAlgorithm();
  });

  test('should create a new card with correct initial values', () => {
    const card = fsrs6.createCard();
    
    expect(card.version).toBe('6.1.1');
    expect(card.state).toBe(CardState.New);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.retrievability).toBe(1);
    expect(card.difficulty).toBeGreaterThan(0);
    expect(card.difficulty).toBeLessThanOrEqual(10);
    expect(card.shortTermMemoryFactor).toBe(1.0);
    expect(card.longTermStabilityFactor).toBe(1.0);
  });

  test('should handle Good rating for new card correctly', () => {
    const card = fsrs6.createCard();
    const { card: reviewedCard, log } = fsrs6.review(card, Rating.Good);
    
    expect(reviewedCard.state).toBe(CardState.Review);
    expect(reviewedCard.reps).toBe(1);
    expect(reviewedCard.stability).toBeGreaterThan(0);
    expect(reviewedCard.scheduledDays).toBeGreaterThan(0);
    expect(log.rating).toBe(Rating.Good);
  });

  test('should handle Again rating correctly', () => {
    const card = fsrs6.createCard();
    const { card: reviewedCard } = fsrs6.review(card, Rating.Again);
    
    expect(reviewedCard.lapses).toBe(1);
    expect(reviewedCard.scheduledDays).toBe(0);
    expect(reviewedCard.state).toBe(CardState.Learning);
  });

  test('should apply FSRS6 short-term memory enhancement', () => {
    const card = fsrs6.createCard();
    
    // 模拟短期复习 (1天内)
    const { card: reviewedCard1 } = fsrs6.review(card, Rating.Good);
    reviewedCard1.elapsedDays = 1;
    
    const { card: reviewedCard2 } = fsrs6.review(reviewedCard1, Rating.Good);
    
    // 短期记忆因子应该有所变化
    expect(reviewedCard2.shortTermMemoryFactor).toBeDefined();
    expect(reviewedCard2.shortTermMemoryFactor).not.toBe(1.0);
  });

  test('should apply FSRS6 long-term stability enhancement', () => {
    const card = fsrs6.createCard();
    
    // 模拟长期复习 (30天后)
    const { card: reviewedCard1 } = fsrs6.review(card, Rating.Good);
    reviewedCard1.elapsedDays = 35;
    
    const { card: reviewedCard2 } = fsrs6.review(reviewedCard1, Rating.Good);
    
    // 长期稳定性因子应该有所变化
    expect(reviewedCard2.longTermStabilityFactor).toBeDefined();
    expect(reviewedCard2.longTermStabilityFactor).not.toBe(1.0);
  });

  test('should validate parameters correctly', () => {
    expect(() => {
      new FSRS6CoreAlgorithm({
        w: [1, 2, 3] // 错误的参数数量
      });
    }).toThrow();
  });

  test('should handle parameter updates', () => {
    const newWeights = [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS];
    newWeights[0] = 0.5; // 修改第一个权重
    
    fsrs6.updateParameters({ w: newWeights as any });
    const params = fsrs6.getParameters();
    
    expect(params.w[0]).toBe(0.5);
  });
});

describe('FSRS Wrapper Compatibility', () => {
  let fsrs: FSRS;

  beforeEach(() => {
    fsrs = new FSRS();
  });

  test('should maintain backward compatibility', () => {
    const card = fsrs.createCard();
    
    expect(card.state).toBe(CardState.New);
    expect(card.reps).toBe(0);
    expect(card.retrievability).toBe(1);
  });

  test('should use FSRS6 algorithm internally', () => {
    const versionInfo = fsrs.getVersionInfo();
    
    expect(versionInfo.version).toBe('6.1.1');
    expect(versionInfo.algorithmName).toBe('FSRS6');
    expect(versionInfo.parameterCount).toBe(21);
  });

  test('should handle review process correctly', () => {
    const card = fsrs.createCard();
    const { card: reviewedCard, log } = fsrs.review(card, Rating.Good);
    
    expect(reviewedCard.reps).toBe(1);
    expect(reviewedCard.state).toBe(CardState.Review);
    expect(log.rating).toBe(Rating.Good);
  });
});

describe('FSRS6 Service Manager', () => {
  let serviceManager: FSRS6ServiceManager;

  beforeEach(() => {
    serviceManager = FSRS6ServiceManager.getInstance();
  });

  afterEach(() => {
    serviceManager.cleanup();
  });

  test('should provide algorithm instances', async () => {
    const algorithm = await serviceManager.getAlgorithmInstance();
    
    expect(algorithm).toBeDefined();
    expect(algorithm.getVersionInfo().version).toBe('6.1.1');
    
    serviceManager.releaseAlgorithmInstance(algorithm);
  });

  test('should handle parameter updates', async () => {
    const newWeights = [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS];
    newWeights[0] = 0.3;
    
    await serviceManager.updateParameters({ w: newWeights as any });
    
    const algorithm = await serviceManager.getAlgorithmInstance();
    const params = algorithm.getParameters();
    
    expect(params.w[0]).toBe(0.3);
    
    serviceManager.releaseAlgorithmInstance(algorithm);
  });

  test('should provide performance metrics', () => {
    const metrics = serviceManager.getPerformanceMetrics();
    
    expect(metrics.algorithmVersion).toBe('6.1.1');
    expect(metrics.poolStats).toBeDefined();
    expect(metrics.poolStats.totalInstances).toBeGreaterThanOrEqual(0);
  });

  test('should handle batch review', async () => {
    const algorithm = await serviceManager.getAlgorithmInstance();
    
    const cards = [
      algorithm.createCard(),
      algorithm.createCard(),
      algorithm.createCard()
    ];
    
    const ratings = [Rating.Good, Rating.Hard, Rating.Easy];
    
    const results = await serviceManager.batchReview(cards, ratings);
    
    expect(results).toHaveLength(3);
    expect(results[0].card.reps).toBe(1);
    expect(results[1].card.reps).toBe(1);
    expect(results[2].card.reps).toBe(1);
    
    serviceManager.releaseAlgorithmInstance(algorithm);
  });
});

describe('FSRS6 Algorithm Performance', () => {
  let fsrs6: FSRS6CoreAlgorithm;

  beforeEach(() => {
    fsrs6 = new FSRS6CoreAlgorithm();
  });

  test('should complete card creation within performance threshold', () => {
    const startTime = performance.now();
    
    for (let i = 0; i < 1000; i++) {
      fsrs6.createCard();
    }
    
    const endTime = performance.now();
    const avgTime = (endTime - startTime) / 1000;
    
    // 平均每次创建应该小于1ms
    expect(avgTime).toBeLessThan(1);
  });

  test('should complete review within performance threshold', () => {
    const cards = Array.from({ length: 100 }, () => fsrs6.createCard());
    
    const startTime = performance.now();
    
    for (const card of cards) {
      fsrs6.review(card, Rating.Good);
    }
    
    const endTime = performance.now();
    const avgTime = (endTime - startTime) / 100;
    
    // 平均每次复习应该小于10ms
    expect(avgTime).toBeLessThan(10);
  });

  test('should maintain memory usage within limits', () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // 创建大量卡片
    const cards = Array.from({ length: 10000 }, () => fsrs6.createCard());
    
    // 进行大量复习
    for (let i = 0; i < 1000; i++) {
      const card = cards[i % cards.length];
      fsrs6.review(card, Rating.Good);
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
    
    // 内存增长应该小于100MB
    expect(memoryIncrease).toBeLessThan(100);
  });
});

describe('FSRS6 Algorithm Accuracy', () => {
  let fsrs6: FSRS6CoreAlgorithm;

  beforeEach(() => {
    fsrs6 = new FSRS6CoreAlgorithm();
  });

  test('should produce consistent results for same inputs', () => {
    const card1 = fsrs6.createCard();
    const card2 = fsrs6.createCard();
    
    const result1 = fsrs6.review(card1, Rating.Good);
    const result2 = fsrs6.review(card2, Rating.Good);
    
    expect(result1.card.stability).toBeCloseTo(result2.card.stability, 5);
    expect(result1.card.difficulty).toBeCloseTo(result2.card.difficulty, 5);
  });

  test('should show improvement with repeated correct reviews', () => {
    let card = fsrs6.createCard();
    
    const initialStability = card.stability;
    
    // 进行多次正确复习
    for (let i = 0; i < 5; i++) {
      const result = fsrs6.review(card, Rating.Good);
      card = result.card;
      card.elapsedDays = card.scheduledDays; // 模拟按时复习
    }
    
    expect(card.stability).toBeGreaterThan(initialStability);
    expect(card.scheduledDays).toBeGreaterThan(1);
  });

  test('should handle difficulty progression correctly', () => {
    let card = fsrs6.createCard();
    const initialDifficulty = card.difficulty;
    
    // 多次困难评分
    for (let i = 0; i < 3; i++) {
      const result = fsrs6.review(card, Rating.Hard);
      card = result.card;
    }
    
    // 难度应该有所变化（通常会增加）
    expect(Math.abs(card.difficulty - initialDifficulty)).toBeGreaterThan(0.1);
  });
});
