/**
 * Tuanki标注系统用户体验优化器
 * 提供智能的用户体验优化和反馈机制
 */

export interface UXMetric {
  timestamp: number;
  action: string;
  duration: number;
  success: boolean;
  userSatisfaction?: number; // 1-5分
  errorMessage?: string;
  context?: Record<string, any>;
}

export interface UXReport {
  totalInteractions: number;
  successRate: number;
  averageResponseTime: number;
  userSatisfactionScore: number;
  commonIssues: Array<{
    issue: string;
    frequency: number;
    impact: 'low' | 'medium' | 'high';
    suggestions: string[];
  }>;
  recommendations: string[];
}

/**
 * 用户体验优化器类
 */
export class AnnotationUXOptimizer {
  private static instance: AnnotationUXOptimizer;
  private metrics: UXMetric[] = [];
  private isEnabled: boolean = false;
  private feedbackCallbacks: Map<string, (feedback: any) => void> = new Map();

  private constructor() {}

  public static getInstance(): AnnotationUXOptimizer {
    if (!AnnotationUXOptimizer.instance) {
      AnnotationUXOptimizer.instance = new AnnotationUXOptimizer();
    }
    return AnnotationUXOptimizer.instance;
  }

  /**
   * 启用UX优化
   */
  public enable(): void {
    this.isEnabled = true;
    console.log('🎨 [UXOptimizer] 用户体验优化已启用');
  }

  /**
   * 禁用UX优化
   */
  public disable(): void {
    this.isEnabled = false;
    this.clear();
    console.log('🎨 [UXOptimizer] 用户体验优化已禁用');
  }

  /**
   * 记录用户交互
   */
  public recordInteraction(
    action: string,
    duration: number,
    success: boolean,
    context?: Record<string, any>,
    errorMessage?: string
  ): void {
    if (!this.isEnabled) return;

    const metric: UXMetric = {
      timestamp: Date.now(),
      action,
      duration,
      success,
      context,
      errorMessage
    };

    this.metrics.push(metric);

    // 自动分析并提供即时反馈
    this.analyzeInteraction(metric);
  }

  /**
   * 记录用户满意度
   */
  public recordSatisfaction(action: string, score: number): void {
    if (!this.isEnabled) return;

    const recentMetric = this.metrics
      .filter(m => m.action === action)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (recentMetric) {
      recentMetric.userSatisfaction = score;
    }
  }

  /**
   * 分析单次交互
   */
  private analyzeInteraction(metric: UXMetric): void {
    // 响应时间分析
    if (metric.duration > 3000) {
      this.triggerFeedback('slow_response', {
        action: metric.action,
        duration: metric.duration,
        suggestion: '操作响应较慢，建议检查网络连接或减少同时处理的任务数量'
      });
    }

    // 错误分析
    if (!metric.success && metric.errorMessage) {
      this.triggerFeedback('error_occurred', {
        action: metric.action,
        error: metric.errorMessage,
        suggestion: this.getErrorSuggestion(metric.errorMessage)
      });
    }

    // 频繁操作检测
    const recentSameActions = this.metrics
      .filter(m => m.action === metric.action && Date.now() - m.timestamp < 60000)
      .length;

    if (recentSameActions > 5) {
      this.triggerFeedback('frequent_action', {
        action: metric.action,
        frequency: recentSameActions,
        suggestion: '检测到频繁操作，可能存在配置问题或需要批量处理功能'
      });
    }
  }

  /**
   * 获取错误建议
   */
  private getErrorSuggestion(errorMessage: string): string {
    const errorSuggestions: Record<string, string> = {
      '文件不存在': '请确认文件路径正确，或检查文件是否已被删除',
      '权限不足': '请检查文件权限设置，确保Obsidian有读写权限',
      '格式错误': '请检查标注格式是否符合规范：> [!tuanki]',
      '网络错误': '请检查网络连接，或稍后重试',
      '内存不足': '请关闭其他应用程序释放内存，或重启Obsidian',
      '解析失败': '请检查Markdown语法是否正确，特别是标注块的格式'
    };

    for (const [key, suggestion] of Object.entries(errorSuggestions)) {
      if (errorMessage.includes(key)) {
        return suggestion;
      }
    }

    return '遇到未知错误，请查看控制台日志或联系技术支持';
  }

