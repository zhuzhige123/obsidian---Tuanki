<script lang="ts">
  interface Props { variant?: 'default' | 'success' | 'warning' | 'error'; }
  let { variant = 'default' }: Props = $props();
</script>

<span class="cursor-badge {variant}">
  <slot />
</span>

<style>
  .cursor-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }
  .cursor-badge.default { background: var(--tuanki-surface-alt); color: var(--tuanki-text-primary); }
  .cursor-badge.success { background: var(--tuanki-success-alpha); color: var(--tuanki-success); }
  .cursor-badge.warning { background: var(--tuanki-warning-alpha); color: var(--tuanki-warning); }
  .cursor-badge.error { background: var(--tuanki-error-alpha); color: var(--tuanki-error); }
</style>
