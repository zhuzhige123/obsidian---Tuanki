<script lang="ts">
  import type { WeaveTimerHandle } from "../../types/timer-handle.js";
  import { logger } from '../../utils/logger';

  import type { Card } from "../../data/types";
  import type { FSRS } from "../../algorithms/fsrs";
  import { tr } from '../../utils/i18n';

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

  let t = $derived($tr);

  // 移动端点击显示标签功能
  let activeStatIndex = $state<number | null>(null);
  let labelTimeout: WeaveTimerHandle | null = null;

  function handleStatClick(index: number) {
    // 清除之前的定时器
    if (labelTimeout) {
      window.clearTimeout(labelTimeout);
    }
    
    // 切换显示状态
    if (activeStatIndex === index) {
      activeStatIndex = null;
    } else {
      activeStatIndex = index;
      // 2秒后自动隐藏
      labelTimeout = window.setTimeout(() => {
        activeStatIndex = null;
      }, 2000);
    }
  }

  function handleStatKeydown(e: KeyboardEvent, index: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleStatClick(index);
    }
  }

  // 计算或使用传入的统计数据
  let stats = $derived(() => {
    if (sessionStats) return sessionStats;
    
    // 默认计算
    if (!card.fsrs) {
      return {
        retention: 0,
        retentionChange: 0,
        memoryRetention: 0,              //  添加缺少的字段
        stability: 0,                    //  添加缺少的字段
        stabilityState: t('study.statsCards.unknown'),
        difficulty: 0,                   //  添加缺少的字段
        difficultyLevel: t('study.statsCards.unknown'),
        nextReview: t('study.statsCards.today'),
        nextReviewDays: 0,
        nextReviewDate: t('study.statsCards.today'),
        memoryRate: 0,
        predictionAccuracy: 0
      };
    }
    
    const retention = (card.fsrs.retrievability ?? 1) * 100;
    const retentionChange = Math.random() * 5 - 2.5; // 模拟变化
    const stability = card.fsrs.stability ?? 0;        //  添加默认值
    const difficulty = card.fsrs.difficulty ?? 5;     //  添加默认值
    
    let difficultyLevel = t('study.statsCards.diffMedium');
    if (difficulty < 5) difficultyLevel = t('study.statsCards.diffEasy');
    else if (difficulty < 7) difficultyLevel = t('study.statsCards.diffMedium');
    else if (difficulty < 8.5) difficultyLevel = t('study.statsCards.diffHard');
    else difficultyLevel = t('study.statsCards.diffVeryHard');

    let stabilityState = t('study.statsCards.stabStable');
    if (stability < 1) stabilityState = t('study.statsCards.stabUnstable');
    else if (stability < 7) stabilityState = t('study.statsCards.stabSomewhat');
    else stabilityState = t('study.statsCards.stabStable');

    const now = new Date();
    // 安全的时间计算，增加错误处理
    const dueTime = card.fsrs?.due ?? now.toISOString();
    const due = new Date(dueTime);
    
    let nextReviewDays = 0;
    // 验证日期有效性
    if (isNaN(due.getTime())) {
      logger.warn('Invalid due date:', dueTime);
      nextReviewDays = 0; // 无效日期默认为今日
    } else {
      const diffMs = due.getTime() - now.getTime();
      nextReviewDays = diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
    }
    
    // 格式化日期为 YYYY.MM.DD HH:MM:SS 格式
    const formatDateTime = (date: Date) => {
      if (!date || isNaN(date.getTime())) {
        return t('study.statsCards.today');
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}.${month}.${day}  ${hours}:${minutes}:${seconds}`;
    };
    const nextReviewDate = formatDateTime(due);

    return {
      retention: retention,
      retentionChange: retentionChange,
      memoryRetention: retention,
      stability: stability,
      stabilityState: stabilityState,
      difficulty: difficulty,
      difficultyLevel: difficultyLevel,
      nextReview: (nextReviewDays > 0 && !isNaN(nextReviewDays)) ? t('study.statsCards.nDaysLater', { n: String(nextReviewDays) }) : t('study.statsCards.today'),
      nextReviewDays: nextReviewDays,
      nextReviewDate: nextReviewDate,
      memoryRate: card.stats?.memoryRate ?? 0,
      predictionAccuracy: card.stats?.predictionAccuracy ?? 0
    };
  });

  function getRetentionColor(retention: number): string {
    if (retention >= 90) return "var(--weave-success)";
    if (retention >= 70) return "var(--weave-warning)";
    return "var(--weave-error)";
  }

  function getDifficultyColor(level: string): string {
    switch (level) {
      case t('study.statsCards.diffEasy'): return "var(--weave-success)";
      case t('study.statsCards.diffMedium'): return "var(--weave-warning)";
      case t('study.statsCards.diffHard'): return "var(--weave-error)";
      case t('study.statsCards.diffVeryHard'): return "var(--weave-error)";
      default: return "var(--weave-warning)";
    }
  }
</script>

<div class="stats-cards">
  <!-- 记忆保留率 -->
  <div 
    class="stat-card retention-card" 
    class:show-label={activeStatIndex === 0}
    onclick={() => handleStatClick(0)}
    onkeydown={(e) => handleStatKeydown(e, 0)}
    role="button"
    tabindex="0"
  >
    <div class="stat-header">
      <span class="stat-title">{t('study.statsCards.retention')}</span>
      <span class="stat-change" class:positive={stats().retentionChange > 0} class:negative={stats().retentionChange < 0}>
        {stats().retentionChange > 0 ? '+' : ''}{stats().retentionChange.toFixed(1)}%
      </span>
    </div>
    <div class="stat-content">
      <span class="stat-value" style="color: {getRetentionColor(stats().memoryRetention)}">
        {stats().memoryRetention.toFixed(1)}%
      </span>
    </div>
    <!-- 移动端标签提示 -->
    <span class="stat-label-tooltip">{t('study.statsCards.retentionTooltip')}</span>
  </div>

  <!-- 记忆稳定性 -->
  <div 
    class="stat-card stability-card"
    class:show-label={activeStatIndex === 1}
    onclick={() => handleStatClick(1)}
    onkeydown={(e) => handleStatKeydown(e, 1)}
    role="button"
    tabindex="0"
  >
    <div class="stat-header">
      <span class="stat-title">{t('study.statsCards.stability')}</span>
      <span class="stat-status">{stats().stabilityState}</span>
    </div>
    <div class="stat-content">
      <span class="stat-value">
        {stats().stability.toFixed(1)}<span class="stat-unit">{t('study.statsCards.unitDays')}</span>
      </span>
    </div>
    <span class="stat-label-tooltip">{t('study.statsCards.stabilityTooltip')}</span>
  </div>

  <!-- 卡片难度 -->
  <div 
    class="stat-card difficulty-card"
    class:show-label={activeStatIndex === 2}
    onclick={() => handleStatClick(2)}
    onkeydown={(e) => handleStatKeydown(e, 2)}
    role="button"
    tabindex="0"
  >
    <div class="stat-header">
      <span class="stat-title">{t('study.statsCards.difficulty')}</span>
      <span class="stat-status" style="color: {getDifficultyColor(stats().difficultyLevel)}">
        {stats().difficultyLevel}
      </span>
    </div>
    <div class="stat-content">
      <span class="stat-value">
        <span style="color: {getDifficultyColor(stats().difficultyLevel)}">{stats().difficulty.toFixed(1)}</span>
        <span class="stat-unit">/10</span>
      </span>
    </div>
    <span class="stat-label-tooltip">{t('study.statsCards.difficultyTooltip')}</span>
  </div>

  <!-- 下次复习 -->
  <div 
    class="stat-card review-card"
    class:show-label={activeStatIndex === 3}
    onclick={() => handleStatClick(3)}
    onkeydown={(e) => handleStatKeydown(e, 3)}
    role="button"
    tabindex="0"
  >
    <div class="stat-header">
      <span class="stat-title">{t('study.statsCards.nextReview')}</span>
      <span class="stat-status">{stats().nextReviewDate}</span>
    </div>
    <div class="stat-content">
      <span class="stat-value">
        {stats().nextReview}
      </span>
    </div>
    <span class="stat-label-tooltip">{t('study.statsCards.nextReviewTooltip')}</span>
  </div>
</div>

<style>
  .stats-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
    margin: 0 1.5rem 0.375rem 1.5rem;
    animation: slideDown 0.3s ease-out;
  }

  .stat-card {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }

  .stat-card:hover {
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
    transition: opacity 0.3s ease;
    z-index: 2;
    pointer-events: none;
  }

  .stat-card:hover::before {
    opacity: 1;
  }

  .stat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    position: relative;
    z-index: 1;
  }

  .stat-title {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    position: relative;
    z-index: 1;
  }

  .stat-value {
    font-size: 1.5rem;
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
    color: var(--weave-success);
    background: color-mix(in srgb, var(--weave-success) 10%, transparent);
  }

  .stat-change.negative {
    color: var(--weave-error);
    background: color-mix(in srgb, var(--weave-error) 10%, transparent);
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
    color: var(--weave-success);
  }

  .stability-card .stat-header {
    color: var(--weave-info);
  }

  .difficulty-card .stat-header {
    color: var(--weave-warning);
  }

  .review-card .stat-header {
    color: var(--weave-info);
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

  /* 桌面端不进行布局重排，移动端布局由 :global(body.is-phone) 控制 */

  /* ==================== Obsidian 移动端适配 ==================== */
  
  /* 手机端：紧凑的单行横向布局 - 优雅干净设计 */
  :global(body.is-phone) .stats-cards {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    gap: 0.375rem;
    /*  优化：减小两侧间距，与内容区保持一致 */
    margin: 0 0.5rem 0.25rem 0.5rem;
    padding: 0.375rem 0;
    overflow-x: auto;
    overflow-y: hidden;
    animation: none; /* 移动端禁用动画 */
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none; /* Firefox */
    /* 添加微妙的背景色区分 */
    background: color-mix(in srgb, var(--background-secondary) 50%, var(--background-primary) 50%);
    border-radius: 0.625rem;
  }

  :global(body.is-phone) .stats-cards::-webkit-scrollbar {
    display: none; /* Chrome/Safari */
  }

  :global(body.is-phone) .stat-card {
    flex: 1 1 0;
    min-width: 0;
    max-width: none;
    padding: 0.375rem 0.5rem;
    border-radius: 0.5rem;
    min-height: auto;
    position: relative;
    cursor: pointer;
    /*  优化：更精致的卡片设计 - 无边框，纯背景 */
    background: transparent;
    border: none;
    transition: background 0.15s ease;
  }

  :global(body.is-phone) .stat-card:active {
    background: color-mix(in srgb, var(--background-modifier-hover) 80%, transparent);
  }

  :global(body.is-phone) .stat-card::before {
    display: none; /* 移动端隐藏顶部装饰线 */
  }

  :global(body.is-phone) .stat-header {
    margin-bottom: 0.125rem;
    gap: 0;
    display: flex; /* 显示标题 */
    justify-content: center;
  }

  :global(body.is-phone) .stat-title {
    font-size: 0.5625rem;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-muted);
    opacity: 0.8;
  }

  :global(body.is-phone) .stat-content {
    gap: 0;
    align-items: center;
    justify-content: center;
  }

  :global(body.is-phone) .stat-value {
    font-size: 0.875rem;
    font-weight: 700;
    text-align: center;
    color: var(--text-normal);
  }

  :global(body.is-phone) .stat-unit {
    font-size: 0.5625rem;
    margin-left: 0.0625rem;
    opacity: 0.7;
  }

  :global(body.is-phone) .stat-change,
  :global(body.is-phone) .stat-status {
    display: none; /* 移动端隐藏状态标签，保持简洁 */
  }

  /* 移动端标签提示样式 */
  .stat-label-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    font-size: 0.6875rem;
    font-weight: 500;
    border-radius: 6px;
    white-space: nowrap;
    z-index: var(--weave-z-float);
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  /* 提示框小三角 */
  .stat-label-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.85);
  }

  :global(body.is-phone) .stat-card.show-label .stat-label-tooltip {
    display: block;
    animation: fadeInUp 0.2s ease;
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* 平板端：保持 2x2 网格 */
  :global(body.is-tablet) .stats-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin: 0 1rem 1rem 1rem;
  }

  :global(body.is-tablet) .stat-card {
    padding: 0.75rem;
  }

  :global(body.is-tablet) .stat-value {
    font-size: 1.25rem;
  }
</style>
