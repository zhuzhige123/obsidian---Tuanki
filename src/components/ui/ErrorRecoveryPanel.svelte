<script lang="ts">
  // 错误恢复面板组件
  import { onMount, onDestroy } from 'svelte';
  import { 
    errorRecoveryService, 
    ErrorType, 
    ErrorSeverity, 
    type ErrorInfo, 
    type RecoveryAction 
  } from '../../services/ui/error-recovery-service';

  // 组件属性
  interface Props {
    showStats?: boolean;
    compact?: boolean;
    autoHide?: boolean;
  }

  let {
    showStats = true,
    compact = false,
    autoHide = true
  }: Props = $props();

  // 响应式状态
  let activeErrors = $state<Map<string, ErrorInfo>>(new Map());
  let errorStats = $state({
    totalErrors: 0,
    resolvedErrors: 0,
    criticalErrors: 0,
    errorsByType: {} as Record<ErrorType, number>,
    averageResolutionTime: 0,
    successRate: 100
  });
  let isRecovering = $state(false);
  let selectedError = $state<string | null>(null);
  let showDetails = $state(false);

  // 订阅状态
  let unsubscribeErrors: (() => void) | null = null;
  let unsubscribeStats: (() => void) | null = null;
  let unsubscribeRecovering: (() => void) | null = null;

  // 计算属性
  const hasErrors = $derived(activeErrors.size > 0);
  const criticalErrorsArray = $derived(
    Array.from(activeErrors.values()).filter(e => e.severity === ErrorSeverity.CRITICAL)
  );
  const sortedErrors = $derived(
    Array.from(activeErrors.values()).sort((a, b) => {
      // 按严重程度和时间排序
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aSeverity = severityOrder[a.severity] || 0;
      const bSeverity = severityOrder[b.severity] || 0;
      
      if (aSeverity !== bSeverity) {
        return bSeverity - aSeverity;
      }
      
      return b.timestamp - a.timestamp;
    })
  );

  onMount(() => {
    // 订阅错误状态
    unsubscribeErrors = errorRecoveryService.activeErrors.subscribe(errors => {
      activeErrors = errors;
    });

    unsubscribeStats = errorRecoveryService.errorStats.subscribe(stats => {
      errorStats = stats;
    });

    unsubscribeRecovering = errorRecoveryService.isRecovering.subscribe(recovering => {
      isRecovering = recovering;
    });
  });

  onDestroy(() => {
    unsubscribeErrors?.();
    unsubscribeStats?.();
    unsubscribeRecovering?.();
  });

  // 方法
  async function triggerRecovery(errorId: string, actionId?: string) {
    try {
      const success = await errorRecoveryService.triggerRecovery(errorId, actionId);
      if (success) {
        console.log('恢复操作成功');
      } else {
        console.warn('恢复操作失败');
      }
    } catch (error) {
      console.error('恢复操作异常:', error);
    }
  }

  function resolveError(errorId: string) {
    errorRecoveryService.resolveError(errorId);
  }

  function ignoreError(errorId: string) {
    errorRecoveryService.ignoreError(errorId);
  }

  function selectError(errorId: string) {
    selectedError = selectedError === errorId ? null : errorId;
    showDetails = selectedError !== null;
  }

  function getErrorIcon(type: ErrorType): string {
    const icons = {
      [ErrorType.NETWORK]: '🌐',
      [ErrorType.PERMISSION]: '🔐',
      [ErrorType.DATA_CORRUPTION]: '💾',
      [ErrorType.TEMPLATE_ERROR]: '📝',
      [ErrorType.SYNC_CONFLICT]: '🔀',
      [ErrorType.MEMORY_LIMIT]: '🧠',
      [ErrorType.UNKNOWN]: '❓'
    };
    return icons[type] || '❓';
  }

  function getSeverityColor(severity: ErrorSeverity): string {
    const colors = {
      [ErrorSeverity.LOW]: 'var(--text-muted)',
      [ErrorSeverity.MEDIUM]: 'var(--text-warning)',
      [ErrorSeverity.HIGH]: 'var(--text-error)',
      [ErrorSeverity.CRITICAL]: 'var(--text-error)'
    };
    return colors[severity] || 'var(--text-muted)';
  }

  function formatTimestamp(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  }

  function cleanupErrors() {
    errorRecoveryService.cleanupResolvedErrors();
  }
</script>

