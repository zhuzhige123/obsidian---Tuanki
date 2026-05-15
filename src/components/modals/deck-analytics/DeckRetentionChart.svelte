<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Platform } from 'obsidian';
  import type { DeckAnalyticsRetentionSnapshot } from '../../../data/analytics';
  import type { SupportedLanguage } from '../../../utils/i18n';
  import { createGradient } from '../../../utils/echarts-theme';
  import { createManagedChartRuntime } from '../../../utils/chart-runtime';
  import { getMobileChartTooltipPosition } from '../../../utils/chart-tooltip';
  import { buildRetentionCurveOption } from '../../charts/retentionCurveOption';
  import type { DeckAnalyticsText } from '../deck-analytics-text';

  interface Props {
    snapshot: DeckAnalyticsRetentionSnapshot;
    uiText: DeckAnalyticsText;
    uiLanguage: SupportedLanguage;
    onRangeStep?: (step: number) => void;
  }

  type ChartPayload = {
    snapshot: DeckAnalyticsRetentionSnapshot;
    uiText: DeckAnalyticsText;
    uiLanguage: SupportedLanguage;
  };

  const deckColors = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2', '#4F46E5'];
  const isMobile = Platform.isMobile;

  let { snapshot, uiText, uiLanguage, onRangeStep }: Props = $props();
  let chartContainer = $state<HTMLDivElement | null>(null);

  function formatDayTitle(dayValue: string | number, language: SupportedLanguage): string {
    const numericDay = typeof dayValue === 'number' ? dayValue : Number(dayValue);
    if (!Number.isFinite(numericDay)) {
      return String(dayValue);
    }
    if (numericDay === 0) {
      return language === 'en-US' ? 'Current' : '当前';
    }
    return language === 'en-US' ? `Day ${numericDay}` : `第 ${numericDay} 天`;
  }

  const chartRuntime = createManagedChartRuntime<ChartPayload>({
    buildOption(payload, theme) {
      const isMultiDeck = payload.snapshot.comparisonSeries.length > 1;
      const targetRetention = payload.snapshot.points[0]?.targetRetention ?? 90;

      if (isMultiDeck) {
        return buildRetentionCurveOption({
          colors: theme,
          isMobile,
          xAxisData: payload.snapshot.comparisonLabels,
          axisXName: payload.uiText.retention.axisX,
          axisYName: payload.uiText.retention.axisY,
          tooltipPosition: isMobile ? getMobileChartTooltipPosition : undefined,
          tooltipFormatter: (params: any) => {
            if (!Array.isArray(params) || params.length === 0) {
              return '';
            }

            const rows = params
              .filter((param: any) => typeof param.value === 'number')
              .map((param: any) => {
                const color = typeof param.color === 'string' ? param.color : theme.textColor;
                return `
                  <div style="display:flex;align-items:center;margin:6px 0;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px;"></span>
                    <span style="color:${theme.textColor};font-size:13px;">${param.seriesName}</span>
                    <strong style="margin-left:8px;color:${color};font-size:14px;">${param.value.toFixed(1)}%</strong>
                  </div>
                `;
              })
              .join('');

            return `
              <div style="padding:12px;">
                <div style="font-weight:600;font-size:16px;margin-bottom:12px;color:${theme.textColor};">
                  ${formatDayTitle(params[0].axisValue, payload.uiLanguage)}
                </div>
                ${rows}
              </div>
            `;
          },
          series: [
            ...payload.snapshot.comparisonSeries.map((series, index) => ({
              name: series.deckName,
              type: 'line',
              data: series.values,
              connectNulls: true,
              smooth: true,
              lineStyle: {
                color: deckColors[index % deckColors.length],
                width: 2
              },
              itemStyle: {
                color: deckColors[index % deckColors.length]
              },
              symbolSize: 4
            })),
            {
              name: payload.uiText.retention.targetRetention,
              type: 'line',
              data: payload.snapshot.comparisonLabels.map(() => targetRetention),
              lineStyle: {
                color: '#f5576c',
                width: 2,
                type: 'dashed'
              },
              itemStyle: {
                color: '#f5576c'
              },
              symbol: 'none'
            }
          ]
        });
      }

      return buildRetentionCurveOption({
        colors: theme,
        isMobile,
        xAxisData: payload.snapshot.points.map((point) => point.label),
        axisXName: payload.uiText.retention.axisX,
        axisYName: payload.uiText.retention.axisY,
        tooltipPosition: isMobile ? getMobileChartTooltipPosition : undefined,
        tooltipFormatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) {
            return '';
          }

          const dataIndex = typeof params[0]?.dataIndex === 'number' ? params[0].dataIndex : -1;
          const point = dataIndex >= 0 ? payload.snapshot.points[dataIndex] : null;
          const rows = params
            .filter((param: any) => typeof param.value === 'number')
            .map((param: any) => {
              const color = typeof param.color === 'string' ? param.color : theme.textColor;
              const sampleHint =
                point &&
                param.seriesName === payload.uiText.retention.firstReviewPassRate &&
                point.reviewSample > 0
                  ? `<div style="margin:-2px 0 8px 22px;color:${theme.textColor};opacity:0.75;font-size:12px;">${payload.uiText.misc.firstReviewSamples(point.reviewSample)}</div>`
                  : '';
              return `
                <div style="display:flex;align-items:center;margin:8px 0;line-height:1.4;">
                  <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};margin-right:10px;"></span>
                  <span style="color:${theme.textColor};font-size:14px;">${param.seriesName}:</span>
                  <strong style="margin-left:8px;color:${color};font-size:15px;">${param.value.toFixed(1)}%</strong>
                </div>
                ${sampleHint}
              `;
            })
            .join('');

          return `
            <div style="padding:12px;font-family:var(--font-interface);">
              <div style="font-weight:600;font-size:16px;margin-bottom:12px;color:${theme.textColor};">
                ${formatDayTitle(params[0].axisValue, payload.uiLanguage)}
              </div>
              ${rows}
            </div>
          `;
        },
        series: [
          {
            name: payload.uiText.retention.avgPredictedRecall,
            type: 'line',
            data: payload.snapshot.points.map((point) => point.avgRetrievability),
            connectNulls: true,
            smooth: true,
            lineStyle: {
              color: '#667eea',
              width: 3
            },
            itemStyle: {
              color: '#667eea'
            },
            areaStyle: {
              color: createGradient('#667eea', 0.3, 0.05)
            }
          },
          {
            name: payload.uiText.retention.firstReviewPassRate,
            type: 'line',
            data: payload.snapshot.points.map((point) => point.actualRetention),
            connectNulls: false,
            smooth: false,
            lineStyle: {
              color: '#4facfe',
              width: 2,
              type: 'solid'
            },
            itemStyle: {
              color: '#4facfe'
            },
            symbolSize: 7
          },
          {
            name: payload.uiText.retention.targetRetention,
            type: 'line',
            data: payload.snapshot.points.map((point) => point.targetRetention),
            lineStyle: {
              color: '#f5576c',
              width: 2,
              type: 'dashed'
            },
            itemStyle: {
              color: '#f5576c'
            },
            symbol: 'none',
            silent: true
          }
        ]
      });
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
    cursor: default;
    user-select: none;
    position: relative;
    box-shadow: none;
  }

  @media (max-width: 768px) {
    .chart-container {
      min-height: 320px;
      padding: 2px 0;
    }
  }
</style>
