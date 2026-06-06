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
 * @author Weave Team
 * @date 2025-10-22
 */

import { showObsidianConfirm } from '../../utils/obsidian-confirm';
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
let svgElementRef: SVGSVGElement | null = null; //  存储 SVG 引用

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
  
  // Svelte 5: 遮罩选择不需要 stopPropagation
  
  // 选中遮罩
  onSelect?.();
  
  //  存储 SVG 引用用于全局事件
  const target = e.target as SVGElement;
  svgElementRef = target.ownerSVGElement || (target.tagName === 'svg' ? target as SVGSVGElement : null);
  
  // 开始拖拽（主体被点击）
  const svgPoint = getSVGPointFromEvent(e);
  isDragging = true;
  dragStart = {
    x: svgPoint.x,
    y: svgPoint.y,
    maskX: mask.x,
    maskY: mask.y
  };
}

/**
 * 控制点鼠标按下 - 开始缩放
 */
function handleHandleMouseDown(e: MouseEvent, handleType: string) {
  if (!editable) return;
  
  // Svelte 5: 调整手柄只需要 preventDefault
  e.preventDefault();
  
  // 确保遮罩已选中
  onSelect?.();
  
  // 存储 SVG 引用用于全局事件
  const target = e.target as SVGElement;
  svgElementRef = target.ownerSVGElement || (target.tagName === 'svg' ? target as SVGSVGElement : null);
  
  // 开始缩放
  const svgPoint = getSVGPointFromEvent(e);
  isResizing = true;
  resizeHandle = handleType;
  dragStart = {
    x: svgPoint.x,
    y: svgPoint.y,
    maskX: mask.x,
    maskY: mask.y
  };
}

/**
 * 双击 - 删除遮罩
 */
async function handleDoubleClick(e: MouseEvent) {
    if (!editable) return;
    
    // Svelte 5: 双击删除只需要 preventDefault
    e.preventDefault();
    
    const confirmed = await showObsidianConfirm((window as any).app, '确定要删除这个遮罩吗？', { title: '确认删除' });
    if (confirmed) {
      onDelete?.();
    }
  }

/**
 * 全局鼠标移动 - 处理拖拽和缩放
 */
function handleGlobalMouseMove(e: MouseEvent) {
  if (!isDragging && !isResizing) return;
  
  // Svelte 5: 拖拽移动只需要 preventDefault
  e.preventDefault();
  
  // 使用存储的 SVG 引用计算坐标
  if (!svgElementRef) {
    return;
  }
  
  const svgPoint = getSVGPointFromEvent(e, svgElementRef);
  
  if (isDragging) {
    handleDrag(svgPoint);
  } else if (isResizing) {
    if (mask.type === 'rect') {
      handleRectResize(svgPoint);
    } else if (mask.type === 'circle') {
      handleCircleResize(svgPoint);
    }
  }
}

/**
 * 全局鼠标松开 - 结束拖拽或缩放
 */
function handleGlobalMouseUp(e: MouseEvent) {
  if (!isDragging && !isResizing) return;
  
  // Svelte 5: 拖拽结束只需要 preventDefault
  e.preventDefault();
  
  isDragging = false;
  isResizing = false;
  resizeHandle = null;
  dragStart = null;
  svgElementRef = null; // 清理 SVG 引用
}

