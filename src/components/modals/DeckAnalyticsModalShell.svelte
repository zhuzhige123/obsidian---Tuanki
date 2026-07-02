<script lang="ts">
  import { logger } from '../../utils/logger';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { Menu, Platform } from 'obsidian';
  import type { Card, Deck } from '../../data/types';
  import { AnalyticsService, type DeckAnalyticsSnapshot } from '../../data/analytics';
  import type { WeavePlugin } from '../../main';
  import { PremiumFeatureGuard, PREMIUM_FEATURES, type PremiumFeatureAccessContext } from '../../services/premium/PremiumFeatureGuard';
  import { currentLanguage } from '../../utils/i18n';
  import type { SupportedLanguage } from '../../utils/i18n';
  import DeckCalibrationChart from './deck-analytics/DeckCalibrationChart.svelte';
  import DeckDifficultyChart from './deck-analytics/DeckDifficultyChart.svelte';
  import DeckLoadForecastChart from './deck-analytics/DeckLoadForecastChart.svelte';
  import DeckQuantityChart from './deck-analytics/DeckQuantityChart.svelte';
  import DeckRetentionChart from './deck-analytics/DeckRetentionChart.svelte';
  import DeckTimingChart from './deck-analytics/DeckTimingChart.svelte';
  import { createDeckAnalyticsText, formatDeckAnalyticsShortDate } from './deck-analytics-text';
  import ActivationPrompt from '../premium/ActivationPrompt.svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';

  type AnalyticsTab = 'retention' | 'calibration' | 'quantity' | 'timing' | 'difficulty' | 'loadForecast';

  interface Props {
    plugin: WeavePlugin;
    deckId?: string;
    cards?: Card[];
    initialTab?: AnalyticsTab;
  }

  let {
    plugin,
    deckId,
    cards = [],
    initialTab = 'retention'
  }: Props = $props();

  const isMobile = Platform.isMobile;
  const premiumGuard = PremiumFeatureGuard.getInstance();
  const deckAnalyticsFeatureContext: PremiumFeatureAccessContext = { page: 'deck-analytics' };
  const analyticsTabFeatureIds: Record<AnalyticsTab, string> = {
    retention: PREMIUM_FEATURES.DECK_ANALYTICS_RETENTION,
    calibration: PREMIUM_FEATURES.DECK_ANALYTICS,
    quantity: PREMIUM_FEATURES.DECK_ANALYTICS,
    timing: PREMIUM_FEATURES.DECK_ANALYTICS_TIMING,
    difficulty: PREMIUM_FEATURES.DECK_ANALYTICS,
    loadForecast: PREMIUM_FEATURES.DECK_ANALYTICS,
  };
  const allAnalyticsTabs: AnalyticsTab[] = ['retention', 'calibration', 'quantity', 'timing', 'difficulty', 'loadForecast'];
  const uiLanguage = $derived(($currentLanguage ?? 'zh-CN') as SupportedLanguage);
  const uiText = $derived.by(() => createDeckAnalyticsText(uiLanguage));

  let activeTab = $state<AnalyticsTab>(untrack(() => initialTab));
  let isPremium = $state(get(premiumGuard.isPremiumActive));
  let showPremiumFeaturesPreview = $state(get(premiumGuard.premiumFeaturesPreviewEnabled));
  let promptFeatureId = $state<string>(PREMIUM_FEATURES.DECK_ANALYTICS);
  let showActivationPrompt = $state(false);
  let analyticsService = $state<AnalyticsService | null>(null);
  let snapshot = $state<DeckAnalyticsSnapshot | null>(null);
  let allDecks = $state<Deck[]>([]);
  let selectedDeckIds = $state<Set<string>>(new Set());
  let filterPanelOpen = $state(false);
  let expandedRange = $state<'quick' | 'custom' | null>('quick');
  let rangeSelectionMode = $state<'quick' | 'custom'>('quick');
  let showGlobalLoad = $state(false);
  let isUpdating = $state(false);
  let loadRequestId = 0;
  let wheelThrottle = false;
  const WHEEL_THROTTLE_MS = 200;

  const defaultEndDate = new Date();
  defaultEndDate.setHours(23, 59, 59, 999);
  const defaultStartDate = new Date(defaultEndDate);
  defaultStartDate.setDate(defaultStartDate.getDate() - 29);
  defaultStartDate.setHours(0, 0, 0, 0);

  let startDate = $state(defaultStartDate);
  let endDate = $state(defaultEndDate);
  let selectedDays = $state(30);

  const quickRangeOptions = $derived.by(() =>
    [7, 14, 30, 60, 90].map((value) => ({
      value,
      label: uiText.range.lastDaysLabel(value),
      mobileLabel: uiText.range.lastDaysShort(value)
    }))
  );

  const effectiveDeckIds = $derived.by(() => {
    if (selectedDeckIds.size > 0) {
      return Array.from(selectedDeckIds);
    }
    if (deckId) {
      return [deckId];
    }
    const fallbackDeckIds = new Set<string>();
    for (const card of cards) {
      const normalizedDeckId = String(card.deckId || '').trim();
      if (normalizedDeckId) {
        fallbackDeckIds.add(normalizedDeckId);
      }
    }
    return Array.from(fallbackDeckIds);
  });

  const hasCards = $derived((snapshot?.summary.totalCards ?? cards.length) > 0);
  const activeDeckCount = $derived(effectiveDeckIds.length);
  const visibleTabs = $derived.by(() =>
    allAnalyticsTabs.filter((tab) =>
      premiumGuard.shouldShowFeatureEntry(
        analyticsTabFeatureIds[tab],
        {
          isPremium,
          showPremiumPreview: showPremiumFeaturesPreview,
        },
        deckAnalyticsFeatureContext,
      )
    )
  );
  const accessibleTabs = $derived.by(() =>
    visibleTabs.filter((tab) => premiumGuard.canUseFeature(analyticsTabFeatureIds[tab], deckAnalyticsFeatureContext))
  );
  const rangeSummaryText = $derived.by(() => {
    if (rangeSelectionMode === 'quick') {
      const quickMatch = quickRangeOptions.find((option) => option.value === selectedDays);
      if (quickMatch) return quickMatch.label;
    }
    return `${formatShortDate(startDate)} ${uiText.range.separator} ${formatShortDate(endDate)}`;
  });

  const retentionSummaryData = $derived.by(() => {
    const points = snapshot?.retention.points || [];
    const currentPoint = points[0] ?? null;
    const totalSamples = points.reduce((sum, point) => sum + point.reviewSample, 0);
    const totalPassed = points.reduce((sum, point) => sum + point.passedSample, 0);
    return {
      targetRetention: snapshot?.summary.targetRetention ?? getTargetRetentionPercent(),
      avgRetrievability: currentPoint?.avgRetrievability ?? null,
      actualRetention: totalSamples > 0 ? Number(((totalPassed / totalSamples) * 100).toFixed(1)) : null,
      sampleCount: totalSamples
    };
  });

  async function getAnalyticsService(): Promise<AnalyticsService> {
    if (!analyticsService) {
      analyticsService = new AnalyticsService(plugin.dataStorage as any);
    }
    return analyticsService;
  }

  function formatShortDate(date: Date): string {
    return formatDeckAnalyticsShortDate(date, uiLanguage);
  }

  function formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getTargetRetentionPercent(): number {
    const configuredRetention = plugin.settings?.fsrsParams?.requestRetention ?? 0.9;
    return parseFloat((Math.min(Math.max(configuredRetention, 0.5), 0.99) * 100).toFixed(1));
  }

  function toRangeStartIso(date: Date): string {
    return `${formatDateForInput(date)}T00:00:00`;
  }

  function toRangeEndIso(date: Date): string {
    return `${formatDateForInput(date)}T23:59:59`;
  }

  async function loadAllDecks() {
    try {
      const decks = await plugin.dataStorage.getDecks();
      allDecks = decks.filter((deck: any) => deck.type !== 'question-bank');
      if (deckId) {
        selectedDeckIds = new Set([deckId]);
      }
    } catch (error) {
      logger.error('[DeckAnalyticsShell] 加载牌组列表失败:', error);
    }
  }

  async function loadSnapshot(showSpinner = false) {
    const requestId = ++loadRequestId;
    if (showSpinner) {
      isUpdating = true;
    }

    try {
      const service = await getAnalyticsService();
      const nextSnapshot = await service.getDeckAnalyticsSnapshot({
        deckIds: effectiveDeckIds,
        since: toRangeStartIso(startDate),
        until: toRangeEndIso(endDate),
        days: selectedDays,
        dailyCapacity: plugin.settings.loadBalance?.dailyCapacity || 100,
        targetRetention: getTargetRetentionPercent(),
        useGlobalLoad: showGlobalLoad
      });

      if (requestId !== loadRequestId) {
        return;
      }

      snapshot = nextSnapshot;
    } catch (error) {
      if (requestId !== loadRequestId) {
        return;
      }
      logger.error('[DeckAnalyticsShell] 加载分析快照失败:', error);
      snapshot = null;
    } finally {
      if (requestId === loadRequestId) {
        isUpdating = false;
      }
    }
  }

  function promptPremiumFeature(featureId: string) {
    promptFeatureId = featureId;
    showActivationPrompt = true;
  }

  function switchTab(tab: AnalyticsTab) {
    if (!visibleTabs.includes(tab)) {
      return;
    }

    const featureId = analyticsTabFeatureIds[tab];
    if (!premiumGuard.canUseFeature(featureId, deckAnalyticsFeatureContext)) {
      promptPremiumFeature(featureId);
      return;
    }

    activeTab = tab;
  }

  function getTabTitle(tab: AnalyticsTab, baseTitle: string): string {
    return premiumGuard.getFeatureEntryTitle(baseTitle, analyticsTabFeatureIds[tab], deckAnalyticsFeatureContext);
  }

  $effect(() => {
    const unsubscribePremium = premiumGuard.isPremiumActive.subscribe(value => {
      isPremium = value;
    });
    const unsubscribePreview = premiumGuard.premiumFeaturesPreviewEnabled.subscribe(value => {
      showPremiumFeaturesPreview = value;
    });

    return () => {
      unsubscribePremium();
      unsubscribePreview();
    };
  });

  $effect(() => {
    const nextTabs = accessibleTabs;
    if (nextTabs.length === 0) {
      return;
    }

    if (!nextTabs.includes(activeTab)) {
      activeTab = nextTabs.includes(initialTab) ? initialTab : nextTabs[0];
    }
  });

  async function toggleDeckSelection(id: string) {
    const nextSelection = new Set(selectedDeckIds);
    if (nextSelection.has(id)) {
      nextSelection.delete(id);
    } else {
      nextSelection.add(id);
    }
    selectedDeckIds = nextSelection;
    await loadSnapshot(true);
  }

  async function toggleSelectAll() {
    if (selectedDeckIds.size === allDecks.length) {
      selectedDeckIds = new Set();
    } else {
      selectedDeckIds = new Set(allDecks.map((deck) => deck.id));
    }
    await loadSnapshot(true);
  }

  function applyRangeWindow(
    days: number,
    options?: { preserveEndDate?: boolean; mode?: 'quick' | 'custom' }
  ) {
    const safeDays = Math.max(1, Math.round(days));
    const preserveEndDate = options?.preserveEndDate ?? false;
    const nextEndDate = preserveEndDate ? new Date(endDate) : new Date();
    nextEndDate.setHours(23, 59, 59, 999);

    const nextStartDate = new Date(nextEndDate);
    nextStartDate.setDate(nextStartDate.getDate() - safeDays + 1);
    nextStartDate.setHours(0, 0, 0, 0);

    startDate = nextStartDate;
    endDate = nextEndDate;
    selectedDays = safeDays;
    rangeSelectionMode = options?.mode ?? rangeSelectionMode;
    void loadSnapshot(true);
  }

  function handleQuickRangeChange(days: number) {
    applyRangeWindow(days, {
      preserveEndDate: false,
      mode: 'quick'
    });
  }

  function handleDateChange() {
    if (startDate > endDate) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }

    startDate = new Date(new Date(startDate).setHours(0, 0, 0, 0));
    endDate = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    selectedDays = Math.max(
      1,
      Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );
    rangeSelectionMode = 'custom';
    void loadSnapshot(true);
  }

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

  function updateQuickRangeByStep(step: number) {
    if (wheelThrottle) return;
    const nextDays = getAdjacentQuickRangeValue(selectedDays, step);
    if (nextDays === null) return;

    wheelThrottle = true;
    applyRangeWindow(nextDays, {
      preserveEndDate: rangeSelectionMode === 'custom',
      mode: rangeSelectionMode
    });

    window.setTimeout(() => {
      wheelThrottle = false;
    }, WHEEL_THROTTLE_MS);
  }

  function showDeckMenu(event: MouseEvent) {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle(selectedDeckIds.size === allDecks.length ? uiText.toolbar.clearSelection : uiText.toolbar.selectAll)
        .setIcon('check-square')
        .onClick(() => {
          void toggleSelectAll();
        })
    );
    menu.addSeparator();
    allDecks.forEach((deck) => {
      menu.addItem((item) =>
        item
          .setTitle(deck.name)
          .setIcon(selectedDeckIds.has(deck.id) ? 'check' : 'square')
          .onClick(() => {
            void toggleDeckSelection(deck.id);
          })
      );
    });
    menu.showAtMouseEvent(event);
  }

  function showDataSourceMenu(event: MouseEvent) {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle(uiText.toolbar.currentDeck)
        .setIcon(!showGlobalLoad ? 'check' : 'layers')
        .onClick(() => {
          showGlobalLoad = false;
          void loadSnapshot(true);
        })
    );
    menu.addItem((item) =>
      item
        .setTitle(uiText.toolbar.globalDecks)
        .setIcon(showGlobalLoad ? 'check' : 'globe')
        .onClick(() => {
          showGlobalLoad = true;
          void loadSnapshot(true);
        })
    );
    menu.showAtMouseEvent(event);
  }

  onMount(async () => {
    await loadAllDecks();
    await loadSnapshot();
  });

  onDestroy(() => {
    analyticsService?.destroy();
  });
