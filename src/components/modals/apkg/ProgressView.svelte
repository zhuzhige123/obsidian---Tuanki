<!--
  进度显示视图
  显示导入或分析的进度
-->
<script lang="ts">
  import type { ImportProgress } from '../../../domain/apkg/types';
  import OperationProgressCard from '../../ui/OperationProgressCard.svelte';
  
  interface Props {
    progress: ImportProgress;
    title?: string;
  }
  
  let { progress, title = '处理中...' }: Props = $props();
</script>

<div class="progress-view">
  <OperationProgressCard
    title={title}
    counter={`${Math.round(progress.progress)}%`}
    message={progress.message && progress.message !== progress.stage ? progress.message : progress.stage}
    detail={progress.detail || ''}
    percent={progress.progress}
    status="running"
    statusLabel="进行中"
    centered={true}
    detailInCard={Boolean(progress.detail)}
    progressValueMin={0}
    progressValueMax={progress.totalItems || 100}
    progressValueNow={progress.totalItems ? Math.min(progress.completedItems || 0, progress.totalItems) : Math.round(progress.progress)}
    progressValueText={progress.totalItems ? `${Math.min(progress.completedItems || 0, progress.totalItems)}/${progress.totalItems}` : `${Math.round(progress.progress)}%`}
  />
</div>

<style>
  .progress-view {
    min-height: 300px;
    padding: var(--weave-space-2xl, 2rem);
  }
</style>

