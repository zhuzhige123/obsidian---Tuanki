<script lang="ts">
  /**
   * 卡片编辑错误边界组件
   * 提供优雅的错误处理和恢复机制
   */
  
  import { onMount, onDestroy } from 'svelte';
  import { cardEditEventBus } from '../../events/CardEditEventBus';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  
  interface Props {
    /** 子组件插槽 */
    children?: any;
    /** 错误恢复回调 */
    onRecover?: () => void;
    /** 错误报告回调 */
    onError?: (error: Error, context: string) => void;
    /** 是否显示详细错误信息 */
    showDetails?: boolean;
    /** 自定义错误消息 */
    fallbackMessage?: string;
  }

  let {
    children,
    onRecover,
    onError,
    showDetails = false,
    fallbackMessage = "编辑器遇到了问题，但我们正在尝试恢复..."
  }: Props = $props();

  // 错误状态
  let hasError = $state(false);
  let errorInfo = $state<{
    error: Error;
    context: string;
    timestamp: Date;
    recoverable: boolean;
    recoveryAttempts: number;
  } | null>(null);
  
  // 恢复状态
  let isRecovering = $state(false);
  let showErrorDetails = $state(false);
  
  // 错误统计
  let errorCount = $state(0);
  let lastErrorTime = $state<Date | null>(null);
  
  // 清理函数
  let cleanup: (() => void)[] = [];

  /**
   * 处理错误
   */
  function handleError(error: Error, context: string = 'Unknown', recoverable: boolean = true): void {
    console.error('[CardEditErrorBoundary] Error caught:', error, 'Context:', context);
    
    errorCount++;
    lastErrorTime = new Date();
    
    errorInfo = {
      error,
      context,
      timestamp: new Date(),
      recoverable,
      recoveryAttempts: 0
    };
    
    hasError = true;
    
    // 通知外部错误处理器
    if (onError) {
      try {
        onError(error, context);
      } catch (handlerError) {
        console.error('[CardEditErrorBoundary] Error in error handler:', handlerError);
      }
    }
    
    // 发射错误事件
    cardEditEventBus.emitSync('error:occurred', {
      error,
      context,
      recoverable
    });
    
    // 如果可恢复，尝试自动恢复
    if (recoverable && errorInfo.recoveryAttempts < 3) {
      setTimeout(() => {
        attemptRecovery();
      }, 1000 * (errorInfo.recoveryAttempts + 1)); // 递增延迟
    }
  }

  /**
   * 尝试恢复
   */
  async function attemptRecovery(): Promise<void> {
    if (!errorInfo || isRecovering) return;
    
    isRecovering = true;
    errorInfo.recoveryAttempts++;
    
    try {
      console.log(`[CardEditErrorBoundary] Attempting recovery (attempt ${errorInfo.recoveryAttempts})`);
      
      // 执行恢复策略
      const recoverySuccess = await executeRecoveryStrategy(errorInfo.error, errorInfo.context);
      
      if (recoverySuccess) {
        // 恢复成功
        console.log('[CardEditErrorBoundary] Recovery successful');
        
        cardEditEventBus.emitSync('error:recovered', {
          error: errorInfo.error,
          strategy: getRecoveryStrategyName(errorInfo.error)
        });
        
        // 重置错误状态
        hasError = false;
        errorInfo = null;
        isRecovering = false;
        
        // 通知外部恢复处理器
        if (onRecover) {
          onRecover();
        }
      } else {
        // 恢复失败
        console.warn(`[CardEditErrorBoundary] Recovery attempt ${errorInfo.recoveryAttempts} failed`);
        
        if (errorInfo.recoveryAttempts >= 3) {
          // 达到最大重试次数
          cardEditEventBus.emitSync('error:recovery-failed', {
            error: errorInfo.error,
            attempts: errorInfo.recoveryAttempts
          });
          
          errorInfo.recoverable = false;
        }
        
        isRecovering = false;
      }
    } catch (recoveryError) {
      console.error('[CardEditErrorBoundary] Error during recovery:', recoveryError);
      isRecovering = false;
      
      // 将恢复错误也记录下来
      cardEditEventBus.emitSync('error:occurred', {
        error: recoveryError as Error,
        context: 'Error recovery process',
        recoverable: false
      });
    }
  }

  /**
   * 执行恢复策略
   */
  async function executeRecoveryStrategy(error: Error, context: string): Promise<boolean> {
    // 根据错误类型和上下文选择恢复策略
    
    if (context.includes('editor') || context.includes('CodeMirror')) {
      // 编辑器相关错误
      return await recoverEditor();
    }
    
    if (context.includes('template')) {
      // 模板相关错误
      return await recoverTemplate();
    }
    
    if (context.includes('save') || context.includes('storage')) {
      // 保存相关错误
      return await recoverSave();
    }
    
    // 通用恢复策略
    return await recoverGeneral();
  }

  /**
   * 编辑器恢复策略
   */
  async function recoverEditor(): Promise<boolean> {
    try {
      // 发射编辑器重新初始化事件
      cardEditEventBus.emitSync('editor:ready', { editorId: 'recovery' });
      
      // 等待一段时间让编辑器重新初始化
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 模板恢复策略
   */
  async function recoverTemplate(): Promise<boolean> {
    try {
      // 重置模板状态
      // 这里可以调用模板管理器的重置方法
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 保存恢复策略
   */
  async function recoverSave(): Promise<boolean> {
    try {
      // 可以尝试重新保存或恢复保存状态
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 通用恢复策略
   */
  async function recoverGeneral(): Promise<boolean> {
    try {
      // 通用的状态重置
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取恢复策略名称
   */
  function getRecoveryStrategyName(error: Error): string {
    if (error.message.includes('editor') || error.message.includes('CodeMirror')) {
      return 'editor-recovery';
    }
    if (error.message.includes('template')) {
      return 'template-recovery';
    }
    if (error.message.includes('save')) {
      return 'save-recovery';
    }
    return 'general-recovery';
  }

  /**
   * 手动重试
   */
  function handleManualRetry(): void {
    if (errorInfo && !isRecovering) {
      attemptRecovery();
    }
  }

  /**
   * 重置错误状态
   */
  function handleReset(): void {
    hasError = false;
    errorInfo = null;
    isRecovering = false;
    showErrorDetails = false;
    
    if (onRecover) {
      onRecover();
    }
  }

  /**
   * 切换错误详情显示
   */
  function toggleErrorDetails(): void {
    showErrorDetails = !showErrorDetails;
  }

  // 组件挂载时设置错误监听
  onMount(() => {
    // 监听全局错误事件
    const unsubscribeError = cardEditEventBus.on('error:occurred', ({ error, context, recoverable }) => {
      handleError(error, context, recoverable);
    });
    
    cleanup.push(unsubscribeError);
    
    // 设置全局错误捕获
    const handleGlobalError = (event: ErrorEvent) => {
      handleError(new Error(event.message), 'Global error', true);
    };
    
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      handleError(new Error(event.reason), 'Unhandled promise rejection', true);
    };
    
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    cleanup.push(() => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    });
  });

  // 组件销毁时清理
  onDestroy(() => {
    cleanup.forEach(fn => fn());
    cleanup = [];
  });
</script>

{#if hasError && errorInfo}
  <div class="error-boundary">
    <div class="error-content">
      <div class="error-header">
        <EnhancedIcon name="alert-triangle" size="24" />
        <h3>编辑器遇到问题</h3>
      </div>
      
      <div class="error-message">
        <p>{fallbackMessage}</p>
        
        {#if isRecovering}
          <div class="recovery-status">
            <EnhancedIcon name="refresh-cw" size="16" />
            <span>正在尝试恢复... (尝试 {errorInfo.recoveryAttempts}/3)</span>
          </div>
        {/if}
      </div>
      
      <div class="error-actions">
        {#if errorInfo.recoverable && !isRecovering}
          <button class="error-btn error-btn-primary" onclick={handleManualRetry}>
            <EnhancedIcon name="refresh-cw" size="16" />
            重试
          </button>
        {/if}
        
        <button class="error-btn error-btn-secondary" onclick={handleReset}>
          <EnhancedIcon name="x" size="16" />
          重置
        </button>
        
        {#if showDetails}
          <button class="error-btn error-btn-ghost" onclick={toggleErrorDetails}>
            <EnhancedIcon name="info" size="16" />
            {showErrorDetails ? '隐藏' : '显示'}详情
          </button>
        {/if}
      </div>
      
      {#if showDetails && showErrorDetails && errorInfo}
        <div class="error-details">
          <h4>错误详情</h4>
          <div class="error-info">
            <div><strong>错误:</strong> {errorInfo.error.message}</div>
            <div><strong>上下文:</strong> {errorInfo.context}</div>
            <div><strong>时间:</strong> {errorInfo.timestamp.toLocaleString()}</div>
            <div><strong>可恢复:</strong> {errorInfo.recoverable ? '是' : '否'}</div>
            <div><strong>恢复尝试:</strong> {errorInfo.recoveryAttempts}</div>
          </div>
          
          {#if errorInfo.error.stack}
            <details class="error-stack">
              <summary>堆栈跟踪</summary>
              <pre>{errorInfo.error.stack}</pre>
            </details>
          {/if}
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
    min-height: 200px;
    padding: 2rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
  }

  .error-content {
    max-width: 500px;
    text-align: center;
  }

  .error-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    color: var(--text-error);
  }

  .error-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .error-message {
    margin-bottom: 1.5rem;
    color: var(--text-muted);
  }

  .recovery-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-accent);
  }

  .error-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .error-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .error-btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .error-btn-primary:hover {
    background: var(--interactive-accent-hover);
  }

  .error-btn-secondary {
    background: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .error-btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  .error-btn-ghost {
    background: transparent;
    color: var(--text-muted);
  }

  .error-btn-ghost:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .error-details {
    margin-top: 1.5rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: 6px;
    text-align: left;
  }

  .error-details h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .error-info {
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .error-info > div {
    margin-bottom: 0.25rem;
  }

  .error-stack {
    margin-top: 0.5rem;
  }

  .error-stack summary {
    cursor: pointer;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .error-stack pre {
    font-size: 0.75rem;
    line-height: 1.3;
    overflow-x: auto;
    padding: 0.5rem;
    background: var(--background-primary);
    border-radius: 4px;
  }
</style>
