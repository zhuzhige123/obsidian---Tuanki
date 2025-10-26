<!--
  Toast 容器组件
  管理和显示所有 Toast 通知
-->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Toast, { toastManager, type ToastInstance } from './Toast.svelte';

  // 状态
  let toasts = $state<ToastInstance[]>([]);
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    // 订阅 Toast 管理器
    unsubscribe = toastManager.subscribe((newToasts) => {
      toasts = newToasts;
    });
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  function handleToastClose(toastId: string) {
    toastManager.remove(toastId);
  }
</script>

<!-- Toast 容器 -->
<div class="toast-container">
  {#each toasts as toast (toast.id)}
    <div class="toast-wrapper">
      <Toast
        type={toast.type}
        title={toast.title}
        message={toast.message}
        duration={toast.duration}
        closable={toast.closable}
        actions={toast.actions}
        on:close={() => handleToastClose(toast.id)}
      />
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    pointer-events: none;
  }

  .toast-wrapper {
    pointer-events: auto;
    animation: slideInRight 0.3s ease-out;
  }

  .toast-wrapper:last-child {
    animation: slideInRight 0.3s ease-out;
  }

  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .toast-container {
      top: 0.5rem;
      right: 0.5rem;
      left: 0.5rem;
      align-items: center;
    }
  }

  /* 无障碍支持 */
  @media (prefers-reduced-motion: reduce) {
    .toast-wrapper {
      animation: none;
    }
  }
</style>
