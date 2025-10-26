<script lang="ts">
  import type { FeatureItem } from '../constants/feature-definitions';
  import { getStatusConfig } from '../constants/feature-definitions';

  interface Props {
    status: FeatureItem['status'];
    showLabel?: boolean;
    size?: 'sm' | 'md' | 'lg';
    estimatedDate?: string;
  }

  let { status, showLabel = true, size = 'md', estimatedDate }: Props = $props();

  let statusConfig = $derived(getStatusConfig(status));
</script>

<div 
  class="feature-status-badge {size}"
  style:--status-color={statusConfig.color}
  style:--status-bg-color={statusConfig.bgColor}
  style:--status-border-color={statusConfig.borderColor}
>
  <span class="status-icon">{statusConfig.icon}</span>
  {#if showLabel}
    <span class="status-label">{statusConfig.label}</span>
  {/if}
  {#if estimatedDate && (status === 'development' || status === 'planned')}
    <span class="estimated-date">{estimatedDate}</span>
  {/if}
</div>

<style>
  .feature-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-weight: 500;
    border: 1px solid var(--status-border-color);
    background: var(--status-bg-color);
    color: var(--status-color);
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .feature-status-badge:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .feature-status-badge.sm {
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    gap: 0.25rem;
  }

  .feature-status-badge.md {
    padding: 0.25rem 0.75rem;
    font-size: 0.875rem;
    gap: 0.375rem;
  }

  .feature-status-badge.lg {
    padding: 0.375rem 1rem;
    font-size: 1rem;
    gap: 0.5rem;
  }

  .status-icon {
    font-size: 1em;
    line-height: 1;
  }

  .status-label {
    font-weight: 500;
    line-height: 1;
  }

  .estimated-date {
    font-size: 0.75em;
    opacity: 0.8;
    font-weight: 400;
  }

  .estimated-date::before {
    content: '·';
    margin-right: 0.25rem;
    opacity: 0.6;
  }


</style>
