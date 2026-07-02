<script lang="ts">
  import type { WeaveTimerHandle } from "../../types/timer-handle.js";
  import { logger } from '../../utils/logger';
  import { vaultStorage } from '../../utils/vault-local-storage';

  import { onMount, onDestroy } from 'svelte';
  import EnhancedIcon from './EnhancedIcon.svelte';
  import { ICON_NAMES } from '../../icons/index.js';
  import type WeavePlugin from '../../main.js';
  import { tr } from '../../utils/i18n';


  interface Props {
    plugin: WeavePlugin;
    onCreateCard?: () => void;
  }

  let { plugin, onCreateCard }: Props = $props();
  let t = $derived($tr);

  // 按钮状态
  let isDragging = $state(false);
  let isHovered = $state(false);
  let isVisible = $state(true);
  let isDarkMode = $state(true); // 主题检测


  // 位置状态 - 默认设置在右下角，避免初始化时位于 (0,0) 导致遮挡
  let position = $state({ 
    x: typeof window !== 'undefined' ? window.innerWidth - 80 : 0, 
    y: typeof window !== 'undefined' ? window.innerHeight - 80 : 0 
  });
  let dragOffset = $state({ x: 0, y: 0 });
  let buttonElement: HTMLElement | undefined = $state();

  // 拖拽检测状态
  let mouseDownTime = $state(0);
  let mouseDownPosition = $state({ x: 0, y: 0 });
  let hasMoved = $state(false);
  let dragThreshold = 5; // 像素阈值，超过这个距离才认为是拖拽

  //  移动端触摸拖动状态
  let longPressTimer: WeaveTimerHandle | undefined;
  let isTouchDragging = $state(false);
  let touchStartPosition = $state({ x: 0, y: 0 });
  const LONG_PRESS_DURATION = 500; // 长按 500ms 触发拖动

  // 存储键名
  const POSITION_STORAGE_KEY = 'weave-floating-button-position';

  // 防抖保存位置
  let savePositionTimer: WeaveTimerHandle | undefined;

  // 检测主题模式
  function detectTheme() {
    const bodyClasses = activeDocument.body.classList;
    isDarkMode = bodyClasses.contains('theme-dark');
  }

  // 监听主题变化
  function observeThemeChange() {
    const observer = new MutationObserver(() => {
      detectTheme();
    });

    observer.observe(activeDocument.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }

  // 初始化位置
  onMount(() => {
    // 先加载保存的位置，如果没有则使用默认位置
    loadPosition();
    setDefaultPosition();
    detectTheme(); // 初始检测
    
    const cleanup = observeThemeChange(); // 监听主题变化
    
    // 确保按钮在视窗内
    handleResize();
    
    return cleanup;
  });

  // 加载保存的位置
  function loadPosition() {
    try {
      const savedPosition = vaultStorage.getItem(POSITION_STORAGE_KEY);
      if (savedPosition) {
        const parsed = JSON.parse(savedPosition);
        // 确保加载的位置有效（不为0,0）
        if (parsed.x && parsed.y) {
          position = { x: parsed.x, y: parsed.y };
        }
      }
    } catch (error) {
      logger.warn('Failed to load floating button position:', error);
    }
  }

  // 保存位置（防抖）
  function savePosition() {
    if (savePositionTimer) {
      window.clearTimeout(savePositionTimer);
    }

    savePositionTimer = window.setTimeout(() => {
      try {
        vaultStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
      } catch (error) {
        logger.warn('Failed to save floating button position:', error);
      }
    }, 100); // 100ms防抖
  }

  // 立即保存位置（用于拖拽结束）
  function savePositionImmediate() {
    if (savePositionTimer) {
      window.clearTimeout(savePositionTimer);
    }
    try {
      vaultStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch (error) {
      logger.warn('Failed to save floating button position:', error);
    }
  }

  // 设置默认位置（右下角） - 如果没有保存的位置则使用默认值
  function setDefaultPosition() {
    // 只在localStorage中没有保存位置时才设置默认位置
    const savedPosition = vaultStorage.getItem(POSITION_STORAGE_KEY);
    if (!savedPosition) {
      //  移动端需要考虑 Obsidian 底部栏高度（44px）
      const isMobile = activeDocument.body.classList.contains('is-mobile');
      const bottomOffset = isMobile ? 100 : 80; // 移动端留出更多空间
      position = {
        x: window.innerWidth - 80,
        y: window.innerHeight - bottomOffset
      };
    }
  }

  // 处理鼠标按下事件
  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return; // 只处理左键

    // 记录按下时间和位置
    mouseDownTime = Date.now();
    mouseDownPosition = { x: event.clientX, y: event.clientY };
    hasMoved = false;

    const rect = buttonElement?.getBoundingClientRect();
    if (rect) {
      dragOffset = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    // 添加全局事件监听器，使用 passive: false 确保可以阻止默认行为
    activeDocument.addEventListener('mousemove', handleMouseMove, { passive: false });
    activeDocument.addEventListener('mouseup', handleMouseUp, { passive: false });

    // 防止默认行为，拖拽时只需要 preventDefault
    event.preventDefault();
    // Svelte 5: 拖拽操作不需要 stopPropagation，让事件自然冒泡
  }

  // 处理鼠标移动事件
  function handleMouseMove(event: MouseEvent) {
    // 安全检查：如果鼠标按键已松开（mouseup 事件可能在窗口外丢失），自动清理
    if (event.buttons === 0) {
      handleMouseUp();
      return;
    }

    // 计算移动距离
    const deltaX = event.clientX - mouseDownPosition.x;
    const deltaY = event.clientY - mouseDownPosition.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // 如果移动距离超过阈值，才开始拖拽
    if (!hasMoved && distance > dragThreshold) {
      hasMoved = true;
      isDragging = true;

      //  警告：修改全局 document.body 样式
      // 必须在 onDestroy 中清理，防止组件销毁时样式残留导致黑屏
      // 禁用页面滚动和选择
      activeDocument.body.style.userSelect = 'none';
      activeDocument.body.style.overflow = 'hidden';
    }

    if (!isDragging) return;

    // 防止默认行为，避免页面滚动等干扰
    event.preventDefault();
    // Svelte 5: 拖拽移动时不需要 stopPropagation

    const newX = event.clientX - dragOffset.x;
    const newY = event.clientY - dragOffset.y;

    // 限制在视窗范围内，留出一些边距
    const margin = 10;
    const buttonSize = 60;
    const maxX = window.innerWidth - buttonSize - margin;
    const maxY = window.innerHeight - buttonSize - margin;

    // 使用 requestAnimationFrame 确保流畅的动画
    requestAnimationFrame(() => {
      position = {
        x: Math.max(margin, Math.min(newX, maxX)),
        y: Math.max(margin, Math.min(newY, maxY))
      };
    });
  }

  // 处理鼠标释放事件
  function handleMouseUp() {
    const wasClicked = !hasMoved; // 如果没有移动，认为是点击

    if (isDragging) {
      isDragging = false;
      savePositionImmediate(); // 拖拽结束立即保存

      // 恢复页面的正常行为
      activeDocument.body.style.userSelect = '';
      activeDocument.body.style.overflow = '';
    }

    // 移除全局事件监听器
    activeDocument.removeEventListener('mousemove', handleMouseMove);
    activeDocument.removeEventListener('mouseup', handleMouseUp);

    // 如果是点击（没有拖拽），触发新建卡片
    if (wasClicked) {
      handleButtonClick();
    }

    // 强制重置所有拖拽相关状态，防止状态残留
    isDragging = false;
    hasMoved = false;
    mouseDownTime = 0;
    isHovered = false;
  }

  //  处理触摸开始事件
  function handleTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) return; // 只处理单指触摸

    const touch = event.touches[0];
    touchStartPosition = { x: touch.clientX, y: touch.clientY };
    hasMoved = false;

    const rect = buttonElement?.getBoundingClientRect();
    if (rect) {
      dragOffset = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    }

    // 设置长按定时器
    longPressTimer = window.setTimeout(() => {
      // 长按触发拖动模式
      isTouchDragging = true;
      isDragging = true;
      
      // 触觉反馈
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // 禁用页面滚动
      activeDocument.body.style.overflow = 'hidden';
      activeDocument.body.style.touchAction = 'none';
    }, LONG_PRESS_DURATION);

    // 添加全局触摸事件监听器
    activeDocument.addEventListener('touchmove', handleTouchMove, { passive: false });
    activeDocument.addEventListener('touchend', handleTouchEnd, { passive: false });
    activeDocument.addEventListener('touchcancel', handleTouchEnd, { passive: false });
  }

  //  处理触摸移动事件
  function handleTouchMove(event: TouchEvent) {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartPosition.x;
    const deltaY = touch.clientY - touchStartPosition.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // 如果移动了，取消长按定时器（除非已经进入拖动模式）
    if (!isTouchDragging && distance > dragThreshold) {
      if (longPressTimer) {
        window.clearTimeout(longPressTimer);
        longPressTimer = undefined;
      }
      hasMoved = true;
      return; // 不是拖动模式，不处理移动
    }

    // 如果在拖动模式，更新位置
    if (isTouchDragging) {
      event.preventDefault(); // 阻止页面滚动

      const newX = touch.clientX - dragOffset.x;
      const newY = touch.clientY - dragOffset.y;

      // 限制在视窗范围内
      const margin = 10;
      const buttonSize = 60;
      const maxX = window.innerWidth - buttonSize - margin;
      const maxY = window.innerHeight - buttonSize - margin;

      requestAnimationFrame(() => {
        position = {
          x: Math.max(margin, Math.min(newX, maxX)),
          y: Math.max(margin, Math.min(newY, maxY))
        };
      });
    }
  }

  //  处理触摸结束事件
  function handleTouchEnd(event: TouchEvent) {
    // 清除长按定时器
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }

    const wasTouchDragging = isTouchDragging;
    const wasClicked = !hasMoved && !wasTouchDragging;

    if (wasTouchDragging) {
      // 拖动结束，保存位置
      savePositionImmediate();
      
      // 触觉反馈
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    }

    // 恢复页面正常行为
    activeDocument.body.style.overflow = '';
    activeDocument.body.style.touchAction = '';

    // 移除全局触摸事件监听器
    activeDocument.removeEventListener('touchmove', handleTouchMove);
    activeDocument.removeEventListener('touchend', handleTouchEnd);
    activeDocument.removeEventListener('touchcancel', handleTouchEnd);

    // 重置状态
    isTouchDragging = false;
    isDragging = false;
    hasMoved = false;

    // 如果是点击（没有拖动），触发新建卡片
    if (wasClicked) {
      handleButtonClick();
    }
  }

  // 处理按钮点击事件
  function handleButtonClick() {
    // 触发新建卡片
    if (onCreateCard) {
      onCreateCard();
    } else {
      //  传递非空初始内容，确保编辑器有初始内容
      // 使用符合解析规则的格式（---div--- 分隔符）
      plugin.openCreateCardModal({
        initialContent: '\n\n---div---\n\n',  // 提供标准问答格式占位符
      });
    }
  }


  // 处理窗口大小变化
  function handleResize() {
    const margin = 10;
    const buttonSize = 60;
    //  移动端需要考虑 Obsidian 底部栏高度（44px）
    const isMobile = activeDocument.body.classList.contains('is-mobile');
    const bottomMargin = isMobile ? 54 : margin; // 移动端底部留出更多空间
    const maxX = window.innerWidth - buttonSize - margin;
    const maxY = window.innerHeight - buttonSize - bottomMargin;

    position = {
      x: Math.max(margin, Math.min(position.x, maxX)),
      y: Math.max(margin, Math.min(position.y, maxY))
    };
    savePosition(); // 使用防抖保存
  }

  // 监听窗口大小变化
  onMount(() => {
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  // 清理事件监听器和全局状态
  onDestroy(() => {
    activeDocument.removeEventListener('mousemove', handleMouseMove);
    activeDocument.removeEventListener('mouseup', handleMouseUp);
    activeDocument.removeEventListener('touchmove', handleTouchMove);
    activeDocument.removeEventListener('touchend', handleTouchEnd);
    activeDocument.removeEventListener('touchcancel', handleTouchEnd);
    window.removeEventListener('resize', handleResize);

    // 清理定时器
    if (savePositionTimer) {
      window.clearTimeout(savePositionTimer);
    }
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
    }

    //  关键修复：强制清理全局 document.body 样式
    // 防止组件在拖拽状态下被销毁时样式残留，导致黑屏和影响其他插件
    // 这是多层防御的最后一道保障，即使 handleMouseUp 未执行也能正确清理
    activeDocument.body.style.overflow = '';
    activeDocument.body.style.userSelect = '';
    activeDocument.body.style.cursor = '';
    activeDocument.body.style.touchAction = '';
  });

  // 计算按钮样式
  let buttonStyle = $derived.by(() => {
    const baseScale = isDragging ? 'scale(1.1)' : isHovered ? 'scale(1.05)' : 'scale(1)';
    const translateTransform = `translate3d(${position.x}px, ${position.y}px, 0)`;

    return `
      transform: ${translateTransform} ${baseScale};
      z-index: ${isDragging ? '10001' : '10000'};
      transition: ${isDragging ? 'none' : 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)'};
      will-change: ${isDragging ? 'transform' : 'auto'};
    `;
  });
</script>

<!-- 悬浮新建卡片按钮 -->
{#if isVisible}
  <button
    bind:this={buttonElement}
    class="floating-create-card-button"
    class:dragging={isDragging}
    class:hovered={isHovered}
    class:touch-dragging={isTouchDragging}

    style={buttonStyle}
    onmousedown={handleMouseDown}
    onmouseenter={() => isHovered = true}
    onmouseleave={() => isHovered = false}
    ontouchstart={handleTouchStart}
    title={t('ui.newCard')}
    aria-label={t('ui.newCard')}
  >
    <EnhancedIcon 
      name={ICON_NAMES.ADD} 
      size={24} 
      variant="primary"
    />
    
    <!-- 拖拽提示 -->
    {#if isDragging || isTouchDragging}
      <div class="drag-hint">
        {isTouchDragging ? '松开放置' : '拖拽移动'}
      </div>
    {/if}
  </button>
{/if}

<style>
  .floating-create-card-button {
    position: fixed;
    top: 0;
    left: 0;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--interactive-accent);
    border: 2px solid rgba(255, 255, 255, 0.15);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.15),
      0 2px 6px rgba(0, 0, 0, 0.1),
      0 0 0 0 rgba(139, 92, 246, 0.4);
    user-select: none;
    color: white;
    z-index: var(--weave-z-top);
    /*  关键修复：移除 backdrop-filter - 这是导致黑屏的真正原因 */
    /* backdrop-filter: blur(10px); */
    /* 移除transition，由JavaScript动态控制 */
  }

  /* 浅色模式优化 */
  :global(body:not(.theme-dark)) .floating-create-card-button {
    background: var(--interactive-accent);
    border: 2px solid color-mix(in srgb, var(--interactive-accent) 20%, transparent);
    box-shadow:
      0 4px 16px rgba(139, 92, 246, 0.25),
      0 2px 8px rgba(99, 102, 241, 0.2),
      0 0 0 0 rgba(139, 92, 246, 0.5);
  }

  .floating-create-card-button:hover {
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.2),
      0 3px 10px rgba(0, 0, 0, 0.15),
      0 0 0 4px rgba(139, 92, 246, 0.2);
    border-color: rgba(255, 255, 255, 0.25);
  }

  /* 浅色模式悬停优化 */
  :global(body:not(.theme-dark)) .floating-create-card-button:hover {
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    box-shadow:
      0 6px 24px rgba(139, 92, 246, 0.35),
      0 3px 12px rgba(99, 102, 241, 0.25),
      0 0 0 4px rgba(139, 92, 246, 0.15);
    border-color: rgba(139, 92, 246, 0.3);
  }

  .floating-create-card-button:active {
    filter: brightness(0.95);
  }

  .floating-create-card-button.dragging {
    cursor: grabbing;
    box-shadow:
      0 12px 35px rgba(0, 0, 0, 0.3),
      0 6px 20px rgba(0, 0, 0, 0.25),
      0 0 0 6px rgba(139, 92, 246, 0.3);
    filter: brightness(1.1);
  }

  /*  触摸拖动状态 */
  .floating-create-card-button.touch-dragging {
    box-shadow:
      0 16px 45px rgba(0, 0, 0, 0.35),
      0 8px 25px rgba(0, 0, 0, 0.3),
      0 0 0 8px rgba(139, 92, 246, 0.4);
    filter: brightness(1.15);
    transform: scale(1.15);
  }

  /* 浅色模式拖拽优化 */
  :global(body:not(.theme-dark)) .floating-create-card-button.dragging {
    box-shadow:
      0 12px 40px rgba(139, 92, 246, 0.4),
      0 6px 25px rgba(99, 102, 241, 0.3),
      0 0 0 6px rgba(139, 92, 246, 0.2);
    filter: brightness(0.95);
  }

  .floating-create-card-button.hovered:not(.dragging) {
    animation: pulse 2s infinite;
  }


  .drag-hint {
    position: absolute;
    top: -35px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--background-primary);
    color: var(--text-normal);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    border: 1px solid var(--background-modifier-border);
    z-index: calc(var(--weave-z-top) + 2);
  }

  .drag-hint::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: var(--background-primary);
  }


  /* 脉冲动画 */
  @keyframes pulse {
    0%, 100% {
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.15),
        0 2px 6px rgba(0, 0, 0, 0.1),
        0 0 0 0 rgba(139, 92, 246, 0.7);
    }
    50% {
      box-shadow:
        0 6px 20px rgba(0, 0, 0, 0.2),
        0 3px 10px rgba(0, 0, 0, 0.15),
        0 0 0 10px rgba(139, 92, 246, 0);
    }
  }

  /* 拖拽目标脉冲动画 */
  @keyframes dropTargetPulse {
    0%, 100% {
      box-shadow:
        0 8px 30px rgba(16, 185, 129, 0.4),
        0 4px 20px rgba(16, 185, 129, 0.3),
        0 0 0 8px rgba(16, 185, 129, 0.2);
    }
    50% {
      box-shadow:
        0 12px 40px rgba(16, 185, 129, 0.6),
        0 6px 30px rgba(16, 185, 129, 0.5),
        0 0 0 12px rgba(16, 185, 129, 0);
    }
  }

  /* 拖拽提示弹跳动画 */
  @keyframes dropHintBounce {
    0% {
      transform: translateX(-50%) translateY(10px);
      opacity: 0;
    }
    50% {
      transform: translateX(-50%) translateY(-5px);
      opacity: 1;
    }
    100% {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }

  /* 响应式适配 */
  @media (max-width: 768px) {
    .floating-create-card-button {
      width: 56px;
      height: 56px;
    }
  }

  /*  移动端适配 - 确保在 Obsidian 底部栏上方 */
  :global(body.is-mobile) .floating-create-card-button {
    width: 48px;
    height: 48px;
    /* 移动端默认位置：右下角，Obsidian 底部栏上方 */
    /* 注意：实际位置由 JavaScript 控制，这里只是确保最小安全距离 */
  }

  /* 移动端拖拽提示样式优化 */
  :global(body.is-mobile) .drag-hint {
    font-size: 11px;
    padding: 3px 6px;
    top: -30px;
  }

  /* 减少动画模式 */
  @media (prefers-reduced-motion: reduce) {
    .floating-create-card-button {
      transition: none;
    }
    
    .floating-create-card-button.hovered:not(.dragging) {
      animation: none;
    }
  }

  /* 高对比度模式 */
  @media (prefers-contrast: high) {
    .floating-create-card-button {
      border: 2px solid var(--text-normal);
    }
  }
</style>
