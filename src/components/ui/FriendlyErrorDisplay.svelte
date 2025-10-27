<script lang="ts">
  /**
   * 友好的错误显示组件
   * 提供用户友好的错误信息和操作指导
   */
  
  import { createEventDispatcher } from 'svelte';
  import EnhancedIcon from './EnhancedIcon.svelte';
  import EnhancedButton from './EnhancedButton.svelte';

  interface ErrorAction {
    label: string;
    action: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
    icon?: string;
  }

  interface ErrorSuggestion {
    title: string;
    description: string;
    action?: () => void;
    icon?: string;
  }

  interface Props {
    title?: string;
    message: string;
    type?: 'error' | 'warning' | 'info';
    showIcon?: boolean;
    dismissible?: boolean;
    actions?: ErrorAction[];
    suggestions?: ErrorSuggestion[];
    details?: string;
    showDetails?: boolean;
    compact?: boolean;
    persistent?: boolean;
  }

  let {
    title,
    message,
    type = 'error',
    showIcon = true,
    dismissible = true,
    actions = [],
    suggestions = [],
    details,
    showDetails = false,
    compact = false,
    persistent = false
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    dismiss: void;
    action: { action: ErrorAction };
    suggestion: { suggestion: ErrorSuggestion };
    toggleDetails: { expanded: boolean };
  }>();

  let isExpanded = $state(showDetails);
  let isDismissed = $state(false);

  // 获取图标
  function getIcon(): string {
    switch (type) {
      case 'error':
        return 'alert-circle';
      case 'warning':
        return 'alert-triangle';
      case 'info':
        return 'info';
      default:
        return 'alert-circle';
    }
  }

  // 获取友好的错误标题
  function getFriendlyTitle(): string {
    if (title) return title;
    
    switch (type) {
      case 'error':
        return '出现了问题';
      case 'warning':
        return '需要注意';
      case 'info':
        return '提示信息';
      default:
        return '出现了问题';
    }
  }

  // 处理关闭
  function handleDismiss() {
    if (!persistent) {
      isDismissed = true;
      dispatch('dismiss');
    }
  }

  // 处理动作点击
  function handleActionClick(action: ErrorAction) {
    action.action();
    dispatch('action', { action });
  }

  // 处理建议点击
  function handleSuggestionClick(suggestion: ErrorSuggestion) {
    if (suggestion.action) {
      suggestion.action();
      dispatch('suggestion', { suggestion });
    }
  }

  // 切换详情显示
  function toggleDetails() {
    isExpanded = !isExpanded;
    dispatch('toggleDetails', { expanded: isExpanded });
  }

  // 获取错误消息的友好版本
  function getFriendlyMessage(originalMessage: string): string {
    // 常见错误的友好化处理
    const friendlyMessages: Record<string, string> = {
      'Network Error': '网络连接失败，请检查您的网络连接后重试',
      'Permission denied': '权限不足，请检查文件访问权限',
      'File not found': '找不到指定的文件，请确认文件路径是否正确',
      'Invalid JSON': '数据格式错误，请检查文件内容是否正确',
      'Timeout': '操作超时，请稍后重试',
      'Out of memory': '内存不足，请关闭一些应用程序后重试'
    };

    // 检查是否有匹配的友好消息
    for (const [pattern, friendlyMsg] of Object.entries(friendlyMessages)) {
      if (originalMessage.toLowerCase().includes(pattern.toLowerCase())) {
        return friendlyMsg;
      }
    }

    return originalMessage;
  }

  // 生成智能建议
  function generateSmartSuggestions(errorMessage: string): ErrorSuggestion[] {
    const smartSuggestions: ErrorSuggestion[] = [];
    const lowerMessage = errorMessage.toLowerCase();

    if (lowerMessage.includes('network') || lowerMessage.includes('连接')) {
      smartSuggestions.push({
        title: '检查网络连接',
        description: '确保您的设备已连接到互联网',
        icon: 'wifi'
      });
    }

    if (lowerMessage.includes('permission') || lowerMessage.includes('权限')) {
      smartSuggestions.push({
        title: '检查文件权限',
        description: '确保应用有足够的权限访问文件',
        icon: 'shield'
      });
    }

    if (lowerMessage.includes('memory') || lowerMessage.includes('内存')) {
      smartSuggestions.push({
        title: '释放内存',
        description: '关闭一些不必要的应用程序',
        icon: 'cpu'
      });
    }

    if (lowerMessage.includes('timeout') || lowerMessage.includes('超时')) {
      smartSuggestions.push({
        title: '稍后重试',
        description: '等待一段时间后再次尝试操作',
        icon: 'clock'
      });
    }

    return smartSuggestions;
  }

  // 合并建议
  let allSuggestions = $derived([
    ...suggestions,
    ...generateSmartSuggestions(message)
  ]);

  let friendlyMessage = $derived(getFriendlyMessage(message));
</script>

