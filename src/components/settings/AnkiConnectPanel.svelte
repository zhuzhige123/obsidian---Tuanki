<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Notice } from 'obsidian';
  import type WeavePlugin from '../../main';
  import type { AnkiConnectSettings, DeckSyncMapping } from './types/settings-types';
  import type {
    ConnectionStatus,
    AnkiDeckInfo,
    AnkiModelInfo,
    ExportResult,
    ModelMismatchRepairResult,
    SyncFailureReason,
    SyncWarningReason
  } from '../../types/ankiconnect-types';
  import type { Deck } from '../../data/types';

  import { logger } from '../../utils/logger';
  import { tr } from '../../utils/i18n';
  import { AnkiConnectService } from '../../services/ankiconnect/AnkiConnectService';
  import { ConnectionErrorType } from '../../types/ankiconnect-types';
  import {
    cloneAnkiConnectSettings,
    createDefaultAnkiConnectSettings,
    normalizeAnkiConnectSettings
  } from '../../services/ankiconnect/anki-connect-settings';

  import DeckMappingSection from './ankiconnect/DeckMappingSection.svelte';
  import SyncProgressModal from './ankiconnect/SyncProgressModal.svelte';
  import SyncResultModal from './ankiconnect/SyncResultModal.svelte';
  import ConnectionManager from './ankiconnect/components/ConnectionManager.svelte';
  import AutoSyncConfig from './ankiconnect/components/AutoSyncConfig.svelte';
  import AdvancedSettings from './ankiconnect/components/AdvancedSettings.svelte';

  let {
    plugin
  }: {
    plugin: WeavePlugin;
  } = $props();

  let t = $derived($tr);

  const defaultSettings = createDefaultAnkiConnectSettings();
  const initialSettings = untrack(() => {
    if (!plugin.settings.ankiConnect) {
      plugin.settings.ankiConnect = cloneAnkiConnectSettings(defaultSettings);
    }

    return cloneAnkiConnectSettings(plugin.settings.ankiConnect);
  });

  let settings = $state(initialSettings);
  let ankiService = $state<AnkiConnectService | null>(untrack(() => plugin.ankiConnectService));
  let connectionStatus = $state<ConnectionStatus | null>(initialSettings.uiCache?.lastConnectionStatus ?? null);
  let ankiDecks = $state<AnkiDeckInfo[]>(initialSettings.uiCache?.ankiDecks ?? []);
  let ankiModels = $state<AnkiModelInfo[]>(initialSettings.uiCache?.ankiModels ?? []);
  let weaveDecks = $state<Deck[]>([]);

  let isTesting = $state(false);
  let isFetchingDecks = $state(false);
  let isFetchingModels = $state(false);

  let isConnected = $derived(connectionStatus?.isConnected ?? false);

  let progressModal = $state({
    open: false,
    operation: 'sync_to_anki' as 'fetch_models' | 'sync_to_anki' | 'batch_sync',
    title: '',
    current: 0,
    total: 0,
    status: '',
    currentItem: '',
    deckIndex: 0,
    totalDecks: 0
  });

  let resultModal = $state({
    open: false,
    title: '',
    result: null as ExportResult | null,
    repairResult: null as ModelMismatchRepairResult | null,
    repairedCardIds: [] as string[],
    isRepairing: false
  });
  const corsConfigSnippet = `"webCorsOriginList": [
    "http://localhost",
    "app://obsidian.md"
]`;
  let showCorsModal = $state(false);

  function closeResultModal() {
    resultModal.open = false;
    resultModal.isRepairing = false;
  }

  function copyCorsConfig() {
    navigator.clipboard.writeText(corsConfigSnippet);
    new Notice(t('ankiConnect.notices.copiedToClipboard'));
  }

  function showResultModal(title: string, result: ExportResult) {
    resultModal = {
      open: true,
      title,
      result,
      repairResult: null,
      repairedCardIds: [],
      isRepairing: false
    };
  }

  function buildExportNotice(result: ExportResult): string {
    return `新增 ${result.createdCards}，更新 ${result.updatedCards}，无变化 ${result.unchangedCards}，重复 ${result.duplicateCards}，失败 ${result.failedCards}`;
  }

  function buildRepairNotice(result: ModelMismatchRepairResult): string {
    const remaining = result.failedCards + result.archivedOnlyCards;
    if (remaining === 0) {
      return `错模型修复完成：已修复 ${result.fixedCards} 张，旧卡已归档到 ${result.archiveDeckName}`;
    }

    return `已修复 ${result.fixedCards} 张，仍有 ${remaining} 张需要继续处理`;
  }

  function createEmptyExportResult(): ExportResult {
    return {
      success: true,
      totalCards: 0,
      exportedCards: 0,
      createdModels: 0,
      createdCards: 0,
      updatedCards: 0,
      unchangedCards: 0,
      duplicateCards: 0,
      skippedCards: 0,
      failedCards: 0,
      warningCards: 0,
      errors: [],
      items: [],
      summary: {
        totalCards: 0,
        exportedCards: 0,
        skippedCards: 0,
        createdCards: 0,
        updatedCards: 0,
        unchangedCards: 0,
        duplicateCards: 0,
        failedCards: 0,
        warningCards: 0,
        failureReasons: {},
        warningReasons: {}
      }
    };
  }

  function mergeExportResults(results: ExportResult[]): ExportResult {
    const merged = createEmptyExportResult();

    for (const result of results) {
      merged.success = merged.success && result.success;
      merged.totalCards += result.totalCards;
      merged.exportedCards += result.exportedCards;
      merged.createdModels += result.createdModels;
      merged.createdCards += result.createdCards;
      merged.updatedCards += result.updatedCards;
      merged.unchangedCards += result.unchangedCards;
      merged.duplicateCards += result.duplicateCards;
      merged.skippedCards += result.skippedCards;
      merged.failedCards += result.failedCards;
      merged.warningCards += result.warningCards;
      merged.errors.push(...result.errors);
      merged.items.push(...result.items);

      for (const [reason, count] of Object.entries(result.summary.failureReasons)) {
        const failureReason = reason as SyncFailureReason;
        merged.summary.failureReasons[failureReason] =
          (merged.summary.failureReasons[failureReason] ?? 0) + (count ?? 0);
      }

      for (const [reason, count] of Object.entries(result.summary.warningReasons)) {
        const warningReason = reason as SyncWarningReason;
        merged.summary.warningReasons[warningReason] =
          (merged.summary.warningReasons[warningReason] ?? 0) + (count ?? 0);
      }
    }

    merged.summary.totalCards = merged.totalCards;
    merged.summary.exportedCards = merged.exportedCards;
    merged.summary.skippedCards = merged.skippedCards;
    merged.summary.createdCards = merged.createdCards;
    merged.summary.updatedCards = merged.updatedCards;
    merged.summary.unchangedCards = merged.unchangedCards;
    merged.summary.duplicateCards = merged.duplicateCards;
    merged.summary.failedCards = merged.failedCards;
    merged.summary.warningCards = merged.warningCards;

    return merged;
  }

  function syncServiceReference() {
    ankiService = plugin.ankiConnectService;
  }

  function ensureUiCache() {
    if (!settings.uiCache) {
      settings.uiCache = {
        ankiDecks: [],
        ankiModels: [],
        lastFetchTime: ''
      };
    }

    return settings.uiCache;
  }

  async function saveSettings(showNotice = true) {
    const previous = cloneAnkiConnectSettings(plugin.settings.ankiConnect ?? defaultSettings);
    const next = normalizeAnkiConnectSettings(settings);
    const enabledChanged = previous.enabled !== next.enabled;
    const endpointChanged = previous.endpoint !== next.endpoint;

    plugin.settings.ankiConnect = next;
    settings = cloneAnkiConnectSettings(next);

    if (enabledChanged) {
      await plugin.toggleAnkiConnect(next.enabled);
      syncServiceReference();
      if (!next.enabled) {
        connectionStatus = null;
      }
    } else if (endpointChanged && next.enabled) {
      await plugin.updateAnkiConnectEndpoint(next.endpoint);
      syncServiceReference();
      connectionStatus = null;
    } else {
      await plugin.saveSettings();
      syncServiceReference();

      if (next.enabled && ankiService) {
        ankiService.updateSettings({
          mediaSync: next.mediaSync,
          autoSync: next.autoSync
        });
      }
    }

    if (showNotice) {
      new Notice(t('ankiConnect.notices.settingsSaved'));
    }
  }

  function persistSettings(showNotice = true) {
    void saveSettings(showNotice).catch((error) => {
      logger.error('保存 AnkiConnect 设置失败:', error);
      new Notice(t('ankiConnect.notices.saveFailed'));
    });
  }

  async function testConnection() {
    isTesting = true;

    try {
      if (!plugin.ankiConnectService) {
        await plugin.initializeAnkiConnect();
        syncServiceReference();
      }

      if (!ankiService) {
        throw new Error('AnkiConnect 服务初始化失败');
      }

      const status = await ankiService.testConnection();
      connectionStatus = status;

      if (status.isConnected) {
        ankiService.startConnectionMonitoring();
      }

      ensureUiCache().lastConnectionStatus = status;
      await saveSettings(false);

      if (status.isConnected) {
        new Notice(t('ankiConnect.notices.connectSuccess'));
        setTimeout(() => {
          new Notice(t('ankiConnect.notices.connectHint'), 3000);
        }, 500);
      } else {
        new Notice(
          t('ankiConnect.notices.connectFailed') + (status.error?.message || t('common.unknown'))
        );
      }
    } catch (error: any) {
      connectionStatus = {
        isConnected: false,
        lastCheckTime: new Date().toISOString(),
        error: {
          type: ConnectionErrorType.UNKNOWN,
          message: error.message,
          suggestion: '请确保 Anki 正在运行且已安装 AnkiConnect 插件'
        }
      };

      ensureUiCache().lastConnectionStatus = connectionStatus;
      await saveSettings(false).catch((saveError) => {
        logger.error('保存连接失败状态失败:', saveError);
      });
      new Notice(t('ankiConnect.notices.connectTestFailed') + error.message);
    } finally {
      isTesting = false;
    }
  }

  async function fetchAnkiDecks() {
    if (!ankiService) {
      new Notice(t('ankiConnect.notices.pleaseTestFirst'));
      return;
    }

    isFetchingDecks = true;

    try {
      const decks = await ankiService.getAnkiDecks();
      ankiDecks = decks;

      const uiCache = ensureUiCache();
      uiCache.ankiDecks = decks;
      uiCache.lastFetchTime = new Date().toISOString();

      await saveSettings(false);
      new Notice(t('ankiConnect.notices.fetchedDecks', { count: decks.length }));
    } catch (error: any) {
      logger.error('获取 Anki 牌组失败:', error);
      new Notice(t('ankiConnect.notices.fetchDecksFailed') + error.message);
    } finally {
      isFetchingDecks = false;
    }
  }

  async function fetchAnkiModels() {
    if (!ankiService) {
      new Notice(t('ankiConnect.notices.pleaseTestFirst'));
      return;
    }

    isFetchingModels = true;
    progressModal = {
      open: true,
      operation: 'fetch_models',
      title: '正在获取 Anki 模板',
      current: 0,
      total: 0,
      status: '正在读取 Anki 笔记类型和字段...',
      currentItem: '',
      deckIndex: 0,
      totalDecks: 0
    };

    try {
      const models = await ankiService.getAnkiModels((current, total) => {
        progressModal.current = current;
        progressModal.total = total;
        progressModal.status = `正在读取 Anki 模板 ${current}/${total}`;
      });

      ankiModels = [...models].sort((left, right) =>
        left.name.localeCompare(right.name, 'zh-Hans-CN')
      );

      const uiCache = ensureUiCache();
      uiCache.ankiModels = ankiModels;
      uiCache.lastFetchTime = new Date().toISOString();

      progressModal.open = false;
      await saveSettings(false);
      new Notice(`已获取 ${ankiModels.length} 个 Anki 模板`, 5000);
    } catch (error: any) {
      progressModal.open = false;
      logger.error('获取 Anki 模板失败:', error);
      new Notice(`获取 Anki 模板失败：${error.message}`, 8000);
    } finally {
      isFetchingModels = false;
    }
  }

  async function loadWeaveDecks() {
    try {
      if (plugin.dataStorage) {
        weaveDecks = await plugin.dataStorage.getDecks();
      } else {
        logger.warn('DataStorage 未初始化');
        weaveDecks = [];
      }
    } catch (error: any) {
      logger.error('加载 Weave 牌组失败:', error);
      weaveDecks = [];
    }
  }

  function addDeckMapping(mapping: DeckSyncMapping) {
    const mappingId = mapping.ankiDeckName;

    if (settings.deckMappings[mappingId]) {
      new Notice(t('ankiConnect.notices.mappingExists', { name: mapping.ankiDeckName }));
      return;
    }

    settings.deckMappings = {
      ...settings.deckMappings,
      [mappingId]: mapping
    };

    persistSettings();
    new Notice(
      t('ankiConnect.notices.mappingAdded', {
        weave: mapping.weaveDeckName,
        anki: mapping.ankiDeckName
      })
    );
  }

  function updateDeckMapping(id: string, updates: Partial<DeckSyncMapping>) {
    const mapping = settings.deckMappings[id];

    if (!mapping) {
      logger.warn(`未找到映射: ${id}`);
      return;
    }

    settings.deckMappings = {
      ...settings.deckMappings,
      [id]: {
        ...mapping,
        ...updates
      }
    };

    persistSettings(false);
  }

  function removeDeckMapping(id: string) {
    const { [id]: _removed, ...remaining } = settings.deckMappings;
    settings.deckMappings = remaining;
    persistSettings(false);
  }

  async function repairModelMismatchFromModal() {
    if (!ankiService || !resultModal.result) {
      new Notice('AnkiConnect 服务未初始化，无法修复');
      return;
    }

    const pendingItems = resultModal.result.items.filter(
      (item) => item.reason === 'model_mismatch' && !resultModal.repairedCardIds.includes(item.cardId)
    );

    if (pendingItems.length === 0) {
      new Notice('当前没有待修复的错模型卡片');
      return;
    }

    resultModal.isRepairing = true;
    resultModal.repairResult = null;
    progressModal = {
      open: true,
      operation: 'sync_to_anki',
      title: '正在修复错模型卡片',
      current: 0,
      total: pendingItems.length * 2,
      status: '正在准备归档旧卡并重建正确模板...',
      currentItem: `待修复 ${pendingItems.length} 张卡片`,
      deckIndex: 1,
      totalDecks: 1
    };

    try {
      const repairResult = await ankiService.repairModelMismatchNotes(
        pendingItems,
        (current, total, status) => {
          progressModal.current = current;
          progressModal.total = total;
          progressModal.status = status || '正在修复错模型卡片';
        }
      );

      progressModal.open = false;
      resultModal.repairResult = repairResult;
      resultModal.repairedCardIds = Array.from(
        new Set([
          ...resultModal.repairedCardIds,
          ...repairResult.items
            .filter((item) => item.outcome === 'fixed')
            .map((item) => item.cardId)
        ])
      );

      new Notice(buildRepairNotice(repairResult), repairResult.success ? 6000 : 8000);
    } catch (error: any) {
      progressModal.open = false;
      logger.error('修复错模型卡片失败:', error);
      new Notice(`修复错模型卡片失败：${error.message}`, 8000);
    } finally {
      resultModal.isRepairing = false;
    }
  }

  async function quickSyncToAnki(deckId: string) {
    if (!ankiService) {
      new Notice(t('ankiConnect.notices.pleaseInitFirst'));
      return;
    }

    const mapping = settings.deckMappings[deckId];
    if (!mapping) {
      new Notice(t('ankiConnect.notices.mappingNotFound'));
      return;
    }

    try {
      progressModal = {
        open: true,
        operation: 'sync_to_anki',
        title: t('ankiConnect.notices.exportToAnkiTitle'),
        current: 0,
        total: 0,
        status: t('ankiConnect.notices.preparing'),
        currentItem: mapping.weaveDeckName,
        deckIndex: 1,
        totalDecks: 1
      };

      const result = await ankiService.exportDeckToAnki(
        mapping.weaveDeckId,
        mapping.ankiDeckName,
        (current, total, status) => {
          progressModal.current = current;
          progressModal.total = total;
          progressModal.status = status || t('ankiConnect.notices.syncingCards');
        }
      );

      progressModal.open = false;

      if (!result.success) {
        throw new Error(t('ankiConnect.notices.syncFailed'));
      }

      mapping.lastSyncTime = new Date().toISOString();
      await saveSettings(false);

      new Notice(`${mapping.weaveDeckName} 同步完成：${buildExportNotice(result)}`, 5000);
      showResultModal(`${mapping.weaveDeckName} 同步结果`, result);

      if (result.errors.length > 0) {
        logger.warn('同步过程中出现警告:', result.errors);
      }
    } catch (error: any) {
      progressModal.open = false;
      logger.error('同步牌组失败:', error);

      let userMessage = t('ankiConnect.notices.syncFailed');
      if (error.message?.includes('not running') || error.message?.includes('未运行')) {
        userMessage = t('ankiConnect.notices.ankiNotRunning');
      } else if (error.message?.includes('deck') || error.message?.includes('牌组')) {
        userMessage = t('ankiConnect.notices.deckNotAccessible');
      } else if (error.message) {
        userMessage = error.message;
      }

      new Notice(userMessage, 5000);
    }
  }

  async function performSync() {
    if (!ankiService) {
      new Notice(t('ankiConnect.notices.pleaseInitFirst'));
      return;
    }

    const enabledMappings = Object.values(settings.deckMappings).filter((mapping) => mapping.enabled);

    if (enabledMappings.length === 0) {
      new Notice(t('ankiConnect.notices.noEnabledMappings'));
      return;
    }

    const results = {
      totalDecks: enabledMappings.length,
      successDecks: 0,
      failedDecks: 0,
      successCards: 0,
      skippedCards: 0,
      errors: [] as string[]
    };
    const exportResults: ExportResult[] = [];

    try {
      progressModal = {
        open: true,
        operation: 'batch_sync',
        title: t('ankiConnect.notices.batchExportTitle'),
        current: 0,
        total: 0,
        status: t('ankiConnect.notices.preparing'),
        currentItem: '',
        deckIndex: 0,
        totalDecks: enabledMappings.length
      };

      for (let index = 0; index < enabledMappings.length; index++) {
        const mapping = enabledMappings[index];

        progressModal.currentItem = mapping.weaveDeckName;
        progressModal.deckIndex = index + 1;
        progressModal.current = 0;
        progressModal.total = 0;
        progressModal.status = t('ankiConnect.notices.processing');

        try {
          const result = await ankiService.exportDeckToAnki(
            mapping.weaveDeckId,
            mapping.ankiDeckName,
            (current, total, status) => {
              progressModal.current = current;
              progressModal.total = total;
              progressModal.status = status || t('ankiConnect.notices.syncingCards');
            }
          );

          if (!result.success) {
            throw new Error(t('ankiConnect.notices.exportFailed'));
          }

          results.successDecks++;
          results.successCards += result.exportedCards;
          results.skippedCards += result.skippedCards;
          exportResults.push(result);

          mapping.lastSyncTime = new Date().toISOString();
        } catch (error: any) {
          results.failedDecks++;
          results.errors.push(`${mapping.weaveDeckName}: ${error.message}`);
          logger.error(`处理牌组 "${mapping.weaveDeckName}" 失败:`, error);
        }
      }

      progressModal.open = false;
      await saveSettings(false);

      const mergedExportResult = exportResults.length > 0 ? mergeExportResults(exportResults) : null;

      if (mergedExportResult) {
        new Notice(
          `批量同步完成：成功牌组 ${results.successDecks}/${results.totalDecks}，${buildExportNotice(mergedExportResult)}`,
          results.failedDecks === 0 ? 6000 : 8000
        );
        showResultModal('批量同步结果', mergedExportResult);
      } else if (results.failedDecks === 0) {
        new Notice(
          t('ankiConnect.notices.batchComplete', {
            success: results.successDecks,
            total: results.totalDecks,
            cards: results.successCards
          }),
          6000
        );
      } else {
        new Notice(
          t('ankiConnect.notices.batchCompleteWithErrors', {
            success: results.successDecks,
            failed: results.failedDecks
          }),
          8000
        );
      }

      if (results.errors.length > 0) {
        logger.warn('批量同步错误详情:', results.errors);
      }
    } catch (error: any) {
      progressModal.open = false;
      logger.error('批量处理失败:', error);
      new Notice(t('ankiConnect.notices.batchFailed') + error.message, 5000);
    }
  }

  function handleEndpointChange(endpoint: string) {
    settings.endpoint = endpoint.trim() || defaultSettings.endpoint;
    persistSettings(false);
  }

  function handleAutoSyncSettingsChange(autoSync: AnkiConnectSettings['autoSync']) {
    settings.autoSync = { ...autoSync };
    persistSettings(false);
  }

  function handleMediaSyncChange() {
    persistSettings(false);
  }

  onMount(async () => {
    if (settings.uiCache?.lastFetchTime) {
      const lastFetch = new Date(settings.uiCache.lastFetchTime);
      const hoursSinceLastFetch = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastFetch > 1 && ankiDecks.length > 0) {
        setTimeout(() => {
          new Notice(t('ankiConnect.notices.dataExpired'), 5000);
        }, 2000);
      }
    }

    await loadWeaveDecks().catch((error) => {
      logger.error('加载 Weave 牌组失败:', error);
    });
  });
