<!--
  加载进度模态窗组件
  居中显示，提供加载反馈
-->
<script lang="ts">
  interface Props {
    visible?: boolean;
    progress?: number; // 0-100，如果不提供则显示无限循环动画
    message?: string;
    subMessage?: string;
  }

  let {
    visible = false,
    progress,
    message = '加载中...',
    subMessage
  }: Props = $props();

  const isIndeterminate = $derived(progress === undefined);
</script>

{#if visible}
  <!-- 遮罩层 -->
  <div class="loading-overlay">
    <!-- 居中模态窗 -->
    <div class="loading-modal">
      <!-- 加载图标 -->
      <div class="loading-spinner">
        <div class="spinner-circle"></div>
      </div>
      
      <!-- 主消息 -->
      <div class="loading-message">{message}</div>
      
      <!-- 副消息 -->
      {#if subMessage}
        <div class="loading-sub-message">{subMessage}</div>
      {/if}
      
      <!-- 进度条 -->
      <div class="progress-bar">
        {#if isIndeterminate}
          <!-- 无限循环动画 -->
          <div class="progress-fill indeterminate"></div>
        {:else}
          <!-- 确定进度 -->
          <div class="progress-fill" style="width: {progress}%"></div>
        {/if}
      </div>
      
      <!-- 进度百分比 -->
      {#if !isIndeterminate}
        <div class="progress-percentage">{Math.round(progress || 0)}%</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .loading-modal {
    background: var(--background-primary);
    border-radius: var(--tuanki-radius-xl, 16px);
    padding: var(--tuanki-space-xl, 32px);
    min-width: 320px;
    max-width: 480px;
    box-shadow: 
      0 20px 60px rgba(0, 0, 0, 0.3),
      0 0 0 1px var(--tuanki-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--tuanki-space-md, 16px);
    animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  
  @keyframes scaleIn {
    from {
      transform: scale(0.8);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .loading-spinner {
    width: 48px;
    height: 48px;
    position: relative;
  }

  .spinner-circle {
    width: 100%;
    height: 100%;
    border: 3px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-message {
    font-size: var(--tuanki-font-size-lg, 16px);
    font-weight: 600;
    color: var(--tuanki-text-primary, var(--text-normal));
    text-align: center;
  }

  .loading-sub-message {
    font-size: var(--tuanki-font-size-sm, 13px);
    color: var(--tuanki-text-secondary, var(--text-muted));
    text-align: center;
    margin-top: -8px;
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    background: var(--background-modifier-border);
    border-radius: 3px;
    overflow: hidden;
    position: relative;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--interactive-accent),
      var(--interactive-accent-hover)
    );
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-fill.indeterminate {
    width: 40%;
    animation: indeterminate 1.5s ease-in-out infinite;
  }

  @keyframes indeterminate {
    0% {
      transform: translateX(-100%);
    }
    50% {
      transform: translateX(250%);
    }
    100% {
      transform: translateX(-100%);
    }
  }

  .progress-percentage {
    font-size: var(--tuanki-font-size-sm, 13px);
    font-weight: 600;
    color: var(--interactive-accent);
    font-variant-numeric: tabular-nums;
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .loading-modal {
      min-width: 280px;
      padding: var(--tuanki-space-lg, 24px);
    }

    .loading-message {
      font-size: var(--tuanki-font-size-base, 14px);
    }

    .loading-spinner {
      width: 40px;
      height: 40px;
    }
  }
</style>
