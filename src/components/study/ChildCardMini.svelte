<script lang="ts">
  import type { Card } from "../../data/types";
  import { tr } from '../../utils/i18n';

  interface Props {
    card: Card;
    index: number;
    selected: boolean;
    regenerating?: boolean; // 是否正在重新生成
    disabled?: boolean; // 是否禁用（待定状态）
    onclick: () => void;
  }

  let { card, index, selected, regenerating = false, disabled = false, onclick }: Props = $props();

  let t = $derived($tr);

  // 获取完整卡片内容（front + back，使用分隔符）
  const contentPreview = $derived.by(() => {
    // 从 card.content 解析
    if (!card.content) {
      return '';
    }
    
    const content = card.content.trim();
    const dividerIndex = content.indexOf('---div---');
    
    let frontText = '';
    let backText = '';
    
    if (dividerIndex >= 0) {
      frontText = content.substring(0, dividerIndex).trim();
      backText = content.substring(dividerIndex + '---div---'.length).trim();
    } else {
      frontText = content;
      backText = '';
    }
    
    // 移除HTML标签
    frontText = frontText.replace(/<[^>]*>/g, '').trim();
    backText = backText.replace(/<[^>]*>/g, '').trim();
    
    // 使用分隔符拼接
    if (frontText && backText) {
      return `${frontText}\n\n---\n\n${backText}`;
    } else if (frontText) {
      return frontText;
    } else if (backText) {
      return backText;
    } else {
      return card.content?.replace(/<[^>]*>/g, '').trim() || '';
    }
  });

  // 处理点击事件（禁用时阻止）
  function handleClick() {
    if (!disabled && !regenerating) {
      onclick();
    }
  }
</script>

<button
  class="child-card-mini"
  class:selected
  class:regenerating
  class:disabled
  style="animation-delay: {index * 0.05}s"
  onclick={handleClick}
  type="button"
