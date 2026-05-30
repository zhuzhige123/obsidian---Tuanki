<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Menu } from 'obsidian';
  import DeckGridCard from '../deck-views/DeckGridCard.svelte';
  import ChineseElegantDeckCard from '../deck-views/ChineseElegantDeckCard.svelte';
  import type { WeavePlugin } from '../../main';
  import { logger } from '../../utils/logger';
  import { loadRenderableDeckCards, type RenderableDeckCard, type WeaveDeckCodeBlockConfig } from '../../services/markdown/weaveDeckCodeBlock';
  import { buildMemoryDeckMenu, type MemoryDeckMenuAction } from '../../services/deck/MemoryDeckMenu';
  import type { DeckCardStyle } from '../../types/plugin-settings.d';
  import { get } from 'svelte/store';
  import { PremiumFeatureGuard, PREMIUM_FEATURES, type PremiumFeatureAccessContext } from '../../services/premium/PremiumFeatureGuard';

  interface Props {
    plugin: WeavePlugin;
    source: string;
    embedded?: boolean;
  }

  let { plugin, source, embedded = false }: Props = $props();

  let loading = $state(true);
  let error = $state('');
  let title = $state('');
  let renderableDecks = $state<RenderableDeckCard[]>([]);
  let deckCardStyle = $state<DeckCardStyle>(untrack(() => (plugin.settings.deckCardStyle as DeckCardStyle) || 'default'));
  let cardSize = $state<'small' | 'medium' | 'large'>('medium');
  const premiumGuard = PremiumFeatureGuard.getInstance();
  const deckStudyFeatureContext: PremiumFeatureAccessContext = { page: 'deck-study' };
  const deckAnalyticsEntryFeatures = [
    PREMIUM_FEATURES.DECK_ANALYTICS,
    PREMIUM_FEATURES.DECK_ANALYTICS_RETENTION,
    PREMIUM_FEATURES.DECK_ANALYTICS_TIMING,
  ] as const;
  let isPremium = $state(get(premiumGuard.isPremiumActive));
  let showPremiumFeaturesPreview = $state(get(premiumGuard.premiumFeaturesPreviewEnabled));

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

  onMount(() => {
    const handleDeckCardStyleChange = (event: Event) => {
      const style = (event as CustomEvent<DeckCardStyle>).detail;
      deckCardStyle = style || 'default';
    };

    window.addEventListener('Weave:deck-card-style-change', handleDeckCardStyleChange as EventListener);
    void load();

    return () => {
      window.removeEventListener('Weave:deck-card-style-change', handleDeckCardStyleChange as EventListener);
    };
  });

  async function load(): Promise<void> {
    loading = true;
    error = '';

    try {
      const result = await loadRenderableDeckCards(plugin, source);
      applyConfig(result.config);
      renderableDecks = result.decks;
    } catch (err) {
      logger.error('[WeaveDeckCodeBlock] 加载牌组代码块失败:', err);
      error = err instanceof Error ? err.message : '牌组代码块渲染失败';
      renderableDecks = [];
    } finally {
      loading = false;
    }
  }

  function applyConfig(config: WeaveDeckCodeBlockConfig): void {
    title = config.title || '';
    cardSize = config.size || 'medium';
    deckCardStyle = (plugin.settings.deckCardStyle as DeckCardStyle) || 'default';
  }

  async function handleStudy(deckId: string): Promise<void> {
    try {
      await plugin.openStudySession({ deckId });
    } catch (err) {
      logger.error('[WeaveDeckCodeBlock] 启动牌组学习失败:', err);
    }
  }

  async function dispatchDeckMenuAction(action: MemoryDeckMenuAction, deckId: string): Promise<void> {
    try {
      window.dispatchEvent(new CustomEvent('Weave:request-memory-deck-action', {
        detail: { action, deckId }
      }));
    } catch (err) {
      logger.error('[WeaveDeckCodeBlock] 转发牌组菜单操作失败:', err);
    }
  }

  function handleMenu(event: MouseEvent, item: RenderableDeckCard): void {
    const menu = new Menu();
    buildMemoryDeckMenu(
      menu,
      {
        advanceStudy: '提前学习',
        deckAnalytics: '牌组分析',
        editDeck: '编辑',
        deleteDeck: '删除',
        dissolveDeck: '解散牌组'
      },
      {
        onAdvanceStudy: async () => await dispatchDeckMenuAction('advance-study', item.deck.id),
        onOpenDeckAnalytics: async () => await dispatchDeckMenuAction('deck-analytics', item.deck.id),
        onEditDeck: async () => await dispatchDeckMenuAction('edit-deck', item.deck.id),
        onDeleteDeck: async () => await dispatchDeckMenuAction('delete-deck', item.deck.id),
        onDissolveDeck: async () => await dispatchDeckMenuAction('dissolve-deck', item.deck.id)
      },
      {
        showDeckAnalytics: premiumGuard.shouldShowAnyFeatureEntry(
          [...deckAnalyticsEntryFeatures],
          {
            isPremium,
            showPremiumPreview: showPremiumFeaturesPreview
          },
          deckStudyFeatureContext
        ),
        lockDeckAnalytics: !premiumGuard.canUseAnyFeature(
          [...deckAnalyticsEntryFeatures],
          deckStudyFeatureContext
        )
      }
    );

    menu.showAtMouseEvent(event);
  }
