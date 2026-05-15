<!--
  历史学习行为散点图组件
  由上层统一提供学习会话快照，只负责展示
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Platform } from 'obsidian';
  import type { IRStudySessionSnapshot } from '../../services/incremental-reading/IRAnalyticsService';
  import { createManagedChartRuntime } from '../../utils/chart-runtime';
  import type { EChartsOption } from '../../utils/echarts-loader';

  interface Props {
    snapshot: IRStudySessionSnapshot | null;
  }

  type ViewMode = 'date' | 'weekday';
  type ChartPayload = {
    snapshot: IRStudySessionSnapshot;
    viewMode: ViewMode;
  };

  const isMobile = Platform.isMobile;

  let { snapshot }: Props = $props();
  let chartContainer = $state<HTMLDivElement | null>(null);
  let viewMode = $state<ViewMode>('date');

  const chartRuntime = createManagedChartRuntime<ChartPayload>({
    buildOption(payload, theme): EChartsOption {
      const scatter =
        payload.viewMode === 'date'
          ? payload.snapshot.scatter.dateViewData
          : payload.snapshot.scatter.weekdayViewData;
      const yAxisData =
        payload.viewMode === 'date'
          ? payload.snapshot.scatter.dateAxis
          : payload.snapshot.scatter.weekdayAxis;
      const maxDuration = Math.max(payload.snapshot.scatter.maxDurationMinutes, 60);

      return {
        tooltip: {
          trigger: 'item',
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          textStyle: {
            color: theme.textColor,
            fontSize: 12
          },
          confine: true,
          formatter(params: any) {
            const session = params.data.session;
            const startDate = new Date(session.startTime);
            const timeStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
            const dateStr = String(session.startTime || '').split('T')[0];
            const durationMin = Math.round(Number(session.confirmedDuration || 0) / 60);

            return `
              <div style="padding:4px 0;">
                <div style="font-weight:600;margin-bottom:6px;">${session.deckName || '未命名牌组'}</div>
                <div style="display:flex;justify-content:space-between;gap:16px;">
                  <span style="color:${theme.subTextColor};">日期</span>
                  <span>${dateStr}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:16px;">
                  <span style="color:${theme.subTextColor};">开始时间</span>
                  <span>${timeStr}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:16px;">
                  <span style="color:${theme.subTextColor};">学习时长</span>
                  <span style="color:${theme.accentColor};font-weight:600;">${durationMin} 分钟</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:16px;">
                  <span style="color:${theme.subTextColor};">完成内容块</span>
                  <span>${session.blocksCompleted}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:16px;">
                  <span style="color:${theme.subTextColor};">创建卡片</span>
                  <span>${session.cardsCreated}</span>
                </div>
              </div>
            `;
          }
        },
        grid: {
          left: isMobile ? (payload.viewMode === 'date' ? 50 : 35) : (payload.viewMode === 'date' ? 80 : 50),
          right: isMobile ? 50 : 80,
          top: isMobile ? 10 : 20,
          bottom: isMobile ? 35 : 50
        },
        xAxis: {
          type: 'value',
          name: '时间',
          nameLocation: 'middle',
          nameGap: isMobile ? 20 : 30,
          min: 0,
          max: 24,
          interval: 4,
          axisLabel: {
            formatter: (value: number) => `${value}:00`,
            color: theme.textColor
          },
          axisLine: {
            lineStyle: { color: theme.axisLineColor }
          },
          splitLine: {
            lineStyle: { color: theme.splitLineColor }
          }
        },
        yAxis: {
          type: 'category',
          data: yAxisData,
          axisLabel: {
            color: theme.textColor,
            fontSize: isMobile ? 9 : 11,
            formatter:
              isMobile && payload.viewMode === 'date'
                ? (value: string) => {
                    const parts = value.split('-');
                    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : value;
                  }
                : undefined
          },
          axisLine: {
            lineStyle: { color: theme.axisLineColor }
          },
          splitLine: {
            show: true,
            lineStyle: { color: theme.splitLineColor }
          }
        },
        visualMap: {
          type: 'continuous',
          min: 1,
          max: maxDuration,
          dimension: 2,
          orient: 'vertical',
          right: isMobile ? 2 : 10,
          top: 'center',
          itemHeight: isMobile ? 80 : 120,
          itemWidth: isMobile ? 12 : 20,
          text: ['长', '短'],
          textStyle: {
            color: theme.textColor,
            fontSize: isMobile ? 9 : 11
          },
          inRange: {
            color: theme.heatmapLevels
          },
          formatter: (value: number) => `${Math.round(value)} 分`
        },
        series: [
          {
            type: 'scatter',
            data: scatter,
            symbolSize(value: number[]) {
              const duration = Number(value?.[2] ?? 0);
              return Math.min(Math.max(duration / 10 + 8, 10), 24);
            },
            itemStyle: {
              opacity: 0.8
            },
            emphasis: {
              itemStyle: {
                opacity: 1,
                shadowBlur: 10,
                shadowColor: theme.accentColor
              }
            }
          }
        ]
      };
    }
  });

  const summary = $derived(snapshot?.scatter.summary ?? {
    totalSessions: 0,
    totalHours: 0,
    averageMinutes: 0
  });
  const hasData = $derived((snapshot?.scatter.summary.totalSessions ?? 0) > 0);

  $effect(() => {
    chartRuntime.setContainer(chartContainer);
  });

  $effect(() => {
    if (!snapshot || !hasData) {
      chartRuntime.setContainer(null);
      return;
    }
    chartRuntime.render({ snapshot, viewMode });
  });

  onDestroy(() => {
    chartRuntime.dispose();
  });
</script>

<div class="study-session-chart-container">
  {#if !hasData}
    <div class="chart-empty">
      <div class="empty-title">暂无学习会话</div>
      <div class="empty-description">当前筛选条件下，还没有达到统计阈值的学习记录。</div>
    </div>
  {:else}
    <div class="view-toggle">
      <span class="toggle-label">Y 轴显示:</span>
      <div class="toggle-buttons">
        <button
          class="toggle-btn"
          class:active={viewMode === 'date'}
          onclick={() => (viewMode = 'date')}
        >
          日期
        </button>
        <button
          class="toggle-btn"
          class:active={viewMode === 'weekday'}
          onclick={() => (viewMode = 'weekday')}
        >
          星期
        </button>
      </div>
    </div>

    <div class="chart-wrapper" bind:this={chartContainer}></div>

    <div class="stats-summary">
      <div class="summary-item">
        <span class="summary-label">有效会话</span>
        <span class="summary-value">{summary.totalSessions}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">总学习时长</span>
        <span class="summary-value">{summary.totalHours} 小时</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">平均时长</span>
        <span class="summary-value">{summary.averageMinutes} 分钟</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .study-session-chart-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 12px;
  }

  .chart-empty {
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

  .view-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toggle-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .toggle-buttons {
    display: flex;
    gap: 4px;
  }

  .toggle-btn {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 500;
    background: var(--background-primary);
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toggle-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .toggle-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent, white);
    border-color: var(--interactive-accent);
  }

  .chart-wrapper {
    flex: 1;
    min-height: 300px;
    width: 100%;
  }

  .stats-summary {
    display: flex;
    gap: 24px;
    padding: 12px 16px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .summary-label {
    font-size: 11px;
    color: var(--text-muted);
  }

  .summary-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-normal);
  }

  @media (max-width: 600px) {
    .stats-summary {
      flex-wrap: wrap;
      gap: 16px;
    }

    .summary-item {
      min-width: 80px;
    }
  }
</style>
