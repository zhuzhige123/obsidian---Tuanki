<script lang="ts">
  /**
   * OptimizedFieldEditor - 优化的字段编辑器组件
   * 
   * 设计目标：
   * 1. 懒加载：只在需要时创建CodeMirror编辑器实例
   * 2. 按需挂载：编辑时挂载，预览时卸载
   * 3. 平滑切换：提供流畅的编辑/预览切换体验
   * 4. 内存优化：减少不必要的编辑器实例
   */

  import { onMount, onDestroy, tick } from "svelte";
  import { MarkdownRenderer } from "obsidian";
  import type AnkiPlugin from "../../main";
  import UnifiedCodeMirrorEditor from "./UnifiedCodeMirrorEditor.svelte";

  // 组件属性接口
  interface Props {
    /** 字段键 */
    fieldKey: string;
    
    /** 字段名称 */
    fieldName?: string;
    
    /** 字段内容 */
    content: string;
    
    /** 是否处于活跃编辑状态 */
    isActive: boolean;
    
    /** 占位符 */
    placeholder?: string;
    
    /** 插件实例 */
    plugin: AnkiPlugin;
    
    /** 最小高度 */
    minHeight?: number;
    
    /** 最大高度 */
    maxHeight?: number;
    
    /** 是否只读 */
    readOnly?: boolean;
    
    /** 内容变更回调 */
    onContentChange?: (fieldKey: string, content: string) => void;
    
    /** 激活回调 */
    onActivate?: (fieldKey: string) => void;
    
    /** 失活回调 */
    onDeactivate?: (fieldKey: string) => void;
    
    /** 焦点回调 */
    onFocus?: (fieldKey: string) => void;
    
    /** 失焦回调 */
    onBlur?: (fieldKey: string) => void;
  }

  let {
    fieldKey,
    fieldName = fieldKey,
    content = $bindable(""),
    isActive = false,
    placeholder = `输入${fieldName}内容...`,
    plugin,
    minHeight = 80,
    maxHeight = 200,
    readOnly = false,
    onContentChange,
    onActivate,
    onDeactivate,
    onFocus,
    onBlur
  }: Props = $props();

  // DOM引用
  let previewContainer: HTMLDivElement;
  let editorContainer: HTMLDivElement;
  let fieldContainer: HTMLDivElement;
  
  // 组件状态
  let isEditorCreated = $state(false);
  let isTransitioning = $state(false);
  let previewContent = $state("");
  let editorInstance: UnifiedCodeMirrorEditor | null = null;
  
  // 内部内容状态
  let internalContent = $state(content);
  
  // 监听外部内容变化
  $effect(() => {
    if (content !== internalContent) {
      internalContent = content;
      updatePreview();
      
      // 如果编辑器存在且处于活跃状态，更新编辑器内容
      if (isEditorCreated && isActive && editorInstance) {
        editorInstance.setValue(content);
      }
    }
  });
  
  // 监听活跃状态变化
  $effect(() => {
    if (isActive) {
      handleActivate();
    } else {
      handleDeactivate();
    }
  });

  onMount(() => {
    updatePreview();
  });

  onDestroy(() => {
    if (editorInstance) {
      editorInstance = null;
    }
  });

  /**
   * 激活编辑模式
   */
  async function handleActivate() {
    if (isTransitioning || isActive === false) return;
    
    isTransitioning = true;
    
    try {
      // 创建编辑器（如果还没有）
      await createEditorIfNeeded();
      
      // 等待DOM更新
      await tick();
      
      // 设置编辑器内容
      if (editorInstance) {
        editorInstance.setValue(internalContent);
        
        // 延迟聚焦，确保编辑器完全准备好
        setTimeout(() => {
          editorInstance?.focus();
          onFocus?.(fieldKey);
        }, 100);
      }
      
      // 通知外部激活
      onActivate?.(fieldKey);
      
    } catch (error) {
      console.error(`OptimizedFieldEditor[${fieldKey}]: 激活失败:`, error);
    } finally {
      isTransitioning = false;
    }
  }

  /**
   * 切换到预览模式
   */
  function handleDeactivate() {
    if (isTransitioning || isActive === true) return;
    
    isTransitioning = true;
    
    try {
      // 保存编辑器内容
      if (editorInstance) {
        const currentValue = editorInstance.getValue();
        if (currentValue !== internalContent) {
          internalContent = currentValue;
          content = currentValue;
          onContentChange?.(fieldKey, currentValue);
        }
        
        // 编辑器失焦
        editorInstance.blur();
        onBlur?.(fieldKey);
      }
      
      // 更新预览内容
      updatePreview();
      
      // 通知外部失活
      onDeactivate?.(fieldKey);
      
    } catch (error) {
      console.error(`OptimizedFieldEditor[${fieldKey}]: 失活失败:`, error);
    } finally {
      isTransitioning = false;
    }
  }

  /**
   * 懒创建编辑器实例
   */
  async function createEditorIfNeeded() {
    if (isEditorCreated || !editorContainer) return;
    
    console.log(`OptimizedFieldEditor[${fieldKey}]: 创建编辑器实例`);
    
    try {
      // 标记编辑器已创建
      isEditorCreated = true;
      
      // 等待DOM更新
      await tick();
      
      console.log(`OptimizedFieldEditor[${fieldKey}]: 编辑器创建完成`);
      
    } catch (error) {
      console.error(`OptimizedFieldEditor[${fieldKey}]: 创建编辑器失败:`, error);
      isEditorCreated = false;
      throw error;
    }
  }

  /**
   * 更新预览内容
   */
  function updatePreview() {
    if (!previewContainer) return;
    
    try {
      if (internalContent.trim()) {
        // 渲染Markdown内容
        const renderer = new MarkdownRenderer(plugin.app, '', null, null);
        renderer.renderMarkdown(internalContent, previewContainer, '', null);
        
        // 添加预览样式类
        previewContainer.addClass('field-preview-content');
      } else {
        // 显示占位符
        previewContainer.innerHTML = `<div class="field-preview-placeholder">${placeholder}</div>`;
      }
    } catch (error) {
      console.error(`OptimizedFieldEditor[${fieldKey}]: 预览渲染失败:`, error);
      previewContainer.innerHTML = `<div class="field-preview-error">预览渲染失败</div>`;
    }
  }

  /**
   * 处理预览容器点击
   */
  function handlePreviewClick() {
    if (!isActive && !isTransitioning) {
      onActivate?.(fieldKey);
    }
  }

  /**
   * 处理编辑器内容变更
   */
  function handleEditorChange(newValue: string) {
    if (newValue !== internalContent) {
      internalContent = newValue;
      content = newValue;
      onContentChange?.(fieldKey, newValue);
    }
  }

  /**
   * 处理编辑器焦点
   */
  function handleEditorFocus() {
    onFocus?.(fieldKey);
  }

  /**
   * 处理编辑器失焦
   */
  function handleEditorBlur() {
    onBlur?.(fieldKey);
  }
