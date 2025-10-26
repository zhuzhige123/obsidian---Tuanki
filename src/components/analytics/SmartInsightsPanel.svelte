<script lang="ts">
  import { onMount } from 'svelte';
  import type { PersonalizedInsight } from '../../algorithms/enhanced-fsrs';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';

  interface Props {
    insights: PersonalizedInsight[];
    className?: string;
  }

  let { insights, className = '' }: Props = $props();

  // 状态管理
  let expandedInsight = $state<string | null>(null);
  let showAllInsights = $state(false);

  // 显示的洞察数量
  let displayedInsights = $derived(() => {
    return showAllInsights ? insights : insights.slice(0, 3);
  });

  // 按优先级分组的洞察
  let insightsByPriority = $derived(() => {
    const grouped = {
      high: insights.filter(i => i.priority === 'high'),
      medium: insights.filter(i => i.priority === 'medium'),
      low: insights.filter(i => i.priority === 'low')
    };
    return grouped;
  });

  // 获取洞察类型图标
  function getInsightIcon(type: string): string {
    switch (type) {
      case 'performance': return 'trending-up';
      case 'schedule': return 'calendar';
      case 'difficulty': return 'target';
      case 'method': return 'book-open';
      case 'focus': return 'eye';
      default: return 'star';
    }
  }

  // 获取优先级颜色
  function getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high': return 'var(--memory-analysis-error)';
      case 'medium': return 'var(--memory-analysis-warning)';
      case 'low': return 'var(--memory-analysis-info)';
      default: return 'var(--memory-analysis-text-muted)';
    }
  }

  // 切换洞察展开状态
  function toggleInsight(insightTitle: string) {
    expandedInsight = expandedInsight === insightTitle ? null : insightTitle;
  }

  // 生命周期
  onMount(() => {
    console.log('[SmartInsightsPanel] 组件已挂载，洞察数量:', insights.length);
  });
</script>

