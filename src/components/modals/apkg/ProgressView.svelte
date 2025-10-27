<!--
  进度显示视图
  显示导入或分析的进度
-->
<script lang="ts">
  import type { ImportProgress } from '../../../domain/apkg/types';
  
  interface Props {
    progress: ImportProgress;
    title?: string;
  }
  
  let { progress, title = '处理中...' }: Props = $props();
</script>

<div class="progress-view">
  <div class="tuanki-spinner" style="width: 56px; height: 56px;"></div>
  <h3 class="progress-title">{title}</h3>
  <div class="tuanki-progress">
    <div class="tuanki-progress-fill" style="width: {progress.progress}%"></div>
  </div>
  <p class="progress-step">{progress.stage}</p>
  {#if progress.message && progress.message !== progress.stage}
    <p class="progress-message">{progress.message}</p>
  {/if}
</div>

<style>
  .progress-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    padding: var(--tuanki-space-2xl, 2rem);
    text-align: center;
  }
  
  .progress-title {
    margin: var(--tuanki-space-lg, 1.25rem) 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--tuanki-text-normal, var(--text-normal));
  }
  
  .tuanki-progress {
    width: 100%;
    max-width: 400px;
    height: 12px;
    background: var(--tuanki-bg-secondary, var(--background-secondary));
    border-radius: var(--tuanki-radius-lg, 12px);
    overflow: hidden;
    margin: var(--tuanki-space-lg, 1.25rem) 0;
    border: 1px solid var(--tuanki-border, var(--background-modifier-border));
  }
  
  .tuanki-progress-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--interactive-accent),
      color-mix(in srgb, var(--interactive-accent) 80%, white)
    );
    transition: width 0.3s var(--tuanki-ease-out, cubic-bezier(0.4, 0, 0.2, 1));
    border-radius: var(--tuanki-radius-lg, 12px);
    box-shadow: 0 0 10px color-mix(in srgb, var(--interactive-accent) 30%, transparent);
  }
  
  .progress-step {
    font-size: 1rem;
    font-weight: 500;
    color: var(--tuanki-text-normal, var(--text-normal));
    margin: 0;
  }
  
  .progress-message {
    margin-top: var(--tuanki-space-sm, 0.5rem);
    font-size: 0.875rem;
    color: var(--tuanki-text-muted, var(--text-muted));
  }
</style>

