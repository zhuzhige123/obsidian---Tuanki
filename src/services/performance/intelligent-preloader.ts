/**
 * 智能预加载和预测系统
 * 基于使用模式分析的智能预加载和预测算法
 */

// 使用模式记录
export interface UsageRecord {
  resourceId: string;
  resourceType: 'template' | 'card' | 'deck' | 'media';
  timestamp: number;
  context: UsageContext;
  sessionId: string;
  userAction: string;
  metadata?: Record<string, any>;
}

// 使用上下文
export interface UsageContext {
  timeOfDay: number; // 0-23 小时
  dayOfWeek: number; // 0-6 (周日-周六)
  sessionDuration: number; // 会话持续时间（分钟）
  previousResources: string[]; // 之前访问的资源
  userWorkflow: string; // 用户工作流类型
  deviceType: 'desktop' | 'mobile' | 'tablet';
}

// 预测结果
export interface PredictionResult {
  resourceId: string;
  resourceType: string;
  probability: number; // 0-1 概率
  confidence: number; // 0-1 置信度
  timeWindow: number; // 预期访问时间窗口（分钟）
  priority: 'low' | 'medium' | 'high' | 'critical';
  reason: string; // 预测原因
}

// 预加载策略
export interface PreloadStrategy {
  name: string;
  description: string;
  triggerConditions: string[];
  resourceTypes: string[];
  maxResources: number;
  timeWindow: number;
  priority: number;
}

// 预加载任务
export interface PreloadTask {
  id: string;
  resourceId: string;
  resourceType: string;
  priority: number;
  estimatedSize: number;
  deadline: number; // 截止时间戳
  strategy: string;
  status: 'pending' | 'loading' | 'completed' | 'failed' | 'cancelled';
  startTime?: number;
  completionTime?: number;
  error?: string;
}

/**
 * 使用模式分析器
 */
export class UsagePatternAnalyzer {
  private usageHistory: UsageRecord[] = [];
  private patterns = new Map<string, PatternData>();
  private sessionPatterns = new Map<string, SessionPattern>();

  /**
   * 记录使用行为
   */
  recordUsage(record: UsageRecord): void {
    this.usageHistory.push(record);
    
    // 保持历史记录在合理范围内
    if (this.usageHistory.length > 10000) {
      this.usageHistory.splice(0, this.usageHistory.length - 10000);
    }
    
    // 更新模式数据
    this.updatePatterns(record);
  }

  /**
   * 分析使用模式
   */
  analyzePatterns(): Map<string, PatternData> {
    this.patterns.clear();
    
    // 按资源分组分析
    const resourceGroups = this.groupByResource(this.usageHistory);
    
    for (const [resourceId, records] of resourceGroups) {
      const pattern = this.analyzeResourcePattern(resourceId, records);
      this.patterns.set(resourceId, pattern);
    }
    
    return new Map(this.patterns);
  }

  /**
   * 预测下一个可能访问的资源
   */
  predictNextResources(
    currentContext: UsageContext,
    limit: number = 10
  ): PredictionResult[] {
    const predictions: PredictionResult[] = [];
    
    // 基于时间模式预测
    const timeBasedPredictions = this.predictByTimePattern(currentContext);
    predictions.push(...timeBasedPredictions);
    
    // 基于序列模式预测
    const sequenceBasedPredictions = this.predictBySequencePattern(currentContext);
    predictions.push(...sequenceBasedPredictions);
    
    // 基于相似性预测
    const similarityBasedPredictions = this.predictBySimilarity(currentContext);
    predictions.push(...similarityBasedPredictions);
    
    // 合并和排序预测结果
    const mergedPredictions = this.mergePredictions(predictions);
    
    return mergedPredictions
      .sort((a, b) => b.probability * b.confidence - a.probability * a.confidence)
      .slice(0, limit);
  }

  /**
   * 获取资源访问频率
   */
  getResourceFrequency(resourceId: string, timeWindow?: number): number {
    const now = Date.now();
    const windowStart = timeWindow ? now - timeWindow : 0;
    
    const relevantRecords = this.usageHistory.filter(record =>
      record.resourceId === resourceId && record.timestamp >= windowStart
    );
    
    return relevantRecords.length;
  }

  /**
   * 获取资源最后访问时间
   */
  getLastAccessTime(resourceId: string): number | null {
    const records = this.usageHistory
      .filter(record => record.resourceId === resourceId)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    return records.length > 0 ? records[0].timestamp : null;
  }

  // 私有方法

