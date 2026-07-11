<script lang="ts">
  import type { TestSession, TestQuestionRecord } from "../../types/question-bank-types";
  import { tr } from "../../utils/i18n";

  interface Props {
    session: TestSession | null;
    currentQuestion: TestQuestionRecord | null;
  }

  let { session, currentQuestion }: Props = $props();
  let t = $derived($tr);

  // 计算统计信息（显示当前题目的历史统计）
  const stats = $derived.by(() => {
    if (!session) {
      return {
        totalAttempts: 0,
        correctRate: 0,
        wrongCount: 0,
        progress: 0,
        currentScore: 0
      };
    }
    
    // 获取当前题目的历史统计数据
    const testStats = currentQuestion?.question?.stats?.testStats;
    
    // 计算会话进度（始终基于会话）
    const progress = session.totalQuestions > 0
      ? (session.completedQuestions / session.totalQuestions) * 100
      : 0;

    // 计算当前测试得分，直接使用 session 中的 score 字段
    const currentScore = session.score || 0;
    
    // 如果有历史统计数据，显示该题目的累计数据
    if (testStats) {
      return {
        totalAttempts: testStats.totalAttempts || 0,
        correctRate: (testStats.accuracy * 100) || 0,
        wrongCount: testStats.incorrectAttempts || 0,
        progress: progress,
        currentScore: currentScore
      };
    }
    
    // 如果是新题目（无历史统计），显示0
    return {
      totalAttempts: 0,
      correctRate: 0,
      wrongCount: 0,
      progress: progress,
      currentScore: currentScore
    };
  });

  function getCorrectRateColor(rate: number): string {
    if (rate >= 80) return "var(--weave-success)";
    if (rate >= 60) return "var(--weave-warning)";
    return "var(--weave-error)";
  }

  // 根据得分返回颜色
  function getScoreColor(score: number): string {
    if (score >= 90) return "var(--weave-success)";      // 90-100分：优秀 - 绿色
    if (score >= 80) return "var(--weave-info)";         // 80-89分：良好 - 蓝色  
    if (score >= 70) return "var(--weave-warning)";      // 70-79分：一般 - 黄色
    if (score >= 60) return "#ff9500";                    // 60-69分：及格 - 橙色
    return "var(--weave-error)";                         // <60分：不及格 - 红色
  }
</script>

<div class="stats-cards">
  <!-- 答题次数（累计） -->
  <div class="stat-card attempts-card">
    <div class="stat-header">
      <span class="stat-title">{t('study.questionBankUI.statsCards.totalAttempts')}</span>
    </div>
    <div class="stat-content">
      <div class="stat-value-row">
        <span class="stat-value">
          {stats.totalAttempts}
        </span>
        <span class="stat-unit">{t('study.questionBankUI.statsCards.timesUnit')}</span>
      </div>
    </div>
  </div>

  <!-- 正确率（该题目的平均正确率） -->
  <div class="stat-card accuracy-card">
    <div class="stat-header">
      <span class="stat-title">{t('study.questionBankUI.statsCards.avgAccuracy')}</span>
    </div>
    <div class="stat-content">
      <div class="stat-value-row">
        <span class="stat-value" style="color: {getCorrectRateColor(stats.correctRate)}">
          {stats.correctRate.toFixed(1)}%
        </span>
      </div>
    </div>
  </div>

  <!-- 错误数（累计） -->
  <div class="stat-card wrong-card">
    <div class="stat-header">
      <span class="stat-title">{t('study.questionBankUI.statsCards.totalWrong')}</span>
    </div>
    <div class="stat-content">
      <div class="stat-value-row">
        <span class="stat-value">
          {stats.wrongCount}
        </span>
        <span class="stat-unit">{t('study.questionBankUI.statsCards.timesUnit')}</span>
      </div>
    </div>
  </div>

  <!-- 当前得分 -->
  <div class="stat-card score-card">
    <div class="stat-header">
      <span class="stat-title">{t('study.questionBankUI.statsCards.currentScore')}</span>
    </div>
    <div class="stat-content">
      <div class="stat-value-row">
        <span class="stat-value" style="color: {getScoreColor(stats.currentScore)}">
          {Math.round(stats.currentScore)}
        </span>
        <span class="stat-unit">{t('study.questionBankUI.statsCards.scoreUnit')}</span>
      </div>
    </div>
  </div>
</div>

<style>
  .stats-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin: 0 1.5rem 0.5rem 1.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--background-modifier-border);
    animation: slideDown 0.3s ease-out;
    flex-shrink: 0;
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

  /* 特定卡片的主题色 */
  .attempts-card .stat-header {
    color: var(--weave-info);
  }

  .accuracy-card .stat-header {
    color: var(--weave-success);
  }

  .wrong-card .stat-header {
    color: var(--weave-error);
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

  /* 桌面端不进行布局重排，移动端布局由 :global(body.is-mobile) 控制 */
</style>
