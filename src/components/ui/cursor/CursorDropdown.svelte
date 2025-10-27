<script lang="ts">
  interface Props { open?: boolean; }
  let { open = false }: Props = $props();
</script>

<div class="cursor-dropdown">
  <button onclick={() => open = !open}>
    <slot name="trigger" />
  </button>
  {#if open}
    <div class="dropdown-content">
      <slot />
    </div>
  {/if}
</div>

<style>
  .cursor-dropdown { position: relative; display: inline-block; }
  .dropdown-content {
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--tuanki-surface);
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-md);
    box-shadow: var(--tuanki-shadow-md);
    z-index: 1000;
    min-width: 200px;
  }
</style>
