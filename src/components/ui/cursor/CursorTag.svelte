<script lang="ts">
  interface Props { closable?: boolean; onClose?: () => void; }
  let { closable = false, onClose }: Props = $props();
</script>

<span class="cursor-tag">
  <slot />
  {#if closable}
    <button onclick={onClose}>×</button>
  {/if}
</span>

<style>
  .cursor-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--tuanki-surface-alt);
    border: 1px solid var(--tuanki-border);
    border-radius: 4px;
    font-size: 12px;
  }
  .cursor-tag button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    width: 16px;
    height: 16px;
  }
</style>
