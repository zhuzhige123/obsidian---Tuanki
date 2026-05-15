<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Platform } from 'obsidian';
  import type { DeckAnalyticsForecastPoint } from '../../../data/analytics';
  import { LoadStatus } from '../../../services/LoadBalanceManager';
  import type { SupportedLanguage } from '../../../utils/i18n';
  import { formatDeckAnalyticsShortDate, type DeckAnalyticsText } from '../deck-analytics-text';
  import { createManagedChartRuntime } from '../../../utils/chart-runtime';
  import { getMobileChartTooltipPosition } from '../../../utils/chart-tooltip';
  import type { EChartsOption } from '../../../utils/echarts-loader';

  interface Props {
    forecast: DeckAnalyticsForecastPoint[];
    dailyCapacity: number;
    uiText: DeckAnalyticsText;
    uiLanguage: SupportedLanguage;
    onRangeStep?: (step: number) => void;
  }

  type ChartPayload = {
    forecast: DeckAnalyticsForecastPoint[];
    dailyCapacity: number;
    uiText: DeckAnalyticsText;
    uiLanguage: SupportedLanguage;
  };

  const isMobile = Platform.isMobile;

  let { forecast, dailyCapacity, uiText, uiLanguage, onRangeStep }: Props = $props();
  let chartContainer = $state<HTMLDivElement | null>(null);

  function formatDateLabel(dateKey: string, language: SupportedLanguage): string {
    return formatDeckAnalyticsShortDate(new Date(dateKey), language);
  }

  function getStatusColor(status: LoadStatus, themeColors: any): string {
    const palette = themeColors.loadStatusColors;
    if (status === 'low') return palette.low;
    if (status === 'high') return palette.high;
    if (status === 'overload') return palette.overload;
    return palette.normal;
  }

  const chartRuntime = createManagedChartRuntime<ChartPayload>({
    buildOption(payload, theme): EChartsOption {
      const dates = payload.forecast.map((point) => formatDateLabel(point.date, payload.uiLanguage));
      const loads = payload.forecast.map((point) => point.total);

      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          textStyle: { color: theme.textColor },
          confine: true,
          position: isMobile ? getMobileChartTooltipPosition : undefined,
          formatter(params: any) {
            const index = params[0]?.dataIndex ?? 0;
            const point = payload.forecast[index];
            if (!point) {
              return '';
            }
            const statusColor = getStatusColor(point.status, theme);
            const statusLabel =
              point.status === 'low'
                ? payload.uiText.load.low
                : point.status === 'high'
                  ? payload.uiText.load.high
                  : point.status === 'overload'
                    ? payload.uiText.load.overload
                    : payload.uiText.load.normal;
            return `
              <div style="padding:8px;">
                <div style="font-weight:600;margin-bottom:4px;">${new Date(point.date).toLocaleDateString(payload.uiLanguage, { weekday: 'short', month: 'long', day: 'numeric' })}</div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="display:inline-block;width:10px;height:10px;background:${statusColor};border-radius:50%;"></span>
                  <span>${payload.uiText.load.cardsLine(point.total || 0)}</span>
                </div>
                <div style="color:${statusColor};margin-top:4px;">${statusLabel}</div>
                <div style="color:#999;font-size:0.9em;margin-top:4px;">${payload.uiText.load.capacityLine(payload.dailyCapacity)}</div>
              </div>
            `;
          }
        },
        grid: {
          top: isMobile ? 25 : 40,
          right: isMobile ? 8 : 20,
          bottom: isMobile ? 40 : 60,
          left: isMobile ? 16 : 28,
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: dates,
          axisLine: {
            show: true,
            symbol: ['none', 'arrow'],
            symbolSize: [8, 10],
            lineStyle: { color: theme.axisLineColor }
          },
          axisLabel: { color: theme.textColor, rotate: 45 }
        },
        yAxis: {
          type: 'value',
          name: payload.uiText.load.axisY,
          nameTextStyle: { color: theme.textColor },
          axisLine: {
            show: true,
            symbol: ['none', 'arrow'],
            symbolSize: [8, 10],
            lineStyle: { color: theme.axisLineColor }
          },
          axisLabel: { color: theme.textColor },
          splitLine: { lineStyle: { color: theme.splitLineColor } }
        },
        series: [
          {
            name: payload.uiText.load.dailyLoad,
            type: 'bar',
            data: loads,
            itemStyle: {
              color(params: any) {
                return getStatusColor(payload.forecast[params.dataIndex]?.status || LoadStatus.NORMAL, theme);
              }
            },
            markLine: {
              data: [
                {
                  yAxis: payload.dailyCapacity,
                  label: {
                    show: true,
                    formatter: payload.uiText.load.capacity,
                    color: theme.textColor
                  },
                  lineStyle: {
                    color: '#ff6b6b',
                    type: 'dashed'
                  }
                }
              ]
            }
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
    chartRuntime.render({ forecast, dailyCapacity, uiText, uiLanguage });
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
