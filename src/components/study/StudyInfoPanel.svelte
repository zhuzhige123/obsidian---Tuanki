<script lang="ts">
  import Icon from "../ui/Icon.svelte";
  import type { Card } from "../../data/types";

  interface Props {
    card: Card;
    todayStats?: {
      totalCards: number;
      studiedToday: number;
      newCardsToday: number;
      reviewsToday: number;
    };
    fsrsVersion?: string;
    smartTips?: string[];
  }

  let {
    card,
    todayStats = {
      totalCards: 21,
      studiedToday: 8,
      newCardsToday: 3,
      reviewsToday: 5
    },
    fsrsVersion = "FSRS 5/6",
    smartTips = [
      "智能短时记忆",
      "预测遗忘优化",
      "同日复习优化"
    ]
  }: Props = $props();

  // 计算学习进度百分比
  let progressPercentage = $derived(() => {
    if (!todayStats.totalCards) return 0;
    return Math.round((todayStats.studiedToday / todayStats.totalCards) * 100);
  });

  // 获取进度颜色
  function getProgressColor(percentage: number): string {
    if (percentage >= 80) return "var(--tuanki-success)";
    if (percentage >= 50) return "var(--tuanki-warning)";
    return "var(--tuanki-info)";
  }

  // 获取智能提示图标
  function getTipIcon(tip: string): string {
    if (tip.includes("记忆")) return "brain";
    if (tip.includes("预测")) return "trending-up";
    if (tip.includes("优化")) return "zap";
    return "lightbulb";
  }
</script>

<div class="study-info-panel" hidden>
  <!-- FSRS 算法信息 -->
  <div class="info-section fsrs-section">
    <div class="section-header">
      <div class="fsrs-badge">
        <Icon name="cpu" size="14" />
        <span class="fsrs-version">{fsrsVersion}</span>
      </div>
      <button class="info-btn" title="FSRS算法信息">
        <Icon name="info" size="14" />
      </button>
    </div>
    
    <div class="fsrs-description">
      <p>FSRS (Free Spaced Repetition Scheduler) 是一个基于记忆模型的间隔重复算法，能够更精确地预测遗忘时间并优化复习间隔。</p>
    </div>
  </div>

  <!-- 今日学习统计 -->
  <div class="info-section today-stats-section">
    <div class="section-header">
      <h3 class="section-title">今日学习</h3>
      <span class="total-count">{todayStats.totalCards}张卡</span>
    </div>

    <div class="progress-ring-container">
      <div class="progress-ring">
        <svg class="progress-circle" width="80" height="80">
          <circle
            cx="40"
            cy="40"
            r="32"
            stroke="var(--background-modifier-border)"
            stroke-width="6"
            fill="none"
          />
          <circle
            cx="40"
            cy="40"
            r="32"
            stroke={getProgressColor(progressPercentage())}
            stroke-width="6"
            fill="none"
            stroke-dasharray={`${progressPercentage() * 2.01} 201`}
            stroke-dashoffset="0"
            transform="rotate(-90 40 40)"
            class="progress-path"
          />
        </svg>
        <div class="progress-text">
          <span class="progress-number">{progressPercentage()}</span>
          <span class="progress-percent">%</span>
        </div>
      </div>
      
      <div class="today-details">
        <div class="detail-item">
          <Icon name="eye" size="12" />
          <span class="detail-label">已学习</span>
          <span class="detail-value">{todayStats.studiedToday}</span>
        </div>
        
        <div class="detail-item">
          <Icon name="plus" size="12" />
          <span class="detail-label">新卡片</span>
          <span class="detail-value">{todayStats.newCardsToday}</span>
        </div>
        
        <div class="detail-item">
          <Icon name="refresh" size="12" />
          <span class="detail-label">复习</span>
          <span class="detail-value">{todayStats.reviewsToday}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 智能提示 -->
  <div class="info-section smart-tips-section">
    <div class="section-header">
      <h3 class="section-title">智能提示</h3>
      <Icon name="sparkles" size="14" />
    </div>
    
    <div class="tips-list">
      {#each smartTips as tip}
        <div class="tip-item">
          <div class="tip-icon">
            <Icon name={getTipIcon(tip)} size="12" />
          </div>
          <span class="tip-text">{tip}</span>
          <div class="tip-indicator">
            <Icon name="check" size="10" />
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- 卡片快速信息 -->
  <div class="info-section card-quick-info">
    <div class="section-header">
      <h3 class="section-title">当前卡片</h3>
    </div>
    
    <div class="quick-stats">
      <div class="quick-stat">
        <span class="stat-label">类型</span>
        <span class="stat-value">{card.type}</span>
      </div>
      
      <div class="quick-stat">
        <span class="stat-label">复习次数</span>
        <span class="stat-value">{card.fsrs.reps}</span>
      </div>
      
      <div class="quick-stat">
        <span class="stat-label">遗忘次数</span>
        <span class="stat-value">{card.fsrs.lapses}</span>
      </div>
    </div>
  </div>
</div>

<style>
  .study-info-panel {
    width: 280px;
    background: var(--background-primary);
    border-left: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .info-section {
    padding: 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .info-section:last-child {
    border-bottom: none;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0;
  }

  /* FSRS 区域 */
  .fsrs-section {
    background: linear-gradient(135deg, var(--background-secondary), var(--background-primary));
  }

  .fsrs-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--tuanki-info);
    color: white;
    padding: 0.375rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .fsrs-version {
    letter-spacing: 0.5px;
  }

  .info-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
  }

  .info-btn:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .fsrs-description {
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-muted);
  }

  .fsrs-description p {
    margin: 0;
  }

  /* 今日统计区域 */
  .total-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    background: var(--background-secondary);
    padding: 0.25rem 0.5rem;
    border-radius: 0.75rem;
  }

  .progress-ring-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .progress-ring {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .progress-circle {
    transform: rotate(-90deg);
  }

  .progress-path {
    transition: stroke-dasharray 0.5s ease;
  }

  .progress-text {
    position: absolute;
    display: flex;
    align-items: baseline;
    gap: 0.125rem;
  }

  .progress-number {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-normal);
  }

  .progress-percent {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .today-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
  }

  .detail-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--background-secondary);
    border-radius: 0.5rem;
  }

  .detail-label {
    flex: 1;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .detail-value {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  /* 智能提示区域 */
  .smart-tips-section .section-header {
    color: var(--tuanki-warning);
  }

  .tips-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tip-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: var(--background-secondary);
    border-radius: 0.5rem;
    border-left: 3px solid var(--tuanki-success);
  }

  .tip-icon {
    color: var(--tuanki-warning);
    flex-shrink: 0;
  }

  .tip-text {
    flex: 1;
    font-size: 0.75rem;
    color: var(--text-normal);
    font-weight: 500;
  }

  .tip-indicator {
    color: var(--tuanki-success);
    flex-shrink: 0;
  }

  /* 快速信息区域 */
  .quick-stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .quick-stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .quick-stat:last-child {
    border-bottom: none;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .stat-value {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  /* 响应式设计 */
  @media (max-width: 1200px) {
    .study-info-panel {
      width: 240px;
    }
    
    .progress-ring-container {
      gap: 0.75rem;
    }
  }

  @media (max-width: 1024px) {
    .study-info-panel {
      width: 0;
      overflow: hidden;
      border: none;
    }
  }

  /* 动画效果 */
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .tip-item {
    animation: slideIn 0.3s ease-out;
  }

  .tip-item:nth-child(2) {
    animation-delay: 0.1s;
  }

  .tip-item:nth-child(3) {
    animation-delay: 0.2s;
  }
</style>
