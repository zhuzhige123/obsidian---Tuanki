<script lang="ts">
  import { onMount } from 'svelte';
  import ConfettiEffect from '../celebration/ConfettiEffect.svelte';
  import WavingDots from '../celebration/WavingDots.svelte';
  import { getCelebrationSound } from '../../services/audio/CelebrationSound';
  import { getRandomCongratulation, getRandomQuote } from '../../data/celebration-messages';
  import type { CelebrationStats } from '../../types/celebration-types';
  
  interface Props {
    deckName: string;
    stats: CelebrationStats;
    soundEnabled?: boolean;
    soundVolume?: number;
    onClose: () => void;
  }
  
  let { 
    deckName,
    stats,
    soundEnabled = true,
    soundVolume = 0.5,
    onClose 
  }: Props = $props();
  
  // 随机选择消息和名言
  const congratulation = getRandomCongratulation();
  const quote = getRandomQuote();
  
  // 格式化学习时长
  const formattedStudyTime = $derived(() => {
    const minutes = Math.floor(stats.studyTime / 60);
    if (minutes === 0) return '< 1分钟';
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小时${mins}分钟`;
  });
  
  // 动画状态
  let showContent = $state(false);
  
  onMount(() => {
    
    // 播放音效
    if (soundEnabled) {
      const sound = getCelebrationSound();
      sound.play(soundVolume).catch(err => {
        console.error('[CelebrationModal] Sound play failed:', err);
      });
    }
    
    // 延迟显示内容（等待礼花动画）
    setTimeout(() => {
      showContent = true;
    }, 300);
    
    // 键盘事件
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeydown);
    
    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<!-- 🎉 庆祝界面（直接渲染，无需 Portal） -->
<!-- 背景遮罩 -->
<div 
      class="celebration-backdrop"
      onclick={onClose}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose(); }}
      role="button"
      tabindex="0"
      aria-label="关闭庆祝窗口"
    >
      <!-- 礼花动画层 -->
      <ConfettiEffect />
      
      <!-- 内容卡片 -->
      <div 
        class="celebration-card"
        class:show={showContent}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="-1"
        aria-labelledby="celebration-title"
        aria-modal="true"
      >
        <!-- 顶部装饰 -->
        <div class="celebration-header">
          <div class="emoji-large">{congratulation.emoji}</div>
        </div>
        
        <!-- 主标题 -->
        <h2 id="celebration-title" class="celebration-title">
          {congratulation.text}
        </h2>
        
        <!-- 波浪圆点动画 -->
        <div class="dots-container">
          <WavingDots />
        </div>
        
        <!-- 神经科学名言卡片 -->
        <div class="quote-card">
          <div class="quote-icon">{quote.icon}</div>
          <div class="quote-content">
            <p class="quote-text">"{quote.text}"</p>
            <p class="quote-author">— {quote.author}</p>
            <p class="quote-note">{quote.note}</p>
          </div>
        </div>
        
        <!-- 学习统计 -->
        <div class="stats-section">
          <div class="stats-title">📊 今日学习成就</div>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-icon">✅</div>
              <div class="stat-value">{stats.reviewed}</div>
              <div class="stat-label">复习卡片</div>
            </div>
            <div class="stat-item">
              <div class="stat-icon">⏱️</div>
              <div class="stat-value">{formattedStudyTime()}</div>
              <div class="stat-label">学习时长</div>
            </div>
            <div class="stat-item">
              <div class="stat-icon">📈</div>
              <div class="stat-value">{Math.round(stats.memoryRate * 100)}%</div>
              <div class="stat-label">记忆率</div>
            </div>
          </div>
        </div>
        
        <!-- 底部提示和按钮 -->
        <div class="celebration-footer">
          <p class="footer-hint">💫 可以继续学习其他牌组哦~</p>
          <button class="btn-close" onclick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>

<style>
  /* 背景遮罩 */
  .celebration-backdrop {
    /* ✅ 使用 fixed 定位，相对于视口，适应所有场景（包括分屏） */
    position: fixed;
    /* 🔧 使用 inset 简写，确保铺满整个视口 */
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999; /* 🆕 超高 z-index 确保显示在最顶层 */
    padding: 20px;
    animation: backdrop-fade-in 0.3s ease-out;
    /* 🆕 确保在窄容器中也能正常显示 */
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
    z-index: 10001;
  }

  .celebration-card.show {
    opacity: 1;
    transform: scale(1);
  }

  /* 顶部装饰 */
  .celebration-header {
    text-align: center;
    margin-bottom: 16px;
  }

  .emoji-large {
    font-size: 64px;
    line-height: 1;
    animation: emoji-bounce 0.6s ease-out 0.3s;
    display: inline-block;
  }

  @keyframes emoji-bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-10px);
    }
  }

  /* 主标题 */
  .celebration-title {
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

  /* 名言卡片 */
  .quote-card {
    display: flex;
    gap: 16px;
    padding: 20px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    margin-bottom: 24px;
    animation: quote-slide-up 0.5s ease-out 0.6s both;
  }

  @keyframes quote-slide-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .quote-icon {
    font-size: 32px;
    line-height: 1;
    flex-shrink: 0;
  }

  .quote-content {
    flex: 1;
  }

  .quote-text {
    font-size: 14px;
    color: var(--text-normal);
    margin: 0 0 8px 0;
    line-height: 1.6;
    font-style: italic;
  }

  .quote-author {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0 0 4px 0;
    font-weight: 500;
  }

  .quote-note {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0;
    opacity: 0.7;
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
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .stat-item {
    background: var(--background-secondary);
    padding: 16px 12px;
    border-radius: 8px;
    text-align: center;
    border: 1px solid var(--background-modifier-border);
    transition: all 0.2s;
  }

  .stat-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
  }

  .stat-icon {
    font-size: 24px;
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-normal);
    margin-bottom: 4px;
    background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .stat-label {
    font-size: 12px;
    color: var(--text-muted);
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

  .footer-hint {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0 0 16px 0;
    font-style: italic;
  }

  .btn-close {
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

  .btn-close:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(139, 92, 246, 0.4);
  }

  .btn-close:active {
    transform: translateY(0);
  }

  /* 响应式 */
  @media (max-width: 600px) {
    .celebration-card {
      padding: 24px 20px;
    }

    .celebration-title {
      font-size: 20px;
    }

    .emoji-large {
      font-size: 48px;
    }

    .stats-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .stat-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      text-align: left;
      gap: 12px;
      padding: 12px;
    }

    .stat-icon {
      margin-bottom: 0;
    }

    .stat-value {
      margin-bottom: 0;
    }
  }
</style>

