<script lang="ts">
/**
 * 单个遮罩形状组件
 * 
 * 功能：
 * - 渲染矩形或圆形遮罩
 * - 支持交互（拖拽、缩放、选中）
 * - 响应式样式更新
 * - 控制点显示和交互
 * 
 * @author Tuanki Team
 * @date 2025-10-22
 */

import { parseRGBAColor, getRectResizeHandles, getCircleResizeHandles, isNearHandle } from '../../services/image-mask/mask-operations';
import type { Mask } from '../../types/image-mask-types';

// Props
let {
  mask,
  editable = false,
  selected = false,
  onUpdate,
  onSelect,
  onDelete
}: {
  mask: Mask;
  editable?: boolean;
  selected?: boolean;
  onUpdate?: (updates: Partial<Mask>) => void;
  onSelect?: () => void;
  onDelete?: () => void;
} = $props();

// 内部状态
let isDragging = $state(false);
let isResizing = $state(false);
let resizeHandle = $state<string | null>(null);
let dragStart = $state<{x: number; y: number; maskX: number; maskY: number} | null>(null);

// 样式计算
let shapeStyle = $derived(() => {
  const { rgb, opacity } = parseRGBAColor(mask.fill || 'rgba(0, 0, 0, 0.7)');
  return {
    fill: rgb,
    'fill-opacity': opacity.toString(),
    stroke: selected ? 'var(--interactive-accent)' : 'transparent',
    'stroke-width': selected ? '0.5' : '0'
  };
});

// 控制点计算
let resizeHandles = $derived(() => {
  if (!selected || !editable) return [];
  
  if (mask.type === 'rect') {
    return getRectResizeHandles(mask);
  } else if (mask.type === 'circle') {
    return getCircleResizeHandles(mask);
  }
  
  return [];
});

// ===== 事件处理 =====

/**
 * 鼠标按下 - 开始拖拽或选中
 */
function handleMouseDown(e: MouseEvent) {
  if (!editable) return;
  
  e.stopPropagation();
  
  // 选中遮罩
  onSelect?.();
  
  // 检查是否点击了控制点
  const svgPoint = getSVGPointFromEvent(e);
  const clickedHandle = findHandleAtPoint(svgPoint);
  
  if (clickedHandle) {
    // 开始缩放
    isResizing = true;
    resizeHandle = clickedHandle.type;
    dragStart = {
      x: svgPoint.x,
      y: svgPoint.y,
      maskX: mask.x,
      maskY: mask.y
    };
  } else {
    // 开始拖拽
    isDragging = true;
    dragStart = {
      x: svgPoint.x,
      y: svgPoint.y,
      maskX: mask.x,
      maskY: mask.y
    };
  }
}

/**
 * 双击 - 删除遮罩
 */
function handleDoubleClick(e: MouseEvent) {
  if (!editable) return;
  
  e.stopPropagation();
  e.preventDefault();
  
  if (confirm('确定要删除这个遮罩吗？')) {
    onDelete?.();
  }
}

/**
 * 获取SVG坐标系中的点
 */
function getSVGPointFromEvent(e: MouseEvent): {x: number; y: number} {
  const svg = (e.target as SVGElement).ownerSVGElement;
  if (!svg) return {x: 0, y: 0};
  
  const rect = svg.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height
  };
}

/**
 * 查找点击位置的控制点
 */
function findHandleAtPoint(point: {x: number; y: number}): {type: string; x: number; y: number} | null {
  for (const handle of resizeHandles()) {
    if (isNearHandle(point, handle, 0.015)) {
      return handle;
    }
  }
  return null;
}

/**
 * 获取光标样式（根据控制点类型）
 */
function getCursorForHandle(handleType: string): string {
  const cursorMap: Record<string, string> = {
    'top-left': 'nwse-resize',
    'top-center': 'ns-resize',
    'top-right': 'nesw-resize',
    'middle-left': 'ew-resize',
    'middle-right': 'ew-resize',
    'bottom-left': 'nesw-resize',
    'bottom-center': 'ns-resize',
    'bottom-right': 'nwse-resize',
    'top': 'ns-resize',
    'right': 'ew-resize',
    'bottom': 'ns-resize',
    'left': 'ew-resize'
  };
  
  return cursorMap[handleType] || 'default';
}

/**
 * 处理缩放
 */
function handleResize(newPoint: {x: number; y: number}) {
  if (!dragStart || !resizeHandle) return;
  
  if (mask.type === 'rect') {
    handleRectResize(newPoint);
  } else if (mask.type === 'circle') {
    handleCircleResize(newPoint);
  }
}

/**
 * 矩形缩放
 */