</script>

<div class:embedded class={`weave-decks-render size-${cardSize}`}>
  {#if title}
    <div class="weave-decks-title">{title}</div>
  {/if}

  {#if loading}
    <div class="weave-decks-state">正在加载牌组...</div>
  {:else if error}
    <div class="weave-decks-state is-error">{error}</div>
  {:else if renderableDecks.length === 0}
    <div class="weave-decks-state">没有找到可显示的牌组</div>
  {:else}
    <div class="cards-grid">
      {#each renderableDecks as item, index (item.deck.id)}
        {#if deckCardStyle === 'chinese-elegant'}
          <ChineseElegantDeckCard
            deck={item.deck}
            stats={item.stats}
            colorVariant={((index % 4) + 1) as 1 | 2 | 3 | 4}
            compact={cardSize === 'small'}
            onStudy={() => handleStudy(item.deck.id)}
            onMenu={(event) => handleMenu(event, item)}
          />
        {:else}
          <DeckGridCard
            deck={item.deck}
            stats={item.stats}
            colorScheme={item.colorScheme}
            onStudy={() => handleStudy(item.deck.id)}
            onMenu={(event) => handleMenu(event, item)}
          />
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .weave-decks-render {
    width: 100%;
    padding: 8px 0;
  }

  .weave-decks-render.embedded {
    padding: 0;
  }

  .weave-decks-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 14px;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 24px;
    padding: 8px 0;
  }

  .weave-decks-render.size-small .cards-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }

  .weave-decks-render.size-large .cards-grid {
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    gap: 28px;
  }

  .weave-decks-render.size-small :global(.deck-grid-card),
  .weave-decks-render.size-small :global(.chinese-elegant-card) {
    height: 160px;
  }

  .weave-decks-render.size-medium :global(.deck-grid-card),
  .weave-decks-render.size-medium :global(.chinese-elegant-card) {
    height: 220px;
  }

  .weave-decks-render.size-large :global(.deck-grid-card),
  .weave-decks-render.size-large :global(.chinese-elegant-card) {
    height: 280px;
  }

  .weave-decks-render.size-small :global(.deck-grid-card .deck-title) {
    font-size: 20px;
  }

  .weave-decks-render.size-large :global(.deck-grid-card .deck-title) {
    font-size: 30px;
  }

  .weave-decks-render.size-small :global(.deck-grid-card .card-info-bar) {
    height: 46px;
  }

  .weave-decks-render.size-large :global(.deck-grid-card .card-info-bar) {
    height: 60px;
  }

  .weave-decks-render.size-large :global(.deck-grid-card .deck-card-stat-num) {
    font-size: 18px;
  }

  .weave-decks-render.size-small :global(.chinese-elegant-card .card-content) {
    padding: 16px 20px;
  }

  .weave-decks-render.size-large :global(.chinese-elegant-card .card-content) {
    padding: 28px 30px;
  }

  .weave-decks-render.size-large :global(.chinese-elegant-card .card-title) {
    font-size: 30px;
  }

  .weave-decks-render.size-large :global(.chinese-elegant-card .stat-value) {
    font-size: 18px;
  }

  .weave-decks-state {
    padding: 20px 16px;
    border: 1px dashed var(--background-modifier-border);
    border-radius: 12px;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--background-secondary) 86%, transparent);
  }

  .weave-decks-state.is-error {
    color: var(--text-error);
    border-color: color-mix(in srgb, var(--text-error) 35%, transparent);
  }

  @media (max-width: 768px) {
    .cards-grid {
      grid-template-columns: 1fr;
      gap: 8px;
      padding: 4px 0;
    }
  }
</style>