  private updatePatterns(record: UsageRecord): void {
    const resourceId = record.resourceId;
    
    if (!this.patterns.has(resourceId)) {
      this.patterns.set(resourceId, {
        resourceId,
        totalAccess: 0,
        timeDistribution: new Array(24).fill(0),
        dayDistribution: new Array(7).fill(0),
        sequencePatterns: new Map(),
        averageInterval: 0,
        lastAccess: 0
      });
    }
    
    const pattern = this.patterns.get(resourceId)!;
    pattern.totalAccess++;
    pattern.timeDistribution[record.context.timeOfDay]++;
    pattern.dayDistribution[record.context.dayOfWeek]++;
    pattern.lastAccess = record.timestamp;
    
    // 更新序列模式
    this.updateSequencePatterns(pattern, record);
  }

  private updateSequencePatterns(pattern: PatternData, record: UsageRecord): void {
    const previousResources = record.context.previousResources;
    
    for (const prevResource of previousResources) {
      const key = `${prevResource}->${record.resourceId}`;
      const count = pattern.sequencePatterns.get(key) || 0;
      pattern.sequencePatterns.set(key, count + 1);
    }
  }

  private groupByResource(records: UsageRecord[]): Map<string, UsageRecord[]> {
    const groups = new Map<string, UsageRecord[]>();
    
    for (const record of records) {
      if (!groups.has(record.resourceId)) {
        groups.set(record.resourceId, []);
      }
      groups.get(record.resourceId)!.push(record);
    }
    
    return groups;
  }

  private analyzeResourcePattern(resourceId: string, records: UsageRecord[]): PatternData {
    const pattern: PatternData = {
      resourceId,
      totalAccess: records.length,
      timeDistribution: new Array(24).fill(0),
      dayDistribution: new Array(7).fill(0),
      sequencePatterns: new Map(),
      averageInterval: 0,
      lastAccess: 0
    };
    
    // 分析时间分布
    for (const record of records) {
      pattern.timeDistribution[record.context.timeOfDay]++;
      pattern.dayDistribution[record.context.dayOfWeek]++;
    }
    
    // 计算平均访问间隔
    if (records.length > 1) {
      const sortedRecords = records.sort((a, b) => a.timestamp - b.timestamp);
      let totalInterval = 0;
      
      for (let i = 1; i < sortedRecords.length; i++) {
        totalInterval += sortedRecords[i].timestamp - sortedRecords[i - 1].timestamp;
      }
      
      pattern.averageInterval = totalInterval / (records.length - 1);
    }
    
    pattern.lastAccess = Math.max(...records.map(r => r.timestamp));
    
    return pattern;
  }

  private predictByTimePattern(context: UsageContext): PredictionResult[] {
    const predictions: PredictionResult[] = [];
    const currentHour = context.timeOfDay;
    const currentDay = context.dayOfWeek;
    
    for (const [resourceId, pattern] of this.patterns) {
      // 基于时间分布计算概率
      const hourProbability = pattern.timeDistribution[currentHour] / pattern.totalAccess;
      const dayProbability = pattern.dayDistribution[currentDay] / pattern.totalAccess;
      
      // 综合时间概率
      const timeProbability = (hourProbability + dayProbability) / 2;
      
      if (timeProbability > 0.1) { // 阈值过滤
        predictions.push({
          resourceId,
          resourceType: 'template', // 简化处理
          probability: timeProbability,
          confidence: Math.min(pattern.totalAccess / 100, 1), // 基于访问次数的置信度
          timeWindow: 30, // 30分钟窗口
          priority: timeProbability > 0.5 ? 'high' : timeProbability > 0.3 ? 'medium' : 'low',
          reason: `时间模式匹配 (${(timeProbability * 100).toFixed(1)}%)`
        });
      }
    }
    
    return predictions;
  }

  private predictBySequencePattern(context: UsageContext): PredictionResult[] {
    const predictions: PredictionResult[] = [];
    const previousResources = context.previousResources;
    
    if (previousResources.length === 0) return predictions;
    
    const lastResource = previousResources[previousResources.length - 1];
    
    for (const [resourceId, pattern] of this.patterns) {
      const sequenceKey = `${lastResource}->${resourceId}`;
      const sequenceCount = pattern.sequencePatterns.get(sequenceKey) || 0;
      
      if (sequenceCount > 0) {
        // 计算序列概率
        const lastResourcePattern = this.patterns.get(lastResource);
        const sequenceProbability = lastResourcePattern 
          ? sequenceCount / lastResourcePattern.totalAccess 
          : 0;
        
        if (sequenceProbability > 0.05) { // 阈值过滤
          predictions.push({
            resourceId,
            resourceType: 'template',
            probability: sequenceProbability,
            confidence: Math.min(sequenceCount / 10, 1),
            timeWindow: 15, // 15分钟窗口
            priority: sequenceProbability > 0.4 ? 'high' : sequenceProbability > 0.2 ? 'medium' : 'low',
            reason: `序列模式匹配 (${lastResource} → ${resourceId})`
          });
        }
      }
    }
    
    return predictions;
  }

