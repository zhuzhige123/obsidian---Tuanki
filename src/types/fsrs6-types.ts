/**
 * FSRS6 算法专用类型定义
 * 基于 FSRS6.1.1 标准规范
 */

import type { FSRSCard, FSRSParameters, ReviewLog } from "../data/types";

/**
 * FSRS6 版本信息
 */
export interface FSRS6VersionInfo {
  version: '6.1.1';
  algorithmName: 'FSRS6';
  parameterCount: 21;
  implementationDate: string;
  compatibilityLevel: 'standard' | 'enhanced';
}

/**
 * FSRS6 增强卡片数据
 */
export interface FSRS6Card extends FSRSCard {
  version: '6.1.1';
  personalizedWeights?: number[];
  memoryPrediction?: {
    retentionCurve: Array<{day: number, retention: number}>;
    optimalInterval: number;
    confidenceLevel: number;
  };
  shortTermMemoryFactor?: number;  // FSRS6特有的短期记忆因子
  longTermStabilityFactor?: number; // FSRS6特有的长期稳定性因子
}

/**
 * FSRS6 参数配置
 */
export interface FSRS6Parameters extends FSRSParameters {
  version: '6.1.1';
  w: [
    number, number, number, number, number, // w0-w4: 初始稳定性参数
    number, number,                         // w5-w6: 难度调整参数
    number, number, number,                 // w7-w9: 回忆稳定性参数
    number, number, number, number,         // w10-w13: 遗忘稳定性参数
    number, number, number,                 // w14-w16: 评分调整参数
    number, number,                         // w17-w18: 短期记忆参数 (FSRS6新增)
    number, number                          // w19-w20: 长期稳定性参数 (FSRS6新增)
  ];
  shortTermMemoryEnabled?: boolean;        // 启用短期记忆效应
  longTermStabilityEnabled?: boolean;      // 启用长期稳定性优化
}

/**
 * 个性化数据结构
 */
export interface PersonalizationData {
  userId: string;
  dataPoints: number;
  lastOptimization: string;
  personalizedWeights: number[];
  performanceMetrics: {
    accuracy: number;
    consistency: number;
    efficiency: number;
  };
  learningPatterns: {
    preferredIntervals: number[];
    optimalStudyTimes: string[];
    difficultyPreference: 'conservative' | 'aggressive' | 'balanced';
  };
}

/**
 * 记忆预测结果
 */
export interface PredictionResult {
  cardId: string;
  predictedRetention: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  optimalInterval: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

/**
 * 参数优化配置
 */
export interface OptimizationConfig {
  minDataPoints: number;
  convergenceThreshold: number;
  maxIterations: number;
  learningRate: number;
  regularizationFactor: number;
  validationSplit: number;
  enableCrossValidation: boolean;
}

/**
 * FSRS6 算法性能指标
 */
export interface FSRS6PerformanceMetrics {
  algorithmVersion: '6.1.1';
  executionTime: number;
  memoryUsage: number;
  predictionAccuracy: number;
  parameterStability: number;
  convergenceRate: number;
  cacheHitRate: number;
}

/**
 * FSRS6 算法状态
 */
export interface FSRS6AlgorithmState {
  isInitialized: boolean;
  parametersLoaded: boolean;
  personalizationEnabled: boolean;
  lastOptimization?: string;
  totalReviews: number;
  averageAccuracy: number;
  currentWeights: number[];
}

/**
 * 类型验证函数
 */
export interface TypeValidator {
  validateFSRS6Card(card: any): card is FSRS6Card;
  validateFSRS6Parameters(params: any): params is FSRS6Parameters;
  validatePersonalizationData(data: any): data is PersonalizationData;
  validatePredictionResult(result: any): result is PredictionResult;
}

/**
 * FSRS6 错误类型
 */
export class FSRS6Error extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any
  ) {
    super(message);
    this.name = 'FSRS6Error';
  }
}

/**
 * FSRS6 参数验证错误
 */
export class FSRS6ParameterError extends FSRS6Error {
  constructor(message: string, public parameterName: string, public value: any) {
    super(message, 'PARAMETER_ERROR', { parameterName, value });
    this.name = 'FSRS6ParameterError';
  }
}

/**
 * FSRS6 计算错误
 */
export class FSRS6ComputationError extends FSRS6Error {
  constructor(message: string, public operation: string, public input: any) {
    super(message, 'COMPUTATION_ERROR', { operation, input });
    this.name = 'FSRS6ComputationError';
  }
}

/**
 * 默认FSRS6配置常量
 */
export const FSRS6_DEFAULTS = {
  VERSION: '6.1.1' as const,
  PARAMETER_COUNT: 21,
  DEFAULT_WEIGHTS: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
    0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
    0.5425, 0.0912, 0.0658, 0.1542
  ] as const,
  REQUEST_RETENTION: 0.9,
  MAXIMUM_INTERVAL: 365, // 默认1年，参考Anki社区实践（用户可调整至5年）
  ENABLE_FUZZ: true,
  SHORT_TERM_MEMORY_ENABLED: true,
  LONG_TERM_STABILITY_ENABLED: true
} as const;

/**
 * FSRS6 参数范围验证 (基于实际FSRS6标准参数调整)
 */
export const FSRS6_PARAMETER_RANGES = {
  w0: { min: 0.1, max: 2.0 },    // 初始稳定性 - Again
  w1: { min: 0.5, max: 3.0 },    // 初始稳定性 - Hard
  w2: { min: 1.0, max: 5.0 },    // 初始稳定性 - Good
  w3: { min: 3.0, max: 15.0 },   // 初始稳定性 - Easy
  w4: { min: 3.0, max: 10.0 },   // 初始难度
  w5: { min: 0.5, max: 2.0 },    // 难度权重
  w6: { min: 0.5, max: 5.0 },    // 难度变化率
  w7: { min: 0.0, max: 0.5 },    // 难度衰减
  w8: { min: 0.5, max: 3.0 },    // 稳定性增长
  w9: { min: 0.0, max: 1.0 },    // 稳定性衰减
  w10: { min: 0.5, max: 2.0 },   // 遗忘稳定性
  w11: { min: 0.5, max: 3.0 },   // 遗忘指数
  w12: { min: 0.0, max: 2.0 },   // 遗忘稳定性指数
  w13: { min: 0.0, max: 1.0 },   // 遗忘时间指数
  w14: { min: 0.0, max: 2.0 },   // 回忆稳定性增长
  w15: { min: 0.5, max: 1.5 },   // Hard惩罚
  w16: { min: 1.0, max: 3.0 },   // Easy奖励
  w17: { min: 0.0, max: 1.0 },   // 短期记忆因子 (FSRS6新增) - 扩大范围
  w18: { min: 0.0, max: 0.5 },   // 短期记忆衰减 (FSRS6新增) - 扩大范围
  w19: { min: 0.0, max: 0.5 },   // 长期稳定性因子 (FSRS6新增) - 扩大范围
  w20: { min: 0.0, max: 0.5 }    // 长期稳定性增长 (FSRS6新增) - 扩大范围
} as const;
