<script lang="ts">
  import { logger } from '../../utils/logger';
  import { vaultStorage } from '../../utils/vault-local-storage';

  import { Menu } from 'obsidian';
  import { get } from 'svelte/store';
  import type { Deck, DeckStats } from '../../data/types';
  import type { DeckTreeNode } from '../../services/deck/DeckHierarchyService';
  import type { StudySession } from '../../data/study-types';
  import type { WeavePlugin } from '../../main';
  import type { EmergentDeckCandidate, FormalDeckBindingSummary, MemoryDeckView } from '../../types/emergent-deck-types';
  import DeckGridCard from './DeckGridCard.svelte';
  import ChineseElegantDeckCard from './ChineseElegantDeckCard.svelte';
  import CategoryFilter, { type DeckFilter } from './CategoryFilter.svelte';
  import { getColorSchemeForDeck } from '../../config/card-color-schemes';
  import { MEMORY_DECK_UI_TEXT } from '../../constants/memory-deck-ui-text';
// 导入题库组件
  import QuestionBankListView from '../question-bank/QuestionBankListView.svelte';
  import QuestionBankGridView from '../question-bank/QuestionBankGridView.svelte';
  import { tr } from '../../utils/i18n';
// 牌组卡片设计类型
  import type { DeckCardStyle } from '../../types/plugin-settings.d';
  // 高级功能限制
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from '../../services/premium/PremiumFeatureGuard';
  import ActivationPrompt from '../premium/ActivationPrompt.svelte';
// 组件属性
  interface Props {
    deckTree: DeckTreeNode[];
    deckStats: Record<string, DeckStats>;
    studySessions: StudySession[];
    emergentCandidates?: EmergentDeckCandidate[];
    emergentDeckViews?: MemoryDeckView[];
    emergentDeckStats?: Record<string, DeckStats>;
    formalDeckBindingSummary?: Record<string, FormalDeckBindingSummary>;
    plugin: WeavePlugin;
    selectedFilter?: DeckFilter;
    onFilterSelect?: (filter: DeckFilter) => void;
    onStartStudy: (deckId: string) => void;
    onContinueStudy: () => void;
    // 菜单操作回调
    onAdvanceStudy?: (deckId: string) => Promise<void>;
    onOpenDeckAnalytics?: (deckId: string) => void;
    onOpenLoadForecast?: (deckId: string) => void;
    onEditDeck?: (deckId: string) => void;
    onDeleteDeck?: (deckId: string) => void;
    onRefreshData?: () => Promise<void>;
    onOpenKnowledgeGraph?: (deckId: string) => void;
    onAssociateQuestionBank?: (deckId: string) => void | Promise<void>;
    onDissolveDeck?: (deckId: string) => void;
    onPromoteEmergentDeck?: (candidate: EmergentDeckCandidate, event: MouseEvent) => void | Promise<void>;
    onStartEmergentStudy?: (deckId: string, deckName: string) => void | Promise<void>;
  }

  type GridActiveFilter = 'memory' | 'question-bank' | 'incremental-reading';

  function normalizeGridFilter(filter: DeckFilter | undefined): GridActiveFilter {
    if (filter === 'question-bank' || filter === 'incremental-reading') {
      return filter;
    }

    return 'memory';
  }

  let {
    deckTree,
    deckStats,
    studySessions,
    emergentCandidates = [],
    emergentDeckViews = [],
    emergentDeckStats = {},
    formalDeckBindingSummary = {},
    plugin,
// 筛选器状态（由父组件管理，支持双向绑定）
    selectedFilter: externalFilter = undefined,
    onFilterSelect: externalOnFilterSelect = undefined,
    onStartStudy,
    onContinueStudy,
    onAdvanceStudy,
    onOpenDeckAnalytics,
    onOpenLoadForecast,
    onEditDeck,
    onDeleteDeck,
    onRefreshData,
    onOpenKnowledgeGraph,
    onAssociateQuestionBank,
    onDissolveDeck,
    onPromoteEmergentDeck,
    onStartEmergentStudy
  }: Props = $props();

  let t = $derived($tr);

  // 高级功能守卫
  const premiumGuard = PremiumFeatureGuard.getInstance();
  let isPremium = $state(get(premiumGuard.isPremiumActive));
  let showPremiumFeaturesPreview = $state(get(premiumGuard.premiumFeaturesPreviewEnabled));
  let showActivationPrompt = $state(false);
  let promptFeatureId = $state('');

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

