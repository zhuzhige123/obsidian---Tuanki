<script lang="ts">
  import { Platform } from 'obsidian';
  import ReviewTimeline from '../../ui/ReviewTimeline.svelte';
  import { aggregateReviewStats, extractFSRSMetrics, formatStudyTime } from '../../../utils/review-stats-utils';
  import { formatRelativeTimeDetailed } from '../../../utils/helpers';
  import type { Card } from '../../../data/types';
  //  导入国际化
  import { tr } from '../../../utils/i18n';

  //  移动端检测
  const isMobile = Platform.isMobile;

  interface Props {
    card: Card;
  }

  let { card }: Props = $props();

  //  响应式翻译函数
  let t = $derived($tr);

  // 聚合统计数据
  const stats = $derived(aggregateReviewStats(card));
  const fsrsMetrics = $derived(extractFSRSMetrics(card));

  // 格式化数值
  const formattedSuccessRate = $derived((stats.successRate * 100).toFixed(1));
  const formattedStability = $derived(fsrsMetrics.stability.toFixed(1));
  const formattedDifficulty = $derived(fsrsMetrics.difficulty.toFixed(1));
  const formattedRetrievability = $derived((fsrsMetrics.retrievability * 100).toFixed(1));
</script>

<div class="review-stats-tab" class:mobile={isMobile} role="tabpanel" id="stats-panel">
  <!-- 核心指标 -->
  <section class="stats-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-blue" class:mobile={isMobile}>
      {t('modals.reviewStatsTab.coreMetrics')}
    </h3>
    
    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.totalReviews')}</span>
        <span class="info-value">{stats.totalReviews} {t('modals.reviewStatsTab.times')}</span>
      </div>
      
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.lapses')}</span>
        <span class="info-value">{stats.lapses} {t('modals.reviewStatsTab.times')}</span>
      </div>
      
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.successRate')}</span>
        <span class="info-value" class:highlighted={stats.successRate >= 0.8}>{formattedSuccessRate}%</span>
      </div>
      
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.averageInterval')}</span>
        <span class="info-value">{stats.averageInterval.toFixed(1)} {t('modals.reviewStatsTab.days')}</span>
      </div>
    </div>
  </section>

  <!-- FSRS参数 -->
  <section class="stats-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-green" class:mobile={isMobile}>
      {t('modals.reviewStatsTab.fsrsMetrics')}
    </h3>
    
    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.stability')}</span>
        <span class="info-value">{formattedStability} {t('modals.reviewStatsTab.days')}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.difficulty')}</span>
        <span class="info-value">{formattedDifficulty}/10</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.retrievability')}</span>
        <span class="info-value">{formattedRetrievability}%</span>
      </div>
    </div>
  </section>

  <!-- 复习计划 -->
  <section class="stats-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-orange" class:mobile={isMobile}>
      {t('modals.reviewStatsTab.reviewPlan')}
    </h3>
    
    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.lastReview')}</span>
        <span class="info-value">
          {#if card.fsrs?.lastReview}
            {formatRelativeTimeDetailed(card.fsrs.lastReview)}
          {:else}
            {t('modals.reviewStatsTab.neverReviewed')}
          {/if}
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.nextReview')}</span>
        <span class="info-value">{card.fsrs?.due ? formatRelativeTimeDetailed(card.fsrs.due) : t('modals.reviewStatsTab.unknown')}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.elapsedDays')}</span>
        <span class="info-value">{fsrsMetrics.elapsedDays} {t('modals.reviewStatsTab.days')}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.reviewStatsTab.scheduledDays')}</span>
        <span class="info-value">{fsrsMetrics.scheduledDays} {t('modals.reviewStatsTab.days')}</span>
      </div>
    </div>
  </section>

  <!-- 学习时间统计 -->
  {#if stats.totalStudyTime > 0}
    <section class="stats-section" class:mobile={isMobile}>
      <h3 class="section-title with-accent-bar accent-purple" class:mobile={isMobile}>
        {t('modals.reviewStatsTab.studyTime')}
      </h3>
      
      <div class="time-stats" class:mobile={isMobile}>
        <div class="time-item" class:mobile={isMobile}>
          <span class="time-label">{t('modals.reviewStatsTab.totalStudyTime')}</span>
          <span class="time-value">{formatStudyTime(stats.totalStudyTime)}</span>
        </div>
        <div class="time-item" class:mobile={isMobile}>
          <span class="time-label">{t('modals.reviewStatsTab.averageStudyTime')}</span>
          <span class="time-value">{formatStudyTime(stats.averageStudyTime)}</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- 复习历史时间线 -->
  <section class="stats-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-cyan" class:mobile={isMobile}>
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
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin: 0 0 var(--size-4-4) 0;
    line-height: 1.4;
  }

  .info-grid {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-3);
  }

  .info-row {
    display: grid;
    grid-template-columns: 120px 1fr;
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
    word-break: break-word;
    text-align: right;
  }

  .info-value.highlighted {
    color: var(--color-green);
    font-weight: 600;
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
    background: transparent;
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
    .info-row {
      grid-template-columns: 100px 1fr;
    }
    
    .time-stats {
      grid-template-columns: 1fr;
    }
  }

  /* ====================  移动端适配样式 ==================== */
  
  /* 移动端容器 */
  .review-stats-tab.mobile {
    padding: 12px;
    gap: 12px;
  }

  /* 移动端区块 */
  .stats-section.mobile {
    padding: 12px;
  }

  /* 移动端标题 */
  .section-title.mobile {
    font-size: 14px;
    margin-bottom: 12px;
    line-height: 1.4;
  }

  /*  移动端列表样式 */
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

  /*  移动端学习时间 - 水平布局（标签左，值右） */
  .time-stats.mobile {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .time-item.mobile {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    background: transparent;
    border-radius: 0;
    border-bottom: 1px solid var(--background-modifier-border-hover);
  }

  .time-item.mobile:last-child {
    border-bottom: none;
  }

  .time-item.mobile .time-label {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .time-item.mobile .time-value {
    flex: 1;
    text-align: right;
    font-size: 13px;
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

