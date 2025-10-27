<script lang="ts">
  interface Props { value?: number; max?: number; }
  let { value = 0, max = 100 }: Props = $props();
  const percentage = $derived((value / max) * 100);
</script>

<div class="cursor-progress">
  <div class="progress-bar" style="width: {percentage}%"></div>
</div>

<style>
  .cursor-progress {
    width: 100%;
    height: 8px;
    background: var(--tuanki-border);
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: var(--tuanki-primary);
    transition: width 0.3s ease;
  }
</style>
