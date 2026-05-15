<script lang="ts">
  import type { Readable } from "svelte/store";
  import type { ParseProgress } from "../../services/batch-parsing";
  import OperationProgressCard from "../ui/OperationProgressCard.svelte";

  interface BatchProgressViewState {
    progress: ParseProgress | null;
    isCancelling: boolean;
  }

  interface Props {
    progressState: Readable<BatchProgressViewState>;
    onCancel: () => void;
  }

  let { progressState, onCancel }: Props = $props();

  let viewState = $derived($progressState);
  let progress = $derived(viewState.progress);
  let percentage = $derived(
    progress ? Math.max(0, Math.min(100, Math.round(progress.percentage || 0))) : 0
  );
  let counterLabel = $derived(
    progress && progress.totalFiles > 0 ? `${progress.processedFiles} / ${progress.totalFiles}` : `${percentage}%`
  );
  let message = $derived(
    progress?.currentFile ? `正在处理：${progress.currentFile}` : "正在初始化..."
  );
  let detail = $derived(
    progress ? `成功：${progress.successCount} ｜ 失败：${progress.errorCount}` : ""
  );
</script>

<div class="batch-progress-content">
  <OperationProgressCard
    title="批量解析进行中"
    counter={counterLabel}
    message={message}
    detail={detail}
    percent={percentage}
    status="running"
    statusLabel="进行中"
    centered={true}
    detailInCard={Boolean(detail)}
    footerPrimary={`${percentage}%`}
    footerSecondary={counterLabel}
    progressValueMin={0}
    progressValueMax={progress?.totalFiles || 100}
    progressValueNow={progress ? Math.min(progress.processedFiles, Math.max(1, progress.totalFiles || 0)) : 0}
    progressValueText={counterLabel}
  />

  <div class="batch-progress-actions">
    <button class="batch-progress-cancel" onclick={onCancel} disabled={viewState.isCancelling}>
      {viewState.isCancelling ? "取消中..." : "取消"}
    </button>
  </div>
</div>

<style>
  .batch-progress-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: min(520px, 86vw);
    padding: 8px 0 0;
  }

  .batch-progress-actions {
    display: flex;
    justify-content: flex-end;
  }

  .batch-progress-cancel {
    padding: 8px 20px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .batch-progress-cancel:hover:enabled {
    background: var(--background-modifier-hover);
    border-color: var(--text-error);
    color: var(--text-error);
  }

  .batch-progress-cancel:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  @media (max-width: 640px) {
    .batch-progress-content {
      min-width: min(100%, 92vw);
    }

    .batch-progress-actions {
      justify-content: stretch;
    }

    .batch-progress-cancel {
      width: 100%;
    }
  }
</style>