{#if !isDismissed}
  <div 
    class="error-display error-display--{type}"
    class:error-display--compact={compact}
    class:error-display--dismissible={dismissible}
    role="alert"
    aria-live="polite"
  >
    <div class="error-content">
      <div class="error-header">
        {#if showIcon}
          <div class="error-icon">
            <EnhancedIcon name={getIcon()} size="20" />
          </div>
        {/if}

        <div class="error-text">
          <div class="error-title">{getFriendlyTitle()}</div>
          <div class="error-message">{friendlyMessage}</div>
        </div>

        {#if dismissible}
          <button
            type="button"
            class="error-dismiss"
            onclick={handleDismiss}
            aria-label="关闭"
          >
            <EnhancedIcon name="x" size="16" />
          </button>
        {/if}
      </div>

      {#if details && !compact}
        <div class="error-details-toggle">
          <button
            type="button"
            class="details-toggle-btn"
            onclick={toggleDetails}
            aria-expanded={isExpanded}
          >
            <EnhancedIcon 
              name={isExpanded ? 'chevron-up' : 'chevron-down'} 
              size="14" 
            />
            {isExpanded ? '隐藏' : '显示'}详细信息
          </button>
        </div>

        {#if isExpanded}
          <div class="error-details">
            <pre class="details-content">{details}</pre>
          </div>
        {/if}
      {/if}

      {#if allSuggestions.length > 0 && !compact}
        <div class="error-suggestions">
          <div class="suggestions-title">建议的解决方案：</div>
          <div class="suggestions-list">
            {#each allSuggestions as suggestion}
              <button
                type="button"
                class="suggestion-item"
                onclick={() => handleSuggestionClick(suggestion)}
                disabled={!suggestion.action}
              >
                {#if suggestion.icon}
                  <div class="suggestion-icon">
                    <EnhancedIcon name={suggestion.icon} size="16" />
                  </div>
                {/if}
                <div class="suggestion-content">
                  <div class="suggestion-title">{suggestion.title}</div>
                  <div class="suggestion-description">{suggestion.description}</div>
                </div>
                {#if suggestion.action}
                  <div class="suggestion-arrow">
                    <EnhancedIcon name="chevron-right" size="14" />
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if actions.length > 0}
        <div class="error-actions">
          {#each actions as action}
            <EnhancedButton
              variant={action.variant || 'secondary'}
              size="sm"
              icon={action.icon}
              onclick={() => handleActionClick(action)}
            >
              {action.label}
            </EnhancedButton>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .error-display {
    border-radius: 8px;
    border: 1px solid;
    background-color: var(--background-primary);
    margin: 12px 0;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .error-display--error {
    border-color: var(--text-error);
    background-color: var(--background-modifier-error);
  }

  .error-display--warning {
    border-color: var(--text-warning);
    background-color: var(--background-modifier-warning);
  }

  .error-display--info {
    border-color: var(--text-accent);
    background-color: var(--background-modifier-info);
  }

  .error-display--compact {
    margin: 8px 0;
  }

  .error-content {
    padding: 16px;
  }

  .error-display--compact .error-content {
    padding: 12px;
  }

  .error-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .error-icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .error-display--error .error-icon {
    color: var(--text-error);
  }

  .error-display--warning .error-icon {
    color: var(--text-warning);
  }

  .error-display--info .error-icon {
    color: var(--text-accent);
  }

  .error-text {
    flex: 1;
    min-width: 0;
  }

  .error-title {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 4px;
    color: var(--text-normal);
  }

  .error-message {
    font-size: 13px;
    line-height: 1.4;
    color: var(--text-muted);
  }

  .error-dismiss {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 4px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s ease;
  }

  .error-dismiss:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .error-details-toggle {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .details-toggle-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .details-toggle-btn:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .error-details {
    margin-top: 8px;
    padding: 12px;
    background-color: var(--background-secondary);
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
  }

  .details-content {
    font-family: var(--font-monospace);
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }

  .error-suggestions {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .suggestions-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 8px;
  }

  .suggestions-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .suggestion-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: none;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .suggestion-item:hover:not(:disabled) {
    background-color: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .suggestion-item:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .suggestion-icon {
    flex-shrink: 0;
    color: var(--text-accent);
  }

  .suggestion-content {
    flex: 1;
    min-width: 0;
  }

  .suggestion-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 2px;
  }

  .suggestion-description {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.3;
  }

  .suggestion-arrow {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .error-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .error-display--compact .error-actions {
    margin-top: 12px;
    padding-top: 12px;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .error-content {
      padding: 12px;
    }

    .error-header {
      gap: 8px;
    }

    .error-actions {
      flex-direction: column;
    }

    .suggestions-list {
      gap: 4px;
    }

    .suggestion-item {
      padding: 12px;
    }
  }

  /* 动画效果 */
  .error-display {
    animation: slideIn 0.3s ease;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 高对比度模式 */
  @media (prefers-contrast: high) {
    .error-display {
      border-width: 2px;
    }

    .suggestion-item {
      border-width: 2px;
    }
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .error-display {
      animation: none;
    }

    .error-dismiss,
    .details-toggle-btn,
    .suggestion-item {
      transition: none;
    }
  }
</style>
