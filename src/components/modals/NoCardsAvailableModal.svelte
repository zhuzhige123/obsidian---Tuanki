<script lang="ts">
  import { onMount } from 'svelte';
  import WavingDots from '../celebration/WavingDots.svelte';
  import { tr } from '../../utils/i18n';
  import { buildNoCardsStatRows, resolveNoCardsStatsTitle, type NoCardsModalStats, type NoCardsModalStatsText } from './no-cards-modal-stats';
  
  interface Props {
    deckName: string;
    reason: 'empty' | 'all-learned' | 'no-due';
    stats?: NoCardsModalStats;
    onClose: () => void;
    onAdvanceStudy?: () => void;
    onViewStats?: () => void;
    onStartPractice?: () => void;
  }
  
  let { 
    deckName,
    reason,
    stats,
    onClose,
    onAdvanceStudy,
    onViewStats,
    onStartPractice
  }: Props = $props();
  
  let t = $derived($tr);

  const statsText = $derived<NoCardsModalStatsText>({
    title: t('study.noCardsModal.stats.title'),
    sessionSummaryTitle: t('study.noCardsModal.stats.sessionSummaryTitle'),
    deckStatusTitle: t('study.noCardsModal.stats.deckStatusTitle'),
    totalCards: t('study.noCardsModal.stats.totalCards'),
    sessionCompleted: t('study.noCardsModal.stats.sessionCompleted'),
    nextDue: t('study.noCardsModal.stats.nextDue'),
    todayNew: t('study.noCardsModal.stats.todayNew'),
    completed: t('study.noCardsModal.stats.completed'),
    unit: t('study.noCardsModal.stats.unit')
  });

  const statsTitle = $derived(() => {
    return resolveNoCardsStatsTitle(reason, statsText);
  });

  const statsRows = $derived(() => {
    return buildNoCardsStatRows(reason, stats, statsText);
  });
  
  // 动画状态
  let showContent = $state(false);
  
  // 根据原因生成提示信息
  const info = $derived(() => {
    switch (reason) {
      case 'empty':
        return {
          title: t('study.noCardsModal.empty.title'),
          message: t('study.noCardsModal.empty.message'),
          svgPath: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm4 4h6v2H9V9zm0 4h6v2H9v-2z'
        };
      case 'all-learned':
        return {
          title: t('study.noCardsModal.allLearned.title'),
          message: t('study.noCardsModal.allLearned.message', { deckName }),
          svgPath: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z'
        };
      case 'no-due':
        return {
          title: t('study.noCardsModal.noDue.title'),
          message: stats ? t('study.noCardsModal.noDue.messageWithCount', { count: String(stats.totalCards) }) : t('study.noCardsModal.noDue.messageDefault'),
          svgPath: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z'
        };
      default:
        return {
          title: t('study.noCardsModal.default.title'),
          message: t('study.noCardsModal.default.message'),
          svgPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'
        };
    }
  });
  
  onMount(() => {
    // 延迟显示内容（等待动画）
    setTimeout(() => {
      showContent = true;
    }, 300);
    
    // 键盘事件
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (typeof onClose === 'function') {
          onClose();
        }
      }
    };
    
    activeDocument.addEventListener('keydown', handleKeydown);
    
    return () => {
      activeDocument.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<div 
  class="no-cards-backdrop"
  onclick={() => { if (typeof onClose === 'function') onClose(); }}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (typeof onClose === 'function') onClose(); } }}
  role="button"
  tabindex="0"
  aria-label={t('study.noCardsModal.closeAriaLabel')}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div 
    class="no-cards-card"
    class:show={showContent}
    onclick={(e) => { e.preventDefault(); }}
    onkeydown={(e) => { e.preventDefault(); }}
    role="dialog"
    tabindex="-1"
    aria-labelledby="no-cards-title"
    aria-modal="true"
  >
    <!-- 主标题 -->
    <h2 id="no-cards-title" class="no-cards-title">
      {info().title}
    </h2>
    
    <!-- 波浪圆点动画 -->
    <div class="dots-container">
      <WavingDots />
    </div>
    
    <!-- 统计信息卡片 - 列表式设计 -->
    {#if stats && reason !== 'empty'}
    <div class="stats-card">
      <div class="stats-header">
        <span class="stats-title">{statsTitle()}</span>
      </div>
      
      <div class="stats-list">
        {#each statsRows() as row}
        <div class="stat-row">
          <span class="stat-label">{row.label}</span>
          <span class="stat-value">{row.value}</span>
        </div>
        {/each}
      </div>
    </div>
    {/if}
    
    
    <!-- 操作按钮组 - 同一行显示 -->
    <div class="action-buttons-row">
      {#if onStartPractice && reason !== 'empty'}
      <button class="btn-compact btn-practice" onclick={onStartPractice}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
        </svg>
        <span>{t('study.noCardsModal.buttons.startExam')}</span>
      </button>
      {/if}
      
      {#if onAdvanceStudy && reason !== 'empty'}
      <button class="btn-compact btn-primary" onclick={onAdvanceStudy}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <span>{t('study.noCardsModal.buttons.advanceStudy')}</span>
      </button>
      {/if}
      
      {#if onViewStats && reason !== 'empty'}
      <button class="btn-compact btn-secondary" onclick={onViewStats}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 3v18h18"/>
          <path d="M18 17V9M13 17V5M8 17v-3"/>
        </svg>
        <span>{t('study.noCardsModal.buttons.viewStats')}</span>
      </button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* 背景遮罩 */
  .no-cards-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--weave-z-toast);
    padding: 20px;
    animation: backdrop-fade-in 0.3s ease-out;
    overflow: auto;
  }

  @keyframes backdrop-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* 内容卡片 */
  .no-cards-card {
    position: relative;
    max-width: 520px;
    width: 100%;
    background: var(--background-primary);
    border-radius: 16px;
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    padding: 32px 28px;
    opacity: 0;
    transform: scale(0.9);
    transition: all 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
    z-index: calc(var(--weave-z-top) + 1);
  }

  .no-cards-card.show {
    opacity: 1;
    transform: scale(1);
  }

  /* 主标题 */
  .no-cards-title {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-normal);
    text-align: center;
    margin: 0 0 24px 0;
    line-height: 1.4;
    background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: title-slide-up 0.5s ease-out 0.4s both;
  }

  @keyframes title-slide-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 圆点容器 */
  .dots-container {
    margin: 0 0 28px 0;
    animation: dots-fade-in 0.5s ease-out 0.5s both;
  }

  @keyframes dots-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* 统计信息卡片 */
  .stats-card {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
    animation: stats-slide-up 0.5s ease-out 0.6s both;
  }

  @keyframes stats-slide-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .stats-header {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }

  .stats-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* 统计列表 - 干净优雅的列表设计 */
  .stats-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--background-modifier-border-hover);
    transition: background 0.15s ease;
  }

  .stat-row:last-child {
    border-bottom: none;
  }

  .stat-row:hover {
    background: var(--background-primary-alt);
  }

  .stat-label {
    font-size: 14px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .stat-value {
    font-size: 15px;
    color: var(--text-normal);
    font-weight: 600;
  }

  /* 建议提示框 */
  @keyframes suggestion-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* 操作按钮组 - 同一行紧凑显示 */
  .action-buttons-row {
    display: flex;
    gap: 8px;
    justify-content: center;
    animation: buttons-fade-in 0.5s ease-out 0.8s both;
  }

  @keyframes buttons-fade-in {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .btn-compact {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .btn-compact svg {
    flex-shrink: 0;
  }

  .btn-compact span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-compact.btn-practice {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
  }

  .btn-compact.btn-practice:hover {
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
    filter: brightness(1.05);
  }

  .btn-compact.btn-primary {
    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.25);
  }

  .btn-compact.btn-primary:hover {
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.35);
    filter: brightness(1.05);
  }

  .btn-compact.btn-secondary {
    background: var(--interactive-accent);
    color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  .btn-compact.btn-secondary:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    filter: brightness(1.1);
  }

  .btn-compact:active {
    transform: scale(0.98);
  }

  /* 响应式 - 移动端优化 */
  @media (max-width: 600px) {
    .no-cards-card {
      padding: 20px 16px;
      margin: 12px;
      max-width: calc(100% - 24px);
    }

    .no-cards-title {
      font-size: 18px;
      margin-bottom: 16px;
    }

    .dots-container {
      margin-bottom: 20px;
    }

    .stats-card {
      padding: 12px;
      margin-bottom: 16px;
    }

    .stats-header {
      margin-bottom: 8px;
    }

    .stat-row {
      padding: 10px 12px;
    }

    .stat-label {
      font-size: 13px;
    }

    .stat-value {
      font-size: 14px;
    }

    /* 按钮保持同一行 */
    .action-buttons-row {
      gap: 6px;
      flex-wrap: nowrap;
    }

    .btn-compact {
      padding: 8px 10px;
      font-size: 11px;
      gap: 3px;
    }

    .btn-compact svg {
      width: 12px;
      height: 12px;
    }
  }

  /* 超小屏幕 */
  @media (max-width: 360px) {
    .btn-compact {
      padding: 6px 8px;
      font-size: 10px;
    }

    .btn-compact svg {
      display: none;
    }
  }
</style>
