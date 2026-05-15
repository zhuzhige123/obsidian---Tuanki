<!--
  FloatingMenu - 通用浮动菜单组件
  
  功能：
  - 使用 Floating UI 智能定位
  - Portal 到 body，避免被父容器截断
  - 自动边界检测和位置调整
  - 支持自定义样式和动画
-->
<script lang="ts">
  import { logger } from '../../utils/logger';

  import { onMount, onDestroy, tick } from 'svelte';
  import { autoUpdate, computePosition, flip, shift, offset, type Placement } from '@floating-ui/dom';

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
    /** 可访问性角色 */
    role?: string;
    /** 关联标题元素 */
    ariaLabelledby?: string;
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
    role = 'menu',
    ariaLabelledby,
    class: customClass = '',
    children
  }: Props = $props();

  // 菜单元素引用
  let menuElement: HTMLElement | null = $state(null);

  // 计算后的位置
  let position = $state({ top: 0, left: 0 });
  let cleanupAutoUpdate: (() => void) | null = null;
  let positionRunId = 0;

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
      logger.error('[FloatingMenu] 定位计算失败:', error);
    }
  }

  function mountToBody() {
    if (!menuElement || typeof document === 'undefined') return;
    if (menuElement.parentNode === document.body) return;
    document.body.appendChild(menuElement);
  }

  function stopAutoPositioning() {
    if (!cleanupAutoUpdate) return;
    cleanupAutoUpdate();
    cleanupAutoUpdate = null;
  }

  async function setupPositioning(runId: number) {
    await tick();

    if (runId !== positionRunId || !show || !anchor || !menuElement) return;

    mountToBody();
    await updatePosition();

    requestAnimationFrame(() => {
      if (runId !== positionRunId) return;
      void updatePosition();
    });

    stopAutoPositioning();
    cleanupAutoUpdate = autoUpdate(anchor, menuElement, () => {
      void updatePosition();
    });
  }

  /**
   * 处理点击外部关闭
   * 排除 Obsidian 原生 Menu（ObsidianDropdown 使用），其 DOM 渲染在 body 下而非 FloatingMenu 内部
   */
  function handleClickOutside(event: MouseEvent) {
    if (!show || !menuElement) return;

    const target = event.target as Node;
    if (menuElement.contains(target) || anchor?.contains(target)) {
      return;
    }

    // Obsidian 原生 Menu 的 DOM 在 body 下，不在 FloatingMenu 内部
    // 点击 Menu 菜单项时不应关闭 FloatingMenu
    if (target instanceof Element && target.closest('.menu')) {
      return;
    }

    onClose?.();
  }

  function handleKeydown(_event: KeyboardEvent) {
  }

  // 监听 show 和 anchor 变化，更新位置
  $effect(() => {
    const isVisible = show;
    const anchorElement = anchor;
    const currentMenuElement = menuElement;
    positionRunId += 1;
    const runId = positionRunId;

    stopAutoPositioning();

    if (!isVisible || !anchorElement || !currentMenuElement) {
      return;
    }

    void setupPositioning(runId);

    return () => {
      if (positionRunId === runId) {
        stopAutoPositioning();
      }
    };
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
    stopAutoPositioning();
  });
</script>

{#if show}
  <div
    bind:this={menuElement}
    class="floating-menu {customClass}"
    style="top: {position.top}px; left: {position.left}px;"
    role={role}
    aria-hidden={!show}
    aria-labelledby={ariaLabelledby}
  >
    {@render children?.()}
  </div>
{/if}

<style>
  .floating-menu {
    position: fixed;
    background: var(--background-primary);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 60%, transparent);
    border-radius: 12px;
    overflow: visible;
    box-shadow: 
      0 8px 24px rgba(0, 0, 0, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: var(--weave-z-menu, 1200); /* Portal 到 body 时也要有可用的全局回退层级 */
    min-width: 180px;
    max-width: 400px;
    width: max-content;
    backdrop-filter: blur(8px);
    
    /* 动画 */
    animation: slideInFade 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: top left;
  }

  @keyframes slideInFade {
    from {
      opacity: 0;
      transform: scale(0.92) translateY(-12px);
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

  :global(.menu) {
    z-index: var(--weave-z-dropdown, 1600);
  }
</style>
