<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Platform } from 'obsidian';
  import type { DeckAnalyticsQuantitySnapshot } from '../../../data/analytics';
  import type { SupportedLanguage } from '../../../utils/i18n';
  import { formatDeckAnalyticsShortDate, type DeckAnalyticsText } from '../deck-analytics-text';
  import { createGradient } from '../../../utils/echarts-theme';
  import { createManagedChartRuntime } from '../../../utils/chart-runtime';
  import { getMobileChartTooltipPosition } from '../../../utils/chart-tooltip';
  import type { EChartsOption } from '../../../utils/echarts-loader';

  interface Props {
    snapshot: DeckAnalyticsQuantitySnapshot;
    uiText: DeckAnalyticsText;
    uiLanguage: SupportedLanguage;
    onRangeStep?: (step: number) => void;
  }

  type ChartPayload = {
    snapshot: DeckAnalyticsQuantitySnapshot;
    uiText: DeckAnalyticsText;
    uiLanguage: SupportedLanguage;
  };

  const isMobile = Platform.isMobile;

  let { snapshot, uiText, uiLanguage, onRangeStep }: Props = $props();
  let chartContainer = $state<HTMLDivElement | null>(null);

  function toShortDate(dateKey: string, language: SupportedLanguage): string {
    return formatDeckAnalyticsShortDate(new Date(dateKey), language);
  }

  const chartRuntime = createManagedChartRuntime<ChartPayload>({
    buildOption(payload, theme): EChartsOption {
      return {
        tooltip: {
          trigger: 'axis',
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          textStyle: {
            color: theme.textColor,
            fontSize: 14
          },
          extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
          confine: true,
          position: isMobile ? getMobileChartTooltipPosition : undefined
        },
        legend: {
          data: [
            payload.uiText.quantity.newCards,
            payload.uiText.quantity.learning,
            payload.uiText.quantity.review,
            payload.uiText.quantity.mastered,
            payload.uiText.quantity.masteryRate
          ],
          bottom: 20,
          textStyle: {
            color: theme.textColor,
            fontSize: 13
          },
          itemGap: 20,
          icon: 'circle'
        },
        grid: {
          left: isMobile ? '1%' : '2%',
          right: isMobile ? '2%' : '6%',
          bottom: isMobile ? '12%' : '15%',
          top: isMobile ? '8%' : '10%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: payload.snapshot.dates.map((dateKey) => toShortDate(dateKey, payload.uiLanguage)),
          name: payload.uiText.quantity.axisX,
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
          }
        },
        yAxis: [
          {
            type: 'value',
            name: payload.uiText.quantity.axisCount,
            position: 'left',
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
          {
            type: 'value',
            name: payload.uiText.quantity.axisRate,
            position: 'right',
            min: 0,
            max: 100,
            axisLine: {
              show: true,
              symbol: ['none', 'arrow'],
              symbolSize: [8, 10],
              lineStyle: { color: theme.axisLineColor }
            },
            axisLabel: {
              color: theme.textColor,
              fontSize: 12,
              formatter: '{value}%'
            },
            nameTextStyle: {
              color: theme.textColor,
              fontSize: 13
            },
            splitLine: {
              show: false
            }
          }
        ],
        series: [
          {
            name: payload.uiText.quantity.newCards,
            type: 'bar',
            stack: payload.uiText.quantity.stack,
            barWidth: '60%',
            itemStyle: {
              color: '#4facfe'
            },
            data: payload.snapshot.newCards
          },
          {
            name: payload.uiText.quantity.learning,
            type: 'bar',
            stack: payload.uiText.quantity.stack,
            itemStyle: {
              color: '#feca57'
            },
            data: payload.snapshot.learning
          },
          {
            name: payload.uiText.quantity.review,
            type: 'bar',
            stack: payload.uiText.quantity.stack,
            itemStyle: {
              color: '#ff9ff3'
            },
            data: payload.snapshot.review
          },
          {
            name: payload.uiText.quantity.mastered,
            type: 'bar',
            stack: payload.uiText.quantity.stack,
            itemStyle: {
              color: '#48dbfb'
            },
            data: payload.snapshot.mastered
          },
          {
            name: payload.uiText.quantity.masteryRate,
            type: 'line',
            yAxisIndex: 1,
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: {
              width: 3,
              color: '#667eea'
            },
            itemStyle: {
              color: '#667eea',
              borderColor: '#fff',
              borderWidth: 2
            },
            areaStyle: {
              color: createGradient('#667eea', 0.3, 0.05)
            },
            data: payload.snapshot.masteryRate
          }
        ]
      };
    },
    rangeInteraction: {
      enabled: () => !!onRangeStep,
      onWheelStep: (step) => onRangeStep?.(step),
      onPinchStep: (step) => onRangeStep?.(step)
    }
  });

  $effect(() => {
    chartRuntime.setContainer(chartContainer);
  });

  $effect(() => {
    chartRuntime.render({ snapshot, uiText, uiLanguage });
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
