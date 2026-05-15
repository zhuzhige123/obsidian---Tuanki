<!--
  增量阅读年度活动热力图组件
  由上层统一提供学习会话快照，只负责展示
-->
<script lang="ts">
  import { Platform } from 'obsidian';
  import type { IRStudySessionSnapshot } from '../../services/incremental-reading/IRAnalyticsService';

  interface Props {
    snapshot: IRStudySessionSnapshot | null;
  }

  let { snapshot }: Props = $props();

  const isMobile = Platform.isMobile;
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];

  let tooltip = $state<{ show: boolean; x: number; y: number; content: string }>({
    show: false,
    x: 0,
    y: 0,
    content: ''
  });

  const heatmap = $derived(snapshot?.heatmap ?? null);
  const summary = $derived(
    heatmap?.summary ?? {
      totalBlocks: 0,
      totalMinutes: 0,
      totalDays: 0,
      avgBlocksPerDay: 0,
      currentStreak: 0,
      maxStreak: 0
    }
  );
  const hasData = $derived((heatmap?.summary.totalDays ?? 0) > 0);

  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatDuration(minutes: number): string {
    if (minutes <= 0) return '0 分钟';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`;
    }
    return `${mins} 分钟`;
  }

  function showTooltip(event: MouseEvent, day: { date: string; blocks: number; duration: number; isPlaceholder?: boolean }) {
    if (day.isPlaceholder || !day.date) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const content =
      day.blocks === 0 && day.duration === 0
        ? `<strong>${formatDate(day.date)}</strong><span class="no-activity">无学习记录</span>`
        : `<strong>${formatDate(day.date)}</strong><span class="stat-line"><span class="label">处理内容块</span><span class="value blocks">${day.blocks} 块</span></span><span class="stat-line"><span class="label">学习时长</span><span class="value">${formatDuration(day.duration)}</span></span>`;

    tooltip = {
      show: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      content
    };
  }

  function hideTooltip() {
    tooltip = { ...tooltip, show: false };
  }
</script>

<div class="activity-heatmap-container">
  {#if !hasData}
    <div class="empty-state">
      <div class="empty-title">暂无活动热力图数据</div>
      <div class="empty-description">当前筛选条件下，还没有可展示的学习会话。</div>
    </div>
  {:else if heatmap}
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-value">{summary.totalBlocks}</div>
        <div class="stat-label">总处理块数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{summary.totalMinutes}</div>
        <div class="stat-label">总学习分钟</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{summary.totalDays}</div>
        <div class="stat-label">活跃天数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{summary.currentStreak}</div>
        <div class="stat-label">当前连续天数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{summary.maxStreak}</div>
        <div class="stat-label">最长连续天数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{summary.avgBlocksPerDay}</div>
        <div class="stat-label">日均处理块数</div>
      </div>
    </div>

    <div class="heatmap-scroll">
      <div class="heatmap-layout" class:mobile={isMobile}>
        <div class="weekday-column">
          {#each weekdayLabels as label}
            <div class="weekday-label">{label}</div>
          {/each}
        </div>

        <div class="heatmap-main">
          <div class="month-labels">
            {#each heatmap.monthLabels as month}
              <div class="month-label" style:left={`${month.position * (isMobile ? 11 : 13)}px`}>
                {month.name}
              </div>
            {/each}
          </div>

          <div class="weeks-grid">
            {#each heatmap.weeks as week}
              <div class="week-column">
                {#each week.days as day}
                  <button
                    type="button"
                    class="day-cell"
                    class:placeholder={day.isPlaceholder}
                    data-level={day.level}
                    aria-label={day.date || '占位'}
                    onmouseenter={(event) => showTooltip(event, day)}
                    onmouseleave={hideTooltip}
                    onfocus={(event) => showTooltip(event as unknown as MouseEvent, day)}
                    onblur={hideTooltip}
                  ></button>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <div class="legend-row">
      <span>少</span>
      <div class="legend-swatch level-0"></div>
      <div class="legend-swatch level-1"></div>
      <div class="legend-swatch level-2"></div>
      <div class="legend-swatch level-3"></div>
      <div class="legend-swatch level-4"></div>
      <span>多</span>
    </div>

    {#if tooltip.show}
      <div
        class="heatmap-tooltip"
        style:left={`${tooltip.x}px`}
        style:top={`${tooltip.y}px`}
      >
        {@html tooltip.content}
      </div>
    {/if}
  {/if}
</div>

<style>
  .activity-heatmap-container {
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: 100%;
    min-height: 0;
    position: relative;
  }

  .empty-state {
    display: grid;
    place-items: center;
    min-height: 280px;
    border: 1px dashed var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-secondary);
    text-align: center;
    padding: 24px;
    gap: 6px;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .empty-description {
    font-size: 12px;
    color: var(--text-muted);
  }

  .stats-bar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 10px;
  }

  .stat-item {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 10px 12px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-normal);
  }

  .stat-label {
    margin-top: 4px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .heatmap-scroll {
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .heatmap-layout {
    display: flex;
    gap: 8px;
    min-width: max-content;
  }

  .weekday-column {
    display: grid;
    grid-template-rows: repeat(7, 1fr);
    gap: 4px;
    padding-top: 18px;
  }

  .weekday-label {
    height: 12px;
    font-size: 10px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .heatmap-main {
    position: relative;
  }

  .month-labels {
    position: relative;
    height: 16px;
    margin-bottom: 6px;
  }

  .month-label {
    position: absolute;
    top: 0;
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .weeks-grid {
    display: flex;
    gap: 4px;
  }

  .week-column {
    display: grid;
    grid-template-rows: repeat(7, 1fr);
    gap: 4px;
  }

  .day-cell {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: none;
    padding: 0;
    cursor: pointer;
    background: var(--background-modifier-border);
  }

  .day-cell.placeholder {
    opacity: 0.35;
    cursor: default;
  }

  .day-cell[data-level='0'] {
    background: var(--background-modifier-border);
  }

  .day-cell[data-level='1'] {
    background: var(--color-green-rgb, 34, 197, 94);
    background: rgba(var(--color-green-rgb, 34, 197, 94), 0.28);
  }

  .day-cell[data-level='2'] {
    background: rgba(var(--color-green-rgb, 34, 197, 94), 0.45);
  }

  .day-cell[data-level='3'] {
    background: rgba(var(--color-green-rgb, 34, 197, 94), 0.68);
  }

  .day-cell[data-level='4'] {
    background: rgba(var(--color-green-rgb, 34, 197, 94), 0.92);
  }

  .legend-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .legend-swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  .legend-swatch.level-0 {
    background: var(--background-modifier-border);
  }

  .legend-swatch.level-1 {
    background: rgba(var(--color-green-rgb, 34, 197, 94), 0.28);
  }

  .legend-swatch.level-2 {
    background: rgba(var(--color-green-rgb, 34, 197, 94), 0.45);
  }

  .legend-swatch.level-3 {
    background: rgba(var(--color-green-rgb, 34, 197, 94), 0.68);
  }

  .legend-swatch.level-4 {
    background: rgba(var(--color-green-rgb, 34, 197, 94), 0.92);
  }

  .heatmap-tooltip {
    position: fixed;
    transform: translate(-50%, -100%);
    z-index: 30;
    min-width: 180px;
    max-width: 240px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: var(--shadow-s, 0 6px 18px rgba(0, 0, 0, 0.18));
    pointer-events: none;
  }

  .heatmap-tooltip :global(strong) {
    display: block;
    font-size: 12px;
    color: var(--text-normal);
    margin-bottom: 6px;
  }

  .heatmap-tooltip :global(.stat-line) {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: var(--text-normal);
  }

  .heatmap-tooltip :global(.label),
  .heatmap-tooltip :global(.no-activity) {
    color: var(--text-muted);
  }

  .heatmap-tooltip :global(.value.blocks) {
    color: var(--interactive-accent);
    font-weight: 600;
  }

  @media (max-width: 600px) {
    .day-cell,
    .legend-swatch {
      width: 10px;
      height: 10px;
    }

    .weeks-grid {
      gap: 3px;
    }

    .week-column,
    .weekday-column {
      gap: 3px;
    }
  }
</style>
