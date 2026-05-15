<script lang="ts">
  import { type App, Menu, Notice } from 'obsidian';
  import type { AnkiDeckInfo, AnkiModelInfo } from '../../../types/ankiconnect-types';
  import type { Deck } from '../../../data/types';
  import type { DeckSyncMapping } from '../../settings/types/settings-types';
  import { tr, trArray } from '../../../utils/i18n';
  import ObsidianDropdown from '../../ui/ObsidianDropdown.svelte';
  import { CardTypeMappingModalObsidian } from './CardTypeMappingModalObsidian';
  import SettingsHelpModal from '../components/SettingsHelpModal.svelte';
  import SettingsHelpTriggerButton from '../components/SettingsHelpTriggerButton.svelte';

  // 子组件
  import AddMappingForm from './deck-mapping/components/AddMappingForm.svelte';
  import ToolbarActions from './deck-mapping/components/ToolbarActions.svelte';

  // 响应式翻译
  let t = $derived($tr);
  let tList = $derived($trArray);
  
  // UI组件（原生 Menu API，无需额外导入）
  
  type DeckMappingRow = DeckSyncMapping & {
    _id: string;
  };

  let {
    app,
    ankiDecks = [],
    ankiModels = [],
    weaveDecks = [],
    isFetchingDecks = false,
    isFetchingModels = false,
    isConnected = false,
    mappings = {},
    onFetchDecks,
    onFetchModels,
    onAddMapping,
    onUpdateMapping,
    onRemoveMapping,
    onSync,
    onBatchSync
  }: {
    app: App;
    ankiDecks: AnkiDeckInfo[];
    ankiModels?: AnkiModelInfo[];
    weaveDecks: Deck[];
    isFetchingDecks?: boolean;
    isFetchingModels?: boolean;
    isConnected?: boolean;
    mappings: Record<string, DeckSyncMapping>;
    onFetchDecks: () => Promise<void>;
    onFetchModels: () => Promise<void>;
    onAddMapping: (mapping: DeckSyncMapping) => void;
    onUpdateMapping: (id: string, updates: Partial<DeckSyncMapping>) => void;
    onRemoveMapping: (id: string) => void;
    onSync: (deckId: string) => Promise<void>;
    onBatchSync: () => Promise<void>;
  } = $props();

  let showAddModal = $state(false);
  let syncingDeckId = $state<string | null>(null);
  let showHelpModal = $state(false);

  // 将 mappings 转换为数组，保留 key 信息
  let mappingList = $derived.by(() => {
    const list = Object.entries(mappings).map(([id, mapping]) => ({
      _id: id, // 保留原始 key
      ...mapping
    })) as DeckMappingRow[];
    return list;
  });

  async function handleFetch() {
    await onFetchDecks();
  }
  
  function handleAddMapping(mapping: DeckSyncMapping) {
    onAddMapping(mapping);
    showAddModal = false;
  }

  async function handleSync(deckId: string) {
    syncingDeckId = deckId;
    try {
      await onSync(deckId);
    } finally {
      syncingDeckId = null;
    }
  }

  function formatLastSyncTime(time: string | undefined): string {
    if (!time) return t('ankiConnect.deckMapping.neverSynced');
    
    const date = new Date(time);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return t('ankiConnect.deckMapping.justNow');
    if (diffMins < 60) return t('ankiConnect.deckMapping.minutesAgo', { n: diffMins });
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('ankiConnect.deckMapping.hoursAgo', { n: diffHours });
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t('ankiConnect.deckMapping.daysAgo', { n: diffDays });
    
    return date.toLocaleDateString();
  }

  function getContentConversionValue(mapping: DeckSyncMapping): 'standard' | 'preserve_style' | 'minimal' {
    return mapping?.contentConversion || 'standard';
  }

  function openCardTypeMappingModal(mapping: DeckMappingRow) {
    new CardTypeMappingModalObsidian(app, {
      mappingId: mapping._id,
      mapping,
      ankiModels,
      isConnected,
      onUpdateMapping
    }).open();
  }

  /**
   * 显示映射操作菜单（Obsidian 原生 Menu）
   */
  function showMappingActionsMenu(mapping: DeckMappingRow, event: MouseEvent) {
    const menu = new Menu();
    const isSyncing = syncingDeckId === mapping._id;

    menu.addItem((item) => {
      item
        .setTitle(t('ankiConnect.deckMapping.exportToAnki'))
        .setIcon('upload')
        .setDisabled(!mapping.enabled || isSyncing)
        .onClick(() => handleSync(mapping._id));
    });

    menu.addItem((item) => {
      item
        .setTitle(t('ankiConnect.deckMapping.fieldMapping'))
        .setIcon('settings-2')
        .onClick(() => openCardTypeMappingModal(mapping));
    });
    
    // 添加分隔符和删除选项
    menu.addSeparator();
    
    menu.addItem((item) => {
      item
        .setTitle(t('ankiConnect.deckMapping.deleteMapping'))
        .setIcon('trash')
        .onClick(() => onRemoveMapping(mapping._id));
    });
    
    menu.showAtMouseEvent(event);
  }

  /**
   * 显示批量操作菜单
   */
  function showBatchActionsMenu(event: MouseEvent) {
    const menu = new Menu();

    const enabledMappings = Object.values(mappings).filter(m => m.enabled);
    const enabledCount = enabledMappings.length;

    menu.addItem((item) => {
      item
        .setTitle(t('ankiConnect.deckMapping.batchExportToAnki'))
        .setIcon("arrow-right")
        .setDisabled(enabledCount === 0)
        .onClick(async () => {
          if (enabledCount === 0) {
            new Notice(t('ankiConnect.deckMapping.noEnabledMappings'));
            return;
          }
          await onBatchSync();
        });

      if (enabledCount > 0) {
        (item as any).setSection?.(t('ankiConnect.deckMapping.enabledCount', { count: enabledCount }));
      }
    });

    menu.showAtMouseEvent(event);
  }
