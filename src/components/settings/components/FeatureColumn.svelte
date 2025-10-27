<script lang="ts">
  import type { FeatureCategory } from '../constants/feature-definitions';
  import FeatureItem from './FeatureItem.svelte';

  interface Props {
    category: FeatureCategory;
    showDescription?: boolean;
    compact?: boolean;
  }

  let { category, showDescription = true, compact = false }: Props = $props();
</script>

<div class="feature-column" class:premium={category.id === 'premium'}>
  <!-- 列头部 -->
  <div class="column-header">
    <div class="header-content">
      <div class="header-icon">{category.icon}</div>
      <div class="header-text">
        <h3 class="column-title">{category.title}</h3>
        {#if category.subtitle}
          <p class="column-subtitle">{category.subtitle}</p>
        {/if}
      </div>
    </div>
    
    {#if showDescription && category.description}
      <p class="column-description">{category.description}</p>
    {/if}
  </div>

  <!-- 功能列表 -->
  <div class="features-list">
    {#each category.features as feature}
      <FeatureItem {feature} {showDescription} {compact} />
    {/each}
  </div>

  <!-- 底部装饰 -->
  <div class="column-footer">
    <div class="feature-count">
      {category.features.length} 个功能
    </div>
  </div>
</div>

<style>
  .feature-column {
    background: var(--background-primary);
    border: 2px solid var(--background-modifier-border);
    border-radius: 1rem;
    padding: 0;
    overflow: hidden;
    position: relative;
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    height: fit-content;
  }

  .feature-column::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, 
      var(--color-green) 0%, 
      var(--color-blue) 100%
    );
    opacity: 0.6;
  }

  .feature-column.premium::before {
    background: linear-gradient(90deg, 
      var(--color-accent) 0%, 
      var(--color-blue) 50%,
      var(--color-purple) 100%
    );
  }

  .feature-column:hover {
    border-color: var(--background-modifier-border-hover);
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.1);
  }

  .column-header {
    padding: 1.5rem;
    background: linear-gradient(135deg, 
      var(--background-secondary) 0%, 
      color-mix(in oklab, var(--background-secondary), var(--background-primary) 50%) 100%
    );
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .header-content {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .header-icon {
    font-size: 2rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .header-text {
    flex: 1;
  }

  .column-title {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-normal);
    line-height: 1.3;
  }

  .column-subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .column-description {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .features-list {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
  }

  .column-footer {
    padding: 1rem 1.5rem;
    background: var(--background-secondary);
    border-top: 1px solid var(--background-modifier-border);
    text-align: center;
  }

  .feature-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .feature-column {
      margin-bottom: 1rem;
    }

    .column-header {
      padding: 1rem;
    }

    .header-content {
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .header-icon {
      font-size: 1.5rem;
    }

    .column-title {
      font-size: 1.125rem;
    }

    .features-list {
      padding: 0.75rem;
      gap: 0.5rem;
    }

    .column-footer {
      padding: 0.75rem 1rem;
    }
  }


</style>
