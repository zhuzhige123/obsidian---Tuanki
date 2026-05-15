<!--
  增量阅读设置组件
  职责：处理增量阅读牌组的配置（调度、拆分、交错学习、导入设置）
  
  已移除弃用的聚焦阅读模式相关设置
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { logger } from '../../../utils/logger';
  import { tr } from '../../../utils/i18n';
  import type {
    IncrementalReadingSettings,
    CalloutSignalSettings,
    CalloutTypeWeight,
    IncrementalReadingFolderSubscriptionInitialScheduleMode,
    IncrementalReadingFolderSubscriptionRule
  } from '../../../types/plugin-settings.d';
  import type { IncrementalReadingSettingsHost } from '../types/incremental-reading-settings-host';
  import TabNavigation from '../../ui/TabNavigation.svelte';
  import { IRStorageService } from '../../../services/incremental-reading/IRStorageService';
  import {
    DEFAULT_IR_CALLOUT_SIGNAL_SETTINGS,
    DEFAULT_IR_CALLOUT_TYPES
  } from '../../../services/incremental-reading/ir-settings';
  import { IRSettingsEditor } from '../../../services/incremental-reading/IRSettingsEditor';
  import {
    normalizeIncrementalReadingFolderSubscriptionPath,
  } from '../../../services/incremental-reading/folder-subscription-settings';
  import { VaultFolderSuggestModal } from '../../../modals/VaultFolderSuggestModal';
  import IRAdvancedSchedulingSettingsSection from './IRAdvancedSchedulingSettingsSection.svelte';
  import IRAutoSubscribeSettingsSection from './IRAutoSubscribeSettingsSection.svelte';
  import IRCalloutSignalSettingsSection from './IRCalloutSignalSettingsSection.svelte';
  import IRCoreSchedulingSettingsSection from './IRCoreSchedulingSettingsSection.svelte';
  import IRInterleaveSettingsSection from './IRInterleaveSettingsSection.svelte';
  import IRStrategySettingsSection from './IRStrategySettingsSection.svelte';
  import SettingsHelpModal from '../components/SettingsHelpModal.svelte';

  let t = $derived($tr);

  // importFolder 仅保留给旧导入/复制链路兼容使用，不再控制新正文 Markdown 默认目录。

  let AUTO_SUBSCRIBE_INITIAL_SCHEDULE_MODE_OPTIONS = $derived([
    {
      id: 'today',
      label: t('irSettings.autoSubscribeInitialScheduleTodayLabel'),
      desc: t('irSettings.autoSubscribeInitialScheduleTodayDesc')
    },
    {
      id: 'scheduled',
      label: t('irSettings.autoSubscribeInitialScheduleScheduledLabel'),
      desc: t('irSettings.autoSubscribeInitialScheduleScheduledDesc')
    }
  ]);
  
  // v3.0 调度策略选项
  let STRATEGY_OPTIONS = $derived([
    { id: 'processing', label: t('irSettings.strategyProcessingLabel'), desc: t('irSettings.strategyProcessingDesc') },
    { id: 'reading-list', label: t('irSettings.strategyReadingListLabel'), desc: t('irSettings.strategyReadingListDesc') }
  ]);
  
  // v3.0 aging 强度选项
  let AGING_OPTIONS = $derived([
    { id: 'low', label: t('irSettings.agingLowLabel'), desc: t('irSettings.agingLowDesc') },
    { id: 'medium', label: t('irSettings.agingMediumLabel'), desc: t('irSettings.agingMediumDesc') },
    { id: 'high', label: t('irSettings.agingHighLabel'), desc: t('irSettings.agingHighDesc') }
  ]);
  
  // v3.0 自动后推策略选项
  let POSTPONE_OPTIONS = $derived([
    { id: 'off', label: t('irSettings.postponeOffLabel'), desc: t('irSettings.postponeOffDesc') },
    { id: 'gentle', label: t('irSettings.postponeGentleLabel'), desc: t('irSettings.postponeGentleDesc') },
    { id: 'aggressive', label: t('irSettings.postponeAggressiveLabel'), desc: t('irSettings.postponeAggressiveDesc') }
  ]);

  interface Props {
    plugin: IncrementalReadingSettingsHost;
    showTabs?: boolean;
    forcedTab?: IRSettingsTabId;
  }

  type IRSettingsTabId = 'basic' | 'auto-subscribe' | 'advanced' | 'signals';

  let { plugin, showTabs = true, forcedTab }: Props = $props();
  const DEFAULT_CALLOUT_TYPES: CalloutTypeWeight[] = DEFAULT_IR_CALLOUT_TYPES;
  const DEFAULT_CALLOUT_SIGNAL: CalloutSignalSettings = DEFAULT_IR_CALLOUT_SIGNAL_SETTINGS;
  let settings = $state(untrack(() => plugin.settings));
  let activeTab = $state<IRSettingsTabId>('basic');
  let showInterleaveHelpModal = $state(false);
  let subscriptionDeckOptions = $state<Array<{ id: string; label: string; description: string }>>([]);
  let settingsEditor = $derived.by(() => new IRSettingsEditor({
    plugin,
    getState: () => settings,
    updateState: (nextState) => {
      settings = nextState;
    }
  }));
  let irSettingsTabs = $derived([
    { id: 'basic', label: t('settings.categories.basic'), icon: '' },
    { id: 'auto-subscribe', label: t('irSettings.autoSubscribeTitle'), icon: '' },
    { id: 'advanced', label: t('irSettings.advancedTitle'), icon: '' },
    { id: 'signals', label: t('irSettings.calloutSignalTitle'), icon: '' }
  ]);
  let visibleTab = $derived(forcedTab ?? activeTab);
  
  // 确保 incrementalReading 设置存在
  $effect(() => {
    settingsEditor.ensureIncrementalReadingSettings();
    settingsEditor.applyNormalizedFolderSubscriptionSettings();
  });

  onMount(() => {
    void loadSubscriptionDeckOptions();
  });

  // 保存设置的统一方法
  async function saveSettings(syncFolderSubscription = false) {
    try {
      await settingsEditor.save(syncFolderSubscription);
    } catch (error) {
      logger.error('保存设置失败:', error);
    }
  }

  async function loadSubscriptionDeckOptions() {
    try {
      const storage = new IRStorageService(plugin.app);
      await storage.initialize();
      const decks = Object.values(await storage.getAllDecks())
        .filter((deck) => !deck.archivedAt)
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN'));
      subscriptionDeckOptions = decks.map((deck) => ({
        id: String(deck.id || '').trim(),
        label: String(deck.name || '').trim() || String(deck.id || '').trim(),
        description: ''
      }));
    } catch (error) {
      logger.warn('加载增量阅读专题列表失败:', error);
      subscriptionDeckOptions = [];
    }
  }

  function getFolderSubscriptionSettingsSnapshot() {
    return settingsEditor.getFolderSubscriptionSettingsSnapshot();
  }

  function getFolderSubscriptionRules(): IncrementalReadingFolderSubscriptionRule[] {
    return settingsEditor.getFolderSubscriptionRules();
  }

  function updateFolderSubscriptionSettings(
    updater: (current: ReturnType<typeof getFolderSubscriptionSettingsSnapshot>) => ReturnType<typeof getFolderSubscriptionSettingsSnapshot>
  ) {
    settingsEditor.updateFolderSubscriptionSettings(updater);
  }

  function createEmptyFolderSubscriptionRule(): IncrementalReadingFolderSubscriptionRule {
    return settingsEditor.createEmptyFolderSubscriptionRule();
  }

  function getFolderSubscriptionImportConfirmThreshold(): number {
    return settingsEditor.getFolderSubscriptionImportConfirmThreshold();
  }

  function getFolderSubscriptionInitialScheduleMode(): IncrementalReadingFolderSubscriptionInitialScheduleMode {
    return settingsEditor.getFolderSubscriptionInitialScheduleMode();
  }

  function getFolderSubscriptionRuleLabel(rule: IncrementalReadingFolderSubscriptionRule): string {
    const folderPath = String(rule.folderPath || '').trim();
    if (!folderPath) {
      return t('irSettings.autoSubscribeFolderEmpty');
    }
    return folderPath === '/' ? '/（Vault 根目录）' : folderPath;
  }

  function getSubscriptionDeckOptionsForRule(rule: IncrementalReadingFolderSubscriptionRule) {
    const options = [...subscriptionDeckOptions];
    const deckId = String(rule.deckId || '').trim();
    if (deckId && !options.some((option) => option.id === deckId)) {
      options.unshift({
        id: deckId,
        label: deckId,
        description: ''
      });
    }
    return options;
  }

  async function handleAddFolderSubscriptionRule() {
    updateFolderSubscriptionSettings((current) => ({
      ...current,
      rules: [...(current.rules || []), createEmptyFolderSubscriptionRule()]
    }));
    await saveSettings();
  }

  async function handleFolderSubscriptionEnabledChange(ruleId: string, event: Event) {
    const enabled = (event.target as HTMLInputElement).checked;
    updateFolderSubscriptionSettings((current) => ({
      ...current,
      rules: (current.rules || []).map((rule) =>
        rule.id === ruleId
          ? { ...rule, enabled }
          : rule
      )
    }));
    await saveSettings(true);
  }

  async function handleFolderSubscriptionDeckChange(ruleId: string, value: string) {
    const deckId = String(value || '').trim();
    updateFolderSubscriptionSettings((current) => ({
      ...current,
      rules: (current.rules || []).map((rule) =>
        rule.id === ruleId
          ? { ...rule, deckId }
          : rule
      )
    }));
    await saveSettings(true);
  }

  async function handleFolderSubscriptionInitialScheduleModeChange(value: string) {
    updateFolderSubscriptionSettings((current) => ({
      ...current,
      initialScheduleMode: value === 'scheduled' ? 'scheduled' : 'today'
    }));
    await saveSettings(true);
  }

  function handleFolderSubscriptionImportConfirmThresholdChange(event: Event) {
    const importConfirmThreshold = Math.max(
      0,
      Math.min(200, parseInt((event.target as HTMLInputElement).value || '0', 10) || 0)
    );
    updateFolderSubscriptionSettings((current) => ({
      ...current,
      importConfirmThreshold
    }));
    saveSettings();
  }

  async function chooseFolderSubscriptionFolder(ruleId: string, triggerEl?: HTMLElement | null) {
    const picker = new VaultFolderSuggestModal(plugin.app, {
      placeholder: '选择要监听的 Markdown 文件夹...',
      anchorRect: triggerEl?.getBoundingClientRect?.() || undefined
    });
    const folderPath = await picker.openAndSelect();
    if (!folderPath) {
      return;
    }

    updateFolderSubscriptionSettings((current) => ({
      ...current,
      rules: (current.rules || []).map((rule) =>
        rule.id === ruleId
          ? { ...rule, folderPath: normalizeIncrementalReadingFolderSubscriptionPath(folderPath) }
          : rule
      )
    }));
    await saveSettings(true);
  }

  async function removeFolderSubscriptionRule(ruleId: string) {
    updateFolderSubscriptionSettings((current) => ({
      ...current,
      rules: (current.rules || []).filter((rule) => rule.id !== ruleId)
    }));
    await saveSettings(true);
  }

  // 处理默认间隔因子变更
  function handleIntervalFactorChange(event: Event) {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(value) && value >= 1.0 && value <= 3.0) {
      settingsEditor.updateIncrementalReading((incrementalReading) => {
        incrementalReading.defaultIntervalFactor = value;
      });
      saveSettings();
    }
  }

  // 处理每日新块上限变更
  function handleDailyNewLimitChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 0 && value <= 50) {
      settingsEditor.updateIncrementalReading((incrementalReading) => {
        incrementalReading.dailyNewLimit = value;
      });
      saveSettings();
    }
  }

  // 处理每日复习上限变更
  function handleDailyReviewLimitChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 0 && value <= 200) {
      settingsEditor.updateIncrementalReading((incrementalReading) => {
        incrementalReading.dailyReviewLimit = value;
      });
      saveSettings();
    }
  }

  // 处理交错学习模式变更
  function handleInterleaveModeChange(event: Event) {
    settingsEditor.updateIncrementalReading((incrementalReading) => {
      incrementalReading.interleaveMode = (event.target as HTMLInputElement).checked;
    });
    saveSettings();
  }

  // 处理最大连续同主题块数变更
  function handleMaxConsecutiveChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 1 && value <= 10) {
      settingsEditor.updateIncrementalReading((incrementalReading) => {
        incrementalReading.maxConsecutiveSameTopic = value;
      });
      saveSettings();
    }
  }

  // 处理复习阈值变更
  function handleReviewThresholdChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 3 && value <= 14) {
      settingsEditor.updateIncrementalReading((incrementalReading) => {
        incrementalReading.reviewThreshold = value;
      });
      saveSettings();
    }
  }

  // 处理最大间隔变更
  function handleMaxIntervalChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 30 && value <= 365) {
      settingsEditor.updateIncrementalReading((incrementalReading) => {
        incrementalReading.maxInterval = value;
      });
      saveSettings();
    }
  }

  // ============================================
  // v3.0 调度策略处理函数
  // ============================================

  function handleStrategyDropdownChange(value: string) {
    settingsEditor.updateIncrementalReading((incrementalReading) => {
      incrementalReading.scheduleStrategy = value as 'processing' | 'reading-list';
    });
    void saveSettings();
  }

  // 处理每日时间预算变更
  function handleTimeBudgetChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 10 && value <= 120) {
      settingsEditor.updateIncrementalReading((incrementalReading) => {
        incrementalReading.dailyTimeBudgetMinutes = value;
      });
      saveSettings();
    }
  }

  // 处理每日出现上限变更
  function handleMaxAppearancesChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 1 && value <= 5) {
      settingsEditor.updateIncrementalReading((incrementalReading) => {
        incrementalReading.maxAppearancesPerDay = value;
      });
      saveSettings();
    }
  }

  // 处理 TagGroup 先验开关
  function handleTagGroupPriorChange(event: Event) {
    settingsEditor.updateIncrementalReading((incrementalReading) => {
      incrementalReading.enableTagGroupPrior = (event.target as HTMLInputElement).checked;
    });
    saveSettings();
  }

  function handleTagGroupFollowModeChange(value: string) {
    settingsEditor.updateIncrementalReading((incrementalReading) => {
      incrementalReading.tagGroupFollowMode = value as 'off' | 'ask' | 'auto';
    });
    void saveSettings();
  }

  function handleAgingStrengthDropdownChange(value: string) {
    settingsEditor.updateIncrementalReading((incrementalReading) => {
      incrementalReading.agingStrength = value as 'low' | 'medium' | 'high';
    });
    void saveSettings();
  }

  function handlePostponeStrategyDropdownChange(value: string) {
    settingsEditor.updateIncrementalReading((incrementalReading) => {
      incrementalReading.autoPostponeStrategy = value as 'off' | 'gentle' | 'aggressive';
    });
    void saveSettings();
  }

  // 处理优先级半衰期变更
  function handlePriorityHalfLifeChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 3 && value <= 30) {
      settingsEditor.updateIncrementalReading((incrementalReading) => {
        incrementalReading.priorityHalfLifeDays = value;
      });
      saveSettings();
    }
  }

  // 处理待读天数变更（统一用于统计和提前阅读范围）
  function handleLearnAheadDaysChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 1 && value <= 14) {
      settingsEditor.updateIncrementalReading((incrementalReading) => {
        incrementalReading.learnAheadDays = value;
      });
      saveSettings();
    }
  }

  function handleCalloutSignalEnabledChange(enabled: boolean) {
    settingsEditor.updateCalloutSignal((calloutSignal) => {
      calloutSignal.enabled = enabled;
    });
    void saveSettings();
  }

  function handleCalloutTypeEnabledChange(type: string, enabled: boolean) {
    if (settingsEditor.updateCalloutType(type, (typeWeight) => ({ ...typeWeight, enabled }))) {
      void saveSettings();
    }
  }

  function handleCalloutTypeWeightChange(type: string, weight: number) {
    if (settingsEditor.updateCalloutType(type, (typeWeight) => ({ ...typeWeight, weight }))) {
      void saveSettings();
    }
  }

  function handleCalloutMaxBoostChange(value: number) {
    settingsEditor.updateCalloutSignal((calloutSignal) => {
      calloutSignal.maxBoost = value;
    });
    void saveSettings();
  }

  function handleCalloutSaturationParamChange(value: number) {
    settingsEditor.updateCalloutSignal((calloutSignal) => {
      calloutSignal.saturationParam = value;
    });
    void saveSettings();
  }

  function handleCalloutMinContentLengthChange(value: number) {
    settingsEditor.updateCalloutSignal((calloutSignal) => {
      calloutSignal.minContentLength = value;
    });
    void saveSettings();
  }

  function handleAddCustomCalloutType(type: string, weight: number) {
    settingsEditor.addCustomCalloutType(type, weight);
    void saveSettings();
  }

  function handleRemoveCustomCalloutType(type: string) {
    if (settingsEditor.removeCustomCalloutType(type)) {
      void saveSettings();
    }
  }

