<script lang="ts">
/**
 * 图片遮罩编辑模态窗主组件
 * 
 * 布局：头部标题 + 中间编辑区 + 底部工具栏（绘制工具 + 操作按钮）
 */

import { onMount } from 'svelte';
import MaskEditorSVG from './MaskEditorSVG.svelte';
import EnhancedIcon from '../ui/EnhancedIcon.svelte';
import type { App, TFile } from 'obsidian';
import type { MaskData } from '../../types/image-mask-types';

// Props
let {
  app,
  imageFile,
  initialMaskData = null,
  onSave,
  onCancel
}: {
  app: App;
  imageFile: TFile;
  initialMaskData: MaskData | null;
  onSave: (maskData: MaskData) => void;
  onCancel: () => void;
} = $props();

// 状态
let maskEditor = $state<any>(null);
let currentMaskData = $state<MaskData | null>(initialMaskData);
let hasChanges = $state(false);
let currentTool = $state<'rect' | 'circle' | null>(null);
let maskCount = $state(0);
let editorReady = $state(false);

// 颜色和透明度状态
let currentColor = $state<string>('red');
let currentOpacity = $state<number>(70);

// 预设颜色定义
const PRESET_COLORS = [
  { name: 'red', value: 'rgb(255, 0, 0)', label: '红色' },
  { name: 'yellow', value: 'rgb(255, 255, 0)', label: '黄色' },
  { name: 'blue', value: 'rgb(0, 0, 255)', label: '蓝色' },
  { name: 'green', value: 'rgb(0, 255, 0)', label: '绿色' }
];