</script>

<div class="deck-mapping-section settings-group">
  <div class="group-header">
    <div class="header-content">
      <h4 class="section-title with-accent-bar accent-purple">{t('ankiConnect.deckSync.title')}</h4>
      <p>{t('ankiConnect.deckSync.description')}</p>
    </div>
    <div class="header-actions">
      {#if mappingList.length > 0}
        <SettingsHelpTriggerButton
          label={t('common.help')}
          onClick={() => showHelpModal = true}
        />
      {/if}
      <button 
        class="header-action-btn"
        aria-label={t('common.batchOperations')}
        title={t('common.batchOperations')}
        onclick={showBatchActionsMenu}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="19" cy="12" r="1"></circle>
          <circle cx="5" cy="12" r="1"></circle>
        </svg>
      </button>
    </div>
  </div>

  {#if weaveDecks.length === 0}
    <div class="info-banner warning">
      <span class="banner-icon">!</span>
      <div class="banner-text">
        <strong>{t('ankiConnect.deckMapping.noWeaveDecks')}</strong><br />
        {t('ankiConnect.deckMapping.noWeaveDecksHint')}
      </div>
    </div>
  {/if}

  <!-- 工具栏操作 -->
  <ToolbarActions
    {ankiDecks}
    {ankiModels}
    {weaveDecks}
    {isFetchingDecks}
    {isFetchingModels}
    {isConnected}
    {showAddModal}
    onFetchDecks={handleFetch}
    {onFetchModels}
    onToggleAddModal={() => showAddModal = !showAddModal}
  />

  <!-- 添加映射表单 -->
  <AddMappingForm
    isVisible={showAddModal}
    {ankiDecks}
    {weaveDecks}
    onAdd={handleAddMapping}
  />

  {#if mappingList.length > 0}
    <div class="mapping-table-container">
      <table class="anki-table">
        <thead>
          <!-- svelte-ignore component_name_lowercase -->
          <tr>
            <th>{t('ankiConnect.deckMapping.tableHeaders.weaveDeck')}</th>
            <th>{t('ankiConnect.deckMapping.tableHeaders.ankiDeck')}</th>
            <th>{t('ankiConnect.deckMapping.tableHeaders.contentConversion')}</th>
            <th>{t('ankiConnect.deckMapping.tableHeaders.status')}</th>
            <th>{t('ankiConnect.deckMapping.tableHeaders.lastSync')}</th>
            <th>{t('ankiConnect.deckMapping.tableHeaders.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each mappingList as mapping}
            <!-- svelte-ignore component_name_lowercase -->
            <tr>
              <td class="truncate" title={mapping.weaveDeckName}>
                <strong>{mapping.weaveDeckName}</strong>
              </td>
              <td class="truncate" title={mapping.ankiDeckName}>
                {mapping.ankiDeckName}
              </td>
              <td>
                <ObsidianDropdown
                  options={[
                    { id: 'standard', label: t('ankiConnect.deckMapping.contentOptions.standard') },
                    { id: 'preserve_style', label: t('ankiConnect.deckMapping.contentOptions.preserveStyle') },
                    { id: 'minimal', label: t('ankiConnect.deckMapping.contentOptions.minimal') }
                  ]}
                  value={getContentConversionValue(mapping)}
                  onchange={(value) => {
                    onUpdateMapping(mapping._id, { contentConversion: value as any });
                  }}
                />
              </td>
              <td>
                <label class="modern-switch" title={mapping.enabled ? t('ankiConnect.deckMapping.toggleDisable') : t('ankiConnect.deckMapping.toggleEnable')}>
                  <input
                    type="checkbox"
                    checked={mapping.enabled}
                    onchange={() => {
                      onUpdateMapping(mapping._id, { 
                        enabled: !mapping.enabled 
                      });
                    }}
                  />
                  <span class="switch-slider"></span>
                </label>
              </td>
              <td class="last-sync-time truncate" title={formatLastSyncTime(mapping.lastSyncTime)}>
                {formatLastSyncTime(mapping.lastSyncTime)}
              </td>
              <td class="actions-cell">
                <button 
                  class="mapping-menu-btn"
                  aria-label={t('ankiConnect.deckMapping.actionsMenu')}
                  title={t('ankiConnect.deckMapping.moreActions')}
                  onclick={(e) => showMappingActionsMenu(mapping, e)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                  </svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>


<!-- 帮助提示弹窗 -->
<SettingsHelpModal
  open={showHelpModal}
  title={t('ankiConnect.deckMapping.help.title')}
  closeLabel={t('ankiConnect.deckMapping.help.closeHelp')}
  confirmLabel={t('ankiConnect.deckMapping.help.gotIt')}
  onClose={() => showHelpModal = false}
>
  <div class="help-item">
    <div class="help-item-title">{t('ankiConnect.deckMapping.help.mappingCount', { count: mappingList.length })}</div>
    <p class="help-item-desc">{t('ankiConnect.deckMapping.help.mappingCountDesc')}</p>
  </div>

  <div class="help-item">
    <div class="help-item-title">{t('ankiConnect.deckMapping.help.howToUse')}</div>
    <ul class="help-list">
      {#each tList('ankiConnect.deckMapping.help.howToUseItems') as item}
        <li>{item}</li>
      {/each}
    </ul>
  </div>
</SettingsHelpModal>

<style>
  /* DeckMappingSection 组件样式 - 使用全局样式框架 */

  /* 标题头部布局 */
  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 0;
    padding-bottom: 0.4rem;
  }

  .header-content {
    flex: 1;
  }

  /* 多彩侧边颜色条标题样式 */
  /* 批量操作菜单按钮 - Cursor 风格 */
  .header-action-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    opacity: 0.6;
  }

  .header-action-btn:hover {
    opacity: 1;
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .header-action-btn:active {
    transform: scale(0.95);
    background: var(--background-modifier-active);
  }

  .header-action-btn svg {
    width: 18px;
    height: 18px;
  }

  /* 映射操作菜单按钮 - 与批量操作按钮样式一致 */
  .mapping-menu-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    opacity: 0.6;
  }

  .mapping-menu-btn:hover {
    opacity: 1;
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .mapping-menu-btn:active {
    transform: scale(0.95);
    background: var(--background-modifier-active);
  }

  .mapping-menu-btn svg {
    width: 18px;
    height: 18px;
  }

  .mapping-table-container {
    width: 100%;
    overflow-x: auto;
    /* 确保表格在小屏幕上可滚动 */
    -webkit-overflow-scrolling: touch;
  }

  .anki-table {
    width: 100%;
    table-layout: fixed; /* 固定表格布局 */
  }

  /* 为每列设置固定宽度百分比 */
  .anki-table th:nth-child(1),
  .anki-table td:nth-child(1) {
    width: 22%; /* Weave 牌组 */
  }

  .anki-table th:nth-child(2),
  .anki-table td:nth-child(2) {
    width: 28%; /* Anki 牌组 */
  }

  .anki-table th:nth-child(3),
  .anki-table td:nth-child(3) {
    width: 18%; /* 内容转换 */
  }

  .anki-table th:nth-child(4),
  .anki-table td:nth-child(4) {
    width: 10%; /* 状态 */
  }

  .anki-table th:nth-child(5),
  .anki-table td:nth-child(5) {
    width: 14%; /* 上次同步 */
  }

  .anki-table th:nth-child(6),
  .anki-table td:nth-child(6) {
    width: 60px; /* 操作 - 固定宽度，只需容纳图标按钮 */
    text-align: center;
  }

  /* 文本省略样式 */
  .anki-table td.truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .last-sync-time {
    font-size: 13px;
    color: var(--text-muted);
  }

  /* 操作列样式 */
  .actions-cell {
    text-align: center;
    vertical-align: middle;
  }

  /* 信息横幅 */
  .info-banner {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 1rem 1.1rem;
    margin-bottom: 0;
    background: color-mix(in oklab, var(--weave-info), var(--background-primary) 92%);
    border: 1px solid color-mix(in oklab, var(--weave-info), transparent 35%);
    border-radius: 14px;
  }

  .info-banner.warning {
    background: color-mix(in oklab, var(--weave-warning), var(--background-primary) 92%);
    border-color: color-mix(in oklab, var(--weave-warning), transparent 35%);
  }

  .banner-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .banner-text {
    flex: 1;
    font-size: 14px;
    line-height: 1.5;
  }

  .banner-text strong {
    display: block;
    margin-bottom: 4px;
  }

  /* 平板设备适配 */
  @media (max-width: 1024px) {
    .anki-table th:nth-child(1),
    .anki-table td:nth-child(1) {
      width: 18%;
    }
    
    .anki-table th:nth-child(2),
    .anki-table td:nth-child(2) {
      width: 22%;
    }
    
    .anki-table th:nth-child(6),
    .anki-table td:nth-child(6) {
      width: 60px; /* 操作列保持固定宽度 */
    }
  }

  /* 移动设备：隐藏部分列，保持核心信息 */
  @media (max-width: 768px) {
    .mapping-table-container {
      overflow-x: auto;
      /* 允许横向滚动 */
    }
    
    /* 保持所有列可见，但缩小间距 */
    .anki-table th,
    .anki-table td {
      padding: 8px 4px;
      font-size: 12px;
    }

    /* 移动端：操作按钮触控优化 */
    .mapping-menu-btn {
      width: 44px;
      height: 44px;
      margin: -8px; /* 负边距避免撑大单元格 */
    }
    
    .mapping-menu-btn svg {
      width: 20px;
      height: 20px;
    }
    
    .anki-table th:nth-child(6),
    .anki-table td:nth-child(6) {
      width: 60px; /* 移动端保持固定宽度 */
    }
  }

  /* 帮助按钮样式增强 - 浅色模式对比度优化 */
  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

</style>
