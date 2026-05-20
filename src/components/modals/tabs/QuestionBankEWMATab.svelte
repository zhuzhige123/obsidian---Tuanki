<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Platform } from 'obsidian';
  import type { QuestionBankAnalyticsSnapshot } from '../../../utils/question-bank-analytics';
  import { createGradient } from '../../../utils/echarts-theme';
  import { createManagedChartRuntime } from '../../../utils/chart-runtime';
  import type { EChartsOption } from '../../../utils/echarts-loader';
  import { tr } from '../../../utils/i18n';

  interface Props {
    snapshot: QuestionBankAnalyticsSnapshot | null;
    isLoading: boolean;
  }

  type ChartPayload = {
    snapshot: QuestionBankAnalyticsSnapshot;
  };

  const isMobile = Platform.isMobile;

  let { snapshot, isLoading }: Props = $props();
  let chartContainer = $state<HTMLDivElement | null>(null);
  let t = $derived($tr);

  const chartRuntime = createManagedChartRuntime<ChartPayload>({
    buildOption(payload, theme): EChartsOption {
      const { dates, ewmaData, historicalData, confidenceData } = payload.snapshot.ewmaSeries;
      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          textStyle: { color: theme.textColor },
          formatter(params: Array<{ axisValue: string; color: string; seriesName: string; value: number }>) {
            let result = `<div style="font-weight:600;margin-bottom:4px;">${params[0]?.axisValue ?? ''}</div>`;
            for (const param of params) {
              const value = param.seriesName === t('study.questionBankUI.analyticsTab.confidence')
                ? param.value.toFixed(2)
                : `${param.value.toFixed(1)}%`;
              result += `<div style="margin:2px 0;">
                <span style="display:inline-block;width:10px;height:10px;background:${param.color};border-radius:50%;margin-right:8px;"></span>
                ${param.seriesName}: <span style="font-weight:600;">${value}</span>
              </div>`;
            }
            return result;
          }
        },
        legend: {
          show: true,
          type: isMobile ? 'scroll' : 'plain',
          top: isMobile ? 8 : 10,
          left: isMobile ? 8 : 'center',
          right: isMobile ? 8 : undefined,
          textStyle: {
            color: theme.textColor,
            fontSize: isMobile ? 11 : 12
          },
          itemGap: isMobile ? 10 : 20,
          itemWidth: isMobile ? 14 : 18,
          itemHeight: isMobile ? 8 : 10
        },
        grid: {
          left: isMobile ? '6%' : '2%',
          right: isMobile ? '6%' : '3%',
          bottom: isMobile ? '16%' : '15%',
          top: isMobile ? 96 : '15%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: dates,
          axisLine: {
            show: true,
            lineStyle: { color: theme.axisLineColor }
          },
          axisLabel: {
            color: theme.textMuted,
            fontSize: 11,
            rotate: 45
          },
          axisTick: { show: false }
        },
        yAxis: [
          {
            type: 'value',
            name: isMobile ? '' : t('study.questionBankUI.analyticsTab.accuracyPercent'),
            nameTextStyle: { color: theme.textMuted, fontSize: 12 },
            min: 0,
            max: 100,
            axisLine: {
              show: true,
              lineStyle: { color: theme.axisLineColor }
            },
            axisLabel: {
              color: theme.textMuted,
              fontSize: 11,
              formatter: '{value}%'
            },
            splitLine: {
              lineStyle: { color: theme.splitLineColor, type: 'dashed', opacity: 0.6 }
            }
          },
          {
            type: 'value',
            name: isMobile ? '' : t('study.questionBankUI.analyticsTab.confidence'),
            nameTextStyle: { color: theme.textMuted, fontSize: 12 },
            min: 0,
            max: 1,
            axisLine: {
              show: true,
              lineStyle: { color: theme.axisLineColor }
            },
            axisLabel: {
              color: theme.textMuted,
              fontSize: 11
            },
            splitLine: { show: false }
          }
        ],
        series: [
          {
            name: t('study.questionBankUI.analyticsTab.ewmaMastery'),
            type: 'line',
            data: ewmaData,
            smooth: true,
            lineStyle: { color: theme.accentColor, width: 3 },
            itemStyle: { color: theme.accentColor, borderWidth: 2 },
            symbolSize: 6,
            areaStyle: {
              color: createGradient(theme.accentColor, 0.15, 0.03)
            }
          },
          {
            name: t('study.questionBankUI.analyticsTab.historicalAverage'),
            type: 'line',
            data: historicalData,
            smooth: true,
            lineStyle: { color: theme.textMuted, width: 2, type: 'dashed' },
            itemStyle: { color: theme.textMuted },
            symbolSize: 4
          },
          {
            name: t('study.questionBankUI.analyticsTab.targetLine'),
            type: 'line',
            data: dates.map(() => 80),
            lineStyle: { color: theme.success, width: 2, type: 'solid' },
            itemStyle: { color: theme.success },
            symbol: 'none'
          },
          {
            name: t('study.questionBankUI.analyticsTab.confidence'),
            type: 'line',
            yAxisIndex: 1,
            data: confidenceData,
            smooth: true,
            lineStyle: { color: theme.warning, width: 2 },
            itemStyle: { color: theme.warning },
            symbolSize: 4
          }
        ]
      };
    }
  });

  $effect(() => {
    chartRuntime.setContainer(chartContainer);
  });

  $effect(() => {
    if (snapshot) {
      chartRuntime.render({ snapshot });
    }
  });

  onDestroy(() => {
    chartRuntime.dispose();
  });
</script>

<div class="ewma-tab">
  {#if isLoading}
    <div class="empty-state">{t('study.questionBankUI.analyticsTab.loadingData')}</div>
  {:else if !snapshot || snapshot.ewmaSeries.dates.length === 0}
    <div class="empty-state">{t('study.questionBankUI.analyticsTab.noRealData')}</div>
  {:else}
    <div class="chart-container">
      <div bind:this={chartContainer} class="chart"></div>
    </div>
  {/if}
</div>

<style>
  .ewma-tab {
    padding: 16px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .chart-container {
    background: var(--background-secondary);
    border-radius: 10px;
    padding: 12px 6px 12px 2px;
    border: 1px solid var(--background-modifier-border);
    flex: 1;
    min-height: 500px;
    display: flex;
    flex-direction: column;
  }

  .chart {
    width: 100%;
    flex: 1;
    min-height: 450px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    border: 1px dashed var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-secondary);
    min-height: 320px;
  }

  @media (max-width: 768px) {
    .ewma-tab {
      padding: 12px 10px 14px;
    }

    .chart-container {
      min-height: 420px;
      padding: 8px 4px 8px 0;
    }

    .chart {
      min-height: 380px;
    }
  }
</style>
