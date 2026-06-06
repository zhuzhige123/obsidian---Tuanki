<script lang="ts">
  import { logger } from '../../../utils/logger';
  import { tr } from '../../../utils/i18n';

  import type { Card } from '../../../data/types';
  import { formatRelativeTimeDetailed } from '../../../utils/helpers';

  interface Props {
    card: Card;
    isMobile?: boolean;
  }

  let { card, isMobile = false }: Props = $props();
  let t = $derived($tr);

  // 获取测试统计数据
  const testStats = $derived(card.stats?.testStats);

  // 调试日志
  $effect(() => {
    logger.debug('[TestStatsTab] 卡片数据:', {
      cardPurpose: card.cardPurpose,
      hasStats: !!card.stats,
      hasTestStats: !!testStats,
      testStats: testStats
    });
  });

  // 计算正确率
  const accuracy = $derived.by(() => {
    if (!testStats || testStats.totalAttempts === 0) return 0;
    return Math.round((testStats.correctAttempts / testStats.totalAttempts) * 100);
  });

  // 计算平均响应时间（秒）
  const avgResponseTimeSec = $derived.by(() => {
    if (!testStats || testStats.averageResponseTime === 0) return 0;
    return (testStats.averageResponseTime / 1000).toFixed(2);
  });

  // 格式化时间（毫秒转秒）
  function formatTime(ms: number): string {
    if (ms === 0) return t('study.questionBankUI.statsTab.seconds', { count: 0 });
    const seconds = (ms / 1000).toFixed(2);
    return t('study.questionBankUI.statsTab.seconds', { count: seconds });
  }

  // 获取正确率等级
  function getAccuracyLevel(acc: number): string {
    if (acc >= 90) return t('study.questionBankUI.statsTab.excellent');
    if (acc >= 75) return t('study.questionBankUI.statsTab.good');
    if (acc >= 60) return t('study.questionBankUI.statsTab.pass');
    return t('study.questionBankUI.statsTab.needsWork');
  }

  // 获取正确率颜色类
  function getAccuracyColorClass(acc: number): string {
    if (acc >= 90) return 'excellent';
    if (acc >= 75) return 'good';
    if (acc >= 60) return 'pass';
    return 'weak';
  }
</script>

