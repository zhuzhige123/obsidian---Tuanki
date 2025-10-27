<script lang="ts">
  /**
   * 专门的Markdown编辑器组件
   * 基于UnifiedCodeMirrorEditor，提供增强的Markdown编辑体验
   */
  
  import { onMount, onDestroy } from 'svelte';
  import { cardEditEventBus } from '../../events/CardEditEventBus';
  import EnhancedCodeMirrorEditor from './EnhancedCodeMirrorEditor.svelte';
  import MarkdownToolbar from './MarkdownToolbar.svelte';
  import type AnkiPlugin from '../../main';
  import type { ExtensionConfig } from '../../utils/unifiedEditorExtensions';

  interface Props {
    /** Markdown内容 */
    content: string;
    /** 内容变更回调 */
    onContentChange?: (content: string) => void;
    /** 是否只读 */
    readonly?: boolean;
    /** 占位符文本 */
    placeholder?: string;
    /** 是否启用预览 */
    enablePreview?: boolean;
    /** 是否显示工具栏 */
    showToolbar?: boolean;
    /** 最小高度 */
    minHeight?: number;
    /** 最大高度 */
    maxHeight?: number;
    /** 插件实例 */
    plugin?: AnkiPlugin;
    /** 自定义扩展配置 */
    extensionConfig?: Partial<ExtensionConfig>;
    /** 编辑器ID */
    editorId?: string;
  }

  let {
    content = $bindable(""),
    onContentChange,
    readonly = false,
    placeholder = "开始编写您的Markdown内容...",
    enablePreview = true,
    showToolbar = true,
    minHeight = 200,
    maxHeight,
    plugin,
    extensionConfig = {},
    editorId = `markdown-editor-${Date.now()}`
  }: Props = $props();

  // 编辑器状态
  let isReady = $state(false);
  let isPreviewMode = $state(false);
  let isFocused = $state(false);
  let hasContent = $state(false);
  let wordCount = $state(0);
  let characterCount = $state(0);

  // 编辑器引用
  let enhancedEditor: any;
  
  // 清理函数
  let cleanup: (() => void)[] = [];

  // 默认扩展配置
  const defaultExtensionConfig: Partial<ExtensionConfig> = {
    enableMarkdownSyntax: true,
    enableMarkdownShortcuts: true,
    enableObsidianLinks: true,
    enableObsidianTags: true,
    enableObsidianCallouts: true,
    enableObsidianMath: true,
    enableImagePaste: true,
    enableAutocompletion: true,
    enableBracketMatching: true,
    enableSearch: true,
    enableFolding: true,
    ...extensionConfig
  };

  /**
   * 处理内容变更
   */
  function handleContentChange(newContent: string): void {
    content = newContent;
    updateContentStats(newContent);
    
    // 通知外部
    if (onContentChange) {
      onContentChange(newContent);
    }
    
    // 发射事件
    cardEditEventBus.emitSync('content:changed', {
      content: newContent,
      source: 'markdown'
    });
  }

  /**
   * 更新内容统计
   */
  function updateContentStats(text: string): void {
    hasContent = text.trim().length > 0;
    characterCount = text.length;
    
    // 简单的单词计数（按空格分割）
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    wordCount = words.length;
  }

  /**
   * 切换预览模式
   */
  function togglePreview(): void {
    if (enhancedEditor?.executeCommand) {
      enhancedEditor.executeCommand('togglePreview');
      isPreviewMode = !isPreviewMode;

      cardEditEventBus.emitSync('editor:preview-toggled', {
        editorId,
        isPreview: isPreviewMode
      });
    }
  }

  /**
   * 执行编辑器命令
   */
  function executeCommand(command: string, ...args: any[]): any {
    if (enhancedEditor?.executeCommand) {
      const result = enhancedEditor.executeCommand(command, ...args);

      cardEditEventBus.emitSync('editor:command-executed', {
        editorId,
        command,
        result
      });

      return result;
    }
  }

  /**
   * 处理编辑器就绪
   */
  function handleEditorReady(): void {
    isReady = true;
    updateContentStats(content);
    
    cardEditEventBus.emitSync('editor:ready', { editorId });
  }

  /**
   * 处理编辑器焦点
   */
  function handleEditorFocus(): void {
    isFocused = true;
    cardEditEventBus.emitSync('editor:focus', { editorId });
  }

  /**
   * 处理编辑器失焦
   */
  function handleEditorBlur(): void {
    isFocused = false;
    cardEditEventBus.emitSync('editor:blur', { editorId });
  }

  /**
   * 工具栏命令处理
   */
  function handleToolbarCommand(event: CustomEvent<{ command: string; args?: any[] }>): void {
    const { command, args = [] } = event.detail;
    console.log('🔧 [MarkdownEditor] Received toolbar command:', command, args);

    const result = executeCommand(command, ...args);
    console.log('🔧 [MarkdownEditor] Command execution result:', result);
  }

  /**
   * 获取编辑器实例（供外部调用）
   */
  export function getEditor() {
    return enhancedEditor;
  }

  /**
   * 聚焦编辑器
   */
  export function focus(): void {
    if (enhancedEditor?.focus) {
      enhancedEditor.focus();
    }
  }

  /**
   * 插入文本
   */
  export function insertText(text: string, position?: number): void {
    executeCommand('insertText', text, position);
  }

  /**
   * 替换选中文本
   */
  export function replaceSelection(text: string): void {
    executeCommand('replaceSelection', text);
  }

  /**
   * 获取选中文本
   */
  export function getSelection(): string {
    return executeCommand('getSelection') || '';
  }

  /**
   * 设置选择范围
   */
  export function setSelection(from: number, to?: number): void {
    executeCommand('setSelection', from, to);
  }

  // 监听内容变化
  $effect(() => {
    updateContentStats(content);
  });

  // 组件挂载
  onMount(() => {
    // 监听全局编辑器事件
    const unsubscribeError = cardEditEventBus.on('error:occurred', ({ error, context }) => {
      if (context.includes(editorId)) {
        console.error(`[MarkdownEditor:${editorId}] Error:`, error);
      }
    });
    
    cleanup.push(unsubscribeError);
  });

  // 组件销毁
  onDestroy(() => {
    cleanup.forEach(fn => fn());
    cleanup = [];
  });
