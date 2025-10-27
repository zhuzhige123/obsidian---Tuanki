<script lang="ts">
  import type { FeatureItem as FeatureItemType } from '../constants/feature-definitions';
  import FeatureStatusBadge from './FeatureStatusBadge.svelte';

  interface Props {
    feature: FeatureItemType;
    showDescription?: boolean;
    compact?: boolean;
  }

  let { feature, showDescription = true, compact = false }: Props = $props();
</script>

<div class="feature-item" class:compact>
  <div class="feature-content">
    <div class="feature-header">
      <h4 class="feature-name">{feature.name}</h4>
      <FeatureStatusBadge 
        status={feature.status} 
        estimatedDate={feature.estimatedDate}
        size={compact ? 'sm' : 'md'}
      />
    </div>
    
    {#if showDescription && feature.description}
      <p class="feature-description">{feature.description}</p>
    {/if}
    
    {#if feature.version}
      <div class="feature-meta">
        <span class="version-tag">v{feature.version}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .feature-item {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    padding: 1rem;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .feature-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, 
      var(--color-accent) 0%, 
      transparent 100%
    );
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .feature-item:hover {
    border-color: var(--background-modifier-border-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
  }

  .feature-item:hover::before {
    opacity: 1;
  }

  .feature-item.compact {
    padding: 0.75rem;
  }

  .feature-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .feature-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .feature-name {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
    line-height: 1.4;
    flex: 1;
  }

  .feature-description {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .feature-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .version-tag {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    font-family: var(--font-monospace);
  }

  /* 响应式设计 */
  @media (max-width: 640px) {
    .feature-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .feature-name {
      font-size: 0.9rem;
    }

    .feature-description {
      font-size: 0.8rem;
    }
  }


</style>
