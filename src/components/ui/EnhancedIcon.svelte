<script lang="ts">
  import { onMount } from "svelte";
  import { setIcon } from "obsidian";
  import { resolveObsidianIconName } from "../../icons/obsidian-icon-resolver";

  type IconName = string;

  interface Props {
    /** 图标名称 - 支持 Font Awesome v5 图标名称或语义化别名 */
    name: IconName;
    
    /** 图标尺寸 - 支持预设尺寸或自定义数值 */
    size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | number | string;
    
    /** 颜色变体 - 支持语义化颜色 */
    variant?: "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info" | "muted";
    
    /** 自定义颜色 - 覆盖变体颜色 */
    color?: string;
    
    /** 旋转角度 (deg) */
    rotate?: number;
    
    /** 翻转方向 */
    flip?: "horizontal" | "vertical" | "both";
    
    /** 动画效果 */
    animation?: "spin" | "pulse" | "bounce" | "shake";
    
    /** 透明度 (0-1) */
    opacity?: number;
    
    /** 是否禁用 */
    disabled?: boolean;
    
    /** 是否可点击 */
    clickable?: boolean;
    
    /** 徽章内容 */
    badge?: string | number;
    
    /** 徽章变体 */
    badgeVariant?: "default" | "primary" | "success" | "warning" | "error" | "info";
    
    /** 徽章位置 */
    badgePosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
    
    /** 事件处理器 */
    onclick?: (event: MouseEvent) => void;
    onhover?: (event: MouseEvent) => void;
    onfocus?: (event: FocusEvent) => void;
    
    /** 无障碍属性 */
    ariaLabel?: string;
    title?: string;
    role?: string;
    
    /** 样式相关 */
    class?: string;
    
    /** 支持所有 data-* 属性 */
    [key: `data-${string}`]: string | undefined;
  }
  
  let {
    name,
    size = "md",
    variant = "default",
    color,
    rotate,
    flip,
    animation,
    opacity,
    disabled = false,
    clickable = false,
    badge,
    badgeVariant = "primary",
    badgePosition = "top-right",
    onclick,
    onhover,
    onfocus,
    ariaLabel,
    title,
    role = "img",
    class: className = "",
    ...restProps
  }: Props = $props();

  let iconElement: HTMLSpanElement;
  
  // 计算图标尺寸
  let iconSize = $derived.by(() => {
    if (typeof size === 'number') return `${size}px`;
    if (typeof size === 'string' && size.includes('px')) return size;
    
    // 预设尺寸映射
    const sizeMap = {
      xs: '12px',
      sm: '14px', 
      md: '16px',
      lg: '20px',
      xl: '24px',
      '2xl': '32px'
    };
    
    return sizeMap[size as keyof typeof sizeMap] || '16px';
  });

  let iconPixelSize = $derived.by(() => {
    if (typeof size === 'number' && Number.isFinite(size)) return size;
    if (typeof size === 'string' && size.includes('px')) {
      const parsed = Number.parseInt(size, 10);
      return Number.isFinite(parsed) ? parsed : 16;
    }
    const sizeMap = {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
      '2xl': 32
    };
    return sizeMap[size as keyof typeof sizeMap] || 16;
  });

  function renderIcon() {
    if (!iconElement) return;
    setIcon(iconElement, resolveObsidianIconName(name));
    const svg = iconElement.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', String(iconPixelSize));
      svg.setAttribute('height', String(iconPixelSize));
      svg.style.width = `${iconPixelSize}px`;
      svg.style.height = `${iconPixelSize}px`;
    }
  }

  onMount(() => {
    renderIcon();
  });
  
  // 计算变换样式
  let transformStyle = $derived.by(() => {
    const transforms: string[] = [];
    
    if (rotate) transforms.push(`rotate(${rotate}deg)`);
    
    if (flip === 'horizontal') transforms.push('scaleX(-1)');
    if (flip === 'vertical') transforms.push('scaleY(-1)');
    if (flip === 'both') transforms.push('scaleX(-1) scaleY(-1)');
    
    return transforms.length > 0 ? transforms.join(' ') : undefined;
  });
  
  // 计算样式对象
  let styleObject = $derived.by(() => {
    const styles: Record<string, string> = {
      width: iconSize,
      height: iconSize,
      display: 'inline-flex',
      'align-items': 'center',
      'justify-content': 'center',
      'flex-shrink': '0'
    };
    
    // 自定义颜色覆盖变体
    if (color) {
      styles.color = color;
    }
    
    if (opacity !== undefined) {
      styles.opacity = opacity.toString();
    }
    
    const transform = transformStyle;
    if (transform) {
      styles.transform = transform;
    }
    
    if (disabled) {
      styles.opacity = '0.5';
    }
    
    return Object.entries(styles)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
  });
  
  // 计算 CSS 类
  let iconClasses = $derived.by(() => {
    const classes = [
      'weave-native-icon',
      `weave-native-icon--${variant}`,
      `weave-native-icon--${size}`
    ];
    
    if (animation) classes.push(`weave-native-icon--${animation}`);
    if (disabled) classes.push('weave-native-icon--disabled');
    if (clickable || onclick) classes.push('weave-native-icon--clickable');
    if (badge) classes.push('weave-native-icon--with-badge');
    if (className) classes.push(className);
    
    return classes.join(' ');
  });
  
  // 计算徽章类
  let badgeClasses = $derived.by(() => {
    return [
      'weave-native-icon__badge',
      `weave-native-icon__badge--${badgeVariant}`,
      `weave-native-icon__badge--${badgePosition}`
    ].join(' ');
  });
  
  // 事件处理器 - 直接使用回调而不是 event dispatcher
  function handleClick(event: MouseEvent) {
    if (disabled) return;
    onclick?.(event);
  }
  
  function handleMouseOver(event: MouseEvent) {
    if (disabled) return;
    onhover?.(event);
  }
  
  function handleFocus(event: FocusEvent) {
    if (disabled) return;
    onfocus?.(event);
  }
  
  // 计算有效的 aria-label
  let effectiveAriaLabel = $derived(ariaLabel || (typeof name === 'string' ? name : '图标'));

  // reactive a11y attributes
  let a11y = $derived({
    role: clickable ? "button" : "img",
    "aria-label": ariaLabel || name,
    "aria-hidden": !clickable && !ariaLabel ? true : undefined,
    tabindex: clickable ? 0 : undefined,
    ...restProps,
  });

  $effect(() => {
    name;
    iconPixelSize;
    renderIcon();
  });
