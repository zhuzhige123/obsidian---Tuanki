<script lang="ts">
  interface Props { open?: boolean; }
  let { open = false }: Props = $props();
</script>

<div class="cursor-popover">
  <div onclick={() => open = !open}>
    <slot name="trigger" />
  </div>
  {#if open}
    <div class="popover-content">
      <slot />
    </div>
  {/if}
</div>

<style>
  .cursor-popover { position: relative; display: inline-block; }
  .popover-content {
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--tuanki-surface);
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-md);
    box-shadow: var(--tuanki-shadow-lg);
    padding: var(--tuanki-spacing-md);
    z-index: 1000;
    min-width: 200px;
  }
</style>
