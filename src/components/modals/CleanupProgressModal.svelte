<!--
  全局清理进度模态窗口 - Svelte组件版本
  设计风格：与Weave插件统一，现代化、简洁
  将原TypeScript类转换为Svelte组件
-->
<script lang="ts">
  import type { Readable } from 'svelte/store';
  import OperationProgressCard from '../ui/OperationProgressCard.svelte';
  import type { CleanupDetail, GlobalScanResult, ScanProgress } from '../../services/cleanup/types';

  interface Props {
    progressState: Readable<{
      progress: ScanProgress | null;
      details: CleanupDetail[];
      stats: {
        totalFiles: number;
        processedFiles: number;
        detectedOrphans: number;
        cleanedOrphans: number;
        errorCount: number;
      };
      elapsedMs: number;
      isCompleted: boolean;
      isCancelled: boolean;
      result: GlobalScanResult | null;
    }>;
    onClose: () => void;
    onCancel: () => void;
  }

  let { progressState, onClose, onCancel }: Props = $props();

  let viewState = $derived($progressState);
  let progress = $derived(viewState.progress);
  let currentFile = $derived(
    progress?.currentFile || (viewState.isCompleted ? '扫描完成' : '准备扫描...')
  );
  let percentage = $derived(
    viewState.isCompleted
      ? 100
      : (progress ? Math.max(0, Math.min(100, Math.round(progress.percentage || 0))) : 0)
  );
  let counterLabel = $derived(
    viewState.stats.totalFiles > 0
      ? `${viewState.stats.processedFiles} / ${viewState.stats.totalFiles}`
      : `${percentage}%`
  );
  let detailLabel = $derived(
    `检测：${viewState.stats.detectedOrphans} ｜ 已清理：${viewState.stats.cleanedOrphans} ｜ 错误：${viewState.stats.errorCount}`
  );
  let elapsedText = $derived(`${(viewState.elapsedMs / 1000).toFixed(1)}秒`);
  let showDetails = $state(true);

  function resolveStatusLabel(status: CleanupDetail['status']): string {
    if (status === 'success') return '已清理';
    if (status === 'protected') return '受保护';
    if (status === 'processing') return '处理中';
    if (status === 'error') return '失败';
    return '已跳过';
  }
</script>

