<script lang="ts">
  import type { Deck } from '../../data/types';
  import type { ColorScheme, CardState } from '../../config/card-color-schemes';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { tr } from '../../utils/i18n';

  interface QuestionBankStats {
    total: number;      // 总题数
    completed: number;  // 已练题数
    accuracy: number;   // 正确率 (0-100)
    errorCount: number; // 错题数
  }

  interface Props {
    bank: Deck;
    stats: QuestionBankStats;
    colorScheme: ColorScheme;
    onTest: () => void;
    onMenu: (event: MouseEvent) => void;
  }

  let { bank, stats, colorScheme, onTest, onMenu }: Props = $props();
  let t = $derived($tr);

  // 根据题库状态计算卡片状态
  const cardState = $derived.by<CardState>(() => {
    if (stats.total === 0) return 'completed';
    
    // 已完成且正确率高
    if (stats.completed === stats.total && stats.accuracy >= 80) {
      return 'completed';
    }
    
    // 正确率低于60%且已练习超过50% → 需要重点复习
    if (stats.completed > 0 && stats.accuracy < 60 && stats.completed > stats.total * 0.5) {
      return 'urgent';
    }
    
    // 有未完成的题目 → 待练习状态
    if (stats.completed < stats.total) {
      return 'normal';
    }
    
    return 'normal';
  });

  // 获取当前状态的配色
  const currentColorConfig = $derived(colorScheme[cardState]);

  // 生成卡片主区域样式
  const mainStyle = $derived(`background: ${currentColorConfig.gradient}; color: ${currentColorConfig.textColor};`);

  // 生成信息条样式
  const infoBarStyle = $derived(`background: ${colorScheme.infoBar.background}; color: ${colorScheme.infoBar.textColor};`);

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
  class="question-bank-grid-card"
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
    accuracy: stats.accuracy.toFixed(0)
  })}
>
  <!-- 上方主区域：题库名 -->
  <div class="card-main" style={mainStyle}>
    <!-- 微妙的光效层 -->
    <div class="light-effect"></div>
    
    <!-- 右上角菜单按钮 -->
    <button 
      class="menu-btn"
      onclick={handleMenuClick}
      aria-label={t('study.questionBankUI.bankCollection.moreActions')}
      title={t('study.questionBankUI.bankCollection.moreActions')}
    >
      <EnhancedIcon name="more-horizontal" size={16} />
    </button>
    
    <div class="bank-title">
      {bank.name}
    </div>

    <!-- 空题库标记 -->
    {#if stats.total === 0}
      <div class="empty-badge">{t('study.questionBankUI.bankCollection.emptyBank')}</div>
    {/if}
  </div>

  <!-- 下方信息条（qb-grid-*：避免全局 .stat-number / .stat-label 污染） -->
  <div class="card-info-bar" style={infoBarStyle}>
    <div class="qb-grid-info-left">
      {#if stats.completed > 0}
        <div class="qb-grid-accuracy">
          {stats.accuracy.toFixed(0)}%
        </div>
      {/if}
    </div>

    <div class="qb-grid-stats">
      <div class="qb-grid-stat">
        <span class="qb-grid-stat-num">{stats.total}</span>
        <span class="qb-grid-stat-lbl">{t('study.questionBankUI.bankCollection.headers.total')}</span>
      </div>
      <div class="qb-grid-stat">
        <span class="qb-grid-stat-num">{stats.completed}</span>
        <span class="qb-grid-stat-lbl">{t('study.questionBankUI.bankCollection.headers.completed')}</span>
      </div>
      <div class="qb-grid-stat">
        <span class="qb-grid-stat-num">{stats.errorCount}</span>
        <span class="qb-grid-stat-lbl">{t('study.questionBankUI.statsCards.totalWrong')}</span>
      </div>
    </div>

    <div class="qb-grid-info-right" aria-hidden="true"></div>
  </div>
</div>

<style>
  .question-bank-grid-card {
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

  .question-bank-grid-card.empty {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .question-bank-grid-card:not(.empty):hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    filter: brightness(1.05);
  }

  .question-bank-grid-card:not(.empty):active {
    transform: translateY(-2px);
  }

  /* 上方主区域：题库名 */
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
    background: rgba(0, 0, 0, 0.15);
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: all 0.2s;
    opacity: 0;
    touch-action: manipulation;
  }

  .question-bank-grid-card:hover .menu-btn {
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

  /* 移动端：始终显示菜单按钮 */
  @media (max-width: 768px) {
    .menu-btn {
      opacity: 1;
    }
  }

  .bank-title {
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

  /* 空题库标记 */
  .empty-badge {
    position: absolute;
    bottom: 16px;
    right: 16px;
    padding: 4px 12px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.3);
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    font-weight: 600;
    backdrop-filter: blur(8px);
  }

  /* 下方信息条 */
  .card-info-bar {
    min-height: 52px;
    height: auto;
    box-sizing: border-box;
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-interface), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
  }

  .qb-grid-info-left {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    min-width: min(60px, 18%);
    justify-content: flex-start;
  }

  .qb-grid-accuracy {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    background: rgba(0, 0, 0, 0.12);
    color: inherit;
    opacity: 0.95;
    white-space: nowrap;
    flex-shrink: 0;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  }

  .qb-grid-stats {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 14px;
    flex-wrap: nowrap;
    flex: 1 1 auto;
    min-width: 0;
  }

  .qb-grid-stat {
    display: inline-flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: baseline;
    gap: 0.2em;
    flex-shrink: 0;
    white-space: nowrap;
    max-width: 100%;
  }

  .qb-grid-stat-lbl {
    font-size: 12px;
    opacity: 0.9;
    white-space: nowrap;
  }

  .qb-grid-stat-num {
    font-weight: 600;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }

  .qb-grid-info-right {
    flex: 0 0 auto;
    min-width: min(60px, 18%);
    width: min(60px, 18%);
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .question-bank-grid-card {
      height: 200px;
    }

    .bank-title {
      font-size: 20px;
    }

    .card-info-bar {
      min-height: 48px;
      padding: 8px 16px;
      font-size: 12px;
    }

    .qb-grid-stat-num {
      font-size: 14px;
    }

    .qb-grid-stats {
      gap: 10px;
    }

    .qb-grid-stat-lbl {
      font-size: 10px;
    }
  }

  @container deck-card (max-width: 360px) {
    .question-bank-grid-card {
      height: 188px;
      border-radius: 10px;
    }

    .card-main {
      padding: 22px 16px;
    }

    .bank-title {
      font-size: 20px;
    }

    .card-info-bar {
      min-height: 46px;
      padding: 8px 14px;
    }

    .qb-grid-stats {
      gap: 10px 12px;
    }

    .qb-grid-stat-num {
      font-size: 14px;
    }

    .qb-grid-stat-lbl {
      font-size: 11px;
    }

    .menu-btn {
      opacity: 1;
    }
  }

  @container deck-card (max-width: 280px) {
    .question-bank-grid-card {
      height: 170px;
      border-radius: 10px;
    }

    .card-main {
      padding: 16px 12px;
    }

    .bank-title {
      font-size: 18px;
    }

    .card-info-bar {
      min-height: 42px;
      padding: 6px 10px;
    }

    .qb-grid-stats {
      gap: 6px 10px;
    }

    .qb-grid-stat-num {
      font-size: 13px;
    }

    .qb-grid-stat-lbl {
      font-size: 10px;
    }

    .menu-btn {
      top: 8px;
      right: 8px;
      width: 28px;
      height: 28px;
    }
  }
</style>
