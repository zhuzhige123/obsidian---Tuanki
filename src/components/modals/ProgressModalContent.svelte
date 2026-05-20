<script lang="ts">
  import type { Readable } from "svelte/store";
  import OperationProgressCard from "../ui/OperationProgressCard.svelte";
  import { tr } from "../../utils/i18n";

  interface ProgressModalViewState {
    title: string;
    description: string;
    total: number;
    current: number;
    detail: string;
    etaText: string;
    percent: number;
    percentText: string;
    status: "running" | "success" | "error";
    cancellable: boolean;
    allowClose: boolean;
    isCancelled: boolean;
    actionLabel: string;
  }

  interface Props {
    progressState: Readable<ProgressModalViewState>;
    onAction: () => void;
  }

  let { progressState, onAction }: Props = $props();
  let t = $derived($tr);

  let viewState = $derived($progressState);
  let counterLabel = $derived(
    viewState.total > 0 ? `${Math.min(viewState.current, viewState.total)} / ${viewState.total}` : ""
  );
  let statusLabel = $derived(
    viewState.status === "success"
      ? t('management.dataManagement.progress.statusCompleted')
      : viewState.status === "error"
        ? t('management.dataManagement.progress.detailStatusFailed')
        : (viewState.isCancelled
          ? t('management.dataManagement.progress.cancelling')
          : t('management.dataManagement.progress.statusRunning'))
  );
  let showActionButton = $derived(viewState.cancellable || viewState.allowClose);
</script>

<div class="generic-progress-modal-content">
  <OperationProgressCard
    title={viewState.title}
    counter={counterLabel || viewState.percentText}
    message={viewState.description}
    detail={viewState.detail}
    percent={viewState.percent}
    status={viewState.status}
    statusLabel={statusLabel}
    centered={true}
    detailInCard={Boolean(viewState.detail)}
    footerHint={viewState.etaText}
    footerPrimary={viewState.percentText}
    footerSecondary={counterLabel}
    progressValueMin={0}
    progressValueMax={Math.max(1, viewState.total || 0)}
    progressValueNow={Math.min(viewState.current || 0, Math.max(1, viewState.total || 0))}
    progressValueText={counterLabel || viewState.percentText}
  />

  {#if showActionButton}
    <div class="generic-progress-actions">
      <button
        class="generic-progress-action-button"
        onclick={onAction}
        disabled={!viewState.allowClose && viewState.isCancelled}
      >
        {viewState.actionLabel}
      </button>
    </div>
  {/if}
</div>

<style>
  .generic-progress-modal-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: min(520px, 86vw);
    padding: 8px 0 0;
  }

  .generic-progress-actions {
    display: flex;
    justify-content: flex-end;
  }

  .generic-progress-action-button {
    padding: 8px 20px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .generic-progress-action-button:hover:enabled {
    background: var(--background-modifier-hover);
    border-color: var(--text-error);
    color: var(--text-error);
  }

  .generic-progress-action-button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  @media (max-width: 640px) {
    .generic-progress-modal-content {
      min-width: min(100%, 92vw);
    }

    .generic-progress-actions {
      justify-content: stretch;
    }

    .generic-progress-action-button {
      width: 100%;
    }
  }
</style>
