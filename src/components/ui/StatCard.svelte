<script lang="ts">
  import EnhancedIcon from './EnhancedIcon.svelte';

  interface Props {
    /** 图标名称 */
    icon?: string;
    /** 图标颜色 */
    iconColor?: string;
    /** 标题 */
    label: string;
    /** 数值 */
    value: string | number;
    /** 单位 */
    unit?: string;
    /** 趋势文本（如 "+15%"） */
    trend?: string;
    /** 趋势方向 */
    trendDirection?: 'up' | 'down' | 'neutral';
    /** 卡片大小 */
    size?: 'sm' | 'md' | 'lg';
    /** 是否高亮显示 */
    highlighted?: boolean;
  }

  let {
    icon,
    iconColor,
    label,
    value,
    unit,
    trend,
    trendDirection = 'neutral',
    size = 'md',
    highlighted = false
  }: Props = $props();

  // 趋势图标
  const trendIcon = $derived(() => {
    switch (trendDirection) {
      case 'up': return 'trending-up';
      case 'down': return 'trending-down';
      default: return 'minus';
    }
  });

  // 趋势颜色
  const trendColor = $derived(() => {
    switch (trendDirection) {
      case 'up': return 'var(--text-success)';
      case 'down': return 'var(--text-error)';
      default: return 'var(--text-muted)';
    }
  });
</script>

<div 
  class="stat-card" 
  class:highlighted
  class:size-sm={size === 'sm'}
  class:size-md={size === 'md'}
  class:size-lg={size === 'lg'}
>
  {#if icon}
    <div class="stat-icon" style:color={iconColor || 'var(--text-accent)'}>
      <EnhancedIcon name={icon} size={size === 'lg' ? 24 : 20} />
    </div>
  {/if}
  
  <div class="stat-content">
    <div class="stat-label">{label}</div>
    <div class="stat-value-row">
      <span class="stat-value">{value}</span>
      {#if unit}
        <span class="stat-unit">{unit}</span>
      {/if}
    </div>
    
    {#if trend}
      <div class="stat-trend" style:color={trendColor()}>
        <EnhancedIcon name={trendIcon()} size={12} />
        <span>{trend}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .stat-card {
    display: flex;
    align-items: center;
    gap: var(--size-4-3);
    padding: var(--size-4-4);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    transition: all 0.2s ease;
  }

  .stat-card:hover {
    background: var(--background-secondary);
    border-color: var(--background-modifier-border-hover);
    box-shadow: var(--shadow-s);
  }

  .stat-card.highlighted {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-form-field);
  }

  .stat-card.size-sm {
    padding: var(--size-4-2) var(--size-4-3);
  }

  .stat-card.size-lg {
    padding: var(--size-4-5) var(--size-4-6);
  }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--background-secondary);
    border-radius: var(--radius-m);
    flex-shrink: 0;
  }

  .size-sm .stat-icon {
    width: 32px;
    height: 32px;
  }

  .size-lg .stat-icon {
    width: 48px;
    height: 48px;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-1);
    flex: 1;
    min-width: 0;
  }

  .stat-label {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    font-weight: 500;
  }

  .stat-value-row {
    display: flex;
    align-items: baseline;
    gap: var(--size-4-1);
  }

  .stat-value {
    font-size: var(--font-ui-large);
    font-weight: 600;
    color: var(--text-normal);
  }

  .size-sm .stat-value {
    font-size: var(--font-ui-medium);
  }

  .size-lg .stat-value {
    font-size: 24px;
  }

  .stat-unit {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
  }

  .stat-trend {
    display: flex;
    align-items: center;
    gap: var(--size-4-1);
    font-size: var(--font-ui-smaller);
    font-weight: 500;
  }

  /* 响应式适配 */
  @media (max-width: 600px) {
    .stat-card {
      padding: var(--size-4-3);
      gap: var(--size-4-2);
    }

    .stat-icon {
      width: 36px;
      height: 36px;
    }

    .stat-value {
      font-size: var(--font-ui-medium);
    }
  }
</style>
