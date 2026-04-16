<!--
  增量阅读负载预测模态窗组件
  显示增量阅读内容块的未来负载预测曲线
-->
<script lang="ts">
  import { logger } from '../../utils/logger';
  import { onMount, onDestroy } from 'svelte';
  import { Platform, Menu } from 'obsidian';
  import type AnkiObsidianPlugin from '../../main';
  import ResizableModal from '../ui/ResizableModal.svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import type { IRDeck } from '../../types/ir-types';
  import { buildProjectedDayLoadMap, getProjectedScheduleSummary } from '../../services/incremental-reading/IRProjectedScheduleSummary';
  import { IRStorageService } from '../../services/incremental-reading/IRStorageService';
  import IRStudySessionChart from '../analytics/IRStudySessionChart.svelte';
  import IRActivityHeatmap from '../analytics/IRActivityHeatmap.svelte';
  import * as echarts from 'echarts/core';
  import {
    TooltipComponent,
    GridComponent,
    LegendComponent,
    MarkLineComponent
  } from 'echarts/components';
  import { LineChart, BarChart } from 'echarts/charts';
  import { CanvasRenderer } from 'echarts/renderers';

  echarts.use([
    TooltipComponent,
    GridComponent,
    LegendComponent,
    MarkLineComponent,
    LineChart,
    BarChart,
    CanvasRenderer
  ]);

  interface Props {
    open: boolean;
    onClose: () => void;
    plugin: AnkiObsidianPlugin;
    initialDeckId?: string;
  }

  let { open = $bindable(), onClose, plugin, initialDeckId }: Props = $props();

  // 标签页状态
  type TabType = 'loadRatio' | 'loadForecast' | 'studySessions' | 'activityHeatmap';
  let activeTab = $state<TabType>('loadRatio');

  // 图表容器引用
  let loadForecastChartRef: HTMLDivElement | null = $state(null);
  let loadForecastChart: echarts.ECharts | null = null;
  let loadRatioChartRef: HTMLDivElement | null = $state(null);
  let loadRatioChart: echarts.ECharts | null = null;
  let themeObserver: MutationObserver | null = null;

  // 牌组选择相关
  let allIRDecks = $state<IRDeck[]>([]);
  let selectedDeckIds = $state<Set<string>>(new Set());
  let showGlobalLoad = $state(false);

  // 时间范围
  let selectedDays = $state(30);
  const quickRangeOptions = [
    { value: 7, label: '7天' },
    { value: 14, label: '14天' },
    { value: 30, label: '30天' },
    { value: 60, label: '60天' },
    { value: 90, label: '90天' }
  ];

  // 移动端检测
  const isMobile = Platform.isMobile;

  // 负载状态类型和常量
  type LoadStatus = 'low' | 'normal' | 'high' | 'overload';
  const LoadStatus = {
    LOW: 'low' as LoadStatus,
    NORMAL: 'normal' as LoadStatus,
    HIGH: 'high' as LoadStatus,
    OVERLOAD: 'overload' as LoadStatus
  };

  // 获取主题颜色
  function getThemeColors() {
    const isDark = document.body.classList.contains('theme-dark');
    return {
      textColor: isDark ? '#e0e0e0' : '#2c3e50',
      axisLineColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
      splitLineColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      tooltipBg: isDark ? '#1a1a1a' : '#ffffff',
      tooltipBorder: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
    };
  }

  // 移动端tooltip位置
  function getMobileTooltipPosition(point: number[], params: any, dom: HTMLElement, rect: any, size: any) {
    if (!isMobile) return null;
    const viewWidth = size.viewSize[0];
    const contentWidth = size.contentSize[0];
    const contentHeight = size.contentSize[1];
    let x = point[0] - contentWidth / 2;
    if (x < 10) x = 10;
    if (x + contentWidth > viewWidth - 10) x = viewWidth - contentWidth - 10;
    let y = point[1] - contentHeight - 30;
    if (y < 10) y = 10;
    return [x, y];
  }

  // 获取负载状态信息
  function getLoadStatusInfo(status: LoadStatus) {
    switch (status) {
      case LoadStatus.LOW:
        return { label: '负载低', color: '#51cf66' };
      case LoadStatus.NORMAL:
        return { label: '正常', color: '#4dabf7' };
      case LoadStatus.HIGH:
        return { label: '负载高', color: '#ffd43b' };
      case LoadStatus.OVERLOAD:
        return { label: '过载', color: '#ff6b6b' };
      default:
        return { label: '正常', color: '#4dabf7' };
    }
  }

  // IR存储服务实例
  let irStorage: IRStorageService | null = null;

  // 初始化IR存储服务
  async function initIRStorage(): Promise<IRStorageService> {
    if (!irStorage) {
      irStorage = new IRStorageService(plugin.app);
      await irStorage.initialize();
    }
    return irStorage;
  }

  // 加载IR牌组列表
  async function loadIRDecks() {
    try {
      const storage = await initIRStorage();
      const decksData = await storage.getAllDecks();
      allIRDecks = Object.values(decksData);
      
      if (initialDeckId && allIRDecks.some(d => d.id === initialDeckId)) {
        selectedDeckIds = new Set([initialDeckId]);
      } else if (allIRDecks.length > 0) {
        selectedDeckIds = new Set([allIRDecks[0].id]);
      }
      
      logger.debug('[IRLoadForecast] 加载IR牌组:', allIRDecks.length);
    } catch (error) {
      logger.error('[IRLoadForecast] 加载牌组失败:', error);
    }
  }

  // 切换标签页
  function switchTab(tab: TabType) {
    activeTab = tab;
    setTimeout(() => {
      if (tab === 'loadRatio') {
        initLoadRatioChart();
      } else if (tab === 'loadForecast') {
        initLoadForecastChart();
      }
    }, 150);
  }

  // 切换牌组选择
  async function toggleDeckSelection(id: string) {
    const newSet = new Set(selectedDeckIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    selectedDeckIds = newSet;
    setTimeout(() => refreshCurrentTab(), 100);
  }

  // 全选/取消全选
  function toggleSelectAll() {
    if (selectedDeckIds.size === allIRDecks.length) {
      selectedDeckIds = new Set();
    } else {
      selectedDeckIds = new Set(allIRDecks.map(d => d.id));
    }
    setTimeout(() => refreshCurrentTab(), 100);
  }

  // 切换全局负载显示
  function toggleGlobalLoad(useGlobal: boolean) {
    showGlobalLoad = useGlobal;
    setTimeout(() => refreshCurrentTab(), 100);
  }

  // 快捷时间范围选择
  function selectQuickRange(days: number) {
    selectedDays = days;
    setTimeout(() => refreshCurrentTab(), 100);
  }

  // 刷新当前标签页
  function refreshCurrentTab() {
    if (activeTab === 'loadRatio') {
      initLoadRatioChart();
    } else if (activeTab === 'loadForecast') {
      initLoadForecastChart();
    }
  }

  // 生成负载预测数据
  async function generateLoadForecastData(days: number): Promise<Array<{
    date: string;
    dateDisplay: string;
    totalMinutes: number;
    blockCount: number;
    status: LoadStatus;
  }>> {
    const forecast: Array<{
      date: string;
      dateDisplay: string;
      totalMinutes: number;
      blockCount: number;
      status: LoadStatus;
    }> = [];

    const dailyBudget = plugin.settings.incrementalReading?.dailyTimeBudgetMinutes || 30;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const projectedSummary = (!showGlobalLoad && selectedDeckIds.size === 0)
      ? null
      : await getProjectedScheduleSummary(plugin.app, {
          deckIds: showGlobalLoad ? undefined : Array.from(selectedDeckIds),
          horizonDays: days
        });
    const projectedDayLoadMap = projectedSummary
      ? buildProjectedDayLoadMap(projectedSummary)
      : new Map();

    // 统计每天的负载
    for (let i = 0; i < days; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + i);
      const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
      const projectedDayLoad = projectedDayLoadMap.get(dateKey);
      let totalMinutes = projectedDayLoad?.totalEstimatedMinutes || 0;
      let blockCount = projectedDayLoad?.items.length || 0;

      // 计算负载状态
      const ratio = totalMinutes / dailyBudget;
      let status: LoadStatus;
      if (ratio <= 0.5) {
        status = LoadStatus.LOW;
      } else if (ratio <= 0.8) {
        status = LoadStatus.NORMAL;
      } else if (ratio <= 1.2) {
        status = LoadStatus.HIGH;
      } else {
        status = LoadStatus.OVERLOAD;
      }

      forecast.push({
        date: targetDate.toISOString().split('T')[0],
        dateDisplay: targetDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
        totalMinutes: Math.round(totalMinutes * 10) / 10,
        blockCount,
        status
      });
    }

    return forecast;
  }

  // 初始化负载预测图表
  async function initLoadForecastChart() {
    if (!loadForecastChartRef) return;

    if (loadForecastChart) {
      loadForecastChart.dispose();
    }
    loadForecastChart = echarts.init(loadForecastChartRef);

    const colors = getThemeColors();
    const forecast = await generateLoadForecastData(selectedDays);
    const dailyBudget = plugin.settings.incrementalReading?.dailyTimeBudgetMinutes || 30;

    const dates = forecast.map(f => f.dateDisplay);
    const minutes = forecast.map(f => f.totalMinutes);

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: colors.textColor, fontSize: 14 },
        extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
        confine: true,
        position: isMobile ? getMobileTooltipPosition : undefined,
        formatter: function(params: any) {
          const index = params[0].dataIndex;
          const data = forecast[index];
          if (!data) return '';
          
          const statusInfo = getLoadStatusInfo(data.status);
          const ratio = ((data.totalMinutes / dailyBudget) * 100).toFixed(0);
          
          return `<div style="padding: 12px; min-width: 180px;">
            <div style="font-weight: 600; font-size: 15px; margin-bottom: 10px; color: ${colors.textColor};">${data.date}</div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="display: inline-block; width: 10px; height: 10px; background: ${statusInfo.color}; border-radius: 50%;"></span>
              <span style="color: ${colors.textColor};">预计阅读: <strong>${data.totalMinutes}</strong> 分钟</span>
            </div>
            <div style="color: ${colors.textColor}; margin-bottom: 6px;">到期内容块: <strong>${data.blockCount}</strong> 个</div>
            <div style="color: ${colors.textColor}; margin-bottom: 6px;">负载率: <strong style="color: ${statusInfo.color};">${ratio}%</strong></div>
            <div style="color: ${statusInfo.color}; font-weight: 500; margin-top: 8px; padding-top: 8px; border-top: 1px solid ${colors.splitLineColor};">${statusInfo.label}</div>
            <div style="color: ${colors.textColor}; opacity: 0.7; font-size: 12px; margin-top: 4px;">时间预算: ${dailyBudget} 分钟/天</div>
          </div>`;
        }
      },
      grid: {
        top: isMobile ? 25 : 50,
        right: isMobile ? 8 : 30,
        bottom: isMobile ? 40 : 70,
        left: isMobile ? 8 : 40,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10], lineStyle: { color: colors.axisLineColor } },
        axisLabel: { 
          color: colors.textColor, 
          rotate: isMobile ? 45 : (selectedDays > 30 ? 45 : 0),
          fontSize: isMobile ? 10 : 12
        },
        name: '日期',
        nameLocation: 'middle',
        nameGap: selectedDays > 30 ? 50 : 35,
        nameTextStyle: { color: colors.textColor, fontSize: 13 }
      },
      yAxis: {
        type: 'value',
        name: '预计阅读时间 (分钟)',
        nameTextStyle: { color: colors.textColor, fontSize: 13 },
        axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10], lineStyle: { color: colors.axisLineColor } },
        axisLabel: { 
          color: colors.textColor,
          formatter: '{value}min'
        },
        splitLine: { lineStyle: { color: colors.splitLineColor, type: 'dashed' } }
      },
      series: [
        {
          name: '预计负载',
          type: 'bar',
          data: minutes,
          itemStyle: {
            color: function(params: any) {
              const data = forecast[params.dataIndex];
              if (data) {
                return getLoadStatusInfo(data.status).color;
              }
              return '#51cf66';
            },
            borderRadius: [4, 4, 0, 0]
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.3)'
            }
          },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                yAxis: dailyBudget,
                label: {
                  show: true,
                  formatter: '时间预算',
                  color: colors.textColor,
                  fontSize: 11,
                  position: 'end'
                },
                lineStyle: {
                  color: '#ff6b6b',
                  type: 'dashed',
                  width: 2
                }
              }
            ]
          }
        }
      ]
    };

    loadForecastChart.setOption(option);
  }

  // 初始化负载率曲线图
  async function initLoadRatioChart() {
    if (!loadRatioChartRef) return;

    if (loadRatioChart) {
      loadRatioChart.dispose();
    }
    loadRatioChart = echarts.init(loadRatioChartRef);

    const colors = getThemeColors();
    const forecast = await generateLoadForecastData(selectedDays);
    const dailyBudget = plugin.settings.incrementalReading?.dailyTimeBudgetMinutes || 30;

    const dates = forecast.map(f => f.dateDisplay);
    const ratios = forecast.map(f => Math.round((f.totalMinutes / dailyBudget) * 100));

    // 根据负载率获取颜色
    const getColorByRatio = (ratio: number): string => {
      if (ratio <= 50) return '#51cf66';
      if (ratio <= 80) return '#4dabf7';
      if (ratio <= 120) return '#ffd43b';
      return '#ff6b6b';
    };

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: colors.textColor, fontSize: 14 },
        extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
        confine: true,
        position: isMobile ? getMobileTooltipPosition : undefined,
        formatter: function(params: any) {
          const index = params[0].dataIndex;
          const data = forecast[index];
          if (!data) return '';
          
          const ratio = ratios[index];
          const statusInfo = getLoadStatusInfo(data.status);
          
          return `<div style="padding: 12px; min-width: 160px;">
            <div style="font-weight: 600; font-size: 15px; margin-bottom: 10px; color: ${colors.textColor};">${data.date}</div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="display: inline-block; width: 10px; height: 10px; background: ${getColorByRatio(ratio)}; border-radius: 50%;"></span>
              <span style="color: ${colors.textColor};">负载率: <strong style="color: ${getColorByRatio(ratio)};">${ratio}%</strong></span>
            </div>
            <div style="color: ${colors.textColor}; margin-bottom: 6px;">预计时间: <strong>${data.totalMinutes}</strong> 分钟</div>
            <div style="color: ${statusInfo.color}; font-weight: 500; margin-top: 8px; padding-top: 8px; border-top: 1px solid ${colors.splitLineColor};">${statusInfo.label}</div>
          </div>`;
        }
      },
      grid: {
        top: isMobile ? 20 : 40,
        right: isMobile ? 8 : 30,
        bottom: isMobile ? 35 : 60,
        left: isMobile ? 8 : 40,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10], lineStyle: { color: colors.axisLineColor } },
        axisLabel: { 
          color: colors.textColor, 
          rotate: isMobile ? 45 : (selectedDays > 30 ? 45 : 0),
          fontSize: isMobile ? 10 : 12
        },
        name: '日期',
        nameLocation: 'middle',
        nameGap: selectedDays > 30 ? 50 : 35,
        nameTextStyle: { color: colors.textColor, fontSize: 13 }
      },
      yAxis: {
        type: 'value',
        name: '负载率 (%)',
        nameTextStyle: { color: colors.textColor, fontSize: 13 },
        axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10], lineStyle: { color: colors.axisLineColor } },
        axisLabel: { 
          color: colors.textColor,
          formatter: '{value}%'
        },
        splitLine: { lineStyle: { color: colors.splitLineColor, type: 'dashed' } },
        max: function(value: { max: number }) {
          return Math.max(150, Math.ceil(value.max / 50) * 50);
        }
      },
      series: [
        {
          name: '负载率',
          type: 'line',
          data: ratios,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            width: 3,
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#51cf66' },
              { offset: 0.4, color: '#4dabf7' },
              { offset: 0.7, color: '#ffd43b' },
              { offset: 1, color: '#ff6b6b' }
            ])
          },
          itemStyle: {
            color: function(params: any) {
              return getColorByRatio(params.value);
            },
            borderWidth: 2,
            borderColor: '#fff'
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(77, 171, 247, 0.3)' },
              { offset: 1, color: 'rgba(77, 171, 247, 0.05)' }
            ])
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.3)'
            }
          },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                yAxis: 100,
                label: {
                  show: true,
                  formatter: '100%',
                  color: '#ff6b6b',
                  fontSize: 11,
                  position: 'end'
                },
                lineStyle: {
                  color: '#ff6b6b',
                  type: 'dashed',
                  width: 2
                }
              }
            ]
          }
        }
      ]
    };

    loadRatioChart.setOption(option);
  }

  // 响应式调整
  function handleResize() {
    loadForecastChart?.resize();
    loadRatioChart?.resize();
  }

  // 主题变化处理
  function updateChartTheme() {
    if (loadForecastChart) {
      loadForecastChart.dispose();
      loadForecastChart = null;
    }
    if (loadRatioChart) {
      loadRatioChart.dispose();
      loadRatioChart = null;
    }
    if (activeTab === 'loadRatio' && loadRatioChartRef) {
      initLoadRatioChart();
    } else if (activeTab === 'loadForecast' && loadForecastChartRef) {
      initLoadForecastChart();
    }
  }

  // 显示牌组选择菜单
  function showDeckMenu(event: MouseEvent) {
    const menu = new Menu();
    
    menu.addItem((item) =>
      item
        .setTitle(selectedDeckIds.size === allIRDecks.length ? '取消全选' : '全选')
        .setIcon('check-square')
        .onClick(() => toggleSelectAll())
    );
    
    menu.addSeparator();
    
    allIRDecks.forEach((deck, index) => {
      menu.addItem((item) =>
        item
          .setTitle(deck.name)
          .setIcon(selectedDeckIds.has(deck.id) ? 'check' : 'square')
          .onClick(() => toggleDeckSelection(deck.id))
      );
    });
    
    menu.showAtMouseEvent(event);
  }

  // 显示预测天数菜单
  function showDaysMenu(event: MouseEvent) {
    const menu = new Menu();
    
    quickRangeOptions.forEach((option) => {
      menu.addItem((item) =>
        item
          .setTitle(option.label)
          .setIcon(selectedDays === option.value ? 'check' : 'circle')
          .onClick(() => selectQuickRange(option.value))
      );
    });
    
    menu.showAtMouseEvent(event);
  }

  // 显示负载图例菜单
  function showLegendMenu(event: MouseEvent) {
    const menu = new Menu();
    
    menu.addItem((item) =>
      item.setTitle('负载低 (<50%)').setIcon('circle').onClick(() => {})
    );
    menu.addItem((item) =>
      item.setTitle('正常 (50%-80%)').setIcon('circle').onClick(() => {})
    );
    menu.addItem((item) =>
      item.setTitle('负载高 (80%-120%)').setIcon('circle').onClick(() => {})
    );
    menu.addItem((item) =>
      item.setTitle('过载 (>120%)').setIcon('circle').onClick(() => {})
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle('100% 基准线').setIcon('minus').onClick(() => {})
    );
    
    menu.showAtMouseEvent(event);
  }

  onMount(() => {
    loadIRDecks().then(() => {
      setTimeout(() => {
        if (open && loadRatioChartRef) {
          initLoadRatioChart();
        }
      }, 150);
    });
    
    window.addEventListener('resize', handleResize);

    const handleIRRefresh = () => {
      if (!open) return;
      void loadIRDecks().then(() => {
        setTimeout(() => refreshCurrentTab(), 100);
      });
    };
    window.addEventListener('Weave:ir-data-updated', handleIRRefresh);
    window.addEventListener('Weave:ir-timer-updated', handleIRRefresh);

    themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          setTimeout(() => updateChartTheme(), 100);
          break;
        }
      }
    });
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      window.removeEventListener('Weave:ir-data-updated', handleIRRefresh);
      window.removeEventListener('Weave:ir-timer-updated', handleIRRefresh);
    };
  });

  $effect(() => {
    if (open && activeTab === 'loadRatio' && loadRatioChartRef && !loadRatioChart) {
      setTimeout(() => initLoadRatioChart(), 150);
    }
    if (open && activeTab === 'loadForecast' && loadForecastChartRef && !loadForecastChart) {
      setTimeout(() => initLoadForecastChart(), 150);
    }
  });

  onDestroy(() => {
    loadForecastChart?.dispose();
    loadRatioChart?.dispose();
    window.removeEventListener('resize', handleResize);
    themeObserver?.disconnect();
  });

  function handleClose() {
    if (typeof onClose === 'function') {
      onClose();
    }
  }
