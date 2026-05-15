<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Platform } from 'obsidian';
  import type { MemoryCurveData } from '../../types/view-card-modal-types';
  import { getRatingColor } from '../../utils/memory-curve-utils';
  import { createGradient } from '../../utils/echarts-theme';
  import { createManagedChartRuntime } from '../../utils/chart-runtime';
  import { buildRetentionCurveOption } from './retentionCurveOption';
  import type { EChartsOption } from '../../utils/echarts-loader';

  interface Props {
    data: MemoryCurveData;
    height?: number;
  }

  type ChartPayload = {
    data: MemoryCurveData;
  };

  const isMobile = Platform.isMobile;

  let { data, height = 400 }: Props = $props();
  let chartContainer = $state<HTMLDivElement | null>(null);

  const chartRuntime = createManagedChartRuntime<ChartPayload>({
    buildOption(payload, theme): EChartsOption {
      const predictedSeriesData = payload.data.predicted.map((point) => [Math.floor(point.day), point.retrievability]);
      const actualSeriesData = payload.data.actual.map((point) => [Math.floor(point.day), point.retrievability]);
      const markPointData = payload.data.reviewMarkers.map((marker) => ({
        name: marker.rating === 1 ? '遗忘' : '复习',
        coord: [Math.floor(marker.day), marker.retrievability],
        value: marker.rating,
        itemStyle: {
          color: getRatingColor(marker.rating)
        }
      }));

      const maxDay = Math.max(
        ...payload.data.predicted.map((point) => Math.ceil(point.day)),
        ...payload.data.actual.map((point) => Math.ceil(point.day)),
        1
      );

      return buildRetentionCurveOption({
        colors: {
          ...theme,
          axisLabelColor: theme.textMuted
        },
        isMobile,
        xAxisData: Array.from({ length: maxDay + 1 }, (_, index) => index),
        axisXName: '天数',
        axisYName: '记忆保持率 (%)',
        tooltipFormatter(params: any) {
          if (!Array.isArray(params)) return '';
          let html = `<div style="padding: 12px; font-family: var(--font-interface);">`;
          html += `<div style="font-weight: 600; font-size: 16px; margin-bottom: 12px; color: var(--text-normal);">第 ${params[0].data[0].toFixed(1)} 天</div>`;
          params.forEach((param: any) => {
            if (param.value !== null && param.value !== undefined && Array.isArray(param.value)) {
              const colorMap: Record<string, string> = {
                '预测保持率': '#667eea',
                '实际保持率': '#4facfe',
                '风险阈值': '#f5576c'
              };
              const color = colorMap[param.seriesName] || param.color;
              html += `<div style="display: flex; align-items: center; margin: 8px 0; line-height: 1.4;">`;
              html += `<span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${color}; margin-right: 10px;"></span>`;
              html += `<span style="color: var(--text-normal); font-size: 14px;">${param.seriesName}:</span>`;
              html += `<strong style="margin-left: 8px; color: var(--text-accent); font-size: 15px;">${param.value[1].toFixed(1)}%</strong>`;
              html += `</div>`;
            }
          });
          html += `</div>`;
          return html;
        },
        series: [
          {
            name: '预测保持率',
            type: 'line',
            data: predictedSeriesData,
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
            },
            symbol: 'circle',
            symbolSize: 6,
            showSymbol: false,
            emphasis: {
              focus: 'series',
              scale: true,
              showSymbol: true
            }
          },
          {
            name: '实际保持率',
            type: 'line',
            data: actualSeriesData,
            smooth: true,
            lineStyle: {
              color: '#4facfe',
              width: 2,
              type: 'solid'
            },
            itemStyle: {
              color: '#4facfe'
            },
            symbol: 'circle',
            symbolSize: 6,
            emphasis: {
              focus: 'series',
              scale: true
            },
            markPoint: markPointData.length > 0 ? {
              data: markPointData,
              symbolSize: 10,
              label: {
                show: false
              }
            } : undefined
          },
          {
            name: '风险阈值',
            type: 'line',
            data: Array.from({ length: maxDay + 1 }, (_, index) => [index, 80]),
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
    }
  });

  $effect(() => {
    chartRuntime.setContainer(chartContainer);
  });

  $effect(() => {
    chartRuntime.render({ data });
  });

  onDestroy(() => {
    chartRuntime.dispose();
  });
</script>

<div bind:this={chartContainer} class="memory-curve-chart" style:height="{height}px"></div>

<style>
  .memory-curve-chart {
    width: 100%;
    min-height: 300px;
  }
</style>