<div class="test-stats-tab" class:mobile={isMobile} role="tabpanel" id="stats-panel">
  {#if testStats && testStats.totalAttempts > 0}
    <!-- 核心指标 -->
    <section class="info-section" class:mobile={isMobile}>
      <h3 class="section-title with-accent-bar accent-blue" class:mobile={isMobile}>
        {t('study.questionBankUI.statsTab.coreMetrics')}
      </h3>
      
      <div class="info-grid" class:mobile={isMobile}>
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.totalAttempts')}</span>
          <span class="info-value">{t('study.questionBankUI.statsTab.timesUnit', { count: testStats.totalAttempts })}</span>
        </div>

        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.correctAttempts')}</span>
          <span class="info-value success">{t('study.questionBankUI.statsTab.timesUnit', { count: testStats.correctAttempts })}</span>
        </div>

        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.incorrectAttempts')}</span>
          <span class="info-value error">{t('study.questionBankUI.statsTab.timesUnit', { count: testStats.incorrectAttempts })}</span>
        </div>

        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.accuracy')}</span>
          <span class="info-value accuracy {getAccuracyColorClass(accuracy)}">
            {accuracy}% ({getAccuracyLevel(accuracy)})
          </span>
        </div>
      </div>
    </section>

    <!-- 表现指标 -->
    <section class="info-section" class:mobile={isMobile}>
      <h3 class="section-title with-accent-bar accent-purple" class:mobile={isMobile}>
        {t('study.questionBankUI.statsTab.performance')}
      </h3>
      
      <div class="info-grid" class:mobile={isMobile}>
        <!-- 时间表现 -->
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.avgResponseTime')}</span>
          <span class="info-value">
            <span class="time-badge">{t('study.questionBankUI.statsTab.seconds', { count: avgResponseTimeSec })}</span>
          </span>
        </div>

        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.fastestResponseTime')}</span>
          <span class="info-value">
            <span class="time-badge fastest">{formatTime(testStats.fastestTime)}</span>
          </span>
        </div>

        <!-- 得分表现 -->
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.bestScore')}</span>
          <span class="info-value">
            <span class="score-badge best">{testStats.bestScore}</span>
          </span>
        </div>

        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.avgScore')}</span>
          <span class="info-value">
            <span class="score-badge avg">{testStats.averageScore}</span>
          </span>
        </div>

        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.recentScore')}</span>
          <span class="info-value">
            <span class="score-badge recent">{testStats.lastScore}</span>
          </span>
        </div>

        <!-- 学习状态 -->
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.consecutiveCorrect')}</span>
          <span class="info-value">
            <span class="streak-badge">{t('study.questionBankUI.statsTab.timesUnit', { count: testStats.consecutiveCorrect })}</span>
          </span>
        </div>

        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('study.questionBankUI.statsTab.errorBook')}</span>
          <span class="info-value">
            {#if testStats.isInErrorBook}
              <span class="status-badge in-error-book">{t('study.questionBankUI.statsTab.included')}</span>
            {:else}
              <span class="status-badge not-in-error-book">{t('study.questionBankUI.statsTab.notIncluded')}</span>
            {/if}
          </span>
        </div>

        {#if testStats.lastTestDate}
          <div class="info-row" class:mobile={isMobile}>
            <span class="info-label">{t('study.questionBankUI.statsTab.lastTest')}</span>
            <span class="info-value">
              <span class="time-muted">{formatRelativeTimeDetailed(testStats.lastTestDate)}</span>
            </span>
          </div>
        {/if}
      </div>
    </section>

  {:else}
    <!-- 无测试数据 -->
    <section class="info-section" class:mobile={isMobile}>
      <div class="no-data">
        <div class="no-data-title">{t('study.questionBankUI.statsTab.noDataTitle')}</div>
        <div class="no-data-desc">{t('study.questionBankUI.statsTab.noDataDesc')}</div>
      </div>
    </section>
  {/if}
</div>

<style>
  .test-stats-tab {
    padding: var(--size-4-4);
    display: flex;
    flex-direction: column;
    gap: var(--size-4-4);
    overflow-y: auto;
    height: 100%;
    min-height: 0;
  }

  .info-section {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: var(--size-4-4);
  }

  .section-title {
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin: 0 0 var(--size-4-4) 0;
    line-height: 1.4;
  }

  /* 信息网格 */
  .info-grid {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-3);
  }

  .info-row {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: var(--size-4-3);
    align-items: center;
  }

  .info-label {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    font-weight: 500;
  }

  .info-value {
    font-size: var(--font-ui-medium);
    color: var(--text-normal);
    text-align: right;
  }

  .info-value.success {
    color: #22c55e;
    font-weight: 600;
  }

  .info-value.error {
    color: #ef4444;
    font-weight: 600;
  }

  .info-value.accuracy {
    font-weight: 700;
  }

  .info-value.accuracy.excellent {
    color: #22c55e;
  }

  .info-value.accuracy.good {
    color: #3b82f6;
  }

  .info-value.accuracy.pass {
    color: #f59e0b;
  }

  .info-value.accuracy.weak {
    color: #ef4444;
  }

  /* 徽章样式 */
  .time-badge,
  .score-badge,
  .status-badge,
  .streak-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-small);
    font-weight: 600;
    border: 1px solid;
  }

  .time-badge {
    background: #dbeafe;
    color: #1e40af;
    border-color: #93c5fd;
  }

  .time-badge.fastest {
    background: #d1fae5;
    color: #065f46;
    border-color: #6ee7b7;
  }

  .score-badge {
    background: #e0e7ff;
    color: #4338ca;
    border-color: #c7d2fe;
  }

  .score-badge.best {
    background: #d1fae5;
    color: #065f46;
    border-color: #6ee7b7;
    font-weight: 700;
  }

  .score-badge.avg {
    background: #fef3c7;
    color: #92400e;
    border-color: #fcd34d;
  }

  .score-badge.recent {
    background: #f3e8ff;
    color: #6b21a8;
    border-color: #d8b4fe;
  }

  .status-badge.in-error-book {
    background: #fee2e2;
    color: #991b1b;
    border-color: #fca5a5;
  }

  .status-badge.not-in-error-book {
    background: #d1fae5;
    color: #065f46;
    border-color: #6ee7b7;
  }

  .streak-badge {
    background: #fef3c7;
    color: #92400e;
    border-color: #fcd34d;
    font-size: var(--font-ui-small);
    font-weight: 600;
  }

  .time-muted {
    color: var(--text-muted);
    font-size: var(--font-ui-small);
  }

  /* 无数据状态 */
  .no-data {
    text-align: center;
    padding: var(--size-4-8) var(--size-4-4);
    background: var(--background-secondary);
    border-radius: var(--radius-m);
    min-height: 200px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  .no-data-title {
    font-size: var(--font-ui-large);
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: var(--size-4-3);
  }

  .no-data-desc {
    font-size: var(--font-ui-medium);
    color: var(--text-muted);
    opacity: 0.8;
  }

  /* 滚动条样式 */
  .test-stats-tab::-webkit-scrollbar {
    width: 8px;
  }

  .test-stats-tab::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .test-stats-tab::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .test-stats-tab::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  /* 响应式适配 */
  @media (max-width: 600px) {
    .info-row {
      grid-template-columns: 100px 1fr;
    }
  }

  /* ==================== 📱 移动端适配样式 ==================== */
  
  /* 移动端容器 */
  .test-stats-tab.mobile {
    padding: 12px;
    gap: 12px;
  }

  /* 移动端区块 */
  .info-section.mobile {
    padding: 12px;
  }

  /* 移动端标题 */
  .section-title.mobile {
    font-size: 14px;
    margin-bottom: 12px;
    line-height: 1.4;
  }

  /* 移动端列表样式 */
  .info-grid.mobile {
    gap: 0;
  }

  .info-row.mobile {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--background-modifier-border-hover);
  }

  .info-row.mobile:last-child {
    border-bottom: none;
  }

  .info-row.mobile .info-label {
    flex-shrink: 0;
    font-size: 13px;
  }

  .info-row.mobile .info-value {
    flex: 1;
    text-align: right;
    font-size: 13px;
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
