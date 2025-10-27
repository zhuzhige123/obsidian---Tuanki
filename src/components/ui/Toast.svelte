<!--
  Toast 通知组件
  提供用户友好的通知消息
-->

<script lang="ts">
  import { onMount } from 'svelte';

  // Props
  interface Props {
    type?: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message?: string;
    duration?: number; // 0 表示不自动关闭
    closable?: boolean;
    actions?: Array<{ label: string; action: () => void }>;
    onclose?: () => void;
  }

  let {
    type = 'info',
    title = '',
    message = '',
    duration = 5000,
    closable = true,
    actions = [],
    onclose
  }: Props = $props();

  // 状态
  let visible = $state(true);
  let progressWidth = $state(100);

  // 自动关闭定时器
  let autoCloseTimer: NodeJS.Timeout | null = null;
  let progressTimer: NodeJS.Timeout | null = null;

  onMount(() => {
    if (duration > 0) {
      startAutoClose();
    }
  });

  function startAutoClose() {
    if (duration <= 0) return;

    // 进度条动画
    progressWidth = 0;
    progressTimer = setInterval(() => {
      progressWidth += (100 / duration) * 100;
      if (progressWidth >= 100) {
        clearInterval(progressTimer!);
      }
    }, 100);

    // 自动关闭
    autoCloseTimer = setTimeout(() => {
      close();
    }, duration);
  }

  function pauseAutoClose() {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function resumeAutoClose() {
    if (duration > 0 && !autoCloseTimer) {
      const remainingTime = duration * (1 - progressWidth / 100);
      if (remainingTime > 0) {
        autoCloseTimer = setTimeout(() => {
          close();
        }, remainingTime);

        progressTimer = setInterval(() => {
          progressWidth += (100 / remainingTime) * 100;
          if (progressWidth >= 100) {
            clearInterval(progressTimer!);
          }
        }, 100);
      }
    }
  }

  function close() {
    visible = false;
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
    }
    if (progressTimer) {
      clearInterval(progressTimer);
    }
    onclose?.();
  }

  function getIcon(type: string): string {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return 'ℹ️';
    }
  }
</script>