</script>

<!-- 图标容器 -->
<span
  class={iconClasses}
  style={styleObject}
  {...a11y}
  onclick={handleClick}
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick(e as unknown as MouseEvent);
    }
  }}
>
  <!-- 图标内容 -->
  <span class="weave-native-icon__content" bind:this={iconElement}></span>
  
  <!-- 徽章 -->
  {#if badge}
    <span class={badgeClasses}>
      {badge}
    </span>
  {/if}
</span>

<style>
  /* 基础图标样式 */
  .weave-native-icon {
    position: relative;
    line-height: 1;
    transition: all 0.2s ease;
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    font: inherit;
  }

  .weave-native-icon__content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .weave-native-icon__content :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: inherit;
  }

  /* 颜色变体 */
  .weave-native-icon--default {
    color: var(--weave-text-primary);
  }

  .weave-native-icon--primary {
    color: var(--weave-accent-color);
  }

  .weave-native-icon--secondary {
    color: var(--weave-text-secondary);
  }

  .weave-native-icon--success {
    color: var(--weave-success);
  }

  .weave-native-icon--warning {
    color: var(--weave-warning);
  }

  .weave-native-icon--error {
    color: var(--weave-error);
  }

  .weave-native-icon--info {
    color: var(--weave-info);
  }

  .weave-native-icon--muted {
    color: var(--weave-text-faint);
  }

  /* 可点击状态 */
  .weave-native-icon--clickable {
    cursor: pointer;
    border-radius: var(--weave-radius-sm);
    padding: var(--weave-space-xs);
  }

  .weave-native-icon--clickable:hover:not(.weave-native-icon--disabled) {
    background-color: var(--weave-hover);
    transform: scale(1.05);
  }

  .weave-native-icon--clickable:active:not(.weave-native-icon--disabled) {
    background-color: var(--weave-active);
    transform: scale(0.95);
  }

  .weave-native-icon--clickable:focus:not(.weave-native-icon--disabled) {
    outline: 2px solid var(--weave-accent-color);
    outline-offset: 2px;
  }

  /* 禁用状态 */
  .weave-native-icon--disabled {
    cursor: not-allowed;
    pointer-events: none;
  }

  /* 动画效果 */
  .weave-native-icon--spin {
    animation: weave-native-icon-spin 1s linear infinite;
  }

  .weave-native-icon--pulse {
    animation: weave-native-icon-pulse 2s ease-in-out infinite;
  }

  .weave-native-icon--bounce {
    animation: weave-native-icon-bounce 1s ease-in-out infinite;
  }

  .weave-native-icon--shake {
    animation: weave-native-icon-shake 0.5s ease-in-out infinite;
  }

  /* 动画关键帧 */
  @keyframes weave-native-icon-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes weave-native-icon-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes weave-native-icon-bounce {
    0%, 20%, 53%, 80%, 100% { transform: translateY(0); }
    40%, 43% { transform: translateY(-8px); }
    70% { transform: translateY(-4px); }
    90% { transform: translateY(-2px); }
  }

  @keyframes weave-native-icon-shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
    20%, 40%, 60%, 80% { transform: translateX(2px); }
  }

  /* 徽章样式 */
  .weave-native-icon__badge {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    border-radius: 9999px;
    border: 2px solid var(--weave-surface);
    z-index: 1;
  }

  /* 徽章位置 */
  .weave-native-icon__badge--top-right {
    top: -0.25rem;
    right: -0.25rem;
  }

  .weave-native-icon__badge--top-left {
    top: -0.25rem;
    left: -0.25rem;
  }

  .weave-native-icon__badge--bottom-right {
    bottom: -0.25rem;
    right: -0.25rem;
  }

  .weave-native-icon__badge--bottom-left {
    bottom: -0.25rem;
    left: -0.25rem;
  }

  /* 徽章颜色变体 */
  .weave-native-icon__badge--default {
    background: var(--weave-text-secondary);
    color: var(--weave-text-on-accent);
  }

  .weave-native-icon__badge--primary {
    background: var(--weave-accent-color);
    color: var(--weave-text-on-accent);
  }

  .weave-native-icon__badge--success {
    background: var(--weave-success);
    color: var(--weave-text-on-accent);
  }

  .weave-native-icon__badge--warning {
    background: var(--weave-warning);
    color: var(--weave-text-on-accent);
  }

  .weave-native-icon__badge--error {
    background: var(--weave-error);
    color: var(--weave-text-on-accent);
  }

  .weave-native-icon__badge--info {
    background: var(--weave-info);
    color: var(--weave-text-on-accent);
  }

  /* 响应式适配 */
  @media (prefers-reduced-motion: reduce) {
    .weave-native-icon, .weave-native-icon__content :global(svg) {
      transition: none;
    }

    .weave-native-icon--spin,
    .weave-native-icon--pulse,
    .weave-native-icon--bounce,
    .weave-native-icon--shake {
      animation: none;
    }
  }

  /* 高对比度模式支持 */
  @media (prefers-contrast: high) {
    .weave-native-icon--clickable:focus:not(.weave-native-icon--disabled) {
      outline: 3px solid;
      outline-offset: 3px;
    }

    .weave-native-icon__badge {
      border-width: 3px;
    }
  }
</style>
