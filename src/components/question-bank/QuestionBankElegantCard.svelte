<script lang="ts">
  /**
   * 典雅风格题库卡片组件
   * 
   * 基于 ChineseElegantDeckCard 设计
   * 适配题库的统计数据结构
   */
  import type { Deck } from '../../data/types';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { tr } from '../../utils/i18n';
  import { formatQuestionBankAccuracyScore } from '../../utils/question-bank/question-bank-display-stats';

  interface QuestionBankStats {
    total: number;      // 总题数
    completed: number;  // 已练题数
    accuracy: number;   // 正确率 (0-100)
    errorCount: number; // 错题数
  }

  interface Props {
    bank: Deck;
    stats: QuestionBankStats;
    colorVariant?: 1 | 2 | 3 | 4;
    compact?: boolean;
    onTest: () => void;
    onMenu: (event: MouseEvent) => void;
  }

  let {
    bank,
    stats,
    colorVariant = 1,
    compact = false,
    onTest,
    onMenu
  }: Props = $props();

  let t = $derived($tr);

  // 根据题库ID生成稳定的颜色变体
  const stableColorVariant = $derived(() => {
    if (colorVariant) return colorVariant;
    let hash = 0;
    for (let i = 0; i < bank.id.length; i++) {
      hash = ((hash << 5) - hash) + bank.id.charCodeAt(i);
      hash = hash & hash;
    }
    return ((Math.abs(hash) % 4) + 1) as 1 | 2 | 3 | 4;
  });

  // 处理点击事件
  function handleClick() {
    if (stats.total > 0) {
      onTest();
    }
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
    if ((event.key === 'Enter' || event.key === ' ') && stats.total > 0) {
      event.preventDefault();
      handleClick();
    }
  }
</script>

<div 
  class="question-bank-elegant-card variant-{stableColorVariant()}"
  class:compact
  class:empty={stats.total === 0}
  onclick={(event) => {
    if (event.defaultPrevented) return;
    handleClick();
  }}
  onkeydown={handleKeyDown}
  oncontextmenu={handleContextMenu}
  role="button"
  tabindex="0"
  aria-label={t('study.questionBankUI.bankCollection.ariaLabel', {
    name: bank.name,
    total: stats.total,
    completed: stats.completed,
    accuracy: formatQuestionBankAccuracyScore(stats.accuracy)
  })}
>
  <!-- 纹理层 -->
  <div class="texture-overlay"></div>
  
  <!-- 微光效果层 -->
  <div class="light-effect"></div>
  
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
    <!-- 题库标题 - 左上角 -->
    <div class="card-title">
      {bank.name}
      {#if stats.total === 0}
        <span class="empty-tag">{t('decks.questionBank.empty')}</span>
      {/if}
    </div>

    <!-- 底部统计信息栏（qb-eleg-*：避免全局 stat-* 类名污染） -->
    <div class="qb-eleg-stats-bar">
      {#if stats.completed > 0}
        <div class="qb-eleg-accuracy-badge">{formatQuestionBankAccuracyScore(stats.accuracy)}</div>
      {/if}
      <div class="qb-eleg-stat">
        <span class="qb-eleg-stat-num">{stats.total}</span>
        <span class="qb-eleg-stat-lbl">{t('decks.questionBank.total')}</span>
      </div>
      <div class="qb-eleg-stat">
        <span class="qb-eleg-stat-num">{stats.completed}</span>
        <span class="qb-eleg-stat-lbl">{t('decks.questionBank.completed')}</span>
      </div>
      <div class="qb-eleg-stat">
        <span class="qb-eleg-stat-num">{stats.errorCount}</span>
        <span class="qb-eleg-stat-lbl">{t('decks.questionBank.errors')}</span>
      </div>
    </div>
  </div>
</div>

<style>
  /* ============================================
   * 典雅风格题库卡片样式
   * ============================================ */

  .question-bank-elegant-card {
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

  .question-bank-elegant-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }

  .question-bank-elegant-card:active {
    transform: translateY(-2px);
  }

  .question-bank-elegant-card.empty {
    opacity: 0.6;
    cursor: default;
  }

  .question-bank-elegant-card.empty:hover {
    transform: none;
  }

  /* 深色系渐变变体 */
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

  /* 纹理层 */
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

  .question-bank-elegant-card:hover .menu-btn {
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

  /* 标题 */
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
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .empty-tag {
    display: inline-block;
    font-size: 12px;
    padding: 2px 8px;
    margin-left: 8px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    vertical-align: middle;
  }

  /* 统计信息栏 */
  .qb-eleg-stats-bar {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-wrap: nowrap;
    gap: 18px;
    row-gap: 6px;
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
    font-family: var(--font-interface), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-width: 0;
  }

  .qb-eleg-accuracy-badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    background: rgba(0, 0, 0, 0.22);
    color: rgba(255, 255, 255, 0.95);
    white-space: nowrap;
    flex-shrink: 0;
    backdrop-filter: blur(6px);
  }

  .qb-eleg-stat {
    display: inline-flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: baseline;
    gap: 0.2em;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .qb-eleg-stat-lbl {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
    font-weight: 400;
    white-space: nowrap;
  }

  .qb-eleg-stat-num {
    font-weight: 600;
    font-family: var(--font-interface), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.95);
  }

  /* 紧凑模式（侧边栏） */
  .question-bank-elegant-card.compact {
    height: 160px;
  }

  .compact .card-title {
    font-size: 20px;
  }

  .compact .card-content {
    padding: 16px 20px;
  }

  .compact .qb-eleg-stats-bar {
    gap: 14px;
  }

  .compact .qb-eleg-stat-lbl {
    font-size: 11px;
  }

  .compact .qb-eleg-stat-num {
    font-size: 14px;
  }

  /* 移动端适配 */
  @media (max-width: 768px) {
    .question-bank-elegant-card {
      height: 200px;
    }

    .card-title {
      font-size: 22px;
    }

    .card-content {
      padding: 20px 24px;
    }

    .qb-eleg-stats-bar {
      gap: 16px;
    }

    .qb-eleg-stat-lbl {
      font-size: 12px;
    }

    .qb-eleg-stat-num {
      font-size: 15px;
    }

    .menu-btn {
      opacity: 1;
    }
  }

  /* 大屏幕优化 */
  @media (min-width: 1400px) {
    .question-bank-elegant-card {
      height: 240px;
    }

    .card-title {
      font-size: 26px;
    }

    .card-content {
      padding: 24px 28px;
    }

    .qb-eleg-stat-num {
      font-size: 18px;
    }
  }

  @container deck-card (max-width: 360px) {
    .question-bank-elegant-card {
      height: 180px;
      border-radius: 14px;
    }

    .card-content {
      padding: 18px 18px;
    }

    .card-title {
      font-size: 21px;
    }

    .qb-eleg-stats-bar {
      gap: 12px 14px;
    }

    .qb-eleg-stat-lbl {
      font-size: 11px;
    }

    .qb-eleg-stat-num {
      font-size: 14px;
    }

    .menu-btn {
      opacity: 1;
    }
  }

  @container deck-card (max-width: 280px) {
    .question-bank-elegant-card {
      height: 162px;
      border-radius: 12px;
    }

    .card-content {
      padding: 14px 14px;
    }

    .card-title {
      font-size: 18px;
    }

    .qb-eleg-stats-bar {
      gap: 10px 12px;
    }

    .qb-eleg-stat-lbl {
      font-size: 10px;
    }

    .qb-eleg-stat-num {
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