</script>

<div class="markdown-editor" class:focused={isFocused} class:preview-mode={isPreviewMode}>
  {#if showToolbar}
    <MarkdownToolbar
      {isPreviewMode}
      {hasContent}
      {readonly}
      onCommand={handleToolbarCommand}
      onTogglePreview={togglePreview}
    />
  {/if}
  
  <div class="editor-container">
    <EnhancedCodeMirrorEditor
      bind:this={enhancedEditor}
      bind:content
      mode="markdown"
      {readonly}
      {placeholder}
      {minHeight}
      {maxHeight}
      {enablePreview}
      {plugin}
      extensionConfig={defaultExtensionConfig}
      onContentChange={handleContentChange}
      {editorId}
      autoFocus={false}
      debounceDelay={300}
    />
  </div>
  
  {#if showToolbar}
    <div class="editor-status">
      <div class="status-info">
        <span class="word-count">{wordCount} 词</span>
        <span class="char-count">{characterCount} 字符</span>
        {#if isReady}
          <span class="status-ready">就绪</span>
        {/if}
      </div>
      
      <div class="status-actions">
        {#if enablePreview}
          <button 
            class="status-btn" 
            class:active={isPreviewMode}
            onclick={togglePreview}
            title={isPreviewMode ? '切换到编辑模式' : '切换到预览模式'}
          >
            {isPreviewMode ? '编辑' : '预览'}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .markdown-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.2s ease;
  }

  .markdown-editor.focused {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
  }

  .markdown-editor.preview-mode {
    background: var(--background-secondary);
  }

  .editor-container {
    flex: 1;
    overflow: hidden;
  }

  .editor-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--background-secondary);
    border-top: 1px solid var(--background-modifier-border);
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .status-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .status-ready {
    color: var(--text-success);
    font-weight: 500;
  }

  .status-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .status-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .status-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .status-info {
      gap: 0.5rem;
    }
    
    .word-count,
    .char-count {
      display: none;
    }
  }
</style>
