<script lang="ts" module>
  /**
   * 模块级别的服务实例（跨组件生命周期保持）
   */
  import { IRStorageService } from '../../services/incremental-reading/IRStorageService';
  import { IRDeckManager } from '../../services/incremental-reading/IRDeckManager';
  import type { App } from 'obsidian';

  let _storageService: IRStorageService | null = null;
  let _deckManager: IRDeckManager | null = null;
  let _servicesInitialized = false;
  let _currentApp: App | null = null;

  export function getServices(app: App, importFolder?: string) {
    // 如果 app 实例变了，重新初始化
    if (_currentApp !== app) {
      _servicesInitialized = false;
      _currentApp = app;
    }
    return {
      get storageService() { return _storageService; },
      get deckManager() { return _deckManager; },
      async init() {
        if (_servicesInitialized && _storageService && _deckManager) {
          return;
        }
        
        try {
          _storageService = new IRStorageService(app);
          await _storageService.initialize();
          
          _deckManager = new IRDeckManager(app, _storageService, importFolder);
          _servicesInitialized = true;
        } catch (error) {
          _servicesInitialized = true;
        }
      }
    };
  }
</script>

<script lang="ts">
  /**
   * 增量阅读专题视图
   * 
   * 复用记忆牌组的卡片设计，支持样式切换
   * 
   * @module components/incremental-reading/IRDeckView
   * @version 2.0.0
   */
  import { onMount, onDestroy } from 'svelte';
  import { Notice, Menu } from 'obsidian';
  import { MaterialImportModalObsidian } from './MaterialImportModalObsidian';
  import IRLoadForecastModal from '../modals/IRLoadForecastModal.svelte';
  import type { BatchImportResult } from '../../services/incremental-reading/ReadingMaterialManager';
  import type { WeavePlugin } from '../../main';
  import type { IRDeck, IRDeckStats } from '../../types/ir-types';
  import type { Deck, DeckStats } from '../../data/types';
  import { logger } from '../../utils/logger';
  import { showObsidianConfirm } from '../../utils/obsidian-confirm';
  // v3.0: 移除旧的 IRScheduler 导入，改用 getServices 中的 schedulingFacade
  // 增量阅读专用卡片组件
  import IRDeckCard from './IRDeckCard.svelte';
  import DeckGridCard from '../deck-views/DeckGridCard.svelte';
  import type { DeckCardStyle } from '../../types/plugin-settings.d';
  import { getColorSchemeForDeck } from '../../config/card-color-schemes';
  import { recomputeAndBroadcastIRData } from '../../services/incremental-reading/IRScheduleRefreshService';
  import { toDeckStats as mapIRDeckStatsToDeckStats } from '../../services/incremental-reading/IRDeckStatsMapper';
  import { getSharedIRWorkspaceSnapshotService } from '../../services/incremental-reading/IRWorkspaceSnapshotService';
  import { openObsidianDeckEditModal } from '../../utils/obsidian-deck-edit-modal';

  interface Props {
    plugin: WeavePlugin;
  }

  function getWorkspaceSnapshotService() {
    return getSharedIRWorkspaceSnapshotService(plugin.app);
  }

  let { plugin }: Props = $props();

  const deckCardStyle = $derived<DeckCardStyle>(
    (plugin.settings.deckCardStyle as DeckCardStyle) || 'default'
  );

  // 牌组数据
  let decks = $state<IRDeck[]>([]);
  let deckStats = $state<Record<string, IRDeckStats>>({});
  let isLoading = $state(true);
  
  // 导入模态窗状态
  let importModalInstance: MaterialImportModalObsidian | null = null;
  
  // 负载预测模态窗状态
  let showLoadForecastModal = $state(false);
  let loadForecastDeckId = $state<string | undefined>(undefined);
  
  // 打开导入模态窗（供外部事件调用）
  export function openImportModal() {
    if (importModalInstance) {
      importModalInstance.close();
      importModalInstance = null;
    }

    importModalInstance = new MaterialImportModalObsidian(plugin.app, {
      plugin,
      onImportComplete: handleImportComplete,
      onClose: () => {
        importModalInstance = null;
      }
    });
    importModalInstance.open();
  }
  
  // 处理导入完成（MaterialImportModal回调）
  function handleImportComplete(result: BatchImportResult) {
    // 显示导入结果通知
    if (result.errors.length > 0) {
      new Notice(`导入完成：${result.success} 个成功，${result.skipped} 个跳过，${result.errors.length} 个失败`);
    } else if (result.skipped > 0) {
      new Notice(`导入完成：${result.success} 个成功，${result.skipped} 个已存在`);
    } else {
      new Notice(`成功导入 ${result.success} 个阅读材料`);
    }
    
    // 导入弹窗内部已经触发统一重排，这里只刷新当前视图
    getWorkspaceSnapshotService().invalidate();
    void loadDecks();
  }

  async function loadDecks() {
    const startTime = Date.now();
    isLoading = true;
    logger.debug('[IRDeckView] loadDecks snapshot start');

    try {
      const snapshot = await getWorkspaceSnapshotService().getDeckOverview({
        dailyNewLimit: plugin.settings?.incrementalReading?.dailyNewLimit ?? 20,
        dailyReviewLimit: plugin.settings?.incrementalReading?.dailyReviewLimit ?? 50,
        learnAheadDays: plugin.settings?.incrementalReading?.learnAheadDays ?? 3,
        dailyTimeBudgetMinutes: plugin.settings?.incrementalReading?.dailyTimeBudgetMinutes ?? 30,
        loadRateDays: 3
      });

      decks = [...snapshot.decks];
      deckStats = { ...snapshot.deckStats };
      logger.info('[IRDeckView] snapshot load complete', {
        deckCount: decks.length,
        durationMs: Date.now() - startTime,
        generatedAt: snapshot.generatedAt
      });
    } catch (error) {
      logger.error('[IRDeckView] snapshot load failed:', error);
      decks = [];
      deckStats = {};
    } finally {
      isLoading = false;
      logger.debug('[IRDeckView] isLoading = false');
    }
  }

  function getStats(deckPath: string): IRDeckStats {
    return deckStats[deckPath] || {
      newCount: 0,
      learningCount: 0,
      reviewCount: 0,
      dueToday: 0,
      dueWithinDays: 0,
      totalCount: 0,
      fileCount: 0,
      questionCount: 0,
      completedQuestionCount: 0
    };
  }

  // 将 IRDeck 转换为 Deck 格式（适配卡片组件）
  function toMemoryDeck(irDeck: IRDeck): Deck {
    const now = new Date().toISOString();
    const deckId = irDeck.id || irDeck.path || '';
    return {
      id: deckId,
      name: irDeck.name || '未命名专题',
      icon: 'book-open',
      description: `${getStats(deckId).fileCount} 个文件`,
      created: irDeck.createdAt || now,
      modified: irDeck.updatedAt || irDeck.createdAt || now,
      cardUUIDs: [],
      deckType: 'mixed',
      category: '',
      path: deckId,
      level: 0,
      order: 0,
      inheritSettings: false,
      settings: {} as any,
      stats: {} as any,
      includeSubdecks: false,
      tags: [],
      metadata: {}
    };
  }

  // 将 IRDeckStats 转换为 DeckStats 格式（适配卡片组件）
  function toMemoryStats(irStats: IRDeckStats): DeckStats {
    return mapIRDeckStatsToDeckStats(irStats);
  }

  // 显示牌组菜单，使用 deckId 作为主要标识
  function showDeckMenu(event: MouseEvent, deck: IRDeck) {
    const menu = new Menu();
    const deckId = deck.id || deck.path || '';
    
    // 牌组编辑
    menu.addItem((item) =>
      item
        .setTitle('专题编辑')
        .setIcon('edit-3')
        .onClick(() => handleEditDeck(deckId))
    );
    
    // 牌组分析（负载预测）
    menu.addItem((item) =>
      item
        .setTitle('专题分析')
        .setIcon('bar-chart-2')
        .onClick(() => {
          loadForecastDeckId = deckId;
          showLoadForecastModal = true;
        })
    );
    
    menu.addSeparator();
    
    // 删除专题
    menu.addItem((item) =>
      item
        .setTitle('删除专题')
        .setIcon('trash-2')
        .setWarning(true)
        .onClick(async () => {
          const confirmed = await confirmAction(
            '删除专题',
            '此操作将删除专题及其增量阅读调度数据，并清理源文档中的增量阅读信息，同时添加“we_已删除”标签；不会删除源文档。确定继续？'
          );
          if (confirmed) {
            const storageService = new IRStorageService(plugin.app);
            await storageService.initialize();
            const deckManager = new IRDeckManager(plugin.app, storageService, plugin.settings?.incrementalReading?.importFolder);
            logger.debug(`[IRDeckView] 删除专题: ${deckId}`);
            await deckManager.deleteDeck(deckId);
            await recomputeAndBroadcastIRData(plugin.app, 'remove_block');
            new Notice('专题已删除，源文档已保留，并已清理增量阅读信息');
          }
        })
    );
    
    menu.showAtMouseEvent(event);
  }

  // 确认操作对话框 - 使用 Obsidian Modal 避免焦点劫持
  async function confirmAction(title: string, message: string): Promise<boolean> {
    return showObsidianConfirm(plugin.app, message, { title });
  }

  // 牌组编辑（名称 + 标签）
  async function handleEditDeck(deckId: string) {
    
    
    const storageService = new IRStorageService(plugin.app);
    await storageService.initialize();
    const deck = await storageService.getDeckById(deckId);
    if (!deck) return;

    const allDecks = Object.values(await storageService.getAllDecks());
    const availableTags = Array.from(
      new Set(allDecks.flatMap((item) => Array.isArray(item.tags) ? item.tags : []).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'));

    openObsidianDeckEditModal({
      app: plugin.app,
      title: '编辑专题',
      nameLabel: '名称',
      tagLabel: '标签',
      tagPlaceholder: '输入标签后按回车',
      tagHint: '可为专题设置一个标签，用于分组和筛选。',
      confirmText: '保存',
      cancelText: '取消',
      initialName: deck.name,
      initialTag: (deck.tags && deck.tags.length > 0) ? deck.tags[0] : '',
      availableTags,
      onSubmit: async ({ name, tag }) => {
        try {
          deck.name = name;
          deck.tags = tag ? [tag] : [];
          deck.updatedAt = new Date().toISOString();
          await storageService.saveDeck(deck);

          await recomputeAndBroadcastIRData(plugin.app, 'tag_group_changed');
          plugin.app.workspace.trigger('Weave:data-changed');
          new Notice('专题已更新');
        } catch (error) {
          logger.error('[IRDeckView] 编辑失败:', error);
          new Notice('编辑专题失败');
          throw error;
        }
      }
    });
  }

  // 处理开始阅读：统一跳转到现役侧边栏阅读流程
  async function handleStartReading(deckPath: string) {
    try {
      const redirectDeck = decks.find(d => d.id === deckPath || d.path === deckPath);
      const redirectDeckName = redirectDeck?.name || deckPath.split('/').pop() || '增量阅读';
      await plugin.redirectIncrementalReadingToSidebar({
        deckPath,
        deckName: redirectDeckName,
        closeLegacyFocusLeaves: true
      });
    } catch (error) {
      logger.error('[IRDeckView] 开始阅读失败:', error);
      new Notice('开始阅读失败');
    }
  }

  $effect(() => {
    const handleIRImport = () => {
      openImportModal();
    };
    
    document.addEventListener('ir-import-folder', handleIRImport);
    
    return () => {
      document.removeEventListener('ir-import-folder', handleIRImport);
    };
  });

  // 监听数据更新事件（学习结束、删除牌组等操作后刷新统计）
  $effect(() => {
    const handleDataUpdate = () => {
      getWorkspaceSnapshotService().invalidate();
      void loadDecks();
    };

    const handleTimerUpdate = () => {
      void loadDecks();
    };
    
    window.addEventListener('Weave:ir-data-updated', handleDataUpdate);
    window.addEventListener('Weave:ir-timer-updated', handleTimerUpdate);
    
    return () => {
      window.removeEventListener('Weave:ir-data-updated', handleDataUpdate);
      window.removeEventListener('Weave:ir-timer-updated', handleTimerUpdate);
    };
  });

  onMount(() => {
    void loadDecks();
  });

  onDestroy(() => {
    importModalInstance?.close();
    importModalInstance = null;
  });
</script>

<div class="ir-deck-view">
  <!-- 加载状态 -->
  {#if isLoading}
    <div class="ir-loading">
      <div class="ir-loading-spinner"></div>
      <span>正在加载...</span>
    </div>
  {:else if decks.length === 0}
    <!-- 空状态（简化版，与记忆牌组一致） -->
    <div class="mode-placeholder">
      <div class="placeholder-icon">--</div>
      <h2 class="placeholder-title">暂无增量阅读专题</h2>
      <p class="placeholder-desc">点击左上角菜单导入材料，或创建正文阅读点开始增量阅读</p>
    </div>
  {:else}
    <!-- 牌组网格（复用记忆牌组的卡片设计） -->
    <div class="cards-grid">
      {#each decks as irDeck, index (irDeck.id || irDeck.path || index)}
        {@const deckId = irDeck.id || irDeck.path || ''}
        {@const irStats = getStats(deckId)}
        {@const colorVariant = ((index % 4) + 1) as 1 | 2 | 3 | 4}
        
        <div class="deck-card-shell">
          {#if deckCardStyle === 'chinese-elegant'}
          <!-- 典雅风格卡片 -->
          <IRDeckCard
            deck={irDeck}
            stats={irStats}
            {colorVariant}
            onStudy={() => handleStartReading(deckId)}
            onMenu={(e) => showDeckMenu(e, irDeck)}
          />
        {:else}
          <!-- 默认风格卡片 -->
          {@const colorScheme = getColorSchemeForDeck(deckId)}
          <DeckGridCard
            deck={toMemoryDeck(irDeck)}
            stats={toMemoryStats(irStats)}
            {colorScheme}
            deckMode="incremental-reading"
            onStudy={() => handleStartReading(deckId)}
            onMenu={(e) => showDeckMenu(e, irDeck)}
          />
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- 负载预测模态窗 -->
{#if showLoadForecastModal}
  <IRLoadForecastModal
    bind:open={showLoadForecastModal}
    {plugin}
    initialDeckId={loadForecastDeckId}
    onClose={() => {
      showLoadForecastModal = false;
      loadForecastDeckId = undefined;
    }}
  />
{/if}

<style>
  .ir-deck-view {
    --weave-deck-card-min-width: 300px;
    --weave-deck-grid-gap: 16px;
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--weave-deck-page-content-gap, 1rem);
    overflow: auto;
    container-type: inline-size;
    container-name: ir-deck-grid;
  }

  /* 加载状态 */
  .ir-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    color: var(--text-muted);
    gap: 1rem;
  }

  .ir-loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* 空状态（与记忆牌组一致） */
  .mode-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    flex: 1;
    pointer-events: none;
  }

  .placeholder-icon {
    font-size: 4rem;
    margin-bottom: 1.5rem;
    opacity: 0.6;
  }

  .placeholder-title {
    margin: 0 0 0.75rem;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .placeholder-desc {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.95rem;
    max-width: 300px;
  }

  /* 牌组网格（与记忆牌组一致） */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--weave-deck-card-min-width)), 1fr));
    gap: var(--weave-deck-grid-gap);
    padding: 0.5rem 0;
    container-type: inline-size;
  }

  /* 响应式 */
  .deck-card-shell {
    min-width: 0;
    container-type: inline-size;
    container-name: deck-card;
  }

  @container ir-deck-grid (max-width: 1100px) {
    .ir-deck-view {
      --weave-deck-card-min-width: 280px;
      --weave-deck-grid-gap: 14px;
    }
  }

  @container ir-deck-grid (max-width: 760px) {
    .ir-deck-view {
      --weave-deck-card-min-width: 100%;
      --weave-deck-grid-gap: 12px;
    }

    .cards-grid {
      padding: 0.25rem 0;
    }

    .mode-placeholder {
      padding: 3rem 1rem;
    }
  }

  @container ir-deck-grid (max-width: 420px) {
    .ir-deck-view {
      --weave-deck-grid-gap: 8px;
    }

    .cards-grid {
      padding: 0.125rem 0;
    }
  }
</style>
