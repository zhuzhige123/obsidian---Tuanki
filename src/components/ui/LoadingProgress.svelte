<!--
  加载进度模态窗组件
  居中显示，提供加载反馈
-->
<script lang="ts">
  import OperationProgressCard from './OperationProgressCard.svelte';

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
  const normalizedPercent = $derived(
    isIndeterminate ? 0 : Math.max(0, Math.min(100, Math.round(progress || 0)))
  );
</script>

{#if visible}
  <div class="loading-overlay">
    <div class="loading-modal">
      <OperationProgressCard
        title={message}
        message={subMessage || ''}
        percent={normalizedPercent}
        status="running"
        statusLabel="进行中"
        centered={true}
        showProgressBar={!isIndeterminate}
        footerPrimary={!isIndeterminate ? `${normalizedPercent}%` : ''}
        progressValueMin={0}
        progressValueMax={100}
        progressValueNow={normalizedPercent}
        progressValueText={!isIndeterminate ? `${normalizedPercent}%` : '加载中'}
      />
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
    z-index: var(--weave-z-loading);
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
    min-width: min(320px, 86vw);
    max-width: min(480px, 92vw);
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

  /* 响应式 */
  @media (max-width: 768px) {
    .loading-modal {
      min-width: 280px;
    }
  }
</style>
