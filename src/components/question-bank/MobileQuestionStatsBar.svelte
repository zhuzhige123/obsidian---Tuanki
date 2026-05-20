<script lang="ts">
  import { tr } from '../../utils/i18n';
  /**
   * 移动端答题情况信息栏组件
   * 
   * 显示：正确数、错误数、正确率、用时
   * 参考记忆学习界面的 FSRS 信息栏设计
   * 
   * @module components/question-bank/MobileQuestionStatsBar
   * @version 1.0.0
   */

  interface Props {
    /** 是否展开 */
    expanded: boolean;
    /** 正确数 */
    correctCount: number;
    /** 错误数 */
    wrongCount: number;
    /** 正确率 (0-100) */
    accuracy: number;
    /** 当前题目用时（秒） */
    currentTime: number;
    /** 总题数 */
    totalQuestions: number;
    /** 已完成题数 */
    completedQuestions: number;
  }

  let {
    expanded = false,
    correctCount = 0,
    wrongCount = 0,
    accuracy = 0,
    currentTime = 0,
    totalQuestions = 0,
    completedQuestions = 0
  }: Props = $props();
  let t = $derived($tr);

  /**
   * 格式化时间（秒 -> MM:SS）
   */
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * 获取正确率状态样式
   */
  function getAccuracyStatus(): { text: string; class: string } {
    if (completedQuestions === 0) {
      return { text: t('study.questionBankUI.mobileStats.notStarted'), class: 'status-idle' };
    }
    if (accuracy >= 80) {
      return { text: t('study.questionBankUI.mobileStats.excellent'), class: 'status-excellent' };
    }
    if (accuracy >= 60) {
      return { text: t('study.questionBankUI.mobileStats.good'), class: 'status-good' };
    }
    if (accuracy >= 40) {
      return { text: t('study.questionBankUI.mobileStats.fair'), class: 'status-normal' };
    }
    return { text: t('study.questionBankUI.mobileStats.needsWork'), class: 'status-weak' };
  }

  // 派生状态
  let status = $derived(getAccuracyStatus());
  let progressPercent = $derived(totalQuestions > 0 ? (completedQuestions / totalQuestions) * 100 : 0);
</script>

{#if expanded}
  <div class="mobile-question-stats-bar {status.class}">
    <!-- 四栏式布局：正确 | 错误 | 正确率 | 用时 -->
    <div class="stats-grid">
      <!-- 正确数 -->
      <div class="stat-item correct">
        <span class="stat-value">{correctCount}</span>
        <span class="stat-label">{t('study.questionBankUI.mobileStats.correct')}</span>
      </div>

      <!-- 错误数 -->
      <div class="stat-item wrong">
        <span class="stat-value">{wrongCount}</span>
        <span class="stat-label">{t('study.questionBankUI.mobileStats.wrong')}</span>
      </div>

      <!-- 正确率 -->
      <div class="stat-item accuracy">
        <span class="stat-value">{accuracy.toFixed(0)}%</span>
        <span class="stat-label">{status.text}</span>
      </div>

      <!-- 用时 -->
      <div class="stat-item time">
        <span class="stat-value">{formatTime(currentTime)}</span>
        <span class="stat-label">{t('study.questionBankUI.mobileStats.timeSpent')}</span>
      </div>
    </div>

    <!-- 进度条 -->
    <div class="progress-bar-container">
      <div class="progress-bar" style="width: {progressPercent}%"></div>
    </div>
  </div>
{/if}

<style>
  .mobile-question-stats-bar {
    display: flex;
    flex-direction: column;
    padding: 10px 16px;
    margin: 8px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    flex-shrink: 0;
    animation: slideDown 0.2s ease-out;
    gap: 8px;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .stat-value {
    font-size: 1.1rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  /* 正确数 - 绿色 */
  .stat-item.correct .stat-value {
    color: var(--color-green, #22c55e);
  }

  /* 错误数 - 红色 */
  .stat-item.wrong .stat-value {
    color: var(--color-red, #ef4444);
  }

  /* 正确率 - 根据状态变色 */
  .status-excellent .stat-item.accuracy .stat-value {
    color: var(--color-green, #22c55e);
  }

  .status-good .stat-item.accuracy .stat-value {
    color: var(--color-cyan, #06b6d4);
  }

  .status-normal .stat-item.accuracy .stat-value {
    color: var(--color-yellow, #eab308);
  }

  .status-weak .stat-item.accuracy .stat-value {
    color: var(--color-orange, #f97316);
  }

  .status-idle .stat-item.accuracy .stat-value {
    color: var(--text-muted);
  }

  /* 用时 - 蓝色 */
  .stat-item.time .stat-value {
    color: var(--color-blue, #3b82f6);
  }

  /* 进度条 */
  .progress-bar-container {
    height: 4px;
    background: var(--background-modifier-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--interactive-accent);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  /* 状态边框效果 */
  .status-excellent {
    border-color: color-mix(in srgb, var(--color-green, #22c55e) 30%, transparent);
  }

  .status-good {
    border-color: color-mix(in srgb, var(--color-cyan, #06b6d4) 30%, transparent);
  }

  .status-normal {
    border-color: color-mix(in srgb, var(--color-yellow, #eab308) 30%, transparent);
  }

  .status-weak {
    border-color: color-mix(in srgb, var(--color-orange, #f97316) 30%, transparent);
  }
</style>
