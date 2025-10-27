<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TFile } from 'obsidian';
  import type AnkiPlugin from '../../main';
  import EnhancedButton from './EnhancedButton.svelte';
  import EnhancedIcon from './EnhancedIcon.svelte';

  interface Props {
    plugin: AnkiPlugin;
    multiple?: boolean;
    selectedFiles?: TFile[];
    maxFiles?: number;
  }

  let { plugin, multiple = false, selectedFiles = $bindable([]), maxFiles = 10 }: Props = $props();

  const dispatch = createEventDispatcher<{
    filesSelected: { files: TFile[] };
    fileRemoved: { file: TFile };
  }>();

  let showFileList = $state(false);
  let searchQuery = $state('');
  let filteredFiles = $state<TFile[]>([]);

  // 获取所有Markdown文件
  function getAllMarkdownFiles(): TFile[] {
    return plugin.app.vault.getMarkdownFiles();
  }

  // 过滤文件
  function filterFiles(query: string): TFile[] {
    const allFiles = getAllMarkdownFiles();
    if (!query.trim()) {
      return allFiles.slice(0, 50); // 限制显示数量
    }
    
    return allFiles.filter(file => 
      file.name.toLowerCase().includes(query.toLowerCase()) ||
      file.path.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 50);
  }

  // 搜索文件
  function handleSearch() {
    filteredFiles = filterFiles(searchQuery);
  }

  // 选择文件
  function selectFile(file: TFile) {
    if (!multiple) {
      selectedFiles = [file];
      showFileList = false;
    } else {
      if (selectedFiles.includes(file)) {
        selectedFiles = selectedFiles.filter(f => f !== file);
      } else if (selectedFiles.length < maxFiles) {
        selectedFiles = [...selectedFiles, file];
      }
    }
    
    dispatch('filesSelected', { files: selectedFiles });
  }

  // 移除文件
  function removeFile(file: TFile) {
    selectedFiles = selectedFiles.filter(f => f !== file);
    dispatch('fileRemoved', { file });
    dispatch('filesSelected', { files: selectedFiles });
  }

  // 打开文件选择器
  function openFileSelector() {
    showFileList = true;
    searchQuery = '';
    filteredFiles = filterFiles('');
  }

  // 关闭文件选择器
  function closeFileSelector() {
    showFileList = false;
  }

  // 获取文件大小
  function getFileSize(file: TFile): string {
    const size = file.stat.size;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  // 获取文件修改时间
  function getFileModified(file: TFile): string {
    return new Date(file.stat.mtime).toLocaleDateString();
  }

  // 获取文件目录路径（不包含文件名）
  function getFileDirectory(file: TFile): string {
    const pathParts = file.path.split('/');
    if (pathParts.length <= 1) {
      return '根目录';
    }
    pathParts.pop(); // 移除文件名
    return pathParts.join('/');
  }

  // 响应式搜索
  $effect(() => {
    if (searchQuery !== undefined) {
      handleSearch();
    }
  });
</script>

<div class="file-selector">
  <!-- 选择按钮 -->
  <div class="selector-header">
    <EnhancedButton
      variant="secondary"
      size="sm"
      onclick={openFileSelector}
      class="select-files-btn"
    >
      <EnhancedIcon name="file-text" size={16} />
      {multiple ? '选择文件' : '选择文件'}
      {#if selectedFiles.length > 0}
        ({selectedFiles.length})
      {/if}
    </EnhancedButton>
    
    {#if selectedFiles.length > 0}
      <span class="selected-count">
        已选择 {selectedFiles.length} 个文件
        {#if multiple && maxFiles > 0}
          / {maxFiles}
        {/if}
      </span>
    {/if}
  </div>

  <!-- 已选择的文件列表 -->
  {#if selectedFiles.length > 0}
    <div class="selected-files">
      {#each selectedFiles as file}
        <div class="selected-file">
          <div class="file-info">
            <EnhancedIcon name="file-text" size={14} />
            <span class="file-name">{file.name}</span>
            <span class="file-path">{file.path}</span>
          </div>
          <EnhancedButton
            variant="ghost"
            size="xs"
            onclick={() => removeFile(file)}
            class="remove-btn"
          >
            <EnhancedIcon name="x" size={12} />
          </EnhancedButton>
        </div>
      {/each}
    </div>
  {/if}

  <!-- 文件选择器模态窗 -->
  {#if showFileList}
    <div class="file-list-modal">
      <button class="modal-backdrop" onclick={closeFileSelector} aria-label="关闭文件选择器"></button>
      <div class="modal-content">
        <div class="modal-header">
          <h3>选择Markdown文件</h3>
          <EnhancedButton
            variant="ghost"
            size="sm"
            onclick={closeFileSelector}
          >
            <EnhancedIcon name="x" size={16} />
          </EnhancedButton>
        </div>

        <!-- 搜索框 -->
        <div class="search-box">
          <EnhancedIcon name="search" size={16} />
          <input 
            type="text" 
            placeholder="搜索文件名或路径..."
            bind:value={searchQuery}
            class="search-input"
          />
        </div>

        <!-- 文件列表 - 全新设计 -->
        <div class="tuanki-file-list">
          {#each filteredFiles as file}
            <div
              class="tuanki-file-card"
              class:tuanki-selected={selectedFiles.includes(file)}
              role="button"
              tabindex="0"
              onclick={() => selectFile(file)}
              onkeydown={(e) => e.key === 'Enter' && selectFile(file)}
            >
              <div class="tuanki-file-main">
                <div class="tuanki-file-icon">
                  <EnhancedIcon name="file-text" size={18} />
                </div>
                <div class="tuanki-file-content">
                  <div class="tuanki-file-title">{file.name}</div>
                  <div class="tuanki-file-subtitle">{getFileDirectory(file)} • {getFileSize(file)}</div>
                </div>
                {#if selectedFiles.includes(file)}
                  <div class="tuanki-check-icon">
                    <EnhancedIcon name="check-circle" size={20} />
                  </div>
                {/if}
              </div>
            </div>
          {/each}
          
          {#if filteredFiles.length === 0}
            <div class="no-files">
              <EnhancedIcon name="file-x" size={24} />
              <p>没有找到匹配的文件</p>
            </div>
          {/if}
        </div>

        <div class="modal-footer">
          <EnhancedButton variant="secondary" onclick={closeFileSelector}>
            取消
          </EnhancedButton>
          <EnhancedButton
            variant="primary"
            onclick={closeFileSelector}
            disabled={selectedFiles.length === 0}
          >
            确定 ({selectedFiles.length})
          </EnhancedButton>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .file-selector {
    width: 100%;
  }

  .selector-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .selected-count {
    font-size: 14px;
    color: var(--text-muted);
  }

  .selected-files {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .selected-file {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--background-secondary);
    border-radius: 6px;
    border: 1px solid var(--border-color);
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-weight: 500;
    color: var(--text-normal);
  }

  .file-path {
    font-size: 12px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-list-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2000; /* 确保在现代化模态窗之上 */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .modal-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    border: none;
    padding: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
  }

  .modal-content {
    position: relative;
    width: 100%;
    max-width: 700px;
    max-height: 85vh;
    background: var(--background-primary);
    border-radius: 12px;
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 1; /* 确保模态窗内容的层叠顺序 */
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  .search-input {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  /* 全新文件列表样式 - 使用tuanki前缀避免冲突 */
  .tuanki-file-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    max-height: 50vh;
    min-height: 200px;
    background: transparent;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tuanki-file-card {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
    position: relative;
    outline: none;
  }

  .tuanki-file-card:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .tuanki-file-card.tuanki-selected {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .tuanki-file-card.tuanki-selected:hover {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
  }

  .tuanki-file-main {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }

  .tuanki-file-icon {
    flex-shrink: 0;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }

  .tuanki-file-card.tuanki-selected .tuanki-file-icon {
    color: var(--text-on-accent);
  }

  .tuanki-file-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .tuanki-file-title {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--text-normal);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tuanki-file-card.tuanki-selected .tuanki-file-title {
    color: var(--text-on-accent);
  }

  .tuanki-file-subtitle {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tuanki-file-card.tuanki-selected .tuanki-file-subtitle {
    color: var(--text-on-accent);
    opacity: 0.8;
  }

  .tuanki-check-icon {
    flex-shrink: 0;
    color: var(--text-on-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }

  .no-files {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.5rem;
    color: var(--text-muted);
    text-align: center;
    min-height: 200px;
  }

  .no-files p {
    margin: 0.75rem 0 0 0;
    font-size: 0.875rem;
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  /* 深色主题适配 */
  :global(.theme-dark) .modal-backdrop {
    background: rgba(0, 0, 0, 0.8);
  }

  :global(.theme-dark) .tuanki-file-card {
    background: var(--background-secondary);
    border-color: var(--background-modifier-border-hover);
  }

  :global(.theme-dark) .tuanki-file-card:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  /* 响应式设计 */
  @media (max-width: 640px) {
    .modal-content {
      width: 95%;
      max-height: 90vh;
      margin: 1rem;
    }

    .modal-header,
    .search-box,
    .modal-footer {
      padding: 1rem;
    }

    .tuanki-file-list {
      padding: 0.5rem;
      gap: 0.375rem;
    }

    .tuanki-file-card {
      padding: 0.625rem;
    }

    .tuanki-file-title {
      font-size: 0.8125rem;
    }

    .tuanki-file-subtitle {
      font-size: 0.6875rem;
    }
  }
</style>
