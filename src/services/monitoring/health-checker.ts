/**
 * 系统健康检查服务
 * 实现系统健康检查，包括功能可用性检测、数据完整性验证和服务状态监控
 */

import { writable, derived, type Writable } from 'svelte/store';

// 健康检查类型
export enum HealthCheckType {
  FUNCTIONALITY = 'functionality',
  DATA_INTEGRITY = 'data_integrity',
  SERVICE_STATUS = 'service_status',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  CONNECTIVITY = 'connectivity'
}

// 健康状态
export enum HealthStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  CRITICAL = 'critical',
  UNKNOWN = 'unknown'
}

// 健康检查结果
export interface HealthCheckResult {
  id: string;
  type: HealthCheckType;
  name: string;
  status: HealthStatus;
  message: string;
  details?: string;
  timestamp: number;
  duration: number;
  metadata?: Record<string, any>;
  suggestions?: string[];
  autoFixAvailable?: boolean;
  autoFixAction?: () => Promise<boolean>;
}

// 系统健康报告
export interface SystemHealthReport {
  id: string;
  timestamp: number;
  overallStatus: HealthStatus;
  score: number; // 0-100
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    unknown: number;
  };
  recommendations: string[];
  criticalIssues: HealthCheckResult[];
}

// 健康检查配置
export interface HealthCheckConfig {
  enabled: boolean;
  interval: number; // 毫秒
  timeout: number; // 毫秒
  retryAttempts: number;
  autoFix: boolean;
}

/**
 * 健康检查器类
 */
export class HealthChecker {
  private checks: Map<string, () => Promise<HealthCheckResult>> = new Map();
  private results: HealthCheckResult[] = [];
  private reports: SystemHealthReport[] = [];
  private isRunning = false;
  private checkInterval?: NodeJS.Timeout;

  // 配置选项
  private config: Record<HealthCheckType, HealthCheckConfig> = {
    [HealthCheckType.FUNCTIONALITY]: {
      enabled: true,
      interval: 60000, // 1分钟
      timeout: 10000,
      retryAttempts: 2,
      autoFix: true
    },
    [HealthCheckType.DATA_INTEGRITY]: {
      enabled: true,
      interval: 300000, // 5分钟
      timeout: 15000,
      retryAttempts: 1,
      autoFix: false
    },
    [HealthCheckType.SERVICE_STATUS]: {
      enabled: true,
      interval: 30000, // 30秒
      timeout: 5000,
      retryAttempts: 3,
      autoFix: true
    },
    [HealthCheckType.PERFORMANCE]: {
      enabled: true,
      interval: 120000, // 2分钟
      timeout: 5000,
      retryAttempts: 1,
      autoFix: false
    },
    [HealthCheckType.SECURITY]: {
      enabled: true,
      interval: 600000, // 10分钟
      timeout: 10000,
      retryAttempts: 1,
      autoFix: false
    },
    [HealthCheckType.CONNECTIVITY]: {
      enabled: true,
      interval: 45000, // 45秒
      timeout: 8000,
      retryAttempts: 2,
      autoFix: true
    }
  };

  // 全局状态存储
  public readonly currentResults = writable<HealthCheckResult[]>([]);
  public readonly systemHealth = writable<SystemHealthReport | null>(null);
  public readonly isChecking = writable<boolean>(false);

  // 计算属性
  public readonly overallStatus = derived(
    [this.currentResults],
    ([results]) => this.calculateOverallStatus(results)
  );

  public readonly healthScore = derived(
    [this.currentResults],
    ([results]) => this.calculateHealthScore(results)
  );

  public readonly criticalIssues = derived(
    [this.currentResults],
    ([results]) => results.filter(r => r.status === HealthStatus.CRITICAL)
  );

  constructor() {
    this.initializeHealthChecks();
  }

  /**
   * 开始健康检查
   */
  startHealthChecks(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.isChecking.set(true);

    // 立即执行一次检查
    this.runAllChecks();

    // 设置定期检查
    this.scheduleChecks();

    console.log('🏥 健康检查已启动');
  }

  /**
   * 停止健康检查
   */
  stopHealthChecks(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.isChecking.set(false);

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    console.log('⏹️ 健康检查已停止');
  }

