<script lang="ts">
  import type { ObsidianFileInfo } from '../../types/ai-types';
  import { formatFileSize } from '../../utils/file-utils';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';

  interface Props {
    content: string;
    selectedFile: ObsidianFileInfo | null;
    onClear: () => void;
    onReload: () => void;
  }

  let { content = $bindable(), selectedFile, onClear, onReload }: Props = $props();

  // 计算字符数
  let charCount = $derived(content.length);
  let lineCount = $derived(content.split('\n').length);
</script>

<div class="content-editor-container">
  {#if selectedFile}
    <!-- 文件信息栏 -->
    <div class="file-info-bar">
      <div class="file-meta">
        <ObsidianIcon name="file-text" size={14} />
        <span class="file-name">{selectedFile.name}</span>
        <span class="file-stats">
          {formatFileSize(selectedFile.size)} · {charCount} 字符 · {lineCount} 行
        </span>
      </div>
      <div class="editor-actions">
        <button 
          class="action-btn" 
          onclick={onReload}
          title="重新加载文件"
        >
          <ObsidianIcon name="refresh-cw" size={14} />
        </button>
        <button 
          class="action-btn" 
          onclick={onClear}
          title="清空内容"
        >
          <ObsidianIcon name="trash-2" size={14} />
        </button>
      </div>
    </div>
  {/if}

  <!-- 文本编辑器 -->
  <textarea
    class="content-editor"
    bind:value={content}
    placeholder={selectedFile 
      ? "在此编辑内容，AI将基于此内容生成卡片..." 
      : "请先选择文件，或直接在此输入内容..."}
  ></textarea>
</div>

<style>
  .content-editor-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .file-info-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .file-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-size: 0.9em;
    font-weight: 500;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-stats {
    font-size: 0.75em;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .editor-actions {
    display: flex;
    gap: 4px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .content-editor {
    flex: 1;
    padding: 16px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-family: var(--font-monospace);
    font-size: 0.9em;
    line-height: 1.6;
    resize: none;
    outline: none;
    overflow-y: auto;  /* textarea 自己滚动 */
    min-height: 60vh;  /* 修复：使用视口高度确保占据足够空间 */
  }

  .content-editor::placeholder {
    color: var(--text-muted);
  }

  .content-editor:focus {
    outline: none;
  }
</style>