  /**
   * 触发反馈
   */
  private triggerFeedback(type: string, data: any): void {
    const callback = this.feedbackCallbacks.get(type);
    if (callback) {
      callback(data);
    }
  }

  /**
   * 注册反馈回调
   */
  public onFeedback(type: string, callback: (data: any) => void): void {
    this.feedbackCallbacks.set(type, callback);
  }

  /**
   * 生成UX报告
   */
  public generateReport(): UXReport {
    const totalInteractions = this.metrics.length;
    const successfulInteractions = this.metrics.filter(m => m.success).length;
    const successRate = totalInteractions > 0 ? (successfulInteractions / totalInteractions) * 100 : 0;

    const averageResponseTime = totalInteractions > 0 
      ? this.metrics.reduce((sum, m) => sum + m.duration, 0) / totalInteractions 
      : 0;

    const satisfactionScores = this.metrics
      .filter(m => m.userSatisfaction !== undefined)
      .map(m => m.userSatisfaction!);
    const userSatisfactionScore = satisfactionScores.length > 0
      ? satisfactionScores.reduce((sum, score) => sum + score, 0) / satisfactionScores.length
      : 0;

    const commonIssues = this.analyzeCommonIssues();
    const recommendations = this.generateRecommendations();

    return {
      totalInteractions,
      successRate,
      averageResponseTime,
      userSatisfactionScore,
      commonIssues,
      recommendations
    };
  }

