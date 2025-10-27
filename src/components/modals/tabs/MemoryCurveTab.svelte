<script lang="ts">
  import MemoryCurveChart from '../../charts/MemoryCurveChartEcharts.svelte';
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  import EnhancedButton from '../../ui/EnhancedButton.svelte';
  import { generateMemoryCurveData } from '../../../utils/memory-curve-utils';
  import type { Card } from '../../../data/types';
  import type { TimeRange, TimeRangeConfig } from '../../../types/view-card-modal-types';

  interface Props {
    card: Card;
  }

  let { card }: Props = $props();

  // 时间范围配置
  const timeRanges: TimeRangeConfig[] = [
    { value: '7d', label: '7天', days: 7 },
    { value: '30d', label: '30天', days: 30 },
    { value: '90d', label: '90天', days: 90 },
    { value: 'all', label: '全部', days: null }
  ];

  // 当前选中的时间范围
  let selectedRange = $state<TimeRange>('30d');

  // 生成曲线数据
  const curveData = $derived(generateMemoryCurveData(card, selectedRange));

  // 是否有足够的复习历史
  const hasEnoughData = $derived((card.reviewHistory || []).length >= 2);
</script>

<div class="memory-curve-tab" role="tabpanel" id="curve-panel">
  <!-- 时间范围选择器 -->
  <section class="curve-controls">
    <div class="range-selector">
      <span class="range-label">
        <EnhancedIcon name="calendar" size={14} />
        时间范围：
      </span>
      <div class="range-buttons">
        {#each timeRanges as range}
          <button
            class="range-button"
            class:active={selectedRange === range.value}
            onclick={() => selectedRange = range.value}
          >
            {range.label}
          </button>
        {/each}
      </div>
    </div>
  </section>

  <!-- 图例说明 -->
  <section class="curve-legend">
    <div class="legend-item">
      <div class="legend-marker predicted"></div>
      <span class="legend-label">预测曲线 - 基于FSRS算法的理论遗忘曲线</span>
    </div>
    <div class="legend-item">
      <div class="legend-marker actual"></div>
      <span class="legend-label">实际曲线 - 基于真实复习记录的表现</span>
    </div>
    <div class="legend-item">
      <div class="legend-marker review"></div>
      <span class="legend-label">复习点 - 实际复习时刻的记忆状态</span>
    </div>
  </section>

  <!-- 图表区域 -->
  <section class="curve-chart-section">
    {#if !hasEnoughData}
      <div class="chart-empty">
        <EnhancedIcon name="bar-chart-2" size={48} />
        <h4>数据不足</h4>
        <p>至少需要2次复习记录才能生成记忆曲线</p>
        <p class="empty-hint">当前复习次数：{(card.reviewHistory || []).length}</p>
      </div>
    {:else}
      <MemoryCurveChart data={curveData} timeRange={selectedRange} height={450} />
    {/if}
  </section>

  <!-- 关键指标注释 -->
  {#if hasEnoughData}
    <section class="curve-insights">
      <h3 class="insights-title">
        <EnhancedIcon name="lightbulb" size={16} />
        曲线解读
      </h3>
      
      <div class="insights-grid">
        <div class="insight-card">
          <EnhancedIcon name="trending-down" size={20} color="#3b82f6" />
          <div class="insight-content">
            <h4>遗忘曲线</h4>
            <p>记忆随时间自然衰退，稳定性越高，曲线越平缓</p>
          </div>
        </div>

        <div class="insight-card">
          <EnhancedIcon name="target" size={20} color="#22c55e" />
          <div class="insight-content">
            <h4>最佳复习时机</h4>
            <p>当可提取性降至70-80%时复习效果最佳</p>
          </div>
        </div>

        <div class="insight-card">
          <EnhancedIcon name="zap" size={20} color="#f59e0b" />
          <div class="insight-content">
            <h4>稳定性增长</h4>
            <p>成功复习会显著提升稳定性，延长下次间隔</p>
          </div>
        </div>

        <div class="insight-card">
          <EnhancedIcon name="alert-circle" size={20} color="#ef4444" />
          <div class="insight-content">
            <h4>遗忘影响</h4>
            <p>遗忘会降低稳定性，但有助于长期记忆</p>
          </div>
        </div>
      </div>
    </section>
  {/if}

  <!-- 统计摘要 -->
  {#if hasEnoughData}
    <section class="curve-summary">
      <div class="summary-item">
        <span class="summary-label">数据点数量</span>
        <span class="summary-value">{curveData.actual.length} 个</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">复习标记</span>
        <span class="summary-value">{curveData.reviewMarkers.length} 个</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">当前稳定性</span>
        <span class="summary-value">{(card.fsrs?.stability || 0).toFixed(1)} 天</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">当前可提取性</span>
        <span class="summary-value">{((card.fsrs?.retrievability || 0) * 100).toFixed(1)}%</span>
      </div>
    </section>
  {/if}
</div>

<style>
  .memory-curve-tab {
    padding: var(--size-4-4);
    display: flex;
    flex-direction: column;
    gap: var(--size-4-4);
    overflow-y: auto;
    height: 100%;
    min-height: 0;
  }

  .curve-controls {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: var(--size-4-4);
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
    color: var(--text-muted);
    font-weight: 500;
  }

  .range-buttons {
    display: flex;
    gap: var(--size-4-2);
    flex-wrap: wrap;
  }

  .range-button {
    padding: 6px 16px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--text-normal);
    font-size: var(--font-ui-small);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .range-button:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .range-button.active {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: white;
  }

  .curve-legend {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: var(--size-4-3);
    display: flex;
    flex-direction: column;
    gap: var(--size-4-2);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
  }

  .legend-marker {
    width: 24px;
    height: 4px;
    border-radius: 2px;
  }

  .legend-marker.predicted {
    background: #3b82f6;
    border: 1px dashed #3b82f6;
  }

  .legend-marker.actual {
    background: #22c55e;
    height: 6px;
  }

  .legend-marker.review {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ef4444;
  }

  .legend-label {
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
  }

  .curve-chart-section {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: var(--size-4-4);
    min-height: 450px;
  }

  .chart-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 450px;
    color: var(--text-muted);
    text-align: center;
    gap: var(--size-4-2);
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

  .curve-insights {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: var(--size-4-4);
  }

  .insights-title {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: var(--size-4-3);
  }

  .insights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--size-4-3);
  }

  .insight-card {
    display: flex;
    align-items: flex-start;
    gap: var(--size-4-2);
    padding: var(--size-4-3);
    background: var(--background-secondary);
    border-radius: var(--radius-s);
  }

  .insight-content h4 {
    font-size: var(--font-ui-small);
    font-weight: 600;
    color: var(--text-normal);
    margin: 0 0 var(--size-4-1) 0;
  }

  .insight-content p {
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    margin: 0;
    line-height: 1.4;
  }

  .curve-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--size-4-3);
    padding: var(--size-4-3);
    background: var(--background-secondary);
    border-radius: var(--radius-m);
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
    .insights-grid {
      grid-template-columns: 1fr;
    }

    .curve-summary {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>