// 获取当前牌组卡片设计样式
  const deckCardStyle = $derived<DeckCardStyle>(
    (plugin.settings.deckCardStyle as DeckCardStyle) || 'default'
  );

  let internalFilter = $state<GridActiveFilter>((() => {
    try {
      return normalizeGridFilter(vaultStorage.getItem('weave-deck-mode-filter') as DeckFilter | undefined);
    } catch {}
    return 'memory';
  })());
  
  const currentFilter = $derived(normalizeGridFilter(externalFilter ?? internalFilter));

  function handleFilterSelect(filter: DeckFilter) {
    const normalizedFilter = normalizeGridFilter(filter);

    if (externalOnFilterSelect) {
      externalOnFilterSelect(filter);
    } else {
      internalFilter = normalizedFilter;
      vaultStorage.setItem('weave-deck-mode-filter', normalizedFilter);
    }
    logger.debug('[GridCardView] 切换模式筛选器:', normalizedFilter);
  }

  // 扁平化牌组树（保持层级结构）
  function flattenDeckTree(nodes: DeckTreeNode[]): Deck[] {
    const result: Deck[] = [];
    for (const node of nodes) {
      result.push(node.deck);
      if (node.children.length > 0) {
        result.push(...flattenDeckTree(node.children));
      }
    }
    return result;
  }

  const allDecks = $derived(flattenDeckTree(deckTree));

// 根据模式筛选牌组（与 DeckStudyPage 保持一致）
  const filteredDecks = $derived(currentFilter === 'memory' ? allDecks : []);

  // 显示牌组菜单（完整版，与DeckStudyPage保持一致）
  function showDeckMenu(event: MouseEvent, deckId: string) {
    const menu = new Menu();

    const deck = allDecks.find(d => d.id === deckId);
    const isSubdeck = deck?.parentId != null;

// 提前学习功能
    menu.addItem((item) =>
      item
        .setTitle(t('decks.menu.advanceStudy'))
        .setIcon("fast-forward")
        .onClick(async () => await onAdvanceStudy?.(deckId))
    );

    //  牌组分析（包含负荷预测）- 高级功能
    if (premiumGuard.shouldShowFeatureEntry(PREMIUM_FEATURES.DECK_ANALYTICS, {
      isPremium,
      showPremiumPreview: showPremiumFeaturesPreview
    })) {
      menu.addItem((item) => {
        const title = isPremium ? t('decks.menu.deckAnalytics') : t('decks.menu.deckAnalytics') + ' 🔒';
        item
          .setTitle(title)
          .setIcon("bar-chart-2")
          .onClick(() => {
            if (!isPremium) {
              promptFeatureId = PREMIUM_FEATURES.DECK_ANALYTICS;
              showActivationPrompt = true;
              return;
            }
            onOpenDeckAnalytics?.(deckId);
          });
      });
    }

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle(t('decks.menu.knowledgeGraph'))
        .setIcon("git-fork")
        .onClick(() => onOpenKnowledgeGraph?.(deckId))
    );

    if (onAssociateQuestionBank) {
      menu.addItem((item) =>
        item
          .setTitle(t('decks.menu.linkQuestionBank'))
          .setIcon('link-2')
          .onClick(async () => await onAssociateQuestionBank?.(deckId))
      );
    }

    // 创建子牌组和移动牌组功能已移除，不再支持父子牌组层级结构

    // 牌组编辑
    menu.addItem((item) =>
      item
        .setTitle(t('decks.menu.editDeck'))
        .setIcon("edit")
        .onClick(() => onEditDeck?.(deckId))
    );

    // 删除
    menu.addItem((item) =>
      item
        .setTitle(t('decks.menu.delete'))
        .setIcon("trash-2")
        .onClick(() => onDeleteDeck?.(deckId))
    );

// 解散牌组
    if (onDissolveDeck) {
      menu.addItem((item) =>
        item
          .setTitle(t('decks.menu.dissolveDeck'))
          .setIcon("unlink")
          .onClick(() => onDissolveDeck?.(deckId))
      );
    }

    menu.addSeparator();

    menu.showAtMouseEvent(event);
  }

  function createVirtualDeck(view: MemoryDeckView): Deck {
    return {
      id: view.id,
      name: view.name,
      description: '',
      category: '默认',
      path: view.name,
      level: 0,
      order: 0,
      inheritSettings: false,
      settings: {} as any,
      includeSubdecks: false,
      created: new Date(0).toISOString(),
      modified: new Date().toISOString(),
      stats: emergentDeckStats[view.id] || {
        totalCards: view.cardUUIDs.length,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        todayNew: 0,
        todayReview: 0,
        todayTime: 0,
        totalReviews: 0,
        totalTime: 0,
        memoryRate: 0,
        averageEase: 0,
        forecastDays: {}
      },
      tags: [],
      metadata: {}
    };
  }

  function showEmergentDeckMenu(event: MouseEvent, view: MemoryDeckView) {
    const menu = new Menu();
    const candidate = emergentCandidates.find(item => item.id === view.id);
    if (candidate && onPromoteEmergentDeck) {
      menu.addItem((item) =>
        item
          .setTitle('转为正式牌组')
          .setIcon('folder-plus')
          .onClick(async () => await onPromoteEmergentDeck(candidate, event))
      );
    }
    menu.showAtMouseEvent(event);
  }

