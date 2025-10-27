<!--
  FloatingMenu - 通用浮动菜单组件
  
  功能：
  - 使用 Floating UI 智能定位
  - Portal 到 body，避免被父容器截断
  - 自动边界检测和位置调整
  - 支持自定义样式和动画
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { computePosition, flip, shift, offset, type Placement } from '@floating-ui/dom';

  interface Props {
    /** 是否显示菜单 */
    show: boolean;
    /** 锚点元素（按钮） */
    anchor: HTMLElement | null;
    /** 首选位置 */
    placement?: Placement;
    /** 与锚点的间距 */
    offset?: number;
    /** 关闭回调 */
    onClose?: () => void;
    /** 自定义class */
    class?: string;
    /** 子内容 */
    children?: any;
  }

  let {
    show = $bindable(),
    anchor,
    placement = 'right-start',
    offset: offsetValue = 8,
    onClose,
    class: customClass = '',
    children
  }: Props = $props();

  // 菜单元素引用
  let menuElement: HTMLElement | null = $state(null);

  // 计算后的位置
  let position = $state({ top: 0, left: 0 });

  /**
   * 更新菜单位置
   */
  async function updatePosition() {
    if (!show || !anchor || !menuElement) return;

    try {
      const { x, y } = await computePosition(anchor, menuElement, {
        placement,
        middleware: [
          offset(offsetValue),
          flip({
            fallbackPlacements: ['left-start', 'bottom-start', 'top-start', 'right-end', 'left-end']
          }),
          shift({
            padding: 8
          })
        ]
      });

      position = {
        top: y,
        left: x
      };
    } catch (error) {
      console.error('[FloatingMenu] 定位计算失败:', error);
    }
  }

  /**
   * 处理点击外部关闭
   */
  function handleClickOutside(event: MouseEvent) {
    if (!show || !menuElement) return;

    const target = event.target as Node;
    if (menuElement.contains(target) || anchor?.contains(target)) {
      return;
    }

    onClose?.();
  }

  /**
   * 处理 Escape 键关闭
   */
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && show) {
      event.preventDefault();
      onClose?.();
    }
  }

  // 监听 show 和 anchor 变化，更新位置
  $effect(() => {
    if (show && anchor) {
      // 等待DOM更新后再计算位置
      setTimeout(() => updatePosition(), 0);

      // 窗口大小变化时重新计算
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  });

  // 监听点击外部和键盘事件
  onMount(() => {
    // 添加全局事件监听
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    // 清理事件监听
    document.removeEventListener('mousedown', handleClickOutside);
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if show}
  <div
    bind:this={menuElement}
    class="floating-menu {customClass}"
    style="top: {position.top}px; left: {position.left}px;"
    role="menu"
    aria-hidden={!show}
  >
    {@render children?.()}
  </div>
{/if}

<style>
  .floating-menu {
    position: fixed;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 2147483647; /* 最大 z-index，确保显示在所有元素之上 */
    min-width: 180px;
    max-width: 400px;
    width: max-content;
    
    /* 动画 */
    animation: slideInFade 0.2s ease-out;
    transform-origin: top left;
  }

  @keyframes slideInFade {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  /* 全局样式：确保 portal 到 body 的菜单不受父容器影响 */
  :global(body > .floating-menu) {
    position: fixed !important;
  }
</style>

