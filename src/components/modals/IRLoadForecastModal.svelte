<!--
  增量阅读负载预测模态窗组件
  统一通过 IRAnalyticsService 提供 forecast / session 快照
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Menu, Platform } from 'obsidian';
  import type AnkiObsidianPlugin from '../../main';
  import type {
    IRAnalyticsForecastPoint,
    IRLoadForecastSnapshot,
    IRStudySessionSnapshot
  } from '../../services/incremental-reading/IRAnalyticsService';
  import { IRAnalyticsService } from '../../services/incremental-reading/IRAnalyticsService';
  import type { IRDeck } from '../../types/ir-types';
  import { createManagedChartRuntime } from '../../utils/chart-runtime';
  import { createGradient } from '../../utils/echarts-theme';
  import { getMobileChartTooltipPosition } from '../../utils/chart-tooltip';
  import { logger } from '../../utils/logger';
  import IRActivityHeatmap from '../analytics/IRActivityHeatmap.svelte';
  import IRStudySessionChart from '../analytics/IRStudySessionChart.svelte';
  import ResizableModal from '../ui/ResizableModal.svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    plugin: AnkiObsidianPlugin;
    initialDeckId?: string;
  }

  type TabType = 'loadRatio' | 'loadForecast' | 'studySessions' | 'activityHeatmap';

  interface ForecastStatusInfo {
    label: string;
    color: string;
  }

  const isMobile = Platform.isMobile;
  const quickRangeOptions = [
    { value: 7, label: '7天' },
    { value: 14, label: '14天' },
    { value: 30, label: '30天' },
    { value: 60, label: '60天' },
    { value: 90, label: '90天' }
  ];

  let { open = $bindable(), onClose, plugin, initialDeckId }: Props = $props();
  let activeTab = $state<TabType>('loadRatio');
  let allIRDecks = $state<IRDeck[]>([]);
  let selectedDeckIds = $state<Set<string>>(new Set());
  let showGlobalLoad = $state(false);
  let selectedDays = $state(30);
  let analyticsService = $state<IRAnalyticsService | null>(null);
  let forecastSnapshot = $state<IRLoadForecastSnapshot | null>(null);
  let sessionSnapshot = $state<IRStudySessionSnapshot | null>(null);
  let isLoading = $state(false);
  let loadError = $state('');
  let loadRequestId = 0;
  let loadForecastChartRef = $state<HTMLDivElement | null>(null);
  let loadRatioChartRef = $state<HTMLDivElement | null>(null);

  async function getAnalyticsService(): Promise<IRAnalyticsService> {
    if (!analyticsService) {
      analyticsService = new IRAnalyticsService(plugin.app);
      await analyticsService.initialize();
    }
    return analyticsService;
  }

  function getSelectedDeckIdArray(): string[] | undefined {
    return showGlobalLoad ? undefined : Array.from(selectedDeckIds);
  }

  async function loadIRDecks(): Promise<void> {
    try {
      const service = await getAnalyticsService();
      const decks = await service.getAvailableDecks();
      allIRDecks = decks;

      if (selectedDeckIds.size > 0) {
        const validIds = new Set(decks.map((deck) => deck.id));
        selectedDeckIds = new Set(Array.from(selectedDeckIds).filter((deckId) => validIds.has(deckId)));
      }

      if (selectedDeckIds.size === 0 && decks.length > 0) {
        const preferredDeck = decks.find((deck) => deck.id === initialDeckId || deck.path === initialDeckId);
        selectedDeckIds = new Set([preferredDeck?.id || decks[0].id]);
      }
    } catch (error) {
      logger.error('[IRLoadForecast] 加载牌组失败:', error);
      allIRDecks = [];
      selectedDeckIds = new Set();
    }
  }

  async function loadSnapshots(): Promise<void> {
    const requestId = ++loadRequestId;
    isLoading = true;
    loadError = '';

    try {
      const service = await getAnalyticsService();
      const deckIds = getSelectedDeckIdArray();
      const [nextForecastSnapshot, nextSessionSnapshot] = await Promise.all([
        service.getLoadForecastSnapshot({
          deckIds,
          days: selectedDays
        }),
        service.getStudySessionSnapshot({
          deckIds
        })
      ]);

      if (requestId !== loadRequestId) return;
      forecastSnapshot = nextForecastSnapshot;
      sessionSnapshot = nextSessionSnapshot;
    } catch (error) {
      if (requestId !== loadRequestId) return;
      logger.error('[IRLoadForecast] 加载分析快照失败:', error);
      loadError = '分析数据加载失败';
      forecastSnapshot = null;
      sessionSnapshot = null;
    } finally {
      if (requestId !== loadRequestId) return;
      isLoading = false;
    }
  }

  function getForecastStatusInfo(
    point: IRAnalyticsForecastPoint,
    theme: {
      loadStatusColors: { low: string; normal: string; high: string; overload: string };
    }
  ): ForecastStatusInfo {
    if (point.totalEstimatedMinutes <= 0 && point.itemCount <= 0) {
      return { label: '负载低', color: theme.loadStatusColors.low };
    }
    if (point.overloadLevel === 'overloaded') {
      return { label: '过载', color: theme.loadStatusColors.overload };
    }
    if (point.overloadLevel === 'warning') {
      return { label: '负载高', color: theme.loadStatusColors.high };
    }
    return { label: '正常', color: theme.loadStatusColors.normal };
  }

  function getRatioColor(
    ratio: number,
    theme: {
      loadStatusColors: { low: string; normal: string; high: string; overload: string };
    }
  ): string {
    if (ratio <= 50) return theme.loadStatusColors.low;
    if (ratio <= 80) return theme.loadStatusColors.normal;
    if (ratio <= 120) return theme.loadStatusColors.high;
    return theme.loadStatusColors.overload;
  }

  const loadForecastChartRuntime = createManagedChartRuntime<IRLoadForecastSnapshot>({
    buildOption(snapshot, theme) {
      const dates = snapshot.forecast.map((point) => point.label);
      const minutes = snapshot.forecast.map((point) => point.totalEstimatedMinutes);

      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          textStyle: { color: theme.textColor, fontSize: 14 },
          confine: true,
          position: isMobile ? getMobileChartTooltipPosition : undefined,
          formatter(params: any) {
            const index = params?.[0]?.dataIndex ?? -1;
            const point = snapshot.forecast[index];
            if (!point) return '';
            const statusInfo = getForecastStatusInfo(point, theme);
            const ratio = snapshot.dailyBudgetMinutes > 0
              ? ((point.totalEstimatedMinutes / snapshot.dailyBudgetMinutes) * 100).toFixed(0)
              : '0';

            return `<div style="padding:12px;min-width:180px;">
              <div style="font-weight:600;font-size:15px;margin-bottom:10px;color:${theme.textColor};">${point.dateKey}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="display:inline-block;width:10px;height:10px;background:${statusInfo.color};border-radius:50%;"></span>
                <span style="color:${theme.textColor};">预计阅读: <strong>${point.totalEstimatedMinutes}</strong> 分钟</span>
              </div>
              <div style="color:${theme.textColor};margin-bottom:6px;">到期内容块: <strong>${point.itemCount}</strong> 个</div>
              <div style="color:${theme.textColor};margin-bottom:6px;">负载率: <strong style="color:${statusInfo.color};">${ratio}%</strong></div>
              <div style="color:${statusInfo.color};font-weight:500;margin-top:8px;padding-top:8px;border-top:1px solid ${theme.splitLineColor};">${statusInfo.label}</div>
              <div style="color:${theme.subTextColor};font-size:12px;margin-top:4px;">时间预算: ${snapshot.dailyBudgetMinutes} 分钟/天</div>
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
          axisLine: { lineStyle: { color: theme.axisLineColor } },
          axisLabel: {
            color: theme.textColor,
            rotate: isMobile ? 45 : (snapshot.days > 30 ? 45 : 0),
            fontSize: isMobile ? 10 : 12
          },
          name: '日期',
          nameLocation: 'middle',
          nameGap: snapshot.days > 30 ? 50 : 35,
          nameTextStyle: { color: theme.textColor, fontSize: 13 }
        },
        yAxis: {
          type: 'value',
          name: '预计阅读时间 (分钟)',
          nameTextStyle: { color: theme.textColor, fontSize: 13 },
          axisLabel: {
            color: theme.textColor,
            formatter: '{value}min'
          },
          splitLine: { lineStyle: { color: theme.splitLineColor, type: 'dashed' } }
        },
        series: [
          {
            name: '预计负载',
            type: 'bar',
            data: minutes,
            itemStyle: {
              color(params: any) {
                const point = snapshot.forecast[params.dataIndex];
                return point ? getForecastStatusInfo(point, theme).color : theme.loadStatusColors.low;
              },
              borderRadius: [4, 4, 0, 0]
            },
            markLine: {
              silent: true,
              symbol: 'none',
              data: [
                {
                  yAxis: snapshot.dailyBudgetMinutes,
                  label: {
                    show: true,
                    formatter: '时间预算',
                    color: theme.textColor,
                    fontSize: 11,
                    position: 'end'
                  },
                  lineStyle: {
                    color: theme.loadStatusColors.overload,
                    type: 'dashed',
                    width: 2
                  }
                }
              ]
            }
          }
        ]
      };
    }
  });

  const loadRatioChartRuntime = createManagedChartRuntime<IRLoadForecastSnapshot>({
    buildOption(snapshot, theme) {
      const ratios = snapshot.forecast.map((point) =>
        snapshot.dailyBudgetMinutes > 0
          ? Math.round((point.totalEstimatedMinutes / snapshot.dailyBudgetMinutes) * 100)
          : 0
      );

      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          textStyle: { color: theme.textColor, fontSize: 14 },
          confine: true,
          position: isMobile ? getMobileChartTooltipPosition : undefined,
          formatter(params: any) {
            const index = params?.[0]?.dataIndex ?? -1;
            const point = snapshot.forecast[index];
            const ratio = ratios[index] ?? 0;
            if (!point) return '';
            const color = getRatioColor(ratio, theme);
            const statusInfo = getForecastStatusInfo(point, theme);

            return `<div style="padding:12px;min-width:160px;">
              <div style="font-weight:600;font-size:15px;margin-bottom:10px;color:${theme.textColor};">${point.dateKey}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;"></span>
                <span style="color:${theme.textColor};">负载率: <strong style="color:${color};">${ratio}%</strong></span>
              </div>
              <div style="color:${theme.textColor};margin-bottom:6px;">预计时间: <strong>${point.totalEstimatedMinutes}</strong> 分钟</div>
              <div style="color:${statusInfo.color};font-weight:500;margin-top:8px;padding-top:8px;border-top:1px solid ${theme.splitLineColor};">${statusInfo.label}</div>
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
          data: snapshot.forecast.map((point) => point.label),
          axisLine: { lineStyle: { color: theme.axisLineColor } },
          axisLabel: {
            color: theme.textColor,
            rotate: isMobile ? 45 : (snapshot.days > 30 ? 45 : 0),
            fontSize: isMobile ? 10 : 12
          },
          name: '日期',
          nameLocation: 'middle',
          nameGap: snapshot.days > 30 ? 50 : 35,
          nameTextStyle: { color: theme.textColor, fontSize: 13 }
        },
        yAxis: {
          type: 'value',
          name: '负载率 (%)',
          nameTextStyle: { color: theme.textColor, fontSize: 13 },
          axisLabel: {
            color: theme.textColor,
            formatter: '{value}%'
          },
          splitLine: { lineStyle: { color: theme.splitLineColor, type: 'dashed' } },
          max(value: { max: number }) {
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
              color: theme.accentColor
            },
            itemStyle: {
              color(params: any) {
                return getRatioColor(Number(params.value || 0), theme);
              },
              borderWidth: 2,
              borderColor: theme.bgColor
            },
            areaStyle: {
              color: createGradient(theme.accentColor, 0.33, 0.03)
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
                    color: theme.loadStatusColors.overload,
                    fontSize: 11,
                    position: 'end'
                  },
                  lineStyle: {
                    color: theme.loadStatusColors.overload,
                    type: 'dashed',
                    width: 2
                  }
                }
              ]
            }
          }
        ]
      };
    }
  });

  function switchTab(tab: TabType) {
    activeTab = tab;
  }

  function toggleDeckSelection(id: string) {
    const next = new Set(selectedDeckIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedDeckIds = next;
    void loadSnapshots();
  }

  function toggleSelectAll() {
    if (selectedDeckIds.size === allIRDecks.length) {
      selectedDeckIds = new Set();
    } else {
      selectedDeckIds = new Set(allIRDecks.map((deck) => deck.id));
    }
    void loadSnapshots();
  }

  function toggleGlobalLoad(useGlobal: boolean) {
    showGlobalLoad = useGlobal;
    void loadSnapshots();
  }

  function selectQuickRange(days: number) {
    if (selectedDays === days) return;
    selectedDays = days;
    void loadSnapshots();
  }

  function showDeckMenu(event: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle(selectedDeckIds.size === allIRDecks.length ? '取消全选' : '全选')
        .setIcon('check-square')
        .onClick(() => toggleSelectAll())
    );

    menu.addSeparator();

    allIRDecks.forEach((deck) => {
      menu.addItem((item) =>
        item
          .setTitle(deck.name)
          .setIcon(selectedDeckIds.has(deck.id) ? 'check' : 'square')
          .onClick(() => toggleDeckSelection(deck.id))
      );
    });

    menu.showAtMouseEvent(event);
  }

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

  function showLegendMenu(event: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) => item.setTitle('负载低 (<50%)').setIcon('circle'));
    menu.addItem((item) => item.setTitle('正常 (50%-80%)').setIcon('circle'));
    menu.addItem((item) => item.setTitle('负载高 (80%-120%)').setIcon('circle'));
    menu.addItem((item) => item.setTitle('过载 (>120%)').setIcon('circle'));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('100% 基准线').setIcon('minus'));

    menu.showAtMouseEvent(event);
  }

  function handleClose() {
    if (typeof onClose === 'function') {
      onClose();
    }
  }

  function getActiveEmptyText(): string {
    if (activeTab === 'studySessions') {
      return '当前筛选条件下，还没有可展示的学习会话。';
    }
    if (activeTab === 'activityHeatmap') {
      return '当前筛选条件下，还没有可展示的活动热力图数据。';
    }
    return showGlobalLoad || selectedDeckIds.size > 0
      ? '当前时间范围内暂无未来负荷数据。'
      : '先选择一个牌组，或切换到全局负荷后再查看图表。';
  }

  $effect(() => {
    loadForecastChartRuntime.setContainer(loadForecastChartRef);
  });

  $effect(() => {
    loadRatioChartRuntime.setContainer(loadRatioChartRef);
  });

  $effect(() => {
    if (forecastSnapshot && activeTab === 'loadForecast') {
      loadForecastChartRuntime.render(forecastSnapshot);
    }
  });

  $effect(() => {
    if (forecastSnapshot && activeTab === 'loadRatio') {
      loadRatioChartRuntime.render(forecastSnapshot);
    }
  });

  onMount(() => {
    void loadIRDecks().then(() => loadSnapshots());

    const handleIRRefresh = () => {
      if (!open) return;
      void loadIRDecks().then(() => loadSnapshots());
    };

    window.addEventListener('Weave:ir-data-updated', handleIRRefresh);
    window.addEventListener('Weave:ir-timer-updated', handleIRRefresh);

    return () => {
      window.removeEventListener('Weave:ir-data-updated', handleIRRefresh);
      window.removeEventListener('Weave:ir-timer-updated', handleIRRefresh);
    };
  });

  onDestroy(() => {
    loadForecastChartRuntime.dispose();
    loadRatioChartRuntime.dispose();
  });
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
        <button
          class="control-icon-btn"
          class:active={showGlobalLoad}
          onclick={() => toggleGlobalLoad(!showGlobalLoad)}
          title={showGlobalLoad ? '当前: 全部内容' : '当前: 选中牌组'}
        >
          <ObsidianIcon name={showGlobalLoad ? 'globe' : 'layers'} size={16} />
        </button>

        {#if !showGlobalLoad && allIRDecks.length > 0}
          <button
            class="control-menu-btn"
            onclick={(event) => showDeckMenu(event)}
          >
            <ObsidianIcon name="folder" size={14} />
            <span>{selectedDeckIds.size}/{allIRDecks.length}</span>
            <ObsidianIcon name="chevron-down" size={12} />
          </button>
        {/if}

        {#if activeTab === 'loadRatio' || activeTab === 'loadForecast'}
          <button
            class="control-menu-btn"
            onclick={(event) => showDaysMenu(event)}
          >
            <ObsidianIcon name="calendar-days" size={14} />
            <span>{selectedDays}天</span>
            <ObsidianIcon name="chevron-down" size={12} />
          </button>
          <button
            class="control-icon-btn"
            onclick={(event) => showLegendMenu(event)}
            title="负载状态说明"
          >
            <ObsidianIcon name="info" size={14} />
          </button>
        {/if}
      </div>
    </div>

    {#if isLoading}
      <div class="state-panel state-panel--loading">
        <ObsidianIcon name="loader" size={18} />
        <span>正在生成分析图表…</span>
      </div>
    {:else if loadError}
      <div class="state-panel state-panel--error">{loadError}</div>
    {:else if activeTab === 'loadRatio'}
      <div class="chart-section">
        <div class="section-title with-accent-bar accent-purple">
          未来 {selectedDays} 天负载率趋势
        </div>
        {#if forecastSnapshot && (showGlobalLoad || selectedDeckIds.size > 0)}
          <div class="chart-container" bind:this={loadRatioChartRef}></div>
        {:else}
          <div class="state-panel state-panel--empty">{getActiveEmptyText()}</div>
        {/if}
      </div>
    {:else if activeTab === 'loadForecast'}
      <div class="chart-section">
        <div class="section-title with-accent-bar accent-cyan">
          未来 {selectedDays} 天预计阅读时间
        </div>
        {#if forecastSnapshot && (showGlobalLoad || selectedDeckIds.size > 0)}
          <div class="chart-container" bind:this={loadForecastChartRef}></div>
        {:else}
          <div class="state-panel state-panel--empty">{getActiveEmptyText()}</div>
        {/if}
      </div>
    {:else if activeTab === 'studySessions'}
      <div class="chart-section">
        <div class="section-title with-accent-bar accent-purple">
          历史学习会话
        </div>
        <IRStudySessionChart snapshot={sessionSnapshot} />
      </div>
    {:else}
      <div class="chart-section">
        <div class="section-title with-accent-bar accent-green">
          年度活动热力图
        </div>
        <IRActivityHeatmap snapshot={sessionSnapshot} />
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

  .section-title.accent-green::before {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(22, 163, 74, 0.7));
  }

  .chart-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .chart-container {
    flex: 1;
    min-height: 420px;
    width: 100%;
    background: var(--background-primary);
    border-radius: 10px;
  }

  .state-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 180px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-muted);
    font-size: 13px;
  }

  .state-panel--error {
    color: var(--text-error);
  }

  .state-panel--empty {
    border-style: dashed;
    text-align: center;
    padding: 24px;
  }
</style>
