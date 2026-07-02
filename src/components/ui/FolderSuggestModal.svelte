<!--
  FolderSuggestModal - 文件夹选择模态窗
  
  用于选择Obsidian vault中的文件夹
  支持创建新文件夹
  
  @module components/ui/FolderSuggestModal
  @version 1.0.0
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { TFolder } from 'obsidian';
  import type WeavePlugin from '../../main';
  import { logger } from '../../utils/logger';
  import ObsidianIcon from './ObsidianIcon.svelte';

  interface Props {
    plugin: WeavePlugin;
    currentFolder: string;
    onSelect: (folderPath: string) => void;
    onClose: () => void;
  }

  let { plugin, currentFolder, onSelect, onClose }: Props = $props();

  // 状态
  let searchQuery = $state('');
  let folders = $state<string[]>([]);
  let showContent = $state(false);
  let newFolderName = $state('');
  let showNewFolderInput = $state(false);

  // 过滤后的文件夹列表
  let filteredFolders = $derived.by(() => {
    if (!searchQuery.trim()) {
      return folders;
    }
    const query = searchQuery.toLowerCase();
    return folders.filter(f => f.toLowerCase().includes(query));
  });

  // 构建文件夹列表
  function buildFolderList(): string[] {
    const result: string[] = [];
    
    function traverse(folder: TFolder, depth: number = 0) {
      // 添加当前文件夹（除根目录外）
      if (folder.path) {
        result.push(folder.path);
      }
      
      // 递归处理子文件夹
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          traverse(child, depth + 1);
        }
      }
    }
    
    const root = plugin.app.vault.getRoot();
    traverse(root);
    
    // 排序
    result.sort((a, b) => a.localeCompare(b, 'zh-CN'));
    
    return result;
  }

  // 选择文件夹
  function selectFolder(folderPath: string) {
    onSelect(folderPath);
  }

  // 创建新文件夹
  async function createNewFolder() {
    if (!newFolderName.trim()) return;
    
    try {
      const folderPath = newFolderName.trim();
      await plugin.app.vault.createFolder(folderPath);
      
      // 刷新列表并选择新文件夹
      folders = buildFolderList();
      onSelect(folderPath);
    } catch (error) {
      logger.error('创建文件夹失败:', error);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && showNewFolderInput && newFolderName.trim()) {
      e.preventDefault();
      createNewFolder();
    }
  }

  onMount(() => {
    folders = buildFolderList();
    
    window.setTimeout(() => {
      showContent = true;
    }, 50);
    
    activeDocument.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    activeDocument.removeEventListener('keydown', handleKeydown);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="folder-modal-overlay"
  onclick={(event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }}
>
  <div 
    class="folder-modal-container"
    class:show={showContent}
  >
    <!-- 头部 -->
    <div class="folder-modal-header">
      <h3 class="folder-modal-title">选择文件夹</h3>
      <button class="folder-modal-close" onclick={onClose} type="button">
        <ObsidianIcon name="x" size={18} />
      </button>
    </div>

    <!-- 搜索栏 -->
    <div class="folder-modal-search">
      <ObsidianIcon name="search" size={16} />
      <input
        type="text"
        placeholder="搜索文件夹..."
        bind:value={searchQuery}
        class="folder-search-input"
      />
    </div>

    <!-- 当前选择 -->
    <div class="folder-current">
      <span class="folder-current-label">当前:</span>
      <span class="folder-current-path">{currentFolder}</span>
    </div>

    <!-- 文件夹列表 -->
    <div class="folder-list">
      {#each filteredFolders as folder}
        <button
          class="folder-item"
          class:selected={folder === currentFolder}
          onclick={() => selectFolder(folder)}
          type="button"
        >
          <ObsidianIcon name="folder" size={16} />
          <span class="folder-name">{folder}</span>
          {#if folder === currentFolder}
            <ObsidianIcon name="check" size={14} />
          {/if}
        </button>
      {/each}
      
      {#if filteredFolders.length === 0}
        <div class="folder-empty">
          未找到匹配的文件夹
        </div>
      {/if}
    </div>

    <!-- 新建文件夹 -->
    <div class="folder-new-section">
      {#if showNewFolderInput}
        <div class="folder-new-input-group">
          <input
            type="text"
            placeholder="输入新文件夹路径..."
            bind:value={newFolderName}
            class="folder-new-input"
          />
          <button 
            class="folder-new-confirm"
            onclick={createNewFolder}
            disabled={!newFolderName.trim()}
            type="button"
          >
            创建
          </button>
          <button 
            class="folder-new-cancel"
            onclick={() => { showNewFolderInput = false; newFolderName = ''; }}
            type="button"
          >
            取消
          </button>
        </div>
      {:else}
        <button 
          class="folder-new-btn"
          onclick={() => showNewFolderInput = true}
          type="button"
        >
          <ObsidianIcon name="folder-plus" size={16} />
          新建文件夹
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .folder-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--layer-modal);
  }

  .folder-modal-container {
    background: var(--background-primary);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-l);
    width: 480px;
    max-width: 90vw;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    opacity: 0;
    transform: scale(0.95);
    transition: all 0.2s ease;
  }

  .folder-modal-container.show {
    opacity: 1;
    transform: scale(1);
  }

  .folder-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .folder-modal-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .folder-modal-close {
    background: transparent;
    border: none;
    padding: 0.25rem;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: var(--radius-s);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .folder-modal-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .folder-modal-search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
  }

  .folder-search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-size: 0.95rem;
    color: var(--text-normal);
  }

  .folder-search-input::placeholder {
    color: var(--text-muted);
  }

  .folder-current {
    padding: 0.5rem 1.25rem;
    background: var(--background-secondary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }

  .folder-current-label {
    color: var(--text-muted);
  }

  .folder-current-path {
    color: var(--text-accent);
    font-family: var(--font-monospace);
  }

  .folder-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    max-height: 300px;
  }

  .folder-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-s);
    background: transparent;
    border: none;
    cursor: pointer;
    width: 100%;
    text-align: left;
    color: var(--text-normal);
    font-size: 0.9rem;
    transition: background 0.1s ease;
  }

  .folder-item:hover {
    background: var(--background-modifier-hover);
  }

  .folder-item.selected {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .folder-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folder-empty {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .folder-new-section {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--background-modifier-border);
  }

  .folder-new-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--background-secondary);
    border: 1px dashed var(--background-modifier-border);
    border-radius: var(--radius-s);
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.9rem;
    width: 100%;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .folder-new-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border-color: var(--text-muted);
  }

  .folder-new-input-group {
    display: flex;
    gap: 0.5rem;
  }

  .folder-new-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9rem;
  }

  .folder-new-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .folder-new-confirm {
    padding: 0.5rem 0.75rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: var(--radius-s);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .folder-new-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .folder-new-cancel {
    padding: 0.5rem 0.75rem;
    background: var(--background-secondary);
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .folder-new-cancel:hover {
    background: var(--background-modifier-hover);
  }
</style>
