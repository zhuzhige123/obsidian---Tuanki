<script lang="ts">
  // Toast 组件占位符
  interface Props {
    message: string;
    type?: 'success' | 'error' | 'warning' | 'info';
    visible?: boolean;
  }

  let { message, type = 'info', visible = true }: Props = $props();
</script>

{#if visible}
  <div class="cursor-toast {type}">
    {message}
  </div>
{/if}

<style>
  .cursor-toast {
    padding: var(--tuanki-spacing-md);
    border-radius: var(--tuanki-radius-md);
    background: var(--tuanki-surface);
    border: 1px solid var(--tuanki-border);
  }
</style>
