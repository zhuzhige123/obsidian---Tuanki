<script lang="ts">
  import type { WeaveGlobalOperationProgressState } from "../../stores/weave-main-interface-store";
  import OperationProgressCard from "./OperationProgressCard.svelte";

  interface Props {
    progress: WeaveGlobalOperationProgressState;
  }

  let { progress }: Props = $props();

  let safeTotal = $derived(Math.max(1, progress.total || 0));
  let safeCurrent = $derived(Math.max(0, Math.min(safeTotal, progress.current || 0)));

  let percentage = $derived(
    progress.total > 0 ? Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100))) : 0
  );

  let counterLabel = $derived(progress.total > 0 ? `${safeCurrent} / ${safeTotal}` : `${percentage}%`);

  let navigationHint = $derived(
    progress.allowNavigation
      ? '可以切换界面，任务会继续在后台执行。'
      : (progress.navigationMessage || '请暂时留在当前页面，任务完成后会自动刷新。')
  );

  let statusLabel = $derived(
    progress.status === 'error'
      ? '存在失败项'
      : progress.status === 'success'
        ? '已完成'
        : '进行中'
  );
</script>

{#if progress.active}
  <section
    class="weave-global-operation-progress"
    data-status={progress.status}
    aria-live="polite"
    aria-atomic="true"
  >
    <OperationProgressCard
      title={progress.title || '处理中'}
      counter={counterLabel}
      message={progress.detail || '正在执行操作'}
      percent={percentage}
      status={progress.status}
      statusLabel={statusLabel}
      footerHint={navigationHint}
      footerPrimary={`${percentage}%`}
      footerSecondary={statusLabel}
      compactLoader={true}
      progressValueMin={0}
      progressValueMax={progress.total || 0}
      progressValueNow={safeCurrent}
      progressValueText={counterLabel}
    />
  </section>
{/if}

<style>
  .weave-global-operation-progress {
    flex-shrink: 0;
    padding: 12px 16px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--weave-surface-secondary, var(--background-secondary));
  }

  @media (max-width: 720px) {
    .weave-global-operation-progress {
      padding: 10px 12px 12px;
    }
  }
</style>
