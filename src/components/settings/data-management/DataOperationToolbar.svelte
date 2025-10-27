<!--
  数据操作工具栏组件
  提供数据管理的主要操作按钮
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Props {
    disabled?: boolean;
    operationInProgress?: string | null;
    onExport?: () => Promise<void>;
    onImport?: () => Promise<void>;
    onBackup?: () => Promise<void>;
    onRestore?: () => Promise<void>;
    onReset?: () => Promise<void>;
    onOpenFolder?: () => Promise<void>;
    onCheckIntegrity?: () => Promise<void>;
  }

  let { 
    disabled = false,
    operationInProgress = null,
    onExport,
    onImport,
    onBackup,
    onRestore,
    onReset,
    onOpenFolder,
    onCheckIntegrity
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    export: void;
    import: void;
    backup: void;
    restore: void;
    reset: void;
    openFolder: void;
    checkIntegrity: void;
  }>();

  // 操作按钮配置
  const operations = [
    {
      id: 'checkIntegrity',
      label: '完整性检查',
      variant: 'info',
      handler: onCheckIntegrity,
      event: 'checkIntegrity'
    },
    {
      id: 'export',
      label: '导出数据',
      variant: 'primary',
      handler: onExport,
      event: 'export'
    },
    {
      id: 'import',
      label: '导入数据',
      variant: 'primary',
      handler: onImport,
      event: 'import'
    },
    {
      id: 'backup',
      label: '立即备份',
      variant: 'secondary',
      handler: onBackup,
      event: 'backup'
    },
    {
      id: 'restore',
      label: '恢复数据',
      variant: 'secondary',
      handler: onRestore,
      event: 'restore'
    },
    {
      id: 'reset',
      label: '重置数据',
      variant: 'danger',
      handler: onReset,
      event: 'reset'
    }
  ];

  // 处理操作点击
  async function handleOperation(operation: typeof operations[0]) {
    if (disabled || operationInProgress) return;

    try {
      if (operation.handler) {
        await operation.handler();
      }
      dispatch(operation.event as any);
    } catch (error) {
      console.error(`操作失败: ${operation.label}`, error);
    }
  }

  // 检查按钮是否应该禁用
  function isButtonDisabled(operationId: string): boolean {
    return disabled || (operationInProgress !== null && operationInProgress !== operationId);
  }

  // 检查按钮是否正在执行
  function isButtonLoading(operationId: string): boolean {
    return operationInProgress === operationId;
  }

  // 获取按钮样式类
  function getButtonClass(variant: string): string {
    const baseClass = 'operation-button';
    return `${baseClass} ${baseClass}--${variant}`;
  }


</script>



<!-- 数据操作工具栏 -->
<div class="data-operation-toolbar" class:disabled>
  <!-- 工具栏标题 -->
  <div class="toolbar-header">
    <h3 class="section-title with-accent-bar accent-green">数据管理操作</h3>
  </div>

  <!-- 操作按钮网格 -->
  <div class="operations-grid">
    {#each operations as operation}
      <button
        class={getButtonClass(operation.variant)}
        disabled={isButtonDisabled(operation.id)}
        onclick={() => handleOperation(operation)}
        title={operation.label}
      >
        <!-- 按钮内容 -->
        <div class="button-content">
          <!-- 加载指示器 -->
          {#if isButtonLoading(operation.id)}
            <div class="loading-spinner"></div>
          {/if}

          <!-- 按钮文本 -->
          <div class="button-label">{operation.label}</div>
        </div>

        <!-- 进度指示器 -->
        {#if isButtonLoading(operation.id)}
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
        {/if}
      </button>
    {/each}
  </div>

  <!-- 操作状态提示 -->
  {#if operationInProgress}
    <div class="status-indicator">
      <div class="status-text">
        正在执行: {operations.find(op => op.id === operationInProgress)?.label}
      </div>
    </div>
  {/if}


</div>

<style>
  .data-operation-toolbar {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 1.5rem;
    transition: all 0.2s ease;
  }

  .data-operation-toolbar.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  /* 工具栏头部 */
  .toolbar-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .section-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
    padding-left: 0.75rem;
  }

  .section-title.with-accent-bar {
    position: relative;
    padding-left: 0.75rem;
  }

  .section-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 1.2em;
    border-radius: 2px;
  }

  .section-title.accent-green::before {
    background: var(--text-success);
  }

  /* 操作按钮网格 */
  .operations-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  /* 操作按钮基础样式 */
  .operation-button {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0.75rem 1.25rem;
    border: 2px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    overflow: hidden;
    min-width: 120px;
  }

  .operation-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-s);
  }

  .operation-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .operation-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  /* 按钮变体样式 */
  .operation-button--primary {
    border-color: var(--interactive-accent);
    color: var(--interactive-accent);
  }

  .operation-button--primary:hover:not(:disabled) {
    background: color-mix(in oklab, var(--interactive-accent), transparent 95%);
    border-color: var(--interactive-accent-hover);
  }

  .operation-button--secondary {
    border-color: var(--text-normal);
    color: var(--text-normal);
  }

  .operation-button--secondary:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-normal);
  }

  .operation-button--tertiary {
    border-color: var(--text-muted);
    color: var(--text-muted);
  }

  .operation-button--tertiary:hover:not(:disabled) {
    background: var(--background-secondary);
    border-color: var(--text-normal);
    color: var(--text-normal);
  }

  .operation-button--info {
    border-color: var(--color-cyan);
    color: var(--color-cyan);
  }

  .operation-button--info:hover:not(:disabled) {
    background: color-mix(in oklab, var(--color-cyan), transparent 95%);
    border-color: var(--color-cyan);
  }

  .operation-button--danger {
    border-color: var(--text-error);
    color: var(--text-error);
  }

  .operation-button--danger:hover:not(:disabled) {
    background: color-mix(in oklab, var(--text-error), transparent 95%);
    border-color: var(--text-error);
  }

  /* 按钮内容 */
  .button-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
  }

  .button-label {
    font-size: 0.875rem;
    font-weight: 600;
  }



  /* 加载指示器 */
  .loading-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--background-modifier-border);
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* 进度条 */
  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--background-modifier-border);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: currentColor;
    animation: progress 2s ease-in-out infinite;
  }

  @keyframes progress {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(0%); }
    100% { transform: translateX(100%); }
  }

  /* 状态指示器 */
  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .status-text {
    font-size: 0.875rem;
    color: var(--text-normal);
  }



  /* 响应式设计 */
  @media (max-width: 768px) {
    .data-operation-toolbar {
      padding: 1rem;
    }

    .operations-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .button-content {
      gap: 0.75rem;
    }

  }

  @media (max-width: 480px) {
    .button-content {
      flex-direction: column;
      text-align: center;
      gap: 0.5rem;
    }
  }
</style>
