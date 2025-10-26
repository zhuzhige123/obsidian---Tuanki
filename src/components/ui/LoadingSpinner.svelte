<!--
  加载状态组件
  提供各种样式的加载指示器
-->

<script lang="ts">
  // Props
  let {
    size = 'medium',
    variant = 'spinner',
    color = 'var(--tuanki-primary-600)',
    text = '',
    overlay = false,
    fullscreen = false
  }: {
    size?: 'small' | 'medium' | 'large';
    variant?: 'spinner' | 'dots' | 'pulse' | 'bars';
    color?: string;
    text?: string;
    overlay?: boolean;
    fullscreen?: boolean;
  } = $props();

  // 计算样式
  let sizeClass = $derived(`size-${size}`);
  let variantClass = $derived(`variant-${variant}`);
</script>

{#if overlay || fullscreen}
  <div class="loading-overlay" class:fullscreen>
    <div class="loading-content">
      <div class="spinner-container {sizeClass} {variantClass}" style="--spinner-color: {color}">
        {#if variant === 'spinner'}
          <div class="spinner"></div>
        {:else if variant === 'dots'}
          <div class="dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
        {:else if variant === 'pulse'}
          <div class="pulse"></div>
        {:else if variant === 'bars'}
          <div class="bars">
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
          </div>
        {/if}
      </div>
      {#if text}
        <div class="loading-text">{text}</div>
      {/if}
    </div>
  </div>
{:else}
  <div class="spinner-container {sizeClass} {variantClass}" style="--spinner-color: {color}">
    {#if variant === 'spinner'}
      <div class="spinner"></div>
    {:else if variant === 'dots'}
      <div class="dots">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    {:else if variant === 'pulse'}
      <div class="pulse"></div>
    {:else if variant === 'bars'}
      <div class="bars">
        <div class="bar"></div>
        <div class="bar"></div>
        <div class="bar"></div>
        <div class="bar"></div>
      </div>
    {/if}
    {#if text}
      <div class="loading-text">{text}</div>
    {/if}
  </div>
{/if}

<style>
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    backdrop-filter: blur(2px);
  }

  .loading-overlay.fullscreen {
    position: fixed;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.7);
  }

  .loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .spinner-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .loading-text {
    color: var(--text-normal);
    font-size: 0.9rem;
    font-weight: 500;
    text-align: center;
  }

  /* 尺寸变体 */
  .size-small {
    --spinner-size: 16px;
    --dot-size: 4px;
    --bar-width: 2px;
    --bar-height: 12px;
  }

  .size-medium {
    --spinner-size: 24px;
    --dot-size: 6px;
    --bar-width: 3px;
    --bar-height: 18px;
  }

  .size-large {
    --spinner-size: 32px;
    --dot-size: 8px;
    --bar-width: 4px;
    --bar-height: 24px;
  }

  /* 旋转加载器 */
  .variant-spinner .spinner {
    width: var(--spinner-size);
    height: var(--spinner-size);
    border: 2px solid rgba(0, 0, 0, 0.1);
    border-left-color: var(--spinner-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* 点状加载器 */
  .variant-dots .dots {
    display: flex;
    gap: 4px;
  }

  .variant-dots .dot {
    width: var(--dot-size);
    height: var(--dot-size);
    background: var(--spinner-color);
    border-radius: 50%;
    animation: bounce 1.4s ease-in-out infinite both;
  }

  .variant-dots .dot:nth-child(1) {
    animation-delay: -0.32s;
  }

  .variant-dots .dot:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes bounce {
    0%, 80%, 100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }

  /* 脉冲加载器 */
  .variant-pulse .pulse {
    width: var(--spinner-size);
    height: var(--spinner-size);
    background: var(--spinner-color);
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(0);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 0;
    }
  }

  /* 条状加载器 */
  .variant-bars .bars {
    display: flex;
    gap: 2px;
    align-items: end;
  }

  .variant-bars .bar {
    width: var(--bar-width);
    height: var(--bar-height);
    background: var(--spinner-color);
    animation: bars 1.2s ease-in-out infinite;
  }

  .variant-bars .bar:nth-child(1) {
    animation-delay: -1.1s;
  }

  .variant-bars .bar:nth-child(2) {
    animation-delay: -1.0s;
  }

  .variant-bars .bar:nth-child(3) {
    animation-delay: -0.9s;
  }

  .variant-bars .bar:nth-child(4) {
    animation-delay: -0.8s;
  }

  @keyframes bars {
    0%, 40%, 100% {
      transform: scaleY(0.4);
    }
    20% {
      transform: scaleY(1);
    }
  }

  /* 深色主题适配 */
  .theme-dark .loading-overlay {
    background: rgba(0, 0, 0, 0.9);
  }

  .theme-dark .loading-text {
    color: var(--text-normal);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .loading-overlay.fullscreen .loading-content {
      padding: 2rem;
    }

    .loading-text {
      font-size: 0.8rem;
    }
  }

  /* 无障碍支持 */
  @media (prefers-reduced-motion: reduce) {
    .spinner,
    .dot,
    .pulse,
    .bar {
      animation-duration: 2s;
    }
  }

  /* 高对比度模式 */
  @media (prefers-contrast: high) {
    .loading-overlay {
      background: rgba(255, 255, 255, 0.95);
    }

    .theme-dark .loading-overlay {
      background: rgba(0, 0, 0, 0.95);
    }

    .spinner {
      border-width: 3px;
    }
  }
</style>