  private predictBySimilarity(context: UsageContext): PredictionResult[] {
    const predictions: PredictionResult[] = [];
    
    // 查找相似的历史会话
    const similarSessions = this.findSimilarSessions(context);
    
    for (const session of similarSessions) {
      const similarity = this.calculateContextSimilarity(context, session.context);
      
      if (similarity > 0.7) { // 相似度阈值
        predictions.push({
          resourceId: session.nextResource,
          resourceType: 'template',
          probability: similarity * 0.8, // 相似性预测的概率权重
          confidence: similarity,
          timeWindow: 20,
          priority: similarity > 0.9 ? 'high' : 'medium',
          reason: `相似会话模式 (相似度: ${(similarity * 100).toFixed(1)}%)`
        });
      }
    }
    
    return predictions;
  }

  private findSimilarSessions(context: UsageContext): Array<{
    context: UsageContext;
    nextResource: string;
  }> {
    // 简化实现：返回空数组
    // 实际实现需要分析历史会话数据
    return [];
  }

  private calculateContextSimilarity(context1: UsageContext, context2: UsageContext): number {
    let similarity = 0;
    let factors = 0;
    
    // 时间相似性
    const timeDiff = Math.abs(context1.timeOfDay - context2.timeOfDay);
    similarity += (24 - timeDiff) / 24;
    factors++;
    
    // 星期相似性
    similarity += context1.dayOfWeek === context2.dayOfWeek ? 1 : 0;
    factors++;
    
    // 设备类型相似性
    similarity += context1.deviceType === context2.deviceType ? 1 : 0;
    factors++;
    
    // 工作流相似性
    similarity += context1.userWorkflow === context2.userWorkflow ? 1 : 0;
    factors++;
    
    return factors > 0 ? similarity / factors : 0;
  }

  private mergePredictions(predictions: PredictionResult[]): PredictionResult[] {
    const merged = new Map<string, PredictionResult>();
    
    for (const prediction of predictions) {
      const existing = merged.get(prediction.resourceId);
      
      if (existing) {
        // 合并预测结果
        existing.probability = Math.max(existing.probability, prediction.probability);
        existing.confidence = (existing.confidence + prediction.confidence) / 2;
        existing.reason += `, ${prediction.reason}`;
        
        // 更新优先级
        if (prediction.priority === 'high' || existing.priority === 'high') {
          existing.priority = 'high';
        } else if (prediction.priority === 'medium' || existing.priority === 'medium') {
          existing.priority = 'medium';
        }
      } else {
        merged.set(prediction.resourceId, { ...prediction });
      }
    }
    
    return Array.from(merged.values());
  }
}

// 辅助接口
interface PatternData {
  resourceId: string;
  totalAccess: number;
  timeDistribution: number[]; // 24小时分布
  dayDistribution: number[]; // 7天分布
  sequencePatterns: Map<string, number>; // 序列模式
  averageInterval: number; // 平均访问间隔
  lastAccess: number; // 最后访问时间
}

interface SessionPattern {
  sessionId: string;
  resources: string[];
  duration: number;
  context: UsageContext;
}

/**
 * 智能预加载管理器
 */
export class IntelligentPreloadManager {
  private analyzer: UsagePatternAnalyzer;
  private preloadTasks = new Map<string, PreloadTask>();
  private strategies: PreloadStrategy[] = [];
  private isActive = false;
  private preloadQueue: PreloadTask[] = [];
  private maxConcurrentLoads = 3;
  private currentLoads = 0;

  constructor() {
    this.analyzer = new UsagePatternAnalyzer();
    this.initializeStrategies();
  }

  /**
   * 启动预加载系统
   */
  start(): void {
    if (this.isActive) return;
    
    this.isActive = true;
    console.log('🚀 智能预加载系统已启动');
    
    // 开始预加载循环
    this.startPreloadLoop();
  }

  /**
   * 停止预加载系统
   */
  stop(): void {
    this.isActive = false;
    console.log('⏹️ 智能预加载系统已停止');
  }

  /**
   * 记录资源使用
   */
  recordResourceUsage(record: UsageRecord): void {
    this.analyzer.recordUsage(record);
    
    // 触发预测和预加载
    if (this.isActive) {
      this.triggerPredictivePreload(record.context);
    }
  }

