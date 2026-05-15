<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Platform } from 'obsidian';
  import type { DeckAnalyticsDifficultyPoint } from '../../../data/analytics';
  import type { DeckAnalyticsText } from '../deck-analytics-text';
  import { createManagedChartRuntime } from '../../../utils/chart-runtime';
  import { getMobileChartTooltipPosition } from '../../../utils/chart-tooltip';
  import type { EChartsOption } from '../../../utils/echarts-loader';

  interface Props {
    points: DeckAnalyticsDifficultyPoint[];
    uiText: DeckAnalyticsText;
  }

  type ChartPayload = {
    points: DeckAnalyticsDifficultyPoint[];
    uiText: DeckAnalyticsText;
  };

  const isMobile = Platform.isMobile;

  let { points, uiText }: Props = $props();
  let chartContainer = $state<HTMLDivElement | null>(null);

  const chartRuntime = createManagedChartRuntime<ChartPayload>({
    buildOption(payload, theme): EChartsOption {
      return {
        tooltip: {
          trigger: 'item',
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          textStyle: {
            color: theme.textColor,
            fontSize: 14
          },
          extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
          confine: true,
          position: isMobile ? getMobileChartTooltipPosition : undefined,
          formatter(params: any) {
            const item = payload.points[params.dataIndex];
            if (!item) {
              return '';
            }
            return `
              <div style="padding:12px;font-family:var(--font-interface);">
                <div style="font-weight:600;font-size:16px;margin-bottom:12px;color:${theme.textColor};">${item.tag}</div>
                <div style="display:flex;align-items:center;margin:8px 0;">
                  <span style="color:${theme.textColor};font-size:14px;">${payload.uiText.difficulty.axisDifficulty}:</span>
                  <strong style="margin-left:8px;color:var(--interactive-accent);font-size:15px;">${item.difficulty.toFixed(1)}</strong>
                </div>
                <div style="display:flex;align-items:center;margin:8px 0;">
                  <span style="color:${theme.textColor};font-size:14px;">${payload.uiText.difficulty.count}:</span>
                  <strong style="margin-left:8px;color:var(--interactive-accent);font-size:15px;">${item.count}${payload.uiText.difficulty.cardsUnit}</strong>
                </div>
              </div>
            `;
          }
        },
        grid: {
          left: isMobile ? 20 : 32,
          right: isMobile ? 10 : 40,
          top: isMobile ? 25 : 40,
          bottom: isMobile ? 60 : 80,
          containLabel: true
        },
        xAxis: {
          type: 'value',
          name: payload.uiText.difficulty.axisCount,
          nameLocation: 'middle',
          nameGap: 30,
          axisLine: {
            show: true,
            symbol: ['none', 'arrow'],
            symbolSize: [8, 10],
            lineStyle: { color: theme.axisLineColor }
          },
          axisLabel: {
            color: theme.textColor,
            fontSize: 12
          },
          nameTextStyle: {
            color: theme.textColor,
            fontSize: 13
          },
          splitLine: {
            lineStyle: {
              color: theme.splitLineColor,
              type: 'dashed'
            }
          }
        },
        yAxis: {
          type: 'value',
          name: payload.uiText.difficulty.axisDifficulty,
          min: 0,
          max: 10,
          axisLine: {
            show: true,
            symbol: ['none', 'arrow'],
            symbolSize: [8, 10],
            lineStyle: { color: theme.axisLineColor }
          },
          axisLabel: {
            color: theme.textColor,
            fontSize: 12
          },
          nameTextStyle: {
            color: theme.textColor,
            fontSize: 13
          },
          splitLine: {
            lineStyle: {
              color: theme.splitLineColor,
              type: 'dashed'
            }
          }
        },
        series: [
          {
            type: 'scatter',
            symbolSize(_val: any, params: any) {
              return Math.sqrt(payload.points[params.dataIndex]?.count || 0) * 8;
            },
            data: payload.points.map((item) => [item.count, item.difficulty]),
            itemStyle: {
              color(params: any) {
                const difficulty = payload.points[params.dataIndex]?.difficulty || 0;
                if (difficulty < 4) return '#4facfe';
                if (difficulty < 7) return '#feca57';
                return '#f5576c';
              },
              opacity: 0.8
            },
            emphasis: {
              itemStyle: {
                opacity: 1,
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            },
            label: {
              show: true,
              position: 'top',
              formatter(params: any) {
                return payload.points[params.dataIndex]?.tag || '';
              },
              fontSize: 11,
              color: theme.textColor,
              overflow: 'truncate',
              width: 80
            },
            labelLayout: {
              hideOverlap: true,
              moveOverlap: 'shiftY'
            }
          }
        ]
      };
    }
  });

  $effect(() => {
    chartRuntime.setContainer(chartContainer);
  });

  $effect(() => {
    chartRuntime.render({ points, uiText });
  });

  onDestroy(() => {
    chartRuntime.dispose();
  });
</script>

<div bind:this={chartContainer} class="chart-container"></div>

<style>
  .chart-container {
    flex: 1;
    width: 100%;
    min-height: 500px;
    border-radius: 10px;
    background: var(--background-primary);
    touch-action: pan-y;
    border: none;
    padding: 4px 0;
  }

  @media (max-width: 768px) {
    .chart-container {
      min-height: 320px;
      padding: 2px 0;
    }
  }
</style>