</script>

<div class="deck-analytics-modal">
  {#if isUpdating}
    <div class="updating-indicator">
      <div class="spinner"></div>
      <span>{uiText.updating}</span>
    </div>
  {/if}

  <div class="tabs-header" class:mobile={isMobile}>
    <div class="tabs-nav weave-toolbar-tabs">
      {#if visibleTabs.includes('retention')}
        <button type="button" class="clickable-icon tab-btn weave-toolbar-tab" class:active={activeTab === 'retention'} onclick={() => switchTab('retention')} title={getTabTitle('retention', uiText.tab.retention.title)}>
          {isMobile ? uiText.tab.retention.mobile : uiText.tab.retention.title}
        </button>
      {/if}
      {#if visibleTabs.includes('calibration')}
        <button type="button" class="clickable-icon tab-btn weave-toolbar-tab" class:active={activeTab === 'calibration'} onclick={() => switchTab('calibration')} title={getTabTitle('calibration', uiText.tab.calibration.title)}>
          {isMobile ? uiText.tab.calibration.mobile : uiText.tab.calibration.title}
        </button>
      {/if}
      {#if visibleTabs.includes('quantity')}
        <button type="button" class="clickable-icon tab-btn weave-toolbar-tab" class:active={activeTab === 'quantity'} onclick={() => switchTab('quantity')} title={getTabTitle('quantity', uiText.tab.quantity.title)}>
          {isMobile ? uiText.tab.quantity.mobile : uiText.tab.quantity.title}
        </button>
      {/if}
      {#if visibleTabs.includes('timing')}
        <button type="button" class="clickable-icon tab-btn weave-toolbar-tab" class:active={activeTab === 'timing'} onclick={() => switchTab('timing')} title={getTabTitle('timing', uiText.tab.timing.title)}>
          {isMobile ? uiText.tab.timing.mobile : uiText.tab.timing.title}
        </button>
      {/if}
      {#if visibleTabs.includes('difficulty')}
        <button type="button" class="clickable-icon tab-btn weave-toolbar-tab" class:active={activeTab === 'difficulty'} onclick={() => switchTab('difficulty')} title={getTabTitle('difficulty', uiText.tab.difficulty.title)}>
          {isMobile ? uiText.tab.difficulty.mobile : uiText.tab.difficulty.title}
        </button>
      {/if}
      {#if visibleTabs.includes('loadForecast')}
        <button type="button" class="clickable-icon tab-btn weave-toolbar-tab" class:active={activeTab === 'loadForecast'} onclick={() => switchTab('loadForecast')} title={getTabTitle('loadForecast', uiText.tab.loadForecast.title)}>
          {isMobile ? uiText.tab.loadForecast.mobile : uiText.tab.loadForecast.title}
        </button>
      {/if}
    </div>
  </div>

  <div class="toolbar" class:mobile={isMobile}>
    <div class="filter-summary-row">
      {#if allDecks.length > 1}
        <button type="button" class="clickable-icon summary-btn" onclick={(event) => showDeckMenu(event)}>
          <span class="summary-label">{uiText.toolbar.decks}</span>
          <span class="summary-value">{selectedDeckIds.size}/{allDecks.length}</span>
          <ObsidianIcon name="chevron-down" size={12} />
        </button>
      {/if}

      <button type="button" class="clickable-icon summary-btn" onclick={() => toggleRangeEditor()}>
        <span class="summary-label">{uiText.toolbar.range}</span>
        <span class="summary-value">{rangeSummaryText}</span>
        <ObsidianIcon name={filterPanelOpen ? 'chevron-up' : 'chevron-down'} size={12} />
      </button>

      {#if activeTab === 'loadForecast'}
        <button type="button" class="clickable-icon summary-btn" onclick={(event) => showDataSourceMenu(event)}>
          <span class="summary-label">{uiText.toolbar.dataSource}</span>
          <span class="summary-value">{showGlobalLoad ? uiText.toolbar.globalShort : uiText.toolbar.deckShort}</span>
          <ObsidianIcon name="chevron-down" size={12} />
        </button>
      {/if}
    </div>

    {#if filterPanelOpen}
      <div class="filter-panel">
        <div class="range-toggle-buttons">
          <button type="button" class="clickable-icon range-toggle-btn" class:active={expandedRange === 'quick'} onclick={() => toggleRangePanel('quick')}>
            <span>{uiText.toolbar.quickRange}</span>
          </button>
          <button type="button" class="clickable-icon range-toggle-btn" class:active={expandedRange === 'custom'} onclick={() => toggleRangePanel('custom')}>
            <span>{uiText.toolbar.customRange}</span>
          </button>
        </div>

        {#if expandedRange === 'quick'}
          <div class="range-panel">
            <div class="quick-range-buttons">
              {#each quickRangeOptions as option}
                <button type="button" class="clickable-icon time-range-btn" class:active={rangeSelectionMode === 'quick' && selectedDays === option.value} onclick={() => handleQuickRangeChange(option.value)}>
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
                onchange={(event) => {
                  startDate = new Date(event.currentTarget.value);
                  handleDateChange();
                }}
              />
              <span class="date-separator">{uiText.range.separator}</span>
              <input
                type="date"
                class="date-input"
                value={formatDateForInput(endDate)}
                min={formatDateForInput(startDate)}
                max={formatDateForInput(defaultEndDate)}
                onchange={(event) => {
                  endDate = new Date(event.currentTarget.value);
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

  {#if !isMobile}
    <div class="scroll-hint" class:visible={!isUpdating}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20V10M12 10l-4 4m4-4l4 4"/>
        <path d="M12 4v2"/>
      </svg>
      <span>{uiText.range.scrollHint}</span>
    </div>
  {/if}

  {#if snapshot && hasCards}
    <div class="chart-section">
      {#if activeTab === 'retention'}
        <DeckRetentionChart snapshot={snapshot.retention} {uiText} {uiLanguage} onRangeStep={updateQuickRangeByStep} />
      {:else if activeTab === 'calibration'}
        <DeckCalibrationChart snapshot={snapshot.calibration} {uiText} {uiLanguage} onRangeStep={updateQuickRangeByStep} />
      {:else if activeTab === 'quantity'}
        <DeckQuantityChart snapshot={snapshot.quantity} {uiText} {uiLanguage} onRangeStep={updateQuickRangeByStep} />
      {:else if activeTab === 'timing'}
        <DeckTimingChart snapshot={snapshot.timing} {uiText} {uiLanguage} onRangeStep={updateQuickRangeByStep} />
      {:else if activeTab === 'difficulty'}
        <DeckDifficultyChart points={snapshot.difficulty} {uiText} />
      {:else if activeTab === 'loadForecast'}
        <DeckLoadForecastChart forecast={snapshot.forecast} dailyCapacity={snapshot.summary.dailyCapacity} {uiText} {uiLanguage} onRangeStep={updateQuickRangeByStep} />
      {/if}

      {#if activeTab === 'retention' && activeDeckCount <= 1}
        <div class="retention-indicator-panel">
          <div class="retention-indicator-item">
            <span class="indicator-line indicator-line--predicted"></span>
            <span class="indicator-title">{uiText.retention.avgPredictedRecall}</span>
            <span class="indicator-desc">{retentionSummaryData.avgRetrievability !== null ? uiText.retention.avgDesc(retentionSummaryData.avgRetrievability) : uiText.retention.avgEmpty}</span>
          </div>
          <div class="retention-indicator-item">
            <span class="indicator-line indicator-line--actual"></span>
            <span class="indicator-title">{uiText.retention.firstReviewPassRate}</span>
            <span class="indicator-desc">{retentionSummaryData.actualRetention !== null ? uiText.retention.trueDesc(retentionSummaryData.actualRetention, retentionSummaryData.sampleCount) : uiText.retention.trueEmpty}</span>
          </div>
          <div class="retention-indicator-item">
            <span class="indicator-line indicator-line--risk"></span>
            <span class="indicator-title">{uiText.retention.targetRetention}</span>
            <span class="indicator-desc">{uiText.retention.targetDesc(retentionSummaryData.targetRetention)}</span>
          </div>
        </div>
      {/if}
    </div>
  {:else if snapshot && !hasCards}
    <div class="empty-panel">
      <div class="empty-title">暂无可分析卡片</div>
      <div class="empty-desc">当前牌组范围下还没有记忆卡片，或筛选范围内没有可用数据。</div>
    </div>
  {/if}

  <ActivationPrompt
    featureId={promptFeatureId}
    visible={showActivationPrompt}
    onClose={() => showActivationPrompt = false}
  />
</div>

<style>
  .deck-analytics-modal {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: linear-gradient(
      180deg,
      var(--background-primary) 0%,
      var(--background-primary) 72%,
      var(--background-secondary) 100%
    );
    padding: 12px;
    gap: 6px;
    position: relative;
  }

  .tabs-header,
  .toolbar,
  .scroll-hint {
    flex-shrink: 0;
  }

  .tabs-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    margin-bottom: 2px;
  }

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
    padding: 0;
    background: transparent;
    border-radius: 0;
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
    min-height: 40px;
    padding: 0 10px;
    max-width: 100%;
    border: none;
    box-shadow: none;
    border-radius: var(--clickable-icon-radius, var(--radius-s));
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .summary-btn:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
    box-shadow: none;
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
  }

  .range-toggle-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .range-toggle-btn,
  .time-range-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    min-height: 40px;
    font-size: 12.5px;
    font-weight: 500;
    background: transparent;
    color: var(--text-muted);
    border: none;
    box-shadow: none;
    border-radius: var(--clickable-icon-radius, var(--radius-s));
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .range-toggle-btn:hover,
  .time-range-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .range-toggle-btn.active,
  .time-range-btn.active {
    color: var(--text-normal);
    font-weight: 600;
    background: var(--background-modifier-hover);
  }

  .quick-range-buttons,
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
  }

  .date-separator,
  .days-indicator {
    color: var(--text-muted);
    font-size: 12px;
  }

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

  .chart-section,
  .empty-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin-top: 2px;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .chart-section {
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: 12px;
  }

  .empty-panel {
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--background-secondary) 80%, var(--background-primary) 20%);
    border-radius: 12px;
    border: 1px dashed var(--background-modifier-border);
    padding: 20px;
  }

  .empty-title {
    color: var(--text-normal);
    font-size: 15px;
    font-weight: 600;
  }

  .empty-desc {
    max-width: 360px;
    font-size: 12px;
    line-height: 1.6;
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
    to {
      transform: rotate(360deg);
    }
  }

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

  .toolbar.mobile {
    padding: 10px;
  }

  .toolbar.mobile .summary-btn {
    flex: 1 1 auto;
    min-width: 0;
    justify-content: space-between;
    padding: 6px 8px;
  }

  @media (max-width: 768px) {
    .deck-analytics-modal {
      padding: 4px;
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
  }
</style>