  /**
   * 手动触发预加载
   */
  async triggerPreload(context: UsageContext): Promise<PredictionResult[]> {
    const predictions = this.analyzer.predictNextResources(context, 10);
    
    for (const prediction of predictions) {
      if (prediction.probability > 0.3) { // 概率阈值
        await this.schedulePreload(prediction);
      }
    }
    
    return predictions;
  }

  /**
   * 获取预加载统计
   */
  getPreloadStats(): {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    hitRate: number;
    averageLoadTime: number;
  } {
    const tasks = Array.from(this.preloadTasks.values());
    const completed = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');
    
    const loadTimes = completed
      .filter(t => t.startTime && t.completionTime)
      .map(t => t.completionTime! - t.startTime!);
    
    const averageLoadTime = loadTimes.length > 0 
      ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length 
      : 0;
    
    return {
      totalTasks: tasks.length,
      completedTasks: completed.length,
      failedTasks: failed.length,
      hitRate: tasks.length > 0 ? completed.length / tasks.length : 0,
      averageLoadTime
    };
  }

  // 私有方法

  private initializeStrategies(): void {
    this.strategies = [
      {
        name: 'immediate-prediction',
        description: '基于当前上下文的即时预测',
        triggerConditions: ['user-action'],
        resourceTypes: ['template', 'card'],
        maxResources: 5,
        timeWindow: 10,
        priority: 1
      },
      {
        name: 'session-pattern',
        description: '基于会话模式的预加载',
        triggerConditions: ['session-start'],
        resourceTypes: ['template', 'deck'],
        maxResources: 10,
        timeWindow: 30,
        priority: 2
      },
      {
        name: 'time-based',
        description: '基于时间模式的预加载',
        triggerConditions: ['time-trigger'],
        resourceTypes: ['template'],
        maxResources: 15,
        timeWindow: 60,
        priority: 3
      }
    ];
  }

  private async triggerPredictivePreload(context: UsageContext): Promise<void> {
    const predictions = this.analyzer.predictNextResources(context, 5);
    
    for (const prediction of predictions) {
      if (prediction.probability > 0.4 && prediction.priority !== 'low') {
        await this.schedulePreload(prediction);
      }
    }
  }

  private async schedulePreload(prediction: PredictionResult): Promise<void> {
    const taskId = `preload-${prediction.resourceId}-${Date.now()}`;
    
    const task: PreloadTask = {
      id: taskId,
      resourceId: prediction.resourceId,
      resourceType: prediction.resourceType,
      priority: this.priorityToNumber(prediction.priority),
      estimatedSize: 1024, // 简化估算
      deadline: Date.now() + prediction.timeWindow * 60 * 1000,
      strategy: 'predictive',
      status: 'pending'
    };
    
    this.preloadTasks.set(taskId, task);
    this.preloadQueue.push(task);
    
    // 按优先级排序
    this.preloadQueue.sort((a, b) => b.priority - a.priority);
    
    console.log(`📋 预加载任务已调度: ${prediction.resourceId} (优先级: ${prediction.priority})`);
  }

  private startPreloadLoop(): void {
    const processQueue = async () => {
      if (!this.isActive) return;
      
      while (this.preloadQueue.length > 0 && this.currentLoads < this.maxConcurrentLoads) {
        const task = this.preloadQueue.shift()!;
        
        if (Date.now() > task.deadline) {
          task.status = 'cancelled';
          continue;
        }
        
        this.executePreloadTask(task);
      }
      
      // 继续循环
      setTimeout(processQueue, 1000);
    };
    
    processQueue();
  }

  private async executePreloadTask(task: PreloadTask): Promise<void> {
    this.currentLoads++;
    task.status = 'loading';
    task.startTime = Date.now();
    
    try {
      // 模拟预加载过程
      await this.simulateResourceLoad(task.resourceId, task.resourceType);
      
      task.status = 'completed';
      task.completionTime = Date.now();
      
      console.log(`✅ 预加载完成: ${task.resourceId} (${task.completionTime - task.startTime!}ms)`);
      
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      
      console.log(`❌ 预加载失败: ${task.resourceId} - ${task.error}`);
      
    } finally {
      this.currentLoads--;
    }
  }

  private async simulateResourceLoad(resourceId: string, resourceType: string): Promise<void> {
    // 模拟加载时间
    const loadTime = 100 + Math.random() * 500;
    await new Promise(resolve => setTimeout(resolve, loadTime));
    
    // 模拟偶发失败
    if (Math.random() < 0.05) {
      throw new Error('模拟加载失败');
    }
  }

  private priorityToNumber(priority: string): number {
    switch (priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 1;
    }
  }
}
