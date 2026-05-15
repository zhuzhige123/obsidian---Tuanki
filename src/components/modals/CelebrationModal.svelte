<script lang="ts">
  import { logger } from '../../utils/logger';

  import { onMount } from 'svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import ConfettiEffect from '../celebration/ConfettiEffect.svelte';
  import WavingDots from '../celebration/WavingDots.svelte';
  import { getCelebrationSound } from '../../services/audio/CelebrationSound';
  import type { CelebrationStats } from '../../types/celebration-types';
  
  //  导入国际化
  import { tr } from '../../utils/i18n';
  
  interface Props {
    deckName: string;
    deckId: string;
    stats: CelebrationStats;
    soundEnabled?: boolean;
    soundVolume?: number;
    onClose: () => void;
    onStartPractice?: () => void;
  }
  
  let { 
    deckName,
    deckId,
    stats,
    soundEnabled = true,
    soundVolume = 0.5,
    onClose,
    onStartPractice
  }: Props = $props();
  
  //  响应式翻译函数
  let t = $derived($tr);
  
  // 格式化学习时长
  const formattedStudyTime = $derived(() => {
    const minutes = Math.floor(stats.studyTime / 60);
    if (minutes === 0) return t('celebration.timeFormat.lessThan1Min');
    if (minutes < 60) return t('celebration.timeFormat.minutes').replace('{n}', String(minutes));
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return t('celebration.timeFormat.hoursMinutes').replace('{h}', String(hours)).replace('{m}', String(mins));
  });
  
  // 动画状态
  let showContent = $state(false);
  
  onMount(() => {
    // 播放音效
    if (soundEnabled) {
      const sound = getCelebrationSound();
      sound.play(soundVolume).catch(err => {
        logger.error('[CelebrationModal] Sound play failed:', err);
      });
    }
    
    // 延迟显示内容（等待礼花动画）
    setTimeout(() => {
      showContent = true;
    }, 300);
  });
</script>

<!--  庆祝界面（直接渲染，无需 Portal） -->
<!-- 背景遮罩 -->
<div 
      class="celebration-backdrop"
      onclick={(event) => {
        if (event.target === event.currentTarget && typeof onClose === 'function') {
          onClose();
        }
      }}
      role="presentation"
    >
      <!-- 礼花动画层 -->
      <ConfettiEffect />
      
      <!-- 内容卡片 -->
      <div 
        class="celebration-card"
        class:show={showContent}
        data-deck-id={deckId}
        data-deck-name={deckName}
        onclick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onkeydown={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        tabindex="-1"
        aria-label={t('celebration.title')}
        aria-modal="true"
      >
        <!-- 波浪圆点动画 -->
        <div class="dots-container">
          <WavingDots />
        </div>
        
        <!-- 学习统计 -->
        <div class="stats-section">
          <div class="stats-title">
            <ObsidianIcon name="bar-chart-2" size={16} />
            <span>{t('celebration.stats.title')}</span>
          </div>
          <div class="stats-list">
            <div class="stat-row">
              <span class="stat-label">{t('celebration.stats.reviewed')}</span>
              <span class="stat-value">{stats.reviewed}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">{t('celebration.stats.studyTime')}</span>
              <span class="stat-value">{formattedStudyTime()}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">{t('celebration.stats.memoryRate')}</span>
              <span class="stat-value">{Math.round(stats.memoryRate * 100)}%</span>
            </div>
          </div>
        </div>
        
        <!-- 底部提示和按钮 -->
        <div class="celebration-footer">
          <div class="footer-buttons-row">
            <button class="btn-secondary" onclick={onClose}>
              {t('celebration.footer.closeButton')}
            </button>
            {#if onStartPractice}
              <button class="btn-primary" onclick={onStartPractice}>
                {t('celebration.footer.startPracticeButton')}
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>

<style>
  /* 背景遮罩 */
  .celebration-backdrop {
    /*  使用 fixed 定位，相对于视口，适应所有场景（包括分屏） */
    position: fixed;
    /*  使用 inset 简写，确保铺满整个视口 */
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: calc(var(--layer-notice) + 50); /* 庆祝模态窗层级：高于学习界面覆盖层(100) */
    padding: 20px;
    animation: backdrop-fade-in 0.3s ease-out;
    /* 确保在窄容器中也能正常显示 */
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
  .celebration-card {
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
    z-index: calc(var(--layer-notice) + 51);
  }

  .celebration-card.show {
    opacity: 1;
    transform: scale(1);
  }

  /* 主标题 */
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

  /* 统计区域 */
  .stats-section {
    margin-bottom: 24px;
    animation: stats-fade-in 0.5s ease-out 0.8s both;
  }

  @keyframes stats-fade-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .stats-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 12px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .stats-title :global(svg) {
    width: 16px;
    height: 16px;
  }

  .stats-list {
    background: var(--background-secondary);
    border-radius: 12px;
    border: 1px solid var(--background-modifier-border);
    overflow: hidden;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .stat-row:last-child {
    border-bottom: none;
  }

  .stat-label {
    font-size: 14px;
    color: var(--text-muted);
  }

  .stat-value {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal);
    background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* 底部按钮 */
  .celebration-footer {
    text-align: center;
    animation: footer-fade-in 0.5s ease-out 1.0s both;
  }

  @keyframes footer-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .footer-buttons-row {
    display: flex;
    gap: 12px;
    justify-content: center;
    align-items: center;
  }

  .btn-secondary {
    background: var(--background-secondary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 12px 32px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .btn-secondary:active {
    transform: translateY(0);
  }

  .btn-primary {
    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px 32px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(139, 92, 246, 0.4);
  }

  .btn-primary:active {
    transform: translateY(0);
  }

  /* 响应式 */
  @media (max-width: 600px) {
    .celebration-card {
      padding: 24px 20px;
    }

    .stat-row {
      padding: 12px 16px;
    }

    .footer-buttons-row {
      display: flex;
      flex-direction: row;
      gap: 12px;
    }

    .btn-secondary,
    .btn-primary {
      flex: 1;
      padding: 12px 16px;
    }
  }
</style>
