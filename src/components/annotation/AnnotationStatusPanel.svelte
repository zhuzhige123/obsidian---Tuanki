<!--
  Tuanki标注状态面板
  显示标注处理状态、进度和统计信息
  使用Cursor风格设计语言
-->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { TuankiAnnotationSystem } from '../../services/TuankiAnnotationSystem';
  import {
    type AnnotationSystemState,
    type AnnotationEvent,
    SyncStatus
  } from '../../types/annotation-types';
  
  // UI组件
  import CursorButton from '../ui/cursor/CursorButton.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';

  // Props
  interface Props {
    plugin: any;
    isVisible?: boolean;
  }

  let { plugin, isVisible = false }: Props = $props();

  // 配置常量
  const UPDATE_INTERVAL_MS = 2000; // 状态更新间隔（毫秒）
  const MAX_VISIBLE_QUEUE_ITEMS = 5; // 队列显示最大数量
  const MAX_VISIBLE_ERROR_ITEMS = 3; // 错误日志显示最大数量

  // 状态管理
  let annotationSystem: TuankiAnnotationSystem;
  let systemState = $state<AnnotationSystemState>({
    status: SyncStatus.IDLE,
    isProcessing: false,
    detectedAnnotations: [],
    processingQueue: [],
    completedTasks: [],
    errorLog: [],
    stats: {
      totalDetected: 0,
      totalProcessed: 0,
      totalErrors: 0,
      successRate: 0
    }
  });

  // UI状态
  let currentFile = $state('');
  let processingProgress = $state(0);

  // 事件监听器清理函数
  let cleanupFunctions: (() => void)[] = [];

  onMount(() => {
    initializeSystem();
  });

  onDestroy(() => {
    cleanup();
  });

  /**
   * 初始化系统
   */
  async function initializeSystem() {
    try {
      annotationSystem = TuankiAnnotationSystem.getInstance();
      
      // 监听系统状态变更
      const stateListener = () => {
        systemState = annotationSystem.getSystemState();
        updateProgress();
      };
      
      // 监听系统事件
      const eventListener = (event: AnnotationEvent) => {
        handleSystemEvent(event);
      };
      
      annotationSystem.addEventListener(eventListener);
      
      // 定期更新状态
      const intervalId = setInterval(stateListener, UPDATE_INTERVAL_MS);
      
      cleanupFunctions.push(
        () => annotationSystem.removeEventListener(eventListener),
        () => clearInterval(intervalId)
      );
      
      // 初始状态更新
      stateListener();
      
    } catch (error) {
      console.error('标注状态面板初始化失败:', error);
    }
  }

  /**
   * 处理系统事件
   */
  function handleSystemEvent(event: AnnotationEvent) {
    if (event.type === 'annotation_detected' && event.data?.filePath) {
      currentFile = event.data.filePath;
    }
  }

  /**
   * 更新进度
   */
  function updateProgress() {
    const total = systemState.stats.totalDetected;
    const processed = systemState.stats.totalProcessed;
    processingProgress = total > 0 ? (processed / total) * 100 : 0;
  }

  /**
   * 获取状态图标名称
   */
  function getStatusIconName(status: SyncStatus): string {
    switch (status) {
      case SyncStatus.IDLE:
        return 'pause';
      case SyncStatus.DETECTING:
        return 'search';
      case SyncStatus.PROCESSING:
        return 'settings';
      case SyncStatus.SYNCING:
        return 'refresh-cw';
      case SyncStatus.COMPLETED:
        return 'check-circle';
      case SyncStatus.ERROR:
        return 'x-circle';
      default:
        return 'help-circle';
    }
  }

  /**
   * 获取状态图标变体
   */
  function getStatusIconVariant(status: SyncStatus): 'primary' | 'secondary' | 'success' | 'error' {
    switch (status) {
      case SyncStatus.IDLE:
        return 'secondary';
      case SyncStatus.DETECTING:
      case SyncStatus.PROCESSING:
      case SyncStatus.SYNCING:
        return 'primary';
      case SyncStatus.COMPLETED:
        return 'success';
      case SyncStatus.ERROR:
        return 'error';
      default:
        return 'secondary';
    }
  }

  /**
   * 获取状态文本
   */
  function getStatusText(status: SyncStatus): string {
    switch (status) {
      case SyncStatus.IDLE:
        return '空闲';
      case SyncStatus.DETECTING:
        return '检测中';
      case SyncStatus.PROCESSING:
        return '处理中';
      case SyncStatus.SYNCING:
        return '同步中';
      case SyncStatus.COMPLETED:
        return '已完成';
      case SyncStatus.ERROR:
        return '错误';
      default:
        return '未知';
    }
  }

  /**
   * 同步所有文件
   */
  async function syncAllFiles() {
    try {
      const markdownFiles = plugin.app.vault.getMarkdownFiles();
      const filePaths = markdownFiles.map((file: any) => file.path);
      
      const result = await annotationSystem.syncMultipleFiles(filePaths);
      if (result.success) {
        plugin.app.workspace.trigger('tuanki:show-notice', 
          `批量同步完成: 成功 ${result.data?.successCount || 0} 个，失败 ${result.data?.failureCount || 0} 个`
        );
      } else {
        plugin.app.workspace.trigger('tuanki:show-notice', `批量同步失败: ${result.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      plugin.app.workspace.trigger('tuanki:show-notice', `批量同步错误: ${errorMsg}`);
    }
  }

  /**
   * 清理资源
   */
  function cleanup() {
    cleanupFunctions.forEach(fn => fn());
    cleanupFunctions = [];
  }
</script>

{#if isVisible}
<div class="annotation-status-panel">
  <!-- 进度条 -->
  {#if systemState.isProcessing}
  <div class="progress-section">
    <div class="progress-bar">
      <div class="progress-fill" style="width: {processingProgress}%"></div>
    </div>
    <span class="progress-text">{Math.round(processingProgress)}%</span>
    {#if currentFile}
    <div class="current-file">正在处理: {currentFile}</div>
    {/if}
  </div>
  {/if}

  <!-- 统计信息和操作按钮 -->
  <div class="action-stats-section">
    <!-- 操作按钮 -->
    <CursorButton
      variant="primary"
      size="sm"
      disabled={systemState.isProcessing}
      onclick={syncAllFiles}
    >
      {#if systemState.isProcessing}
        <EnhancedIcon name="loader" size={14} animation="spin" />
      {:else}
        <EnhancedIcon name="refresh-cw" size={14} />
      {/if}
      同步所有文件
    </CursorButton>

    <!-- 统计信息 -->
    <div class="stats-inline">
      <div class="stat-item">
        <EnhancedIcon name="eye" size={14} variant="secondary" />
        <span>检测到: {systemState.stats.totalDetected}</span>
      </div>
      <div class="stat-item">
        <EnhancedIcon name="check-circle" size={14} variant="success" />
        <span>已处理: {systemState.stats.totalProcessed}</span>
      </div>
      <div class="stat-item">
        <EnhancedIcon name="x-circle" size={14} variant="error" />
        <span>错误: {systemState.stats.totalErrors}</span>
      </div>
      <div class="stat-item">
        <EnhancedIcon name="trending-up" size={14} variant="primary" />
        <span>成功率: {Math.round(systemState.stats.successRate)}%</span>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  /* 面板整体 */
  .annotation-status-panel {
    margin-bottom: 1rem;
  }

  /* 操作和统计信息区域 */
  .action-stats-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 0;
  }

  /* 内联统计信息 */
  .stats-inline {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  /* 进度条区域 */
  .progress-section {
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: var(--background-secondary);
    border-radius: var(--radius-m);
    border: 1px solid var(--background-modifier-border);
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: var(--background-modifier-border);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%);
    border-radius: var(--radius-full);
    transition: width 300ms ease;
  }

  .progress-text {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--interactive-accent);
  }

  .current-file {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .stat-item span {
    white-space: nowrap;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .action-stats-section {
      flex-direction: column;
      align-items: flex-start;
    }

    .stats-inline {
      width: 100%;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
  }
</style>
