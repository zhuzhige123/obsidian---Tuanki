<script lang="ts">
  import { Platform } from 'obsidian';
  import MemoryCurveChart from '../../charts/MemoryCurveChartEcharts.svelte';
  import { generateMemoryCurveData } from '../../../utils/memory-curve-utils';
  import type { Card } from '../../../data/types';
  import type { TimeRange, TimeRangeConfig } from '../../../types/view-card-modal-types';
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

  // 时间范围配置
  const timeRanges = $derived([
    { value: '7d' as TimeRange, label: t('modals.memoryCurveTab.last7Days'), days: 7 },
    { value: '14d' as TimeRange, label: t('modals.memoryCurveTab.last14Days'), days: 14 },
    { value: '30d' as TimeRange, label: t('modals.memoryCurveTab.last30Days'), days: 30 },
    { value: '60d' as TimeRange, label: t('modals.memoryCurveTab.last60Days'), days: 60 },
    { value: '90d' as TimeRange, label: t('modals.memoryCurveTab.last90Days'), days: 90 }
  ]);

  // 当前选中的时间范围
  let selectedRange = $state<TimeRange>('30d');
  
  // 生成曲线数据
  const curveData = $derived(generateMemoryCurveData(card, selectedRange));

  // 是否有足够的复习历史
  const hasEnoughData = $derived((card.reviewHistory || []).length >= 2);
</script>

<div class="memory-curve-tab" class:mobile={isMobile} role="tabpanel" id="curve-panel">
  <!-- 时间范围选择器 -->
  <section class="curve-controls" class:mobile={isMobile}>
    <div class="range-selector" class:mobile={isMobile}>
      <span class="range-label">{t('modals.memoryCurveTab.quickRange')}</span>
      <div class="range-buttons" class:mobile={isMobile}>
        {#each timeRanges as range}
          <button
            class="range-button"
            class:active={selectedRange === range.value}
            onclick={() => { selectedRange = range.value; }}
          >
            {isMobile ? range.label.replace('最近', '') : range.label}
          </button>
        {/each}
      </div>
    </div>
    
    <!--  移动端不显示鼠标滚轮提示 -->
    {#if !isMobile}
      <div class="hint-text">
        <span class="hint-indicator">ⓘ</span>
        <span>{t('modals.memoryCurveTab.scrollHint')}</span>
      </div>
    {/if}
  </section>

  <!-- 图表区域 -->
  <section class="curve-chart-section">
    {#if !hasEnoughData}
      <div class="chart-empty">
        <div class="empty-icon">--</div>
        <h4>{t('modals.memoryCurveTab.emptyState.title')}</h4>
        <p>{t('modals.memoryCurveTab.emptyState.description')}</p>
        <p class="empty-hint">{t('modals.memoryCurveTab.emptyState.reviewCount').replace('{count}', String((card.reviewHistory || []).length))}</p>
      </div>
    {:else}
      <MemoryCurveChart data={curveData} height={450} />
    {/if}
  </section>

  <!--  曲线解读区域已移除 - 用户反馈不需要 -->

  <!-- 统计摘要 -->
  {#if hasEnoughData}
    <section class="curve-summary" class:mobile={isMobile}>
      <div class="summary-item">
        <span class="summary-label">{t('modals.memoryCurveTab.summary.dataPoints')}</span>
        <span class="summary-value">{curveData.actual.length} {t('modals.memoryCurveTab.summary.pointsUnit')}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">{t('modals.memoryCurveTab.summary.reviewMarkers')}</span>
        <span class="summary-value">{curveData.reviewMarkers.length} {t('modals.memoryCurveTab.summary.pointsUnit')}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">{t('modals.memoryCurveTab.summary.currentStability')}</span>
        <span class="summary-value">{(card.fsrs?.stability || 0).toFixed(1)} {t('modals.memoryCurveTab.summary.daysUnit')}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">{t('modals.memoryCurveTab.summary.currentRetrievability')}</span>
        <span class="summary-value">{((card.fsrs?.retrievability || 0) * 100).toFixed(1)}%</span>
      </div>
    </section>
  {/if}
</div>

<style>
  .memory-curve-tab {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    height: 100%;
    min-height: 0;
  }

  .curve-controls {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    padding: 14px 16px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .range-selector {
    display: flex;
    align-items: center;
    gap: var(--size-4-3);
    flex-wrap: wrap;
  }

  .range-label {
    display: flex;
    align-items: center;
    gap: var(--size-4-1);
    font-size: var(--font-ui-small);
    color: var(--text-faint);
    font-weight: 500;
  }

  .range-buttons {
    display: flex;
    gap: var(--size-4-2);
    flex-wrap: wrap;
  }

  .range-button {
    padding: 7px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    color: var(--text-muted);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.16s ease;
    min-width: 56px;
  }

  .range-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border-color: var(--background-modifier-border-hover, var(--background-modifier-border));
    transform: translateY(-1px);
  }

  .range-button.active {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent, white);
    box-shadow: 0 4px 10px rgba(var(--interactive-accent-rgb), 0.22);
  }
  /* 提示文本 */
  .hint-text {
    display: flex;
    align-items: center;
    gap: var(--size-4-1);
    margin-top: 4px;
    padding: 7px 12px;
    background: var(--background-primary);
    border-radius: 999px;
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
    width: fit-content;
  }

  .curve-chart-section {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    padding: 10px 8px;
    min-height: 450px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02), 0 8px 24px rgba(0, 0, 0, 0.14);
  }

  .chart-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 450px;
    color: var(--text-muted);
    text-align: center;
    gap: 8px;
  }

  .chart-empty h4 {
    font-size: var(--font-ui-large);
    color: var(--text-normal);
    margin: 0;
  }

  .chart-empty p {
    font-size: var(--font-ui-medium);
    margin: 0;
  }

  .empty-hint {
    font-size: var(--font-ui-small);
    color: var(--text-faint);
  }

  .empty-icon {
    font-size: 36px;
    margin-bottom: 4px;
    opacity: 0.4;
  }

  .hint-indicator {
    font-size: var(--font-ui-small);
    color: var(--text-accent);
    font-weight: 600;
  }

  .curve-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
    padding: 12px;
    background: var(--background-secondary);
    border-radius: 12px;
    border: 1px solid var(--background-modifier-border);
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-1);
  }

  .summary-label {
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
  }

  .summary-value {
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
  }

  /* 滚动条样式 */
  .memory-curve-tab::-webkit-scrollbar {
    width: 8px;
  }

  .memory-curve-tab::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .memory-curve-tab::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .memory-curve-tab::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  /* 响应式适配 */
  @media (max-width: 768px) {
    .curve-summary {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* ====================  移动端适配样式 ==================== */
  
  /* 移动端主容器 */
  .memory-curve-tab.mobile {
    padding: 12px;
    gap: 12px;
  }

  /* 移动端控制区域 */
  .curve-controls.mobile {
    padding: 12px;
  }

  /* 移动端范围选择器 - 垂直布局 */
  .range-selector.mobile {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  /* 移动端快捷按钮 - 紧凑排列 */
  .range-buttons.mobile {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
  }

  .range-buttons.mobile .range-button {
    padding: 8px 12px;
    font-size: 13px;
    min-height: 36px;
    flex: 0 0 auto;
  }

  /* 移动端统计摘要 - 2x2 网格 */
  .curve-summary.mobile {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    padding: 12px;
  }

  .curve-summary.mobile .summary-item {
    gap: 2px;
  }

  .curve-summary.mobile .summary-label {
    font-size: 11px;
  }

  .curve-summary.mobile .summary-value {
    font-size: 14px;
  }
</style>
