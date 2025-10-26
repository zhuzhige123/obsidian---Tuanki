<script lang="ts">
  import type { Card } from "../../data/types";

  interface Props {
    card: Card;
    index: number;
    selected: boolean;
    onclick: () => void;
  }

  let { card, index, selected, onclick }: Props = $props();

  // 获取完整卡片内容（front + back，使用分隔符）
  const contentPreview = $derived(() => {
    const front = card.fields?.front || '';
    const back = card.fields?.back || '';
    
    // 移除HTML标签
    const frontText = front.replace(/<[^>]*>/g, '').trim();
    const backText = back.replace(/<[^>]*>/g, '').trim();
    
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
</script>

<button
  class="child-card-mini"
  class:selected
  style="animation-delay: {index * 0.05}s"
  {onclick}
  type="button"
>
  <span class="card-label">{contentPreview()}</span>
</button>

<style>
  .child-card-mini {
    min-width: 240px;
    max-width: 280px;
    min-height: 180px;
    max-height: 320px;
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

