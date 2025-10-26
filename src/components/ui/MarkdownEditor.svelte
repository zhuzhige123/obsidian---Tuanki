<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import EnhancedButton from "./EnhancedButton.svelte";
  import EnhancedIcon from "./EnhancedIcon.svelte";

  interface Props {
    /** Markdown 内容 */
    value?: string;
    
    /** 占位符文本 */
    placeholder?: string;
    
    /** 是否禁用 */
    disabled?: boolean;
    
    /** 是否显示工具栏 */
    showToolbar?: boolean;
    
    /** 是否显示预览 */
    showPreview?: boolean;
    
    /** 编辑器高度 */
    height?: string;
    
    /** 自动聚焦 */
    autofocus?: boolean;
    
    /** 变更回调 */
    onChange?: (value: string) => void;
    
    /** 自定义类名 */
    class?: string;
  }

  let {
    value = $bindable(""),
    placeholder = "输入 Markdown 内容...",
    disabled = false,
    showToolbar = true,
    showPreview = false,
    height = "400px",
    autofocus = false,
    onChange,
    class: className = ""
  }: Props = $props();

  const dispatch = createEventDispatcher();

  let textareaRef: HTMLTextAreaElement;
  let previewMode = $state(false);
  let isDirty = $state(false);

  // 工具栏按钮配置
  const toolbarButtons = [
    { id: 'bold', icon: 'bold', title: '粗体 (Ctrl+B)', action: () => insertMarkdown('**', '**') },
    { id: 'italic', icon: 'italic', title: '斜体 (Ctrl+I)', action: () => insertMarkdown('*', '*') },
    { id: 'strikethrough', icon: 'strikethrough', title: '删除线', action: () => insertMarkdown('~~', '~~') },
    { id: 'separator1', type: 'separator' },
    { id: 'heading', icon: 'heading', title: '标题', action: () => insertMarkdown('# ', '') },
    { id: 'quote', icon: 'quote-left', title: '引用', action: () => insertLinePrefix('> ') },
    { id: 'code', icon: 'code', title: '行内代码 (Ctrl+`)', action: () => insertMarkdown('`', '`') },
    { id: 'code-block', icon: 'file-code', title: '代码块', action: () => insertCodeBlock() },
    { id: 'separator2', type: 'separator' },
    { id: 'link', icon: 'link', title: '链接 (Ctrl+K)', action: () => insertLink() },
    { id: 'image', icon: 'image', title: '图片', action: () => insertImage() },
    { id: 'table', icon: 'table', title: '表格', action: () => insertTable() },
    { id: 'separator3', type: 'separator' },
    { id: 'list-ul', icon: 'list-ul', title: '无序列表', action: () => insertLinePrefix('- ') },
    { id: 'list-ol', icon: 'list-ol', title: '有序列表', action: () => insertLinePrefix('1. ') },
    { id: 'separator4', type: 'separator' },
    { id: 'undo', icon: 'undo', title: '撤销 (Ctrl+Z)', action: () => document.execCommand('undo') },
    { id: 'redo', icon: 'redo', title: '重做 (Ctrl+Y)', action: () => document.execCommand('redo') }
  ];

  // 计算编辑器类名
  let editorClasses = $derived(() => {
    const classes = ['tuanki-markdown-editor'];
    if (disabled) classes.push('tuanki-markdown-editor--disabled');
    if (previewMode) classes.push('tuanki-markdown-editor--preview');
    if (className) classes.push(className);
    return classes.join(' ');
  });

  // 初始化
  onMount(() => {
    if (autofocus && textareaRef) {
      textareaRef.focus();
    }
    
    // 添加键盘快捷键监听
    document.addEventListener('keydown', handleKeyboardShortcuts);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeyboardShortcuts);
  });

  // 处理输入变化
  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    value = target.value;
    isDirty = true;
    onChange?.(value);
    dispatch('change', value);
  }

  // 键盘快捷键处理
  function handleKeyboardShortcuts(event: KeyboardEvent) {
    if (!textareaRef || document.activeElement !== textareaRef) return;
    
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'b':
          event.preventDefault();
          insertMarkdown('**', '**');
          break;
        case 'i':
          event.preventDefault();
          insertMarkdown('*', '*');
          break;
        case 'k':
          event.preventDefault();
          insertLink();
          break;
        case '`':
          event.preventDefault();
          insertMarkdown('`', '`');
          break;
      }
    }
    
    // Tab 键处理
    if (event.key === 'Tab') {
      event.preventDefault();
      insertAtCursor('  '); // 插入两个空格
    }
  }

  // 插入 Markdown 语法
  function insertMarkdown(prefix: string, suffix: string) {
    if (!textareaRef) return;
    
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    const selectedText = value.substring(start, end);
    
    const newText = prefix + selectedText + suffix;
    const beforeText = value.substring(0, start);
    const afterText = value.substring(end);
    
    value = beforeText + newText + afterText;
    
    // 设置新的光标位置
    setTimeout(() => {
      if (selectedText) {
        textareaRef.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
      } else {
        textareaRef.setSelectionRange(start + prefix.length, start + prefix.length);
      }
      textareaRef.focus();
    }, 0);
    
    handleChange();
  }

  // 插入行前缀
  function insertLinePrefix(prefix: string) {
    if (!textareaRef) return;
    
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    
    // 找到选中文本的行
    const lines = value.split('\n');
    const beforeText = value.substring(0, start);
    const startLine = beforeText.split('\n').length - 1;
    const endLine = startLine + value.substring(start, end).split('\n').length - 1;
    
    // 为每一行添加前缀
    for (let i = startLine; i <= endLine; i++) {
      if (lines[i] !== undefined) {
        lines[i] = prefix + lines[i];
      }
    }
    
    value = lines.join('\n');
    handleChange();
  }

  // 插入代码块
  function insertCodeBlock() {
    const codeBlock = '\n```\n\n```\n';
    insertAtCursor(codeBlock);
    
    // 将光标移动到代码块内部
    setTimeout(() => {
      const newPos = textareaRef.selectionStart - 5;
      textareaRef.setSelectionRange(newPos, newPos);
      textareaRef.focus();
    }, 0);
  }

  // 插入链接
  function insertLink() {
    const selectedText = getSelectedText();
    const linkText = selectedText || '链接文本';
    const linkUrl = 'https://';
    
    insertMarkdown(`[${linkText}](`, ')');
    
    // 选中 URL 部分
    setTimeout(() => {
      const start = textareaRef.selectionStart;
      textareaRef.setSelectionRange(start, start + linkUrl.length);
      textareaRef.focus();
    }, 0);
  }

  // 插入图片
  function insertImage() {
    const altText = '图片描述';
    const imageUrl = 'https://';
    
    insertAtCursor(`![${altText}](${imageUrl})`);
    
    // 选中 URL 部分
    setTimeout(() => {
      const start = textareaRef.selectionStart - imageUrl.length - 1;
      textareaRef.setSelectionRange(start, start + imageUrl.length);
      textareaRef.focus();
    }, 0);
  }

  // 插入表格
  function insertTable() {
    const table = '\n| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 内容 | 内容 | 内容 |\n| 内容 | 内容 | 内容 |\n';
    insertAtCursor(table);
  }

  // 在光标位置插入文本
  function insertAtCursor(text: string) {
    if (!textareaRef) return;
    
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    
    const beforeText = value.substring(0, start);
    const afterText = value.substring(end);
    
    value = beforeText + text + afterText;
    
    // 设置新的光标位置
    setTimeout(() => {
      textareaRef.setSelectionRange(start + text.length, start + text.length);
      textareaRef.focus();
    }, 0);
    
    handleChange();
  }

  // 获取选中的文本
  function getSelectedText(): string {
    if (!textareaRef) return '';
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    return value.substring(start, end);
  }

  // 处理变化
  function handleChange() {
    isDirty = true;
    onChange?.(value);
    dispatch('change', value);
  }

  // 切换预览模式
  function togglePreview() {
    previewMode = !previewMode;
  }
