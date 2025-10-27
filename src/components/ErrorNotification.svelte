<!--
  错误通知组件
  显示用户友好的错误信息和解决方案
-->

<script lang="ts">
  import type { UserFriendlyError, ErrorSolution } from '../utils/user-friendly-error-handler';

  // Props
  interface Props {
    error?: UserFriendlyError | null;
    visible?: boolean;
    autoHide?: boolean;
    hideDelay?: number;
    showSolutions?: boolean;
    showExamples?: boolean;
    onclose?: () => void;
    onretry?: () => void;
    onapplysolution?: (event: { solution: ErrorSolution }) => void;
    onviewdocs?: (event: { docName: string }) => void;
  }

  let {
    error = null,
    visible = false,
    autoHide = false,
    hideDelay = 5000,
    showSolutions = true,
    showExamples = true,
    onclose,
    onretry,
    onapplysolution,
    onviewdocs
  }: Props = $props();

  // State
  let expanded: boolean = $state(false);
  let selectedSolution: ErrorSolution | null = $state(null);
  let hideTimeout: NodeJS.Timeout | null = $state(null);

  // Reactive updates
  $effect(() => {
    if (visible && autoHide && error) {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
      hideTimeout = setTimeout(() => {
        closeNotification();
      }, hideDelay);
    }
  });

  $effect(() => {
    if (!visible) {
      expanded = false;
      selectedSolution = null;
    }
  });

  /**
   * 关闭通知
   */
  function closeNotification() {
    visible = false;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    onclose?.();
  }

  /**
   * 重试操作
   */
  function retryOperation() {
    onretry?.();
    closeNotification();
  }

  /**
   * 应用解决方案
   */
  function applySolution(solution: ErrorSolution) {
    onapplysolution?.({ solution });
    if (solution.autoFixable) {
      closeNotification();
    }
  }

  /**
   * 查看文档
   */
  function viewDocumentation(docName: string) {
    onviewdocs?.({ docName });
  }

  /**
   * 获取严重程度图标
   */
  function getSeverityIcon(severity: string): string {
    const icons: Record<string, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    };
    return icons[severity] || 'ℹ️';
  }

  /**
   * 获取严重程度颜色类
   */
  function getSeverityClass(severity: string): string {
    return `severity-${severity}`;
  }

  /**
   * 获取难度标签
   */
  function getDifficultyLabel(difficulty: string): string {
    const labels = {
      easy: '简单',
      medium: '中等',
      hard: '困难'
    };
    return labels[difficulty] || difficulty;
  }

  /**
   * 获取难度颜色类
   */
  function getDifficultyClass(difficulty: string): string {
    return `difficulty-${difficulty}`;
  }

  /**
   * 格式化时间
   */
  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString('zh-CN');
  }
</script>