</script>

<div class="weave-settings settings-section anki-connect-section">
  <div class="settings-group sync-overview-group">
    <div class="section-header section-header-inline">
      <h3 class="section-title with-accent-bar accent-red">{t('ankiConnect.title')}</h3>
      <div class="section-tools">
        {#if settings.enabled}
          <button
            class="secondary-action-btn"
            type="button"
            onclick={() => {
              showCorsModal = true;
            }}
          >
            {t('ankiConnect.notices.corsTitle')}
          </button>
        {/if}
      </div>
    </div>
    <p class="section-description">{t('ankiConnect.description')}</p>

    <div class="setting-item primary-toggle-item">
      <div class="setting-info">
        <div class="setting-label">{t('ankiConnect.enable.label')}</div>
        <div class="setting-description">{t('ankiConnect.enable.description')}</div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={settings.enabled}
            onchange={() => persistSettings(false)}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    {#if settings.enabled}
      <div class="config-shell">
        <ConnectionManager
          {connectionStatus}
          {isTesting}
          endpoint={settings.endpoint}
          onTestConnection={testConnection}
          onEndpointChange={handleEndpointChange}
        />

        <AutoSyncConfig
          autoSyncSettings={settings.autoSync}
          onSettingsChange={handleAutoSyncSettingsChange}
        />

        <AdvancedSettings
          mediaSync={settings.mediaSync}
          onMediaSyncChange={handleMediaSyncChange}
        />
      </div>
    {/if}
  </div>

  {#if settings.enabled}
    <DeckMappingSection
      app={plugin.app}
      {ankiDecks}
      {ankiModels}
      {weaveDecks}
      {isConnected}
      {isFetchingDecks}
      {isFetchingModels}
      mappings={settings.deckMappings}
      onFetchDecks={fetchAnkiDecks}
      onFetchModels={fetchAnkiModels}
      onAddMapping={addDeckMapping}
      onUpdateMapping={updateDeckMapping}
      onRemoveMapping={removeDeckMapping}
      onSync={quickSyncToAnki}
      onBatchSync={performSync}
    />
  {/if}

  {#if showCorsModal}
    <div
      class="floating-panel-overlay"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) {
          showCorsModal = false;
        }
      }}
    >
      <div
        class="floating-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="anki-cors-panel-title"
      >
        <div class="floating-panel-header">
          <div class="floating-panel-copy">
            <h3 id="anki-cors-panel-title">{t('ankiConnect.notices.corsTitle')}</h3>
            <p>{t('ankiConnect.notices.corsDesc')}</p>
          </div>
          <button
            class="floating-panel-close"
            type="button"
            aria-label="关闭"
            onclick={() => {
              showCorsModal = false;
            }}
          >
            ×
          </button>
        </div>

        <div class="floating-panel-body">
          <div class="cors-code-block">
            <pre>{corsConfigSnippet}</pre>
          </div>
        </div>

        <div class="floating-panel-footer">
          <button
            class="secondary-action-btn"
            type="button"
            onclick={() => {
              showCorsModal = false;
            }}
          >
            关闭
          </button>
          <button class="primary-action-btn" type="button" onclick={copyCorsConfig}>
            {t('ankiConnect.notices.copyBtn')}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <SyncProgressModal
    open={progressModal.open}
    operation={progressModal.operation}
    title={progressModal.title}
    current={progressModal.current}
    total={progressModal.total}
    status={progressModal.status}
    currentItem={progressModal.currentItem}
    deckIndex={progressModal.deckIndex}
    totalDecks={progressModal.totalDecks}
  />

  <SyncResultModal
    open={resultModal.open}
    title={resultModal.title}
    result={resultModal.result}
    repairResult={resultModal.repairResult}
    repairedCardIds={resultModal.repairedCardIds}
    isRepairing={resultModal.isRepairing}
    onRepairModelMismatch={repairModelMismatchFromModal}
    onClose={closeResultModal}
  />
</div>

<style>
  .anki-connect-section {
    position: relative;
    z-index: 1;
    pointer-events: auto;
  }

  .anki-connect-section input,
  .anki-connect-section .toggle-switch {
    pointer-events: auto !important;
    position: relative;
    z-index: 1;
  }

  .sync-overview-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-header-inline {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 0;
  }

  .section-description {
    margin: 0;
  }

  .section-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .primary-toggle-item {
    margin: 0;
  }

  .config-shell {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .config-shell :global(.connection-manager),
  .config-shell :global(.autosync-config),
  .config-shell :global(.advanced-settings) {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .secondary-action-btn,
  .primary-action-btn,
  .floating-panel-close {
    border-radius: 14px;
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
  }

  .secondary-action-btn,
  .floating-panel-close {
    background: var(--background-secondary);
    color: var(--text-normal);
  }

  .secondary-action-btn,
  .primary-action-btn {
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
  }

  .primary-action-btn {
    background: var(--interactive-accent);
    border-color: color-mix(in srgb, var(--interactive-accent) 78%, black 10%);
    color: var(--text-on-accent, #fff);
  }

  .floating-panel-close {
    width: 34px;
    height: 34px;
    padding: 0;
    font-size: 20px;
    line-height: 1;
  }

  .secondary-action-btn:hover,
  .primary-action-btn:hover,
  .floating-panel-close:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
    transform: translateY(-1px);
  }

  .primary-action-btn:hover {
    background: color-mix(in srgb, var(--interactive-accent) 88%, black 8%);
  }

  .floating-panel-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.48);
    backdrop-filter: blur(2px);
  }

  .floating-panel {
    width: min(620px, 100%);
    border-radius: 18px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.26);
    overflow: hidden;
  }

  .floating-panel-header,
  .floating-panel-footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px;
  }

  .floating-panel-header {
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .floating-panel-copy {
    min-width: 0;
  }

  .floating-panel-copy h3,
  .floating-panel-copy p {
    margin: 0;
  }

  .floating-panel-copy h3 {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-normal);
  }

  .floating-panel-copy p {
    margin-top: 6px;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .floating-panel-body {
    padding: 20px;
  }

  .cors-code-block {
    background: color-mix(in srgb, var(--background-secondary) 92%, transparent);
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    overflow: hidden;
  }

  .cors-code-block pre {
    margin: 0;
    padding: 18px;
    font-family: var(--font-monospace);
    font-size: 12px;
    line-height: 1.65;
    color: var(--text-normal);
    overflow-x: auto;
  }

  .floating-panel-footer {
    border-top: 1px solid var(--background-modifier-border);
    justify-content: flex-end;
    align-items: center;
  }

  .anki-connect-section :global(.anki-table) {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .anki-connect-section :global(.anki-table thead) {
    background: var(--background-secondary);
  }

  .anki-connect-section :global(.anki-table th) {
    padding: 12px 16px;
    text-align: left;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    border-bottom: 2px solid var(--background-modifier-border);
    border-right: 1px solid var(--background-modifier-border-hover);
  }

  .anki-connect-section :global(.anki-table th:last-child) {
    border-right: none;
  }

  .anki-connect-section :global(.anki-table tbody tr) {
    border-bottom: 1px solid var(--background-modifier-border);
    transition: background-color 0.15s ease;
  }

  .anki-connect-section :global(.anki-table tbody tr:last-child) {
    border-bottom: none;
  }

  .anki-connect-section :global(.anki-table tbody tr:hover) {
    background: var(--background-modifier-hover);
  }

  .anki-connect-section :global(.anki-table td) {
    padding: 12px 16px;
    font-size: 14px;
    border-right: 1px solid var(--background-modifier-border-hover);
  }

  .anki-connect-section :global(.anki-table td:last-child) {
    border-right: none;
  }

  .anki-connect-section :global(.mapping-table-container),
  .anki-connect-section :global(.log-table-container) {
    width: 100%;
    overflow-x: auto;
    margin-top: 16px;
    border-radius: 8px;
    -webkit-overflow-scrolling: touch;
  }

  @media (max-width: 720px) {
    .section-header-inline,
    .floating-panel-header,
    .floating-panel-footer {
      flex-direction: column;
      align-items: stretch;
    }

    .section-tools {
      width: 100%;
    }

    .secondary-action-btn,
    .primary-action-btn {
      width: 100%;
      justify-content: center;
    }

    .floating-panel-overlay {
      padding: 16px;
    }

    .floating-panel-close {
      align-self: flex-end;
    }
  }
</style>
