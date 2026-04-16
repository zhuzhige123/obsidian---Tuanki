<!--
  牌组分析模态窗组件
  显示记忆保持率趋势图表和分析数据
-->
<script lang="ts">
  import { logger } from '../../utils/logger';

  import { onMount, onDestroy, untrack } from 'svelte';
  import { Platform, Menu } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { Card, Deck } from '../../data/types';
  import { currentLanguage } from '../../utils/i18n';
  import type { SupportedLanguage } from '../../utils/i18n';
  import { createDeckAnalyticsText, formatDeckAnalyticsShortDate } from './deck-analytics-text';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import { LoadStatus } from '../../services/LoadBalanceManager';
  import * as echarts from 'echarts/core';
  import {
    TooltipComponent,
    GridComponent,
    LegendComponent
  } from 'echarts/components';
  import { LineChart, BarChart, ScatterChart } from 'echarts/charts';
  import { CanvasRenderer } from 'echarts/renderers';
  import { LabelLayout } from 'echarts/features';
  import { applyRetentionChartLayout, createRetentionChartGrid, createRetentionScrollableLegend } from '../charts/retentionChartStyle';
  import { bindPinchRangeGesture } from '../../utils/pinch-range-gesture';

  // 注册ECharts组件
  echarts.use([
    TooltipComponent,
    GridComponent,
    LegendComponent,
    LineChart,
    BarChart,
    ScatterChart,
    LabelLayout,
    CanvasRenderer
  ]);

  type AnalyticsTab = 'retention' | 'quantity' | 'timing' | 'difficulty' | 'loadForecast';

  interface Props {
    /** 插件实例 */
    plugin: WeavePlugin;

    /** 当前牌组ID */
    deckId?: string;

    /** 牌组卡片列表 */
    cards?: Card[];
    
    /** 初始标签页 */
    initialTab?: AnalyticsTab;
  }

  let {
    plugin,
    deckId,
    cards = [],
    initialTab = 'retention'
  }: Props = $props();

  // 标签页状态：弹窗打开时读取一次初始标签页，后续由组件内切换维护
  let activeTab = $state<AnalyticsTab>(untrack(() => initialTab));
  const uiLanguage = $derived(((plugin.settings?.language as SupportedLanguage | undefined) ?? $currentLanguage ?? 'zh-CN'));
  const isEnglishUI = $derived(uiLanguage === 'en-US');
  const uiText = $derived.by(() => createDeckAnalyticsText(uiLanguage));
  
  // 图表容器引用
  let retentionChartRef: HTMLDivElement | null = $state(null);
  let quantityChartRef: HTMLDivElement | null = $state(null);
  let timingChartRef: HTMLDivElement | null = $state(null);
  let difficultyChartRef: HTMLDivElement | null = $state(null);
  let loadForecastChartRef: HTMLDivElement | null = $state(null);
  let retentionChart: echarts.ECharts | null = null;
  let quantityChart: echarts.ECharts | null = null;
  let timingChart: echarts.ECharts | null = null;
  let difficultyChart: echarts.ECharts | null = null;
  let loadForecastChart: echarts.ECharts | null = null;
  let themeObserver: MutationObserver | null = null;
  let renderedLanguage = $state<SupportedLanguage | null>(null);
  const pinchGestureCleanupMap = new Map<HTMLDivElement, () => void>();
  
  // 多牌组选择
  let allDecks = $state<Deck[]>([]); // 所有可用牌组
  let selectedDeckIds = $state<Set<string>>(new Set()); // 已选中的牌组ID
  
  // 时间范围展开状态：'quick' | 'custom' | null（互斥显示）
  let filterPanelOpen = $state(false);
  let expandedRange = $state<'quick' | 'custom' | null>('quick');
  let rangeSelectionMode = $state<'quick' | 'custom'>('quick');
  let deckCardsMap = $state<Map<string, Card[]>>(new Map()); // 牌组ID -> 卡片列表
  let showGlobalLoad = $state(false); // 是否显示全局负荷（所有卡片）
  
  // 多牌组的颜色配置
  const deckColors = [
    '#7C3AED', // 紫色
    '#2563EB', // 蓝色
    '#059669', // 绿色
    '#D97706', // 橙色
    '#DC2626', // 红色
    '#0891B2', // 青色
    '#7C2D12', // 棕色
    '#4F46E5', // 靛蓝
  ];
  
  // 获取牌组颜色
  function getDeckColor(index: number): string {
    return deckColors[index % deckColors.length];
  }
  
  // 计算当前显示的卡片（合并多牌组）
  const displayCards = $derived.by(() => {
    if (selectedDeckIds.size === 0) {
      return cards; // 未选择时使用传入的cards
    }
    const allCards: Card[] = [];
    selectedDeckIds.forEach(id => {
      const deckCards = deckCardsMap.get(id);
      if (deckCards) {
        allCards.push(...deckCards);
      }
    });
    return allCards;
  });
  
  // 数据状态检查（使用 displayCards 支持多牌组）
  const activeCards = $derived(displayCards.length > 0 ? displayCards : cards);
  const hasCards = $derived(activeCards && activeCards.length > 0);
  const hasReviewData = $derived(activeCards && activeCards.filter(c => c.reviewHistory && c.reviewHistory.length > 0).length > 0);
  const cardCount = $derived(activeCards ? activeCards.length : 0);
  const reviewedCardCount = $derived(activeCards ? activeCards.filter(c => c.reviewHistory && c.reviewHistory.length > 0).length : 0);
  const retentionSummaryData = $derived.by(() => {
    const retentionPoints = generateRetentionData(selectedDays);
    return {
      targetRetention: getTargetRetentionPercent(),
      avgRetrievability: getLatestDefinedValue(retentionPoints.map(point => point.avgRetrievability)),
      trueRetention: getLatestDefinedValue(retentionPoints.map(point => point.trueRetention)),
      latestSample: retentionPoints.reduceRight((sample, point) => sample || point.reviewSample, 0)
    };
  });
  
  // 加载所有牌组列表
  async function loadAllDecks() {
    try {
      const decks = await plugin.dataStorage.getDecks();
      // 只显示记忆牌组（排除题库）
      allDecks = decks.filter((d: any) => d.type !== 'question-bank');
      logger.debug('[DeckAnalytics] 加载牌组列表:', allDecks.length);
      
      // 如果传入了deckId，默认选中它
      if (deckId) {
        selectedDeckIds = new Set([deckId]);
        // 加载该牌组的卡片
        await loadDeckCards(deckId);
      }
    } catch (error) {
      logger.error('[DeckAnalytics] 加载牌组列表失败:', error);
    }
  }
  
  // 加载指定牌组的卡片
  async function loadDeckCards(id: string) {
    if (deckCardsMap.has(id)) return; // 已缓存
    try {
      const deckCards = await plugin.dataStorage.getDeckCards(id);
      deckCardsMap.set(id, deckCards);
      deckCardsMap = new Map(deckCardsMap); // 触发响应式更新
    } catch (error) {
      logger.error('[DeckAnalytics] 加载牌组卡片失败:', id, error);
    }
  }
  
  // 切换牌组选择
  async function toggleDeckSelection(id: string) {
    const newSet = new Set(selectedDeckIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
      await loadDeckCards(id);
    }
    selectedDeckIds = newSet;
    
    // 更新图表
    setTimeout(() => updateAllCharts(), 100);
  }
  
  // 全选/取消全选
  async function toggleSelectAll() {
    if (selectedDeckIds.size === allDecks.length) {
      // 取消全选
      selectedDeckIds = new Set();
    } else {
      // 全选
      const newSet = new Set<string>();
      for (const deck of allDecks) {
        newSet.add(deck.id);
        await loadDeckCards(deck.id);
      }
      selectedDeckIds = newSet;
    }
    setTimeout(() => updateAllCharts(), 100);
  }
  
  // 更新所有图表
  function updateAllCharts() {
    if (activeTab === 'retention' && retentionChart) {
      initRetentionChart();
    } else if (activeTab === 'quantity' && quantityChart) {
      initQuantityChart();
    } else if (activeTab === 'difficulty' && difficultyChart) {
      initDifficultyChart();
    } else if (activeTab === 'loadForecast' && loadForecastChart) {
      initLoadForecastChart();
    }
    // timing图表不需要多牌组对比
  }
  
  // 时间范围状态
  const today = new Date();
  const defaultStartDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // 默认30天前
  
  let startDate = $state(defaultStartDate);
  let endDate = $state(today);
  let selectedDays = $state(30);
  let isUpdating = $state(false);
  let wheelThrottle = false;
  const WHEEL_THROTTLE_MS = 200;
  
  // 快捷时间范围选项
  const quickRangeOptions = $derived.by(() => (
    [7, 14, 30, 60, 90].map((value) => ({
      value,
      label: uiText.range.lastDaysLabel(value),
      mobileLabel: uiText.range.lastDaysShort(value)
    }))
  ));
  
  // 移动端检测
  const isMobile = Platform.isMobile;
  
  // 移动端 tooltip 位置函数，偏上显示避免被手指遮挡
  function getMobileTooltipPosition(point: number[], params: any, dom: HTMLElement, rect: any, size: any) {
    if (!isMobile) return null; // 桌面端使用默认位置
    
    const viewWidth = size.viewSize[0];
    const viewHeight = size.viewSize[1];
    const contentWidth = size.contentSize[0];
    const contentHeight = size.contentSize[1];
    
    // 计算x位置，确保不超出边界
    let x = point[0] - contentWidth / 2;
    if (x < 10) x = 10;
    if (x + contentWidth > viewWidth - 10) x = viewWidth - contentWidth - 10;
    
    // y位置偏上显示，在点击位置上方
    let y = point[1] - contentHeight - 30;
    if (y < 10) y = 10; // 如果超出顶部，则显示在顶部
    
    return [x, y];
  }
  
  // 计算当前选中的快捷范围
  const currentQuickRange = $derived.by(() => {
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  });

  const rangeSummaryText = $derived.by(() => {
    if (rangeSelectionMode === 'quick') {
      const quickMatch = quickRangeOptions.find((option) => option.value === currentQuickRange);
      if (quickMatch) return quickMatch.label;
    }
    const start = formatShortDate(startDate);
    const end = formatShortDate(endDate);
    return `${start} ${uiText.range.separator} ${end}`;
  });

  // 获取当前主题颜色
  function getThemeColors() {
    const isDark = document.body.classList.contains('theme-dark');
    const accentColor = getComputedStyle(document.body).getPropertyValue('--interactive-accent').trim();
    return {
      textColor: isDark ? '#e0e0e0' : '#2c3e50',
      axisLineColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
      splitLineColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      tooltipBg: isDark ? '#1a1a1a' : '#ffffff',
      tooltipBorder: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
      accentColor: accentColor || (isDark ? '#8f87ff' : '#6f62f6')
    };
  }

  function formatShortDate(date: Date): string {
    return formatDeckAnalyticsShortDate(date, uiLanguage);
  }

  function getTargetRetentionPercent(): number {
    const configuredRetention = plugin.settings?.fsrsParams?.requestRetention ?? 0.9;
    return parseFloat((Math.min(Math.max(configuredRetention, 0.5), 0.99) * 100).toFixed(1));
  }

  function getLatestDefinedValue(values: Array<number | null>): number | null {
    for (let i = values.length - 1; i >= 0; i--) {
      const value = values[i];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  type RetentionSeriesPoint = {
    date: string;
    avgRetrievability: number | null;
    trueRetention: number | null;
    targetRetention: number;
    reviewSample: number;
  };

  function calculateAverageRetrievabilityForCards(deckCards: Card[], targetEndTime: number): number | null {
    const cardsWithReviews = (deckCards || []).filter(card => card.reviewHistory && card.reviewHistory.length > 0);
    if (cardsWithReviews.length === 0) return null;

    let totalRetrievability = 0;
    let count = 0;

    cardsWithReviews.forEach(card => {
      const reviewsBefore = (card.reviewHistory || [])
        .filter(review => new Date(review.review).getTime() <= targetEndTime)
        .sort((a, b) => new Date(b.review).getTime() - new Date(a.review).getTime());

      if (reviewsBefore.length === 0) return;

      const lastReview = reviewsBefore[0];
      const elapsed = (targetEndTime - new Date(lastReview.review).getTime()) / (1000 * 60 * 60 * 24);
      const stability = lastReview.stability || card.fsrs?.stability || 7;
      const retrievability = Math.exp(-elapsed / Math.max(stability, 0.01)) * 100;

      totalRetrievability += retrievability;
      count++;
    });

    return count > 0 ? parseFloat((totalRetrievability / count).toFixed(1)) : null;
  }

  // 为单个牌组生成记忆保持率数据（基于日期维度的 FSRS 预测保持率）
  function generateRetentionDataForDeck(deckCards: Card[], days: number): { dates: string[]; retrievabilityData: (number | null)[]; targetRetention: number } {
    const dates: string[] = [];
    const retrievabilityData: (number | null)[] = [];
    const today = new Date();
    const targetRetention = getTargetRetentionPercent();
    
    for (let i = days - 1; i >= 0; i--) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() - i);
      dates.push(formatShortDate(targetDate));
      const targetEnd = new Date(targetDate);
      targetEnd.setHours(23, 59, 59, 999);
      retrievabilityData.push(calculateAverageRetrievabilityForCards(deckCards, targetEnd.getTime()));
    }
    
    return { dates, retrievabilityData, targetRetention };
  }
  
  // 生成真实记忆保持率数据（基于 FSRS）
  function generateRetentionData(days: number): RetentionSeriesPoint[] {
    const data: RetentionSeriesPoint[] = [];
    const today = new Date();
    const currentCards = activeCards;
    const targetRetention = getTargetRetentionPercent();
    
    if (currentCards && currentCards.length > 0) {
      const cardsWithReviews = currentCards.filter(c => c.reviewHistory && c.reviewHistory.length > 0);
      
      for (let i = days - 1; i >= 0; i--) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - i);
        const dateLabel = formatShortDate(targetDate);
        const targetStart = new Date(targetDate);
        targetStart.setHours(0, 0, 0, 0);
        const targetEnd = new Date(targetDate);
        targetEnd.setHours(23, 59, 59, 999);
        const targetEndTime = targetEnd.getTime();
        
        let totalRetrievability = 0;
        let retrievabilityCount = 0;
        let passedFirstReviews = 0;
        let firstReviewSample = 0;
        
        cardsWithReviews.forEach(card => {
          if (!card.reviewHistory) return;
          
          const reviewsBefore = card.reviewHistory
            .filter(r => new Date(r.review).getTime() <= targetEndTime)
            .sort((a, b) => new Date(b.review).getTime() - new Date(a.review).getTime());
          
          if (reviewsBefore.length > 0) {
            const lastReview = reviewsBefore[0];
            const elapsed = (targetEndTime - new Date(lastReview.review).getTime()) / (1000 * 60 * 60 * 24);
            const stability = lastReview.stability || card.fsrs?.stability || 7;
            const retrievability = Math.exp(-elapsed / Math.max(stability, 0.01)) * 100;
            totalRetrievability += retrievability;
            retrievabilityCount++;
          }
          
          const reviewsOnDay = card.reviewHistory
            .filter(log => {
              const reviewDate = new Date(log.review);
              return reviewDate >= targetStart && reviewDate <= targetEnd;
            })
            .sort((a, b) => new Date(a.review).getTime() - new Date(b.review).getTime());

          const firstReview = reviewsOnDay[0];
          if (firstReview && (firstReview.state === 2 || firstReview.state === 3 || (firstReview.scheduledDays ?? 0) > 0)) {
            firstReviewSample++;
            if (firstReview.rating >= 2) {
              passedFirstReviews++;
            }
          }
        });
        
        data.push({
          date: dateLabel,
          avgRetrievability: retrievabilityCount > 0 ? parseFloat((totalRetrievability / retrievabilityCount).toFixed(1)) : null,
          trueRetention: firstReviewSample > 0 ? parseFloat(((passedFirstReviews / firstReviewSample) * 100).toFixed(1)) : null,
          targetRetention,
          reviewSample: firstReviewSample
        });
      }
    } else {
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        data.push({
          date: formatShortDate(date),
          avgRetrievability: null,
          trueRetention: null,
          targetRetention,
          reviewSample: 0
        });
      }
    }
    
    return data;
  }

  // 初始化记忆率图表
  function initRetentionChart() {
    if (!retentionChartRef) return;

    // 创建图表实例
    retentionChart = echarts.init(retentionChartRef);

    const colors = getThemeColors();
    const isMultiDeck = selectedDeckIds.size > 1;
    
    // 多牌组对比模式
    if (isMultiDeck) {
      const selectedDecksArray = Array.from(selectedDeckIds);
      const legendData: string[] = [];
      const series: any[] = [];
      let dateLabels: string[] = [];
      
      // 为每个牌组生成独立的曲线
      selectedDecksArray.forEach((deckId, index) => {
        const deck = allDecks.find(d => d.id === deckId);
        const deckCards = deckCardsMap.get(deckId) || [];
        const deckName = deck?.name || `${uiText.deckFallbackPrefix}${index + 1}`;
        const color = getDeckColor(index);
        
        legendData.push(deckName);
        const { dates, retrievabilityData } = generateRetentionDataForDeck(deckCards, selectedDays);
        if (dateLabels.length === 0) dateLabels = dates;
        
        series.push({
          name: deckName,
          type: 'line',
          data: retrievabilityData,
          connectNulls: true,
          smooth: true,
          lineStyle: { color, width: 2 },
          itemStyle: { color },
          symbolSize: 4
        });
      });
      
      // 添加目标保持率线
      legendData.push(uiText.retention.targetRetention);
      series.push({
        name: uiText.retention.targetRetention,
        type: 'line',
        data: dateLabels.map(() => getTargetRetentionPercent()),
        lineStyle: { color: '#f5576c', width: 2, type: 'dashed' },
        itemStyle: { color: '#f5576c' },
        symbol: 'none'
      });
      
      const option = {
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
            let html = `<div style="padding: 12px;">`;
            html += `<div style="font-weight: 600; font-size: 16px; margin-bottom: 12px; color: ${colors.textColor};">${params[0].axisValue}</div>`;
            params.forEach((param: any) => {
              if (param.value !== null && param.value !== undefined && typeof param.value === 'number') {
                html += `<div style="display: flex; align-items: center; margin: 6px 0;">`;
                html += `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${param.color}; margin-right: 8px;"></span>`;
                html += `<span style="color: ${colors.textColor}; font-size: 13px;">${param.seriesName}:</span>`;
                html += `<strong style="margin-left: 8px; color: ${param.color}; font-size: 14px;">${param.value.toFixed(1)}%</strong>`;
                html += `</div>`;
              }
            });
            html += `</div>`;
            return html;
          }
        },
        legend: createRetentionScrollableLegend(legendData, colors, isMobile),
        grid: createRetentionChartGrid(isMobile, true),
        xAxis: {
          type: 'category',
          data: dateLabels,
          name: uiText.retention.axisX,
          nameLocation: 'middle',
          nameGap: 24,
          axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10], lineStyle: { color: colors.axisLineColor } },
          axisLabel: { color: colors.textColor, fontSize: 12 },
          nameTextStyle: { color: colors.textColor, fontSize: 12 }
        },
        yAxis: {
          type: 'value',
          name: uiText.retention.axisY,
          min: 0,
          max: 100,
          axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10], lineStyle: { color: colors.axisLineColor } },
          axisLabel: { color: colors.textColor, formatter: '{value}%', fontSize: 12 },
          nameTextStyle: { color: colors.textColor, fontSize: 12 },
          splitLine: { lineStyle: { color: colors.splitLineColor, type: 'dashed' } }
        },
        series
      };
      
      applyRetentionChartLayout(option, colors, isMobile);
      retentionChart.setOption(option, true);
      return;
    }
    
    // 单牌组模式
    const data = generateRetentionData(selectedDays);

    const option = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: {
          color: colors.textColor,
          fontSize: 14
        },
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.2)',
        extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
        confine: true,
        position: isMobile ? getMobileTooltipPosition : undefined,
        formatter: function(params: any) {
          let html = `<div style="padding: 12px; font-family: var(--font-interface);">`;
          html += `<div style="font-weight: 600; font-size: 16px; margin-bottom: 12px; color: ${colors.textColor};">${params[0].axisValue}</div>`;
          const dataIndex = typeof params[0]?.dataIndex === 'number' ? params[0].dataIndex : -1;
          const point = dataIndex >= 0 ? data[dataIndex] : null;
          params.forEach((param: any) => {
            if (param.value !== null && param.value !== undefined && typeof param.value === 'number') {
              const color = param.color;
              
              html += `<div style="display: flex; align-items: center; margin: 8px 0; line-height: 1.4;">`;
              html += `<span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${color}; margin-right: 10px;"></span>`;
              html += `<span style="color: ${colors.textColor}; font-size: 14px;">${param.seriesName}:</span>`;
              html += `<strong style="margin-left: 8px; color: var(--interactive-accent); font-size: 15px;">${param.value.toFixed(1)}%</strong>`;
              html += `</div>`;

              if (point && param.seriesName === uiText.retention.firstReviewPassRate && point.reviewSample > 0) {
                html += `<div style="margin: -2px 0 8px 22px; color: ${colors.textColor}; opacity: 0.75; font-size: 12px;">`;
                html += uiText.misc.firstReviewSamples(point.reviewSample);
                html += `</div>`;
              }
            }
          });
          html += `</div>`;
          return html;
        }
      },
      grid: createRetentionChartGrid(isMobile, false),
      xAxis: {
        type: 'category',
        data: data.map(d => d.date),
          name: uiText.retention.axisX,
        nameLocation: 'middle',
        nameGap: 30,
        axisLine: {
          show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10],
          lineStyle: { color: colors.axisLineColor }
        },
        axisLabel: {
          color: colors.textColor,
          fontSize: 12
        },
        nameTextStyle: {
          color: colors.textColor,
          fontSize: 13
        }
      },
      yAxis: {
        type: 'value',
        name: uiText.retention.axisY,
        min: 0,
        max: 100,
        axisLine: {
          show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10],
          lineStyle: { color: colors.axisLineColor }
        },
        axisLabel: {
          color: colors.textColor,
          formatter: '{value}%',
          fontSize: 12
        },
        nameTextStyle: {
          color: colors.textColor,
          fontSize: 13
        },
        splitLine: {
          lineStyle: {
            color: colors.splitLineColor,
            type: 'dashed'
          }
        }
      },
      series: [
        {
          name: uiText.retention.avgPredictedRecall,
          type: 'line',
          data: data.map(d => d.avgRetrievability),
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
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(102, 126, 234, 0.3)' },
                { offset: 1, color: 'rgba(102, 126, 234, 0.05)' }
              ]
            }
          }
        },
        {
          name: uiText.retention.firstReviewPassRate,
          type: 'line',
          data: data.map(d => d.trueRetention),
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
          name: uiText.retention.targetRetention,
          type: 'line',
          data: data.map(d => d.targetRetention),
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
    };

    retentionChart.setOption(option);

    // 点击事件
    retentionChart.on('click', function(params: any) {
      if (params.seriesName === uiText.retention.firstReviewPassRate && params.value < getTargetRetentionPercent()) {
        logger.debug(`第 ${params.name} 天的首次复习通过率为 ${params.value.toFixed(1)}%`);
      }
    });
  }
  
  // 生成真实卡片数量变化数据（基于卡片状态）
  function generateQuantityData(days: number) {
    const data = {
      dates: [] as string[],
      newCards: [] as number[],
      learning: [] as number[],
      review: [] as number[],
      mastered: [] as number[],
      masteryRate: [] as number[]
    };

    const today = new Date();
    const currentCards = activeCards; // 使用activeCards支持多牌组
    
    // 如果有真实卡片数据，按状态统计
    if (currentCards && currentCards.length > 0) {
      for (let i = days - 1; i >= 0; i--) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - i);
        targetDate.setHours(23, 59, 59, 999); // 设置为当天结束时间
        data.dates.push(formatShortDate(targetDate));

        // 统计该日期时各状态的卡片数量
        let newCount = 0, learningCount = 0, reviewCount = 0, masteredCount = 0;
        
        currentCards.forEach(card => {
          const createdDate = new Date(card.created);
          
          // 只统计在该日期之前创建的卡片
          if (createdDate <= targetDate) {
            // 根据FSRS状态分类
            // state: 0=New, 1=Learning, 2=Review, 3=Relearning
            const state = card.fsrs?.state ?? 0;
            
            switch (state) {
              case 0:
                newCount++;
                break;
              case 1:
              case 3: // Relearning归入学习中
                learningCount++;
                break;
              case 2:
                // 根据稳定性判断是否已掌握（稳定性>21天视为已掌握）
                if (card.fsrs?.stability && card.fsrs.stability > 21) {
                  masteredCount++;
                } else {
                  reviewCount++;
                }
                break;
            }
          }
        });

        data.newCards.push(newCount);
        data.learning.push(learningCount);
        data.review.push(reviewCount);
        data.mastered.push(masteredCount);

        const total = newCount + learningCount + reviewCount + masteredCount;
        const rate = total > 0 ? ((masteredCount / total) * 100) : 0;
        data.masteryRate.push(parseFloat(rate.toFixed(1)));
      }
    } else {
      // 📉 如果没有数据，返回空数据
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        data.dates.push(`${date.getMonth() + 1}/${date.getDate()}`);
        
        data.newCards.push(0);
        data.learning.push(0);
        data.review.push(0);
        data.mastered.push(0);
        data.masteryRate.push(0);
      }
    }

    return data;
  }
  
  // 初始化卡片数量图表
  function initQuantityChart() {
    if (!quantityChartRef) return;

    quantityChart = echarts.init(quantityChartRef);
    const data = generateQuantityData(selectedDays);
    const colors = getThemeColors();

    const option = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: {
          color: colors.textColor,
          fontSize: 14
        },
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.2)',
        extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
        confine: true,
        position: isMobile ? getMobileTooltipPosition : undefined,
        axisPointer: {
          type: 'cross'
        }
      },
      legend: {
        data: [uiText.quantity.newCards, uiText.quantity.learning, uiText.quantity.review, uiText.quantity.mastered, uiText.quantity.masteryRate],
        bottom: 20,
        textStyle: {
          color: colors.textColor,
          fontSize: 13
        },
        itemGap: 20,
        icon: 'circle'
      },
      grid: {
        left: isMobile ? '1%' : '2%',
        right: isMobile ? '2%' : '6%',
        bottom: isMobile ? '12%' : '15%',
        top: isMobile ? '8%' : '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: data.dates,
        name: uiText.quantity.axisX,
        nameLocation: 'middle',
        nameGap: 30,
        axisLine: {
          show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10],
          lineStyle: { color: colors.axisLineColor }
        },
        axisLabel: {
          color: colors.textColor,
          fontSize: 12
        },
        nameTextStyle: {
          color: colors.textColor,
          fontSize: 13
        }
      },
      yAxis: [
        {
          type: 'value',
          name: uiText.quantity.axisCount,
          position: 'left',
          axisLine: {
            show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10],
            lineStyle: { color: colors.axisLineColor }
          },
          axisLabel: {
            color: colors.textColor,
            fontSize: 12
          },
          nameTextStyle: {
            color: colors.textColor,
            fontSize: 13
          },
          splitLine: {
            lineStyle: {
              color: colors.splitLineColor,
              type: 'dashed'
            }
          }
        },
        {
          type: 'value',
          name: uiText.quantity.axisRate,
          position: 'right',
          min: 0,
          max: 100,
          axisLine: {
            show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10],
            lineStyle: { color: colors.axisLineColor }
          },
          axisLabel: {
            color: colors.textColor,
            fontSize: 12,
            formatter: '{value}%'
          },
          nameTextStyle: {
            color: colors.textColor,
            fontSize: 13
          },
          splitLine: {
            show: false
          }
        }
      ],
      series: [
        {
          name: uiText.quantity.newCards,
          type: 'bar',
          stack: uiText.quantity.stack,
          barWidth: '60%',
          itemStyle: {
            color: '#4facfe'
          },
          data: data.newCards
        },
        {
          name: uiText.quantity.learning,
          type: 'bar',
          stack: uiText.quantity.stack,
          itemStyle: {
            color: '#feca57'
          },
          data: data.learning
        },
        {
          name: uiText.quantity.review,
          type: 'bar',
          stack: uiText.quantity.stack,
          itemStyle: {
            color: '#ff9ff3'
          },
          data: data.review
        },
        {
          name: uiText.quantity.mastered,
          type: 'bar',
          stack: uiText.quantity.stack,
          itemStyle: {
            color: '#48dbfb'
          },
          data: data.mastered
        },
        {
          name: uiText.quantity.masteryRate,
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            width: 3,
            color: '#667eea'
          },
          itemStyle: {
            color: '#667eea',
            borderColor: '#fff',
            borderWidth: 2
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(102, 126, 234, 0.3)' },
                { offset: 1, color: 'rgba(102, 126, 234, 0.05)' }
              ]
            }
          },
          data: data.masteryRate
        }
      ]
    };

    applyRetentionChartLayout(option, colors, isMobile);
    quantityChart.setOption(option);
  }
  
  // 生成真实复习时机数据（基于 reviewHistory）
  function generateTimingData(days: number) {
    const data = {
      dates: [] as string[],
      early: [] as number[],
      ontime: [] as number[],
      late: [] as number[]
    };

    const today = new Date();
    const currentCards = activeCards; // 使用activeCards支持多牌组
    
    // 如果有真实卡片数据，统计复习时机
    if (currentCards && currentCards.length > 0) {
      for (let i = days - 1; i >= 0; i--) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - i);
        const targetDateStr = targetDate.toDateString();
        data.dates.push(formatShortDate(targetDate));

        let earlyCount = 0, ontimeCount = 0, lateCount = 0;
        
        currentCards.forEach(card => {
          if (!card.reviewHistory || card.reviewHistory.length === 0) return;
          
          card.reviewHistory.forEach((log) => {
            const reviewDate = new Date(log.review);
            const dueDate = new Date(log.due);
            
            // 判断是否在目标日期
            if (reviewDate.toDateString() === targetDateStr) {
              // 计算时间差（小时）
              const diffHours = (reviewDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60);
              
              if (diffHours < -24) {
                earlyCount++;
              } else if (diffHours > 24) {
                lateCount++;
              } else {
                ontimeCount++;
              }
            }
          });
        });

        const total = earlyCount + ontimeCount + lateCount;
        if (total > 0) {
          data.early.push(Math.round((earlyCount / total) * 100));
          data.ontime.push(Math.round((ontimeCount / total) * 100));
          data.late.push(Math.round((lateCount / total) * 100));
        } else {
          // 该天没有复习记录
          data.early.push(0);
          data.ontime.push(0);
          data.late.push(0);
        }
      }
    } else {
      // 📉 如果没有数据，返回空数据
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        data.dates.push(`${date.getMonth() + 1}/${date.getDate()}`);
        
        data.early.push(0);
        data.ontime.push(0);
        data.late.push(0);
      }
    }

    return data;
  }
  
  // 生成难度-标签矩阵数据
  function generateDifficultyTagData() {
    const data: Array<{ tag: string; difficulty: number; count: number }> = [];
    const currentCards = activeCards; // 使用activeCards支持多牌组
    
    if (!currentCards || currentCards.length === 0) return data;
    
    // 统计每个标签的难度和卡片数量
    const tagStats = new Map<string, { difficulties: number[]; count: number }>();
    
    currentCards.forEach(card => {
      if (!card.tags || card.tags.length === 0 || !card.fsrs || card.fsrs.difficulty === undefined) return;
      
      const difficulty = card.fsrs.difficulty;
      
      card.tags.forEach(tag => {
        if (!tagStats.has(tag)) {
          tagStats.set(tag, { difficulties: [], count: 0 });
        }
        const stat = tagStats.get(tag)!;
        stat.difficulties.push(difficulty);
        stat.count++;
      });
    });
    
    // 转换为散点数据（计算平均难度）
    tagStats.forEach((stat, tag) => {
      const avgDifficulty = stat.difficulties.reduce((sum, d) => sum + d, 0) / stat.difficulties.length;
      data.push({
        tag,
        difficulty: avgDifficulty,
        count: stat.count
      });
    });
    
    // 按卡片数量排序，取Top 20
    return data.sort((a, b) => b.count - a.count).slice(0, 20);
  }
  
  // 初始化难度-标签图表
  function initDifficultyChart() {
    if (!difficultyChartRef) return;
    
    difficultyChart = echarts.init(difficultyChartRef);
    const data = generateDifficultyTagData();
    const colors = getThemeColors();
    
    const option = {
      tooltip: {
        trigger: 'item',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: {
          color: colors.textColor,
          fontSize: 14
        },
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.2)',
        extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
        confine: true,
        position: isMobile ? getMobileTooltipPosition : undefined,
        formatter: function(params: any) {
          const item = data[params.dataIndex];
          let html = `<div style="padding: 12px; font-family: var(--font-interface);">`;
          html += `<div style="font-weight: 600; font-size: 16px; margin-bottom: 12px; color: ${colors.textColor};">${item.tag}</div>`;
          html += `<div style="display: flex; align-items: center; margin: 8px 0;">`;
          html += `<span style="color: ${colors.textColor}; font-size: 14px;">${uiText.difficulty.axisDifficulty}:</span>`;
          html += `<strong style="margin-left: 8px; color: var(--interactive-accent); font-size: 15px;">${item.difficulty.toFixed(1)}</strong>`;
          html += `</div>`;
          html += `<div style="display: flex; align-items: center; margin: 8px 0;">`;
          html += `<span style="color: ${colors.textColor}; font-size: 14px;">${uiText.difficulty.count}:</span>`;
          html += `<strong style="margin-left: 8px; color: var(--interactive-accent); font-size: 15px;">${item.count}${uiText.difficulty.cardsUnit}</strong>`;
          html += `</div>`;
          html += `</div>`;
          return html;
        }
      },
      grid: {
        left: isMobile ? 20 : 32,
        right: isMobile ? 10 : 40,
        top: isMobile ? 25 : 40,
        bottom: isMobile ? 60 : 80,
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: uiText.difficulty.axisCount,
        nameLocation: 'middle',
        nameGap: 30,
        axisLine: {
          show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10],
          lineStyle: { color: colors.axisLineColor }
        },
        axisLabel: {
          color: colors.textColor,
          fontSize: 12
        },
        nameTextStyle: {
          color: colors.textColor,
          fontSize: 13
        },
        splitLine: {
          lineStyle: {
            color: colors.splitLineColor,
            type: 'dashed'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: uiText.difficulty.axisDifficulty,
        min: 0,
        max: 10,
        axisLine: {
          show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10],
          lineStyle: { color: colors.axisLineColor }
        },
        axisLabel: {
          color: colors.textColor,
          fontSize: 12
        },
        nameTextStyle: {
          color: colors.textColor,
          fontSize: 13
        },
        splitLine: {
          lineStyle: {
            color: colors.splitLineColor,
            type: 'dashed'
          }
        }
      },
      series: [
        {
          type: 'scatter',
          symbolSize: function(val: any, params: any) {
            return Math.sqrt(data[params.dataIndex].count) * 8;
          },
          data: data.map(item => [item.count, item.difficulty]),
          itemStyle: {
            color: function(params: any) {
              const difficulty = data[params.dataIndex].difficulty;
              if (difficulty < 4) return '#4facfe';
              if (difficulty < 7) return '#feca57';
              return '#f5576c';
            },
            opacity: 0.8
          },
          emphasis: {
            itemStyle: {
              opacity: 1,
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          label: {
            show: true,
            position: 'top',
            formatter: function(params: any) {
              return data[params.dataIndex].tag;
            },
            fontSize: 11,
            color: colors.textColor,
            overflow: 'truncate',
            width: 80
          },
          labelLayout: {
            hideOverlap: true,
            moveOverlap: 'shiftY'
          }
        }
      ]
    };
    
    difficultyChart.setOption(option);
  }
  
  // 初始化复习时机图表
  function initTimingChart() {
    if (!timingChartRef) return;

    timingChart = echarts.init(timingChartRef);
    const data = generateTimingData(selectedDays);
    const colors = getThemeColors();

    const option = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: {
          color: colors.textColor,
          fontSize: 14
        },
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.2)',
        extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
        confine: true,
        position: isMobile ? getMobileTooltipPosition : undefined,
        axisPointer: {
          type: 'shadow'
        },
        formatter: function(params: any) {
          let html = `<div style="padding: 12px; font-family: var(--font-interface);">`;
          html += `<div style="font-weight: 600; font-size: 16px; margin-bottom: 12px; color: ${colors.textColor};">${params[0].axisValue}</div>`;
          params.forEach((param: any) => {
            if (param.value !== null && param.value !== undefined && typeof param.value === 'number') {
              const colorMap: Record<string, string> = {
                [uiText.timing.early]: '#feca57',
                [uiText.timing.onTime]: '#26a641',
                [uiText.timing.late]: '#f5576c'
              };
              const color = colorMap[param.seriesName] || param.color;
              html += `<div style="display: flex; align-items: center; margin: 8px 0; line-height: 1.4;">`;
              html += `<span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${color}; margin-right: 10px;"></span>`;
              html += `<span style="color: ${colors.textColor}; font-size: 14px;">${param.seriesName}:</span>`;
              html += `<strong style="margin-left: 8px; color: var(--interactive-accent); font-size: 15px;">${param.value}%</strong>`;
              html += `</div>`;
            }
          });
          html += `</div>`;
          return html;
        }
      },
      legend: {
        data: [uiText.timing.early, uiText.timing.onTime, uiText.timing.late],
        bottom: 20,
        textStyle: {
          color: colors.textColor,
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
        data: data.dates,
        name: uiText.timing.axisX,
        nameLocation: 'middle',
        nameGap: 30,
        axisLine: {
          show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10],
          lineStyle: { color: colors.axisLineColor }
        },
        axisLabel: {
          color: colors.textColor,
          fontSize: 12,
          rotate: 45
        },
        nameTextStyle: {
          color: colors.textColor,
          fontSize: 13
        }
      },
      yAxis: {
        type: 'value',
        name: uiText.timing.axisY,
        max: 100,
        axisLine: {
          show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10],
          lineStyle: { color: colors.axisLineColor }
        },
        axisLabel: {
          color: colors.textColor,
          fontSize: 12,
          formatter: '{value}%'
        },
        nameTextStyle: {
          color: colors.textColor,
          fontSize: 13
        },
        splitLine: {
          lineStyle: {
            color: colors.splitLineColor,
            type: 'dashed'
          }
        }
      },
      series: [
        {
          name: uiText.timing.early,
          type: 'bar',
          stack: 'total',
          barWidth: '60%',
          itemStyle: {
            color: '#feca57'
          },
          data: data.early
        },
        {
          name: uiText.timing.onTime,
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
          data: data.ontime
        },
        {
          name: uiText.timing.late,
          type: 'bar',
          stack: 'total',
          itemStyle: {
            color: '#f5576c'
          },
          data: data.late
        }
      ]
    };

    applyRetentionChartLayout(option, colors, isMobile);
    timingChart.setOption(option);
  }
  
  // 更新记忆率图表数据
  function updateRetentionChart() {
    if (!retentionChart) return;
    
    const data = generateRetentionData(selectedDays);
    
    const option = {
      xAxis: {
        data: data.map(d => d.date)
      },
      series: [
        {
          data: data.map(d => d.avgRetrievability)
        },
        {
          data: data.map(d => d.trueRetention)
        },
        {
          data: data.map(d => d.targetRetention)
        }
      ]
    };
    
    requestAnimationFrame(() => {
      retentionChart?.setOption(option);
    });
  }
  
  // 更新卡片数量图表数据
  function updateQuantityChart() {
    if (!quantityChart) return;
    
    const data = generateQuantityData(selectedDays);
    
    const option = {
      xAxis: {
        data: data.dates
      },
      series: [
        { data: data.newCards },
        { data: data.learning },
        { data: data.review },
        { data: data.mastered },
        { data: data.masteryRate }
      ]
    };
    
    requestAnimationFrame(() => {
      quantityChart?.setOption(option);
    });
  }
  
  // 更新复习时机图表数据
  function updateTimingChart() {
    if (!timingChart) return;
    
    const data = generateTimingData(selectedDays);
    
    const option = {
      xAxis: {
        data: data.dates
      },
      series: [
        { data: data.early },
        { data: data.ontime },
        { data: data.late }
      ]
    };
    
    requestAnimationFrame(() => {
      timingChart?.setOption(option);
    });
  }
  
  // 更新难度-标签图表数据
  function updateDifficultyChart() {
    if (!difficultyChart) return;
    
    const data = generateDifficultyTagData();
    
    const option = {
      series: [
        {
          data: data.map(item => [item.count, item.difficulty])
        }
      ]
    };
    
    requestAnimationFrame(() => {
      difficultyChart?.setOption(option);
    });
  }
  
  // 基于当前数据源生成负荷预测数据
  function generateLoadForecastData(days: number, useGlobal: boolean = false) {
    // 使用全局数据或选中牌组数据
    const currentCards = useGlobal ? cards : activeCards;
    const forecast: Array<{ date: string; total: number; status: LoadStatus }> = [];
    const dailyCapacity = plugin.settings.loadBalance?.dailyCapacity || 100;
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + i);
      const targetDateStr = targetDate.toISOString().split('T')[0];
      
      // 统计在该日期到期的卡片数量
      let dueCount = 0;
      
      if (currentCards && currentCards.length > 0) {
        currentCards.forEach(card => {
          if (card.fsrs?.due) {
            try {
              const dueDate = new Date(card.fsrs.due);
              // 检查日期是否有效
              if (!isNaN(dueDate.getTime())) {
                const dueDateStr = dueDate.toISOString().split('T')[0];
                if (dueDateStr === targetDateStr) {
                  dueCount++;
                }
              }
            } catch {
              // 忽略无效日期
            }
          }
        });
      }
      
      // 计算负荷状态
      let status: LoadStatus;
      const ratio = dueCount / dailyCapacity;
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
        date: targetDateStr,
        total: dueCount,
        status
      });
    }
    
    return forecast;
  }
  
  function getUpcomingDateLabels(days: number): string[] {
    const labels: string[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      labels.push(formatShortDate(date));
    }
    return labels;
  }

  function getLoadForecastChartSeriesData() {
    const forecast = generateLoadForecastData(selectedDays, showGlobalLoad);

    if (forecast.length === 0) {
      return {
        forecast,
        dates: getUpcomingDateLabels(selectedDays),
        loads: Array.from({ length: selectedDays }, () => 0)
      };
    }

    return {
      forecast,
      dates: forecast.map((item) => formatShortDate(new Date(item.date))),
      loads: forecast.map((item) => item.total || 0)
    };
  }

  function createLoadForecastChartOption() {
    const { forecast, dates, loads } = getLoadForecastChartSeriesData();
    const colors = getThemeColors();
    const dailyCapacity = plugin.settings.loadBalance?.dailyCapacity || 100;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.textColor },
        confine: true,
        position: isMobile ? getMobileTooltipPosition : undefined,
        formatter: function(params: any) {
          const index = params[0].dataIndex;
          const loadValue = loads[index] || 0;

          if (forecast.length > 0 && forecast[index]) {
            const date = forecast[index].date;
            const load = forecast[index];
            const status = getLoadStatusInfo(load.status || LoadStatus.NORMAL);

            return `<div style="padding: 8px;">
              <div style="font-weight: 600; margin-bottom: 4px;">${new Date(date).toLocaleDateString(uiLanguage, { weekday: 'short', month: 'long', day: 'numeric' })}</div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="display: inline-block; width: 10px; height: 10px; background: ${status.color}; border-radius: 50%;"></span>
                <span>${uiText.load.cardsLine(load.total || 0)}</span>
              </div>
              <div style="color: ${status.color}; margin-top: 4px;">${status.label}</div>
              <div style="color: #999; font-size: 0.9em; margin-top: 4px;">${uiText.load.capacityLine(dailyCapacity)}</div>
            </div>`;
          }

          const dateStr = dates[index];
          return `<div style="padding: 8px;">
            <div style="font-weight: 600; margin-bottom: 4px;">${dateStr}</div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 10px; height: 10px; background: #51cf66; border-radius: 50%;"></span>
              <span>${uiText.load.cardsLine(loadValue)}</span>
            </div>
            <div style="color: #51cf66; margin-top: 4px;">${uiText.load.low}</div>
            <div style="color: #999; font-size: 0.9em; margin-top: 4px;">${uiText.load.capacityLine(dailyCapacity)}</div>
          </div>`;
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
        axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10], lineStyle: { color: colors.axisLineColor } },
        axisLabel: { color: colors.textColor, rotate: 45 }
      },
      yAxis: {
        type: 'value',
        name: uiText.load.axisY,
        nameTextStyle: { color: colors.textColor },
        axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [8, 10], lineStyle: { color: colors.axisLineColor } },
        axisLabel: { color: colors.textColor },
        splitLine: { lineStyle: { color: colors.splitLineColor } }
      },
      series: [
        {
          name: uiText.load.dailyLoad,
          type: 'bar',
          data: loads,
          itemStyle: {
            color: function(params: any) {
              if (forecast.length > 0 && forecast[params.dataIndex]) {
                const status = forecast[params.dataIndex].status || LoadStatus.NORMAL;
                return getLoadStatusInfo(status).color;
              }
              return '#51cf66';
            }
          },
          markLine: {
            data: [
              {
                yAxis: dailyCapacity,
                label: {
                  show: true,
                  formatter: uiText.load.capacity,
                  color: colors.textColor
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
  }

  // 初始化负荷预测图表
  function initLoadForecastChart() {
    if (!loadForecastChartRef) return;

    if (!loadForecastChart) {
      loadForecastChart = echarts.init(loadForecastChartRef);
    }

    loadForecastChart.setOption(createLoadForecastChartOption(), true);
  }

  // 更新负荷预测图表
  function updateLoadForecastChart() {
    if (!loadForecastChart) {
      initLoadForecastChart();
      return;
    }

    requestAnimationFrame(() => {
      loadForecastChart?.setOption(createLoadForecastChartOption(), true);
    });
  }

  // 获取负荷状态信息
  function getLoadStatusInfo(status: LoadStatus) {
    switch (status) {
      case LoadStatus.LOW:
        return { label: uiText.load.low, color: '#51cf66', icon: '😌' };
      case LoadStatus.NORMAL:
        return { label: uiText.load.normal, color: '#4dabf7', icon: '😊' };
      case LoadStatus.HIGH:
        return { label: uiText.load.high, color: '#ffd43b', icon: '😓' };
      case LoadStatus.OVERLOAD:
        return { label: uiText.load.overload, color: '#ff6b6b', icon: '😰' };
      default:
        return { label: uiText.load.normal, color: '#4dabf7', icon: '😊' };
    }
  }
  
  // 处理快捷时间范围变化
  function refreshActiveChart() {
    if (activeTab === 'retention') {
      updateRetentionChart();
    } else if (activeTab === 'quantity') {
      updateQuantityChart();
    } else if (activeTab === 'timing') {
      updateTimingChart();
    } else if (activeTab === 'difficulty') {
      updateDifficultyChart();
    } else if (activeTab === 'loadForecast') {
      updateLoadForecastChart();
    }
  }

  function applyRangeWindow(
    days: number,
    options?: { preserveEndDate?: boolean; mode?: 'quick' | 'custom' }
  ) {
    const safeDays = Math.max(1, Math.round(days));
    const preserveEndDate = options?.preserveEndDate ?? false;
    const nextEndDate = preserveEndDate ? new Date(endDate) : new Date();
    const nextStartDate = new Date(nextEndDate.getTime() - safeDays * 24 * 60 * 60 * 1000);

    startDate = nextStartDate;
    endDate = nextEndDate;
    selectedDays = safeDays;
    rangeSelectionMode = options?.mode ?? rangeSelectionMode;
    refreshActiveChart();
  }

  function handleQuickRangeChange(days: number) {
    applyRangeWindow(days, {
      preserveEndDate: false,
      mode: 'quick'
    });
  }
  
  // 显示牌组选择菜单（Obsidian Menu API）
  function showDeckMenu(event: MouseEvent) {
    const menu = new Menu();
    
    menu.addItem((item) =>
      item
        .setTitle(selectedDeckIds.size === allDecks.length ? uiText.toolbar.clearSelection : uiText.toolbar.selectAll)
        .setIcon('check-square')
        .onClick(() => toggleSelectAll())
    );
    
    menu.addSeparator();
    
    allDecks.forEach((deck, index) => {
      menu.addItem((item) =>
        item
          .setTitle(deck.name)
          .setIcon(selectedDeckIds.has(deck.id) ? 'check' : 'square')
          .onClick(() => toggleDeckSelection(deck.id))
      );
    });
    
    menu.showAtMouseEvent(event);
  }

  // 显示数据源选择菜单
  function showDataSourceMenu(event: MouseEvent) {
    const menu = new Menu();
    
    menu.addItem((item) =>
      item
        .setTitle(uiText.toolbar.currentDeck)
        .setIcon(!showGlobalLoad ? 'check' : 'layers')
        .onClick(() => { showGlobalLoad = false; updateLoadForecastChart(); })
    );
    menu.addItem((item) =>
      item
        .setTitle(uiText.toolbar.globalDecks)
        .setIcon(showGlobalLoad ? 'check' : 'globe')
        .onClick(() => { showGlobalLoad = true; updateLoadForecastChart(); })
    );
    
    menu.showAtMouseEvent(event);
  }

  // 切换时间范围展开状态
  function toggleRangePanel(panel: 'quick' | 'custom') {
    expandedRange = panel;
  }

  function toggleRangeEditor() {
    if (filterPanelOpen) {
      filterPanelOpen = false;
      return;
    }
    filterPanelOpen = true;
    expandedRange = rangeSelectionMode;
  }

  function getAdjacentQuickRangeValue(currentDays: number, step: number): number | null {
    if (step === 0) return null;

    const rangeValues = quickRangeOptions.map((option) => option.value);

    if (step > 0) {
      return rangeValues.find((value) => value > currentDays) ?? null;
    }

    for (let index = rangeValues.length - 1; index >= 0; index--) {
      if (rangeValues[index] < currentDays) {
        return rangeValues[index];
      }
    }

    return null;
  }

  // 处理自定义日期变化
  function handleDateChange() {
    // 确保开始日期不晚于结束日期
    if (startDate > endDate) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }
    
    // 计算天数用于图表生成
    const diffTime = endDate.getTime() - startDate.getTime();
    selectedDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
    rangeSelectionMode = 'custom';
    refreshActiveChart();
  }
  
  // 格式化日期为YYYY-MM-DD
  function formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function updateQuickRangeByStep(step: number) {
    if (wheelThrottle) return;

    const nextDays = getAdjacentQuickRangeValue(selectedDays, step);
    if (nextDays === null) return;

    wheelThrottle = true;
    isUpdating = true;

    requestAnimationFrame(() => {
      applyRangeWindow(nextDays, {
        preserveEndDate: rangeSelectionMode === 'custom',
        mode: rangeSelectionMode
      });
      setTimeout(() => {
        isUpdating = false;
      }, 300);
    });

    setTimeout(() => {
      wheelThrottle = false;
    }, WHEEL_THROTTLE_MS);
  }
  
  // 滚轮事件处理函数，在快捷范围之间切换
  function handleWheelScroll(event: WheelEvent) {
    event.preventDefault();
    updateQuickRangeByStep(event.deltaY < 0 ? 1 : -1);
  }

  function bindChartInteractions(chartRef: HTMLDivElement | null) {
    if (!chartRef) return;

    chartRef.removeEventListener('wheel', handleWheelScroll);
    chartRef.addEventListener('wheel', handleWheelScroll, { passive: false });

    pinchGestureCleanupMap.get(chartRef)?.();
    pinchGestureCleanupMap.delete(chartRef);

    if (!isMobile) return;

    const cleanup = bindPinchRangeGesture(chartRef, {
      onExpand: () => updateQuickRangeByStep(-1),
      onContract: () => updateQuickRangeByStep(1),
      cooldownMs: WHEEL_THROTTLE_MS
    });

    pinchGestureCleanupMap.set(chartRef, cleanup);
  }

  function unbindChartInteractions(chartRef: HTMLDivElement | null) {
    if (!chartRef) return;

    chartRef.removeEventListener('wheel', handleWheelScroll);
    pinchGestureCleanupMap.get(chartRef)?.();
    pinchGestureCleanupMap.delete(chartRef);
  }

  // 响应式调整图表大小
  function handleResize() {
    retentionChart?.resize();
    quantityChart?.resize();
    timingChart?.resize();
    difficultyChart?.resize();
    loadForecastChart?.resize();
  }

  // 更新所有图表主题
  function updateChartsTheme() {
    if (retentionChart) {
      retentionChart.dispose();
      retentionChart = null;
      if (retentionChartRef && activeTab === 'retention') {
        initRetentionChart();
      }
    }
    if (quantityChart) {
      quantityChart.dispose();
      quantityChart = null;
      if (quantityChartRef && activeTab === 'quantity') {
        initQuantityChart();
      }
    }
    if (timingChart) {
      timingChart.dispose();
      timingChart = null;
      if (timingChartRef && activeTab === 'timing') {
        initTimingChart();
      }
    }
    if (difficultyChart) {
      difficultyChart.dispose();
      difficultyChart = null;
      if (difficultyChartRef && activeTab === 'difficulty') {
        initDifficultyChart();
      }
    }
    if (loadForecastChart) {
      loadForecastChart.dispose();
      loadForecastChart = null;
      if (loadForecastChartRef && activeTab === 'loadForecast') {
        initLoadForecastChart();
      }
    }
  }

  // 切换标签页
  function switchTab(tab: AnalyticsTab) {
    activeTab = tab;
    
    // 延迟初始化和调整大小，确保DOM已渲染
    setTimeout(() => {
      // 标签配置映射
      const chartConfig = {
        'retention': { 
          chart: retentionChart, 
          ref: retentionChartRef, 
          init: initRetentionChart 
        },
        'quantity': { 
          chart: quantityChart, 
          ref: quantityChartRef, 
          init: initQuantityChart 
        },
        'timing': { 
          chart: timingChart, 
          ref: timingChartRef, 
          init: initTimingChart 
        },
        'difficulty': { 
          chart: difficultyChart, 
          ref: difficultyChartRef, 
          init: initDifficultyChart 
        },
        'loadForecast': { 
          chart: loadForecastChart, 
          ref: loadForecastChartRef, 
          init: initLoadForecastChart 
        }
      };

      const config = chartConfig[tab];
      if (config) {
        if (!config.chart && config.ref) {
          // 初始化图表并添加事件监听器
          config.init();
          bindChartInteractions(config.ref);
        } else if (config.chart) {
          // 仅调整大小
          config.chart.resize();
          bindChartInteractions(config.ref);
        }
      }
    }, 100);
  }

  onMount(() => {
    // 加载牌组列表
    loadAllDecks();
    
    // 延迟初始化，确保DOM完全渲染
    setTimeout(() => {
      // 使用switchTab函数初始化初始标签页
      // 这会自动处理图表初始化和事件监听器
      switchTab(activeTab);
    }, 100);
    window.addEventListener('resize', handleResize);

    // 监听主题变化
    themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // 主题变化时重新初始化图表
          setTimeout(() => updateChartsTheme(), 100);
          break;
        }
      }
    });

    // 监听body的class变化
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  // 监听activeTab变化，确保图表正确显示
  $effect(() => {
    setTimeout(() => {
      // 无论图表是否已存在，都要确保绑定滚轮事件监听器
      if (activeTab === 'retention' && retentionChartRef) {
        if (!retentionChart) {
          initRetentionChart();
        }
        bindChartInteractions(retentionChartRef);
      } else if (activeTab === 'quantity' && quantityChartRef) {
        if (!quantityChart) {
          initQuantityChart();
        }
        bindChartInteractions(quantityChartRef);
      } else if (activeTab === 'timing' && timingChartRef) {
        if (!timingChart) {
          initTimingChart();
        }
        bindChartInteractions(timingChartRef);
      } else if (activeTab === 'difficulty' && difficultyChartRef) {
        if (!difficultyChart) {
          initDifficultyChart();
        }
        bindChartInteractions(difficultyChartRef);
      } else if (activeTab === 'loadForecast' && loadForecastChartRef) {
        if (!loadForecastChart) {
          initLoadForecastChart();
        }
        bindChartInteractions(loadForecastChartRef);
      }
    }, 100);
  });

  $effect(() => {
    const language = uiLanguage;
    if (renderedLanguage === null) {
      renderedLanguage = language;
      return;
    }

    if (renderedLanguage !== language) {
      renderedLanguage = language;
      setTimeout(() => updateChartsTheme(), 100);
    }
  });

  onDestroy(() => {
    retentionChart?.dispose();
    quantityChart?.dispose();
    timingChart?.dispose();
    difficultyChart?.dispose();
    loadForecastChart?.dispose();
    unbindChartInteractions(retentionChartRef);
    unbindChartInteractions(quantityChartRef);
    unbindChartInteractions(timingChartRef);
    unbindChartInteractions(difficultyChartRef);
    unbindChartInteractions(loadForecastChartRef);
    window.removeEventListener('resize', handleResize);
    themeObserver?.disconnect();
  });

</script>

<div class="deck-analytics-modal">
    
    <!-- 更新指示器 -->
    {#if isUpdating}
      <div class="updating-indicator">
        <div class="spinner"></div>
        <span>{uiText.updating}</span>
      </div>
    {/if}
    
    <!-- 标签页导航 + 牌组选择器 -->
    <div class="tabs-header" class:mobile={isMobile}>
      <div class="tabs-nav weave-toolbar-tabs">
        <button 
          type="button"
          class="tab-btn weave-toolbar-tab"
          class:active={activeTab === 'retention'}
          onclick={(e) => { e.preventDefault(); switchTab('retention'); }}
          title={uiText.tab.retention.title}
        >
          {isMobile ? uiText.tab.retention.mobile : uiText.tab.retention.title}
        </button>
        <button 
          type="button"
          class="tab-btn weave-toolbar-tab"
          class:active={activeTab === 'quantity'}
          onclick={(e) => { e.preventDefault(); switchTab('quantity'); }}
          title={uiText.tab.quantity.title}
        >
          {isMobile ? uiText.tab.quantity.mobile : uiText.tab.quantity.title}
        </button>
        <button 
          type="button"
          class="tab-btn weave-toolbar-tab"
          class:active={activeTab === 'timing'}
          onclick={(e) => { e.preventDefault(); switchTab('timing'); }}
          title={uiText.tab.timing.title}
        >
          {isMobile ? uiText.tab.timing.mobile : uiText.tab.timing.title}
        </button>
        <button 
          type="button"
          class="tab-btn weave-toolbar-tab"
          class:active={activeTab === 'difficulty'}
          onclick={(e) => { e.preventDefault(); switchTab('difficulty'); }}
          title={uiText.tab.difficulty.title}
        >
          {isMobile ? uiText.tab.difficulty.mobile : uiText.tab.difficulty.title}
        </button>
        <button 
          type="button"
          class="tab-btn weave-toolbar-tab"
          class:active={activeTab === 'loadForecast'}
          onclick={(e) => { e.preventDefault(); switchTab('loadForecast'); }}
          title={uiText.tab.loadForecast.title}
        >
          {isMobile ? uiText.tab.loadForecast.mobile : uiText.tab.loadForecast.title}
        </button>
      </div>
      
    </div>
    
    <!-- 时间范围选择器 - 摘要条 + 范围面板 -->
    <div class="toolbar" class:mobile={isMobile}>
      <div class="filter-summary-row">
        {#if allDecks.length > 1}
          <button 
            class="summary-btn"
            onclick={(e) => showDeckMenu(e)}
          >
            <span class="summary-label">{uiText.toolbar.decks}</span>
            <span class="summary-value">{selectedDeckIds.size}/{allDecks.length}</span>
            <ObsidianIcon name="chevron-down" size={12} />
          </button>
        {/if}
        <button 
          class="summary-btn"
          onclick={() => toggleRangeEditor()}
        >
          <span class="summary-label">{uiText.toolbar.range}</span>
          <span class="summary-value">{rangeSummaryText}</span>
          <ObsidianIcon name={filterPanelOpen ? 'chevron-up' : 'chevron-down'} size={12} />
        </button>
        {#if activeTab === 'loadForecast'}
          <button 
            class="summary-btn"
            onclick={(e) => showDataSourceMenu(e)}
          >
            <span class="summary-label">{uiText.toolbar.dataSource}</span>
            <span class="summary-value">{showGlobalLoad ? uiText.toolbar.globalShort : uiText.toolbar.deckShort}</span>
            <ObsidianIcon name="chevron-down" size={12} />
          </button>
        {/if}
      </div>

      {#if filterPanelOpen}
        <div class="filter-panel">
          <div class="range-toggle-buttons">
            <button 
              class="range-toggle-btn"
              class:active={expandedRange === 'quick'}
              onclick={() => toggleRangePanel('quick')}
            >
              <span>{uiText.toolbar.quickRange}</span>
            </button>
            <button 
              class="range-toggle-btn"
              class:active={expandedRange === 'custom'}
              onclick={() => toggleRangePanel('custom')}
            >
              <span>{uiText.toolbar.customRange}</span>
            </button>
          </div>
          
          {#if expandedRange === 'quick'}
            <div class="range-panel">
              <div class="quick-range-buttons">
                {#each quickRangeOptions as option}
                  <button 
                    class="time-range-btn"
                    class:active={rangeSelectionMode === 'quick' && currentQuickRange === option.value}
                    onclick={() => handleQuickRangeChange(option.value)}
                  >
                    {isMobile ? option.mobileLabel : option.label}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
          
          {#if expandedRange === 'custom'}
            <div class="range-panel">
              <div class="date-inputs">
                <input 
                  type="date" 
                  class="date-input"
                  value={formatDateForInput(startDate)}
                  max={formatDateForInput(endDate)}
                  onchange={(e) => {
                    startDate = new Date(e.currentTarget.value);
                    handleDateChange();
                  }}
                />
                <span class="date-separator">{uiText.range.separator}</span>
                <input 
                  type="date" 
                  class="date-input"
                  value={formatDateForInput(endDate)}
                  min={formatDateForInput(startDate)}
                  max={formatDateForInput(today)}
                  onchange={(e) => {
                    endDate = new Date(e.currentTarget.value);
                    handleDateChange();
                  }}
                />
                {#if !isMobile}
                  <span class="days-indicator">({selectedDays} {uiText.range.daysSuffix})</span>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
    
    <!-- 滚轮提示 - 移动端隐藏 -->
    {#if !isMobile}
    <div class="scroll-hint" class:visible={!isUpdating}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20V10M12 10l-4 4m4-4l4 4"/>
        <path d="M12 4v2"/>
      </svg>
      <span>{uiText.range.scrollHint}</span>
    </div>
    {/if}
    
    <!-- 图表容器 - 使用CSS控制显示隐藏，避免DOM销毁 -->
    {#if hasCards}
      <div class="chart-section">
        <div class="chart-container" 
             class:hidden={activeTab !== 'retention'}
             bind:this={retentionChartRef}></div>
        <div class="chart-container" 
             class:hidden={activeTab !== 'quantity'}
             bind:this={quantityChartRef}></div>
        <div class="chart-container" 
             class:hidden={activeTab !== 'timing'}
             bind:this={timingChartRef}></div>
        <div class="chart-container" 
             class:hidden={activeTab !== 'difficulty'}
             bind:this={difficultyChartRef}></div>
        <div class="chart-container" 
             class:hidden={activeTab !== 'loadForecast'}
             bind:this={loadForecastChartRef}></div>

        {#if activeTab === 'retention' && selectedDeckIds.size <= 1}
          <div class="retention-indicator-panel">
            <div class="retention-indicator-item">
              <span class="indicator-line indicator-line--predicted"></span>
              <span class="indicator-title">{uiText.retention.avgPredictedRecall}</span>
              <span class="indicator-desc">{retentionSummaryData.avgRetrievability !== null ? uiText.retention.avgDesc(retentionSummaryData.avgRetrievability) : uiText.retention.avgEmpty}</span>
            </div>
            <div class="retention-indicator-item">
              <span class="indicator-line indicator-line--actual"></span>
              <span class="indicator-title">{uiText.retention.firstReviewPassRate}</span>
              <span class="indicator-desc">{retentionSummaryData.trueRetention !== null ? uiText.retention.trueDesc(retentionSummaryData.trueRetention, retentionSummaryData.latestSample) : uiText.retention.trueEmpty}</span>
            </div>
            <div class="retention-indicator-item">
              <span class="indicator-line indicator-line--risk"></span>
              <span class="indicator-title">{uiText.retention.targetRetention}</span>
              <span class="indicator-desc">{uiText.retention.targetDesc(retentionSummaryData.targetRetention)}</span>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

<style>
  .deck-analytics-modal {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: linear-gradient(
      180deg,
      var(--background-primary) 0%,
      var(--background-primary) 72%,
      var(--background-secondary) 100%
    );
    padding: 12px;
    gap: 6px;
  }
  
  /* 标签页头部（导航 + 牌组选择器） */
  .tabs-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    margin-bottom: 2px;
  }
  
  /* 标签页导航 */
  .tabs-nav {
    max-width: 100%;
    -ms-overflow-style: none;
    -webkit-overflow-scrolling: touch;
  }
  
  .tab-btn {
    min-width: 0;
    font-weight: 600;
  }

  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 4px;
    padding: 12px 14px;
    background: var(--background-primary);
    border-radius: 12px;
  }

  .filter-summary-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .summary-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 6px 10px;
    max-width: 100%;
    border: none;
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.16s ease;
  }

  .summary-btn:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .summary-label {
    color: var(--text-faint);
    font-size: 11px;
  }

  .summary-value {
    color: var(--text-normal);
    font-size: 12px;
    font-weight: 600;
    max-width: 128px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .filter-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
    animation: rangePanelIn 0.16s ease;
  }

  .range-toggle-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .range-toggle-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    padding: 7px 11px;
    min-height: 34px;
    font-size: 12.5px;
    font-weight: 500;
    background: var(--background-primary);
    color: var(--text-muted);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.16s ease;
  }

  .range-toggle-btn:hover {
    background: var(--background-primary);
    color: var(--text-normal);
  }

  .range-toggle-btn.active {
    background: var(--background-primary);
    color: var(--interactive-accent);
    font-weight: 600;
  }

  .range-panel {
    padding-top: 2px;
  }

  .chart-section {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin-top: 2px;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
  }

  @keyframes rangePanelIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .quick-range-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .date-inputs {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .date-input {
    padding: 7px 10px;
    font-size: 13px;
    background: var(--background-primary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.16s ease, box-shadow 0.16s ease;
    font-family: var(--font-interface);
  }

  .date-input:hover {
    border-color: var(--interactive-accent);
  }

  .date-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1);
  }

  .date-separator {
    font-size: 13px;
    color: var(--text-muted);
    padding: 0 4px;
  }

  .days-indicator {
    font-size: 12px;
    color: var(--text-muted);
    padding-left: 4px;
  }

  .time-range-btn {
    padding: 7px 12px;
    font-size: 12.5px;
    font-weight: 500;
    background: var(--background-primary);
    color: var(--text-muted);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.16s ease;
    min-width: 56px;
    text-align: center;
  }

  .time-range-btn:hover {
    background: var(--background-primary);
    color: var(--text-normal);
  }

  .time-range-btn.active {
    background: var(--background-primary);
    color: var(--interactive-accent);
    font-weight: 600;
  }

  .time-range-btn.active:hover {
    background: var(--background-primary);
  }

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
  
  .chart-container:active {
    cursor: default;
  }
  
  .chart-container.hidden {
    display: none;
  }

  .retention-indicator-panel {
    display: flex;
    align-items: stretch;
    flex-wrap: nowrap;
    gap: 8px;
    margin-top: 8px;
    padding: 8px;
    border-radius: 10px;
    background: var(--background-secondary);
  }

  .retention-indicator-item {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--background-primary);
  }

  .indicator-line {
    width: 22px;
    height: 0;
    border-top: 2px solid transparent;
  }

  .indicator-line--predicted {
    border-top-color: #667eea;
  }

  .indicator-line--actual {
    border-top-color: #4facfe;
  }

  .indicator-line--risk {
    border-top-color: #f5576c;
    border-top-style: dashed;
  }

  .indicator-title {
    font-size: 12px;
    color: var(--text-normal);
    font-weight: 600;
    line-height: 1.2;
  }

  .indicator-desc {
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.2;
  }
  
  /* 滚轮提示样式 */
  .scroll-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
    background: var(--background-primary);
    padding: 7px 12px;
    margin: 0 auto 8px;
    border-radius: 999px;
    opacity: 0;
    transition: opacity 0.24s ease;
    max-width: fit-content;
    border: 1px solid var(--background-modifier-border);
  }
  
  .scroll-hint.visible {
    opacity: 0.7;
  }
  
  .scroll-hint:hover {
    opacity: 0.9;
  }
  
  .scroll-hint svg {
    opacity: 0.8;
    animation: bounce 2s ease-in-out infinite;
  }
  
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  
  /* 空状态样式 */
  /* 更新指示器样式 */
  .updating-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--background-primary);
    color: var(--text-normal);
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    font-size: 13px;
    font-weight: 500;
    z-index: var(--weave-z-float);
    animation: fadeIn 0.2s ease;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* ==================== 移动端适配样式 ==================== */
  
  /* 移动端标签页头部 */
  .tabs-header.mobile .tabs-nav {
    width: 100%;
    justify-content: flex-start;
    gap: 4px;
  }
  
  .tabs-header.mobile .tab-btn {
    min-height: 40px;
    padding: 8px 10px;
    min-width: max-content;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }
  
  /* 移动端工具栏 */
  .toolbar.mobile {
    padding: 10px;
  }

  .toolbar.mobile .filter-summary-row {
    gap: 6px;
  }

  .toolbar.mobile .summary-btn {
    flex: 1 1 auto;
    min-width: 0;
    justify-content: space-between;
    padding: 6px 8px;
  }

  .toolbar.mobile .summary-value {
    max-width: 92px;
    font-size: 11.5px;
  }

  .toolbar.mobile .filter-panel {
    gap: 8px;
    padding-top: 6px;
  }

  .toolbar.mobile .quick-range-buttons {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }
  
  .toolbar.mobile .time-range-btn {
    flex: 1;
    padding: 8px 7px;
    font-size: 13px;
    min-width: auto;
    border-radius: 8px;
    font-weight: 500;
  }
  
  .toolbar.mobile .date-inputs {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  
  .toolbar.mobile .date-input {
    flex: 1;
    padding: 8px 10px;
    font-size: 14px;
    border-radius: 8px;
    min-width: 0;
  }
  
  .toolbar.mobile .date-separator {
    flex-shrink: 0;
    padding: 0 2px;
  }
  
  .toolbar.mobile .days-indicator {
    flex-shrink: 0;
    font-size: 13px;
    padding-left: 2px;
  }

  /* 移动端图表容器 */
  @media (max-width: 768px) {
    .deck-analytics-modal {
      padding: 4px;
    }
    
    .chart-container {
      min-height: 320px;
      padding: 2px 0;
    }
    
    .toolbar {
      padding: 10px;
      margin-bottom: 4px;
    }

    .range-toggle-buttons {
      flex-wrap: wrap;
    }

    .retention-indicator-panel {
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px;
      margin-top: 6px;
    }

    .retention-indicator-item {
      min-width: calc(50% - 3px);
    }

    .indicator-title {
      font-size: 11.5px;
    }

    .indicator-desc {
      font-size: 10.5px;
    }
  }
</style>
