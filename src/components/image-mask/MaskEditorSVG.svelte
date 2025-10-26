<script lang="ts">
/**
 * SVG遮罩编辑器（Fabric.js替代版本）
 * 
 * 功能：
 * - 纯SVG实现，无外部依赖
 * - 支持拖拽绘制矩形和圆形
 * - 集成MaskStore进行状态管理
 * - 响应式更新
 * 
 * @author Tuanki Team
 * @date 2025-10-22
 */

import { onMount, tick } from 'svelte';
import MaskShape from './MaskShape.svelte';
import { createMaskStore } from '../../stores/mask-store';
import { getSVGPoint, isValidMask, isMaskTooSmall, clampMask } from '../../services/image-mask/mask-operations';
import { generateMaskId } from '../../services/image-mask/MaskDataParser';
import type { App, TFile } from 'obsidian';
import type { Mask, MaskData } from '../../types/image-mask-types';
import { MASK_CONSTANTS } from '../../types/image-mask-types';

// Props
let {
  app,
  imageFile,
  initialMaskData = null,
  currentColor = 'rgba(0, 0, 0, 0.7)',
  onMaskDataChange,
  onEditorReady = () => {}
}: {
  app: App;
  imageFile: TFile;
  initialMaskData: MaskData | null;
  currentColor?: string;
  onMaskDataChange: (maskData: MaskData) => void;
  onEditorReady?: (ready: boolean) => void;
} = $props();

// 创建Store实例
const store = createMaskStore(initialMaskData?.masks || []);

// SVG和图片状态
let svgElement = $state<SVGSVGElement | null>(null);
let imageUrl = $state<string>('');
let imageWidth = $state(0);
let imageHeight = $state(0);
let loading = $state(true);
let error = $state<string | null>(null);

// 绘制模式
let drawMode = $state<'rect' | 'circle' | null>(null);
let drawStart = $state<{x: number; y: number} | null>(null);

// 拖拽状态（全局管理）
let activeDragMask = $state<string | null>(null);
let dragState = $state<{
  isDragging: boolean;
  isResizing: boolean;
  resizeHandle: string | null;
  startPoint: {x: number; y: number} | null;
  startMaskState: Partial<Mask> | null;
} | null>(null);

// 初始化
onMount(async () => {
  try {
    // 加载图片
    imageUrl = app.vault.adapter.getResourcePath(imageFile.path);
    
    const img = new Image();
    img.onload = () => {
      imageWidth = img.width;
      imageHeight = img.height;
      loading = false;
      onEditorReady(true);
    };
    
    img.onerror = () => {
      error = '图片加载失败';
      loading = false;
    };
    
    img.src = imageUrl;
  } catch (err) {
    console.error('[MaskEditorSVG] 初始化失败:', err);
    error = err instanceof Error ? err.message : '初始化失败';
    loading = false;
  }
});

// 监听Store变化，触发保存
$effect(() => {
  onMaskDataChange({
    version: MASK_CONSTANTS.CURRENT_VERSION,
    masks: store.masks
  });
});

// ===== 导出方法（供父组件调用） =====

/**
 * 启用矩形绘制模式
 */
export function enableRectDrawing() {
  drawMode = 'rect';
  store.clearSelection();
  console.log('[MaskEditorSVG] 启用矩形绘制模式');
}

/**
 * 启用圆形绘制模式
 */
export function enableCircleDrawing() {
  drawMode = 'circle';
  store.clearSelection();
  console.log('[MaskEditorSVG] 启用圆形绘制模式');
}

/**
 * 删除选中的遮罩
 */
export function deleteSelectedMask() {
  if (store.selectedId) {
    store.deleteMask(store.selectedId);
    console.log('[MaskEditorSVG] 删除选中遮罩');
  }
}

/**
 * 更新选中遮罩的颜色
 */
export function updateSelectedMaskColor(newColor: string) {
  if (store.selectedId) {
    store.updateMask(store.selectedId, { fill: newColor });
    console.log('[MaskEditorSVG] 更新遮罩颜色:', newColor);
  }
}

/**
 * 获取当前遮罩数据
 */
export function getMaskData(): MaskData {
  return {
    version: MASK_CONSTANTS.CURRENT_VERSION,
    masks: store.masks
  };
}

/**
 * 撤销
 */
export function undo() {
  store.undo();
}

/**
 * 重做
 */
export function redo() {
  store.redo();
}

// ===== SVG事件处理 =====

/**
 * SVG鼠标按下 - 开始绘制
 */
function handleSvgMouseDown(e: MouseEvent) {
  if (!drawMode || !svgElement) return;
  
  // 取消之前的选中
  store.clearSelection();
  
  const point = getSVGPoint(e, svgElement);
  drawStart = point;
  
  // 创建临时绘制对象
  store.activeDrawing = {
    id: generateMaskId(),
    type: drawMode,
    x: point.x,
    y: point.y,
    width: 0,
    height: 0,
    radius: 0,
    fill: currentColor,
    style: 'solid'
  };
  
  console.log('[MaskEditorSVG] 开始绘制:', drawMode);
}

/**
 * SVG鼠标移动 - 动态更新绘制
 */
function handleSvgMouseMove(e: MouseEvent) {
  if (!svgElement) return;
  
  const point = getSVGPoint(e, svgElement);
  
  // 处理绘制
  if (store.activeDrawing && drawStart) {
    updateActiveDrawing(point);
  }
  
  // 处理拖拽/缩放（由MaskShape触发，这里只是预留）
  // 实际的拖拽逻辑在MaskShape内部处理
}

/**
 * SVG鼠标松开 - 完成绘制
 */
