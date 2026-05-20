<script lang="ts">
  import type { Deck, DeckStats } from '../../data/types';
  import type { ColorScheme, CardState } from '../../config/card-color-schemes';
  import type { MemoryDeckLevelProgress } from '../../services/deck/MemoryDeckLevelService';
  import { getCardState } from '../../config/card-color-schemes';
  import DeckLevelBadge from '../ui/DeckLevelBadge.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  //  导入国际化
  import { tr } from '../../utils/i18n';

  interface Props {
    deck: Deck;
    stats: DeckStats;
    colorScheme: ColorScheme;
    levelProgress?: MemoryDeckLevelProgress;
    deckMode?: 'memory' | 'question-bank' | 'incremental-reading';
    statusBadge?: string;
    statusKind?: 'formal' | 'emergent';
    onStudy: () => void;
    onMenu: (event: MouseEvent) => void;
  }

  let { deck, stats, colorScheme, levelProgress, deckMode = 'memory', statusBadge, statusKind = 'formal', onStudy, onMenu }: Props = $props();
  
  //  响应式翻译函数
  let t = $derived($tr);

  // 根据牌组模式返回不同的统计标签
  const statLabels = $derived.by(() => {
    switch (deckMode) {
      case 'incremental-reading':
        return { first: t('decks.card.irUnread'), second: t('decks.card.irPending'), third: t('decks.card.irQuestions') };
      case 'question-bank':
        return { first: t('decks.questionBank.total'), second: t('decks.questionBank.completed'), third: t('decks.questionBank.errors') };
      default:
        return { first: t('decks.card.new'), second: t('decks.card.learning'), third: t('decks.card.review') };
    }
  });

  // 计算卡片状态
  const cardState = $derived<CardState>(
    getCardState(stats.newCards, stats.learningCards, stats.reviewCards)
  );

  // 获取当前状态的配色
  const currentColorConfig = $derived(colorScheme[cardState]);

  // 生成卡片主区域样式
  const mainStyle = $derived(() => {
    return `background: ${currentColorConfig.gradient}; color: ${currentColorConfig.textColor};`;
  });

  // 生成信息条样式
  const infoBarStyle = $derived(() => {
    return `background: ${colorScheme.infoBar.background}; color: ${colorScheme.infoBar.textColor};`;
  });

  let pendingStudyPointerId = $state<number | null>(null);

  // 处理点击事件
  function handleClick() {
    onStudy();
  }

  function resetStudyPointerIntent() {
    pendingStudyPointerId = null;
  }

  function isMenuButtonTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('.menu-btn') !== null;
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.button !== 0 || isMenuButtonTarget(event.target)) {
      resetStudyPointerIntent();
      return;
    }

    pendingStudyPointerId = event.pointerId;
  }

  function handlePointerUp(event: PointerEvent) {
    if (pendingStudyPointerId !== event.pointerId || isMenuButtonTarget(event.target)) {
      resetStudyPointerIntent();
      return;
    }

    resetStudyPointerIntent();
    handleClick();
  }

  // 处理右键菜单
  function handleContextMenu(event: MouseEvent) {
    resetStudyPointerIntent();
    event.preventDefault();
    onMenu(event);
  }

  // 处理菜单按钮点击
  function handleMenuPointerDown(event: PointerEvent) {
    resetStudyPointerIntent();
    event.stopPropagation();
  }

  function handleMenuClick(event: MouseEvent) {
    resetStudyPointerIntent();
    event.preventDefault();
    event.stopPropagation();
    onMenu(event);
  }

  // 处理键盘事件
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }
</script>

<div 
  class="deck-grid-card"
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerUp}
  onpointercancel={resetStudyPointerIntent}
  onkeydown={handleKeyDown}
  oncontextmenu={handleContextMenu}
  role="button"
  tabindex="0"
  aria-label={t('decks.card.ariaLabel').replace('{name}', deck.name)}
