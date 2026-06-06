import type { SupportedLanguage } from '../../utils/i18n';
import { deckAnalyticsTranslationOverrides } from '../../utils/i18n/deck-analytics-overrides';

export type DeckAnalyticsText = ReturnType<typeof createDeckAnalyticsText>;

function getText(language: SupportedLanguage, key: string): string {
  const keys = ['deckAnalytics', ...key.split('.')];
  let current: any = deckAnalyticsTranslationOverrides[language];

  for (const segment of keys) {
    current = current?.[segment];
  }

  return typeof current === 'string' ? current : key;
}

export function createDeckAnalyticsText(language: SupportedLanguage) {
  const en = language === 'en-US';
  const tx = (key: string) => getText(language, key);

  return {
    updating: tx('updating'),
    deckFallbackPrefix: tx('deckFallbackPrefix'),
    tab: {
      retention: { title: tx('tab.retention.title'), mobile: tx('tab.retention.mobile') },
      quantity: { title: tx('tab.quantity.title'), mobile: tx('tab.quantity.mobile') },
      timing: { title: tx('tab.timing.title'), mobile: tx('tab.timing.mobile') },
      difficulty: { title: tx('tab.difficulty.title'), mobile: tx('tab.difficulty.mobile') },
      loadForecast: { title: tx('tab.loadForecast.title'), mobile: tx('tab.loadForecast.mobile') },
      calibration: { title: tx('tab.calibration.title'), mobile: tx('tab.calibration.mobile') }
    },
    toolbar: {
      decks: tx('toolbar.decks'),
      range: tx('toolbar.range'),
      dataSource: tx('toolbar.dataSource'),
      quickRange: tx('toolbar.quickRange'),
      customRange: tx('toolbar.customRange'),
      globalDecks: tx('toolbar.globalDecks'),
      currentDeck: tx('toolbar.currentDeck'),
      globalShort: tx('toolbar.globalShort'),
      deckShort: tx('toolbar.deckShort'),
      clearSelection: tx('toolbar.clearSelection'),
      selectAll: tx('toolbar.selectAll')
    },
    range: {
      separator: tx('range.separator'),
      daysSuffix: tx('range.daysSuffix'),
      scrollHint: tx('range.scrollHint'),
      lastDaysLabel: (days: number) => en ? `Last ${days} days` : `最近${days}天`,
      lastDaysShort: (days: number) => en ? `${days}d` : `${days}天`
    },
    retention: {
      avgPredictedRecall: tx('retention.avgPredictedRecall'),
      firstReviewPassRate: tx('retention.firstReviewPassRate'),
      targetRetention: tx('retention.targetRetention'),
      axisX: tx('retention.axisX'),
      axisY: tx('retention.axisY'),
      avgDesc: (value: number) => en ? `${value.toFixed(1)}% current deck-wide estimate` : `当前牌组整体预测 ${value.toFixed(1)}%`,
      avgEmpty: tx('retention.avgEmpty'),
      trueDesc: (value: number, sample: number) => en ? `${value.toFixed(1)}% from ${sample} samples` : `${sample} 个样本中的通过率 ${value.toFixed(1)}%`,
      trueEmpty: tx('retention.trueEmpty'),
      targetDesc: (value: number) => en ? `${value.toFixed(1)}% FSRS scheduling target` : `FSRS 目标保持率 ${value.toFixed(1)}%`
    },
    quantity: {
      newCards: tx('quantity.newCards'),
      learning: tx('quantity.learning'),
      review: tx('quantity.review'),
      mastered: tx('quantity.mastered'),
      masteryRate: tx('quantity.masteryRate'),
      stack: tx('quantity.stack'),
      axisX: tx('quantity.axisX'),
      axisCount: tx('quantity.axisCount'),
      axisRate: tx('quantity.axisRate')
    },
    difficulty: {
      axisCount: tx('difficulty.axisCount'),
      axisDifficulty: tx('difficulty.axisDifficulty'),
      count: tx('difficulty.count'),
      cardsUnit: tx('difficulty.cardsUnit')
    },
    timing: {
      early: tx('timing.early'),
      onTime: tx('timing.onTime'),
      late: tx('timing.late'),
      axisX: tx('timing.axisX'),
      axisY: tx('timing.axisY')
    },
    calibration: {
      performanceTitle: tx('calibration.performanceTitle'),
      performanceDesc: tx('calibration.performanceDesc'),
      againRate: tx('calibration.againRate'),
      passRate: tx('calibration.passRate'),
      axisX: tx('calibration.axisX'),
      axisY: tx('calibration.axisY')
    },
    load: {
      low: tx('load.low'),
      normal: tx('load.normal'),
      high: tx('load.high'),
      overload: tx('load.overload'),
      axisY: tx('load.axisY'),
      dailyLoad: tx('load.dailyLoad'),
      capacity: tx('load.capacity'),
      cardsLine: (count: number) => en ? `Load: ${count} cards` : `负荷：${count} 张卡片`,
      capacityLine: (count: number) => en ? `Capacity: ${count} cards/day` : `容量：${count} 张/天`
    },
    misc: {
      firstReviewSamples: (count: number) => en ? `${count} first-review samples` : `${count} 个首次复习样本`
    }
  };
}

export function formatDeckAnalyticsShortDate(date: Date, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(language, {
    month: 'numeric',
    day: 'numeric'
  }).format(date);
}