  /**
   * 分析常见问题
   */
  private analyzeCommonIssues(): Array<{
    issue: string;
    frequency: number;
    impact: 'low' | 'medium' | 'high';
    suggestions: string[];
  }> {
    const issues: Map<string, { count: number; examples: UXMetric[] }> = new Map();

    // 收集失败的交互
    this.metrics.filter(m => !m.success).forEach(metric => {
      const issue = metric.errorMessage || `${metric.action} 失败`;
      if (!issues.has(issue)) {
        issues.set(issue, { count: 0, examples: [] });
      }
      const issueData = issues.get(issue)!;
      issueData.count++;
      issueData.examples.push(metric);
    });

    // 转换为报告格式
    return Array.from(issues.entries()).map(([issue, data]) => {
      const frequency = data.count;
      const impact = this.determineImpact(frequency, data.examples);
      const suggestions = this.generateIssueSuggestions(issue, data.examples);

      return { issue, frequency, impact, suggestions };
    }).sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * 确定问题影响程度
   */
  private determineImpact(frequency: number, examples: UXMetric[]): 'low' | 'medium' | 'high' {
    const totalInteractions = this.metrics.length;
    const impactRate = frequency / totalInteractions;

    if (impactRate > 0.2) return 'high';
    if (impactRate > 0.1) return 'medium';
    return 'low';
  }

  /**
   * 生成问题建议
   */
  private generateIssueSuggestions(issue: string, examples: UXMetric[]): string[] {
    const suggestions: string[] = [];

    // 基于错误类型的建议
    if (issue.includes('文件')) {
      suggestions.push('检查文件路径和权限设置');
      suggestions.push('确保文件未被其他程序占用');
    }

    if (issue.includes('格式') || issue.includes('解析')) {
      suggestions.push('检查标注格式是否符合规范');
      suggestions.push('参考文档中的标注示例');
    }

    if (issue.includes('网络') || issue.includes('连接')) {
      suggestions.push('检查网络连接状态');
      suggestions.push('尝试重新连接或稍后重试');
    }

    // 基于频率的建议
    if (examples.length > 10) {
      suggestions.push('考虑批量处理以提高效率');
      suggestions.push('检查是否存在配置问题');
    }

    return suggestions;
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const report = this.generateReport();

    // 成功率建议
    if (report.successRate < 80) {
      recommendations.push('成功率较低，建议检查常见错误并优化用户指导');
    }

    // 响应时间建议
    if (report.averageResponseTime > 2000) {
      recommendations.push('平均响应时间较长，建议优化性能或增加进度提示');
    }

    // 用户满意度建议
    if (report.userSatisfactionScore < 3.5) {
      recommendations.push('用户满意度较低，建议改进用户界面和交互流程');
    }

    // 基于常见问题的建议
    const highImpactIssues = report.commonIssues.filter(issue => issue.impact === 'high');
    if (highImpactIssues.length > 0) {
      recommendations.push(`优先解决高影响问题：${highImpactIssues.map(i => i.issue).join(', ')}`);
    }

    // 交互频率建议
    const recentInteractions = this.metrics.filter(m => Date.now() - m.timestamp < 3600000);
    if (recentInteractions.length > 100) {
      recommendations.push('检测到高频使用，建议添加快捷操作和批量功能');
    }

    if (recommendations.length === 0) {
      recommendations.push('用户体验表现良好，继续保持');
    }

    return recommendations;
  }

  /**
   * 获取实时UX指标
   */
  public getRealTimeMetrics(): {
    recentSuccessRate: number;
    recentAverageResponseTime: number;
    activeIssues: number;
    trendDirection: 'improving' | 'stable' | 'declining';
  } {
    const recentMetrics = this.metrics.filter(m => Date.now() - m.timestamp < 300000); // 5分钟内
    const recentSuccessRate = recentMetrics.length > 0 
      ? (recentMetrics.filter(m => m.success).length / recentMetrics.length) * 100 
      : 0;

    const recentAverageResponseTime = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
      : 0;

    const activeIssues = recentMetrics.filter(m => !m.success).length;

    // 趋势分析
    const olderMetrics = this.metrics.filter(m => 
      Date.now() - m.timestamp >= 300000 && Date.now() - m.timestamp < 600000
    );
    const olderSuccessRate = olderMetrics.length > 0
      ? (olderMetrics.filter(m => m.success).length / olderMetrics.length) * 100
      : recentSuccessRate;

    let trendDirection: 'improving' | 'stable' | 'declining' = 'stable';
    if (recentSuccessRate > olderSuccessRate + 5) {
      trendDirection = 'improving';
    } else if (recentSuccessRate < olderSuccessRate - 5) {
      trendDirection = 'declining';
    }

    return {
      recentSuccessRate,
      recentAverageResponseTime,
      activeIssues,
      trendDirection
    };
  }

  /**
   * 清理数据
   */
  public clear(): void {
    this.metrics.length = 0;
    this.feedbackCallbacks.clear();
  }

  /**
   * 导出UX数据
   */
  public exportData(): string {
    const report = this.generateReport();
    return JSON.stringify({
      report,
      rawMetrics: this.metrics
    }, null, 2);
  }

  /**
   * 打印UX报告
   */
  public printReport(): void {
    if (!this.isEnabled) {
      console.log('🎨 [UXOptimizer] 用户体验优化未启用');
      return;
    }

    const report = this.generateReport();

    console.group('🎨 Tuanki标注系统用户体验报告');
    console.log(`总交互次数: ${report.totalInteractions}`);
    console.log(`成功率: ${report.successRate.toFixed(1)}%`);
    console.log(`平均响应时间: ${report.averageResponseTime.toFixed(0)}ms`);
    console.log(`用户满意度: ${report.userSatisfactionScore.toFixed(1)}/5`);

    if (report.commonIssues.length > 0) {
      console.group('🚨 常见问题');
      report.commonIssues.slice(0, 5).forEach(issue => {
        console.log(`${issue.issue} (${issue.frequency}次, ${issue.impact}影响)`);
      });
      console.groupEnd();
    }

    console.group('💡 优化建议');
    report.recommendations.forEach(rec => console.log(`• ${rec}`));
    console.groupEnd();

    console.groupEnd();
  }
}

// 导出全局实例
export const uxOptimizer = AnnotationUXOptimizer.getInstance();
