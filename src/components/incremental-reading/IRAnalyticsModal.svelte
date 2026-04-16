<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Menu, Platform } from 'obsidian';
  import type AnkiObsidianPlugin from '../../main';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import * as echarts from 'echarts/core';
  import {
    TooltipComponent,
    GridComponent,
    LegendComponent
  } from 'echarts/components';
  import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
  import { CanvasRenderer } from 'echarts/renderers';
  import {
    IRAnalyticsService,
    type IRAnalyticsMode,
    type IRAnalyticsSnapshot
  } from '../../services/incremental-reading/IRAnalyticsService';
  import { logger } from '../../utils/logger';
  import { bindPinchRangeGesture } from '../../utils/pinch-range-gesture';

  echarts.use([
    TooltipComponent,
    GridComponent,
    LegendComponent,
    BarChart,
    LineChart,
    ScatterChart,
    CanvasRenderer
  ]);

  interface Props {
    plugin: AnkiObsidianPlugin;
  }

  let {
    plugin
  }: Props = $props();

  const quickRangeOptions = [
    { value: 7, label: '最近 7 天' },
    { value: 14, label: '最近 14 天' },
    { value: 30, label: '最近 30 天' },
    { value: 60, label: '最近 60 天' },
    { value: 90, label: '最近 90 天' }
  ];

  type AnalyticsTab = 'activity' | 'quantity' | 'timing' | 'difficulty' | 'forecast';

  let activeTab = $state<AnalyticsTab>('activity');
  let selectedDays = $state(30);
  let selectedMode = $state<IRAnalyticsMode>('overall');
  let selectedSelectionKey = $state('');
  let chartRef: HTMLDivElement | null = $state(null);
  let chart: echarts.ECharts | null = null;
  let analyticsService = $state<IRAnalyticsService | null>(null);
  let snapshot = $state<IRAnalyticsSnapshot | null>(null);
  let isLoading = $state(false);
  let loadError = $state('');
  let themeObserver: MutationObserver | null = null;
  let loadRequestId = 0;
  let wheelThrottle = false;
  let pinchGestureCleanup: (() => void) | null = null;
  const WHEEL_THROTTLE_MS = 180;

  const isMobile = Platform.isMobile;

  function getThemeColors() {
    const isDark = document.body.classList.contains('theme-dark');
    return {
      textColor: isDark ? '#e5e7eb' : '#24323f',
      subTextColor: isDark ? '#9ca3af' : '#6b7280',
      axisLineColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.18)',
      splitLineColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      tooltipBg: isDark ? '#15191f' : '#ffffff',
      tooltipBorder: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
      series: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6']
    };
  }

  async function getAnalyticsService(): Promise<IRAnalyticsService> {
    if (!analyticsService) {
      analyticsService = new IRAnalyticsService(plugin.app);
      await analyticsService.initialize();
    }
    return analyticsService;
  }

  async function loadAnalytics(): Promise<void> {
    const requestId = ++loadRequestId;
    disposeChart();
    isLoading = true;
    loadError = '';
    try {
      const service = await getAnalyticsService();
      let nextSnapshot = await service.getSnapshot({
        mode: selectedMode,
        selectionKey: selectedSelectionKey || undefined,
        days: selectedDays
      });

      if (selectedSelectionKey && !nextSnapshot.scopeKey) {
        selectedSelectionKey = '';
        nextSnapshot = await service.getSnapshot({
          mode: selectedMode,
          days: selectedDays
        });
      }

      if (requestId !== loadRequestId) return;
      snapshot = nextSnapshot;
    } catch (error) {
      if (requestId !== loadRequestId) return;
      logger.error('[IRAnalyticsModal] 加载分析数据失败:', error);
      loadError = '分析数据加载失败';
      snapshot = null;
    } finally {
      if (requestId !== loadRequestId) return;
      isLoading = false;
    }
  }

  function disposeChart(): void {
    chart?.dispose();
    chart = null;
  }

  function ensureChart(): echarts.ECharts | null {
    if (!chartRef) return null;
    if (chart && chart.getDom() !== chartRef) {
      disposeChart();
    }
    if (!chart) {
      chart = echarts.init(chartRef);
    }
    return chart;
  }

  function buildActivityOption(data: IRAnalyticsSnapshot): echarts.EChartsCoreOption {
    const colors = getThemeColors();
    return {
      color: [colors.series[0], colors.series[1], colors.series[3]],
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: colors.textColor },
        confine: true
      },
      legend: {
        top: 6,
        left: 'center',
        textStyle: { color: colors.subTextColor }
      },
      grid: {
        left: isMobile ? 34 : 44,
        right: isMobile ? 12 : 20,
        top: 62,
        bottom: 28
      },
      xAxis: {
        type: 'category',
        data: data.activityTrend.map(point => point.label),
        axisLine: { lineStyle: { color: colors.axisLineColor } },
        axisLabel: { color: colors.subTextColor }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: colors.subTextColor },
        splitLine: { lineStyle: { color: colors.splitLineColor, type: 'dashed' } }
      },
      series: [
        {
          name: '新增材料',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: data.activityTrend.map(point => point.createdCount)
        },
        {
          name: '发生交互',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: data.activityTrend.map(point => point.interactedCount)
        },
        {
          name: '退出主队列',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: data.activityTrend.map(point => point.completedCount)
        }
      ]
    };
  }

  function buildQuantityOption(data: IRAnalyticsSnapshot): echarts.EChartsCoreOption {
    const colors = getThemeColors();
    return {
      color: [colors.series[0], colors.series[1], colors.series[4]],
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: colors.textColor },
        confine: true
      },
      legend: {
        top: 6,
        left: 'center',
        textStyle: { color: colors.subTextColor }
      },
      grid: {
        left: isMobile ? 34 : 44,
        right: isMobile ? 12 : 20,
        top: 62,
        bottom: 28
      },
      xAxis: {
        type: 'category',
        data: data.quantityTrend.map(point => point.label),
        axisLine: { lineStyle: { color: colors.axisLineColor } },
        axisLabel: { color: colors.subTextColor }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: colors.subTextColor },
        splitLine: { lineStyle: { color: colors.splitLineColor, type: 'dashed' } }
      },
      series: [
        {
          name: '累计材料',
          type: 'line',
          smooth: true,
          data: data.quantityTrend.map(point => point.totalCount)
        },
        {
          name: '活跃材料',
          type: 'line',
          smooth: true,
          areaStyle: { opacity: 0.12 },
          data: data.quantityTrend.map(point => point.activeCount)
        },
        {
          name: '已退出主队列',
          type: 'line',
          smooth: true,
          data: data.quantityTrend.map(point => point.closedCount)
        }
      ]
    };
  }

  function buildTimingOption(data: IRAnalyticsSnapshot): echarts.EChartsCoreOption {
    const colors = getThemeColors();
    return {
      color: data.timingBuckets.map(bucket => {
        if (bucket.label.startsWith('Overdue')) return colors.series[3]!;
        if (bucket.label === 'Due today') return colors.series[2]!;
        if (bucket.label === 'Unscheduled') return colors.series[4]!;
        return colors.series[0]!;
      }),
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: colors.textColor },
        confine: true
      },
      grid: {
        left: isMobile ? 42 : 48,
        right: isMobile ? 10 : 20,
        top: 24,
        bottom: 76
      },
      xAxis: {
        type: 'category',
        data: data.timingBuckets.map(bucket => bucket.label),
        axisLabel: {
          color: colors.subTextColor,
          interval: 0,
          rotate: isMobile ? 32 : 20
        },
        axisLine: { lineStyle: { color: colors.axisLineColor } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: colors.subTextColor },
        splitLine: { lineStyle: { color: colors.splitLineColor, type: 'dashed' } }
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 34,
          data: data.timingBuckets.map(bucket => bucket.count),
          itemStyle: {
            borderRadius: [6, 6, 0, 0]
          }
        }
      ]
    };
  }

  function buildDifficultyOption(data: IRAnalyticsSnapshot): echarts.EChartsCoreOption {
    const colors = getThemeColors();
    const shouldShowPriorityLabel = (value: number[]) => {
      const effectivePriority = Number(value?.[0] ?? 0);
      const urgency = Number(value?.[1] ?? 0);
      return effectivePriority >= 5 && urgency >= 5;
    };
    return {
      color: [colors.series[4]],
      tooltip: {
        trigger: 'item',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: colors.textColor },
        confine: true,
        formatter: (params: any) => {
          const point = params.data as [number, number, number, string, number, number, number, number, number, number, number];
          const [, , , label, itemCount, dueCount, overdueCount, readingHours, cardsCreated, extracts, notesWritten] = point;
          return [
            `<strong>${label}</strong>`,
            `有效优先级: ${point[0]}`,
            `调度紧迫度: ${point[1]}`,
            `活跃项: ${itemCount} / 到期: ${dueCount} / 逾期: ${overdueCount}`,
            `阅读时长: ${readingHours} 小时`,
            `制卡: ${cardsCreated} / 摘录: ${extracts} / 笔记: ${notesWritten}`
          ].join('<br>');
        }
      },
      grid: {
        left: isMobile ? 40 : 52,
        right: isMobile ? 10 : 20,
        top: 24,
        bottom: 44
      },
      xAxis: {
        type: 'value',
        name: '有效优先级',
        min: 0,
        max: 10,
        nameTextStyle: { color: colors.subTextColor },
        axisLabel: { color: colors.subTextColor },
        splitLine: { lineStyle: { color: colors.splitLineColor, type: 'dashed' } }
      },
      yAxis: {
        type: 'value',
        name: '调度紧迫度',
        min: 0,
        max: 10,
        nameTextStyle: { color: colors.subTextColor },
        axisLabel: { color: colors.subTextColor },
        splitLine: { lineStyle: { color: colors.splitLineColor, type: 'dashed' } }
      },
      series: [
        {
          type: 'scatter',
          symbolSize: (value: number[]) => value[2],
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            lineStyle: {
              color: colors.axisLineColor,
              type: 'dashed'
            },
            data: [
              { xAxis: 5 },
              { yAxis: 5 }
            ]
          },
          label: {
            show: !isMobile,
            position: 'top',
            color: colors.subTextColor,
            fontSize: 11,
            formatter: (params: any) => {
              const value = params.data as number[];
              return shouldShowPriorityLabel(value) ? value[3] : '';
            }
          },
          labelLayout: {
            hideOverlap: true,
            moveOverlap: 'shiftY'
          },
          emphasis: {
            focus: 'self',
            scale: true,
            label: {
              show: true,
              formatter: (params: any) => (params.data as number[])[3]
            }
          },
          data: data.difficultyScatter.map(point => [
            point.x,
            point.y,
            point.size,
            point.label,
            point.itemCount,
            point.dueCount,
            point.overdueCount,
            point.readingHours,
            point.cardsCreated,
            point.extracts,
            point.notesWritten
          ]),
          itemStyle: {
            opacity: 0.82
          }
        }
      ]
    };
  }

  function buildForecastOption(data: IRAnalyticsSnapshot): echarts.EChartsCoreOption {
    const colors = getThemeColors();
    return {
      color: [colors.series[0], colors.series[2]],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: colors.textColor },
        confine: true
      },
      legend: {
        top: 6,
        left: 'center',
        textStyle: { color: colors.subTextColor }
      },
      grid: {
        left: isMobile ? 38 : 48,
        right: isMobile ? 34 : 52,
        top: 62,
        bottom: 30
      },
      xAxis: {
        type: 'category',
        data: data.forecast.map(point => point.label),
        axisLabel: { color: colors.subTextColor },
        axisLine: { lineStyle: { color: colors.axisLineColor } }
      },
      yAxis: [
        {
          type: 'value',
          name: '材料数',
          nameTextStyle: { color: colors.subTextColor },
          axisLabel: { color: colors.subTextColor },
          splitLine: { lineStyle: { color: colors.splitLineColor, type: 'dashed' } }
        },
        {
          type: 'value',
          name: '分钟',
          nameTextStyle: { color: colors.subTextColor },
          axisLabel: { color: colors.subTextColor }
        }
      ],
      series: [
        {
          name: '计划材料数',
          type: 'bar',
          barMaxWidth: 34,
          data: data.forecast.map(point => point.itemCount),
          itemStyle: { borderRadius: [6, 6, 0, 0] }
        },
        {
          name: '预计阅读分钟',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: data.forecast.map(point => point.totalEstimatedMinutes)
        }
      ]
    };
  }

  function buildOption(data: IRAnalyticsSnapshot): echarts.EChartsCoreOption {
    if (activeTab === 'quantity') return buildQuantityOption(data);
    if (activeTab === 'timing') return buildTimingOption(data);
    if (activeTab === 'difficulty') return buildDifficultyOption(data);
    return buildForecastOption(data);
  }

  function renderChart(): void {
    if (!open || !snapshot || activeTab === 'activity') return;
    const instance = ensureChart();
    if (!instance) return;
    instance.setOption(buildOption(snapshot), true);
    instance.resize();
  }

  function switchTab(tab: AnalyticsTab): void {
    activeTab = tab;
    if (tab === 'activity') {
      unbindChartInteractions();
      disposeChart();
      return;
    }
    setTimeout(() => renderChart(), 0);
  }

  function adjustQuickRange(step: number): void {
    if (wheelThrottle || activeTab === 'activity') return;

    const currentIndex = quickRangeOptions.findIndex(option => option.value === selectedDays);
    if (currentIndex < 0) return;

    const nextIndex = Math.max(0, Math.min(quickRangeOptions.length - 1, currentIndex + step));
    if (nextIndex === currentIndex) return;

    wheelThrottle = true;
    selectedDays = quickRangeOptions[nextIndex].value;
    void loadAnalytics();

    window.setTimeout(() => {
      wheelThrottle = false;
    }, WHEEL_THROTTLE_MS);
  }

  function handleWheelScroll(event: WheelEvent): void {
    event.preventDefault();
    adjustQuickRange(event.deltaY < 0 ? 1 : -1);
  }

  function bindChartInteractions(): void {
    if (!chartRef || activeTab === 'activity') return;

    chartRef.removeEventListener('wheel', handleWheelScroll);
    chartRef.addEventListener('wheel', handleWheelScroll, { passive: false });

    pinchGestureCleanup?.();
    pinchGestureCleanup = null;

    if (!isMobile) return;

    pinchGestureCleanup = bindPinchRangeGesture(chartRef, {
      onExpand: () => adjustQuickRange(-1),
      onContract: () => adjustQuickRange(1),
      cooldownMs: WHEEL_THROTTLE_MS
    });
  }

  function unbindChartInteractions(): void {
    chartRef?.removeEventListener('wheel', handleWheelScroll);
    pinchGestureCleanup?.();
    pinchGestureCleanup = null;
  }

  function handleResize(): void {
    chart?.resize();
  }

  function getModeText(mode: IRAnalyticsMode): string {
    if (mode === 'topic') return '专题';
    if (mode === 'tag') return '标签';
    return '总体';
  }

  function getCurrentModeLabel(): string {
    return `模式：${getModeText(selectedMode)}`;
  }

  function getCurrentSelectionLabel(): string {
    if (selectedMode === 'overall') return '总体模式无需二次筛选';
    if (!snapshot?.sources.length) {
      return selectedMode === 'topic' ? '暂无可分析专题' : '暂无可分析标签';
    }
    if (!selectedSelectionKey) {
      return selectedMode === 'topic' ? '请选择专题' : '请选择标签';
    }
    const option = snapshot.sources.find(item => item.key === selectedSelectionKey);
    if (!option) {
      return selectedMode === 'topic' ? '请选择专题' : '请选择标签';
    }
    return selectedMode === 'topic' ? `专题：${option.label}` : `标签：#${option.label}`;
  }

  function getCurrentRangeLabel(): string {
    const current = quickRangeOptions.find(option => option.value === selectedDays);
    return current?.label ?? `${selectedDays} 天`;
  }

  function showModeMenu(event: MouseEvent): void {
    const menu = new Menu();

    (['overall', 'topic', 'tag'] as IRAnalyticsMode[]).forEach((mode) => {
      menu.addItem((item) => {
        item
          .setTitle(getModeText(mode))
          .setIcon(mode === 'overall' ? 'globe' : mode === 'topic' ? 'layers' : 'tags')
          .setChecked(selectedMode === mode)
          .onClick(() => {
            if (selectedMode === mode) return;
            selectedMode = mode;
            selectedSelectionKey = '';
            void loadAnalytics();
          });
      });
    });

    menu.showAtMouseEvent(event);
  }

  function showSelectionMenu(event: MouseEvent): void {
    if (selectedMode === 'overall') return;

    const menu = new Menu();
    const options = snapshot?.sources || [];

    if (!options.length) {
      menu.addItem((item) => {
        item
          .setTitle(selectedMode === 'topic' ? '暂无可分析专题' : '暂无可分析标签')
          .setIcon('inbox');
      });
      menu.showAtMouseEvent(event);
      return;
    }

    menu.addItem((item) => {
      item
        .setTitle(selectedMode === 'topic' ? '清空专题选择' : '清空标签选择')
        .setIcon('rotate-ccw')
        .setChecked(!selectedSelectionKey)
        .onClick(() => {
          selectedSelectionKey = '';
          void loadAnalytics();
        });
    });

    menu.addSeparator();
    for (const option of options) {
      menu.addItem((item) => {
        item
          .setTitle(`${option.label} · 活跃 ${option.activeCount} · 到期 ${option.dueCount}`)
          .setIcon(selectedMode === 'topic' ? 'layers' : 'tag')
          .setChecked(selectedSelectionKey === option.key)
          .onClick(() => {
            selectedSelectionKey = option.key;
            void loadAnalytics();
          });
      });
    }

    menu.showAtMouseEvent(event);
  }

  function showRangeMenu(event: MouseEvent): void {
    const menu = new Menu();

    for (const option of quickRangeOptions) {
      menu.addItem((item) => {
        item
          .setTitle(option.label)
          .setIcon('calendar')
          .setChecked(selectedDays === option.value)
          .onClick(() => {
            if (selectedDays === option.value) return;
            selectedDays = option.value;
            void loadAnalytics();
          });
      });
    }

    menu.showAtMouseEvent(event);
  }

  function getSelectionHintText(): string {
    if (selectedMode === 'overall') return '总体模式会统计所有增量阅读点';
    if (!snapshot?.sources.length) {
      return selectedMode === 'topic'
        ? '当前没有可用于分析的专题'
        : '当前没有可用于分析的手工标签';
    }
    if (!selectedSelectionKey) {
      return selectedMode === 'topic'
        ? '请选择一个专题后查看图表'
        : '请选择一个标签后查看图表';
    }
    const option = snapshot.sources.find((item) => item.key === selectedSelectionKey);
    if (!option) return '当前选择已失效，请重新选择';
    return `${option.subtitle} · 共 ${option.itemCount} 项，活跃 ${option.activeCount} 项，到期 ${option.dueCount} 项`;
  }

  function formatMetric(value: number): string {
    if (!Number.isFinite(value)) return '0';
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function formatMonitoringText(): string {
    if (!snapshot?.monitoringSummary) return '';
    const summary = snapshot.monitoringSummary;
    return `近7天日均已安排 ${summary.dailyScheduled} 项 · 日均完成 ${summary.dailyCompleted} 项 · 日均阅读 ${summary.dailyReadingMinutes} 分钟 · 决策闭环率 ${summary.linkedOutcomeRate}%`;
  }

  function getOutcomeTooltip(kind: 'extracts' | 'cards' | 'notes'): string {
    if (!snapshot) return '';

    if (kind === 'extracts') {
      return `当前沉淀摘录数：${snapshot.overview.extracts}\n本期动作摘录：${snapshot.overview.actionExtracts}`;
    }

    if (kind === 'cards') {
      return `当前沉淀记忆卡数：${snapshot.overview.cardsCreated}\n本期动作制卡：${snapshot.overview.actionCardsCreated}`;
    }

    return `当前关联 Markdown 笔记数：${snapshot.overview.notesWritten}\n本期动作写笔记：${snapshot.overview.actionNotesWritten}`;
  }

  function getOutcomeActionText(kind: 'extracts' | 'cards' | 'notes'): string {
    if (!snapshot) return '';

    if (kind === 'extracts') {
      return `本期动作 ${snapshot.overview.actionExtracts}`;
    }

    if (kind === 'cards') {
      return `本期动作 ${snapshot.overview.actionCardsCreated}`;
    }

    return `本期动作 ${snapshot.overview.actionNotesWritten}`;
  }

  function hasSelectionRequirementGap(): boolean {
    return selectedMode !== 'overall' && !selectedSelectionKey;
  }

  function getEmptyStateMessage(): string {
    if (selectedMode !== 'overall' && !snapshot?.sources.length) {
      return selectedMode === 'topic'
        ? '当前还没有可分析的专题数据'
        : '当前还没有可分析的手工标签数据';
    }
    if (hasSelectionRequirementGap()) {
      return selectedMode === 'topic'
        ? '先选择一个专题，再查看当前图表'
        : '先选择一个标签，再查看当前图表';
    }
    return '当前范围下暂时没有可展示数据';
  }

  function getEmptyStateDescription(): string {
    if (selectedMode !== 'overall' && !snapshot?.sources.length) {
      return selectedMode === 'topic'
        ? '等增量阅读点和专题建立关联后，这里就会显示对应图表。'
        : '等手工标签被用于增量阅读后，这里就会显示对应图表。';
    }
    if (hasSelectionRequirementGap()) {
      return selectedMode === 'topic'
        ? '先在上方选择一个专题，下方内容区会显示对应的分析图表。'
        : '先在上方选择一个标签，下方内容区会显示对应的分析图表。';
    }
    return '可以试试切换时间范围或分析条件，看看是否有可展示的图表数据。';
  }

  $effect(() => {
    void loadAnalytics();
  });

  $effect(() => {
    if (!chartRef) {
      unbindChartInteractions();
      disposeChart();
      return;
    }
    if (activeTab !== 'activity') {
      bindChartInteractions();
    } else {
      unbindChartInteractions();
    }
    if (snapshot && activeTab !== 'activity') {
      setTimeout(() => renderChart(), 0);
    }
    return () => {
      unbindChartInteractions();
    };
  });

  onMount(() => {
    window.addEventListener('resize', handleResize);

    const handleDataUpdated = () => {
      void loadAnalytics();
    };
    window.addEventListener('Weave:ir-data-updated', handleDataUpdated);

    themeObserver = new MutationObserver(() => {
      if (snapshot) {
        setTimeout(() => renderChart(), 60);
      }
    });
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      window.removeEventListener('Weave:ir-data-updated', handleDataUpdated);
    };
  });

  onDestroy(() => {
    unbindChartInteractions();
    disposeChart();
    themeObserver?.disconnect();
    window.removeEventListener('resize', handleResize);
  });
