<script lang="ts">
  interface Props { text: string; }
  let { text }: Props = $props();
  let showTooltip = $state(false);
</script>

<div class="cursor-tooltip" 
     onmouseenter={() => showTooltip = true} 
     onmouseleave={() => showTooltip = false}>
  <slot />
  {#if showTooltip}
    <div class="tooltip-content">{text}</div>
  {/if}
</div>

<style>
  .cursor-tooltip { position: relative; display: inline-block; }
  .tooltip-content {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: var(--tuanki-text-primary);
    color: var(--tuanki-surface);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    z-index: 1000;
    margin-bottom: 4px;
  }
</style>
