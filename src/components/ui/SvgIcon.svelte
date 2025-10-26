<!--
  SVG 图标组件 - 符合 Obsidian CSP 策略
  使用内联 SVG，无需外部 CDN
-->
<script lang="ts">
  import { createSvgIcon, createSvgIconString, SVG_ICONS, ICON_MAPPING, type SvgIconOptions } from '../../utils/svg-icons';
  import { onMount } from 'svelte';

  interface Props {
    /** 图标名称 */
    name: keyof typeof SVG_ICONS;
    /** 图标大小 */
    size?: number | string;
    /** CSS 类名 */
    className?: string;
    /** 图标颜色 */
    color?: string;
    /** 是否使用 FontAwesome 兼容模式 */
    faCompat?: boolean;
    /** FontAwesome 类名（当 faCompat 为 true 时使用） */
    faClass?: string;
  }

  let { 
    name, 
    size = 16, 
    className = '', 
    color = 'currentColor',
    faCompat = false,
    faClass = ''
  }: Props = $props();

  let iconElement: HTMLElement;

  // 根据 FontAwesome 类名获取图标名称
  function getIconNameFromFaClass(faClassName: string): keyof typeof SVG_ICONS | null {
    const mappedName = ICON_MAPPING[faClassName as keyof typeof ICON_MAPPING];
    return mappedName || null;
  }

  // 创建图标
  function createIcon(): HTMLElement | null {
    let iconName: keyof typeof SVG_ICONS;

    if (faCompat && faClass) {
      const mappedName = getIconNameFromFaClass(faClass);
      if (!mappedName) {
        console.warn(`未找到 FontAwesome 图标映射: ${faClass}`);
        return null;
      }
      iconName = mappedName;
    } else {
      iconName = name;
    }

    if (!SVG_ICONS[iconName]) {
      console.warn(`未找到图标: ${iconName}`);
      return null;
    }

    const options: SvgIconOptions = {
      size,
      className: `tuanki-icon ${className}`.trim(),
      color
    };

    return createSvgIcon(iconName, options);
  }

  onMount(() => {
    const icon = createIcon();
    if (icon && iconElement) {
      iconElement.appendChild(icon);
    }
  });

  // 响应式更新图标
  $effect(() => {
    if (iconElement) {
      // 清空现有内容
      iconElement.innerHTML = '';
      
      // 创建新图标
      const icon = createIcon();
      if (icon) {
        iconElement.appendChild(icon);
      }
    }
  });
</script>

<!-- 图标容器 -->
<span 
  bind:this={iconElement}
  class="tuanki-icon-container {className}"
  style="display: inline-block; width: {typeof size === 'number' ? size + 'px' : size}; height: {typeof size === 'number' ? size + 'px' : size};"
  role="img"
  aria-hidden="true"
></span>

<style>
  .tuanki-icon-container {
    vertical-align: middle;
    line-height: 1;
  }

  .tuanki-icon-container :global(svg) {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }

  /* 确保图标在不同上下文中正确显示 */
  .tuanki-icon-container :global(.tuanki-icon) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
