<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { ContentSegment } from '../../utils/semantic-content-extractor';
  import { tr } from '../../utils/i18n';

  // Props
  interface Props {
    segment: ContentSegment;
    revealed: boolean;
    onReveal?: () => void;
  }

  let {
    segment,
    revealed,
    onReveal
  }: Props = $props();

  // 内部状态
  let isHovering = $state(false);
  let isAnimating = $state(false);

  // 响应式计算
  const placeholder = '▮▮▮';
  let t = $derived($tr);
  const canReveal = $derived(!revealed && !!onReveal);
  const displayContent = $derived(revealed ? segment.content : placeholder);

  function handleClick(): void {
    if (canReveal && onReveal) {
      isAnimating = true;
      onReveal();

      // 动画完成后重置状态
      window.setTimeout(() => {
        isAnimating = false;
      }, 300);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.currentTarget instanceof HTMLButtonElement) {
      return;
    }
    if (canReveal && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      handleClick();
    }
  }

  function handleMouseEnter(): void {
    isHovering = true;
  }

  function handleMouseLeave(): void {
    isHovering = false;
  }

  function getSegmentClass(): string {
    const classes = ['cloze-segment'];
    
    if (revealed) {
      classes.push('revealed');
    } else {
      classes.push('hidden');
    }
    
    if (canReveal) {
      classes.push('interactive');
    }
    
    if (isHovering && canReveal) {
      classes.push('hovering');
    }
    
    if (isAnimating) {
      classes.push('animating');
    }
    
    return classes.join(' ');
  }

  function getAriaLabel(): string {
    if (revealed) {
      return t('study.cloze.revealedContent', { content: segment.content });
    } else {
      return t('study.cloze.hiddenContent');
    }
  }
</script>

{#if canReveal}
  <button
    type="button"
    class={getSegmentClass()}
    aria-label={getAriaLabel()}
    title={t('study.cloze.clickToReveal')}
    onclick={handleClick}
    onkeydown={handleKeydown}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
  >
    <span class="cloze-placeholder">
      {placeholder}
    </span>
  </button>
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span
    class={getSegmentClass()}
    aria-label={getAriaLabel()}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
  >
    {#if revealed}
      <span class="cloze-content" in:fade={{ duration: 300 }}>
        {segment.content}
      </span>
    {:else}
      <span class="cloze-placeholder">
        {placeholder}
      </span>
    {/if}
  </span>
{/if}

<style>
  .cloze-segment {
    position: relative;
    display: inline;
    background: transparent;
    border: none;
    padding: 0;
    transition: all var(--weave-duration-normal);
    border-radius: var(--weave-radius-sm);
    font-weight: 500;
  }

  /* 隐藏状态 */
  .cloze-segment.hidden {
    background: linear-gradient(
      135deg,
      var(--weave-warning-light) 0%,
      var(--weave-warning) 100%
    );
    color: var(--weave-warning);
    padding: 2px 8px;
    margin: 0 2px;
    border: 1px solid var(--weave-warning);
  }

  /* 显示状态 */
  .cloze-segment.revealed {
    background: linear-gradient(
      135deg,
      var(--weave-success-light) 0%,
      rgba(16, 185, 129, 0.1) 100%
    );
    color: var(--weave-text-primary);
    padding: 2px 6px;
    margin: 0 1px;
    border: 1px solid var(--weave-success);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1);
  }

  /* 交互状态 */
  .cloze-segment.interactive {
    cursor: pointer;
    user-select: none;
  }

  .cloze-segment.interactive:hover {
    transform: translateY(-1px);
    box-shadow: var(--weave-shadow-sm);
  }

  .cloze-segment.interactive:active {
    transform: translateY(0);
  }

  .cloze-segment.interactive:focus-visible {
    outline: 2px solid var(--weave-primary);
    outline-offset: 2px;
  }

  /* 悬停效果 */
  .cloze-segment.hovering.hidden {
    background: var(--weave-warning);
    color: var(--weave-text-inverse);
    box-shadow: var(--weave-shadow-md);
  }

  .cloze-segment.hovering.hidden::after {
    content: '点击显示';
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 8px;
    background: var(--weave-overlay);
    color: var(--weave-text-inverse);
    font-size: var(--weave-text-xs);
    border-radius: var(--weave-radius-sm);
    white-space: nowrap;
    pointer-events: none;
    z-index: var(--weave-z-overlay);
    opacity: 0;
    animation: tooltipFadeIn 0.2s ease-out forwards;
  }

  /* 动画状态 */
  .cloze-segment.animating {
    animation: revealPulse 0.3s ease-out;
  }

  /* 占位符样式 */
  .cloze-placeholder {
    font-family: var(--weave-font-mono);
    letter-spacing: 1px;
    opacity: 0.8;
  }

  /* 内容样式 */
  .cloze-content {
    position: relative;
  }

  .cloze-content::before {
    content: '';
    position: absolute;
    top: 0;
    left: -4px;
    right: -4px;
    bottom: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(16, 185, 129, 0.1) 50%,
      transparent 100%
    );
    border-radius: var(--weave-radius-sm);
    z-index: -1;
    opacity: 0;
    animation: contentHighlight 0.6s ease-out;
  }

  /* 动画定义 */
  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @keyframes revealPulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes contentHighlight {
    0% {
      opacity: 0;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  /* Svelte 过渡动画 */
  :global(.cloze-content) {
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* 高对比度模式支持 */
  @media (prefers-contrast: high) {
    .cloze-segment.hidden {
      background: var(--weave-warning);
      color: var(--weave-text-inverse);
      border: 2px solid var(--weave-text-primary);
    }

    .cloze-segment.revealed {
      background: var(--weave-success);
      color: var(--weave-text-inverse);
      border: 2px solid var(--weave-text-primary);
    }
  }

  /* 减少动画模式支持 */
  @media (prefers-reduced-motion: reduce) {
    .cloze-segment {
      transition: none;
    }

    .cloze-segment.interactive:hover {
      transform: none;
    }

    .cloze-segment.animating {
      animation: none;
    }

    .cloze-content::before {
      animation: none;
    }
  }

  /* 打印样式 */
  @media print {
    .cloze-segment {
      background: none !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    .cloze-segment.hidden .cloze-placeholder {
      display: none;
    }

    .cloze-segment.hidden::after {
      content: '[答案已隐藏]';
      font-style: italic;
      color: var(--weave-text-muted);
    }
  }

  /* 移动端优化 */
  @media (max-width: 768px) {
    .cloze-segment {
      padding: 4px 10px;
      margin: 2px;
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      touch-action: manipulation;
    }

    .cloze-segment.hovering.hidden::after {
      display: none; /* 移动端不显示悬停提示 */
    }
  }

  /* 深色主题优化 */
  @media (prefers-color-scheme: dark) {
    .cloze-segment.hidden {
      background: linear-gradient(
        135deg,
        rgba(245, 158, 11, 0.2) 0%,
        rgba(245, 158, 11, 0.1) 100%
      );
      border-color: rgba(245, 158, 11, 0.5);
    }

    .cloze-segment.revealed {
      background: linear-gradient(
        135deg,
        rgba(16, 185, 129, 0.2) 0%,
        rgba(16, 185, 129, 0.1) 100%
      );
      border-color: rgba(16, 185, 129, 0.5);
    }
  }
</style>
