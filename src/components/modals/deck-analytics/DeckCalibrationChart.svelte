<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Platform } from 'obsidian';
  import type { DeckAnalyticsCalibrationSnapshot } from '../../../data/analytics';
  import type { SupportedLanguage } from '../../../utils/i18n';
  import { formatDeckAnalyticsShortDate, type DeckAnalyticsText } from '../deck-analytics-text';
  import { createManagedChartRuntime } from '../../../utils/chart-runtime';
  import { getMobileChartTooltipPosition } from '../../../utils/chart-tooltip';
  import type { EChartsOption } from '../../../utils/echarts-loader';

  interface Props {
    snapshot: DeckAnalyticsCalibrationSnapshot;
    uiText: DeckAnalyticsText;
    uiLanguage: SupportedLanguage;
    onRangeStep?: (step: number) => void;
  }

  type ChartPayload = {
    snapshot: DeckAnalyticsCalibrationSnapshot;
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
          textStyle: { color: theme.textColor, fontSize: 14 },
          extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
          confine: true,
          position: isMobile ? getMobileChartTooltipPosition : undefined
        },
        legend: {
          data: [payload.uiText.calibration.againRate, payload.uiText.calibration.passRate],
          bottom: 20,
          textStyle: { color: theme.textColor, fontSize: 13 },
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
          name: payload.uiText.calibration.axisX,
          nameLocation: 'middle',
          nameGap: 30,
          axisLine: {
            show: true,
            symbol: ['none', 'arrow'],
            symbolSize: [8, 10],
            lineStyle: { color: theme.axisLineColor }
          },
          axisLabel: { color: theme.textColor, fontSize: 12, rotate: 45 },
          nameTextStyle: { color: theme.textColor, fontSize: 13 }
        },
        yAxis: {
          type: 'value',
          name: payload.uiText.calibration.axisY,
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
          nameTextStyle: { color: theme.textColor, fontSize: 13 },
          splitLine: { lineStyle: { color: theme.splitLineColor, type: 'dashed' } }
        },
        series: [
          {
            name: payload.uiText.calibration.againRate,
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 2, color: '#f5576c' },
            itemStyle: { color: '#f5576c' },
            data: payload.snapshot.againRate
          },
          {
            name: payload.uiText.calibration.passRate,
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 2, color: '#26a641' },
            itemStyle: { color: '#26a641' },
            data: payload.snapshot.passRate
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

<div class="calibration-layout">
  <div class="calibration-section">
    <h4 class="calibration-section-title">{uiText.calibration.performanceTitle}</h4>
    <p class="calibration-section-desc">{uiText.calibration.performanceDesc}</p>
    <div bind:this={chartContainer} class="chart-container"></div>
  </div>
</div>

<style>
  .calibration-layout {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .calibration-section-title {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .calibration-section-desc {
    margin: 0 0 0.75rem;
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--text-muted);
  }

  .chart-container {
    width: 100%;
    min-height: 420px;
    border-radius: 10px;
    background: var(--background-primary);
    touch-action: pan-y;
  }

  @media (max-width: 768px) {
    .chart-container {
      min-height: 300px;
    }
  }
</style>
