<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
  }

  let { size = 'md' }: Props = $props();
</script>

<div class="cursor-spinner {size}">
  <svg viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25"/>
    <path d="M12 2a10 10 0 0110 10h-2a8 8 0 00-8-8V2z" fill="currentColor"/>
  </svg>
</div>

<style>
  .cursor-spinner {
    display: inline-block;
    animation: spin 1s linear infinite;
  }

  .cursor-spinner.sm { width: 16px; height: 16px; }
  .cursor-spinner.md { width: 24px; height: 24px; }
  .cursor-spinner.lg { width: 32px; height: 32px; }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
