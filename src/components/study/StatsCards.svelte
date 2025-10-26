<script lang="ts">
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import type { Card } from "../../data/types";
  import type { FSRS } from "../../algorithms/fsrs";

  interface Props {
    card: Card;
    fsrs: FSRS;
    sessionStats?: {
      memoryRetention: number;
      retentionChange: number;
      stability: number;
      stabilityState: string;
      difficulty: number;
      difficultyLevel: string;
      nextReview: string;
      nextReviewDate: string;
    };
  }

  let { card, fsrs, sessionStats }: Props = $props();

  // 计算或使用传入的统计数据
  let stats = $derived(() => {
    if (sessionStats) return sessionStats;
    
    // 默认计算
    const retention = (card.fsrs.retrievability ?? 1) * 100;
    const retentionChange = Math.random() * 5 - 2.5; // 模拟变化
    const stability = card.fsrs.stability;
    const difficulty = card.fsrs.difficulty;
    
    let difficultyLevel = "中等";
    if (difficulty < 5) difficultyLevel = "简单";
    else if (difficulty < 7) difficultyLevel = "中等";
    else if (difficulty < 8.5) difficultyLevel = "困难";
    else difficultyLevel = "极难";

    let stabilityState = "稳定";
    if (stability < 1) stabilityState = "不稳定";
    else if (stability < 7) stabilityState = "较稳定";
    else stabilityState = "稳定";

    const now = new Date();
    const due = new Date(card.fsrs.due ?? now);
    const diffMs = due.getTime() - now.getTime();
    const nextReviewDays = diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
    const nextReviewDate = due;

    return {
      memoryRetention: retention,
      retentionChange: retentionChange,
      stability: stability,
      stabilityState: stabilityState,
      difficulty: difficulty,
      difficultyLevel: difficultyLevel,
      nextReview: nextReviewDays > 0 ? `${nextReviewDays}天后` : "今日",
      nextReviewDate: nextReviewDate.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    };
  });

  function getRetentionColor(retention: number): string {
    if (retention >= 90) return "var(--tuanki-success)";
    if (retention >= 70) return "var(--tuanki-warning)";
    return "var(--tuanki-error)";
  }

  function getDifficultyColor(level: string): string {
    switch (level) {
      case "简单": return "var(--tuanki-success)";
      case "中等": return "var(--tuanki-warning)";
      case "困难": return "var(--tuanki-error)";
      case "极难": return "var(--tuanki-error)";
      default: return "var(--tuanki-warning)";
    }
  }
</script>

<div class="stats-cards">
  <!-- 记忆保留率 -->
  <div class="stat-card retention-card">
    <div class="stat-header">
      <EnhancedIcon name="brain" size="16" />
      <span class="stat-title">记忆保留率</span>
    </div>
    <div class="stat-content">
      <div class="stat-value-row">
        <span class="stat-value" style="color: {getRetentionColor(stats().memoryRetention)}">
          {stats().memoryRetention.toFixed(1)}%
        </span>
        <span class="stat-change" class:positive={stats().retentionChange > 0} class:negative={stats().retentionChange < 0}>
          {stats().retentionChange > 0 ? '+' : ''}{stats().retentionChange.toFixed(1)}%
        </span>
      </div>
    </div>
  </div>

  <!-- 记忆稳定性 -->
  <div class="stat-card stability-card">
    <div class="stat-header">
      <EnhancedIcon name="trendingUp" size="16" />
      <span class="stat-title">记忆稳定性</span>
    </div>
    <div class="stat-content">
      <div class="stat-value-row">
        <span class="stat-value">
          {stats().stability.toFixed(1)}<span class="stat-unit">天</span>
        </span>
        <span class="stat-status">{stats().stabilityState}</span>
      </div>
    </div>
  </div>

  <!-- 卡片难度 -->
  <div class="stat-card difficulty-card">
    <div class="stat-header">
      <EnhancedIcon name="target" size="16" />
      <span class="stat-title">卡片难度</span>
    </div>
    <div class="stat-content">
      <div class="stat-value-row">
        <span class="stat-value">
          <span style="color: {getDifficultyColor(stats().difficultyLevel)}">{stats().difficulty.toFixed(1)}</span>
          <span class="stat-unit">/10</span>
        </span>
        <span class="stat-status" style="color: {getDifficultyColor(stats().difficultyLevel)}">
          {stats().difficultyLevel}
        </span>
      </div>
    </div>
  </div>

  <!-- 下次复习 -->
  <div class="stat-card review-card">
    <div class="stat-header">
      <EnhancedIcon name="calendar" size="16" />
      <span class="stat-title">下次复习</span>
    </div>
    <div class="stat-content">
      <div class="stat-value-row">
        <span class="stat-value">
          {#if stats().nextReview === "今日"}
            今日
          {:else}
            {stats().nextReview.replace("天后", "")}
            <span class="stat-unit">天后</span>
          {/if}
        </span>
        <span class="stat-status">{stats().nextReviewDate}</span>
      </div>
    </div>
  </div>
</div>

<style>
  .stats-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin: 0 1.5rem 1.5rem 1.5rem;
    animation: slideDown 0.3s ease-out;
  }

  .stat-card {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 1rem;
    padding: 1.25rem;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }

  .stat-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.05);
    border-color: color-mix(in srgb, var(--background-modifier-border) 70%, var(--text-accent) 30%);
  }

  .stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, var(--text-accent), transparent);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .stat-card:hover::before {
    opacity: 1;
  }

  .stat-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    position: relative;
    z-index: 1;
  }

  .stat-title {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    position: relative;
    z-index: 1;
  }

  .stat-value-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  .stat-value {
    font-size: 1.625rem;
    font-weight: 800;
    color: var(--text-normal);
    line-height: 1.1;
    letter-spacing: -0.025em;
  }

  .stat-unit {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 600;
    margin-left: 0.25rem;
  }

  .stat-change {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 0.375rem;
    display: inline-block;
    width: fit-content;
    white-space: nowrap;
  }

  .stat-change.positive {
    color: var(--tuanki-success);
    background: color-mix(in srgb, var(--tuanki-success) 10%, transparent);
  }

  .stat-change.negative {
    color: var(--tuanki-error);
    background: color-mix(in srgb, var(--tuanki-error) 10%, transparent);
  }

  .stat-status {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--text-muted) 8%, transparent);
    white-space: nowrap;
  }

  /* 特定卡片的主题色 */
  .retention-card .stat-header {
    color: var(--tuanki-success);
  }

  .stability-card .stat-header {
    color: var(--tuanki-info);
  }

  .difficulty-card .stat-header {
    color: var(--tuanki-warning);
  }

  .review-card .stat-header {
    color: var(--tuanki-info);
  }

  /* 动画效果 */
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 响应式设计 */
  @media (max-width: 1024px) {
    .stats-cards {
      grid-template-columns: repeat(2, 1fr);
      margin: 0 1rem 1.5rem 1rem;
    }
  }

  @media (max-width: 640px) {
    .stats-cards {
      grid-template-columns: 1fr;
      gap: 0.75rem;
      margin: 0 1rem 1.5rem 1rem;
    }
    
    .stat-card {
      padding: 1rem;
    }
    
    .stat-value {
      font-size: 1.25rem;
    }
  }
</style>
