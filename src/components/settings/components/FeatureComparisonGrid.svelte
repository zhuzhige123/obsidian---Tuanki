<script lang="ts">
  import { FEATURE_CATEGORIES } from '../constants/feature-definitions';
  import FeatureColumn from './FeatureColumn.svelte';

  interface Props {
    showDescription?: boolean;
    compact?: boolean;
  }

  let { showDescription = true, compact = false }: Props = $props();
</script>

<div class="feature-comparison-container">
  <!-- 标题区域 -->
  <div class="section-header">
    <h2 class="section-title">功能对比</h2>
  </div>

  <!-- 功能对比网格 -->
  <div class="feature-comparison-grid">
    {#each FEATURE_CATEGORIES as category}
      <FeatureColumn {category} {showDescription} {compact} />
    {/each}
  </div>


</div>

<style>
  .feature-comparison-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
  }

  .section-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .section-title {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-normal);
    margin: 0 0 0.5rem 0;
    background: linear-gradient(135deg, 
      var(--color-accent) 0%, 
      var(--color-blue) 100%
    );
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .section-description {
    font-size: 1.125rem;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.6;
  }

  .feature-comparison-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-bottom: 3rem;
  }



  /* 响应式设计 */
  @media (max-width: 768px) {
    .feature-comparison-container {
      padding: 0 0.75rem;
    }

    .section-title {
      font-size: 1.5rem;
    }

    .section-description {
      font-size: 1rem;
    }

    .feature-comparison-grid {
      grid-template-columns: 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }


  }

  @media (max-width: 480px) {
    .section-header {
      margin-bottom: 1.5rem;
    }

    .section-title {
      font-size: 1.25rem;
    }

    .section-description {
      font-size: 0.9rem;
    }

    .feature-comparison-grid {
      gap: 1rem;
    }
  }


</style>
