<!--
  通用图标组件
  基于 Obsidian 原生图标系统
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { setIcon } from 'obsidian';
  import { resolveObsidianIconName } from '../../icons/obsidian-icon-resolver';

  type IconName = string;

  interface Props {
    name: IconName;
    size?: string | number;
    color?: string;
    class?: string;
    title?: string;
    ariaLabel?: string;
    ariaHidden?: boolean;
  }

  let {
    name,
    size = '16',
    color,
    class: className = '',
    title,
    ariaLabel,
    ariaHidden = false
  }: Props = $props();

  let iconElement: HTMLSpanElement;

  const pixelSize = $derived.by(() => {
    if (typeof size === 'number' && Number.isFinite(size)) {
      return size;
    }
    if (typeof size === 'string') {
      const parsed = Number.parseInt(size, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 16;
  });

  function renderIcon() {
    if (!iconElement) {
      return;
    }
    setIcon(iconElement, resolveObsidianIconName(name));
    const svg = iconElement.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', String(pixelSize));
      svg.setAttribute('height', String(pixelSize));
      svg.style.width = `${pixelSize}px`;
      svg.style.height = `${pixelSize}px`;
    }
  }

  onMount(() => {
    renderIcon();
  });

  $effect(() => {
    name;
    pixelSize;
    renderIcon();
  });

  // 计算尺寸
  let iconSize = $derived.by(() => {
    if (typeof size === 'number') {
      return `${size}px`;
    }
    if (typeof size === 'string') {
      // 如果已经包含单位，直接返回
      if (/\d+(px|em|rem|%|vh|vw)$/.test(size)) {
        return size;
      }
      // 如果是纯数字字符串，添加 px 单位
      if (/^\d+$/.test(size)) {
        return `${size}px`;
      }
      // 其他情况直接返回
      return size;
    }
    return '16px';
  });

  // 计算样式
  let iconStyle = $derived.by(() => {
    let styles: string[] = [];
    
    styles.push(`width: ${iconSize}`);
    styles.push(`height: ${iconSize}`);
    styles.push('display: inline-block');
    styles.push('vertical-align: middle');
    styles.push('flex-shrink: 0');
    
    if (color) {
      styles.push(`color: ${color}`);
    }
    
    return styles.join('; ');
  });

  // 计算 CSS 类
  let iconClasses = $derived.by(() => {
    let classes = ['weave-inline-icon'];
    if (className) {
      classes.push(className);
    }
    return classes.join(' ');
  });

  // 计算可访问性属性
  let accessibilityProps = $derived.by(() => {
    let props: Record<string, any> = {};
    
    if (ariaHidden) {
      props['aria-hidden'] = 'true';
    } else if (ariaLabel) {
      props['aria-label'] = ariaLabel;
    } else if (title) {
      props['aria-label'] = title;
    }
    
    if (title) {
      props.title = title;
    }
    
    return props;
  });
</script>

<span
  bind:this={iconElement}
  class={iconClasses}
  style={iconStyle}
  role={ariaHidden ? 'presentation' : 'img'}
  {...accessibilityProps}
></span>

<style>
  .weave-inline-icon {
    /* 确保图标正确显示 */
    line-height: 1;
    user-select: none;
    pointer-events: none;
  }

  .weave-inline-icon :global(svg) {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    display: block;
  }

  /* 响应式尺寸 */
  .weave-inline-icon.small {
    width: 12px;
    height: 12px;
  }

  .weave-inline-icon.medium {
    width: 16px;
    height: 16px;
  }

  .weave-inline-icon.large {
    width: 20px;
    height: 20px;
  }

  .weave-inline-icon.xl {
    width: 24px;
    height: 24px;
  }


  /* 状态颜色 */
  .weave-inline-icon.success {
    color: var(--color-green);
  }

  .weave-inline-icon.warning {
    color: var(--color-orange);
  }

  .weave-inline-icon.error {
    color: var(--color-red);
  }

  .weave-inline-icon.info {
    color: var(--color-blue);
  }

  .weave-inline-icon.muted {
    color: var(--text-muted);
  }

  /* 交互状态 */
  .weave-inline-icon.interactive {
    cursor: pointer;
    pointer-events: auto;
    transition: color 0.2s ease, opacity 0.2s ease;
  }

  .weave-inline-icon.interactive:hover {
    opacity: 0.8;
  }

  .weave-inline-icon.interactive:active {
    opacity: 0.6;
  }

  /* 禁用状态 */
  .weave-inline-icon.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 动画效果 */
  .weave-inline-icon.spin :global(svg) {
    animation: spin 1s linear infinite;
  }

  .weave-inline-icon.pulse :global(svg) {
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
</style>
