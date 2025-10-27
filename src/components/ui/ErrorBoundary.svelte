<!--
  错误边界组件
  提供优雅的错误处理和恢复机制
  增强版：支持 Svelte 5 + Obsidian API 兼容性
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { i18n } from '../../utils/i18n';
  import { DEFAULT_ANALYTICS_CONFIG } from '../../config/analytics-config';
  import EnhancedIcon from './EnhancedIcon.svelte';

  interface Props {
    fallback?: string;
    onError?: (error: Error, errorInfo: any) => void;
    showDetails?: boolean;
    allowRetry?: boolean;
    retryText?: string;
    className?: string;
    children?: any;
  }

  let {
    fallback = '',
    onError,
    showDetails = false,
    allowRetry = true,
    retryText,
    className = '',
    children
  }: Props = $props();

  // 错误状态
  let hasError = $state(false);
  let error = $state<Error | null>(null);
  let errorInfo = $state<any>(null);
  let retryCount = $state(0);
  let isRetrying = $state(false);

  const config = DEFAULT_ANALYTICS_CONFIG;
  const maxRetries = config.error.RECOVERY.AUTO_RETRY ? 3 : 0;

  // Svelte 5 + Obsidian 兼容性错误模式
  const COMPATIBILITY_ERROR_PATTERNS = [
    /isShown is not a function/,
    /hide is not a function/,
    /show is not a function/,
    /get\$1\(\.\.\.\)\.entries is not a function/,
    /Cannot read properties of undefined \(reading 'isShown'\)/,
    /effect_update_depth_exceeded/,
    /infinite_loop_guard/
  ];

  /**
   * 检查是否为兼容性错误
   */
  function isCompatibilityError(err: Error): boolean {
    const message = err.message || '';
    const stack = err.stack || '';

    return COMPATIBILITY_ERROR_PATTERNS.some(pattern =>
      pattern.test(message) || pattern.test(stack)
    );
  }

  /**
   * 处理兼容性错误
   */
  function handleCompatibilityError(err: Error, info?: any): void {
    console.warn('[兼容性错误] Svelte 5 + Obsidian API 兼容性问题:', err.message);

    // 使用 untrack 来避免响应式系统干扰
    untrack(() => {
      // 尝试清理可能的响应式状态问题
      try {
        // 强制垃圾回收（如果可用）
        if (typeof window !== 'undefined' && (window as any).gc) {
          (window as any).gc();
        }

        // 清理可能的事件监听器
        if (typeof document !== 'undefined') {
          const elements = document.querySelectorAll('[data-svelte-error]');
          elements.forEach(el => el.removeAttribute('data-svelte-error'));
        }
      } catch (cleanupError) {
        console.warn('清理过程中出现错误:', cleanupError);
      }
    });
  }

  /**
   * 捕获错误
   */
  function captureError(err: Error, info?: any): void {
    // 检查是否为兼容性错误
    if (isCompatibilityError(err)) {
      handleCompatibilityError(err, info);

      // 对于兼容性错误，我们尝试优雅降级而不是完全失败
      console.warn('[ErrorBoundary] 兼容性错误已处理，继续运行');
      return;
    }

    hasError = true;
    error = err;
    errorInfo = info;

    // 记录错误
    console.error('ErrorBoundary caught an error:', err, info);

    // 调用错误回调
    if (onError) {
      try {
        onError(err, info);
      } catch (callbackError) {
        console.error('Error in onError callback:', callbackError);
      }
    }
  }

  /**
   * 重试操作
   */
  async function retry(): Promise<void> {
    if (retryCount >= maxRetries) {
      console.warn('Maximum retry attempts reached');
      return;
    }

    isRetrying = true;
    retryCount++;

    try {
      // 等待一段时间后重试
      const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));

      // 重置错误状态
      hasError = false;
      error = null;
      errorInfo = null;
    } catch (retryError) {
      console.error('Error during retry:', retryError);
      captureError(retryError as Error, { context: 'retry' });
    } finally {
      isRetrying = false;
    }
  }

  /**
   * 重置错误状态
   */
  function reset(): void {
    hasError = false;
    error = null;
    errorInfo = null;
    retryCount = 0;
    isRetrying = false;
  }

  /**
   * 全局错误监听器
   */
  function setupGlobalErrorHandling(): (() => void) {
    // 监听未捕获的错误
    const handleGlobalError = (event: ErrorEvent) => {
      const error = event.error || new Error(event.message);
      if (isCompatibilityError(error)) {
        event.preventDefault(); // 阻止默认错误处理
        handleCompatibilityError(error, {
          source: 'global',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      }
    };

    // 监听未处理的 Promise 拒绝
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      if (isCompatibilityError(error)) {
        event.preventDefault(); // 阻止默认处理
        handleCompatibilityError(error, { source: 'promise' });
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('error', handleGlobalError);
      window.addEventListener('unhandledrejection', handleUnhandledRejection);

      // 清理函数
      return () => {
        window.removeEventListener('error', handleGlobalError);
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      };
    }

    return () => {}; // 空清理函数
  }

  // 生命周期管理
  let cleanup: (() => void) | null = null;

  onMount(() => {
    // 设置全局错误处理
    cleanup = setupGlobalErrorHandling();

    return () => {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    };
  });

  /**
   * 格式化错误信息
   */
  function formatError(err: Error | null): string {
    if (!err) return i18n.t('common.error');

    // 根据错误类型提供友好的错误信息
    if (err.name === 'NetworkError' || err.message.includes('fetch')) {
      return i18n.t('analytics.errors.networkError');
    }

    if (err.message.includes('数据') || err.message.includes('data')) {
      return i18n.t('analytics.errors.dataCorrupted');
    }

    if (err.message.includes('计算') || err.message.includes('calculation')) {
      return i18n.t('analytics.errors.calculationError');
    }

    return err.message || i18n.t('common.error');
  }

  /**
   * 获取错误建议
   */
  function getErrorSuggestions(err: Error | null): string[] {
    const suggestions: string[] = [];

    if (!err) {
      suggestions.push('刷新页面');
      suggestions.push('联系技术支持');
      return suggestions;
    }

    if (err.name === 'NetworkError') {
      suggestions.push('检查网络连接');
      suggestions.push('稍后重试');
    } else if (err.message.includes('数据')) {
      suggestions.push('检查数据完整性');
      suggestions.push('重新加载数据');
    } else {
      suggestions.push('刷新页面');
      suggestions.push('联系技术支持');
    }

    return suggestions;
  }

  // 全局错误处理
  onMount(() => {
    const handleUnhandledError = (event: ErrorEvent) => {
      captureError(new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error 
        ? event.reason 
        : new Error(String(event.reason));
      
      captureError(error, { context: 'unhandled_promise_rejection' });
    };

    window.addEventListener('error', handleUnhandledError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleUnhandledError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  });
</script>

{#if hasError}
  <div class="error-boundary {className}">
    <div class="error-content">
      <!-- 错误图标 -->
      <div class="error-icon">
        <EnhancedIcon name="alert-triangle" size="48" />
      </div>

      <!-- 错误标题 -->
      <h2 class="error-title">
        {i18n.t('common.error')}
      </h2>

      <!-- 错误描述 -->
      <p class="error-message">
        {formatError(error)}
      </p>

      <!-- 错误详情 -->
      {#if showDetails && error}
        <details class="error-details">
          <summary>技术详情</summary>
          <div class="error-stack">
            <strong>错误类型:</strong> {error.name}<br>
            <strong>错误信息:</strong> {error.message}<br>
            {#if error.stack}
              <strong>堆栈跟踪:</strong>
              <pre>{error.stack}</pre>
            {/if}
            {#if errorInfo}
              <strong>附加信息:</strong>
              <pre>{JSON.stringify(errorInfo, null, 2)}</pre>
            {/if}
          </div>
        </details>
      {/if}

      <!-- 错误建议 -->
      <div class="error-suggestions">
        <h4>建议解决方案:</h4>
        <ul>
          {#each getErrorSuggestions(error) as suggestion}
            <li>{suggestion}</li>
          {/each}
        </ul>
      </div>

      <!-- 操作按钮 -->
      <div class="error-actions">
        {#if allowRetry && retryCount < maxRetries}
          <button 
            class="btn btn-primary" 
            onclick={retry}
            disabled={isRetrying}
          >
            {#if isRetrying}
              <EnhancedIcon name="loader" size="16" />
              重试中...
            {:else}
              <EnhancedIcon name="refresh-cw" size="16" />
              {retryText || i18n.t('common.retry')} ({retryCount}/{maxRetries})
            {/if}
          </button>
        {/if}

        <button class="btn btn-secondary" onclick={reset}>
          <EnhancedIcon name="x" size="16" />
          重置
        </button>

        <button class="btn btn-secondary" onclick={() => window.location.reload()}>
          <EnhancedIcon name="refresh-ccw" size="16" />
          刷新页面
        </button>
      </div>

      <!-- 降级内容 -->
      {#if fallback}
        <div class="fallback-content">
          {@html fallback}
        </div>
      {/if}
    </div>
  </div>
{:else}
  {@render children?.()}
{/if}

<style>
  .error-boundary {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    padding: 2rem;
    background: var(--background-primary);
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
  }

  .error-content {
    text-align: center;
    max-width: 600px;
    width: 100%;
  }

  .error-icon {
    margin-bottom: 1rem;
    color: var(--text-error);
  }

  .error-title {
    margin: 0 0 1rem 0;
    color: var(--text-error);
    font-size: 1.5rem;
    font-weight: 600;
  }

  .error-message {
    margin: 0 0 1.5rem 0;
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1.5;
  }

  .error-details {
    margin: 1.5rem 0;
    text-align: left;
    background: var(--background-secondary);
    border-radius: 4px;
    padding: 1rem;
  }

  .error-details summary {
    cursor: pointer;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .error-stack {
    font-family: var(--font-monospace);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .error-stack pre {
    margin: 0.5rem 0;
    padding: 0.5rem;
    background: var(--background-primary);
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
  }

  .error-suggestions {
    margin: 1.5rem 0;
    text-align: left;
  }

  .error-suggestions h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 500;
  }

  .error-suggestions ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .error-suggestions li {
    margin: 0.25rem 0;
    color: var(--text-muted);
  }

  .error-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
    margin: 1.5rem 0;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn:hover {
    background: var(--background-modifier-hover);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }

  .btn-secondary {
    background: var(--background-secondary);
    color: var(--text-normal);
  }

  .fallback-content {
    margin-top: 2rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
  }
</style>