// 添加全局事件监听
$effect(() => {
  if (isDragging || isResizing) {
    activeDocument.addEventListener('mousemove', handleGlobalMouseMove);
    activeDocument.addEventListener('mouseup', handleGlobalMouseUp);
    
    return () => {
      activeDocument.removeEventListener('mousemove', handleGlobalMouseMove);
      activeDocument.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }
});

/**
 * 获取SVG坐标系中的点（归一化坐标）
 * @param e 鼠标事件
 * @param svgOverride 可选的SVG元素（用于全局事件）
 * @returns 归一化坐标 (0-1 范围，与mask数据结构一致)
 */
function getSVGPointFromEvent(e: MouseEvent, svgOverride?: SVGSVGElement | null): {x: number; y: number} {
  let svg = svgOverride;
  
  if (!svg) {
    const target = e.target as SVGElement;
    svg = target.ownerSVGElement || (target.tagName === 'svg' ? target as SVGSVGElement : null);
  }
  
  if (!svg) {
    return {x: 0, y: 0};
  }
  
  try {
    // 使用SVG标准API转换坐标
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      return {x: 0, y: 0};
    }
    
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    
    // 转换为SVG坐标系（viewBox坐标，0-100范围）
    const svgPoint = point.matrixTransform(ctm.inverse());
    
    // 归一化到 0-1（与mask数据结构保持一致）
    return { x: svgPoint.x / 100, y: svgPoint.y / 100 };
    
  } catch (error) {
    return {x: 0, y: 0};
  }
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
 * 拖拽遮罩
 */
function handleDrag(newPoint: {x: number; y: number}) {
  if (!dragStart) return;
  
  const dx = newPoint.x - dragStart.x;
  const dy = newPoint.y - dragStart.y;
  
  let newX = dragStart.maskX + dx;
  let newY = dragStart.maskY + dy;
  
  // 修复：正确计算边界
  let minX = 0;
  let minY = 0;
  let maxX = 1;
  let maxY = 1;
  
  if (mask.type === 'rect') {
    // 矩形：左上角不能超出边界
    maxX = 1 - (mask.width || 0);
    maxY = 1 - (mask.height || 0);
  } else if (mask.type === 'circle') {
    // 圆形：中心点距离边界至少一个半径
    const r = mask.radius || 0;
    minX = r;
    minY = r;
    maxX = 1 - r;
    maxY = 1 - r;
  }
  
  // 限制位置在合法范围内
  newX = Math.max(minX, Math.min(maxX, newX));
  newY = Math.max(minY, Math.min(maxY, newY));
  
  onUpdate?.({
    x: newX,
    y: newY
  });
}

/**
 * 矩形缩放
 * 修复：使用偏移量计算，避免遮罩自动移动到左上角
 */
function handleRectResize(newPoint: {x: number; y: number}) {
  if (!dragStart) return;
  
  const { x: startX, y: startY, maskX: origX, maskY: origY } = dragStart;
  const origWidth = mask.width || 0;
  const origHeight = mask.height || 0;
  
  // 计算鼠标移动的偏移量
  const dx = newPoint.x - dragStart.x;
  const dy = newPoint.y - dragStart.y;
  
  let newX = origX;
  let newY = origY;
  let newWidth = origWidth;
  let newHeight = origHeight;
  
  //  修复：基于偏移量计算新的位置和尺寸
  switch (resizeHandle) {
    case 'top-left':
      // 左上角：向左拖动增加宽度，向右减少；向上拖动增加高度，向下减少
      newX = origX + dx;
      newY = origY + dy;
      newWidth = origWidth - dx;
      newHeight = origHeight - dy;
      break;
    case 'top-center':
      // 上边中点：只影响高度和y坐标
      newY = origY + dy;
      newHeight = origHeight - dy;
      break;
    case 'top-right':
      // 右上角：向右拖动增加宽度，向上拖动增加高度
      newY = origY + dy;
      newWidth = origWidth + dx;
      newHeight = origHeight - dy;
      break;
    case 'middle-left':
      // 左边中点：只影响宽度和x坐标
      newX = origX + dx;
      newWidth = origWidth - dx;
      break;
    case 'middle-right':
      // 右边中点：只影响宽度
      newWidth = origWidth + dx;
      break;
    case 'bottom-left':
      // 左下角：向左拖动增加宽度，向下拖动增加高度
      newX = origX + dx;
      newWidth = origWidth - dx;
      newHeight = origHeight + dy;
      break;
    case 'bottom-center':
      // 下边中点：只影响高度
      newHeight = origHeight + dy;
      break;
    case 'bottom-right':
      // 右下角：向右向下拖动都增加尺寸
      newWidth = origWidth + dx;
      newHeight = origHeight + dy;
      break;
  }
  
  // 边界限制：确保遮罩完全在画布内
  const minSize = 0.01;
  
  // 限制位置在 [0, 1] 范围内
  newX = Math.max(0, Math.min(1 - minSize, newX));
  newY = Math.max(0, Math.min(1 - minSize, newY));
  
  // 限制尺寸
  newWidth = Math.max(minSize, Math.min(1 - newX, newWidth));
  newHeight = Math.max(minSize, Math.min(1 - newY, newHeight));
  
  // 检查最终结果
  if (newWidth < minSize || newHeight < minSize) {
    return;
  }
  
  // 更新遮罩
  onUpdate?.({
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight
  });
}

/**
 * 圆形缩放
 */
function handleCircleResize(newPoint: {x: number; y: number}) {
  const dx = newPoint.x - mask.x;
  const dy = newPoint.y - mask.y;
  const newRadius = Math.sqrt(dx * dx + dy * dy);
  
  //  修复：限制半径不超出边界
  const minRadius = 0.01;
  const maxRadius = Math.min(
    mask.x,        // 到左边界的距离
    mask.y,        // 到上边界的距离
    1 - mask.x,    // 到右边界的距离
    1 - mask.y     // 到下边界的距离
  );
  
  // 限制半径在合法范围内
  const clampedRadius = Math.max(minRadius, Math.min(maxRadius, newRadius));
  
  if (clampedRadius >= minRadius) {
    onUpdate?.({
      radius: clampedRadius
    });
  }
}
</script>

<!-- 渲染遮罩形状 - 使用viewBox绝对坐标 -->
{#if mask.type === 'rect'}
  <rect
    x={mask.x * 100}
    y={mask.y * 100}
    width={(mask.width || 0) * 100}
    height={(mask.height || 0) * 100}
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
    cx={mask.x * 100}
    cy={mask.y * 100}
    r={(mask.radius || 0) * 100}
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
      <!--  控制点 - 使用viewBox绝对坐标 -->
      <circle
        cx={handle.x * 100}
        cy={handle.y * 100}
        r="1.5"
        class="resize-handle"
        style:cursor={getCursorForHandle(handle.type)}
        role="button"
        tabindex="0"
        aria-label="调整大小控制点"
        onmousedown={(e) => {
          handleHandleMouseDown(e, handle.type);
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
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .resize-handle:hover {
    fill: var(--interactive-accent-hover);
    stroke-width: 0.5;
    transform: scale(1.2);
    transform-origin: center;
  }
</style>