</script>

<div class={editorClasses()}>
  {#if showToolbar}
    <!-- Toolbar -->
    <div class="markdown-toolbar">
      <div class="toolbar-group">
        {#each toolbarButtons as button}
          {#if button.type === 'separator'}
            <div class="toolbar-separator"></div>
          {:else}
            <EnhancedButton
              variant="ghost"
              size="sm"
              iconOnly
              icon={button.icon}
              onclick={button.action}
              title={button.title}
              disabled={disabled}
              class="toolbar-btn"
            />
          {/if}
        {/each}
      </div>
      
      {#if showPreview}
        <div class="toolbar-actions">
          <EnhancedButton
            variant={previewMode ? "primary" : "ghost"}
            size="sm"
            icon="eye"
            onclick={togglePreview}
            disabled={disabled}
          >
            预览
          </EnhancedButton>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Editor Content -->
  <div class="editor-content" style="height: {height}">
    {#if previewMode}
      <!-- Preview Panel -->
      <div class="preview-panel">
        <div class="preview-content">
          <!-- TODO: 实现 Markdown 预览 -->
          <div class="preview-placeholder">
            <EnhancedIcon name="eye" size="xl" variant="muted" />
            <p>Markdown 预览功能正在开发中...</p>
            <small>当前内容长度: {value.length} 字符</small>
          </div>
        </div>
      </div>
    {:else}
      <!-- Editor Panel -->
      <textarea
        bind:this={textareaRef}
        class="markdown-textarea"
        {placeholder}
        {disabled}
        bind:value
        oninput={handleInput}
        spellcheck="false"
      ></textarea>
    {/if}
  </div>
</div>

<style>
  .tuanki-markdown-editor {
    display: flex;
    flex-direction: column;
    background: var(--tuanki-surface);
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-lg);
    overflow: hidden;
  }

  .tuanki-markdown-editor--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  /* Toolbar */
  .markdown-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--tuanki-space-sm) var(--tuanki-space-md);
    background: var(--tuanki-secondary-bg);
    border-bottom: 1px solid var(--tuanki-border);
    gap: var(--tuanki-space-md);
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-xs);
    flex-wrap: wrap;
  }

  .toolbar-separator {
    width: 1px;
    height: 20px;
    background: var(--tuanki-border);
    margin: 0 var(--tuanki-space-xs);
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-sm);
  }

  /* Editor Content */
  .editor-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .markdown-textarea {
    width: 100%;
    height: 100%;
    padding: var(--tuanki-space-lg);
    background: transparent;
    border: none;
    outline: none;
    color: var(--tuanki-text-primary);
    font-family: var(--font-monospace, 'Consolas', 'Monaco', 'Courier New', monospace);
    font-size: 0.875rem;
    line-height: 1.6;
    resize: none;
    tab-size: 2;
  }

  .markdown-textarea::placeholder {
    color: var(--tuanki-text-faint);
  }

  /* Preview Panel */
  .preview-panel {
    height: 100%;
    overflow: auto;
  }

  .preview-content {
    padding: var(--tuanki-space-lg);
    color: var(--tuanki-text-primary);
    line-height: 1.6;
  }

  .preview-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--tuanki-space-md);
    height: 100%;
    text-align: center;
    color: var(--tuanki-text-secondary);
  }

  .preview-placeholder p {
    margin: 0;
    font-size: 1rem;
  }

  .preview-placeholder small {
    font-size: 0.75rem;
    color: var(--tuanki-text-faint);
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .toolbar-group {
      gap: var(--tuanki-space-xs);
    }

    :global(.toolbar-btn) {
      min-width: 32px;
      min-height: 32px;
    }

    .markdown-textarea {
      padding: var(--tuanki-space-md);
      font-size: 0.8rem;
    }
  }

  /* High Contrast Mode */
  @media (prefers-contrast: high) {
    .tuanki-markdown-editor {
      border-width: 2px;
    }

    .markdown-toolbar {
      border-bottom-width: 2px;
    }

    .toolbar-separator {
      background: var(--tuanki-text-primary);
    }
  }
</style>