</script>

<div class="grid-card-view">
  <!-- 桌面端彩色圆点筛选器已移除，现在由 WeaveApp 中的 SidebarNavHeader 统一处理 -->
  <!-- 侧边栏和主内容区都使用 SidebarNavHeader 提供的筛选功能 -->

<!-- 根据模式显示不同内容 -->
  {#if currentFilter === 'memory'}
    <!-- 记忆牌组模式 -->
    {#if filteredDecks.length > 0}
      <div class="cards-grid">
        {#each filteredDecks as deck, index (deck.id)}
          {@const stats = deckStats[deck.id] || {
            newCards: 0,
            learningCards: 0,
            reviewCards: 0,
            memoryRate: 0,
            totalCards: 0,
            todayNew: 0,
            todayReview: 0,
            todayTime: 0,
            totalReviews: 0,
            totalTime: 0,
            averageEase: 0,
            forecastDays: {}
          }}
          {@const colorScheme = getColorSchemeForDeck(deck.id)}
          {@const colorVariant = ((index % 4) + 1) as 1 | 2 | 3 | 4}
          {@const bindingSummary = formalDeckBindingSummary[deck.id]}
          {@const formalStatusBadge = bindingSummary ? `${MEMORY_DECK_UI_TEXT.autoTopicPrefix} ${bindingSummary.bindingCount}` : undefined}
          <div class="deck-card-shell">
            {#if deckCardStyle === 'chinese-elegant'}
              <ChineseElegantDeckCard
                {deck}
                {stats}
                {colorVariant}
                statusBadge={formalStatusBadge}
                statusKind="formal"
                onStudy={() => onStartStudy(deck.id)}
                onMenu={(e) => showDeckMenu(e, deck.id)}
              />
            {:else}
              <DeckGridCard
                {deck}
                {stats}
                {colorScheme}
                statusBadge={formalStatusBadge}
                statusKind="formal"
                onStudy={() => onStartStudy(deck.id)}
                onMenu={(e) => showDeckMenu(e, deck.id)}
              />
            {/if}
          </div>
        {/each}
      </div>
      {#if emergentDeckViews.length > 0}
        <div class="emergent-section">
          <div class="emergent-grid">
            {#each emergentDeckViews as view (view.id)}
              {@const deck = createVirtualDeck(view)}
              {@const stats = emergentDeckStats[view.id] || deck.stats}
              {@const colorScheme = getColorSchemeForDeck(view.id)}
              {@const colorVariant = (((view.name.length || 1) % 4) + 1) as 1 | 2 | 3 | 4}
              <div class="deck-card-shell">
                {#if deckCardStyle === 'chinese-elegant'}
                  <ChineseElegantDeckCard
                    {deck}
                    {stats}
                    {colorVariant}
                    statusBadge={view.statusBadge}
                    statusKind="emergent"
                    onStudy={() => onStartEmergentStudy?.(view.id, view.name)}
                    onMenu={(e) => showEmergentDeckMenu(e, view)}
                  />
                {:else}
                  <DeckGridCard
                    {deck}
                    {stats}
                    {colorScheme}
                    statusBadge={view.statusBadge}
                    statusKind="emergent"
                    onStudy={() => onStartEmergentStudy?.(view.id, view.name)}
                    onMenu={(e) => showEmergentDeckMenu(e, view)}
                  />
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <!-- 空状态占位符 -->
      <div class="mode-placeholder">
        <div class="placeholder-icon">--</div>
        <h2 class="placeholder-title">{t('decks.grid.emptyText')}</h2>
        <p class="placeholder-desc">{t('decks.grid.emptyHint')}</p>
      </div>
    {/if}
  {:else if currentFilter === 'question-bank'}
    <!-- 题库牌组模式 - 网格视图 -->
    <QuestionBankGridView {plugin} />
  {/if}
</div>

<!--  激活提示模态窗 -->
{#if showActivationPrompt}
  <ActivationPrompt
    visible={showActivationPrompt}
    featureId={promptFeatureId}
    onClose={() => showActivationPrompt = false}
  />
{/if}

<style>
  .grid-card-view {
    --weave-deck-card-min-width: 320px;
    --weave-deck-grid-gap: 20px;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: var(--weave-deck-page-content-gap, 1rem);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    background: var(--weave-deck-page-bg, var(--weave-surface-background, var(--background-primary)));
    container-type: inline-size;
    container-name: deck-grid;
    scroll-padding-bottom: 24px;
  }

  /* 桌面端彩色圆点筛选器已移除，现在由 WeaveApp 中的 SidebarNavHeader 统一处理 */

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--weave-deck-card-min-width)), 1fr));
    gap: var(--weave-deck-grid-gap);
    padding: 8px 0;
    container-type: inline-size;
  }

  .deck-card-shell {
    min-width: 0;
    container-type: inline-size;
    container-name: deck-card;
  }

  .emergent-section {
    margin-top: 28px;
    padding-top: 24px;
    border-top: 1px solid var(--background-modifier-border);
    box-shadow: none;
  }

  .emergent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--weave-deck-card-min-width)), 1fr));
    gap: var(--weave-deck-grid-gap);
  }