>
  {#if regenerating}
    <!-- 加载状态 UI -->
    <div class="regenerating-indicator">
      <div class="regenerating-text">
        <span>{t('study.childCards.regenerating')}</span>
      </div>
      <div class="regenerating-progress">
        <div class="regenerating-progress-bar"></div>
      </div>
    </div>
  {:else}
    <!-- 正常卡片内容 -->
    <span class="card-label">{contentPreview}</span>
  {/if}
</button>

<style>
  .child-card-mini {
    min-width: 240px;
    max-width: 280px;
    /* 与 AI 拆分预览条一致：父级可设 --weave-ai-preview-card-height 统一控制高度 */
    min-height: var(--weave-ai-preview-card-height, 200px);
    height: var(--weave-ai-preview-card-height, auto);
    max-height: var(--weave-ai-preview-card-height, 360px);
    flex-shrink: 0;
    
    position: relative;
    
    /* 毛玻璃半透明背景 */
    background: rgba(42, 42, 42, 0.75);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    
    /* 极细边框 */
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    
    display: flex;
    flex-direction: column;
    justify-content: flex-start; /* 内容靠上 */
    align-items: flex-start; /* 内容靠左 */
    padding: 1.25rem 1rem;
    
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    
    /* 优雅阴影 */
    box-shadow: 
      0 8px 24px rgba(0, 0, 0, 0.25),
      0 2px 8px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    
    animation: slideInFromBottom 0.4s ease-out;
    animation-fill-mode: both;
    
    overflow-y: auto; /* 允许垂直滚动 */
    overflow-x: hidden;
  }

  .child-card-mini::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60%;
    background: radial-gradient(
      circle at 50% 0%,
      rgba(255, 255, 255, 0.03) 0%,
      transparent 70%
    );
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .child-card-mini:hover {
    transform: translateY(-8px);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 
      0 16px 40px rgba(0, 0, 0, 0.35),
      0 8px 16px rgba(0, 0, 0, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .child-card-mini:hover::before {
    opacity: 1;
  }

  .child-card-mini:active {
    transform: translateY(-4px) scale(0.98);
  }

  /* 选中状态 */
  .child-card-mini.selected {
    border-color: var(--interactive-accent);
    border-width: 2px;
    background: rgba(76, 175, 80, 0.15);
    box-shadow: 
      0 0 0 3px rgba(76, 175, 80, 0.3),
      0 16px 40px rgba(76, 175, 80, 0.25),
      0 8px 16px rgba(0, 0, 0, 0.25),
      inset 0 1px 0 rgba(76, 175, 80, 0.2);
  }

  .child-card-mini.selected::before {
    opacity: 1;
    background: radial-gradient(
      circle at 50% 0%,
      rgba(76, 175, 80, 0.15) 0%,
      transparent 70%
    );
  }

  /* 正在重新生成状态 */
  .child-card-mini.regenerating {
    border-color: rgba(76, 175, 230, 0.5);
    background: rgba(76, 175, 230, 0.1);
    cursor: wait;
    animation: pulseGlow 1.5s ease-in-out infinite;
  }

  .child-card-mini.regenerating:hover {
    transform: translateY(0);
    border-color: rgba(76, 175, 230, 0.5);
  }

  .child-card-mini.regenerating::before {
    opacity: 1;
    background: radial-gradient(
      circle at 50% 0%,
      rgba(76, 175, 230, 0.15) 0%,
      transparent 70%
    );
  }

  /* 禁用状态（待定状态） */
  .child-card-mini.disabled {
    opacity: 0.6;
    filter: grayscale(0.3);
    cursor: not-allowed;
    pointer-events: none;
  }

  .child-card-mini.disabled:hover {
    transform: translateY(0);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow: 
      0 8px 24px rgba(0, 0, 0, 0.25),
      0 2px 8px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .child-card-mini.disabled::before {
    opacity: 0;
  }

  /* 加载指示器容器 */
  .regenerating-indicator {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
  }

  .regenerating-text {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* 进度条容器 */
  .regenerating-progress {
    width: 80%;
    height: 3px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  /* 进度条 */
  .regenerating-progress-bar {
    height: 100%;
    width: 30%;
    background: linear-gradient(
      90deg, 
      var(--interactive-accent), 
      rgba(76, 175, 230, 0.8)
    );
    animation: progress-indeterminate 1.5s ease-in-out infinite;
  }

  /* 脉冲动画 */
  @keyframes pulseGlow {
    0%, 100% {
      box-shadow: 
        0 8px 24px rgba(76, 175, 230, 0.2),
        0 2px 8px rgba(76, 175, 230, 0.15),
        inset 0 1px 0 rgba(76, 175, 230, 0.1);
    }
    50% {
      box-shadow: 
        0 8px 32px rgba(76, 175, 230, 0.35),
        0 4px 12px rgba(76, 175, 230, 0.25),
        inset 0 1px 0 rgba(76, 175, 230, 0.2);
    }
  }

  /* 旋转动画（图标） */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* 不确定进度条动画 */
  @keyframes progress-indeterminate {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(400%);
    }
  }

  /* 卡片内容文本 */
  .card-label {
    font-size: 0.875rem;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.9);
    text-align: left; /* 文本靠左对齐 */
    line-height: 1.6;
    word-wrap: break-word; /* 允许单词内换行 */
    word-break: break-word; /* 允许长单词换行 */
    white-space: pre-wrap; /* 保留换行和空格 */
    
    /* 不再截断，显示完整内容 */
    width: 100%;
    flex: 1;
    
    position: relative;
    z-index: 1;
  }

  /* 入场动画 */
  @keyframes slideInFromBottom {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* 暗色主题适配 */
  :global(.theme-light) .child-card-mini {
    background: rgba(255, 255, 255, 0.85);
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 
      0 8px 24px rgba(0, 0, 0, 0.1),
      0 2px 8px rgba(0, 0, 0, 0.05);
  }

  :global(.theme-light) .card-label {
    color: rgba(0, 0, 0, 0.9);
  }

  :global(.theme-light) .child-card-mini.selected {
    background: rgba(76, 175, 80, 0.1);
    border-color: var(--interactive-accent);
  }
</style>
