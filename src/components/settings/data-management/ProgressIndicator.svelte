<!--
  进度指示器组件
  显示操作进度、状态和剩余时间估算
-->
<script lang="ts">
  import type { OperationProgress } from '../../../types/data-management-types';
  import { formatDuration, formatEstimatedTime, formatOperationType } from '../../../utils/format-utils';
  import { createEventDispatcher } from 'svelte';
  import { tr } from '../../../utils/i18n';
  import OperationProgressCard from '../../ui/OperationProgressCard.svelte';

  let t = $derived($tr);

  interface Props {
    progress: OperationProgress | null;
    isVisible?: boolean;
    allowCancel?: boolean;
    onCancel?: () => void;
  }

  let {
    progress,
    isVisible = false,
    allowCancel = true,
    onCancel
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    cancel: void;
  }>();

  // 计算进度百分比
  let progressPercentage = $derived(
    progress ? Math.min(100, Math.max(0, progress.progress)) : 0
  );

  // 格式化进度文本
  let progressText = $derived(
    progress ? `${Math.round(progressPercentage)}%` : ''
  );

  // 格式化处理计数
  let countText = $derived(
    progress ? `${progress.processedCount} / ${progress.totalCount}` : ''
  );

  // 计算已用时间
  let elapsedTime = $derived(
    progress?.startTime ? Date.now() - new Date(progress.startTime).getTime() : 0
  );

  // 格式化已用时间
  let elapsedTimeText = $derived(
    formatDuration(elapsedTime)
  );

  // 格式化剩余时间
  let remainingTimeText = $derived(
    progress?.estimatedTimeRemaining ? formatEstimatedTime(progress.estimatedTimeRemaining) : t('dataManagement.progress.calculating')
  );

  let detailText = $derived(
    progress
      ? [
          `${t('dataManagement.progress.elapsedTime')}：${elapsedTimeText}`,
          progress.estimatedTimeRemaining !== undefined
            ? `${t('dataManagement.progress.remainingTime')}：${remainingTimeText}`
            : ''
        ].filter(Boolean).join(' ｜ ')
      : ''
  );

  // 处理取消操作
  function handleCancel() {
    if (!progress?.cancellable) return;
    
    if (onCancel) {
      onCancel();
    }
    
    dispatch('cancel');
  }

  // 检查是否可以取消
  let canCancel = $derived(
    allowCancel && progress?.cancellable
  );
</script>

<!-- 进度指示器 -->
{#if isVisible && progress}
  <div class="progress-indicator">
    <div class="progress-action-row">
      {#if canCancel}
        <button
          class="cancel-button"
          onclick={handleCancel}
          title={t('dataManagement.progress.cancelOperation')}
        >
          <span class="cancel-icon">✕</span>
        </button>
      {/if}
    </div>

    <OperationProgressCard
      title={formatOperationType(progress.operation)}
      counter={countText || progressText}
      message={progress.status}
      detail={detailText}
      percent={progressPercentage}
      status="running"
      statusLabel="进行中"
      footerPrimary={progressText}
      footerSecondary={countText}
      compactLoader={true}
      detailInCard={Boolean(detailText)}
      progressValueMin={0}
      progressValueMax={Math.max(1, progress.totalCount || 0)}
      progressValueNow={Math.min(progress.processedCount || 0, Math.max(1, progress.totalCount || 0))}
      progressValueText={countText || progressText}
    />
  </div>
{/if}

<style>
  .progress-indicator {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: slideIn 0.3s ease-out;
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

  .progress-action-row {
    display: flex;
    justify-content: flex-end;
  }

  .cancel-button {
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 50%;
    background: var(--background-primary);
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .cancel-button:hover {
    background: var(--background-modifier-hover);
    border-color: var(--text-error);
    color: var(--text-error);
  }

  .cancel-icon {
    font-size: 0.875rem;
    font-weight: bold;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .cancel-button {
      align-self: flex-end;
    }
  }
</style>
