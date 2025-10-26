<script lang="ts">
  /**
   * 高级功能徽章组件
   * 用于标识需要高级版许可证的功能
   */
  
  interface Props {
    /** 徽章变体 */
    variant?: 'pro' | 'lock';
    /** 尺寸 */
    size?: 'small' | 'medium';
  }

  let { 
    variant = 'lock', 
    size = 'small' 
  }: Props = $props();
</script>

<span 
  class="premium-badge" 
  class:pro={variant === 'pro'}
  class:lock={variant === 'lock'}
  class:small={size === 'small'}
  class:medium={size === 'medium'}
>
  {#if variant === 'pro'}
    <span class="badge-icon">💎</span>
    <span class="badge-text">PRO</span>
  {:else}
    <span class="badge-icon">🔒</span>
  {/if}
</span>

<style>
  .premium-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    opacity: 0.9;
    vertical-align: middle;
    transition: opacity 0.2s ease;
  }

  .premium-badge:hover {
    opacity: 1;
  }

  .premium-badge.lock {
    background: color-mix(in oklab, var(--text-muted), transparent 50%);
    color: var(--text-normal);
  }

  .premium-badge.small {
    font-size: 0.7rem;
    padding: 0.1rem 0.3rem;
  }

  .premium-badge.small .badge-icon {
    font-size: 0.8em;
  }

  .premium-badge.medium {
    font-size: 0.8rem;
    padding: 0.15rem 0.4rem;
  }

  .badge-icon {
    line-height: 1;
  }

  .badge-text {
    line-height: 1;
    letter-spacing: 0.02em;
  }
</style>