{#if hasErrors || !autoHide}
  <div class="error-recovery-panel" class:compact class:has-errors={hasErrors}>
    <!-- 面板标题 -->
    <div class="panel-header">
      <div class="header-info">
        <h3>
          {#if criticalErrorsArray.length > 0}
            🚨 严重错误
          {:else if hasErrors}
            ⚠️ 错误处理
          {:else}
            ✅ 系统正常
          {/if}
        </h3>
        {#if hasErrors}
          <span class="error-count">{activeErrors.size} 个活跃错误</span>
        {/if}
      </div>
      
      {#if hasErrors}
        <div class="header-actions">
          <button class="cleanup-btn" onclick={cleanupErrors}>
            🧹 清理
          </button>
        </div>
      {/if}
    </div>

    <!-- 错误统计 -->
    {#if showStats && !compact}
      <div class="error-stats">
        <div class="stat-item">
          <span class="stat-label">总错误</span>
          <span class="stat-value">{errorStats.totalErrors}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">已解决</span>
          <span class="stat-value success">{errorStats.resolvedErrors}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">成功率</span>
          <span class="stat-value">{errorStats.successRate.toFixed(1)}%</span>
        </div>
      </div>
    {/if}

    <!-- 错误列表 -->
    {#if hasErrors}
      <div class="error-list">
        {#each sortedErrors as error (error.id)}
          <div 
            class="error-item"
            class:critical={error.severity === ErrorSeverity.CRITICAL}
            class:selected={selectedError === error.id}
            onclick={() => selectError(error.id)}
          >
            <div class="error-main">
              <div class="error-icon" style="color: {getSeverityColor(error.severity)}">
                {getErrorIcon(error.type)}
              </div>
              
              <div class="error-content">
                <div class="error-message">{error.message}</div>
                <div class="error-meta">
                  <span class="error-type">{error.type}</span>
                  <span class="error-time">{formatTimestamp(error.timestamp)}</span>
                  {#if error.retryCount > 0}
                    <span class="retry-count">重试 {error.retryCount}/{error.maxRetries}</span>
                  {/if}
                </div>
              </div>

              <div class="error-actions">
                {#if isRecovering}
                  <div class="spinner"></div>
                {:else}
                  <button 
                    class="action-btn primary"
                    onclick|stopPropagation={() => triggerRecovery(error.id)}
                  >
                    🔄 恢复
                  </button>
                  <button 
                    class="action-btn secondary"
                    onclick|stopPropagation={() => resolveError(error.id)}
                  >
                    ✅ 解决
                  </button>
                  <button 
                    class="action-btn tertiary"
                    onclick|stopPropagation={() => ignoreError(error.id)}
                  >
                    🔇 忽略
                  </button>
                {/if}
              </div>
            </div>

            <!-- 错误详情 -->
            {#if selectedError === error.id && showDetails}
              <div class="error-details">
                {#if error.details}
                  <div class="detail-section">
                    <h5>详细信息</h5>
                    <p>{error.details}</p>
                  </div>
                {/if}

                {#if error.context}
                  <div class="detail-section">
                    <h5>上下文</h5>
                    <pre>{JSON.stringify(error.context, null, 2)}</pre>
                  </div>
                {/if}

                <!-- 恢复操作 -->
                <div class="recovery-actions">
                  <h5>恢复操作</h5>
                  {#each errorRecoveryService.getRecoveryActions(error.id) as action}
                    <button 
                      class="recovery-action"
                      onclick={() => triggerRecovery(error.id, action.id)}
                      disabled={isRecovering}
                    >
                      <span class="action-icon">{action.icon}</span>
                      <div class="action-info">
                        <div class="action-name">{action.name}</div>
                        <div class="action-desc">{action.description}</div>
                      </div>
                      {#if action.automatic}
                        <span class="auto-badge">自动</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="no-errors">
        <div class="no-errors-icon">✨</div>
        <p>系统运行正常，没有检测到错误</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .error-recovery-panel {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    margin: 1rem 0;
    overflow: hidden;
  }

  .error-recovery-panel.compact {
    margin: 0.5rem 0;
  }

  .error-recovery-panel.has-errors {
    border-color: var(--text-warning);
    box-shadow: 0 2px 8px rgba(255, 193, 7, 0.1);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .header-info h3 {
    margin: 0 0 0.25rem 0;
    color: var(--text-normal);
    font-size: 1.1rem;
  }

  .error-count {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .cleanup-btn {
    padding: 0.5rem 1rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .error-stats {
    display: flex;
    gap: 2rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .stat-value {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .stat-value.success {
    color: var(--text-success);
  }

  .error-list {
    max-height: 400px;
    overflow-y: auto;
  }

  .error-item {
    border-bottom: 1px solid var(--background-modifier-border);
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .error-item:hover {
    background: var(--background-modifier-hover);
  }

  .error-item.selected {
    background: var(--background-modifier-active-hover);
  }

  .error-item.critical {
    border-left: 4px solid var(--text-error);
    background: color-mix(in srgb, var(--text-error) 5%, var(--background-primary));
  }

  .error-main {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
  }

  .error-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .error-content {
    flex: 1;
    min-width: 0;
  }

  .error-message {
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
  }

  .error-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .retry-count {
    color: var(--text-warning);
  }

  .error-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .action-btn {
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn.primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .action-btn.secondary {
    background: var(--text-success);
    color: white;
  }

  .action-btn.tertiary {
    background: var(--background-secondary);
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--background-modifier-border);
    border-top: 2px solid var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-details {
    padding: 1rem;
    background: var(--background-secondary);
    border-top: 1px solid var(--background-modifier-border);
  }

  .detail-section {
    margin-bottom: 1rem;
  }

  .detail-section h5 {
    margin: 0 0 0.5rem 0;
    color: var(--text-normal);
    font-size: 0.9rem;
  }

  .detail-section p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .detail-section pre {
    background: var(--background-primary);
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.75rem;
    overflow-x: auto;
    margin: 0;
  }

  .recovery-actions {
    margin-top: 1rem;
  }

  .recovery-action {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    margin-bottom: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .recovery-action:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .recovery-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-icon {
    font-size: 1.2rem;
  }

  .action-info {
    flex: 1;
    text-align: left;
  }

  .action-name {
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
  }

  .action-desc {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .auto-badge {
    background: var(--text-accent);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .no-errors {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
  }

  .no-errors-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .error-main {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .error-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .error-stats {
      flex-direction: column;
      gap: 1rem;
    }

    .stat-item {
      flex-direction: row;
      justify-content: space-between;
    }
  }
</style>