<div class="smart-insights-panel {className}">
  <!-- 面板标题 -->
  <div class="panel-header">
    <div class="header-content">
      <EnhancedIcon name="lightbulb" size="20" />
      <h3>智能学习洞察</h3>
      <div class="insights-count">
        {insights.length} 项建议
      </div>
    </div>
    
    {#if insights.length > 3}
      <button 
        class="toggle-button"
        onclick={() => showAllInsights = !showAllInsights}
      >
        {showAllInsights ? '收起' : '查看全部'}
        <EnhancedIcon 
          name={showAllInsights ? 'chevron-up' : 'chevron-down'} 
          size="14" 
        />
      </button>
    {/if}
  </div>

  <!-- 优先级摘要 -->
  {#if insightsByPriority().high.length > 0 || insightsByPriority().medium.length > 0}
    <div class="priority-summary">
      {#if insightsByPriority().high.length > 0}
        <div class="priority-item high">
          <EnhancedIcon name="alert-triangle" size="14" />
          <span>{insightsByPriority().high.length} 项高优先级建议</span>
        </div>
      {/if}
      {#if insightsByPriority().medium.length > 0}
        <div class="priority-item medium">
          <EnhancedIcon name="info" size="14" />
          <span>{insightsByPriority().medium.length} 项中等优先级建议</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 洞察列表 -->
  {#if displayedInsights().length === 0}
    <div class="empty-state">
      <EnhancedIcon name="check-circle" size="32" />
      <h4>学习状态良好</h4>
      <p>当前没有需要特别关注的学习建议，继续保持良好的学习习惯！</p>
    </div>
  {:else}
    <div class="insights-list">
      {#each displayedInsights() as insight}
        <div
          class="insight-card {insight.priority}"
          class:expanded={expandedInsight === insight.title}
          class:actionable={insight.actionable}
        >
          <!-- 洞察头部 -->
          <button
            class="insight-header"
            onclick={() => toggleInsight(insight.title)}
            aria-expanded={expandedInsight === insight.title}
            aria-controls="insight-content-{insight.title}"
          >
            <div class="insight-icon">
              <EnhancedIcon name={getInsightIcon(insight.type)} size="16" />
            </div>
            
            <div class="insight-title-section">
              <h4 class="insight-title">{insight.title}</h4>
              <div class="insight-meta">
                <span class="insight-type">{insight.type}</span>
                <span class="insight-confidence">
                  {(insight.confidence * 100).toFixed(0)}% 置信度
                </span>
              </div>
            </div>
            
            <div class="insight-priority-badge" style="--priority-color: {getPriorityColor(insight.priority)}">
              {insight.priority === 'high' ? '高' : insight.priority === 'medium' ? '中' : '低'}
            </div>
            
            <div class="expand-icon">
              <EnhancedIcon 
                name={expandedInsight === insight.title ? 'chevron-up' : 'chevron-down'} 
                size="14" 
              />
            </div>
          </button>

          <!-- 洞察内容 -->
          <div class="insight-content" id="insight-content-{insight.title}">
            <p class="insight-description">{insight.description}</p>
            
            {#if insight.actionable && insight.expectedImprovement}
              <div class="insight-improvement">
                <EnhancedIcon name="arrow-up-right" size="14" />
                <span>预期改善: {insight.expectedImprovement}</span>
              </div>
            {/if}

            <!-- 置信度条 -->
            <div class="confidence-indicator">
              <div class="confidence-label">建议可信度</div>
              <div class="confidence-bar">
                <div 
                  class="confidence-fill"
                  style="width: {insight.confidence * 100}%; background-color: {getPriorityColor(insight.priority)}"
                ></div>
              </div>
              <div class="confidence-value">{(insight.confidence * 100).toFixed(0)}%</div>
            </div>

            <!-- 展开内容 -->
            {#if expandedInsight === insight.title}
              <div class="expanded-content">
                <div class="insight-details">
                  <div class="detail-item">
                    <span class="detail-label">建议类型:</span>
                    <span class="detail-value">{insight.type}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">可执行性:</span>
                    <span class="detail-value">{insight.actionable ? '是' : '否'}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">优先级:</span>
                    <span class="detail-value priority-{insight.priority}">
                      {insight.priority === 'high' ? '高优先级' : 
                       insight.priority === 'medium' ? '中等优先级' : '低优先级'}
                    </span>
                  </div>
                </div>

                {#if insight.actionable}
                  <div class="action-section">
                    <h5>建议行动</h5>
                    <p>根据您的学习数据分析，建议您采取相应的改进措施来提升学习效果。</p>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- 底部统计 -->
  {#if insights.length > 0}
    <div class="insights-footer">
      <div class="footer-stats">
        <div class="stat-item">
          <span class="stat-value">{insights.filter(i => i.actionable).length}</span>
          <span class="stat-label">可执行建议</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{(insights.reduce((sum, i) => sum + i.confidence, 0) / insights.length * 100).toFixed(0)}%</span>
          <span class="stat-label">平均置信度</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{insightsByPriority().high.length}</span>
          <span class="stat-label">高优先级</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .smart-insights-panel {
    background: var(--memory-analysis-surface, var(--background-secondary));
    border: 1px solid var(--memory-analysis-border, var(--background-modifier-border));
    border-radius: 12px;
    padding: 20px;
    font-family: var(--font-interface, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  }

  /* 面板标题 */
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--memory-analysis-border, var(--background-modifier-border));
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-content h3 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--memory-analysis-text-primary, var(--text-normal));
  }

  .insights-count {
    padding: 4px 8px;
    background: var(--memory-analysis-accent, var(--interactive-accent));
    color: white;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .toggle-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: var(--memory-analysis-bg);
    border: 1px solid var(--memory-analysis-border);
    border-radius: 6px;
    color: var(--memory-analysis-text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toggle-button:hover {
    background: var(--memory-analysis-border);
  }

  /* 优先级摘要 */
  .priority-summary {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .priority-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 16px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .priority-item.high {
    background: color-mix(in srgb, var(--memory-analysis-error) 15%, transparent);
    color: var(--memory-analysis-error);
  }

  .priority-item.medium {
    background: color-mix(in srgb, var(--memory-analysis-warning) 15%, transparent);
    color: var(--memory-analysis-warning);
  }

  /* 空状态 */
  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--memory-analysis-text-secondary);
  }

  .empty-state h4 {
    margin: 12px 0 8px 0;
    color: var(--memory-analysis-text-primary);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  /* 洞察列表 */
  .insights-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .insight-card {
    background: var(--memory-analysis-bg);
    border: 1px solid var(--memory-analysis-border);
    border-radius: 10px;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .insight-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .insight-card.high {
    border-left: 4px solid var(--memory-analysis-error);
  }

  .insight-card.medium {
    border-left: 4px solid var(--memory-analysis-warning);
  }

  .insight-card.low {
    border-left: 4px solid var(--memory-analysis-info);
  }

  .insight-card.actionable {
    background: linear-gradient(135deg,
      var(--memory-analysis-bg) 0%,
      color-mix(in srgb, var(--memory-analysis-accent) 3%, var(--memory-analysis-bg)) 100%);
  }

  /* 洞察头部 */
  .insight-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
  }

  .insight-header:hover {
    background: var(--memory-analysis-border);
  }

  .insight-header:focus {
    outline: 2px solid var(--memory-analysis-accent);
    outline-offset: -2px;
  }

  .insight-icon {
    color: var(--memory-analysis-accent);
    flex-shrink: 0;
  }

  .insight-title-section {
    flex: 1;
  }

  .insight-title {
    margin: 0 0 4px 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--memory-analysis-text-primary);
  }

  .insight-meta {
    display: flex;
    gap: 12px;
    font-size: 0.75rem;
    color: var(--memory-analysis-text-muted);
  }

  .insight-type {
    text-transform: capitalize;
  }

  .insight-priority-badge {
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 600;
    color: white;
    background: var(--priority-color);
    flex-shrink: 0;
  }

  .expand-icon {
    color: var(--memory-analysis-text-muted);
    flex-shrink: 0;
  }

  /* 洞察内容 */
  .insight-content {
    padding: 0 16px 16px 16px;
  }

  .insight-description {
    margin: 0 0 12px 0;
    font-size: 0.9rem;
    color: var(--memory-analysis-text-secondary);
    line-height: 1.4;
  }

  .insight-improvement {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--memory-analysis-success) 10%, transparent);
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--memory-analysis-success);
  }

  /* 置信度指示器 */
  .confidence-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .confidence-label {
    font-size: 0.75rem;
    color: var(--memory-analysis-text-muted);
    white-space: nowrap;
  }

  .confidence-bar {
    flex: 1;
    height: 4px;
    background: var(--memory-analysis-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .confidence-fill {
    height: 100%;
    transition: width 0.3s ease;
  }

  .confidence-value {
    font-size: 0.75rem;
    color: var(--memory-analysis-text-muted);
    white-space: nowrap;
  }

  /* 展开内容 */
  .expanded-content {
    border-top: 1px solid var(--memory-analysis-border);
    padding-top: 12px;
    margin-top: 12px;
  }

  .insight-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .detail-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
  }

  .detail-label {
    color: var(--memory-analysis-text-muted);
  }

  .detail-value {
    color: var(--memory-analysis-text-primary);
    font-weight: 500;
  }

  .detail-value.priority-high {
    color: var(--memory-analysis-error);
  }

  .detail-value.priority-medium {
    color: var(--memory-analysis-warning);
  }

  .detail-value.priority-low {
    color: var(--memory-analysis-info);
  }

  .action-section {
    padding: 12px;
    background: var(--memory-analysis-surface);
    border-radius: 6px;
    border: 1px solid var(--memory-analysis-border);
  }

  .action-section h5 {
    margin: 0 0 8px 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--memory-analysis-text-primary);
  }

  .action-section p {
    margin: 0;
    font-size: 0.8rem;
    color: var(--memory-analysis-text-secondary);
    line-height: 1.4;
  }

  /* 底部统计 */
  .insights-footer {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--memory-analysis-border);
  }

  .footer-stats {
    display: flex;
    justify-content: space-around;
    gap: 16px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .stat-value {
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--memory-analysis-accent);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--memory-analysis-text-muted);
    text-align: center;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .smart-insights-panel {
      padding: 16px;
    }

    .panel-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .priority-summary {
      flex-direction: column;
      gap: 8px;
    }

    .footer-stats {
      flex-direction: column;
      gap: 12px;
    }

    .insight-header {
      padding: 12px;
    }

    .insight-content {
      padding: 0 12px 12px 12px;
    }
  }
</style>
