<!--
  通用图标组件
  基于 FontAwesome 图标系统
-->
<script lang="ts">
  import { getIcon, hasIcon, type IconName } from '../../icons/index.js';

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

  // 计算图标 SVG 内容
  let iconSvg = $derived.by(() => {
    if (!name || !hasIcon(name)) {
      console.warn(`[Icon] 图标 "${name}" 不存在，使用默认图标`);
      return getIcon('info');
    }
    return getIcon(name);
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
    let classes = ['tuanki-icon'];
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
  class={iconClasses}
  style={iconStyle}
  role={ariaHidden ? 'presentation' : 'img'}
  {...accessibilityProps}
>
  {@html iconSvg}
</span>

<style>
  .tuanki-icon {
    /* 确保图标正确显示 */
    line-height: 1;
    user-select: none;
    pointer-events: none;
  }

  .tuanki-icon :global(svg) {
    width: 100%;
    height: 100%;
    fill: currentColor;
    display: block;
  }

  /* 响应式尺寸 */
  .tuanki-icon.small {
    width: 12px;
    height: 12px;
  }

  .tuanki-icon.medium {
    width: 16px;
    height: 16px;
  }

  .tuanki-icon.large {
    width: 20px;
    height: 20px;
  }

  .tuanki-icon.xl {
    width: 24px;
    height: 24px;
  }


  /* 状态颜色 */
  .tuanki-icon.success {
    color: var(--color-green);
  }

  .tuanki-icon.warning {
    color: var(--color-orange);
  }

  .tuanki-icon.error {
    color: var(--color-red);
  }

  .tuanki-icon.info {
    color: var(--color-blue);
  }

  .tuanki-icon.muted {
    color: var(--text-muted);
  }

  /* 交互状态 */
  .tuanki-icon.interactive {
    cursor: pointer;
    pointer-events: auto;
    transition: color 0.2s ease, opacity 0.2s ease;
  }

  .tuanki-icon.interactive:hover {
    opacity: 0.8;
  }

  .tuanki-icon.interactive:active {
    opacity: 0.6;
  }

  /* 禁用状态 */
  .tuanki-icon.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 动画效果 */
  .tuanki-icon.spin :global(svg) {
    animation: spin 1s linear infinite;
  }

  .tuanki-icon.pulse :global(svg) {
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
