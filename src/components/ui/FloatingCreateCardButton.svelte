<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import EnhancedIcon from './EnhancedIcon.svelte';
  import { ICON_NAMES } from '../../icons/index.js';
  import type AnkiPlugin from '../../main.js';


  interface Props {
    plugin: AnkiPlugin;
    onCreateCard?: () => void;
  }

  let { plugin, onCreateCard }: Props = $props();

  // 按钮状态
  let isDragging = $state(false);
  let isHovered = $state(false);
  let isVisible = $state(true);
  let isDarkMode = $state(true); // 主题检测


  // 位置状态
  let position = $state({ x: 0, y: 0 });
  let dragOffset = $state({ x: 0, y: 0 });
  let buttonElement: HTMLElement | undefined = $state();

  // 拖拽检测状态
  let mouseDownTime = $state(0);
  let mouseDownPosition = $state({ x: 0, y: 0 });
  let hasMoved = $state(false);
  let dragThreshold = 5; // 像素阈值，超过这个距离才认为是拖拽

  // 存储键名
  const POSITION_STORAGE_KEY = 'tuanki-floating-button-position';

  // 防抖保存位置
  let savePositionTimer: ReturnType<typeof setTimeout> | undefined;

  // 检测主题模式
  function detectTheme() {
    const bodyClasses = document.body.classList;
    isDarkMode = bodyClasses.contains('theme-dark');
  }

  // 监听主题变化
  function observeThemeChange() {
    const observer = new MutationObserver(() => {
      detectTheme();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }

  // 初始化位置
  onMount(() => {
    loadPosition();
    setDefaultPosition();
    detectTheme(); // 初始检测
    
    const cleanup = observeThemeChange(); // 监听主题变化
    
    return cleanup;
  });

  // 加载保存的位置
  function loadPosition() {
    try {
      const savedPosition = localStorage.getItem(POSITION_STORAGE_KEY);
      if (savedPosition) {
        const parsed = JSON.parse(savedPosition);
        position = { x: parsed.x || 0, y: parsed.y || 0 };
      }
    } catch (error) {
      console.warn('Failed to load floating button position:', error);
    }
  }

  // 保存位置（防抖）
  function savePosition() {
    if (savePositionTimer) {
      clearTimeout(savePositionTimer);
    }

    savePositionTimer = setTimeout(() => {
      try {
        localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
      } catch (error) {
        console.warn('Failed to save floating button position:', error);
      }
    }, 100); // 100ms防抖
  }

  // 立即保存位置（用于拖拽结束）
  function savePositionImmediate() {
    if (savePositionTimer) {
      clearTimeout(savePositionTimer);
    }
    try {
      localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch (error) {
      console.warn('Failed to save floating button position:', error);
    }
  }

  // 设置默认位置（右下角）
  function setDefaultPosition() {
    if (position.x === 0 && position.y === 0) {
      position = {
        x: window.innerWidth - 80,
        y: window.innerHeight - 80
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
    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp, { passive: false });

    // 防止默认行为和事件冒泡
    event.preventDefault();
    event.stopPropagation();
  }

  // 处理鼠标移动事件
  function handleMouseMove(event: MouseEvent) {
    // 计算移动距离
    const deltaX = event.clientX - mouseDownPosition.x;
    const deltaY = event.clientY - mouseDownPosition.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // 如果移动距离超过阈值，才开始拖拽
    if (!hasMoved && distance > dragThreshold) {
      hasMoved = true;
      isDragging = true;

      // 禁用页面滚动和选择
      document.body.style.userSelect = 'none';
      document.body.style.overflow = 'hidden';
    }

    if (!isDragging) return;

    // 防止默认行为，避免页面滚动等干扰
    event.preventDefault();
    event.stopPropagation();

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
      document.body.style.userSelect = '';
      document.body.style.overflow = '';
    }

    // 移除全局事件监听器
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // 如果是点击（没有拖拽），触发新建卡片
    if (wasClicked) {
      handleButtonClick();
    }

    // 重置状态
    hasMoved = false;
    mouseDownTime = 0;
  }

  // 处理按钮点击事件
  function handleButtonClick() {
    // 触发新建卡片
    if (onCreateCard) {
      onCreateCard();
    } else {
      // 默认行为：打开新建卡片模态框
      plugin.openCreateCardModal();
    }
  }


  // 处理窗口大小变化
  function handleResize() {
    const margin = 10;
    const buttonSize = 60;
    const maxX = window.innerWidth - buttonSize - margin;
    const maxY = window.innerHeight - buttonSize - margin;

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

  // 清理事件监听器
  onDestroy(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('resize', handleResize);

    // 清理定时器
    if (savePositionTimer) {
      clearTimeout(savePositionTimer);
    }
  });

  // 计算按钮样式
  let buttonStyle = $derived(() => {
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

    style={buttonStyle()}
    onmousedown={handleMouseDown}
    onmouseenter={() => isHovered = true}
    onmouseleave={() => isHovered = false}
    title="新建卡片"
    aria-label="新建卡片"
  >
    <EnhancedIcon 
      name={ICON_NAMES.ADD} 
      size={24} 
      variant="primary"
    />
    
    <!-- 拖拽提示 -->
    {#if isDragging}
      <div class="drag-hint">
        拖拽移动
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
    z-index: 10000;
    backdrop-filter: blur(10px);
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
    transform: translateY(-2px);
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
    transform: scale(0.95);
  }

  .floating-create-card-button.dragging {
    cursor: grabbing;
    box-shadow:
      0 12px 35px rgba(0, 0, 0, 0.3),
      0 6px 20px rgba(0, 0, 0, 0.25),
      0 0 0 6px rgba(139, 92, 246, 0.3);
    filter: brightness(1.1);
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
    z-index: 10002;
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
