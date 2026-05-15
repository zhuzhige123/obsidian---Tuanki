<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Platform } from 'obsidian';
  import type { DeckAnalyticsTimingSnapshot } from '../../../data/analytics';
  import type { SupportedLanguage } from '../../../utils/i18n';
  import { formatDeckAnalyticsShortDate, type DeckAnalyticsText } from '../deck-analytics-text';
  import { createManagedChartRuntime } from '../../../utils/chart-runtime';
  import { getMobileChartTooltipPosition } from '../../../utils/chart-tooltip';
  import type { EChartsOption } from '../../../utils/echarts-loader';

  interface Props {
    snapshot: DeckAnalyticsTimingSnapshot;
    uiText: DeckAnalyticsText;
    uiLanguage: SupportedLanguage;
    onRangeStep?: (step: number) => void;
  }

  type ChartPayload = {
    snapshot: DeckAnalyticsTimingSnapshot;
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
          data: [payload.uiText.timing.early, payload.uiText.timing.onTime, payload.uiText.timing.late],
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
          right: isMobile ? '2%' : '4%',
          bottom: isMobile ? '12%' : '15%',
          top: isMobile ? '8%' : '10%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: payload.snapshot.dates.map((dateKey) => toShortDate(dateKey, payload.uiLanguage)),
          name: payload.uiText.timing.axisX,
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
            fontSize: 12,
            rotate: 45
          },
          nameTextStyle: {
            color: theme.textColor,
            fontSize: 13
          }
        },
        yAxis: {
          type: 'value',
          name: payload.uiText.timing.axisY,
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
            lineStyle: {
              color: theme.splitLineColor,
              type: 'dashed'
            }
          }
        },
        series: [
          {
            name: payload.uiText.timing.early,
            type: 'bar',
            stack: 'total',
            barWidth: '60%',
            itemStyle: {
              color: '#feca57'
            },
            data: payload.snapshot.early
          },
          {
            name: payload.uiText.timing.onTime,
            type: 'bar',
            stack: 'total',
            itemStyle: {
              color: '#26a641'
            },
            emphasis: {
              itemStyle: {
                color: '#39d353'
              }
            },
            data: payload.snapshot.ontime
          },
          {
            name: payload.uiText.timing.late,
            type: 'bar',
            stack: 'total',
            itemStyle: {
              color: '#f5576c'
            },
            data: payload.snapshot.late
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