  /**
   * 手动执行所有检查
   */
  async runAllChecks(): Promise<SystemHealthReport> {
    console.log('🔍 开始执行健康检查...');
    
    const startTime = Date.now();
    const results: HealthCheckResult[] = [];

    // 并行执行所有检查
    const checkPromises = Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
      try {
        const result = await this.executeCheck(name, checkFn);
        return result;
      } catch (error) {
        console.error(`健康检查失败: ${name}`, error);
        return this.createErrorResult(name, error);
      }
    });

    const checkResults = await Promise.all(checkPromises);
    results.push(...checkResults);

    // 更新结果
    this.results = results;
    this.currentResults.set([...results]);

    // 生成报告
    const report = this.generateHealthReport(results);
    this.reports.push(report);
    this.systemHealth.set(report);

    // 限制报告历史
    if (this.reports.length > 50) {
      this.reports.splice(0, this.reports.length - 50);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ 健康检查完成，耗时 ${duration}ms`);

    return report;
  }

  /**
   * 执行特定类型的检查
   */
  async runChecksByType(type: HealthCheckType): Promise<HealthCheckResult[]> {
    const typeChecks = Array.from(this.checks.entries())
      .filter(([name]) => name.startsWith(type));

    const results: HealthCheckResult[] = [];

    for (const [name, checkFn] of typeChecks) {
      try {
        const result = await this.executeCheck(name, checkFn);
        results.push(result);
      } catch (error) {
        results.push(this.createErrorResult(name, error));
      }
    }

    return results;
  }

  /**
   * 注册自定义健康检查
   */
  registerCheck(
    name: string,
    type: HealthCheckType,
    checkFn: () => Promise<HealthCheckResult>
  ): void {
    const checkName = `${type}_${name}`;
    this.checks.set(checkName, checkFn);
    console.log(`📋 注册健康检查: ${checkName}`);
  }

  /**
   * 移除健康检查
   */
  unregisterCheck(name: string, type: HealthCheckType): void {
    const checkName = `${type}_${name}`;
    this.checks.delete(checkName);
    console.log(`🗑️ 移除健康检查: ${checkName}`);
  }

  /**
   * 自动修复问题
   */
  async autoFixIssues(): Promise<{ fixed: number; failed: number }> {
    const fixableIssues = this.results.filter(r => 
      r.status !== HealthStatus.HEALTHY && 
      r.autoFixAvailable && 
      r.autoFixAction
    );

    let fixed = 0;
    let failed = 0;

    for (const issue of fixableIssues) {
      try {
        console.log(`🔧 尝试自动修复: ${issue.name}`);
        const success = await issue.autoFixAction!();
        
        if (success) {
          fixed++;
          console.log(`✅ 自动修复成功: ${issue.name}`);
        } else {
          failed++;
          console.warn(`❌ 自动修复失败: ${issue.name}`);
        }
      } catch (error) {
        failed++;
        console.error(`❌ 自动修复异常: ${issue.name}`, error);
      }
    }

    // 重新运行检查以验证修复结果
    if (fixed > 0) {
      await this.runAllChecks();
    }

    console.log(`🔧 自动修复完成: 成功 ${fixed}, 失败 ${failed}`);
    return { fixed, failed };
  }

  /**
   * 获取健康趋势
   */
  getHealthTrend(duration: number = 3600000): {
    trend: 'improving' | 'stable' | 'degrading';
    scoreChange: number;
    data: { timestamp: number; score: number }[];
  } {
    const now = Date.now();
    const startTime = now - duration;

    const relevantReports = this.reports.filter(r => r.timestamp >= startTime);

    if (relevantReports.length < 2) {
      return {
        trend: 'stable',
        scoreChange: 0,
        data: relevantReports.map(r => ({ timestamp: r.timestamp, score: r.score }))
      };
    }

    const firstHalf = relevantReports.slice(0, Math.floor(relevantReports.length / 2));
    const secondHalf = relevantReports.slice(Math.floor(relevantReports.length / 2));

    const firstAvg = firstHalf.reduce((sum, r) => sum + r.score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, r) => sum + r.score, 0) / secondHalf.length;

    const scoreChange = secondAvg - firstAvg;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (Math.abs(scoreChange) > 5) {
      trend = scoreChange > 0 ? 'improving' : 'degrading';
    }

    return {
      trend,
      scoreChange,
      data: relevantReports.map(r => ({ timestamp: r.timestamp, score: r.score }))
    };
  }

  /**
   * 更新检查配置
   */
  updateConfig(type: HealthCheckType, config: Partial<HealthCheckConfig>): void {
    this.config[type] = { ...this.config[type], ...config };
    console.log(`⚙️ 更新健康检查配置: ${type}`);
  }

  /**
   * 导出健康数据
   */
  exportHealthData(): string {
    const data = {
      exportTime: Date.now(),
      results: this.results,
      reports: this.reports,
      config: this.config
    };

    return JSON.stringify(data, null, 2);
  }

  // 私有方法

  /**
   * 初始化健康检查
   */
  private initializeHealthChecks(): void {
    // 功能可用性检查
    this.registerCheck('core_functions', HealthCheckType.FUNCTIONALITY, async () => {
      const startTime = Date.now();
      
      try {
        // 检查核心功能
        const coreTests = [
          this.testLocalStorage(),
          this.testIndexedDB(),
          this.testWebWorkers(),
          this.testFileAPI()
        ];

        const results = await Promise.all(coreTests);
        const allPassed = results.every(r => r);

        return {
          id: `func-core-${Date.now()}`,
          type: HealthCheckType.FUNCTIONALITY,
          name: '核心功能检查',
          status: allPassed ? HealthStatus.HEALTHY : HealthStatus.WARNING,
          message: allPassed ? '所有核心功能正常' : '部分核心功能异常',
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          metadata: { tests: results },
          suggestions: allPassed ? [] : ['检查浏览器兼容性', '清理浏览器缓存']
        };
      } catch (error) {
        return {
          id: `func-core-${Date.now()}`,
          type: HealthCheckType.FUNCTIONALITY,
          name: '核心功能检查',
          status: HealthStatus.CRITICAL,
          message: '核心功能检查失败',
          details: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          duration: Date.now() - startTime
        };
      }
    });

    // 数据完整性检查
    this.registerCheck('data_integrity', HealthCheckType.DATA_INTEGRITY, async () => {
      const startTime = Date.now();
      
      try {
        const integrityScore = await this.checkDataIntegrity();
        
        let status = HealthStatus.HEALTHY;
        let message = '数据完整性良好';
        
        if (integrityScore < 0.8) {
          status = HealthStatus.CRITICAL;
          message = '检测到数据损坏';
        } else if (integrityScore < 0.95) {
          status = HealthStatus.WARNING;
          message = '数据完整性存在问题';
        }

        return {
          id: `data-integrity-${Date.now()}`,
          type: HealthCheckType.DATA_INTEGRITY,
          name: '数据完整性检查',
          status,
          message,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          metadata: { score: integrityScore },
          suggestions: status !== HealthStatus.HEALTHY ? ['备份数据', '运行数据修复'] : [],
          autoFixAvailable: status === HealthStatus.WARNING,
          autoFixAction: status === HealthStatus.WARNING ? this.repairDataIntegrity : undefined
        };
      } catch (error) {
        return this.createErrorResult('data_integrity', error);
      }
    });

    // 服务状态检查
    this.registerCheck('services', HealthCheckType.SERVICE_STATUS, async () => {
      const startTime = Date.now();
      
      try {
        const serviceStatuses = await this.checkServiceStatuses();
        const allHealthy = serviceStatuses.every(s => s.healthy);
        
        return {
          id: `services-${Date.now()}`,
          type: HealthCheckType.SERVICE_STATUS,
          name: '服务状态检查',
          status: allHealthy ? HealthStatus.HEALTHY : HealthStatus.WARNING,
          message: allHealthy ? '所有服务正常' : '部分服务异常',
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          metadata: { services: serviceStatuses },
          suggestions: allHealthy ? [] : ['重启异常服务', '检查网络连接']
        };
      } catch (error) {
        return this.createErrorResult('services', error);
      }
    });

    // 性能检查
    this.registerCheck('performance', HealthCheckType.PERFORMANCE, async () => {
      const startTime = Date.now();
      
      try {
        const perfMetrics = await this.checkPerformanceMetrics();
        
        let status = HealthStatus.HEALTHY;
        let message = '性能表现良好';
        
        if (perfMetrics.score < 60) {
          status = HealthStatus.CRITICAL;
          message = '性能严重下降';
        } else if (perfMetrics.score < 80) {
          status = HealthStatus.WARNING;
          message = '性能有所下降';
        }

        return {
          id: `perf-${Date.now()}`,
          type: HealthCheckType.PERFORMANCE,
          name: '性能检查',
          status,
          message,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          metadata: perfMetrics,
          suggestions: status !== HealthStatus.HEALTHY ? ['清理缓存', '优化配置'] : []
        };
      } catch (error) {
        return this.createErrorResult('performance', error);
      }
    });

    // 连接性检查
    this.registerCheck('connectivity', HealthCheckType.CONNECTIVITY, async () => {
      const startTime = Date.now();
      
      try {
        const isOnline = navigator.onLine;
        const networkQuality = await this.checkNetworkQuality();
        
        let status = HealthStatus.HEALTHY;
        let message = '网络连接正常';
        
        if (!isOnline) {
          status = HealthStatus.CRITICAL;
          message = '网络连接断开';
        } else if (networkQuality < 0.5) {
          status = HealthStatus.WARNING;
          message = '网络质量较差';
        }

        return {
          id: `conn-${Date.now()}`,
          type: HealthCheckType.CONNECTIVITY,
          name: '连接性检查',
          status,
          message,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          metadata: { online: isOnline, quality: networkQuality },
          suggestions: status !== HealthStatus.HEALTHY ? ['检查网络设置', '重启网络连接'] : []
        };
      } catch (error) {
        return this.createErrorResult('connectivity', error);
      }
    });
  }

  /**
   * 执行单个检查
   */
  private async executeCheck(
    name: string,
    checkFn: () => Promise<HealthCheckResult>
  ): Promise<HealthCheckResult> {
    const type = name.split('_')[0] as HealthCheckType;
    const config = this.config[type];

    if (!config.enabled) {
      return {
        id: `${name}-${Date.now()}`,
        type,
        name,
        status: HealthStatus.UNKNOWN,
        message: '检查已禁用',
        timestamp: Date.now(),
        duration: 0
      };
    }

    let lastError: any;
    
    for (let attempt = 0; attempt <= config.retryAttempts; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('检查超时')), config.timeout);
        });

        const result = await Promise.race([checkFn(), timeoutPromise]);
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < config.retryAttempts) {
          console.warn(`健康检查重试 ${attempt + 1}/${config.retryAttempts}: ${name}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    throw lastError;
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(name: string, error: any): HealthCheckResult {
    return {
      id: `error-${name}-${Date.now()}`,
      type: name.split('_')[0] as HealthCheckType,
      name,
      status: HealthStatus.CRITICAL,
      message: '检查执行失败',
      details: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
      duration: 0
    };
  }

  /**
   * 生成健康报告
   */
  private generateHealthReport(results: HealthCheckResult[]): SystemHealthReport {
    const summary = {
      total: results.length,
      healthy: results.filter(r => r.status === HealthStatus.HEALTHY).length,
      warning: results.filter(r => r.status === HealthStatus.WARNING).length,
      critical: results.filter(r => r.status === HealthStatus.CRITICAL).length,
      unknown: results.filter(r => r.status === HealthStatus.UNKNOWN).length
    };

    const score = this.calculateHealthScore(results);
    const overallStatus = this.calculateOverallStatus(results);
    const criticalIssues = results.filter(r => r.status === HealthStatus.CRITICAL);

    const recommendations = this.generateRecommendations(results);

    return {
      id: `report-${Date.now()}`,
      timestamp: Date.now(),
      overallStatus,
      score,
      checks: results,
      summary,
      recommendations,
      criticalIssues
    };
  }

  /**
   * 计算总体状态
   */
  private calculateOverallStatus(results: HealthCheckResult[]): HealthStatus {
    if (results.some(r => r.status === HealthStatus.CRITICAL)) {
      return HealthStatus.CRITICAL;
    }
    if (results.some(r => r.status === HealthStatus.WARNING)) {
      return HealthStatus.WARNING;
    }
    if (results.every(r => r.status === HealthStatus.HEALTHY)) {
      return HealthStatus.HEALTHY;
    }
    return HealthStatus.UNKNOWN;
  }

  /**
   * 计算健康分数
   */
  private calculateHealthScore(results: HealthCheckResult[]): number {
    if (results.length === 0) return 100;

    const weights = {
      [HealthStatus.HEALTHY]: 100,
      [HealthStatus.WARNING]: 60,
      [HealthStatus.CRITICAL]: 0,
      [HealthStatus.UNKNOWN]: 50
    };

    const totalScore = results.reduce((sum, result) => {
      return sum + weights[result.status];
    }, 0);

    return Math.round(totalScore / results.length);
  }

  /**
   * 生成建议
   */
  private generateRecommendations(results: HealthCheckResult[]): string[] {
    const recommendations = new Set<string>();

    results.forEach(result => {
      if (result.suggestions) {
        result.suggestions.forEach(suggestion => recommendations.add(suggestion));
      }
    });

    return Array.from(recommendations);
  }

  /**
   * 安排定期检查
   */
  private scheduleChecks(): void {
    // 使用最短的检查间隔作为基础间隔
    const minInterval = Math.min(...Object.values(this.config).map(c => c.interval));
    
    this.checkInterval = setInterval(() => {
      this.runAllChecks();
    }, minInterval);
  }

  // 具体检查实现

  /**
   * 测试本地存储
   */
  private async testLocalStorage(): Promise<boolean> {
    try {
      const testKey = 'health-check-test';
      const testValue = 'test-value';
      localStorage.setItem(testKey, testValue);
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      return retrieved === testValue;
    } catch {
      return false;
    }
  }

  /**
   * 测试IndexedDB
   */
  private async testIndexedDB(): Promise<boolean> {
    try {
      return 'indexedDB' in window;
    } catch {
      return false;
    }
  }

  /**
   * 测试Web Workers
   */
  private async testWebWorkers(): Promise<boolean> {
    try {
      return 'Worker' in window;
    } catch {
      return false;
    }
  }

  /**
   * 测试File API
   */
  private async testFileAPI(): Promise<boolean> {
    try {
      return 'File' in window && 'FileReader' in window;
    } catch {
      return false;
    }
  }

  /**
   * 检查数据完整性
   */
  private async checkDataIntegrity(): Promise<number> {
    // 简化实现，实际应该检查数据库、配置文件等
    try {
      const settings = localStorage.getItem('tuanki-settings');
      const templates = localStorage.getItem('tuanki-templates');
      
      let score = 1.0;
      
      if (!settings) score -= 0.3;
      if (!templates) score -= 0.2;
      
      // 检查JSON格式
      if (settings) {
        try {
          JSON.parse(settings);
        } catch {
          score -= 0.3;
        }
      }
      
      return Math.max(0, score);
    } catch {
      return 0;
    }
  }

  /**
   * 修复数据完整性
   */
  private async repairDataIntegrity(): Promise<boolean> {
    try {
      // 简化的数据修复逻辑
      console.log('🔧 执行数据完整性修复...');
      
      // 检查并修复设置
      const settings = localStorage.getItem('tuanki-settings');
      if (!settings) {
        localStorage.setItem('tuanki-settings', JSON.stringify({}));
      }
      
      return true;
    } catch (error) {
      console.error('数据修复失败:', error);
      return false;
    }
  }

  /**
   * 检查服务状态
   */
  private async checkServiceStatuses(): Promise<Array<{ name: string; healthy: boolean }>> {
    return [
      { name: 'localStorage', healthy: await this.testLocalStorage() },
      { name: 'indexedDB', healthy: await this.testIndexedDB() },
      { name: 'webWorkers', healthy: await this.testWebWorkers() },
      { name: 'fileAPI', healthy: await this.testFileAPI() }
    ];
  }

  /**
   * 检查性能指标
   */
  private async checkPerformanceMetrics(): Promise<{ score: number; memory: number; timing: number }> {
    let score = 100;
    let memory = 0;
    let timing = 0;

    // 检查内存使用
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      memory = memInfo.usedJSHeapSize / (1024 * 1024); // MB
      
      if (memory > 100) score -= 20;
      else if (memory > 50) score -= 10;
    }

    // 检查页面加载时间
    if (performance.timing) {
      timing = performance.timing.loadEventEnd - performance.timing.navigationStart;
      
      if (timing > 5000) score -= 30;
      else if (timing > 3000) score -= 15;
    }

    return { score: Math.max(0, score), memory, timing };
  }

  /**
   * 检查网络质量
   */
  private async checkNetworkQuality(): Promise<number> {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      const effectiveType = connection.effectiveType;
      
      const qualityMap = {
        '4g': 1.0,
        '3g': 0.7,
        '2g': 0.4,
        'slow-2g': 0.2
      };
      
      return qualityMap[effectiveType as keyof typeof qualityMap] || 0.5;
    }
    
    return 0.8; // 默认假设良好
  }
}

// 创建全局实例
export const healthChecker = new HealthChecker();