function handleSvgMouseUp(e: MouseEvent) {
  // 完成绘制
  if (store.activeDrawing) {
    finishDrawing();
  }
}

/**
 * 更新正在绘制的遮罩
 */
function updateActiveDrawing(point: {x: number; y: number}) {
  if (!store.activeDrawing || !drawStart) return;
  
  if (store.activeDrawing.type === 'rect') {
    // 矩形绘制（支持反向拖拽）
    const left = Math.min(point.x, drawStart.x);
    const top = Math.min(point.y, drawStart.y);
    const width = Math.abs(point.x - drawStart.x);
    const height = Math.abs(point.y - drawStart.y);
    
    store.activeDrawing = {
      ...store.activeDrawing,
      x: left,
      y: top,
      width,
      height
    };
  } else if (store.activeDrawing.type === 'circle') {
    // 圆形绘制（从中心向外）
    const dx = point.x - drawStart.x;
    const dy = point.y - drawStart.y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    
    store.activeDrawing = {
      ...store.activeDrawing,
      x: drawStart.x,
      y: drawStart.y,
      radius
    };
  }
}

/**
 * 完成绘制
 */
function finishDrawing() {
  if (!store.activeDrawing) return;
  
  // 验证遮罩
  if (!isValidMask(store.activeDrawing)) {
    console.warn('[MaskEditorSVG] 无效的遮罩，取消绘制');
    store.activeDrawing = null;
    drawStart = null;
    drawMode = null;
    return;
  }
  
  // 检查尺寸
  if (isMaskTooSmall(store.activeDrawing as Mask, 0.01)) {
    console.warn('[MaskEditorSVG] 遮罩太小，取消绘制');
    store.activeDrawing = null;
    drawStart = null;
    drawMode = null;
    return;
  }
  
  // 限制在边界内
  const clampedMask = clampMask(store.activeDrawing as Mask);
  
  // 添加到Store
  store.addMask(clampedMask);
  
  // 清理状态
  store.activeDrawing = null;
  drawStart = null;
  drawMode = null;
  
  console.log('[MaskEditorSVG] 绘制完成');
}

/**
 * 处理遮罩更新
 */
function handleMaskUpdate(id: string, updates: Partial<Mask>) {
  store.updateMask(id, updates);
}

/**
 * 处理遮罩选中
 */
function handleMaskSelect(id: string) {
  store.selectMask(id);
  drawMode = null; // 取消绘制模式
}

/**
 * 处理遮罩删除
 */
function handleMaskDelete(id: string) {
  store.deleteMask(id);
}

/**
 * SVG点击 - 取消选中
 */
function handleSvgClick(e: MouseEvent) {
  // 如果点击的是SVG背景（不是遮罩），取消选中
  if (e.target === svgElement || (e.target as Element).tagName === 'image') {
    store.clearSelection();
    drawMode = null;
  }
}
</script>

<div class="mask-editor-svg-container">
  {#if loading}
    <div class="loading-overlay">
      <div class="spinner"></div>
      <p>加载图片中...</p>
    </div>
  {:else if error}
    <div class="error-overlay">
      <div class="error-icon">❌</div>
      <p>{error}</p>
    </div>
  {:else}
    <svg
      bind:this={svgElement}
      class="mask-editor-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="遮罩编辑画布"
      tabindex="0"
      onmousedown={handleSvgMouseDown}
      onmousemove={handleSvgMouseMove}
      onmouseup={handleSvgMouseUp}
      onclick={handleSvgClick}
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          store.clearSelection();
          drawMode = null;
        }
      }}
      class:drawing={!!drawMode}
      class:has-active={!!store.activeDrawing}
    >
      <!-- 背景图片 -->
      <image
        href={imageUrl}
        x="0"
        y="0"
        width="100"
        height="100"
        preserveAspectRatio="none"
      />
      
      <!-- 所有已创建的遮罩 -->
      {#each store.masks as mask (mask.id)}
        <MaskShape
          {mask}
          editable={true}
          selected={mask.id === store.selectedId}
          onUpdate={(updates) => handleMaskUpdate(mask.id, updates)}
          onSelect={() => handleMaskSelect(mask.id)}
          onDelete={() => handleMaskDelete(mask.id)}
        />
      {/each}
      
      <!-- 正在绘制的临时遮罩 -->
      {#if store.activeDrawing}
        <MaskShape
          mask={store.activeDrawing as Mask}
          editable={false}
          selected={false}
        />
      {/if}
    </svg>
    
    <!-- 提示信息 -->
    <div class="hint">
      {#if drawMode}
        💡 在图片上拖拽绘制{drawMode === 'rect' ? '矩形' : '圆形'}遮罩
      {:else if store.selectedId}
        💡 拖拽移动遮罩，拖拽控制点调整大小，双击删除
      {:else}
        💡 选择工具开始绘制，或点击遮罩进行编辑
      {/if}
    </div>
  {/if}
</div>

<style>
  .mask-editor-svg-container {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 12px;
  }
  
  .mask-editor-svg {
    flex: 1;
    width: 100%;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    cursor: default;
  }
  
  .mask-editor-svg.drawing {
    cursor: crosshair !important;
  }
  
  .mask-editor-svg.has-active {
    user-select: none;
  }
  
  .loading-overlay, .error-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--background-primary);
    z-index: 10;
    gap: 12px;
  }
  
  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error-icon {
    font-size: 48px;
  }
  
  .error-overlay p {
    color: var(--text-error);
    font-size: 14px;
  }
  
  .hint {
    padding: 10px 16px;
    background: var(--background-secondary);
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
    transition: all 0.2s ease;
  }
  
  .hint:hover {
    background: var(--background-modifier-hover);
  }
</style>