</script>

{#if open}
<ResizableModal
  bind:open
  {plugin}
  title="增量阅读专题分析"
  onClose={handleClose}
  enableTransparentMask={false}
  enableWindowDrag={false}
  keyboard={true}
  initialWidth={900}
  initialHeight={820}
>
  <div class="ir-load-forecast-modal">
    <!-- 标签页切换与控制栏 -->
    <div class="tabs-bar">
      <div class="tabs-left weave-toolbar-tabs">
        <button 
          class="tab-btn weave-toolbar-tab" 
          class:active={activeTab === 'loadRatio'}
          onclick={() => switchTab('loadRatio')}
          title="负载率"
        >
          <ObsidianIcon name="trending-up" size={isMobile ? 18 : 16} />
          {#if !isMobile}<span>负载率</span>{/if}
        </button>
        <button 
          class="tab-btn weave-toolbar-tab" 
          class:active={activeTab === 'loadForecast'}
          onclick={() => switchTab('loadForecast')}
          title="阅读时间"
        >
          <ObsidianIcon name="bar-chart-2" size={isMobile ? 18 : 16} />
          {#if !isMobile}<span>阅读时间</span>{/if}
        </button>
        <button 
          class="tab-btn weave-toolbar-tab" 
          class:active={activeTab === 'studySessions'}
          onclick={() => switchTab('studySessions')}
          title="学习记录"
        >
          <ObsidianIcon name="activity" size={isMobile ? 18 : 16} />
          {#if !isMobile}<span>学习记录</span>{/if}
        </button>
        <button 
          class="tab-btn weave-toolbar-tab" 
          class:active={activeTab === 'activityHeatmap'}
          onclick={() => switchTab('activityHeatmap')}
          title="活动热力图"
        >
          <ObsidianIcon name="calendar" size={isMobile ? 18 : 16} />
          {#if !isMobile}<span>活动热力图</span>{/if}
        </button>
      </div>
      
      <div class="tabs-right">
        <!-- 数据源切换图标 -->
        <button 
          class="control-icon-btn"
          class:active={showGlobalLoad}
          onclick={() => toggleGlobalLoad(!showGlobalLoad)}
          title={showGlobalLoad ? '当前: 全部内容' : '当前: 选中牌组'}
        >
          <ObsidianIcon name={showGlobalLoad ? 'globe' : 'layers'} size={16} />
        </button>

        <!-- 牌组选择器 -->
        {#if !showGlobalLoad && allIRDecks.length > 0}
          <button 
            class="control-menu-btn"
            onclick={(e) => showDeckMenu(e)}
          >
            <ObsidianIcon name="folder" size={14} />
            <span>{selectedDeckIds.size}/{allIRDecks.length}</span>
            <ObsidianIcon name="chevron-down" size={12} />
          </button>
        {/if}

        <!-- 预测天数 (负载率和阅读时间标签页) -->
        {#if activeTab === 'loadRatio' || activeTab === 'loadForecast'}
          <button 
            class="control-menu-btn"
            onclick={(e) => showDaysMenu(e)}
          >
            <ObsidianIcon name="calendar-days" size={14} />
            <span>{selectedDays}天</span>
            <ObsidianIcon name="chevron-down" size={12} />
          </button>
          <button 
            class="control-icon-btn"
            onclick={(e) => showLegendMenu(e)}
            title="负载状态说明"
          >
            <ObsidianIcon name="info" size={14} />
          </button>
        {/if}
      </div>
    </div>

    <!-- 负载率曲线图标签页 -->
    {#if activeTab === 'loadRatio'}
      <div class="chart-section">
        <div class="section-title with-accent-bar accent-purple">
          未来 {selectedDays} 天负载率趋势
        </div>
        <div class="chart-container" bind:this={loadRatioChartRef}></div>
      </div>

    {/if}

    <!-- 阅读时间柱状图标签页 -->
    {#if activeTab === 'loadForecast'}
      <div class="chart-section">
        <div class="section-title with-accent-bar accent-cyan">
          未来 {selectedDays} 天预计阅读时间
        </div>
        <div class="chart-container" bind:this={loadForecastChartRef}></div>
      </div>
    {/if}

    <!-- 学习记录视图 -->
    {#if activeTab === 'studySessions'}
      <div class="chart-section">
        <div class="section-title with-accent-bar accent-purple">
          历史学习会话
        </div>
        <IRStudySessionChart
          {plugin}
          allDecks={allIRDecks}
          {selectedDeckIds}
          {showGlobalLoad}
        />
      </div>
    {/if}

    <!-- 活动热力图视图 -->
    {#if activeTab === 'activityHeatmap'}
      <div class="chart-section">
        <div class="section-title with-accent-bar accent-green">
          年度活动热力图
        </div>
        <IRActivityHeatmap
          {plugin}
          allDecks={allIRDecks}
          {selectedDeckIds}
          {showGlobalLoad}
        />
      </div>
    {/if}
  </div>
</ResizableModal>
{/if}

<style>
  .ir-load-forecast-modal {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background-primary);
    padding: 20px;
    gap: 16px;
  }

  /* 标签页栏 */
  .tabs-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding-bottom: 12px;
  }

  .tabs-left {
    flex: 1 1 auto;
    min-width: 0;
  }

  .tabs-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tabs-bar .tab-btn {
    gap: 6px;
    min-width: 0;
    font-weight: 500;
  }

  /* 控制图标按钮 */
  .control-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .control-icon-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .control-icon-btn.active {
    background: var(--interactive-accent-hover);
    color: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

  /* 控制菜单按钮 */
  .control-menu-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 32px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 500;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .control-menu-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }

  /* 区块标题 - 多彩侧边条 */
  .section-title {
    position: relative;
    padding-left: 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 12px;
    line-height: 1.4;
  }

  .section-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 18px;
    border-radius: 2px;
  }

  .section-title.accent-cyan::before {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.9), rgba(14, 165, 233, 0.7));
  }

  .section-title.accent-purple::before {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.9), rgba(124, 58, 237, 0.7));
  }

  /* 图表区域 */
  .chart-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--background-secondary);
    border-radius: 10px;
    padding: 12px 6px 12px 2px;
    border: 1px solid var(--background-modifier-border);
  }

  .chart-container {
    flex: 1;
    min-height: 300px;
    width: 100%;
  }

  /* 响应式 */
  @media (max-width: 600px) {
    .ir-load-forecast-modal {
      padding: 8px 4px;
      gap: 8px;
    }

    .tabs-bar {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tabs-left {
      display: flex;
      flex-wrap: nowrap;
      gap: 4px;
      flex: 1;
      justify-content: flex-start;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .tabs-left::-webkit-scrollbar {
      display: none;
    }

    .tabs-bar .tab-btn {
      min-height: 40px;
      padding: 8px 10px;
      min-width: 40px;
      justify-content: center;
    }

    .tabs-right {
      width: 100%;
      justify-content: flex-end;
    }

    .chart-container {
      min-height: 250px;
    }

    .section-title {
      font-size: 13px;
      margin-bottom: 8px;
    }
  }
</style>
