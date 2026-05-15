<script lang="ts">
  import { Platform } from 'obsidian';
  import type { Card } from '../../../data/types';
  import { formatRelativeTimeDetailed, formatStudyTime } from '../../../utils/helpers';

  const isMobile = Platform.isMobile;

  interface Props {
    card: Card;
  }

  let { card }: Props = $props();

  function readString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      }
    }
    return '';
  }

  function readNumber(...values: unknown[]): number | null {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  function getScheduleStatusLabel(value: string): string {
    switch (value) {
      case 'new':
        return '新建';
      case 'queued':
        return '待处理';
      case 'scheduled':
        return '已排期';
      case 'active':
        return '复习中';
      case 'suspended':
        return '已搁置';
      case 'done':
        return '已完成';
      case 'removed':
        return '已移除';
      default:
        return '未知';
    }
  }

  function formatDays(value: number | null): string {
    return value === null ? '未知' : `${value.toFixed(1)} 天`;
  }

  function formatScore(value: number | null, max = 10): string {
    return value === null ? '未知' : `${value.toFixed(1)}/${max}`;
  }

  function formatPercent(value: number | null): string {
    return value === null ? '未知' : `${(value * 100).toFixed(1)}%`;
  }

  const cardLike = $derived(card as Card & Record<string, unknown>);
  const scheduleStatus = $derived(readString(cardLike.ir_state));
  const scheduleStatusLabel = $derived(getScheduleStatusLabel(scheduleStatus));
  const nextReview = $derived(readString(cardLike.ir_next_review, card.fsrs?.due));
  const lastReview = $derived(readString(card.fsrs?.lastReview));
  const reviewCount = $derived(readNumber(cardLike.ir_review_count, card.stats?.totalReviews, card.fsrs?.reps) ?? 0);
  const totalReadingSeconds = $derived(readNumber(cardLike.ir_reading_time, card.stats?.totalTime) ?? 0);
  const averageReadingSeconds = $derived(
    readNumber(card.stats?.averageTime) ?? (reviewCount > 0 ? totalReadingSeconds / reviewCount : 0)
  );
  const intervalDays = $derived(readNumber(card.fsrs?.stability));
  const scheduledDays = $derived(readNumber(card.fsrs?.scheduledDays));
  const elapsedDays = $derived(readNumber(card.fsrs?.elapsedDays));
  const difficulty = $derived(readNumber(card.fsrs?.difficulty));
  const retrievability = $derived(readNumber(card.fsrs?.retrievability));
  const priorityValue = $derived(readNumber(cardLike.ir_priority_value, cardLike.ir_priority, card.priority));
</script>

<div class="ir-card-schedule-tab" class:mobile={isMobile} role="tabpanel" id="ir-schedule-panel">
  <section class="stats-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-blue" class:mobile={isMobile}>
      调度概览
    </h3>

    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">当前状态</span>
        <span class="info-value">{scheduleStatusLabel}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">下次复习</span>
        <span class="info-value">
          {#if nextReview}
            {formatRelativeTimeDetailed(nextReview)}
          {:else}
            未计划
          {/if}
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">上次复习</span>
        <span class="info-value">
          {#if lastReview}
            {formatRelativeTimeDetailed(lastReview)}
          {:else}
            从未复习
          {/if}
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">优先级</span>
        <span class="info-value">{priorityValue === null ? '未知' : `P${priorityValue}`}</span>
      </div>
    </div>
  </section>

  <section class="stats-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-green" class:mobile={isMobile}>
      阅读统计
    </h3>

    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">出现次数</span>
        <span class="info-value">{reviewCount} 次</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">总阅读时长</span>
        <span class="info-value">{formatStudyTime(totalReadingSeconds)}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">平均单次时长</span>
        <span class="info-value">{formatStudyTime(averageReadingSeconds)}</span>
      </div>
    </div>
  </section>

  <section class="stats-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-orange" class:mobile={isMobile}>
      调度参数
    </h3>

    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">当前间隔</span>
        <span class="info-value">{formatDays(intervalDays)}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">预定间隔</span>
        <span class="info-value">{formatDays(scheduledDays)}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">已过天数</span>
        <span class="info-value">{formatDays(elapsedDays)}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">难度</span>
        <span class="info-value">{formatScore(difficulty)}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">可提取性</span>
        <span class="info-value">{formatPercent(retrievability)}</span>
      </div>
    </div>
  </section>
</div>

<style>
  .ir-card-schedule-tab {
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
    position: relative;
    padding-left: 16px;
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: var(--size-4-4);
    line-height: 1.4;
  }

  .section-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 2px;
  }

  .section-title.accent-blue::before {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.6));
  }

  .section-title.accent-green::before {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.6));
  }

  .section-title.accent-orange::before {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.8), rgba(234, 88, 12, 0.6));
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

  .ir-card-schedule-tab::-webkit-scrollbar {
    width: 8px;
  }

  .ir-card-schedule-tab::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .ir-card-schedule-tab::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .ir-card-schedule-tab::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  @media (max-width: 768px) {
    .info-row {
      grid-template-columns: 100px 1fr;
    }
  }

  .ir-card-schedule-tab.mobile {
    padding: 12px;
    gap: 12px;
  }

  .stats-section.mobile {
    padding: 12px;
  }

  .section-title.mobile {
    font-size: 14px;
    margin-bottom: 12px;
    padding-left: 12px;
    line-height: 1.2;
  }

  .section-title.mobile.with-accent-bar::before {
    height: 14px;
    top: 50%;
    bottom: auto;
    transform: translateY(-50%);
  }

  .info-grid.mobile {
    gap: 0;
  }

  .info-row.mobile {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
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
  }
</style>