</script>

<!-- 字段容器 -->
<div 
  class="optimized-field-editor"
  class:active={isActive}
  class:transitioning={isTransitioning}
  bind:this={fieldContainer}
  data-field-key={fieldKey}
>
  <!-- 字段标签 -->
  <div class="field-label">
    <span class="field-name">{fieldName}</span>
    {#if isActive}
      <span class="field-status">编辑中</span>
    {/if}
  </div>

  <!-- 预览容器 -->
  <div 
    class="field-preview"
    class:hidden={isActive}
    onclick={handlePreviewClick}
    bind:this={previewContainer}
    role="button"
    tabindex="0"
    aria-label={`点击编辑${fieldName}`}
  >
    <!-- 预览内容将通过updatePreview()方法渲染 -->
  </div>

  <!-- 编辑器容器 -->
  <div 
    class="field-editor"
    class:hidden={!isActive}
    bind:this={editorContainer}
  >
    {#if isEditorCreated && isActive}
      <UnifiedCodeMirrorEditor
        bind:this={editorInstance}
        value={internalContent}
        mode="fields"
        {plugin}
        {placeholder}
        {minHeight}
        {maxHeight}
        {readOnly}
        fieldKey={fieldKey}
        onValueChange={handleEditorChange}
        onFocus={handleEditorFocus}
        onBlur={handleEditorBlur}
        useBindableValue={false}
        enablePreview={false}
        showPreviewToggle={false}
      />
    {/if}
  </div>
</div>

<style>
  .optimized-field-editor {
    margin-bottom: 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s ease-in-out;
    background: var(--background-primary);
  }

  .optimized-field-editor:hover {
    border-color: var(--background-modifier-border-hover);
  }

  .optimized-field-editor.active {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--interactive-accent-alpha);
  }

  .optimized-field-editor.transitioning {
    pointer-events: none;
  }

  .field-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 13px;
    font-weight: 500;
  }

  .field-name {
    color: var(--text-muted);
  }

  .field-status {
    color: var(--interactive-accent);
    font-size: 11px;
    opacity: 0;
    animation: fadeIn 0.2s ease-in-out forwards;
  }

  @keyframes fadeIn {
    to { opacity: 1; }
  }

  .field-preview {
    min-height: 60px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
    position: relative;
  }

  .field-preview:hover {
    background: var(--background-modifier-hover);
  }

  .field-preview.hidden {
    display: none;
  }

  .field-editor {
    transition: all 0.2s ease-in-out;
  }

  .field-editor.hidden {
    display: none;
  }

  /* 预览内容样式 */
  :global(.field-preview-content) {
    color: var(--text-normal);
    line-height: 1.5;
  }

  :global(.field-preview-content p) {
    margin: 0 0 8px 0;
  }

  :global(.field-preview-content p:last-child) {
    margin-bottom: 0;
  }

  :global(.field-preview-placeholder) {
    color: var(--text-muted);
    font-style: italic;
    opacity: 0.7;
  }

  :global(.field-preview-error) {
    color: var(--text-error);
    font-style: italic;
  }

  /* 动画效果 */
  .optimized-field-editor {
    transform: translateY(0);
  }

  .optimized-field-editor.active {
    transform: translateY(-2px);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .optimized-field-editor {
      margin-bottom: 8px;
    }

    .field-label {
      padding: 6px 10px;
      font-size: 12px;
    }

    .field-preview {
      padding: 10px;
    }
  }
</style>