</script>

<div class="ir-analytics-modal">
  <div class="tabs-header" class:mobile={isMobile}>
    <div class="tabs-nav weave-toolbar-tabs">
      <button type="button" class="tab-btn weave-toolbar-tab" class:active={activeTab === 'activity'} onclick={() => switchTab('activity')}>
        活跃趋势
      </button>
      <button type="button" class="tab-btn weave-toolbar-tab" class:active={activeTab === 'quantity'} onclick={() => switchTab('quantity')}>
        数量变化
      </button>
      <button type="button" class="tab-btn weave-toolbar-tab" class:active={activeTab === 'timing'} onclick={() => switchTab('timing')}>
        调度时机
      </button>
      <button type="button" class="tab-btn weave-toolbar-tab" class:active={activeTab === 'difficulty'} onclick={() => switchTab('difficulty')}>
        优先级矩阵
      </button>
      <button type="button" class="tab-btn weave-toolbar-tab" class:active={activeTab === 'forecast'} onclick={() => switchTab('forecast')}>
        未来负荷
      </button>
    </div>
  </div>

  <div class="toolbar" class:mobile={isMobile}>
    <div class="toolbar-row">
      <label class="source-select-wrap mode-select-wrap">
        <span class="toolbar-label">分析模式</span>
        <button
          type="button"
          class="source-menu-trigger"
          onclick={(event) => showModeMenu(event)}
          title="选择分析模式"
        >
          <span class="source-menu-text">{getCurrentModeLabel()}</span>
          <ObsidianIcon name="chevron-down" size={14} />
        </button>
      </label>

      <label class="source-select-wrap selection-select-wrap">
        <span class="toolbar-label">条件选择</span>
        <button
          type="button"
          class="source-menu-trigger"
          onclick={(event) => showSelectionMenu(event)}
          title={selectedMode === 'overall' ? '总体模式无需二次筛选' : '选择具体专题或标签'}
          disabled={selectedMode === 'overall'}
        >
          <span class="source-menu-text">{getCurrentSelectionLabel()}</span>
          <ObsidianIcon name="chevron-down" size={14} />
        </button>
      </label>

      <label class="range-select-wrap">
        <span class="toolbar-label">时间范围</span>
        <button
          type="button"
          class="range-menu-trigger"
          onclick={(event) => showRangeMenu(event)}
          title="选择时间范围"
        >
          <span class="range-menu-text">{getCurrentRangeLabel()}</span>
          <ObsidianIcon name="chevron-down" size={14} />
        </button>
      </label>
    </div>

    <div class="scope-hint">{getSelectionHintText()}</div>

    {#if activeTab === 'activity' && snapshot?.monitoringSummary}
      <div class="monitoring-note">{formatMonitoringText()}</div>
    {/if}
  </div>

  {#if isLoading}
    <div class="state-panel state-panel--loading">
      <div class="state-icon">
        <ObsidianIcon name="loader" size={20} />
      </div>
      <div>正在生成分析图表…</div>
    </div>
  {:else if loadError}
    <div class="state-panel error">{loadError}</div>
  {:else if snapshot}
    {#if activeTab === 'activity'}
      <div class="activity-overview-panel">
        <div class="scope-caption">
          <span class="scope-title">{snapshot.scopeLabel}</span>
          <span class="scope-subtitle">
            {#if snapshot.scopeKey}
              共 {snapshot.overview.totalItems} 项阅读点，当前活跃 {snapshot.overview.activeItems} 项
            {:else if selectedMode !== 'overall'}
              {getEmptyStateMessage()}
            {:else}
              当前汇总全部增量阅读点
            {/if}
          </span>
        </div>

        <div class="overview-grid">
          <div class="overview-card">
            <div class="overview-label">总材料</div>
            <div class="overview-value">{snapshot.overview.totalItems}</div>
          </div>
          <div class="overview-card">
            <div class="overview-label">活跃材料</div>
            <div class="overview-value">{snapshot.overview.activeItems}</div>
          </div>
          <div class="overview-card">
            <div class="overview-label">今日到期</div>
            <div class="overview-value">{snapshot.overview.dueToday}</div>
          </div>
          <div class="overview-card">
            <div class="overview-label">逾期项</div>
            <div class="overview-value">{snapshot.overview.overdueItems}</div>
          </div>
          <div class="overview-card">
            <div class="overview-label">阅读小时</div>
            <div class="overview-value">{formatMetric(snapshot.overview.totalReadingHours)}</div>
          </div>
          <div class="overview-card">
            <div class="overview-label">平均优先级</div>
            <div class="overview-value">P{formatMetric(snapshot.overview.avgPriority)}</div>
          </div>
          <div class="overview-card" title={getOutcomeTooltip('extracts')}>
            <div class="overview-label">摘录</div>
            <div class="overview-value">{snapshot.overview.extracts}</div>
            <div class="overview-meta">{getOutcomeActionText('extracts')}</div>
          </div>
          <div class="overview-card" title={getOutcomeTooltip('cards')}>
            <div class="overview-label">制卡</div>
            <div class="overview-value">{snapshot.overview.cardsCreated}</div>
            <div class="overview-meta">{getOutcomeActionText('cards')}</div>
          </div>
          <div class="overview-card" title={getOutcomeTooltip('notes')}>
            <div class="overview-label">笔记</div>
            <div class="overview-value">{snapshot.overview.notesWritten}</div>
            <div class="overview-meta">{getOutcomeActionText('notes')}</div>
          </div>
        </div>

      </div>
    {/if}

    {#if activeTab !== 'activity'}
      <div class="chart-stage">
        {#if hasSelectionRequirementGap() || (
          selectedMode !== 'overall' && !snapshot.sources.length
        ) || (
          activeTab === 'quantity' && snapshot.quantityTrend.every(point => point.totalCount === 0 && point.activeCount === 0 && point.closedCount === 0)
        ) || (
          activeTab === 'timing' && snapshot.timingBuckets.every(point => point.count === 0)
        ) || (
          activeTab === 'difficulty' && snapshot.difficultyScatter.length === 0
        ) || (
          activeTab === 'forecast' && snapshot.forecast.every(point => point.itemCount === 0 && point.totalEstimatedMinutes === 0)
        )}
          <div class="state-panel state-panel--empty">
            <div class="state-icon">
              <ObsidianIcon name="inbox" size={24} />
            </div>
            <div class="state-title">{getEmptyStateMessage()}</div>
            <div class="state-description">{getEmptyStateDescription()}</div>
          </div>
        {:else}
          <div class="chart-container" bind:this={chartRef}></div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
<style>
  .ir-analytics-modal {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 18px 18px 16px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--background-primary) 94%, var(--background-secondary) 6%) 0%,
      var(--background-primary) 62%,
      color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary) 8%) 100%
    );
    gap: 12px;
  }

  .tabs-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    border-radius: 0;
    border: none;
    background: transparent;
    backdrop-filter: none;
  }

  .tabs-nav {
    width: 100%;
    -ms-overflow-style: none;
  }

  .tab-btn {
    min-width: 0;
    font-weight: 500;
  }

  .tab-btn:focus-visible {
    outline: 2px solid var(--background-modifier-border-focus);
    outline-offset: 1px;
  }

  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 88%, transparent);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--background-secondary) 90%, var(--background-primary) 10%),
      color-mix(in srgb, var(--background-secondary) 82%, var(--background-primary) 18%)
    );
  }

  .toolbar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .source-select-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 280px;
  }

  .range-select-wrap {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    min-width: 180px;
    margin-left: auto;
  }

  .toolbar-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .source-menu-trigger {
    min-width: 260px;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 10px;
    min-height: 34px;
    border-radius: 9px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 86%, transparent);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .range-menu-trigger {
    min-width: 140px;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 10px;
    min-height: 34px;
    border-radius: 9px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 86%, transparent);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .source-menu-trigger:hover {
    border-color: color-mix(in srgb, var(--interactive-accent) 38%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--background-modifier-hover) 74%, transparent);
  }

  .range-menu-trigger:hover {
    border-color: color-mix(in srgb, var(--interactive-accent) 38%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--background-modifier-hover) 74%, transparent);
  }

  .source-menu-trigger:focus-visible {
    outline: 2px solid var(--background-modifier-border-focus);
    outline-offset: 1px;
  }

  .range-menu-trigger:focus-visible {
    outline: 2px solid var(--background-modifier-border-focus);
    outline-offset: 1px;
  }

  .source-menu-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .range-menu-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scope-hint {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
    padding: 8px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--background-primary) 76%, var(--background-secondary) 24%);
    border: 1px dashed color-mix(in srgb, var(--background-modifier-border) 78%, transparent);
  }

  .source-menu-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }

  .monitoring-note {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 82%, transparent);
    background: color-mix(in srgb, var(--background-primary) 72%, var(--background-secondary) 28%);
  }

  .activity-overview-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    gap: 10px;
  }

  .scope-caption {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border-radius: 11px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 86%, transparent);
    background: color-mix(in srgb, var(--background-secondary) 66%, var(--background-primary) 34%);
  }

  .scope-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-normal);
    line-height: 1.35;
  }

  .scope-subtitle {
    font-size: 12px;
    color: var(--text-muted);
  }

  .overview-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .overview-card {
    padding: 12px 14px;
    border-radius: 11px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 84%, transparent);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary) 8%),
      color-mix(in srgb, var(--background-primary) 98%, var(--background-secondary) 2%)
    );
    transition: border-color 0.15s ease, transform 0.15s ease;
  }

  .overview-card:hover {
    border-color: color-mix(in srgb, var(--interactive-accent) 30%, var(--background-modifier-border));
    transform: translateY(-1px);
  }

  .overview-label {
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 6px;
    letter-spacing: 0.02em;
  }

  .overview-value {
    font-size: 21px;
    font-weight: 700;
    color: var(--text-normal);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .overview-meta {
    margin-top: 6px;
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.35;
  }

  .chart-stage {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .chart-container {
    flex: 1;
    min-height: 420px;
    border-radius: 14px;
    touch-action: pan-y;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 86%, transparent);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--background-secondary) 82%, var(--background-primary) 18%),
      color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary) 8%)
    );
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--background-primary) 30%, transparent);
    padding: 12px 10px 10px 4px;
  }

  .state-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    min-width: 0;
    align-self: stretch;
    gap: 10px;
    min-height: 220px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 86%, transparent);
    color: var(--text-muted);
    background: color-mix(in srgb, var(--background-secondary) 78%, var(--background-primary) 22%);
    text-align: center;
    padding: 16px;
  }

  .state-panel--empty {
    border-style: dashed;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--background-secondary) 74%, var(--background-primary) 26%),
      color-mix(in srgb, var(--background-primary) 94%, var(--background-secondary) 6%)
    );
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--background-primary) 22%, transparent),
      0 8px 24px color-mix(in srgb, var(--background-primary) 86%, transparent);
  }

  .state-panel--loading .state-icon {
    animation: ir-analytics-spin 1.1s linear infinite;
  }

  .state-panel.error {
    color: var(--text-error);
    border-color: color-mix(in srgb, var(--text-error) 38%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--text-error) 10%, var(--background-primary));
  }

  .state-icon {
    opacity: 0.8;
  }

  .state-title {
    max-width: 420px;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--text-normal);
  }

  .state-description {
    max-width: 520px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--text-muted);
  }

  @keyframes ir-analytics-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .tabs-header.mobile .tabs-nav {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .tabs-header.mobile .tabs-nav::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .tabs-header.mobile .tab-btn {
    flex: 0 0 auto;
    min-width: 40px;
    min-height: 40px;
    padding: 8px 10px;
  }

  .toolbar.mobile .toolbar-row {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    align-items: end;
    gap: 8px;
  }

  .toolbar.mobile .source-select-wrap {
    min-width: 0;
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .toolbar.mobile .range-select-wrap {
    min-width: 0;
    width: 100%;
    margin-left: 0;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .toolbar.mobile .source-menu-trigger {
    min-width: 0;
    width: 100%;
  }

  .toolbar.mobile .range-menu-trigger {
    min-width: 0;
    width: 100%;
  }

  @media (max-width: 768px) {
    .ir-analytics-modal {
      padding: 10px 8px;
      gap: 10px;
    }

    .overview-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .overview-card {
      padding: 10px 12px;
    }

    .overview-value {
      font-size: 18px;
    }

    .overview-meta {
      font-size: 10px;
    }

    .scope-caption {
      padding: 10px 12px;
    }

    .chart-container {
      min-height: 320px;
      padding: 8px 8px 8px 2px;
    }

    .state-panel {
      min-height: 180px;
    }

    .state-title {
      font-size: 15px;
    }

    .state-description {
      font-size: 12px;
      line-height: 1.6;
    }
  }

  @media (max-width: 520px) {
    .overview-grid {
      grid-template-columns: repeat(1, minmax(0, 1fr));
    }
  }
</style>



