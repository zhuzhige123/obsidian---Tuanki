<script lang="ts">
  import { createResponsiveManager, getResponsiveClasses, getObsidianResponsiveConfig } from '../../utils/responsive';
  import type { ResponsiveBreakpoints, ResponsiveState } from '../../utils/responsive';
  import { addThemeClasses } from '../../utils/theme-detection';

  interface Props {
    /**
     * 自定义断点配置
     */
    breakpoints?: ResponsiveBreakpoints;
    /**
     * CSS 类名前缀
     */
    classPrefix?: string;
    /**
     * 是否自动检测 Obsidian 环境
     */
    autoDetectObsidian?: boolean;
    /**
     * 额外的 CSS 类名
     */
    class?: string;
    /**
     * 子组件
     */
    children?: any;
  }

  let {
    breakpoints,
    classPrefix = 'responsive',
    autoDetectObsidian = true,
    class: additionalClasses = '',
    children
  }: Props = $props();

  // 容器元素引用
  let containerElement: HTMLDivElement | null = $state(null);

  // 响应式状态
  let responsive = $state<ResponsiveState | null>(null);
  let responsiveManager: any = null;
  let themeCleanup: (() => void) | null = null;

  // 初始化响应式状态
  $effect(() => {
    if (!containerElement) {
      responsive = null;
      if (responsiveManager) {
        responsiveManager.destroy();
        responsiveManager = null;
      }
      return;
    }

    // 自动检测 Obsidian 环境并使用相应的断点
    const finalBreakpoints = autoDetectObsidian && !breakpoints
      ? getObsidianResponsiveConfig(containerElement)
      : breakpoints;

    // 创建响应式管理器
    const createManager = createResponsiveManager(finalBreakpoints);
    responsiveManager = createManager(containerElement);

    // 订阅状态变化
    const unsubscribe = responsiveManager.subscribe((newState: ResponsiveState) => {
      responsive = newState;
    });

    // 初始化
    responsiveManager.init();

    // 应用主题类到容器
    themeCleanup = addThemeClasses(containerElement);

    // 清理函数
    return () => {
      unsubscribe();
      if (responsiveManager) {
        responsiveManager.destroy();
        responsiveManager = null;
      }
      if (themeCleanup) {
        themeCleanup();
        themeCleanup = null;
      }
    };
  });

  // 生成响应式 CSS 类名
  const responsiveClasses = $derived(() => {
    if (!responsive) return '';
    return getResponsiveClasses(responsive, classPrefix).join(' ');
  });

  // 最终的 CSS 类名
  const finalClasses = $derived(() => {
    const classes = ['tuanki-responsive-container'];
    const respClasses = responsiveClasses();
    if (respClasses) classes.push(respClasses);
    if (additionalClasses) classes.push(additionalClasses);
    return classes.join(' ');
  });
</script>

<div 
  bind:this={containerElement}
  class={finalClasses}
  data-responsive-width={responsive?.width || 0}
  data-responsive-breakpoint={responsive?.breakpoint || 'desktop'}
>
  {#if children}
    {@render children(responsive)}
  {/if}
</div>

<style>
  .responsive-container {
    width: 100%;
    height: 100%;
    position: relative;
  }

  /* 基础响应式样式 */
  .responsive-container.responsive-mobile {
    --layout-mode: mobile;
    --sidebar-width: 0;
    --content-padding: 0.5rem;
    --font-size-scale: 0.9;
  }

  .responsive-container.responsive-tablet {
    --layout-mode: tablet;
    --sidebar-width: 200px;
    --content-padding: 1rem;
    --font-size-scale: 1;
  }

  .responsive-container.responsive-desktop {
    --layout-mode: desktop;
    --sidebar-width: 250px;
    --content-padding: 1.5rem;
    --font-size-scale: 1;
  }

  /* 宽度特定的样式 */
  .responsive-container.responsive-width-300 {
    --columns: 1;
    --grid-gap: 0.5rem;
  }

  .responsive-container.responsive-width-400 {
    --columns: 1;
    --grid-gap: 0.75rem;
  }

  .responsive-container.responsive-width-500 {
    --columns: 2;
    --grid-gap: 1rem;
  }

  .responsive-container.responsive-width-600 {
    --columns: 2;
    --grid-gap: 1rem;
  }

  .responsive-container.responsive-width-700 {
    --columns: 3;
    --grid-gap: 1.25rem;
  }

  .responsive-container.responsive-width-800 {
    --columns: 3;
    --grid-gap: 1.5rem;
  }

  /* 为子组件提供 CSS 变量 */
  .responsive-container {
    --responsive-padding: var(--content-padding, 1rem);
    --responsive-gap: var(--grid-gap, 1rem);
    --responsive-columns: var(--columns, 1);
    --responsive-font-scale: var(--font-size-scale, 1);
  }


</style>
