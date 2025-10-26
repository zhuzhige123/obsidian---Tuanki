<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  // @ts-ignore - ECharts will be available after npm install echarts
  import * as echarts from 'echarts';
  import type { MemoryCurveData, TimeRange } from '../../types/view-card-modal-types';
  import { getRatingColor } from '../../utils/memory-curve-utils';

  interface Props {
    /** 曲线数据 */
    data: MemoryCurveData;
    /** 时间范围 */
    timeRange?: TimeRange;
    /** 图表高度 */
    height?: number;
  }

  let { data, timeRange = '30d', height = 400 }: Props = $props();

  let chartContainer: HTMLDivElement;
  let chartInstance: echarts.ECharts | null = null;

  // 监听主题变化
  function getThemeColors() {
    const style = getComputedStyle(document.body);
    return {
      textColor: style.getPropertyValue('--text-normal') || '#000',
      mutedColor: style.getPropertyValue('--text-muted') || '#666',
      accentColor: style.getPropertyValue('--interactive-accent') || '#3b82f6',
      bgColor: style.getPropertyValue('--background-primary') || '#fff',
      borderColor: style.getPropertyValue('--background-modifier-border') || '#ddd'
    };
  }

  // 初始化图表
  function initChart() {
    if (!chartContainer) return;

    chartInstance = echarts.init(chartContainer);
    updateChart();
  }

  // 更新图表
  function updateChart() {
    if (!chartInstance) return;

    const colors = getThemeColors();
    
    // 预测曲线数据
    const predictedSeriesData = data.predicted.map(point => [point.day, point.retrievability]);
    
    // 实际曲线数据
    const actualSeriesData = data.actual.map(point => [point.day, point.retrievability]);
    
    // 复习标记点
    const markPointData = data.reviewMarkers.map(marker => ({
      name: marker.rating === 1 ? '遗忘' : '复习',
      coord: [marker.day, marker.retrievability],
      value: marker.rating,
      itemStyle: {
        color: getRatingColor(marker.rating)
      }
    }));

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.bgColor,
        borderColor: colors.borderColor,
        textStyle: {
          color: colors.textColor
        },
        formatter: (params: any) => {
          if (!Array.isArray(params)) return '';
          let result = `<div style="padding: 4px;">`;
          result += `<div style="margin-bottom: 4px;"><strong>第 ${params[0].data[0].toFixed(1)} 天</strong></div>`;
          params.forEach((param: any) => {
            const marker = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${param.color};margin-right:5px;"></span>`;
            result += `<div>${marker}${param.seriesName}: ${param.data[1].toFixed(1)}%</div>`;
          });
          result += `</div>`;
          return result;
        }
      },
      legend: {
        data: ['预测曲线', '实际曲线'],
        textStyle: {
          color: colors.textColor
        },
        top: 10
      },
      grid: {
        left: '50px',
        right: '30px',
        bottom: '50px',
        top: '50px',
        containLabel: false
      },
      xAxis: {
        type: 'value',
        name: '天数',
        nameTextStyle: {
          color: colors.textColor
        },
        axisLine: {
          lineStyle: { color: colors.borderColor }
        },
        axisLabel: {
          color: colors.mutedColor
        },
        splitLine: {
          lineStyle: { color: colors.borderColor, type: 'dashed' }
        }
      },
      yAxis: {
        type: 'value',
        name: '可提取性 (%)',
        min: 0,
        max: 100,
        nameTextStyle: {
          color: colors.textColor
        },
        axisLine: {
          lineStyle: { color: colors.borderColor }
        },
        axisLabel: {
          color: colors.mutedColor,
          formatter: '{value}%'
        },
        splitLine: {
          lineStyle: { color: colors.borderColor, type: 'dashed' }
        }
      },
      series: [
        {
          name: '预测曲线',
          type: 'line',
          data: predictedSeriesData,
          smooth: true,
          lineStyle: {
            color: '#3b82f6',
            type: 'dashed',
            width: 2
          },
          itemStyle: {
            color: '#3b82f6'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59, 130, 246, 0.2)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0)' }
              ]
            }
          },
          symbol: 'none',
          emphasis: {
            focus: 'series'
          }
        },
        {
          name: '实际曲线',
          type: 'line',
          data: actualSeriesData,
          smooth: false,
          lineStyle: {
            color: '#22c55e',
            width: 3
          },
          itemStyle: {
            color: '#22c55e'
          },
          symbolSize: 8,
          emphasis: {
            focus: 'series'
          },
          markPoint: markPointData.length > 0 ? {
            data: markPointData,
            symbolSize: 10,
            label: {
              show: false
            }
          } : undefined
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          start: 0,
          end: 100
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          height: 20,
          bottom: 10,
          borderColor: colors.borderColor,
          fillerColor: 'rgba(59, 130, 246, 0.1)',
          handleStyle: {
            color: colors.accentColor
          },
          textStyle: {
            color: colors.mutedColor
          }
        }
      ]
    };

    chartInstance.setOption(option);
  }

  // 处理窗口resize
  function handleResize() {
    if (chartInstance) {
      chartInstance.resize();
    }
  }

  onMount(() => {
    initChart();
    window.addEventListener('resize', handleResize);
    
    // 监听主题变化
    const observer = new MutationObserver(() => {
      updateChart();
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      observer.disconnect();
    };
  });

  // 响应式更新数据
  $effect(() => {
    if (data && chartInstance) {
      updateChart();
    }
  });

  onDestroy(() => {
    window.removeEventListener('resize', handleResize);
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
    }
  });
</script>

<div 
  bind:this={chartContainer} 
  class="memory-curve-chart"
  style:height="{height}px"
></div>

<style>
  .memory-curve-chart {
    width: 100%;
    min-height: 300px;
  }
</style>