// 计算当前的RGBA颜色值
let currentRGBAColor = $derived(() => {
  const color = PRESET_COLORS.find(c => c.name === currentColor);
  if (!color) return `rgba(0, 0, 0, ${currentOpacity / 100})`;
  
  // 从 rgb(r, g, b) 提取数值，转换为 rgba(r, g, b, a)
  const match = color.value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${currentOpacity / 100})`;
  }
  return `rgba(0, 0, 0, ${currentOpacity / 100})`;
});

/**
 * 处理遮罩数据变更
 */
function handleMaskDataChange(maskData: MaskData) {
  currentMaskData = maskData;
  maskCount = maskData.masks.length;
  hasChanges = true;
}

/**
 * 处理编辑器就绪
 */
function handleEditorReady(ready: boolean) {
  editorReady = ready;
}

/**
 * 选择颜色
 */
function selectColor(colorName: string) {
  currentColor = colorName;
  // 如果有选中的遮罩，更新其颜色
  if (maskEditor && editorReady) {
    maskEditor.updateSelectedMaskColor(currentRGBAColor());
  }
}

/**
 * 更新透明度
 */
function updateOpacity(value: number) {
  currentOpacity = value;
  // 如果有选中的遮罩，更新其颜色（包含新的透明度）
  if (maskEditor && editorReady) {
    maskEditor.updateSelectedMaskColor(currentRGBAColor());
  }
}

/**
 * 启用矩形绘制模式
 */
function addRectMask() {
  if (!maskEditor || !editorReady) return;
  currentTool = 'rect';
  maskEditor.enableRectDrawing();
}

/**
 * 启用圆形绘制模式
 */
function addCircleMask() {
  if (!maskEditor || !editorReady) return;
  currentTool = 'circle';
  maskEditor.enableCircleDrawing();
}

/**
 * 删除选中的遮罩
 */
function deleteSelectedMask() {
  if (!maskEditor || !editorReady) return;
  maskEditor.deleteSelectedMask();
}

/**
 * 处理保存
 */
function handleSave() {
  if (!currentMaskData) {
    console.warn('[ImageMaskModal] 没有遮罩数据可保存');
    return;
  }
  
  onSave(currentMaskData);
}

/**
 * 处理取消
 */
function handleCancel() {
  if (hasChanges) {
    // 确认是否放弃更改
    const confirmed = confirm('您有未保存的更改，确定要放弃吗？');
    if (!confirmed) {
      return;
    }
  }
  
  onCancel();
}
</script>

<div class="image-mask-modal">
  <!-- 头部 -->
  <div class="modal-header">
    <div class="header-left">
      <EnhancedIcon name="image" size="lg" />
      <span class="header-title">编辑图片遮罩</span>
      <span class="header-divider">-</span>
      <span class="header-filename">{imageFile.basename}</span>
    </div>
    <div class="header-right">
      <button 
        class="close-button"
        onclick={handleCancel}
        title="关闭"
        aria-label="关闭"
      >
        <EnhancedIcon name="times" size="md" />
      </button>
    </div>
  </div>
  
  <!-- 编辑区 -->
  <div class="modal-body">
    <MaskEditorSVG
      bind:this={maskEditor}
      {app}
      {imageFile}
      {initialMaskData}
      currentColor={currentRGBAColor()}
      onMaskDataChange={handleMaskDataChange}
      onEditorReady={handleEditorReady}
    />
  </div>
  
  <!-- 底部工具栏和操作栏 -->
  <div class="modal-footer">
    <!-- 左侧：绘制工具 -->
    <div class="toolbar-section">
      <div class="tool-group">
        <button 
          class="tool-btn"
          class:active={currentTool === 'rect'}
          onclick={addRectMask}
          disabled={!editorReady}
          title="矩形工具 - 在图片上拖拽绘制矩形遮罩"
        >
          <EnhancedIcon name="square" size="md" />
          <span>矩形</span>
        </button>
        
        <button 
          class="tool-btn"
          class:active={currentTool === 'circle'}
          onclick={addCircleMask}
          disabled={!editorReady}
          title="圆形工具 - 在图片上拖拽绘制圆形遮罩"
        >
          <EnhancedIcon name="circle" size="md" />
          <span>圆形</span>
        </button>
        
        <button 
          class="tool-btn delete-btn"
          onclick={deleteSelectedMask}
          disabled={!editorReady}
          title="删除选中遮罩（或双击遮罩删除）"
        >
          <EnhancedIcon name="trash" size="md" />
          <span>删除</span>
        </button>
      </div>
      
      <div class="divider"></div>
      
      <!-- 颜色选择器 -->
      <div class="color-picker">
        <span class="picker-label">颜色:</span>
        {#each PRESET_COLORS as color}
          <button
            class="color-button"
            class:active={currentColor === color.name}
            style="--color: {color.value}"
            onclick={() => selectColor(color.name)}
            title={color.label}
            aria-label={color.label}
          >
            <span class="color-dot" style="background-color: {color.value}"></span>
          </button>
        {/each}
      </div>
      
      <div class="divider"></div>
      
      <!-- 透明度滑块 -->
      <div class="opacity-control">
        <span class="picker-label">透明度:</span>
        <input
          type="range"
          class="opacity-slider"
          min="0"
          max="100"
          step="5"
          bind:value={currentOpacity}
          oninput={(e) => updateOpacity(Number((e.target as HTMLInputElement).value))}
          title="调整遮罩透明度"
        />
        <span class="opacity-value">{currentOpacity}%</span>
      </div>
      
      <div class="divider"></div>
      
      <div class="mask-count">
        <EnhancedIcon name="layers" size="sm" />
        <span>遮罩: {maskCount}</span>
      </div>
    </div>
    
    <!-- 右侧：操作按钮 -->
    <div class="action-section">
      <button 
        class="btn btn-primary"
        onclick={handleSave}
        disabled={!currentMaskData || currentMaskData.masks.length === 0}
        title="保存所有遮罩（共 {maskCount} 个）"
      >
        <EnhancedIcon name="check" size="sm" />
        <span>保存遮罩</span>
      </button>
    </div>
  </div>
</div>

<style>
.image-mask-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 600px;
}

/* 头部样式 */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-normal);
}

.header-divider {
  color: var(--text-muted);
  margin: 0 4px;
}

.header-filename {
  font-size: 14px;
  color: var(--text-muted);
  font-weight: 400;
}

.header-right {
  display: flex;
  align-items: center;
}

.close-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.2s;
}

.close-button:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

.close-button:active {
  background: var(--background-modifier-active);
}

.modal-body {
  flex: 1;
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-top: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
}

/* 工具栏区域 */
.toolbar-section {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  padding: 2px 0;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
  font-weight: 500;
}

.tool-btn:hover:not(:disabled) {
  background: var(--background-modifier-hover);
  border-color: var(--interactive-accent);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.tool-btn:active:not(:disabled) {
  transform: translateY(0);
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tool-btn.active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border-color: var(--interactive-accent);
  box-shadow: 0 0 0 2px var(--background-primary), 
              0 0 0 4px var(--interactive-accent-hover);
}

.tool-btn.delete-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  border-color: var(--text-error);
  color: var(--text-error);
}

.divider {
  width: 1px;
  height: 28px;
  background: var(--background-modifier-border);
  margin: 0 8px;
}

/* 颜色选择器样式 */
.color-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}

.picker-label {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
  margin-right: 4px;
}

.color-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--background-primary);
  border: 2px solid var(--background-modifier-border);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.color-button::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.2s;
  background: var(--interactive-accent);
  z-index: -1;
}

.color-button:hover::before {
  opacity: 0.1;
}

.color-button:hover {
  border-color: var(--interactive-accent);
  transform: scale(1.15);
}

.color-button:active {
  transform: scale(1.05);
}

.color-button.active {
  border-color: var(--interactive-accent);
  border-width: 3px;
  box-shadow: 0 0 0 3px var(--background-secondary), 
              0 0 0 5px var(--interactive-accent),
              0 4px 8px rgba(0, 0, 0, 0.1);
  transform: scale(1.1);
}

.color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* 透明度滑块样式 */
.opacity-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.opacity-slider {
  width: 120px;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: linear-gradient(
    to right,
    var(--background-modifier-border) 0%,
    var(--interactive-accent) 100%
  );
  border-radius: 3px;
  outline: none;
  cursor: pointer;
  position: relative;
}

.opacity-slider::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 7px;
  opacity: 0;
  background: var(--interactive-accent);
  transition: opacity 0.2s;
  pointer-events: none;
}

.opacity-slider:hover::before {
  opacity: 0.05;
}

.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: var(--interactive-accent);
  border: 2px solid var(--background-primary);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.opacity-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
}

.opacity-slider::-webkit-slider-thumb:active {
  transform: scale(1.1);
}

.opacity-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: var(--interactive-accent);
  border: 2px solid var(--background-primary);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.opacity-slider::-moz-range-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
}

.opacity-slider::-moz-range-thumb:active {
  transform: scale(1.1);
}

.opacity-value {
  min-width: 45px;
  font-size: 13px;
  color: var(--text-normal);
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.mask-count {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--background-modifier-border-hover);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-normal);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 操作按钮区域 */
.action-section {
  display: flex;
  gap: 12px;
}

.btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.btn-primary:hover:not(:disabled) {
  background: var(--interactive-accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
</style>

