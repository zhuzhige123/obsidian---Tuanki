<script lang="ts">
  /**
   * 典雅风格牌组卡片组件
   * 
   * 基于 chinese-style-card-prototype-v2.html 原型设计
   * 特点：
   * - 深色系渐变背景
   * - 微妙光效层
   * - 左对齐布局
   * - 精致的统计信息展示
   */
  import type { Deck, DeckStats } from '../../data/types';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { tr } from '../../utils/i18n';

  interface Props {
    deck: Deck;
    stats: DeckStats;
    colorVariant?: 1 | 2 | 3 | 4;
    compact?: boolean;
    deckMode?: 'memory' | 'question-bank' | 'incremental-reading';
    statusBadge?: string;
    statusKind?: 'formal' | 'emergent';
    onStudy: () => void;
    onMenu: (event: MouseEvent) => void;
  }

  let {
    deck,
    stats,
    colorVariant = 1,
    compact = false,
    deckMode = 'memory',
    statusBadge,
    statusKind = 'formal',
    onStudy,
    onMenu
  }: Props = $props();
  
  let t = $derived($tr);

  const statLabels = $derived.by(() => {
    switch (deckMode) {
      case 'incremental-reading':
        return { first: t('decks.card.irUnread'), second: t('decks.card.irPending'), third: t('decks.card.irQuestions') };
      case 'question-bank':
        return { first: t('decks.questionBank.total'), second: t('decks.questionBank.completed'), third: t('decks.questionBank.errors') };
      default:
        return { first: t('decks.card.newFull'), second: t('decks.card.learningFull'), third: t('decks.card.reviewFull') };
    }
  });

  // 根据牌组ID生成稳定的颜色变体
  const stableColorVariant = $derived(() => {
    if (colorVariant) return colorVariant;
    // 使用牌组ID的哈希值来确定颜色
    let hash = 0;
    for (let i = 0; i < deck.id.length; i++) {
      hash = ((hash << 5) - hash) + deck.id.charCodeAt(i);
      hash = hash & hash;
    }
    return ((Math.abs(hash) % 4) + 1) as 1 | 2 | 3 | 4;
  });

  // 处理点击事件
  function handleClick() {
    onStudy();
  }

  // 处理右键菜单
  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    onMenu(event);
  }

  // 处理菜单按钮点击
  function handleMenuClick(event: MouseEvent) {
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
  class="chinese-elegant-card variant-{stableColorVariant()}"
  class:compact
  onclick={(event) => {
    if (event.defaultPrevented) return;
    handleClick();
  }}
  onkeydown={handleKeyDown}
  oncontextmenu={handleContextMenu}
  role="button"
  tabindex="0"
  aria-label={t('decks.card.ariaLabel').replace('{name}', deck.name)}
>
  <!-- 宣纸纹理层 -->
  <div class="texture-overlay"></div>
  
  <!-- 微光效果层 -->
  <div class="light-effect"></div>

  {#if statusBadge}
    <div class="status-badge status-badge--{statusKind}">
      {statusBadge}
    </div>
  {/if}
  
  <!-- 右上角菜单按钮 -->
  <button 
    class="menu-btn"
    onclick={handleMenuClick}
    aria-label={t('decks.card.moreActions')}
    title={t('decks.card.moreActions')}
  >
    <EnhancedIcon name="more-horizontal" size={16} />
  </button>
  
  <!-- 内容区域 -->
  <div class="card-content">
    <!-- 牌组标题 - 左上角 -->
    <div class="card-title">
      {deck.name}
    </div>

    <!-- 底部统计信息栏 - 左下角 -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-label">{statLabels.first}</span>
        <span class="stat-value">{stats.newCards}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">{statLabels.second}</span>
        <span class="stat-value">{stats.learningCards}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">{statLabels.third}</span>
        <span class="stat-value">{stats.reviewCards}</span>
      </div>
    </div>
  </div>
</div>

<style>
  /* ============================================
   * 中式典雅牌组卡片样式
   * 基于 chinese-style-card-prototype-v2.html
   * ============================================ */

  .chinese-elegant-card {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 220px;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    touch-action: manipulation;
  }

  .chinese-elegant-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }

  .chinese-elegant-card:active {
    transform: translateY(-2px);
  }

  /* 深色系渐变变体 - 匹配原型设计 */
  .variant-1 {
    background: linear-gradient(135deg, #2d3654 0%, #1e2438 100%);
  }

  .variant-2 {
    background: linear-gradient(145deg, #3d4560 0%, #2a3248 100%);
  }

  .variant-3 {
    background: linear-gradient(135deg, #1a4a42 0%, #0c2e28 100%);
  }

  .variant-4 {
    background: linear-gradient(135deg, #1e3048 0%, #0f1e30 100%);
  }

  /* 微妙纹理层 */
  .texture-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
    opacity: 1;
    pointer-events: none;
    z-index: 1;
    mix-blend-mode: overlay;
  }

  /* 微光效果层 */
  .light-effect {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(180deg, 
      rgba(255, 255, 255, 0.08) 0%, 
      rgba(255, 255, 255, 0) 100%);
    pointer-events: none;
    z-index: 1;
  }

  /* 右上角菜单按钮 */
  .menu-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.2);
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: all 0.2s;
    opacity: 0;
    touch-action: manipulation;
  }

  .status-badge {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 10;
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
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.92);
  }

  .status-badge--emergent {
    background: rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .chinese-elegant-card:hover .menu-btn {
    opacity: 1;
  }

  .menu-btn:hover {
    background: rgba(0, 0, 0, 0.35);
    color: rgba(255, 255, 255, 1);
    transform: scale(1.05);
  }

  .menu-btn:active {
    transform: scale(0.95);
  }

  /* 内容区域 */
  .card-content {
    position: relative;
    z-index: 3;
    padding: 20px 24px;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* 牌组标题 - 左上角对齐 */
  .card-title {
    font-family: var(--font-interface), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 24px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    letter-spacing: 0.5px;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    line-height: 1.35;
    word-break: break-word;
    text-align: left;
    /* 限制最多2行 */
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* 底部统计信息栏 - 左下角对齐 */
  .stats-bar {
    display: flex;
    gap: 20px;
    row-gap: 8px;
    flex-wrap: wrap;
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }

  .stat-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 400;
  }

  .stat-value {
    font-weight: 600;
    font-family: var(--font-interface), -apple-system, sans-serif;
    font-size: 16px;
    color: rgba(255, 255, 255, 0.95);
  }

  /* 紧凑模式（侧边栏） */
  .chinese-elegant-card.compact {
    height: 160px;
  }

  .compact .card-title {
    font-size: 20px;
  }

  .compact .card-content {
    padding: 16px 20px;
  }

  .compact .stats-bar {
    gap: 16px;
  }

  .compact .stat-label {
    font-size: 11px;
  }

  .compact .stat-value {
    font-size: 14px;
  }

  /* 移动端适配 */
  @media (max-width: 768px) {
    .chinese-elegant-card {
      height: 200px;
    }

    .card-title {
      font-size: 22px;
    }

    .card-content {
      padding: 20px 24px;
    }

    .stats-bar {
      gap: 18px;
    }

    .stat-label {
      font-size: 12px;
    }

    .stat-value {
      font-size: 15px;
    }

    .menu-btn {
      opacity: 1;
    }
  }

  /* 大屏幕优化 */
  @media (min-width: 1400px) {
    .chinese-elegant-card {
      height: 240px;
    }

    .card-title {
      font-size: 26px;
    }

    .card-content {
      padding: 24px 28px;
    }

    .stat-value {
      font-size: 18px;
    }
  }

  @container deck-card (max-width: 360px) {
    .chinese-elegant-card {
      height: 180px;
      border-radius: 14px;
    }

    .card-content {
      padding: 18px 18px;
    }

    .card-title {
      font-size: 21px;
    }

    .stats-bar {
      gap: 12px 16px;
    }

    .stat-label {
      font-size: 11px;
    }

    .stat-value {
      font-size: 14px;
    }

    .menu-btn {
      opacity: 1;
    }
  }

  @container deck-card (max-width: 280px) {
    .chinese-elegant-card {
      height: 162px;
      border-radius: 12px;
    }

    .card-content {
      padding: 14px 14px;
    }

    .card-title {
      font-size: 18px;
    }

    .stats-bar {
      gap: 10px 12px;
    }

    .stat-label {
      font-size: 10px;
    }

    .stat-value {
      font-size: 13px;
    }

    .menu-btn {
      top: 8px;
      right: 8px;
      width: 28px;
      height: 28px;
    }
  }
</style>