{#if visible && error}
  <div class="error-notification {getSeverityClass(error.severity)}">
    <div class="notification-overlay" onclick={closeNotification}></div>
    
    <div class="notification-content">
      <!-- 错误头部 -->
      <div class="error-header">
        <div class="error-icon">
          {getSeverityIcon(error.severity)}
        </div>
        
        <div class="error-info">
          <h4 class="error-title">{error.title}</h4>
          <p class="error-message">{error.message}</p>
        </div>
        
        <div class="header-actions">
          <button 
            class="expand-button"
            class:expanded
            onclick={() => expanded = !expanded}
            title={expanded ? '收起详情' : '展开详情'}
          >
            <span class="expand-icon">{expanded ? '▼' : '▶'}</span>
          </button>
          
          <button 
            class="close-button"
            onclick={closeNotification}
            title="关闭"
          >
            <span class="close-icon">×</span>
          </button>
        </div>
      </div>

      <!-- 快速操作 -->
      <div class="quick-actions">
        <button class="retry-button" onclick={retryOperation}>
          🔄 重试
        </button>
        
        {#if error.solutions.length > 0}
          {#each error.solutions.slice(0, 2) as solution}
            {#if solution.autoFixable}
              <button 
                class="quick-fix-button"
                onclick={() => applySolution(solution)}
              >
                🔧 {solution.title}
              </button>
            {/if}
          {/each}
        {/if}
      </div>

      <!-- 详细信息 -->
      {#if expanded}
        <div class="error-details">
          <!-- 错误描述 -->
          <div class="detail-section">
            <h5>详细说明</h5>
            <p class="error-description">{error.description}</p>
          </div>

          <!-- 可能原因 -->
          {#if error.causes.length > 0}
            <div class="detail-section">
              <h5>可能原因</h5>
              <ul class="causes-list">
                {#each error.causes as cause}
                  <li>{cause}</li>
                {/each}
              </ul>
            </div>
          {/if}

          <!-- 解决方案 -->
          {#if showSolutions && error.solutions.length > 0}
            <div class="detail-section">
              <h5>解决方案</h5>
              <div class="solutions-list">
                {#each error.solutions as solution, index}
                  <div class="solution-item" class:selected={selectedSolution?.id === solution.id}>
                    <div class="solution-header">
                      <div class="solution-title">
                        <span class="solution-name">{solution.title}</span>
                        <div class="solution-meta">
                          <span class="difficulty-badge {getDifficultyClass(solution.difficulty)}">
                            {getDifficultyLabel(solution.difficulty)}
                          </span>
                          <span class="time-estimate">{solution.estimatedTime}</span>
                          {#if solution.autoFixable}
                            <span class="auto-fix-badge">自动修复</span>
                          {/if}
                        </div>
                      </div>
                      
                      <button 
                        class="solution-toggle"
                        onclick={() => selectedSolution = selectedSolution?.id === solution.id ? null : solution}
                      >
                        {selectedSolution?.id === solution.id ? '▼' : '▶'}
                      </button>
                    </div>

                    <p class="solution-description">{solution.description}</p>

                    {#if selectedSolution?.id === solution.id}
                      <div class="solution-details">
                        <h6>操作步骤</h6>
                        <ol class="solution-steps">
                          {#each solution.steps as step}
                            <li>{step}</li>
                          {/each}
                        </ol>
                        
                        <div class="solution-actions">
                          {#if solution.autoFixable}
                            <button 
                              class="apply-solution-button"
                              onclick={() => applySolution(solution)}
                            >
                              🔧 应用此解决方案
                            </button>
                          {:else}
                            <button 
                              class="manual-fix-button"
                              onclick={() => applySolution(solution)}
                            >
                              📝 手动执行
                            </button>
                          {/if}
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- 示例 -->
          {#if showExamples && error.examples && error.examples.length > 0}
            <div class="detail-section">
              <h5>示例</h5>
              <div class="examples-list">
                {#each error.examples as example}
                  <div class="example-item">
                    <h6>{example.title}</h6>
                    <div class="example-comparison">
                      <div class="example-before">
                        <label>修改前:</label>
                        <code class="example-code">{example.before}</code>
                      </div>
                      <div class="example-arrow">→</div>
                      <div class="example-after">
                        <label>修改后:</label>
                        <code class="example-code">{example.after}</code>
                      </div>
                    </div>
                    <p class="example-explanation">{example.explanation}</p>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- 相关文档 -->
          {#if error.relatedDocs && error.relatedDocs.length > 0}
            <div class="detail-section">
              <h5>相关文档</h5>
              <div class="docs-list">
                {#each error.relatedDocs as docName}
                  <button 
                    class="doc-link"
                    onclick={() => viewDocumentation(docName)}
                  >
                    📚 {docName}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- 错误信息 -->
          <div class="detail-section">
            <h5>技术信息</h5>
            <div class="technical-info">
              <div class="tech-item">
                <span class="tech-label">错误ID:</span>
                <span class="tech-value">{error.id}</span>
              </div>
              <div class="tech-item">
                <span class="tech-label">错误类型:</span>
                <span class="tech-value">{error.type}</span>
              </div>
              <div class="tech-item">
                <span class="tech-label">发生时间:</span>
                <span class="tech-value">{formatTime(error.timestamp)}</span>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .error-notification {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 20px;
  }

  .notification-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  .notification-content {
    position: relative;
    background: var(--background-primary);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    max-width: 600px;
    width: 100%;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* 严重程度样式 */
  .severity-info .notification-content {
    border-left: 4px solid #3b82f6;
  }

  .severity-warning .notification-content {
    border-left: 4px solid #f59e0b;
  }

  .severity-error .notification-content {
    border-left: 4px solid #ef4444;
  }

  .severity-critical .notification-content {
    border-left: 4px solid #dc2626;
    box-shadow: 0 8px 32px rgba(220, 38, 38, 0.2);
  }

  .error-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .error-icon {
    font-size: 24px;
    flex-shrink: 0;
  }

  .error-info {
    flex: 1;
    min-width: 0;
  }

  .error-title {
    margin: 0 0 4px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .error-message {
    margin: 0;
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .expand-button, .close-button {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 4px;
    transition: all 0.2s;
  }

  .expand-button:hover, .close-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .expand-icon, .close-icon {
    font-size: 16px;
    display: block;
  }

  .close-icon {
    font-size: 20px;
  }

  .quick-actions {
    display: flex;
    gap: 8px;
    padding: 12px 20px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    flex-wrap: wrap;
  }

  .retry-button, .quick-fix-button {
    background: var(--interactive-accent);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .retry-button:hover, .quick-fix-button:hover {
    background: var(--interactive-accent-hover);
  }

  .quick-fix-button {
    background: #10b981;
  }

  .quick-fix-button:hover {
    background: #059669;
  }

  .error-details {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .detail-section {
    margin-bottom: 20px;
  }

  .detail-section:last-child {
    margin-bottom: 0;
  }

  .detail-section h5 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .error-description {
    margin: 0;
    font-size: 14px;
    color: var(--text-normal);
    line-height: 1.5;
  }

  .causes-list {
    margin: 0;
    padding-left: 20px;
    color: var(--text-normal);
    font-size: 14px;
  }

  .causes-list li {
    margin-bottom: 4px;
    line-height: 1.4;
  }

  .solutions-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .solution-item {
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 12px;
    background: var(--background-secondary);
  }

  .solution-item.selected {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .solution-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  .solution-title {
    flex: 1;
  }

  .solution-name {
    font-weight: 500;
    color: var(--text-normal);
    font-size: 14px;
  }

  .solution-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }

  .difficulty-badge, .auto-fix-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 500;
  }

  .difficulty-easy {
    background: #10b981;
    color: white;
  }

  .difficulty-medium {
    background: #f59e0b;
    color: white;
  }

  .difficulty-hard {
    background: #ef4444;
    color: white;
  }

  .auto-fix-badge {
    background: #3b82f6;
    color: white;
  }

  .time-estimate {
    font-size: 11px;
    color: var(--text-muted);
  }

  .solution-toggle {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: 4px;
  }

  .solution-description {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .solution-details {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .solution-details h6 {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .solution-steps {
    margin: 0 0 12px 0;
    padding-left: 20px;
    font-size: 13px;
    color: var(--text-normal);
  }

  .solution-steps li {
    margin-bottom: 4px;
    line-height: 1.4;
  }

  .solution-actions {
    display: flex;
    gap: 8px;
  }

  .apply-solution-button, .manual-fix-button {
    background: var(--interactive-accent);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .apply-solution-button:hover, .manual-fix-button:hover {
    background: var(--interactive-accent-hover);
  }

  .manual-fix-button {
    background: #6b7280;
  }

  .manual-fix-button:hover {
    background: #4b5563;
  }

  .examples-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .example-item {
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 12px;
    background: var(--background-secondary);
  }

  .example-item h6 {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .example-comparison {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    align-items: center;
    margin-bottom: 8px;
  }

  .example-before, .example-after {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .example-before label, .example-after label {
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .example-code {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 8px;
    font-family: var(--font-monospace);
    font-size: 12px;
    color: var(--text-normal);
    white-space: pre-wrap;
    word-break: break-all;
  }

  .example-arrow {
    color: var(--text-muted);
    font-weight: bold;
  }

  .example-explanation {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .docs-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .doc-link {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    color: var(--text-normal);
    font-size: 12px;
    transition: all 0.2s;
  }

  .doc-link:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .technical-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tech-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
  }

  .tech-label {
    color: var(--text-muted);
  }

  .tech-value {
    color: var(--text-normal);
    font-family: var(--font-monospace);
  }

  /* 响应式设计 */
  @media (max-width: 600px) {
    .error-notification {
      padding: 10px;
    }

    .notification-content {
      max-height: 90vh;
    }

    .error-header {
      padding: 12px 16px;
    }

    .quick-actions {
      padding: 8px 16px;
    }

    .error-details {
      padding: 16px;
    }

    .example-comparison {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .example-arrow {
      text-align: center;
    }
  }
</style>
