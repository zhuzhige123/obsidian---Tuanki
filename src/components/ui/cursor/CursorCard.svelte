<script lang="ts">
  // 简单的卡片组件占位符
  interface Props {
    title?: string;
    padding?: boolean;
    shadow?: boolean;
    border?: boolean;
  }

  let {
    title,
    padding = true,
    shadow = true,
    border = true
  }: Props = $props();

  function getCardClass(): string {
    const classes = ['cursor-card'];
    if (padding) classes.push('padded');
    if (shadow) classes.push('shadow');
    if (border) classes.push('border');
    return classes.join(' ');
  }
</script>

<div class={getCardClass()}>
  {#if title}
    <div class="card-header">
      <h3 class="card-title">{title}</h3>
    </div>
  {/if}
  <div class="card-content">
    <slot />
  </div>
</div>

<style>
  .cursor-card {
    background: var(--tuanki-surface);
    border-radius: var(--tuanki-radius-lg);
  }

  .cursor-card.border {
    border: 1px solid var(--tuanki-border);
  }

  .cursor-card.shadow {
    box-shadow: var(--tuanki-shadow-sm);
  }

  .cursor-card.padded {
    padding: var(--tuanki-space-lg);
  }

  .card-header {
    margin-bottom: var(--tuanki-space-md);
    padding-bottom: var(--tuanki-space-md);
    border-bottom: 1px solid var(--tuanki-border);
  }

  .card-title {
    margin: 0;
    font-size: var(--tuanki-font-size-lg);
    font-weight: 600;
    color: var(--tuanki-text-primary);
  }
</style>
