<script lang="ts">
  interface Props {
    newCards: number;
    learningCards: number;
    reviewCards: number;
    totalCards: number;
    deckName: string;
    onClick?: (event: MouseEvent) => void;
  }

  let { newCards, learningCards, reviewCards, totalCards, deckName, onClick }: Props = $props();

  // 计算已掌握卡片数
  const masteredCards = $derived(totalCards - (newCards + learningCards + reviewCards));

  // 计算各段百分比（用于CSS变量）
  const newEnd = $derived((newCards / totalCards) * 100);
  const learningEnd = $derived(((newCards + learningCards) / totalCards) * 100);
  const reviewEnd = $derived(((newCards + learningCards + reviewCards) / totalCards) * 100);

  // 处理点击事件
  function handleClick(event: MouseEvent) {
    if (onClick) {
      onClick(event);
    }
  }
</script>

<button 
  class="multi-segment-progress-bar"
  type="button"
  aria-label="{deckName}进度：新{newCards}张，学习中{learningCards}张，待复习{reviewCards}张，已掌握{masteredCards}张"
  onclick={handleClick}
  disabled={!onClick}
>
  {#if totalCards > 0}
    <div 
      class="progress-fill"
      style:--new-end="{newEnd}%"
      style:--learning-end="{learningEnd}%"
      style:--review-end="{reviewEnd}%"
    ></div>
  {:else}
    <div class="progress-empty">
      <span class="empty-text">暂无卡片</span>
    </div>
  {/if}
</button>

<style>
  .multi-segment-progress-bar {
    width: 100%;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--background-secondary);
    border: none;
    padding: 0;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
  }
  
  .multi-segment-progress-bar:disabled {
    cursor: default;
  }

  .multi-segment-progress-bar:hover {
    transform: scaleY(1.25);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .multi-segment-progress-bar:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  /* 渐变填充层 */
  .progress-fill {
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      #3b82f6 0%,
      #3b82f6 var(--new-end),
      #f59e0b var(--new-end),
      #f59e0b var(--learning-end),
      #8b5cf6 var(--learning-end),
      #8b5cf6 var(--review-end),
      #10b981 var(--review-end),
      #10b981 100%
    );
    transition: all 0.3s ease;
  }

  /* 空状态 */
  .progress-empty {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-modifier-border);
  }

  .empty-text {
    font-size: 10px;
    color: var(--text-muted);
    opacity: 0.6;
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .multi-segment-progress-bar {
      height: 6px;
    }

    .multi-segment-progress-bar:hover {
      transform: scaleY(1.3);
    }
  }
</style>