</script>

<div class="weave-settings settings-section incremental-reading-settings settings-layout-flat">
  {#if showTabs}
    <div class="incremental-reading-tabs">
      <TabNavigation
        tabs={irSettingsTabs}
        activeTab={activeTab}
        onTabChange={(tabId) => activeTab = tabId as IRSettingsTabId}
      />
    </div>
  {/if}

  <div class="incremental-reading-tab-panel" id={`ir-settings-panel-${visibleTab}`}>
    {#if visibleTab === 'basic'}
      <div class="incremental-reading-tab-content">
        <IRCoreSchedulingSettingsSection
          {settings}
          {handleDailyNewLimitChange}
          {handleDailyReviewLimitChange}
          {handleLearnAheadDaysChange}
          {handleIntervalFactorChange}
          {handleReviewThresholdChange}
          {handleMaxIntervalChange}
        />

        <IRStrategySettingsSection
          {settings}
          strategyOptions={STRATEGY_OPTIONS}
          {handleStrategyDropdownChange}
          {handleTimeBudgetChange}
          {handleMaxAppearancesChange}
        />
      </div>
    {/if}

    {#if visibleTab === 'auto-subscribe'}
      <div class="incremental-reading-tab-content">
        <IRAutoSubscribeSettingsSection
          rules={getFolderSubscriptionRules()}
          initialScheduleModeOptions={AUTO_SUBSCRIBE_INITIAL_SCHEDULE_MODE_OPTIONS}
          {getFolderSubscriptionRuleLabel}
          {getSubscriptionDeckOptionsForRule}
          {getFolderSubscriptionInitialScheduleMode}
          {getFolderSubscriptionImportConfirmThreshold}
          {handleAddFolderSubscriptionRule}
          {chooseFolderSubscriptionFolder}
          {handleFolderSubscriptionDeckChange}
          {handleFolderSubscriptionEnabledChange}
          {removeFolderSubscriptionRule}
          {handleFolderSubscriptionInitialScheduleModeChange}
          {handleFolderSubscriptionImportConfirmThresholdChange}
        />
      </div>
    {/if}

    {#if visibleTab === 'advanced'}
      <div class="incremental-reading-tab-content">
        <IRAdvancedSchedulingSettingsSection
          {plugin}
          {settings}
          agingOptions={AGING_OPTIONS}
          postponeOptions={POSTPONE_OPTIONS}
          {handleTagGroupPriorChange}
          {handleTagGroupFollowModeChange}
          handleAgingStrengthChange={handleAgingStrengthDropdownChange}
          handlePostponeStrategyChange={handlePostponeStrategyDropdownChange}
          {handlePriorityHalfLifeChange}
        />
      </div>
    {/if}

    {#if visibleTab === 'signals'}
      <div class="incremental-reading-tab-content">
        <IRCalloutSignalSettingsSection
          {settings}
          defaultCalloutSignal={DEFAULT_CALLOUT_SIGNAL}
          defaultCalloutTypes={DEFAULT_CALLOUT_TYPES}
          onCalloutSignalEnabledChange={handleCalloutSignalEnabledChange}
          onCalloutTypeEnabledChange={handleCalloutTypeEnabledChange}
          onCalloutTypeWeightChange={handleCalloutTypeWeightChange}
          onMaxBoostChange={handleCalloutMaxBoostChange}
          onSaturationParamChange={handleCalloutSaturationParamChange}
          onMinContentLengthChange={handleCalloutMinContentLengthChange}
          onAddCustomType={handleAddCustomCalloutType}
          onRemoveCustomType={handleRemoveCustomCalloutType}
        />
      </div>
    {/if}
  </div>

  <SettingsHelpModal
    open={showInterleaveHelpModal}
    title={t('irSettings.interleaveHintModalTitle')}
    closeLabel={t('irSettings.interleaveHintCloseLabel')}
    confirmLabel={t('irSettings.interleaveHintConfirm')}
    onClose={() => showInterleaveHelpModal = false}
  >
    <div class="help-item">
      <div class="help-item-title">{t('irSettings.interleaveHintTitle')}</div>
      <p class="help-item-desc">{t('irSettings.interleaveHintSummary')}</p>
      <p class="help-item-desc">{t('irSettings.interleaveHintPriority')}</p>
    </div>

    <div class="help-item">
      <div class="help-item-title">{t('irSettings.maxConsecutiveLabel')}</div>
      <p class="help-item-desc">
        {t('irSettings.interleaveHintThresholdPrefix')}
        <strong>{settings.incrementalReading?.maxConsecutiveSameTopic ?? 3}{t('irSettings.unitBlocks')}</strong>
        {t('irSettings.interleaveHintThresholdSuffix')}
      </p>
      <p class="help-item-desc">{t('irSettings.interleaveHintRange')}</p>
    </div>
  </SettingsHelpModal>

  {#if visibleTab === 'basic'}
    <div class="incremental-reading-tab-followup">
      <IRInterleaveSettingsSection
        {settings}
        onOpenHelp={() => showInterleaveHelpModal = true}
        {handleInterleaveModeChange}
        {handleMaxConsecutiveChange}
      />
    </div>
  {/if}

</div>

  <style>
  .incremental-reading-settings {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .incremental-reading-tabs {
    min-width: 0;
  }

  .incremental-reading-tabs :global(.tab-navigation) {
    background: transparent;
    border-radius: 0;
    padding: 0;
    gap: 0.75rem;
    overflow-x: auto;
    scrollbar-width: none;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .incremental-reading-tabs :global(.tab-navigation::-webkit-scrollbar) {
    display: none;
  }

  .incremental-reading-tabs :global(.tab-button) {
    appearance: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    padding: 0.75rem 0 0.7rem;
    border-bottom: 2px solid transparent;
    font-size: 0.95rem;
    font-weight: 500;
    transform: none;
    transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
  }

  .incremental-reading-tabs :global(.tab-button:hover:not(.disabled)) {
    background: transparent;
    color: var(--text-normal);
    border-bottom-color: var(--text-muted);
  }

  .incremental-reading-tabs :global(.tab-button.active) {
    background: transparent;
    color: var(--text-normal);
    border-bottom-color: var(--interactive-accent);
    box-shadow: none;
  }

  .incremental-reading-tabs :global(.tab-button.active:hover:not(.disabled)) {
    background: transparent;
    color: var(--text-normal);
  }

  .incremental-reading-tab-panel,
  .incremental-reading-tab-content,
  .incremental-reading-tab-followup {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-width: 0;
  }

  /* v3.0 玫瑰色强调条（高级调度） */
  :global(.accent-rose) {
    --accent-color: #f43f5e;
  }

  :global(.with-accent-bar.accent-rose::before) {
    background: linear-gradient(180deg, #f43f5e, #e11d48);
  }

  @media (max-width: 768px) {
    .incremental-reading-tabs :global(.tab-navigation) {
      gap: 0.5rem;
    }
  }

</style>