{#if visible}
  <div 
    class="toast toast-{type}"
    role="alert"
    aria-live="polite"
    onmouseenter={pauseAutoClose}
    onmouseleave={resumeAutoClose}
  >
    <!-- 进度条 -->
    {#if duration > 0}
      <div class="toast-progress">
        <div 
          class="toast-progress-bar" 
          style="width: {progressWidth}%"
        ></div>
      </div>
    {/if}

    <!-- 内容 -->
    <div class="toast-content">
      <!-- 图标 -->
      <div class="toast-icon">
        {getIcon(type)}
      </div>

      <!-- 文本内容 -->
      <div class="toast-text">
        {#if title}
          <div class="toast-title">{title}</div>
        {/if}
        {#if message}
          <div class="toast-message">{message}</div>
        {/if}
      </div>

      <!-- 操作按钮 -->
      {#if actions.length > 0}
        <div class="toast-actions">
          {#each actions as action}
            <button 
              type="button"
              class="toast-action-btn"
              onclick={action.action}
            >
              {action.label}
            </button>
          {/each}
        </div>
      {/if}

      <!-- 关闭按钮 -->
      {#if closable}
        <button 
          type="button"
          class="toast-close"
          onclick={close}
          aria-label="关闭通知"
        >
          ✕
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .toast {
    position: relative;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: var(--tuanki-shadow-lg);
    overflow: hidden;
    min-width: 300px;
    max-width: 500px;
    animation: slideIn 0.3s ease-out;
  }

  .toast-progress {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(0, 0, 0, 0.1);
  }

  .toast-progress-bar {
    height: 100%;
    background: var(--toast-color);
    transition: width 0.1s linear;
  }

  .toast-content {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    padding-top: calc(1rem + 3px); /* 为进度条留出空间 */
  }

  .toast-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .toast-text {
    flex: 1;
    min-width: 0;
  }

  .toast-title {
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
    font-size: 0.9rem;
  }

  .toast-message {
    color: var(--text-muted);
    font-size: 0.875rem;
    line-height: 1.4;
    word-wrap: break-word;
  }

  .toast-actions {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
    flex-shrink: 0;
  }

  .toast-action-btn {
    padding: 0.25rem 0.75rem;
    background: var(--toast-color);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toast-action-btn:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .toast-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.25rem;
    border-radius: 4px;
    transition: all 0.2s ease;
    flex-shrink: 0;
    margin-left: auto;
  }

  .toast-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  /* 类型样式 */
  .toast-success {
    --toast-color: var(--tuanki-success);
    border-left: 4px solid var(--tuanki-success);
  }

  .toast-error {
    --toast-color: var(--color-red);
    border-left: 4px solid var(--color-red);
  }

  .toast-warning {
    --toast-color: var(--color-orange);
    border-left: 4px solid var(--color-orange);
  }

  .toast-info {
    --toast-color: var(--tuanki-primary-600);
    border-left: 4px solid var(--tuanki-primary-600);
  }

  /* 动画 */
  @keyframes slideIn {
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
    .toast {
      min-width: 280px;
      max-width: calc(100vw - 2rem);
    }

    .toast-content {
      padding: 0.875rem;
      gap: 0.5rem;
    }

    .toast-title {
      font-size: 0.85rem;
    }

    .toast-message {
      font-size: 0.8rem;
    }

    .toast-actions {
      flex-direction: column;
      gap: 0.25rem;
    }

    .toast-action-btn {
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
    }
  }

  /* 无障碍支持 */
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }

    .toast-progress-bar {
      transition: none;
    }
  }

  /* 高对比度模式 */
  @media (prefers-contrast: high) {
    .toast {
      border-width: 2px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .toast-success {
      border-left-width: 6px;
    }

    .toast-error {
      border-left-width: 6px;
    }

    .toast-warning {
      border-left-width: 6px;
    }

    .toast-info {
      border-left-width: 6px;
    }
  }

  /* 深色主题适配 */
  .theme-dark .toast {
    background: var(--background-secondary);
    border-color: var(--background-modifier-border);
  }

  .theme-dark .toast-progress {
    background: rgba(255, 255, 255, 0.1);
  }
</style>

<script module lang="ts">
  // Toast 管理器
  export interface ToastOptions {
    type?: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
    duration?: number;
    closable?: boolean;
    actions?: Array<{ label: string; action: () => void }>;
  }

  export interface ToastInstance extends ToastOptions {
    id: string;
    timestamp: Date;
  }

  class ToastManager {
    private toasts: ToastInstance[] = [];
    private subscribers: ((toasts: ToastInstance[]) => void)[] = [];
    private maxToasts = 5;

    subscribe(callback: (toasts: ToastInstance[]) => void) {
      this.subscribers.push(callback);
      callback(this.toasts);

      return () => {
        const index = this.subscribers.indexOf(callback);
        if (index > -1) {
          this.subscribers.splice(index, 1);
        }
      };
    }

    private notify() {
      this.subscribers.forEach(callback => callback([...this.toasts]));
    }

    show(options: ToastOptions): string {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const toast: ToastInstance = {
        id,
        type: 'info',
        duration: 5000,
        closable: true,
        timestamp: new Date(),
        ...options
      };

      this.toasts.unshift(toast);

      // 限制最大数量
      if (this.toasts.length > this.maxToasts) {
        this.toasts = this.toasts.slice(0, this.maxToasts);
      }

      this.notify();
      return id;
    }

    success(message: string, options?: Partial<ToastOptions>): string {
      return this.show({ ...options, type: 'success', message });
    }

    error(message: string, options?: Partial<ToastOptions>): string {
      return this.show({ ...options, type: 'error', message });
    }

    warning(message: string, options?: Partial<ToastOptions>): string {
      return this.show({ ...options, type: 'warning', message });
    }

    info(message: string, options?: Partial<ToastOptions>): string {
      return this.show({ ...options, type: 'info', message });
    }

    remove(id: string) {
      const index = this.toasts.findIndex(toast => toast.id === id);
      if (index > -1) {
        this.toasts.splice(index, 1);
        this.notify();
      }
    }

    clear() {
      this.toasts = [];
      this.notify();
    }

    getToasts(): ToastInstance[] {
      return [...this.toasts];
    }
  }

  export const toastManager = new ToastManager();
</script>