<div class="cleanup-progress-modal" aria-labelledby="cleanup-modal-title">
  <header class="modal-header">
    <h2 id="cleanup-modal-title">全局清理孤立块链接</h2>
  </header>

  <div class="modal-body">
    <OperationProgressCard
      title={viewState.isCompleted ? '扫描完成' : '正在清理残留元数据'}
      counter={counterLabel}
      message={`当前处理：${currentFile}`}
      detail={detailLabel}
      percent={percentage}
      status={viewState.isCompleted ? 'success' : 'running'}
      statusLabel={viewState.isCompleted ? '已完成' : (viewState.isCancelled ? '已取消' : '进行中')}
      detailInCard={true}
      footerHint={`用时：${elapsedText}`}
      footerPrimary={`${percentage}%`}
      footerSecondary={counterLabel}
      progressValueMin={0}
      progressValueMax={Math.max(1, viewState.stats.totalFiles || 0)}
      progressValueNow={Math.min(viewState.stats.processedFiles || 0, Math.max(1, viewState.stats.totalFiles || 0))}
      progressValueText={counterLabel}
    />

    <div class="stats-section">
      <div class="stat-item">
        <span class="stat-label">文件</span>
        <span class="stat-value">{viewState.stats.processedFiles} / {viewState.stats.totalFiles}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">检测</span>
        <span class="stat-value">{viewState.stats.detectedOrphans}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">已清理</span>
        <span class="stat-value cleaned">{viewState.stats.cleanedOrphans}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">错误</span>
        <span class="stat-value error">{viewState.stats.errorCount}</span>
      </div>
    </div>

    <section class="details-section">
      <button
        class="details-toggle"
        type="button"
        onclick={() => {
          showDetails = !showDetails;
        }}
      >
        <span>清理详情</span>
        <span>{showDetails ? '收起' : '展开'}</span>
      </button>

      {#if showDetails}
        <div class="details-list">
          {#if viewState.details.length === 0}
            <div class="details-empty">等待扫描结果...</div>
          {:else}
            {#each viewState.details as detail (detail.filePath + detail.message + detail.status)}
              <div class={`detail-item status-${detail.status}`}>
                <div class="detail-main">
                  <span class="detail-file">{detail.filePath.split('/').pop() || detail.filePath}</span>
                  <span class="detail-status">{resolveStatusLabel(detail.status)}</span>
                </div>
                <div class="detail-message">{detail.message}</div>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </section>
  </div>

  <footer class="modal-footer">
    {#if !viewState.isCompleted && !viewState.isCancelled}
      <button class="cancel-btn" onclick={onCancel}>取消清理</button>
    {:else}
      <button class="close-btn" onclick={onClose}>完成</button>
    {/if}
  </footer>
  </div>

<style>
  /* =========================== 模态窗口主体 =========================== */
  .cleanup-progress-modal {
    --modal-bg: var(--background-primary);
    --modal-text: var(--text-normal);
    --modal-border: var(--background-modifier-border);
    --progress-bg: var(--background-modifier-border);
    --progress-fill: var(--interactive-accent);
    --success-color: var(--color-green);
    --error-color: var(--color-red);
    --stat-label-color: var(--text-muted);
    
    width: min(720px, 92vw);
    padding: 0;
    background: var(--modal-bg);
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    padding: 24px 32px;
    border-bottom: 1px solid var(--modal-border);
    background: var(--modal-bg);
    border-radius: 12px 12px 0 0;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--modal-text);
  }

  .modal-body {
    padding: 32px;
    background: var(--modal-bg);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* =========================== 进度条 =========================== */
  .progress-container {
    width: 100%;
    height: 8px;
    background: var(--progress-bg);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 24px;
  }

  .progress-bar {
    height: 100%;
    background: var(--progress-fill);
    transition: width 0.3s ease;
    border-radius: 4px;
    animation: progress-glow 2s ease-in-out infinite;
  }

  @keyframes progress-glow {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }

  /* =========================== 状态区域 =========================== */
  .status-section {
    margin-bottom: 24px;
  }

  .current-file,
  .progress-text {
    margin-bottom: 12px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--modal-text);
  }

  .label {
    font-weight: 500;
    color: var(--stat-label-color);
    margin-right: 8px;
  }

  .value {
    color: var(--modal-text);
    font-family: var(--font-monospace);
    font-size: 13px;
    word-break: break-all;
  }

  /* =========================== 统计区域 =========================== */
  .stats-section {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--modal-border);
  }

  .stat-item:last-child {
    border-bottom: none;
  }

  .stat-label {
    font-size: 14px;
    color: var(--stat-label-color);
    font-weight: 500;
  }

  .stat-value {
    font-size: 16px;
    font-weight: 600;
    color: var(--modal-text);
    font-family: var(--font-monospace);
  }

  .stat-value.processed {
    color: var(--interactive-accent);
  }

  .stat-value.cleaned {
    color: var(--success-color);
  }

  /* =========================== 底部按钮 =========================== */
  .modal-footer {
    padding: 16px 32px;
    border-top: 1px solid var(--modal-border);
    background: var(--modal-bg);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    border-radius: 0 0 12px 12px;
  }

  .cancel-btn,
  .close-btn {
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    outline: none;
  }

  .cancel-btn {
    background: var(--interactive-normal);
    color: var(--text-on-accent);
  }

  .cancel-btn:hover {
    background: var(--interactive-hover);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .close-btn {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .close-btn:hover {
    background: var(--interactive-accent-hover);
  }

  /* =========================== 响应式设计 =========================== */
  @media (max-width: 768px) {
    .cleanup-progress-modal {
      width: 95vw;
    }
    
    .modal-header,
    .modal-body,
    .modal-footer {
      padding: 20px;
    }

    .stats-section {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* =========================== 暗色主题优化 =========================== */
  :global(.theme-dark) .stats-section {
    background: var(--background-primary-alt);
  }
</style>
