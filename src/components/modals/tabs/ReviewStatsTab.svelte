<script lang="ts">
  import StatCard from '../../ui/StatCard.svelte';
  import ReviewTimeline from '../../ui/ReviewTimeline.svelte';
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  import { aggregateReviewStats, extractFSRSMetrics, formatStudyTime, getStabilityDescription, getDifficultyDescription, getRetrievabilityDescription } from '../../../utils/review-stats-utils';
  import { formatRelativeTimeDetailed } from '../../../utils/helpers';
  import type { Card } from '../../../data/types';

  interface Props {
    card: Card;
  }

  let { card }: Props = $props();

  // 聚合统计数据
  const stats = $derived(aggregateReviewStats(card));
  const fsrsMetrics = $derived(extractFSRSMetrics(card));

  // 格式化数值
  const formattedSuccessRate = $derived((stats.successRate * 100).toFixed(1));
  const formattedStability = $derived(fsrsMetrics.stability.toFixed(1));
  const formattedDifficulty = $derived(fsrsMetrics.difficulty.toFixed(1));
  const formattedRetrievability = $derived((fsrsMetrics.retrievability * 100).toFixed(1));
</script>

<div class="review-stats-tab" role="tabpanel" id="stats-panel">
  <!-- 核心指标卡片 -->
  <section class="stats-section">
    <h3 class="section-title">
      <EnhancedIcon name="bar-chart-2" size={16} />
      核心指标
    </h3>
    
    <div class="stats-grid">
      <StatCard
        icon="rotate-cw"
        iconColor="#3b82f6"
        label="总复习次数"
        value={stats.totalReviews}
        unit="次"
      />
      
      <StatCard
        icon="x-circle"
        iconColor="#ef4444"
        label="遗忘次数"
        value={stats.lapses}
        unit="次"
      />
      
      <StatCard
        icon="trending-up"
        iconColor="#22c55e"
        label="成功率"
        value={formattedSuccessRate}
        unit="%"
        highlighted={stats.successRate >= 0.8}
      />
      
      <StatCard
        icon="calendar"
        iconColor="#f59e0b"
        label="平均间隔"
        value={stats.averageInterval.toFixed(1)}
        unit="天"
      />
    </div>
  </section>

  <!-- FSRS参数 -->
  <section class="stats-section">
    <h3 class="section-title">
      <EnhancedIcon name="activity" size={16} />
      FSRS参数
    </h3>
    
    <div class="fsrs-metrics">
      <div class="metric-card">
        <div class="metric-header">
          <EnhancedIcon name="zap" size={20} color="#3b82f6" />
          <span class="metric-label">稳定性</span>
        </div>
        <div class="metric-value">{formattedStability}<span class="metric-unit">天</span></div>
        <div class="metric-description">{getStabilityDescription(fsrsMetrics.stability)}</div>
        <div class="metric-progress">
          <div class="progress-bar" style="width: {Math.min(fsrsMetrics.stability / 90 * 100, 100)}%; background: #3b82f6;"></div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <EnhancedIcon name="alert-circle" size={20} color="#f59e0b" />
          <span class="metric-label">难度</span>
        </div>
        <div class="metric-value">{formattedDifficulty}<span class="metric-unit">/10</span></div>
        <div class="metric-description">{getDifficultyDescription(fsrsMetrics.difficulty)}</div>
        <div class="metric-progress">
          <div class="progress-bar" style="width: {fsrsMetrics.difficulty * 10}%; background: #f59e0b;"></div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <EnhancedIcon name="brain" size={20} color="#22c55e" />
          <span class="metric-label">可提取性</span>
        </div>
        <div class="metric-value">{formattedRetrievability}<span class="metric-unit">%</span></div>
        <div class="metric-description">{getRetrievabilityDescription(fsrsMetrics.retrievability)}</div>
        <div class="metric-progress">
          <div class="progress-bar" style="width: {fsrsMetrics.retrievability * 100}%; background: #22c55e;"></div>
        </div>
      </div>
    </div>
  </section>

  <!-- 复习计划 -->
  <section class="stats-section">
    <h3 class="section-title">
      <EnhancedIcon name="clock" size={16} />
      复习计划
    </h3>
    
    <div class="schedule-grid">
      <div class="schedule-item">
        <EnhancedIcon name="calendar-check" size={16} />
        <div class="schedule-content">
          <span class="schedule-label">上次复习</span>
          <span class="schedule-value">
            {#if card.fsrs?.lastReview}
              {formatRelativeTimeDetailed(card.fsrs.lastReview)}
            {:else}
              未复习
            {/if}
          </span>
        </div>
      </div>

      <div class="schedule-item">
        <EnhancedIcon name="calendar" size={16} />
        <div class="schedule-content">
          <span class="schedule-label">下次复习</span>
          <span class="schedule-value">{card.fsrs?.due ? formatRelativeTimeDetailed(card.fsrs.due) : '未知'}</span>
        </div>
      </div>

      <div class="schedule-item">
        <EnhancedIcon name="clock" size={16} />
        <div class="schedule-content">
          <span class="schedule-label">已过天数</span>
          <span class="schedule-value">{fsrsMetrics.elapsedDays} 天</span>
        </div>
      </div>

      <div class="schedule-item">
        <EnhancedIcon name="calendar-clock" size={16} />
        <div class="schedule-content">
          <span class="schedule-label">预定间隔</span>
          <span class="schedule-value">{fsrsMetrics.scheduledDays} 天</span>
        </div>
      </div>
    </div>
  </section>

  <!-- 学习时间统计 -->
  {#if stats.totalStudyTime > 0}
    <section class="stats-section">
      <h3 class="section-title">
        <EnhancedIcon name="clock" size={16} />
        学习时间
      </h3>
      
      <div class="time-stats">
        <div class="time-item">
          <span class="time-label">总学习时间</span>
          <span class="time-value">{formatStudyTime(stats.totalStudyTime)}</span>
        </div>
        <div class="time-item">
          <span class="time-label">平均学习时间</span>
          <span class="time-value">{formatStudyTime(stats.averageStudyTime)}</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- 复习历史时间线 -->
  <section class="stats-section">
    <h3 class="section-title">
      <EnhancedIcon name="list" size={16} />
      复习历史
    </h3>
    
    <ReviewTimeline reviews={card.reviewHistory || []} maxItems={20} />
  </section>
</div>

<style>
  .review-stats-tab {
    padding: var(--size-4-4);
    display: flex;
    flex-direction: column;
    gap: var(--size-4-4);
    overflow-y: auto;
    height: 100%;
    min-height: 0;
  }

  .stats-section {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: var(--size-4-4);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: var(--size-4-4);
    padding-bottom: var(--size-4-2);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--size-4-3);
  }

  .fsrs-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--size-4-4);
  }

  .metric-card {
    background: var(--background-secondary);
    padding: var(--size-4-4);
    border-radius: var(--radius-m);
    border: 1px solid var(--background-modifier-border);
  }

  .metric-header {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    margin-bottom: var(--size-4-3);
  }

  .metric-label {
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
  }

  .metric-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--text-normal);
    margin-bottom: var(--size-4-2);
  }

  .metric-unit {
    font-size: var(--font-ui-medium);
    color: var(--text-muted);
    font-weight: 500;
    margin-left: var(--size-4-1);
  }

  .metric-description {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    margin-bottom: var(--size-4-2);
  }

  .metric-progress {
    height: 6px;
    background: var(--background-modifier-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    transition: width 0.3s ease;
    border-radius: 3px;
  }

  .schedule-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--size-4-3);
  }

  .schedule-item {
    display: flex;
    align-items: flex-start;
    gap: var(--size-4-2);
    padding: var(--size-4-3);
    background: var(--background-secondary);
    border-radius: var(--radius-s);
  }

  .schedule-content {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-1);
  }

  .schedule-label {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
  }

  .schedule-value {
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
  }

  .time-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--size-4-3);
  }

  .time-item {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-1);
    padding: var(--size-4-3);
    background: var(--background-secondary);
    border-radius: var(--radius-s);
  }

  .time-label {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
  }

  .time-value {
    font-size: var(--font-ui-large);
    font-weight: 600;
    color: var(--text-normal);
  }

  /* 滚动条样式 */
  .review-stats-tab::-webkit-scrollbar {
    width: 8px;
  }

  .review-stats-tab::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .review-stats-tab::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .review-stats-tab::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  /* 响应式适配 */
  @media (max-width: 768px) {
    .stats-grid,
    .fsrs-metrics,
    .schedule-grid,
    .time-stats {
      grid-template-columns: 1fr;
    }
  }
</style>