/* 妯″紡鍗犱綅绗︽牱寮?*/
  .mode-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    padding: 3rem 2rem;
    text-align: center;
  }

  .placeholder-icon {
    font-size: 4rem;
    margin-bottom: 1.5rem;
    opacity: 0.6;
  }

  .placeholder-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.5rem;
  }

  .placeholder-desc {
    font-size: 1rem;
    color: var(--text-muted);
    max-width: 500px;
  }

  /* 鍝嶅簲寮?*/
  @container deck-grid (max-width: 1100px) {
    .grid-card-view {
      --weave-deck-card-min-width: 280px;
      --weave-deck-grid-gap: 18px;
    }
  }

  @container deck-grid (max-width: 760px) {
    .grid-card-view {
      --weave-deck-card-min-width: 100%;
      --weave-deck-grid-gap: 12px;
      padding-left: max(6px, calc(var(--weave-deck-page-content-gap, 1rem) * 0.5));
      padding-right: max(6px, calc(var(--weave-deck-page-content-gap, 1rem) * 0.5));
    }

    .cards-grid {
      padding: 4px 0;
    }

    .mode-placeholder {
      min-height: 300px;
      padding: 2rem 1rem;
    }

    .placeholder-icon {
      font-size: 3rem;
    }

    .placeholder-title {
      font-size: 1.25rem;
    }
  }

  @container deck-grid (max-width: 420px) {
    .grid-card-view {
      --weave-deck-grid-gap: 8px;
      padding-left: 4px;
      padding-right: 4px;
    }

    .cards-grid {
      padding: 2px 0;
    }
  }

  /* Obsidian 移动端特定样式：内容区域贴边 */
  :global(body.is-mobile) .grid-card-view {
    padding: 8px 2px calc(88px + env(safe-area-inset-bottom, 0px)); /* 为底部手势区/浏览器栏预留空间 */
    scroll-padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  }

  :global(body.is-mobile) .cards-grid {
    gap: 8px; /* 🔧 减少卡片之间的间距 */
    padding: 4px 0;
  }

  :global(body.is-phone) .grid-card-view {
    padding: 4px 1px calc(96px + env(safe-area-inset-bottom, 0px)); /* 手机端增加底部滚动缓冲，避免最后一张卡被遮住 */
    scroll-padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  }

  :global(body.is-phone) .cards-grid {
    gap: 6px; /* 🔧 手机端进一步减少卡片间距 */
  }

  :global(body.is-mobile) .grid-card-view {
    padding-left: var(--weave-deck-page-content-gap, 1rem);
    padding-right: var(--weave-deck-page-content-gap, 1rem);
    padding-bottom: calc(128px + env(safe-area-inset-bottom, 0px));
    scroll-padding-bottom: calc(128px + env(safe-area-inset-bottom, 0px));
  }

  :global(body.is-phone) .grid-card-view {
    padding-left: var(--weave-deck-page-content-gap, 1rem);
    padding-right: var(--weave-deck-page-content-gap, 1rem);
    padding-bottom: calc(144px + env(safe-area-inset-bottom, 0px));
    scroll-padding-bottom: calc(144px + env(safe-area-inset-bottom, 0px));
  }
</style>