function handleRectResize(newPoint: {x: number; y: number}) {
  const { maskX: origX, maskY: origY } = dragStart!;
  const origWidth = mask.width || 0;
  const origHeight = mask.height || 0;
  
  let newX = origX;
  let newY = origY;
  let newWidth = origWidth;
  let newHeight = origHeight;
  
  switch (resizeHandle) {
    case 'top-left':
      newX = newPoint.x;
      newY = newPoint.y;
      newWidth = (origX + origWidth) - newPoint.x;
      newHeight = (origY + origHeight) - newPoint.y;
      break;
    case 'top-center':
      newY = newPoint.y;
      newHeight = (origY + origHeight) - newPoint.y;
      break;
    case 'top-right':
      newY = newPoint.y;
      newWidth = newPoint.x - origX;
      newHeight = (origY + origHeight) - newPoint.y;
      break;
    case 'middle-left':
      newX = newPoint.x;
      newWidth = (origX + origWidth) - newPoint.x;
      break;
    case 'middle-right':
      newWidth = newPoint.x - origX;
      break;
    case 'bottom-left':
      newX = newPoint.x;
      newWidth = (origX + origWidth) - newPoint.x;
      newHeight = newPoint.y - origY;
      break;
    case 'bottom-center':
      newHeight = newPoint.y - origY;
      break;
    case 'bottom-right':
      newWidth = newPoint.x - origX;
      newHeight = newPoint.y - origY;
      break;
  }
  
  // 限制在边界内
  if (newWidth > 0.01 && newHeight > 0.01) {
    onUpdate?.({
      x: Math.max(0, Math.min(1 - 0.01, newX)),
      y: Math.max(0, Math.min(1 - 0.01, newY)),
      width: Math.max(0.01, Math.min(1 - newX, newWidth)),
      height: Math.max(0.01, Math.min(1 - newY, newHeight))
    });
  }
}

/**
 * 圆形缩放
 */
function handleCircleResize(newPoint: {x: number; y: number}) {
  const dx = newPoint.x - mask.x;
  const dy = newPoint.y - mask.y;
  const newRadius = Math.sqrt(dx * dx + dy * dy);
  
  // 限制半径不超出边界
  const maxRadius = Math.min(
    mask.x,
    mask.y,
    1 - mask.x,
    1 - mask.y
  );
  
  if (newRadius > 0.01) {
    onUpdate?.({
      radius: Math.min(newRadius, maxRadius)
    });
  }
}
</script>

<!-- 渲染遮罩形状 -->
{#if mask.type === 'rect'}
  <rect
    x={mask.x * 100 + '%'}
    y={mask.y * 100 + '%'}
    width={(mask.width || 0) * 100 + '%'}
    height={(mask.height || 0) * 100 + '%'}
    fill={shapeStyle().fill}
    fill-opacity={shapeStyle()['fill-opacity']}
    stroke={shapeStyle().stroke}
    stroke-width={shapeStyle()['stroke-width']}
    class="mask-shape"
    class:editable
    class:selected
    class:dragging={isDragging}
    style:cursor={editable ? (isDragging ? 'move' : 'pointer') : 'default'}
    role="button"
    tabindex="0"
    aria-label="遮罩区域"
    onmousedown={handleMouseDown}
    ondblclick={handleDoubleClick}
  />
{:else if mask.type === 'circle'}
  <circle
    cx={mask.x * 100 + '%'}
    cy={mask.y * 100 + '%'}
    r={(mask.radius || 0) * 100 + '%'}
    fill={shapeStyle().fill}
    fill-opacity={shapeStyle()['fill-opacity']}
    stroke={shapeStyle().stroke}
    stroke-width={shapeStyle()['stroke-width']}
    class="mask-shape"
    class:editable
    class:selected
    class:dragging={isDragging}
    style:cursor={editable ? (isDragging ? 'move' : 'pointer') : 'default'}
    role="button"
    tabindex="0"
    aria-label="遮罩区域"
    onmousedown={handleMouseDown}
    ondblclick={handleDoubleClick}
  />
{/if}

<!-- 控制点 -->
{#if selected && editable}
  <g class="resize-handles">
    {#each resizeHandles() as handle}
      <circle
        cx={handle.x * 100 + '%'}
        cy={handle.y * 100 + '%'}
        r="1"
        class="resize-handle"
        style:cursor={getCursorForHandle(handle.type)}
        role="button"
        tabindex="0"
        aria-label="调整大小控制点"
        onmousedown={(e) => {
          e.stopPropagation();
          handleMouseDown(e);
        }}
      />
    {/each}
  </g>
{/if}

<style>
  .mask-shape {
    transition: stroke 0.2s ease;
  }
  
  .mask-shape.editable:not(.dragging):hover {
    stroke: var(--interactive-accent);
    stroke-width: 0.3;
    stroke-opacity: 0.5;
  }
  
  .mask-shape.selected {
    stroke: var(--interactive-accent) !important;
    stroke-width: 0.5 !important;
  }
  
  .mask-shape.dragging {
    opacity: 0.8;
  }
  
  .resize-handle {
    fill: var(--interactive-accent);
    stroke: var(--background-primary);
    stroke-width: 0.3;
    cursor: nwse-resize;
    transition: all 0.2s ease;
  }
  
  .resize-handle:hover {
    r: 1.5;
    fill: var(--interactive-accent-hover);
    stroke-width: 0.4;
  }
</style>