>
  <!-- 上方主区域：牌组名 -->
  <div class="card-main" style={mainStyle()}>
    <!-- 微妙的光效层 -->
    <div class="light-effect"></div>

    <div class="card-top-row">
      <div class="card-top-left">
        {#if statusBadge}
          <div class="status-badge status-badge--{statusKind}">
            {statusBadge}
          </div>
        {/if}

        {#if deckMode === 'memory' && levelProgress}
          <div class="level-badge-wrap">
            <DeckLevelBadge progress={levelProgress} />
          </div>
        {/if}
      </div>
      
      <!-- 右上角菜单按钮 -->
      <button 
        class="menu-btn"
        onpointerdown={handleMenuPointerDown}
        onclick={handleMenuClick}
        aria-label={t('decks.card.moreActions')}
        title={t('decks.card.moreActions')}
      >
        <EnhancedIcon name="more-horizontal" size={16} />
      </button>
    </div>
    
    <div class="deck-title">
      {deck.name}
    </div>
  </div>

  <!-- 下方信息条 -->
  <div class="card-info-bar" style={infoBarStyle()}>
    <!-- 中间：统计数字 -->
    <!-- 类名使用 deck-card-stat-* 前缀，避免被全局 .stat-number / .stat-label（如 APKG 样式）污染 -->
    <div class="deck-card-stats">
      <div class="deck-card-stat">
        <span class="deck-card-stat-num">{stats.newCards}</span>
        <span class="deck-card-stat-lbl">{statLabels.first}</span>
      </div>
      <div class="deck-card-stat">
        <span class="deck-card-stat-num">{stats.learningCards}</span>
        <span class="deck-card-stat-lbl">{statLabels.second}</span>
      </div>
      <div class="deck-card-stat">
        <span class="deck-card-stat-num">{stats.reviewCards}</span>
        <span class="deck-card-stat-lbl">{statLabels.third}</span>
      </div>
    </div>

  </div>
</div>

<style>
  .deck-grid-card {
    width: 100%;
    min-width: 0;
    height: 220px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    touch-action: manipulation;
  }

  .deck-grid-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    filter: brightness(1.05);
  }

  .deck-grid-card:active {
    transform: translateY(-2px);
  }

  /* 上方主区域：牌组名 */
  .card-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 30px 20px;
    position: relative;
    overflow: hidden;
  }

  /* 微妙的光效层 */
  .light-effect {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(
      circle at 30% 20%,
      rgba(255, 255, 255, 0.08) 0%,
      transparent 60%
    );
    pointer-events: none;
  }

  /* 右上角菜单按钮 */
  .menu-btn {
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.15);
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: all 0.2s;
    opacity: 0;
    touch-action: manipulation;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    backdrop-filter: blur(8px);
  }

  .status-badge--formal {
    background: rgba(15, 23, 42, 0.18);
    color: rgba(255, 255, 255, 0.92);
  }

  .status-badge--emergent {
    background: rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.22);
  }

  .deck-grid-card:hover .menu-btn {
    opacity: 1;
  }

  .menu-btn:hover {
    background: rgba(0, 0, 0, 0.25);
    color: rgba(255, 255, 255, 1);
    transform: scale(1.05);
  }

  .menu-btn:active {
    transform: scale(0.95);
  }

  .level-badge-wrap {
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .card-top-row {
    position: absolute;
    top: 12px;
    left: 12px;
    right: 12px;
    z-index: 10;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .card-top-left {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* 移动端始终显示菜单按钮 */
  @media (max-width: 768px) {
    .menu-btn {
      opacity: 1;
    }
  }

  .deck-title {
    font-family: var(--font-text, 'Playfair Display'), 'Noto Serif SC', serif;
    font-size: 24px;
    font-weight: 700;
    text-align: center;
    line-height: 1.3;
    position: relative;
    z-index: 1;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    word-break: break-word;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* 下方信息条 */
  .card-info-bar {
    min-height: 52px;
    height: auto;
    box-sizing: border-box;
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-interface), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
  }

  .deck-card-stats {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 14px;
    flex-wrap: nowrap;
    flex: 1;
    min-width: 0;
  }

  .deck-card-stat {
    display: inline-flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: baseline;
    gap: 0.15em;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .deck-card-stat-num {
    font-weight: 600;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    font-family: var(--font-interface), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .deck-card-stat-lbl {
    font-size: 12px;
    opacity: 0.9;
    font-family: var(--font-interface), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .deck-grid-card {
      height: 200px;
    }

    .deck-title {
      font-size: 20px;
    }

    .card-info-bar {
      min-height: 48px;
      padding: 8px 16px;
      font-size: 12px;
    }

    .deck-card-stat-num {
      font-size: 14px;
    }

    .deck-card-stats {
      gap: 10px;
    }
  }

  /* ==================== Obsidian 移动端适配 ==================== */
  
  /* 手机端：全宽单列布局 */
  :global(body.is-phone) .deck-grid-card {
    width: 100%;
    margin: 0;
    height: 180px;
  }

  :global(body.is-phone) .card-main {
    padding: 20px 16px;
  }

  :global(body.is-phone) .deck-title {
    font-size: 20px;
  }

  :global(body.is-phone) .card-info-bar {
    min-height: var(--weave-mobile-touch-min, 44px);
    padding: 8px 12px;
  }

  :global(body.is-phone) .deck-card-stat-num {
    font-size: 14px;
  }

  :global(body.is-phone) .deck-card-stat-lbl {
    font-size: 11px;
  }

  :global(body.is-phone) .deck-card-stats {
    gap: 8px;
  }

  :global(body.is-phone) .level-badge-wrap {
    transform: scale(0.92);
    transform-origin: top left;
  }

  /* 手机端：始终显示菜单按钮 */
  :global(body.is-phone) .menu-btn {
    opacity: 1;
  }

  /* 平板端：适中尺寸 */
  :global(body.is-tablet) .deck-grid-card {
    height: 200px;
  }

  @container deck-card (max-width: 360px) {
    .deck-grid-card {
      height: 188px;
      border-radius: 10px;
    }

    .card-main {
      padding: 22px 16px;
    }

    .deck-title {
      font-size: 20px;
    }

    .card-info-bar {
      min-height: 46px;
      padding: 8px 14px;
    }

    .deck-card-stats {
      gap: 10px 12px;
    }

    .deck-card-stat-num {
      font-size: 14px;
    }

    .deck-card-stat-lbl {
      font-size: 11px;
    }

    .menu-btn {
      opacity: 1;
    }

    .level-badge-wrap {
      transform: scale(0.92);
      transform-origin: top left;
    }
  }

  @container deck-card (max-width: 280px) {
    .deck-grid-card {
      height: 170px;
      border-radius: 10px;
    }

    .card-main {
      padding: 16px 12px;
    }

    .deck-title {
      font-size: 18px;
    }

    .card-info-bar {
      min-height: 42px;
      padding: 6px 10px;
    }

    .deck-card-stats {
      gap: 6px 10px;
    }

    .deck-card-stat-num {
      font-size: 13px;
    }

    .deck-card-stat-lbl {
      font-size: 10px;
    }

    .menu-btn {
      top: 8px;
      right: 8px;
      width: 28px;
      height: 28px;
    }

    .level-badge-wrap {
      transform: scale(0.88);
      transform-origin: top left;
    }
  }
</style>
